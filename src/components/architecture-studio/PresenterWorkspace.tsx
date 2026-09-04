"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";

import { ArchitectureDiagram } from "@/components/architecture-studio/ArchitectureDiagram";
import { ArchitectureAiLayer } from "@/components/ai/ArchitectureAiLayer";
import { ArchitectureEditor } from "@/components/architecture-studio/ArchitectureEditor";
import { AssumptionsOpenQuestionsPanel } from "@/components/architecture-studio/AssumptionsOpenQuestionsPanel";
import { DiscoveryQuestionCard } from "@/components/architecture-studio/DiscoveryQuestionCard";
import { DiagnosticsWorkspace } from "@/components/architecture-studio/DiagnosticsWorkspace";
import { ExecutiveHandoffWorkspace } from "@/components/architecture-studio/ExecutiveHandoffWorkspace";
import { PackageEvidencePanel } from "@/components/architecture-studio/PackageEvidencePanel";
import { RecommendationPanel } from "@/components/architecture-studio/RecommendationPanel";
import { SolutionBriefPanel } from "@/components/architecture-studio/SolutionBriefPanel";
import { Panel, PanelHeading, ParticipantStack, SessionHeader, StageRail, StatusPill, StudioFrame, studioButton, studioInput, studioPrimaryButton } from "@/components/architecture-studio/StudioPrimitives";
import { ValidationPlanPanel } from "@/components/architecture-studio/ValidationPlanPanel";
import { QUESTIONS_BY_STAGE, STUDIO_QUESTIONS, getQuestion, getStage } from "@/data/architecture-studio-discovery";
import { readLocalPresenterToken, readPresenterNavigationToken, useArchitectureStudioSession } from "@/hooks/use-architecture-studio-session";
import { buildArchitectureTopology, generatedLabBacklog, recommendLabs } from "@/lib/architecture-studio/architecture";
import { logStudioEvent } from "@/lib/architecture-studio/safe-log";
import { recommendArchitecture, resolveDiscoveryProfile } from "@/lib/architecture-studio/recommendation-engine";
import type { StudioAnswerValue, StudioNextStep, StudioPresenterCommand, StudioStageId } from "@/types/architecture-studio";

type PresenterTab = "discover" | "architecture" | "diagnostics" | "evidence" | "brief" | "handoff";

