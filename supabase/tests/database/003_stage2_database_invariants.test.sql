begin;

select plan(40);

update private.lab_runtime_config
set
  token_sha256 = pg_catalog.encode(
    extensions.digest('one-voice-lab-db-test-guard-token-000001', 'sha256'),
    'hex'
  ),
  updated_at = pg_catalog.clock_timestamp()
where config_key = 'usage_guard';

delete from private.lab_usage_counters
where operation in ('provider_catalog', 'speech_generation');
delete from private.lab_concurrency_leases
where operation = 'provider_catalog';
delete from private.lab_access_audit
where client_hash in (
  pg_catalog.repeat('a', 64),
  pg_catalog.repeat('b', 64),
  pg_catalog.repeat('c', 64),
  pg_catalog.repeat('d', 64),
  pg_catalog.repeat('f', 64)
);
delete from private.lab_access_denial_rollups
where operation in ('speech_generation', 'feedback_submission')
  and client_bucket in (170, 187, 204, 221, 255);
delete from public.viewer_events;
delete from public.feedback_entries;

do $$
begin
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claims', '{}', true);
end;
$$;

select is(
  (
    select pg_catalog.count(*)::integer
    from private.lab_provider_budgets
    where enabled
  ),
  0,
  'all seeded provider budgets remain fail-closed by default'
);

select throws_ok(
  $$
    select *
    from public.acquire_lab_access(
      'provider_catalog',
      null,
      'db-pgtap',
      repeat('a', 64),
      repeat('b', 64),
      1,
      'guest',
      'human',
      false,
      false,
      null
    )
  $$,
  '42501',
  'Invalid Lab server guard.',
  'the shared access action rejects a NULL server guard token'
);

create temporary table stage2_provider_paused on commit drop as
select *
from public.acquire_lab_access(
  'speech_generation',
  'deepgram',
  'db-pgtap',
  pg_catalog.repeat('a', 64),
  pg_catalog.repeat('b', 64),
  1,
  'guest',
  'human',
  false,
  false,
  'one-voice-lab-db-test-guard-token-000001'
);

select is(
  (select allowed from stage2_provider_paused),
  false,
  'a disabled provider budget denies an otherwise valid request'
);

select is(
  (select reason from stage2_provider_paused),
  'provider_paused',
  'provider-budget denial uses the structured provider_paused reason'
);

select is(
  (
    select pg_catalog.count(*)::bigint
    from private.lab_usage_counters
    where operation = 'speech_generation'
  ),
  0::bigint,
  'provider-paused admission consumes no quota or provider budget units'
);

select is(
  (
    select coalesce(pg_catalog.sum(occurrence_count), 0)::bigint
    from private.lab_access_denial_rollups
    where operation = 'speech_generation'
      and reason = 'provider_paused'
      and client_bucket = 170
  ),
  1::bigint,
  'the provider-budget denial remains observable in the bounded rollup'
);

create temporary table stage2_allowed on commit drop as
select *
from public.acquire_lab_access(
  'provider_catalog',
  null,
  'db-pgtap',
  pg_catalog.repeat('b', 64),
  pg_catalog.repeat('c', 64),
  1,
  'guest',
  'human',
  false,
  false,
  'one-voice-lab-db-test-guard-token-000001'
);

select is(
  (select allowed from stage2_allowed),
  true,
  'an enabled, in-budget guest catalog request is admitted'
);

select is(
  (select reason from stage2_allowed),
  'allowed',
  'successful admission uses the structured allowed reason'
);

select is(
  (
    select pg_catalog.count(*)::integer
    from private.lab_usage_counters
    where operation = 'provider_catalog'
  ),
  5,
  'successful anonymous admission updates burst, session, client, global-day, and global-month counters'
);

select is(
  (
    select coalesce(pg_catalog.sum(used_units), 0)::bigint
    from private.lab_usage_counters
    where operation = 'provider_catalog'
  ),
  5::bigint,
  'each accepted catalog request reserves exactly one unit in each applicable counter'
);

create temporary table stage2_tier_denied on commit drop as
select *
from public.acquire_lab_access(
  'provider_catalog',
  null,
  'db-pgtap',
  pg_catalog.repeat('d', 64),
  pg_catalog.repeat('e', 64),
  1,
  'verified',
  'human',
  false,
  false,
  'one-voice-lab-db-test-guard-token-000001'
);

