export type HandoffAudienceMode = "executive" | "technical" | "customer-success";
export type HandoffView = "executive-summary" | "technical-handoff" | "poc-plan" | "registers" | "rehearsal" | "share-export";
export type PresentationPerspective = "operator" | "facilitator";

export type HandoffTraceSource = "discovery-answer" | "recommendation-rule" | "operator-override" | "simulation-finding" | "explicit-assumption" | "validation-plan" | "decision";

export type HandoffTrace = {
  id: string;
  source: HandoffTraceSource;
  label: string;
  detail: string;
  sourceId?: string;
};

export type ExecutiveSummaryModel = {
  generatedAt: string;
  audience: HandoffAudienceMode;
  fictionalCustomer: string;
  syntheticLabel: string;
  customerObjective: string;
  currentEnvironment: string[];
  recommendedDirection: string;
  deepgramCapabilities: string[];
  customerManagedComponents: string[];
  integrationBoundaries: string[];
  expectedImpactHypotheses: string[];
  keyRisks: string[];
  decisionRequired: string[];
  confidence: "low" | "developing" | "moderate" | "high";
  confidenceReason: string;
  selectedMitigation?: string;
  validationResult?: string;
  traceability: HandoffTrace[];
  markdown: string;
  plainText: string;
};

export type TechnicalHandoffItem = {
  id: string;
  category: "component" | "connection" | "deployment" | "observability" | "fallback" | "dependency" | "input" | "question";
  item: string;
  value: string;
  status: "proposed" | "accepted" | "overridden" | "unresolved";
  owner: string;
  traces: HandoffTrace[];
};

export type TechnicalHandoffModel = {
  generatedAt: string;
  architectureName: string;
  recommendation: string;
  items: TechnicalHandoffItem[];
  revisionHistory: Array<{ id: string; timestamp: string; change: string; generatedBaseline: string; operatorDecision: string }>;
  unresolvedQuestions: string[];
  requiredCustomerInputs: string[];
  implementationDependencies: string[];
  markdown: string;
};

export type AcceptanceCriterionStatus = "placeholder" | "draft" | "agreed" | "passed" | "failed";

export type PocAcceptanceCriterion = {
  id: string;
  metric: string;
  target: string;
  comparisonBaseline: string;
  measurementMethod: string;
  sampleSize: string;
  owner: string;
  status: AcceptanceCriterionStatus;
  notes: string;
  sourceIds: string[];
};

export type ProofOfConceptPlanModel = {
  generatedAt: string;
  objective: string;
  scope: {
    useCase: string;
    languages: string;
    channel: string;
    integrationPath: string;
    callType: string;
    representativeUsers: string;
    excludedUseCases: string;
  };
  inputsRequired: string[];
  testScenarios: Array<{ id: string; title: string; method: string; reason: string; traces: HandoffTrace[] }>;
  acceptanceCriteria: PocAcceptanceCriterion[];
  prerequisites: string[];
  exitCriteria: string[];
  markdown: string;
};

export type DecisionRegisterStatus = "proposed" | "accepted" | "rejected" | "deferred" | "needs-validation" | "blocked";

export type DecisionRegisterEntry = {
  id: string;
  decision: string;
  status: DecisionRegisterStatus;
  rationale: string;
  alternativesConsidered: string[];
  tradeoff: string;
  evidence: string[];
  decisionOwner: string;
  timestamp: string;
  affectedComponentIds: string[];
  reversibility: "easy" | "moderate" | "difficult";
  reviewTrigger: string;
  synthetic: boolean;
  origin: "generated" | "manual";
};

export type ActionStakeholderGroup = "Customer" | "Deepgram" | "Applied Engineering" | "Customer Success" | "Product" | "Security" | "Infrastructure" | "Data or Evaluation" | "Joint";
export type ActionRegisterStatus = "not-started" | "in-progress" | "blocked" | "complete";

export type ActionRegisterEntry = {
  id: string;
  action: string;
  owner: string;
  stakeholderGroup: ActionStakeholderGroup;
  timing: string;
  dependency: string;
  status: ActionRegisterStatus;
  relatedDecisionId?: string;
  relatedOpenQuestionId?: string;
  completionEvidence: string;
  synthetic: boolean;
  origin: "generated" | "manual";
};

export type OpenQuestionClosureMethod = "customer-answer" | "operator-assumption" | "validation-test" | "technical-investigation" | "executive-decision" | "product-confirmation";

export type OpenQuestionClosure = {
  questionId: string;
  originalQuestion: string;
  method: OpenQuestionClosureMethod;
  resolution: string;
  architectureUpdate: string;
  resolvedAt: string;
  createsDecision: boolean;
  createsAction: boolean;
};

