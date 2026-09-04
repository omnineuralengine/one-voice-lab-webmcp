"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { AudioEngineeringWorkbench } from "@/components/applied-engineering-questline/AudioEngineeringWorkbench";
import { CapstoneAndDrillLab } from "@/components/applied-engineering-questline/CapstoneAndDrillLab";
import { ClientIncidentLab } from "@/components/applied-engineering-questline/ClientIncidentLab";
import { ClientStackAdapter } from "@/components/applied-engineering-questline/ClientStackAdapter";
import { CodeLabLaunchDialog } from "@/components/applied-engineering-questline/CodeLabLaunchDialog";
import { DebuggerAndTestingLab } from "@/components/applied-engineering-questline/DebuggerAndTestingLab";
import { PolyglotMatrix } from "@/components/applied-engineering-questline/PolyglotMatrix";
import { QuestLessonWorkbench } from "@/components/applied-engineering-questline/QuestLessonWorkbench";
import { QuestlineNavigation } from "@/components/applied-engineering-questline/QuestlineNavigation";
import { StatusBadge, questButtonClassName } from "@/components/applied-engineering-questline/QuestlinePrimitives";
import { ToolchainLab } from "@/components/applied-engineering-questline/ToolchainLab";
import { PayloadInspector } from "@/components/PayloadInspector";
import { sanitizeCodeLabLaunchContext, toCodeLabLaunchContextInput } from "@/lib/code-lab-launch-context";
import { getCodeLabDraftSummary, type CodeLabDraftSummary } from "@/lib/code-lab-storage";
import { buildInspectorRecord, createTimelineEvent } from "@/lib/inspection";
import { CAPSTONE_PROJECTS } from "@/lib/questline/capstone-projects";
import { CLIENT_INCIDENTS } from "@/lib/questline/client-incidents";
import { createQuestlineCodeLabLaunchContext } from "@/lib/questline/code-lab-handoff";
import { IDE_TRACKS } from "@/lib/questline/ide-tracks";
import { getLanguageTrack } from "@/lib/questline/language-tracks";
import { DEBUGGER_SCENARIOS, DRILL_SCENARIOS, MASTERY_LEVELS, TESTING_QUESTS } from "@/lib/questline/mastery-checks";
import { QUEST_NODES } from "@/lib/questline/quest-nodes";
import { generateStackRecommendation, loadQuestProgress, saveQuestProgress, sanitizeQuestlineExport } from "@/lib/questline/questline-utils";
import type { CodeLabLaunchContext, CodeLabLaunchMode } from "@/types/code-lab-launch-context";
import type {
  QuestNode,
  QuestProgress,
  QuestStatus,
  QuestlineLanguageId,
  QuestlineSectionId,
  StackAdapterInput,
  StackRecommendation,
} from "@/types/questline";

const DEFAULT_STACK_INPUT: StackAdapterInput = {
  language: "typescript",
  framework: "Next.js",
  ide: "VSCodium / VS Code",
  operatingSystem: "Windows",
  deploymentPlatform: "Vercel",
  audioSource: "Browser microphone",
  transport: "WebSocket",
  storage: "Postgres or customer-owned storage",
  downstreamSystem: "CRM / helpdesk",
  concurrency: "Validate expected concurrent sessions",
  securityRequirements: "Server-only API key, temporary browser token, redacted logs",
};

const EMPTY_DRAFT_SUMMARY: CodeLabDraftSummary = {
  draftCount: 0,
  importedDraftCount: 0,
  hasCustomFiles: false,
  hasCustomPatterns: false,
  hasRecipe: false,
  hasLocalWork: false,
};

