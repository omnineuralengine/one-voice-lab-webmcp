import { z } from "zod";

export const SCENARIO_RUN_REQUEST_SCHEMA_VERSION = "one-scenario-run-request/1.0.0" as const;
export const SCENARIO_RUN_RESPONSE_SCHEMA_VERSION = "one-scenario-run-response/1.0.0" as const;
export const SCENARIO_RUN_RECEIPT_SCHEMA_VERSION = "one-scenario-run-receipt/1.0.0" as const;
export const SCENARIO_EVIDENCE_SCHEMA_VERSION = "one-scenario-evidence/1.0.0" as const;
export const SCENARIO_EXPLANATION_SCHEMA_VERSION = "one-scenario-explanation/1.0.0" as const;
export const SCENARIO_EXPLANATION_RULESET_VERSION = "one-scenario-explanation-rules/1.0.0" as const;
export const SCENARIO_DEFINITION_SCHEMA_VERSION = "one-scenario-definition/1.0.0" as const;
export const USER_SCENARIO_ID = "recover-from-interruption" as const;
export const USER_SCENARIO_VERSION = "1.0.0" as const;

const boundedIdSchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/);
const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const boundedTextSchema = z.string().trim().min(1).max(600);

export const scenarioReviewGoalSchema = z.enum([
  "understand-interruption",
  "inspect-evidence",
  "plan-next-check",
]);

export const scenarioRunRequestSchema = z.object({
  schemaVersion: z.literal(SCENARIO_RUN_REQUEST_SCHEMA_VERSION),
  scenarioId: z.literal(USER_SCENARIO_ID),
  scenarioVersion: z.literal(USER_SCENARIO_VERSION),
  executionMode: z.literal("synthetic_fixture"),
  reviewGoal: scenarioReviewGoalSchema,
  correlationToken: z.string().min(16).max(80).regex(/^[A-Za-z0-9_-]+$/),
}).strict();

export const scenarioEvidenceItemSchema = z.object({
  id: boundedIdSchema,
  schemaVersion: z.literal(SCENARIO_EVIDENCE_SCHEMA_VERSION),
  kind: z.enum(["assertion", "trace", "judgment", "execution-boundary", "measurement-boundary"]),
  evidenceClass: z.enum(["objective-observation", "derived-calculation", "human-judgment", "boundary"]),
  source: z.literal("synthetic_fixture"),
  epistemicState: z.enum(["observed", "derived", "unknown", "not_measured"]),
  claim: boundedTextSchema,
  assertionId: boundedIdSchema.optional(),
}).strict();

export const scenarioRunStepSchema = z.object({
  id: boundedIdSchema,
  actionId: z.literal("publicEvaluation.runSynthetic"),
  state: z.enum(["ran", "failed", "unavailable", "skipped"]),
  evidenceRefs: z.array(boundedIdSchema).max(24),
  failureClass: z.enum([
    "validation",
    "authentication",
    "permission",
    "rate-limit",
    "unavailable",
    "cancelled",
    "timeout",
    "provider",
    "internal",
  ]).optional(),
}).strict();

