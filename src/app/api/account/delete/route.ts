import { NextResponse } from "next/server";
import { z } from "zod";

import { ONE_LAB_SESSION_COOKIE } from "@/lib/access/session-cookie";
import { hasRecentAuthentication, resolveHumanIdentity } from "@/lib/auth/human-identity";
import { recordAuthEvent } from "@/lib/auth/observability";
import { BoundedJsonError, readBoundedJson } from "@/lib/http/bounded-json";
import { isSameSiteRequest } from "@/lib/http/same-site-request";
import { getOneSupabaseAdminClient } from "@/lib/supabase/admin";
import { getOneSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 256;
const inputSchema = z.object({
  confirmation: z.literal("DELETE MY ONE ACCOUNT"),
  acknowledgePermanent: z.literal(true),
}).strict();

export async function DELETE(request: Request) {
  if (!isSameSiteRequest(request, { requireBrowserSignal: true })) {
    return errorResponse(403, "cross_origin", "Account deletion accepts same-site browser requests only.");
  }
  let raw: unknown;
  try {
    raw = await readBoundedJson(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof BoundedJsonError) return errorResponse(error.status, error.code, error.message);
    throw error;
  }
  if (!inputSchema.safeParse(raw).success) {
    return errorResponse(400, "confirmation_required", "Type the exact confirmation before deleting the account.");
  }

  const client = await getOneSupabaseServerClient();
  const identity = await resolveHumanIdentity(client);
  if (identity.kind !== "human" || !client) {
    return errorResponse(
      identity.kind === "unavailable" ? 503 : 401,
      identity.kind === "unavailable" ? "auth_unavailable" : "authentication_required",
      identity.kind === "unavailable" ? "Account verification is temporarily unavailable." : "Sign in before deleting an account.",
    );
  }
  if (!hasRecentAuthentication(identity)) {
    return errorResponse(403, "recent_authentication_required", "Sign in again before permanently deleting this account.");
  }

  const admin = getOneSupabaseAdminClient();
  if (!admin) {
    return errorResponse(503, "account_deletion_not_configured", "Account deletion is not configured on this installation.");
  }

  // There is deliberately no caller-provided target ID. The privileged delete
  // can address only the auth subject derived from the verified user session.
  const { error } = await admin.auth.admin.deleteUser(identity.authSubjectId);
  if (error) return errorResponse(503, "account_deletion_failed", "The account was not deleted. Try again after signing in freshly.");

  await client.auth.signOut({ scope: "local" }).catch(() => undefined);
  recordAuthEvent("account_deletion_completed", { outcome: "succeeded" });
  const response = NextResponse.json({ ok: true, deleted: true }, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Clear-Site-Data": '"cache"',
      Vary: "Cookie",
    },
  });
  response.cookies.set({
    name: ONE_LAB_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: 0,
  });
  return response;
}

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" },
  });
}
