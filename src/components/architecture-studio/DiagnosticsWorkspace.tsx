"use client";

import { useMemo, useRef, useState } from "react";

import { ArchitectureInspector } from "@/components/architecture-studio/ArchitectureInspector";
import { DiagnosticWorkflowPanel, IncidentSummaryPanel, MitigationValidationPanel, OperatorAids, RootCausePanel } from "@/components/architecture-studio/DiagnosticWorkflowPanels";
import { FailureSimulationPanel, GuidedDemoStrip } from "@/components/architecture-studio/FailureSimulationPanel";
import { LiveArchitectureCanvas } from "@/components/architecture-studio/LiveArchitectureCanvas";
import { Panel, PanelHeading, StatusPill, studioButton, studioPrimaryButton } from "@/components/architecture-studio/StudioPrimitives";
import { applyArchitectureRevisions, buildGeneratedCanvasSnapshot, compareArchitectures } from "@/lib/architecture-studio/architecture-workspace";
import { applyFailureStatuses } from "@/lib/architecture-studio/failure-engine";
import { createInitialSimulationState, exportPortableDiagnosticSession } from "@/lib/architecture-studio/simulation-state";
import type { PublicStudioSession, StudioPresenterCommand } from "@/types/architecture-studio";
import type { ArchitectureCanvasView, SimulationAction } from "@/types/architecture-studio-diagnostics";

type WorkspaceSection = "canvas" | "diagnose" | "mitigate";

