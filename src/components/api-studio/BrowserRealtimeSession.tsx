"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

import {
  EMPTY_SOCKET_STATE,
  isApiStudioTranscriptEvent,
  readApiStudioSocketEventLabel,
  reduceApiStudioSocketEvent,
  type ApiStudioSocketState,
} from "@/lib/api-studio/websocket-events";
import {
  appendRealtimeEvent,
  createRealtimeSession,
  hasRealtimeMilestone,
  readRequestId,
  updateRealtimeResources,
  type RealtimeEventInput,
  type RealtimeEventSource,
  type RealtimeMilestone,
  type RealtimeProtocol,
  type RealtimeSessionState,
} from "@/lib/api-studio/realtime-session";
import {
  DEEPGRAM_VOICE_AGENT_URL,
  deepgramBearerSubprotocols,
  requestTemporaryToken,
  validateVoiceAgentSettings,
} from "@/lib/api-studio/voice-agent-session";
import type { DeepgramEndpointDefinition } from "@/types/deepgram-endpoint-registry";

export type BrowserRealtimeSessionHandle = { start: () => void; stop: () => void };
export type BrowserRealtimeUpdate = {
  running: boolean;
  message: string;
  event?: unknown;
  state?: ApiStudioSocketState;
  session: RealtimeSessionState;
};

