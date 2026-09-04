export const REALTIME_MILESTONES = [
  "token_requested",
  "token_received",
  "socket_opening",
  "socket_opened",
  "settings_sent",
  "settings_accepted",
  "audio_started",
  "first_transcript",
  "agent_response",
  "playback_started",
  "playback_completed",
  "stop_requested",
  "socket_closing",
  "socket_closed",
  "failure",
] as const;

export type RealtimeMilestone = (typeof REALTIME_MILESTONES)[number];
export type RealtimeProtocol = "live_stt" | "flux" | "streaming_tts" | "voice_agent";
export type RealtimeEventStatus = "pending" | "active" | "success" | "warning" | "failure" | "info";
export type RealtimeEventSource = "client" | "deepgram" | "browser" | "server";

export type RealtimeEventRecord = {
  id: string;
  milestone: RealtimeMilestone;
  label: string;
  timestamp: string;
  status: RealtimeEventStatus;
  source: RealtimeEventSource;
  protocol: RealtimeProtocol;
  summary: string;
  rawEventType?: string;
  requestId?: string;
  closeCode?: number;
  closeReason?: string;
  details?: Record<string, unknown>;
  kind?: "milestone" | "raw";
};

export type RealtimeSessionSummary = {
  currentState: RealtimeMilestone | "idle";
  lastSuccessfulState?: RealtimeMilestone;
  failureState?: RealtimeMilestone;
  closeCode?: number;
  closeReason?: string;
  startedAt?: string;
  endedAt?: string;
  requestId?: string;
  lastEventTimestamp?: string;
  socketReadyState?: number;
  microphoneActive: boolean;
  playbackActive: boolean;
};

export type RealtimeSessionState = {
  sessionId: string;
  protocol: RealtimeProtocol;
  summary: RealtimeSessionSummary;
  events: RealtimeEventRecord[];
};

export type RealtimeEventInput = Omit<RealtimeEventRecord, "id" | "protocol" | "timestamp" | "label"> & {
  id?: string;
  timestamp?: string;
  label?: string;
};

export type RealtimeResourceSnapshot = Pick<RealtimeSessionSummary, "socketReadyState" | "microphoneActive" | "playbackActive">;

const DEFAULT_LABELS: Record<RealtimeMilestone, string> = {
  token_requested: "Token requested",
  token_received: "Token received",
  socket_opening: "Socket opening",
  socket_opened: "Socket opened",
  settings_sent: "Settings sent",
  settings_accepted: "Settings accepted",
  audio_started: "Audio started",
  first_transcript: "First transcript",
  agent_response: "Agent response",
  playback_started: "Playback started",
  playback_completed: "Playback completed",
  stop_requested: "Stop requested",
  socket_closing: "Socket closing",
  socket_closed: "Socket closed",
  failure: "Failure",
};

const APPLICABLE: Record<RealtimeProtocol, ReadonlySet<RealtimeMilestone>> = {
  live_stt: new Set([
    "token_requested", "token_received", "socket_opening", "socket_opened", "audio_started",
    "first_transcript", "stop_requested", "socket_closing", "socket_closed", "failure",
  ]),
  flux: new Set([
    "token_requested", "token_received", "socket_opening", "socket_opened", "settings_sent",
    "settings_accepted", "audio_started", "first_transcript", "stop_requested", "socket_closing",
    "socket_closed", "failure",
  ]),
  streaming_tts: new Set([
    "token_requested", "token_received", "socket_opening", "socket_opened", "settings_sent",
    "audio_started", "playback_started", "playback_completed", "stop_requested", "socket_closing",
    "socket_closed", "failure",
  ]),
  voice_agent: new Set(REALTIME_MILESTONES),
};

export function createRealtimeSession(protocol: RealtimeProtocol, sessionId = `session-${Date.now()}`): RealtimeSessionState {
  return {
    sessionId,
    protocol,
    summary: {
      currentState: "idle",
      microphoneActive: false,
      playbackActive: false,
    },
    events: [],
  };
}

export function isRealtimeMilestoneApplicable(protocol: RealtimeProtocol, milestone: RealtimeMilestone) {
  return APPLICABLE[protocol].has(milestone);
}

export function realtimeMilestoneLabel(protocol: RealtimeProtocol, milestone: RealtimeMilestone) {
  if (protocol === "flux" && milestone === "settings_sent") return "Configure sent";
  if (protocol === "flux" && milestone === "settings_accepted") return "Configure accepted";
  if (protocol === "streaming_tts" && milestone === "settings_sent") return "Text/config sent";
  if (protocol === "streaming_tts" && milestone === "audio_started") return "Audio received";
  return DEFAULT_LABELS[milestone];
}

