import { cloneConfiguration, mergeFluxConfiguration, validateFluxConfiguration } from "./config";
import {
  FLUX_OBSERVATORY_SCHEMA_VERSION,
  type FluxConfiguration,
  type FluxConfigurationTransaction,
  type FluxNormalizedEvent,
  type FluxLocalLifecycleName,
  type FluxObservatoryState,
  type FluxTurnEvent,
  type FluxTurnState,
} from "./types";

export interface CreateFluxObservatoryStateOptions {
  sessionId: string;
  mode: FluxObservatoryState["mode"];
  configuration: FluxConfiguration;
  createdAt?: string;
  connectionGeneration?: number;
  maxEvents?: number;
}

export function createFluxObservatoryState(options: CreateFluxObservatoryStateOptions): FluxObservatoryState {
  const validation = validateFluxConfiguration(options.configuration);
  if (!validation.success || !validation.value) throw new Error(validation.errors.join(" "));
  return {
    schemaVersion: FLUX_OBSERVATORY_SCHEMA_VERSION,
    sessionId: options.sessionId,
    mode: options.mode,
    createdAt: options.createdAt ?? new Date().toISOString(),
    activeConnectionGeneration: options.connectionGeneration ?? 1,
    connectionState: "idle",
    credentialState: "unavailable",
    microphoneState: "idle",
    audioStreaming: false,
    activeConfiguration: validation.value,
    configurationHistory: [],
    events: [],
    turns: [],
    seenEventKeys: [],
    duplicateEventsSuppressed: 0,
    staleEventsIgnored: 0,
    outOfOrderProviderEvents: 0,
    maxEvents: Math.min(5_000, Math.max(100, options.maxEvents ?? 1_500)),
    providerValidationState: options.mode === "synthetic-replay" ? "synthetic-only" : "not-run",
  };
}

export function reduceFluxObservatoryEvents(state: FluxObservatoryState, events: FluxNormalizedEvent[]): FluxObservatoryState {
  return events.reduce(reduceFluxObservatoryEvent, state);
}

export function reduceFluxObservatoryEvent(state: FluxObservatoryState, event: FluxNormalizedEvent): FluxObservatoryState {
  const generationActivation = isGenerationActivation(event);
  if (event.connectionGeneration < state.activeConnectionGeneration || (event.connectionGeneration > state.activeConnectionGeneration && !generationActivation)) {
    return { ...state, staleEventsIgnored: state.staleEventsIgnored + 1 };
  }

  const next = cloneState(state);
  if (event.connectionGeneration > next.activeConnectionGeneration && generationActivation) {
    next.activeConnectionGeneration = event.connectionGeneration;
    next.lastProviderSequenceId = undefined;
  }

  if (next.seenEventKeys.includes(event.dedupeKey)) {
    return { ...next, duplicateEventsSuppressed: next.duplicateEventsSuppressed + 1 };
  }

  const outOfOrder = event.source === "provider" && event.sequenceId !== undefined && next.lastProviderSequenceId !== undefined && event.sequenceId < next.lastProviderSequenceId;
  next.events = appendBoundedEvent(next.events, event, next.maxEvents);
  next.seenEventKeys = [...next.seenEventKeys, event.dedupeKey].slice(-next.maxEvents * 2);
  if (outOfOrder) {
    next.outOfOrderProviderEvents += 1;
    return next;
  }
  if (event.source === "provider" && event.sequenceId !== undefined) next.lastProviderSequenceId = event.sequenceId;

  if (event.kind === "local-lifecycle") applyLifecycle(next, event.name);
  if (event.kind === "connected") {
    next.connectionState = "open";
    if (next.mode === "live-provider") next.providerValidationState = "provider-event-observed-unreviewed";
  }
  if (event.kind === "provider-error") {
    next.connectionState = "failed";
    next.audioStreaming = false;
  }
  if (event.kind === "configuration-request") {
    next.configurationHistory.push({
      id: event.id,
      requestKey: event.requestKey,
      previousConfiguration: cloneConfiguration(event.previousConfiguration),
      requestedConfiguration: event.requestedConfiguration,
      requestedAt: event.receivedAt,
      status: "sent",
    });
  }
  if (event.kind === "configure-success") applyConfigurationSuccess(next, event.acknowledged, event.receivedAt);
  if (event.kind === "configure-failure") applyConfigurationFailure(next, event.code, event.description, event.receivedAt);
  if (event.kind === "turn") {
    next.turns = applyTurnEvent(next.turns, event, next.activeConfiguration);
    if (next.mode === "live-provider") next.providerValidationState = "provider-event-observed-unreviewed";
  }
  return next;
}

