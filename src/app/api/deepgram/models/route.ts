import { checkLabAccess, labAccessResponse } from "@/lib/access/lab-access";
import { formatRouteError } from "@/lib/deepgram";
import { resolveCatalogAdapter } from "@/lib/providers/adapters";
import {
  buildApiDebugEnvelope,
  buildInspectorRecord,
  createTimelineEvent,
  nowIso,
  queryFromUrl,
} from "@/lib/inspection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ENDPOINT = "https://api.deepgram.com/v1/models?include_outdated=false";
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const startedAt = nowIso();
  const timeline = [
    createTimelineEvent({
      type: "route.received",
      label: "Read-only model listing requested",
      detail: "This route performs no create, update, or delete operation.",
      at: startedAt,
    }),
    createTimelineEvent({
      type: "provider.catalog",
      label: "Reading validated static Deepgram model metadata",
      data: { source: "canonical-provider-adapter", method: "GET" },
    }),
  ];

  try {
    const access = await checkLabAccess(request, "provider_catalog", {
      providerId: "deepgram",
      endpointId: "deepgram:models",
      actorIntent: "human",
    });
    if (!access.allowed) return labAccessResponse(access);
    const result = await resolveCatalogAdapter("deepgram", "models").listModels({ signal: request.signal });
    const completedAt = nowIso();
    const summary = summarizeModels(result);
    const inspector = buildInspectorRecord({
      module: "Deepgram Models",
      startedAt,
      completedAt,
      request: {
        method: "GET",
        endpoint: ENDPOINT,
        query: queryFromUrl(ENDPOINT),
        headers: {
          Authorization: "Token server-side-key",
        },
      },
      response: {
        status: 200,
        headers: { "Content-Type": "application/json" },
        bodyPreview: result,
      },
      timeline: [
        ...timeline,
        createTimelineEvent({
          type: "provider.catalog",
          label: "Static model metadata returned",
          data: summary,
        }),
      ],
      notes: [
        "This compatibility route reads the canonical validated-static provider catalog; it does not contact Deepgram.",
        "Static catalog membership does not establish current account entitlement or provider availability.",
        "API Studio intentionally does not expose key, project, or account mutation routes.",
        "DEEPGRAM_API_KEY remains server-side and the Authorization header is redacted in the inspector.",
      ],
    });

    return Response.json(buildApiDebugEnvelope({ ok: true, data: result, inspector }), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    const { status, body } = formatRouteError(error);
    const completedAt = nowIso();
    const inspector = buildInspectorRecord({
      module: "Deepgram Models",
      startedAt,
      completedAt,
      request: {
        method: "GET",
        endpoint: ENDPOINT,
        query: queryFromUrl(ENDPOINT),
        headers: {
          Authorization: "Token server-side-key",
        },
      },
      response: {
        status,
        bodyPreview: body,
      },
      timeline: [
        ...timeline,
        createTimelineEvent({
          type: "models.error",
          label: body.message,
          data: body,
        }),
      ],
      notes: [
        "If the API key is missing, add DEEPGRAM_API_KEY to .env.local and restart the server.",
        "This local route is read-only; no Manage mutation is attempted on error or retry.",
        "The inspector redacts Authorization and credential-like fields from upstream error details.",
      ],
    });

    return Response.json(
      buildApiDebugEnvelope({
        ok: false,
        error: { message: body.message, code: String(status), details: body.details },
        inspector,
      }),
      { status, headers: NO_STORE_HEADERS },
    );
  }
}

function summarizeModels(value: { models: readonly unknown[]; discoveryState?: string }) {
  return {
    models: value.models.length,
    discoveryState: value.discoveryState ?? "static",
    totalRecognized: value.models.length,
  };
}
