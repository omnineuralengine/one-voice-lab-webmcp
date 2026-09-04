export type AppliedProvenance =
  | "working"
  | "measured"
  | "derived"
  | "simulated"
  | "example"
  | "concept"
  | "unavailable";

export type ProvenanceLabel = AppliedProvenance;

export type AppliedVoiceSectionId =
  | "client-discovery"
  | "pipeline-anatomy"
  | "ecosystem-atlas"
  | "model-lab"
  | "turn-taking"
  | "tool-calling"
  | "conversation-trace"
  | "evaluation"
  | "failure"
  | "deployment"
  | "solution-brief";

export type Ownership = "deepgram" | "customer" | "shared" | "third-party";
export type VerificationStatus = "verified" | "needs-verification" | "concept-only";
export type ImplementationStatus = "executable" | "simulated" | "concept-only" | "unavailable";

export type DocsMetadata = {
  id: string;
  capability: string;
  docsUrl: string;
  lastVerifiedAt: string | null;
  verificationStatus: VerificationStatus;
  executable: boolean;
  implementationStatus: ImplementationStatus;
  notes: string;
};

export type ExplainableRecommendation = {
  id: string;
  recommendation: string;
  why: string;
  assumption: string;
  alternative: string;
  validation: string;
  provenance: AppliedProvenance;
  docsMetadataId?: string;
};

export type AudioSource =
  | "browser-microphone"
  | "mobile-application"
  | "uploaded-recordings"
  | "contact-center-recording"
  | "pstn-phone-call"
  | "sip-rtp-media"
  | "webrtc"
  | "live-media-stream"
  | "unknown";

export type ConversationProfile =
  | "monologue"
  | "two-person-call"
  | "multi-speaker-meeting"
  | "interactive-voice-agent"
  | "high-interruption"
  | "noisy"
  | "domain-vocabulary"
  | "multilingual-code-switching";

export type WorkflowRequirement =
  | "transcript"
  | "speaker-labels"
  | "summary"
  | "intent"
  | "sentiment"
  | "topics"
  | "searchable-words-timestamps"
  | "agent-response"
  | "function-tool-call"
  | "human-escalation"
  | "audit-record"
  | "voice-output"
  | "outbound-transactional-message";

export type ClientDiscoveryInput = {
  scenarioId?: string;
  industry: string;
  userJourney: string;
  primaryBusinessProblem: string;
  currentWorkflow: string;
  desiredOutcome: string;
  humanUsers: string[];
  audience: "customer-facing" | "internal" | "both";
  direction: "inbound" | "outbound" | "both";
  audioSources: AudioSource[];
  conversationProfiles: ConversationProfile[];
  processing: "batch" | "realtime" | "both" | "unknown";
  expectedConcurrency: string;
  typicalAudioDuration: string;
  audioFormat: string;
  languagesAndAccents: string[];
  requiredResponseLatency: string;
  dataRetention: string;
  regionDataResidency: string;
  selfHostedRequired: boolean | null;
  cloudEnvironment: string;
  applicationStack: string;
  telephonyProvider: string;
  downstreamSystems: string[];
  workflowRequirements: WorkflowRequirement[];
  transcriptionFailureBehavior: string;
  functionFailureBehavior: string;
  uncertaintyBehavior: string;
  humanHandoffRequired: boolean;
  mustNeverHappen: string[];
  notes?: string;
};

export type ClientScenario = {
  id: string;
  name: string;
  summary: string;
  input: ClientDiscoveryInput;
  learningFocus: string[];
  provenance: "example";
};

export type ClientContextPack = {
  id: string;
  createdAt: string;
  scenarioId?: string;
  problemStatement: string;
  recommendations: ExplainableRecommendation[];
  recommendedProducts: string[];
  recommendedModelFamily: string[];
  proposedTransport: string[];
  proposedRequestPath: string[];
  requiredIntegrations: string[];
  securityModel: string[];
  risks: string[];
  unansweredQuestions: string[];
  suggestedProofOfConcept: string[];
  successMetrics: string[];
  productionReadinessGaps: string[];
  sourceInput: ClientDiscoveryInput;
  provenance: "derived";
};

export type PipelineLayerId =
  | "audio-source"
  | "transport"
  | "audio-preprocessing"
  | "speech-recognition"
  | "turn-detection"
  | "orchestration"
  | "tools-business-systems"
  | "text-to-speech"
  | "audio-return"
  | "analytics-observability";

