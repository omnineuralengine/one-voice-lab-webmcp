import "server-only";

import { audioUploadLimit, validateAudioFile } from "@/lib/audio-file-policy";
import {
  isDeepgramNova3LanguageCode,
  type DeepgramNova3LanguageCode,
} from "@/lib/deepgram-languages";
import type {
  DeepgramErrorResponse,
  TemporaryTokenResponse,
  TranscribeUrlRequest,
  TranscriptionOptions,
  TranscriptionRequestOptions,
  TranscriptionResponse,
  TtsRequest,
} from "@/lib/types";
import { parseRedactionValues, serializeRedactionValues } from "@/lib/redaction";
import {
  DeepgramModelPolicyError,
  isAuraTtsModel,
  isDeepgramSttModel,
  parseAuraTtsFormat,
} from "@/lib/deepgram-model-policy";
import {
  DeepgramPrerecordedPolicyError,
  normalizePrerecordedAudioUrl,
  resolvePrerecordedUploadPolicy,
} from "@/lib/deepgram-prerecorded-policy";
import { sanitizeForBrowser } from "@/lib/deepgram-request-policy";
import { PublicProviderUrlError } from "@/lib/public-provider-url";
import {
  createProviderAbortScope,
  isProviderAbortError,
  monotonicNow,
  ProviderAudioResponseError,
  readTimedAudioResponse,
  throwIfProviderCancelled,
} from "@/lib/providers/audio-response";
import { assertProviderExecutionAuthorized } from "@/lib/providers/execution-policy";
import {
  DeepgramNormalizationError,
  normalizeDeepgramTranscriptionResponse,
} from "@/lib/providers/deepgram/normalization";
import {
  MAX_PROVIDER_ERROR_RESPONSE_BYTES,
  MAX_PROVIDER_TRANSCRIPT_RESPONSE_BYTES,
  ProviderResponseBodyError,
  readBoundedProviderJson,
  readBoundedProviderText,
} from "@/lib/providers/upstream-response";
import type {
  ProviderTtsExecutionContext,
  ProviderTtsResult,
} from "@/lib/providers/types";
import {
  assertOpenLabDeepgramEnabled,
  OpenLabDeepgramDisabledError,
} from "@/lib/open-lab";

const DEEPGRAM_API_BASE = "https://api.deepgram.com/v1";
const DEFAULT_TRANSCRIPTION_MODEL = "nova-3";
const DEFAULT_LANGUAGE: DeepgramNova3LanguageCode = "en";
const DEFAULT_TTS_MODEL = "aura-2-thalia-en";
const DEFAULT_TOKEN_TTL_SECONDS = 60;
const MAX_TEMPORARY_TOKEN_RESPONSE_BYTES = 32 * 1024;
const MAX_TTS_CHARS = 2_000;
const MAX_OBSERVATORY_TTS_CHARS = 500;
const MAX_OBSERVATORY_UPLOAD_BYTES = 64 * 1024 * 1024;
const MAX_TEXT_INTELLIGENCE_CHARS = 100_000;

export type TextIntelligenceFeatureOptions = {
  summarize?: boolean;
  topics?: boolean;
  intents?: boolean;
  sentiment?: boolean;
};

export type TextIntelligenceRequest = TextIntelligenceFeatureOptions & {
  text: string;
  language?: string;
  features?: TextIntelligenceFeatureOptions;
  options?: TextIntelligenceFeatureOptions;
};

export type NormalizedTextIntelligenceOptions = {
  summarize: boolean;
  topics: boolean;
  intents: boolean;
  sentiment: boolean;
};

export type TextIntelligenceResponse = {
  metadata?: {
    request_id?: string;
    [key: string]: unknown;
  };
  results?: Record<string, unknown>;
  [key: string]: unknown;
};

export type TextIntelligenceResult = {
  raw: TextIntelligenceResponse;
  endpoint: string;
  options: NormalizedTextIntelligenceOptions;
  textLength: number;
  language: string;
};

export class DeepgramConfigError extends Error {
  status = 500;

