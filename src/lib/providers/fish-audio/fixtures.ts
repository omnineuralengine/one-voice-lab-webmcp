import { getProviderCatalogEntry } from "@/lib/providers/catalog";
import type {
  ProviderContractCandidate,
  ProviderFixtureAdapter,
} from "@/lib/providers/contract-test-kit";
import { FISH_AUDIO_NORMALIZED_MODELS, normalizeFishAudioPublicVoicePage } from "@/lib/providers/fish-audio/normalization";

export const FISH_AUDIO_ADAPTER_VERSION = "one-fish-audio-core/2.0.0";

export const FISH_AUDIO_PUBLIC_DISCOVERY_FIXTURES = Object.freeze({
  success: Object.freeze({
    items: Object.freeze([
      Object.freeze({ _id: "public-voice-1", title: "Public Fixture Voice", visibility: "public", languages: ["en"] }),
      Object.freeze({ _id: "private-voice-1", title: "Private Fixture Voice", visibility: "private", languages: ["en"] }),
    ]),
    has_more: false,
  }),
  empty: Object.freeze({ items: Object.freeze([]), has_more: false }),
  malformed: Object.freeze({ items: "not-an-array" }),
});

function assertActive(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("The Fish Audio fixture was cancelled.", "AbortError");
}

const modelDiscoveryFixture = Object.freeze({
  providerId: "fish-audio",
  capabilityId: "discovery.models",
  adapterKind: "model-discovery",
  supportedCapabilityIds: Object.freeze(["discovery.models"] as const),
  adapterVersion: FISH_AUDIO_ADAPTER_VERSION,
  fixtureOnly: true,
  async executeFixture(_input, context) {
    assertActive(context.signal);
    return Object.freeze({
      providerId: "fish-audio",
      capabilityId: "discovery.models" as const,
      status: "complete" as const,
      provenance: "synthetic-fixture" as const,
      output: Object.freeze({ eventCount: FISH_AUDIO_NORMALIZED_MODELS.length }),
    });
  },
} satisfies ProviderFixtureAdapter);

const voiceDiscoveryFixture = Object.freeze({
  providerId: "fish-audio",
  capabilityId: "discovery.voices",
  adapterKind: "voice-discovery",
  supportedCapabilityIds: Object.freeze(["discovery.voices"] as const),
  adapterVersion: FISH_AUDIO_ADAPTER_VERSION,
  fixtureOnly: true,
  async executeFixture(_input, context) {
    assertActive(context.signal);
    const result = normalizeFishAudioPublicVoicePage(FISH_AUDIO_PUBLIC_DISCOVERY_FIXTURES.success);
    return Object.freeze({
      providerId: "fish-audio",
      capabilityId: "discovery.voices" as const,
      status: "complete" as const,
      provenance: "synthetic-fixture" as const,
      output: Object.freeze({ eventCount: result.voices.length }),
    });
  },
} satisfies ProviderFixtureAdapter);

const ttsFixture = Object.freeze({
  providerId: "fish-audio",
  capabilityId: "tts.batch",
  adapterKind: "batch-tts",
  supportedCapabilityIds: Object.freeze(["tts.batch", "tts.voice-selection"] as const),
  adapterVersion: FISH_AUDIO_ADAPTER_VERSION,
  fixtureOnly: true,
  async executeFixture(input, context) {
    assertActive(context.signal);
    const text = input.text?.trim() || "ONE deterministic Fish Audio TTS fixture.";
    if (text.length > 1_000) throw new Error("Fish Audio fixture text is limited to 1000 characters.");
    const bytes = new TextEncoder().encode(`FISH_AUDIO_SYNTHETIC_FIXTURE:${text}`);
    return Object.freeze({
      providerId: "fish-audio",
      capabilityId: "tts.batch" as const,
      status: "complete" as const,
      provenance: "synthetic-fixture" as const,
      output: Object.freeze({ mimeType: "audio/mpeg", byteLength: bytes.byteLength }),
    });
  },
} satisfies ProviderFixtureAdapter);

const sttFixture = Object.freeze({
  providerId: "fish-audio",
  capabilityId: "stt.prerecorded",
  adapterKind: "prerecorded-stt",
  supportedCapabilityIds: Object.freeze(["stt.prerecorded"] as const),
  adapterVersion: FISH_AUDIO_ADAPTER_VERSION,
  fixtureOnly: true,
  async executeFixture(input, context) {
    assertActive(context.signal);
    const text = input.text?.trim() || "ONE deterministic Fish Audio STT fixture.";
    return Object.freeze({
      providerId: "fish-audio",
      capabilityId: "stt.prerecorded" as const,
      status: "complete" as const,
      provenance: "synthetic-fixture" as const,
      output: Object.freeze({ text, byteLength: input.audio?.byteLength ?? 0 }),
    });
  },
} satisfies ProviderFixtureAdapter);

export const FISH_AUDIO_FIXTURE_ADAPTERS: readonly ProviderFixtureAdapter[] = Object.freeze([
  modelDiscoveryFixture,
  voiceDiscoveryFixture,
  ttsFixture,
  sttFixture,
]);

const fishAudioCatalogEntry = getProviderCatalogEntry("fish-audio");
if (!fishAudioCatalogEntry) throw new Error("The canonical provider catalog is missing Fish Audio.");

export const FISH_AUDIO_CONTRACT_CANDIDATE: ProviderContractCandidate = Object.freeze({
  catalogEntry: fishAudioCatalogEntry,
  adapters: FISH_AUDIO_FIXTURE_ADAPTERS,
  benchmarkCompatibleCapabilities: Object.freeze([]),
});
