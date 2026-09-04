import { z } from "zod";

export const AI_REASONING_CLASSES = ["FAST", "DEEP"] as const;
export const AI_FEATURES = [
  "intent-router",
  "copilot",
  "explain-lab",
  "second-opinion",
  "architecture-red-team",
  "poc-generator",
] as const;
export const AI_CLAIM_LABELS = [
  "Repository verified",
  "Deepgram documentation verified",
  "Assumption",
  "Experimental idea",
] as const;

const boundedText = (max: number) => z.string().trim().min(1).max(max);

export const aiEvidenceSchema = z.object({
  id: z.string().trim().min(1).max(160),
  label: boundedText(240),
  type: z.enum(["repository", "deepgram-documentation"]),
  summary: boundedText(1_000),
  url: z.string().url().max(1_000).optional(),
}).strict();

export const aiContextSchema = z.object({
  moduleId: z.string().trim().min(1).max(120),
  moduleName: boundedText(160),
  summary: z.string().trim().max(4_000).default(""),
  facts: z.array(boundedText(800)).max(30).default([]),
  assumptions: z.array(boundedText(800)).max(30).default([]),
  openQuestions: z.array(boundedText(800)).max(30).default([]),
  architecture: z.array(boundedText(800)).max(40).default([]),
  risks: z.array(boundedText(800)).max(30).default([]),
  evidence: z.array(aiEvidenceSchema).max(30).default([]),
}).strict();

export const aiReasoningRequestSchema = z.object({
  feature: z.enum(AI_FEATURES),
  requestedReasoningClass: z.enum(AI_REASONING_CLASSES).optional(),
  prompt: boundedText(4_000),
  context: aiContextSchema,
}).strict();

export const aiSessionIdSchema = z.string().uuid();

export const aiClaimSchema = z.object({
  statement: boundedText(1_000),
  label: z.enum(AI_CLAIM_LABELS),
  evidenceIds: z.array(z.string().trim().min(1).max(160)).max(10).default([]),
}).strict();

export const aiPocPlanSchema = z.object({
  hypothesis: boundedText(1_200),
  requiredInputs: z.array(boundedText(500)).max(20),
  representativeData: z.array(boundedText(500)).max(20),
  environment: z.array(boundedText(500)).max(20),
  testMatrix: z.array(z.object({
    category: boundedText(120),
    test: boundedText(800),
    successCriterion: boundedText(800),
  }).strict()).max(30),
  quantitativeCriteria: z.array(boundedText(500)).max(20),
  qualitativeCriteria: z.array(boundedText(500)).max(20),
  failureCriteria: z.array(boundedText(500)).max(20),
  productionEvidence: z.array(boundedText(500)).max(20),
  unresolvedAssumptions: z.array(boundedText(500)).max(20),
}).strict();

export const aiRedTeamReviewSchema = z.object({
  strongestAspect: boundedText(1_000),
  weakestAssumption: boundedText(1_000),
  likelyHiddenFailure: boundedText(1_000),
  missingObservability: boundedText(1_000),
  missingFallback: boundedText(1_000),
  ambiguousOwnershipBoundary: boundedText(1_000),
  recommendedTest: boundedText(1_000),
  architectureAlternative: boundedText(1_200),
  productionBlocker: boundedText(1_000),
}).strict();

export const aiReasoningOutputSchema = z.object({
  summary: boundedText(2_000),
  strongestRecommendation: boundedText(1_200),
  assumptions: z.array(boundedText(800)).max(20),
  evidenceGaps: z.array(boundedText(800)).max(20),
  risks: z.array(boundedText(800)).max(20),
  discoveryQuestions: z.array(boundedText(800)).max(20),
  alternatives: z.array(boundedText(800)).max(20),
  recommendedTests: z.array(boundedText(800)).max(20),
  nextModule: z.object({
    id: z.string().trim().min(1).max(120),
    label: boundedText(160),
    href: z.string().regex(/^\/(?!\/)[A-Za-z0-9/?=&._-]*$/).max(500),
    reason: boundedText(600),
  }).strict().nullable(),
  claims: z.array(aiClaimSchema).max(30),
  redTeam: aiRedTeamReviewSchema.nullable(),
  poc: aiPocPlanSchema.nullable(),
}).strict();

export const aiUsageMetadataSchema = z.object({
  timestamp: z.string().datetime(),
  feature: z.enum(AI_FEATURES),
  reasoningClass: z.enum(AI_REASONING_CLASSES),
  model: z.string().min(1).max(200),
  latencyMs: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  costUsd: z.number().nonnegative().nullable(),
  success: z.boolean(),
  fallbackUsed: z.boolean(),
}).strict();

export const aiReasoningResponseSchema = z.object({
  status: z.enum(["completed", "disabled", "unavailable", "rate-limited", "invalid-output"]),
  message: z.string().max(500),
  result: aiReasoningOutputSchema.nullable(),
  usage: aiUsageMetadataSchema.nullable(),
  requiresHumanAcceptance: z.literal(true),
  deterministicStateChanged: z.literal(false),
}).strict();

export type AiReasoningClass = (typeof AI_REASONING_CLASSES)[number];
export type AiFeature = (typeof AI_FEATURES)[number];
export type AiClaimLabel = (typeof AI_CLAIM_LABELS)[number];
export type AiContext = z.infer<typeof aiContextSchema>;
export type AiReasoningRequest = z.infer<typeof aiReasoningRequestSchema>;
export type AiReasoningOutput = z.infer<typeof aiReasoningOutputSchema>;
export type AiReasoningResponse = z.infer<typeof aiReasoningResponseSchema>;
export type AiUsageMetadata = z.infer<typeof aiUsageMetadataSchema>;