export function DiagnosticsWorkspace({ session, busy, onCommand }: { session: PublicStudioSession; busy: boolean; onCommand: (command: StudioPresenterCommand) => Promise<void> }) {
  const [section, setSection] = useState<WorkspaceSection>("canvas");
  const [message, setMessage] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const simulation = session.architectureSimulation ?? createInitialSimulationState();
  const generated = useMemo(() => buildGeneratedCanvasSnapshot(session), [session]);
  const current = useMemo(() => applyArchitectureRevisions(generated, simulation.revisions), [generated, simulation.revisions]);
  const displayed = useMemo(() => applyFailureStatuses(current, simulation.propagation), [current, simulation.propagation]);
  const comparison = useMemo(() => compareArchitectures(generated, current), [current, generated]);
  const selectedNode = current.nodes.find((node) => node.id === simulation.selectedNodeId);
  const selectedConnection = current.connections.find((connection) => connection.id === simulation.selectedConnectionId);
  const changeCount = comparison.addedNodeIds.length + comparison.removedNodeIds.length + comparison.changedNodeIds.length + comparison.addedConnectionIds.length + comparison.removedConnectionIds.length + comparison.changedConnectionIds.length;

  const action = (simulationAction: SimulationAction) => { void onCommand({ kind: "simulation", action: simulationAction }).catch(() => setMessage("The action could not be saved. Retry after the session reconnects.")); };

  function downloadState() {
    const portable = exportPortableDiagnosticSession(session);
    const blob = new Blob([JSON.stringify(portable, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${session.scenarioName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-diagnostic-session.json`; anchor.click();
    URL.revokeObjectURL(url);
    setMessage("Validated diagnostic state exported. No credentials or hidden scenario details were included.");
  }

  async function importState(file: File | undefined) {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text()) as unknown;
      await onCommand({ kind: "simulation", action: { type: "import-portable-state", payload } });
      setMessage("Diagnostic session imported and validated.");
    } catch {
      setMessage("Import rejected. Choose an unmodified Architecture Studio diagnostic JSON export.");
    } finally { if (importRef.current) importRef.current.value = ""; }
  }

  return (
    <div className="space-y-4">
      <GuidedDemoStrip simulation={simulation} architecture={current} onAction={action} />
      <Panel className="overflow-hidden">
        <PanelHeading eyebrow="Live architecture workspace" title="Inspect, adapt, diagnose, and recover" detail="The deterministic recommendation remains the generated baseline. Operator changes are replayable revisions; simulations never call a production service." actions={<div className="flex flex-wrap gap-2"><StatusPill tone={changeCount ? "amber" : "green"}>{changeCount ? `${changeCount} canvas changes` : "Generated baseline"}</StatusPill>{simulation.activeFailure ? <StatusPill tone="rose">Simulated failure active</StatusPill> : <StatusPill tone="slate">No active failure</StatusPill>}</div>} />
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] p-3">
          <div role="tablist" aria-label="Diagnostic workspace sections" className="flex gap-1 rounded-lg bg-black/20 p-1">{(["canvas", "diagnose", "mitigate"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={section === item} onClick={() => setSection(item)} className={section === item ? studioPrimaryButton : studioButton}>{item === "canvas" ? "Architecture" : item === "diagnose" ? "Diagnostic sequence" : "Mitigation + summary"}</button>)}</div>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={downloadState} className={studioButton}>Export diagnostic JSON</button><button type="button" onClick={() => importRef.current?.click()} className={studioButton}>Import JSON</button><input ref={importRef} type="file" accept="application/json,.json" className="sr-only" onChange={(event) => void importState(event.target.files?.[0])} /><button type="button" disabled={busy || !simulation.revisions.length} onClick={() => { if (window.confirm("Restore the latest engine-generated architecture? The diagnostic simulation and audit history will be recalculated.")) action({ type: "restore-generated" }); }} className={studioButton}>Restore generated</button><button type="button" disabled={busy} onClick={() => { if (window.confirm("Reset canvas changes, active incident, diagnostics, mitigations, and rehearsal progress for this simulation?")) action({ type: "reset-simulation" }); }} className={`${studioButton} text-rose-100`}>Reset simulation</button></div>
        </div>
        {message ? <p role="status" aria-live="polite" className="border-b border-white/[0.07] px-4 py-2 text-[11px] text-cyan-100">{message}</p> : null}

        {section === "canvas" ? <div className="grid gap-4 p-3 2xl:grid-cols-[minmax(0,1fr)_390px]"><div className="min-w-0 space-y-3"><CanvasToolbar view={simulation.selectedView} zoom={simulation.zoom} onAction={action} /><LiveArchitectureCanvas architecture={displayed} comparison={comparison} view={simulation.selectedView} zoom={simulation.zoom} selectedNodeId={simulation.selectedNodeId} selectedConnectionId={simulation.selectedConnectionId} propagation={simulation.propagation} onSelectNode={(nodeId) => action({ type: "select-node", nodeId })} onSelectConnection={(connectionId) => action({ type: "select-connection", connectionId })} onMoveNode={(nodeId, position) => action({ type: "move-node", nodeId, position })} /><RevisionSummary simulation={simulation} comparison={comparison} /></div><aside className="min-w-0 space-y-4"><ArchitectureInspector architecture={current} selectedNode={selectedNode} selectedConnection={selectedConnection} disabled={busy} onAction={action} /><FailureSimulationPanel architecture={current} simulation={simulation} disabled={busy} onAction={action} /></aside></div> : null}
        {section === "diagnose" ? <div className="grid gap-4 p-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)]"><DiagnosticWorkflowPanel architecture={current} simulation={simulation} disabled={busy} onAction={action} /><div className="space-y-4"><RootCausePanel simulation={simulation} disabled={busy} onAction={action} /><OperatorAids simulation={simulation} onAction={action} /></div></div> : null}
        {section === "mitigate" ? <div className="grid gap-4 p-3 xl:grid-cols-[minmax(0,1fr)_minmax(380px,.8fr)]"><MitigationValidationPanel simulation={simulation} disabled={busy} onAction={action} /><div className="space-y-4"><IncidentSummaryPanel simulation={simulation} disabled={busy} onAction={action} /><OperatorAids simulation={simulation} onAction={action} /></div></div> : null}
      </Panel>
    </div>
  );
}

function CanvasToolbar({ view, zoom, onAction }: { view: ArchitectureCanvasView; zoom: number; onAction: (action: SimulationAction) => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex gap-1">{(["customer-journey", "technical-flow", "failure-view"] as const).map((item) => <button key={item} type="button" onClick={() => onAction({ type: "set-view", view: item })} className={view === item ? studioPrimaryButton : studioButton}>{item === "customer-journey" ? "Customer journey" : item === "technical-flow" ? "Technical flow" : "Failure view"}</button>)}</div><div className="flex items-center gap-2"><button type="button" aria-label="Zoom out" onClick={() => onAction({ type: "set-zoom", zoom: zoom - 0.1 })} className={studioButton}>−</button><span className="min-w-14 text-center text-[11px] font-semibold text-slate-300">{Math.round(zoom * 100)}%</span><button type="button" aria-label="Zoom in" onClick={() => onAction({ type: "set-zoom", zoom: zoom + 0.1 })} className={studioButton}>+</button><button type="button" onClick={() => onAction({ type: "set-zoom", zoom: 0.68 })} className={studioButton}>Zoom to fit</button></div></div>;
}

function RevisionSummary({ simulation, comparison }: { simulation: ReturnType<typeof createInitialSimulationState>; comparison: ReturnType<typeof compareArchitectures> }) {
  if (!simulation.revisions.length) return <p className="text-[11px] text-slate-400">No operator revisions. The current canvas matches the latest engine-generated recommendation.</p>;
  return <details className="rounded-xl border border-amber-200/12 bg-amber-200/[0.035] p-3"><summary className="cursor-pointer text-[11px] font-semibold text-amber-50 focus-visible:outline-2 focus-visible:outline-cyan-200">Compare with generated · {simulation.revisions.length} audit entries</summary><div className="mt-3 grid gap-3 text-[11px] text-slate-400 lg:grid-cols-[240px_1fr]"><ul><li>{comparison.addedNodeIds.length} modules added</li><li>{comparison.removedNodeIds.length} modules removed</li><li>{comparison.changedNodeIds.length} modules changed</li><li>{comparison.addedConnectionIds.length + comparison.removedConnectionIds.length + comparison.changedConnectionIds.length} connection changes</li></ul><ol className="space-y-1">{simulation.revisions.slice(-12).toReversed().map((revision) => <li key={revision.id}><span className="font-mono text-[10px] text-amber-100/65">{revision.kind}</span> · {revision.summary}</li>)}</ol></div></details>;
}
