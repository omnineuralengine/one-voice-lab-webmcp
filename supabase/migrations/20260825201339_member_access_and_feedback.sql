create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.member_usage_daily (
  usage_date date not null default (timezone('utc', now()))::date,
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null check (operation in ('provider_catalog', 'speech_generation', 'speech_transcription', 'realtime_session', 'ai_reasoning', 'deliverable_generation')),
  request_count integer not null default 1 check (request_count between 1 and 1001),
  updated_at timestamptz not null default now(),
  primary key (usage_date, user_id, operation)
);

create index member_usage_daily_user_idx on private.member_usage_daily(user_id);

create or replace function public.consume_member_usage(p_operation text)
returns table (
  allowed boolean,
  tier text,
  used integer,
  allowance integer,
  resets_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_date date := (timezone('utc', now()))::date;
  v_allowance integer;
  v_used integer;
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

  if v_allowance is null then
    raise exception 'Unknown Lab usage operation.' using errcode = '22023';
  end if;

  insert into private.member_usage_daily (usage_date, user_id, operation, request_count, updated_at)
  values (v_date, v_user_id, p_operation, 1, now())
  on conflict (usage_date, user_id, operation)
  do update set
    request_count = least(private.member_usage_daily.request_count + 1, v_allowance + 1),
    updated_at = now()
  returning request_count into v_used;

  return query
  select
    v_used <= v_allowance,
    'member'::text,
    v_used,
    v_allowance,
    ((v_date + 1)::timestamp at time zone 'UTC');
end;
$$;

revoke all on function public.consume_member_usage(text) from public, anon, authenticated;
grant execute on function public.consume_member_usage(text) to authenticated;

create table public.feedback_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  sentiment text not null check (sentiment in ('yay', 'nay')),
  message text check (message is null or char_length(message) between 1 and 2000),
  input_method text not null check (input_method in ('tap', 'typed', 'dictated')),
  surface text not null check (surface in ('home', 'providers', 'provider', 'simulate', 'build', 'learn', 'settings', 'studio', 'bench', 'other')),
  provider_id text check (provider_id is null or provider_id in ('deepgram', 'fish-audio', 'elevenlabs', 'multi-provider')),
  created_at timestamptz not null default now()
);

comment on table public.feedback_entries is
  'Bounded visitor feedback. Optional text only; no raw audio, transcript history, IP address, or device identifier is stored.';

create index feedback_entries_created_idx on public.feedback_entries(created_at desc);
create index feedback_entries_user_created_idx on public.feedback_entries(user_id, created_at desc) where user_id is not null;

alter table public.feedback_entries enable row level security;
revoke all on public.feedback_entries from anon, authenticated;

create or replace function public.submit_feedback(
  p_sentiment text,
  p_message text,
  p_input_method text,
  p_surface text,
  p_provider_id text default null
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

revoke all on function public.submit_feedback(text, text, text, text, text) from public;
grant execute on function public.submit_feedback(text, text, text, text, text) to anon, authenticated;
