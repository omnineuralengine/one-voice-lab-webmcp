import { expect, test } from "@playwright/test";
import { AuthSessionMissingError } from "@supabase/supabase-js";

import { deniedLabAccess, labAccessResponse, safeAccessFailureMessage } from "../../src/lib/access/access-decision";
import { deriveLabClientIdentity, readOpaqueSessionCookie, readTrustedClientAddress } from "../../src/lib/access/client-identity";
import {
  acquireDurableLabAccess,
  parseDurableDecision,
  readDurableLabTrustState,
  setLabAccessClientFactoryForTests,
} from "../../src/lib/access/durable-access";
import {
  checkLabAccess,
  reserveLabConcurrencyLease,
  resetGuestLabAccessForTests,
  runWithLabConcurrency,
} from "../../src/lib/access/lab-access";
import { LAB_OPERATION_POLICY, meetsMinimumTier } from "../../src/lib/access/trust-policy";
import { ProviderOperationError } from "../../src/lib/providers/errors";
import { resetProviderRequestGuardForTests, withProviderRequestGuard } from "../../src/lib/providers/request-guard";

const ORIGINAL_GUARD = process.env.LAB_USAGE_GUARD_TOKEN;
const ORIGINAL_VERCEL = process.env.VERCEL;
const ORIGINAL_TRUST_PROXY = process.env.ONE_TRUST_PROXY_HEADERS;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_LIVE_LAB = process.env.ONE_LIVE_LAB_ENABLED;
const GUARD = "test-only-guard-token-that-is-at-least-thirty-two-characters";
const LEASE_ID = "00000000-0000-4000-8000-000000000001";
const TEST_USER_ID = "10000000-0000-4000-8000-000000000001";

test.beforeEach(() => {
  process.env.LAB_USAGE_GUARD_TOKEN = GUARD;
  delete process.env.VERCEL;
  delete process.env.ONE_TRUST_PROXY_HEADERS;
  resetGuestLabAccessForTests();
  resetProviderRequestGuardForTests();
});

test.afterEach(() => {
  restore("NODE_ENV", ORIGINAL_NODE_ENV);
  setLabAccessClientFactoryForTests(null);
  restore("LAB_USAGE_GUARD_TOKEN", ORIGINAL_GUARD);
  restore("VERCEL", ORIGINAL_VERCEL);
  restore("ONE_TRUST_PROXY_HEADERS", ORIGINAL_TRUST_PROXY);
  restore("ONE_LIVE_LAB_ENABLED", ORIGINAL_LIVE_LAB);
  resetGuestLabAccessForTests();
  resetProviderRequestGuardForTests();
});

test("trust tiers are ordered and cost-bearing actions are not agent-enabled", () => {
  expect(meetsMinimumTier("trusted_builder", "verified")).toBe(true);
  expect(meetsMinimumTier("verified", "partner_researcher")).toBe(false);
  for (const policy of Object.values(LAB_OPERATION_POLICY)) {
    if (policy.costBearing) expect(policy.agentEligible).toBe(false);
  }
  expect(LAB_OPERATION_POLICY.deliverable_generation.costBearing).toBe(false);
  expect(LAB_OPERATION_POLICY.deliverable_generation.providerBudgeted).toBe(false);
});

test("durable guest and authenticated tier decisions remain server-derived", async () => {
  setLabAccessClientFactoryForTests(clientFactory(null, allowedRow("guest"), false, new AuthSessionMissingError()));
  const guest = await checkLabAccess(labRequest(), "speech_generation", { providerId: "deepgram" });
  expect(guest).toMatchObject({ allowed: true, tier: "guest", daily: { used: 1, allowance: 4 } });

  setLabAccessClientFactoryForTests(clientFactory("user-1", allowedRow("trusted_builder")));
  const builder = await checkLabAccess(labRequest(), "speech_generation", { providerId: "deepgram" });
  expect(builder).toMatchObject({ allowed: true, tier: "trusted_builder", monthly: { used: 3, allowance: 80 } });
});

test("reads trust for upload preflight without reserving quota", async () => {
  let rpcCalls = 0;
  setLabAccessClientFactoryForTests(async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
    rpc: async () => { rpcCalls += 1; return { data: null, error: null }; },
  }));
  await expect(readDurableLabTrustState()).resolves.toEqual({
    kind: "known",
    tier: "guest",
    authenticated: false,
    active: true,
  });
  expect(rpcCalls).toBe(0);

  setLabAccessClientFactoryForTests(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: TEST_USER_ID } } }) },
    rpc: async (name) => {
      rpcCalls += 1;
      expect(name).toBe("read_my_lab_access_state");
      return { data: { tier: "trusted_builder", status: "active" }, error: null };
    },
  }));
  await expect(readDurableLabTrustState()).resolves.toEqual({
    kind: "known",
    tier: "trusted_builder",
    authenticated: true,
    active: true,
  });
  expect(rpcCalls).toBe(1);
});