export function PresenterWorkspace({ code }: { code: string }) {
  const token = useSyncExternalStore(
    subscribeToPresenterToken,
    () => readPresenterNavigationToken(code) ?? readLocalPresenterToken(code) ?? "",
    () => "",
  );
  const studio = useArchitectureStudioSession({ code, presenterToken: token });
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [tab, setTab] = useState<PresenterTab>("discover");
  const [viewStageOverride, setViewStageOverride] = useState<StudioStageId | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [diagramView, setDiagramView] = useState<"executive" | "technical">("technical");
  const sessionMode = studio.session?.realtimeMode;

  useEffect(() => {
    if (!sessionMode) return;
    let active = true;
    async function verify() {
      if (sessionMode === "local-demo") {
        if (active) setAuthorized(readLocalPresenterToken(code) === token);
        return;
      }
      try {
        const response = await fetch(`/api/architecture-studio/sessions/${code}/presenter`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ presenterToken: token }) });
        const payload = await response.json() as { authorized?: boolean };
        if (active) setAuthorized(response.ok && payload.authorized === true);
      } catch { if (active) setAuthorized(false); }
    }
    void verify();
    return () => { active = false; };
  }, [code, sessionMode, token]);

  async function command(commandValue: StudioPresenterCommand) {
    setBusy(true);
    setMessage("");
    try { await studio.mutate({ type: "presenter", presenterToken: token, command: commandValue }); }
    catch { setMessage("Presenter action failed. Check the session connection and token, then retry."); }
    finally { setBusy(false); }
  }

  async function copyParticipantLink() {
    const link = `${window.location.origin}/architecture-studio/session/${code}`;
    try {
      await navigator.clipboard.writeText(link);
      setMessage("Participant link copied.");
    } catch {
      setMessage(`Copy was blocked. Share this participant link manually: ${link}`);
    }
  }

  function verifyLabNavigation(labId: string, href: string, label: string) {
    setMessage(`${label} opened in a new tab. This session remains active.`);
    void fetch(href, { method: "HEAD", cache: "no-store" }).then((response) => {
      if (!response.ok) logStudioEvent("lab_navigation_failure", { code, reason: `${labId}_${response.status}` });
    }).catch(() => logStudioEvent("lab_navigation_failure", { code, reason: `${labId}_network` }));
  }

  async function resetSession() {
    if (!window.confirm("Reset all live answers, notes, assumptions, decisions, reactions, and the saved brief for this temporary session?")) return;
    await command({ kind: "reset" });
    setTab("discover");
    setMessage(`Session reset to the seeded ${studio.session?.scenarioName ?? "fictional"} scenario.`);
  }

  async function deleteSession() {
    if (!window.confirm("Delete this temporary session now? This cannot be recovered.")) return;
    try { await studio.deleteSession(); window.location.assign("/architecture-studio"); }
    catch { setMessage("The temporary session could not be deleted. Retry after reconnecting."); }
  }

  if (studio.loading) return <PresenterLoading />;
  if (!studio.session) return <PresenterUnavailable message={studio.error} />;
  if (authorized === null) return <PresenterLoading />;
  if (!authorized) return <PresenterUnauthorized />;

  const session = studio.session;
  const viewStage = viewStageOverride ?? session.activeStageId;
  const profile = resolveDiscoveryProfile(session);
  const recommendation = recommendArchitecture(session);
  const topology = buildArchitectureTopology(session, recommendation.primaryPath);
  const labs = recommendLabs(session, recommendation.primaryPath);
  const backlog = generatedLabBacklog(labs);
  const stageQuestions = QUESTIONS_BY_STAGE[viewStage];
  const selectedQuestion = getQuestion(selectedQuestionId);
  const activeQuestion = selectedQuestion && selectedQuestion.stageId === viewStage ? selectedQuestion : stageQuestions.filter((question) => session.revealedQuestionIds.includes(question.id)).at(-1) ?? stageQuestions[0];
  const nextBestQuestion = findNextBestQuestion(session.revealedQuestionIds, viewStage);
  const answeredCritical = profile.answeredCritical;
  const progress = Math.round(answeredCritical / Math.max(1, profile.totalCritical) * 100);

  return (
    <StudioFrame>
      <SessionHeader session={session} connectionStatus={studio.connectionStatus} connectedCount={studio.connectedCount} presenter actions={<><button type="button" onClick={() => void copyParticipantLink()} className={studioButton}>Copy participant link</button><button type="button" onClick={() => void resetSession()} className={studioButton}>Reset</button><button type="button" onClick={() => void deleteSession()} className={`${studioButton} text-rose-100`}>Delete now</button></>} />

      <div className="mx-auto max-w-[1900px] px-3 py-4 sm:px-4">
        <div className="mb-4 grid gap-3 rounded-xl border border-white/[0.07] bg-[#071016]/60 p-3 lg:grid-cols-[1fr_auto_auto] lg:items-center">
          <div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{session.scenarioName ?? "Fictional customer"} · shared workshop</p><div className="mt-1"><ParticipantStack session={session} /></div></div>
          <div className="min-w-56"><div className="flex justify-between text-[11px] text-slate-400"><span>Critical discovery</span><span>{answeredCritical}/{profile.totalCritical}</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-cyan-200 transition-[width] motion-reduce:transition-none" style={{ width: `${progress}%` }} /></div></div>
          <div className="flex flex-wrap gap-2"><select aria-label="Technical depth" value={session.technicalDepth} onChange={(event) => { const value = event.target.value as typeof session.technicalDepth; setDiagramView(value === "executive" ? "executive" : "technical"); void command({ kind: "set_depth", value }); }} className={`${studioInput} min-h-9 w-auto py-1.5 text-[12px]`}><option value="executive">Executive depth</option><option value="balanced">Balanced depth</option><option value="technical">Technical depth</option></select><select aria-label="Language style" value={session.languageMode} onChange={(event) => void command({ kind: "set_language_mode", value: event.target.value as typeof session.languageMode })} className={`${studioInput} min-h-9 w-auto py-1.5 text-[12px]`}><option value="plain">Executive language</option><option value="technical">Technical language</option></select></div>
        </div>

        {message ? <p role="status" aria-live="polite" className="mb-4 rounded-lg border border-cyan-200/12 bg-cyan-200/[0.04] p-3 text-[12px] text-cyan-50">{message}</p> : null}

        <div className="mb-4 flex w-full max-w-full gap-1 overflow-x-auto rounded-xl border border-white/[0.08] bg-black/20 p-1" role="tablist" aria-label="Presenter workspace views">
          {(["discover", "architecture", "diagnostics", "evidence", "brief", "handoff"] as PresenterTab[]).map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`min-h-10 shrink-0 rounded-lg px-3 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-cyan-200 sm:flex-1 ${tab === item ? "bg-cyan-200 text-slate-950" : "text-slate-400 hover:bg-white/[0.05] hover:text-white"}`}>{item === "discover" ? "Discovery" : item === "architecture" ? "Proposed Architecture" : item === "diagnostics" ? "Failure Diagnostics" : item === "evidence" ? "Recommendation Evidence" : item === "brief" ? "Solution Brief" : "Executive Handoff"}</button>)}
        </div>

        {tab === "discover" ? (
          <div className="grid gap-4 xl:grid-cols-[230px_minmax(0,1fr)_390px]">
            <aside className="space-y-3"><StageRail session={session} activeStageId={viewStage} presenter onSelect={(stageId) => { setViewStageOverride(stageId); const questions = QUESTIONS_BY_STAGE[stageId]; const last = questions.filter((question) => session.revealedQuestionIds.includes(question.id)).at(-1); setSelectedQuestionId(last?.id ?? questions[0].id); void command({ kind: "set_stage", stageId }); }} onTogglePause={(stageId) => void command({ kind: "toggle_stage_pause", stageId })} /><Panel className="p-3"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Unanswered critical</p><p className="mt-2 text-3xl font-semibold text-white">{profile.totalCritical - profile.answeredCritical}</p><p className="mt-1 text-[11px] text-slate-400">Unknowns are visible evaluation work, not missing confidence theater.</p></Panel></aside>

            <div className="min-w-0 space-y-4">
              <Panel className="overflow-hidden">
                <PanelHeading eyebrow={`Stage ${getStage(viewStage).number} · facilitator`} title={nextBestQuestion ? `Next best question: ${nextBestQuestion.label}` : "Stage evidence captured"} detail={nextBestQuestion?.whyItMatters ?? "Move to the next stage or confirm what the room heard."} actions={nextBestQuestion ? <button type="button" disabled={busy} onClick={() => { setSelectedQuestionId(nextBestQuestion.id); void command({ kind: "reveal_question", questionId: nextBestQuestion.id }); }} className={studioPrimaryButton}>Reveal to participants</button> : null} />
                <div className="flex gap-2 overflow-x-auto p-2">{stageQuestions.map((question, index) => { const revealed = session.revealedQuestionIds.includes(question.id); return <button key={question.id} type="button" onClick={() => setSelectedQuestionId(question.id)} className={`shrink-0 rounded-lg border px-3 py-2 text-[12px] ${activeQuestion.id === question.id ? "border-cyan-200/35 bg-cyan-200/[0.08] text-white" : revealed ? "border-emerald-200/15 text-emerald-100/70" : "border-white/[0.07] text-slate-400"}`}>{index + 1}. {question.label}{revealed ? " · shared" : ""}</button>; })}</div>
              </Panel>
              <DiscoveryQuestionCard key={activeQuestion.id} question={activeQuestion} session={session} presenter onOverride={(value) => command({ kind: "override_answer", questionId: activeQuestion.id, value })} saving={busy} />
              <WhatIHeard session={session} onCommand={command} />
              <FacilitationTools session={session} onCommand={command} />
            </div>

            <aside className="min-w-0 space-y-4"><RecommendationPanel session={session} compact={session.technicalDepth === "executive"} /><TalkingPoint session={session} /><Priorities profile={profile.values} disagreements={profile.disagreements.length} /></aside>
          </div>
        ) : null}

        {tab === "architecture" ? (
          <div className="space-y-4">
            <Panel className="overflow-hidden"><PanelHeading eyebrow="Live topology" title={recommendation.title} detail="Audio, transcript, control, and business-data flows. Latency badges mark measurement points—not performance claims. Dashed amber modules are operator overrides." actions={<div className="flex gap-2"><button type="button" onClick={() => setDiagramView("executive")} className={diagramView === "executive" ? studioPrimaryButton : studioButton}>Executive</button><button type="button" onClick={() => setDiagramView("technical")} className={diagramView === "technical" ? studioPrimaryButton : studioButton}>Technical</button></div>} /><div className="p-3"><ArchitectureDiagram topology={topology} view={diagramView} /></div></Panel>
            <ArchitectureEditor session={session} topology={topology} disabled={busy} onCommand={command} />
            <ArchitectureAiLayer session={session} onAcceptProposal={(proposal) => { void command({ kind: "add_assumption", text: proposal }); setMessage("AI finding accepted as an unvalidated assumption. The deterministic recommendation was not changed automatically."); }} />
            <div className="grid gap-4 lg:grid-cols-[1fr_380px]"><Panel className="overflow-hidden"><PanelHeading eyebrow="Learning Lab handoff" title="Choose the next proof point" detail="Labs open in a new tab so the live session remains intact. Planned items never create broken links." /><div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">{labs.map((lab) => <article key={lab.id} className="flex min-h-36 flex-col rounded-xl border border-white/[0.08] bg-black/15 p-4"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-white">{lab.label}</h3><StatusPill tone={lab.status === "available" ? "green" : "amber"}>{lab.status}</StatusPill></div><p className="mt-2 flex-1 text-[12px] leading-4 text-slate-400">{lab.reason}</p>{lab.href ? <a href={lab.href} target="_blank" rel="noreferrer" onClick={() => verifyLabNavigation(lab.id, lab.href!, lab.label)} className={`${studioButton} mt-3`}>Launch relevant lab ↗</a> : <span className="mt-3 text-[11px] text-amber-100/65">Added to generated backlog</span>}</article>)}</div></Panel><div className="space-y-4"><RecommendationPanel session={session} compact />{backlog.length ? <Panel className="p-4"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-100/70">Generated backlog</p><ul className="mt-2 space-y-2">{backlog.map((item) => <li key={item.id} className="text-[12px] leading-4 text-slate-400"><span className="font-semibold text-slate-300">{item.label}</span> — {item.reason}</li>)}</ul></Panel> : null}</div></div>
          </div>
        ) : null}

        {tab === "diagnostics" ? <DiagnosticsWorkspace session={session} busy={busy} onCommand={command} /> : null}

        {tab === "evidence" ? <div className="space-y-4"><PackageEvidencePanel session={session} /><AssumptionsOpenQuestionsPanel session={session} /><ValidationPlanPanel session={session} /></div> : null}

        {tab === "brief" ? <SolutionBriefPanel session={session} onGenerate={() => command({ kind: "generate_brief" })} onSaveSteps={async (steps: StudioNextStep[]) => { await command({ kind: "set_next_steps", steps }); await command({ kind: "generate_brief" }); }} /> : null}

        {tab === "handoff" ? <ExecutiveHandoffWorkspace session={session} busy={busy} onCommand={command} /> : null}
      </div>
    </StudioFrame>
  );
}

