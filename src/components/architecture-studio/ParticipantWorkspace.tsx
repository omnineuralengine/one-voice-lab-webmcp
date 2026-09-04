"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { ArchitectureDiagram } from "@/components/architecture-studio/ArchitectureDiagram";
import { DiscoveryQuestionCard } from "@/components/architecture-studio/DiscoveryQuestionCard";
import { RecommendationPanel } from "@/components/architecture-studio/RecommendationPanel";
import { EmptyState, Panel, PanelHeading, ParticipantStack, SessionHeader, StageRail, StatusPill, StudioFrame, studioButton, studioInput, studioPrimaryButton } from "@/components/architecture-studio/StudioPrimitives";
import { QUESTIONS_BY_STAGE, STAKEHOLDER_ROLES, getQuestion, getStage } from "@/data/architecture-studio-discovery";
import { getFailureScenario } from "@/data/architecture-studio-failures";
import { useArchitectureStudioSession, useStoredParticipantCredentials, writeParticipantCredentials } from "@/hooks/use-architecture-studio-session";
import { buildArchitectureTopology } from "@/lib/architecture-studio/architecture";
import { applyArchitectureRevisions, buildGeneratedCanvasSnapshot } from "@/lib/architecture-studio/architecture-workspace";
import { recommendArchitecture, resolveDiscoveryProfile } from "@/lib/architecture-studio/recommendation-engine";
import type { StakeholderRole, StudioAnswerValue, StudioRecommendationPath, StudioStageId } from "@/types/architecture-studio";

const PATH_LABELS: Record<StudioRecommendationPath, string> = {
  "speech-intelligence": "Speech intelligence",
  "composable-voice": "Composable stack",
  "managed-voice-agent": "Managed agent",
  "private-deployment": "Private path",
  "evaluation-first": "Evaluation first",
};

