import type { CodeLabWorkflowId } from "@/lib/code-lab-files";

export type QuestlineLanguageId =
  | "python"
  | "typescript"
  | "go"
  | "csharp"
  | "powershell"
  | "shell"
  | "sql"
  | "cpp"
  | "html-css"
  | "php"
  | "react"
  | "java-kotlin"
  | "rust";

export type QuestlineSectionId =
  | "quest-map"
  | "polyglot"
  | "stack-adapter"
  | "incidents"
  | "audio"
  | "debugger-testing"
  | "toolchains"
  | "capstones";

export type QuestTier = 1 | 2 | 3 | 4 | 5 | 6;
export type QuestStatus = "not-started" | "practiced" | "needs-review" | "completed";
export type ExperienceStatus = "executable" | "simulated" | "conceptual" | "docs-verification-required" | "not-installed";
export type QuestDifficulty = "foundation" | "intermediate" | "advanced" | "client-impact";
export type LanguageTrackCategory = "primary" | "bridge" | "framework-specialization" | "optional-awareness";
export type PolyglotFocus = "setup" | "authentication" | "request" | "send-audio" | "receive-event" | "parsing" | "errors" | "cleanup" | "testing";

export type QuestDocsMetadata = {
  docsUrl: string;
  lastVerifiedAt: string | null;
  verificationStatus: "verified" | "needs-verification" | "concept-only";
  notes: string;
};

export type RuntimeModel = {
  executionModel: string;
  processModel: string;
  memoryModel: string;
  concurrencyModel: string;
  networkModel: string;
  dependencyModel: string;
  dataMovement: string[];
  cleanupResponsibilities: string[];
};

export type AppliedMlLens = {
  hypothesis: string;
  inputDistribution: string;
  modelOrConfiguration: string;
  expectedOutput: string;
  qualityMetric: string;
  latencyMetric: string;
  failureSegment: string;
  testFixture: string;
  productionSignal: string;
  rollbackCondition: string;
};

export type QuestCodeExample = {
  language: QuestlineLanguageId;
  title: string;
  filename: string;
  code: string;
  runtime: "browser" | "server" | "cli" | "database" | "native" | "concept";
  status: ExperienceStatus;
  regions: Partial<Record<PolyglotFocus, [number, number]>>;
  notes: string[];
  docs?: QuestDocsMetadata;
};

export type LanguageTrack = {
  id: QuestlineLanguageId;
  label: string;
  shortLabel: string;
  category: LanguageTrackCategory;
  learnerFit: string;
  voiceStrengths: string[];
  focus: string[];
  runtime: RuntimeModel;
  supportedCore: boolean;
  docsStatus: ExperienceStatus;
};

export type QuestNode = {
  id: string;
  tier: QuestTier;
  title: string;
  languages: QuestlineLanguageId[];
  prerequisiteIds: string[];
  difficulty: QuestDifficulty;
  status: ExperienceStatus;
  firstPrinciplesConcept: string;
  whyVoiceSystemsCare: string;
  expectedMentalModel: string;
  commonMistake: string;
  clientScenario: string;
  debuggingClue: string;
  challenge: string;
  masteryQuestion: string;
  completionCriteria: string[];
  relatedApiOperationId: string;
  relatedCodeLabWorkflowId: CodeLabWorkflowId;
  relatedAudioConcept: string;
  runtimeModelOverride?: Partial<RuntimeModel>;
  codeExamples: QuestCodeExample[];
  appliedMlLens: AppliedMlLens;
};

export type PolyglotImplementation = QuestCodeExample & {
  entryPoint: string;
  files: string[];
  dependency: string;
  environmentSetup: string[];
  clientLibrary: string;
  serialization: string;
  binaryHandling: string;
  concurrency: string;
  errorHandling: string;
  cleanup: string;
  testing: string;
  deploymentShape: string;
};

export type PolyglotWorkflow = {
  id: string;
  label: string;
  purpose: string;
  relatedApiOperationId: string;
  relatedCodeLabWorkflowId: CodeLabWorkflowId;
  implementations: PolyglotImplementation[];
};

export type IdeTrack = {
  id: string;
  label: string;
  status: ExperienceStatus;
  learnerContext: string;
  whatClientSees: string;
  likelyMistakes: string[];
  confirmEnvironment: string[];
  dependencyLocation: string;
  entryPoint: string;
  breakpointLocations: string[];
  evidenceLocations: string[];
  diagnosticCommands: string[];
};

export type IncidentEvidence = {
  label: string;
  type: "log" | "code" | "payload" | "architecture" | "packet" | "metric";
  content: string;
};