function subscribeToPresenterToken() {
  return () => undefined;
}

function findNextBestQuestion(revealed: string[], stageId: StudioStageId) {
  return QUESTIONS_BY_STAGE[stageId].find((question) => question.critical && !revealed.includes(question.id))
    ?? QUESTIONS_BY_STAGE[stageId].find((question) => !revealed.includes(question.id))
    ?? STUDIO_QUESTIONS.find((question) => question.critical && !revealed.includes(question.id));
}

function WhatIHeard({ session, onCommand }: { session: NonNullable<ReturnType<typeof useArchitectureStudioSession>["session"]>; onCommand: (command: StudioPresenterCommand) => Promise<void> }) {
  const profile = resolveDiscoveryProfile(session);
  return <Panel className="overflow-hidden"><PanelHeading eyebrow="Confirmation checkpoint" title="Does this reflect your environment?" detail="Summarize the room before allowing a recommendation to harden." actions={<div className="flex gap-2"><button type="button" onClick={() => void onCommand({ kind: "set_confirmation", value: "confirmed" })} className={session.confirmation === "confirmed" ? studioPrimaryButton : studioButton}>Reflects it</button><button type="button" onClick={() => void onCommand({ kind: "set_confirmation", value: "needs-correction" })} className={session.confirmation === "needs-correction" ? studioPrimaryButton : studioButton}>Needs correction</button></div>} /><div className="grid gap-3 p-4 sm:grid-cols-3"><SummaryFact label="Goal" value={pretty(profile.values["business-outcome"])} /><SummaryFact label="Existing stack" value={pretty(profile.values["existing-providers"])} /><SummaryFact label="Open decision" value={pretty(profile.values["pipeline-preference"] ?? "Managed vs composable remains open")} /></div></Panel>;
}

