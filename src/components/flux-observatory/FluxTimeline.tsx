"use client";

import type { FluxNormalizedEvent } from "@/lib/flux-observatory";
import { eventCategory, eventSummary, eventTitle, type FluxEventFilter } from "@/lib/flux-observatory/presentation";

const FILTERS: Array<{ id: FluxEventFilter; label: string }> = [
  { id: "turns", label: "Turn events" },
  { id: "transcripts", label: "Updates" },
  { id: "connection", label: "Connection" },
  { id: "configuration", label: "Configuration" },
  { id: "failures", label: "Failures" },
  { id: "measurements", label: "Local measurements" },
];

export function FluxTimeline({
  events,
  filters,
  onFilters,
  selectedEventId,
  onSelect,
}: {
  events: FluxNormalizedEvent[];
  filters: Set<FluxEventFilter>;
  onFilters: (next: Set<FluxEventFilter>) => void;
  selectedEventId: string | null;
  onSelect: (id: string) => void;
}) {
  const visible = events.filter((event) => filters.has(eventCategory(event)));
  return (
    <section aria-labelledby="flux-timeline-heading" className="flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-white/[0.09] bg-[#071017]/90 shadow-[0_24px_80px_rgba(0,0,0,.28)]">
      <header className="border-b border-white/[0.08] px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-cyan-200/60">Conversation timeline</p>
            <h2 id="flux-timeline-heading" className="mt-1 text-base font-semibold text-white">Every received and locally observed boundary</h2>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">Meaning first; sanitized payloads remain available for inspection.</p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/[.035] px-2.5 py-1 font-mono text-[10px] text-slate-400">{visible.length}/{events.length} events</span>
        </div>
        <fieldset className="mt-3 flex flex-wrap gap-1.5">
          <legend className="sr-only">Timeline event filters</legend>
          {FILTERS.map((filter) => {
            const active = filters.has(filter.id);
            return <button key={filter.id} type="button" aria-pressed={active} onClick={() => { const next = new Set(filters); if (active) next.delete(filter.id); else next.add(filter.id); onFilters(next); }} className={`min-h-8 rounded-full border px-2.5 text-[10px] font-semibold focus-visible:outline-2 focus-visible:outline-cyan-200 ${active ? "border-cyan-200/30 bg-cyan-200/[.1] text-cyan-50" : "border-white/[.08] text-slate-500 hover:text-slate-300"}`}>{filter.label}</button>;
          })}
        </fieldset>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3" data-testid="flux-timeline">
        {visible.length ? <ol className="space-y-2" aria-label="Flux Observatory events">
          {visible.map((event, index) => <TimelineEvent key={event.id} event={event} firstMs={visible[0]?.monotonicMs ?? 0} selected={selectedEventId === event.id} last={index === visible.length - 1} onSelect={() => onSelect(event.id)} />)}
        </ol> : <EmptyTimeline />}
      </div>
    </section>
  );
}

function TimelineEvent({ event, firstMs, selected, last, onSelect }: { event: FluxNormalizedEvent; firstMs: number; selected: boolean; last: boolean; onSelect: () => void }) {
  const category = eventCategory(event);
  const failure = category === "failures";
  const provider = event.source === "provider";
  return (
    <li className="grid grid-cols-[58px_16px_minmax(0,1fr)] gap-2">
      <time className="pt-3 text-right font-mono text-[9px] text-slate-600">+{Math.max(0, Math.round(event.monotonicMs - firstMs))}ms</time>
      <span className="relative flex justify-center" aria-hidden="true"><span className={`mt-3 size-2.5 rounded-full border ${failure ? "border-rose-200 bg-rose-300/70" : provider ? "border-cyan-200 bg-cyan-300/70" : "border-violet-200/70 bg-violet-300/50"}`} />{!last ? <span className="absolute bottom-[-12px] top-6 w-px bg-white/[.09]" /> : null}</span>
      <article className={`rounded-xl border px-3 py-2.5 transition ${selected ? "border-cyan-200/35 bg-cyan-200/[.065]" : "border-white/[.07] bg-black/20 hover:border-white/[.14]"}`}>
        <button type="button" onClick={onSelect} className="w-full text-left focus-visible:outline-2 focus-visible:outline-cyan-200">
          <span className="flex flex-wrap items-center justify-between gap-2"><span className="font-mono text-[10px] font-semibold text-slate-100">{eventTitle(event)}</span><span className="flex flex-wrap items-center gap-1"><EvidenceBadge event={event} /><span className="rounded border border-white/[.08] px-1.5 py-0.5 text-[8px] uppercase tracking-wider text-slate-500">{event.source}</span></span></span>
          <span className="mt-1 block text-[10px] leading-4 text-slate-400">{eventSummary(event)}</span>
          {event.kind === "turn" ? <span className="mt-1.5 flex flex-wrap gap-2 font-mono text-[9px] text-cyan-100/55"><span>turn {event.turnIndex ?? "?"}</span>{event.sequenceId !== undefined ? <span>seq {event.sequenceId}</span> : null}{event.languages.length ? <span>{event.languages.join(" + ")}</span> : null}</span> : null}
        </button>
        <details className="mt-2 border-t border-white/[.06] pt-2"><summary className="cursor-pointer text-[9px] font-semibold text-slate-500 focus-visible:outline-2 focus-visible:outline-cyan-200">Inspect sanitized payload</summary><pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-black/30 p-2 font-mono text-[9px] leading-4 text-slate-400">{JSON.stringify(event.sanitizedPayload ?? eventDetails(event), null, 2)}</pre></details>
      </article>
    </li>
  );
}

function EvidenceBadge({ event }: { event: FluxNormalizedEvent }) {
  const synthetic = event.mode === "synthetic-replay";
  return <span className={`rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${synthetic ? "border-violet-200/20 bg-violet-200/[.07] text-violet-100" : "border-emerald-200/20 bg-emerald-200/[.07] text-emerald-100"}`}>{synthetic ? "Synthetic" : "Live · review"}</span>;
}

function eventDetails(event: FluxNormalizedEvent) {
  if (event.kind === "local-lifecycle") return event.details;
  if (event.kind === "configuration-request") return { requestKey: event.requestKey, requestedConfiguration: event.requestedConfiguration };
  return { kind: event.kind };
}

function EmptyTimeline() {
  return <div className="flex min-h-80 items-center justify-center rounded-xl border border-dashed border-white/[.09] bg-black/10 p-8 text-center"><div><p className="text-sm font-semibold text-slate-300">No matching observations</p><p className="mt-2 max-w-sm text-[11px] leading-5 text-slate-500">Run a clearly labeled synthetic fixture, or explicitly prepare and start a live provider session. Nothing records automatically.</p></div></div>;
}
