import "server-only";

import { z } from "zod";

import {
  createProviderAbortScope,
  isProviderAbortError,
  monotonicNow,
  ProviderAudioResponseError,
  readTimedAudioResponse,
  throwIfProviderCancelled,
} from "@/lib/providers/audio-response";
import {
  CARTESIA_NORMALIZED_MODELS,
  CartesiaNormalizationError,
  normalizeCartesiaVoicePage,
} from "@/lib/providers/cartesia/normalization";
import { ProviderOperationError } from "@/lib/providers/errors";
import { assertProviderExecutionAuthorized } from "@/lib/providers/execution-policy";
import { readServerCredential } from "@/lib/providers/server-credential";
import {
  MAX_PROVIDER_ERROR_RESPONSE_BYTES,
  readBoundedProviderJson,
  readBoundedProviderText,
} from "@/lib/providers/upstream-response";
import type {
  ProviderModelListResult,
  ProviderNormalizedModelListResult,
  ProviderNormalizedVoiceListResult,
  ProviderTtsExecutionContext,
  ProviderTtsRequest,
  ProviderTtsResult,
  ProviderVoiceListResult,
} from "@/lib/providers/types";

const API_BASE = "https://api.cartesia.ai";
export const CARTESIA_API_VERSION = "2026-08-14";
export const CARTESIA_MAX_TTS_CHARACTERS = 1_000;
export const CARTESIA_TTS_MODELS = ["sonic-3.5", "sonic-3"] as const;
export const CARTESIA_TTS_OUTPUT_FORMATS = ["raw"] as const;

type CartesiaOperation = "models" | "voices" | "tts";

const safeIdSchema = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9._-]+$/);
const voiceDiscoveryInputSchema = z.object({
  pageSize: z.number().int().min(1).max(100),
  search: z.string().trim().max(160).optional(),
  nextPageToken: safeIdSchema.optional(),
  voiceIds: z.array(safeIdSchema).max(10).optional(),
}).strict();

export function hasCartesiaApiKey(): boolean {
  return Boolean(readApiKey());
}

export async function listCartesiaModels(
  context: ProviderTtsExecutionContext = {},
): Promise<ProviderModelListResult> {
  const normalized = await listNormalizedCartesiaModels(context);
  return Object.freeze({
    provider: "cartesia",
    discoveryState: normalized.state,
    models: Object.freeze(normalized.models.map((model) => Object.freeze({
      provider: "cartesia" as const,
      id: model.providerModelId,
      name: model.displayName,
      capabilities: Object.freeze({ textToSpeech: model.capabilities.includes("tts.batch") }),
      languages: Object.freeze(model.languages.map((language) => Object.freeze({ id: language }))),
    }))),
  });
}

export async function listNormalizedCartesiaModels(
  context: ProviderTtsExecutionContext = {},
): Promise<ProviderNormalizedModelListResult> {
  throwIfProviderCancelled(context.signal);
  return Object.freeze({ providerId: "cartesia", state: "static", models: CARTESIA_NORMALIZED_MODELS });
}

export async function listCartesiaVoices(input: Readonly<{
  pageSize: number;
  search?: string;
  nextPageToken?: string;
  voiceIds?: readonly string[];
}>, context: ProviderTtsExecutionContext = {}): Promise<ProviderVoiceListResult> {
  const normalized = await listNormalizedCartesiaVoices(input, context);
  return Object.freeze({
    provider: "cartesia",
    discoveryState: normalized.state,
    voices: Object.freeze(normalized.voices.map((voice) => Object.freeze({
      provider: "cartesia" as const,
      id: voice.providerVoiceId,
      name: voice.displayName,
      labels: Object.freeze({
        ...(voice.languages.length ? { languages: voice.languages.join(",") } : {}),
      }),
      previewAvailable: false,
    }))),
    hasMore: normalized.hasMore,
    ...(normalized.nextPageToken ? { nextPageToken: normalized.nextPageToken } : {}),
  });
}

