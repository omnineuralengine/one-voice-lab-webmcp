import { z } from "zod";

export type ProblemInputMode = "transcript" | "question" | "brief";
export type ProblemStatus = "new" | "working" | "answered" | "parked";
export type EvidenceKind = "confirmed" | "inferred" | "unknown";

export const SOLUTION_LANES = [
  "Realtime streaming speech-to-text", "Prerecorded/batch transcription", "Voice-agent or conversational turn-taking",
  "Text-to-speech", "Accuracy and noisy audio", "Language or multilingual requirements", "Connectivity and recovery",
  "Scaling and concurrency", "Security or deployment", "Architecture/integration", "Coding/debugging", "Evaluation and benchmarking",
] as const;
export type SolutionLane = (typeof SOLUTION_LANES)[number];

export type ContextField = { id: string; label: string; value: string; evidence: EvidenceKind };
export type ClarifyingQuestion = { question: string; why: string };
export type OfficialDoc = { title: string; url: string; why: string };
export const docsEvidenceModeSchema = z.enum(["live-docs", "curated-fallback", "unavailable"]);
export const docsEvidenceItemSchema = z.object({
  id: z.string().min(1).max(240),
  title: z.string().min(1).max(300),
  officialUrl: z.string().url().max(2_048),
  summary: z.string().max(2_000),
  whyItMatters: z.string().max(2_000),
  supportedClaim: z.string().max(2_000),
  queryUsed: z.string().max(2_500),
  retrievedAt: z.string().datetime(),
  sourceType: z.enum(["deepgram-docs-mcp", "curated-registry"]),
  verificationState: z.enum(["live-retrieved", "curated-last-verified"]),
}).strict();
export const docsEvidenceResultSchema = z.object({
  mode: docsEvidenceModeSchema,
  technicalQuery: z.string().max(2_500),
  evidence: z.array(docsEvidenceItemSchema).max(10),
  searchedAt: z.string().datetime(),
  message: z.string().max(2_000),
}).strict();
export type DocsEvidenceMode = z.infer<typeof docsEvidenceModeSchema>;
export type DocsEvidenceItem = z.infer<typeof docsEvidenceItemSchema>;
export type DocsEvidenceResult = z.infer<typeof docsEvidenceResultSchema>;
export type CodeStarter = { language: "TypeScript" | "Python" | "curl"; code: string };

export type SolutionBrief = {
  schemaVersion: 1; sayNow: string[]; clarify: ClarifyingQuestion[];
  recommend: { leadingPath: string; why: string; assumptions: string[]; confidence: "low" | "medium" | "high"; alternative: string };
  architecture: string[]; implementation: string[]; code: CodeStarter[]; tradeoffs: string[];
  failurePlan: string[]; validation: string[]; docs: OfficialDoc[]; assumptions: string[]; unknowns: string[];
};

export type StudioProblem = {
  id: string; number: number; title: string; status: ProblemStatus; createdAt: string; updatedAt: string;
  mode: ProblemInputMode; rawInput: string; selectedProblem: string; context: ContextField[]; lanes: SolutionLane[];
  confidence: number; brief: SolutionBrief | null;
  docsQuery: string; docsResult: DocsEvidenceResult | null; pinnedEvidenceIds: string[];
  stack: import("@/types/questline").StackAdapterInput;
  technicalArtifacts: import("@/types/payload-code-workbench").TechnicalArtifact[];
  sdkDiagnoses: import("@/types/sdk-doctor").SdkDiagnosis[];
  solutionCase: import("@/types/live-solution-case").SolutionCaseBundle;
};
export type StudioSession = { schemaVersion: 1; activeProblemId: string; problems: StudioProblem[] };