export function markFluxProviderValidationReviewed(state: FluxObservatoryState): FluxObservatoryState {
  if (state.mode !== "live-provider" || state.providerValidationState !== "provider-event-observed-unreviewed") return state;
  return { ...state, providerValidationState: "manually-validated" };
}

function cloneState(state: FluxObservatoryState): FluxObservatoryState {
  return {
    ...state,
    activeConfiguration: cloneConfiguration(state.activeConfiguration),
    configurationHistory: state.configurationHistory.map(cloneTransaction),
    events: [...state.events],
    turns: state.turns.map((turn) => ({
      ...turn,
      words: turn.words.map((word) => ({ ...word })),
      languages: [...turn.languages],
      languagesHinted: [...turn.languagesHinted],
      eventIds: [...turn.eventIds],
      eventSequence: [...turn.eventSequence],
      activeConfiguration: cloneConfiguration(turn.activeConfiguration),
      missingFields: [...turn.missingFields],
    })),
    seenEventKeys: [...state.seenEventKeys],
  };
}

function cloneTransaction(transaction: FluxConfigurationTransaction): FluxConfigurationTransaction {
  return {
    ...transaction,
    previousConfiguration: cloneConfiguration(transaction.previousConfiguration),
    requestedConfiguration: {
      ...transaction.requestedConfiguration,
      thresholds: transaction.requestedConfiguration.thresholds ? { ...transaction.requestedConfiguration.thresholds } : undefined,
      keyterms: transaction.requestedConfiguration.keyterms ? [...transaction.requestedConfiguration.keyterms] : undefined,
      languageHints: transaction.requestedConfiguration.languageHints ? [...transaction.requestedConfiguration.languageHints] : transaction.requestedConfiguration.languageHints,
    },
    resultingConfiguration: transaction.resultingConfiguration ? cloneConfiguration(transaction.resultingConfiguration) : undefined,
  };
}

function isGenerationActivation(event: FluxNormalizedEvent) {
  return event.kind === "local-lifecycle" && (event.name === "session-created" || event.name === "websocket-connecting" || event.name === "reconnect-attempt");
}

function appendBoundedEvent(events: FluxNormalizedEvent[], event: FluxNormalizedEvent, maxEvents: number) {
  return [...events, event]
    .sort((a, b) => a.monotonicMs - b.monotonicMs || a.id.localeCompare(b.id))
    .slice(-maxEvents);
}

function applyLifecycle(state: FluxObservatoryState, name: FluxLocalLifecycleName) {
  switch (name) {
    case "credential-acquired": state.credentialState = "memory-only"; break;
    case "websocket-connecting": state.connectionState = "connecting"; break;
    case "websocket-open": state.connectionState = "open"; break;
    case "microphone-capture-start": state.microphoneState = "active"; break;
    case "audio-streaming-start": state.audioStreaming = true; break;
    case "token-expiry": state.credentialState = "expired"; break;
    case "reconnect-attempt": state.connectionState = "reconnecting"; break;
    case "stop-requested": state.connectionState = "stopping"; break;
    case "stream-closure": state.connectionState = "closed"; state.audioStreaming = false; break;
    case "cleanup-complete":
      state.connectionState = "closed";
      state.credentialState = "cleared";
      state.microphoneState = "stopped";
      state.audioStreaming = false;
      break;
  }
}

