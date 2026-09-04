"use client";

import { useEffect, useMemo, useState } from "react";

import { AcademyNavigation } from "@/components/applied-voice-systems/AcademyNavigation";
import { ClientDiscovery } from "@/components/applied-voice-systems/ClientDiscovery";
import { ConversationFlightRecorder } from "@/components/applied-voice-systems/ConversationFlightRecorder";
import { DeploymentLab } from "@/components/applied-voice-systems/DeploymentLab";
import { EcosystemAtlas } from "@/components/applied-voice-systems/EcosystemAtlas";
import { EvaluationLab } from "@/components/applied-voice-systems/EvaluationLab";
import { FailureLab } from "@/components/applied-voice-systems/FailureLab";
import { ModelExperimentLab } from "@/components/applied-voice-systems/ModelExperimentLab";
import { PipelineAnatomy } from "@/components/applied-voice-systems/PipelineAnatomy";
import { SolutionBrief } from "@/components/applied-voice-systems/SolutionBrief";
import { ToolCallingLab } from "@/components/applied-voice-systems/ToolCallingLab";
import { TurnTakingLab } from "@/components/applied-voice-systems/TurnTakingLab";
import { ProvenanceBadge, buttonClassName } from "@/components/applied-voice-systems/AcademyPrimitives";
import { createClientContextPack, sanitizeAppliedExport } from "@/lib/applied-voice/academy";
import { MASTERY_LEVELS } from "@/lib/applied-voice/labs";
import { CLIENT_SCENARIOS } from "@/lib/applied-voice/scenarios";
import { looksLikeRealApiKey, readLocalJson, writeLocalJson } from "@/lib/code-lab-storage";
import type { CodeLabWorkflowId } from "@/lib/code-lab-files";
import type { LabModuleId } from "@/lib/code-snippets";
import type { InspectorRecord } from "@/lib/inspection";
import type {
  AppliedVoiceSectionId,
  ClientContextPack,
  ClientDiscoveryInput,
  EvaluationRun,
  ExperimentJournalEntry,
  ExperimentRun,
} from "@/types/applied-voice";

const STORAGE_KEY = "deepgram-applied-voice-academy:v1";

type AcademyState = {
  activeSection: AppliedVoiceSectionId;
  discoveryInput: ClientDiscoveryInput;
  contextPack: ClientContextPack | null;
  experiments: ExperimentRun[];
  evaluations: EvaluationRun[];
  deploymentModeId: string;
  deploymentChecklist: string[];
  journal: ExperimentJournalEntry[];
  completedMasteryRequirementIds: string[];
  completedSections: AppliedVoiceSectionId[];
};

const DEFAULT_STATE: AcademyState = {
  activeSection: "client-discovery",
  discoveryInput: CLIENT_SCENARIOS[0].input,
  contextPack: null,
  experiments: [],
  evaluations: [],
  deploymentModeId: "cloud-api",
  deploymentChecklist: [],
  journal: [],
  completedMasteryRequirementIds: [],
  completedSections: [],
};

