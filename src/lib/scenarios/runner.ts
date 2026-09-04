import "server-only";

import type { ActionErrorCategory, ActionResult } from "@/lib/actions/contracts";
import type { ActionExecutionDependencies } from "@/lib/actions/results";
import {
  executePublicServerAction,
  type PublicServerActionContext,
} from "@/lib/actions/server/executor";
import type { ActionInput, ActionOutput } from "@/lib/actions/registry";
import {
  SCENARIO_EVIDENCE_SCHEMA_VERSION,
  SCENARIO_EXPLANATION_RULESET_VERSION,
  SCENARIO_EXPLANATION_SCHEMA_VERSION,
  SCENARIO_RUN_RECEIPT_SCHEMA_VERSION,
  SCENARIO_RUN_RESPONSE_SCHEMA_VERSION,
  scenarioRunRequestSchema,
  scenarioRunReceiptSchema,
  scenarioRunResponseSchema,
  type ScenarioEvidenceItem,
  type ScenarioRunReceipt,
  type ScenarioRunRequest,
  type ScenarioRunResponse,
} from "@/lib/scenarios/contracts";
import { createScenarioDigest } from "@/lib/scenarios/digest";
import { explainScenarioReceipt } from "@/lib/scenarios/explanation";
import {
  CONTRACT_FAILURE_FIXTURE_CONTENT,
  SCENARIO_DEFINITIONS,
  USER_SCENARIO_CONTENT,
  USER_SCENARIO_FIXTURE_CONTENT,
  getUserScenarioDefinition,
} from "@/lib/scenarios/registry";

type SyntheticActionResult = ActionResult<
  "publicEvaluation.runSynthetic",
  ActionOutput<"publicEvaluation.runSynthetic">
>;

export type ScenarioActionExecutor = (
  name: "publicEvaluation.runSynthetic",
  input: ActionInput<"publicEvaluation.runSynthetic">,
  context: PublicServerActionContext,
) => Promise<SyntheticActionResult>;

export type ScenarioRunnerDependencies = Readonly<{
  actorScope?: "guest-ephemeral" | "human-ephemeral";
  now?: () => Date;
  createRunId?: () => string;
  signal?: AbortSignal;
  executeAction?: ScenarioActionExecutor;
  /** Deterministic server-only test seam. This value is never accepted from the browser request. */
  contractFixture?: "action-failure";
}>;

const RECEIPT_LIMITATIONS = Object.freeze([
  "This run uses a repository-owned synthetic fixture and makes no claim about a live voice provider.",
  "Context preservation still requires human review; deterministic event presence is not a subjective quality judgment.",
  "Provider latency, cost, availability, production reliability, and user-perceived timing were not measured.",
  "The receipt is ephemeral and no run history, transcript, raw audio, or provider response is persisted.",
]);

function actionFailureFixture(
  code = "scenario_contract_failure",
): SyntheticActionResult {
  return {
    ok: false,
    action: "publicEvaluation.runSynthetic",
    invocationId: "scenario-contract-action-failure",
    error: {
      code,
      category: "internal",
      message: "The synthetic action failed safely.",
      retryable: false,
    },
    meta: {
      source: "ui",
      startedAt: CONTRACT_FAILURE_FIXTURE_CONTENT.frozenClock,
      completedAt: CONTRACT_FAILURE_FIXTURE_CONTENT.frozenClock,
      durationMs: 0,
      usage: "local-resource",
    },
  };
}

function normalizedReceiptDigest(receipt: Omit<ScenarioRunReceipt, "runId" | "lifecycle" | "normalizedDigest"> & {
  lifecycle: Pick<ScenarioRunReceipt["lifecycle"], "status">;
}): `sha256:${string}` {
  return createScenarioDigest(receipt);
}

