import { expect, test } from "@playwright/test";

import {
  AGENT_ACTION_ALLOWLIST,
  getActionDefinition,
} from "@/lib/actions/registry";
import { PUBLIC_SERVER_ACTION_NAMES } from "@/lib/actions/server/executor";
import {
  SCENARIO_DEFINITION_SCHEMA_VERSION,
  SCENARIO_EVIDENCE_SCHEMA_VERSION,
  SCENARIO_EXPLANATION_RULESET_VERSION,
  SCENARIO_EXPLANATION_SCHEMA_VERSION,
  SCENARIO_RUN_RECEIPT_SCHEMA_VERSION,
  SCENARIO_RUN_REQUEST_SCHEMA_VERSION,
  SCENARIO_RUN_RESPONSE_SCHEMA_VERSION,
  USER_SCENARIO_ID,
  USER_SCENARIO_VERSION,
  scenarioRunRequestSchema,
} from "@/lib/scenarios/contracts";
import { createScenarioDigest } from "@/lib/scenarios/digest";
import {
  USER_SCENARIO_PRESENTATIONS,
  getUserScenarioPresentation,
} from "@/lib/scenarios/presentation";
import {
  CONTRACT_FAILURE_FIXTURE_CONTENT,
  SCENARIO_DEFINITIONS,
  USER_SCENARIO_CONTENT,
  USER_SCENARIO_FIXTURE_CONTENT,
  getUserScenarioDefinition,
} from "@/lib/scenarios/registry";

const validRequest = {
  schemaVersion: SCENARIO_RUN_REQUEST_SCHEMA_VERSION,
  scenarioId: USER_SCENARIO_ID,
  scenarioVersion: USER_SCENARIO_VERSION,
  executionMode: "synthetic_fixture" as const,
  reviewGoal: "understand-interruption" as const,
  correlationToken: "scenario_request_123456",
};

test.describe("Scenario Studio contracts", () => {
  test("accepts only the one bounded user scenario request", () => {
    expect(scenarioRunRequestSchema.parse(validRequest)).toEqual(validRequest);
    expect(scenarioRunRequestSchema.safeParse({ ...validRequest, scenarioId: "contract-action-failure" }).success).toBe(false);
    expect(scenarioRunRequestSchema.safeParse({ ...validRequest, scenarioVersion: "2.0.0" }).success).toBe(false);
    expect(scenarioRunRequestSchema.safeParse({ ...validRequest, executionMode: "live" }).success).toBe(false);
    expect(scenarioRunRequestSchema.safeParse({ ...validRequest, reviewGoal: "run-provider" }).success).toBe(false);
    expect(scenarioRunRequestSchema.safeParse({ ...validRequest, correlationToken: "short" }).success).toBe(false);
    expect(scenarioRunRequestSchema.safeParse({ ...validRequest, correlationToken: "x".repeat(81) }).success).toBe(false);
    expect(scenarioRunRequestSchema.safeParse({ ...validRequest, correlationToken: "not safe/correlation" }).success).toBe(false);

    for (const injected of ["actionId", "providerId", "modelId", "fixtureId", "evalId"] as const) {
      expect(scenarioRunRequestSchema.safeParse({ ...validRequest, [injected]: "caller-choice" }).success).toBe(false);
    }
  });

  test("pins immutable scenario, fixture, action, receipt, evidence, and explainer contracts", () => {
    const definition = getUserScenarioDefinition(USER_SCENARIO_ID);
    expect(SCENARIO_EXPLANATION_RULESET_VERSION).not.toBe(SCENARIO_EXPLANATION_SCHEMA_VERSION);
    expect(definition).toMatchObject({
      id: USER_SCENARIO_ID,
      version: USER_SCENARIO_VERSION,
      audience: "user",
      provenance: "repository-owned-synthetic-fixture",
      action: { id: "publicEvaluation.runSynthetic", contractVersion: "1.0.0" },
      contracts: {
        definitionSchemaVersion: SCENARIO_DEFINITION_SCHEMA_VERSION,
        responseSchemaVersion: SCENARIO_RUN_RESPONSE_SCHEMA_VERSION,
        receiptSchemaVersion: SCENARIO_RUN_RECEIPT_SCHEMA_VERSION,
        evidenceSchemaVersion: SCENARIO_EVIDENCE_SCHEMA_VERSION,
        explainerSchemaVersion: SCENARIO_EXPLANATION_SCHEMA_VERSION,
        explainerRulesetVersion: SCENARIO_EXPLANATION_RULESET_VERSION,
      },
      fixture: {
        id: "interrupt-mid-response",
        version: "1.0.0",
        seed: "ovl05a-interruption-recovery-v1",
        frozenClock: "2026-08-30T00:00:00.000Z",
        kind: "deterministic_local_simulation",
        provenance: "repository-owned-synthetic-fixture",
        providerCalls: 0,
        providerCredits: 0,
      },
    });
    expect(createScenarioDigest(USER_SCENARIO_CONTENT)).toBe(definition.scenarioContentDigest);
    expect(createScenarioDigest(USER_SCENARIO_FIXTURE_CONTENT)).toBe(definition.fixtureDigest);
    expect(createScenarioDigest({ second: 2, first: { b: true, a: "value" } }))
      .toBe(createScenarioDigest({ first: { a: "value", b: true }, second: 2 }));
    expect(() => createScenarioDigest({ invalid: undefined })).toThrow(/undefined/);
  });

  test("keeps the second immutable contract mock server-only and out of presentation", () => {
    expect(SCENARIO_DEFINITIONS).toHaveLength(2);
    const hidden = SCENARIO_DEFINITIONS.find((definition) => definition.audience === "contract-only");
    expect(hidden).toMatchObject({
      id: "contract-action-failure",
      audience: "contract-only",
      provenance: "repository-owned-contract-mock",
      fixture: { expectedLifecycle: "failed", providerCalls: 0, providerCredits: 0 },
    });
    if (!hidden) throw new Error("Missing hidden contract fixture.");
    expect(createScenarioDigest(CONTRACT_FAILURE_FIXTURE_CONTENT)).toBe(hidden.fixtureDigest);

    expect(USER_SCENARIO_PRESENTATIONS).toHaveLength(1);
    expect(USER_SCENARIO_PRESENTATIONS[0].id).toBe(USER_SCENARIO_ID);
    expect(getUserScenarioPresentation("contract-action-failure")).toBeNull();
    expect(JSON.stringify(USER_SCENARIO_PRESENTATIONS)).not.toContain("contract-action-failure");
  });

  test("registers a local-resource UI action without REST, MCP, automation, or agent exposure", () => {
    const action = getActionDefinition("scenario.runFixture");
    expect(action.metadata).toMatchObject({
      authentication: "optional",
      trust: ["same-origin", "user-gesture"],
      surfaces: ["ui", "keyboard", "touch", "pwa"],
      agentExposable: false,
      usage: { kind: "local-resource", confirmationRequired: false },
      implementation: "dedicated-service",
    });
    expect(action.inputSchema.safeParse(validRequest).success).toBe(true);
    expect(AGENT_ACTION_ALLOWLIST).not.toContain("scenario.runFixture");
    expect(PUBLIC_SERVER_ACTION_NAMES).not.toContain("scenario.runFixture");
  });
});
