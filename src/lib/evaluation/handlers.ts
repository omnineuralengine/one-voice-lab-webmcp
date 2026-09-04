import "server-only";

import { z } from "zod";

import { statusForDecision } from "@/lib/access/access-decision";
import {
  enforceProviderLabAccess,
  type LabAccessContext,
  type LabAccessDecision,
  type LabUsageOperation,
} from "@/lib/access/lab-access";
import { getEvaluationCatalog, type EvaluationCatalogDependencies } from "@/lib/evaluation/catalog";
import { executeEvaluationRun, type EvaluationOrchestratorDependencies } from "@/lib/evaluation/orchestrator";
import { getEvaluationCapabilities, isEvaluationProviderRuntimeEnabled, type EvaluationEnvironment } from "@/lib/evaluation/runtime";
import {
  EVALUATION_REQUEST_MAX_BYTES,
  evaluationRunRequestSchema,
  evaluationStreamEventSchema,
  type EvaluationRunRequest,
  type EvaluationStreamEvent,
} from "@/lib/evaluation/schema";
import {
  enforceEvaluationCatalogBoundary,
  enforceEvaluationExecutionBoundary,
  EvaluationBoundaryError,
  validateEvaluationRequest,
  type EvaluationIdentityState,
} from "@/lib/evaluation/security";
import { getProviderAdapterRegistration } from "@/lib/providers/adapters";
import { getProviderConfigurationState } from "@/lib/providers/configuration";
import { ProviderOperationError } from "@/lib/providers/errors";
import { withProviderRequestGuard } from "@/lib/providers/request-guard";
import { providerIdSchema, type ProviderId, type ProviderTtsAdapter } from "@/lib/providers/types";

type AccessChecker = (request: Request, operation: LabUsageOperation, context?: LabAccessContext) => Promise<LabAccessDecision>;
type RequestGuard = <T>(request: Request, providerId: string, operation: "models" | "voices" | "tts" | "stt", task: () => Promise<T>) => Promise<T>;

export type EvaluationRunHandlerDependencies = Readonly<{
  environment?: EvaluationEnvironment;
  checkAccess?: AccessChecker;
  requestGuard?: RequestGuard;
  resolveIdentity?: () => Promise<EvaluationIdentityState>;
  resolveAdapter?: (providerId: string) => ProviderTtsAdapter;
  isConfigured?: (providerId: ProviderId) => boolean;
  timeoutsMs?: EvaluationOrchestratorDependencies["timeoutsMs"];
}>;

export type EvaluationCatalogHandlerDependencies = Readonly<{
  environment?: EvaluationEnvironment;
  checkAccess?: AccessChecker;
  requestGuard?: RequestGuard;
  resolveIdentity?: () => Promise<EvaluationIdentityState>;
  resolveAdapter?: EvaluationCatalogDependencies["resolveAdapter"];
}>;

const catalogQuerySchema = z.object({
  provider: providerIdSchema,
  mode: z.enum(["fixture", "protected-live", "local-live"]).default("fixture"),
}).strict();

export function createEvaluationCapabilitiesHandler(environment: EvaluationEnvironment = process.env) {
  return async function GET(): Promise<Response> {
    return jsonResponse(getEvaluationCapabilities(environment));
  };
}

