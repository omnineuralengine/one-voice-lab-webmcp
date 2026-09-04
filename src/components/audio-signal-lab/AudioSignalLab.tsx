"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PayloadInspector } from "@/components/PayloadInspector";
import { ShortcutHint } from "@/components/keyboard-shortcuts/KeyboardShortcutController";
import { useLiveObservatory } from "@/context/live-observatory-context";
import {
  AUDIO_FIXTURES,
  AUDIO_ISSUE_SCENARIOS,
  AUDIO_SIGNAL_SAMPLE_RATE,
  AUDIO_VARIANTS,
  DAW_TO_VOICE_AI,
  SIGNAL_FLOW_STAGES,
  analyzeAudioSignal,
  createAudioFixture,
  createAudioVariant,
  diagnoseAudioSignal,
  effectiveDeepgramAudioConfig,
  encodeWav,
  inspectAudioBytes,
  transcriptDiff,
  wordErrorRate,
} from "@/lib/audio-signal-lab";
import type { LabModuleId } from "@/lib/code-snippets";
import { getSampleAudioPath, SAMPLE_AUDIO_SCENARIOS } from "@/lib/sample-scenarios";
import { buildInspectorRecord, createTimelineEvent, redactSecrets, type ApiDebugEnvelope, type InspectorRecord } from "@/lib/inspection";
import { createMediaRecorder, selectMediaRecorderMimeType } from "@/lib/live-mic/media-recorder";
import { extractDeepgramRequestId } from "@/lib/deepgram-samples";
import type { TranscriptionResponse } from "@/lib/types";
import type {
  AudioComparisonResult,
  AudioFixtureId,
  AudioFormatMetadata,
  AudioSignalMetrics,
  AudioSignalSourceKind,
  AudioVariant,
  AudioVariantId,
} from "@/types/audio-signal-lab";

type RightPanel = "diagnosis" | "format" | "pipeline" | "daw" | "experiment" | "lessons" | "inspector";
type CaptureState = "idle" | "requesting" | "analyzing" | "stopped" | "error";
type ChunkPoint = { id: number; atMs: number; intervalMs: number | null; bytes: number };

const EMPTY_METRICS: AudioSignalMetrics = {
  rms: 0,
  peak: 0,
  dbfs: null,
  clipping: false,
  clippingEvents: 0,
  silencePercentage: 100,
  signalPresent: false,
  elapsedMs: 0,
  spectrum: { low: 0, speech: 0, high: 0, dominantFrequencyHz: null, dominantBand: "unavailable", provenance: "unavailable" },
  provenance: "unavailable",
};

const PRESENTER_STEPS = [
  "Select the Focusrite input if it is available; never change hardware gain from software.",
  "Start local analysis and speak at a comfortable level.",
  "Show waveform, RMS, peak, browser sample rate, and selected device.",
  "Briefly compare the safe synthetic clipped fixture instead of producing excessive acoustic level.",
  "Explain why flattened peaks can masquerade as a model problem.",
  "Inspect the actual MediaRecorder container/MIME and the effective Deepgram audio configuration.",
  "Open Live Mic configured for Italian or English.",
  "Run one separately confirmed short transcription, then stop.",
  "Open Observatory and show aggregated audio events beside the actual STT event.",
  "Explain how an audio-layer issue can masquerade as a model-layer issue.",
];

