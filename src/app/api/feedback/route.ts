import { deriveLabClientIdentity } from "@/lib/access/client-identity";
import { checkLabAccess, labAccessResponse } from "@/lib/access/lab-access";
import { isFeedbackAdmissionLimit } from "@/lib/feedback/rpc-error";
import { feedbackActionInputSchema } from "@/lib/feedback/schema";
import { readBoundedRequestText, RequestBodyTooLargeError } from "@/lib/http/bounded-body";
import { getOneSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 4_096;
const WINDOW_MS = 60 * 60 * 1_000;
const MAX_PER_WINDOW = 8;
const windows = new Map<string, { count: number; resetAt: number }>();
export async function POST(request: Request) {
  if (!isSameSiteRequest(request)) return response(403, "cross_origin", "Feedback accepts same-site requests only.");
  let text: string;
  try {
    text = await readBoundedRequestText(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return response(413, "request_too_large", "Feedback is limited to 2,000 characters.");
    throw error;
  }
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return response(400, "invalid_feedback", "Send a valid feedback object."); }
  const parsed = feedbackActionInputSchema.safeParse(raw);
  if (!parsed.success) return response(400, "invalid_feedback", "Choose yay or nay and keep optional feedback under 2,000 characters.");

  const access = await checkLabAccess(request, "feedback_submission", {
    endpointId: "feedback:submit",
    actorIntent: "human",
    durableRequired: true,
  });
  if (!access.allowed) return labAccessResponse(access);

  const rateLimit = consumeWindow(request);
  if (!rateLimit.allowed) {
    return Response.json({ ok: false, error: { code: "feedback_rate_limited", message: "Feedback intake needs a short rest. Please try again later." } }, {
      status: 429,
      headers: { "Cache-Control": "no-store", "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }

  const client = await getOneSupabaseServerClient();
  const guardToken = process.env.LAB_USAGE_GUARD_TOKEN?.trim();
  if (!client || !guardToken) return response(503, "feedback_unavailable", "Feedback storage is temporarily unavailable.");
  const { data, error } = await client.rpc("submit_feedback", {
    p_sentiment: parsed.data.sentiment,
    p_message: parsed.data.message,
    p_input_method: parsed.data.inputMethod,
    p_surface: parsed.data.surface,
    p_provider_id: parsed.data.providerId ?? null,
    p_guard_token: guardToken,
  });
  if (isFeedbackAdmissionLimit(error)) {
    return Response.json({
      ok: false,
      error: {
        code: "feedback_rate_limited",
        message: "Feedback intake needs a short rest. Please try again later.",
      },
    }, {
      status: 429,
      headers: { "Cache-Control": "no-store", "Retry-After": "3600" },
    });
  }
  if (error || typeof data !== "string") return response(503, "feedback_unavailable", "Feedback could not be saved. Please try again later.");

  return Response.json({ ok: true, feedbackId: data }, { status: 202, headers: { "Cache-Control": "no-store" } });
}

function response(status: number, code: string, message: string) {
  return Response.json({ ok: false, error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

function consumeWindow(request: Request) {
  const now = Date.now();
  for (const [key, value] of windows) if (value.resetAt <= now || windows.size > 1_000) windows.delete(key);
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
