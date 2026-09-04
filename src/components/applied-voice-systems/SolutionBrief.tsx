"use client";

import { useMemo, useState } from "react";

import {
  EmptyState,
  FieldLabel,
  Panel,
  PanelHeading,
  ProvenanceBadge,
  buttonClassName,
  downloadTextFile,
  primaryButtonClassName,
  slugify,
  textareaClassName,
} from "@/components/applied-voice-systems/AcademyPrimitives";
import { generateSolutionBriefMarkdown } from "@/lib/applied-voice/academy";
import { MASTERY_LEVELS } from "@/lib/applied-voice/labs";
import { SOLUTION_RECIPES } from "@/lib/applied-voice/scenarios";
import type { LabModuleId } from "@/lib/code-snippets";
import type { CodeLabWorkflowId } from "@/lib/code-lab-files";
import type { AppliedVoiceSectionId, ClientContextPack, EvaluationRun, ExperimentJournalEntry, ExperimentRun } from "@/types/applied-voice";

type BriefMode = "recipes" | "rapid-ramp" | "brief" | "journal" | "mastery";

const RAPID_RAMP: Array<{ minute: number; label: string; detail: string; section: AppliedVoiceSectionId }> = [
  { minute: 1, label: "Understand business outcome", detail: "Name the user, task, and business result.", section: "client-discovery" },
  { minute: 2, label: "Identify source and transport", detail: "Trace audio from capture to your trust boundary.", section: "pipeline-anatomy" },
  { minute: 3, label: "Choose batch, streaming, Flux, or Voice Agent", detail: "Match product behavior to the interaction—not hype.", section: "ecosystem-atlas" },
  { minute: 4, label: "Build the first payload", detail: "Open API Studio and make a minimal supported request.", section: "model-lab" },
  { minute: 5, label: "Run and inspect", detail: "Preserve request ID, response, latency, and errors.", section: "model-lab" },
  { minute: 6, label: "Add context or a tool", detail: "Validate structure and authorization boundaries.", section: "tool-calling" },
  { minute: 7, label: "Inspect turns and latency", detail: "Separate ingress, recognition, decision, generation, TTS, and playback.", section: "turn-taking" },
  { minute: 8, label: "Inject one failure", detail: "Start with the symptom and trace backward.", section: "failure" },
  { minute: 9, label: "Define evaluation", detail: "Use representative fixtures plus human review.", section: "evaluation" },
  { minute: 10, label: "Export recommendation", detail: "State responsibilities, POC, risks, and questions.", section: "solution-brief" },
];

export function SolutionBrief({
  contextPack,
  experiments,
  evaluations,
  deploymentModeId,
  journal,
  completedMasteryRequirementIds,
  onJournalChange,
  onToggleMasteryRequirement,
  onOpenSection,
  onOpenModule,
  onOpenCodeLab,
  initialMode = "recipes",
}: {
  contextPack: ClientContextPack | null;
  experiments: ExperimentRun[];
  evaluations: EvaluationRun[];
  deploymentModeId: string;
  journal: ExperimentJournalEntry[];
  completedMasteryRequirementIds: string[];
  onJournalChange: (entries: ExperimentJournalEntry[]) => void;
  onToggleMasteryRequirement: (id: string) => void;
  onOpenSection: (section: AppliedVoiceSectionId) => void;
  onOpenModule: (moduleId: LabModuleId) => void;
  onOpenCodeLab: (workflowId: CodeLabWorkflowId) => void;
  initialMode?: BriefMode;
}) {
  const [mode, setMode] = useState<BriefMode>(initialMode);
  const [recipeId, setRecipeId] = useState(SOLUTION_RECIPES[0].id);
  const recipe = SOLUTION_RECIPES.find((item) => item.id === recipeId) ?? SOLUTION_RECIPES[0];
  const [journalDraft, setJournalDraft] = useState({ question: "", test: "", result: "", learning: "", decision: "", nextExperiment: "" });
  const brief = useMemo(() => contextPack ? generateSolutionBriefMarkdown({
    contextPack,
    recipeId,
    experimentConclusions: experiments.map((run) => run.conclusion).filter(Boolean),
    chosenApis: recipe.deepgramComponents,
    evaluationPlan: [...recipe.evaluationPlan, ...evaluations.flatMap((run) => run.expectedBehavior).slice(0, 6)],
    deploymentModeId,
    risks: [...contextPack.risks, ...recipe.privacyConcerns],
    openQuestions: contextPack.unansweredQuestions,
  }) : "", [contextPack, deploymentModeId, evaluations, experiments, recipe, recipeId]);

  function addJournalEntry() {
    if (!journalDraft.question.trim() || !journalDraft.test.trim()) return;
    onJournalChange([...journal, { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...journalDraft }]);
    setJournalDraft({ question: "", test: "", result: "", learning: "", decision: "", nextExperiment: "" });
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <Panel className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <PanelHeading
          eyebrow="Client solution output"
          title="Convert learning evidence into a credible recommendation"
          detail="Exports contain sanitized examples and explicit gaps—not credentials, raw audio, or invented measurements."
          actions={<><ProvenanceBadge value="working" /><div className="flex rounded-md border border-white/10 p-0.5">{(["recipes", "rapid-ramp", "brief", "journal", "mastery"] as BriefMode[]).map((item) => <button key={item} type="button" onClick={() => setMode(item)} className={`rounded px-2 py-1 text-[9px] font-semibold capitalize ${mode === item ? "bg-cyan-200 text-slate-950" : "text-slate-500 hover:text-white"}`}>{item.replace("-", " ")}</button>)}</div></>}
        />
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {mode === "recipes" ? <Recipes recipeId={recipeId} onRecipeChange={setRecipeId} onOpenModule={onOpenModule} onOpenCodeLab={onOpenCodeLab} /> : null}
          {mode === "rapid-ramp" ? <RapidRamp contextPack={contextPack} recipeId={recipe.id} onOpenSection={onOpenSection} /> : null}
          {mode === "brief" ? contextPack ? <BriefPreview brief={brief} filename={`${slugify(recipe.name)}-solution-brief.md`} /> : <EmptyState title="Generate a Client Context Pack first" detail="The brief requires explicit discovery evidence. Open Client Discovery, generate the pack, then return here." /> : null}
          {mode === "journal" ? <Journal entries={journal} draft={journalDraft} onDraftChange={setJournalDraft} onAdd={addJournalEntry} /> : null}
          {mode === "mastery" ? <Mastery completed={completedMasteryRequirementIds} onToggle={onToggleMasteryRequirement} /> : null}
        </div>
      </Panel>
    </div>
  );
}