  constructor(message = "DEEPGRAM_API_KEY is missing. Add it to .env.local and restart the dev server.") {
    super(message);
    this.name = "DeepgramConfigError";
  }
}

export class DeepgramValidationError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "DeepgramValidationError";
  }
}

export class DeepgramRequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = "DeepgramRequestError";
  }
}

export async function transcribeAudioUrl(
  payload: TranscribeUrlRequest,
  context: ProviderTtsExecutionContext = {},
): Promise<TranscriptionResponse> {
  assertProviderExecutionAuthorized(context.authorization, "deepgram", "stt");
  throwIfProviderCancelled(context.signal);
  const apiKey = requireDeepgramApiKey();
  const options = normalizeTranscriptionOptions(payload);
  const audioUrl = normalizeTranscriptionAudioUrl(payload.url);
  const endpoint = buildListenEndpoint(options);

  const normalized = normalizeDeepgramTranscript(await fetchDeepgramJson(endpoint, {
    method: "POST",
    headers: {
      ...authorizationHeaders(apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: audioUrl }),
    signal: context.signal,
  }));

  return {
    ok: true,
    transcript: normalized.transcript,
    raw: normalized.raw,
    request: {
      ...options,
      source: "url",
      url: audioUrl,
    },
  };
}

export async function transcribeAudioFile(
  file: File,
  payload: TranscriptionRequestOptions,
  context: ProviderTtsExecutionContext = {},
): Promise<TranscriptionResponse> {
  assertProviderExecutionAuthorized(context.authorization, "deepgram", "stt");
  throwIfProviderCancelled(context.signal);
  const validation = await validateTranscriptionAudioFile(file, payload);
  throwIfProviderCancelled(context.signal);
  const apiKey = requireDeepgramApiKey();
  const options = normalizeTranscriptionOptions(payload);
  const endpoint = buildListenEndpoint(options);
  const body = await file.arrayBuffer();
  const headers: Record<string, string> = {
    ...authorizationHeaders(apiKey),
    "Content-Type": validation.mimeType,
  };

  const normalized = normalizeDeepgramTranscript(await fetchDeepgramJson(endpoint, {
    method: "POST",
    headers,
    body,
    signal: context.signal,
  }));

  return {
    ok: true,
    transcript: normalized.transcript,
    raw: normalized.raw,
    request: {
      ...options,
      source: "file",
      filename: file.name,
      fileType: validation.mimeType,
      fileSize: file.size,
    },
  };
}

export async function validateTranscriptionAudioFile(
  file: File,
  payload: TranscriptionRequestOptions,
) {
  if (!file || file.size === 0) {
    throw new DeepgramValidationError("Choose a non-empty audio file before transcribing.");
  }

  const observatory = coerceBoolean(payload.observatory, false);
  const uploadPolicy = resolvePrerecordedUploadPolicy(audioUploadLimit("local"));
  const maxBytes = observatory ? Math.min(MAX_OBSERVATORY_UPLOAD_BYTES, uploadPolicy.maxBytes) : uploadPolicy.maxBytes;
  if (file.size > maxBytes) {
    throw new DeepgramValidationError(`File is too large for this ${uploadPolicy.mode === "hosted" ? "hosted" : observatory ? "Observatory" : "learning lab"} request. Try an audio file under ${Math.round(maxBytes / 1024 / 1024)} MB.`, 413);
  }
  const validation = await validateAudioFile(file, { mode: uploadPolicy.mode });
  if (!validation.ok) {
    throw new DeepgramValidationError(validation.message, validation.code === "too-large" ? 413 : 400);
  }
  return validation;
}

