"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  FieldLabel,
  MetricTile,
  Panel,
  PanelHeading,
  ProvenanceBadge,
  buttonClassName,
  primaryButtonClassName,
} from "@/components/applied-voice-systems/AcademyPrimitives";
import { downloadQuestlineFile } from "@/components/applied-engineering-questline/QuestlinePrimitives";
import {
  AUDIO_ENGINEERING_LESSONS,
  AUDIO_FAILURE_LESSONS,
  AUDIO_TOPIC_GROUPS,
  LANGUAGE_AUDIO_PATHS,
} from "@/lib/questline/audio-engineering-lessons";
import { createMediaRecorder, isContainerizedMediaRecorderMimeType, selectMediaRecorderMimeType } from "@/lib/live-mic/media-recorder";
import { sanitizeQuestlineExport } from "@/lib/questline/questline-utils";
import type { AudioFailureLesson, AudioLesson } from "@/types/questline";

type LibraryMode = "lessons" | "failures" | "languages";
type FixtureId = "sine" | "silence" | "noise";
type CaptureStatus = "idle" | "requesting" | "measuring" | "stopped" | "error";

type MeterReading = {
  rms: number;
  peak: number;
  clipping: boolean;
  clippingEvents: number;
  provenance: "measured" | "simulated" | "unavailable";
  source: string;
};

type ChunkObservation = {
  id: number;
  atMs: number;
  intervalMs: number | null;
  byteSize: number;
};

type SafeTrackSettings = {
  sampleRate: number | "unavailable";
  sampleSize: number | "unavailable";
  channelCount: number | "unavailable";
  latency: number | "unavailable";
  echoCancellation: boolean | "unavailable";
  noiseSuppression: boolean | "unavailable";
  autoGainControl: boolean | "unavailable";
  device: "browser-managed";
};

const EMPTY_READING: MeterReading = {
  rms: 0,
  peak: 0,
  clipping: false,
  clippingEvents: 0,
  provenance: "unavailable",
  source: "No source active",
};

const EMPTY_SETTINGS: SafeTrackSettings = {
  sampleRate: "unavailable",
  sampleSize: "unavailable",
  channelCount: "unavailable",
  latency: "unavailable",
  echoCancellation: "unavailable",
  noiseSuppression: "unavailable",
  autoGainControl: "unavailable",
  device: "browser-managed",
};

const CLIP_THRESHOLD = 0.98;
const RECORDER_TIMESLICE_MS = 250;

