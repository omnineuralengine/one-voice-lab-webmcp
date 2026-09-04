"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import type { CodeLabDraftSummary } from "@/lib/code-lab-storage";
import type { CodeLabLaunchContext, CodeLabLaunchMode } from "@/types/code-lab-launch-context";

export function CodeLabLaunchDialog({
  context,
  draftSummary,
  onConfirm,
  onCancel,
  returnFocusTo,
}: {
  context: CodeLabLaunchContext;
  draftSummary: CodeLabDraftSummary;
  onConfirm: (mode: CodeLabLaunchMode) => void;
  onCancel: () => void;
  returnFocusTo: HTMLElement | null;
}) {
  const [mode, setMode] = useState<CodeLabLaunchMode>("temporary");
  const temporaryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    temporaryRef.current?.focus();
    return () => returnFocusTo?.focus();
  }, [returnFocusTo]);

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/75 p-4 backdrop-blur-sm"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
      data-testid="code-lab-launch-backdrop"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="code-lab-launch-title"
        aria-describedby="code-lab-launch-description"
        className="flex max-h-[min(700px,calc(100vh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-cyan-300/25 bg-[#071018] shadow-[0_32px_120px_rgba(0,0,0,.7)]"
        data-testid="code-lab-launch-dialog"
      >
        <header className="shrink-0 border-b border-white/10 px-5 py-4">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-cyan-200/65">Sanitized in-memory handoff</p>
          <h2 id="code-lab-launch-title" className="mt-1 text-lg font-semibold text-white">Open this quest in Code Lab</h2>
          <p id="code-lab-launch-description" className="mt-1 text-xs leading-5 text-slate-400">
            Review the generated starter context and choose how it should coexist with your local drafts. No code will run.
          </p>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <dl className="grid gap-2 text-xs sm:grid-cols-2" data-testid="launch-context-summary">
            <Summary label="Language" value={context.language} />
            <Summary label="Framework / runtime" value={[context.framework, context.runtime].filter(Boolean).join(" · ") || "Not specified"} />
            <Summary label="Workflow" value={context.workflow.title} />
            <Summary label="Generated files" value={String(context.files.length)} />
            {context.workflow.audioSource ? <Summary label="Audio source" value={context.workflow.audioSource} /> : null}
            <Summary label="Deepgram capabilities" value={context.workflow.deepgramCapabilities.join(", ")} wide />
          </dl>

          <div className="rounded-lg border border-amber-300/15 bg-amber-300/[0.05] p-3">
            <p className="text-[9px] font-bold uppercase tracking-wide text-amber-100/75">Security boundary</p>
            <ul className="mt-2 space-y-1 text-[11px] leading-4 text-amber-50/75">
              {context.securityWarnings.slice(0, 4).map((warning) => <li key={warning}>• {warning}</li>)}
            </ul>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/20 p-3" aria-live="polite">
            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Existing Code Lab draft status</p>
            <p className="mt-1 text-xs text-slate-300">
              {draftSummary.hasLocalWork
                ? `${draftSummary.draftCount} standard draft(s), ${draftSummary.importedDraftCount} imported draft(s)${draftSummary.hasCustomFiles ? ", custom files" : ""}${draftSummary.hasCustomPatterns ? ", custom patterns" : ""}${draftSummary.hasRecipe ? ", and an active recipe" : ""}.`
                : "No modified Code Lab drafts or custom files were detected."}
            </p>
            <p className="mt-1 text-[10px] leading-4 text-slate-500">Your stored work is never deleted by this launch dialog.</p>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Workspace behavior</legend>
            <LaunchChoice
              inputRef={temporaryRef}
              checked={mode === "temporary"}
              value="temporary"
              title="Open as a new temporary workspace"
              detail="Recommended. Isolates generated files in memory until you explicitly save a sanitized local draft."
              onChange={setMode}
            />
            <LaunchChoice
              checked={mode === "merge"}
              value="merge"
              title="Merge generated files"
              detail="Keeps existing files in view. Duplicate generated paths receive deterministic import paths instead of overwriting local work."
              onChange={setMode}
            />
            <LaunchChoice
              checked={mode === "replace"}
              value="replace"
              title="Replace workspace"
              detail="Replaces only the current in-memory Code Lab view. Existing localStorage drafts remain untouched."
              onChange={setMode}
            />
          </fieldset>
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-white/10 bg-black/20 px-5 py-4">
          <button type="button" onClick={onCancel} className="h-9 rounded-md border border-white/10 px-3 text-xs font-semibold text-slate-300 hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-cyan-200">Cancel</button>
          <button type="button" onClick={() => onConfirm(mode)} className="h-9 rounded-md bg-cyan-200 px-4 text-xs font-bold text-slate-950 hover:bg-white focus-visible:outline-2 focus-visible:outline-white" data-testid="confirm-code-lab-launch">Open in Code Lab</button>
        </footer>
      </section>
    </div>
  );
}

function LaunchChoice({
  checked,
  value,
  title,
  detail,
  onChange,
  inputRef,
}: {
  checked: boolean;
  value: CodeLabLaunchMode;
  title: string;
  detail: string;
  onChange: (value: CodeLabLaunchMode) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  return (
    <label className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${checked ? "border-cyan-300/35 bg-cyan-300/[0.08]" : "border-white/[0.08] bg-black/15 hover:border-white/15"}`}>
      <input ref={inputRef} type="radio" name="code-lab-launch-mode" value={value} checked={checked} onChange={() => onChange(value)} className="mt-0.5 accent-cyan-200" />
      <span>
        <span className="block text-xs font-semibold text-slate-100">{title}</span>
        <span className="mt-1 block text-[10px] leading-4 text-slate-500">{detail}</span>
      </span>
    </label>
  );
}

function Summary({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-md border border-white/[0.07] bg-black/20 p-2.5 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="text-[8px] font-bold uppercase tracking-wide text-slate-600">{label}</dt>
      <dd className="mt-1 break-words text-[11px] leading-4 text-slate-300">{value}</dd>
    </div>
  );
}
