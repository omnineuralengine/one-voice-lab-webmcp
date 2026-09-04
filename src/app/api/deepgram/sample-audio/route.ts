import { checkLabAccess, labAccessResponse } from "@/lib/access/lab-access";
import { CURATED_PRERECORDED_SAMPLES, DEEPGRAM_MODELS_DOCS_URL } from "@/lib/deepgram-samples";
import { buildApiDebugEnvelope, buildInspectorRecord, createTimelineEvent, nowIso } from "@/lib/inspection";
import type { DeepgramSampleAudioData } from "@/types/deepgram-samples";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ENDPOINT = DEEPGRAM_MODELS_DOCS_URL;
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const startedAt = nowIso();
  const access = await checkLabAccess(request, "provider_catalog", {
    providerId: "deepgram",
    endpointId: "deepgram:sample-audio",
    actorIntent: "human",
  });
  if (!access.allowed) return labAccessResponse(access);
  const data = buildData(
    CURATED_PRERECORDED_SAMPLES,
    "available",
    "The curated Deepgram-hosted sample catalog is available without account-scoped model discovery; no provider request or transcription was attempted.",
  );
  return successResponse(data, startedAt, 0);
}

function buildData(samples: DeepgramSampleAudioData["samples"], metadataStatus: DeepgramSampleAudioData["metadataStatus"], note: string): DeepgramSampleAudioData {
  return { samples, metadataStatus, retrievedAt: nowIso(), note, docsUrl: DEEPGRAM_MODELS_DOCS_URL };
}

function successResponse(data: DeepgramSampleAudioData, startedAt: string, upstreamStatus: number) {
  const completedAt = nowIso();
  const inspector = buildInspectorRecord({
    module: "Deepgram-hosted sample audio",
    startedAt,
    completedAt,
    request: { method: "GET", endpoint: ENDPOINT, headers: { Authorization: "Token server-side-key" } },
    response: { status: 200, bodyPreview: data },
    timeline: [
      createTimelineEvent({ type: "samples.read", label: "Curated sample metadata read locally", at: startedAt, data: { source: ENDPOINT } }),
      createTimelineEvent({ type: "samples.sanitized", label: "Sanitized public sample catalog returned", data: { sampleCount: data.samples.length, metadataStatus: data.metadataStatus, upstreamStatus } }),
    ],
    notes: [
      "Only canonical model names, display metadata, language, accent, tags, and verified HTTPS Deepgram sample URLs are returned.",
      "No Management API response, project/account metadata, Authorization, or API key is read for this route.",
      "Loading sample metadata is read-only and does not submit audio for transcription.",
    ],
  });
  return Response.json(buildApiDebugEnvelope({ ok: true, data, inspector }), { headers: NO_STORE_HEADERS });
}
