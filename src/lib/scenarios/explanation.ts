import {
  SCENARIO_EXPLANATION_RULESET_VERSION,
  SCENARIO_EXPLANATION_SCHEMA_VERSION,
  scenarioExplanationSchema,
  type ScenarioEvidenceItem,
  type ScenarioExplanation,
  type ScenarioRunReceipt,
} from "@/lib/scenarios/contracts";

function evidenceIds(
  receipt: ScenarioRunReceipt,
  predicate: (item: ScenarioEvidenceItem) => boolean,
): string[] {
  return receipt.evidence.filter(predicate).map((item) => item.id);
}

function firstEvidenceId(receipt: ScenarioRunReceipt): string {
  return receipt.evidence[0].id;
}

export function explainScenarioReceipt(receipt: ScenarioRunReceipt): ScenarioExplanation {
  const observedAssertions = evidenceIds(
    receipt,
    (item) => item.kind === "assertion" && item.epistemicState === "observed",
  );
  const uncertainty = evidenceIds(
    receipt,
    (item) => item.epistemicState === "unknown" || item.epistemicState === "not_measured",
  );
  const trace = evidenceIds(receipt, (item) => item.kind === "trace");
  const executionBoundary = evidenceIds(receipt, (item) => item.kind === "execution-boundary");
  const happenedBasis = trace.length > 0
    ? trace
    : executionBoundary.length > 0
      ? executionBoundary
      : [firstEvidenceId(receipt)];
  const supportsBasis = observedAssertions.length > 0 ? observedAssertions : happenedBasis;
  const uncertaintyBasis = uncertainty.length > 0 ? uncertainty : [firstEvidenceId(receipt)];

  const happenedText = receipt.lifecycle.status === "completed"
    ? "ONE ran the repository-owned interruption fixture through the shared synthetic evaluation action and produced a bounded run receipt."
    : receipt.lifecycle.status === "unavailable"
      ? "ONE did not run the synthetic evaluation because the registered action was unavailable; the receipt records that boundary without claiming a result."
      : "ONE stopped with a normalized action failure and produced a failure receipt without claiming that the scenario was evaluated.";

  const supportsText = receipt.lifecycle.status === "completed"
    ? receipt.evaluation.outcome === "inconclusive"
      ? "The deterministic assertions support interruption capture and stale-playback cancellation, while the context-preservation judgment remains unresolved."
      : receipt.evaluation.outcome === "passed"
        ? "Every deterministic fixture assertion passed under this exact pinned scenario contract."
        : "At least one deterministic fixture assertion failed under this exact pinned scenario contract."
    : "The receipt supports only that the action failed closed before a scenario outcome could be scored.";

  const nextText = receipt.input.reviewGoal === "inspect-evidence"
    ? "Inspect each assertion and its provenance, then keep the unknown human-review judgment separate from the observed fixture events."
    : receipt.input.reviewGoal === "plan-next-check"
      ? "Next, ask a human reviewer to assess context preservation before considering a controlled representative test."
      : "Use the assertion trail to understand the recovery sequence, then review the unresolved context-preservation criterion.";

  return scenarioExplanationSchema.parse({
    schemaVersion: SCENARIO_EXPLANATION_SCHEMA_VERSION,
    rulesetVersion: SCENARIO_EXPLANATION_RULESET_VERSION,
    receiptDigest: receipt.normalizedDigest,
    generatedBy: "deterministic-rule-projection",
    statements: [
      {
        id: "what-happened",
        category: "happened",
        ruleId: `lifecycle-${receipt.lifecycle.status}`,
        text: happenedText,
        basisRefs: happenedBasis,
      },
      {
        id: "what-it-supports",
        category: "supports",
        ruleId: `outcome-${receipt.evaluation.outcome}`,
        text: supportsText,
        basisRefs: supportsBasis,
      },
      {
        id: "what-remains-uncertain",
        category: "uncertainty",
        ruleId: "preserve-epistemic-boundaries",
        text: "This synthetic run does not measure provider behavior, timing, production reliability, or the subjective quality of context preservation.",
        basisRefs: uncertaintyBasis,
      },
      {
        id: "recommended-next-check",
        category: "next",
        ruleId: `review-goal-${receipt.input.reviewGoal}`,
        text: nextText,
        basisRefs: uncertaintyBasis,
      },
    ],
  });
}
