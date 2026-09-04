"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { AiReasoningPanel } from "@/components/ai/AiReasoningPanel";

export function AppliedVoiceCopilot({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const moduleName = pathname === "/" ? "Lab overview" : pathname.split("/").filter(Boolean).join(" / ").replaceAll("-", " ");
  const close = useCallback(() => {
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
    };
    document.addEventListener("keydown", handleEscape, { capture: true });
    return () => document.removeEventListener("keydown", handleEscape, { capture: true });
  }, [close, open]);

  return (
    <aside className="applied-voice-copilot fixed bottom-4 right-4 z-[65] w-[min(430px,calc(100vw-2rem))]" aria-label="Applied Voice Copilot">
      {open ? <div id="applied-voice-copilot-panel" className="max-h-[75vh] overflow-y-auto rounded-2xl border border-violet-200/25 bg-[#071016]/98 p-2 shadow-2xl backdrop-blur"><div className="mb-2 flex items-center justify-between px-2 pt-1"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-violet-200">Applied Voice Copilot</p><p className="text-[10px] text-slate-500">{enabled ? "AI layer available when Gateway authentication succeeds" : "AI disabled · deterministic Lab unaffected"}</p></div><button type="button" className="rounded-md px-3 py-2 text-xs text-slate-300 hover:bg-white/[.05] focus-visible:outline-2 focus-visible:outline-violet-200" onClick={close} aria-label="Close Applied Voice Copilot">Close</button></div><AiReasoningPanel compact title={`Reason about ${moduleName}`} description="Context-aware teaching and critique. It cannot execute provider calls or modify Lab evidence." feature="copilot" reasoningClass="FAST" context={{ moduleId: pathname, moduleName, summary: `The visitor is currently viewing ${pathname}.`, facts: [], assumptions: [], openQuestions: [], architecture: [], risks: [], evidence: [] }} prompts={["What should I test next?", "Explain this module", "What am I missing?", "Which Lab module should I open?"]}/><a href="/ai-observatory" className="mx-2 mb-2 mt-3 block rounded-md border border-white/10 px-3 py-2 text-center text-[10px] text-slate-400 focus-visible:outline-2 focus-visible:outline-violet-200">Open session usage metadata</a></div> : null}
      <button ref={triggerRef} hidden={open} type="button" className="applied-voice-copilot__trigger ml-auto flex min-h-12 items-center gap-2 rounded-full border border-violet-200/25 bg-[#0b1020]/95 px-4 py-3 text-xs font-semibold text-violet-50 shadow-2xl hover:border-violet-200/45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-200" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="applied-voice-copilot-panel"><span aria-hidden="true" className="size-2 rounded-full bg-violet-300"/><span className="applied-voice-copilot__label applied-voice-copilot__label--full">Applied Voice Copilot</span><span className="applied-voice-copilot__label applied-voice-copilot__label--compact">Copilot</span></button>
    </aside>
  );
}
