"use client";

import { useMemo, useState } from "react";

import {
  CodeBlock,
  QuestPanel,
  QuestPanelHeader,
  StatusBadge,
  downloadQuestlineFile,
  questButtonClassName,
  questPrimaryButtonClassName,
} from "@/components/applied-engineering-questline/QuestlinePrimitives";
import { sanitizeSnippetForExport } from "@/lib/code-lab-storage";
import { getLanguageTrack } from "@/lib/questline/language-tracks";
import { POLYGLOT_WORKFLOWS } from "@/lib/questline/polyglot-patterns";
import type {
  PolyglotFocus,
  PolyglotImplementation,
  PolyglotWorkflow,
  QuestlineLanguageId,
} from "@/types/questline";

const FOCUS_OPTIONS: Array<{ id: PolyglotFocus; label: string; systemProblem: string }> = [
  { id: "setup", label: "Setup", systemProblem: "Put the program in a reproducible runtime with the dependencies and configuration it needs." },
  { id: "authentication", label: "Auth", systemProblem: "Prove the trusted process may call Deepgram without moving the permanent API key into an untrusted client." },
  { id: "request", label: "Request", systemProblem: "Represent one HTTP or WebSocket operation with the correct endpoint, parameters, headers, and body type." },
  { id: "send-audio", label: "Send audio", systemProblem: "Move binary media without decoding, truncating, reusing, or silently transforming the bytes." },
  { id: "receive-event", label: "Receive event", systemProblem: "Wait for network data, preserve event ordering, and distinguish protocol messages from media bytes." },
  { id: "parsing", label: "Parsing", systemProblem: "Turn documented JSON into typed application data and follow the response path for this operation." },
  { id: "errors", label: "Errors", systemProblem: "Retain status, request ID, close code, and causal evidence while returning a safe client-facing failure." },
  { id: "cleanup", label: "Cleanup", systemProblem: "Cancel pending work and release files, bodies, sockets, media tracks, tasks, goroutines, or native owners." },
  { id: "testing", label: "Testing", systemProblem: "Prove payload, parsing, ordering, redaction, cancellation, and failure behavior with deterministic fixtures." },
];

const MAX_VISIBLE_LANGUAGES = 4;

