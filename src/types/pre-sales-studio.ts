export type CustomerPatternId = "abby-connect" | "sigmamind-ai" | "five9" | "prem-ai" | "vida" | "creditas" | "nasa" | "custom";
export type PreSalesStageId = "patterns" | "discovery" | "blueprint" | "poc" | "demo" | "readout";
export type EvidenceKind = "public-fact" | "user-entered" | "assumption" | "illustrative";
export type RecommendationFit = "confirmed" | "likely" | "unresolved" | "risk";
export type DemoMode = "simulated" | "live";
export type DiscoveryMode = "fast" | "deep";
export type DiscoveryQuickSelectId =
  | "industry" | "customer-type" | "business-outcome" | "workload-mode" | "interaction-model" | "traffic-direction"
  | "concurrency-scale" | "latency-sensitivity" | "language-profile" | "audio-environment" | "integration-channel"
  | "existing-provider" | "migration-posture" | "deployment" | "residency" | "compliance" | "retention"
  | "evaluation-criteria" | "poc-success" | "timeline" | "implementation-owner";
export type DiscoveryQuickSelectFieldKey =
  | "industry" | "customerType" | "businessOutcomePriorities" | "workloadMode" | "interactionModel" | "trafficDirection"
  | "concurrencyScale" | "latencySensitivity" | "languageProfiles" | "audioEnvironments" | "integrationChannels"
  | "existingProviderCategories" | "migrationPosture" | "deployment" | "residencyNeeds" | "complianceExpectations"
  | "retentionExpectation" | "evaluationCriteria" | "pocSuccessCriteria" | "implementationTimeline" | "implementationOwners";

export interface DiscoveryQuickSelectOption {
  value: string;
  label: string;
  description?: string;
  kind?: "standard" | "not-sure" | "other";
}

export interface DiscoveryQuickSelectGroup {
  id: DiscoveryQuickSelectId;
  stageId: string;
  label: string;
  question: string;
  whyItMatters: string;
  field: DiscoveryQuickSelectFieldKey;
  selection: "single" | "multi";
  fast: boolean;
  options: DiscoveryQuickSelectOption[];
  notePrompt: string;
}

export interface DiscoveryStageDefinition {
  id: string;
  title: string;
  detail: string;
  groupIds: DiscoveryQuickSelectId[];
  advancedFields: DiscoveryFieldKey[];
}

export interface PublicSource {
  label: string;
  url: string;
  verifiedAt: string;
}

export interface CustomerPattern {
  id: Exclude<CustomerPatternId, "custom">;
  name: string;
  category: string;
  industry: string;
  primaryBusinessOutcome: string;
  technicalBuyer: string;
  executiveBuyer: string;
  publicOutcomeSummary: string;
  majorTechnicalConstraint: string;
  publicFacts: string[];
  illustrativeStartingConditions: string[];
  suggestedMetricIds: SuccessCriterionId[];
  discoveryPriorities: DiscoveryFieldKey[];
  source: PublicSource;
  seed: Partial<DiscoveryState>;
}

