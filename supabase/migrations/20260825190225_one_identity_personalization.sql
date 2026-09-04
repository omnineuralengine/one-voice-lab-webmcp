-- ONE Voice Lab identity adds optional personalization only. Existing local-first
-- Lab state is intentionally outside this schema.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 80),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  primary_hex text not null default '#9966CC' check (primary_hex ~ '^#[0-9A-F]{6}$'),
  secondary_hex text not null default '#009966' check (secondary_hex ~ '^#[0-9A-F]{6}$'),
  appearance text not null default 'dark' check (appearance in ('dark', 'light', 'system')),
  reduced_motion boolean not null default false,
  default_module text check (default_module is null or default_module in ('/', '/simulation-lab', '/build', '/learn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default false,
  new_labs boolean not null default true,
  provider_updates boolean not null default true,
  simulation_updates boolean not null default true,
  security_updates boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lab_updates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 120),
  summary text not null check (char_length(summary) between 1 and 500),
  category text not null check (category in ('lab', 'provider', 'simulation', 'security')),
  provider text,
  href text not null default '/' check (href like '/%' and href not like '//%'),
  published_at timestamptz,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.user_notification_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  update_id uuid not null references public.lab_updates(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, update_id)
);

create table if not exists public.saved_experiments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  experiment_type text not null check (experiment_type = 'simulation'),
  schema_version text not null check (schema_version = 'one-simulation-experiment-v1'),
  configuration jsonb not null check (jsonb_typeof(configuration) = 'object' and octet_length(configuration::text) <= 65536),
  result jsonb check (result is null or (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 131072)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_experiments_user_updated_idx on public.saved_experiments(user_id, updated_at desc);
create index if not exists lab_updates_public_published_idx on public.lab_updates(is_public, published_at desc);

alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.lab_updates enable row level security;
alter table public.user_notification_state enable row level security;
alter table public.saved_experiments enable row level security;

revoke all on public.profiles, public.user_preferences, public.notification_preferences, public.user_notification_state, public.saved_experiments from anon, authenticated;
revoke all on public.lab_updates from anon, authenticated;
grant select, insert, update, delete on public.profiles, public.user_preferences, public.notification_preferences, public.user_notification_state, public.saved_experiments to authenticated;
grant select on public.lab_updates to anon, authenticated;

create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles_delete_own" on public.profiles for delete to authenticated using ((select auth.uid()) = id);

create policy "preferences_select_own" on public.user_preferences for select to authenticated using ((select auth.uid()) = user_id);
create policy "preferences_insert_own" on public.user_preferences for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "preferences_update_own" on public.user_preferences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "preferences_delete_own" on public.user_preferences for delete to authenticated using ((select auth.uid()) = user_id);

create policy "notification_preferences_select_own" on public.notification_preferences for select to authenticated using ((select auth.uid()) = user_id);
create policy "notification_preferences_insert_own" on public.notification_preferences for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "notification_preferences_update_own" on public.notification_preferences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "notification_preferences_delete_own" on public.notification_preferences for delete to authenticated using ((select auth.uid()) = user_id);

create policy "lab_updates_read_public" on public.lab_updates for select to anon, authenticated using (is_public and published_at is not null and published_at <= now());

create policy "notification_state_select_own" on public.user_notification_state for select to authenticated using ((select auth.uid()) = user_id);
create policy "notification_state_insert_own" on public.user_notification_state for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "notification_state_update_own" on public.user_notification_state for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "notification_state_delete_own" on public.user_notification_state for delete to authenticated using ((select auth.uid()) = user_id);

create policy "saved_experiments_select_own" on public.saved_experiments for select to authenticated using ((select auth.uid()) = user_id);
create policy "saved_experiments_insert_own" on public.saved_experiments for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "saved_experiments_update_own" on public.saved_experiments for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "saved_experiments_delete_own" on public.saved_experiments for delete to authenticated using ((select auth.uid()) = user_id);

insert into public.lab_updates (id, slug, title, summary, category, provider, href, published_at, is_public)
values
  ('020f1f1e-14c8-4f1b-a9e1-0cdcd7a11501', 'one-voice-lab-identity', 'Welcome to ONE Voice Lab', 'The independent lab now sits under Omni Neural Engine while retaining provider-specific evidence and execution boundaries.', 'lab', null, '/', '2026-08-21T12:00:00Z', true),
  ('020f1f1e-14c8-4f1b-a9e1-0cdcd7a11502', 'simulation-lab-v1', 'Simulation Lab V1', 'Run deterministic, nonbillable failure replays and save bounded experiment records locally or to an explicitly connected account.', 'simulation', null, '/simulation-lab', '2026-08-21T12:00:00Z', true)
on conflict (id) do update set
  title = excluded.title,
  summary = excluded.summary,
  href = excluded.href,
  published_at = excluded.published_at,
  is_public = excluded.is_public;
