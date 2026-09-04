import { DeepgramValidationError, formatRouteError } from "@/lib/deepgram";
import { deriveLabClientIdentity } from "@/lib/access/client-identity";
import { enforceProviderLabAccess } from "@/lib/access/lab-access";
import { sanitizeFamiliarCareRequest, validateFamiliarCareRequest } from "@/lib/familiar-care";
import {
  authorizeFamiliarCarePreview,
  familiarCarePreviewEnabled,
  familiarCareSessionSecret,
  isHostedReviewMode,
} from "@/lib/familiar-care-session";
import {
  buildApiDebugEnvelope,
  buildInspectorRecord,
  createTimelineEvent,
  nowIso,
  queryFromUrl,
} from "@/lib/inspection";
import { readBoundedRequestText, RequestBodyTooLargeError } from "@/lib/http/bounded-body";
import { ObservatoryConcurrencyError, withObservatoryServerGuard } from "@/lib/observatory/server-credit-guard";
import { isOpenLabMode } from "@/lib/open-lab";
import { resolveTtsAdapter } from "@/lib/providers/adapters";
import { ProviderAdapterError, ProviderOperationError } from "@/lib/providers/errors";
import { authorizeProviderExecution } from "@/lib/providers/execution-policy";
import { requireProviderManifest } from "@/lib/providers/registry";
import { withProviderRequestGuard } from "@/lib/providers/request-guard";
import type { TtsRequest } from "@/lib/types";
import { z } from "zod";

const GENERATED_AUDIO = new Map<
  string,
  {
    audio: ArrayBuffer;
    contentType: string;
    model: string;
    providerId: string;
    ownerClientHash: string;
    ownerSessionHash: string;
    createdAt: number;
    requestId?: string;
  }
>();
const MAX_TTS_REQUEST_BYTES = 16 * 1_024;
const ttsRequestSchema = z.object({
  text: z.string().trim().min(1).max(2_000),
  model: z.string().trim().min(1).max(100).optional(),
  encoding: z.string().trim().min(1).max(40).optional(),
  container: z.string().trim().min(1).max(40).optional(),
  sample_rate: z.number().int().positive().max(192_000).optional(),
  observatory: z.boolean().optional(),
  familiarCare: z.unknown().optional(),
}).strict();

