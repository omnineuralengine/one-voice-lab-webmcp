import { z } from "zod";

import { technicalArtifactSchema } from "@/types/payload-code-workbench";

export const SDK_DOCTOR_SCHEMA_VERSION = 1 as const;
export const SDK_REGISTRY_PROTOCOL_VERSION = "deepgram-sdk-registry-v1" as const;

export const sdkDoctorLanguageSchema = z.enum([
  "javascript",
  "typescript",
  "python",
  "go",
  "dotnet",
  "java",
  "rust",
  "raw-http",
  "other",
  "unknown",
]);

export const sdkDoctorLanguageSelectionSchema = z.enum([
  "auto",
  ...sdkDoctorLanguageSchema.options,
]);

export const sdkDoctorConfidenceSchema = z.enum(["High", "Medium", "Low", "Unknown"]);

export const sdkDoctorRuntimeSchema = z.enum([
  "browser",
  "nodejs",
  "nextjs-client",
  "nextjs-server",
  "nextjs-route-handler",
  "vercel-function",
  "cloudflare-worker",
  "deno",
  "bun",
  "react-native",
  "python-sync",
  "python-async",
  "fastapi",
  "flask",
  "django",
  "go-service",
  "aspnet",
  "java-service",
  "spring",
  "rust-tokio",
  "cli",
  "container",
  "other",
  "unknown",
]);

export const sdkDoctorRuntimeSelectionSchema = z.enum(["auto", ...sdkDoctorRuntimeSchema.options]);

export const sdkDoctorProductSchema = z.enum([
  "listen-prerecorded",
  "listen-v1-streaming",
  "listen-v2-flux",
  "speak-rest",
  "speak-streaming",
  "voice-agent",
  "read-text-intelligence",
  "manage",
  "auth",
  "self-hosted-management",
  "unknown",
]);

export const sdkDoctorProductSelectionSchema = z.enum(["auto", ...sdkDoctorProductSchema.options]);

export const sdkDoctorDeploymentSchema = z.enum([
  "deepgram-hosted",
  "us-global",
  "eu-regional",
  "au-regional",
  "deepgram-dedicated",
  "self-hosted",
  "aws-sagemaker",
  "customer-proxy",
  "unknown",
]);

export const sdkDoctorDeploymentSelectionSchema = z.enum(["auto", ...sdkDoctorDeploymentSchema.options]);

export const sdkDoctorDesiredOutcomeSchema = z.enum([
  "fix-installed-version",
  "explain-error",
  "minimal-patch",
  "compare-current-stable",
  "plan-major-migration",
  "find-rest-fallback",
  "prepare-support-escalation",
  "local-validation-plan",
]);

export const sdkDoctorPackageManagerSchema = z.enum([
  "npm",
  "pnpm",
  "yarn",
  "bun",
  "pip",
  "poetry",
  "uv",
  "go-modules",
  "nuget",
  "maven",
  "gradle",
  "cargo",
  "unknown",
]);

export const sdkVersionSourceSchema = z.enum([
  "lockfile",
  "installed-package-output",
  "manifest",
  "user-selection",
  "code-pattern",
  "unknown",
]);

export const sdkVersionEvidenceSchema = z.object({
  id: z.string().min(1).max(160),
  packageName: z.string().min(1).max(240),
  version: z.string().min(1).max(160),
  normalizedVersion: z.string().max(160).nullable(),
  source: sdkVersionSourceSchema,
  sourceLabel: z.string().min(1).max(240),
  exact: z.boolean(),
  priority: z.number().int().min(1).max(5),
  observed: z.literal(true),
}).strict();

export const sdkDoctorEvidenceSchema = z.object({
  id: z.string().min(1).max(180),
  kind: z.enum(["observed", "inferred"]),
  category: z.enum([
    "code",
    "error",
    "dependency",
    "runtime",
    "endpoint",
    "authentication",
    "transport",
    "audio",
    "deployment",
    "behavior",
    "other",
  ]),
  label: z.string().min(1).max(300),
  value: z.string().min(1).max(4_000),
  sourceArtifactId: z.string().max(200).nullable(),
  sourceLabel: z.string().max(300).nullable(),
  line: z.number().int().positive().nullable(),
  safeForExport: z.boolean(),
}).strict();

