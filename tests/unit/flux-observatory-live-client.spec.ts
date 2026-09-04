import { expect, test } from "@playwright/test";

import { DEFAULT_FLUX_CONFIGURATION } from "@/lib/flux-observatory/config";
import {
  FluxLiveClient,
  floatToPcm16,
  resample,
  type FluxLiveClientSignal,
  type FluxLiveClientSnapshot,
} from "@/lib/flux-observatory/live-client";
import type { FluxConfiguration } from "@/lib/flux-observatory/types";

let browser: ReturnType<typeof installBrowserDoubles>;
let clients: FluxLiveClient[];

test.beforeEach(() => {
  browser = installBrowserDoubles();
  clients = [];
});

test.afterEach(async () => {
  await Promise.all(clients.map((client) => client.dispose()));
  browser.restore();
});

test("resamples deterministic PCM and clamps Float32 samples to signed 16-bit", () => {
  expect([...resample(new Float32Array([0, 0.5, 1]), 3, 6)])
    .toEqual([0, 0.25, 0.5, 0.75, 1, 1]);
  expect([...resample(new Float32Array([0, 0.25, 0.5, 0.75, 1]), 4, 2)])
    .toEqual([0, 0.5, 1]);
  expect(resample(new Float32Array(), 48_000, 16_000)).toHaveLength(0);
  expect([...floatToPcm16(new Float32Array([-2, -1, -0.5, 0, 0.5, 1, 2]))])
    .toEqual([-32768, -32768, -16384, 0, 16384, 32767, 32767]);
});

test("records microphone permission grant and classifies explicit permission denial", async () => {
  const granted = createRig();
  await granted.client.prepareMicrophone(configuration());
  expect(granted.client.getSnapshot()).toMatchObject({ connection: "microphone-ready", microphone: "ready" });
  expect(granted.signals).toContainEqual(expect.objectContaining({ kind: "local", name: "microphone-capture-start" }));
  expect(browser.streams).toHaveLength(1);

  browser.permissionError = new DOMException("Synthetic denial", "NotAllowedError");
  const denied = createRig();
  await expect(denied.client.prepareMicrophone(configuration())).rejects.toThrow("permission was denied");
  expect(denied.client.getSnapshot()).toMatchObject({ connection: "failed", microphone: "denied" });
});

test("does not request a temporary token until the Flux configuration is valid", async () => {
  const rig = createRig();
  await rig.client.prepareMicrophone(configuration());
  const invalid = configuration({ thresholds: { eotThreshold: 0.4, eagerEotThreshold: null, eotTimeoutMs: 5000 } });

  await expect(rig.client.start(invalid)).rejects.toThrow("eot_threshold");
  expect(rig.fetchCalls).toBe(0);
  expect(rig.sockets).toHaveLength(0);
  expect(rig.client.getSnapshot()).toMatchObject({ connection: "microphone-ready", credential: "unavailable" });
});

test("keeps the temporary bearer out of URLs, snapshots, signals, and browser storage", async () => {
  const token = "eyJtemporaryfixture.header.signature";
  const rig = createRig({ token });
  await rig.client.prepareMicrophone(configuration());
  await rig.client.start(configuration());

  const socket = rig.sockets[0];
  expect(socket.url).toContain("wss://api.deepgram.com/v2/listen");
  expect(socket.url).not.toContain(token);
  expect(socket.protocols).toEqual(["bearer", token]);
  expect(JSON.stringify({ snapshots: rig.snapshots, signals: rig.signals })).not.toContain(token);
  expect(browser.storageWrites).toBe(0);

  await rig.client.stop();
  expect(rig.client.getSnapshot().credential).toBe("cleared");
  expect(JSON.stringify({ snapshots: rig.snapshots, signals: rig.signals })).not.toContain(token);
});

test("waits for initial ConfigureSuccess before constructing or streaming the audio pipeline", async () => {
  const rig = createRig();
  await rig.client.prepareMicrophone(configuration());
  await rig.client.start(configuration());
  const socket = rig.sockets[0];

  socket.open();
  expect(readSentJson(socket, 0)).toMatchObject({ type: "Configure", thresholds: { eot_threshold: 0.7 } });
  expect(browser.audioContexts).toHaveLength(0);
  socket.message({ type: "TurnInfo", event: "StartOfTurn", transcript: "Synthetic pre-ack payload" });
  expect(browser.audioContexts).toHaveLength(0);

  socket.message({ type: "ConfigureSuccess" });
  await flushMicrotasks();
  expect(browser.audioContexts).toHaveLength(1);
  expect(browser.worklets).toHaveLength(1);
  expect(rig.client.getSnapshot()).toMatchObject({ connection: "streaming", microphone: "active" });
  expect(rig.signals).toContainEqual(expect.objectContaining({ kind: "local", name: "audio-streaming-start" }));
});

