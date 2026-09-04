"use client";

import Link from "next/link";
import { useState } from "react";

import { ChallengeConsole } from "@/components/pre-sales-studio/ChallengeConsole";
import { DiscoveryConsole } from "@/components/pre-sales-studio/DiscoveryConsole";
import { PatternLibrary } from "@/components/pre-sales-studio/PatternLibrary";
import { PocBuilder } from "@/components/pre-sales-studio/PocBuilder";
import { PreSalesBrand, PreSalesFrame, ProgressNav, SafetyNotice, StatusBadge, preSalesButton, preSalesPrimaryButton } from "@/components/pre-sales-studio/PreSalesPrimitives";
import { ReadoutWorkspace } from "@/components/pre-sales-studio/ReadoutWorkspace";
import { SolutionBlueprint } from "@/components/pre-sales-studio/SolutionBlueprint";
import { TechnicalDemoConsole } from "@/components/pre-sales-studio/TechnicalDemoConsole";
import { usePreSalesOpportunity } from "@/hooks/use-pre-sales-opportunity";
import { computeDiscoveryInsight } from "@/lib/pre-sales-studio/engine";
import type { OpportunityState, PreSalesStageId } from "@/types/pre-sales-studio";

const GUIDED_STEPS: Array<{ label: string; stage: PreSalesStageId; cue: string }> = [
  { label: "Customer goal", stage: "discovery", cue: "Confirm the outcome before discussing products." }, { label: "Highest-value question", stage: "discovery", cue: "Ask the first adaptive question, then reflect what changed." },
  { label: "Selected solution", stage: "blueprint", cue: "Explain the starting recommendation and one visible assumption." }, { label: "Architecture", stage: "blueprint", cue: "Select a node and make the ownership boundary explicit." },
  { label: "POC criterion", stage: "poc", cue: "Adopt or edit one criterion; leave unsupported targets blank." }, { label: "Injected objection", stage: "blueprint", cue: "Challenge the solution and explain what changed and why." },
  { label: "Next action", stage: "readout", cue: "Close with a decision, owner, and measurable next milestone." },
];

