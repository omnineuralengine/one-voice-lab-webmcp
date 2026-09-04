import { providerManifestSchema } from "@/lib/providers/types";

export const ELEVENLABS_PROVIDER_MANIFEST = providerManifestSchema.parse({
  id: "elevenlabs",
  displayName: "ElevenLabs",
  featured: false,
  visualAccent: "neutral",
  status: "Partial",
  description: "A bounded server-side API Studio prototype for models, voices, prerecorded Speech to Text, and Text to Speech.",
  capabilities: [
    { id: "models", status: "Prototype", evidence: "Documentation verified", adapterAvailable: true },
    { id: "voices", status: "Prototype", evidence: "Documentation verified", adapterAvailable: true },
    { id: "stt-prerecorded", status: "Prototype", evidence: "Documentation verified", adapterAvailable: true },
    { id: "tts", status: "Prototype", evidence: "Documentation verified", adapterAvailable: true },
  ],
  modules: [
    {
      id: "elevenlabs-api-studio",
      name: "ElevenLabs API Studio",
      href: "/providers/elevenlabs/api-studio",
      capabilities: ["models", "voices", "stt-prerecorded", "tts"],
    },
  ],
  supportedExperiences: ["upload", "generate"],
  documentationReferences: [
    { title: "ElevenLabs API authentication", url: "https://elevenlabs.io/docs/api-reference/authentication", verifiedAt: "2026-08-21", status: "Documentation verified" },
    { title: "ElevenLabs models API", url: "https://elevenlabs.io/docs/api-reference/models/list", verifiedAt: "2026-08-21", status: "Documentation verified" },
    { title: "ElevenLabs voices API", url: "https://elevenlabs.io/docs/api-reference/voices/search", verifiedAt: "2026-08-21", status: "Documentation verified" },
    { title: "ElevenLabs Speech to Text API", url: "https://elevenlabs.io/docs/api-reference/speech-to-text/convert", verifiedAt: "2026-08-21", status: "Documentation verified" },
    { title: "ElevenLabs Text to Speech API", url: "https://elevenlabs.io/docs/api-reference/text-to-speech/convert", verifiedAt: "2026-08-21", status: "Documentation verified" },
  ],
  environmentVariables: ["ELEVENLABS_API_KEY"],
  evidence: "Repository verified",
  liveExecutionEnabled: true,
  adapterCapabilities: ["models", "voices", "stt-prerecorded", "tts"],
  limitations: [
    "Live use requires a configured server-only credential, the applicable runtime switch, and an explicit user action.",
    "The implementation is fixture-tested but has not yet been manually verified against this account, so capability status remains Prototype.",
    "Streaming TTS, realtime STT, voice cloning, agents, administration, webhooks, Dubbing, and other ElevenLabs APIs are not implemented.",
    "The in-memory request guard is a best-effort local/server-instance limit, not durable identity, quota, or owner authentication.",
  ],
});
