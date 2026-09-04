import { z } from "zod";

import { evaluationEvidenceBundleSchema } from "@/lib/evaluation/schema";

export const BENCHMARK_SCHEMA_VERSION = "one-benchmark/1.0.0" as const;
export const BENCHMARK_METHODOLOGY_VERSION = "one-benchmark-methodology/1.0.0" as const;
export const BENCHMARK_SUITE_VERSION = "one-benchmark-suite/1.0.0" as const;
export const BENCHMARK_CASE_VERSION = "one-benchmark-case/1.0.0" as const;
export const BENCHMARK_RUN_VERSION = "one-benchmark-run/1.0.0" as const;
export const BENCHMARK_MEASUREMENT_VERSION = "one-benchmark-measurement/1.0.0" as const;
export const BENCHMARK_JUDGMENT_VERSION = "one-benchmark-judgment/1.0.0" as const;
export const BENCHMARK_ARTIFACT_VERSION = "one-benchmark-artifact/1.0.0" as const;
export const BENCHMARK_ELIGIBILITY_VERSION = "one-benchmark-eligibility/1.0.0" as const;
export const BENCHMARK_SCORING_PROFILE_VERSION = "one-benchmark-scoring-profile/1.0.0" as const;
export const BENCHMARK_LEADERBOARD_VERSION = "one-benchmark-leaderboard/1.0.0" as const;
export const BENCHMARK_INTEGRITY_VERSION = "one-benchmark-integrity/1.0.0" as const;
export const BENCHMARK_PLAN_VERSION = "one-benchmark-plan/1.0.0" as const;
export const BENCHMARK_CANONICAL_JSON_VERSION = "one-canonical-json/1.0.0" as const;

export const BENCHMARK_MAX_CASES = 10;
export const BENCHMARK_MAX_PROVIDERS = 4;
export const BENCHMARK_MAX_REPETITIONS = 20;
export const BENCHMARK_MAX_FIXTURE_ATTEMPTS = 40;
export const BENCHMARK_MAX_LIVE_ATTEMPTS = 12;

export const SUPPORTED_BENCHMARK_SCHEMA_VERSIONS = Object.freeze([
  BENCHMARK_SCHEMA_VERSION,
  BENCHMARK_METHODOLOGY_VERSION,
  BENCHMARK_SUITE_VERSION,
  BENCHMARK_CASE_VERSION,
  BENCHMARK_RUN_VERSION,
  BENCHMARK_MEASUREMENT_VERSION,
  BENCHMARK_JUDGMENT_VERSION,
  BENCHMARK_ARTIFACT_VERSION,
  BENCHMARK_ELIGIBILITY_VERSION,
  BENCHMARK_SCORING_PROFILE_VERSION,
  BENCHMARK_LEADERBOARD_VERSION,
  BENCHMARK_INTEGRITY_VERSION,
  BENCHMARK_PLAN_VERSION,
] as const);

const stableIdSchema = z.string().trim().min(1).max(160).regex(/^[a-z0-9]+(?:[._:/-][a-z0-9]+)*$/i);
const semanticVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/);
const sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const safeTextSchema = z.string().trim().min(1).max(1_000);
const benchmarkConfigurationKeySchema = z.string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z][A-Za-z0-9._-]{0,79}$/, "Benchmark configuration keys must use the shared ASCII identifier domain.");
const forbiddenConfigurationKey = /(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|cookie|password|internal[_-]?url|raw.*payload)/i;
const crossRuntimeCanonicalNumberSchema = z.number().finite().refine((value) => {
  const magnitude = Math.abs(value);
  return magnitude === 0 || (magnitude >= 1e-6 && magnitude < 1e21);
}, "Benchmark configuration numbers must use the shared non-exponent canonical range: zero or an absolute value from 1e-6 (inclusive) to 1e21 (exclusive).");
const benchmarkConfigurationValueSchema = z.union([
  z.string().max(2_000),
  crossRuntimeCanonicalNumberSchema,
  z.boolean(),
  z.null(),
  z.array(z.union([z.string().max(2_000), crossRuntimeCanonicalNumberSchema, z.boolean(), z.null()])).max(40),
]);

export const benchmarkConfigurationSchema = z.record(benchmarkConfigurationKeySchema, benchmarkConfigurationValueSchema).superRefine((configuration, context) => {
  const keys = Object.keys(configuration);
  if (keys.length > 256) {
    context.addIssue({ code: "custom", message: "Benchmark configuration is limited to 256 keys." });
  }
  if (new TextEncoder().encode(JSON.stringify(configuration)).byteLength > 65_536) {
    context.addIssue({ code: "custom", message: "Benchmark configuration is limited to 65,536 UTF-8 JSON bytes." });
  }
  for (const key of keys) {
    if (forbiddenConfigurationKey.test(key)) {
      context.addIssue({ code: "custom", path: [key], message: "Benchmark configuration cannot contain credentials, cookies, tokens, internal URLs, or raw payloads." });
    }
  }
});

const benchmarkFiltersSchema = z.record(benchmarkConfigurationKeySchema, z.union([
  z.string().max(500),
  crossRuntimeCanonicalNumberSchema,
  z.boolean(),
  z.array(z.string().max(160)).max(50),
])).superRefine((filters, context) => {
  const keys = Object.keys(filters);
  if (keys.length > 128) context.addIssue({ code: "custom", message: "Benchmark filters are limited to 128 keys." });
  if (new TextEncoder().encode(JSON.stringify(filters)).byteLength > 32_768) {
    context.addIssue({ code: "custom", message: "Benchmark filters are limited to 32,768 UTF-8 JSON bytes." });
  }
  keys.forEach((key) => {
    if (forbiddenConfigurationKey.test(key)) {
      context.addIssue({ code: "custom", path: [key], message: "Benchmark filters cannot contain credentials, cookies, tokens, internal URLs, or raw payloads." });
    }
  });
});

const publicHttpsUrlSchema = z.string().url().max(1_000).refine((value) => {
  const parsed = new URL(value);
  return parsed.protocol === "https:" && parsed.username === "" && parsed.password === "";
}, "Provider evidence sources must use public HTTPS URLs without embedded credentials.");

export const benchmarkProviderIdSchema = stableIdSchema;
export const benchmarkModalitySchema = z.enum(["stt", "tts", "realtime"]);
export const benchmarkCategoryIdSchema = z.enum(["stt", "tts", "realtime", "provider-evidence"]);
export const benchmarkVisibilityStateSchema = z.enum(["private", "team", "unlisted", "public-candidate", "public-verified"]);
export const benchmarkPublicationStateSchema = z.enum(["draft", "review", "approved", "published", "retracted"]);
export const benchmarkRetentionStateSchema = z.enum(["ephemeral", "session", "bounded", "persistent"]);
export const benchmarkIntegrityStateSchema = z.enum([
  "unsigned",
  "hash-verified",
  "signature-verified",
  "verification-failed",
  "unsupported-version",
]);
export const benchmarkStatisticAvailabilitySchema = z.enum(["available", "insufficient-samples"]);
export const benchmarkMeasurementPointSchema = z.enum(["one-server", "one-browser", "provider-reported", "derived"]);
export const benchmarkMeasurementClockSchema = z.enum(["server-monotonic", "server-wall", "browser-monotonic", "provider", "not-applicable"]);
export const benchmarkMeasurementObservationSchema = z.enum(["observed", "derived", "provider-reported", "synthetic", "unavailable"]);
export const benchmarkMeasurementSourceSchema = z.enum(["one-observed", "provider-reported", "derived", "fixture", "imported"]);
export const benchmarkRunStatusSchema = z.enum([
  "draft",
  "validating",
  "queued",
  "admitted",
  "running",
  "processing",
  "completed",
  "partially-completed",
  "failed",
  "cancelled",
  "rate-limited",
  "provider-disabled",
  "insufficient-evidence",
  "verification-failed",
]);

export const benchmarkProviderMetadataSnapshotSchema = z.object({
  displayName: z.string().trim().min(1).max(160),
  readiness: z.enum(["listed", "configured", "adapter-backed", "live-enabled"]),
  adapterVersion: z.string().trim().min(1).max(160),
  modelVersion: z.string().trim().min(1).max(160).nullable(),
  capability: benchmarkModalitySchema,
}).strict();

