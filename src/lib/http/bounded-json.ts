import "server-only";

export class BoundedJsonError extends Error {
  constructor(
    readonly code: "unsupported_media_type" | "request_too_large" | "invalid_json",
    readonly status: 400 | 413 | 415,
    message: string,
  ) {
    super(message);
    this.name = "BoundedJsonError";
  }
}

export async function readBoundedJson(request: Request, maximumBytes: number): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new BoundedJsonError("unsupported_media_type", 415, "This endpoint requires application/json.");
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    await request.body?.cancel("Request body exceeds the declared limit.").catch(() => undefined);
    throw new BoundedJsonError("request_too_large", 413, "The request body is too large.");
  }
  if (!request.body) throw new BoundedJsonError("invalid_json", 400, "A JSON request body is required.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new BoundedJsonError("request_too_large", 413, "The request body is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new BoundedJsonError("invalid_json", 400, "The request body must be valid UTF-8 JSON.");
  }
}
