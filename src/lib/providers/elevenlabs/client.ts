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
  ElevenLabsNormalizationError,
  normalizeElevenLabsModels,
  normalizeElevenLabsVoicePage,
} from "@/lib/providers/elevenlabs/normalization";
import { ProviderOperationError } from "@/lib/providers/errors";
import { assertProviderExecutionAuthorized } from "@/lib/providers/execution-policy";
import { readServerCredential } from "@/lib/providers/server-credential";
import {
  MAX_PROVIDER_ERROR_RESPONSE_BYTES,
  MAX_PROVIDER_TRANSCRIPT_RESPONSE_BYTES,
  readBoundedProviderJson,
  readBoundedProviderText,
} from "@/lib/providers/upstream-response";
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

const API_BASE = "https://api.elevenlabs.io";
const CATALOG_TTL_MS = 30_000;
const MAX_VOICE_CACHE_ENTRIES = 100;
const MAX_AUDIO_RESPONSE_BYTES = 16 * 1024 * 1024;
export const ELEVENLABS_MAX_TTS_CHARACTERS = 1_000;
export const ELEVENLABS_MAX_STT_BYTES = 10 * 1024 * 1024;
export const ELEVENLABS_TTS_OUTPUT_FORMATS = [
  "mp3_44100_128",
  "mp3_44100_64",
  "mp3_22050_32",
  "pcm_24000",
] as const;
export const ELEVENLABS_STT_MODELS = ["scribe_v2", "scribe_v1"] as const;

type ElevenLabsOperation = "models" | "voices" | "tts" | "stt";

const safeIdSchema = z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9._-]+$/);
const voiceInputSchema = z.object({
  pageSize: z.number().int().min(1).max(100),
  search: z.string().trim().max(80).optional(),
  nextPageToken: z.string().trim().max(1_024).optional(),
  voiceIds: z.array(safeIdSchema).max(100).optional(),
}).strict();
const transcriptSchema = z.object({
  text: z.string(),
  language_code: z.string().max(32).nullable().optional(),
  language_probability: z.number().min(0).max(1).nullable().optional(),
  words: z.array(z.object({
    speaker_id: z.string().max(80).nullable().optional(),
  }).passthrough()).max(250_000).optional(),
}).passthrough();

type NormalizedModelCache = Readonly<{
  expiresAt: number;
  models: ProviderNormalizedModelListResult["models"];
}>;
type NormalizedVoiceCache = Readonly<{
  expiresAt: number;
  voices: ProviderNormalizedVoiceListResult["voices"];
  hasMore: boolean;
  nextPageToken?: string;
}>;

let modelsCache: NormalizedModelCache | null = null;
const voicesCache = new Map<string, NormalizedVoiceCache>();

export function hasElevenLabsApiKey(): boolean {
  return Boolean(readApiKey());
}

/** Compatibility projection over the canonical account-scoped model boundary. */
export async function listElevenLabsModels(
  context: ProviderTtsExecutionContext = {},
): Promise<ProviderModelListResult> {
  const normalized = await listNormalizedElevenLabsModels(context);
  return Object.freeze({
    provider: "elevenlabs",
    discoveryState: normalized.state,
    models: Object.freeze(normalized.models.map((model) => Object.freeze({
      provider: "elevenlabs" as const,
      id: model.providerModelId,
      name: model.displayName,
      capabilities: Object.freeze({ textToSpeech: true }),
      languages: Object.freeze(model.languages.map((language) => Object.freeze({ id: language }))),
    }))),
  });
}

export async function listNormalizedElevenLabsModels(
  context: ProviderTtsExecutionContext = {},
): Promise<ProviderNormalizedModelListResult> {
  assertOperationReady(context, "models");
  const now = Date.now();
  if (modelsCache && modelsCache.expiresAt > now) {
    return Object.freeze({ providerId: "elevenlabs", state: "cache-fresh", models: modelsCache.models });
  }

  const response = await fetchElevenLabs("/v1/models", { method: "GET" }, "models", 12_000, context.signal);
  try {
    const normalized = normalizeElevenLabsModels(await readJson(response, "models", context.signal));
    modelsCache = Object.freeze({ expiresAt: now + CATALOG_TTL_MS, models: normalized.models });
    return Object.freeze({ providerId: "elevenlabs", state: "live", models: normalized.models });
  } catch (error) {
    if (error instanceof ElevenLabsNormalizationError) throw malformed("models");
    throw error;
  }
}

