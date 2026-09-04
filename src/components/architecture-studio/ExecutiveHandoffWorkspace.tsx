"use client";

import { useEffect, useMemo, useState } from "react";

import { Panel, StatusPill, studioButton, studioPrimaryButton } from "@/components/architecture-studio/StudioPrimitives";
import { ExecutiveSummaryView } from "@/components/architecture-studio/handoff/ExecutiveSummaryView";
import { PocPlanView } from "@/components/architecture-studio/handoff/PocPlanView";
import { RegistersView } from "@/components/architecture-studio/handoff/RegistersView";
import { RehearsalView } from "@/components/architecture-studio/handoff/RehearsalView";
import { ShareExportView } from "@/components/architecture-studio/handoff/ShareExportView";
import { TechnicalHandoffView } from "@/components/architecture-studio/handoff/TechnicalHandoffView";
import { deriveActionRegister, deriveDecisionRegister, deriveExecutiveSummary, deriveProofOfConceptPlan, deriveSessionNarrative, deriveSessionReport, deriveTechnicalHandoff } from "@/lib/architecture-studio/handoff-derivation";
import { normalizeHandoffState } from "@/lib/architecture-studio/handoff-state";
import { recommendPackage } from "@/lib/architecture-studio/package-recommendation-engine";
import type { PublicStudioSession, StudioPresenterCommand } from "@/types/architecture-studio";
import type { HandoffAction, HandoffAudienceMode, HandoffView } from "@/types/architecture-studio-handoff";

const VIEWS: Array<{ id: HandoffView; label: string; operatorOnly?: boolean }> = [
  { id: "executive-summary", label: "Executive Summary" },
  { id: "technical-handoff", label: "Technical Handoff" },
  { id: "poc-plan", label: "POC Plan" },
  { id: "registers", label: "Decisions + Actions" },
  { id: "rehearsal", label: "Rehearsal", operatorOnly: true },
  { id: "share-export", label: "Share + Export", operatorOnly: true },
];

