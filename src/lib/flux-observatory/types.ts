export const FLUX_OBSERVATORY_SCHEMA_VERSION = "flux-observatory-v1" as const;

export const FLUX_MODELS = ["flux-general-en", "flux-general-multi"] as const;
export type FluxModel = (typeof FLUX_MODELS)[number];

export const FLUX_ENCODINGS = ["linear16", "linear32", "mulaw", "alaw", "opus", "ogg-opus"] as const;
export type FluxEncoding = (typeof FLUX_ENCODINGS)[number];

export const FLUX_SAMPLE_RATES = [8000, 16000, 24000, 44100, 48000] as const;
export type FluxSampleRate = (typeof FLUX_SAMPLE_RATES)[number];

export const FLUX_SUPPORTED_LANGUAGE_CODES = ["en", "es", "fr", "de", "hi", "ru", "pt", "ja", "it", "nl"] as const;

export type FluxSessionMode = "synthetic-replay" | "live-provider";
export type FluxEvidenceLabel = "Synthetic fixture — not a live Deepgram result" | "Live provider observation — review required" | "Locally observed lifecycle";

export interface FluxThresholdConfiguration {
  eotThreshold: number;
  eagerEotThreshold: number | null;
  eotTimeoutMs: number;
}

export interface FluxConfiguration {
  model: FluxModel;
  encoding: FluxEncoding;
  sampleRate: FluxSampleRate;
  targetChunkMs: number;
  thresholds: FluxThresholdConfiguration;
  keyterms: string[];
  languageHints: string[];
}

export interface FluxConfigurationUpdate {
  thresholds?: Partial<FluxThresholdConfiguration>;
  keyterms?: string[];
  languageHints?: string[] | null;
}

export interface FluxConfigureMessage {
  type: "Configure";
  thresholds?: {
    eot_threshold?: number;
    eager_eot_threshold?: number;
    eot_timeout_ms?: number;
  };
  keyterms?: string[];
  language_hints?: string[] | null;
}

export interface FluxValidationResult<T> {
  success: boolean;
  value?: T;
  errors: string[];
}

export interface FluxWord {
  word: string;
  start?: number;
  end?: number;
  confidence?: number;
}

export const FLUX_TURN_EVENT_NAMES = ["Update", "StartOfTurn", "EagerEndOfTurn", "TurnResumed", "EndOfTurn"] as const;
export type FluxTurnEventName = (typeof FLUX_TURN_EVENT_NAMES)[number];

export const FLUX_LOCAL_LIFECYCLE_NAMES = [
  "session-created",
  "credential-acquired",
  "websocket-connecting",
  "websocket-open",
  "microphone-capture-start",
  "audio-streaming-start",
  "audio-chunk-sent",
  "audio-frame-dropped",
  "audio-frame-delayed",
  "provider-warning",
  "token-expiry",
  "reconnect-attempt",
  "stop-requested",
  "stream-closure",
  "cleanup-complete",
] as const;
export type FluxLocalLifecycleName = (typeof FLUX_LOCAL_LIFECYCLE_NAMES)[number];

export interface FluxEventBase {
  id: string;
  dedupeKey: string;
  sessionId: string;
  connectionGeneration: number;
  monotonicMs: number;
  receivedAt: string;
  source: "local" | "provider";
  mode: FluxSessionMode;
  evidenceLabel: FluxEvidenceLabel;
  requestId?: string;
  sequenceId?: number;
  providerTimestampMs?: number;
  sanitizedPayload?: Record<string, unknown>;
}

export interface FluxLocalLifecycleEvent extends FluxEventBase {
  kind: "local-lifecycle";
  source: "local";
  name: FluxLocalLifecycleName;
  details: Record<string, unknown>;
}

export interface FluxConfigurationRequestEvent extends FluxEventBase {
  kind: "configuration-request";
  source: "local";
  requestKey: string;
  previousConfiguration: FluxConfiguration;
  requestedConfiguration: FluxConfigurationUpdate;
  message: FluxConfigureMessage;
}

