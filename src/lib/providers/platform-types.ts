import { z } from "zod";

/**
 * Catalog identifiers include integrated providers and explicitly catalog-only
 * entries. `ProviderId` in types.ts remains the narrower installed-integration
 * identity and is intentionally not widened by the catalog.
 */
export const PROVIDER_CATALOG_GROUPS = [
  "core-and-immediate",
  "benchmark-anchors",
  "specialist-voice",
  "local-and-self-hosted",
  "voice-stack-infrastructure",
  "evaluation-interoperability",
] as const;

export const PROVIDER_ENTITY_KINDS = [
  "speech-provider",
  "local-runtime",
  "voice-stack-infrastructure",
  "evaluation-system",
] as const;

export const PROVIDER_DISCOVERY_STATUSES = [
  "cataloged",
  "outreach-planned",
  "credentials-requested",
  "credentials-received",
] as const;
export const PROVIDER_INTEGRATION_STATUSES = [
  "adapter-missing",
  "adapter-in-progress",
  "fixture-validated",
  "contract-tests-passed",
  "configured",
] as const;
export const PROVIDER_RUNTIME_STATUSES = [
  "enabled",
  "disabled",
  "budget-paused",
  "degraded",
  "unavailable",
  "deprecated",
] as const;
export const PROVIDER_BENCHMARK_STATUSES = [
  "ineligible",
  "fixture-only",
  "private-testing",
  "benchmark-eligible",
  "publicly-ranked",
] as const;
export const PROVIDER_ADMINISTRATIVE_ACCESS_STATES = [
  "globally-disabled",
  "fixture-only",
  "private-testing",
  "trusted-user-access",
  "public-use",
  "budget-paused",
] as const;

export const NORMALIZED_PROVIDER_CAPABILITIES = [
  "discovery.models",
  "discovery.voices",
  "stt.prerecorded",
  "stt.streaming",
  "stt.partial-transcripts",
  "stt.final-transcripts",
  "stt.diarization",
  "stt.language-detection",
  "stt.multilingual",
  "stt.code-switching",
  "stt.word-timestamps",
  "stt.utterance-timestamps",
  "stt.turn-aware",
  "stt.phrase-biasing",
  "stt.custom-vocabulary",
  "stt.endpointing",
  "stt.speaker-identification",
  "stt.confidence",
  "tts.batch",
  "tts.streaming",
  "tts.voice-selection",
  "tts.custom-voices",
  "tts.voice-cloning",
  "tts.pronunciation-control",
  "tts.multilingual",
  "tts.timestamps",
  "tts.style-control",
  "tts.emotion-control",
  "tts.speed-control",
  "realtime.speech-to-speech",
  "realtime.conversation",
  "realtime.barge-in",
  "realtime.turn-detection",
  "realtime.reconnect",
  "realtime.transport",
  "realtime.server-agent",
  "realtime.client-streaming",
  "audio.summarization",
  "audio.sentiment",
  "audio.topic-extraction",
  "audio.intent-extraction",
  "audio.redaction",
  "audio.moderation",
  "audio.provider-post-processing",
  "deployment.hosted",
  "deployment.self-hosted",
  "deployment.local",
  "deployment.private-cloud",
  "deployment.regional",
  "deployment.on-premises",
] as const;

export const PROVIDER_CAPABILITY_FAMILIES = [
  "discovery",
  "speech-to-text",
  "text-to-speech",
  "realtime-voice",
  "audio-intelligence",
  "deployment",
] as const;
export const PROVIDER_CAPABILITY_SUPPORT_STATES = ["unknown", "unsupported", "supported"] as const;
export const PROVIDER_CAPABILITY_VERIFICATION_STATES = [
  "unverified",
  "provider-documented",
  "integration-supported",
  "one-verified",
  "benchmarked",
] as const;
export const PROVIDER_ADAPTER_KINDS = [
  "none",
  "model-discovery",
  "voice-discovery",
  "prerecorded-stt",
  "streaming-stt",
  "turn-aware-stt",
  "batch-tts",
  "streaming-tts",
  "realtime-voice",
  "audio-intelligence",
  "health",
] as const;
export const PROVIDER_INTEGRATION_PATHS = ["adapter", "legacy-route", "metadata-only", "none"] as const;
export const PROVIDER_CREDENTIAL_STATES = [
  "not-required",
  "unconfigured",
  "configured-not-runtime-verified",
  "invalid",
  "unknown",
  "environment-restricted",
] as const;
export const PROVIDER_READINESS_STATES = [
  "listed",
  "configured",
  "adapter-backed",
  "live-enabled",
  "unavailable",
] as const;
export const PROVIDER_HEALTH_STATES = [
  "configured",
  "unconfigured",
  "healthy",
  "degraded",
  "unavailable",
  "disabled",
  "budget-paused",
  "unknown",
] as const;

