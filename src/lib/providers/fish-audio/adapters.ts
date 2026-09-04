import "server-only";

import {
  FISH_AUDIO_TTS_MODELS,
  FISH_AUDIO_TTS_OUTPUT_FORMATS,
  FISH_AUDIO_MAX_STT_BYTES,
  generateFishAudioSpeech,
  listFishAudioModels,
  listFishAudioVoices,
  listNormalizedFishAudioModels,
  listNormalizedFishAudioVoices,
  transcribeFishAudio,
} from "@/lib/providers/fish-audio/client";
import { FISH_AUDIO_ADAPTER_VERSION } from "@/lib/providers/fish-audio/fixtures";
import type {
  ProviderCatalogAdapter,
  ProviderNormalizedDiscoveryAdapter,
  ProviderSttAdapter,
  ProviderTtsAdapter,
} from "@/lib/providers/types";

const evaluationProfile = Object.freeze({
  standardizedOutputFormat: "pcm",
  nativeOutputFormats: FISH_AUDIO_TTS_OUTPUT_FORMATS,
  optionalVoiceSentinel: "__fish_audio_optional_voice__",
  currentModelIds: Object.freeze(FISH_AUDIO_TTS_MODELS.slice(0, 2)),
  standardizedRequest: Object.freeze({ outputFormat: "pcm" }),
  standardizedConfiguration: Object.freeze({ transport: "buffered-http", normalize: true }),
});

export const fishAudioCatalogAdapter: ProviderCatalogAdapter = {
  providerId: "fish-audio",
  capabilities: ["models", "voices"],
  adapterVersion: FISH_AUDIO_ADAPTER_VERSION,
  voicesRequireExecutionAuthorization: true,
  evaluationProfile,
  listModels: listFishAudioModels,
  listVoices: listFishAudioVoices,
};

export const fishAudioNormalizedDiscoveryAdapter: ProviderNormalizedDiscoveryAdapter = {
  providerId: "fish-audio",
  capabilities: ["models", "voices"],
  adapterVersion: FISH_AUDIO_ADAPTER_VERSION,
  modelVisibility: "public",
  voiceVisibility: "public-only",
  modelsRequireExecutionAuthorization: false,
  voicesRequireExecutionAuthorization: true,
  listModels: listNormalizedFishAudioModels,
  listVoices: listNormalizedFishAudioVoices,
};

export const fishAudioTtsAdapter: ProviderTtsAdapter = {
  providerId: "fish-audio",
  capability: "tts",
  adapterVersion: FISH_AUDIO_ADAPTER_VERSION,
  requiresExplicitPolicyAuthorization: true,
  evaluationProfile,
  buildEndpointPreview() {
    return "https://api.fish.audio/v1/tts";
  },
  execute: generateFishAudioSpeech,
};

export const fishAudioSttAdapter: ProviderSttAdapter = {
  providerId: "fish-audio",
  capability: "stt-prerecorded",
  adapterVersion: FISH_AUDIO_ADAPTER_VERSION,
  requiresExplicitPolicyAuthorization: true,
  maxFileBytes: FISH_AUDIO_MAX_STT_BYTES,
  execute: transcribeFishAudio,
};
