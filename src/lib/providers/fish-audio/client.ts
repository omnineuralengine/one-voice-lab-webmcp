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
import { ProviderOperationError } from "@/lib/providers/errors";
import { assertProviderExecutionAuthorized } from "@/lib/providers/execution-policy";
import {
  FISH_AUDIO_NORMALIZED_MODELS,
  FishAudioNormalizationError,
  normalizeFishAudioPublicVoicePage,
} from "@/lib/providers/fish-audio/normalization";
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

const API_BASE = "https://api.fish.audio";
const MAX_AUDIO_RESPONSE_BYTES = 16 * 1024 * 1024;
export const FISH_AUDIO_MAX_TTS_CHARACTERS = 1_000;
export const FISH_AUDIO_MAX_STT_BYTES = 10 * 1024 * 1024;
export const FISH_AUDIO_ASR_MODEL = "fish-audio-asr-v1";
// The first two identifiers are the current API-reference catalog. The final
// two remain accepted only for backward compatibility with existing saved Lab
// requests; they are intentionally absent from discovery and are not defaults.
export const FISH_AUDIO_TTS_MODELS = ["s2-pro", "s1", "s2.1-pro-free", "s2.1-pro"] as const;
export const FISH_AUDIO_TTS_OUTPUT_FORMATS = ["mp3", "pcm"] as const;

type FishAudioOperation = "models" | "voices" | "tts" | "stt";

const safeIdSchema = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9._-]+$/);
const voiceModelSchema = z.object({
  _id: safeIdSchema,
  title: z.string().trim().min(1).max(160),
  state: z.string().trim().max(40).optional(),
  visibility: z.enum(["public", "unlist", "private"]).optional(),
  description: z.string().trim().max(2_000).nullable().optional(),
  tags: z.array(z.string().trim().max(80)).max(50).optional(),
  languages: z.array(z.string().trim().max(80)).max(100).optional(),
}).passthrough();
const asrSchema = z.object({
  text: z.string(),
  duration: z.number().nonnegative().optional(),
  language_code: z.string().trim().max(32).nullable().optional(),
  language: z.string().trim().max(80).nullable().optional(),
  segments: z.array(z.object({
    text: z.string(),
    start: z.number().nonnegative(),
    end: z.number().nonnegative(),
  }).passthrough()).max(100_000).optional(),
}).passthrough();

const documentedModels: ProviderModelListResult = Object.freeze({
  provider: "fish-audio",
  models: Object.freeze([
    {
      provider: "fish-audio" as const,
      id: "s2-pro",
      name: "S2 Pro",
      description: "Fish Audio's documented S2 Pro TTS model header.",
      capabilities: Object.freeze({ textToSpeech: true }),
      languages: Object.freeze([]),
    },
    {
      provider: "fish-audio" as const,
      id: "s1",
      name: "S1",
      description: "Fish Audio's documented S1 TTS model header.",
      capabilities: Object.freeze({ textToSpeech: true }),
      languages: Object.freeze([]),
    },
  ]),
});

export function hasFishAudioApiKey(): boolean {
  return Boolean(readApiKey());
}

export async function listFishAudioModels(
  context: ProviderTtsExecutionContext = {},
): Promise<ProviderModelListResult> {
  throwIfProviderCancelled(context.signal);
  return documentedModels;
}

export async function listNormalizedFishAudioModels(
  context: ProviderTtsExecutionContext = {},
): Promise<ProviderNormalizedModelListResult> {
  throwIfProviderCancelled(context.signal);
  return Object.freeze({ providerId: "fish-audio", state: "static", models: FISH_AUDIO_NORMALIZED_MODELS });
}

export async function listFishAudioVoices(input: Readonly<{
  pageSize: number;
  search?: string;
  nextPageToken?: string;
  voiceIds?: readonly string[];
}>, context: ProviderTtsExecutionContext = {}): Promise<ProviderVoiceListResult> {
  const result = await listNormalizedFishAudioVoices(input, context);
  return Object.freeze({
    provider: "fish-audio",
    voices: Object.freeze(result.voices.map((voice) => ({
      provider: "fish-audio" as const,
      id: voice.providerVoiceId,
      name: voice.displayName,
      category: "public-voice-model",
      labels: Object.freeze({
        ...(voice.languages.length ? { languages: voice.languages.join(", ") } : {}),
      }),
      previewAvailable: false,
    }))),
    hasMore: result.hasMore,
    ...(result.nextPageToken ? { nextPageToken: result.nextPageToken } : {}),
  });
}

