import "server-only";

import {
  checkLabAccess,
  labAccessResponse,
  type LabAccessDecision,
} from "@/lib/access/lab-access";
import { resolveHumanIdentity } from "@/lib/auth/human-identity";
import { BoundedJsonError, readBoundedJson } from "@/lib/http/bounded-json";
import { isSameSiteRequest } from "@/lib/http/same-site-request";
import {
  scenarioRunRequestSchema,
  scenarioRunResponseSchema,
  type ScenarioRunRequest,
  type ScenarioRunResponse,
} from "@/lib/scenarios/contracts";
import { runScenarioFixture } from "@/lib/scenarios/runner";
import { getOneSupabaseServerClient } from "@/lib/supabase/server";

export const MAX_SCENARIO_RUN_REQUEST_BYTES = 4_096;

export type ScenarioActorResolution =
  | Readonly<{ ok: true; actorScope: "guest-ephemeral" | "human-ephemeral" }>
  | Readonly<{ ok: false; status: 401 | 503; code: "invalid_session" | "identity_unavailable"; message: string }>;

export type ScenarioRunHandlerDependencies = Readonly<{
  sameSiteRequest?: typeof isSameSiteRequest;
  readJson?: typeof readBoundedJson;
  resolveActor?: (request: Request) => Promise<ScenarioActorResolution>;
  checkAccess?: (
    request: Request,
    operation: "session_creation",
    context: { endpointId: string; units: number; actorIntent: "human" },
  ) => Promise<LabAccessDecision>;
  run?: (
    request: ScenarioRunRequest,
    options: Readonly<{
      actorScope: "guest-ephemeral" | "human-ephemeral";
      signal?: AbortSignal;
    }>,
  ) => Promise<ScenarioRunResponse>;
}>;

export function createScenarioRunHandler(dependencies: ScenarioRunHandlerDependencies = {}) {
  const sameSiteRequest = dependencies.sameSiteRequest ?? isSameSiteRequest;
  const readJson = dependencies.readJson ?? readBoundedJson;
  const resolveActor = dependencies.resolveActor ?? resolveScenarioActor;
  const accessCheck = dependencies.checkAccess ?? checkLabAccess;
  const run = dependencies.run ?? ((input, options) => runScenarioFixture(input, options));

  return async function POST(request: Request): Promise<Response> {
    if (!sameSiteRequest(request, {
      requireBrowserSignal: true,
      allowHostHeaderFallback: true,
    })) {
      return scenarioError(403, "cross_origin", "Scenario runs accept same-site browser requests only.");
    }

    let raw: unknown;
    try {
      raw = await readJson(request, MAX_SCENARIO_RUN_REQUEST_BYTES);
    } catch (error) {
      if (error instanceof BoundedJsonError) {
        return scenarioError(error.status, error.code, error.message);
      }
      return scenarioError(400, "invalid_request", "The scenario request could not be read safely.");
    }

    const input = scenarioRunRequestSchema.safeParse(raw);
    if (!input.success) {
      return scenarioError(400, "invalid_scenario_request", "The scenario ID, version, mode, or bounded inputs are not supported.");
    }

    const actor = await resolveActor(request);
    if (!actor.ok) return scenarioError(actor.status, actor.code, actor.message);

    const access = await accessCheck(request, "session_creation", {
      endpointId: "scenario:run",
      units: 1,
      actorIntent: "human",
    });
    if (!access.allowed) return withScenarioPrivateHeaders(labAccessResponse(access));

    try {
      const response = scenarioRunResponseSchema.parse(await run(input.data, {
        actorScope: actor.actorScope,
        signal: request.signal,
      }));
      return scenarioJson(response);
    } catch {
      return scenarioError(500, "scenario_run_failed", "The deterministic scenario failed safely. No provider request was made.");
    }
  };
}

export async function resolveScenarioActor(request: Request): Promise<ScenarioActorResolution> {
  void request;
  const client = await getOneSupabaseServerClient();
  if (!client) return { ok: true, actorScope: "guest-ephemeral" };

  const identity = await resolveHumanIdentity(client);
  if (identity.kind === "human") return { ok: true, actorScope: "human-ephemeral" };
  if (identity.kind === "guest") return { ok: true, actorScope: "guest-ephemeral" };
  if (identity.kind === "invalid-session") {
    return {
      ok: false,
      status: 401,
      code: "invalid_session",
      message: "The current session is invalid. Refresh or sign out before running the scenario.",
    };
  }
  return {
    ok: false,
    status: 503,
    code: "identity_unavailable",
    message: "ONE could not verify the current account boundary. No scenario was run.",
  };
}

function scenarioJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: scenarioPrivateHeaders(),
  });
}

function scenarioError(status: number, code: string, message: string): Response {
  return scenarioJson({
    ok: false,
    error: { code, message },
  }, status);
}

function scenarioPrivateHeaders(): Headers {
  const headers = new Headers();
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Surrogate-Control", "no-store");
  headers.set("Vary", "Cookie");
  headers.set("X-Content-Type-Options", "nosniff");
  return headers;
}

function withScenarioPrivateHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of scenarioPrivateHeaders()) headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