function Recipes({ recipeId, onRecipeChange, onOpenModule, onOpenCodeLab }: { recipeId: string; onRecipeChange: (id: string) => void; onOpenModule: (moduleId: LabModuleId) => void; onOpenCodeLab: (workflowId: CodeLabWorkflowId) => void }) {
  const recipe = SOLUTION_RECIPES.find((item) => item.id === recipeId) ?? SOLUTION_RECIPES[0];
  return <div className="grid min-h-[520px] grid-cols-[230px_minmax(0,1fr)_minmax(280px,.8fr)] gap-3"><div className="min-h-0 overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-2">{SOLUTION_RECIPES.map((item) => <button key={item.id} type="button" onClick={() => onRecipeChange(item.id)} className={`mb-1.5 w-full rounded-md border p-2 text-left ${item.id === recipe.id ? "border-cyan-300/30 bg-cyan-300/[0.08]" : "border-white/[0.06] hover:border-white/15"}`}><span className="block text-[10px] font-semibold text-slate-200">{item.name}</span><span className="mt-1 block text-[8px] leading-3.5 text-slate-600">{item.clientProblem}</span></button>)}</div><div className="space-y-3"><div className="rounded-lg border border-cyan-300/15 bg-cyan-300/[0.04] p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[9px] uppercase tracking-wide text-cyan-200/65">Reusable solution recipe</p><h3 className="mt-1 text-lg font-semibold text-white">{recipe.name}</h3><p className="mt-2 text-[11px] leading-5 text-slate-400">{recipe.clientProblem}</p></div><ProvenanceBadge value={recipe.provenance} /></div><div className="mt-3 flex min-w-0 items-center gap-1 overflow-x-auto pb-1">{recipe.eventFlow.map((step, index) => <span key={`${index}-${step}`} className="flex shrink-0 items-center gap-1"><span className="rounded border border-white/10 bg-black/25 px-2 py-1.5 text-[9px] text-slate-300">{step}</span>{index < recipe.eventFlow.length - 1 ? <span className="text-cyan-300/50">→</span> : null}</span>)}</div></div><div className="grid gap-2 xl:grid-cols-2"><List title="Architecture" items={recipe.architecture} /><List title="Deepgram components" items={recipe.deepgramComponents} /><List title="Tools" items={recipe.tools} /><List title="Storage / output" items={recipe.storageOutput} /><List title="Latency priorities" items={recipe.latencyPriorities} /><List title="Evaluation plan" items={recipe.evaluationPlan} /><List title="Failure handling" items={recipe.failureHandling} /><List title="Privacy concerns" items={recipe.privacyConcerns} tone="amber" /><List title="POC scope" items={recipe.proofOfConceptScope} /><List title="Production roadmap" items={recipe.productionRoadmap} /></div></div><div className="space-y-3"><Lens recipe={recipe} /><List title="Code Lab files" items={recipe.codeLabFiles} mono /><List title="API Studio operations" items={recipe.apiStudioOperationIds} mono /><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => onOpenModule("api-studio")} className={buttonClassName}>Open API Studio</button><button type="button" onClick={() => onOpenCodeLab(codeLabWorkflowForRecipe(recipe.apiStudioOperationIds))} className={buttonClassName}>Open Code Lab</button></div></div></div>;
}

