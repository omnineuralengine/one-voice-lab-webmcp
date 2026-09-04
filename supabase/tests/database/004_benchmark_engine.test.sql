begin;

select plan(201);

select has_table('private', 'benchmark_methodologies', 'benchmark methodologies are private');
select has_table('private', 'benchmark_suites', 'benchmark suites are private');
select has_table('private', 'benchmark_cases', 'benchmark cases are private');
select has_table('private', 'benchmark_runs', 'benchmark runs are private');
select has_table('private', 'benchmark_run_outputs', 'provider outputs are normalized');
select has_table('private', 'benchmark_measurements', 'measurements are normalized');
select has_table('private', 'benchmark_judgments', 'judgments are normalized');
select has_table('private', 'benchmark_artifact_refs', 'artifact references are normalized');
select has_table('private', 'benchmark_leaderboard_snapshots', 'leaderboard snapshots are normalized');
select has_table('private', 'benchmark_leaderboard_snapshot_entries', 'snapshot entries are normalized');
select has_table('private', 'benchmark_leaderboard_snapshot_sources', 'snapshot sources are normalized and FK-backed');
select has_table('private', 'benchmark_signatures', 'detached signatures are optional normalized records');

select ok(
  (
    select pg_catalog.bool_and(class.relrowsecurity)
    from pg_catalog.pg_class class
    join pg_catalog.pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'private'
      and class.relname like 'benchmark_%'
      and class.relkind = 'r'
  ),
  'every benchmark table has RLS enabled as defense in depth'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_class class
    join pg_catalog.pg_namespace namespace on namespace.oid = class.relnamespace
    join pg_catalog.pg_roles owner_role on owner_role.oid = class.relowner
    where namespace.nspname = 'private'
      and class.relname like 'benchmark_%'
      and class.relkind = 'r'
      and owner_role.rolname <> 'postgres'
  ),
  'postgres owns every authoritative benchmark table'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_class class
    join pg_catalog.pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'private'
      and class.relname like 'benchmark_%'
      and class.relkind = 'r'
      and pg_catalog.has_table_privilege('anon', class.oid, 'SELECT,INSERT,UPDATE,DELETE')
  ),
  'anon has no benchmark table privileges'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_class class
    join pg_catalog.pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'private'
      and class.relname like 'benchmark_%'
      and class.relkind = 'r'
      and pg_catalog.has_table_privilege('authenticated', class.oid, 'SELECT,INSERT,UPDATE,DELETE')
  ),
  'authenticated has no direct benchmark table privileges'
);

select has_function(
  'public',
  'publish_benchmark_run',
  array['uuid', 'text'],
  'the guarded run-publication boundary exists'
);
select has_function(
  'public',
  'publish_benchmark_snapshot',
  array['uuid', 'text'],
  'the guarded snapshot-publication boundary exists'
);
select has_function(
  'public',
  'record_benchmark_signature_verification',
  array['uuid', 'uuid', 'text', 'text', 'text'],
  'the guarded application-signature verification recorder exists'
);
select has_function(
  'public',
  'prepare_benchmark_snapshot_signature',
  array['uuid', 'text'],
  'the guarded canonical snapshot-signing preparation boundary exists'
);
select has_function(
  'public',
  'read_public_benchmark_snapshot',
  array['uuid', 'text'],
  'the sanitized public snapshot reader exists'
);
select has_function(
  'public',
  'read_benchmark_result',
  array['uuid', 'text'],
  'the server-guarded owner or administrator result reader exists'
);
select has_function(
  'public',
  'list_public_benchmark_snapshots',
  array['text', 'integer', 'timestamptz', 'uuid'],
  'the bounded keyset public snapshot listing exists'
);

select ok(
  pg_catalog.to_regprocedure('private.benchmark_snapshot_scope_hashes_valid(uuid)') is not null
  and pg_catalog.pg_get_functiondef(
    'private.benchmark_snapshot_scope_hashes_valid(uuid)'::pg_catalog.regprocedure
  ) like '%snapshot.filters_hash = hashes.value ->> ''filtersHash''%'
  and pg_catalog.pg_get_functiondef(
    'private.benchmark_snapshot_scope_hashes_valid(uuid)'::pg_catalog.regprocedure
  ) like '%snapshot.metric_scope_hash = hashes.value ->> ''metricScopeHash''%'
  and pg_catalog.pg_get_functiondef(
    'private.benchmark_snapshot_scope_hashes_valid(uuid)'::pg_catalog.regprocedure
  ) like '%snapshot.scenario_scope_hash = hashes.value ->> ''scenarioScopeHash''%'
  and pg_catalog.pg_get_functiondef(
    'private.benchmark_snapshot_scope_hashes_valid(uuid)'::pg_catalog.regprocedure
  ) like '%snapshot.population_hash = hashes.value ->> ''populationHash''%'
  and pg_catalog.pg_get_functiondef(
    'public.publish_benchmark_run(uuid,text)'::pg_catalog.regprocedure
  ) like '%private.benchmark_text_sha256(v_case.exact_input_text)%',
  'publication recomputes text-input and all typed snapshot-scope digests'
);

select ok(
  pg_catalog.has_function_privilege(
    'anon',
    'public.read_public_benchmark_snapshot(uuid,text)',
    'EXECUTE'
  ),
  'anon can execute only the sanitized snapshot reader'
);
select ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.read_public_benchmark_snapshot(uuid,text)',
    'EXECUTE'
  ),
  'authenticated can execute the sanitized snapshot reader'
);
select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.read_benchmark_result(uuid,text)',
    'EXECUTE'
  )
  and pg_catalog.has_function_privilege(
    'authenticated',
    'public.read_benchmark_result(uuid,text)',
    'EXECUTE'
  ),
  'private result retrieval is authenticated and remains server-guarded'
);
select ok(
  pg_catalog.has_function_privilege(
    'anon',
    'public.list_public_benchmark_snapshots(text,integer,timestamptz,uuid)',
    'EXECUTE'
  ),
  'anonymous clients can list only bounded verified snapshot metadata'
);
select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.record_benchmark_signature_verification(uuid,uuid,text,text,text)',
    'EXECUTE'
  ),
  'anon cannot record signature verification'
);
select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.prepare_benchmark_snapshot_signature(uuid,text)',
    'EXECUTE'
  ),
  'anon cannot prepare benchmark payloads for signing'
);
select ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.prepare_benchmark_snapshot_signature(uuid,text)',
    'EXECUTE'
  ),
  'authenticated callers reach signing preparation only through guard and admin checks'
);
select ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.record_benchmark_signature_verification(uuid,uuid,text,text,text)',
    'EXECUTE'
  ),
  'authenticated can reach signature verification only through its guard and admin checks'
);
select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.publish_benchmark_run(uuid,text)',
    'EXECUTE'
  ),
  'anon cannot execute run publication'
);
select ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.publish_benchmark_run(uuid,text)',
    'EXECUTE'
  ),
  'authenticated may reach run publication only through its guard and admin checks'
);
select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.publish_benchmark_snapshot(uuid,text)',
    'EXECUTE'
  ),
  'anon cannot execute snapshot publication'
);
select ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.publish_benchmark_snapshot(uuid,text)',
    'EXECUTE'
  ),
  'authenticated may reach snapshot publication only through its guard and admin checks'
);
select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'private.prune_benchmark_history()',
    'EXECUTE'
  ),
  'benchmark lifecycle maintenance is not browser-executable'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where procedure.prosecdef
      and (
        procedure.proname like '%benchmark%'
        or procedure.proname in ('prune_lab_access_history', 'prune_stage2_access_history')
      )
      and not (procedure.proconfig @> array['search_path=""']::text[])
  ),
  'all benchmark security-definer functions pin an empty search path'
);

select is(
  (
    select pg_catalog.count(*)::integer
    from cron.job
    where jobname = 'one-lab-access-history-retention'
      and schedule = '23 * * * *'
      and command like '%private.prune_lab_access_history()%'
  ),
  1,
  'the existing minute-23 lifecycle job remains the sole canonical entry point'
);

select is(
  (
    select pg_catalog.count(*)::integer
    from cron.job
    where jobname like '%benchmark%'
  ),
  0,
  'Stage 3 creates no parallel benchmark cron system'
);

update private.lab_runtime_config
set token_sha256 = pg_catalog.encode(
      extensions.digest('one-voice-lab-benchmark-test-guard-0001', 'sha256'),
      'hex'
    ),
    updated_at = pg_catalog.clock_timestamp()
where config_key = 'usage_guard';

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
  '30000000-0000-4000-8000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'benchmark-admin@example.invalid',
  '',
  '{}'::jsonb,
  '{}'::jsonb,
  pg_catalog.clock_timestamp() - interval '1 day',
  pg_catalog.clock_timestamp()
);

insert into private.lab_trust_profiles (
  user_id,
  tier,
  status,
  actor_kind,
  risk_score
) values (
  '30000000-0000-4000-8000-000000000000'::uuid,
  'admin',
  'active',
  'human',
  0
);

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  '30000000-0000-4000-8000-000000000000',
  true
);
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000000","role":"authenticated"}',
  true
);

insert into private.benchmark_methodologies (
  methodology_id,
  version,
  name,
  description,
  definition,
  content_hash,
  lifecycle_state,
  published_at
) values (
  'one-tts-compare',
  '1.0.0',
  'ONE TTS Compare',
  'Versioned point-in-time provider-neutral TTS comparison.',
  '{"evidenceCategories":["measured","human-rated","model-judged"]}'::jsonb,
  private.benchmark_jsonb_sha256(
    '{"evidenceCategories":["measured","human-rated","model-judged"]}'::jsonb
  ),
  'published',
  pg_catalog.clock_timestamp()
);

insert into private.benchmark_suites (
  id,
  suite_key,
  version,
  methodology_id,
  methodology_version,
  benchmark_category,
  owner_user_id,
  name,
  description,
  language,
  domain,
  dataset_version,
  dataset_license,
  provenance_reference,
  input_manifest_hash,
  privacy_class,
  publication_eligibility,
  expected_output_kind,
  content_hash,
  lifecycle_state
) values (
  '30000000-0000-4000-8000-000000000001'::uuid,
  'tts-canonical',
  '1.0.0',
  'one-tts-compare',
  '1.0.0',
  'tts',
  null,
  'Canonical TTS suite',
  'A bounded canonical comparison suite.',
  'en',
  'customer-support',
  '1.0.0',
  'CC0-1.0',
  'repository:benchmarks/tts-canonical/1.0.0',
  'sha256:' || pg_catalog.repeat('2', 63) || '0',
  'public',
  'eligible',
  'audio',
  'sha256:' || pg_catalog.repeat('2', 64),
  'active'
);

insert into private.benchmark_cases (
  id,
  suite_id,
  case_key,
  version,
  case_kind,
  benchmark_category,
  input_type,
  exact_input_text,
  input_hash,
  language,
  domain,
  privacy_class,
  publication_eligibility,
  source_reference,
  source_verified_at,
  configuration,
  lifecycle_state
) values (
  '30000000-0000-4000-8000-000000000002'::uuid,
  '30000000-0000-4000-8000-000000000001'::uuid,
  'customer-support',
  '1.0.0',
  'canonical',
  'tts',
  'text',
  'Thanks for calling. I can help with that.',
  private.benchmark_text_sha256('Thanks for calling. I can help with that.'),
  'en',
  'customer-support',
  'public',
  'eligible',
  'repository:benchmarks/tts-canonical/customer-support-1.0.0.txt',
  pg_catalog.clock_timestamp() - interval '1 day',
  '{"language":"en"}'::jsonb,
  'active'
);

insert into private.benchmark_cases (
  id,
  suite_id,
  case_key,
  version,
  case_kind,
  benchmark_category,
  input_type,
  exact_input_text,
  input_reference,
  input_hash,
  language,
  domain,
  lifecycle_state
) values
  (
    '30000000-0000-4000-8000-00000000001c'::uuid,
    '30000000-0000-4000-8000-000000000001'::uuid,
    'stt-audio-fixture',
    '1.0.0',
    'canonical',
    'stt',
    'audio',
    null,
    'ephemeral:deterministic-audio-fixture.wav',
    'sha256:' || pg_catalog.repeat('8', 63) || '0',
    'en',
    'transcription',
    'active'
  ),
  (
    '30000000-0000-4000-8000-00000000001d'::uuid,
    '30000000-0000-4000-8000-000000000001'::uuid,
    'realtime-event-fixture',
    '1.0.0',
    'canonical',
    'realtime',
    'event-stream',
    null,
    'ephemeral:deterministic-event-stream',
    'sha256:' || pg_catalog.repeat('8', 63) || '1',
    'en',
    'conversation',
    'active'
  );

select is(
  (select exact_input_text from private.benchmark_cases where id = '30000000-0000-4000-8000-00000000001c'),
  null::text,
  'STT cases do not require persisted raw text or raw audio'
);
select is(
  (select input_reference from private.benchmark_cases where id = '30000000-0000-4000-8000-00000000001c'),
  'ephemeral:deterministic-audio-fixture.wav',
  'STT cases persist only an opaque bounded audio reference'
);
select is(
  (select input_type from private.benchmark_cases where id = '30000000-0000-4000-8000-00000000001d'),
  'event-stream',
  'realtime cases admit deterministic event-stream references'
);

insert into private.benchmark_runs (
  id,
  evaluation_id,
  run_id,
  owner_user_id,
  case_id,
  idempotency_key,
  bundle_hash,
  schema_version,
  methodology_version,
  metric_version,
  benchmark_category,
  evaluation_mode,
  comparability_state,
  execution_mode,
  environment,
  deployment,
  status,
  input_hash,
  integrity_state,
  integrity_checked_at,
  integrity_record_hash,
  consent_publication,
  consent_public_evidence_pool,
  sponsorship_disclosure,
  requested_at,
  completed_at
) values (
  '30000000-0000-4000-8000-000000000003'::uuid,
  '30000000-0000-4000-8000-000000000004'::uuid,
  '30000000-0000-4000-8000-000000000005'::uuid,
  '30000000-0000-4000-8000-000000000000'::uuid,
  '30000000-0000-4000-8000-000000000002'::uuid,
  '30000000-0000-4000-8000-000000000006'::uuid,
  'sha256:' || pg_catalog.repeat('4', 64),
  'one-voice-evidence/1.0.0',
  '1.0.0',
  'one-tts-metrics/1.0.0',
  'tts',
  'standardized',
  'comparable',
  'local-live',
  'database-test',
  'local-development',
  'partial',
  private.benchmark_text_sha256('Thanks for calling. I can help with that.'),
  'hash-verified',
  pg_catalog.clock_timestamp() - interval '500 milliseconds',
  'sha256:' || pg_catalog.repeat('4', 64),
  true,
  true,
  'Compute sponsored by ONE test infrastructure.',
  pg_catalog.clock_timestamp() - interval '2 seconds',
  pg_catalog.clock_timestamp() - interval '1 second'
);

