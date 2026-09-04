begin;

select plan(33);

delete from public.viewer_events;
delete from private.viewer_event_daily_aggregates;
delete from public.feedback_entries;
delete from private.lab_usage_counters
where scope_id in ('persistence-expired', 'persistence-active');
delete from private.member_usage_daily
where user_id = '10000000-0000-4000-8000-000000000001'::uuid;
delete from private.guest_usage_daily
where subject_hash in (pg_catalog.repeat('a', 64), pg_catalog.repeat('b', 64));
delete from private.lab_global_usage_daily
where operation in ('provider_catalog', 'speech_generation');
delete from private.lab_access_audit
where reason = 'persistence_retention_test';
delete from private.lab_access_denial_rollups
where reason = 'persistence_retention_test';

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '10000000-0000-4000-8000-000000000001'::uuid,
  'authenticated',
  'authenticated',
  'persistence-lifecycle@example.invalid',
  '',
  '{}'::jsonb,
  '{}'::jsonb,
  pg_catalog.clock_timestamp(),
  pg_catalog.clock_timestamp()
);

-- Four full 5,000-row batches are eligible, plus one stale row that must be
-- left for the next invocation. One recent row must never enter a stale batch.
insert into public.viewer_events (event_name, surface, provider_id, occurred_at)
select
  'page_view',
  'home',
  null,
  pg_catalog.clock_timestamp() - interval '31 days'
from pg_catalog.generate_series(1, 20001);

insert into public.viewer_events (event_name, surface, provider_id, occurred_at)
values (
  'provider_profile_open',
  'provider',
  'deepgram',
  pg_catalog.clock_timestamp() - interval '29 days'
);

insert into private.viewer_event_daily_aggregates (
  event_day,
  event_name,
  surface,
  provider_id,
  event_count
) values (
  (pg_catalog.timezone('UTC', pg_catalog.clock_timestamp()))::date - 401,
  'page_view',
  'other',
  '',
  7
);

insert into public.feedback_entries (
  sentiment,
  message,
  input_method,
  surface,
  provider_id,
  created_at
) values
  (
    'nay',
    'PERSISTENCE_TEST_EXPIRED_TEXT_MUST_DISAPPEAR',
    'typed',
    'other',
    null,
    pg_catalog.clock_timestamp() - interval '366 days'
  ),
  (
    'yay',
    'PERSISTENCE_TEST_ACTIVE_TEXT_MUST_REMAIN',
    'typed',
    'home',
    null,
    pg_catalog.clock_timestamp() - interval '364 days'
  );

insert into private.lab_usage_counters (
  scope_kind,
  scope_id,
  operation,
  provider_id,
  endpoint_id,
  window_start,
  used_units
) values
  (
    'global_day',
    'persistence-expired',
    'provider_catalog',
    '',
    '',
    pg_catalog.clock_timestamp() - interval '121 days',
    3
  ),
  (
    'global_day',
    'persistence-active',
    'feedback_submission',
    '',
    '',
    pg_catalog.date_trunc('day', pg_catalog.clock_timestamp()),
    4
  );

insert into private.member_usage_daily (
  usage_date,
  user_id,
  operation,
  request_count
) values
  (
    (pg_catalog.timezone('UTC', pg_catalog.clock_timestamp()))::date - 121,
    '10000000-0000-4000-8000-000000000001'::uuid,
    'provider_catalog',
    2
  ),
  (
    (pg_catalog.timezone('UTC', pg_catalog.clock_timestamp()))::date,
    '10000000-0000-4000-8000-000000000001'::uuid,
    'speech_generation',
    2
  );

insert into private.guest_usage_daily (
  usage_date,
  subject_hash,
  operation,
  request_count
) values
  (
    (pg_catalog.timezone('UTC', pg_catalog.clock_timestamp()))::date - 121,
    pg_catalog.repeat('a', 64),
    'provider_catalog',
    2
  ),
  (
    (pg_catalog.timezone('UTC', pg_catalog.clock_timestamp()))::date,
    pg_catalog.repeat('b', 64),
    'speech_generation',
    2
  );

