import "server-only";

import { buildFixtureCatalog } from "@/lib/evaluation/fixture";
import { getProtectedEvaluationVoiceIds, type EvaluationEnvironment } from "@/lib/evaluation/runtime";
import { EVALUATION_SCHEMA_VERSION, evaluationCatalogResponseSchema, type EvaluationCatalogResponse } from "@/lib/evaluation/schema";
import { getProviderAdapterRegistration, resolveCatalogAdapter } from "@/lib/providers/adapters";
import { ProviderAdapterError } from "@/lib/providers/errors";
import { authorizeProviderExecution, type ProviderExecutionAuthorization } from "@/lib/providers/execution-policy";
import { requireProviderManifest } from "@/lib/providers/registry";
import type { ProviderCatalogAdapter, ProviderId } from "@/lib/providers/types";

export type EvaluationCatalogMode = "fixture" | "protected-live" | "local-live";

export type EvaluationCatalogDependencies = Readonly<{
  resolveAdapter?: (providerId: string, capability: "models" | "voices") => ProviderCatalogAdapter;
  signal?: AbortSignal;
  environment?: EvaluationEnvironment;
  authorizeExecution?: (providerId: string, operation: "models" | "voices") => Promise<ProviderExecutionAuthorization>;
}>;

export async function getEvaluationCatalog(
  providerId: ProviderId,
  mode: EvaluationCatalogMode,
  dependencies: EvaluationCatalogDependencies = {},
): Promise<EvaluationCatalogResponse> {
  requireProviderManifest(providerId);
  if (mode === "fixture") return buildFixtureCatalog(providerId);
  const approvedVoiceIds = mode === "protected-live"
    ? getProtectedEvaluationVoiceIds(providerId, dependencies.environment)
    : null;
  if (approvedVoiceIds && approvedVoiceIds.size === 0) {
    return unavailableCatalog(
      providerId,
      mode,
      "Protected live voice discovery is disabled until an explicit public/stock voice allowlist is configured.",
    );
  }

  const resolveAdapter = dependencies.resolveAdapter ?? resolveCatalogAdapter;
  let modelAdapter: ProviderCatalogAdapter;
  let voiceAdapter: ProviderCatalogAdapter;
  try {
    modelAdapter = resolveAdapter(providerId, "models");
    voiceAdapter = resolveAdapter(providerId, "voices");
  } catch (error) {
    if (!(error instanceof ProviderAdapterError)) throw error;
    return unavailableCatalog(providerId, mode, "Live model and voice discovery is not adapter-backed for this provider.");
  }

  const authorize = dependencies.authorizeExecution ?? authorizeProviderExecution;
  const modelAuthorization = modelAdapter.modelsRequireExecutionAuthorization
    ? await authorize(providerId, "models")
    : undefined;
  const voiceAuthorization = voiceAdapter.voicesRequireExecutionAuthorization
    ? await authorize(providerId, "voices")
    : undefined;

  const [modelsResult, voicesResult] = await Promise.all([
    modelAdapter.listModels({ signal: dependencies.signal, authorization: modelAuthorization }),
    voiceAdapter.listVoices({
      pageSize: approvedVoiceIds ? Math.min(100, approvedVoiceIds.size) : 100,
      ...(approvedVoiceIds ? { voiceIds: [...approvedVoiceIds] } : {}),
    }, { signal: dependencies.signal, authorization: voiceAuthorization }),
  ]);
  if (modelsResult.provider !== providerId || voicesResult.provider !== providerId) {
    return unavailableCatalog(providerId, mode, "The provider catalog returned mismatched provider metadata and was rejected.");
  }

  const voices = voicesResult.voices
    .filter((voice) => !approvedVoiceIds || approvedVoiceIds.has(voice.id))
    .map((voice) => ({
    id: voice.id,
    name: voice.name,
    description: voice.description ?? null,
    previewAvailable: voice.previewAvailable,
    }));
  const evaluationProfile = modelAdapter.evaluationProfile ?? voiceAdapter.evaluationProfile;
  const optionalVoiceSentinel = evaluationProfile?.optionalVoiceSentinel;
  if (optionalVoiceSentinel) {
    voices.unshift({
      id: optionalVoiceSentinel,
      name: "No separate voice ID",
      description: "Fish Audio may synthesize without a public reference voice. The executor omits the voice field for this sentinel.",
      previewAvailable: false,
    });
  }
  const modelIdCarriesVoice = evaluationProfile?.voiceSelectionMode === "model-id";
  const staticDiscovery = modelsResult.discoveryState === "static" && voicesResult.discoveryState === "static";

  return evaluationCatalogResponseSchema.parse({
    schemaVersion: EVALUATION_SCHEMA_VERSION,
    providerId,
    mode,
    source: staticDiscovery ? "validated-static" : "provider-discovery",
    models: modelsResult.models
      .filter((model) => model.capabilities.textToSpeech === true)
      .filter((model) => !evaluationProfile?.currentModelIds
        || evaluationProfile.currentModelIds.includes(model.id))
      .map((model) => ({
      id: model.id,
      name: model.name,
      description: model.description ?? null,
      languages: model.languages.map((language) => language.name ?? language.id),
      })),
    voices,
    hasMoreVoices: approvedVoiceIds ? false : voicesResult.hasMore,
    nextVoicePageToken: approvedVoiceIds ? null : voicesResult.nextPageToken ?? null,
    separateVoiceRequired: !optionalVoiceSentinel && !modelIdCarriesVoice,
    outputFormat: evaluationProfile?.standardizedOutputFormat ?? standardizedProviderOutputFormat(providerId),
    normalizedOutput: normalizedOutput(),
    message: modelIdCarriesVoice
      ? "Validated static provider metadata uses the selected model identifier for both synthesis model and voice selection."
      : approvedVoiceIds
      ? "Live model metadata and only explicitly approved public/stock voice identifiers were discovered through the server-side provider adapter."
      : "Live catalog metadata was discovered through the server-side provider adapter. Catalog availability does not guarantee synthesis success.",
    limitations: [modelIdCarriesVoice
      ? "This provider encodes voice selection in the model identifier rather than a separate voice field."
      : approvedVoiceIds
      ? "Hosted discovery is intentionally limited to the server operator's approved public/stock voice IDs; it does not expose the credential's account-wide voice catalog."
      : "Catalog discovery confirms identifiers visible to this server credential, not account quota, synthesis success, or equivalent behavior across providers."],
  });
}

function unavailableCatalog(
  providerId: ProviderId,
  mode: Exclude<EvaluationCatalogMode, "fixture">,
  message: string,
): EvaluationCatalogResponse {
  return evaluationCatalogResponseSchema.parse({
    schemaVersion: EVALUATION_SCHEMA_VERSION,
    providerId,
    mode,
    source: "unavailable",
    models: [],
    voices: [],
    hasMoreVoices: false,
    nextVoicePageToken: null,
    separateVoiceRequired: true,
    outputFormat: standardizedProviderOutputFormat(providerId),
    normalizedOutput: normalizedOutput(),
    message,
    limitations: ["No live catalog evidence is available for this provider through the current adapter contract."],
  });
}

export function standardizedProviderOutputFormat(providerId: ProviderId): string {
  const converged = getProviderAdapterRegistration(providerId)?.tts?.evaluationProfile?.standardizedOutputFormat;
  if (converged) return converged;
  if (providerId === "deepgram") return "linear16";
  return "raw";
}

function normalizedOutput() {
  return {
    encoding: "pcm_s16le" as const,
    sampleRate: 24_000 as const,
    channels: 1 as const,
    mimeType: "audio/wav" as const,
    serverWrapped: true,
  };
}
