import "server-only";

import { statusForDecision, type LabAccessDecision } from "@/lib/access/access-decision";
import { deriveLabClientIdentity } from "@/lib/access/client-identity";
import { acquireDurableLabConcurrency, releaseDurableLabConcurrency } from "@/lib/access/durable-access";
import type { LabUsageOperation } from "@/lib/access/trust-policy";
import { ProviderOperationError } from "@/lib/providers/errors";
import type { ProviderOperationName } from "@/lib/providers/operations";

type WindowState = { count: number; resetAt: number };

const WINDOW_MS = 60_000;
const MAX_WINDOW_ENTRIES = 500;
const LIMITS: Readonly<Record<ProviderOperationName, number>> = {
  models: 20,
  voices: 20,
  tts: 5,
  stt: 4,
};
const CLIENT_LIMITS: Readonly<Record<ProviderOperationName, number>> = {
  models: 60,
  voices: 60,
  tts: 10,
  stt: 8,
};
const INSTANCE_LIMITS: Readonly<Record<ProviderOperationName, number>> = {
  models: 240,
  voices: 240,
  tts: 50,
  stt: 32,
};
const windows = new Map<string, WindowState>();
const clientWindows = new Map<string, WindowState>();
const instanceWindows = new Map<string, WindowState>();
const active = new Set<string>();

export async function withProviderRequestGuard<T>(
  request: Request,
  providerId: string,
  operation: ProviderOperationName,
  task: () => Promise<T>,
): Promise<T> {
  const identity = deriveLabClientIdentity(request);
  const client = identity.clientHash;
  const session = identity.sessionHash;
  const key = `${client}:${session}:${providerId}:${operation}`;
  const now = Date.now();
  prune(now);
  recordAttempt(instanceWindows, `${providerId}:${operation}`, INSTANCE_LIMITS[operation], now, providerId, operation);
  recordAttempt(clientWindows, `${client}:${providerId}:${operation}`, CLIENT_LIMITS[operation], now, providerId, operation);
  recordAttempt(windows, key, LIMITS[operation], now, providerId, operation);

  if (active.has(key)) {
    throw new ProviderOperationError({
      code: "request_in_flight",
      message: "An identical provider operation is already in flight for this session.",
      status: 409,
      providerId,
      operation,
    });
  }

  active.add(key);
  let leaseId: string | null = null;
  try {
    const labOperation = paidLabOperation(operation);
    if (labOperation) {
      const durable = await acquireDurableLabConcurrency(request, labOperation, {
        providerId,
        endpointId: `provider:${operation}`,
        actorIntent: "human",
      });
      if (durable.kind === "unavailable") {
        if (process.env.NODE_ENV === "production") {
          throw new ProviderOperationError({
            code: "provider_access_unavailable",
            message: "Distributed provider concurrency protection is temporarily unavailable. No provider request was sent.",
            status: 503,
            providerId,
            operation,
          });
        }
      } else if (!durable.decision.allowed) {
        throw concurrencyError(providerId, operation, durable.decision);
      } else if (durable.decision.leaseId) {
        leaseId = durable.decision.leaseId;
      } else if (process.env.NODE_ENV === "production") {
        throw new ProviderOperationError({
          code: "provider_access_unavailable",
          message: "Distributed provider concurrency protection returned an invalid lease. No provider request was sent.",
          status: 503,
          providerId,
          operation,
        });
      }
    }
    return await task();
  } finally {
    if (leaseId) await releaseDurableLabConcurrency(request, leaseId);
    active.delete(key);
    prune(now);
  }
}

export function resetProviderRequestGuardForTests(): void {
  if (process.env.NODE_ENV !== "production") {
    windows.clear();
    clientWindows.clear();
    instanceWindows.clear();
    active.clear();
  }
}

function recordAttempt(
  store: Map<string, WindowState>,
  key: string,
  limit: number,
  now: number,
  providerId: string,
  operation: ProviderOperationName,
) {
  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    if (!store.has(key) && store.size >= MAX_WINDOW_ENTRIES) {
      throw rateLimitError(providerId, operation, "The provider request guard is at capacity. Wait a moment and try again.");
    }
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  current.count += 1;
  if (current.count > limit) {
    throw rateLimitError(providerId, operation, "This Lab operation reached its short in-memory request limit. Wait a moment and try again.");
  }
}

function rateLimitError(providerId: string, operation: ProviderOperationName, message: string) {
  return new ProviderOperationError({
    code: "provider_rate_limited",
    message,
    status: 429,
    providerId,
    operation,
  });
}

function concurrencyError(
  providerId: string,
  operation: ProviderOperationName,
  decision: LabAccessDecision,
) {
  return new ProviderOperationError({
    code: decision.code === "provider_budget_exhausted"
      ? "provider_budget_exhausted"
      : decision.code === "concurrency_limit_reached"
        ? "provider_concurrency_limited"
        : decision.code === "quota_unavailable" || decision.code === "live_lab_paused" || decision.code === "provider_paused"
          ? "provider_access_unavailable"
          : "provider_quota_exhausted",
    message: decision.message ?? "The distributed provider request boundary denied this operation.",
    status: statusForDecision(decision),
    providerId,
    operation,
  });
}

function paidLabOperation(operation: ProviderOperationName): LabUsageOperation | null {
  if (operation === "tts") return "speech_generation";
  if (operation === "stt") return "speech_transcription";
  return null;
}

function prune(now: number): void {
  for (const store of [windows, clientWindows, instanceWindows]) {
    for (const [key, value] of store) {
      if (value.resetAt <= now) store.delete(key);
    }
  }
}
