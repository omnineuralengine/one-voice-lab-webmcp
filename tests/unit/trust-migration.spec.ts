import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = source("supabase/migrations/20260826234833_progressive_trust_access.sql");

test("the forward migration closes every server-guard NULL bypass", () => {
  expect(migration).toContain("if p_guard_token is null");
  expect(migration).toContain("char_length(p_guard_token) not between 32 and 256");
  for (const name of [
    "acquire_lab_access",
    "release_lab_access",
    "consume_member_usage",
    "consume_guest_usage",
    "submit_feedback",
    "record_viewer_event",
  ]) {
    expect(functionBody(name), name).toContain("perform private.assert_lab_guard(p_guard_token)");
  }
  expect(migration).toContain("revoke all on function public.consume_member_usage(text) from public, anon, authenticated");
});

test("trust tiers and policies are data-driven and private", () => {
  for (const table of [
    "lab_trust_profiles",
    "lab_access_policies",
    "lab_provider_budgets",
    "lab_usage_counters",
    "lab_concurrency_leases",
    "lab_access_audit",
    "lab_access_denial_rollups",
  ]) {
    expect(migration).toContain(`create table private.${table}`);
    expect(migration).toContain(`alter table private.${table} enable row level security`);
  }
  for (const tier of ["guest", "verified", "trusted_builder", "partner_researcher", "admin"]) {
    expect(migration).toContain(`'${tier}'`);
  }
  expect(migration).toContain("revoke all on all tables in schema private from public, anon, authenticated");
});

test("admission covers burst, session, client, user, global, provider, and monthly ceilings atomically", () => {
  const acquire = functionBody("acquire_lab_access");
  for (const scope of [
    "'burst'",
    "'session_day'",
    "'client_day'",
    "'user_day'",
    "'user_month'",
    "'global_day'",
    "'global_month'",
    "'provider_day'",
    "'provider_month'",
  ]) expect(acquire).toContain(scope);

  expect(acquire).toContain("pg_catalog.hashtextextended('one-lab:' || p_operation, 0)");
  expect(acquire).toContain("v_budget private.lab_provider_budgets%rowtype;");
  expect(acquire).not.toContain("v_budget record;");
  expect(acquire).not.toContain("'one-lab:' || p_operation || ':' || v_provider_id");
  expect(acquire).toContain("'client_day', p_client_hash, p_operation, '', ''");
  expect(acquire).toContain("v_provider_month_used + p_requested_units > v_budget.monthly_units");
  expect(acquire).toContain("v_global_month_used + p_requested_units > v_policy.global_monthly_units");
});

test("multiple accounts and declared agents add friction without treating IP or device as identity", () => {
  const acquire = functionBody("acquire_lab_access");
  expect(acquire).toContain("count(distinct audit.user_id)");
  expect(acquire).toContain("greatest(0, v_account_count - 1) * 10");
  expect(acquire).toContain("p_actor_intent = 'agent'");
  expect(acquire).toContain("v_actor_kind <> 'agent'");
  expect(acquire).toContain("private.lab_tier_rank('trusted_builder')");
  expect(migration).not.toMatch(/\b(ip_address|device_fingerprint|raw_cookie)\b/i);
});

test("provider budgets, concurrency leases, saved-result ceilings, and admin-only summaries are durable", () => {
  expect(migration).toContain("insert into private.lab_provider_budgets");
  expect(migration).toContain("('deepgram', 'speech_generation', false");
  expect(migration).toContain("if v_budget_found and not v_budget.enabled");
  expect(migration).toContain("insert into private.lab_concurrency_leases");
  expect(migration).toContain("when 'realtime_session' then least(600, greatest(30, p_requested_units))");
  expect(migration).toContain("delete from private.lab_concurrency_leases where lease_id = p_lease_id");
  expect(migration).toContain("create trigger saved_experiments_trust_quota");
  expect(functionBody("read_lab_access_admin_summary")).toContain("v_profile.tier <> 'admin'");
});

