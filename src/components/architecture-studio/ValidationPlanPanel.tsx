import { Panel, PanelHeading, StatusPill } from "@/components/architecture-studio/StudioPrimitives";
import { recommendPackage } from "@/lib/architecture-studio/package-recommendation-engine";
import type { PublicStudioSession } from "@/types/architecture-studio";

export function ValidationPlanPanel({ session }: { session: PublicStudioSession }) {
  const tests = recommendPackage(session).validationPlan;
  return (
    <Panel className="overflow-hidden">
      <PanelHeading eyebrow="Proposed proof of concept" title="Validation plan" detail="Targets remain placeholders until the fictional customer defines an acceptance threshold." actions={<StatusPill tone="violet">{tests.length} tests</StatusPill>} />
      <ol className="grid gap-3 p-4 lg:grid-cols-2">
        {tests.map((test, index) => <li key={test.id} className="rounded-xl border border-white/[0.08] bg-black/15 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-violet-100/65">{index + 1} · {test.category}</p><h3 className="mt-1 text-sm font-semibold text-white">{test.title}</h3></div>{test.unresolvedPrerequisites.length ? <StatusPill tone="amber">Prerequisite</StatusPill> : <StatusPill tone="green">Ready to define</StatusPill>}</div><dl className="mt-3 space-y-3"><PlanFact label="Representative evidence" value={test.evidenceNeeded} /><PlanFact label="Method" value={test.method} /><PlanFact label="Acceptance criteria" value={test.acceptanceCriteria} />{test.unresolvedPrerequisites.length ? <PlanFact label="Unresolved prerequisites" value={test.unresolvedPrerequisites.join(" · ")} /> : null}</dl></li>)}
      </ol>
    </Panel>
  );
}

function PlanFact({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</dt><dd className="mt-1 text-[11px] leading-5 text-slate-300">{value}</dd></div>;
}