export interface FluxConnectedEvent extends FluxEventBase {
  kind: "connected";
  source: "provider";
}

export interface FluxTurnEvent extends FluxEventBase {
  kind: "turn";
  source: "provider";
  event: FluxTurnEventName;
  turnIndex?: number;
  audioWindowStart?: number;
  audioWindowEnd?: number;
  transcript: string;
  words: FluxWord[];
  endOfTurnConfidence?: number;
  languages: string[];
  languagesHinted: string[];
}

export interface FluxConfigureSuccessEvent extends FluxEventBase {
  kind: "configure-success";
  source: "provider";
  acknowledged: FluxConfigurationUpdate;
}

export interface FluxConfigureFailureEvent extends FluxEventBase {
  kind: "configure-failure";
  source: "provider";
  code?: string;
  description?: string;
}

export interface FluxProviderErrorEvent extends FluxEventBase {
  kind: "provider-error";
  source: "provider";
  code?: string;
  description: string;
  fatal: true;
}

export interface FluxProviderWarningEvent extends FluxEventBase {
  kind: "provider-warning";
  source: "provider";
  code?: string;
  description: string;
}

export interface FluxUnknownProviderEvent extends FluxEventBase {
  kind: "unknown-provider-message";
  source: "provider";
  providerType?: string;
}

export interface FluxMalformedProviderEvent extends FluxEventBase {
  kind: "malformed-provider-message";
  source: "provider";
  reason: string;
}

export type FluxNormalizedEvent =
  | FluxLocalLifecycleEvent
  | FluxConfigurationRequestEvent
  | FluxConnectedEvent
  | FluxTurnEvent
  | FluxConfigureSuccessEvent
  | FluxConfigureFailureEvent
  | FluxProviderErrorEvent
  | FluxProviderWarningEvent
  | FluxUnknownProviderEvent
  | FluxMalformedProviderEvent;

export interface FluxNormalizeContext {
  sessionId: string;
  connectionGeneration: number;
  monotonicMs: number;
  mode: FluxSessionMode;
  receivedAt?: string;
}

export interface FluxConfigurationTransaction {
  id: string;
  requestKey: string;
  previousConfiguration: FluxConfiguration;
  requestedConfiguration: FluxConfigurationUpdate;
  resultingConfiguration?: FluxConfiguration;
  requestedAt: string;
  respondedAt?: string;
  status: "sent" | "provider-acknowledged" | "provider-rejected";
  failureCode?: string;
  failureDescription?: string;
}

export interface FluxTurnState {
  turnIndex: number;
  status: "active" | "eager" | "resumed" | "complete";
  transcript: string;
  words: FluxWord[];
  languages: string[];
  languagesHinted: string[];
  eventIds: string[];
  eventSequence: FluxTurnEventName[];
  startMonotonicMs?: number;
  eagerMonotonicMs?: number;
  endMonotonicMs?: number;
  resumedCount: number;
  activeConfiguration: FluxConfiguration;
  missingFields: string[];
}

export interface FluxObservatoryState {
  schemaVersion: typeof FLUX_OBSERVATORY_SCHEMA_VERSION;
  sessionId: string;
  mode: FluxSessionMode;
  createdAt: string;
  activeConnectionGeneration: number;
  connectionState: "idle" | "connecting" | "open" | "reconnecting" | "stopping" | "closed" | "failed";
  credentialState: "unavailable" | "memory-only" | "expired" | "cleared";
  microphoneState: "idle" | "active" | "stopped";
  audioStreaming: boolean;
  activeConfiguration: FluxConfiguration;
  configurationHistory: FluxConfigurationTransaction[];
  events: FluxNormalizedEvent[];
  turns: FluxTurnState[];
  seenEventKeys: string[];
  lastProviderSequenceId?: number;
  duplicateEventsSuppressed: number;
  staleEventsIgnored: number;
  outOfOrderProviderEvents: number;
  maxEvents: number;
  providerValidationState: "synthetic-only" | "not-run" | "provider-event-observed-unreviewed" | "manually-validated";
}