/** Compatibility projection that intentionally omits account, preview, sample, label, and author metadata. */
export async function listElevenLabsVoices(input: Readonly<{
  pageSize: number;
  search?: string;
  nextPageToken?: string;
  voiceIds?: readonly string[];
}>, context: ProviderTtsExecutionContext = {}): Promise<ProviderVoiceListResult> {
  const normalized = await listNormalizedElevenLabsVoices(input, context);
  return Object.freeze({
    provider: "elevenlabs",
    discoveryState: normalized.state,
    voices: Object.freeze(normalized.voices.map((voice) => Object.freeze({
      provider: "elevenlabs" as const,
      id: voice.providerVoiceId,
      name: voice.displayName,
      labels: Object.freeze({}),
      previewAvailable: false,
    }))),
    hasMore: normalized.hasMore,
    ...(normalized.nextPageToken ? { nextPageToken: normalized.nextPageToken } : {}),
  });
}

export async function listNormalizedElevenLabsVoices(input: Readonly<{
  pageSize: number;
  search?: string;
  nextPageToken?: string;
  voiceIds?: readonly string[];
}>, context: ProviderTtsExecutionContext = {}): Promise<ProviderNormalizedVoiceListResult> {
  assertOperationReady(context, "voices");
  const parsedInput = voiceInputSchema.safeParse(input);
  if (!parsedInput.success) throw invalidDiscovery("voices", "Use bounded ElevenLabs voice discovery parameters.");

  const endpoint = new URL(`${API_BASE}/v2/voices`);
  endpoint.searchParams.set("page_size", String(parsedInput.data.pageSize));
  endpoint.searchParams.set("include_total_count", "false");
  endpoint.searchParams.set("sort", "name");
  endpoint.searchParams.set("sort_direction", "asc");
  if (parsedInput.data.search) endpoint.searchParams.set("search", parsedInput.data.search);
  if (parsedInput.data.nextPageToken) endpoint.searchParams.set("next_page_token", parsedInput.data.nextPageToken);
  for (const voiceId of parsedInput.data.voiceIds ?? []) endpoint.searchParams.append("voice_ids", voiceId);

  const cacheKey = endpoint.search;
  const now = Date.now();
  const cached = voicesCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return Object.freeze({
      providerId: "elevenlabs",
      state: "cache-fresh",
      voices: cached.voices,
      hasMore: cached.hasMore,
      ...(cached.nextPageToken ? { nextPageToken: cached.nextPageToken } : {}),
    });
  }

  const response = await fetchElevenLabs(endpoint, { method: "GET" }, "voices", 12_000, context.signal);
  try {
    const normalized = normalizeElevenLabsVoicePage(await readJson(response, "voices", context.signal), []);
    pruneVoiceCache(now);
    if (!voicesCache.has(cacheKey) && voicesCache.size >= MAX_VOICE_CACHE_ENTRIES) {
      const oldestKey = voicesCache.keys().next().value;
      if (oldestKey) voicesCache.delete(oldestKey);
    }
    voicesCache.set(cacheKey, Object.freeze({
      expiresAt: now + CATALOG_TTL_MS,
      voices: normalized.voices,
      hasMore: normalized.hasMore,
      ...(normalized.nextPageToken ? { nextPageToken: normalized.nextPageToken } : {}),
    }));
    return Object.freeze({
      providerId: "elevenlabs",
      state: "live",
      voices: normalized.voices,
      hasMore: normalized.hasMore,
      ...(normalized.nextPageToken ? { nextPageToken: normalized.nextPageToken } : {}),
    });
  } catch (error) {
    if (error instanceof ElevenLabsNormalizationError) throw malformed("voices");
    throw error;
  }
}

