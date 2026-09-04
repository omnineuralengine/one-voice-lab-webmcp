import { expect, test, type Page } from "@playwright/test";

import {
  captureDownload,
  expectBrowserSurfaceSanitized,
  expectInternalScrollRegion,
  expectNoPageLevelOverflow,
  openAudioSignalLab,
  readDownloadText,
} from "./helpers";

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.config.metadata.observatory !== true, "Audio Signal coverage uses the isolated Observatory runner.");
});

type AudioSignalMockState = {
  getUserMediaCalls: number;
  constraints: MediaStreamConstraints[];
  trackStops: number;
  recorderStarts: number;
  recorderStops: number;
  contextCloses: number;
  analyserReads: number;
  waveform: "healthy" | "silence" | "clipping";
  mockComparison: boolean;
  comparisonRequests: number;
};

declare global {
  interface Window { __audioSignalMock: AudioSignalMockState; }
}

test.describe("@audio-signal-lab local workspace", () => {
  test.beforeEach(async ({ page }) => {
    await installAudioMocks(page);
    await openAudioSignalLab(page);
  });

  test("requires explicit microphone start, shows the actual device, updates meters, and releases on stop/navigation", async ({ page }) => {
    expect((await state(page)).getUserMediaCalls).toBe(0);
    await expect(page.getByText(/No microphone permission is requested until Start local analysis/i)).toBeVisible();
    await expect(page.getByText(/Live monitor: Off/i)).toBeHidden();

    await page.getByRole("button", { name: "microphone", exact: true }).click();
    await expect(page.getByText(/Live monitor: Off/i)).toBeVisible();
    await page.getByRole("button", { name: "Refresh devices" }).click();
    await page.getByRole("combobox", { name: "Audio Signal Lab input device" }).selectOption("focusrite");
    await page.getByRole("button", { name: "Start local analysis" }).click();

    await expect(page.getByRole("status")).toContainText(/Local analysis active/i);
    await expect(page.getByText(/Selected: Focusrite USB Audio/i)).toBeVisible();
    await expect(page.getByLabel("Live capture facts")).toContainText("Focusrite USB Audio");
    await expect(page.getByLabel("Live capture facts")).toContainText("48000 Hz");
    await expect(page.getByLabel("Live capture facts")).toContainText("audio/webm");
    await expect.poll(async () => (await state(page)).analyserReads).toBeGreaterThan(1);
    await expect(page.getByTestId("audio-metric-rms")).not.toContainText("0.0000");
    await expect(page.getByTestId("audio-metric-peak")).toContainText("0.2000");
    await expect(page.getByText("Present", { exact: true })).toBeVisible();
    await expect(page.getByText(/chunks$/i).first()).not.toHaveText("0 chunks");

    const active = await state(page);
    expect(active.getUserMediaCalls).toBe(1);
    expect(active.constraints[0]).toEqual({
      video: false,
      audio: {
        deviceId: { exact: "focusrite" },
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    await page.locator('[data-shortcut-command="stop_session"]').click();
    await expect(page.getByRole("status")).toContainText(/Capture stopped/i);
    await expect.poll(async () => (await state(page)).trackStops).toBe(1);
    expect((await state(page)).recorderStops).toBe(1);

    await page.getByRole("button", { name: "Start local analysis" }).click();
    await expect(page.getByRole("status")).toContainText(/Local analysis active/i);
    await page.getByRole("button", { name: /Overview/i }).first().click();
    await expect.poll(async () => (await state(page)).trackStops).toBe(2);
    expect((await state(page)).contextCloses).toBeGreaterThanOrEqual(2);
  });

  test("renders deterministic clipping and silence evidence from local fixtures", async ({ page }) => {
    let deepgramRequests = 0;
    page.on("request", (request) => { if (request.url().includes("/api/deepgram/")) deepgramRequests += 1; });
    await page.getByRole("button", { name: /Clipped tone/i }).click();
    await expect(page.getByRole("heading", { name: "Clipping detected" })).toBeVisible();
    await expect(page.getByText("Detected", { exact: true })).toBeVisible();
    await expect(page.getByTestId("audio-metric-clip-events")).not.toContainText(/^Clip events0$/);
    await expect(page.getByText(/No Deepgram request occurred/i)).toBeVisible();

    await page.getByRole("button", { name: /Digital silence/i }).click();
    await expect(page.getByRole("heading", { name: "Mostly silence" })).toBeVisible();
    await expect(page.getByText("Absent", { exact: true })).toBeVisible();
    expect(deepgramRequests).toBe(0);
  });

  test("preserves the original, labels copied variants, and never transcribes during local transformation", async ({ page }) => {
    let transcribeCalls = 0;
    await page.route("**/api/deepgram/transcribe-file", async (route) => {
      transcribeCalls += 1;
      await route.abort("failed");
    });

    await page.getByRole("button", { name: /Sine tone/i }).click();
    await page.getByRole("combobox", { name: "Audio variant preset" }).selectOption("low-gain");
    await page.getByRole("button", { name: "Create offline variant" }).click();

    await expect(page.getByText("Original fixture", { exact: true })).toBeVisible();
    await expect(page.getByText("Preserved", { exact: true })).toBeVisible();
    await expect(page.getByText("Low gain", { exact: true })).toBeVisible();
    await expect(page.getByText(/Amplitude reduced by approximately 18 dB/i)).toBeVisible();
    await expect(page.getByText("No automatic STT", { exact: true })).toBeVisible();
    expect(transcribeCalls).toBe(0);
  });

  test("distinguishes self-describing containers from raw audio and requires raw facts", async ({ page }) => {
    await page.getByRole("button", { name: "upload", exact: true }).click();
    const input = page.getByLabel("Audio Signal Lab upload");
    await input.setInputFiles({ name: "voice.raw", mimeType: "application/octet-stream", buffer: Buffer.from([1, 2, 3, 4, 5, 6]) });

    await expect(page.getByRole("heading", { name: "Audio format inspector" })).toBeVisible();
    await expect(page.getByText("Required raw-audio facts", { exact: true })).toBeVisible();
    await expect(page.getByTestId("effective-deepgram-audio-config")).toContainText("Format requires inspection");
    await page.getByRole("button", { name: "diagnosis", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Format requires inspection" })).toBeVisible();
    await page.getByRole("button", { name: "format", exact: true }).click();
    await page.getByLabel("Raw encoding").fill("linear16");
    await page.getByLabel("Raw sample rate").fill("16000");
    await page.getByLabel("Raw channels").fill("1");
    await expect(page.getByTestId("effective-deepgram-audio-config")).toContainText('"encoding": "linear16"');

    await input.setInputFiles({ name: "header-confirmed.bin", mimeType: "audio/wav", buffer: wavBytes() });
    const config = page.getByTestId("effective-deepgram-audio-config");
    await expect(config).toContainText('"mode": "containerized"');
    await expect(config).toContainText('"endpointParameters": {}');
    await expect(config).not.toContainText('"encoding": "linear16"');
    await expect(page.getByText(/codec remains unconfirmed unless metadata supports it/i)).toBeVisible();
  });

  test("guards exactly two mocked STT requests and hides WER until ground truth is confirmed", async ({ page }) => {
    await page.evaluate(() => { window.__audioSignalMock.mockComparison = true; });

    await page.getByRole("button", { name: /Sine tone/i }).click();
    await page.getByRole("button", { name: "Create offline variant" }).click();
    await page.getByRole("button", { name: /Compare original vs variant with Deepgram/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Confirm two Deepgram STT requests" })).toBeVisible();
    await expect(dialog).toContainText("Billable requests");
    await expect(dialog).toContainText("2");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    expect((await state(page)).comparisonRequests).toBe(0);

    await page.getByRole("button", { name: /Compare original vs variant with Deepgram/i }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Run comparison" }).click();
    await expect.poll(async () => (await state(page)).comparisonRequests).toBe(2);
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByTestId("audio-signal-lab")).toBeVisible();
    await page.getByRole("button", { name: "experiment", exact: true }).click();
    await expect(page.getByText("Controlled settings and signal evidence", { exact: true })).toBeVisible();
    await expect(page.getByText(/nova-3.*en.*smart_format=true/i)).toBeVisible();
    await expect(page.getByText("Original A", { exact: true })).toBeVisible();
    await expect(page.getByText("Variant B", { exact: true })).toBeVisible();
    await expect(page.getByTestId("wer-unavailable")).toBeVisible();
    await page.getByPlaceholder(/WER stays hidden/i).fill("trace the complete signal path");
    await page.getByText(/Confirm this text is ground truth for WER/i).click();
    await expect(page.getByText("WER A", { exact: true })).toBeVisible();
    await expect(page.getByText("WER B", { exact: true })).toBeVisible();
    const exportDownload = await captureDownload(page, () => page.getByRole("button", { name: "Export summary" }).click());
    const exported = await readDownloadText(exportDownload);
    expect(exported).toContain('"transcriptIncluded": false');
    expect(exported).not.toContain("trace the complete signal path");
  });

  test("@release-navigation sends only aggregated fixture events to Observatory and links to Code Lab and Questline", async ({ page }) => {
    await page.getByRole("button", { name: /Frequency sweep/i }).click();
    await page.getByRole("button", { name: "lessons", exact: true }).click();
    await page.getByRole("button", { name: "Open Observatory timeline" }).click();
    const trace = page.getByLabel("Observatory event trace");
    await expect(trace.getByText("audio.fixture.created", { exact: true })).toBeVisible();
    await expect(trace.getByText(/analysis.frame/i)).toHaveCount(0);

    await page.getByRole("button", { name: /Audio Signal Lab/i }).first().click();
    await page.getByRole("button", { name: "pipeline", exact: true }).click();
    await page.getByRole("button", { name: /Deepgram STT/i }).click();
    await page.getByRole("button", { name: "Open Payload Inspector" }).click();
    await expect(page.getByText("Audio Signal Lab Payload Inspector", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "lessons", exact: true }).click();
    await expect(page.getByText("Prevention", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Open audio implementation in Code Lab" }).click();
    await expect(page.getByRole("combobox", { name: "Code Lab workflow" })).toHaveValue("audio-signal");

    await page.getByRole("button", { name: /Audio Signal Lab/i }).first().click();
    await page.getByRole("button", { name: "lessons", exact: true }).click();
    await page.getByRole("button", { name: "Open Audio Signal Questline lessons" }).click();
    await expect(page.getByRole("heading", { name: "Audio Signal Workbench" })).toBeVisible();
  });

  test("keeps secrets out, supports keyboard focus, reduced motion, and the target viewport", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: /Sine tone/i }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toContainText(/generated locally/i);
    await expect(page.locator(".motion-reduce\\:transition-none").first()).toBeAttached();
    await expectBrowserSurfaceSanitized(page, ["sk_test_audio_signal_forbidden_123456"]);
    await expectNoPageLevelOverflow(page);
    await expectInternalScrollRegion(page.getByLabel("Audio Signal Lab analyzer"));
    await expectInternalScrollRegion(page.getByLabel("Audio Signal Lab diagnosis and teaching"));
  });
});

async function installAudioMocks(page: Page) {
  await page.addInitScript(() => {
    const mock: AudioSignalMockState = {
      getUserMediaCalls: 0,
      constraints: [],
      trackStops: 0,
      recorderStarts: 0,
      recorderStops: 0,
      contextCloses: 0,
      analyserReads: 0,
      waveform: "healthy",
      mockComparison: false,
      comparisonRequests: 0,
    };
    window.__audioSignalMock = mock;

    const devices = [
      device("default", "Mock Default Microphone"),
      device("focusrite", "Focusrite USB Audio"),
    ];
    const mediaDevices = new EventTarget() as MediaDevices;
    Object.defineProperties(mediaDevices, {
      enumerateDevices: { value: async () => devices },
      getSupportedConstraints: { value: () => ({ deviceId: true, sampleRate: true, channelCount: true }) },
      getUserMedia: { value: async (constraints: MediaStreamConstraints) => {
        mock.getUserMediaCalls += 1;
        mock.constraints.push(constraints);
        const exact = typeof constraints.audio === "object" && constraints.audio
          ? (constraints.audio.deviceId as { exact?: string } | undefined)?.exact
          : undefined;
        return stream(devices.find((item) => item.deviceId === exact) ?? devices[0]);
      } },
    });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: mediaDevices });

    class Recorder extends EventTarget {
      static isTypeSupported(type: string) { return type.includes("webm"); }
      readonly stream: MediaStream;
      readonly mimeType: string;
      state: RecordingState = "inactive";
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onstop: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      private timer: number | null = null;
      constructor(source: MediaStream, options?: MediaRecorderOptions) { super(); this.stream = source; this.mimeType = options?.mimeType ?? "audio/webm;codecs=opus"; }
      start(timeslice = 250) {
        this.state = "recording";
        mock.recorderStarts += 1;
        this.timer = window.setInterval(() => this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3])], { type: this.mimeType }), timeStamp: performance.now() } as BlobEvent), Math.min(80, timeslice));
      }
      stop() {
        if (this.state === "inactive") return;
        this.state = "inactive";
        mock.recorderStops += 1;
        if (this.timer !== null) window.clearInterval(this.timer);
        this.onstop?.(new Event("stop"));
      }
      pause() { this.state = "paused"; }
      resume() { this.state = "recording"; }
      requestData() { /* deterministic timing comes from the interval */ }
    }
    Object.defineProperty(window, "MediaRecorder", { configurable: true, value: Recorder });

    class Context {
      readonly sampleRate = 48_000;
      readonly destination = {} as AudioDestinationNode;
      state: AudioContextState = "suspended";
      async resume() { this.state = "running"; }
      async close() { if (this.state !== "closed") { this.state = "closed"; mock.contextCloses += 1; } }
      createMediaStreamSource() { return { connect: () => undefined, disconnect: () => undefined } as unknown as MediaStreamAudioSourceNode; }
      createAnalyser() {
        let size = 2048;
        return {
          get fftSize() { return size; }, set fftSize(value: number) { size = value; }, smoothingTimeConstant: 0,
          getFloatTimeDomainData(samples: Float32Array) {
            mock.analyserReads += 1;
            for (let index = 0; index < samples.length; index += 1) {
              samples[index] = mock.waveform === "silence" ? 0 : mock.waveform === "clipping" ? (index % 2 ? 1 : -1) : Math.sin(index / 8) * 0.2;
            }
          },
          disconnect: () => undefined,
        } as unknown as AnalyserNode;
      }
      async decodeAudioData(buffer: ArrayBuffer) {
        const bytes = new Uint8Array(buffer);
        if (String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF") throw new DOMException("Unsupported deterministic fixture", "EncodingError");
        const samples = new Float32Array(48_000);
        for (let index = 0; index < samples.length; index += 1) samples[index] = Math.sin(index / 12) * 0.2;
        return { duration: 1, numberOfChannels: 1, sampleRate: 48_000, length: samples.length, getChannelData: () => samples } as unknown as AudioBuffer;
      }
    }
    Object.defineProperty(window, "AudioContext", { configurable: true, value: Context });

    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const url = String(args[0] instanceof Request ? args[0].url : args[0]);
      if (mock.mockComparison && url.includes("/api/deepgram/transcribe-file")) {
        const body = args[1]?.body;
        const fixture = body instanceof FormData ? body.get("file") : null;
        if (fixture instanceof Blob) await fixture.arrayBuffer();
        mock.comparisonRequests += 1;
        const transcript = mock.comparisonRequests === 1 ? "trace the complete signal path" : "trace complete signal path";
        return new Response(JSON.stringify({
          ok: true,
          data: { transcript, raw: { metadata: { request_id: `mock-request-${mock.comparisonRequests}` }, results: { channels: [] } } },
          inspector: { id: `mock-${mock.comparisonRequests}` },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return nativeFetch(...args);
    };

    function device(deviceId: string, label: string): MediaDeviceInfo {
      return { deviceId, label, kind: "audioinput", groupId: "mock-group", toJSON: () => ({ deviceId, label }) } as MediaDeviceInfo;
    }
    function stream(selected: MediaDeviceInfo): MediaStream {
      let stopped = false;
      const track = {
        kind: "audio", id: `track-${selected.deviceId}`, label: selected.label, enabled: true, muted: false, readyState: "live", contentHint: "speech",
        stop: () => { if (!stopped) { stopped = true; mock.trackStops += 1; } },
        getSettings: () => ({ deviceId: selected.deviceId, sampleRate: 48_000, sampleSize: 16, channelCount: 1, echoCancellation: true, noiseSuppression: false, autoGainControl: false }),
        getConstraints: () => ({}), getCapabilities: () => ({}), applyConstraints: async () => undefined,
      } as unknown as MediaStreamTrack;
      return { id: `stream-${selected.deviceId}`, active: true, getTracks: () => [track], getAudioTracks: () => [track], getVideoTracks: () => [] } as unknown as MediaStream;
    }
  });
}

async function state(page: Page) {
  return page.evaluate(() => structuredClone(window.__audioSignalMock));
}

function wavBytes() {
  const buffer = Buffer.alloc(48);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(40, 4);
  buffer.write("WAVEfmt ", 8, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(48_000, 24);
  buffer.writeUInt32LE(96_000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(4, 40);
  return buffer;
}
