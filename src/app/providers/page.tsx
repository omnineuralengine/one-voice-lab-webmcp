import { AgentRailAnalytics } from "@/components/discovery/AgentRailAnalytics";
import { DiscoveryNav } from "@/components/discovery/DiscoveryNav";
import { JsonLd } from "@/components/discovery/JsonLd";
import { ProviderRolodex } from "@/components/providers/ProviderRolodex";
import { VoiceOpenLabNav } from "@/components/voice-open-lab/VoiceOpenLabNav";
import { createPublicMetadata } from "@/lib/public-evidence/metadata";
import { getPublicProviders } from "@/lib/public-evidence/registry";
import { getProviderRegistryJsonLd } from "@/lib/public-evidence/structured-data";
import { readPublicProviderOperationalPolicies } from "@/lib/providers/policy-service";

export const dynamic = "force-dynamic";

export const metadata = createPublicMetadata({
  title: "Provider Registry and Hub: Voice AI Providers, Capabilities, and Evidence",
  description: "Inspect ONE Voice Lab's provider catalog, installed adapters, runtime readiness, health, capabilities, and benchmark eligibility without conflating catalog membership with integration.",
  path: "/providers",
});

export default async function ProvidersPage() {
  const policies = await readPublicProviderOperationalPolicies();
  const providers = getPublicProviders(process.env, policies);
  return (
    <>
      <JsonLd data={getProviderRegistryJsonLd(providers)} />
      <AgentRailAnalytics surface="providers" />
      <div className="mx-auto w-full max-w-7xl space-y-4 px-4 pt-6 sm:px-6 lg:px-8">
        <VoiceOpenLabNav current="compare" />
        <DiscoveryNav />
      </div>
      <ProviderRolodex providers={providers} />
    </>
  );
}
