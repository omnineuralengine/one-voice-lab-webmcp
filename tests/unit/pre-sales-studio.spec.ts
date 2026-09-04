import { expect, test } from "@playwright/test";

import { PRE_SALES_CUSTOMER_PATTERNS } from "@/data/pre-sales-customer-patterns";
import { FAST_DISCOVERY_GROUP_IDS, PRE_SALES_DISCOVERY_GROUPS } from "@/data/pre-sales-discovery";
import { PRE_SALES_CHALLENGES } from "@/data/pre-sales-studio-catalog";
import {
  applyChallenge, buildArchitectureBlueprint, buildPocPlan, calculateBusinessCase, computeDiscoveryInsight, createOpportunity,
  deriveReadouts, illustrativeDemo, recommendApiLabPresets, recommendSolution, updateCriterion, updateOpportunityDiscovery,
  updateOpportunityQuickNote, updateOpportunityQuickSelection, validateOpportunitySnapshot,
} from "@/lib/pre-sales-studio/engine";

const NOW = "2026-07-22T12:00:00.000Z";

test.describe("Pre-Sales Solution Studio deterministic domain", () => {
  test("defines complete accessible quick-select discovery with a seven-decision fast path", () => {
    expect(FAST_DISCOVERY_GROUP_IDS).toHaveLength(7);
    expect(PRE_SALES_DISCOVERY_GROUPS.length).toBeGreaterThanOrEqual(20);
    for (const group of PRE_SALES_DISCOVERY_GROUPS) {
      const standard = group.options.filter((option) => !option.kind);
      expect(standard.length, group.id).toBeGreaterThanOrEqual(4);
      expect(standard.length, group.id).toBeLessThanOrEqual(8);
      expect(group.options.some((option) => option.kind === "not-sure"), group.id).toBe(true);
      expect(group.options.some((option) => option.kind === "other"), group.id).toBe(true);
    }
  });

  test("exposes seven traceable public patterns with illustrative seeds", () => {
    expect(PRE_SALES_CUSTOMER_PATTERNS).toHaveLength(7);
    expect(PRE_SALES_CUSTOMER_PATTERNS.map((item) => item.id)).toEqual(["abby-connect", "sigmamind-ai", "five9", "prem-ai", "vida", "creditas", "nasa"]);
    for (const pattern of PRE_SALES_CUSTOMER_PATTERNS) {
      expect(pattern.source.url).toMatch(/^https:\/\/deepgram\.com\/customers\//);
      expect(pattern.source.verifiedAt).toBe("2026-07-22");
      expect(pattern.illustrativeStartingConditions.length).toBeGreaterThan(0);
      expect(pattern.suggestedMetricIds.length).toBeGreaterThan(2);
    }
  });

  test("selects a customer pattern without preselecting a final architecture", () => {
    const opportunity = createOpportunity("sigmamind-ai", NOW, "fixture-opportunity");
    expect(opportunity.name).toBe("SigmaMind AI");
    expect(opportunity.activeStage).toBe("discovery");
    expect(opportunity.discovery.workloadMode).toBe("streaming");
    expect(recommendSolution(opportunity).some((item) => item.fit === "unresolved")).toBe(true);
  });

  test("discovery updates increase confidence and adapt next questions", () => {
    const start = createOpportunity("custom", NOW, "custom-fixture");
    const before = computeDiscoveryInsight(start);
    const withGoal = updateOpportunityDiscovery(start, "desiredBusinessOutcome", "Reduce caller repetition", NOW);
    const withMode = updateOpportunityDiscovery(withGoal, "workloadMode", "streaming", NOW);
    const after = computeDiscoveryInsight(withMode);
    expect(after.confidence).toBeGreaterThan(before.confidence);
    expect(after.nextQuestions.map((item) => item.field)).not.toContain("desiredBusinessOutcome");
    expect(after.known.join(" ")).toContain("Reduce caller repetition");
  });

  test("quick selections recalculate recommendations, architecture, API presets, and POC evidence", () => {
    let opportunity = createOpportunity("custom", NOW, "quick-fixture");
    opportunity = updateOpportunityQuickSelection(opportunity, "workload-mode", "streaming", NOW);
    opportunity = updateOpportunityQuickSelection(opportunity, "interaction-model", "human-to-agent", NOW);
    opportunity = updateOpportunityQuickSelection(opportunity, "latency-sensitivity", "turn-critical", NOW);
    opportunity = updateOpportunityQuickSelection(opportunity, "audio-environment", "noisy-mobile", NOW);
    opportunity = updateOpportunityQuickSelection(opportunity, "integration-channel", "telephony", NOW);
    opportunity = updateOpportunityQuickSelection(opportunity, "deployment", "vpc", NOW);
    opportunity = updateOpportunityQuickSelection(opportunity, "evaluation-criteria", "turn-taking", NOW);
    opportunity = updateOpportunityQuickSelection(opportunity, "poc-success", "latency-threshold", NOW);
    const recommendationIds = recommendSolution(opportunity).map((item) => item.id);
    expect(recommendationIds).toEqual(expect.arrayContaining(["nova-streaming", "flux", "audio-input", "latency-budget", "private"]));
    expect(buildArchitectureBlueprint(opportunity).nodes.map((node) => node.id)).toContain("preprocess");
    expect(recommendApiLabPresets(opportunity).map((item) => item.endpointId)).toEqual(expect.arrayContaining(["stt-flux", "stt-live", "voice-agent-converse"]));
    expect(buildPocPlan(opportunity).criteria.map((item) => item.id)).toEqual(expect.arrayContaining(["turn-detection", "interruption-recovery", "p95-latency"]));
  });

  test("answer changes remove inapplicable paths while keeping evidence inspectable", () => {
    let opportunity = createOpportunity("custom", NOW, "change-fixture");
    opportunity = updateOpportunityQuickSelection(opportunity, "workload-mode", "streaming", NOW);
    opportunity = updateOpportunityQuickSelection(opportunity, "interaction-model", "human-to-agent", NOW);
    expect(recommendSolution(opportunity).map((item) => item.id)).toContain("flux");
    opportunity = updateOpportunityQuickSelection(opportunity, "workload-mode", "streaming", NOW);
    opportunity = updateOpportunityQuickSelection(opportunity, "workload-mode", "prerecorded", NOW);
    const ids = recommendSolution(opportunity).map((item) => item.id);
    expect(ids).toContain("nova-batch");
    expect(ids).not.toContain("flux");
    expect(recommendApiLabPresets(opportunity).map((item) => item.endpointId)).toContain("stt-prerecorded");
  });

  test("not-sure remains an open question and Other notes become visible evidence", () => {
    let opportunity = createOpportunity("custom", NOW, "gap-fixture");
    opportunity = updateOpportunityQuickSelection(opportunity, "interaction-model", "not-sure", NOW);
    expect(computeDiscoveryInsight(opportunity).unanswered.map((item) => item.field)).toContain("interactionModel");
    opportunity = updateOpportunityQuickSelection(opportunity, "interaction-model", "other", NOW);
    opportunity = updateOpportunityQuickNote(opportunity, "interaction-model", "Human agent assisted by an internal copilot", NOW);
    expect(computeDiscoveryInsight(opportunity).known.join(" ")).toContain("internal copilot");
  });

  test("recommendations and architecture change with deployment constraints", () => {
    const start = createOpportunity("sigmamind-ai", NOW, "deployment-fixture");
    expect(recommendSolution(start).map((item) => item.id)).not.toContain("private");
    const privateOpportunity = updateOpportunityDiscovery(start, "deployment", "self-hosted", NOW);
    expect(recommendSolution(privateOpportunity).map((item) => item.id)).toContain("private");
    expect(buildArchitectureBlueprint(privateOpportunity).boundaries.join(" ")).toContain("Secure private deployment boundary");
  });

  test("challenge injection changes gaps, architecture, POC gates, and dataset", () => {
    const start = createOpportunity("vida", NOW, "challenge-fixture");
    const challenged = applyChallenge(start, "private-audio", NOW);
    expect(challenged.activeChallengeIds).toEqual(["private-audio"]);
    expect(challenged.discovery.deployment).toBe("self-hosted");
    expect(recommendSolution(challenged).map((item) => item.id)).toContain("private");
    expect(challenged.criteria.map((item) => item.id)).toEqual(expect.arrayContaining(["p95-latency", "uptime", "concurrency"]));
    expect(challenged.datasetSegments.find((item) => item.id === "telephony-audio")?.selected).toBe(true);
    expect(computeDiscoveryInsight(challenged).nextQuestions[0].question).toContain("VPC isolation");
  });

  test("edits and adopts a POC criterion without inventing a numeric target", () => {
    const start = createOpportunity("five9", NOW, "criterion-fixture");
    const id = start.criteria[0].id;
    expect(start.criteria[0].target).toBe("");
    const updated = updateCriterion(start, id, { target: "Customer-defined held-out threshold", targetSource: "customer-adopted", status: "adopted" }, NOW);
    expect(updated.criteria[0]).toMatchObject({ target: "Customer-defined held-out threshold", targetSource: "customer-adopted", status: "adopted" });
    expect(buildPocPlan(updated).criteria[0].target).toBe("Customer-defined held-out threshold");
  });

  test("calculates the business case from transparent customer inputs", () => {
    const result = calculateBusinessCase({ monthlyCallCount: "10000", averageCallDuration: "4", currentTranscriptionCost: "0.01", proposedTranscriptionCost: "0.008", humanQaPercent: "10", qaReviewMinutes: "4", loadedLaborCost: "30", currentContainment: "40", proposedContainment: "50", transferRate: "50", averageHandlingMinutes: "6", abandonment: "5", currentConversion: "5", proposedConversion: "6", averageTransactionValue: "20", implementationCost: "12000" });
    expect(result.monthlyPlatformCost).toBe(320);
    expect(result.qaHoursRecovered).toBeCloseTo(66.67, 1);
    expect(result.incrementalConversions).toBeCloseTo(100, 5);
    expect(result.formulas).toContain("Monthly minutes = monthly calls × average call duration");
    expect(result.assumptions.join(" ")).toContain("not Deepgram pricing");
  });

  test("reset seed is deterministic and persistence validation excludes secret-shaped data", () => {
    const first = createOpportunity("abby-connect", NOW, "same-id"); const second = createOpportunity("abby-connect", NOW, "same-id");
    expect(second).toEqual(first);
    expect(validateOpportunitySnapshot(first)).toEqual(first);
    expect(validateOpportunitySnapshot({ ...first, api_key: "do-not-store" })).toBeNull();
  });

  test("restores additive quick discovery state and migrates older saved workshops", () => {
    let opportunity = createOpportunity("custom", NOW, "restore-fixture");
    opportunity = updateOpportunityQuickSelection(opportunity, "business-outcome", "task-completion", NOW);
    opportunity = updateOpportunityQuickNote(opportunity, "business-outcome", "Reduce repeat calls", NOW);
    opportunity = { ...opportunity, persistenceEnabled: true, discoveryMode: "deep" };
    expect(validateOpportunitySnapshot(JSON.parse(JSON.stringify(opportunity)))?.discovery.businessOutcomePriorities).toEqual(["task-completion"]);
    const legacy = structuredClone(opportunity) as unknown as { discovery: Record<string, unknown>; discoveryMode?: string };
    delete legacy.discovery.businessOutcomePriorities; delete legacy.discovery.quickNotes; delete legacy.discoveryMode;
    const migrated = validateOpportunitySnapshot(legacy);
    expect(migrated?.discovery.businessOutcomePriorities).toEqual([]);
    expect(migrated?.discovery.quickNotes).toEqual({});
    expect(migrated?.discoveryMode).toBe("fast");
  });

  test("readouts share session facts and safe demo labels every illustrative value", () => {
    const opportunity = createOpportunity("nasa", NOW, "readout-fixture"); const readouts = deriveReadouts(opportunity); const demo = illustrativeDemo(opportunity);
    expect(readouts.executive.businessProblem).toBe(opportunity.discovery.desiredBusinessOutcome);
    expect(readouts.technical.deepgramProducts.length).toBeGreaterThan(0);
    expect(demo.label).toBe("Illustrative Demo Data");
    expect(demo.timestamps.join(" ")).toContain("illustrative");
  });

  test("ships every requested challenge as inspectable data", () => {
    expect(PRE_SALES_CHALLENGES).toHaveLength(12);
    for (const challenge of PRE_SALES_CHALLENGES) {
      expect(challenge.nextQuestion).toBeTruthy();
      expect(challenge.architectureImpact).toBeTruthy();
      expect(challenge.pocImpact).toBeTruthy();
      expect(challenge.businessImpact).toBeTruthy();
    }
  });
});
