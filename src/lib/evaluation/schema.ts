import { z } from "zod";

import { providerIdSchema } from "@/lib/providers/types";

export const EVALUATION_SCHEMA_VERSION = "one-voice-evidence/1.0.0" as const;
export const EVALUATION_METHODOLOGY_VERSION = "one-tts-compare/1.0.0" as const;
export const EVALUATION_METRIC_VERSION = "one-tts-metrics/1.0.0" as const;
export const EVALUATION_MAX_TEXT_LENGTH = 600;
export const EVALUATION_MIN_PROVIDERS = 2;
export const EVALUATION_MAX_PROVIDERS = 4;
export const EVALUATION_IMPORT_MAX_BYTES = 512 * 1024;
export const EVALUATION_REQUEST_MAX_BYTES = 48 * 1024;
export const EVALUATION_MAX_AUDIO_BYTES = 2_500 * 1024;
export const EVALUATION_MAX_AUDIO_BASE64_LENGTH = Math.ceil(EVALUATION_MAX_AUDIO_BYTES / 3) * 4;

export const evaluationModeSchema = z.enum(["standardized", "provider-optimized"]);
export const evaluationExecutionModeSchema = z.enum(["fixture", "protected-live", "local-live"]);
export const evaluationProviderStatusSchema = z.enum([
  "pending",
  "streaming",
  "complete",
  "cancelled",
  "timed-out",
  "unavailable",
  "failed",
]);
export const metricAvailabilitySchema = z.enum(["measured", "estimated", "unavailable"]);
export const metricMeasurementPointSchema = z.enum([
  "one-server",
  "one-browser",
  "provider-reported",
  "derived",
]);
export const traceObservationSchema = z.enum(["observed", "inferred", "provider-reported", "unavailable"]);

const safeIdentifierSchema = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9._:/-]+$/);
const safeHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const jsonPrimitiveSchema = z.union([z.string().max(2_000), z.number().finite(), z.boolean(), z.null()]);
const forbiddenConfigurationKey = /(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|cookie|password|internal[_-]?url|raw.*payload)/i;
const safeConfigurationSchema = z.record(
  z.string().min(1).max(80),
  z.union([jsonPrimitiveSchema, z.array(jsonPrimitiveSchema).max(40)]),
).superRefine((configuration, context) => {
  for (const key of Object.keys(configuration)) {
    if (forbiddenConfigurationKey.test(key)) {
      context.addIssue({
        code: "custom",
        message: "Provider configuration cannot contain credentials, cookies, tokens, internal URLs, or raw payloads.",
        path: [key],
      });
    }
  }
});

export const evaluationScenarioSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  source: z.enum(["preset", "customized-preset", "custom"]),
  presetId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).nullable(),
  inputType: z.literal("text"),
  text: z.string().min(1).max(EVALUATION_MAX_TEXT_LENGTH).refine((value) => value.trim().length > 0, {
    message: "Scenario text must contain at least one visible character.",
  }),
  inputHash: safeHashSchema,
}).strict();

export const evaluationProviderSelectionSchema = z.object({
  providerId: providerIdSchema,
  model: safeIdentifierSchema,
  voice: safeIdentifierSchema,
  outputFormat: z.string().trim().min(1).max(80),
  providerSpecificConfiguration: safeConfigurationSchema.default({}),
}).strict();

export const blindConfigurationSchema = z.object({
  enabled: z.boolean(),
  seed: z.string().trim().min(1).max(120),
}).strict();

export const evaluationRunRequestSchema = z.object({
  schemaVersion: z.literal(EVALUATION_SCHEMA_VERSION),
  evaluationId: z.string().uuid(),
  runId: z.string().uuid(),
  scenario: evaluationScenarioSchema,
  evaluationMode: evaluationModeSchema,
  executionMode: evaluationExecutionModeSchema.default("fixture"),
  providers: z.array(evaluationProviderSelectionSchema)
    .min(EVALUATION_MIN_PROVIDERS)
    .max(EVALUATION_MAX_PROVIDERS)
    .superRefine((providers, context) => {
      const ids = providers.map((provider) => provider.providerId);
      if (new Set(ids).size !== ids.length) {
        context.addIssue({ code: "custom", message: "Choose each provider at most once." });
      }
    }),
  blind: blindConfigurationSchema,
  confirmedPaidCalls: z.boolean().default(false),
}).strict();

export const evaluationProviderCapabilitySchema = z.object({
  id: providerIdSchema,
  displayName: z.string().min(1).max(120),
  implementation: z.enum(["implemented", "prototype", "simulated", "proposed", "unsupported", "unavailable"]),
  readiness: z.object({
    listed: z.literal(true),
    configured: z.boolean(),
    adapterBacked: z.boolean(),
    liveEnabled: z.boolean(),
  }).strict(),
  protectedLiveAvailable: z.boolean(),
  localLiveAvailable: z.boolean(),
  fixtureAvailable: z.literal(true),
  limitations: z.array(z.string().min(1).max(500)).min(1).max(20),
}).strict();

