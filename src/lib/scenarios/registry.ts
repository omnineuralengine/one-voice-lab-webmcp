import "server-only";

import {
  SCENARIO_DEFINITION_SCHEMA_VERSION,
  SCENARIO_EVIDENCE_SCHEMA_VERSION,
  SCENARIO_EXPLANATION_RULESET_VERSION,
  SCENARIO_EXPLANATION_SCHEMA_VERSION,
  SCENARIO_RUN_RECEIPT_SCHEMA_VERSION,
  SCENARIO_RUN_RESPONSE_SCHEMA_VERSION,
  USER_SCENARIO_ID,
  USER_SCENARIO_VERSION,
} from "@/lib/scenarios/contracts";
import { USER_SCENARIO_PRESENTATIONS } from "@/lib/scenarios/presentation";

const userPresentation = USER_SCENARIO_PRESENTATIONS[0];

export const USER_SCENARIO_CONTENT = Object.freeze({
  id: USER_SCENARIO_ID,
  version: USER_SCENARIO_VERSION,
  title: userPresentation.title,
  goal: userPresentation.goal,
  summary: userPresentation.summary,
  expectedLearning: Object.freeze([...userPresentation.expectedLearning]),
  reviewGoalIds: Object.freeze(userPresentation.reviewGoals.map((goal) => goal.id)),
  evaluationId: "interrupt-mid-response" as const,
  expectedAssertionIds: Object.freeze([
    "interruption-captured",
    "playback-canceled",
    "context-preserved",
  ] as const),
});

export const USER_SCENARIO_FIXTURE_CONTENT = Object.freeze({
  id: "interrupt-mid-response" as const,
  version: "1.0.0" as const,
  seed: "ovl05a-interruption-recovery-v1" as const,
  frozenClock: "2026-08-30T00:00:00.000Z" as const,
  kind: "deterministic_local_simulation" as const,
  provenance: "repository-owned-synthetic-fixture" as const,
  evaluationId: "interrupt-mid-response" as const,
  expectedAssertionIds: Object.freeze([
    "interruption-captured",
    "playback-canceled",
    "context-preserved",
  ] as const),
  providerCalls: 0 as const,
  providerCredits: 0 as const,
});

export const CONTRACT_FAILURE_FIXTURE_CONTENT = Object.freeze({
  id: "contract-action-failure" as const,
  version: "1.0.0" as const,
  seed: "ovl05a-contract-action-failure-v1" as const,
  frozenClock: "2026-08-30T00:00:01.000Z" as const,
  provenance: "repository_contract_mock" as const,
  expectedLifecycle: "failed" as const,
  providerCalls: 0 as const,
  providerCredits: 0 as const,
});

const CONTRACT_VERSIONS = Object.freeze({
  definitionSchemaVersion: SCENARIO_DEFINITION_SCHEMA_VERSION,
  responseSchemaVersion: SCENARIO_RUN_RESPONSE_SCHEMA_VERSION,
  receiptSchemaVersion: SCENARIO_RUN_RECEIPT_SCHEMA_VERSION,
  evidenceSchemaVersion: SCENARIO_EVIDENCE_SCHEMA_VERSION,
  explainerSchemaVersion: SCENARIO_EXPLANATION_SCHEMA_VERSION,
  explainerRulesetVersion: SCENARIO_EXPLANATION_RULESET_VERSION,
});

export type UserScenarioDefinition = Readonly<{
  id: typeof USER_SCENARIO_ID;
  version: typeof USER_SCENARIO_VERSION;
  audience: "user";
  scenarioContentDigest: `sha256:${string}`;
  fixtureDigest: `sha256:${string}`;
  fixture: typeof USER_SCENARIO_FIXTURE_CONTENT;
  provenance: "repository-owned-synthetic-fixture";
  contracts: typeof CONTRACT_VERSIONS;
  action: Readonly<{
    id: "publicEvaluation.runSynthetic";
    contractVersion: "1.0.0";
  }>;
}>;

type ContractOnlyScenarioDefinition = Readonly<{
  id: "contract-action-failure";
  version: "1.0.0";
  audience: "contract-only";
  fixtureDigest: `sha256:${string}`;
  fixture: typeof CONTRACT_FAILURE_FIXTURE_CONTENT;
  provenance: "repository-owned-contract-mock";
  contracts: typeof CONTRACT_VERSIONS;
  action: Readonly<{
    id: "publicEvaluation.runSynthetic";
    contractVersion: "1.0.0";
  }>;
}>;

export const SCENARIO_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: USER_SCENARIO_ID,
    version: USER_SCENARIO_VERSION,
    audience: "user" as const,
    scenarioContentDigest: "sha256:fc8e0a02101142456ae04f34941bba77bce20a30d091a6de62774b65ff1e3e8f" as const,
    fixtureDigest: "sha256:c1880f1d6f3917867bab5c405b9ed04f734d39c80f25ba04763a41f79665b170" as const,
    fixture: USER_SCENARIO_FIXTURE_CONTENT,
    provenance: "repository-owned-synthetic-fixture" as const,
    contracts: CONTRACT_VERSIONS,
    action: Object.freeze({
      id: "publicEvaluation.runSynthetic" as const,
      contractVersion: "1.0.0" as const,
    }),
  }),
  Object.freeze({
    id: "contract-action-failure" as const,
    version: "1.0.0" as const,
    audience: "contract-only" as const,
    fixtureDigest: "sha256:7a2290a28e2a512207167b3f00bfa7ce4b886242a8149d347432501a00367f38" as const,
    fixture: CONTRACT_FAILURE_FIXTURE_CONTENT,
    provenance: "repository-owned-contract-mock" as const,
    contracts: CONTRACT_VERSIONS,
    action: Object.freeze({
      id: "publicEvaluation.runSynthetic" as const,
      contractVersion: "1.0.0" as const,
    }),
  }),
]) satisfies readonly [UserScenarioDefinition, ContractOnlyScenarioDefinition];

export function getUserScenarioDefinition(
  scenarioId: typeof USER_SCENARIO_ID,
): UserScenarioDefinition {
  const definition = SCENARIO_DEFINITIONS[0];
  if (definition.id !== scenarioId || definition.audience !== "user") {
    throw new Error("The requested user scenario is not installed.");
  }
  return definition;
}