export type PipelineLayer = {
  id: PipelineLayerId;
  name: string;
  purpose: string;
  ownership: Ownership[];
  deepgramBoundary: string;
  customerBoundary: string;
  inputs: string[];
  outputs: string[];
  protocols: string[];
  failureModes: string[];
  configurationChoices: string[];
  payloadExample: unknown;
  relevantDeepgramModule: string;
  relevantCodeFiles: string[];
  provenance: AppliedProvenance;
};

export type EcosystemCategory =
  | "audio-ingress"
  | "telephony-contact-center"
  | "voice-intelligence"
  | "orchestration"
  | "reasoning-context"
  | "tools"
  | "outputs"
  | "observability";

export type EcosystemNode = {
  id: string;
  category: EcosystemCategory;
  name: string;
  role: string;
  interfaceProtocol: string[];
  dataIn: string[];
  dataOut: string[];
  ownership: Ownership;
  deepgramDependency: string;
  customerDependency: string;
  integrationRisk: string;
  sampleArchitecture: string[];
  provenance: AppliedProvenance;
  docsMetadataId?: string;
};

export type AppliedMlLens = {
  hypothesis: string;
  expectedBenefit: string;
  likelyDownside: string;
  dataNeeded: string;
  metric: string;
  minimumTestSet: string;
  failureSegment: string;
  rolloutStrategy: string;
  rollbackCondition: string;
};

export type TranscriptTokenDiff = {
  kind: "equal" | "missing" | "extra" | "substitution";
  reference?: string;
  hypothesis?: string;
};

export type WerResult = {
  wer: number;
  percentage: number;
  substitutions: number;
  deletions: number;
  insertions: number;
  referenceWordCount: number;
};

export type TranscriptComparison = WerResult & {
  normalizedReference: string;
  normalizedHypothesis: string;
  differences: TranscriptTokenDiff[];
};

export type ExperimentRun = {
  id: string;
  createdAt: string;
  hypothesis: string;
  audioMetadata: Record<string, string | number | boolean | null>;
  model: string;
  language: string;
  parameters: Record<string, string | number | boolean>;
  requestPayload: unknown;
  responsePayload: unknown;
  transcript: string;
  referenceTranscript?: string;
  comparison?: TranscriptComparison;
  timestamps: Array<{ word: string; start: number; end: number }>;
  durationMs: number | null;
  requestId: string | null;
  errors: string[];
  userNotes: string;
  conclusion: string;
  decision: string;
  provenance: AppliedProvenance;
};

export type TurnEventType =
  | "SessionStart"
  | "TokenGrant"
  | "AudioConfigured"
  | "TransportConnected"
  | "SocketOpen"
  | "AudioChunksAggregated"
  | "StartOfTurn"
  | "InterimTranscript"
  | "FinalTranscript"
  | "EagerEndOfTurn"
  | "TurnResumed"
  | "EndOfTurn"
  | "LlmRequest"
  | "FirstLlmToken"
  | "ToolCall"
  | "ToolResult"
  | "TtsRequest"
  | "FirstAudioByte"
  | "PlaybackStart"
  | "UserInterruption"
  | "Cancellation"
  | "Retry"
  | "ListeningResumed"
  | "Error"
  | "HumanHandoff"
  | "SocketClose"
  | "SessionComplete";

export type TraceComponent =
  | "client"
  | "transport"
  | "deepgram-stt"
  | "turn-detection"
  | "orchestrator"
  | "tool"
  | "llm"
  | "deepgram-tts"
  | "playback"
  | "human";

export type ConversationTraceEvent = {
  id: string;
  sessionId: string;
  turnId?: string;
  toolCallId?: string;
  stepId: string;
  requestId?: string;
  offsetMs: number;
  type: TurnEventType;
  component: TraceComponent;
  label: string;
  detail: string;
  payload?: unknown;
  durationMs?: number;
  businessEvent?: boolean;
  error?: boolean;
  provenance: AppliedProvenance;
};

export type LatencyBudgetItem = {
  id: string;
  label: string;
  valueMs: number | null;
  provenance: "measured" | "derived" | "simulated" | "unavailable";
  note: string;
};

export type ConversationTrace = {
  id: string;
  sessionId: string;
  createdAt: string;
  title: string;
  provenance: AppliedProvenance;
  events: ConversationTraceEvent[];
  latencyBudget: LatencyBudgetItem[];
  rawAudioIncluded: false;
};

export type JsonSchema = {
  type: "object";
  properties: Record<string, { type: "string" | "number" | "boolean"; description: string; enum?: string[] }>;
  required: string[];
  additionalProperties: false;
};

