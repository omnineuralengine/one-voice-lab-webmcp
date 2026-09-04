-- Mutable, server-authoritative provider platform policy for Stage 4.
--
-- Installed adapters and capability declarations remain code-owned. These
-- tables only hold operational decisions that may change without a deploy.
-- Provider spend limits continue to live exclusively in
-- private.lab_provider_budgets.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.provider_capability_id_is_valid(p_capability_id text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_capability_id = any (array[
    'discovery.models', 'discovery.voices',
    'stt.prerecorded', 'stt.streaming', 'stt.partial-transcripts',
    'stt.final-transcripts', 'stt.diarization', 'stt.language-detection',
    'stt.multilingual', 'stt.code-switching', 'stt.word-timestamps',
    'stt.utterance-timestamps', 'stt.endpointing',
    'stt.speaker-identification', 'stt.confidence',
    'tts.batch', 'tts.streaming', 'tts.voice-selection', 'tts.custom-voices',
    'tts.voice-cloning', 'tts.pronunciation-control', 'tts.multilingual',
    'tts.timestamps', 'tts.style-control', 'tts.emotion-control', 'tts.speed-control',
    'realtime.speech-to-speech', 'realtime.conversation', 'realtime.barge-in',
    'realtime.turn-detection', 'realtime.reconnect', 'realtime.transport',
    'realtime.server-agent', 'realtime.client-streaming',
    'audio.summarization', 'audio.sentiment', 'audio.topic-extraction',
    'audio.intent-extraction', 'audio.redaction', 'audio.moderation',
    'audio.provider-post-processing',
    'deployment.hosted', 'deployment.self-hosted', 'deployment.local',
    'deployment.private-cloud', 'deployment.regional', 'deployment.on-premises'
  ]::text[])
$$;

alter function private.provider_capability_id_is_valid(text) owner to postgres;
revoke all on function private.provider_capability_id_is_valid(text)
  from public, anon, authenticated;

create table private.provider_runtime_policies (
  provider_id text primary key check (
    provider_id ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
    and char_length(provider_id) between 1 and 80
  ),
  discovery_status text not null default 'cataloged' check (
    discovery_status in (
      'cataloged', 'outreach-planned', 'credentials-requested', 'credentials-received'
    )
  ),
  access_mode text not null default 'globally-disabled' check (
    access_mode in (
      'globally-disabled', 'fixture-only', 'private-testing',
      'trusted-user-access', 'public-use', 'budget-paused'
    )
  ),
  runtime_status text not null default 'disabled' check (
    runtime_status in (
      'enabled', 'disabled', 'budget-paused', 'degraded',
      'unavailable', 'deprecated'
    )
  ),
  benchmark_status text not null default 'ineligible' check (
    benchmark_status in (
      'ineligible', 'fixture-only', 'private-testing',
      'benchmark-eligible', 'publicly-ranked'
    )
  ),
  health_status text not null default 'unknown' check (
    health_status in (
      'configured', 'unconfigured', 'healthy', 'degraded', 'unavailable',
      'disabled', 'budget-paused', 'unknown'
    )
  ),
  health_checked_at timestamptz,
  revision bigint not null default 1 check (revision between 1 and 9000000000000000),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  check (
    (access_mode <> 'public-use' or runtime_status in ('enabled', 'degraded'))
    and (access_mode <> 'budget-paused' or runtime_status = 'budget-paused')
    and (runtime_status <> 'budget-paused' or access_mode = 'budget-paused')
  )
);

create table private.provider_capability_policies (
  provider_id text not null references private.provider_runtime_policies(provider_id)
    on update cascade on delete cascade,
  capability_id text not null check (private.provider_capability_id_is_valid(capability_id)),
  access_mode text not null default 'globally-disabled' check (
    access_mode in (
      'globally-disabled', 'fixture-only', 'private-testing',
      'trusted-user-access', 'public-use', 'budget-paused'
    )
  ),
  benchmark_status text not null default 'ineligible' check (
    benchmark_status in (
      'ineligible', 'fixture-only', 'private-testing',
      'benchmark-eligible', 'publicly-ranked'
    )
  ),
  revision bigint not null default 1 check (revision between 1 and 9000000000000000),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (provider_id, capability_id)
);

create index provider_runtime_policies_operational_idx
  on private.provider_runtime_policies(access_mode, runtime_status, benchmark_status);
create index provider_capability_policies_operational_idx
  on private.provider_capability_policies(access_mode, benchmark_status, provider_id);

alter table private.provider_runtime_policies enable row level security;
alter table private.provider_capability_policies enable row level security;

revoke all on private.provider_runtime_policies from public, anon, authenticated;
revoke all on private.provider_capability_policies from public, anon, authenticated;

-- Catalog membership is intentionally broader than adapter installation. The
-- default policy is fail-closed. Code-owned integration truth is intersected
-- with this state by the server projection; a row can never create an adapter.
insert into private.provider_runtime_policies (provider_id)
select provider_id
from (
  values
    ('deepgram'),
    ('elevenlabs'),
    ('fish-audio'),
    ('cartesia'),
    ('reson8'),
    ('openai'),
    ('soniox'),
    ('mistral-voxtral'),
    ('assemblyai'),
    ('speechmatics'),
    ('gladia'),
    ('rev-ai'),
    ('google-cloud-gemini-live'),
    ('microsoft-azure-speech'),
    ('aws-voice-ai'),
    ('groq'),
    ('nvidia-riva-speech-nim'),
    ('rime'),
    ('hume-ai'),
    ('resemble-ai'),
    ('inworld'),
    ('lmnt'),
    ('smallest-ai'),
    ('camb-ai'),
    ('murf'),
    ('neuphonic'),
    ('playht'),
    ('xai'),
    ('whisper'),
    ('faster-whisper'),
    ('whisper-cpp'),
    ('voxtral-local'),
    ('nvidia-riva-private'),
    ('piper'),
    ('kokoro'),
    ('chatterbox'),
    ('livekit'),
    ('pipecat'),
    ('daily'),
    ('vapi'),
    ('retell'),
    ('bland-ai'),
    ('voiceflow'),
    ('twilio'),
    ('telnyx'),
    ('agora'),
    ('signalwire'),
    ('vonage'),
    ('voximplant'),
    ('deepeval'),
    ('coval'),
    ('cekura')
) as catalog(provider_id)
on conflict (provider_id) do nothing;

update private.provider_runtime_policies
set
  access_mode = 'fixture-only',
  runtime_status = 'disabled',
  benchmark_status = 'fixture-only',
  health_status = 'unknown',
  updated_at = pg_catalog.clock_timestamp()
where provider_id in ('deepgram', 'elevenlabs', 'fish-audio', 'cartesia')
  and revision = 1
  and access_mode = 'globally-disabled';

comment on table private.provider_runtime_policies is
  'Current mutable provider lifecycle policy. Installed adapters remain code-owned; this table cannot manufacture integration support or bypass Stage 2 budgets.';
comment on table private.provider_capability_policies is
  'Optional capability-level operational overrides. The server intersects rows with code-declared capabilities and fails closed for unsupported capabilities.';
comment on column private.provider_runtime_policies.revision is
  'Compare-and-swap revision used to reject concurrent administrative overwrites.';

create or replace function private.provider_policy_actor()
returns private.lab_trust_profiles
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile private.lab_trust_profiles%rowtype;
begin
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

  return v_profile;
end;
$$;

alter function private.provider_policy_actor() owner to postgres;
revoke all on function private.provider_policy_actor() from public, anon, authenticated;

create or replace function private.record_provider_policy_change(
  p_profile private.lab_trust_profiles,
  p_provider_id text,
  p_endpoint_id text,
  p_reason text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_client_hash text := pg_catalog.encode(
    extensions.digest('provider-admin-user:' || p_profile.user_id::text, 'sha256'),
    'hex'
  );
  v_session_hash text := pg_catalog.encode(
    extensions.digest(
      'provider-admin-session:' || coalesce(
        auth.jwt() ->> 'session_id',
        p_profile.user_id::text
      ),
      'sha256'
    ),
    'hex'
  );
begin
  perform private.record_lab_access_audit(
    p_profile.user_id,
    p_profile.tier,
    p_profile.actor_kind,
    'human',
    v_client_hash,
    v_session_hash,
    'provider_catalog',
    p_provider_id,
    p_endpoint_id,
    0,
    true,
    p_reason,
    p_profile.risk_score,
    false
  );
end;
$$;

alter function private.record_provider_policy_change(
  private.lab_trust_profiles, text, text, text
) owner to postgres;
revoke all on function private.record_provider_policy_change(
  private.lab_trust_profiles, text, text, text
) from public, anon, authenticated;

create or replace function public.read_provider_platform_admin(p_guard_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_lab_guard(p_guard_token);
  perform private.provider_policy_actor();

  return pg_catalog.jsonb_build_object(
    'schemaVersion', '1.0.0',
    'generatedAt', pg_catalog.clock_timestamp(),
    'providers', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'providerId', policy.provider_id,
          'discoveryStatus', policy.discovery_status,
          'accessMode', policy.access_mode,
          'runtimeStatus', policy.runtime_status,
          'benchmarkStatus', policy.benchmark_status,
          'healthStatus', policy.health_status,
          'healthCheckedAt', policy.health_checked_at,
          'costAdmissionEnabled', exists (
            select 1
            from private.lab_provider_budgets budget
            where budget.provider_id = policy.provider_id
              and budget.enabled
          ),
          'revision', policy.revision,
          'updatedAt', policy.updated_at
        ) order by policy.provider_id
      )
      from private.provider_runtime_policies policy
    ), '[]'::jsonb),
    'capabilityPolicies', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'providerId', policy.provider_id,
          'capabilityId', policy.capability_id,
          'accessMode', policy.access_mode,
          'benchmarkStatus', policy.benchmark_status,
          'revision', policy.revision,
          'updatedAt', policy.updated_at
        ) order by policy.provider_id, policy.capability_id
      )
      from private.provider_capability_policies policy
    ), '[]'::jsonb)
  );
