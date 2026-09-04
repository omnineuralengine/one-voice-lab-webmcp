"use client";

import { useMemo, useState } from "react";

import { STAKEHOLDER_ROLES } from "@/data/architecture-studio-discovery";
import { formatAnswer } from "@/lib/architecture-studio/recommendation-engine";
import { Panel, StatusPill, studioInput, studioPrimaryButton } from "@/components/architecture-studio/StudioPrimitives";
import type { PublicStudioSession, StudioAnswerValue, StudioQuestion } from "@/types/architecture-studio";

export function DiscoveryQuestionCard({
  question,
  session,
  participantId,
  onSave,
  saving = false,
  disabled = false,
  presenter = false,
  onOverride,
}: {
  question: StudioQuestion;
  session: PublicStudioSession;
  participantId?: string;
  onSave?: (value: StudioAnswerValue) => Promise<void> | void;
  saving?: boolean;
  disabled?: boolean;
  presenter?: boolean;
  onOverride?: (value: StudioAnswerValue) => Promise<void> | void;
}) {
  const ownAnswer = session.answers.find((answer) => answer.questionId === question.id && answer.participantId === participantId)?.value;
  const override = session.presenterOverrides[question.id];
  const [draft, setDraft] = useState<StudioAnswerValue>(() => ownAnswer ?? defaultValue(question));
  const [otherDetail, setOtherDetail] = useState(() => extractOther(ownAnswer));
  const [saved, setSaved] = useState(false);

  const contributions = useMemo(() => session.answers
    .filter((answer) => answer.questionId === question.id)
    .map((answer) => ({
      ...answer,
      name: answer.participantId === "scenario" ? "Seeded scenario" : session.participants.find((participant) => participant.id === answer.participantId)?.displayName ?? "Participant",
    })), [question.id, session.answers, session.participants]);
  const liveValues = new Set(contributions.filter((item) => item.participantId !== "scenario").map((item) => JSON.stringify(item.value)));
  const disagreement = liveValues.size > 1;
  const roleRelevant = participantId
    ? question.relevantRoles.includes(session.participants.find((item) => item.id === participantId)?.role ?? "observer")
    : false;

  async function submit(useOverride = false) {
    if (disabled) return;
    let value = draft;
    if (question.kind === "single" && typeof value === "string" && value.startsWith("other")) value = otherDetail.trim() ? `other:${otherDetail.trim()}` : "other";
    if (question.kind === "multi" && Array.isArray(value) && value.some((item) => item === "other" || item.startsWith("other:"))) {
      value = value.filter((item) => item !== "other" && !item.startsWith("other:"));
      value.push(otherDetail.trim() ? `other:${otherDetail.trim()}` : "other");
    }
    if (!validValue(value)) return;
    if (useOverride && onOverride) await onOverride(value);
    else if (onSave) await onSave(value);
    setSaved(true);
  }

  return (
    <Panel className="overflow-hidden">
      <div className="border-b border-white/[0.08] px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={question.critical ? "amber" : "slate"}>{question.critical ? "Critical" : "Supporting"}</StatusPill>
          <StatusPill tone={question.technical ? "violet" : "cyan"}>{question.technical ? "Technical lens" : "Shared decision"}</StatusPill>
          {roleRelevant ? <StatusPill tone="green">Relevant to your role</StatusPill> : null}
          {override !== undefined ? <StatusPill tone="violet">Presenter refined</StatusPill> : null}
          {disabled ? <StatusPill tone="amber">Section paused</StatusPill> : null}
        </div>
        <p className="mt-4 text-[12px] font-bold uppercase tracking-[0.16em] text-cyan-100/60">{question.label}</p>
        <h1 className="mt-2 max-w-4xl text-xl font-semibold leading-7 text-white sm:text-2xl">{question.prompt}</h1>
        <div className="mt-4 rounded-xl border border-cyan-200/10 bg-cyan-200/[0.035] p-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-100/65">Why this matters</p>
          <p className="mt-1 text-[11px] leading-5 text-slate-400">{question.whyItMatters}</p>
        </div>
      </div>

      <div className="p-5">
        {question.kind === "text" ? (
          <label className="block"><span className="sr-only">{question.label}</span><textarea rows={4} disabled={disabled} value={typeof draft === "string" ? draft : ""} onChange={(event) => { setDraft(event.target.value); setSaved(false); }} placeholder={question.placeholder} className={`${studioInput} resize-y`} /></label>
        ) : null}
        {question.kind === "number" ? (
          <label className="block"><span className="sr-only">{question.label}</span><input type="number" disabled={disabled} value={typeof draft === "number" ? draft : ""} onChange={(event) => { setDraft(Number(event.target.value)); setSaved(false); }} className={studioInput} /></label>
        ) : null}
        {question.options ? (
          <fieldset>
            <legend className="sr-only">{question.prompt}</legend>
            <div role={question.kind === "single" ? "radiogroup" : "group"} aria-label={question.label} className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
              {question.options.map((option) => {
                const active = optionActive(draft, option.value);
                return (
                  <button key={option.value} type="button" disabled={disabled} role={question.kind === "single" ? "radio" : undefined} aria-checked={question.kind === "single" ? active : undefined} aria-pressed={question.kind === "multi" ? active : undefined} onClick={() => { setDraft(toggleValue(draft, option.value, question.kind)); setSaved(false); }} className={`min-h-14 rounded-xl border p-3 text-left transition focus-visible:outline-2 focus-visible:outline-cyan-200 disabled:cursor-not-allowed disabled:opacity-55 ${active ? "border-cyan-200/40 bg-cyan-200/[0.09] text-white" : "border-white/[0.08] bg-black/20 text-slate-400 hover:border-white/20 hover:text-white"}`}>
                    <span className="flex items-start gap-2">
                      <span className={`mt-0.5 flex size-4 shrink-0 items-center justify-center border ${question.kind === "single" ? "rounded-full" : "rounded-md"} ${active ? "border-cyan-100 bg-cyan-200 text-slate-950" : "border-white/20"}`}>{active ? <span className="text-[11px] font-black">✓</span> : null}</span>
                      <span><span className="block text-xs font-semibold">{option.label}</span>{option.description ? <span className="mt-1 block text-[11px] leading-4 text-slate-400">{option.description}</span> : null}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {hasOther(draft) ? <label className="mt-3 block"><span className="mb-1.5 block text-[12px] font-semibold text-slate-400">Other fictional detail</span><input disabled={disabled} value={otherDetail} onChange={(event) => setOtherDetail(event.target.value)} maxLength={120} className={studioInput} placeholder="Describe the alternative without entering real customer data" /></label> : null}
          </fieldset>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p role="status" aria-live="polite" className="text-[12px] text-slate-400">{disabled ? "The presenter paused this section. Existing evidence remains visible, but contributions are temporarily read-only." : saved ? "Contribution saved to the shared profile." : ownAnswer !== undefined ? "You can revise your contribution." : presenter ? "Use an override only to clarify an explicit workshop assumption." : "Your answer will be visible to this temporary session."}</p>
          <div className="flex gap-2">
            {presenter && onOverride ? <button type="button" disabled={disabled || !validValue(draft) || saving} onClick={() => void submit(true)} className={studioPrimaryButton}>Refine assumption</button> : null}
            {!presenter && onSave ? <button type="button" disabled={disabled || !validValue(draft) || saving} onClick={() => void submit(false)} className={studioPrimaryButton}>{disabled ? "Section paused" : saving ? "Saving…" : ownAnswer !== undefined ? "Update answer" : "Share answer"}</button> : null}
          </div>
        </div>
      </div>

      <div className="border-t border-white/[0.07] bg-black/15 px-5 py-4">
        <div className="flex items-center justify-between gap-3"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Stakeholder evidence</p>{disagreement ? <StatusPill tone="amber">Different priorities</StatusPill> : null}</div>
        {contributions.length === 0 && override === undefined ? <p className="mt-2 text-[12px] text-slate-400">No contribution yet.</p> : null}
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {contributions.map((item) => (
            <div key={`${item.participantId}-${item.updatedAt}`} className={`rounded-lg border p-2.5 ${item.participantId === "scenario" ? "border-white/[0.06] bg-white/[0.02]" : "border-violet-200/10 bg-violet-200/[0.03]"}`}>
              <p className="text-[11px] font-semibold text-slate-400">{item.name}</p><p className="mt-1 text-[12px] leading-4 text-slate-300">{formatAnswer(item.value)}</p>
            </div>
          ))}
          {override !== undefined ? <div className="rounded-lg border border-cyan-200/15 bg-cyan-200/[0.04] p-2.5"><p className="text-[11px] font-semibold text-cyan-100/65">Presenter refinement</p><p className="mt-1 text-[12px] text-slate-200">{formatAnswer(override)}</p></div> : null}
        </div>
        <p className="mt-3 text-[11px] text-slate-400">Role lenses: {question.relevantRoles.map((role) => STAKEHOLDER_ROLES.find((item) => item.id === role)?.label).filter(Boolean).join(" · ")}</p>
      </div>
    </Panel>
  );
}

function defaultValue(question: StudioQuestion): StudioAnswerValue {
  if (question.kind === "multi") return [];
  if (question.kind === "number") return 0;
  return "";
}

function toggleValue(current: StudioAnswerValue, option: string, kind: StudioQuestion["kind"]): StudioAnswerValue {
  if (kind === "single") return option;
  const values = Array.isArray(current) ? current : [];
  if (option === "not-sure") return values.includes("not-sure") ? [] : ["not-sure"];
  const withoutUnknown = values.filter((value) => value !== "not-sure");
  return withoutUnknown.some((value) => value === option || (option === "other" && value.startsWith("other:")))
    ? withoutUnknown.filter((value) => value !== option && !(option === "other" && value.startsWith("other:")))
    : [...withoutUnknown, option];
}

function optionActive(value: StudioAnswerValue, option: string) {
  const values = Array.isArray(value) ? value : [String(value)];
  return values.some((item) => item === option || (option === "other" && item.startsWith("other:")));
}

function hasOther(value: StudioAnswerValue) {
  return (Array.isArray(value) ? value : [String(value)]).some((item) => item === "other" || item.startsWith("other:"));
}

function extractOther(value: StudioAnswerValue | undefined) {
  const item = (Array.isArray(value) ? value : value === undefined ? [] : [String(value)]).find((entry) => entry.startsWith("other:"));
  return item?.slice(6) ?? "";
}

function validValue(value: StudioAnswerValue) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return Number.isFinite(value);
}
