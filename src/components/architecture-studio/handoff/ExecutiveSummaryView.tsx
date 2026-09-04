import { StatusPill } from "@/components/architecture-studio/StudioPrimitives";
import type { ExecutiveSummaryModel } from "@/types/architecture-studio-handoff";

export function ExecutiveSummaryView({ summary, presentation = false }: { summary: ExecutiveSummaryModel; presentation?: boolean }) {
  return (
    <article className={`grid gap-4 ${presentation ? "min-h-[calc(100vh-170px)] content-center text-base" : "xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,.75fr)]"}`} aria-labelledby="executive-summary-title">
      <div className="space-y-4">
        <section className="rounded-2xl border border-cyan-200/15 bg-cyan-200/[0.045] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-100/65">Executive handoff · {summary.audience.replaceAll("-", " ")}</p><h2 id="executive-summary-title" className={`${presentation ? "mt-3 text-3xl" : "mt-2 text-xl"} font-semibold text-white`}>{summary.fictionalCustomer}</h2></div><div className="flex gap-2"><StatusPill tone="violet">Synthetic demo</StatusPill><StatusPill tone={summary.confidence === "high" || summary.confidence === "moderate" ? "green" : "amber"}>{summary.confidence} confidence</StatusPill></div></div>
          <h3 className="mt-6 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Customer objective</h3><p className={`${presentation ? "mt-2 text-xl leading-8" : "mt-2 text-sm leading-6"} text-slate-100`}>{summary.customerObjective}</p>
          <h3 className="mt-6 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Recommended direction</h3><p className={`${presentation ? "mt-2 text-xl leading-8" : "mt-2 text-sm leading-6"} text-slate-100`}>{summary.recommendedDirection}</p>
        </section>
        <div className={`grid gap-4 ${presentation ? "lg:grid-cols-3" : "md:grid-cols-3"}`}>
          <SummaryList title="Expected impact — hypotheses" items={summary.expectedImpactHypotheses.slice(0, presentation ? 3 : 5)} tone="green" />
          <SummaryList title="Key risks" items={summary.keyRisks.slice(0, presentation ? 4 : 7)} tone="amber" />
          <SummaryList title="Decision required" items={summary.decisionRequired.slice(0, presentation ? 3 : 6)} tone="cyan" />
        </div>
      </div>
      {!presentation ? <aside className="space-y-4"><SummaryList title="Current environment" items={summary.currentEnvironment} tone="slate" /><SummaryList title="Deepgram capabilities to evaluate" items={summary.deepgramCapabilities} tone="cyan" /><SummaryList title="Customer-managed components retained" items={summary.customerManagedComponents} tone="violet" />{summary.selectedMitigation ? <SummaryList title="Selected mitigation" items={[summary.selectedMitigation, summary.validationResult ?? "Recovery validation not yet recorded."]} tone="green" /> : null}<details className="rounded-xl border border-white/[0.08] bg-black/15 p-4"><summary className="cursor-pointer text-xs font-semibold text-white focus-visible:outline-2 focus-visible:outline-cyan-200">Why this summary says what it says</summary><ul className="mt-3 space-y-2">{summary.traceability.map((trace) => <li key={trace.id} className="text-[11px] leading-5 text-slate-400"><span className="font-semibold text-slate-300">{trace.source.replaceAll("-", " ")} · {trace.label}:</span> {trace.detail}</li>)}</ul></details><p className="rounded-xl border border-white/[0.07] p-3 text-[10px] leading-4 text-slate-500">{summary.confidenceReason}</p></aside> : null}
    </article>
  );
}

function SummaryList({ title, items, tone }: { title: string; items: string[]; tone: "green" | "amber" | "cyan" | "violet" | "slate" }) {
  const tones = { green: "border-emerald-200/15 bg-emerald-200/[0.035]", amber: "border-amber-200/15 bg-amber-200/[0.035]", cyan: "border-cyan-200/15 bg-cyan-200/[0.035]", violet: "border-violet-200/15 bg-violet-200/[0.035]", slate: "border-white/[0.08] bg-black/15" };
  return <section className={`rounded-xl border p-4 ${tones[tone]}`}><h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-300">{title}</h3><ul className="mt-3 space-y-2 text-[12px] leading-5 text-slate-300">{items.length ? items.map((item) => <li key={item} className="flex gap-2"><span aria-hidden="true" className="mt-0.5 text-cyan-100/60">—</span><span>{item}</span></li>) : <li>Not yet resolved</li>}</ul></section>;
}
