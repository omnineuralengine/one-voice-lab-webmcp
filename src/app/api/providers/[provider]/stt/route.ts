import { z } from "zod";

import { enforceProviderLabAccess, precheckProviderLabAccess } from "@/lib/access/lab-access";
import { validateAudioFile } from "@/lib/audio-file-policy";
import { resolveSttAdapter } from "@/lib/providers/adapters";
import { readBoundedBody } from "@/lib/providers/bounded-body";
import { ProviderOperationError } from "@/lib/providers/errors";
import { authorizeProviderExecution } from "@/lib/providers/execution-policy";
import { providerErrorResponse, providerOperationMeta } from "@/lib/providers/operations";
import { withProviderRequestGuard } from "@/lib/providers/request-guard";
import { inspectTrustedSttAudio } from "@/lib/stt-audio-admission";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 50;

const fieldsSchema = z.object({
  model: z.string().trim().min(1).max(100),
  language: z.string().trim().max(32).regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/).optional(),
}).strict();

type ProviderRouteContext = { params: Promise<{ provider: string }> };

export async function POST(request: Request, context: ProviderRouteContext) {
  const { provider } = await context.params;
  const startedAt = Date.now();
  try {
    const adapter = resolveSttAdapter(provider);
    await precheckProviderLabAccess(request, provider, "stt");
    const maximumMegabytes = Math.floor(adapter.maxFileBytes / (1024 * 1024));
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("multipart/form-data;")) {
      throw operationError(provider, "unsupported_media_type", "Speech to Text accepts multipart/form-data only.", 415);
    }
    const body = await readBoundedBody(request, {
      maxBytes: adapter.maxFileBytes + 256 * 1024,
      providerId: provider,
      operation: "stt",
      message: `Audio uploads are limited to ${maximumMegabytes} MB in this provider API Studio.`,
    });
    const formBody = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
    const form = await new Response(formBody, { headers: { "Content-Type": contentType } }).formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw operationError(provider, "invalid_request", "Upload an audio file using the file form field.", 400);
    if (file.size > adapter.maxFileBytes) {
      throw operationError(provider, "input_too_large", `Audio uploads are limited to ${maximumMegabytes} MB in this provider API Studio.`, 413);
    }
    const language = readString(form, "language");
    const parsed = fieldsSchema.safeParse({
      model: readString(form, "model"),
      ...(language ? { language } : {}),
    });
    if (!parsed.success) throw operationError(provider, "invalid_request", "Choose an allowlisted provider model and optional language code.", 400);

    const validation = await validateAudioFile(file, { mode: "hosted" });
    if (!validation.ok) {
      const status = validation.code === "too-large" ? 413 : validation.code === "unsupported" ? 415 : 400;
      const code = status === 413 ? "input_too_large" : status === 415 ? "unsupported_media_type" : "invalid_request";
      throw operationError(provider, code, validation.message, status);
    }
    const trustedAudio = await inspectTrustedSttAudio(file);
    if (!trustedAudio.ok) {
      const code = trustedAudio.status === 413
        ? "input_too_large"
        : trustedAudio.status === 415
          ? "unsupported_media_type"
          : "invalid_request";
      throw operationError(provider, code, trustedAudio.message, trustedAudio.status);
    }
    await enforceProviderLabAccess(request, provider, "stt", {
      units: trustedAudio.audio.quotaUnits,
      endpointId: "provider:stt-upload",
      actorIntent: "human",
    });
    const authorization = adapter.requiresExplicitPolicyAuthorization
      ? await authorizeProviderExecution(provider, "stt")
      : undefined;
    const normalizedFile = file.type === validation.mimeType
      ? file
      : new File([await file.arrayBuffer()], file.name, { type: validation.mimeType, lastModified: file.lastModified });
    const result = await withProviderRequestGuard(request, provider, "stt", () => adapter.execute({
      file: normalizedFile,
      model: parsed.data.model,
      language: parsed.data.language,
    }, { signal: request.signal, authorization }));
    return Response.json({
      ok: true,
      data: result,
      meta: providerOperationMeta({
        provider,
        operation: "stt",
        startedAt,
        success: true,
        status: 200,
        requestId: result.requestId,
        requestMode: "live",
        executionDecision: authorization ? "allowed" : "not-evaluated",
        providerRequestSent: true,
      }),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return providerErrorResponse(error, { provider, operation: "stt", startedAt });
  }
}

function readString(form: FormData, key: string): string | undefined {
  const value = form.get(key);
  return typeof value === "string" ? value : undefined;
}

function operationError(
  providerId: string,
  code: ConstructorParameters<typeof ProviderOperationError>[0]["code"],
  message: string,
  status: number,
) {
  return new ProviderOperationError({ code, message, status, providerId, operation: "stt" });
}
