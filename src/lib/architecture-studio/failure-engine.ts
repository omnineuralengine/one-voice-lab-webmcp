import { getFailureScenario } from "@/data/architecture-studio-failures";
import type {
  ActiveFailureSimulation,
  ArchitectureCanvasSnapshot,
  DiagnosticConfidence,
  FailureNodeImpact,
  FailurePropagationResult,
  FailureSeverity,
  RootCauseSuggestion,
} from "@/types/architecture-studio-diagnostics";

export function createFailureActivation(input: {
  scenarioId: string;
  originKind: "node" | "connection";
  originId: string;
  severity: FailureSeverity;
  customerReportedSymptoms: string;
  now?: string;
}): ActiveFailureSimulation {
  if (!getFailureScenario(input.scenarioId)) throw new Error("unknown_failure_scenario");
  return {
    id: safeId("simulation"),
    scenarioId: input.scenarioId,
    originKind: input.originKind,
    originId: input.originId,
    severity: input.severity,
    customerReportedSymptoms: cleanText(input.customerReportedSymptoms, 500),
    state: "active",
    startedAt: input.now ?? new Date().toISOString(),
  };
}

export function propagateFailure(architecture: ArchitectureCanvasSnapshot, activeFailure: ActiveFailureSimulation): FailurePropagationResult {
  const scenario = getFailureScenario(activeFailure.scenarioId);
  if (!scenario) throw new Error("unknown_failure_scenario");
  const enabledNodes = architecture.nodes.filter((node) => node.enabled);
  const originNodeIds = resolveOriginNodes(architecture, activeFailure);
  if (originNodeIds.length === 0) throw new Error("failure_origin_not_found");
  const directed = adjacency(architecture, false);
  const undirected = adjacency(architecture, true);
  const distances = shortestDistances(originNodeIds, undirected);
  const downstream = downstreamNodes(originNodeIds, directed);
  const isObservabilityFailure = ["observability-gap", "missing-correlation-id"].includes(scenario.id);
  const observabilityNodes = enabledNodes.filter((node) => node.type === "observability");
  const observabilityMissing = observabilityNodes.length === 0 || isObservabilityFailure;
  const directIds = new Set(enabledNodes
    .filter((node) => scenario.affectedNodeTypes.includes(node.type) && (distances.get(node.id) ?? Number.POSITIVE_INFINITY) <= 3)
    .map((node) => node.id));
  const originIsDownstreamOfSpeech = originNodeIds.some((id) => {
    const type = architecture.nodes.find((node) => node.id === id)?.type;
    return ["agent-orchestration", "llm", "business-logic", "crm", "deepgram-tts", "audio-playback"].includes(type ?? "");
  });
  if (scenario.id === "delayed-end-of-turn" && originIsDownstreamOfSpeech) {
    enabledNodes.filter((node) => ["deepgram-streaming-stt", "deepgram-batch-stt", "deepgram-flux"].includes(node.type)).forEach((node) => directIds.delete(node.id));
  }
  originNodeIds.forEach((id) => directIds.delete(id));
  const downstreamIds = new Set(enabledNodes
    .filter((node) => downstream.has(node.id) && scenario.cascadeNodeTypes.includes(node.type))
    .map((node) => node.id));
  originNodeIds.forEach((id) => downstreamIds.delete(id));
  directIds.forEach((id) => downstreamIds.delete(id));

  const nodeImpacts: FailureNodeImpact[] = architecture.nodes.map((node) => {
    if (!node.enabled) return { nodeId: node.id, relationship: "unrelated-healthy", status: "disabled", explanation: "This component was already disabled before the simulation." };
    if (originNodeIds.includes(node.id)) return { nodeId: node.id, relationship: "originating-failure", status: activeFailure.severity === "low" ? "degraded" : "failed", explanation: `The simulated ${scenario.title.toLowerCase()} begins at this boundary.` };
    if (isObservabilityFailure) return { nodeId: node.id, relationship: "unobservable", status: "unobservable", explanation: "This component is not assumed failed; its state cannot be correlated confidently during the simulated observability incident." };
    if (directIds.has(node.id)) return { nodeId: node.id, relationship: "directly-affected", status: severityStatus(activeFailure.severity), explanation: `${node.displayName} directly consumes or supplies the affected ${scenario.affectedConnectionFlows.join(" / ")} path.` };
    if (downstreamIds.has(node.id)) return { nodeId: node.id, relationship: "downstream-symptom", status: "degraded", explanation: `${node.displayName} may show a downstream symptom, but is not automatically the root cause.` };
    return { nodeId: node.id, relationship: "unrelated-healthy", status: node.status === "unknown" ? "unknown" : "healthy", explanation: "No deterministic propagation rule marks this component as affected." };
  });

  const affectedIds = new Set(nodeImpacts.filter((impact) => !["unrelated-healthy", "unobservable"].includes(impact.relationship)).map((impact) => impact.nodeId));
  const downstreamConnectionIds = architecture.connections.filter((connection) => connection.enabled && scenario.affectedConnectionFlows.includes(connection.flow) && (affectedIds.has(connection.fromNodeId) || affectedIds.has(connection.toNodeId))).map((connection) => connection.id);
  const fallbackNodeIds = enabledNodes.filter((node) => ["fallback-provider", "human-agent"].includes(node.type)).map((node) => node.id);
  const missingObservability = [
    ...(observabilityMissing ? ["A complete content-safe correlation trace is not available."] : []),
    ...(!architecture.connections.some((connection) => connection.authenticationType) && scenario.category === "network-transport" ? ["Connection authentication lifecycle is not recorded on the current canvas."] : []),
  ];
  return {
    failureId: activeFailure.scenarioId,
    originId: activeFailure.originId,
    nodeImpacts,
    downstreamConnectionIds,
    missingObservability,
    likelyCustomerImpact: [scenario.customerFacingImpact, ...scenario.likelySymptoms.slice(0, 2)],
    fallbackNodeIds,
  };
}

