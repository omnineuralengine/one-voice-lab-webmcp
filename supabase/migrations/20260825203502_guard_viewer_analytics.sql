revoke insert on table public.viewer_events from anon;
revoke usage on sequence public.viewer_events_id_seq from anon;
drop policy if exists viewer_events_insert_bounded on public.viewer_events;

create function public.record_viewer_event(
  p_event_name text,
  p_surface text,
  p_provider_id text,
  p_guard_token text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected_digest text;
  v_id bigint;
begin
  select token_sha256 into v_expected_digest
  from private.lab_runtime_config
  where config_key = 'usage_guard';

  if v_expected_digest is null
     or char_length(p_guard_token) > 256
     or encode(extensions.digest(p_guard_token, 'sha256'), 'hex') <> v_expected_digest then
    raise exception 'Invalid analytics guard.' using errcode = '42501';
  end if;
  if p_event_name not in ('page_view', 'provider_profile_open', 'provider_module_open') then
    raise exception 'Invalid viewer event.' using errcode = '22023';
  end if;
  if p_surface not in ('home', 'providers', 'provider', 'simulate', 'build', 'learn', 'settings', 'other') then
    raise exception 'Invalid analytics surface.' using errcode = '22023';
  end if;
  if p_provider_id is not null and p_provider_id not in ('deepgram', 'fish-audio', 'elevenlabs') then
    raise exception 'Invalid analytics provider.' using errcode = '22023';
  end if;
  if (select count(*) from public.viewer_events where occurred_at >= now() - interval '1 hour') >= 10000 then
    raise exception 'Viewer analytics is temporarily at capacity.' using errcode = 'P0001';
  end if;

  insert into public.viewer_events (event_name, surface, provider_id)
  values (p_event_name, p_surface, p_provider_id)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_viewer_event(text, text, text, text) from public;
grant execute on function public.record_viewer_event(text, text, text, text) to anon, authenticated;

comment on table public.viewer_events is
  'Aggregate-friendly ONE Voice Lab product events. No visitor or content identifiers are retained; writes are mediated by a guarded server RPC and anonymous callers cannot read rows.';
