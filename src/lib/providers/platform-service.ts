import "server-only";

import { PROVIDER_CATALOG } from "@/lib/providers/catalog";
import {
  PROVIDER_ADAPTER_REGISTRATIONS,
  type ProviderAdapterRegistration,
} from "@/lib/providers/adapters";
import {
  intersectProviderAccess,
  intersectProviderBenchmarkStatus,
} from "@/lib/providers/provider-access-policy";
import { CARTESIA_NORMALIZED_MODELS } from "@/lib/providers/cartesia/normalization";
import { FISH_AUDIO_NORMALIZED_MODELS } from "@/lib/providers/fish-audio/normalization";
import {
  DEEPGRAM_NORMALIZED_MODELS,
  DEEPGRAM_NORMALIZED_VOICES,
} from "@/lib/providers/deepgram/normalization";
import { hasServerCredentialConfiguration } from "@/lib/providers/server-credential";
import {
  normalizedProviderModelSchema,
  normalizedProviderVoiceSchema,
  providerCatalogEntrySchema,
  providerOperationalPolicySchema,
  providerPlatformProjectionSchema,
  type NormalizedProviderModel,
  type NormalizedProviderVoice,
  type ProviderCapabilityDeclaration,
  type ProviderCatalogEntry,
  type ProviderOperationalPolicy,
  type ProviderPlatformProjection,
} from "@/lib/providers/platform-types";
import { PROVIDER_REGISTRY } from "@/lib/providers/registry";
import type {
  ProviderCapability,
  ProviderCapabilityRecord,
  ProviderManifest,
} from "@/lib/providers/types";

type EnvironmentLookup = Readonly<Record<string, string | undefined>>;

export type ProviderPlatformProjectionOptions = Readonly<{
  environment?: EnvironmentLookup;
  policies?: readonly ProviderOperationalPolicy[];
  models?: readonly NormalizedProviderModel[];
  voices?: readonly NormalizedProviderVoice[];
  /** Test and tooling seam for catalog metadata. Installed truth still comes from code-owned manifests/adapter registrations. */
  catalog?: readonly ProviderCatalogEntry[];
}>;

const legacyCapabilityMap: Readonly<Partial<Record<ProviderCapability, Readonly<{
  id: ProviderCapabilityDeclaration["id"];
  family: ProviderCapabilityDeclaration["family"];
  adapter: ProviderCapabilityDeclaration["requiredAdapter"];
  costBearing: boolean;
}>>>> = {
  models: { id: "discovery.models", family: "discovery", adapter: "model-discovery", costBearing: false },
  voices: { id: "discovery.voices", family: "discovery", adapter: "voice-discovery", costBearing: false },
  "stt-prerecorded": { id: "stt.prerecorded", family: "speech-to-text", adapter: "prerecorded-stt", costBearing: true },
  "stt-streaming": { id: "stt.streaming", family: "speech-to-text", adapter: "streaming-stt", costBearing: true },
  "conversational-stt": { id: "realtime.conversation", family: "realtime-voice", adapter: "realtime-voice", costBearing: true },
  tts: { id: "tts.batch", family: "text-to-speech", adapter: "batch-tts", costBearing: true },
  "voice-agent": { id: "realtime.server-agent", family: "realtime-voice", adapter: "realtime-voice", costBearing: true },
};

const groupOrder = new Map([
  "core-and-immediate",
  "benchmark-anchors",
  "specialist-voice",
  "local-and-self-hosted",
  "voice-stack-infrastructure",
  "evaluation-interoperability",
].map((group, index) => [group, index]));

