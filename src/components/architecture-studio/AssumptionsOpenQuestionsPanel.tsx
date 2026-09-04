import { Panel, PanelHeading, StatusPill } from "@/components/architecture-studio/StudioPrimitives";
import { recommendPackage } from "@/lib/architecture-studio/package-recommendation-engine";
import type { PublicStudioSession } from "@/types/architecture-studio";

export function AssumptionsOpenQuestionsPanel({ session }: { session: PublicStudioSession }) {
  const gaps = recommendPackage(session).gaps;
  return (
    <Panel className="overflow-hidden">
      <PanelHeading eyebrow="Visible uncertainty" title="Assumptions and open questions" detail="Each gap states what is assumed now and which part of the architecture could move." actions={<StatusPill tone={gaps.length ? "amber" : "green"}>{gaps.length} open</StatusPill>} />
      {gaps.length ? <div className="grid gap-3 p-4 lg:grid-cols-2">{gaps.map((gap) => <article key={gap.id} className="rounded-xl border border-amber-200/15 bg-amber-200/[0.025] p-4"><div className="flex items-start justify-between gap-3"><h3 className="text-sm font-semibold text-white">{gap.title}</h3><StatusPill tone={gap.category === "conflict" ? "violet" : gap.category === "verification" ? "amber" : "cyan"}>{gap.category}</StatusPill></div><dl className="mt-3 space-y-3"><GapFact label="Why it matters" value={gap.whyItMatters} /><GapFact label="Working assumption" value={gap.workingAssumption} /><GapFact label="Next question" value={gap.nextQuestion} /><GapFact label="Architecture that could change" value={gap.architectureImpact} /></dl></article>)}</div> : <p className="p-4 text-sm text-emerald-100">No automatically detected gaps remain. Continue to validate the architecture against representative evidence.</p>}
    </Panel>
  );
}

function GapFact({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</dt><dd className="mt-1 text-[11px] leading-5 text-slate-300">{value}</dd></div>;
}
