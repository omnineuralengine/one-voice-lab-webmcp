begin;

select plan(60);

select has_table(
  'private',
  'provider_runtime_policies',
  'provider runtime policy is private operational state'
);
select has_table(
  'private',
  'provider_capability_policies',
  'provider capability policy is private operational state'
);

select ok(
  (
    select pg_catalog.bool_and(class.relrowsecurity)
    from pg_catalog.pg_class class
    join pg_catalog.pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'private'
      and class.relname in ('provider_runtime_policies', 'provider_capability_policies')
  ),
  'provider operational tables have RLS enabled as defense in depth'
);

select ok(
  not pg_catalog.has_table_privilege(
    'anon', 'private.provider_runtime_policies', 'SELECT,INSERT,UPDATE,DELETE'
  )
  and not pg_catalog.has_table_privilege(
    'authenticated', 'private.provider_runtime_policies', 'SELECT,INSERT,UPDATE,DELETE'
  )
  and not pg_catalog.has_table_privilege(
    'anon', 'private.provider_capability_policies', 'SELECT,INSERT,UPDATE,DELETE'
  )
  and not pg_catalog.has_table_privilege(
    'authenticated', 'private.provider_capability_policies', 'SELECT,INSERT,UPDATE,DELETE'
  ),
  'browser roles have no direct provider operational-table privileges'
);

select has_function(
  'public',
  'read_provider_platform_admin',
  array['text'],
  'the guarded provider-platform administrator reader exists'
);
select has_function(
  'public',
  'update_provider_runtime_policy',
  array['text', 'bigint', 'text', 'text', 'text', 'text', 'text', 'timestamptz', 'text'],
  'the conflict-safe provider runtime policy updater exists'
);
select has_function(
  'public',
  'update_provider_capability_policy',
  array['text', 'text', 'bigint', 'text', 'text', 'text'],
  'the conflict-safe provider capability policy updater exists'
);
select has_function(
  'public',
  'read_provider_platform_public',
  array['text'],
  'the bounded server-guarded provider-platform projection exists'
);
select has_function(
  'public',
  'resolve_provider_runtime_policy',
  array['text', 'text', 'text'],
  'the server-guarded provider policy resolver exists'
);

select ok(
  not pg_catalog.has_function_privilege(
    'anon', 'public.read_provider_platform_admin(text)', 'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'anon',
    'public.update_provider_runtime_policy(text,bigint,text,text,text,text,text,timestamptz,text)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'anon',
    'public.update_provider_capability_policy(text,text,bigint,text,text,text)',
    'EXECUTE'
  ),
  'anonymous callers cannot read or change provider operational state'
);

select ok(
  pg_catalog.has_function_privilege(
    'authenticated', 'public.read_provider_platform_admin(text)', 'EXECUTE'
  )
  and pg_catalog.has_function_privilege(
    'authenticated',
    'public.update_provider_runtime_policy(text,bigint,text,text,text,text,text,timestamptz,text)',
    'EXECUTE'
  )
  and pg_catalog.has_function_privilege(
    'authenticated',
    'public.update_provider_capability_policy(text,text,bigint,text,text,text)',
    'EXECUTE'
  ),
  'authenticated callers can reach only the guarded RPC boundaries'
);

select ok(
  pg_catalog.has_function_privilege(
    'anon', 'public.read_provider_platform_public(text)', 'EXECUTE'
  )
  and pg_catalog.has_function_privilege(
    'anon', 'public.resolve_provider_runtime_policy(text,text,text)', 'EXECUTE'
  ),
  'anonymous sessions can reach only guarded provider-platform RPC boundaries'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where procedure.prosecdef
      and procedure.proname in (
        'provider_policy_actor',
        'record_provider_policy_change',
        'read_provider_platform_public',
        'resolve_provider_runtime_policy',
        'read_provider_platform_admin',
        'update_provider_runtime_policy',
        'update_provider_capability_policy',
        'provider_preference_array_is_valid',
        'validate_provider_preferences'
      )
      and not (procedure.proconfig @> array['search_path=""']::text[])
  ),
  'every provider-platform security-definer function pins an empty search path'
);