insert into private.benchmark_run_outputs (
  id,
  run_id,
  provider_id,
  provider_display_name,
  provider_readiness,
  model_id,
  model_version,
  voice_id,
  configuration_hash,
  adapter_version,
  provider_configuration,
  output_modality,
  capability,
  transport,
  codec,
  sample_rate_hz,
  channels,
  thermal_state,
  status,
  request_started_at,
  first_output_at,
  first_audio_at,
  completed_at,
  audio_mime_type,
  audio_duration_seconds,
  audio_content_hash,
  output_content_hash,
  blind_label,
  technical_trace,
  sanitized_error,
  technical_detail_expires_at
) values
  (
    '30000000-0000-4000-8000-000000000007'::uuid,
    '30000000-0000-4000-8000-000000000003'::uuid,
    'deepgram',
    'Deepgram',
    'adapter-backed',
    'model-a',
    'model-a/2026-08-01',
    'voice-a',
    private.benchmark_jsonb_sha256('{"lane":"deepgram-a"}'::jsonb),
    'adapter/1.0.0',
    '{"lane":"deepgram-a"}'::jsonb,
    'audio',
    'tts',
    'local',
    'mp3',
    24000,
    1,
    'warm',
    'complete',
    pg_catalog.clock_timestamp() - interval '2 seconds',
    pg_catalog.clock_timestamp() - interval '1.8 seconds',
    pg_catalog.clock_timestamp() - interval '1.8 seconds',
    pg_catalog.clock_timestamp() - interval '1 second',
    'audio/mpeg',
    1.25,
    'sha256:' || pg_catalog.repeat('5', 64),
    'sha256:' || pg_catalog.repeat('6', 64),
    'Voice A',
    '[{"event":"first-audio","observation":"observed"}]'::jsonb,
    '{"code":"sanitized-test"}'::jsonb,
    pg_catalog.clock_timestamp() - interval '1 second'
  ),
  (
    '30000000-0000-4000-8000-000000000008'::uuid,
    '30000000-0000-4000-8000-000000000003'::uuid,
    'elevenlabs',
    'ElevenLabs',
    'adapter-backed',
    'model-b',
    'model-b/2026-08-01',
    'voice-b',
    private.benchmark_jsonb_sha256('{"lane":"elevenlabs-b"}'::jsonb),
    'adapter/1.0.0',
    '{"lane":"elevenlabs-b"}'::jsonb,
    'audio',
    'tts',
    'local',
    'mp3',
    24000,
    1,
    'warm',
    'complete',
    pg_catalog.clock_timestamp() - interval '2 seconds',
    pg_catalog.clock_timestamp() - interval '1.7 seconds',
    pg_catalog.clock_timestamp() - interval '1.7 seconds',
    pg_catalog.clock_timestamp() - interval '1 second',
    'audio/mpeg',
    1.4,
    'sha256:' || pg_catalog.repeat('7', 64),
    'sha256:' || pg_catalog.repeat('8', 64),
    'Voice B',
    '[]'::jsonb,
    null,
    pg_catalog.clock_timestamp() + interval '35 days'
  );

insert into private.benchmark_runs (
  id,
  evaluation_id,
  run_id,
  owner_user_id,
  case_id,
  idempotency_key,
  bundle_hash,
  schema_version,
  methodology_version,
  metric_version,
  benchmark_category,
  evaluation_mode,
  execution_mode,
  environment,
  deployment,
  status,
  input_hash,
  requested_at,
  completed_at
) values (
  '30000000-0000-4000-8000-00000000001e'::uuid,
  '30000000-0000-4000-8000-00000000001f'::uuid,
  '30000000-0000-4000-8000-000000000020'::uuid,
  '30000000-0000-4000-8000-000000000000'::uuid,
  '30000000-0000-4000-8000-00000000001c'::uuid,
  '30000000-0000-4000-8000-000000000021'::uuid,
  'sha256:' || pg_catalog.repeat('8', 63) || '2',
  'one-voice-evidence/1.0.0',
  '1.0.0',
  'one-stt-metrics/1.0.0',
  'stt',
  'standardized',
  'fixture',
  'database-test',
  'local-test-fixture',
  'complete',
  'sha256:' || pg_catalog.repeat('8', 63) || '0',
  pg_catalog.clock_timestamp() - interval '1 second',
  pg_catalog.clock_timestamp()
);

insert into private.benchmark_run_outputs (
  id,
  run_id,
  provider_id,
  provider_display_name,
  provider_readiness,
  model_id,
  model_version,
  voice_id,
  configuration_hash,
  output_modality,
  capability,
  transport,
  codec,
  status,
  output_content_hash
) values (
  '30000000-0000-4000-8000-000000000022'::uuid,
  '30000000-0000-4000-8000-00000000001e'::uuid,
  'deepgram',
  'Deepgram',
  'adapter-backed',
  'deterministic-stt-fixture',
  'fixture/1.0.0',
  null,
  'sha256:' || pg_catalog.repeat('8', 63) || '3',
  'text',
  'stt',
  'fixture',
  null,
  'complete',
  'sha256:' || pg_catalog.repeat('8', 63) || '4'
);

select is(
  (select voice_id from private.benchmark_run_outputs where id = '30000000-0000-4000-8000-000000000022'),
  null::text,
  'STT outputs do not require a voice identifier'
);
select ok(
  (
    select audio_mime_type is null
      and audio_duration_seconds is null
      and audio_content_hash is null
      and first_audio_at is null
    from private.benchmark_run_outputs
    where id = '30000000-0000-4000-8000-000000000022'
  ),
  'non-audio outputs cannot masquerade as audio evidence'
);

insert into private.benchmark_measurements (
  output_id,
  metric_name,
  metric_version,
  metric_value,
  unit,
  availability,
  measurement_point,
  provenance
) values
  (
    '30000000-0000-4000-8000-000000000007'::uuid,
    'time-to-first-audio',
    'one-tts-metrics/1.0.0',
    200,
    'ms',
    'measured',
    'one-server',
    '{"clock":"monotonic","method":"direct","observation":"observed","source":"one-server","sourceSchema":"one-metric-source/1.0.0"}'::jsonb
  ),
  (
    '30000000-0000-4000-8000-000000000008'::uuid,
    'client-time-to-playable',
    'one-tts-metrics/1.0.0',
    310,
    'ms',
    'measured',
    'one-browser',
    '{"clock":"performance.now","observer":"one-browser"}'::jsonb
  ),
  (
    '30000000-0000-4000-8000-000000000008'::uuid,
    'time-to-first-audio',
    'one-tts-metrics/1.0.0',
    230,
    'ms',
    'measured',
    'one-server',
    '{"clock":"monotonic","method":"direct","observation":"observed","source":"one-server","sourceSchema":"one-metric-source/1.0.0"}'::jsonb
  );

insert into private.benchmark_run_outputs (
  id, run_id, provider_id, provider_display_name, provider_readiness,
  model_id, model_version, voice_id, configuration_hash, adapter_version,
  provider_configuration,
  sponsorship_disclosure,
  output_modality, capability, transport, codec, status, failure_code,
  sample_rate_hz, channels, thermal_state,
  request_started_at, first_output_at, first_audio_at, completed_at,
  audio_mime_type, audio_duration_seconds, audio_content_hash, output_content_hash
) values (
  '30000000-0000-4000-8000-000000000024'::uuid,
  '30000000-0000-4000-8000-000000000003'::uuid,
  'fish-audio', 'Fish Audio', 'adapter-backed',
  'model-c', 'model-c/2026-08-01', 'voice-c',
  private.benchmark_jsonb_sha256('{"lane":"fish-c"}'::jsonb), 'adapter/1.0.0',
  '{"lane":"fish-c"}'::jsonb,
  'Compute sponsored by Fish Audio.',
  'audio', 'tts', 'local', 'mp3', 'timed-out', 'provider_timeout',
  24000, 1, 'warm',
  pg_catalog.clock_timestamp() - interval '2 seconds',
  pg_catalog.clock_timestamp() - interval '1.6 seconds',
  pg_catalog.clock_timestamp() - interval '1.6 seconds',
  pg_catalog.clock_timestamp() - interval '1 second',
  'audio/mpeg', 1.3,
  'sha256:' || pg_catalog.repeat('8', 63) || '6',
  'sha256:' || pg_catalog.repeat('8', 63) || '7'
);

insert into private.benchmark_measurements (
  output_id, metric_name, metric_version, metric_value, unit,
  availability, measurement_point, provenance
) values (
  '30000000-0000-4000-8000-000000000024'::uuid,
  'time-to-first-audio', 'one-tts-metrics/1.0.0', 260, 'ms',
  'measured', 'one-server',
  '{"clock":"monotonic","method":"direct","observation":"observed","source":"one-server","sourceSchema":"one-metric-source/1.0.0"}'::jsonb
);

insert into private.benchmark_measurements (
  output_id, metric_name, metric_version, metric_value, unit,
  availability, measurement_point, provenance
) values
  (
    '30000000-0000-4000-8000-000000000007'::uuid,
    'request-success', 'one-tts-metrics/1.0.0', 1, 'boolean',
    'measured', 'one-server',
    '{"clock":"monotonic","method":"direct","observation":"observed","source":"one-server","sourceSchema":"one-metric-source/1.0.0"}'::jsonb
  ),
  (
    '30000000-0000-4000-8000-000000000008'::uuid,
    'request-success', 'one-tts-metrics/1.0.0', 1, 'boolean',
    'measured', 'one-server',
    '{"clock":"monotonic","method":"direct","observation":"observed","source":"one-server","sourceSchema":"one-metric-source/1.0.0"}'::jsonb
  ),
  (
    '30000000-0000-4000-8000-000000000024'::uuid,
    'request-success', 'one-tts-metrics/1.0.0', 0, 'boolean',
    'measured', 'one-server',
    '{"clock":"monotonic","method":"direct","observation":"observed","source":"one-server","sourceSchema":"one-metric-source/1.0.0"}'::jsonb
  );

insert into private.benchmark_judgments (
  id,
  run_id,
  output_id,
  judgment_kind,
  rater_user_id,
  dimension,
  judgment_version,
  score,
  blind_state,
  rated_before_reveal,
  provenance,
  retention_expires_at
) values (
  '30000000-0000-4000-8000-000000000009'::uuid,
  '30000000-0000-4000-8000-000000000003'::uuid,
  '30000000-0000-4000-8000-000000000007'::uuid,
  'human',
  '30000000-0000-4000-8000-000000000000'::uuid,
  'naturalness',
  'human-rating/1.0.0',
  4,
  'blind',
  true,
  '{"source":"one-browser"}'::jsonb,
  pg_catalog.clock_timestamp() - interval '1 second'
);

insert into private.benchmark_judgments (
  id,
  run_id,
  output_id,
  judgment_kind,
  framework_id,
  framework_version,
  framework_configuration_hash,
  dimension,
  judgment_version,
  numeric_value,
  unit,
  threshold,
  rubric_version,
  rubric,
  blind_state,
  rated_before_reveal,
  provenance
) values (
  '30000000-0000-4000-8000-000000000023'::uuid,
  '30000000-0000-4000-8000-00000000001e'::uuid,
  '30000000-0000-4000-8000-000000000022'::uuid,
  'external-framework',
  'deterministic-eval-fixture',
  '1.0.0',
  'sha256:' || pg_catalog.repeat('8', 63) || '5',
  'transcript_accuracy_review',
  'external-judgment/1.0.0',
  0.98,
  'ratio',
  0.95,
  'transcript-review-rubric/1.0.0',
  '{"scale":"0..1","direction":"higher-is-better"}'::jsonb,
  'not-blind',
  false,
  '{"framework":"deterministic-eval-fixture","upload":false}'::jsonb
);

select is(
  (
    select judgment_kind
    from private.benchmark_judgments
    where id = '30000000-0000-4000-8000-000000000023'
  ),
  'external-framework',
  'external-framework judgments retain explicit framework provenance'
);

select is(
  (
    select dimension
    from private.benchmark_judgments
    where id = '30000000-0000-4000-8000-000000000023'
  ),
  'transcript_accuracy_review',
  'judgment dimensions are canonical and not restricted to TTS vocabulary'
);

insert into private.benchmark_judgments (
  id,
  run_id,
  output_id,
  judgment_kind,
  rater_user_id,
  dimension,
  judgment_version,
  preference_selected,
  blind_state,
  rated_before_reveal,
  provenance,
  retention_expires_at
) values (
  '30000000-0000-4000-8000-00000000000a'::uuid,
  '30000000-0000-4000-8000-000000000003'::uuid,
  '30000000-0000-4000-8000-000000000007'::uuid,
  'human',
  '30000000-0000-4000-8000-000000000000'::uuid,
  'overall_preference',
  'human-rating/1.0.0',
  true,
  'blind',
  true,
  '{"source":"one-browser"}'::jsonb,
  pg_catalog.clock_timestamp() - interval '1 second'
);

insert into private.benchmark_artifact_refs (
  id,
  run_id,
  output_id,
  artifact_kind,
  storage_backend,
  object_key,
  mime_type,
  size_bytes,
  content_hash,
  retention_expires_at
) values (
  '30000000-0000-4000-8000-00000000000b'::uuid,
  '30000000-0000-4000-8000-000000000003'::uuid,
  '30000000-0000-4000-8000-000000000007'::uuid,
  'audio',
  'ephemeral',
  'benchmark/30000000/output-a.mp3',
  'audio/mpeg',
  1024,
  'sha256:' || pg_catalog.repeat('9', 64),
  pg_catalog.clock_timestamp() - interval '1 second'
);

