-- Canonical, provider-neutral benchmark persistence for ONE Voice Lab.
--
-- This is a forward-only Stage 3 migration. Authoritative benchmark evidence
-- lives in the unexposed private schema. Browser roles receive no table access;
-- only the explicitly sanitized public snapshot reader is anonymous-accessible.

create or replace function private.is_safe_sponsorship_disclosures(p_value jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_item jsonb;
  v_text text;
  v_previous text;
begin
  if pg_catalog.jsonb_typeof(p_value) <> 'array'
     or pg_catalog.jsonb_array_length(p_value) > 20
     or pg_catalog.octet_length(p_value::text) > 8192 then
    return false;
  end if;
  for v_item in select item.value from pg_catalog.jsonb_array_elements(p_value) item(value) loop
    if pg_catalog.jsonb_typeof(v_item) <> 'string' then
      return false;
    end if;
    v_text := v_item #>> '{}';
    if char_length(v_text) not between 1 and 300
       or v_text ~ '[[:cntrl:]]'
       or v_text ~* '(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|secret|cookie|password|internal[_-]?url|https?://)'
       or (v_previous is not null and v_previous >= v_text) then
      return false;
    end if;
    v_previous := v_text;
  end loop;
  return true;
end;
$$;

alter function private.is_safe_sponsorship_disclosures(jsonb) owner to postgres;
revoke all on function private.is_safe_sponsorship_disclosures(jsonb) from public, anon, authenticated;

create table private.benchmark_methodologies (
  methodology_id text not null check (
    char_length(methodology_id) between 1 and 120
    and methodology_id ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
  ),
  version text not null check (
    char_length(version) between 1 and 80
    and version ~ '^[0-9]+\.[0-9]+\.[0-9]+([-+][A-Za-z0-9.-]+)?$'
  ),
  name text not null check (char_length(name) between 1 and 200),
  description text not null check (char_length(description) between 1 and 2000),
  definition jsonb not null default '{}'::jsonb check (
    jsonb_typeof(definition) = 'object'
    and pg_catalog.octet_length(definition::text) <= 131072
  ),
  content_hash text not null check (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  lifecycle_state text not null default 'draft' check (
    lifecycle_state in ('draft', 'published', 'retired')
  ),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  published_at timestamptz,
  retired_at timestamptz,
  retention_expires_at timestamptz not null default (
    pg_catalog.clock_timestamp() + interval '400 days'
  ),
  primary key (methodology_id, version),
  unique (content_hash),
  check (
    (lifecycle_state = 'draft' and published_at is null and retired_at is null)
    or (lifecycle_state = 'published' and published_at is not null and retired_at is null)
    or (lifecycle_state = 'retired' and published_at is not null and retired_at is not null)
  )
);

create table private.benchmark_suites (
  id uuid primary key default gen_random_uuid(),
  suite_key text not null check (
    char_length(suite_key) between 1 and 120
    and suite_key ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
  ),
  version text not null check (
    char_length(version) between 1 and 80
    and version ~ '^[0-9]+\.[0-9]+\.[0-9]+([-+][A-Za-z0-9.-]+)?$'
  ),
  methodology_id text not null,
  methodology_version text not null,
  benchmark_category text not null check (
    benchmark_category in ('tts', 'stt', 'realtime')
  ),
  owner_user_id uuid references auth.users(id) on delete set null,
  name text not null check (char_length(name) between 1 and 200),
  description text not null check (char_length(description) between 1 and 2000),
  language text not null check (
    char_length(language) between 1 and 80 and language ~ '^[A-Za-z0-9._-]+$'
  ),
  domain text not null check (
    char_length(domain) between 1 and 120 and domain ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
  ),
  dataset_version text not null check (char_length(dataset_version) between 1 and 120),
  dataset_license text not null check (
    char_length(dataset_license) between 1 and 120
    and dataset_license ~ '^[A-Za-z0-9._+-]+$'
  ),
  provenance_reference text not null check (
    char_length(provenance_reference) between 1 and 400
    and provenance_reference ~ '^(repository|fixture|object):[A-Za-z0-9._:/-]+$'
    and provenance_reference !~ '(^|/)\.\.(/|$)'
  ),
  input_manifest_hash text not null check (input_manifest_hash ~ '^sha256:[0-9a-f]{64}$'),
  privacy_class text not null default 'private' check (
    privacy_class in ('public', 'synthetic', 'private', 'restricted')
  ),
  publication_eligibility text not null default 'ineligible' check (
    publication_eligibility in ('ineligible', 'candidate', 'eligible')
  ),
  expected_output_kind text not null check (
    expected_output_kind in ('audio', 'text', 'event-stream')
  ),
  content_hash text not null check (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  lifecycle_state text not null default 'draft' check (
    lifecycle_state in ('draft', 'active', 'retired')
  ),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  retired_at timestamptz,
  retention_expires_at timestamptz not null default (
    pg_catalog.clock_timestamp() + interval '400 days'
  ),
  unique (suite_key, version),
  unique (content_hash),
  foreign key (methodology_id, methodology_version)
    references private.benchmark_methodologies(methodology_id, version)
    on update restrict on delete restrict,
  check (
    (lifecycle_state <> 'retired' and retired_at is null)
    or (lifecycle_state = 'retired' and retired_at is not null)
  ),
  check (
    (benchmark_category = 'tts' and expected_output_kind = 'audio')
    or (benchmark_category = 'stt' and expected_output_kind = 'text')
    or (benchmark_category = 'realtime')
  )
);

create table private.benchmark_cases (
  id uuid primary key default gen_random_uuid(),
  suite_id uuid not null references private.benchmark_suites(id)
    on update restrict on delete restrict,
  case_key text not null check (
    char_length(case_key) between 1 and 120
    and case_key ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
  ),
  version text not null check (
    char_length(version) between 1 and 80
    and version ~ '^[0-9]+\.[0-9]+\.[0-9]+([-+][A-Za-z0-9.-]+)?$'
  ),
  case_kind text not null default 'custom' check (
    case_kind in ('canonical', 'preset', 'custom')
  ),
  benchmark_category text not null check (
    benchmark_category in ('tts', 'stt', 'realtime')
  ),
  input_type text not null check (input_type in ('text', 'audio', 'event-stream')),
  exact_input_text text check (
    exact_input_text is null
    or (
      char_length(exact_input_text) between 1 and 600
      and pg_catalog.octet_length(exact_input_text) <= 4096
    )
  ),
  input_reference text check (
    input_reference is null
    or (
      char_length(input_reference) between 1 and 400
      and input_reference !~ '://'
      and input_reference !~ '(^|/)\.\.(/|$)'
      and input_reference !~ '[?#]'
    )
  ),
  input_hash text not null check (input_hash ~ '^sha256:[0-9a-f]{64}$'),
  language text not null check (
    char_length(language) between 1 and 80 and language ~ '^[A-Za-z0-9._-]+$'
  ),
  domain text not null check (
    char_length(domain) between 1 and 120 and domain ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
  ),
  privacy_class text not null default 'private' check (
    privacy_class in ('public', 'synthetic', 'private', 'restricted')
  ),
  publication_eligibility text not null default 'ineligible' check (
    publication_eligibility in ('ineligible', 'candidate', 'eligible')
  ),
  source_reference text check (
    source_reference is null
    or (
      char_length(source_reference) between 1 and 400
      and source_reference ~ '^(repository|fixture|object):[A-Za-z0-9._:/-]+$'
      and source_reference !~ '(^|/)\.\.(/|$)'
    )
  ),
  source_verified_at timestamptz,
  configuration jsonb not null default '{}'::jsonb check (
    jsonb_typeof(configuration) = 'object'
    and pg_catalog.octet_length(configuration::text) <= 65536
    and configuration::text !~* '(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|secret|cookie|password|internal[_-]?url)'
  ),
  ordinal integer not null default 0 check (ordinal between 0 and 10000),
  lifecycle_state text not null default 'draft' check (
    lifecycle_state in ('draft', 'active', 'retired')
  ),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  retired_at timestamptz,
  retention_expires_at timestamptz not null default (
    pg_catalog.clock_timestamp() + interval '180 days'
  ),
  unique (suite_id, case_key, version),
  unique (suite_id, input_hash, version),
  unique (id, benchmark_category),
  unique (id, benchmark_category, input_hash),
  check (
    (input_type = 'text' and exact_input_text is not null and input_reference is null)
    or (input_type in ('audio', 'event-stream') and exact_input_text is null and input_reference is not null)
  ),
  check (
    (benchmark_category = 'tts' and input_type = 'text')
    or (benchmark_category = 'stt' and input_type = 'audio')
    or (benchmark_category = 'realtime' and input_type in ('text', 'audio', 'event-stream'))
  ),
  check (
    (source_reference is null and source_verified_at is null)
    or (source_reference is not null and source_verified_at is not null)
  ),
  check (
    (lifecycle_state <> 'retired' and retired_at is null)
    or (lifecycle_state = 'retired' and retired_at is not null)
  )
);

create table private.benchmark_runs (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null,
  run_id uuid not null,
  owner_user_id uuid references auth.users(id) on delete set null,
  case_id uuid not null,
  idempotency_key uuid not null,
  bundle_hash text not null check (bundle_hash ~ '^sha256:[0-9a-f]{64}$'),
  schema_version text not null check (char_length(schema_version) between 1 and 120),
  methodology_version text not null check (
    char_length(methodology_version) between 1 and 80
    and methodology_version ~ '^[0-9]+\.[0-9]+\.[0-9]+([-+][A-Za-z0-9.-]+)?$'
  ),
  metric_version text not null check (char_length(metric_version) between 1 and 120),
  benchmark_category text not null check (
    benchmark_category in ('tts', 'stt', 'realtime')
  ),
  evaluation_mode text not null check (
    evaluation_mode in ('standardized', 'provider-optimized')
  ),
  comparability_state text not null default 'unreviewed' check (
    comparability_state in ('unreviewed', 'comparable', 'not-comparable')
  ),
  execution_mode text not null check (
    execution_mode in ('fixture', 'protected-live', 'local-live', 'imported')
  ),
  environment text not null check (
    char_length(environment) between 1 and 80
    and environment ~ '^[A-Za-z0-9._:-]+$'
  ),
  deployment text not null check (
    char_length(deployment) between 1 and 160
    and deployment ~ '^[A-Za-z0-9._:/-]+$'
  ),
  region text check (
    region is null
    or (
      char_length(region) between 1 and 80
      and region ~ '^[A-Za-z0-9._:-]+$'
    )
  ),
  status text not null default 'pending' check (
    status in ('pending', 'running', 'complete', 'partial', 'cancelled', 'timed-out', 'unavailable', 'failed')
  ),
  input_hash text not null check (input_hash ~ '^sha256:[0-9a-f]{64}$'),
  run_configuration jsonb not null default '{}'::jsonb check (
    jsonb_typeof(run_configuration) = 'object'
    and pg_catalog.octet_length(run_configuration::text) <= 65536
    and run_configuration::text !~* '(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|secret|cookie|password|internal[_-]?url)'
  ),
  visibility text not null default 'private' check (
    visibility in ('private', 'team', 'unlisted', 'public-candidate', 'public-verified')
  ),
  publication_state text not null default 'private' check (
    publication_state in ('private', 'eligible', 'published', 'revoked')
  ),
  consent_publication boolean not null default false,
  consent_public_evidence_pool boolean not null default false,
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  revoked_at timestamptz,
  sponsorship_disclosure text check (
    sponsorship_disclosure is null
    or (
      char_length(sponsorship_disclosure) between 1 and 300
      and sponsorship_disclosure !~ '[[:cntrl:]]'
      and sponsorship_disclosure !~* '(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|secret|cookie|password|internal[_-]?url|https?://)'
    )
  ),
  integrity_state text not null default 'unverified' check (
    integrity_state in ('unverified', 'hash-verified', 'signature-verified', 'verification-failed')
  ),
  integrity_checked_at timestamptz,
  integrity_record_hash text check (
    integrity_record_hash is null or integrity_record_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  requested_at timestamptz not null default pg_catalog.clock_timestamp(),
  first_audio_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  retention_class text not null default 'private_180d' check (
    retention_class in (
      'ephemeral_14d',
      'technical_35d',
      'fixture_90d',
      'private_180d',
      'aggregate_400d',
      'public_verified'
    )
  ),
  retention_expires_at timestamptz default (
    pg_catalog.clock_timestamp() + interval '180 days'
  ),
  unique (evaluation_id, run_id),
  unique (run_id),
  unique (idempotency_key),
  foreign key (case_id, benchmark_category, input_hash)
    references private.benchmark_cases(id, benchmark_category, input_hash)
    on update restrict on delete restrict,
  check (first_audio_at is null or first_audio_at >= requested_at),
  check (completed_at is null or completed_at >= requested_at),
  check (
    (publication_state = 'private' and visibility in ('private', 'team', 'unlisted')
      and published_at is null and revoked_at is null)
    or (publication_state = 'eligible' and visibility = 'public-candidate'
      and published_at is null and revoked_at is null)
    or (publication_state = 'published' and visibility = 'public-verified'
      and consent_publication and consent_public_evidence_pool
      and verified_at is not null
      and published_at is not null and revoked_at is null)
    or (publication_state = 'revoked' and visibility in ('private', 'team', 'unlisted')
      and revoked_at is not null)
  ),
  check (
    (retention_class = 'public_verified' and retention_expires_at is null
      and publication_state = 'published')
    or (retention_class <> 'public_verified' and retention_expires_at is not null)
  ),
  check (
    (integrity_state = 'unverified' and integrity_checked_at is null and integrity_record_hash is null)
    or (integrity_state in ('hash-verified', 'signature-verified', 'verification-failed')
      and integrity_checked_at is not null and integrity_record_hash is not null)
  )
);

create table private.benchmark_run_outputs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references private.benchmark_runs(id)
    on update restrict on delete restrict,
  provider_id text not null check (
    char_length(provider_id) between 1 and 80
    and provider_id ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
  ),
  provider_display_name text not null check (
    char_length(provider_display_name) between 1 and 160
  ),
  provider_readiness text not null check (
    provider_readiness in ('listed', 'configured', 'adapter-backed', 'live-enabled')
  ),
  model_id text not null check (char_length(model_id) between 1 and 160),
  model_version text check (
    model_version is null or char_length(model_version) between 1 and 160
  ),
  voice_id text check (voice_id is null or char_length(voice_id) between 1 and 160),
  configuration_hash text not null check (configuration_hash ~ '^sha256:[0-9a-f]{64}$'),
  adapter_version text check (
    adapter_version is null or char_length(adapter_version) between 1 and 120
  ),
  provider_configuration jsonb not null default '{}'::jsonb check (
    jsonb_typeof(provider_configuration) = 'object'
    and pg_catalog.octet_length(provider_configuration::text) <= 65536
    and provider_configuration::text !~* '(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|secret|cookie|password|internal[_-]?url)'
  ),
  sponsorship_disclosure text check (
    sponsorship_disclosure is null
    or (
      char_length(sponsorship_disclosure) between 1 and 300
      and sponsorship_disclosure !~ '[[:cntrl:]]'
      and sponsorship_disclosure !~* '(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|secret|cookie|password|internal[_-]?url|https?://)'
    )
  ),
  region text check (
    region is null
    or (
      char_length(region) between 1 and 80
      and region ~ '^[A-Za-z0-9._:-]+$'
    )
  ),
  output_modality text not null check (
    output_modality in ('text', 'audio', 'event-stream')
  ),
  capability text not null check (capability in ('tts', 'stt', 'realtime')),
  transport text not null check (
    char_length(transport) between 1 and 120
    and transport ~ '^[A-Za-z0-9._:/-]+$'
  ),
  codec text check (
    codec is null
    or (
      char_length(codec) between 1 and 80
      and codec ~ '^[A-Za-z0-9._+/-]+$'
    )
  ),
  sample_rate_hz integer check (sample_rate_hz is null or sample_rate_hz between 8000 and 384000),
  channels integer check (channels is null or channels between 1 and 32),
  thermal_state text not null default 'unknown' check (
    thermal_state in ('cold', 'warm', 'unknown')
  ),
  status text not null check (
    status in ('pending', 'streaming', 'complete', 'cancelled', 'timed-out', 'unavailable', 'failed')
  ),
  failure_code text check (
    failure_code is null
    or (
      char_length(failure_code) between 1 and 120
      and failure_code ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
    )
  ),
  request_started_at timestamptz,
  stream_established_at timestamptz,
  first_output_at timestamptz,
  first_audio_at timestamptz,
  completed_at timestamptz,
  audio_mime_type text check (
    audio_mime_type is null or audio_mime_type ~ '^audio/[a-z0-9.+-]+$'
  ),
  audio_duration_seconds numeric check (
    audio_duration_seconds is null
    or (audio_duration_seconds >= 0 and audio_duration_seconds <= 3600)
  ),
  audio_content_hash text check (
    audio_content_hash is null or audio_content_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  output_content_hash text check (
    output_content_hash is null or output_content_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  blind_label text check (blind_label is null or blind_label in ('Voice A', 'Voice B', 'Voice C', 'Voice D')),
  revealed_at timestamptz,
  technical_trace jsonb not null default '[]'::jsonb check (
    jsonb_typeof(technical_trace) = 'array'
    and jsonb_array_length(technical_trace) <= 40
    and pg_catalog.octet_length(technical_trace::text) <= 65536
  ),
  sanitized_error jsonb check (
    sanitized_error is null
    or (
      jsonb_typeof(sanitized_error) = 'object'
      and pg_catalog.octet_length(sanitized_error::text) <= 16384
    )
  ),
  technical_detail_expires_at timestamptz not null default (
    pg_catalog.clock_timestamp() + interval '35 days'
  ),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  check (stream_established_at is null or request_started_at is null or stream_established_at >= request_started_at),
  check (first_output_at is null or request_started_at is null or first_output_at >= request_started_at),
  check (first_audio_at is null or request_started_at is null or first_audio_at >= request_started_at),
  check (completed_at is null or request_started_at is null or completed_at >= request_started_at),
  check (
    (output_modality = 'audio')
    or (
      audio_mime_type is null
      and audio_duration_seconds is null
      and audio_content_hash is null
      and first_audio_at is null
    )
  ),
  check (
    (capability = 'tts' and output_modality = 'audio')
    or (capability = 'stt' and output_modality = 'text')
    or (capability = 'realtime')
  ),
  check (
    (transport in ('http-stream', 'websocket') and stream_established_at is not null)
    or (transport not in ('http-stream', 'websocket'))
  ),
  check (
    (status in ('pending', 'streaming', 'complete') and failure_code is null)
    or (status in ('cancelled', 'timed-out', 'unavailable', 'failed') and failure_code is not null)
  ),
  unique (id, run_id)
);

create unique index benchmark_output_identity_once_idx
  on private.benchmark_run_outputs (
    run_id,
    provider_id,
    model_id,
    coalesce(voice_id, ''),
    configuration_hash,
    output_modality,
    transport,
    coalesce(codec, ''),
    coalesce(sample_rate_hz, 0),
    coalesce(channels, 0),
    thermal_state
  );

create table private.benchmark_measurements (
  id bigint generated always as identity primary key,
  output_id uuid not null references private.benchmark_run_outputs(id)
    on update restrict on delete restrict,
  metric_name text not null check (
    char_length(metric_name) between 1 and 120
    and metric_name ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
  ),
  metric_version text not null check (char_length(metric_version) between 1 and 120),
  metric_value numeric,
  unit text not null check (char_length(unit) between 1 and 40),
  availability text not null check (availability in ('measured', 'estimated', 'unavailable')),
  measurement_point text not null check (
    measurement_point in ('one-server', 'one-browser', 'provider-reported', 'derived')
  ),
  provenance jsonb not null check (
    jsonb_typeof(provenance) = 'object'
    and pg_catalog.octet_length(provenance::text) <= 8192
  ),
  observed_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (output_id, metric_name, metric_version, measurement_point),
  check (
    (availability = 'unavailable' and metric_value is null)
    or (availability <> 'unavailable' and metric_value is not null
      and metric_value <> 'NaN'::numeric
      and metric_value <> 'Infinity'::numeric
      and metric_value <> '-Infinity'::numeric)
  )
);

create table private.benchmark_judgments (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references private.benchmark_runs(id)
    on update restrict on delete restrict,
  output_id uuid not null references private.benchmark_run_outputs(id)
    on update restrict on delete restrict,
  judgment_kind text not null check (
    judgment_kind in ('human', 'model', 'external-framework')
  ),
  rater_user_id uuid references auth.users(id) on delete cascade,
  judge_model_id text check (judge_model_id is null or char_length(judge_model_id) between 1 and 160),
  framework_id text check (
    framework_id is null
    or (
      char_length(framework_id) between 1 and 120
      and framework_id ~ '^[A-Za-z0-9._:/-]+$'
    )
  ),
  framework_version text check (
    framework_version is null or char_length(framework_version) between 1 and 120
  ),
  framework_configuration_hash text check (
    framework_configuration_hash is null
    or framework_configuration_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  dimension text not null check (
    char_length(dimension) between 1 and 120
    and dimension ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
  ),
  judgment_version text not null check (char_length(judgment_version) between 1 and 120),
  score numeric,
  preference_selected boolean,
  numeric_value numeric,
  boolean_value boolean,
  text_value text check (text_value is null or char_length(text_value) between 1 and 2000),
  unit text check (unit is null or char_length(unit) between 1 and 80),
  threshold numeric,
  rubric_version text check (rubric_version is null or char_length(rubric_version) between 1 and 120),
  rubric jsonb check (
    rubric is null
    or (
      jsonb_typeof(rubric) = 'object'
      and pg_catalog.octet_length(rubric::text) <= 16384
    )
  ),
  blind_state text not null check (blind_state in ('not-blind', 'blind', 'revealed')),
  rated_before_reveal boolean not null,
  provenance jsonb not null check (
    jsonb_typeof(provenance) = 'object'
    and pg_catalog.octet_length(provenance::text) <= 8192
  ),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  retention_expires_at timestamptz not null default (
    pg_catalog.clock_timestamp() + interval '180 days'
  ),
  check (
    (judgment_kind = 'human' and rater_user_id is not null and judge_model_id is null
      and framework_id is null and framework_version is null and framework_configuration_hash is null)
    or (judgment_kind = 'model' and rater_user_id is null and judge_model_id is not null
      and framework_id is null and framework_version is null and framework_configuration_hash is null)
    or (judgment_kind = 'external-framework' and rater_user_id is null
      and framework_id is not null and framework_version is not null
      and framework_configuration_hash is not null)
  ),
  check (
    (judgment_kind = 'human' and dimension = 'overall_preference'
      and preference_selected is true and score is null
      and numeric_value is null and boolean_value is null and text_value is null)
    or (judgment_kind = 'human' and dimension <> 'overall_preference'
      and preference_selected is null and score between 1 and 5
      and score <> 'NaN'::numeric and score <> 'Infinity'::numeric and score <> '-Infinity'::numeric
      and numeric_value is null and boolean_value is null and text_value is null)
    or (judgment_kind in ('model', 'external-framework')
      and score is null and preference_selected is null
      and pg_catalog.num_nonnulls(numeric_value, boolean_value, text_value) = 1
      and (numeric_value is null or (
        numeric_value <> 'NaN'::numeric
        and numeric_value <> 'Infinity'::numeric
        and numeric_value <> '-Infinity'::numeric
      ))
      and (threshold is null or (
        threshold <> 'NaN'::numeric
        and threshold <> 'Infinity'::numeric
        and threshold <> '-Infinity'::numeric
      ))
      and rubric_version is not null and rubric is not null)
  ),
  foreign key (output_id, run_id)
    references private.benchmark_run_outputs(id, run_id)
    on update restrict on delete restrict,
  check (
    (blind_state = 'blind' and rated_before_reveal)
    or (blind_state <> 'blind' and not rated_before_reveal)
  )
);

create unique index benchmark_human_judgment_once_idx
  on private.benchmark_judgments (
    run_id,
    rater_user_id,
    output_id,
    dimension,
    judgment_version
  )
  where judgment_kind = 'human';

create unique index benchmark_human_preference_once_idx
  on private.benchmark_judgments (
    run_id,
    rater_user_id,
    dimension,
    judgment_version
  )
  where judgment_kind = 'human' and dimension = 'overall_preference';

create unique index benchmark_model_judgment_once_idx
  on private.benchmark_judgments (
    run_id,
    output_id,
    dimension,
    judge_model_id,
    judgment_version
  )
  where judgment_kind = 'model';

create unique index benchmark_external_judgment_once_idx
  on private.benchmark_judgments (
    run_id,
    output_id,
    dimension,
    framework_id,
    framework_version,
    framework_configuration_hash,
    judgment_version
  )
  where judgment_kind = 'external-framework';

create table private.benchmark_artifact_refs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references private.benchmark_runs(id)
    on update restrict on delete restrict,
  output_id uuid references private.benchmark_run_outputs(id)
    on update restrict on delete restrict,
  artifact_kind text not null check (
    artifact_kind in ('audio', 'transcript', 'trace', 'evidence', 'configuration', 'event-stream')
  ),
  storage_backend text not null check (
    storage_backend in ('ephemeral', 'local')
  ),
  object_key text not null check (
    char_length(object_key) between 1 and 400
    and object_key !~ '://'
    and object_key !~ '(^|/)\.\.(/|$)'
    and object_key !~ '[?#]'
  ),
  mime_type text not null check (
    mime_type ~ '^audio/[a-z0-9.+-]+$'
    or mime_type in ('application/json', 'application/octet-stream', 'text/plain')
  ),
  size_bytes integer not null check (size_bytes between 0 and 2621440),
  content_hash text not null check (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  artifact_state text not null default 'active' check (
    artifact_state in ('active', 'expired', 'deleted')
  ),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  retention_class text not null default 'technical_35d' check (
    retention_class in ('ephemeral_14d', 'technical_35d', 'fixture_90d', 'private_180d')
  ),
  retention_expires_at timestamptz not null default (
    pg_catalog.clock_timestamp() + interval '35 days'
  ),
  unique (run_id, artifact_kind, content_hash)
  ,foreign key (output_id, run_id)
    references private.benchmark_run_outputs(id, run_id)
    on update restrict on delete restrict
);

create table private.benchmark_leaderboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  suite_id uuid not null references private.benchmark_suites(id)
    on update restrict on delete restrict,
  case_id uuid not null,
  input_hash text not null check (input_hash ~ '^sha256:[0-9a-f]{64}$'),
  methodology_id text not null,
  methodology_version text not null,
  benchmark_category text not null check (
    benchmark_category in ('tts', 'stt', 'realtime')
  ),
  comparison_mode text not null check (
    comparison_mode in ('standardized', 'provider-optimized')
  ),
  execution_mode text not null check (
    execution_mode in ('fixture', 'protected-live', 'local-live', 'imported')
  ),
  environment text not null check (
    char_length(environment) between 1 and 80
    and environment ~ '^[A-Za-z0-9._:-]+$'
  ),
  deployment text not null check (
    char_length(deployment) between 1 and 160
    and deployment ~ '^[A-Za-z0-9._:/-]+$'
  ),
  language text not null check (
    char_length(language) between 1 and 80
    and language ~ '^[A-Za-z0-9._-]+$'
  ),
  region text check (
    region is null
    or (
      char_length(region) between 1 and 80
      and region ~ '^[A-Za-z0-9._:-]+$'
    )
  ),
  transport text not null check (
    char_length(transport) between 1 and 120
    and transport ~ '^[A-Za-z0-9._:/-]+$'
  ),
  codec text check (
    codec is null
    or (
      char_length(codec) between 1 and 80
      and codec ~ '^[A-Za-z0-9._+/-]+$'
    )
  ),
  sample_rate_hz integer check (sample_rate_hz is null or sample_rate_hz between 8000 and 384000),
  channels integer check (channels is null or channels between 1 and 32),
  thermal_state text not null check (thermal_state in ('cold', 'warm', 'unknown')),
  metric_name text not null check (
    char_length(metric_name) between 1 and 120
    and metric_name ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
  ),
  metric_version text not null check (char_length(metric_version) between 1 and 120),
  statistic text not null check (
    statistic in ('count', 'mean', 'median', 'p50', 'p95', 'distribution-bin', 'preference-rate')
  ),
  ranking_direction text not null check (
    ranking_direction in ('lower-is-better', 'higher-is-better')
  ),
  decimal_places integer not null check (decimal_places between 0 and 9),
  unit text not null check (char_length(unit) between 1 and 40),
  measurement_point text not null check (
    measurement_point in ('one-server', 'one-browser', 'provider-reported', 'derived')
  ),
  provenance_version text not null check (char_length(provenance_version) between 1 and 120),
  provenance jsonb not null check (
    jsonb_typeof(provenance) = 'object'
    and pg_catalog.octet_length(provenance::text) <= 4096
    and provenance::text !~* '(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|secret|cookie|password|internal[_-]?url|https?://)'
  ),
  provenance_hash text not null check (provenance_hash ~ '^sha256:[0-9a-f]{64}$'),
  minimum_sample_count integer not null check (minimum_sample_count between 1 and 10000),
  allow_synthetic boolean not null default false,
  freshness_cutoff_at timestamptz not null,
  calculation_version text not null check (char_length(calculation_version) between 1 and 120),
  eligibility_profile_version text not null check (
    char_length(eligibility_profile_version) between 1 and 120
  ),
  scoring_profile_version text not null check (
    char_length(scoring_profile_version) between 1 and 120
  ),
  disclosed_filters jsonb not null default '{}'::jsonb check (
    jsonb_typeof(disclosed_filters) = 'object'
    and pg_catalog.octet_length(disclosed_filters::text) <= 32768
    and disclosed_filters::text !~* '(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|secret|cookie|password|internal[_-]?url|https?://)'
  ),
  filters_hash text not null check (filters_hash ~ '^sha256:[0-9a-f]{64}$'),
  metric_scope_hash text not null check (metric_scope_hash ~ '^sha256:[0-9a-f]{64}$'),
  scenario_scope_hash text not null check (scenario_scope_hash ~ '^sha256:[0-9a-f]{64}$'),
  population_hash text not null check (population_hash ~ '^sha256:[0-9a-f]{64}$'),
  snapshot_hash text not null check (snapshot_hash ~ '^sha256:[0-9a-f]{64}$'),
  public_payload jsonb check (
    public_payload is null
    or (
      jsonb_typeof(public_payload) = 'object'
      and pg_catalog.octet_length(public_payload::text) <= 1048576
    )
  ),
  public_payload_canonical text check (
    public_payload_canonical is null
    or pg_catalog.octet_length(public_payload_canonical) <= 1048576
  ),
  source_max_completed_at timestamptz not null,
  as_of_at timestamptz not null,
  sample_count integer not null check (sample_count between 1 and 1000000),
  visibility text not null default 'private' check (
    visibility in ('private', 'team', 'unlisted', 'public-candidate', 'public-verified')
  ),
  publication_state text not null default 'private' check (
    publication_state in ('private', 'published', 'revoked')
  ),
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  retention_class text not null default 'aggregate_400d' check (
    retention_class in ('aggregate_400d', 'public_verified')
  ),
  retention_expires_at timestamptz default (
    pg_catalog.clock_timestamp() + interval '400 days'
  ),
  unique (snapshot_hash),
  unique (
    suite_id,
    methodology_id,
    methodology_version,
    calculation_version,
    eligibility_profile_version,
    scoring_profile_version,
    filters_hash,
    metric_scope_hash,
    provenance_hash,
    scenario_scope_hash,
    population_hash,
    source_max_completed_at
  ),
  foreign key (methodology_id, methodology_version)
    references private.benchmark_methodologies(methodology_id, version)
    on update restrict on delete restrict,
  foreign key (case_id, benchmark_category, input_hash)
    references private.benchmark_cases(id, benchmark_category, input_hash)
    on update restrict on delete restrict,
  check (freshness_cutoff_at <= source_max_completed_at),
  check (as_of_at >= source_max_completed_at),
  check (freshness_cutoff_at >= as_of_at - interval '365 days'),
  check (as_of_at <= pg_catalog.clock_timestamp() + interval '5 minutes'),
  check (
    (publication_state = 'private' and visibility in ('private', 'team', 'unlisted')
      and public_payload is null and public_payload_canonical is null
      and verified_at is null and verified_by is null
      and published_at is null and revoked_at is null)
    or (publication_state = 'published' and visibility = 'public-verified' and verified_at is not null
      and published_at is not null and revoked_at is null
      and public_payload is not null and public_payload_canonical is not null)
    or (publication_state = 'revoked' and visibility in ('private', 'team', 'unlisted')
      and revoked_at is not null
      and public_payload is not null and public_payload_canonical is not null)
  ),
  check ((public_payload is null) = (public_payload_canonical is null)),
  check (
    (retention_class = 'public_verified' and retention_expires_at is null
      and publication_state = 'published')
    or (retention_class = 'aggregate_400d' and retention_expires_at is not null)
  )
);

create table private.benchmark_leaderboard_snapshot_entries (
  id bigint generated always as identity primary key,
  snapshot_id uuid not null references private.benchmark_leaderboard_snapshots(id)
    on update restrict on delete restrict,
  entry_ordinal integer not null check (entry_ordinal between 0 and 999),
  provider_id text not null check (
    char_length(provider_id) between 1 and 80
    and provider_id ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
  ),
  provider_display_name text not null check (
    char_length(provider_display_name) between 1 and 160
  ),
  provider_readiness text not null check (
    provider_readiness in ('listed', 'configured', 'adapter-backed', 'live-enabled')
  ),
  adapter_version text not null check (char_length(adapter_version) between 1 and 160),
  model_id text not null check (char_length(model_id) between 1 and 160),
  model_version text check (
    model_version is null or char_length(model_version) between 1 and 160
  ),
  voice_id text check (voice_id is null or char_length(voice_id) between 1 and 160),
  configuration_hash text not null check (configuration_hash ~ '^sha256:[0-9a-f]{64}$'),
  capability text not null check (capability in ('tts', 'stt', 'realtime')),
  deployment text not null check (
    char_length(deployment) between 1 and 160
    and deployment ~ '^[A-Za-z0-9._:/-]+$'
  ),
  region text check (
    region is null
    or (
      char_length(region) between 1 and 80
      and region ~ '^[A-Za-z0-9._:-]+$'
    )
  ),
  transport text not null check (
    char_length(transport) between 1 and 120
    and transport ~ '^[A-Za-z0-9._:/-]+$'
  ),
  codec text check (
    codec is null
    or (
      char_length(codec) between 1 and 80
      and codec ~ '^[A-Za-z0-9._+/-]+$'
    )
  ),
  sample_rate_hz integer check (sample_rate_hz is null or sample_rate_hz between 8000 and 384000),
  channels integer check (channels is null or channels between 1 and 32),
  thermal_state text not null check (thermal_state in ('cold', 'warm', 'unknown')),
  inclusion_state text not null default 'included' check (
    inclusion_state in ('included', 'excluded')
  ),
  source_status text not null check (
    source_status in ('complete', 'cancelled', 'timed-out', 'unavailable', 'failed', 'mixed')
  ),
  failure_code text check (
    failure_code is null
    or (
      char_length(failure_code) between 1 and 120
      and failure_code ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
    )
  ),
  exclusion_reason text check (
    exclusion_reason is null
    or (
      char_length(exclusion_reason) between 1 and 500
      and exclusion_reason !~ '[[:cntrl:]]'
      and exclusion_reason !~* '(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|secret|cookie|password|internal[_-]?url|https?://)'
    )
  ),
  sponsorship_disclosures jsonb not null default '[]'::jsonb
    check (private.is_safe_sponsorship_disclosures(sponsorship_disclosures)),
  evidence_category text not null check (
    evidence_category in ('measured', 'human-rated', 'model-judged')
  ),
  metric_name text not null check (char_length(metric_name) between 1 and 120),
  metric_version text not null check (char_length(metric_version) between 1 and 120),
  statistic text not null check (
    statistic in ('count', 'mean', 'median', 'p50', 'p95', 'distribution-bin', 'preference-rate')
  ),
  metric_value numeric check (
    metric_value is null
    or (
      metric_value <> 'NaN'::numeric
      and metric_value <> 'Infinity'::numeric
      and metric_value <> '-Infinity'::numeric
    )
  ),
  unit text check (unit is null or char_length(unit) between 1 and 40),
  measurement_point text not null check (
    measurement_point in ('one-server', 'one-browser', 'provider-reported', 'derived')
  ),
  provenance_version text not null check (char_length(provenance_version) between 1 and 120),
  sample_count integer not null check (sample_count between 0 and 1000000),
  rank_ordinal integer check (rank_ordinal is null or rank_ordinal between 1 and 1000),
  tied boolean not null default false,
  tie_group text check (tie_group is null or char_length(tie_group) between 1 and 80),
  provenance jsonb not null check (
    jsonb_typeof(provenance) = 'object'
    and pg_catalog.octet_length(provenance::text) <= 8192
    and provenance::text !~* '(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|secret|cookie|password|internal[_-]?url|https?://)'
  ),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (snapshot_id, entry_ordinal),
  check (
    (inclusion_state = 'included' and exclusion_reason is null
      and metric_value is not null and unit is not null and sample_count >= 1
      and rank_ordinal is not null
      and ((tied and tie_group is not null) or (not tied and tie_group is null))
      and (
        (source_status = 'complete' and failure_code is null)
        or (
          metric_name = 'request-success'
          and unit = 'boolean'
          and (
            (source_status in ('cancelled', 'timed-out', 'unavailable', 'failed')
              and failure_code is not null)
            or (source_status = 'mixed' and failure_code is null)
          )
        )
      ))
    or (inclusion_state = 'excluded' and exclusion_reason is not null
      and metric_value is null and sample_count = 0 and rank_ordinal is null
      and not tied and tie_group is null
      and ((source_status = 'complete' and failure_code is null)
        or (source_status in ('cancelled', 'timed-out', 'unavailable', 'failed')
          and failure_code is not null)
        or (source_status = 'mixed' and failure_code is null)))
  ),
  check (
    metric_name <> 'request-success'
    or unit is null
    or (unit = 'boolean' and (metric_value is null or metric_value between 0 and 1))
  )
);

create unique index benchmark_snapshot_entry_identity_once_idx
  on private.benchmark_leaderboard_snapshot_entries (
    snapshot_id,
    provider_id,
    model_id,
    coalesce(voice_id, ''),
    configuration_hash,
    deployment,
    coalesce(region, ''),
    transport,
    coalesce(codec, ''),
    coalesce(sample_rate_hz, 0),
    coalesce(channels, 0),
    thermal_state,
    metric_name,
    metric_version,
    statistic
  );

create table private.benchmark_leaderboard_snapshot_sources (
  snapshot_entry_id bigint not null references private.benchmark_leaderboard_snapshot_entries(id)
    on update restrict on delete restrict,
  output_id uuid not null references private.benchmark_run_outputs(id)
    on update restrict on delete restrict,
  source_status text not null check (
    source_status in ('complete', 'cancelled', 'timed-out', 'unavailable', 'failed')
  ),
  failure_code text check (
    failure_code is null
    or (
      char_length(failure_code) between 1 and 120
      and failure_code ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
    )
  ),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (snapshot_entry_id, output_id),
  check (
    (source_status = 'complete' and failure_code is null)
    or (source_status <> 'complete' and failure_code is not null)
  )
);

create or replace function private.bind_benchmark_snapshot_source_terminal_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select output.status, output.failure_code
  into new.source_status, new.failure_code
  from private.benchmark_run_outputs output
  where output.id = new.output_id;
  if not found then
    raise exception 'Benchmark snapshot source output not found.' using errcode = '23503';
  end if;
  if new.source_status in ('pending', 'streaming') then
    raise exception 'Benchmark snapshots require terminal source outputs.' using errcode = '23514';
  end if;
  return new;
end;
$$;

alter function private.bind_benchmark_snapshot_source_terminal_state() owner to postgres;
revoke all on function private.bind_benchmark_snapshot_source_terminal_state() from public, anon, authenticated;

create trigger bind_benchmark_snapshot_source_terminal_state
before insert or update on private.benchmark_leaderboard_snapshot_sources
for each row execute function private.bind_benchmark_snapshot_source_terminal_state();

create or replace function private.benchmark_request_outcome_is_provider_attributable(
  p_status text,
  p_failure_code text,
  p_request_started_at timestamptz
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_request_started_at is not null
    and (
      (p_status = 'complete' and p_failure_code is null)
      or (p_status = 'timed-out' and p_failure_code = 'provider_timeout')
      or (
        p_status = 'failed'
        and p_failure_code in (
          'provider_rate_limited',
          'provider_quota_exhausted',
          'provider_unauthorized',
          'provider_forbidden',
          'provider_failure',
          'provider_malformed_response',
          'response_too_large'
        )
      )
    );
$$;

alter function private.benchmark_request_outcome_is_provider_attributable(text, text, timestamptz)
  owner to postgres;
revoke all on function private.benchmark_request_outcome_is_provider_attributable(text, text, timestamptz)
  from public, anon, authenticated;

create table private.benchmark_signatures (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (
    subject_type in ('methodology', 'suite', 'case', 'run', 'leaderboard_snapshot')
  ),
  subject_key text not null check (
    char_length(subject_key) between 1 and 240
    and subject_key ~ '^[A-Za-z0-9._:/-]+$'
  ),
  content_hash text not null check (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  signature_schema_version text not null check (
    signature_schema_version = 'one-benchmark-signature/1.0.0'
  ),
  payload_schema_version text not null check (
    char_length(payload_schema_version) between 1 and 160
    and payload_schema_version ~ '^one-[A-Za-z0-9._/-]+/[0-9]+\.[0-9]+\.[0-9]+$'
  ),
  signature_algorithm text not null check (signature_algorithm = 'ed25519'),
  public_key_id text not null check (
    char_length(public_key_id) between 1 and 160
    and public_key_id ~ '^[A-Za-z0-9._:/-]+$'
  ),
  signature_base64 text not null check (
    char_length(signature_base64) = 88
    and signature_base64 ~ '^[A-Za-z0-9+/]{85}[AQgw]==$'
  ),
  signed_at timestamptz not null,
  verification_state text not null default 'pending' check (
    verification_state in ('pending', 'signature-verified', 'verification-failed', 'unsupported-version')
  ),
  verification_method text check (
    verification_method is null or char_length(verification_method) between 1 and 160
  ),
  verification_record_hash text check (
    verification_record_hash is null or verification_record_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  retention_expires_at timestamptz default (
    pg_catalog.clock_timestamp() + interval '400 days'
  ),
  unique (subject_type, subject_key, content_hash, public_key_id),
  check (signed_at <= created_at + interval '5 minutes'),
  check (
    (verification_state = 'pending' and verification_method is null
      and verification_record_hash is null and verified_at is null and verified_by is null)
    or (verification_state <> 'pending' and verification_method is not null
      and verification_record_hash is not null and verified_at is not null and verified_by is not null)
  )
);

-- Foreign-key and lifecycle indexes support RLS-safe lookups, keyset reads,
-- bounded cleanup, and parent-first row locking.
create index benchmark_suites_methodology_idx
  on private.benchmark_suites(methodology_id, methodology_version);
create index benchmark_suites_owner_created_idx
  on private.benchmark_suites(owner_user_id, created_at desc, id);
create index benchmark_suites_retention_idx
  on private.benchmark_suites(retention_expires_at, id);
create index benchmark_cases_suite_ordinal_idx
  on private.benchmark_cases(suite_id, ordinal, id);
create index benchmark_cases_retention_idx
  on private.benchmark_cases(retention_expires_at, id);
create index benchmark_runs_owner_created_idx
  on private.benchmark_runs(owner_user_id, created_at desc, id);
create index benchmark_runs_case_created_idx
  on private.benchmark_runs(case_id, created_at desc, id);
create index benchmark_runs_publication_idx
  on private.benchmark_runs(publication_state, completed_at desc, id)
  where publication_state in ('eligible', 'published');
create index benchmark_runs_retention_idx
  on private.benchmark_runs(retention_expires_at, id)
  where retention_expires_at is not null;
create index benchmark_outputs_run_created_idx
  on private.benchmark_run_outputs(run_id, created_at, id);
create index benchmark_outputs_technical_retention_idx
  on private.benchmark_run_outputs(technical_detail_expires_at, id);
create index benchmark_measurements_output_idx
  on private.benchmark_measurements(output_id, id);
create index benchmark_judgments_run_created_idx
  on private.benchmark_judgments(run_id, created_at, id);
create index benchmark_judgments_output_idx
  on private.benchmark_judgments(output_id, id);
create index benchmark_judgments_retention_idx
  on private.benchmark_judgments(retention_expires_at, id);
create index benchmark_artifacts_run_idx
  on private.benchmark_artifact_refs(run_id, id);
create index benchmark_artifacts_output_idx
  on private.benchmark_artifact_refs(output_id, id)
  where output_id is not null;
create index benchmark_artifacts_retention_idx
  on private.benchmark_artifact_refs(retention_expires_at, id);
create index benchmark_snapshots_suite_public_idx
  on private.benchmark_leaderboard_snapshots(suite_id, as_of_at desc, id)
  where publication_state = 'published';
create index benchmark_snapshots_public_listing_idx
  on private.benchmark_leaderboard_snapshots(as_of_at desc, id desc)
  where publication_state = 'published' and visibility = 'public-verified';
create index benchmark_snapshots_retention_idx
  on private.benchmark_leaderboard_snapshots(retention_expires_at, id)
  where retention_expires_at is not null;
create index benchmark_snapshot_entries_snapshot_idx
  on private.benchmark_leaderboard_snapshot_entries(snapshot_id, entry_ordinal, id);
create index benchmark_snapshot_sources_output_idx
  on private.benchmark_leaderboard_snapshot_sources(output_id, snapshot_entry_id);
create index benchmark_signatures_subject_idx
  on private.benchmark_signatures(subject_type, subject_key, created_at desc, id);
create index benchmark_signatures_retention_idx
  on private.benchmark_signatures(retention_expires_at, id)
  where retention_expires_at is not null;

alter table private.benchmark_methodologies enable row level security;
alter table private.benchmark_suites enable row level security;
alter table private.benchmark_cases enable row level security;
alter table private.benchmark_runs enable row level security;
alter table private.benchmark_run_outputs enable row level security;
alter table private.benchmark_measurements enable row level security;
alter table private.benchmark_judgments enable row level security;
alter table private.benchmark_artifact_refs enable row level security;
alter table private.benchmark_leaderboard_snapshots enable row level security;
alter table private.benchmark_leaderboard_snapshot_entries enable row level security;
alter table private.benchmark_leaderboard_snapshot_sources enable row level security;
alter table private.benchmark_signatures enable row level security;

revoke all on table private.benchmark_methodologies from public, anon, authenticated;
revoke all on table private.benchmark_suites from public, anon, authenticated;
revoke all on table private.benchmark_cases from public, anon, authenticated;
revoke all on table private.benchmark_runs from public, anon, authenticated;
revoke all on table private.benchmark_run_outputs from public, anon, authenticated;
revoke all on table private.benchmark_measurements from public, anon, authenticated;
revoke all on table private.benchmark_judgments from public, anon, authenticated;
revoke all on table private.benchmark_artifact_refs from public, anon, authenticated;
revoke all on table private.benchmark_leaderboard_snapshots from public, anon, authenticated;
revoke all on table private.benchmark_leaderboard_snapshot_entries from public, anon, authenticated;
revoke all on table private.benchmark_leaderboard_snapshot_sources from public, anon, authenticated;
revoke all on table private.benchmark_signatures from public, anon, authenticated;
revoke all on sequence private.benchmark_measurements_id_seq from public, anon, authenticated;
revoke all on sequence private.benchmark_leaderboard_snapshot_entries_id_seq from public, anon, authenticated;

-- The private rail has no browser policies. RLS is defense in depth and all
-- application access must pass through narrow, audited server functions.

create or replace function private.set_benchmark_run_retention()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anchor timestamptz := coalesce(new.completed_at, new.created_at, pg_catalog.clock_timestamp());
begin
  if new.publication_state = 'published' then
    new.retention_class := 'public_verified';
    new.retention_expires_at := null;
  elsif new.status in ('pending', 'running', 'cancelled', 'timed-out', 'unavailable', 'failed') then
    new.retention_class := 'ephemeral_14d';
    new.retention_expires_at := v_anchor + interval '14 days';
  elsif new.execution_mode = 'fixture' then
    new.retention_class := 'fixture_90d';
    new.retention_expires_at := v_anchor + interval '90 days';
  else
    new.retention_class := 'private_180d';
    new.retention_expires_at := v_anchor + interval '180 days';
  end if;

  return new;
end;
$$;

alter function private.set_benchmark_run_retention() owner to postgres;
revoke all on function private.set_benchmark_run_retention() from public, anon, authenticated;

create trigger benchmark_runs_retention
  before insert or update of status, execution_mode, publication_state, completed_at
  on private.benchmark_runs
  for each row execute function private.set_benchmark_run_retention();

create or replace function private.enforce_benchmark_output_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform 1 from private.benchmark_runs where id = new.run_id for update;
  if not found then
    raise exception 'Benchmark run does not exist.' using errcode = '23503';
  end if;

  select pg_catalog.count(*)::integer into v_count
  from private.benchmark_run_outputs where run_id = new.run_id;
  if v_count >= 4 then
    raise exception 'A benchmark run supports at most four provider outputs.' using errcode = '23514';
  end if;
  return new;
end;
$$;

alter function private.enforce_benchmark_output_limit() owner to postgres;
revoke all on function private.enforce_benchmark_output_limit() from public, anon, authenticated;
create trigger benchmark_outputs_limit
  before insert on private.benchmark_run_outputs
  for each row execute function private.enforce_benchmark_output_limit();

create or replace function private.enforce_benchmark_measurement_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform 1 from private.benchmark_run_outputs where id = new.output_id for update;
  if not found then
    raise exception 'Benchmark output does not exist.' using errcode = '23503';
  end if;
  select pg_catalog.count(*)::integer into v_count
  from private.benchmark_measurements where output_id = new.output_id;
  if v_count >= 32 then
    raise exception 'A benchmark output supports at most 32 measurements.' using errcode = '23514';
  end if;
  return new;
end;
$$;

alter function private.enforce_benchmark_measurement_limit() owner to postgres;
revoke all on function private.enforce_benchmark_measurement_limit() from public, anon, authenticated;
create trigger benchmark_measurements_limit
  before insert on private.benchmark_measurements
  for each row execute function private.enforce_benchmark_measurement_limit();

create or replace function private.enforce_benchmark_judgment_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_output_run_id uuid;
  v_count integer;
begin
  select output.run_id into v_output_run_id
  from private.benchmark_run_outputs output
  where output.id = new.output_id;
  if v_output_run_id is null or v_output_run_id <> new.run_id then
    raise exception 'Benchmark judgment output must belong to its run.' using errcode = '23514';
  end if;

  perform 1 from private.benchmark_runs where id = new.run_id for update;
  select pg_catalog.count(*)::integer into v_count
  from private.benchmark_judgments where run_id = new.run_id;
  if v_count >= 64 then
    raise exception 'A benchmark run supports at most 64 raw judgments.' using errcode = '23514';
  end if;
  return new;
end;
$$;

alter function private.enforce_benchmark_judgment_limit() owner to postgres;
revoke all on function private.enforce_benchmark_judgment_limit() from public, anon, authenticated;
create trigger benchmark_judgments_limit
  before insert on private.benchmark_judgments
  for each row execute function private.enforce_benchmark_judgment_limit();

create or replace function private.enforce_benchmark_artifact_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_output_run_id uuid;
  v_count integer;
begin
  if new.output_id is not null then
    select output.run_id into v_output_run_id
    from private.benchmark_run_outputs output
    where output.id = new.output_id;
    if v_output_run_id is null or v_output_run_id <> new.run_id then
      raise exception 'Benchmark artifact output must belong to its run.' using errcode = '23514';
    end if;
  end if;

  perform 1 from private.benchmark_runs where id = new.run_id for update;
  select pg_catalog.count(*)::integer into v_count
  from private.benchmark_artifact_refs where run_id = new.run_id;
  if v_count >= 16 then
    raise exception 'A benchmark run supports at most 16 artifact references.' using errcode = '23514';
  end if;
  return new;
end;
$$;

alter function private.enforce_benchmark_artifact_limit() owner to postgres;
revoke all on function private.enforce_benchmark_artifact_limit() from public, anon, authenticated;
create trigger benchmark_artifacts_limit
  before insert on private.benchmark_artifact_refs
  for each row execute function private.enforce_benchmark_artifact_limit();

create or replace function private.enforce_benchmark_snapshot_entry_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform 1
  from private.benchmark_leaderboard_snapshots
  where id = new.snapshot_id
  for update;
  if not found then
    raise exception 'Benchmark snapshot does not exist.' using errcode = '23503';
  end if;
  select pg_catalog.count(*)::integer into v_count
  from private.benchmark_leaderboard_snapshot_entries
  where snapshot_id = new.snapshot_id;
  if v_count >= 100 then
    raise exception 'A benchmark snapshot supports at most 100 entries.' using errcode = '23514';
  end if;
  return new;
end;
$$;

alter function private.enforce_benchmark_snapshot_entry_limit() owner to postgres;
revoke all on function private.enforce_benchmark_snapshot_entry_limit() from public, anon, authenticated;
create trigger benchmark_snapshot_entries_limit
  before insert on private.benchmark_leaderboard_snapshot_entries
  for each row execute function private.enforce_benchmark_snapshot_entry_limit();

create or replace function private.enforce_benchmark_snapshot_source_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform 1
  from private.benchmark_leaderboard_snapshot_entries entry
  where entry.id = new.snapshot_entry_id
  for update;
  if not found then
    raise exception 'Benchmark snapshot entry does not exist.' using errcode = '23503';
  end if;
  select pg_catalog.count(*)::integer into v_count
  from private.benchmark_leaderboard_snapshot_sources source
  where source.snapshot_entry_id = new.snapshot_entry_id;
  if v_count >= 1000 then
    raise exception 'A benchmark snapshot entry supports at most 1,000 source outputs.' using errcode = '23514';
  end if;
  return new;
end;
$$;

alter function private.enforce_benchmark_snapshot_source_limit() owner to postgres;
revoke all on function private.enforce_benchmark_snapshot_source_limit() from public, anon, authenticated;
create trigger benchmark_snapshot_sources_limit
  before insert on private.benchmark_leaderboard_snapshot_sources
  for each row execute function private.enforce_benchmark_snapshot_source_limit();

create or replace function private.enforce_benchmark_signature_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if new.subject_type = 'leaderboard_snapshot' then
    perform 1
    from private.benchmark_leaderboard_snapshots snapshot
    where snapshot.id::text = new.subject_key
    for update;
    if not found then
      raise exception 'Benchmark snapshot signature subject does not exist.' using errcode = '23503';
    end if;
  else
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(new.subject_type || ':' || new.subject_key, 0)
    );
  end if;
  select pg_catalog.count(*)::integer into v_count
  from private.benchmark_signatures signature
  where signature.subject_type = new.subject_type
    and signature.subject_key = new.subject_key;
  if v_count >= 8 then
    raise exception 'A benchmark subject supports at most eight signatures.' using errcode = '23514';
  end if;
  return new;
end;
$$;

alter function private.enforce_benchmark_signature_limit() owner to postgres;
revoke all on function private.enforce_benchmark_signature_limit() from public, anon, authenticated;
create trigger benchmark_signatures_limit
  before insert on private.benchmark_signatures
  for each row execute function private.enforce_benchmark_signature_limit();

-- Published evidence is immutable. A later correction must create a new run or
-- snapshot, or explicitly revoke the public parent. The only post-publication
-- output mutation allowed is bounded redaction of expiring technical detail.
create or replace function private.freeze_published_benchmark_run()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.publication_state <> 'published' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.publication_state = 'revoked'
     and (pg_catalog.to_jsonb(new) - array['publication_state', 'visibility', 'revoked_at', 'retention_class', 'retention_expires_at'])
       = (pg_catalog.to_jsonb(old) - array['publication_state', 'visibility', 'revoked_at', 'retention_class', 'retention_expires_at']) then
    return new;
  end if;
  raise exception 'Published benchmark runs are immutable; revoke or create a new run.' using errcode = '55000';
end;
$$;

alter function private.freeze_published_benchmark_run() owner to postgres;
revoke all on function private.freeze_published_benchmark_run() from public, anon, authenticated;
create trigger benchmark_runs_freeze
  before update or delete on private.benchmark_runs
  for each row execute function private.freeze_published_benchmark_run();

create or replace function private.freeze_published_benchmark_output()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id uuid := case when tg_op = 'INSERT' then new.run_id else old.run_id end;
  v_publication_state text;
begin
  if tg_op = 'UPDATE' and new.run_id <> old.run_id then
    raise exception 'Benchmark outputs cannot move between runs.' using errcode = '23514';
  end if;
  select run.publication_state into v_publication_state
  from private.benchmark_runs run where run.id = v_run_id for update;
  if v_publication_state <> 'published' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE'
     and (pg_catalog.to_jsonb(new) - array['technical_trace', 'sanitized_error', 'technical_detail_expires_at'])
       = (pg_catalog.to_jsonb(old) - array['technical_trace', 'sanitized_error', 'technical_detail_expires_at']) then
    return new;
  end if;
  raise exception 'Published benchmark outputs are immutable except for technical-detail redaction.' using errcode = '55000';
end;
$$;

alter function private.freeze_published_benchmark_output() owner to postgres;
revoke all on function private.freeze_published_benchmark_output() from public, anon, authenticated;
create trigger benchmark_outputs_freeze
  before insert or update or delete on private.benchmark_run_outputs
  for each row execute function private.freeze_published_benchmark_output();

create or replace function private.freeze_published_benchmark_measurement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_output_id uuid := case when tg_op = 'INSERT' then new.output_id else old.output_id end;
  v_publication_state text;
begin
  if tg_op = 'UPDATE' and new.output_id <> old.output_id then
    raise exception 'Benchmark measurements cannot move between outputs.' using errcode = '23514';
  end if;
  select run.publication_state into v_publication_state
  from private.benchmark_runs run
  join private.benchmark_run_outputs output on output.run_id = run.id
  where output.id = v_output_id
  for update of run;
  if v_publication_state = 'published' then
    raise exception 'Published benchmark measurements are immutable.' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

alter function private.freeze_published_benchmark_measurement() owner to postgres;
revoke all on function private.freeze_published_benchmark_measurement() from public, anon, authenticated;
create trigger benchmark_measurements_freeze
  before insert or update or delete on private.benchmark_measurements
  for each row execute function private.freeze_published_benchmark_measurement();

create or replace function private.freeze_published_benchmark_raw_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id uuid := case when tg_op = 'INSERT' then new.run_id else old.run_id end;
  v_publication_state text;
  v_retention_expires_at timestamptz := case
    when tg_op = 'INSERT' then new.retention_expires_at else old.retention_expires_at end;
begin
  if tg_op = 'UPDATE'
     and (
       new.run_id <> old.run_id
       or new.output_id is distinct from old.output_id
     ) then
    raise exception 'Benchmark raw evidence cannot move between runs or outputs.' using errcode = '23514';
  end if;
  select run.publication_state into v_publication_state
  from private.benchmark_runs run where run.id = v_run_id for update;
  if v_publication_state = 'published' then
    if tg_op = 'DELETE' and v_retention_expires_at <= pg_catalog.clock_timestamp() then
      return old;
    end if;
    raise exception 'Published benchmark raw evidence is immutable until bounded retention cleanup.' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

alter function private.freeze_published_benchmark_raw_evidence() owner to postgres;
revoke all on function private.freeze_published_benchmark_raw_evidence() from public, anon, authenticated;
create trigger benchmark_judgments_freeze
  before insert or update or delete on private.benchmark_judgments
  for each row execute function private.freeze_published_benchmark_raw_evidence();
create trigger benchmark_artifacts_freeze
  before insert or update or delete on private.benchmark_artifact_refs
  for each row execute function private.freeze_published_benchmark_raw_evidence();

create or replace function private.freeze_published_benchmark_catalog()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_referenced boolean := false;
begin
  if tg_table_name = 'benchmark_methodologies' then
    v_referenced := old.lifecycle_state = 'published' and (
      exists (
        select 1 from private.benchmark_leaderboard_snapshots snapshot
        where snapshot.methodology_id = old.methodology_id
          and snapshot.methodology_version = old.version
          and snapshot.publication_state = 'published'
      )
      or exists (
        select 1 from private.benchmark_suites suite
        join private.benchmark_cases benchmark_case on benchmark_case.suite_id = suite.id
        join private.benchmark_runs run on run.case_id = benchmark_case.id
        where suite.methodology_id = old.methodology_id
          and suite.methodology_version = old.version
          and run.publication_state = 'published'
      )
    );
  elsif tg_table_name = 'benchmark_suites' then
    v_referenced := exists (
      select 1 from private.benchmark_leaderboard_snapshots snapshot
      where snapshot.suite_id = old.id and snapshot.publication_state = 'published'
    ) or exists (
      select 1 from private.benchmark_cases benchmark_case
      join private.benchmark_runs run on run.case_id = benchmark_case.id
      where benchmark_case.suite_id = old.id and run.publication_state = 'published'
    );
  else
    v_referenced := exists (
      select 1 from private.benchmark_runs run
      where run.case_id = old.id and run.publication_state = 'published'
    );
  end if;

  if not v_referenced then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.lifecycle_state = 'retired'
     and (pg_catalog.to_jsonb(new) - array['lifecycle_state', 'retired_at', 'retention_expires_at'])
       = (pg_catalog.to_jsonb(old) - array['lifecycle_state', 'retired_at', 'retention_expires_at']) then
    return new;
  end if;
  raise exception 'Published benchmark catalog versions are immutable; retire or create a new version.' using errcode = '55000';
end;
$$;

alter function private.freeze_published_benchmark_catalog() owner to postgres;
revoke all on function private.freeze_published_benchmark_catalog() from public, anon, authenticated;
create trigger benchmark_methodologies_freeze
  before update or delete on private.benchmark_methodologies
  for each row execute function private.freeze_published_benchmark_catalog();
create trigger benchmark_suites_freeze
  before update or delete on private.benchmark_suites
  for each row execute function private.freeze_published_benchmark_catalog();
create trigger benchmark_cases_freeze
  before update or delete on private.benchmark_cases
  for each row execute function private.freeze_published_benchmark_catalog();

create or replace function private.freeze_published_benchmark_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.publication_state <> 'published' then
    if exists (
      select 1 from private.benchmark_signatures signature
      where signature.subject_type = 'leaderboard_snapshot'
        and signature.subject_key = old.id::text
        and signature.content_hash = old.snapshot_hash
        and signature.verification_state = 'signature-verified'
    ) then
      if tg_op = 'UPDATE'
         and new.publication_state = 'published'
         and (pg_catalog.to_jsonb(new) - array[
           'publication_state', 'visibility', 'verified_at', 'verified_by',
           'published_at', 'revoked_at', 'public_payload', 'public_payload_canonical',
           'retention_class', 'retention_expires_at'
         ]) = (pg_catalog.to_jsonb(old) - array[
           'publication_state', 'visibility', 'verified_at', 'verified_by',
           'published_at', 'revoked_at', 'public_payload', 'public_payload_canonical',
           'retention_class', 'retention_expires_at'
         ]) then
        return new;
      end if;
      raise exception 'Verified benchmark snapshot payloads are immutable.' using errcode = '55000';
    end if;
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.publication_state = 'revoked'
     and (pg_catalog.to_jsonb(new) - array['publication_state', 'visibility', 'revoked_at', 'retention_class', 'retention_expires_at'])
       = (pg_catalog.to_jsonb(old) - array['publication_state', 'visibility', 'revoked_at', 'retention_class', 'retention_expires_at']) then
    return new;
  end if;
  raise exception 'Published benchmark snapshots are immutable; revoke or create a new snapshot.' using errcode = '55000';
end;
$$;

alter function private.freeze_published_benchmark_snapshot() owner to postgres;
revoke all on function private.freeze_published_benchmark_snapshot() from public, anon, authenticated;
create trigger benchmark_snapshots_freeze
  before update or delete on private.benchmark_leaderboard_snapshots
  for each row execute function private.freeze_published_benchmark_snapshot();

create or replace function private.freeze_published_benchmark_snapshot_child()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot_id uuid;
  v_publication_state text;
begin
  if tg_table_name = 'benchmark_leaderboard_snapshot_entries' then
    if tg_op = 'UPDATE' and new.snapshot_id <> old.snapshot_id then
      raise exception 'Benchmark snapshot entries cannot move between snapshots.' using errcode = '23514';
    end if;
    v_snapshot_id := case when tg_op = 'INSERT' then new.snapshot_id else old.snapshot_id end;
  else
    if tg_op = 'UPDATE'
       and (new.snapshot_entry_id <> old.snapshot_entry_id or new.output_id <> old.output_id) then
      raise exception 'Benchmark snapshot sources are immutable identity links.' using errcode = '23514';
    end if;
    select entry.snapshot_id into v_snapshot_id
    from private.benchmark_leaderboard_snapshot_entries entry
    where entry.id = case when tg_op = 'INSERT' then new.snapshot_entry_id else old.snapshot_entry_id end;
  end if;
  select snapshot.publication_state into v_publication_state
  from private.benchmark_leaderboard_snapshots snapshot
  where snapshot.id = v_snapshot_id
  for update;
  if v_publication_state = 'published'
     or exists (
       select 1 from private.benchmark_signatures signature
       where signature.subject_type = 'leaderboard_snapshot'
         and signature.subject_key = v_snapshot_id::text
         and signature.verification_state = 'signature-verified'
     ) then
    raise exception 'Signed or published benchmark snapshot evidence is immutable.' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

alter function private.freeze_published_benchmark_snapshot_child() owner to postgres;
revoke all on function private.freeze_published_benchmark_snapshot_child() from public, anon, authenticated;
create trigger benchmark_snapshot_entries_freeze
  before insert or update or delete on private.benchmark_leaderboard_snapshot_entries
  for each row execute function private.freeze_published_benchmark_snapshot_child();
create trigger benchmark_snapshot_sources_freeze
  before insert or update or delete on private.benchmark_leaderboard_snapshot_sources
  for each row execute function private.freeze_published_benchmark_snapshot_child();

create or replace function private.freeze_published_benchmark_signature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject_type text := case when tg_op = 'INSERT' then new.subject_type else old.subject_type end;
  v_subject_key text := case when tg_op = 'INSERT' then new.subject_key else old.subject_key end;
begin
  if tg_op = 'UPDATE'
     and (
       new.subject_type <> old.subject_type
       or new.subject_key <> old.subject_key
       or new.content_hash <> old.content_hash
       or new.signature_schema_version <> old.signature_schema_version
       or new.payload_schema_version <> old.payload_schema_version
       or new.signature_algorithm <> old.signature_algorithm
       or new.public_key_id <> old.public_key_id
       or new.signature_base64 <> old.signature_base64
       or new.signed_at <> old.signed_at
     ) then
    raise exception 'Benchmark signature envelopes are immutable.' using errcode = '23514';
  end if;
  if v_subject_type = 'leaderboard_snapshot'
     and exists (
       select 1 from private.benchmark_leaderboard_snapshots snapshot
       where snapshot.id::text = v_subject_key and snapshot.publication_state = 'published'
       for update
     ) then
    raise exception 'Published benchmark snapshot signatures are immutable.' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

alter function private.freeze_published_benchmark_signature() owner to postgres;
revoke all on function private.freeze_published_benchmark_signature() from public, anon, authenticated;
create trigger benchmark_signatures_freeze
  before insert or update or delete on private.benchmark_signatures
  for each row execute function private.freeze_published_benchmark_signature();

-- ONE canonical JSON mirrors the application rule for the bounded types used
-- by the public snapshot proof: object keys sort lexically, arrays retain
-- order, strings retain JSON escaping, and numeric scale is normalized.
create or replace function private.canonicalize_benchmark_jsonb(p_value jsonb)
returns text
language plpgsql
stable
strict
set search_path = ''
as $$
declare
  v_result text;
begin
  if pg_catalog.jsonb_typeof(p_value) = 'object'
     and exists (
       select 1
       from pg_catalog.jsonb_object_keys(p_value) object_key(value)
       where (object_key.value collate "C") !~ '^[ -~]{1,80}$'
     ) then
    raise exception 'Canonical benchmark JSON object keys must be 1-80 printable ASCII characters.'
      using errcode = '22023';
  end if;
  case pg_catalog.jsonb_typeof(p_value)
    when 'object' then
      select '{' || coalesce(pg_catalog.string_agg(
        pg_catalog.to_jsonb(item.key)::text || ':' || private.canonicalize_benchmark_jsonb(item.value),
        ',' order by item.key collate "C"
      ), '') || '}' into v_result
      from pg_catalog.jsonb_each(p_value) item;
    when 'array' then
      select '[' || coalesce(pg_catalog.string_agg(
        private.canonicalize_benchmark_jsonb(item.value),
        ',' order by item.ordinality
      ), '') || ']' into v_result
      from pg_catalog.jsonb_array_elements(p_value) with ordinality item(value, ordinality);
    when 'number' then
      v_result := pg_catalog.trim_scale((p_value #>> '{}')::numeric)::text;
    else
      v_result := p_value::text;
  end case;
  return v_result;
end;
$$;

alter function private.canonicalize_benchmark_jsonb(jsonb) owner to postgres;
revoke all on function private.canonicalize_benchmark_jsonb(jsonb) from public, anon, authenticated;

create or replace function private.benchmark_jsonb_sha256(p_value jsonb)
returns text
language sql
stable
strict
set search_path = ''
as $$
  select 'sha256:' || pg_catalog.encode(
    extensions.digest(private.canonicalize_benchmark_jsonb(p_value), 'sha256'),
    'hex'
  );
$$;

alter function private.benchmark_jsonb_sha256(jsonb) owner to postgres;
revoke all on function private.benchmark_jsonb_sha256(jsonb) from public, anon, authenticated;

create or replace function private.benchmark_text_sha256(p_value text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select 'sha256:' || pg_catalog.encode(extensions.digest(p_value, 'sha256'), 'hex');
$$;

alter function private.benchmark_text_sha256(text) owner to postgres;
revoke all on function private.benchmark_text_sha256(text) from public, anon, authenticated;

-- PostgreSQL numeric and ECMAScript JSON number formatting diverge outside
-- JSON.stringify's non-exponent interval. Cross-runtime configuration digests
-- therefore admit only zero or magnitudes in [1e-6, 1e21).
create or replace function private.benchmark_jsonb_numbers_are_cross_runtime_safe(p_value jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_item jsonb;
  v_number numeric;
begin
  case pg_catalog.jsonb_typeof(p_value)
    when 'number' then
      v_number := (p_value #>> '{}')::numeric;
      return v_number = 0
        or (pg_catalog.abs(v_number) >= 0.000001::numeric
          and pg_catalog.abs(v_number) < 1000000000000000000000::numeric);
    when 'array' then
      for v_item in select value from pg_catalog.jsonb_array_elements(p_value) loop
        if not private.benchmark_jsonb_numbers_are_cross_runtime_safe(v_item) then
          return false;
        end if;
      end loop;
    when 'object' then
      for v_item in select value from pg_catalog.jsonb_each(p_value) loop
        if not private.benchmark_jsonb_numbers_are_cross_runtime_safe(v_item) then
          return false;
        end if;
      end loop;
    else
      null;
  end case;
  return true;
end;
$$;

alter function private.benchmark_jsonb_numbers_are_cross_runtime_safe(jsonb) owner to postgres;
revoke all on function private.benchmark_jsonb_numbers_are_cross_runtime_safe(jsonb) from public, anon, authenticated;

create or replace function private.benchmark_jsonb_object_key_count_within(
  p_value jsonb,
  p_maximum integer
)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select p_maximum between 0 and 10000
    and pg_catalog.jsonb_typeof(p_value) = 'object'
    and (
      select pg_catalog.count(*) <= p_maximum
      from pg_catalog.jsonb_object_keys(p_value)
    );
$$;

alter function private.benchmark_jsonb_object_key_count_within(jsonb, integer) owner to postgres;
revoke all on function private.benchmark_jsonb_object_key_count_within(jsonb, integer) from public, anon, authenticated;

create or replace function private.is_valid_benchmark_configuration(p_value jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_key text;
  v_value jsonb;
  v_element jsonb;
  v_type text;
begin
  if pg_catalog.jsonb_typeof(p_value) <> 'object'
     or pg_catalog.octet_length(p_value::text) > 65536
     or not private.benchmark_jsonb_object_key_count_within(p_value, 256) then
    return false;
  end if;
  for v_key, v_value in select key, value from pg_catalog.jsonb_each(p_value) loop
    if (v_key collate "C") !~ '^[A-Za-z][A-Za-z0-9._-]{0,79}$'
       or v_key ~* '(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|cookie|password|internal[_-]?url|raw.*payload)' then
      return false;
    end if;
    v_type := pg_catalog.jsonb_typeof(v_value);
    if v_type = 'string' then
      if char_length(v_value #>> '{}') > 2000 then return false; end if;
    elsif v_type = 'number' then
      if not private.benchmark_jsonb_numbers_are_cross_runtime_safe(v_value) then return false; end if;
    elsif v_type in ('boolean', 'null') then
      null;
    elsif v_type = 'array' then
      if pg_catalog.jsonb_array_length(v_value) > 40 then return false; end if;
      for v_element in select value from pg_catalog.jsonb_array_elements(v_value) loop
        v_type := pg_catalog.jsonb_typeof(v_element);
        if v_type = 'string' then
          if char_length(v_element #>> '{}') > 2000 then return false; end if;
        elsif v_type = 'number' then
          if not private.benchmark_jsonb_numbers_are_cross_runtime_safe(v_element) then return false; end if;
        elsif v_type not in ('boolean', 'null') then
          return false;
        end if;
      end loop;
    else
      return false;
    end if;
  end loop;
  return true;
end;
$$;

alter function private.is_valid_benchmark_configuration(jsonb) owner to postgres;
revoke all on function private.is_valid_benchmark_configuration(jsonb) from public, anon, authenticated;

alter table private.benchmark_methodologies
  add constraint benchmark_methodologies_definition_cross_runtime_numbers_check
  check (private.benchmark_jsonb_numbers_are_cross_runtime_safe(definition));
alter table private.benchmark_run_outputs
  add constraint benchmark_outputs_configuration_cross_runtime_numbers_check
  check (private.benchmark_jsonb_numbers_are_cross_runtime_safe(provider_configuration));
alter table private.benchmark_run_outputs
  add constraint benchmark_outputs_configuration_shape_check
  check (private.is_valid_benchmark_configuration(provider_configuration));
alter table private.benchmark_leaderboard_snapshots
  add constraint benchmark_snapshots_filters_cross_runtime_numbers_check
  check (private.benchmark_jsonb_numbers_are_cross_runtime_safe(disclosed_filters));
alter table private.benchmark_leaderboard_snapshots
  add constraint benchmark_snapshots_filters_key_count_check
  check (private.benchmark_jsonb_object_key_count_within(disclosed_filters, 128));

create or replace function private.is_safe_public_benchmark_provenance(p_value jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_key text;
  v_value jsonb;
  v_text text;
begin
  if pg_catalog.jsonb_typeof(p_value) <> 'object'
     or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(p_value)) > 16
     or pg_catalog.octet_length(p_value::text) > 4096 then
    return false;
  end if;
  for v_key, v_value in select key, value from pg_catalog.jsonb_each(p_value) loop
    if (v_key collate "C") !~ '^[A-Za-z][A-Za-z0-9._-]{0,79}$'
       or pg_catalog.jsonb_typeof(v_value) <> 'string' then
      return false;
    end if;
    v_text := v_value #>> '{}';
    if char_length(v_text) not between 1 and 160
       or (v_text collate "C") !~ '^[A-Za-z0-9]+([._:/-][A-Za-z0-9]+)*$' then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

alter function private.is_safe_public_benchmark_provenance(jsonb) owner to postgres;
revoke all on function private.is_safe_public_benchmark_provenance(jsonb) from public, anon, authenticated;

alter table private.benchmark_leaderboard_snapshot_entries
  add constraint benchmark_snapshot_entries_public_provenance_check
  check (private.is_safe_public_benchmark_provenance(provenance));

alter table private.benchmark_leaderboard_snapshots
  add constraint benchmark_snapshots_public_provenance_check
  check (
    private.is_safe_public_benchmark_provenance(provenance)
    and provenance_hash = private.benchmark_jsonb_sha256(provenance)
  );

create or replace function private.benchmark_snapshot_scope_hashes(p_snapshot_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_snapshot private.benchmark_leaderboard_snapshots%rowtype;
  v_suite private.benchmark_suites%rowtype;
  v_case private.benchmark_cases%rowtype;
begin
  select * into v_snapshot
  from private.benchmark_leaderboard_snapshots snapshot
  where snapshot.id = p_snapshot_id;
  if not found then return null; end if;
  select * into v_suite from private.benchmark_suites where id = v_snapshot.suite_id;
  select * into v_case from private.benchmark_cases where id = v_snapshot.case_id;

  return pg_catalog.jsonb_build_object(
    'filtersHash', private.benchmark_jsonb_sha256(v_snapshot.disclosed_filters),
    'metricScopeHash', private.benchmark_jsonb_sha256(pg_catalog.jsonb_build_object(
      'category', v_snapshot.benchmark_category,
      'metricName', v_snapshot.metric_name,
      'metricVersion', v_snapshot.metric_version,
      'statistic', v_snapshot.statistic,
      'rankingDirection', v_snapshot.ranking_direction,
      'decimalPlaces', v_snapshot.decimal_places,
      'unit', v_snapshot.unit,
      'measurementPoint', v_snapshot.measurement_point,
      'provenanceVersion', v_snapshot.provenance_version,
      'provenanceHash', v_snapshot.provenance_hash,
      'minimumSampleCount', v_snapshot.minimum_sample_count,
      'allowSynthetic', v_snapshot.allow_synthetic,
      'calculationVersion', v_snapshot.calculation_version,
      'eligibilityProfileVersion', v_snapshot.eligibility_profile_version,
      'scoringProfileVersion', v_snapshot.scoring_profile_version
    )),
    'scenarioScopeHash', private.benchmark_jsonb_sha256(pg_catalog.jsonb_build_object(
      'suiteRef', pg_catalog.jsonb_build_object('id', v_suite.suite_key, 'version', v_suite.version),
      'caseRef', pg_catalog.jsonb_build_object(
        'id', v_case.case_key,
        'version', v_case.version,
        'inputHash', v_snapshot.input_hash
      )
    )),
    'populationHash', private.benchmark_jsonb_sha256(pg_catalog.jsonb_build_object(
      'category', v_snapshot.benchmark_category,
      'suiteRef', pg_catalog.jsonb_build_object('id', v_suite.suite_key, 'version', v_suite.version),
      'caseRef', pg_catalog.jsonb_build_object(
        'id', v_case.case_key,
        'version', v_case.version,
        'inputHash', v_snapshot.input_hash
      ),
      'methodologyRef', pg_catalog.jsonb_build_object(
        'id', v_snapshot.methodology_id,
        'version', v_snapshot.methodology_version
      ),
      'methodologyVersion', v_snapshot.methodology_version,
      'metricVersion', v_snapshot.metric_version,
      'executionMode', v_snapshot.execution_mode,
      'evaluationMode', v_snapshot.comparison_mode,
      'environment', v_snapshot.environment,
      'deployment', v_snapshot.deployment,
      'language', v_snapshot.language,
      'region', v_snapshot.region,
      'transport', v_snapshot.transport,
      'codec', v_snapshot.codec,
      'sampleRateHz', v_snapshot.sample_rate_hz,
      'channels', v_snapshot.channels,
      'thermalState', v_snapshot.thermal_state
    ))
  );
end;
$$;

alter function private.benchmark_snapshot_scope_hashes(uuid) owner to postgres;
revoke all on function private.benchmark_snapshot_scope_hashes(uuid) from public, anon, authenticated;

create or replace function private.benchmark_snapshot_scope_hashes_valid(p_snapshot_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select hashes.value is not null
    and snapshot.filters_hash = hashes.value ->> 'filtersHash'
    and snapshot.metric_scope_hash = hashes.value ->> 'metricScopeHash'
    and snapshot.provenance_hash = private.benchmark_jsonb_sha256(snapshot.provenance)
    and snapshot.scenario_scope_hash = hashes.value ->> 'scenarioScopeHash'
    and snapshot.population_hash = hashes.value ->> 'populationHash'
    and methodology.content_hash = private.benchmark_jsonb_sha256(methodology.definition)
    and (
      benchmark_case.input_type <> 'text'
      or benchmark_case.input_hash = private.benchmark_text_sha256(benchmark_case.exact_input_text)
    )
  from private.benchmark_leaderboard_snapshots snapshot
  join private.benchmark_cases benchmark_case on benchmark_case.id = snapshot.case_id
  join private.benchmark_suites suite on suite.id = snapshot.suite_id
  join private.benchmark_methodologies methodology
    on methodology.methodology_id = suite.methodology_id
   and methodology.version = suite.methodology_version
  cross join lateral (
    select private.benchmark_snapshot_scope_hashes(snapshot.id) as value
  ) hashes
  where snapshot.id = p_snapshot_id;
$$;

alter function private.benchmark_snapshot_scope_hashes_valid(uuid) owner to postgres;
revoke all on function private.benchmark_snapshot_scope_hashes_valid(uuid) from public, anon, authenticated;

create or replace function private.benchmark_snapshot_source_hash(p_entry_id bigint)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'sha256:' || pg_catalog.encode(
    extensions.digest(
      private.canonicalize_benchmark_jsonb(coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'outputContentHash', output.output_content_hash,
            'status', source.source_status,
            'failureCode', source.failure_code,
            'runSponsorshipDisclosure', run.sponsorship_disclosure,
            'outputSponsorshipDisclosure', output.sponsorship_disclosure,
            'runBundleHash', run.bundle_hash,
            'requestStartedAt', case when output.request_started_at is null then null else
              pg_catalog.to_char(output.request_started_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
            'completedAt', case when run.completed_at is null then null else
              pg_catalog.to_char(run.completed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
            'metricName', measurement.metric_name,
            'metricVersion', measurement.metric_version,
            'measurementPoint', measurement.measurement_point,
            'unit', measurement.unit,
            'value', measurement.metric_value,
            'provenance', measurement.provenance
          ) order by output.output_content_hash, output.id
        )
        from private.benchmark_leaderboard_snapshot_sources source
        join private.benchmark_leaderboard_snapshot_entries entry
          on entry.id = source.snapshot_entry_id
        join private.benchmark_run_outputs output on output.id = source.output_id
        join private.benchmark_runs run on run.id = output.run_id
        left join private.benchmark_measurements measurement
          on measurement.output_id = output.id
         and measurement.metric_name = entry.metric_name
         and measurement.metric_version = entry.metric_version
         and measurement.measurement_point = entry.measurement_point
        where source.snapshot_entry_id = p_entry_id
      ), '[]'::jsonb)),
      'sha256'
    ),
    'hex'
  );
$$;

alter function private.benchmark_snapshot_source_hash(bigint) owner to postgres;
revoke all on function private.benchmark_snapshot_source_hash(bigint) from public, anon, authenticated;

create or replace function private.benchmark_snapshot_public_payload(p_snapshot_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_snapshot private.benchmark_leaderboard_snapshots%rowtype;
  v_suite private.benchmark_suites%rowtype;
  v_case private.benchmark_cases%rowtype;
  v_methodology_content_hash text;
begin
  select * into v_snapshot
  from private.benchmark_leaderboard_snapshots snapshot
  where snapshot.id = p_snapshot_id;
  if not found then
    return null;
  end if;
  select * into v_suite from private.benchmark_suites where id = v_snapshot.suite_id;
  select * into v_case from private.benchmark_cases where id = v_snapshot.case_id;
  select methodology.content_hash into v_methodology_content_hash
  from private.benchmark_methodologies methodology
  where methodology.methodology_id = v_snapshot.methodology_id
    and methodology.version = v_snapshot.methodology_version;

  return pg_catalog.jsonb_build_object(
    'schemaVersion', 'one-benchmark-db-public-payload/1.0.0',
    'snapshotId', v_snapshot.id,
    'suite', pg_catalog.jsonb_build_object(
      'id', v_suite.suite_key,
      'version', v_suite.version,
      'name', v_suite.name,
      'datasetVersion', v_suite.dataset_version,
      'datasetLicense', v_suite.dataset_license,
      'inputManifestHash', v_suite.input_manifest_hash
    ),
    'case', pg_catalog.jsonb_build_object(
      'id', v_case.case_key,
      'version', v_case.version,
      'inputHash', v_snapshot.input_hash
    ),
    'methodology', pg_catalog.jsonb_build_object(
      'id', v_snapshot.methodology_id,
      'version', v_snapshot.methodology_version,
      'contentHash', v_methodology_content_hash
    ),
    'calculationVersion', v_snapshot.calculation_version,
    'eligibilityProfileVersion', v_snapshot.eligibility_profile_version,
    'scoringProfileVersion', v_snapshot.scoring_profile_version,
    'scope', pg_catalog.jsonb_build_object(
      'category', v_snapshot.benchmark_category,
      'comparisonMode', v_snapshot.comparison_mode,
      'executionMode', v_snapshot.execution_mode,
      'environment', v_snapshot.environment,
      'deployment', v_snapshot.deployment,
      'language', v_snapshot.language,
      'region', v_snapshot.region,
      'transport', v_snapshot.transport,
      'codec', v_snapshot.codec,
      'sampleRateHz', v_snapshot.sample_rate_hz,
      'channels', v_snapshot.channels,
      'thermalState', v_snapshot.thermal_state,
      'metricName', v_snapshot.metric_name,
      'metricVersion', v_snapshot.metric_version,
      'statistic', v_snapshot.statistic,
      'rankingDirection', v_snapshot.ranking_direction,
      'decimalPlaces', v_snapshot.decimal_places,
      'unit', v_snapshot.unit,
      'measurementPoint', v_snapshot.measurement_point,
      'provenanceVersion', v_snapshot.provenance_version,
      'provenance', v_snapshot.provenance,
      'provenanceHash', v_snapshot.provenance_hash,
      'minimumSampleCount', v_snapshot.minimum_sample_count,
      'syntheticAllowed', v_snapshot.allow_synthetic,
      'freshnessCutoffAt', pg_catalog.to_char(
        v_snapshot.freshness_cutoff_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      ),
      'disclosedFilters', v_snapshot.disclosed_filters,
      'filtersHash', v_snapshot.filters_hash,
      'metricScopeHash', v_snapshot.metric_scope_hash,
      'scenarioScopeHash', v_snapshot.scenario_scope_hash
    ),
    'populationHash', v_snapshot.population_hash,
    'sourceMaxCompletedAt', pg_catalog.to_char(
      v_snapshot.source_max_completed_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ),
    'asOfAt', pg_catalog.to_char(
      v_snapshot.as_of_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ),
    'sampleCount', v_snapshot.sample_count,
    'sponsorshipDisclosures', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(disclosure.value) order by disclosure.value)
      from (
        select distinct source_disclosure.value #>> '{}' as value
        from private.benchmark_leaderboard_snapshot_entries entry
        cross join lateral pg_catalog.jsonb_array_elements(entry.sponsorship_disclosures)
          source_disclosure(value)
        where entry.snapshot_id = v_snapshot.id
      ) disclosure
    ), '[]'::jsonb),
    'entries', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'ordinal', entry.entry_ordinal,
          'providerId', entry.provider_id,
          'providerDisplayName', entry.provider_display_name,
          'providerReadiness', entry.provider_readiness,
          'adapterVersion', entry.adapter_version,
          'modelId', entry.model_id,
          'modelVersion', entry.model_version,
          'voiceId', entry.voice_id,
          'configurationHash', entry.configuration_hash,
          'capability', entry.capability,
          'deployment', entry.deployment,
          'region', entry.region,
          'transport', entry.transport,
          'codec', entry.codec,
          'sampleRateHz', entry.sample_rate_hz,
          'channels', entry.channels,
          'thermalState', entry.thermal_state,
          'inclusionState', entry.inclusion_state,
          'sourceStatus', entry.source_status,
          'failureCode', entry.failure_code,
          'exclusionReason', entry.exclusion_reason,
          'sponsorshipDisclosures', entry.sponsorship_disclosures,
          'evidenceCategory', entry.evidence_category,
          'metricName', entry.metric_name,
          'metricVersion', entry.metric_version,
          'statistic', entry.statistic,
          'value', entry.metric_value,
          'unit', entry.unit,
          'measurementPoint', entry.measurement_point,
          'provenanceVersion', entry.provenance_version,
          'provenance', entry.provenance,
          'sourceEvidenceHash', private.benchmark_snapshot_source_hash(entry.id),
          'sampleCount', entry.sample_count,
          'rank', entry.rank_ordinal,
          'tied', entry.tied,
          'tieGroup', entry.tie_group
        ) order by entry.entry_ordinal, entry.id
      )
      from private.benchmark_leaderboard_snapshot_entries entry
      where entry.snapshot_id = v_snapshot.id
    ), '[]'::jsonb)
  );
end;
$$;

alter function private.benchmark_snapshot_public_payload(uuid) owner to postgres;
revoke all on function private.benchmark_snapshot_public_payload(uuid) from public, anon, authenticated;

create or replace function private.benchmark_snapshot_content_hash(p_snapshot_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when payload.value is null then null else
    'sha256:' || pg_catalog.encode(
      extensions.digest(private.canonicalize_benchmark_jsonb(payload.value), 'sha256'),
      'hex'
    ) end
  from (select private.benchmark_snapshot_public_payload(p_snapshot_id) as value) payload;
$$;

alter function private.benchmark_snapshot_content_hash(uuid) owner to postgres;
revoke all on function private.benchmark_snapshot_content_hash(uuid) from public, anon, authenticated;

create or replace function private.benchmark_snapshot_aggregates_valid(p_snapshot_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_snapshot private.benchmark_leaderboard_snapshots%rowtype;
  v_invalid_count integer;
begin
  select * into v_snapshot
  from private.benchmark_leaderboard_snapshots snapshot
  where snapshot.id = p_snapshot_id;
  if not found
     or v_snapshot.statistic not in ('count', 'mean', 'median', 'p50', 'p95')
     or not coalesce(private.benchmark_snapshot_scope_hashes_valid(p_snapshot_id), false) then
    return false;
  end if;

  if exists (
    select 1
    from private.benchmark_leaderboard_snapshot_sources source
    join private.benchmark_leaderboard_snapshot_entries entry
      on entry.id = source.snapshot_entry_id
    join private.benchmark_run_outputs output
      on output.id = source.output_id
    where entry.snapshot_id = p_snapshot_id
      and (
        output.configuration_hash <> private.benchmark_jsonb_sha256(output.provider_configuration)
        or source.source_status <> output.status
        or source.failure_code is distinct from output.failure_code
        or (
          entry.inclusion_state = 'included'
          and entry.metric_name = 'request-success'
          and not coalesce(private.benchmark_request_outcome_is_provider_attributable(
            output.status,
            output.failure_code,
            output.request_started_at
          ), false)
        )
      )
  ) then
    return false;
  end if;

  if exists (
    select 1
    from private.benchmark_leaderboard_snapshot_entries entry
    cross join lateral (
      select
        case
          when pg_catalog.bool_and(source.source_status = 'complete') then 'complete'
          when pg_catalog.count(distinct source.source_status) = 1
            and pg_catalog.count(distinct source.failure_code) = 1
            then pg_catalog.min(source.source_status)
          else 'mixed'
        end as source_status,
        case
          when pg_catalog.bool_and(source.source_status = 'complete') then null::text
          when pg_catalog.count(distinct source.source_status) = 1
            and pg_catalog.count(distinct source.failure_code) = 1
            then pg_catalog.min(source.failure_code)
          else null::text
        end as failure_code
      from private.benchmark_leaderboard_snapshot_sources source
      where source.snapshot_entry_id = entry.id
    ) summary
    where entry.snapshot_id = p_snapshot_id
      and (
        entry.source_status <> summary.source_status
        or entry.failure_code is distinct from summary.failure_code
      )
  ) then
    return false;
  end if;

  if exists (
    select 1
    from private.benchmark_leaderboard_snapshot_entries entry
    join private.benchmark_leaderboard_snapshot_sources source
      on source.snapshot_entry_id = entry.id
    left join private.benchmark_measurements measurement
      on measurement.output_id = source.output_id
     and measurement.metric_name = entry.metric_name
     and measurement.metric_version = entry.metric_version
     and measurement.measurement_point = entry.measurement_point
     and measurement.unit = entry.unit
     and measurement.availability = 'measured'
    where entry.snapshot_id = p_snapshot_id
      and entry.inclusion_state = 'included'
      and (
        measurement.id is null
        or entry.provenance_version <> v_snapshot.provenance_version
        or entry.provenance is distinct from v_snapshot.provenance
        or measurement.provenance is distinct from v_snapshot.provenance
      )
  ) then
    return false;
  end if;

  with observed as (
    select
      entry.id,
      pg_catalog.count(measurement.id)::integer as observed_count,
      (case v_snapshot.statistic
        when 'count' then pg_catalog.count(measurement.id)::numeric
        when 'mean' then pg_catalog.avg(measurement.metric_value)
        when 'median' then pg_catalog.percentile_cont(0.5) within group (order by measurement.metric_value)
        when 'p50' then pg_catalog.percentile_cont(0.5) within group (order by measurement.metric_value)
        when 'p95' then pg_catalog.percentile_disc(0.95) within group (order by measurement.metric_value)
      end)::numeric as raw_value
    from private.benchmark_leaderboard_snapshot_entries entry
    join private.benchmark_leaderboard_snapshot_sources source on source.snapshot_entry_id = entry.id
    join private.benchmark_measurements measurement
      on measurement.output_id = source.output_id
     and measurement.metric_name = entry.metric_name
     and measurement.metric_version = entry.metric_version
     and measurement.measurement_point = entry.measurement_point
     and measurement.unit = entry.unit
     and measurement.availability = 'measured'
    where entry.snapshot_id = p_snapshot_id and entry.inclusion_state = 'included'
    group by entry.id
  ), canonical as (
    select id, observed_count, raw_value,
      pg_catalog.round(raw_value, v_snapshot.decimal_places) as canonical_value
    from observed
  ), ranked as (
    select
      canonical.*,
      pg_catalog.rank() over (order by
        case when v_snapshot.ranking_direction = 'lower-is-better' then raw_value end asc nulls last,
        case when v_snapshot.ranking_direction = 'higher-is-better' then raw_value end desc nulls last
      )::integer as canonical_rank,
      pg_catalog.count(*) over (partition by raw_value) > 1 as canonical_tied,
      case
        when pg_catalog.count(*) over (partition by raw_value) > 1
          then 'rank-' || (pg_catalog.rank() over (order by
            case when v_snapshot.ranking_direction = 'lower-is-better' then raw_value end asc nulls last,
            case when v_snapshot.ranking_direction = 'higher-is-better' then raw_value end desc nulls last
          ))::text
        else null
      end as canonical_tie_group
    from canonical
  )
  select pg_catalog.count(*)::integer into v_invalid_count
  from private.benchmark_leaderboard_snapshot_entries entry
  left join ranked on ranked.id = entry.id
  where entry.snapshot_id = p_snapshot_id
    and entry.inclusion_state = 'included'
    and (
      ranked.id is null
      or entry.evidence_category <> 'measured'
      or entry.sample_count <> ranked.observed_count
      or entry.sample_count < v_snapshot.minimum_sample_count
      or (v_snapshot.statistic in ('median', 'p50') and ranked.observed_count < 3)
      or (v_snapshot.statistic = 'p95' and ranked.observed_count < 20)
      or entry.metric_value is distinct from ranked.canonical_value
      or entry.rank_ordinal is distinct from ranked.canonical_rank
      or entry.tied is distinct from ranked.canonical_tied
      or entry.tie_group is distinct from ranked.canonical_tie_group
    );
  return v_invalid_count = 0;
end;
$$;

alter function private.benchmark_snapshot_aggregates_valid(uuid) owner to postgres;
revoke all on function private.benchmark_snapshot_aggregates_valid(uuid) from public, anon, authenticated;

-- Publication is a server-guarded admin operation. Users cannot set public or
-- verified state through table access because browser roles have no grants.
create or replace function public.publish_benchmark_run(
  p_run_id uuid,
  p_guard_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile private.lab_trust_profiles%rowtype;
  v_profile_found boolean;
  v_run private.benchmark_runs%rowtype;
  v_case private.benchmark_cases%rowtype;
  v_suite private.benchmark_suites%rowtype;
  v_methodology private.benchmark_methodologies%rowtype;
  v_output_count integer;
  v_completed_output_count integer;
  v_measured_count integer;
  v_invalid_output_count integer;
begin
  perform private.assert_lab_guard(p_guard_token);

  select * into v_profile
  from private.lab_trust_profiles profile
  where profile.user_id = v_user_id;
  v_profile_found := found;
  if v_user_id is null
     or not v_profile_found
     or v_profile.status <> 'active'
     or v_profile.tier <> 'admin'
     or (v_profile.expires_at is not null and v_profile.expires_at <= pg_catalog.clock_timestamp()) then
    raise exception 'Active administrator access is required.' using errcode = '42501';
  end if;

  select * into v_run
  from private.benchmark_runs run
  where run.id = p_run_id
  for update;
  if not found then
    raise exception 'Benchmark run not found.' using errcode = 'P0002';
  end if;
  if v_run.status not in ('complete', 'partial')
     or not v_run.consent_publication
     or not v_run.consent_public_evidence_pool
     or v_run.execution_mode not in ('protected-live', 'local-live')
     or v_run.comparability_state <> 'comparable'
     or v_run.integrity_state not in ('hash-verified', 'signature-verified')
     or v_run.integrity_checked_at is null
     or v_run.integrity_record_hash <> v_run.bundle_hash
     or v_run.completed_at is null
     or v_run.completed_at > pg_catalog.clock_timestamp() then
    raise exception 'Benchmark run is not eligible for publication.' using errcode = '23514';
  end if;

  select benchmark_case.* into v_case
  from private.benchmark_cases benchmark_case
  where benchmark_case.id = v_run.case_id
  for update;
  select suite.* into v_suite
  from private.benchmark_suites suite
  where suite.id = v_case.suite_id
  for update;
  select methodology.* into v_methodology
  from private.benchmark_methodologies methodology
  where methodology.methodology_id = v_suite.methodology_id
    and methodology.version = v_suite.methodology_version
  for update;
  if v_methodology.lifecycle_state <> 'published'
     or v_methodology.content_hash <> private.benchmark_jsonb_sha256(v_methodology.definition)
     or v_suite.lifecycle_state <> 'active'
     or v_suite.owner_user_id is not null
     or v_suite.benchmark_category <> v_run.benchmark_category
     or v_suite.language <> v_case.language
     or v_suite.domain <> v_case.domain
     or v_suite.privacy_class not in ('public', 'synthetic')
     or v_suite.publication_eligibility <> 'eligible'
     or v_case.privacy_class not in ('public', 'synthetic')
     or v_case.publication_eligibility <> 'eligible'
     or v_case.source_reference is null
     or v_case.source_reference !~ '^(repository|object):'
     or v_case.source_verified_at is null
     or v_case.lifecycle_state <> 'active'
     or v_case.case_kind not in ('canonical', 'preset')
     or v_case.benchmark_category <> v_run.benchmark_category
     or v_case.input_hash <> v_run.input_hash
     or (v_case.input_type = 'text'
       and v_case.input_hash <> private.benchmark_text_sha256(v_case.exact_input_text))
     or v_run.methodology_version <> v_methodology.version then
    raise exception 'Benchmark run methodology, suite, case, or input is not approved for publication.' using errcode = '23514';
  end if;

  select pg_catalog.count(*)::integer into v_output_count
  from private.benchmark_run_outputs output
  where output.run_id = p_run_id;
  select pg_catalog.count(*)::integer into v_completed_output_count
  from private.benchmark_run_outputs output
  where output.run_id = p_run_id and output.status = 'complete';
  select pg_catalog.count(*)::integer into v_measured_count
  from private.benchmark_measurements measurement
  join private.benchmark_run_outputs output on output.id = measurement.output_id
  where output.run_id = p_run_id and measurement.availability = 'measured';
  select pg_catalog.count(*)::integer into v_invalid_output_count
  from private.benchmark_run_outputs output
  where output.run_id = p_run_id
    and (
      output.adapter_version is null
      or output.configuration_hash <> private.benchmark_jsonb_sha256(output.provider_configuration)
      or output.provider_readiness not in ('adapter-backed', 'live-enabled')
      or output.sample_rate_hz is null
      or output.channels is null
      or output.thermal_state = 'unknown'
      or output.codec is null
      or output.capability <> v_run.benchmark_category
      or (v_run.benchmark_category = 'tts' and output.output_modality <> 'audio')
      or (v_run.benchmark_category = 'stt' and output.output_modality <> 'text')
      or output.completed_at is null
      or (output.status = 'complete' and (
        output.output_content_hash is null
        or not exists (
          select 1 from private.benchmark_measurements measurement
          where measurement.output_id = output.id
            and measurement.availability = 'measured'
            and measurement.metric_version = v_run.metric_version
        )
      ))
      or output.status in ('pending', 'streaming')
    );
  if v_output_count < 2 or v_output_count > 4
     or v_completed_output_count < 1
     or v_measured_count < v_completed_output_count
     or (v_run.status = 'complete' and v_completed_output_count <> v_output_count)
     or (v_run.status = 'partial' and v_completed_output_count >= v_output_count)
     or v_invalid_output_count <> 0 then
    raise exception 'Published benchmark evidence requires 2-4 terminal, attributable outputs with at least one successful measured lane.' using errcode = '23514';
  end if;

  update private.benchmark_runs
  set publication_state = 'published',
      visibility = 'public-verified',
      verified_at = pg_catalog.clock_timestamp(),
      verified_by = v_user_id,
      published_at = pg_catalog.clock_timestamp(),
      revoked_at = null
  where id = p_run_id
  returning * into v_run;

  return pg_catalog.jsonb_build_object(
    'runId', v_run.run_id,
    'publicationState', v_run.publication_state,
    'verifiedAt', v_run.verified_at,
    'outputCount', v_output_count,
    'completedOutputCount', v_completed_output_count,
    'measuredMetricCount', v_measured_count
  );
end;
$$;

alter function public.publish_benchmark_run(uuid, text) owner to postgres;
revoke all on function public.publish_benchmark_run(uuid, text) from public, anon, authenticated;
grant execute on function public.publish_benchmark_run(uuid, text) to authenticated;

create or replace function public.prepare_benchmark_snapshot_signature(
  p_snapshot_id uuid,
  p_guard_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile private.lab_trust_profiles%rowtype;
  v_snapshot private.benchmark_leaderboard_snapshots%rowtype;
  v_payload jsonb;
  v_canonical_payload text;
  v_content_hash text;
begin
  perform private.assert_lab_guard(p_guard_token);
  select * into v_profile
  from private.lab_trust_profiles profile
  where profile.user_id = v_user_id;
  if v_user_id is null
     or not found
     or v_profile.status <> 'active'
     or v_profile.tier <> 'admin'
     or (v_profile.expires_at is not null and v_profile.expires_at <= pg_catalog.clock_timestamp()) then
    raise exception 'Active administrator access is required.' using errcode = '42501';
  end if;

  select * into v_snapshot
  from private.benchmark_leaderboard_snapshots snapshot
  where snapshot.id = p_snapshot_id
  for update;
  if not found then
    raise exception 'Benchmark snapshot not found.' using errcode = 'P0002';
  end if;
  if v_snapshot.publication_state <> 'private'
     or exists (
       select 1 from private.benchmark_signatures signature
       where signature.subject_type = 'leaderboard_snapshot'
         and signature.subject_key = p_snapshot_id::text
         and signature.verification_state = 'signature-verified'
     )
     or not private.benchmark_snapshot_aggregates_valid(p_snapshot_id) then
    raise exception 'Only a canonical unpublished snapshot can be prepared for signing.' using errcode = '23514';
  end if;

  v_payload := private.benchmark_snapshot_public_payload(p_snapshot_id);
  v_canonical_payload := private.canonicalize_benchmark_jsonb(v_payload);
  v_content_hash := 'sha256:' || pg_catalog.encode(
    extensions.digest(v_canonical_payload, 'sha256'),
    'hex'
  );
  update private.benchmark_leaderboard_snapshots
  set snapshot_hash = v_content_hash
  where id = p_snapshot_id;

  return pg_catalog.jsonb_build_object(
    'snapshotId', p_snapshot_id,
    'payloadSchemaVersion', 'one-benchmark-db-public-payload/1.0.0',
    'payload', v_payload,
    'canonicalPayload', v_canonical_payload,
    'payloadDigest', v_content_hash
  );
end;
$$;

alter function public.prepare_benchmark_snapshot_signature(uuid, text) owner to postgres;
revoke all on function public.prepare_benchmark_snapshot_signature(uuid, text) from public, anon, authenticated;
grant execute on function public.prepare_benchmark_snapshot_signature(uuid, text) to authenticated;

-- PostgreSQL records, but does not pretend to perform, Ed25519 verification.
-- The guarded application verifier must first validate the exact signed message:
-- schema version + payload schema version + payload digest + signed timestamp.
create or replace function public.record_benchmark_signature_verification(
  p_signature_id uuid,
  p_snapshot_id uuid,
  p_verification_method text,
  p_verification_record_hash text,
  p_guard_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile private.lab_trust_profiles%rowtype;
  v_snapshot private.benchmark_leaderboard_snapshots%rowtype;
  v_signature private.benchmark_signatures%rowtype;
  v_content_hash text;
begin
  perform private.assert_lab_guard(p_guard_token);
  select * into v_profile
  from private.lab_trust_profiles profile
  where profile.user_id = v_user_id;
  if v_user_id is null
     or not found
     or v_profile.status <> 'active'
     or v_profile.tier <> 'admin'
     or (v_profile.expires_at is not null and v_profile.expires_at <= pg_catalog.clock_timestamp()) then
    raise exception 'Active administrator access is required.' using errcode = '42501';
  end if;
  if p_verification_method is null
     or char_length(p_verification_method) not between 1 and 160
     or p_verification_method !~ '^[A-Za-z0-9._:/-]+$'
     or p_verification_record_hash !~ '^sha256:[0-9a-f]{64}$' then
    raise exception 'A bounded verification method and record hash are required.' using errcode = '22023';
  end if;

  select * into v_snapshot
  from private.benchmark_leaderboard_snapshots snapshot
  where snapshot.id = p_snapshot_id
  for update;
  if not found then
    raise exception 'Benchmark snapshot not found.' using errcode = 'P0002';
  end if;
  if v_snapshot.publication_state <> 'private' then
    raise exception 'Only an unpublished snapshot can receive an integrity verification record.' using errcode = '55000';
  end if;
  v_content_hash := private.benchmark_snapshot_content_hash(p_snapshot_id);
  if v_content_hash is null
     or v_content_hash <> v_snapshot.snapshot_hash
     or not private.benchmark_snapshot_aggregates_valid(p_snapshot_id) then
    raise exception 'The persisted snapshot does not match its canonical public payload digest.' using errcode = '23514';
  end if;

  select * into v_signature
  from private.benchmark_signatures signature
  where signature.id = p_signature_id
  for update;
  if not found then
    raise exception 'Benchmark signature not found.' using errcode = 'P0002';
  end if;
  if v_signature.subject_type <> 'leaderboard_snapshot'
     or v_signature.subject_key <> p_snapshot_id::text
     or v_signature.content_hash <> v_snapshot.snapshot_hash
     or v_signature.signature_schema_version <> 'one-benchmark-signature/1.0.0'
     or v_signature.payload_schema_version <> 'one-benchmark-db-public-payload/1.0.0'
     or v_signature.signature_algorithm <> 'ed25519' then
    raise exception 'The signature envelope does not bind this canonical snapshot payload.' using errcode = '23514';
  end if;

  update private.benchmark_signatures
  set verification_state = 'signature-verified',
      verification_method = p_verification_method,
      verification_record_hash = p_verification_record_hash,
      verified_at = pg_catalog.clock_timestamp(),
      verified_by = v_user_id
  where id = p_signature_id
  returning * into v_signature;

  return pg_catalog.jsonb_build_object(
    'signatureId', v_signature.id,
    'snapshotId', p_snapshot_id,
    'verificationState', v_signature.verification_state,
    'payloadDigest', v_signature.content_hash,
    'verifiedAt', v_signature.verified_at
  );
end;
$$;

alter function public.record_benchmark_signature_verification(uuid, uuid, text, text, text) owner to postgres;
revoke all on function public.record_benchmark_signature_verification(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.record_benchmark_signature_verification(uuid, uuid, text, text, text) to authenticated;

create or replace function public.publish_benchmark_snapshot(
  p_snapshot_id uuid,
  p_guard_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile private.lab_trust_profiles%rowtype;
  v_snapshot private.benchmark_leaderboard_snapshots%rowtype;
  v_suite private.benchmark_suites%rowtype;
  v_case private.benchmark_cases%rowtype;
  v_methodology private.benchmark_methodologies%rowtype;
  v_entry_count integer;
  v_included_count integer;
  v_source_count integer;
  v_actual_source_max_completed_at timestamptz;
  v_invalid_entry_count integer;
  v_invalid_source_count integer;
  v_verified_signature_count integer;
  v_content_hash text;
  v_public_payload jsonb;
  v_public_payload_canonical text;
begin
  perform private.assert_lab_guard(p_guard_token);
  select * into v_profile
  from private.lab_trust_profiles profile
  where profile.user_id = v_user_id;
  if v_user_id is null
     or not found
     or v_profile.status <> 'active'
     or v_profile.tier <> 'admin'
     or (v_profile.expires_at is not null and v_profile.expires_at <= pg_catalog.clock_timestamp()) then
    raise exception 'Active administrator access is required.' using errcode = '42501';
  end if;

  select * into v_snapshot
  from private.benchmark_leaderboard_snapshots snapshot
  where snapshot.id = p_snapshot_id
  for update;
  if not found then
    raise exception 'Benchmark snapshot not found.' using errcode = 'P0002';
  end if;
  if v_snapshot.publication_state <> 'private'
     or v_snapshot.allow_synthetic
     or v_snapshot.execution_mode not in ('protected-live', 'local-live')
     or v_snapshot.codec is null
     or v_snapshot.thermal_state = 'unknown'
     or v_snapshot.as_of_at < pg_catalog.clock_timestamp() - interval '1 day'
     or v_snapshot.as_of_at > pg_catalog.clock_timestamp() + interval '5 minutes'
     or v_snapshot.freshness_cutoff_at < v_snapshot.as_of_at - interval '365 days' then
    raise exception 'Benchmark snapshot is not eligible for verified publication.' using errcode = '23514';
  end if;
  v_content_hash := private.benchmark_snapshot_content_hash(p_snapshot_id);
  if v_content_hash is null
     or v_content_hash <> v_snapshot.snapshot_hash
     or not private.benchmark_snapshot_aggregates_valid(p_snapshot_id) then
    raise exception 'The persisted snapshot does not match its canonical public payload digest.' using errcode = '23514';
  end if;

  select benchmark_case.* into v_case
  from private.benchmark_cases benchmark_case
  where benchmark_case.id = v_snapshot.case_id
  for update;
  select suite.* into v_suite
  from private.benchmark_suites suite
  where suite.id = v_case.suite_id
  for update;
  select methodology.* into v_methodology
  from private.benchmark_methodologies methodology
  where methodology.methodology_id = v_snapshot.methodology_id
    and methodology.version = v_snapshot.methodology_version
  for update;
  if v_methodology.lifecycle_state <> 'published'
     or v_methodology.content_hash <> private.benchmark_jsonb_sha256(v_methodology.definition)
     or v_suite.lifecycle_state <> 'active'
     or v_suite.owner_user_id is not null
     or v_suite.benchmark_category <> v_snapshot.benchmark_category
     or v_suite.language <> v_snapshot.language
     or v_suite.privacy_class not in ('public', 'synthetic')
     or v_suite.publication_eligibility <> 'eligible'
     or v_suite.methodology_id <> v_snapshot.methodology_id
     or v_suite.methodology_version <> v_snapshot.methodology_version
     or v_case.suite_id <> v_snapshot.suite_id
     or v_case.lifecycle_state <> 'active'
     or v_case.case_kind not in ('canonical', 'preset')
     or v_case.language <> v_snapshot.language
     or v_case.privacy_class not in ('public', 'synthetic')
     or v_case.publication_eligibility <> 'eligible'
     or v_case.source_reference is null
     or v_case.source_reference !~ '^(repository|object):'
     or v_case.source_verified_at is null
     or (v_case.input_type = 'text'
       and v_case.input_hash <> private.benchmark_text_sha256(v_case.exact_input_text))
     or v_case.input_hash <> v_snapshot.input_hash then
    raise exception 'Snapshot methodology and controlled suite are not approved for publication.' using errcode = '23514';
  end if;

  select pg_catalog.count(*)::integer into v_entry_count
  from private.benchmark_leaderboard_snapshot_entries entry
  where entry.snapshot_id = p_snapshot_id;
  select pg_catalog.count(*)::integer into v_included_count
  from private.benchmark_leaderboard_snapshot_entries entry
  where entry.snapshot_id = p_snapshot_id and entry.inclusion_state = 'included';
  select pg_catalog.count(distinct source.output_id)::integer into v_source_count
  from private.benchmark_leaderboard_snapshot_sources source
  join private.benchmark_leaderboard_snapshot_entries entry
    on entry.id = source.snapshot_entry_id
  where entry.snapshot_id = p_snapshot_id;
  select pg_catalog.max(run.completed_at) into v_actual_source_max_completed_at
  from private.benchmark_leaderboard_snapshot_sources source
  join private.benchmark_leaderboard_snapshot_entries entry
    on entry.id = source.snapshot_entry_id
  join private.benchmark_run_outputs output on output.id = source.output_id
  join private.benchmark_runs run on run.id = output.run_id
  where entry.snapshot_id = p_snapshot_id;
  select pg_catalog.count(*)::integer into v_invalid_entry_count
  from private.benchmark_leaderboard_snapshot_entries entry
  where entry.snapshot_id = p_snapshot_id
    and (
      entry.capability <> v_snapshot.benchmark_category
      or entry.metric_name <> v_snapshot.metric_name
      or entry.metric_version <> v_snapshot.metric_version
      or entry.statistic <> v_snapshot.statistic
      or entry.measurement_point <> v_snapshot.measurement_point
      or entry.sponsorship_disclosures is distinct from (
        select coalesce(
          pg_catalog.jsonb_agg(pg_catalog.to_jsonb(disclosure.value) order by disclosure.value),
          '[]'::jsonb
        )
        from (
          select distinct source_disclosure.value
          from private.benchmark_leaderboard_snapshot_sources sponsorship_source
          join private.benchmark_run_outputs sponsorship_output
            on sponsorship_output.id = sponsorship_source.output_id
          join private.benchmark_runs sponsorship_run
            on sponsorship_run.id = sponsorship_output.run_id
          cross join lateral (values
            (sponsorship_run.sponsorship_disclosure),
            (sponsorship_output.sponsorship_disclosure)
          ) source_disclosure(value)
          where sponsorship_source.snapshot_entry_id = entry.id
            and source_disclosure.value is not null
        ) disclosure
      )
      or (entry.inclusion_state = 'included' and (
        entry.unit <> v_snapshot.unit
        or entry.sample_count < v_snapshot.minimum_sample_count
        or entry.sample_count <> (
          select pg_catalog.count(*)::integer
          from private.benchmark_leaderboard_snapshot_sources source
          where source.snapshot_entry_id = entry.id
        )
      ))
      or not exists (
        select 1 from private.benchmark_leaderboard_snapshot_sources source
        where source.snapshot_entry_id = entry.id
      )
    );
  select pg_catalog.count(*)::integer into v_invalid_source_count
  from private.benchmark_leaderboard_snapshot_sources source
  join private.benchmark_leaderboard_snapshot_entries entry
    on entry.id = source.snapshot_entry_id
  join private.benchmark_run_outputs output on output.id = source.output_id
  join private.benchmark_runs run on run.id = output.run_id
  join private.benchmark_cases benchmark_case on benchmark_case.id = run.case_id
  where entry.snapshot_id = p_snapshot_id
    and (
      run.publication_state <> 'published'
      or run.visibility <> 'public-verified'
      or run.execution_mode = 'fixture'
      or run.execution_mode <> v_snapshot.execution_mode
      or run.status not in ('complete', 'partial')
      or run.comparability_state <> 'comparable'
      or run.integrity_state not in ('hash-verified', 'signature-verified')
      or run.benchmark_category <> v_snapshot.benchmark_category
      or run.evaluation_mode <> v_snapshot.comparison_mode
      or run.environment <> v_snapshot.environment
      or run.deployment <> v_snapshot.deployment
      or run.completed_at is null
      or run.completed_at < v_snapshot.freshness_cutoff_at
      or run.completed_at > v_snapshot.source_max_completed_at
      or benchmark_case.suite_id <> v_snapshot.suite_id
      or benchmark_case.id <> v_snapshot.case_id
      or run.input_hash <> v_snapshot.input_hash
      or benchmark_case.lifecycle_state <> 'active'
      or benchmark_case.case_kind not in ('canonical', 'preset')
      or benchmark_case.language <> v_snapshot.language
      or benchmark_case.privacy_class not in ('public', 'synthetic')
      or benchmark_case.publication_eligibility <> 'eligible'
      or benchmark_case.source_reference is null
      or benchmark_case.source_reference !~ '^(repository|object):'
      or benchmark_case.source_verified_at is null
      or source.source_status <> output.status
      or source.failure_code is distinct from output.failure_code
      or output.provider_id <> entry.provider_id
      or output.provider_display_name <> entry.provider_display_name
      or output.provider_readiness <> entry.provider_readiness
      or output.adapter_version <> entry.adapter_version
      or output.model_id <> entry.model_id
      or output.model_version is distinct from entry.model_version
      or output.voice_id is distinct from entry.voice_id
      or output.configuration_hash <> private.benchmark_jsonb_sha256(output.provider_configuration)
      or output.configuration_hash <> entry.configuration_hash
      or output.capability <> entry.capability
      or entry.deployment <> v_snapshot.deployment
      or output.region is distinct from entry.region
      or output.region is distinct from v_snapshot.region
      or output.transport <> entry.transport
      or output.transport <> v_snapshot.transport
      or output.codec is distinct from entry.codec
      or output.codec is distinct from v_snapshot.codec
      or output.sample_rate_hz is distinct from entry.sample_rate_hz
      or output.sample_rate_hz is distinct from v_snapshot.sample_rate_hz
      or output.channels is distinct from entry.channels
      or output.channels is distinct from v_snapshot.channels
      or output.thermal_state <> entry.thermal_state
      or output.thermal_state <> v_snapshot.thermal_state
      or (entry.inclusion_state = 'included' and (
        not (
          (
            entry.metric_name <> 'request-success'
            and output.status = 'complete'
            and output.output_content_hash is not null
          )
          or (
            entry.metric_name = 'request-success'
            and entry.unit = 'boolean'
            and private.benchmark_request_outcome_is_provider_attributable(
              output.status,
              output.failure_code,
              output.request_started_at
            )
            and (output.status <> 'complete' or output.output_content_hash is not null)
          )
        )
        or not exists (
          select 1 from private.benchmark_measurements measurement
          where measurement.output_id = output.id
            and measurement.metric_name = entry.metric_name
            and measurement.metric_version = entry.metric_version
            and measurement.measurement_point = entry.measurement_point
            and measurement.unit = entry.unit
            and measurement.availability = 'measured'
            and (
              entry.metric_name <> 'request-success'
              or measurement.metric_value = case when output.status = 'complete' then 1 else 0 end
            )
        )
      ))
    );
  select pg_catalog.count(*)::integer into v_verified_signature_count
  from private.benchmark_signatures signature
  where signature.subject_type = 'leaderboard_snapshot'
    and signature.subject_key = p_snapshot_id::text
    and signature.content_hash = v_snapshot.snapshot_hash
    and signature.signature_schema_version = 'one-benchmark-signature/1.0.0'
    and signature.payload_schema_version = 'one-benchmark-db-public-payload/1.0.0'
    and signature.signature_algorithm = 'ed25519'
    and signature.verification_state = 'signature-verified'
    and signature.verification_record_hash is not null
    and signature.verified_at is not null;
  if v_entry_count = 0 or v_included_count < 2
     or v_source_count <> v_snapshot.sample_count
     or v_actual_source_max_completed_at is distinct from v_snapshot.source_max_completed_at
     or v_invalid_entry_count <> 0
     or v_invalid_source_count <> 0
     or v_verified_signature_count = 0 then
    raise exception 'Published benchmark snapshots require signed, fresh, comparable, FK-backed evidence and sufficient samples.' using errcode = '23514';
  end if;

  v_public_payload := private.benchmark_snapshot_public_payload(p_snapshot_id);
  v_public_payload_canonical := private.canonicalize_benchmark_jsonb(v_public_payload);
  if pg_catalog.octet_length(v_public_payload::text) > 1048576
     or pg_catalog.octet_length(v_public_payload_canonical) > 1048576
     or 'sha256:' || pg_catalog.encode(
       extensions.digest(v_public_payload_canonical, 'sha256'),
       'hex'
     ) <> v_snapshot.snapshot_hash then
    raise exception 'The immutable public snapshot proof exceeds its bound or no longer matches its digest.' using errcode = '23514';
  end if;

  update private.benchmark_signatures
  set retention_expires_at = null
  where subject_type = 'leaderboard_snapshot'
    and subject_key = p_snapshot_id::text
    and content_hash = v_snapshot.snapshot_hash
    and verification_state = 'signature-verified';

  update private.benchmark_leaderboard_snapshots
  set publication_state = 'published',
      visibility = 'public-verified',
      verified_at = pg_catalog.clock_timestamp(),
      verified_by = v_user_id,
      published_at = pg_catalog.clock_timestamp(),
      revoked_at = null,
      public_payload = v_public_payload,
      public_payload_canonical = v_public_payload_canonical,
      retention_class = 'public_verified',
      retention_expires_at = null
  where id = p_snapshot_id
  returning * into v_snapshot;

  return pg_catalog.jsonb_build_object(
    'snapshotId', v_snapshot.id,
    'publicationState', v_snapshot.publication_state,
    'verifiedAt', v_snapshot.verified_at,
    'entryCount', v_entry_count,
    'includedEntryCount', v_included_count,
    'sourceCount', v_source_count,
    'verifiedSignatureCount', v_verified_signature_count
  );
end;
$$;

alter function public.publish_benchmark_snapshot(uuid, text) owner to postgres;
revoke all on function public.publish_benchmark_snapshot(uuid, text) from public, anon, authenticated;
grant execute on function public.publish_benchmark_snapshot(uuid, text) to authenticated;

-- Anonymous-safe read projection: only immutable, operator-verified aggregates
-- are returned. Run IDs, user IDs, input text, raw judgments, traces, errors,
-- artifact keys, and provider payloads are intentionally absent.
create or replace function public.read_public_benchmark_snapshot(
  p_snapshot_id uuid default null,
  p_suite_key text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_snapshot private.benchmark_leaderboard_snapshots%rowtype;
  v_suite private.benchmark_suites%rowtype;
begin
  if p_snapshot_id is null and (p_suite_key is null or char_length(p_suite_key) not between 1 and 120) then
    raise exception 'A snapshot ID or suite key is required.' using errcode = '22023';
  end if;

  select snapshot.* into v_snapshot
  from private.benchmark_leaderboard_snapshots snapshot
  join private.benchmark_suites suite on suite.id = snapshot.suite_id
  where snapshot.publication_state = 'published'
    and snapshot.visibility = 'public-verified'
    and snapshot.verified_at is not null
    and snapshot.revoked_at is null
    and (p_snapshot_id is null or snapshot.id = p_snapshot_id)
    and (p_snapshot_id is not null or suite.suite_key = p_suite_key)
  order by snapshot.as_of_at desc, snapshot.id desc
  limit 1;

  if not found then
    return null;
  end if;
  select * into v_suite from private.benchmark_suites where id = v_snapshot.suite_id;

  return pg_catalog.jsonb_build_object(
    'schemaVersion', 'one-benchmark-public/1.0.0',
    'snapshotId', v_snapshot.id,
    'suite', pg_catalog.jsonb_build_object(
      'id', v_suite.suite_key,
      'version', v_suite.version,
      'name', v_suite.name
    ),
    'methodology', pg_catalog.jsonb_build_object(
      'id', v_snapshot.methodology_id,
      'version', v_snapshot.methodology_version
    ),
    'calculationVersion', v_snapshot.calculation_version,
    'eligibilityProfileVersion', v_snapshot.eligibility_profile_version,
    'scoringProfileVersion', v_snapshot.scoring_profile_version,
    'scope', pg_catalog.jsonb_build_object(
      'category', v_snapshot.benchmark_category,
      'comparisonMode', v_snapshot.comparison_mode,
      'environment', v_snapshot.environment,
      'deployment', v_snapshot.deployment,
      'language', v_snapshot.language,
      'region', v_snapshot.region,
      'transport', v_snapshot.transport,
      'codec', v_snapshot.codec,
      'sampleRateHz', v_snapshot.sample_rate_hz,
      'channels', v_snapshot.channels,
      'thermalState', v_snapshot.thermal_state,
      'metricName', v_snapshot.metric_name,
      'metricVersion', v_snapshot.metric_version,
      'statistic', v_snapshot.statistic,
      'unit', v_snapshot.unit,
      'measurementPoint', v_snapshot.measurement_point,
      'minimumSampleCount', v_snapshot.minimum_sample_count,
      'syntheticAllowed', v_snapshot.allow_synthetic,
      'freshnessCutoffAt', v_snapshot.freshness_cutoff_at,
      'filtersHash', v_snapshot.filters_hash,
      'metricScopeHash', v_snapshot.metric_scope_hash,
      'scenarioScopeHash', v_snapshot.scenario_scope_hash
    ),
    'populationHash', v_snapshot.population_hash,
    'snapshotHash', v_snapshot.snapshot_hash,
    'sourceMaxCompletedAt', v_snapshot.source_max_completed_at,
    'asOfAt', v_snapshot.as_of_at,
    'sampleCount', v_snapshot.sample_count,
    'verifiedAt', v_snapshot.verified_at,
    'entries', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'ordinal', entry.entry_ordinal,
          'providerId', entry.provider_id,
          'providerDisplayName', entry.provider_display_name,
          'providerReadiness', entry.provider_readiness,
          'adapterVersion', entry.adapter_version,
          'modelId', entry.model_id,
          'modelVersion', entry.model_version,
          'voiceId', entry.voice_id,
          'configurationHash', entry.configuration_hash,
          'capability', entry.capability,
          'deployment', entry.deployment,
          'region', entry.region,
          'transport', entry.transport,
          'codec', entry.codec,
          'sampleRateHz', entry.sample_rate_hz,
          'channels', entry.channels,
          'thermalState', entry.thermal_state,
          'inclusionState', entry.inclusion_state,
          'exclusionReason', entry.exclusion_reason,
          'evidenceCategory', entry.evidence_category,
          'metricName', entry.metric_name,
          'metricVersion', entry.metric_version,
          'statistic', entry.statistic,
          'value', entry.metric_value,
          'unit', entry.unit,
          'measurementPoint', entry.measurement_point,
          'provenanceVersion', entry.provenance_version,
          'sampleCount', entry.sample_count,
          'rank', entry.rank_ordinal,
          'tied', entry.tied,
          'tieGroup', entry.tie_group
        ) order by entry.entry_ordinal, entry.id
      )
      from private.benchmark_leaderboard_snapshot_entries entry
      where entry.snapshot_id = v_snapshot.id
    ), '[]'::jsonb),
    'signatures', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'algorithm', signature.signature_algorithm,
          'publicKeyId', signature.public_key_id,
          'schemaVersion', signature.signature_schema_version,
          'payloadSchemaVersion', signature.payload_schema_version,
          'payloadDigest', signature.content_hash,
          'signature', signature.signature_base64,
          'signedAt', signature.signed_at,
          'verificationState', signature.verification_state,
          'verificationMethod', signature.verification_method,
          'verificationRecordHash', signature.verification_record_hash,
          'verifiedAt', signature.verified_at
        ) order by signature.public_key_id, signature.id
      )
      from private.benchmark_signatures signature
      where signature.subject_type = 'leaderboard_snapshot'
        and signature.subject_key = v_snapshot.id::text
        and signature.content_hash = v_snapshot.snapshot_hash
        and signature.verification_state = 'signature-verified'
        and signature.verified_at is not null
    ), '[]'::jsonb)
  );
end;
$$;

alter function public.read_public_benchmark_snapshot(uuid, text) owner to postgres;
revoke all on function public.read_public_benchmark_snapshot(uuid, text) from public, anon, authenticated;
grant execute on function public.read_public_benchmark_snapshot(uuid, text) to anon, authenticated;

-- Final fail-closed public proof projection. `content` is exactly the payload
-- that was canonicalized and signed; `canonicalContent` supplies the exact
-- UTF-8 bytes a consumer hashes before verifying the signature envelope.
create or replace function public.read_public_benchmark_snapshot(
  p_snapshot_id uuid default null,
  p_suite_key text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_snapshot private.benchmark_leaderboard_snapshots%rowtype;
  v_payload jsonb;
  v_canonical_payload text;
  v_content_hash text;
begin
  if p_snapshot_id is null and (p_suite_key is null or char_length(p_suite_key) not between 1 and 120) then
    raise exception 'A snapshot ID or suite key is required.' using errcode = '22023';
  end if;
  select snapshot.* into v_snapshot
  from private.benchmark_leaderboard_snapshots snapshot
  join private.benchmark_suites suite on suite.id = snapshot.suite_id
  where snapshot.publication_state = 'published'
    and snapshot.visibility = 'public-verified'
    and snapshot.verified_at is not null
    and snapshot.revoked_at is null
    and (p_snapshot_id is null or snapshot.id = p_snapshot_id)
    and (p_snapshot_id is not null or suite.suite_key = p_suite_key)
  order by snapshot.as_of_at desc, snapshot.id desc
  limit 1;
  if not found then
    return null;
  end if;

  -- Publication materializes and freezes the exact sanitized payload. Anonymous
  -- reads therefore never traverse raw runs, source links, or measurements and
  -- have a strict one-megabyte response bound.
  v_payload := v_snapshot.public_payload;
  v_canonical_payload := v_snapshot.public_payload_canonical;
  v_content_hash := v_snapshot.snapshot_hash;
  if v_payload is null or v_canonical_payload is null then
    return null;
  end if;

  return pg_catalog.jsonb_build_object(
    'schemaVersion', 'one-benchmark-public-proof/1.0.0',
    'content', v_payload,
    'canonicalContent', v_canonical_payload,
    'payloadDigest', v_content_hash,
    'verifiedAt', v_snapshot.verified_at,
    'signatures', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'algorithm', signature.signature_algorithm,
          'publicKeyId', signature.public_key_id,
          'schemaVersion', signature.signature_schema_version,
          'payloadSchemaVersion', signature.payload_schema_version,
          'payloadDigest', signature.content_hash,
          'signature', signature.signature_base64,
          'signedAt', pg_catalog.to_char(
            signature.signed_at at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          ),
          'verificationState', signature.verification_state,
          'verificationMethod', signature.verification_method,
          'verificationRecordHash', signature.verification_record_hash,
          'verifiedAt', pg_catalog.to_char(
            signature.verified_at at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          )
        ) order by signature.public_key_id, signature.id
      )
      from private.benchmark_signatures signature
      where signature.subject_type = 'leaderboard_snapshot'
        and signature.subject_key = v_snapshot.id::text
        and signature.content_hash = v_content_hash
        and signature.payload_schema_version = 'one-benchmark-db-public-payload/1.0.0'
        and signature.verification_state = 'signature-verified'
        and signature.verified_at is not null
    ), '[]'::jsonb)
  );
end;
$$;

alter function public.read_public_benchmark_snapshot(uuid, text) owner to postgres;
revoke all on function public.read_public_benchmark_snapshot(uuid, text) from public, anon, authenticated;
grant execute on function public.read_public_benchmark_snapshot(uuid, text) to anon, authenticated;

-- Server-guarded principal read by the canonical externally portable run ID.
-- The owner of a run or an active administrator
-- can retrieve the normalized private result; raw rater identities and secrets
-- are never projected. Hard child limits above keep this payload bounded.
create or replace function public.read_benchmark_result(
  p_run_id uuid,
  p_guard_token text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile private.lab_trust_profiles%rowtype;
  v_profile_found boolean;
  v_run private.benchmark_runs%rowtype;
  v_case private.benchmark_cases%rowtype;
  v_payload jsonb;
begin
  perform private.assert_lab_guard(p_guard_token);
  select * into v_profile
  from private.lab_trust_profiles profile
  where profile.user_id = v_user_id;
  v_profile_found := found;
  select * into v_run
  from private.benchmark_runs run
  where run.run_id = p_run_id;
  if not found then
    raise exception 'Benchmark run not found.' using errcode = 'P0002';
  end if;
  if v_user_id is null
     or not v_profile_found
     or v_profile.status <> 'active'
     or (v_profile.expires_at is not null and v_profile.expires_at <= pg_catalog.clock_timestamp())
     or (v_profile.tier <> 'admin' and v_run.owner_user_id is distinct from v_user_id) then
    raise exception 'Benchmark result access is limited to its owner or an active administrator.' using errcode = '42501';
  end if;
  select * into v_case from private.benchmark_cases where id = v_run.case_id;

  v_payload := pg_catalog.jsonb_build_object(
    'schemaVersion', 'one-benchmark-private-result/1.0.0',
    'run', pg_catalog.jsonb_build_object(
      'id', v_run.id,
      'runId', v_run.run_id,
      'evaluationId', v_run.evaluation_id,
      'category', v_run.benchmark_category,
      'status', v_run.status,
      'methodologyVersion', v_run.methodology_version,
      'metricVersion', v_run.metric_version,
      'evaluationMode', v_run.evaluation_mode,
      'executionMode', v_run.execution_mode,
      'environment', v_run.environment,
      'deployment', v_run.deployment,
      'region', v_run.region,
      'requestedAt', v_run.requested_at,
      'completedAt', v_run.completed_at,
      'visibility', v_run.visibility,
      'publicationState', v_run.publication_state,
      'sponsorshipDisclosure', v_run.sponsorship_disclosure,
      'integrityState', v_run.integrity_state,
      'bundleHash', v_run.bundle_hash,
      'configuration', v_run.run_configuration
    ),
    'input', pg_catalog.jsonb_build_object(
      'type', v_case.input_type,
      'exactText', v_case.exact_input_text,
      'reference', v_case.input_reference,
      'hash', v_run.input_hash
    ),
    'outputs', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', output.id,
          'providerId', output.provider_id,
          'providerDisplayName', output.provider_display_name,
          'providerReadiness', output.provider_readiness,
          'modelId', output.model_id,
          'modelVersion', output.model_version,
          'voiceId', output.voice_id,
          'configurationHash', output.configuration_hash,
          'adapterVersion', output.adapter_version,
          'configuration', output.provider_configuration,
          'sponsorshipDisclosure', output.sponsorship_disclosure,
          'capability', output.capability,
          'outputModality', output.output_modality,
          'region', output.region,
          'transport', output.transport,
          'codec', output.codec,
          'sampleRateHz', output.sample_rate_hz,
          'channels', output.channels,
          'thermalState', output.thermal_state,
          'status', output.status,
          'failureCode', output.failure_code,
          'requestStartedAt', output.request_started_at,
          'streamEstablishedAt', output.stream_established_at,
          'firstOutputAt', output.first_output_at,
          'firstAudioAt', output.first_audio_at,
          'completedAt', output.completed_at,
          'audioMimeType', output.audio_mime_type,
          'audioDurationSeconds', output.audio_duration_seconds,
          'audioContentHash', output.audio_content_hash,
          'outputContentHash', output.output_content_hash,
          'technicalTrace', output.technical_trace,
          'sanitizedError', output.sanitized_error,
          'measurements', coalesce((
            select pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'name', measurement.metric_name,
                'version', measurement.metric_version,
                'value', measurement.metric_value,
                'unit', measurement.unit,
                'availability', measurement.availability,
                'measurementPoint', measurement.measurement_point,
                'provenance', measurement.provenance,
                'observedAt', measurement.observed_at
              ) order by measurement.metric_name, measurement.measurement_point, measurement.id
            )
            from private.benchmark_measurements measurement
            where measurement.output_id = output.id
          ), '[]'::jsonb)
        ) order by output.created_at, output.id
      )
      from private.benchmark_run_outputs output
      where output.run_id = v_run.id
    ), '[]'::jsonb),
    'judgments', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', judgment.id,
          'outputId', judgment.output_id,
          'kind', judgment.judgment_kind,
          'judgeModelId', judgment.judge_model_id,
          'frameworkId', judgment.framework_id,
          'frameworkVersion', judgment.framework_version,
          'dimension', judgment.dimension,
          'version', judgment.judgment_version,
          'score', judgment.score,
          'preferenceSelected', judgment.preference_selected,
          'numericValue', judgment.numeric_value,
          'booleanValue', judgment.boolean_value,
          'textValue', judgment.text_value,
          'unit', judgment.unit,
          'threshold', judgment.threshold,
          'rubricVersion', judgment.rubric_version,
          'blindState', judgment.blind_state,
          'ratedBeforeReveal', judgment.rated_before_reveal,
          'provenance', judgment.provenance,
          'createdAt', judgment.created_at
        ) order by judgment.created_at, judgment.id
      )
      from private.benchmark_judgments judgment
      where judgment.run_id = v_run.id
    ), '[]'::jsonb),
    'artifacts', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', artifact.id,
          'outputId', artifact.output_id,
          'kind', artifact.artifact_kind,
          'storageBackend', artifact.storage_backend,
          'objectKey', artifact.object_key,
          'mimeType', artifact.mime_type,
          'sizeBytes', artifact.size_bytes,
          'contentHash', artifact.content_hash,
          'state', artifact.artifact_state,
          'retentionExpiresAt', artifact.retention_expires_at
        ) order by artifact.created_at, artifact.id
      )
      from private.benchmark_artifact_refs artifact
      where artifact.run_id = v_run.id
    ), '[]'::jsonb)
  );
  if pg_catalog.octet_length(v_payload::text) > 2097152 then
    raise exception 'Benchmark result exceeds the bounded read payload.' using errcode = '54000';
  end if;
  return v_payload;