function applyConfigurationSuccess(state: FluxObservatoryState, acknowledged: Parameters<typeof mergeFluxConfiguration>[1], respondedAt: string) {
  const index = findMostRecentPendingConfiguration(state.configurationHistory);
  const requested = index >= 0 ? state.configurationHistory[index].requestedConfiguration : {};
  const effective = hasConfigurationValues(acknowledged) ? acknowledged : requested;
  state.activeConfiguration = mergeFluxConfiguration(state.activeConfiguration, effective);
  if (index >= 0) {
    state.configurationHistory[index] = {
      ...state.configurationHistory[index],
      respondedAt,
      status: "provider-acknowledged",
      resultingConfiguration: cloneConfiguration(state.activeConfiguration),
    };
  }
}

function applyConfigurationFailure(state: FluxObservatoryState, code: string | undefined, description: string | undefined, respondedAt: string) {
  const index = findMostRecentPendingConfiguration(state.configurationHistory);
  if (index < 0) return;
  state.configurationHistory[index] = {
    ...state.configurationHistory[index],
    respondedAt,
    status: "provider-rejected",
    failureCode: code,
    failureDescription: description,
    resultingConfiguration: cloneConfiguration(state.activeConfiguration),
  };
}

function findMostRecentPendingConfiguration(history: FluxConfigurationTransaction[]) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index].status === "sent") return index;
  }
  return -1;
}

function hasConfigurationValues(update: Parameters<typeof mergeFluxConfiguration>[1]) {
  return Boolean(update.thresholds || update.keyterms !== undefined || update.languageHints !== undefined);
}

function applyTurnEvent(turns: FluxTurnState[], event: FluxTurnEvent, activeConfiguration: FluxConfiguration): FluxTurnState[] {
  if (event.turnIndex === undefined) return turns;
  const index = turns.findIndex((turn) => turn.turnIndex === event.turnIndex);
  const turn = index >= 0 ? { ...turns[index] } : createTurn(event.turnIndex, activeConfiguration);
  turn.transcript = event.transcript || turn.transcript;
  if (event.words.length) turn.words = event.words.map((word) => ({ ...word }));
  if (event.languages.length) turn.languages = [...event.languages];
  if (event.languagesHinted.length || activeConfiguration.languageHints.length === 0) turn.languagesHinted = [...event.languagesHinted];
  turn.eventIds = [...turn.eventIds, event.id];
  turn.eventSequence = [...turn.eventSequence, event.event];
  if (event.event === "StartOfTurn") {
    turn.status = "active";
    turn.startMonotonicMs ??= event.monotonicMs;
  } else if (event.event === "EagerEndOfTurn") {
    turn.status = "eager";
    turn.eagerMonotonicMs = event.monotonicMs;
  } else if (event.event === "TurnResumed") {
    turn.status = "resumed";
    turn.resumedCount += 1;
  } else if (event.event === "EndOfTurn") {
    turn.status = "complete";
    turn.endMonotonicMs = event.monotonicMs;
  }
  turn.missingFields = [
    ...(turn.startMonotonicMs === undefined ? ["StartOfTurn local timestamp"] : []),
    ...(turn.status === "complete" && turn.endMonotonicMs === undefined ? ["EndOfTurn local timestamp"] : []),
    ...(turn.words.length === 0 ? ["word timing"] : []),
  ];
  const next = [...turns];
  if (index >= 0) next[index] = turn;
  else next.push(turn);
  return next.sort((a, b) => a.turnIndex - b.turnIndex);
}

function createTurn(turnIndex: number, activeConfiguration: FluxConfiguration): FluxTurnState {
  return {
    turnIndex,
    status: "active",
    transcript: "",
    words: [],
    languages: [],
    languagesHinted: [],
    eventIds: [],
    eventSequence: [],
    resumedCount: 0,
    activeConfiguration: cloneConfiguration(activeConfiguration),
    missingFields: [],
  };
}
