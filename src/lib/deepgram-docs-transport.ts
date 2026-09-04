export const MAX_DEEPGRAM_DOCS_MCP_RESPONSE_BYTES = 1_000_000;

export function isAllowedDeepgramDocsMcpContentType(contentType: string | null): boolean {
  const normalized = contentType?.toLowerCase() ?? "";
  return normalized.includes("application/json") || normalized.includes("text/event-stream");
}

export async function readLimitedDeepgramDocsResponse(response: Response, limit = MAX_DEEPGRAM_DOCS_MCP_RESPONSE_BYTES): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > limit) throw new Error("docs_mcp_response_too_large");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) throw new Error("docs_mcp_response_too_large");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(joined);
}