select is(
  (select lifecycle_state from private.benchmark_methodologies where methodology_id = 'one-tts-compare'),
  'published',
  'methodology versions preserve explicit lifecycle state'
);
select is(
  (select lifecycle_state from private.benchmark_suites where suite_key = 'tts-canonical'),
  'active',
  'suite versions preserve explicit lifecycle state'
);
select is(
  (select exact_input_text from private.benchmark_cases where case_key = 'customer-support'),
  'Thanks for calling. I can help with that.',
  'the exact bounded canonical input remains private and reproducible'
);
select is(
  (select visibility from private.benchmark_runs where id = '30000000-0000-4000-8000-000000000003'),
  'private',
  'new benchmark runs default to private visibility'
);
select is(
  (select publication_state from private.benchmark_runs where id = '30000000-0000-4000-8000-000000000003'),
  'private',
  'new benchmark runs are not publication-eligible by client assertion'
);
select is(
  (select retention_class from private.benchmark_runs where id = '30000000-0000-4000-8000-000000000003'),
  'private_180d',
  'completed private live evidence receives the 180-day class'
);
select is(
  (select pg_catalog.count(*)::integer from private.benchmark_run_outputs where run_id = '30000000-0000-4000-8000-000000000003'),
  3,
  'provider results are normalized as independent output rows'
);
select is(
  (select pg_catalog.count(distinct measurement_point)::integer from private.benchmark_measurements),
  2,
  'server and browser measurement points remain distinct'
);
select is(
  (select pg_catalog.count(*)::integer from private.benchmark_judgments where judgment_kind = 'human'),
  2,
  'raw human dimensions and preference remain separate records'
);

select ok(
  pg_catalog.pg_get_indexdef('private.benchmark_human_judgment_once_idx'::pg_catalog.regclass)
    like '%run_id, rater_user_id, output_id, dimension, judgment_version%',
  'raw human ratings have a deterministic uniqueness key'
);
select ok(
  pg_catalog.pg_get_indexdef('private.benchmark_human_preference_once_idx'::pg_catalog.regclass)
    like '%run_id, rater_user_id, dimension, judgment_version%',
  'one rater cannot select multiple overall preferences for one run'
);
select ok(
  pg_catalog.pg_get_indexdef('private.benchmark_model_judgment_once_idx'::pg_catalog.regclass)
    like '%judge_model_id%',
  'model judgments have their own non-human uniqueness key'
);
select ok(
  pg_catalog.pg_get_indexdef('private.benchmark_external_judgment_once_idx'::pg_catalog.regclass)
    like '%framework_configuration_hash%',
  'external-framework judgments have an attributable uniqueness key'
);
select is(
  (select storage_backend from private.benchmark_artifact_refs where id = '30000000-0000-4000-8000-00000000000b'),
  'ephemeral',
  'artifact metadata uses an allowlisted opaque storage backend'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'private.benchmark_artifact_refs'::pg_catalog.regclass
      and contype = 'c'
      and pg_catalog.pg_get_constraintdef(oid) like '%transcript%'
      and pg_catalog.pg_get_constraintdef(oid) like '%event-stream%'
  ),
  'artifact references cover transcript and realtime evidence without raw payload columns'
);
select is(
  (
    select pg_catalog.count(*)::integer
    from information_schema.columns
    where table_schema = 'private'
      and table_name like 'benchmark_%'
      and column_name ~ '(api_key|authorization|cookie|password|private_key|raw_audio|internal_url)'
  ),
  0,
  'benchmark tables contain no credential, internal-URL, or raw-audio columns'
);

select throws_ok(
  $$ select public.publish_benchmark_run('30000000-0000-4000-8000-000000000003'::uuid, repeat('x', 32)) $$,
  '42501',
  'Invalid Lab server guard.',
  'run publication rejects an invalid server guard'
);

select throws_like(
  $$ update private.benchmark_cases
     set configuration = '{"apiKey":"must-never-persist"}'::jsonb
     where id = '30000000-0000-4000-8000-000000000002'::uuid $$,
  '%violates check constraint%',
  'case configuration rejects credential-shaped durable data'
);
select throws_like(
  $$ update private.benchmark_runs
     set run_configuration = '{"authorization":"Bearer test"}'::jsonb
     where id = '30000000-0000-4000-8000-000000000003'::uuid $$,
  '%violates check constraint%',
  'run configuration rejects authorization-shaped durable data'
);
select throws_like(
  $$ update private.benchmark_run_outputs
     set provider_configuration = '{"password":"must-never-persist"}'::jsonb
     where id = '30000000-0000-4000-8000-000000000007'::uuid $$,
  '%violates check constraint%',
  'provider configuration rejects credential-shaped durable data'
);
select ok(
  private.benchmark_jsonb_numbers_are_cross_runtime_safe(
    '[0,-0,0.000001,1.25,1.2345678901234567,9007199254740992,100000000000000000000]'::jsonb
  ),
  'cross-runtime configuration numbers accept zero, bounds-safe high-precision JS values, and 1e20'
);
select ok(
  not private.benchmark_jsonb_numbers_are_cross_runtime_safe(
    '[0.0000001,1000000000000000000000]'::jsonb
  ),
  'cross-runtime configuration numbers reject exponent-form boundary mismatches at 1e-7 and 1e21'
);
select is(
  private.canonicalize_benchmark_jsonb('{"a":1,"e":3,"B":2}'::jsonb),
  '{"B":2,"a":1,"e":3}',
  'canonical object keys use the same ASCII byte order as JavaScript UTF-16 sorting'
);
select throws_ok(
  $$ select private.canonicalize_benchmark_jsonb('{"nested":{"é":1}}'::jsonb) $$,
  '22023',
  'Canonical benchmark JSON object keys must be 1-80 printable ASCII characters.',
  'canonical hashing rejects non-ASCII object keys recursively instead of applying database collation'
);
select is(
  (
    select pg_catalog.count(*)::integer
    from pg_catalog.pg_constraint constraint_record
    where constraint_record.conname in (
      'benchmark_methodologies_definition_cross_runtime_numbers_check',
      'benchmark_outputs_configuration_cross_runtime_numbers_check',
      'benchmark_snapshots_filters_cross_runtime_numbers_check'
    )
  ),
  3,
  'every persisted JSON source used by a cross-runtime digest has the numeric safety constraint'
);
select throws_like(
  $$ update private.benchmark_run_outputs
     set provider_configuration = '{"stability":0.0000001}'::jsonb
     where id = '30000000-0000-4000-8000-000000000007'::uuid $$,
  '%benchmark_outputs_configuration_cross_runtime_numbers_check%',
  'provider configuration rejects a numeric value whose JavaScript and PostgreSQL canonical forms diverge'
);
select ok(
  private.is_valid_benchmark_configuration(
    '{"speed":1.25,"labels":["calm",true,null],"enabled":true}'::jsonb
  ),
  'provider configuration accepts the shared shallow typed shape'
);
select ok(
  not private.is_valid_benchmark_configuration(
    '{"advanced":{"speed":1}}'::jsonb
  ),
  'provider configuration rejects nested objects that the typed projection cannot represent'
);
select throws_like(
  $$ update private.benchmark_run_outputs
     set provider_configuration = '{"token":"must-never-persist"}'::jsonb
     where id = '30000000-0000-4000-8000-000000000007'::uuid $$,
  '%benchmark_outputs_configuration_shape_check%',
  'the table boundary rejects a plain token key omitted by the legacy secret pattern'
);
select ok(
  not private.is_valid_benchmark_configuration('{"rawPayload":"private"}'::jsonb)
  and not private.is_valid_benchmark_configuration('{"1invalid":true}'::jsonb),
  'provider configuration rejects raw-payload and non-identifier keys'
);
select ok(
  not private.is_valid_benchmark_configuration(
    pg_catalog.jsonb_build_object(
      'values',
      (select pg_catalog.jsonb_agg(series.value) from pg_catalog.generate_series(1, 41) series(value))
    )
  )
  and not private.is_valid_benchmark_configuration('{"values":[{"nested":true}]}'::jsonb),
  'provider configuration rejects overlong arrays and nested array values'
);
select ok(
  not private.is_valid_benchmark_configuration(
    (
      select pg_catalog.jsonb_object_agg(
        'key' || pg_catalog.lpad(series.value::text, 3, '0'),
        true
      )
      from pg_catalog.generate_series(1, 257) series(value)
    )
  ),
  'provider configuration rejects more than 256 top-level keys'
);
select ok(
  pg_catalog.pg_get_functiondef('public.publish_benchmark_run(uuid,text)'::pg_catalog.regprocedure)
    like '%execution_mode not in (''protected-live'', ''local-live'')%'
  and pg_catalog.pg_get_functiondef('public.publish_benchmark_snapshot(uuid,text)'::pg_catalog.regprocedure)
    like '%execution_mode not in (''protected-live'', ''local-live'')%'
  and pg_catalog.pg_get_functiondef('public.publish_benchmark_snapshot(uuid,text)'::pg_catalog.regprocedure)
    like '%thermal_state = ''unknown''%',
  'imported, fixture, and unknown-thermal evidence remain private-only publication states'
);
select ok(
  pg_catalog.pg_get_functiondef('public.publish_benchmark_run(uuid,text)'::pg_catalog.regprocedure)
    like '%where benchmark_case.id = v_run.case_id%for update%'
  and pg_catalog.pg_get_functiondef('public.publish_benchmark_run(uuid,text)'::pg_catalog.regprocedure)
    like '%where suite.id = v_case.suite_id%for update%'
  and pg_catalog.pg_get_functiondef('public.publish_benchmark_snapshot(uuid,text)'::pg_catalog.regprocedure)
    like '%where benchmark_case.id = v_snapshot.case_id%for update%'
  and pg_catalog.pg_get_functiondef('public.publish_benchmark_snapshot(uuid,text)'::pg_catalog.regprocedure)
    like '%where suite.id = v_case.suite_id%for update%',
  'run and snapshot publication lock catalog rows in the same case, suite, methodology order'
);

update private.benchmark_runs
set visibility = 'team'
where id = '30000000-0000-4000-8000-000000000003';
select is(
  (select visibility from private.benchmark_runs where id = '30000000-0000-4000-8000-000000000003'),
  'team',
  'non-public team visibility remains distinct from public eligibility'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'private.benchmark_runs'::pg_catalog.regclass
      and contype = 'c'
      and pg_catalog.pg_get_constraintdef(oid) like '%public-candidate%'
      and pg_catalog.pg_get_constraintdef(oid) like '%public-verified%'
  ),
  'run visibility reserves unlisted, public-candidate, and public-verified states'
);

update private.benchmark_methodologies
set content_hash = 'sha256:' || pg_catalog.repeat('f', 64)
where methodology_id = 'one-tts-compare' and version = '1.0.0';
select throws_ok(
  $$ select public.publish_benchmark_run(
    '30000000-0000-4000-8000-000000000003'::uuid,
    'one-voice-lab-benchmark-test-guard-0001'
  ) $$,
  '23514',
  'Benchmark run methodology, suite, case, or input is not approved for publication.',
  'run publication rejects a methodology digest that does not match its canonical definition'
);
update private.benchmark_methodologies
set content_hash = private.benchmark_jsonb_sha256(definition)
where methodology_id = 'one-tts-compare' and version = '1.0.0';

update private.benchmark_run_outputs
set configuration_hash = 'sha256:' || pg_catalog.repeat('f', 64)
where id = '30000000-0000-4000-8000-000000000007'::uuid;
select throws_ok(
  $$ select public.publish_benchmark_run(
    '30000000-0000-4000-8000-000000000003'::uuid,
    'one-voice-lab-benchmark-test-guard-0001'
  ) $$,
  '23514',
  'Published benchmark evidence requires 2-4 terminal, attributable outputs with at least one successful measured lane.',
  'run publication rejects a provider configuration digest that does not match its canonical JSON'
);
update private.benchmark_run_outputs
set configuration_hash = private.benchmark_jsonb_sha256(provider_configuration)
where id = '30000000-0000-4000-8000-000000000007'::uuid;

select lives_ok(
  $$ select public.publish_benchmark_run(
    '30000000-0000-4000-8000-000000000003'::uuid,
    'one-voice-lab-benchmark-test-guard-0001'
  ) $$,
  'an active guarded administrator can publish eligible evidence'
);
select is(
  (select visibility from private.benchmark_runs where id = '30000000-0000-4000-8000-000000000003'),
  'public-verified',
  'operator publication makes only the verified run metadata public-eligible'
);
select is(
  (select status from private.benchmark_runs where id = '30000000-0000-4000-8000-000000000003'),
  'partial',
  'verified run metadata preserves the independent timed-out provider lane'
);
select is(
  (select retention_class from private.benchmark_runs where id = '30000000-0000-4000-8000-000000000003'),
  'public_verified',
  'published verified run metadata receives the preservation class'
);
select is(
  (select retention_expires_at from private.benchmark_runs where id = '30000000-0000-4000-8000-000000000003'),
  null::timestamptz,
  'published verified run metadata has no automatic expiry'
);

insert into private.benchmark_runs (
  id, evaluation_id, run_id, owner_user_id, case_id, idempotency_key,
  bundle_hash, schema_version, methodology_version, metric_version,
  benchmark_category, evaluation_mode, comparability_state, execution_mode,
  environment, deployment, status, input_hash, integrity_state,
  integrity_checked_at, integrity_record_hash, consent_publication,
  consent_public_evidence_pool, sponsorship_disclosure, requested_at, completed_at
) values (
  '30000000-0000-4000-8000-000000000027'::uuid,
  '30000000-0000-4000-8000-000000000028'::uuid,
  '30000000-0000-4000-8000-000000000029'::uuid,
  '30000000-0000-4000-8000-000000000000'::uuid,
  '30000000-0000-4000-8000-000000000002'::uuid,
  '30000000-0000-4000-8000-00000000002a'::uuid,
  'sha256:' || pg_catalog.repeat('9', 64),
  'one-voice-evidence/1.0.0', '1.0.0', 'one-tts-metrics/1.0.0',
  'tts', 'standardized', 'comparable', 'local-live',
  'database-test', 'local-development', 'partial',
  private.benchmark_text_sha256('Thanks for calling. I can help with that.'),
  'hash-verified', pg_catalog.clock_timestamp() - interval '300 milliseconds',
  'sha256:' || pg_catalog.repeat('9', 64), true, true,
  'Compute sponsored by ONE test infrastructure.',
  pg_catalog.clock_timestamp() - interval '1500 milliseconds',
  pg_catalog.clock_timestamp() - interval '500 milliseconds'
);