update private.lab_runtime_config
set
  token_sha256 = pg_catalog.encode(
    extensions.digest('one-voice-lab-provider-policy-test-0001', 'sha256'),
    'hex'
  ),
  updated_at = pg_catalog.clock_timestamp()
where config_key = 'usage_guard';

select ok(
  public.read_provider_platform_public('one-voice-lab-provider-policy-test-0001')::text
    !~* '(authorization|api[_-]?key|access[_-]?token|secret|cookie|password|updated_by)',
  'the public provider-platform projection contains no credential or private actor fields'
);

select is(
  public.read_provider_platform_public('one-voice-lab-provider-policy-test-0001') ->> 'schemaVersion',
  '1.0.0',
  'the public provider-platform projection is explicitly versioned'
);

select is(
  (
    select pg_catalog.count(*)::integer
    from private.provider_runtime_policies
    where provider_id in ('deepgram', 'elevenlabs', 'fish-audio', 'cartesia')
      and access_mode = 'fixture-only'
      and runtime_status = 'disabled'
      and benchmark_status = 'fixture-only'
  ),
  4,
  'installed providers seed as fixture-only and runtime-disabled'
);

select ok(
  exists (
    select 1
    from private.provider_runtime_policies
    where provider_id = 'reson8'
      and access_mode = 'globally-disabled'
      and runtime_status = 'disabled'
      and benchmark_status = 'ineligible'
  ),
  'Reson8 remains a fail-closed catalog-only policy row'
);

select is(
  (
    select pg_catalog.count(*)::integer
    from private.lab_provider_budgets
    where provider_id = 'reson8'
  ),
  0,
  'Stage 4 does not manufacture a Reson8 spend budget or live path'
);

select ok(
  exists (
    select 1
    from private.provider_runtime_policies
    where provider_id = 'deepeval'
      and access_mode = 'globally-disabled'
      and benchmark_status = 'ineligible'
  ),
  'evaluation interoperability stays cataloged separately and disabled'
);

select col_is_pk(
  'private',
  'provider_runtime_policies',
  'provider_id',
  'provider runtime policy has one conflict-safe row per provider'
);

select has_column(
  'public', 'user_preferences', 'favorite_provider_ids',
  'existing ONE preferences gain bounded provider favorites'
);
select has_column(
  'public', 'user_preferences', 'hidden_provider_ids',
  'existing ONE preferences gain bounded hidden providers'
);
select has_column(
  'public', 'user_preferences', 'preferred_provider_order',
  'existing ONE preferences gain provider ordering'
);
select has_column(
  'public', 'user_preferences', 'default_stt_provider_id',
  'existing ONE preferences gain a default STT provider'
);
select has_column(
  'public', 'user_preferences', 'default_tts_provider_id',
  'existing ONE preferences gain a default TTS provider'
);
select has_column(
  'public', 'user_preferences', 'preferred_comparison_provider_ids',
  'existing ONE preferences gain a bounded comparison set'
);

select throws_ok(
  $$select public.read_provider_platform_public('invalid-guard')$$,
  '42501',
  'Invalid Lab server guard.',
  'the public projection cannot be invoked directly without the server guard'
);

select is(
  public.read_provider_platform_public(
    'one-voice-lab-provider-policy-test-0001'
  ) -> 'providers' -> 0 ->> 'costAdmissionEnabled',
  'false',
  'public readiness remains cost-disabled while Stage 2 provider budgets are disabled'
);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '40000000-0000-4000-8000-000000000001'::uuid,
    'authenticated', 'authenticated', 'provider-admin@example.invalid', '',
    '{}'::jsonb, '{}'::jsonb, pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
  ),
  (
    '40000000-0000-4000-8000-000000000002'::uuid,
    'authenticated', 'authenticated', 'provider-user@example.invalid', '',
    '{}'::jsonb, '{}'::jsonb, pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
  ),
  (
    '40000000-0000-4000-8000-000000000003'::uuid,
    'authenticated', 'authenticated', 'provider-other@example.invalid', '',
    '{}'::jsonb, '{}'::jsonb, pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
  );