export const benchmarkComparablePopulationSchema = z.object({
  category: benchmarkModalitySchema,
  suiteRef: z.object({ id: stableIdSchema, version: semanticVersionSchema }).strict(),
  caseRef: z.object({ id: stableIdSchema, version: semanticVersionSchema, inputHash: sha256Schema }).strict(),
  methodologyRef: z.object({ id: stableIdSchema, version: semanticVersionSchema }).strict(),
  methodologyVersion: z.string().min(1).max(160),
  metricVersion: z.string().min(1).max(160),
  executionMode: z.enum(["fixture", "protected-live", "local-live"]),
  evaluationMode: z.enum(["standardized", "provider-optimized"]).nullable(),
  environment: z.string().trim().min(1).max(120),
  deployment: z.string().trim().min(1).max(160),
  language: z.string().trim().min(1).max(80),
  region: z.string().trim().min(1).max(120).nullable(),
  transport: z.string().trim().min(1).max(120),
  codec: z.string().trim().min(1).max(120),
  sampleRateHz: z.number().int().positive().nullable(),
  channels: z.number().int().positive().max(32).nullable(),
  thermalState: z.enum(["cold", "warm", "unknown"]),
}).strict().superRefine((population, context) => {
  if (population.methodologyVersion !== population.methodologyRef.version) {
    context.addIssue({ code: "custom", path: ["methodologyVersion"], message: "Comparable populations must disclose the exact referenced methodology version." });
  }
});

export const benchmarkCategorySchema = z.object({
  id: benchmarkCategoryIdSchema,
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  inputKinds: z.array(z.enum(["text", "audio", "event-stream"])).min(1).max(3),
  objectiveMetricFamilies: z.array(stableIdSchema).max(30),
  implementation: z.enum(["implemented", "transitional", "future"]),
}).strict();

export const benchmarkMethodologySchema = z.object({
  schemaVersion: z.literal(BENCHMARK_METHODOLOGY_VERSION),
  methodologyId: stableIdSchema,
  version: semanticVersionSchema,
  status: z.enum(["draft", "approved", "published", "superseded", "deprecated"]),
  category: benchmarkCategoryIdSchema,
  supportedModalities: z.array(benchmarkModalitySchema).max(3),
  name: z.string().min(1).max(160),
  objective: z.string().min(1).max(1_000),
  objectiveMetricIds: z.array(stableIdSchema).max(50),
  humanDimensions: z.array(stableIdSchema).max(30),
  automatedJudgmentPolicy: z.enum(["disabled", "optional-isolated"]),
  compositeScoreAllowed: z.literal(false),
  procedure: z.array(safeTextSchema).min(1).max(30),
  requiredInputs: z.array(stableIdSchema).min(1).max(30),
  requiredConfiguration: z.array(stableIdSchema).min(1).max(50),
  requiredEnvironment: z.array(stableIdSchema).min(1).max(30),
  inclusionCriteria: z.array(safeTextSchema).min(1).max(30),
  exclusionCriteria: z.array(safeTextSchema).min(1).max(30),
  outlierPolicy: safeTextSchema,
  scoringPolicy: safeTextSchema,
  minimumSamples: z.number().int().positive().max(10_000),
  publicationPolicy: safeTextSchema,
  publicationDate: z.string().date().nullable(),
  supersedes: z.object({ id: stableIdSchema, version: semanticVersionSchema }).strict().nullable(),
  limitations: z.array(safeTextSchema).min(1).max(30),
}).strict().superRefine((methodology, context) => {
  if (methodology.category === "provider-evidence" && methodology.supportedModalities.length !== 0) {
    context.addIssue({ code: "custom", path: ["supportedModalities"], message: "Provider claim evidence is modality-neutral and cannot masquerade as measured modality evidence." });
  }
  if (methodology.category !== "provider-evidence" && !methodology.supportedModalities.includes(methodology.category)) {
    context.addIssue({ code: "custom", path: ["supportedModalities"], message: "A measured methodology must include its category as a supported modality." });
  }
});

export const benchmarkCaseSchema = z.object({
  schemaVersion: z.literal(BENCHMARK_CASE_VERSION),
  caseId: stableIdSchema,
  version: semanticVersionSchema,
  category: benchmarkCategoryIdSchema,
  suiteRef: z.object({ id: stableIdSchema, version: semanticVersionSchema }).strict(),
  name: z.string().min(1).max(160),
  scenario: z.object({
    id: stableIdSchema,
    version: semanticVersionSchema,
    inputType: z.enum(["text", "audio", "event-stream"]),
    inputHash: sha256Schema,
    canonicalInputIncluded: z.boolean(),
  }).strict(),
  language: z.string().trim().min(1).max(80),
  domain: stableIdSchema,
  expectedSize: z.object({ value: z.number().finite().nonnegative(), unit: z.enum(["characters", "seconds", "events"]) }).strict(),
  provenance: safeTextSchema,
  privacy: z.enum(["public-safe", "synthetic", "private", "restricted"]),
  integrity: z.object({ inputHash: sha256Schema, sourceVerified: z.boolean() }).strict(),
  tags: z.array(stableIdSchema).max(30),
  limitations: z.array(safeTextSchema).min(1).max(30),
}).strict().superRefine((benchmarkCase, context) => {
  if (benchmarkCase.integrity.inputHash !== benchmarkCase.scenario.inputHash) {
    context.addIssue({ code: "custom", path: ["integrity", "inputHash"], message: "Case integrity must reference the canonical scenario input hash." });
  }
  const expected = benchmarkCase.category === "tts"
    ? { inputType: "text", unit: "characters" }
    : benchmarkCase.category === "stt"
      ? { inputType: "audio", unit: "seconds" }
      : benchmarkCase.category === "provider-evidence"
        ? { inputType: "text", unit: "characters" }
        : null;
  if (expected && (benchmarkCase.scenario.inputType !== expected.inputType || benchmarkCase.expectedSize.unit !== expected.unit)) {
    context.addIssue({ code: "custom", path: ["scenario", "inputType"], message: "Case input type and expected-size unit must match its benchmark category." });
  }
  if (benchmarkCase.category === "realtime"
    && !((benchmarkCase.scenario.inputType === "audio" && benchmarkCase.expectedSize.unit === "seconds")
      || (benchmarkCase.scenario.inputType === "event-stream" && benchmarkCase.expectedSize.unit === "events"))) {
    context.addIssue({ code: "custom", path: ["scenario", "inputType"], message: "Realtime cases require audio/seconds or event-stream/events input metadata." });
  }
});

export const benchmarkSuiteSchema = z.object({
  schemaVersion: z.literal(BENCHMARK_SUITE_VERSION),
  suiteId: stableIdSchema,
  version: semanticVersionSchema,
  category: benchmarkCategoryIdSchema,
  modality: benchmarkModalitySchema.nullable(),
  name: z.string().min(1).max(160),
  description: safeTextSchema,
  methodology: z.object({ id: stableIdSchema, version: semanticVersionSchema }).strict(),
  cases: z.array(z.object({ id: stableIdSchema, version: semanticVersionSchema }).strict()).min(1).max(500),
  repetitions: z.object({ minimum: z.number().int().positive().max(100), maximum: z.number().int().positive().max(100) }).strict()
    .refine((value) => value.maximum >= value.minimum, { message: "Maximum repetitions must not be below the minimum." }),
  visibility: benchmarkVisibilityStateSchema,
  publication: benchmarkPublicationStateSchema,
  retention: benchmarkRetentionStateSchema,
  sponsorshipDisclosure: z.string().max(300).nullable(),
  language: z.string().trim().min(1).max(80),
  domain: stableIdSchema,
  dataset: z.object({
    version: semanticVersionSchema,
    license: z.string().trim().min(1).max(160),
    provenance: safeTextSchema,
    inputHashes: z.array(sha256Schema).min(1).max(500),
  }).strict(),
  privacy: z.enum(["public-safe", "synthetic", "private", "restricted"]),
  expectedOutput: z.object({ kind: z.enum(["audio", "transcript", "event-stream", "provider-claim"]), format: z.string().min(1).max(160), required: z.boolean() }).strict(),
  publicationEligibility: z.enum(["ineligible", "review-required", "eligible"]),
  deprecatedAt: z.string().datetime().nullable(),
  supersededBy: z.object({ id: stableIdSchema, version: semanticVersionSchema }).strict().nullable(),
}).strict().superRefine((suite, context) => {
  if (suite.category !== "provider-evidence" && suite.category !== suite.modality) {
    context.addIssue({ code: "custom", path: ["modality"], message: "Measured suite category and modality must match." });
  }
  if (suite.category === "provider-evidence" && (suite.modality !== null || suite.expectedOutput.kind !== "provider-claim" || suite.publicationEligibility !== "ineligible")) {
    context.addIssue({ code: "custom", path: ["expectedOutput"], message: "Provider claim suites cannot be ranking-eligible measured suites." });
  }
  const expectedOutput = suite.modality === "tts" ? "audio" : suite.modality === "stt" ? "transcript" : suite.modality === "realtime" ? "event-stream" : null;
  if (expectedOutput && suite.expectedOutput.kind !== expectedOutput) {
    context.addIssue({ code: "custom", path: ["expectedOutput", "kind"], message: "Suite output kind must match its measured modality." });
  }
});

