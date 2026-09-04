import { getFailureScenario, getMeridianDiagnosticPreset } from "@/data/architecture-studio-failures";
import { applyArchitectureRevisions, createTemplateNode } from "@/lib/architecture-studio/architecture-workspace";
import { buildIncidentSummary, createDiagnosticSteps } from "@/lib/architecture-studio/diagnostic-workflow";
import { createFailureActivation, propagateFailure, suggestRootCauses } from "@/lib/architecture-studio/failure-engine";
import type {
  ArchitectureCanvasSnapshot,
  ArchitectureRevision,
  ArchitectureSimulationState,
  CanvasArchitectureConnection,
  CanvasArchitectureNode,
  DiagnosticStep,
  PortableDiagnosticSession,
  SimulationAction,
} from "@/types/architecture-studio-diagnostics";
import type { PublicStudioSession, StudioSession } from "@/types/architecture-studio";

type SessionLike = StudioSession | PublicStudioSession;

export function createInitialSimulationState(): ArchitectureSimulationState {
  return {
    schemaVersion: 1,
    selectedView: "customer-journey",
    zoom: 0.82,
    revisions: [],
    activeFailure: null,
    propagation: null,
    diagnosticSteps: createDiagnosticSteps(),
    rootCauseSuggestions: [],
    mitigationDecisions: [],
    validationOutcome: { result: "not-run", validationPerformed: "", evidence: "" },
    incidentSummary: null,
    incidentHistory: [],
    guidedDemo: { enabled: false, phase: "architecture", revealedEvidence: [] },
    operatorAidsVisible: false,
  };
}

