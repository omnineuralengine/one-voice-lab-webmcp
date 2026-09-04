"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { ModulePageShell } from "@/components/one";
import { STUDIO_STAGES, STAKEHOLDER_ROLES, getQuestion } from "@/data/architecture-studio-discovery";
import type { PublicStudioSession, StudioStageId } from "@/types/architecture-studio";

export const studioButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.055] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-cyan-200/30 hover:bg-cyan-200/[0.08] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 disabled:cursor-not-allowed disabled:opacity-45";
export const studioPrimaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-cyan-200/35 bg-cyan-200 px-4 py-2 text-xs font-bold text-slate-950 shadow-[0_8px_30px_rgba(34,211,238,0.12)] transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-100 disabled:cursor-not-allowed disabled:opacity-45";
export const studioInput = "min-h-11 w-full rounded-lg border border-white/10 bg-[#03080d] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-400 focus:border-cyan-200/45 focus:ring-2 focus:ring-cyan-200/10";

export function StudioFrame({ children }: { children: ReactNode }) {
  return (
    <ModulePageShell className="architecture-studio min-h-screen bg-[#020608] text-slate-100" evolutionModuleId="architecture">
      <div className="min-h-screen bg-[radial-gradient(circle_at_12%_0%,rgba(34,211,238,0.08),transparent_26%),radial-gradient(circle_at_88%_6%,rgba(139,92,246,0.07),transparent_24%),linear-gradient(180deg,#071016_0%,#020608_58%)]">
        {children}
      </div>
    </ModulePageShell>
  );
}

export function StudioBrand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/architecture-studio" className="group flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-cyan-200">
      <span className="relative flex size-10 shrink-0 items-center justify-center rounded-xl border border-cyan-200/25 bg-cyan-200/[0.08] text-cyan-100">
        <span className="absolute inset-2 rounded-full border border-cyan-200/25" />
        <span className="h-px w-5 rotate-45 bg-cyan-100" />
        <span className="absolute h-px w-5 -rotate-45 bg-violet-200/70" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-white">Voice Architecture Studio</span>
        {!compact ? <span className="block truncate text-[12px] uppercase tracking-[0.16em] text-slate-400">ONE Voice Lab · simulated workshop</span> : null}
      </span>
    </Link>
  );
}

export function PrototypeNotice() {
  return (
    <div className="border-y border-amber-200/10 bg-amber-200/[0.035] px-4 py-2 text-center text-[12px] leading-4 text-amber-50/75">
      Fictional prototype · Do not enter real customer secrets or personal data · Technical and commercial validation required · No pricing, legal, or compliance commitment
    </div>
  );
}

export function SessionHeader({
  session,
  connectionStatus,
  connectedCount,
  presenter,
  actions,
}: {
  session: PublicStudioSession;
  connectionStatus: string;
  connectedCount: number;
  presenter: boolean;
  actions?: ReactNode;
}) {
  const answered = new Set(session.answers.filter((answer) => answer.participantId !== "scenario").map((answer) => answer.questionId)).size + Object.keys(session.presenterOverrides).length;
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#061016]/94 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3">
          <StudioBrand compact />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span role="status" aria-live="polite">
              <StatusPill tone={connectionStatus === "live" ? "green" : connectionStatus === "local-demo" ? "amber" : "violet"}>
                {connectionStatus === "local-demo" ? "Local Demo Mode" : connectionStatus === "live" ? `Live · ${Math.max(connectedCount, 1)} connected` : connectionStatus}
              </StatusPill>
            </span>
            <StatusPill tone="cyan">Session {session.code}</StatusPill>
            <StatusPill tone="slate">{answered} live answers</StatusPill>
            <StatusPill tone={presenter ? "violet" : "slate"}>{presenter ? "Presenter console" : "Participant view"}</StatusPill>
            {actions}
          </div>
        </div>
      </header>
      <PrototypeNotice />
    </>
  );
}