export const benchmarkArtifactReferenceSchema = z.object({
  schemaVersion: z.literal(BENCHMARK_ARTIFACT_VERSION),
  artifactId: stableIdSchema,
  kind: z.enum(["audio", "transcript", "trace", "evidence-bundle", "report"]),
  reference: z.string().regex(/^(?:ephemeral|fixture|repository|object):[A-Za-z0-9._:/-]{1,400}$/),
  contentHash: sha256Schema,
  mimeType: z.string().regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/).nullable(),
  byteSize: z.number().int().nonnegative().nullable(),
  retention: benchmarkRetentionStateSchema,
  visibility: benchmarkVisibilityStateSchema,
  provenance: safeTextSchema,
  ownership: z.enum(["one", "user", "provider", "third-party"]),
  publicationPolicy: z.enum(["never", "explicit-consent", "eligible-review", "published"]),
  expiresAt: z.string().datetime().nullable(),
}).strict().superRefine((artifact, context) => {
  if (artifact.retention === "bounded" && artifact.expiresAt === null) {
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "Bounded artifacts require an expiry timestamp." });
  }
  if (artifact.retention === "persistent" && artifact.expiresAt !== null) {
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "Persistent artifacts cannot carry an expiry timestamp." });
  }
});

export const benchmarkMeasurementSchema = z.object({
  schemaVersion: z.literal(BENCHMARK_MEASUREMENT_VERSION),
  evidenceCategory: z.literal("objective"),
  measurementId: stableIdSchema,
  runId: z.string().uuid(),
  providerId: benchmarkProviderIdSchema,
  model: stableIdSchema,
  voice: stableIdSchema.nullable(),
  configurationHash: sha256Schema,
  metricId: stableIdSchema,
  metricVersion: z.string().min(1).max(160),
  value: z.number().finite().nullable(),
  unit: z.string().min(1).max(80),
  availability: z.enum(["measured", "estimated", "unavailable"]),
  synthetic: z.boolean(),
  measuredAt: z.string().datetime(),
  method: z.string().trim().min(1).max(160),
  precision: z.number().finite().nonnegative().nullable(),
  sampleCount: z.number().int().positive().max(1_000_000),
  source: benchmarkMeasurementSourceSchema,
  confidence: z.number().finite().min(0).max(1).nullable(),
  provenance: z.object({
    measurementPoint: benchmarkMeasurementPointSchema,
    clock: benchmarkMeasurementClockSchema,
    observation: benchmarkMeasurementObservationSchema,
    description: z.string().min(1).max(500),
    sourceSchemaVersion: z.string().min(1).max(160),
  }).strict(),
}).strict().superRefine((measurement, context) => {
  const unavailable = measurement.availability === "unavailable";
  if (unavailable !== (measurement.value === null)) {
    context.addIssue({ code: "custom", path: ["value"], message: "Unavailable measurements must have a null value, and available measurements must have a value." });
  }
  if (unavailable && (!measurement.synthetic && measurement.provenance.observation !== "unavailable" || measurement.provenance.clock !== "not-applicable")) {
    context.addIssue({ code: "custom", path: ["provenance"], message: "Unavailable non-synthetic measurements require unavailable observation provenance and all unavailable measurements require a not-applicable clock." });
  }
  if (!unavailable && measurement.provenance.observation === "unavailable") {
    context.addIssue({ code: "custom", path: ["provenance", "observation"], message: "Available measurements cannot use unavailable observation provenance." });
  }
  if (measurement.synthetic) {
    if (measurement.source !== "fixture" || measurement.provenance.observation !== "synthetic") {
      context.addIssue({ code: "custom", path: ["synthetic"], message: "Synthetic measurements require fixture source and synthetic observation provenance." });
    }
    return;
  }
  if (measurement.source === "fixture" || measurement.provenance.observation === "synthetic") {
    context.addIssue({ code: "custom", path: ["synthetic"], message: "Fixture or synthetic provenance cannot be labeled as observed evidence." });
  }
  const observedAtOne = ["one-server", "one-browser"].includes(measurement.provenance.measurementPoint);
  const expectedObservation = measurement.provenance.measurementPoint === "provider-reported"
    ? "provider-reported"
    : measurement.provenance.measurementPoint === "derived"
      ? "derived"
      : "observed";
  const expectedSource = measurement.provenance.measurementPoint === "provider-reported"
    ? "provider-reported"
    : measurement.provenance.measurementPoint === "derived"
      ? "derived"
      : "one-observed";
  const clockMatchesPoint = measurement.provenance.measurementPoint === "one-server"
    ? ["server-monotonic", "server-wall"].includes(measurement.provenance.clock)
    : measurement.provenance.measurementPoint === "one-browser"
      ? measurement.provenance.clock === "browser-monotonic"
      : measurement.provenance.measurementPoint === "provider-reported"
        ? measurement.provenance.clock === "provider"
        : ["server-monotonic", "server-wall", "not-applicable"].includes(measurement.provenance.clock);
  if (!unavailable && measurement.provenance.observation !== expectedObservation) {
    context.addIssue({ code: "custom", path: ["provenance", "observation"], message: "Measurement observation class must agree with its measurement point." });
  }
  if (measurement.source !== "imported" && measurement.source !== expectedSource) {
    context.addIssue({ code: "custom", path: ["source"], message: "Measurement source must agree with its measurement point." });
  }
  if (!unavailable && !clockMatchesPoint) {
    context.addIssue({ code: "custom", path: ["provenance", "clock"], message: "Measurement clock must agree with its measurement point." });
  }
  if (measurement.source === "one-observed" && !observedAtOne) {
    context.addIssue({ code: "custom", path: ["source"], message: "ONE-observed measurements require a ONE server or browser measurement point." });
  }
});

export const benchmarkHumanJudgmentSchema = z.object({
  schemaVersion: z.literal(BENCHMARK_JUDGMENT_VERSION),
  evidenceCategory: z.literal("human"),
  judgmentClass: z.literal("human"),
  judgmentId: stableIdSchema,
  runId: z.string().uuid(),
  providerId: benchmarkProviderIdSchema,
  model: stableIdSchema,
  voice: stableIdSchema.nullable(),
  configurationHash: sha256Schema,
  dimension: stableIdSchema,
  value: z.union([z.number().finite(), z.boolean(), z.string().trim().min(1).max(500)]),
  ratedAt: z.string().datetime(),
  ratedBeforeReveal: z.boolean(),
  evaluator: z.object({ class: z.literal("human"), anonymous: z.boolean() }).strict(),
  rubricVersion: z.string().min(1).max(160),
  promptVersion: z.null(),
  confidence: z.number().finite().min(0).max(1).nullable(),
  externalFramework: z.null(),
  provenance: z.string().min(1).max(500),
}).strict();

export const benchmarkAutomatedJudgmentSchema = z.object({
  schemaVersion: z.literal(BENCHMARK_JUDGMENT_VERSION),
  evidenceCategory: z.literal("automated"),
  judgmentClass: z.enum(["automated-model", "external-framework"]),
  judgmentId: stableIdSchema,
  runId: z.string().uuid(),
  providerId: benchmarkProviderIdSchema,
  model: stableIdSchema,
  voice: stableIdSchema.nullable(),
  configurationHash: sha256Schema,
  dimension: stableIdSchema,
  value: z.union([z.number().finite(), z.boolean(), z.string().trim().min(1).max(500)]),
  judgedAt: z.string().datetime(),
  judge: z.object({
    framework: stableIdSchema,
    frameworkVersion: z.string().min(1).max(120),
    model: stableIdSchema,
    configurationHash: sha256Schema,
  }).strict(),
  evaluator: z.object({ class: z.literal("automated"), anonymous: z.literal(false) }).strict(),
  rubricVersion: z.string().min(1).max(160),
  promptVersion: z.string().min(1).max(160),
  confidence: z.number().finite().min(0).max(1).nullable(),
  externalFramework: z.object({ name: stableIdSchema, version: z.string().min(1).max(120) }).strict().nullable(),
  provenance: z.string().min(1).max(500),
}).strict().superRefine((judgment, context) => {
  if ((judgment.judgmentClass === "external-framework") !== (judgment.externalFramework !== null)) {
    context.addIssue({ code: "custom", path: ["externalFramework"], message: "External-framework judgments require attributable framework metadata; automated-model judgments must remain distinct." });
  }
  if (judgment.judgmentClass === "external-framework" && judgment.externalFramework
    && (judgment.judge.framework !== judgment.externalFramework.name
      || judgment.judge.frameworkVersion !== judgment.externalFramework.version)) {
    context.addIssue({ code: "custom", path: ["externalFramework"], message: "External-framework identity and version must exactly match the disclosed judge framework." });
  }
});

