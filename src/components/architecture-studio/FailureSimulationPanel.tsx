"use client";

import { useMemo, useState } from "react";

import { studioButton, studioInput, studioPrimaryButton } from "@/components/architecture-studio/StudioPrimitives";
import { FAILURE_SCENARIOS, MERIDIAN_DIAGNOSTIC_PRESETS, getFailureScenario, getMeridianDiagnosticPreset } from "@/data/architecture-studio-failures";
import type { ArchitectureCanvasSnapshot, ArchitectureSimulationState, FailureSeverity, MeridianDiagnosticPreset, SimulationAction } from "@/types/architecture-studio-diagnostics";

export function FailureSimulationPanel({
  architecture,
  simulation,
  disabled,
  onAction,
}: {
  architecture: ArchitectureCanvasSnapshot;
  simulation: ArchitectureSimulationState;
  disabled: boolean;
  onAction: (action: SimulationAction) => void;
}) {
  const guidedPreset = getMeridianDiagnosticPreset(simulation.guidedDemo.presetId);
  const [scenarioId, setScenarioId] = useState(guidedPreset?.defaultFailureId ?? "delayed-end-of-turn");
  const [originKind, setOriginKind] = useState<"node" | "connection">("node");
  const [originId, setOriginId] = useState("");
  const [severity, setSeverity] = useState<FailureSeverity>("high");
  const [symptoms, setSymptoms] = useState(guidedPreset?.visibleSymptoms.join("; ") ?? "");
  const scenario = getFailureScenario(scenarioId) ?? FAILURE_SCENARIOS[0];
  const origins = useMemo(() => originKind === "node"
    ? architecture.nodes.map((node) => ({ id: node.id, label: node.displayName, recommended: scenario.affectedNodeTypes.includes(node.type) }))
    : architecture.connections.map((connection) => ({ id: connection.id, label: `${nodeName(architecture, connection.fromNodeId)} → ${nodeName(architecture, connection.toNodeId)} · ${connection.protocol ?? connection.flow}`, recommended: scenario.affectedConnectionFlows.includes(connection.flow) })), [architecture, originKind, scenario]);

  const effectiveOriginId = origins.some((origin) => origin.id === originId) ? originId : origins.find((origin) => origin.recommended)?.id ?? origins[0]?.id ?? "";
  function loadPreset(preset: MeridianDiagnosticPreset) {
    setScenarioId(preset.defaultFailureId);
    setSymptoms(preset.visibleSymptoms.join("; "));
    setOriginKind("node");
    setOriginId(architecture.nodes.find((item) => item.type === preset.defaultOriginNodeType)?.id ?? architecture.nodes[0]?.id ?? "");
    setSeverity(getFailureScenario(preset.defaultFailureId)?.severity ?? "high");
    onAction({ type: "set-guided-demo", enabled: true, presetId: preset.id });
  }

  if (simulation.activeFailure) {
    const activeScenario = getFailureScenario(simulation.activeFailure.scenarioId);
    return (
      <section className="rounded-xl border border-rose-200/20 bg-rose-200/[0.045] p-4" aria-live="polite">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-rose-100">Simulated incident · {simulation.activeFailure.state}</p><h3 className="mt-1 text-base font-semibold text-white">{activeScenario?.title ?? simulation.activeFailure.scenarioId}</h3><p className="mt-2 text-[12px] leading-5 text-slate-300">{activeScenario?.description}</p></div><span className="rounded-full border border-rose-200/20 px-2.5 py-1 text-[10px] font-bold uppercase text-rose-100">{simulation.activeFailure.severity}</span></div>
        <dl className="mt-4 grid gap-2 text-[11px] sm:grid-cols-2"><Fact label="Origin" value={originName(architecture, simulation.activeFailure.originKind, simulation.activeFailure.originId)} /><Fact label="Reported symptoms" value={simulation.activeFailure.customerReportedSymptoms || "Use the scenario symptoms."} /><Fact label="Customer impact" value={activeScenario?.customerFacingImpact ?? "To validate"} /><Fact label="Fallback behavior" value={activeScenario?.fallbackBehavior ?? "To define"} /></dl>
        <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={disabled} onClick={() => onAction({ type: "pause-failure" })} className={studioButton}>{simulation.activeFailure.state === "paused" ? "Resume simulation" : "Pause simulation"}</button><button type="button" disabled={disabled} onClick={() => onAction({ type: "clear-failure" })} className={studioButton}>Clear simulated incident</button></div>
        <p className="mt-3 text-[10px] leading-4 text-rose-100/65">Clearing the visualization does not mark the incident resolved. Select a validation outcome first when evidence is available.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-white/[0.08] bg-black/15 p-4">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-rose-100/70">Controlled simulation</p><h3 className="mt-1 text-base font-semibold text-white">Inject a fictional failure</h3></div><span className="rounded border border-amber-200/20 bg-amber-200/[0.07] px-2 py-1 text-[10px] font-bold uppercase text-amber-100">No production action</span></div>
      <p className="mt-2 text-[12px] leading-5 text-slate-400">This deterministic exercise changes only local workshop state. It does not call Deepgram or any customer system.</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {MERIDIAN_DIAGNOSTIC_PRESETS.map((preset) => <button key={preset.id} type="button" disabled={disabled} onClick={() => loadPreset(preset)} className={`rounded-lg border p-3 text-left focus-visible:outline-2 focus-visible:outline-cyan-200 ${simulation.guidedDemo.presetId === preset.id ? "border-cyan-200/35 bg-cyan-200/[0.08]" : "border-white/[0.08] bg-white/[0.025]"}`}><span className="block text-[11px] font-semibold text-white">{preset.title}</span><span className="mt-1 block text-[10px] leading-4 text-slate-400">{preset.shortDescription}</span></button>)}
      </div>

      <div className="mt-4 grid gap-3">
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400" htmlFor="failure-scenario">Failure scenario<select id="failure-scenario" value={scenarioId} onChange={(event) => { const id = event.target.value; setScenarioId(id); setSeverity(getFailureScenario(id)?.severity ?? "medium"); }} className={`${studioInput} mt-1`}>
          {failureGroups().map(([category, failures]) => <optgroup key={category} label={category}>{failures.map((failure) => <option key={failure.id} value={failure.id}>{failure.title}</option>)}</optgroup>)}
        </select></label>
        <div className="grid grid-cols-[130px_1fr] gap-2"><label className="text-[11px] font-bold uppercase tracking-wider text-slate-400" htmlFor="failure-origin-kind">Origin type<select id="failure-origin-kind" value={originKind} onChange={(event) => setOriginKind(event.target.value as typeof originKind)} className={`${studioInput} mt-1`}><option value="node">Component</option><option value="connection">Connection</option></select></label><label className="text-[11px] font-bold uppercase tracking-wider text-slate-400" htmlFor="failure-origin">Starts at<select id="failure-origin" value={effectiveOriginId} onChange={(event) => setOriginId(event.target.value)} className={`${studioInput} mt-1`}>{origins.toSorted((a, b) => Number(b.recommended) - Number(a.recommended)).map((origin) => <option key={origin.id} value={origin.id}>{origin.recommended ? "Suggested · " : ""}{origin.label}</option>)}</select></label></div>
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400" htmlFor="failure-severity">Severity<select id="failure-severity" value={severity} onChange={(event) => setSeverity(event.target.value as FailureSeverity)} className={`${studioInput} mt-1`}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400" htmlFor="failure-symptoms">Customer-reported symptoms (fictional)<textarea id="failure-symptoms" value={symptoms} onChange={(event) => setSymptoms(event.target.value)} className={`${studioInput} mt-1 min-h-24`} placeholder="What did the customer observe?" /></label>
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3 text-[11px] leading-5 text-slate-400"><span className="font-semibold text-slate-300">Likely symptom set:</span> {scenario.likelySymptoms.join(" · ")}<br /><span className="font-semibold text-slate-300">Inspect:</span> {scenario.metricsToInspect.join(" · ")}</div>
        <button type="button" disabled={disabled || !effectiveOriginId} onClick={() => onAction({ type: "inject-failure", scenarioId, originKind, originId: effectiveOriginId, severity, customerReportedSymptoms: symptoms })} className={studioPrimaryButton}>Inject simulated failure</button>
      </div>
    </section>
  );
}

export function GuidedDemoStrip({ simulation, architecture, onAction }: { simulation: ArchitectureSimulationState; architecture: ArchitectureCanvasSnapshot; onAction: (action: SimulationAction) => void }) {
  const preset = getMeridianDiagnosticPreset(simulation.guidedDemo.presetId);
  if (!simulation.guidedDemo.enabled || !preset) return null;
  const phaseNumber = ["architecture", "inject", "choose-boundary", "evidence", "hypothesis", "mitigation", "validation", "summary"].indexOf(simulation.guidedDemo.phase) + 1;
  const suggestedBoundary = architecture.nodes.find((node) => node.type === preset.defaultOriginNodeType);
  return <div className="rounded-xl border border-cyan-200/20 bg-cyan-200/[0.045] p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-100/70">Guided demo · step {phaseNumber} of 8</p><p className="mt-1 text-sm font-semibold text-white">{preset.title}</p></div><button type="button" onClick={() => onAction({ type: "set-guided-demo", enabled: false })} className={studioButton}>Exit guided mode</button></div><p className="mt-2 text-[11px] leading-5 text-slate-300">{guidedInstruction(simulation.guidedDemo.phase)}</p>{simulation.guidedDemo.phase === "choose-boundary" && suggestedBoundary ? <button type="button" onClick={() => onAction({ type: "select-guided-boundary", nodeId: suggestedBoundary.id })} className={`${studioPrimaryButton} mt-2`}>Inspect {suggestedBoundary.displayName}</button> : null}</div>;
}

function guidedInstruction(phase: ArchitectureSimulationState["guidedDemo"]["phase"]) {
  return {
    architecture: "Orient the room to the generated Meridian architecture. Ask which boundary owns turn completion and customer-perceived response start.",
    inject: "Inject the selected fictional failure. Keep the first symptom incomplete so the facilitator can choose where to inspect.",
    "choose-boundary": "Ask: Which boundary would you timestamp first? Then select a component to reveal the next evidence.",
    evidence: "Reveal one piece of evidence at a time and distinguish observation from inference.",
    hypothesis: "Select—but do not confirm—a hypothesis. State what evidence would weaken it.",
    mitigation: "Compare immediate containment with a durable correction and name the owner and tradeoff.",
    validation: "Choose a validation outcome only after defining the test and evidence.",
    summary: "Generate and copy the incident summary, then close with an owner and next action.",
  }[phase];
}

function failureGroups() {
  return Object.entries(Object.groupBy(FAILURE_SCENARIOS, (failure) => failure.category)).map(([category, failures]) => [category.replaceAll("-", " "), failures ?? []] as const);
}

function nodeName(architecture: ArchitectureCanvasSnapshot, id: string) { return architecture.nodes.find((node) => node.id === id)?.displayName ?? id; }
function originName(architecture: ArchitectureCanvasSnapshot, kind: "node" | "connection", id: string) { if (kind === "node") return nodeName(architecture, id); const connection = architecture.connections.find((item) => item.id === id); return connection ? `${nodeName(architecture, connection.fromNodeId)} → ${nodeName(architecture, connection.toNodeId)}` : id; }
function Fact({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-white/[0.07] bg-black/15 p-2.5"><dt className="font-bold uppercase tracking-wider text-slate-500">{label}</dt><dd className="mt-1 leading-4 text-slate-300">{value}</dd></div>; }