export const BrowserRealtimeSession = forwardRef<BrowserRealtimeSessionHandle, {
  endpoint: DeepgramEndpointDefinition;
  url: string;
  values: Record<string, unknown>;
  onUpdate: (update: BrowserRealtimeUpdate) => void;
}>(function BrowserRealtimeSession({ endpoint, url, values, onUpdate }, ref) {
  const protocol = realtimeProtocol(endpoint.id);
  const resources = useRef<RealtimeResources>(emptyResources());
  const socketStateRef = useRef<ApiStudioSocketState>(EMPTY_SOCKET_STATE);
  const sessionRef = useRef(createRealtimeSession(protocol, `${endpoint.id}-idle`));
  const operationRef = useRef(0);
  const [socketState, setSocketState] = useState(EMPTY_SOCKET_STATE);
  const [status, setStatus] = useState("Idle");

  function publish(next: RealtimeSessionState, running: boolean, message: string, event?: unknown) {
    sessionRef.current = next;
    onUpdate({ running, message, event, state: socketStateRef.current, session: next });
  }

  function record(input: RealtimeEventInput, running: boolean, message = input.summary, event?: unknown) {
    const next = appendRealtimeEvent(sessionRef.current, input);
    publish(next, running, message, event);
    return next;
  }

  function resourcesChanged(snapshot: Parameters<typeof updateRealtimeResources>[1], running: boolean, message: string) {
    publish(updateRealtimeResources(sessionRef.current, snapshot), running, message);
  }

  async function start() {
    const operation = ++operationRef.current;
    cleanup(resources.current);
    resources.current = emptyResources();
    socketStateRef.current = EMPTY_SOCKET_STATE;
    setSocketState(EMPTY_SOCKET_STATE);
    const fresh = createRealtimeSession(protocol, `${endpoint.id}-${Date.now()}-${operation}`);
    sessionRef.current = fresh;

    try {
      const socketUrl = resolveBrowserRealtimeSocketUrl(endpoint.id, endpoint.id === "voice-agent-converse" ? DEEPGRAM_VOICE_AGENT_URL : url);
      setStatus("Token requested");
      record({ milestone: "token_requested", status: "success", source: "client", summary: "A fresh temporary token was requested immediately before opening the socket." }, true, "Token requested");
      const token = await requestTemporaryToken();
      if (operation !== operationRef.current) return;
      if (token.expiresAtMs <= Date.now()) throw new Error("Temporary token expired before the WebSocket could open.");
      record({ milestone: "token_received", status: "success", source: "server", summary: `Temporary token received with a ${token.expiresIn}-second lifetime.` }, true, "Token received");

      setStatus("Socket opening");
      record({ milestone: "socket_opening", status: "active", source: "client", summary: "Opening the Deepgram WebSocket with a fresh temporary Bearer token." }, true, "Socket opening");
      const socket = new WebSocket(socketUrl, deepgramBearerSubprotocols(token.accessToken));
      socket.binaryType = "arraybuffer";
      resources.current.socket = socket;
      resources.current.openingTimer = window.setTimeout(() => {
        if (operation === operationRef.current && socket.readyState === WebSocket.CONNECTING) {
          fail("Timed out waiting for WebSocket onopen.", "browser", operation, { timeoutStage: "socket_opening" });
        }
      }, 12_000);
      resourcesChanged({ socketReadyState: socket.readyState }, true, "Socket opening");

      socket.onopen = () => {
        if (operation !== operationRef.current) return;
        clearRealtimeTimer(resources.current, "openingTimer");
        setStatus("Socket opened");
        receive({ type: "Open", sanitized_url: socketUrl });
        resourcesChanged({ socketReadyState: socket.readyState }, true, "Socket opened");
        record({ milestone: "socket_opened", status: "success", source: "browser", summary: "WebSocket onopen fired." }, true, "Socket opened");
        try {
          if (endpoint.id === "stt-flux") {
            const configure = parseJson(values.Configure);
            if (!configure) throw new Error("Configure must be valid JSON.");
            socket.send(JSON.stringify(configure));
            setStatus("Configure sent");
            record({ milestone: "settings_sent", status: "success", source: "client", summary: "Configure was sent. Audio remains blocked until ConfigureSuccess." }, true, "Configure sent");
            startSettingsTimer(resources.current, operation, operationRef, () => fail("Timed out waiting for ConfigureSuccess.", "browser", operation, { timeoutStage: "settings_acknowledgement" }));
          } else if (endpoint.id === "voice-agent-converse") {
            const settings = parseJson(values.Settings);
            const settingsIssues = validateVoiceAgentSettings(settings);
            if (settingsIssues.length) throw new Error(settingsIssues.join(" "));
            socket.send(JSON.stringify(settings));
            setStatus("Settings sent");
            record({ milestone: "settings_sent", status: "success", source: "client", summary: "Settings was sent. Audio remains blocked until SettingsApplied." }, true, "Settings sent");
            startSettingsTimer(resources.current, operation, operationRef, () => fail("Timed out waiting for SettingsApplied.", "browser", operation, { timeoutStage: "settings_acknowledgement" }));
          } else {
            const text = String(values.text ?? "").trim();
            socket.send(JSON.stringify({ type: "Speak", text }));
            socket.send(JSON.stringify({ type: "Flush" }));
            setStatus("Text/config sent");
            record({ milestone: "settings_sent", status: "success", source: "client", summary: "Text and Flush messages were sent after the socket opened.", details: { text: "[omitted]" } }, true, "Text/config sent");
          }
        } catch (error) {
          fail(errorMessage(error), "client", operation);
        }
      };

      socket.onmessage = async (message) => {
        if (operation !== operationRef.current) return;
        if (typeof message.data === "string") {
          const parsed = parseJson(message.data) ?? message.data;
          handleSafeClientTool(socket, parsed);
          receive(parsed);
          const type = readApiStudioSocketEventLabel(parsed);
          const requestId = readRequestId(parsed);
          record({
            milestone: nearestMilestone(sessionRef.current.summary.currentState),
            status: type === "Error" || type === "SettingsError" || type === "ConfigureFailure" ? "failure" : "info",
            source: "deepgram",
            summary: `Deepgram ${type} event received.`,
            rawEventType: type,
            requestId,
            details: isRecord(parsed) ? parsed : { value: parsed },
            kind: "raw",
          }, true, type, parsed);

          if (endpoint.id === "voice-agent-converse" && type === "SettingsApplied") {
            await acceptSettingsAndStartAudio(socket, operation, "Settings accepted");
          } else if (endpoint.id === "stt-flux" && type === "ConfigureSuccess") {
            await acceptSettingsAndStartAudio(socket, operation, "Configure accepted");
          } else if (type === "Error" || type === "SettingsError" || type === "ConfigureFailure") {
            fail(readRealtimeError(parsed), "deepgram", operation, parsed);
          }

          if (isApiStudioTranscriptEvent(parsed) && !hasRealtimeMilestone(sessionRef.current, "first_transcript")) {
            record({ milestone: "first_transcript", status: "success", source: "deepgram", summary: "The first transcript event was received.", rawEventType: type, requestId }, true, "First transcript");
          }
          if (protocol === "voice_agent" && isAgentResponse(parsed) && !hasRealtimeMilestone(sessionRef.current, "agent_response")) {
            record({ milestone: "agent_response", status: "success", source: "deepgram", summary: "The first agent response event was received.", rawEventType: type, requestId }, true, "Agent response");
          }
          if (type === "AgentAudioDone" && hasRealtimeMilestone(sessionRef.current, "playback_started")) completePlayback("Deepgram reported that agent audio completed.");
        } else {
          const bytes = message.data instanceof Blob ? await message.data.arrayBuffer() : message.data as ArrayBuffer;
          if (operation !== operationRef.current) return;
          receive({ type: "BinaryAudio", byte_length: bytes.byteLength });
          record({
            milestone: protocol === "streaming_tts" ? "audio_started" : "agent_response",
            status: "info",
            source: "deepgram",
            summary: `${bytes.byteLength} bytes of audio received; raw audio was not retained.`,
            rawEventType: "BinaryAudio",
            details: { byteLength: bytes.byteLength, audioPersisted: false },
            kind: "raw",
          }, true, "Audio received");
          if (protocol === "streaming_tts" && !hasRealtimeMilestone(sessionRef.current, "audio_started")) {
            record({ milestone: "audio_started", status: "success", source: "deepgram", summary: "The first synthesized audio bytes were received." }, true, "Audio received");
          }
          await playPcm(resources.current, bytes, Number(values.sample_rate ?? 24_000), () => completePlayback("Queued audio playback completed."));
          if (!hasRealtimeMilestone(sessionRef.current, "playback_started")) {
            record({ milestone: "playback_started", status: "success", source: "browser", summary: "Browser playback started after audio data was received." }, true, "Playback started");
          }
          resourcesChanged({ playbackActive: true }, true, "Playback started");
        }
      };

      socket.onerror = (event) => {
        if (operation !== operationRef.current) return;
        const message = `Browser WebSocket error event (type=${event.type}, readyState=${socket.readyState}). The browser does not expose failed-handshake response headers or a body.`;
        record({ milestone: nearestMilestone(sessionRef.current.summary.currentState), status: "failure", source: "browser", summary: message, rawEventType: event.type, details: { readyState: socket.readyState }, kind: "raw" }, true, message, { type: event.type, readyState: socket.readyState });
        fail(message, "browser", operation);
      };

      socket.onclose = (event) => {
        if (operation !== operationRef.current) return;
        clearRealtimeTimer(resources.current, "openingTimer");
        clearRealtimeTimer(resources.current, "settingsTimer");
        const closeSummary = event.code === 1006
          ? "1006 — Abnormal closure. The browser did not receive a normal close frame and may not expose the handshake response body."
          : `Socket closed with code ${event.code}${event.reason ? `: ${event.reason}` : "."}`;
        const alreadyFailed = sessionRef.current.summary.currentState === "failure";
        if (alreadyFailed) {
          record({ milestone: "socket_closed", status: "warning", source: "browser", summary: closeSummary, closeCode: event.code, closeReason: event.reason, details: { wasClean: event.wasClean }, kind: "raw" }, false, closeSummary);
        } else {
          if (sessionRef.current.summary.currentState !== "socket_closing") {
            record({ milestone: "socket_closing", status: "info", source: "deepgram", summary: "The socket began closing without a preceding client Stop request." }, true, "Socket closing");
          }
          record({ milestone: "socket_closed", status: event.code === 1000 ? "success" : "warning", source: "browser", summary: closeSummary, closeCode: event.code, closeReason: event.reason, details: { wasClean: event.wasClean } }, false, closeSummary);
          if (event.code === 1006) fail(closeSummary, "browser", operation, undefined, event.code, event.reason);
        }
        cleanupMedia(resources.current);
        closeOutput(resources.current);
        resources.current.socket = null;
        resourcesChanged({ socketReadyState: WebSocket.CLOSED, microphoneActive: false, playbackActive: false }, false, closeSummary);
        setStatus(event.code === 1006 ? "Failure" : `Closed (${event.code})`);
      };
    } catch (error) {
      if (operation !== operationRef.current) return;
      fail(errorMessage(error), "client", operation);
    }
  }

  async function acceptSettingsAndStartAudio(socket: WebSocket, operation: number, label: string) {
    if (hasRealtimeMilestone(sessionRef.current, "settings_accepted")) return;
    clearRealtimeTimer(resources.current, "settingsTimer");
    record({ milestone: "settings_accepted", status: "success", source: "deepgram", summary: `${label}; microphone capture may now start.` }, true, label);
    setStatus(label);
    try {
      await startMicrophone(resources.current, socket, 16_000);
      if (operation !== operationRef.current || socket.readyState !== WebSocket.OPEN) {
        cleanupMedia(resources.current);
        return;
      }
      record({ milestone: "audio_started", status: "success", source: "browser", summary: "Microphone capture started after configuration acknowledgement." }, true, "Audio started");
      resourcesChanged({ microphoneActive: true, socketReadyState: socket.readyState }, true, "Audio started");
      setStatus("Audio started");
    } catch (error) {
      fail(errorMessage(error), "browser", operation);
    }
  }

  function receive(event: unknown) {
    const next = reduceApiStudioSocketEvent(socketStateRef.current, event);
    socketStateRef.current = next;
    setSocketState(next);
  }

  function fail(message: string, source: RealtimeEventSource, operation: number, details?: unknown, closeCode?: number, closeReason?: string) {
    if (operation !== operationRef.current) return;
    if (sessionRef.current.summary.currentState !== "failure") {
      const resourceDetails = {
        socketReadyState: resources.current.socket?.readyState,
        microphoneTracksActive: activeMicrophoneTracks(resources.current),
        playbackActive: resources.current.pendingPlayback > 0,
        event: details,
      };
      record({ milestone: "failure", status: "failure", source, summary: message, closeCode, closeReason, details: resourceDetails }, false, message);
    }
    setStatus("Failure");
    cleanup(resources.current);
    resourcesChanged({ socketReadyState: WebSocket.CLOSED, microphoneActive: false, playbackActive: false }, false, message);
  }

  function completePlayback(summary: string) {
    if (!hasRealtimeMilestone(sessionRef.current, "playback_started") || hasRealtimeMilestone(sessionRef.current, "playback_completed")) return;
    record({ milestone: "playback_completed", status: "success", source: "browser", summary }, true, "Playback completed");
    resourcesChanged({ playbackActive: false }, true, "Playback completed");
  }

  function stop(reason: string) {
    const socket = resources.current.socket;
    if (sessionRef.current.summary.currentState === "idle" || sessionRef.current.summary.currentState === "socket_closed" || sessionRef.current.summary.currentState === "failure") return;
    record({ milestone: "stop_requested", status: "success", source: "client", summary: "Stop requested by the user." }, true, "Stop requested");
    record({ milestone: "socket_closing", status: "active", source: "client", summary: "Closing the active socket and releasing microphone and playback resources." }, true, "Socket closing");
    setStatus("Socket closing");
    if (socket?.readyState === WebSocket.OPEN) {
      if (endpoint.id === "stt-flux") socket.send(JSON.stringify({ type: "CloseStream" }));
      if (endpoint.id === "tts-streaming") socket.send(JSON.stringify({ type: "Close" }));
      window.setTimeout(() => { if (socket.readyState < WebSocket.CLOSING) socket.close(1000, reason); }, 150);
    } else if (socket && socket.readyState < WebSocket.CLOSING) {
      socket.close(1000, reason);
    }
    cleanupMedia(resources.current);
    closeOutput(resources.current);
    resourcesChanged({ microphoneActive: false, playbackActive: false, socketReadyState: socket?.readyState }, true, "Socket closing");
  }

  useImperativeHandle(ref, () => ({ start: () => void start(), stop: () => stop("Stopped by user") }));
  useEffect(() => () => { operationRef.current += 1; cleanup(resources.current); }, []);

  return <section className="rounded-lg border border-violet-300/20 bg-violet-300/[.035] p-3" data-testid="browser-realtime-session">
    <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-violet-200">Browser realtime transport</p><p className="mt-1 text-[10px] text-slate-500">Fresh temporary token · explicit start/stop · no audio or transcript persistence</p></div><span className="rounded border border-violet-300/20 px-2 py-1 font-mono text-[9px] text-violet-100">{status}</span></div>
    {socketState.transcript ? <p className="mt-3 rounded bg-black/25 p-2 text-xs text-slate-200">{socketState.transcript}</p> : null}
    {protocol === "voice_agent" ? <p className="mt-2 text-[9px] text-amber-200/65">The default smoke-test Settings use Deepgram-managed listen, think, and speak services. No external provider credential belongs in this browser payload.</p> : null}
  </section>;
});

