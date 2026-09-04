import type { OneConciergeResolution } from "@/lib/concierge/resolver";

export type OneConciergePhase =
  | "closed"
  | "input"
  | "voice-preparing"
  | "listening"
  | "voice-processing"
  | "voice-review"
  | "recommendations"
  | "clarification"
  | "unsupported"
  | "unavailable"
  | "voice-error";

export type OneConciergeState = Readonly<{
  open: boolean;
  phase: OneConciergePhase;
  input: string;
  partialTranscript: string;
  voiceDraft: string;
  resolution: OneConciergeResolution | null;
  notice: string;
  generation: number;
}>;

export type OneConciergeEvent =
  | Readonly<{ type: "OPEN"; preset?: string }>
  | Readonly<{ type: "CLOSE" }>
  | Readonly<{ type: "RESET" }>
  | Readonly<{ type: "SET_INPUT"; value: string }>
  | Readonly<{ type: "RESOLVED"; input: string; resolution: OneConciergeResolution }>
  | Readonly<{ type: "VOICE_PREPARING" }>
  | Readonly<{ type: "VOICE_LISTENING" }>
  | Readonly<{ type: "VOICE_PROCESSING" }>
  | Readonly<{ type: "VOICE_PARTIAL"; value: string }>
  | Readonly<{ type: "VOICE_FINAL"; value: string }>
  | Readonly<{ type: "VOICE_EDIT"; value: string }>
  | Readonly<{ type: "VOICE_CANCELLED"; notice?: string }>
  | Readonly<{ type: "VOICE_FAILURE"; notice: string }>
  | Readonly<{ type: "INVALIDATE" }>
  | Readonly<{ type: "CLEAR_NOTICE" }>;

export function createOneConciergeState(generation = 0): OneConciergeState {
  return {
    open: false,
    phase: "closed",
    input: "",
    partialTranscript: "",
    voiceDraft: "",
    resolution: null,
    notice: "",
    generation,
  };
}

export function reduceOneConciergeState(
  state: OneConciergeState,
  event: OneConciergeEvent,
): OneConciergeState {
  switch (event.type) {
    case "OPEN":
      return {
        ...createOneConciergeState(state.generation + 1),
        open: true,
        phase: "input",
        input: event.preset?.slice(0, 240) ?? "",
      };
    case "CLOSE":
    case "INVALIDATE":
      return createOneConciergeState(state.generation + 1);
    case "RESET":
      return {
        ...createOneConciergeState(state.generation + 1),
        open: true,
        phase: "input",
        notice: "Start again with a goal or choose a suggested path.",
      };
    case "SET_INPUT":
      return {
        ...state,
        phase: "input",
        input: event.value.slice(0, 240),
        partialTranscript: "",
        voiceDraft: "",
        resolution: null,
        notice: "",
      };
    case "RESOLVED":
      return {
        ...state,
        phase: phaseForResolution(event.resolution),
        input: event.input.slice(0, 240),
        partialTranscript: "",
        voiceDraft: "",
        resolution: event.resolution,
        notice: noticeForResolution(event.resolution),
      };
    case "VOICE_PREPARING":
      return {
        ...state,
        phase: "voice-preparing",
        partialTranscript: "",
        voiceDraft: "",
        resolution: null,
        notice: "Ready. Your browser may ask for microphone permission.",
      };
    case "VOICE_LISTENING":
      return {
        ...state,
        phase: "listening",
        notice: "Listening for one short goal. Stop whenever you are ready.",
      };
    case "VOICE_PROCESSING":
      return {
        ...state,
        phase: "voice-processing",
        notice: "Processing the final speech result. ONE will still ask you to review it.",
      };
    case "VOICE_PARTIAL":
      if (state.phase !== "listening") return state;
      return { ...state, partialTranscript: event.value.slice(0, 240) };
    case "VOICE_FINAL":
      return {
        ...state,
        phase: "voice-review",
        partialTranscript: "",
        voiceDraft: event.value.slice(0, 240),
        resolution: null,
        notice: "Review and edit the transcript before ONE interprets it.",
      };
    case "VOICE_EDIT":
      if (state.phase !== "voice-review") return state;
      return { ...state, voiceDraft: event.value.slice(0, 240), notice: "" };
    case "VOICE_CANCELLED":
      return {
        ...state,
        phase: "input",
        partialTranscript: "",
        voiceDraft: "",
        resolution: null,
        notice: event.notice ?? "Voice input stopped. Your typed goal is unchanged.",
      };
    case "VOICE_FAILURE":
      return {
        ...state,
        phase: "voice-error",
        partialTranscript: "",
        voiceDraft: "",
        resolution: null,
        notice: event.notice,
      };
    case "CLEAR_NOTICE":
      return { ...state, notice: "" };
  }
}

function phaseForResolution(resolution: OneConciergeResolution): OneConciergePhase {
  if (resolution.status === "matched") return "recommendations";
  if (resolution.status === "ambiguous") return "clarification";
  if (resolution.status === "unavailable") return "unavailable";
  return "unsupported";
}

function noticeForResolution(resolution: OneConciergeResolution) {
  switch (resolution.status) {
    case "matched":
      return "ONE found a bounded set of journeys. Choose one to navigate.";
    case "ambiguous":
      return "ONE needs one clarification before showing matching journeys.";
    case "unavailable":
      return "That registered journey is unavailable in the current state. Nothing was opened or executed.";
    case "unsupported":
      return "ONE could not safely map that statement to a registered journey. Edit it or choose a suggested goal.";
  }
}
