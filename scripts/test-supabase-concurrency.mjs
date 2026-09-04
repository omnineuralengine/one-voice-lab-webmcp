import { spawn } from "node:child_process";

const ALLOW_DISPOSABLE_TESTS = "1";
const EXPECTED_CONTAINER = "supabase_db_one-voice-lab-db-tests";
const TEST_USER_ID = "61f32056-51c8-4bb8-a08d-d158d25b37a0";
const TEST_INSTANCE_ID = "00000000-0000-0000-0000-000000000000";
const TEST_GUARD = "one-voice-lab-disposable-feedback-guard";
const BENCHMARK_IDS = Object.freeze({
  methodology: "db-concurrency-benchmark",
  suite: "71000000-0000-4000-8000-000000000001",
  benchmarkCase: "71000000-0000-4000-8000-000000000002",
  run: "71000000-0000-4000-8000-000000000003",
  evaluation: "71000000-0000-4000-8000-000000000004",
  externalRun: "71000000-0000-4000-8000-000000000005",
  idempotency: "71000000-0000-4000-8000-000000000006",
  outputA: "71000000-0000-4000-8000-000000000007",
  outputB: "71000000-0000-4000-8000-000000000008",
  outputC: "71000000-0000-4000-8000-000000000009",
});
const ORIGINAL_GUARD_DIGEST =
  "7b2d9eb8ba9ae8f40e2740bf4f25b8337d6e84b5654bfc2a1c97ca52354ff2e8";
const TEST_HASHES = Object.freeze({
  providerClientA: "a".repeat(64),
  providerClientB: "b".repeat(64),
  providerSessionA: "c".repeat(64),
  providerSessionB: "d".repeat(64),
  globalClientA: "e".repeat(64),
  globalClientB: "f".repeat(64),
  globalSessionA: "1".repeat(64),
  globalSessionB: "2".repeat(64),
});
const MAX_CAPTURED_BYTES = 128 * 1024;

if (process.env.ONE_ALLOW_DISPOSABLE_DB_TESTS !== ALLOW_DISPOSABLE_TESTS) {
  throw new Error(
    "Refusing to run: set ONE_ALLOW_DISPOSABLE_DB_TESTS=1 for a disposable local database.",
  );
}

const containerName = process.env.SUPABASE_DB_CONTAINER?.trim();
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();

if (containerName && containerName !== EXPECTED_CONTAINER) {
  throw new Error(
    `Refusing Docker target ${JSON.stringify(containerName)}; expected the repository's disposable database container.`,
  );
}

if (!containerName && !databaseUrl) {
  throw new Error(
    "Refusing to run without SUPABASE_DB_CONTAINER or a loopback TEST_DATABASE_URL.",
  );
}

