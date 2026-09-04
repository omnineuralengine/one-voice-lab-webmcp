import "server-only";

import { ProviderAdapterError, ProviderOperationError } from "@/lib/providers/errors";

export type ProviderOperationName = "models" | "voices" | "tts" | "stt";

export function providerOperationMeta(input: {
  provider: string;
  operation: ProviderOperationName;
  startedAt: number;
  success: boolean;
  status: number;
  requestId?: string;
  requestMode?: "static" | "live" | "cache-fresh" | "cache-stale" | "fixture" | "unavailable";
  executionDecision?: "allowed" | "denied" | "not-evaluated";
  providerRequestSent?: boolean;
}) {
  return Object.freeze({
    provider: input.provider,
    operation: input.operation,
    capabilityId: capabilityForOperation(input.operation),
    requestMode: input.requestMode ?? (input.success ? "live" : "unavailable"),
    executionDecision: input.executionDecision ?? (input.success ? "allowed" : "not-evaluated"),
    ...(input.providerRequestSent === undefined ? {} : { providerRequestSent: input.providerRequestSent }),
    success: input.success,
    category: statusCategory(input.status),
    status: input.status,
    durationMs: Math.max(0, Date.now() - input.startedAt),
    timestamp: new Date().toISOString(),
    correlationId: input.requestId ?? crypto.randomUUID(),
  });
}

export function providerErrorResponse(
  error: unknown,
  input: { provider: string; operation: ProviderOperationName; startedAt: number },
): Response {
  const normalized = normalizeProviderRouteError(error, input.provider, input.operation);
  const providerRequestSent = normalized.upstreamStatus !== undefined;
  const meta = providerOperationMeta({
    provider: input.provider,
    operation: input.operation,
    startedAt: input.startedAt,
    success: false,
    status: normalized.status,
    requestMode: providerRequestSent ? "live" : "unavailable",
    executionDecision: providerRequestSent
      ? "allowed"
      : isPolicyDenial(normalized.code) ? "denied" : "not-evaluated",
    ...(providerRequestSent
      ? { providerRequestSent: true }
      : isKnownPreDispatchFailure(normalized.code) ? { providerRequestSent: false } : {}),
  });

  return Response.json(
    {
      ok: false,
      error: {
        code: normalized.code,
        message: normalized.message,
        ...(normalized.upstreamStatus ? { upstreamStatus: normalized.upstreamStatus } : {}),
      },
      meta,
    },
    {
      status: normalized.status,
      headers: {
        "Cache-Control": "no-store",
        ...(normalized.status === 429 ? { "Retry-After": "60" } : {}),
      },
    },
  );
}

function normalizeProviderRouteError(
  error: unknown,
  providerId: string,
  operation: ProviderOperationName,
) {
  if (error instanceof ProviderOperationError || error instanceof ProviderAdapterError) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
      upstreamStatus: error instanceof ProviderOperationError ? error.upstreamStatus : undefined,
    };
  }

  return {
    code: "provider_failure",
    message: `${providerDisplayName(providerId)} ${operation} operation failed safely.`,
    status: 500,
    upstreamStatus: undefined,
  };
}

function capabilityForOperation(operation: ProviderOperationName): string {
  if (operation === "models") return "discovery.models";
  if (operation === "voices") return "discovery.voices";
  if (operation === "tts") return "tts.batch";
  return "stt.prerecorded";
}

function isPolicyDenial(code: string): boolean {
  return ["provider_access_unavailable", "provider_execution_disabled", "provider_demo_only", "provider_forbidden"]
    .includes(code);
}

function isKnownPreDispatchFailure(code: string): boolean {
  return [
    "provider_access_unavailable",
    "provider_execution_disabled",
    "provider_demo_only",
    "provider_not_configured",
    "provider_capability_unavailable",
    "provider_unknown",
    "invalid_request",
    "input_too_large",
    "unsupported_media_type",
  ].includes(code);
}

function providerDisplayName(providerId: string): string {
  if (providerId === "elevenlabs") return "ElevenLabs";
  if (providerId === "fish-audio") return "Fish Audio";
  if (providerId === "cartesia") return "Cartesia";
  if (providerId === "deepgram") return "Deepgram";
  return "The provider";
}

function statusCategory(status: number) {
  if (status >= 200 && status < 300) return "success";
  if (status === 429) return "rate-limited";
  if (status >= 400 && status < 500) return "request-failure";
  return "provider-or-server-failure";
}
