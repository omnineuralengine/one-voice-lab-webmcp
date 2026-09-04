"use client";

import { useState } from "react";
import {
  FieldLabel,
  JsonView,
  MetricTile,
  Panel,
  PanelHeading,
  ProvenanceBadge,
  inputClassName,
} from "@/components/applied-voice-systems/AcademyPrimitives";
import type { LabModuleId } from "@/lib/code-snippets";
import { DOCS_METADATA, TURN_TRACE_PRESET } from "@/lib/applied-voice/labs";
import type { ConversationTraceEvent } from "@/types/applied-voice";

type InterruptionBehavior = "cancel-and-listen" | "finish-buffer" | "human-handoff";

const INTERRUPTION_OPTIONS: Array<{ value: InterruptionBehavior; label: string; detail: string }> = [
  {
    value: "cancel-and-listen",
    label: "Cancel + listen",
    detail: "Stop stale generation/playback, preserve the turn context, and resume listening.",
  },
  {
    value: "finish-buffer",
    label: "Finish current buffer",
    detail: "Let only the already-buffered audio finish. Simpler, but the agent may speak over the user.",
  },
  {
    value: "human-handoff",
    label: "Escalate repeated collisions",
    detail: "After repeated interruption failures, stop automation and offer a truthful handoff path.",
  },
];

const FLUX_EVENT_NAMES = new Set(["StartOfTurn", "EagerEndOfTurn", "TurnResumed", "EndOfTurn"]);