insert into private.lab_trust_profiles (
  user_id, tier, status, actor_kind, risk_score
) values (
  '40000000-0000-4000-8000-000000000001'::uuid,
  'admin', 'active', 'human', 0
);

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  '40000000-0000-4000-8000-000000000002',
  true
);
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"provider-user-session"}',
  true
);

select throws_ok(
  $$select public.read_provider_platform_admin('one-voice-lab-provider-policy-test-0001')$$,
  '42501',
  'Active administrator access is required.',
  'a normal authenticated user cannot inspect administrator provider policy'
);

select throws_ok(
  $$
    select public.update_provider_runtime_policy(
      'deepgram', 1, 'cataloged', 'private-testing', 'enabled',
      'private-testing', 'unknown', null,
      'one-voice-lab-provider-policy-test-0001'
    )
  $$,
  '42501',
  'Active administrator access is required.',
  'a normal authenticated user cannot change provider policy'
);

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  '40000000-0000-4000-8000-000000000001',
  true
);
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"provider-admin-session"}',
  true
);

select throws_ok(
  $$select public.read_provider_platform_admin('invalid-guard')$$,
  '42501',
  'Invalid Lab server guard.',
  'administrator policy reads still require the server guard'
);

select throws_ok(
  $$select public.resolve_provider_runtime_policy('deepgram', 'tts.batch', 'invalid-guard')$$,
  '42501',
  'Invalid Lab server guard.',
  'provider invocation policy cannot be resolved without the server guard'
);

select is(
  public.resolve_provider_runtime_policy(
    'deepgram', 'tts.batch', 'one-voice-lab-provider-policy-test-0001'
  ) ->> 'accessMode',
  'fixture-only',
  'installed provider execution remains fixture-only before administrator promotion'
);

select is(
  public.resolve_provider_runtime_policy(
    'not-cataloged', 'tts.batch', 'one-voice-lab-provider-policy-test-0001'
  ) ->> 'accessMode',
  'globally-disabled',
  'unknown providers fail closed at the invocation resolver'
);

select ok(
  pg_catalog.jsonb_array_length(
    public.read_provider_platform_admin(
      'one-voice-lab-provider-policy-test-0001'
    ) -> 'providers'
  ) >= 5,
  'the guarded administrator projection returns bounded safe provider states'
);

select ok(
  public.read_provider_platform_admin(
    'one-voice-lab-provider-policy-test-0001'
  )::text !~* '(authorization|api[_-]?key|access[_-]?token|secret|cookie|password)',
  'the administrator projection contains no credential-shaped fields'
);

select is(
  (
    public.update_provider_runtime_policy(
      'deepgram', 1, 'cataloged', 'private-testing', 'enabled',
      'private-testing', 'unknown', null,
      'one-voice-lab-provider-policy-test-0001'
    ) ->> 'revision'
  )::bigint,
  2::bigint,
  'a matching revision updates provider runtime policy exactly once'
);

select throws_ok(
  $$
    select public.update_provider_runtime_policy(
      'deepgram', 1, 'cataloged', 'private-testing', 'enabled',
      'private-testing', 'unknown', null,
      'one-voice-lab-provider-policy-test-0001'
    )
  $$,
  '40001',
  'Provider runtime policy revision conflict.',
  'a stale concurrent provider policy write fails instead of overwriting'
);

