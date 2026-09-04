import {
  providerCatalogEntrySchema,
  type ProviderCatalogEntry,
  type ProviderCatalogGroup,
  type ProviderCatalogId,
} from "@/lib/providers/platform-types";

const EXISTING_PROVIDER_VERIFIED_AT = "2026-08-27";
const RESON8_VERIFIED_AT = "2026-08-28";
export const DEEPGRAM_VERIFIED_AT = "2026-08-29";
export const CARTESIA_VERIFIED_AT = "2026-08-26";

const source = (title: string, url: string, verifiedAt = EXISTING_PROVIDER_VERIFIED_AT) => ({ title, url, verifiedAt });

const reson8Source = (title: string, url: string) => source(title, url, RESON8_VERIFIED_AT);
const deepgramSource = (title: string, url: string) => source(title, url, DEEPGRAM_VERIFIED_AT);
const cartesiaSource = (title: string, url: string) => source(title, url, CARTESIA_VERIFIED_AT);

export const CARTESIA_MODEL_DOCS = cartesiaSource(
  "Cartesia Sonic Text to Speech models",
  "https://docs.cartesia.ai/build-with-cartesia/tts-models/latest",
);
export const CARTESIA_VOICE_DOCS = cartesiaSource(
  "Cartesia voices API",
  "https://docs.cartesia.ai/api-reference/voices/list",
);
export const CARTESIA_TTS_DOCS = cartesiaSource(
  "Cartesia Text to Speech bytes API",
  "https://docs.cartesia.ai/api-reference/tts/bytes",
);

export const DEEPGRAM_MODEL_DOCS = deepgramSource(
  "Deepgram models and languages overview",
  "https://developers.deepgram.com/docs/models-languages-overview",
);
export const DEEPGRAM_VOICE_DOCS = deepgramSource(
  "Deepgram Aura Text to Speech models",
  "https://developers.deepgram.com/docs/tts-models",
);
const DEEPGRAM_STT_DOCS = deepgramSource(
  "Deepgram prerecorded Speech to Text API",
  "https://developers.deepgram.com/reference/speech-to-text/listen-pre-recorded",
);
const DEEPGRAM_TTS_DOCS = deepgramSource(
  "Deepgram Text to Speech API",
  "https://developers.deepgram.com/reference/text-to-speech/speak-request",
);

const deepgramCapabilities: ProviderCatalogEntry["capabilities"] = [
  {
    id: "discovery.models",
    family: "discovery",
    support: "supported",
    verification: "integration-supported",
    sources: [DEEPGRAM_MODEL_DOCS],
    lastVerifiedAt: DEEPGRAM_VERIFIED_AT,
    requiredAdapter: "model-discovery",
    integrationPath: "adapter",
    costBearing: false,
    benchmarkEligibility: "ineligible",
  },
  {
    id: "discovery.voices",
    family: "discovery",
    support: "supported",
    verification: "integration-supported",
    sources: [DEEPGRAM_VOICE_DOCS],
    lastVerifiedAt: DEEPGRAM_VERIFIED_AT,
    requiredAdapter: "voice-discovery",
    integrationPath: "adapter",
    costBearing: false,
    benchmarkEligibility: "ineligible",
  },
  {
    id: "stt.prerecorded",
    family: "speech-to-text",
    support: "supported",
    verification: "integration-supported",
    sources: [DEEPGRAM_STT_DOCS],
    providerModelScope: ["nova-3", "nova-3-general"],
    lastVerifiedAt: DEEPGRAM_VERIFIED_AT,
    requiredAdapter: "prerecorded-stt",
    integrationPath: "adapter",
    costBearing: true,
    benchmarkEligibility: "fixture-only",
  },
  {
    id: "tts.batch",
    family: "text-to-speech",
    support: "supported",
    verification: "integration-supported",
    sources: [DEEPGRAM_TTS_DOCS],
    lastVerifiedAt: DEEPGRAM_VERIFIED_AT,
    requiredAdapter: "batch-tts",
    integrationPath: "adapter",
    costBearing: true,
    benchmarkEligibility: "fixture-only",
  },
  {
    id: "tts.voice-selection",
    family: "text-to-speech",
    support: "supported",
    verification: "integration-supported",
    sources: [DEEPGRAM_TTS_DOCS, DEEPGRAM_VOICE_DOCS],
    lastVerifiedAt: DEEPGRAM_VERIFIED_AT,
    requiredAdapter: "batch-tts",
    integrationPath: "adapter",
    costBearing: true,
    benchmarkEligibility: "fixture-only",
  },
];

