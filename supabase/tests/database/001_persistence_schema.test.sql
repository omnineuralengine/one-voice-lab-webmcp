begin;

select plan(35);

select ok(
  pg_catalog.to_regclass('private.viewer_event_daily_aggregates') is not null,
  'viewer daily aggregate table exists in the private schema'
);

select is(
  (
    select pg_catalog.count(*)::integer
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'viewer_event_daily_aggregates'
  ),
  6,
  'viewer daily aggregate has only its six bounded aggregate fields'
);

select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'viewer_event_daily_aggregates'
      and column_name in (
        'user_id', 'client_hash', 'session_hash', 'ip_address', 'device_id',
        'message', 'prompt', 'transcript', 'audio', 'request_id', 'credential'
      )
  ),
  'viewer daily aggregate contains no identity, feedback, prompt, transcript, audio, request, or credential field'
);

select ok(
  (
    select class.relrowsecurity
    from pg_catalog.pg_class class
    join pg_catalog.pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'private'
      and class.relname = 'viewer_event_daily_aggregates'
  ),
  'viewer daily aggregate has row-level security enabled as defense in depth'
);

select is(
  (
    select pg_catalog.pg_get_userbyid(class.relowner)
    from pg_catalog.pg_class class
    join pg_catalog.pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'private'
      and class.relname = 'viewer_event_daily_aggregates'
  ),
  'postgres',
  'viewer daily aggregate remains owner-maintained'
);

select ok(
  not pg_catalog.has_table_privilege('anon', 'private.viewer_event_daily_aggregates', 'SELECT')
    and not pg_catalog.has_table_privilege('anon', 'private.viewer_event_daily_aggregates', 'INSERT')
    and not pg_catalog.has_table_privilege('anon', 'private.viewer_event_daily_aggregates', 'UPDATE')
    and not pg_catalog.has_table_privilege('anon', 'private.viewer_event_daily_aggregates', 'DELETE'),
  'anon has no direct aggregate-table privileges'
);

select ok(
  not pg_catalog.has_table_privilege('authenticated', 'private.viewer_event_daily_aggregates', 'SELECT')
    and not pg_catalog.has_table_privilege('authenticated', 'private.viewer_event_daily_aggregates', 'INSERT')
    and not pg_catalog.has_table_privilege('authenticated', 'private.viewer_event_daily_aggregates', 'UPDATE')
    and not pg_catalog.has_table_privilege('authenticated', 'private.viewer_event_daily_aggregates', 'DELETE'),
  'authenticated has no direct aggregate-table privileges'
);

select ok(
  pg_catalog.to_regprocedure('private.prune_lab_access_history()') is not null,
  'the canonical lifecycle function exists'
);

select ok(
  (
    select procedure.prosecdef
    from pg_catalog.pg_proc procedure
    where procedure.oid = 'private.prune_lab_access_history()'::pg_catalog.regprocedure
  ),
  'the lifecycle function is security definer'
);

select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'private.prune_lab_access_history()',
    'EXECUTE'
  ),
  'anon cannot execute lifecycle maintenance'
);

select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'private.prune_lab_access_history()',
    'EXECUTE'
  ),
  'authenticated cannot execute lifecycle maintenance'
);

