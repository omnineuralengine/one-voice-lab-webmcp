-- Progressive trust and access for ONE Voice Lab.
-- Forward-only: do not edit the previously applied usage, feedback, analytics,
-- identity, or Architecture Studio migrations.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.lab_trust_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'verified' check (
    tier in ('verified', 'trusted_builder', 'partner_researcher', 'admin')
  ),
  status text not null default 'active' check (status in ('active', 'suspended')),
  actor_kind text not null default 'human' check (actor_kind in ('human', 'developer', 'agent')),
  risk_score integer not null default 0 check (risk_score between 0 and 100),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tier <> 'admin' or actor_kind <> 'agent')
);

create table private.lab_access_policies (
  tier text not null check (
    tier in ('guest', 'verified', 'trusted_builder', 'partner_researcher', 'admin')
  ),
  operation text not null check (
    operation in (
      'provider_catalog', 'speech_generation', 'speech_transcription',
      'realtime_session', 'ai_reasoning', 'deliverable_generation',
      'feedback_submission', 'session_creation'
    )
  ),
  provider_id text not null default '*' check (
    provider_id = '*' or provider_id ~ '^[a-z0-9][a-z0-9._-]{0,79}$'
  ),
  endpoint_id text not null default '*' check (
    endpoint_id = '*' or endpoint_id ~ '^[a-z0-9][a-z0-9._:/-]{0,79}$'
  ),
  enabled boolean not null default true,
  burst_window_seconds integer not null default 60 check (burst_window_seconds between 10 and 3600),
  burst_requests integer not null check (burst_requests between 1 and 10000),
  session_daily_units bigint not null check (session_daily_units between 0 and 1000000000),
  client_daily_units bigint not null check (client_daily_units between 0 and 1000000000),
  user_daily_units bigint not null check (user_daily_units between 0 and 1000000000),
  user_monthly_units bigint not null check (user_monthly_units between 0 and 10000000000),
  global_daily_units bigint not null check (global_daily_units between 1 and 100000000000),
  global_monthly_units bigint not null check (global_monthly_units between 1 and 1000000000000),
  concurrency_limit integer not null default 1 check (concurrency_limit between 1 and 1000),
  max_request_units integer not null default 10000 check (max_request_units between 1 and 10000),
  challenge_risk_score integer not null default 101 check (challenge_risk_score between 0 and 101),
  updated_at timestamptz not null default now(),
  primary key (tier, operation, provider_id, endpoint_id)
);

