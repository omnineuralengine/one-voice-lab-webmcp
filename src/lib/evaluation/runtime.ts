import {
  EVALUATION_MAX_TEXT_LENGTH,
  EVALUATION_SCHEMA_VERSION,
  evaluationCapabilitiesResponseSchema,
  type EvaluationCapabilitiesResponse,
} from "@/lib/evaluation/schema";
import { getProviderConfigurationState } from "@/lib/providers/configuration";
import { getProviderAdapterRegistration } from "@/lib/providers/adapters";
import { PROVIDER_REGISTRY } from "@/lib/providers/registry";
import type { ProviderId } from "@/lib/providers/types";
import {
  isOpenLabCartesiaEnabled,
  isOpenLabDeepgramEnabled,
  isOpenLabElevenLabsEnabled,
  isOpenLabFishAudioEnabled,
} from "@/lib/open-lab";

export type EvaluationEnvironment = Readonly<Record<string, string | undefined>>;

const DEFAULT_RUNTIME_TEXT_LIMIT = 320;
const MIN_RUNTIME_TEXT_LIMIT = 80;

const PROTECTED_VOICE_ALLOWLIST_VARIABLES = {
  elevenlabs: "ONE_EVALUATE_ELEVENLABS_VOICE_IDS",
  cartesia: "ONE_EVALUATE_CARTESIA_VOICE_IDS",
} as const;

export function getEvaluationRuntimeMaxTextLength(environment: EvaluationEnvironment = process.env): number {
  const configured = Number.parseInt(environment.ONE_EVALUATE_MAX_TEXT_LENGTH ?? "", 10);
  if (!Number.isFinite(configured)) return DEFAULT_RUNTIME_TEXT_LIMIT;
  return Math.min(EVALUATION_MAX_TEXT_LENGTH, Math.max(MIN_RUNTIME_TEXT_LIMIT, configured));
}

export function getEvaluationCapabilities(
  environment: EvaluationEnvironment = process.env,
): EvaluationCapabilitiesResponse {
  const maximumTextLength = getEvaluationRuntimeMaxTextLength(environment);
  const liveEvaluationEnabled = environment.ONE_LIVE_EVALS_ENABLED === "true";
  const productionMasterEnabled = environment.NODE_ENV !== "production" || environment.ONE_LIVE_LAB_ENABLED === "true";
  const durableIdentityConfigured = hasDurableIdentityConfiguration(environment);
  const protectedInfrastructureAvailable = liveEvaluationEnabled && productionMasterEnabled && durableIdentityConfigured;

  return evaluationCapabilitiesResponseSchema.parse({
    schemaVersion: EVALUATION_SCHEMA_VERSION,
    executionDefault: "fixture",
    liveEvaluationsEnabled: protectedInfrastructureAvailable,
    anonymousLiveEvaluationsEnabled: protectedInfrastructureAvailable
      && environment.ONE_LIVE_EVALS_ANONYMOUS_ENABLED === "true"
      && hasDurableGuestConfiguration(environment),
    localLiveAvailable: environment.NODE_ENV !== "production" && liveEvaluationEnabled,
    maximumTextLength,
    providers: PROVIDER_REGISTRY.map((manifest) => {
      const configured = getProviderConfigurationState(manifest.id, environment).configured;
      const adapterBacked = manifest.adapterCapabilities.includes("tts");
      const requiresAsynchronousPolicyProof = getProviderAdapterRegistration(manifest.id)?.tts
        ?.requiresExplicitPolicyAuthorization === true;
      const effectiveLiveEnabled = configured
        && adapterBacked
        && manifest.liveExecutionEnabled
        && isEvaluationProviderRuntimeEnabled(manifest.id, environment)
        && hasRequiredProtectedVoiceApproval(manifest.id, environment)
        && protectedInfrastructureAvailable;
      const localLiveAvailable = environment.NODE_ENV !== "production"
        && liveEvaluationEnabled
        && configured
        && adapterBacked
        && manifest.liveExecutionEnabled
        && isEvaluationProviderRuntimeEnabled(manifest.id, environment)
        && !requiresAsynchronousPolicyProof;
      return {
        id: manifest.id,
        displayName: manifest.displayName,
        implementation: implementationStatus(manifest.status, adapterBacked),
        readiness: {
          listed: true as const,
          configured,
          adapterBacked,
          liveEnabled: effectiveLiveEnabled,
        },
        protectedLiveAvailable: effectiveLiveEnabled && !requiresAsynchronousPolicyProof,
        localLiveAvailable,
        fixtureAvailable: true as const,
        limitations: manifest.limitations,
      };
    }),
  });
}

export function isEvaluationProviderRuntimeEnabled(providerId: ProviderId, environment: EvaluationEnvironment = process.env): boolean {
  const variableName: Record<ProviderId, string> = {
    deepgram: "OPEN_LAB_DEEPGRAM_ENABLED",
    elevenlabs: "OPEN_LAB_ELEVENLABS_ENABLED",
    "fish-audio": "OPEN_LAB_FISH_AUDIO_ENABLED",
    cartesia: "OPEN_LAB_CARTESIA_ENABLED",
  };
  if (environment[variableName[providerId]]?.trim().toLowerCase() !== "true") return false;
  return {
    deepgram: isOpenLabDeepgramEnabled,
    elevenlabs: isOpenLabElevenLabsEnabled,
    "fish-audio": isOpenLabFishAudioEnabled,
    cartesia: isOpenLabCartesiaEnabled,
  }[providerId](environment);
}

export function getProtectedEvaluationVoiceIds(
  providerId: ProviderId,
  environment: EvaluationEnvironment = process.env,
): ReadonlySet<string> | null {
  if (providerId !== "elevenlabs" && providerId !== "cartesia") return null;
  const value = environment[PROTECTED_VOICE_ALLOWLIST_VARIABLES[providerId]] ?? "";
  const maximumVoiceIds = providerId === "cartesia" ? 10 : 100;
  return new Set(value
    .split(",")
    .map((voiceId) => voiceId.trim())
    .filter((voiceId) => /^[A-Za-z0-9._:-]{1,200}$/.test(voiceId))
    .slice(0, maximumVoiceIds));
}

export function hasRequiredProtectedVoiceApproval(
  providerId: ProviderId,
  environment: EvaluationEnvironment = process.env,
): boolean {
  const approved = getProtectedEvaluationVoiceIds(providerId, environment);
  return approved === null || approved.size > 0;
}

export function hasDurableIdentityConfiguration(environment: EvaluationEnvironment = process.env): boolean {
  return Boolean(
    environment.NEXT_PUBLIC_SUPABASE_URL?.trim()
    && environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim(),
  );
}

export function hasDurableGuestConfiguration(environment: EvaluationEnvironment = process.env): boolean {
  return hasDurableIdentityConfiguration(environment) && Boolean(environment.LAB_USAGE_GUARD_TOKEN?.trim());
}

function implementationStatus(status: string, adapterBacked: boolean) {
  if (status === "Planned") return "proposed" as const;
  if (status === "Demo-only") return "simulated" as const;
  if (!adapterBacked) return "unavailable" as const;
  if (status === "Working") return "implemented" as const;
  return "prototype" as const;
}