export function createEvaluationCatalogHandler(dependencies: EvaluationCatalogHandlerDependencies = {}) {
  return async function GET(request: Request): Promise<Response> {
    const environment = dependencies.environment ?? process.env;
    try {
      const url = new URL(request.url);
      const parsed = catalogQuerySchema.safeParse({
        provider: url.searchParams.get("provider") ?? undefined,
        mode: url.searchParams.get("mode") ?? undefined,
      });
      if (!parsed.success) return validationError(parsed.error);
      const { provider, mode } = parsed.data;
      if (mode !== "fixture") {
        const identity = await enforceEvaluationCatalogBoundary(request, mode, {
          environment,
          resolveIdentity: dependencies.resolveIdentity,
        });
        const discovery = getProviderAdapterRegistration(provider)?.normalizedDiscovery;
        if (mode === "protected-live" && identity !== "member" && discovery?.modelVisibility === "account-scoped") {
          throw new EvaluationBoundaryError(
            "account_scoped_catalog_requires_authentication",
            "This provider's account-scoped model catalog requires an authenticated member session.",
            403,
          );
        }
        if (!getProviderConfigurationState(provider, environment).configured) {
          throw new EvaluationBoundaryError("provider_not_configured", "This provider is not configured for live catalog discovery.", 503);
        }
        if (!isEvaluationProviderRuntimeEnabled(provider, environment)) {
          throw new EvaluationBoundaryError("provider_execution_disabled", "Live execution is disabled for this provider.", 503);
        }
        if (dependencies.checkAccess) {
          const decision = await dependencies.checkAccess(request, "provider_catalog", {
            providerId: provider,
            endpointId: "evaluate:catalog",
            actorIntent: "human",
          });
          if (!decision.allowed) return accessError(decision);
        } else {
          await enforceProviderLabAccess(request, provider, "models", {
            endpointId: "evaluate:catalog",
            actorIntent: "human",
          });
        }
      }

      const load = () => getEvaluationCatalog(provider, mode, {
        resolveAdapter: dependencies.resolveAdapter,
        signal: request.signal,
        environment,
      });
      const result = mode === "fixture"
        ? await load()
        : await (dependencies.requestGuard ?? withProviderRequestGuard)(request, provider, "models", load);
      return jsonResponse(result);
    } catch (error) {
      return evaluationErrorResponse(error);
    }
  };
}

export function createEvaluationRunHandler(dependencies: EvaluationRunHandlerDependencies = {}) {
  return async function POST(request: Request): Promise<Response> {
    const environment = dependencies.environment ?? process.env;
    let input: EvaluationRunRequest;
    try {
      const raw = await readBoundedJson(request, EVALUATION_REQUEST_MAX_BYTES);
      const parsed = evaluationRunRequestSchema.safeParse(raw);
      if (!parsed.success) return validationError(parsed.error);
      input = parsed.data;
      await validateEvaluationRequest(input, environment);
      await enforceEvaluationExecutionBoundary(request, input, {
        environment,
        resolveIdentity: dependencies.resolveIdentity,
      });
    } catch (error) {
      return evaluationErrorResponse(error);
    }

    const runGuard = createRunGuard(request, input, dependencies);
    const jsonFallback = new URL(request.url).searchParams.get("format") === "json";
    if (jsonFallback) {
      if (environment.NODE_ENV === "production") {
        return errorResponse("streaming_required", "Production evaluation responses must use bounded NDJSON streaming.", 406);
      }
      const events: EvaluationStreamEvent[] = [];
      try {
        const bundle = await executeEvaluationRun(input, {
          signal: request.signal,
          environment,
          emit: (event) => {
            events.push(stripAudio(event));
          },
          resolveAdapter: dependencies.resolveAdapter,
          isConfigured: dependencies.isConfigured,
          runGuard,
          timeoutsMs: dependencies.timeoutsMs,
        });
        return jsonResponse({ events, bundle });
      } catch (error) {
        return evaluationErrorResponse(error);
      }
    }

    const encoder = new TextEncoder();
    const cancellation = new AbortController();
    const abortFromRequest = () => cancellation.abort(request.signal.reason);
    if (request.signal.aborted) abortFromRequest();
    else request.signal.addEventListener("abort", abortFromRequest, { once: true });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        void executeEvaluationRun(input, {
          signal: cancellation.signal,
          environment,
          emit: (event) => {
            if (!cancellation.signal.aborted) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          },
          resolveAdapter: dependencies.resolveAdapter,
          isConfigured: dependencies.isConfigured,
          runGuard,
          timeoutsMs: dependencies.timeoutsMs,
        }).then(() => {
          if (!cancellation.signal.aborted) controller.close();
        }).catch((error) => {
          if (!cancellation.signal.aborted) controller.error(new Error(safeUnexpectedMessage(error)));
        }).finally(() => request.signal.removeEventListener("abort", abortFromRequest));
      },
      cancel(reason) {
        cancellation.abort(reason);
        request.signal.removeEventListener("abort", abortFromRequest);
      },
    });

    return new Response(stream, {
      status: 200,
      headers: responseHeaders("application/x-ndjson; charset=utf-8", {
        "X-Accel-Buffering": "no",
      }),
    });
  };
}