select ok(
  pg_catalog.has_function_privilege(
    'anon',
    'public.submit_feedback(text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'anon can call the guarded feedback RPC'
);

select ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.submit_feedback(text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'authenticated can call the guarded feedback RPC'
);

select throws_ok(
  $$ select public.submit_feedback('yay', null, 'tap', 'home', null, null) $$,
  '42501',
  'Invalid Lab server guard.',
  'feedback rejects a NULL server guard token'
);

select throws_ok(
  $$ select public.record_viewer_event('page_view', 'home', null, null) $$,
  '42501',
  'Invalid Lab server guard.',
  'viewer-event admission rejects a NULL server guard token'
);

select throws_ok(
  $$ select public.submit_feedback('yay', null, 'tap', 'home', null, repeat('f', 32)) $$,
  '42501',
  'Invalid Lab server guard.',
  'feedback rejects an incorrect non-NULL server guard token'
);

select throws_ok(
  $$ select public.record_viewer_event('page_view', 'home', null, repeat('f', 31)) $$,
  '42501',
  'Invalid Lab server guard.',
  'viewer-event admission rejects a short server guard token'
);

select ok(
  pg_catalog.lower(
    pg_catalog.pg_get_functiondef('private.prune_lab_access_history()'::pg_catalog.regprocedure)
  ) like '%v_batch_size constant integer := 5000%',
  'lifecycle maintenance declares a 5,000-row statement batch'
);

select ok(
  pg_catalog.lower(
    pg_catalog.pg_get_functiondef('private.prune_lab_access_history()'::pg_catalog.regprocedure)
  ) like '%for update skip locked%',
  'lifecycle source selection uses skip-locked row locking'
);

select ok(
  pg_catalog.lower(
    pg_catalog.pg_get_functiondef('private.prune_lab_access_history()'::pg_catalog.regprocedure)
  ) like '%v_max_batches constant integer := 4%',
  'lifecycle maintenance caps each path at four batches per invocation'
);

select ok(
  pg_catalog.to_regclass('public.viewer_events_retention_idx') is not null,
  'raw viewer-event retention has its source-order index'
);

select ok(
  pg_catalog.to_regclass('public.feedback_entries_retention_idx') is not null,
  'raw feedback retention has its source-order index'
);

select is(
  (
    select pg_catalog.count(*)::integer
    from cron.job
    where jobname = 'one-lab-access-history-retention'
  ),
  1,
  'exactly one canonical lifecycle cron job is scheduled'
);

select is(
  (
    select schedule
    from cron.job
    where jobname = 'one-lab-access-history-retention'
  ),
  '23 * * * *',
  'the canonical lifecycle job runs hourly at minute 23'
);

select ok(
  (
    select pg_catalog.lower(command) like '%private.prune_lab_access_history()%'
    from cron.job
    where jobname = 'one-lab-access-history-retention'
  ),
  'the lifecycle cron invokes the canonical cleanup function'
);

select ok(
  pg_catalog.lower(
    pg_catalog.pg_get_functiondef(
      'public.submit_feedback(text,text,text,text,text,text)'::pg_catalog.regprocedure
    )
  ) like '%one-feedback-admission:0-global%',
  'feedback admission takes the global transaction lock'
);

select ok(
  pg_catalog.lower(
    pg_catalog.pg_get_functiondef(
      'public.submit_feedback(text,text,text,text,text,text)'::pg_catalog.regprocedure
    )
  ) like '%one-feedback-admission:1-user:%',
  'authenticated feedback admission takes a user-scoped transaction lock'
);

select ok(
  pg_catalog.strpos(
    pg_catalog.lower(
      pg_catalog.pg_get_functiondef(
        'public.submit_feedback(text,text,text,text,text,text)'::pg_catalog.regprocedure
      )
    ),
    'one-feedback-admission:0-global'
  ) < pg_catalog.strpos(
    pg_catalog.lower(
      pg_catalog.pg_get_functiondef(
        'public.submit_feedback(text,text,text,text,text,text)'::pg_catalog.regprocedure
      )
    ),
    'one-feedback-admission:1-user:'
  ),
  'feedback lock order is globally consistent: global before user'
);

select ok(
  pg_catalog.strpos(
    pg_catalog.lower(
      pg_catalog.pg_get_functiondef(
        'public.submit_feedback(text,text,text,text,text,text)'::pg_catalog.regprocedure
      )
    ),
    'one-feedback-admission:1-user:'
  ) < pg_catalog.strpos(
    pg_catalog.lower(
      pg_catalog.pg_get_functiondef(
        'public.submit_feedback(text,text,text,text,text,text)'::pg_catalog.regprocedure
      )
    ),
    'v_now := pg_catalog.clock_timestamp()'
  ),
  'feedback captures its rolling-window timestamp only after serialization'
);

select ok(
  pg_catalog.lower(
    pg_catalog.pg_get_functiondef(
      'public.submit_feedback(text,text,text,text,text,text)'::pg_catalog.regprocedure
    )
  ) like '%feedback.created_at >= v_now - interval ''1 hour''%',
  'feedback limits use the post-lock authoritative rolling-hour timestamp'
);

select ok(
  pg_catalog.lower(
    pg_catalog.pg_get_functiondef(
      'public.record_viewer_event(text,text,text,text)'::pg_catalog.regprocedure
    )
  ) like '%one-viewer-event-admission:global%',
  'viewer-event admission takes a static global transaction lock'
);

select ok(
  pg_catalog.strpos(
    pg_catalog.lower(
      pg_catalog.pg_get_functiondef(
        'public.record_viewer_event(text,text,text,text)'::pg_catalog.regprocedure
      )
    ),
    'one-viewer-event-admission:global'
  ) < pg_catalog.strpos(
    pg_catalog.lower(
      pg_catalog.pg_get_functiondef(
        'public.record_viewer_event(text,text,text,text)'::pg_catalog.regprocedure
      )
    ),
    'v_now := pg_catalog.clock_timestamp()'
  ),
  'viewer-event admission captures its rolling-window timestamp after serialization'
);

select ok(
  pg_catalog.lower(
    pg_catalog.pg_get_functiondef(
      'public.record_viewer_event(text,text,text,text)'::pg_catalog.regprocedure
    )
  ) like '%event.occurred_at >= v_now - interval ''1 hour''%',
  'viewer-event admission counts the authoritative rolling-hour window'
);

select ok(
  pg_catalog.lower(
    pg_catalog.pg_get_functiondef(
      'public.record_viewer_event(text,text,text,text)'::pg_catalog.regprocedure
    )
  ) like '%values (p_event_name, p_surface, p_provider_id, v_now)%',
  'viewer-event insertion persists the same post-lock timestamp used for admission'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_proc procedure
    where procedure.oid = 'private.prune_lab_access_history()'::pg_catalog.regprocedure
      and exists (
        select 1
        from pg_catalog.unnest(procedure.proconfig) setting
        where setting like 'search_path=%'
      )
  ),
  'the lifecycle function pins its search path'
);

select * from finish();
rollback;
