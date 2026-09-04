import { expect, test } from "@playwright/test";

import { FAILURE_SCENARIOS, MERIDIAN_DIAGNOSTIC_PRESETS, getFailureScenario } from "@/data/architecture-studio-failures";
import { applyArchitectureRevisions, buildGeneratedCanvasSnapshot, compareArchitectures } from "@/lib/architecture-studio/architecture-workspace";
import { propagateFailure, suggestRootCauses } from "@/lib/architecture-studio/failure-engine";
import { deriveActionRegister, deriveDecisionRegister, deriveExecutiveSummary, deriveProofOfConceptPlan, deriveSessionReport, deriveTechnicalHandoff } from "@/lib/architecture-studio/handoff-derivation";
import { buildPortableSessionExport, decisionActionCsv, decisionActionMarkdown, sessionReportMarkdown, validatePortableSessionExport } from "@/lib/architecture-studio/handoff-exports";
import { recommendPackage } from "@/lib/architecture-studio/package-recommendation-engine";
import { applyPresenterCommand, createStudioSession } from "@/lib/architecture-studio/session-core";
import { createFailureActivation } from "@/lib/architecture-studio/failure-engine";
import type { ArchitectureNodeType, MeridianDiagnosticPreset } from "@/types/architecture-studio-diagnostics";
import type { StudioSession } from "@/types/architecture-studio";

