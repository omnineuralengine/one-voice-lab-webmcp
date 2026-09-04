import type { ArchitectureSimulationState, SimulationAction } from "@/types/architecture-studio-diagnostics";
import type { ArchitectureStudioHandoffState, HandoffAction } from "@/types/architecture-studio-handoff";

export type StudioStageId =
  | "objective"
  | "stack"
  | "audio"
  | "conversation"
  | "governance"
  | "success";

export type StakeholderRole =
  | "vp-customer-experience"
  | "voice-platform-engineer"
  | "security-infrastructure-lead"
  | "observer";

export type StudioQuestionKind = "single" | "multi" | "text" | "number";

export type StudioQuestionOption = {
  value: string;
  label: string;
  description?: string;
};

export type StudioQuestion = {
  id: string;
  stageId: StudioStageId;
  label: string;
  prompt: string;
  kind: StudioQuestionKind;
  options?: StudioQuestionOption[];
  placeholder?: string;
  critical?: boolean;
  whyItMatters: string;
  relevantRoles: StakeholderRole[];
  technical?: boolean;
};

export type StudioAnswerValue = string | string[] | number | boolean;

export type StudioAnswer = {
  questionId: string;
  participantId: string;
  value: StudioAnswerValue;
  updatedAt: string;
};

export type StudioParticipant = {
  id: string;
  displayName: string;
  role: StakeholderRole;
  joinedAt: string;
  lastSeenAt: string;
  tokenHash?: string;
};

export type StudioRecommendationPath =
  | "speech-intelligence"
  | "composable-voice"
  | "managed-voice-agent"
  | "private-deployment"
  | "evaluation-first";

export type RecommendationConfidence = "low" | "developing" | "moderate" | "high";

export type StudioScenarioId = "northstar-contact-cloud" | "meridian-contact-cloud" | "custom";

/**
 * Normalized, typed view of the live answer ledger. The stored answer format
 * remains question-oriented so new discovery prompts can be added without a
 * database migration; the package engine converts it into this stable schema.
 */
export type StudioDiscoverySchema = {
  scenarioName?: string;
  industry: string[];
  primaryUseCases: string[];
  workflow: string[];
  ccaasProvider?: string;
  telephonyProvider?: string;
  currentVoiceStack?: string;
  processingMode?: string;
  concurrentSessions?: string;
  monthlyMinutes?: string;
  languagesAndAccents: string[];
  noisyAudioConditions: string[];
  domainTerminology: boolean;
  diarizationRequired: boolean;
  interruptionAndTurnTaking: string[];
  latencyTarget?: string;
  accuracyTarget?: string;
  privacyConstraints: string[];
  retentionConstraint?: string;
  deploymentPreference?: string;
  llmOrchestration?: string;
  businessSystems: string[];
  ttsRequirements: string[];
  observabilityRequirements: string[];
  budgetSensitivity?: string;
  launchTimeline?: string;
  proofOfConceptSuccessCriteria?: string;
};

export type PackageComponentCategory =
  | "ingress"
  | "speech"
  | "conversation"
  | "integration"
  | "deployment"
  | "governance"
  | "operations";

export type PackageComponentRecommendation = {
  id: string;
  architectureModuleId: string;
  category: PackageComponentCategory;
  customerRequirement: string;
  architecturalDecision: string;
  capabilityOrApproach: string;
  capabilityId?: string;
  whyItFits: string;
  tradeoffOrLimitation: string;
  validationMethod: string;
  confidence: RecommendationConfidence;
  sourceQuestionIds: string[];
  verificationNeeded: boolean;
};

export type RecommendationGap = {
  id: string;
  category: "missing" | "conflict" | "verification" | "measurement";
  title: string;
  whyItMatters: string;
  workingAssumption: string;
  nextQuestion: string;
  architectureImpact: string;
  sourceQuestionIds: string[];
};

export type ValidationTest = {
  id: string;
  category: "audio" | "accuracy" | "latency" | "conversation" | "business" | "resilience" | "governance" | "scale";
  title: string;
  evidenceNeeded: string;
  method: string;
  acceptanceCriteria: string;
  unresolvedPrerequisites: string[];
  sourceQuestionIds: string[];
};

export type PackageRecommendationResult = {
  generatedAt: string;
  discovery: StudioDiscoverySchema;
  confidence: RecommendationConfidence;
  confidenceReason: string;
  components: PackageComponentRecommendation[];
  gaps: RecommendationGap[];
  validationPlan: ValidationTest[];
};

export type ArchitectureDecisionStatus = "accepted" | "rejected" | "undecided";

export type ArchitectureModuleOverride = {
  moduleId: string;
  presence: "unchanged" | "included" | "excluded";
  decisionStatus: ArchitectureDecisionStatus;
  note: string;
  updatedAt: string;
};

export type RecommendationInfluence = {
  questionId: string;
  answer: string;
  effect: string;
};

export type ArchitectureRecommendation = {
  primaryPath: StudioRecommendationPath;
  title: string;
  summary: string;
  confidence: RecommendationConfidence;
  confidenceReason: string;
  scores: Record<StudioRecommendationPath, number>;
  influences: RecommendationInfluence[];
  assumptions: string[];
  unresolvedQuestions: string[];
  tradeoffs: string[];
  alternativesConsidered: Array<{ path: StudioRecommendationPath; reason: string }>;
  changeTriggers: string[];
  capabilityIds: string[];
};