export async function generateSpeechAudio(
  payload: TtsRequest,
  context: ProviderTtsExecutionContext = {},
): Promise<ProviderTtsResult> {
  assertProviderExecutionAuthorized(context.authorization, "deepgram", "tts");
  const text = payload.text?.trim();

  if (!text) {
    throw new DeepgramValidationError("Enter text before generating audio.");
  }

  const maxChars = payload.observatory ? MAX_OBSERVATORY_TTS_CHARS : MAX_TTS_CHARS;
  if (text.length > maxChars) {
    throw new DeepgramValidationError(`Keep text under ${maxChars.toLocaleString()} characters for this demo.`);
  }

  const model = payload.model || DEFAULT_TTS_MODEL;
  if (!isAuraTtsModel(model)) throw new DeepgramValidationError("Choose an Aura voice from the implemented registry.");
  let format: ReturnType<typeof parseAuraTtsFormat>;
  try {
    format = parseAuraTtsFormat({ encoding: payload.encoding, container: payload.container, sampleRate: payload.sample_rate });
  } catch (error) {
    if (error instanceof DeepgramModelPolicyError) throw new DeepgramValidationError(error.message);
    throw error;
  }
  const { encoding, container, sampleRate } = format;
  const endpoint = new URL(`${DEEPGRAM_API_BASE}/speak`);
  endpoint.searchParams.set("model", model);
  endpoint.searchParams.set("encoding", encoding);
  if (container) endpoint.searchParams.set("container", container);
  if (sampleRate) endpoint.searchParams.set("sample_rate", String(sampleRate));

  throwIfProviderCancelled(context.signal);
  const apiKey = requireDeepgramApiKey();
  const abortScope = createProviderAbortScope(context.signal, 30_000);

  try {
    const requestStartedAt = monotonicNow();
    const requestTimestamp = new Date().toISOString();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...authorizationHeaders(apiKey),
        Accept: "audio/*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
      cache: "no-store",
      signal: abortScope.signal,
    });

    if (!response.ok) {
      throw await buildDeepgramError(response, "Deepgram text-to-speech failed.", abortScope.signal);
    }

    const fallbackContentType = encoding === "linear16" && container === "none" ? "audio/l16" : "audio/mpeg";
    const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() || fallbackContentType;
    if (!contentType.startsWith("audio/") && contentType !== "application/octet-stream") {
      throw new ProviderAudioResponseError("Deepgram returned a non-audio Text to Speech response.");
    }
    const streamed = await readTimedAudioResponse(response, {
      requestStartedAt,
      requestTimestamp,
      signal: abortScope.signal,
      maxBytes: context.maxAudioBytes,
      requireEvenByteLength: encoding === "linear16" && container === "none",
    });
    const requestId = response.headers.get("dg-request-id") || undefined;
    const responseHeaders = {
      "content-type": contentType,
      "dg-request-id": requestId || "unavailable",
      "dg-model-name": response.headers.get("dg-model-name") || model,
      "dg-char-count": response.headers.get("dg-char-count") || String(text.length),
    };
    return {
      audio: streamed.audio,
      contentType: contentType.startsWith("audio/") ? contentType : fallbackContentType,
      model,
      encoding,
      container,
      sampleRate,
      requestId,
      responseHeaders,
      timing: streamed.timing,
    };
  } catch (error) {
    throwIfProviderCancelled(context.signal);
    if (abortScope.didTimeout() || isProviderAbortError(error)) {
      throw new DeepgramRequestError("The Deepgram Text to Speech request timed out.", 504, { category: "timeout" });
    }
    if (error instanceof DeepgramRequestError || error instanceof DeepgramValidationError) throw error;
    if (error instanceof ProviderAudioResponseError) {
      throw new DeepgramRequestError("Deepgram returned an invalid Text to Speech audio response.", 502, {
        category: "invalid_response",
      });
    }
    throw new DeepgramRequestError("The server could not reach Deepgram for Text to Speech.", 502, {
      category: "network_failure",
    });
  } finally {
    abortScope.dispose();
  }
}