export function applySimulationAction(input: {
  session: SessionLike;
  state: ArchitectureSimulationState | undefined;
  action: SimulationAction;
  generatedArchitecture: ArchitectureCanvasSnapshot;
  currentArchitecture: ArchitectureCanvasSnapshot;
  now?: string;
}): ArchitectureSimulationState {
  const state = input.state ? { ...createInitialSimulationState(), ...input.state, incidentHistory: input.state.incidentHistory ?? [] } : createInitialSimulationState();
  const now = input.now ?? new Date().toISOString();
  const action = input.action;
  if (action.type === "import-portable-state") {
    const portable = validatePortableDiagnosticSession(action.payload);
    if (!portable) throw new Error("invalid_diagnostic_import");
    return portable.simulation;
  }
  if (action.type === "set-view") return { ...state, selectedView: action.view };
  if (action.type === "set-zoom") return { ...state, zoom: clamp(action.zoom, 0.45, 1.35) };
  if (action.type === "select-node") return { ...state, selectedNodeId: cleanId(action.nodeId), selectedConnectionId: undefined };
  if (action.type === "select-connection") return { ...state, selectedConnectionId: cleanId(action.connectionId), selectedNodeId: undefined };
  if (action.type === "set-operator-aids") return { ...state, operatorAidsVisible: action.visible };

  if (action.type === "add-node") {
    const position = { x: clamp(action.position?.x ?? 900, 20, 2350), y: clamp(action.position?.y ?? 560, 20, 900) };
    const node = createTemplateNode(action.nodeType, uniqueId(`manual-${action.nodeType}`), position);
    const revision = nodeRevision("node-added", node.id, now, `Added ${node.displayName}.`, undefined, node);
    return refreshAfterRevision(state, revision, input.generatedArchitecture);
  }
  if (action.type === "update-node") {
    const node = input.currentArchitecture.nodes.find((item) => item.id === action.nodeId);
    if (!node) return state;
    const changes = sanitizeNodeChanges(action.changes);
    const revision = nodeRevision("node-updated", node.id, now, `Updated ${node.displayName}.`, node, changes);
    return refreshAfterRevision(state, revision, input.generatedArchitecture);
  }
  if (action.type === "move-node") {
    const node = input.currentArchitecture.nodes.find((item) => item.id === action.nodeId);
    if (!node) return state;
    const position = { x: clamp(action.position.x, 20, 2350), y: clamp(action.position.y, 20, 900) };
    const revision = nodeRevision("node-moved", node.id, now, `Moved ${node.displayName}.`, { position: node.position }, { position });
    return refreshAfterRevision(state, revision, input.generatedArchitecture);
  }
  if (action.type === "disable-node") {
    const node = input.currentArchitecture.nodes.find((item) => item.id === action.nodeId);
    if (!node) return state;
    const revision = nodeRevision("node-disabled", node.id, now, `Disabled ${node.displayName} without deleting it.`, { enabled: node.enabled, status: node.status }, { enabled: false, status: "disabled", decisionState: "overridden" });
    return refreshAfterRevision(state, revision, input.generatedArchitecture);
  }
  if (action.type === "remove-node") {
    const node = input.currentArchitecture.nodes.find((item) => item.id === action.nodeId);
    if (!node) return state;
    const revision = nodeRevision("node-removed", node.id, now, `${node.origin === "engine-generated" ? "Overrode and removed generated" : "Removed manually added"} ${node.displayName}.`, node, undefined);
    return refreshAfterRevision({ ...state, selectedNodeId: undefined }, revision, input.generatedArchitecture);
  }
  if (action.type === "duplicate-node") {
    const source = input.currentArchitecture.nodes.find((item) => item.id === action.nodeId);
    if (!source) return state;
    const duplicate: CanvasArchitectureNode = {
      ...source,
      id: uniqueId(`${source.id}-copy`),
      displayName: `${source.displayName} copy`,
      origin: "manually-added",
      decisionState: "undecided",
      position: { x: clamp(source.position.x + 40, 20, 2350), y: clamp(source.position.y + 70, 20, 900) },
      properties: { ...source.properties },
      customerRequirements: [...source.customerRequirements],
      risks: [...source.risks],
      recommendationEvidenceIds: [...source.recommendationEvidenceIds],
      originalRecommendation: undefined,
    };
    const revision = nodeRevision("node-duplicated", duplicate.id, now, `Duplicated ${source.displayName} as a manual alternative.`, source, duplicate);
    return refreshAfterRevision(state, revision, input.generatedArchitecture);
  }
  if (action.type === "add-connection") {
    if (action.fromNodeId === action.toNodeId) return state;
    if (!input.currentArchitecture.nodes.some((node) => node.id === action.fromNodeId) || !input.currentArchitecture.nodes.some((node) => node.id === action.toNodeId)) return state;
    if (input.currentArchitecture.connections.some((connection) => connection.fromNodeId === action.fromNodeId && connection.toNodeId === action.toNodeId && connection.flow === action.flow)) return state;
    const connection: CanvasArchitectureConnection = {
      id: uniqueId("manual-connection"),
      fromNodeId: action.fromNodeId,
      toNodeId: action.toNodeId,
      flow: action.flow,
      protocol: cleanText(action.protocol ?? "To define", 80),
      direction: "one-way",
      mode: action.flow === "business-data" ? undefined : "streaming",
      origin: "manually-added",
      enabled: true,
      operatorNotes: "",
    };
    const revision = connectionRevision("connection-added", connection.id, now, "Added an operator-defined connection.", undefined, connection);
    return refreshAfterRevision(state, revision, input.generatedArchitecture);
  }
  if (action.type === "update-connection") {
    const connection = input.currentArchitecture.connections.find((item) => item.id === action.connectionId);
    if (!connection) return state;
    const changes = sanitizeConnectionChanges(action.changes);
    const revision = connectionRevision("connection-updated", connection.id, now, `Updated ${connection.protocol ?? connection.flow} connection.`, connection, changes);
    return refreshAfterRevision(state, revision, input.generatedArchitecture);
  }
  if (action.type === "remove-connection") {
    const connection = input.currentArchitecture.connections.find((item) => item.id === action.connectionId);
    if (!connection) return state;
    const revision = connectionRevision("connection-removed", connection.id, now, "Removed a connection while preserving its generated comparison record.", connection, undefined);
    return refreshAfterRevision({ ...state, selectedConnectionId: undefined }, revision, input.generatedArchitecture);
  }
  if (action.type === "restore-generated") {
    return refreshFailureState({ ...state, revisions: [], selectedNodeId: undefined, selectedConnectionId: undefined, incidentSummary: null }, input.generatedArchitecture);
  }

  if (action.type === "inject-failure") {
    const scenario = getFailureScenario(action.scenarioId);
    if (!scenario) throw new Error("unknown_failure_scenario");
    const activeFailure = createFailureActivation({ ...action, now });
    const propagation = propagateFailure(input.currentArchitecture, activeFailure);
    return {
      ...state,
      selectedView: "failure-view",
      activeFailure,
      propagation,
      diagnosticSteps: createDiagnosticSteps(scenario.id),
      rootCauseSuggestions: suggestRootCauses(input.currentArchitecture, activeFailure, propagation),
      mitigationDecisions: scenario.mitigationOptions.map((mitigation) => ({ mitigationId: mitigation.id, state: "considering", operatorNote: "" })),
      validationOutcome: { result: "not-run", validationPerformed: scenario.validationTest, evidence: "" },
      incidentSummary: null,
      guidedDemo: state.guidedDemo.enabled ? { ...state.guidedDemo, phase: "choose-boundary" } : state.guidedDemo,
    };
  }
  if (action.type === "pause-failure") {
    return state.activeFailure ? { ...state, activeFailure: { ...state.activeFailure, state: state.activeFailure.state === "paused" ? "active" : "paused" } } : state;
  }
  if (action.type === "clear-failure") {
    const summary = state.incidentSummary ?? (state.activeFailure ? buildIncidentSummary(input.session, input.currentArchitecture, state) : null);
    return { ...state, activeFailure: null, propagation: null, diagnosticSteps: createDiagnosticSteps(), rootCauseSuggestions: [], mitigationDecisions: [], validationOutcome: { result: "not-run", validationPerformed: "", evidence: "" }, incidentSummary: summary, incidentHistory: summary ? [...state.incidentHistory.filter((item) => item.generatedAt !== summary.generatedAt), summary].slice(-12) : state.incidentHistory, selectedView: "technical-flow", guidedDemo: state.guidedDemo.enabled ? { ...state.guidedDemo, phase: "inject" } : state.guidedDemo };
  }

  if (action.type === "update-diagnostic-step") {
    return { ...state, diagnosticSteps: state.diagnosticSteps.map((step) => step.id === action.stepId ? sanitizeDiagnosticStep({ ...step, ...action.changes }) : step), incidentSummary: null };
  }
  if (action.type === "move-diagnostic-step") {
    const index = state.diagnosticSteps.findIndex((step) => step.id === action.stepId);
    const nextIndex = action.direction === "up" ? index - 1 : index + 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= state.diagnosticSteps.length) return state;
    const steps = [...state.diagnosticSteps];
    [steps[index], steps[nextIndex]] = [steps[nextIndex], steps[index]];
    return { ...state, diagnosticSteps: steps };
  }
  if (action.type === "add-diagnostic-step") {
    const title = cleanText(action.title, 120);
    if (!title) return state;
    const step: DiagnosticStep = { id: uniqueId("diagnostic-custom"), stageId: "custom", title, state: "pending", notes: "", evidence: "", hypothesis: "", result: "", nextStep: "" };
    return { ...state, diagnosticSteps: [...state.diagnosticSteps, step].slice(-30) };
  }
  if (action.type === "set-hypothesis-state") {
    return { ...state, rootCauseSuggestions: state.rootCauseSuggestions.map((suggestion) => suggestion.id === action.suggestionId ? { ...suggestion, state: action.state } : action.state === "confirmed" && suggestion.state === "confirmed" ? { ...suggestion, state: "suggested" } : suggestion), incidentSummary: null, guidedDemo: state.guidedDemo.enabled && ["selected", "confirmed"].includes(action.state) ? { ...state.guidedDemo, phase: "mitigation" } : state.guidedDemo };
  }
  if (action.type === "set-mitigation-decision") {
    const next = { ...state, mitigationDecisions: state.mitigationDecisions.map((decision) => decision.mitigationId === action.mitigationId ? { ...decision, state: action.state, operatorNote: cleanText(action.operatorNote ?? decision.operatorNote, 320) } : decision), incidentSummary: null, guidedDemo: state.guidedDemo.enabled && action.state === "selected" ? { ...state.guidedDemo, phase: "validation" as const } : state.guidedDemo };
    if (action.state !== "selected" || !state.activeFailure || state.activeFailure.originKind !== "node") return next;
    const origin = input.currentArchitecture.nodes.find((node) => node.id === state.activeFailure?.originId);
    const mitigation = getFailureScenario(state.activeFailure.scenarioId)?.mitigationOptions.find((item) => item.id === action.mitigationId);
    if (!origin || !mitigation) return next;
    const note = `${origin.operatorNotes ? `${origin.operatorNotes}\n` : ""}Mitigation selected: ${mitigation.action}`.slice(0, 600);
    const revision = nodeRevision("node-updated", origin.id, now, `Annotated ${origin.displayName} with the selected mitigation.`, { operatorNotes: origin.operatorNotes }, { operatorNotes: note, decisionState: "overridden" });
    return refreshAfterRevision(next, revision, input.generatedArchitecture);
  }
  if (action.type === "set-validation-outcome") {
    const outcome = { ...action.outcome, validationPerformed: cleanText(action.outcome.validationPerformed, 500), evidence: cleanText(action.outcome.evidence, 800), completedAt: action.outcome.result === "not-run" ? undefined : now };
    return { ...state, validationOutcome: outcome, incidentSummary: null, guidedDemo: state.guidedDemo.enabled && outcome.result !== "not-run" ? { ...state.guidedDemo, phase: "summary" } : state.guidedDemo };
  }
  if (action.type === "generate-incident-summary") {
    const incidentSummary = buildIncidentSummary(input.session, input.currentArchitecture, state);
    if (!incidentSummary) return state;
    return { ...state, incidentSummary, incidentHistory: [...state.incidentHistory.filter((item) => item.generatedAt !== incidentSummary.generatedAt), incidentSummary].slice(-12), guidedDemo: state.guidedDemo.enabled ? { ...state.guidedDemo, phase: "summary" } : state.guidedDemo };
  }

  if (action.type === "set-guided-demo") {
    const preset = getMeridianDiagnosticPreset(action.presetId);
    return {
      ...createInitialSimulationState(),
      incidentHistory: state.incidentHistory,
      guidedDemo: { enabled: action.enabled, phase: "architecture", presetId: preset?.id, revealedEvidence: preset?.initiallyRevealedEvidence.slice(0, 1) ?? [] },
      operatorAidsVisible: state.operatorAidsVisible,
    };
  }
  if (action.type === "advance-guided-demo") return { ...state, guidedDemo: { ...state.guidedDemo, phase: action.phase } };
  if (action.type === "reveal-guided-evidence") return { ...state, guidedDemo: { ...state.guidedDemo, phase: "evidence", revealedEvidence: [...new Set([...state.guidedDemo.revealedEvidence, cleanText(action.evidence, 300)])].slice(-12) } };
  if (action.type === "select-guided-boundary") return { ...state, selectedNodeId: action.nodeId, guidedDemo: { ...state.guidedDemo, selectedBoundaryId: action.nodeId, phase: "evidence" } };
  if (action.type === "reset-simulation") return createInitialSimulationState();
  return state;
}