export function ParticipantWorkspace({ code }: { code: string }) {
  const studio = useArchitectureStudioSession({ code });
  const credentials = useStoredParticipantCredentials(code);
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<StakeholderRole>("vp-customer-experience");
  const [joining, setJoining] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [viewStageOverride, setViewStageOverride] = useState<StudioStageId | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const mutateRef = useRef(studio.mutate);
  const credentialParticipantId = credentials?.participantId;
  const credentialParticipantToken = credentials?.participantToken;

  useEffect(() => { mutateRef.current = studio.mutate; }, [studio.mutate]);
  useEffect(() => {
    if (!credentialParticipantId || !credentialParticipantToken) return;
    const heartbeat = window.setInterval(() => {
      void mutateRef.current({ type: "heartbeat", participantId: credentialParticipantId, participantToken: credentialParticipantToken }).catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(heartbeat);
  }, [credentialParticipantId, credentialParticipantToken]);

  async function join() {
    if (!studio.session) return;
    setJoining(true);
    setActionError("");
    try {
      const result = await studio.mutate({ type: "join", displayName, role });
      if (!result.participantId || !result.participantToken) throw new Error("join_failed");
      const next = { participantId: result.participantId, participantToken: result.participantToken };
      writeParticipantCredentials(code, next.participantId, next.participantToken);
    } catch {
      setActionError("Could not join the temporary session. Retry or ask the presenter for a new link.");
    } finally { setJoining(false); }
  }

  async function answer(questionId: string, value: StudioAnswerValue) {
    if (!credentials) return;
    setSaving(true);
    setActionError("");
    try {
      await studio.mutate({ type: "answer", ...credentials, questionId, value });
    } catch { setActionError("Your contribution did not save. The workspace will keep trying to reconnect."); }
    finally { setSaving(false); }
  }

  async function react(path: StudioRecommendationPath) {
    if (!credentials) return;
    try { await studio.mutate({ type: "react", ...credentials, path }); }
    catch { setActionError("The reaction did not save. Try again after the connection recovers."); }
  }

  if (studio.loading) return <LoadingWorkspace />;
  if (!studio.session) return <UnavailableWorkspace message={studio.error} />;

  const session = studio.session;
  const viewStage = viewStageOverride ?? session.activeStageId;
  const revealedInStage = QUESTIONS_BY_STAGE[viewStage].filter((question) => session.revealedQuestionIds.includes(question.id));
  const selectedQuestion = getQuestion(selectedQuestionId);
  const activeQuestion = selectedQuestion && revealedInStage.some((question) => question.id === selectedQuestion.id) ? selectedQuestion : revealedInStage.at(-1);
  const recommendation = recommendArchitecture(session);
  const topology = buildArchitectureTopology(session, recommendation.primaryPath);
  const profile = resolveDiscoveryProfile(session);
  const participant = credentials ? session.participants.find((item) => item.id === credentials.participantId) : null;
  const reacted = credentials ? session.reactions[recommendation.primaryPath]?.includes(credentials.participantId) : false;

  return (
    <StudioFrame>
      <SessionHeader session={session} connectionStatus={studio.connectionStatus} connectedCount={studio.connectedCount} presenter={false} actions={<Link href="/architecture-studio" className={studioButton}>Leave</Link>} />
      <div className="mx-auto max-w-[1800px] px-3 py-4 sm:px-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-[#071016]/60 p-3">
          <div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Shared fictional customer · synthetic demo data</p><p className="mt-1 text-sm font-semibold text-white">{session.scenarioName ?? "Fictional customer"}</p></div>
          <ParticipantStack session={session} />
        </div>

        {actionError ? <p role="alert" className="mb-4 rounded-lg border border-rose-200/15 bg-rose-200/[0.05] p-3 text-xs text-rose-100">{actionError}</p> : null}
        {session.architectureSimulation?.activeFailure ? <SharedIncidentPanel session={session} /> : null}

        <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_360px]">
          <aside className="hidden xl:block"><StageRail session={session} activeStageId={viewStage} onSelect={(stageId) => { setViewStageOverride(stageId); const revealed = QUESTIONS_BY_STAGE[stageId].filter((question) => session.revealedQuestionIds.includes(question.id)); setSelectedQuestionId(revealed.at(-1)?.id ?? ""); }} /></aside>

          <div className="min-w-0 space-y-4">
            <div className="flex gap-2 overflow-x-auto pb-1 xl:hidden" aria-label="Discovery stages">{Object.keys(QUESTIONS_BY_STAGE).map((stageId) => <button key={stageId} type="button" onClick={() => setViewStageOverride(stageId as StudioStageId)} className={`${studioButton} shrink-0 ${viewStage === stageId ? "border-cyan-200/35 bg-cyan-200/[0.08]" : ""}`}>{getStage(stageId as StudioStageId).shortLabel}</button>)}</div>
            {revealedInStage.length > 1 ? <div className="flex gap-2 overflow-x-auto rounded-xl border border-white/[0.07] bg-black/15 p-2">{revealedInStage.map((question, index) => <button key={question.id} type="button" onClick={() => setSelectedQuestionId(question.id)} className={`shrink-0 rounded-lg border px-3 py-2 text-[12px] font-semibold ${activeQuestion?.id === question.id ? "border-cyan-200/30 bg-cyan-200/[0.08] text-white" : "border-white/[0.07] text-slate-400"}`}>{index + 1}. {question.label}</button>)}</div> : null}
            {activeQuestion ? <DiscoveryQuestionCard key={`${activeQuestion.id}-${credentials?.participantId ?? "viewer"}`} question={activeQuestion} session={session} participantId={credentials?.participantId} onSave={(value) => answer(activeQuestion.id, value)} saving={saving} disabled={session.pausedStageIds.includes(viewStage)} /> : <EmptyState title={session.pausedStageIds.includes(viewStage) ? "This stage is paused" : "Waiting for the next question"} detail="The presenter is guiding the workshop one question at a time. You can revisit any previously revealed stage." />}

            <Panel className="overflow-hidden">
              <PanelHeading eyebrow="What I heard" title="Shared environment checkpoint" detail="Confirm the architecture is responding to the team’s actual inputs, not a hidden recommendation." actions={<StatusPill tone={session.confirmation === "confirmed" ? "green" : session.confirmation === "needs-correction" ? "amber" : "slate"}>{session.confirmation.replaceAll("-", " ")}</StatusPill>} />
              <div className="grid gap-3 p-4 sm:grid-cols-3">
                <HeardItem label="Priority" value={prettyList(profile.values["business-outcome"], "Still discovering the desired outcome")} />
                <HeardItem label="Use case" value={prettyList(profile.values["primary-use-case"], "Voice automation under evaluation")} />
                <HeardItem label="Constraint" value={prettyList(profile.values["data-control"], "Governance requirements still open")} />
              </div>
            </Panel>

            <Panel className="overflow-hidden">
              <PanelHeading eyebrow="Live architecture" title="Executive topology" detail="Customer-owned, Deepgram-managed, and third-party boundaries update as the shared profile changes." />
              <div className="p-3"><ArchitectureDiagram topology={topology} view="executive" /></div>
            </Panel>
          </div>

          <aside className="min-w-0 space-y-4">
            <RecommendationPanel session={session} compact />
            <Panel className="p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">React to the current path</p>
              <p className="mt-2 text-[12px] leading-4 text-slate-400">This is a directional vote, not an architecture approval.</p>
              <button type="button" disabled={!credentials} onClick={() => void react(recommendation.primaryPath)} className={`${reacted ? studioPrimaryButton : studioButton} mt-3 w-full`}>{reacted ? "✓ This is worth evaluating" : `Evaluate ${PATH_LABELS[recommendation.primaryPath]}`}</button>
              <p className="mt-2 text-center text-[11px] text-slate-400">{session.reactions[recommendation.primaryPath]?.length ?? 0} stakeholder reaction(s)</p>
            </Panel>
            {participant ? <Panel className="p-4"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Your role lens</p><p className="mt-2 text-sm font-semibold text-white">{STAKEHOLDER_ROLES.find((item) => item.id === participant.role)?.label}</p><p className="mt-2 text-[12px] leading-4 text-slate-400">{STAKEHOLDER_ROLES.find((item) => item.id === participant.role)?.focus}</p></Panel> : null}
          </aside>
        </div>
      </div>

      {!credentials || !participant ? <JoinDialog scenarioName={session.scenarioName ?? "the fictional customer"} name={displayName} role={role} joining={joining} error={actionError} onName={setDisplayName} onRole={setRole} onJoin={() => void join()} /> : null}
    </StudioFrame>
  );
}

function JoinDialog({ scenarioName, name, role, joining, error, onName, onRole, onJoin }: { scenarioName: string; name: string; role: StakeholderRole; joining: boolean; error: string; onName: (name: string) => void; onRole: (role: StakeholderRole) => void; onJoin: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm"><section role="dialog" aria-modal="true" aria-labelledby="join-title" className="w-full max-w-2xl overflow-hidden rounded-2xl border border-cyan-200/20 bg-[#071016] shadow-2xl"><div className="border-b border-white/[0.08] p-5"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-100/65">Simulated discovery workspace · synthetic demo data</p><h1 id="join-title" className="mt-2 text-xl font-semibold text-white">Join {scenarioName}’s fictional stakeholder team</h1><p className="mt-2 text-xs leading-5 text-slate-400">No account required. Use a fictional name or role label. Do not enter real customer or personal information.</p></div><div className="p-5"><label><span className="mb-1.5 block text-[12px] font-semibold text-slate-400">Display name (optional)</span><input autoFocus value={name} onChange={(event) => onName(event.target.value)} maxLength={48} className={studioInput} placeholder="e.g. Voice Platform Engineer" /></label><fieldset className="mt-4"><legend className="text-[12px] font-semibold text-slate-400">Stakeholder role</legend><div className="mt-2 grid gap-2 sm:grid-cols-3">{STAKEHOLDER_ROLES.slice(0, 3).map((item) => <button key={item.id} type="button" onClick={() => onRole(item.id)} className={`rounded-xl border p-3 text-left focus-visible:outline-2 focus-visible:outline-cyan-200 ${role === item.id ? "border-cyan-200/35 bg-cyan-200/[0.08]" : "border-white/[0.08] bg-black/15"}`}><span className="text-xs font-semibold text-white">{item.label}</span><span className="mt-1 block text-[11px] leading-4 text-slate-400">{item.focus}</span></button>)}</div></fieldset>{error ? <p role="alert" className="mt-4 text-[12px] text-rose-100">{error}</p> : null}<button type="button" onClick={onJoin} disabled={joining} className={`${studioPrimaryButton} mt-5 w-full`}>{joining ? "Joining…" : "Join shared session"}</button></div></section></div>;
}

function HeardItem({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-white/[0.07] bg-black/15 p-3"><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p><p className="mt-2 text-[11px] leading-5 text-slate-300">{value}</p></div>; }

function SharedIncidentPanel({ session }: { session: NonNullable<ReturnType<typeof useArchitectureStudioSession>["session"]> }) {
  const simulation = session.architectureSimulation;
  const active = simulation.activeFailure;
  if (!active) return null;
  const scenario = getFailureScenario(active.scenarioId);
  const architecture = applyArchitectureRevisions(buildGeneratedCanvasSnapshot(session), simulation.revisions);
  const impactMap = new Map((simulation.propagation?.nodeImpacts ?? []).map((impact) => [impact.nodeId, impact]));
  const impacted = architecture.nodes.filter((node) => ["originating-failure", "directly-affected", "downstream-symptom", "unobservable"].includes(impactMap.get(node.id)?.relationship ?? ""));
  return <Panel className="mb-4 overflow-hidden border-rose-200/15"><PanelHeading eyebrow="Simulated incident · no production action" title={scenario?.title ?? active.scenarioId} detail="The presenter injected a deterministic fictional failure. Origin, affected components, downstream symptoms, and missing visibility are shown separately." actions={<StatusPill tone="rose">{active.state} · {active.severity}</StatusPill>} /><div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4">{impacted.map((node) => { const impact = impactMap.get(node.id)!; return <div key={node.id} className="rounded-lg border border-white/[0.08] bg-black/15 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-rose-100/70">{impact.relationship.replaceAll("-", " ")}</p><p className="mt-1 text-[12px] font-semibold text-white">{node.displayName}</p><p className="mt-1 text-[10px] leading-4 text-slate-400">{impact.explanation}</p></div>; })}</div></Panel>;
}

function prettyList(value: StudioAnswerValue | undefined, fallback: string) { const values = Array.isArray(value) ? value : value ? [String(value)] : []; return values.length ? values.map((item) => item.replaceAll("-", " ")).join(", ") : fallback; }

function LoadingWorkspace() { return <StudioFrame><div className="grid min-h-screen place-items-center"><div role="status" className="text-center"><span className="mx-auto block size-8 animate-spin rounded-full border-2 border-cyan-200/20 border-t-cyan-200 motion-reduce:animate-none" /><p className="mt-4 text-xs text-slate-400">Joining the temporary workshop…</p></div></div></StudioFrame>; }

function UnavailableWorkspace({ message }: { message: string }) { return <StudioFrame><div className="grid min-h-screen place-items-center p-6"><div className="max-w-md rounded-2xl border border-white/10 bg-[#071016] p-6 text-center"><h1 className="text-xl font-semibold text-white">Session unavailable</h1><p className="mt-3 text-sm leading-6 text-slate-400">{message || "This code is invalid or the temporary session has expired."}</p><Link href="/architecture-studio" className={`${studioPrimaryButton} mt-6`}>Return to Studio</Link></div></div></StudioFrame>; }