export type RealtimeResources = {
  socket: WebSocket | null;
  stream: MediaStream | null;
  inputContext: AudioContext | null;
  outputContext: AudioContext | null;
  source: MediaStreamAudioSourceNode | null;
  processor: ScriptProcessorNode | null;
  sink: GainNode | null;
  nextPlayTime: number;
  pendingPlayback: number;
  openingTimer: number | null;
  settingsTimer: number | null;
};

function emptyResources(): RealtimeResources {
  return { socket: null, stream: null, inputContext: null, outputContext: null, source: null, processor: null, sink: null, nextPlayTime: 0, pendingPlayback: 0, openingTimer: null, settingsTimer: null };
}

async function startMicrophone(resources: RealtimeResources, socket: WebSocket, targetRate: number) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const sink = context.createGain();
  sink.gain.value = 0;
  processor.onaudioprocess = (audioEvent) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    const samples = resample(audioEvent.inputBuffer.getChannelData(0), context.sampleRate, targetRate);
    const pcm = new Int16Array(samples.length);
    for (let index = 0; index < samples.length; index += 1) pcm[index] = Math.max(-32768, Math.min(32767, Math.round(samples[index] * 32767)));
    socket.send(pcm.buffer);
  };
  source.connect(processor);
  processor.connect(sink);
  sink.connect(context.destination);
  Object.assign(resources, { stream, inputContext: context, source, processor, sink });
}