export const scenarioRunReceiptSchema = z.object({
  schemaVersion: z.literal(SCENARIO_RUN_RECEIPT_SCHEMA_VERSION),
  runId: z.string().uuid(),
  scenario: z.object({
    id: z.literal(USER_SCENARIO_ID),
    version: z.literal(USER_SCENARIO_VERSION),
    contentDigest: digestSchema,
  }).strict(),
  fixture: z.object({
    id: z.literal("interrupt-mid-response"),
    version: z.literal("1.0.0"),
    digest: digestSchema,
    seed: z.literal("ovl05a-interruption-recovery-v1"),
    frozenClock: z.string().datetime(),
    kind: z.literal("deterministic_local_simulation"),
    provenance: z.literal("repository-owned-synthetic-fixture"),
  }).strict(),
  action: z.object({
    id: z.literal("publicEvaluation.runSynthetic"),
    contractVersion: z.literal("1.0.0"),
  }).strict(),
  explainer: z.object({
    schemaVersion: z.literal(SCENARIO_EXPLANATION_SCHEMA_VERSION),
    rulesetVersion: z.literal(SCENARIO_EXPLANATION_RULESET_VERSION),
  }).strict(),
  input: z.object({
    reviewGoal: scenarioReviewGoalSchema,
    digest: digestSchema,
  }).strict(),
  execution: z.object({
    mode: z.literal("synthetic_fixture"),
    actorScope: z.enum(["guest-ephemeral", "human-ephemeral"]),
    providerCalls: z.literal(0),
    providerCredits: z.literal(0),
    persistence: z.literal("none"),
    retention: z.literal("ephemeral-no-store"),
  }).strict(),
  lifecycle: z.object({
    status: z.enum(["completed", "failed", "unavailable"]),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime(),
  }).strict(),
  evaluation: z.object({
    outcome: z.enum(["passed", "failed", "inconclusive", "not-scored"]),
  }).strict(),
  evidenceCompleteness: z.enum(["complete", "partial", "none"]),
  steps: z.array(scenarioRunStepSchema).length(1),
  evidence: z.array(scenarioEvidenceItemSchema).min(1).max(32),
  limitations: z.array(boundedTextSchema).min(1).max(12),
  normalizedDigest: digestSchema,
}).strict().superRefine((receipt, context) => {
  const evidenceIds = new Set<string>();
  for (const [index, item] of receipt.evidence.entries()) {
    if (evidenceIds.has(item.id)) {
      context.addIssue({ code: "custom", path: ["evidence", index, "id"], message: "Receipt evidence IDs must be unique." });
    }
    evidenceIds.add(item.id);
  }
  for (const [stepIndex, step] of receipt.steps.entries()) {
    for (const [referenceIndex, reference] of step.evidenceRefs.entries()) {
      if (!evidenceIds.has(reference)) {
        context.addIssue({
          code: "custom",
          path: ["steps", stepIndex, "evidenceRefs", referenceIndex],
          message: "Step evidence references must resolve within the receipt.",
        });
      }
    }
  }
  if (receipt.lifecycle.status === "completed" && receipt.steps[0].state !== "ran") {
    context.addIssue({ code: "custom", path: ["steps", 0, "state"], message: "A completed run must contain a ran action step." });
  }
  if (receipt.lifecycle.status === "completed" && receipt.evaluation.outcome === "not-scored") {
    context.addIssue({ code: "custom", path: ["evaluation", "outcome"], message: "A completed run must report a scored or explicitly inconclusive outcome." });
  }
  if (receipt.lifecycle.status !== "completed" && receipt.evaluation.outcome !== "not-scored") {
    context.addIssue({ code: "custom", path: ["evaluation", "outcome"], message: "An incomplete lifecycle cannot claim an evaluation outcome." });
  }
  if (receipt.evaluation.outcome === "inconclusive" && receipt.evidenceCompleteness !== "partial") {
    context.addIssue({ code: "custom", path: ["evidenceCompleteness"], message: "An unresolved human judgment must be reported as partial evidence." });
  }
  if (receipt.lifecycle.status !== "completed" && receipt.evidenceCompleteness !== "none") {
    context.addIssue({ code: "custom", path: ["evidenceCompleteness"], message: "An incomplete lifecycle has no scored scenario evidence." });
  }
  if (receipt.lifecycle.status === "failed" && receipt.steps[0].state !== "failed") {
    context.addIssue({ code: "custom", path: ["steps", 0, "state"], message: "A failed lifecycle must identify the failed action step." });
  }
  if (receipt.lifecycle.status === "unavailable" && receipt.steps[0].state !== "unavailable") {
    context.addIssue({ code: "custom", path: ["steps", 0, "state"], message: "An unavailable lifecycle must identify the unavailable action step." });
  }
  if (receipt.steps[0].state === "ran" && receipt.steps[0].failureClass !== undefined) {
    context.addIssue({ code: "custom", path: ["steps", 0, "failureClass"], message: "A ran step cannot also claim a normalized failure class." });
  }
  if (receipt.steps[0].state !== "ran" && receipt.steps[0].failureClass === undefined) {
    context.addIssue({ code: "custom", path: ["steps", 0, "failureClass"], message: "A non-ran step must identify a bounded normalized failure class." });
  }
});