select throws_ok(
  $$
    select public.update_provider_runtime_policy(
      'deepgram', 2, 'cataloged', 'public-use', 'disabled',
      'private-testing', 'unknown', null,
      'one-voice-lab-provider-policy-test-0001'
    )
  $$,
  '22023',
  'Invalid provider runtime policy transition.',
  'an internally contradictory public-use transition fails closed'
);

select throws_ok(
  $$
    select public.update_provider_runtime_policy(
      'not-cataloged', 1, 'cataloged', 'fixture-only', 'disabled',
      'fixture-only', 'unknown', null,
      'one-voice-lab-provider-policy-test-0001'
    )
  $$,
  '22023',
  'Unknown provider policy.',
  'operational state cannot manufacture an uncataloged provider'
);

select is(
  (
    public.update_provider_capability_policy(
      'deepgram', 'tts.batch', 0, 'fixture-only', 'fixture-only',
      'one-voice-lab-provider-policy-test-0001'
    ) ->> 'revision'
  )::bigint,
  1::bigint,
  'an administrator can create one capability-level override with revision one'
);

select throws_ok(
  $$
    select public.update_provider_capability_policy(
      'deepgram', 'tts.batch', 0, 'fixture-only', 'fixture-only',
      'one-voice-lab-provider-policy-test-0001'
    )
  $$,
  '40001',
  'Provider capability policy revision conflict.',
  'concurrent capability creation is protected by a unique compare-and-swap boundary'
);

select throws_ok(
  $$
    select public.update_provider_capability_policy(
      'deepgram', '../unsafe', 0, 'fixture-only', 'fixture-only',
      'one-voice-lab-provider-policy-test-0001'
    )
  $$,
  '22023',
  'Invalid provider capability policy input.',
  'capability identifiers cannot inject untrusted path syntax'
);

select throws_ok(
  $$
    select public.update_provider_capability_policy(
      'deepgram', 'tts.unrecognized', 0, 'fixture-only', 'fixture-only',
      'one-voice-lab-provider-policy-test-0001'
    )
  $$,
  '22023',
  'Invalid provider capability policy input.',
  'capability policy accepts only the canonical normalized capability vocabulary'
);

select is(
  (
    public.update_provider_capability_policy(
      'deepgram', 'tts.batch', 1, 'public-use', 'publicly-ranked',
      'one-voice-lab-provider-policy-test-0001'
    ) ->> 'revision'
  )::bigint,
  2::bigint,
  'an administrator may store a capability preference without widening effective provider policy'
);

select is(
  public.resolve_provider_runtime_policy(
    'deepgram', 'tts.batch', 'one-voice-lab-provider-policy-test-0001'
  ) ->> 'accessMode',
  'private-testing',
  'capability public use cannot widen provider private-testing access'
);

select is(
  public.resolve_provider_runtime_policy(
    'deepgram', 'tts.batch', 'one-voice-lab-provider-policy-test-0001'
  ) ->> 'benchmarkStatus',
  'private-testing',
  'capability public ranking cannot widen provider private-testing benchmark status'
);

select ok(
  exists (
    select 1
    from private.lab_access_audit
    where user_id = '40000000-0000-4000-8000-000000000001'::uuid
      and operation = 'provider_catalog'
      and provider_id = 'deepgram'
      and reason = 'provider_runtime_policy_updated'
      and allowed
  ),
  'provider policy changes use the existing bounded Stage 2 audit lifecycle'
);

select is(
  (
    select pg_catalog.count(*)::integer
    from private.lab_provider_budgets
    where provider_id = 'deepgram'
  ),
  4,
  'provider policy changes do not duplicate or rewrite Stage 2 budgets'
);

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  '40000000-0000-4000-8000-000000000002',
  true
);
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"provider-user-session"}',
  true
);
set local role authenticated;