export function AudioEngineeringWorkbench({
  completedLessonIds = [],
  onToggleLesson,
  onSelectedDeviceChange,
}: {
  completedLessonIds?: string[];
  onToggleLesson?: (lessonId: string) => void;
  onSelectedDeviceChange?: (device: { deviceId: string; label: string } | null) => void;
}) {
  const [libraryMode, setLibraryMode] = useState<LibraryMode>("lessons");
  const [selectedLessonId, setSelectedLessonId] = useState(AUDIO_ENGINEERING_LESSONS[0].id);
  const [selectedFailureId, setSelectedFailureId] = useState(AUDIO_FAILURE_LESSONS[0].id);
  const [selectedLanguage, setSelectedLanguage] = useState(LANGUAGE_AUDIO_PATHS[0].language);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [selectedDeviceLabel, setSelectedDeviceLabel] = useState("Browser default microphone");
  const [captureStatus, setCaptureStatus] = useState<CaptureStatus>("idle");
  const [message, setMessage] = useState("Microphone access starts only when you choose Start local mic analysis.");
  const [reading, setReading] = useState<MeterReading>(EMPTY_READING);
  const [trackSettings, setTrackSettings] = useState<SafeTrackSettings>(EMPTY_SETTINGS);
  const [mimeType, setMimeType] = useState("Detected after explicit start");
  const [chunks, setChunks] = useState<ChunkObservation[]>([]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunkStartedAtRef = useRef<number | null>(null);
  const previousChunkAtRef = useRef<number | null>(null);
  const clipWasActiveRef = useRef(false);
  const clipCountRef = useRef(0);
  const lastUiUpdateRef = useRef(0);
  const fixtureContextRef = useRef<AudioContext | null>(null);
  const fixtureSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const selectedLesson = useMemo(
    () => AUDIO_ENGINEERING_LESSONS.find((item) => item.id === selectedLessonId) ?? AUDIO_ENGINEERING_LESSONS[0],
    [selectedLessonId],
  );
  const selectedFailure = useMemo(
    () => AUDIO_FAILURE_LESSONS.find((item) => item.id === selectedFailureId) ?? AUDIO_FAILURE_LESSONS[0],
    [selectedFailureId],
  );
  const languagePath = useMemo(
    () => LANGUAGE_AUDIO_PATHS.find((item) => item.language === selectedLanguage) ?? LANGUAGE_AUDIO_PATHS[0],
    [selectedLanguage],
  );

  const stopFixture = useCallback(() => {
    const source = fixtureSourceRef.current;
    fixtureSourceRef.current = null;
    if (source) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // A completed source cannot be stopped twice.
      }
      source.disconnect();
    }
    const context = fixtureContextRef.current;
    fixtureContextRef.current = null;
    if (context) void context.close().catch(() => undefined);
  }, []);

  const stopMedia = useCallback((updateUi = true) => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onerror = null;
      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // A browser may stop the recorder when its source track ends.
        }
      }
    }

    analyserRef.current?.disconnect();
    analyserRef.current = null;
    sourceNodeRef.current?.disconnect();
    sourceNodeRef.current = null;

    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;

    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context) void context.close().catch(() => undefined);

    clipWasActiveRef.current = false;
    if (updateUi) {
      setCaptureStatus("stopped");
      setMessage("Microphone analysis stopped. All media tracks, nodes, recorder callbacks, and animation frames were released.");
    }
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const next = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "audioinput");
      setDevices(next);
    } catch {
      // Device enumeration is optional; capture can still use the browser default.
    }
  }, []);

  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    const handleDeviceChange = () => void refreshDevices();
    mediaDevices?.addEventListener?.("devicechange", handleDeviceChange);
    return () => mediaDevices?.removeEventListener?.("devicechange", handleDeviceChange);
  }, [refreshDevices]);

  useEffect(() => {
    return () => {
      stopMedia(false);
      stopFixture();
    };
  }, [stopFixture, stopMedia]);

  async function startMicrophoneAnalysis() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCaptureStatus("error");
      setMessage("This browser does not expose getUserMedia microphone capture.");
      return;
    }

    stopFixture();
    stopMedia(false);
    setCaptureStatus("requesting");
    setMessage("Waiting for explicit browser microphone permission…");
    setChunks([]);
    setReading({ ...EMPTY_READING, provenance: "unavailable", source: "Permission pending" });
    setTrackSettings(EMPTY_SETTINGS);
    clipCountRef.current = 0;
    clipWasActiveRef.current = false;

    try {
      const constraints: MediaStreamConstraints = {
        audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true,
        video: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      const track = stream.getAudioTracks()[0];
      if (!track) throw new Error("The selected stream did not contain an audio track.");

      const settings = track.getSettings() as MediaTrackSettings & {
        noiseSuppression?: boolean;
        autoGainControl?: boolean;
        latency?: number;
      };
      setTrackSettings({
        sampleRate: settings.sampleRate ?? "unavailable",
        sampleSize: settings.sampleSize ?? "unavailable",
        channelCount: settings.channelCount ?? "unavailable",
        latency: settings.latency ?? "unavailable",
        echoCancellation: settings.echoCancellation ?? "unavailable",
        noiseSuppression: settings.noiseSuppression ?? "unavailable",
        autoGainControl: settings.autoGainControl ?? "unavailable",
        device: "browser-managed",
      });
      const captureDevice = {
        deviceId: selectedDeviceId || settings.deviceId || "browser-default",
        label: track.label || "Browser default microphone",
      };
      setSelectedDeviceLabel(captureDevice.label);
      onSelectedDeviceChange?.(captureDevice);

      const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) throw new Error("This browser does not expose Web Audio analysis.");
      const audioContext = new AudioContextConstructor();
      await audioContext.resume();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      sourceNodeRef.current = source;
      analyserRef.current = analyser;

      const selection = selectMediaRecorderMimeType();
      if (selection.mediaRecorderSupported) {
        const created = createMediaRecorder(stream, selection);
        const recorder = created.recorder;
        setMimeType(created.mimeType);
        chunkStartedAtRef.current = null;
        previousChunkAtRef.current = null;
        recorder.ondataavailable = (event) => {
          const now = event.timeStamp;
          const startedAt = chunkStartedAtRef.current ?? now;
          chunkStartedAtRef.current = startedAt;
          const atMs = Math.round(now - startedAt);
          const previous = previousChunkAtRef.current;
          previousChunkAtRef.current = now;
          setChunks((current) => [
            ...current.slice(-11),
            { id: atMs, atMs, intervalMs: previous === null ? null : Math.round(now - previous), byteSize: event.data.size },
          ]);
          // event.data is deliberately not retained, read, persisted, or uploaded.
        };
        recorder.onerror = () => setMessage("Waveform analysis continues, but browser chunk timing became unavailable.");
        recorder.start(RECORDER_TIMESLICE_MS);
        recorderRef.current = recorder;
      } else {
        setMimeType("MediaRecorder unavailable; waveform only");
      }

      setCaptureStatus("measuring");
      setMessage("Local analysis is active. Waveform samples and timing metadata stay in memory; chunk Blobs are discarded.");
      startAnalysisLoop(analyser);
      void refreshDevices();
    } catch (error) {
      stopMedia(false);
      setCaptureStatus("error");
      setMessage(error instanceof Error ? error.message : "Microphone analysis could not start.");
    }
  }

  function startAnalysisLoop(analyser: AnalyserNode) {
    const samples = new Float32Array(analyser.fftSize);
    const tick = (now: number) => {
      analyser.getFloatTimeDomainData(samples);
      const next = calculateMeter(samples);
      if (next.clipping && !clipWasActiveRef.current) clipCountRef.current += 1;
      clipWasActiveRef.current = next.clipping;
      drawWaveform(canvasRef.current, samples, next.clipping ? "#fda4af" : "#67e8f9");

      if (now - lastUiUpdateRef.current >= 80) {
        lastUiUpdateRef.current = now;
        setReading({ ...next, clippingEvents: clipCountRef.current, provenance: "measured", source: "Browser microphone" });
      }
      animationFrameRef.current = window.requestAnimationFrame(tick);
    };
    animationFrameRef.current = window.requestAnimationFrame(tick);
  }

  async function runFixture(id: FixtureId) {
    stopMedia(false);
    stopFixture();
    setCaptureStatus("stopped");
    setChunks([]);
    const sampleRate = 48_000;
    const samples = createFixture(id, sampleRate);
    const next = calculateMeter(samples);
    drawWaveform(canvasRef.current, samples, next.clipping ? "#fda4af" : "#c4b5fd");
    setReading({ ...next, clippingEvents: next.clipping ? 1 : 0, provenance: "simulated", source: fixtureLabel(id) });
    setTrackSettings({ ...EMPTY_SETTINGS, sampleRate, channelCount: 1 });
    setMimeType("Local Float32 samples; no container");
    setMessage(`${fixtureLabel(id)} generated locally. No recording, file, network request, or upload was created.`);

    if (id === "silence") return;
    const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    try {
      const context = new AudioContextConstructor({ sampleRate });
      fixtureContextRef.current = context;
      await context.resume();
      const buffer = context.createBuffer(1, samples.length, sampleRate);
      buffer.getChannelData(0).set(samples);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.onended = () => {
        source.disconnect();
        if (fixtureSourceRef.current === source) fixtureSourceRef.current = null;
        if (fixtureContextRef.current === context) fixtureContextRef.current = null;
        void context.close().catch(() => undefined);
      };
      fixtureSourceRef.current = source;
      source.start();
    } catch {
      stopFixture();
      setMessage(`${fixtureLabel(id)} was analyzed locally, but this browser could not play the generated samples.`);
    }
  }

  const micActive = captureStatus === "measuring" || captureStatus === "requesting";

  function downloadAudioReport() {
    const safe = sanitizeQuestlineExport({
      source: reading.source,
      provenance: reading.provenance,
      rms: reading.rms,
      peak: reading.peak,
      clipping: reading.clipping,
      clippingEvents: reading.clippingEvents,
      captureSettings: trackSettings,
      mediaRecorderMime: mimeType,
      chunkTiming: chunks,
      selectedLesson: selectedLesson.title,
      selectedFailure: selectedFailure.title,
      note: "No raw audio, microphone bytes, Authorization, API key, or temporary token is included.",
    });
    const markdown = `# Audio Diagnosis Report\n\n- Source: ${safe.source}\n- Provenance: ${safe.provenance}\n- RMS: ${safe.rms}\n- Peak: ${safe.peak}\n- Clipping: ${safe.clipping}\n- Clip onsets: ${safe.clippingEvents}\n- MediaRecorder MIME: ${safe.mediaRecorderMime}\n\n## Browser capture settings\n\n\`\`\`json\n${JSON.stringify(safe.captureSettings, null, 2)}\n\`\`\`\n\n## Chunk timing metadata\n\n\`\`\`json\n${JSON.stringify(safe.chunkTiming, null, 2)}\n\`\`\`\n\n## Learning context\n\n- Lesson: ${safe.selectedLesson}\n- Failure fixture: ${safe.selectedFailure}\n- ${safe.note}\n`;
    downloadQuestlineFile("audio-diagnosis-report.md", markdown, "text/markdown");
  }

  return (
    <div className="grid h-full min-h-0 min-w-[980px] overflow-hidden bg-[#02060b] [grid-template-columns:230px_minmax(430px,1.35fr)_minmax(310px,.9fr)]">
      <aside className="min-h-0 overflow-y-auto border-r border-white/10 bg-[#040a10] p-2">
        <div className="sticky top-0 z-10 grid grid-cols-3 gap-1 bg-[#040a10] pb-2">
          <LibraryButton active={libraryMode === "lessons"} onClick={() => setLibraryMode("lessons")}>Lessons</LibraryButton>
          <LibraryButton active={libraryMode === "failures"} onClick={() => setLibraryMode("failures")}>Break it</LibraryButton>
          <LibraryButton active={libraryMode === "languages"} onClick={() => setLibraryMode("languages")}>Bytes</LibraryButton>
        </div>

        {libraryMode === "lessons" ? AUDIO_TOPIC_GROUPS.map((group) => (
          <section key={group.id} className="mb-3">
            <p className="mb-1 px-1 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-600">{group.label}</p>
            <div className="space-y-1">
              {AUDIO_ENGINEERING_LESSONS.filter((lesson) => lesson.group === group.id).map((lesson) => (
                <NavItem key={lesson.id} active={lesson.id === selectedLesson.id} complete={completedLessonIds.includes(lesson.id)} onClick={() => setSelectedLessonId(lesson.id)}>
                  {lesson.title}
                </NavItem>
              ))}
            </div>
          </section>
        )) : null}

        {libraryMode === "failures" ? (
          <div className="space-y-1">
            {AUDIO_FAILURE_LESSONS.map((failure) => <NavItem key={failure.id} active={failure.id === selectedFailure.id} onClick={() => setSelectedFailureId(failure.id)}>{failure.title}</NavItem>)}
          </div>
        ) : null}

        {libraryMode === "languages" ? (
          <div className="space-y-1">
            {LANGUAGE_AUDIO_PATHS.map((item) => <NavItem key={item.language} active={item.language === languagePath.language} onClick={() => setSelectedLanguage(item.language)}>{item.label}</NavItem>)}
          </div>
        ) : null}
      </aside>

      <main className="min-h-0 overflow-y-auto p-3">
        <Panel>
          <PanelHeading
            eyebrow="Browser-native · local only"
            title="Audio Signal Workbench"
            detail="Time-domain measurements use normalized float samples. Microphone access is explicit; no audio is uploaded or saved."
            actions={<><ProvenanceBadge value={reading.provenance} /><ProvenanceBadge value="working" /><button type="button" className={buttonClassName} onClick={downloadAudioReport}>Export diagnosis</button></>}
          />
          <div className="space-y-3 p-3">
            <div className="grid items-end gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
              <FieldLabel label="Input device" help="Device labels may remain generic until browser permission is granted.">
                <select
                  value={selectedDeviceId}
                  disabled={micActive}
                  onChange={(event) => {
                    const deviceId = event.target.value;
                    setSelectedDeviceId(deviceId);
                    const device = devices.find((item) => item.deviceId === deviceId);
                    const label = device?.label || "Browser default microphone";
                    setSelectedDeviceLabel(label);
                    onSelectedDeviceChange?.(deviceId ? { deviceId, label } : null);
                  }}
                  className="h-9 w-full rounded-md border border-white/10 bg-[#03080d] px-2 text-[11px] text-slate-200 outline-none focus-visible:border-cyan-300/45 focus-visible:ring-1 focus-visible:ring-cyan-300/20 disabled:opacity-50"
                >
                  <option value="">Browser default microphone</option>
                  {devices.map((device, index) => <option key={device.deviceId || `audio-input-${index}`} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}
                </select>
              </FieldLabel>
              <button type="button" className={primaryButtonClassName} disabled={micActive} onClick={() => void startMicrophoneAnalysis()}>{captureStatus === "requesting" ? "Requesting…" : "Start local mic analysis"}</button>
              <button type="button" className={buttonClassName} disabled={!micActive} onClick={() => stopMedia(true)}>Stop + release</button>
            </div>

            <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2" role="status">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] text-slate-400">{message}</p>
                <span className="font-mono text-[9px] text-slate-600">{selectedDeviceLabel}</span>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-white/10 bg-[#010306]">
              <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">Time-domain waveform</span>
                <span className="font-mono text-[9px] text-slate-600">normalized -1.0 … +1.0</span>
              </div>
              <canvas ref={canvasRef} className="block h-40 w-full" role="img" aria-label={`Time-domain waveform for ${reading.source}`} />
            </div>

            <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
              <MetricTile label="RMS" value={reading.rms.toFixed(4)} provenance={reading.provenance} detail="sqrt(mean(sample²))" />
              <MetricTile label="True window peak" value={reading.peak.toFixed(4)} provenance={reading.provenance} detail="max(abs(sample))" />
              <MetricTile label="Clipping" value={reading.clipping ? "Detected" : "Clear"} provenance={reading.provenance} detail={`threshold ${CLIP_THRESHOLD}`} />
              <MetricTile label="Clip onsets" value={String(reading.clippingEvents)} provenance={reading.provenance} detail="rising threshold crossings" />
            </div>

            <section>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div><p className="text-[10px] font-semibold text-white">Synthetic fixtures</p><p className="text-[9px] text-slate-600">Generated and optionally played only after this click.</p></div>
                <ProvenanceBadge value="local simulation" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button type="button" className={buttonClassName} disabled={micActive} onClick={() => void runFixture("sine")}>Sine · 440 Hz</button>
                <button type="button" className={buttonClassName} disabled={micActive} onClick={() => void runFixture("silence")}>Digital silence</button>
                <button type="button" className={buttonClassName} disabled={micActive} onClick={() => void runFixture("noise")}>Seeded noise</button>
              </div>
            </section>

            <div className="grid gap-3 xl:grid-cols-2">
              <Panel>
                <PanelHeading eyebrow="Measured when mic is active" title="Chunk timing" detail={`MediaRecorder target: ${RECORDER_TIMESLICE_MS} ms. Blob data is immediately discarded.`} />
                <div className="max-h-48 overflow-auto p-2">
                  {chunks.length ? (
                    <div className="space-y-1">
                      {chunks.map((chunk) => (
                        <div key={`${chunk.id}-${chunk.atMs}`} className="grid grid-cols-[52px_1fr_60px] items-center gap-2 rounded bg-white/[0.025] px-2 py-1 font-mono text-[9px] text-slate-500">
                          <span>{chunk.intervalMs === null ? "start" : `${chunk.intervalMs}ms`}</span>
                          <span className="h-1.5 overflow-hidden rounded bg-white/[0.05]"><span className="block h-full rounded bg-cyan-300/50" style={{ width: `${Math.min(100, Math.max(3, (chunk.intervalMs ?? RECORDER_TIMESLICE_MS) / 5))}%` }} /></span>
                          <span className="text-right">{chunk.byteSize} B</span>
                        </div>
                      ))}
                    </div>
                  ) : <p className="p-4 text-center text-[10px] text-slate-600">Start microphone analysis to observe timing metadata. No raw chunks are retained.</p>}
                </div>
              </Panel>

              <Panel>
                <PanelHeading eyebrow="Browser-reported" title="Capture settings" detail="Requested constraints are not proof; getSettings() reports what the active track exposes." />
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 p-3 text-[9px]">
                  {Object.entries(trackSettings).map(([key, value]) => <div key={key} className="contents"><dt className="text-slate-600">{key}</dt><dd className="truncate text-right font-mono text-slate-300">{String(value)}</dd></div>)}
                  <div className="contents"><dt className="text-slate-600">MediaRecorder MIME</dt><dd className="text-right font-mono text-slate-300">{mimeType}</dd></div>
                </dl>
                <p className="border-t border-white/10 px-3 py-2 text-[9px] leading-4 text-slate-500">{formatGuidance(mimeType)}</p>
              </Panel>
            </div>
          </div>
        </Panel>
      </main>

      <aside className="min-h-0 overflow-y-auto border-l border-white/10 bg-[#040910] p-3">
        {libraryMode === "lessons" ? <LessonDetail lesson={selectedLesson} completed={completedLessonIds.includes(selectedLesson.id)} onToggle={onToggleLesson} /> : null}
        {libraryMode === "failures" ? <FailureDetail failure={selectedFailure} /> : null}
        {libraryMode === "languages" ? <LanguageDetail path={languagePath} /> : null}
      </aside>
    </div>
  );
}

function LessonDetail({ lesson, completed, onToggle }: { lesson: AudioLesson; completed: boolean; onToggle?: (lessonId: string) => void }) {
  return (
    <div className="space-y-3">
      <div><div className="flex items-center gap-2"><ProvenanceBadge value={lesson.status} />{completed ? <ProvenanceBadge value="working" /> : null}</div><h3 className="mt-2 text-base font-semibold text-white">{lesson.title}</h3><p className="mt-2 text-[11px] leading-5 text-slate-400">{lesson.concept}</p></div>
      <DetailBlock title="What it sounds like" text={lesson.soundsLike} />
      <DetailBlock title="What it looks like" text={lesson.looksLike} />
      <DetailBlock title="What the bytes mean" text={lesson.bytesMean} mono />
      <DetailBlock title="What Deepgram receives" text={lesson.deepgramReceives} />
      <DetailBlock title="Visible symptom" text={lesson.symptom} />
      <ListBlock title="How an engineer diagnoses it" items={lesson.diagnosis} />
      {onToggle ? <button type="button" className={completed ? buttonClassName : primaryButtonClassName} onClick={() => onToggle(lesson.id)}>{completed ? "Mark needs review" : "Mark lesson practiced"}</button> : null}
    </div>
  );
}

function FailureDetail({ failure }: { failure: AudioFailureLesson }) {
  return (
    <div className="space-y-3">
      <div><ProvenanceBadge value="simulated" /><h3 className="mt-2 text-base font-semibold text-white">Break it: {failure.title}</h3><p className="mt-2 text-[11px] leading-5 text-slate-400">This deterministic lesson mutates the system model only. It does not alter or upload live audio.</p></div>
      <DetailBlock title="User-visible symptom" text={failure.visibleSymptom} />
      <DetailBlock title="Byte-level cause" text={failure.byteLevelCause} mono />
      <DetailBlock title="Likely recognition symptom" text={failure.deepgramSymptom} />
      <ListBlock title="Evidence to inspect" items={failure.evidence} />
      <ListBlock title="Correction" items={failure.correction} />
    </div>
  );
}

function LanguageDetail({ path }: { path: (typeof LANGUAGE_AUDIO_PATHS)[number] }) {
  return (
    <div className="space-y-3">
      <div><ProvenanceBadge value={path.status} /><h3 className="mt-2 text-base font-semibold text-white">Audio bytes in {path.label}</h3><p className="mt-2 text-[11px] leading-5 text-slate-400">Different constructs, same system problem: own the bytes, pace them, send them in order, and release every resource.</p></div>
      <DetailBlock title="Memory shape" text={path.memoryShape} />
      <DetailBlock title="Ingress" text={path.ingress} />
      <DetailBlock title="Chunking" text={path.chunking} />
      <DetailBlock title="Transport" text={path.transport} />
      <DetailBlock title="Cleanup" text={path.cleanup} />
      <DetailBlock title="Code concept" text={path.codeConcept} mono />
      <DetailBlock title="Failure risk" text={path.failureRisk} />
    </div>
  );
}

function LibraryButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return <button type="button" onClick={onClick} className={`rounded px-1 py-1.5 text-[9px] font-bold uppercase tracking-wide focus-visible:outline-2 focus-visible:outline-cyan-200 ${active ? "bg-cyan-200 text-slate-950" : "border border-white/10 text-slate-500 hover:text-white"}`}>{children}</button>;
}

