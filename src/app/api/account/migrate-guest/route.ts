import { readOpaqueSessionCookie } from "@/lib/access/client-identity";
import { guestMigrationSnapshotSchema } from "@/lib/auth/guest-state";
import { migrateGuestState } from "@/lib/auth/guest-migration";
import { authErrorResponse, privateAuthJson } from "@/lib/auth/http";
import { resolveHumanIdentity } from "@/lib/auth/human-identity";
import { recordAuthEvent } from "@/lib/auth/observability";
import { BoundedJsonError, readBoundedJson } from "@/lib/http/bounded-json";
import { isSameSiteRequest } from "@/lib/http/same-site-request";
import { getOneSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 160_000;

export async function POST(request: Request) {
  if (!isSameSiteRequest(request, { requireBrowserSignal: true })) {
    return authErrorResponse(403, "cross_origin", "Guest-state import accepts same-site browser requests only.");
  }

  let raw: unknown;
  try {
    raw = await readBoundedJson(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof BoundedJsonError) return authErrorResponse(error.status, error.code, error.message);
    throw error;
  }
  const input = guestMigrationSnapshotSchema.safeParse(raw);
  if (!input.success) return authErrorResponse(400, "invalid_guest_state", "The on-device guest state is not eligible for import.");

  const client = await getOneSupabaseServerClient();
  const identity = await resolveHumanIdentity(client);
  if (identity.kind !== "human") {
    const unavailable = identity.kind === "unavailable";
    return authErrorResponse(
      unavailable ? 503 : 401,
      unavailable ? "auth_unavailable" : "authentication_required",
      unavailable ? "Account verification is temporarily unavailable." : "Sign in before importing guest state.",
    );
  }

  const guestSessionId = readOpaqueSessionCookie(request);
  if (!guestSessionId || !client) {
    return authErrorResponse(409, "guest_identity_unavailable", "This device's guest state could not be claimed safely.");
  }

  const result = await migrateGuestState(client, guestSessionId, input.data);
  if (!result) {
    recordAuthEvent("guest_migration_failed", { outcome: "failed", reason: "migration_unavailable" });
    return authErrorResponse(503, "migration_unavailable", "Guest state could not be imported. The local copy is unchanged.");
  }
  if (result.status === "claimed-by-another-account") {
    recordAuthEvent("guest_migration_failed", { outcome: "denied", reason: result.status });
    return authErrorResponse(409, result.status, "This device's guest state was already claimed by another account.");
  }
  if (result.status === "migration-limit-reached") {
    recordAuthEvent("guest_migration_failed", { outcome: "denied", reason: result.status });
    return authErrorResponse(409, result.status, "This account has reached the bounded device-import limit.");
  }

  recordAuthEvent("guest_migration_completed", { outcome: "succeeded", reason: result.status });
  return privateAuthJson({ ok: true, migration: result });
}