select is(
  (select reason from stage2_tier_denied),
  'tier_required',
  'a guest request cannot bypass a verified trust requirement'
);

select is(
  (
    select pg_catalog.count(*)::bigint
    from private.lab_usage_counters
    where scope_id in (pg_catalog.repeat('d', 64), pg_catalog.repeat('e', 64))
  ),
  0::bigint,
  'a trust-tier denial reserves no caller quota'
);

create temporary table stage2_lease on commit drop as
select *
from public.acquire_lab_access(
  'provider_catalog',
  null,
  'db-pgtap',
  pg_catalog.repeat('c', 64),
  pg_catalog.repeat('d', 64),
  0,
  'guest',
  'human',
  false,
  true,
  'one-voice-lab-db-test-guard-token-000001'
);

select is(
  (select allowed from stage2_lease),
  true,
  'an available concurrency slot can be leased'
);

select ok(
  (select lease_id is not null from stage2_lease),
  'successful concurrency admission returns a machine-readable lease identifier'
);

select is(
  (
    select pg_catalog.count(*)::bigint
    from private.lab_concurrency_leases
    where lease_id = (select lease_id from stage2_lease)
      and expires_at > pg_catalog.clock_timestamp()
  ),
  1::bigint,
  'the returned concurrency lease is durably active'
);

select is(
  (
    select public.release_lab_access(
      (select lease_id from stage2_lease),
      'one-voice-lab-db-test-guard-token-000001'
    )
  ),
  true,
  'the guarded release action removes an active lease'
);

select is(
  (
    select pg_catalog.count(*)::bigint
    from private.lab_concurrency_leases
    where lease_id = (select lease_id from stage2_lease)
  ),
  0::bigint,
  'a released lease no longer consumes concurrency'
);

insert into private.lab_concurrency_leases (
  client_hash,
  session_hash,
  operation,
  provider_id,
  endpoint_id,
  created_at,
  expires_at
) values
  (
    pg_catalog.repeat('9', 64),
    pg_catalog.repeat('1', 64),
    'provider_catalog',
    '',
    'db-pgtap',
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp() + interval '10 minutes'
  ),
  (
    pg_catalog.repeat('9', 64),
    pg_catalog.repeat('2', 64),
    'provider_catalog',
    '',
    'db-pgtap',
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp() + interval '10 minutes'
  ),
  (
    pg_catalog.repeat('9', 64),
    pg_catalog.repeat('3', 64),
    'provider_catalog',
    '',
    'db-pgtap',
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp() + interval '10 minutes'
  ),
  (
    pg_catalog.repeat('9', 64),
    pg_catalog.repeat('4', 64),
    'provider_catalog',
    '',
    'db-pgtap',
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp() + interval '10 minutes'
  );

create temporary table stage2_lease_denied on commit drop as
select *
from public.acquire_lab_access(
  'provider_catalog',
  null,
  'db-pgtap',
  pg_catalog.repeat('9', 64),
  pg_catalog.repeat('8', 64),
  0,
  'guest',
  'human',
  false,
  true,
  'one-voice-lab-db-test-guard-token-000001'
);

select is(
  (select allowed from stage2_lease_denied),
  false,
  'concurrency admission denies a subject already at its active lease limit'
);

select is(
  (select reason from stage2_lease_denied),
  'concurrency_limit',
  'lease-limit denial uses the structured concurrency_limit reason'
);

select is(
  (
    select pg_catalog.count(*)::bigint
    from private.lab_concurrency_leases
    where client_hash = pg_catalog.repeat('9', 64)
      and expires_at > pg_catalog.clock_timestamp()
  ),
  4::bigint,
  'lease-limit denial does not create a fifth active lease'
);

update private.lab_concurrency_leases
set
  created_at = pg_catalog.clock_timestamp() - interval '2 minutes',
  expires_at = pg_catalog.clock_timestamp() - interval '1 minute'
where client_hash = pg_catalog.repeat('9', 64);

