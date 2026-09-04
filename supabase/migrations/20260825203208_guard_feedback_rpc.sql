drop function public.submit_feedback(text, text, text, text, text);

create function public.submit_feedback(
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
  v_expected_digest text;
begin
  select token_sha256 into v_expected_digest
  from private.lab_runtime_config
  where config_key = 'usage_guard';

  if v_expected_digest is null
     or char_length(p_guard_token) > 256
     or encode(extensions.digest(p_guard_token, 'sha256'), 'hex') <> v_expected_digest then
    raise exception 'Invalid feedback guard.' using errcode = '42501';
  end if;
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

revoke all on function public.submit_feedback(text, text, text, text, text, text) from public;
grant execute on function public.submit_feedback(text, text, text, text, text, text) to anon, authenticated;
