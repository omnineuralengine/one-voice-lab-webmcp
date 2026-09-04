-- Bound durable product telemetry, feedback, and quota-counter storage while
-- preserving useful low-cardinality evidence and the existing Stage 2 access
-- controls. This migration is forward-only and intentionally does not enable
-- any live provider capability.

create table private.viewer_event_daily_aggregates (
  event_day date not null,
  event_name text not null check (
    event_name in ('page_view', 'provider_profile_open', 'provider_module_open')
  ),
  surface text not null check (
    surface in ('home', 'providers', 'provider', 'simulate', 'build', 'learn', 'settings', 'other')
  ),
  provider_id text not null default '' check (
    provider_id in ('', 'deepgram', 'fish-audio', 'elevenlabs')
  ),
  event_count bigint not null check (event_count between 1 and 9000000000000000),
  updated_at timestamptz not null default now(),
  primary key (event_day, event_name, surface, provider_id)
);

comment on table private.viewer_event_daily_aggregates is
  'Owner-only, low-cardinality daily viewer-event totals. Contains no user, IP, device, request, prompt, transcript, audio, or credential data.';

alter table private.viewer_event_daily_aggregates enable row level security;
alter table private.viewer_event_daily_aggregates owner to postgres;
revoke all on table private.viewer_event_daily_aggregates from public, anon, authenticated;

create index if not exists viewer_events_retention_idx
  on public.viewer_events (occurred_at, id);

create index if not exists feedback_entries_retention_idx
  on public.feedback_entries (created_at, id);

