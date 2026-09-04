import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { GET as getOwnAccess } from "../../src/app/api/access/me/route";
import { GET as getAdminTrustAccess } from "../../src/app/api/admin/trust-access/route";
import {
  guestAccessProjection,
  readAdminTrustSummary,
  readOwnTrustState,
  type TrustStateReader,
} from "../../src/lib/access/trust-state";
import { isSameSiteRequest } from "../../src/lib/http/same-site-request";

const GUARD = "test-only-guard-token-that-is-at-least-thirty-two-characters";
const ORIGINAL_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIGINAL_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const ORIGINAL_GUARD = process.env.LAB_USAGE_GUARD_TOKEN;

test.afterEach(() => {
  restore("NEXT_PUBLIC_SUPABASE_URL", ORIGINAL_URL);
  restore("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", ORIGINAL_KEY);
  restore("LAB_USAGE_GUARD_TOKEN", ORIGINAL_GUARD);
});

test("the access endpoint returns the safe no-store guest projection without Supabase configuration", async () => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  const response = await getOwnAccess();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("vary")).toContain("Cookie");
  expect(await response.json()).toEqual({ ok: true, access: guestAccessProjection() });
});

test("missing sessions remain guests while unexpected auth failures fail safely", async () => {
  let rpcCalls = 0;
  const missing = await readOwnTrustState(reader({
    userId: null,
    authError: { name: "AuthSessionMissingError", message: "Auth session missing!" },
    onRpc: () => { rpcCalls += 1; },
  }));
  expect(missing).toEqual({ ok: true, value: guestAccessProjection() });
  expect(rpcCalls).toBe(0);

  const failed = await readOwnTrustState(reader({
    userId: null,
    authError: { message: "Authorization: Bearer fixture" },
  }));
  expect(failed).toMatchObject({ ok: false, status: 503, code: "trust_state_unavailable" });
  expect(JSON.stringify(failed)).not.toContain("secret-provider-key");
});

test("anonymous-auth users remain guest for self reads and cannot reach trust RPCs", async () => {
  let rpcCalls = 0;
  const anonymous = await readOwnTrustState(reader({
    userId: "anonymous-auth",
    anonymous: true,
    onRpc: () => { rpcCalls += 1; },
  }));
  expect(anonymous).toEqual({ ok: true, value: guestAccessProjection() });
  expect(rpcCalls).toBe(0);

  const admin = await readAdminTrustSummary(reader({
    userId: "anonymous-auth",
    anonymous: true,
    onRpc: () => { rpcCalls += 1; },
  }), GUARD);
  expect(admin).toMatchObject({ ok: false, status: 403, code: "admin_access_required" });
  expect(rpcCalls).toBe(0);
});

test("signed-in access state is read from the guarded database projection and validated", async () => {
  const rpcNames: string[] = [];
  const result = await readOwnTrustState(reader({
    userId: "user-1",
    rpcData: ownState(),
    onRpc: (name) => rpcNames.push(name),
  }));

  expect(rpcNames).toEqual(["read_my_lab_access_state"]);
  expect(result).toMatchObject({
    ok: true,
    value: {
      authenticated: true,
      tier: "trusted_builder",
      actorKind: "developer",
      riskBand: "normal",
    },
  });

  const malformed = await readOwnTrustState(reader({
    userId: "user-1",
    rpcData: { ...ownState(), authorization: "Bearer must-not-pass" },
  }));
  expect(malformed).toMatchObject({ ok: false, status: 503 });
  expect(JSON.stringify(malformed)).not.toContain("must-not-pass");
});

test("admin summary relies on the database role check and passes only the server guard", async () => {
  const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
  const result = await readAdminTrustSummary(reader({
    userId: "ordinary-authenticated-user",
    rpcData: adminSummary(),
    onRpc: (name, args) => calls.push({ name, args }),
  }), GUARD);

  expect(result).toMatchObject({ ok: true, value: { windowHours: 24, activeConcurrency: 2 } });
  expect(calls).toEqual([{
    name: "read_lab_access_admin_summary",
    args: { p_guard_token: GUARD },
  }]);
});

test("admin reads distinguish authorization from unavailable guard configuration without leaking details", async () => {
  const noSession = await readAdminTrustSummary(reader({ userId: null }), GUARD);
  expect(noSession).toMatchObject({ ok: false, status: 403, code: "admin_access_required" });

  const denied = await readAdminTrustSummary(reader({
    userId: "user-1",
    rpcError: { code: "42501", message: "Active administrator access is required." },
  }), GUARD);
  expect(denied).toMatchObject({ ok: false, status: 403, code: "admin_access_required" });

  const badGuard = await readAdminTrustSummary(reader({
    userId: "user-1",
    rpcError: { code: "42501", message: "Lab usage guard is invalid: secret-token" },
  }), GUARD);
  expect(badGuard).toMatchObject({ ok: false, status: 503, code: "trust_state_unavailable" });
  expect(JSON.stringify(badGuard)).not.toContain("secret-token");

  const missingGuard = await readAdminTrustSummary(reader({ userId: "user-1" }), undefined);
  expect(missingGuard).toMatchObject({ ok: false, status: 503 });
});

