import { z } from "zod";

import {
  benchmarkConfigurationSchema,
  benchmarkModalitySchema,
  benchmarkProviderIdSchema,
  benchmarkVisibilityStateSchema,
} from "@/lib/evaluation/benchmark-schema";

export const BENCHMARK_PRIVATE_RESULT_PROJECTION_VERSION = "one-benchmark-private-result/1.0.0" as const;
export const BENCHMARK_PUBLIC_LIST_VERSION = "one-benchmark-public-list/1.0.0" as const;

const sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const timestampSchema = z.string().datetime({ offset: true });
const stableIdSchema = z.string().trim().min(1).max(160).regex(/^[a-z0-9]+(?:[._:/-][a-z0-9]+)*$/i);
const boundedJsonObject = (maximumBytes: number) => z.record(z.string().max(160), z.json()).superRefine((value, context) => {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > maximumBytes) {
    context.addIssue({ code: "custom", message: `JSON projection exceeds ${maximumBytes} bytes.` });
  }
});

const benchmarkPrivateMeasurementProjectionSchema = z.object({
  name: stableIdSchema,
  version: z.string().min(1).max(120),
  value: z.number().finite().nullable(),
  unit: z.string().min(1).max(40),
  availability: z.enum(["measured", "estimated", "unavailable"]),
  measurementPoint: z.enum(["one-server", "one-browser", "provider-reported", "derived"]),
  provenance: boundedJsonObject(8_192),
  observedAt: timestampSchema.nullable(),
}).strict();

const benchmarkPrivateOutputProjectionSchema = z.object({
  id: z.string().uuid(),
  providerId: benchmarkProviderIdSchema,
  providerDisplayName: z.string().min(1).max(160),
  providerReadiness: z.enum(["listed", "configured", "adapter-backed", "live-enabled"]),
  modelId: z.string().min(1).max(160),
  modelVersion: z.string().min(1).max(160).nullable(),
  voiceId: z.string().min(1).max(160).nullable(),
  configurationHash: sha256Schema,
  adapterVersion: z.string().min(1).max(120).nullable(),
  configuration: benchmarkConfigurationSchema,
  sponsorshipDisclosure: z.string().min(1).max(300).nullable(),
  capability: benchmarkModalitySchema,
  outputModality: z.enum(["text", "audio", "event-stream"]),
  region: z.string().min(1).max(80).nullable(),
  transport: z.string().min(1).max(120),
  codec: z.string().min(1).max(80).nullable(),
  sampleRateHz: z.number().int().min(8_000).max(384_000).nullable(),
  channels: z.number().int().min(1).max(32).nullable(),
  thermalState: z.enum(["cold", "warm", "unknown"]),
  status: z.enum(["pending", "streaming", "complete", "cancelled", "timed-out", "unavailable", "failed"]),
  failureCode: stableIdSchema.nullable(),
  requestStartedAt: timestampSchema.nullable(),
  streamEstablishedAt: timestampSchema.nullable(),
  firstOutputAt: timestampSchema.nullable(),
  firstAudioAt: timestampSchema.nullable(),
  completedAt: timestampSchema.nullable(),
  audioMimeType: z.string().regex(/^audio\/[a-z0-9.+-]+$/).nullable(),
  audioDurationSeconds: z.number().finite().min(0).max(3_600).nullable(),
  audioContentHash: sha256Schema.nullable(),
  outputContentHash: sha256Schema.nullable(),
  technicalTrace: z.array(z.json()).max(40),
  sanitizedError: boundedJsonObject(16_384).nullable(),
  measurements: z.array(benchmarkPrivateMeasurementProjectionSchema).max(500),
}).strict();

const benchmarkPrivateJudgmentProjectionSchema = z.object({
  id: z.string().uuid(),
  outputId: z.string().uuid(),
  kind: z.enum(["human", "model", "external-framework"]),
  judgeModelId: z.string().min(1).max(160).nullable(),
  frameworkId: stableIdSchema.nullable(),
  frameworkVersion: z.string().min(1).max(120).nullable(),
  dimension: stableIdSchema,
  version: z.string().min(1).max(120),
  score: z.number().finite().nullable(),
  preferenceSelected: z.boolean().nullable(),
  numericValue: z.number().finite().nullable(),
  booleanValue: z.boolean().nullable(),
  textValue: z.string().max(2_000).nullable(),
  unit: z.string().min(1).max(80).nullable(),
  threshold: z.number().finite().nullable(),
  rubricVersion: z.string().min(1).max(120).nullable(),
  blindState: z.enum(["not-blind", "blind", "revealed"]),
  ratedBeforeReveal: z.boolean(),
  provenance: boundedJsonObject(8_192),
  createdAt: timestampSchema,
}).strict();