create table private.lab_provider_budgets (
  provider_id text not null check (provider_id ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  operation text not null check (
    operation in ('speech_generation', 'speech_transcription', 'realtime_session', 'ai_reasoning')
  ),
  enabled boolean not null default false,
  daily_units bigint not null check (daily_units between 1 and 100000000000),
  monthly_units bigint not null check (monthly_units between 1 and 1000000000000),
  concurrency_limit integer not null default 1 check (concurrency_limit between 1 and 1000),
  updated_at timestamptz not null default now(),
  primary key (provider_id, operation)
);

create table private.lab_usage_counters (
  scope_kind text not null check (
    scope_kind in (
      'burst', 'session_day', 'client_day', 'user_day', 'user_month',
      'global_day', 'global_month', 'provider_day', 'provider_month'
    )
  ),
  scope_id text not null check (char_length(scope_id) between 1 and 128),
  operation text not null check (char_length(operation) between 1 and 64),
  provider_id text not null default '',
  endpoint_id text not null default '',
  window_start timestamptz not null,
  used_units bigint not null default 0 check (used_units between 0 and 9000000000000000),
  updated_at timestamptz not null default now(),
  primary key (scope_kind, scope_id, operation, provider_id, endpoint_id, window_start)
);

create table private.lab_concurrency_leases (
  lease_id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  client_hash text not null check (client_hash ~ '^[0-9a-f]{64}$'),
  session_hash text not null check (session_hash ~ '^[0-9a-f]{64}$'),
  operation text not null check (char_length(operation) between 1 and 64),
  provider_id text not null default '',
  endpoint_id text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null check (expires_at > created_at)
);

create table private.lab_access_audit (
  id bigint generated always as identity primary key,
  request_id uuid not null default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  tier text not null,
  actor_kind text not null,
  declared_actor_intent text not null,
  client_hash text not null check (client_hash ~ '^[0-9a-f]{64}$'),
  session_hash text not null check (session_hash ~ '^[0-9a-f]{64}$'),
  operation text not null,
  provider_id text,
  endpoint_id text,
  requested_units integer not null check (requested_units between 0 and 10000),
  allowed boolean not null,
  reason text not null,
  risk_score integer not null check (risk_score between 0 and 100),
  challenge_required boolean not null default false,
  created_at timestamptz not null default now()
);

create table private.lab_access_denial_rollups (
  bucket_start timestamptz not null,
  operation text not null check (char_length(operation) between 1 and 64),
  provider_id text not null default '',
  tier text not null check (
    tier in ('guest', 'verified', 'trusted_builder', 'partner_researcher', 'admin')
  ),
  actor_kind text not null check (actor_kind in ('unknown', 'human', 'developer', 'agent')),
  reason text not null check (char_length(reason) between 1 and 64),
  client_bucket smallint not null check (client_bucket between 0 and 255),
  occurrence_count bigint not null default 1 check (occurrence_count between 1 and 9000000000000000),
  maximum_requested_units integer not null check (maximum_requested_units between 0 and 10000),
  maximum_risk_score integer not null check (maximum_risk_score between 0 and 100),
  challenge_count bigint not null default 0 check (challenge_count between 0 and 9000000000000000),
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  primary key (bucket_start, operation, provider_id, tier, actor_kind, reason, client_bucket)
);

create index lab_trust_profiles_tier_status_idx
  on private.lab_trust_profiles(tier, status);
create index lab_usage_counters_window_idx
  on private.lab_usage_counters(window_start, operation);
create index lab_concurrency_active_idx
  on private.lab_concurrency_leases(provider_id, operation, expires_at);
create index lab_concurrency_subject_idx
  on private.lab_concurrency_leases(user_id, client_hash, operation, expires_at);
create index lab_access_audit_time_idx
  on private.lab_access_audit(created_at desc);
create index lab_access_audit_client_time_idx
  on private.lab_access_audit(client_hash, created_at desc);
create index lab_access_audit_user_time_idx
  on private.lab_access_audit(user_id, created_at desc) where user_id is not null;
create index lab_access_audit_denial_time_idx
  on private.lab_access_audit(reason, created_at desc) where not allowed;
create index lab_access_audit_denial_sample_idx
  on private.lab_access_audit(client_hash, operation, reason, created_at desc) where not allowed;
create index lab_access_denial_rollups_time_idx
  on private.lab_access_denial_rollups(bucket_start desc, reason);

alter table private.lab_trust_profiles enable row level security;
alter table private.lab_access_policies enable row level security;
alter table private.lab_provider_budgets enable row level security;
alter table private.lab_usage_counters enable row level security;
alter table private.lab_concurrency_leases enable row level security;
alter table private.lab_access_audit enable row level security;
alter table private.lab_access_denial_rollups enable row level security;

revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all sequences in schema private from public, anon, authenticated;

with operation_defaults as (
  select * from (values
    ('provider_catalog',       60,  60::bigint,   60::bigint,    5000::bigint,    100000::bigint,  10000,  4),
    ('speech_generation',       6,  1200::bigint, 1200::bigint,  250000::bigint,  5000000::bigint, 2000,   1),
    -- Speech-transcription units are trusted server-measured audio seconds.
    ('speech_transcription',    4,  60::bigint,   60::bigint,    36000::bigint,   1080000::bigint, 300,    1),
    ('realtime_session',        3,  600::bigint,  600::bigint,   7200::bigint,    150000::bigint,  600,    1),
    ('ai_reasoning',            5,  2000::bigint, 2000::bigint,  100000::bigint,  2000000::bigint, 10000,  1),
    ('deliverable_generation',  3,  1::bigint,    1::bigint,     100::bigint,     2000::bigint,    1,      1),
    ('feedback_submission',     8,  8::bigint,    8::bigint,     1000::bigint,    20000::bigint,   1,      1),
    ('session_creation',        4,  4::bigint,    4::bigint,     1000::bigint,    20000::bigint,   1,      1)
  ) as value(operation, burst_requests, guest_daily, guest_client_daily, global_daily, global_monthly, max_request_units, base_concurrency)
),
tier_defaults as (
  select * from (values
    ('guest',               1::bigint,   1),
    ('verified',           10::bigint,   2),
    ('trusted_builder',    50::bigint,   4),
    ('partner_researcher',200::bigint,  10),
    ('admin',             200::bigint,  10)
  ) as value(tier, multiplier, concurrency_multiplier)
)
insert into private.lab_access_policies (
  tier, operation, provider_id, endpoint_id, burst_requests,
  session_daily_units, client_daily_units, user_daily_units, user_monthly_units,
  global_daily_units, global_monthly_units, concurrency_limit,
  max_request_units, challenge_risk_score
)
select
  tier.tier,
  operation.operation,
  '*',
  '*',
  greatest(1, least(10000, operation.burst_requests * tier.concurrency_multiplier)),
  case when tier.tier = 'guest' then operation.guest_daily else operation.guest_daily * tier.multiplier end,
  case when tier.tier = 'guest' then operation.guest_client_daily else operation.guest_client_daily * greatest(2, tier.multiplier / 2) end,
  case when tier.tier = 'guest' then 0 else operation.guest_daily * tier.multiplier end,
  case when tier.tier = 'guest' then 0 else operation.guest_daily * tier.multiplier * 20 end,
  operation.global_daily,
  operation.global_monthly,
  greatest(1, operation.base_concurrency * tier.concurrency_multiplier),
  operation.max_request_units,
  101
from operation_defaults operation
cross join tier_defaults tier
on conflict (tier, operation, provider_id, endpoint_id) do nothing;

insert into private.lab_provider_budgets (
  provider_id, operation, enabled, daily_units, monthly_units, concurrency_limit
)
values
  -- Fail closed on first deployment. An operator must review the unit ceilings
  -- and deliberately enable only the providers intended for live use.
  ('deepgram', 'speech_generation', false, 250000, 5000000, 8),
  ('deepgram', 'speech_transcription', false, 18000, 360000, 6),
  ('deepgram', 'realtime_session', false, 7200, 150000, 4),
  ('deepgram', 'ai_reasoning', false, 100000, 2000000, 4),
  ('elevenlabs', 'speech_generation', false, 100000, 2000000, 4),
  ('elevenlabs', 'speech_transcription', false, 9000, 180000, 3),
  ('fish-audio', 'speech_generation', false, 100000, 2000000, 4),
  ('fish-audio', 'speech_transcription', false, 9000, 180000, 3),
  ('cartesia', 'speech_generation', false, 100000, 2000000, 4),
  ('vercel-ai-gateway', 'ai_reasoning', false, 100000, 2000000, 4)
on conflict (provider_id, operation) do nothing;

create or replace function private.assert_lab_guard(p_guard_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected_digest text;
begin
  select token_sha256 into v_expected_digest
  from private.lab_runtime_config
  where config_key = 'usage_guard';

  if p_guard_token is null
     or char_length(p_guard_token) not between 32 and 256
     or v_expected_digest is null
     or encode(extensions.digest(p_guard_token, 'sha256'), 'hex') <> v_expected_digest then
    raise exception 'Invalid Lab server guard.' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.lab_tier_rank(p_tier text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_tier
    when 'guest' then 0
    when 'verified' then 1
    when 'trusted_builder' then 2
    when 'partner_researcher' then 3
    when 'admin' then 4
    else -1
  end
$$;

create or replace function private.lab_counter_value(
  p_scope_kind text,
  p_scope_id text,
  p_operation text,
  p_provider_id text,
  p_endpoint_id text,
  p_window_start timestamptz
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select used_units
    from private.lab_usage_counters
    where scope_kind = p_scope_kind
      and scope_id = p_scope_id
      and operation = p_operation
      and provider_id = coalesce(p_provider_id, '')
      and endpoint_id = coalesce(p_endpoint_id, '')
      and window_start = p_window_start
  ), 0)::bigint
$$;

create or replace function private.increment_lab_counter(
  p_scope_kind text,
  p_scope_id text,
  p_operation text,
  p_provider_id text,
  p_endpoint_id text,
  p_window_start timestamptz,
  p_units bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used bigint;
begin
  insert into private.lab_usage_counters (
    scope_kind, scope_id, operation, provider_id, endpoint_id,
    window_start, used_units, updated_at
  ) values (
    p_scope_kind, p_scope_id, p_operation, coalesce(p_provider_id, ''),
    coalesce(p_endpoint_id, ''), p_window_start, p_units, now()
  )
  on conflict (scope_kind, scope_id, operation, provider_id, endpoint_id, window_start)
  do update set
    used_units = least(9000000000000000, private.lab_usage_counters.used_units + excluded.used_units),
    updated_at = now()
  returning used_units into v_used;
  return v_used;
end;
$$;

create or replace function private.record_lab_access_audit(
  p_user_id uuid,
  p_tier text,
  p_actor_kind text,
  p_declared_actor_intent text,
  p_client_hash text,
  p_session_hash text,
  p_operation text,
  p_provider_id text,
  p_endpoint_id text,
  p_requested_units integer,
  p_allowed boolean,
  p_reason text,
  p_risk_score integer,
  p_challenge_required boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_bucket_start timestamptz := to_timestamp(floor(extract(epoch from v_now) / 900) * 900);
  v_hour_epoch bigint := floor(extract(epoch from v_now) / 3600)::bigint;
  v_hour_start timestamptz := to_timestamp(v_hour_epoch * 3600);
  v_denial_detail_count integer := 0;
  v_client_bucket smallint := (('x' || left(p_client_hash, 2))::bit(8)::integer)::smallint;
begin
  if p_allowed then
    insert into private.lab_access_audit (
      user_id, tier, actor_kind, declared_actor_intent, client_hash,
      session_hash, operation, provider_id, endpoint_id, requested_units,
      allowed, reason, risk_score, challenge_required, created_at
    ) values (
      p_user_id, p_tier, p_actor_kind, p_declared_actor_intent,
      p_client_hash, p_session_hash, p_operation, nullif(p_provider_id, ''),
      nullif(p_endpoint_id, ''), p_requested_units, true, p_reason,
      greatest(0, least(100, p_risk_score)), p_challenge_required, v_now
    );
    return;
  end if;

  -- Every denial remains observable, but repeated requests update a bounded
  -- 15-minute aggregate instead of creating one permanent row per request.
  -- The client bucket is an approximate cohort, not a person or device ID.
  insert into private.lab_access_denial_rollups (
    bucket_start, operation, provider_id, tier, actor_kind, reason,
    client_bucket, occurrence_count, maximum_requested_units,
    maximum_risk_score, challenge_count, first_seen_at, last_seen_at
  ) values (
    v_bucket_start, p_operation, coalesce(p_provider_id, ''), p_tier,
    p_actor_kind, p_reason, v_client_bucket, 1, p_requested_units,
    greatest(0, least(100, p_risk_score)),
    case when p_challenge_required then 1 else 0 end, v_now, v_now
  )
  on conflict (bucket_start, operation, provider_id, tier, actor_kind, reason, client_bucket)
  do update set
    occurrence_count = least(
      9000000000000000,
      private.lab_access_denial_rollups.occurrence_count + 1
    ),
    maximum_requested_units = greatest(
      private.lab_access_denial_rollups.maximum_requested_units,
      excluded.maximum_requested_units
    ),
    maximum_risk_score = greatest(
      private.lab_access_denial_rollups.maximum_risk_score,
      excluded.maximum_risk_score
    ),
    challenge_count = least(
      9000000000000000,
      private.lab_access_denial_rollups.challenge_count + excluded.challenge_count
    ),
    first_seen_at = least(private.lab_access_denial_rollups.first_seen_at, excluded.first_seen_at),
    last_seen_at = greatest(private.lab_access_denial_rollups.last_seen_at, excluded.last_seen_at);

  -- Preserve a useful exact sample for incident investigation without allowing
  -- a denial flood or rotating endpoint IDs to grow detailed storage without
  -- bound. One client/operation/reason sample per hour is retained, subject to
  -- a global ceiling of 250 denial-detail rows per hour.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('one-lab-denial-detail:' || v_hour_epoch::text, 0)
  );
  select count(*)::integer into v_denial_detail_count
  from private.lab_access_audit audit
  where not audit.allowed
    and audit.created_at >= v_hour_start
    and audit.created_at < v_hour_start + interval '1 hour';

  if v_denial_detail_count < 250 and not exists (
    select 1
    from private.lab_access_audit audit
    where not audit.allowed
      and audit.client_hash = p_client_hash
      and audit.operation = p_operation
      and audit.reason = p_reason
      and audit.created_at >= v_hour_start
      and audit.created_at < v_hour_start + interval '1 hour'
  ) then
    insert into private.lab_access_audit (
      user_id, tier, actor_kind, declared_actor_intent, client_hash,
      session_hash, operation, provider_id, endpoint_id, requested_units,
      allowed, reason, risk_score, challenge_required, created_at
    ) values (
      p_user_id, p_tier, p_actor_kind, p_declared_actor_intent,
      p_client_hash, p_session_hash, p_operation, nullif(p_provider_id, ''),
      nullif(p_endpoint_id, ''), p_requested_units, false, p_reason,
      greatest(0, least(100, p_risk_score)), p_challenge_required, v_now
    );
  end if;
end;
$$;

create or replace function private.prune_lab_access_history()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_detail_rows integer := 0;
  v_detail_batch_rows integer := 0;
  v_rollup_rows integer := 0;
begin
  -- Delete in bounded statements but drain the full expired backlog every run.
  -- Successful admissions are individually audited and can outnumber denial
  -- samples, so a fixed per-run deletion ceiling would not enforce retention.
  loop
    with stale as (
      select audit.id
      from private.lab_access_audit audit
      where audit.created_at < now() - interval '35 days'
      order by audit.id
      limit 10000
      for update skip locked
    )
    delete from private.lab_access_audit audit
    using stale
    where audit.id = stale.id;
    get diagnostics v_detail_batch_rows = row_count;
    v_detail_rows := v_detail_rows + v_detail_batch_rows;
    exit when v_detail_batch_rows = 0;
  end loop;

  delete from private.lab_access_denial_rollups rollup
  where rollup.bucket_start < now() - interval '90 days';
  get diagnostics v_rollup_rows = row_count;

  return jsonb_build_object(
    'detailRowsDeleted', v_detail_rows,
    'rollupRowsDeleted', v_rollup_rows
  );
end;
$$;

revoke all on function private.assert_lab_guard(text) from public, anon, authenticated;
revoke all on function private.lab_tier_rank(text) from public, anon, authenticated;
revoke all on function private.lab_counter_value(text, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function private.increment_lab_counter(text, text, text, text, text, timestamptz, bigint) from public, anon, authenticated;
revoke all on function private.record_lab_access_audit(uuid, text, text, text, text, text, text, text, text, integer, boolean, text, integer, boolean) from public, anon, authenticated;
revoke all on function private.prune_lab_access_history() from public, anon, authenticated;

select cron.schedule(
  'one-lab-access-history-retention',
  '23 * * * *',
  $$ select private.prune_lab_access_history() $$
);

create or replace function public.acquire_lab_access(
  p_operation text,
  p_provider_id text,
  p_endpoint_id text,
  p_client_hash text,
  p_session_hash text,
  p_requested_units integer,
  p_minimum_tier text,
  p_actor_intent text,
  p_challenge_verified boolean,
  p_acquire_concurrency boolean,
  p_guard_token text
)
returns table (
  allowed boolean,
  tier text,
  actor_kind text,
  used bigint,
  allowance bigint,
  remaining bigint,
  resets_at timestamptz,
  daily_used bigint,
  daily_allowance bigint,
  monthly_used bigint,
  monthly_allowance bigint,
  reason text,
  risk_score integer,
  challenge_required boolean,
  lease_id uuid,
  active_concurrency integer,
  concurrency_allowance integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_user_id uuid := auth.uid();
  v_tier text := 'guest';
  v_actor_kind text := 'unknown';
  v_status text := 'active';
  v_profile_risk integer := 0;
  v_policy record;
  v_policy_found boolean := false;
  v_budget private.lab_provider_budgets%rowtype;
  v_budget_found boolean := false;
  v_provider_id text := coalesce(p_provider_id, '');
  v_endpoint_id text := coalesce(p_endpoint_id, '');
  v_subject_id text;
  v_burst_window timestamptz;
  v_day_window timestamptz := date_trunc('day', v_now at time zone 'UTC') at time zone 'UTC';
  v_month_window timestamptz := date_trunc('month', v_now at time zone 'UTC') at time zone 'UTC';
  v_next_day timestamptz := (date_trunc('day', v_now at time zone 'UTC') + interval '1 day') at time zone 'UTC';
  v_next_month timestamptz := (date_trunc('month', v_now at time zone 'UTC') + interval '1 month') at time zone 'UTC';
  v_resets_at timestamptz;
  v_allowed boolean := false;
  v_reason text := 'quota_unavailable';
  v_risk_score integer := 0;
  v_challenge_required boolean := false;
  v_lease_id uuid;
  v_active_subject integer := 0;
  v_active_provider integer := 0;
  v_concurrency_allowance integer := 0;
  v_burst_used bigint := 0;
  v_session_used bigint := 0;
  v_client_used bigint := 0;
  v_user_day_used bigint := 0;
  v_user_month_used bigint := 0;
  v_global_day_used bigint := 0;
  v_global_month_used bigint := 0;
  v_provider_day_used bigint := 0;
  v_provider_month_used bigint := 0;
  v_daily_used bigint := 0;
  v_daily_allowance bigint := 0;
  v_monthly_used bigint := 0;
  v_monthly_allowance bigint := 0;
  v_account_count integer := 0;
  v_recent_denials integer := 0;
  v_lease_seconds integer := 120;
begin
  perform private.assert_lab_guard(p_guard_token);

  if p_operation is null or p_operation not in (
    'provider_catalog', 'speech_generation', 'speech_transcription',
    'realtime_session', 'ai_reasoning', 'deliverable_generation',
    'feedback_submission', 'session_creation'
  ) then
    raise exception 'Unknown Lab access operation.' using errcode = '22023';
  end if;
  if p_client_hash is null or p_client_hash !~ '^[0-9a-f]{64}$'
     or p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid pseudonymous Lab subject.' using errcode = '22023';
  end if;
  if v_provider_id <> '' and v_provider_id !~ '^[a-z0-9][a-z0-9._-]{0,79}$' then
    raise exception 'Invalid provider scope.' using errcode = '22023';
  end if;
  if v_endpoint_id <> '' and v_endpoint_id !~ '^[a-z0-9][a-z0-9._:/-]{0,79}$' then
    raise exception 'Invalid endpoint scope.' using errcode = '22023';
  end if;
  if p_requested_units is null or p_requested_units < 0 or p_requested_units > 10000 then
    raise exception 'Invalid requested usage units.' using errcode = '22023';
  end if;
  if p_minimum_tier is null or private.lab_tier_rank(p_minimum_tier) < 0 then
    raise exception 'Invalid minimum trust tier.' using errcode = '22023';
  end if;
  if p_actor_intent is null or p_actor_intent not in ('human', 'developer', 'agent', 'unknown') then
    raise exception 'Invalid actor intent.' using errcode = '22023';
  end if;

  if v_user_id is not null then
    select profile.tier, profile.status, profile.actor_kind, profile.risk_score, profile.expires_at
      into v_policy
    from private.lab_trust_profiles profile
    where profile.user_id = v_user_id;

    if found then
      v_status := v_policy.status;
      v_profile_risk := v_policy.risk_score;
      if v_policy.expires_at is null or v_policy.expires_at > v_now then
        v_tier := v_policy.tier;
        v_actor_kind := v_policy.actor_kind;
      else
        v_tier := 'verified';
        v_actor_kind := 'human';
      end if;
    else
      v_tier := 'verified';
      v_actor_kind := 'human';
    end if;
  end if;

  select policy.* into v_policy
  from private.lab_access_policies policy
  where policy.tier = v_tier
    and policy.operation = p_operation
    and policy.provider_id in ('*', nullif(v_provider_id, ''))
    and policy.endpoint_id in ('*', nullif(v_endpoint_id, ''))
  order by
    (policy.provider_id <> '*') desc,
    (policy.endpoint_id <> '*') desc
  limit 1;
  v_policy_found := found;

  if v_provider_id <> '' and p_operation in (
    'speech_generation', 'speech_transcription', 'realtime_session', 'ai_reasoning'
  ) then
    select budget.* into v_budget
    from private.lab_provider_budgets budget
    where budget.provider_id = v_provider_id and budget.operation = p_operation;
    v_budget_found := found;
  end if;

  v_subject_id := coalesce(v_user_id::text, p_client_hash);
  v_resets_at := v_next_day;

  select count(distinct audit.user_id)::integer into v_account_count
  from private.lab_access_audit audit
  where audit.client_hash = p_client_hash
    and audit.user_id is not null
    and audit.created_at >= v_now - interval '24 hours';

  select count(*)::integer into v_recent_denials
  from private.lab_access_audit audit
  where audit.client_hash = p_client_hash
    and not audit.allowed
    and audit.created_at >= v_now - interval '1 hour';

  v_risk_score := least(
    100,
    v_profile_risk
      + least(30, greatest(0, v_account_count - 1) * 10)
      + least(30, v_recent_denials * 2)
  );

  if v_user_id is not null and exists (
    select 1 from auth.users account
    where account.id = v_user_id and account.created_at >= v_now - interval '1 hour'
  ) then
    v_risk_score := least(100, v_risk_score + 10);
  end if;

  <<admission>>
  begin
    if v_status = 'suspended' then
      v_reason := 'suspended';
      exit admission;
    end if;
    if private.lab_tier_rank(v_tier) < private.lab_tier_rank(p_minimum_tier) then
      v_reason := 'tier_required';
      exit admission;
    end if;
    -- Actor intent is only a declared execution channel. It can never promote
    -- a caller. Paid agent access requires an explicitly provisioned agent
    -- profile at trusted-builder tier or higher.
    if p_actor_intent = 'agent' and (
      v_user_id is null
      or v_actor_kind <> 'agent'
      or private.lab_tier_rank(v_tier) < private.lab_tier_rank('trusted_builder')
    ) then
      v_reason := 'tier_required';
      exit admission;
    end if;
    if not v_policy_found or not v_policy.enabled then
      v_reason := 'operation_disabled';
      exit admission;
    end if;
    if p_requested_units > v_policy.max_request_units then
      v_reason := 'daily_limit';
      exit admission;
    end if;
    if v_budget_found and not v_budget.enabled then
      v_reason := 'provider_paused';
      exit admission;
    end if;
    if v_provider_id <> ''
       and p_operation in ('speech_generation', 'speech_transcription', 'realtime_session', 'ai_reasoning')
       and not v_budget_found then
      v_reason := 'provider_paused';
      exit admission;
    end if;

    v_challenge_required := v_risk_score >= v_policy.challenge_risk_score;
    if v_challenge_required and not coalesce(p_challenge_verified, false) then
      v_reason := 'challenge_required';
      exit admission;
    end if;

    -- One operation-wide admission lock protects the shared global counters as
    -- well as provider counters. Per-provider locks alone allow simultaneous
    -- providers to race the same global ceiling.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('one-lab:' || p_operation, 0)
    );

    delete from private.lab_concurrency_leases where expires_at <= v_now;

    if coalesce(p_acquire_concurrency, false) then
      v_concurrency_allowance := v_policy.concurrency_limit;
      if v_budget_found then
        v_concurrency_allowance := least(v_concurrency_allowance, v_budget.concurrency_limit);
      end if;

      select count(*)::integer into v_active_subject
      from private.lab_concurrency_leases lease
      where lease.operation = p_operation
        and lease.expires_at > v_now
        and (
          (v_user_id is not null and lease.user_id = v_user_id)
          or (v_user_id is null and lease.user_id is null and lease.client_hash = p_client_hash)
        );

      select count(*)::integer into v_active_provider
      from private.lab_concurrency_leases lease
      where lease.operation = p_operation
        and lease.provider_id = v_provider_id
        and lease.expires_at > v_now;

      if v_active_subject >= v_policy.concurrency_limit
         or (v_budget_found and v_active_provider >= v_budget.concurrency_limit) then
        v_reason := 'concurrency_limit';
        exit admission;
      end if;

      v_lease_seconds := case p_operation
        when 'speech_transcription' then 300
        when 'realtime_session' then least(600, greatest(30, p_requested_units))
        when 'deliverable_generation' then 300
        else 120
      end;
      insert into private.lab_concurrency_leases (
        user_id, client_hash, session_hash, operation, provider_id,
        endpoint_id, expires_at
      ) values (
        v_user_id, p_client_hash, p_session_hash, p_operation,
        v_provider_id, v_endpoint_id, v_now + make_interval(secs => v_lease_seconds)
      ) returning private.lab_concurrency_leases.lease_id into v_lease_id;

      v_active_subject := v_active_subject + 1;
      v_active_provider := v_active_provider + 1;

      v_allowed := true;
      v_reason := 'allowed';
      exit admission;
    end if;

    if p_requested_units = 0 then
      v_allowed := true;
      v_reason := 'allowed';
      exit admission;
    end if;

    v_burst_window := to_timestamp(
      floor(extract(epoch from v_now) / v_policy.burst_window_seconds)
        * v_policy.burst_window_seconds
    );
    v_burst_used := private.lab_counter_value(
      'burst', p_client_hash, p_operation, '', '', v_burst_window
    );
    v_session_used := private.lab_counter_value(
      'session_day', p_session_hash, p_operation, '', '', v_day_window
    );
    v_client_used := private.lab_counter_value(
      'client_day', p_client_hash, p_operation, '', '', v_day_window
    );
    if v_user_id is not null then
      v_user_day_used := private.lab_counter_value(
        'user_day', v_user_id::text, p_operation, '', '', v_day_window
      );
      v_user_month_used := private.lab_counter_value(
        'user_month', v_user_id::text, p_operation, '', '', v_month_window
      );
    end if;
    v_global_day_used := private.lab_counter_value(
      'global_day', 'global', p_operation, '', '', v_day_window
    );
    v_global_month_used := private.lab_counter_value(
      'global_month', 'global', p_operation, '', '', v_month_window
    );
    if v_budget_found then
      v_provider_day_used := private.lab_counter_value(
        'provider_day', v_provider_id, p_operation, v_provider_id, '', v_day_window
      );
      v_provider_month_used := private.lab_counter_value(
        'provider_month', v_provider_id, p_operation, v_provider_id, '', v_month_window
      );
    end if;

    if v_burst_used + 1 > v_policy.burst_requests then
      v_reason := 'burst_limit';
      v_resets_at := v_burst_window + make_interval(secs => v_policy.burst_window_seconds);
      exit admission;
    end if;
    if v_policy.session_daily_units > 0 and v_session_used + p_requested_units > v_policy.session_daily_units then
      v_reason := 'session_limit';
      exit admission;
    end if;
    if v_policy.client_daily_units > 0 and v_client_used + p_requested_units > v_policy.client_daily_units then
      v_reason := 'client_limit';
      exit admission;
    end if;
    if v_user_id is not null
       and v_policy.user_daily_units > 0
       and v_user_day_used + p_requested_units > v_policy.user_daily_units then
      v_reason := 'daily_limit';
      exit admission;
    end if;
    if v_user_id is not null
       and v_policy.user_monthly_units > 0
       and v_user_month_used + p_requested_units > v_policy.user_monthly_units then
      v_reason := 'monthly_limit';
      v_resets_at := v_next_month;
      exit admission;
    end if;
    if v_global_day_used + p_requested_units > v_policy.global_daily_units
       or v_global_month_used + p_requested_units > v_policy.global_monthly_units then
      v_reason := 'global_limit';
      if v_global_month_used + p_requested_units > v_policy.global_monthly_units then
        v_resets_at := v_next_month;
      end if;
      exit admission;
    end if;
    if v_budget_found and (
      v_provider_day_used + p_requested_units > v_budget.daily_units
      or v_provider_month_used + p_requested_units > v_budget.monthly_units
    ) then
      v_reason := 'provider_budget';
      if v_provider_month_used + p_requested_units > v_budget.monthly_units then
        v_resets_at := v_next_month;
      end if;
      exit admission;
    end if;

    perform private.increment_lab_counter(
      'burst', p_client_hash, p_operation, '', '', v_burst_window, 1
    );
    if v_policy.session_daily_units > 0 then
      v_session_used := private.increment_lab_counter(
        'session_day', p_session_hash, p_operation, '', '',
        v_day_window, p_requested_units
      );
    end if;
    if v_policy.client_daily_units > 0 then
      v_client_used := private.increment_lab_counter(
        'client_day', p_client_hash, p_operation, '', '',
        v_day_window, p_requested_units
      );
    end if;
    if v_user_id is not null and v_policy.user_daily_units > 0 then
      v_user_day_used := private.increment_lab_counter(
        'user_day', v_user_id::text, p_operation, '', '',
        v_day_window, p_requested_units
      );
    end if;
    if v_user_id is not null and v_policy.user_monthly_units > 0 then
      v_user_month_used := private.increment_lab_counter(
        'user_month', v_user_id::text, p_operation, '', '',
        v_month_window, p_requested_units
      );
    end if;
    v_global_day_used := private.increment_lab_counter(
      'global_day', 'global', p_operation, '', '', v_day_window, p_requested_units
    );
    v_global_month_used := private.increment_lab_counter(
      'global_month', 'global', p_operation, '', '', v_month_window, p_requested_units
    );
    if v_budget_found then
      v_provider_day_used := private.increment_lab_counter(
        'provider_day', v_provider_id, p_operation, v_provider_id, '', v_day_window, p_requested_units
      );
      v_provider_month_used := private.increment_lab_counter(
        'provider_month', v_provider_id, p_operation, v_provider_id, '', v_month_window, p_requested_units
      );
    end if;

    v_allowed := true;
    v_reason := 'allowed';
  end admission;

  if v_user_id is not null then
    v_daily_used := v_user_day_used + case when v_allowed and p_requested_units > 0 and v_user_day_used = 0 then p_requested_units else 0 end;
    v_daily_allowance := case when v_policy_found then v_policy.user_daily_units else 0 end;
    v_monthly_used := v_user_month_used + case when v_allowed and p_requested_units > 0 and v_user_month_used = 0 then p_requested_units else 0 end;
    v_monthly_allowance := case when v_policy_found then v_policy.user_monthly_units else 0 end;
  else
    v_daily_used := greatest(v_session_used, v_client_used);
    v_daily_allowance := case when v_policy_found then least(v_policy.session_daily_units, v_policy.client_daily_units) else 0 end;
    -- Do not expose shared operational budget totals to anonymous callers.
    v_monthly_used := 0;
    v_monthly_allowance := 0;
  end if;

  if not v_allowed and p_requested_units > 0 then
    v_daily_used := v_daily_used + p_requested_units;
    if v_reason = 'monthly_limit' then v_monthly_used := v_monthly_used + p_requested_units; end if;
  end if;

  perform private.record_lab_access_audit(
    v_user_id, v_tier, v_actor_kind, p_actor_intent, p_client_hash,
    p_session_hash, p_operation, v_provider_id, v_endpoint_id,
    p_requested_units, v_allowed, v_reason, v_risk_score,
    v_challenge_required
  );

  return query select
    v_allowed,
    v_tier,
    v_actor_kind,
    v_daily_used,
    v_daily_allowance,
    greatest(0::bigint, v_daily_allowance - v_daily_used),
    v_resets_at,
    v_daily_used,
    v_daily_allowance,
    v_monthly_used,
    v_monthly_allowance,
    v_reason,
    v_risk_score,
    v_challenge_required,
    v_lease_id,
    greatest(v_active_subject, v_active_provider),
    v_concurrency_allowance;
end;
$$;

revoke all on function public.acquire_lab_access(text, text, text, text, text, integer, text, text, boolean, boolean, text)
  from public, anon, authenticated;
grant execute on function public.acquire_lab_access(text, text, text, text, text, integer, text, text, boolean, boolean, text)
  to anon, authenticated;

create or replace function public.release_lab_access(
  p_lease_id uuid,
  p_guard_token text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  perform private.assert_lab_guard(p_guard_token);
  if p_lease_id is null then
    raise exception 'A concurrency lease identifier is required.' using errcode = '22023';
  end if;
  delete from private.lab_concurrency_leases where lease_id = p_lease_id;
  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$$;

revoke all on function public.release_lab_access(uuid, text) from public, anon, authenticated;
grant execute on function public.release_lab_access(uuid, text) to anon, authenticated;

create or replace function public.read_my_lab_access_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_tier text := 'verified';
  v_status text := 'active';
  v_actor_kind text := 'human';
  v_risk_score integer := 0;
  v_expires_at timestamptz;
  v_saved_experiments integer := 0;
  v_usage jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select profile.tier, profile.status, profile.actor_kind, profile.risk_score, profile.expires_at
    into v_tier, v_status, v_actor_kind, v_risk_score, v_expires_at
  from private.lab_trust_profiles profile
  where profile.user_id = v_user_id;

  if not found or (v_expires_at is not null and v_expires_at <= now()) then
    v_tier := 'verified';
    v_actor_kind := 'human';
    if not found then v_status := 'active'; v_risk_score := 0; v_expires_at := null; end if;
  end if;

  select count(*)::integer into v_saved_experiments
  from public.saved_experiments experiment
  where experiment.user_id = v_user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'operation', usage.operation,
    'providerId', nullif(usage.provider_id, ''),
    'window', usage.scope_kind,
    'usedUnits', usage.used_units,
    'windowStart', usage.window_start
  ) order by usage.operation, usage.provider_id, usage.scope_kind), '[]'::jsonb)
  into v_usage
  from private.lab_usage_counters usage
  where usage.scope_id = v_user_id::text
    and usage.scope_kind in ('user_day', 'user_month')
    and usage.window_start >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';

  return jsonb_build_object(
    'tier', v_tier,
    'status', v_status,
    'actorKind', v_actor_kind,
    'riskBand', case when v_risk_score >= 80 then 'elevated' when v_risk_score >= 40 then 'review' else 'normal' end,
    'expiresAt', v_expires_at,
    'savedExperiments', v_saved_experiments,
    'usage', v_usage
  );
end;
$$;

revoke all on function public.read_my_lab_access_state() from public, anon, authenticated;
grant execute on function public.read_my_lab_access_state() to authenticated;

create or replace function public.read_lab_access_admin_summary(p_guard_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile private.lab_trust_profiles%rowtype;
  -- Use the latest 96 complete UTC 15-minute buckets. This avoids counting a
  -- whole boundary bucket merely because its final denial was in the window.
  v_end timestamptz := to_timestamp(floor(extract(epoch from now()) / 900) * 900);
  v_start timestamptz := v_end - interval '24 hours';
begin
  perform private.assert_lab_guard(p_guard_token);

  select * into v_profile
  from private.lab_trust_profiles profile
  where profile.user_id = v_user_id;

  if v_user_id is null
     or not found
     or v_profile.status <> 'active'
     or v_profile.tier <> 'admin'
     or (v_profile.expires_at is not null and v_profile.expires_at <= now()) then
    raise exception 'Active administrator access is required.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'generatedAt', now(),
    'windowHours', 24,
    'windowStartedAt', v_start,
    'windowEndedAt', v_end,
    'decisions', jsonb_build_object(
      'allowed', (
        select count(*) from private.lab_access_audit
        where allowed and created_at >= v_start and created_at < v_end
      ),
      'denied', coalesce((
        select sum(rollup.occurrence_count)
        from private.lab_access_denial_rollups rollup
        where rollup.bucket_start >= v_start and rollup.bucket_start < v_end
      ), 0)
    ),
    'denialsByReason', coalesce((
      select jsonb_agg(jsonb_build_object('reason', grouped.reason, 'count', grouped.count) order by grouped.count desc)
      from (
        select rollup.reason, sum(rollup.occurrence_count) as count
        from private.lab_access_denial_rollups rollup
        where rollup.bucket_start >= v_start and rollup.bucket_start < v_end
        group by rollup.reason
      ) grouped
    ), '[]'::jsonb),
    'usageByProvider', coalesce((
      select jsonb_agg(jsonb_build_object(
        'providerId', grouped.provider_id,
        'operation', grouped.operation,
        'usedUnits', grouped.used_units
      ) order by grouped.provider_id, grouped.operation)
      from (
        select provider_id, operation, sum(used_units)::bigint as used_units
        from private.lab_usage_counters
        where scope_kind = 'provider_day'
          and window_start >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
        group by provider_id, operation
      ) grouped
    ), '[]'::jsonb),
    'providerBudgets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'providerId', budget.provider_id,
        'operation', budget.operation,
        'enabled', budget.enabled,
        'dailyUnits', budget.daily_units,
        'monthlyUnits', budget.monthly_units,
        'concurrencyLimit', budget.concurrency_limit,
        'updatedAt', budget.updated_at
      ) order by budget.provider_id, budget.operation)
      from private.lab_provider_budgets budget
    ), '[]'::jsonb),
    'activeConcurrency', (
      select count(*) from private.lab_concurrency_leases where expires_at > now()
    ),
    'activeTierCounts', coalesce((
      select jsonb_object_agg(grouped.tier, grouped.count)
      from (
        select tier, count(*)::integer as count
        from private.lab_trust_profiles
        where status = 'active' and (expires_at is null or expires_at > now())
        group by tier
      ) grouped
    ), '{}'::jsonb),
    'riskSignals', jsonb_build_object(
      'reviewOrElevatedClients', (
        select count(distinct client_hash)
        from private.lab_access_audit
        where risk_score >= 40 and created_at >= v_start and created_at < v_end
      ),
      'multiAccountClients', (
        select count(*)
        from (
          select client_hash
          from private.lab_access_audit
          where user_id is not null and created_at >= v_start and created_at < v_end
          group by client_hash
          having count(distinct user_id) > 1
        ) grouped
      )
    )
  );