export const sdkDoctorSourceSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(400),
  canonicalUrl: z.string().url().refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && (
        url.hostname === "developers.deepgram.com"
        || (url.hostname === "github.com" && url.pathname.startsWith("/deepgram/"))
      );
    } catch {
      return false;
    }
  }, "Only first-party Deepgram documentation and repositories are accepted"),
  authority: z.enum(["official-deepgram-docs", "official-deepgram-sdk"]),
  sourceType: z.enum(["api-reference", "guide", "feature-matrix", "migration-guide", "sdk-reference", "release", "repository", "cached-snapshot"]),
  supportsClaim: z.string().min(1).max(2_000),
  relevantToVersion: z.string().max(160).nullable(),
  retrievedAt: z.string().datetime().nullable(),
  lastVerifiedAt: z.string().datetime().nullable(),
  freshness: z.enum(["fresh", "stale", "unknown", "offline-cached"]),
  verificationState: z.enum(["live-retrieved", "registry-verified", "cached-fallback", "requires-verification"]),
}).strict();

export const sdkDiagnosisLayerSchema = z.enum([
  "syntax",
  "dependency",
  "sdk-version",
  "sdk-api-surface",
  "api-capability",
  "api-configuration",
  "authentication",
  "runtime",
  "framework",
  "networking",
  "cors-proxy",
  "websocket-lifecycle",
  "audio-transport",
  "deployment",
  "customer-environment",
  "deepgram-service",
  "unknown",
]);

export const sdkDiagnosisItemSchema = z.object({
  id: z.string().min(1).max(180),
  title: z.string().min(1).max(400),
  layer: sdkDiagnosisLayerSchema,
  severity: z.enum(["Blocking", "High", "Medium", "Low", "Informational"]),
  confidence: sdkDoctorConfidenceSchema,
  status: z.enum([
    "Confirmed",
    "Highly likely",
    "Possible",
    "Compatibility warning",
    "Requires more evidence",
    "Not reproduced",
    "Not a Deepgram-specific issue",
  ]),
  explanation: z.string().min(1).max(4_000),
  observedEvidence: z.array(z.string().min(1).max(180)).max(30),
  inferredEvidence: z.array(z.string().min(1).max(180)).max(30),
  officialSources: z.array(z.string().min(1).max(200)).max(20),
  affectedLines: z.array(z.number().int().positive()).max(50),
  suggestedRepairIds: z.array(z.string().min(1).max(180)).max(20),
  missingEvidence: z.array(z.string().min(1).max(180)).max(10),
  safeToStateAsFact: z.boolean(),
}).strict();

export const sdkMissingEvidenceSchema = z.object({
  id: z.string().min(1).max(180),
  label: z.string().min(1).max(400),
  whyItMatters: z.string().min(1).max(1_500),
  priority: z.number().int().min(1).max(5),
}).strict();

export const sdkValidationStepSchema = z.object({
  id: z.string().min(1).max(180),
  level: z.enum(["static-review", "local-project", "safe-deepgram-test"]),
  label: z.string().min(1).max(400),
  command: z.string().max(1_000).nullable(),
  rationale: z.string().min(1).max(1_500),
  safe: z.boolean(),
  executed: z.literal(false),
  requiresExplicitConfirmation: z.boolean(),
}).strict();

export const sdkGeneratedDiffSchema = z.object({
  id: z.string().min(1).max(180),
  repairId: z.string().min(1).max(180),
  language: sdkDoctorLanguageSchema,
  before: z.string().max(60_000),
  after: z.string().max(60_000),
  unifiedDiff: z.string().max(120_000),
  changedBlocks: z.array(z.string().min(1).max(2_000)).max(20),
  locallyValidated: z.literal(false),
}).strict();

export const sdkRepairSchema = z.object({
  id: z.string().min(1).max(180),
  mode: z.enum([
    "minimal-fix",
    "explain-only",
    "version-compatible-rewrite",
    "migration-plan",
    "direct-api-fallback",
    "runtime-architecture-fix",
    "support-escalation",
  ]),
  title: z.string().min(1).max(400),
  targetSdkVersion: z.string().max(160).nullable(),
  assumptions: z.array(z.string().min(1).max(1_500)).max(20),
  affectedEvidence: z.array(z.string().min(1).max(180)).max(30),
  sourceCitations: z.array(z.string().min(1).max(200)).max(20),
  beforeSnippet: z.string().max(60_000),
  afterSnippet: z.string().max(60_000),
  diffId: z.string().max(180).nullable(),
  explanation: z.string().min(1).max(4_000),
  securityImpact: z.string().min(1).max(2_000),
  compatibilityImpact: z.string().min(1).max(2_000),
  validationPlan: z.array(z.string().min(1).max(1_500)).max(20),
  rollbackNote: z.string().max(2_000).nullable(),
  confidence: sdkDoctorConfidenceSchema,
  locallyValidated: z.literal(false),
}).strict();