export const benchmarkJudgmentSchema = z.discriminatedUnion("evidenceCategory", [
  benchmarkHumanJudgmentSchema,
  benchmarkAutomatedJudgmentSchema,
]);

export const benchmarkProviderClaimSchema = z.object({
  schemaVersion: z.literal(BENCHMARK_MEASUREMENT_VERSION),
  evidenceCategory: z.literal("provider-documented-claim"),
  claimId: stableIdSchema,
  providerId: benchmarkProviderIdSchema,
  claim: safeTextSchema,
  scope: z.enum(["capability", "model", "voice", "pricing", "availability", "developer-experience"]),
  sourceUrl: publicHttpsUrlSchema,
  sourceTitle: z.string().min(1).max(300),
  lastVerifiedAt: z.string().datetime(),
  applicability: z.object({ validFrom: z.string().datetime(), validUntil: z.string().datetime().nullable() }).strict(),
  status: z.enum(["documented", "repository-verified", "unverified", "deprecated", "conflicting"]),
  provenance: safeTextSchema,
  rankEligible: z.literal(false),
}).strict().superRefine((claim, context) => {
  if (claim.applicability.validUntil && Date.parse(claim.applicability.validUntil) < Date.parse(claim.applicability.validFrom)) {
    context.addIssue({ code: "custom", path: ["applicability", "validUntil"], message: "Provider claim applicability cannot end before it begins." });
  }
});

export const benchmarkExclusionSchema = z.object({
  schemaVersion: z.literal(BENCHMARK_ELIGIBILITY_VERSION),
  code: z.enum([
    "private-visibility",
    "publication-consent-missing",
    "ephemeral-retention",
    "synthetic-fixture",
    "insufficient-samples",
    "incomparable-configuration",
    "failed-run",
    "unsupported-version",
    "manual-review-required",
    "stale-evidence",
    "freshness-unverified",
  ]),
  scope: z.enum(["publication", "ranking", "both"]),
  detail: z.string().min(1).max(500),
}).strict();

export const benchmarkEligibilitySchema = z.object({
  schemaVersion: z.literal(BENCHMARK_ELIGIBILITY_VERSION),
  publicEligible: z.boolean(),
  rankingEligible: z.boolean(),
  evaluatedAt: z.string().datetime(),
  exclusions: z.array(benchmarkExclusionSchema).max(30),
}).strict().superRefine((eligibility, context) => {
  if ((!eligibility.publicEligible || !eligibility.rankingEligible) && eligibility.exclusions.length === 0) {
    context.addIssue({ code: "custom", path: ["exclusions"], message: "Ineligible evidence requires at least one structured exclusion." });
  }
  const publicationExclusions = eligibility.exclusions.some((exclusion) => exclusion.scope === "publication" || exclusion.scope === "both");
  const rankingExclusions = eligibility.exclusions.some((exclusion) => exclusion.scope === "ranking" || exclusion.scope === "both");
  if (eligibility.publicEligible === publicationExclusions) {
    context.addIssue({
      code: "custom",
      path: ["publicEligible"],
      message: "Public eligibility must be false exactly when a publication-scoped exclusion exists.",
    });
  }
  if (eligibility.rankingEligible === rankingExclusions) {
    context.addIssue({
      code: "custom",
      path: ["rankingEligible"],
      message: "Ranking eligibility must be false exactly when a ranking-scoped exclusion exists.",
    });
  }
});

export const benchmarkIntegritySchema = z.object({
  schemaVersion: z.literal(BENCHMARK_INTEGRITY_VERSION),
  state: benchmarkIntegrityStateSchema,
  algorithm: z.literal("sha256"),
  canonicalization: z.literal(BENCHMARK_CANONICAL_JSON_VERSION),
  payloadSchemaVersion: z.string().min(1).max(160),
  digest: sha256Schema.nullable(),
  checkedAt: z.string().datetime().nullable(),
  detail: z.string().min(1).max(500),
}).strict().superRefine((integrity, context) => {
  if (["hash-verified", "signature-verified"].includes(integrity.state) && (integrity.digest === null || integrity.checkedAt === null)) {
    context.addIssue({ code: "custom", path: ["digest"], message: "Verified integrity states require a digest and verification timestamp." });
  }
  if (integrity.state === "unsigned" && integrity.digest !== null) {
    context.addIssue({ code: "custom", path: ["digest"], message: "Unsigned integrity state cannot carry a verified digest." });
  }
});

function canonicalShallowRecord(value: Record<string, unknown>): string {
  return JSON.stringify(Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]])));
}

function terminalEvaluationStatus(providerResults: readonly { status: string }[]) {
  const completed = providerResults.filter((result) => result.status === "complete").length;
  if (completed === providerResults.length) return "completed" as const;
  if (completed > 0) return "partially-completed" as const;
  if (providerResults.every((result) => result.status === "cancelled")) return "cancelled" as const;
  return "failed" as const;
}

