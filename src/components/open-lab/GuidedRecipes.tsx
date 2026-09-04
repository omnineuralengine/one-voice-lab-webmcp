"use client";

import Link from "next/link";

import type { LabModuleId } from "@/lib/code-snippets";

type GuidedRecipesProps = {
  onOpenModule: (module: LabModuleId) => void;
};

const MODULE_RECIPES: Array<{
  title: string;
  description: string;
  steps: string;
  module: LabModuleId;
}> = [
  {
    title: "Speak and See",
    description: "Grant microphone permission, start one realtime session, and inspect its transcript and event trace.",
    steps: "Live Mic → transcript → trace",
    module: "live-mic",
  },
  {
    title: "Hear the Difference",
    description: "Keep one input locked while comparing Cole and Jack with measured request timing.",
    steps: "Same text → Cole / Jack → A/B",
    module: "flux-tts",
  },
  {
    title: "Audio Diagnosis",
    description: "Inspect a known sample before explicitly handing it to speech recognition.",
    steps: "Sample → signal check → STT handoff",
    module: "audio-signal-lab",
  },
];

export function GuidedRecipes({ onOpenModule }: GuidedRecipesProps) {
  return (
    <section aria-labelledby="guided-recipes-title" className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--one-purple-text,#d9b8ff)]">Guided recipes</p>
          <h3 id="guided-recipes-title" className="mt-1 text-lg font-semibold text-white">Try a 60-second flow</h3>
        </div>
        <p className="max-w-md text-xs leading-5 text-slate-400">Nothing runs automatically. You explicitly advance every live or billable step.</p>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {MODULE_RECIPES.map((recipe, index) => (
          <button
            key={recipe.title}
            type="button"
            onClick={() => onOpenModule(recipe.module)}
            className="rounded-lg border border-white/10 bg-black/20 p-3 text-left transition hover:border-[color:var(--one-purple)] hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--one-purple-text,#d9b8ff)]"
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">0{index + 1}</span>
            <strong className="mt-2 block text-sm text-white">{recipe.title}</strong>
            <span className="mt-1 block text-xs leading-5 text-slate-400">{recipe.description}</span>
            <span className="mt-3 block text-[10px] font-semibold text-[var(--one-green-text,#62d8ad)]">{recipe.steps}</span>
          </button>
        ))}
        <Link
          href="/live-solution-studio?recipe=question-to-architecture"
          className="rounded-lg border border-white/10 bg-black/20 p-3 text-left transition hover:border-[color:var(--one-purple)] hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--one-purple-text,#d9b8ff)]"
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">04</span>
          <strong className="mt-2 block text-sm text-white">From Question to Architecture</strong>
          <span className="mt-1 block text-xs leading-5 text-slate-400">Start with a fictional customer question, shape the solution, then open the architecture canvas and preview a deliverable.</span>
          <span className="mt-3 block text-[10px] font-semibold text-[var(--one-green-text,#62d8ad)]">Synthetic question → Studio → Architecture</span>
        </Link>
      </div>
    </section>
  );
}