export function suggestRootCauses(
  architecture: ArchitectureCanvasSnapshot,
  activeFailure: ActiveFailureSimulation,
  propagation: FailurePropagationResult,
): RootCauseSuggestion[] {
  const scenario = getFailureScenario(activeFailure.scenarioId);
  if (!scenario) return [];
  const originLabel = originName(architecture, activeFailure);
  const symptom = activeFailure.customerReportedSymptoms || scenario.likelySymptoms.join("; ");
  const missingCorrelation = propagation.missingObservability.length > 0 || activeFailure.scenarioId === "missing-correlation-id";
  return scenario.possibleRootCauses.map((cause, index) => {
    const special = specialEvidence(activeFailure.scenarioId, cause, scenario.likelySymptoms);
    return {
      id: `${activeFailure.id}-cause-${index + 1}`,
      title: cause,
      observedSymptom: symptom,
      supportingEvidence: [
        `The simulated origin is ${originLabel}.`,
        special.supporting,
        `${propagation.nodeImpacts.filter((impact) => impact.relationship === "directly-affected").length} directly affected component(s) are visible.`,
      ],
      weakeningEvidence: [special.weakening, "A clean boundary trace that shows this stage remained healthy would lower this hypothesis."],
      nextDiagnosticCheck: scenario.diagnosticChecks[index % scenario.diagnosticChecks.length],
      confidence: lowerConfidence(scenario.confidence, missingCorrelation || index > 1),
      state: "suggested",
      sourceFailureId: scenario.id,
    };
  });
}

export function applyFailureStatuses(architecture: ArchitectureCanvasSnapshot, propagation: FailurePropagationResult | null) {
  if (!propagation) return architecture;
  const byNode = new Map(propagation.nodeImpacts.map((impact) => [impact.nodeId, impact]));
  return {
    ...architecture,
    nodes: architecture.nodes.map((node) => ({ ...node, status: byNode.get(node.id)?.status ?? node.status })),
  };
}

function resolveOriginNodes(architecture: ArchitectureCanvasSnapshot, activeFailure: ActiveFailureSimulation) {
  if (activeFailure.originKind === "node") return architecture.nodes.some((node) => node.id === activeFailure.originId) ? [activeFailure.originId] : [];
  const connection = architecture.connections.find((item) => item.id === activeFailure.originId);
  return connection ? [connection.fromNodeId, connection.toNodeId] : [];
}

function adjacency(architecture: ArchitectureCanvasSnapshot, undirected: boolean) {
  const result = new Map<string, string[]>();
  architecture.nodes.forEach((node) => result.set(node.id, []));
  architecture.connections.filter((connection) => connection.enabled).forEach((connection) => {
    result.get(connection.fromNodeId)?.push(connection.toNodeId);
    if (undirected || connection.direction === "bidirectional") result.get(connection.toNodeId)?.push(connection.fromNodeId);
  });
  return result;
}

function shortestDistances(starts: string[], graph: Map<string, string[]>) {
  const distances = new Map<string, number>();
  const queue = starts.map((id) => ({ id, distance: 0 }));
  while (queue.length) {
    const current = queue.shift()!;
    if (distances.has(current.id)) continue;
    distances.set(current.id, current.distance);
    (graph.get(current.id) ?? []).forEach((id) => queue.push({ id, distance: current.distance + 1 }));
  }
  return distances;
}

