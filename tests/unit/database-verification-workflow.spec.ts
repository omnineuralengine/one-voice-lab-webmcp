import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

test("database verification is manual, disposable, pinned, and production-credential free", () => {
  const workflow = source(".github/workflows/database-verification.yml");

  expect(workflow).toContain("workflow_dispatch:");
  expect(workflow).not.toMatch(/^\s+(push|pull_request|schedule):/m);
  expect(workflow).toContain("permissions:\n  contents: read");
  expect(workflow).toContain("actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1");
  expect(workflow).toContain("supabase/setup-cli@46f7f98c7f948ad727d22c1e67fab04c223a0520");
  expect(workflow).toContain("version: 2.116.0");
  expect(workflow).toContain("supabase db reset --local");
  expect(workflow).toContain("supabase test db --local");
  expect(workflow).toContain("node scripts/test-supabase-concurrency.mjs");
  expect(workflow).toContain("supabase stop --no-backup --project-id one-voice-lab-db-tests");
  expect(workflow).not.toMatch(/secrets\.|supabase\s+(link|db push)|vercel|deploy/i);
});

test("the concurrency runner refuses hosted databases and requires explicit disposable opt-in", () => {
  const runner = source("scripts/test-supabase-concurrency.mjs");
  const config = source("supabase/config.toml");

  expect(config).toContain('project_id = "one-voice-lab-db-tests"');
  expect(runner).toContain('ONE_ALLOW_DISPOSABLE_DB_TESTS !== ALLOW_DISPOSABLE_TESTS');
  expect(runner).toContain('supabase_db_one-voice-lab-db-tests');
  expect(runner).toContain('["127.0.0.1", "localhost", "::1"]');
  expect(runner).toContain('port !== "54322"');
  expect(runner).toContain('parsedDatabaseUrl.pathname !== "/postgres"');
  expect(runner).toContain("statement_timeout = '15s'");
  expect(runner).not.toMatch(/statement_timeout\s*=\s*'\d+ seconds'/i);
  expect(runner).not.toMatch(/supabase\.co|service[_-]?role|provider.*api.*key/i);
});

test("every pgTAP plan matches its declared assertion count", () => {
  for (const path of [
    "supabase/tests/database/001_persistence_schema.test.sql",
    "supabase/tests/database/002_persistence_lifecycle.test.sql",
    "supabase/tests/database/003_stage2_database_invariants.test.sql",
  ]) {
    const sql = source(path);
    const plan = Number(sql.match(/select plan\((\d+)\)/i)?.[1]);
    const assertions = sql.match(
      /^select\s+(?:ok|is|isnt|like|unlike|cmp_ok|throws_ok|lives_ok|has_|hasnt_|results_eq|set_eq|bag_eq|row_eq)\s*\(/gim,
    )?.length ?? 0;

    expect(plan, path).toBeGreaterThan(0);
    expect(assertions, path).toBe(plan);
    expect(sql).toMatch(/select \* from finish\(\);\s*rollback;/i);
  }
});

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}