function NavItem({ active, complete = false, onClick, children }: { active: boolean; complete?: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} className={`flex min-h-9 w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[10px] leading-4 transition focus-visible:outline-2 focus-visible:outline-cyan-200 ${active ? "border-cyan-300/30 bg-cyan-300/[0.08] text-cyan-50" : "border-transparent text-slate-500 hover:border-white/10 hover:text-white"}`}>
      <span className={`size-1.5 shrink-0 rounded-full ${complete ? "bg-emerald-300" : active ? "bg-cyan-300" : "bg-slate-800"}`} />
      <span>{children}</span>
    </button>
  );
}

function DetailBlock({ title, text, mono = false }: { title: string; text: string; mono?: boolean }) {
  return <section className="rounded-lg border border-white/[0.08] bg-black/20 p-2.5"><h4 className="text-[9px] font-bold uppercase tracking-[0.13em] text-slate-600">{title}</h4><p className={`mt-1.5 text-[10px] leading-4 text-slate-300 ${mono ? "font-mono" : ""}`}>{text}</p></section>;
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return <section className="rounded-lg border border-white/[0.08] bg-black/20 p-2.5"><h4 className="text-[9px] font-bold uppercase tracking-[0.13em] text-slate-600">{title}</h4><ul className="mt-2 space-y-1.5 text-[10px] leading-4 text-slate-300">{items.map((item) => <li key={item} className="flex gap-2"><span className="text-cyan-300/60">→</span><span>{item}</span></li>)}</ul></section>;
}