export type RecommendationHistoryEntry = {
  id: string;
  createdAt: string;
  path: StudioRecommendationPath;
  title: string;
  reason: string;
};

export type StudioAssumption = {
  id: string;
  text: string;
  status: "unvalidated" | "confirmed" | "overridden";
  createdAt: string;
};

export type StudioDecision = {
  id: string;
  text: string;
  rationale: string;
  createdAt: string;
};

export type StudioParkingLotItem = {
  id: string;
  text: string;
  resolved: boolean;
  createdAt: string;
};

export type StudioNextStep = {
  id: string;
  action: string;
  owner: string;
  timing: string;
  completed: boolean;
};

export type ArchitectureNodeOwner = "customer" | "deepgram" | "third-party";
export type ArchitectureFlowType = "audio" | "transcript" | "control" | "business-data";

export type ArchitectureNode = {
  id: string;
  label: string;
  detail: string;
  owner: ArchitectureNodeOwner;
  layer: number;
  order: number;
  latencyCheckpoint?: boolean;
  optional?: boolean;
  origin?: "engine" | "operator";
  decisionStatus?: ArchitectureDecisionStatus;
  operatorNote?: string;
};

export type ArchitectureEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
  type: ArchitectureFlowType;
};

export type ArchitectureTopology = {
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
  boundaries: Array<{ id: string; label: string; nodeIds: string[]; tone: "regional" | "private" }>;
};

export type LabRecommendation = {
  id: string;
  label: string;
  reason: string;
  href?: string;
  status: "available" | "planned";
};

export type StudioSolutionBrief = {
  generatedAt: string;
  customerObjective: string;
  currentEnvironment: string[];
  recommendedStartingArchitecture: string;
  technicalTopology: ArchitectureTopology;
  deepgramComponents: string[];
  retainedComponents: string[];
  tradeoffs: string[];
  evaluationPlan: string[];
  productionPath: string[];
  openQuestions: string[];
  nextSteps: StudioNextStep[];
  markdown: string;
};

export type StudioSession = {
  id: string;
  code: string;
  scenarioId: StudioScenarioId;
  scenarioName: string;
  status: "active" | "deleted";
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  version: number;
  realtimeMode: "supabase" | "local-demo";
  activeStageId: StudioStageId;
  revealedQuestionIds: string[];
  pausedStageIds: StudioStageId[];
  participants: StudioParticipant[];
  answers: StudioAnswer[];
  presenterOverrides: Record<string, StudioAnswerValue>;
  presenterNotes: string[];
  assumptions: StudioAssumption[];
  parkingLot: StudioParkingLotItem[];
  decisions: StudioDecision[];
  reactions: Partial<Record<StudioRecommendationPath, string[]>>;
  recommendationHistory: RecommendationHistoryEntry[];
  architectureOverrides: ArchitectureModuleOverride[];
  architectureSimulation: ArchitectureSimulationState;
  handoffState: ArchitectureStudioHandoffState;
  savedBrief: StudioSolutionBrief | null;
  nextSteps: StudioNextStep[];
  technicalDepth: "executive" | "balanced" | "technical";
  languageMode: "plain" | "technical";
  confirmation: "pending" | "confirmed" | "needs-correction";
};

export type PublicStudioSession = Omit<StudioSession, "participants"> & {
  participants: Array<Omit<StudioParticipant, "tokenHash">>;
};

export type SessionCreateResponse = {
  mode: "supabase" | "local-demo";
  session: PublicStudioSession;
  presenterToken: string;
  presenterUrl: string;
  participantUrl: string;
};

export type StudioMutation =
  | { type: "join"; displayName: string; role: StakeholderRole; participantToken?: string; participantId?: string }
  | { type: "answer"; participantId: string; participantToken: string; questionId: string; value: StudioAnswerValue }
  | { type: "react"; participantId: string; participantToken: string; path: StudioRecommendationPath }
  | { type: "heartbeat"; participantId: string; participantToken: string }
  | { type: "presenter"; presenterToken: string; command: StudioPresenterCommand };

export type StudioPresenterCommand =
  | { kind: "reveal_question"; questionId: string }
  | { kind: "set_stage"; stageId: StudioStageId }
  | { kind: "toggle_stage_pause"; stageId: StudioStageId }
  | { kind: "override_answer"; questionId: string; value: StudioAnswerValue }
  | { kind: "add_note"; text: string }
  | { kind: "add_assumption"; text: string }
  | { kind: "update_assumption"; id: string; status: StudioAssumption["status"] }
  | { kind: "add_parking_lot"; text: string }
  | { kind: "toggle_parking_lot"; id: string }
  | { kind: "add_decision"; text: string; rationale: string }
  | { kind: "set_depth"; value: StudioSession["technicalDepth"] }
  | { kind: "set_language_mode"; value: StudioSession["languageMode"] }
  | { kind: "set_confirmation"; value: StudioSession["confirmation"] }
  | { kind: "update_architecture_module"; moduleId: string; presence?: ArchitectureModuleOverride["presence"]; decisionStatus?: ArchitectureDecisionStatus; note?: string }
  | { kind: "restore_architecture_module"; moduleId: string }
  | { kind: "simulation"; action: SimulationAction }
  | { kind: "handoff"; action: HandoffAction }
  | { kind: "import_session"; payload: unknown }
  | { kind: "set_next_steps"; steps: StudioNextStep[] }
  | { kind: "generate_brief" }
  | { kind: "reset" };
