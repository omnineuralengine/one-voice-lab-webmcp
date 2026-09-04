import type {
  EvaluationMetric,
  EvaluationProviderEvidence,
  EvaluationProviderStatus,
  EvaluationProviderSelection,
  HumanRating,
} from "@/lib/evaluation/schema";
import type { ProviderId } from "@/lib/providers/types";

export type CatalogOption = Readonly<{
  id: string;
  name: string;
  description?: string;
}>;

export type AdvancedControl = Readonly<{
  id: string;
  label: string;
  description: string;
  kind: "select" | "number" | "boolean" | "text";
  options?: readonly CatalogOption[];
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: string | number | boolean;
  comparisonNote: string;
}>;

export type EvaluateProviderCapability = Readonly<{
  id: ProviderId;
  displayName: string;
  implementation: "implemented" | "prototype" | "simulated" | "proposed" | "unsupported" | "unavailable";
  readiness: Readonly<{
    listed: boolean;
    configured: boolean;
    adapterBacked: boolean;
    liveEnabled: boolean;
  }>;
  protectedLiveAvailable: boolean;
  fixtureAvailable: boolean;
  localLiveAvailable: boolean;
  limitations: readonly string[];
}>;

export type EvaluateCapabilities = Readonly<{
  liveEvaluationsEnabled: boolean;
  anonymousLiveEvaluationsEnabled: boolean;
  localLiveAvailable: boolean;
  maximumTextLength: number;
  providers: readonly EvaluateProviderCapability[];
}>;

export type EvaluateCatalog = Readonly<{
  providerId: ProviderId;
  source: "deterministic-fixture" | "validated-static" | "provider-discovery" | "unavailable";
  message: string;
  hasMoreVoices: boolean;
  nextVoicePageToken: string | null;
  models: readonly CatalogOption[];
  voices: readonly CatalogOption[];
  separateVoiceRequired: boolean;
  outputFormat: string;
  normalizedOutput: Readonly<{
    encoding: string;
    sampleRate: number;
    channels: number;
    mimeType: string;
    serverWrapped: boolean;
  }> | null;
  advancedControls: readonly AdvancedControl[];
  limitations: readonly string[];
}>;

export type ProviderDraft = Readonly<{
  providerId: ProviderId;
  model: string;
  voice: string;
  outputFormat: string;
  providerSpecificConfiguration: EvaluationProviderSelection["providerSpecificConfiguration"];
}>;

export type EvaluationResult = Readonly<{
  evidence: EvaluationProviderEvidence;
  audioBase64: string | null;
}>;

export type ClientResult = Readonly<{
  evidence: EvaluationProviderEvidence;
  audioUrl: string | null;
}>;

export type ClientRunState = Readonly<Partial<Record<ProviderId, EvaluationProviderStatus | "idle">>>;

export type RatingDimension = Exclude<keyof HumanRating, "overallPreference" | "ratedAt" | "ratedBeforeReveal">;

export const RATING_DIMENSIONS: ReadonlyArray<{ id: RatingDimension; label: string }> = [
  { id: "naturalness", label: "Naturalness" },
  { id: "intelligibility", label: "Intelligibility" },
  { id: "pronunciation", label: "Pronunciation" },
  { id: "emotionalFit", label: "Emotional fit" },
  { id: "useCaseFit", label: "Use-case fit" },
];

export function emptyRunState(): ClientRunState {
  return {};
}

export function metricByName(
  evidence: EvaluationProviderEvidence,
  name: EvaluationMetric["name"],
): EvaluationMetric | null {
  return evidence.metrics.find((metric) => metric.name === name) ?? null;
}