export function PreSalesStudio({ liveApiAvailable, openLabMode = false }: { liveApiAvailable: boolean; openLabMode?: boolean }) {
  const { opportunity, savedOpportunity, start, resume, clear, reset, update } = usePreSalesOpportunity(); const [challengeOpen, setChallengeOpen] = useState(false);
  if (!opportunity) return <PreSalesFrame><header className="border-b border-white/[0.08] bg-[#061016]/80 px-5 py-4"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4"><PreSalesBrand /><Link href="/" className={preSalesButton}>Learning Lab</Link></div></header><PatternLibrary onStart={start} savedOpportunity={savedOpportunity} onResume={resume} /></PreSalesFrame>;
  const insight = computeDiscoveryInsight(opportunity);
  const change = (next: OpportunityState) => update(next);
  const setStage = (activeStage: PreSalesStageId) => update({ ...opportunity, activeStage, updatedAt: new Date().toISOString() });
  const nextStage = (stage: PreSalesStageId) => setStage(stage);
  const togglePersistence = () => update({ ...opportunity, persistenceEnabled: !opportunity.persistenceEnabled, updatedAt: new Date().toISOString() });
  const clearDemo = () => { if (window.confirm("Clear the active workshop and any locally saved copy?")) clear(); };
  const resetDemo = () => { if (window.confirm("Reset this scenario to its illustrative starting state?")) reset(); };
  const advanceGuide = (direction: -1 | 1) => { const guidedStep = Math.min(GUIDED_STEPS.length - 1, Math.max(0, opportunity.guidedStep + direction)); update({ ...opportunity, guidedStep, activeStage: GUIDED_STEPS[guidedStep].stage, updatedAt: new Date().toISOString() }); };
  return <PreSalesFrame guidedMode={opportunity.guidedMode}>
    <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#061016]/92 px-4 py-3 backdrop-blur-xl"><div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3"><PreSalesBrand /><div className="flex flex-wrap items-center justify-end gap-2"><StatusBadge tone="amber">Synthetic workshop</StatusBadge><button type="button" className={preSalesButton} aria-pressed={opportunity.guidedMode} onClick={() => update({ ...opportunity, guidedMode: !opportunity.guidedMode })}>Guided Mode {opportunity.guidedMode ? "On" : "Off"}</button><button type="button" className={preSalesPrimaryButton} onClick={() => setChallengeOpen(true)}>Challenge the Solution</button><Link href="/" className={preSalesButton}>Learning Lab</Link></div></div></header>
    <SafetyNotice />
    <div className="mx-auto max-w-[1500px] px-4 py-4"><div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]"><div className="min-w-0"><ProgressNav active={opportunity.activeStage} onSelect={setStage} compact={opportunity.guidedMode} /></div><div className="flex flex-wrap items-center justify-end gap-2"><span className="text-xs font-semibold text-white">{opportunity.name}</span><StatusBadge tone={insight.confidence >= 70 ? "green" : "amber"}>{insight.confidence}% confidence</StatusBadge><StatusBadge tone={liveApiAvailable ? "green" : "slate"}>{liveApiAvailable ? "Live API ready" : "Safe demo ready"}</StatusBadge></div></div>
      {opportunity.guidedMode ? <div className="mt-4 grid gap-3 rounded-xl border border-cyan-200/15 bg-cyan-200/[0.04] p-4 md:grid-cols-[1fr_1fr]"><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-cyan-100/60">Current customer goal</p><p className="mt-2 text-lg font-semibold text-white">{opportunity.discovery.desiredBusinessOutcome || "Ask the customer to confirm the desired business outcome."}</p></div><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-cyan-100/60">Best next questions</p><ol className="mt-2 space-y-1 text-xs text-slate-300">{insight.nextQuestions.map((question, index) => <li key={question.id}>{index + 1}. {question.question}</li>)}</ol></div></div> : null}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-y border-white/[0.06] py-3"><div className="flex flex-wrap gap-2"><button type="button" className={preSalesButton} aria-pressed={opportunity.persistenceEnabled} onClick={togglePersistence}>{opportunity.persistenceEnabled ? "Saving locally" : "Save locally (off)"}</button><button type="button" className={preSalesButton} aria-pressed={opportunity.guidedFlow} onClick={() => update({ ...opportunity, guidedFlow: !opportunity.guidedFlow, guidedStep: 0, activeStage: opportunity.guidedFlow ? opportunity.activeStage : "discovery" })}>7-minute guided flow {opportunity.guidedFlow ? "On" : "Off"}</button><button type="button" className={preSalesButton} onClick={resetDemo}>Reset scenario</button><button type="button" className={preSalesButton} onClick={clearDemo}>Clear data</button></div><p className="text-[11px] text-slate-500">Persistence is opt-in. No audio, API key, or raw live transcript is saved.</p></div>
      {opportunity.guidedFlow ? <GuidedFlow opportunity={opportunity} onBack={() => advanceGuide(-1)} onNext={() => advanceGuide(1)} /> : null}
      <div className="py-8">{opportunity.activeStage === "patterns" ? <PatternLibrary onStart={start} savedOpportunity={savedOpportunity} onResume={resume} /> : null}{opportunity.activeStage === "discovery" ? <DiscoveryConsole opportunity={opportunity} onChange={change} onNext={() => nextStage("blueprint")} /> : null}{opportunity.activeStage === "blueprint" ? <SolutionBlueprint opportunity={opportunity} onNext={() => nextStage("poc")} /> : null}{opportunity.activeStage === "poc" ? <PocBuilder opportunity={opportunity} onChange={change} onNext={() => nextStage("demo")} /> : null}{opportunity.activeStage === "demo" ? <TechnicalDemoConsole opportunity={opportunity} liveApiAvailable={liveApiAvailable} openLabMode={openLabMode} onNext={() => nextStage("readout")} /> : null}{opportunity.activeStage === "readout" ? <ReadoutWorkspace opportunity={opportunity} onChange={change} /> : null}</div>
    </div>
    {challengeOpen ? <ChallengeConsole opportunity={opportunity} onChange={change} onClose={() => setChallengeOpen(false)} /> : null}
  </PreSalesFrame>;
}

function GuidedFlow({ opportunity, onBack, onNext }: { opportunity: OpportunityState; onBack: () => void; onNext: () => void }) { const step = GUIDED_STEPS[opportunity.guidedStep] ?? GUIDED_STEPS[0]; return <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-violet-200/20 bg-violet-200/[0.06] p-4"><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-violet-100/65">7-minute guided flow · {opportunity.guidedStep + 1}/{GUIDED_STEPS.length}</p><p className="mt-1 text-sm font-semibold text-white">{step.label}</p><p className="mt-1 text-xs text-slate-400">{step.cue}</p></div><div className="flex gap-2"><button type="button" className={preSalesButton} disabled={opportunity.guidedStep === 0} onClick={onBack}>Back</button><button type="button" className={preSalesPrimaryButton} disabled={opportunity.guidedStep === GUIDED_STEPS.length - 1} onClick={onNext}>Next cue</button></div></div>; }
