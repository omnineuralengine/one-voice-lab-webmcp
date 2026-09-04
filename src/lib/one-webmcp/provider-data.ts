import type { PublicProvider } from "@/lib/public-evidence/schemas";
import type {
  NormalizedProviderCapabilityId,
  ProviderCapabilityDeclaration,
  ProviderCatalogGroup,
} from "@/lib/providers/platform-types";

export type OneWebMcpProviderSource = Readonly<{
  title: string;
  url: string;
  verifiedAt: string | null;
}>;

export type OneWebMcpCapabilityFact = Readonly<{
  id: NormalizedProviderCapabilityId;
  family: ProviderCapabilityDeclaration["family"];
  support: ProviderCapabilityDeclaration["support"];
  verification: ProviderCapabilityDeclaration["verification"];
  sources: readonly OneWebMcpProviderSource[];
  providerModelScope: readonly string[];
  lastVerifiedAt: string | null;
  requiredAdapter: ProviderCapabilityDeclaration["requiredAdapter"];
  integrationPath: ProviderCapabilityDeclaration["integrationPath"];
  costBearing: boolean;
  benchmarkEligibility: ProviderCapabilityDeclaration["benchmarkEligibility"];
}>;

export type OneWebMcpProviderRecord = Readonly<{
  id: PublicProvider["id"];
  name: string;
  description: string;
  profilePath: string;
  group: ProviderCatalogGroup;
  kind: PublicProvider["platform"]["kind"];
  category: string;
  registryStatus: PublicProvider["status"];
  evidence: Readonly<{
    label: PublicProvider["evidence"];
    type: PublicProvider["evidenceType"];
    documentationStatus: string;
    metadataVerification: PublicProvider["platform"]["metadata"]["verification"];
    lastVerifiedAt: string | null;
    sources: readonly OneWebMcpProviderSource[];
    sourceUrls: readonly string[];
  }>;
  integration: Readonly<{
    installed: boolean;
    fixtureCapable: boolean;
    scope: "repository-code-only";
    operationalConfigurationExposed: false;
  }>;
  capabilities: readonly OneWebMcpCapabilityFact[];
  limitations: readonly string[];
  unknowns: readonly string[];
}>;

function sourceRecord(source: PublicProvider["platform"]["metadata"]["sources"][number]): OneWebMcpProviderSource {
  return {
    title: source.title,
    url: source.url,
    verifiedAt: source.verifiedAt ?? null,
  };
}

function capabilityRecord(
  capability: PublicProvider["platform"]["capabilities"][number],
): OneWebMcpCapabilityFact {
  return {
    id: capability.id,
    family: capability.family,
    support: capability.support,
    verification: capability.verification,
    sources: capability.sources.map(sourceRecord),
    providerModelScope: capability.providerModelScope ?? [],
    lastVerifiedAt: capability.lastVerifiedAt ?? null,
    requiredAdapter: capability.requiredAdapter,
    integrationPath: capability.integrationPath,
    costBearing: capability.costBearing,
    benchmarkEligibility: capability.benchmarkEligibility,
  };
}

function explicitUnknowns(provider: PublicProvider): readonly string[] {
  const unknowns: string[] = [];
  if (provider.platform.metadata.verification === "unverified") {
    unknowns.push("Provider metadata has not been verified by ONE Voice Lab.");
  }
  if (provider.platform.capabilities.length === 0) {
    unknowns.push("No verified capability declarations are available; absence is unknown, not unsupported.");
  }
  if (!provider.lastVerifiedAt && !provider.platform.metadata.lastVerifiedAt) {
    unknowns.push("No defensible freshness date is published.");
  }
  if (
    provider.platform.kind === "voice-stack-infrastructure"
    || provider.platform.kind === "evaluation-system"
  ) {
    unknowns.push("This adjacent system is not a speech-model provider and is not eligible for speech-provider ranking.");
  }
  unknowns.push("No equivalent live pricing, latency, quality, security, or availability measurement is implied by this registry record.");
  return unknowns;
}

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

/**
 * Creates the credential-free browser snapshot from the same validated public
 * provider projection used by ONE's provider pages and public API.
 */
export function createOneWebMcpProviderSnapshot(
  providers: readonly PublicProvider[],
): readonly OneWebMcpProviderRecord[] {
  const records = providers.map((provider): OneWebMcpProviderRecord => ({
    id: provider.id,
    name: provider.name,
    description: provider.description,
    profilePath: `/providers/${provider.id}`,
    group: provider.platform.group,
    kind: provider.platform.kind,
    category: provider.platform.category,
    registryStatus: provider.status,
    evidence: {
      label: provider.evidence,
      type: provider.evidenceType,
      documentationStatus: provider.documentationStatus,
      metadataVerification: provider.platform.metadata.verification,
      lastVerifiedAt: provider.lastVerifiedAt ?? provider.platform.metadata.lastVerifiedAt ?? null,
      sources: provider.platform.metadata.sources.map(sourceRecord),
      sourceUrls: [...provider.sourceUrls],
    },
    integration: {
      installed: provider.platform.integration.installed,
      fixtureCapable: provider.platform.integration.fixtureCapable,
      scope: "repository-code-only",
      operationalConfigurationExposed: false,
    },
    capabilities: provider.platform.capabilities.map(capabilityRecord),
    limitations: [...provider.limitations],
    unknowns: explicitUnknowns(provider),
  }));

  const ids = new Set(records.map((record) => record.id));
  if (ids.size !== records.length) {
    throw new Error("The ONE WebMCP provider snapshot contains duplicate provider IDs.");
  }
  return deepFreeze(records.sort((left, right) => left.id.localeCompare(right.id)));
}
