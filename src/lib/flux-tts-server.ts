import type { PreparedFluxTtsBatchRequest } from "@/lib/flux-tts";
import {
  monotonicNow,
  ProviderAudioResponseError,
  readTimedAudioResponse,
} from "@/lib/providers/audio-response";
import {
  assertProviderExecutionAuthorized,
  type ProviderExecutionAuthorization,
} from "@/lib/providers/execution-policy";

const MAX_FLUX_TTS_AUDIO_BYTES = 16 * 1024 * 1024;

export type FluxTtsUpstreamResult = Readonly<{
  audio: ArrayBuffer;
  contentType: string;
  model: string;
  requestId?: string;
}>;

export class FluxTtsExecutionError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "FluxTtsExecutionError";
  }
}

export type ExecuteFluxTtsBatchOptions = Readonly<{
  apiKey: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImplementation?: typeof fetch;
  authorization?: ProviderExecutionAuthorization;
}>;

export async function executeFluxTtsBatch(
  prepared: PreparedFluxTtsBatchRequest,
  options: ExecuteFluxTtsBatchOptions,
): Promise<FluxTtsUpstreamResult> {
  assertProviderExecutionAuthorized(options.authorization, "deepgram", "tts");
  const apiKey = options.apiKey.trim();
  if (!apiKey) {
    throw new FluxTtsExecutionError("Flux TTS is not configured on this server.", 503, "provider_not_configured");
  }

  const fetchImplementation = options.fetchImplementation ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abortFromCaller();
  else options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(
    () => controller.abort(new DOMException("Flux TTS request timed out.", "TimeoutError")),
    timeoutMs,
  );

  try {
    const requestStartedAt = monotonicNow();
    const requestTimestamp = new Date().toISOString();
    const response = await fetchImplementation(prepared.url, {
      method: "POST",
      headers: {
        Accept: "audio/*",
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: prepared.body,
      cache: "no-store",
      signal: controller.signal,
    });
    const requestId = safeUpstreamHeader(response.headers.get("dg-request-id"));

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw upstreamFailure(response.status, requestId);
    }

    const upstreamContentType = response.headers.get("content-type");
    const contentType = safeAudioContentType(upstreamContentType);
    if (upstreamContentType && !contentType) {
      await response.body?.cancel().catch(() => undefined);
      throw new FluxTtsExecutionError(
        "Deepgram returned an unexpected Flux TTS response type.",
        502,
        "invalid_provider_response",
        requestId,
      );
    }

    const audio = (await readTimedAudioResponse(response, {
      requestStartedAt,
      requestTimestamp,
      signal: controller.signal,
      maxBytes: MAX_FLUX_TTS_AUDIO_BYTES,
    })).audio;
    if (!audio.byteLength) {
      throw new FluxTtsExecutionError(
        "Deepgram returned an empty audio response.",
        502,
        "empty_provider_response",
        requestId,
      );
    }

    return {
      audio,
      contentType: contentType ?? prepared.fallbackContentType,
      model: prepared.input.model,
      requestId,
    };
  } catch (error) {
    if (error instanceof FluxTtsExecutionError) throw error;
    if (controller.signal.aborted) {
      if (options.signal?.aborted) {
        throw new FluxTtsExecutionError("The Flux TTS request was canceled.", 499, "request_aborted");
      }
      throw new FluxTtsExecutionError("Deepgram did not respond before the request timeout.", 504, "provider_timeout");
    }
    if (error instanceof ProviderAudioResponseError) {
      throw new FluxTtsExecutionError(
        "Deepgram returned an invalid or oversized Flux TTS audio response.",
        502,
        "invalid_provider_response",
      );
    }
    throw new FluxTtsExecutionError("The server could not reach Deepgram Flux TTS.", 502, "provider_network_error");
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}

export function safeUpstreamHeader(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return /^[A-Za-z0-9._-]{4,200}$/.test(trimmed) ? trimmed : undefined;
}

export function safeAudioContentType(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return /^audio\/[a-z0-9.+-]+(?:\s*;\s*[a-z0-9_-]+=[a-z0-9.+-]+)*$/i.test(trimmed)
    ? trimmed
    : undefined;
}

function upstreamFailure(status: number, requestId?: string) {
  if (status === 429) {
    return new FluxTtsExecutionError("Deepgram temporarily rate-limited this request.", 429, "provider_rate_limited", requestId);
  }
  if (status === 401 || status === 403) {
    return new FluxTtsExecutionError("The server could not authorize Flux TTS with Deepgram.", 502, "provider_authorization_failed", requestId);
  }
  if (status >= 400 && status < 500) {
    return new FluxTtsExecutionError("Deepgram rejected the Flux TTS request.", 400, "provider_rejected_request", requestId);
  }
  return new FluxTtsExecutionError("Deepgram could not complete the Flux TTS request.", 502, "provider_request_failed", requestId);
}
