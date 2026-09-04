import type { AiReasoningClass } from "@/lib/ai/schemas";

export const DEFAULT_AI_MODELS = {
  FAST: "openai/gpt-5.6-luna",
  DEEP: "openai/gpt-5.6-sol",
} as const;

const MODEL_ID = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i;

function configuredModel(value: string | undefined, fallback: string) {
  const candidate = value?.trim();
  return candidate && MODEL_ID.test(candidate) ? candidate : fallback;
}

export function getAiModel(reasoningClass: AiReasoningClass) {
  return reasoningClass === "DEEP"
    ? configuredModel(process.env.LAB_AI_DEEP_MODEL, DEFAULT_AI_MODELS.DEEP)
    : configuredModel(process.env.LAB_AI_FAST_MODEL, DEFAULT_AI_MODELS.FAST);
}

export function isLabAiEnabled() {
  return process.env.LAB_AI_ENABLED?.trim().toLowerCase() === "true";
}