function normalizeManifestCapability(
  manifest: ProviderManifest,
  capability: ProviderCapabilityRecord,
  policy: ProviderOperationalPolicy,
  registration: ProviderAdapterRegistration | undefined,
): ProviderCapabilityDeclaration | null {
  const mapping = legacyCapabilityMap[capability.id];
  if (!mapping || capability.status === "Planned") return null;

  const sources = manifest.documentationReferences.map((reference) => ({
    title: reference.title,
    url: reference.url,
    verifiedAt: reference.verifiedAt,
  }));
  const capabilityPolicy = policy.capabilityPolicies.find((item) => item.capabilityId === mapping.id);
  const capabilityAccess = intersectProviderAccess(policy.access, capabilityPolicy?.access);
  const capabilityBenchmarkStatus = intersectProviderBenchmarkStatus(
    policy.benchmarkStatus,
    capabilityPolicy?.benchmarkStatus,
  );
  const adapterInstalled = registrationSupports(registration, mapping.adapter, mapping.id);
  const benchmarkEligible = adapterInstalled
    && !["globally-disabled", "fixture-only", "budget-paused"].includes(capabilityAccess)
    && ["benchmark-eligible", "publicly-ranked"].includes(capabilityBenchmarkStatus);

  return {
    id: mapping.id,
    family: mapping.family,
    support: "supported",
    verification: "integration-supported",
    sources,
    lastVerifiedAt: sources.map((item) => item.verifiedAt).filter(Boolean).sort().at(-1),
    requiredAdapter: mapping.adapter,
    integrationPath: adapterInstalled ? "adapter" : capability.adapterAvailable ? "legacy-route" : "none",
    costBearing: mapping.costBearing,
    benchmarkEligibility: benchmarkEligible ? "eligible" : capability.adapterAvailable ? "fixture-only" : "ineligible",
  };
}

function registrationSupports(
  registration: ProviderAdapterRegistration | undefined,
  adapterKind: ProviderCapabilityDeclaration["requiredAdapter"],
  capabilityId: ProviderCapabilityDeclaration["id"],
): boolean {
  if (!registration) return false;
  if (registration.fixtureAdapters?.some((adapter) => adapter.supportedCapabilityIds.includes(capabilityId))) {
    return true;
  }
  if (adapterKind === "batch-tts") return Boolean(registration.tts);
  if (adapterKind === "prerecorded-stt") return Boolean(registration.sttPrerecorded);
  if (adapterKind === "model-discovery") return Boolean(registration.catalog?.capabilities.includes("models"));
  if (adapterKind === "voice-discovery") return Boolean(registration.catalog?.capabilities.includes("voices"));

  // Metadata cannot manufacture streaming, turn-aware, realtime,
  // audio-intelligence, or health implementations.
  return false;
}

function registrationHasAdapter(registration: ProviderAdapterRegistration | undefined): boolean {
  return Boolean(
    registration?.tts
    || registration?.sttPrerecorded
    || registration?.catalog
    || registration?.normalizedDiscovery
    || registration?.fixtureAdapters?.length,
  );
}

function registrationHasCanonicalContract(registration: ProviderAdapterRegistration | undefined): boolean {
  return Boolean(registration?.fixtureAdapters?.length);
}

function defaultPolicy(providerId: string): ProviderOperationalPolicy {
  return providerOperationalPolicySchema.parse({
    providerId,
    access: "globally-disabled",
    benchmarkStatus: "ineligible",
    capabilityPolicies: [],
    costAdmissionEnabled: false,
    policyVersion: "safe-default/1.0.0",
  });
}