test("anonymous-auth principals cannot reach durable human access RPCs", async () => {
  let rpcCalls = 0;
  setLabAccessClientFactoryForTests(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: TEST_USER_ID, is_anonymous: true } } }) },
    rpc: async () => { rpcCalls += 1; return { data: allowedRow("verified"), error: null }; },
  }));
  await expect(readDurableLabTrustState()).resolves.toEqual({
    kind: "known", tier: "guest", authenticated: false, active: true,
  });
  await expect(acquireDurableLabAccess(labRequest(), "speech_generation", { providerId: "deepgram" }))
    .resolves.toEqual({ kind: "unavailable", authenticated: false });
  expect(rpcCalls).toBe(0);
});

test("the RPC receives bounded metadata and never receives the raw challenge, IP, or session", async () => {
  let args: Record<string, unknown> = {};
  setLabAccessClientFactoryForTests(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: TEST_USER_ID } } }) },
    rpc: async (_name, input) => {
      args = input;
      return { data: allowedRow("verified"), error: null };
    },
  }));
  await acquireDurableLabAccess(labRequest(), "speech_generation", {
    providerId: "Deepgram",
    endpointId: "provider:tts",
    units: 12,
    minimumTier: "verified",
    actorIntent: "agent",
    challengeToken: "raw-sensitive-challenge",
    challengeVerified: true,
  });

  expect(args).toMatchObject({
    p_operation: "speech_generation",
    p_provider_id: "deepgram",
    p_endpoint_id: "provider:tts",
    p_requested_units: 12,
    p_minimum_tier: "verified",
    p_actor_intent: "agent",
    p_challenge_verified: true,
    p_acquire_concurrency: false,
  });
  expect(args.p_client_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(args.p_session_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(args)).not.toContain("raw-sensitive-challenge");
  expect(JSON.stringify(args)).not.toContain("203.0.113.9");
  expect(JSON.stringify(args)).not.toContain("0123456789abcdef0123456789abcdef");
});

test("quota, burst, provider-budget, and concurrency reasons normalize predictably", () => {
  const cases = [
    ["burst_limit", "burst_limit_reached"],
    ["daily_limit", "daily_limit_reached"],
    ["monthly_limit", "monthly_limit_reached"],
    ["provider_budget", "provider_budget_exhausted"],
    ["concurrency_limit", "concurrency_limit_reached"],
    ["tier_insufficient", "tier_required"],
    ["operation_disabled", "live_lab_paused"],
  ] as const;
  for (const [reason, code] of cases) {
    const decision = parseDurableDecision(deniedRow(reason), "speech_generation", "guest");
    expect(decision).toMatchObject({ allowed: false, code });
  }
});

test("structured 429 responses include useful reset information without internal risk signals", async () => {
  const response = labAccessResponse(deniedLabAccess({
    tier: "verified",
    operation: "speech_generation",
    used: 10,
    allowance: 10,
    resetsAt: new Date(Date.now() + 60_000).toISOString(),
    code: "daily_limit_reached",
  }));
  const body = await response.json();
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toMatch(/^\d+$/);
  expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
  expect(body).toMatchObject({
    ok: false,
    error: { code: "daily_limit_reached", retryable: true },
    access: { tier: "verified", operation: "speech_generation", remaining: 0 },
  });
  expect(JSON.stringify(body)).not.toMatch(/risk|fingerprint|clientHash|sessionHash/i);
});

test("Vercel address derivation trusts only the platform-owned forwarding header", () => {
  process.env.VERCEL = "1";
  const first = labRequest({
    "x-vercel-forwarded-for": "203.0.113.9",
    "x-forwarded-for": "198.51.100.5",
  });
  const spoofChanged = labRequest({
    "x-vercel-forwarded-for": "203.0.113.9",
    "x-forwarded-for": "192.0.2.200",
  });
  const platformChanged = labRequest({
    "x-vercel-forwarded-for": "203.0.113.10",
    "x-forwarded-for": "198.51.100.5",
  });

  expect(readTrustedClientAddress(first)).toEqual({ value: "203.0.113.9", source: "vercel" });
  expect(deriveLabClientIdentity(first).clientHash).toBe(deriveLabClientIdentity(spoofChanged).clientHash);
  expect(deriveLabClientIdentity(first).clientHash).not.toBe(deriveLabClientIdentity(platformChanged).clientHash);
});

test("only the opaque HttpOnly-session cookie shape contributes a session signal", () => {
  const valid = labRequest({ cookie: "other=1; one_lab_session=0123456789abcdef0123456789abcdef" });
  const invalid = labRequest({ cookie: "one_lab_session=attacker-selected-session" });
  expect(readOpaqueSessionCookie(valid)).toBe("0123456789abcdef0123456789abcdef");
  expect(deriveLabClientIdentity(valid).sessionPresent).toBe(true);
  expect(readOpaqueSessionCookie(invalid)).toBeNull();
  expect(deriveLabClientIdentity(invalid).sessionPresent).toBe(false);
});

