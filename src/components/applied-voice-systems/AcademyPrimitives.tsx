"use client";

import type { ReactNode } from "react";

export type AcademyProvenance =
  | "working"
  | "measured"
  | "derived"
  | "simulated"
  | "local simulation"
  | "example response"
  | "architectural concept"
  | "third-party concept"
  | "unavailable"
  | "docs verification required";

export function ProvenanceBadge({ value }: { value: AcademyProvenance | string }) {
  const normalized = value.toLowerCase();
  const classes = normalized === "working" || normalized === "measured"
    ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
    : normalized === "derived"
      ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
      : normalized.includes("simulat") || normalized.includes("example")
        ? "border-violet-300/25 bg-violet-300/10 text-violet-100"
        : normalized.includes("unavailable") || normalized.includes("verification")
          ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
          : "border-white/10 bg-white/[0.04] text-slate-400";
  return <span className={`inline-flex rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ${classes}`}>{value}</span>;
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-white/10 bg-[#050b11]/88 ${className}`}>{children}</section>;
}

export function PanelHeading({ eyebrow, title, detail, actions }: { eyebrow?: string; title: string; detail?: string; actions?: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-white/10 px-3 py-2.5">
      <div className="min-w-0">
        {eyebrow ? <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-cyan-200/60">{eyebrow}</p> : null}
        <h3 className="mt-0.5 text-sm font-semibold text-white">{title}</h3>
        {detail ? <p className="mt-1 text-[10px] leading-4 text-slate-500">{detail}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}

export function FieldLabel({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      {help ? <span className="ml-1 text-[9px] normal-case tracking-normal text-slate-700" title={help}>ⓘ</span> : null}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

export const inputClassName = "h-9 w-full rounded-md border border-white/10 bg-[#03080d] px-2 text-[11px] text-slate-200 outline-none placeholder:text-slate-700 focus-visible:border-cyan-300/45 focus-visible:ring-1 focus-visible:ring-cyan-300/20";
export const textareaClassName = "w-full resize-y rounded-md border border-white/10 bg-[#03080d] p-2 text-[11px] leading-4 text-slate-200 outline-none placeholder:text-slate-700 focus-visible:border-cyan-300/45 focus-visible:ring-1 focus-visible:ring-cyan-300/20";
export const buttonClassName = "rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-2 text-[10px] font-semibold text-slate-300 transition hover:border-cyan-300/25 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-200 disabled:cursor-not-allowed disabled:opacity-40";
export const primaryButtonClassName = "rounded-md bg-cyan-200 px-3 py-2 text-[10px] font-bold text-slate-950 transition hover:bg-cyan-100 focus-visible:outline-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-40";

export function JsonView({ value, label = "Sanitized JSON", maxHeight = "max-h-80" }: { value: unknown; label?: string; maxHeight?: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-[#02060b]">
      <div className="border-b border-white/10 px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <pre className={`${maxHeight} overflow-auto p-3 font-mono text-[10px] leading-4 text-slate-300`}>{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

export function MetricTile({ label, value, provenance, detail }: { label: string; value: string; provenance: AcademyProvenance | string; detail?: string }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-black/20 p-2.5">
      <div className="flex items-center justify-between gap-2"><p className="text-[9px] uppercase tracking-wide text-slate-600">{label}</p><ProvenanceBadge value={provenance} /></div>
      <p className="mt-2 font-mono text-lg font-semibold text-white">{value}</p>
      {detail ? <p className="mt-1 text-[9px] leading-3.5 text-slate-600">{detail}</p> : null}
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="rounded-lg border border-dashed border-white/10 bg-black/15 px-4 py-8 text-center"><p className="text-xs font-semibold text-slate-300">{title}</p><p className="mx-auto mt-2 max-w-sm text-[10px] leading-4 text-slate-600">{detail}</p></div>;
}

export function downloadTextFile(filename: string, content: string, contentType: string) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "applied-voice-export";
}