export function appendRealtimeEvent(state: RealtimeSessionState, input: RealtimeEventInput): RealtimeSessionState {
  if (input.kind !== "raw" && input.milestone !== "failure") {
    const missing = missingPrerequisite(state, input.milestone);
    if (missing) {
      return appendRealtimeEvent(state, {
        milestone: "failure",
        status: "failure",
        source: "client",
        summary: `${realtimeMilestoneLabel(state.protocol, input.milestone)} was blocked because ${realtimeMilestoneLabel(state.protocol, missing)} had not completed.`,
        timestamp: input.timestamp,
        details: { attemptedMilestone: input.milestone, missingPrerequisite: missing },
      });
    }
  }
  const timestamp = input.timestamp ?? new Date().toISOString();
  const sanitizedDetails = input.details ? sanitizeRealtimeDetails(input.details) : undefined;
  const event: RealtimeEventRecord = {
    ...input,
    id: input.id ?? `${state.sessionId}-${state.events.length + 1}`,
    protocol: state.protocol,
    timestamp,
    label: input.label ?? realtimeMilestoneLabel(state.protocol, input.milestone),
    closeReason: input.closeReason ?? undefined,
    details: sanitizedDetails,
    kind: input.kind ?? "milestone",
  };
  const previous = state.summary;
  const isMilestone = event.kind !== "raw";
  const isSuccess = isMilestone && event.status === "success" && event.milestone !== "failure";
  const isFailure = isMilestone && event.milestone === "failure";
  const nextSummary: RealtimeSessionSummary = {
    ...previous,
    currentState: isMilestone ? event.milestone : previous.currentState,
    lastSuccessfulState: isSuccess ? event.milestone : previous.lastSuccessfulState,
    failureState: isFailure && previous.currentState !== "idle" ? previous.currentState : previous.failureState,
    closeCode: event.closeCode ?? previous.closeCode,
    closeReason: event.closeCode !== undefined ? event.closeReason ?? "" : previous.closeReason,
    requestId: event.requestId ?? previous.requestId,
    startedAt: previous.startedAt ?? timestamp,
    endedAt: event.milestone === "socket_closed" || isFailure ? timestamp : previous.endedAt,
    lastEventTimestamp: timestamp,
  };
  return { ...state, summary: nextSummary, events: [...state.events, event] };
}

function missingPrerequisite(state: RealtimeSessionState, milestone: RealtimeMilestone): RealtimeMilestone | null {
  const has = (candidate: RealtimeMilestone) => hasRealtimeMilestone(state, candidate);
  if (milestone === "token_received" && !has("token_requested")) return "token_requested";
  if (milestone === "socket_opening" && !has("token_received")) return "token_received";
  if (milestone === "socket_opened" && !has("socket_opening")) return "socket_opening";
  if (milestone === "settings_sent" && !has("socket_opened")) return "socket_opened";
  if (milestone === "settings_accepted" && !has("settings_sent")) return "settings_sent";
  if (milestone === "audio_started") {
    if (!has("socket_opened")) return "socket_opened";
    if ((state.protocol === "voice_agent" || state.protocol === "flux") && !has("settings_accepted")) return "settings_accepted";
    if (state.protocol === "streaming_tts" && !has("settings_sent")) return "settings_sent";
  }
  if (milestone === "first_transcript" && !has("audio_started")) return "audio_started";
  if (milestone === "agent_response" && state.protocol === "voice_agent" && !has("first_transcript")) return "first_transcript";
  if (milestone === "playback_started" && !has("audio_started")) return "audio_started";
  if (milestone === "playback_completed" && !has("playback_started")) return "playback_started";
  if (milestone === "socket_closed" && !has("socket_opened")) return "socket_opened";
  return null;
}

export function updateRealtimeResources(state: RealtimeSessionState, snapshot: Partial<RealtimeResourceSnapshot>): RealtimeSessionState {
  return { ...state, summary: { ...state.summary, ...snapshot } };
}

export function realtimeFailureCount(state: RealtimeSessionState) {
  return state.events.filter((event) => event.kind !== "raw" && event.milestone === "failure" && event.status === "failure").length;
}

export function hasRealtimeMilestone(state: RealtimeSessionState, milestone: RealtimeMilestone) {
  return state.events.some((event) => event.kind !== "raw" && event.milestone === milestone && event.status !== "failure");
}

export function readRequestId(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  for (const key of ["request_id", "requestId", "dg-request-id"]) {
    if (typeof value[key] === "string" && value[key]) return value[key];
  }
  return undefined;
}