export type MockToolBehavior = {
  success: unknown;
  failure: unknown;
  timeoutMs: number;
  retryNote: string;
  idempotencyNote: string;
};

export type MockToolDefinition = {
  id: string;
  name: string;
  description: string;
  schema: JsonSchema;
  exampleRequest: Record<string, unknown>;
  exampleResponse: unknown;
  behavior: MockToolBehavior;
  securityRisk: string;
  sensitive: boolean;
  requireConfirmationDefault: boolean;
  provenance: "simulated";
};

export type AgentPreset = {
  id: string;
  name: string;
  purpose: string;
  scopedPrompt: string;
  availableToolIds: string[];
  allowedData: string[];
  handoffCriteria: string[];
  contextReceived: string[];
  contextEmitted: string[];
  fallbackAgentId?: string;
  provenance: "simulated";
};

export type FailureScenario = {
  id: string;
  name: string;
  layer: PipelineLayerId | "tool" | "llm" | "deployment";
  injection: string;
  userSymptom: string;
  evidence: string[];
  relevantPayload: unknown;
  fallback: string;
  retryPolicy: string;
  retrySafe: boolean | "conditional";
  customerExplanation: string;
  monitoringSignal: string;
  prevention: string[];
  provenance: "simulated";
};

export type EvaluationDimension =
  | "speech-recognition"
  | "conversation-behavior"
  | "agent-behavior"
  | "business-outcome"
  | "safety-trust";

export type EvaluationAssertion = {
  id: string;
  dimension: EvaluationDimension;
  expected: string;
  deterministicRule: string;
  requiresHumanReview: boolean;
};

export type EvaluationScenario = {
  id: string;
  name: string;
  description: string;
  fixture: Record<string, unknown>;
  expectedBehavior: string[];
  assertions: EvaluationAssertion[];
  remediationIdeas: string[];
  provenance: "simulated";
};

export type EvaluationRunOptions = {
  forceFailures?: string[];
  humanRatings?: Partial<Record<EvaluationDimension, number>>;
  notes?: string;
};

export type EvaluationAssertionResult = EvaluationAssertion & {
  passed: boolean;
  actual: string;
};

export type EvaluationRun = {
  id: string;
  scenarioId: string;
  createdAt: string;
  passed: boolean;
  results: EvaluationAssertionResult[];
  expectedBehavior: string[];
  actualBehavior: string[];
  trace: ConversationTrace;
  humanRatings: Partial<Record<EvaluationDimension, number>>;
  notes: string;
  provenance: "simulated";
};

export type DeploymentMode = {
  id: string;
  name: string;
  description: string;
  boundary: string;
  benefits: string[];
  tradeoffs: string[];
  secretModel: string;
  operationalOwner: Ownership[];
  validationRequired: string[];
  provenance: AppliedProvenance;
  docsMetadataId?: string;
};

export type ResponsibilityMatrixRow = {
  area: string;
  deepgram: string;
  customer: string;
  shared: string;
  thirdParty: string;
};

export type SolutionRecipe = {
  id: string;
  name: string;
  clientProblem: string;
  discoveryAnswers: Partial<ClientDiscoveryInput>;
  architecture: string[];
  deepgramComponents: string[];
  payloadExamples: unknown[];
  eventFlow: string[];
  tools: string[];
  storageOutput: string[];
  latencyPriorities: string[];
  evaluationPlan: string[];
  failureHandling: string[];
  privacyConcerns: string[];
  proofOfConceptScope: string[];
  productionRoadmap: string[];
  codeLabFiles: string[];
  apiStudioOperationIds: string[];
  appliedMlLens: AppliedMlLens;
  provenance: AppliedProvenance;
};

export type MasteryRequirement = {
  id: string;
  label: string;
  module: string;
};

export type MasteryLevel = {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  id: string;
  name: string;
  requirements: MasteryRequirement[];
  disclaimer: string;
};

export type ExperimentJournalEntry = {
  id: string;
  createdAt: string;
  question: string;
  test: string;
  result: string;
  learning: string;
  decision: string;
  nextExperiment: string;
};

export type SolutionBriefInput = {
  contextPack: ClientContextPack;
  recipeId?: string;
  selectedPipelineLayerIds?: PipelineLayerId[];
  experimentConclusions?: string[];
  chosenApis?: string[];
  evaluationPlan?: string[];
  deploymentModeId?: string;
  risks?: string[];
  openQuestions?: string[];
};