export async function generateElevenLabsSpeech(
  payload: ProviderTtsRequest,
  context: ProviderTtsExecutionContext = {},
): Promise<ProviderTtsResult> {
  assertOperationReady(context, "tts");
  const text = payload.text?.trim();
  const voice = safeIdSchema.safeParse(payload.voice);
  const model = safeIdSchema.safeParse(payload.model);
  const outputFormat = z.enum(ELEVENLABS_TTS_OUTPUT_FORMATS).safeParse(payload.outputFormat ?? "mp3_44100_128");

  if (!text) throw invalid("tts", "Enter text before generating audio.");
  if (text.length > ELEVENLABS_MAX_TTS_CHARACTERS) {
    throw operationError("input_too_large", "tts", `Keep ElevenLabs text under ${ELEVENLABS_MAX_TTS_CHARACTERS.toLocaleString()} characters for this Lab.`, 413);
  }
  if (!voice.success) throw invalid("tts", "Choose a voice returned by the ElevenLabs voice catalog.");
  if (!model.success) throw invalid("tts", "Choose a model returned by the ElevenLabs model catalog.");
  if (!outputFormat.success) throw invalid("tts", "Choose an allowlisted browser-safe ElevenLabs output format.");

  // Composite operations prove every credential-backed sub-operation before
  // any parallel discovery begins. Proofs are provider/operation specific.
  assertProviderExecutionAuthorized(context.modelDiscoveryAuthorization, "elevenlabs", "models");
  assertProviderExecutionAuthorized(context.discoveryAuthorization, "elevenlabs", "voices");

  const [models, voices] = await Promise.all([
    listNormalizedElevenLabsModels({ ...context, authorization: context.modelDiscoveryAuthorization }),
    listNormalizedElevenLabsVoices(
      { pageSize: 1, voiceIds: [voice.data] },
      { ...context, authorization: context.discoveryAuthorization },
    ),
  ]);
  const selectedModel = models.models.find((item) => item.providerModelId === model.data);
  if (!selectedModel || !selectedModel.capabilities.includes("tts.batch")) {
    throw invalid("tts", "The selected ElevenLabs model is unavailable or does not declare Text to Speech support.");
  }
  if (!voices.voices.some((item) => item.providerVoiceId === voice.data)) {
    throw invalid("tts", "The selected ElevenLabs voice is not available to this server credential.");
  }

  const standardizedPcm = outputFormat.data === "pcm_24000";
  const endpoint = new URL(`${API_BASE}/v1/text-to-speech/${encodeURIComponent(voice.data)}${standardizedPcm ? "/stream" : ""}`);
  endpoint.searchParams.set("output_format", outputFormat.data);
  throwIfProviderCancelled(context.signal);
  const abortScope = createProviderAbortScope(context.signal, 35_000);
  try {
    const key = readApiKey();
    if (!key) throw operationError("provider_not_configured", "tts", "ElevenLabs is not configured on this server.", 503);
    const requestStartedAt = monotonicNow();
    const requestTimestamp = new Date().toISOString();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: standardizedPcm ? "application/octet-stream" : "audio/mpeg",
        "xi-api-key": key,
      },
      body: JSON.stringify({ text, model_id: model.data }),
      cache: "no-store",
      signal: abortScope.signal,
    });
    if (!response.ok) throw await upstreamError(response, "tts", abortScope.signal);

    const upstreamContentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
    if (upstreamContentType && !upstreamContentType.startsWith("audio/") && upstreamContentType !== "application/octet-stream") {
      throw new ProviderAudioResponseError("ElevenLabs returned a non-audio response.");
    }
    const streamed = await readTimedAudioResponse(response, {
      requestStartedAt,
      requestTimestamp,
      signal: abortScope.signal,
      maxBytes: Math.min(context.maxAudioBytes ?? MAX_AUDIO_RESPONSE_BYTES, MAX_AUDIO_RESPONSE_BYTES),
      requireEvenByteLength: standardizedPcm,
    });
    const contentType = upstreamContentType.startsWith("audio/")
      ? upstreamContentType
      : standardizedPcm ? "audio/pcm" : "audio/mpeg";
    const requestId = safeHeader(response.headers, ["request-id", "x-request-id"]);
    const characterCost = safeHeader(response.headers, ["character-cost"]);

    return {
      audio: streamed.audio,
      contentType,
      model: model.data,
      voice: voice.data,
      encoding: standardizedPcm ? "pcm_s16le" : "mp3",
      ...(standardizedPcm ? { container: "none", sampleRate: 24_000 } : {}),
      outputFormat: outputFormat.data,
      requestId,
      responseHeaders: {
        "content-type": upstreamContentType || contentType,
        ...(requestId ? { "request-id": requestId } : {}),
        ...(characterCost ? { "character-cost": characterCost } : {}),
      },
      timing: streamed.timing,
    };
  } catch (error) {
    throwIfProviderCancelled(context.signal);
    if (abortScope.didTimeout() || isProviderAbortError(error)) {
      throw operationError("provider_timeout", "tts", "The ElevenLabs request timed out. Try again explicitly.", 504);
    }
    if (error instanceof ProviderOperationError) throw error;
    if (error instanceof ProviderAudioResponseError) throw malformed("tts");
    throw operationError("provider_failure", "tts", "The server could not reach ElevenLabs.", 502);
  } finally {
    abortScope.dispose();
  }
}