function createRunGuard(
  request: Request,
  input: EvaluationRunRequest,
  dependencies: EvaluationRunHandlerDependencies,
) {
  const requestGuard = dependencies.requestGuard ?? withProviderRequestGuard;
  return async <T>(providerId: ProviderId, task: () => Promise<T>): Promise<T> => {
    if (dependencies.checkAccess) {
      const decision = await dependencies.checkAccess(request, "speech_generation", {
        providerId,
        endpointId: "evaluate:run",
        units: input.scenario.text.length,
        actorIntent: "human",
      });
      if (!decision.allowed) throw accessOperationError(providerId, decision);
    } else {
      await enforceProviderLabAccess(request, providerId, "tts", {
        endpointId: "evaluate:run",
        units: input.scenario.text.length,
        actorIntent: "human",
      });
    }
    return requestGuard(request, providerId, "tts", task);
  };
}

function accessOperationError(providerId: ProviderId, decision: LabAccessDecision) {
  return new ProviderOperationError({
    code: decision.code === "provider_budget_exhausted"
      ? "provider_budget_exhausted"
      : decision.code === "concurrency_limit_reached"
        ? "provider_concurrency_limited"
        : decision.code === "quota_unavailable" || decision.code === "live_lab_paused" || decision.code === "provider_paused"
          ? "provider_access_unavailable"
          : "provider_quota_exhausted",
    message: decision.message ?? "The durable usage boundary denied this provider attempt.",
    status: statusForDecision(decision),
    providerId,
    operation: "tts",
  });
}

async function readBoundedJson(request: Request, maximumBytes: number): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new EvaluationBoundaryError("unsupported_media_type", "Evaluation requests require application/json.", 415);
  }
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    try {
      await request.body?.cancel("Evaluation request exceeded its declared byte limit.");
    } catch {
      // The rejection still occurs even if the runtime cannot cancel an already-consumed body.
    }
    throw new EvaluationBoundaryError("request_too_large", "The evaluation request body is too large.", 413);
  }
  if (!request.body) throw new EvaluationBoundaryError("invalid_json", "The evaluation request body is required.", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new EvaluationBoundaryError("request_too_large", "The evaluation request body is too large.", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new EvaluationBoundaryError("invalid_json", "The evaluation request must be valid UTF-8 JSON.", 400);
  }
}

function stripAudio(event: EvaluationStreamEvent): EvaluationStreamEvent {
  if (event.type !== "provider-result") return event;
  return evaluationStreamEventSchema.parse({ ...event, audioBase64: null });
}

function validationError(error: z.ZodError) {
  return Response.json({
    ok: false,
    error: {
      code: "invalid_request",
      message: "The evaluation request does not match the supported schema.",
      issues: error.issues.slice(0, 12).map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    },
  }, { status: 400, headers: responseHeaders("application/json; charset=utf-8") });
}

function evaluationErrorResponse(error: unknown): Response {
  if (error instanceof EvaluationBoundaryError) return errorResponse(error.code, error.message, error.status);
  if (error instanceof ProviderOperationError) return errorResponse(error.code, "The protected provider operation was denied safely.", error.status);
  return errorResponse("evaluation_failure", "The evaluation request failed safely without exposing provider details.", 500);
}

function accessError(decision: LabAccessDecision): Response {
  return errorResponse(
    decision.code ?? "usage_boundary_denied",
    decision.message ?? "The durable usage boundary denied this operation.",
    decision.code === "cross_origin" ? 403 : decision.code === "quota_unavailable" || decision.code === "live_lab_paused" ? 503 : 429,
  );
}

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ ok: false, error: { code, message } }, {
    status,
    headers: responseHeaders("application/json; charset=utf-8", status === 429 ? { "Retry-After": "60" } : undefined),
  });
}

function jsonResponse(value: unknown) {
  return Response.json(value, { headers: responseHeaders("application/json; charset=utf-8") });
}

function responseHeaders(contentType: string, extra: Record<string, string> = {}) {
  return {
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    ...extra,
  };
}

function safeUnexpectedMessage(error: unknown) {
  return error instanceof EvaluationBoundaryError ? error.message : "The evaluation stream ended safely.";
}
