export type ArchitectureNodeType =
  | "audio-source"
  | "device-microphone"
  | "pstn"
  | "sip"
  | "webrtc"
  | "telephony-carrier"
  | "ccaas-platform"
  | "media-gateway"
  | "audio-preprocessing"
  | "noise-suppression"
  | "voice-activity-detection"
  | "deepgram-streaming-stt"
  | "deepgram-batch-stt"
  | "deepgram-flux"
  | "agent-orchestration"
  | "llm"
  | "business-logic"
  | "crm"
  | "knowledge-system"
  | "deepgram-tts"
  | "audio-playback"
  | "observability"
  | "evaluation"
  | "storage"
  | "human-agent"
  | "fallback-provider"
  | "custom-integration";

export type CanvasNodeStatus = "healthy" | "degraded" | "failed" | "disabled" | "unknown" | "unobservable";
export type CanvasNodeOrigin = "engine-generated" | "manually-added";
export type CanvasDecisionState = "accepted" | "rejected" | "undecided" | "overridden";
export type CanvasNodeOwner = "customer-managed" | "deepgram-managed" | "third-party";

export type CanvasPosition = { x: number; y: number };

export type CanvasArchitectureNode = {
  id: string;
  type: ArchitectureNodeType;
  displayName: string;
  vendor: string;
  status: CanvasNodeStatus;
  origin: CanvasNodeOrigin;
  decisionState: CanvasDecisionState;
  owner: CanvasNodeOwner;
  enabled: boolean;
  position: CanvasPosition;
  properties: Record<string, string>;
  operatorNotes: string;
  customerRequirements: string[];
  risks: string[];
  recommendationEvidenceIds: string[];
  originalRecommendation?: {
    displayName: string;
    vendor: string;
    owner: CanvasNodeOwner;
    rationale: string;
  };
};

export type CanvasConnectionDirection = "one-way" | "bidirectional";
export type CanvasConnectionMode = "streaming" | "batch";
export type CanvasConnectionFlow = "audio" | "transcript" | "control" | "business-data";

export type CanvasArchitectureConnection = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  flow: CanvasConnectionFlow;
  protocol?: string;
  direction?: CanvasConnectionDirection;
  mode?: CanvasConnectionMode;
  audioEncoding?: string;
  sampleRate?: string;
  transport?: string;
  authenticationType?: string;
  estimatedLatency?: string;
  retryBehavior?: string;
  timeout?: string;
  encryption?: string;
  region?: string;
  ownershipBoundary?: string;
  origin: CanvasNodeOrigin;
  enabled: boolean;
  operatorNotes: string;
};

export type ArchitectureRevisionKind =
  | "node-added"
  | "node-updated"
  | "node-moved"
  | "node-disabled"
  | "node-removed"
  | "node-duplicated"
  | "connection-added"
  | "connection-updated"
  | "connection-removed";

export type ArchitectureRevision = {
  id: string;
  kind: ArchitectureRevisionKind;
  targetId: string;
  createdAt: string;
  summary: string;
  before?: Partial<CanvasArchitectureNode> | Partial<CanvasArchitectureConnection>;
  after?: Partial<CanvasArchitectureNode> | Partial<CanvasArchitectureConnection>;
};

export type ArchitectureCanvasView = "customer-journey" | "technical-flow" | "failure-view";

export type ArchitectureCanvasSnapshot = {
  generatedAt: string;
  nodes: CanvasArchitectureNode[];
  connections: CanvasArchitectureConnection[];
};

export type ArchitectureComparison = {
  addedNodeIds: string[];
  removedNodeIds: string[];
  changedNodeIds: string[];
  addedConnectionIds: string[];
  removedConnectionIds: string[];
  changedConnectionIds: string[];
};

export type FailureCategory = "audio-input" | "network-transport" | "speech-recognition" | "conversational-agent" | "platform-operations";
export type FailureSeverity = "low" | "medium" | "high" | "critical";
export type DiagnosticConfidence = "low" | "developing" | "moderate" | "high";

export type MitigationComplexity = "Small" | "Medium" | "Large";
export type MitigationHorizon = "immediate-containment" | "long-term-correction";