export const benchmarkRunSchema = z.object({
  schemaVersion: z.literal(BENCHMARK_RUN_VERSION),
  runId: z.string().uuid(),
  evaluationId: z.string().uuid(),
  category: benchmarkCategoryIdSchema,
  status: benchmarkRunStatusSchema,
  suiteRef: z.object({ id: stableIdSchema, version: semanticVersionSchema }).strict(),
  methodologyRef: z.object({ id: stableIdSchema, version: semanticVersionSchema }).strict(),
  caseRef: z.object({ id: stableIdSchema, version: semanticVersionSchema, inputHash: sha256Schema }).strict(),
  methodologyVersion: z.string().min(1).max(160),
  metricVersion: z.string().min(1).max(160),
  recordedAt: z.string().datetime(),
  executionMode: z.enum(["fixture", "protected-live", "local-live"]),
  evaluationMode: z.enum(["standardized", "provider-optimized"]).nullable(),
  initiatedBy: z.object({ class: z.enum(["human", "agent", "automation", "system"]), subjectId: stableIdSchema.nullable() }).strict(),
  trustTier: z.enum(["guest", "verified", "trusted-builder", "partner-researcher", "admin", "local", "unknown"]),
  runtime: z.object({ environment: z.string().min(1).max(120), deployment: z.string().min(1).max(160), region: z.string().min(1).max(120).nullable() }).strict(),
  timestamps: z.object({ queuedAt: z.string().datetime().nullable(), startedAt: z.string().datetime().nullable(), completedAt: z.string().datetime().nullable() }).strict(),
  failure: z.object({ code: stableIdSchema, message: z.string().min(1).max(500), providerId: benchmarkProviderIdSchema.nullable() }).strict().nullable(),
  participants: z.array(z.object({
    providerId: benchmarkProviderIdSchema,
    providerMetadataSnapshot: benchmarkProviderMetadataSnapshotSchema,
    modelId: stableIdSchema,
    voiceId: stableIdSchema.nullable(),
    configuration: benchmarkConfigurationSchema,
    configurationHash: sha256Schema,
    region: z.string().min(1).max(120).nullable(),
    transport: z.string().min(1).max(120),
    codec: z.string().min(1).max(120),
    sampleRateHz: z.number().int().positive().nullable(),
    channels: z.number().int().positive().max(32).nullable(),
    thermalState: z.enum(["cold", "warm", "unknown"]),
  }).strict()).min(1).max(BENCHMARK_MAX_PROVIDERS).superRefine((participants, context) => {
    const lanes = participants.map((participant) => `${participant.providerId}\u0000${participant.modelId}\u0000${participant.voiceId ?? ""}\u0000${participant.configurationHash}`);
    if (new Set(lanes).size !== lanes.length) context.addIssue({ code: "custom", message: "Benchmark run participants must be exact, unique configuration lanes." });
  }),
  observation: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("evaluation-evidence-bundle"), bundle: evaluationEvidenceBundleSchema }).strict(),
    z.object({
      kind: z.literal("future-observation-reference"),
      sourceSchemaVersion: z.string().min(1).max(160),
      reference: z.string().regex(/^(?:ephemeral|fixture|repository|object):[A-Za-z0-9._:/-]{1,400}$/),
      contentHash: sha256Schema,
    }).strict(),
  ]),
}).strict().superRefine((run, context) => {
  if (run.observation.kind === "evaluation-evidence-bundle" && (run.runId !== run.observation.bundle.runId || run.evaluationId !== run.observation.bundle.evaluationId)) {
    context.addIssue({ code: "custom", path: ["observation"], message: "The atomic observation identifiers must match the benchmark run." });
  }
  if (run.observation.kind === "evaluation-evidence-bundle" && run.category !== "tts") {
    context.addIssue({ code: "custom", path: ["observation"], message: "EvaluationEvidenceBundle observations are the existing TTS bridge and cannot label STT or realtime evidence." });
  }
  if (run.observation.kind === "evaluation-evidence-bundle") {
    const bundle = run.observation.bundle;
    if (run.evaluationMode !== bundle.evaluationMode) {
      context.addIssue({ code: "custom", path: ["evaluationMode"], message: "Benchmark comparison mode must agree with the atomic observation." });
    }
    if (run.status !== terminalEvaluationStatus(bundle.providerResults)) {
      context.addIssue({ code: "custom", path: ["status"], message: "Benchmark run status must agree with the atomic provider-lane observation." });
    }
    if (run.recordedAt !== bundle.exportedAt
      || run.caseRef.id !== bundle.scenario.id
      || run.caseRef.version !== bundle.scenario.version
      || run.caseRef.inputHash !== bundle.scenario.inputHash) {
      context.addIssue({ code: "custom", path: ["observation"], message: "Benchmark run timestamps and case references must agree with the atomic observation." });
    }
    if (bundle.providerResults.some((provider) => provider.environment !== run.executionMode)
      || run.runtime.environment !== run.executionMode) {
      context.addIssue({ code: "custom", path: ["executionMode"], message: "Benchmark execution mode and runtime must agree with every observed provider lane." });
    }
    const observedLanes = bundle.providerResults.map((provider) => canonicalShallowRecord({
      adapterVersion: provider.adapterVersion,
      configuration: canonicalShallowRecord({
        comparisonMode: provider.providerSpecificConfiguration.comparisonMode ?? null,
        ...provider.providerSpecificConfiguration,
      }),
      modelId: provider.model,
      providerId: provider.provider,
      region: provider.region,
      voiceId: provider.voice,
    })).sort();
    const participantLanes = run.participants.map((participant) => canonicalShallowRecord({
      adapterVersion: participant.providerMetadataSnapshot.adapterVersion,
      configuration: canonicalShallowRecord(participant.configuration),
      modelId: participant.modelId,
      providerId: participant.providerId,
      region: participant.region,
      voiceId: participant.voiceId,
    })).sort();
    if (JSON.stringify(observedLanes) !== JSON.stringify(participantLanes)) {
      context.addIssue({ code: "custom", path: ["participants"], message: "Benchmark participants must exactly match the provider, model, voice, configuration, adapter, and region lanes in the atomic observation." });
    }
  }
  if (run.category !== "provider-evidence" && run.evaluationMode === null) {
    context.addIssue({ code: "custom", path: ["evaluationMode"], message: "Measured STT, TTS, and realtime runs must disclose standardized or provider-optimized comparison mode." });
  }
  if (run.methodologyVersion !== run.methodologyRef.version) {
    context.addIssue({ code: "custom", path: ["methodologyVersion"], message: "Run methodology version must match the exact methodology reference." });
  }
  if (run.category !== "provider-evidence") {
    run.participants.forEach((participant, index) => {
      if (participant.providerMetadataSnapshot.capability !== run.category) {
        context.addIssue({ code: "custom", path: ["participants", index, "providerMetadataSnapshot", "capability"], message: "Participant capability must match the benchmark run category." });
      }
    });
  }
});

export const benchmarkResultSchema = z.object({
  schemaVersion: z.literal(BENCHMARK_SCHEMA_VERSION),
  resultId: stableIdSchema,
  category: benchmarkCategoryIdSchema,
  status: z.enum(["completed", "partially-completed", "failed", "cancelled", "insufficient-evidence", "verification-failed"]),
  run: benchmarkRunSchema,
  objectiveMeasurements: z.array(benchmarkMeasurementSchema).max(500),
  humanJudgments: z.array(benchmarkHumanJudgmentSchema).max(200),
  automatedJudgments: z.array(benchmarkAutomatedJudgmentSchema).max(200),
  artifacts: z.array(benchmarkArtifactReferenceSchema).max(100),
  eligibility: benchmarkEligibilitySchema,
  visibility: benchmarkVisibilityStateSchema,
  publication: benchmarkPublicationStateSchema,
  retention: benchmarkRetentionStateSchema,
  integrity: benchmarkIntegritySchema,
  limitations: z.array(safeTextSchema).min(1).max(50),
}).strict().superRefine((result, context) => {
  if (result.category !== result.run.category) {
    context.addIssue({ code: "custom", path: ["category"], message: "Result and run categories must match." });
  }
  if (result.status !== result.run.status) {
    context.addIssue({ code: "custom", path: ["status"], message: "Benchmark result and terminal run status must agree." });
  }
  if (result.integrity.payloadSchemaVersion !== result.schemaVersion) {
    context.addIssue({ code: "custom", path: ["integrity", "payloadSchemaVersion"], message: "Result integrity must bind the exact enclosing benchmark schema version." });
  }
  if (result.run.executionMode === "fixture"
    && (result.eligibility.publicEligible || result.visibility !== "private" || result.publication !== "draft")) {
    context.addIssue({ code: "custom", path: ["eligibility", "publicEligible"], message: "Fixture results are private draft evidence and cannot be publication-eligible." });
  }
  if (result.visibility === "public-verified" && (!result.eligibility.publicEligible || result.publication !== "published" || !["hash-verified", "signature-verified"].includes(result.integrity.state))) {
    context.addIssue({ code: "custom", path: ["visibility"], message: "Public-verified results must be eligible, published, and hash or signature verified." });
  }
  if (result.visibility === "public-candidate" && !result.eligibility.publicEligible) {
    context.addIssue({ code: "custom", path: ["visibility"], message: "Public-candidate results must be eligible for publication review." });
  }
  const exactParticipant = (providerId: string, model: string, voice: string | null, configurationHash: string) => result.run.participants.some((participant) =>
    participant.providerId === providerId && participant.modelId === model && participant.voiceId === voice && participant.configurationHash === configurationHash);
  if (new Set(result.objectiveMeasurements.map((measurement) => measurement.measurementId)).size !== result.objectiveMeasurements.length) {
    context.addIssue({ code: "custom", path: ["objectiveMeasurements"], message: "Objective measurement identifiers must be unique within a result." });
  }
  const judgmentIds = [...result.humanJudgments, ...result.automatedJudgments].map((judgment) => judgment.judgmentId);
  if (new Set(judgmentIds).size !== judgmentIds.length) {
    context.addIssue({ code: "custom", path: ["humanJudgments"], message: "Judgment identifiers must be unique across human and automated evidence." });
  }
  for (const [index, measurement] of result.objectiveMeasurements.entries()) {
    if (measurement.runId !== result.run.runId || !exactParticipant(measurement.providerId, measurement.model, measurement.voice, measurement.configurationHash)) {
      context.addIssue({ code: "custom", path: ["objectiveMeasurements", index], message: "Objective evidence must match an exact run participant, model, voice, and configuration." });
    }
  }
  for (const [field, judgments] of [["humanJudgments", result.humanJudgments], ["automatedJudgments", result.automatedJudgments]] as const) {
    judgments.forEach((judgment, index) => {
      if (judgment.runId !== result.run.runId || !exactParticipant(judgment.providerId, judgment.model, judgment.voice, judgment.configurationHash)) {
        context.addIssue({ code: "custom", path: [field, index], message: "Judgment evidence must match an exact run participant, model, voice, and configuration." });
      }
    });
  }
});

export const benchmarkStatisticValueSchema = z.object({
  availability: benchmarkStatisticAvailabilitySchema,
  value: z.number().finite().nullable(),
  minimumSamples: z.number().int().positive(),
}).strict().superRefine((statistic, context) => {
  if ((statistic.availability === "available") !== (statistic.value !== null)) {
    context.addIssue({ code: "custom", path: ["value"], message: "Statistic availability and value must agree." });
  }
});

