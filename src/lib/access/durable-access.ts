import "server-only";

import { isAuthSessionMissingError } from "@supabase/supabase-js";

import { deriveLabClientIdentity, hasDurableIdentitySecret } from "@/lib/access/client-identity";
import { isOneHumanAuthSubject } from "@/lib/auth/human-subject";
import {
  denialMessage,
  deniedLabAccess,
  type LabAccessDecision,
  type LabAccessDenialCode,
} from "@/lib/access/access-decision";
import {
  isLabTrustTier,
  normalizeLabAccessContext,
  type LabAccessContext,
  type LabTrustTier,
  type LabUsageOperation,
} from "@/lib/access/trust-policy";
import { getOneSupabaseServerClient } from "@/lib/supabase/server";

type RpcResult = { data: unknown; error: unknown };
type AuthResult = { data: { user: { id: string; is_anonymous?: boolean } | null }; error?: unknown };
type LabAccessRpcClient = {
  auth: { getUser: () => Promise<AuthResult> };
  rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResult>;
};
type ClientFactory = () => Promise<LabAccessRpcClient | null>;

export type DurableAccessOutcome =
  | { kind: "decision"; decision: LabAccessDecision; authenticated: boolean }
  | { kind: "unavailable"; authenticated: boolean };

export type DurableConcurrencyLease = {
  decision: LabAccessDecision;
  leaseId: string | null;
  durable: boolean;
};

export type DurableTrustStateOutcome =
  | { kind: "known"; tier: LabTrustTier; authenticated: boolean; active: boolean }
  | { kind: "unavailable"; authenticated: boolean };

let testClientFactory: ClientFactory | null = null;

export async function acquireDurableLabAccess(
  request: Request,
  operation: LabUsageOperation,
  context: LabAccessContext = {},
): Promise<DurableAccessOutcome> {
  return acquire(request, operation, context, false);
}

export async function acquireDurableLabConcurrency(
  request: Request,
  operation: LabUsageOperation,
  context: LabAccessContext,
): Promise<DurableAccessOutcome> {
  return acquire(request, operation, context, true);
}

export async function releaseDurableLabConcurrency(request: Request, leaseId: string): Promise<boolean> {
  if (!isLeaseId(leaseId) || !hasDurableIdentitySecret()) return false;
  const client = await resolveClient();
  if (!client) return false;
  try {
    const result = await client.rpc("release_lab_access", {
      p_lease_id: leaseId,
      p_guard_token: process.env.LAB_USAGE_GUARD_TOKEN?.trim() ?? "",
    });
    return !result.error && (result.data === true || readObject(result.data)?.released === true);
  } catch {
    return false;
  }
}

/**
 * Reads the current server-derived trust tier without reserving usage or a
 * concurrency lease. Upload routes use this only for an early policy preflight;
 * normal durable admission remains authoritative once trusted cost units exist.
 */
export async function readDurableLabTrustState(): Promise<DurableTrustStateOutcome> {
  const client = await resolveClient();
  if (!client || !hasDurableIdentitySecret()) return { kind: "unavailable", authenticated: false };

  let authenticated = false;
  try {
    const identity = await client.auth.getUser();
    if (identity.error) {
      return isAuthSessionMissingError(identity.error)
        ? { kind: "known", tier: "guest", authenticated: false, active: true }
        : { kind: "unavailable", authenticated: false };
    }
    if (identity.data.user && !isOneHumanAuthSubject(identity.data.user)) {
      return { kind: "known", tier: "guest", authenticated: false, active: true };
    }
    authenticated = Boolean(identity.data.user);
    if (!authenticated) return { kind: "known", tier: "guest", authenticated: false, active: true };

    const result = await client.rpc("read_my_lab_access_state", {});
    if (result.error) return { kind: "unavailable", authenticated: true };
    const row = readObject(Array.isArray(result.data) ? result.data[0] : result.data);
    if (!row || !isLabTrustTier(row.tier) || row.tier === "guest" || typeof row.status !== "string") {
      return { kind: "unavailable", authenticated: true };
    }
    return {
      kind: "known",
      tier: row.tier,
      authenticated: true,
      active: row.status === "active",
    };
  } catch {
    return { kind: "unavailable", authenticated };
  }
}

export function setLabAccessClientFactoryForTests(factory: ClientFactory | null): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Lab access test hooks are disabled in production.");
  }
  testClientFactory = factory;
}

function defaultClientFactory(): Promise<LabAccessRpcClient | null> {
  return getOneSupabaseServerClient() as unknown as Promise<LabAccessRpcClient | null>;
}

async function resolveClient(): Promise<LabAccessRpcClient | null> {
  return (testClientFactory ?? defaultClientFactory)();
}