export const providerCatalogIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Provider IDs must be stable lowercase slugs.");
export const providerCatalogGroupSchema = z.enum(PROVIDER_CATALOG_GROUPS);
export const providerEntityKindSchema = z.enum(PROVIDER_ENTITY_KINDS);
export const providerDiscoveryStatusSchema = z.enum(PROVIDER_DISCOVERY_STATUSES);
export const providerIntegrationStatusSchema = z.enum(PROVIDER_INTEGRATION_STATUSES);
export const providerRuntimeStatusSchema = z.enum(PROVIDER_RUNTIME_STATUSES);
export const providerBenchmarkStatusSchema = z.enum(PROVIDER_BENCHMARK_STATUSES);
export const providerAdministrativeAccessSchema = z.enum(PROVIDER_ADMINISTRATIVE_ACCESS_STATES);
export const normalizedProviderCapabilityIdSchema = z.enum(NORMALIZED_PROVIDER_CAPABILITIES);
export const providerCapabilityFamilySchema = z.enum(PROVIDER_CAPABILITY_FAMILIES);
export const providerCapabilitySupportSchema = z.enum(PROVIDER_CAPABILITY_SUPPORT_STATES);
export const providerCapabilityVerificationSchema = z.enum(PROVIDER_CAPABILITY_VERIFICATION_STATES);
export const providerAdapterKindSchema = z.enum(PROVIDER_ADAPTER_KINDS);
export const providerIntegrationPathSchema = z.enum(PROVIDER_INTEGRATION_PATHS);
export const providerCredentialStateSchema = z.enum(PROVIDER_CREDENTIAL_STATES);
export const providerReadinessStateSchema = z.enum(PROVIDER_READINESS_STATES);
export const normalizedProviderHealthStateSchema = z.enum(PROVIDER_HEALTH_STATES);

const sourceUrlSchema = z.string().url().refine((value) => value.startsWith("https://"), {
  message: "Provider metadata sources must use HTTPS.",
});

export const providerMetadataSourceSchema = z.object({
  url: sourceUrlSchema,
  title: z.string().min(1).max(160),
  verifiedAt: z.string().date().optional(),
}).strict();

export const providerCapabilityDeclarationSchema = z.object({
  id: normalizedProviderCapabilityIdSchema,
  family: providerCapabilityFamilySchema,
  support: providerCapabilitySupportSchema,
  verification: providerCapabilityVerificationSchema,
  sources: z.array(providerMetadataSourceSchema).max(8),
  providerModelScope: z.array(z.string().min(1).max(160)).max(32).optional(),
  lastVerifiedAt: z.string().date().optional(),
  requiredAdapter: providerAdapterKindSchema,
  integrationPath: providerIntegrationPathSchema,
  costBearing: z.boolean(),
  benchmarkEligibility: z.enum(["ineligible", "fixture-only", "eligible"]),
}).strict().superRefine((capability, context) => {
  if (capability.verification !== "unverified" && capability.sources.length === 0) {
    context.addIssue({
      code: "custom",
      message: "Verified capability declarations require attributable source metadata.",
      path: ["sources"],
    });
  }
  if (capability.verification === "unverified" && capability.support !== "unknown") {
    context.addIssue({
      code: "custom",
      message: "Unverified capabilities cannot claim supported or unsupported behavior.",
      path: ["support"],
    });
  }
});

export const providerCatalogEntrySchema = z.object({
  id: providerCatalogIdSchema,
  displayName: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  group: providerCatalogGroupSchema,
  kind: providerEntityKindSchema,
  category: z.string().min(1).max(100),
  officialWebsite: sourceUrlSchema.optional(),
  officialDocumentation: sourceUrlSchema.optional(),
  metadataVerification: z.enum(["verified", "partially-verified", "unverified"]),
  metadataSources: z.array(providerMetadataSourceSchema).max(16),
  capabilities: z.array(providerCapabilityDeclarationSchema),
  deprecated: z.boolean(),
}).strict().superRefine((entry, context) => {
  if (entry.metadataVerification === "verified" && entry.metadataSources.length === 0) {
    context.addIssue({
      code: "custom",
      message: "Verified catalog entries require source metadata.",
      path: ["metadataSources"],
    });
  }
  const capabilityIds = new Set(entry.capabilities.map((capability) => capability.id));
  if (capabilityIds.size !== entry.capabilities.length) {
    context.addIssue({ code: "custom", message: "Capability IDs must be unique per provider.", path: ["capabilities"] });
  }
});

export const providerLifecycleSchema = z.object({
  discovery: providerDiscoveryStatusSchema,
  integration: providerIntegrationStatusSchema,
  access: providerAdministrativeAccessSchema,
  runtime: providerRuntimeStatusSchema,
  benchmark: providerBenchmarkStatusSchema,
}).strict();

export const providerCapabilityPolicySchema = z.object({
  capabilityId: normalizedProviderCapabilityIdSchema,
  access: providerAdministrativeAccessSchema,
  benchmarkStatus: providerBenchmarkStatusSchema,
}).strict();