function mergeCapabilities(
  entry: ProviderCatalogEntry,
  manifest: ProviderManifest | undefined,
  policy: ProviderOperationalPolicy,
  registration: ProviderAdapterRegistration | undefined,
): ProviderCapabilityDeclaration[] {
  const capabilities = new Map(entry.capabilities.map((capability) => {
    if (!registrationSupports(registration, capability.requiredAdapter, capability.id)) {
      return [capability.id, capability] as const;
    }
    return [capability.id, {
      ...capability,
      verification: "integration-supported" as const,
      integrationPath: "adapter" as const,
      benchmarkEligibility: "fixture-only" as const,
    }] as const;
  }));
  for (const capability of manifest?.capabilities ?? []) {
    const normalized = normalizeManifestCapability(manifest!, capability, policy, registration);
    if (normalized) {
      const codeOwned = capabilities.get(normalized.id);
      capabilities.set(normalized.id, codeOwned ? {
        ...codeOwned,
        support: normalized.support,
        verification: normalized.verification,
        requiredAdapter: normalized.requiredAdapter,
        integrationPath: normalized.integrationPath,
        costBearing: normalized.costBearing,
        benchmarkEligibility: normalized.benchmarkEligibility,
      } : normalized);
    }
  }
  return [...capabilities.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function getRuntimeStatus(
  entry: ProviderCatalogEntry,
  manifest: ProviderManifest | undefined,
  policy: ProviderOperationalPolicy,
  configured: boolean,
): ProviderPlatformProjection["lifecycle"]["runtime"] {
  if (entry.deprecated) return "deprecated";
  if (policy.access === "budget-paused") return "budget-paused";
  if (!manifest || policy.access === "globally-disabled") return "disabled";
  if (policy.runtimeStatus === "disabled" || policy.runtimeStatus === "deprecated") return policy.runtimeStatus;
  if (policy.runtimeStatus === "budget-paused") return "budget-paused";
  if (policy.runtimeStatus === "degraded") return "degraded";
  if (policy.runtimeStatus === "unavailable") return "unavailable";
  if (policy.health === "degraded") return "degraded";
  if (policy.health === "unavailable") return "unavailable";
  if (policy.access === "fixture-only") return "enabled";
  return configured ? "enabled" : "unavailable";
}

function getReadiness(
  manifest: ProviderManifest | undefined,
  installed: boolean,
  policy: ProviderOperationalPolicy,
  configured: boolean,
  adapterBacked: boolean,
  liveLabEnabled: boolean,
): ProviderPlatformProjection["readiness"] {
  if (!installed) return { state: "listed", explanation: "Cataloged only; no provider adapter is installed." };
  const operationallyEnabled = policy.runtimeStatus === "enabled" || policy.runtimeStatus === "degraded";
  const healthAllowsExecution = !policy.health
    || !["unavailable", "disabled", "budget-paused"].includes(policy.health);
  const liveEnabled = Boolean(manifest?.liveExecutionEnabled)
    && adapterBacked
    && configured
    && operationallyEnabled
    && healthAllowsExecution
    && policy.costAdmissionEnabled
    && liveLabEnabled
    && !["globally-disabled", "fixture-only", "budget-paused"].includes(policy.access);
  if (liveEnabled) return { state: "live-enabled", explanation: "Installed, configured, and allowed by the injected runtime policy." };
  if (configured) return { state: "configured", explanation: "Server credential configuration is present; runtime health is not implied." };
  if (adapterBacked) return { state: "adapter-backed", explanation: "A provider-neutral adapter is fixture-validated; live invocation remains disabled until every policy and cost gate is satisfied." };
  return { state: "listed", explanation: "The integration is present without a provider-neutral executable adapter." };
}

function getHealth(
  manifest: ProviderManifest | undefined,
  policy: ProviderOperationalPolicy,
  configured: boolean,
): ProviderPlatformProjection["health"] {
  if (policy.health) {
    return { state: policy.health, checkedAt: policy.healthCheckedAt, source: "operational-policy" };
  }
  if (policy.access === "budget-paused") return { state: "budget-paused", source: "operational-policy" };
  if (!manifest || policy.access === "globally-disabled") return { state: "disabled", source: "not-observed" };
  return {
    state: configured ? "configured" : "unconfigured",
    source: "configuration",
  };
}

function latestVerificationDate(entry: ProviderCatalogEntry): string | undefined {
  return entry.metadataSources.map((item) => item.verifiedAt).filter((item): item is string => Boolean(item)).sort().at(-1);
}

/**
 * Builds a safe, deterministic provider projection without network activity.
 * Operational policy can restrict installed code, but cannot manufacture an
 * adapter, configuration, or capability absent from the installed registry.
 */
export function projectProviderPlatform(
  options: ProviderPlatformProjectionOptions = {},
): readonly ProviderPlatformProjection[] {
  const environment = options.environment ?? process.env;
  const catalog = (options.catalog ?? PROVIDER_CATALOG).map((entry) => providerCatalogEntrySchema.parse(entry));
  const policies = new Map((options.policies ?? []).map((policy) => {
    const parsed = providerOperationalPolicySchema.parse(policy);
    return [parsed.providerId, parsed] as const;
  }));
  const defaultModels = options.catalog
    ? []
    : [...DEEPGRAM_NORMALIZED_MODELS, ...FISH_AUDIO_NORMALIZED_MODELS, ...CARTESIA_NORMALIZED_MODELS];
  const models = (options.models ?? defaultModels).map((model) => normalizedProviderModelSchema.parse(model));
  const defaultVoices = options.catalog ? [] : DEEPGRAM_NORMALIZED_VOICES;
  const voices = (options.voices ?? defaultVoices).map((voice) => normalizedProviderVoiceSchema.parse(voice));

  const catalogIds = new Set(catalog.map((entry) => entry.id));
  if (catalogIds.size !== catalog.length) throw new Error("Provider platform projection received duplicate catalog IDs.");
  for (const model of models) {
    if (!catalogIds.has(model.providerId)) throw new Error(`Model references unknown provider ${model.providerId}.`);
  }
  for (const voice of voices) {
    if (!catalogIds.has(voice.providerId)) throw new Error(`Voice references unknown provider ${voice.providerId}.`);
  }

  return Object.freeze(catalog
    .map((entry) => {
      const manifest = PROVIDER_REGISTRY.find((candidate) => candidate.id === entry.id);
      const registration = PROVIDER_ADAPTER_REGISTRATIONS[entry.id];
      const policy = policies.get(entry.id) ?? defaultPolicy(entry.id);
      const credentialNames = registration?.credentialEnvironmentVariables ?? manifest?.environmentVariables ?? [];
      const credentialRequired = credentialNames.length > 0;
      const executableAdapterInstalled = registrationHasAdapter(registration);
      const canonicalContractInstalled = registrationHasCanonicalContract(registration);
      const adapterBacked = executableAdapterInstalled;
      const installed = Boolean(manifest) || executableAdapterInstalled;
      const configured = installed
        && (!credentialRequired || hasServerCredentialConfiguration(credentialNames, environment));
      const integration = !installed
        ? "adapter-missing"
        : !manifest && registration?.fixtureAdapters?.length
          ? "fixture-validated"
        : configured && executableAdapterInstalled
          ? "configured"
          : adapterBacked
            ? "contract-tests-passed"
            : "adapter-in-progress";

      return providerPlatformProjectionSchema.parse({
        schemaVersion: "1.0.0",
        id: entry.id,
        displayName: entry.displayName,
        description: entry.description,
        group: entry.group,
        kind: entry.kind,
        category: entry.category,
        links: {
          website: entry.officialWebsite,
          documentation: entry.officialDocumentation,
        },
        lifecycle: {
          discovery: policy.discoveryStatus ?? "cataloged",
          integration,
          access: manifest ? policy.access : "globally-disabled",
          runtime: getRuntimeStatus(entry, manifest, policy, configured),
          benchmark: manifest ? policy.benchmarkStatus : "ineligible",
        },
        readiness: getReadiness(
          manifest,
          installed,
          policy,
          configured,
          adapterBacked,
          environment.ONE_LIVE_LAB_ENABLED === "true",
        ),
        credential: {
          required: credentialRequired,
          state: !installed
            ? "unknown"
            : !credentialRequired
              ? "not-required"
              : configured
                ? "configured-not-runtime-verified"
                : "unconfigured",
        },
        health: getHealth(manifest, policy, configured),
        integration: {
          installed,
          // Converged registrations prove fixture support directly. Legacy
          // executable adapters retain their transitional fixture projection
          // until their own convergence stage replaces it with shared fixtures.
          fixtureCapable: canonicalContractInstalled || adapterBacked,
        },
        capabilities: mergeCapabilities(entry, manifest, policy, registration),
        models: models.filter((model) => model.providerId === entry.id).sort((left, right) => left.referenceId.localeCompare(right.referenceId)),
        voices: voices.filter((voice) => voice.providerId === entry.id).sort((left, right) => left.referenceId.localeCompare(right.referenceId)),
        metadata: {
          verification: entry.metadataVerification,
          sources: entry.metadataSources,
          lastVerifiedAt: latestVerificationDate(entry),
        },
      });
    })
    .sort((left, right) => {
      const groupDifference = (groupOrder.get(left.group) ?? Number.MAX_SAFE_INTEGER)
        - (groupOrder.get(right.group) ?? Number.MAX_SAFE_INTEGER);
      return groupDifference || left.id.localeCompare(right.id);
    }));
}

export function getProviderPlatformProjection(
  providerId: string,
  options: ProviderPlatformProjectionOptions = {},
): ProviderPlatformProjection | null {
  return projectProviderPlatform(options).find((provider) => provider.id === providerId) ?? null;
}