insert into private.benchmark_run_outputs (
  id, run_id, provider_id, provider_display_name, provider_readiness,
  model_id, model_version, voice_id, configuration_hash, adapter_version,
  provider_configuration, output_modality, capability, transport, codec,
  sample_rate_hz, channels, thermal_state, status, failure_code,
  request_started_at, first_output_at, first_audio_at, completed_at,
  audio_mime_type, audio_duration_seconds, audio_content_hash, output_content_hash
) values
  (
    '30000000-0000-4000-8000-00000000002b'::uuid,
    '30000000-0000-4000-8000-000000000027'::uuid,
    'deepgram', 'Deepgram', 'adapter-backed', 'model-a', 'model-a/2026-08-01', 'voice-a',
    private.benchmark_jsonb_sha256('{"lane":"deepgram-a"}'::jsonb),
    'adapter/1.0.0', '{"lane":"deepgram-a"}'::jsonb,
    'audio', 'tts', 'local', 'mp3', 24000, 1, 'warm',
    'timed-out', 'provider_timeout',
    pg_catalog.clock_timestamp() - interval '1500 milliseconds',
    null, null, pg_catalog.clock_timestamp() - interval '500 milliseconds',
    null, null, null, null
  ),
  (
    '30000000-0000-4000-8000-00000000002c'::uuid,
    '30000000-0000-4000-8000-000000000027'::uuid,
    'cartesia', 'Cartesia', 'adapter-backed', 'model-d', 'model-d/2026-08-01', 'voice-d',
    private.benchmark_jsonb_sha256('{"lane":"cartesia-d"}'::jsonb),
    'adapter/1.0.0', '{"lane":"cartesia-d"}'::jsonb,
    'audio', 'tts', 'local', 'mp3', 24000, 1, 'warm',
    'complete', null,
    pg_catalog.clock_timestamp() - interval '1500 milliseconds',
    pg_catalog.clock_timestamp() - interval '1200 milliseconds',
    pg_catalog.clock_timestamp() - interval '1200 milliseconds',
    pg_catalog.clock_timestamp() - interval '500 milliseconds',
    'audio/mpeg', 1.1,
    'sha256:' || pg_catalog.repeat('a', 63) || '7',
    'sha256:' || pg_catalog.repeat('a', 63) || '8'
  ),
  (
    '30000000-0000-4000-8000-00000000002d'::uuid,
    '30000000-0000-4000-8000-000000000027'::uuid,
    'rime', 'Rime', 'adapter-backed', 'model-e', 'model-e/2026-08-01', 'voice-e',
    private.benchmark_jsonb_sha256('{"lane":"predispatch-denial"}'::jsonb),
    'adapter/1.0.0', '{"lane":"predispatch-denial"}'::jsonb,
    'audio', 'tts', 'local', 'mp3', 24000, 1, 'warm',
    'unavailable', 'provider_not_configured',
    null, null, null, pg_catalog.clock_timestamp() - interval '500 milliseconds',
    null, null, null, null
  );

insert into private.benchmark_measurements (
  output_id, metric_name, metric_version, metric_value, unit,
  availability, measurement_point, provenance
) values
  (
    '30000000-0000-4000-8000-00000000002b'::uuid,
    'request-success', 'one-tts-metrics/1.0.0', 0, 'boolean',
    'measured', 'one-server',
    '{"clock":"monotonic","method":"direct","observation":"observed","source":"one-server","sourceSchema":"one-metric-source/1.0.0"}'::jsonb
  ),
  (
    '30000000-0000-4000-8000-00000000002c'::uuid,
    'request-success', 'one-tts-metrics/1.0.0', 1, 'boolean',
    'measured', 'one-server',
    '{"clock":"monotonic","method":"direct","observation":"observed","source":"one-server","sourceSchema":"one-metric-source/1.0.0"}'::jsonb
  ),
  (
    '30000000-0000-4000-8000-00000000002d'::uuid,
    'request-success', 'one-tts-metrics/1.0.0', 0, 'boolean',
    'measured', 'one-server',
    '{"clock":"monotonic","method":"direct","observation":"observed","source":"one-server","sourceSchema":"one-metric-source/1.0.0"}'::jsonb
  );

select lives_ok(
  $$ select public.publish_benchmark_run(
    '30000000-0000-4000-8000-000000000027'::uuid,
    'one-voice-lab-benchmark-test-guard-0001'
  ) $$,
  'a partial repeated run preserves a failed lane for reliability-series evidence'
);

insert into private.benchmark_leaderboard_snapshots (
  id,
  suite_id,
  case_id,
  input_hash,
  methodology_id,
  methodology_version,
  benchmark_category,
  comparison_mode,
  execution_mode,
  environment,
  deployment,
  language,
  region,
  transport,
  codec,
  sample_rate_hz,
  channels,
  thermal_state,
  metric_name,
  metric_version,
  statistic,
  ranking_direction,
  decimal_places,
  unit,
  measurement_point,
  provenance_version,
  provenance,
  provenance_hash,
  minimum_sample_count,
  allow_synthetic,
  freshness_cutoff_at,
  calculation_version,
  eligibility_profile_version,
  scoring_profile_version,
  disclosed_filters,
  filters_hash,
  metric_scope_hash,
  scenario_scope_hash,
  population_hash,
  snapshot_hash,
  source_max_completed_at,
  as_of_at,
  sample_count
) values (
  '30000000-0000-4000-8000-00000000000c'::uuid,
  '30000000-0000-4000-8000-000000000001'::uuid,
  '30000000-0000-4000-8000-000000000002'::uuid,
  private.benchmark_text_sha256('Thanks for calling. I can help with that.'),
  'one-tts-compare',
  '1.0.0',
  'tts',
  'standardized',
  'local-live',
  'database-test',
  'local-development',
  'en',
  null,
  'local',
  'mp3',
  24000,
  1,
  'warm',
  'time-to-first-audio',
  'one-tts-metrics/1.0.0',
  'mean',
  'lower-is-better',
  2,
  'ms',
  'one-server',
  'one-metric-provenance/1.0.0',
  '{"clock":"monotonic","method":"direct","observation":"observed","source":"one-server","sourceSchema":"one-metric-source/1.0.0"}'::jsonb,
  private.benchmark_jsonb_sha256('{"clock":"monotonic","method":"direct","observation":"observed","source":"one-server","sourceSchema":"one-metric-source/1.0.0"}'::jsonb),
  1,
  false,
  pg_catalog.clock_timestamp() - interval '1 day',
  'leaderboard-calculation/1.0.0',
  'leaderboard-eligibility/1.0.0',
  'leaderboard-scoring/1.0.0',
  '{"scenario":"customer-support","minimumSampleCount":1}'::jsonb,
  'sha256:' || pg_catalog.repeat('a', 63) || '1',
  'sha256:' || pg_catalog.repeat('a', 63) || '2',
  'sha256:' || pg_catalog.repeat('a', 63) || '3',
  'sha256:' || pg_catalog.repeat('a', 64),
  'sha256:' || pg_catalog.repeat('b', 64),
  (select completed_at
   from private.benchmark_runs
   where id = '30000000-0000-4000-8000-000000000003'::uuid),
  pg_catalog.clock_timestamp(),
  3
);

select throws_like(
  $$ update private.benchmark_leaderboard_snapshots
     set disclosed_filters = (
       select pg_catalog.jsonb_object_agg(
         'filter' || pg_catalog.lpad(series.value::text, 3, '0'),
         true
       )
       from pg_catalog.generate_series(1, 129) series(value)
     )
     where id = '30000000-0000-4000-8000-00000000000c'::uuid $$,
  '%benchmark_snapshots_filters_key_count_check%',
  'snapshot filters reject more than 128 top-level keys'
);

insert into private.benchmark_leaderboard_snapshot_entries (
  snapshot_id,
  entry_ordinal,
  provider_id,
  provider_display_name,
  provider_readiness,
  adapter_version,
  model_id,
  model_version,
  voice_id,
  configuration_hash,
  capability,
  deployment,
  region,
  transport,
  codec,
  sample_rate_hz,
  channels,
  thermal_state,
  source_status,
  sponsorship_disclosures,
  evidence_category,
  metric_name,
  metric_version,
  statistic,
  metric_value,
  unit,
  measurement_point,
  provenance_version,
  sample_count,
  rank_ordinal,
  tied,
  provenance
) values
  (
    '30000000-0000-4000-8000-00000000000c'::uuid,
    0,
    'deepgram',
    'Deepgram',
    'adapter-backed',
    'adapter/1.0.0',
    'model-a',
    'model-a/2026-08-01',
    'voice-a',
    private.benchmark_jsonb_sha256('{"lane":"deepgram-a"}'::jsonb),
    'tts',
    'local-development',
    null,
    'local',
    'mp3',
    24000,
    1,
    'warm',
    'complete',
    '["Compute sponsored by ONE test infrastructure."]'::jsonb,
    'measured',
    'time-to-first-audio',
    'one-tts-metrics/1.0.0',
    'mean',
    200,
    'ms',
    'one-server',
    'one-metric-provenance/1.0.0',
    1,
    1,
    false,
    '{"clock":"monotonic","method":"direct","observation":"observed","source":"one-server","sourceSchema":"one-metric-source/1.0.0"}'::jsonb
  ),
  (
    '30000000-0000-4000-8000-00000000000c'::uuid,
    1,
    'elevenlabs',
    'ElevenLabs',
    'adapter-backed',
    'adapter/1.0.0',
    'model-b',
    'model-b/2026-08-01',
    'voice-b',
    private.benchmark_jsonb_sha256('{"lane":"elevenlabs-b"}'::jsonb),
    'tts',
    'local-development',
    null,
    'local',
    'mp3',
    24000,
    1,
    'warm',
    'complete',
    '["Compute sponsored by ONE test infrastructure."]'::jsonb,
    'measured',
    'time-to-first-audio',
    'one-tts-metrics/1.0.0',
    'mean',
    230,
    'ms',
    'one-server',
    'one-metric-provenance/1.0.0',
    1,
    2,
    false,
    '{"clock":"monotonic","method":"direct","observation":"observed","source":"one-server","sourceSchema":"one-metric-source/1.0.0"}'::jsonb
  );

insert into private.benchmark_leaderboard_snapshot_entries (
  snapshot_id,
  entry_ordinal,
  provider_id,
  provider_display_name,
  provider_readiness,
  adapter_version,
  model_id,
  model_version,
  voice_id,
  configuration_hash,
  capability,
  deployment,
  region,
  transport,
  codec,
  sample_rate_hz,
  channels,
  thermal_state,
  inclusion_state,
  source_status,
  failure_code,
  exclusion_reason,
  sponsorship_disclosures,
  evidence_category,
  metric_name,
  metric_version,
  statistic,
  metric_value,
  unit,
  measurement_point,
  provenance_version,
  sample_count,
  rank_ordinal,
  tied,
  provenance
) values (
  '30000000-0000-4000-8000-00000000000c'::uuid,
  2,
  'fish-audio',
  'Fish Audio',
  'adapter-backed',
  'adapter/1.0.0',
  'model-c',
  'model-c/2026-08-01',
  'voice-c',
  private.benchmark_jsonb_sha256('{"lane":"fish-c"}'::jsonb),
  'tts',
  'local-development',
  null,
  'local',
  'mp3',
  24000,
  1,
  'warm',
  'excluded',
  'timed-out',
  'provider_timeout',
  'Insufficient repeated samples for this published metric.',
  '["Compute sponsored by Fish Audio.","Compute sponsored by ONE test infrastructure."]'::jsonb,
  'measured',
  'time-to-first-audio',
  'one-tts-metrics/1.0.0',
  'mean',
  null,
  null,
  'one-server',
  'one-metric-provenance/1.0.0',
  0,
  null,
  false,
  '{"clock":"monotonic","method":"direct","observation":"observed","source":"one-server","sourceSchema":"one-metric-source/1.0.0"}'::jsonb
);

insert into private.benchmark_leaderboard_snapshot_sources (
  snapshot_entry_id,
  output_id
)
select entry.id, source.output_id
from private.benchmark_leaderboard_snapshot_entries entry
join (values
  (0, '30000000-0000-4000-8000-000000000007'::uuid),
  (1, '30000000-0000-4000-8000-000000000008'::uuid),
  (2, '30000000-0000-4000-8000-000000000024'::uuid)
) as source(entry_ordinal, output_id)
  on source.entry_ordinal = entry.entry_ordinal
where entry.snapshot_id = '30000000-0000-4000-8000-00000000000c'::uuid;

update private.benchmark_leaderboard_snapshots
set filters_hash = private.benchmark_snapshot_scope_hashes(id) ->> 'filtersHash',
    metric_scope_hash = private.benchmark_snapshot_scope_hashes(id) ->> 'metricScopeHash',
    scenario_scope_hash = private.benchmark_snapshot_scope_hashes(id) ->> 'scenarioScopeHash',
    population_hash = private.benchmark_snapshot_scope_hashes(id) ->> 'populationHash'
where id = '30000000-0000-4000-8000-00000000000c'::uuid;

update private.benchmark_leaderboard_snapshots
set filters_hash = 'sha256:' || pg_catalog.repeat('f', 64)
where id = '30000000-0000-4000-8000-00000000000c'::uuid;
select throws_ok(
  $$ select public.prepare_benchmark_snapshot_signature(
       '30000000-0000-4000-8000-00000000000c'::uuid,
       'one-voice-lab-benchmark-test-guard-0001'
     ) $$,
  '23514',
  'Only a canonical unpublished snapshot can be prepared for signing.',
  'snapshot signing rejects a filters digest that does not match disclosed filters'
);
update private.benchmark_leaderboard_snapshots
set filters_hash = private.benchmark_snapshot_scope_hashes(id) ->> 'filtersHash'
where id = '30000000-0000-4000-8000-00000000000c'::uuid;

update private.benchmark_leaderboard_snapshots
set metric_scope_hash = 'sha256:' || pg_catalog.repeat('f', 64)
where id = '30000000-0000-4000-8000-00000000000c'::uuid;
select throws_ok(
  $$ select public.prepare_benchmark_snapshot_signature(
       '30000000-0000-4000-8000-00000000000c'::uuid,
       'one-voice-lab-benchmark-test-guard-0001'
     ) $$,
  '23514',
  'Only a canonical unpublished snapshot can be prepared for signing.',
  'snapshot signing rejects a metric-scope digest that does not match typed metric fields'
);
update private.benchmark_leaderboard_snapshots
set metric_scope_hash = private.benchmark_snapshot_scope_hashes(id) ->> 'metricScopeHash'
where id = '30000000-0000-4000-8000-00000000000c'::uuid;