const RESON8_DOCS = reson8Source("Reson8 developer documentation", "https://docs.reson8.dev/");
const RESON8_PRERECORDED_DOCS = reson8Source("Reson8 prerecorded STT API", "https://docs.reson8.dev/api/speech-to-text/prerecorded/");
const RESON8_REALTIME_DOCS = reson8Source("Reson8 realtime STT API", "https://docs.reson8.dev/api/speech-to-text/realtime/");
const RESON8_TURNS_DOCS = reson8Source("Reson8 turn-level STT API", "https://docs.reson8.dev/api/speech-to-text/turns/");
const RESON8_AUTH_DOCS = reson8Source("Reson8 authentication", "https://docs.reson8.dev/authentication/");
const RESON8_AUDIO_DOCS = reson8Source("Reson8 audio formats", "https://docs.reson8.dev/speech-to-text/features/audio-formats/");
const RESON8_LANGUAGE_DOCS = reson8Source("Reson8 languages", "https://docs.reson8.dev/speech-to-text/features/languages/");
const RESON8_DIARIZATION_DOCS = reson8Source("Reson8 diarization", "https://docs.reson8.dev/speech-to-text/features/diarization/");
const RESON8_CUSTOM_MODELS_DOCS = reson8Source("Reson8 custom models", "https://docs.reson8.dev/speech-to-text/features/custom-models/");

export const FISH_AUDIO_VERIFIED_AT = "2026-08-25";
const fishAudioSource = (title: string, url: string) => source(title, url, FISH_AUDIO_VERIFIED_AT);
const FISH_AUDIO_INTRO_DOCS = fishAudioSource(
  "Fish Audio API introduction",
  "https://docs.fish.audio/api-reference/introduction",
);
export const FISH_AUDIO_MODEL_DOCS = fishAudioSource(
  "Fish Audio voice model list",
  "https://docs.fish.audio/api-reference/endpoint/model/list-models",
);
const FISH_AUDIO_TTS_DOCS = fishAudioSource(
  "Fish Audio Text to Speech",
  "https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech",
);
const FISH_AUDIO_STT_DOCS = fishAudioSource(
  "Fish Audio Speech to Text",
  "https://docs.fish.audio/api-reference/endpoint/openapi-v1/speech-to-text",
);

export const ELEVENLABS_VERIFIED_AT = EXISTING_PROVIDER_VERIFIED_AT;
const elevenLabsSource = (title: string, url: string) => source(title, url, ELEVENLABS_VERIFIED_AT);
export const ELEVENLABS_MODEL_DOCS = elevenLabsSource(
  "ElevenLabs models API",
  "https://elevenlabs.io/docs/api-reference/models/list",
);
export const ELEVENLABS_VOICE_DOCS = elevenLabsSource(
  "ElevenLabs voices API",
  "https://elevenlabs.io/docs/api-reference/voices/search",
);
const ELEVENLABS_TTS_DOCS = elevenLabsSource(
  "ElevenLabs Text to Speech API",
  "https://elevenlabs.io/docs/api-reference/text-to-speech/convert",
);
const ELEVENLABS_STT_DOCS = elevenLabsSource(
  "ElevenLabs Speech to Text API",
  "https://elevenlabs.io/docs/api-reference/speech-to-text/convert",
);

