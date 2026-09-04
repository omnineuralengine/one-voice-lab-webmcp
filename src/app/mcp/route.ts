import { getCanonicalOrigin } from "@/lib/public-evidence/canonical-url";
import { voiceLabMcpHandler } from "@/lib/public-evidence/mcp";
import {
  checkPublicReadAccess,
  publicReadRateLimitResponse,
} from "@/lib/public-evidence/read-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_MCP_REQUEST_BYTES = 128 * 1024;

function validateRequestBoundary(request: Request): Response | null {
  const requestUrl = new URL(request.url);
  const host = request.headers.get("host");
  if (!host || host !== requestUrl.host) {
    return Response.json({ error: "Invalid Host header." }, { status: 400 });
  }

  const origin = request.headers.get("origin");
  if (origin) {
    let parsedOrigin: string;
    try {
      parsedOrigin = new URL(origin).origin;
    } catch {
      return Response.json({ error: "Invalid Origin header." }, { status: 403 });
    }

    const allowedOrigins = new Set([requestUrl.origin, getCanonicalOrigin()]);
    if (!allowedOrigins.has(parsedOrigin)) {
      return Response.json({ error: "Origin is not allowed." }, { status: 403 });
    }
  }

  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader && !/^\d+$/.test(contentLengthHeader)) {
    return Response.json({ error: "Invalid Content-Length header." }, { status: 400 });
  }
  const contentLength = Number(contentLengthHeader ?? "0");
  if (contentLength > MAX_MCP_REQUEST_BYTES) {
    return Response.json({ error: "MCP request exceeds 128 KiB." }, { status: 413 });
  }

  return null;
}

async function handle(request: Request): Promise<Response> {
  const rejected = validateRequestBoundary(request);
  if (rejected) return rejected;

  const readDecision = checkPublicReadAccess(request, "mcp");
  if (!readDecision.allowed) return publicReadRateLimitResponse(readDecision);

  const bounded = await readBoundedRequest(request);
  if (bounded instanceof Response) return bounded;
  return voiceLabMcpHandler.fetch(bounded);
}

async function readBoundedRequest(request: Request): Promise<Request | Response> {
  if (request.method !== "POST" || !request.body) return request;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const result = await reader.read();
    if (result.done) break;
    totalBytes += result.value.byteLength;
    if (totalBytes > MAX_MCP_REQUEST_BYTES) {
      await reader.cancel().catch(() => undefined);
      return Response.json({ error: "MCP request exceeds 128 KiB." }, { status: 413 });
    }
    chunks.push(result.value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body,
    signal: request.signal,
  });
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