export type FailureMitigation = {
  id: string;
  action: string;
  expectedBenefit: string;
  tradeoff: string;
  implementationOwner: string;
  complexity: MitigationComplexity;
  horizon: MitigationHorizon;
  validationStep: string;
  architectureChangesRequired: string[];
};

export type FailureScenario = {
  id: string;
  title: string;
  category: FailureCategory;
  description: string;
  likelySymptoms: string[];
  affectedNodeTypes: ArchitectureNodeType[];
  affectedConnectionFlows: CanvasConnectionFlow[];
  possibleRootCauses: string[];
  diagnosticChecks: string[];
  mitigationOptions: FailureMitigation[];
  fallbackBehavior: string;
  customerFacingImpact: string;
  metricsToInspect: string[];
  validationTest: string;
  severity: FailureSeverity;
  confidence: DiagnosticConfidence;
  canCascade: boolean;
  cascadeNodeTypes: ArchitectureNodeType[];
};

export type ActiveFailureSimulation = {
  id: string;
  scenarioId: string;
  originKind: "node" | "connection";
  originId: string;
  severity: FailureSeverity;
  customerReportedSymptoms: string;
  state: "active" | "paused";
  startedAt: string;
};

export type FailureImpactRelationship = "originating-failure" | "directly-affected" | "downstream-symptom" | "unrelated-healthy" | "unobservable";

export type FailureNodeImpact = {
  nodeId: string;
  relationship: FailureImpactRelationship;
  status: CanvasNodeStatus;
  explanation: string;
};

export type FailurePropagationResult = {
  failureId: string;
  originId: string;
  nodeImpacts: FailureNodeImpact[];
  downstreamConnectionIds: string[];
  missingObservability: string[];
  likelyCustomerImpact: string[];
  fallbackNodeIds: string[];
};

export type RootCauseSuggestion = {
  id: string;
  title: string;
  observedSymptom: string;
  supportingEvidence: string[];
  weakeningEvidence: string[];
  nextDiagnosticCheck: string;
  confidence: DiagnosticConfidence;
  state: "suggested" | "selected" | "confirmed" | "rejected";
  sourceFailureId: string;
};

export type DiagnosticStageId =
  | "confirm-symptom"
  | "define-scope"
  | "first-boundary"
  | "transport-audio"
  | "deepgram-behavior"
  | "downstream-systems"
  | "test-hypothesis"
  | "apply-mitigation"
  | "validate-recovery"
  | "capture-follow-up";

export type DiagnosticStep = {
  id: string;
  stageId: DiagnosticStageId | "custom";
  title: string;
  state: "pending" | "in-progress" | "completed" | "skipped";
  notes: string;
  evidence: string;
  linkedNodeId?: string;
  linkedMetric?: string;
  hypothesis: string;
  result: string;
  nextStep: string;
};

export type MitigationDecision = {
  mitigationId: string;
  state: "considering" | "selected" | "rejected";
  operatorNote: string;
};

export type ValidationResult = "not-run" | "resolved" | "mitigated" | "unresolved" | "unable-to-reproduce" | "requires-customer-action" | "requires-deepgram-investigation";

export type ValidationOutcome = {
  result: ValidationResult;
  validationPerformed: string;
  evidence: string;
  completedAt?: string;
};

export type IncidentSummary = {
  generatedAt: string;
  fictionalCustomer: string;
  reportedSymptom: string;
  affectedWorkflow: string;
  simulatedFailure: string;
  architectureBoundary: string;
  evidenceCollected: string[];
  leadingHypothesis: string;
  confirmedRootCause?: string;
  immediateMitigation: string;
  longTermRecommendation: string;
  validationPerformed: string;
  unresolvedQuestions: string[];
  ownersAndNextActions: string[];
  markdown: string;
};

export type MeridianDiagnosticPresetId = "meridian-noisy-mobile" | "meridian-delayed-agent" | "meridian-intermittent-session";