function calculateMeter(samples: Float32Array): Pick<MeterReading, "rms" | "peak" | "clipping"> {
  let sumSquares = 0;
  let peak = 0;
  for (const sample of samples) {
    const magnitude = Math.abs(sample);
    sumSquares += sample * sample;
    if (magnitude > peak) peak = magnitude;
  }
  return { rms: samples.length ? Math.sqrt(sumSquares / samples.length) : 0, peak, clipping: peak >= CLIP_THRESHOLD };
}

function createFixture(id: FixtureId, sampleRate: number): Float32Array {
  const samples = new Float32Array(sampleRate);
  if (id === "silence") return samples;
  if (id === "sine") {
    for (let index = 0; index < samples.length; index += 1) samples[index] = 0.28 * Math.sin((2 * Math.PI * 440 * index) / sampleRate);
    return samples;
  }
  let seed = 0x5eed1234;
  for (let index = 0; index < samples.length; index += 1) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    samples[index] = (((seed >>> 0) / 0xffffffff) * 2 - 1) * 0.09;
  }
  return samples;
}

function fixtureLabel(id: FixtureId) {
  if (id === "sine") return "440 Hz sine fixture";
  if (id === "silence") return "digital silence fixture";
  return "deterministic low-level noise fixture";
}

function formatGuidance(mimeType: string) {
  if (isContainerizedMediaRecorderMimeType(mimeType)) {
    return "Deepgram handoff: this is containerized browser audio. Forward the actual MIME type and do not pretend these bytes are raw PCM with invented encoding/sample-rate parameters.";
  }
  if (mimeType === "Local Float32 samples; no container") {
    return "Local fixture only: Float32 samples are used for analysis/playback here and are never sent to Deepgram.";
  }
  return "Deepgram handoff: inspect the actual format before choosing request metadata. This workbench never sends audio.";
}

function drawWaveform(canvas: HTMLCanvasElement | null, samples: Float32Array, color: string) {
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  const bounds = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(bounds.width * ratio));
  const height = Math.max(1, Math.floor(bounds.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#010306";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "rgba(148,163,184,.12)";
  context.lineWidth = 1;
  for (const position of [0.25, 0.5, 0.75]) {
    context.beginPath();
    context.moveTo(0, height * position);
    context.lineTo(width, height * position);
    context.stroke();
  }
  context.strokeStyle = color;
  context.lineWidth = Math.max(1, ratio);
  context.beginPath();
  const stride = Math.max(1, Math.floor(samples.length / width));
  const visibleCount = Math.ceil(samples.length / stride);
  let visibleIndex = 0;
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += stride) {
    const x = visibleCount <= 1 ? 0 : (visibleIndex / (visibleCount - 1)) * width;
    const y = (0.5 - samples[sampleIndex] * 0.46) * height;
    if (visibleIndex === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
    visibleIndex += 1;
  }
  context.stroke();
}