export const sdkDoctorEnvironmentSchema = z.object({
  runtime: sdkDoctorRuntimeSchema,
  framework: z.string().max(200).nullable(),
  operatingSystem: z.string().max(200).nullable(),
  packageManager: sdkDoctorPackageManagerSchema,
  deploymentTarget: sdkDoctorDeploymentSchema,
  endpointHost: z.string().max(253).nullable(),
  environmentNotesRedacted: z.string().max(12_000),
}).strict();

export const sdkDoctorFreshnessSchema = z.object({
  status: z.enum(["fresh", "stale", "unknown", "offline-cached", "no-sources"]),
  newestVerifiedAt: z.string().datetime().nullable(),
  oldestVerifiedAt: z.string().datetime().nullable(),
  warning: z.string().max(1_000).nullable(),
}).strict();

export const sdkDoctorProvenanceSchema = z.object({
  source: z.literal("payload-code-workbench"),
  rawSecretsRetained: z.literal(false),
  persistedRepresentation: z.literal("redacted-only"),
  deterministicAnalysis: z.literal(true),
  aiAssisted: z.literal(false),
  customerCodeExecuted: z.literal(false),
  networkCalled: z.literal(false),
  dependenciesInstalled: z.literal(false),
  generatedLocally: z.literal(true),
}).strict();