export const providerOperationalPolicySchema = z.object({
  providerId: providerCatalogIdSchema,
  discoveryStatus: providerDiscoveryStatusSchema.optional(),
  access: providerAdministrativeAccessSchema,
  runtimeStatus: providerRuntimeStatusSchema.optional(),
  benchmarkStatus: providerBenchmarkStatusSchema,
  costAdmissionEnabled: z.boolean().default(false),
  capabilityPolicies: z.array(providerCapabilityPolicySchema).max(NORMALIZED_PROVIDER_CAPABILITIES.length),
  health: normalizedProviderHealthStateSchema.optional(),
  healthCheckedAt: z.string().datetime({ offset: true }).optional(),
  policyVersion: z.string().min(1).max(80),
}).strict().superRefine((policy, context) => {
  const ids = new Set(policy.capabilityPolicies.map((item) => item.capabilityId));
  if (ids.size !== policy.capabilityPolicies.length) {
    context.addIssue({ code: "custom", message: "Capability policies must be unique.", path: ["capabilityPolicies"] });
  }
});

export const normalizedProviderModelSchema = z.object({
  providerId: providerCatalogIdSchema,
  referenceId: z.string().regex(/^[a-z0-9]+(?:[._:-][a-z0-9]+)*$/),
  providerModelId: z.string().min(1).max(200),
  displayName: z.string().min(1).max(160),
  modality: z.enum(["speech-to-text", "text-to-speech", "realtime-voice", "audio-intelligence"]),
  capabilities: z.array(normalizedProviderCapabilityIdSchema),
  languages: z.array(z.string().min(2).max(35)).max(200),
  availability: z.enum(["available", "unavailable", "deprecated", "unknown"]),
  source: providerMetadataSourceSchema,
  lastVerifiedAt: z.string().date(),
}).strict();

export const normalizedProviderVoiceSchema = z.object({
  providerId: providerCatalogIdSchema,
  referenceId: z.string().regex(/^[a-z0-9]+(?:[._:-][a-z0-9]+)*$/),
  providerVoiceId: z.string().min(1).max(200),
  displayName: z.string().min(1).max(160),
  supportedModelReferences: z.array(z.string().min(1).max(200)).max(200),
  languages: z.array(z.string().min(2).max(35)).max(200),
  availability: z.enum(["available", "unavailable", "deprecated", "unknown"]),
  source: providerMetadataSourceSchema,
  lastVerifiedAt: z.string().date(),
}).strict();

export const providerPlatformProjectionSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  id: providerCatalogIdSchema,
  displayName: z.string().min(1),
  description: z.string().min(1),
  group: providerCatalogGroupSchema,
  kind: providerEntityKindSchema,
  category: z.string().min(1),
  links: z.object({
    website: sourceUrlSchema.optional(),
    documentation: sourceUrlSchema.optional(),
  }).strict(),
  lifecycle: providerLifecycleSchema,
  readiness: z.object({
    state: providerReadinessStateSchema,
    explanation: z.string().min(1),
  }).strict(),
  credential: z.object({
    required: z.boolean(),
    state: providerCredentialStateSchema,
  }).strict(),
  health: z.object({
    state: normalizedProviderHealthStateSchema,
    checkedAt: z.string().datetime({ offset: true }).optional(),
    source: z.enum(["operational-policy", "configuration", "not-observed"]),
  }).strict(),
  integration: z.object({
    installed: z.boolean(),
    fixtureCapable: z.boolean(),
  }).strict(),
  capabilities: z.array(providerCapabilityDeclarationSchema),
  models: z.array(normalizedProviderModelSchema).max(200),
  voices: z.array(normalizedProviderVoiceSchema).max(200),
  metadata: z.object({
    verification: z.enum(["verified", "partially-verified", "unverified"]),
    sources: z.array(providerMetadataSourceSchema),
    lastVerifiedAt: z.string().date().optional(),
  }).strict(),
}).strict();

export type ProviderCatalogId = z.infer<typeof providerCatalogIdSchema>;
export type ProviderCatalogGroup = z.infer<typeof providerCatalogGroupSchema>;
export type ProviderAdministrativeAccessState = z.infer<typeof providerAdministrativeAccessSchema>;
export type ProviderRuntimeStatus = z.infer<typeof providerRuntimeStatusSchema>;
export type ProviderAdapterKind = z.infer<typeof providerAdapterKindSchema>;
export type NormalizedProviderCapabilityId = z.infer<typeof normalizedProviderCapabilityIdSchema>;
export type ProviderCapabilityDeclaration = z.infer<typeof providerCapabilityDeclarationSchema>;
export type ProviderCatalogEntry = z.infer<typeof providerCatalogEntrySchema>;
export type ProviderOperationalPolicy = z.infer<typeof providerOperationalPolicySchema>;
export type ProviderBenchmarkStatus = z.infer<typeof providerBenchmarkStatusSchema>;
export type NormalizedProviderModel = z.infer<typeof normalizedProviderModelSchema>;
export type NormalizedProviderVoice = z.infer<typeof normalizedProviderVoiceSchema>;
export type ProviderPlatformProjection = z.infer<typeof providerPlatformProjectionSchema>;