if (databaseUrl) {
  const parsedDatabaseUrl = new URL(databaseUrl);
  const isLoopback = ["127.0.0.1", "localhost", "::1"].includes(
    parsedDatabaseUrl.hostname,
  );
  const port = parsedDatabaseUrl.port || "5432";
  if (
    !["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol) ||
    !isLoopback ||
    port !== "54322" ||
    parsedDatabaseUrl.pathname !== "/postgres"
  ) {
    throw new Error(
      "Refusing TEST_DATABASE_URL: only the local Supabase database at loopback:54322/postgres is allowed.",
    );
  }
}

function redact(value) {
  let sanitized = String(value || "");
  if (databaseUrl) sanitized = sanitized.replaceAll(databaseUrl, "[local-database-url]");
  sanitized = sanitized.replaceAll(TEST_GUARD, "[test-guard]");
  sanitized = sanitized.replace(
    /postgres(?:ql)?:\/\/[^\s@]+@/giu,
    "postgresql://[redacted]@",
  );
  return sanitized.slice(-4000);
}

function psqlCommand() {
  const commonArguments = [
    "-X",
    "--no-psqlrc",
    "--set=ON_ERROR_STOP=1",
    "--set=VERBOSITY=verbose",
    "--tuples-only",
    "--no-align",
    "--quiet",
  ];

  if (containerName) {
    return {
      command: "docker",
      arguments: [
        "exec",
        "-i",
        containerName,
        "psql",
        "--username",
        "postgres",
        "--dbname",
        "postgres",
        ...commonArguments,
      ],
    };
  }

  return {
    command: "psql",
    arguments: ["--dbname", databaseUrl, ...commonArguments],
  };
}

function executeSql(sql) {
  const { command, arguments: commandArguments } = psqlCommand();

  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArguments, {
      env: process.env,
      shell: false,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let outputExceeded = false;

    const capture = (current, chunk) => {
      const next = current + chunk.toString("utf8");
      if (Buffer.byteLength(next, "utf8") > MAX_CAPTURED_BYTES) {
        outputExceeded = true;
        child.kill("SIGTERM");
        return next.slice(-MAX_CAPTURED_BYTES);
      }
      return next;
    };

    child.stdout.on("data", (chunk) => {
      stdout = capture(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = capture(stderr, chunk);
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      resolve({
        code: code ?? 1,
        signal,
        stdout,
        stderr,
        outputExceeded,
      });
    });

    child.stdin.end(sql, "utf8");
  });
}

async function runRequiredSql(label, sql) {
  const result = await executeSql(sql);
  if (result.code !== 0 || result.outputExceeded) {
    throw new Error(
      `${label} failed (exit ${result.code}${result.signal ? `, signal ${result.signal}` : ""}): ${redact(result.stderr || result.stdout)}`,
    );
  }
  return result.stdout.trim();
}

function barrierSql() {
  return `
    drop trigger if exists db_test_feedback_barrier on public.feedback_entries;
    drop function if exists private.db_test_feedback_barrier();
    drop sequence if exists private.db_test_feedback_barrier_seq;

    create sequence private.db_test_feedback_barrier_seq minvalue 1 start 1;

    create function private.db_test_feedback_barrier()
    returns trigger
    language plpgsql
    security definer
    set search_path = ''
    as $$
    declare
      v_ticket bigint;
      v_deadline timestamptz := pg_catalog.clock_timestamp() + interval '3 seconds';
    begin
      v_ticket := pg_catalog.nextval(
        'private.db_test_feedback_barrier_seq'::pg_catalog.regclass
      );
      if v_ticket = 1 then
        loop
          exit when (
            select sequence.last_value
            from private.db_test_feedback_barrier_seq sequence
          ) >= 2;
          exit when pg_catalog.clock_timestamp() >= v_deadline;
          perform pg_catalog.pg_sleep(0.025);
        end loop;
      end if;
      return new;
    end;
    $$;

    alter function private.db_test_feedback_barrier() owner to postgres;
    revoke all on function private.db_test_feedback_barrier() from public, anon, authenticated;

    create trigger db_test_feedback_barrier
      before insert on public.feedback_entries
      for each row execute function private.db_test_feedback_barrier();
  `;
}

function savedExperimentBarrierSql() {
  return `
    drop trigger if exists zz_db_test_saved_experiment_barrier on public.saved_experiments;
    drop function if exists private.db_test_saved_experiment_barrier();
    drop sequence if exists private.db_test_saved_experiment_barrier_seq;

    create sequence private.db_test_saved_experiment_barrier_seq minvalue 1 start 1;

    create function private.db_test_saved_experiment_barrier()
    returns trigger
    language plpgsql
    security definer
    set search_path = ''
    as $$
    declare
      v_ticket bigint;
      v_deadline timestamptz := pg_catalog.clock_timestamp() + interval '3 seconds';
    begin
      v_ticket := pg_catalog.nextval(
        'private.db_test_saved_experiment_barrier_seq'::pg_catalog.regclass
      );
      if v_ticket = 1 then
        loop
          exit when (
            select barrier.last_value
            from private.db_test_saved_experiment_barrier_seq barrier
          ) >= 2;
          exit when pg_catalog.clock_timestamp() >= v_deadline;
          perform pg_catalog.pg_sleep(0.025);
        end loop;
      end if;
      return new;
    end;
    $$;

    alter function private.db_test_saved_experiment_barrier() owner to postgres;
    revoke all on function private.db_test_saved_experiment_barrier()
      from public, anon, authenticated;

    -- PostgreSQL runs same-kind triggers in name order. This test barrier's
    -- zz_ prefix deliberately places it after saved_experiments_trust_quota,
    -- so it widens only the count-to-insert race the real trigger must close.
    create trigger zz_db_test_saved_experiment_barrier
      before insert on public.saved_experiments
      for each row execute function private.db_test_saved_experiment_barrier();
  `;
}

function guestMigrationBarrierSql() {
  return `
    drop trigger if exists db_test_guest_migration_barrier on private.guest_account_migrations;
    drop function if exists private.db_test_guest_migration_barrier();
    drop sequence if exists private.db_test_guest_migration_barrier_seq;

    create sequence private.db_test_guest_migration_barrier_seq minvalue 1 start 1;

    create function private.db_test_guest_migration_barrier()
    returns trigger
    language plpgsql
    security definer
    set search_path = ''
    as $$
    declare
      v_ticket bigint;
      v_deadline timestamptz := pg_catalog.clock_timestamp() + interval '3 seconds';
    begin
      v_ticket := pg_catalog.nextval(
        'private.db_test_guest_migration_barrier_seq'::pg_catalog.regclass
      );
      if v_ticket = 1 then
        loop
          exit when (
            select barrier.last_value
            from private.db_test_guest_migration_barrier_seq barrier
          ) >= 2;
          exit when pg_catalog.clock_timestamp() >= v_deadline;
          perform pg_catalog.pg_sleep(0.025);
        end loop;
      end if;
      return new;
    end;
    $$;

    alter function private.db_test_guest_migration_barrier() owner to postgres;
    revoke all on function private.db_test_guest_migration_barrier()
      from public, anon, authenticated;

    create trigger db_test_guest_migration_barrier
      before insert on private.guest_account_migrations
      for each row execute function private.db_test_guest_migration_barrier();
  `;
}

function usageCounterBarrierSql() {
  return `
    drop trigger if exists db_test_usage_counter_barrier on private.lab_usage_counters;
    drop function if exists private.db_test_usage_counter_barrier();
    drop sequence if exists private.db_test_usage_counter_barrier_seq;

    create sequence private.db_test_usage_counter_barrier_seq minvalue 1 start 1;

    create function private.db_test_usage_counter_barrier()
    returns trigger
    language plpgsql
    security definer
    set search_path = ''
    as $$
    declare
      v_ticket bigint;
      v_deadline timestamptz := pg_catalog.clock_timestamp() + interval '3 seconds';
    begin
      v_ticket := pg_catalog.nextval(
        'private.db_test_usage_counter_barrier_seq'::pg_catalog.regclass
      );
      if v_ticket = 1 then
        loop
          exit when (
            select barrier.last_value
            from private.db_test_usage_counter_barrier_seq barrier
          ) >= 2;
          exit when pg_catalog.clock_timestamp() >= v_deadline;
          perform pg_catalog.pg_sleep(0.025);
        end loop;
      end if;
      return new;
    end;
    $$;

    alter function private.db_test_usage_counter_barrier() owner to postgres;
    revoke all on function private.db_test_usage_counter_barrier()
      from public, anon, authenticated;

    -- acquire_lab_access reaches this table only after every quota/budget
    -- precheck. The disposable trigger therefore widens the real
    -- precheck-to-counter-write race without changing production code.
    create trigger db_test_usage_counter_barrier
      before insert on private.lab_usage_counters
      for each row execute function private.db_test_usage_counter_barrier();
  `;
}

function authenticatedFeedbackSql(message) {
  return `
    begin;
    set local statement_timeout = '12s';
    set local role authenticated;
    select pg_catalog.set_config('request.jwt.claim.sub', '${TEST_USER_ID}', true);
    select public.submit_feedback(
      'yay',
      '${message}',
      'typed',
      'other',
      null,
      '${TEST_GUARD}'
    );
    commit;
  `;
}

function anonymousFeedbackSql(message) {
  return `
    begin;
    set local statement_timeout = '12s';
    set local role anon;
    select public.submit_feedback(
      'yay',
      '${message}',
      'tap',
      'other',
      null,
      '${TEST_GUARD}'
    );
    commit;
  `;
}

function savedExperimentInsertSql(name) {
  return `
    begin;
    set local statement_timeout = '12s';
    set local role authenticated;
    select pg_catalog.set_config('request.jwt.claim.sub', '${TEST_USER_ID}', true);
    insert into public.saved_experiments (
      user_id,
      name,
      experiment_type,
      schema_version,
      configuration,
      result
    ) values (
      '${TEST_USER_ID}'::uuid,
      '${name}',
      'simulation',
      'one-simulation-experiment-v1',
      '{}'::jsonb,
      null
    );
    commit;
  `;
}

function guestMigrationClaimSql(hash) {
  return `
    begin;
    set local statement_timeout = '12s';
    set local role authenticated;
    select pg_catalog.set_config('request.jwt.claim.sub', '${TEST_USER_ID}', true);
    select public.claim_one_guest_migration('${hash}') ->> 'status';
    commit;
  `;
}

function benchmarkOutputInsertSql(id) {
  return `
    begin;
    set local statement_timeout = '12s';
    insert into private.benchmark_run_outputs (
      id,
      run_id,
      provider_id,
      provider_display_name,
      provider_readiness,
      model_id,
      model_version,
      voice_id,
      configuration_hash,
      output_modality,
      capability,
      transport,
      codec,
      status
    ) values (
      '${id}'::uuid,
      '${BENCHMARK_IDS.run}'::uuid,
      'deepgram',
      'Deepgram',
      'adapter-backed',
      'deterministic-model-a',
      'fixture/1.0.0',
      'deterministic-voice-a',
      'sha256:${"a".repeat(64)}',
      'audio',
      'tts',
      'fixture',
      'pcm16',
      'complete'
    );
    commit;
  `;
}

function benchmarkPreferenceInsertSql(id, outputId) {
  return `
    begin;
    set local statement_timeout = '12s';
    insert into private.benchmark_judgments (
      id,
      run_id,
      output_id,
      judgment_kind,
      rater_user_id,
      dimension,
      judgment_version,
      preference_selected,
      blind_state,
      rated_before_reveal,
      provenance
    ) values (
      '${id}'::uuid,
      '${BENCHMARK_IDS.run}'::uuid,
      '${outputId}'::uuid,
      'human',
      '${TEST_USER_ID}'::uuid,
      'overall_preference',
      'human-rating/1.0.0',
      true,
      'blind',
      true,
      '{"source":"db-concurrency"}'::jsonb
    );
    commit;
  `;
}

function assertOneUniqueViolation(results, constraintName, label) {
  const successes = results.filter((result) => result.code === 0);
  const failures = results.filter((result) => result.code !== 0);
  if (successes.length !== 1 || failures.length !== 1) {
    throw new Error(
      `${label}: expected one insert and one unique rejection; received ${successes.length} insert(s) and ${failures.length} rejection(s).`,
    );
  }
  if (failures[0].outputExceeded) {
    throw new Error(`${label}: unique-rejection output exceeded the safety bound.`);
  }
  const failureText = `${failures[0].stdout}\n${failures[0].stderr}`;
  if (!failureText.includes("23505") || !failureText.includes(constraintName)) {
    throw new Error(
      `${label}: expected 23505 from ${constraintName}; received ${redact(failureText)}`,
    );
  }
}

function accessAcquisitionSql({ operation, providerId, clientHash, sessionHash }) {
  const providerSql = providerId ? `'${providerId}'` : "null";
  return `
    begin;
    set local statement_timeout = '12s';
    set local role authenticated;
    select pg_catalog.set_config('request.jwt.claim.sub', '${TEST_USER_ID}', true);
    select access.allowed::text || '|' || access.reason
    from public.acquire_lab_access(
      '${operation}',
      ${providerSql},
      'db-concurrency',
      '${clientHash}',
      '${sessionHash}',
      1,
      'verified',
      'human',
      false,
      false,
      '${TEST_GUARD}'
    ) access;
    commit;
  `;
}

function accessOutcome(output) {
  const outcomes = output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => /^(?:true|false)\|[a-z_]+$/u.test(line));
  return outcomes.at(-1) || "";
}