export function exportPortableDiagnosticSession(session: SessionLike): PortableDiagnosticSession {
  return {
    kind: "deepgram-architecture-studio-diagnostics",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    scenarioId: session.scenarioId,
    scenarioName: session.scenarioName,
    simulation: session.architectureSimulation ?? createInitialSimulationState(),
  };
}

export function validatePortableDiagnosticSession(value: unknown): PortableDiagnosticSession | null {
  if (!isRecord(value) || value.kind !== "deepgram-architecture-studio-diagnostics" || value.schemaVersion !== 1) return null;
  if (!isShortString(value.scenarioId, 80) || !isShortString(value.scenarioName, 100) || !isShortString(value.exportedAt, 80)) return null;
  const simulation = value.simulation;
  if (!isRecord(simulation) || simulation.schemaVersion !== 1) return null;
  if (!["customer-journey", "technical-flow", "failure-view"].includes(String(simulation.selectedView))) return null;
  if (typeof simulation.zoom !== "number" || !Number.isFinite(simulation.zoom)) return null;
  if (!Array.isArray(simulation.revisions) || simulation.revisions.length > 240 || !simulation.revisions.every(validRevision)) return null;
  if (!Array.isArray(simulation.diagnosticSteps) || simulation.diagnosticSteps.length > 30 || !simulation.diagnosticSteps.every(validDiagnosticStep)) return null;
  if (!Array.isArray(simulation.rootCauseSuggestions) || simulation.rootCauseSuggestions.length > 30) return null;
  if (!Array.isArray(simulation.mitigationDecisions) || simulation.mitigationDecisions.length > 30) return null;
  if (!isPlainJson(simulation, 0)) return null;
  const cloned = structuredClone(simulation) as ArchitectureSimulationState;
  cloned.incidentHistory = Array.isArray(cloned.incidentHistory) ? cloned.incidentHistory.slice(-12) : [];
  cloned.zoom = clamp(cloned.zoom, 0.45, 1.35);
  cloned.revisions = cloned.revisions.slice(0, 240);
  cloned.diagnosticSteps = cloned.diagnosticSteps.map(sanitizeDiagnosticStep).slice(0, 30);
  cloned.incidentSummary = null;
  return { kind: value.kind, schemaVersion: 1, exportedAt: value.exportedAt, scenarioId: value.scenarioId, scenarioName: value.scenarioName, simulation: cloned };
}

