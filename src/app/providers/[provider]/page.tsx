import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AgentRailAnalytics } from "@/components/discovery/AgentRailAnalytics";
import { DiscoveryNav } from "@/components/discovery/DiscoveryNav";
import { JsonLd } from "@/components/discovery/JsonLd";
import { AdaptiveSection, HumanDepthControl, TechnicalDetails } from "@/components/one/AdaptiveInterface";
import { ModuleHero, ModulePageShell, ModulePanel, ModuleStatusStrip } from "@/components/one/ModulePrimitives";
import { VoiceOpenLabNav } from "@/components/voice-open-lab/VoiceOpenLabNav";
import { createPublicMetadata } from "@/lib/public-evidence/metadata";
import { getPublicProvider, getPublicProviders } from "@/lib/public-evidence/registry";
import { getProviderJsonLd } from "@/lib/public-evidence/structured-data";
import { readPublicProviderOperationalPolicies } from "@/lib/providers/policy-service";

export const dynamic = "force-dynamic";
export const dynamicParams = false;

export function generateStaticParams() {
  return getPublicProviders({}).map((provider) => ({ provider: provider.id }));
}
export async function generateMetadata(
  { params }: { params: Promise<{ provider: string }> },
): Promise<Metadata> {
  const { provider: providerId } = await params;
  const policies = await readPublicProviderOperationalPolicies();
  const provider = getPublicProvider(providerId, process.env, policies);
  if (!provider) return {};
  return createPublicMetadata({
    title: `${provider.name} provider evidence`,
    description: `${provider.description} Status: ${provider.status}. Evidence: ${provider.evidence}.`,
    path: `/providers/${provider.id}`,
  });
}