export interface DiscoveryState {
  industry: string;
  customerType: string;
  businessOutcomePriorities: string[];
  desiredBusinessOutcome: string;
  currentWorkflow: string;
  reasonNow: string;
  launchDeadline: string;
  currentProblemCost: string;
  executiveSponsor: string;
  buyingProcess: string;
  workloadMode: "" | "streaming" | "prerecorded" | "both" | "live-plus-post-call" | "not-sure" | "other";
  interactionModel: string;
  trafficDirection: string;
  products: Array<"stt" | "tts" | "voice-agent" | "audio-intelligence">;
  monthlyAudioMinutes: string;
  monthlyCallCount: string;
  averageCallDuration: string;
  normalConcurrency: string;
  peakConcurrency: string;
  expectedGrowth: string;
  concurrencyScale: string;
  latencySensitivity: string;
  audioSources: string[];
  integrationChannels: string[];
  audioEnvironments: string[];
  codecSampleRate: string;
  channelMode: "" | "mono" | "multichannel" | "mixed";
  backgroundNoise: string;
  languages: string;
  languageProfiles: string[];
  accents: string;
  specialistTerminology: string;
  alphanumericIdentifiers: string;
  codeSwitching: string;
  riskyVocabulary: string;
  deployment: "" | "shared-cloud" | "dedicated" | "vpc" | "self-hosted" | "on-premises" | "air-gapped" | "not-sure" | "other";
  residencyNeeds: string[];
  geographicResidency: string;
  retentionConstraints: string;
  sensitiveData: string;
  authenticationRequirements: string;
  compliancePosture: string;
  complianceExpectations: string[];
  retentionExpectation: string;
  incumbentProvider: string;
  existingProviderCategories: string[];
  migrationPosture: string;
  telephonyProvider: string;
  contactCenterPlatform: string;
  llmProvider: string;
  crm: string;
  dataWarehouse: string;
  orchestrationLayer: string;
  observabilityTools: string;
  engineeringStack: string;
  currentWer: string;
  currentLatency: string;
  currentCost: string;
  containment: string;
  conversion: string;
  abandonment: string;
  qaCoverage: string;
  knownFailurePatterns: string;
  evaluationCriteria: string[];
  pocSuccessCriteria: string[];
  implementationTimeline: string;
  implementationOwners: string[];
  quickNotes: Partial<Record<DiscoveryQuickSelectId, string>>;
}

export type DiscoveryFieldKey = keyof DiscoveryState;

export interface DiscoveryQuestion {
  id: string;
  field: DiscoveryFieldKey;
  question: string;
  whyItMatters: string;
  priority: number;
}

export interface DiscoveryGap {
  id: string;
  field: DiscoveryFieldKey;
  question: string;
  whyItMatters: string;
  workingAssumption: string;
  architectureImpact: string;
}

export interface DiscoveryInsight {
  confidence: number;
  known: string[];
  assumptions: string[];
  unanswered: DiscoveryGap[];
  nextQuestions: DiscoveryQuestion[];
}

export interface SolutionRecommendation {
  id: string;
  title: string;
  fit: RecommendationFit;
  capability: string;
  reason: string;
  requirement: string;
  assumption: string;
  tradeoff: string;
  validationStep: string;
  sourceFields: DiscoveryFieldKey[];
}

export type ArchitectureOwner = "customer" | "deepgram" | "third-party";

export interface ArchitectureNode {
  id: string;
  label: string;
  detail: string;
  owner: ArchitectureOwner;
  whyPresent: string;
  requirement: string;
  x: number;
  y: number;
  executive: boolean;
}

export interface ArchitectureEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  flow: "audio" | "transcript" | "control" | "business-data";
}

export interface ArchitectureBlueprint {
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
  boundaries: string[];
}

export type SuccessCriterionId =
  | "overall-wer" | "domain-term-error" | "alphanumeric-accuracy" | "p50-latency" | "p95-latency"
  | "time-to-first-byte" | "voice-to-voice" | "turn-detection" | "interruption-recovery" | "concurrency"
  | "error-rate" | "uptime" | "cost-per-minute" | "cost-per-call" | "cost-per-completed-task"
  | "authentication-completion" | "containment" | "conversion" | "abandonment" | "qa-coverage" | "agent-handling-time";

export interface SuccessCriterion {
  id: SuccessCriterionId;
  label: string;
  baseline: string;
  target: string;
  illustrativeTarget: string;
  measurementMethod: string;
  dataset: string;
  owner: string;
  status: "draft" | "adopted" | "measuring" | "met" | "not-met";
  notes: string;
  targetSource: "unknown" | "illustrative" | "customer-adopted" | "customer-provided";
}

export interface DatasetSegment {
  id: string;
  label: string;
  dimension: string;
  selected: boolean;
  sampleCount: number;
  highRisk: boolean;
  reason: string;
}

export interface PocPlan {
  businessHypothesis: string;
  technicalHypothesis: string;
  agreedScope: string[];
  excludedScope: string[];
  customerResponsibilities: string[];
  deepgramResponsibilities: string[];
  datasetRequirements: string[];
  milestones: string[];
  measurementMethodology: string[];
  decisionDate: string;
  risks: string[];
  exitCriteria: string[];
  criteria: SuccessCriterion[];
  datasetSegments: DatasetSegment[];
  datasetWarnings: string[];
}