function refreshAfterRevision(state: ArchitectureSimulationState, revision: ArchitectureRevision, generated: ArchitectureCanvasSnapshot): ArchitectureSimulationState {
  const next = { ...state, revisions: [...state.revisions, revision].slice(-240), incidentSummary: null };
  return refreshFailureState(next, generated);
}

export function refreshSimulationState(state: ArchitectureSimulationState, generated: ArchitectureCanvasSnapshot): ArchitectureSimulationState {
  return refreshFailureState(state, generated);
}

function refreshFailureState(state: ArchitectureSimulationState, generated: ArchitectureCanvasSnapshot): ArchitectureSimulationState {
  if (!state.activeFailure) return state;
  const current = applyArchitectureRevisions(generated, state.revisions);
  const originExists = state.activeFailure.originKind === "node" ? current.nodes.some((node) => node.id === state.activeFailure?.originId) : current.connections.some((connection) => connection.id === state.activeFailure?.originId);
  if (!originExists) return { ...state, activeFailure: null, propagation: null, rootCauseSuggestions: [], diagnosticSteps: createDiagnosticSteps(), mitigationDecisions: [], validationOutcome: { result: "not-run", validationPerformed: "", evidence: "" } };
  const propagation = propagateFailure(current, state.activeFailure);
  const priorStates = new Map(state.rootCauseSuggestions.map((suggestion) => [suggestion.title, suggestion.state]));
  const suggestions = suggestRootCauses(current, state.activeFailure, propagation).map((suggestion) => ({ ...suggestion, state: priorStates.get(suggestion.title) ?? suggestion.state }));
  return { ...state, propagation, rootCauseSuggestions: suggestions };
}

