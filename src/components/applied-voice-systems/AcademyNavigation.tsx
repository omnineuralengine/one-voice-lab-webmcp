"use client";

import type { AppliedVoiceSectionId, MasteryLevel } from "@/types/applied-voice";

const SECTIONS: Array<{ id: AppliedVoiceSectionId; label: string; short: string; purpose: string; provenance?: "working" | "simulated" | "mixed" }> = [
  { id: "client-discovery", label: "Client Discovery", short: "01", purpose: "Requirements → context pack", provenance: "working" },
  { id: "pipeline-anatomy", label: "Pipeline Anatomy", short: "02", purpose: "Layers + ownership", provenance: "working" },
  { id: "ecosystem-atlas", label: "Ecosystem Atlas", short: "03", purpose: "Agentic voice map", provenance: "mixed" },
  { id: "model-lab", label: "Model Lab", short: "04", purpose: "Reproducible experiments", provenance: "working" },
  { id: "turn-taking", label: "Turn-Taking Lab", short: "05", purpose: "Turns + latency", provenance: "simulated" },
  { id: "tool-calling", label: "Tool Calling Lab", short: "06", purpose: "Structured local actions", provenance: "simulated" },
  { id: "conversation-trace", label: "Conversation Trace", short: "07", purpose: "Flight recorder", provenance: "simulated" },
  { id: "evaluation", label: "Evaluation Lab", short: "08", purpose: "Scenario test runner", provenance: "simulated" },
  { id: "failure", label: "Failure Lab", short: "09", purpose: "Guided diagnosis", provenance: "simulated" },
  { id: "deployment", label: "Deployment Lab", short: "10", purpose: "Enterprise readiness", provenance: "mixed" },
  { id: "solution-brief", label: "Solution Brief", short: "11", purpose: "Client-ready export", provenance: "working" },
];

export function AcademyNavigation({
  activeSection,
  completedSections,
  masteryLevels,
  completedMasteryRequirementIds,
  onSelect,
  onOpenRapidRamp,
}: {
  activeSection: AppliedVoiceSectionId;
  completedSections: AppliedVoiceSectionId[];
  masteryLevels: MasteryLevel[];
  completedMasteryRequirementIds: string[];
  onSelect: (section: AppliedVoiceSectionId) => void;
  onOpenRapidRamp: () => void;
}) {
  const completed = new Set(completedSections);
  const completedRequirements = new Set(completedMasteryRequirementIds);
  const earnedLevels = masteryLevels.filter((level) => level.requirements.every((requirement) => completedRequirements.has(requirement.id)));
  const earnedLevel = earnedLevels.at(-1);

  return (
    <aside className="flex min-h-0 w-[206px] shrink-0 flex-col border-r border-white/10 bg-[#040a10]/95">
      <div className="shrink-0 border-b border-white/10 p-3">
        <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-cyan-200/65">Applied Academy</p>
        <p className="mt-1 text-[11px] leading-4 text-slate-500">Discovery → evidence → client brief</p>
        <button
          type="button"
          onClick={onOpenRapidRamp}
          className="mt-3 w-full rounded-md border border-violet-300/25 bg-violet-300/10 px-2 py-2 text-[10px] font-bold text-violet-100 transition hover:bg-violet-300/15 focus-visible:outline-2 focus-visible:outline-cyan-200"
        >
          Client interface in 10 min
        </button>
      </div>

      <nav aria-label="Applied Voice Systems sections" className="min-h-0 flex-1 overflow-y-auto p-2">
        <div className="space-y-1">
          {SECTIONS.map((section) => {
            const active = section.id === activeSection;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => onSelect(section.id)}
                className={`group flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left transition focus-visible:outline-2 focus-visible:outline-cyan-200 ${
                  active
                    ? "border-cyan-300/30 bg-cyan-300/[0.09] text-white shadow-[0_0_22px_rgba(34,211,238,0.08)]"
                    : "border-transparent text-slate-500 hover:border-white/10 hover:bg-white/[0.035] hover:text-slate-200"
                }`}
              >
                <span className={`flex size-7 shrink-0 items-center justify-center rounded-md font-mono text-[9px] font-bold ${active ? "bg-cyan-200 text-slate-950" : "bg-white/[0.05] text-slate-500"}`}>
                  {completed.has(section.id) ? "✓" : section.short}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1">
                    <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">{section.label}</span>
                    <ProvenanceDot value={section.provenance} />
                  </span>
                  <span className="block truncate text-[9px] text-slate-600">{section.purpose}</span>
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <div className="shrink-0 border-t border-white/10 p-3">
        <div className="flex items-center justify-between text-[9px] uppercase tracking-wide text-slate-600">
          <span>Mastery path</span>
          <span className="font-mono text-cyan-200">{earnedLevels.length}/{masteryLevels.length}</span>
        </div>
        <p className="mt-1 truncate text-[10px] font-semibold text-slate-300">{earnedLevel?.name ?? "Level 1 · API Operator"}</p>
        <p className="mt-1 text-[9px] leading-3.5 text-slate-600">Local learning progress—not an official Deepgram certification.</p>
      </div>
    </aside>
  );
}

function ProvenanceDot({ value }: { value?: "working" | "simulated" | "mixed" }) {
  const label = value === "working" ? "Working" : value === "simulated" ? "Simulation" : "Mixed";
  const color = value === "working" ? "bg-emerald-300" : value === "simulated" ? "bg-violet-300" : "bg-amber-300";
  return <span className={`size-1.5 shrink-0 rounded-full ${color}`} title={label} aria-label={label} />;
}
