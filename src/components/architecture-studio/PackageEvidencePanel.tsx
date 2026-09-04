import { Panel, PanelHeading, StatusPill } from "@/components/architecture-studio/StudioPrimitives";
import { getQuestion } from "@/data/architecture-studio-discovery";
import { recommendPackage } from "@/lib/architecture-studio/package-recommendation-engine";
import { formatAnswer, resolveDiscoveryProfile } from "@/lib/architecture-studio/recommendation-engine";
import type { PublicStudioSession } from "@/types/architecture-studio";

export function PackageEvidencePanel({ session }: { session: PublicStudioSession }) {
  const result = recommendPackage(session);
  const { values } = resolveDiscoveryProfile(session);
  return (
    <Panel className="overflow-hidden">
      <PanelHeading
        eyebrow="Inspectable rules"
        title="Recommendation evidence"
        detail={result.confidenceReason}
        actions={<StatusPill tone={confidenceTone(result.confidence)}>{result.confidence} confidence</StatusPill>}
      />
      <div className="space-y-3 p-4">
        {result.components.map((component) => (
          <article key={component.id} className="rounded-xl border border-white/[0.08] bg-black/15 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-[11px] font-bold uppercase tracking-[0.13em] text-cyan-100/65">{component.category}</p><h3 className="mt-1 text-base font-semibold text-white">{component.capabilityOrApproach}</h3></div>
              <div className="flex gap-2"><StatusPill tone={confidenceTone(component.confidence)}>{component.confidence}</StatusPill>{component.verificationNeeded ? <StatusPill tone="amber">Verify capability</StatusPill> : null}</div>
            </div>
            <dl className="mt-4 grid gap-3 md:grid-cols-2">
              <EvidenceFact label="1 · Customer requirement" value={component.customerRequirement} />
              <EvidenceFact label="2 · Architectural decision" value={component.architecturalDecision} />
              <EvidenceFact label="3 · Deepgram capability / approach" value={component.capabilityOrApproach} />
              <EvidenceFact label="4 · Why it fits" value={component.whyItFits} />
              <EvidenceFact label="5 · Tradeoff / limitation" value={component.tradeoffOrLimitation} />
              <EvidenceFact label="6 · Validation method" value={component.validationMethod} />
              <EvidenceFact label="7 · Confidence" value={`${component.confidence}${component.verificationNeeded ? " · official support or configuration needs confirmation" : " · based on currently answered source fields"}`} />
              <div className="rounded-lg border border-white/[0.07] bg-[#071016]/70 p-3">
                <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">8 · Triggering discovery answers</dt>
                <dd className="mt-2 space-y-1.5">{component.sourceQuestionIds.map((questionId) => <p key={questionId} className="text-[11px] leading-4 text-slate-300"><span className="font-semibold text-white">{getQuestion(questionId)?.label ?? questionId}:</span> {formatAnswer(values[questionId]) || "Not answered"}</p>)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </Panel>
  );
}

function EvidenceFact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-white/[0.07] bg-[#071016]/70 p-3"><dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</dt><dd className="mt-1.5 text-[11px] leading-5 text-slate-300">{value}</dd></div>;
}

function confidenceTone(confidence: "low" | "developing" | "moderate" | "high") {
  if (confidence === "high") return "green" as const;
  if (confidence === "moderate") return "cyan" as const;
  return "amber" as const;
}