function nodeRevision(kind: ArchitectureRevision["kind"], targetId: string, createdAt: string, summary: string, before?: Partial<CanvasArchitectureNode>, after?: Partial<CanvasArchitectureNode>): ArchitectureRevision {
  return { id: uniqueId("revision"), kind, targetId, createdAt, summary, before, after };
}

function connectionRevision(kind: ArchitectureRevision["kind"], targetId: string, createdAt: string, summary: string, before?: Partial<CanvasArchitectureConnection>, after?: Partial<CanvasArchitectureConnection>): ArchitectureRevision {
  return { id: uniqueId("revision"), kind, targetId, createdAt, summary, before, after };
}

function sanitizeNodeChanges(changes: Partial<CanvasArchitectureNode>): Partial<CanvasArchitectureNode> {
  const next: Partial<CanvasArchitectureNode> = {};
  if (changes.displayName !== undefined) next.displayName = cleanText(changes.displayName, 100);
  if (changes.vendor !== undefined) next.vendor = cleanText(changes.vendor, 100);
  if (changes.owner && ["customer-managed", "deepgram-managed", "third-party"].includes(changes.owner)) next.owner = changes.owner;
  if (changes.status && ["healthy", "degraded", "failed", "disabled", "unknown", "unobservable"].includes(changes.status)) next.status = changes.status;
  if (changes.decisionState && ["accepted", "rejected", "undecided", "overridden"].includes(changes.decisionState)) next.decisionState = changes.decisionState;
  if (typeof changes.enabled === "boolean") next.enabled = changes.enabled;
  if (changes.operatorNotes !== undefined) next.operatorNotes = cleanText(changes.operatorNotes, 600);
  if (changes.properties && isRecord(changes.properties)) next.properties = Object.fromEntries(Object.entries(changes.properties).slice(0, 24).map(([key, value]) => [cleanText(key, 50), cleanText(String(value), 120)]));
  return next;
}

