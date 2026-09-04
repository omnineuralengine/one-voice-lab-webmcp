import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const migration = source("supabase/migrations/20260827153913_bounded_persistence_and_feedback_admission.sql");

test("viewer-event aggregation is private, low-cardinality, and atomic with raw deletion", () => {
  const table = migration.match(/create table private\.viewer_event_daily_aggregates \([\s\S]*?\n\);/i)?.[0];
  expect(table).toBeTruthy();
  expect(table).toContain("event_day date not null");
  expect(table).toContain("event_count bigint not null");
  expect(table).not.toMatch(/^\s*(user_id|ip_address|device|path|query|prompt|transcript|audio|credential|message)\s+/im);

  const prune = privateFunctionBody("prune_lab_access_history");
  expect(prune).toContain("insert into private.viewer_event_daily_aggregates");
  expect(prune).toContain("on conflict (event_day, event_name, surface, provider_id)");
  expect(prune).toContain("delete from public.viewer_events event");
  expect(prune).toContain("exists (select 1 from aggregated)");
  expect(prune).toContain("interval '30 days'");
  expect(prune).toContain("v_utc_date - 400");
});

test("one owner-only maintenance function applies every bounded lifecycle", () => {
  const prune = privateFunctionBody("prune_lab_access_history");
  for (const path of [
    "public.feedback_entries",
    "private.lab_usage_counters",
    "private.member_usage_daily",
    "private.guest_usage_daily",
    "private.lab_global_usage_daily",
    "private.lab_access_audit",
    "private.lab_access_denial_rollups",
  ]) expect(prune, path).toContain(path);

  for (const retention of ["interval '365 days'", "interval '120 days'", "interval '35 days'", "interval '90 days'"]) {
    expect(prune).toContain(retention);
  }
  expect(prune).toContain("v_batch_size constant integer := 5000");
  expect(prune).toContain("v_max_batches constant integer := 4");
  expect(prune.match(/for update skip locked/g)?.length).toBeGreaterThanOrEqual(9);
  expect(migration).toContain("pg_try_advisory_xact_lock");
  expect(migration).toContain("revoke all on function private.prune_lab_access_history() from public, anon, authenticated");
  expect(migration.match(/'one-lab-access-history-retention'/g)).toHaveLength(1);
});

test("feedback count and insert are serialized under consistently ordered transaction locks", () => {
  const feedback = publicFunctionBody("submit_feedback");
  const globalLock = feedback.indexOf("one-feedback-admission:0-global");
  const userLock = feedback.indexOf("one-feedback-admission:1-user:");
  const globalCount = feedback.indexOf("feedback_global_limit");
  const userCount = feedback.indexOf("feedback_user_limit");
  const insert = feedback.indexOf("insert into public.feedback_entries");

  expect(globalLock).toBeGreaterThan(0);
  expect(userLock).toBeGreaterThan(globalLock);
  expect(globalCount).toBeGreaterThan(userLock);
  expect(userCount).toBeGreaterThan(globalCount);
  expect(insert).toBeGreaterThan(userCount);
  expect(feedback).toContain("pg_advisory_xact_lock");
  expect(feedback).toContain("v_now := pg_catalog.clock_timestamp()");
  expect(migration).toContain("grant execute on function public.submit_feedback(text, text, text, text, text, text) to anon, authenticated");
});

test("viewer-event admission is serialized so accepted ingress cannot outrun cleanup", () => {
  const viewer = publicFunctionBody("record_viewer_event");
  const lock = viewer.indexOf("one-viewer-event-admission:global");
  const count = viewer.indexOf(">= 10000");
  const insert = viewer.indexOf("insert into public.viewer_events");

  expect(lock).toBeGreaterThan(0);
  expect(count).toBeGreaterThan(lock);
  expect(insert).toBeGreaterThan(count);
  expect(viewer).toContain("pg_advisory_xact_lock");
  expect(viewer).toContain("v_now := pg_catalog.clock_timestamp()");
});

test("the feedback route maps only stable database limit codes to a sanitized 429", () => {
  const route = source("src/app/api/feedback/route.ts");
  const classifier = source("src/lib/feedback/rpc-error.ts");

  expect(route).toContain("isFeedbackAdmissionLimit(error)");
  expect(route).toContain('status: 429');
  expect(route).toContain('"Retry-After": "3600"');
  expect(classifier).toContain('error?.code === "P0001"');
  expect(classifier).toContain('"feedback_global_limit"');
  expect(classifier).toContain('"feedback_user_limit"');
  expect(classifier).not.toMatch(/authorization|bearer|credential|token/i);
});

function privateFunctionBody(name: string): string {
  return functionBody(`private\\.${name}`);
}

function publicFunctionBody(name: string): string {
  return functionBody(`public\\.${name}`);
}

function functionBody(qualifiedName: string): string {
  const pattern = new RegExp(`create or replace function ${qualifiedName}\\([\\s\\S]*?\\n\\$\\$;`, "i");
  const match = migration.match(pattern);
  if (!match) throw new Error(`Missing function ${qualifiedName}`);
  return match[0];
}

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}
