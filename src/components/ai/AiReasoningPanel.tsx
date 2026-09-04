"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { requestAppliedVoiceReasoning } from "@/lib/ai/client";
import type { AiContext, AiFeature, AiReasoningClass, AiReasoningResponse } from "@/lib/ai/schemas";

const button = "rounded-md border border-white/10 bg-white/[.04] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-violet-200/30 hover:bg-violet-200/[.07] focus-visible:outline-2 focus-visible:outline-violet-200 disabled:cursor-not-allowed disabled:opacity-40";
const primary = `${button} border-violet-200/30 bg-violet-200/[.12] text-violet-50`;

export function AiReasoningPanel({
  title,
  description,
  feature,
  context,
  prompts,
  reasoningClass,
  compact = false,
  onAcceptProposal,
}: {
  title: string;
  description: string;
  feature: AiFeature;
  context: AiContext;
  prompts: string[];
  reasoningClass?: AiReasoningClass;
  compact?: boolean;
  onAcceptProposal?: (proposal: string) => void;
}) {
  const [prompt, setPrompt] = useState(prompts[0] ?? "What should I test next?");
  const [response, setResponse] = useState<AiReasoningResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [reviewed, setReviewed] = useState<Record<string, "accepted" | "rejected">>({});
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  async function run() {
    controller.current?.abort();
    const activeController = new AbortController();
    controller.current = activeController;
    setLoading(true);
    setError("");
    setResponse(null);
    setReviewed({});
    try {
      const next = await requestAppliedVoiceReasoning({ feature, requestedReasoningClass: reasoningClass, prompt, context }, activeController.signal);
      setResponse(next);
    } catch (caught) {
      if ((caught as Error).name !== "AbortError") setError(caught instanceof Error ? caught.message : "AI reasoning is unavailable.");
    } finally {
      if (controller.current === activeController) setLoading(false);
    }
  }

  const proposals = useMemo(() => response?.result ? [
    ...response.result.assumptions.map((text) => ({ group: "Assumption", text })),
    ...response.result.evidenceGaps.map((text) => ({ group: "Evidence gap", text })),
    ...response.result.risks.map((text) => ({ group: "Risk", text })),
    ...response.result.recommendedTests.map((text) => ({ group: "Test", text })),
  ] : [], [response]);

  return (
    <section aria-labelledby={`${feature}-title`} className="rounded-xl border border-violet-200/20 bg-[linear-gradient(145deg,rgba(139,92,246,.08),rgba(7,16,22,.96))] p-4" data-ai-feature={feature}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.18em] text-violet-200">AI proposal · {reasoningClass ?? (feature === "copilot" ? "FAST" : "policy selected")}</p>
          <h2 id={`${feature}-title`} className="mt-1 text-sm font-semibold text-white">{title}</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">{description}</p>
        </div>
        <span className="rounded-full border border-amber-200/15 px-2 py-1 text-[10px] text-amber-100">Human review required</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {prompts.map((item) => <button key={item} type="button" className={prompt === item ? primary : button} aria-pressed={prompt === item} onClick={() => setPrompt(item)}>{item}</button>)}
      </div>
      <label className="mt-3 block text-[11px] font-semibold text-slate-300">
        Request
        <textarea aria-label={`${title} request`} value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={4_000} className={`mt-1 w-full rounded-lg border border-white/10 bg-black/20 p-3 text-xs leading-5 text-white outline-none focus:border-violet-200/40 ${compact ? "min-h-20" : "min-h-24"}`} />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className={primary} disabled={loading || !prompt.trim()} onClick={() => void run()}>{loading ? "Reasoning…" : feature === "architecture-red-team" ? "Red Team This Architecture" : feature === "poc-generator" ? "Generate POC" : "Ask for AI proposal"}</button>
        {loading ? <button type="button" className={button} onClick={() => controller.current?.abort()}>Cancel</button> : null}
        <span className="text-[10px] text-slate-500">Sanitized context only · no provider execution</span>
      </div>

      {error ? <p role="alert" className="mt-3 rounded-lg border border-amber-200/15 bg-amber-200/[.04] p-3 text-xs text-amber-50">{error} The deterministic Lab is still available.</p> : null}
      {response && response.status !== "completed" ? <p role="status" className="mt-3 rounded-lg border border-amber-200/15 bg-amber-200/[.04] p-3 text-xs text-amber-50">{response.message}</p> : null}
      {response?.result ? (
        <div className="mt-4 space-y-3" aria-live="polite">
          <div className="rounded-lg border border-violet-200/15 bg-black/20 p-3">
            <h3 className="text-xs font-semibold text-white">AI second opinion</h3>
            <p className="mt-2 text-xs leading-5 text-slate-300">{response.result.summary}</p>
            <p className="mt-2 text-xs leading-5 text-violet-100"><strong>Strongest recommendation:</strong> {response.result.strongestRecommendation}</p>
          </div>
          {proposals.length ? <details open={!compact} className="rounded-lg border border-white/8 p-3"><summary className="cursor-pointer text-xs font-semibold text-slate-300">Review proposed findings ({proposals.length})</summary><ul className="mt-3 space-y-2">{proposals.map((proposal, index) => { const key = `${proposal.group}:${index}`; return <li key={key} className="rounded-md border border-white/8 bg-black/15 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-violet-200">{proposal.group}</p><p className="mt-1 text-xs leading-5 text-slate-300">{proposal.text}</p><div className="mt-2 flex gap-2"><button type="button" className={reviewed[key] === "accepted" ? primary : button} onClick={() => { if (reviewed[key] !== "accepted") onAcceptProposal?.(proposal.text); setReviewed((current) => ({ ...current, [key]: "accepted" })); }}>Keep as proposal</button><button type="button" className={reviewed[key] === "rejected" ? primary : button} onClick={() => setReviewed((current) => ({ ...current, [key]: "rejected" }))}>Reject</button></div><p className="mt-1 text-[10px] text-slate-500">{reviewed[key] === "accepted" ? "Accepted for local review; not promoted to a confirmed fact." : reviewed[key] === "rejected" ? "Rejected locally." : "Not yet reviewed."}</p></li>; })}</ul></details> : null}
          {response.result.claims.length ? <details className="rounded-lg border border-white/8 p-3"><summary className="cursor-pointer text-xs font-semibold text-slate-300">Claim ledger ({response.result.claims.length})</summary><ul className="mt-3 space-y-2">{response.result.claims.map((claim, index) => <li key={`${claim.statement}:${index}`} className="text-xs leading-5 text-slate-300"><ClaimBadge label={claim.label} /> <span className="ml-2">{claim.statement}</span>{claim.evidenceIds.length ? <span className="ml-2 text-[10px] text-slate-500">Evidence: {claim.evidenceIds.join(", ")}</span> : null}</li>)}</ul></details> : null}
          {response.result.redTeam ? <RedTeamReview review={response.result.redTeam} /> : null}
          {response.result.poc ? <PocPlan plan={response.result.poc} /> : null}
          {response.result.nextModule ? <Link href={response.result.nextModule.href} className="block rounded-lg border border-cyan-200/20 bg-cyan-200/[.05] p-3 focus-visible:outline-2 focus-visible:outline-cyan-200"><span className="text-xs font-semibold text-cyan-100">Next: {response.result.nextModule.label} →</span><span className="mt-1 block text-[11px] text-slate-400">{response.result.nextModule.reason}</span></Link> : null}
          {response.usage ? <p className="text-[10px] text-slate-500">{response.usage.reasoningClass} · {response.usage.model} · {response.usage.latencyMs} ms · {formatTokens(response.usage.inputTokens, response.usage.outputTokens)} · cost {response.usage.costUsd === null ? "not returned" : `$${response.usage.costUsd.toFixed(6)}`}{response.usage.fallbackUsed ? " · fallback used" : ""}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function ClaimBadge({ label }: { label: string }) {
  const tone = label === "Repository verified" ? "text-emerald-100 border-emerald-200/20" : label === "Deepgram documentation verified" ? "text-cyan-100 border-cyan-200/20" : label === "Experimental idea" ? "text-violet-100 border-violet-200/20" : "text-amber-100 border-amber-200/20";
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${tone}`}>{label}</span>;
}

function RedTeamReview({ review }: { review: NonNullable<NonNullable<AiReasoningResponse["result"]>["redTeam"]> }) {
  const findings = [
    ["Strongest aspect", review.strongestAspect],
    ["Weakest assumption", review.weakestAssumption],
    ["Likely hidden failure", review.likelyHiddenFailure],
    ["Missing observability", review.missingObservability],
    ["Missing fallback", review.missingFallback],
    ["Ambiguous ownership", review.ambiguousOwnershipBoundary],
    ["Recommended test", review.recommendedTest],
    ["Architecture alternative", review.architectureAlternative],
    ["Production blocker", review.productionBlocker],
  ];
  return <section aria-label="Structured red team review" className="rounded-lg border border-rose-200/15 p-3"><h3 className="text-xs font-semibold text-rose-100">Structured red team review</h3><dl className="mt-3 grid gap-2 md:grid-cols-2">{findings.map(([label, value]) => <div key={label} className="rounded-md border border-white/8 bg-black/15 p-3"><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 text-xs leading-5 text-slate-300">{value}</dd></div>)}</dl></section>;
}

function PocPlan({ plan }: { plan: NonNullable<NonNullable<AiReasoningResponse["result"]>["poc"]> }) {
  return <details open className="rounded-lg border border-violet-200/15 p-3"><summary className="cursor-pointer text-xs font-semibold text-violet-100">Generated POC proposal</summary><p className="mt-3 text-xs leading-5 text-white"><strong>Hypothesis:</strong> {plan.hypothesis}</p><div className="mt-3 grid gap-3 md:grid-cols-2"><PocList title="Required inputs" values={plan.requiredInputs}/><PocList title="Representative data" values={plan.representativeData}/><PocList title="Environment" values={plan.environment}/><PocList title="Evidence before production" values={plan.productionEvidence}/><PocList title="Quantitative criteria" values={plan.quantitativeCriteria}/><PocList title="Qualitative criteria" values={plan.qualitativeCriteria}/><PocList title="Failure criteria" values={plan.failureCriteria}/><PocList title="Unresolved assumptions" values={plan.unresolvedAssumptions}/></div><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-[11px]"><thead className="text-slate-500"><tr><th className="p-2">Category</th><th className="p-2">Test</th><th className="p-2">Success criterion</th></tr></thead><tbody>{plan.testMatrix.map((row, index) => <tr key={`${row.category}:${index}`} className="border-t border-white/8"><td className="p-2 text-violet-100">{row.category}</td><td className="p-2 text-slate-300">{row.test}</td><td className="p-2 text-slate-400">{row.successCriterion}</td></tr>)}</tbody></table></div></details>;
}

function PocList({ title, values }: { title: string; values: string[] }) { return <div><h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{title}</h4><ul className="mt-1 space-y-1 text-[11px] leading-4 text-slate-300">{values.map((value) => <li key={value}>• {value}</li>)}</ul></div>; }
function formatTokens(input: number | null, output: number | null) { return input === null && output === null ? "tokens unavailable" : `${input ?? "?"} in / ${output ?? "?"} out`; }