export async function listNormalizedCartesiaVoices(input: Readonly<{
  pageSize: number;
  search?: string;
  nextPageToken?: string;
  voiceIds?: readonly string[];
}>, context: ProviderTtsExecutionContext = {}): Promise<ProviderNormalizedVoiceListResult> {
  const parsedInput = voiceDiscoveryInputSchema.safeParse(input);
  if (!parsedInput.success) throw invalidDiscovery("Use bounded Cartesia voice discovery parameters.");
  assertOperationReady(context, "voices");

  if (parsedInput.data.voiceIds?.length) {
    const candidates = await Promise.all(parsedInput.data.voiceIds.map(async (id) => {
      const result = await requestVoicePage({ pageSize: 10, search: id }, context.signal);
      return result.voices.find((voice) => voice.providerVoiceId === id) ?? null;
    }));
    const voices = candidates.filter((voice): voice is NonNullable<(typeof candidates)[number]> => voice !== null);
    return Object.freeze({ providerId: "cartesia", state: "live", voices: Object.freeze(voices), hasMore: false });
  }

  return requestVoicePage(parsedInput.data, context.signal);
}

export async function generateCartesiaSpeech(
  payload: ProviderTtsRequest,
  context: ProviderTtsExecutionContext = {},
): Promise<ProviderTtsResult> {
  const text = payload.text?.trim();
  const model = z.enum(CARTESIA_TTS_MODELS).safeParse(payload.model ?? "sonic-3.5");
  const voice = safeIdSchema.safeParse(payload.voice);
  const outputFormat = z.enum(CARTESIA_TTS_OUTPUT_FORMATS).safeParse(payload.outputFormat ?? "raw");

  if (!text) throw invalid("Enter text before generating audio.");
  if (text.length > CARTESIA_MAX_TTS_CHARACTERS) {
    throw operationError("input_too_large", "tts", `Keep Cartesia text under ${CARTESIA_MAX_TTS_CHARACTERS.toLocaleString()} characters for this Lab.`, 413);
  }
  if (!model.success) throw invalid("Choose sonic-3.5 or sonic-3 for this adapter version.");
  if (!voice.success) throw invalid("Choose a voice returned by the Cartesia voice catalog.");
  if (!outputFormat.success) throw invalid("Cartesia standardized comparison output uses the raw container.");
  if (payload.sample_rate !== undefined && payload.sample_rate !== 24_000) {
    throw invalid("Cartesia standardized PCM uses a 24 kHz sample rate.");
  }
  if (payload.encoding !== undefined && !["pcm_s16le", "linear16"].includes(payload.encoding)) {
    throw invalid("Cartesia standardized output uses signed 16-bit little-endian PCM.");
  }
  if (payload.container !== undefined && !["raw", "none"].includes(payload.container)) {
    throw invalid("Cartesia standardized output uses an unwrapped raw container.");
  }

  assertOperationAuthorized(context, "tts");
  assertProviderExecutionAuthorized(context.discoveryAuthorization, "cartesia", "voices");
  assertOperationConfigured("tts");
  throwIfProviderCancelled(context.signal);
  const selectedVoices = await listNormalizedCartesiaVoices(
    { pageSize: 10, voiceIds: [voice.data] },
    { ...context, authorization: context.discoveryAuthorization },
  );
  if (!selectedVoices.voices.some((item) => item.providerVoiceId === voice.data)) {
    throw invalid("The selected Cartesia voice is not available to this server credential.");
  }

  const abortScope = createProviderAbortScope(context.signal, 35_000);
  try {
    const key = readApiKey();
    if (!key) throw operationError("provider_not_configured", "tts", "Cartesia is not configured on this server.", 503);
    const requestStartedAt = monotonicNow();
    const requestTimestamp = new Date().toISOString();
    const response = await fetch(`${API_BASE}/tts/bytes`, {
      method: "POST",
      headers: cartesiaHeaders(key, {
        Accept: "application/octet-stream",
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        model_id: model.data,
        transcript: text,
        voice: { id: voice.data },
        output_format: {
          container: "raw",
          encoding: "pcm_s16le",
          sample_rate: 24_000,
        },
      }),
      cache: "no-store",
      signal: abortScope.signal,
    });
    if (!response.ok) throw await upstreamError(response, "tts", abortScope.signal);

    const upstreamContentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
    if (upstreamContentType && !upstreamContentType.startsWith("audio/") && upstreamContentType !== "application/octet-stream") {
      throw new ProviderAudioResponseError("Cartesia returned a non-audio response.");
    }
    const streamed = await readTimedAudioResponse(response, {
      requestStartedAt,
      requestTimestamp,
      signal: abortScope.signal,
      maxBytes: context.maxAudioBytes,
      requireEvenByteLength: true,
    });
    const contentType = upstreamContentType.startsWith("audio/") ? upstreamContentType : "audio/pcm";
    const requestId = safeHeader(response.headers, ["request-id", "x-request-id"]);

    return {
      audio: streamed.audio,
      contentType,
      model: model.data,
      voice: voice.data,
      encoding: "pcm_s16le",
      container: "raw",
      sampleRate: 24_000,
      outputFormat: outputFormat.data,
      requestId,
      responseHeaders: {
        "content-type": upstreamContentType || contentType,
        ...(requestId ? { "request-id": requestId } : {}),
      },
      timing: streamed.timing,
    };
  } catch (error) {
    throwIfProviderCancelled(context.signal);
    if (abortScope.didTimeout() || isProviderAbortError(error)) {
      throw operationError("provider_timeout", "tts", "The Cartesia request timed out. Try again explicitly.", 504);
    }
    if (error instanceof ProviderOperationError) throw error;
    if (error instanceof ProviderAudioResponseError) throw malformed("tts");
    throw operationError("provider_failure", "tts", "The server could not reach Cartesia.", 502);
  } finally {
    abortScope.dispose();
  }
}

