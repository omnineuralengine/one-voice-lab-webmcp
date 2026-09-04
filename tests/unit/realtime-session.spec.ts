import { expect, test } from "@playwright/test";

import {
  appendRealtimeEvent,
  createRealtimeDiagnosticExport,
  createRealtimeSession,
  formatRealtimeClose,
  realtimeFailureCount,
  type RealtimeMilestone,
  type RealtimeSessionState,
} from "@/lib/api-studio/realtime-session";

const AT = "2026-07-15T12:00:00.000Z";

test("Token requested becomes the first canonical event", () => {
  const state = add(createRealtimeSession("voice_agent", "one"), "token_requested");
  expect(state.summary).toMatchObject({ currentState: "token_requested", lastSuccessfulState: "token_requested", startedAt: AT });
  expect(state.events[0]).toMatchObject({ label: "Token requested", source: "client", status: "success" });
});

test("Token received follows Token requested", () => {
  const state = advance("voice_agent", ["token_requested", "token_received"]);
  expect(labels(state)).toEqual(["Token requested", "Token received"]);
  expect(state.summary.lastSuccessfulState).toBe("token_received");
});

test("Socket opening follows a fresh token", () => {
  const state = advance("voice_agent", ["token_requested", "token_received", "socket_opening"]);
  expect(state.summary.currentState).toBe("socket_opening");
});

test("Socket opened follows Socket opening", () => {
  const state = throughSocket();
  expect(state.summary.lastSuccessfulState).toBe("socket_opened");
});

test("Settings sent follows Socket opened", () => {
  const state = add(throughSocket(), "settings_sent");
  expect(state.events.at(-1)?.label).toBe("Settings sent");
});

test("Settings accepted follows Settings sent", () => {
  const state = throughSettings();
  expect(state.summary.lastSuccessfulState).toBe("settings_accepted");
});

test("Audio started requires Settings accepted for Voice Agent", () => {
  const blocked = add(add(throughSocket(), "settings_sent"), "audio_started");
  expect(blocked.summary.currentState).toBe("failure");
  expect(blocked.events.at(-1)?.summary).toContain("Settings accepted had not completed");
  const accepted = add(throughSettings(), "audio_started");
  expect(accepted.summary.currentState).toBe("audio_started");
});

test("First transcript follows Audio started", () => {
  const state = add(add(throughSettings(), "audio_started"), "first_transcript");
  expect(state.summary.lastSuccessfulState).toBe("first_transcript");
});

test("Agent response follows First transcript", () => {
  const state = voiceThrough("agent_response");
  expect(state.events.at(-1)?.label).toBe("Agent response");
});

test("Playback started follows available audio", () => {
  const state = voiceThrough("playback_started");
  expect(state.summary.lastSuccessfulState).toBe("playback_started");
});

test("normal close records Stop, closing, code, and reason", () => {
  let state = voiceThrough("playback_started");
  state = add(state, "stop_requested");
  state = add(state, "socket_closing");
  state = appendRealtimeEvent(state, { milestone: "socket_closed", status: "success", source: "browser", summary: "Closed", timestamp: AT, closeCode: 1000, closeReason: "Stopped by user" });
  expect(state.summary).toMatchObject({ currentState: "socket_closed", lastSuccessfulState: "socket_closed", closeCode: 1000, closeReason: "Stopped by user" });
});

test("close 1006 with no reason preserves last success and exact explanation", () => {
  let state = throughSocket();
  state = appendRealtimeEvent(state, { milestone: "socket_closed", status: "warning", source: "browser", summary: "Abnormal", timestamp: AT, closeCode: 1006, closeReason: "", kind: "raw" });
  state = appendRealtimeEvent(state, { milestone: "failure", status: "failure", source: "browser", summary: "Abnormal", timestamp: AT, closeCode: 1006, closeReason: "" });
  expect(state.summary).toMatchObject({ currentState: "failure", lastSuccessfulState: "socket_opened", closeCode: 1006, closeReason: "" });
  expect(formatRealtimeClose(1006, "")).toBe("1006 — Abnormal closure. The browser did not receive a normal close frame and may not expose the handshake response body.");
});

