import "server-only";

import {
  cartesiaCatalogAdapter,
  cartesiaNormalizedDiscoveryAdapter,
  cartesiaTtsAdapter,
} from "@/lib/providers/cartesia/adapters";
import { CARTESIA_FIXTURE_ADAPTERS } from "@/lib/providers/cartesia/fixtures";
import {
  deepgramCatalogAdapter,
  deepgramNormalizedDiscoveryAdapter,
  deepgramSttAdapter,
  deepgramTtsAdapter,
} from "@/lib/providers/deepgram/adapters";
import { DEEPGRAM_FIXTURE_ADAPTERS } from "@/lib/providers/deepgram/fixtures";
import {
  elevenLabsCatalogAdapter,
  elevenLabsNormalizedDiscoveryAdapter,
  elevenLabsSttAdapter,
  elevenLabsTtsAdapter,
} from "@/lib/providers/elevenlabs/adapters";
import { ELEVENLABS_FIXTURE_ADAPTERS } from "@/lib/providers/elevenlabs/fixtures";
import {
  fishAudioCatalogAdapter,
  fishAudioNormalizedDiscoveryAdapter,
  fishAudioSttAdapter,
  fishAudioTtsAdapter,
} from "@/lib/providers/fish-audio/adapters";
import { FISH_AUDIO_FIXTURE_ADAPTERS } from "@/lib/providers/fish-audio/fixtures";
import { ProviderAdapterError } from "@/lib/providers/errors";
import type { ProviderFixtureAdapter } from "@/lib/providers/contract-test-kit";
import { providerCatalogIdSchema } from "@/lib/providers/platform-types";
import { RESON8_FIXTURE_ADAPTERS } from "@/lib/providers/reson8";
import { getProviderManifest, requireExecutableCapability } from "@/lib/providers/registry";
import type {
  ProviderCatalogAdapter,
  ProviderId,
  ProviderNormalizedDiscoveryAdapter,
  ProviderSttAdapter,
  ProviderTtsAdapter,
} from "@/lib/providers/types";

export type ProviderAdapterRegistration = Readonly<{
  tts?: ProviderTtsAdapter;
  sttPrerecorded?: ProviderSttAdapter;
  catalog?: ProviderCatalogAdapter;
  normalizedDiscovery?: ProviderNormalizedDiscoveryAdapter;
  /** Server-only credential names. Values are never stored in this registry or projected publicly. */
  credentialEnvironmentVariables?: readonly string[];
  /** Deterministic adapters that prove normalized contracts without enabling provider transport. */
  fixtureAdapters?: readonly ProviderFixtureAdapter[];
}>;

/**
 * Code-owned executable integration truth. Operational database policy may
 * narrow these adapters, but it cannot add or manufacture one.
 */
export const PROVIDER_ADAPTER_REGISTRATIONS: Readonly<Record<string, ProviderAdapterRegistration | undefined>> = Object.freeze({
  deepgram: Object.freeze({
    tts: deepgramTtsAdapter,
    sttPrerecorded: deepgramSttAdapter,
    catalog: deepgramCatalogAdapter,
    normalizedDiscovery: deepgramNormalizedDiscoveryAdapter,
    credentialEnvironmentVariables: Object.freeze(["DEEPGRAM_API_KEY"]),
    fixtureAdapters: DEEPGRAM_FIXTURE_ADAPTERS,
  }),
  elevenlabs: Object.freeze({
    tts: elevenLabsTtsAdapter,
    sttPrerecorded: elevenLabsSttAdapter,
    catalog: elevenLabsCatalogAdapter,
    normalizedDiscovery: elevenLabsNormalizedDiscoveryAdapter,
    credentialEnvironmentVariables: Object.freeze(["ELEVENLABS_API_KEY"]),
    fixtureAdapters: ELEVENLABS_FIXTURE_ADAPTERS,
  }),
  "fish-audio": Object.freeze({
    tts: fishAudioTtsAdapter,
    sttPrerecorded: fishAudioSttAdapter,
    catalog: fishAudioCatalogAdapter,
    normalizedDiscovery: fishAudioNormalizedDiscoveryAdapter,
    credentialEnvironmentVariables: Object.freeze(["FISH_AUDIO_API_KEY"]),
    fixtureAdapters: FISH_AUDIO_FIXTURE_ADAPTERS,
  }),
  cartesia: Object.freeze({
    tts: cartesiaTtsAdapter,
    catalog: cartesiaCatalogAdapter,
    normalizedDiscovery: cartesiaNormalizedDiscoveryAdapter,
    credentialEnvironmentVariables: Object.freeze(["CARTESIA_API_KEY"]),
    fixtureAdapters: CARTESIA_FIXTURE_ADAPTERS,
  }),
  reson8: Object.freeze({
    credentialEnvironmentVariables: Object.freeze(["RESON8_API_KEY"]),
    fixtureAdapters: RESON8_FIXTURE_ADAPTERS,
  }),
});

export function assertProviderTtsAdapterRegistration(
  providerId: ProviderId,
  adapter: ProviderTtsAdapter,
): void {
  if (
    adapter.providerId !== providerId
    || adapter.capability !== "tts"
    || !adapter.adapterVersion.trim()
  ) {
    throw new Error(`Invalid TTS adapter registration for provider ${providerId}.`);
  }
}

