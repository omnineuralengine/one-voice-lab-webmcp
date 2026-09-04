import "client-only";

import { aiReasoningResponseSchema, type AiReasoningRequest } from "@/lib/ai/schemas";

const SESSION_KEY = "one:applied-voice-ai-session:v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let memorySessionId = "";

export function getAnonymousAiSessionId() {
  try {
    const existing = window.localStorage.getItem(SESSION_KEY);
    if (existing && UUID.test(existing)) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    memorySessionId ||= crypto.randomUUID();
    return memorySessionId;
  }
}

export async function requestAppliedVoiceReasoning(request: AiReasoningRequest, signal?: AbortSignal) {
  const response = await fetch("/api/ai/reason", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Lab-AI-Session": getAnonymousAiSessionId(),
    },
    body: JSON.stringify(request),
    signal,
  });
  const value = await response.json() as unknown;
  const parsed = aiReasoningResponseSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  const message = readErrorMessage(value) ?? "AI reasoning is temporarily unavailable. The deterministic Lab remains available.";
  throw new Error(message);
}

export async function requestAiUsage(signal?: AbortSignal) {
  const response = await fetch("/api/ai/usage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Lab-AI-Session": getAnonymousAiSessionId(),
    },
    body: "{}",
    signal,
  });
  if (!response.ok) throw new Error("Usage metadata is unavailable for this session.");
  return response.json() as Promise<{
    schemaVersion: string;
    persistence: string;
    privacy: string;
    entries: Array<{
      timestamp: string;
      feature: string;
      reasoningClass: string;
      model: string;
      latencyMs: number;
      inputTokens: number | null;
      outputTokens: number | null;
      costUsd: number | null;
      success: boolean;
      fallbackUsed: boolean;
    }>;
  }>;
}

function readErrorMessage(value: unknown) {
  if (!value || typeof value !== "object" || !("error" in value)) return null;
  const error = (value as { error?: unknown }).error;
  if (!error || typeof error !== "object" || !("message" in error)) return null;
  return typeof (error as { message?: unknown }).message === "string" ? (error as { message: string }).message : null;
}
