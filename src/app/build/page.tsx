import type { Metadata } from "next";
import Link from "next/link";

import { ModulePageShell, ModulePanel } from "@/components/one/ModulePrimitives";
import { VoiceOpenLabAnalytics } from "@/components/voice-open-lab/VoiceOpenLabAnalytics";
import { VoiceOpenLabNav } from "@/components/voice-open-lab/VoiceOpenLabNav";
import { createPublicMetadata } from "@/lib/public-evidence/metadata";
import { VOICE_OPEN_LAB_BUILD_PATH, VOICE_OPEN_LAB_BUILD_TOOLS } from "@/lib/voice-open-lab/navigation";

export const metadata: Metadata = createPublicMetadata({
  title: "Build with Voice AI",
  description: "Contextual technical tools for API exploration, architecture, language, audio, SDK diagnosis, and applied solution design.",
  path: "/build",
});

export default function BuildPage() {
  return (
    <ModulePageShell className="voice-open-route-shell">
      <VoiceOpenLabAnalytics surface="build" />
      <VoiceOpenLabNav current="build" />
      <header className="voice-open-route-hero">
        <p>One guided path · specialist tools when needed</p>
        <h1>Build</h1>
        <span>Move from a clear need to an explainable design and a validated handoff, or jump directly to the specialist tool you already know.</span>
      </header>
      <section aria-labelledby="voice-open-build-path-title" className="voice-open-build-path">
        <div className="voice-open-section-heading">
          <div><p>Guided solution path</p><h2 id="voice-open-build-path-title">Understand → Design → Validate</h2></div>
          <span>Start here when the next technical step is not obvious.</span>
        </div>
        <ol className="voice-open-build-path__steps">
          {VOICE_OPEN_LAB_BUILD_PATH.map((stage, index) => (
            <li key={stage.id}>
              <Link href={stage.href}>
                <span>{String(index + 1).padStart(2, "0")} · {stage.step}</span>
                <h3>{stage.label}</h3>
                <p>{stage.description}</p>
                <strong>Continue</strong>
              </Link>
            </li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="voice-open-build-tools-title" className="voice-open-build-tools">
        <div className="voice-open-section-heading">
          <div><p>Specialist tools</p><h2 id="voice-open-build-tools-title">Open a focused workspace</h2></div>
          <span>Existing direct links remain available for experienced operators.</span>
        </div>
        <div className="voice-open-index-grid">
          {VOICE_OPEN_LAB_BUILD_TOOLS.map((tool) => (
            <Link className="voice-open-index-card" href={tool.href} key={tool.id}>
              <span>Build tool</span><h2>{tool.label}</h2><p>{tool.description}</p><strong>Open workspace</strong>
            </Link>
          ))}
        </div>
      </section>
      <ModulePanel title="Execution boundary" description="Configuration, inspection, and navigation never imply execution.">
        <p className="text-sm leading-6 text-slate-300">Live or billable actions remain inside their owning module, use the existing server-side credential boundary, and require the existing explicit confirmation. ONE Voice Lab does not expose an arbitrary provider proxy.</p>
      </ModulePanel>
    </ModulePageShell>
  );
}
