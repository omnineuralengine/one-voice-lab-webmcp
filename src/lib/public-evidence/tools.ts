import { getPublicEvals, getPublicMethodology, getPublicProvider, getPublicProviders, runPublicSyntheticEval } from "@/lib/public-evidence/registry";
import type { ProviderOperationalPolicy } from "@/lib/providers/platform-types";
import type { PublicProvider } from "@/lib/public-evidence/schemas";

type EnvironmentLookup = Readonly<Record<string, string | undefined>>;

export const PUBLIC_MCP_TOOL_NAMES = [
  "voice_lab.list_providers",
  "voice_lab.get_provider",
  "voice_lab.list_provider_capabilities",
  "voice_lab.list_provider_models",
  "voice_lab.list_provider_voices",
  "voice_lab.get_provider_health",
  "voice_lab.list_evals",
  "voice_lab.get_eval",
  "voice_lab.get_methodology",
  "voice_lab.compare_providers",
  "voice_lab.run_synthetic_eval",
  "voice_lab.list_benchmark_methodologies",
  "voice_lab.get_benchmark_methodology",
  "voice_lab.list_leaderboards",
  "voice_lab.get_fixture_leaderboard",
  "voice_lab.verify_benchmark_result",
] as const;

export function listProvidersTool(environment: EnvironmentLookup = process.env) {
  return getPublicProviders(environment);
}

export function getProviderTool(providerId: string, environment: EnvironmentLookup = process.env) {
  return getPublicProvider(providerId, environment);
}

export function listEvalsTool(environment: EnvironmentLookup = process.env) {
  return getPublicEvals(environment);
}

export function getEvalTool(evalId: string, environment: EnvironmentLookup = process.env) {
  return getPublicEvals(environment).find((evaluation) => evaluation.id === evalId) ?? null;
}

export function getMethodologyTool(environment: EnvironmentLookup = process.env) {
  return getPublicMethodology(environment);
}

export function compareProvidersTool(
  providerIds: string[],
  environment: EnvironmentLookup = process.env,
  policies: readonly ProviderOperationalPolicy[] = [],
) {
  return comparePublicProviderEvidence(getPublicProviders(environment, policies), providerIds);
}

export function comparePublicProviderEvidence(
  providers: readonly PublicProvider[],
  providerIds: readonly string[],
) {
  const requested = new Set(providerIds);
  return {
    comparisonType: "registry_evidence_only" as const,
    rankingProvided: false as const,
    providers: providers.filter((provider) => requested.has(provider.id)),
    limitations: [
      "This comparison reports registry evidence and integration state; it is not a quality ranking.",
      "Equivalent provider measurements do not yet exist in the public registry.",
    ],
  };
}

export function runSyntheticEvalTool(evalId: string, environment: EnvironmentLookup = process.env) {
  return runPublicSyntheticEval(evalId, environment);
}