async function acquire(
  request: Request,
  operation: LabUsageOperation,
  context: LabAccessContext,
  concurrencyOnly: boolean,
): Promise<DurableAccessOutcome> {
  const client = await resolveClient();
  if (!client || !hasDurableIdentitySecret()) return { kind: "unavailable", authenticated: false };

  let authenticated = false;
  try {
    const identity = await client.auth.getUser();
    if (identity.error && !isAuthSessionMissingError(identity.error)) {
      return { kind: "unavailable", authenticated: false };
    }
    if (identity.data.user && !isOneHumanAuthSubject(identity.data.user)) {
      return { kind: "unavailable", authenticated: false };
    }
    authenticated = Boolean(identity.data.user);

    const normalized = normalizeLabAccessContext(operation, context);
    const clientIdentity = deriveLabClientIdentity(request);
    const result = await client.rpc("acquire_lab_access", {
      p_operation: operation,
      p_provider_id: normalized.providerId ?? null,
      p_endpoint_id: normalized.endpointId ?? null,
      p_client_hash: clientIdentity.clientHash,
      p_session_hash: clientIdentity.sessionHash,
      // For ordinary admission this is consumed usage. For a concurrency-only
      // reservation it is metadata; realtime uses it as the bounded lease TTL.
      p_requested_units: normalized.units,
      p_minimum_tier: normalized.minimumTier,
      p_actor_intent: normalized.actorIntent,
      p_challenge_verified: normalized.challengeVerified,
      p_acquire_concurrency: concurrencyOnly,
      p_guard_token: process.env.LAB_USAGE_GUARD_TOKEN?.trim() ?? "",
    });
    if (result.error) return { kind: "unavailable", authenticated };
    const decision = parseDurableDecision(result.data, operation, authenticated ? "verified" : "guest");
    return decision ? { kind: "decision", decision, authenticated } : { kind: "unavailable", authenticated };
  } catch {
    return { kind: "unavailable", authenticated };
  }
}

export function parseDurableDecision(
  data: unknown,
  operation: LabUsageOperation,
  fallbackTier: LabTrustTier,
): LabAccessDecision | null {
  const row = readObject(Array.isArray(data) ? data[0] : data);
  if (!row || typeof row.allowed !== "boolean") return null;

  const tier = row.tier === "member" ? "verified" : isLabTrustTier(row.tier) ? row.tier : fallbackTier;
  const used = numberValue(row.used) ?? numberValue(row.daily_used) ?? 0;
  const allowance = numberValue(row.allowance) ?? numberValue(row.daily_allowance) ?? 0;
  const resetsAt = timestampValue(row.resets_at) ?? nextUtcDay();
  const daily = metricWindow(row.daily_used, row.daily_allowance);
  const monthly = metricWindow(row.monthly_used, row.monthly_allowance);
  const leaseId = typeof row.lease_id === "string" && isLeaseId(row.lease_id) ? row.lease_id : undefined;

  if (!row.allowed) {
    const code = reasonCode(row.reason);
    return {
      ...deniedLabAccess({
        tier,
        operation,
        used,
        allowance,
        resetsAt,
        code,
        message: denialMessage(code),
      }),
      ...(daily ? { daily } : {}),
      ...(monthly ? { monthly } : {}),
    };
  }

  return {
    allowed: true,
    tier,
    operation,
    used,
    allowance,
    remaining: Math.max(0, numberValue(row.remaining) ?? allowance - used),
    resetsAt,
    ...(daily ? { daily } : {}),
    ...(monthly ? { monthly } : {}),
    ...(leaseId ? { leaseId } : {}),
  };
}

function reasonCode(value: unknown): LabAccessDenialCode {
  switch (value) {
    case "tier_required":
    case "suspended":
    case "challenge_required":
    case "provider_budget_exhausted":
    case "concurrency_limit_reached":
    case "global_limit_reached":
    case "guest_limit_reached":
    case "member_limit_reached":
    case "provider_paused":
      return value;
    case "tier_insufficient":
      return "tier_required";
    case "burst_limit":
    case "burst_limit_reached":
      return "burst_limit_reached";
    case "daily_limit":
    case "daily_limit_reached":
      return "daily_limit_reached";
    case "monthly_limit":
    case "monthly_limit_reached":
      return "monthly_limit_reached";
    case "session_limit":
    case "session_limit_reached":
      return "session_limit_reached";
    case "client_limit":
    case "client_limit_reached":
      return "client_limit_reached";
    case "provider_budget":
      return "provider_budget_exhausted";
    case "concurrency_limit":
      return "concurrency_limit_reached";
    case "global_limit":
      return "global_limit_reached";
    case "live_paused":
    case "operation_disabled":
      return "live_lab_paused";
    default:
      return "quota_unavailable";
  }
}

function metricWindow(used: unknown, allowance: unknown): { used: number; allowance: number } | null {
  const normalizedUsed = numberValue(used);
  const normalizedAllowance = numberValue(allowance);
  return normalizedUsed === null || normalizedAllowance === null
    ? null
    : { used: normalizedUsed, allowance: normalizedAllowance };
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null;
}

function timestampValue(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : null;
}

function isLeaseId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function nextUtcDay(): string {
  const next = new Date();
  next.setUTCHours(24, 0, 0, 0);
  return next.toISOString();
}
