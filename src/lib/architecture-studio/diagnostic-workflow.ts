import { getFailureScenario } from "@/data/architecture-studio-failures";
import type {
  ArchitectureCanvasSnapshot,
  ArchitectureSimulationState,
  DiagnosticStageId,
  DiagnosticStep,
  IncidentSummary,
} from "@/types/architecture-studio-diagnostics";
import type { PublicStudioSession, StudioSession } from "@/types/architecture-studio";

type SessionLike = StudioSession | PublicStudioSession;

const DIAGNOSTIC_STAGES: Array<{ id: DiagnosticStageId; title: string }> = [
  { id: "confirm-symptom", title: "Confirm customer-visible symptom" },
  { id: "define-scope", title: "Define scope" },
  { id: "first-boundary", title: "Identify first failing boundary" },
  { id: "transport-audio", title: "Inspect transport and audio inputs" },
  { id: "deepgram-behavior", title: "Inspect Deepgram request and response behavior" },
  { id: "downstream-systems", title: "Inspect orchestration and downstream systems" },
  { id: "test-hypothesis", title: "Test a narrow hypothesis" },
  { id: "apply-mitigation", title: "Apply or recommend mitigation" },
  { id: "validate-recovery", title: "Validate recovery" },
  { id: "capture-follow-up", title: "Capture follow-up action" },
];

export function createDiagnosticSteps(failureId?: string): DiagnosticStep[] {
  const scenario = failureId ? getFailureScenario(failureId) : undefined;
  return DIAGNOSTIC_STAGES.map((stage, index) => ({
    id: `diagnostic-${stage.id}`,
    stageId: stage.id,
    title: stage.title,
    state: index === 0 && scenario ? "in-progress" : "pending",
    notes: "",
    evidence: index === 0 && scenario ? scenario.likelySymptoms.join("; ") : "",
    linkedMetric: metricForStage(stage.id, scenario?.metricsToInspect ?? []),
    hypothesis: "",
    result: "",
    nextStep: scenario?.diagnosticChecks[index % Math.max(1, scenario.diagnosticChecks.length)] ?? "",
  }));
}

export function buildIncidentSummary(
  session: SessionLike,
  architecture: ArchitectureCanvasSnapshot,
  simulation: ArchitectureSimulationState,
): IncidentSummary | null {
  const active = simulation.activeFailure;
  if (!active) return null;
  const scenario = getFailureScenario(active.scenarioId);
  if (!scenario) return null;
  const boundary = active.originKind === "node"
    ? architecture.nodes.find((node) => node.id === active.originId)?.displayName ?? active.originId
    : connectionLabel(architecture, active.originId);
  const confirmed = simulation.rootCauseSuggestions.find((suggestion) => suggestion.state === "confirmed");
  const leading = confirmed ?? simulation.rootCauseSuggestions.find((suggestion) => suggestion.state === "selected") ?? simulation.rootCauseSuggestions[0];
  const selectedMitigations = scenario.mitigationOptions.filter((mitigation) => simulation.mitigationDecisions.some((decision) => decision.mitigationId === mitigation.id && decision.state === "selected"));
  const immediate = selectedMitigations.find((mitigation) => mitigation.horizon === "immediate-containment") ?? scenario.mitigationOptions.find((mitigation) => mitigation.horizon === "immediate-containment");
  const longTerm = selectedMitigations.find((mitigation) => mitigation.horizon === "long-term-correction") ?? scenario.mitigationOptions.find((mitigation) => mitigation.horizon === "long-term-correction");
  const evidence = simulation.diagnosticSteps.flatMap((step) => [step.evidence, step.result].filter(Boolean)).slice(0, 12);
  const unresolved = [
    ...(simulation.propagation?.missingObservability ?? []),
    ...simulation.diagnosticSteps.filter((step) => step.state === "pending" && step.nextStep).map((step) => step.nextStep),
  ].slice(0, 10);
  const owners = selectedMitigations.length
    ? selectedMitigations.map((mitigation) => `${mitigation.implementationOwner}: ${mitigation.action}`)
    : [`Customer voice platform team: ${scenario.diagnosticChecks[0]}`, `Applied Engineer: ${scenario.validationTest}`];
  const summaryWithoutMarkdown = {
    generatedAt: new Date().toISOString(),
    fictionalCustomer: session.scenarioName,
    reportedSymptom: active.customerReportedSymptoms || scenario.likelySymptoms.join("; "),
    affectedWorkflow: "Simulated voice workflow from current discovery architecture",
    simulatedFailure: scenario.title,
    architectureBoundary: boundary,
    evidenceCollected: evidence.length ? evidence : ["Evidence collection is still in progress."],
    leadingHypothesis: leading?.title ?? "No hypothesis selected",
    confirmedRootCause: confirmed?.title,
    immediateMitigation: immediate?.action ?? "No immediate mitigation selected",
    longTermRecommendation: longTerm?.action ?? "No long-term correction selected",
    validationPerformed: simulation.validationOutcome.validationPerformed || scenario.validationTest,
    unresolvedQuestions: unresolved.length ? unresolved : ["Confirm the result against the fictional customer acceptance criteria."],
    ownersAndNextActions: owners,
  };
  return { ...summaryWithoutMarkdown, markdown: incidentMarkdown(summaryWithoutMarkdown) };
}

function metricForStage(stage: DiagnosticStageId, metrics: string[]) {
  if (!metrics.length) return undefined;
  const indexByStage: Record<DiagnosticStageId, number> = {
    "confirm-symptom": 0,
    "define-scope": 0,
    "first-boundary": 1,
    "transport-audio": 1,
    "deepgram-behavior": 2,
    "downstream-systems": 2,
    "test-hypothesis": 0,
    "apply-mitigation": 0,
    "validate-recovery": 1,
    "capture-follow-up": 2,
  };
  return metrics[indexByStage[stage] % metrics.length];
}

function connectionLabel(architecture: ArchitectureCanvasSnapshot, connectionId: string) {
  const connection = architecture.connections.find((item) => item.id === connectionId);
  if (!connection) return connectionId;
  const from = architecture.nodes.find((node) => node.id === connection.fromNodeId)?.displayName ?? connection.fromNodeId;
  const to = architecture.nodes.find((node) => node.id === connection.toNodeId)?.displayName ?? connection.toNodeId;
  return `${from} → ${to}`;
}

function incidentMarkdown(summary: Omit<IncidentSummary, "markdown">) {
  const list = (items: string[]) => items.map((item) => `- ${item}`).join("\n");
  return [
    "# Simulated Voice Incident Summary",
    "Prototype diagnostic exercise only. No production failure was executed and no legal, compliance, or commercial conclusion is made.",
    `## Fictional customer\n\n${summary.fictionalCustomer}`,
    `## Reported symptom\n\n${summary.reportedSymptom}`,
    `## Simulated failure and boundary\n\n${summary.simulatedFailure} at ${summary.architectureBoundary}`,
    `## Evidence collected\n\n${list(summary.evidenceCollected)}`,
    `## Leading hypothesis\n\n${summary.leadingHypothesis}`,
    `## Confirmed root cause\n\n${summary.confirmedRootCause ?? "Not confirmed by the operator"}`,
    `## Immediate mitigation\n\n${summary.immediateMitigation}`,
    `## Long-term recommendation\n\n${summary.longTermRecommendation}`,
    `## Validation\n\n${summary.validationPerformed}`,
    `## Unresolved questions\n\n${list(summary.unresolvedQuestions)}`,
    `## Owners and next actions\n\n${list(summary.ownersAndNextActions)}`,
  ].join("\n\n");
}