async function requestVoicePage(
  input: Readonly<{ pageSize: number; search?: string; nextPageToken?: string }>,
  externalSignal?: AbortSignal,
): Promise<ProviderNormalizedVoiceListResult> {
  const endpoint = new URL(`${API_BASE}/voices`);
  endpoint.searchParams.set("limit", String(Math.min(100, Math.max(1, input.pageSize))));
  if (input.search) endpoint.searchParams.set("q", input.search.slice(0, 160));
  if (input.nextPageToken) endpoint.searchParams.set("starting_after", input.nextPageToken);

  const response = await fetchCartesia(endpoint, { method: "GET" }, "voices", 12_000, externalSignal);
  try {
    const normalized = normalizeCartesiaVoicePage(await readJson(response, externalSignal));
    return Object.freeze({
      providerId: "cartesia",
      state: "live",
      voices: normalized.voices,
      hasMore: normalized.hasMore,
      ...(normalized.nextPageToken ? { nextPageToken: normalized.nextPageToken } : {}),
    });
  } catch (error) {
    if (error instanceof CartesiaNormalizationError) throw malformed("voices");
    throw error;
  }
}

function assertOperationReady(context: ProviderTtsExecutionContext, operation: "voices" | "tts"): void {
  assertOperationAuthorized(context, operation);
  assertOperationConfigured(operation);
}

function assertOperationAuthorized(context: ProviderTtsExecutionContext, operation: "voices" | "tts"): void {
  assertProviderExecutionAuthorized(context.authorization, "cartesia", operation);
}

function assertOperationConfigured(operation: "voices" | "tts"): void {
  if (!readApiKey()) {
    throw operationError(
      "provider_not_configured",
      operation,
      "Cartesia is not configured on this server. Educational surfaces remain available.",
      503,
    );
  }
}