function buildFailureReceipt(args: Readonly<{
  request: ScenarioRunRequest;
  runId: string;
  startedAt: string;
  completedAt: string;
  actorScope: "guest-ephemeral" | "human-ephemeral";
  category: ActionErrorCategory;
  unavailable: boolean;
}>): ScenarioRunReceipt {
  const definition = getUserScenarioDefinition(args.request.scenarioId);
  const actionEvidenceId = "action-execution-boundary";
  const measurementEvidenceId = "provider-performance-not-measured";
  const evidence: ScenarioEvidenceItem[] = [
    {
      id: actionEvidenceId,
      schemaVersion: SCENARIO_EVIDENCE_SCHEMA_VERSION,
      kind: "execution-boundary",
      evidenceClass: "objective-observation",
      source: "synthetic_fixture",
      epistemicState: "observed",
      claim: args.unavailable
        ? "The shared synthetic evaluation action was unavailable, so no scenario outcome was scored."
        : `The shared synthetic evaluation action returned a normalized ${args.category} failure, so no scenario outcome was scored.`,
    },
    {
      id: measurementEvidenceId,
      schemaVersion: SCENARIO_EVIDENCE_SCHEMA_VERSION,
      kind: "measurement-boundary",
      evidenceClass: "boundary",
      source: "synthetic_fixture",
      epistemicState: "not_measured",
      claim: "No provider request, provider performance, timing, cost, or production behavior was measured.",
    },
  ];
  const stableReceipt = {
    schemaVersion: SCENARIO_RUN_RECEIPT_SCHEMA_VERSION,
    scenario: {
      id: definition.id,
      version: definition.version,
      contentDigest: definition.scenarioContentDigest,
    },
    fixture: {
      id: definition.fixture.id,
      version: definition.fixture.version,
      digest: definition.fixtureDigest,
      seed: definition.fixture.seed,
      frozenClock: definition.fixture.frozenClock,
      kind: definition.fixture.kind,
      provenance: definition.fixture.provenance,
    },
    action: definition.action,
    explainer: {
      schemaVersion: SCENARIO_EXPLANATION_SCHEMA_VERSION,
      rulesetVersion: SCENARIO_EXPLANATION_RULESET_VERSION,
    },
    input: {
      reviewGoal: args.request.reviewGoal,
      digest: createScenarioDigest({
        scenarioId: args.request.scenarioId,
        scenarioVersion: args.request.scenarioVersion,
        executionMode: args.request.executionMode,
        reviewGoal: args.request.reviewGoal,
      }),
    },
    execution: {
      mode: "synthetic_fixture" as const,
      actorScope: args.actorScope,
      providerCalls: 0 as const,
      providerCredits: 0 as const,
      persistence: "none" as const,
      retention: "ephemeral-no-store" as const,
    },
    evaluation: { outcome: "not-scored" as const },
    evidenceCompleteness: "none" as const,
    steps: [{
      id: "run-synthetic-evaluation" as const,
      actionId: definition.action.id,
      state: args.unavailable ? "unavailable" as const : "failed" as const,
      evidenceRefs: [actionEvidenceId, measurementEvidenceId],
      failureClass: args.category,
    }],
    evidence,
    limitations: [...RECEIPT_LIMITATIONS],
  };
  const lifecycleStatus = args.unavailable ? "unavailable" as const : "failed" as const;
  return scenarioRunReceiptSchema.parse({
    ...stableReceipt,
    runId: args.runId,
    lifecycle: {
      status: lifecycleStatus,
      startedAt: args.startedAt,
      completedAt: args.completedAt,
    },
    normalizedDigest: normalizedReceiptDigest({
      ...stableReceipt,
      lifecycle: { status: lifecycleStatus },
    }),
  });
}