create temporary table stage2_lease_recovered on commit drop as
select *
from public.acquire_lab_access(
  'provider_catalog',
  null,
  'db-pgtap',
  pg_catalog.repeat('9', 64),
  pg_catalog.repeat('8', 64),
  0,
  'guest',
  'human',
  false,
  true,
  'one-voice-lab-db-test-guard-token-000001'
);

select is(
  (select allowed from stage2_lease_recovered),
  true,
  'concurrency admission recovers after prior leases expire'
);

select ok(
  (select lease_id is not null from stage2_lease_recovered),
  'expired-lease recovery returns a fresh lease identifier'
);

select ok(
  (
    select pg_catalog.count(*) = 1
      and pg_catalog.count(*) filter (
        where expires_at > pg_catalog.clock_timestamp()
      ) = 1
    from private.lab_concurrency_leases
    where client_hash = pg_catalog.repeat('9', 64)
  ),
  'expired leases are purged before exactly one replacement lease is admitted'
);

do $$
begin
  perform private.record_lab_access_audit(
    null,
    'guest',
    'unknown',
    'human',
    pg_catalog.repeat('f', 64),
    pg_catalog.repeat('e', 64),
    'feedback_submission',
    '',
    'db-pgtap',
    1,
    false,
    'database_test_denial',
    30,
    false
  );
  perform private.record_lab_access_audit(
    null,
    'guest',
    'unknown',
    'human',
    pg_catalog.repeat('f', 64),
    pg_catalog.repeat('e', 64),
    'feedback_submission',
    '',
    'db-pgtap',
    1,
    false,
    'database_test_denial',
    40,
    true
  );
end;
$$;

select is(
  (
    select pg_catalog.count(*)::bigint
    from private.lab_access_denial_rollups
    where operation = 'feedback_submission'
      and reason = 'database_test_denial'
      and client_bucket = 255
  ),
  1::bigint,
  'repeated denials deduplicate into one bounded rollup key'
);

select is(
  (
    select occurrence_count
    from private.lab_access_denial_rollups
    where operation = 'feedback_submission'
      and reason = 'database_test_denial'
      and client_bucket = 255
  ),
  2::bigint,
  'the bounded denial rollup preserves the exact occurrence count'
);

select is(
  (
    select pg_catalog.count(*)::bigint
    from private.lab_access_audit
    where client_hash = pg_catalog.repeat('f', 64)
      and operation = 'feedback_submission'
      and reason = 'database_test_denial'
      and not allowed
  ),
  1::bigint,
  'repeated same-client denials retain only one detailed sample per hour'
);

select ok(
  pg_catalog.lower(
    pg_catalog.pg_get_functiondef(
      'private.enforce_saved_experiment_quota()'::pg_catalog.regprocedure
    )
  ) like '%one-saved-experiment:%',
  'saved-result quota enforcement uses a user-scoped transaction lock'
);

-- The viewer RPC persists its authoritative post-lock timestamp and rejects
-- the 10,001st event without inserting it.
create temporary table stage2_viewer_event on commit drop as
select public.record_viewer_event(
  'page_view',
  'home',
  null,
  'one-voice-lab-db-test-guard-token-000001'
) as event_id;

select ok(
  (select event_id is not null from stage2_viewer_event),
  'a valid guarded viewer event is accepted'
);

select ok(
  (
    select occurred_at > pg_catalog.clock_timestamp() - interval '5 seconds'
    from public.viewer_events
    where id = (select event_id from stage2_viewer_event)
  ),
  'the accepted viewer event stores its server-authoritative admission timestamp'
);

delete from public.viewer_events;
insert into public.viewer_events (event_name, surface, provider_id, occurred_at)
select
  'page_view',
  'home',
  null,
  pg_catalog.clock_timestamp()
from pg_catalog.generate_series(1, 10000);

select throws_ok(
  $$
    select public.record_viewer_event(
      'page_view',
      'home',
      null,
      'one-voice-lab-db-test-guard-token-000001'
    )
  $$,
  'P0001',
  'Viewer analytics is temporarily at capacity.',
  'viewer-event admission rejects the 10,001st rolling-hour event'
);

select is(
  (select pg_catalog.count(*)::bigint from public.viewer_events),
  10000::bigint,
  'viewer-event denial preserves the exact 10,000-row ceiling'
);