test("serializes dynamic Configure requests and retains the supplied active configuration after rejection", async () => {
  const rig = createRig();
  const active = { ...configuration(), apiKey: "dg_should_not_escape_123456789" } as FluxConfiguration;
  const socket = await startStreaming(rig, active);

  rig.client.applyConfiguration({ thresholds: { eotThreshold: 0.8 } }, active);
  expect(() => rig.client.applyConfiguration({ thresholds: { eotThreshold: 0.75 } }, active))
    .toThrow("Wait for the current configuration acknowledgement");
  expect(readSentJson(socket, 1)).toEqual({ type: "Configure", thresholds: { eot_threshold: 0.8 } });

  const firstRequest = configurationSignals(rig.signals).at(-1);
  expect(firstRequest?.previousConfiguration.thresholds.eotThreshold).toBe(0.7);
  expect(JSON.stringify(firstRequest)).not.toMatch(/apiKey|dg_should_not_escape/);

  socket.message({ type: "ConfigureFailure", code: "SYNTHETIC_REJECTION", description: "Not applied" });
  rig.client.applyConfiguration({ thresholds: { eotThreshold: 0.75 } }, active);
  expect(readSentJson(socket, 2)).toEqual({ type: "Configure", thresholds: { eot_threshold: 0.75 } });
  expect(configurationSignals(rig.signals).at(-1)?.previousConfiguration.thresholds.eotThreshold).toBe(0.7);
});

test("dispose releases tracks, AudioContext, AudioWorklet, socket, timers, and credential references", async () => {
  const rig = createRig();
  const socket = await startStreaming(rig, configuration());
  const track = browser.streams[0].track;
  const context = browser.audioContexts[0];
  const worklet = browser.worklets[0];

  await rig.client.dispose();

  expect(track.stopCalls).toBe(1);
  expect(context.closeCalls).toBe(1);
  expect(worklet.disconnected).toBe(true);
  expect(worklet.port.onmessage).toBeNull();
  expect(socket.closeCalls).toBe(1);
  expect(browser.timers.pendingCount).toBe(0);
  expect(rig.client.getSnapshot()).toMatchObject({ connection: "closed", credential: "cleared", microphone: "stopped" });
});

test("ignores callbacks captured from an obsolete socket generation", async () => {
  const rig = createRig();
  await rig.client.prepareMicrophone(configuration());
  await rig.client.start(configuration());
  const obsolete = rig.sockets[0];
  const staleMessage = obsolete.onmessage;
  expect(staleMessage).not.toBeNull();

  await rig.client.start(configuration());
  const active = rig.sockets[1];
  const providerSignalsBefore = rig.signals.filter((signal) => signal.kind === "provider").length;
  staleMessage?.({ data: JSON.stringify({ type: "Error", description: "Obsolete failure" }) } as MessageEvent);

  expect(obsolete.closeCalls).toBe(1);
  expect(active.closeCalls).toBe(0);
  expect(rig.signals.filter((signal) => signal.kind === "provider")).toHaveLength(providerSignalsBefore);
  expect(rig.client.getSnapshot()).toMatchObject({ generation: 2, connection: "connecting", error: "" });
});

test("clears the in-memory credential and reports token expiry without exposing its value", async () => {
  const token = "eyJexpiringfixture.header.signature";
  const rig = createRig({ token, expiresIn: 1 });
  await rig.client.prepareMicrophone(configuration());
  await rig.client.start(configuration());
  expect(rig.client.getSnapshot().credential).toBe("memory-only");

  browser.timers.runWhere((task) => task.delay <= 1_500);

  expect(rig.client.getSnapshot().credential).toBe("expired");
  expect(rig.signals).toContainEqual(expect.objectContaining({ kind: "local", name: "token-expiry" }));
  expect(JSON.stringify({ snapshots: rig.snapshots, signals: rig.signals })).not.toContain(token);
});