function FacilitationTools({ session, onCommand }: { session: NonNullable<ReturnType<typeof useArchitectureStudioSession>["session"]>; onCommand: (command: StudioPresenterCommand) => Promise<void> }) {
  const [note, setNote] = useState(""); const [assumption, setAssumption] = useState(""); const [parking, setParking] = useState(""); const [decision, setDecision] = useState(""); const [rationale, setRationale] = useState("");
  return <div className="grid gap-4 lg:grid-cols-2"><FacilitationPanel title="Live notes" value={note} onValue={setNote} placeholder="Concise presenter-only note" button="Add note" items={session.presenterNotes} onAdd={async () => { await onCommand({ kind: "add_note", text: note }); setNote(""); }} /><Panel className="overflow-hidden"><PanelHeading eyebrow="Assumption tracker" title="Make uncertainty explicit" /><div className="p-4"><InlineAdd value={assumption} onValue={setAssumption} placeholder="Assumption requiring validation" button="Track" onAdd={async () => { await onCommand({ kind: "add_assumption", text: assumption }); setAssumption(""); }} /><ul className="mt-3 space-y-2">{session.assumptions.map((item) => <li key={item.id} className="rounded-lg border border-white/[0.07] bg-black/15 p-2.5"><p className="text-[12px] leading-4 text-slate-300">{item.text}</p><div className="mt-2 flex gap-2">{(["unvalidated", "confirmed", "overridden"] as const).map((status) => <button key={status} type="button" onClick={() => void onCommand({ kind: "update_assumption", id: item.id, status })} className={`text-[12px] font-bold uppercase tracking-wider ${item.status === status ? "text-cyan-100" : "text-slate-400"}`}>{status}</button>)}</div></li>)}</ul></div></Panel><Panel className="overflow-hidden"><PanelHeading eyebrow="Parking lot" title="Protect the flow without losing questions" /><div className="p-4"><InlineAdd value={parking} onValue={setParking} placeholder="Question to revisit" button="Park" onAdd={async () => { await onCommand({ kind: "add_parking_lot", text: parking }); setParking(""); }} /><ul className="mt-3 space-y-2">{session.parkingLot.map((item) => <li key={item.id}><button type="button" onClick={() => void onCommand({ kind: "toggle_parking_lot", id: item.id })} className={`w-full rounded-lg border border-white/[0.07] p-2.5 text-left text-[12px] ${item.resolved ? "text-slate-400 line-through" : "text-slate-300"}`}>{item.resolved ? "✓ " : "○ "}{item.text}</button></li>)}</ul></div></Panel><Panel className="overflow-hidden"><PanelHeading eyebrow="Decision log" title="Record the why, not only the choice" /><div className="space-y-2 p-4"><input value={decision} onChange={(event) => setDecision(event.target.value)} className={studioInput} placeholder="Decision" /><input value={rationale} onChange={(event) => setRationale(event.target.value)} className={studioInput} placeholder="Rationale and evidence" /><button type="button" disabled={!decision.trim()} onClick={async () => { await onCommand({ kind: "add_decision", text: decision, rationale }); setDecision(""); setRationale(""); }} className={studioButton}>Log decision</button><ul className="mt-3 space-y-2">{session.decisions.map((item) => <li key={item.id} className="rounded-lg border border-white/[0.07] bg-black/15 p-2.5"><p className="text-[12px] font-semibold text-white">{item.text}</p><p className="mt-1 text-[11px] leading-4 text-slate-400">{item.rationale}</p></li>)}</ul></div></Panel></div>;
}