update private.benchmark_leaderboard_snapshots
set scenario_scope_hash = 'sha256:' || pg_catalog.repeat('f', 64)
where id = '30000000-0000-4000-8000-00000000000c'::uuid;
select throws_ok(
  $$ select public.prepare_benchmark_snapshot_signature(
       '30000000-0000-4000-8000-00000000000c'::uuid,
       'one-voice-lab-benchmark-test-guard-0001'
     ) $$,
  '23514',
  'Only a canonical unpublished snapshot can be prepared for signing.',
  'snapshot signing rejects a scenario-scope digest that does not match its suite, case, and input'
);
update private.benchmark_leaderboard_snapshots
set scenario_scope_hash = private.benchmark_snapshot_scope_hashes(id) ->> 'scenarioScopeHash'
where id = '30000000-0000-4000-8000-00000000000c'::uuid;

update private.benchmark_leaderboard_snapshots
set population_hash = 'sha256:' || pg_catalog.repeat('f', 64)
where id = '30000000-0000-4000-8000-00000000000c'::uuid;
select throws_ok(
  $$ select public.prepare_benchmark_snapshot_signature(
       '30000000-0000-4000-8000-00000000000c'::uuid,
       'one-voice-lab-benchmark-test-guard-0001'
     ) $$,
  '23514',
  'Only a canonical unpublished snapshot can be prepared for signing.',
  'snapshot signing rejects a population digest that does not match material comparability fields'
);
update private.benchmark_leaderboard_snapshots
set population_hash = private.benchmark_snapshot_scope_hashes(id) ->> 'populationHash'
where id = '30000000-0000-4000-8000-00000000000c'::uuid;

update private.benchmark_leaderboard_snapshot_entries
set provenance = '{"clock":"wall","method":"direct","observation":"observed","source":"one-server","sourceSchema":"one-metric-source/1.0.0"}'::jsonb
where snapshot_id = '30000000-0000-4000-8000-00000000000c'::uuid
  and provider_id = 'deepgram';
select throws_ok(
  $$ select public.prepare_benchmark_snapshot_signature(
       '30000000-0000-4000-8000-00000000000c'::uuid,
       'one-voice-lab-benchmark-test-guard-0001'
     ) $$,
  '23514',
  'Only a canonical unpublished snapshot can be prepared for signing.',
  'snapshot signing rejects aggregate provenance that differs from linked measurement provenance'
);
update private.benchmark_leaderboard_snapshot_entries
set provenance = '{"clock":"monotonic","method":"direct","observation":"observed","source":"one-server","sourceSchema":"one-metric-source/1.0.0"}'::jsonb
where snapshot_id = '30000000-0000-4000-8000-00000000000c'::uuid
  and provider_id = 'deepgram';

update private.benchmark_leaderboard_snapshot_entries
set metric_value = 201
where snapshot_id = '30000000-0000-4000-8000-00000000000c'::uuid
  and provider_id = 'deepgram';
select throws_ok(
  $$ select public.prepare_benchmark_snapshot_signature(
       '30000000-0000-4000-8000-00000000000c'::uuid,
       'one-voice-lab-benchmark-test-guard-0001'
     ) $$,
  '23514',
  'Only a canonical unpublished snapshot can be prepared for signing.',
  'a caller cannot prepare a snapshot with a tampered aggregate value'
);
update private.benchmark_leaderboard_snapshot_entries
set metric_value = 200
where snapshot_id = '30000000-0000-4000-8000-00000000000c'::uuid
  and provider_id = 'deepgram';

update private.benchmark_leaderboard_snapshot_entries
set rank_ordinal = 2
where snapshot_id = '30000000-0000-4000-8000-00000000000c'::uuid
  and provider_id = 'deepgram';
select throws_ok(
  $$ select public.prepare_benchmark_snapshot_signature(
       '30000000-0000-4000-8000-00000000000c'::uuid,
       'one-voice-lab-benchmark-test-guard-0001'
     ) $$,
  '23514',
  'Only a canonical unpublished snapshot can be prepared for signing.',
  'a caller cannot prepare a snapshot with a tampered rank'
);
update private.benchmark_leaderboard_snapshot_entries
set rank_ordinal = 1
where snapshot_id = '30000000-0000-4000-8000-00000000000c'::uuid
  and provider_id = 'deepgram';

select throws_like(
  $$ update private.benchmark_leaderboard_snapshot_entries
     set tie_group = 'rank-1'
     where snapshot_id = '30000000-0000-4000-8000-00000000000c'::uuid
       and provider_id = 'deepgram' $$,
  '%violates check constraint%',
  'a non-tied candidate cannot carry an arbitrary tie group'
);

select throws_like(
  $$ update private.benchmark_leaderboard_snapshot_entries
     set exclusion_reason = 'See https://internal.invalid/details'
     where snapshot_id = '30000000-0000-4000-8000-00000000000c'::uuid
       and provider_id = 'fish-audio' $$,
  '%violates check constraint%',
  'public exclusion reasons reject URLs and unsafe free-form detail'
);

select lives_ok(
  $$ select public.prepare_benchmark_snapshot_signature(
    '30000000-0000-4000-8000-00000000000c'::uuid,
    'one-voice-lab-benchmark-test-guard-0001'
  ) $$,
  'a guarded administrator can materialize the canonical payload digest for signing'
);

insert into private.benchmark_signatures (
  id,
  subject_type,
  subject_key,
  content_hash,
  signature_schema_version,
  payload_schema_version,
  signature_algorithm,
  public_key_id,
  signature_base64,
  signed_at,
  retention_expires_at
) values (
  '30000000-0000-4000-8000-00000000000d'::uuid,
  'leaderboard_snapshot',
  '30000000-0000-4000-8000-00000000000c',
  (select snapshot_hash
   from private.benchmark_leaderboard_snapshots
   where id = '30000000-0000-4000-8000-00000000000c'::uuid),
  'one-benchmark-signature/1.0.0',
  'one-benchmark-db-public-payload/1.0.0',
  'ed25519',
  'one-test-key-v1',
  pg_catalog.repeat('A', 86) || '==',
  pg_catalog.clock_timestamp(),
  pg_catalog.clock_timestamp() + interval '400 days'
);

select is(
  (select publication_state from private.benchmark_leaderboard_snapshots where id = '30000000-0000-4000-8000-00000000000c'),
  'private',
  'new leaderboard snapshots default to private'
);
select is(
  (select retention_class from private.benchmark_leaderboard_snapshots where id = '30000000-0000-4000-8000-00000000000c'),
  'aggregate_400d',
  'unpublished aggregate snapshots receive the 400-day class'
);
select ok(
  exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'private.benchmark_leaderboard_snapshots'::pg_catalog.regclass
      and contype = 'u'
      and pg_catalog.pg_get_constraintdef(oid) like '%snapshot_hash%'
  ),
  'snapshot content hashes are deduplicated by a unique constraint'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'private.benchmark_leaderboard_snapshots'::pg_catalog.regclass
      and contype = 'c'
      and pg_catalog.pg_get_constraintdef(oid) ~* 'authorization'
      and pg_catalog.pg_get_constraintdef(oid) ~* 'internal'
  ),
  'public snapshot filters reject common secret and internal-URL shapes'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'private.benchmark_leaderboard_snapshot_entries'::pg_catalog.regclass
      and contype = 'c'
      and pg_catalog.pg_get_constraintdef(oid) ~* 'authorization'
      and pg_catalog.pg_get_constraintdef(oid) ~* 'internal'
  ),
  'public entry provenance rejects common secret and internal-URL shapes'
);
select ok(
  pg_catalog.pg_get_functiondef('public.publish_benchmark_snapshot(uuid,text)'::pg_catalog.regprocedure)
    like '%entry.sponsorship_disclosures is distinct from%'
  and pg_catalog.pg_get_functiondef('private.is_safe_sponsorship_disclosures(jsonb)'::pg_catalog.regprocedure)
    like '%v_previous >= v_text%'
  and pg_catalog.pg_get_functiondef('private.benchmark_snapshot_public_payload(uuid)'::pg_catalog.regprocedure)
    like '%entry.sponsorship_disclosures%',
  'publication requires sorted, unique, exact run and output sponsorship propagation'
);
select ok(
  exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'private.benchmark_leaderboard_snapshots'::pg_catalog.regclass
      and contype = 'u'
      and pg_catalog.pg_get_constraintdef(oid) like '%source_max_completed_at%'
  ),
  'snapshot scope deduplication does not depend on attacker-chosen as-of timestamps'
);

select throws_ok(
  $$ select public.publish_benchmark_snapshot(
    '30000000-0000-4000-8000-00000000000c'::uuid,
    'one-voice-lab-benchmark-test-guard-0001'
  ) $$,
  '23514',
  'Published benchmark snapshots require signed, fresh, comparable, FK-backed evidence and sufficient samples.',
  'an unverified signature envelope cannot publish a snapshot'
);

select lives_ok(
  $$ select public.record_benchmark_signature_verification(
    '30000000-0000-4000-8000-00000000000d'::uuid,
    '30000000-0000-4000-8000-00000000000c'::uuid,
    'one-application-ed25519-verifier/1.0.0',
    'sha256:' || repeat('b', 63) || '1',
    'one-voice-lab-benchmark-test-guard-0001'
  ) $$,
  'a guarded administrator can record a prior application-side Ed25519 verification'
);
select is(
  (select verification_state from private.benchmark_signatures where id = '30000000-0000-4000-8000-00000000000d'),
  'signature-verified',
  'signature verification is explicit and server-authoritative'
);