test("drops frames above the bounded socket buffer and measures only locally observed cadence", async () => {
  const rig = createRig();
  const socket = await startStreaming(rig, configuration());
  const worklet = browser.worklets[0];
  const sentBeforeFrames = socket.sent.length;

  socket.bufferedAmount = 600 * 1024;
  rig.setNow(0);
  worklet.emitFrame(new Float32Array(480).fill(0.25), 0.25);
  expect(socket.sent).toHaveLength(sentBeforeFrames);
  expect(rig.client.getSnapshot()).toMatchObject({ droppedFrames: 1, socketBufferedBytes: 600 * 1024 });
  expect(rig.signals).toContainEqual(expect.objectContaining({ kind: "local", name: "audio-frame-dropped" }));

  socket.bufferedAmount = 0;
  rig.setNow(80);
  worklet.emitFrame(new Float32Array(480).fill(0.25), 0.25);
  const firstPcm = socket.sent.at(-1);
  expect(firstPcm).toBeInstanceOf(ArrayBuffer);
  expect((firstPcm as ArrayBuffer).byteLength).toBe(320);

  rig.setNow(300);
  worklet.emitFrame(new Float32Array(480).fill(0.25), 0.25);
  expect(rig.client.getSnapshot()).toMatchObject({ measuredChunkIntervalMs: 220, delayedFrames: 1, droppedFrames: 1 });
});

function configuration(overrides: Partial<FluxConfiguration> = {}): FluxConfiguration {
  return {
    ...DEFAULT_FLUX_CONFIGURATION,
    ...overrides,
    thresholds: { ...DEFAULT_FLUX_CONFIGURATION.thresholds, ...(overrides.thresholds ?? {}) },
    keyterms: [...(overrides.keyterms ?? DEFAULT_FLUX_CONFIGURATION.keyterms)],
    languageHints: [...(overrides.languageHints ?? DEFAULT_FLUX_CONFIGURATION.languageHints)],
  };
}

function createRig(options: { token?: string; expiresIn?: number } = {}) {
  const signals: FluxLiveClientSignal[] = [];
  const snapshots: FluxLiveClientSnapshot[] = [];
  const sockets: FakeSocket[] = [];
  let fetchCalls = 0;
  let monotonicMs = 0;
  const token = options.token ?? "temporary-fixture-token";
  const fetcher = (async () => {
    fetchCalls += 1;
    return Response.json({ access_token: token, expires_in: options.expiresIn ?? 60 });
  }) as typeof fetch;
  const client = new FluxLiveClient({
    onSignal: (signal) => signals.push(signal),
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    now: () => monotonicMs,
    fetcher,
    createSocket: (url, protocols) => {
      const socket = new FakeSocket(url, protocols);
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
  });
  clients.push(client);
  return {
    client,
    signals,
    snapshots,
    sockets,
    get fetchCalls() { return fetchCalls; },
    setNow(value: number) { monotonicMs = value; },
  };
}

async function startStreaming(rig: ReturnType<typeof createRig>, active: FluxConfiguration) {
  await rig.client.prepareMicrophone(active);
  await rig.client.start(active);
  const socket = rig.sockets.at(-1);
  if (!socket) throw new Error("Expected the Flux socket fixture.");
  socket.open();
  socket.message({ type: "ConfigureSuccess" });
  await flushMicrotasks();
  return socket;
}

function configurationSignals(signals: FluxLiveClientSignal[]) {
  return signals.filter((signal): signal is Extract<FluxLiveClientSignal, { kind: "configuration-request" }> => signal.kind === "configuration-request");
}

function readSentJson(socket: FakeSocket, index: number) {
  const value = socket.sent[index];
  if (typeof value !== "string") throw new Error(`Expected JSON text at send index ${index}.`);
  return JSON.parse(value) as unknown;
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

type FakeTimerTask = { id: number; delay: number; callback: () => void };

class FakeTimers {
  private nextId = 1;
  private readonly tasks = new Map<number, FakeTimerTask>();

  get pendingCount() { return this.tasks.size; }

  readonly setTimeout = (callback: TimerHandler, delay = 0) => {
    if (typeof callback !== "function") throw new Error("String timers are not supported by this fixture.");
    const id = this.nextId++;
    this.tasks.set(id, { id, delay: Number(delay) || 0, callback: () => callback() });
    return id;
  };

  readonly clearTimeout = (id?: number) => {
    if (typeof id === "number") this.tasks.delete(id);
  };

  runWhere(predicate: (task: FakeTimerTask) => boolean) {
    const selected = [...this.tasks.values()].filter(predicate).sort((left, right) => left.id - right.id);
    for (const task of selected) {
      if (!this.tasks.delete(task.id)) continue;
      task.callback();
    }
  }
}

class FakeTrack {
  readyState: MediaStreamTrackState = "live";
  stopCalls = 0;
  private endedListener: EventListenerOrEventListenerObject | null = null;

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type === "ended") this.endedListener = listener;
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type === "ended" && this.endedListener === listener) this.endedListener = null;
  }

  stop() {
    this.stopCalls += 1;
    this.readyState = "ended";
  }
}

