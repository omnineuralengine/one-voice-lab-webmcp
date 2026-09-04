import "server-only";

import { DeepgramPolicyError, prepareDeepgramRequest, sanitizeForBrowser } from "@/lib/deepgram-request-policy";
import type { DeepgramExecuteInput } from "@/types/deepgram-endpoint-registry";
import { assertOpenLabDeepgramEnabled, isOpenLabMode, OpenLabDeepgramDisabledError } from "@/lib/open-lab";
import { isOpenLabAccountDataEndpoint } from "@/lib/open-lab-endpoint-policy";
import { ProviderOperationError } from "@/lib/providers/errors";
import {
  assertProviderExecutionAuthorized,
  type ProviderExecutionAuthorization,
} from "@/lib/providers/execution-policy";
import type { ProviderOperationName } from "@/lib/providers/operations";
import {
  deepgramCatalogAdapter,
  deepgramSttAdapter,
  deepgramTtsAdapter,
} from "@/lib/providers/deepgram/adapters";
import {
  MAX_PROVIDER_JSON_RESPONSE_BYTES,
  ProviderResponseBodyError,
  readBoundedProviderJson,
  readBoundedProviderText,
} from "@/lib/providers/upstream-response";
import { ProviderAudioResponseError, readTimedAudioResponse } from "@/lib/providers/audio-response";

const REQUEST_TIMEOUT_MS = 45_000;
const MAX_AUDIO_RESPONSE_BYTES = 12 * 1024 * 1024;
const SAFE_RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "dg-request-id",
  "dg-model-name",
  "dg-model-uuid",
  "dg-char-count",
  "dg-duration",
  "x-request-id",
] as const;

export async function executeDeepgramRequest(
  input: DeepgramExecuteInput,
  binaryBody?: { bytes: ArrayBuffer; contentType: string },
  context: Readonly<{
    authorization?: ProviderExecutionAuthorization;
    signal?: AbortSignal;
  }> = {},
) {
  const prepared = prepareDeepgramRequest({ ...input, contentType: binaryBody?.contentType ?? input.contentType });
  const canonicalOperation = canonicalOperationForEndpoint(input.endpointId);
  if (canonicalOperation) {
    assertProviderExecutionAuthorized(context.authorization, "deepgram", canonicalOperation);
  }
  const started = performance.now();
  const canonical = await executeCanonicalCoreOperation(
    input,
    prepared.effective,
    binaryBody,
    context.authorization,
    context.signal,
    started,
  );
  if (canonical) return canonical;

  try {
    assertOpenLabDeepgramEnabled();
  } catch (error) {
    if (error instanceof OpenLabDeepgramDisabledError) {
      throw new DeepgramPolicyError(error.message, error.status, error.code);
    }
    throw error;
  }
  if (isOpenLabMode() && isOpenLabAccountDataEndpoint(prepared.endpoint)) {
    throw new DeepgramPolicyError(
      "Account and Management API data is unavailable in the public Open Lab.",
      403,
      "open_lab_account_data_locked",
    );
  }
  const apiKey = process.env.DEEPGRAM_API_KEY?.trim();
  if (!apiKey) throw new DeepgramPolicyError("Deepgram is not configured on this server.", 503, "api_key_not_configured");

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(context.signal?.reason);
  if (context.signal?.aborted) abortFromCaller();
  else context.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const hasBody = prepared.endpoint.method !== "GET" && prepared.endpoint.method !== "DELETE";
    const response = await fetch(prepared.url, {
      method: prepared.endpoint.method,
      headers: {
        Authorization: `Token ${apiKey}`,
        Accept: prepared.endpoint.responseType === "audio" ? "audio/*" : "application/json",
        ...(hasBody ? { "Content-Type": binaryBody?.contentType ?? prepared.contentType } : {}),
      },
      body: hasBody
        ? binaryBody?.bytes ?? (prepared.body === null ? undefined : JSON.stringify(prepared.body))
        : undefined,
      cache: "no-store",
      signal: controller.signal,
    });
    const durationMs = Math.round((performance.now() - started) * 10) / 10;
    const headers = safeHeaders(response.headers);
    const requestId = headers["dg-request-id"] ?? headers["x-request-id"];
    const body = prepared.endpoint.responseType === "audio"
      ? await readAudioResponse(response, started, controller.signal)
      : sanitizeForBrowser(await readStructuredResponse(response), [apiKey]);
    return {
      ok: response.ok,
      status: response.status,
      requestId,
      timing: { totalMs: durationMs },
      request: prepared.effective,
      response: { headers, body },
    };
  } catch (error) {
    if (error instanceof DeepgramPolicyError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new DeepgramPolicyError("Deepgram request timed out.", 504, "upstream_timeout");
    }
    if (error instanceof ProviderResponseBodyError || error instanceof ProviderAudioResponseError) {
      throw new DeepgramPolicyError(
        "Deepgram returned a malformed or oversized response.",
        502,
        "invalid_provider_response",
      );
    }
    if (context.signal?.aborted) {
      throw new DeepgramPolicyError("The Deepgram request was canceled.", 499, "request_aborted");
    }
    throw new DeepgramPolicyError("The server could not complete the Deepgram request.", 502, "upstream_unavailable");
  } finally {
    clearTimeout(timeout);
    context.signal?.removeEventListener("abort", abortFromCaller);
  }
}

