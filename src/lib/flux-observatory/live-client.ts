"use client";

import { buildFluxConfigureMessage, buildFluxListenUrl, cloneConfiguration, validateFluxConfigurationUpdate } from "./config";
import type {
  FluxConfiguration,
  FluxConfigurationUpdate,
  FluxLocalLifecycleName,
} from "./types";
import { deepgramBearerSubprotocols, requestTemporaryToken } from "@/lib/api-studio/voice-agent-session";

const MAX_SOCKET_BUFFER_BYTES = 512 * 1024;

export type FluxLiveClientSignal =
  | { kind: "local"; name: FluxLocalLifecycleName; generation: number; monotonicMs: number; details: Record<string, unknown> }
  | { kind: "configuration-request"; generation: number; monotonicMs: number; requestKey: string; previousConfiguration: FluxConfiguration; update: FluxConfigurationUpdate }
  | { kind: "provider"; generation: number; monotonicMs: number; payload: unknown };

export type FluxLiveClientSnapshot = {
  generation: number;
  connection: "idle" | "preparing-microphone" | "microphone-ready" | "connecting" | "open" | "streaming" | "closed" | "failed";
  credential: "unavailable" | "requesting" | "memory-only" | "expired" | "cleared";
  microphone: "idle" | "requesting" | "ready" | "active" | "stopped" | "denied" | "missing";
  configuredTargetChunkMs: number;
  measuredChunkIntervalMs: number | null;
  socketBufferedBytes: number;
  droppedFrames: number;
  delayedFrames: number;
  rms: number;
  error: string;
};

type FluxLiveClientCallbacks = {
  onSignal: (signal: FluxLiveClientSignal) => void;
  onSnapshot: (snapshot: FluxLiveClientSnapshot) => void;
  now?: () => number;
  fetcher?: typeof fetch;
  createSocket?: (url: string, protocols: string | string[]) => WebSocket;
};

type PreparedAudio = {
  stream: MediaStream;
  context: AudioContext | null;
  source: MediaStreamAudioSourceNode | null;
  worklet: AudioWorkletNode | null;
  sink: GainNode | null;
};

export class FluxLiveClient {
  private readonly callbacks: FluxLiveClientCallbacks;
  private readonly now: () => number;
  private snapshot: FluxLiveClientSnapshot;
  private audio: PreparedAudio | null = null;
  private socket: WebSocket | null = null;
  private credential: string | null = null;
  private credentialTimer: number | null = null;
  private configureTimer: number | null = null;
  private lastChunkAt: number | null = null;
  private stopped = false;
  private initialConfigurePending = false;

  constructor(callbacks: FluxLiveClientCallbacks) {
    this.callbacks = callbacks;
    this.now = callbacks.now ?? (() => performance.now());
    this.snapshot = {
      generation: 0,
      connection: "idle",
      credential: "unavailable",
      microphone: "idle",
      configuredTargetChunkMs: 80,
      measuredChunkIntervalMs: null,
      socketBufferedBytes: 0,
      droppedFrames: 0,
      delayedFrames: 0,
      rms: 0,
      error: "",
    };
  }

  getSnapshot() {
    return { ...this.snapshot };
  }

