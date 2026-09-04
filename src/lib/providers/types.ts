import { z } from "zod";

import type { TtsRequest } from "@/lib/types";
import type { ProviderExecutionAuthorization } from "@/lib/providers/execution-policy";
import type { NormalizedProviderModel, NormalizedProviderVoice } from "@/lib/providers/platform-types";

export const PROVIDER_IDS = ["deepgram", "elevenlabs", "fish-audio", "cartesia"] as const;
export const PROVIDER_STATUSES = ["Working", "Prototype", "Demo-only", "Partial", "Planned"] as const;
export const PROVIDER_CAPABILITIES = [
  "models",
  "voices",
  "stt-prerecorded",
  "stt-streaming",
  "conversational-stt",
  "tts",
  "voice-agent",
  "temporary-browser-auth",
  "docs-evidence",
  "text-intelligence",
] as const;
export const PROVIDER_EXPERIENCES = ["talk", "upload", "generate", "agent"] as const;
export const PROVIDER_EVIDENCE_STATES = [
  "Repository verified",
  "Documentation verified",
  "Manual verification required",
  "No implementation evidence",
] as const;

export const providerIdSchema = z.enum(PROVIDER_IDS);
export const providerStatusSchema = z.enum(PROVIDER_STATUSES);
export const providerCapabilitySchema = z.enum(PROVIDER_CAPABILITIES);
export const providerExperienceSchema = z.enum(PROVIDER_EXPERIENCES);
export const providerEvidenceStateSchema = z.enum(PROVIDER_EVIDENCE_STATES);

export type ProviderId = z.infer<typeof providerIdSchema>;
export type ProviderStatus = z.infer<typeof providerStatusSchema>;
export type ProviderCapability = z.infer<typeof providerCapabilitySchema>;
export type ProviderExperience = z.infer<typeof providerExperienceSchema>;
export type ProviderEvidenceState = z.infer<typeof providerEvidenceStateSchema>;

export const providerModuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  href: z.string().startsWith("/"),
  capabilities: z.array(providerCapabilitySchema).min(1),
}).strict();

export const providerCapabilityRecordSchema = z.object({
  id: providerCapabilitySchema,
  status: providerStatusSchema,
  evidence: providerEvidenceStateSchema,
  adapterAvailable: z.boolean(),
}).strict();

const serverOnlyEnvironmentVariableSchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]*$/)
  .refine((name) => !name.startsWith("NEXT_PUBLIC_"), {
    message: "Provider credential variables must remain server-only.",
  });

export const providerManifestSchema = z
  .object({
    id: providerIdSchema,
    displayName: z.string().min(1),
    featured: z.boolean(),
    visualAccent: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    status: providerStatusSchema,
    description: z.string().min(1),
    capabilities: z.array(providerCapabilityRecordSchema),
    modules: z.array(providerModuleSchema),
    supportedExperiences: z.array(providerExperienceSchema),
    documentationReferences: z.array(z.object({
      title: z.string().min(1),
      url: z.string().url(),
      verifiedAt: z.string().date().optional(),
      status: z.enum(["Documentation verified", "Repository verified"]).optional(),
    }).strict()),
    environmentVariables: z.array(serverOnlyEnvironmentVariableSchema),
    evidence: providerEvidenceStateSchema,
    liveExecutionEnabled: z.boolean(),
    adapterCapabilities: z.array(providerCapabilitySchema),
    limitations: z.array(z.string().min(1)).min(1),
  })
  .strict()
  .superRefine((manifest, context) => {
    if (
      manifest.status === "Planned" &&
      (manifest.capabilities.length > 0 ||
        manifest.modules.length > 0 ||
        manifest.environmentVariables.length > 0 ||
        manifest.adapterCapabilities.length > 0 ||
        manifest.liveExecutionEnabled)
    ) {
      context.addIssue({
        code: "custom",
        message: "Planned providers cannot declare executable integration state.",
        path: ["status"],
      });
    }

    const capabilities = new Map(manifest.capabilities.map((capability) => [capability.id, capability]));
    const adapterCapabilities = new Set(manifest.adapterCapabilities);

    for (const capability of manifest.capabilities) {
      if (capability.adapterAvailable !== adapterCapabilities.has(capability.id)) {
        context.addIssue({
          code: "custom",
          message: "Adapter availability must match adapterCapabilities.",
          path: ["capabilities", capability.id],
        });
      }
    }

    for (const capability of manifest.adapterCapabilities) {
      if (!capabilities.get(capability)?.adapterAvailable) {
        context.addIssue({
          code: "custom",
          message: "Each adapter capability must have an implemented capability record.",
          path: ["adapterCapabilities", capability],
        });
      }
    }

    for (const labModule of manifest.modules) {
      for (const capability of labModule.capabilities) {
        const record = capabilities.get(capability);
        if (!record || record.status === "Planned") {
          context.addIssue({
            code: "custom",
            message: "Provider modules may reference only evidenced, non-Planned capabilities.",
            path: ["modules", labModule.id, capability],
          });
        }
      }
    }
  });

