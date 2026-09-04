import { deriveLabClientIdentity } from "@/lib/access/client-identity";
import { viewerEventInputSchema } from "@/lib/analytics/viewer-events";
import { readBoundedRequestText, RequestBodyTooLargeError } from "@/lib/http/bounded-body";
import { insertViewerEvent } from "@/lib/supabase/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1_024;
const WINDOW_MS = 60 * 60 * 1_000;
const MAX_PER_WINDOW = 120;
const windows = new Map<string, { count: number; resetAt: number }>();
const RESPONSE_HEADERS = { "Cache-Control": "no-store" } as const;

export async function POST(request: Request) {
  if (!isSameSiteRequest(request)) {
    return Response.json({ ok: false, error: "cross_site_request_rejected" }, { status: 403, headers: RESPONSE_HEADERS });
  }

  let text: string;
  try {
    text = await readBoundedRequestText(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return Response.json({ ok: false, error: "payload_too_large" }, { status: 413, headers: RESPONSE_HEADERS });
    }
    throw error;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400, headers: RESPONSE_HEADERS });
  }

  const parsed = viewerEventInputSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "invalid_event" }, { status: 400, headers: RESPONSE_HEADERS });
  }

  const rateLimit = consumeWindow(request);
  if (!rateLimit.allowed) {
    return Response.json({ ok: false, error: "analytics_rate_limited" }, {
      status: 429,
      headers: { ...RESPONSE_HEADERS, "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }

  const result = await insertViewerEvent(parsed.data);
  if (result.status === "not_configured") {
    return Response.json({ ok: false, error: "analytics_not_configured" }, { status: 503, headers: RESPONSE_HEADERS });
  }
  if (result.status === "failed") {
    console.warn("viewer_analytics_insert_failed", { code: result.code });
    return Response.json({ ok: false, error: "analytics_unavailable" }, { status: 502, headers: RESPONSE_HEADERS });
  }

  return Response.json({ ok: true }, { status: 202, headers: RESPONSE_HEADERS });
}

function consumeWindow(request: Request) {
  const now = Date.now();
  for (const [key, value] of windows) if (value.resetAt <= now || windows.size > 2_000) windows.delete(key);
  const key = deriveLabClientIdentity(request).clientHash;
  const current = windows.get(key);
  const state = !current || current.resetAt <= now
    ? { count: 1, resetAt: now + WINDOW_MS }
    : { count: current.count + 1, resetAt: current.resetAt };
  windows.set(key, state);
  return { allowed: state.count <= MAX_PER_WINDOW, retryAfterSeconds: Math.max(1, Math.ceil((state.resetAt - now) / 1_000)) };
}

function isSameSiteRequest(request: Request) {
  if (request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}
