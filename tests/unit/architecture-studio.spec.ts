import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { STUDIO_QUESTIONS, STUDIO_STAGES } from "@/data/architecture-studio-discovery";
import { STUDIO_SCENARIO_PRESETS } from "@/data/architecture-studio-scenarios";
import { DEEPGRAM_CAPABILITIES } from "@/data/deepgram-capabilities";
import { buildArchitectureTopology } from "@/lib/architecture-studio/architecture";
import { ARCHITECTURE_STUDIO_FIXTURES } from "@/lib/architecture-studio/fixtures";
import { recommendPackage } from "@/lib/architecture-studio/package-recommendation-engine";
import { recommendFromProfile, recommendArchitecture } from "@/lib/architecture-studio/recommendation-engine";
import { answerStudioQuestion, applyPresenterCommand, createStudioSession, isSessionExpired, joinStudioSession, sanitizeParticipantStudioSession, sanitizeStudioSession } from "@/lib/architecture-studio/session-core";
import { buildSolutionBrief } from "@/lib/architecture-studio/summary";

test.describe("Architecture Studio deterministic recommendation engine", () => {
  for (const fixture of ARCHITECTURE_STUDIO_FIXTURES) {
    test(`${fixture.id} always selects ${fixture.expectedPath}`, () => {
      const first = recommendFromProfile(fixture.profile);
      const second = recommendFromProfile(structuredClone(fixture.profile));
      expect(first.primaryPath).toBe(fixture.expectedPath);
      expect(second).toEqual(first);
      expect(first.assumptions.length).toBeGreaterThan(0);
      expect(first.tradeoffs.length).toBeGreaterThan(0);
      expect(first.alternativesConsidered.length).toBeGreaterThan(0);
      expect(first.changeTriggers.length).toBeGreaterThan(0);
    });
  }

  test("conflicting stakeholder preferences route to an evaluation decision", () => {
    const base = structuredClone(ARCHITECTURE_STUDIO_FIXTURES[1].profile);
    base.values["pipeline-preference"] = "compare";
    base.values["vendor-strategy"] = "undecided";
    base.disagreements = [{ questionId: "pipeline-preference", values: ["composable", "managed"] }];
    const recommendation = recommendFromProfile(base);
    expect(recommendation.primaryPath).toBe("evaluation-first");
    expect(recommendation.influences.some((item) => item.effect.includes("Disagreement"))).toBe(true);
  });
});