export type MeridianDiagnosticPreset = {
  id: MeridianDiagnosticPresetId;
  title: string;
  shortDescription: string;
  defaultFailureId: string;
  defaultOriginNodeType: ArchitectureNodeType;
  visibleSymptoms: string[];
  contributingFactors: string[];
  initiallyRevealedEvidence: string[];
  hiddenScenarioDetails: string[];
  expectedDiagnosticInsight: string;
  recoveryCue: string;
};

export type GuidedDiagnosticState = {
  enabled: boolean;
  phase: "architecture" | "inject" | "choose-boundary" | "evidence" | "hypothesis" | "mitigation" | "validation" | "summary";
  presetId?: MeridianDiagnosticPresetId;
  revealedEvidence: string[];
  selectedBoundaryId?: string;
};

export type ArchitectureSimulationState = {
  schemaVersion: 1;
  selectedView: ArchitectureCanvasView;
  zoom: number;
  selectedNodeId?: string;
  selectedConnectionId?: string;
  revisions: ArchitectureRevision[];
  activeFailure: ActiveFailureSimulation | null;
  propagation: FailurePropagationResult | null;
  diagnosticSteps: DiagnosticStep[];
  rootCauseSuggestions: RootCauseSuggestion[];
  mitigationDecisions: MitigationDecision[];
  validationOutcome: ValidationOutcome;
  incidentSummary: IncidentSummary | null;
  incidentHistory: IncidentSummary[];
  guidedDemo: GuidedDiagnosticState;
  operatorAidsVisible: boolean;
};

export type PortableDiagnosticSession = {
  kind: "deepgram-architecture-studio-diagnostics";
  schemaVersion: 1;
  exportedAt: string;
  scenarioId: string;
  scenarioName: string;
  simulation: ArchitectureSimulationState;
};

export type SimulationAction =
  | { type: "set-view"; view: ArchitectureCanvasView }
  | { type: "set-zoom"; zoom: number }
  | { type: "select-node"; nodeId?: string }
  | { type: "select-connection"; connectionId?: string }
  | { type: "add-node"; nodeType: ArchitectureNodeType; position?: CanvasPosition }
  | { type: "update-node"; nodeId: string; changes: Partial<Pick<CanvasArchitectureNode, "displayName" | "vendor" | "owner" | "status" | "enabled" | "decisionState" | "properties" | "operatorNotes">> }
  | { type: "move-node"; nodeId: string; position: CanvasPosition }
  | { type: "disable-node"; nodeId: string }
  | { type: "remove-node"; nodeId: string }
  | { type: "duplicate-node"; nodeId: string }
  | { type: "add-connection"; fromNodeId: string; toNodeId: string; flow: CanvasConnectionFlow; protocol?: string }
  | { type: "update-connection"; connectionId: string; changes: Partial<Omit<CanvasArchitectureConnection, "id" | "fromNodeId" | "toNodeId" | "origin">> }
  | { type: "remove-connection"; connectionId: string }
  | { type: "restore-generated" }
  | { type: "inject-failure"; scenarioId: string; originKind: "node" | "connection"; originId: string; severity: FailureSeverity; customerReportedSymptoms: string }
  | { type: "pause-failure" }
  | { type: "clear-failure" }
  | { type: "update-diagnostic-step"; stepId: string; changes: Partial<Omit<DiagnosticStep, "id" | "stageId">> }
  | { type: "move-diagnostic-step"; stepId: string; direction: "up" | "down" }
  | { type: "add-diagnostic-step"; title: string }
  | { type: "set-hypothesis-state"; suggestionId: string; state: RootCauseSuggestion["state"] }
  | { type: "set-mitigation-decision"; mitigationId: string; state: MitigationDecision["state"]; operatorNote?: string }
  | { type: "set-validation-outcome"; outcome: ValidationOutcome }
  | { type: "generate-incident-summary" }
  | { type: "set-guided-demo"; enabled: boolean; presetId?: MeridianDiagnosticPresetId }
  | { type: "advance-guided-demo"; phase: GuidedDiagnosticState["phase"] }
  | { type: "reveal-guided-evidence"; evidence: string }
  | { type: "select-guided-boundary"; nodeId: string }
  | { type: "set-operator-aids"; visible: boolean }
  | { type: "reset-simulation" }
  | { type: "import-portable-state"; payload: unknown };
