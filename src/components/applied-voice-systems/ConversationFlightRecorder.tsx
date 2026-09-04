"use client";

import { useMemo, useState } from "react";

import {
  EmptyState,
  JsonView,
  Panel,
  PanelHeading,
  ProvenanceBadge,
  buttonClassName,
  downloadTextFile,
} from "@/components/applied-voice-systems/AcademyPrimitives";
import { TURN_TRACE_PRESET } from "@/lib/applied-voice/labs";
import { sanitizeAppliedExport } from "@/lib/applied-voice/academy";
import type { InspectorRecord } from "@/lib/inspection";
import type { ConversationTrace, ConversationTraceEvent, LatencyBudgetItem } from "@/types/applied-voice";

type TraceView = "timeline" | "sequence" | "raw" | "payload" | "latency" | "state" | "errors" | "business";

export function ConversationFlightRecorder({ liveInspector }: { liveInspector: InspectorRecord | null }) {
  const [source, setSource] = useState<"simulation" | "live-inspector">("simulation");
  const [view, setView] = useState<TraceView>("timeline");
  const [replayStep, setReplayStep] = useState(TURN_TRACE_PRESET.events.length);
  const [compare, setCompare] = useState(false);
  const simulation = TURN_TRACE_PRESET;
  const liveTrace = useMemo(() => liveInspector ? traceFromInspector(liveInspector) : null, [liveInspector]);
  const trace = source === "live-inspector" ? liveTrace : simulation;
  const comparison = useMemo(() => createComparisonTrace(simulation), [simulation]);

  function exportJson() {
    if (!trace) return;
    downloadTextFile(`${trace.id}.sanitized.json`, JSON.stringify(sanitizeAppliedExport(trace), null, 2), "application/json");
  }

  function exportMarkdown() {
    if (!trace) return;
    const safe = sanitizeAppliedExport(trace);
    const lines = [`# ${safe.title}`, "", `- Session: \`${safe.sessionId}\``, `- Provenance: ${safe.provenance}`, `- Raw audio included: ${safe.rawAudioIncluded}`, "", "## Timeline", "", ...safe.events.map((event) => `- +${event.offsetMs} ms · **${event.component} / ${event.type}** — ${event.label}${event.detail ? `: ${event.detail}` : ""}`), "", "## Latency budget", "", ...safe.latencyBudget.map((item) => `- ${item.label}: ${item.valueMs === null ? "unavailable" : `${item.valueMs} ms`} (${item.provenance}) — ${item.note}`)];
    downloadTextFile(`${trace.id}.sanitized.md`, lines.join("\n") + "\n", "text/markdown");
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <Panel className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <PanelHeading
          eyebrow="Conversation flight recorder"
          title="Follow evidence across components, turns, tools, and business events"
          detail="Exports are sanitized and never include raw audio, Authorization, API keys, or temporary tokens."
          actions={<><select value={source} onChange={(event) => setSource(event.target.value as typeof source)} className="h-8 rounded-md border border-white/10 bg-[#03080d] px-2 text-[9px] text-slate-300"><option value="simulation">Recorded simulation</option><option value="live-inspector">Latest Live Mic inspector</option></select><button type="button" onClick={() => setCompare((value) => !value)} className={buttonClassName}>{compare ? "Hide comparison" : "Compare traces"}</button><button type="button" onClick={exportJson} disabled={!trace} className={buttonClassName}>Trace JSON</button><button type="button" onClick={exportMarkdown} disabled={!trace} className={buttonClassName}>Trace Markdown</button></>}
        />
        <div className="grid shrink-0 grid-cols-8 gap-1 border-b border-white/10 p-1.5">
          {(["timeline", "sequence", "raw", "payload", "latency", "state", "errors", "business"] as TraceView[]).map((item) => <button key={item} type="button" onClick={() => setView(item)} className={`h-8 rounded text-[9px] font-semibold capitalize focus-visible:outline-2 focus-visible:outline-cyan-200 ${view === item ? "bg-cyan-200 text-slate-950" : "text-slate-500 hover:bg-white/[0.04] hover:text-white"}`}>{item}</button>)}
        </div>
        {trace ? (
          <div className={`grid min-h-0 flex-1 ${compare ? "grid-cols-2" : "grid-cols-1"}`}>
            <TracePane trace={trace} view={view} replayStep={replayStep} onReplayStep={setReplayStep} inspector={source === "live-inspector" ? liveInspector : null} />
            {compare ? <TracePane trace={comparison} view={view} replayStep={comparison.events.length} onReplayStep={() => {}} inspector={null} comparison /> : null}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto p-4"><EmptyState title="No Live Mic trace captured" detail="Run the existing Live Mic module to capture actual v1 streaming evidence, or switch to the deterministic recorded simulation." /></div>
        )}
      </Panel>
    </div>
  );
}