end;
$$;

alter function public.read_benchmark_result(uuid, text) owner to postgres;
revoke all on function public.read_benchmark_result(uuid, text) from public, anon, authenticated;
grant execute on function public.read_benchmark_result(uuid, text) to authenticated;

-- Bounded keyset listing returns only immutable public metadata and proof
-- digests. Consumers request a full materialized proof by exact snapshot ID.
create or replace function public.list_public_benchmark_snapshots(
  p_suite_key text default null,
  p_limit integer default 20,
  p_before_as_of timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
begin
  if p_limit is null
     or p_limit not between 1 and 50
     or (p_suite_key is not null and (
       char_length(p_suite_key) not between 1 and 120
       or p_suite_key !~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
     ))
     or ((p_before_as_of is null) <> (p_before_id is null)) then
    raise exception 'Invalid bounded public benchmark listing request.' using errcode = '22023';
  end if;

  select pg_catalog.jsonb_build_object(
    'schemaVersion', 'one-benchmark-public-list/1.0.0',
    'items', coalesce(pg_catalog.jsonb_agg(item.payload order by item.as_of_at desc, item.id desc), '[]'::jsonb),
    'nextCursor', case when pg_catalog.count(*) = p_limit then pg_catalog.jsonb_build_object(
      'asOfAt', pg_catalog.to_char(pg_catalog.min(item.as_of_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'snapshotId', (pg_catalog.jsonb_agg(item.id order by item.as_of_at asc, item.id asc) ->> 0)
    ) else null end
  ) into v_payload
  from (
    select snapshot.id, snapshot.as_of_at, pg_catalog.jsonb_build_object(
      'snapshotId', snapshot.id,
      'suite', pg_catalog.jsonb_build_object(
        'id', suite.suite_key,
        'version', suite.version,
        'name', suite.name
      ),
      'case', pg_catalog.jsonb_build_object(
        'id', benchmark_case.case_key,
        'version', benchmark_case.version,
        'inputHash', snapshot.input_hash
      ),
      'category', snapshot.benchmark_category,
      'methodology', pg_catalog.jsonb_build_object(
        'id', snapshot.methodology_id,
        'version', snapshot.methodology_version
      ),
      'metric', pg_catalog.jsonb_build_object(
        'name', snapshot.metric_name,
        'version', snapshot.metric_version,
        'statistic', snapshot.statistic,
        'unit', snapshot.unit
      ),
      'asOfAt', pg_catalog.to_char(snapshot.as_of_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'sampleCount', snapshot.sample_count,
      'payloadDigest', snapshot.snapshot_hash,
      'verifiedAt', pg_catalog.to_char(snapshot.verified_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'sponsorshipDisclosures', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(disclosure.value) order by disclosure.value)
        from (
          select disclosure_value.value
          from pg_catalog.jsonb_array_elements_text(
            snapshot.public_payload -> 'sponsorshipDisclosures'
          ) disclosure_value(value)
          order by disclosure_value.value
          limit 10
        ) disclosure
      ), '[]'::jsonb),
      'sponsorshipDisclosureCount', pg_catalog.jsonb_array_length(
        snapshot.public_payload -> 'sponsorshipDisclosures'
      )
    ) as payload
    from private.benchmark_leaderboard_snapshots snapshot
    join private.benchmark_suites suite on suite.id = snapshot.suite_id
    join private.benchmark_cases benchmark_case on benchmark_case.id = snapshot.case_id
    where snapshot.publication_state = 'published'
      and snapshot.visibility = 'public-verified'
      and snapshot.verified_at is not null
      and snapshot.revoked_at is null
      and snapshot.public_payload is not null
      and (p_suite_key is null or suite.suite_key = p_suite_key)
      and (p_before_as_of is null or (snapshot.as_of_at, snapshot.id) < (p_before_as_of, p_before_id))
    order by snapshot.as_of_at desc, snapshot.id desc
    limit p_limit
  ) item;
  return v_payload;
end;
$$;

alter function public.list_public_benchmark_snapshots(text, integer, timestamptz, uuid) owner to postgres;
revoke all on function public.list_public_benchmark_snapshots(text, integer, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.list_public_benchmark_snapshots(text, integer, timestamptz, uuid) to anon, authenticated;

-- Preserve the verified Stage 2 lifecycle implementation under a private name.
-- The existing minute-23 cron command resolves the canonical wrapper by name,
-- so no new schedule or maintenance subsystem is created.
alter function private.prune_lab_access_history()
  rename to prune_stage2_access_history;
alter function private.prune_stage2_access_history() owner to postgres;
revoke all on function private.prune_stage2_access_history() from public, anon, authenticated;

create or replace function private.prune_benchmark_history()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_batch_size constant integer := 5000;
  v_max_batches constant integer := 4;
  v_batch_rows integer := 0;
  v_technical_rows integer := 0;
  v_artifact_rows integer := 0;
  v_judgment_rows integer := 0;
  v_measurement_rows integer := 0;
  v_output_rows integer := 0;
  v_run_rows integer := 0;
  v_snapshot_source_rows integer := 0;
  v_snapshot_entry_rows integer := 0;
  v_snapshot_rows integer := 0;
  v_signature_rows integer := 0;
  v_case_rows integer := 0;
  v_suite_rows integer := 0;
  v_methodology_rows integer := 0;
begin
  for v_batch_number in 1..v_max_batches loop
    with stale as materialized (
      select output.id
      from private.benchmark_run_outputs output
      where output.technical_detail_expires_at <= v_now
        and (output.technical_trace <> '[]'::jsonb or output.sanitized_error is not null)
      order by output.technical_detail_expires_at, output.id
      limit v_batch_size
      for update skip locked
    )
    update private.benchmark_run_outputs output
    set technical_trace = '[]'::jsonb,
        sanitized_error = null
    from stale
    where output.id = stale.id;
    get diagnostics v_batch_rows = row_count;
    v_technical_rows := v_technical_rows + v_batch_rows;
    exit when v_batch_rows < v_batch_size;
  end loop;

  for v_batch_number in 1..v_max_batches loop
    with stale as materialized (
      select artifact.id
      from private.benchmark_artifact_refs artifact
      join private.benchmark_runs run on run.id = artifact.run_id
      where artifact.retention_expires_at <= v_now
         or (run.retention_expires_at is not null and run.retention_expires_at <= v_now)
      order by artifact.retention_expires_at, artifact.id
      limit v_batch_size
      for update of artifact skip locked
    )
    delete from private.benchmark_artifact_refs artifact
    using stale where artifact.id = stale.id;
    get diagnostics v_batch_rows = row_count;
    v_artifact_rows := v_artifact_rows + v_batch_rows;
    exit when v_batch_rows < v_batch_size;
  end loop;

  for v_batch_number in 1..v_max_batches loop
    with stale as materialized (
      select judgment.id
      from private.benchmark_judgments judgment
      join private.benchmark_runs run on run.id = judgment.run_id
      where judgment.retention_expires_at <= v_now
         or (run.retention_expires_at is not null and run.retention_expires_at <= v_now)
      order by judgment.retention_expires_at, judgment.id
      limit v_batch_size
      for update of judgment skip locked
    )
    delete from private.benchmark_judgments judgment
    using stale where judgment.id = stale.id;
    get diagnostics v_batch_rows = row_count;
    v_judgment_rows := v_judgment_rows + v_batch_rows;
    exit when v_batch_rows < v_batch_size;
  end loop;

  for v_batch_number in 1..v_max_batches loop
    with stale as materialized (
      select source.snapshot_entry_id, source.output_id
      from private.benchmark_leaderboard_snapshot_sources source
      join private.benchmark_leaderboard_snapshot_entries entry
        on entry.id = source.snapshot_entry_id
      join private.benchmark_leaderboard_snapshots snapshot
        on snapshot.id = entry.snapshot_id
      where snapshot.retention_expires_at is not null
        and snapshot.retention_expires_at <= v_now
        and snapshot.publication_state <> 'published'
      order by snapshot.retention_expires_at, source.snapshot_entry_id, source.output_id
      limit v_batch_size
      for update of source skip locked
    )
    delete from private.benchmark_leaderboard_snapshot_sources source
    using stale
    where source.snapshot_entry_id = stale.snapshot_entry_id
      and source.output_id = stale.output_id;
    get diagnostics v_batch_rows = row_count;
    v_snapshot_source_rows := v_snapshot_source_rows + v_batch_rows;
    exit when v_batch_rows < v_batch_size;
  end loop;

  for v_batch_number in 1..v_max_batches loop
    with stale as materialized (
      select measurement.id
      from private.benchmark_measurements measurement
      join private.benchmark_run_outputs output on output.id = measurement.output_id
      join private.benchmark_runs run on run.id = output.run_id
      where run.retention_expires_at is not null and run.retention_expires_at <= v_now
      order by run.retention_expires_at, measurement.id
      limit v_batch_size
      for update of measurement skip locked
    )
    delete from private.benchmark_measurements measurement
    using stale where measurement.id = stale.id;
    get diagnostics v_batch_rows = row_count;
    v_measurement_rows := v_measurement_rows + v_batch_rows;
    exit when v_batch_rows < v_batch_size;
  end loop;

  for v_batch_number in 1..v_max_batches loop
    with stale as materialized (
      select output.id
      from private.benchmark_run_outputs output
      join private.benchmark_runs run on run.id = output.run_id
      where run.retention_expires_at is not null and run.retention_expires_at <= v_now
        and not exists (select 1 from private.benchmark_measurements where output_id = output.id)
        and not exists (select 1 from private.benchmark_judgments where output_id = output.id)
        and not exists (select 1 from private.benchmark_artifact_refs where output_id = output.id)
        and not exists (select 1 from private.benchmark_leaderboard_snapshot_sources where output_id = output.id)
      order by run.retention_expires_at, output.id
      limit v_batch_size
      for update of output skip locked
    )
    delete from private.benchmark_run_outputs output
    using stale where output.id = stale.id;
    get diagnostics v_batch_rows = row_count;
    v_output_rows := v_output_rows + v_batch_rows;
    exit when v_batch_rows < v_batch_size;
  end loop;

  for v_batch_number in 1..v_max_batches loop
    with stale as materialized (
      select run.id
      from private.benchmark_runs run
      where run.retention_expires_at is not null and run.retention_expires_at <= v_now
        and not (
          run.publication_state = 'published'
          and run.visibility = 'public-verified'
          and run.verified_at is not null
          and run.revoked_at is null
        )
        and not exists (select 1 from private.benchmark_run_outputs where run_id = run.id)
        and not exists (select 1 from private.benchmark_judgments where run_id = run.id)
        and not exists (select 1 from private.benchmark_artifact_refs where run_id = run.id)
      order by run.retention_expires_at, run.id
      limit v_batch_size
      for update of run skip locked
    )
    delete from private.benchmark_runs run
    using stale where run.id = stale.id;
    get diagnostics v_batch_rows = row_count;
    v_run_rows := v_run_rows + v_batch_rows;
    exit when v_batch_rows < v_batch_size;
  end loop;

  for v_batch_number in 1..v_max_batches loop
    with stale as materialized (
      select entry.id
      from private.benchmark_leaderboard_snapshot_entries entry
      join private.benchmark_leaderboard_snapshots snapshot on snapshot.id = entry.snapshot_id
      where snapshot.retention_expires_at is not null
        and snapshot.retention_expires_at <= v_now
        and snapshot.publication_state <> 'published'
      order by snapshot.retention_expires_at, entry.id
      limit v_batch_size
      for update of entry skip locked
    )
    delete from private.benchmark_leaderboard_snapshot_entries entry
    using stale where entry.id = stale.id;
    get diagnostics v_batch_rows = row_count;
    v_snapshot_entry_rows := v_snapshot_entry_rows + v_batch_rows;
    exit when v_batch_rows < v_batch_size;
  end loop;

  for v_batch_number in 1..v_max_batches loop
    with stale as materialized (
      select snapshot.id
      from private.benchmark_leaderboard_snapshots snapshot
      where snapshot.retention_expires_at is not null
        and snapshot.retention_expires_at <= v_now
        and snapshot.publication_state <> 'published'
        and not exists (
          select 1 from private.benchmark_leaderboard_snapshot_entries
          where snapshot_id = snapshot.id
        )
      order by snapshot.retention_expires_at, snapshot.id
      limit v_batch_size
      for update of snapshot skip locked
    )
    delete from private.benchmark_leaderboard_snapshots snapshot
    using stale where snapshot.id = stale.id;
    get diagnostics v_batch_rows = row_count;
    v_snapshot_rows := v_snapshot_rows + v_batch_rows;
    exit when v_batch_rows < v_batch_size;
  end loop;

  for v_batch_number in 1..v_max_batches loop
    with stale as materialized (
      select signature.id
      from private.benchmark_signatures signature
      where signature.retention_expires_at is not null
        and signature.retention_expires_at <= v_now
        and not exists (
          select 1
          from private.benchmark_leaderboard_snapshots snapshot
          where signature.subject_type = 'leaderboard_snapshot'
            and signature.subject_key = snapshot.id::text
            and snapshot.publication_state = 'published'
            and snapshot.visibility = 'public-verified'
            and snapshot.verified_at is not null
            and snapshot.revoked_at is null
        )
      order by signature.retention_expires_at, signature.id
      limit v_batch_size
      for update skip locked
    )
    delete from private.benchmark_signatures signature
    using stale where signature.id = stale.id;
    get diagnostics v_batch_rows = row_count;
    v_signature_rows := v_signature_rows + v_batch_rows;
    exit when v_batch_rows < v_batch_size;
  end loop;

  for v_batch_number in 1..v_max_batches loop
    with stale as materialized (
      select benchmark_case.id
      from private.benchmark_cases benchmark_case
      where benchmark_case.retention_expires_at <= v_now
        and benchmark_case.lifecycle_state in ('draft', 'retired')
        and not exists (select 1 from private.benchmark_runs where case_id = benchmark_case.id)
      order by benchmark_case.retention_expires_at, benchmark_case.id
      limit v_batch_size
      for update skip locked
    )
    delete from private.benchmark_cases benchmark_case
    using stale where benchmark_case.id = stale.id;
    get diagnostics v_batch_rows = row_count;
    v_case_rows := v_case_rows + v_batch_rows;
    exit when v_batch_rows < v_batch_size;
  end loop;

  for v_batch_number in 1..v_max_batches loop
    with stale as materialized (
      select suite.id
      from private.benchmark_suites suite
      where suite.retention_expires_at <= v_now
        and suite.lifecycle_state in ('draft', 'retired')
        and not exists (select 1 from private.benchmark_cases where suite_id = suite.id)
        and not exists (select 1 from private.benchmark_leaderboard_snapshots where suite_id = suite.id)
      order by suite.retention_expires_at, suite.id
      limit v_batch_size
      for update skip locked
    )
    delete from private.benchmark_suites suite
    using stale where suite.id = stale.id;
    get diagnostics v_batch_rows = row_count;
    v_suite_rows := v_suite_rows + v_batch_rows;
    exit when v_batch_rows < v_batch_size;
  end loop;

  for v_batch_number in 1..v_max_batches loop
    with stale as materialized (
      select methodology.methodology_id, methodology.version
      from private.benchmark_methodologies methodology
      where methodology.retention_expires_at <= v_now
        and methodology.lifecycle_state in ('draft', 'retired')
        and not exists (
          select 1 from private.benchmark_suites suite
          where suite.methodology_id = methodology.methodology_id
            and suite.methodology_version = methodology.version
        )
        and not exists (
          select 1 from private.benchmark_leaderboard_snapshots snapshot
          where snapshot.methodology_id = methodology.methodology_id
            and snapshot.methodology_version = methodology.version
        )
      order by methodology.retention_expires_at, methodology.methodology_id, methodology.version
      limit v_batch_size
      for update skip locked
    )
    delete from private.benchmark_methodologies methodology
    using stale
    where methodology.methodology_id = stale.methodology_id
      and methodology.version = stale.version;
    get diagnostics v_batch_rows = row_count;
    v_methodology_rows := v_methodology_rows + v_batch_rows;
    exit when v_batch_rows < v_batch_size;
  end loop;

  return pg_catalog.jsonb_build_object(
    'ranAt', v_now,
    'batchSize', v_batch_size,
    'maxBatchesPerPath', v_max_batches,
    'technicalDetailsRedacted', v_technical_rows,
    'artifactReferencesDeleted', v_artifact_rows,
    'rawJudgmentsDeleted', v_judgment_rows,
    'measurementsDeleted', v_measurement_rows,
    'outputsDeleted', v_output_rows,
    'runsDeleted', v_run_rows,
    'snapshotSourcesDeleted', v_snapshot_source_rows,
    'snapshotEntriesDeleted', v_snapshot_entry_rows,
    'snapshotsDeleted', v_snapshot_rows,
    'signaturesDeleted', v_signature_rows,
    'casesDeleted', v_case_rows,
    'suitesDeleted', v_suite_rows,
    'methodologiesDeleted', v_methodology_rows
  );
end;
$$;

alter function private.prune_benchmark_history() owner to postgres;
revoke all on function private.prune_benchmark_history() from public, anon, authenticated;

create or replace function private.prune_lab_access_history()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- Both composed workers use these verified bounds and FOR UPDATE SKIP LOCKED
  -- source selection. Keep them visible at the canonical cron entry point so
  -- operational inspection does not require resolving helper implementation.
  v_batch_size constant integer := 5000;
  v_max_batches constant integer := 4;
  v_stage2 jsonb;
  v_benchmark jsonb;
begin
  if v_batch_size <> 5000 or v_max_batches <> 4 then
    raise exception 'Unexpected maintenance bounds.' using errcode = 'P0001';
  end if;

  v_stage2 := private.prune_stage2_access_history();
  if coalesce((v_stage2 ->> 'skipped')::boolean, false) then
    return v_stage2;
  end if;

  v_benchmark := private.prune_benchmark_history();
  return v_stage2 || pg_catalog.jsonb_build_object('benchmark', v_benchmark);
end;
$$;

alter function private.prune_lab_access_history() owner to postgres;
revoke all on function private.prune_lab_access_history() from public, anon, authenticated;

comment on function private.prune_lab_access_history() is
  'Sole minute-23 bounded retention entry point for Stage 2 access history and Stage 3 benchmark evidence.';

comment on table private.benchmark_runs is
  'Private-by-default canonical benchmark run metadata. Public state is server-authoritative and verified.';
comment on table private.benchmark_judgments is
  'Raw human and model judgments remain distinct and expire independently from preserved public aggregates.';
comment on table private.benchmark_artifact_refs is
  'Opaque private artifact references only; no credentials, internal URLs, or raw content are stored here.';
comment on table private.benchmark_leaderboard_snapshots is
  'Immutable, versioned aggregate evidence snapshots; no universal composite winner is implied.';