function assertAccessRace(results, expectedDenial, label) {
  for (const result of results) {
    if (result.code !== 0 || result.outputExceeded) {
      throw new Error(
        `${label}: acquisition session failed unexpectedly: ${redact(result.stderr || result.stdout)}`,
      );
    }
  }
  const outcomes = results.map((result) => accessOutcome(result.stdout)).sort();
  const expected = [`false|${expectedDenial}`, "true|allowed"].sort();
  if (outcomes.join("\n") !== expected.join("\n")) {
    throw new Error(
      `${label}: expected one allowed and one ${expectedDenial} result; received ${outcomes.join(", ")}.`,
    );
  }
}

function assertOneAdmission(results, expectedDenial, label) {
  const successes = results.filter((result) => result.code === 0);
  const failures = results.filter((result) => result.code !== 0);
  if (successes.length !== 1 || failures.length !== 1) {
    throw new Error(
      `${label}: expected one admission and one denial; received ${successes.length} admission(s) and ${failures.length} denial(s).`,
    );
  }
  if (failures[0].outputExceeded) {
    throw new Error(`${label}: denial output exceeded the safety bound.`);
  }
  const failureText = `${failures[0].stdout}\n${failures[0].stderr}`;
  if (!failureText.includes("P0001") || !failureText.includes(expectedDenial)) {
    throw new Error(
      `${label}: expected stable P0001 ${expectedDenial}; received ${redact(failureText)}`,
    );
  }
}

