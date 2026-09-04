"use client";

import { getCapabilities } from "@/data/deepgram-capabilities";
import { getQuestion } from "@/data/architecture-studio-discovery";
import { recommendArchitecture } from "@/lib/architecture-studio/recommendation-engine";
import { Panel, PanelHeading, StatusPill } from "@/components/architecture-studio/StudioPrimitives";
import type { PublicStudioSession, StudioRecommendationPath } from "@/types/architecture-studio";

const pathLabels: Record<StudioRecommendationPath, string> = {
  "speech-intelligence": "Speech intelligence",
  "composable-voice": "Composable voice",
  "managed-voice-agent": "Managed agent",
  "private-deployment": "Private path",
  "evaluation-first": "Evaluation first",
};

export function RecommendationPanel({ session, compact = false }: { session: PublicStudioSession; compact?: boolean }) {
  const recommendation = recommendArchitecture(session);
  const capabilities = getCapabilities(recommendation.capabilityIds);
  const maxScore = Math.max(...Object.values(recommendation.scores), 1);
  return (
    <Panel className="overflow-hidden" aria-live="polite">
      <PanelHeading eyebrow="Explainable recommendation" title={recommendation.title} detail="Current best-fit path · not a final package or commercial commitment" actions={<StatusPill tone={recommendation.confidence === "high" ? "green" : recommendation.confidence === "moderate" ? "cyan" : "amber"}>{recommendation.confidence} confidence</StatusPill>} />
      <div className="space-y-4 p-4">
        <p className="text-xs leading-5 text-slate-300">{recommendation.summary}</p>
        <p className="rounded-lg border border-white/[0.07] bg-black/20 p-2.5 text-[12px] leading-4 text-slate-400">{recommendation.confidenceReason}</p>

        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Path evidence</p>
          <div className="mt-2 space-y-2">
            {(Object.entries(recommendation.scores) as Array<[StudioRecommendationPath, number]>).sort((a, b) => b[1] - a[1]).map(([path, score]) => (
              <div key={path} className="grid grid-cols-[108px_1fr_20px] items-center gap-2 text-[11px]">
                <span className={path === recommendation.primaryPath ? "font-semibold text-white" : "text-slate-400"}>{pathLabels[path]}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-white/[0.055]"><span className={`block h-full rounded-full ${path === recommendation.primaryPath ? "bg-cyan-200" : "bg-slate-700"}`} style={{ width: `${Math.max(4, score / maxScore * 100)}%` }} /></span>
                <span className="font-mono text-slate-400">{score}</span>
              </div>
            ))}
          </div>
        </div>

        <DetailList title="Answers that influenced it" items={recommendation.influences.slice(-5).map((item) => `${getQuestion(item.questionId)?.label ?? item.questionId}: ${item.answer} — ${item.effect}`)} />
        {compact ? (
          <details className="rounded-xl border border-white/[0.08] bg-black/15 p-3">
            <summary className="cursor-pointer text-[12px] font-semibold text-cyan-100 focus-visible:outline-2 focus-visible:outline-cyan-200">Show full recommendation reasoning</summary>
            <div className="mt-4 space-y-4">
              <RecommendationReasoning recommendation={recommendation} />
            </div>
          </details>
        ) : <RecommendationReasoning recommendation={recommendation} />}

        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Deepgram capabilities to evaluate</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {capabilities.map((capability) => capability.officialDocumentation
              ? <a key={capability.id} href={capability.officialDocumentation} target="_blank" rel="noreferrer" title={capability.keyTradeoffs.join(" · ")} className="rounded-md border border-emerald-200/12 bg-emerald-200/[0.04] px-2 py-1 text-[11px] text-emerald-100/80 hover:border-emerald-200/30 focus-visible:outline-2 focus-visible:outline-emerald-200">{capability.displayName}{capability.documentationStatus === "verified" ? "" : ` · ${capability.documentationStatus.replaceAll("-", " ")}`}</a>
              : <span key={capability.id} title={capability.keyTradeoffs.join(" · ")} className="rounded-md border border-emerald-200/12 bg-emerald-200/[0.04] px-2 py-1 text-[11px] text-emerald-100/80">{capability.displayName} · confirm</span>)}
          </div>
        </div>
      </div>
      <div className="border-t border-white/[0.07] bg-black/15 p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Why did this change?</p>
        <ol className="mt-2 space-y-2">
          {session.recommendationHistory.slice(-4).reverse().map((entry) => <li key={entry.id} className="border-l border-cyan-200/20 pl-3"><p className="text-[11px] font-semibold text-cyan-100/70">{entry.title}</p><p className="mt-0.5 text-[11px] leading-4 text-slate-400">{entry.reason}</p></li>)}
        </ol>
      </div>
    </Panel>
  );
}

function RecommendationReasoning({ recommendation }: { recommendation: ReturnType<typeof recommendArchitecture> }) {
  return <>
    <DetailList title="Assumptions" items={recommendation.assumptions} tone="amber" />
    <DetailList title="Key tradeoffs" items={recommendation.tradeoffs} />
    <DetailList title="Alternatives considered" items={recommendation.alternativesConsidered.map((alternative) => `${pathLabels[alternative.path]} — ${alternative.reason}`)} tone="violet" />
    <DetailList title="What would change it" items={recommendation.changeTriggers} tone="violet" />
    <DetailList title="Unresolved questions" items={recommendation.unresolvedQuestions} tone="amber" />
  </>;
}

function DetailList({ title, items, tone = "default" }: { title: string; items: string[]; tone?: "default" | "amber" | "violet" }) {
  if (items.length === 0) return null;
  const dot = tone === "amber" ? "bg-amber-300" : tone === "violet" ? "bg-violet-300" : "bg-cyan-300";
  return <div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{title}</p><ul className="mt-2 space-y-1.5">{items.map((item, index) => <li key={`${index}-${item}`} className="flex gap-2 text-[11px] leading-4 text-slate-400"><span className={`mt-1.5 size-1 shrink-0 rounded-full ${dot}`} />{item}</li>)}</ul></div>;
}
