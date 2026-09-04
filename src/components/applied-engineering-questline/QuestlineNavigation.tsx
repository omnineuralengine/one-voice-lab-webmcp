"use client";

import { LANGUAGE_TRACKS } from "@/lib/questline/language-tracks";
import type { QuestlineLanguageId, QuestlineSectionId } from "@/types/questline";

const SECTIONS: Array<{ id: QuestlineSectionId; label: string; short: string; detail: string }> = [
  { id: "quest-map", label: "Quest Tree", short: "Q", detail: "Six-tier learning path" },
  { id: "polyglot", label: "Compare Languages", short: "⇄", detail: "Semantic translation" },
  { id: "stack-adapter", label: "Client Stack Adapter", short: "A", detail: "Stack recommendation" },
  { id: "incidents", label: "Incident Drills", short: "!", detail: "Evidence-led diagnosis" },
  { id: "audio", label: "Audio Engineering", short: "∿", detail: "Signal to bytes" },
  { id: "debugger-testing", label: "Debug + Test", short: "D", detail: "Trace and verify" },
  { id: "toolchains", label: "IDE / Toolchains", short: "T", detail: "Environment mastery" },
  { id: "capstones", label: "Capstones + Drills", short: "★", detail: "Client impact" },
];

export function QuestlineNavigation({
  activeSection,
  activeLanguage,
  viewedQuestCount,
  completedQuestCount,
  onSelectSection,
  onSelectLanguage,
}: {
  activeSection: QuestlineSectionId;
  activeLanguage: QuestlineLanguageId;
  viewedQuestCount: number;
  completedQuestCount: number;
  onSelectSection: (section: QuestlineSectionId) => void;
  onSelectLanguage: (language: QuestlineLanguageId) => void;
}) {
  return (
    <aside className="flex h-full min-h-0 w-[220px] shrink-0 flex-col overflow-hidden border-r border-white/10 bg-[#03090f]/96">
      <div className="shrink-0 border-b border-white/10 p-3">
        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-cyan-200/65">Engineering Questline</p>
        <p className="mt-1 text-[9px] leading-4 text-slate-600">Recognize → explain → diagnose → design</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Metric label="Viewed" value={viewedQuestCount} />
          <Metric label="Completed" value={completedQuestCount} />
        </div>
      </div>

      <div
        data-testid="questline-left-navigation"
        aria-label="Questline navigation panel"
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <nav aria-label="Questline workspaces" className="border-b border-white/10 p-2">
          <p className="px-2 pb-1 text-[8px] font-bold uppercase tracking-wide text-slate-700">Workspaces</p>
          <div className="space-y-1">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => onSelectSection(section.id)}
                className={`flex w-full items-center gap-2 rounded-md border px-2 py-2 text-left transition focus-visible:outline-2 focus-visible:outline-cyan-200 ${activeSection === section.id ? "border-cyan-300/30 bg-cyan-300/[0.09] text-white" : "border-transparent text-slate-500 hover:border-white/10 hover:bg-white/[0.035] hover:text-slate-200"}`}
              >
                <span className={`flex size-6 shrink-0 items-center justify-center rounded font-mono text-[9px] font-bold ${activeSection === section.id ? "bg-cyan-200 text-slate-950" : "bg-white/[0.05] text-slate-600"}`}>
                  {section.short}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[10px] font-semibold">{section.label}</span>
                  <span className="block truncate text-[8px] text-slate-700">{section.detail}</span>
                </span>
              </button>
            ))}
          </div>
        </nav>

        <nav aria-label="Language tracks" className="p-2">
          <p className="px-2 pb-1 text-[8px] font-bold uppercase tracking-wide text-slate-700">Language tracks</p>
          {(["primary", "bridge", "framework-specialization", "optional-awareness"] as const).map((category) => {
            const tracks = LANGUAGE_TRACKS.filter((track) => track.category === category);
            return (
              <div key={category} className="mb-2">
                <p className="px-2 py-1 text-[7px] uppercase tracking-wide text-slate-800">{category.replaceAll("-", " ")}</p>
                <div className="grid grid-cols-2 gap-1">
                  {tracks.map((track) => (
                    <button
                      key={track.id}
                      type="button"
                      onClick={() => {
                        onSelectLanguage(track.id);
                        onSelectSection("quest-map");
                      }}
                      title={track.learnerFit}
                      className={`rounded border px-2 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-cyan-200 ${activeLanguage === track.id ? "border-violet-300/30 bg-violet-300/[0.10] text-violet-100" : "border-white/[0.06] bg-black/15 text-slate-600 hover:text-slate-300"}`}
                    >
                      <span className="block font-mono text-[8px] font-bold">{track.shortLabel}</span>
                      <span className="block truncate text-[8px]">{track.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
      </div>

      <div className="shrink-0 border-t border-white/10 p-3 text-[8px] leading-3.5 text-slate-700">
        Progress is local educational evidence—not an official Deepgram certification.
      </div>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-white/[0.07] bg-black/20 p-2">
      <p className="text-[7px] uppercase tracking-wide text-slate-700">{label}</p>
      <p className="mt-1 font-mono text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
