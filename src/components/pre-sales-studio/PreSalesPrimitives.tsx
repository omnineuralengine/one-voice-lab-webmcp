import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { ModulePageShell } from "@/components/one";
import type { PreSalesStageId } from "@/types/pre-sales-studio";

export const preSalesButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.055] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-cyan-200/30 hover:bg-cyan-200/[0.08] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 disabled:cursor-not-allowed disabled:opacity-45";
export const preSalesPrimaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-cyan-200/35 bg-cyan-200 px-4 py-2 text-xs font-bold text-slate-950 shadow-[0_8px_30px_rgba(34,211,238,0.12)] transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-100 disabled:cursor-not-allowed disabled:opacity-45";
export const preSalesInput = "min-h-11 w-full rounded-lg border border-white/10 bg-[#03080d] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-200/45 focus:ring-2 focus:ring-cyan-200/10";
export const preSalesTextarea = `${preSalesInput} min-h-24 resize-y`;

export const PRE_SALES_STAGES: Array<{ id: PreSalesStageId; label: string; short: string }> = [
  { id: "patterns", label: "Customer pattern", short: "Pattern" },
  { id: "discovery", label: "Technical discovery", short: "Discover" },
  { id: "blueprint", label: "Solution blueprint", short: "Design" },
  { id: "poc", label: "Proof of concept", short: "Measure" },
  { id: "demo", label: "Technical demo", short: "Demo" },
  { id: "readout", label: "Readout and handoff", short: "Align" },
];

export function PreSalesFrame({ children, guidedMode = false }: { children: ReactNode; guidedMode?: boolean }) {
  return <ModulePageShell className={`min-h-screen bg-[#020608] text-slate-100 ${guidedMode ? "text-[1.06rem]" : ""}`} evolutionModuleId="pre-sales"><div className="min-h-screen bg-[radial-gradient(circle_at_12%_0%,rgba(34,211,238,.08),transparent_28%),radial-gradient(circle_at_90%_8%,rgba(139,92,246,.07),transparent_26%),linear-gradient(180deg,#071016_0%,#020608_58%)]">{children}</div></ModulePageShell>;
}

export function PreSalesBrand() {
  return <Link href="/pre-sales-studio" className="group flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-cyan-200"><span className="relative flex size-10 shrink-0 items-center justify-center rounded-xl border border-cyan-200/25 bg-cyan-200/[0.08]"><span className="absolute inset-2 rounded border border-cyan-200/25" /><span className="h-px w-5 bg-cyan-100" /><span className="absolute h-5 w-px bg-violet-200/75" /></span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-white">Deepgram Pre-Sales Solution Studio</span><span className="block truncate text-[11px] uppercase tracking-[0.16em] text-slate-400">From First Question to Technical Win</span></span></Link>;
}

export function SafetyNotice() {
  return <div className="border-y border-amber-200/10 bg-amber-200/[0.035] px-4 py-2 text-center text-[11px] leading-4 text-amber-50/75">Public-story-inspired patterns · Unpublished requirements, architecture, dialogue, and calculations are simulated · Technical and commercial validation required · Do not enter real customer secrets or personal data</div>;
}

export function Panel({ children, className = "", ...props }: ComponentPropsWithoutRef<"section">) {
  return <section {...props} className={`rounded-2xl border border-white/[0.08] bg-[#071016]/86 shadow-[0_18px_80px_rgba(0,0,0,.22)] ${className}`}>{children}</section>;
}

export function StatusBadge({ children, tone = "slate" }: { children: ReactNode; tone?: "cyan" | "green" | "amber" | "rose" | "violet" | "slate" }) {
  const tones = { cyan: "border-cyan-200/20 bg-cyan-200/[0.08] text-cyan-100", green: "border-emerald-200/20 bg-emerald-200/[0.08] text-emerald-100", amber: "border-amber-200/20 bg-amber-200/[0.08] text-amber-100", rose: "border-rose-200/20 bg-rose-200/[0.08] text-rose-100", violet: "border-violet-200/20 bg-violet-200/[0.08] text-violet-100", slate: "border-white/10 bg-white/[0.045] text-slate-300" };
  return <span className={`inline-flex min-h-7 items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${tones[tone]}`}>{children}</span>;
}

export function ProgressNav({ active, onSelect, compact = false }: { active: PreSalesStageId; onSelect: (stage: PreSalesStageId) => void; compact?: boolean }) {
  const activeIndex = PRE_SALES_STAGES.findIndex((stage) => stage.id === active);
  return <nav aria-label="Pre-sales workshop progress" className="overflow-x-auto"><ol className="flex min-w-max items-center gap-1.5">{PRE_SALES_STAGES.map((stage, index) => <li key={stage.id}><button type="button" onClick={() => onSelect(stage.id)} aria-current={active === stage.id ? "step" : undefined} className={`rounded-lg border px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-cyan-200 ${active === stage.id ? "border-cyan-200/35 bg-cyan-200/[0.1] text-white" : index < activeIndex ? "border-emerald-200/15 bg-emerald-200/[0.04] text-emerald-100" : "border-white/[0.07] bg-black/15 text-slate-400"}`}><span className="mr-2 font-mono text-[10px] opacity-65">{String(index + 1).padStart(2, "0")}</span><span className="text-xs font-semibold">{compact ? stage.short : stage.label}</span></button></li>)}</ol></nav>;
}

export function SectionHeading({ eyebrow, title, detail, actions }: { eyebrow: string; title: string; detail?: string; actions?: ReactNode }) {
  return <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-100/65">{eyebrow}</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-white">{title}</h2>{detail ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{detail}</p> : null}</div>{actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}</div>;
}