end;
$$;

revoke all on function public.read_lab_access_admin_summary(text) from public, anon, authenticated;
grant execute on function public.read_lab_access_admin_summary(text) to authenticated;

create or replace function private.enforce_saved_experiment_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_tier text := 'verified';
  v_status text := 'active';
  v_expires_at timestamptz;
  v_allowance integer := 25;
  v_count integer;
begin
  if v_user_id is null or new.user_id <> v_user_id then
    raise exception 'Saved experiments require the authenticated owner.' using errcode = '42501';
  end if;

  -- Serialize the count and insert for one user for the lifetime of the
  -- surrounding transaction. Browser, Data API, bulk, and concurrent clients
  -- all pass through this trigger; different users keep independent locks.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('one-saved-experiment:' || v_user_id::text, 0)
  );

  select profile.tier, profile.status, profile.expires_at
    into v_tier, v_status, v_expires_at
  from private.lab_trust_profiles profile
  where profile.user_id = v_user_id;

  if found and v_status = 'suspended' then
    raise exception 'This account cannot save experiments.' using errcode = '42501';
  end if;
  if not found or (v_expires_at is not null and v_expires_at <= now()) then
    v_tier := 'verified';
  end if;

  v_allowance := case v_tier
    when 'verified' then 25
    when 'trusted_builder' then 100
    when 'partner_researcher' then 500
    when 'admin' then 500
    else 0
  end;

  select count(*)::integer into v_count
  from public.saved_experiments experiment
  where experiment.user_id = v_user_id;

  if v_count >= v_allowance then
    raise exception 'Saved experiment allowance reached.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists saved_experiments_trust_quota on public.saved_experiments;