export const benchmarkStatisticsSchema = z.object({
  sampleCount: z.number().int().nonnegative(),
  minimum: benchmarkStatisticValueSchema,
  maximum: benchmarkStatisticValueSchema,
  mean: benchmarkStatisticValueSchema,
  standardDeviation: benchmarkStatisticValueSchema,
  median: benchmarkStatisticValueSchema,
  p95: benchmarkStatisticValueSchema,
  standardDeviationMethod: z.literal("population"),
}).strict();

export const benchmarkMetricScoringProfileSchema = z.object({
  schemaVersion: z.literal(BENCHMARK_SCORING_PROFILE_VERSION),
  profileId: stableIdSchema,
  version: semanticVersionSchema,
  category: benchmarkModalitySchema,
  metricId: stableIdSchema,
  metricVersion: z.string().min(1).max(160),
  unit: z.string().min(1).max(80),
  measurementScope: z.object({
    source: benchmarkMeasurementSourceSchema,
    measurementPoint: benchmarkMeasurementPointSchema,
    clock: benchmarkMeasurementClockSchema,
    observation: benchmarkMeasurementObservationSchema,
    method: z.string().trim().min(1).max(160),
    sourceSchemaVersion: z.string().trim().min(1).max(160),
  }).strict(),
  statistic: z.enum(["mean", "median", "p95"]),
  direction: z.enum(["lower-is-better", "higher-is-better"]),
  minimumSampleCount: z.number().int().positive().max(10_000),
  decimalPlaces: z.number().int().min(0).max(9),
  allowSynthetic: z.boolean(),
  compositeScoreAllowed: z.literal(false),
}).strict().superRefine((profile, context) => {
  const scope = profile.measurementScope;
  const expectedObservation = scope.measurementPoint === "provider-reported"
    ? "provider-reported"
    : scope.measurementPoint === "derived"
      ? "derived"
      : "observed";
  const expectedSource = scope.measurementPoint === "provider-reported"
    ? "provider-reported"
    : scope.measurementPoint === "derived"
      ? "derived"
      : "one-observed";
  const clockMatchesPoint = scope.measurementPoint === "one-server"
    ? ["server-monotonic", "server-wall"].includes(scope.clock)
    : scope.measurementPoint === "one-browser"
      ? scope.clock === "browser-monotonic"
      : scope.measurementPoint === "provider-reported"
        ? scope.clock === "provider"
        : ["server-monotonic", "server-wall", "not-applicable"].includes(scope.clock);
  if (scope.source === "fixture") {
    if (!profile.allowSynthetic || scope.observation !== "synthetic") {
      context.addIssue({ code: "custom", path: ["measurementScope"], message: "Fixture scoring profiles require synthetic evidence to be explicitly allowed and disclosed." });
    }
    return;
  }
  if (scope.observation !== expectedObservation || !clockMatchesPoint) {
    context.addIssue({ code: "custom", path: ["measurementScope"], message: "Scoring-profile observation and clock must agree with the measurement point." });
  }
  if (scope.source !== "imported" && scope.source !== expectedSource) {
    context.addIssue({ code: "custom", path: ["measurementScope", "source"], message: "Scoring-profile source must agree with the measurement point." });
  }
});

export const benchmarkCandidateSourceSchema = z.object({
  resultId: stableIdSchema,
  runId: z.string().uuid(),
  measurementIds: z.array(stableIdSchema).min(1).max(500),
}).strict().superRefine((source, context) => {
  if (new Set(source.measurementIds).size !== source.measurementIds.length) {
    context.addIssue({ code: "custom", path: ["measurementIds"], message: "Candidate source measurement identifiers must be unique." });
  }
});

export const benchmarkRankingCandidateSchema = z.object({
  candidateId: stableIdSchema,
  providerId: benchmarkProviderIdSchema,
  sources: z.array(benchmarkCandidateSourceSchema).min(1).max(10_000),
  metadata: z.object({
    modelId: stableIdSchema,
    voiceId: stableIdSchema.nullable(),
    configurationHash: sha256Schema,
    modality: benchmarkModalitySchema,
    deployment: z.string().trim().min(1).max(160),
    evidenceClass: z.literal("objective"),
    providerSnapshot: benchmarkProviderMetadataSnapshotSchema,
    sponsorshipDisclosures: z.array(z.string().trim().min(1).max(300)).max(10),
    comparablePopulation: benchmarkComparablePopulationSchema,
    freshness: z.object({
      observedAt: z.string().datetime(),
      status: z.enum(["current", "stale", "fixture-only", "unknown"]),
    }).strict(),
    publicEligibility: z.boolean(),
  }).strict(),
  measurements: z.array(benchmarkMeasurementSchema).max(10_000),
  eligible: z.boolean(),
  exclusions: z.array(benchmarkExclusionSchema).max(30),
}).strict().superRefine((candidate, context) => {
  if (candidate.metadata.modality !== candidate.metadata.comparablePopulation.category
    || candidate.metadata.providerSnapshot.capability !== candidate.metadata.modality
    || candidate.metadata.deployment !== candidate.metadata.comparablePopulation.deployment) {
    context.addIssue({ code: "custom", path: ["metadata"], message: "Candidate modality, capability, deployment, and comparable population must agree." });
  }
  const fixture = candidate.metadata.comparablePopulation.executionMode === "fixture";
  if (fixture !== (candidate.metadata.freshness.status === "fixture-only")) {
    context.addIssue({ code: "custom", path: ["metadata", "freshness", "status"], message: "Fixture execution and fixture-only freshness must agree." });
  }
  if (fixture && candidate.metadata.publicEligibility) {
    context.addIssue({ code: "custom", path: ["metadata", "publicEligibility"], message: "Fixture candidates cannot be public-eligible." });
  }
  candidate.measurements.forEach((measurement, index) => {
    if (measurement.synthetic !== fixture) {
      context.addIssue({ code: "custom", path: ["measurements", index, "synthetic"], message: "Fixture populations require synthetic measurements; non-fixture populations require observed measurements." });
    }
  });
  const sourceKeys = candidate.sources.map((source) => `${source.resultId}\u0000${source.runId}`);
  if (new Set(sourceKeys).size !== sourceKeys.length) {
    context.addIssue({ code: "custom", path: ["sources"], message: "Candidate result and run source references must be unique." });
  }
  const declaredMeasurementIds = candidate.sources.flatMap((source) => source.measurementIds);
  const actualMeasurementIds = candidate.measurements.map((measurement) => measurement.measurementId);
  if (new Set(declaredMeasurementIds).size !== declaredMeasurementIds.length
    || JSON.stringify([...declaredMeasurementIds].sort()) !== JSON.stringify([...actualMeasurementIds].sort())) {
    context.addIssue({ code: "custom", path: ["sources"], message: "Candidate sources must account for every measurement exactly once." });
  }
  const sourceRunByMeasurement = new Map(candidate.sources.flatMap((source) => source.measurementIds.map((measurementId) => [measurementId, source.runId] as const)));
  candidate.measurements.forEach((measurement, index) => {
    if (sourceRunByMeasurement.get(measurement.measurementId) !== measurement.runId) {
      context.addIssue({ code: "custom", path: ["measurements", index, "runId"], message: "Each candidate measurement must match its declared source run." });
    }
    if (measurement.providerId !== candidate.providerId
      || measurement.model !== candidate.metadata.modelId
      || measurement.voice !== candidate.metadata.voiceId
      || measurement.configurationHash !== candidate.metadata.configurationHash) {
      context.addIssue({ code: "custom", path: ["measurements", index], message: "Every candidate measurement must match the exact provider, model, voice, and configuration lane." });
    }
  });
  if (new Set(candidate.metadata.sponsorshipDisclosures).size !== candidate.metadata.sponsorshipDisclosures.length) {
    context.addIssue({ code: "custom", path: ["metadata", "sponsorshipDisclosures"], message: "Candidate sponsorship disclosures must be unique." });
  }
  const rankingExclusions = candidate.exclusions.filter((exclusion) => exclusion.scope === "ranking" || exclusion.scope === "both");
  if (candidate.eligible !== (rankingExclusions.length === 0)) {
    context.addIssue({ code: "custom", path: ["eligible"], message: "Candidate ranking eligibility must agree with its structured ranking exclusions." });
  }
});

