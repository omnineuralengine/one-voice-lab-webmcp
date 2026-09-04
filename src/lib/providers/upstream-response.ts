import "server-only";

export const MAX_PROVIDER_JSON_RESPONSE_BYTES = 2 * 1024 * 1024;
export const MAX_PROVIDER_TRANSCRIPT_RESPONSE_BYTES = 8 * 1024 * 1024;
export const MAX_PROVIDER_ERROR_RESPONSE_BYTES = 8 * 1024;

const ABSOLUTE_MAX_PROVIDER_TEXT_BYTES = MAX_PROVIDER_TRANSCRIPT_RESPONSE_BYTES;

export class ProviderResponseBodyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderResponseBodyError";
  }
}

export async function readBoundedProviderJson(
  response: Response,
  input: Readonly<{ signal?: AbortSignal; maxBytes?: number }> = {},
): Promise<unknown> {
  const text = await readBoundedProviderText(response, {
    ...input,
    maxBytes: input.maxBytes ?? MAX_PROVIDER_JSON_RESPONSE_BYTES,
  });
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderResponseBodyError("The provider returned malformed JSON.");
  }
}

export async function readBoundedProviderText(
  response: Response,
  input: Readonly<{ signal?: AbortSignal; maxBytes?: number }> = {},
): Promise<string> {
  const maxBytes = normalizeLimit(input.maxBytes);
  const declaredLength = parseDeclaredLength(response.headers.get("content-length"));
  if (declaredLength !== null && declaredLength > maxBytes) {
    await response.body?.cancel("ONE rejected an oversized provider response.").catch(() => undefined);
    throw new ProviderResponseBodyError("The provider response exceeded the bounded response limit.");
  }
  if (!response.body) {
    throw new ProviderResponseBodyError("The provider response did not contain a readable body.");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      throwIfAborted(input.signal);
      const { done, value } = await readWithAbort(reader, input.signal);
      if (done) break;
      if (!value.byteLength) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel("ONE stopped reading an oversized provider response.").catch(() => undefined);
        throw new ProviderResponseBodyError("The provider response exceeded the bounded response limit.");
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel("ONE stopped reading the provider response.").catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }

  const joined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(joined);
  } catch {
    throw new ProviderResponseBodyError("The provider returned malformed UTF-8 text.");
  }
}

function normalizeLimit(value: number | undefined): number {
  if (!Number.isInteger(value) || (value ?? 0) <= 0) return ABSOLUTE_MAX_PROVIDER_TEXT_BYTES;
  return Math.min(value as number, ABSOLUTE_MAX_PROVIDER_TEXT_BYTES);
}

function parseDeclaredLength(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

async function readWithAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal | undefined,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (!signal) return reader.read();
  throwIfAborted(signal);
  const pendingRead = reader.read();
  let abort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    abort = () => {
      void (async () => {
        await reader.cancel("ONE stopped reading the provider response.").catch(() => undefined);
        await pendingRead.catch(() => undefined);
        reject(abortError(signal));
      })();
    };
    signal.addEventListener("abort", abort, { once: true });
  });

  try {
    const result = await Promise.race([pendingRead, aborted]);
    throwIfAborted(signal);
    return result;
  } finally {
    if (abort) signal.removeEventListener("abort", abort);
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError(signal);
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The provider response read was aborted.", "AbortError");
}
