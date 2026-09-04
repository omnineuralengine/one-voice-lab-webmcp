import Link from "next/link";

import { AgentRailAnalytics } from "@/components/discovery/AgentRailAnalytics";
import { DiscoveryNav } from "@/components/discovery/DiscoveryNav";
import { JsonLd } from "@/components/discovery/JsonLd";
import { ModuleHero, ModulePageShell, ModulePanel, ModuleStatusStrip } from "@/components/one/ModulePrimitives";
import { VoiceOpenLabNav } from "@/components/voice-open-lab/VoiceOpenLabNav";
import { createPublicMetadata } from "@/lib/public-evidence/metadata";
import { getPublicEvals } from "@/lib/public-evidence/registry";
import { getEvalRegistryJsonLd } from "@/lib/public-evidence/structured-data";

export const metadata = createPublicMetadata({
  title: "Evaluation Registry",
  description: "Reproducible, nonbillable voice AI evaluation fixtures with stable IDs, evidence labels, limitations, and human-review criteria.",
  path: "/evals",
});

export default function EvalsPage() {
  const evaluations = getPublicEvals();
  return (
    <ModulePageShell className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <AgentRailAnalytics surface="evals" />
      <JsonLd data={getEvalRegistryJsonLd(evaluations)} />
      <div className="mx-auto w-full max-w-6xl space-y-5">
        <VoiceOpenLabNav current="simulate" />
        <DiscoveryNav />
        <ModuleHero eyebrow="Canonical evaluation registry" title="Voice AI Evaluations" outcome="Inspect deterministic local fixtures and their limits before interpreting any result. No public evaluation calls a provider or consumes credits." />
        <ModuleStatusStrip label="Evaluation registry status" items={[
          { label: "Stable fixtures", value: String(evaluations.length), tone: "green" },
          { label: "Provider calls", value: "None", tone: "green" },
          { label: "Evidence", value: "Simulated", tone: "purple" },
          { label: "Human review", value: "Preserved", tone: "amber" },
        ]} />
        <ModulePanel title="Evaluation catalog" description="Every card is a real link, and every slug is shared by the page, public API, and MCP tools.">
          <ul className="grid gap-3 sm:grid-cols-2">
            {evaluations.map((evaluation) => (
              <li className="rounded-xl border border-white/10 bg-black/20 p-4" key={evaluation.id}>
                <p className="font-mono text-xs text-slate-500">{evaluation.id}</p>
                <h2 className="mt-1 text-lg font-semibold text-white">{evaluation.name}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">{evaluation.description}</p>
                <p className="mt-3 text-xs text-violet-200">{evaluation.evidenceLabel} · no provider calls</p>
                <Link className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-cyan-300/20 px-3 py-2 text-sm font-semibold text-cyan-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200" href={`/evals/${evaluation.id}`}>
                  Open {evaluation.name} evaluation
                </Link>
              </li>
            ))}
          </ul>
        </ModulePanel>
      </div>
    </ModulePageShell>
  );
}