function TalkingPoint({ session }: { session: NonNullable<ReturnType<typeof useArchitectureStudioSession>["session"]> }) { const rec = recommendArchitecture(session); const influence = rec.influences.at(-1); const plain = session.languageMode === "plain"; const talkingPoint = influence ? plain ? `“What I heard is ${influence.answer.toLowerCase()}. That makes ${rec.title.toLowerCase()} the current starting point, with the remaining assumptions still to validate.”` : `“The ${influence.questionId} evidence is ${influence.answer.toLowerCase()}. ${influence.effect} I would validate this topology against the unresolved control, media, and production gates before commitment.”` : plain ? `“We do not have enough shared evidence for a responsible product choice yet. I would begin with a representative evaluation and agree on the decision gates.”` : `“The deterministic path scores remain under-specified. Establish the baseline, processing boundary, deployment constraints, and acceptance gates before selecting a production topology.”`; return <Panel className="p-4"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-100/65">Presenter talking point · {plain ? "executive" : "technical"}</p><p className="mt-2 text-[11px] leading-5 text-slate-300">{talkingPoint}</p><p className="mt-2 text-[11px] text-slate-400">Deterministic template from current session state.</p></Panel>; }
function Priorities({ profile, disagreements }: { profile: Record<string, StudioAnswerValue>; disagreements: number }) { return <Panel className="p-4"><div className="flex items-center justify-between"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Visible priorities</p>{disagreements ? <StatusPill tone="amber">{disagreements} disagreement{disagreements === 1 ? "" : "s"}</StatusPill> : <StatusPill tone="green">Aligned so far</StatusPill>}</div><dl className="mt-3 space-y-3"><SummaryFact label="Business outcomes" value={pretty(profile["business-outcome"])} /><SummaryFact label="Primary metrics" value={pretty(profile["primary-metrics"])} /><SummaryFact label="Guardrails" value={pretty(profile["guardrail-metrics"])} /></dl></Panel>; }
function FacilitationPanel({ title, value, onValue, placeholder, button, items, onAdd }: { title: string; value: string; onValue: (value: string) => void; placeholder: string; button: string; items: string[]; onAdd: () => Promise<void> }) { return <Panel className="overflow-hidden"><PanelHeading eyebrow="Presenter-only" title={title} /><div className="p-4"><InlineAdd value={value} onValue={onValue} placeholder={placeholder} button={button} onAdd={onAdd} /><ul className="mt-3 space-y-2">{items.map((item, index) => <li key={`${index}-${item}`} className="rounded-lg border border-white/[0.07] bg-black/15 p-2.5 text-[12px] leading-4 text-slate-300">{item}</li>)}</ul></div></Panel>; }
function InlineAdd({ value, onValue, placeholder, button, onAdd }: { value: string; onValue: (value: string) => void; placeholder: string; button: string; onAdd: () => Promise<void> }) { return <div className="flex gap-2"><input value={value} onChange={(event) => onValue(event.target.value)} maxLength={320} className={studioInput} placeholder={placeholder} /><button type="button" disabled={!value.trim()} onClick={() => void onAdd()} className={studioButton}>{button}</button></div>; }
function SummaryFact({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-white/[0.07] bg-black/15 p-3"><dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</dt><dd className="mt-1 text-[12px] leading-4 text-slate-300">{value || "Not yet answered"}</dd></div>; }
function pretty(value: StudioAnswerValue | undefined) { return Array.isArray(value) ? value.map((item) => item.replaceAll("-", " ")).join(", ") : value ? String(value).replaceAll("-", " ") : ""; }
function PresenterLoading() { return <StudioFrame><div className="grid min-h-screen place-items-center"><div role="status" className="text-center"><span className="mx-auto block size-8 animate-spin rounded-full border-2 border-cyan-200/20 border-t-cyan-200 motion-reduce:animate-none" /><p className="mt-4 text-xs text-slate-400">Authorizing presenter console…</p></div></div></StudioFrame>; }
function PresenterUnavailable({ message }: { message: string }) { return <StudioFrame><div className="grid min-h-screen place-items-center p-6"><div className="max-w-md rounded-2xl border border-white/10 bg-[#071016] p-6 text-center"><h1 className="text-xl font-semibold text-white">Session unavailable</h1><p className="mt-3 text-sm text-slate-400">{message || "The temporary session expired or could not reconnect."}</p><Link href="/architecture-studio" className={`${studioPrimaryButton} mt-6`}>Create a new session</Link></div></div></StudioFrame>; }
function PresenterUnauthorized() { return <StudioFrame><div className="grid min-h-screen place-items-center p-6"><div className="max-w-md rounded-2xl border border-rose-200/15 bg-[#071016] p-6 text-center"><h1 className="text-xl font-semibold text-white">Presenter link not authorized</h1><p className="mt-3 text-sm leading-6 text-slate-400">Presenter controls remain hidden unless the temporary presenter token matches this session. Ask the presenter to reopen the original console link.</p><Link href="/architecture-studio" className={`${studioButton} mt-6`}>Return to Studio</Link></div></div></StudioFrame>; }
