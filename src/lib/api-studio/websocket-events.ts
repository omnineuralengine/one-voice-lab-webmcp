export type ApiStudioSocketState = {
  connected: boolean;
  configured: boolean;
  transcript: string;
  rawEvents: unknown[];
  turnEvents: unknown[];
  errors: string[];
};

export const EMPTY_SOCKET_STATE: ApiStudioSocketState = {
  connected: false,
  configured: false,
  transcript: "",
  rawEvents: [],
  turnEvents: [],
  errors: [],
};

export function reduceApiStudioSocketEvent(state: ApiStudioSocketState, event: unknown): ApiStudioSocketState {
  const rawEvents = [...state.rawEvents, event].slice(-250);
  if (!isRecord(event)) return { ...state, rawEvents };
  const type = typeof event.type === "string" ? event.type : "Unknown";
  if (type === "Welcome" || type === "Connected" || type === "Open") return { ...state, connected: true, rawEvents };
  if (type === "SettingsApplied" || type === "ConfigureSuccess") return { ...state, configured: true, rawEvents };
  if (type === "SettingsError" || type === "ConfigureFailure" || type === "Error") {
    return { ...state, rawEvents, errors: [...state.errors, readMessage(event)].slice(-50) };
  }
  if (type === "TurnInfo") {
    const transcript = readTranscript(event);
    return {
      ...state,
      rawEvents,
      transcript: transcript || state.transcript,
      turnEvents: [...state.turnEvents, event].slice(-100),
    };
  }
  if (type === "Results" || type === "ConversationText" || type === "Transcript") {
    const transcript = readTranscript(event);
    return { ...state, rawEvents, transcript: transcript || state.transcript };
  }
  if (/turn|eot|speech/i.test(type)) return { ...state, rawEvents, turnEvents: [...state.turnEvents, event].slice(-100) };
  return { ...state, rawEvents };
}

export function readApiStudioSocketEventLabel(event: unknown) {
  if (!isRecord(event)) return "Realtime event";
  if (event.type === "TurnInfo" && typeof event.event === "string" && event.event.trim()) return event.event.trim();
  return typeof event.type === "string" && event.type.trim() ? event.type.trim() : "Realtime event";
}

export function isApiStudioTranscriptEvent(event: unknown) {
  if (!isRecord(event)) return false;
  if (event.type === "Results" || event.type === "Transcript" || event.type === "TurnInfo") return Boolean(readTranscript(event).trim());
  return event.type === "ConversationText"
    && event.role !== "assistant"
    && typeof event.content === "string"
    && Boolean(event.content.trim());
}

export function cleanupMediaResources(input: { stream?: MediaStream | null; recorder?: MediaRecorder | null; socket?: WebSocket | null }) {
  if (input.recorder && input.recorder.state !== "inactive") input.recorder.stop();
  for (const track of input.stream?.getTracks() ?? []) track.stop();
  if (input.socket && input.socket.readyState < 2) input.socket.close(1000, "API Studio cleanup");
}

function readTranscript(event: Record<string, unknown>) {
  if (typeof event.content === "string") return event.content;
  if (typeof event.transcript === "string") return event.transcript;
  const channel = isRecord(event.channel) ? event.channel : {};
  const alternatives = Array.isArray(channel.alternatives) ? channel.alternatives : [];
  const first = isRecord(alternatives[0]) ? alternatives[0] : {};
  return typeof first.transcript === "string" ? first.transcript : "";
}
function readMessage(event: Record<string, unknown>) { return typeof event.description === "string" ? event.description : typeof event.message === "string" ? event.message : "Deepgram realtime error"; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
