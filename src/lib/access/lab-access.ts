import "server-only";

import { deniedLabAccess, labAccessResponse as createLabAccessResponse, statusForDecision } from "@/lib/access/access-decision";
import type { LabAccessDecision } from "@/lib/access/access-decision";
import { deriveLabClientIdentity } from "@/lib/access/client-identity";
import {
  acquireDurableLabAccess,
  acquireDurableLabConcurrency,
  readDurableLabTrustState,
  releaseDurableLabConcurrency,
} from "@/lib/access/durable-access";
import {
  LAB_OPERATION_POLICY,
  LAB_USAGE_OPERATIONS,
  meetsMinimumTier,
  type LabAccessContext,
  type LabTrustTier,
  type LabUsageOperation,
} from "@/lib/access/trust-policy";
import { ProviderOperationError } from "@/lib/providers/errors";
import { getProviderCatalogEntry } from "@/lib/providers/catalog";
import { evaluateProviderInvocationPolicy } from "@/lib/providers/provider-access-policy";
import { resolveProviderInvocationPolicy } from "@/lib/providers/policy-service";
import type { NormalizedProviderCapabilityId } from "@/lib/providers/platform-types";
import type { ProviderInvocationPolicy } from "@/lib/providers/policy-service";
import { isSameSiteRequest } from "@/lib/http/same-site-request";

export { LAB_USAGE_OPERATIONS };
export { createLabAccessResponse as labAccessResponse };
export type { LabAccessContext, LabAccessDecision, LabTrustTier, LabUsageOperation };
export type LabAccessTier = LabTrustTier;

export type LabConcurrencyReservation = {
  decision: LabAccessDecision;
  release: () => Promise<boolean>;
};

export type LabConcurrencyRun<T> =
  | { ok: true; value: T }
  | { ok: false; decision: LabAccessDecision };

type WindowState = { count: number; resetAt: number };

const FALLBACK_WINDOW_MS = 60 * 60 * 1_000;
const FALLBACK_GUEST_LIMITS: Readonly<Record<LabUsageOperation, number>> = {
  provider_catalog: 40,
  speech_generation: 4,
  speech_transcription: 3,
  realtime_session: 3,
  ai_reasoning: 4,
  deliverable_generation: 3,
  feedback_submission: 8,
  session_creation: 4,
};
const FALLBACK_VERIFIED_MULTIPLIER = 4;
const clientWindows = new Map<string, WindowState>();
const sessionWindows = new Map<string, WindowState>();

export async function checkLabAccess(
  request: Request,
  operation: LabUsageOperation,
  context: LabAccessContext = {},
): Promise<LabAccessDecision> {
  const prepared = await prepareLabAccess(request, operation, context);
  if (prepared.denial) return prepared.denial;
  const { effectiveContext, providerPolicy } = prepared;

  const durable = await acquireDurableLabAccess(request, operation, effectiveContext);
  if (durable.kind === "decision") {
    return applyProviderTrustPolicy(durable.decision, providerPolicy);
  }

  const durableRequired = effectiveContext.durableRequired ?? LAB_OPERATION_POLICY[operation].costBearing;
  if (process.env.NODE_ENV === "production" && durableRequired) {
    return deniedLabAccess({
      tier: durable.authenticated ? "verified" : "guest",
      operation,
      resetsAt: nextUtcDay(),
      code: "quota_unavailable",
    });
  }

  const fallbackTier: LabTrustTier = durable.authenticated ? "verified" : "guest";
  if (effectiveContext.minimumTier && !meetsMinimumTier(fallbackTier, effectiveContext.minimumTier)) {
    return deniedLabAccess({
      tier: fallbackTier,
      operation,
      resetsAt: nextHour(),
      code: "tier_required",
    });
  }
  return applyProviderTrustPolicy(
    consumeDevelopmentFallback(request, operation, fallbackTier),
    providerPolicy,
  );
}

/**
 * Rejects disabled, cross-origin, or globally paused provider uploads before a
 * route buffers or decodes media. It intentionally does not reserve quota;
 * the normal enforceProviderLabAccess call remains authoritative after the
 * server has established the trusted duration/cost unit.
 */