export function AppliedVoiceSystems({
  liveInspector,
  onOpenModule,
  onOpenCodeLab,
  openLabMode = false,
}: {
  liveInspector: InspectorRecord | null;
  onOpenModule: (moduleId: LabModuleId) => void;
  onOpenCodeLab: (workflowId: CodeLabWorkflowId) => void;
  openLabMode?: boolean;
}) {
  const [state, setState] = useState<AcademyState>(loadAcademyState);
  const [solutionMode, setSolutionMode] = useState<"recipes" | "rapid-ramp">("recipes");
  const [solutionKey, setSolutionKey] = useState(0);
  const serializedState = useMemo(() => JSON.stringify(sanitizeAppliedExport(state)), [state]);
  const possibleCredential = looksLikeRealApiKey(serializedState);

  useEffect(() => {
    if (!possibleCredential) writeLocalJson(STORAGE_KEY, sanitizeAppliedExport(state));
  }, [possibleCredential, state]);

  function update(next: Partial<AcademyState>) {
    setState((current) => ({ ...current, ...next }));
  }

  function generateContextPack() {
    const contextPack = createClientContextPack(state.discoveryInput);
    setState((current) => ({
      ...current,
      contextPack,
      completedSections: addUnique(current.completedSections, "client-discovery"),
      completedMasteryRequirementIds: addUnique(current.completedMasteryRequirementIds, "discovery"),
    }));
  }

  function loadScenario(scenarioId: string) {
    const scenario = CLIENT_SCENARIOS.find((item) => item.id === scenarioId);
    if (scenario) update({ discoveryInput: structuredClone(scenario.input), contextPack: null });
  }

  function openRapidRamp() {
    setSolutionMode("rapid-ramp");
    setSolutionKey((value) => value + 1);
    update({ activeSection: "solution-brief" });
  }

  const activeLabel = sectionLabel(state.activeSection);

  return (
    <div className="flex h-full min-h-0 min-w-[960px] overflow-hidden bg-[#02060b]">
      <AcademyNavigation
        activeSection={state.activeSection}
        completedSections={state.completedSections}
        masteryLevels={MASTERY_LEVELS}
        completedMasteryRequirementIds={state.completedMasteryRequirementIds}
        onSelect={(activeSection) => update({ activeSection })}
        onOpenRapidRamp={openRapidRamp}
      />
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#050b11] px-3">
          <div className="flex min-w-0 items-center gap-2"><span className="size-1.5 shrink-0 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,.65)]" /><span className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{activeLabel}</span><span className="hidden text-[9px] text-slate-700 xl:inline">Applied reasoning · evidence · production boundaries</span></div>
          <div className="flex items-center gap-1.5"><ProvenanceBadge value="working" /><ProvenanceBadge value="simulated" /><ProvenanceBadge value="architectural concept" /><button type="button" onClick={() => onOpenModule("api-studio")} className={buttonClassName}>API Studio</button><button type="button" onClick={() => onOpenModule("code-lab")} className={buttonClassName}>Code Lab</button></div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {state.activeSection === "client-discovery" ? <ClientDiscovery input={state.discoveryInput} contextPack={state.contextPack} persistenceMessage={possibleCredential ? "Possible credential detected — draft remains in memory and was not saved." : "Draft and progress stay on this device only."} onInputChange={(discoveryInput) => update({ discoveryInput })} onLoadScenario={loadScenario} onGenerate={generateContextPack} /> : null}
          {state.activeSection === "pipeline-anatomy" ? <PipelineAnatomy onOpenModule={onOpenModule} onOpenCodeLab={onOpenCodeLab} /> : null}
          {state.activeSection === "ecosystem-atlas" ? <EcosystemAtlas onOpenModule={onOpenModule} onOpenCodeLab={onOpenCodeLab} /> : null}
          {state.activeSection === "model-lab" ? <ModelExperimentLab runs={state.experiments} onRunsChange={(experiments) => { setState((current) => ({ ...current, experiments, completedSections: addUnique(current.completedSections, "model-lab"), completedMasteryRequirementIds: experiments.length >= 2 ? addUnique(addUnique(current.completedMasteryRequirementIds, "test-set"), "compare-config") : addUnique(current.completedMasteryRequirementIds, "test-set") })); }} onOpenTurnLab={() => update({ activeSection: "turn-taking" })} openLabMode={openLabMode} /> : null}
          {state.activeSection === "turn-taking" ? <TurnTakingLab onOpenModule={onOpenModule} /> : null}
          {state.activeSection === "tool-calling" ? <ToolCallingLab /> : null}
          {state.activeSection === "conversation-trace" ? <ConversationFlightRecorder liveInspector={liveInspector} /> : null}
          {state.activeSection === "evaluation" ? <EvaluationLab runs={state.evaluations} onRunsChange={(evaluations) => { setState((current) => ({ ...current, evaluations, completedSections: addUnique(current.completedSections, "evaluation"), completedMasteryRequirementIds: addUnique(current.completedMasteryRequirementIds, "regression") })); }} /> : null}
          {state.activeSection === "failure" ? <FailureLab /> : null}
          {state.activeSection === "deployment" ? <DeploymentLab selectedModeId={state.deploymentModeId} onSelectMode={(deploymentModeId) => update({ deploymentModeId })} completedChecklist={state.deploymentChecklist} onChecklistChange={(deploymentChecklist) => { setState((current) => ({ ...current, deploymentChecklist, completedSections: deploymentChecklist.length >= 6 ? addUnique(current.completedSections, "deployment") : current.completedSections, completedMasteryRequirementIds: deploymentChecklist.length >= 6 ? addUnique(current.completedMasteryRequirementIds, "responsibility") : current.completedMasteryRequirementIds })); }} /> : null}
          {state.activeSection === "solution-brief" ? <SolutionBrief key={solutionKey} initialMode={solutionMode} contextPack={state.contextPack} experiments={state.experiments} evaluations={state.evaluations} deploymentModeId={state.deploymentModeId} journal={state.journal} completedMasteryRequirementIds={state.completedMasteryRequirementIds} onJournalChange={(journal) => update({ journal })} onToggleMasteryRequirement={(id) => update({ completedMasteryRequirementIds: toggleItem(state.completedMasteryRequirementIds, id) })} onOpenSection={(activeSection) => update({ activeSection })} onOpenModule={onOpenModule} onOpenCodeLab={onOpenCodeLab} /> : null}
        </div>
      </section>
    </div>
  );
}

