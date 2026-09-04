import { isSameSiteRequest } from "@/lib/http/same-site-request";
import { resolveHumanIdentity } from "@/lib/auth/human-identity";
import { BoundedJsonError, readBoundedJson } from "@/lib/http/bounded-json";
import { parseCanonicalProviderPreferenceWrite } from "@/lib/providers/preference-schema";
import { readProviderPreferences, writeProviderPreferences } from "@/lib/providers/preferences";
import { getOneSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 8_192;

export async function GET(request: Request) {
  if (!isSameSiteRequest(request)) {
    return errorResponse(403, "cross_origin", "Provider preferences accept same-site requests only.");
  }
  const identity = await getIdentity();
  if (identity.kind === "guest") {
    return privateJson({ ok: true, mode: "guest", preferences: null });
  }
  if (identity.kind === "unavailable") {
    return errorResponse(503, "preferences_unavailable", "Synced provider preferences are temporarily unavailable.");
  }
  const result = await readProviderPreferences(identity.client, identity.userId);
  if (!result.ok) return errorResponse(503, "preferences_unavailable", "Synced provider preferences are temporarily unavailable.");
  return privateJson({ ok: true, mode: "account", preferences: result.value });
}

export async function PUT(request: Request) {
  if (!isSameSiteRequest(request, { requireBrowserSignal: true })) {
    return errorResponse(403, "cross_origin", "Provider preferences accept browser-initiated same-site requests only.");
  }
  let raw: unknown;
  try {
    raw = await readBoundedJson(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof BoundedJsonError) return errorResponse(error.status, error.code, error.message);
    throw error;
  }
  const input = parseCanonicalProviderPreferenceWrite(raw);
  if (!input) return errorResponse(400, "invalid_preferences", "Provider preferences contain unsupported or conflicting values.");

  const identity = await getIdentity();
  if (identity.kind === "guest") return errorResponse(401, "authentication_required", "Sign in to sync provider preferences.");
  if (identity.kind === "unavailable") return errorResponse(503, "preferences_unavailable", "Synced provider preferences are temporarily unavailable.");

  const result = await writeProviderPreferences(identity.client, identity.userId, input);
  if (!result.ok) {
    if (result.code === "conflict") return errorResponse(409, "preference_conflict", "Provider preferences changed elsewhere. Reload before saving again.");
    if (result.code === "invalid") return errorResponse(400, "invalid_preferences", "Provider preferences contain unsupported or conflicting values.");
    return errorResponse(503, "preferences_unavailable", "Provider preferences could not be saved.");
  }
  return privateJson({ ok: true, mode: "account", preferences: result.value });
}

async function getIdentity() {
  try {
    const client = await getOneSupabaseServerClient();
    const identity = await resolveHumanIdentity(client);
    if (identity.kind === "guest" || identity.kind === "invalid-session") return { kind: "guest" } as const;
    if (identity.kind !== "human" || !client) return { kind: "unavailable" } as const;
    return { kind: "account", client, userId: identity.humanId } as const;
  } catch {
    return { kind: "unavailable" } as const;
  }
}

function errorResponse(status: number, code: string, message: string) {
  return privateJson({ ok: false, error: { code, message } }, status);
}

function privateJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Vary: "Cookie",
    },
  });
}
