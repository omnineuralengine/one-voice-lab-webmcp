import type {
  ActionRegisterEntry,
  ArchitectureStudioHandoffState,
  DecisionRegisterEntry,
  HandoffAction,
  PocAcceptanceCriterion,
  RehearsalReflection,
} from "@/types/architecture-studio-handoff";

const EMPTY_REFLECTION: RehearsalReflection = { strongestMoment: "", unclearMoment: "", earlierQuestion: "", unnecessaryDetail: "", missingEvidence: "", nextFocus: "" };

export function createInitialHandoffState(): ArchitectureStudioHandoffState {
  return {
    schemaVersion: 1,
    audience: "executive",
    activeView: "executive-summary",
    presentationMode: false,
    perspective: "operator",
    includeOperatorNotesInExport: false,
    questionClosures: [],
    manualDecisions: [],
    decisionOverrides: {},
    manualActions: [],
    actionOverrides: {},
    acceptanceCriteriaOverrides: [],
    rehearsal: { length: "five", activeStageIndex: 0, skippedStageIds: [], completedStageIds: [], scores: [], reflection: EMPTY_REFLECTION },
  };
}

export function normalizeHandoffState(state: ArchitectureStudioHandoffState | undefined): ArchitectureStudioHandoffState {
  const initial = createInitialHandoffState();
  if (!state) return initial;
  return { ...initial, ...state, decisionOverrides: state.decisionOverrides ?? {}, actionOverrides: state.actionOverrides ?? {}, rehearsal: { ...initial.rehearsal, ...state.rehearsal } };
}

export function applyHandoffAction(stateInput: ArchitectureStudioHandoffState | undefined, action: HandoffAction, now = new Date().toISOString()): ArchitectureStudioHandoffState {
  const state = normalizeHandoffState(stateInput);
  if (action.type === "set-audience") return { ...state, audience: action.audience };
  if (action.type === "set-view") return { ...state, activeView: action.view };
  if (action.type === "set-presentation-mode") return { ...state, presentationMode: action.enabled, perspective: action.enabled ? "facilitator" : state.perspective };
  if (action.type === "set-perspective") return { ...state, perspective: action.perspective };
  if (action.type === "set-include-operator-notes") return { ...state, includeOperatorNotesInExport: action.include };
  if (action.type === "close-question") {
    const closure = { ...action.closure, originalQuestion: clean(action.closure.originalQuestion, 300), resolution: clean(action.closure.resolution, 600), architectureUpdate: clean(action.closure.architectureUpdate, 400), resolvedAt: now };
    let manualDecisions = state.manualDecisions;
    let manualActions = state.manualActions;
    if (closure.createsDecision) manualDecisions = [...manualDecisions, closureDecision(closure, now)].slice(-80);
    if (closure.createsAction) manualActions = [...manualActions, closureAction(closure)].slice(-100);
    return { ...state, questionClosures: [...state.questionClosures.filter((item) => item.questionId !== closure.questionId), closure].slice(-80), manualDecisions, manualActions };
  }
  if (action.type === "reopen-question") return { ...state, questionClosures: state.questionClosures.filter((item) => item.questionId !== action.questionId) };
  if (action.type === "add-decision") return { ...state, manualDecisions: [...state.manualDecisions, sanitizeDecision({ ...action.decision, id: safeId("decision"), timestamp: now, origin: "manual" })].slice(-80) };
  if (action.type === "update-decision") {
    const manual = state.manualDecisions.some((decision) => decision.id === action.id);
    return manual ? { ...state, manualDecisions: state.manualDecisions.map((decision) => decision.id === action.id ? sanitizeDecision({ ...decision, ...action.changes, id: decision.id, origin: decision.origin }) : decision) } : { ...state, decisionOverrides: { ...state.decisionOverrides, [action.id]: { ...(state.decisionOverrides[action.id] ?? {}), ...action.changes, id: action.id } } };
  }
  if (action.type === "add-action") return { ...state, manualActions: [...state.manualActions, sanitizeAction({ ...action.action, id: safeId("action"), origin: "manual" })].slice(-100) };
  if (action.type === "update-action") {
    const manual = state.manualActions.some((item) => item.id === action.id);
    return manual ? { ...state, manualActions: state.manualActions.map((item) => item.id === action.id ? sanitizeAction({ ...item, ...action.changes, id: item.id, origin: item.origin }) : item) } : { ...state, actionOverrides: { ...state.actionOverrides, [action.id]: { ...(state.actionOverrides[action.id] ?? {}), ...action.changes, id: action.id } } };
  }
  if (action.type === "set-acceptance-criterion") return { ...state, acceptanceCriteriaOverrides: upsertCriterion(state.acceptanceCriteriaOverrides, action.criterion) };
  if (action.type === "set-rehearsal-length") return { ...state, rehearsal: { ...state.rehearsal, length: action.length, activeStageIndex: 0, skippedStageIds: [], completedStageIds: [] } };
  if (action.type === "set-rehearsal-stage") return { ...state, rehearsal: { ...state.rehearsal, activeStageIndex: Math.max(0, Math.min(30, action.index)) } };
  if (action.type === "complete-rehearsal-stage") return { ...state, rehearsal: { ...state.rehearsal, completedStageIds: [...new Set([...state.rehearsal.completedStageIds, action.stageId])], skippedStageIds: state.rehearsal.skippedStageIds.filter((id) => id !== action.stageId), activeStageIndex: state.rehearsal.activeStageIndex + 1 } };
  if (action.type === "skip-rehearsal-stage") return { ...state, rehearsal: { ...state.rehearsal, skippedStageIds: [...new Set([...state.rehearsal.skippedStageIds, action.stageId])], completedStageIds: state.rehearsal.completedStageIds.filter((id) => id !== action.stageId), activeStageIndex: state.rehearsal.activeStageIndex + 1 } };
  if (action.type === "score-rehearsal") return { ...state, rehearsal: { ...state.rehearsal, scores: [...state.rehearsal.scores.filter((score) => score.dimension !== action.score.dimension), { ...action.score, notes: clean(action.score.notes, 400) }] } };
  if (action.type === "set-rehearsal-reflection") return { ...state, rehearsal: { ...state.rehearsal, reflection: Object.fromEntries(Object.entries(action.reflection).map(([key, value]) => [key, clean(value, 500)])) as RehearsalReflection } };
  return createInitialHandoffState();
}

