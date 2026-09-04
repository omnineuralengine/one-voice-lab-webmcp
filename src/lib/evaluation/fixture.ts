import { pcm16MonoToWav, STANDARDIZED_AUDIO } from "@/lib/evaluation/audio";
import type { EvaluationCatalogResponse, EvaluationProviderSelection } from "@/lib/evaluation/schema";
import type { ProviderId } from "@/lib/providers/types";

const FIXTURE_DURATION_SECONDS = 0.42;

export function fixtureModelId(providerId: ProviderId): string {
  return `fixture-${providerId}-tts-v1`;
}

export function fixtureVoiceId(providerId: ProviderId): string {
  return `fixture-${providerId}-voice-v1`;
}

export function buildFixtureCatalog(providerId: ProviderId): EvaluationCatalogResponse {
  return {
    schemaVersion: "one-voice-evidence/1.0.0",
    providerId,
    mode: "fixture",
    source: "deterministic-fixture",
    models: [{
      id: fixtureModelId(providerId),
      name: "Deterministic fixture model",
      description: "Local test data only. This identifier is not a provider model and never makes a provider request.",
      languages: ["fixture"],
    }],
    voices: [{
      id: fixtureVoiceId(providerId),
      name: "Deterministic fixture voice",
      description: "A short locally generated tone used to verify comparison controls without provider spend.",
      previewAvailable: true,
    }],
    hasMoreVoices: false,
    nextVoicePageToken: null,
    separateVoiceRequired: true,
    outputFormat: "fixture-wav",
    normalizedOutput: {
      encoding: "pcm_s16le",
      sampleRate: 24_000,
      channels: 1,
      mimeType: "audio/wav",
      serverWrapped: true,
    },
    message: "Fixture mode is simulated and does not establish provider quality, latency, availability, or model support.",
    limitations: ["The audio is an identical neutral interaction tone for every provider, not synthesized speech or provider evidence."],
  };
}

export function assertFixtureSelection(selection: EvaluationProviderSelection): void {
  if (selection.model !== fixtureModelId(selection.providerId) || selection.voice !== fixtureVoiceId(selection.providerId)) {
    throw new Error("Fixture mode accepts only the clearly labeled deterministic fixture model and voice.");
  }
  if (Object.keys(selection.providerSpecificConfiguration).length > 0) {
    throw new Error("Provider-native configuration is unavailable in deterministic fixture mode.");
  }
}

export function createDeterministicFixtureWav(): Uint8Array {
  const sampleCount = Math.round(STANDARDIZED_AUDIO.sampleRate * FIXTURE_DURATION_SECONDS);
  const pcm = new Uint8Array(sampleCount * 2);
  const view = new DataView(pcm.buffer);
  const frequency = 330;
  const fadeSamples = Math.max(1, Math.round(STANDARDIZED_AUDIO.sampleRate * 0.025));
  for (let index = 0; index < sampleCount; index += 1) {
    const fadeIn = Math.min(1, index / fadeSamples);
    const fadeOut = Math.min(1, (sampleCount - index - 1) / fadeSamples);
    const envelope = Math.max(0, Math.min(fadeIn, fadeOut));
    const sample = Math.round(Math.sin((2 * Math.PI * frequency * index) / STANDARDIZED_AUDIO.sampleRate) * 0x1fff * envelope);
    view.setInt16(index * 2, sample, true);
  }
  return pcm16MonoToWav(pcm);
}
