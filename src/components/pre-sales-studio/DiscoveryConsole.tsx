"use client";

import { DiscoveryQuickSelect } from "@/components/pre-sales-studio/DiscoveryQuickSelect";
import { Panel, SectionHeading, StatusBadge, preSalesButton, preSalesInput, preSalesPrimaryButton, preSalesTextarea } from "@/components/pre-sales-studio/PreSalesPrimitives";
import { FAST_DISCOVERY_GROUP_IDS, PRE_SALES_DISCOVERY_STAGES, getPreSalesDiscoveryGroup } from "@/data/pre-sales-discovery";
import { computeDiscoveryInsight, recommendSolution, updateOpportunityDiscovery, updateOpportunityQuickNote, updateOpportunityQuickSelection } from "@/lib/pre-sales-studio/engine";
import type { DiscoveryFieldKey, DiscoveryQuickSelectFieldKey, DiscoveryState, OpportunityState } from "@/types/pre-sales-studio";

type Field = { key: DiscoveryFieldKey; label: string; hint?: string; kind?: "textarea" | "select" | "multi"; options?: Array<{ value: string; label: string }> };

const FIELDS: Field[] = [
  { key: "desiredBusinessOutcome", label: "Desired business outcome", kind: "textarea", hint: "Use the customer's language and measurable outcome." },
  { key: "currentWorkflow", label: "Current workflow", kind: "textarea", hint: "Describe the first end-to-end production workflow." }, { key: "reasonNow", label: "Why evaluate now?" },
  { key: "launchDeadline", label: "Launch deadline" }, { key: "currentProblemCost", label: "Cost of the current problem" }, { key: "executiveSponsor", label: "Executive sponsor" }, { key: "buyingProcess", label: "Buying process" },
  { key: "products", label: "Capabilities explicitly in scope", kind: "multi", options: options([["stt", "STT"], ["tts", "TTS"], ["voice-agent", "Voice Agent API"], ["audio-intelligence", "Audio Intelligence"]]) },
  { key: "monthlyAudioMinutes", label: "Monthly audio minutes" }, { key: "monthlyCallCount", label: "Monthly call count" }, { key: "averageCallDuration", label: "Average call duration" },
  { key: "normalConcurrency", label: "Normal concurrency" }, { key: "peakConcurrency", label: "Peak concurrency" }, { key: "expectedGrowth", label: "Expected growth" },
  { key: "audioSources", label: "Additional audio sources", kind: "multi", options: options([["telephony", "Telephony"], ["webrtc", "WebRTC"], ["browser", "Browser"], ["mobile", "Mobile"], ["uploaded-media", "Uploaded media"], ["custom-source", "Custom"]]) },
  { key: "codecSampleRate", label: "Codec and sample rate" }, { key: "channelMode", label: "Channels", kind: "select", options: options([["", "Not known"], ["mono", "Mono"], ["multichannel", "Multichannel"], ["mixed", "Mixed"]]) },
  { key: "backgroundNoise", label: "Typical background noise", kind: "textarea" }, { key: "languages", label: "Languages" }, { key: "accents", label: "Accents or regional variants" },
  { key: "specialistTerminology", label: "Specialist terminology", kind: "textarea" }, { key: "alphanumericIdentifiers", label: "Alphanumeric identifiers" }, { key: "codeSwitching", label: "Expected code-switching" }, { key: "riskyVocabulary", label: "Vocabulary that creates business risk", kind: "textarea" },
  { key: "geographicResidency", label: "Geographic residency detail" }, { key: "retentionConstraints", label: "Retention constraints", kind: "textarea" }, { key: "sensitiveData", label: "PII or PHI handling", kind: "textarea" },
  { key: "authenticationRequirements", label: "Authentication requirements" }, { key: "compliancePosture", label: "Required compliance posture", kind: "textarea" },
  { key: "incumbentProvider", label: "Incumbent speech provider" }, { key: "telephonyProvider", label: "Telephony provider" }, { key: "contactCenterPlatform", label: "Contact-center platform" },
  { key: "llmProvider", label: "LLM provider" }, { key: "crm", label: "CRM" }, { key: "dataWarehouse", label: "Data warehouse" }, { key: "orchestrationLayer", label: "Orchestration layer" },
  { key: "observabilityTools", label: "Observability tools" }, { key: "engineeringStack", label: "Engineering languages and frameworks" },
  { key: "currentWer", label: "Current WER" }, { key: "currentLatency", label: "Current latency and measurement boundaries" }, { key: "currentCost", label: "Current cost" },
  { key: "containment", label: "Containment" }, { key: "conversion", label: "Conversion" }, { key: "abandonment", label: "Abandonment" }, { key: "qaCoverage", label: "QA coverage" },
  { key: "knownFailurePatterns", label: "Known failure patterns", kind: "textarea" },
];