export function StageRail({
  session,
  activeStageId,
  onSelect,
  presenter = false,
  onTogglePause,
}: {
  session: PublicStudioSession;
  activeStageId: StudioStageId;
  onSelect: (stageId: StudioStageId) => void;
  presenter?: boolean;
  onTogglePause?: (stageId: StudioStageId) => void;
}) {
  return (
    <nav aria-label="Discovery stages" className="space-y-1.5">
      {STUDIO_STAGES.map((stage) => {
        const active = stage.id === activeStageId;
        const stageQuestions = session.revealedQuestionIds.filter((id) => getQuestion(id)?.stageId === stage.id);
        const paused = session.pausedStageIds.includes(stage.id);
        return (
          <div key={stage.id} className={`rounded-xl border transition ${active ? "border-cyan-200/30 bg-cyan-200/[0.07]" : "border-white/[0.07] bg-black/15"}`}>
            <button type="button" onClick={() => onSelect(stage.id)} className="flex w-full items-start gap-3 rounded-xl p-3 text-left focus-visible:outline-2 focus-visible:outline-cyan-200">
              <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border font-mono text-[12px] font-bold ${active ? "border-cyan-200/40 bg-cyan-200 text-slate-950" : "border-white/10 bg-white/[0.04] text-slate-400"}`}>{stage.number}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-white">{stage.shortLabel}</span>
                <span className="mt-1 block text-[12px] leading-4 text-slate-400">{stage.purpose}</span>
              </span>
              {paused ? <span className="rounded bg-amber-200/10 px-1.5 py-0.5 text-[12px] font-bold uppercase tracking-wider text-amber-100">Paused</span> : null}
            </button>
            {presenter && onTogglePause ? (
              <button type="button" onClick={() => onTogglePause(stage.id)} className="mb-2 ml-12 text-[11px] font-semibold text-slate-400 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-200">
                {paused ? "Reopen section" : "Pause section"} · {stageQuestions.length ? "shared" : "ready"}
              </button>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

export function ParticipantStack({ session }: { session: PublicStudioSession }) {
  const referenceTime = new Date(session.updatedAt).getTime();
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={`${session.participants.length} session participants`}>
      {session.participants.length === 0 ? <span className="text-[12px] text-slate-400">Waiting for stakeholder contributors…</span> : null}
      {session.participants.map((participant) => {
        const role = STAKEHOLDER_ROLES.find((item) => item.id === participant.role);
        const recent = referenceTime - new Date(participant.lastSeenAt).getTime() < 45_000;
        return (
          <span key={participant.id} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1 pl-1 pr-2.5" title={role?.focus}>
            <span className="relative flex size-6 items-center justify-center rounded-full bg-violet-200/10 text-[11px] font-bold text-violet-100">
              {initials(participant.displayName)}
              <span className={`absolute bottom-0 right-0 size-1.5 rounded-full ring-2 ring-[#071016] ${recent ? "bg-emerald-300" : "bg-slate-600"}`} />
            </span>
            <span className="max-w-40 truncate text-[12px] font-semibold text-slate-300">{participant.displayName}</span>
          </span>
        );
      })}
    </div>
  );
}

export function StatusPill({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "cyan" | "green" | "amber" | "violet" | "rose" }) {
  const tones = {
    slate: "border-white/10 bg-white/[0.04] text-slate-400",
    cyan: "border-cyan-200/20 bg-cyan-200/[0.07] text-cyan-100",
    green: "border-emerald-200/20 bg-emerald-200/[0.07] text-emerald-100",
    amber: "border-amber-200/20 bg-amber-200/[0.07] text-amber-100",
    violet: "border-violet-200/20 bg-violet-200/[0.07] text-violet-100",
    rose: "border-rose-200/20 bg-rose-200/[0.07] text-rose-100",
  };
  return <span className={`inline-flex min-h-7 items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${tones[tone]}`}>{children}</span>;
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-white/[0.08] bg-[#071016]/78 shadow-[0_18px_60px_rgba(0,0,0,0.22)] ${className}`}>{children}</section>;
}

export function PanelHeading({ eyebrow, title, detail, actions }: { eyebrow?: string; title: string; detail?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.07] px-4 py-3.5">
      <div className="min-w-0">
        {eyebrow ? <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-100/60">{eyebrow}</p> : null}
        <h2 className="mt-1 text-sm font-semibold text-white">{title}</h2>
        {detail ? <p className="mt-1 max-w-2xl text-[12px] leading-4 text-slate-400">{detail}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="grid min-h-40 place-items-center p-6 text-center"><div><p className="text-sm font-semibold text-slate-300">{title}</p><p className="mx-auto mt-2 max-w-md text-[11px] leading-5 text-slate-400">{detail}</p></div></div>;
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}
