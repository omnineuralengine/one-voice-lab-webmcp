import type { AsyncStatus } from "@/lib/types";

export type LiveMicState =
  | "idle"
  | "requesting_permission"
  | "selecting_device"
  | "requesting_token"
  | "connecting_socket"
  | "socket_open"
  | "recording"
  | "receiving_events"
  | "stopping"
  | "stopped"
  | "error"
  | "fallback_available";

export type LiveMicStateAction = {
  type: "transition";
  next: LiveMicState;
};

const TRANSITIONS: Record<LiveMicState, readonly LiveMicState[]> = {
  idle: ["requesting_permission", "error", "stopped"],
  requesting_permission: ["selecting_device", "stopping", "error"],
  selecting_device: ["requesting_token", "recording", "stopping", "error"],
  requesting_token: ["connecting_socket", "stopping", "error", "fallback_available"],
  connecting_socket: ["connecting_socket", "requesting_token", "socket_open", "stopping", "error", "fallback_available"],
  socket_open: ["recording", "connecting_socket", "stopping", "error", "fallback_available"],
  recording: ["receiving_events", "connecting_socket", "stopping", "stopped", "error", "fallback_available"],
  receiving_events: ["receiving_events", "connecting_socket", "stopping", "stopped", "error", "fallback_available"],
  stopping: ["stopped", "error", "fallback_available"],
  stopped: ["idle", "requesting_permission", "error"],
  error: ["requesting_permission", "fallback_available", "stopped", "idle"],
  fallback_available: ["requesting_permission", "stopping", "stopped", "error", "idle"],
};

const CONNECTING_STATES = new Set<LiveMicState>([
  "requesting_permission",
  "selecting_device",
  "requesting_token",
  "connecting_socket",
  "socket_open",
]);

export function canTransitionLiveMicState(current: LiveMicState, next: LiveMicState) {
  return current === next || TRANSITIONS[current].includes(next);
}

export function liveMicStateReducer(state: LiveMicState, action: LiveMicStateAction): LiveMicState {
  if (action.type === "transition" && canTransitionLiveMicState(state, action.next)) {
    return action.next;
  }

  return state;
}

export function isLiveMicStartDisabled(state: LiveMicState) {
  return CONNECTING_STATES.has(state) || state === "recording" || state === "receiving_events" || state === "stopping";
}

export function liveMicStartLabel(state: LiveMicState) {
  if (CONNECTING_STATES.has(state)) {
    return "Connecting...";
  }

  if (state === "recording" || state === "receiving_events") {
    return "Listening...";
  }

  if (state === "error" || state === "fallback_available") {
    return "Retry Live Mic";
  }

  if (state === "stopping") {
    return "Stopping...";
  }

  return "Start Live Mic";
}

export function liveMicStateLabel(state: LiveMicState) {
  const labels: Record<LiveMicState, string> = {
    idle: "Idle",
    requesting_permission: "Requesting permission",
    selecting_device: "Selecting device",
    requesting_token: "Requesting token",
    connecting_socket: "Connecting socket",
    socket_open: "Socket open",
    recording: "Recording",
    receiving_events: "Receiving events",
    stopping: "Stopping",
    stopped: "Stopped",
    error: "Error",
    fallback_available: "Fallback available",
  };

  return labels[state];
}

export function liveMicStateToAsyncStatus(state: LiveMicState): AsyncStatus {
  if (CONNECTING_STATES.has(state) || state === "stopping") {
    return "loading";
  }

  if (state === "recording" || state === "receiving_events") {
    return "success";
  }

  if (state === "error" || state === "fallback_available") {
    return "error";
  }

  return "idle";
}