-- One canonical maintenance function owns all Stage 2 lifecycle cleanup. Each
-- statement handles at most 5,000 rows and each path handles at most four
-- statements per hourly run. At the supported ingestion ceilings this drains
-- new expired data faster than it can be admitted while keeping lock duration
-- bounded. A try-lock prevents overlapping cron/manual runs.
create or replace function private.prune_lab_access_history()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_utc_date date := (pg_catalog.timezone('UTC', v_now))::date;
  v_batch_size constant integer := 5000;
  v_max_batches constant integer := 4;
  v_batch_number integer;
  v_batch_rows integer := 0;
  v_viewer_rows integer := 0;
  v_viewer_aggregate_rows integer := 0;
  v_feedback_rows integer := 0;
  v_usage_counter_rows integer := 0;
  v_member_counter_rows integer := 0;
  v_guest_counter_rows integer := 0;
  v_global_counter_rows integer := 0;
  v_detail_rows integer := 0;
  v_rollup_rows integer := 0;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('one-lab-data-maintenance', 0)
  ) then
    return pg_catalog.jsonb_build_object(
      'skipped', true,
      'reason', 'maintenance_already_running'
    );
  end if;

  for v_batch_number in 1..v_max_batches loop
    with stale as materialized (
      select
        event.id,
        event.event_name,
        event.surface,
        coalesce(event.provider_id, '') as provider_id,
        (pg_catalog.timezone('UTC', event.occurred_at))::date as event_day
      from public.viewer_events event
      where event.occurred_at < v_now - interval '30 days'
      order by event.occurred_at, event.id
      limit v_batch_size
      for update skip locked
    ), aggregated as (
      insert into private.viewer_event_daily_aggregates (
        event_day,
        event_name,
        surface,
        provider_id,
        event_count,
        updated_at
      )
      select
        stale.event_day,
        stale.event_name,
        stale.surface,
        stale.provider_id,
        pg_catalog.count(*)::bigint,
        v_now
      from stale
      group by stale.event_day, stale.event_name, stale.surface, stale.provider_id
      on conflict (event_day, event_name, surface, provider_id)
      do update set
        event_count = least(
          9000000000000000,
          private.viewer_event_daily_aggregates.event_count + excluded.event_count
        ),
        updated_at = excluded.updated_at
      returning 1
    )
    delete from public.viewer_events event
    using stale
    where event.id = stale.id
      and exists (select 1 from aggregated);

    get diagnostics v_batch_rows = row_count;
    v_viewer_rows := v_viewer_rows + v_batch_rows;
    exit when v_batch_rows < v_batch_size;
  end loop;

  for v_batch_number in 1..v_max_batches loop
    with stale as materialized (
      select aggregate.event_day, aggregate.event_name, aggregate.surface, aggregate.provider_id
      from private.viewer_event_daily_aggregates aggregate
      where aggregate.event_day < v_utc_date - 400
      order by aggregate.event_day, aggregate.event_name, aggregate.surface, aggregate.provider_id
      limit v_batch_size
      for update skip locked
    )
    delete from private.viewer_event_daily_aggregates aggregate
    using stale
    where aggregate.event_day = stale.event_day
      and aggregate.event_name = stale.event_name
      and aggregate.surface = stale.surface
      and aggregate.provider_id = stale.provider_id;

    get diagnostics v_batch_rows = row_count;
    v_viewer_aggregate_rows := v_viewer_aggregate_rows + v_batch_rows;
    exit when v_batch_rows < v_batch_size;
  end loop;

  for v_batch_number in 1..v_max_batches loop
    with stale as materialized (
      select feedback.id
      from public.feedback_entries feedback
      where feedback.created_at < v_now - interval '365 days'
      order by feedback.created_at, feedback.id
      limit v_batch_size
      for update skip locked
    )
    delete from public.feedback_entries feedback
    using stale
    where feedback.id = stale.id;

    get diagnostics v_batch_rows = row_count;
    v_feedback_rows := v_feedback_rows + v_batch_rows;
    exit when v_batch_rows < v_batch_size;
  end loop;

  for v_batch_number in 1..v_max_batches loop
    with stale as materialized (
      select counter.ctid as row_id
      from private.lab_usage_counters counter
      where counter.window_start < v_now - interval '120 days'
      order by counter.window_start
      limit v_batch_size
      for update skip locked
    )
    delete from private.lab_usage_counters counter
    using stale
    where counter.ctid = stale.row_id;

    get diagnostics v_batch_rows = row_count;
    v_usage_counter_rows := v_usage_counter_rows + v_batch_rows;
    exit when v_batch_rows < v_batch_size;
  end loop;

  for v_batch_number in 1..v_max_batches loop
    with stale as materialized (
      select counter.ctid as row_id
      from private.member_usage_daily counter
      where counter.usage_date < v_utc_date - 120
      order by counter.usage_date
      limit v_batch_size
      for update skip locked
    )
    delete from private.member_usage_daily counter
    using stale
    where counter.ctid = stale.row_id;

    get diagnostics v_batch_rows = row_count;
    v_member_counter_rows := v_member_counter_rows + v_batch_rows;
    exit when v_batch_rows < v_batch_size;
  end loop;

  for v_batch_number in 1..v_max_batches loop
    with stale as materialized (
      select counter.ctid as row_id
      from private.guest_usage_daily counter
      where counter.usage_date < v_utc_date - 120
      order by counter.usage_date
      limit v_batch_size
      for update skip locked
    )
    delete from private.guest_usage_daily counter
    using stale
    where counter.ctid = stale.row_id;

    get diagnostics v_batch_rows = row_count;
    v_guest_counter_rows := v_guest_counter_rows + v_batch_rows;
    exit when v_batch_rows < v_batch_size;
  end loop;

  for v_batch_number in 1..v_max_batches loop
    with stale as materialized (
      select counter.ctid as row_id
      from private.lab_global_usage_daily counter
      where counter.usage_date < v_utc_date - 120
      order by counter.usage_date
      limit v_batch_size
      for update skip locked
    )
    delete from private.lab_global_usage_daily counter
    using stale
    where counter.ctid = stale.row_id;

    get diagnostics v_batch_rows = row_count;
    v_global_counter_rows := v_global_counter_rows + v_batch_rows;
    exit when v_batch_rows < v_batch_size;
  end loop;

  for v_batch_number in 1..v_max_batches loop
    with stale as materialized (
      select audit.ctid as row_id
      from private.lab_access_audit audit
      where audit.created_at < v_now - interval '35 days'
      order by audit.created_at, audit.id
      limit v_batch_size
      for update skip locked
    )
    delete from private.lab_access_audit audit
    using stale
    where audit.ctid = stale.row_id;

    get diagnostics v_batch_rows = row_count;
    v_detail_rows := v_detail_rows + v_batch_rows;
    exit when v_batch_rows < v_batch_size;
  end loop;

  for v_batch_number in 1..v_max_batches loop
    with stale as materialized (
      select rollup.ctid as row_id
      from private.lab_access_denial_rollups rollup
      where rollup.bucket_start < v_now - interval '90 days'
      order by rollup.bucket_start
      limit v_batch_size
      for update skip locked
    )
    delete from private.lab_access_denial_rollups rollup
    using stale
    where rollup.ctid = stale.row_id;

    get diagnostics v_batch_rows = row_count;
    v_rollup_rows := v_rollup_rows + v_batch_rows;
    exit when v_batch_rows < v_batch_size;
  end loop;

  return pg_catalog.jsonb_build_object(
    'skipped', false,
    'ranAt', v_now,
    'batchSize', v_batch_size,
    'maxBatchesPerPath', v_max_batches,
    'viewerRowsAggregatedAndDeleted', v_viewer_rows,
    'viewerAggregateRowsDeleted', v_viewer_aggregate_rows,
    'feedbackRowsDeleted', v_feedback_rows,
    'usageCounterRowsDeleted', v_usage_counter_rows,
    'legacyMemberCounterRowsDeleted', v_member_counter_rows,
    'legacyGuestCounterRowsDeleted', v_guest_counter_rows,
    'legacyGlobalCounterRowsDeleted', v_global_counter_rows,
    'auditDetailRowsDeleted', v_detail_rows,
    'denialRollupRowsDeleted', v_rollup_rows
  );
end;
$$;

alter function private.prune_lab_access_history() owner to postgres;
revoke all on function private.prune_lab_access_history() from public, anon, authenticated;

comment on function private.prune_lab_access_history() is
  'Owner-only hourly retention worker: raw viewer events 30d, viewer daily aggregates 400d, feedback 365d, usage counters 120d, access detail 35d, denial rollups 90d.';

