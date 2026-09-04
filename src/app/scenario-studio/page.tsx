import type { Metadata } from "next";

import { ModuleHero, ModulePageShell } from "@/components/one/ModulePrimitives";
import { ScenarioStudio } from "@/components/scenarios/ScenarioStudio";
import { VoiceOpenLabNav } from "@/components/voice-open-lab/VoiceOpenLabNav";
import { createPublicMetadata } from "@/lib/public-evidence/metadata";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createPublicMetadata({
  title: "Scenario Studio",
  description: "Run one curated, synthetic voice-interruption scenario and inspect a deterministic, explainable receipt without contacting a provider.",
  path: "/scenario-studio",
});

export default function ScenarioStudioPage() {
  return (
    <ModulePageShell className="scenario-studio-page">
      <div className="scenario-studio-page__inner">
        <VoiceOpenLabNav current="evaluate" />
        <ModuleHero
          className="scenario-studio-hero"
          eyebrow="Scenario Studio · one safe guided run"
          outcome="See how ONE responds when a caller interrupts, then inspect exactly what the fixture supports and what it cannot prove."
          title="Understand interruption recovery"
        />
        <ScenarioStudio />
      </div>
    </ModulePageShell>
  );
}