export async function analyzeText(payload: TextIntelligenceRequest): Promise<TextIntelligenceResult> {
  const apiKey = requireDeepgramApiKey();

  if (!payload || typeof payload !== "object") {
    throw new DeepgramValidationError("Send a JSON object containing text and feature options.");
  }

  const text = typeof payload.text === "string" ? payload.text.trim() : "";

  if (!text) {
    throw new DeepgramValidationError("Enter text before running Text Intelligence.");
  }

  if (text.length > MAX_TEXT_INTELLIGENCE_CHARS) {
    throw new DeepgramValidationError(
      `Keep text under ${MAX_TEXT_INTELLIGENCE_CHARS.toLocaleString()} characters for this learning lab.`,
      413,
    );
  }

  const options = normalizeTextIntelligenceOptions(payload);
  const language = normalizeTextIntelligenceLanguage(payload.language);

  if (!Object.values(options).some(Boolean)) {
    throw new DeepgramValidationError("Enable at least one Text Intelligence feature.");
  }

  const endpoint = buildReadEndpoint(options, language);
  const raw = (await fetchDeepgramJson(
    endpoint,
    {
      method: "POST",
      headers: {
        ...authorizationHeaders(apiKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
      cache: "no-store",
    },
    "Deepgram Text Intelligence failed.",
  )) as TextIntelligenceResponse;

  return {
    raw,
    endpoint: endpoint.toString(),
    options,
    textLength: text.length,
    language,
  };
}

export async function grantTemporaryToken(ttlSeconds = DEFAULT_TOKEN_TTL_SECONDS): Promise<TemporaryTokenResponse> {
  const apiKey = requireDeepgramApiKey();
  const ttl = Number.isFinite(ttlSeconds)
    ? Math.max(30, Math.min(Math.round(ttlSeconds), 600))
    : DEFAULT_TOKEN_TTL_SECONDS;

  let response: Response;

  try {
    response = await fetchWithTimeout(
      `${DEEPGRAM_API_BASE}/auth/grant`,
      {
        method: "POST",
        headers: {
          ...authorizationHeaders(apiKey),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl_seconds: ttl }),
      },
      10_000,
    );
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    throw new DeepgramRequestError(
      timedOut
        ? "The temporary token request to Deepgram timed out. Check the server network and try again."
        : "The server could not reach Deepgram to request a temporary token. Check the network and try again.",
      502,
      { category: "network_failure", timedOut },
    );
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new DeepgramRequestError(
        response.status === 403
          ? "Deepgram denied the temporary token grant. The server API key may not have permission to grant temporary tokens."
          : "Deepgram rejected the server API key while granting a temporary token. Check DEEPGRAM_API_KEY.",
        response.status,
        { category: "forbidden", upstreamStatus: response.status },
      );
    }

    throw await buildDeepgramError(response, "Deepgram could not generate a temporary token.");
  }

  let raw: unknown;

  try {
    const responseScope = createProviderAbortScope(undefined, 10_000);
    try {
      raw = await readBoundedProviderJson(response, {
        signal: responseScope.signal,
        maxBytes: MAX_TEMPORARY_TOKEN_RESPONSE_BYTES,
      });
    } finally {
      responseScope.dispose();
    }
  } catch (error) {
    if (!(error instanceof ProviderResponseBodyError)) throw error;
    throw new DeepgramRequestError(
      "Deepgram returned an invalid temporary token response.",
      502,
      { category: "invalid_response", reason: "Response body was malformed or exceeded the bounded token-response limit." },
    );
  }

  const token = readString(raw, "access_token");
  const expiresIn = readNumber(raw, "expires_in");

  if (!token || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new DeepgramRequestError(
      "Deepgram returned an invalid temporary token response.",
      502,
      {
        category: "invalid_response",
        reason: !token ? "access_token was missing." : "expires_in was missing or invalid.",
      },
    );
  }

  return {
    access_token: token,
    expires_in: expiresIn,
  };
}