export async function transcribeElevenLabsAudio(
  payload: ProviderSttRequest,
  context: ProviderTtsExecutionContext = {},
): Promise<ProviderSttResult> {
  assertOperationReady(context, "stt");
  if (!ELEVENLABS_STT_MODELS.includes(payload.model as (typeof ELEVENLABS_STT_MODELS)[number])) {
    throw invalid("stt", "Choose an allowlisted ElevenLabs Scribe model.");
  }

  const form = new FormData();
  form.set("file", payload.file, payload.file.name);
  form.set("model_id", payload.model);
  form.set("tag_audio_events", "true");
  form.set("timestamps_granularity", "word");
  if (payload.language) form.set("language_code", payload.language);

  const response = await fetchElevenLabs("/v1/speech-to-text", { method: "POST", body: form }, "stt", 40_000, context.signal);
  const parsed = transcriptSchema.safeParse(await readJson(response, "stt", context.signal));
  if (!parsed.success) throw malformed("stt");
  const speakers = new Set((parsed.data.words ?? []).map((word) => word.speaker_id).filter(Boolean));
  const requestId = safeHeader(response.headers, ["request-id", "x-request-id"]);

  return {
    provider: "elevenlabs",
    transcript: parsed.data.text,
    model: payload.model,
    ...(parsed.data.language_code ? { language: parsed.data.language_code } : {}),
    ...(requestId ? { requestId } : {}),
    details: Object.freeze({
      detectedLanguage: parsed.data.language_code ?? undefined,
      languageProbability: parsed.data.language_probability ?? undefined,
      wordCount: parsed.data.words?.length ?? 0,
      speakerCount: speakers.size || undefined,
    }),
  };
}

export function resetElevenLabsCachesForTests(): void {
  if (process.env.NODE_ENV !== "production") {
    modelsCache = null;
    voicesCache.clear();
  }
}

function pruneVoiceCache(now: number): void {
  for (const [key, value] of voicesCache) {
    if (value.expiresAt <= now) voicesCache.delete(key);
  }
}

function assertOperationReady(context: ProviderTtsExecutionContext, operation: ElevenLabsOperation): void {
  assertProviderExecutionAuthorized(context.authorization, "elevenlabs", operation);
  if (!readApiKey()) {
    throw operationError(
      "provider_not_configured",
      operation,
      "ElevenLabs is not configured on this server. Educational surfaces remain available.",
      503,
    );
  }
}

