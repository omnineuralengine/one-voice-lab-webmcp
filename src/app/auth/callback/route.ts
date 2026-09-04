import { NextResponse } from "next/server";

import { readOpaqueSessionCookie } from "@/lib/access/client-identity";
import { resolveAuthCallbackRedirect } from "@/lib/auth/callback-redirect";
import { claimGuestMigration } from "@/lib/auth/guest-migration";
import { normalizedAuthErrorCode } from "@/lib/auth/http";
import { recordAuthEvent } from "@/lib/auth/observability";
import { getOneSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = resolveAuthCallbackRedirect(url.searchParams.get("next"), url.origin);
  const client = await getOneSupabaseServerClient();
  if (!client) return privateRedirect(new URL("/settings?auth=unavailable#identity", url.origin));
  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) {
      const guestSessionId = readOpaqueSessionCookie(request);
      const claim = guestSessionId ? await claimGuestMigration(client, guestSessionId) : null;
      if (guestSessionId && (!claim || claim.status === "migration-limit-reached")) {
        await client.auth.signOut({ scope: "local" }).catch(() => undefined);
        recordAuthEvent("guest_migration_failed", {
          outcome: "failed",
          reason: claim?.status ?? "claim_unavailable",
        });
        return privateRedirect(new URL("/settings?auth=claim-unavailable#identity", url.origin));
      }
      const target = new URL(next);
      target.searchParams.set("auth", "success");
      if (claim?.status === "claimed") {
        target.searchParams.set("migration", "available");
        recordAuthEvent("guest_migration_claimed", { outcome: "succeeded" });
      } else if (claim?.status === "claimed-by-another-account") {
        target.searchParams.set("migration", "claimed-by-another-account");
        recordAuthEvent("guest_migration_failed", { outcome: "denied", reason: claim.status });
      }
      recordAuthEvent("sign_in_succeeded", { outcome: "succeeded" });
      return privateRedirect(target);
    }
    recordAuthEvent("sign_in_failed", {
      outcome: "failed",
      reason: normalizedAuthErrorCode(error),
    });
  }
  return privateRedirect(new URL("/settings?auth=failed#identity", url.origin));
}

function privateRedirect(target: URL) {
  const response = NextResponse.redirect(target);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Vary", "Cookie");
  return response;
}
