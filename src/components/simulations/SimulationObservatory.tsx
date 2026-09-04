"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useOneExperience } from "@/components/one/OneExperienceProvider";
import { DEFAULT_SIMULATION_SCENARIO_ID, SIMULATION_SCENARIOS, getSimulationScenario } from "@/lib/simulations/registry";
import { runDeterministicSimulationReplay, type SimulationImpairment, type SimulationReplayResult } from "@/lib/simulations/replay";
import { saveGuestExperiment, type SavedSimulationExperiment } from "@/lib/simulations/saved-experiments";
import { SIMULATION_TEMPLATES, type SimulationTemplateId } from "@/lib/simulations/templates";
import type { SimulationStatus } from "@/lib/simulations/types";
import { recordSimulationUsage } from "@/lib/simulations/usage-ledger";
import { getOneSupabaseBrowserClient } from "@/lib/supabase/client";

const PIPELINE = ["Audio", "STT", "Conversation", "Agent", "Tool", "TTS", "Playback", "Outcome"] as const;
const STATUS_LABELS: Record<SimulationStatus, string> = { implemented: "Implemented", replay: "Replay / demo", experimental: "Experimental", planned: "Planned" };

export function SimulationObservatory({ operatorEnabled }: { operatorEnabled: boolean }) {
  const one = useOneExperience();
  const dialogRef = useRef<HTMLElement>(null);
  const [scenarioId, setScenarioId] = useState(DEFAULT_SIMULATION_SCENARIO_ID);
  const [templateId, setTemplateId] = useState<SimulationTemplateId>("tool-using-agent");
  const [impairment, setImpairment] = useState<SimulationImpairment>("crosstalk");
  const [runCount, setRunCount] = useState(1);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [state, setState] = useState<"idle" | "running" | "paused" | "stopped" | "completed">("idle");
  const [eventIndex, setEventIndex] = useState(-1);
  const [result, setResult] = useState<SimulationReplayResult | null>(null);
  const [history, setHistory] = useState<SimulationReplayResult["scorecard"][]>([]);
  const [saveNotice, setSaveNotice] = useState("");
  const scenario = getSimulationScenario(scenarioId)!;
  const visibleEvents = result ? result.events.slice(0, eventIndex + 1) : [];

  useEffect(() => {
    if (state !== "running" || !result) return;
    const timer = window.setInterval(() => {
      setEventIndex((current) => {
        if (current >= result.events.length - 1) {
          window.clearInterval(timer);
          setState("completed");
          setHistory((items) => items.some((item) => item.runId === result.scorecard.runId) ? items : [...items, result.scorecard]);
          return current;
        }
        return current + 1;
      });
    }, 280);
    return () => window.clearInterval(timer);
  }, [result, state]);

  useEffect(() => {
    if (!confirmationOpen) return;
    const invoker = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setConfirmationOpen(false);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled), input:not(:disabled), [href]"));
      if (!controls.length) return;
      const first = controls[0];
      const last = controls.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.setTimeout(() => invoker?.focus(), 0);
    };
  }, [confirmationOpen]);

  const activeStage = visibleEvents.at(-1)?.stage;
  const selectableImpairments = scenario.status === "implemented" ? scenario.impairments as SimulationImpairment[] : [];
  const comparison = useMemo(() => history.length > 1 ? history.slice(-2) : null, [history]);

  function chooseScenario(nextId: string) {
    setScenarioId(nextId);
    setState("idle");
    setEventIndex(-1);
    setResult(null);
    const next = getSimulationScenario(nextId);
    setImpairment(next?.status === "implemented" ? "crosstalk" : "none");
  }

  function startReplay() {
    const next = runDeterministicSimulationReplay({ scenarioId, impairment, runCount });
    recordSimulationUsage(window.localStorage, next.usage);
    if (process.env.NODE_ENV === "production") {
    }
    setResult(next);
    setEventIndex(-1);
    setState("running");
    setConfirmationOpen(false);
  }

  function stopReplay() {
    setState("stopped");
    if (result) setHistory((items) => items.some((item) => item.runId === result.scorecard.runId) ? items : [...items, result.scorecard]);
  }

  function clearRun() {
    setState("idle");
    setEventIndex(-1);
    setResult(null);
  }

  function buildSavedExperiment(): SavedSimulationExperiment | null {
    if (!result) return null;
    return {
      id: result.scorecard.runId,
      name: `${scenario.name} · ${impairment}`,
      experimentType: "simulation",
      schemaVersion: "one-simulation-experiment-v1",
      configuration: { scenarioId, templateId, impairment, runCount, provenance: "simulated" },
      result: result.scorecard,
      createdAt: new Date().toISOString(),
    };
  }

  function saveLocally() {
    const experiment = buildSavedExperiment();
    if (!experiment) return;
    try {
      saveGuestExperiment(window.localStorage, experiment);
      setSaveNotice("Simulation saved locally on this device.");
    } catch {
      setSaveNotice("The bounded local experiment store is full. Export this result before replacing older presets.");
    }
  }

  async function saveToAccount() {
    const experiment = buildSavedExperiment();
    const client = getOneSupabaseBrowserClient();
    if (!experiment || !client || !one.user) {
      setSaveNotice("Sign in through the ONE Preference Center before syncing an experiment.");
      return;
    }
    const { error } = await client.from("saved_experiments").insert({
      user_id: one.user.id,
      name: experiment.name,
      experiment_type: experiment.experimentType,
      schema_version: experiment.schemaVersion,
      configuration: experiment.configuration,
      result: experiment.result,
    });
    setSaveNotice(error ? "Cloud save failed. The result remains available for local save or export." : "Simulation explicitly saved to your ONE identity.");
  }

  return (
    <div className="simulation-observatory" data-testid="simulation-observatory">
      <section aria-labelledby="simulation-scenarios-title" className="simulation-scenario-rail">
        <div className="simulation-section-heading"><p>Scenario registry</p><h2 id="simulation-scenarios-title">Stress the system deliberately</h2><span>{SIMULATION_SCENARIOS.length} defined scenarios</span></div>
        <div className="simulation-scenario-list">
          {SIMULATION_SCENARIOS.map((item) => (
            <button aria-pressed={item.id === scenarioId} className="simulation-scenario-card" data-status={item.status} key={item.id} onClick={() => chooseScenario(item.id)} type="button">
              <span>{item.shortName}</span><strong>{item.name}</strong><small>{STATUS_LABELS[item.status]}</small>
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="simulation-workspace-title" className="simulation-workspace">
        <header className="simulation-workspace-header">
          <div><p className="one-module-eyebrow">Flagship experiment - {STATUS_LABELS[scenario.status]}</p><h2 id="simulation-workspace-title">{scenario.name}</h2><p>{scenario.description}</p></div>
          <div className="simulation-role"><span className={operatorEnabled ? "is-operator" : ""}>{operatorEnabled ? "Operator" : "Observer"}</span><small>{operatorEnabled ? "Live execution still separately gated" : "Public replay only"}</small></div>
        </header>

        <div className="simulation-controls" aria-label="Simulation controls">
          <label>Mode<select value="replay" disabled><option value="replay">Deterministic replay - no provider</option></select></label>
          <label>Architecture template<select disabled={state === "running"} value={templateId} onChange={(event) => setTemplateId(event.target.value as SimulationTemplateId)}>{SIMULATION_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
          <label>Controlled impairment<select disabled={scenario.status !== "implemented" || state === "running"} value={impairment} onChange={(event) => setImpairment(event.target.value as SimulationImpairment)}>{selectableImpairments.length ? selectableImpairments.map((item) => <option key={item} value={item}>{item.replaceAll("-", " ")}</option>) : <option value="none">Not executable</option>}</select></label>
          <label>Run number<input disabled={!operatorEnabled || state === "running"} max={3} min={1} onChange={(event) => setRunCount(Math.max(1, Math.min(3, Number(event.target.value) || 1)))} type="number" value={runCount} /></label>
          <div className="simulation-control-actions">
            <button disabled={scenario.status !== "implemented" || state === "running"} onClick={() => setConfirmationOpen(true)} type="button">Start replay</button>
            <button disabled={state !== "running" && state !== "paused"} onClick={() => setState((value) => value === "running" ? "paused" : "running")} type="button">{state === "paused" ? "Resume" : "Pause"}</button>
            <button disabled={state !== "running" && state !== "paused"} onClick={stopReplay} type="button">Stop immediately</button>
            <button disabled={!result} onClick={clearRun} type="button">Clear run</button>
          </div>
        </div>

        {scenario.status !== "implemented" ? <div className="simulation-notice" role="note"><strong>{STATUS_LABELS[scenario.status]}</strong><p>{scenario.limitations[0]}</p>{scenario.relatedEvalId ? <a href={`/evals/${scenario.relatedEvalId}`}>Open related canonical evaluation</a> : null}</div> : null}

        <ol aria-label="Voice AI pipeline" className="simulation-pipeline">
          {PIPELINE.map((stage) => <li className={activeStage === stage.toLowerCase() ? "is-active" : ""} key={stage}><span aria-hidden="true" /><strong>{stage}</strong></li>)}
        </ol>

        <div className="simulation-observation-grid">
          <section aria-labelledby="simulation-timeline-title" className="simulation-timeline">
            <div className="simulation-panel-heading"><div><p>Realtime view</p><h3 id="simulation-timeline-title">Event timeline</h3></div><span aria-live="polite" role="status">{state === "running" ? "LIVE REPLAY" : state.toUpperCase()}</span></div>
            {visibleEvents.length ? <ol>{visibleEvents.map((event) => <li data-state={event.state} key={event.id}><time>{event.offsetMs} ms</time><div><strong>{event.label}</strong><p>{event.detail}</p><small>{event.stage} - simulated</small></div></li>)}</ol> : <div className="simulation-empty"><strong>No run is active</strong><p>Opening this page made zero provider requests. Start the deterministic replay explicitly when ready.</p></div>}
          </section>

          <aside aria-label="Run evidence" className="simulation-evidence-panel">
            <div className="simulation-panel-heading"><div><p>Evidence</p><h3>Run scorecard</h3></div><span>Lab metrics</span></div>
            {result && (state === "completed" || state === "stopped") ? <Scorecard result={result} onExport={() => downloadScorecard(result.scorecard)} onSaveLocal={saveLocally} onSaveAccount={one.user ? () => void saveToAccount() : undefined} /> : <div className="simulation-empty"><strong>Awaiting an observed run</strong><p>Scorecards are generated from the same deterministic event envelope shown in the timeline.</p></div>}
            <p className="simulation-save-notice" role="status" aria-live="polite">{saveNotice}</p>
          </aside>
        </div>

        {comparison ? <section className="simulation-comparison" aria-labelledby="simulation-comparison-title"><p>Run comparison</p><h3 id="simulation-comparison-title">Observed in these experiments</h3><div>{comparison.map((card) => <article key={card.runId}><strong>{card.controlledImpairment}</strong><span>{card.observedMetrics.find((metric) => metric.id === "interruption-recovery")?.value} ms recovery</span><span>{card.observedMetrics.find((metric) => metric.id === "background-intrusion")?.value} background intrusions</span></article>)}</div><small>Two deterministic fixture runs are not a provider benchmark.</small></section> : null}

        <section className="simulation-operator-boundary" aria-labelledby="simulation-operator-title"><div><p>Owner-controlled usage</p><h3 id="simulation-operator-title">Live provider mode remains gated</h3></div><p>{operatorEnabled ? "Operator mode is enabled for this server session, but this V1 exposes replay only. A future live runner still requires explicit confirmation, quotas, cancellation, and a separate provider boundary." : "Public visitors can inspect definitions and run local replay. They cannot launch live provider matrices or spend Deepgram credits."}</p><dl><div><dt>Provider requests</dt><dd>{result?.usage.providerRequestCount ?? 0}</dd></div><div><dt>Audio submitted</dt><dd>{result?.usage.audioSecondsSubmitted ?? 0} sec</dd></div><div><dt>Billing</dt><dd>{result?.usage.billingMessage ?? "Usage captured. Billing value not estimated."}</dd></div></dl></section>
      </section>

      {confirmationOpen ? <div className="simulation-dialog-backdrop" onMouseDown={() => setConfirmationOpen(false)}><section ref={dialogRef} aria-describedby="simulation-confirm-description" aria-labelledby="simulation-confirm-title" aria-modal="true" className="simulation-dialog" onMouseDown={(event) => event.stopPropagation()} role="dialog"><p className="one-module-eyebrow">Explicit execution</p><h2 id="simulation-confirm-title">Start deterministic replay?</h2><p id="simulation-confirm-description">This runs a local event fixture only. It sends no audio, transcript, credential, or provider request.</p><dl><div><dt>Scenario</dt><dd>{scenario.name}</dd></div><div><dt>Impairment</dt><dd>{impairment}</dd></div><div><dt>Provider spend</dt><dd>None</dd></div></dl><div><button autoFocus onClick={startReplay} type="button">Begin replay</button><button onClick={() => setConfirmationOpen(false)} type="button">Cancel</button></div></section></div> : null}
    </div>
  );
}

function Scorecard({ result, onExport, onSaveLocal, onSaveAccount }: { result: SimulationReplayResult; onExport: () => void; onSaveLocal: () => void; onSaveAccount?: () => void }) {
  const card = result.scorecard;
  return <div className="simulation-scorecard"><p>{card.evidenceLevel}</p><p className="simulation-scorecard__observation">{card.notes[0]}</p><dl>{card.observedMetrics.map((metric) => <div key={metric.id}><dt>{metric.label}</dt><dd>{metric.value} {metric.unit}</dd><small>{metric.note}</small></div>)}</dl><section><strong>Outcome</strong><p>{card.taskOutcome}</p></section><section><strong>Remaining uncertainty</strong><ul>{card.remainingUncertainty.map((item) => <li key={item}>{item}</li>)}</ul></section><div className="simulation-scorecard__actions"><button onClick={onSaveLocal} type="button">Save locally</button>{onSaveAccount ? <button onClick={onSaveAccount} type="button">Save to ONE identity</button> : null}<button onClick={onExport} type="button">Export sanitized scorecard</button></div></div>;
}

function downloadScorecard(scorecard: SimulationReplayResult["scorecard"]) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(scorecard, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${scorecard.runId}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
