import { STUDIO_QUESTIONS, getQuestion } from "@/data/architecture-studio-discovery";
import { getScenarioPreset, scenarioSeedAnswers } from "@/data/architecture-studio-scenarios";
import { applyArchitectureRevisions, buildGeneratedCanvasSnapshot } from "@/lib/architecture-studio/architecture-workspace";
import { recommendArchitecture } from "@/lib/architecture-studio/recommendation-engine";
import { applySimulationAction, createInitialSimulationState, refreshSimulationState, validatePortableDiagnosticSession } from "@/lib/architecture-studio/simulation-state";
import { applyHandoffAction, createInitialHandoffState, normalizeHandoffState } from "@/lib/architecture-studio/handoff-state";
import { validatePortableSessionExport } from "@/lib/architecture-studio/handoff-exports";
import { buildSolutionBrief } from "@/lib/architecture-studio/summary";
import type {
  PublicStudioSession,
  RecommendationHistoryEntry,
  StakeholderRole,
  StudioAnswerValue,
  StudioPresenterCommand,
  StudioScenarioId,
  StudioSession,
} from "@/types/architecture-studio";

const SESSION_LIFETIME_MS = 4 * 60 * 60 * 1000;

export function createStudioSession(
  realtimeMode: StudioSession["realtimeMode"],
  options: { now?: Date; code?: string; id?: string; scenarioId?: StudioScenarioId; customScenarioName?: string } = {},
) {
  const now = options.now ?? new Date();
  const createdAt = now.toISOString();
  const firstQuestionId = STUDIO_QUESTIONS[0].id;
  const scenarioId = options.scenarioId ?? "northstar-contact-cloud";
  const scenarioName = scenarioId === "custom"
    ? cleanText(options.customScenarioName ?? "Untitled fictional customer", 80) || "Untitled fictional customer"
    : getScenarioPreset(scenarioId)?.name ?? "Northstar Contact Cloud";
  const session: StudioSession = {
    id: options.id ?? randomId(),
    code: options.code ?? randomSessionCode(),
    scenarioId,
    scenarioName,
    status: "active",
    createdAt,
    updatedAt: createdAt,
    expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS).toISOString(),
    version: 1,
    realtimeMode,
    activeStageId: "objective",
    revealedQuestionIds: [firstQuestionId],
    pausedStageIds: [],
    participants: [],
    answers: scenarioSeedAnswers(scenarioId, createdAt, scenarioName),
    presenterOverrides: {},
    presenterNotes: [],
    assumptions: [],
    parkingLot: [],
    decisions: [],
    reactions: {},
    recommendationHistory: [],
    architectureOverrides: [],
    architectureSimulation: createInitialSimulationState(),
    handoffState: createInitialHandoffState(),
    savedBrief: null,
    nextSteps: [],
    technicalDepth: "balanced",
    languageMode: "plain",
    confirmation: "pending",
  };
  const initialRecommendation = recommendArchitecture(session);
  session.recommendationHistory = [{
    id: randomId(),
    createdAt,
    path: initialRecommendation.primaryPath,
    title: initialRecommendation.title,
    reason: `The seeded ${scenarioName} facts establish context, but unresolved discovery inputs still control the recommendation.`,
  }];
  return { session, presenterToken: randomToken() };
}

export function joinStudioSession(
  session: StudioSession,
  input: { displayName: string; role: StakeholderRole; tokenHash?: string; participantId?: string; participantToken?: string },
) {
  const now = new Date().toISOString();
  const existing = input.participantId ? session.participants.find((participant) => participant.id === input.participantId) : undefined;
  const participantId = existing?.id ?? randomId();
  const participantToken = input.participantToken ?? randomToken();
  const participant = {
    id: participantId,
    displayName: cleanText(input.displayName, 48) || roleLabel(input.role),
    role: input.role,
    joinedAt: existing?.joinedAt ?? now,
    lastSeenAt: now,
    tokenHash: input.tokenHash,
  };
  const participants = existing
    ? session.participants.map((item) => item.id === participantId ? participant : item)
    : [...session.participants, participant].slice(-16);
  return {
    session: touchSession({ ...session, participants }, now),
    participantId,
    participantToken,
  };
}

export function answerStudioQuestion(
  session: StudioSession,
  participantId: string,
  questionId: string,
  value: StudioAnswerValue,
) {
  const question = getQuestion(questionId);
  if (!question || session.pausedStageIds.includes(question.stageId)) return session;
  const now = new Date().toISOString();
  const before = recommendArchitecture(session);
  const answers = session.answers.filter((answer) => !(answer.participantId === participantId && answer.questionId === questionId));
  answers.push({ participantId, questionId, value, updatedAt: now });
  const next = touchSession({ ...session, answers, savedBrief: null }, now);
  return syncArchitectureSimulation(recordRecommendationChange(next, before, questionId, now));
}

export function reactToRecommendation(session: StudioSession, participantId: string, path: keyof StudioSession["reactions"]) {
  const now = new Date().toISOString();
  const current = session.reactions[path] ?? [];
  const next = current.includes(participantId) ? current.filter((id) => id !== participantId) : [...current, participantId];
  return touchSession({ ...session, reactions: { ...session.reactions, [path]: next } }, now);
}