export interface FluxMetricSummary {
  unit: "milliseconds";
  sampleSize: number;
  minimum?: number;
  maximum?: number;
  median?: number;
  p95?: number;
  medianStatus: "available" | "insufficient-observations";
  p95Status: "available" | "insufficient-observations";
}

export interface FluxMetrics {
  completedTurnCount: number;
  resumedTurnCount: number;
  unknownEventCount: number;
  malformedEventCount: number;
  configurationFailureCount: number;
  connectionFailureCount: number;
  droppedAudioFrameCount: number;
  delayedAudioFrameCount: number;
  startToEager: FluxMetricSummary;
  eagerToEnd: FluxMetricSummary;
  startToEnd: FluxMetricSummary;
  reconnectDuration: FluxMetricSummary;
  observedChunkInterval: FluxMetricSummary;
  timingCaveat: string;
  forcedTimeoutCount: null;
  forcedTimeoutNote: string;
}

export type FluxReplayInput =
  | { kind: "provider"; atMs: number; generation?: number; payload: unknown }
  | { kind: "local"; atMs: number; generation?: number; name: FluxLocalLifecycleName; details?: Record<string, unknown> }
  | { kind: "configuration-request"; atMs: number; generation?: number; requestKey: string; update: FluxConfigurationUpdate };

export interface FluxReplayFixture {
  id: string;
  title: string;
  description: string;
  evidenceLabel: "Synthetic fixture — not a live Deepgram result";
  initialConfiguration: FluxConfiguration;
  inputs: FluxReplayInput[];
}

export interface FluxScorecard {
  schemaVersion: "flux-poc-scorecard-v1";
  runId: string;
  generatedAt: string;
  applicationVersion?: string;
  mode: FluxSessionMode;
  providerValidationState: FluxObservatoryState["providerValidationState"];
  selectedModel: FluxModel;
  audioConfiguration: { encoding: FluxEncoding; sampleRate: FluxSampleRate; configuredTargetChunkMs: number };
  thresholdConfiguration: FluxThresholdConfiguration;
  languageHints: string[];
  keyterms: string[];
  completedTurns: number;
  resumedTurns: number;
  configurationOutcomes: { acknowledged: number; rejected: number };
  connectionFailures: number;
  reconnectBehavior: FluxMetricSummary;
  timingSamples: {
    startToEager: FluxMetricSummary;
    eagerToEnd: FluxMetricSummary;
    startToEnd: FluxMetricSummary;
    observedChunkInterval: FluxMetricSummary;
  };
  reviewerNotes: string[];
  observedStrengths: string[];
  observedFailures: string[];
  unsupportedConclusions: string[];
  assumptions: string[];
  recommendedNextTest: string;
  evidenceRequiredBeforeProduction: string[];
  privacy: { transcriptsIncluded: false; rawAudioIncluded: false; credentialsIncluded: false };
}

export interface FluxHandoffs {
  liveSolutionStudio: {
    customerPattern: string;
    desiredTurnBehavior: string;
    thresholdHypothesis: string;
    latencyRequirement: string;
    interruptionRequirement: string;
    evidenceStatus: string;
    risks: string[];
    unresolvedDiscoveryQuestions: string[];
  };
  architectureStudio: {
    model: FluxModel;
    clientServerOwnership: string;
    credentialBoundary: string;
    audioTransport: string;
    turnEventFlow: FluxTurnEventName[];
    configurationPath: string;
    integrationPlaceholders: string[];
    cancellationBehavior: string;
    reconnectStrategy: string;
    observabilityPoints: string[];
    deploymentAssumptions: string[];
  };
  apiLab: {
    endpoint: "/v2/listen";
    transport: "wss";
    supportedParameters: string[];
    exampleConfiguration: FluxConfigureMessage;
    eventSchema: string[];
    authenticationBoundary: string;
  };
  solutionDeliverablesStudio: {
    evidenceSummary: string;
    architectureData: string[];
    pocMetrics: FluxMetrics;
    assumptions: string[];
    risks: string[];
    productionReadinessGaps: string[];
    sourceLabels: string[];
  };
}