insert into private.lab_global_usage_daily (
  usage_date,
  operation,
  request_count
) values
  (
    (pg_catalog.timezone('UTC', pg_catalog.clock_timestamp()))::date - 121,
    'provider_catalog',
    2
  ),
  (
    (pg_catalog.timezone('UTC', pg_catalog.clock_timestamp()))::date,
    'speech_generation',
    2
  );

insert into private.lab_access_audit (
  tier,
  actor_kind,
  declared_actor_intent,
  client_hash,
  session_hash,
  operation,
  provider_id,
  endpoint_id,
  requested_units,
  allowed,
  reason,
  risk_score,
  challenge_required,
  created_at
) values
  (
    'guest',
    'unknown',
    'human',
    pg_catalog.repeat('c', 64),
    pg_catalog.repeat('d', 64),
    'provider_catalog',
    null,
    'db-pgtap',
    1,
    true,
    'persistence_retention_test',
    0,
    false,
    pg_catalog.clock_timestamp() - interval '36 days'
  ),
  (
    'guest',
    'unknown',
    'human',
    pg_catalog.repeat('d', 64),
    pg_catalog.repeat('e', 64),
    'provider_catalog',
    null,
    'db-pgtap',
    1,
    true,
    'persistence_retention_test',
    0,
    false,
    pg_catalog.clock_timestamp() - interval '34 days'
  );

insert into private.lab_access_denial_rollups (
  bucket_start,
  operation,
  provider_id,
  tier,
  actor_kind,
  reason,
  client_bucket,
  occurrence_count,
  maximum_requested_units,
  maximum_risk_score,
  challenge_count,
  first_seen_at,
  last_seen_at
) values
  (
    pg_catalog.clock_timestamp() - interval '91 days',
    'provider_catalog',
    '',
    'guest',
    'unknown',
    'persistence_retention_test',
    17,
    2,
    1,
    0,
    0,
    pg_catalog.clock_timestamp() - interval '91 days',
    pg_catalog.clock_timestamp() - interval '91 days'
  ),
  (
    pg_catalog.clock_timestamp() - interval '89 days',
    'provider_catalog',
    '',
    'guest',
    'unknown',
    'persistence_retention_test',
    18,
    2,
    1,
    0,
    0,
    pg_catalog.clock_timestamp() - interval '89 days',
    pg_catalog.clock_timestamp() - interval '89 days'
  );

create temporary table persistence_prune_first on commit drop as
select private.prune_lab_access_history() as payload;

select is(
  (select (payload ->> 'skipped')::boolean from persistence_prune_first),
  false,
  'the first lifecycle invocation acquires the maintenance lock'
);

select is(
  (select (payload ->> 'batchSize')::integer from persistence_prune_first),
  5000,
  'the lifecycle result discloses its 5,000-row batch size'
);

select is(
  (select (payload ->> 'maxBatchesPerPath')::integer from persistence_prune_first),
  4,
  'the lifecycle result discloses its four-batch path ceiling'
);

select is(
  (
    select (payload ->> 'viewerRowsAggregatedAndDeleted')::integer
    from persistence_prune_first
  ),
  20000,
  'one invocation processes no more than four full viewer-event batches'
);

select is(
  (
    select pg_catalog.count(*)::bigint
    from public.viewer_events
    where occurred_at < pg_catalog.clock_timestamp() - interval '30 days'
  ),
  1::bigint,
  'the 20,001st stale viewer event remains for a later bounded run'
);

select is(
  (
    select pg_catalog.count(*)::bigint
    from public.viewer_events
    where event_name = 'provider_profile_open'
      and provider_id = 'deepgram'
  ),
  1::bigint,
  'a viewer event inside the raw-retention window remains raw'
);

