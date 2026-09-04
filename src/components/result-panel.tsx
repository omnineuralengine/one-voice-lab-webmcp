"use client";

import { useMemo, useState } from "react";

import { CopyIcon } from "@/components/icons";
import type { LabResult } from "@/lib/types";

type ResultTab = "transcript" | "json" | "notes";

export function ResultPanel({
  result,
  onCopy,
  copiedLabel,
}: {
  result: LabResult;
  onCopy: (text: string, label: string) => void;
  copiedLabel: string;
}) {
  const [activeTab, setActiveTab] = useState<ResultTab>("transcript");
  const rawJson = useMemo(() => JSON.stringify(result.raw ?? {}, null, 2), [result.raw]);
  const tabContent = {
    transcript: result.transcript || "Run a transcription to see the clean transcript here.",
    json: rawJson,
    notes: result.notes,
  };
  const copyText = tabContent[activeTab];
  const tabs: Array<{ id: ResultTab; label: string }> = [
    { id: "transcript", label: "Clean Transcript" },
    { id: "json", label: "Raw JSON" },
    { id: "notes", label: "Notes" },
  ];

  return (
    <aside className="sticky top-6 h-fit rounded-lg border border-white/10 bg-[#080d12]/95 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.4)] ring-1 ring-white/[0.03]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-cyan-200/70">Results Panel</p>
          <h2 className="mt-2 text-xl font-semibold text-white">{result.title}</h2>
          <p className="mt-1 text-xs text-slate-500">Updated {result.updatedAt}</p>
        </div>
        <button
          type="button"
          onClick={() => onCopy(copyText, tabs.find((tab) => tab.id === activeTab)?.label || "Result")}
          className="inline-flex size-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-slate-300 transition hover:bg-white/[0.1] hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-200/60"
          aria-label={`Copy ${activeTab} result`}
        >
          <CopyIcon className="size-4" />
        </button>
      </div>

      <div className="mt-5 grid grid-cols-3 rounded-lg border border-white/10 bg-black/20 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`h-10 rounded-md px-2 text-xs font-semibold transition ${
              activeTab === tab.id ? "bg-cyan-200 text-slate-950" : "text-slate-400 hover:bg-white/[0.06] hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {copiedLabel ? <p className="mt-3 text-xs text-emerald-200">{copiedLabel}</p> : null}

      <div className="mt-4 max-h-[560px] overflow-auto rounded-lg border border-white/10 bg-[#020406] p-4">
        <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-6 text-slate-200">
          {tabContent[activeTab]}
        </pre>
      </div>
    </aside>
  );
}