class FakeStream {
  readonly track = new FakeTrack();
  get active() { return this.track.readyState === "live"; }
  getTracks() { return [this.track as unknown as MediaStreamTrack]; }
  getAudioTracks() { return this.getTracks(); }
}

class FakeNode {
  disconnected = false;
  connect<T>(destination: T): T { return destination; }
  disconnect() { this.disconnected = true; }
}

class FakeGainNode extends FakeNode {
  gain = { value: 1 };
}

class FakeWorkletNode extends FakeNode {
  readonly port: { onmessage: ((event: MessageEvent<{ type: string; samples: ArrayBuffer; rms: number }>) => void) | null } = { onmessage: null };

  emitFrame(samples: Float32Array, rms: number) {
    const copy = samples.slice().buffer as ArrayBuffer;
    this.port.onmessage?.({ data: { type: "pcm-frame", samples: copy, rms } } as MessageEvent<{ type: string; samples: ArrayBuffer; rms: number }>);
  }
}

class FakeAudioContextRecord {
  readonly sampleRate = 48_000;
  state: AudioContextState = "running";
  closeCalls = 0;
  readonly destination = new FakeNode();
  readonly audioWorklet = { addModule: async () => undefined };

  createMediaStreamSource() { return new FakeNode(); }
  createGain() { return new FakeGainNode(); }
  async resume() { this.state = "running"; }
  async close() { this.closeCalls += 1; this.state = "closed"; }
}

class FakeSocket {
  readyState = 0;
  binaryType: BinaryType = "blob";
  bufferedAmount = 0;
  closeCalls = 0;
  readonly sent: unknown[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(readonly url: string, readonly protocols: string | string[]) {}

  open() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }

  message(payload: unknown) {
    this.onmessage?.({ data: typeof payload === "string" ? payload : JSON.stringify(payload) } as MessageEvent);
  }

  send(value: unknown) { this.sent.push(value); }

  close() {
    this.closeCalls += 1;
    this.readyState = 3;
  }
}

function installBrowserDoubles() {
  const timers = new FakeTimers();
  const streams: FakeStream[] = [];
  const audioContexts: FakeAudioContextRecord[] = [];
  const worklets: FakeWorkletNode[] = [];
  let permissionError: Error | null = null;
  let storageWrites = 0;
  const restorers: Array<() => void> = [];

  class AudioContextDouble extends FakeAudioContextRecord {
    constructor() {
      super();
      audioContexts.push(this);
    }
  }

  class AudioWorkletNodeDouble extends FakeWorkletNode {
    constructor() {
      super();
      worklets.push(this);
    }
  }

  class WebSocketConstants {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
  }

  const storage = {
    getItem: () => null,
    setItem: () => { storageWrites += 1; },
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0,
  } satisfies Storage;

  replaceGlobal("window", { setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout }, restorers);
  replaceGlobal("navigator", {
    mediaDevices: {
      getUserMedia: async () => {
        if (permissionError) throw permissionError;
        const stream = new FakeStream();
        streams.push(stream);
        return stream as unknown as MediaStream;
      },
    },
  }, restorers);
  replaceGlobal("AudioContext", AudioContextDouble, restorers);
  replaceGlobal("AudioWorkletNode", AudioWorkletNodeDouble, restorers);
  replaceGlobal("WebSocket", WebSocketConstants, restorers);
  replaceGlobal("localStorage", storage, restorers);
  replaceGlobal("sessionStorage", storage, restorers);

  return {
    timers,
    streams,
    audioContexts,
    worklets,
    get storageWrites() { return storageWrites; },
    get permissionError() { return permissionError; },
    set permissionError(value: Error | null) { permissionError = value; },
    restore() { restorers.reverse().forEach((restore) => restore()); },
  };
}

function replaceGlobal(name: string, value: unknown, restorers: Array<() => void>) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  restorers.push(() => {
    if (previous) Object.defineProperty(globalThis, name, previous);
    else Reflect.deleteProperty(globalThis, name);
  });
}
