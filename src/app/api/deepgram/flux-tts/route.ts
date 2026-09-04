import { checkLabAccess, labAccessResponse } from "@/lib/access/lab-access";
import {
  FluxTtsValidationError,
  buildFluxTtsBatchRequest,
  sanitizeFluxTrace,
} from "@/lib/flux-tts";
import { FluxTtsExecutionError, executeFluxTtsBatch } from "@/lib/flux-tts-server";
import { readBoundedRequestText, RequestBodyTooLargeError } from "@/lib/http/bounded-body";
import { OpenLabDeepgramDisabledError, assertOpenLabDeepgramEnabled } from "@/lib/open-lab";
import { ProviderOperationError } from "@/lib/providers/errors";
import { authorizeProviderExecution } from "@/lib/providers/execution-policy";
import { withProviderRequestGuard } from "@/lib/providers/request-guard";
import { readServerCredential } from "@/lib/providers/server-credential";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 16_384;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function POST(request: Request) {
  try {
    assertOpenLabDeepgramEnabled();
    const payload = await readJsonRequest(request);
    const prepared = buildFluxTtsBatchRequest(payload);
    const access = await checkLabAccess(request, "speech_generation", {
      providerId: "deepgram",
      endpointId: "deepgram:flux-tts",
      units: prepared.input.text.length,
      actorIntent: "human",
    });
    if (!access.allowed) return labAccessResponse(access);
    const authorization = await authorizeProviderExecution("deepgram", "tts");
    const apiKey = readServerCredential("DEEPGRAM_API_KEY") ?? "";
    const result = await withProviderRequestGuard(request, "deepgram", "tts", () =>
      executeFluxTtsBatch(prepared, {
        apiKey,
        signal: request.signal,
        authorization,
      }));

    return new Response(result.audio, {
      status: 200,
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": result.contentType,
        "Content-Length": String(result.audio.byteLength),
        "dg-model-name": result.model,
        "X-Deepgram-Flux-Model": result.model,
        ...(result.requestId ? { "dg-request-id": result.requestId } : {}),
      },
    });
  } catch (error) {
    const formatted = formatFluxTtsRouteError(error);
    return Response.json(formatted.body, {
      status: formatted.status,
      headers: {
        ...NO_STORE_HEADERS,
        ...(formatted.requestId ? { "dg-request-id": formatted.requestId } : {}),
      },
    });
  }
}

async function readJsonRequest(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new FluxTtsExecutionError("The Flux TTS request is too large.", 413, "request_too_large");
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType && !contentType.toLowerCase().includes("application/json")) {
    throw new FluxTtsExecutionError("Send the Flux TTS request as JSON.", 415, "unsupported_media_type");
  }

  let body: string;
  try {
    body = await readBoundedRequestText(request, MAX_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      throw new FluxTtsExecutionError("The Flux TTS request is too large.", 413, "request_too_large");
    }
    throw error;
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new FluxTtsExecutionError("Send a valid JSON object.", 400, "invalid_json");
  }
}

function formatFluxTtsRouteError(error: unknown) {
  if (error instanceof ProviderOperationError) {
    return {
      status: error.status,
      requestId: undefined,
      body: { ok: false as const, error: { code: error.code, message: error.message } },
    };
  }
  if (error instanceof OpenLabDeepgramDisabledError) {
    return {
      status: error.status,
      requestId: undefined,
      body: { ok: false as const, error: { code: error.code, message: error.message } },
    };
  }
  if (error instanceof FluxTtsValidationError) {
    return {
      status: error.status,
      requestId: undefined,
      body: {
        ok: false as const,
        error: { code: error.code, message: error.message, issues: sanitizeFluxTrace(error.issues) },
      },
    };
  }
  if (error instanceof FluxTtsExecutionError) {
    return {
      status: error.status,
      requestId: error.requestId,
      body: {
        ok: false as const,
        error: {
          code: error.code,
          message: error.message,
          ...(error.requestId ? { requestId: error.requestId } : {}),
        },
      },
    };
  }
  return {
    status: 500,
    requestId: undefined,
    body: {
      ok: false as const,
      error: { code: "unexpected_server_error", message: "Unexpected server error while running Flux TTS." },
    },
  };
}