async function prepareDatabase() {
  await runRequiredSql(
    "Concurrency test setup",
    `
      set statement_timeout = '15s';
      update private.lab_runtime_config
      set token_sha256 = pg_catalog.encode(
        extensions.digest('${TEST_GUARD}', 'sha256'),
        'hex'
      ), updated_at = pg_catalog.clock_timestamp()
      where config_key = 'usage_guard';

      do $$
      begin
        if not exists (
          select 1
          from private.lab_runtime_config config
          where config.config_key = 'usage_guard'
            and config.token_sha256 = pg_catalog.encode(
              extensions.digest('${TEST_GUARD}', 'sha256'),
              'hex'
            )
        ) then
          raise exception 'Missing usage_guard runtime configuration.';
        end if;
      end;
      $$;

      drop trigger if exists db_test_feedback_barrier on public.feedback_entries;
      drop function if exists private.db_test_feedback_barrier();
      drop sequence if exists private.db_test_feedback_barrier_seq;
      drop trigger if exists zz_db_test_saved_experiment_barrier on public.saved_experiments;
      drop function if exists private.db_test_saved_experiment_barrier();
      drop sequence if exists private.db_test_saved_experiment_barrier_seq;
      drop trigger if exists db_test_usage_counter_barrier on private.lab_usage_counters;
      drop function if exists private.db_test_usage_counter_barrier();
      drop sequence if exists private.db_test_usage_counter_barrier_seq;
      drop trigger if exists db_test_guest_migration_barrier on private.guest_account_migrations;
      drop function if exists private.db_test_guest_migration_barrier();
      drop sequence if exists private.db_test_guest_migration_barrier_seq;

      truncate table public.feedback_entries;
      delete from public.saved_experiments where user_id = '${TEST_USER_ID}'::uuid;
      truncate table
        private.lab_usage_counters,
        private.lab_concurrency_leases,
        private.lab_access_audit,
        private.lab_access_denial_rollups;
      delete from private.benchmark_judgments
      where run_id = '${BENCHMARK_IDS.run}'::uuid;
      delete from private.benchmark_run_outputs
      where run_id = '${BENCHMARK_IDS.run}'::uuid;
      delete from private.benchmark_runs
      where id = '${BENCHMARK_IDS.run}'::uuid;
      delete from private.benchmark_cases
      where id = '${BENCHMARK_IDS.benchmarkCase}'::uuid;
      delete from private.benchmark_suites
      where id = '${BENCHMARK_IDS.suite}'::uuid;
      delete from private.benchmark_methodologies
      where methodology_id = '${BENCHMARK_IDS.methodology}';
      delete from auth.users where id = '${TEST_USER_ID}';
      insert into auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
      ) values (
        '${TEST_INSTANCE_ID}',
        '${TEST_USER_ID}',
        'authenticated',
        'authenticated',
        'feedback-concurrency@one.invalid',
        '',
        pg_catalog.clock_timestamp(),
        '{}'::jsonb,
        '{}'::jsonb,
        pg_catalog.clock_timestamp(),
        pg_catalog.clock_timestamp()
      );
    `,
  );

  await runRequiredSql(
    "Benchmark concurrency fixture setup",
    `
      set statement_timeout = '15s';
      insert into private.benchmark_methodologies (
        methodology_id, version, name, description, definition, content_hash
      ) values (
        '${BENCHMARK_IDS.methodology}',
        '1.0.0',
        'Disposable concurrency methodology',
        'Local-only deterministic concurrency fixture.',
        '{}'::jsonb,
        private.benchmark_jsonb_sha256('{}'::jsonb)
      );
      insert into private.benchmark_suites (
        id, suite_key, version, methodology_id, methodology_version,
        benchmark_category, owner_user_id, name, description,
        language, domain, dataset_version, dataset_license,
        provenance_reference, input_manifest_hash, expected_output_kind,
        content_hash
      ) values (
        '${BENCHMARK_IDS.suite}'::uuid,
        'db-concurrency-suite',
        '1.0.0',
        '${BENCHMARK_IDS.methodology}',
        '1.0.0',
        'tts',
        '${TEST_USER_ID}'::uuid,
        'Disposable concurrency suite',
        'Local-only deterministic concurrency fixture.',
        'en',
        'concurrency',
        '1.0.0',
        'CC0-1.0',
        'fixture:db-concurrency',
        'sha256:${"2".repeat(63)}0',
        'audio',
        'sha256:${"2".repeat(64)}'
      );
      insert into private.benchmark_cases (
        id, suite_id, case_key, version, benchmark_category, input_type,
        exact_input_text, input_hash, language, domain
      ) values (
        '${BENCHMARK_IDS.benchmarkCase}'::uuid,
        '${BENCHMARK_IDS.suite}'::uuid,
        'db-concurrency-case',
        '1.0.0',
        'tts',
        'text',
        'Deterministic concurrency fixture.',
        private.benchmark_text_sha256('Deterministic concurrency fixture.'),
        'en',
        'concurrency'
      );
      insert into private.benchmark_runs (
        id, evaluation_id, run_id, owner_user_id, case_id, idempotency_key,
        bundle_hash, schema_version, methodology_version, metric_version,
        benchmark_category, evaluation_mode, execution_mode, environment,
        deployment, status, input_hash
      ) values (
        '${BENCHMARK_IDS.run}'::uuid,
        '${BENCHMARK_IDS.evaluation}'::uuid,
        '${BENCHMARK_IDS.externalRun}'::uuid,
        '${TEST_USER_ID}'::uuid,
        '${BENCHMARK_IDS.benchmarkCase}'::uuid,
        '${BENCHMARK_IDS.idempotency}'::uuid,
        'sha256:${"4".repeat(64)}',
        'one-voice-evidence/1.0.0',
        '1.0.0',
        'one-tts-metrics/1.0.0',
        'tts',
        'standardized',
        'fixture',
        'db-concurrency',
        'local-test-fixture',
        'complete',
        private.benchmark_text_sha256('Deterministic concurrency fixture.')
      );
    `,
  );
}

async function testAuthenticatedUserLimit() {
  await runRequiredSql(
    "Authenticated feedback boundary setup",
    `
      set statement_timeout = '15s';
      truncate table public.feedback_entries;
      insert into public.feedback_entries (
        user_id,
        sentiment,
        message,
        input_method,
        surface,
        provider_id,
        created_at
      )
      select
        '${TEST_USER_ID}'::uuid,
        'yay',
        'db-concurrency-user-seed-' || series.value,
        'typed',
        'other',
        null,
        pg_catalog.clock_timestamp()
      from pg_catalog.generate_series(1, 19) as series(value);
      ${barrierSql()}
    `,
  );

  const results = await Promise.all([
    executeSql(authenticatedFeedbackSql("db-concurrency-user-attempt-a")),
    executeSql(authenticatedFeedbackSql("db-concurrency-user-attempt-b")),
  ]);
  assertOneAdmission(results, "feedback_user_limit", "Authenticated quota race");

  const count = await runRequiredSql(
    "Authenticated feedback count",
    `
      select pg_catalog.count(*)
      from public.feedback_entries
      where user_id = '${TEST_USER_ID}'::uuid;
    `,
  );
  if (count !== "20") {
    throw new Error(`Authenticated quota race: expected 20 durable rows, received ${count}.`);
  }
  console.log("Authenticated feedback quota concurrency: PASS");
}