end;
$$;

alter function public.read_provider_platform_admin(text) owner to postgres;
revoke all on function public.read_provider_platform_admin(text) from public, anon, authenticated;
grant execute on function public.read_provider_platform_admin(text) to authenticated;

-- Public surfaces may inspect only bounded, non-secret operational state. The
-- result is informational; installed adapters remain code-owned and the
-- invocation path separately resolves and enforces effective policy.
create or replace function public.read_provider_platform_public(p_guard_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_lab_guard(p_guard_token);

  return (
    select pg_catalog.jsonb_build_object(
    'schemaVersion', '1.0.0',
    'generatedAt', pg_catalog.clock_timestamp(),
    'providers', coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'providerId', policy.provider_id,
        'discoveryStatus', policy.discovery_status,
        'accessMode', policy.access_mode,
        'runtimeStatus', policy.runtime_status,
        'benchmarkStatus', policy.benchmark_status,
        'healthStatus', policy.health_status,
        'healthCheckedAt', policy.health_checked_at,
        'costAdmissionEnabled', exists (
          select 1
          from private.lab_provider_budgets budget
          where budget.provider_id = policy.provider_id
            and budget.enabled
        ),
        'revision', policy.revision,
        'updatedAt', policy.updated_at,
        'capabilityPolicies', coalesce((
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'capabilityId', capability.capability_id,
              'accessMode', capability.access_mode,
              'benchmarkStatus', capability.benchmark_status,
              'revision', capability.revision,
              'updatedAt', capability.updated_at
            ) order by capability.capability_id
          )
          from private.provider_capability_policies capability
          where capability.provider_id = policy.provider_id
        ), '[]'::jsonb)
      ) order by policy.provider_id
    ), '[]'::jsonb)
    )
    from private.provider_runtime_policies policy
  );