async function fetchCartesia(
  input: string | URL,
  init: RequestInit,
  operation: CartesiaOperation,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<Response> {
  const key = readApiKey();
  if (!key) throw operationError("provider_not_configured", operation, "Cartesia is not configured on this server.", 503);
  throwIfProviderCancelled(externalSignal);
  const abortScope = createProviderAbortScope(externalSignal, timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetch(typeof input === "string" ? `${API_BASE}${input}` : input, {
        ...init,
        cache: "no-store",
        headers: cartesiaHeaders(key, init.headers),
        signal: abortScope.signal,
      });
    } catch (error) {
      throwIfProviderCancelled(externalSignal);
      if (abortScope.didTimeout() || isProviderAbortError(error)) {
        throw operationError("provider_timeout", operation, "The Cartesia request timed out. Try again explicitly.", 504);
      }
      throw operationError("provider_failure", operation, "The server could not reach Cartesia.", 502);
    }
    if (!response.ok) throw await upstreamError(response, operation, abortScope.signal);
    return response;
  } finally {
    abortScope.dispose();
  }
}

async function upstreamError(
  response: Response,
  operation: CartesiaOperation,
  signal?: AbortSignal,
): Promise<ProviderOperationError> {
  try {
    await readBoundedProviderText(response, {
      signal,
      maxBytes: MAX_PROVIDER_ERROR_RESPONSE_BYTES,
    });
  } catch {
    throwIfProviderCancelled(signal);
  }
  if ([400, 404, 422].includes(response.status)) {
    return operationError("invalid_request", operation, "Cartesia rejected the bounded request.", 400, response.status);
  }
  if (response.status === 401) return operationError("provider_unauthorized", operation, "Cartesia rejected the server credential.", 502, 401);
  if (response.status === 403) return operationError("provider_forbidden", operation, "Cartesia denied this operation for the configured server credential.", 502, 403);
  if (response.status === 402) return operationError("provider_quota_exhausted", operation, "Cartesia reported insufficient credits or quota.", 429, 402);
  if (response.status === 429) return operationError("provider_rate_limited", operation, "Cartesia rate-limited the request. Wait and retry explicitly.", 429, 429);
  return operationError("provider_failure", operation, "Cartesia could not complete the request.", 502, response.status);
}

async function readJson(response: Response, signal?: AbortSignal): Promise<unknown> {
  const abortScope = createProviderAbortScope(signal, 12_000);
  try {
    return await readBoundedProviderJson(response, { signal: abortScope.signal });
  } catch (error) {
    throwIfProviderCancelled(signal);
    if (abortScope.didTimeout() || isProviderAbortError(error)) {
      throw operationError("provider_timeout", "voices", "The Cartesia response body timed out. Try again explicitly.", 504);
    }
    if (error instanceof ProviderOperationError) throw error;
    throw malformed("voices");
  } finally {
    abortScope.dispose();
  }
}

function cartesiaHeaders(key: string, init?: HeadersInit): Headers {
  const headers = new Headers(init);
  headers.set("Authorization", `Bearer ${key}`);
  headers.set("Cartesia-Version", CARTESIA_API_VERSION);
  return headers;
}

function malformed(operation: CartesiaOperation): ProviderOperationError {
  return operationError("provider_malformed_response", operation, "Cartesia returned a response the Lab could not safely normalize.", 502);
}

function invalid(message: string): ProviderOperationError {
  return operationError("invalid_request", "tts", message, 400);
}

function invalidDiscovery(message: string): ProviderOperationError {
  return operationError("invalid_request", "voices", message, 400);
}

function operationError(
  code: ConstructorParameters<typeof ProviderOperationError>[0]["code"],
  operation: CartesiaOperation,
  message: string,
  status: number,
  upstreamStatus?: number,
): ProviderOperationError {
  return new ProviderOperationError({ code, operation, message, status, providerId: "cartesia", upstreamStatus });
}

function readApiKey(): string | null {
  return readServerCredential("CARTESIA_API_KEY");
}

function safeHeader(headers: Headers, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = headers.get(name)?.trim();
    if (value && /^[A-Za-z0-9._:-]{1,160}$/.test(value)) return value;
  }
  return undefined;
}
