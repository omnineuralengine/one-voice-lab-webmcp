import type { Metadata } from "next";

import { SimulationObservatory } from "@/components/simulations/SimulationObservatory";
import { VoiceReplayAgentAccess } from "@/components/simulations/VoiceReplayAgentAccess";
import { VoiceReplayWebMcpProvider } from "@/components/simulations/VoiceReplayWebMcpProvider";
import { VoiceOpenLabAnalytics } from "@/components/voice-open-lab/VoiceOpenLabAnalytics";
import { VoiceOpenLabNav } from "@/components/voice-open-lab/VoiceOpenLabNav";
import { createPublicMetadata } from "@/lib/public-evidence/metadata";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createPublicMetadata({
  title: "Simulation Lab",
  description: "Run deterministic synthetic voice-system experiments, inspect failure propagation, compare runs, and save bounded evidence without provider spend.",
  path: "/simulation-lab",
});

export default function SimulationLabPage() {
  const operatorEnabled = process.env.VOICE_LAB_OPERATOR_MODE === "true";
  return <main className="voice-open-route-shell"><VoiceOpenLabAnalytics surface="simulations" /><VoiceOpenLabNav current="simulate" /><header className="voice-open-route-hero"><p>ONE Voice Lab · Experimental · Simulated</p><h1>Simulation Lab</h1><span>Change bounded synthetic conditions, watch failure propagation, and compare evidence without pretending it is production telemetry.</span><div><strong>Deterministic replay</strong><strong>No provider spend</strong><strong>One run is not a benchmark</strong></div></header><VoiceReplayWebMcpProvider><VoiceReplayAgentAccess /><SimulationObservatory operatorEnabled={operatorEnabled} /></VoiceReplayWebMcpProvider></main>;
}