export function formatRouteError(error: unknown): { status: number; body: DeepgramErrorResponse } {
  if (error instanceof OpenLabDeepgramDisabledError) {
    return {
      status: error.status,
      body: {
        ok: false,
        message: error.message,
        status: error.status,
        details: { category: error.code },
      },
    };
  }

  if (error instanceof DeepgramConfigError) {
    return {
      status: error.status,
      body: {
        ok: false,
        configured: false,
        message: error.message,
        status: error.status,
      },
    };
  }

  if (error instanceof DeepgramValidationError) {
    return {
      status: error.status,
      body: {
        ok: false,
        message: error.message,
        status: error.status,
      },
    };
  }

  if (error instanceof DeepgramRequestError) {
    const knownSecrets = [getDeepgramApiKey() ?? ""];
    return {
      status: error.status,
      body: {
        ok: false,
        message: sanitizeForBrowser(error.message, knownSecrets) as string,
        status: error.status,
        details: sanitizeForBrowser(error.details, knownSecrets),
      },
    };
  }

  return {
    status: 500,
    body: {
      ok: false,
      message: "Unexpected server error while talking to Deepgram.",
      status: 500,
    },
  };
}

function getDeepgramApiKey() {
  const value = process.env.DEEPGRAM_API_KEY?.trim();
  return value || null;
}

function requireDeepgramApiKey() {
  assertOpenLabDeepgramEnabled();
  const apiKey = getDeepgramApiKey();

  if (!apiKey) {
    throw new DeepgramConfigError();
  }

  return apiKey;
}

function authorizationHeaders(apiKey: string) {
  return {
    Authorization: `Token ${apiKey}`,
  };
}

function normalizeTranscriptionOptions(payload: TranscriptionRequestOptions): TranscriptionOptions {
  const detectLanguage = coerceBoolean(payload.detect_language, false);
  return {
    model: normalizeSttModel(payload.model),
    smart_format: coerceBoolean(payload.smart_format, true),
    diarize: coerceBoolean(payload.diarize, false),
    diarize_model: normalizeDiarizeModel(payload.diarize_model),
    language: normalizeTranscriptionLanguage(payload.language),
    punctuate: coerceBoolean(payload.punctuate, true),
    utterances: coerceBoolean(payload.utterances, false),
    paragraphs: coerceBoolean(payload.paragraphs, false),
    numerals: coerceBoolean(payload.numerals, false),
    detect_language: detectLanguage,
    multichannel: coerceBoolean(payload.multichannel, false),
    keyterm: normalizeOptionalKeyterms(payload.keyterm),
    redact: serializeRedactionValues(parseRedactionValues(payload.redact)),
    tag: normalizeObservatoryTag(payload.tag),
  };
}

function normalizeTextIntelligenceOptions(
  payload: TextIntelligenceRequest,
): NormalizedTextIntelligenceOptions {
  const featureOptions = readFeatureOptionRecord(payload.features, "features");
  const requestOptions = readFeatureOptionRecord(payload.options, "options");
  const sources: Array<Record<string, unknown>> = [
    payload as unknown as Record<string, unknown>,
    featureOptions,
    requestOptions,
  ];

  return {
    summarize: readTextIntelligenceFeature(sources, "summarize", true),
    topics: readTextIntelligenceFeature(sources, "topics", true),
    intents: readTextIntelligenceFeature(sources, "intents", true),
    sentiment: readTextIntelligenceFeature(sources, "sentiment", true),
  };
}

function normalizeTextIntelligenceLanguage(value: string | undefined) {
  const language = value?.trim() || "en";
  if (language !== "en") {
    throw new DeepgramValidationError("The currently documented Text Intelligence features in this lab require language=en.");
  }
  return language;
}

function readFeatureOptionRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === undefined) {
    return {};
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DeepgramValidationError(`${field} must be a JSON object of feature toggles.`);
  }

  return value as Record<string, unknown>;
}

