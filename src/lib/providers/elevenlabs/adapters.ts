import "server-only";

import {
  ELEVENLABS_MAX_STT_BYTES,
  ELEVENLABS_TTS_OUTPUT_FORMATS,
  generateElevenLabsSpeech,
  listElevenLabsModels,
  listElevenLabsVoices,
  listNormalizedElevenLabsModels,
  listNormalizedElevenLabsVoices,
  transcribeElevenLabsAudio,
} from "@/lib/providers/elevenlabs/client";
import { ELEVENLABS_ADAPTER_VERSION } from "@/lib/providers/elevenlabs/fixtures";
import type {
  ProviderCatalogAdapter,
  ProviderNormalizedDiscoveryAdapter,
  ProviderSttAdapter,
  ProviderTtsAdapter,
} from "@/lib/providers/types";

const evaluationProfile = Object.freeze({
  standardizedOutputFormat: "pcm_24000",
  nativeOutputFormats: ELEVENLABS_TTS_OUTPUT_FORMATS,
  standardizedRequest: Object.freeze({ outputFormat: "pcm_24000" }),
  standardizedConfiguration: Object.freeze({
    transport: "buffered-http",
    upstreamResponseMode: "stream-buffered-to-completion",
  }),
});

export const elevenLabsCatalogAdapter: ProviderCatalogAdapter = {
  providerId: "elevenlabs",
  capabilities: ["models", "voices"],
  adapterVersion: ELEVENLABS_ADAPTER_VERSION,
  modelsRequireExecutionAuthorization: true,
  voicesRequireExecutionAuthorization: true,
  evaluationProfile,
  listModels: listElevenLabsModels,
  listVoices: listElevenLabsVoices,
};

export const elevenLabsNormalizedDiscoveryAdapter: ProviderNormalizedDiscoveryAdapter = {
  providerId: "elevenlabs",
  capabilities: ["models", "voices"],
  adapterVersion: ELEVENLABS_ADAPTER_VERSION,
  modelVisibility: "account-scoped",
  voiceVisibility: "account-scoped",
  modelsRequireExecutionAuthorization: true,
  voicesRequireExecutionAuthorization: true,
  listModels: listNormalizedElevenLabsModels,
  listVoices: listNormalizedElevenLabsVoices,
};

export const elevenLabsTtsAdapter: ProviderTtsAdapter = {
  providerId: "elevenlabs",
  capability: "tts",
  adapterVersion: ELEVENLABS_ADAPTER_VERSION,
  requiresExplicitPolicyAuthorization: true,
  evaluationProfile,
  buildEndpointPreview(payload) {
    const voiceId = payload.voice && /^[A-Za-z0-9._-]{1,80}$/.test(payload.voice)
      ? payload.voice
      : "{voice_id}";
    const streaming = payload.outputFormat === "pcm_24000";
    const endpoint = new URL(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}${streaming ? "/stream" : ""}`);
    endpoint.searchParams.set("output_format", payload.outputFormat || "mp3_44100_128");
    return endpoint.toString();
  },
  execute: generateElevenLabsSpeech,
};

export const elevenLabsSttAdapter: ProviderSttAdapter = {
  providerId: "elevenlabs",
  capability: "stt-prerecorded",
  adapterVersion: ELEVENLABS_ADAPTER_VERSION,
  requiresExplicitPolicyAuthorization: true,
  maxFileBytes: ELEVENLABS_MAX_STT_BYTES,
  execute: transcribeElevenLabsAudio,
};
