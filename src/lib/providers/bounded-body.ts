import "server-only";

import { ProviderOperationError } from "@/lib/providers/errors";
import type { ProviderOperationName } from "@/lib/providers/operations";

export async function readBoundedBody(
  request: Request,
  input: Readonly<{
    maxBytes: number;
    providerId: string;
    operation: ProviderOperationName;
    message: string;
  }>,
): Promise<Uint8Array> {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > input.maxBytes) {
    await request.body?.cancel("ONE rejected an oversized request body.").catch(() => undefined);
    throw tooLarge(input);
  }
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > input.maxBytes) {
        await reader.cancel();
        throw tooLarge(input);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function tooLarge(input: Readonly<{
  providerId: string;
  operation: ProviderOperationName;
  message: string;
}>) {
  return new ProviderOperationError({
    code: "input_too_large",
    message: input.message,
    status: 413,
    providerId: input.providerId,
    operation: input.operation,
  });
}