test.describe("Architecture Studio failure library and propagation", () => {
  test("ships every requested deterministic failure with diagnostics, mitigations, and validation", () => {
    expect(FAILURE_SCENARIOS).toHaveLength(45);
    expect(new Set(FAILURE_SCENARIOS.map((failure) => failure.id)).size).toBe(FAILURE_SCENARIOS.length);
    for (const failure of FAILURE_SCENARIOS) {
      expect(failure.affectedNodeTypes.length).toBeGreaterThan(0);
      expect(failure.possibleRootCauses.length).toBeGreaterThan(1);
      expect(failure.diagnosticChecks.length).toBeGreaterThan(1);
      expect(failure.mitigationOptions.length).toBeGreaterThanOrEqual(2);
      expect(failure.mitigationOptions.map((item) => item.horizon)).toEqual(expect.arrayContaining(["immediate-containment", "long-term-correction"]));
      expect(failure.validationTest).toBeTruthy();
    }
  });

  test("delayed response prioritizes downstream timing and leaves STT healthy", () => {
    const { architecture, originId } = meridianArchitecture("agent-orchestration");
    const failure = createFailureActivation({ scenarioId: "delayed-end-of-turn", originKind: "node", originId, severity: "high", customerReportedSymptoms: "Accurate transcript; slow response after caller stops.", now: "2026-07-22T12:00:00.000Z" });
    const propagation = propagateFailure(architecture, failure);
    const suggestions = suggestRootCauses(architecture, failure, propagation);
    const stt = architecture.nodes.find((node) => node.type === "deepgram-streaming-stt" || node.type === "deepgram-flux");
    expect(stt).toBeTruthy();
    expect(propagation.nodeImpacts.find((impact) => impact.nodeId === stt?.id)?.relationship).toBe("unrelated-healthy");
    expect(suggestions.map((item) => item.title).join(" ")).toMatch(/turn|orchestration|LLM|CRM|TTS/i);
    expect(suggestions[0].weakeningEvidence.length).toBeGreaterThan(0);
  });

  test("audio clipping cascades while unrelated operational nodes remain healthy", () => {
    const { architecture, originId } = meridianArchitecture("device-microphone");
    const active = createFailureActivation({ scenarioId: "audio-clipping", originKind: "node", originId, severity: "high", customerReportedSymptoms: "Distorted mobile audio" });
    const propagation = propagateFailure(architecture, active);
    expect(propagation.nodeImpacts.find((impact) => impact.nodeId === originId)?.relationship).toBe("originating-failure");
    expect(propagation.nodeImpacts.some((impact) => impact.relationship === "directly-affected" || impact.relationship === "downstream-symptom")).toBe(true);
    const observability = architecture.nodes.find((node) => node.type === "observability");
    expect(propagation.nodeImpacts.find((impact) => impact.nodeId === observability?.id)?.status).not.toBe("failed");
  });

  test("CRM and TTS incidents do not incorrectly degrade speech recognition", () => {
    const crmCase = meridianArchitecture("crm");
    const crm = createFailureActivation({ scenarioId: "crm-lookup-failure", originKind: "node", originId: crmCase.originId, severity: "high", customerReportedSymptoms: "CRM lookup stalls" });
    const crmPropagation = propagateFailure(crmCase.architecture, crm);
    const speech = crmCase.architecture.nodes.find((node) => ["deepgram-streaming-stt", "deepgram-flux"].includes(node.type));
    expect(crmPropagation.nodeImpacts.find((impact) => impact.nodeId === speech?.id)?.relationship).toBe("unrelated-healthy");

    const ttsCase = meridianArchitecture("deepgram-tts");
    const tts = createFailureActivation({ scenarioId: "tts-playback-interruption", originKind: "node", originId: ttsCase.originId, severity: "high", customerReportedSymptoms: "Playback cuts out" });
    const ttsPropagation = propagateFailure(ttsCase.architecture, tts);
    const ttsSpeech = ttsCase.architecture.nodes.find((node) => ["deepgram-streaming-stt", "deepgram-flux"].includes(node.type));
    expect(ttsPropagation.nodeImpacts.find((impact) => impact.nodeId === ttsSpeech?.id)?.relationship).toBe("unrelated-healthy");
  });

  test("missing correlation IDs lower diagnostic confidence without claiming component failure", () => {
    const { architecture, originId } = meridianArchitecture("observability");
    const active = createFailureActivation({ scenarioId: "missing-correlation-id", originKind: "node", originId, severity: "medium", customerReportedSymptoms: "Logs cannot be joined" });
    const propagation = propagateFailure(architecture, active);
    const suggestions = suggestRootCauses(architecture, active, propagation);
    expect(propagation.missingObservability.length).toBeGreaterThan(0);
    expect(propagation.nodeImpacts.filter((impact) => impact.nodeId !== originId).every((impact) => impact.relationship === "unobservable")).toBe(true);
    expect(suggestions.every((suggestion) => ["low", "developing"].includes(suggestion.confidence))).toBe(true);
  });

  test("architecture revisions restore cleanly and clearing archives the incident", () => {
    let session = createStudioSession("local-demo", { scenarioId: "meridian-contact-cloud" }).session;
    session = applyPresenterCommand(session, { kind: "simulation", action: { type: "add-node", nodeType: "fallback-provider" } });
    expect(session.architectureSimulation.revisions).toHaveLength(1);
    const generated = buildGeneratedCanvasSnapshot(session);
    const current = applyArchitectureRevisions(generated, session.architectureSimulation.revisions);
    expect(compareArchitectures(generated, current).addedNodeIds).toHaveLength(1);
    session = applyPresenterCommand(session, { kind: "simulation", action: { type: "restore-generated" } });
    expect(session.architectureSimulation.revisions).toEqual([]);

    const originId = buildGeneratedCanvasSnapshot(session).nodes.find((node) => node.type === "agent-orchestration")!.id;
    session = applyPresenterCommand(session, { kind: "simulation", action: { type: "inject-failure", scenarioId: "delayed-end-of-turn", originKind: "node", originId, severity: "high", customerReportedSymptoms: "Accurate transcript, delayed response" } });
    session = applyPresenterCommand(session, { kind: "simulation", action: { type: "generate-incident-summary" } });
    session = applyPresenterCommand(session, { kind: "simulation", action: { type: "clear-failure" } });
    expect(session.architectureSimulation.activeFailure).toBeNull();
    expect(session.architectureSimulation.incidentHistory).toHaveLength(1);
    expect(deriveExecutiveSummary(session).selectedMitigation).toBeTruthy();
  });
});