async function testGlobalLimit() {
  await runRequiredSql(
    "Global feedback boundary setup",
    `
      set statement_timeout = '15s';
      drop trigger if exists db_test_feedback_barrier on public.feedback_entries;
      drop function if exists private.db_test_feedback_barrier();
      drop sequence if exists private.db_test_feedback_barrier_seq;
      truncate table public.feedback_entries;
      insert into public.feedback_entries (
        user_id,
        sentiment,
        message,
        input_method,
        surface,
        provider_id,
        created_at
      )
      select
        null,
        'yay',
        null,
        'tap',
        'other',
        null,
        pg_catalog.clock_timestamp()
      from pg_catalog.generate_series(1, 299);
      ${barrierSql()}
    `,
  );

  const results = await Promise.all([
    executeSql(anonymousFeedbackSql("db-concurrency-global-attempt-a")),
    executeSql(anonymousFeedbackSql("db-concurrency-global-attempt-b")),
  ]);
  assertOneAdmission(results, "feedback_global_limit", "Global quota race");

  const count = await runRequiredSql(
    "Global feedback count",
    "select pg_catalog.count(*) from public.feedback_entries;",
  );
  if (count !== "300") {
    throw new Error(`Global quota race: expected 300 durable rows, received ${count}.`);
  }
  console.log("Global feedback quota concurrency: PASS");
}

async function testSavedExperimentLimit() {
  await runRequiredSql(
    "Saved experiment boundary setup",
    `
      set statement_timeout = '20s';
      drop trigger if exists zz_db_test_saved_experiment_barrier on public.saved_experiments;
      drop function if exists private.db_test_saved_experiment_barrier();
      drop sequence if exists private.db_test_saved_experiment_barrier_seq;
      delete from public.saved_experiments where user_id = '${TEST_USER_ID}'::uuid;
      select pg_catalog.set_config('request.jwt.claim.sub', '${TEST_USER_ID}', false);
      do $$
      declare
        v_index integer;
      begin
        for v_index in 1..24 loop
          insert into public.saved_experiments (
            user_id,
            name,
            experiment_type,
            schema_version,
            configuration,
            result
          ) values (
            '${TEST_USER_ID}'::uuid,
            'db-concurrency-saved-seed-' || v_index,
            'simulation',
            'one-simulation-experiment-v1',
            '{}'::jsonb,
            null
          );
        end loop;
      end;
      $$;
      ${savedExperimentBarrierSql()}
    `,
  );

  const results = await Promise.all([
    executeSql(savedExperimentInsertSql("db-concurrency-saved-attempt-a")),
    executeSql(savedExperimentInsertSql("db-concurrency-saved-attempt-b")),
  ]);
  assertOneAdmission(
    results,
    "Saved experiment allowance reached.",
    "Saved experiment quota race",
  );

  const count = await runRequiredSql(
    "Saved experiment count",
    `
      select pg_catalog.count(*)
      from public.saved_experiments
      where user_id = '${TEST_USER_ID}'::uuid;
    `,
  );
  if (count !== "25") {
    throw new Error(`Saved experiment quota race: expected 25 durable rows, received ${count}.`);
  }
  console.log("Saved experiment quota concurrency: PASS");
}

async function testGuestMigrationClaimLimit() {
  await runRequiredSql(
    "Guest migration claim boundary setup",
    `
      set statement_timeout = '20s';
      drop trigger if exists db_test_guest_migration_barrier on private.guest_account_migrations;
      drop function if exists private.db_test_guest_migration_barrier();
      drop sequence if exists private.db_test_guest_migration_barrier_seq;
      delete from private.guest_account_migrations where user_id = '${TEST_USER_ID}'::uuid;
      insert into private.guest_account_migrations (guest_key_hash, user_id)
      select
        pg_catalog.encode(extensions.digest('guest-claim-seed-' || seed.value, 'sha256'), 'hex'),
        '${TEST_USER_ID}'::uuid
      from pg_catalog.generate_series(1, 15) seed(value);
      ${guestMigrationBarrierSql()}
    `,
  );

  const results = await Promise.all([
    executeSql(guestMigrationClaimSql("3".repeat(64))),
    executeSql(guestMigrationClaimSql("4".repeat(64))),
  ]);
  for (const result of results) {
    if (result.code !== 0 || result.outputExceeded) {
      throw new Error(`Guest migration claim race failed unexpectedly: ${redact(result.stderr || result.stdout)}`);
    }
  }
  const outcomes = results
    .map((result) => result.stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).at(-1))
    .sort();
  if (outcomes.join("|") !== ["claimed", "migration-limit-reached"].sort().join("|")) {
    throw new Error(`Guest migration claim race exceeded or underused the bounded allowance (${outcomes.join(", ")}).`);
  }

  const count = await runRequiredSql(
    "Guest migration claim count",
    `select pg_catalog.count(*) from private.guest_account_migrations where user_id = '${TEST_USER_ID}'::uuid;`,
  );
  if (count !== "16") {
    throw new Error(`Guest migration claim race: expected 16 durable claims, received ${count}.`);
  }
  console.log("Guest migration claim concurrency: PASS");
}

async function testProviderBudgetLimit() {
  await runRequiredSql(
    "Provider budget boundary setup",
    `
      set statement_timeout = '15s';
      drop trigger if exists db_test_usage_counter_barrier on private.lab_usage_counters;
      drop function if exists private.db_test_usage_counter_barrier();
      drop sequence if exists private.db_test_usage_counter_barrier_seq;
      truncate table
        private.lab_usage_counters,
        private.lab_concurrency_leases,
        private.lab_access_audit,
        private.lab_access_denial_rollups;
      update private.lab_provider_budgets
      set
        enabled = true,
        daily_units = 1,
        monthly_units = 1,
        concurrency_limit = 8,
        updated_at = pg_catalog.clock_timestamp()
      where provider_id = 'deepgram'
        and operation = 'speech_generation';
      ${usageCounterBarrierSql()}
    `,
  );

  const results = await Promise.all([
    executeSql(
      accessAcquisitionSql({
        operation: "speech_generation",
        providerId: "deepgram",
        clientHash: TEST_HASHES.providerClientA,
        sessionHash: TEST_HASHES.providerSessionA,
      }),
    ),
    executeSql(
      accessAcquisitionSql({
        operation: "speech_generation",
        providerId: "deepgram",
        clientHash: TEST_HASHES.providerClientB,
        sessionHash: TEST_HASHES.providerSessionB,
      }),
    ),
  ]);
  assertAccessRace(results, "provider_budget", "Provider budget race");

  const counters = await runRequiredSql(
    "Provider budget counters",
    `
      select
        pg_catalog.count(*)::text || '|' ||
        coalesce(pg_catalog.sum(counter.used_units), 0)::text || '|' ||
        coalesce(
          pg_catalog.max(counter.used_units) filter (where counter.scope_kind = 'provider_day'),
          0
        )::text || '|' ||
        coalesce(
          pg_catalog.max(counter.used_units) filter (where counter.scope_kind = 'provider_month'),
          0
        )::text
      from private.lab_usage_counters counter
      where counter.scope_kind in ('provider_day', 'provider_month')
        and counter.scope_id = 'deepgram'
        and counter.operation = 'speech_generation'
        and counter.provider_id = 'deepgram';
    `,
  );
  if (counters !== "2|2|1|1") {
    throw new Error(`Provider budget race: counters were overspent or incomplete (${counters}).`);
  }
  console.log("Provider budget concurrency: PASS");
}