  async prepareMicrophone(configuration: FluxConfiguration) {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.update({ microphone: "missing", connection: "failed", error: "This browser does not expose microphone capture." });
      throw new Error(this.snapshot.error);
    }
    if (configuration.encoding !== "linear16") {
      throw new Error("Live browser capture currently emits linear16 PCM only. Other documented encodings remain inspectable in API Lab.");
    }
    await this.releaseAudio();
    this.stopped = false;
    this.update({ connection: "preparing-microphone", microphone: "requesting", error: "", configuredTargetChunkMs: configuration.targetChunkMs });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: false },
        video: false,
      });
      this.audio = { stream, context: null, source: null, worklet: null, sink: null };
      for (const track of stream.getAudioTracks()) {
        track.addEventListener("ended", this.handleTrackEnded, { once: true });
      }
      this.update({ connection: "microphone-ready", microphone: "ready" });
      this.emitLocal("microphone-capture-start", { permission: "granted", processing: "not-started", persisted: false });
    } catch (error) {
      const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
      this.update({ microphone: denied ? "denied" : "missing", connection: "failed", error: denied ? "Microphone permission was denied." : "The microphone could not be prepared." });
      throw new Error(this.snapshot.error);
    }
  }

  async start(configuration: FluxConfiguration) {
    if (!this.audio?.stream.active) throw new Error("Prepare the microphone before starting a live provider session.");
    const activeConfiguration = cloneConfiguration(configuration);
    const url = buildFluxListenUrl(activeConfiguration);
    await this.closeSocket();
    this.clearCredential();
    this.stopped = false;
    this.snapshot.generation += 1;
    const generation = this.snapshot.generation;
    this.update({ connection: "connecting", credential: "requesting", error: "", configuredTargetChunkMs: activeConfiguration.targetChunkMs });
    this.emitLocal("session-created", { mode: "live-provider", credentialsPersisted: false });
    this.emitLocal("websocket-connecting", { endpoint: "/v2/listen", model: activeConfiguration.model });

    try {
      const grant = await requestTemporaryToken(this.callbacks.fetcher ?? fetch);
      if (this.stopped || generation !== this.snapshot.generation) return;
      this.credential = grant.accessToken;
      this.update({ credential: "memory-only" });
      this.emitLocal("credential-acquired", { expiresInSeconds: grant.expiresIn, storage: "memory-only" });
      this.credentialTimer = window.setTimeout(() => {
        if (generation !== this.snapshot.generation) return;
        this.credential = null;
        this.update({ credential: "expired" });
        this.emitLocal("token-expiry", { socketMayRemainOpen: true, reconnectRequiresFreshCredential: true });
      }, Math.max(0, grant.expiresAtMs - Date.now()));

      const socket = (this.callbacks.createSocket ?? ((socketUrl, protocols) => new WebSocket(socketUrl, protocols)))(
        url,
        deepgramBearerSubprotocols(grant.accessToken),
      );
      this.socket = socket;
      socket.binaryType = "arraybuffer";
      socket.onopen = () => {
        if (!this.isActiveSocket(socket, generation)) return;
        this.update({ connection: "open" });
        this.emitLocal("websocket-open", { endpoint: "/v2/listen", authenticatedWith: "temporary-bearer-subprotocol" });
        const update: FluxConfigurationUpdate = {
          thresholds: { ...activeConfiguration.thresholds },
          keyterms: [...activeConfiguration.keyterms],
          languageHints: [...activeConfiguration.languageHints],
        };
        this.initialConfigurePending = true;
        this.sendConfigure(update, activeConfiguration, `initial-${generation}`);
      };
      socket.onmessage = (event) => {
        if (!this.isActiveSocket(socket, generation)) return;
        const payload = parseProviderPayload(event.data);
        this.callbacks.onSignal({ kind: "provider", generation, monotonicMs: this.now(), payload });
        const type = readProviderType(payload);
        if (type === "ConfigureSuccess") {
          const startsAudio = this.initialConfigurePending;
          this.initialConfigurePending = false;
          this.clearConfigureTimer();
          if (startsAudio) void this.startAudioProcessing(activeConfiguration, socket, generation).catch(() => this.fail("The browser audio pipeline could not start.", generation));
        } else if (type === "ConfigureFailure") {
          const initialFailure = this.initialConfigurePending;
          this.initialConfigurePending = false;
          this.clearConfigureTimer();
          if (initialFailure) this.fail("Deepgram rejected the initial Flux configuration.", generation);
        } else if (type === "Error") {
          this.fail("Deepgram ended the Flux session with a provider error.", generation);
        }
      };
      socket.onerror = () => {
        if (this.isActiveSocket(socket, generation)) this.fail("The Flux WebSocket reported an error.", generation);
      };
      socket.onclose = (event) => {
        if (!this.isActiveSocket(socket, generation)) return;
        this.emitLocal("stream-closure", { code: event.code, reason: sanitizeCloseReason(event.reason), clean: event.wasClean });
        this.socket = null;
        this.clearCredential();
        this.clearConfigureTimer();
        this.update({ connection: event.wasClean || this.stopped ? "closed" : "failed", microphone: "stopped" });
        void this.releaseAudio().then(() => this.emitLocal("cleanup-complete", cleanupSummary()));
      };
    } catch (error) {
      if (generation !== this.snapshot.generation) return;
      await this.closeSocket();
      await this.releaseAudio();
      this.clearCredential();
      this.update({ connection: "failed", microphone: "stopped", error: safeError(error) });
      throw error;
    }
  }

  applyConfiguration(update: FluxConfigurationUpdate, active: FluxConfiguration) {
    const safeActive = cloneConfiguration(active);
    const validation = validateFluxConfigurationUpdate(update, safeActive);
    if (!validation.success || !validation.value) throw new Error(validation.errors.join(" "));
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) throw new Error("A live Flux socket must be open before applying configuration.");
    if (this.configureTimer !== null) throw new Error("Wait for the current configuration acknowledgement before sending another update.");
    this.sendConfigure(validation.value, safeActive, `config-${this.snapshot.generation}-${Date.now()}`);
  }

  async reconnect(configuration: FluxConfiguration) {
    this.emitLocal("reconnect-attempt", { previousGeneration: this.snapshot.generation, explicitUserAction: true });
    await this.stop(false);
    await this.prepareMicrophone(configuration);
    await this.start(configuration);
  }

  async stop(emitStop = true) {
    this.stopped = true;
    if (emitStop) this.emitLocal("stop-requested", { explicitUserAction: true });
    if (this.socket?.readyState === WebSocket.OPEN) {
      try { this.socket.send(JSON.stringify({ type: "CloseStream" })); } catch { /* close below */ }
    }
    await this.closeSocket();
    await this.releaseAudio();
    this.clearCredential();
    this.update({ connection: "closed", microphone: "stopped", rms: 0, socketBufferedBytes: 0 });
    this.emitLocal("cleanup-complete", cleanupSummary());
  }

  async dispose() {
    this.snapshot.generation += 1;
    await this.stop(false);
  }

  private sendConfigure(update: FluxConfigurationUpdate, active: FluxConfiguration, requestKey: string) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) throw new Error("Flux socket is not open.");
    const validation = validateFluxConfigurationUpdate(update, active);
    if (!validation.success || !validation.value) throw new Error(validation.errors.join(" "));
    const normalizedUpdate = validation.value;
    const message = buildFluxConfigureMessage(normalizedUpdate, active);
    this.callbacks.onSignal({
      kind: "configuration-request",
      generation: this.snapshot.generation,
      monotonicMs: this.now(),
      requestKey,
      previousConfiguration: cloneConfiguration(active),
      update: {
        ...(normalizedUpdate.thresholds ? { thresholds: { ...normalizedUpdate.thresholds } } : {}),
        ...(normalizedUpdate.keyterms !== undefined ? { keyterms: [...normalizedUpdate.keyterms] } : {}),
        ...(normalizedUpdate.languageHints !== undefined ? { languageHints: normalizedUpdate.languageHints === null ? null : [...normalizedUpdate.languageHints] } : {}),
      },
    });
    this.socket.send(JSON.stringify(message));
    this.clearConfigureTimer();
    this.configureTimer = window.setTimeout(() => {
      this.configureTimer = null;
      if (this.initialConfigurePending) {
        this.initialConfigurePending = false;
        this.fail("Timed out waiting for ConfigureSuccess.", this.snapshot.generation);
      } else {
        this.emitLocal("provider-warning", { description: "No configuration acknowledgement arrived before the local timeout. The last acknowledged configuration remains active.", fatal: false });
      }
    }, 10_000);
  }

  private async startAudioProcessing(configuration: FluxConfiguration, socket: WebSocket, generation: number) {
    if (!this.audio?.stream.active || !this.isActiveSocket(socket, generation)) return;
    const context = new AudioContext({ latencyHint: "interactive" });
    await context.audioWorklet.addModule("/flux-pcm-worklet.js");
    if (!this.isActiveSocket(socket, generation)) { await context.close(); return; }
    if (context.state === "suspended") await context.resume();
    const source = context.createMediaStreamSource(this.audio.stream);
    const worklet = new AudioWorkletNode(context, "flux-pcm-capture", { processorOptions: { targetFrameMs: configuration.targetChunkMs } });
    const sink = context.createGain();
    sink.gain.value = 0;
    source.connect(worklet).connect(sink).connect(context.destination);
    this.audio = { ...this.audio, context, source, worklet, sink };
    worklet.port.onmessage = (event: MessageEvent<{ type?: unknown; samples?: unknown; rms?: unknown }>) => {
      if (!this.isActiveSocket(socket, generation) || event.data?.type !== "pcm-frame" || !(event.data.samples instanceof ArrayBuffer)) return;
      const emittedAt = this.now();
      const intervalMs = this.lastChunkAt === null ? null : emittedAt - this.lastChunkAt;
      this.lastChunkAt = emittedAt;
      const rms = typeof event.data.rms === "number" && Number.isFinite(event.data.rms) ? Math.max(0, Math.min(1, event.data.rms)) : 0;
      if (socket.bufferedAmount > MAX_SOCKET_BUFFER_BYTES) {
        this.update({ droppedFrames: this.snapshot.droppedFrames + 1, socketBufferedBytes: socket.bufferedAmount, rms });
        this.emitLocal("audio-frame-dropped", { reason: "bounded-backpressure", bufferedBytes: socket.bufferedAmount });
        return;
      }
      const pcm = floatToPcm16(resample(new Float32Array(event.data.samples), context.sampleRate, configuration.sampleRate));
      socket.send(pcm.buffer);
      const delayed = intervalMs !== null && intervalMs > configuration.targetChunkMs * 1.75;
      this.update({
        connection: "streaming",
        microphone: "active",
        measuredChunkIntervalMs: intervalMs,
        socketBufferedBytes: socket.bufferedAmount,
        delayedFrames: this.snapshot.delayedFrames + (delayed ? 1 : 0),
        rms,
      });
      this.emitLocal("audio-chunk-sent", { intervalMs, byteLength: pcm.byteLength, configuredTargetChunkMs: configuration.targetChunkMs, bufferedBytes: socket.bufferedAmount });
      if (delayed) this.emitLocal("audio-frame-delayed", { intervalMs, configuredTargetChunkMs: configuration.targetChunkMs });
    };
    this.update({ connection: "streaming", microphone: "active" });
    this.emitLocal("audio-streaming-start", { encoding: "linear16", sampleRate: configuration.sampleRate, targetChunkMs: configuration.targetChunkMs, browserSampleRate: context.sampleRate });
  }

  private fail(message: string, generation: number) {
    if (generation !== this.snapshot.generation) return;
    this.update({ connection: "failed", error: message });
    this.emitLocal("provider-warning", { description: message, fatal: true });
    void this.stop(false);
  }

  private async closeSocket() {
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      if (socket.readyState < WebSocket.CLOSING) socket.close(1000, "Flux Observatory cleanup");
    }
    this.clearConfigureTimer();
  }

  private async releaseAudio() {
    const audio = this.audio;
    this.audio = null;
    this.lastChunkAt = null;
    if (!audio) return;
    for (const track of audio.stream.getTracks()) {
      track.removeEventListener("ended", this.handleTrackEnded);
      track.stop();
    }
    if (audio.worklet) audio.worklet.port.onmessage = null;
    for (const node of [audio.source, audio.worklet, audio.sink]) {
      try { node?.disconnect(); } catch { /* already disconnected */ }
    }
    if (audio.context && audio.context.state !== "closed") await audio.context.close().catch(() => undefined);
  }

  private clearCredential() {
    this.credential = null;
    if (this.credentialTimer !== null) window.clearTimeout(this.credentialTimer);
    this.credentialTimer = null;
    this.update({ credential: "cleared" });
  }

  private clearConfigureTimer() {
    if (this.configureTimer !== null) window.clearTimeout(this.configureTimer);
    this.configureTimer = null;
  }

  private isActiveSocket(socket: WebSocket, generation: number) {
    return this.socket === socket && this.snapshot.generation === generation && !this.stopped;
  }

  private emitLocal(name: FluxLocalLifecycleName, details: Record<string, unknown>) {
    this.callbacks.onSignal({ kind: "local", name, generation: this.snapshot.generation, monotonicMs: this.now(), details });
  }

  private update(changes: Partial<FluxLiveClientSnapshot>) {
    this.snapshot = { ...this.snapshot, ...changes };
    this.callbacks.onSnapshot({ ...this.snapshot });
  }

  private readonly handleTrackEnded = () => {
    this.update({ microphone: "missing", connection: "failed", error: "The microphone device became unavailable." });
    this.emitLocal("provider-warning", { description: "Microphone device disappeared.", fatal: true });
    void this.stop(false);
  };
}