function RapidRamp({ contextPack, recipeId, onOpenSection }: { contextPack: ClientContextPack | null; recipeId: string; onOpenSection: (section: AppliedVoiceSectionId) => void }) {
  const recipe = SOLUTION_RECIPES.find((item) => item.id === recipeId) ?? SOLUTION_RECIPES[0];
  return <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(300px,.9fr)]"><div className="space-y-1.5">{RAPID_RAMP.map((step) => <button key={step.minute} type="button" onClick={() => onOpenSection(step.section)} className="grid w-full grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-white/[0.08] bg-black/15 p-3 text-left hover:border-cyan-300/20 hover:bg-cyan-300/[0.035]"><span className="font-mono text-[9px] font-bold text-cyan-200">MINUTE {step.minute}</span><span><span className="block text-[11px] font-semibold text-slate-200">{step.label}</span><span className="mt-1 block text-[9px] text-slate-600">{step.detail}</span></span><span className="text-cyan-300/50">→</span></button>)}</div><div className="space-y-3"><div className="rounded-lg border border-violet-300/15 bg-violet-300/[0.04] p-3"><p className="text-[9px] font-semibold uppercase tracking-wide text-violet-200/65">10-minute outcome</p><p className="mt-2 text-sm font-semibold text-white">{contextPack?.problemStatement ?? recipe.clientProblem}</p></div><List title="Architecture" items={recipe.architecture} /><List title="API list" items={recipe.deepgramComponents} /><List title="Client responsibilities" items={["Audio capture/transport", "authorization and tools", "evaluation and fallback", "retention and observability"]} /><List title="POC test" items={recipe.proofOfConceptScope} /><List title="Key risks" items={contextPack?.risks ?? recipe.privacyConcerns} tone="amber" /><List title="Next discovery questions" items={contextPack?.unansweredQuestions ?? ["What audio is representative?", "What latency/outcome target matters?", "Which system owns human fallback?"]} /></div></div>;
}

