import type { Metadata } from "next";
import Link from "next/link";

import { ModulePageShell, ModulePanel } from "@/components/one/ModulePrimitives";
import { VoiceOpenLabAnalytics } from "@/components/voice-open-lab/VoiceOpenLabAnalytics";
import { VoiceOpenLabNav } from "@/components/voice-open-lab/VoiceOpenLabNav";
import { createPublicMetadata } from "@/lib/public-evidence/metadata";
import { VOICE_OPEN_LAB_LEARN_SURFACES } from "@/lib/voice-open-lab/navigation";

export const metadata: Metadata = createPublicMetadata({
  title: "Learn Voice AI systems",
  description: "Understand voice-system events, architecture, latency, failures, evidence, privacy, and recovery through the existing Lab.",
  path: "/learn",
});

export default function LearnPage() {
  return (
    <ModulePageShell className="voice-open-route-shell">
      <VoiceOpenLabAnalytics surface="learn" />
      <VoiceOpenLabNav current="learn" />
      <header className="voice-open-route-hero">
        <p>Explain what happened underneath</p><h1>Learn</h1>
        <span>Follow the evidence from audio ingress to business outcome without turning a fixture, mock, or design idea into a provider claim.</span>
      </header>
      <div className="voice-open-index-grid">
        {VOICE_OPEN_LAB_LEARN_SURFACES.map((surface) => (
          <Link className="voice-open-index-card" href={surface.href} key={surface.id}>
            <span>Learning surface</span><h2>{surface.label}</h2><p>{surface.description}</p><strong>Explore</strong>
          </Link>
        ))}
      </div>
      <ModulePanel title="Claim vocabulary">
        <div className="voice-open-claim-grid">
          <p><strong>Repository verified</strong><span>Implemented or tested in this checkout.</span></p>
          <p><strong>Deepgram documentation verified</strong><span>Backed by a dated authoritative source.</span></p>
          <p><strong>Assumption</strong><span>Reasonable, but still needs evidence.</span></p>
          <p><strong>Experimental idea</strong><span>A Lab hypothesis, not a provider promise.</span></p>
        </div>
      </ModulePanel>
    </ModulePageShell>
  );
}