test("provider guard acquires and releases a durable lease around paid work", async () => {
  const calls: string[] = [];
  setLabAccessClientFactoryForTests(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: TEST_USER_ID } } }) },
    rpc: async (name, args) => {
      calls.push(name);
      if (name === "release_lab_access") {
        expect(args.p_lease_id).toBe(LEASE_ID);
        return { data: true, error: null };
      }
      expect(args).toMatchObject({ p_requested_units: 1, p_acquire_concurrency: true });
      return { data: { ...allowedRow("verified"), lease_id: LEASE_ID }, error: null };
    },
  }));

  const result = await withProviderRequestGuard(labRequest(), "deepgram", "tts", async () => "complete");
  expect(result).toBe("complete");
  expect(calls).toEqual(["acquire_lab_access", "release_lab_access"]);
});

test("general operation leases release in finally while realtime grants can retain their TTL lease", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  setLabAccessClientFactoryForTests(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: TEST_USER_ID } } }) },
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === "release_lab_access") return { data: true, error: null };
      return { data: { ...allowedRow("verified"), lease_id: LEASE_ID }, error: null };
    },
  }));

  await expect(runWithLabConcurrency(
    labRequest(),
    "ai_reasoning",
    { providerId: "vercel-ai-gateway", endpointId: "ai:reason" },
    async () => { throw new Error("task failed after admission"); },
  )).rejects.toThrow("task failed after admission");
  expect(calls.map((call) => call.name)).toEqual(["acquire_lab_access", "release_lab_access"]);

  calls.length = 0;
  const realtime = await reserveLabConcurrencyLease(labRequest(), "realtime_session", {
    providerId: "deepgram",
    endpointId: "deepgram:temporary-token",
    units: 90,
    minimumTier: "verified",
  });
  expect(realtime.decision.allowed).toBe(true);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    name: "acquire_lab_access",
    args: { p_requested_units: 90, p_acquire_concurrency: true },
  });
  // Token issuance deliberately does not call release; the database TTL ends
  // this reservation when direct browser-to-provider traffic can no longer run.
});

test("provider guard preserves local bursts and rejects durable concurrency exhaustion", async () => {
  setLabAccessClientFactoryForTests(clientFactory("user-1", deniedRow("concurrency_limit")));
  await expect(withProviderRequestGuard(labRequest(), "deepgram", "tts", async () => "must-not-run"))
    .rejects.toMatchObject({ code: "provider_concurrency_limited", status: 429 });

  resetProviderRequestGuardForTests();
  setLabAccessClientFactoryForTests(clientFactory("user-1", { ...allowedRow("verified"), lease_id: LEASE_ID }, true));
  for (let index = 0; index < 5; index += 1) {
    await withProviderRequestGuard(labRequest(), "deepgram", "tts", async () => index);
  }
  let burstError: unknown;
  try {
    await withProviderRequestGuard(labRequest(), "deepgram", "tts", async () => "must-not-run");
  } catch (error) {
    burstError = error;
  }
  expect(burstError).toBeInstanceOf(ProviderOperationError);
  expect(burstError).toMatchObject({ code: "provider_rate_limited", status: 429 });
});

test("durable failures fail closed in production and redact database details", async () => {
  setLabAccessClientFactoryForTests(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: TEST_USER_ID } } }) },
    rpc: async () => ({ data: null, error: { message: "Authorization: Bearer fixture" } }),
  }));
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  process.env.ONE_LIVE_LAB_ENABLED = "true";

  const decision = await checkLabAccess(labRequest(), "speech_generation");
  expect(decision).toMatchObject({ allowed: false, tier: "verified", code: "quota_unavailable" });
  expect(JSON.stringify(decision)).not.toContain("secret-provider-key");
  expect(safeAccessFailureMessage(new Error("Authorization: Bearer fixture"))).not.toContain("secret-provider-key");
});

function clientFactory(userId: string | null, data: unknown, release = false, authError?: unknown) {
  return async () => ({
    auth: { getUser: async () => ({ data: { user: userId ? { id: TEST_USER_ID } : null }, error: authError }) },
    rpc: async (name: string) => name === "release_lab_access" && release
      ? { data: true, error: null }
      : { data, error: null },
  });
}

function allowedRow(tier: string) {
  return {
    allowed: true,
    tier,
    used: 1,
    allowance: 4,
    remaining: 3,
    resets_at: "2026-08-27T00:00:00.000Z",
    daily_used: 1,
    daily_allowance: 4,
    monthly_used: 3,
    monthly_allowance: 80,
    reason: "allowed",
  };
}

function deniedRow(reason: string) {
  return {
    ...allowedRow("guest"),
    allowed: false,
    used: 4,
    remaining: 0,
    reason,
  };
}

function labRequest(extraHeaders: Record<string, string> = {}) {
  return new Request("http://local.test/api/lab", {
    method: "POST",
    headers: {
      origin: "http://local.test",
      "x-forwarded-for": "203.0.113.9",
      cookie: "one_lab_session=0123456789abcdef0123456789abcdef",
      ...extraHeaders,
    },
  });
}

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
