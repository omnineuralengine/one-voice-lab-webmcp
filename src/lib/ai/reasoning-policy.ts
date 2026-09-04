import type { AiFeature, AiReasoningClass } from "@/lib/ai/schemas";

export const AI_LIMITS = {
  requestBytes: 24_000,
  requestsPerInterval: 6,
  intervalMs: 10 * 60 * 1_000,
  sessionRequestsPerDay: 30,
  globalRequestsPerInterval: 60,
  globalRequestsPerDay: 500,
  fastOutputTokens: 1_600,
  deepOutputTokens: 3_500,
  fastTimeoutMs: 20_000,
  deepTimeoutMs: 45_000,
  usageEntriesPerSession: 50,
  usageEntriesGlobal: 500,
} as const;

const DEEP_FEATURES = new Set<AiFeature>([
  "second-opinion",
  "architecture-red-team",
  "poc-generator",
]);

export function resolveReasoningClass(
  feature: AiFeature,
  requested?: AiReasoningClass,
): AiReasoningClass {
  if (DEEP_FEATURES.has(feature)) return "DEEP";
  return requested === "DEEP" && feature === "copilot" ? "DEEP" : "FAST";
}

export function outputTokenLimit(reasoningClass: AiReasoningClass) {
  return reasoningClass === "DEEP" ? AI_LIMITS.deepOutputTokens : AI_LIMITS.fastOutputTokens;
}

export function timeoutMs(reasoningClass: AiReasoningClass) {
  return reasoningClass === "DEEP" ? AI_LIMITS.deepTimeoutMs : AI_LIMITS.fastTimeoutMs;
}