async function testGlobalAccessLimit() {
  await runRequiredSql(
    "Global access boundary setup",
    `
      set statement_timeout = '15s';
      drop trigger if exists db_test_usage_counter_barrier on private.lab_usage_counters;
      drop function if exists private.db_test_usage_counter_barrier();
      drop sequence if exists private.db_test_usage_counter_barrier_seq;
      truncate table
        private.lab_usage_counters,
        private.lab_concurrency_leases,
        private.lab_access_audit,
        private.lab_access_denial_rollups;
      update private.lab_access_policies
      set
        global_daily_units = 1,
        global_monthly_units = 1,
        updated_at = pg_catalog.clock_timestamp()
      where tier = 'verified'
        and operation = 'provider_catalog'
        and provider_id = '*'
        and endpoint_id = '*';
      ${usageCounterBarrierSql()}
    `,
  );

  const results = await Promise.all([
    executeSql(
      accessAcquisitionSql({
        operation: "provider_catalog",
        providerId: null,
        clientHash: TEST_HASHES.globalClientA,
        sessionHash: TEST_HASHES.globalSessionA,
      }),
    ),
    executeSql(
      accessAcquisitionSql({
        operation: "provider_catalog",
        providerId: null,
        clientHash: TEST_HASHES.globalClientB,
        sessionHash: TEST_HASHES.globalSessionB,
      }),
    ),
  ]);
  assertAccessRace(results, "global_limit", "Global access quota race");

  const counters = await runRequiredSql(
    "Global access counters",
    `
      select
        pg_catalog.count(*)::text || '|' ||
        coalesce(pg_catalog.sum(counter.used_units), 0)::text || '|' ||
        coalesce(
          pg_catalog.max(counter.used_units) filter (where counter.scope_kind = 'global_day'),
          0
        )::text || '|' ||
        coalesce(
          pg_catalog.max(counter.used_units) filter (where counter.scope_kind = 'global_month'),
          0
        )::text
      from private.lab_usage_counters counter
      where counter.scope_kind in ('global_day', 'global_month')
        and counter.scope_id = 'global'
        and counter.operation = 'provider_catalog';
    `,
  );
  if (counters !== "2|2|1|1") {
    throw new Error(`Global access quota race: counters were overspent or incomplete (${counters}).`);
  }
  console.log("Global access quota concurrency: PASS");
}

async function testBenchmarkUniqueness() {
  const outputResults = await Promise.all([
    executeSql(benchmarkOutputInsertSql(BENCHMARK_IDS.outputA)),
    executeSql(benchmarkOutputInsertSql(BENCHMARK_IDS.outputB)),
  ]);
  assertOneUniqueViolation(
    outputResults,
    "benchmark_output_identity_once_idx",
    "Benchmark output identity race",
  );

  const persistedOutput = await runRequiredSql(
    "Benchmark output identity verification",
    `
      select output.id::text
      from private.benchmark_run_outputs output
      where output.run_id = '${BENCHMARK_IDS.run}'::uuid;
    `,
  );
  if (![BENCHMARK_IDS.outputA, BENCHMARK_IDS.outputB].includes(persistedOutput)) {
    throw new Error(`Benchmark output identity race persisted an unexpected row (${persistedOutput}).`);
  }

  await runRequiredSql(
    "Benchmark preference fixture output",
    `
      insert into private.benchmark_run_outputs (
        id, run_id, provider_id, provider_display_name, provider_readiness,
        model_id, model_version, voice_id, configuration_hash,
        output_modality, capability, transport, codec, status
      ) values (
        '${BENCHMARK_IDS.outputC}'::uuid,
        '${BENCHMARK_IDS.run}'::uuid,
        'elevenlabs',
        'ElevenLabs',
        'adapter-backed',
        'deterministic-model-b',
        'fixture/1.0.0',
        'deterministic-voice-b',
        'sha256:${"b".repeat(64)}',
        'audio',
        'tts',
        'fixture',
        'pcm16',
        'complete'
      );
    `,
  );

  const preferenceResults = await Promise.all([
    executeSql(
      benchmarkPreferenceInsertSql(
        "71000000-0000-4000-8000-00000000000a",
        persistedOutput,
      ),
    ),
    executeSql(
      benchmarkPreferenceInsertSql(
        "71000000-0000-4000-8000-00000000000b",
        BENCHMARK_IDS.outputC,
      ),
    ),
  ]);
  assertOneUniqueViolation(
    preferenceResults,
    "benchmark_human_preference_once_idx",
    "Benchmark raw-preference race",
  );

  const preferenceCount = await runRequiredSql(
    "Benchmark preference race verification",
    `
      select pg_catalog.count(*)::text
      from private.benchmark_judgments judgment
      where judgment.run_id = '${BENCHMARK_IDS.run}'::uuid
        and judgment.rater_user_id = '${TEST_USER_ID}'::uuid
        and judgment.dimension = 'overall_preference';
    `,
  );
  if (preferenceCount !== "1") {
    throw new Error(`Benchmark raw-preference race persisted ${preferenceCount} rows.`);
  }
  console.log("Benchmark identity and raw-preference concurrency: PASS");
}