function closureDecision(closure: ArchitectureStudioHandoffState["questionClosures"][number], now: string): DecisionRegisterEntry {
  return { id: safeId("closure-decision"), decision: closure.resolution, status: closure.method === "validation-test" || closure.method === "technical-investigation" ? "needs-validation" : "proposed", rationale: `Closes: ${closure.originalQuestion}`, alternativesConsidered: ["Leave the question unresolved"], tradeoff: closure.architectureUpdate || "Architecture impact to review.", evidence: [`Resolution method: ${closure.method.replaceAll("-", " ")}`], decisionOwner: "Joint customer and Applied Engineering team (synthetic)", timestamp: now, affectedComponentIds: [], reversibility: "moderate", reviewTrigger: "New customer evidence changes the working assumption.", synthetic: true, origin: "manual" };
}

function closureAction(closure: ArchitectureStudioHandoffState["questionClosures"][number]): ActionRegisterEntry {
  return { id: safeId("closure-action"), action: closure.architectureUpdate || `Apply and validate the resolution: ${closure.resolution}`, owner: "Named implementation owner (synthetic)", stakeholderGroup: "Joint", timing: "Before the next architecture gate", dependency: closure.resolution, status: "not-started", relatedOpenQuestionId: closure.questionId, completionEvidence: "Evidence required", synthetic: true, origin: "manual" };
}

function sanitizeDecision(decision: DecisionRegisterEntry): DecisionRegisterEntry {
  return { ...decision, decision: clean(decision.decision, 300), rationale: clean(decision.rationale, 500), alternativesConsidered: decision.alternativesConsidered.map((item) => clean(item, 300)).slice(0, 8), tradeoff: clean(decision.tradeoff, 500), evidence: decision.evidence.map((item) => clean(item, 400)).slice(0, 12), decisionOwner: clean(decision.decisionOwner, 120), affectedComponentIds: decision.affectedComponentIds.map((item) => cleanId(item)).filter(Boolean).slice(0, 30), reviewTrigger: clean(decision.reviewTrigger, 400) };
}

function sanitizeAction(action: ActionRegisterEntry): ActionRegisterEntry {
  return { ...action, action: clean(action.action, 300), owner: clean(action.owner, 120), timing: clean(action.timing, 100), dependency: clean(action.dependency, 300), completionEvidence: clean(action.completionEvidence, 400) };
}

function upsertCriterion(criteria: PocAcceptanceCriterion[], criterion: PocAcceptanceCriterion) {
  const sanitized = { ...criterion, metric: clean(criterion.metric, 120), target: clean(criterion.target, 200), comparisonBaseline: clean(criterion.comparisonBaseline, 200), measurementMethod: clean(criterion.measurementMethod, 500), sampleSize: clean(criterion.sampleSize, 120), owner: clean(criterion.owner, 120), notes: clean(criterion.notes, 500), sourceIds: criterion.sourceIds.map(cleanId).filter(Boolean).slice(0, 20) };
  return [...criteria.filter((item) => item.id !== sanitized.id), sanitized].slice(-60);
}

function clean(value: string, max: number) { return value.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max); }
function cleanId(value: string) { return value.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 120); }
function safeId(prefix: string) { return `${prefix}-${crypto.randomUUID()}`; }