export interface Challenge {
  id: string;
  title: string;
  category: "timeline" | "deployment" | "incumbent" | "conversation" | "domain" | "evaluation" | "scale" | "latency" | "commercial" | "language" | "resilience" | "executive";
  discoveryImpact: string;
  architectureImpact: string;
  recommendationImpact: string;
  pocImpact: string;
  datasetImpact: string;
  businessImpact: string;
  nextQuestion: string;
  fieldUpdates: Partial<DiscoveryState>;
  requiredCriterionIds: SuccessCriterionId[];
  requiredDatasetSegmentIds: string[];
}

export interface Objection {
  id: string;
  title: string;
  acknowledge: string;
  underlyingRequirement: string;
  clarifyingQuestion: string;
  technicalValidation: string;
  measurableEvidence: string;
  doNotPromise: string;
}

export interface BusinessCaseInputs {
  monthlyCallCount: string;
  averageCallDuration: string;
  currentTranscriptionCost: string;
  proposedTranscriptionCost: string;
  humanQaPercent: string;
  qaReviewMinutes: string;
  loadedLaborCost: string;
  currentContainment: string;
  proposedContainment: string;
  transferRate: string;
  averageHandlingMinutes: string;
  abandonment: string;
  currentConversion: string;
  proposedConversion: string;
  averageTransactionValue: string;
  implementationCost: string;
}

export interface BusinessCaseResult {
  monthlyPlatformCost: number | null;
  monthlySavings: number | null;
  qaHoursRecovered: number | null;
  costPerInteraction: number | null;
  costPerCompletedTask: number | null;
  incrementalConversions: number | null;
  potentialAnnualValue: number | null;
  paybackMonths: number | null;
  formulas: string[];
  assumptions: string[];
}

export interface DemoResult {
  label: "Illustrative Demo Data" | "Live Deepgram API Response";
  transcript: string;
  interimTranscript: string;
  finalTranscript: string;
  timestamps: string[];
  detectedLanguage: string;
  speakerLabels: string;
  redaction: string;
  requestDurationMs: number;
  firstResultLatencyMs: number | null;
  finalResultLatencyMs: number;
  model: string;
  options: string[];
  retries: number;
  error: string;
}

export interface ExecutiveReadout {
  businessProblem: string;
  whyNow: string;
  proposedOutcome: string;
  expectedValue: string;
  majorRisk: string;
  recommendedDecision: string;
  nextMilestone: string;
}

export interface TechnicalReadout {
  workload: string;
  architecture: string[];
  deepgramProducts: string[];
  deployment: string;
  integrations: string[];
  apiOptions: string[];
  evaluationMethodology: string[];
  successCriteria: string[];
  security: string[];
  unresolvedQuestions: string[];
  implementationSequence: string[];
}

export interface ProductionHandoffItem {
  id: string;
  label: string;
  complete: boolean;
}

export interface OpportunityState {
  schemaVersion: 1;
  id: string;
  name: string;
  patternId: CustomerPatternId;
  createdAt: string;
  updatedAt: string;
  activeStage: PreSalesStageId;
  discovery: DiscoveryState;
  activeChallengeIds: string[];
  criteria: SuccessCriterion[];
  datasetSegments: DatasetSegment[];
  businessCaseInputs: BusinessCaseInputs;
  productionHandoff: ProductionHandoffItem[];
  guidedMode: boolean;
  guidedFlow: boolean;
  guidedStep: number;
  persistenceEnabled: boolean;
  discoveryMode: DiscoveryMode;
}

export interface ApiLabPresetRecommendation {
  endpointId: string;
  title: string;
  reason: string;
  href: string;
}

export interface PreSalesExport {
  kind: "deepgram-pre-sales-solution-studio";
  schemaVersion: 1;
  syntheticData: true;
  exportedAt: string;
  opportunity: OpportunityState;
  executiveReadout: ExecutiveReadout;
  technicalReadout: TechnicalReadout;
}