function loadAcademyState(): AcademyState {
  const stored = readLocalJson<AcademyState | null>(STORAGE_KEY, null);
  if (!stored || looksLikeRealApiKey(JSON.stringify(stored))) return structuredClone(DEFAULT_STATE);
  return {
    ...structuredClone(DEFAULT_STATE),
    ...stored,
    discoveryInput: stored.discoveryInput && typeof stored.discoveryInput === "object" ? stored.discoveryInput : structuredClone(DEFAULT_STATE.discoveryInput),
    experiments: Array.isArray(stored.experiments) ? stored.experiments : [],
    evaluations: Array.isArray(stored.evaluations) ? stored.evaluations : [],
    deploymentChecklist: Array.isArray(stored.deploymentChecklist) ? stored.deploymentChecklist : [],
    journal: Array.isArray(stored.journal) ? stored.journal : [],
    completedMasteryRequirementIds: Array.isArray(stored.completedMasteryRequirementIds) ? stored.completedMasteryRequirementIds : [],
    completedSections: Array.isArray(stored.completedSections) ? stored.completedSections : [],
  };
}

function sectionLabel(section: AppliedVoiceSectionId) {
  const labels: Record<AppliedVoiceSectionId, string> = {
    "client-discovery": "Client Discovery",
    "pipeline-anatomy": "Voice Pipeline Anatomy",
    "ecosystem-atlas": "Agentic Voice Ecosystem Atlas",
    "model-lab": "Model and Parameter Experiment Lab",
    "turn-taking": "Turn-Taking and Latency Lab",
    "tool-calling": "Function, Tool, and Multi-Agent Lab",
    "conversation-trace": "Conversation Flight Recorder",
    evaluation: "Agentic Voice Evaluation Lab",
    failure: "Failure Injection and Resilience Lab",
    deployment: "Deployment and Enterprise Readiness",
    "solution-brief": "Solution Recipes, Applied ML, and Client Brief",
  };
  return labels[section];
}

function addUnique<T extends string>(values: T[], value: T) { return values.includes(value) ? values : [...values, value]; }
function toggleItem<T extends string>(values: T[], value: T) { return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]; }