export type SessionNarrativeModel = {
  generatedAt: string;
  paragraphs: string[];
  milestones: Array<{ timestamp: string; title: string; detail: string; source: HandoffTraceSource }>;
};

export type RehearsalLength = "five" | "fifteen" | "thirty";
export type RehearsalScoreDimension = "discovery-quality" | "listening-adaptation" | "business-framing" | "technical-accuracy" | "architecture-clarity" | "assumption-visibility" | "tradeoff-communication" | "diagnostic-discipline" | "validation-quality" | "executive-communication" | "time-management" | "customer-empathy" | "closing-clarity";

export type RehearsalStage = {
  id: string;
  title: string;
  objective: string;
  suggestedLanguage: string;
  keyQuestion: string;
  facilitatorInteraction: string;
  teachingPoint: string;
  overexplainingRisk: string;
  timeGuidance: string;
  recoveryCue: string;
  linkedAction: string;
};

export type RehearsalScore = { dimension: RehearsalScoreDimension; score: 1 | 2 | 3 | 4 | 5; notes: string };
export type RehearsalReflection = { strongestMoment: string; unclearMoment: string; earlierQuestion: string; unnecessaryDetail: string; missingEvidence: string; nextFocus: string };

export type RehearsalState = {
  length: RehearsalLength;
  activeStageIndex: number;
  skippedStageIds: string[];
  completedStageIds: string[];
  scores: RehearsalScore[];
  reflection: RehearsalReflection;
};

export type ArchitectureStudioHandoffState = {
  schemaVersion: 1;
  audience: HandoffAudienceMode;
  activeView: HandoffView;
  presentationMode: boolean;
  perspective: PresentationPerspective;
  includeOperatorNotesInExport: boolean;
  questionClosures: OpenQuestionClosure[];
  manualDecisions: DecisionRegisterEntry[];
  decisionOverrides: Record<string, Partial<DecisionRegisterEntry>>;
  manualActions: ActionRegisterEntry[];
  actionOverrides: Record<string, Partial<ActionRegisterEntry>>;
  acceptanceCriteriaOverrides: PocAcceptanceCriterion[];
  rehearsal: RehearsalState;
};

export type HandoffAction =
  | { type: "set-audience"; audience: HandoffAudienceMode }
  | { type: "set-view"; view: HandoffView }
  | { type: "set-presentation-mode"; enabled: boolean }
  | { type: "set-perspective"; perspective: PresentationPerspective }
  | { type: "set-include-operator-notes"; include: boolean }
  | { type: "close-question"; closure: Omit<OpenQuestionClosure, "resolvedAt"> }
  | { type: "reopen-question"; questionId: string }
  | { type: "add-decision"; decision: Omit<DecisionRegisterEntry, "id" | "timestamp" | "origin"> }
  | { type: "update-decision"; id: string; changes: Partial<DecisionRegisterEntry> }
  | { type: "add-action"; action: Omit<ActionRegisterEntry, "id" | "origin"> }
  | { type: "update-action"; id: string; changes: Partial<ActionRegisterEntry> }
  | { type: "set-acceptance-criterion"; criterion: PocAcceptanceCriterion }
  | { type: "set-rehearsal-length"; length: RehearsalLength }
  | { type: "set-rehearsal-stage"; index: number }
  | { type: "complete-rehearsal-stage"; stageId: string }
  | { type: "skip-rehearsal-stage"; stageId: string }
  | { type: "score-rehearsal"; score: RehearsalScore }
  | { type: "set-rehearsal-reflection"; reflection: RehearsalReflection }
  | { type: "reset-handoff" };

export type DemoHealthCheck = { id: string; label: string; status: "ready" | "warning" | "blocked"; detail: string };
export type DemoHealthModel = { status: "ready" | "warning" | "blocked"; checks: DemoHealthCheck[] };

export type SessionReportModel = {
  generatedAt: string;
  executiveSummary: ExecutiveSummaryModel;
  technicalHandoff: TechnicalHandoffModel;
  pocPlan: ProofOfConceptPlanModel;
  decisions: DecisionRegisterEntry[];
  actions: ActionRegisterEntry[];
  narrative: SessionNarrativeModel;
  assumptionsAndQuestions: string[];
  risks: string[];
  disclaimer: string;
};

export type PortableStudioSessionExport = {
  kind: "deepgram-architecture-studio-session";
  schemaVersion: 1;
  syntheticData: true;
  exportedAt: string;
  operatorNotesIncluded: boolean;
  session: unknown;
};