export function formatExecutorError(error: unknown) {
  if (error instanceof ProviderOperationError) {
    return {
      status: error.status,
      body: { ok: false, error: { code: error.code, message: error.message } },
    };
  }
  if (error instanceof DeepgramPolicyError) {
    return {
      status: error.status,
      body: { ok: false, error: { code: error.code, message: error.message, issues: error.issues } },
    };
  }
  return {
    status: 500,
    body: { ok: false, error: { code: "internal_error", message: "Unexpected local Deepgram execution error." } },
  };
}

function safeHeaders(headers: Headers) {
  return Object.fromEntries(SAFE_RESPONSE_HEADERS.flatMap((name) => {
    const value = headers.get(name);
    return value && !/[\r\n]/.test(value) ? [[name, value]] : [];
  }));
}

async function readStructuredResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("json")) {
    return readBoundedProviderJson(response, { maxBytes: MAX_PROVIDER_JSON_RESPONSE_BYTES });
  }
  return readBoundedProviderText(response, { maxBytes: 1_000_000 });
}

async function executeCanonicalCoreOperation(
  input: DeepgramExecuteInput,
  effectiveRequest: ReturnType<typeof prepareDeepgramRequest>["effective"],
  binaryBody: { bytes: ArrayBuffer; contentType: string } | undefined,
  authorization: ProviderExecutionAuthorization | undefined,
  signal: AbortSignal | undefined,
  started: number,
) {
  if (input.endpointId === "models-project-list" || input.endpointId === "models-project-get") {
    throw new DeepgramPolicyError(
      "Project-scoped Deepgram model discovery remains deferred until its account-private response can use a dedicated normalized contract.",
      403,
      "project_model_discovery_deferred",
    );
  }

  if (input.endpointId === "models-public-list" || input.endpointId === "models-public-get") {
    const catalog = await deepgramCatalogAdapter.listModels();
    const requestedId = input.endpointId === "models-public-get" ? readInputString(input.path, "model_id") : undefined;
    const body = requestedId ? catalog.models.find((model) => model.id === requestedId) : catalog;
    if (!body) {
      throw new DeepgramPolicyError("The requested model is not present in ONE's validated static Deepgram catalog.", 404, "model_not_found");
    }
    return canonicalResult(effectiveRequest, body, started);
  }

  if (input.endpointId === "stt-prerecorded" && binaryBody) {
    const result = await deepgramSttAdapter.execute({
      file: new File([binaryBody.bytes], "api-studio-upload", { type: binaryBody.contentType }),
      model: readInputString(input.query, "model") ?? "nova-3",
      language: readInputString(input.query, "language"),
    }, { authorization, signal });
    return canonicalResult(effectiveRequest, result, started, result.requestId);
  }

  if (input.endpointId === "tts-rest") {
    const text = readInputString(input.body, "text");
    if (!text) throw new DeepgramPolicyError("Text to Speech requires bounded text.", 400, "invalid_request");
    const result = await deepgramTtsAdapter.execute({
      text,
      model: readInputString(input.query, "model"),
      encoding: readInputString(input.query, "encoding"),
      container: readInputString(input.query, "container"),
      sample_rate: readInputNumber(input.query, "sample_rate"),
    }, { authorization, signal });
    return canonicalResult(effectiveRequest, {
      kind: "audio",
      contentType: result.contentType,
      byteLength: result.audio.byteLength,
      base64: Buffer.from(result.audio).toString("base64"),
    }, started, result.requestId, {
      "content-type": result.contentType,
      ...(result.requestId ? { "dg-request-id": result.requestId } : {}),
      "dg-model-name": result.model,
    });
  }

  return null;
}

function canonicalResult(
  effectiveRequest: ReturnType<typeof prepareDeepgramRequest>["effective"],
  body: unknown,
  started: number,
  requestId?: string,
  headers: Record<string, string> = { "content-type": "application/json" },
) {
  return {
    ok: true,
    status: 200,
    requestId,
    timing: { totalMs: Math.round((performance.now() - started) * 10) / 10 },
    request: effectiveRequest,
    response: { headers, body },
  };
}

function readInputString(value: unknown, field: string): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = (value as Record<string, unknown>)[field];
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : undefined;
}

function readInputNumber(value: unknown, field: string): number | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = (value as Record<string, unknown>)[field];
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : undefined;
}

async function readAudioResponse(response: Response, requestStartedAt: number, signal: AbortSignal) {
  const streamed = await readTimedAudioResponse(response, {
    requestStartedAt,
    requestTimestamp: new Date().toISOString(),
    signal,
    maxBytes: MAX_AUDIO_RESPONSE_BYTES,
  });
  return {
    kind: "audio",
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
    byteLength: streamed.audio.byteLength,
    base64: Buffer.from(streamed.audio).toString("base64"),
  };
}

export function canonicalOperationForEndpoint(endpointId: string): ProviderOperationName | null {
  if (endpointId === "stt-prerecorded") return "stt";
  if (endpointId === "tts-rest") return "tts";
  if (endpointId === "models-public-list" || endpointId === "models-public-get"
    || endpointId === "models-project-list" || endpointId === "models-project-get") return "models";
  return null;
}