function sanitizeConnectionChanges(changes: Partial<CanvasArchitectureConnection>): Partial<CanvasArchitectureConnection> {
  const next: Partial<CanvasArchitectureConnection> = {};
  for (const key of ["protocol", "audioEncoding", "sampleRate", "transport", "authenticationType", "estimatedLatency", "retryBehavior", "timeout", "encryption", "region", "ownershipBoundary", "operatorNotes"] as const) {
    if (changes[key] !== undefined) next[key] = cleanText(String(changes[key]), key === "operatorNotes" ? 600 : 120);
  }
  if (changes.direction && ["one-way", "bidirectional"].includes(changes.direction)) next.direction = changes.direction;
  if (changes.mode && ["streaming", "batch"].includes(changes.mode)) next.mode = changes.mode;
  if (typeof changes.enabled === "boolean") next.enabled = changes.enabled;
  return next;
}

function sanitizeDiagnosticStep(step: DiagnosticStep): DiagnosticStep {
  return {
    ...step,
    title: cleanText(step.title, 140),
    notes: cleanText(step.notes, 600),
    evidence: cleanText(step.evidence, 800),
    linkedNodeId: cleanId(step.linkedNodeId),
    linkedMetric: step.linkedMetric ? cleanText(step.linkedMetric, 120) : undefined,
    hypothesis: cleanText(step.hypothesis, 500),
    result: cleanText(step.result, 600),
    nextStep: cleanText(step.nextStep, 500),
  };
}

function validRevision(value: unknown) {
  if (!isRecord(value) || !isShortString(value.id, 120) || !isShortString(value.targetId, 120) || !isShortString(value.summary, 500) || !isShortString(value.createdAt, 80)) return false;
  return ["node-added", "node-updated", "node-moved", "node-disabled", "node-removed", "node-duplicated", "connection-added", "connection-updated", "connection-removed"].includes(String(value.kind));
}

function validDiagnosticStep(value: unknown) {
  return isRecord(value) && isShortString(value.id, 120) && isShortString(value.title, 160) && ["pending", "in-progress", "completed", "skipped"].includes(String(value.state));
}

function isPlainJson(value: unknown, depth: number): boolean {
  if (depth > 8) return false;
  if (value === null || typeof value === "boolean" || typeof value === "number") return true;
  if (typeof value === "string") return value.length <= 2_000;
  if (Array.isArray(value)) return value.length <= 300 && value.every((item) => isPlainJson(item, depth + 1));
  if (!isRecord(value) || Object.keys(value).length > 120 || Object.keys(value).some((key) => ["__proto__", "constructor", "prototype"].includes(key))) return false;
  return Object.values(value).every((item) => isPlainJson(item, depth + 1));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isShortString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function cleanText(value: string, max: number) {
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max);
}

function cleanId(value: string | undefined) {
  if (!value) return undefined;
  return value.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 120) || undefined;
}

function uniqueId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
