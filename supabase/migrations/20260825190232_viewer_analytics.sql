-- Privacy-preserving product analytics for ONE Voice Lab.
-- Rows intentionally contain no visitor, account, IP, user-agent, referrer,
-- query-string, prompt, transcript, or audio identifiers.

create table if not exists public.viewer_events (
  id bigint generated always as identity primary key,
  event_name text not null check (
    event_name in ('page_view', 'provider_profile_open', 'provider_module_open')
  ),
  surface text not null check (
    surface in ('home', 'providers', 'provider', 'simulate', 'build', 'learn', 'settings', 'other')
  ),
  provider_id text check (
    provider_id is null or provider_id in ('deepgram', 'fish-audio', 'elevenlabs')
  ),
  occurred_at timestamptz not null default now()
);

alter table public.viewer_events enable row level security;

revoke all on table public.viewer_events from public, anon, authenticated;
revoke all on sequence public.viewer_events_id_seq from public, anon, authenticated;

grant insert on table public.viewer_events to anon;
grant usage on sequence public.viewer_events_id_seq to anon;

create policy "viewer_events_insert_bounded"
  on public.viewer_events
  for insert
  to anon
  with check (
    event_name in ('page_view', 'provider_profile_open', 'provider_module_open')
    and surface in ('home', 'providers', 'provider', 'simulate', 'build', 'learn', 'settings', 'other')
    and (provider_id is null or provider_id in ('deepgram', 'fish-audio', 'elevenlabs'))
  );

create index if not exists viewer_events_occurred_at_idx
  on public.viewer_events (occurred_at desc);

create index if not exists viewer_events_event_surface_time_idx
  on public.viewer_events (event_name, surface, occurred_at desc);

create index if not exists viewer_events_provider_time_idx
  on public.viewer_events (provider_id, occurred_at desc)
  where provider_id is not null;

comment on table public.viewer_events is
  'Aggregate-friendly ONE Voice Lab product events. No visitor or content identifiers are retained; anon may insert bounded rows but cannot read them.';
