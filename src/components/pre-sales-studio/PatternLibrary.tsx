"use client";

import { PRE_SALES_CUSTOMER_PATTERNS } from "@/data/pre-sales-customer-patterns";
import { Panel, SafetyNotice, StatusBadge, preSalesButton, preSalesPrimaryButton } from "@/components/pre-sales-studio/PreSalesPrimitives";
import type { CustomerPatternId, OpportunityState } from "@/types/pre-sales-studio";

export function PatternLibrary({ onStart, savedOpportunity, onResume }: { onStart: (id: CustomerPatternId) => void; savedOpportunity: OpportunityState | null; onResume: () => void }) {
  return <>
    <SafetyNotice />
    <div className="mx-auto max-w-7xl px-5 py-10 sm:py-16">
      <section className="grid items-start gap-8 lg:grid-cols-[1.15fr_.85fr]">
        <div>
          <div className="flex flex-wrap gap-2"><StatusBadge tone="cyan">Interactive workshop</StatusBadge><StatusBadge tone="violet">Public patterns</StatusBadge><StatusBadge tone="green">Deterministic recommendations</StatusBadge></div>
          <h1 className="mt-6 max-w-5xl text-4xl font-semibold leading-[1.06] tracking-[-0.035em] text-white sm:text-6xl">Turn customer requirements into a <span className="text-cyan-100/70">measurable technical win.</span></h1>
          <p className="mt-6 max-w-3xl text-base leading-7 text-slate-400">Choose a public customer pattern, change the constraints, and build a discovery plan, Deepgram architecture, proof of concept, and executive recommendation in real time.</p>
          <div className="mt-8 flex flex-wrap gap-3"><button type="button" onClick={() => document.getElementById("pattern-library")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })} className={preSalesPrimaryButton}>Start a Customer Scenario</button><button type="button" onClick={() => onStart("custom")} className={preSalesButton}>Build a Custom Opportunity</button>{savedOpportunity ? <button type="button" onClick={onResume} className={preSalesButton}>Resume locally saved workshop</button> : null}</div>
        </div>
        <Panel className="p-5"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-100/60">What this demonstrates</p><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">{["Technical discovery", "Solution architecture", "Evaluation design", "API prototyping", "Business-value translation", "Objection handling", "Production handoff"].map((item, index) => <div key={item} className="flex items-center gap-3 rounded-lg border border-white/[0.07] bg-black/15 p-3"><span className="font-mono text-[10px] text-cyan-100/45">0{index + 1}</span><span className="text-sm font-semibold text-slate-200">{item}</span></div>)}</div></Panel>
      </section>

      <section id="pattern-library" className="mt-16 scroll-mt-24 border-t border-white/[0.08] pt-10" aria-labelledby="pattern-library-title">
        <div className="max-w-3xl"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-100/60">Public customer pattern library</p><h2 id="pattern-library-title" className="mt-3 text-3xl font-semibold text-white">Start with context—not a preselected answer.</h2><p className="mt-3 text-sm leading-6 text-slate-400">Only the linked public story is treated as public fact. Starting requirements, buyers, architecture, dialogue, success gates, and financial inputs are illustrative workshop material.</p></div>
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{PRE_SALES_CUSTOMER_PATTERNS.map((pattern) => <article key={pattern.id} className="flex min-h-[390px] flex-col rounded-2xl border border-white/[0.08] bg-[#071016]/82 p-5 transition hover:border-cyan-200/20"><div className="flex items-start justify-between gap-3"><StatusBadge tone="cyan">{pattern.category}</StatusBadge><span className="text-[10px] font-semibold text-amber-100/70">Public + illustrative</span></div><h3 className="mt-4 text-xl font-semibold text-white">{pattern.name}</h3><p className="mt-2 text-xs font-semibold text-slate-300">{pattern.industry}</p><p className="mt-3 text-[12px] leading-5 text-slate-400">{pattern.publicOutcomeSummary}</p><dl className="mt-4 space-y-2 border-t border-white/[0.07] pt-4 text-[11px] leading-4"><Fact label="Business outcome" value={pattern.primaryBusinessOutcome} /><Fact label="Technical buyer" value={pattern.technicalBuyer} /><Fact label="Executive buyer" value={pattern.executiveBuyer} /><Fact label="Constraint" value={pattern.majorTechnicalConstraint} /></dl><div className="mt-auto flex items-end justify-between gap-3 pt-5"><a href={pattern.source.url} target="_blank" rel="noreferrer" className="text-[10px] font-semibold text-slate-500 underline decoration-white/15 underline-offset-4 hover:text-cyan-100">Public source</a><button type="button" onClick={() => onStart(pattern.id)} className={preSalesPrimaryButton}>Start Discovery</button></div></article>)}</div>
      </section>
    </div>
  </>;
}

function Fact({ label, value }: { label: string; value: string }) { return <div><dt className="font-bold uppercase tracking-[0.1em] text-slate-600">{label}</dt><dd className="mt-1 text-slate-300">{value}</dd></div>; }
