import type { Metadata } from "next";

import { StudioIntake } from "@/components/studio/StudioIntake";
import { VoiceOpenLabNav } from "@/components/voice-open-lab/VoiceOpenLabNav";
import { createPublicMetadata } from "@/lib/public-evidence/metadata";

export const metadata: Metadata = createPublicMetadata({
  title: "Voice AI Solution Studio",
  description: "Start with a goal, tech stack, hosting environment, and one or more voice providers; then turn the intake into reviewable architecture and branded handoff resources.",
  path: "/studio",
});

export default function StudioPage() {
  return (
    <main className="voice-open-route-shell min-h-screen pb-28">
      <VoiceOpenLabNav current="build" />
      <header className="voice-open-route-hero">
        <p>Understand → design → validate</p>
        <h1>ONE Solution Studio</h1>
        <span>One calm starting point for discovery, provider flow, technical architecture, and a shareable human-reviewed handoff.</span>
        <div><strong>Local resource review</strong><strong>One or many providers</strong><strong>Branded exports</strong></div>
      </header>
      <StudioIntake />
    </main>
  );
}