async function testBenchmarkCatalogPublicationRace() {
  await runRequiredSql(
    "Benchmark publication race setup",
    `
      set statement_timeout = '15s';
      insert into private.lab_trust_profiles (
        user_id, tier, status, actor_kind, risk_score, expires_at
      ) values (
        '${TEST_USER_ID}'::uuid, 'admin', 'active', 'human', 0, null
      )
      on conflict (user_id) do update
      set tier = excluded.tier,
          status = excluded.status,
          actor_kind = excluded.actor_kind,
          risk_score = excluded.risk_score,
          expires_at = excluded.expires_at,
          updated_at = pg_catalog.clock_timestamp();
      update private.benchmark_methodologies
      set lifecycle_state = 'published',
          published_at = pg_catalog.clock_timestamp()
      where methodology_id = '${BENCHMARK_IDS.methodology}' and version = '1.0.0';
      update private.benchmark_suites
      set owner_user_id = null,
          provenance_reference = 'repository:db-concurrency',
          privacy_class = 'public',
          publication_eligibility = 'eligible',
          lifecycle_state = 'active'
      where id = '${BENCHMARK_IDS.suite}'::uuid;
      update private.benchmark_cases
      set case_kind = 'canonical',
          privacy_class = 'public',
          publication_eligibility = 'eligible',
          source_reference = 'repository:db-concurrency-case',
          source_verified_at = pg_catalog.clock_timestamp(),
          lifecycle_state = 'active'
      where id = '${BENCHMARK_IDS.benchmarkCase}'::uuid;
      update private.benchmark_runs
      set execution_mode = 'local-live',
          comparability_state = 'comparable',
          status = 'complete',
          consent_publication = true,
          consent_public_evidence_pool = true,
          integrity_state = 'hash-verified',
          integrity_checked_at = pg_catalog.clock_timestamp(),
          integrity_record_hash = bundle_hash,
          requested_at = pg_catalog.clock_timestamp() - interval '2 seconds',
          completed_at = pg_catalog.clock_timestamp() - interval '1 second'
      where id = '${BENCHMARK_IDS.run}'::uuid;
      update private.benchmark_run_outputs output
      set configuration_hash = private.benchmark_jsonb_sha256('{}'::jsonb),
          provider_configuration = '{}'::jsonb,
          adapter_version = 'adapter/1.0.0',
          transport = 'local',
          codec = 'pcm16',
          sample_rate_hz = 24000,
          channels = 1,
          thermal_state = 'warm',
          status = 'complete',
          request_started_at = pg_catalog.clock_timestamp() - interval '2 seconds',
          first_output_at = pg_catalog.clock_timestamp() - interval '1.5 seconds',
          first_audio_at = pg_catalog.clock_timestamp() - interval '1.5 seconds',
          completed_at = pg_catalog.clock_timestamp() - interval '1 second',
          output_content_hash = 'sha256:' || pg_catalog.encode(
            extensions.digest(output.id::text, 'sha256'), 'hex'
          )
      where output.run_id = '${BENCHMARK_IDS.run}'::uuid;
      insert into private.benchmark_measurements (
        output_id, metric_name, metric_version, metric_value, unit,
        availability, measurement_point, provenance
      )
      select output.id, 'request-success', 'one-tts-metrics/1.0.0', 1,
        'boolean', 'measured', 'one-server',
        '{"clock":"monotonic","observer":"one-server"}'::jsonb
      from private.benchmark_run_outputs output
      where output.run_id = '${BENCHMARK_IDS.run}'::uuid
      on conflict (output_id, metric_name, metric_version, measurement_point) do nothing;

      drop trigger if exists db_test_benchmark_publication_barrier on private.benchmark_runs;
      drop function if exists private.db_test_benchmark_publication_barrier();
      drop sequence if exists private.db_test_benchmark_publication_barrier_seq;
      drop trigger if exists db_test_guest_migration_barrier on private.guest_account_migrations;
      drop function if exists private.db_test_guest_migration_barrier();
      drop sequence if exists private.db_test_guest_migration_barrier_seq;
      create sequence private.db_test_benchmark_publication_barrier_seq minvalue 1 start 1;
      create function private.db_test_benchmark_publication_barrier()
      returns trigger
      language plpgsql
      security definer
      set search_path = ''
      as $$
      declare
        v_ticket bigint;
        v_deadline timestamptz := pg_catalog.clock_timestamp() + interval '5 seconds';
      begin
        if new.id = '${BENCHMARK_IDS.run}'::uuid
           and old.publication_state <> 'published'
           and new.publication_state = 'published' then
          v_ticket := pg_catalog.nextval(
            'private.db_test_benchmark_publication_barrier_seq'::pg_catalog.regclass
          );
          if v_ticket = 1 then
            loop
              exit when (
                select sequence.last_value
                from private.db_test_benchmark_publication_barrier_seq sequence
              ) >= 2;
              exit when pg_catalog.clock_timestamp() >= v_deadline;
              perform pg_catalog.pg_sleep(0.025);
            end loop;
          end if;
        end if;
        return new;
      end;
      $$;
      alter function private.db_test_benchmark_publication_barrier() owner to postgres;
      revoke all on function private.db_test_benchmark_publication_barrier() from public, anon, authenticated;
      create trigger db_test_benchmark_publication_barrier
        before update on private.benchmark_runs
        for each row execute function private.db_test_benchmark_publication_barrier();
    `,
  );

  const publication = executeSql(`
    begin;
    set local statement_timeout = '15s';
    select pg_catalog.set_config('request.jwt.claim.sub', '${TEST_USER_ID}', true);
    select pg_catalog.set_config(
      'request.jwt.claims',
      '{"sub":"${TEST_USER_ID}","role":"authenticated"}',
      true
    );
    select public.publish_benchmark_run('${BENCHMARK_IDS.run}'::uuid, '${TEST_GUARD}');
    commit;
  `);

  const readiness = executeSql(`
      set statement_timeout = '8s';
      do $$
      declare
        v_ready boolean := false;
        v_deadline timestamptz := pg_catalog.clock_timestamp() + interval '5 seconds';
      begin
        loop
          select sequence.is_called and sequence.last_value = 1 into v_ready
          from private.db_test_benchmark_publication_barrier_seq sequence;
          exit when v_ready or pg_catalog.clock_timestamp() >= v_deadline;
          perform pg_catalog.pg_sleep(0.025);
        end loop;
        if not v_ready then raise exception 'Publication barrier did not become ready.'; end if;
      end;
      $$;
    `);
  const firstPublicationEvent = await Promise.race([
    publication.then((result) => ({ kind: "publication", result })),
    readiness.then((result) => ({ kind: "readiness", result })),
  ]);
  if (firstPublicationEvent.kind === "publication") {
    const result = firstPublicationEvent.result;
    if (result.code !== 0 || result.outputExceeded) {
      throw new Error(
        `Benchmark publication race: publication failed before the barrier (${redact(result.stderr || result.stdout)}).`,
      );
    }
    throw new Error("Benchmark publication race: publication committed before the catalog barrier became observable.");
  }
  if (firstPublicationEvent.result.code !== 0 || firstPublicationEvent.result.outputExceeded) {
    throw new Error(
      `Benchmark publication barrier readiness failed (${redact(firstPublicationEvent.result.stderr || firstPublicationEvent.result.stdout)}).`,
    );
  }

  const catalogMutation = executeSql(`
    begin;
    set local statement_timeout = '15s';
    select pg_catalog.nextval(
      'private.db_test_benchmark_publication_barrier_seq'::pg_catalog.regclass
    );
    update private.benchmark_cases
    set exact_input_text = exact_input_text || ' Mutated.'
    where id = '${BENCHMARK_IDS.benchmarkCase}'::uuid;
    commit;
  `);
  const [publicationResult, mutationResult] = await Promise.all([publication, catalogMutation]);
  if (publicationResult.code !== 0 || publicationResult.outputExceeded) {
    throw new Error(`Benchmark publication race: publication failed (${redact(publicationResult.stderr || publicationResult.stdout)}).`);
  }
  const mutationText = `${mutationResult.stdout}\n${mutationResult.stderr}`;
  if (mutationResult.code === 0
      || !mutationText.includes("55000")
      || !mutationText.includes("Published benchmark catalog versions are immutable")) {
    throw new Error(`Benchmark publication race: catalog mutation was not rejected (${redact(mutationText)}).`);
  }

  const verification = await runRequiredSql(
    "Benchmark publication race verification",
    `
      select run.publication_state || '|' || benchmark_case.exact_input_text
      from private.benchmark_runs run
      join private.benchmark_cases benchmark_case on benchmark_case.id = run.case_id
      where run.id = '${BENCHMARK_IDS.run}'::uuid;
    `,
  );
  if (verification !== "published|Deterministic concurrency fixture.") {
    throw new Error(`Benchmark publication race left inconsistent state (${verification}).`);
  }
  console.log("Benchmark publication/catalog serialization: PASS");
}

