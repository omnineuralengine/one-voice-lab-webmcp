"use client";

import { useState } from "react";

import {
  FieldLabel,
  JsonView,
  Panel,
  PanelHeading,
  ProvenanceBadge,
  buttonClassName,
  downloadTextFile,
  primaryButtonClassName,
  textareaClassName,
} from "@/components/applied-voice-systems/AcademyPrimitives";
import { runEvaluationScenario, sanitizeAppliedExport } from "@/lib/applied-voice/academy";
import { EVALUATION_SCENARIOS } from "@/lib/applied-voice/labs";
import type { EvaluationDimension, EvaluationRun } from "@/types/applied-voice";

const DIMENSIONS: EvaluationDimension[] = ["speech-recognition", "conversation-behavior", "agent-behavior", "business-outcome", "safety-trust"];

export function EvaluationLab({ runs, onRunsChange }: { runs: EvaluationRun[]; onRunsChange: (runs: EvaluationRun[]) => void }) {
  const [scenarioId, setScenarioId] = useState(EVALUATION_SCENARIOS[0].id);
  const scenario = EVALUATION_SCENARIOS.find((item) => item.id === scenarioId) ?? EVALUATION_SCENARIOS[0];
  const [forceFailure, setForceFailure] = useState(false);
  const [notes, setNotes] = useState("");
  const [ratings, setRatings] = useState<Partial<Record<EvaluationDimension, number>>>({});
  const [selectedRunId, setSelectedRunId] = useState(runs.at(-1)?.id ?? "");
  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? runs.at(-1);

  function runFixture() {
    const run = runEvaluationScenario(scenarioId, {
      forceFailures: forceFailure ? [scenario.assertions[0]?.id ?? "forced"] : [],
      humanRatings: ratings,
      notes,
    });
    onRunsChange([...runs, run]);
    setSelectedRunId(run.id);
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[230px_minmax(360px,1fr)_minmax(300px,.85fr)] gap-0 p-3">
      <Panel className="flex min-h-0 flex-col overflow-hidden rounded-r-none">
        <PanelHeading eyebrow="Deterministic fixtures" title="Scenario library" detail="Local simulations; subjective quality still needs human review." />
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {EVALUATION_SCENARIOS.map((item) => <button key={item.id} type="button" onClick={() => setScenarioId(item.id)} className={`mb-1.5 w-full rounded-md border p-2 text-left ${scenario.id === item.id ? "border-cyan-300/30 bg-cyan-300/[0.08]" : "border-white/[0.07] bg-black/15 hover:border-white/15"}`}><span className="block text-[10px] font-semibold text-slate-200">{item.name}</span><span className="mt-1 block text-[9px] leading-3.5 text-slate-600">{item.description}</span></button>)}
        </div>
      </Panel>

      <Panel className="flex min-h-0 flex-col overflow-hidden rounded-none border-x-0">
        <PanelHeading eyebrow="Test definition" title={scenario.name} detail={scenario.description} actions={<ProvenanceBadge value="local simulation" />} />
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="grid gap-3 xl:grid-cols-2">
            <List title="Expected behavior" items={scenario.expectedBehavior} />
            <List title="Remediation ideas" items={scenario.remediationIdeas} />
          </div>
          <div className="mt-3 overflow-hidden rounded-lg border border-white/10">
            <div className="grid grid-cols-[130px_minmax(0,1fr)_95px] border-b border-white/10 bg-black/20 px-3 py-2 text-[8px] font-semibold uppercase tracking-wide text-slate-600"><span>Dimension</span><span>Assertion</span><span>Review</span></div>
            {scenario.assertions.map((assertion) => <div key={assertion.id} className="grid grid-cols-[130px_minmax(0,1fr)_95px] gap-2 border-b border-white/[0.06] px-3 py-2 last:border-0"><span className="text-[9px] text-cyan-200/70">{humanize(assertion.dimension)}</span><span className="text-[9px] leading-4 text-slate-400">{assertion.expected}</span><span className="text-[8px] text-slate-600">{assertion.requiresHumanReview ? "Human rating" : "Deterministic"}</span></div>)}
          </div>
          <div className="mt-3 rounded-lg border border-violet-300/15 bg-violet-300/[0.035] p-3">
            <div className="flex items-center justify-between"><p className="text-[9px] font-semibold uppercase tracking-wide text-violet-200/65">Human review ratings</p><ProvenanceBadge value="derived" /></div>
            <p className="mt-1 text-[9px] leading-4 text-slate-600">Ratings are reviewer judgment, not objective model truth. Record the rater and rubric in production studies.</p>
            <div className="mt-3 grid gap-2 xl:grid-cols-2">{DIMENSIONS.map((dimension) => <label key={dimension} className="rounded-md border border-white/[0.08] bg-black/20 p-2"><span className="flex items-center justify-between text-[9px] text-slate-400"><span>{humanize(dimension)}</span><span className="font-mono text-cyan-200">{ratings[dimension] ?? "—"}/5</span></span><input type="range" min={0} max={5} step={1} value={ratings[dimension] ?? 0} onChange={(event) => setRatings((current) => ({ ...current, [dimension]: Number(event.target.value) || undefined }))} className="mt-1 w-full accent-violet-300" /></label>)}</div>
          </div>
          <div className="mt-3 grid gap-3 xl:grid-cols-2"><FieldLabel label="Reviewer notes"><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} className={textareaClassName} /></FieldLabel><label className="flex items-center gap-2 rounded-lg border border-amber-300/15 bg-amber-300/[0.035] p-3 text-[10px] text-amber-100/70"><input type="checkbox" checked={forceFailure} onChange={(event) => setForceFailure(event.target.checked)} className="accent-amber-300" />Force first deterministic assertion to fail</label></div>
          <div className="mt-3 flex gap-2"><button type="button" onClick={runFixture} className={primaryButtonClassName}>Run deterministic scenario</button>{runs.length ? <button type="button" onClick={() => downloadTextFile("applied-voice-evaluations.json", JSON.stringify(sanitizeAppliedExport(runs), null, 2), "application/json")} className={buttonClassName}>Export results</button> : null}</div>
        </div>
      </Panel>

      <Panel className="flex min-h-0 flex-col overflow-hidden rounded-l-none">
        <PanelHeading eyebrow="Evaluation evidence" title={selectedRun ? (selectedRun.passed ? "Scenario passed" : "Scenario needs remediation") : "No run selected"} detail={`${runs.length} local run${runs.length === 1 ? "" : "s"}`} actions={selectedRun ? <ProvenanceBadge value={selectedRun.provenance} /> : null} />
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {selectedRun ? <div className="space-y-3"><div className="space-y-2">{selectedRun.results.map((result) => <div key={result.id} className={`rounded-lg border p-2 ${result.passed ? "border-emerald-300/15 bg-emerald-300/[0.04]" : "border-rose-300/20 bg-rose-300/[0.05]"}`}><div className="flex items-center justify-between"><p className="text-[10px] font-semibold text-slate-200">{result.expected}</p><span className={`text-[9px] font-bold ${result.passed ? "text-emerald-200" : "text-rose-200"}`}>{result.passed ? "PASS" : "FAIL"}</span></div><p className="mt-1 text-[9px] leading-4 text-slate-500">Actual: {result.actual}</p>{result.requiresHumanReview ? <p className="mt-1 text-[8px] text-violet-200/60">Human review required</p> : null}</div>)}</div><List title="Actual behavior" items={selectedRun.actualBehavior} /><JsonView value={selectedRun.trace} label="Raw sanitized trace" /></div> : <p className="py-12 text-center text-[10px] leading-4 text-slate-600">Run a fixture to produce pass/fail assertions, an actual behavior summary, and a replayable local trace.</p>}
        </div>
      </Panel>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) { return <div className="rounded-lg border border-white/[0.08] bg-black/15 p-3"><p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">{title}</p><ul className="mt-2 space-y-1 text-[9px] leading-4 text-slate-400">{items.map((item, index) => <li key={`${index}-${item}`}>• {item}</li>)}</ul></div>; }
function humanize(value: string) { return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