function parseProviderPayload(value: unknown) {
  if (typeof value !== "string") return { type: "UnknownBinaryMessage", byteLength: value instanceof ArrayBuffer ? value.byteLength : 0 };
  try { return JSON.parse(value) as unknown; }
  catch { return value; }
}

function readProviderType(value: unknown) {
  return value && typeof value === "object" && "type" in value && typeof value.type === "string" ? value.type : "";
}

function safeError(value: unknown) {
  const message = value instanceof Error ? value.message : "The live Flux session failed.";
  return message.replace(/\b(?:Bearer|Token)\s+\S+/gi, "***redacted***").replace(/eyJ[A-Za-z0-9._-]+/g, "***redacted***").slice(0, 300);
}

function sanitizeCloseReason(value: string) {
  return safeError(new Error(value || "No close reason")).slice(0, 160);
}

function cleanupSummary() {
  return { tracksStopped: true, audioContextClosed: true, workletDisconnected: true, socketReferenceCleared: true, credentialReferenceCleared: true };
}

export function resample(input: Float32Array, sourceRate: number, targetRate: number) {
  if (input.length === 0) return new Float32Array();
  if (sourceRate === targetRate) return input;
  const outputLength = Math.max(1, Math.round(input.length * targetRate / sourceRate));
  const output = new Float32Array(outputLength);
  const ratio = sourceRate / targetRate;
  for (let index = 0; index < outputLength; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const right = Math.min(input.length - 1, left + 1);
    const weight = position - left;
    output[index] = input[left] * (1 - weight) + input[right] * weight;
  }
  return output;
}

export function floatToPcm16(input: Float32Array) {
  const output = new Int16Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index]));
    output[index] = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
  }
  return output;
}