const elevenLabsCapabilities: ProviderCatalogEntry["capabilities"] = [
  {
    id: "discovery.models",
    family: "discovery",
    support: "supported",
    verification: "provider-documented",
    sources: [ELEVENLABS_MODEL_DOCS],
    lastVerifiedAt: ELEVENLABS_VERIFIED_AT,
    requiredAdapter: "model-discovery",
    integrationPath: "adapter",
    costBearing: false,
    benchmarkEligibility: "ineligible",
  },
  {
    id: "discovery.voices",
    family: "discovery",
    support: "supported",
    verification: "provider-documented",
    sources: [ELEVENLABS_VOICE_DOCS],
    lastVerifiedAt: ELEVENLABS_VERIFIED_AT,
    requiredAdapter: "voice-discovery",
    integrationPath: "adapter",
    costBearing: false,
    benchmarkEligibility: "ineligible",
  },
  {
    id: "stt.prerecorded",
    family: "speech-to-text",
    support: "supported",
    verification: "provider-documented",
    sources: [ELEVENLABS_STT_DOCS],
    providerModelScope: ["scribe_v2", "scribe_v1"],
    lastVerifiedAt: ELEVENLABS_VERIFIED_AT,
    requiredAdapter: "prerecorded-stt",
    integrationPath: "adapter",
    costBearing: true,
    benchmarkEligibility: "ineligible",
  },
  {
    id: "tts.batch",
    family: "text-to-speech",
    support: "supported",
    verification: "provider-documented",
    sources: [ELEVENLABS_TTS_DOCS],
    lastVerifiedAt: ELEVENLABS_VERIFIED_AT,
    requiredAdapter: "batch-tts",
    integrationPath: "adapter",
    costBearing: true,
    benchmarkEligibility: "ineligible",
  },
  {
    id: "tts.voice-selection",
    family: "text-to-speech",
    support: "supported",
    verification: "provider-documented",
    sources: [ELEVENLABS_TTS_DOCS, ELEVENLABS_VOICE_DOCS],
    lastVerifiedAt: ELEVENLABS_VERIFIED_AT,
    requiredAdapter: "batch-tts",
    integrationPath: "adapter",
    costBearing: true,
    benchmarkEligibility: "ineligible",
  },
];

const fishAudioCapabilities: ProviderCatalogEntry["capabilities"] = [
  {
    id: "discovery.models",
    family: "discovery",
    support: "supported",
    verification: "provider-documented",
    sources: [FISH_AUDIO_MODEL_DOCS],
    providerModelScope: ["s2-pro", "s1"],
    lastVerifiedAt: FISH_AUDIO_VERIFIED_AT,
    requiredAdapter: "model-discovery",
    integrationPath: "adapter",
    costBearing: false,
    benchmarkEligibility: "ineligible",
  },
  {
    id: "discovery.voices",
    family: "discovery",
    support: "supported",
    verification: "provider-documented",
    sources: [FISH_AUDIO_MODEL_DOCS],
    lastVerifiedAt: FISH_AUDIO_VERIFIED_AT,
    requiredAdapter: "voice-discovery",
    integrationPath: "adapter",
    costBearing: false,
    benchmarkEligibility: "ineligible",
  },
  {
    id: "stt.prerecorded",
    family: "speech-to-text",
    support: "supported",
    verification: "provider-documented",
    sources: [FISH_AUDIO_STT_DOCS],
    providerModelScope: ["fish-audio-asr-v1"],
    lastVerifiedAt: FISH_AUDIO_VERIFIED_AT,
    requiredAdapter: "prerecorded-stt",
    integrationPath: "adapter",
    costBearing: true,
    benchmarkEligibility: "ineligible",
  },
  {
    id: "tts.batch",
    family: "text-to-speech",
    support: "supported",
    verification: "provider-documented",
    sources: [FISH_AUDIO_TTS_DOCS],
    providerModelScope: ["s2-pro", "s1"],
    lastVerifiedAt: FISH_AUDIO_VERIFIED_AT,
    requiredAdapter: "batch-tts",
    integrationPath: "adapter",
    costBearing: true,
    benchmarkEligibility: "ineligible",
  },
  {
    id: "tts.voice-selection",
    family: "text-to-speech",
    support: "supported",
    verification: "provider-documented",
    sources: [FISH_AUDIO_TTS_DOCS, FISH_AUDIO_MODEL_DOCS],
    providerModelScope: ["s2-pro", "s1"],
    lastVerifiedAt: FISH_AUDIO_VERIFIED_AT,
    requiredAdapter: "batch-tts",
    integrationPath: "adapter",
    costBearing: true,
    benchmarkEligibility: "ineligible",
  },
];