export const benchmarkLeaderboardEntrySchema = z.object({
  providerId: benchmarkProviderIdSchema,
  candidateId: stableIdSchema,
  sources: z.array(benchmarkCandidateSourceSchema).min(1).max(10_000),
  metadata: benchmarkRankingCandidateSchema.shape.metadata,
  rank: z.number().int().positive().nullable(),
  tied: z.boolean(),
  status: z.enum(["ranked", "insufficient-samples", "excluded"]),
  metricId: stableIdSchema,
  value: z.number().finite().nullable(),
  unit: z.string().min(1).max(80),
  sampleCount: z.number().int().nonnegative(),
  statistics: benchmarkStatisticsSchema,
  exclusions: z.array(benchmarkExclusionSchema).max(30),
}).strict().superRefine((entry, context) => {
  const rankingExclusions = entry.exclusions.filter((exclusion) => exclusion.scope === "ranking" || exclusion.scope === "both");
  if (entry.status === "ranked") {
    if (entry.rank === null || entry.value === null || entry.sampleCount <= 0 || entry.statistics.sampleCount !== entry.sampleCount) {
      context.addIssue({ code: "custom", path: ["status"], message: "Ranked entries require a rank, value, positive sample count, and matching statistics sample count." });
    }
    if (rankingExclusions.length > 0) {
      context.addIssue({ code: "custom", path: ["exclusions"], message: "Ranked entries cannot carry ranking exclusions." });
    }
    return;
  }
  if (entry.rank !== null || entry.value !== null || entry.tied) {
    context.addIssue({ code: "custom", path: ["status"], message: "Unranked entries cannot carry a rank, ranking value, or tie state." });
  }
  if (entry.status === "excluded") {
    if (entry.sampleCount !== 0) {
      context.addIssue({ code: "custom", path: ["sampleCount"], message: "Excluded entries must expose zero ranking samples." });
    }
    if (rankingExclusions.length === 0) {
      context.addIssue({ code: "custom", path: ["exclusions"], message: "Excluded entries require at least one structured ranking exclusion." });
    }
    return;
  }
  if (entry.statistics.sampleCount !== entry.sampleCount) {
    context.addIssue({ code: "custom", path: ["sampleCount"], message: "Insufficient-sample entries must preserve their exact statistics sample count." });
  }
  if (rankingExclusions.length === 0 || rankingExclusions.some((exclusion) => exclusion.code !== "insufficient-samples")) {
    context.addIssue({ code: "custom", path: ["exclusions"], message: "Insufficient-sample entries require only the corresponding structured ranking exclusion." });
  }
});

export const benchmarkLeaderboardSnapshotSchema = z.object({
  schemaVersion: z.literal(BENCHMARK_LEADERBOARD_VERSION),
  snapshotId: stableIdSchema,
  generatedAt: z.string().datetime(),
  category: benchmarkModalitySchema,
  methodologyVersion: z.string().min(1).max(160),
  scoringProfile: benchmarkMetricScoringProfileSchema,
  comparablePopulation: benchmarkComparablePopulationSchema,
  providerSnapshots: z.array(z.object({
    candidateId: stableIdSchema,
    providerId: benchmarkProviderIdSchema,
    metadata: benchmarkProviderMetadataSnapshotSchema,
  }).strict()).min(1).max(1_000),
  sponsorshipDisclosures: z.array(z.string().trim().min(1).max(300)).max(100),
  timeWindow: z.object({ start: z.string().datetime(), end: z.string().datetime() }).strict(),
  filters: benchmarkFiltersSchema,
  eligibilityPolicy: z.object({ version: z.string().min(1).max(160), description: safeTextSchema }).strict(),
  entries: z.array(benchmarkLeaderboardEntrySchema).min(1).max(1_000),
  includedResultIds: z.array(stableIdSchema).max(10_000),
  excludedResults: z.array(z.object({
    resultId: stableIdSchema,
    candidateId: stableIdSchema,
    providerId: benchmarkProviderIdSchema,
    configurationHash: sha256Schema,
    reasons: z.array(benchmarkExclusionSchema).min(1).max(30),
  }).strict()).max(10_000),
  publicEligibility: z.boolean(),
  visibility: benchmarkVisibilityStateSchema,
  publication: benchmarkPublicationStateSchema,
  compositeScoreProvided: z.literal(false),
  integrity: benchmarkIntegritySchema,
  signatureStatus: z.enum(["unsigned", "verified", "failed", "unsupported-version"]),
  limitations: z.array(safeTextSchema).min(1).max(30),
}).strict().superRefine((snapshot, context) => {
  if (Date.parse(snapshot.timeWindow.end) < Date.parse(snapshot.timeWindow.start)) {
    context.addIssue({ code: "custom", path: ["timeWindow"], message: "Leaderboard time windows cannot end before they start." });
  }
  if (snapshot.visibility === "public-verified"
    && (!snapshot.publicEligibility || snapshot.publication !== "published" || !["hash-verified", "signature-verified"].includes(snapshot.integrity.state))) {
    context.addIssue({ code: "custom", path: ["visibility"], message: "Public-verified snapshots require eligibility, publication, and verified integrity." });
  }
  if (snapshot.visibility === "public-candidate" && !snapshot.publicEligibility) {
    context.addIssue({ code: "custom", path: ["visibility"], message: "Public-candidate snapshots require publication eligibility." });
  }
  if (snapshot.signatureStatus === "verified" && snapshot.integrity.state !== "signature-verified") {
    context.addIssue({ code: "custom", path: ["signatureStatus"], message: "Verified signature status requires signature-verified integrity." });
  }
  if (snapshot.integrity.state === "signature-verified" && snapshot.signatureStatus !== "verified") {
    context.addIssue({ code: "custom", path: ["signatureStatus"], message: "Signature-verified integrity requires verified signature status." });
  }
  if (snapshot.integrity.payloadSchemaVersion !== snapshot.schemaVersion) {
    context.addIssue({ code: "custom", path: ["integrity", "payloadSchemaVersion"], message: "Snapshot integrity must bind the exact enclosing leaderboard schema version." });
  }
  if (snapshot.category !== snapshot.comparablePopulation.category
    || snapshot.methodologyVersion !== snapshot.comparablePopulation.methodologyVersion
    || snapshot.scoringProfile.category !== snapshot.category
    || snapshot.scoringProfile.metricVersion !== snapshot.comparablePopulation.metricVersion) {
    context.addIssue({ code: "custom", path: ["comparablePopulation"], message: "Snapshot category, methodology, scoring metric, and comparable population must agree." });
  }
  const entryCandidates = [...snapshot.entries.map((entry) => entry.candidateId)].sort();
  const metadataCandidates = [...snapshot.providerSnapshots.map((entry) => entry.candidateId)].sort();
  if (new Set(entryCandidates).size !== entryCandidates.length || new Set(metadataCandidates).size !== metadataCandidates.length
    || JSON.stringify(entryCandidates) !== JSON.stringify(metadataCandidates)) {
    context.addIssue({ code: "custom", path: ["providerSnapshots"], message: "Each leaderboard entry requires exactly one historical provider metadata snapshot." });
  }
  const providerSnapshotByCandidate = new Map(snapshot.providerSnapshots.map((providerSnapshot) => [providerSnapshot.candidateId, providerSnapshot]));
  snapshot.entries.forEach((entry, index) => {
    const providerSnapshot = providerSnapshotByCandidate.get(entry.candidateId);
    if (!providerSnapshot
      || providerSnapshot.providerId !== entry.providerId
      || JSON.stringify(providerSnapshot.metadata) !== JSON.stringify(entry.metadata.providerSnapshot)) {
      context.addIssue({ code: "custom", path: ["providerSnapshots"], message: `Leaderboard entry ${index} must match its exact historical provider identity and metadata snapshot.` });
    }
    if (JSON.stringify(entry.metadata.comparablePopulation) !== JSON.stringify(snapshot.comparablePopulation)) {
      context.addIssue({ code: "custom", path: ["entries", index, "metadata", "comparablePopulation"], message: "Every leaderboard entry must use the snapshot's exact comparable population." });
    }
    if (entry.metricId !== snapshot.scoringProfile.metricId || entry.unit !== snapshot.scoringProfile.unit) {
      context.addIssue({ code: "custom", path: ["entries", index, "metricId"], message: "Every leaderboard entry metric and unit must match the snapshot scoring profile." });
    }
  });
  const expectedSponsorship = [...new Set(snapshot.entries.flatMap((entry) => entry.metadata.sponsorshipDisclosures))].sort();
  const disclosedSponsorship = [...snapshot.sponsorshipDisclosures].sort();
  if (new Set(disclosedSponsorship).size !== disclosedSponsorship.length || JSON.stringify(expectedSponsorship) !== JSON.stringify(disclosedSponsorship)) {
    context.addIssue({ code: "custom", path: ["sponsorshipDisclosures"], message: "Leaderboard sponsorship disclosures must exactly represent the included candidate metadata." });
  }
  const expectedIncludedResultIds = [...new Set(snapshot.entries
    .filter((entry) => entry.status === "ranked")
    .flatMap((entry) => entry.sources.map((source) => source.resultId)))].sort();
  if (new Set(snapshot.includedResultIds).size !== snapshot.includedResultIds.length
    || JSON.stringify([...snapshot.includedResultIds].sort()) !== JSON.stringify(expectedIncludedResultIds)) {
    context.addIssue({ code: "custom", path: ["includedResultIds"], message: "Included result identifiers must exactly match ranked candidate sources." });
  }
  const expectedExcludedSources = snapshot.entries
    .filter((entry) => entry.status !== "ranked")
    .flatMap((entry) => entry.sources.map((source) => `${source.resultId}\u0000${entry.candidateId}\u0000${entry.providerId}\u0000${entry.metadata.configurationHash}`))
    .sort();
  const declaredExcludedSources = snapshot.excludedResults
    .map((entry) => `${entry.resultId}\u0000${entry.candidateId}\u0000${entry.providerId}\u0000${entry.configurationHash}`)
    .sort();
  if (new Set(declaredExcludedSources).size !== declaredExcludedSources.length
    || JSON.stringify(expectedExcludedSources) !== JSON.stringify(declaredExcludedSources)) {
    context.addIssue({ code: "custom", path: ["excludedResults"], message: "Excluded result records must identify every exact unranked candidate lane once." });
  }
  const exclusionSet = (reasons: readonly z.infer<typeof benchmarkExclusionSchema>[]) => JSON.stringify(reasons
    .map((reason) => JSON.stringify(reason))
    .sort());
  const expectedReasonsBySource = new Map<string, string>(snapshot.entries
    .filter((entry) => entry.status !== "ranked")
    .flatMap((entry) => entry.sources.map((source) => [
      `${source.resultId}\u0000${entry.candidateId}\u0000${entry.providerId}\u0000${entry.metadata.configurationHash}`,
      exclusionSet(entry.exclusions),
    ] as const)));
  snapshot.excludedResults.forEach((excluded, index) => {
    const identity = `${excluded.resultId}\u0000${excluded.candidateId}\u0000${excluded.providerId}\u0000${excluded.configurationHash}`;
    if (expectedReasonsBySource.get(identity) !== exclusionSet(excluded.reasons)) {
      context.addIssue({ code: "custom", path: ["excludedResults", index, "reasons"], message: "Excluded result reasons must exactly match the corresponding unranked leaderboard entry." });
    }
  });
});

