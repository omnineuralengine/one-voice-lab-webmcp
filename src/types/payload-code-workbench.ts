import { z } from "zod";

export const TECHNICAL_ARTIFACT_TYPES = [
  "json-payload",
  "json-response",
  "jsonl",
  "curl",
  "javascript",
  "typescript",
  "python",
  "raw-http-request",
  "raw-http-response",
  "application-log",
  "error-message",
  "plain-text",
  "unknown",
] as const;

export const DETECTED_TECHNICAL_LANGUAGES = [
  "json",
  "jsonl",
  "bash",
  "powershell",
  "javascript",
  "typescript",
  "python",
  "http",
  "log",
  "plain-text",
  "unknown",
] as const;

export const technicalArtifactTypeSchema = z.enum(TECHNICAL_ARTIFACT_TYPES);
export const detectedTechnicalLanguageSchema = z.enum(DETECTED_TECHNICAL_LANGUAGES);
export const workbenchConfidenceSchema = z.enum(["low", "medium", "high"]);
export const technicalValidationStatusSchema = z.enum(["valid", "warning", "invalid", "unvalidated"]);

export type TechnicalJsonValue =
  | string
  | number
  | boolean
  | null
  | TechnicalJsonValue[]
  | { [key: string]: TechnicalJsonValue };

export const technicalJsonValueSchema: z.ZodType<TechnicalJsonValue> = z.lazy(() =>
  z.union([
    z.string().max(120_000),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(technicalJsonValueSchema).max(2_000),
    z.record(z.string().max(240), technicalJsonValueSchema),
  ]),
);

export const technicalScalarSchema = z.union([
  z.string().max(20_000),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().max(2_000)).max(100),
]);

export const secretFindingSchema = z.object({
  id: z.string().min(1).max(120),
  kind: z.enum([
    "deepgram-api-key",
    "authorization-token",
    "basic-authorization",
    "api-key",
    "github-token",
    "aws-access-key",
    "aws-secret-key",
    "google-api-key",
    "jwt",
    "cookie",
    "signed-url-credential",
    "private-key",
    "generic-secret",
  ]),
  label: z.string().min(1).max(120),
  placeholder: z.string().min(1).max(80),
  count: z.number().int().min(1).max(1_000),
  lines: z.array(z.number().int().positive()).max(50),
  confidence: z.literal("high"),
}).strict();

export const technicalValidationIssueSchema = z.object({
  id: z.string().min(1).max(160),
  classification: z.enum([
    "confirmed-syntax-problem",
    "confirmed-security-concern",
    "documentation-mismatch",
    "possible-configuration-issue",
    "requires-customer-clarification",
    "unknown",
  ]),
  severity: z.enum(["error", "warning", "info"]),
  message: z.string().min(1).max(1_000),
  path: z.string().max(500).nullable(),
  line: z.number().int().positive().nullable(),
  column: z.number().int().positive().nullable(),
}).strict();

export const normalizedTechnicalRequestSchema = z.object({
  method: z.string().regex(/^[A-Z][A-Z0-9-]{1,15}$/).nullable(),
  url: z.string().max(8_000).nullable(),
  protocol: z.enum(["http", "https", "ws", "wss"]).nullable(),
  hostname: z.string().max(253).nullable(),
  path: z.string().max(4_000).nullable(),
  queryParameters: z.record(z.string().max(240), technicalScalarSchema),
  headers: z.record(z.string().max(240), z.string().max(20_000)),
  body: technicalJsonValueSchema,
  contentType: z.string().max(500).nullable(),
  fileReferences: z.array(z.string().max(1_000)).max(30),
  environmentVariables: z.array(z.string().max(240)).max(50),
  shell: z.enum(["posix", "powershell", "unknown"]).nullable(),
  lineContinuation: z.enum(["backslash", "backtick", "none", "unknown"]).nullable(),
  duplicateHeaders: z.array(z.string().max(240)).max(50),
}).strict();

