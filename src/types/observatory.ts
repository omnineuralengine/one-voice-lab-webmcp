import type { InspectorRecord } from "@/lib/inspection";

export type ObservatoryMode = "synthetic" | "live";
export type ObservatoryProvenance = "measured" | "derived" | "simulated" | "human-rated" | "unavailable";
export type ObservatorySource =
  | "browser"
  | "local-server"
  | "deepgram-stt"
  | "deepgram-tts"
  | "deepgram-agent"
  | "deepgram-manage"
  | "local-tool"
  | "synthetic-fixture";
export type ObservatoryStage =
  | "audio-ingress"
  | "stt"
  | "turn-taking"
  | "agent"
  | "tool"
  | "tts-playback"
  | "outcome";
export type ObservatoryRedactionState = "sanitized" | "metadata-only" | "not-applicable";
export type ObservatoryCostState = "Actual cost" | "Pending" | "Estimated locally" | "Unavailable" | "Management scope unavailable";
export type ObservatoryPresetId = "guided-demo" | "audio-signal-lab" | "speak-watch" | "compare-configs" | "hear-api" | "voice-loop" | "italian-path" | "northstar-agent";

export type ObservatoryEvent = {
  runId: string;
  sessionId: string;
  turnId?: string;
  requestId?: string;
  inspectorId?: string;
  localEventId: string;
  sequence: number;
  timestamp: string;
  monotonicOffsetMs: number;
  mode: ObservatoryMode;
  source: ObservatorySource;
  stage: ObservatoryStage;
  eventType: string;
  provenance: ObservatoryProvenance;
  durationMs?: number;
  value?: string | number | boolean;
  unit?: string;
  severity?: "info" | "warning" | "error";
  redactionState: ObservatoryRedactionState;
  sanitizedPayload?: unknown;
};

export type ObservatoryMetric = {
  id: string;
  label: string;
  value: string;
  provenance: ObservatoryProvenance;
  definition: string;
};

export type ObservatoryRun = {
  version: 1;
  mode: ObservatoryMode;
  runId: string;
  sessionId: string;
  presetId: ObservatoryPresetId;
  operation: string;
  status: "idle" | "confirming" | "running" | "completed" | "stopped" | "error";
  startedAt: string;
  completedAt?: string;
  settings: Record<string, unknown>;
  events: ObservatoryEvent[];
  metrics: ObservatoryMetric[];
  requestIds: string[];
  activeRequestCount: number;
  sessionRequestCount: number;
  costState: ObservatoryCostState;
  actualCostUsd?: number;
  error?: string;
  inspector?: InspectorRecord | null;
  transcript?: string;
  comparisonTranscript?: string;
  referenceTranscript?: string;
  notes: string[];
};

export type ObservatorySavedRun = Omit<ObservatoryRun, "events" | "inspector" | "transcript" | "comparisonTranscript" | "referenceTranscript"> & {
  events: Array<Omit<ObservatoryEvent, "sanitizedPayload">>;
  transcript?: string;
  comparisonTranscript?: string;
  referenceTranscript?: string;
  savedAt: string;
  transcriptIncluded: boolean;
  retention: "metadata-only" | "metadata-and-sanitized-transcript";
};

export type ObservatoryConfirmation = {
  operation: string;
  model: string;
  expectedInput: string;
  billableRequests: number;
  safetyLimit: string;
};

export type ObservatoryPreset = {
  id: ObservatoryPresetId;
  title: string;
  shortTitle: string;
  mode: "guide" | "live" | "conditional";
  teaches: string;
  billableRequests: number;
  limit: string;
  observableEvents: string[];
  successCriteria: string;
  cleanup: string;
};

export type ObservatoryManagementProject = { handle: string; name: string };
export type ObservatoryManagementResult = {
  state: ObservatoryCostState;
  projects?: ObservatoryManagementProject[];
  projectHandle?: string;
  projectName?: string;
  requestId?: string;
  actualCostUsd?: number;
  balanceAmount?: number;
  balanceUnit?: string;
  reportedAt: string;
  note: string;
};
