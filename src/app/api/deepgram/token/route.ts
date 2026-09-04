import {
  checkLabAccess,
  labAccessResponse,
  minimumTierInProduction,
  reserveLabConcurrencyLease,
} from "@/lib/access/lab-access";
import { formatRouteError, grantTemporaryToken } from "@/lib/deepgram";
import { checkTemporaryTokenBoundary } from "@/lib/temporary-token-boundary";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE_HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export async function POST(request: Request) {
  const boundary = checkTemporaryTokenBoundary(request);
  if (!boundary.allowed) {
    return Response.json({ error: { code: boundary.code, message: boundary.message } }, {
      status: boundary.status,
      headers: {
        ...NO_STORE_HEADERS,
        ...(boundary.retryAfterSeconds ? { "Retry-After": String(boundary.retryAfterSeconds) } : {}),
      },
    });
  }

  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > 512) {
      return Response.json({ error: { code: "invalid_request", message: "Temporary credential request is too large." } }, { status: 413, headers: NO_STORE_HEADERS });
    }
    const boundedBody = await readBoundedBody(request, 512);
    if (boundedBody.tooLarge) {
      return Response.json({ error: { code: "invalid_request", message: "Temporary credential request is too large." } }, { status: 413, headers: NO_STORE_HEADERS });
    }
    const payload = parseJsonBody(boundedBody.text) as { ttlSeconds?: unknown } | null;
    if (!payload || typeof payload !== "object" || (payload.ttlSeconds !== undefined && (
      typeof payload.ttlSeconds !== "number"
      || !Number.isInteger(payload.ttlSeconds)
      || payload.ttlSeconds < 30
      || payload.ttlSeconds > 600
    ))) {
      return Response.json({ error: { code: "invalid_request", message: "ttlSeconds must be an integer from 30 through 600." } }, { status: 400, headers: NO_STORE_HEADERS });
    }
    const access = await checkLabAccess(request, "realtime_session", {
      providerId: "deepgram",
      endpointId: "deepgram:temporary-token",
      units: payload.ttlSeconds ?? 60,
      minimumTier: minimumTierInProduction("verified"),
      actorIntent: "human",
    });
    if (!access.allowed) return labAccessResponse(access);
    const ttlSeconds = payload.ttlSeconds ?? 60;
    const reservation = await reserveLabConcurrencyLease(request, "realtime_session", {
      providerId: "deepgram",
      endpointId: "deepgram:temporary-token",
      units: ttlSeconds,
      minimumTier: minimumTierInProduction("verified"),
      actorIntent: "human",
    });
    if (!reservation.decision.allowed) return labAccessResponse(reservation.decision);

    let grant: Awaited<ReturnType<typeof grantTemporaryToken>>;
    try {
      grant = await grantTemporaryToken(payload.ttlSeconds);
    } catch (error) {
      await reservation.release();
      throw error;
    }
    // Intentionally retain the durable lease after a successful grant. The
    // database expires it at the same bounded TTL because downstream browser
    // traffic no longer passes through ONE for per-frame metering.

    return Response.json({
      access_token: grant.access_token,
      expires_in: grant.expires_in,
    }, {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    const { status, body } = formatRouteError(error);
    return Response.json({
      error: {
        code: classifyTokenError(status, body.configured, body.details),
        message: body.message,
      },
    }, {
      status,
      headers: NO_STORE_HEADERS,
    });
  }
}

function classifyTokenError(status: number, configured: boolean | undefined, details: unknown) {
  if (configured === false) return "missing_api_key";
  const category = readErrorCategory(details);
  if (category === "open_lab_deepgram_disabled") return "provider_disabled";
  if (category === "network_failure") return "network_failure";
  if (category === "invalid_response") return "invalid_deepgram_response";
  if (category === "forbidden" || status === 401 || status === 403) return "forbidden";
  return "deepgram_request_failed";
}

function readErrorCategory(details: unknown) {
  if (!details || typeof details !== "object" || !("category" in details)) return "";
  const category = (details as { category?: unknown }).category;
  return typeof category === "string" ? category : "";
}

async function readBoundedBody(request: Request, maxBytes: number) {
  const reader = request.body?.getReader();
  if (!reader) return { tooLarge: false, text: "" };
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    bytes += result.value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { tooLarge: true, text: "" };
    }
    text += decoder.decode(result.value, { stream: true });
  }
  text += decoder.decode();
  return { tooLarge: false, text };
}

function parseJsonBody(value: string) {
  try { return JSON.parse(value) as unknown; } catch { return null; }
}
