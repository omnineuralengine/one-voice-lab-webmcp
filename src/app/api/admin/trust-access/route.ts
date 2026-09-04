import { readAdminTrustSummary, type TrustStateReader } from "@/lib/access/trust-state";
import { isSameSiteRequest } from "@/lib/http/same-site-request";
import { getOneSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isSameSiteRequest(request, { requireBrowserSignal: true })) {
    return errorResponse(403, "cross_origin", "Trust administration accepts same-site requests only.");
  }

  let reader: TrustStateReader | null = null;
  try {
    const client = await getOneSupabaseServerClient();
    if (client) {
      reader = {
        getUser: async () => client.auth.getUser(),
        rpc: async (name, args) => client.rpc(name, args),
      };
    }
  } catch {
    return errorResponse(503, "trust_state_unavailable", "Trust administration is temporarily unavailable.");
  }

  const result = await readAdminTrustSummary(reader, process.env.LAB_USAGE_GUARD_TOKEN);
  if (!result.ok) return errorResponse(result.status, result.code, result.message);
  return noStoreJson({ ok: true, summary: result.value });
}

function errorResponse(status: 403 | 503, code: string, message: string) {
  return noStoreJson({ ok: false, error: { code, message } }, status);
}

function noStoreJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Vary: "Cookie",
    },
  });
}