export type ProviderModule = z.infer<typeof providerModuleSchema>;
export type ProviderCapabilityRecord = z.infer<typeof providerCapabilityRecordSchema>;
export type ProviderManifest = z.infer<typeof providerManifestSchema>;

export type ProviderConfigurationState = Readonly<{
  providerId: ProviderId;
  configured: boolean;
}>;

export type ProviderLanguageMetadata = Readonly<{
  id: string;
  name?: string;
}>;

export type ProviderModelMetadata = Readonly<{
  provider: ProviderId;
  id: string;
  name: string;
  description?: string;
  capabilities: Readonly<{
    textToSpeech?: boolean;
    voiceConversion?: boolean;
    fineTuning?: boolean;
    style?: boolean;
    speakerBoost?: boolean;
  }>;
  languages: readonly ProviderLanguageMetadata[];
  limits?: Readonly<{
    maximumTextLengthPerRequest?: number;
    maxCharactersFreeUser?: number;
    maxCharactersSubscribedUser?: number;
  }>;
}>;

export type ProviderVoiceMetadata = Readonly<{
  provider: ProviderId;
  id: string;
  name: string;
  category?: string;
  labels: Readonly<Record<string, string>>;
  description?: string;
  previewAvailable: boolean;
}>;

export type ProviderModelListResult = Readonly<{
  provider: ProviderId;
  models: readonly ProviderModelMetadata[];
  /** Safe dispatch provenance for route evidence; omitted by transitional adapters. */
  discoveryState?: "static" | "live" | "cache-fresh" | "cache-stale";
}>;

export type ProviderVoiceListResult = Readonly<{
  provider: ProviderId;
  voices: readonly ProviderVoiceMetadata[];
  hasMore: boolean;
  nextPageToken?: string;
  /** Safe dispatch provenance for route evidence; omitted by transitional adapters. */
  discoveryState?: "static" | "live" | "cache-fresh" | "cache-stale";
}>;

export type ProviderTtsRequest = Omit<TtsRequest, "model"> & Readonly<{
  model?: string;
  voice?: string;
  outputFormat?: string;
}>;

export type ProviderTtsExecutionContext = Readonly<{
  signal?: AbortSignal;
  maxAudioBytes?: number;
  authorization?: ProviderExecutionAuthorization;
  /** Operation-bound proof for providers that validate the selected model through live discovery. */
  modelDiscoveryAuthorization?: ProviderExecutionAuthorization;
  /** Operation-bound proof for providers that validate the selected voice through live discovery. */
  discoveryAuthorization?: ProviderExecutionAuthorization;
}>;

export type ProviderTtsEvaluationProfile = Readonly<{
  standardizedOutputFormat: string;
  nativeOutputFormats: readonly string[];
  optionalVoiceSentinel?: string;
  /** Whether the provider uses a separate voice ID, an optional voice, or a voice encoded in the model ID. */
  voiceSelectionMode?: "separate" | "optional" | "model-id";
  currentModelIds?: readonly string[];
  standardizedRequest?: Readonly<Partial<ProviderTtsRequest>>;
  nativeOutputRequests?: Readonly<Record<string, Readonly<Partial<ProviderTtsRequest>>>>;
  standardizedConfiguration?: Readonly<Record<string, string | number | boolean | null>>;
}>;

export type ProviderTtsTiming = Readonly<{
  clock: "monotonic";
  measurementPoint: "one-server";
  requestTimestamp: string;
  firstAudioTimestamp: string;
  completionTimestamp: string;
  timeToFirstAudioMs: number;
  totalTimeMs: number;
}>;