async function playPcm(resources: RealtimeResources, bytes: ArrayBuffer, sampleRate: number, onQueueDrained: () => void) {
  const context = resources.outputContext ?? new AudioContext();
  resources.outputContext = context;
  const pcm = new Int16Array(bytes);
  const buffer = context.createBuffer(1, pcm.length, sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < pcm.length; index += 1) channel[index] = pcm[index] / 32768;
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  const start = Math.max(context.currentTime + 0.02, resources.nextPlayTime);
  resources.pendingPlayback += 1;
  source.onended = () => {
    resources.pendingPlayback = Math.max(0, resources.pendingPlayback - 1);
    if (resources.pendingPlayback === 0) onQueueDrained();
  };
  source.start(start);
  resources.nextPlayTime = start + buffer.duration;
}

function resample(input: Float32Array, sourceRate: number, targetRate: number) {
  if (sourceRate === targetRate) return input;
  const length = Math.max(1, Math.round(input.length * targetRate / sourceRate));
  const output = new Float32Array(length);
  const ratio = sourceRate / targetRate;
  for (let index = 0; index < length; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const right = Math.min(input.length - 1, left + 1);
    const fraction = position - left;
    output[index] = input[left] * (1 - fraction) + input[right] * fraction;
  }
  return output;
}

function cleanupMedia(resources: RealtimeResources) {
  if (resources.processor) resources.processor.onaudioprocess = null;
  try { resources.source?.disconnect(); resources.processor?.disconnect(); resources.sink?.disconnect(); } catch {}
  for (const track of resources.stream?.getTracks() ?? []) track.stop();
  void resources.inputContext?.close();
  resources.stream = null;
  resources.inputContext = null;
  resources.source = null;
  resources.processor = null;
  resources.sink = null;
}