end;
$$;

alter function public.read_provider_platform_public(text) owner to postgres;
revoke all on function public.read_provider_platform_public(text) from public, anon, authenticated;
grant execute on function public.read_provider_platform_public(text) to anon, authenticated;

-- Server-only guard resolution used immediately before any credentialed
-- provider operation. The database can only narrow access; code registration,
-- Stage 2 trust/quota/budget admission, and adapter resolution remain required.
create or replace function public.resolve_provider_runtime_policy(
  p_provider_id text,
  p_capability_id text,
  p_guard_token text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_provider private.provider_runtime_policies%rowtype;
  v_capability private.provider_capability_policies%rowtype;
begin
  perform private.assert_lab_guard(p_guard_token);

  if p_provider_id is null
     or p_provider_id !~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
     or pg_catalog.char_length(p_provider_id) not between 1 and 80
     or not private.provider_capability_id_is_valid(p_capability_id) then
    raise exception 'Invalid provider policy lookup.' using errcode = '22023';
  end if;

  select * into v_provider
  from private.provider_runtime_policies policy
  where policy.provider_id = p_provider_id;

  if not found then
    return pg_catalog.jsonb_build_object(
      'known', false,
      'providerId', p_provider_id,
      'capabilityId', p_capability_id,
      'accessMode', 'globally-disabled',
      'runtimeStatus', 'disabled',
      'benchmarkStatus', 'ineligible'
    );
  end if;

  select * into v_capability
  from private.provider_capability_policies policy
  where policy.provider_id = p_provider_id
    and policy.capability_id = p_capability_id;

  return pg_catalog.jsonb_build_object(
    'known', true,
    'providerId', v_provider.provider_id,
    'capabilityId', p_capability_id,
    'accessMode', case
      when v_provider.access_mode = 'budget-paused'
        or v_capability.access_mode = 'budget-paused' then 'budget-paused'
      when v_provider.access_mode = 'globally-disabled'
        or v_capability.access_mode = 'globally-disabled' then 'globally-disabled'
      when v_provider.access_mode = 'fixture-only'
        or v_capability.access_mode = 'fixture-only' then 'fixture-only'
      when v_provider.access_mode = 'trusted-user-access'
        or v_capability.access_mode = 'trusted-user-access' then 'trusted-user-access'
      when v_provider.access_mode = 'private-testing'
        or v_capability.access_mode = 'private-testing' then 'private-testing'
      else 'public-use'
    end,
    'runtimeStatus', v_provider.runtime_status,
    'benchmarkStatus', case
      when v_provider.benchmark_status = 'ineligible'
        or v_capability.benchmark_status = 'ineligible' then 'ineligible'
      when v_provider.benchmark_status = 'fixture-only'
        or v_capability.benchmark_status = 'fixture-only' then 'fixture-only'
      when v_provider.benchmark_status = 'private-testing'
        or v_capability.benchmark_status = 'private-testing' then 'private-testing'
      when v_provider.benchmark_status = 'benchmark-eligible'
        or v_capability.benchmark_status = 'benchmark-eligible' then 'benchmark-eligible'
      else 'publicly-ranked'
    end,
    'providerRevision', v_provider.revision,
    'capabilityRevision', v_capability.revision
  );
end;
$$;

alter function public.resolve_provider_runtime_policy(text, text, text) owner to postgres;
revoke all on function public.resolve_provider_runtime_policy(text, text, text)
  from public, anon, authenticated;
grant execute on function public.resolve_provider_runtime_policy(text, text, text)
  to anon, authenticated;

create or replace function public.update_provider_runtime_policy(
  p_provider_id text,
  p_expected_revision bigint,
  p_discovery_status text,
  p_access_mode text,
  p_runtime_status text,
  p_benchmark_status text,
  p_health_status text,
  p_health_checked_at timestamptz,
  p_guard_token text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_profile private.lab_trust_profiles%rowtype;
  v_policy private.provider_runtime_policies%rowtype;
begin
  perform private.assert_lab_guard(p_guard_token);
  v_profile := private.provider_policy_actor();

  if p_provider_id is null
     or p_provider_id !~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
     or pg_catalog.char_length(p_provider_id) not between 1 and 80
     or p_expected_revision is null
     or p_expected_revision < 1 then
    raise exception 'Invalid provider runtime policy input.' using errcode = '22023';
  end if;

  if p_discovery_status not in (
       'cataloged', 'outreach-planned', 'credentials-requested', 'credentials-received'
     )
     or p_access_mode not in (
       'globally-disabled', 'fixture-only', 'private-testing',
       'trusted-user-access', 'public-use', 'budget-paused'
     )
     or p_runtime_status not in (
       'enabled', 'disabled', 'budget-paused', 'degraded', 'unavailable', 'deprecated'
     )
     or p_benchmark_status not in (
       'ineligible', 'fixture-only', 'private-testing',
       'benchmark-eligible', 'publicly-ranked'
     )
     or p_health_status not in (
       'configured', 'unconfigured', 'healthy', 'degraded', 'unavailable',
       'disabled', 'budget-paused', 'unknown'
     )
     or (p_access_mode = 'public-use' and p_runtime_status not in ('enabled', 'degraded'))
     or (p_access_mode = 'budget-paused' and p_runtime_status <> 'budget-paused')
     or (p_runtime_status = 'budget-paused' and p_access_mode <> 'budget-paused') then
    raise exception 'Invalid provider runtime policy transition.' using errcode = '22023';
  end if;

  update private.provider_runtime_policies policy
  set
    discovery_status = p_discovery_status,
    access_mode = p_access_mode,
    runtime_status = p_runtime_status,
    benchmark_status = p_benchmark_status,
    health_status = p_health_status,
    health_checked_at = p_health_checked_at,
    revision = policy.revision + 1,
    updated_by = v_profile.user_id,
    updated_at = pg_catalog.clock_timestamp()
  where policy.provider_id = p_provider_id
    and policy.revision = p_expected_revision
  returning * into v_policy;

  if not found then
    if not exists (
      select 1 from private.provider_runtime_policies policy
      where policy.provider_id = p_provider_id
    ) then
      raise exception 'Unknown provider policy.' using errcode = '22023';
    end if;
    raise exception 'Provider runtime policy revision conflict.' using errcode = '40001';
  end if;

  perform private.record_provider_policy_change(
    v_profile,
    v_policy.provider_id,
    'admin.runtime-policy',
    'provider_runtime_policy_updated'
  );

  return pg_catalog.jsonb_build_object(
    'providerId', v_policy.provider_id,
    'discoveryStatus', v_policy.discovery_status,
    'accessMode', v_policy.access_mode,
    'runtimeStatus', v_policy.runtime_status,
    'benchmarkStatus', v_policy.benchmark_status,
    'healthStatus', v_policy.health_status,
    'healthCheckedAt', v_policy.health_checked_at,
    'revision', v_policy.revision,
    'updatedAt', v_policy.updated_at
  );
end;
$$;

alter function public.update_provider_runtime_policy(
  text, bigint, text, text, text, text, text, timestamptz, text
) owner to postgres;
revoke all on function public.update_provider_runtime_policy(
  text, bigint, text, text, text, text, text, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.update_provider_runtime_policy(
  text, bigint, text, text, text, text, text, timestamptz, text
) to authenticated;

create or replace function public.update_provider_capability_policy(
  p_provider_id text,
  p_capability_id text,
  p_expected_revision bigint,
  p_access_mode text,
  p_benchmark_status text,
  p_guard_token text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_profile private.lab_trust_profiles%rowtype;
  v_policy private.provider_capability_policies%rowtype;
begin
  perform private.assert_lab_guard(p_guard_token);
  v_profile := private.provider_policy_actor();

  if p_provider_id is null
     or p_provider_id !~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
     or pg_catalog.char_length(p_provider_id) not between 1 and 80
     or not private.provider_capability_id_is_valid(p_capability_id)
     or p_expected_revision is null
     or p_expected_revision < 0
     or p_access_mode not in (
       'globally-disabled', 'fixture-only', 'private-testing',
       'trusted-user-access', 'public-use', 'budget-paused'
     )
     or p_benchmark_status not in (
       'ineligible', 'fixture-only', 'private-testing',
       'benchmark-eligible', 'publicly-ranked'
     ) then
    raise exception 'Invalid provider capability policy input.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from private.provider_runtime_policies policy
    where policy.provider_id = p_provider_id
  ) then
    raise exception 'Unknown provider policy.' using errcode = '22023';
  end if;

  if p_expected_revision = 0 then
    begin
      insert into private.provider_capability_policies (
        provider_id, capability_id, access_mode, benchmark_status,
        revision, updated_by, updated_at
      ) values (
        p_provider_id, p_capability_id, p_access_mode, p_benchmark_status,
        1, v_profile.user_id, pg_catalog.clock_timestamp()
      )
      returning * into v_policy;
    exception when unique_violation then
      raise exception 'Provider capability policy revision conflict.' using errcode = '40001';
    end;
  else
    update private.provider_capability_policies policy
    set
      access_mode = p_access_mode,
      benchmark_status = p_benchmark_status,
      revision = policy.revision + 1,
      updated_by = v_profile.user_id,
      updated_at = pg_catalog.clock_timestamp()
    where policy.provider_id = p_provider_id
      and policy.capability_id = p_capability_id
      and policy.revision = p_expected_revision
    returning * into v_policy;

    if not found then
      raise exception 'Provider capability policy revision conflict.' using errcode = '40001';
    end if;
  end if;

  perform private.record_provider_policy_change(
    v_profile,
    v_policy.provider_id,
    pg_catalog.left('admin.capability:' || v_policy.capability_id, 80),
    'provider_capability_policy_updated'
  );

  return pg_catalog.jsonb_build_object(
    'providerId', v_policy.provider_id,
    'capabilityId', v_policy.capability_id,
    'accessMode', v_policy.access_mode,
    'benchmarkStatus', v_policy.benchmark_status,
    'revision', v_policy.revision,
    'updatedAt', v_policy.updated_at
  );
end;
$$;

alter function public.update_provider_capability_policy(
  text, text, bigint, text, text, text
) owner to postgres;
revoke all on function public.update_provider_capability_policy(
  text, text, bigint, text, text, text
) from public, anon, authenticated;
grant execute on function public.update_provider_capability_policy(
  text, text, bigint, text, text, text
) to authenticated;

-- Provider presentation preferences extend the existing ONE identity row.
-- Arrays are intentionally bounded; catalog validation happens in a trigger so
-- direct Data API writes cannot invent provider IDs or elevate runtime access.
alter table public.user_preferences
  add column favorite_provider_ids text[] not null default '{}'::text[],
  add column hidden_provider_ids text[] not null default '{}'::text[],
  add column preferred_provider_order text[] not null default '{}'::text[],
  add column default_stt_provider_id text,
  add column default_tts_provider_id text,
  add column preferred_comparison_provider_ids text[] not null default '{}'::text[],
  add column preferred_deployment_class text check (
    preferred_deployment_class is null
    or preferred_deployment_class in (
      'hosted', 'self-hosted', 'local', 'private-cloud', 'regional', 'on-premises'
    )
  ),
  add column provider_preferences_revision bigint not null default 1 check (
    provider_preferences_revision between 1 and 9000000000000000
  ),
  add constraint user_preferences_favorite_providers_bound check (
    pg_catalog.cardinality(favorite_provider_ids) <= 32
  ),
  add constraint user_preferences_hidden_providers_bound check (
    pg_catalog.cardinality(hidden_provider_ids) <= 32
  ),
  add constraint user_preferences_provider_order_bound check (
    pg_catalog.cardinality(preferred_provider_order) <= 64
  ),
  add constraint user_preferences_comparison_providers_bound check (
    pg_catalog.cardinality(preferred_comparison_provider_ids) <= 4
  );

create or replace function private.provider_preference_array_is_valid(
  p_provider_ids text[],
  p_maximum integer
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_provider_ids is not null
    and pg_catalog.cardinality(p_provider_ids) <= p_maximum
    and not exists (
      select 1
      from pg_catalog.unnest(p_provider_ids) as item(provider_id)
      where item.provider_id is null
         or item.provider_id !~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
         or pg_catalog.char_length(item.provider_id) not between 1 and 80
         or not exists (
           select 1
           from private.provider_runtime_policies policy
           where policy.provider_id = item.provider_id
         )
    )
    and pg_catalog.cardinality(p_provider_ids) = (
      select pg_catalog.count(distinct item.provider_id)::integer
      from pg_catalog.unnest(p_provider_ids) as item(provider_id)
    )
$$;

alter function private.provider_preference_array_is_valid(text[], integer) owner to postgres;
revoke all on function private.provider_preference_array_is_valid(text[], integer)
  from public, anon, authenticated;

create or replace function private.validate_provider_preferences()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.provider_preference_array_is_valid(new.favorite_provider_ids, 32)
     or not private.provider_preference_array_is_valid(new.hidden_provider_ids, 32)
     or not private.provider_preference_array_is_valid(new.preferred_provider_order, 64)
     or not private.provider_preference_array_is_valid(new.preferred_comparison_provider_ids, 4)
     or exists (
       select 1
       from pg_catalog.unnest(new.favorite_provider_ids) as favorite(provider_id)
       where favorite.provider_id = any(new.hidden_provider_ids)
     )
     or (
       new.default_stt_provider_id is not null
       and not exists (
         select 1 from private.provider_runtime_policies policy
         where policy.provider_id = new.default_stt_provider_id
       )
     )
     or (
       new.default_tts_provider_id is not null
       and not exists (
         select 1 from private.provider_runtime_policies policy
         where policy.provider_id = new.default_tts_provider_id
       )
     ) then
    raise exception 'Invalid provider preferences.' using errcode = '22023';
  end if;

  if tg_op = 'INSERT' then
    new.provider_preferences_revision := 1;
  else
    new.provider_preferences_revision := old.provider_preferences_revision + 1;
  end if;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

alter function private.validate_provider_preferences() owner to postgres;
revoke all on function private.validate_provider_preferences() from public, anon, authenticated;

drop trigger if exists user_preferences_provider_validation on public.user_preferences;
create trigger user_preferences_provider_validation
before insert or update of
  favorite_provider_ids,
  hidden_provider_ids,
  preferred_provider_order,
  default_stt_provider_id,
  default_tts_provider_id,
  preferred_comparison_provider_ids,
  preferred_deployment_class,
  provider_preferences_revision
on public.user_preferences
for each row execute function private.validate_provider_preferences();

comment on column public.user_preferences.favorite_provider_ids is
  'Bounded presentation preference only. It cannot enable a provider or bypass trust, capability, quota, concurrency, or budget policy.';
comment on column public.user_preferences.provider_preferences_revision is
  'Server-maintained revision for provider preference updates.';
