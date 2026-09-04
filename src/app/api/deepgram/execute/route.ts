import {
  checkLabAccess,
  labAccessResponse,
  precheckProviderLabAccess,
  runWithLabConcurrency,
  type LabUsageOperation,
} from "@/lib/access/lab-access";
import { validateAudioFile } from "@/lib/audio-file-policy";
import { canonicalOperationForEndpoint, executeDeepgramRequest, formatExecutorError } from "@/lib/deepgram-executor";
import { prerecordedMultipartBodyLimit, resolvePrerecordedUploadPolicy } from "@/lib/deepgram-prerecorded-policy";
import { DeepgramPolicyError, prepareDeepgramRequest } from "@/lib/deepgram-request-policy";
import {
  readBoundedMultipartFormData,
  readBoundedRequestText,
  RequestBodyTooLargeError,
} from "@/lib/http/bounded-body";
import { isOpenLabAccountDataEndpoint } from "@/lib/open-lab-endpoint-policy";
import { withProviderRequestGuard } from "@/lib/providers/request-guard";
import { authorizeProviderExecution } from "@/lib/providers/execution-policy";
import { inspectTrustedSttAudio } from "@/lib/stt-audio-admission";
import type { DeepgramExecuteInput } from "@/types/deepgram-endpoint-registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_JSON_BYTES = 1_000_000;
const LOCAL_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const NO_STORE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export async function POST(request: Request) {
  try {
    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      await precheckProviderLabAccess(request, "deepgram", "stt");
      const uploadPolicy = resolvePrerecordedUploadPolicy(LOCAL_MAX_UPLOAD_BYTES);
      const uploadLimitMb = Math.round(uploadPolicy.maxBytes / 1024 / 1024);
      const requestBodyLimit = prerecordedMultipartBodyLimit(uploadPolicy.maxBytes);
      if (declaredLength > requestBodyLimit) return tooLarge(`Audio upload request exceeds ${uploadLimitMb} MB.`);
      let form: FormData;
      try {
        form = await readBoundedMultipartFormData(request, requestBodyLimit);
      } catch (error) {
        if (error instanceof RequestBodyTooLargeError) return tooLarge(`Audio upload request exceeds ${uploadLimitMb} MB.`);
        throw error;
      }
      const file = form.get("file");
      if (!(file instanceof File) || !file.size || file.size > uploadPolicy.maxBytes) return tooLarge(`Choose a non-empty audio file under ${uploadLimitMb} MB.`);
      const input = parseInput(String(form.get("input") ?? "{}"));
      if (input.endpointId !== "stt-prerecorded") {
        return Response.json({ ok: false, error: { code: "binary_not_allowed", message: "Binary upload is only allowed for prerecorded STT." } }, { status: 400, headers: NO_STORE });
      }
      const validation = await validateAudioFile(file, { mode: uploadPolicy.mode });
      if (!validation.ok) {
        return Response.json({ ok: false, error: { code: "invalid_audio_file", message: validation.message } }, { status: 400, headers: NO_STORE });
      }
      const trustedAudio = await inspectTrustedSttAudio(file);
      if (!trustedAudio.ok) {
        return Response.json({ ok: false, error: { code: trustedAudio.code, message: trustedAudio.message } }, {
          status: trustedAudio.status,
          headers: NO_STORE,
        });
      }
      const prepared = prepareDeepgramRequest({ ...input, contentType: validation.mimeType });
      const access = await checkLabAccess(request, "speech_transcription", {
        providerId: "deepgram",
        endpointId: "deepgram:stt-prerecorded-upload",
        units: trustedAudio.audio.quotaUnits,
        actorIntent: "human",
        ...(process.env.NODE_ENV === "production" && isOpenLabAccountDataEndpoint(prepared.endpoint)
          ? { minimumTier: "admin" as const }
          : {}),
      });
      if (!access.allowed) return labAccessResponse(access);
      const authorization = await authorizeProviderExecution("deepgram", "stt");
      const result = await withProviderRequestGuard(request, "deepgram", "stt", async () =>
        executeDeepgramRequest(
          input,
          { bytes: await file.arrayBuffer(), contentType: validation.mimeType },
          { authorization, signal: request.signal },
        ));
      return Response.json(result, { status: result.ok ? 200 : result.status, headers: NO_STORE });
    }

    if (declaredLength > MAX_JSON_BYTES) return tooLarge("JSON request exceeds 1 MB.");
    let text: string;
    try {
      text = await readBoundedRequestText(request, MAX_JSON_BYTES);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) return tooLarge("JSON request exceeds 1 MB.");
      throw error;
    }
    const input = parseInput(text);
    const prepared = prepareDeepgramRequest(input);
    validateCostInput(input, prepared.body);
    const accountDataEndpoint = isOpenLabAccountDataEndpoint(prepared.endpoint);
    const operation = operationForEndpoint(input.endpointId);
    const canonicalOperation = canonicalOperationForEndpoint(input.endpointId);
    const access = await checkLabAccess(request, operation, {
      providerId: "deepgram",
      endpointId: `deepgram:${input.endpointId}`,
      units: usageUnitsForInput(input),
      actorIntent: "human",
      ...(process.env.NODE_ENV === "production" && accountDataEndpoint
        ? { minimumTier: "admin" as const }
        : {}),
    });
    if (!access.allowed) return labAccessResponse(access);
    const authorization = canonicalOperation
      ? await authorizeProviderExecution("deepgram", canonicalOperation)
      : undefined;
    let result;
    if (operation === "speech_generation" || operation === "speech_transcription") {
      result = await withProviderRequestGuard(
        request,
        "deepgram",
        operation === "speech_generation" ? "tts" : "stt",
        () => executeDeepgramRequest(input, undefined, { authorization, signal: request.signal }),
      );
    } else if (operation === "ai_reasoning") {
      const run = await runWithLabConcurrency(request, operation, {
        providerId: "deepgram",
        endpointId: `deepgram:${input.endpointId}`,
        actorIntent: "human",
      }, () => executeDeepgramRequest(input, undefined, { authorization, signal: request.signal }));
      if (!run.ok) return labAccessResponse(run.decision);
      result = run.value;
    } else {
      result = await executeDeepgramRequest(input, undefined, { authorization, signal: request.signal });
    }
    return Response.json(result, { status: result.ok ? 200 : result.status, headers: NO_STORE });
  } catch (error) {
    const formatted = formatExecutorError(error);
    return Response.json(formatted.body, { status: formatted.status, headers: NO_STORE });
  }
}