export function TurnTakingLab({
  onOpenModule,
}: {
  onOpenModule?: (moduleId: LabModuleId) => void;
}) {
  const [eotThreshold, setEotThreshold] = useState(0.7);
  const [eagerEotThreshold, setEagerEotThreshold] = useState(0.5);
  const [eotTimeoutMs, setEotTimeoutMs] = useState(5_000);
  const [interruptionBehavior, setInterruptionBehavior] = useState<InterruptionBehavior>("cancel-and-listen");
  const fluxDocs = DOCS_METADATA.find((item) => item.id === "flux");
  const interruption = INTERRUPTION_OPTIONS.find((item) => item.value === interruptionBehavior) ?? INTERRUPTION_OPTIONS[0];

  const configuration = {
    endpoint: "wss://api.deepgram.com/v2/listen",
    model: "flux-general-en",
    thresholds: {
      eot_threshold: eotThreshold,
      eager_eot_threshold: eagerEotThreshold,
      eot_timeout_ms: eotTimeoutMs,
    },
    interruption_behavior: interruptionBehavior,
    execution: "recorded local simulation only",
  } as const;

  const latencyItems = [
    ...TURN_TRACE_PRESET.latencyBudget,
    {
      id: "live-flux",
      label: "Live Flux measurements",
      valueMs: null,
      provenance: "unavailable" as const,
      note: "Live Flux v2 is not connected in this lab.",
    },
  ];

  function updateFinalThreshold(value: number) {
    setEotThreshold(value);
    setEagerEotThreshold((current) => Math.min(current, value));
  }

  return (
    <div className="grid h-full min-h-0 gap-3 xl:grid-cols-[286px_minmax(0,1fr)]">
      <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
        <Panel>
          <PanelHeading
            eyebrow="Recorded mode"
            title="Turn controls"
            detail="Controls generate a valid conceptual Flux configuration. They do not rerun or retime the deterministic fixture."
            actions={<ProvenanceBadge value="simulated" />}
          />
          <div className="space-y-4 p-3">
            <RangeControl
              label="eot_threshold"
              value={eotThreshold}
              min={0.5}
              max={0.9}
              step={0.05}
              display={eotThreshold.toFixed(2)}
              help="Final end-of-turn confidence. Higher values favor certainty; lower values favor responsiveness."
              onChange={updateFinalThreshold}
            />
            <RangeControl
              label="eager_eot_threshold"
              value={eagerEotThreshold}
              min={0.3}
              max={eotThreshold}
              step={0.05}
              display={eagerEotThreshold.toFixed(2)}
              help="Enables speculative EagerEndOfTurn and TurnResumed handling. It must not exceed eot_threshold."
              onChange={(value) => setEagerEotThreshold(Math.min(value, eotThreshold))}
            />
            <RangeControl
              label="eot_timeout_ms"
              value={eotTimeoutMs}
              min={500}
              max={10_000}
              step={500}
              display={`${eotTimeoutMs.toLocaleString()} ms`}
              help="Maximum silence before forcing EndOfTurn, even when confidence stays below the final threshold."
              onChange={setEotTimeoutMs}
            />
            <FieldLabel label="Interruption behavior" help="Application policy; this is not a Flux query parameter.">
              <select
                value={interruptionBehavior}
                onChange={(event) => setInterruptionBehavior(event.target.value as InterruptionBehavior)}
                className={inputClassName}
              >
                {INTERRUPTION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </FieldLabel>
            <p className="rounded-md border border-white/[0.08] bg-black/20 p-2 text-[9px] leading-4 text-slate-500">{interruption.detail}</p>
          </div>
        </Panel>

        <Panel>
          <PanelHeading eyebrow="Tradeoffs" title="What changes directionally" />
          <div className="space-y-2 p-3 text-[10px] leading-4 text-slate-400">
            <Tradeoff label="Latency" value={eagerEotThreshold <= 0.5 ? "Earlier speculative work" : "More conservative speculation"} />
            <Tradeoff label="False starts" value={eagerEotThreshold <= 0.5 ? "Higher expected risk" : "Lower expected risk"} />
            <Tradeoff label="LLM calls" value="Eager mode may create canceled work" />
            <Tradeoff label="Responsiveness" value={eotThreshold <= 0.65 ? "Favors speed" : "Favors turn certainty"} />
            <Tradeoff label="Speaking over user" value={interruptionBehavior === "cancel-and-listen" ? "Mitigated by prompt cancellation" : "Requires extra attention"} />
          </div>
        </Panel>

        <JsonView value={configuration} label="Conceptual configuration · sanitized" maxHeight="max-h-64" />

        <div className="rounded-lg border border-amber-300/15 bg-amber-300/[0.045] p-3">
          <div className="flex flex-wrap items-center gap-2"><ProvenanceBadge value="working" /><span className="text-[10px] font-semibold text-amber-100">Existing Live Mic</span></div>
          <p className="mt-2 text-[9px] leading-4 text-amber-100/60">Live Mic uses the existing Nova streaming v1 flow. It is not a live Flux v2 session, so this lab never attributes Nova events to Flux.</p>
          <button
            type="button"
            onClick={() => onOpenModule?.("live-mic")}
            disabled={!onOpenModule}
            className="mt-2 rounded-md border border-amber-200/20 bg-amber-200/10 px-2.5 py-1.5 text-[9px] font-bold text-amber-100 transition hover:bg-amber-200/15 focus-visible:outline-2 focus-visible:outline-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Open Live Mic · Nova v1
          </button>
        </div>
      </div>

      <div className="grid min-h-0 gap-3 grid-rows-[minmax(300px,1fr)_auto]">
        <Panel className="flex min-h-0 flex-col overflow-hidden">
          <PanelHeading
            eyebrow="Deterministic fixture"
            title="Turn lifecycle timeline"
            detail="Purple entries are recorded simulations. Verified Flux names are shown as the TurnInfo event values documented by Deepgram; app phases are labeled separately."
            actions={fluxDocs?.docsUrl ? <a href={fluxDocs.docsUrl} target="_blank" rel="noreferrer" className="rounded border border-white/10 px-2 py-1 text-[9px] font-semibold text-slate-400 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-200">Official Flux docs</a> : null}
          />
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="mb-3 flex flex-wrap gap-1.5">
              <ProvenanceBadge value="simulated" />
              <ProvenanceBadge value="Docs verified" />
              <span className="text-[9px] leading-4 text-slate-600">No Deepgram, LLM, tool, TTS, or telephony request runs during replay.</span>
            </div>
            <ol aria-label="Recorded turn-taking event timeline" className="space-y-1.5">
              {TURN_TRACE_PRESET.events.map((event, index) => (
                <TimelineRow key={event.id} event={event} isLast={index === TURN_TRACE_PRESET.events.length - 1} />
              ))}
            </ol>
          </div>
        </Panel>

        <Panel>
          <PanelHeading
            eyebrow="Latency budget"
            title="Provenance before precision"
            detail="Fixture timings teach where to instrument. They are not production benchmarks or live measurements."
          />
          <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
            {latencyItems.map((item) => (
              <MetricTile
                key={item.id}
                label={item.label}
                value={item.valueMs === null ? "—" : `${item.valueMs} ms`}
                provenance={item.provenance}
                detail={item.note}
              />
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function RangeControl({
  label,
  value,
  min,
  max,
  step,
  display,
  help,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  help: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-2">
        <span className="font-mono text-[9px] font-semibold text-slate-400">{label}</span>
        <output className="rounded bg-cyan-300/10 px-1.5 py-0.5 font-mono text-[9px] text-cyan-100">{display}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full accent-cyan-300 focus-visible:outline-2 focus-visible:outline-cyan-200"
      />
      <span className="mt-1 block text-[9px] leading-3.5 text-slate-600">{help}</span>
    </label>
  );
}

function TimelineRow({ event, isLast }: { event: ConversationTraceEvent; isLast: boolean }) {
  const semantics = eventSemantics(event);
  return (
    <li className="grid grid-cols-[54px_14px_minmax(0,1fr)] gap-2">
      <time className="pt-2 text-right font-mono text-[9px] text-slate-600">+{event.offsetMs}ms</time>
      <span className="relative flex justify-center" aria-hidden="true">
        <span className={`mt-2 size-2 rounded-full border ${semantics.flux ? "border-cyan-200 bg-cyan-300/70" : "border-violet-200/60 bg-violet-300/50"}`} />
        {!isLast ? <span className="absolute bottom-[-10px] top-4 w-px bg-white/10" /> : null}
      </span>
      <article className="rounded-md border border-white/[0.07] bg-black/20 px-2.5 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="font-mono text-[10px] font-semibold text-slate-200">{semantics.name}</span>
            <span className="rounded border border-white/[0.08] px-1.5 py-0.5 text-[8px] uppercase tracking-wide text-slate-600">{event.component}</span>
          </div>
          <ProvenanceBadge value={event.provenance} />
        </div>
        <p className="mt-1 text-[9px] leading-4 text-slate-500"><span className="font-semibold text-slate-400">{event.label}.</span> {event.detail}</p>
        {semantics.note ? <p className="mt-1 text-[8px] leading-3 text-cyan-100/50">{semantics.note}</p> : null}
      </article>
    </li>
  );
}

function eventSemantics(event: ConversationTraceEvent) {
  if (FLUX_EVENT_NAMES.has(event.type)) {
    return {
      name: `TurnInfo · ${event.type}`,
      flux: true,
      note: event.type === "EndOfTurn"
        ? "Verified Flux event value; its transcript is the final turn transcript."
        : "Verified Flux TurnInfo event value.",
    };
  }
  if (event.type === "InterimTranscript") {
    return { name: "TurnInfo · Update", flux: true, note: "Flux uses the verified Update event value; “Interim transcript” is this lab’s teaching label." };
  }
  if (event.type === "FinalTranscript") {
    return { name: "App view · stabilized text", flux: false, note: "Flux does not define a FinalTranscript event value; consume the transcript on EndOfTurn as the final turn transcript." };
  }
  return { name: `App · ${event.type}`, flux: false, note: "Application/orchestration phase, not a Deepgram Flux event name." };
}

function Tradeoff({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] pb-2 last:border-0 last:pb-0"><span className="text-slate-600">{label}</span><span className="text-right text-slate-300">{value}</span></div>;
}