export async function precheckProviderLabAccess(
  request: Request,
  providerId: string,
  providerOperation: "models" | "voices" | "tts" | "stt",
): Promise<void> {
  const operation = usageOperationForProviderOperation(providerOperation);
  const prepared = await prepareLabAccess(request, operation, {
    providerId,
    providerCapabilityId: providerOperationCapability(providerOperation),
    endpointId: `provider:${providerOperation}:precheck`,
    actorIntent: "human",
  });
  if (prepared.denial) throwProviderAccessError(prepared.denial, providerId, providerOperation);

  const requiredTier = prepared.effectiveContext.minimumTier;
  if (requiredTier && process.env.NODE_ENV === "production") {
    const trust = await readDurableLabTrustState();
    if (trust.kind === "unavailable") {
      throwProviderAccessError(deniedLabAccess({
        tier: trust.authenticated ? "verified" : "guest",
        operation,
        resetsAt: nextHour(),
        code: "quota_unavailable",
      }), providerId, providerOperation);
    }
    if (!trust.active || !meetsMinimumTier(trust.tier, requiredTier)) {
      throwProviderAccessError(providerPolicyDenial(operation, trust.tier, "tier_required"), providerId, providerOperation);
    }
  }
}

export async function enforceProviderLabAccess(
  request: Request,
  providerId: string,
  providerOperation: "models" | "voices" | "tts" | "stt",
  context: LabAccessContext = {},
) {
  const operation = usageOperationForProviderOperation(providerOperation);
  const decision = await checkLabAccess(request, operation, {
    ...context,
    providerId,
    providerCapabilityId: providerOperationCapability(providerOperation),
    endpointId: context.endpointId ?? `provider:${providerOperation}`,
    actorIntent: context.actorIntent ?? "human",
  });
  if (decision.allowed) {
    return decision;
  }
  throwProviderAccessError(decision, providerId, providerOperation);
}

function throwProviderAccessError(
  decision: LabAccessDecision,
  providerId: string,
  providerOperation: "models" | "voices" | "tts" | "stt",
): never {
  const status = statusForDecision(decision);
  throw new ProviderOperationError({
    code: decision.code === "cross_origin"
      ? "provider_forbidden"
      : decision.code === "tier_required"
        ? "provider_forbidden"
      : decision.code === "provider_budget_exhausted"
        ? "provider_budget_exhausted"
        : decision.code === "quota_unavailable" || decision.code === "live_lab_paused" || decision.code === "provider_paused"
          ? "provider_access_unavailable"
          : "provider_quota_exhausted",
    message: decision.message ?? "This Lab operation is unavailable.",
    status,
    providerId,
    operation: providerOperation,
  });
}

function usageOperationForProviderOperation(
  providerOperation: "models" | "voices" | "tts" | "stt",
): LabUsageOperation {
  return providerOperation === "tts"
    ? "speech_generation"
    : providerOperation === "stt"
      ? "speech_transcription"
      : "provider_catalog";
}

type PreparedLabAccess = Readonly<{
  denial?: LabAccessDecision;
  effectiveContext: LabAccessContext;
  providerPolicy: ProviderInvocationPolicy | null;
}>;

