import "server-only";

import { z } from "zod";

import { enforceProviderLabAccess } from "@/lib/access/lab-access";
import { getProviderAdapterRegistration, resolveTtsAdapter } from "@/lib/providers/adapters";
import { readBoundedBody } from "@/lib/providers/bounded-body";
import { ProviderOperationError } from "@/lib/providers/errors";
import { authorizeProviderExecution } from "@/lib/providers/execution-policy";
import { providerErrorResponse, providerOperationMeta } from "@/lib/providers/operations";
import { withProviderRequestGuard } from "@/lib/providers/request-guard";
import type { ProviderTtsRequest } from "@/lib/providers/types";

const requestSchema = z.object({
  text: z.string().trim().min(1).max(2_000),
  model: z.string().trim().min(1).max(100).optional(),
  voice: z.string().trim().min(1).max(100).optional(),
  outputFormat: z.string().trim().min(1).max(80).optional(),
  encoding: z.string().trim().min(1).max(40).optional(),
  container: z.string().trim().min(1).max(40).optional(),
  sample_rate: z.number().int().positive().max(192_000).optional(),
}).strict();

export async function handleProviderTtsAudioPost(request: Request, providerId: string) {
  const startedAt = Date.now();
  try {
    const parsed = requestSchema.safeParse(await readJsonBody(request, providerId));
    if (!parsed.success) {
      const tooLarge = parsed.error.issues.some((issue) => issue.path[0] === "text" && issue.code === "too_big");
      throw new ProviderOperationError({
        code: tooLarge ? "input_too_large" : "invalid_request",
        message: "Send a bounded Text to Speech request using only allowlisted fields.",
        status: tooLarge ? 413 : 400,
        providerId,
        operation: "tts",
      });
    }
    const adapter = resolveTtsAdapter(providerId);
    await enforceProviderLabAccess(request, providerId, "tts", {
      units: parsed.data.text.length,
      endpointId: "provider:tts-audio",
      actorIntent: "human",
    });
    const authorization = adapter.requiresExplicitPolicyAuthorization
      ? await authorizeProviderExecution(providerId, "tts")
      : undefined;
    const catalog = getProviderAdapterRegistration(providerId)?.catalog;
    const modelDiscoveryAuthorization = catalog?.modelsRequireExecutionAuthorization && parsed.data.model
      ? await authorizeProviderExecution(providerId, "models")
      : undefined;
    const discoveryAuthorization = catalog?.voicesRequireExecutionAuthorization && parsed.data.voice
      ? await authorizeProviderExecution(providerId, "voices")
      : undefined;
    const result = await withProviderRequestGuard(request, providerId, "tts", () =>
      adapter.execute(parsed.data as ProviderTtsRequest, {
        signal: request.signal,
        authorization,
        modelDiscoveryAuthorization,
        discoveryAuthorization,
      }),
    );
    const meta = providerOperationMeta({
      provider: providerId,
      operation: "tts",
      startedAt,
      success: true,
      status: 200,
      requestId: result.requestId,
      requestMode: "live",
      executionDecision: authorization ? "allowed" : "not-evaluated",
      providerRequestSent: true,
    });

    return new Response(result.audio, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": "no-store",
        "Content-Disposition": "inline",
        "X-Voice-Lab-Provider": providerId,
        "X-Voice-Lab-Model": result.model,
        "X-Voice-Lab-Server-Duration-Ms": String(meta.durationMs),
        "X-Voice-Lab-Time-To-First-Audio-Ms": String(result.timing.timeToFirstAudioMs),
        "X-Voice-Lab-Provider-Total-Ms": String(result.timing.totalTimeMs),
        "X-Voice-Lab-Correlation-Id": meta.correlationId,
        ...(result.voice ? { "X-Voice-Lab-Voice": result.voice } : {}),
        ...(result.outputFormat ? { "X-Voice-Lab-Output-Format": result.outputFormat } : {}),
        ...(result.requestId ? { "X-Voice-Lab-Upstream-Request-Id": result.requestId } : {}),
        ...(result.responseHeaders["character-cost"] ? { "X-Voice-Lab-Character-Cost": result.responseHeaders["character-cost"] } : {}),
      },
    });
  } catch (error) {
    return providerErrorResponse(error, { provider: providerId, operation: "tts", startedAt });
  }
}

async function readJsonBody(request: Request, providerId: string): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new ProviderOperationError({
      code: "unsupported_media_type",
      message: "Text to Speech accepts application/json only.",
      status: 415,
      providerId,
      operation: "tts",
    });
  }
  const bytes = await readBoundedBody(request, {
    maxBytes: 16 * 1024,
    providerId,
    operation: "tts",
    message: "Text to Speech request bodies are limited to 16 KB.",
  });
  const raw = new TextDecoder().decode(bytes);
  try {
    return JSON.parse(raw);
  } catch {
    throw new ProviderOperationError({
      code: "invalid_request",
      message: "Send valid JSON for Text to Speech.",
      status: 400,
      providerId,
      operation: "tts",
    });
  }
}
