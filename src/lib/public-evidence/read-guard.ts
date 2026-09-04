import "server-only";

import { deriveLabClientIdentity } from "@/lib/access/client-identity";

type WindowState = Readonly<{ count: number; resetAt: number }>;

const WINDOW_MS = 60_000;
const CLIENT_LIMIT = 120;
const INSTANCE_LIMIT = 1_200;
const MAX_CLIENT_WINDOWS = 2_000;
const clientWindows = new Map<string, WindowState>();
let instanceWindow: WindowState = { count: 0, resetAt: 0 };

export type PublicReadDecision = Readonly<{
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}>;

/**
 * A small per-instance burst boundary for nonbillable public REST and MCP
 * reads. This intentionally complements, rather than claims to replace,
 * durable edge/WAF rate limiting in a horizontally scaled deployment.
 */
export function checkPublicReadAccess(
  request: Request,
  scope: string,
  now = Date.now(),
): PublicReadDecision {
  prune(now);
  const identity = deriveLabClientIdentity(request);
  const key = `${identity.clientHash}:${boundedScope(scope)}`;
  const client = consume(clientWindows.get(key), CLIENT_LIMIT, now);
  clientWindows.set(key, client);
  instanceWindow = consume(instanceWindow, INSTANCE_LIMIT, now);

  const clientAllowed = client.count <= CLIENT_LIMIT;
  const instanceAllowed = instanceWindow.count <= INSTANCE_LIMIT;
  const resetAt = Math.max(client.resetAt, instanceWindow.resetAt);
  return {
    allowed: clientAllowed && instanceAllowed,
    limit: CLIENT_LIMIT,
    remaining: Math.max(0, Math.min(CLIENT_LIMIT - client.count, INSTANCE_LIMIT - instanceWindow.count)),
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1_000)),
  };
}

export function publicReadRateLimitResponse(decision: PublicReadDecision): Response {
  return Response.json({
    schemaVersion: "1.0.0",
    error: {
      code: "public_read_rate_limited",
      message: "The public read interface reached its short burst limit. Retry after the indicated interval.",
      retryable: true,
    },
  }, {
    status: 429,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Retry-After": String(decision.retryAfterSeconds),
      "X-RateLimit-Limit": String(decision.limit),
      "X-RateLimit-Remaining": String(decision.remaining),
    },
  });
}

export function resetPublicReadGuardForTests(): void {
  if (process.env.NODE_ENV !== "production") {
    clientWindows.clear();
    instanceWindow = { count: 0, resetAt: 0 };
  }
}

function boundedScope(value: string): string {
  return /^[a-z0-9._:/-]{1,80}$/i.test(value) ? value : "public-read";
}

function consume(current: WindowState | undefined, limit: number, now: number): WindowState {
  if (!current || current.resetAt <= now) return { count: 1, resetAt: now + WINDOW_MS };
  return { count: Math.min(current.count + 1, limit + 1), resetAt: current.resetAt };
}

function prune(now: number): void {
  for (const [key, value] of clientWindows) {
    if (value.resetAt <= now || clientWindows.size > MAX_CLIENT_WINDOWS) clientWindows.delete(key);
  }
  if (instanceWindow.resetAt <= now) instanceWindow = { count: 0, resetAt: now + WINDOW_MS };
}