const FIELD_MAP = new Map(FIELDS.map((field) => [field.key, field]));

export function DiscoveryConsole({ opportunity, onChange, onNext }: { opportunity: OpportunityState; onChange: (next: OpportunityState) => void; onNext: () => void }) {
  const insight = computeDiscoveryInsight(opportunity);
  const recommendations = recommendSolution(opportunity).filter((item) => item.fit !== "unresolved");
  const architectureRecommendation = recommendations.find((item) => ["flux", "nova-streaming", "nova-batch", "voice-agent", "private", "composable-migration"].includes(item.id));
  const setField = (key: DiscoveryFieldKey, value: DiscoveryState[DiscoveryFieldKey]) => onChange(updateOpportunityDiscovery(opportunity, key, value));
  const setMode = (discoveryMode: OpportunityState["discoveryMode"]) => onChange({ ...opportunity, discoveryMode, updatedAt: new Date().toISOString() });
  const fastGroups = FAST_DISCOVERY_GROUP_IDS.map(getPreSalesDiscoveryGroup);

  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
    <div className="min-w-0 space-y-5 pb-60 xl:pb-0">
      <SectionHeading eyebrow="02 · Technical discovery" title="Ask only what changes the decision." detail="Start with seven call-side decisions or expand into the full technical and operational assessment. Every selection remains editable evidence—not a hidden scorecard." actions={<button type="button" className={preSalesPrimaryButton} onClick={onNext}>Review solution blueprint →</button>} />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-200/15 bg-cyan-200/[0.045] p-4">
        <div><p className="text-sm font-semibold text-white">Discovery depth</p><p className="mt-1 text-xs leading-5 text-slate-400">Fast Discovery captures seven high-leverage decisions. Deep Discovery adds the complete assessment.</p></div>
        <div className="flex rounded-xl border border-white/[0.09] bg-black/20 p-1" role="group" aria-label="Discovery mode">
          <button type="button" aria-pressed={opportunity.discoveryMode === "fast"} className={`min-h-11 rounded-lg border px-3 py-2 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70 ${opportunity.discoveryMode === "fast" ? "border-cyan-100 bg-cyan-200 text-slate-950" : "border-white/10 bg-white/[0.04] text-slate-300"}`} onClick={() => setMode("fast")}>Fast Discovery</button>
          <button type="button" aria-pressed={opportunity.discoveryMode === "deep"} className={`min-h-11 rounded-lg border px-3 py-2 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70 ${opportunity.discoveryMode === "deep" ? "border-cyan-100 bg-cyan-200 text-slate-950" : "border-white/10 bg-white/[0.04] text-slate-300"}`} onClick={() => setMode("deep")}>Deep Discovery</button>
        </div>
      </div>

      {opportunity.discoveryMode === "fast" ? <section aria-labelledby="fast-discovery-title" className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-cyan-100/60">5–7 minute path</p><h2 id="fast-discovery-title" className="mt-1 text-xl font-semibold text-white">Seven decisions that shape the first recommendation</h2></div><StatusBadge tone="cyan">{fastGroups.length} decisions</StatusBadge></div>{fastGroups.map((group) => <QuickGroup key={group.id} opportunity={opportunity} group={group} onChange={onChange} />)}<details open className="rounded-2xl border border-white/[0.08] bg-[#071016]/86"><summary className="min-h-14 cursor-pointer list-none p-4 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/60">Optional customer narrative, workflow, and scale override</summary><div className="grid gap-4 border-t border-white/[0.07] p-4 md:grid-cols-2">{["desiredBusinessOutcome", "currentWorkflow", "reasonNow", "launchDeadline", "peakConcurrency"].map((key) => <DiscoveryField key={key} field={FIELD_MAP.get(key as DiscoveryFieldKey)!} value={opportunity.discovery[key as DiscoveryFieldKey]} onChange={(value) => setField(key as DiscoveryFieldKey, value)} />)}</div></details></section> : <section aria-label="Deep discovery stages" className="space-y-4">{PRE_SALES_DISCOVERY_STAGES.map((stage, index) => <details key={stage.id} open={index === 0} className="group rounded-2xl border border-white/[0.08] bg-[#071016]/86"><summary className="min-h-16 cursor-pointer list-none rounded-2xl p-5 outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/60"><span className="flex items-center justify-between gap-4"><span><span className="block text-lg font-semibold text-white">{stage.title}</span><span className="mt-1 block text-xs leading-5 text-slate-400">{stage.detail}</span></span><span aria-hidden="true" className="text-lg text-cyan-100/55 group-open:rotate-45">+</span></span></summary><div className="space-y-4 border-t border-white/[0.07] p-4 sm:p-5">{stage.groupIds.map((groupId) => <QuickGroup key={groupId} opportunity={opportunity} group={getPreSalesDiscoveryGroup(groupId)} onChange={onChange} />)}<details className="rounded-xl border border-white/[0.07] bg-black/15"><summary className="min-h-12 cursor-pointer list-none px-4 py-3 text-xs font-semibold text-cyan-100/75 outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/60">Technical notes and direct overrides</summary><div className="grid gap-4 border-t border-white/[0.07] p-4 md:grid-cols-2">{stage.advancedFields.map((key) => { const field = FIELD_MAP.get(key); return field ? <DiscoveryField key={key} field={field} value={opportunity.discovery[key]} onChange={(value) => setField(key, value)} /> : null; })}</div></details></div></details>)}</section>}
    </div>

    <aside className="hidden space-y-4 xl:sticky xl:top-24 xl:block xl:self-start">
      <ConfidencePanel confidence={insight.confidence} />
      <InsightPanel title="Three highest-value questions" items={insight.nextQuestions.map((item) => item.question)} tone="cyan" />
      <InsightPanel title="Known" items={insight.known} tone="green" empty="No decision-relevant facts captured yet." />
      <InsightPanel title="Working assumptions" items={insight.assumptions} tone="amber" />
      <InsightPanel title={`Unanswered · ${insight.unanswered.length}`} items={insight.unanswered.slice(0, 6).map((item) => item.question)} tone="rose" />
    </aside>

    <aside className="fixed inset-x-3 z-30 rounded-2xl border border-cyan-200/25 bg-[#061016]/95 p-4 shadow-2xl backdrop-blur-xl xl:hidden" style={{ bottom: "calc(max(.75rem, env(safe-area-inset-bottom)) + 4.5rem)" }} aria-label="Live discovery summary" aria-live="polite">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs"><SummaryFact label="Current use case" value={opportunity.discovery.desiredBusinessOutcome || labelsFor("business-outcome", opportunity.discovery.businessOutcomePriorities) || "Outcome unresolved"} /><SummaryFact label="Selected architecture" value={architectureRecommendation?.title || "Evaluation path unresolved"} /><SummaryFact label="Open questions" value={`${insight.unanswered.length} decision-relevant`} /><SummaryFact label="Next best action" value={insight.nextQuestions[0]?.question || "Review the solution blueprint"} /></div>
    </aside>
  </div>;
}

function QuickGroup({ opportunity, group, onChange }: { opportunity: OpportunityState; group: ReturnType<typeof getPreSalesDiscoveryGroup>; onChange: (next: OpportunityState) => void }) {
  const value = opportunity.discovery[group.field as DiscoveryQuickSelectFieldKey] as string | string[];
  return <DiscoveryQuickSelect group={group} value={value} note={opportunity.discovery.quickNotes[group.id] ?? ""} onSelect={(option) => onChange(updateOpportunityQuickSelection(opportunity, group.id, option))} onNote={(note) => onChange(updateOpportunityQuickNote(opportunity, group.id, note))} />;
}

function DiscoveryField({ field, value, onChange }: { field: Field; value: DiscoveryState[DiscoveryFieldKey]; onChange: (value: DiscoveryState[DiscoveryFieldKey]) => void }) {
  const id = `discovery-${field.key}`;
  if (field.kind === "multi") {
    const selected = Array.isArray(value) ? value : [];
    return <fieldset className="md:col-span-2"><legend className="text-xs font-semibold text-slate-200">{field.label}</legend><div className="mt-2 flex flex-wrap gap-2">{field.options?.map((option) => { const active = selected.includes(option.value); return <button key={option.value} type="button" aria-pressed={active} onClick={() => onChange(active ? selected.filter((item) => item !== option.value) : [...selected, option.value])} className={`${preSalesButton} min-h-11 ${active ? "border-cyan-200/35 bg-cyan-200/[0.12] text-cyan-50" : ""}`}>{option.label}</button>; })}</div></fieldset>;
  }
  return <label htmlFor={id} className={field.kind === "textarea" ? "md:col-span-2" : ""}><span className="mb-2 block text-xs font-semibold text-slate-200">{field.label}</span>{field.kind === "select" ? <select id={id} className={preSalesInput} value={String(value)} onChange={(event) => onChange(event.target.value as DiscoveryState[DiscoveryFieldKey])}>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.kind === "textarea" ? <textarea id={id} className={preSalesTextarea} value={String(value)} placeholder={field.hint} onChange={(event) => onChange(event.target.value)} /> : <input id={id} className={preSalesInput} value={String(value)} placeholder={field.hint} onChange={(event) => onChange(event.target.value)} />}</label>;
}

function ConfidencePanel({ confidence }: { confidence: number }) { return <Panel className="p-5" aria-live="polite"><div className="flex items-end justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-100/60">Discovery confidence</p><p className="mt-2 text-4xl font-semibold text-white">{confidence}<span className="text-lg text-slate-500">%</span></p></div><StatusBadge tone={confidence >= 70 ? "green" : confidence >= 40 ? "amber" : "rose"}>{confidence >= 70 ? "Decision-ready" : confidence >= 40 ? "Directional" : "Early discovery"}</StatusBadge></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-cyan-200 transition-[width] motion-reduce:transition-none" style={{ width: `${confidence}%` }} /></div></Panel>; }
function InsightPanel({ title, items, tone, empty = "No items." }: { title: string; items: string[]; tone: "cyan" | "green" | "amber" | "rose"; empty?: string }) { return <Panel className="p-5"><StatusBadge tone={tone}>{title}</StatusBadge>{items.length ? <ul className="mt-4 space-y-3">{items.map((item) => <li key={item} className="border-l border-white/10 pl-3 text-xs leading-5 text-slate-300">{item}</li>)}</ul> : <p className="mt-4 text-xs text-slate-500">{empty}</p>}</Panel>; }
function SummaryFact({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><p className="text-[9px] font-bold uppercase tracking-[.12em] text-cyan-100/55">{label}</p><p className="mt-1 line-clamp-2 leading-4 text-slate-100">{value}</p></div>; }
function labelsFor(groupId: Parameters<typeof getPreSalesDiscoveryGroup>[0], values: string[]) { const group = getPreSalesDiscoveryGroup(groupId); return values.filter((value) => !["not-sure", "other"].includes(value)).map((value) => group.options.find((option) => option.value === value)?.label ?? value).join(", "); }
function options(values: Array<[string, string]>) { return values.map(([value, label]) => ({ value, label })); }
