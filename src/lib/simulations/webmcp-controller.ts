import { getSimulationScenario, SIMULATION_SCENARIOS } from "@/lib/simulations/registry";
import {
  runDeterministicSimulationReplay,
  type SimulationReplayResult,
} from "@/lib/simulations/replay";
import { SIMULATION_TEMPLATES, type SimulationTemplateId } from "@/lib/simulations/templates";
import { TWILIO_CONVERSATION_RELAY_PRODUCTION_READINESS_PROFILE } from "@/lib/simulations/reference-profiles";
import type {
  PrepareVoiceReplayInput,
  RunVoiceReplayInput,
} from "@/lib/simulations/webmcp-contracts";

const ACTIVITY_LIMIT = 12;
const PLAN_LIFETIME_MS = 5 * 60 * 1_000;
const AUTHORIZATION_LIFETIME_MS = 2 * 60 * 1_000;
const SIMULATION_LAB_PATH = "/simulation-lab";
const COMPATIBLE_TEMPLATES = new Set<SimulationTemplateId>([
  "browser-assistant",
  "contact-center",
  "customer-support",
  "tool-using-agent",
]);

export type VoiceReplayActivity = Readonly<{
  sequence: number;
  source: "human-ui" | "webmcp-agent" | "system";
  action: string;
  outcome: string;
}>;

export type PreparedVoiceReplayPlan = Readonly<{
  id: string;
  fingerprint: string;
  scenarioId: string;
  scenarioName: string;
  templateId: SimulationTemplateId;
  templateName: string;
  impairment: PrepareVoiceReplayInput["impairment"];
  runCount: number;
  referenceProfileId: string | null;
  preparedAt: string;
  expiresAt: string;
  provenance: "deterministic-local-simulation";
  providerRequestsPlanned: 0;
  providerSpendPlanned: 0;
}>;

export type VoiceReplayAuthorization = Readonly<{
  state: "none" | "awaiting-human" | "authorized" | "consumed" | "invalidated" | "expired";
  planId: string | null;
  fingerprint: string | null;
  authorizedAt: string | null;
  expiresAt: string | null;
  reason: string;
}>;

export type VoiceReplayState = Readonly<{
  pathname: string;
  labMounted: boolean;
  preparedPlan: PreparedVoiceReplayPlan | null;
  authorization: VoiceReplayAuthorization;
  latestResult: SimulationReplayResult | null;
  latestPlanId: string | null;
  runState: "idle" | "running" | "completed" | "cancelled" | "failed";
  activity: readonly VoiceReplayActivity[];
}>;

export type VoiceReplayController = ReturnType<typeof createVoiceReplayController>;

export class VoiceReplayControllerError extends Error {
  constructor(
    public readonly code:
      | "simulation_lab_required"
      | "incompatible_plan"
      | "unknown_plan"
      | "plan_expired"
      | "plan_invalidated"
      | "authorization_required"
      | "authorization_expired"
      | "authorization_consumed"
      | "replay_cancelled",
    message: string,
  ) {
    super(message);
    this.name = "VoiceReplayControllerError";
  }
}

const EMPTY_AUTHORIZATION: VoiceReplayAuthorization = {
  state: "none",
  planId: null,
  fingerprint: null,
  authorizedAt: null,
  expiresAt: null,
  reason: "No replay plan has been prepared.",
};

