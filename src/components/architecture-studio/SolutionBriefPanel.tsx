"use client";

import { useState } from "react";

import { ArchitectureDiagram } from "@/components/architecture-studio/ArchitectureDiagram";
import { Panel, PanelHeading, studioButton, studioInput, studioPrimaryButton } from "@/components/architecture-studio/StudioPrimitives";
import type { PublicStudioSession, StudioNextStep, StudioSolutionBrief } from "@/types/architecture-studio";

export function SolutionBriefPanel({
  session,
  onGenerate,
  onSaveSteps,
}: {
  session: PublicStudioSession;
  onGenerate: () => Promise<void>;
  onSaveSteps: (steps: StudioNextStep[]) => Promise<void>;
}) {
  const brief = session.savedBrief;

  if (!brief) {
    return <Panel className="overflow-hidden"><PanelHeading eyebrow="Final solution brief" title="Turn discovery into a practical handoff" detail="Generated deterministically from the shared session. No customer response is sent to an LLM." /><div className="grid min-h-[420px] place-items-center p-6 text-center"><div className="max-w-lg"><div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-cyan-200/20 bg-cyan-200/[0.06] font-mono text-cyan-100">{`{ }`}</div><h3 className="mt-5 text-xl font-semibold text-white">Ready when the room is aligned</h3><p className="mt-3 text-sm leading-6 text-slate-400">The brief includes the customer objective, retained stack, current best-fit architecture, Deepgram components, tradeoffs, evaluation plan, production gates, open questions, and editable next actions.</p><button type="button" onClick={() => void onGenerate()} className={`${studioPrimaryButton} mt-6`}>Generate solution brief</button></div></div></Panel>;
  }

  return <SolutionBriefContent key={brief.generatedAt} brief={brief} code={session.code} onGenerate={onGenerate} onSaveSteps={onSaveSteps} />;
}

function SolutionBriefContent({ brief, code, onGenerate, onSaveSteps }: { brief: StudioSolutionBrief; code: string; onGenerate: () => Promise<void>; onSaveSteps: (steps: StudioNextStep[]) => Promise<void> }) {
  const [steps, setSteps] = useState<StudioNextStep[]>(brief.nextSteps);
  const [status, setStatus] = useState("");

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(brief.markdown);
      setStatus("Markdown copied.");
    } catch {
      setStatus("Clipboard access was blocked. Use Download JSON or the print view instead.");
    }
  }

  function downloadJson() {
    download(`architecture-studio-${code}.json`, JSON.stringify(brief, null, 2), "application/json");
    setStatus("JSON prepared.");
  }

  async function saveSteps() {
    await onSaveSteps(steps);
    setStatus("Next steps saved to the temporary session.");
  }

  return (
    <Panel className="print-solution-brief overflow-hidden">
      <PanelHeading eyebrow="Saved in temporary session" title="Solution brief" detail={`Generated ${new Date(brief.generatedAt).toLocaleString()} · deterministic, no LLM`} actions={<div className="no-print flex flex-wrap gap-2"><button type="button" onClick={() => void copyMarkdown()} className={studioButton}>Copy Markdown</button><button type="button" onClick={downloadJson} className={studioButton}>Download JSON</button><button type="button" onClick={() => window.print()} className={studioButton}>Print</button><button type="button" onClick={() => void onGenerate()} className={studioButton}>Regenerate</button></div>} />
      <article className="space-y-6 p-5 text-sm text-slate-300 sm:p-7">
        <BriefSection title="Customer objective"><p>{brief.customerObjective}</p></BriefSection>
        <BriefList title="Current environment" items={brief.currentEnvironment} />
        <BriefSection title="Recommended starting architecture"><p>{brief.recommendedStartingArchitecture}</p></BriefSection>
        {brief.technicalTopology ? <BriefSection title="Technical topology"><ArchitectureDiagram topology={brief.technicalTopology} view="technical" /></BriefSection> : null}
        <div className="grid gap-5 lg:grid-cols-2"><BriefList title="Deepgram components" items={brief.deepgramComponents} /><BriefList title="Existing components retained" items={brief.retainedComponents} /></div>
        <BriefList title="Key tradeoffs" items={brief.tradeoffs} tone="amber" />
        <BriefList title="Evaluation plan" items={brief.evaluationPlan} ordered />
        <BriefList title="Production path" items={brief.productionPath} ordered />
        <BriefList title="Open questions" items={brief.openQuestions} tone="violet" />
        <BriefSection title="Live-call next steps">
          <div className="no-print space-y-2">
            {steps.map((step, index) => <div key={step.id} className="grid gap-2 rounded-xl border border-white/[0.08] bg-black/15 p-3 sm:grid-cols-[26px_1fr_180px_130px_34px]"><span className="pt-3 font-mono text-[12px] text-slate-400">{index + 1}</span><input aria-label={`Next step ${index + 1}`} value={step.action} onChange={(event) => setSteps((current) => current.map((item) => item.id === step.id ? { ...item, action: event.target.value } : item))} className={studioInput} /><input aria-label={`Owner ${index + 1}`} value={step.owner} onChange={(event) => setSteps((current) => current.map((item) => item.id === step.id ? { ...item, owner: event.target.value } : item))} className={studioInput} /><input aria-label={`Timing ${index + 1}`} value={step.timing} onChange={(event) => setSteps((current) => current.map((item) => item.id === step.id ? { ...item, timing: event.target.value } : item))} className={studioInput} /><button type="button" aria-label={`Remove next step ${index + 1}`} onClick={() => setSteps((current) => current.filter((item) => item.id !== step.id))} className={studioButton}>×</button></div>)}
            <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setSteps((current) => [...current, { id: crypto.randomUUID(), action: "", owner: "", timing: "", completed: false }])} className={studioButton}>Add action</button><button type="button" onClick={() => void saveSteps()} className={studioPrimaryButton}>Save next steps</button></div>
          </div>
          <ol className="print-only hidden space-y-2">{brief.nextSteps.map((step) => <li key={step.id}>{step.action} — {step.owner}, {step.timing}</li>)}</ol>
        </BriefSection>
        <p role="status" aria-live="polite" className="no-print text-right text-[12px] text-emerald-200/70">{status}</p>
        <p className="border-t border-white/[0.08] pt-4 text-[12px] leading-5 text-slate-400">Simulated prototype. Recommendations require technical and commercial validation. No pricing, legal, or compliance determination is made.</p>
      </article>
    </Panel>
  );
}

function BriefSection({ title, children }: { title: string; children: React.ReactNode }) { return <section><h3 className="text-[12px] font-bold uppercase tracking-[0.16em] text-cyan-100/65">{title}</h3><div className="mt-2 text-xs leading-6 text-slate-300">{children}</div></section>; }
function BriefList({ title, items, ordered = false, tone = "default" }: { title: string; items: string[]; ordered?: boolean; tone?: "default" | "amber" | "violet" }) { const Tag = ordered ? "ol" : "ul"; return <BriefSection title={title}><Tag className="space-y-2">{items.map((item, index) => <li key={`${index}-${item}`} className="flex gap-3"><span className={`mt-2 size-1.5 shrink-0 rounded-full ${tone === "amber" ? "bg-amber-300" : tone === "violet" ? "bg-violet-300" : "bg-cyan-300"}`} />{ordered ? `${index + 1}. ` : ""}{item}</li>)}</Tag></BriefSection>; }
function download(filename: string, text: string, type: string) { const url = URL.createObjectURL(new Blob([text], { type })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }
