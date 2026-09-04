import "server-only";

import { z } from "zod";

import {
  DeepgramConfigError,
  DeepgramRequestError,
  DeepgramValidationError,
  generateSpeechAudio,
  transcribeAudioFile,
} from "@/lib/deepgram";
import { DeepgramNormalizationError, DEEPGRAM_NORMALIZED_MODELS, DEEPGRAM_NORMALIZED_VOICES } from "@/lib/providers/deepgram/normalization";
import { ProviderOperationError } from "@/lib/providers/errors";
import { OpenLabDeepgramDisabledError } from "@/lib/open-lab";
import type {
  ProviderModelListResult,
  ProviderNormalizedModelListResult,
  ProviderNormalizedVoiceListResult,
  ProviderSttRequest,
  ProviderSttResult,
  ProviderTtsExecutionContext,
  ProviderTtsRequest,
  ProviderTtsResult,
  ProviderVoiceListResult,
} from "@/lib/providers/types";
import type { TtsRequest } from "@/lib/types";

export const DEEPGRAM_ADAPTER_VERSION = "one-deepgram-core/2.0.0";
export const DEEPGRAM_MAX_STT_BYTES = 10 * 1024 * 1024;

const voiceDiscoveryInputSchema = z.object({
  pageSize: z.number().int().min(1).max(100),
  search: z.string().trim().max(80).optional(),
  nextPageToken: z.string().trim().regex(/^\d{1,4}$/).optional(),
  voiceIds: z.array(z.string().trim().min(1).max(100).regex(/^[a-z0-9._-]+$/)).max(100).optional(),
}).strict();

export async function listDeepgramStaticModels(): Promise<ProviderModelListResult> {
  return Object.freeze({
    provider: "deepgram",
    discoveryState: "static",
    models: Object.freeze(DEEPGRAM_NORMALIZED_MODELS.map((model) => Object.freeze({
      provider: "deepgram" as const,
      id: model.providerModelId,
      name: model.displayName,
      capabilities: Object.freeze({ textToSpeech: model.capabilities.includes("tts.batch") }),
      languages: Object.freeze(model.languages.map((language) => Object.freeze({ id: language }))),
    }))),
  });
}

export async function listNormalizedDeepgramStaticModels(): Promise<ProviderNormalizedModelListResult> {
  return Object.freeze({ providerId: "deepgram", state: "static", models: DEEPGRAM_NORMALIZED_MODELS });
}

export async function listDeepgramStaticVoices(
  input: Parameters<typeof listNormalizedDeepgramStaticVoices>[0],
): Promise<ProviderVoiceListResult> {
  const normalized = await listNormalizedDeepgramStaticVoices(input);
  return Object.freeze({
    provider: "deepgram",
    discoveryState: "static",
    voices: Object.freeze(normalized.voices.map((voice) => Object.freeze({
      provider: "deepgram" as const,
      id: voice.providerVoiceId,
      name: voice.displayName,
      labels: Object.freeze({}),
      previewAvailable: false,
    }))),
    hasMore: normalized.hasMore,
    ...(normalized.nextPageToken ? { nextPageToken: normalized.nextPageToken } : {}),
  });
}

export async function listNormalizedDeepgramStaticVoices(input: Readonly<{
  pageSize: number;
  search?: string;
  nextPageToken?: string;
  voiceIds?: readonly string[];
}>): Promise<ProviderNormalizedVoiceListResult> {
  const parsed = voiceDiscoveryInputSchema.safeParse(input);
  if (!parsed.success) throw operationError("invalid_request", "voices", "Use bounded Deepgram voice discovery parameters.", 400);
  const selectedIds = new Set(parsed.data.voiceIds ?? []);
  const search = parsed.data.search?.toLowerCase();
  const filtered = DEEPGRAM_NORMALIZED_VOICES.filter((voice) => (
    (!selectedIds.size || selectedIds.has(voice.providerVoiceId))
    && (!search || voice.displayName.toLowerCase().includes(search) || voice.providerVoiceId.includes(search))
  ));
  const offset = parsed.data.nextPageToken ? Number(parsed.data.nextPageToken) : 0;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > filtered.length) {
    throw operationError("invalid_request", "voices", "The Deepgram voice cursor is invalid or stale.", 400);
  }
  const end = Math.min(filtered.length, offset + parsed.data.pageSize);
  return Object.freeze({
    providerId: "deepgram",
    state: "static",
    voices: Object.freeze(filtered.slice(offset, end)),
    hasMore: end < filtered.length,
    ...(end < filtered.length ? { nextPageToken: String(end) } : {}),
  });
}

export async function generateCanonicalDeepgramSpeech(
  payload: ProviderTtsRequest,
  context: ProviderTtsExecutionContext = {},
): Promise<ProviderTtsResult> {
  try {
    return await generateSpeechAudio(payload as unknown as TtsRequest, context);
  } catch (error) {
    throw normalizeDeepgramOperationError(error, "tts");
  }
}

export async function transcribeCanonicalDeepgramAudio(
  payload: ProviderSttRequest,
  context: ProviderTtsExecutionContext = {},
): Promise<ProviderSttResult> {
  try {
    if (payload.file.size > DEEPGRAM_MAX_STT_BYTES) {
      throw operationError("input_too_large", "stt", "Deepgram audio uploads are limited to 10 MB in the canonical provider route.", 413);
    }
    const transcription = await transcribeAudioFile(payload.file, {
      model: payload.model,
      language: payload.language,
      smart_format: true,
      punctuate: true,
    }, context);
    const raw = transcription.raw as {
      metadata?: { request_id?: string; duration?: number; channels?: number };
      results?: { channels?: Array<{ detected_language?: string; alternatives?: Array<{ words?: unknown[] }> }> };
    };
    const channel = raw.results?.channels?.[0];
    const words = channel?.alternatives?.[0]?.words;
    return Object.freeze({
      provider: "deepgram",
      transcript: transcription.transcript,
      model: payload.model,
      ...(channel?.detected_language || payload.language ? { language: channel?.detected_language || payload.language } : {}),
      ...(raw.metadata?.request_id ? { requestId: raw.metadata.request_id } : {}),
      details: Object.freeze({
        channelCount: raw.metadata?.channels ?? raw.results?.channels?.length ?? 0,
        durationSeconds: raw.metadata?.duration,
        wordCount: Array.isArray(words) ? words.length : 0,
      }),
    });
  } catch (error) {
    throw normalizeDeepgramOperationError(error, "stt");
  }
}

function normalizeDeepgramOperationError(error: unknown, operation: "tts" | "stt"): ProviderOperationError {
  if (error instanceof ProviderOperationError) return error;
  if (error instanceof OpenLabDeepgramDisabledError) {
    return operationError(
      "provider_access_unavailable",
      operation,
      "Live Deepgram execution is disabled. No provider request was sent.",
      error.status,
    );
  }
  if (error instanceof DeepgramConfigError) {
    return operationError("provider_not_configured", operation, "Deepgram is not configured on this server.", 503);
  }
  if (error instanceof DeepgramNormalizationError) {
    return operationError("provider_malformed_response", operation, "Deepgram returned a response the Lab could not safely normalize.", 502);
  }
  if (error instanceof DeepgramValidationError) {
    const code = error.status === 413 ? "input_too_large" : error.status === 415 ? "unsupported_media_type" : "invalid_request";
    return operationError(code, operation, error.message, error.status);
  }
  if (error instanceof DeepgramRequestError) {
    const category = readCategory(error.details);
    const code = category === "quota_exhausted"
      ? "provider_quota_exhausted"
      : category === "invalid_request"
        ? "invalid_request"
      : error.status === 401
      ? "provider_unauthorized"
      : error.status === 403
        ? "provider_forbidden"
        : error.status === 429
          ? category === "quota_exhausted" ? "provider_quota_exhausted" : "provider_rate_limited"
          : error.status === 504 || category === "timeout"
            ? "provider_timeout"
            : category === "invalid_response"
              ? "provider_malformed_response"
              : "provider_failure";
    const message = code === "provider_unauthorized"
      ? "Deepgram rejected the server credential."
      : code === "provider_forbidden"
        ? "Deepgram denied this operation."
        : code === "invalid_request"
          ? "Deepgram rejected the bounded request."
        : code === "provider_rate_limited"
          ? "Deepgram rate limited this operation."
          : code === "provider_quota_exhausted"
            ? "Deepgram reported that provider quota is exhausted."
            : code === "provider_timeout"
              ? "The Deepgram request timed out. Try again explicitly."
              : code === "provider_malformed_response"
                ? "Deepgram returned a response the Lab could not safely normalize."
                : "The server could not complete the Deepgram operation.";
    const normalizedStatus = code === "provider_quota_exhausted"
      ? 429
      : code === "invalid_request"
        ? 400
      : error.status >= 400 && error.status <= 599 ? error.status : 502;
    return operationError(code, operation, message, normalizedStatus, error.status);
  }
  return operationError("provider_failure", operation, "The server could not complete the Deepgram operation.", 502);
}

function readCategory(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const category = (value as Record<string, unknown>).category;
  return typeof category === "string" ? category : undefined;
}

function operationError(
  code: ConstructorParameters<typeof ProviderOperationError>[0]["code"],
  operation: "models" | "voices" | "tts" | "stt",
  message: string,
  status: number,
  upstreamStatus?: number,
): ProviderOperationError {
  return new ProviderOperationError({
    code,
    operation,
    message,
    status,
    providerId: "deepgram",
    ...(upstreamStatus !== undefined ? { upstreamStatus } : {}),
  });
}
