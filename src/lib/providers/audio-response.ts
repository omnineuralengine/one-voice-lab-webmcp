import "server-only";

import { performance } from "node:perf_hooks";

import type { ProviderTtsTiming } from "@/lib/providers/types";

export const MAX_PROVIDER_TTS_AUDIO_BYTES = 16 * 1024 * 1024;

export type ProviderAbortScope = Readonly<{
  signal: AbortSignal;
  externalSignal?: AbortSignal;
  didTimeout(): boolean;
  dispose(): void;
}>;

export function monotonicNow(): number {
  return performance.now();
}

export function createProviderAbortScope(
  externalSignal: AbortSignal | undefined,
  timeoutMs: number,
): ProviderAbortScope {
  const controller = new AbortController();
  let timedOut = false;
  const forwardExternalAbort = () => {
    if (!controller.signal.aborted) controller.abort(externalSignal?.reason);
  };

  if (externalSignal?.aborted) forwardExternalAbort();
  else externalSignal?.addEventListener("abort", forwardExternalAbort, { once: true });

  const timeout = setTimeout(() => {
    timedOut = true;
    if (!controller.signal.aborted) {
      controller.abort(new DOMException("The provider request timed out.", "TimeoutError"));
    }
  }, timeoutMs);
  timeout.unref?.();

  return Object.freeze({
    signal: controller.signal,
    ...(externalSignal ? { externalSignal } : {}),
    didTimeout: () => timedOut,
    dispose: () => {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", forwardExternalAbort);
    },
  });
}

export function throwIfProviderCancelled(externalSignal: AbortSignal | undefined): void {
  if (externalSignal?.aborted) {
    throw new DOMException("The provider request was cancelled.", "AbortError");
  }
}

export function isProviderAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

export async function readTimedAudioResponse(
  response: Response,
  input: Readonly<{
    requestStartedAt: number;
    requestTimestamp: string;
    signal: AbortSignal;
    maxBytes?: number;
    requireEvenByteLength?: boolean;
    wallNow?: () => Date;
  }>,
): Promise<Readonly<{ audio: ArrayBuffer; timing: ProviderTtsTiming }>> {
  const requestedMaxBytes = input.maxBytes ?? MAX_PROVIDER_TTS_AUDIO_BYTES;
  const maxBytes = Number.isInteger(requestedMaxBytes) && requestedMaxBytes > 0
    ? Math.min(requestedMaxBytes, MAX_PROVIDER_TTS_AUDIO_BYTES)
    : MAX_PROVIDER_TTS_AUDIO_BYTES;
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel("ONE rejected oversized provider audio.").catch(() => undefined);
    throw new ProviderAudioResponseError("Provider audio exceeded the bounded response limit.");
  }
  if (!response.body) {
    throw new ProviderAudioResponseError("Provider audio response did not contain a readable body.");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let firstAudioAt: number | null = null;
  let firstAudioTimestamp: string | null = null;
  const wallNow = input.wallNow ?? (() => new Date());

  try {
    while (true) {
      throwIfSignalAborted(input.signal);
      const { done, value } = await readWithAbort(reader, input.signal);
      if (done) break;
      if (!value.byteLength) continue;
      if (firstAudioAt === null) {
        firstAudioAt = monotonicNow();
        firstAudioTimestamp = wallNow().toISOString();
      }
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new ProviderAudioResponseError("Provider audio exceeded the bounded response limit.");
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel("ONE stopped reading provider audio.").catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }

  if (firstAudioAt === null || firstAudioTimestamp === null || totalBytes === 0) {
    throw new ProviderAudioResponseError("Provider audio response was empty.");
  }
  if (input.requireEvenByteLength && totalBytes % 2 !== 0) {
    throw new ProviderAudioResponseError("Provider PCM audio contained an incomplete 16-bit sample.");
  }

  const completedAt = monotonicNow();
  const completionTimestamp = wallNow().toISOString();
  const joined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return Object.freeze({
    audio: joined.buffer,
    timing: Object.freeze({
      clock: "monotonic",
      measurementPoint: "one-server",
      requestTimestamp: input.requestTimestamp,
      firstAudioTimestamp,
      completionTimestamp,
      timeToFirstAudioMs: elapsedMs(input.requestStartedAt, firstAudioAt),
      totalTimeMs: elapsedMs(input.requestStartedAt, completedAt),
    }),
  });
}

export class ProviderAudioResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderAudioResponseError";
  }
}

async function readWithAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) throw signal.reason;
  const pendingRead = reader.read();
  let abort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    abort = () => {
      void (async () => {
        await reader.cancel("ONE stopped reading provider audio.").catch(() => undefined);
        await pendingRead.catch(() => undefined);
        reject(signal.reason ?? new DOMException("The provider request was aborted.", "AbortError"));
      })();
    };
    signal.addEventListener("abort", abort, { once: true });
  });

  try {
    const result = await Promise.race([pendingRead, aborted]);
    if (signal.aborted) {
      throw signal.reason ?? new DOMException("The provider request was aborted.", "AbortError");
    }
    return result;
  } finally {
    if (abort) signal.removeEventListener("abort", abort);
  }
}

function throwIfSignalAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason ?? new DOMException("The provider request was aborted.", "AbortError");
  }
}

function elapsedMs(start: number, end: number): number {
  return Math.max(0, Number((end - start).toFixed(3)));
}