function closeOutput(resources: RealtimeResources) {
  void resources.outputContext?.close();
  resources.outputContext = null;
  resources.nextPlayTime = 0;
  resources.pendingPlayback = 0;
}

export function cleanup(resources: RealtimeResources) {
  clearRealtimeTimer(resources, "openingTimer");
  clearRealtimeTimer(resources, "settingsTimer");
  cleanupMedia(resources);
  if (resources.socket && resources.socket.readyState < 2) resources.socket.close(1000, "Component cleanup");
  closeOutput(resources);
  resources.socket = null;
}

function startSettingsTimer(resources: RealtimeResources, operation: number, operationRef: { current: number }, onTimeout: () => void) {
  clearRealtimeTimer(resources, "settingsTimer");
  resources.settingsTimer = window.setTimeout(() => {
    if (operation === operationRef.current) onTimeout();
  }, 10_000);
}

function clearRealtimeTimer(resources: RealtimeResources, key: "openingTimer" | "settingsTimer") {
  const timer = resources[key];
  if (typeof timer === "number" && typeof window !== "undefined") window.clearTimeout(timer);
  resources[key] = null;
}

function activeMicrophoneTracks(resources: RealtimeResources) {
  return (resources.stream?.getTracks() ?? []).filter((track) => track.readyState === "live").length;
}