function buildCompletedReceipt(args: Readonly<{
  request: ScenarioRunRequest;
  actionResult: Extract<SyntheticActionResult, { ok: true }>;
  runId: string;
  startedAt: string;
  completedAt: string;
  actorScope: "guest-ephemeral" | "human-ephemeral";
}>): ScenarioRunReceipt {
  const definition = getUserScenarioDefinition(args.request.scenarioId);
  const result = args.actionResult.data.result;
  const actualAssertionIds = result.assertionResults.map((assertion) => assertion.id);
  if (
    actualAssertionIds.length !== definition.fixture.expectedAssertionIds.length
    || definition.fixture.expectedAssertionIds.some((id, index) => actualAssertionIds[index] !== id)
  ) {
    return buildFailureReceipt({
      request: args.request,
      runId: args.runId,
      startedAt: args.startedAt,
      completedAt: args.completedAt,
      actorScope: args.actorScope,
      category: "internal",
      unavailable: false,
    });
  }

  const evidence: ScenarioEvidenceItem[] = [{
    id: "synthetic-trace-summary",
    schemaVersion: SCENARIO_EVIDENCE_SCHEMA_VERSION,
    kind: "trace",
    evidenceClass: "objective-observation",
    source: "synthetic_fixture",
    epistemicState: "observed",
    claim: `The repository fixture produced a sanitized simulated trace with ${result.trace.eventCount} events and no raw audio.`,
  }];

  for (const assertion of result.assertionResults) {
    evidence.push({
      id: `assertion-${assertion.id}`,
      schemaVersion: SCENARIO_EVIDENCE_SCHEMA_VERSION,
      kind: "assertion",
      evidenceClass: "objective-observation",
      source: "synthetic_fixture",
      epistemicState: "observed",
      assertionId: assertion.id,
      claim: `The deterministic fixture assertion '${assertion.id}' ${assertion.passed ? "passed" : "failed"}.`,
    });
    if (assertion.requiresHumanReview) {
      evidence.push({
        id: `judgment-${assertion.id}`,
        schemaVersion: SCENARIO_EVIDENCE_SCHEMA_VERSION,
        kind: "judgment",
        evidenceClass: "human-judgment",
        source: "synthetic_fixture",
        epistemicState: "unknown",
        assertionId: assertion.id,
        claim: `The subjective judgment for '${assertion.id}' remains unknown until a human reviews representative behavior.`,
      });
    }
  }
  const failedAssertion = result.assertionResults.some((assertion) => !assertion.passed);
  const humanReviewRequired = result.assertionResults.some((assertion) => assertion.requiresHumanReview);
  const outcome = failedAssertion ? "failed" as const : humanReviewRequired ? "inconclusive" as const : "passed" as const;
  evidence.push({
    id: "derived-evaluation-outcome",
    schemaVersion: SCENARIO_EVIDENCE_SCHEMA_VERSION,
    kind: "assertion",
    evidenceClass: "derived-calculation",
    source: "synthetic_fixture",
    epistemicState: "derived",
    claim: `The pinned evaluation rules derive the scenario outcome '${outcome}' from the fixture assertion states and human-review requirements.`,
  });
  evidence.push({
    id: "provider-performance-not-measured",
    schemaVersion: SCENARIO_EVIDENCE_SCHEMA_VERSION,
    kind: "measurement-boundary",
    evidenceClass: "boundary",
    source: "synthetic_fixture",
    epistemicState: "not_measured",
    claim: "No provider request, provider performance, timing, cost, or production behavior was measured.",
  });

  const stableReceipt = {
    schemaVersion: SCENARIO_RUN_RECEIPT_SCHEMA_VERSION,
    scenario: {
      id: definition.id,
      version: definition.version,
      contentDigest: definition.scenarioContentDigest,
    },
    fixture: {
      id: definition.fixture.id,
      version: definition.fixture.version,
      digest: definition.fixtureDigest,
      seed: definition.fixture.seed,
      frozenClock: definition.fixture.frozenClock,
      kind: definition.fixture.kind,
      provenance: definition.fixture.provenance,
    },
    action: definition.action,
    explainer: {
      schemaVersion: SCENARIO_EXPLANATION_SCHEMA_VERSION,
      rulesetVersion: SCENARIO_EXPLANATION_RULESET_VERSION,
    },
    input: {
      reviewGoal: args.request.reviewGoal,
      digest: createScenarioDigest({
        scenarioId: args.request.scenarioId,
        scenarioVersion: args.request.scenarioVersion,
        executionMode: args.request.executionMode,
        reviewGoal: args.request.reviewGoal,
      }),
    },
    execution: {
      mode: "synthetic_fixture" as const,
      actorScope: args.actorScope,
      providerCalls: 0 as const,
      providerCredits: 0 as const,
      persistence: "none" as const,
      retention: "ephemeral-no-store" as const,
    },
    evaluation: { outcome },
    evidenceCompleteness: humanReviewRequired ? "partial" as const : "complete" as const,
    steps: [{
      id: "run-synthetic-evaluation" as const,
      actionId: definition.action.id,
      state: "ran" as const,
      evidenceRefs: evidence.map((item) => item.id),
    }],
    evidence,
    limitations: [...RECEIPT_LIMITATIONS],
  };
  return scenarioRunReceiptSchema.parse({
    ...stableReceipt,
    runId: args.runId,
    lifecycle: {
      status: "completed",
      startedAt: args.startedAt,
      completedAt: args.completedAt,
    },
    normalizedDigest: normalizedReceiptDigest({
      ...stableReceipt,
      lifecycle: { status: "completed" },
    }),
  });
}