export function PolyglotMatrix({
  initialWorkflowId,
  activeLanguage,
  onOpenCodeLab,
  onOpenApi,
  onExportMarkdown,
}: {
  initialWorkflowId?: string;
  activeLanguage?: QuestlineLanguageId;
  onOpenCodeLab?: (workflow: PolyglotWorkflow) => void;
  onOpenApi?: (operationId: string) => void;
  onExportMarkdown?: (markdown: string, workflow: PolyglotWorkflow) => void;
}) {
  const initialWorkflow = POLYGLOT_WORKFLOWS.find((item) => item.id === initialWorkflowId) ?? POLYGLOT_WORKFLOWS[0];
  const initialLanguageIds = initialWorkflow
    ? preferredLanguages(initialWorkflow, activeLanguage)
    : [];
  const [workflowId, setWorkflowId] = useState(initialWorkflow?.id ?? "");
  const [focus, setFocus] = useState<PolyglotFocus>("authentication");
  const [visibleLanguageIds, setVisibleLanguageIds] = useState<QuestlineLanguageId[]>(initialLanguageIds);
  const [detailLanguage, setDetailLanguage] = useState<QuestlineLanguageId | undefined>(initialLanguageIds[0]);

  const workflow = POLYGLOT_WORKFLOWS.find((item) => item.id === workflowId) ?? POLYGLOT_WORKFLOWS[0];
  const visibleImplementations = useMemo(() => {
    if (!workflow) return [];
    const selected = workflow.implementations.filter((item) => visibleLanguageIds.includes(item.language));
    return selected.length ? selected : workflow.implementations.slice(0, MAX_VISIBLE_LANGUAGES);
  }, [visibleLanguageIds, workflow]);
  const detailImplementation = workflow?.implementations.find((item) => item.language === detailLanguage)
    ?? visibleImplementations[0]
    ?? workflow?.implementations[0];
  const focusOption = FOCUS_OPTIONS.find((item) => item.id === focus) ?? FOCUS_OPTIONS[0];

  if (!workflow) {
    return <div className="grid h-full place-items-center p-6 text-xs text-slate-500">Polyglot workflow content is not available yet.</div>;
  }

  const selectWorkflow = (nextId: string) => {
    const next = POLYGLOT_WORKFLOWS.find((item) => item.id === nextId);
    if (!next) return;
    const nextLanguages = preferredLanguages(next, activeLanguage);
    setWorkflowId(next.id);
    setVisibleLanguageIds(nextLanguages);
    setDetailLanguage(nextLanguages[0]);
  };

  const toggleLanguage = (language: QuestlineLanguageId) => {
    if (visibleLanguageIds.includes(language)) {
      if (visibleLanguageIds.length === 1) return;
      const next = visibleLanguageIds.filter((item) => item !== language);
      setVisibleLanguageIds(next);
      if (detailLanguage === language) setDetailLanguage(next[0]);
      return;
    }
    if (visibleLanguageIds.length >= MAX_VISIBLE_LANGUAGES) return;
    setVisibleLanguageIds([...visibleLanguageIds, language]);
  };

  const exportComparison = () => {
    const markdown = serializeComparison(workflow, visibleImplementations, focus);
    if (onExportMarkdown) {
      onExportMarkdown(markdown, workflow);
      return;
    }
    downloadQuestlineFile(`polyglot-${workflow.id}-${focus}.md`, markdown, "text/markdown;charset=utf-8");
  };

  return <div className="grid h-full min-h-0 grid-cols-[minmax(590px,1fr)_350px] gap-3 p-3">
    <QuestPanel className="flex min-h-0 flex-col overflow-hidden">
      <QuestPanelHeader
        eyebrow="Same workflow, different runtime"
        title="Polyglot Translation Matrix"
        detail={workflow.purpose}
        actions={<>
          <button type="button" onClick={exportComparison} className={questButtonClassName}>Export Markdown</button>
          <button type="button" onClick={() => onOpenCodeLab?.(workflow)} disabled={!onOpenCodeLab} className={questPrimaryButtonClassName}>Open in Code Lab</button>
          <button type="button" onClick={() => onOpenApi?.(workflow.relatedApiOperationId)} disabled={!onOpenApi} className={questButtonClassName}>Open related API</button>
        </>}
      />

      <div className="shrink-0 border-b border-white/10 bg-black/15 p-3">
        <div className="grid grid-cols-[minmax(190px,1fr)_minmax(360px,2fr)] gap-3">
          <label className="min-w-0">
            <span className="text-[8px] font-bold uppercase tracking-wide text-slate-600">Workflow</span>
            <select value={workflow.id} onChange={(event) => selectWorkflow(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-white/10 bg-[#02070c] px-2 text-[10px] text-slate-200 focus-visible:outline-2 focus-visible:outline-cyan-200">
              {POLYGLOT_WORKFLOWS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <div className="min-w-0">
            <span className="text-[8px] font-bold uppercase tracking-wide text-slate-600">Semantic focus</span>
            <div className="mt-1 flex gap-1 overflow-x-auto pb-1">
              {FOCUS_OPTIONS.map((item) => <button key={item.id} type="button" onClick={() => setFocus(item.id)} className={`${questButtonClassName} shrink-0 px-2 py-1.5 ${focus === item.id ? "border-cyan-300/35 bg-cyan-300/[0.10] text-cyan-50" : ""}`}>{item.label}</button>)}
            </div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Languages included in comparison">
          {workflow.implementations.map((implementation) => {
            const selected = visibleLanguageIds.includes(implementation.language);
            const disabled = !selected && visibleLanguageIds.length >= MAX_VISIBLE_LANGUAGES;
            return <button key={implementation.language} type="button" onClick={() => toggleLanguage(implementation.language)} disabled={disabled} aria-pressed={selected} className={`${questButtonClassName} flex items-center gap-1.5 px-2 py-1.5 ${selected ? "border-violet-300/30 bg-violet-300/[0.09] text-violet-50" : ""}`}>
              <span>{languageLabel(implementation.language)}</span>
              <span className="text-[7px] text-slate-600">{implementation.status.replaceAll("-", " ")}</span>
            </button>;
          })}
          <span className="ml-auto text-[8px] text-slate-700">Select up to {MAX_VISIBLE_LANGUAGES}. Highlighting follows one system concern.</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="mb-3 rounded-lg border border-cyan-300/15 bg-cyan-300/[0.035] px-3 py-2">
          <p className="text-[8px] font-bold uppercase tracking-wide text-cyan-200/60">Equivalent system problem</p>
          <p className="mt-1 text-[10px] leading-4 text-slate-300">{focusOption.systemProblem}</p>
        </div>
        <div className={`grid gap-3 ${visibleImplementations.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
          {visibleImplementations.map((implementation) => <ImplementationCard
            key={`${workflow.id}-${implementation.language}`}
            implementation={implementation}
            focus={focus}
            selected={detailImplementation?.language === implementation.language}
            onSelect={() => setDetailLanguage(implementation.language)}
          />)}
        </div>
      </div>
    </QuestPanel>

    <QuestPanel className="flex min-h-0 flex-col overflow-hidden">
      <QuestPanelHeader
        eyebrow="System equivalence"
        title={detailImplementation ? languageLabel(detailImplementation.language) : "Select a language"}
        detail="Different syntax; the same environment, transport, serialization, binary, concurrency, failure, cleanup, and deployment decisions."
        actions={detailImplementation ? <StatusBadge value={detailImplementation.status} /> : undefined}
      />
      {detailImplementation ? <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="mb-3 flex flex-wrap gap-1">
          {visibleImplementations.map((item) => <button key={item.language} type="button" onClick={() => setDetailLanguage(item.language)} className={`${questButtonClassName} px-2 py-1 ${detailImplementation.language === item.language ? "border-cyan-300/30 bg-cyan-300/[0.08] text-cyan-50" : ""}`}>{languageLabel(item.language)}</button>)}
        </div>
        <div className="grid gap-2">
          {comparisonDetails(detailImplementation).map((item, index) => <div key={item.label} className={`rounded-lg border p-3 ${index === focusDetailIndex(focus) ? "border-cyan-300/25 bg-cyan-300/[0.045]" : "border-white/[0.08] bg-black/15"}`}>
            <p className="text-[8px] font-bold uppercase tracking-wide text-slate-600">{index + 1}. {item.label}</p>
            {Array.isArray(item.value)
              ? <ul className="mt-1 space-y-1 text-[9px] leading-4 text-slate-400">{item.value.map((value) => <li key={value} className="flex gap-2"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-cyan-300/45" /><span>{value}</span></li>)}</ul>
              : <p className="mt-1 text-[9px] leading-4 text-slate-400">{item.value}</p>}
          </div>)}
        </div>
        <div className="mt-3 rounded-lg border border-amber-300/15 bg-amber-300/[0.035] p-3">
          <p className="text-[8px] font-bold uppercase tracking-wide text-amber-200/65">Accuracy boundary</p>
          <p className="mt-1 text-[9px] leading-4 text-slate-400">{detailImplementation.notes.join(" ")}</p>
          <p className="mt-2 text-[8px] text-slate-600">Client: {detailImplementation.clientLibrary} · Dependency: {detailImplementation.dependency}</p>
          {detailImplementation.docs ? <a href={detailImplementation.docs.docsUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[9px] font-semibold text-cyan-200/75 hover:text-cyan-100 focus-visible:outline-2 focus-visible:outline-cyan-200">Official documentation</a> : null}
        </div>
      </div> : <div className="p-3 text-xs text-slate-500">Select a language implementation to inspect its runtime shape.</div>}
    </QuestPanel>
  </div>;
}

function ImplementationCard({ implementation, focus, selected, onSelect }: { implementation: PolyglotImplementation; focus: PolyglotFocus; selected: boolean; onSelect: () => void }) {
  const highlightedLines = lineRange(implementation.regions[focus]);
  return <article className={`min-w-0 rounded-lg border bg-black/15 p-2 ${selected ? "border-cyan-300/25" : "border-white/[0.08]"}`}>
    <button type="button" onClick={onSelect} className="mb-2 flex w-full items-start justify-between gap-2 rounded-md text-left focus-visible:outline-2 focus-visible:outline-cyan-200">
      <span className="min-w-0"><span className="block text-[10px] font-semibold text-white">{languageLabel(implementation.language)}</span><span className="mt-0.5 block truncate text-[8px] text-slate-600">{implementation.filename} · {implementation.runtime} · {implementation.clientLibrary}</span></span>
      <StatusBadge value={implementation.status} />
    </button>
    <CodeBlock code={implementation.code} label={`${implementation.title} · ${focus.replaceAll("-", " ")}`} highlightedLines={highlightedLines} />
    {!highlightedLines.length ? <p className="mt-2 rounded border border-amber-300/10 bg-amber-300/[0.025] px-2 py-1 text-[8px] text-amber-100/50">This workflow has no distinct {focus.replaceAll("-", " ")} block in this runtime.</p> : null}
  </article>;
}

function preferredLanguages(workflow: PolyglotWorkflow, activeLanguage?: QuestlineLanguageId) {
  const available = workflow.implementations.map((item) => item.language);
  const preferred = activeLanguage && available.includes(activeLanguage) ? [activeLanguage] : [];
  for (const language of ["typescript", "python", "go", "csharp"] as QuestlineLanguageId[]) {
    if (available.includes(language) && !preferred.includes(language)) preferred.push(language);
    if (preferred.length >= MAX_VISIBLE_LANGUAGES) break;
  }
  for (const language of available) {
    if (!preferred.includes(language)) preferred.push(language);
    if (preferred.length >= MAX_VISIBLE_LANGUAGES) break;
  }
  return preferred;
}

function languageLabel(language: QuestlineLanguageId) {
  return getLanguageTrack(language).label;
}

function lineRange(region?: [number, number]) {
  if (!region) return [];
  const [start, end] = region;
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
}

function comparisonDetails(implementation: PolyglotImplementation): Array<{ label: string; value: string | string[] }> {
  return [
    { label: "Files involved", value: implementation.files },
    { label: "Entry point", value: implementation.entryPoint },
    { label: "Dependency / package", value: implementation.dependency },
    { label: "Environment setup", value: implementation.environmentSetup },
    { label: "HTTP / WebSocket client", value: implementation.clientLibrary },
    { label: "JSON serialization", value: implementation.serialization },
    { label: "Binary / audio handling", value: implementation.binaryHandling },
    { label: "Concurrency model", value: implementation.concurrency },
    { label: "Error handling", value: implementation.errorHandling },
    { label: "Cleanup", value: implementation.cleanup },
    { label: "Testing", value: implementation.testing },
    { label: "Deployment shape", value: implementation.deploymentShape },
  ];
}

function focusDetailIndex(focus: PolyglotFocus) {
  const indexes: Record<PolyglotFocus, number> = {
    setup: 3,
    authentication: 3,
    request: 4,
    "send-audio": 6,
    "receive-event": 7,
    parsing: 5,
    errors: 8,
    cleanup: 9,
    testing: 10,
  };
  return indexes[focus];
}

function serializeComparison(workflow: PolyglotWorkflow, implementations: PolyglotImplementation[], focus: PolyglotFocus) {
  const focusLabel = FOCUS_OPTIONS.find((item) => item.id === focus)?.label ?? focus;
  const sections = implementations.map((implementation) => {
    const details = comparisonDetails(implementation).map((item) => {
      const value = Array.isArray(item.value) ? item.value.map((entry) => `  - ${entry}`).join("\n") : item.value;
      return `- **${item.label}:**${Array.isArray(item.value) ? `\n${value}` : ` ${value}`}`;
    }).join("\n");
    return `## ${languageLabel(implementation.language)}\n\nStatus: ${implementation.status}\n\nClient/dependency: ${implementation.clientLibrary} / ${implementation.dependency}\n\n${details}\n\n### Code\n\n\`\`\`${implementation.language}\n${implementation.code}\n\`\`\``;
  });
  const raw = `# Polyglot comparison: ${workflow.label}\n\nFocus: ${focusLabel}\n\n${workflow.purpose}\n\n${sections.join("\n\n")}`;
  return sanitizeSnippetForExport(raw);
}
