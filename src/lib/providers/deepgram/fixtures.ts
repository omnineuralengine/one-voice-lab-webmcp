import { getProviderCatalogEntry } from "@/lib/providers/catalog";
import type { ProviderContractCandidate, ProviderFixtureAdapter } from "@/lib/providers/contract-test-kit";
import { DEEPGRAM_ADAPTER_VERSION } from "@/lib/providers/deepgram/client";
import { DEEPGRAM_NORMALIZED_MODELS, DEEPGRAM_NORMALIZED_VOICES } from "@/lib/providers/deepgram/normalization";

function assertActive(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("The Deepgram fixture was cancelled.", "AbortError");
}

const modelDiscoveryFixture = Object.freeze({
  providerId: "deepgram",
  capabilityId: "discovery.models",
  adapterKind: "model-discovery",
  supportedCapabilityIds: Object.freeze(["discovery.models"] as const),
  adapterVersion: DEEPGRAM_ADAPTER_VERSION,
  fixtureOnly: true,
  async executeFixture(_input, context) {
    assertActive(context.signal);
    return Object.freeze({
      providerId: "deepgram",
      capabilityId: "discovery.models" as const,
      status: "complete" as const,
      provenance: "synthetic-fixture" as const,
      output: Object.freeze({ eventCount: DEEPGRAM_NORMALIZED_MODELS.length }),
    });
  },
} satisfies ProviderFixtureAdapter);

const voiceDiscoveryFixture = Object.freeze({
  providerId: "deepgram",
  capabilityId: "discovery.voices",
  adapterKind: "voice-discovery",
  supportedCapabilityIds: Object.freeze(["discovery.voices"] as const),
  adapterVersion: DEEPGRAM_ADAPTER_VERSION,
  fixtureOnly: true,
  async executeFixture(_input, context) {
    assertActive(context.signal);
    return Object.freeze({
      providerId: "deepgram",
      capabilityId: "discovery.voices" as const,
      status: "complete" as const,
      provenance: "synthetic-fixture" as const,
      output: Object.freeze({ eventCount: DEEPGRAM_NORMALIZED_VOICES.length }),
    });
  },
} satisfies ProviderFixtureAdapter);

const ttsFixture = Object.freeze({
  providerId: "deepgram",
  capabilityId: "tts.batch",
  adapterKind: "batch-tts",
  supportedCapabilityIds: Object.freeze(["tts.batch", "tts.voice-selection"] as const),
  adapterVersion: DEEPGRAM_ADAPTER_VERSION,
  fixtureOnly: true,
  async executeFixture(input, context) {
    assertActive(context.signal);
    const text = input.text?.trim() || "ONE deterministic Deepgram TTS fixture.";
    if (text.length > 1_000) throw new Error("Deepgram fixture text is limited to 1000 characters.");
    const audio = new TextEncoder().encode(`DEEPGRAM_SYNTHETIC_TTS:${text}`);
    return Object.freeze({
      providerId: "deepgram",
      capabilityId: "tts.batch" as const,
      status: "complete" as const,
      provenance: "synthetic-fixture" as const,
      output: Object.freeze({ mimeType: "audio/mpeg", byteLength: audio.byteLength }),
    });
  },
} satisfies ProviderFixtureAdapter);

const sttFixture = Object.freeze({
  providerId: "deepgram",
  capabilityId: "stt.prerecorded",
  adapterKind: "prerecorded-stt",
  supportedCapabilityIds: Object.freeze(["stt.prerecorded"] as const),
  adapterVersion: DEEPGRAM_ADAPTER_VERSION,
  fixtureOnly: true,
  async executeFixture(input, context) {
    assertActive(context.signal);
    const text = input.text?.trim() || "ONE deterministic Deepgram STT fixture.";
    return Object.freeze({
      providerId: "deepgram",
      capabilityId: "stt.prerecorded" as const,
      status: "complete" as const,
      provenance: "synthetic-fixture" as const,
      output: Object.freeze({ text, byteLength: input.audio?.byteLength ?? 0 }),
    });
  },
} satisfies ProviderFixtureAdapter);

export const DEEPGRAM_FIXTURE_ADAPTERS: readonly ProviderFixtureAdapter[] = Object.freeze([
  modelDiscoveryFixture,
  voiceDiscoveryFixture,
  ttsFixture,
  sttFixture,
]);

const deepgramCatalogEntry = getProviderCatalogEntry("deepgram");
if (!deepgramCatalogEntry) throw new Error("The canonical provider catalog is missing Deepgram.");

export const DEEPGRAM_CONTRACT_CANDIDATE: ProviderContractCandidate = Object.freeze({
  catalogEntry: deepgramCatalogEntry,
  adapters: DEEPGRAM_FIXTURE_ADAPTERS,
  benchmarkCompatibleCapabilities: Object.freeze(["stt.prerecorded", "tts.batch"] as const),
});