select lives_ok(
  $$ select public.publish_benchmark_snapshot(
    '30000000-0000-4000-8000-00000000000c'::uuid,
    'one-voice-lab-benchmark-test-guard-0001'
  ) $$,
  'an active guarded administrator can publish an aggregate snapshot'
);
select is(
  (select publication_state from private.benchmark_leaderboard_snapshots where id = '30000000-0000-4000-8000-00000000000c'),
  'published',
  'snapshot publication is server-authoritative'
);
select isnt(
  public.read_public_benchmark_snapshot('30000000-0000-4000-8000-00000000000c'::uuid, null),
  null::jsonb,
  'the sanitized reader returns a verified published snapshot'
);
select is(
  pg_catalog.jsonb_array_length(
    public.read_public_benchmark_snapshot('30000000-0000-4000-8000-00000000000c'::uuid, null)
      -> 'content' -> 'entries'
  ),
  3,
  'the public projection contains included and explicitly excluded aggregate entries'
);
select is(
  public.read_public_benchmark_snapshot('30000000-0000-4000-8000-00000000000c'::uuid, null)
    -> 'content' -> 'entries' -> 2 ->> 'exclusionReason',
  'Insufficient repeated samples for this published metric.',
  'excluded snapshot candidates retain a disclosed reason without a fake score'
);
select is(
  public.read_public_benchmark_snapshot('30000000-0000-4000-8000-00000000000c'::uuid, null)
    -> 'content' -> 'entries' -> 2 ->> 'sourceStatus',
  'timed-out',
  'public aggregate evidence preserves an excluded provider timeout honestly'
);
select is(
  public.read_public_benchmark_snapshot('30000000-0000-4000-8000-00000000000c'::uuid, null)
    -> 'content' -> 'sponsorshipDisclosures',
  '["Compute sponsored by Fish Audio.","Compute sponsored by ONE test infrastructure."]'::jsonb,
  'the snapshot discloses the exact deduplicated run and provider sponsorships'
);
select is(
  public.read_public_benchmark_snapshot('30000000-0000-4000-8000-00000000000c'::uuid, null)
    -> 'content' -> 'entries' -> 2 -> 'sponsorshipDisclosures',
  '["Compute sponsored by Fish Audio.","Compute sponsored by ONE test infrastructure."]'::jsonb,
  'each candidate preserves its exact applicable run and provider-lane disclosures'
);
select is(
  public.read_public_benchmark_snapshot('30000000-0000-4000-8000-00000000000c'::uuid, null)
    -> 'content' -> 'entries' -> 0 -> 'provenance',
  '{"clock":"monotonic","method":"direct","observation":"observed","source":"one-server","sourceSchema":"one-metric-source/1.0.0"}'::jsonb,
  'the signed public proof exposes the exact bounded provenance crosschecked against source measurements'
);
select is(
  public.read_public_benchmark_snapshot('30000000-0000-4000-8000-00000000000c'::uuid, null)
    -> 'content' -> 'scope' -> 'disclosedFilters',
  '{"scenario":"customer-support","minimumSampleCount":1}'::jsonb,
  'the signed proof discloses the sanitized filters whose canonical digest defines eligibility'
);
select is(
  public.read_public_benchmark_snapshot('30000000-0000-4000-8000-00000000000c'::uuid, null)
    -> 'content' -> 'methodology' ->> 'contentHash',
  (select content_hash from private.benchmark_methodologies
   where methodology_id = 'one-tts-compare' and version = '1.0.0'),
  'the signed proof binds the exact versioned methodology content digest'
);
select is(
  public.read_public_benchmark_snapshot('30000000-0000-4000-8000-00000000000c'::uuid, null)
    -> 'content' -> 'scope' -> 'provenance',
  '{"clock":"monotonic","method":"direct","observation":"observed","source":"one-server","sourceSchema":"one-metric-source/1.0.0"}'::jsonb,
  'the signed metric scope discloses the uniform provenance tuple used by every included source'
);
select is(
  public.read_public_benchmark_snapshot('30000000-0000-4000-8000-00000000000c'::uuid, null)
    ->> 'payloadDigest',
  'sha256:' || pg_catalog.encode(
    extensions.digest(
      public.read_public_benchmark_snapshot('30000000-0000-4000-8000-00000000000c'::uuid, null)
        ->> 'canonicalContent',
      'sha256'
    ),
    'hex'
  ),
  'the anonymous proof exposes the exact canonical bytes bound by its digest'
);
select ok(
  (
    select public_payload is not null
      and public_payload_canonical is not null
      and pg_catalog.octet_length(public_payload_canonical) <= 1048576
    from private.benchmark_leaderboard_snapshots
    where id = '30000000-0000-4000-8000-00000000000c'::uuid
  ),
  'publication materializes one bounded immutable public proof'
);
select is(
  public.read_benchmark_result(
    '30000000-0000-4000-8000-000000000005'::uuid,
    'one-voice-lab-benchmark-test-guard-0001'
  ) -> 'run' ->> 'status',
  'partial',
  'the guarded principal result reader returns normalized private run evidence'
);
select is(
  pg_catalog.jsonb_array_length(
    public.list_public_benchmark_snapshots('tts-canonical', 20, null, null) -> 'items'
  ),
  1,
  'the bounded public listing returns verified snapshot metadata by safe suite key'
);
select is(
  public.list_public_benchmark_snapshots('tts-canonical', 20, null, null)
    -> 'items' -> 0 ->> 'payloadDigest',
  (select snapshot_hash
   from private.benchmark_leaderboard_snapshots
   where id = '30000000-0000-4000-8000-00000000000c'::uuid),
  'public listing metadata points to the exact immutable proof digest'
);
select ok(
  pg_catalog.jsonb_array_length(
    public.list_public_benchmark_snapshots('tts-canonical', 20, null, null)
      -> 'items' -> 0 -> 'sponsorshipDisclosures'
  ) <= 10,
  'public list summaries cap deterministic sponsorship disclosure previews at ten'
);
select is(
  (
    public.list_public_benchmark_snapshots('tts-canonical', 20, null, null)
      -> 'items' -> 0 ->> 'sponsorshipDisclosureCount'
  )::integer,
  2,
  'public list summaries report the exact full-proof sponsorship disclosure count'
);
select throws_ok(
  $$ select public.list_public_benchmark_snapshots(null, 51, null, null) $$,
  '22023',
  'Invalid bounded public benchmark listing request.',
  'the public list rejects an oversized page'
);
select throws_ok(
  $$ select public.list_public_benchmark_snapshots(null, null, null, null) $$,
  '22023',
  'Invalid bounded public benchmark listing request.',
  'the public list rejects an explicit null page limit instead of becoming unbounded'
);
select ok(
  public.read_public_benchmark_snapshot('30000000-0000-4000-8000-00000000000c'::uuid, null)::text
    !~* '"(owner_user_id|rater_user_id|exact_input_text|object_key|technical_trace|sanitized_error|runId|source_output_ids|disclosed_filters)"[[:space:]]*:',
  'the public projection excludes user identity, private input, arbitrary filters, artifact keys, traces, errors, and source IDs'
);
select is(
  pg_catalog.jsonb_array_length(
    public.read_public_benchmark_snapshot('30000000-0000-4000-8000-00000000000c'::uuid, null) -> 'signatures'
  ),
  1,
  'only verified detached signature metadata is publicly projected'
);
select is(
  (
    select retention_expires_at
    from private.benchmark_signatures
    where id = '30000000-0000-4000-8000-00000000000d'
  ),
  null::timestamptz,
  'publishing a verified snapshot preserves its detached signature metadata'
);
select ok(
  (
    select signature_base64 ~ '^[A-Za-z0-9+/]{85}[AQgw]==$'
    from private.benchmark_signatures
    where id = '30000000-0000-4000-8000-00000000000d'
  ),
  'signature storage matches the application Ed25519 standard-base64 envelope'
);
select throws_like(
  $$ insert into private.benchmark_signatures (
       subject_type, subject_key, content_hash, signature_schema_version,
       payload_schema_version, signature_algorithm, public_key_id,
       signature_base64, signed_at
     ) values (
       'run', 'noncanonical-signature-test', 'sha256:' || repeat('c', 64),
       'one-benchmark-signature/1.0.0', 'one-benchmark-run/1.0.0',
       'ed25519', 'noncanonical-test-key', repeat('C', 85) || 'B==',
       pg_catalog.clock_timestamp()
     ) $$,
  '%violates check constraint%',
  'noncanonical alternate Ed25519 base64 encodings are rejected'
);
select is(
  public.read_public_benchmark_snapshot('30000000-0000-4000-8000-00000000000c'::uuid, null)
    -> 'signatures' -> 0 ->> 'payloadSchemaVersion',
  'one-benchmark-db-public-payload/1.0.0',
  'public signature envelopes disclose the exact signed payload schema version'
);
select ok(
  (public.read_public_benchmark_snapshot('30000000-0000-4000-8000-00000000000c'::uuid, null)
    -> 'signatures' -> 0 ? 'signedAt'),
  'public signature envelopes disclose the exact signed timestamp'
);

select throws_ok(
  $$ update private.benchmark_run_outputs
     set run_id = '30000000-0000-4000-8000-00000000001e'::uuid
     where id = '30000000-0000-4000-8000-000000000007'::uuid $$,
  '23514',
  'Benchmark outputs cannot move between runs.',
  'an output cannot move from a published run into another parent'
);
select throws_ok(
  $$ update private.benchmark_judgments
     set run_id = '30000000-0000-4000-8000-00000000001e'::uuid,
         output_id = '30000000-0000-4000-8000-000000000022'::uuid
     where id = '30000000-0000-4000-8000-000000000009'::uuid $$,
  '23514',
  'Benchmark raw evidence cannot move between runs or outputs.',
  'raw judgments cannot move away from a published evidence parent'
);
select throws_ok(
  $$ update private.benchmark_leaderboard_snapshot_entries
     set metric_value = 201
     where snapshot_id = '30000000-0000-4000-8000-00000000000c'::uuid
       and provider_id = 'deepgram' $$,
  '55000',
  'Signed or published benchmark snapshot evidence is immutable.',
  'published snapshot entries cannot be edited after signing'
);
select throws_ok(
  $$ update private.benchmark_leaderboard_snapshot_sources
     set output_id = '30000000-0000-4000-8000-000000000008'::uuid
     where output_id = '30000000-0000-4000-8000-000000000007'::uuid $$,
  '23514',
  'Benchmark snapshot sources are immutable identity links.',
  'published source links cannot be moved to different evidence'
);
select throws_ok(
  $$ update private.benchmark_suites
     set name = 'Rewritten historical suite'
     where id = '30000000-0000-4000-8000-000000000001'::uuid $$,
  '55000',
  'Published benchmark catalog versions are immutable; retire or create a new version.',
  'published catalog metadata cannot rewrite a signed historical payload'
);
select throws_ok(
  $$ update private.benchmark_leaderboard_snapshots
     set public_payload = '{}'::jsonb
     where id = '30000000-0000-4000-8000-00000000000c'::uuid $$,
  '55000',
  'Published benchmark snapshots are immutable; revoke or create a new snapshot.',
  'the materialized public proof cannot change after publication'
);

insert into private.benchmark_run_outputs (
  id, run_id, provider_id, provider_display_name, provider_readiness,
  model_id, model_version, voice_id, configuration_hash,
  output_modality, capability, transport, codec, status
) values (
  '30000000-0000-4000-8000-00000000000e'::uuid,
  '30000000-0000-4000-8000-00000000001e'::uuid,
  'deepgram', 'Deepgram', 'adapter-backed',
  'model-a-v2', 'fixture/2.0.0', null,
  'sha256:' || pg_catalog.repeat('a', 63) || '3',
  'text', 'stt', 'fixture', null, 'complete'
);

select is(
  (
    select pg_catalog.count(*)::integer
    from private.benchmark_run_outputs
    where run_id = '30000000-0000-4000-8000-00000000001e'
      and provider_id = 'deepgram'
  ),
  2,
  'one provider can contribute two distinct model or configuration outputs'
);

select throws_ok(
  $$ insert into private.benchmark_run_outputs (
       run_id, provider_id, provider_display_name, provider_readiness,
       model_id, model_version, voice_id, configuration_hash,
       output_modality, capability, transport, codec, status
     ) values (
       '30000000-0000-4000-8000-00000000001e'::uuid,
       'deepgram', 'Deepgram', 'adapter-backed',
       'model-a-v2', 'fixture/2.0.0', null,
       'sha256:' || repeat('a', 63) || '3',
       'text', 'stt', 'fixture', null, 'complete'
     ) $$,
  '23505',
  'duplicate key value violates unique constraint "benchmark_output_identity_once_idx"',
  'the exact same provider/model/voice/configuration output is rejected'
);

insert into private.benchmark_run_outputs (
  id, run_id, provider_id, provider_display_name, provider_readiness,
  model_id, model_version, voice_id, configuration_hash,
  output_modality, capability, transport, codec, status
) values (
  '30000000-0000-4000-8000-00000000000f'::uuid,
  '30000000-0000-4000-8000-00000000001e'::uuid,
  'cartesia', 'Cartesia', 'adapter-backed',
  'model-d', 'fixture/1.0.0', null,
  'sha256:' || pg_catalog.repeat('a', 63) || '4',
  'text', 'stt', 'fixture', null, 'complete'
);

insert into private.benchmark_run_outputs (
  id, run_id, provider_id, provider_display_name, provider_readiness,
  model_id, model_version, voice_id, configuration_hash,
  output_modality, capability, transport, codec, status
) values (
  '30000000-0000-4000-8000-000000000025'::uuid,
  '30000000-0000-4000-8000-00000000001e'::uuid,
  'fish-audio', 'Fish Audio', 'adapter-backed',
  'model-e', 'fixture/1.0.0', null,
  'sha256:' || pg_catalog.repeat('a', 63) || '5',
  'text', 'stt', 'fixture', null, 'complete'
);

select throws_ok(
  $$ insert into private.benchmark_run_outputs (
       run_id, provider_id, provider_display_name, provider_readiness,
       model_id, model_version, voice_id, configuration_hash,
       output_modality, capability, transport, codec, status
     ) values (
       '30000000-0000-4000-8000-00000000001e'::uuid,
       'provider-five', 'Provider Five', 'adapter-backed',
       'model-f', 'fixture/1.0.0', null,
       'sha256:' || repeat('a', 63) || '6',
       'text', 'stt', 'fixture', null, 'complete'
     ) $$,
  '23514',
  'A benchmark run supports at most four provider outputs.',
  'the output-count invariant holds at the database boundary'
);

select ok(
  pg_catalog.pg_get_functiondef('private.enforce_benchmark_measurement_limit()'::pg_catalog.regprocedure)
    like '%v_count >= 32%',
  'measurement amplification is hard-capped per output'
);
select ok(
  pg_catalog.pg_get_functiondef('private.enforce_benchmark_judgment_limit()'::pg_catalog.regprocedure)
    like '%v_count >= 64%',
  'raw-judgment amplification is hard-capped per run'
);
select ok(
  pg_catalog.pg_get_functiondef('private.enforce_benchmark_artifact_limit()'::pg_catalog.regprocedure)
    like '%v_count >= 16%',
  'artifact-reference amplification is hard-capped per run'
);
select ok(
  pg_catalog.pg_get_functiondef('private.enforce_benchmark_signature_limit()'::pg_catalog.regprocedure)
    like '%v_count >= 8%'
  and pg_catalog.pg_get_functiondef('private.enforce_benchmark_signature_limit()'::pg_catalog.regprocedure)
    like '%pg_advisory_xact_lock%'
  and pg_catalog.pg_get_functiondef('private.enforce_benchmark_signature_limit()'::pg_catalog.regprocedure)
    like '%for update%',
  'signature amplification is transactionally capped per subject'
);
select ok(
  pg_catalog.pg_get_functiondef('private.enforce_benchmark_snapshot_entry_limit()'::pg_catalog.regprocedure)
    like '%v_count >= 100%',
  'snapshot-entry amplification is hard-capped'
);
select ok(
  pg_catalog.pg_get_functiondef('private.benchmark_snapshot_aggregates_valid(uuid)'::pg_catalog.regprocedure)
    like '%percentile_disc(0.95)%'
  and pg_catalog.pg_get_functiondef('private.benchmark_snapshot_aggregates_valid(uuid)'::pg_catalog.regprocedure)
    like '%order by%raw_value%'
  and pg_catalog.pg_get_functiondef('private.benchmark_snapshot_aggregates_valid(uuid)'::pg_catalog.regprocedure)
    like '%canonical_tie_group%',
  'nearest-rank p95 and raw-value rank/tie semantics are enforced server-side'
);
select is(
  (select pg_catalog.percentile_disc(0.95) within group (order by sample.value)
   from pg_catalog.generate_series(1, 20) sample(value)),
  19,
  'the database nearest-rank p95 fixture selects the nineteenth of twenty observations'
);
select is(
  (
    select pg_catalog.string_agg(
      ranked.value::text || ':' || ranked.raw_rank::text,
      ',' order by ranked.value
    )
    from (
      select valueset.value,
        pg_catalog.rank() over (order by valueset.value)::integer as raw_rank
      from (values (200.001::numeric), (200.004::numeric)) valueset(value)
    ) ranked
  ),
  '200.001:1,200.004:2',
  'display rounding cannot create a false tie between distinct raw measurements'
);

select is(
  public.read_public_benchmark_snapshot(null, 'missing-suite'),
  null::jsonb,
  'private or missing snapshots cannot leak through the public reader'
);

insert into private.benchmark_runs (
  id,
  evaluation_id,
  run_id,
  owner_user_id,
  case_id,
  idempotency_key,
  bundle_hash,
  schema_version,
  methodology_version,
  metric_version,
  benchmark_category,
  evaluation_mode,
  execution_mode,
  environment,
  deployment,
  status,
  input_hash,
  created_at
) values
  (
    '30000000-0000-4000-8000-000000000010'::uuid,
    '30000000-0000-4000-8000-000000000011'::uuid,
    '30000000-0000-4000-8000-000000000012'::uuid,
    '30000000-0000-4000-8000-000000000000'::uuid,
    '30000000-0000-4000-8000-000000000002'::uuid,
    '30000000-0000-4000-8000-000000000013'::uuid,
    'sha256:' || pg_catalog.repeat('e', 64),
    'one-voice-evidence/1.0.0',
    '1.0.0',
    'one-tts-metrics/1.0.0',
    'tts',
    'standardized',
    'protected-live',
    'database-test',
    'local-development',
    'failed',
    private.benchmark_text_sha256('Thanks for calling. I can help with that.'),
    pg_catalog.clock_timestamp() - interval '15 days'
  ),
  (
    '30000000-0000-4000-8000-000000000014'::uuid,
    '30000000-0000-4000-8000-000000000015'::uuid,
    '30000000-0000-4000-8000-000000000016'::uuid,
    '30000000-0000-4000-8000-000000000000'::uuid,
    '30000000-0000-4000-8000-000000000002'::uuid,
    '30000000-0000-4000-8000-000000000017'::uuid,
    'sha256:' || pg_catalog.repeat('f', 64),
    'one-voice-evidence/1.0.0',
    '1.0.0',
    'one-tts-metrics/1.0.0',
    'tts',
    'standardized',
    'fixture',
    'database-test',
    'local-test-fixture',
    'complete',
    private.benchmark_text_sha256('Thanks for calling. I can help with that.'),
    pg_catalog.clock_timestamp()
  );