insert into public.user_preferences (
  user_id,
  favorite_provider_ids,
  hidden_provider_ids,
  preferred_provider_order,
  default_stt_provider_id,
  default_tts_provider_id,
  preferred_comparison_provider_ids,
  preferred_deployment_class,
  provider_preferences_revision
) values (
  '40000000-0000-4000-8000-000000000002'::uuid,
  array['deepgram'],
  array['reson8'],
  array['deepgram', 'elevenlabs'],
  'deepgram',
  'elevenlabs',
  array['deepgram', 'elevenlabs'],
  'hosted',
  999
);

select is(
  (
    select provider_preferences_revision
    from public.user_preferences
    where user_id = '40000000-0000-4000-8000-000000000002'::uuid
  ),
  1::bigint,
  'the server owns the initial provider-preference revision'
);

select is(
  (
    select default_stt_provider_id
    from public.user_preferences
    where user_id = '40000000-0000-4000-8000-000000000002'::uuid
  ),
  'deepgram',
  'an owner can save a canonical provider preference'
);

select throws_ok(
  $$
    update public.user_preferences
    set favorite_provider_ids = array['not-cataloged']
    where user_id = '40000000-0000-4000-8000-000000000002'::uuid
  $$,
  '22023',
  'Invalid provider preferences.',
  'direct Data API writes cannot invent provider IDs'
);

select throws_ok(
  $$
    update public.user_preferences
    set favorite_provider_ids = array['deepgram', 'deepgram']
    where user_id = '40000000-0000-4000-8000-000000000002'::uuid
  $$,
  '22023',
  'Invalid provider preferences.',
  'duplicate provider preferences are rejected'
);

select throws_ok(
  $$
    update public.user_preferences
    set hidden_provider_ids = array['deepgram']
    where user_id = '40000000-0000-4000-8000-000000000002'::uuid
  $$,
  '22023',
  'Invalid provider preferences.',
  'a provider cannot be both favorite and hidden'
);

update public.user_preferences
set
  favorite_provider_ids = array['deepgram', 'cartesia'],
  provider_preferences_revision = 999
where user_id = '40000000-0000-4000-8000-000000000002'::uuid;

select is(
  (
    select provider_preferences_revision
    from public.user_preferences
    where user_id = '40000000-0000-4000-8000-000000000002'::uuid
  ),
  2::bigint,
  'the server increments and protects the provider-preference revision'
);

select is(
  (
    select pg_catalog.cardinality(preferred_comparison_provider_ids)
    from public.user_preferences
    where user_id = '40000000-0000-4000-8000-000000000002'::uuid
  ),
  2,
  'a comparison preference remains bounded and owner-readable'
);

reset role;
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  '40000000-0000-4000-8000-000000000003',
  true
);
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000003","role":"authenticated","session_id":"provider-other-session"}',
  true
);
set local role authenticated;

select is(
  (
    select pg_catalog.count(*)::integer
    from public.user_preferences
    where user_id = '40000000-0000-4000-8000-000000000002'::uuid
  ),
  0,
  'owner RLS prevents another authenticated user reading provider preferences'
);

select throws_ok(
  $$
    insert into public.user_preferences (user_id, favorite_provider_ids)
    values (
      '40000000-0000-4000-8000-000000000002'::uuid,
      array['deepgram']
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "user_preferences"',
  'owner RLS prevents another authenticated user writing provider preferences'
);

reset role;

select is(
  (
    select pg_catalog.count(*)::integer
    from cron.job
    where jobname like '%provider%'
  ),
  0,
  'single-row provider state adds no duplicate polling or retention cron'
);

select ok(
  pg_catalog.pg_get_functiondef(
    'public.update_provider_runtime_policy(text,bigint,text,text,text,text,text,timestamptz,text)'::pg_catalog.regprocedure
  ) like '%policy.revision = p_expected_revision%'
  and pg_catalog.pg_get_functiondef(
    'public.update_provider_capability_policy(text,text,bigint,text,text,text)'::pg_catalog.regprocedure
  ) like '%policy.revision = p_expected_revision%',
  'both administrator update paths enforce compare-and-swap revisions in the database'
);

select * from finish();

rollback;
