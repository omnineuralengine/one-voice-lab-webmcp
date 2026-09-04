import "server-only";

import {
  DEEPGRAM_ADAPTER_VERSION,
  DEEPGRAM_MAX_STT_BYTES,
  generateCanonicalDeepgramSpeech,
  listDeepgramStaticModels,
  listDeepgramStaticVoices,
  listNormalizedDeepgramStaticModels,
  listNormalizedDeepgramStaticVoices,
  transcribeCanonicalDeepgramAudio,
} from "@/lib/providers/deepgram/client";
import { DEEPGRAM_NORMALIZED_VOICES } from "@/lib/providers/deepgram/normalization";
import type {
  ProviderCatalogAdapter,
  ProviderNormalizedDiscoveryAdapter,
  ProviderSttAdapter,
  ProviderTtsAdapter,
} from "@/lib/providers/types";

const evaluationProfile = Object.freeze({
  standardizedOutputFormat: "linear16",
  nativeOutputFormats: Object.freeze(["mp3", "linear16"]),
  voiceSelectionMode: "model-id" as const,
  currentModelIds: Object.freeze(DEEPGRAM_NORMALIZED_VOICES.map((voice) => voice.providerVoiceId)),
  standardizedRequest: Object.freeze({ encoding: "linear16", container: "none", sample_rate: 24_000 }),
  nativeOutputRequests: Object.freeze({
    mp3: Object.freeze({ encoding: "mp3" }),
    linear16: Object.freeze({ encoding: "linear16", container: "none", sample_rate: 24_000 }),
  }),
  standardizedConfiguration: Object.freeze({
    transport: "buffered-http",
    upstreamResponseMode: "stream-buffered-to-completion",
    voiceSelection: "model-id",
  }),
});

export const deepgramCatalogAdapter: ProviderCatalogAdapter = {
  providerId: "deepgram",
  capabilities: ["models", "voices"],
  adapterVersion: DEEPGRAM_ADAPTER_VERSION,
  evaluationProfile,
  listModels: listDeepgramStaticModels,
  listVoices: listDeepgramStaticVoices,
};

export const deepgramNormalizedDiscoveryAdapter: ProviderNormalizedDiscoveryAdapter = {
  providerId: "deepgram",
  capabilities: ["models", "voices"],
  adapterVersion: DEEPGRAM_ADAPTER_VERSION,
  modelVisibility: "public",
  voiceVisibility: "public-only",
  modelsRequireExecutionAuthorization: false,
  voicesRequireExecutionAuthorization: false,
  listModels: listNormalizedDeepgramStaticModels,
  listVoices: listNormalizedDeepgramStaticVoices,
};

export const deepgramTtsAdapter: ProviderTtsAdapter = {
  providerId: "deepgram",
  capability: "tts",
  adapterVersion: DEEPGRAM_ADAPTER_VERSION,
  requiresExplicitPolicyAuthorization: true,
  evaluationProfile,
  buildEndpointPreview(payload) {
    const endpoint = new URL("https://api.deepgram.com/v1/speak");
    endpoint.searchParams.set("model", payload.model || "aura-2-thalia-en");
    endpoint.searchParams.set("encoding", payload.encoding || "mp3");
    if (payload.container) endpoint.searchParams.set("container", payload.container);
    if (payload.sample_rate) endpoint.searchParams.set("sample_rate", String(payload.sample_rate));
    return endpoint.toString();
  },
  execute: generateCanonicalDeepgramSpeech,
};

export const deepgramSttAdapter: ProviderSttAdapter = {
  providerId: "deepgram",
  capability: "stt-prerecorded",
  adapterVersion: DEEPGRAM_ADAPTER_VERSION,
  requiresExplicitPolicyAuthorization: true,
  maxFileBytes: DEEPGRAM_MAX_STT_BYTES,
  execute: transcribeCanonicalDeepgramAudio,
};