export function heartbeatParticipant(session: StudioSession, participantId: string) {
  const now = new Date().toISOString();
  return touchSession({
    ...session,
    participants: session.participants.map((participant) => participant.id === participantId ? { ...participant, lastSeenAt: now } : participant),
  }, now, false);
}

export function applyPresenterCommand(session: StudioSession, command: StudioPresenterCommand): StudioSession {
  const now = new Date().toISOString();
  const before = recommendArchitecture(session);
  let next = session;
  let changedQuestionId: string | undefined;

  switch (command.kind) {
    case "reveal_question": {
      const question = getQuestion(command.questionId);
      if (!question) return session;
      next = {
        ...session,
        activeStageId: question.stageId,
        revealedQuestionIds: [...new Set([...session.revealedQuestionIds, command.questionId])],
      };
      break;
    }
    case "set_stage":
      next = { ...session, activeStageId: command.stageId };
      break;
    case "toggle_stage_pause":
      next = { ...session, pausedStageIds: session.pausedStageIds.includes(command.stageId) ? session.pausedStageIds.filter((id) => id !== command.stageId) : [...session.pausedStageIds, command.stageId] };
      break;
    case "override_answer":
      next = { ...session, presenterOverrides: { ...session.presenterOverrides, [command.questionId]: command.value }, savedBrief: null };
      changedQuestionId = command.questionId;
      break;
    case "add_note":
      next = { ...session, presenterNotes: [...session.presenterNotes, cleanText(command.text, 320)].filter(Boolean).slice(-20) };
      break;
    case "add_assumption":
      next = { ...session, assumptions: [...session.assumptions, { id: randomId(), text: cleanText(command.text, 240), status: "unvalidated" as const, createdAt: now }].filter((item) => item.text).slice(-20) };
      break;
    case "update_assumption":
      next = { ...session, assumptions: session.assumptions.map((item) => item.id === command.id ? { ...item, status: command.status } : item) };
      break;
    case "add_parking_lot":
      next = { ...session, parkingLot: [...session.parkingLot, { id: randomId(), text: cleanText(command.text, 240), resolved: false, createdAt: now }].filter((item) => item.text).slice(-20) };
      break;
    case "toggle_parking_lot":
      next = { ...session, parkingLot: session.parkingLot.map((item) => item.id === command.id ? { ...item, resolved: !item.resolved } : item) };
      break;
    case "add_decision":
      next = { ...session, decisions: [...session.decisions, { id: randomId(), text: cleanText(command.text, 240), rationale: cleanText(command.rationale, 320), createdAt: now }].filter((item) => item.text).slice(-20) };
      break;
    case "set_depth":
      next = { ...session, technicalDepth: command.value };
      break;
    case "set_language_mode":
      next = { ...session, languageMode: command.value };
      break;
    case "set_confirmation":
      next = { ...session, confirmation: command.value };
      break;
    case "update_architecture_module": {
      const moduleId = cleanModuleId(command.moduleId);
      if (!moduleId) return session;
      const current = (session.architectureOverrides ?? []).find((item) => item.moduleId === moduleId);
      const updated = {
        moduleId,
        presence: command.presence ?? current?.presence ?? "unchanged" as const,
        decisionStatus: command.decisionStatus ?? current?.decisionStatus ?? "undecided" as const,
        note: command.note === undefined ? current?.note ?? "" : cleanText(command.note, 320),
        updatedAt: now,
      };
      next = {
        ...session,
        architectureOverrides: [...(session.architectureOverrides ?? []).filter((item) => item.moduleId !== moduleId), updated],
        savedBrief: null,
      };
      break;
    }
    case "restore_architecture_module":
      next = { ...session, architectureOverrides: (session.architectureOverrides ?? []).filter((item) => item.moduleId !== command.moduleId), savedBrief: null };
      break;
    case "simulation": {
      let base = session;
      if (command.action.type === "set-guided-demo" && command.action.enabled && session.scenarioId !== "meridian-contact-cloud") {
        base = reseedScenario(session, "meridian-contact-cloud");
      }
      if (command.action.type === "import-portable-state") {
        const portable = validatePortableDiagnosticSession(command.action.payload);
        if (!portable) return session;
        if (isStudioScenarioId(portable.scenarioId) && portable.scenarioId !== base.scenarioId) {
          base = reseedScenario(base, portable.scenarioId, portable.scenarioName);
        }
      }
      const state = base.architectureSimulation ?? createInitialSimulationState();
      const generatedArchitecture = buildGeneratedCanvasSnapshot(base);
      const currentArchitecture = applyArchitectureRevisions(generatedArchitecture, state.revisions);
      next = {
        ...base,
        architectureSimulation: applySimulationAction({
          session: base,
          state,
          action: command.action,
          generatedArchitecture,
          currentArchitecture,
          now,
        }),
        savedBrief: null,
      };
      break;
    }
    case "handoff":
      next = { ...session, handoffState: applyHandoffAction(session.handoffState, command.action, now) };
      break;
    case "import_session": {
      const imported = validatePortableSessionExport(command.payload);
      if (!imported) return session;
      next = {
        ...imported.session,
        id: session.id,
        code: session.code,
        status: "active",
        createdAt: session.createdAt,
        updatedAt: now,
        expiresAt: session.expiresAt,
        version: session.version,
        realtimeMode: session.realtimeMode,
        participants: session.participants,
        presenterNotes: imported.export.operatorNotesIncluded ? imported.session.presenterNotes : [],
      };
      break;
    }
    case "set_next_steps":
      next = {
        ...session,
        nextSteps: command.steps.slice(0, 12).map((step) => ({
          id: cleanText(step.id, 80) || randomId(),
          action: cleanText(step.action, 240),
          owner: cleanText(step.owner, 100),
          timing: cleanText(step.timing, 100),
          completed: Boolean(step.completed),
        })).filter((step) => step.action),
        savedBrief: null,
      };
      break;
    case "generate_brief":
      next = { ...session, savedBrief: buildSolutionBrief(session) };
      break;
    case "reset": {
      const seeded = createStudioSession(session.realtimeMode, { code: session.code, id: session.id, scenarioId: session.scenarioId, customScenarioName: session.scenarioName });
      next = {
        ...seeded.session,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        participants: session.participants,
        version: session.version,
      };
      break;
    }
  }

  next = touchSession(next, now);
  next = changedQuestionId ? recordRecommendationChange(next, before, changedQuestionId, now) : next;
  return command.kind === "simulation" ? next : syncArchitectureSimulation(next);
}

