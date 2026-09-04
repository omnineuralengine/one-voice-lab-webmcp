import "server-only";

import {
  CARTESIA_TTS_MODELS,
  CARTESIA_TTS_OUTPUT_FORMATS,
  generateCartesiaSpeech,
  listCartesiaModels,
  listCartesiaVoices,
  listNormalizedCartesiaModels,
  listNormalizedCartesiaVoices,
} from "@/lib/providers/cartesia/client";
import { CARTESIA_ADAPTER_VERSION } from "@/lib/providers/cartesia/fixtures";
import type {
  ProviderCatalogAdapter,
  ProviderNormalizedDiscoveryAdapter,
  ProviderTtsAdapter,
} from "@/lib/providers/types";

const evaluationProfile = Object.freeze({
  standardizedOutputFormat: "raw",
  nativeOutputFormats: Object.freeze([...CARTESIA_TTS_OUTPUT_FORMATS]),
  voiceSelectionMode: "separate" as const,
  currentModelIds: Object.freeze([...CARTESIA_TTS_MODELS]),
  standardizedRequest: Object.freeze({
    outputFormat: "raw",
    encoding: "pcm_s16le",
    container: "raw",
    sample_rate: 24_000,
  }),
  nativeOutputRequests: Object.freeze({
    raw: Object.freeze({
      encoding: "pcm_s16le",
      container: "raw",
      sample_rate: 24_000,
    }),
  }),
  standardizedConfiguration: Object.freeze({
    transport: "buffered-http",
    upstreamResponseMode: "stream-buffered-to-completion",
    apiVersion: "2026-08-14",
  }),
});

export const cartesiaCatalogAdapter: ProviderCatalogAdapter = {
  providerId: "cartesia",
  capabilities: ["models", "voices"],
  adapterVersion: CARTESIA_ADAPTER_VERSION,
  voicesRequireExecutionAuthorization: true,
  evaluationProfile,
  listModels: listCartesiaModels,
  listVoices: listCartesiaVoices,
};

export const cartesiaNormalizedDiscoveryAdapter: ProviderNormalizedDiscoveryAdapter = {
  providerId: "cartesia",
  capabilities: ["models", "voices"],
  adapterVersion: CARTESIA_ADAPTER_VERSION,
  modelVisibility: "public",
  voiceVisibility: "account-scoped",
  modelsRequireExecutionAuthorization: false,
  voicesRequireExecutionAuthorization: true,
  listModels: listNormalizedCartesiaModels,
  listVoices: listNormalizedCartesiaVoices,
};

export const cartesiaTtsAdapter: ProviderTtsAdapter = {
  providerId: "cartesia",
  capability: "tts",
  adapterVersion: CARTESIA_ADAPTER_VERSION,
  requiresExplicitPolicyAuthorization: true,
  evaluationProfile,
  buildEndpointPreview() {
    return "https://api.cartesia.ai/tts/bytes";
  },
  execute: generateCartesiaSpeech,
};