test.describe("Meridian diagnostic preset integrations", () => {
  for (const preset of MERIDIAN_DIAGNOSTIC_PRESETS) {
    test(`${preset.title} produces the intended origin, affected path, hypothesis, mitigation, and validation`, () => {
      const { architecture, originId } = meridianArchitecture(preset.defaultOriginNodeType);
      const scenario = getFailureScenario(preset.defaultFailureId)!;
      const active = createFailureActivation({ scenarioId: scenario.id, originKind: "node", originId, severity: scenario.severity, customerReportedSymptoms: preset.visibleSymptoms.join("; ") });
      const propagation = propagateFailure(architecture, active);
      const suggestions = suggestRootCauses(architecture, active, propagation);
      expect(propagation.originId).toBe(originId);
      expect(propagation.nodeImpacts.some((impact) => impact.relationship === "originating-failure")).toBe(true);
      expect(propagation.nodeImpacts.some((impact) => impact.relationship === "directly-affected" || impact.relationship === "downstream-symptom" || impact.relationship === "unobservable")).toBe(true);
      expect(suggestions.length).toBeGreaterThan(1);
      expect(scenario.mitigationOptions.length).toBeGreaterThan(1);
      expect(scenario.validationTest).toBeTruthy();
    });
  }
});

test.describe("Executive handoff and safe exports", () => {
  test("complete Meridian five-minute flow produces summary, POC, decision, action, and report", () => {
    let session = createStudioSession("local-demo", { scenarioId: "meridian-contact-cloud" }).session;
    session = applyPresenterCommand(session, { kind: "handoff", action: { type: "add-decision", decision: { decision: "Approve a representative-data proof of concept", status: "accepted", rationale: "Resolve concurrency and acceptance-threshold gaps before production design.", alternativesConsidered: ["Proceed directly to production"], tradeoff: "Adds an evaluation phase before rollout.", evidence: ["Meridian discovery gaps"], decisionOwner: "Joint sponsor (synthetic)", affectedComponentIds: [], reversibility: "easy", reviewTrigger: "POC exit review", synthetic: true } } });
    session = applyPresenterCommand(session, { kind: "handoff", action: { type: "add-action", action: { action: "Provide representative English and Spanish mobile audio", owner: "Meridian evaluation lead (synthetic)", stakeholderGroup: "Customer", timing: "Before POC kickoff", dependency: "Approved synthetic-data handling path", status: "not-started", completionEvidence: "Reviewed audio manifest", synthetic: true } } });
    const summary = deriveExecutiveSummary(session);
    const plan = deriveProofOfConceptPlan(session);
    const report = deriveSessionReport(session);
    expect(summary.customerObjective).toContain("Meridian Contact Cloud");
    expect(plan.testScenarios.length).toBeGreaterThan(3);
    expect(deriveDecisionRegister(session).some((item) => item.status === "accepted")).toBe(true);
    expect(deriveActionRegister(session).some((item) => item.action.includes("English and Spanish"))).toBe(true);
    expect(report.executiveSummary.fictionalCustomer).toBe("Meridian Contact Cloud");
    expect(report.decisions.some((item) => item.status === "accepted")).toBe(true);
    expect(report.actions.some((item) => item.action.includes("English and Spanish"))).toBe(true);
    expect(report.disclaimer).toMatch(/synthetic/i);
  });

  test("complete Meridian fifteen-minute flow carries mitigation and validation into the handoff", () => {
    let session = createStudioSession("local-demo", { scenarioId: "meridian-contact-cloud" }).session;
    const architecture = buildGeneratedCanvasSnapshot(session);
    const originId = architecture.nodes.find((node) => node.type === "agent-orchestration")!.id;
    const scenario = getFailureScenario("delayed-end-of-turn")!;
    session = applyPresenterCommand(session, { kind: "simulation", action: { type: "inject-failure", scenarioId: scenario.id, originKind: "node", originId, severity: "high", customerReportedSymptoms: "Transcription is accurate, but the response starts too slowly." } });
    session = applyPresenterCommand(session, { kind: "simulation", action: { type: "set-hypothesis-state", suggestionId: session.architectureSimulation.rootCauseSuggestions[0].id, state: "selected" } });
    session = applyPresenterCommand(session, { kind: "simulation", action: { type: "set-mitigation-decision", mitigationId: scenario.mitigationOptions[0].id, state: "selected" } });
    session = applyPresenterCommand(session, { kind: "simulation", action: { type: "set-validation-outcome", outcome: { result: "mitigated", validationPerformed: scenario.validationTest, evidence: "Synthetic timestamps show the narrowed boundary recovered." } } });
    session = applyPresenterCommand(session, { kind: "simulation", action: { type: "generate-incident-summary" } });
    const summary = deriveExecutiveSummary(session);
    const report = deriveSessionReport(session);
    expect(summary.selectedMitigation).toContain(scenario.mitigationOptions[0].action);
    expect(summary.validationResult).toContain("mitigated");
    expect(report.executiveSummary.selectedMitigation).toContain(scenario.mitigationOptions[0].action);
    expect(report.narrative.paragraphs.join(" ")).toMatch(/delayed|mitigat/i);
  });

  test("derives the Meridian executive summary and POC from session state", () => {
    const session = createStudioSession("local-demo", { scenarioId: "meridian-contact-cloud" }).session;
    const summary = deriveExecutiveSummary(session, "executive");
    const plan = deriveProofOfConceptPlan(session);
    expect(summary.customerObjective).toContain("Meridian Contact Cloud");
    expect(summary.currentEnvironment.join(" ")).toMatch(/Salesforce|salesforce/);
    expect(summary.keyRisks.join(" ")).toMatch(/Concurrency|latency target|accuracy target/i);
    expect(summary.decisionRequired.join(" ")).toMatch(/proof of concept/i);
    expect(plan.scope.languages).toMatch(/English.*Spanish/i);
    expect(plan.inputsRequired.join(" ")).toMatch(/concurrency.*unresolved/i);
    expect(plan.acceptanceCriteria.some((criterion) => criterion.status === "placeholder")).toBe(true);
    expect(plan.acceptanceCriteria.every((criterion) => !/\d+ms|\d+%/.test(criterion.target))).toBe(true);
  });

  test("audience modes change emphasis without contradicting underlying facts", () => {
    const session = createStudioSession("local-demo", { scenarioId: "meridian-contact-cloud" }).session;
    const executive = deriveExecutiveSummary(session, "executive");
    const technical = deriveExecutiveSummary(session, "technical");
    const customerSuccess = deriveExecutiveSummary(session, "customer-success");
    expect(technical.customerObjective).toBe(executive.customerObjective);
    expect(customerSuccess.currentEnvironment).toEqual(executive.currentEnvironment);
    expect(technical.recommendedDirection).not.toBe(executive.recommendedDirection);
    expect(customerSuccess.expectedImpactHypotheses.every((item) => item.includes("adoption or rollout milestone"))).toBe(true);
  });

  test("architecture override is reflected in the traceable technical handoff and decision register", () => {
    let session = createStudioSession("local-demo", { scenarioId: "meridian-contact-cloud" }).session;
    const node = buildGeneratedCanvasSnapshot(session).nodes.find((item) => item.type === "audio-preprocessing")!;
    session = applyPresenterCommand(session, { kind: "simulation", action: { type: "update-node", nodeId: node.id, changes: { vendor: "Customer DSP", decisionState: "overridden", operatorNotes: "Compare raw and processed audio." } } });
    const handoff = deriveTechnicalHandoff(session, false);
    expect(handoff.items.every((item) => item.traces.length > 0)).toBe(true);
    expect(handoff.markdown).not.toContain("Compare raw and processed audio.");
    const decisions = deriveDecisionRegister(session);
    expect(decisions.some((decision) => decision.affectedComponentIds.includes(node.id))).toBe(true);
  });

  test("closing an open question updates confidence evidence and removes its generated action", () => {
    let session = createStudioSession("local-demo", { scenarioId: "meridian-contact-cloud" }).session;
    const before = deriveExecutiveSummary(session);
    expect(deriveActionRegister(session).some((action) => action.relatedOpenQuestionId === "measure-concurrency")).toBe(true);
    const gap = recommendPackage(session).gaps.find((item) => item.id === "measure-concurrency")!;
    session = applyPresenterCommand(session, { kind: "handoff", action: { type: "close-question", closure: { questionId: gap.id, originalQuestion: gap.nextQuestion, method: "customer-answer", resolution: "Test 250 average and 500 peak synthetic sessions.", architectureUpdate: "Use this band for load design.", createsDecision: true, createsAction: false } } });
    const after = deriveExecutiveSummary(session);
    expect(after.confidenceReason).not.toBe(before.confidenceReason);
    expect(deriveActionRegister(session).some((action) => action.relatedOpenQuestionId === "measure-concurrency")).toBe(false);
    expect(deriveDecisionRegister(session).some((decision) => decision.decision.includes("500 peak"))).toBe(true);
  });

  test("hidden operator notes are excluded and session export/reimport preserves decisions", () => {
    let session = createStudioSession("local-demo", { scenarioId: "meridian-contact-cloud", code: "MER234" }).session;
    session = applyPresenterCommand(session, { kind: "add_note", text: "SECRET OPERATOR REHEARSAL NOTE" });
    session = applyPresenterCommand(session, { kind: "handoff", action: { type: "add-decision", decision: { decision: "Run a representative POC", status: "accepted", rationale: "Resolve unknown thresholds", alternativesConsidered: ["Stop"], tradeoff: "Requires customer data preparation", evidence: ["Meridian seed"], decisionOwner: "Joint (synthetic)", affectedComponentIds: [], reversibility: "easy", reviewTrigger: "POC exit review", synthetic: true } } });
    const portable = buildPortableSessionExport(session, false);
    const serialized = JSON.stringify(portable);
    expect(serialized).toContain("syntheticData");
    expect(serialized).not.toContain("SECRET OPERATOR REHEARSAL NOTE");
    const valid = validatePortableSessionExport(portable);
    expect(valid).not.toBeNull();
    const imported = applyPresenterCommand(createStudioSession("local-demo", { scenarioId: "northstar-contact-cloud", code: "ABC234" }).session, { kind: "import_session", payload: portable });
    expect(imported.code).toBe("ABC234");
    expect(deriveDecisionRegister(imported).some((decision) => decision.decision === "Run a representative POC")).toBe(true);
    expect(validatePortableSessionExport({ ...portable, session: { ...(portable.session as object), api_key: "forbidden" } })).toBeNull();
  });

  test("Markdown, CSV, and full session report contain the required handoff", () => {
    const session = createStudioSession("local-demo", { scenarioId: "meridian-contact-cloud" }).session;
    const report = deriveSessionReport(session);
    const markdown = sessionReportMarkdown(report);
    const registersMarkdown = decisionActionMarkdown(session);
    const csv = decisionActionCsv(session);
    expect(markdown).toContain("## 15. Synthetic-data disclaimer");
    expect(markdown).toContain("## 9. Proof-of-concept plan");
    expect(registersMarkdown).toContain("# Decision and Action Register");
    expect(csv.split("\r\n")[0]).toContain("record_type");
    expect(csv).toContain('"decision"');
  });
});

function meridianArchitecture(type: ArchitectureNodeType) {
  const session = createStudioSession("local-demo", { scenarioId: "meridian-contact-cloud", now: new Date("2026-07-22T12:00:00.000Z") }).session;
  const architecture = buildGeneratedCanvasSnapshot(session);
  const origin = architecture.nodes.find((node) => node.type === type);
  expect(origin, `Meridian architecture missing ${type}`).toBeTruthy();
  return { session, architecture, originId: origin!.id };
}

void (null as unknown as MeridianDiagnosticPreset);
void (null as unknown as StudioSession);