test("denials are aggregated, sampled under a hard cap, and pruned on bounded retention", () => {
  const recorder = privateFunctionBody("record_lab_access_audit");
  const admin = functionBody("read_lab_access_admin_summary");
  const prune = privateFunctionBody("prune_lab_access_history");

  expect(migration).toContain("create table private.lab_access_denial_rollups");
  expect(recorder).toContain("on conflict (bucket_start, operation, provider_id, tier, actor_kind, reason, client_bucket)");
  expect(recorder).toContain("occurrence_count + 1");
  expect(recorder).toContain("v_denial_detail_count < 250");
  expect(recorder).toContain("audit.client_hash = p_client_hash");
  expect(recorder).toContain("'one-lab-denial-detail:' || v_hour_epoch::text");
  expect(recorder).toContain("to_timestamp(v_hour_epoch * 3600)");
  expect(admin).toContain("sum(rollup.occurrence_count)");
  expect(admin).toContain("rollup.bucket_start >= v_start and rollup.bucket_start < v_end");
  expect(prune).toContain("interval '35 days'");
  expect(prune).toContain("interval '90 days'");
  expect(prune).toContain("loop");
  expect(prune).toContain("exit when v_detail_batch_rows = 0");
  expect(migration).toContain("'one-lab-access-history-retention'");
  expect(migration).toContain("'23 * * * *'");
});

test("speech transcription budgets use trusted audio seconds and upload routes share that admission", () => {
  expect(migration).toContain("Speech-transcription units are trusted server-measured audio seconds");
  expect(migration).toContain("('speech_transcription',    4,  60::bigint");
  expect(migration).toContain("('deepgram', 'speech_transcription', false, 18000, 360000, 6)");

  for (const path of [
    "src/app/api/deepgram/transcribe-file/route.ts",
    "src/app/api/deepgram/execute/route.ts",
    "src/app/api/providers/[provider]/stt/route.ts",
  ]) {
    const route = source(path);
    expect(route, path).toContain("inspectTrustedSttAudio");
    expect(route, path).toContain("trustedAudio.audio.quotaUnits");
    expect(route, path).not.toContain("Math.ceil(file.size / 1_024)");
  }
  expect(source("src/app/api/deepgram/transcribe-url/route.ts")).toContain("url_transcription_disabled");
});

test("saved-result count and insert are serialized per user inside the trigger transaction", () => {
  const trigger = privateFunctionBody("enforce_saved_experiment_quota");
  const lock = trigger.indexOf("'one-saved-experiment:' || v_user_id::text");
  const count = trigger.indexOf("select count(*)::integer into v_count");

  expect(lock).toBeGreaterThan(0);
  expect(count).toBeGreaterThan(lock);
  expect(trigger).toContain("pg_catalog.pg_advisory_xact_lock");
  expect(trigger).toContain("where experiment.user_id = v_user_id");
});

test("Deepgram account-data proxying requires the internal admin tier in production", () => {
  const route = source("src/app/api/deepgram/execute/route.ts");
  expect(route).toContain("isOpenLabAccountDataEndpoint(prepared.endpoint)");
  expect(route).toContain('minimumTier: "admin" as const');
});

test("costly direct routes apply the shared durable concurrency boundary", () => {
  expect(source("src/app/api/deepgram/token/route.ts")).toContain("reserveLabConcurrencyLease");
  expect(source("src/app/api/deepgram/text-intelligence/route.ts")).toContain("runWithLabConcurrency");
  expect(source("src/app/api/ai/reason/route.ts")).toContain("runWithLabConcurrency");
  expect(source("src/app/api/deliverables/generate/route.ts")).toContain("reserveLabConcurrencyLease");
  expect(source("src/app/api/deepgram/execute/route.ts")).toContain("withProviderRequestGuard");
});

function functionBody(name: string): string {
  const pattern = new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`, "i");
  const match = migration.match(pattern);
  if (!match) throw new Error(`Missing function ${name}`);
  return match[0];
}

function privateFunctionBody(name: string): string {
  const pattern = new RegExp(`create or replace function private\\.${name}\\([\\s\\S]*?\\n\\$\\$;`, "i");
  const match = migration.match(pattern);
  if (!match) throw new Error(`Missing private function ${name}`);
  return match[0];
}

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}