test("Settings rejection fails after Settings sent", () => {
  let state = add(throughSocket(), "settings_sent");
  state = appendRealtimeEvent(state, { milestone: "settings_sent", status: "failure", source: "deepgram", summary: "ConfigureFailure", timestamp: AT, rawEventType: "SettingsError", kind: "raw" });
  state = appendRealtimeEvent(state, { milestone: "failure", status: "failure", source: "deepgram", summary: "Settings rejected", timestamp: AT });
  expect(state.summary).toMatchObject({ currentState: "failure", lastSuccessfulState: "settings_sent", failureState: "settings_sent" });
});

test("failure before socket open reports Token received as last success", () => {
  let state = advance("voice_agent", ["token_requested", "token_received"]);
  state = appendRealtimeEvent(state, { milestone: "socket_opening", status: "active", source: "client", summary: "opening", timestamp: AT });
  state = fail(state, "Handshake failed");
  expect(state.summary.lastSuccessfulState).toBe("token_received");
});

test("failure after socket open preserves Socket opened", () => {
  expect(fail(throughSocket(), "Closed").summary.lastSuccessfulState).toBe("socket_opened");
});

test("failure after Settings accepted preserves Settings accepted", () => {
  expect(fail(throughSettings(), "Microphone failed").summary.lastSuccessfulState).toBe("settings_accepted");
});

test("cleanup after failure returns microphone and playback resources to idle", () => {
  let state = voiceThrough("playback_started");
  state = { ...state, summary: { ...state.summary, microphoneActive: true, playbackActive: true, socketReadyState: 1 } };
  state = fail(state, "fixture failure");
  state = { ...state, summary: { ...state.summary, microphoneActive: false, playbackActive: false, socketReadyState: 3 } };
  expect(state.summary).toMatchObject({ currentState: "failure", microphoneActive: false, playbackActive: false, socketReadyState: 3 });
});

test("a second session does not inherit first-session events", () => {
  const first = fail(throughSocket(), "first failed");
  const second = createRealtimeSession("voice_agent", "second");
  expect(first.events.length).toBeGreaterThan(0);
  expect(second).toMatchObject({ sessionId: "second", events: [], summary: { currentState: "idle" } });
});

test("secrets and transcript text are removed before diagnostic export", () => {
  let state = add(createRealtimeSession("voice_agent", "secret"), "token_requested");
  state = appendRealtimeEvent(state, {
    milestone: "token_requested",
    status: "info",
    source: "client",
    summary: "sanitized fixture",
    timestamp: AT,
    kind: "raw",
    details: { access_token: "temporary-secret", Authorization: "Bearer permanent-secret", transcript: "private words", nested: { api_key: "permanent-secret" } },
  });
  const serializedState = JSON.stringify(state);
  const serializedExport = JSON.stringify(createRealtimeDiagnosticExport(state));
  expect(serializedState).not.toMatch(/temporary-secret|permanent-secret|private words/);
  expect(serializedExport).toContain('"credentialExposure":false');
  expect(serializedExport).not.toMatch(/temporary-secret|permanent-secret|private words|Authorization/i);
});

test("failure count supports the Raw Events tab badge", () => {
  const state = fail(throughSocket(), "fixture failure");
  expect(realtimeFailureCount(state)).toBe(1);
});

function add(state: RealtimeSessionState, milestone: RealtimeMilestone) {
  return appendRealtimeEvent(state, { milestone, status: "success", source: "client", summary: milestone, timestamp: AT });
}

function advance(protocol: RealtimeSessionState["protocol"], milestones: RealtimeMilestone[]) {
  return milestones.reduce(add, createRealtimeSession(protocol, "fixture"));
}

function throughSocket() {
  return advance("voice_agent", ["token_requested", "token_received", "socket_opening", "socket_opened"]);
}

function throughSettings() {
  return add(add(throughSocket(), "settings_sent"), "settings_accepted");
}

function voiceThrough(target: "agent_response" | "playback_started") {
  let state = add(add(throughSettings(), "audio_started"), "first_transcript");
  state = add(state, "agent_response");
  return target === "playback_started" ? add(state, "playback_started") : state;
}

function fail(state: RealtimeSessionState, summary: string) {
  return appendRealtimeEvent(state, { milestone: "failure", status: "failure", source: "browser", summary, timestamp: AT });
}

function labels(state: RealtimeSessionState) {
  return state.events.map((event) => event.label);
}
