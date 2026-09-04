import {
  clearFamiliarCareSession,
  createFamiliarCareReviewerSession,
  familiarCarePreviewEnabled,
  familiarCareSessionCookie,
  familiarCareSessionSecret,
  isHostedReviewMode,
} from "@/lib/familiar-care-session";
import { checkLabAccess, labAccessResponse } from "@/lib/access/lab-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const hosted = isHostedReviewMode();
  const access = await checkLabAccess(request, "session_creation", {
    endpointId: "deepgram:familiar-care-session",
    actorIntent: "human",
    durableRequired: hosted,
  });
  if (!access.allowed) return labAccessResponse(access);
  const result = createFamiliarCareReviewerSession({ hosted, enabled: familiarCarePreviewEnabled(), secret: familiarCareSessionSecret() });
  if (!result.ok) return Response.json({ ok: false, message: result.message }, { status: result.status });

  return Response.json(
    { ok: true, mode: result.mode, expires_in: result.expiresIn },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        ...(result.token ? { "Set-Cookie": familiarCareSessionCookie(result.token, hosted) } : {}),
      },
    },
  );
}

export async function DELETE() {
  return Response.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": clearFamiliarCareSession(),
      },
    },
  );
}