export async function handleProviderTtsPost(request: Request, providerId: string, routeBasePath: string) {
  const startedAt = nowIso();
  let payload = {} as TtsRequest;
  let endpoint = new URL(routeBasePath, request.url).toString();
  let providerName = "Provider";
  let familiarCareSetCookie: string | undefined;
  const timeline = [
    createTimelineEvent({
      type: "route.received",
      label: "Text-to-speech generation requested",
      at: startedAt,
    }),
  ];

  try {
    const adapter = resolveTtsAdapter(providerId);
    const manifest = requireProviderManifest(adapter.providerId);
    providerName = manifest.displayName;
    payload = await readTtsPayload(request);
    await enforceProviderLabAccess(request, providerId, "tts", {
      units: Math.min(10_000, Math.max(1, payload.text?.trim().length ?? 1)),
      endpointId: "provider:tts-json",
      actorIntent: "human",
    });
    endpoint = adapter.buildEndpointPreview(payload);
    if (payload.familiarCare) {
      const hosted = isHostedReviewMode();
      const validation = validateFamiliarCareRequest({ text: payload.text || "", policy: payload.familiarCare, hosted });
      if (!validation.ok) throw new DeepgramValidationError(validation.errors.join(" "));
      if (!isOpenLabMode()) {
        const authorization = authorizeFamiliarCarePreview({
          hosted,
          enabled: familiarCarePreviewEnabled(),
          cookieHeader: request.headers.get("cookie"),
          secret: familiarCareSessionSecret(),
        });
        if (!authorization.ok) throw new DeepgramValidationError(authorization.message, authorization.status);
        familiarCareSetCookie = authorization.setCookie;
      }
    }
    const providerAuthorization = adapter.requiresExplicitPolicyAuthorization
      ? await authorizeProviderExecution(adapter.providerId, "tts")
      : undefined;
    timeline.push(
      createTimelineEvent({
        type: "provider.request.prepared",
        label: `Prepared bounded text for ${providerName}`,
        data: {
          provider: adapter.providerId,
          endpoint,
          bodyPreview: payload.familiarCare
            ? sanitizeFamiliarCareRequest({ text: payload.text || "", model: payload.model, policy: payload.familiarCare })
            : { textLength: payload.text?.length || 0, model: payload.model },
        },
      }),
    );

    const result = await withProviderRequestGuard(request, adapter.providerId, "tts", () =>
      payload.observatory
        ? withObservatoryServerGuard("text-to-speech", () => adapter.execute(payload, { signal: request.signal, authorization: providerAuthorization }))
        : adapter.execute(payload, { signal: request.signal, authorization: providerAuthorization }));
    const audioId = crypto.randomUUID();
    const owner = deriveLabClientIdentity(request);
    pruneGeneratedAudio();
    GENERATED_AUDIO.set(audioId, {
      audio: result.audio,
      contentType: result.contentType,
      model: result.model,
      providerId: adapter.providerId,
      ownerClientHash: owner.clientHash,
      ownerSessionHash: owner.sessionHash,
      createdAt: Date.now(),
      requestId: result.requestId,
    });
    const expirationTimer = setTimeout(() => GENERATED_AUDIO.delete(audioId), 5 * 60 * 1000);
    expirationTimer.unref();
    const data = {
      provider: adapter.providerId,
      audioUrl: `${routeBasePath}?id=${audioId}`,
      contentType: result.contentType,
      byteSize: result.audio.byteLength,
      model: result.model,
      encoding: result.encoding,
      container: result.container || "none",
      sampleRate: result.sampleRate,
      textLength: payload.text?.trim().length || 0,
      requestId: result.requestId,
      responseHeaders: result.responseHeaders,
      timing: result.timing,
      binaryAudio: "***not included in JSON***" as const,
    };
    const completedAt = nowIso();
    const inspector = buildInspectorRecord({
      module: `${providerName} Text to Speech`,
      startedAt,
      completedAt,
      request: {
        method: "POST",
        endpoint,
        query: queryFromUrl(endpoint),
        headers: {
          Authorization: "***server-side credential redacted***",
          Accept: "audio/*",
          "Content-Type": "application/json",
        },
        bodyPreview: payload.familiarCare
          ? sanitizeFamiliarCareRequest({ text: payload.text || "", model: payload.model, policy: payload.familiarCare })
          : {
              textLength: payload.text?.trim().length || 0,
              textPreview: payload.text?.slice(0, 220),
              model: payload.model,
              encoding: payload.encoding,
              container: payload.container,
              sample_rate: payload.sample_rate,
            },
      },
      response: {
        status: 200,
        headers: {
          "Content-Type": result.contentType,
          "X-Deepgram-TTS-Model": result.model,
          ...(result.requestId ? { "dg-request-id": result.requestId } : {}),
        },
        bodyPreview: data,
      },
      timeline: [
        ...timeline,
        createTimelineEvent({
          type: "provider.response",
          label: "Playable audio bytes received",
          data,
        }),
      ],
      notes: [
        `This route sends bounded text through the registered ${providerName} Text to Speech adapter.`,
        "The JSON envelope contains audio metadata and a local playback URL. It does not dump binary audio into JSON.",
      ],
    });

    return Response.json(buildApiDebugEnvelope({ ok: true, data, inspector }), {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        ...(familiarCareSetCookie ? { "Set-Cookie": familiarCareSetCookie } : {}),
      },
    });
  } catch (error) {
    const formatted = error instanceof ProviderOperationError
      ? {
          status: error.status,
          body: {
            ok: false as const,
            message: error.message,
            status: error.status,
            code: error.code,
          },
        }
      : error instanceof ProviderAdapterError
      ? {
          status: error.status,
          body: {
            ok: false as const,
            message: error.message,
            status: error.status,
            code: error.code,
          },
        }
      : error instanceof ObservatoryConcurrencyError
        ? { status: error.status, body: { ok: false as const, message: error.message, status: error.status } }
        : formatRouteError(error);
    const { status, body } = formatted;
    const safeBody = payload.familiarCare
      ? { ok: false as const, message: body.message, status }
      : body;
    const completedAt = nowIso();
    const inspector = buildInspectorRecord({
      module: `${providerName} Text to Speech`,
      startedAt,
      completedAt,
      request: {
        method: "POST",
        endpoint,
        query: endpoint.startsWith("http") ? queryFromUrl(endpoint) : {},
        headers: {
          Authorization: "***server-side credential redacted***",
          Accept: "audio/*",
          "Content-Type": "application/json",
        },
        bodyPreview: payload.familiarCare
          ? sanitizeFamiliarCareRequest({ text: payload.text || "", model: payload.model, policy: payload.familiarCare })
          : {
              textLength: payload.text?.trim().length || 0,
              textPreview: payload.text?.slice(0, 220),
              model: payload.model,
              encoding: payload.encoding,
              container: payload.container,
              sample_rate: payload.sample_rate,
            },
      },
      response: {
        status,
        bodyPreview: safeBody,
      },
      timeline: [
        ...timeline,
        createTimelineEvent({
          type: "tts.error",
          label: safeBody.message,
          data: safeBody,
        }),
      ],
      notes: [
        "Unknown, Planned, disabled, or unavailable providers fail before adapter execution.",
        "For missing configuration, add the documented server-only variable in the runtime secret store.",
      ],
    });
    return Response.json(
      buildApiDebugEnvelope({
        ok: false,
        error: {
          message: safeBody.message,
          code: error instanceof ProviderAdapterError || error instanceof ProviderOperationError ? error.code : String(status),
          details: payload.familiarCare || error instanceof ProviderAdapterError || !("details" in body) ? undefined : body.details,
        },
        inspector,
      }),
      {
        status,
        headers: {
          "Cache-Control": "no-store",
          ...(familiarCareSetCookie ? { "Set-Cookie": familiarCareSetCookie } : {}),
        },
      },
    );
  }
}

