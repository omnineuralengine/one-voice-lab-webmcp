import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, ModulePageShell, ModulePanel, ModuleStatusStrip } from "@/components/one/ModulePrimitives";
import { VoiceOpenLabAnalytics } from "@/components/voice-open-lab/VoiceOpenLabAnalytics";
import { VoiceOpenLabNav } from "@/components/voice-open-lab/VoiceOpenLabNav";
import { getPublicEarlyAccessExperiments } from "@/lib/early-access/public-registry";
import { createPublicMetadata } from "@/lib/public-evidence/metadata";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createPublicMetadata({
  title: "Deepgram Early Access Bench",
  description: "A safe public surface for explicitly approved ONE Voice Lab experiments. No confidential early-access metadata is shipped by default.",
  path: "/providers/deepgram/early-access",
});

export default function EarlyAccessBenchPage() {
  const experiments = getPublicEarlyAccessExperiments();
  return (
    <ModulePageShell className="voice-open-route-shell" data-provider-theme="deepgram">
      <VoiceOpenLabAnalytics surface="early_access" />
      <VoiceOpenLabNav current="deepgram" />
      <header className="voice-open-route-hero voice-open-route-hero--provider">
        <p>Deepgram - Featured Provider</p><h1>Early Access Bench</h1>
        <span>Explore only the newest technical evaluations that the Lab owner has explicitly cleared for public exposure.</span>
      </header>
      <ModuleStatusStrip label="Early Access Bench status" items={[
        { label: "Public experiments", value: String(experiments.length), tone: experiments.length ? "green" : "neutral" },
        { label: "Private metadata", value: "Excluded", tone: "green" },
        { label: "Automatic execution", value: "Never", tone: "green" },
      ]} />
      {experiments.length ? (
        <div className="voice-open-index-grid">{experiments.map((experiment) => (
          <article className="voice-open-index-card" key={experiment.id}>
            <span>{experiment.status} - {experiment.evidence}</span><h2>{experiment.name}</h2><p>{experiment.description}</p><strong>{experiment.whatIsBeingTested}</strong>
          </article>
        ))}</div>
      ) : (
        <EmptyState title="No public early-access experiments are configured" description="The Bench infrastructure is ready, but confidential or uncleared feature metadata is not included in the public build. An experiment appears here only after explicit public review." action={<Link className="voice-open-inline-action" href="/providers/deepgram">Return to Deepgram</Link>} />
      )}
      <ModulePanel title="Independent evaluation boundary">
        <p className="text-sm leading-6 text-slate-300">Experiments shown here are independent ONE Voice Lab evaluations and do not represent Deepgram product commitments or roadmap guarantees.</p>
      </ModulePanel>
    </ModulePageShell>
  );
}
