import { checkLabAccess, labAccessResponse, precheckProviderLabAccess } from "@/lib/access/lab-access";
import { audioUploadLimit } from "@/lib/audio-file-policy";
import { DeepgramValidationError, formatRouteError, transcribeAudioFile, validateTranscriptionAudioFile } from "@/lib/deepgram";
import { prerecordedMultipartBodyLimit, resolvePrerecordedUploadPolicy } from "@/lib/deepgram-prerecorded-policy";
import { readBoundedMultipartFormData, RequestBodyTooLargeError } from "@/lib/http/bounded-body";
import {
  buildApiDebugEnvelope,
  buildInspectorRecord,
  createTimelineEvent,
  nowIso,
  queryFromUrl,
} from "@/lib/inspection";
import type { TranscriptionRequestOptions } from "@/lib/types";
import { ObservatoryConcurrencyError, withObservatoryServerGuard } from "@/lib/observatory/server-credit-guard";
import { ProviderOperationError } from "@/lib/providers/errors";
import { authorizeProviderExecution } from "@/lib/providers/execution-policy";
import { withProviderRequestGuard } from "@/lib/providers/request-guard";
import { inspectTrustedSttAudio } from "@/lib/stt-audio-admission";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(request: Request) {
  const startedAt = nowIso();
  let options: TranscriptionRequestOptions = {};
  let filePreview: Record<string, unknown> = {};
  let endpoint = buildListenEndpointPreview(options);
  const timeline = [
    createTimelineEvent({
      type: "route.received",
      label: "Audio file transcription requested",
      detail: "The browser posted multipart form data to the local server route.",
      at: startedAt,
    }),
  ];

  try {
    await precheckProviderLabAccess(request, "deepgram", "stt");
    const uploadPolicy = resolvePrerecordedUploadPolicy(audioUploadLimit("local"));
    let formData: FormData;
    try {
      formData = await readBoundedMultipartFormData(request, prerecordedMultipartBodyLimit(uploadPolicy.maxBytes));
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        throw new DeepgramValidationError(`Audio upload request exceeds ${Math.round(uploadPolicy.maxBytes / 1024 / 1024)} MB.`, 413);
      }
      throw error;
    }
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new DeepgramValidationError("Upload an audio file using the form field named file.");
    }

    options = {
      model: readFormString(formData, "model"),
      smart_format: readFormBoolean(formData, "smart_format"),
      diarize: readFormBoolean(formData, "diarize"),
      diarize_model: readFormString(formData, "diarize_model"),
      language: readFormString(formData, "language"),
      punctuate: readFormBoolean(formData, "punctuate"),
      utterances: readFormBoolean(formData, "utterances"),
      paragraphs: readFormBoolean(formData, "paragraphs"),
      numerals: readFormBoolean(formData, "numerals"),
      detect_language: readFormBoolean(formData, "detect_language"),
      multichannel: readFormBoolean(formData, "multichannel"),
      keyterm: readFormString(formData, "keyterm"),
      redact: readFormStrings(formData, "redact"),
      tag: readFormTag(formData, "tag"),
      observatory: readFormBoolean(formData, "observatory"),
      duration_ms: readFormString(formData, "duration_ms"),
    };
    endpoint = buildListenEndpointPreview(options);
    filePreview = {
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    };
    timeline.push(
      createTimelineEvent({
        type: "file.received",
        label: "Audio file received by server",
        data: filePreview,
      }),
      createTimelineEvent({
        type: "deepgram.request.prepared",
        label: "Prepared bounded Deepgram request",
        data: { endpoint, bodyPreview: { ...options, file: filePreview } },
      }),
    );

    await validateTranscriptionAudioFile(file, options);
    const trustedAudio = await inspectTrustedSttAudio(file);
    if (!trustedAudio.ok) {
      throw new DeepgramValidationError(trustedAudio.message, trustedAudio.status);
    }
    filePreview = {
      ...filePreview,
      trustedDurationMilliseconds: trustedAudio.audio.durationMilliseconds,
      usageUnit: "audio-second",
    };
    const access = await checkLabAccess(request, "speech_transcription", {
      providerId: "deepgram",
      endpointId: "deepgram:transcribe-file",
      units: trustedAudio.audio.quotaUnits,
      actorIntent: "human",
    });
    if (!access.allowed) return labAccessResponse(access);

    const authorization = await authorizeProviderExecution("deepgram", "stt");
    const result = await withProviderRequestGuard(request, "deepgram", "stt", () =>
      options.observatory
        ? withObservatoryServerGuard("prerecorded-file-stt", () => transcribeAudioFile(file, options, { signal: request.signal, authorization }))
        : transcribeAudioFile(file, options, { signal: request.signal, authorization }));
    const completedAt = nowIso();
    const metadata = extractTranscriptionMetadata(result.raw);
    const inspector = buildInspectorRecord({
      module: "Upload Audio File",
      startedAt,
      completedAt,
      request: {
        method: "POST",
        endpoint,
        query: queryFromUrl(endpoint),
        headers: {
          Authorization: "Token server-side-key",
          "Content-Type": file.type || "application/octet-stream",
        },
        bodyPreview: {
          ...options,
          file: filePreview,
          binaryAudio: "***not included***",
        },
      },
      response: {
        status: 200,
        bodyPreview: {
          transcript: result.transcript,
          transcriptPath: "results.channels[0].alternatives[0].transcript",
          metadata,
          raw: result.raw,
        },
      },
      timeline: [
        ...timeline,
        createTimelineEvent({
          type: "deepgram.response",
          label: "File transcription response received",
          data: metadata,
        }),
      ],
      notes: [
        "This route uploads audio bytes from the browser to this server, then forwards them to Deepgram.",
        "The request body preview shows file metadata, not binary audio bytes.",
        "The transcript usually lives at results.channels[0].alternatives[0].transcript.",
      ],
    });
    return Response.json(buildApiDebugEnvelope({ ok: true, data: result, inspector }), { headers: NO_STORE });
  } catch (error) {
    const { status, body } = error instanceof ObservatoryConcurrencyError
      ? { status: error.status, body: { ok: false as const, message: error.message, status: error.status } }
      : error instanceof ProviderOperationError
        ? { status: error.status, body: { ok: false as const, message: error.message, status: error.status, details: { code: error.code } } }
      : formatRouteError(error);
    const completedAt = nowIso();
    const inspector = buildInspectorRecord({
      module: "Upload Audio File",
      startedAt,
      completedAt,
      request: {
        method: "POST",
        endpoint,
        query: queryFromUrl(endpoint),
        headers: {
          Authorization: "Token server-side-key",
        },
        bodyPreview: {
          ...options,
          file: filePreview,
          binaryAudio: "***not included***",
        },
      },
      response: {
        status,
        bodyPreview: body,
      },
      timeline: [
        ...timeline,
        createTimelineEvent({
          type: "transcription.error",
          label: body.message,
          data: body,
        }),
      ],
      notes: [
        "If the file is missing, confirm the multipart field is named file.",
        "If transcription fails, check MIME type, file size, and Deepgram response details.",
      ],
    });
    return Response.json(
      buildApiDebugEnvelope({
        ok: false,
        error: { message: body.message, code: String(status), details: body.details },
        inspector,
      }),
      { status, headers: NO_STORE },
    );
  }
}

function readFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

function readFormBoolean(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value === "true" : undefined;
}

function readFormStrings(formData: FormData, key: string) {
  return formData.getAll(key).filter((value): value is string => typeof value === "string");
}

function readFormTag(formData: FormData, key: string): TranscriptionRequestOptions["tag"] {
  const value = readFormString(formData, key);
  return value === "avs_observatory_live" || value === "avs_stt_experiment" || value === "avs_round_trip" ? value : undefined;
}

function buildListenEndpointPreview(payload: TranscriptionRequestOptions) {
  const endpoint = new URL("https://api.deepgram.com/v1/listen");
  const detectLanguage = payload.detect_language === true || payload.detect_language === "true";
  endpoint.searchParams.set("model", payload.model || "nova-3");
  if (!detectLanguage) endpoint.searchParams.set("language", payload.language || "en");
  endpoint.searchParams.set("smart_format", String(payload.smart_format ?? true));
  if (payload.diarize_model && payload.diarize_model !== "none") endpoint.searchParams.set("diarize_model", payload.diarize_model);
  else endpoint.searchParams.set("diarize", String(payload.diarize ?? false));
  endpoint.searchParams.set("punctuate", String(payload.punctuate ?? true));
  endpoint.searchParams.set("utterances", String(payload.utterances ?? false));
  endpoint.searchParams.set("paragraphs", String(payload.paragraphs ?? false));
  endpoint.searchParams.set("numerals", String(payload.numerals ?? false));
  endpoint.searchParams.set("detect_language", String(payload.detect_language ?? false));
  endpoint.searchParams.set("multichannel", String(payload.multichannel ?? false));
  for (const keyterm of (payload.keyterm || "").split(",").map((item) => item.trim()).filter(Boolean)) endpoint.searchParams.append("keyterm", keyterm);
  for (const value of payload.redact ?? []) endpoint.searchParams.append("redact", value);
  if (payload.tag) endpoint.searchParams.set("tag", payload.tag);
  return endpoint.toString();
}

function extractTranscriptionMetadata(raw: unknown) {
  const data = raw as {
    metadata?: {
      request_id?: string;
      duration?: number;
      channels?: number;
      model_info?: unknown;
    };
  };

  return {
    request_id: data.metadata?.request_id,
    duration: data.metadata?.duration,
    channels: data.metadata?.channels,
    model_info: data.metadata?.model_info,
  };
}
