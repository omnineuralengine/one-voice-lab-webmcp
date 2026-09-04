import { getProviderCatalogEntry } from "@/lib/providers/catalog";
import type {
  ProviderContractCandidate,
  ProviderFixtureAdapter,
} from "@/lib/providers/contract-test-kit";
import {
  normalizeElevenLabsModels,
  normalizeElevenLabsVoicePage,
} from "@/lib/providers/elevenlabs/normalization";

export const ELEVENLABS_ADAPTER_VERSION = "one-elevenlabs-core/2.0.0";

export const ELEVENLABS_DISCOVERY_FIXTURES = Object.freeze({
  models: Object.freeze([
    Object.freeze({
      model_id: "eleven_fixture_v2",
      name: "Eleven Fixture v2",
      can_do_text_to_speech: true,
      can_do_voice_conversion: true,
      languages: Object.freeze([Object.freeze({ language_id: "en", name: "English" })]),
      private_account_metadata: "must-not-survive",
    }),
  ]),
  voices: Object.freeze({
    voices: Object.freeze([
      Object.freeze({
        voice_id: "voice_fixture",
        name: "Fixture Voice",
        labels: Object.freeze({ owner: "must-not-survive" }),
        description: "must-not-survive",
        preview_url: "https://example.invalid/private-preview.mp3",
        samples: Object.freeze([Object.freeze({ sample_id: "must-not-survive" })]),
      }),
    ]),
    has_more: false,
    next_page_token: null,
  }),
  malformedModels: Object.freeze({ models: "not-an-array" }),
  malformedVoices: Object.freeze({ voices: "not-an-array", has_more: false }),
});

function assertActive(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("The ElevenLabs fixture was cancelled.", "AbortError");
}

const modelDiscoveryFixture = Object.freeze({
  providerId: "elevenlabs",
  capabilityId: "discovery.models",
  adapterKind: "model-discovery",
  supportedCapabilityIds: Object.freeze(["discovery.models"] as const),
  adapterVersion: ELEVENLABS_ADAPTER_VERSION,
  fixtureOnly: true,
  async executeFixture(_input, context) {
    assertActive(context.signal);
    const normalized = normalizeElevenLabsModels(ELEVENLABS_DISCOVERY_FIXTURES.models);
    return Object.freeze({
      providerId: "elevenlabs",
      capabilityId: "discovery.models" as const,
      status: "complete" as const,
      provenance: "synthetic-fixture" as const,
      output: Object.freeze({ eventCount: normalized.models.length }),
    });
  },
} satisfies ProviderFixtureAdapter);

const voiceDiscoveryFixture = Object.freeze({
  providerId: "elevenlabs",
  capabilityId: "discovery.voices",
  adapterKind: "voice-discovery",
  supportedCapabilityIds: Object.freeze(["discovery.voices"] as const),
  adapterVersion: ELEVENLABS_ADAPTER_VERSION,
  fixtureOnly: true,
  async executeFixture(_input, context) {
    assertActive(context.signal);
    const models = normalizeElevenLabsModels(ELEVENLABS_DISCOVERY_FIXTURES.models).models;
    const normalized = normalizeElevenLabsVoicePage(
      ELEVENLABS_DISCOVERY_FIXTURES.voices,
      models.map((model) => model.referenceId),
    );
    return Object.freeze({
      providerId: "elevenlabs",
      capabilityId: "discovery.voices" as const,
      status: "complete" as const,
      provenance: "synthetic-fixture" as const,
      output: Object.freeze({ eventCount: normalized.voices.length }),
    });
  },
} satisfies ProviderFixtureAdapter);

const ttsFixture = Object.freeze({
  providerId: "elevenlabs",
  capabilityId: "tts.batch",
  adapterKind: "batch-tts",
  supportedCapabilityIds: Object.freeze(["tts.batch", "tts.voice-selection"] as const),
  adapterVersion: ELEVENLABS_ADAPTER_VERSION,
  fixtureOnly: true,
  async executeFixture(input, context) {
    assertActive(context.signal);
    const value = input.text?.trim() || "ONE deterministic ElevenLabs TTS fixture.";
    if (value.length > 1_000) throw new Error("ElevenLabs fixture text is limited to 1000 characters.");
    const bytes = new TextEncoder().encode(`ELEVENLABS_SYNTHETIC_FIXTURE:${value}`);
    return Object.freeze({
      providerId: "elevenlabs",
      capabilityId: "tts.batch" as const,
      status: "complete" as const,
      provenance: "synthetic-fixture" as const,
      output: Object.freeze({ mimeType: "audio/mpeg", byteLength: bytes.byteLength }),
    });
  },
} satisfies ProviderFixtureAdapter);

const sttFixture = Object.freeze({
  providerId: "elevenlabs",
  capabilityId: "stt.prerecorded",
  adapterKind: "prerecorded-stt",
  supportedCapabilityIds: Object.freeze(["stt.prerecorded"] as const),
  adapterVersion: ELEVENLABS_ADAPTER_VERSION,
  fixtureOnly: true,
  async executeFixture(input, context) {
    assertActive(context.signal);
    const value = input.text?.trim() || "ONE deterministic ElevenLabs STT fixture.";
    return Object.freeze({
      providerId: "elevenlabs",
      capabilityId: "stt.prerecorded" as const,
      status: "complete" as const,
      provenance: "synthetic-fixture" as const,
      output: Object.freeze({ text: value, byteLength: input.audio?.byteLength ?? 0 }),
    });
  },
} satisfies ProviderFixtureAdapter);

export const ELEVENLABS_FIXTURE_ADAPTERS: readonly ProviderFixtureAdapter[] = Object.freeze([
  modelDiscoveryFixture,
  voiceDiscoveryFixture,
  ttsFixture,
  sttFixture,
]);

const catalogEntry = getProviderCatalogEntry("elevenlabs");
if (!catalogEntry) throw new Error("The canonical provider catalog is missing ElevenLabs.");

export const ELEVENLABS_CONTRACT_CANDIDATE: ProviderContractCandidate = Object.freeze({
  catalogEntry,
  adapters: ELEVENLABS_FIXTURE_ADAPTERS,
  benchmarkCompatibleCapabilities: Object.freeze([]),
});