export async function listNormalizedFishAudioVoices(input: Readonly<{
  pageSize: number;
  search?: string;
  nextPageToken?: string;
  voiceIds?: readonly string[];
}>, context: ProviderTtsExecutionContext = {}): Promise<ProviderNormalizedVoiceListResult> {
  assertProviderExecutionAuthorized(context.authorization, "fish-audio", "voices");

  if (input.voiceIds?.length) {
    const items = (await Promise.all(input.voiceIds.slice(0, 10).map(async (id) => {
      const parsedId = safeIdSchema.safeParse(id);
      if (!parsedId.success) return null;
      const response = await fetchFishAudio(`/model/${encodeURIComponent(parsedId.data)}`, { method: "GET" }, "voices", 12_000, context.signal);
      const parsed = voiceModelSchema.safeParse(await readJson(response, "voices", context.signal));
      if (!parsed.success || parsed.data.visibility !== "public") return null;
      return parsed.data;
    }))).filter((voice): voice is z.infer<typeof voiceModelSchema> => voice !== null);
    const normalized = normalizeFishAudioPublicVoicePage({ items, has_more: false });
    return Object.freeze({ providerId: "fish-audio", state: "live", voices: normalized.voices, hasMore: false });
  }

  const pageNumber = parsePageToken(input.nextPageToken);
  const endpoint = new URL(`${API_BASE}/model`);
  endpoint.searchParams.set("page_size", String(Math.min(50, Math.max(1, input.pageSize))));
  endpoint.searchParams.set("page_number", String(pageNumber));
  endpoint.searchParams.set("sort_by", "score");
  if (input.search) endpoint.searchParams.set("title", input.search.slice(0, 80));

  const response = await fetchFishAudio(endpoint, { method: "GET" }, "voices", 12_000, context.signal);
  try {
    const normalized = normalizeFishAudioPublicVoicePage(await readJson(response, "voices", context.signal));
    return Object.freeze({
      providerId: "fish-audio",
      state: "live",
      voices: normalized.voices,
      hasMore: normalized.hasMore,
      ...(normalized.hasMore ? { nextPageToken: String(pageNumber + 1) } : {}),
    });
  } catch (error) {
    if (error instanceof FishAudioNormalizationError) throw malformed("voices");
    throw error;
  }
}