function operationForEndpoint(endpointId: string): LabUsageOperation {
  if (/tts|speak|voice-agent/i.test(endpointId)) return "speech_generation";
  if (/stt|listen|transcri/i.test(endpointId)) return "speech_transcription";
  if (/token|grant|realtime/i.test(endpointId)) return "realtime_session";
  if (/read|intelligence|analy/i.test(endpointId)) return "ai_reasoning";
  return "provider_catalog";
}

function usageUnitsForInput(input: DeepgramExecuteInput): number {
  if (input.body && typeof input.body === "object" && !Array.isArray(input.body)) {
    const body = input.body as Record<string, unknown>;
    if (typeof body.text === "string") return Math.min(10_000, Math.max(1, body.text.length));
    const ttl = body.ttl_seconds ?? body.ttlSeconds;
    if (typeof ttl === "number" && Number.isFinite(ttl)) return Math.min(10_000, Math.max(1, Math.ceil(ttl)));
  }
  return 1;
}

function validateCostInput(input: DeepgramExecuteInput, preparedBody: unknown): void {
  if (input.endpointId === "stt-prerecorded") {
    throw new DeepgramPolicyError(
      "JSON prerecorded transcription is disabled. Use the bounded WAV upload route so ONE can verify audio duration before provider dispatch.",
      503,
      "url_transcription_disabled",
    );
  }
  if (input.endpointId === "auth-token-grant") {
    throw new DeepgramPolicyError(
      "Temporary token grants are unavailable through the generic executor. Hosted issuance remains disabled pending authoritative replay and concurrency semantics.",
      503,
      "temporary_token_disabled",
    );
  }
  if (process.env.NODE_ENV !== "production" || input.endpointId !== "text-intelligence") return;
  if (hasStringField(preparedBody, "url")) {
    throw new DeepgramPolicyError(
      "Hosted Text Intelligence accepts bounded inline text only; URL ingestion is unavailable.",
      403,
      "hosted_url_input_locked",
    );
  }
  if (hasStringField(preparedBody, "text") && preparedBody.text.length > 10_000) {
    throw new DeepgramPolicyError(
      "Hosted Text Intelligence input is limited to 10,000 characters.",
      413,
      "input_too_large",
    );
  }
}

function hasStringField(value: unknown, field: string): value is Record<string, string> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    && typeof (value as Record<string, unknown>)[field] === "string"
    && ((value as Record<string, string>)[field]?.trim().length ?? 0) > 0;
}

function parseInput(value: string): DeepgramExecuteInput {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not object");
    return parsed as DeepgramExecuteInput;
  } catch {
    throw new DeepgramPolicyError("Invalid JSON request.", 400, "invalid_json");
  }
}

function tooLarge(message: string) {
  return Response.json({ ok: false, error: { code: "request_too_large", message } }, { status: 413, headers: NO_STORE });
}
