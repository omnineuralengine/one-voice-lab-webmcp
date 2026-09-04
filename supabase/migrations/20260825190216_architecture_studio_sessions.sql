-- Applied to the canonical ONE Voice Lab Supabase project on 2026-08-25.
create table if not exists public.architecture_studio_sessions (
  id uuid primary key,
  code text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  presenter_token_hash text not null,
  snapshot jsonb not null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.architecture_studio_sessions enable row level security;

revoke all on table public.architecture_studio_sessions from public, anon, authenticated;
grant select, insert, update, delete on table public.architecture_studio_sessions to service_role;

create index if not exists architecture_studio_sessions_expires_at_idx
  on public.architecture_studio_sessions (expires_at);

comment on table public.architecture_studio_sessions is
  'Short-lived fictional discovery workshop state. Access is mediated by server routes; anon clients have no Data API grants.';

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'architecture-studio-expiry',
  '7 * * * *',
  $$ delete from public.architecture_studio_sessions where expires_at <= now() $$
);
