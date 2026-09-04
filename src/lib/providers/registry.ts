import { CARTESIA_PROVIDER_MANIFEST } from "@/lib/providers/cartesia/manifest";
import { DEEPGRAM_PROVIDER_MANIFEST } from "@/lib/providers/deepgram/manifest";
import { ELEVENLABS_PROVIDER_MANIFEST } from "@/lib/providers/elevenlabs/manifest";
import { FISH_AUDIO_PROVIDER_MANIFEST } from "@/lib/providers/fish-audio/manifest";
import { ProviderAdapterError } from "@/lib/providers/errors";
import {
  providerIdSchema,
  providerManifestSchema,
  type ProviderCapability,
  type ProviderId,
  type ProviderManifest,
} from "@/lib/providers/types";

const parsedRegistry = [
  DEEPGRAM_PROVIDER_MANIFEST,
  ELEVENLABS_PROVIDER_MANIFEST,
  FISH_AUDIO_PROVIDER_MANIFEST,
  CARTESIA_PROVIDER_MANIFEST,
].map((manifest) =>
  providerManifestSchema.parse(manifest),
);

const providerIds = new Set(parsedRegistry.map((manifest) => manifest.id));
if (providerIds.size !== parsedRegistry.length) {
  throw new Error("Provider Registry contains duplicate provider IDs.");
}

const LIVE_ENABLED_PROVIDER_IDS: ReadonlySet<ProviderId> = new Set(["deepgram", "elevenlabs", "fish-audio", "cartesia"]);
for (const manifest of parsedRegistry) {
  if (manifest.liveExecutionEnabled && !LIVE_ENABLED_PROVIDER_IDS.has(manifest.id)) {
    throw new Error(`Provider ${manifest.id} is not allowlisted for live execution.`);
  }
}

export const PROVIDER_REGISTRY: readonly ProviderManifest[] = Object.freeze(parsedRegistry);
export const DEFAULT_PROVIDER_ID: ProviderId = "deepgram";

export function isProviderId(value: unknown): value is ProviderId {
  return providerIdSchema.safeParse(value).success;
}

export function getProviderManifest(value: string): ProviderManifest | null {
  if (!isProviderId(value)) return null;
  return PROVIDER_REGISTRY.find((manifest) => manifest.id === value) ?? null;
}

export function requireProviderManifest(value: string): ProviderManifest {
  const manifest = getProviderManifest(value);
  if (!manifest) {
    throw new ProviderAdapterError({
      code: "provider_unknown",
      message: "The requested provider is not registered.",
      status: 404,
      providerId: value,
    });
  }
  return manifest;
}

export function requireExecutableCapability(value: string, capability: ProviderCapability): ProviderManifest {
  const manifest = requireProviderManifest(value);
  if (manifest.status === "Planned") {
    throw new ProviderAdapterError({
      code: "provider_not_implemented",
      message: "This provider is Planned and has no live adapter.",
      status: 501,
      providerId: value,
      capability,
    });
  }
  const capabilityRecord = manifest.capabilities.find((record) => record.id === capability);
  if (!capabilityRecord || !capabilityRecord.adapterAvailable || !manifest.adapterCapabilities.includes(capability)) {
    throw new ProviderAdapterError({
      code: "provider_capability_unavailable",
      message: "The requested provider capability is not implemented.",
      status: 501,
      providerId: value,
      capability,
    });
  }
  if (!manifest.liveExecutionEnabled) {
    throw new ProviderAdapterError({
      code: "provider_execution_disabled",
      message: "Live execution is disabled for this provider.",
      status: 503,
      providerId: value,
      capability,
    });
  }
  return manifest;
}