export function AppliedEngineeringQuestline({
  onLaunchCodeLab,
  onOpenApi,
  initialSection,
  initialQuestNodeId,
  onQuestSelectionChange,
}: {
  onLaunchCodeLab: (context: CodeLabLaunchContext, mode: CodeLabLaunchMode) => void;
  onOpenApi: (operationId: string) => void;
  initialSection?: QuestlineSectionId;
  initialQuestNodeId?: string;
  onQuestSelectionChange?: (questNodeId: string) => void;
}) {
  const initialNode = getInitialNode(initialQuestNodeId);
  const [section, setSection] = useState<QuestlineSectionId>(initialSection ?? "quest-map");
  const [language, setLanguage] = useState<QuestlineLanguageId>(initialNode.languages[0] ?? "typescript");
  const [activeQuestId, setActiveQuestId] = useState(initialNode.id);
  const [progress, setProgress] = useState<QuestProgress>(loadQuestProgress);
  const [stackInput, setStackInput] = useState<StackAdapterInput>({ ...DEFAULT_STACK_INPUT, language: initialNode.languages[0] ?? "typescript" });
  const [stackRecommendation, setStackRecommendation] = useState<StackRecommendation | null>(null);
  const [activeIncidentId, setActiveIncidentId] = useState(CLIENT_INCIDENTS[0]?.id ?? "");
  const [showInspector, setShowInspector] = useState(false);
  const [pendingLaunch, setPendingLaunch] = useState<CodeLabLaunchContext | null>(null);
  const [draftSummary, setDraftSummary] = useState<CodeLabDraftSummary>(EMPTY_DRAFT_SUMMARY);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<{
    deviceId: string;
    label: string;
  } | null>(null);
  const [launchError, setLaunchError] = useState("");
  const [sessionStartedAt] = useState(() => new Date().toISOString());
  const launchTriggerRef = useRef<HTMLElement | null>(null);

  const languageNodes = useMemo(() => QUEST_NODES.filter((node) => node.languages.includes(language)), [language]);
  const activeNode = languageNodes.find((node) => node.id === activeQuestId) ?? languageNodes[0] ?? QUEST_NODES[0];
  const track = getLanguageTrack(language);
  const completedQuestCount = Object.values(progress.questStatuses).filter((status) => status === "completed").length;

  useEffect(() => { saveQuestProgress(progress); }, [progress]);

  const inspector = useMemo(() => buildInspectorRecord({
    id: `questline-${activeNode?.id ?? "overview"}`,
    module: "Applied Engineering Questline",
    startedAt: sessionStartedAt,
    completedAt: sessionStartedAt,
    request: {
      method: "LOCAL",
      endpoint: `http://localhost:3000/applied-engineering-questline/${section}`,
      headers: { Authorization: "Token $DEEPGRAM_API_KEY" },
      bodyPreview: {
        activeLanguage: language,
        questId: activeNode?.id,
        relatedApiOperationId: activeNode?.relatedApiOperationId,
        codeLabWorkflow: activeNode?.relatedCodeLabWorkflowId,
        status: activeNode ? progress.questStatuses[activeNode.id] ?? "not-started" : "unavailable",
      },
    },
    response: {
      status: 200,
      bodyPreview: {
        experience: activeNode?.status ?? "local learning",
        runtime: track.runtime.executionModel,
        progress: { viewed: progress.questsViewed.length, completed: completedQuestCount },
        arbitraryCodeExecution: false,
      },
    },
    timeline: [createTimelineEvent({
      type: "quest.selected",
      label: activeNode?.title ?? "Questline opened",
      at: sessionStartedAt,
      data: { language, section, provenance: activeNode?.status ?? "local" },
    })],
    notes: [
      "Questline is a local learning surface and does not execute learner-authored code.",
      "Authorization is redacted by the shared inspector builder.",
      "Live Deepgram calls remain in existing guarded modules.",
    ],
  }), [activeNode, completedQuestCount, language, progress.questStatuses, progress.questsViewed.length, section, sessionStartedAt, track.runtime.executionModel]);

  function updateProgress(next: QuestProgress) {
    setProgress(sanitizeQuestlineExport(next));
  }

  function chooseLanguage(next: QuestlineLanguageId) {
    const first = QUEST_NODES.find((node) => node.languages.includes(next));
    setLanguage(next);
    setStackInput((current) => ({ ...current, language: next }));
    if (first) chooseQuest(first.id);
  }

  function chooseQuest(id: string) {
    setActiveQuestId(id);
    onQuestSelectionChange?.(id);
    setProgress((current) => ({ ...current, questsViewed: addUnique(current.questsViewed, id) }));
  }

  function setQuestStatus(id: string, status: QuestStatus) {
    setProgress((current) => ({
      ...current,
      questStatuses: { ...current.questStatuses, [id]: status },
      challengesAttempted: status === "not-started" ? current.challengesAttempted : addUnique(current.challengesAttempted, id),
      challengesCompleted: status === "completed" ? addUnique(current.challengesCompleted, id) : current.challengesCompleted,
    }));
  }

  function requestNodeLaunch(node: QuestNode, exampleIndex = 0, trigger?: HTMLElement | null) {
    launchTriggerRef.current = trigger ?? document.activeElement as HTMLElement | null;
    const rawContext = createQuestlineCodeLabLaunchContext(node, language, {
      exampleIndex,
      framework: stackRecommendation?.projectStructure[0] ? stackInput.framework : undefined,
      runtime: stackRecommendation?.concurrencyPattern.join(" "),
      ide: stackRecommendation ? stackInput.ide : undefined,
      operatingSystem: stackRecommendation ? stackInput.operatingSystem : undefined,
      audioSource:
        node.relatedCodeLabWorkflowId === "live-mic" && selectedAudioDevice
          ? `Browser microphone: ${selectedAudioDevice.label}`
          : undefined,
    });
    const prepared = sanitizeCodeLabLaunchContext(toCodeLabLaunchContextInput(rawContext));
    if (!prepared.ok) {
      setLaunchError(prepared.issues.join(" "));
      return;
    }
    setDraftSummary(getCodeLabDraftSummary());
    setPendingLaunch(prepared.context);
    setLaunchError("");
  }

  function confirmLaunch(mode: CodeLabLaunchMode) {
    if (!pendingLaunch) return;
    onLaunchCodeLab(pendingLaunch, mode);
    setPendingLaunch(null);
  }

  function solveIncident(id: string) {
    setProgress((current) => ({ ...current, incidentsSolved: addUnique(current.incidentsSolved, id) }));
  }

  function toggleAudioLesson(id: string) {
    setProgress((current) => ({
      ...current,
      audioLessonsCompleted: current.audioLessonsCompleted.includes(id)
        ? current.audioLessonsCompleted.filter((item) => item !== id)
        : [...current.audioLessonsCompleted, id],
    }));
  }

  function generateAdapter() {
    setStackRecommendation(generateStackRecommendation(stackInput));
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 overflow-hidden bg-[#02060b]">
      <QuestlineNavigation
        activeSection={section}
        activeLanguage={language}
        viewedQuestCount={progress.questsViewed.length}
        completedQuestCount={completedQuestCount}
        onSelectSection={setSection}
        onSelectLanguage={chooseLanguage}
      />
      <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#050b11] px-3 py-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="size-1.5 shrink-0 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,.65)]" />
            <span className="truncate text-[10px] font-semibold text-white">{track.label}</span>
            <span className="text-slate-700">/</span>
            <span className="truncate text-[9px] text-slate-500">{activeNode?.title ?? section.replaceAll("-", " ")}</span>
            {activeNode ? <><span className="hidden rounded border border-white/10 px-1.5 py-0.5 text-[8px] text-slate-600 xl:inline">{activeNode.difficulty}</span><StatusBadge value={progress.questStatuses[activeNode.id] ?? "not-started"} /></> : null}
          </div>
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
            <button type="button" onClick={() => setSection("polyglot")} className={questButtonClassName}>Compare Languages</button>
            <button type="button" onClick={(event) => activeNode && requestNodeLaunch(activeNode, 0, event.currentTarget)} disabled={!activeNode} className={questButtonClassName}>Open this quest in Code Lab</button>
            <button type="button" onClick={() => activeNode && onOpenApi(activeNode.relatedApiOperationId)} disabled={!activeNode} className={questButtonClassName}>Open related API</button>
            <button type="button" onClick={() => { setSection("incidents"); setActiveIncidentId(CLIENT_INCIDENTS.find((item) => item.language === language)?.id ?? CLIENT_INCIDENTS[0]?.id ?? ""); }} className={questButtonClassName}>Start Scenario Drill</button>
            <button type="button" onClick={() => setShowInspector((value) => !value)} className={`${questButtonClassName} ${showInspector ? "border-violet-300/30 text-violet-100" : ""}`}>Payload Inspector</button>
          </div>
        </div>

        {launchError ? <div role="alert" className="shrink-0 border-b border-rose-300/20 bg-rose-300/[0.07] px-3 py-2 text-[10px] text-rose-100">Code Lab launch blocked: {launchError}</div> : null}

        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          {section === "quest-map" ? (
            <QuestLessonWorkbench
              language={language}
              nodes={languageNodes}
              activeQuestId={activeNode?.id ?? ""}
              statuses={progress.questStatuses}
              notes={progress.notes}
              onSelectQuest={chooseQuest}
              onStatusChange={setQuestStatus}
              onNotesChange={(notes) => updateProgress({ ...progress, notes })}
              onOpenCodeLab={requestNodeLaunch}
              onOpenApi={onOpenApi}
            />
          ) : null}
          {section === "polyglot" ? <PolyglotMatrix activeLanguage={language} onOpenCodeLab={() => activeNode && requestNodeLaunch(activeNode)} onOpenApi={onOpenApi} /> : null}
          {section === "stack-adapter" ? <ClientStackAdapter input={stackInput} recommendation={stackRecommendation} onInputChange={setStackInput} onGenerate={generateAdapter} onOpenCodeLab={() => activeNode && requestNodeLaunch(activeNode)} /> : null}
          {section === "incidents" ? <ClientIncidentLab key={activeIncidentId} incidents={CLIENT_INCIDENTS} activeIncidentId={activeIncidentId} solvedIncidentIds={progress.incidentsSolved} onSelectIncident={setActiveIncidentId} onSolved={solveIncident} /> : null}
          {section === "audio" ? <AudioEngineeringWorkbench completedLessonIds={progress.audioLessonsCompleted} onToggleLesson={toggleAudioLesson} onSelectedDeviceChange={setSelectedAudioDevice} /> : null}
          {section === "debugger-testing" ? <DebuggerAndTestingLab language={language} nodes={QUEST_NODES} debuggerScenarios={DEBUGGER_SCENARIOS} testingQuests={TESTING_QUESTS} hintsUsed={progress.hintsUsed} onHintUsed={(id, level) => setProgress((current) => ({ ...current, hintsUsed: { ...current.hintsUsed, [id]: level } }))} onOpenCodeLab={requestNodeLaunch} /> : null}
          {section === "toolchains" ? <ToolchainLab tracks={IDE_TRACKS} /> : null}
          {section === "capstones" ? <CapstoneAndDrillLab capstones={CAPSTONE_PROJECTS} drills={DRILL_SCENARIOS} masteryLevels={MASTERY_LEVELS} progress={progress} onProgressChange={updateProgress} onOpenCodeLab={() => activeNode && requestNodeLaunch(activeNode)} /> : null}
        </div>

        {showInspector ? (
          <div className="absolute inset-y-11 right-0 z-30 w-[min(410px,90%)] overflow-y-auto border-l border-violet-300/20 bg-[#02060b]/98 p-3 shadow-[-24px_0_70px_rgba(0,0,0,.45)]">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[9px] font-bold uppercase tracking-wide text-violet-200/65">Sanitized Quest Evidence</p>
              <button type="button" onClick={() => setShowInspector(false)} className={questButtonClassName}>Close</button>
            </div>
            <PayloadInspector record={inspector} title="Questline Payload Inspector" defaultOpen />
          </div>
        ) : null}
      </section>

      {pendingLaunch ? (
        <CodeLabLaunchDialog
          context={pendingLaunch}
          draftSummary={draftSummary}
          onConfirm={confirmLaunch}
          onCancel={() => setPendingLaunch(null)}
          returnFocusTo={launchTriggerRef.current}
        />
      ) : null}
    </div>
  );
}

function getInitialNode(initialQuestNodeId?: string) {
  return QUEST_NODES.find((node) => node.id === initialQuestNodeId)
    ?? QUEST_NODES.find((node) => node.languages.includes("typescript"))
    ?? QUEST_NODES[0];
}

function addUnique(values: string[], value: string) {
  return values.includes(value) ? values : [...values, value];
}
