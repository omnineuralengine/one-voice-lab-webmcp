import type { AiFeature, AiReasoningClass, AiUsageMetadata } from "@/lib/ai/schemas";
import { AI_LIMITS } from "@/lib/ai/reasoning-policy";

type SessionWindow = { interval: number[]; day: number[] };
type InternalUsageEntry = AiUsageMetadata & { sessionId: string };

const windows = new Map<string, SessionWindow>();
const entries: InternalUsageEntry[] = [];
const globalWindow: SessionWindow = { interval: [], day: [] };

export type AiQuotaResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export function consumeAiQuota(sessionId: string, now = Date.now()): AiQuotaResult {
  const current = windows.get(sessionId) ?? { interval: [], day: [] };
  current.interval = current.interval.filter((timestamp) => now - timestamp < AI_LIMITS.intervalMs);
  current.day = current.day.filter((timestamp) => now - timestamp < 24 * 60 * 60 * 1_000);
  globalWindow.interval = globalWindow.interval.filter((timestamp) => now - timestamp < AI_LIMITS.intervalMs);
  globalWindow.day = globalWindow.day.filter((timestamp) => now - timestamp < 24 * 60 * 60 * 1_000);

  if (current.interval.length >= AI_LIMITS.requestsPerInterval) {
    const retryAfterSeconds = Math.max(1, Math.ceil((AI_LIMITS.intervalMs - (now - current.interval[0])) / 1_000));
    windows.set(sessionId, current);
    return { allowed: false, retryAfterSeconds };
  }
  if (current.day.length >= AI_LIMITS.sessionRequestsPerDay) {
    const retryAfterSeconds = Math.max(1, Math.ceil((24 * 60 * 60 * 1_000 - (now - current.day[0])) / 1_000));
    windows.set(sessionId, current);
    return { allowed: false, retryAfterSeconds };
  }
  if (globalWindow.interval.length >= AI_LIMITS.globalRequestsPerInterval || globalWindow.day.length >= AI_LIMITS.globalRequestsPerDay) {
    const first = globalWindow.interval.length >= AI_LIMITS.globalRequestsPerInterval ? globalWindow.interval[0] : globalWindow.day[0];
    const windowMs = globalWindow.interval.length >= AI_LIMITS.globalRequestsPerInterval ? AI_LIMITS.intervalMs : 24 * 60 * 60 * 1_000;
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - first)) / 1_000)) };
  }

  current.interval.push(now);
  current.day.push(now);
  globalWindow.interval.push(now);
  globalWindow.day.push(now);
  windows.set(sessionId, current);
  return { allowed: true };
}

export function recordAiUsage(sessionId: string, usage: AiUsageMetadata) {
  entries.push({ ...usage, sessionId });
  if (entries.length > AI_LIMITS.usageEntriesGlobal) {
    entries.splice(0, entries.length - AI_LIMITS.usageEntriesGlobal);
  }
}

export function getAiUsageForSession(sessionId: string) {
  return entries
    .filter((entry) => entry.sessionId === sessionId)
    .slice(-AI_LIMITS.usageEntriesPerSession)
    .map((entry) => ({
      timestamp: entry.timestamp,
      feature: entry.feature,
      reasoningClass: entry.reasoningClass,
      model: entry.model,
      latencyMs: entry.latencyMs,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      costUsd: entry.costUsd,
      success: entry.success,
      fallbackUsed: entry.fallbackUsed,
    }));
}

export function createUsageMetadata(input: {
  feature: AiFeature;
  reasoningClass: AiReasoningClass;
  model: string;
  startedAt: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costUsd?: number | null;
  success: boolean;
  fallbackUsed?: boolean;
  now?: number;
}): AiUsageMetadata {
  const now = input.now ?? Date.now();
  return {
    timestamp: new Date(now).toISOString(),
    feature: input.feature,
    reasoningClass: input.reasoningClass,
    model: input.model,
    latencyMs: Math.max(0, now - input.startedAt),
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
    costUsd: input.costUsd ?? null,
    success: input.success,
    fallbackUsed: input.fallbackUsed ?? false,
  };
}

export function resetAiUsageForTests() {
  windows.clear();
  entries.splice(0, entries.length);
  globalWindow.interval.splice(0, globalWindow.interval.length);
  globalWindow.day.splice(0, globalWindow.day.length);
}
