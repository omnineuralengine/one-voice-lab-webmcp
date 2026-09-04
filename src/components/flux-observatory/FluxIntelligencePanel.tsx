"use client";

import type { FluxMetrics, FluxObservatoryState, FluxTurnState } from "@/lib/flux-observatory";
import { deriveSpeculativeState, METRIC_DEFINITIONS } from "@/lib/flux-observatory/presentation";

export function FluxIntelligencePanel({ state, metrics, selectedTurnIndex, onSelectTurn }: { state: FluxObservatoryState; metrics: FluxMetrics; selectedTurnIndex: number | null; onSelectTurn: (index: number) => void }) {
  const selectedTurn = state.turns.find((turn) => turn.turnIndex === selectedTurnIndex) ?? state.turns.at(-1) ?? null;
  const speculative = deriveSpeculativeState(selectedTurn);
  return <aside aria-labelledby="turn-intelligence-heading" className="space-y-3">
    <section className="overflow-hidden rounded-2xl border border-white/[.09] bg-[#071017]/90">
      <header className="border-b border-white/[.08] p-4"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-emerald-200/60">Turn intelligence</p><h2 id="turn-intelligence-heading" className="mt-1 text-base font-semibold text-white">Objective session evidence</h2><p className="mt-1 text-[9px] leading-4 text-slate-500">No model reasoning, accuracy guarantee, or universal benchmark is inferred.</p></header>
      <div className="grid grid-cols-2 gap-2 p-3">
        <CountMetric label="Completed turns" value={metrics.completedTurnCount} />
        <CountMetric label="Resumed turns" value={metrics.resumedTurnCount} />
        <CountMetric label="Unknown events" value={metrics.unknownEventCount} />
        <CountMetric label="Config failures" value={metrics.configurationFailureCount} />
      </div>
      <div className="space-y-2 border-t border-white/[.07] p-3">
        <TimingMetric label="Start → eager" metric={metrics.startToEager} />
        <TimingMetric label="Eager → end" metric={metrics.eagerToEnd} />
        <TimingMetric label="Start → end" metric={metrics.startToEnd} />
        <TimingMetric label="Observed chunk interval" metric={metrics.observedChunkInterval} />
        <TimingMetric label="Reconnect duration" metric={metrics.reconnectDuration} />
      </div>
      <div className="border-t border-white/[.07] p-3 text-[9px] leading-4 text-slate-500"><p>{metrics.timingCaveat}</p><p className="mt-2">Forced timeout: <strong className="text-slate-300">Insufficient provider evidence</strong>. {metrics.forcedTimeoutNote}</p><p className="mt-2">Audio frames: {metrics.droppedAudioFrameCount} dropped · {metrics.delayedAudioFrameCount} delayed, when locally measurable.</p></div>
      <details className="border-t border-white/[.07] p-3"><summary className="cursor-pointer text-[10px] font-semibold text-cyan-100 focus-visible:outline-2 focus-visible:outline-cyan-200">Metric definitions</summary><dl className="mt-3 space-y-3">{METRIC_DEFINITIONS.map(([term, definition]) => <div key={term}><dt className="text-[9px] font-semibold text-slate-300">{term}</dt><dd className="mt-0.5 text-[9px] leading-4 text-slate-500">{definition}</dd></div>)}</dl></details>
    </section>

    <section className="overflow-hidden rounded-2xl border border-white/[.09] bg-[#071017]/90">
      <header className="border-b border-white/[.08] p-4"><div className="flex items-center justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-cyan-200/60">Turn inspector</p><h2 className="mt-1 text-sm font-semibold text-white">Received state sequence</h2></div><span className="font-mono text-[9px] text-slate-500">{state.turns.length} grouped</span></div></header>
      <div className="p-3">
        {state.turns.length ? <div className="mb-3 flex flex-wrap gap-1.5" role="list" aria-label="Observed turns">{state.turns.map((turn) => <button key={turn.turnIndex} type="button" aria-pressed={selectedTurn?.turnIndex === turn.turnIndex} onClick={() => onSelectTurn(turn.turnIndex)} className={`min-h-8 rounded-lg border px-2 text-[9px] font-semibold focus-visible:outline-2 focus-visible:outline-cyan-200 ${selectedTurn?.turnIndex === turn.turnIndex ? "border-cyan-200/35 bg-cyan-200/[.1] text-cyan-50" : "border-white/[.08] text-slate-500"}`}>Turn {turn.turnIndex} · {turn.status}</button>)}</div> : null}
        {selectedTurn ? <TurnDetail turn={selectedTurn} /> : <p className="rounded-lg border border-dashed border-white/[.08] p-4 text-center text-[10px] leading-5 text-slate-500">No provider turn has been normalized yet.</p>}
      </div>
    </section>

    <section className="rounded-2xl border border-violet-200/15 bg-violet-200/[.035] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-violet-100">Experimental orchestration demonstrator</p><span className="rounded border border-violet-200/20 px-2 py-0.5 text-[8px] uppercase tracking-wider text-violet-100/70">Deterministic mock</span></div>
      <p className="mt-3 text-sm font-semibold capitalize text-white">{speculative.state}</p><p className="mt-1 text-[9px] leading-4 text-slate-400">{speculative.detail}</p><p className="mt-2 text-[9px] leading-4 text-slate-600">No LLM, tool, TTS, or customer mutation runs. Duplicate tool actions cannot execute because the demonstrator has no execution adapter.</p>
    </section>
  </aside>;
}

