import {
  CARTESIA_MODEL_DOCS,
  CARTESIA_TTS_DOCS,
  CARTESIA_VERIFIED_AT,
  CARTESIA_VOICE_DOCS,
} from "@/lib/providers/catalog";
import { providerManifestSchema } from "@/lib/providers/types";

export const CARTESIA_PROVIDER_MANIFEST = providerManifestSchema.parse({
  id: "cartesia",
  displayName: "Cartesia",
  featured: false,
  visualAccent: "cartesia-indigo",
  status: "Partial",
  description: "A canonical, fixture-validated provider adapter for static Sonic model discovery, account-scoped voice discovery, and standardized PCM Text to Speech.",
  capabilities: [
    { id: "models", status: "Prototype", evidence: "Documentation verified", adapterAvailable: true },
    { id: "voices", status: "Prototype", evidence: "Repository verified", adapterAvailable: true },
    { id: "tts", status: "Prototype", evidence: "Repository verified", adapterAvailable: true },
  ],
  modules: [],
  supportedExperiences: ["generate"],
  documentationReferences: [
    { title: CARTESIA_TTS_DOCS.title, url: CARTESIA_TTS_DOCS.url, verifiedAt: CARTESIA_VERIFIED_AT, status: "Documentation verified" },
    { title: CARTESIA_VOICE_DOCS.title, url: CARTESIA_VOICE_DOCS.url, verifiedAt: CARTESIA_VERIFIED_AT, status: "Documentation verified" },
    { title: CARTESIA_MODEL_DOCS.title, url: CARTESIA_MODEL_DOCS.url, verifiedAt: CARTESIA_VERIFIED_AT, status: "Documentation verified" },
  ],
  environmentVariables: ["CARTESIA_API_KEY"],
  evidence: "Repository verified",
  liveExecutionEnabled: true,
  adapterCapabilities: ["models", "voices", "tts"],
  limitations: [
    "Canonical exact-operation authorization is required before credential access or provider transport; operational policy remains server-authoritative.",
    "Static model metadata is documentation-backed; voice discovery is account-scoped and requires a configured server credential.",
    "LIVE CARTESIA VERIFICATION: NOT PERFORMED. Fixtures do not establish account entitlement, live availability, latency, quality, pricing, or production suitability.",
    "Only the current API contract's sonic-3.5 and sonic-3 identifiers are accepted. Mutable aliases and dated snapshots are intentionally excluded.",
    "Voice cloning, WebSocket contexts, provider-native optimization controls, and pricing estimates are not implemented.",
  ],
});