function downstreamNodes(starts: string[], graph: Map<string, string[]>) {
  return new Set(shortestDistances(starts, graph).keys());
}

function severityStatus(severity: FailureSeverity) {
  return severity === "critical" || severity === "high" ? "degraded" as const : "unknown" as const;
}

function originName(architecture: ArchitectureCanvasSnapshot, failure: ActiveFailureSimulation) {
  if (failure.originKind === "node") return architecture.nodes.find((node) => node.id === failure.originId)?.displayName ?? failure.originId;
  const connection = architecture.connections.find((item) => item.id === failure.originId);
  if (!connection) return failure.originId;
  const from = architecture.nodes.find((node) => node.id === connection.fromNodeId)?.displayName;
  const to = architecture.nodes.find((node) => node.id === connection.toNodeId)?.displayName;
  return `${from ?? connection.fromNodeId} → ${to ?? connection.toNodeId}`;
}

function specialEvidence(failureId: string, cause: string, symptoms: string[]) {
  const normalized = cause.toLowerCase();
  if (failureId === "delayed-end-of-turn") {
    if (/turn/.test(normalized)) return { supporting: "The delay begins after caller speech ends, so the turn-event timestamp is the first boundary to inspect.", weakening: "A timely end-of-turn event would shift focus downstream to orchestration, tools, LLM, or TTS." };
    if (/crm/.test(normalized)) return { supporting: "The workflow requires Salesforce context and a serialized lookup can delay an otherwise healthy speech path.", weakening: "A fast CRM result on the same slow calls would weaken this cause." };
    if (/llm/.test(normalized)) return { supporting: "Accurate transcripts with slow response start are consistent with downstream reasoning latency.", weakening: "A timely first LLM token would shift focus to tools, TTS, or playback." };
    if (/tts/.test(normalized)) return { supporting: "Caller-perceived response latency includes synthesis and playback start after text is ready.", weakening: "Timely first audio and playback would eliminate TTS as the dominant stage." };
    return { supporting: "Accurate final transcripts weaken a broad STT-quality explanation and prioritize downstream stage timing.", weakening: "If orchestration begins immediately after the turn event, inspect the next downstream boundary." };
  }
  if (failureId === "delayed-partial-transcripts") return { supporting: "Accurate finals with slow partials point to streaming delivery, buffering, or frame cadence rather than general recognition quality.", weakening: "Steady frame cadence and timely interim events would weaken a buffering hypothesis." };
  if (failureId === "incorrect-domain-terminology" || failureId === "proper-name-failure") return { supporting: "Errors cluster on critical vocabulary, so prompting, dataset coverage, and configuration are separable hypotheses.", weakening: "If the same terms fail in clean, correctly configured held-out audio after prompting, broader model evaluation is needed." };
  if (failureId === "interruption-not-detected" || failureId === "false-interruption") return { supporting: "Interruption depends on caller audio, echo/playback state, turn events, and cancellation propagation—not one component alone.", weakening: "Aligned turn and playback timestamps can rule out stages that reacted on time." };
  if (failureId === "regional-routing-latency" || failureId === "deployment-region-mismatch") return { supporting: "A region-specific symptom prioritizes locality and routing evidence.", weakening: "Equivalent latency across regions would weaken regional routing as the differentiator." };
  if (failureId === "websocket-disconnect" || failureId === "intermittent-mobile-connection") return { supporting: "Intermittent continuity loss is consistent with transport changes and reconnect-state handling.", weakening: "A complete socket trace without disconnects would shift focus to orchestration event handling." };
  if (failureId === "packet-loss" || failureId === "network-jitter") return { supporting: "Transport degradation can delay or remove audio before speech processing.", weakening: "Loss-free, steady frame arrival at the gateway would move the first failing boundary downstream." };
  if (failureId === "missing-correlation-id" || failureId === "observability-gap") return { supporting: "The missing evidence directly prevents reliable stage attribution.", weakening: "A complete joined trace would restore confidence without proving another component failed." };
  return { supporting: `The symptom pattern includes ${symptoms[0]?.toLowerCase() ?? "the documented failure behavior"}.`, weakening: "Evidence from an upstream and downstream checkpoint can rule out this boundary." };
}

function lowerConfidence(confidence: DiagnosticConfidence, lower: boolean): DiagnosticConfidence {
  if (!lower) return confidence;
  const order: DiagnosticConfidence[] = ["low", "developing", "moderate", "high"];
  return order[Math.max(0, order.indexOf(confidence) - 1)];
}

function cleanText(value: string, max: number) {
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max);
}

function safeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}