export function sanitizeStudioSession(session: StudioSession): PublicStudioSession {
  return {
    ...session,
    architectureSimulation: session.architectureSimulation ?? createInitialSimulationState(),
    handoffState: normalizeHandoffState(session.handoffState),
    participants: session.participants.map((participant) => {
      const publicParticipant = { ...participant };
      delete publicParticipant.tokenHash;
      return publicParticipant;
    }),
  };
}

export function sanitizeParticipantStudioSession(session: StudioSession): PublicStudioSession {
  const handoffState = normalizeHandoffState(session.handoffState);
  return {
    ...sanitizeStudioSession(session),
    presenterNotes: [],
    assumptions: [],
    parkingLot: [],
    decisions: [],
    savedBrief: null,
    nextSteps: [],
    handoffState: {
      ...handoffState,
      presentationMode: false,
      perspective: "facilitator",
      includeOperatorNotesInExport: false,
      rehearsal: createInitialHandoffState().rehearsal,
    },
  };
}

export function isSessionExpired(session: Pick<StudioSession, "expiresAt" | "status">, now = new Date()) {
  return session.status !== "active" || new Date(session.expiresAt).getTime() <= now.getTime();
}

export function randomSessionCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomId() {
  return crypto.randomUUID();
}

function touchSession(session: StudioSession, now: string, increment = true): StudioSession {
  return { ...session, updatedAt: now, version: increment ? session.version + 1 : session.version };
}

function recordRecommendationChange(session: StudioSession, before: ReturnType<typeof recommendArchitecture>, questionId: string, now: string) {
  const after = recommendArchitecture(session);
  if (after.primaryPath === before.primaryPath) return session;
  const question = getQuestion(questionId);
  const influence = after.influences.findLast((item) => item.questionId === questionId);
  const entry: RecommendationHistoryEntry = {
    id: randomId(),
    createdAt: now,
    path: after.primaryPath,
    title: after.title,
    reason: influence
      ? `${question?.label ?? questionId} changed the current best-fit path: ${influence.effect}`
      : `${question?.label ?? questionId} changed the balance of evidence enough to recommend ${after.title.toLowerCase()}.`,
  };
  return { ...session, recommendationHistory: [...session.recommendationHistory, entry].slice(-24) };
}

function cleanText(value: string, maxLength: number) {
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanModuleId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 80);
}

function syncArchitectureSimulation(session: StudioSession) {
  const architectureSimulation = session.architectureSimulation ?? createInitialSimulationState();
  const generated = buildGeneratedCanvasSnapshot(session);
  return { ...session, architectureSimulation: refreshSimulationState(architectureSimulation, generated) };
}

function reseedScenario(session: StudioSession, scenarioId: StudioScenarioId, customScenarioName?: string) {
  const seeded = createStudioSession(session.realtimeMode, { code: session.code, id: session.id, scenarioId, customScenarioName });
  return {
    ...seeded.session,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    participants: session.participants,
    version: session.version,
  };
}

function isStudioScenarioId(value: string): value is StudioScenarioId {
  return ["northstar-contact-cloud", "meridian-contact-cloud", "custom"].includes(value);
}

function roleLabel(role: StakeholderRole) {
  return {
    "vp-customer-experience": "Customer Experience Stakeholder",
    "voice-platform-engineer": "Voice Platform Stakeholder",
    "security-infrastructure-lead": "Security Stakeholder",
    observer: "Workshop Observer",
  }[role];
}