create trigger saved_experiments_trust_quota
before insert on public.saved_experiments
for each row execute function private.enforce_saved_experiment_quota();

revoke all on function private.enforce_saved_experiment_quota() from public, anon, authenticated;

-- Retire the unguarded member counter. The application now uses
-- acquire_lab_access; this guarded overload remains only for a coordinated
-- rollback and cannot be called directly with the public Data API alone.
revoke all on function public.consume_member_usage(text) from public, anon, authenticated;

create or replace function public.consume_member_usage(
  p_operation text,
  p_guard_token text
)
returns table (
  allowed boolean,
  tier text,
  used integer,
  allowance integer,
  resets_at timestamptz,
  reason text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_date date := (timezone('utc', now()))::date;
  v_allowance integer;
  v_global_allowance integer;
  v_used integer;
  v_global_used integer;
  v_resets_at timestamptz := ((timezone('utc', now()))::date + 1)::timestamp at time zone 'UTC';
begin
  perform private.assert_lab_guard(p_guard_token);
  if v_user_id is null then
    raise exception 'Authentication is required for member usage.' using errcode = '42501';
  end if;

  v_allowance := case p_operation
    when 'provider_catalog' then 300
    when 'speech_generation' then 40
    when 'speech_transcription' then 20
    when 'realtime_session' then 15
    when 'ai_reasoning' then 25
    when 'deliverable_generation' then 15
    else null
  end;
  v_global_allowance := case p_operation
    when 'provider_catalog' then 5000
    when 'speech_generation' then 250
    when 'speech_transcription' then 150
    when 'realtime_session' then 100
    when 'ai_reasoning' then 200
    when 'deliverable_generation' then 100
    else null
  end;
  if v_allowance is null or v_global_allowance is null then
    raise exception 'Unknown Lab usage operation.' using errcode = '22023';
  end if;

  insert into private.member_usage_daily (usage_date, user_id, operation, request_count, updated_at)
  values (v_date, v_user_id, p_operation, 1, now())
  on conflict (usage_date, user_id, operation)
  do update set request_count = least(private.member_usage_daily.request_count + 1, v_allowance + 1), updated_at = now()
  returning request_count into v_used;

  if v_used > v_allowance then
    return query select false, 'verified'::text, v_used, v_allowance, v_resets_at, 'member_limit'::text;
    return;
  end if;

  insert into private.lab_global_usage_daily (usage_date, operation, request_count, updated_at)
  values (v_date, p_operation, 1, now())
  on conflict (usage_date, operation)
  do update set request_count = least(private.lab_global_usage_daily.request_count + 1, v_global_allowance + 1), updated_at = now()
  returning request_count into v_global_used;

  return query select v_global_used <= v_global_allowance, 'verified'::text, v_used, v_allowance, v_resets_at,
    case when v_global_used <= v_global_allowance then 'allowed' else 'global_limit' end;
end;
$$;

revoke all on function public.consume_member_usage(text, text) from public, anon, authenticated;
grant execute on function public.consume_member_usage(text, text) to authenticated;

create or replace function public.consume_guest_usage(
  p_operation text,
  p_subject_hash text,
  p_guard_token text
)
returns table (
  allowed boolean,
  tier text,
  used integer,
  allowance integer,
  resets_at timestamptz,
  reason text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_date date := (timezone('utc', now()))::date;
  v_allowance integer;
  v_global_allowance integer;
  v_used integer;
  v_global_used integer;
  v_resets_at timestamptz := ((timezone('utc', now()))::date + 1)::timestamp at time zone 'UTC';
begin
  perform private.assert_lab_guard(p_guard_token);
  if p_subject_hash is null or p_subject_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid guest subject.' using errcode = '22023';
  end if;

  v_allowance := case p_operation
    when 'provider_catalog' then 60
    when 'speech_generation' then 6
    when 'speech_transcription' then 4
    when 'realtime_session' then 3
    when 'ai_reasoning' then 5
    when 'deliverable_generation' then 3
    else null
  end;
  v_global_allowance := case p_operation
    when 'provider_catalog' then 5000
    when 'speech_generation' then 250
    when 'speech_transcription' then 150
    when 'realtime_session' then 100
    when 'ai_reasoning' then 200
    when 'deliverable_generation' then 100
    else null
  end;
  if v_allowance is null or v_global_allowance is null then
    raise exception 'Unknown Lab usage operation.' using errcode = '22023';
  end if;

  insert into private.guest_usage_daily (usage_date, subject_hash, operation, request_count, updated_at)
  values (v_date, p_subject_hash, p_operation, 1, now())
  on conflict (usage_date, subject_hash, operation)
  do update set request_count = least(private.guest_usage_daily.request_count + 1, v_allowance + 1), updated_at = now()
  returning request_count into v_used;

  if v_used > v_allowance then
    return query select false, 'guest'::text, v_used, v_allowance, v_resets_at, 'guest_limit'::text;
    return;
  end if;

  insert into private.lab_global_usage_daily (usage_date, operation, request_count, updated_at)
  values (v_date, p_operation, 1, now())
  on conflict (usage_date, operation)
  do update set request_count = least(private.lab_global_usage_daily.request_count + 1, v_global_allowance + 1), updated_at = now()
  returning request_count into v_global_used;

  return query select v_global_used <= v_global_allowance, 'guest'::text, v_used, v_allowance, v_resets_at,
    case when v_global_used <= v_global_allowance then 'allowed' else 'global_limit' end;
end;
$$;

revoke all on function public.consume_guest_usage(text, text, text) from public, anon, authenticated;
grant execute on function public.consume_guest_usage(text, text, text) to anon, authenticated;

-- Close the SQL NULL guard bypass in the existing feedback RPC while
-- preserving its public signature and bounded validation contract.
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
  v_message text := nullif(btrim(p_message), '');
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
  if v_message is not null and char_length(v_message) > 2000 then
    raise exception 'Feedback message is too long.' using errcode = '22023';
  end if;
  if (select count(*) from public.feedback_entries where created_at >= now() - interval '1 hour') >= 300 then
    raise exception 'Feedback intake is temporarily at capacity.' using errcode = 'P0001';
  end if;
  if v_user_id is not null and (
    select count(*) from public.feedback_entries
    where user_id = v_user_id and created_at >= now() - interval '1 hour'
  ) >= 20 then
    raise exception 'Member feedback limit reached.' using errcode = 'P0001';
  end if;

  insert into public.feedback_entries (user_id, sentiment, message, input_method, surface, provider_id)
  values (v_user_id, p_sentiment, v_message, p_input_method, p_surface, p_provider_id)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.submit_feedback(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_feedback(text, text, text, text, text, text) to anon, authenticated;

-- Viewer analytics remains aggregate-only and write-only. The shared guard
-- assertion makes NULL, short, missing, or incorrect tokens fail closed.
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
  if (select count(*) from public.viewer_events where occurred_at >= now() - interval '1 hour') >= 10000 then
    raise exception 'Viewer analytics is temporarily at capacity.' using errcode = 'P0001';
  end if;

  insert into public.viewer_events (event_name, surface, provider_id)
  values (p_event_name, p_surface, p_provider_id)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.record_viewer_event(text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_viewer_event(text, text, text, text) to anon, authenticated;

comment on table private.lab_trust_profiles is
  'Explicit progressive-trust grants. New authenticated accounts default to verified when no row exists.';
comment on table private.lab_access_policies is
  'Data-driven per-tier admission, burst, usage, challenge, and concurrency policy. Private and server-mediated.';
comment on table private.lab_provider_budgets is
  'Provider-specific operational unit ceilings and emergency enable switches. Units are not financial tokens.';
comment on table private.lab_access_audit is
  'Allowed admissions plus bounded denial samples retained for 35 days. Raw IP addresses, cookies, scripts, audio, and provider payloads are never stored.';
comment on table private.lab_access_denial_rollups is
  'Every denial aggregated into bounded 15-minute pseudonymous cohorts; retained for 90 days for incident trends.';