async function fetchElevenLabs(
  input: string | URL,
  init: RequestInit,
  operation: ElevenLabsOperation,
  timeoutMs: number,
  externalSignal?: AbortSignal,
) {
  const key = readApiKey();
  if (!key) throw operationError("provider_not_configured", operation, "ElevenLabs is not configured on this server.", 503);
  throwIfProviderCancelled(externalSignal);
  const abortScope = createProviderAbortScope(externalSignal, timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetch(typeof input === "string" ? `${API_BASE}${input}` : input, {
        ...init,
        cache: "no-store",
        headers: { ...init.headers, "xi-api-key": key },
        signal: abortScope.signal,
      });
    } catch (error) {
      throwIfProviderCancelled(externalSignal);
      if (abortScope.didTimeout() || isProviderAbortError(error)) {
        throw operationError("provider_timeout", operation, "The ElevenLabs request timed out. Try again explicitly.", 504);
      }
      throw operationError("provider_failure", operation, "The server could not reach ElevenLabs.", 502);
    }
    if (!response.ok) throw await upstreamError(response, operation, abortScope.signal);
    return response;
  } finally {
    abortScope.dispose();
  }
}

async function upstreamError(
  response: Response,
  operation: ElevenLabsOperation,
  signal?: AbortSignal,
) {
  let hint = "";
  try {
    hint = (await readBoundedProviderText(response, {
      signal,
      maxBytes: MAX_PROVIDER_ERROR_RESPONSE_BYTES,
    })).toLowerCase();
  } catch {
    throwIfProviderCancelled(signal);
  }
  if ([400, 404, 422].includes(response.status)) {
    return operationError("invalid_request", operation, "ElevenLabs rejected the bounded request.", 400, response.status);
  }
  if (response.status === 401) return operationError("provider_unauthorized", operation, "ElevenLabs rejected the server credential.", 502, 401);
  if (response.status === 403) return operationError("provider_forbidden", operation, "ElevenLabs denied this operation for the configured server credential.", 502, 403);
  if (response.status === 402) return operationError("provider_quota_exhausted", operation, "ElevenLabs reported insufficient credits or quota.", 429, 402);
  if (response.status === 429) {
    const quota = /quota|credit|balance/.test(hint);
    return operationError(
      quota ? "provider_quota_exhausted" : "provider_rate_limited",
      operation,
      quota ? "ElevenLabs reported insufficient credits or quota." : "ElevenLabs rate-limited the request. Wait and retry explicitly.",
      429,
      429,
    );
  }
  return operationError("provider_failure", operation, "ElevenLabs could not complete the request.", 502, response.status);
}

async function readJson(
  response: Response,
  operation: "models" | "voices" | "stt",
  signal?: AbortSignal,
) {
  const abortScope = createProviderAbortScope(signal, operation === "stt" ? 40_000 : 12_000);
  try {
    return await readBoundedProviderJson(response, {
      signal: abortScope.signal,
      ...(operation === "stt" ? { maxBytes: MAX_PROVIDER_TRANSCRIPT_RESPONSE_BYTES } : {}),
    });
  } catch (error) {
    throwIfProviderCancelled(signal);
    if (abortScope.didTimeout() || isProviderAbortError(error)) {
      throw operationError("provider_timeout", operation, "The ElevenLabs response body timed out. Try again explicitly.", 504);
    }
    if (error instanceof ProviderOperationError) throw error;
    throw malformed(operation);
  } finally {
    abortScope.dispose();
  }
}

function malformed(operation: ElevenLabsOperation) {
  return operationError("provider_malformed_response", operation, "ElevenLabs returned a response the Lab could not safely normalize.", 502);
}

function invalid(operation: "tts" | "stt", message: string) {
  return operationError("invalid_request", operation, message, 400);
}

function invalidDiscovery(operation: "models" | "voices", message: string) {
  return operationError("invalid_request", operation, message, 400);
}

function operationError(
  code: ConstructorParameters<typeof ProviderOperationError>[0]["code"],
  operation: ElevenLabsOperation,
  message: string,
  status: number,
  upstreamStatus?: number,
) {
  return new ProviderOperationError({ code, operation, message, status, providerId: "elevenlabs", upstreamStatus });
}

function readApiKey(): string | null {
  return readServerCredential("ELEVENLABS_API_KEY");
}

function safeHeader(headers: Headers, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = headers.get(name)?.trim();
    if (value && /^[A-Za-z0-9._:-]{1,160}$/.test(value)) return value;
  }
  return undefined;
}
