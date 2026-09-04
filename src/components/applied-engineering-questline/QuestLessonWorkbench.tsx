"use client";

import { useMemo, useState } from "react";

import {
  CodeBlock,
  CompactList,
  QuestPanel,
  QuestPanelHeader,
  StatusBadge,
  questButtonClassName,
  questPrimaryButtonClassName,
  questTextareaClassName,
} from "@/components/applied-engineering-questline/QuestlinePrimitives";
import { getLanguageTrack } from "@/lib/questline/language-tracks";
import type { QuestNode, QuestStatus, QuestlineLanguageId } from "@/types/questline";

const TIER_LABELS = [
  "Language foundations",
  "Deepgram API operator",
  "Streaming + concurrency",
  "Audio systems",
  "Production integration",
  "Client impact capstone",
];

export function QuestLessonWorkbench({
  language,
  nodes,
  activeQuestId,
  statuses,
  notes,
  onSelectQuest,
  onStatusChange,
  onNotesChange,
  onOpenCodeLab,
  onOpenApi,
}: {
  language: QuestlineLanguageId;
  nodes: QuestNode[];
  activeQuestId: string;
  statuses: Record<string, QuestStatus>;
  notes: string;
  onSelectQuest: (id: string) => void;
  onStatusChange: (id: string, status: QuestStatus) => void;
  onNotesChange: (notes: string) => void;
  onOpenCodeLab: (node: QuestNode, exampleIndex?: number, trigger?: HTMLElement | null) => void;
  onOpenApi: (operationId: string) => void;
}) {
  const track = getLanguageTrack(language);
  const node = nodes.find((item) => item.id === activeQuestId) ?? nodes[0];
  const [exampleIndex, setExampleIndex] = useState(0);
  const example = node?.codeExamples[Math.min(exampleIndex, Math.max(0, node.codeExamples.length - 1))];
  const mergedRuntime = useMemo(() => ({ ...track.runtime, ...(node?.runtimeModelOverride ?? {}) }), [node, track.runtime]);

  if (!node) return <div className="p-3 text-xs text-slate-500">This optional awareness track has no blocking quest nodes yet.</div>;

  return (
    <div className="grid h-full min-h-0 min-w-[760px] grid-cols-[minmax(430px,1fr)_minmax(260px,340px)] gap-3 overflow-x-auto p-3">
      <QuestPanel className="flex min-h-0 flex-col overflow-hidden">
        <QuestPanelHeader
          eyebrow={`Tier ${node.tier} · ${track.label}`}
          title={node.title}
          detail={node.firstPrinciplesConcept}
          actions={<><StatusBadge value={node.status} /><StatusBadge value={statuses[node.id] ?? "not-started"} /></>}
        />
        <div className="grid min-h-0 flex-1 grid-cols-[170px_minmax(0,1fr)]">
          <div className="min-h-0 overflow-y-auto border-r border-white/10 p-2" aria-label="Quest tree">
            {[1, 2, 3, 4, 5, 6].map((tier) => (
              <div key={tier} className="mb-3">
                <p className="px-1 pb-1 text-[7px] font-bold uppercase tracking-wide text-slate-700">T{tier} · {TIER_LABELS[tier - 1]}</p>
                {nodes.filter((item) => item.tier === tier).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => { onSelectQuest(item.id); setExampleIndex(0); }}
                    aria-pressed={item.id === node.id}
                    className={`mb-1 w-full rounded-md border p-2 text-left focus-visible:outline-2 focus-visible:outline-cyan-200 ${item.id === node.id ? "border-cyan-300/30 bg-cyan-300/[0.08]" : "border-white/[0.06] bg-black/15 hover:border-white/15"}`}
                  >
                    <span className="block text-[9px] font-semibold text-slate-200">{item.title}</span>
                    <span className="mt-1 flex items-center justify-between">
                      <span className="text-[7px] text-slate-700">{item.difficulty}</span>
                      <span className="text-[7px] text-cyan-200/60">{(statuses[item.id] ?? "not-started").replaceAll("-", " ")}</span>
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="min-h-0 overflow-y-auto p-3">
            <div className="grid gap-2 xl:grid-cols-2">
              <TeachingCard label="Why voice systems care" text={node.whyVoiceSystemsCare} />
              <TeachingCard label="Expected mental model" text={node.expectedMentalModel} />
              <TeachingCard label="Common mistake" text={node.commonMistake} tone="amber" />
              <TeachingCard label="Debugging clue" text={node.debuggingClue} tone="cyan" />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {node.codeExamples.map((item, index) => (
                <button
                  key={`${item.language}-${item.filename}`}
                  type="button"
                  onClick={() => setExampleIndex(index)}
                  aria-pressed={index === exampleIndex}
                  className={`${questButtonClassName} ${index === exampleIndex ? "border-violet-300/30 bg-violet-300/[0.09] text-violet-100" : ""}`}
                >
                  {item.language} · {item.filename}
                </button>
              ))}
            </div>
            {example ? <div className="mt-2"><CodeBlock code={example.code} label={`${example.title} · ${example.runtime}`} /></div> : null}
            <div className="mt-3 grid gap-2 xl:grid-cols-2">
              <CompactList title="Client scenario" items={[node.clientScenario]} />
              <CompactList title="Completion criteria" items={node.completionCriteria} />
              <CompactList title="Short challenge" items={[node.challenge]} tone="cyan" />
              <CompactList title="Mastery question" items={[node.masteryQuestion]} />
            </div>
            <div className="mt-3 rounded-lg border border-violet-300/15 bg-violet-300/[0.035] p-3">
              <p className="text-[8px] font-bold uppercase tracking-wide text-violet-200/65">Applied ML lens</p>
              <dl className="mt-2 grid gap-2 text-[9px] leading-4 xl:grid-cols-2">
                <Explain label="Hypothesis" value={node.appliedMlLens.hypothesis} />
                <Explain label="Input distribution" value={node.appliedMlLens.inputDistribution} />
                <Explain label="Model / configuration" value={node.appliedMlLens.modelOrConfiguration} />
                <Explain label="Quality + latency" value={`${node.appliedMlLens.qualityMetric} · ${node.appliedMlLens.latencyMetric}`} />
                <Explain label="Failure segment" value={node.appliedMlLens.failureSegment} />
                <Explain label="Rollback" value={node.appliedMlLens.rollbackCondition} />
              </dl>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-white/10 bg-[#061019] p-3">
          <select value={statuses[node.id] ?? "not-started"} onChange={(event) => onStatusChange(node.id, event.target.value as QuestStatus)} aria-label="Quest completion status" className="h-8 rounded-md border border-white/10 bg-black/30 px-2 text-[9px] text-slate-300 focus-visible:outline-2 focus-visible:outline-cyan-200">
            <option value="not-started">Not started</option>
            <option value="practiced">Practiced</option>
            <option value="needs-review">Needs review</option>
            <option value="completed">Completed</option>
          </select>
          <button type="button" onClick={(event) => onOpenCodeLab(node, exampleIndex, event.currentTarget)} className={questPrimaryButtonClassName}>Open this quest in Code Lab</button>
          <button type="button" onClick={() => onOpenApi(node.relatedApiOperationId)} className={questButtonClassName}>Open related API</button>
          <span className="ml-auto text-[8px] text-slate-700">Prerequisites: {node.prerequisiteIds.length ? node.prerequisiteIds.join(", ") : "none"}</span>
        </div>
      </QuestPanel>

      <QuestPanel className="flex min-h-0 flex-col overflow-hidden">
        <QuestPanelHeader
          eyebrow="First-principles runtime"
          title="What the runtime is actually doing"
          detail="Syntax is the surface. Process, memory, scheduling, I/O, and cleanup determine behavior."
          actions={<StatusBadge value={track.docsStatus} />}
        />
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          <RuntimeCard title="Execution" detail={mergedRuntime.executionModel} />
          <RuntimeCard title="Process" detail={mergedRuntime.processModel} />
          <RuntimeCard title="Memory" detail={mergedRuntime.memoryModel} />
          <RuntimeCard title="Concurrency" detail={mergedRuntime.concurrencyModel} />
          <RuntimeCard title="Networking" detail={mergedRuntime.networkModel} />
          <RuntimeCard title="Dependencies" detail={mergedRuntime.dependencyModel} />
          <CompactList title="Data movement" items={mergedRuntime.dataMovement} mono />
          <CompactList title="Who cleans up?" items={mergedRuntime.cleanupResponsibilities} tone="amber" />
          <div>
            <label htmlFor="questline-notes" className="mb-1 block text-[8px] font-bold uppercase tracking-wide text-slate-600">Quest notes · local only</label>
            <textarea id="questline-notes" aria-label="Questline learning notes" value={notes} onChange={(event) => onNotesChange(event.target.value)} rows={6} className={questTextareaClassName} placeholder="Explain this in your own words. What would you inspect first in a client stack?" />
          </div>
          {example ? <CompactList title="Example accuracy notes" items={example.notes} tone={example.status === "docs-verification-required" ? "amber" : "default"} /> : null}
        </div>
      </QuestPanel>
    </div>
  );
}

function TeachingCard({ label, text, tone = "default" }: { label: string; text: string; tone?: "default" | "amber" | "cyan" }) {
  const color = tone === "amber" ? "border-amber-300/15" : tone === "cyan" ? "border-cyan-300/15" : "border-white/[0.08]";
  return <div className={`rounded-lg border bg-black/15 p-3 ${color}`}><p className="text-[8px] font-bold uppercase tracking-wide text-slate-600">{label}</p><p className="mt-1 text-[9px] leading-4 text-slate-400">{text}</p></div>;
}

function RuntimeCard({ title, detail }: { title: string; detail: string }) {
  return <div className="rounded-lg border border-white/[0.08] bg-black/15 p-3"><p className="text-[8px] font-bold uppercase tracking-wide text-cyan-200/55">{title}</p><p className="mt-1 text-[9px] leading-4 text-slate-400">{detail}</p></div>;
}

function Explain({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[7px] font-bold uppercase tracking-wide text-slate-600">{label}</dt><dd className="mt-0.5 text-slate-400">{value}</dd></div>;
}