export function AudioSignalLab({
  handoffFile,
  onHandoffConsumed,
  onOpenModule,
  onOpenCodeLab,
  onOpenQuestline,
  openLabMode = false,
}: {
  handoffFile: File | null;
  onHandoffConsumed: () => void;
  onOpenModule: (module: LabModuleId) => void;
  onOpenCodeLab: () => void;
  onOpenQuestline: () => void;
  openLabMode?: boolean;
}) {
  const observatory = useLiveObservatory();
  const [sourceKind, setSourceKind] = useState<AudioSignalSourceKind>("fixture");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [selectedDevice, setSelectedDevice] = useState("Browser default microphone");
  const [captureState, setCaptureState] = useState<CaptureState>("idle");
  const [message, setMessage] = useState("No microphone permission is requested until Start local analysis is pressed.");
  const [metrics, setMetrics] = useState<AudioSignalMetrics>(EMPTY_METRICS);
  const [originalMetrics, setOriginalMetrics] = useState<AudioSignalMetrics>(EMPTY_METRICS);
  const [format, setFormat] = useState<AudioFormatMetadata | null>(null);
  const [trackSettings, setTrackSettings] = useState<Record<string, unknown>>({ state: "Unavailable until explicit microphone start" });
  const [recorderMime, setRecorderMime] = useState("Unavailable until explicit microphone start");
  const [chunks, setChunks] = useState<ChunkPoint[]>([]);
  const [rightPanel, setRightPanel] = useState<RightPanel>("diagnosis");
  const [selectedFlowId, setSelectedFlowId] = useState("source");
  const [selectedScenarioId, setSelectedScenarioId] = useState("flattened");
  const [presenterMode, setPresenterMode] = useState(false);
  const [originalSamples, setOriginalSamples] = useState<Float32Array | null>(null);
  const [originalBlob, setOriginalBlob] = useState<Blob | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<AudioVariantId>("digital-clipping");
  const [variant, setVariant] = useState<AudioVariant | null>(null);
  const [variantBlob, setVariantBlob] = useState<Blob | null>(null);
  const [variantUrl, setVariantUrl] = useState<string | null>(null);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [comparisonRunning, setComparisonRunning] = useState(false);
  const [comparison, setComparison] = useState<{ a: AudioComparisonResult; b: AudioComparisonResult } | null>(null);
  const [model, setModel] = useState("nova-3");
  const [language, setLanguage] = useState("en");
  const [referenceText, setReferenceText] = useState("");
  const [referenceConfirmed, setReferenceConfirmed] = useState(false);
  const [keywords, setKeywords] = useState("");
  const [conclusion, setConclusion] = useState({ hypothesis: "", observation: "", audio: "", transcription: "", evidence: "", limitation: "", next: "" });
  const [rawEncoding, setRawEncoding] = useState("");
  const [rawSampleRate, setRawSampleRate] = useState("");
  const [rawChannels, setRawChannels] = useState("");

  const waveformRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderBlobsRef = useRef<Blob[]>([]);
  const animationRef = useRef<number | null>(null);
  const captureStartedRef = useRef(0);
  const previousChunkAtRef = useRef<number | null>(null);
  const lastUiRef = useRef(0);
  const silentFramesRef = useRef(0);
  const totalFramesRef = useRef(0);
  const clipReportedRef = useRef(false);
  const clipCountRef = useRef(0);
  const clipWasActiveRef = useRef(false);
  const silenceReportedRef = useRef(false);

  const diagnosis = useMemo(() => diagnoseAudioSignal(metrics, variant?.label ?? format?.filename ?? sourceKind, Boolean(format && format.dataKind !== "containerized")), [format, metrics, sourceKind, variant?.label]);
  const variantMetrics = useMemo(() => variant ? analyzeAudioSignal(variant.samples, variant.sampleRate, "derived") : null, [variant]);
  const deepgramConfig = useMemo(() => format ? effectiveDeepgramAudioConfig(format, {
    encoding: rawEncoding || undefined,
    sampleRate: Number(rawSampleRate) || undefined,
    channels: Number(rawChannels) || undefined,
  }) : null, [format, rawChannels, rawEncoding, rawSampleRate]);
  const selectedFlow = SIGNAL_FLOW_STAGES.find((stage) => stage.id === selectedFlowId) ?? SIGNAL_FLOW_STAGES[0];
  const selectedScenario = AUDIO_ISSUE_SCENARIOS.find((scenario) => scenario[0] === selectedScenarioId) ?? AUDIO_ISSUE_SCENARIOS[0];
  const comparisonA = comparison?.a ?? null;
  const comparisonB = comparison?.b ?? null;
  const diff = useMemo(() => comparison ? transcriptDiff(comparison.a.transcript, comparison.b.transcript) : [], [comparison]);
  const werA = useMemo(() => referenceConfirmed && referenceText.trim() && comparisonA ? wordErrorRate(referenceText, comparisonA.transcript) : null, [comparisonA, referenceConfirmed, referenceText]);
  const werB = useMemo(() => referenceConfirmed && referenceText.trim() && comparisonB ? wordErrorRate(referenceText, comparisonB.transcript) : null, [comparisonB, referenceConfirmed, referenceText]);
  const keywordList = useMemo(() => keywords.split(",").map((item) => item.trim()).filter(Boolean), [keywords]);
  const browserReportedSettings = trackSettings.browserReportedSettings && typeof trackSettings.browserReportedSettings === "object" ? trackSettings.browserReportedSettings as MediaTrackSettings : null;
  const captureActive = captureState === "requesting" || captureState === "analyzing";
  const chunkStats = useMemo(() => {
    const intervals = chunks.map((chunk) => chunk.intervalMs).filter((value): value is number => value !== null);
    if (!intervals.length) return { average: null, variation: null };
    const average = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
    const variation = Math.sqrt(intervals.reduce((sum, value) => sum + (value - average) ** 2, 0) / intervals.length);
    return { average, variation };
  }, [chunks]);

  const refreshDevices = useCallback(async () => {
    try {
      const next = await navigator.mediaDevices?.enumerateDevices?.();
      setDevices((next ?? []).filter((device) => device.kind === "audioinput"));
    } catch {
      setDevices([]);
    }
  }, []);

  const releaseCapture = useCallback((updateUi: boolean) => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state !== "inactive") try { recorder.stop(); } catch { /* Browser already stopped it. */ }
    }
    analyserRef.current?.disconnect(); analyserRef.current = null;
    sourceNodeRef.current?.disconnect(); sourceNodeRef.current = null;
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    const context = audioContextRef.current; audioContextRef.current = null;
    if (context) void context.close().catch(() => undefined);
    recorderBlobsRef.current = [];
    if (updateUi) {
      setCaptureState("stopped");
      setMessage("Capture stopped. Media tracks, recorder, audio nodes, and animation frames were released.");
    }
  }, []);

  useEffect(() => {
    const media = navigator.mediaDevices;
    const listener = () => void refreshDevices();
    media?.addEventListener?.("devicechange", listener);
    return () => media?.removeEventListener?.("devicechange", listener);
  }, [refreshDevices]);

  useEffect(() => () => {
    releaseCapture(false);
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    if (variantUrl) URL.revokeObjectURL(variantUrl);
  }, [originalUrl, releaseCapture, variantUrl]);

  async function startMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCaptureState("error");
      setMessage("This browser does not expose microphone capture.");
      return;
    }
    releaseCapture(false);
    clearFixture();
    setSourceKind("microphone");
    setCaptureState("requesting");
    setMessage("Waiting for explicit browser microphone permission…");
    setChunks([]);
    recorderBlobsRef.current = [];
    silentFramesRef.current = 0; totalFramesRef.current = 0; clipReportedRef.current = false; clipCountRef.current = 0; clipWasActiveRef.current = false; silenceReportedRef.current = false;
    observatory.beginRun({ mode: "live", presetId: "audio-signal-lab", operation: "Local microphone signal analysis", settings: { deepgramRequests: 0, selectedDevice: deviceId ? "explicit-device-selection" : "browser-default" } });
    try {
      const constraints: MediaStreamConstraints = { video: false, audio: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), echoCancellation: true, noiseSuppression: false, autoGainControl: false } };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      const track = stream.getAudioTracks()[0];
      if (!track) throw new Error("The selected stream did not contain an audio track.");
      const settings = track.getSettings();
      const label = track.label || devices.find((device) => device.deviceId === settings.deviceId)?.label || "Browser default microphone";
      setSelectedDevice(label);
      setTrackSettings({ selectedDevice: label, requestedConstraints: constraints.audio, browserReportedSettings: settings });
      const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error("This browser does not expose Web Audio analysis.");
      const context = new Ctor();
      await context.resume();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.25;
      source.connect(analyser);
      audioContextRef.current = context; sourceNodeRef.current = source; analyserRef.current = analyser;
      const selection = selectMediaRecorderMimeType();
      if (selection.mediaRecorderSupported) {
        const created = createMediaRecorder(stream, selection);
        const recorder = created.recorder;
        setRecorderMime(created.mimeType);
        recorder.ondataavailable = (event) => {
          if (event.data.size) recorderBlobsRef.current.push(event.data);
          const now = performance.now();
          const interval = previousChunkAtRef.current === null ? null : now - previousChunkAtRef.current;
          previousChunkAtRef.current = now;
          setChunks((current) => [...current.slice(-19), { id: current.length + 1, atMs: now - captureStartedRef.current, intervalMs: interval, bytes: event.data.size }]);
        };
        recorder.onerror = () => setMessage("Signal analysis continues, but MediaRecorder chunk timing became unavailable.");
        recorder.start(250);
        recorderRef.current = recorder;
      } else setRecorderMime("MediaRecorder unavailable; analysis only");
      captureStartedRef.current = 0;
      previousChunkAtRef.current = null;
      setCaptureState("analyzing");
      setMessage("Local analysis active. The microphone is not connected to speakers or Deepgram.");
      observatory.addEvent({ eventType: "audio.capture.started", source: "browser", stage: "audio-ingress", provenance: "measured", payload: { device: "selected input label retained only in Audio Signal Lab", settings: { sampleRate: settings.sampleRate, channelCount: settings.channelCount, sampleSize: settings.sampleSize, echoCancellation: settings.echoCancellation, noiseSuppression: settings.noiseSuppression, autoGainControl: settings.autoGainControl }, recorderMime: selection.mimeType || "unavailable" } });
      startAnalysis(analyser, context.sampleRate);
      void refreshDevices();
    } catch (error) {
      releaseCapture(false);
      setCaptureState("error");
      setMessage(error instanceof Error ? error.message : "Microphone analysis failed.");
    }
  }

  function startAnalysis(analyser: AnalyserNode, sampleRate: number) {
    const samples = new Float32Array(analyser.fftSize);
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const updateInterval = reducedMotion ? 240 : 90;
    const tick = (now: number) => {
      if (captureStartedRef.current === 0) captureStartedRef.current = now;
      analyser.getFloatTimeDomainData(samples);
      if (now - lastUiRef.current >= updateInterval) {
        lastUiRef.current = now;
        const next = analyzeAudioSignal(samples, sampleRate, "measured");
        totalFramesRef.current += 1;
        if (next.silencePercentage >= 80) silentFramesRef.current += 1;
        if (next.clipping && !clipWasActiveRef.current) clipCountRef.current += 1;
        clipWasActiveRef.current = next.clipping;
        const aggregate = { ...next, clippingEvents: clipCountRef.current, elapsedMs: now - captureStartedRef.current, silencePercentage: (silentFramesRef.current / totalFramesRef.current) * 100 };
        setMetrics(aggregate);
        setOriginalMetrics(aggregate);
        drawWaveform(waveformRef.current, samples, aggregate.clipping);
        if (aggregate.clipping && !clipReportedRef.current) {
          clipReportedRef.current = true;
          observatory.addEvent({ eventType: "audio.clipping.detected", source: "browser", stage: "audio-ingress", provenance: "measured", severity: "warning", payload: { peak: aggregate.peak, threshold: 0.98 } });
        }
        if (aggregate.elapsedMs >= 2000 && aggregate.silencePercentage >= 85 && !silenceReportedRef.current) {
          silenceReportedRef.current = true;
          observatory.addEvent({ eventType: "audio.silence.detected", source: "browser", stage: "audio-ingress", provenance: "derived", severity: "warning", payload: { silencePercentage: aggregate.silencePercentage, localHeuristic: true } });
        }
      }
      animationRef.current = requestAnimationFrame(tick);
    };
    animationRef.current = requestAnimationFrame(tick);
  }

  async function stopMicrophone() {
    if (!captureActive) return;
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        try { recorder.stop(); } catch { resolve(); }
      });
    }
    const recorded = recorderBlobsRef.current.length ? new Blob(recorderBlobsRef.current, { type: recorderMime.includes("unavailable") ? "application/octet-stream" : recorderMime }) : null;
    analyserRef.current?.disconnect(); analyserRef.current = null;
    sourceNodeRef.current?.disconnect(); sourceNodeRef.current = null;
    for (const track of streamRef.current?.getTracks() ?? []) track.stop(); streamRef.current = null;
    const context = audioContextRef.current; audioContextRef.current = null; if (context) await context.close().catch(() => undefined);
    setCaptureState("stopped");
    observatory.addEvent({ eventType: "audio.capture.stopped", source: "browser", stage: "audio-ingress", provenance: "measured", payload: { elapsedMs: metrics.elapsedMs, chunks: chunks.length } });
    observatory.addEvent({ eventType: "audio.level.summary", source: "browser", stage: "audio-ingress", provenance: "derived", payload: { rms: metrics.rms, peak: metrics.peak, dbfs: metrics.dbfs, clippingEvents: metrics.clippingEvents, silencePercentage: metrics.silencePercentage } });
    observatory.updateRun({ status: "completed", completedAt: new Date().toISOString(), metrics: [
      { id: "rms", label: "Browser RMS", value: metrics.rms.toFixed(4), provenance: "measured", definition: "RMS over recent browser time-domain frames." },
      { id: "peak", label: "Browser peak", value: metrics.peak.toFixed(4), provenance: "measured", definition: "Peak over recent browser time-domain frames." },
      { id: "chunks", label: "Recorder chunks", value: String(chunks.length), provenance: "measured", definition: "MediaRecorder dataavailable events; audio bytes are not stored in Observatory." },
    ], notes: ["No Deepgram request occurred.", "Raw microphone audio is not stored in Observatory or localStorage."] });
    if (recorded) await loadBlobFixture(recorded, "microphone-capture.webm", recorded.type, "microphone");
    setMessage(recorded ? "Capture stopped. All media resources were released; recording metadata and any decodable fixture remain in memory only until reset or navigation." : "Capture stopped. All media resources were released; no decodable fixture was retained.");
  }

  async function loadFixture(id: AudioFixtureId) {
    releaseCapture(false);
    setSourceKind("fixture");
    const samples = createAudioFixture(id);
    const blob = encodeWav(samples, AUDIO_SIGNAL_SAMPLE_RATE);
    await commitFixture(samples, AUDIO_SIGNAL_SAMPLE_RATE, blob, `${id}.wav`, "audio/wav", "fixture");
    setMessage(`${AUDIO_FIXTURES.find((item) => item.id === id)?.label} generated locally. No Deepgram request occurred.`);
    observatory.beginRun({ mode: "synthetic", presetId: "audio-signal-lab", operation: "Local generated audio fixture", settings: { fixture: id, deepgramRequests: 0 } });
    observatory.addEvent({ eventType: "audio.fixture.created", source: "synthetic-fixture", stage: "audio-ingress", provenance: "simulated", payload: { fixture: id, sampleRate: AUDIO_SIGNAL_SAMPLE_RATE, durationSeconds: samples.length / AUDIO_SIGNAL_SAMPLE_RATE } });
    observatory.updateRun({ status: "completed", completedAt: new Date().toISOString(), notes: ["Fixture generated in memory; no network or Deepgram request occurred."] });
  }

  async function handleUpload(file: File | null) {
    if (!file) return;
    releaseCapture(false);
    setSourceKind("upload");
    await loadBlobFixture(file, file.name, file.type, "upload");
  }

  async function loadSample(slug: string) {
    releaseCapture(false);
    setSourceKind("sample-library");
    try {
      const response = await fetch(getSampleAudioPath(slug), { cache: "no-store" });
      if (!response.ok) throw new Error("The local sample file is not generated yet.");
      const blob = await response.blob();
      await loadBlobFixture(blob, `${slug}.mp3`, blob.type || "audio/mpeg", "sample-library");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Local sample could not be loaded.");
    }
  }

  async function loadBlobFixture(blob: Blob, filename: string, mimeType: string, sourceType: AudioSignalSourceKind) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let decoded: AudioBuffer | null = null;
    try {
      const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) {
        const context = new Ctor();
        decoded = await context.decodeAudioData(bytes.buffer.slice(0));
        await context.close();
      }
    } catch { decoded = null; }
    const metadata = inspectAudioBytes({ filename, mimeType, bytes, byteSize: blob.size, sourceType, decoded: decoded ? { durationSeconds: decoded.duration, channelCount: decoded.numberOfChannels, sampleRate: decoded.sampleRate } : undefined });
    setFormat({ ...metadata, browserDecoding: decoded ? "supported" : "unsupported" });
    observatory.beginRun({ mode: "synthetic", presetId: "audio-signal-lab", operation: "Local audio format inspection", settings: { sourceType, mimeType: metadata.mimeType, deepgramRequests: 0 } });
    observatory.addEvent({ eventType: "audio.format.inspected", source: "browser", stage: "audio-ingress", provenance: "measured", payload: { ...metadata, filename: "[local filename omitted]" } });
    observatory.updateRun({ status: "completed", completedAt: new Date().toISOString(), notes: ["Only sanitized metadata entered Observatory; raw audio was excluded."] });
    if (!decoded) {
      clearFixture();
      setFormat({ ...metadata, browserDecoding: "unsupported" });
      setMetrics(EMPTY_METRICS);
      setMessage("Format metadata was inspected, but this browser could not decode the audio for local waveform analysis.");
      setRightPanel("format");
      return;
    }
    const samples = downmix(decoded);
    await commitFixture(samples, decoded.sampleRate, blob, filename, mimeType, sourceType, metadata);
    setMessage(`${filename} loaded into memory for local analysis. It has not been submitted to Deepgram.`);
  }

  async function commitFixture(samples: Float32Array, sampleRate: number, blob: Blob, filename: string, mimeType: string, sourceType: AudioSignalSourceKind, existingMetadata?: AudioFormatMetadata) {
    clearFixture();
    const copied = new Float32Array(samples);
    const nextMetrics = analyzeAudioSignal(copied, sampleRate, sourceType === "fixture" ? "simulated" : "derived");
    const url = URL.createObjectURL(blob);
    setOriginalSamples(copied); setOriginalBlob(blob); setOriginalUrl(url); setOriginalMetrics(nextMetrics); setMetrics(nextMetrics);
    setVariant(null); setVariantBlob(null); setVariantUrl(null);
    drawWaveform(waveformRef.current, copied.subarray(0, Math.min(copied.length, 8192)), nextMetrics.clipping);
    if (existingMetadata) setFormat(existingMetadata);
    else {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      setFormat(inspectAudioBytes({ filename, mimeType, bytes, sourceType, decoded: { durationSeconds: copied.length / sampleRate, channelCount: 1, sampleRate } }));
    }
  }

  function clearFixture() {
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    if (variantUrl) URL.revokeObjectURL(variantUrl);
    setOriginalSamples(null); setOriginalBlob(null); setOriginalUrl(null); setVariant(null); setVariantBlob(null); setVariantUrl(null);
  }

  async function buildVariant() {
    if (!originalSamples || !format?.sampleRate) {
      setMessage("Load, record, or generate a decodable fixture before creating a variant.");
      return;
    }
    const next = createAudioVariant(originalSamples, format.sampleRate, selectedVariantId);
    const blob = encodeWav(next.samples, next.sampleRate);
    if (variantUrl) URL.revokeObjectURL(variantUrl);
    setVariant(next); setVariantBlob(blob); setVariantUrl(URL.createObjectURL(blob));
    const nextMetrics = analyzeAudioSignal(next.samples, next.sampleRate, "derived");
    setMetrics(nextMetrics);
    drawWaveform(waveformRef.current, next.samples.subarray(0, Math.min(next.samples.length, 8192)), nextMetrics.clipping);
    setMessage(`${next.label} created from a copied offline buffer. The original remains unchanged; no Deepgram request occurred.`);
    observatory.beginRun({ mode: "synthetic", presetId: "audio-signal-lab", operation: "Offline audio variant", settings: { variant: next.id, deepgramRequests: 0 } });
    observatory.addEvent({ eventType: "audio.variant.created", source: "local-tool", stage: "audio-ingress", provenance: "derived", payload: { variant: next.id, changes: next.changes, originalPreserved: true } });
    observatory.updateRun({ status: "completed", completedAt: new Date().toISOString(), notes: ["Offline copied buffer only; no Deepgram request occurred."] });
  }

  function resetLab() {
    releaseCapture(false);
    clearFixture();
    setMetrics(EMPTY_METRICS); setOriginalMetrics(EMPTY_METRICS); setFormat(null); setChunks([]); setComparison(null); setPresenterMode(false);
    setCaptureState("idle"); setRecorderMime("Unavailable until explicit microphone start"); setTrackSettings({ state: "Unavailable until explicit microphone start" });
    setMessage("Lab reset. No raw audio or fixture remains in memory.");
  }

  function openPresenterPreset() {
    setPresenterMode(true);
    setRightPanel("diagnosis");
    void loadFixture("clipped-tone");
  }

  async function runComparison() {
    if (!originalBlob || !variantBlob || !variant) return;
    setComparisonRunning(true);
    setComparison(null);
    observatory.beginRun({ mode: "live", presetId: "compare-configs", operation: "Audio Signal Lab original-versus-variant comparison", settings: { model, language, requests: 2, variant: variant.id } });
    observatory.addEvent({ eventType: "audio.experiment.started", source: "browser", stage: "audio-ingress", provenance: "human-rated", payload: { model, language, variant: variant.id, billableRequests: 2 } });
    try {
      const a = await transcribeFixture(originalBlob, "original.wav", model, language);
      const b = await transcribeFixture(variantBlob, `${variant.id}.wav`, model, language);
      // Results are committed only after both sequential requests succeed.
      setComparison({ a, b });
      setMessage("Guarded comparison completed with two sequential STT requests.");
      setComparisonOpen(false);
      queueMicrotask(() => {
        observatory.addEvent({ eventType: "audio.experiment.completed", source: "deepgram-stt", stage: "stt", provenance: "measured", payload: { requestIds: [a.requestId, b.requestId].filter(Boolean), durationMs: [a.durationMs, b.durationMs], variant: variant.id } });
        observatory.updateRun({ status: "completed", completedAt: new Date().toISOString(), sessionRequestCount: 2, activeRequestCount: 0, requestIds: [a.requestId, b.requestId].filter((value): value is string => Boolean(value)), transcript: a.transcript, comparisonTranscript: b.transcript, costState: "Unavailable", notes: ["Two sequential prerecorded STT requests were explicitly confirmed.", "WER remains unavailable unless reference text is supplied and confirmed."] });
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : "Comparison failed.";
      observatory.addEvent({ eventType: "audio.experiment.completed", source: "local-server", stage: "outcome", provenance: "measured", severity: "error", payload: { error: text } });
      observatory.updateRun({ status: "error", completedAt: new Date().toISOString(), activeRequestCount: 0, error: text });
      setMessage(text);
    } finally { setComparisonRunning(false); }
  }

  function exportSummary() {
    const safe = redactSecrets({ sourceKind, selectedDevice, metrics, format, variant: variant ? { id: variant.id, label: variant.label, changes: variant.changes, limitation: variant.limitation } : null, comparison: comparisonA && comparisonB ? { a: { requestId: comparisonA.requestId, durationMs: comparisonA.durationMs }, b: { requestId: comparisonB.requestId, durationMs: comparisonB.durationMs }, transcriptIncluded: false } : null, conclusion, privacy: "Raw audio and transcript text excluded by default." });
    const blob = new Blob([JSON.stringify(safe, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "audio-signal-lab-summary.json"; anchor.click(); URL.revokeObjectURL(url);
  }

  const inspector = useMemo<InspectorRecord>(() => buildInspectorRecord({
    id: "audio-signal-lab",
    module: "Audio Signal Lab",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    request: { method: comparison ? "POST × 2 (explicitly confirmed)" : "LOCAL", endpoint: comparison ? "http://localhost/api/deepgram/transcribe-file" : "browser://audio-signal-lab", bodyPreview: { sourceKind, format, effectiveDeepgramAudioConfig: deepgramConfig, rawAudioIncluded: false } },
    response: { status: 200, bodyPreview: redactSecrets({ diagnosis, metrics, variant: variant ? { id: variant.id, changes: variant.changes } : null, comparison: comparison ? { requestIds: [comparison.a.requestId, comparison.b.requestId], timings: [comparison.a.durationMs, comparison.b.durationMs] } : null }) },
    timeline: [createTimelineEvent({ type: "audio.signal.summary", label: diagnosis.status, data: { provenance: diagnosis.provenance, rawAudioIncluded: false } })],
    notes: ["Browser measurements are approximate and are not clinical acoustic measurements.", "No audio is sent to Deepgram unless the two-request comparison is explicitly confirmed.", "Raw audio is excluded from this inspector."],
  }), [comparison, deepgramConfig, diagnosis, format, metrics, sourceKind, variant]);

  return (
    <>
      {handoffFile ? <HandedOffAudioLoader file={handoffFile} onLoad={handleUpload} onConsumed={onHandoffConsumed} /> : null}
      <div className="h-full min-h-0 overflow-auto bg-[#02060b]" data-testid="audio-signal-lab">
      <div className="grid h-full min-h-[620px] min-w-[990px] [grid-template-columns:230px_minmax(430px,1.35fr)_minmax(330px,.95fr)]">
        <aside className="min-h-0 overflow-y-auto border-r border-white/10 bg-[#040a10] p-3" aria-label="Audio Signal Lab sources and fixtures">
          <div className="mb-4">
            <div className="flex items-center justify-between"><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-cyan-300/70">Local audio analysis</p><span className="rounded border border-emerald-300/20 bg-emerald-300/5 px-1.5 py-0.5 text-[8px] text-emerald-200">0 requests by default</span></div>
            <h2 className="mt-2 text-base font-semibold text-white">Audio Signal Lab</h2>
            <p className="mt-1 text-[10px] leading-4 text-slate-500">Before tuning a speech model, understand the signal the model actually received.</p>
          </div>

          <LeftSection title="Input source">
            {(["microphone", "upload", "sample-library", "fixture"] as AudioSignalSourceKind[]).map((source) => <button key={source} type="button" onClick={() => setSourceKind(source)} className={leftButton(sourceKind === source)}>{source.replace("-", " ")}</button>)}
          </LeftSection>

          {sourceKind === "microphone" ? <LeftSection title="Device and capture">
            <select aria-label="Audio Signal Lab input device" value={deviceId} disabled={captureActive} onChange={(event) => { setDeviceId(event.target.value); setSelectedDevice(devices.find((device) => device.deviceId === event.target.value)?.label || "Browser default microphone"); }} className={selectClass}>
              <option value="">Browser default microphone</option>
              {devices.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}
            </select>
            <button type="button" onClick={() => void refreshDevices()} className={leftButton(false)}>Refresh devices</button>
            <p className="rounded border border-white/10 bg-black/20 p-2 text-[9px] leading-4 text-slate-500">Selected: <span className="text-slate-300">{selectedDevice}</span></p>
            <p className="rounded border border-emerald-300/15 bg-emerald-300/5 p-2 text-[9px] text-emerald-100">Live monitor: Off · no microphone-to-speaker route exists</p>
          </LeftSection> : null}

          {sourceKind === "upload" ? <LeftSection title="Uploaded audio">
            <label className="block cursor-pointer rounded border border-dashed border-cyan-300/20 p-3 text-center text-[10px] text-cyan-100 hover:border-cyan-300/40">Choose local audio<input aria-label="Audio Signal Lab upload" type="file" accept="audio/*,.raw,.pcm" className="sr-only" onChange={(event) => void handleUpload(event.target.files?.[0] ?? null)} /></label>
            <p className="text-[9px] leading-4 text-slate-600">The file stays in the browser workflow unless comparison is explicitly confirmed.</p>
          </LeftSection> : null}

          {sourceKind === "sample-library" ? <LeftSection title="Existing sample library">
            {SAMPLE_AUDIO_SCENARIOS.slice(0, 5).map((sample) => <button key={sample.slug} type="button" onClick={() => void loadSample(sample.slug)} className={leftButton(false)}>{sample.title}</button>)}
          </LeftSection> : null}

          <LeftSection title="Safe fixture library">
            {AUDIO_FIXTURES.map((fixture) => <button key={fixture.id} type="button" disabled={captureActive} onClick={() => void loadFixture(fixture.id)} className={leftButton(false)}><span className="block">{fixture.label}</span><span className="mt-0.5 block text-[8px] font-normal text-slate-600">{fixture.detail}</span></button>)}
          </LeftSection>

          <LeftSection title="Experiment preset">
            <button type="button" onClick={openPresenterPreset} className="w-full rounded border border-violet-300/25 bg-violet-300/[0.08] p-2 text-left text-[10px] font-semibold text-violet-100 focus-visible:outline-2 focus-visible:outline-violet-200">Audio Engineering → Voice AI<span className="mt-1 block text-[8px] font-normal text-violet-200/55">Presenter-safe sequence</span></button>
          </LeftSection>
        </aside>

        <main className="min-h-0 overflow-y-auto p-3" aria-label="Audio Signal Lab analyzer">
          <header className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.025] px-3 py-2">
            <div><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-600">Waveforms, signal health, formats, and speech-AI experiments</p><h2 className="mt-1 text-lg font-semibold text-white">Audio Signal Lab</h2></div>
            <div className="flex flex-wrap gap-1.5"><button type="button" onClick={exportSummary} className={toolbarButton}>Export summary</button><button type="button" onClick={resetLab} disabled={captureActive || comparisonRunning} data-shortcut-command="reset_current" data-shortcut-label="Reset current module" data-shortcut-disabled-reason="Stop capture or wait for comparison cleanup before resetting." className={toolbarButton}>Reset + release<ShortcutHint command="reset_current" /></button></div>
          </header>

          <section className="rounded-lg border border-white/10 bg-black/20">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
              <div className="flex items-center gap-2"><span className={`size-2 rounded-full ${captureActive ? "bg-rose-300 shadow-[0_0_12px_rgba(253,164,175,.8)]" : "bg-slate-700"}`} /><span className="text-[10px] font-semibold text-white">Transport</span><span className="font-mono text-[9px] text-slate-600">{captureState}</span></div>
              <div className="flex gap-1.5"><button type="button" disabled={captureActive} onClick={() => void startMicrophone()} data-shortcut-command="run_primary" data-shortcut-label="Start current experience" data-shortcut-disabled-reason="Local audio analysis is already active." className={primaryButton}>Start local analysis<ShortcutHint command="run_primary" /></button><button type="button" disabled={!captureActive} onClick={() => void stopMicrophone()} data-shortcut-command="stop_session" data-shortcut-label="Stop current session" data-shortcut-disabled-reason="No local audio capture is active." className={toolbarButton}>Stop<ShortcutHint command="stop_session" /></button></div>
            </div>
            <div role="status" className="border-b border-white/10 px-3 py-2 text-[10px] leading-4 text-slate-400">{message}</div>
            <div className="p-3">
              <div className="overflow-hidden rounded-lg border border-white/10 bg-[#010306]">
                <div className="flex items-center justify-between border-b border-white/10 px-3 py-2"><span className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">Waveform · browser-derived</span><span className="font-mono text-[9px] text-slate-600">normalized -1.0 … +1.0</span></div>
                <canvas ref={waveformRef} className="block h-44 w-full motion-reduce:transition-none" role="img" aria-label={`Waveform for ${variant?.label ?? format?.filename ?? sourceKind}`} />
              </div>

              <div className="mt-3 grid grid-cols-4 gap-2 xl:grid-cols-8">
                <Metric label="RMS" value={metrics.rms.toFixed(4)} />
                <Metric label="Peak" value={metrics.peak.toFixed(4)} />
                <Metric label="Approx dBFS" value={metrics.dbfs === null ? "-∞" : metrics.dbfs.toFixed(1)} />
                <Metric label="Clipping" value={metrics.clipping ? "Detected" : "Clear"} tone={metrics.clipping ? "danger" : "normal"} />
                <Metric label="Clip events" value={String(metrics.clippingEvents)} />
                <Metric label="Silence" value={`${metrics.silencePercentage.toFixed(0)}%`} />
                <Metric label="Signal" value={metrics.signalPresent ? "Present" : "Absent"} />
                <Metric label="Elapsed" value={`${(metrics.elapsedMs / 1000).toFixed(1)}s`} />
              </div>

              <dl className="mt-3 grid gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-[9px] sm:grid-cols-2 xl:grid-cols-5" aria-label="Live capture facts">
                <CaptureFact label="Selected input" value={selectedDevice} />
                <CaptureFact label="Channels" value={browserReportedSettings?.channelCount ? String(browserReportedSettings.channelCount) : format?.channelCount ? String(format.channelCount) : "Unavailable"} />
                <CaptureFact label="Browser sample rate" value={browserReportedSettings?.sampleRate ? `${browserReportedSettings.sampleRate} Hz` : format?.sampleRate ? `${format.sampleRate} Hz` : "Unavailable"} />
                <CaptureFact label="MediaRecorder MIME" value={recorderMime} />
                <CaptureFact label="Requested constraints" value={trackSettings.requestedConstraints ? JSON.stringify(trackSettings.requestedConstraints) : "Unavailable until explicit microphone start"} />
              </dl>

              <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_1.1fr]">
                <section className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between"><div><p className="text-[10px] font-semibold text-white">Frequency spectrum</p><p className="text-[9px] text-slate-600">Coarse browser-derived FFT approximation; not a clinical measurement.</p></div><span className="font-mono text-[9px] text-cyan-200">{metrics.spectrum.dominantFrequencyHz ? `≈ ${metrics.spectrum.dominantFrequencyHz} Hz` : "unavailable"}</span></div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <Band label="Low" value={metrics.spectrum.low} />
                    <Band label="Speech" value={metrics.spectrum.speech} />
                    <Band label="High" value={metrics.spectrum.high} />
                  </div>
                  <p className="mt-2 text-[9px] text-slate-500">Dominant band: <span className="text-slate-300">{metrics.spectrum.dominantBand}</span></p>
                </section>
                <section className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between"><div><p className="text-[10px] font-semibold text-white">Timeline and chunks</p><p className="text-[9px] text-slate-600">Visualization only; proven Live Mic transport is unchanged.</p></div><span className="font-mono text-[9px] text-slate-500">{chunks.length} chunks</span></div>
                  <div className="mt-3 flex h-12 items-end gap-1 overflow-hidden" aria-label="Audio chunk timeline">
                    {chunks.length ? chunks.map((chunk) => <span key={chunk.id} title={`${chunk.intervalMs?.toFixed(0) ?? "start"} ms · ${chunk.bytes} bytes`} className="min-w-1 flex-1 rounded-t bg-cyan-300/45 motion-reduce:transition-none" style={{ height: `${Math.min(100, Math.max(12, (chunk.intervalMs ?? 250) / 4))}%` }} />) : <span className="self-center text-[9px] text-slate-600">Start explicit mic analysis to observe recorder timing.</span>}
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-[9px]"><div><dt className="text-slate-600">Average interval</dt><dd className="font-mono text-slate-300">{chunkStats.average === null ? "Unavailable" : `${chunkStats.average.toFixed(1)} ms`}</dd></div><div><dt className="text-slate-600">Interval variation</dt><dd className="font-mono text-slate-300">{chunkStats.variation === null ? "Unavailable" : `${chunkStats.variation.toFixed(1)} ms`}</dd></div></dl>
                </section>
              </div>
            </div>
          </section>

          <section className="mt-3 rounded-lg border border-white/10 bg-white/[0.02] p-3" aria-label="Offline experiment workbench">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-semibold text-white">Safe offline experiment workbench</p><p className="text-[9px] text-slate-600">Transformations operate on a copied in-memory fixture and never touch Live Mic.</p></div><span className="rounded border border-emerald-300/15 bg-emerald-300/5 px-2 py-1 text-[8px] text-emerald-100">No automatic STT</span></div>
            <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
              <select aria-label="Audio variant preset" value={selectedVariantId} onChange={(event) => setSelectedVariantId(event.target.value as AudioVariantId)} className={selectClass}>{AUDIO_VARIANTS.map((item) => <option key={item.id} value={item.id}>{item.label} — {item.detail}</option>)}</select>
              <button type="button" onClick={() => void buildVariant()} className={primaryButton}>Create offline variant</button>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <AudioPreview title="Original fixture" url={originalUrl} metrics={originalMetrics} preserved />
              <AudioPreview title={variant?.label ?? "Processed variant"} url={variantUrl} metrics={variantMetrics} changes={variant?.changes} limitation={variant?.limitation} />
            </div>
            {variant?.chunkPlan ? <div className="mt-3 rounded border border-violet-300/15 bg-violet-300/5 p-2 text-[9px] text-violet-100">Chunking demonstration: {variant.chunkPlan.groups[0]} × 100 ms groups versus {variant.chunkPlan.groups[1]} × 1000 ms groups. Samples are unchanged.</div> : null}
             <div className="mt-3 flex flex-wrap justify-end gap-2"><button type="button" disabled={!originalBlob || !variantBlob || comparisonRunning} onClick={() => openLabMode ? void runComparison() : setComparisonOpen(true)} className={primaryButton}>{comparisonRunning ? "Running two requests…" : "Compare original vs variant with Deepgram"}</button></div>
          </section>

          {presenterMode ? <section className="mt-3 rounded-lg border border-violet-300/20 bg-violet-300/[0.05] p-3" aria-label="Audio Engineering to Voice AI presenter preset"><div className="flex items-center justify-between"><div><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-violet-200/70">Presenter-safe preset</p><h2 className="mt-1 text-sm font-semibold text-white">Audio Engineering → Voice AI</h2></div><button type="button" onClick={() => setPresenterMode(false)} className={toolbarButton}>Close</button></div><ol className="mt-3 grid gap-2 md:grid-cols-2">{PRESENTER_STEPS.map((step, index) => <li key={step} className="rounded border border-white/10 bg-black/20 p-2 text-[10px] leading-4 text-slate-300"><span className="mr-2 font-mono text-violet-200">{index + 1}</span>{step}</li>)}</ol><p className="mt-3 rounded border border-cyan-300/15 bg-cyan-300/5 p-3 text-xs leading-5 text-cyan-50">“My audio-engineering background taught me to trace the complete signal path. In voice AI, that means asking what the model actually received before assuming the model is the problem.”</p></section> : null}
        </main>

        <aside className="min-h-0 overflow-y-auto border-l border-white/10 bg-[#040910]" aria-label="Audio Signal Lab diagnosis and teaching">
          <div className="sticky top-0 z-10 grid grid-cols-4 gap-1 border-b border-white/10 bg-[#040910] p-2">
            {(["diagnosis", "format", "pipeline", "daw", "experiment", "lessons", "inspector"] as RightPanel[]).map((panel) => <button key={panel} type="button" onClick={() => setRightPanel(panel)} className={`rounded px-1 py-1.5 text-[8px] font-bold uppercase tracking-wide focus-visible:outline-2 focus-visible:outline-cyan-200 ${rightPanel === panel ? "bg-cyan-200 text-slate-950" : "border border-white/10 text-slate-500"}`}>{panel}</button>)}
          </div>
          <div className="space-y-3 p-3">
            {rightPanel === "diagnosis" ? <DiagnosisPanel diagnosis={diagnosis} metrics={metrics} onOpenObservatory={() => onOpenModule("live-observatory")} /> : null}
            {rightPanel === "format" ? <FormatPanel metadata={format} config={deepgramConfig} recorderMime={recorderMime} trackSettings={trackSettings} raw={{ encoding: rawEncoding, sampleRate: rawSampleRate, channels: rawChannels }} onRawChange={(key, value) => { if (key === "encoding") setRawEncoding(value); if (key === "sampleRate") setRawSampleRate(value); if (key === "channels") setRawChannels(value); }} /> : null}
            {rightPanel === "pipeline" ? <PipelinePanel selected={selectedFlow} onSelect={setSelectedFlowId} onOpenModule={onOpenModule} onOpenInspector={() => setRightPanel("inspector")} /> : null}
            {rightPanel === "daw" ? <DawPanel onExperiment={(target) => { if (target === "pipeline") setRightPanel("pipeline"); else if (target === "format") setRightPanel("format"); else if (target === "compare" || target === "variants" || target === "gain" || target === "chunking") setRightPanel("experiment"); else setRightPanel("lessons"); }} /> : null}
            {rightPanel === "experiment" ? <><ExperimentEvidence model={model} language={language} original={originalMetrics} variant={variantMetrics} visible={Boolean(comparison)} /><ExperimentPanel a={comparisonA} b={comparisonB} diff={diff} werA={werA} werB={werB} model={model} language={language} originalMetrics={originalMetrics} variantMetrics={variantMetrics} referenceText={referenceText} referenceConfirmed={referenceConfirmed} keywords={keywords} keywordList={keywordList} conclusion={conclusion} onReferenceText={setReferenceText} onReferenceConfirmed={setReferenceConfirmed} onKeywords={setKeywords} onConclusion={setConclusion} /></> : null}
            {rightPanel === "lessons" ? <><LessonsPanel scenario={selectedScenario} onScenario={setSelectedScenarioId} onOpenModule={onOpenModule} onOpenCodeLab={onOpenCodeLab} onOpenQuestline={onOpenQuestline} /><Info title="Prevention" text={preventionForScenario(selectedScenario[0])} /><Info title="Multichannel application" text="Recording buses and isolated tracks can preserve channel 0 customer / channel 1 agent in stereo or contact-center audio. Verify actual channel layout before enabling Deepgram multichannel configuration; use diarization when speakers share mixed audio, and never treat channel identity as speaker identity." /><Info title="Conversation timing map" text="Speech energy → pause/silence duration → hesitation or self-correction → resumed speech → endpoint event → final transcript timing. VAD and endpointing contribute acoustic evidence; turn-taking, cadence, prosody, barge-in, and interruption add conversational context." /><button type="button" onClick={() => onOpenModule("applied-voice-systems")} className={`${toolbarButton} w-full`}>Open Flux / turn-taking content</button></> : null}
            {rightPanel === "inspector" ? <PayloadInspector record={inspector} title="Audio Signal Lab Payload Inspector" defaultOpen /> : null}
          </div>
        </aside>
      </div>

      {!openLabMode && comparisonOpen ? <ComparisonDialog model={model} language={language} originalSeconds={format?.durationSeconds ?? (originalSamples ? originalSamples.length / (format?.sampleRate || AUDIO_SIGNAL_SAMPLE_RATE) : 0)} variantSeconds={variant ? variant.samples.length / variant.sampleRate : 0} variantLabel={variant?.label ?? "Processed variant"} running={comparisonRunning} onModel={setModel} onLanguage={setLanguage} onCancel={() => setComparisonOpen(false)} onRun={() => void runComparison()} /> : null}
      </div>
    </>
  );
}

function HandedOffAudioLoader({ file, onLoad, onConsumed }: { file: File; onLoad: (file: File) => Promise<void>; onConsumed: () => void }) {
  const consumedRef = useRef<File | null>(null);
  useEffect(() => {
    if (consumedRef.current === file) return;
    consumedRef.current = file;
    void onLoad(file).finally(onConsumed);
  }, [file, onConsumed, onLoad]);
  return null;
}

function DiagnosisPanel({ diagnosis, metrics, onOpenObservatory }: { diagnosis: ReturnType<typeof diagnoseAudioSignal>; metrics: AudioSignalMetrics; onOpenObservatory: () => void }) {
  const danger = diagnosis.status === "Clipping detected" || diagnosis.status === "Mostly silence";
  return <><section className={`rounded-lg border p-3 ${danger ? "border-rose-300/20 bg-rose-300/5" : "border-cyan-300/15 bg-cyan-300/[0.04]"}`}><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-white">{diagnosis.status}</h3><span className="rounded border border-white/10 px-1.5 py-0.5 text-[8px] text-slate-400">{diagnosis.confidence} confidence · {diagnosis.provenance}</span></div><ul className="mt-3 space-y-1 text-[10px] text-slate-300">{diagnosis.evidence.map((item) => <li key={item}>• {item}</li>)}</ul></section><Info title="Why it matters" text={diagnosis.whyItMatters} /><Info title="Likely transcription symptom" text={diagnosis.likelyTranscriptionSymptom} /><Info title="Suggested engineering check" text={diagnosis.suggestedCheck} /><Info title="Boundary" text={diagnosis.limitation} /><div className="grid grid-cols-2 gap-2"><Metric label="Signal present" value={metrics.signalPresent ? "Yes" : "No"} /><Metric label="Browser provenance" value={metrics.provenance} /></div><button type="button" onClick={onOpenObservatory} className={`${primaryButton} w-full`}>Open Live Observatory</button></>;
}

function FormatPanel({ metadata, config, recorderMime, trackSettings, raw, onRawChange }: { metadata: AudioFormatMetadata | null; config: ReturnType<typeof effectiveDeepgramAudioConfig> | null; recorderMime: string; trackSettings: Record<string, unknown>; raw: { encoding: string; sampleRate: string; channels: string }; onRawChange: (key: keyof typeof raw, value: string) => void }) {
  return <><h3 className="text-sm font-semibold text-white">Audio format inspector</h3>{metadata ? <dl className="grid grid-cols-[110px_1fr] gap-x-2 gap-y-1.5 rounded-lg border border-white/10 bg-black/20 p-3 text-[9px]">{Object.entries(metadata).map(([key, value]) => <div key={key} className="contents"><dt className="text-slate-600">{key}</dt><dd className="break-all font-mono text-slate-300">{value === null ? "Unavailable" : String(value)}</dd></div>)}</dl> : <Info title="No inspected fixture" text="Load a file, local sample, generated fixture, or stopped microphone capture." />}<Info title="Container versus encoding" text="A container such as WAV, WebM, Ogg, or MP4 wraps audio plus metadata. A codec such as PCM, Opus, MP3, μ-law, or A-law represents samples. Headerless raw audio requires explicit facts." />{metadata?.dataKind === "raw" ? <fieldset className="space-y-2 rounded-lg border border-amber-300/20 bg-amber-300/5 p-3"><legend className="px-1 text-[9px] font-bold uppercase tracking-wide text-amber-200">Required raw-audio facts</legend><input aria-label="Raw encoding" placeholder="encoding, e.g. linear16" value={raw.encoding} onChange={(event) => onRawChange("encoding", event.target.value)} className={inputClass} /><input aria-label="Raw sample rate" placeholder="sample rate, e.g. 16000" value={raw.sampleRate} onChange={(event) => onRawChange("sampleRate", event.target.value)} className={inputClass} /><input aria-label="Raw channels" placeholder="channels, e.g. 1" value={raw.channels} onChange={(event) => onRawChange("channels", event.target.value)} className={inputClass} /></fieldset> : null}<section className="rounded-lg border border-cyan-300/15 bg-cyan-300/[0.04] p-3" data-testid="effective-deepgram-audio-config"><h4 className="text-[9px] font-bold uppercase tracking-wide text-cyan-200">What Deepgram receives</h4><pre className="mt-2 whitespace-pre-wrap break-all font-mono text-[9px] leading-4 text-slate-300">{JSON.stringify(config ?? { state: "No format inspected" }, null, 2)}</pre></section><Info title="Current recorder MIME" text={recorderMime} /><details className="rounded-lg border border-white/10 bg-black/20 p-3"><summary className="cursor-pointer text-[9px] font-bold uppercase tracking-wide text-slate-500">Browser capture settings</summary><pre className="mt-2 whitespace-pre-wrap break-all text-[9px] text-slate-400">{JSON.stringify(trackSettings, null, 2)}</pre></details></>;
}

function PipelinePanel({ selected, onSelect, onOpenModule, onOpenInspector }: { selected: (typeof SIGNAL_FLOW_STAGES)[number]; onSelect: (id: string) => void; onOpenModule: (module: LabModuleId) => void; onOpenInspector: () => void }) {
  const action = selected.module === "Audio Signal Lab"
    ? <Info title="Relevant module" text="Audio Signal Lab · current workspace" />
    : <button type="button" onClick={() => selected.module === "Payload Inspector" ? onOpenInspector() : onOpenModule(moduleIdForLabel(selected.module))} className={`${primaryButton} w-full`}>Open {selected.module}</button>;
  return <><h3 className="text-sm font-semibold text-white">Selectable signal flow</h3><div className="space-y-1">{SIGNAL_FLOW_STAGES.map((stage, index) => <button key={stage.id} type="button" onClick={() => onSelect(stage.id)} className={`w-full rounded border p-2 text-left text-[9px] ${selected.id === stage.id ? "border-cyan-300/30 bg-cyan-300/[0.07] text-cyan-50" : "border-white/10 text-slate-500"}`}><span className="mr-2 font-mono text-slate-700">{String(index + 1).padStart(2, "0")}</span>{stage.label}</button>)}</div><Info title="Input" text={selected.input} /><Info title="Output" text={selected.output} /><Info title="Owner" text={selected.owner} /><Info title="Data type" text={selected.dataType} /><Info title="Common failure" text={selected.failure} /><Info title="Evidence to inspect" text={selected.evidence} />{action}</>;
}

function DawPanel({ onExperiment }: { onExperiment: (target: string) => void }) {
  return <><h3 className="text-sm font-semibold text-white">From the DAW to the Voice Pipeline</h3><div className="space-y-2">{DAW_TO_VOICE_AI.map(([concept, daw, voice, target]) => <section key={concept} className="rounded-lg border border-white/10 bg-black/20 p-3"><h4 className="text-[10px] font-semibold text-cyan-100">{concept}</h4><p className="mt-2 text-[9px] leading-4 text-slate-500"><span className="font-semibold text-slate-300">DAW:</span> {daw}</p><p className="mt-1 text-[9px] leading-4 text-slate-500"><span className="font-semibold text-slate-300">Voice AI:</span> {voice}</p><button type="button" onClick={() => onExperiment(target)} className="mt-2 text-[9px] font-semibold text-violet-200 hover:text-white">Open related experiment →</button></section>)}</div></>;
}

function ExperimentPanel(props: { a: AudioComparisonResult | null; b: AudioComparisonResult | null; diff: ReturnType<typeof transcriptDiff>; werA: ReturnType<typeof wordErrorRate>; werB: ReturnType<typeof wordErrorRate>; model: string; language: string; originalMetrics: AudioSignalMetrics; variantMetrics: AudioSignalMetrics | null; referenceText: string; referenceConfirmed: boolean; keywords: string; keywordList: string[]; conclusion: Record<string, string>; onReferenceText: (value: string) => void; onReferenceConfirmed: (value: boolean) => void; onKeywords: (value: string) => void; onConclusion: (value: { hypothesis: string; observation: string; audio: string; transcription: string; evidence: string; limitation: string; next: string }) => void }) {
  const fields = [["hypothesis", "Hypothesis"], ["observation", "Observation"], ["audio", "Audio-layer interpretation"], ["transcription", "Transcription-layer interpretation"], ["evidence", "Evidence"], ["limitation", "Limitation"], ["next", "Recommended next test"]] as const;
  return <><h3 className="text-sm font-semibold text-white">Original-versus-variant results</h3>{props.a && props.b ? <><ResultCard label="Original A" result={props.a} /><ResultCard label="Variant B" result={props.b} /><section className="rounded-lg border border-white/10 bg-black/20 p-3"><h4 className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Transcript diff</h4><div className="mt-2 flex flex-wrap gap-1">{props.diff.map((item) => <span key={item.index} className={`rounded px-1.5 py-1 font-mono text-[9px] ${item.match ? "bg-emerald-300/10 text-emerald-100" : "bg-amber-300/10 text-amber-100"}`}>{item.a} → {item.b}</span>)}</div></section></> : <Info title="No billable comparison run" text="Create a variant, review the two-request confirmation, and explicitly run the comparison. Offline variants alone make no request." />}<label className="block text-[9px] text-slate-500">Optional reference text<textarea value={props.referenceText} onChange={(event) => { props.onReferenceText(event.target.value); props.onReferenceConfirmed(false); }} className={`${inputClass} mt-1 min-h-20 py-2`} placeholder="WER stays hidden without confirmed ground truth." /></label><label className="flex gap-2 rounded border border-white/10 p-2 text-[9px] text-slate-300"><input type="checkbox" checked={props.referenceConfirmed} disabled={!props.referenceText.trim()} onChange={(event) => props.onReferenceConfirmed(event.target.checked)} /> Confirm this text is ground truth for WER</label>{props.werA && props.werB ? <div className="grid grid-cols-2 gap-2"><Metric label="WER A" value={`${(props.werA.value * 100).toFixed(1)}%`} /><Metric label="WER B" value={`${(props.werB.value * 100).toFixed(1)}%`} /></div> : <p data-testid="wer-unavailable" className="rounded border border-white/10 bg-black/20 p-2 text-[9px] text-slate-600">WER unavailable until reference text is supplied and confirmed.</p>}<label className="block text-[9px] text-slate-500">Manual keywords/entities<input value={props.keywords} onChange={(event) => props.onKeywords(event.target.value)} placeholder="order ID, Belmont, Focusrite" className={`${inputClass} mt-1`} /></label>{props.a && props.b && props.keywordList.length ? <section className="rounded border border-white/10 p-2 text-[9px] text-slate-400">{props.keywordList.map((term) => <div key={term}>{term}: A {props.a!.transcript.toLowerCase().includes(term.toLowerCase()) ? "present" : "absent"} · B {props.b!.transcript.toLowerCase().includes(term.toLowerCase()) ? "present" : "absent"}</div>)}</section> : null}<h3 className="pt-2 text-sm font-semibold text-white">Experiment conclusion</h3>{fields.map(([key, label]) => <label key={key} className="block text-[9px] text-slate-500">{label}<textarea value={props.conclusion[key]} onChange={(event) => props.onConclusion({ ...props.conclusion, [key]: event.target.value } as typeof props.conclusion & { hypothesis: string; observation: string; audio: string; transcription: string; evidence: string; limitation: string; next: string })} className={`${inputClass} mt-1 min-h-14 py-2`} /></label>)}</>;
}

function ExperimentEvidence({ model, language, original, variant, visible }: { model: string; language: string; original: AudioSignalMetrics; variant: AudioSignalMetrics | null; visible: boolean }) {
  if (!visible) return null;
  return <section className="rounded-lg border border-cyan-300/15 bg-cyan-300/[0.04] p-3 text-[9px] text-slate-300"><h4 className="font-bold uppercase tracking-wide text-cyan-100">Controlled settings and signal evidence</h4><dl className="mt-2 grid grid-cols-2 gap-2"><div><dt className="text-slate-600">Shared STT settings</dt><dd className="font-mono">{model} · {language} · smart_format=true · diarize=false</dd></div><div><dt className="text-slate-600">Cost state</dt><dd>Unavailable here; optional read-only lookup remains in Observatory.</dd></div><div><dt className="text-slate-600">Original health</dt><dd className="font-mono">RMS {original.rms.toFixed(4)} · peak {original.peak.toFixed(4)} · {original.clipping ? "clipping" : "clear"}</dd></div><div><dt className="text-slate-600">Variant health</dt><dd className="font-mono">{variant ? `RMS ${variant.rms.toFixed(4)} · peak ${variant.peak.toFixed(4)} · ${variant.clipping ? "clipping" : "clear"}` : "Unavailable"}</dd></div></dl></section>;
}

function LessonsPanel({ scenario, onScenario, onOpenModule, onOpenCodeLab, onOpenQuestline }: { scenario: (typeof AUDIO_ISSUE_SCENARIOS)[number]; onScenario: (id: string) => void; onOpenModule: (module: LabModuleId) => void; onOpenCodeLab: () => void; onOpenQuestline: () => void }) {
  return <><h3 className="text-sm font-semibold text-white">What kind of problem is this?</h3><select aria-label="Audio issue classifier scenario" value={scenario[0]} onChange={(event) => onScenario(event.target.value)} className={selectClass}>{AUDIO_ISSUE_SCENARIOS.map((item) => <option key={item[0]} value={item[0]}>{item[1]}</option>)}</select><Info title="Likely layer" text={scenario[2]} /><Info title="Evidence" text={scenario[3]} /><Info title="Investigation and correction" text={scenario[4]} /><Info title="Client-facing explanation" text={scenario[5]} /><Lesson title="Multichannel versus diarization"><p>Multichannel processes separate physical or logical channels independently. Diarization estimates speaker identity within audio. Channel 0 → customer and Channel 1 → agent is not interchangeable with one mixed channel → inferred speaker labels.</p><div className="mt-2 grid grid-cols-2 gap-2 font-mono text-[9px]"><div className="rounded border border-cyan-300/15 p-2">Channel 0 → customer<br />Channel 1 → agent</div><div className="rounded border border-violet-300/15 p-2">One mixed channel<br />→ speaker labels inferred</div></div></Lesson><Lesson title="Endpointing and musical listening"><p>Speech energy, pauses, hesitation, self-correction, and resumed speech are acoustic evidence. A pause is an acoustic event, but the end of a conversational turn is also a linguistic and semantic decision. This browser meter does not reproduce Deepgram VAD or a turn model.</p><div className="mt-2 flex h-8 items-end gap-1">{[7, 18, 26, 12, 3, 3, 16, 22, 8, 2, 2, 2].map((height, index) => <span key={index} className="flex-1 rounded-t bg-cyan-300/35" style={{ height: `${height}px` }} />)}</div></Lesson><Lesson title="Echo, feedback, and playback"><p>TTS playback → speaker → room → microphone → STT can cause acoustic echo, false barge-in, or an agent hearing itself. Monitoring stays off. Prefer headphone separation and platform echo cancellation; use muting/gating only with explicit turn and interruption logic.</p></Lesson><div className="grid gap-2"><button type="button" onClick={() => onOpenModule("live-mic")} className={primaryButton}>Open Live Mic</button><button type="button" onClick={() => onOpenModule("live-observatory")} className={toolbarButton}>Open Observatory timeline</button><button type="button" onClick={onOpenCodeLab} className={toolbarButton}>Open audio implementation in Code Lab</button><button type="button" onClick={onOpenQuestline} className={toolbarButton}>Open Audio Signal Questline lessons</button></div></>;
}

function ComparisonDialog(props: { model: string; language: string; originalSeconds: number; variantSeconds: number; variantLabel: string; running: boolean; onModel: (value: string) => void; onLanguage: (value: string) => void; onCancel: () => void; onRun: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" role="presentation"><div role="dialog" aria-modal="true" aria-labelledby="audio-compare-title" className="w-full max-w-lg rounded-xl border border-rose-300/30 bg-[#071019] p-5 shadow-2xl"><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-rose-200">Billable live comparison</p><h2 id="audio-compare-title" className="mt-2 text-lg font-semibold text-white">Confirm two Deepgram STT requests</h2><p className="mt-2 text-xs leading-5 text-slate-300">The original fixture and {props.variantLabel} will be sent sequentially with identical verified settings. No retry or loop will run.</p><dl className="mt-4 grid grid-cols-[140px_1fr] gap-2 text-xs"><dt className="text-slate-500">Billable requests</dt><dd className="font-semibold text-rose-100">2</dd><dt className="text-slate-500">Original duration</dt><dd>{props.originalSeconds.toFixed(2)} s</dd><dt className="text-slate-500">Variant duration</dt><dd>{props.variantSeconds.toFixed(2)} s</dd><dt className="text-slate-500">Model</dt><dd><select aria-label="Comparison model" value={props.model} onChange={(event) => props.onModel(event.target.value)} className={selectClass}><option value="nova-3">nova-3</option></select></dd><dt className="text-slate-500">Spoken language</dt><dd><select aria-label="Comparison spoken language" value={props.language} onChange={(event) => props.onLanguage(event.target.value)} className={selectClass}><option value="en">English (en)</option><option value="it">Italian (it)</option><option value="es">Spanish (es)</option></select></dd><dt className="text-slate-500">Parameters</dt><dd className="font-mono text-[10px]">smart_format=true · diarize=false</dd></dl><p className="mt-4 rounded border border-amber-300/20 bg-amber-300/5 p-3 text-[10px] text-amber-100">Cancel is safe. Run comparison makes exactly two prerecorded STT requests. WER remains hidden without confirmed reference text.</p><div className="mt-5 flex justify-end gap-2"><button type="button" autoFocus disabled={props.running} onClick={props.onCancel} className={toolbarButton}>Cancel</button><button type="button" disabled={props.running} onClick={props.onRun} className={primaryButton}>{props.running ? "Running two requests…" : "Run comparison"}</button></div></div></div>;
}

async function transcribeFixture(blob: Blob, filename: string, model: string, language: string): Promise<AudioComparisonResult> {
  const form = new FormData(); form.append("file", blob, filename); form.append("model", model); form.append("language", language); form.append("smart_format", "true"); form.append("diarize", "false"); form.append("observatory", "true");
  const started = performance.now();
  const response = await fetch("/api/deepgram/transcribe-file", { method: "POST", body: form });
  const envelope = await response.json() as ApiDebugEnvelope<TranscriptionResponse>;
  if (!response.ok || !envelope.ok || !envelope.data) throw new Error(envelope.error?.message || `Comparison request failed with HTTP ${response.status}.`);
  return { transcript: envelope.data.transcript, requestId: extractDeepgramRequestId(envelope.data.raw), durationMs: performance.now() - started, raw: redactSecrets(envelope.data.raw) };
}

function AudioPreview({ title, url, metrics, preserved = false, changes, limitation }: { title: string; url: string | null; metrics: AudioSignalMetrics | null; preserved?: boolean; changes?: string[]; limitation?: string }) { return <section className="rounded-lg border border-white/10 bg-black/20 p-3"><div className="flex items-center justify-between"><h3 className="text-[10px] font-semibold text-white">{title}</h3>{preserved ? <span className="text-[8px] text-emerald-200">Preserved</span> : null}</div>{url ? <audio controls preload="metadata" src={url} className="mt-2 h-9 w-full" aria-label={`${title} preview`} /> : <p className="mt-2 text-[9px] text-slate-600">No fixture loaded.</p>}{metrics ? <p className="mt-2 font-mono text-[9px] text-slate-500">RMS {metrics.rms.toFixed(4)} · peak {metrics.peak.toFixed(4)} · {metrics.clipping ? "clipping" : "clear"}</p> : null}{changes?.map((change) => <p key={change} className="mt-1 text-[9px] text-slate-500">• {change}</p>)}{limitation ? <p className="mt-2 text-[9px] text-amber-100">{limitation}</p> : null}</section>; }
function ResultCard({ label, result }: { label: string; result: AudioComparisonResult }) { return <section className="rounded-lg border border-white/10 bg-black/20 p-3"><div className="flex justify-between gap-2"><h4 className="text-[10px] font-semibold text-white">{label}</h4><span className="font-mono text-[8px] text-slate-600">{result.durationMs.toFixed(0)} ms</span></div><p className="mt-2 text-[10px] leading-4 text-slate-300">{result.transcript || "Empty transcript"}</p><p className="mt-2 break-all font-mono text-[8px] text-slate-600">request ID: {result.requestId ?? "Unavailable"}</p><details className="mt-2 rounded border border-white/10 p-2"><summary className="cursor-pointer text-[8px] font-semibold uppercase tracking-wide text-slate-500">Sanitized raw response</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-[8px] text-slate-500">{JSON.stringify(result.raw, null, 2)}</pre></details></section>; }
function Info({ title, text }: { title: string; text: string }) { return <section className="rounded-lg border border-white/10 bg-black/20 p-3"><h4 className="text-[9px] font-bold uppercase tracking-[0.13em] text-slate-600">{title}</h4><p className="mt-1.5 text-[10px] leading-4 text-slate-300">{text}</p></section>; }
function Lesson({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-lg border border-violet-300/15 bg-violet-300/[0.04] p-3"><h4 className="text-[10px] font-semibold text-violet-100">{title}</h4><div className="mt-2 text-[9px] leading-4 text-slate-400">{children}</div></section>; }
function Metric({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "danger" }) { return <div className="min-w-0 rounded-md border border-white/10 bg-black/25 p-2" data-testid={`audio-metric-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}><p className="truncate text-[8px] font-bold uppercase tracking-wide text-slate-600">{label}</p><p className={`mt-1 truncate font-mono text-[10px] font-semibold ${tone === "danger" ? "text-rose-200" : "text-cyan-100"}`}>{value}</p></div>; }
function CaptureFact({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><dt className="text-[8px] font-bold uppercase tracking-wide text-slate-600">{label}</dt><dd className="mt-1 break-all font-mono text-[9px] text-slate-300">{value}</dd></div>; }
function Band({ label, value }: { label: string; value: number }) { return <div><div className="flex h-16 items-end rounded bg-black/30 p-1"><span className="block w-full rounded-sm bg-violet-300/55 motion-reduce:transition-none" style={{ height: `${Math.max(2, value * 100)}%` }} /></div><p className="mt-1 text-center text-[8px] text-slate-600">{label} {(value * 100).toFixed(0)}%</p></div>; }
function LeftSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="mb-4 space-y-1.5"><h3 className="px-1 text-[8px] font-bold uppercase tracking-[0.14em] text-slate-700">{title}</h3>{children}</section>; }
function leftButton(active: boolean) { return `w-full rounded border px-2 py-2 text-left text-[9px] font-semibold capitalize transition motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-cyan-200 ${active ? "border-cyan-300/30 bg-cyan-300/[0.08] text-cyan-50" : "border-white/10 bg-black/20 text-slate-500 hover:text-white"}`; }
function moduleIdForLabel(label: string): LabModuleId { if (label === "Live Mic") return "live-mic"; if (label === "Upload Audio") return "upload-audio"; if (label === "Live Observatory") return "live-observatory"; if (label === "Payload Inspector") return "audio-signal-lab"; if (label === "Applied Voice Systems") return "applied-voice-systems"; if (label === "Text to Speech") return "tts"; return "audio-signal-lab"; }
function preventionForScenario(id: string) {
  const prevention: Record<string, string> = {
    flattened: "Record a safe gain target and preserve headroom in the capture checklist.",
    quiet: "Standardize microphone placement and verify level before each representative capture.",
    "container-raw": "Derive request configuration from inspected bytes and actual recorder MIME, never filename alone.",
    "silent-channel": "Add per-channel energy checks to ingest preflight and document channel ownership.",
    echo: "Test the complete playback-to-room-to-microphone loop and cancellation path before release.",
    mulaw: "Carry verified raw encoding, rate, and channel facts alongside every headerless stream.",
    terms: "Maintain a versioned domain-term evaluation set with ground-truth references.",
    italian: "Make spoken-language selection explicit and preserve it in request evidence.",
    "chunk-jitter": "Bound queues, log aggregate chunk timing, and test backpressure under representative concurrency.",
    ambiguous: "Preserve sanitized request, response, audio provenance, and a reproducible baseline for every investigation.",
  };
  return prevention[id] ?? "Preserve the failing fixture and add the verified correction to the ingest preflight.";
}
function downmix(buffer: AudioBuffer) { const samples = new Float32Array(buffer.length); for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) { const source = buffer.getChannelData(channel); for (let index = 0; index < samples.length; index += 1) samples[index] += source[index] / buffer.numberOfChannels; } return samples; }
function drawWaveform(canvas: HTMLCanvasElement | null, samples: Float32Array, clipping: boolean) { if (!canvas) return; const context = canvas.getContext("2d"); if (!context) return; const bounds = canvas.getBoundingClientRect(); const ratio = window.devicePixelRatio || 1; const width = Math.max(1, Math.round(bounds.width * ratio)); const height = Math.max(1, Math.round(bounds.height * ratio)); if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; } context.fillStyle = "#010306"; context.fillRect(0, 0, width, height); context.strokeStyle = "rgba(148,163,184,.12)"; for (const line of [0.25, 0.5, 0.75]) { context.beginPath(); context.moveTo(0, height * line); context.lineTo(width, height * line); context.stroke(); } context.strokeStyle = clipping ? "#fda4af" : "#67e8f9"; context.lineWidth = ratio; context.beginPath(); const stride = Math.max(1, Math.floor(samples.length / width)); let visible = 0; const total = Math.ceil(samples.length / stride); for (let index = 0; index < samples.length; index += stride) { const x = total <= 1 ? 0 : visible / (total - 1) * width; const y = (0.5 - samples[index] * 0.45) * height; if (!visible) context.moveTo(x, y); else context.lineTo(x, y); visible += 1; } context.stroke(); }

const selectClass = "h-9 w-full rounded-md border border-white/10 bg-[#03080d] px-2 text-[10px] text-slate-200 outline-none focus-visible:border-cyan-300/45 focus-visible:ring-1 focus-visible:ring-cyan-300/20 disabled:opacity-50";
const inputClass = "min-h-9 w-full rounded-md border border-white/10 bg-[#03080d] px-2 text-[10px] text-slate-200 outline-none placeholder:text-slate-700 focus-visible:border-cyan-300/45 focus-visible:ring-1 focus-visible:ring-cyan-300/20";
const toolbarButton = "rounded-md border border-white/10 bg-white/[0.025] px-2.5 py-2 text-[9px] font-semibold text-slate-300 transition motion-reduce:transition-none hover:border-white/20 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-200 disabled:cursor-not-allowed disabled:opacity-40";
const primaryButton = "rounded-md border border-cyan-300/25 bg-cyan-300/[0.09] px-2.5 py-2 text-[9px] font-semibold text-cyan-50 transition motion-reduce:transition-none hover:border-cyan-200/45 hover:bg-cyan-300/[0.14] focus-visible:outline-2 focus-visible:outline-cyan-200 disabled:cursor-not-allowed disabled:opacity-40";
