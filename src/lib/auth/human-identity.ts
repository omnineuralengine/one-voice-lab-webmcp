import "server-only";

import { isOneHumanAuthSubject, type OneHumanAuthSubject } from "@/lib/auth/human-subject";

export type HumanAssuranceLevel = "aal1" | "aal2" | "unknown";

export type HumanPrincipal = Readonly<{
  kind: "human";
  humanId: string;
  authSubjectId: string;
  assuranceLevel: HumanAssuranceLevel;
  authenticatedAt: string | null;
  sessionId: string | null;
}>;

export type HumanIdentityResolution =
  | HumanPrincipal
  | Readonly<{ kind: "guest" }>
  | Readonly<{ kind: "invalid-session" }>
  | Readonly<{ kind: "unavailable" }>;

export type HumanIdentityAuthClient = Readonly<{
  auth: Readonly<{
    getUser: () => Promise<{
      data: { user: OneHumanAuthSubject | null };
      error?: unknown;
    }>;
    getClaims?: () => Promise<{
      data: { claims?: Record<string, unknown> } | null;
      error?: unknown;
    }>;
  }>;
}>;

/**
 * Resolve the application human from a server-verified Supabase session.
 *
 * In the current one-to-one model, the application human ID is anchored to
 * the Supabase auth subject UUID. Keeping both names here prevents callers
 * from treating an arbitrary browser-supplied UUID as ownership authority and
 * leaves room for future organization and machine identities.
 */
export async function resolveHumanIdentity(
  client: HumanIdentityAuthClient | null,
): Promise<HumanIdentityResolution> {
  if (!client) return { kind: "unavailable" };

  try {
    const userResult = await client.auth.getUser();
    if (userResult.error) return { kind: "invalid-session" };
    if (!userResult.data.user) return { kind: "guest" };
    if (!isOneHumanAuthSubject(userResult.data.user)) return { kind: "invalid-session" };

    let claims: Record<string, unknown> | null = null;
    if (client.auth.getClaims) {
      try {
        const claimResult = await client.auth.getClaims();
        if (!claimResult.error && claimResult.data?.claims) claims = claimResult.data.claims;
      } catch {
        // A verified user remains authenticated for ordinary owner operations.
        // Sensitive actions fail closed when assurance metadata is unavailable.
      }
    }

    const sessionId = claims?.sub === userResult.data.user.id && claims?.is_anonymous !== true
      ? readBoundedClaim(claims.session_id)
      : null;
    const sessionClaimsAreBound = Boolean(sessionId);

    return {
      kind: "human",
      humanId: userResult.data.user.id,
      authSubjectId: userResult.data.user.id,
      assuranceLevel: sessionClaimsAreBound ? readAssuranceLevel(claims?.aal) : "unknown",
      authenticatedAt: sessionClaimsAreBound ? readCurrentSessionAuthentication(claims?.amr) : null,
      sessionId,
    };
  } catch {
    return { kind: "unavailable" };
  }
}

export function hasRecentAuthentication(
  principal: HumanPrincipal,
  now = Date.now(),
  maximumAgeMs = 10 * 60 * 1_000,
): boolean {
  if (!principal.authenticatedAt || maximumAgeMs <= 0) return false;
  const authenticatedAt = Date.parse(principal.authenticatedAt);
  if (!Number.isFinite(authenticatedAt)) return false;
  const age = now - authenticatedAt;
  return age >= 0 && age <= maximumAgeMs;
}

function readAssuranceLevel(value: unknown): HumanAssuranceLevel {
  return value === "aal1" || value === "aal2" ? value : "unknown";
}

function readCurrentSessionAuthentication(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  let latestSeconds: number | null = null;
  for (const rawEntry of value) {
    if (!rawEntry || typeof rawEntry !== "object") continue;
    const entry = rawEntry as Record<string, unknown>;
    if (typeof entry.method !== "string" || entry.method.length === 0 || entry.method.length > 64) continue;
    const method = entry.method.toLowerCase();
    if (method === "refresh" || method === "refresh_token" || method === "token_refresh") continue;
    if (typeof entry.timestamp !== "number" || !Number.isSafeInteger(entry.timestamp) || entry.timestamp <= 0) continue;
    latestSeconds = latestSeconds === null ? entry.timestamp : Math.max(latestSeconds, entry.timestamp);
  }
  if (latestSeconds === null) return null;
  const milliseconds = latestSeconds * 1_000;
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

function readBoundedClaim(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 160 ? value : null;
}
