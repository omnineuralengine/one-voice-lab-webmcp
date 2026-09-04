import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { executePublicServerAction } from "@/lib/actions/server/executor";
import {
  SCENARIO_EXPLANATION_RULESET_VERSION,
  SCENARIO_RUN_REQUEST_SCHEMA_VERSION,
  USER_SCENARIO_ID,
  USER_SCENARIO_VERSION,
  scenarioRunResponseSchema,
  type ScenarioRunRequest,
} from "@/lib/scenarios/contracts";
import {
  runScenarioFixture,
  type ScenarioActionExecutor,
} from "@/lib/scenarios/runner";

const REQUEST: ScenarioRunRequest = {
  schemaVersion: SCENARIO_RUN_REQUEST_SCHEMA_VERSION,
  scenarioId: USER_SCENARIO_ID,
  scenarioVersion: USER_SCENARIO_VERSION,
  executionMode: "synthetic_fixture",
  reviewGoal: "understand-interruption",
  correlationToken: "correlation_token_never_returned",
};

const DETERMINISTIC_DEPENDENCIES = {
  now: () => new Date("2026-08-30T12:00:00.000Z"),
  createRunId: () => "00000000-0000-4000-8000-00000000005a",
} as const;

test.describe("Scenario Studio deterministic runner", () => {
  test("runs the existing action runtime with no network, provider call, credit, or persistence", async () => {
    const originalFetch = globalThis.fetch;
    const originalWebSocket = globalThis.WebSocket;
    let fetchCalls = 0;
    let webSocketCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      throw new Error("Scenario fixtures must not call the network.");
    }) as typeof fetch;
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      writable: true,
      value: class ScenarioNetworkSentinel {
        constructor() {
          webSocketCalls += 1;
          throw new Error("Scenario fixtures must not open a WebSocket.");
        }
      },
    });

    try {
      const response = await runScenarioFixture(REQUEST, DETERMINISTIC_DEPENDENCIES);
      expect(scenarioRunResponseSchema.safeParse(response).success).toBe(true);
      expect(response.receipt).toMatchObject({
        lifecycle: { status: "completed" },
        evaluation: { outcome: "inconclusive" },
        evidenceCompleteness: "partial",
        execution: {
          mode: "synthetic_fixture",
          actorScope: "guest-ephemeral",
          providerCalls: 0,
          providerCredits: 0,
          persistence: "none",
          retention: "ephemeral-no-store",
        },
        steps: [{ actionId: "publicEvaluation.runSynthetic", state: "ran" }],
        explainer: {
          rulesetVersion: SCENARIO_EXPLANATION_RULESET_VERSION,
        },
      });
      expect(response.receipt.evidence).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "trace", source: "synthetic_fixture", epistemicState: "observed" }),
        expect.objectContaining({ assertionId: "interruption-captured", evidenceClass: "objective-observation", epistemicState: "observed" }),
        expect.objectContaining({ assertionId: "context-preserved", kind: "judgment", evidenceClass: "human-judgment", epistemicState: "unknown" }),
        expect.objectContaining({ id: "derived-evaluation-outcome", evidenceClass: "derived-calculation", epistemicState: "derived" }),
        expect.objectContaining({ kind: "measurement-boundary", evidenceClass: "boundary", epistemicState: "not_measured" }),
      ]));
      expect(fetchCalls).toBe(0);
      expect(webSocketCalls).toBe(0);
      expect(JSON.stringify(response)).not.toContain(REQUEST.correlationToken);
      expect(JSON.stringify(response)).not.toMatch(/"(?:providerId|modelId|apiKey|authorization|rawAudio|transcript)"\s*:/i);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalWebSocket === undefined) {
        delete (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
      } else {
        Object.defineProperty(globalThis, "WebSocket", {
          configurable: true,
          writable: true,
          value: originalWebSocket,
        });
      }
    }
  });

  test("contains no live-provider adapter or transport import", () => {
    const scenarioSources = [
      "src/lib/scenarios/runner.ts",
      "src/lib/scenarios/registry.ts",
      "src/app/api/scenarios/run/route.ts",
    ].map((file) => readFileSync(join(process.cwd(), file), "utf8")).join("\n");
    expect(scenarioSources).not.toMatch(/@\/lib\/providers\//);
    expect(scenarioSources).not.toMatch(/(?:deepgram|elevenlabs|fish-audio|cartesia|reson8)/i);
    expect(scenarioSources).not.toMatch(/\b(?:fetch|WebSocket)\s*\(/);
  });

  test("replays deterministically when the clock and run ID are injected", async () => {
    const first = await runScenarioFixture(REQUEST, DETERMINISTIC_DEPENDENCIES);
    const second = await runScenarioFixture(REQUEST, DETERMINISTIC_DEPENDENCIES);
    expect(second).toEqual(first);
    expect(first.receipt.normalizedDigest).toMatch(/^sha256:[a-f0-9]{64}$/);

    const changedCorrelation = await runScenarioFixture(
      { ...REQUEST, correlationToken: "different_correlation_token_123" },
      DETERMINISTIC_DEPENDENCIES,
    );
    expect(changedCorrelation.receipt.normalizedDigest).toBe(first.receipt.normalizedDigest);

    const changedGoal = await runScenarioFixture(
      { ...REQUEST, reviewGoal: "inspect-evidence" },
      DETERMINISTIC_DEPENDENCIES,
    );
    expect(changedGoal.receipt.normalizedDigest).not.toBe(first.receipt.normalizedDigest);
  });

  test("dispatches only the pinned action and keeps actor identity coarse", async () => {
    let observed: Readonly<{
      name: string;
      input: unknown;
      source: string;
      actionClock: string;
      executedAt: string;
    }> | null = null;
    const executor: ScenarioActionExecutor = async (name, input, context) => {
      const actionResult = await executePublicServerAction(name, input, context);
      observed = {
        name,
        input,
        source: context.source,
        actionClock: context.execution?.now?.().toISOString() ?? "missing",
        executedAt: actionResult.ok ? actionResult.data.result.executedAt : "failed",
      };
      return actionResult;
    };
    const response = await runScenarioFixture(REQUEST, {
      ...DETERMINISTIC_DEPENDENCIES,
      actorScope: "human-ephemeral",
      executeAction: executor,
    });
    expect(observed).toEqual({
      name: "publicEvaluation.runSynthetic",
      input: { evalId: "interrupt-mid-response" },
      source: "ui",
      actionClock: "2026-08-30T00:00:00.000Z",
      executedAt: "2026-08-30T00:00:00.000Z",
    });
    expect(response.receipt.execution.actorScope).toBe("human-ephemeral");
    expect(JSON.stringify(response)).not.toMatch(/"(?:userId|email|subject|sessionId)"\s*:/i);
  });

  test("keeps action lifecycle separate from an evaluated fixture failure", async () => {
    const executor: ScenarioActionExecutor = async (name, input, context) => {
      const original = await executePublicServerAction(name, input, context);
      if (!original.ok) return original;
      const assertionResults = original.data.result.assertionResults.map((assertion, index) => (
        index === 0 ? { ...assertion, passed: false } : assertion
      ));
      return {
        ...original,
        data: {
          result: {
            ...original.data.result,
            passed: false,
            assertionResults,
          },
        },
      };
    };
    const response = await runScenarioFixture(REQUEST, {
      ...DETERMINISTIC_DEPENDENCIES,
      executeAction: executor,
    });
    expect(response.receipt.lifecycle.status).toBe("completed");
    expect(response.receipt.evaluation.outcome).toBe("failed");
    expect(response.receipt.steps[0].state).toBe("ran");
  });

  test("produces a strict failure receipt through the hidden contract lane", async () => {
    const response = await runScenarioFixture(REQUEST, {
      ...DETERMINISTIC_DEPENDENCIES,
      contractFixture: "action-failure",
    });
    expect(response.receipt).toMatchObject({
      lifecycle: { status: "failed" },
      evaluation: { outcome: "not-scored" },
      evidenceCompleteness: "none",
      steps: [{ state: "failed", failureClass: "internal" }],
      execution: { providerCalls: 0, providerCredits: 0, persistence: "none" },
    });
    expect(response.receipt.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "execution-boundary", epistemicState: "observed" }),
      expect.objectContaining({ kind: "measurement-boundary", epistemicState: "not_measured" }),
    ]));
  });

  test("produces an unavailable receipt without a scored outcome", async () => {
    const unavailable: ScenarioActionExecutor = async () => ({
      ok: false,
      action: "publicEvaluation.runSynthetic",
      invocationId: "unavailable-contract-action",
      error: {
        code: "action_unavailable",
        category: "unavailable",
        message: "Unavailable.",
        retryable: true,
      },
      meta: {
        source: "ui",
        startedAt: "2026-08-30T00:00:00.000Z",
        completedAt: "2026-08-30T00:00:00.000Z",
        durationMs: 0,
        usage: "local-resource",
      },
    });
    const response = await runScenarioFixture(REQUEST, {
      ...DETERMINISTIC_DEPENDENCIES,
      executeAction: unavailable,
    });
    expect(response.receipt.lifecycle.status).toBe("unavailable");
    expect(response.receipt.evaluation.outcome).toBe("not-scored");
    expect(response.receipt.steps[0]).toMatchObject({ state: "unavailable", failureClass: "unavailable" });
  });

  test("projects every explanation statement from receipt evidence with pure stable rules", async () => {
    const response = await runScenarioFixture(REQUEST, DETERMINISTIC_DEPENDENCIES);
    const evidenceIds = new Set(response.receipt.evidence.map((evidence) => evidence.id));
    expect(response.explanation.generatedBy).toBe("deterministic-rule-projection");
    expect(response.explanation.rulesetVersion).toBe(SCENARIO_EXPLANATION_RULESET_VERSION);
    expect(response.explanation.rulesetVersion).toBe(response.receipt.explainer.rulesetVersion);
    const mismatchedRuleset = JSON.parse(JSON.stringify(response)) as Record<string, unknown> & {
      explanation: { rulesetVersion: string };
    };
    mismatchedRuleset.explanation.rulesetVersion = "one-scenario-explanation-rules/2.0.0";
    expect(scenarioRunResponseSchema.safeParse(mismatchedRuleset).success).toBe(false);
    expect(response.explanation.receiptDigest).toBe(response.receipt.normalizedDigest);
    expect(response.explanation.statements.map((statement) => statement.category)).toEqual([
      "happened",
      "supports",
      "uncertainty",
      "next",
    ]);
    for (const statement of response.explanation.statements) {
      expect(statement.ruleId).not.toBe("");
      expect(statement.basisRefs.length).toBeGreaterThan(0);
      expect(statement.basisRefs.every((reference) => evidenceIds.has(reference))).toBe(true);
    }
  });
});