export function createVoiceReplayController(options: Readonly<{
  now?: () => number;
}> = {}) {
  const now = options.now ?? Date.now;
  const listeners = new Set<() => void>();
  let nextPlanSequence = 1;
  let nextActivitySequence = 1;
  let state: VoiceReplayState = {
    pathname: "",
    labMounted: false,
    preparedPlan: null,
    authorization: EMPTY_AUTHORIZATION,
    latestResult: null,
    latestPlanId: null,
    runState: "idle",
    activity: [],
  };

  function emit(next: VoiceReplayState) {
    state = next;
    for (const listener of listeners) listener();
  }

  function appendActivity(
    current: VoiceReplayState,
    source: VoiceReplayActivity["source"],
    action: string,
    outcome: string,
  ) {
    const event: VoiceReplayActivity = {
      sequence: nextActivitySequence,
      source,
      action,
      outcome,
    };
    nextActivitySequence += 1;
    return [...current.activity, event].slice(-ACTIVITY_LIMIT);
  }

  function invalidate(reason: string, source: VoiceReplayActivity["source"] = "system") {
    if (!state.preparedPlan && state.authorization.state === "none") return;
    const authorization: VoiceReplayAuthorization = {
      state: "invalidated",
      planId: state.preparedPlan?.id ?? state.authorization.planId,
      fingerprint: null,
      authorizedAt: null,
      expiresAt: null,
      reason,
    };
    emit({
      ...state,
      preparedPlan: null,
      authorization,
      activity: appendActivity(state, source, "replay plan invalidated", reason),
    });
  }

  function requireActiveLab() {
    if (!state.labMounted || state.pathname !== SIMULATION_LAB_PATH) {
      throw new VoiceReplayControllerError(
        "simulation_lab_required",
        "Open the top-level Simulation Lab before preparing or running a replay so every state change remains visible.",
      );
    }
  }

  function expirePlanIfNeeded() {
    const plan = state.preparedPlan;
    if (!plan || now() <= Date.parse(plan.expiresAt)) return;
    emit({
      ...state,
      preparedPlan: null,
      authorization: {
        state: "expired",
        planId: plan.id,
        fingerprint: null,
        authorizedAt: null,
        expiresAt: null,
        reason: "The prepared plan expired before execution.",
      },
      activity: appendActivity(state, "system", "replay plan expired", plan.id),
    });
  }

  function listScenarios() {
    return {
      mode: "deterministic-local-replay",
      scenarios: SIMULATION_SCENARIOS.map((scenario) => ({
        id: scenario.id,
        name: scenario.name,
        description: scenario.description,
        hypothesis: scenario.hypothesis,
        status: scenario.status,
        availableModes: scenario.availableModes,
        evidence: scenario.evidence,
        limitations: scenario.limitations,
        impairments: scenario.impairments,
        preparable: scenario.status === "implemented" && scenario.availableModes.includes("replay"),
      })),
      supportedTemplates: SIMULATION_TEMPLATES.filter((template) =>
        COMPATIBLE_TEMPLATES.has(template.id)).map(({ id, name }) => ({ id, name })),
      referenceProfiles: [TWILIO_CONVERSATION_RELAY_PRODUCTION_READINESS_PROFILE],
      executionBoundary: {
        deterministic: true,
        simulated: true,
        providerRequests: 0,
        providerSpend: 0,
        microphoneAccess: false,
        uploads: false,
        telephonyActions: false,
        persistence: false,
        humanAuthorizationRequired: true,
      },
    } as const;
  }

  function prepare(input: PrepareVoiceReplayInput) {
    requireActiveLab();
    const scenario = getSimulationScenario(input.scenarioId);
    const template = SIMULATION_TEMPLATES.find((item) => item.id === input.templateId);
    if (
      !scenario
      || scenario.status !== "implemented"
      || !scenario.availableModes.includes("replay")
      || !scenario.impairments.includes(input.impairment)
      || !template
      || !COMPATIBLE_TEMPLATES.has(template.id)
    ) {
      throw new VoiceReplayControllerError(
        "incompatible_plan",
        "The scenario, architecture template, and impairment are not an implemented deterministic replay combination.",
      );
    }

    const preparedAtMs = now();
    const normalized = {
      scenarioId: scenario.id,
      templateId: template.id,
      impairment: input.impairment,
      runCount: input.runCount,
      referenceProfileId: input.referenceProfileId ?? null,
    };
    const fingerprint = fingerprintFor(normalized);
    const plan: PreparedVoiceReplayPlan = {
      id: `voice-replay-plan-${nextPlanSequence}-${fingerprint.slice(0, 8)}`,
      fingerprint,
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      templateId: template.id,
      templateName: template.name,
      impairment: input.impairment,
      runCount: input.runCount,
      referenceProfileId: input.referenceProfileId ?? null,
      preparedAt: new Date(preparedAtMs).toISOString(),
      expiresAt: new Date(preparedAtMs + PLAN_LIFETIME_MS).toISOString(),
      provenance: "deterministic-local-simulation",
      providerRequestsPlanned: 0,
      providerSpendPlanned: 0,
    };
    nextPlanSequence += 1;
    const next: VoiceReplayState = {
      ...state,
      preparedPlan: plan,
      authorization: {
        state: "awaiting-human",
        planId: plan.id,
        fingerprint: null,
        authorizedAt: null,
        expiresAt: null,
        reason: "A human must authorize this exact normalized plan in the visible Simulation Lab.",
      },
      latestResult: null,
      latestPlanId: null,
      runState: "idle",
      activity: appendActivity(state, "webmcp-agent", "replay prepared", plan.id),
    };
    emit(next);
    return {
      ok: true,
      plan,
      authorization: next.authorization,
      visibleState: "Prepared plan is visible in the Simulation Lab; execution is blocked pending human authorization.",
      providerRequestsMade: 0,
      providerSpend: 0,
    } as const;
  }

  function authorize(planId: string) {
    requireActiveLab();
    expirePlanIfNeeded();
    const plan = state.preparedPlan;
    if (!plan || plan.id !== planId) {
      throw new VoiceReplayControllerError("unknown_plan", "Only the current visible replay plan can be authorized.");
    }
    const authorizedAtMs = now();
    const authorization: VoiceReplayAuthorization = {
      state: "authorized",
      planId: plan.id,
      fingerprint: plan.fingerprint,
      authorizedAt: new Date(authorizedAtMs).toISOString(),
      expiresAt: new Date(authorizedAtMs + AUTHORIZATION_LIFETIME_MS).toISOString(),
      reason: "A human authorized this exact normalized local replay plan.",
    };
    emit({
      ...state,
      authorization,
      activity: appendActivity(state, "human-ui", "local replay authorized", plan.id),
    });
    return authorization;
  }

  async function run(input: RunVoiceReplayInput, signal?: AbortSignal) {
    requireActiveLab();
    expirePlanIfNeeded();
    const plan = state.preparedPlan;
    if (!plan || plan.id !== input.planId) {
      const code = state.authorization.state === "invalidated" ? "plan_invalidated" : "unknown_plan";
      throw new VoiceReplayControllerError(code, "The requested plan is not the current visible replay plan.");
    }
    const authorization = state.authorization;
    if (authorization.state === "consumed") {
      throw new VoiceReplayControllerError("authorization_consumed", "This one-use authorization was already consumed.");
    }
    if (authorization.state !== "authorized") {
      throw new VoiceReplayControllerError("authorization_required", "A human must authorize this exact visible plan before it can run.");
    }
    if (
      authorization.planId !== plan.id
      || authorization.fingerprint !== plan.fingerprint
    ) {
      throw new VoiceReplayControllerError("plan_invalidated", "The authorized plan no longer matches the visible normalized plan.");
    }
    if (!authorization.expiresAt || now() > Date.parse(authorization.expiresAt)) {
      const expired: VoiceReplayAuthorization = {
        ...authorization,
        state: "expired",
        fingerprint: null,
        reason: "Human authorization expired before execution began.",
      };
      emit({ ...state, authorization: expired });
      throw new VoiceReplayControllerError("authorization_expired", expired.reason);
    }
    signal?.throwIfAborted();

    // Starting a run consumes the exact-plan authorization. Cancellation and
    // failure cannot restore or reuse it.
    const consumed: VoiceReplayAuthorization = {
      ...authorization,
      state: "consumed",
      reason: "Authorization was consumed when deterministic replay execution started.",
    };
    emit({
      ...state,
      authorization: consumed,
      runState: "running",
      activity: appendActivity(state, "webmcp-agent", "authorized replay started", plan.id),
    });

    try {
      await Promise.resolve();
      signal?.throwIfAborted();
      const result = runDeterministicSimulationReplay({
        scenarioId: plan.scenarioId,
        impairment: plan.impairment,
        runCount: plan.runCount,
        signal,
      });
      const current = state;
      emit({
        ...current,
        latestResult: result,
        latestPlanId: plan.id,
        runState: "completed",
        activity: appendActivity(current, "webmcp-agent", "deterministic replay completed", result.scorecard.runId),
      });
      return evidenceFor(state);
    } catch (error) {
      const cancelled = signal?.aborted || isAbortError(error);
      const current = state;
      emit({
        ...current,
        runState: cancelled ? "cancelled" : "failed",
        activity: appendActivity(
          current,
          "webmcp-agent",
          cancelled ? "deterministic replay cancelled" : "deterministic replay failed",
          plan.id,
        ),
      });
      if (cancelled) {
        throw new VoiceReplayControllerError("replay_cancelled", "The local replay was cancelled; its authorization remains consumed.");
      }
      throw error;
    }
  }

  function evidenceFor(snapshot = state) {
    const result = snapshot.latestResult;
    return {
      ok: result !== null,
      state: result ? "completed" : "no-completed-replay",
      planId: snapshot.latestPlanId,
      preparedPlan: snapshot.preparedPlan,
      authorization: snapshot.authorization,
      runState: snapshot.runState,
      evidence: result ? {
        timeline: result.events,
        scorecard: result.scorecard,
        usage: result.usage,
      } : null,
      activity: snapshot.activity,
      evidenceBoundary: {
        provenance: "deterministic-local-simulation",
        liveProviderEvidence: false,
        providerRequestsMade: 0,
        providerSpend: 0,
        microphoneAccess: false,
        uploads: false,
        telephonyActions: false,
        persisted: false,
      },
    } as const;
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => state,
    getServerSnapshot: () => state,
    listScenarios,
    prepare,
    authorize,
    run,
    getEvidence: () => evidenceFor(),
    setPathname(pathname: string) {
      if (state.pathname && state.pathname !== pathname && state.preparedPlan) {
        invalidate("Client-side navigation invalidated the prepared replay plan.");
      }
      if (state.pathname !== pathname) emit({ ...state, pathname });
    },
    setLabMounted(mounted: boolean) {
      if (state.labMounted === mounted) return;
      if (!mounted && state.preparedPlan) {
        invalidate("Unmounting the Simulation Lab invalidated the prepared replay plan.");
      }
      emit({ ...state, labMounted: mounted });
    },
    invalidatePlan(reason: string) {
      invalidate(reason, "human-ui");
    },
  } as const;
}

function fingerprintFor(value: Readonly<Record<string, unknown>>) {
  const source = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