const cartesiaCapabilities: ProviderCatalogEntry["capabilities"] = [
  {
    id: "discovery.models",
    family: "discovery",
    support: "supported",
    verification: "provider-documented",
    sources: [CARTESIA_MODEL_DOCS],
    providerModelScope: ["sonic-3.5", "sonic-3"],
    lastVerifiedAt: CARTESIA_VERIFIED_AT,
    requiredAdapter: "model-discovery",
    integrationPath: "adapter",
    costBearing: false,
    benchmarkEligibility: "ineligible",
  },
  {
    id: "discovery.voices",
    family: "discovery",
    support: "supported",
    verification: "provider-documented",
    sources: [CARTESIA_VOICE_DOCS],
    lastVerifiedAt: CARTESIA_VERIFIED_AT,
    requiredAdapter: "voice-discovery",
    integrationPath: "adapter",
    costBearing: false,
    benchmarkEligibility: "ineligible",
  },
  {
    id: "tts.batch",
    family: "text-to-speech",
    support: "supported",
    verification: "provider-documented",
    sources: [CARTESIA_TTS_DOCS],
    providerModelScope: ["sonic-3.5", "sonic-3"],
    lastVerifiedAt: CARTESIA_VERIFIED_AT,
    requiredAdapter: "batch-tts",
    integrationPath: "adapter",
    costBearing: true,
    benchmarkEligibility: "ineligible",
  },
  {
    id: "tts.voice-selection",
    family: "text-to-speech",
    support: "supported",
    verification: "provider-documented",
    sources: [CARTESIA_TTS_DOCS, CARTESIA_VOICE_DOCS],
    providerModelScope: ["sonic-3.5", "sonic-3"],
    lastVerifiedAt: CARTESIA_VERIFIED_AT,
    requiredAdapter: "batch-tts",
    integrationPath: "adapter",
    costBearing: true,
    benchmarkEligibility: "ineligible",
  },
];

const reson8Capabilities: ProviderCatalogEntry["capabilities"] = [
  {
    id: "stt.prerecorded",
    family: "speech-to-text",
    support: "supported",
    verification: "provider-documented",
    sources: [RESON8_PRERECORDED_DOCS],
    lastVerifiedAt: RESON8_VERIFIED_AT,
    requiredAdapter: "prerecorded-stt",
    integrationPath: "none",
    costBearing: true,
    benchmarkEligibility: "ineligible",
  },
  {
    id: "stt.streaming",
    family: "speech-to-text",
    support: "supported",
    verification: "provider-documented",
    sources: [RESON8_REALTIME_DOCS],
    lastVerifiedAt: RESON8_VERIFIED_AT,
    requiredAdapter: "streaming-stt",
    integrationPath: "none",
    costBearing: true,
    benchmarkEligibility: "ineligible",
  },
  {
    id: "stt.partial-transcripts",
    family: "speech-to-text",
    support: "supported",
    verification: "provider-documented",
    sources: [RESON8_REALTIME_DOCS],
    lastVerifiedAt: RESON8_VERIFIED_AT,
    requiredAdapter: "streaming-stt",
    integrationPath: "none",
    costBearing: true,
    benchmarkEligibility: "ineligible",
  },
  {
    id: "stt.final-transcripts",
    family: "speech-to-text",
    support: "supported",
    verification: "provider-documented",
    sources: [RESON8_REALTIME_DOCS],
    lastVerifiedAt: RESON8_VERIFIED_AT,
    requiredAdapter: "streaming-stt",
    integrationPath: "none",
    costBearing: true,
    benchmarkEligibility: "ineligible",
  },
  {
    id: "stt.diarization",
    family: "speech-to-text",
    support: "supported",
    verification: "provider-documented",
    sources: [RESON8_PRERECORDED_DOCS, RESON8_DIARIZATION_DOCS],
    lastVerifiedAt: RESON8_VERIFIED_AT,
    requiredAdapter: "prerecorded-stt",
    integrationPath: "none",
    costBearing: true,
    benchmarkEligibility: "ineligible",
  },
  {
    id: "stt.word-timestamps",
    family: "speech-to-text",
    support: "supported",
    verification: "provider-documented",
    sources: [RESON8_PRERECORDED_DOCS],
    lastVerifiedAt: RESON8_VERIFIED_AT,
    requiredAdapter: "prerecorded-stt",
    integrationPath: "none",
    costBearing: true,
    benchmarkEligibility: "ineligible",
  },
  {
    id: "stt.utterance-timestamps",
    family: "speech-to-text",
    support: "supported",
    verification: "provider-documented",
    sources: [RESON8_PRERECORDED_DOCS, RESON8_REALTIME_DOCS, RESON8_TURNS_DOCS],
    lastVerifiedAt: RESON8_VERIFIED_AT,
    requiredAdapter: "prerecorded-stt",
    integrationPath: "none",
    costBearing: true,
    benchmarkEligibility: "ineligible",
  },
  {
    id: "stt.turn-aware",
    family: "speech-to-text",
    support: "supported",
    verification: "provider-documented",
    sources: [RESON8_TURNS_DOCS],
    lastVerifiedAt: RESON8_VERIFIED_AT,
    requiredAdapter: "turn-aware-stt",
    integrationPath: "none",
    costBearing: true,
    benchmarkEligibility: "ineligible",
  },
  {
    id: "stt.language-detection",
    family: "speech-to-text",
    support: "supported",
    verification: "provider-documented",
    sources: [RESON8_LANGUAGE_DOCS],
    lastVerifiedAt: RESON8_VERIFIED_AT,
    requiredAdapter: "prerecorded-stt",
    integrationPath: "none",
    costBearing: true,
    benchmarkEligibility: "ineligible",
  },
  {
    id: "stt.multilingual",
    family: "speech-to-text",
    support: "supported",
    verification: "provider-documented",
    sources: [RESON8_LANGUAGE_DOCS],
    lastVerifiedAt: RESON8_VERIFIED_AT,
    requiredAdapter: "prerecorded-stt",
    integrationPath: "none",
    costBearing: true,
    benchmarkEligibility: "ineligible",
  },
  {
    id: "stt.confidence",
    family: "speech-to-text",
    support: "supported",
    verification: "provider-documented",
    sources: [RESON8_PRERECORDED_DOCS, RESON8_REALTIME_DOCS],
    lastVerifiedAt: RESON8_VERIFIED_AT,
    requiredAdapter: "prerecorded-stt",
    integrationPath: "none",
    costBearing: true,
    benchmarkEligibility: "ineligible",
  },
  {
    id: "stt.phrase-biasing",
    family: "speech-to-text",
    support: "supported",
    verification: "provider-documented",
    sources: [RESON8_PRERECORDED_DOCS, RESON8_REALTIME_DOCS, RESON8_TURNS_DOCS],
    lastVerifiedAt: RESON8_VERIFIED_AT,
    requiredAdapter: "prerecorded-stt",
    integrationPath: "none",
    costBearing: true,
    benchmarkEligibility: "ineligible",
  },
  {
    id: "stt.custom-vocabulary",
    family: "speech-to-text",
    support: "supported",
    verification: "provider-documented",
    sources: [RESON8_CUSTOM_MODELS_DOCS],
    lastVerifiedAt: RESON8_VERIFIED_AT,
    requiredAdapter: "prerecorded-stt",
    integrationPath: "none",
    costBearing: true,
    benchmarkEligibility: "ineligible",
  },
  {
    id: "realtime.turn-detection",
    family: "realtime-voice",
    support: "supported",
    verification: "provider-documented",
    sources: [RESON8_TURNS_DOCS],
    lastVerifiedAt: RESON8_VERIFIED_AT,
    requiredAdapter: "turn-aware-stt",
    integrationPath: "none",
    costBearing: true,
    benchmarkEligibility: "ineligible",
  },
  {
    id: "deployment.hosted",
    family: "deployment",
    support: "supported",
    verification: "provider-documented",
    sources: [RESON8_DOCS],
    lastVerifiedAt: RESON8_VERIFIED_AT,
    requiredAdapter: "none",
    integrationPath: "metadata-only",
    costBearing: false,
    benchmarkEligibility: "ineligible",
  },
];

