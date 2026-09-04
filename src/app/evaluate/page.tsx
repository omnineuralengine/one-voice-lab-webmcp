import type { Metadata } from "next";
import Link from "next/link";

import { BenchmarkWorkspace as BenchmarkWorkspaceView } from "@/components/evaluate/BenchmarkWorkspace";
import { EvaluateWorkspace } from "@/components/evaluate/EvaluateWorkspace";
import { AdaptiveSection, ExplainThis, HumanDepthControl } from "@/components/one/AdaptiveInterface";
import { ModuleHero, ModulePageShell, ModuleStatusStrip } from "@/components/one/ModulePrimitives";
import { VoiceOpenLabNav } from "@/components/voice-open-lab/VoiceOpenLabNav";
import { createPublicMetadata } from "@/lib/public-evidence/metadata";
import { toBenchmarkPlanningProviders } from "@/lib/providers/benchmark-projection";
import { projectProviderPlatform } from "@/lib/providers/platform-service";
import { readPublicProviderOperationalPolicies } from "@/lib/providers/policy-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createPublicMetadata({
  title: "Evaluate TTS Providers",
  description: "Run one scenario across configured text-to-speech providers, listen blind, inspect measured evidence, rate outputs, and export a private reproducible bundle.",
  path: "/evaluate",
});

export default function EvaluatePage() {
  return (
    <ModulePageShell className="evaluate-page">
      <div className="evaluate-page__inner">
        <VoiceOpenLabNav current="evaluate" />
        <ModuleHero
          className="evaluate-hero"
          eyebrow="Evaluate · provider-neutral voice comparison"
          outcome="Compare the same scenario, listen before judging, and reveal the evidence behind each result."
          title="Compare voice outputs"
        />
        <aside aria-labelledby="scenario-studio-entry-title" className="evaluate-scenario-entry">
          <div>
            <p className="one-module-eyebrow">New guided path · no provider call</p>
            <h2 id="scenario-studio-entry-title">Start with a real-world interruption scenario</h2>
            <p>Run one deterministic synthetic fixture, receive a sanitized ephemeral receipt, and ask ONE to explain what the evidence does—and does not—support.</p>
          </div>
          <Link href="/scenario-studio">Open Scenario Studio</Link>
        </aside>
        <div className="evaluate-promise">
          <p>Start with what you hear. Provider identity, measurements, methodology, and sanitized technical evidence remain available when you need them.</p>
          <Link href="/methodology">Read the versioned methodology</Link>
        </div>
        <ExplainThis summary="Why one comparison is not a universal ranking">
          <p>Voice results depend on the text, voice, model, configuration, environment, and measurement method. ONE preserves those conditions so a result can be understood without turning one run into a universal claim.</p>
        </ExplainThis>
        <HumanDepthControl compact heading="Evaluation detail" />
        <ModuleStatusStrip
          items={[
            { label: "Default", value: "Fixture evidence", tone: "green" },
            { label: "Providers", value: "Capability-driven", tone: "purple" },
            { label: "Live calls", value: "Protected + confirmed", tone: "amber" },
            { label: "Privacy", value: "Private + ephemeral", tone: "neutral" },
          ]}
          label="Evaluate workspace boundaries"
        />
        <EvaluateWorkspace />
        <AdaptiveSection description="Plan fixture benchmarks, inspect ranking eligibility, and review integrity evidence." minimum="detailed" summary="Open benchmark planning and leaderboard evidence">
          <BenchmarkWorkspace />
        </AdaptiveSection>
      </div>
    </ModulePageShell>
  );
}

async function BenchmarkWorkspace() {
  const providerPolicies = await readPublicProviderOperationalPolicies();
  const benchmarkProviders = toBenchmarkPlanningProviders(projectProviderPlatform({
    policies: providerPolicies,
  }));
  return <BenchmarkWorkspaceView providerCatalog={benchmarkProviders} />;
}