export const normalizedTechnicalResponseSchema = z.object({
  statusCode: z.number().int().min(100).max(599).nullable(),
  statusText: z.string().max(500).nullable(),
  headers: z.record(z.string().max(240), z.string().max(20_000)),
  body: technicalJsonValueSchema,
  contentType: z.string().max(500).nullable(),
  requestId: z.string().max(500).nullable(),
  errorCode: z.string().max(500).nullable(),
  duplicateHeaders: z.array(z.string().max(240)).max(50),
}).strict();

export const normalizedTechnicalRepresentationSchema = z.object({
  kind: z.enum(["request", "response", "payload", "code", "log", "text", "unknown"]),
  request: normalizedTechnicalRequestSchema.nullable(),
  response: normalizedTechnicalResponseSchema.nullable(),
  payload: technicalJsonValueSchema,
  duplicateJsonKeys: z.array(z.string().max(240)).max(100),
  parserNotes: z.array(z.string().max(1_000)).max(50),
}).strict();

export const relatedTechnicalDocumentationSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  canonicalUrl: z.string().url().refine(
    (value) => value.startsWith("https://developers.deepgram.com/"),
    "Only official Deepgram developer documentation is accepted",
  ),
  whyRelevant: z.string().min(1).max(1_000),
  supportedClaim: z.string().min(1).max(1_000),
  retrievedAt: z.string().datetime().nullable(),
  verificationState: z.enum(["registry-verified", "live-retrieved", "curated-last-verified"]),
}).strict();

export const technicalSuggestedFixSchema = z.object({
  id: z.string().min(1).max(160),
  label: z.string().min(1).max(300),
  explanation: z.string().min(1).max(2_000),
  replacement: z.string().max(120_000).nullable(),
  source: z.enum(["deterministic", "ai-assisted"]),
}).strict();

export const generatedTechnicalVariantSchema = z.object({
  id: z.string().min(1).max(160),
  language: z.enum(["curl", "javascript", "typescript", "python", "raw-http"]),
  label: z.string().min(1).max(200),
  code: z.string().min(1).max(120_000),
  environmentVariables: z.array(z.string().max(240)).max(20),
  notes: z.array(z.string().max(1_000)).max(20),
}).strict();

export const technicalArtifactProvenanceSchema = z.object({
  source: z.literal("user-paste"),
  originalRetained: z.literal(false),
  persistedRepresentation: z.literal("redacted-only"),
  deterministicAnalysis: z.literal(true),
  executed: z.literal(false),
}).strict();

export const technicalArtifactSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1).max(200),
  sessionId: z.string().min(1).max(200).nullable(),
  artifactType: technicalArtifactTypeSchema,
  detectedLanguage: detectedTechnicalLanguageSchema,
  title: z.string().min(1).max(300),
  rawInput: z.null(),
  redactedInput: z.string().max(120_000),
  formattedInput: z.string().max(120_000),
  normalizedRepresentation: normalizedTechnicalRepresentationSchema,
  validationStatus: technicalValidationStatusSchema,
  validationErrors: z.array(technicalValidationIssueSchema).max(200),
  secretFindings: z.array(secretFindingSchema).max(100),
  extractedEndpoint: z.string().max(200).nullable(),
  extractedMethod: z.string().max(20).nullable(),
  extractedHeaders: z.record(z.string().max(240), z.string().max(20_000)),
  extractedQueryParameters: z.record(z.string().max(240), technicalScalarSchema),
  extractedBody: technicalJsonValueSchema,
  extractedModel: z.string().max(300).nullable(),
  extractedFeatures: z.array(z.string().max(240)).max(100),
  extractedStatusCode: z.number().int().min(100).max(599).nullable(),
  extractedErrorCode: z.string().max(500).nullable(),
  detectedProvider: z.enum(["deepgram", "other", "unknown"]),
  relatedDocumentation: z.array(relatedTechnicalDocumentationSchema).max(10),
  explanation: z.array(z.string().max(1_500)).max(50),
  suggestedFixes: z.array(technicalSuggestedFixSchema).max(50),
  generatedVariants: z.array(generatedTechnicalVariantSchema).max(10),
  observed: z.array(z.string().max(1_000)).max(100),
  inferred: z.array(z.string().max(1_000)).max(50),
  recommended: z.array(z.string().max(1_000)).max(50),
  takeaway: z.string().max(4_000),
  customerContext: z.string().max(4_000),
  includeInHandoff: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  includeInExport: z.boolean(),
  provenance: technicalArtifactProvenanceSchema,
  confidence: workbenchConfidenceSchema,
}).strict();