async function cleanup() {
  await runRequiredSql(
    "Concurrency test cleanup",
    `
      set statement_timeout = '15s';
      drop trigger if exists db_test_feedback_barrier on public.feedback_entries;
      drop function if exists private.db_test_feedback_barrier();
      drop sequence if exists private.db_test_feedback_barrier_seq;
      drop trigger if exists zz_db_test_saved_experiment_barrier on public.saved_experiments;
      drop function if exists private.db_test_saved_experiment_barrier();
      drop sequence if exists private.db_test_saved_experiment_barrier_seq;
      drop trigger if exists db_test_usage_counter_barrier on private.lab_usage_counters;
      drop function if exists private.db_test_usage_counter_barrier();
      drop sequence if exists private.db_test_usage_counter_barrier_seq;
      drop trigger if exists db_test_benchmark_publication_barrier on private.benchmark_runs;
      drop function if exists private.db_test_benchmark_publication_barrier();
      drop sequence if exists private.db_test_benchmark_publication_barrier_seq;
      truncate table public.feedback_entries;
      delete from public.saved_experiments where user_id = '${TEST_USER_ID}'::uuid;
      truncate table
        private.lab_usage_counters,
        private.lab_concurrency_leases,
        private.lab_access_audit,
        private.lab_access_denial_rollups;
      set session_replication_role = replica;
      delete from private.benchmark_judgments
      where run_id = '${BENCHMARK_IDS.run}'::uuid;
      delete from private.benchmark_run_outputs
      where run_id = '${BENCHMARK_IDS.run}'::uuid;
      delete from private.benchmark_runs
      where id = '${BENCHMARK_IDS.run}'::uuid;
      delete from private.benchmark_cases
      where id = '${BENCHMARK_IDS.benchmarkCase}'::uuid;
      delete from private.benchmark_suites
      where id = '${BENCHMARK_IDS.suite}'::uuid;
      delete from private.benchmark_methodologies
      where methodology_id = '${BENCHMARK_IDS.methodology}';
      set session_replication_role = origin;
      update private.lab_provider_budgets
      set
        enabled = false,
        daily_units = 250000,
        monthly_units = 5000000,
        concurrency_limit = 8,
        updated_at = pg_catalog.clock_timestamp()
      where provider_id = 'deepgram'
        and operation = 'speech_generation';
      update private.lab_access_policies
      set
        global_daily_units = 5000,
        global_monthly_units = 100000,
        updated_at = pg_catalog.clock_timestamp()
      where tier = 'verified'
        and operation = 'provider_catalog'
        and provider_id = '*'
        and endpoint_id = '*';
      update private.lab_runtime_config
      set
        token_sha256 = '${ORIGINAL_GUARD_DIGEST}',
        updated_at = pg_catalog.clock_timestamp()
      where config_key = 'usage_guard';
      delete from auth.users where id = '${TEST_USER_ID}';
    `,
  );
}

async function main() {
  let failure;
  try {
    await prepareDatabase();
    await testAuthenticatedUserLimit();
    await testGlobalLimit();
    await testSavedExperimentLimit();
    await testGuestMigrationClaimLimit();
    await testProviderBudgetLimit();
    await testGlobalAccessLimit();
    await testBenchmarkUniqueness();
    await testBenchmarkCatalogPublicationRace();
  } catch (error) {
    failure = error;
  }

  try {
    await cleanup();
  } catch (cleanupError) {
    if (!failure) failure = cleanupError;
    else console.error(`Cleanup also failed: ${redact(cleanupError.message)}`);
  }

  if (failure) throw failure;
  console.log("Disposable Stage 2, benchmark, and human-auth concurrency verification: PASS");
}

main().catch((error) => {
  console.error(redact(error instanceof Error ? error.message : error));
  process.exitCode = 1;
});