select is(
  (select retention_class from private.benchmark_runs where id = '30000000-0000-4000-8000-000000000010'),
  'ephemeral_14d',
  'failed or abandoned run evidence receives the 14-day class'
);
select is(
  (select retention_class from private.benchmark_runs where id = '30000000-0000-4000-8000-000000000014'),
  'fixture_90d',
  'completed fixture evidence receives the 90-day class'
);
select ok(
  (
    select technical_detail_expires_at - created_at
    from private.benchmark_run_outputs
    where id = '30000000-0000-4000-8000-000000000008'
  ) between interval '34 days 23 hours' and interval '35 days 1 hour',
  'raw technical detail receives the 35-day boundary'
);

insert into private.benchmark_leaderboard_snapshots (
  id,
  suite_id,
  case_id,
  input_hash,
  methodology_id,
  methodology_version,
  benchmark_category,
  comparison_mode,
  execution_mode,
  environment,
  deployment,
  language,
  region,
  transport,
  codec,
  sample_rate_hz,
  channels,
  thermal_state,
  metric_name,
  metric_version,
  statistic,
  ranking_direction,
  decimal_places,
  unit,
  measurement_point,
  provenance_version,
  provenance,
  provenance_hash,
  minimum_sample_count,
  allow_synthetic,
  freshness_cutoff_at,
  calculation_version,
  eligibility_profile_version,
  scoring_profile_version,
  filters_hash,
  metric_scope_hash,
  scenario_scope_hash,
  population_hash,
  snapshot_hash,
  source_max_completed_at,
  as_of_at,
  sample_count,
  retention_expires_at
) values (
  '30000000-0000-4000-8000-000000000018'::uuid,
  '30000000-0000-4000-8000-000000000001'::uuid,
  '30000000-0000-4000-8000-000000000002'::uuid,
  private.benchmark_text_sha256('Thanks for calling. I can help with that.'),
  'one-tts-compare',
  '1.0.0',
  'tts',
  'standardized',
  'local-live',
  'database-test',
  'local-development',
  'en',
  null,
  'local',
  'mp3',
  24000,
  1,
  'unknown',
  'request-success',
  'one-tts-metrics/1.0.0',
  'count',
  'higher-is-better',
  0,
  'boolean',
  'one-server',
  'one-metric-provenance/1.0.0',
  '{"measurementPoint":"one-server"}'::jsonb,
  private.benchmark_jsonb_sha256('{"measurementPoint":"one-server"}'::jsonb),
  1,
  false,
  pg_catalog.clock_timestamp() - interval '1 day',
  'leaderboard-calculation/1.0.0',
  'leaderboard-eligibility/1.0.0',
  'leaderboard-scoring/1.0.0',
  'sha256:' || pg_catalog.repeat('0', 63) || '1',
  'sha256:' || pg_catalog.repeat('0', 63) || '2',
  'sha256:' || pg_catalog.repeat('0', 63) || '3',
  'sha256:' || pg_catalog.repeat('0', 64),
  'sha256:' || pg_catalog.repeat('1', 63) || '0',
  pg_catalog.clock_timestamp() - interval '2 seconds',
  pg_catalog.clock_timestamp() - interval '1 second',
  1,
  pg_catalog.clock_timestamp() - interval '1 second'
);
insert into private.benchmark_leaderboard_snapshot_entries (
  snapshot_id,
  entry_ordinal,
  provider_id,
  provider_display_name,
  provider_readiness,
  adapter_version,
  model_id,
  model_version,
  voice_id,
  configuration_hash,
  capability,
  deployment,
  region,
  transport,
  codec,
  sample_rate_hz,
  channels,
  thermal_state,
  source_status,
  evidence_category,
  metric_name,
  metric_version,
  statistic,
  metric_value,
  unit,
  measurement_point,
  provenance_version,
  sample_count,
  rank_ordinal,
  tied,
  provenance
) values (
  '30000000-0000-4000-8000-000000000018'::uuid,
  0,
  'deepgram',
  'Deepgram',
  'adapter-backed',
  'adapter/1.0.0',
  'model-a',
  'model-a/2026-08-01',
  'voice-a',
  'sha256:' || pg_catalog.repeat('a', 63) || '1',
  'tts',
  'local-development',
  null,
  'local',
  'mp3',
  24000,
  1,
  'unknown',
  'complete',
  'measured',
  'request-success',
  'one-tts-metrics/1.0.0',
  'count',
  1,
  'boolean',
  'one-server',
  'one-metric-provenance/1.0.0',
  1,
  1,
  false,
  '{"measurementPoint":"one-server"}'::jsonb
);

insert into private.benchmark_leaderboard_snapshot_sources (
  snapshot_entry_id,
  output_id
)
select id, '30000000-0000-4000-8000-000000000007'::uuid
from private.benchmark_leaderboard_snapshot_entries
where snapshot_id = '30000000-0000-4000-8000-000000000018'::uuid;

select is(
  (select thermal_state
   from private.benchmark_leaderboard_snapshots
   where id = '30000000-0000-4000-8000-000000000018'::uuid),
  'unknown',
  'private fixture snapshots can preserve the canonical unknown thermal state'
);

insert into private.benchmark_leaderboard_snapshots (
  id, suite_id, case_id, input_hash, methodology_id, methodology_version,
  benchmark_category, comparison_mode, execution_mode, environment, deployment,
  language, region, transport, codec, sample_rate_hz, channels, thermal_state,
  metric_name, metric_version, statistic, ranking_direction, decimal_places, unit,
  measurement_point, provenance_version, provenance, provenance_hash,
  minimum_sample_count, allow_synthetic, freshness_cutoff_at, calculation_version,
  eligibility_profile_version, scoring_profile_version, disclosed_filters,
  filters_hash, metric_scope_hash, scenario_scope_hash, population_hash, snapshot_hash,
  source_max_completed_at, as_of_at, sample_count, retention_expires_at
) values (
  '30000000-0000-4000-8000-000000000026'::uuid,
  '30000000-0000-4000-8000-000000000001'::uuid,
  '30000000-0000-4000-8000-000000000002'::uuid,
  private.benchmark_text_sha256('Thanks for calling. I can help with that.'),
  'one-tts-compare', '1.0.0', 'tts', 'standardized', 'local-live',
  'database-test', 'local-development', 'en', null, 'local', 'mp3', 24000, 1, 'warm',
  'request-success', 'one-tts-metrics/1.0.0', 'mean', 'higher-is-better', 2, 'boolean',
  'one-server', 'one-metric-provenance/1.0.0',
  '{"clock":"monotonic","method":"direct","observation":"observed","source":"one-server","sourceSchema":"one-metric-source/1.0.0"}'::jsonb,
  private.benchmark_jsonb_sha256('{"clock":"monotonic","method":"direct","observation":"observed","source":"one-server","sourceSchema":"one-metric-source/1.0.0"}'::jsonb),
  1, false, pg_catalog.clock_timestamp() - interval '1 day',
  'leaderboard-calculation/1.0.0', 'leaderboard-eligibility/1.0.0',
  'leaderboard-scoring/1.0.0', '{}'::jsonb,
  'sha256:' || pg_catalog.repeat('2', 64),
  'sha256:' || pg_catalog.repeat('3', 64),
  'sha256:' || pg_catalog.repeat('4', 64),
  'sha256:' || pg_catalog.repeat('5', 64),
  'sha256:' || pg_catalog.repeat('6', 64),
  (select pg_catalog.max(completed_at) from private.benchmark_runs
   where id in (
     '30000000-0000-4000-8000-000000000003'::uuid,
     '30000000-0000-4000-8000-000000000027'::uuid
   )),
  pg_catalog.clock_timestamp(), 4, pg_catalog.clock_timestamp() - interval '1 second'
);

insert into private.benchmark_leaderboard_snapshot_entries (
  snapshot_id, entry_ordinal, provider_id, provider_display_name, provider_readiness,
  adapter_version, model_id, model_version, voice_id, configuration_hash, capability,
  deployment, region, transport, codec, sample_rate_hz, channels, thermal_state,
  source_status, failure_code, sponsorship_disclosures, evidence_category,
  metric_name, metric_version, statistic, metric_value, unit, measurement_point,
  provenance_version, sample_count, rank_ordinal, tied, tie_group, provenance
) values
  (
    '30000000-0000-4000-8000-000000000026'::uuid, 0,
    'deepgram', 'Deepgram', 'adapter-backed', 'adapter/1.0.0',
    'model-a', 'model-a/2026-08-01', 'voice-a',
    private.benchmark_jsonb_sha256('{"lane":"deepgram-a"}'::jsonb),
    'tts', 'local-development', null, 'local', 'mp3', 24000, 1, 'warm',
    'mixed', null, '["Compute sponsored by ONE test infrastructure."]'::jsonb,
    'measured', 'request-success', 'one-tts-metrics/1.0.0', 'mean', 0.5, 'boolean',
    'one-server', 'one-metric-provenance/1.0.0', 2, 2, false, null,
    '{"clock":"monotonic","method":"direct","observation":"observed","source":"one-server","sourceSchema":"one-metric-source/1.0.0"}'::jsonb
  ),
  (
    '30000000-0000-4000-8000-000000000026'::uuid, 1,
    'elevenlabs', 'ElevenLabs', 'adapter-backed', 'adapter/1.0.0',
    'model-b', 'model-b/2026-08-01', 'voice-b',
    private.benchmark_jsonb_sha256('{"lane":"elevenlabs-b"}'::jsonb),
    'tts', 'local-development', null, 'local', 'mp3', 24000, 1, 'warm',
    'complete', null, '["Compute sponsored by ONE test infrastructure."]'::jsonb,
    'measured', 'request-success', 'one-tts-metrics/1.0.0', 'mean', 1, 'boolean',
    'one-server', 'one-metric-provenance/1.0.0', 1, 1, false, null,
    '{"clock":"monotonic","method":"direct","observation":"observed","source":"one-server","sourceSchema":"one-metric-source/1.0.0"}'::jsonb
  ),
  (
    '30000000-0000-4000-8000-000000000026'::uuid, 2,
    'fish-audio', 'Fish Audio', 'adapter-backed', 'adapter/1.0.0',
    'model-c', 'model-c/2026-08-01', 'voice-c',
    private.benchmark_jsonb_sha256('{"lane":"fish-c"}'::jsonb),
    'tts', 'local-development', null, 'local', 'mp3', 24000, 1, 'warm',
    'timed-out', 'provider_timeout',
    '["Compute sponsored by Fish Audio.","Compute sponsored by ONE test infrastructure."]'::jsonb,
    'measured', 'request-success', 'one-tts-metrics/1.0.0', 'mean', 0, 'boolean',
    'one-server', 'one-metric-provenance/1.0.0', 1, 3, false, null,
    '{"clock":"wall","method":"direct","observation":"observed","source":"one-server","sourceSchema":"one-metric-source/1.0.0"}'::jsonb
  );

insert into private.benchmark_leaderboard_snapshot_sources (snapshot_entry_id, output_id)
select entry.id, source.output_id
from private.benchmark_leaderboard_snapshot_entries entry
join (values
  (0, '30000000-0000-4000-8000-000000000007'::uuid),
  (0, '30000000-0000-4000-8000-00000000002b'::uuid),
  (1, '30000000-0000-4000-8000-000000000008'::uuid),
  (2, '30000000-0000-4000-8000-000000000024'::uuid)
) source(entry_ordinal, output_id) on source.entry_ordinal = entry.entry_ordinal
where entry.snapshot_id = '30000000-0000-4000-8000-000000000026'::uuid;

update private.benchmark_leaderboard_snapshots
set filters_hash = private.benchmark_snapshot_scope_hashes(id) ->> 'filtersHash',
    metric_scope_hash = private.benchmark_snapshot_scope_hashes(id) ->> 'metricScopeHash',
    scenario_scope_hash = private.benchmark_snapshot_scope_hashes(id) ->> 'scenarioScopeHash',
    population_hash = private.benchmark_snapshot_scope_hashes(id) ->> 'populationHash'
where id = '30000000-0000-4000-8000-000000000026'::uuid;

insert into private.benchmark_leaderboard_snapshot_sources (snapshot_entry_id, output_id)
select entry.id, '30000000-0000-4000-8000-00000000002d'::uuid
from private.benchmark_leaderboard_snapshot_entries entry
where entry.snapshot_id = '30000000-0000-4000-8000-000000000026'::uuid
  and entry.provider_id = 'deepgram';
update private.benchmark_leaderboard_snapshot_entries
set metric_value = 0.33, sample_count = 3
where snapshot_id = '30000000-0000-4000-8000-000000000026'::uuid
  and provider_id = 'deepgram';
update private.benchmark_leaderboard_snapshots
set sample_count = 5
where id = '30000000-0000-4000-8000-000000000026'::uuid;
select throws_ok(
  $$ select public.prepare_benchmark_snapshot_signature(
    '30000000-0000-4000-8000-000000000026'::uuid,
    'one-voice-lab-benchmark-test-guard-0001'
  ) $$,
  '23514',
  'Only a canonical unpublished snapshot can be prepared for signing.',
  'a pre-dispatch configuration denial is excluded from provider request-success reliability'
);
delete from private.benchmark_leaderboard_snapshot_sources source
using private.benchmark_leaderboard_snapshot_entries entry
where source.snapshot_entry_id = entry.id
  and source.output_id = '30000000-0000-4000-8000-00000000002d'::uuid
  and entry.snapshot_id = '30000000-0000-4000-8000-000000000026'::uuid;
update private.benchmark_leaderboard_snapshot_entries
set metric_value = 0.5, sample_count = 2
where snapshot_id = '30000000-0000-4000-8000-000000000026'::uuid
  and provider_id = 'deepgram';