export type ClientIncident = {
  id: string;
  title: string;
  language: QuestlineLanguageId;
  framework: string;
  ide: string;
  operatingSystem: string;
  difficulty: QuestDifficulty;
  status: "simulated";
  symptoms: string[];
  evidence: IncidentEvidence[];
  architecture: string[];
  hiddenRootCause: string;
  misleadingClues: string[];
  investigationSteps: string[];
  resolution: string[];
  prevention: string[];
  clientFacingExplanation: string;
  classification: "coding-bug" | "integration-bug" | "data-problem" | "audio-problem" | "model-limitation" | "evaluation-problem" | "expectation-mismatch" | "infrastructure";
};

export type AudioLesson = {
  id: string;
  title: string;
  group: "waveform" | "digital-audio" | "containers-codecs" | "streaming" | "capture" | "voice-agent" | "signal-analysis";
  status: ExperienceStatus;
  concept: string;
  soundsLike: string;
  looksLike: string;
  bytesMean: string;
  deepgramReceives: string;
  symptom: string;
  diagnosis: string[];
  relatedLanguages: QuestlineLanguageId[];
};

export type AudioFailureLesson = {
  id: string;
  title: string;
  mutation: "clipping" | "low-gain" | "silence" | "noise" | "long-chunks" | "wrong-sample-rate" | "stereo-mismatch" | "codec-container-mismatch";
  status: "simulated";
  visibleSymptom: string;
  byteLevelCause: string;
  deepgramSymptom: string;
  evidence: string[];
  correction: string[];
};

export type TestingQuest = {
  id: string;
  title: string;
  kind: "unit" | "integration" | "streaming" | "audio";
  languages: QuestlineLanguageId[];
  tool: string;
  installed: boolean;
  fixture: string;
  assertion: string;
  failureMeaning: string;
};

export type DebuggerScenario = {
  id: string;
  title: string;
  language: QuestlineLanguageId;
  frames: Array<{ function: string; file: string; line: number; locals: Record<string, unknown> }>;
  watches: Array<{ expression: string; value: string; implication: string }>;
  evidenceOrder: string[];
  correctDiagnosis: string;
};

export type StackAdapterInput = {
  language: QuestlineLanguageId;
  framework: string;
  ide: string;
  operatingSystem: string;
  deploymentPlatform: string;
  audioSource: string;
  transport: string;
  storage: string;
  downstreamSystem: string;
  concurrency: string;
  securityRequirements: string;
};

export type StackRecommendation = {
  summary: string;
  projectStructure: string[];
  dependencyApproach: string[];
  environmentSetup: string[];
  deepgramIntegrationPoint: string[];
  audioHandling: string[];
  concurrencyPattern: string[];
  cancellationPattern: string[];
  errorHandling: string[];
  testingStrategy: string[];
  deploymentNotes: string[];
  likelyPitfalls: string[];
  discoveryQuestions: string[];
  reasons: Array<{ recommendation: string; why: string; assumption: string; validate: string }>;
  status: ExperienceStatus;
};

export type CapstoneProject = {
  id: string;
  title: string;
  primaryLanguages: QuestlineLanguageId[];
  clientBrief: string;
  projectTree: string[];
  acceptanceCriteria: string[];
  architecture: string[];
  deepgramApis: string[];
  audioAssumptions: string[];
  failureInjection: string[];
  evaluationPlan: string[];
  testChecklist: string[];
  impact: { technicalArtifact: string; customerExplanation: string; businessValue: string; reusableLearning: string; nextImprovement: string };
  relatedCodeLabWorkflowId: CodeLabWorkflowId;
  status: ExperienceStatus;
};

export type DrillScenario = {
  id: string;
  title: string;
  prompt: string;
  language: QuestlineLanguageId;
  layers: string[];
  expectedReasoning: string[];
  evidenceChoices: string[];
  reusableImprovement: string;
};

export type MasteryLevel = {
  level: number;
  id: string;
  name: string;
  requirements: Array<{ id: string; label: string; skill: string }>;
  disclaimer: string;
};

export type QuestProgress = {
  questStatuses: Record<string, QuestStatus>;
  questsViewed: string[];
  challengesAttempted: string[];
  challengesCompleted: string[];
  hintsUsed: Record<string, "none" | "concept" | "syntax" | "next-line" | "full-solution">;
  incidentsSolved: string[];
  audioLessonsCompleted: string[];
  capstonesStarted: string[];
  capstonesCompleted: string[];
  masteryRequirementIds: string[];
  notes: string;
  confidenceRating: number;
};
