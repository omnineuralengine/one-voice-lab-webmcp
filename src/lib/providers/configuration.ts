import { getProviderAdapterRegistration } from "@/lib/providers/adapters";
import { hasServerCredentialConfiguration } from "@/lib/providers/server-credential";
import { requireProviderManifest, PROVIDER_REGISTRY } from "@/lib/providers/registry";
import type { ProviderConfigurationState, ProviderId } from "@/lib/providers/types";

type EnvironmentLookup = Readonly<Record<string, string | undefined>>;

export function getProviderConfigurationState(
  providerId: string,
  environment: EnvironmentLookup = process.env,
): ProviderConfigurationState {
  const manifest = requireProviderManifest(providerId);
  const credentialNames = getProviderAdapterRegistration(manifest.id)?.credentialEnvironmentVariables
    ?? manifest.environmentVariables;
  const configured = hasServerCredentialConfiguration(credentialNames, environment);
  return Object.freeze({ providerId: manifest.id, configured });
}

export function getProviderConfigurationStates(
  environment: EnvironmentLookup = process.env,
): Readonly<Record<ProviderId, ProviderConfigurationState>> {
  return Object.freeze(Object.fromEntries(
    PROVIDER_REGISTRY.map((manifest) => [manifest.id, getProviderConfigurationState(manifest.id, environment)]),
  ) as Record<ProviderId, ProviderConfigurationState>);
}