export default async function ProviderPage(
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: providerId } = await params;
  const policies = await readPublicProviderOperationalPolicies();
  const provider = getPublicProvider(providerId, process.env, policies);
  if (!provider) notFound();
  const platform = provider.platform;

  return (
    <ModulePageShell className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <AgentRailAnalytics recordId={provider.id} surface="provider" />
      <JsonLd data={getProviderJsonLd(provider)} />
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <VoiceOpenLabNav current="compare" />
        <DiscoveryNav />
        <ModuleHero
          eyebrow="Provider evidence profile · attributable, not endorsed"
          title={provider.name}
          outcome={provider.description}
          actions={<div className="flex flex-wrap gap-2"><Link className="inline-flex min-h-11 items-center rounded-lg border border-cyan-300/20 bg-cyan-300/[0.07] px-4 py-2 text-sm font-semibold text-cyan-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200" href="/evals">Explore evaluation registry</Link>{provider.id === "deepgram" ? <Link className="inline-flex min-h-11 items-center rounded-lg border border-emerald-300/25 bg-emerald-300/[0.08] px-4 py-2 text-sm font-semibold text-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-200" href="/providers/deepgram/early-access">Open Early Access Bench</Link> : null}{provider.id === "elevenlabs" ? <Link className="inline-flex min-h-11 items-center rounded-lg border border-violet-300/25 bg-violet-300/[0.08] px-4 py-2 text-sm font-semibold text-violet-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-200" href="/providers/elevenlabs/api-studio">Open ElevenLabs API Studio</Link> : null}{provider.id === "fish-audio" ? <Link className="inline-flex min-h-11 items-center rounded-lg border border-cyan-300/25 bg-cyan-300/[0.08] px-4 py-2 text-sm font-semibold text-cyan-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200" href="/providers/fish-audio/api-studio">Open Fish Audio API Studio</Link> : null}</div>}
        />

        <HumanDepthControl compact heading={`${provider.name} profile detail`} />

        {provider.id === "deepgram" ? <ModulePanel title="Available Deepgram tools" description="These tools are provider-attributable capabilities inside ONE. Their presence does not imply sponsorship, endorsement, or universal superiority."><div className="voice-open-provider-actions"><Link href="/?module=live-mic">Realtime transcription</Link><Link href="/?module=upload-audio">Prerecorded STT</Link><Link href="/?module=tts">Text to Speech</Link><Link href="/?module=api-studio&operation=voice-agent-converse">Voice Agent console</Link><Link href="/?module=language-explorer">Language configuration</Link><Link href="/?module=audio-signal-lab">Audio testing</Link><Link href="/architecture-studio">Architecture tooling</Link></div><TechnicalDetails className="mt-4" summary="Read the historical provenance note"><p className="text-sm leading-6 text-slate-400">ONE Voice Lab grew from an independent Deepgram hiring journey and continued hands-on exploration. It contains no private hiring correspondence, program terms, or non-public roadmap information.</p></TechnicalDetails></ModulePanel> : null}

        <AdaptiveSection description="Discovery, integration, runtime, health, and benchmark are separate axes." minimum="detailed" summary="Inspect provider lifecycle status">
          <ModuleStatusStrip
            label={`${provider.name} provider-platform status`}
            items={[
              { label: "Discovery", value: humanize(platform.lifecycle.discovery), tone: "purple" },
              { label: "Integration", value: humanize(platform.lifecycle.integration), tone: platform.integration.installed ? "green" : "neutral" },
              { label: "Runtime", value: humanize(platform.lifecycle.runtime), tone: platform.lifecycle.runtime === "enabled" ? "amber" : "neutral" },
              { label: "Health", value: humanize(platform.health.state), tone: platform.health.state === "healthy" ? "green" : "neutral" },
              { label: "Benchmark", value: humanize(platform.lifecycle.benchmark), tone: ["benchmark-eligible", "publicly-ranked"].includes(platform.lifecycle.benchmark) ? "green" : "neutral" },
            ]}
          />
        </AdaptiveSection>

        <AdaptiveSection description="Stable identity, verification, credential readiness, and current limitations." minimum="detailed" summary="Inspect the evidence boundary"><ModulePanel title="Evidence boundary" description="These fields report repository and documentation state. They are not a provider quality ranking or production-readiness claim.">
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4"><dt className="text-slate-500">Stable provider ID</dt><dd className="mt-1 font-mono text-white">{provider.id}</dd></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4"><dt className="text-slate-500">Evidence</dt><dd className="mt-1 text-white">{provider.evidence}</dd></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4"><dt className="text-slate-500">Documentation</dt><dd className="mt-1 text-white">{provider.documentationStatus}</dd></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4"><dt className="text-slate-500">Last verified</dt><dd className="mt-1 text-white">{provider.lastVerifiedAt ?? "No defensible date published"}</dd></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4"><dt className="text-slate-500">Credential readiness</dt><dd className="mt-1 text-white">{humanize(platform.credential.state)}</dd></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4"><dt className="text-slate-500">Readiness explanation</dt><dd className="mt-1 text-white">{platform.readiness.explanation}</dd></div>
          </dl>
        </ModulePanel></AdaptiveSection>

        <AdaptiveSection description="Human-readable capability families first; exact contract evidence remains available separately." minimum="detailed" summary="Inspect capability evidence"><ModulePanel title="Capabilities in ONE" description="Provider-documented support and installed integration remain attributable and separate.">
          {platform.capabilities.length ? (
            <ul className="one-provider-capability-summary" aria-label={`${provider.name} capability families`}>
              {[...new Set(platform.capabilities.map((capability) => humanize(capability.family)))].map((family) => <li key={family}>{family}</li>)}
            </ul>
          ) : <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-slate-500">No verified capability declarations are published for this catalog entry.</p>}

          <TechnicalDetails className="mt-4" summary="Inspect exact capability contracts" description="Stable capability IDs, verification, adapters, cost, and benchmark eligibility.">
            {platform.capabilities.length ? (
              <ul className="grid gap-3 sm:grid-cols-2">
                {platform.capabilities.map((capability) => (
                  <li className="min-w-0 rounded-xl border border-white/10 bg-black/20 p-4" key={capability.id}>
                    <h3 className="break-all font-mono text-sm font-semibold text-white">{capability.id}</h3>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <ProviderDetailFact label="Support" value={capability.support} />
                      <ProviderDetailFact label="Verification" value={capability.verification} />
                      <ProviderDetailFact label="Integration path" value={capability.integrationPath} />
                      <ProviderDetailFact label="Benchmark" value={capability.benchmarkEligibility} />
                      <ProviderDetailFact label="Cost-bearing" value={capability.costBearing ? "Yes" : "No"} />
                      <ProviderDetailFact label="Required adapter" value={capability.requiredAdapter} />
                    </dl>
                  </li>
                ))}
              </ul>
            ) : null}
          </TechnicalDetails>
        </ModulePanel></AdaptiveSection>

        <ModulePanel title="Limitations">
          <ul className="space-y-2 text-sm leading-6 text-slate-300">{provider.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
        </ModulePanel>

        <TechnicalDetails summary="Inspect public machine interfaces"><ModulePanel title="Public machine record" description="The API record and MCP tools use this same stable provider ID.">
          <div className="flex flex-wrap gap-2">
            <a className="inline-flex min-h-11 items-center rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-cyan-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200" href={`/api/public/v1/providers/${provider.id}`}>Read provider JSON</a>
            <Link className="inline-flex min-h-11 items-center rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-cyan-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200" href="/providers">Compare listed provider states</Link>
          </div>
        </ModulePanel></TechnicalDetails>

        {(platform.links.website || platform.links.documentation) ? (
          <AdaptiveSection description="Curated external references, never runtime endpoints." minimum="detailed" summary="Open official provider sources"><ModulePanel title="Official sources" description="External links are curated metadata sources, not runtime endpoints.">
            <div className="flex flex-wrap gap-2">
              {platform.links.website ? <a className="inline-flex min-h-11 items-center rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-cyan-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200" href={platform.links.website} rel="noreferrer" target="_blank">Official website</a> : null}
              {platform.links.documentation ? <a className="inline-flex min-h-11 items-center rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-cyan-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200" href={platform.links.documentation} rel="noreferrer" target="_blank">Official documentation</a> : null}
            </div>
          </ModulePanel></AdaptiveSection>
        ) : null}
      </div>
    </ModulePageShell>
  );
}

function ProviderDetailFact({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-slate-500">{label}</dt><dd className="mt-0.5 break-words text-slate-200">{humanize(value)}</dd></div>;
}

function humanize(value: string) {
  return value.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}