export const sdkDiagnosisSchema = z.object({
  schemaVersion: z.literal(SDK_DOCTOR_SCHEMA_VERSION),
  registryVersion: z.literal(SDK_REGISTRY_PROTOCOL_VERSION),
  id: z.string().min(1).max(200),
  sessionId: z.string().min(1).max(200).nullable(),
  sourceArtifactIds: z.array(z.string().min(1).max(200)).max(20),
  language: sdkDoctorLanguageSchema,
  languageConfidence: sdkDoctorConfidenceSchema,
  framework: z.string().max(200).nullable(),
  runtime: sdkDoctorRuntimeSchema,
  runtimeConfidence: sdkDoctorConfidenceSchema,
  operatingSystem: z.string().max(200).nullable(),
  packageManager: sdkDoctorPackageManagerSchema,
  packageName: z.string().max(240).nullable(),
  declaredSdkVersion: z.string().max(160).nullable(),
  resolvedSdkVersion: z.string().max(160).nullable(),
  versionSource: sdkVersionSourceSchema,
  versionEvidence: z.array(sdkVersionEvidenceSchema).max(30),
  targetSdkVersion: z.string().max(160).nullable(),
  sdkSupportStatus: z.enum(["official", "community-maintained", "unknown", "requires-verification"]),
  deepgramProduct: sdkDoctorProductSchema,
  apiVersion: z.string().max(80).nullable(),
  requestMode: z.enum(["rest", "websocket", "sdk", "mixed", "unknown"]),
  deploymentTarget: sdkDoctorDeploymentSchema,
  endpointHost: z.string().max(253).nullable(),
  desiredOutcome: sdkDoctorDesiredOutcomeSchema,
  expectedBehavior: z.string().max(12_000),
  observedBehavior: z.string().max(12_000),
  errorTextRedacted: z.string().max(40_000),
  stackTraceRedacted: z.string().max(60_000),
  codeRedacted: z.string().max(120_000),
  manifestRedacted: z.string().max(80_000),
  lockfileEvidence: z.array(sdkVersionEvidenceSchema).max(20),
  normalizedEnvironment: sdkDoctorEnvironmentSchema,
  extractedSymbols: z.array(z.string().max(240)).max(100),
  extractedMethods: z.array(z.string().max(240)).max(100),
  extractedImports: z.array(z.string().max(500)).max(100),
  extractedOptions: z.array(z.string().max(240)).max(100),
  extractedEvents: z.array(z.string().max(240)).max(100),
  extractedEndpoints: z.array(z.string().max(2_000)).max(30),
  extractedStatusCodes: z.array(z.number().int().min(100).max(599)).max(30),
  extractedRequestIds: z.array(z.string().max(500)).max(30),
  extractedWebSocketCodes: z.array(z.number().int().min(1000).max(4999)).max(30),
  extractedAudioConfiguration: z.record(z.string().max(120), z.string().max(1_000)),
  observedEvidence: z.array(sdkDoctorEvidenceSchema).max(150),
  inferredEvidence: z.array(sdkDoctorEvidenceSchema).max(100),
  diagnosisItems: z.array(sdkDiagnosisItemSchema).max(50),
  missingEvidence: z.array(sdkMissingEvidenceSchema).max(5),
  documentationSources: z.array(sdkDoctorSourceSchema).max(30),
  migrationSources: z.array(sdkDoctorSourceSchema).max(20),
  suggestedRepairs: z.array(sdkRepairSchema).max(20),
  generatedDiffs: z.array(sdkGeneratedDiffSchema).max(20),
  generatedValidationPlan: z.array(sdkValidationStepSchema).max(30),
  generatedCodexHandoff: z.string().max(80_000),
  supportEscalationSummary: z.string().max(40_000),
  confidence: sdkDoctorConfidenceSchema,
  status: z.enum(["evidence-needed", "diagnosed", "repair-proposed", "local-validation-pending", "escalation-ready"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  analyzedAt: z.string().datetime(),
  sourceFreshness: sdkDoctorFreshnessSchema,
  includeInSession: z.boolean(),
  includeInExport: z.boolean(),
  includeCodeInExport: z.boolean(),
  provenance: sdkDoctorProvenanceSchema,
}).strict();

export const sdkDoctorSelectionsSchema = z.object({
  language: sdkDoctorLanguageSelectionSchema.default("auto"),
  runtime: sdkDoctorRuntimeSelectionSchema.default("auto"),
  deepgramProduct: sdkDoctorProductSelectionSchema.default("auto"),
  deploymentTarget: sdkDoctorDeploymentSelectionSchema.default("auto"),
  desiredOutcome: sdkDoctorDesiredOutcomeSchema.default("fix-installed-version"),
  targetSdkVersion: z.string().max(160).nullable().optional(),
  installedVersion: z.string().max(160).nullable().optional(),
}).strict();

export const analyzeSdkDoctorInputSchema = z.object({
  id: z.string().min(1).max(200).optional(),
  sessionId: z.string().min(1).max(200).nullable().optional(),
  sourceArtifacts: z.array(technicalArtifactSchema).max(20).default([]),
  code: z.string().max(120_000).default(""),
  errorText: z.string().max(40_000).default(""),
  stackTrace: z.string().max(60_000).default(""),
  manifest: z.string().max(80_000).default(""),
  lockfile: z.string().max(100_000).default(""),
  installedPackageOutput: z.string().max(40_000).default(""),
  environment: z.string().max(12_000).default(""),
  expectedBehavior: z.string().max(12_000).default(""),
  observedBehavior: z.string().max(12_000).default(""),
  operatingSystem: z.string().max(200).nullable().optional(),
  framework: z.string().max(200).nullable().optional(),
  selections: sdkDoctorSelectionsSchema.default({
    language: "auto",
    runtime: "auto",
    deepgramProduct: "auto",
    deploymentTarget: "auto",
    desiredOutcome: "fix-installed-version",
  }),
  documentationSources: z.array(sdkDoctorSourceSchema).max(30).default([]),
  now: z.string().datetime().optional(),
  includeInSession: z.boolean().default(true),
  includeInExport: z.boolean().default(true),
  includeCodeInExport: z.boolean().default(false),
}).strict();

export const sdkDiagnosisSessionSchema = z.object({
  schemaVersion: z.literal(SDK_DOCTOR_SCHEMA_VERSION),
  diagnoses: z.array(sdkDiagnosisSchema).max(30),
}).strict();

export type SdkDoctorLanguage = z.infer<typeof sdkDoctorLanguageSchema>;
export type SdkDoctorRuntime = z.infer<typeof sdkDoctorRuntimeSchema>;
export type SdkDoctorProduct = z.infer<typeof sdkDoctorProductSchema>;
export type SdkDoctorDeployment = z.infer<typeof sdkDoctorDeploymentSchema>;
export type SdkDoctorConfidence = z.infer<typeof sdkDoctorConfidenceSchema>;
export type SdkDoctorPackageManager = z.infer<typeof sdkDoctorPackageManagerSchema>;
export type SdkVersionEvidence = z.infer<typeof sdkVersionEvidenceSchema>;
export type SdkDoctorEvidence = z.infer<typeof sdkDoctorEvidenceSchema>;
export type SdkDoctorSource = z.infer<typeof sdkDoctorSourceSchema>;
export type SdkDiagnosisItem = z.infer<typeof sdkDiagnosisItemSchema>;
export type SdkMissingEvidence = z.infer<typeof sdkMissingEvidenceSchema>;
export type SdkGeneratedDiff = z.infer<typeof sdkGeneratedDiffSchema>;
export type SdkRepair = z.infer<typeof sdkRepairSchema>;
export type SdkValidationStep = z.infer<typeof sdkValidationStepSchema>;
export type SdkDiagnosis = z.infer<typeof sdkDiagnosisSchema>;
export type AnalyzeSdkDoctorInput = z.input<typeof analyzeSdkDoctorInputSchema>;
export type ParsedAnalyzeSdkDoctorInput = z.output<typeof analyzeSdkDoctorInputSchema>;