test.describe("Architecture Studio discovery and capability data", () => {
  test("covers all six requested stages and the explicit discovery gaps", () => {
    expect(STUDIO_STAGES.map((stage) => stage.id)).toEqual(["objective", "stack", "audio", "conversation", "governance", "success"]);
    const ids = new Set(STUDIO_QUESTIONS.map((question) => question.id));
    for (const required of [
      "provider-details",
      "industry",
      "workflow",
      "current-voice-stack",
      "monthly-minutes",
      "tts-requirements",
      "budget-sensitivity",
      "poc-success-criteria",
      "conversation-timing-targets",
      "tools-and-apis",
      "retention-expectations",
      "encryption-expectations",
      "baseline-values",
      "secondary-metrics",
      "metric-targets",
    ]) expect(ids.has(required), `missing ${required}`).toBe(true);
    for (const question of STUDIO_QUESTIONS.filter((item) => item.options)) {
      expect(question.options?.some((option) => option.value === "other"), `${question.id} needs Other`).toBe(true);
      expect(question.options?.some((option) => option.value === "not-sure"), `${question.id} needs Not sure yet`).toBe(true);
    }
  });

  test("keeps the capability catalog complete, dated, and official-source linked", () => {
    const ids = new Set(DEEPGRAM_CAPABILITIES.map((capability) => capability.id));
    for (const required of [
      "nova-3-streaming",
      "nova-3-batch",
      "flux-stt",
      "voice-agent-api",
      "aura-2",
      "diarization",
      "language-support",
      "formatting",
      "redaction",
      "hosted-deployment",
      "self-hosted-deployment",
      "sdk-browser-telephony",
      "keyterm-prompting",
      "language-detection",
    ]) expect(ids.has(required), `missing ${required}`).toBe(true);
    expect(new Set(DEEPGRAM_CAPABILITIES.map((capability) => capability.id)).size).toBe(DEEPGRAM_CAPABILITIES.length);
    for (const capability of DEEPGRAM_CAPABILITIES) {
      expect(capability.lastVerified).toBe("2026-07-21");
      expect(capability.officialDocumentation).toMatch(/^https:\/\/developers\.deepgram\.com\/docs\//);
      expect(capability.keyTradeoffs.length).toBeGreaterThan(0);
      expect(capability.compatiblePaths.length).toBeGreaterThan(0);
    }
  });

  test("includes Meridian as an intentionally incomplete synthetic scenario", () => {
    const meridian = STUDIO_SCENARIO_PRESETS.find((scenario) => scenario.id === "meridian-contact-cloud");
    expect(meridian?.name).toBe("Meridian Contact Cloud");
    expect(meridian?.visibleFacts).toEqual(["Inbound service", "English + Spanish", "Salesforce integration"]);
  });
});

test.describe("Architecture Studio sessions and outputs", () => {
  test("creates a short-lived seeded session without a preselected final path", () => {
    const now = new Date("2026-07-21T12:00:00.000Z");
    const { session, presenterToken } = createStudioSession("local-demo", { now, code: "ABC234", id: "00000000-0000-4000-8000-000000000001" });
    expect(session.code).toBe("ABC234");
    expect(new Date(session.expiresAt).getTime() - now.getTime()).toBe(4 * 60 * 60 * 1000);
    expect(presenterToken).toHaveLength(48);
    expect(recommendArchitecture(session).primaryPath).toBe("evaluation-first");
    expect(session.revealedQuestionIds).toEqual(["company-name"]);
  });

  test("turns the Meridian discovery seed into inspectable package evidence", () => {
    const { session } = createStudioSession("local-demo", { code: "MER234", scenarioId: "meridian-contact-cloud" });
    const result = recommendPackage(session);
    const componentIds = result.components.map((component) => component.id);
    expect(session.scenarioName).toBe("Meridian Contact Cloud");
    expect(session.answers.some((answer) => answer.questionId === "concurrency")).toBe(false);
    expect(session.answers.some((answer) => answer.questionId === "metric-targets")).toBe(false);
    expect(componentIds).toEqual(expect.arrayContaining(["streaming-transport", "flux-turn-handling", "domain-keyterms", "audio-preprocessing", "agent-orchestration", "deepgram-tts", "hosted-deployment", "observability", "fallback-recovery"]));
    const topology = buildArchitectureTopology(session, recommendArchitecture(session).primaryPath);
    expect(topology.nodes.map((node) => node.id)).toEqual(expect.arrayContaining(["audio-preprocessing", "deepgram-flux", "orchestrator", "deepgram-tts", "observability", "fallback-recovery"]));
    for (const component of result.components) {
      expect(component.customerRequirement).toBeTruthy();
      expect(component.architecturalDecision).toBeTruthy();
      expect(component.capabilityOrApproach).toBeTruthy();
      expect(component.whyItFits).toBeTruthy();
      expect(component.tradeoffOrLimitation).toBeTruthy();
      expect(component.validationMethod).toBeTruthy();
      expect(component.confidence).toMatch(/low|developing|moderate|high/);
      expect(component.sourceQuestionIds.length).toBeGreaterThan(0);
    }
    expect(result.gaps.map((gap) => gap.id)).toEqual(expect.arrayContaining(["missing-concurrency", "measure-concurrency", "define-latency-target", "define-accuracy-target"]));
    expect(result.validationPlan.map((item) => item.id)).toEqual(expect.arrayContaining(["representative-audio", "latency", "interruption", "noisy-audio", "business-task", "resilience", "scale", "governance"]));
  });

  test("missing package requirements lower confidence and create actionable questions", () => {
    const { session } = createStudioSession("local-demo", { scenarioId: "meridian-contact-cloud" });
    const incomplete = recommendPackage(session);
    let completed = applyPresenterCommand(session, { kind: "override_answer", questionId: "concurrency", value: "100-500" });
    completed = applyPresenterCommand(completed, { kind: "override_answer", questionId: "monthly-minutes", value: "1m-5m" });
    completed = applyPresenterCommand(completed, { kind: "override_answer", questionId: "conversation-timing-targets", value: "Measure caller-stop to playback-stop and end-of-turn to first response audio at agreed percentiles." });
    completed = applyPresenterCommand(completed, { kind: "override_answer", questionId: "metric-targets", value: "Customer will define held-out critical-entity and latency thresholds before execution." });
    completed = applyPresenterCommand(completed, { kind: "override_answer", questionId: "data-control", value: ["residency", "no-audio-retention"] });
    completed = applyPresenterCommand(completed, { kind: "override_answer", questionId: "primary-metrics", value: ["task-completion", "end-to-end-latency", "accuracy"] });
    completed = applyPresenterCommand(completed, { kind: "override_answer", questionId: "poc-success-criteria", value: "Advance only when the agreed task, critical-entity, interruption, and recovery gates pass." });
    const clarified = recommendPackage(completed);
    const confidenceRank = { low: 0, developing: 1, moderate: 2, high: 3 } as const;
    expect(confidenceRank[clarified.confidence]).toBeGreaterThan(confidenceRank[incomplete.confidence]);
    expect(clarified.gaps.some((gap) => gap.id === "measure-concurrency")).toBe(false);
    expect(clarified.gaps.some((gap) => gap.id === "measure-volume")).toBe(false);
    expect(incomplete.gaps.find((gap) => gap.id === "measure-concurrency")?.nextQuestion).toContain("peak concurrent sessions");
  });

  test("keeps prerecorded language detection out of streaming recommendations", () => {
    const { session } = createStudioSession("local-demo", { scenarioId: "meridian-contact-cloud" });
    const streamingIds = recommendPackage(session).components.map((component) => component.id);
    expect(streamingIds).not.toContain("batch-language-detection");
    const batch = applyPresenterCommand(
      applyPresenterCommand(session, { kind: "override_answer", questionId: "processing-mode", value: "prerecorded" }),
      { kind: "override_answer", questionId: "languages", value: ["english", "spanish", "multilingual-growth"] },
    );
    expect(recommendPackage(batch).components.map((component) => component.id)).toContain("batch-language-detection");
  });

  test("persists operator architecture decisions and restores generated output", () => {
    const { session } = createStudioSession("local-demo", { scenarioId: "meridian-contact-cloud" });
    const path = recommendArchitecture(session).primaryPath;
    const removed = applyPresenterCommand(session, { kind: "update_architecture_module", moduleId: "audio-preprocessing", presence: "excluded", decisionStatus: "rejected", note: "Test raw audio first." });
    expect(buildArchitectureTopology(removed, path).nodes.some((node) => node.id === "audio-preprocessing")).toBe(false);
    const included = applyPresenterCommand(removed, { kind: "update_architecture_module", moduleId: "storage", presence: "included", decisionStatus: "accepted", note: "Keep governed evaluation artifacts." });
    const storage = buildArchitectureTopology(included, path).nodes.find((node) => node.id === "storage");
    expect(storage).toMatchObject({ origin: "operator", decisionStatus: "accepted", operatorNote: "Keep governed evaluation artifacts." });
    const restored = applyPresenterCommand(included, { kind: "restore_architecture_module", moduleId: "storage" });
    expect(buildArchitectureTopology(restored, path).nodes.some((node) => node.id === "storage")).toBe(false);
    const reset = applyPresenterCommand(included, { kind: "reset" });
    expect(reset.scenarioName).toBe("Meridian Contact Cloud");
    expect(reset.architectureOverrides).toEqual([]);
  });

  test("supports participant joining and removes token hashes from public state", () => {
    const { session } = createStudioSession("local-demo", { code: "ABC234" });
    const joined = joinStudioSession(session, { displayName: "Voice Engineer", role: "voice-platform-engineer", participantToken: "fixture-token", tokenHash: "private-hash" });
    expect(joined.session.participants).toHaveLength(1);
    expect(joined.participantToken).toBe("fixture-token");
    expect(sanitizeStudioSession(joined.session).participants[0]).not.toHaveProperty("tokenHash");
  });

  test("keeps presenter-only facilitation data out of participant snapshots", () => {
    const { session } = createStudioSession("supabase", { code: "ABC234" });
    const withNote = applyPresenterCommand(
      applyPresenterCommand(session, { kind: "add_note", text: "Private presenter note" }),
      { kind: "add_assumption", text: "Private assumption" },
    );
    const participantSnapshot = sanitizeParticipantStudioSession(withNote);
    expect(participantSnapshot.presenterNotes).toEqual([]);
    expect(participantSnapshot.assumptions).toEqual([]);
    expect(participantSnapshot.parkingLot).toEqual([]);
    expect(participantSnapshot.decisions).toEqual([]);
    expect(participantSnapshot.savedBrief).toBeNull();
    expect(sanitizeStudioSession(withNote).presenterNotes).toEqual(["Private presenter note"]);
  });

  test("changes the recommendation when decisive answers change", () => {
    const { session } = createStudioSession("local-demo", { code: "ABC234" });
    const managedPreference = applyPresenterCommand(
      applyPresenterCommand(session, { kind: "override_answer", questionId: "vendor-strategy", value: "consolidate" }),
      { kind: "override_answer", questionId: "pipeline-preference", value: "managed" },
    );
    expect(recommendArchitecture(managedPreference).primaryPath).toBe("managed-voice-agent");
    const composablePreference = applyPresenterCommand(
      applyPresenterCommand(managedPreference, { kind: "override_answer", questionId: "vendor-strategy", value: "retain" }),
      { kind: "override_answer", questionId: "pipeline-preference", value: "composable" },
    );
    expect(recommendArchitecture(composablePreference).primaryPath).toBe("composable-voice");
    expect(composablePreference.recommendationHistory.at(-1)?.path).toBe("composable-voice");
  });

  test("expires sessions deterministically", () => {
    const { session } = createStudioSession("local-demo", { now: new Date("2026-07-21T12:00:00.000Z") });
    expect(isSessionExpired(session, new Date("2026-07-21T15:59:59.999Z"))).toBe(false);
    expect(isSessionExpired(session, new Date("2026-07-21T16:00:00.000Z"))).toBe(true);
  });

  test("generates a stable solution brief and path-specific topology", () => {
    const { session } = createStudioSession("local-demo", { code: "ABC234" });
    session.presenterOverrides = { ...ARCHITECTURE_STUDIO_FIXTURES[3].profile.values };
    const brief = buildSolutionBrief(session);
    const topology = buildArchitectureTopology(session, "private-deployment");
    expect(brief.customerObjective).toContain("Northstar Contact Cloud");
    expect(brief.markdown).toContain("## Evaluation plan");
    expect(brief.markdown).toContain("## Production path");
    expect(brief.markdown).toContain("## Technical topology — components");
    expect(brief.technicalTopology.nodes).toEqual(topology.nodes);
    expect(brief.nextSteps).toHaveLength(4);
    expect(topology.nodes.some((node) => node.owner === "deepgram")).toBe(true);
    expect(topology.boundaries.some((boundary) => boundary.id === "private")).toBe(true);
  });

  test("selects retained ticketing and customer-data nodes in the technical topology", () => {
    const { session } = createStudioSession("local-demo", { code: "ABC234" });
    session.presenterOverrides = {
      ...ARCHITECTURE_STUDIO_FIXTURES[1].profile.values,
      "business-systems": ["salesforce", "zendesk", "customer-database"],
    };
    const topology = buildArchitectureTopology(session, "composable-voice");
    expect(topology.nodes.map((node) => node.id)).toEqual(expect.arrayContaining(["crm", "ticketing", "customer-data", "observability"]));
    expect(topology.edges.map((edge) => edge.type)).toEqual(expect.arrayContaining(["audio", "transcript", "control", "business-data"]));
  });

  test("pauses and reopens a section deterministically", () => {
    const { session } = createStudioSession("local-demo", { code: "ABC234" });
    const paused = applyPresenterCommand(session, { kind: "toggle_stage_pause", stageId: "objective" });
    expect(paused.pausedStageIds).toContain("objective");
    expect(answerStudioQuestion(paused, "participant", "company-name", "Changed while paused").answers).toEqual(paused.answers);
    const reopened = applyPresenterCommand(paused, { kind: "toggle_stage_pause", stageId: "objective" });
    expect(reopened.pausedStageIds).not.toContain("objective");
  });

  test("keeps service credentials out of client-side Studio code", () => {
    const clientFiles = [
      "src/hooks/use-architecture-studio-session.ts",
      "src/components/architecture-studio/ParticipantWorkspace.tsx",
      "src/components/architecture-studio/PresenterWorkspace.tsx",
      "src/components/architecture-studio/StudioLanding.tsx",
    ];
    for (const file of clientFiles) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(source).not.toContain("DEEPGRAM_API_KEY");
    }
    const presenterRoute = readFileSync(resolve(process.cwd(), "src/app/api/architecture-studio/sessions/[code]/presenter/route.ts"), "utf8");
    expect(presenterRoute).toContain("studioTokenMatches");
    expect(presenterRoute).not.toContain("tokenHash:");
  });
});