export type RealtimeDiagnosticExport = {
  protocol: RealtimeProtocol;
  currentState: RealtimeMilestone | "idle";
  lastSuccessfulState: RealtimeMilestone | null;
  requestId: string | null;
  closeCode: number | null;
  closeReason: string;
  milestones: Array<{ label: string; status: RealtimeEventStatus; timestamp: string }>;
  credentialExposure: false;
  audioPersisted: false;
  transcriptPersisted: false;
};

export function createRealtimeDiagnosticExport(state: RealtimeSessionState): RealtimeDiagnosticExport {
  return {
    protocol: state.protocol,
    currentState: state.summary.currentState,
    lastSuccessfulState: state.summary.lastSuccessfulState ?? null,
    requestId: state.summary.requestId ?? null,
    closeCode: state.summary.closeCode ?? null,
    closeReason: state.summary.closeReason ?? "",
    milestones: state.events
      .filter((event) => event.kind !== "raw")
      .map(({ label, status, timestamp }) => ({ label, status, timestamp })),
    credentialExposure: false,
    audioPersisted: false,
    transcriptPersisted: false,
  };
}

export type RealtimeFailureAnalysis = {
  classification: "Observed" | "Likely" | "Unknown";
  summary: string;
  stage: string;
  nextStep: string;
};

export function analyzeRealtimeFailure(state: RealtimeSessionState): RealtimeFailureAnalysis {
  const has = (milestone: RealtimeMilestone) => hasRealtimeMilestone(state, milestone);
  if (!has("socket_opened")) {
    return {
      classification: "Observed",
      summary: `Socket failed before opening. Last successful state: ${formatRealtimeState(state.summary.lastSuccessfulState)}.`,
      stage: "Authentication or WebSocket handshake",
      nextStep: "Inspect Raw Events and run the manually invoked server diagnostic client.",
    };
  }
  if (isRealtimeMilestoneApplicable(state.protocol, "settings_accepted") && !has("settings_accepted")) {
    return {
      classification: "Observed",
      summary: "Socket opened, but settings were not accepted.",
      stage: "Configuration acknowledgement",
      nextStep: "Open Raw Events and inspect the last Deepgram configuration event.",
    };
  }
  if (isRealtimeMilestoneApplicable(state.protocol, "audio_started") && !has("audio_started")) {
    return {
      classification: "Observed",
      summary: "Configuration completed, but no audio frames were sent or received.",
      stage: "Audio",
      nextStep: "Inspect microphone permission, audio tracks, socket readyState, and Raw Events.",
    };
  }
  if (isRealtimeMilestoneApplicable(state.protocol, "first_transcript") && !has("first_transcript")) {
    return {
      classification: "Observed",
      summary: "Audio started, but no transcript event was received.",
      stage: "Transcript",
      nextStep: "Inspect Raw Events for audio, speech, and transcript messages.",
    };
  }
  if (has("agent_response") && !has("playback_started")) {
    return {
      classification: "Observed",
      summary: "Agent response was received, but playback did not start.",
      stage: "Playback",
      nextStep: "Inspect binary audio events and the browser audio context state.",
    };
  }
  return {
    classification: "Unknown",
    summary: "The session failed after one or more realtime milestones completed.",
    stage: "Unknown",
    nextStep: "Open Raw Events and compare the final event with the last successful state.",
  };
}

export function formatRealtimeState(state: RealtimeMilestone | "idle" | undefined) {
  if (!state || state === "idle") return "Idle";
  return DEFAULT_LABELS[state];
}

export function formatRealtimeClose(code?: number, reason?: string) {
  if (code === undefined) return "Not closed";
  if (code === 1006) {
    return "1006 — Abnormal closure. The browser did not receive a normal close frame and may not expose the handshake response body.";
  }
  return `${code} — ${reason || "No close reason provided"}`;
}

export function sanitizeRealtimeDetails(value: Record<string, unknown>): Record<string, unknown> {
  return sanitizeRecord(value);
}

function sanitizeRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeValue(key, item)]));
}

function sanitizeValue(key: string, value: unknown): unknown {
  if (/authorization|api[_-]?key|token|credential|cookie|secret/i.test(key)) return "[REDACTED]";
  if (/transcript|utterance|content|\btext\b/i.test(key) && typeof value === "string") return "[REDACTED: transcript text omitted]";
  if (value instanceof ArrayBuffer) return { byteLength: value.byteLength, persisted: false };
  if (ArrayBuffer.isView(value)) return { byteLength: value.byteLength, persisted: false };
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(key, item));
  if (isRecord(value)) return sanitizeRecord(value);
  if (typeof value === "string" && (/\b(?:Bearer|Token)\s+\S+/i.test(value) || /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(value))) {
    return "[REDACTED]";
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