function verifyPinnedManifest(): ActionErrorCategory | null {
  const definition = getUserScenarioDefinition(USER_SCENARIO_CONTENT.id);
  if (createScenarioDigest(USER_SCENARIO_CONTENT) !== definition.scenarioContentDigest) return "internal";
  if (createScenarioDigest(USER_SCENARIO_FIXTURE_CONTENT) !== definition.fixtureDigest) return "internal";
  return null;
}

function verifyContractFixture(): boolean {
  const hidden = SCENARIO_DEFINITIONS.find((definition) => definition.audience === "contract-only");
  return Boolean(
    hidden
    && hidden.id === CONTRACT_FAILURE_FIXTURE_CONTENT.id
    && createScenarioDigest(CONTRACT_FAILURE_FIXTURE_CONTENT) === hidden.fixtureDigest,
  );
}

export async function runScenarioFixture(
  request: ScenarioRunRequest,
  dependencies: ScenarioRunnerDependencies = {},
): Promise<ScenarioRunResponse> {
  const parsedRequest = scenarioRunRequestSchema.parse(request);
  const now = dependencies.now ?? (() => new Date());
  const createRunId = dependencies.createRunId ?? (() => globalThis.crypto.randomUUID());
  const actorScope = dependencies.actorScope ?? "guest-ephemeral";
  const startedAt = now().toISOString();
  const runId = createRunId();
  const manifestFailure = verifyPinnedManifest();

  let actionResult: SyntheticActionResult;
  if (manifestFailure) {
    actionResult = actionFailureFixture();
  } else if (dependencies.contractFixture === "action-failure") {
    actionResult = verifyContractFixture()
      ? actionFailureFixture()
      : actionFailureFixture("scenario_contract_fixture_invalid");
  } else {
    const fixtureClock = getUserScenarioDefinition(parsedRequest.scenarioId).fixture.frozenClock;
    const execution: ActionExecutionDependencies = {
      now: () => new Date(fixtureClock),
      monotonicNow: () => 0,
      createInvocationId: () => "scenario-interruption-synthetic-action",
    };
    actionResult = await (dependencies.executeAction ?? executePublicServerAction)(
      "publicEvaluation.runSynthetic",
      { evalId: USER_SCENARIO_FIXTURE_CONTENT.evaluationId },
      { source: "ui", execution, signal: dependencies.signal },
    );
  }

  const completedAt = now().toISOString();
  const receipt = actionResult.ok
    ? buildCompletedReceipt({
        request: parsedRequest,
        actionResult,
        runId,
        startedAt,
        completedAt,
        actorScope,
      })
    : buildFailureReceipt({
        request: parsedRequest,
        runId,
        startedAt,
        completedAt,
        actorScope,
        category: actionResult.error.category,
        unavailable: actionResult.error.category === "unavailable",
      });
  const explanation = explainScenarioReceipt(receipt);
  return scenarioRunResponseSchema.parse({
    schemaVersion: SCENARIO_RUN_RESPONSE_SCHEMA_VERSION,
    receipt,
    explanation,
  });
}