function TracePane({ trace, view, replayStep, onReplayStep, inspector, comparison = false }: { trace: ConversationTrace; view: TraceView; replayStep: number; onReplayStep: (step: number) => void; inspector: InspectorRecord | null; comparison?: boolean }) {
  const visibleEvents = trace.events.slice(0, replayStep);
  return (
    <div className={`flex min-h-0 min-w-0 flex-col ${comparison ? "border-l border-white/10" : ""}`}>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
        <div className="min-w-0 flex-1"><p className="truncate text-[10px] font-semibold text-slate-200">{trace.title}</p><p className="mt-0.5 truncate font-mono text-[8px] text-slate-600">session {trace.sessionId}</p></div><ProvenanceBadge value={trace.provenance} /><span className="font-mono text-[8px] text-slate-600">{trace.events.length} events</span>
      </div>
      {view === "timeline" ? <div className="shrink-0 border-b border-white/10 p-2"><div className="flex items-center gap-2"><span className="text-[8px] uppercase tracking-wide text-slate-600">Replay</span><input type="range" min={1} max={trace.events.length} value={Math.min(replayStep, trace.events.length)} onChange={(event) => onReplayStep(Number(event.target.value))} className="min-w-0 flex-1 accent-cyan-300" /><span className="font-mono text-[8px] text-cyan-200">{Math.min(replayStep, trace.events.length)}/{trace.events.length}</span></div></div> : null}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {view === "timeline" ? <Timeline events={visibleEvents} /> : null}
        {view === "sequence" ? <Sequence events={trace.events} /> : null}
        {view === "raw" ? <JsonView value={sanitizeAppliedExport(trace)} label="Sanitized trace JSON" maxHeight="max-h-[60vh]" /> : null}
        {view === "payload" ? inspector ? <div className="grid gap-3 xl:grid-cols-2"><JsonView value={inspector.request} label="Sanitized request" /><JsonView value={inspector.response} label="Sanitized response" /></div> : <JsonView value={{ note: "Recorded simulation payloads are examples, not captured API traffic.", events: trace.events.map((event) => ({ type: event.type, payload: event.payload, provenance: event.provenance })) }} label="Example event payloads" /> : null}
        {view === "latency" ? <LatencyWaterfall items={trace.latencyBudget} /> : null}
        {view === "state" ? <Timeline events={trace.events.filter((event) => ["StartOfTurn", "EagerEndOfTurn", "TurnResumed", "EndOfTurn", "UserInterruption", "Cancellation", "ListeningResumed", "HumanHandoff"].includes(event.type))} /> : null}
        {view === "errors" ? trace.events.some((event) => event.error) ? <Timeline events={trace.events.filter((event) => event.error)} /> : <EmptyState title="No error events in this trace" detail="Use Failure Lab or compare with the delayed/failure variant to practice diagnosis." /> : null}
        {view === "business" ? trace.events.some((event) => event.businessEvent) ? <Timeline events={trace.events.filter((event) => event.businessEvent)} /> : <EmptyState title="No business events in this trace" detail="Business events connect technical evidence to task outcome, escalation, or audit behavior." /> : null}
      </div>
    </div>
  );
}

function Timeline({ events }: { events: ConversationTraceEvent[] }) {
  return <ol className="relative space-y-2 before:absolute before:bottom-3 before:left-[37px] before:top-3 before:w-px before:bg-white/10">{events.map((event) => <li key={event.id} className="relative grid grid-cols-[64px_minmax(0,1fr)] gap-2"><div className="z-10 flex items-start gap-1"><span className="mt-2 size-2 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,.5)]" /><span className="pt-1 font-mono text-[8px] text-slate-600">+{event.offsetMs}</span></div><div className={`rounded-lg border p-2 ${event.error ? "border-rose-300/20 bg-rose-300/[0.05]" : "border-white/[0.08] bg-black/20"}`}><div className="flex flex-wrap items-center gap-1.5"><p className="text-[10px] font-semibold text-slate-200">{event.label}</p><span className="rounded border border-white/[0.08] px-1 py-0.5 font-mono text-[7px] text-slate-600">{event.component}</span><ProvenanceBadge value={event.provenance} /></div><p className="mt-1 text-[9px] leading-4 text-slate-500">{event.detail}</p><p className="mt-1 font-mono text-[7px] text-slate-700">turn {event.turnId ?? "—"} · step {event.stepId} · request {event.requestId ?? "—"}</p></div></li>)}</ol>;
}

function Sequence({ events }: { events: ConversationTraceEvent[] }) {
  const components = Array.from(new Set(events.map((event) => event.component)));
  return <div className="overflow-x-auto"><div className="grid min-w-[760px] gap-2" style={{ gridTemplateColumns: `repeat(${components.length}, minmax(120px, 1fr))` }}>{components.map((component) => <div key={component}><p className="sticky top-0 rounded bg-[#071018] px-2 py-1.5 text-center text-[8px] font-semibold uppercase tracking-wide text-cyan-200/65">{component}</p><div className="mt-2 space-y-2">{events.filter((event) => event.component === component).map((event) => <div key={event.id} className="rounded border border-white/[0.08] bg-black/20 p-2"><p className="font-mono text-[7px] text-slate-600">+{event.offsetMs} ms</p><p className="mt-1 text-[9px] font-semibold text-slate-300">{event.type}</p></div>)}</div></div>)}</div></div>;
}

