import { readOpaqueSessionCookie } from "@/lib/access/client-identity";
import { claimGuestMigration } from "@/lib/auth/guest-migration";
import { authErrorResponse, privateAuthJson } from "@/lib/auth/http";
import { resolveHumanIdentity } from "@/lib/auth/human-identity";
import { recordAuthEvent } from "@/lib/auth/observability";
import { isSameSiteRequest } from "@/lib/http/same-site-request";
import { getOneSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Bind this browser's opaque guest receipt to the first verified human that
 * signs in. No guest payload or browser-supplied owner identifier is accepted.
 */
export async function POST(request: Request) {
  if (!isSameSiteRequest(request, {
    requireBrowserSignal: true,
    allowHostHeaderFallback: true,
  })) {
    return authErrorResponse(403, "cross_origin", "Guest-state claiming accepts same-site browser requests only.");
  }

  const client = await getOneSupabaseServerClient();
  const identity = await resolveHumanIdentity(client);
  if (identity.kind !== "human" || !client) {
    return authErrorResponse(
      identity.kind === "unavailable" ? 503 : 401,
      identity.kind === "unavailable" ? "auth_unavailable" : "authentication_required",
      identity.kind === "unavailable" ? "Account verification is temporarily unavailable." : "Sign in before claiming guest state.",
    );
  }

  const guestSessionId = readOpaqueSessionCookie(request);
  if (!guestSessionId) {
    return privateAuthJson({ ok: true, humanId: identity.humanId, claim: { status: "no-guest-receipt" } });
  }

  const claim = await claimGuestMigration(client, guestSessionId);
  if (!claim) {
    recordAuthEvent("guest_migration_failed", { outcome: "failed", reason: "claim_unavailable" });
    return authErrorResponse(503, "claim_unavailable", "Guest state could not be bound safely. Sign-in remains paused.");
  }
  if (claim.status === "claimed-by-another-account") {
    recordAuthEvent("guest_migration_failed", { outcome: "denied", reason: claim.status });
    return privateAuthJson({
      ok: false,
      humanId: identity.humanId,
      error: {
        code: claim.status,
        message: "This browser's earlier guest state belongs to another account.",
      },
    }, 409);
  }
  if (claim.status === "migration-limit-reached") {
    recordAuthEvent("guest_migration_failed", { outcome: "denied", reason: claim.status });
    return authErrorResponse(409, claim.status, "This account cannot claim another guest receipt.");
  }

  recordAuthEvent("guest_migration_claimed", { outcome: "succeeded", reason: claim.status });
  return privateAuthJson({ ok: true, humanId: identity.humanId, claim });
}