select is(
  (
    select coalesce(pg_catalog.sum(event_count), 0)::bigint
    from private.viewer_event_daily_aggregates
    where event_name = 'page_view'
      and surface = 'home'
      and provider_id = ''
  ),
  20000::bigint,
  'every deleted stale viewer row contributes exactly once to the aggregate'
);

select is(
  (
    select pg_catalog.count(*)::bigint
    from private.viewer_event_daily_aggregates
    where event_day < (pg_catalog.timezone('UTC', pg_catalog.clock_timestamp()))::date - 400
  ),
  0::bigint,
  'viewer aggregates beyond 400 days are removed'
);

select is(
  (
    select pg_catalog.count(*)::bigint
    from public.feedback_entries
    where message = 'PERSISTENCE_TEST_EXPIRED_TEXT_MUST_DISAPPEAR'
  ),
  0::bigint,
  'feedback older than 365 days is deleted without aggregation'
);

select is(
  (
    select pg_catalog.count(*)::bigint
    from public.feedback_entries
    where message = 'PERSISTENCE_TEST_ACTIVE_TEXT_MUST_REMAIN'
  ),
  1::bigint,
  'feedback inside the 365-day lifecycle remains available'
);

select is(
  (select (payload ->> 'feedbackRowsDeleted')::integer from persistence_prune_first),
  1,
  'the lifecycle result reports the expired feedback deletion'
);

select is(
  (
    select pg_catalog.count(*)::bigint
    from private.lab_usage_counters
    where scope_id = 'persistence-expired'
  ),
  0::bigint,
  'canonical usage counters older than 120 days are removed'
);

select is(
  (
    select pg_catalog.count(*)::bigint
    from private.lab_usage_counters
    where scope_id = 'persistence-active'
  ),
  1::bigint,
  'the current canonical quota window is retained'
);

select is(
  (
    select pg_catalog.count(*)::bigint
    from private.member_usage_daily
    where user_id = '10000000-0000-4000-8000-000000000001'::uuid
      and usage_date < (pg_catalog.timezone('UTC', pg_catalog.clock_timestamp()))::date - 120
  ),
  0::bigint,
  'expired legacy member counters are removed'
);

select is(
  (
    select pg_catalog.count(*)::bigint
    from private.member_usage_daily
    where user_id = '10000000-0000-4000-8000-000000000001'::uuid
      and usage_date = (pg_catalog.timezone('UTC', pg_catalog.clock_timestamp()))::date
  ),
  1::bigint,
  'the current legacy member counter is retained'
);

select is(
  (
    select pg_catalog.count(*)::bigint
    from private.guest_usage_daily
    where subject_hash = pg_catalog.repeat('a', 64)
  ),
  0::bigint,
  'expired legacy guest counters are removed'
);

select is(
  (
    select pg_catalog.count(*)::bigint
    from private.guest_usage_daily
    where subject_hash = pg_catalog.repeat('b', 64)
  ),
  1::bigint,
  'the current legacy guest counter is retained'
);

select is(
  (
    select pg_catalog.count(*)::bigint
    from private.lab_global_usage_daily
    where operation = 'provider_catalog'
      and usage_date < (pg_catalog.timezone('UTC', pg_catalog.clock_timestamp()))::date - 120
  ),
  0::bigint,
  'expired legacy global counters are removed'
);

select is(
  (
    select pg_catalog.count(*)::bigint
    from private.lab_global_usage_daily
    where operation = 'speech_generation'
      and usage_date = (pg_catalog.timezone('UTC', pg_catalog.clock_timestamp()))::date
  ),
  1::bigint,
  'the current legacy global counter is retained'
);

select is(
  (
    select pg_catalog.count(*)::bigint
    from private.lab_access_audit
    where reason = 'persistence_retention_test'
      and created_at < pg_catalog.clock_timestamp() - interval '35 days'
  ),
  0::bigint,
  'access-audit detail older than 35 days is removed'
);