async function readTtsPayload(request: Request): Promise<TtsRequest> {
  try {
    const text = await readBoundedRequestText(request, MAX_TTS_REQUEST_BYTES);
    const raw = JSON.parse(text) as unknown;
    const parsed = ttsRequestSchema.safeParse(raw);
    if (!parsed.success) {
      const textTooLarge = parsed.error.issues.some((issue) => issue.path[0] === "text" && issue.code === "too_big");
      throw new DeepgramValidationError(
        textTooLarge
          ? "Text to Speech input is limited to 2,000 characters."
          : "Send a bounded Text to Speech request using only supported fields.",
        textTooLarge ? 413 : 400,
      );
    }
    return parsed.data as unknown as TtsRequest;
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      throw new DeepgramValidationError("Text to Speech requests are limited to 16 KB.", 413);
    }
    throw new DeepgramValidationError("Send a valid Text to Speech request object.");
  }
}

export function handleProviderTtsGet(request: Request, providerId: string) {
  try {
    const adapter = resolveTtsAdapter(providerId);
    pruneGeneratedAudio();
    const url = new URL(request.url);
    const id = url.searchParams.get("id") || "";
    const item = GENERATED_AUDIO.get(id);
    const owner = deriveLabClientIdentity(request);

    if (!item
      || item.providerId !== adapter.providerId
      || item.ownerClientHash !== owner.clientHash
      || item.ownerSessionHash !== owner.sessionHash) {
      return Response.json({ ok: false, message: "Generated audio was not found or expired." }, { status: 404 });
    }

    return new Response(item.audio, {
      status: 200,
      headers: {
        "Content-Type": item.contentType,
        "Cache-Control": "no-store",
        "X-Deepgram-TTS-Model": item.model,
        ...(item.requestId ? { "dg-request-id": item.requestId } : {}),
      },
    });
  } catch (error) {
    return providerMethodError(error);
  }
}

export function handleProviderTtsDelete(request: Request, providerId: string) {
  try {
    resolveTtsAdapter(providerId);
    const url = new URL(request.url);
    const id = url.searchParams.get("id") || "";
    const item = GENERATED_AUDIO.get(id);
    const owner = deriveLabClientIdentity(request);
    const deleted = item?.providerId === providerId
      && item.ownerClientHash === owner.clientHash
      && item.ownerSessionHash === owner.sessionHash
      ? GENERATED_AUDIO.delete(id)
      : false;
    return Response.json({ ok: true, deleted }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return providerMethodError(error);
  }
}

function providerMethodError(error: unknown) {
  if (error instanceof ProviderAdapterError) {
    return Response.json(
      { ok: false, error: { code: error.code, message: error.message } },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  return Response.json(
    { ok: false, error: { code: "provider_capability_unavailable", message: "Text to Speech is unavailable." } },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

function pruneGeneratedAudio() {
  const now = Date.now();
  const maxAgeMs = 5 * 60 * 1000;

  for (const [id, item] of GENERATED_AUDIO.entries()) {
    if (now - item.createdAt > maxAgeMs || GENERATED_AUDIO.size > 10) {
      GENERATED_AUDIO.delete(id);
    }
  }
}