function parseJson(value: unknown) {
  if (typeof value !== "string") return value && typeof value === "object" ? value : null;
  try { return JSON.parse(value) as unknown; } catch { return null; }
}

function readRealtimeError(value: unknown) {
  if (!isRecord(value)) return "Deepgram realtime error.";
  const message = typeof value.description === "string" ? value.description : typeof value.message === "string" ? value.message : "Deepgram realtime error.";
  return typeof value.code === "string" ? `${message} (${value.code})` : message;
}

function errorMessage(value: unknown) {
  return value instanceof Error ? value.message : "Realtime session failed.";
}

function nearestMilestone(value: RealtimeMilestone | "idle"): RealtimeMilestone {
  return value === "idle" ? "token_requested" : value;
}

function realtimeProtocol(endpointId: string): RealtimeProtocol {
  if (endpointId === "stt-flux") return "flux";
  if (endpointId === "tts-streaming") return "streaming_tts";
  return "voice_agent";
}

function isAgentResponse(value: unknown) {
  return isRecord(value) && (value.type === "AgentStartedSpeaking" || value.type === "AgentAudioDone" || (value.type === "ConversationText" && value.role === "assistant"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function resolveBrowserRealtimeSocketUrl(endpointId: string, value: string) {
  if (endpointId !== "stt-flux") return value;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Flux realtime sessions require a valid WSS URL using /v2/listen.");
  }
  if (parsed.protocol !== "wss:" || parsed.hostname !== "api.deepgram.com" || parsed.pathname !== "/v2/listen") {
    throw new Error("Flux realtime sessions require WSS /v2/listen; v1-style and non-WebSocket paths are rejected.");
  }
  return parsed.toString();
}

function handleSafeClientTool(socket: WebSocket, value: unknown) {
  if (!isRecord(value) || value.type !== "FunctionCallRequest" || !Array.isArray(value.functions)) return;
  for (const item of value.functions) {
    if (!isRecord(item)) continue;
    if (item.client_side !== true || item.name !== "get_local_time" || typeof item.id !== "string") continue;
    const content = JSON.stringify({ iso: new Date().toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    socket.send(JSON.stringify({ type: "FunctionCallResponse", id: item.id, name: item.name, content }));
  }
}
