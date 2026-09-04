create table private.lab_runtime_config (
  config_key text primary key,
  token_sha256 text not null check (token_sha256 ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now()
);

insert into private.lab_runtime_config (config_key, token_sha256)
values ('usage_guard', '7b2d9eb8ba9ae8f40e2740bf4f25b8337d6e84b5654bfc2a1c97ca52354ff2e8');

create table private.guest_usage_daily (
  usage_date date not null default (timezone('utc', now()))::date,
  subject_hash text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  operation text not null check (operation in ('provider_catalog', 'speech_generation', 'speech_transcription', 'realtime_session', 'ai_reasoning', 'deliverable_generation')),
  request_count integer not null default 1 check (request_count between 1 and 1001),
  updated_at timestamptz not null default now(),
  primary key (usage_date, subject_hash, operation)
);

create index guest_usage_daily_subject_idx on private.guest_usage_daily(subject_hash);

create table private.lab_global_usage_daily (
  usage_date date not null default (timezone('utc', now()))::date,
  operation text not null check (operation in ('provider_catalog', 'speech_generation', 'speech_transcription', 'realtime_session', 'ai_reasoning', 'deliverable_generation')),
  request_count integer not null default 1 check (request_count between 1 and 10001),
  updated_at timestamptz not null default now(),
  primary key (usage_date, operation)
);

drop function public.consume_member_usage(text);

create function public.consume_member_usage(p_operation text)
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
    return query select false, 'member'::text, v_used, v_allowance, v_resets_at, 'member_limit'::text;
    return;
  end if;

  insert into private.lab_global_usage_daily (usage_date, operation, request_count, updated_at)
  values (v_date, p_operation, 1, now())
  on conflict (usage_date, operation)
  do update set request_count = least(private.lab_global_usage_daily.request_count + 1, v_global_allowance + 1), updated_at = now()
  returning request_count into v_global_used;

  return query select v_global_used <= v_global_allowance, 'member'::text, v_used, v_allowance, v_resets_at,
    case when v_global_used <= v_global_allowance then 'allowed' else 'global_limit' end;
end;
$$;

revoke all on function public.consume_member_usage(text) from public, anon, authenticated;
grant execute on function public.consume_member_usage(text) to authenticated;

create function public.consume_guest_usage(p_operation text, p_subject_hash text, p_guard_token text)
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
  v_expected_digest text;
  v_resets_at timestamptz := ((timezone('utc', now()))::date + 1)::timestamp at time zone 'UTC';
begin
  select token_sha256 into v_expected_digest
  from private.lab_runtime_config
  where config_key = 'usage_guard';

  if v_expected_digest is null
     or char_length(p_guard_token) > 256
     or encode(extensions.digest(p_guard_token, 'sha256'), 'hex') <> v_expected_digest then
    raise exception 'Invalid usage guard.' using errcode = '42501';
  end if;
  if p_subject_hash !~ '^[0-9a-f]{64}$' then
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