export type ProviderTtsResult = Readonly<{
  audio: ArrayBuffer;
  contentType: string;
  model: string;
  encoding: string;
  container?: string;
  sampleRate?: number;
  requestId?: string;
  responseHeaders: Record<string, string>;
  voice?: string;
  outputFormat?: string;
  timing: ProviderTtsTiming;
}>;

export type ProviderHealthResult = Readonly<{
  state: "available" | "degraded" | "unavailable" | "unknown";
  checkedAt: string;
  region?: string;
  detail?: string;
}>;

export type ProviderTtsCostEstimate = Readonly<{
  amountUsd: number;
  pricingVersion: string;
  effectiveAt: string;
  formula: string;
  provenance: string;
}>;

export interface ProviderTtsAdapter {
  readonly providerId: ProviderId;
  readonly capability: "tts";
  readonly adapterVersion: string;
  readonly requiresExplicitPolicyAuthorization?: true;
  readonly evaluationProfile?: ProviderTtsEvaluationProfile;
  buildEndpointPreview(payload: Partial<ProviderTtsRequest>): string;
  execute(payload: ProviderTtsRequest, context?: ProviderTtsExecutionContext): Promise<ProviderTtsResult>;
  checkHealth?(context?: ProviderTtsExecutionContext): Promise<ProviderHealthResult>;
  estimateCost?(payload: ProviderTtsRequest): Promise<ProviderTtsCostEstimate | null>;
}

export type ProviderSttRequest = Readonly<{
  file: File;
  model: string;
  language?: string;
}>;

export type ProviderSttResult = Readonly<{
  provider: ProviderId;
  transcript: string;
  model: string;
  language?: string;
  requestId?: string;
  details: Readonly<Record<string, unknown>>;
}>;

export interface ProviderSttAdapter {
  readonly providerId: ProviderId;
  readonly capability: "stt-prerecorded";
  readonly adapterVersion: string;
  readonly requiresExplicitPolicyAuthorization?: true;
  readonly maxFileBytes: number;
  execute(payload: ProviderSttRequest, context?: ProviderTtsExecutionContext): Promise<ProviderSttResult>;
}

export interface ProviderCatalogAdapter {
  readonly providerId: ProviderId;
  readonly capabilities: readonly ("models" | "voices")[];
  readonly adapterVersion: string;
  readonly modelsRequireExecutionAuthorization?: true;
  readonly voicesRequireExecutionAuthorization?: true;
  readonly evaluationProfile?: ProviderTtsEvaluationProfile;
  listModels(context?: ProviderTtsExecutionContext): Promise<ProviderModelListResult>;
  listVoices(input: Readonly<{
    pageSize: number;
    search?: string;
    nextPageToken?: string;
    voiceIds?: readonly string[];
  }>, context?: ProviderTtsExecutionContext): Promise<ProviderVoiceListResult>;
}

export type ProviderNormalizedModelListResult = Readonly<{
  providerId: ProviderId;
  state: "static" | "live" | "cache-fresh" | "cache-stale";
  models: readonly NormalizedProviderModel[];
}>;

export type ProviderNormalizedVoiceListResult = Readonly<{
  providerId: ProviderId;
  state: "static" | "live" | "cache-fresh" | "cache-stale";
  voices: readonly NormalizedProviderVoice[];
  hasMore: boolean;
  nextPageToken?: string;
}>;

export interface ProviderNormalizedDiscoveryAdapter {
  readonly providerId: ProviderId;
  readonly capabilities: readonly ("models" | "voices")[];
  readonly adapterVersion: string;
  readonly modelVisibility: "public" | "account-scoped";
  readonly voiceVisibility: "public-only" | "account-scoped";
  readonly modelsRequireExecutionAuthorization: boolean;
  readonly voicesRequireExecutionAuthorization: boolean;
  listModels(context?: ProviderTtsExecutionContext): Promise<ProviderNormalizedModelListResult>;
  listVoices(input: Readonly<{
    pageSize: number;
    search?: string;
    nextPageToken?: string;
    voiceIds?: readonly string[];
  }>, context?: ProviderTtsExecutionContext): Promise<ProviderNormalizedVoiceListResult>;
}