export async function generateFishAudioSpeech(
  payload: ProviderTtsRequest,
  context: ProviderTtsExecutionContext = {},
): Promise<ProviderTtsResult> {
  assertProviderExecutionAuthorized(context.authorization, "fish-audio", "tts");
  const text = payload.text?.trim();
  const model = z.enum(FISH_AUDIO_TTS_MODELS).safeParse(payload.model ?? "s2-pro");
  const voice = payload.voice ? safeIdSchema.safeParse(payload.voice) : null;
  const outputFormat = z.enum(FISH_AUDIO_TTS_OUTPUT_FORMATS).safeParse(payload.outputFormat ?? "mp3");

  if (!text) throw invalid("tts", "Enter text before generating audio.");
  if (text.length > FISH_AUDIO_MAX_TTS_CHARACTERS) {
    throw operationError("input_too_large", "tts", `Keep Fish Audio text under ${FISH_AUDIO_MAX_TTS_CHARACTERS.toLocaleString()} characters for this Lab.`, 413);
  }
  if (!model.success) throw invalid("tts", "Choose an allowlisted Fish Audio TTS model.");
  if (voice && !voice.success) throw invalid("tts", "Choose a valid public Fish Audio voice-model ID.");
  if (!outputFormat.success) throw invalid("tts", "Choose an allowlisted Fish Audio output format.");

  const standardizedPcm = outputFormat.data === "pcm";
  if (standardizedPcm && payload.sample_rate !== undefined && payload.sample_rate !== 24_000) {
    throw invalid("tts", "Standardized Fish Audio PCM uses a 24 kHz sample rate.");
  }

  if (voice?.success) {
    const selected = await listFishAudioVoices(
      { pageSize: 1, voiceIds: [voice.data] },
      { ...context, authorization: context.discoveryAuthorization },
    );
    if (!selected.voices.some((item) => item.id === voice.data)) {
      throw invalid("tts", "The selected Fish Audio voice is not available in the public voice catalog.");
    }
  }

  throwIfProviderCancelled(context.signal);
  const abortScope = createProviderAbortScope(context.signal, 45_000);
  try {
    const key = readApiKey();
    if (!key) throw operationError("provider_not_configured", "tts", "Fish Audio is not configured on this server.", 503);
    const requestStartedAt = monotonicNow();
    const requestTimestamp = new Date().toISOString();
    const response = await fetch(`${API_BASE}/v1/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: standardizedPcm ? "application/octet-stream" : "audio/mpeg",
        Authorization: `Bearer ${key}`,
        model: model.data,
      },
      body: JSON.stringify({
        text,
        ...(voice?.success ? { reference_id: voice.data } : {}),
        format: outputFormat.data,
        ...(standardizedPcm ? { sample_rate: 24_000 } : {}),
        normalize: true,
      }),
      cache: "no-store",
      signal: abortScope.signal,
    });
    if (!response.ok) throw await upstreamError(response, "tts", abortScope.signal);

    const upstreamContentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
    if (upstreamContentType && !upstreamContentType.startsWith("audio/") && upstreamContentType !== "application/octet-stream") {
      throw new ProviderAudioResponseError("Fish Audio returned a non-audio response.");
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

    return {
      audio: streamed.audio,
      contentType,
      model: model.data,
      ...(voice?.success ? { voice: voice.data } : {}),
      encoding: standardizedPcm ? "pcm_s16le" : "mp3",
      ...(standardizedPcm ? { container: "none", sampleRate: 24_000 } : {}),
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
      throw operationError("provider_timeout", "tts", "The Fish Audio request timed out. Try again explicitly.", 504);
    }
    if (error instanceof ProviderOperationError) throw error;
    if (error instanceof ProviderAudioResponseError) throw malformed("tts");
    throw operationError("provider_failure", "tts", "The server could not reach Fish Audio.", 502);
  } finally {
    abortScope.dispose();
  }
}

export async function transcribeFishAudio(
  payload: ProviderSttRequest,
  context: ProviderTtsExecutionContext = {},
): Promise<ProviderSttResult> {
  assertProviderExecutionAuthorized(context.authorization, "fish-audio", "stt");
  if (payload.model !== FISH_AUDIO_ASR_MODEL) {
    throw invalid("stt", "Choose the documented Fish Audio v1 ASR endpoint profile.");
  }

  const form = new FormData();
  form.set("audio", payload.file, payload.file.name);
  form.set("ignore_timestamps", "false");
  if (payload.language) form.set("language", payload.language);

  const response = await fetchFishAudio("/v1/asr", { method: "POST", body: form }, "stt", 45_000, context.signal);
  const parsed = asrSchema.safeParse(await readJson(response, "stt", context.signal));
  if (!parsed.success) throw malformed("stt");
  const requestId = safeHeader(response.headers, ["request-id", "x-request-id"]);
  const language = parsed.data.language_code ?? parsed.data.language ?? undefined;

  return {
    provider: "fish-audio",
    transcript: parsed.data.text,
    model: FISH_AUDIO_ASR_MODEL,
    ...(language ? { language } : {}),
    ...(requestId ? { requestId } : {}),
    details: Object.freeze({
      durationSeconds: parsed.data.duration,
      segmentCount: parsed.data.segments?.length ?? 0,
    }),
  };
}

async function fetchFishAudio(
  input: string | URL,
  init: RequestInit,
  operation: FishAudioOperation,
  timeoutMs: number,
  externalSignal?: AbortSignal,
) {
  const key = readApiKey();
  if (!key) throw operationError("provider_not_configured", operation, "Fish Audio is not configured on this server.", 503);
  throwIfProviderCancelled(externalSignal);
  const abortScope = createProviderAbortScope(externalSignal, timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetch(typeof input === "string" ? `${API_BASE}${input}` : input, {
        ...init,
        cache: "no-store",
        headers: { ...init.headers, Authorization: `Bearer ${key}` },
        signal: abortScope.signal,
      });
    } catch (error) {
      throwIfProviderCancelled(externalSignal);
      if (abortScope.didTimeout() || isProviderAbortError(error)) {
        throw operationError("provider_timeout", operation, "The Fish Audio request timed out. Try again explicitly.", 504);
      }
      throw operationError("provider_failure", operation, "The server could not reach Fish Audio.", 502);
    }
    if (!response.ok) throw await upstreamError(response, operation, abortScope.signal);
    return response;
  } finally {
    abortScope.dispose();
  }
}

async function upstreamError(
  response: Response,
  operation: FishAudioOperation,
  signal?: AbortSignal,
) {
  try {
    await readBoundedProviderText(response, {
      signal,
      maxBytes: MAX_PROVIDER_ERROR_RESPONSE_BYTES,
    });
  } catch {
    throwIfProviderCancelled(signal);
  }
  if ([400, 404, 422].includes(response.status)) return operationError("invalid_request", operation, "Fish Audio rejected the bounded request.", 400, response.status);
  if (response.status === 401) return operationError("provider_unauthorized", operation, "Fish Audio rejected the server credential.", 502, 401);
  if (response.status === 403) return operationError("provider_forbidden", operation, "Fish Audio denied this operation for the configured server credential.", 502, 403);
  if (response.status === 402) return operationError("provider_quota_exhausted", operation, "Fish Audio reported insufficient credits or quota.", 429, 402);
  if (response.status === 429) return operationError("provider_rate_limited", operation, "Fish Audio rate-limited the request. Wait and retry explicitly.", 429, 429);
  return operationError("provider_failure", operation, "Fish Audio could not complete the request.", 502, response.status);
}

async function readJson(response: Response, operation: "voices" | "stt", signal?: AbortSignal) {
  const abortScope = createProviderAbortScope(signal, operation === "stt" ? 45_000 : 12_000);
  try {
    return await readBoundedProviderJson(response, {
      signal: abortScope.signal,
      ...(operation === "stt" ? { maxBytes: MAX_PROVIDER_TRANSCRIPT_RESPONSE_BYTES } : {}),
    });
  } catch (error) {
    throwIfProviderCancelled(signal);
    if (abortScope.didTimeout() || isProviderAbortError(error)) {
      throw operationError("provider_timeout", operation, "The Fish Audio response body timed out. Try again explicitly.", 504);
    }
    if (error instanceof ProviderOperationError) throw error;
    throw malformed(operation);
  } finally {
    abortScope.dispose();
  }
}

function parsePageToken(value: string | undefined): number {
  if (!value) return 1;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10_000) {
    throw operationError("invalid_request", "voices", "Use the bounded Fish Audio page token returned by this Lab.", 400);
  }
  return parsed;
}

function malformed(operation: FishAudioOperation) {
  return operationError("provider_malformed_response", operation, "Fish Audio returned a response the Lab could not safely normalize.", 502);
}

function invalid(operation: "tts" | "stt", message: string) {
  return operationError("invalid_request", operation, message, 400);
}

function operationError(
  code: ConstructorParameters<typeof ProviderOperationError>[0]["code"],
  operation: FishAudioOperation,
  message: string,
  status: number,
  upstreamStatus?: number,
) {
  return new ProviderOperationError({ code, operation, message, status, providerId: "fish-audio", upstreamStatus });
}

function readApiKey(): string | null {
  return readServerCredential("FISH_AUDIO_API_KEY");
}

function safeHeader(headers: Headers, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = headers.get(name)?.trim();
    if (value && /^[A-Za-z0-9._:-]{1,160}$/.test(value)) return value;
  }
  return undefined;
}
