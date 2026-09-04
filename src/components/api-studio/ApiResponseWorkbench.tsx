"use client";

import { useState } from "react";

import { EventTimeline } from "@/components/EventTimeline";
import type { ApiDebugEnvelope } from "@/lib/inspection";
import type {
  ApiCategory,
  ApiCodeLanguage,
  ApiOperation,
  ApiWorkbenchTab,
  GeneratedApiRequest,
} from "@/types/deepgram-api-studio";

const TABS: Array<{ id: ApiWorkbenchTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "request", label: "Request" },
  { id: "response", label: "Response" },
  { id: "timeline", label: "Timeline" },
  { id: "raw", label: "Raw JSON" },
  { id: "code", label: "Code" },
  { id: "chains", label: "Chain Ideas" },
  { id: "notes", label: "Notes" },
];

export function ApiResponseWorkbench({
  category,
  operation,
  request,
  snippets,
  envelope,
  audioUrl,
  masteryMode,
  copiedLabel,
  onCopy,
  onOpenChainBuilder,
}: {
  category: ApiCategory;
  operation: ApiOperation;
  request: GeneratedApiRequest;
  snippets: Record<ApiCodeLanguage, string>;
  envelope: ApiDebugEnvelope | null;
  audioUrl?: string;
  masteryMode: boolean;
  copiedLabel: string;
  onCopy: (label: string, value: string) => void;
  onOpenChainBuilder: () => void;
}) {
  const [tab, setTab] = useState<ApiWorkbenchTab>("overview");
  const [codeLanguage, setCodeLanguage] = useState<ApiCodeLanguage>("TypeScript");

  return (
    <aside className="flex min-h-0 min-w-0 flex-col border-l border-white/10 bg-[#04090f]/94">
      <div className="shrink-0 border-b border-white/10 px-3 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-200/70">Response Workbench</p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <h3 className="truncate text-sm font-semibold text-white">{operation.name}</h3>
          <span className={`size-2 shrink-0 rounded-full ${envelope?.ok ? "bg-emerald-300" : envelope ? "bg-rose-300" : "bg-slate-700"}`} />
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-4 gap-1 border-b border-white/10 p-1.5">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`h-7 rounded text-[9px] font-semibold transition ${tab === item.id ? "bg-violet-200 text-slate-950" : "text-slate-500 hover:bg-white/[0.05] hover:text-slate-200"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === "overview" ? <Overview category={category} operation={operation} masteryMode={masteryMode} /> : null}
        {tab === "request" ? <JsonPanel title="Generated request · sanitized" value={request} onCopy={() => onCopy("workbench-request", JSON.stringify(request, null, 2))} copied={copiedLabel === "workbench-request"} /> : null}
        {tab === "response" ? <ResponsePanel operation={operation} envelope={envelope} audioUrl={audioUrl} /> : null}
        {tab === "timeline" ? (
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            {envelope?.inspector ? <EventTimeline events={envelope.inspector.timeline} startedAt={envelope.inspector.startedAt} /> : <EmptyState>No request has run. Concept operations do not generate a fake timeline.</EmptyState>}
          </div>
        ) : null}
        {tab === "raw" ? (
          envelope
            ? <JsonPanel title="Sanitized route envelope" value={envelope} onCopy={() => onCopy("raw-envelope", JSON.stringify(envelope, null, 2))} copied={copiedLabel === "raw-envelope"} />
            : <ExampleShape operation={operation} />
        ) : null}
        {tab === "code" ? (
          <CodePanel
            snippets={snippets}
            language={codeLanguage}
            copied={copiedLabel === `workbench-${codeLanguage}`}
            onLanguageChange={setCodeLanguage}
            onCopy={() => onCopy(`workbench-${codeLanguage}`, snippets[codeLanguage])}
          />
        ) : null}
        {tab === "chains" ? (
          <div className="space-y-3">
            <TeachingCard title="Chain ideas" items={[...operation.chainIdeas, ...category.chainIdeas]} />
            <button type="button" onClick={onOpenChainBuilder} className="w-full rounded-md border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-xs font-bold text-cyan-100 hover:bg-cyan-300/15">
              Open Chain Builder
            </button>
          </div>
        ) : null}
        {tab === "notes" ? (
          <div className="space-y-3">
            <TeachingCard title="Learning notes" items={operation.learningNotes} />
            <TeachingCard title="Common mistakes" items={operation.commonMistakes} tone="amber" />
            <TeachingCard title="Security notes" items={operation.securityNotes} tone="rose" />
            {operation.verifyInDocs ? (
              <div className="rounded-lg border border-amber-300/20 bg-amber-300/[0.06] p-3 text-[11px] leading-5 text-amber-100/75">
                Verify in the official Deepgram API Reference before using this operation in production.
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function Overview({ category, operation, masteryMode }: { category: ApiCategory; operation: ApiOperation; masteryMode: boolean }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-cyan-300/15 bg-cyan-300/[0.045] p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200/65">What it accomplishes</p>
        <p className="mt-2 text-xs leading-5 text-slate-300">{operation.summary}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MiniFact label="Input" value={inputType(operation)} />
        <MiniFact label="Output" value={outputType(operation)} />
      </div>
      <TeachingCard title="When to use it" items={operation.whenToUse} />
      <TeachingCard title="When not to use it" items={operation.whenNotToUse} tone="amber" />
      <TeachingCard title="Important response paths" items={operation.responsePaths} mono />
      {category.conceptCards?.length ? (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Concept map</p>
          <div className="space-y-2">
            {category.conceptCards.map((card) => (
              <div key={card.title} className="rounded-md border border-white/[0.08] bg-white/[0.025] p-2.5">
                <p className="text-[11px] font-semibold text-slate-200">{card.title}</p>
                <p className="mt-1 text-[10px] leading-4 text-slate-500">{card.detail}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {masteryMode ? (
        <div className="rounded-lg border border-violet-300/20 bg-violet-300/[0.06] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-200/70">Mastery checkpoint</p>
          <ol className="mt-2 space-y-2 text-[11px] leading-4 text-slate-300">
            {category.checkpoint.map((question, index) => <li key={question}><span className="mr-1.5 font-mono text-violet-300">{index + 1}.</span>{question}</li>)}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

function ResponsePanel({ operation, envelope, audioUrl }: { operation: ApiOperation; envelope: ApiDebugEnvelope | null; audioUrl?: string }) {
  if (!envelope) return <ExampleShape operation={operation} />;
  return (
    <div className="space-y-3">
      <div className={`rounded-lg border p-3 ${envelope.ok ? "border-emerald-300/20 bg-emerald-300/[0.05]" : "border-rose-300/20 bg-rose-300/[0.05]"}`}>
        <p className={`text-xs font-semibold ${envelope.ok ? "text-emerald-100" : "text-rose-100"}`}>{envelope.ok ? "Safe request completed" : "Request returned an error"}</p>
        <p className="mt-1 font-mono text-[10px] text-slate-500">HTTP {envelope.inspector.response.status} · {envelope.inspector.durationMs} ms</p>
      </div>
      {audioUrl ? (
        <div className="rounded-lg border border-violet-300/20 bg-violet-300/[0.05] p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-200/70">Playable audio</p>
          <audio controls src={audioUrl} className="h-9 w-full" />
        </div>
      ) : null}
      <JsonPanel title="Sanitized response preview" value={envelope.inspector.response} />
    </div>
  );
}

function ExampleShape({ operation }: { operation: ApiOperation }) {
  return (
    <div className="rounded-lg border border-dashed border-violet-300/20 bg-violet-300/[0.035]">
      <div className="border-b border-white/[0.08] px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-200/70">Example response shape</p>
        <p className="mt-1 text-[10px] text-slate-600">Illustrative only · no request was run</p>
      </div>
      <pre className="max-h-[28rem] overflow-auto p-3 font-mono text-[10px] leading-4 text-slate-400">{JSON.stringify(operation.exampleResponse ?? { note: "See the official reference for the response schema." }, null, 2)}</pre>
    </div>
  );
}

function CodePanel({ snippets, language, copied, onLanguageChange, onCopy }: { snippets: Record<ApiCodeLanguage, string>; language: ApiCodeLanguage; copied: boolean; onLanguageChange: (language: ApiCodeLanguage) => void; onCopy: () => void }) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-[#02060b]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 p-2">
        <select value={language} onChange={(event) => onLanguageChange(event.target.value as ApiCodeLanguage)} className="h-8 rounded border border-white/10 bg-[#071018] px-2 text-[10px] text-slate-300">
          {(Object.keys(snippets) as ApiCodeLanguage[]).map((item) => <option key={item}>{item}</option>)}
        </select>
        <button type="button" onClick={onCopy} className="rounded border border-white/10 px-2 py-1 text-[10px] text-slate-400 hover:text-white">{copied ? "Copied" : "Copy"}</button>
      </div>
      <pre className="max-h-[36rem] overflow-auto p-3 font-mono text-[10px] leading-4 text-slate-300">{snippets[language]}</pre>
    </div>
  );
}

function JsonPanel({ title, value, onCopy, copied = false }: { title: string; value: unknown; onCopy?: () => void; copied?: boolean }) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-[#02060b]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</p>
        {onCopy ? <button type="button" onClick={onCopy} className="rounded border border-white/10 px-2 py-1 text-[10px] text-slate-500 hover:text-white">{copied ? "Copied" : "Copy"}</button> : null}
      </div>
      <pre className="max-h-[36rem] overflow-auto p-3 font-mono text-[10px] leading-4 text-slate-300">{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

function TeachingCard({ title, items, tone = "default", mono = false }: { title: string; items: string[]; tone?: "default" | "amber" | "rose"; mono?: boolean }) {
  const classes = tone === "amber" ? "border-amber-300/15" : tone === "rose" ? "border-rose-300/15" : "border-white/[0.08]";
  return (
    <div className={`rounded-lg border bg-black/15 p-3 ${classes}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</p>
      <ul className={`mt-2 space-y-1.5 text-[11px] leading-4 text-slate-400 ${mono ? "font-mono" : ""}`}>
        {items.map((item, index) => <li key={`${index}-${item}`} className="flex gap-2"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-cyan-300/60" /><span className="break-words">{item}</span></li>)}
      </ul>
    </div>
  );
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-2.5"><p className="text-[9px] uppercase tracking-wide text-slate-600">{label}</p><p className="mt-1 text-[11px] font-semibold text-slate-300">{value}</p></div>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-[11px] leading-5 text-slate-600">{children}</p>;
}

function inputType(operation: ApiOperation) {
  if (operation.transport === "REST file upload") return "Audio bytes";
  if (operation.transport === "WebSocket") return "JSON events + audio stream";
  if (operation.id === "tts-single") return "Text JSON";
  if (operation.id.includes("text-intelligence")) return "Existing text";
  return operation.transport;
}

function outputType(operation: ApiOperation) {
  if (operation.id.startsWith("tts")) return "Audio bytes";
  if (operation.transport === "WebSocket") return "Lifecycle events + media";
  if (!operation.executable) return "Guided handoff";
  return "Structured JSON";
}