export function ExecutiveHandoffWorkspace({ session, busy, onCommand }: { session: PublicStudioSession; busy: boolean; onCommand: (command: StudioPresenterCommand) => Promise<void> }) {
  const [message, setMessage] = useState("");
  const state = normalizeHandoffState(session.handoffState);
  const facilitatorView = state.perspective === "facilitator";
  const availableViews = useMemo(() => VIEWS.filter((view) => !view.operatorOnly || !facilitatorView), [facilitatorView]);
  const activeView = availableViews.some((view) => view.id === state.activeView) ? state.activeView : "executive-summary";
  const summary = useMemo(() => deriveExecutiveSummary(session, state.audience), [session, state.audience]);
  const handoff = useMemo(() => deriveTechnicalHandoff(session, state.includeOperatorNotesInExport), [session, state.includeOperatorNotesInExport]);
  const plan = useMemo(() => deriveProofOfConceptPlan(session), [session]);
  const decisions = useMemo(() => deriveDecisionRegister(session), [session]);
  const actions = useMemo(() => deriveActionRegister(session, decisions), [decisions, session]);
  const narrative = useMemo(() => deriveSessionNarrative(session), [session]);
  const report = useMemo(() => deriveSessionReport(session, state.audience, state.includeOperatorNotesInExport), [session, state.audience, state.includeOperatorNotesInExport]);
  const gaps = recommendPackage(session).gaps;
  const action = (handoffAction: HandoffAction) => { void onCommand({ kind: "handoff", action: handoffAction }).catch(() => setMessage("The handoff change could not be saved. Retry after reconnecting.")); };

  useEffect(() => {
    if (!state.presentationMode) return;
    const navigate = (event: KeyboardEvent) => {
      if (!["ArrowLeft", "ArrowRight", "PageUp", "PageDown"].includes(event.key) || ["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement)?.tagName)) return;
      event.preventDefault();
      const index = availableViews.findIndex((view) => view.id === activeView);
      const direction = event.key === "ArrowLeft" || event.key === "PageUp" ? -1 : 1;
      const next = availableViews[(index + direction + availableViews.length) % availableViews.length];
      if (next) void onCommand({ kind: "handoff", action: { type: "set-view", view: next.id } });
    };
    window.addEventListener("keydown", navigate);
    return () => window.removeEventListener("keydown", navigate);
  }, [activeView, availableViews, onCommand, state.presentationMode]);

  const content = <>
    {activeView === "executive-summary" ? <><ExecutiveSummaryView summary={summary} presentation={state.presentationMode} />{!state.presentationMode ? <NarrativePanel paragraphs={narrative.paragraphs} /> : null}</> : null}
    {activeView === "technical-handoff" ? <TechnicalHandoffView handoff={handoff} /> : null}
    {activeView === "poc-plan" ? <PocPlanView plan={plan} disabled={busy || facilitatorView} onSaveCriterion={(criterion) => action({ type: "set-acceptance-criterion", criterion })} /> : null}
    {activeView === "registers" ? <RegistersView decisions={decisions} actions={actions} gaps={gaps} closures={state.questionClosures} disabled={busy || facilitatorView} onAction={action} /> : null}
    {activeView === "rehearsal" && !facilitatorView ? <RehearsalView state={state} disabled={busy} onAction={action} /> : null}
    {activeView === "share-export" && !facilitatorView ? <ShareExportView session={session} summary={summary} handoff={handoff} plan={plan} report={report} onAction={action} onImport={(payload) => onCommand({ kind: "import_session", payload }).then(() => undefined)} /> : null}
  </>;

  if (state.presentationMode) return <div className="fixed inset-0 z-[100] overflow-auto bg-[#020608] text-slate-100"><header className="sticky top-0 z-20 border-b border-white/10 bg-[#061016]/96 px-4 py-3 backdrop-blur"><div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-100/65">ONE Voice Lab · synthetic workshop</p><h1 className="mt-1 text-sm font-semibold text-white">{session.scenarioName} final handoff</h1></div><div className="flex flex-wrap items-center gap-2"><PerspectiveToggle perspective={state.perspective} onAction={action} /><button type="button" onClick={() => action({ type: "set-presentation-mode", enabled: false })} className={studioButton}>Exit presentation</button><button type="button" onClick={() => { if (window.confirm("Emergency reset the complete synthetic session?")) void onCommand({ kind: "reset" }); }} className={`${studioButton} text-rose-100`}>Emergency reset</button></div></div><nav aria-label="Presentation sections" className="mx-auto mt-3 flex max-w-[1800px] gap-1 overflow-x-auto">{availableViews.map((view) => <button key={view.id} type="button" aria-current={activeView === view.id ? "page" : undefined} onClick={() => action({ type: "set-view", view: view.id })} className={`${activeView === view.id ? studioPrimaryButton : studioButton} shrink-0`}>{view.label}</button>)}</nav></header><main className="mx-auto max-w-[1800px] p-4 sm:p-6">{content}</main></div>;

  return <div className="space-y-4"><Panel className="overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] p-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-100/65">Final-stage customer handoff</p><h2 className="mt-1 text-lg font-semibold text-white">Turn the workshop into a decision and implementation path</h2><p className="mt-1 max-w-3xl text-[11px] leading-5 text-slate-400">Every view is regenerated from the current discovery ledger, recommendation evidence, canvas revisions, diagnostic findings, mitigation, and validation state.</p></div><div className="flex flex-wrap gap-2"><StatusPill tone="violet">Synthetic data</StatusPill><PerspectiveToggle perspective={state.perspective} onAction={action} /><button type="button" onClick={() => action({ type: "set-presentation-mode", enabled: true })} className={studioPrimaryButton}>Present full screen</button></div></div><div className="flex flex-wrap items-center justify-between gap-3 p-3"><nav aria-label="Handoff views" className="flex gap-1 overflow-x-auto">{availableViews.map((view) => <button key={view.id} type="button" onClick={() => action({ type: "set-view", view: view.id })} className={`${activeView === view.id ? studioPrimaryButton : studioButton} shrink-0`}>{view.label}</button>)}</nav><AudienceToggle audience={state.audience} onAction={action} /></div></Panel>{message ? <p role="status" className="rounded-lg border border-rose-200/15 bg-rose-200/[0.04] p-3 text-[11px] text-rose-100">{message}</p> : null}{content}</div>;
}

function AudienceToggle({ audience, onAction }: { audience: HandoffAudienceMode; onAction: (action: HandoffAction) => void }) { return <fieldset className="flex gap-1"><legend className="sr-only">Summary audience</legend>{(["executive", "technical", "customer-success"] as const).map((mode) => <button key={mode} type="button" aria-pressed={audience === mode} onClick={() => onAction({ type: "set-audience", audience: mode })} className={audience === mode ? studioPrimaryButton : studioButton}>{mode === "customer-success" ? "Customer Success" : mode[0].toUpperCase() + mode.slice(1)}</button>)}</fieldset>; }
function PerspectiveToggle({ perspective, onAction }: { perspective: "operator" | "facilitator"; onAction: (action: HandoffAction) => void }) { return <div className="flex rounded-lg border border-white/10 p-0.5" aria-label="Presentation perspective">{(["facilitator", "operator"] as const).map((mode) => <button key={mode} type="button" aria-pressed={perspective === mode} onClick={() => onAction({ type: "set-perspective", perspective: mode })} className={`rounded-md px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider focus-visible:outline-2 focus-visible:outline-cyan-200 ${perspective === mode ? "bg-white text-slate-950" : "text-slate-400"}`}>{mode} view</button>)}</div>; }
function NarrativePanel({ paragraphs }: { paragraphs: string[] }) { return <details className="rounded-xl border border-white/[0.08] bg-black/15 p-4"><summary className="cursor-pointer text-xs font-semibold text-white focus-visible:outline-2 focus-visible:outline-cyan-200">Chronological session narrative</summary><div className="mt-3 space-y-3">{paragraphs.map((paragraph) => <p key={paragraph} className="text-[11px] leading-5 text-slate-400">{paragraph}</p>)}</div></details>; }