-- Serialize the rolling-hour global invariant first and the authenticated-user
-- invariant second. Static keys are required because an hour-derived lock can
-- race at a rolling-window boundary. Counts and insertion share the transaction.
create or replace function public.submit_feedback(
  p_sentiment text,
  p_message text,
  p_input_method text,
  p_surface text,
  p_provider_id text,
  p_guard_token text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid;
  v_message text := nullif(pg_catalog.btrim(p_message), '');
  v_now timestamptz;
begin
  perform private.assert_lab_guard(p_guard_token);
  if p_sentiment not in ('yay', 'nay') then
    raise exception 'Invalid feedback sentiment.' using errcode = '22023';
  end if;
  if p_input_method not in ('tap', 'typed', 'dictated') then
    raise exception 'Invalid feedback input method.' using errcode = '22023';
  end if;
  if p_surface not in ('home', 'providers', 'provider', 'simulate', 'build', 'learn', 'settings', 'studio', 'bench', 'other') then
    raise exception 'Invalid feedback surface.' using errcode = '22023';
  end if;
  if p_provider_id is not null and p_provider_id not in ('deepgram', 'fish-audio', 'elevenlabs', 'multi-provider') then
    raise exception 'Invalid feedback provider.' using errcode = '22023';
  end if;
  if v_message is not null and pg_catalog.char_length(v_message) > 2000 then
    raise exception 'Feedback message is too long.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('one-feedback-admission:0-global', 0)
  );
  if v_user_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('one-feedback-admission:1-user:' || v_user_id::text, 0)
    );
  end if;

  v_now := pg_catalog.clock_timestamp();
  if (
    select pg_catalog.count(*)
    from public.feedback_entries feedback
    where feedback.created_at >= v_now - interval '1 hour'
  ) >= 300 then
    raise exception using errcode = 'P0001', message = 'feedback_global_limit';
  end if;
  if v_user_id is not null and (
    select pg_catalog.count(*)
    from public.feedback_entries feedback
    where feedback.user_id = v_user_id
      and feedback.created_at >= v_now - interval '1 hour'
  ) >= 20 then
    raise exception using errcode = 'P0001', message = 'feedback_user_limit';
  end if;

  insert into public.feedback_entries (
    user_id,
    sentiment,
    message,
    input_method,
    surface,
    provider_id,
    created_at
  ) values (
    v_user_id,
    p_sentiment,
    v_message,
    p_input_method,
    p_surface,
    p_provider_id,
    v_now
  )
  returning id into v_id;
  return v_id;
end;
$$;

alter function public.submit_feedback(text, text, text, text, text, text) owner to postgres;
revoke all on function public.submit_feedback(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_feedback(text, text, text, text, text, text) to anon, authenticated;

comment on function public.submit_feedback(text, text, text, text, text, text) is
  'Guarded feedback admission with transactionally serialized rolling-hour global and authenticated-user limits.';

-- Make the durable viewer-event ceiling exact as well. Without serialization,
-- a large concurrent burst could exceed the count-then-insert limit and outrun
-- bounded cleanup. Input validation stays outside the lock; count and insert
-- share one short transaction after the global lock is acquired.
create or replace function public.record_viewer_event(
  p_event_name text,
  p_surface text,
  p_provider_id text,
  p_guard_token text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
  v_now timestamptz;
begin
  perform private.assert_lab_guard(p_guard_token);
  if p_event_name not in ('page_view', 'provider_profile_open', 'provider_module_open') then
    raise exception 'Invalid viewer event.' using errcode = '22023';
  end if;
  if p_surface not in ('home', 'providers', 'provider', 'simulate', 'build', 'learn', 'settings', 'other') then
    raise exception 'Invalid analytics surface.' using errcode = '22023';
  end if;
  if p_provider_id is not null and p_provider_id not in ('deepgram', 'fish-audio', 'elevenlabs') then
    raise exception 'Invalid analytics provider.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('one-viewer-event-admission:global', 0)
  );
  v_now := pg_catalog.clock_timestamp();
  if (
    select pg_catalog.count(*)
    from public.viewer_events event
    where event.occurred_at >= v_now - interval '1 hour'
  ) >= 10000 then
    raise exception 'Viewer analytics is temporarily at capacity.' using errcode = 'P0001';
  end if;

  insert into public.viewer_events (event_name, surface, provider_id, occurred_at)
  values (p_event_name, p_surface, p_provider_id, v_now)
  returning id into v_id;
  return v_id;
end;
$$;

alter function public.record_viewer_event(text, text, text, text) owner to postgres;
revoke all on function public.record_viewer_event(text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_viewer_event(text, text, text, text) to anon, authenticated;

comment on function public.record_viewer_event(text, text, text, text) is
  'Guarded low-cardinality analytics admission with an exact serialized rolling-hour global ceiling.';

-- Reusing the exact existing job name updates its command/schedule instead of
-- creating a second cleanup schedule. The unrelated Architecture Studio expiry
-- job remains unchanged.
select cron.schedule(
  'one-lab-access-history-retention',
  '23 * * * *',
  $$ select private.prune_lab_access_history() $$
);
