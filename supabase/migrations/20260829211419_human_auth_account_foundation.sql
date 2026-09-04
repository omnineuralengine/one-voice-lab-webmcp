-- release-stage keeps Supabase Auth as the authenticator while deriving application
-- ownership from auth.uid(). Guest payloads are never persisted in this ledger.

create table private.guest_account_migrations (
  guest_key_hash text primary key check (guest_key_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  migration_version text not null default 'one-guest-state/1.0.0'
    check (migration_version = 'one-guest-state/1.0.0'),
  status text not null default 'claimed' check (status in ('claimed', 'completed')),
  payload_sha256 text check (payload_sha256 is null or payload_sha256 ~ '^[0-9a-f]{64}$'),
  preferences_imported boolean not null default false,
  notification_preferences_imported boolean not null default false,
  notification_reads_imported smallint not null default 0
    check (notification_reads_imported between 0 and 100),
  experiments_imported smallint not null default 0
    check (experiments_imported between 0 and 12),
  claimed_at timestamptz not null default pg_catalog.clock_timestamp(),
  completed_at timestamptz,
  check (
    (status = 'claimed' and completed_at is null and payload_sha256 is null)
    or (status = 'completed' and completed_at is not null and payload_sha256 is not null)
  )
);

create index guest_account_migrations_user_claimed_idx
  on private.guest_account_migrations(user_id, claimed_at desc);

alter table private.guest_account_migrations enable row level security;
revoke all on private.guest_account_migrations from public, anon, authenticated;

comment on table private.guest_account_migrations is
  'Bounded, content-free idempotency and same-device ownership ledger for explicit guest-to-account migration.';

create or replace function private.one_jsonb_text_array(
  p_value jsonb,
  p_maximum integer
)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_result text[];
begin
  if p_value is null or p_value = 'null'::jsonb then
    return '{}'::text[];
  end if;
  if pg_catalog.jsonb_typeof(p_value) <> 'array'
     or pg_catalog.jsonb_array_length(p_value) > p_maximum then
    raise exception 'Invalid guest migration array.' using errcode = '22023';
  end if;
  select coalesce(pg_catalog.array_agg(value), '{}'::text[])
    into v_result
  from pg_catalog.jsonb_array_elements_text(p_value) item(value);
  if exists (
    select 1 from pg_catalog.unnest(v_result) value
    where pg_catalog.char_length(value) > 160
  ) then
    raise exception 'Invalid guest migration array value.' using errcode = '22023';
  end if;
  return v_result;
end;
$$;

revoke all on function private.one_jsonb_text_array(jsonb, integer)
  from public, anon, authenticated;

create or replace function public.claim_one_guest_migration(p_guest_key_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing private.guest_account_migrations%rowtype;
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if coalesce((nullif(auth.jwt() ->> 'is_anonymous', ''))::boolean, false) then
    raise exception 'Verified human authentication is required.' using errcode = '42501';
  end if;
  if p_guest_key_hash is null or p_guest_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid guest migration identity.' using errcode = '22023';
  end if;

  -- Serialize both the per-human bounded claim count and the receipt itself.
  -- Distinct guest receipts for one human must not race past the 16-device cap.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('one-guest-migration-user:' || v_user_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('one-guest-migration:' || p_guest_key_hash, 0)
  );

  select * into v_existing
  from private.guest_account_migrations migration
  where migration.guest_key_hash = p_guest_key_hash;

  if found then
    if v_existing.user_id <> v_user_id then
      return pg_catalog.jsonb_build_object('status', 'claimed-by-another-account');
    end if;
    if v_existing.status = 'completed' then
      return pg_catalog.jsonb_build_object(
        'status', 'already-migrated',
        'preferencesImported', v_existing.preferences_imported,
        'notificationPreferencesImported', v_existing.notification_preferences_imported,
        'notificationReadsImported', v_existing.notification_reads_imported,
        'experimentsImported', v_existing.experiments_imported
      );
    end if;
    return pg_catalog.jsonb_build_object('status', 'claimed');
  end if;

  select pg_catalog.count(*)::integer into v_count
  from private.guest_account_migrations migration
  where migration.user_id = v_user_id;
  if v_count >= 16 then
    return pg_catalog.jsonb_build_object('status', 'migration-limit-reached');
  end if;

  insert into private.guest_account_migrations (guest_key_hash, user_id)
  values (p_guest_key_hash, v_user_id);
  return pg_catalog.jsonb_build_object('status', 'claimed');
end;
$$;

revoke all on function public.claim_one_guest_migration(text)
  from public, anon, authenticated;
grant execute on function public.claim_one_guest_migration(text) to authenticated;

create or replace function public.migrate_one_guest_state(
  p_guest_key_hash text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_claim jsonb;
  v_preferences_imported boolean := false;
  v_notifications_imported boolean := false;
  v_reads_imported integer := 0;
  v_experiments_imported integer := 0;
  v_remaining_experiments integer;
  v_theme jsonb;
  v_lab jsonb;
  v_notifications jsonb;
  v_provider jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if coalesce((nullif(auth.jwt() ->> 'is_anonymous', ''))::boolean, false) then
    raise exception 'Verified human authentication is required.' using errcode = '42501';
  end if;
  if p_payload is null
     or pg_catalog.jsonb_typeof(p_payload) <> 'object'
     or pg_catalog.octet_length(p_payload::text) > 160000
     or p_payload ->> 'schemaVersion' <> 'one-guest-state/1.0.0'
     or pg_catalog.jsonb_typeof(coalesce(p_payload -> 'readUpdateIds', '[]'::jsonb)) <> 'array'
     or pg_catalog.jsonb_array_length(coalesce(p_payload -> 'readUpdateIds', '[]'::jsonb)) > 100
     or pg_catalog.jsonb_typeof(coalesce(p_payload -> 'experiments', '[]'::jsonb)) <> 'array'
     or pg_catalog.jsonb_array_length(coalesce(p_payload -> 'experiments', '[]'::jsonb)) > 12 then
    raise exception 'Invalid guest migration payload.' using errcode = '22023';
  end if;

  v_claim := public.claim_one_guest_migration(p_guest_key_hash);
  if v_claim ->> 'status' in (
    'already-migrated', 'claimed-by-another-account', 'migration-limit-reached'
  ) then
    return v_claim;
  end if;

  v_theme := p_payload -> 'theme';
  v_lab := p_payload -> 'labPreferences';
  v_notifications := p_payload -> 'notificationPreferences';
  v_provider := p_payload -> 'providerPreferences';

  if (v_theme is not null and v_theme <> 'null'::jsonb)
     or (v_lab is not null and v_lab <> 'null'::jsonb)
     or (v_provider is not null and v_provider <> 'null'::jsonb) then
    if (v_theme is not null and v_theme <> 'null'::jsonb and (
      pg_catalog.jsonb_typeof(v_theme) <> 'object'
      or upper(v_theme ->> 'primaryHex') !~ '^#[0-9A-F]{6}$'
      or upper(v_theme ->> 'secondaryHex') !~ '^#[0-9A-F]{6}$'
      or v_theme ->> 'appearance' not in ('dark', 'light', 'system')
      or v_theme ->> 'reducedMotion' not in ('true', 'false')
    )) then
      raise exception 'Invalid guest theme.' using errcode = '22023';
    end if;
    if (v_lab is not null and v_lab <> 'null'::jsonb and (
      pg_catalog.jsonb_typeof(v_lab) <> 'object'
      or v_lab ->> 'defaultModule' not in ('/', '/simulation-lab', '/build', '/learn')
    )) then
      raise exception 'Invalid guest Lab preferences.' using errcode = '22023';
    end if;
    if v_provider is not null and v_provider <> 'null'::jsonb
       and pg_catalog.jsonb_typeof(v_provider) <> 'object' then
      raise exception 'Invalid guest provider preferences.' using errcode = '22023';
    end if;

    insert into public.user_preferences (
      user_id, primary_hex, secondary_hex, appearance, reduced_motion, default_module,
      favorite_provider_ids, hidden_provider_ids, preferred_provider_order,
      default_stt_provider_id, default_tts_provider_id,
      preferred_comparison_provider_ids, preferred_deployment_class
    ) values (
      v_user_id,
      coalesce(upper(v_theme ->> 'primaryHex'), '#9966CC'),
      coalesce(upper(v_theme ->> 'secondaryHex'), '#009966'),
      coalesce(v_theme ->> 'appearance', 'dark'),
      coalesce((v_theme ->> 'reducedMotion')::boolean, false),
      v_lab ->> 'defaultModule',
      private.one_jsonb_text_array(v_provider -> 'favoriteProviderIds', 32),
      private.one_jsonb_text_array(v_provider -> 'hiddenProviderIds', 32),
      private.one_jsonb_text_array(v_provider -> 'preferredProviderOrder', 64),
      nullif(v_provider ->> 'defaultSttProviderId', ''),
      nullif(v_provider ->> 'defaultTtsProviderId', ''),
      private.one_jsonb_text_array(v_provider -> 'preferredComparisonProviderIds', 4),
      nullif(v_provider ->> 'preferredDeploymentClass', '')
    ) on conflict (user_id) do nothing;
    get diagnostics v_reads_imported = row_count;
    v_preferences_imported := v_reads_imported = 1;
    v_reads_imported := 0;
  end if;

  if v_notifications is not null and v_notifications <> 'null'::jsonb then
    if pg_catalog.jsonb_typeof(v_notifications) <> 'object'
       or v_notifications ->> 'inAppEnabled' not in ('true', 'false')
       or v_notifications ->> 'emailEnabled' not in ('true', 'false')
       or v_notifications ->> 'newLabs' not in ('true', 'false')
       or v_notifications ->> 'providerUpdates' not in ('true', 'false')
       or v_notifications ->> 'simulationUpdates' not in ('true', 'false')
       or v_notifications ->> 'securityUpdates' not in ('true', 'false') then
      raise exception 'Invalid guest notification preferences.' using errcode = '22023';
    end if;
    insert into public.notification_preferences (
      user_id, in_app_enabled, email_enabled, new_labs,
      provider_updates, simulation_updates, security_updates
    ) values (
      v_user_id,
      (v_notifications ->> 'inAppEnabled')::boolean,
      (v_notifications ->> 'emailEnabled')::boolean,
      (v_notifications ->> 'newLabs')::boolean,
      (v_notifications ->> 'providerUpdates')::boolean,
      (v_notifications ->> 'simulationUpdates')::boolean,
      (v_notifications ->> 'securityUpdates')::boolean
    ) on conflict (user_id) do nothing;
    get diagnostics v_reads_imported = row_count;
    v_notifications_imported := v_reads_imported = 1;
    v_reads_imported := 0;
  end if;

  insert into public.user_notification_state (user_id, update_id)
  select v_user_id, update_id
  from (
    select (value #>> '{}')::uuid as update_id
    from pg_catalog.jsonb_array_elements(coalesce(p_payload -> 'readUpdateIds', '[]'::jsonb)) value
  ) requested
  where exists (
    select 1 from public.lab_updates update_record where update_record.id = requested.update_id
  )
  on conflict (user_id, update_id) do nothing;
  get diagnostics v_reads_imported = row_count;

  select greatest(0, 25 - pg_catalog.count(*))::integer
    into v_remaining_experiments
  from public.saved_experiments experiment
  where experiment.user_id = v_user_id;

  insert into public.saved_experiments (
    user_id, name, experiment_type, schema_version, configuration, result, created_at, updated_at
  )
  select
    v_user_id,
    item.value ->> 'name',
    item.value ->> 'experimentType',
    item.value ->> 'schemaVersion',
    item.value -> 'configuration',
    item.value -> 'result',
    (item.value ->> 'createdAt')::timestamptz,
    pg_catalog.clock_timestamp()
  from pg_catalog.jsonb_array_elements(coalesce(p_payload -> 'experiments', '[]'::jsonb))
    with ordinality item(value, position)
  where item.position <= least(12, v_remaining_experiments);
  get diagnostics v_experiments_imported = row_count;

  update private.guest_account_migrations
  set
    status = 'completed',
    payload_sha256 = pg_catalog.encode(extensions.digest(p_payload::text, 'sha256'), 'hex'),
    preferences_imported = v_preferences_imported,
    notification_preferences_imported = v_notifications_imported,
    notification_reads_imported = v_reads_imported,
    experiments_imported = v_experiments_imported,
    completed_at = pg_catalog.clock_timestamp()
  where guest_key_hash = p_guest_key_hash and user_id = v_user_id and status = 'claimed';

  return pg_catalog.jsonb_build_object(
    'status', 'migrated',
    'preferencesImported', v_preferences_imported,
    'notificationPreferencesImported', v_notifications_imported,
    'notificationReadsImported', v_reads_imported,
    'experimentsImported', v_experiments_imported
  );
end;
$$;

revoke all on function public.migrate_one_guest_state(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.migrate_one_guest_state(text, jsonb) to authenticated;

comment on function public.claim_one_guest_migration(text) is
  'Binds one opaque device guest state to the first authenticated human; derives ownership from auth.uid().';
comment on function public.migrate_one_guest_state(text, jsonb) is
  'Imports a bounded allowlist transactionally without overwriting existing account preference rows.';
