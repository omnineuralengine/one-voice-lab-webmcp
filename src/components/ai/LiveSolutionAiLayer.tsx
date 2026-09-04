"use client";

import { AiReasoningPanel } from "@/components/ai/AiReasoningPanel";
import { buildLiveSolutionAiContext } from "@/lib/ai/context";
import type { SolutionCaseBundle } from "@/types/live-solution-case";
import type { SolutionBrief } from "@/types/live-solution-studio";

export function LiveSolutionAiLayer({ bundle, brief, onAcceptProposal }: { bundle: SolutionCaseBundle; brief: SolutionBrief; onAcceptProposal: (proposal: string) => void }) {
  const context = buildLiveSolutionAiContext(bundle, brief);
  return <div className="mt-4 space-y-4"><div className="rounded-xl border border-emerald-200/15 bg-emerald-200/[.03] p-3"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-emerald-200">Deterministic Lab result remains authoritative</p><p className="mt-1 text-xs leading-5 text-slate-400">The AI reviews a sanitized projection after the local engine runs. A failed AI request cannot remove or change the brief above.</p></div><AiReasoningPanel title="AI Second Opinion" description="Compare the deterministic brief with an independent reasoning pass. Disagreement is a hypothesis to test, not an automatic correction." feature="second-opinion" reasoningClass="DEEP" context={context} prompts={["Challenge the deterministic recommendation.", "What evidence gap matters most?", "What would Security ask?", "Where is latency probably coming from?"]} onAcceptProposal={onAcceptProposal}/><AiReasoningPanel title="AI POC Generator" description="Generate a reviewable test plan from the same sanitized evidence. Unknown targets remain Target to confirm." feature="poc-generator" reasoningClass="DEEP" context={context} prompts={["Generate a defensible POC from this case.", "Create the smallest representative test matrix."]} onAcceptProposal={onAcceptProposal}/></div>;
}
