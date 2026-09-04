import { getProviderCatalogEntry } from "@/lib/providers/catalog";
import type {
  ProviderContractCandidate,
  ProviderFixtureAdapter,
} from "@/lib/providers/contract-test-kit";
import {
  CARTESIA_NORMALIZED_MODELS,
  normalizeCartesiaVoicePage,
} from "@/lib/providers/cartesia/normalization";

export const CARTESIA_ADAPTER_VERSION = "one-cartesia-core/2.0.0";

export const CARTESIA_DISCOVERY_FIXTURES = Object.freeze({
  voices: Object.freeze({
    data: Object.freeze([
      Object.freeze({
        id: "cartesia_fixture_voice",
        name: "Cartesia Fixture Voice",
        language: "en",
        gender: "must-not-survive",
        description: "must-not-survive",
        preview_file_url: "https://example.invalid/private-preview.wav",
        owner_id: "must-not-survive",
      }),
    ]),
    has_more: false,
    next_page: null,
  }),
  malformedVoices: Object.freeze({ data: "not-an-array", has_more: false }),
});

function assertActive(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("The Cartesia fixture was cancelled.", "AbortError");
}

const modelDiscoveryFixture = Object.freeze({
  providerId: "cartesia",
  capabilityId: "discovery.models",
  adapterKind: "model-discovery",
  supportedCapabilityIds: Object.freeze(["discovery.models"] as const),
  adapterVersion: CARTESIA_ADAPTER_VERSION,
  fixtureOnly: true,
  async executeFixture(_input, context) {
    assertActive(context.signal);
    return Object.freeze({
      providerId: "cartesia",
      capabilityId: "discovery.models" as const,
      status: "complete" as const,
      provenance: "synthetic-fixture" as const,
      output: Object.freeze({ eventCount: CARTESIA_NORMALIZED_MODELS.length }),
    });
  },
} satisfies ProviderFixtureAdapter);

const voiceDiscoveryFixture = Object.freeze({
  providerId: "cartesia",
  capabilityId: "discovery.voices",
  adapterKind: "voice-discovery",
  supportedCapabilityIds: Object.freeze(["discovery.voices"] as const),
  adapterVersion: CARTESIA_ADAPTER_VERSION,
  fixtureOnly: true,
  async executeFixture(_input, context) {
    assertActive(context.signal);
    const normalized = normalizeCartesiaVoicePage(CARTESIA_DISCOVERY_FIXTURES.voices);
    return Object.freeze({
      providerId: "cartesia",
      capabilityId: "discovery.voices" as const,
      status: "complete" as const,
      provenance: "synthetic-fixture" as const,
      output: Object.freeze({ eventCount: normalized.voices.length }),
    });
  },
} satisfies ProviderFixtureAdapter);

const ttsFixture = Object.freeze({
  providerId: "cartesia",
  capabilityId: "tts.batch",
  adapterKind: "batch-tts",
  supportedCapabilityIds: Object.freeze(["tts.batch", "tts.voice-selection"] as const),
  adapterVersion: CARTESIA_ADAPTER_VERSION,
  fixtureOnly: true,
  async executeFixture(input, context) {
    assertActive(context.signal);
    const value = input.text?.trim() || "ONE deterministic Cartesia TTS fixture.";
    if (value.length > 1_000) throw new Error("Cartesia fixture text is limited to 1000 characters.");
    const bytes = new TextEncoder().encode(`CARTESIA_SYNTHETIC_FIXTURE:${value}`);
    return Object.freeze({
      providerId: "cartesia",
      capabilityId: "tts.batch" as const,
      status: "complete" as const,
      provenance: "synthetic-fixture" as const,
      output: Object.freeze({ mimeType: "audio/pcm", byteLength: bytes.byteLength }),
    });
  },
} satisfies ProviderFixtureAdapter);

export const CARTESIA_FIXTURE_ADAPTERS: readonly ProviderFixtureAdapter[] = Object.freeze([
  modelDiscoveryFixture,
  voiceDiscoveryFixture,
  ttsFixture,
]);

const catalogEntry = getProviderCatalogEntry("cartesia");
if (!catalogEntry) throw new Error("The canonical provider catalog is missing Cartesia.");

export const CARTESIA_CONTRACT_CANDIDATE: ProviderContractCandidate = Object.freeze({
  catalogEntry,
  adapters: CARTESIA_FIXTURE_ADAPTERS,
  benchmarkCompatibleCapabilities: Object.freeze(["tts.batch"] as const),
});