test("admin API rejects cross-site and signal-free requests before attempting configuration", async () => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.LAB_USAGE_GUARD_TOKEN;

  const crossSite = await getAdminTrustAccess(new Request("https://lab.example/api/admin/trust-access", {
    headers: { origin: "https://attacker.example", "sec-fetch-site": "cross-site" },
  }));
  expect(crossSite.status).toBe(403);
  expect(await crossSite.json()).toMatchObject({ error: { code: "cross_origin" } });

  const noSignal = await getAdminTrustAccess(new Request("https://lab.example/api/admin/trust-access"));
  expect(noSignal.status).toBe(403);

  const sameOrigin = await getAdminTrustAccess(new Request("https://lab.example/api/admin/trust-access", {
    headers: { "sec-fetch-site": "same-origin" },
  }));
  expect(sameOrigin.status).toBe(503);
  expect(sameOrigin.headers.get("cache-control")).toContain("no-store");
});

test("same-site classification requires exact origins when Origin is present", () => {
  expect(isSameSiteRequest(request({ origin: "https://lab.example", "sec-fetch-site": "same-origin" }), { requireBrowserSignal: true })).toBe(true);
  expect(isSameSiteRequest(request({ origin: "https://other.example", "sec-fetch-site": "same-site" }), { requireBrowserSignal: true })).toBe(false);
  expect(isSameSiteRequest(request({ "sec-fetch-site": "same-site" }), { requireBrowserSignal: true })).toBe(true);
  expect(isSameSiteRequest(request({ "sec-fetch-site": "cross-site" }), { requireBrowserSignal: true })).toBe(false);
  expect(isSameSiteRequest(
    new Request("http://internal:3341/api/account/claim-guest", {
      headers: {
        host: "127.0.0.1:3341",
        origin: "http://127.0.0.1:3341",
        "sec-fetch-site": "same-origin",
        "x-forwarded-proto": "http",
      },
    }),
    { requireBrowserSignal: true, allowHostHeaderFallback: true },
  )).toBe(true);
  expect(isSameSiteRequest(
    new Request("http://internal:3341/api/account/claim-guest", {
      headers: {
        host: "127.0.0.1:3341",
        origin: "http://attacker.invalid",
        "sec-fetch-site": "same-site",
        "x-forwarded-proto": "http",
      },
    }),
    { requireBrowserSignal: true, allowHostHeaderFallback: true },
  )).toBe(false);
});

test("route sources remain server-brokered and expose no privileged key", () => {
  const ownRoute = source("src/app/api/access/me/route.ts");
  const adminRoute = source("src/app/api/admin/trust-access/route.ts");
  const service = source("src/lib/access/trust-state.ts");

  expect(ownRoute).toContain("getOneSupabaseServerClient");
  expect(adminRoute).toContain("requireBrowserSignal: true");
  expect(adminRoute).toContain("process.env.LAB_USAGE_GUARD_TOKEN");
  expect(service).toContain('reader.rpc("read_my_lab_access_state")');
  expect(service).toContain('reader.rpc("read_lab_access_admin_summary"');
  expect(`${ownRoute}\n${adminRoute}`).not.toMatch(/service[_-]?role|SUPABASE_SECRET_KEY/i);
});

function reader(options: {
  userId: string | null;
  anonymous?: boolean;
  authError?: unknown;
  rpcData?: unknown;
  rpcError?: unknown;
  onRpc?: (name: string, args?: Record<string, unknown>) => void;
}): TrustStateReader {
  return {
    getUser: async () => ({
      data: { user: options.userId ? { id: "10000000-0000-4000-8000-000000000001", is_anonymous: options.anonymous } : null },
      error: options.authError,
    }),
    rpc: async (name, args) => {
      options.onRpc?.(name, args);
      return { data: options.rpcData ?? null, error: options.rpcError };
    },
  };
}

function ownState() {
  return {
    tier: "trusted_builder",
    status: "active",
    actorKind: "developer",
    riskBand: "normal",
    expiresAt: null,
    savedExperiments: 4,
    usage: [{
      operation: "speech_generation",
      providerId: "deepgram",
      window: "user_day",
      usedUnits: 42,
      windowStart: "2026-08-26T00:00:00.000Z",
    }],
  };
}

function adminSummary() {
  return {
    generatedAt: "2026-08-26T23:59:00.000Z",
    windowHours: 24,
    decisions: { allowed: 12, denied: 3 },
    denialsByReason: [{ reason: "daily_limit", count: 2 }],
    usageByProvider: [{ providerId: "deepgram", operation: "speech_generation", usedUnits: 300 }],
    providerBudgets: [{
      providerId: "deepgram",
      operation: "speech_generation",
      enabled: true,
      dailyUnits: 10_000,
      monthlyUnits: 100_000,
      concurrencyLimit: 4,
      updatedAt: "2026-08-26T22:00:00.000Z",
    }],
    activeConcurrency: 2,
    activeTierCounts: { verified: 20, admin: 1 },
    riskSignals: { reviewOrElevatedClients: 3, multiAccountClients: 1 },
  };
}

function request(headers: Record<string, string>) {
  return new Request("https://lab.example/api/admin/trust-access", { headers });
}

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