const benchmarkPrivateArtifactProjectionSchema = z.object({
  id: z.string().uuid(),
  outputId: z.string().uuid().nullable(),
  kind: z.enum(["audio", "transcript", "trace", "evidence", "configuration", "event-stream"]),
  storageBackend: z.enum(["ephemeral", "local"]),
  objectKey: z.string().min(1).max(400),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().min(0).max(2_621_440),
  contentHash: sha256Schema,
  state: z.enum(["active", "expired", "deleted"]),
  retentionExpiresAt: timestampSchema,
}).strict();

export const benchmarkPrivateResultProjectionSchema = z.object({
  schemaVersion: z.literal(BENCHMARK_PRIVATE_RESULT_PROJECTION_VERSION),
  run: z.object({
    id: z.string().uuid(),
    runId: z.string().uuid(),
    evaluationId: z.string().uuid(),
    category: benchmarkModalitySchema,
    status: z.enum(["pending", "running", "complete", "partial", "cancelled", "timed-out", "unavailable", "failed"]),
    methodologyVersion: z.string().min(1).max(80),
    metricVersion: z.string().min(1).max(120),
    evaluationMode: z.enum(["standardized", "provider-optimized"]),
    executionMode: z.enum(["fixture", "protected-live", "local-live", "imported"]),
    environment: z.string().min(1).max(80),
    deployment: z.string().min(1).max(160),
    region: z.string().min(1).max(80).nullable(),
    requestedAt: timestampSchema,
    completedAt: timestampSchema.nullable(),
    visibility: benchmarkVisibilityStateSchema,
    publicationState: z.enum(["private", "eligible", "published", "revoked"]),
    sponsorshipDisclosure: z.string().min(1).max(300).nullable(),
    integrityState: z.enum(["unverified", "hash-verified", "signature-verified", "verification-failed"]),
    bundleHash: sha256Schema,
    configuration: boundedJsonObject(65_536),
  }).strict(),
  input: z.object({
    type: z.enum(["text", "audio", "event-stream"]),
    exactText: z.string().max(20_000).nullable(),
    reference: z.string().max(400).nullable(),
    hash: sha256Schema,
  }).strict(),
  outputs: z.array(benchmarkPrivateOutputProjectionSchema).max(4),
  judgments: z.array(benchmarkPrivateJudgmentProjectionSchema).max(200),
  artifacts: z.array(benchmarkPrivateArtifactProjectionSchema).max(100),
}).strict().superRefine((result, context) => {
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 2_097_152) {
    context.addIssue({ code: "custom", message: "Private benchmark result projection exceeds two megabytes." });
  }
});

export const benchmarkRetrieveResultInputSchema = z.object({ runId: z.string().uuid() }).strict();

export const benchmarkPublicSnapshotListInputSchema = z.object({
  suiteId: stableIdSchema.optional(),
  limit: z.number().int().min(1).max(50).default(20),
  before: z.object({ asOfAt: timestampSchema, snapshotId: z.string().uuid() }).strict().optional(),
}).strict();

export const benchmarkPublicSnapshotListItemSchema = z.object({
  snapshotId: z.string().uuid(),
  suite: z.object({ id: stableIdSchema, version: z.string().min(1).max(80), name: z.string().min(1).max(160) }).strict(),
  case: z.object({ id: stableIdSchema, version: z.string().min(1).max(80), inputHash: sha256Schema }).strict(),
  category: benchmarkModalitySchema,
  methodology: z.object({ id: stableIdSchema, version: z.string().min(1).max(80) }).strict(),
  metric: z.object({
    name: stableIdSchema,
    version: z.string().min(1).max(120),
    statistic: z.enum(["count", "mean", "median", "p50", "p95", "distribution-bin", "preference-rate"]),
    unit: z.string().min(1).max(40),
  }).strict(),
  asOfAt: timestampSchema,
  sampleCount: z.number().int().min(1).max(1_000_000),
  payloadDigest: sha256Schema,
  verifiedAt: timestampSchema,
  sponsorshipDisclosures: z.array(z.string().min(1).max(300)).max(10),
  sponsorshipDisclosureCount: z.number().int().min(0).max(2_000),
}).strict().superRefine((item, context) => {
  if (item.sponsorshipDisclosureCount < item.sponsorshipDisclosures.length) {
    context.addIssue({ code: "custom", path: ["sponsorshipDisclosureCount"], message: "The total sponsorship disclosure count cannot be below the returned bounded prefix." });
  }
});

export const benchmarkPublicSnapshotListSchema = z.object({
  schemaVersion: z.literal(BENCHMARK_PUBLIC_LIST_VERSION),
  items: z.array(benchmarkPublicSnapshotListItemSchema).max(50),
  nextCursor: z.object({ asOfAt: timestampSchema, snapshotId: z.string().uuid() }).strict().nullable(),
}).strict();

export type BenchmarkPrivateResultProjection = z.infer<typeof benchmarkPrivateResultProjectionSchema>;
export type BenchmarkPublicSnapshotList = z.infer<typeof benchmarkPublicSnapshotListSchema>;
export type BenchmarkPublicSnapshotListInput = z.input<typeof benchmarkPublicSnapshotListInputSchema>;
