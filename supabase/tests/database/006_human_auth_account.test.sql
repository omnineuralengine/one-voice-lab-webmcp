begin;

select plan(32);

select has_table(
  'private', 'guest_account_migrations',
  'guest migration idempotency state is private'
);

select ok(
  (
    select class.relrowsecurity
    from pg_catalog.pg_class class
    join pg_catalog.pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'private' and class.relname = 'guest_account_migrations'
  ),
  'guest migration ledger has RLS enabled as defense in depth'
);

select ok(
  not pg_catalog.has_table_privilege('anon', 'private.guest_account_migrations', 'SELECT,INSERT,UPDATE,DELETE')
  and not pg_catalog.has_table_privilege('authenticated', 'private.guest_account_migrations', 'SELECT,INSERT,UPDATE,DELETE'),
  'browser roles have no direct guest migration ledger access'
);

select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'private'
      and table_name = 'guest_account_migrations'
      and column_name in ('payload', 'email', 'access_token', 'refresh_token')
  ),
  'the migration ledger persists no guest payload, email, or token'
);

select has_function(
  'public', 'claim_one_guest_migration', array['text'],
  'the authenticated device-claim boundary exists'
);

select has_function(
  'public', 'migrate_one_guest_state', array['text', 'jsonb'],
  'the bounded guest migration boundary exists'
);

select ok(
  not pg_catalog.has_function_privilege('anon', 'public.claim_one_guest_migration(text)', 'EXECUTE')
  and not pg_catalog.has_function_privilege('anon', 'public.migrate_one_guest_state(text,jsonb)', 'EXECUTE'),
  'anonymous callers cannot claim or migrate guest state'
);

select ok(
  pg_catalog.has_function_privilege('authenticated', 'public.claim_one_guest_migration(text)', 'EXECUTE')
  and pg_catalog.has_function_privilege('authenticated', 'public.migrate_one_guest_state(text,jsonb)', 'EXECUTE'),
  'authenticated callers reach only identity-deriving migration RPCs'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where procedure.prosecdef
      and procedure.proname in ('claim_one_guest_migration', 'migrate_one_guest_state')
      and not (procedure.proconfig @> array['search_path=""']::text[])
  ),
  'guest migration security-definer functions pin an empty search path'
);

select ok(
  (
    select procedure.pronargs = 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public' and procedure.proname = 'claim_one_guest_migration'
  )
  and (
    select procedure.pronargs = 2
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public' and procedure.proname = 'migrate_one_guest_state'
  ),
  'migration RPCs expose no caller-supplied owner identifier'
);

select pg_catalog.set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000099', true);
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-4000-8000-000000000099","role":"authenticated","is_anonymous":true,"session_id":"anonymous-auth"}',
  true
);
set local role authenticated;

select throws_ok(
  $$select public.claim_one_guest_migration(repeat('f', 64))$$,
  '42501',
  'Verified human authentication is required.',
  'an anonymous-auth JWT cannot claim human guest state'
);

select throws_ok(
  $$select public.migrate_one_guest_state(repeat('f', 64), '{"schemaVersion":"one-guest-state/1.0.0","readUpdateIds":[],"experiments":[]}'::jsonb)$$,
  '42501',
  'Verified human authentication is required.',
  'an anonymous-auth JWT cannot migrate human guest state'
);

reset role;

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '60000000-0000-4000-8000-000000000001'::uuid,
    'authenticated', 'authenticated', 'user-a@example.invalid', '',
    '{}'::jsonb, '{}'::jsonb, pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
  ),
  (
    '60000000-0000-4000-8000-000000000002'::uuid,
    'authenticated', 'authenticated', 'user-b@example.invalid', '',
    '{}'::jsonb, '{}'::jsonb, pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
  );

select pg_catalog.set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000001', true);
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"auth-a","aal":"aal1"}',
  true
);
set local role authenticated;

select is(
  public.claim_one_guest_migration(repeat('a', 64)) ->> 'status',
  'claimed',
  'USER_A claims one opaque device guest state'
);

select is(
  public.claim_one_guest_migration(repeat('a', 64)) ->> 'status',
  'claimed',
  'repeated callback claim is idempotent while migration is pending'
);

select throws_ok(
  $$select public.claim_one_guest_migration('browser-controlled-user-a')$$,
  '22023',
  'Invalid guest migration identity.',
  'malformed device identity fails closed'
);

select throws_ok(
  $$select public.migrate_one_guest_state(repeat('b', 64), '{"schemaVersion":"wrong"}'::jsonb)$$,
  '22023',
  'Invalid guest migration payload.',
  'invalid payload is rejected before state is claimed'
);

reset role;
select is(
  (select pg_catalog.count(*)::integer from private.guest_account_migrations where guest_key_hash = repeat('b', 64)),
  0,
  'failed validation leaves no partial migration receipt'
);
set local role authenticated;