async function prepareLabAccess(
  request: Request,
  operation: LabUsageOperation,
  context: LabAccessContext,
): Promise<PreparedLabAccess> {
  if (!isSameSiteRequest(request, { allowHostHeaderFallback: true })) {
    return {
      denial: deniedLabAccess({
        tier: "guest",
        operation,
        resetsAt: nextHour(),
        code: "cross_origin",
      }),
      effectiveContext: context,
      providerPolicy: null,
    };
  }

  if (LAB_OPERATION_POLICY[operation].costBearing
    && process.env.NODE_ENV === "production"
    && process.env.ONE_LIVE_LAB_ENABLED !== "true") {
    return {
      denial: deniedLabAccess({
        tier: "guest",
        operation,
        resetsAt: nextHour(),
        code: "live_lab_paused",
      }),
      effectiveContext: context,
      providerPolicy: null,
    };
  }

  const result = context.providerId && getProviderCatalogEntry(context.providerId)
    ? await resolveProviderInvocationPolicy(
      context.providerId,
      context.providerCapabilityId ?? providerCapabilityForUsageOperation(operation),
    )
    : null;
  if (result && !result.ok && process.env.NODE_ENV === "production") {
    return {
      denial: providerPolicyDenial(operation, "guest", "provider_paused"),
      effectiveContext: context,
      providerPolicy: null,
    };
  }

  const providerPolicy = result?.ok ? result.value : null;
  if (!providerPolicy) return { effectiveContext: context, providerPolicy: null };

  const preAdmission = evaluateProviderInvocationPolicy(providerPolicy);
  if (!preAdmission.allowed) {
    return {
      denial: providerPolicyDenial(operation, "guest", "provider_paused"),
      effectiveContext: context,
      providerPolicy,
    };
  }

  return {
    effectiveContext: preAdmission.requiredTier
      ? {
        ...context,
        minimumTier: stricterTier(context.minimumTier, preAdmission.requiredTier),
      }
      : context,
    providerPolicy,
  };
}

function providerOperationCapability(
  operation: "models" | "voices" | "tts" | "stt",
): NormalizedProviderCapabilityId {
  if (operation === "models") return "discovery.models";
  if (operation === "voices") return "discovery.voices";
  if (operation === "tts") return "tts.batch";
  return "stt.prerecorded";
}

function providerCapabilityForUsageOperation(operation: LabUsageOperation): NormalizedProviderCapabilityId {
  if (operation === "speech_generation") return "tts.batch";
  if (operation === "speech_transcription") return "stt.prerecorded";
  if (operation === "realtime_session" || operation === "session_creation") return "realtime.conversation";
  if (operation === "ai_reasoning") return "audio.provider-post-processing";
  return "discovery.models";
}

function stricterTier(current: LabTrustTier | undefined, required: LabTrustTier): LabTrustTier {
  if (!current) return required;
  return meetsMinimumTier(current, required) ? current : required;
}

function applyProviderTrustPolicy(
  decision: LabAccessDecision,
  policy: Parameters<typeof evaluateProviderInvocationPolicy>[0] | null,
): LabAccessDecision {
  if (!decision.allowed || !policy) return decision;
  const trusted = evaluateProviderInvocationPolicy(policy, decision.tier);
  return trusted.allowed
    ? decision
    : providerPolicyDenial(decision.operation ?? "provider_catalog", normalizeDecisionTier(decision.tier), "tier_required");
}

function providerPolicyDenial(
  operation: LabUsageOperation,
  tier: LabTrustTier,
  code: "provider_paused" | "tier_required",
): LabAccessDecision {
  return deniedLabAccess({
    tier,
    operation,
    resetsAt: nextHour(),
    code,
  });
}

function normalizeDecisionTier(tier: LabAccessDecision["tier"]): LabTrustTier {
  return tier === "member" ? "verified" : tier;
}

/**
 * Reserve one durable slot after the route has consumed its normal usage
 * admission. A realtime grant may intentionally keep this lease until expiry;
 * ordinary server work should use runWithLabConcurrency so finally releases it.
 */
export async function reserveLabConcurrencyLease(
  request: Request,
  operation: LabUsageOperation,
  context: LabAccessContext = {},
): Promise<LabConcurrencyReservation> {
  const durable = await acquireDurableLabConcurrency(request, operation, context);
  if (durable.kind === "decision") {
    if (durable.decision.allowed && process.env.NODE_ENV === "production" && !durable.decision.leaseId) {
      return unavailableConcurrency(operation, durable.authenticated);
    }
    return {
      decision: durable.decision,
      release: () => durable.decision.leaseId
        ? releaseDurableLabConcurrency(request, durable.decision.leaseId)
        : Promise.resolve(false),
    };
  }

  const fallbackTier: LabTrustTier = durable.authenticated ? "verified" : "guest";
  const durableRequired = context.durableRequired ?? LAB_OPERATION_POLICY[operation].costBearing;
  if (process.env.NODE_ENV === "production" && durableRequired) {
    return unavailableConcurrency(operation, durable.authenticated);
  }
  if (context.minimumTier && !meetsMinimumTier(fallbackTier, context.minimumTier)) {
    return {
      decision: deniedLabAccess({
        tier: fallbackTier,
        operation,
        resetsAt: nextHour(),
        code: "tier_required",
      }),
      release: () => Promise.resolve(false),
    };
  }
  return {
    decision: {
      allowed: true,
      tier: fallbackTier,
      operation,
      used: 0,
      allowance: 1,
      remaining: 1,
      resetsAt: nextHour(),
    },
    release: () => Promise.resolve(false),
  };
}

