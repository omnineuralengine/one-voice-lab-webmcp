import { expect, test, type Page } from "@playwright/test";

import {
  openAppliedEngineeringQuestline,
  selectQuestlineWorkspace,
} from "./helpers";

type MediaMockMode = "granted" | "denied";

type QuestlineMediaMockState = {
  mode: MediaMockMode;
  enumerateDevicesCalls: number;
  getUserMediaConstraints: MediaStreamConstraints[];
  trackStops: number;
  recorderStarts: number;
  recorderStops: number;
  audioContextConstructs: number;
  audioContextCloses: number;
  sourceConnects: number;
  sourceDisconnects: number;
  analyserReads: number;
  analyserDisconnects: number;
};

declare global {
  interface Window {
    __questlineMediaMock: QuestlineMediaMockState;
  }
}

test.describe("@questline microphone lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    await installMediaMocks(page);
    await openAppliedEngineeringQuestline(page);
    await selectQuestlineWorkspace(page, "Audio Engineering");
    await expect(page.getByRole("heading", { name: "Audio Signal Workbench" })).toBeVisible();
  });

  test("does not capture audio before explicit start", async ({ page }) => {
    await page.waitForTimeout(150);

    const state = await readMediaState(page);
    expect(state.getUserMediaConstraints).toEqual([]);
    expect(state.trackStops).toBe(0);
    await expect(page.getByRole("button", { name: "Start local mic analysis" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Stop + release" })).toBeDisabled();
    await expect(page.getByText(/Microphone access starts only when you choose Start local mic analysis/i)).toBeVisible();
  });

  test("starts granted capture only after the learner clicks and measures locally", async ({ page }) => {
    await page.getByRole("button", { name: "Start local mic analysis" }).click();

    await expect(page.getByText(/Local analysis is active/i)).toBeVisible();
    await expect(page.getByRole("status").getByText("Mock Default Microphone", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Stop + release" })).toBeEnabled();
    await expect.poll(async () => (await readMediaState(page)).analyserReads).toBeGreaterThan(0);

    const state = await readMediaState(page);
    expect(state.getUserMediaConstraints).toEqual([{ audio: true, video: false }]);
    expect(state.recorderStarts).toBe(1);
    expect(state.audioContextConstructs).toBe(1);
    expect(state.sourceConnects).toBe(1);
    expect(state.trackStops).toBe(0);
  });

  test("surfaces denied permission without constructing audio resources", async ({ page }) => {
    await setMediaMode(page, "denied");
    await page.getByRole("button", { name: "Start local mic analysis" }).click();

    await expect(page.getByText("Permission denied by deterministic test mock.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start local mic analysis" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Stop + release" })).toBeDisabled();

    const state = await readMediaState(page);
    expect(state.getUserMediaConstraints).toEqual([{ audio: true, video: false }]);
    expect(state.trackStops).toBe(0);
    expect(state.recorderStarts).toBe(0);
    expect(state.audioContextConstructs).toBe(0);
  });

  test("uses an exact device constraint after device selection", async ({ page }) => {
    await page.getByRole("button", { name: "Start local mic analysis" }).click();
    await expect(page.getByText(/Local analysis is active/i)).toBeVisible();
    await expect(page.getByRole("option", { name: "Studio Interface" })).toBeAttached();
    await page.getByRole("button", { name: "Stop + release" }).click();

    await page.getByRole("combobox", { name: /Input device/i }).selectOption("studio-mic");
    await page.getByRole("button", { name: "Start local mic analysis" }).click();
    await expect(page.getByRole("status").getByText("Studio Interface", { exact: true })).toBeVisible();

    const state = await readMediaState(page);
    expect(state.enumerateDevicesCalls).toBeGreaterThanOrEqual(1);
    expect(state.getUserMediaConstraints).toHaveLength(2);
    expect(state.getUserMediaConstraints[1]).toEqual({
      audio: { deviceId: { exact: "studio-mic" } },
      video: false,
    });
  });

  test("transfers the selected device label into a microphone quest handoff", async ({ page }) => {
    await page.getByRole("button", { name: "Start local mic analysis" }).click();
    await expect(page.getByText(/Local analysis is active/i)).toBeVisible();
    await page.getByRole("button", { name: "Stop + release" }).click();
    await page.getByRole("combobox", { name: /Input device/i }).selectOption("studio-mic");

    await selectQuestlineWorkspace(page, "Quest Tree");
    await page.getByLabel("Quest tree").getByRole("button", { name: /Browser event-loop streaming/i }).click();
    await page.getByRole("button", { name: "Open this quest in Code Lab", exact: true }).last().click();

    const dialog = page.getByTestId("code-lab-launch-dialog");
    await expect(dialog.getByTestId("launch-context-summary")).toContainText(
      "Browser microphone: Studio Interface",
    );
    await dialog.getByTestId("confirm-code-lab-launch").click();
    await expect(page.getByRole("combobox", { name: "Code Lab workflow" })).toHaveValue("live-mic");
  });

  test("stop releases the track, recorder, analyser, source, and audio context", async ({ page }) => {
    await page.getByRole("button", { name: "Start local mic analysis" }).click();
    await expect(page.getByText(/Local analysis is active/i)).toBeVisible();
    await page.getByRole("button", { name: "Stop + release" }).click();

    await expect(page.getByText(/All media tracks, nodes, recorder callbacks, and animation frames were released/i)).toBeVisible();
    await expect.poll(async () => (await readMediaState(page)).audioContextCloses).toBe(1);

    const state = await readMediaState(page);
    expect(state.trackStops).toBe(1);
    expect(state.recorderStops).toBe(1);
    expect(state.sourceDisconnects).toBe(1);
    expect(state.analyserDisconnects).toBe(1);
    await expect(page.getByRole("button", { name: "Stop + release" })).toBeDisabled();
  });

  test("workspace navigation unmounts the workbench and releases capture", async ({ page }) => {
    await page.getByRole("button", { name: "Start local mic analysis" }).click();
    await expect(page.getByText(/Local analysis is active/i)).toBeVisible();

    await selectQuestlineWorkspace(page, "Quest Tree");
    await expect(page.getByRole("heading", { name: "Audio Signal Workbench" })).toBeHidden();
    await expect.poll(async () => (await readMediaState(page)).trackStops).toBe(1);

    const state = await readMediaState(page);
    expect(state.getUserMediaConstraints).toHaveLength(1);
    expect(state.recorderStops).toBe(1);
    expect(state.audioContextCloses).toBe(1);
    expect(state.sourceDisconnects).toBe(1);
    expect(state.analyserDisconnects).toBe(1);
  });
});

async function installMediaMocks(page: Page) {
  await page.addInitScript(() => {
    const state: QuestlineMediaMockState = {
      mode: "granted",
      enumerateDevicesCalls: 0,
      getUserMediaConstraints: [],
      trackStops: 0,
      recorderStarts: 0,
      recorderStops: 0,
      audioContextConstructs: 0,
      audioContextCloses: 0,
      sourceConnects: 0,
      sourceDisconnects: 0,
      analyserReads: 0,
      analyserDisconnects: 0,
    };
    window.__questlineMediaMock = state;

    const devices: MediaDeviceInfo[] = [
      mediaDevice("default-mic", "Mock Default Microphone", "audioinput", "default-group"),
      mediaDevice("studio-mic", "Studio Interface", "audioinput", "studio-group"),
      mediaDevice("mock-camera", "Ignored Camera", "videoinput", "video-group"),
    ];

    const mediaDevices = new EventTarget() as MediaDevices;
    Object.defineProperties(mediaDevices, {
      enumerateDevices: {
        configurable: true,
        value: async () => {
          state.enumerateDevicesCalls += 1;
          return devices;
        },
      },
      getSupportedConstraints: {
        configurable: true,
        value: () => ({ deviceId: true, sampleRate: true, channelCount: true }),
      },
      getUserMedia: {
        configurable: true,
        value: async (constraints: MediaStreamConstraints) => {
          state.getUserMediaConstraints.push(constraints);
          if (state.mode === "denied") {
            throw new DOMException("Permission denied by deterministic test mock.", "NotAllowedError");
          }

          const requestedAudio = typeof constraints.audio === "object" && constraints.audio
            ? constraints.audio as MediaTrackConstraints & { deviceId?: string | { exact?: string } }
            : null;
          const requestedDevice = typeof requestedAudio?.deviceId === "string"
            ? requestedAudio.deviceId
            : requestedAudio?.deviceId?.exact;
          const device = devices.find((item) => item.deviceId === requestedDevice) ?? devices[0];
          return createMockStream(device);
        },
      },
      getDisplayMedia: {
        configurable: true,
        value: async () => {
          throw new DOMException("Display capture is outside this test.", "NotAllowedError");
        },
      },
      selectAudioOutput: {
        configurable: true,
        value: async () => {
          throw new DOMException("Audio output selection is outside this test.", "NotAllowedError");
        },
      },
    });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: mediaDevices });

    class MockMediaRecorder extends EventTarget {
      static isTypeSupported(mimeType: string) {
        return mimeType === "audio/webm;codecs=opus" || mimeType === "audio/webm";
      }

      readonly stream: MediaStream;
      readonly mimeType: string;
      state: RecordingState = "inactive";
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onpause: ((event: Event) => void) | null = null;
      onresume: ((event: Event) => void) | null = null;
      onstart: ((event: Event) => void) | null = null;
      onstop: ((event: Event) => void) | null = null;
      audioBitsPerSecond = 0;
      videoBitsPerSecond = 0;
      private intervalId: number | null = null;

      constructor(stream: MediaStream, options?: MediaRecorderOptions) {
        super();
        this.stream = stream;
        this.mimeType = options?.mimeType ?? "audio/webm;codecs=opus";
      }

      start(timeslice = 250) {
        this.state = "recording";
        state.recorderStarts += 1;
        this.onstart?.(new Event("start"));
        this.intervalId = window.setInterval(() => {
          this.ondataavailable?.({
            data: new Blob([new Uint8Array([1, 2, 3, 4])], { type: this.mimeType }),
            timeStamp: performance.now(),
          } as BlobEvent);
        }, Math.max(25, timeslice));
      }

      stop() {
        if (this.state === "inactive") return;
        this.state = "inactive";
        state.recorderStops += 1;
        if (this.intervalId !== null) window.clearInterval(this.intervalId);
        this.intervalId = null;
        this.onstop?.(new Event("stop"));
      }

      pause() { this.state = "paused"; }
      resume() { this.state = "recording"; }
      requestData() {
        this.ondataavailable?.({ data: new Blob([], { type: this.mimeType }), timeStamp: performance.now() } as BlobEvent);
      }
    }
    Object.defineProperty(window, "MediaRecorder", { configurable: true, value: MockMediaRecorder });

    class MockAudioContext {
      readonly sampleRate = 48_000;
      readonly destination = {} as AudioDestinationNode;
      state: AudioContextState = "suspended";

      constructor() {
        state.audioContextConstructs += 1;
      }

      async resume() { this.state = "running"; }
      async close() {
        if (this.state === "closed") return;
        this.state = "closed";
        state.audioContextCloses += 1;
      }

      createMediaStreamSource() {
        return {
          connect: () => { state.sourceConnects += 1; },
          disconnect: () => { state.sourceDisconnects += 1; },
        } as unknown as MediaStreamAudioSourceNode;
      }

      createAnalyser() {
        let fftSize = 2048;
        return {
          get fftSize() { return fftSize; },
          set fftSize(value: number) { fftSize = value; },
          smoothingTimeConstant: 0,
          getFloatTimeDomainData: (samples: Float32Array) => {
            state.analyserReads += 1;
            for (let index = 0; index < samples.length; index += 1) {
              samples[index] = index % 31 === 0 ? 0.2 : 0.04;
            }
          },
          disconnect: () => { state.analyserDisconnects += 1; },
        } as unknown as AnalyserNode;
      }
    }
    Object.defineProperty(window, "AudioContext", { configurable: true, value: MockAudioContext });

    function mediaDevice(deviceId: string, label: string, kind: MediaDeviceKind, groupId: string): MediaDeviceInfo {
      return {
        deviceId,
        label,
        kind,
        groupId,
        toJSON: () => ({ deviceId, label, kind, groupId }),
      };
    }

    function createMockStream(device: MediaDeviceInfo): MediaStream {
      let stopped = false;
      const trackTarget = new EventTarget();
      const track = Object.assign(trackTarget, {
        kind: "audio",
        id: `track-${device.deviceId}`,
        label: device.label,
        enabled: true,
        muted: false,
        readyState: "live",
        contentHint: "speech",
        stop: () => {
          if (stopped) return;
          stopped = true;
          state.trackStops += 1;
        },
        getSettings: () => ({
          deviceId: device.deviceId,
          sampleRate: 48_000,
          sampleSize: 16,
          channelCount: 1,
          latency: 0.01,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        }),
        getConstraints: () => ({}),
        getCapabilities: () => ({}),
        applyConstraints: async () => undefined,
        clone: () => track,
      }) as unknown as MediaStreamTrack;
      const streamTarget = new EventTarget();
      return Object.assign(streamTarget, {
        id: `stream-${device.deviceId}`,
        active: true,
        getTracks: () => [track],
        getAudioTracks: () => [track],
        getVideoTracks: () => [],
        getTrackById: (id: string) => id === track.id ? track : null,
        addTrack: () => undefined,
        removeTrack: () => undefined,
        clone: () => createMockStream(device),
      }) as unknown as MediaStream;
    }
  });
}

async function readMediaState(page: Page) {
  return page.evaluate(() => structuredClone(window.__questlineMediaMock));
}

async function setMediaMode(page: Page, mode: MediaMockMode) {
  await page.evaluate((nextMode) => {
    window.__questlineMediaMock.mode = nextMode;
  }, mode);
}
