"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { AdaptiveSection, HumanDepthControl, TechnicalDetails } from "@/components/one/AdaptiveInterface";
import { ModuleHero, ModulePageShell, ModulePanel, ModuleStatusStrip } from "@/components/one/ModulePrimitives";
import { useOneExperience } from "@/components/one/OneExperienceProvider";
import { ProviderPreferenceControls, type ProviderPreferenceOption } from "@/components/providers/ProviderPreferenceControls";
import type { PublicProvider } from "@/lib/public-evidence/schemas";
import { DEFAULT_PROVIDER_PREFERENCES, type ProviderPreferences } from "@/lib/providers/preference-schema";
import type { ProviderCatalogGroup } from "@/lib/providers/platform-types";

const GROUPS: ReadonlyArray<Readonly<{ id: ProviderCatalogGroup; label: string; description: string }>> = [
  { id: "core-and-immediate", label: "Core and immediate", description: "Installed integrations and the nearest provider-onboarding targets." },
  { id: "benchmark-anchors", label: "Benchmark anchors", description: "Speech providers retained for future verified catalog and benchmark coverage." },
  { id: "specialist-voice", label: "Specialist voice", description: "Voice specialists whose capabilities remain unclaimed until officially verified." },
  { id: "local-and-self-hosted", label: "Local and self-hosted", description: "Local runtimes and private-deployment candidates, kept separate from hosted vendors." },
  { id: "voice-stack-infrastructure", label: "Voice stack infrastructure", description: "Transport and orchestration systems—not speech-model providers or ranking candidates." },
  { id: "evaluation-interoperability", label: "Evaluation interoperability", description: "External evaluation systems—not providers and never canonical benchmark truth." },
];

export function ProviderRolodex({ providers }: { providers: readonly PublicProvider[] }) {
  const one = useOneExperience();
  return <ProviderRolodexForIdentity key={one.user?.id ?? "guest"} providers={providers} />;
}

