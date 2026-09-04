import { z } from "zod";

import { deriveLabClientIdentity } from "@/lib/access/client-identity";
import { authErrorResponse, humanAuthMessage, normalizedAuthErrorCode, privateAuthJson } from "@/lib/auth/http";
import { recordAuthEvent } from "@/lib/auth/observability";
import { BoundedJsonError, readBoundedJson } from "@/lib/http/bounded-json";
import { isSameSiteRequest } from "@/lib/http/same-site-request";
import { getOneSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 1_024;
const WINDOW_MS = 10 * 60 * 1_000;
const MAX_ATTEMPTS = 5;
const attempts = new Map<string, { count: number; resetAt: number }>();

const inputSchema = z.object({
  email: z.email().max(254),
  next: z.enum(["/settings", "/settings#identity"]).default("/settings#identity"),
}).strict();

export async function POST(request: Request) {
  if (!isSameSiteRequest(request, { requireBrowserSignal: true })) {
    return authErrorResponse(403, "cross_origin", "Sign-in requests must come from this ONE installation.");
  }

  let raw: unknown;
  try {
    raw = await readBoundedJson(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof BoundedJsonError) return authErrorResponse(error.status, error.code, error.message);
    throw error;
  }
  const input = inputSchema.safeParse(raw);
  if (!input.success) return authErrorResponse(400, "invalid_sign_in_request", "Enter a valid email address.");

  const rateLimit = consumeAttempt(request);
  if (!rateLimit.allowed) {
    recordAuthEvent("sign_in_failed", { outcome: "denied", reason: "rate_limited" });
    return privateAuthJson({
      ok: false,
      error: { code: "rate_limited", message: humanAuthMessage("rate_limited") },
    }, 429, { "Retry-After": String(rateLimit.retryAfterSeconds) });
  }

  const client = await getOneSupabaseServerClient();
  if (!client) return authErrorResponse(503, "auth_unavailable", humanAuthMessage("auth_unavailable"));

  const callback = new URL("/auth/callback", request.url);
  callback.searchParams.set("next", input.data.next);
  recordAuthEvent("sign_in_requested", { outcome: "accepted" });
  const { error } = await client.auth.signInWithOtp({
    email: input.data.email,
    options: {
      emailRedirectTo: callback.toString(),
      shouldCreateUser: true,
    },
  });
  if (error) {
    const code = normalizedAuthErrorCode(error);
    recordAuthEvent("sign_in_failed", { outcome: "failed", reason: code });
    return authErrorResponse(code === "rate_limited" ? 429 : 503, code, humanAuthMessage(code));
  }

  // This deliberately does not reveal whether an account already existed.
  return privateAuthJson({
    ok: true,
    message: "If the address can receive ONE sign-in mail, a secure link is on its way.",
  }, 202);
}

function consumeAttempt(request: Request) {
  const now = Date.now();
  for (const [key, state] of attempts) {
    if (state.resetAt <= now || attempts.size > 2_000) attempts.delete(key);
  }
  const key = deriveLabClientIdentity(request).sessionHash;
  const current = attempts.get(key);
  const next = !current || current.resetAt <= now
    ? { count: 1, resetAt: now + WINDOW_MS }
    : { count: current.count + 1, resetAt: current.resetAt };
  attempts.set(key, next);
  return {
    allowed: next.count <= MAX_ATTEMPTS,
    retryAfterSeconds: Math.max(1, Math.ceil((next.resetAt - now) / 1_000)),
  };
}