export const analyzeTechnicalArtifactInputSchema = z.object({
  input: z.string().min(1, "Paste a technical artifact first.").max(120_000),
  sessionId: z.string().min(1).max(200).nullable().optional(),
  artifactType: technicalArtifactTypeSchema.optional(),
  detectedLanguage: detectedTechnicalLanguageSchema.optional(),
  title: z.string().min(1).max(300).optional(),
  includeInExport: z.boolean().optional(),
  id: z.string().min(1).max(200).optional(),
  now: z.string().datetime().optional(),
}).strict();

export const artifactDetectionSchema = z.object({
  artifactType: technicalArtifactTypeSchema,
  detectedLanguage: detectedTechnicalLanguageSchema,
  confidence: workbenchConfidenceSchema,
  signals: z.array(z.string().max(300)).max(20),
}).strict();

export const apiLabWorkbenchHandoffSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.literal("payload-code-workbench"),
  artifactId: z.string().min(1).max(200),
  sourceDiagnosisId: z.string().min(1).max(200).nullable().default(null),
  endpointId: z.string().min(1).max(200),
  method: z.string().max(20),
  query: z.record(z.string().max(240), technicalScalarSchema),
  body: technicalJsonValueSchema,
  headers: z.record(z.string().max(240), z.string().max(1_000)),
  transferredFields: z.array(z.string().max(300)).max(200),
  notTransferred: z.array(z.string().max(1_000)).max(200),
  authentication: z.literal("server-placeholder-only"),
  demoModePreserved: z.literal(true),
  autoExecute: z.literal(false),
  requiresVisibleConfirmation: z.literal(true),
  href: z.string().max(1_000),
}).strict();

export const technicalArtifactSessionSchema = z.object({
  schemaVersion: z.literal(1),
  artifacts: z.array(technicalArtifactSchema).max(50),
}).strict();

export type TechnicalArtifactType = z.infer<typeof technicalArtifactTypeSchema>;
export type DetectedTechnicalLanguage = z.infer<typeof detectedTechnicalLanguageSchema>;
export type WorkbenchConfidence = z.infer<typeof workbenchConfidenceSchema>;
export type SecretFinding = z.infer<typeof secretFindingSchema>;
export type TechnicalValidationIssue = z.infer<typeof technicalValidationIssueSchema>;
export type NormalizedTechnicalRequest = z.infer<typeof normalizedTechnicalRequestSchema>;
export type NormalizedTechnicalResponse = z.infer<typeof normalizedTechnicalResponseSchema>;
export type NormalizedTechnicalRepresentation = z.infer<typeof normalizedTechnicalRepresentationSchema>;
export type RelatedTechnicalDocumentation = z.infer<typeof relatedTechnicalDocumentationSchema>;
export type GeneratedTechnicalVariant = z.infer<typeof generatedTechnicalVariantSchema>;
export type TechnicalArtifact = z.infer<typeof technicalArtifactSchema>;
export type AnalyzeTechnicalArtifactInput = z.infer<typeof analyzeTechnicalArtifactInputSchema>;
export type ArtifactDetection = z.infer<typeof artifactDetectionSchema>;
export type ApiLabWorkbenchHandoff = z.infer<typeof apiLabWorkbenchHandoffSchema>;
