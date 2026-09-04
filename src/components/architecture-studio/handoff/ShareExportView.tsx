"use client";

import { useRef, useState } from "react";

import { StatusPill, studioButton, studioPrimaryButton } from "@/components/architecture-studio/StudioPrimitives";
import { evaluateDemoHealth } from "@/lib/architecture-studio/demo-health";
import {
  buildPortableSessionExport,
  decisionActionCsv,
  decisionActionMarkdown,
  safeFileStem,
  sessionReportHtml,
  sessionReportMarkdown,
  validatePortableSessionExport,
} from "@/lib/architecture-studio/handoff-exports";
import type { PublicStudioSession } from "@/types/architecture-studio";
import type {
  ExecutiveSummaryModel,
  HandoffAction,
  ProofOfConceptPlanModel,
  SessionReportModel,
  TechnicalHandoffModel,
} from "@/types/architecture-studio-handoff";

export function ShareExportView({
  session,
  summary,
  handoff,
  plan,
  report,
  onAction,
  onImport,
}: {
  session: PublicStudioSession;
  summary: ExecutiveSummaryModel;
  handoff: TechnicalHandoffModel;
  plan: ProofOfConceptPlanModel;
  report: SessionReportModel;
  onAction: (action: HandoffAction) => void;
  onImport: (payload: unknown) => Promise<void>;
}) {
  const [localReady, setLocalReady] = useState(false);
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const includeNotes = session.handoffState.includeOperatorNotesInExport;
  const health = evaluateDemoHealth(session, localReady);
  const stem = safeFileStem(session.scenarioName);

  function checkLocalPersistence() {
    try {
      const key = "deepgram-architecture-studio:health-check";
      window.localStorage.setItem(key, "ready");
      setLocalReady(window.localStorage.getItem(key) === "ready");
      window.localStorage.removeItem(key);
    } catch {
      setLocalReady(false);
    }
  }

  async function copy(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(`${label} copied.`);
    } catch {
      setMessage("Clipboard access was blocked. Use the download action instead.");
    }
  }

  async function importSession(file: File | undefined) {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text()) as unknown;
      if (!validatePortableSessionExport(payload)) throw new Error("invalid");
      if (!window.confirm("Replace discovery, architecture, simulation, handoff, decisions, and rehearsal state with this validated synthetic export? The shared session identity and participants will be preserved.")) return;
      await onImport(payload);
      setMessage("Validated session imported. Shared session identity and participants were preserved.");
    } catch {
      setMessage("Import rejected. Select a validated Architecture Studio session JSON file with no credential fields.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function printReport() {
    const blob = new Blob([sessionReportHtml(report)], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    setMessage(popup ? "Printable report opened in a new tab. Use the browser print dialog to save PDF." : "The browser blocked the report tab. Allow popups and retry.");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  const warnings = [
    ...(summary.confidence === "low" || summary.confidence === "developing" ? [`Recommendation confidence is ${summary.confidence}.`] : []),
    ...(summary.keyRisks.length ? [`${summary.keyRisks.length} risk or unresolved assumption item(s) remain.`] : []),
    ...(includeNotes ? ["Operator notes are enabled for exports."] : []),
  ];

  return (
    <div className="space-y-4">
      <DemoHealth health={health} onCheck={checkLocalPersistence} />
      <section className="rounded-xl border border-amber-200/15 bg-amber-200/[0.035] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-amber-50">Export safety review</h2>
            <ul className="mt-2 space-y-1 text-[11px] leading-5 text-slate-300">
              <li>— Every export is labeled as synthetic.</li>
              <li>— Presenter/participant tokens, credentials, and hidden scenario details are excluded.</li>
              <li>— Confirmed facts remain distinct from recommendations and assumptions.</li>
              {warnings.map((warning) => <li key={warning}>— {warning}</li>)}
            </ul>
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-white/10 p-3 text-[11px] text-slate-300">
            <input type="checkbox" checked={includeNotes} onChange={(event) => onAction({ type: "set-include-operator-notes", include: event.target.checked })} />
            Include operator notes (off by default)
          </label>
        </div>
      </section>
      {message ? <p role="status" aria-live="polite" className="rounded-lg border border-cyan-200/15 bg-cyan-200/[0.04] p-3 text-[11px] text-cyan-100">{message}</p> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ExportCard title="Complete session JSON" detail="Validated discovery, recommendations, canvas revisions, simulation, decisions, actions, and rehearsal state. Participant names are anonymized." actions={<><button type="button" onClick={() => download(`${stem}-session.json`, JSON.stringify(buildPortableSessionExport(session, includeNotes), null, 2), "application/json")} className={studioPrimaryButton}>Download JSON</button><button type="button" onClick={() => inputRef.current?.click()} className={studioButton}>Import JSON</button><input ref={inputRef} type="file" accept="application/json,.json" className="sr-only" onChange={(event) => void importSession(event.target.files?.[0])} /></>} />
        <ExportCard title="Executive summary" detail="Audience-adapted Markdown and copyable plain text; same underlying facts in every mode." actions={<><button type="button" onClick={() => void copy("Executive summary", summary.plainText)} className={studioButton}>Copy plain text</button><button type="button" onClick={() => download(`${stem}-executive-summary.md`, summary.markdown, "text/markdown")} className={studioButton}>Markdown</button></>} />
        <ExportCard title="Technical handoff" detail="Traceable components, protocols, ownership, revisions, dependencies, and open questions." actions={<button type="button" onClick={() => download(`${stem}-technical-handoff.md`, handoff.markdown, "text/markdown")} className={studioButton}>Download Markdown</button>} />
        <ExportCard title="Proof-of-concept plan" detail="Scope, inputs, test scenarios, editable criteria, prerequisites, and exit states." actions={<button type="button" onClick={() => download(`${stem}-poc-plan.md`, plan.markdown, "text/markdown")} className={studioButton}>Download Markdown</button>} />
        <ExportCard title="Decision + action register" detail="Synthetic owners/timing labeled in both Markdown and a spreadsheet-friendly CSV." actions={<><button type="button" onClick={() => download(`${stem}-registers.csv`, decisionActionCsv(session), "text/csv")} className={studioButton}>Download CSV</button><button type="button" onClick={() => download(`${stem}-registers.md`, decisionActionMarkdown(session), "text/markdown")} className={studioButton}>Markdown</button></>} />
        <ExportCard title="Full session report" detail="A standalone printable HTML report with the complete customer-to-implementation narrative." actions={<><button type="button" onClick={printReport} className={studioPrimaryButton}>Open printable report</button><button type="button" onClick={() => download(`${stem}-session-report.md`, sessionReportMarkdown(report), "text/markdown")} className={studioButton}>Markdown</button></>} />
      </div>
    </div>
  );
}

function DemoHealth({ health, onCheck }: { health: ReturnType<typeof evaluateDemoHealth>; onCheck: () => void }) {
  return <section className="rounded-xl border border-white/[0.08] bg-black/15 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-100/65">Offline demo health</p><h2 className="mt-1 text-sm font-semibold text-white">Guided flow {health.status}</h2></div><div className="flex items-center gap-2"><StatusPill tone={health.status === "ready" ? "green" : health.status === "warning" ? "amber" : "rose"}>{health.status}</StatusPill><button type="button" onClick={onCheck} className={studioButton}>Run local preflight</button></div></div><div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{health.checks.map((check) => <div key={check.id} className="rounded-lg border border-white/[0.07] p-3"><p className="text-[11px] font-semibold text-slate-200">{check.status === "ready" ? "Ready" : check.status === "warning" ? "Review" : "Blocked"} · {check.label}</p><p className="mt-1 text-[10px] leading-4 text-slate-500">{check.detail}</p></div>)}</div></section>;
}

function ExportCard({ title, detail, actions }: { title: string; detail: string; actions: React.ReactNode }) {
  return <section className="flex min-h-48 flex-col rounded-xl border border-white/[0.08] bg-black/15 p-4"><h3 className="text-sm font-semibold text-white">{title}</h3><p className="mt-2 flex-1 text-[11px] leading-5 text-slate-400">{detail}</p><div className="mt-4 flex flex-wrap gap-2">{actions}</div></section>;
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