function readTextIntelligenceFeature(
  sources: Array<Record<string, unknown>>,
  key: keyof NormalizedTextIntelligenceOptions,
  fallback: boolean,
) {
  let value: unknown;

  for (const source of sources) {
    if (source[key] !== undefined) {
      value = source[key];
    }
  }

  if (value === undefined) {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  throw new DeepgramValidationError(`${key} must be a boolean.`);
}

function normalizeTranscriptionLanguage(value: string | undefined): DeepgramNova3LanguageCode {
  const language = value?.trim() || DEFAULT_LANGUAGE;

  if (isDeepgramNova3LanguageCode(language)) {
    return language;
  }

  throw new DeepgramValidationError(
    `Unsupported language code "${language}". Choose a Nova-3 supported code such as en, it, es, fr, de, pt, ja, nl, or multi.`,
  );
}

export function normalizeTranscriptionAudioUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new DeepgramValidationError("Enter an audio URL before transcribing.");
  }

  try {
    return normalizePrerecordedAudioUrl(value);
  } catch (error) {
    if (error instanceof PublicProviderUrlError) throw new DeepgramValidationError(error.message);
    if (error instanceof DeepgramPrerecordedPolicyError) throw new DeepgramValidationError(error.message, error.status);
    throw error;
  }
}

function normalizeSttModel(value: string | undefined) {
  const model = value?.trim() || DEFAULT_TRANSCRIPTION_MODEL;
  if (!isDeepgramSttModel(model)) throw new DeepgramValidationError("Choose an STT model from the implemented registry.");
  return model;
}

function normalizeDiarizeModel(value: string | undefined): "latest" | "v1" | "v2" | undefined {
  if (!value || value === "none") return undefined;
  if (value === "latest" || value === "v1" || value === "v2") return value;
  throw new DeepgramValidationError("diarize_model must be latest, v1, or v2.");
}

function normalizeOptionalKeyterms(value: string | undefined) {
  const keyterms = value?.trim();
  if (!keyterms) return undefined;
  if (keyterms.length > 500) throw new DeepgramValidationError("Keep the keyterm list under 500 characters in this lab.");
  return keyterms;
}

function coerceBoolean(value: boolean | string | undefined, fallback: boolean) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value === "true";
  }

  return fallback;
}

function buildListenEndpoint(options: TranscriptionOptions) {
  const endpoint = new URL(`${DEEPGRAM_API_BASE}/listen`);
  endpoint.searchParams.set("model", options.model);
  if (!options.detect_language) endpoint.searchParams.set("language", options.language);
  endpoint.searchParams.set("smart_format", String(options.smart_format));
  if (options.diarize_model) endpoint.searchParams.set("diarize_model", options.diarize_model);
  else endpoint.searchParams.set("diarize", String(options.diarize));
  endpoint.searchParams.set("punctuate", String(options.punctuate));
  endpoint.searchParams.set("utterances", String(options.utterances));
  endpoint.searchParams.set("paragraphs", String(options.paragraphs));
  endpoint.searchParams.set("numerals", String(options.numerals));
  endpoint.searchParams.set("detect_language", String(options.detect_language));
  endpoint.searchParams.set("multichannel", String(options.multichannel));
  if (options.keyterm) {
    for (const keyterm of options.keyterm.split(",").map((item) => item.trim()).filter(Boolean)) {
      endpoint.searchParams.append("keyterm", keyterm);
    }
  }
  for (const value of options.redact ?? []) endpoint.searchParams.append("redact", value);
  if (options.tag) endpoint.searchParams.set("tag", options.tag);
  return endpoint;
}

function normalizeObservatoryTag(value: string | undefined) {
  if (!value) return undefined;
  if (["avs_observatory_live", "avs_stt_experiment", "avs_round_trip"].includes(value)) return value as TranscriptionOptions["tag"];
  throw new DeepgramValidationError("Unsupported Observatory request tag.");
}

function buildReadEndpoint(options: NormalizedTextIntelligenceOptions, language: string) {
  const endpoint = new URL(`${DEEPGRAM_API_BASE}/read`);
  endpoint.searchParams.set("language", language);

  if (options.summarize) {
    endpoint.searchParams.set("summarize", "true");
  }

  if (options.topics) {
    endpoint.searchParams.set("topics", "true");
  }

  if (options.intents) {
    endpoint.searchParams.set("intents", "true");
  }

  if (options.sentiment) {
    endpoint.searchParams.set("sentiment", "true");
  }

  return endpoint;
}