export async function runWithLabConcurrency<T>(
  request: Request,
  operation: LabUsageOperation,
  context: LabAccessContext,
  task: () => Promise<T>,
): Promise<LabConcurrencyRun<T>> {
  const reservation = await reserveLabConcurrencyLease(request, operation, context);
  if (!reservation.decision.allowed) return { ok: false, decision: reservation.decision };
  try {
    return { ok: true, value: await task() };
  } finally {
    await reservation.release();
  }
}

export function resetGuestLabAccessForTests(): void {
  if (process.env.NODE_ENV !== "production") {
    clientWindows.clear();
    sessionWindows.clear();
  }
}

/**
 * Keep production tier requirements explicit while preserving fixture/local
 * development workflows that do not have an authenticated Supabase session.
 */
export function minimumTierInProduction(tier: LabTrustTier): LabTrustTier {
  return process.env.NODE_ENV === "production" ? tier : "guest";
}

function consumeDevelopmentFallback(
  request: Request,
  operation: LabUsageOperation,
  tier: LabTrustTier,
): LabAccessDecision {
  const now = Date.now();
  pruneWindows(now);
  const identity = deriveLabClientIdentity(request);
  const allowance = FALLBACK_GUEST_LIMITS[operation]
    * (tier === "guest" ? 1 : FALLBACK_VERIFIED_MULTIPLIER);
  const client = consumeWindow(clientWindows, `${identity.clientHash}:${operation}`, allowance, now);
  const session = consumeWindow(sessionWindows, `${identity.sessionHash}:${operation}`, allowance, now);
  const limiting = client.count >= session.count ? client : session;
  const resetsAt = new Date(Math.min(client.resetAt, session.resetAt)).toISOString();

  if (client.count <= allowance && session.count <= allowance) {
    return {
      allowed: true,
      tier,
      operation,
      used: limiting.count,
      allowance,
      remaining: Math.max(0, allowance - limiting.count),
      resetsAt,
    };
  }
  return deniedLabAccess({
    tier,
    operation,
    used: limiting.count,
    allowance,
    resetsAt,
    code: identity.sessionPresent && session.count > allowance ? "session_limit_reached" : "client_limit_reached",
  });
}

function consumeWindow(
  store: Map<string, WindowState>,
  key: string,
  allowance: number,
  now: number,
): WindowState {
  const existing = store.get(key);
  const state = !existing || existing.resetAt <= now
    ? { count: 1, resetAt: now + FALLBACK_WINDOW_MS }
    : { count: Math.min(existing.count + 1, allowance + 1), resetAt: existing.resetAt };
  store.set(key, state);
  return state;
}

function nextHour(): string {
  return new Date(Date.now() + FALLBACK_WINDOW_MS).toISOString();
}

function nextUtcDay(): string {
  const next = new Date();
  next.setUTCHours(24, 0, 0, 0);
  return next.toISOString();
}

function unavailableConcurrency(
  operation: LabUsageOperation,
  authenticated: boolean,
): LabConcurrencyReservation {
  return {
    decision: deniedLabAccess({
      tier: authenticated ? "verified" : "guest",
      operation,
      resetsAt: nextUtcDay(),
      code: "quota_unavailable",
    }),
    release: () => Promise.resolve(false),
  };
}

function pruneWindows(now: number): void {
  for (const store of [clientWindows, sessionWindows]) {
    for (const [key, state] of store) {
      if (state.resetAt <= now || store.size > 1_000) store.delete(key);
    }
  }
}