-- Anonymous feedback exercises the guarded write path without exposing or
-- depending on any production credential.
create temporary table stage2_feedback on commit drop as
select public.submit_feedback(
  'yay',
  '   ',
  'typed',
  'home',
  null,
  'one-voice-lab-db-test-guard-token-000001'
) as feedback_id;

select ok(
  (select feedback_id is not null from stage2_feedback),
  'a valid guarded anonymous feedback submission is accepted'
);

select ok(
  (
    select message is null
    from public.feedback_entries
    where id = (select feedback_id from stage2_feedback)
  ),
  'feedback normalizes an empty message to NULL before persistence'
);

delete from public.feedback_entries;
insert into public.feedback_entries (
  sentiment,
  message,
  input_method,
  surface,
  provider_id,
  created_at
)
select
  'yay',
  null,
  'tap',
  'home',
  null,
  pg_catalog.clock_timestamp()
from pg_catalog.generate_series(1, 300);

select throws_ok(
  $$
    select public.submit_feedback(
      'yay',
      null,
      'tap',
      'home',
      null,
      'one-voice-lab-db-test-guard-token-000001'
    )
  $$,
  'P0001',
  'feedback_global_limit',
  'feedback admission rejects the 301st rolling-hour submission'
);

select is(
  (select pg_catalog.count(*)::bigint from public.feedback_entries),
  300::bigint,
  'global feedback denial preserves the exact 300-row ceiling'
);

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
  '20000000-0000-4000-8000-000000000002'::uuid,
  'authenticated',
  'authenticated',
  'stage2-invariants@example.invalid',
  '',
  '{}'::jsonb,
  '{}'::jsonb,
  pg_catalog.clock_timestamp() - interval '1 day',
  pg_catalog.clock_timestamp()
);

do $$
begin
  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    '20000000-0000-4000-8000-000000000002',
    true
  );
  perform pg_catalog.set_config(
    'request.jwt.claims',
    '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',
    true
  );
end;
$$;

select lives_ok(
  $$
    do $body$
    begin
      for item in 1..25 loop
        insert into public.saved_experiments (
          user_id,
          name,
          experiment_type,
          schema_version,
          configuration,
          result
        ) values (
          '20000000-0000-4000-8000-000000000002'::uuid,
          'Database quota test ' || item::text,
          'simulation',
          'one-simulation-experiment-v1',
          '{}'::jsonb,
          null
        );
      end loop;
    end;
    $body$
  $$,
  'the verified saved-result allowance admits exactly 25 inserts'
);

select is(
  (
    select pg_catalog.count(*)::bigint
    from public.saved_experiments
    where user_id = '20000000-0000-4000-8000-000000000002'::uuid
  ),
  25::bigint,
  'all 25 allowed saved results are present'
);

select throws_ok(
  $$
    insert into public.saved_experiments (
      user_id,
      name,
      experiment_type,
      schema_version,
      configuration,
      result
    ) values (
      '20000000-0000-4000-8000-000000000002'::uuid,
      'Database quota test 26',
      'simulation',
      'one-simulation-experiment-v1',
      '{}'::jsonb,
      null
    )
  $$,
  'P0001',
  'Saved experiment allowance reached.',
  'the server trigger rejects the 26th verified saved result'
);

delete from public.feedback_entries;
insert into public.feedback_entries (
  user_id,
  sentiment,
  message,
  input_method,
  surface,
  provider_id,
  created_at
)
select
  '20000000-0000-4000-8000-000000000002'::uuid,
  'yay',
  null,
  'tap',
  'home',
  null,
  pg_catalog.clock_timestamp()
from pg_catalog.generate_series(1, 20);

select throws_ok(
  $$
    select public.submit_feedback(
      'yay',
      null,
      'tap',
      'home',
      null,
      'one-voice-lab-db-test-guard-token-000001'
    )
  $$,
  'P0001',
  'feedback_user_limit',
  'authenticated feedback admission rejects the 21st rolling-hour user submission'
);

select is(
  (
    select pg_catalog.count(*)::bigint
    from public.feedback_entries
    where user_id = '20000000-0000-4000-8000-000000000002'::uuid
  ),
  20::bigint,
  'user feedback denial preserves the exact 20-row ceiling'
);

select * from finish();
rollback;