async function fetchDeepgramJson(
  input: URL,
  init: RequestInit,
  fallback = "Deepgram transcription failed.",
) {
  const externalSignal = init.signal ?? undefined;
  throwIfProviderCancelled(externalSignal);
  const abortScope = createProviderAbortScope(externalSignal, 45_000);
  try {
    let response: Response;
    try {
      response = await fetch(input, {
        ...init,
        cache: "no-store",
        signal: abortScope.signal,
      });
    } catch (error) {
      throwIfProviderCancelled(externalSignal);
      if (abortScope.didTimeout() || isProviderAbortError(error)) {
        throw new DeepgramRequestError("The Deepgram request timed out.", 504, { category: "timeout" });
      }
      throw new DeepgramRequestError("The server could not reach Deepgram.", 502, { category: "network_failure" });
    }

    if (!response.ok) {
      throw await buildDeepgramError(response, fallback, abortScope.signal);
    }

    try {
      return await readBoundedProviderJson(response, {
        signal: abortScope.signal,
        maxBytes: MAX_PROVIDER_TRANSCRIPT_RESPONSE_BYTES,
      });
    } catch (error) {
      throwIfProviderCancelled(externalSignal);
      if (abortScope.didTimeout() || isProviderAbortError(error)) {
        throw new DeepgramRequestError("The Deepgram response body timed out.", 504, { category: "timeout" });
      }
      if (error instanceof ProviderResponseBodyError) {
        throw new DeepgramRequestError(
          "Deepgram returned a response the Lab could not safely normalize.",
          502,
          { category: "invalid_response" },
        );
      }
      throw error;
    }
  } catch (error) {
    throwIfProviderCancelled(externalSignal);
    if (!(error instanceof DeepgramRequestError)
      && (abortScope.didTimeout() || isProviderAbortError(error))) {
      throw new DeepgramRequestError("The Deepgram response body timed out.", 504, { category: "timeout" });
    }
    throw error;
  } finally {
    abortScope.dispose();
  }
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 15_000) {
  const controller = new AbortController();
  const externalSignal = init.signal;
  const abortFromCaller = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromCaller();
  else externalSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromCaller);
  }
}

async function buildDeepgramError(response: Response, fallback: string, signal?: AbortSignal) {
  await readResponseBody(response, signal);
  const category = response.status === 401
    ? "unauthorized"
    : response.status === 403
      ? "forbidden"
      : response.status === 402
        ? "quota_exhausted"
      : [400, 404, 422].includes(response.status)
        ? "invalid_request"
      : response.status === 429
        ? "rate_limited"
        : response.status >= 500
          ? "upstream_failure"
          : "request_rejected";
  return new DeepgramRequestError(
    `${fallback} HTTP ${response.status}.`,
    response.status,
    { category, upstreamStatus: response.status },
  );
}

function normalizeDeepgramTranscript(value: unknown) {
  try {
    return normalizeDeepgramTranscriptionResponse(value);
  } catch (error) {
    if (error instanceof DeepgramNormalizationError) {
      throw new DeepgramRequestError(
        "Deepgram returned a response the Lab could not safely normalize.",
        502,
        { category: "invalid_response" },
      );
    }
    throw error;
  }
}

async function readResponseBody(response: Response, signal?: AbortSignal) {
  try {
    return await readBoundedProviderText(response, {
      signal,
      maxBytes: MAX_PROVIDER_ERROR_RESPONSE_BYTES,
    });
  } catch (error) {
    if (isProviderAbortError(error)) throw error;
    return null;
  }
}

function readString(value: unknown, key: string) {
  if (value && typeof value === "object" && key in value) {
    const record = value as Record<string, unknown>;
    return typeof record[key] === "string" ? record[key] : "";
  }

  return "";
}

function readNumber(value: unknown, key: string) {
  if (value && typeof value === "object" && key in value) {
    const record = value as Record<string, unknown>;
    return typeof record[key] === "number" ? record[key] : 0;
  }

  return 0;
}