export const evaluationCapabilitiesResponseSchema = z.object({
  schemaVersion: z.literal(EVALUATION_SCHEMA_VERSION),
  executionDefault: z.literal("fixture"),
  liveEvaluationsEnabled: z.boolean(),
  anonymousLiveEvaluationsEnabled: z.boolean(),
  localLiveAvailable: z.boolean(),
  maximumTextLength: z.number().int().min(80).max(EVALUATION_MAX_TEXT_LENGTH),
  providers: z.array(evaluationProviderCapabilitySchema).min(1).max(20),
}).strict();

const evaluationCatalogModelSchema = z.object({
  id: safeIdentifierSchema,
  name: z.string().min(1).max(160),
  description: z.string().max(500).nullable(),
  languages: z.array(z.string().min(1).max(80)).max(80),
}).strict();

const evaluationCatalogVoiceSchema = z.object({
  id: safeIdentifierSchema,
  name: z.string().min(1).max(160),
  description: z.string().max(500).nullable(),
  previewAvailable: z.boolean(),
}).strict();

export const evaluationCatalogResponseSchema = z.object({
  schemaVersion: z.literal(EVALUATION_SCHEMA_VERSION),
  providerId: providerIdSchema,
  mode: z.enum(["fixture", "protected-live", "local-live"]),
  source: z.enum(["deterministic-fixture", "validated-static", "provider-discovery", "unavailable"]),
  models: z.array(evaluationCatalogModelSchema).max(200),
  voices: z.array(evaluationCatalogVoiceSchema).max(200),
  hasMoreVoices: z.boolean(),
  nextVoicePageToken: z.string().min(1).max(1_024).nullable(),
  separateVoiceRequired: z.boolean(),
  outputFormat: safeIdentifierSchema,
  normalizedOutput: z.object({
    encoding: z.literal("pcm_s16le"),
    sampleRate: z.literal(24_000),
    channels: z.literal(1),
    mimeType: z.literal("audio/wav"),
    serverWrapped: z.boolean(),
  }).strict(),
  message: z.string().min(1).max(500),
  limitations: z.array(z.string().min(1).max(500)).min(1).max(20),
}).strict();

export const evaluationMetricSchema = z.object({
  name: z.enum([
    "server_time_to_first_audio_chunk",
    "time_to_first_audible_output",
    "total_generation_time",
    "audio_duration",
    "real_time_factor",
    "request_success",
    "client_time_to_playable",
    "estimated_cost",
  ]),
  value: z.number().finite().nullable(),
  unit: z.enum(["milliseconds", "seconds", "ratio", "boolean", "usd", "unavailable"]),
  availability: metricAvailabilitySchema,
  measurementPoint: metricMeasurementPointSchema,
  metricVersion: z.literal(EVALUATION_METRIC_VERSION),
  provenance: z.object({
    clock: z.enum(["server-monotonic", "server-wall", "browser-monotonic", "provider", "not-applicable"]),
    description: z.string().min(1).max(500),
  }).strict(),
}).strict();

export const evaluationTraceEventSchema = z.object({
  type: z.enum([
    "validation-start",
    "provider-request-start",
    "connection-established",
    "first-audio-chunk",
    "first-audible-output",
    "completion",
    "cancellation",
    "failure",
    "audio-processing",
    "client-playback-ready",
  ]),
  timestamp: z.string().datetime().nullable(),
  offsetMs: z.number().finite().nonnegative().nullable(),
  observation: traceObservationSchema,
  detail: z.string().min(1).max(500),
}).strict();

export const humanRatingSchema = z.object({
  naturalness: z.number().int().min(1).max(5).nullable(),
  intelligibility: z.number().int().min(1).max(5).nullable(),
  pronunciation: z.number().int().min(1).max(5).nullable(),
  emotionalFit: z.number().int().min(1).max(5).nullable(),
  useCaseFit: z.number().int().min(1).max(5).nullable(),
  overallPreference: z.boolean(),
  ratedAt: z.string().datetime().nullable(),
  ratedBeforeReveal: z.boolean().nullable(),
}).strict();

export const sanitizedEvaluationErrorSchema = z.object({
  code: z.string().min(1).max(80),
  message: z.string().min(1).max(500),
  retryable: z.boolean(),
}).strict();