function unverifiedEntry(
  id: ProviderCatalogId,
  displayName: string,
  group: ProviderCatalogGroup,
  kind: ProviderCatalogEntry["kind"] = "speech-provider",
): ProviderCatalogEntry {
  return {
    id,
    displayName,
    description: "Catalog-only entry. Capabilities and operational readiness have not been verified by ONE Voice Lab.",
    group,
    kind,
    category: kind === "speech-provider" || kind === "local-runtime" ? "Voice AI" : "Adjacent system",
    metadataVerification: "unverified",
    metadataSources: [],
    capabilities: [],
    deprecated: false,
  };
}

const rawCatalog: ProviderCatalogEntry[] = [
  {
    id: "deepgram",
    displayName: "Deepgram",
    description: "Fixture-validated Deepgram integration for static core discovery, prerecorded STT, and buffered Aura TTS.",
    group: "core-and-immediate",
    kind: "speech-provider",
    category: "Voice AI provider",
    officialWebsite: "https://deepgram.com/",
    officialDocumentation: "https://developers.deepgram.com/docs",
    metadataVerification: "verified",
    metadataSources: [DEEPGRAM_MODEL_DOCS, DEEPGRAM_VOICE_DOCS, DEEPGRAM_STT_DOCS, DEEPGRAM_TTS_DOCS],
    capabilities: deepgramCapabilities,
    deprecated: false,
  },
  {
    id: "elevenlabs",
    displayName: "ElevenLabs",
    description: "Fixture-validated ElevenLabs integration for account-scoped model and voice discovery, buffered TTS, and prerecorded STT.",
    group: "core-and-immediate",
    kind: "speech-provider",
    category: "Voice AI provider",
    officialWebsite: "https://elevenlabs.io/",
    officialDocumentation: "https://elevenlabs.io/docs/api-reference/introduction",
    metadataVerification: "verified",
    metadataSources: [ELEVENLABS_MODEL_DOCS, ELEVENLABS_VOICE_DOCS, ELEVENLABS_TTS_DOCS, ELEVENLABS_STT_DOCS],
    capabilities: elevenLabsCapabilities,
    deprecated: false,
  },
  {
    id: "fish-audio",
    displayName: "Fish Audio",
    description: "Fixture-validated Fish Audio integration for current static TTS models, public-only voice discovery, optional-voice buffered TTS, and beta prerecorded STT.",
    group: "core-and-immediate",
    kind: "speech-provider",
    category: "Voice AI provider",
    officialWebsite: "https://fish.audio/",
    officialDocumentation: "https://docs.fish.audio/api-reference/introduction",
    metadataVerification: "verified",
    metadataSources: [FISH_AUDIO_INTRO_DOCS, FISH_AUDIO_MODEL_DOCS, FISH_AUDIO_TTS_DOCS, FISH_AUDIO_STT_DOCS],
    capabilities: fishAudioCapabilities,
    deprecated: false,
  },
  {
    id: "cartesia",
    displayName: "Cartesia",
    description: "Fixture-validated Cartesia integration for static Sonic model discovery, account-scoped voice discovery, and buffered raw-PCM Text to Speech.",
    group: "core-and-immediate",
    kind: "speech-provider",
    category: "Voice AI provider",
    officialWebsite: "https://cartesia.ai/",
    officialDocumentation: "https://docs.cartesia.ai/",
    metadataVerification: "verified",
    metadataSources: [CARTESIA_MODEL_DOCS, CARTESIA_VOICE_DOCS, CARTESIA_TTS_DOCS],
    capabilities: cartesiaCapabilities,
    deprecated: false,
  },
  {
    id: "reson8",
    displayName: "Reson8",
    description: "Fixture-first speech-to-text integration. Live invocation remains globally disabled and benchmark evidence remains ineligible for public ranking.",
    group: "core-and-immediate",
    kind: "speech-provider",
    category: "Speech-to-text provider",
    officialWebsite: "https://reson8.dev/",
    officialDocumentation: "https://docs.reson8.dev/",
    metadataVerification: "verified",
    metadataSources: [
      RESON8_DOCS,
      RESON8_AUTH_DOCS,
      RESON8_PRERECORDED_DOCS,
      RESON8_REALTIME_DOCS,
      RESON8_TURNS_DOCS,
      RESON8_AUDIO_DOCS,
      RESON8_LANGUAGE_DOCS,
      RESON8_DIARIZATION_DOCS,
      RESON8_CUSTOM_MODELS_DOCS,
    ],
    capabilities: reson8Capabilities,
    deprecated: false,
  },
  unverifiedEntry("openai", "OpenAI", "core-and-immediate"),
  unverifiedEntry("soniox", "Soniox", "core-and-immediate"),
  unverifiedEntry("mistral-voxtral", "Mistral Voxtral", "core-and-immediate"),
  unverifiedEntry("assemblyai", "AssemblyAI", "benchmark-anchors"),
  unverifiedEntry("speechmatics", "Speechmatics", "benchmark-anchors"),
  unverifiedEntry("gladia", "Gladia", "benchmark-anchors"),
  unverifiedEntry("rev-ai", "Rev AI", "benchmark-anchors"),
  unverifiedEntry("google-cloud-gemini-live", "Google Cloud and Gemini Live", "benchmark-anchors"),
  unverifiedEntry("microsoft-azure-speech", "Microsoft Azure Speech and Voice Live", "benchmark-anchors"),
  unverifiedEntry("aws-voice-ai", "AWS Transcribe, Polly, and Nova Sonic", "benchmark-anchors"),
  unverifiedEntry("groq", "Groq", "benchmark-anchors"),
  unverifiedEntry("nvidia-riva-speech-nim", "NVIDIA Riva and Speech NIM", "benchmark-anchors"),
  unverifiedEntry("rime", "Rime", "specialist-voice"),
  unverifiedEntry("hume-ai", "Hume AI", "specialist-voice"),
  unverifiedEntry("resemble-ai", "Resemble AI", "specialist-voice"),
  unverifiedEntry("inworld", "Inworld", "specialist-voice"),
  unverifiedEntry("lmnt", "LMNT", "specialist-voice"),
  unverifiedEntry("smallest-ai", "Smallest AI", "specialist-voice"),
  unverifiedEntry("camb-ai", "CAMB.AI", "specialist-voice"),
  unverifiedEntry("murf", "Murf", "specialist-voice"),
  unverifiedEntry("neuphonic", "Neuphonic", "specialist-voice"),
  unverifiedEntry("playht", "PlayHT", "specialist-voice"),
  unverifiedEntry("xai", "xAI", "specialist-voice"),
  unverifiedEntry("whisper", "Whisper", "local-and-self-hosted", "local-runtime"),
  unverifiedEntry("faster-whisper", "faster-whisper", "local-and-self-hosted", "local-runtime"),
  unverifiedEntry("whisper-cpp", "whisper.cpp", "local-and-self-hosted", "local-runtime"),
  unverifiedEntry("voxtral-local", "Local or open Voxtral", "local-and-self-hosted", "local-runtime"),
  unverifiedEntry("nvidia-riva-private", "NVIDIA Riva private deployment", "local-and-self-hosted", "local-runtime"),
  unverifiedEntry("piper", "Piper", "local-and-self-hosted", "local-runtime"),
  unverifiedEntry("kokoro", "Kokoro", "local-and-self-hosted", "local-runtime"),
  unverifiedEntry("chatterbox", "Chatterbox", "local-and-self-hosted", "local-runtime"),
  unverifiedEntry("livekit", "LiveKit", "voice-stack-infrastructure", "voice-stack-infrastructure"),
  unverifiedEntry("pipecat", "Pipecat", "voice-stack-infrastructure", "voice-stack-infrastructure"),
  unverifiedEntry("daily", "Daily", "voice-stack-infrastructure", "voice-stack-infrastructure"),
  unverifiedEntry("vapi", "Vapi", "voice-stack-infrastructure", "voice-stack-infrastructure"),
  unverifiedEntry("retell", "Retell", "voice-stack-infrastructure", "voice-stack-infrastructure"),
  unverifiedEntry("bland-ai", "Bland AI", "voice-stack-infrastructure", "voice-stack-infrastructure"),
  unverifiedEntry("voiceflow", "Voiceflow", "voice-stack-infrastructure", "voice-stack-infrastructure"),
  unverifiedEntry("twilio", "Twilio", "voice-stack-infrastructure", "voice-stack-infrastructure"),
  unverifiedEntry("telnyx", "Telnyx", "voice-stack-infrastructure", "voice-stack-infrastructure"),
  unverifiedEntry("agora", "Agora", "voice-stack-infrastructure", "voice-stack-infrastructure"),
  unverifiedEntry("signalwire", "SignalWire", "voice-stack-infrastructure", "voice-stack-infrastructure"),
  unverifiedEntry("vonage", "Vonage", "voice-stack-infrastructure", "voice-stack-infrastructure"),
  unverifiedEntry("voximplant", "Voximplant", "voice-stack-infrastructure", "voice-stack-infrastructure"),
  unverifiedEntry("deepeval", "DeepEval", "evaluation-interoperability", "evaluation-system"),
  unverifiedEntry("coval", "Coval", "evaluation-interoperability", "evaluation-system"),
  unverifiedEntry("cekura", "Cekura", "evaluation-interoperability", "evaluation-system"),
];

const parsedCatalog = rawCatalog.map((entry) => providerCatalogEntrySchema.parse(entry));
const ids = new Set(parsedCatalog.map((entry) => entry.id));
if (ids.size !== parsedCatalog.length) {
  throw new Error("Provider catalog contains duplicate provider IDs.");
}

/** Code-owned discovery metadata. This is not an adapter registry. */
export const PROVIDER_CATALOG: readonly ProviderCatalogEntry[] = Object.freeze(parsedCatalog);

export function getProviderCatalogEntry(providerId: string): ProviderCatalogEntry | null {
  return PROVIDER_CATALOG.find((entry) => entry.id === providerId) ?? null;
}