function LatencyWaterfall({ items }: { items: LatencyBudgetItem[] }) {
  const max = Math.max(1, ...items.map((item) => item.valueMs ?? 0));
  const total = items.reduce((sum, item) => sum + (item.valueMs ?? 0), 0);
  return <div className="space-y-2"><div className="mb-3 flex items-center justify-between"><p className="text-[10px] font-semibold text-slate-300">Latency budget</p><span className="font-mono text-xs text-cyan-200">{total} ms represented</span></div>{items.map((item) => <div key={item.id} className="grid grid-cols-[150px_minmax(100px,1fr)_62px] items-center gap-2"><div><p className="truncate text-[9px] text-slate-300">{item.label}</p><p className="truncate text-[7px] text-slate-700">{item.note}</p></div><div className="h-5 overflow-hidden rounded bg-white/[0.04]"><div className="h-full rounded bg-gradient-to-r from-cyan-400/60 to-violet-400/60" style={{ width: item.valueMs === null ? "0%" : `${Math.max(3, (item.valueMs / max) * 100)}%` }} /></div><div className="text-right"><p className="font-mono text-[9px] text-slate-300">{item.valueMs === null ? "—" : `${item.valueMs} ms`}</p><p className="text-[7px] text-slate-600">{item.provenance}</p></div></div>)}<p className="pt-2 text-[9px] leading-4 text-amber-100/60">Do not treat simulated or derived values as service measurements. Capture real timestamps at each boundary in production.</p></div>;
}

function traceFromInspector(inspector: InspectorRecord): ConversationTrace {
  const start = Date.parse(inspector.startedAt);
  return {
    id: `live-${inspector.id}`,
    sessionId: `local-${inspector.id}`,
    createdAt: inspector.startedAt,
    title: `Latest Live Mic inspector · ${inspector.module}`,
    provenance: "measured",
    events: inspector.timeline.map((item, index): ConversationTraceEvent => ({ id: `${inspector.id}-${index}`, sessionId: `local-${inspector.id}`, stepId: `step-${index + 1}`, requestId: readRequestId(item.data), offsetMs: Math.max(0, Date.parse(item.at) - start), type: mapInspectorType(item.type), component: mapComponent(item.type), label: item.label, detail: item.detail ?? "Captured by the existing Live Mic inspector.", payload: sanitizeAppliedExport(item.data), error: /error|close|failed/i.test(item.type), businessEvent: /final|handoff|complete/i.test(item.type), provenance: "measured" })),
    latencyBudget: [{ id: "route-total", label: "Captured inspector duration", valueMs: inspector.durationMs, provenance: "measured", note: "End-to-end inspector duration; component splits are unavailable." }],
    rawAudioIncluded: false,
  };
}

function createComparisonTrace(trace: ConversationTrace): ConversationTrace {
  return { ...trace, id: `${trace.id}-delayed`, sessionId: `${trace.sessionId}-b`, title: "Recorded variant · injected tool delay", provenance: "simulated", events: trace.events.map((event) => ({ ...event, id: `${event.id}-b`, sessionId: `${event.sessionId}-b`, offsetMs: event.offsetMs + (event.offsetMs >= 850 ? 420 : 0), error: event.type === "ToolResult" ? true : event.error, detail: event.type === "ToolResult" ? "Simulated slow/error tool result for trace comparison." : event.detail, provenance: "simulated" })), latencyBudget: trace.latencyBudget.map((item) => item.id === "tool-work" ? { ...item, valueMs: (item.valueMs ?? 0) + 420, provenance: "simulated" } : { ...item, provenance: "simulated" }) };
}

function mapInspectorType(value: string): ConversationTraceEvent["type"] { if (/error|failed|close/i.test(value)) return "Error"; if (/final|transcript/i.test(value)) return "FinalTranscript"; if (/open|connect/i.test(value)) return "TransportConnected"; if (/token/i.test(value)) return "SessionStart"; return "InterimTranscript"; }
function mapComponent(value: string): ConversationTraceEvent["component"] { if (/token|route/i.test(value)) return "client"; if (/socket|connect|close/i.test(value)) return "transport"; if (/tts|speak/i.test(value)) return "deepgram-tts"; return "deepgram-stt"; }
function readRequestId(value: unknown) { if (value && typeof value === "object" && "request_id" in value && typeof (value as { request_id?: unknown }).request_id === "string") return (value as { request_id: string }).request_id; return undefined; }