export const evaluationProviderEvidenceSchema = z.object({
  runId: z.string().uuid(),
  provider: providerIdSchema,
  blindLabel: z.enum(["Voice A", "Voice B", "Voice C", "Voice D"]),
  model: safeIdentifierSchema,
  voice: safeIdentifierSchema,
  providerSpecificConfiguration: safeConfigurationSchema,
  adapterVersion: z.string().min(1).max(120),
  environment: evaluationExecutionModeSchema,
  region: z.string().min(1).max(120).nullable(),
  regionScope: z.enum(["one-server", "provider"]).nullable(),
  requestTimestamp: z.string().datetime().nullable(),
  firstAudioTimestamp: z.string().datetime().nullable(),
  completionTimestamp: z.string().datetime().nullable(),
  clientPlayableTimestamp: z.string().datetime().nullable(),
  metrics: z.array(evaluationMetricSchema).min(1).max(20),
  audio: z.object({
    mimeType: z.string().regex(/^audio\/[a-z0-9.+-]+$/).nullable(),
    durationSeconds: z.number().finite().nonnegative().nullable(),
    storageReference: z.string().regex(/^ephemeral:[A-Za-z0-9._:-]{1,400}$/).nullable(),
    contentHash: safeHashSchema.nullable(),
    rawContentHash: safeHashSchema.nullable(),
    normalized: z.boolean(),
  }).strict(),
  status: evaluationProviderStatusSchema,
  trace: z.array(evaluationTraceEventSchema).max(40),
  sanitizedError: sanitizedEvaluationErrorSchema.nullable(),
  humanRating: humanRatingSchema,
  sponsorshipDisclosure: z.string().max(300).nullable(),
}).strict();

export const evaluationEvidenceBundleSchema = z.object({
  schemaVersion: z.literal(EVALUATION_SCHEMA_VERSION),
  methodologyVersion: z.literal(EVALUATION_METHODOLOGY_VERSION),
  exportedAt: z.string().datetime(),
  evaluationId: z.string().uuid(),
  runId: z.string().uuid(),
  scenario: evaluationScenarioSchema,
  evaluationMode: evaluationModeSchema,
  blind: z.object({
    enabled: z.boolean(),
    seed: z.string().min(1).max(120),
    revealed: z.boolean(),
    revealedAt: z.string().datetime().nullable(),
  }).strict(),
  providerResults: z.array(evaluationProviderEvidenceSchema)
    .min(EVALUATION_MIN_PROVIDERS)
    .max(EVALUATION_MAX_PROVIDERS),
  evidenceCategories: z.object({
    measured: z.literal(true),
    humanRated: z.boolean(),
    modelJudged: z.literal(false),
  }).strict(),
  modelJudgeResults: z.null(),
  visibility: z.literal("private"),
  consent: z.object({
    publication: z.literal(false),
    publicEvidencePool: z.literal(false),
  }).strict(),
  retention: z.object({
    mode: z.literal("ephemeral"),
    audioEmbedded: z.literal(false),
    rawProviderPayloadsEmbedded: z.literal(false),
  }).strict(),
  sponsorshipDisclosure: z.string().max(300).nullable(),
  limitations: z.array(z.string().min(1).max(500)).min(1).max(30),
}).strict();

export const evaluationStreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("run-started"),
    evaluationId: z.string().uuid(),
    runId: z.string().uuid(),
    providerIds: z.array(providerIdSchema).min(EVALUATION_MIN_PROVIDERS).max(EVALUATION_MAX_PROVIDERS),
    startedAt: z.string().datetime(),
  }).strict(),
  z.object({
    type: z.literal("provider-state"),
    providerId: providerIdSchema,
    status: evaluationProviderStatusSchema,
    at: z.string().datetime(),
  }).strict(),
  z.object({
    type: z.literal("provider-result"),
    result: evaluationProviderEvidenceSchema,
    audioBase64: z.string().max(EVALUATION_MAX_AUDIO_BASE64_LENGTH).nullable(),
    at: z.string().datetime(),
  }).strict(),
  z.object({
    type: z.literal("run-complete"),
    evaluationId: z.string().uuid(),
    runId: z.string().uuid(),
    completedAt: z.string().datetime(),
    bundle: evaluationEvidenceBundleSchema,
  }).strict(),
]);

export type EvaluationMode = z.infer<typeof evaluationModeSchema>;
export type EvaluationExecutionMode = z.infer<typeof evaluationExecutionModeSchema>;
export type EvaluationProviderStatus = z.infer<typeof evaluationProviderStatusSchema>;
export type EvaluationScenario = z.infer<typeof evaluationScenarioSchema>;
export type EvaluationProviderSelection = z.infer<typeof evaluationProviderSelectionSchema>;
export type EvaluationRunRequest = z.infer<typeof evaluationRunRequestSchema>;
export type EvaluationProviderCapability = z.infer<typeof evaluationProviderCapabilitySchema>;
export type EvaluationCapabilitiesResponse = z.infer<typeof evaluationCapabilitiesResponseSchema>;
export type EvaluationCatalogResponse = z.infer<typeof evaluationCatalogResponseSchema>;
export type EvaluationMetric = z.infer<typeof evaluationMetricSchema>;
export type EvaluationTraceEvent = z.infer<typeof evaluationTraceEventSchema>;
export type HumanRating = z.infer<typeof humanRatingSchema>;
export type EvaluationProviderEvidence = z.infer<typeof evaluationProviderEvidenceSchema>;
export type EvaluationEvidenceBundle = z.infer<typeof evaluationEvidenceBundleSchema>;
export type EvaluationStreamEvent = z.infer<typeof evaluationStreamEventSchema>;