select is(
  (
    select pg_catalog.count(*)::bigint
    from private.lab_access_audit
    where reason = 'persistence_retention_test'
      and created_at >= pg_catalog.clock_timestamp() - interval '35 days'
  ),
  1::bigint,
  'recent access-audit detail remains available for investigation'
);

select is(
  (
    select pg_catalog.count(*)::bigint
    from private.lab_access_denial_rollups
    where reason = 'persistence_retention_test'
      and bucket_start < pg_catalog.clock_timestamp() - interval '90 days'
  ),
  0::bigint,
  'denial rollups older than 90 days are removed'
);

select is(
  (
    select pg_catalog.count(*)::bigint
    from private.lab_access_denial_rollups
    where reason = 'persistence_retention_test'
      and bucket_start >= pg_catalog.clock_timestamp() - interval '90 days'
  ),
  1::bigint,
  'recent denial rollups remain available for incident trends'
);

select ok(
  (
    select (payload ->> 'auditDetailRowsDeleted')::integer = 1
      and (payload ->> 'denialRollupRowsDeleted')::integer = 1
    from persistence_prune_first
  ),
  'the lifecycle result reports audit-detail and denial-rollup retention work'
);

select ok(
  (
    select (payload ->> 'usageCounterRowsDeleted')::integer = 1
      and (payload ->> 'legacyMemberCounterRowsDeleted')::integer = 1
      and (payload ->> 'legacyGuestCounterRowsDeleted')::integer = 1
      and (payload ->> 'legacyGlobalCounterRowsDeleted')::integer = 1
    from persistence_prune_first
  ),
  'the lifecycle result reports every counter-family deletion'
);

create temporary table persistence_prune_second on commit drop as
select private.prune_lab_access_history() as payload;

select is(
  (
    select (payload ->> 'viewerRowsAggregatedAndDeleted')::integer
    from persistence_prune_second
  ),
  1,
  'a second invocation processes the one stale viewer row left by the batch ceiling'
);

select is(
  (
    select pg_catalog.count(*)::bigint
    from public.viewer_events
    where occurred_at < pg_catalog.clock_timestamp() - interval '30 days'
  ),
  0::bigint,
  'the stale viewer backlog is empty after the second invocation'
);

select is(
  (
    select coalesce(pg_catalog.sum(event_count), 0)::bigint
    from private.viewer_event_daily_aggregates
    where event_name = 'page_view'
      and surface = 'home'
      and provider_id = ''
  ),
  20001::bigint,
  'the second invocation adds only the remaining source row'
);

create temporary table persistence_prune_third on commit drop as
select private.prune_lab_access_history() as payload;

select is(
  (
    select (payload ->> 'viewerRowsAggregatedAndDeleted')::integer
    from persistence_prune_third
  ),
  0,
  'a third invocation has no viewer source rows to process'
);

select is(
  (
    select coalesce(pg_catalog.sum(event_count), 0)::bigint
    from private.viewer_event_daily_aggregates
    where event_name = 'page_view'
      and surface = 'home'
      and provider_id = ''
  ),
  20001::bigint,
  'repeated cleanup is idempotent and does not double-count aggregates'
);

select is(
  (
    select pg_catalog.count(*)::bigint
    from public.viewer_events
    where event_name = 'provider_profile_open'
      and provider_id = 'deepgram'
  ),
  1::bigint,
  'repeated cleanup never removes the active raw viewer event'
);

select is(
  (
    select pg_catalog.count(*)::bigint
    from public.feedback_entries
    where message = 'PERSISTENCE_TEST_EXPIRED_TEXT_MUST_DISAPPEAR'
  ),
  0::bigint,
  'expired feedback text is not recreated by later lifecycle runs'
);

select is(
  (
    select coalesce(pg_catalog.sum(event_count), 0)::bigint
    from private.viewer_event_daily_aggregates
    where event_name = 'page_view'
      and surface = 'home'
      and provider_id = ''
  ),
  (
    select 20001::bigint
  ),
  'aggregate evidence equals the exact number of deleted raw source rows'
);

select * from finish();
rollback;