update private.benchmark_leaderboard_snapshots
set sample_count = 4
where id = '30000000-0000-4000-8000-000000000026'::uuid;

select ok(
  private.benchmark_request_outcome_is_provider_attributable(
    'timed-out', 'provider_timeout', pg_catalog.clock_timestamp()
  )
  and private.benchmark_request_outcome_is_provider_attributable(
    'failed', 'provider_rate_limited', pg_catalog.clock_timestamp()
  )
  and private.benchmark_request_outcome_is_provider_attributable(
    'failed', 'provider_malformed_response', pg_catalog.clock_timestamp()
  )
  and not private.benchmark_request_outcome_is_provider_attributable(
    'cancelled', 'cancelled', pg_catalog.clock_timestamp()
  )
  and not private.benchmark_request_outcome_is_provider_attributable(
    'unavailable', 'provider_not_configured', null
  ),
  'only dispatched allowlisted provider outcomes can contribute public reliability zeros'
);

select throws_ok(
  $$ select public.prepare_benchmark_snapshot_signature(
    '30000000-0000-4000-8000-000000000026'::uuid,
    'one-voice-lab-benchmark-test-guard-0001'
  ) $$,
  '23514',
  'Only a canonical unpublished snapshot can be prepared for signing.',
  'mixed measurement provenance cannot enter a canonical reliability snapshot'
);
update private.benchmark_leaderboard_snapshot_entries
set provenance = '{"clock":"monotonic","method":"direct","observation":"observed","source":"one-server","sourceSchema":"one-metric-source/1.0.0"}'::jsonb
where snapshot_id = '30000000-0000-4000-8000-000000000026'::uuid
  and provider_id = 'fish-audio';

select lives_ok(
  $$ select public.prepare_benchmark_snapshot_signature(
    '30000000-0000-4000-8000-000000000026'::uuid,
    'one-voice-lab-benchmark-test-guard-0001'
  ) $$,
  'terminal failure lanes contribute request-success zero without fabricating latency'
);

select is(
  (select metric_value from private.benchmark_leaderboard_snapshot_entries
   where snapshot_id = '30000000-0000-4000-8000-000000000026'::uuid
     and provider_id = 'deepgram'),
  0.5::numeric,
  'one exact provider lane aggregates a complete and timed-out run to mean request success 0.5'
);
select is(
  (select sample_count from private.benchmark_leaderboard_snapshot_entries
   where snapshot_id = '30000000-0000-4000-8000-000000000026'::uuid
     and provider_id = 'deepgram'),
  2,
  'the reliability candidate preserves both repeated source samples'
);
select is(
  (select source_status from private.benchmark_leaderboard_snapshot_entries
   where snapshot_id = '30000000-0000-4000-8000-000000000026'::uuid
     and provider_id = 'deepgram'),
  'mixed',
  'the candidate exposes a derived mixed terminal-status summary'
);
select is(
  (
    select pg_catalog.string_agg(source.source_status || ':' || source_count::text, '|' order by source.source_status)
    from (
      select snapshot_source.source_status, pg_catalog.count(*)::integer as source_count
      from private.benchmark_leaderboard_snapshot_sources snapshot_source
      join private.benchmark_leaderboard_snapshot_entries entry
        on entry.id = snapshot_source.snapshot_entry_id
      where entry.snapshot_id = '30000000-0000-4000-8000-000000000026'::uuid
        and entry.provider_id = 'deepgram'
      group by snapshot_source.source_status
    ) source
  ),
  'complete:1|timed-out:1',
  'each repeated source retains its independently bound terminal outcome'
);

select throws_like(
  $$ update private.benchmark_leaderboard_snapshot_entries
     set metric_name = 'time-to-first-audio', unit = 'ms', metric_value = 260
     where snapshot_id = '30000000-0000-4000-8000-000000000026'::uuid
       and provider_id = 'fish-audio' $$,
  '%violates check constraint%',
  'a failed terminal lane cannot be admitted as available latency evidence'
);

select ok(
  pg_catalog.pg_get_functiondef('public.publish_benchmark_snapshot(uuid,text)'::pg_catalog.regprocedure)
    like '%entry.metric_name = ''request-success''%'
  and pg_catalog.pg_get_functiondef('public.publish_benchmark_snapshot(uuid,text)'::pg_catalog.regprocedure)
    like '%measurement.metric_value = case%output.status = ''complete'' then 1 else 0 end%',
  'publication admits failure lanes only for canonical request-success measurements'
);

insert into private.benchmark_signatures (
  id,
  subject_type,
  subject_key,
  content_hash,
  signature_schema_version,
  payload_schema_version,
  signature_algorithm,
  public_key_id,
  signature_base64,
  signed_at,
  retention_expires_at
) values (
  '30000000-0000-4000-8000-000000000019'::uuid,
  'run',
  '30000000-0000-4000-8000-000000000010',
  'sha256:' || pg_catalog.repeat('e', 64),
  'one-benchmark-signature/1.0.0',
  'one-benchmark-run/1.0.0',
  'ed25519',
  'expired-test-key',
  pg_catalog.repeat('B', 85) || 'A==',
  pg_catalog.clock_timestamp() - interval '401 days',
  pg_catalog.clock_timestamp() - interval '1 second'
);

insert into private.benchmark_methodologies (
  methodology_id,
  version,
  name,
  description,
  content_hash,
  retention_expires_at
) values (
  'expired-methodology',
  '1.0.0',
  'Expired methodology',
  'Unreferenced database retention fixture.',
  'sha256:' || pg_catalog.repeat('5', 63) || '0',
  pg_catalog.clock_timestamp() - interval '1 second'
);
insert into private.benchmark_suites (
  id,
  suite_key,
  version,
  methodology_id,
  methodology_version,
  benchmark_category,
  name,
  description,
  language,
  domain,
  dataset_version,
  dataset_license,
  provenance_reference,
  input_manifest_hash,
  expected_output_kind,
  content_hash,
  retention_expires_at
) values (
  '30000000-0000-4000-8000-00000000001a'::uuid,
  'expired-suite',
  '1.0.0',
  'expired-methodology',
  '1.0.0',
  'tts',
  'Expired suite',
  'Unreferenced database retention fixture.',
  'en',
  'retention',
  '1.0.0',
  'CC0-1.0',
  'fixture:expired-suite',
  'sha256:' || pg_catalog.repeat('6', 63) || '1',
  'audio',
  'sha256:' || pg_catalog.repeat('6', 63) || '0',
  pg_catalog.clock_timestamp() - interval '1 second'
);
insert into private.benchmark_cases (
  id,
  suite_id,
  case_key,
  version,
  benchmark_category,
  input_type,
  exact_input_text,
  input_hash,
  language,
  domain,
  retention_expires_at
) values (
  '30000000-0000-4000-8000-00000000001b'::uuid,
  '30000000-0000-4000-8000-00000000001a'::uuid,
  'expired-case',
  '1.0.0',
  'tts',
  'text',
  'Expired private input.',
  'sha256:' || pg_catalog.repeat('7', 63) || '0',
  'en',
  'retention',
  pg_catalog.clock_timestamp() - interval '1 second'
);

create temporary table benchmark_prune_first on commit drop as
select private.prune_lab_access_history() as payload;

select ok(
  (select payload ? 'viewerRowsAggregatedAndDeleted' from benchmark_prune_first)
  and (select payload ? 'benchmark' from benchmark_prune_first),
  'the sole lifecycle wrapper preserves Stage 2 result fields and adds benchmark counts'
);
select is(
  (select technical_trace from private.benchmark_run_outputs where id = '30000000-0000-4000-8000-000000000007'),
  '[]'::jsonb,
  '35-day technical traces are redacted rather than retaining raw detail'
);
select is(
  (select sanitized_error from private.benchmark_run_outputs where id = '30000000-0000-4000-8000-000000000007'),
  null::jsonb,
  '35-day sanitized error detail is redacted'
);
select is(
  (select pg_catalog.count(*)::integer from private.benchmark_artifact_refs where id = '30000000-0000-4000-8000-00000000000b'),
  0,
  'raw artifact references expire even when verified metadata is preserved'
);
select is(
  (select pg_catalog.count(*)::integer from private.benchmark_judgments where run_id = '30000000-0000-4000-8000-000000000003'),
  0,
  'raw human judgments expire independently from public aggregate evidence'
);
select is(
  (select pg_catalog.count(*)::integer from private.benchmark_runs where id = '30000000-0000-4000-8000-000000000003'),
  1,
  'verified public run metadata is preserved'
);
select is(
  (select pg_catalog.count(*)::integer from private.benchmark_leaderboard_snapshots where id = '30000000-0000-4000-8000-00000000000c'),
  1,
  'verified public snapshots are preserved'
);
select is(
  (select pg_catalog.count(*)::integer from private.benchmark_leaderboard_snapshots where id = '30000000-0000-4000-8000-000000000018'),
  0,
  'expired private aggregate snapshots are removed'
);
select is(
  (select pg_catalog.count(*)::integer from private.benchmark_leaderboard_snapshot_entries where snapshot_id = '30000000-0000-4000-8000-000000000018'),
  0,
  'expired private snapshot entries are removed before their parent'
);
select is(
  (select pg_catalog.count(*)::integer from private.benchmark_signatures where id = '30000000-0000-4000-8000-000000000019'),
  0,
  'expired non-public signatures are removed'
);
select is(
  (select pg_catalog.count(*)::integer from private.benchmark_runs where id = '30000000-0000-4000-8000-000000000010'),
  0,
  'expired 14-day failed runs are removed'
);
select is(
  (select pg_catalog.count(*)::integer from private.benchmark_cases where id = '30000000-0000-4000-8000-00000000001b'),
  0,
  'expired unreferenced cases are removed'
);
select is(
  (select pg_catalog.count(*)::integer from private.benchmark_suites where id = '30000000-0000-4000-8000-00000000001a'),
  0,
  'expired unreferenced suites are removed after cases'
);
select is(
  (select pg_catalog.count(*)::integer from private.benchmark_methodologies where methodology_id = 'expired-methodology'),
  0,
  'expired unreferenced methodologies are removed after suites'
);
select is(
  (select (payload -> 'benchmark' ->> 'batchSize')::integer from benchmark_prune_first),
  5000,
  'benchmark lifecycle statements retain the 5,000-row batch bound'
);
select is(
  (select (payload -> 'benchmark' ->> 'maxBatchesPerPath')::integer from benchmark_prune_first),
  4,
  'benchmark lifecycle paths retain the four-batch invocation bound'
);

create temporary table benchmark_prune_second on commit drop as
select private.prune_lab_access_history() as payload;
select is(
  (select (payload -> 'benchmark' ->> 'artifactReferencesDeleted')::integer from benchmark_prune_second),
  0,
  'benchmark cleanup is idempotent for artifact references'
);
select is(
  (select (payload -> 'benchmark' ->> 'rawJudgmentsDeleted')::integer from benchmark_prune_second),
  0,
  'benchmark cleanup is idempotent for raw judgments'
);
select is(
  (select (payload -> 'benchmark' ->> 'runsDeleted')::integer from benchmark_prune_second),
  0,
  'benchmark cleanup is idempotent for runs'
);
select ok(
  pg_catalog.pg_get_functiondef('private.prune_benchmark_history()'::pg_catalog.regprocedure)
    like '%for update skip locked%',
  'benchmark lifecycle paths use SKIP LOCKED for bounded concurrent maintenance'
);
select ok(
  pg_catalog.pg_get_functiondef('private.prune_lab_access_history()'::pg_catalog.regprocedure)
    like '%private.prune_stage2_access_history()%'
  and pg_catalog.pg_get_functiondef('private.prune_lab_access_history()'::pg_catalog.regprocedure)
    like '%private.prune_benchmark_history()%',
  'the canonical wrapper composes Stage 2 and Stage 3 maintenance'
);
select ok(
  pg_catalog.pg_get_functiondef('private.enforce_benchmark_output_limit()'::pg_catalog.regprocedure)
    like '%for update%',
  'output-count admission serializes on the parent run row'
);
select ok(
  pg_catalog.pg_get_functiondef('private.enforce_benchmark_judgment_limit()'::pg_catalog.regprocedure)
    like '%for update%',
  'raw-rating admission serializes on the parent run row'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'private.benchmark_runs'::pg_catalog.regclass
      and contype = 'u'
      and pg_catalog.pg_get_constraintdef(oid) like '%idempotency_key%'
  ),
  'run idempotency has a database-enforced uniqueness invariant'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'private'
      and tablename = 'benchmark_runs'
      and indexdef like '%retention_expires_at%'
  ),
  'run retention has a supporting cleanup index'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'private'
      and tablename = 'benchmark_judgments'
      and indexdef like '%retention_expires_at%'
  ),
  'raw-judgment retention has a supporting cleanup index'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'private'
      and tablename = 'benchmark_artifact_refs'
      and indexdef like '%retention_expires_at%'
  ),
  'artifact retention has a supporting cleanup index'
);
select ok(
  pg_catalog.pg_get_functiondef('public.read_public_benchmark_snapshot(uuid,text)'::pg_catalog.regprocedure)
    not like '%benchmark_runs%'
  and pg_catalog.pg_get_functiondef('public.read_public_benchmark_snapshot(uuid,text)'::pg_catalog.regprocedure)
    not like '%benchmark_judgments%'
  and pg_catalog.pg_get_functiondef('public.read_public_benchmark_snapshot(uuid,text)'::pg_catalog.regprocedure)
    not like '%benchmark_artifact_refs%',
  'the public reader never queries raw runs, judgments, or artifacts'
);
select ok(
  pg_catalog.pg_get_functiondef('public.read_public_benchmark_snapshot(uuid,text)'::pg_catalog.regprocedure)
    like '%v_snapshot.public_payload%'
  and pg_catalog.pg_get_functiondef('public.read_public_benchmark_snapshot(uuid,text)'::pg_catalog.regprocedure)
    not like '%benchmark_snapshot_public_payload%'
  and pg_catalog.pg_get_functiondef('public.read_public_benchmark_snapshot(uuid,text)'::pg_catalog.regprocedure)
    not like '%benchmark_leaderboard_snapshot_sources%',
  'anonymous reads return the bounded materialized proof without recomputing source evidence'
);

select * from finish();
rollback;
