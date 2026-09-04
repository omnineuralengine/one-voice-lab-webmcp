import "server-only";

import { deriveLabClientIdentity } from "@/lib/access/client-identity";

const TOKEN_WINDOW_MS = 60_000;
const TOKEN_ATTEMPT_LIMIT = 6;

type AttemptBucket = { timestamps: number[] };

const attempts = new Map<string, AttemptBucket>();

export type TemporaryTokenBoundaryResult =
  | { allowed: true }
  | { allowed: false; status: 403 | 429; code: "cross_origin" | "hosted_realtime_disabled" | "rate_limited"; message: string; retryAfterSeconds?: number };

export function checkTemporaryTokenBoundary(
  request: Request,
  environment: Record<string, string | undefined> = process.env,
  now = Date.now(),
): TemporaryTokenBoundaryResult {
  if (environment.NODE_ENV === "production" || isEnabled(environment.HOSTED_REVIEW_MODE)) {
    return {
      allowed: false,
      status: 403,
      code: "hosted_realtime_disabled",
      message: "Temporary browser credentials are disabled in hosted environments.",
    };
  }

  if (!isSameOriginRequest(request)) {
    return {
      allowed: false,
      status: 403,
      code: "cross_origin",
      message: "Temporary credentials are available only to this application origin.",
    };
  }

  const clientKey = readClientKey(request);
  const recent = (attempts.get(clientKey)?.timestamps ?? []).filter((timestamp) => now - timestamp < TOKEN_WINDOW_MS);
  if (recent.length >= TOKEN_ATTEMPT_LIMIT) {
    return {
      allowed: false,
      status: 429,
      code: "rate_limited",
      message: "Please wait before requesting another temporary credential.",
      retryAfterSeconds: Math.max(1, Math.ceil((TOKEN_WINDOW_MS - (now - recent[0])) / 1_000)),
    };
  }

  attempts.set(clientKey, { timestamps: [...recent, now] });
  return { allowed: true };
}

export function isSameOriginRequest(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") return false;

  const origin = request.headers.get("origin");
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host"))?.split(",")[0]?.trim();
  if (!origin || !host) return false;

  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

export function resetTemporaryTokenBoundaryForTests() {
  attempts.clear();
}

function readClientKey(request: Request) {
  return deriveLabClientIdentity(request).clientHash;
}

function isEnabled(value: string | undefined) {
  return /^(?:1|true|yes|on)$/i.test(value?.trim() ?? "");
}
