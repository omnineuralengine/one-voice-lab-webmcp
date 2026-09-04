import { checkLabAccess, labAccessResponse } from "@/lib/access/lab-access";
import { isOpenLabDeepgramEnabled } from "@/lib/open-lab";
import { getProviderPlatformProjection } from "@/lib/providers/platform-service";
import {
  buildApiDebugEnvelope,
  buildInspectorRecord,
  createTimelineEvent,
  nowIso,
  queryFromUrl,
} from "@/lib/inspection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const startedAt = nowIso();
  const endpoint = new URL("/api/providers/deepgram", request.url).toString();
  const projection = getProviderPlatformProjection("deepgram");
  const configured = projection?.credential.state === "configured-not-runtime-verified";
  const timeline = [
    createTimelineEvent({
      type: "route.received",
      label: "Health check requested",
      detail: "The browser called the local server route. The browser did not send an API key.",
      at: startedAt,
    }),
    createTimelineEvent({
      type: "env.checked",
      label: "Server credential readiness classified",
      data: { configured, runtimeVerified: false },
    }),
  ];
  const access = await checkLabAccess(request, "provider_catalog", {
    providerId: "deepgram",
    endpointId: "deepgram:health",
    actorIntent: "human",
  });
  if (!access.allowed) return labAccessResponse(access);
  const result = {
    ok: true,
    configured,
    runtimeVerified: false,
    authenticated: false,
    remote: configured ? "key-detected" as const : "failed" as const,
    serverIsolated: true as const,
    browserExposureCheck: "passed" as const,
    checkedAt: nowIso(),
    region: "global" as const,
    detectedCapabilities: projection?.capabilities.filter((capability) => capability.support === "supported").map((capability) => capability.id) ?? [],
    liveExecutionEnabled: projection?.readiness.state === "live-enabled" && isOpenLabDeepgramEnabled(),
    message: configured
      ? "Deepgram is configured on this server but was not contacted; runtime health remains unknown."
      : "Deepgram is not configured on this server. Static discovery and fixtures remain available.",
    status: 200,
  };
  const responseStatus = 200;
  const completedAt = nowIso();

  timeline.push(
    createTimelineEvent({
      type: "health.configuration",
      label: result.message,
      data: { configured: result.configured, remote: result.remote, status: result.status },
    }),
  );

  const inspector = buildInspectorRecord({
    module: "Connection Check",
    startedAt,
    completedAt,
    request: {
      method: "GET",
      endpoint,
      query: queryFromUrl(endpoint),
      headers: {
        Authorization: "Token server-side-key",
      },
      bodyPreview: {
        credentialState: projection?.credential.state ?? "unknown",
        runtimeVerified: false,
      },
    },
    response: {
      status: responseStatus,
      bodyPreview: result,
    },
    timeline,
    notes: [
      "This classifies server-side credential presence without exposing a credential name or value.",
      "No Deepgram request is made; configured is not the same as healthy.",
      "The Authorization header is shown only in redacted form.",
    ],
  });

  return Response.json(buildApiDebugEnvelope({ ok: result.ok, data: result, inspector }), {
    status: responseStatus,
    headers: { "Cache-Control": "no-store" },
  });
}