function CountMetric({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-white/[.07] bg-black/20 p-3"><p className="text-[9px] text-slate-500">{label}</p><p className="mt-1 font-mono text-xl font-semibold text-white">{value}</p></div>; }

function TimingMetric({ label, metric }: { label: string; metric: FluxMetrics["startToEnd"] }) {
  const headline = metric.medianStatus === "available" ? `${metric.median} ms median` : metric.sampleSize ? `${metric.minimum}–${metric.maximum} ms` : "Insufficient observations";
  return <div className="rounded-lg border border-white/[.065] bg-black/15 p-2.5"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[9px] font-semibold text-slate-300">{label}</p><span className="font-mono text-[9px] text-cyan-100">{headline}</span></div><p className="mt-1 text-[8px] text-slate-600">n={metric.sampleSize} · p95 {metric.p95Status === "available" ? `${metric.p95} ms` : "requires 20 observations"}</p></div>;
}

function TurnDetail({ turn }: { turn: FluxTurnState }) {
  return <article className="space-y-3">
    <div className="rounded-xl border border-white/[.07] bg-black/20 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-mono text-[10px] font-semibold text-cyan-100">Turn {turn.turnIndex} · {turn.status}</p><span className="text-[8px] uppercase tracking-wider text-slate-500">{turn.resumedCount} resumed</span></div><p className="mt-2 text-sm leading-6 text-slate-200">{turn.transcript || "No transcript field supplied."}</p><div className="mt-2 flex flex-wrap gap-1.5">{turn.eventSequence.map((event, index) => <span key={`${event}-${index}`} className="rounded border border-white/[.08] px-1.5 py-0.5 font-mono text-[8px] text-slate-400">{event}</span>)}</div></div>
    <details><summary className="cursor-pointer text-[9px] font-semibold text-slate-400 focus-visible:outline-2 focus-visible:outline-cyan-200">Words, languages, configuration, and missing fields</summary><div className="mt-2 space-y-2 text-[9px] leading-4 text-slate-500"><p>Languages: {turn.languages.length ? turn.languages.join(", ") : "not supplied"}. Hinted: {turn.languagesHinted.length ? turn.languagesHinted.join(", ") : "none supplied"}.</p><p>Active thresholds: eot {turn.activeConfiguration.thresholds.eotThreshold}, eager {turn.activeConfiguration.thresholds.eagerEotThreshold ?? "off"}, timeout {turn.activeConfiguration.thresholds.eotTimeoutMs} ms.</p><p>Missing: {turn.missingFields.length ? turn.missingFields.join(", ") : "no required local turn fields"}.</p>{turn.words.length ? <div className="max-h-32 overflow-auto rounded-lg border border-white/[.06]"><table className="w-full text-left"><thead className="text-slate-600"><tr><th className="px-2 py-1">Word</th><th className="px-2 py-1">Start</th><th className="px-2 py-1">End</th></tr></thead><tbody>{turn.words.map((word, index) => <tr key={`${word.word}-${index}`} className="border-t border-white/[.05]"><td className="px-2 py-1 text-slate-300">{word.word}</td><td className="px-2 py-1">{word.start ?? "—"}</td><td className="px-2 py-1">{word.end ?? "—"}</td></tr>)}</tbody></table></div> : null}</div></details>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2"><Proof title="What this proves" items={["The provider or fixture emitted the listed event sequence.", "The shared client reducer handled the state transition.", "Displayed elapsed intervals were derived from local timestamps.", ...(turn.eventSequence.includes("TurnResumed") ? ["Speculative state was cancelled after TurnResumed."] : [])]} /><Proof title="What this does not prove" items={["Universal latency or transcription accuracy.", "Production concurrency, compliance, or customer readiness.", "Internal model reasoning or universally optimal thresholds."]} /></div>
  </article>;
}

function Proof({ title, items }: { title: string; items: string[] }) { return <div className="rounded-lg border border-white/[.065] bg-black/15 p-2.5"><h3 className="text-[9px] font-semibold text-white">{title}</h3><ul className="mt-1.5 space-y-1 text-[8px] leading-3.5 text-slate-500">{items.map((item) => <li key={item}>• {item}</li>)}</ul></div>; }