export const benchmarkPlanSchema = z.object({
  schemaVersion: z.literal(BENCHMARK_PLAN_VERSION),
  planId: stableIdSchema,
  category: benchmarkModalitySchema,
  methodology: z.object({ id: stableIdSchema, version: semanticVersionSchema }).strict(),
  executionMode: z.enum(["fixture", "protected-live", "local-live"]).default("fixture"),
  cases: z.array(z.object({ id: stableIdSchema, version: semanticVersionSchema }).strict()).min(1).max(BENCHMARK_MAX_CASES),
  providers: z.array(z.object({
    providerId: benchmarkProviderIdSchema,
    modelId: stableIdSchema,
    voiceId: stableIdSchema.nullable(),
    configuration: benchmarkConfigurationSchema.default({}),
  }).strict()).min(1).max(BENCHMARK_MAX_PROVIDERS).superRefine((providers, context) => {
    const canonicalConfiguration = (configuration: Record<string, unknown>) => JSON.stringify(Object.fromEntries(Object.keys(configuration).sort().map((key) => [key, configuration[key]])));
    const lanes = providers.map((provider) => `${provider.providerId}\u0000${provider.modelId}\u0000${provider.voiceId}\u0000${canonicalConfiguration(provider.configuration)}`);
    if (new Set(lanes).size !== lanes.length) {
      context.addIssue({ code: "custom", message: "Choose each exact provider, model, voice, and configuration lane at most once." });
    }
  }),
  repetitions: z.number().int().positive().max(BENCHMARK_MAX_REPETITIONS),
  confirmedPaidCalls: z.boolean().default(false),
}).strict().superRefine((plan, context) => {
  const attempts = plan.cases.length * plan.providers.length * plan.repetitions;
  const live = plan.executionMode !== "fixture";
  const maximum = live ? BENCHMARK_MAX_LIVE_ATTEMPTS : BENCHMARK_MAX_FIXTURE_ATTEMPTS;
  if (attempts > maximum) {
    context.addIssue({
      code: "custom",
      path: ["repetitions"],
      message: `This plan requests ${attempts} attempts; ${plan.executionMode} plans are limited to ${maximum}.`,
    });
  }
  if (live && !plan.confirmedPaidCalls) {
    context.addIssue({
      code: "custom",
      path: ["confirmedPaidCalls"],
      message: "Live benchmark planning requires explicit paid-call confirmation.",
    });
  }
  if (plan.category === "tts") {
    plan.providers.forEach((provider, index) => {
      if (provider.voiceId === null) context.addIssue({ code: "custom", path: ["providers", index, "voiceId"], message: "TTS benchmark lanes require an exact voice identifier." });
    });
  }
});

export const benchmarkComparabilityReasonSchema = z.object({
  code: z.enum([
    "schema-version",
    "category",
    "suite-version",
    "methodology-reference",
    "methodology-version",
    "metric-version",
    "scenario",
    "input-hash",
    "evaluation-mode",
    "execution-environment",
    "provider",
    "model",
    "voice",
    "configuration",
    "adapter-version",
    "region",
    "transport",
    "normalized-audio",
    "thermal-state",
  ]),
  field: z.string().min(1).max(160),
  left: z.string().max(500),
  right: z.string().max(500),
  detail: z.string().min(1).max(500),
}).strict();

export const benchmarkComparabilityAssessmentSchema = z.object({
  scope: z.enum(["cross-provider", "series"]),
  comparable: z.boolean(),
  reasons: z.array(benchmarkComparabilityReasonSchema).max(50),
  disclosures: z.array(benchmarkComparabilityReasonSchema).max(50),
}).strict().superRefine((assessment, context) => {
  if (assessment.comparable !== (assessment.reasons.length === 0)) {
    context.addIssue({ code: "custom", path: ["reasons"], message: "Comparable records cannot contain material difference reasons." });
  }
});

export type BenchmarkMethodology = z.infer<typeof benchmarkMethodologySchema>;
export type BenchmarkSuite = z.infer<typeof benchmarkSuiteSchema>;
export type BenchmarkCase = z.infer<typeof benchmarkCaseSchema>;
export type BenchmarkRun = z.infer<typeof benchmarkRunSchema>;
export type BenchmarkMeasurement = z.infer<typeof benchmarkMeasurementSchema>;
export type BenchmarkHumanJudgment = z.infer<typeof benchmarkHumanJudgmentSchema>;
export type BenchmarkAutomatedJudgment = z.infer<typeof benchmarkAutomatedJudgmentSchema>;
export type BenchmarkArtifactReference = z.infer<typeof benchmarkArtifactReferenceSchema>;
export type BenchmarkEligibility = z.infer<typeof benchmarkEligibilitySchema>;
export type BenchmarkResult = z.infer<typeof benchmarkResultSchema>;
export type BenchmarkStatistics = z.infer<typeof benchmarkStatisticsSchema>;
export type BenchmarkMetricScoringProfile = z.infer<typeof benchmarkMetricScoringProfileSchema>;
export type BenchmarkRankingCandidate = z.infer<typeof benchmarkRankingCandidateSchema>;
export type BenchmarkLeaderboardSnapshot = z.infer<typeof benchmarkLeaderboardSnapshotSchema>;
export type BenchmarkComparabilityAssessment = z.infer<typeof benchmarkComparabilityAssessmentSchema>;
export type BenchmarkIntegrity = z.infer<typeof benchmarkIntegritySchema>;
export type BenchmarkPlan = z.infer<typeof benchmarkPlanSchema>;
export type BenchmarkProviderClaim = z.infer<typeof benchmarkProviderClaimSchema>;
export type BenchmarkProviderMetadataSnapshot = z.infer<typeof benchmarkProviderMetadataSnapshotSchema>;
export type BenchmarkComparablePopulation = z.infer<typeof benchmarkComparablePopulationSchema>;