export const scenarioExplanationStatementSchema = z.object({
  id: boundedIdSchema,
  category: z.enum(["happened", "supports", "uncertainty", "next"]),
  ruleId: boundedIdSchema,
  text: boundedTextSchema,
  basisRefs: z.array(boundedIdSchema).min(1).max(16),
}).strict();

export const scenarioExplanationSchema = z.object({
  schemaVersion: z.literal(SCENARIO_EXPLANATION_SCHEMA_VERSION),
  rulesetVersion: z.literal(SCENARIO_EXPLANATION_RULESET_VERSION),
  receiptDigest: digestSchema,
  generatedBy: z.literal("deterministic-rule-projection"),
  statements: z.array(scenarioExplanationStatementSchema).min(3).max(12),
}).strict().superRefine((explanation, context) => {
  const statementIds = new Set<string>();
  const categories = new Set<string>();
  for (const [index, statement] of explanation.statements.entries()) {
    if (statementIds.has(statement.id)) {
      context.addIssue({ code: "custom", path: ["statements", index, "id"], message: "Explanation statement IDs must be unique." });
    }
    statementIds.add(statement.id);
    categories.add(statement.category);
  }
  for (const category of ["happened", "supports", "uncertainty", "next"] as const) {
    if (!categories.has(category)) {
      context.addIssue({ code: "custom", path: ["statements"], message: `Explanation category '${category}' is required.` });
    }
  }
});

export const scenarioRunResponseSchema = z.object({
  schemaVersion: z.literal(SCENARIO_RUN_RESPONSE_SCHEMA_VERSION),
  receipt: scenarioRunReceiptSchema,
  explanation: scenarioExplanationSchema,
}).strict().superRefine((response, context) => {
  if (response.explanation.rulesetVersion !== response.receipt.explainer.rulesetVersion) {
    context.addIssue({
      code: "custom",
      path: ["explanation", "rulesetVersion"],
      message: "The explanation ruleset must match the version pinned by the receipt.",
    });
  }
  if (response.explanation.receiptDigest !== response.receipt.normalizedDigest) {
    context.addIssue({
      code: "custom",
      path: ["explanation", "receiptDigest"],
      message: "The explanation must identify the normalized receipt it explains.",
    });
  }
  const evidenceIds = new Set(response.receipt.evidence.map((item) => item.id));
  for (const [statementIndex, statement] of response.explanation.statements.entries()) {
    for (const [referenceIndex, reference] of statement.basisRefs.entries()) {
      if (!evidenceIds.has(reference)) {
        context.addIssue({
          code: "custom",
          path: ["explanation", "statements", statementIndex, "basisRefs", referenceIndex],
          message: "Every explanation statement must trace to receipt evidence.",
        });
      }
    }
  }
});

export type ScenarioReviewGoal = z.infer<typeof scenarioReviewGoalSchema>;
export type ScenarioRunRequest = z.infer<typeof scenarioRunRequestSchema>;
export type ScenarioEvidenceItem = z.infer<typeof scenarioEvidenceItemSchema>;
export type ScenarioRunReceipt = z.infer<typeof scenarioRunReceiptSchema>;
export type ScenarioExplanationStatement = z.infer<typeof scenarioExplanationStatementSchema>;
export type ScenarioExplanation = z.infer<typeof scenarioExplanationSchema>;
export type ScenarioRunResponse = z.infer<typeof scenarioRunResponseSchema>;