for (const [providerId, registration] of Object.entries(PROVIDER_ADAPTER_REGISTRATIONS)) {
  providerCatalogIdSchema.parse(providerId);
  const typedProviderId = providerId as ProviderId;
  if (registration?.tts) assertProviderTtsAdapterRegistration(typedProviderId, registration.tts);
  if (registration?.sttPrerecorded && (
    registration.sttPrerecorded.providerId !== typedProviderId
    || registration.sttPrerecorded.capability !== "stt-prerecorded"
    || !registration.sttPrerecorded.adapterVersion.trim()
  )) throw new Error(`Invalid STT adapter registration for provider ${providerId}.`);
  if (registration?.catalog && (
    registration.catalog.providerId !== typedProviderId
    || registration.catalog.capabilities.length === 0
    || !registration.catalog.adapterVersion.trim()
  )) throw new Error(`Invalid catalog adapter registration for provider ${providerId}.`);
  if (registration?.normalizedDiscovery && (
    registration.normalizedDiscovery.providerId !== typedProviderId
    || registration.normalizedDiscovery.capabilities.length === 0
    || !registration.normalizedDiscovery.adapterVersion.trim()
  )) throw new Error(`Invalid normalized discovery adapter registration for provider ${providerId}.`);
  for (const name of registration?.credentialEnvironmentVariables ?? []) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name) || name.startsWith("NEXT_PUBLIC_")) {
      throw new Error(`Invalid server-only credential definition for provider ${providerId}.`);
    }
  }
  const fixtureCapabilities = new Set<string>();
  for (const adapter of registration?.fixtureAdapters ?? []) {
    if (
      adapter.providerId !== providerId
      || adapter.fixtureOnly !== true
      || !adapter.adapterVersion.trim()
      || !adapter.supportedCapabilityIds.includes(adapter.capabilityId)
    ) throw new Error(`Invalid fixture adapter registration for provider ${providerId}.`);
    if (fixtureCapabilities.has(adapter.capabilityId)) {
      throw new Error(`Duplicate fixture adapter capability for provider ${providerId}.`);
    }
    fixtureCapabilities.add(adapter.capabilityId);
  }
}

export function getProviderAdapterRegistration(providerId: string): ProviderAdapterRegistration | undefined {
  return PROVIDER_ADAPTER_REGISTRATIONS[providerId];
}

export function resolveTtsAdapter(providerId: string): ProviderTtsAdapter {
  const manifest = requireExecutableCapability(providerId, "tts");
  const adapter = PROVIDER_ADAPTER_REGISTRATIONS[manifest.id]?.tts;
  if (!adapter) {
    throw new ProviderAdapterError({
      code: "provider_capability_unavailable",
      message: "The requested provider capability is not implemented.",
      status: 501,
      providerId,
      capability: "tts",
    });
  }
  assertProviderTtsAdapterRegistration(manifest.id, adapter);
  return adapter;
}

export function resolveSttAdapter(providerId: string): ProviderSttAdapter {
  const fixtureRegistration = getProviderAdapterRegistration(providerId)?.fixtureAdapters?.some(
    (adapter) => adapter.supportedCapabilityIds.includes("stt.prerecorded"),
  );
  if (!getProviderManifest(providerId) && fixtureRegistration) {
    throw new ProviderAdapterError({
      code: "provider_execution_disabled",
      message: "Live execution is disabled for this fixture-validated provider.",
      status: 503,
      providerId,
      capability: "stt-prerecorded",
    });
  }
  const manifest = requireExecutableCapability(providerId, "stt-prerecorded");
  const adapter = PROVIDER_ADAPTER_REGISTRATIONS[manifest.id]?.sttPrerecorded;
  if (!adapter || adapter.providerId !== manifest.id || adapter.capability !== "stt-prerecorded") {
    throw new ProviderAdapterError({
      code: "provider_capability_unavailable",
      message: "The requested Speech to Text provider adapter is unavailable.",
      status: 501,
      providerId,
      capability: "stt-prerecorded",
    });
  }
  return adapter;
}

export function resolveCatalogAdapter(
  providerId: string,
  capability: "models" | "voices",
): ProviderCatalogAdapter {
  const manifest = requireExecutableCapability(providerId, capability);
  const adapter = PROVIDER_ADAPTER_REGISTRATIONS[manifest.id]?.catalog;
  if (!adapter || adapter.providerId !== manifest.id || !adapter.capabilities.includes(capability)) {
    throw new ProviderAdapterError({
      code: "provider_capability_unavailable",
      message: `The requested provider ${capability} catalog is unavailable.`,
      status: 501,
      providerId,
      capability,
    });
  }
  return adapter;
}

export function resolveNormalizedDiscoveryAdapter(
  providerId: string,
  capability: "models" | "voices",
): ProviderNormalizedDiscoveryAdapter {
  const manifest = requireExecutableCapability(providerId, capability);
  const adapter = PROVIDER_ADAPTER_REGISTRATIONS[manifest.id]?.normalizedDiscovery;
  if (!adapter || adapter.providerId !== manifest.id || !adapter.capabilities.includes(capability)) {
    throw new ProviderAdapterError({
      code: "provider_capability_unavailable",
      message: `The requested normalized provider ${capability} catalog is unavailable.`,
      status: 501,
      providerId,
      capability,
    });
  }
  return adapter;
}
