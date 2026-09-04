import { providerManifestSchema } from "@/lib/providers/types";

export const FISH_AUDIO_PROVIDER_MANIFEST = providerManifestSchema.parse({
  id: "fish-audio",
  displayName: "Fish Audio",
  featured: false,
  visualAccent: "ocean-teal",
  status: "Partial",
  description: "A bounded server-side API Studio prototype for documented voice models, Text to Speech, and beta prerecorded Speech to Text.",
  capabilities: [
    { id: "models", status: "Prototype", evidence: "Documentation verified", adapterAvailable: true },
    { id: "voices", status: "Prototype", evidence: "Documentation verified", adapterAvailable: true },
    { id: "stt-prerecorded", status: "Prototype", evidence: "Documentation verified", adapterAvailable: true },
    { id: "tts", status: "Prototype", evidence: "Documentation verified", adapterAvailable: true },
  ],
  modules: [
    {
      id: "fish-audio-api-studio",
      name: "Fish Audio API Studio",
      href: "/providers/fish-audio/api-studio",
      capabilities: ["models", "voices", "stt-prerecorded", "tts"],
    },
  ],
  supportedExperiences: ["upload", "generate"],
  documentationReferences: [
    { title: "Fish Audio API introduction", url: "https://docs.fish.audio/api-reference/introduction", verifiedAt: "2026-08-25", status: "Documentation verified" },
    { title: "Fish Audio voice model list", url: "https://docs.fish.audio/api-reference/endpoint/model/list-models", verifiedAt: "2026-08-25", status: "Documentation verified" },
    { title: "Fish Audio Text to Speech", url: "https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech", verifiedAt: "2026-08-25", status: "Documentation verified" },
    { title: "Fish Audio Speech to Text", url: "https://docs.fish.audio/api-reference/endpoint/openapi-v1/speech-to-text", verifiedAt: "2026-08-25", status: "Documentation verified" },
  ],
  environmentVariables: ["FISH_AUDIO_API_KEY"],
  evidence: "Repository verified",
  liveExecutionEnabled: true,
  adapterCapabilities: ["models", "voices", "stt-prerecorded", "tts"],
  limitations: [
    "Live use requires a configured server-only credential, the applicable runtime switch, and an explicit user action.",
    "The adapter and safety boundaries are fixture-tested; this account's Fish Audio entitlement and live output still require manual verification.",
    "Only public voice-model metadata is serialized. Private and unlisted model metadata is excluded from the anonymous catalog.",
    "The Speech to Text endpoint is labeled beta by Fish Audio; realtime streaming, cloning/model creation, agents, administration, and arbitrary API proxying are not implemented.",
    "The in-memory request guard is a best-effort server-instance limit, not durable identity or a global quota.",
  ],
});
