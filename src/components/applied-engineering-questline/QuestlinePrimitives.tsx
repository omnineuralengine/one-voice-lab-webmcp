"use client";

import type { ReactNode } from "react";

import { ProvenanceBadge } from "@/components/applied-voice-systems/AcademyPrimitives";
import { sanitizeSnippet } from "@/lib/code-lab-launch-context";
import type { ExperienceStatus, QuestStatus } from "@/types/questline";

export const questButtonClassName = "rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-2 text-[10px] font-semibold text-slate-300 transition hover:border-cyan-300/25 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-200 disabled:cursor-not-allowed disabled:opacity-40";
export const questPrimaryButtonClassName = "rounded-md bg-cyan-200 px-3 py-2 text-[10px] font-bold text-slate-950 transition hover:bg-cyan-100 focus-visible:outline-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-40";
export const questInputClassName = "h-9 w-full rounded-md border border-white/10 bg-[#02070c] px-2 text-[10px] text-slate-200 outline-none placeholder:text-slate-700 focus-visible:border-cyan-300/45 focus-visible:ring-1 focus-visible:ring-cyan-300/20";
export const questTextareaClassName = "w-full resize-y rounded-md border border-white/10 bg-[#02070c] p-2 text-[10px] leading-4 text-slate-200 outline-none placeholder:text-slate-700 focus-visible:border-cyan-300/45 focus-visible:ring-1 focus-visible:ring-cyan-300/20";

export function QuestPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-white/10 bg-[#050b11]/90 ${className}`}>{children}</section>;
}

export function QuestPanelHeader({ eyebrow, title, detail, actions }: { eyebrow: string; title: string; detail?: string; actions?: ReactNode }) {
  return <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-white/10 px-3 py-2.5"><div className="min-w-0"><p className="text-[8px] font-bold uppercase tracking-[0.18em] text-cyan-200/55">{eyebrow}</p><h3 className="mt-0.5 text-sm font-semibold text-white">{title}</h3>{detail ? <p className="mt-1 text-[9px] leading-4 text-slate-500">{detail}</p> : null}</div>{actions ? <div className="flex flex-wrap items-center gap-1.5">{actions}</div> : null}</div>;
}

export function StatusBadge({ value }: { value: ExperienceStatus | QuestStatus | string }) {
  const label = value.replaceAll("-", " ");
  if (value === "completed" || value === "executable") return <ProvenanceBadge value="working" />;
  if (value === "practiced") return <ProvenanceBadge value="measured" />;
  if (value === "simulated") return <ProvenanceBadge value="simulated" />;
  if (value === "docs-verification-required" || value === "needs-review" || value === "not-installed") return <ProvenanceBadge value={label} />;
  return <ProvenanceBadge value={value === "not-started" ? "not started" : value === "conceptual" ? "architectural concept" : label} />;
}

export function QuestField({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return <label className="block min-w-0"><span className="text-[8px] font-bold uppercase tracking-[0.13em] text-slate-500">{label}</span>{help ? <span title={help} className="ml-1 text-[8px] text-slate-700">ⓘ</span> : null}<span className="mt-1 block">{children}</span></label>;
}

export function CodeBlock({ code, label, highlightedLines = [] }: { code: string; label: string; highlightedLines?: number[] }) {
  return <div className="overflow-hidden rounded-lg border border-white/10 bg-[#01050a]"><div className="flex items-center justify-between border-b border-white/10 px-3 py-2"><span className="text-[8px] font-bold uppercase tracking-wide text-slate-500">{label}</span><span className="font-mono text-[8px] text-emerald-200/55">placeholders only</span></div><pre className="max-h-[44vh] overflow-auto py-2 font-mono text-[9px] leading-4 text-slate-300">{code.split("\n").map((line, index) => <span key={`${index}-${line}`} className={`grid grid-cols-[34px_minmax(0,1fr)] px-2 ${highlightedLines.includes(index + 1) ? "bg-cyan-300/[0.10] text-cyan-50" : ""}`}><span className="select-none pr-2 text-right text-slate-700">{index + 1}</span><code className="whitespace-pre-wrap break-words">{line || " "}</code></span>)}</pre></div>;
}

export function CompactList({ title, items, tone = "default", mono = false }: { title: string; items: string[]; tone?: "default" | "amber" | "cyan"; mono?: boolean }) {
  const border = tone === "amber" ? "border-amber-300/15" : tone === "cyan" ? "border-cyan-300/15" : "border-white/[0.08]";
  return <div className={`rounded-lg border bg-black/15 p-3 ${border}`}><p className="text-[8px] font-bold uppercase tracking-wide text-slate-500">{title}</p><ul className={`mt-2 space-y-1 text-[9px] leading-4 text-slate-400 ${mono ? "font-mono" : ""}`}>{items.map((item) => <li key={item} className="flex gap-2"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-cyan-300/50" /><span>{item}</span></li>)}</ul></div>;
}

export function downloadQuestlineFile(filename: string, content: string, contentType: string) {
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  const contentWithMetadata = addQuestlineExportMetadata(safeFilename, content, contentType);
  const blob = new Blob([sanitizeSnippet(contentWithMetadata)], { type: contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeFilename;
  anchor.click();
  // Give the browser time to consume the object URL before releasing it.
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function addQuestlineExportMetadata(filename: string, content: string, contentType: string) {
  const status = inferExportStatus(filename, content);
  const metadata = {
    generated: true,
    status,
    verification:
      status === "measured"
        ? "browser-measured-local-evidence"
        : status === "simulated"
          ? "deterministic-local-fixture"
          : "official-docs-review-required-before-production",
  };

  if (contentType.includes("json")) {
    try {
      const parsed = JSON.parse(content) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return JSON.stringify({ _metadata: metadata, ...parsed }, null, 2);
      }
    } catch {
      // Keep malformed educational content readable and sanitized as plain text.
    }
  }

  const metadataBlock = `- Generated: yes\n- Status: ${metadata.status}\n- Verification: ${metadata.verification}`;
  const firstLineBreak = content.indexOf("\n");
  if (firstLineBreak < 0) return `${content}\n\n${metadataBlock}\n`;
  return `${content.slice(0, firstLineBreak)}\n\n${metadataBlock}\n${content.slice(firstLineBreak).trimStart()}`;
}

function inferExportStatus(filename: string, content: string) {
  const provenance = /(?:^|\n)-?\s*Provenance:\s*([^\r\n]+)/iu.exec(content)?.[1]?.trim();
  if (provenance === "measured" || provenance === "simulated") return provenance;
  if (filename.includes("incident") || filename.includes("audio-diagnosis")) return "simulated";
  if (filename.includes("progress") || filename.includes("learning-notes")) return "local-only";
  return "needs-verification";
}
