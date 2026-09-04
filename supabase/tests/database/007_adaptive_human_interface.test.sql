begin;

select plan(9);

select has_column(
  'public', 'user_preferences', 'interface_depth',
  'user preferences include one bounded interface-depth value'
);

select col_default_is(
  'public', 'user_preferences', 'interface_depth', 'guided',
  'guided is the approachable default'
);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '70000000-0000-4000-8000-000000000001'::uuid,
    'authenticated', 'authenticated', 'user-a@example.invalid', '',
    '{}'::jsonb, '{}'::jsonb, pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
  ),
  (
    '70000000-0000-4000-8000-000000000002'::uuid,
    'authenticated', 'authenticated', 'user-b@example.invalid', '',
    '{}'::jsonb, '{}'::jsonb, pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
  );

insert into public.user_preferences (user_id, interface_depth)
values ('70000000-0000-4000-8000-000000000001'::uuid, 'technical');

select is(
  (select interface_depth from public.user_preferences where user_id = '70000000-0000-4000-8000-000000000001'),
  'technical',
  'an explicit technical preference is stored without changing any authority'
);

select throws_ok(
  $$insert into public.user_preferences (user_id, interface_depth) values ('70000000-0000-4000-8000-000000000002', 'expert')$$,
  '23514',
  null,
  'persona labels outside the bounded presentation vocabulary are rejected'
);

select pg_catalog.set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000002', true);
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"auth-b","aal":"aal1"}',
  true
);
set local role authenticated;

select is(
  (select pg_catalog.count(*)::integer from public.user_preferences where user_id = '70000000-0000-4000-8000-000000000001'),
  0,
  'USER_B cannot read USER_A interface preferences'
);

update public.user_preferences
set interface_depth = 'essential'
where user_id = '70000000-0000-4000-8000-000000000001';

reset role;

select is(
  (select interface_depth from public.user_preferences where user_id = '70000000-0000-4000-8000-000000000001'),
  'technical',
  'USER_B cannot mutate USER_A interface preferences'
);

select ok(
  (
    select class.relrowsecurity
    from pg_catalog.pg_class class
    join pg_catalog.pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public' and class.relname = 'user_preferences'
  ),
  'interface preferences retain row-level security'
);

select ok(
  pg_catalog.has_table_privilege('authenticated', 'public.user_preferences', 'SELECT,INSERT,UPDATE,DELETE'),
  'authenticated access remains mediated by the existing owner policies'
);

select ok(
  not pg_catalog.has_table_privilege('anon', 'public.user_preferences', 'SELECT,INSERT,UPDATE,DELETE'),
  'anonymous callers cannot access account-owned interface preferences'
);

select * from finish();

rollback;