select is(
  public.migrate_one_guest_state(
    repeat('a', 64),
    $json$
    {
      "schemaVersion":"one-guest-state/1.0.0",
      "theme":{"primaryHex":"#2255AA","secondaryHex":"#11AA77","appearance":"dark","reducedMotion":true},
      "labPreferences":{"defaultModule":"/learn"},
      "notificationPreferences":{"inAppEnabled":true,"emailEnabled":false,"newLabs":true,"providerUpdates":false,"simulationUpdates":true,"securityUpdates":true},
      "providerPreferences":{"favoriteProviderIds":["deepgram"],"hiddenProviderIds":[],"preferredProviderOrder":["deepgram"],"defaultSttProviderId":"deepgram","defaultTtsProviderId":null,"preferredComparisonProviderIds":["deepgram"],"preferredDeploymentClass":"hosted","revision":0},
      "readUpdateIds":["020f1f1e-14c8-4f1b-a9e1-0cdcd7a11501"],
      "experiments":[{"id":"guest-run-1","name":"Guest synthetic run","experimentType":"simulation","schemaVersion":"one-simulation-experiment-v1","configuration":{"scenarioId":"tool-call-recovery","templateId":"tool-using-agent","impairment":"none","runCount":1,"provenance":"simulated"},"result":{"fixture":true},"createdAt":"2026-08-29T20:00:00.000Z"}]
    }
    $json$::jsonb
  ) ->> 'status',
  'migrated',
  'USER_A imports the claimed guest state once'
);

select is(
  (select primary_hex || ':' || default_module from public.user_preferences where user_id = '60000000-0000-4000-8000-000000000001'),
  '#2255AA:/learn',
  'bounded theme and Lab preferences become USER_A-owned state'
);

select is(
  (select provider_updates from public.notification_preferences where user_id = '60000000-0000-4000-8000-000000000001'),
  false,
  'bounded notification preferences become USER_A-owned state'
);

select is(
  (select pg_catalog.count(*)::integer from public.user_notification_state where user_id = '60000000-0000-4000-8000-000000000001'),
  1,
  'known notification read state is imported'
);

select is(
  (select pg_catalog.count(*)::integer from public.saved_experiments where user_id = '60000000-0000-4000-8000-000000000001'),
  1,
  'one bounded synthetic experiment is imported'
);

reset role;
select ok(
  exists (
    select 1 from private.guest_account_migrations
    where guest_key_hash = repeat('a', 64)
      and user_id = '60000000-0000-4000-8000-000000000001'
      and status = 'completed'
      and payload_sha256 ~ '^[0-9a-f]{64}$'
      and completed_at is not null
  ),
  'completed receipt retains only bounded counts and an integrity digest'
);
set local role authenticated;

select is(
  public.migrate_one_guest_state(
    repeat('a', 64),
    '{"schemaVersion":"one-guest-state/1.0.0","theme":null,"labPreferences":null,"notificationPreferences":null,"providerPreferences":null,"readUpdateIds":[],"experiments":[]}'::jsonb
  ) ->> 'status',
  'already-migrated',
  'migration replay cannot duplicate imported state'
);

select is(
  public.migrate_one_guest_state(
    repeat('c', 64),
    '{"schemaVersion":"one-guest-state/1.0.0","theme":{"primaryHex":"#FFFFFF","secondaryHex":"#000000","appearance":"light","reducedMotion":false},"labPreferences":null,"notificationPreferences":null,"providerPreferences":null,"readUpdateIds":[],"experiments":[]}'::jsonb
  ) ->> 'status',
  'migrated',
  'a second bounded device import can complete for the same human'
);

select is(
  (select primary_hex from public.user_preferences where user_id = '60000000-0000-4000-8000-000000000001'),
  '#2255AA',
  'later guest migration never silently overwrites existing account preferences'
);

reset role;
select pg_catalog.set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000002', true);
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"auth-b","aal":"aal1"}',
  true
);
set local role authenticated;

select is(
  public.claim_one_guest_migration(repeat('a', 64)) ->> 'status',
  'claimed-by-another-account',
  'USER_B cannot claim USER_A device guest state'
);

select is(
  public.migrate_one_guest_state(
    repeat('a', 64),
    '{"schemaVersion":"one-guest-state/1.0.0","theme":null,"labPreferences":null,"notificationPreferences":null,"providerPreferences":null,"readUpdateIds":[],"experiments":[]}'::jsonb
  ) ->> 'status',
  'claimed-by-another-account',
  'USER_B cannot replay USER_A migration payload'
);

select is(
  (select pg_catalog.count(*)::integer from public.user_preferences where user_id = '60000000-0000-4000-8000-000000000001'),
  0,
  'RLS prevents USER_B reading USER_A preferences'
);

update public.user_preferences set primary_hex = '#FFFFFF'
where user_id = '60000000-0000-4000-8000-000000000001';

select is(
  (select pg_catalog.count(*)::integer from public.user_preferences where primary_hex = '#FFFFFF'),
  0,
  'RLS prevents USER_B mutating USER_A preferences'
);

delete from public.saved_experiments
where user_id = '60000000-0000-4000-8000-000000000001';

select is(
  (select pg_catalog.count(*)::integer from public.saved_experiments where user_id = '60000000-0000-4000-8000-000000000001'),
  0,
  'RLS prevents USER_B deleting USER_A experiments'
);

reset role;
delete from auth.users where id = '60000000-0000-4000-8000-000000000001';

select ok(
  not exists (select 1 from private.guest_account_migrations where user_id = '60000000-0000-4000-8000-000000000001')
  and not exists (select 1 from public.user_preferences where user_id = '60000000-0000-4000-8000-000000000001')
  and not exists (select 1 from public.notification_preferences where user_id = '60000000-0000-4000-8000-000000000001')
  and not exists (select 1 from public.saved_experiments where user_id = '60000000-0000-4000-8000-000000000001'),
  'Auth identity deletion cascades account-owned application and migration state'
);

select * from finish();

rollback;