function ProviderRolodexForIdentity({ providers }: { providers: readonly PublicProvider[] }) {
  const [preferences, setPreferences] = useState<ProviderPreferences>(DEFAULT_PROVIDER_PREFERENCES);
  const updatePreferences = useCallback((next: ProviderPreferences) => setPreferences(next), []);
  const visibleProviders = useMemo(() => {
    const hidden = new Set(preferences.hiddenProviderIds);
    const favorites = new Set(preferences.favoriteProviderIds);
    const preferredOrder = new Map(preferences.preferredProviderOrder.map((id, index) => [id, index]));
    return providers.filter((provider) => !hidden.has(provider.id)).sort((left, right) => {
      const favoriteDifference = Number(favorites.has(right.id)) - Number(favorites.has(left.id));
      if (favoriteDifference) return favoriteDifference;
      const leftOrder = preferredOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = preferredOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    });
  }, [preferences, providers]);
  const options = useMemo<ProviderPreferenceOption[]>(() => providers.map((provider) => ({
    id: provider.id,
    name: provider.name,
    supportsStt: provider.platform.capabilities.some((capability) => capability.family === "speech-to-text" && capability.support === "supported"),
    supportsTts: provider.platform.capabilities.some((capability) => capability.family === "text-to-speech" && capability.support === "supported"),
  })), [providers]);
  const installedCount = providers.filter((provider) => provider.platform.integration.installed).length;
  const configuredCount = providers.filter((provider) => provider.platform.credential.state === "configured-not-runtime-verified").length;
  const liveCount = providers.filter((provider) => provider.platform.readiness.state === "live-enabled").length;
  const benchmarkCount = providers.filter((provider) => ["benchmark-eligible", "publicly-ranked"].includes(provider.platform.lifecycle.benchmark)).length;

  return (
    <ModulePageShell className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl space-y-5">
        <ModuleHero
          eyebrow="Compare · provider-neutral discovery"
          title="Explore voice providers"
          outcome="Start with capabilities and availability. Open lifecycle, configuration, and evidence details only when they help your decision."
          actions={<Link className="inline-flex min-h-11 items-center rounded-lg border border-white/15 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white hover:border-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300 motion-reduce:transition-none" href="/evaluate">Compare voice outputs</Link>}
        />

        <HumanDepthControl compact heading="Provider detail" />

        <AdaptiveSection description="Catalog size, integration, configuration, runtime, and benchmark gates." minimum="detailed" summary="Inspect Provider Hub operational status">
          <ModuleStatusStrip
            label="Provider Hub status"
            items={[
              { label: "Catalog entries", value: String(providers.length), tone: "purple" },
              { label: "Installed integrations", value: String(installedCount), tone: "green" },
              { label: "Configured, not health-verified", value: String(configuredCount), tone: "neutral" },
              { label: "Live-enabled by all gates", value: String(liveCount), tone: liveCount ? "amber" : "neutral" },
              { label: "Benchmark eligible", value: String(benchmarkCount), tone: benchmarkCount ? "green" : "neutral" },
            ]}
          />

          <ModulePanel title="Read each status axis separately" description="Operational state restricts installed code; it cannot manufacture an adapter or turn provider documentation into measured evidence.">
            <dl className="grid gap-3 text-sm leading-6 sm:grid-cols-2 lg:grid-cols-3">
              <StatusDefinition term="Catalog" description="A curated identity record. It does not imply integration." />
              <StatusDefinition term="Integration" description="Whether this checkout has an applicable adapter and contract evidence." />
              <StatusDefinition term="Credential readiness" description="Server configuration presence only; secret values and variable names never leave the server." />
              <StatusDefinition term="Runtime policy" description="Whether administrators permit fixture, private, trusted, or public operation." />
              <StatusDefinition term="Health" description="A bounded operational signal, never a quality score." />
              <StatusDefinition term="Benchmark" description="Explicit evidence eligibility, independent of current availability." />
            </dl>
          </ModulePanel>
        </AdaptiveSection>

        <AdaptiveSection description="Favorite, hide, order, and choose presentation defaults without changing provider policy." minimum="guided" summary="Personalize this catalog">
          <ProviderPreferenceControls options={options} preferences={preferences} onChange={updatePreferences} />
        </AdaptiveSection>

        {preferences.hiddenProviderIds.length ? (
          <p className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-400" role="note">
            {preferences.hiddenProviderIds.length} provider {preferences.hiddenProviderIds.length === 1 ? "entry is" : "entries are"} hidden by your presentation preference. Open Personalize to restore them.
          </p>
        ) : null}

        {GROUPS.map((group, groupIndex) => {
          const groupProviders = visibleProviders.filter((provider) => provider.platform.group === group.id);
          return (
            <details className="rounded-2xl border border-white/10 bg-[#070d13]" key={group.id} open={groupIndex === 0 ? true : undefined}>
              <summary className="min-h-11 cursor-pointer px-4 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300 sm:px-5">
                <span className="font-semibold text-white">{group.label}</span>
                <span className="ml-2 text-xs text-slate-500">{groupProviders.length} visible</span>
                <span className="mt-1 block text-sm font-normal leading-6 text-slate-400">{group.description}</span>
              </summary>
              <div className="grid gap-4 border-t border-white/10 p-4 sm:p-5 lg:grid-cols-2">
                {groupProviders.length ? groupProviders.map((provider) => (
                  <ProviderCard favorite={preferences.favoriteProviderIds.includes(provider.id)} key={provider.id} provider={provider} />
                )) : <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-slate-500">No visible entries in this group.</p>}
              </div>
            </details>
          );
        })}
      </div>
    </ModulePageShell>
  );
}

function ProviderCard({ provider, favorite }: { provider: PublicProvider; favorite: boolean }) {
  const platform = provider.platform;
  const primaryModuleHref = provider.modules.find((module) => module.capabilities.includes("tts"))?.href ?? provider.modules[0]?.href;
  const titleId = `provider-${provider.id}-title`;
  return (
    <article aria-labelledby={titleId} className="flex min-w-0 flex-col rounded-2xl border border-white/10 bg-black/20 p-4 shadow-[0_16px_50px_rgba(0,0,0,0.2)] sm:p-5" data-provider-card={provider.id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{platform.category}</p>
          <h2 className="mt-1 break-words text-2xl font-semibold text-white" id={titleId}>{provider.name}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {favorite ? <StatusPill label="Favorite" /> : null}
          <StatusPill label={platform.metadata.verification === "unverified" ? "Metadata unverified" : platform.metadata.verification} />
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-300">{provider.description}</p>
      <ul aria-label={`${provider.name} capability families`} className="one-provider-capability-summary">
        {providerCapabilityFamilies(provider).map((capability) => <li key={capability}>{capability}</li>)}
      </ul>

      <AdaptiveSection className="mt-4" description="Integration, credential, runtime, health, benchmark, and exact capability evidence." minimum="detailed" summary="Inspect readiness and technical evidence">
        <h3 className="sr-only">{provider.name} readiness and lifecycle</h3>
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <ProviderFact label="Discovery" value={platform.lifecycle.discovery} />
          <ProviderFact label="Integration" value={platform.lifecycle.integration} />
          <ProviderFact label="Credential" value={platform.credential.state} />
          <ProviderFact label="Runtime" value={platform.lifecycle.runtime} />
          <ProviderFact label="Health" value={platform.health.state} />
          <ProviderFact label="Benchmark" value={platform.lifecycle.benchmark} />
        </dl>
        <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-slate-400"><strong className="text-slate-200">Readiness:</strong> {platform.readiness.explanation}</p>
        <TechnicalDetails className="mt-4" description="Exact capability IDs, verification states, and adapter paths." summary={`Inspect ${platform.capabilities.length} technical capability declarations`}>
          <div className="border-t border-white/10 p-3">
            {platform.capabilities.length ? <ul className="space-y-2">{platform.capabilities.map((capability) => (
              <li className="rounded-lg bg-white/[0.03] px-3 py-2 text-xs leading-5 text-slate-300" key={capability.id}>
                <span className="block break-all font-mono text-white">{capability.id}</span>
                <span>{capability.support} · {capability.verification} · {capability.integrationPath}</span>
              </li>
            ))}</ul> : <p className="text-sm text-slate-500">No verified capability declarations.</p>}
          </div>
        </TechnicalDetails>
      </AdaptiveSection>

      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        <Link aria-label={`Open ${provider.name} evidence profile`} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-violet-300/25 bg-violet-300/[0.07] px-3 py-2 text-center text-sm font-semibold text-violet-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300" href={`/providers/${provider.id}`}>Inspect evidence</Link>
        {primaryModuleHref ? <Link className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-[var(--one-purple)] px-3 py-2 text-center text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-200" data-provider-id={provider.id} href={primaryModuleHref}>Open supported module</Link> : null}
      </div>
    </article>
  );
}

function StatusDefinition({ term, description }: { term: string; description: string }) {
  return <div className="rounded-xl border border-white/10 bg-black/20 p-4"><dt className="font-semibold text-white">{term}</dt><dd className="mt-1 text-slate-400">{description}</dd></div>;
}

function StatusPill({ label }: { label: string }) {
  return <span className="rounded-full border border-violet-300/20 bg-violet-300/[0.07] px-2.5 py-1 text-xs font-semibold text-violet-100">{humanize(label)}</span>;
}

function ProviderFact({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-xl border border-white/10 bg-black/20 p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words font-semibold text-slate-100">{humanize(value)}</dd></div>;
}

function humanize(value: string) {
  return value.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function providerCapabilityFamilies(provider: PublicProvider) {
  const labels = new Set(provider.platform.capabilities.map((capability) => humanize(capability.family)));
  return labels.size ? [...labels] : ["Cataloged · capabilities unverified"];
}