function BriefPreview({ brief, filename }: { brief: string; filename: string }) { return <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_260px]"><div className="overflow-hidden rounded-lg border border-white/10 bg-[#02060b]"><div className="flex items-center justify-between border-b border-white/10 px-3 py-2"><p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Downloadable sanitized Markdown</p><button type="button" onClick={() => downloadTextFile(filename, brief, "text/markdown")} className={primaryButtonClassName}>Generate Client Solution Brief</button></div><pre className="max-h-[62vh] overflow-auto whitespace-pre-wrap p-4 font-mono text-[10px] leading-5 text-slate-300">{brief}</pre></div><div className="space-y-3"><List title="Included" items={["Executive summary", "workflow + architecture", "Deepgram components", "request/event flow", "security and latency", "evaluation + failure handling", "POC and production considerations", "technical appendix"]} /><List title="Always excluded" items={["DEEPGRAM_API_KEY", "Authorization", "temporary tokens", "raw audio", "hidden browser secrets"]} tone="amber" /><div className="rounded-lg border border-white/10 bg-black/20 p-3 text-[9px] leading-4 text-slate-500">Inspect the generated document before sharing. Recommendations remain conditional on discovery, official docs, representative tests, and customer review.</div></div></div>; }

function Journal({ entries, draft, onDraftChange, onAdd }: { entries: ExperimentJournalEntry[]; draft: Omit<ExperimentJournalEntry, "id" | "createdAt">; onDraftChange: (value: Omit<ExperimentJournalEntry, "id" | "createdAt">) => void; onAdd: () => void }) { return <div className="grid gap-3 xl:grid-cols-[minmax(380px,.9fr)_minmax(0,1.1fr)]"><div className="rounded-lg border border-white/10 bg-black/20 p-3"><div className="grid gap-3 xl:grid-cols-2">{(Object.keys(draft) as Array<keyof typeof draft>).map((key) => <div key={key} className={key === "question" || key === "test" ? "xl:col-span-2" : ""}><FieldLabel label={humanize(key)}><textarea value={draft[key]} onChange={(event) => onDraftChange({ ...draft, [key]: event.target.value })} rows={key === "question" || key === "test" ? 2 : 3} className={textareaClassName} /></FieldLabel></div>)}</div><button type="button" onClick={onAdd} disabled={!draft.question.trim() || !draft.test.trim()} className={`mt-3 ${primaryButtonClassName}`}>Save experiment journal entry</button></div><div className="space-y-2">{entries.length ? entries.map((entry) => <article key={entry.id} className="rounded-lg border border-white/[0.08] bg-black/15 p-3"><div className="flex items-center justify-between"><p className="text-[11px] font-semibold text-white">{entry.question}</p><span className="font-mono text-[8px] text-slate-600">{new Date(entry.createdAt).toLocaleDateString()}</span></div><dl className="mt-2 grid gap-2 text-[9px] leading-4 xl:grid-cols-2"><Explain label="Test" value={entry.test} /><Explain label="Result" value={entry.result} /><Explain label="Learning" value={entry.learning} /><Explain label="Decision" value={entry.decision} /><Explain label="Next experiment" value={entry.nextExperiment} /></dl></article>) : <EmptyState title="No journal entries" detail="Capture the question, test, result, learning, decision, and next experiment so applied ML choices remain reproducible." />}</div></div>; }

function Mastery({ completed, onToggle }: { completed: string[]; onToggle: (id: string) => void }) { const done = new Set(completed); return <div className="grid gap-3 xl:grid-cols-2">{MASTERY_LEVELS.map((level) => { const earned = level.requirements.every((item) => done.has(item.id)); return <div key={level.id} className={`rounded-lg border p-3 ${earned ? "border-emerald-300/20 bg-emerald-300/[0.05]" : "border-white/[0.08] bg-black/15"}`}><div className="flex items-start justify-between gap-3"><div><p className="text-[9px] uppercase tracking-wide text-slate-600">Level {level.level}</p><h3 className="mt-1 text-sm font-semibold text-white">{level.name}</h3></div><span className={`rounded px-2 py-1 text-[8px] font-bold ${earned ? "bg-emerald-200 text-slate-950" : "bg-white/[0.05] text-slate-500"}`}>{earned ? "EARNED" : `${level.requirements.filter((item) => done.has(item.id)).length}/${level.requirements.length}`}</span></div><div className="mt-3 space-y-1.5">{level.requirements.map((requirement) => <label key={requirement.id} className="flex items-start gap-2 text-[9px] leading-4 text-slate-400"><input type="checkbox" checked={done.has(requirement.id)} onChange={() => onToggle(requirement.id)} className="mt-0.5 accent-emerald-300" /><span><span className="text-slate-300">{requirement.label}</span><span className="ml-1 text-slate-700">· {requirement.module}</span></span></label>)}</div><p className="mt-3 text-[8px] leading-3.5 text-slate-600">{level.disclaimer}</p></div>; })}</div>; }

function Lens({ recipe }: { recipe: (typeof SOLUTION_RECIPES)[number] }) { const lens = recipe.appliedMlLens; return <div className="rounded-lg border border-violet-300/15 bg-violet-300/[0.035] p-3"><p className="text-[9px] font-semibold uppercase tracking-wide text-violet-200/65">Applied ML lens</p><dl className="mt-2 space-y-2 text-[9px] leading-4"><Explain label="Hypothesis" value={lens.hypothesis} /><Explain label="Expected benefit" value={lens.expectedBenefit} /><Explain label="Likely downside" value={lens.likelyDownside} /><Explain label="Data + metric" value={`${lens.dataNeeded} · ${lens.metric}`} /><Explain label="Minimum test set" value={lens.minimumTestSet} /><Explain label="Failure segment" value={lens.failureSegment} /><Explain label="Rollout / rollback" value={`${lens.rolloutStrategy} · rollback when ${lens.rollbackCondition}`} /></dl></div>; }
function List({ title, items, mono = false, tone = "default" }: { title: string; items: string[]; mono?: boolean; tone?: "default" | "amber" }) { return <div className={`rounded-lg border bg-black/15 p-3 ${tone === "amber" ? "border-amber-300/15" : "border-white/[0.08]"}`}><p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">{title}</p><ul className={`mt-2 space-y-1 text-[9px] leading-4 text-slate-400 ${mono ? "font-mono" : ""}`}>{items.map((item, index) => <li key={`${index}-${item}`}>• {item}</li>)}</ul></div>; }
function Explain({ label, value }: { label: string; value: string }) { return <div><dt className="font-semibold text-slate-500">{label}</dt><dd className="text-slate-400">{value || "Not recorded"}</dd></div>; }
function codeLabWorkflowForRecipe(operationIds: string[]): CodeLabWorkflowId { if (operationIds.some((id) => id.includes("tts"))) return "tts"; if (operationIds.some((id) => id.includes("text-intelligence"))) return "text-intelligence"; if (operationIds.some((id) => id.includes("live") || id.includes("flux"))) return "live-mic"; if (operationIds.some((id) => id.includes("file"))) return "upload-audio"; return "transcribe-url"; }
function humanize(value: string) { return value.replace(/([A-Z])/g, " $1").replaceAll("-", " ").replace(/^./, (letter) => letter.toUpperCase()); }
