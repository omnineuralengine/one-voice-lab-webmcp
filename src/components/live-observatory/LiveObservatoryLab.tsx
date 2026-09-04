"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { BrowserMicCard } from "@/components/browser-mic-card";
import { GuidedDemoGuide } from "@/components/live-observatory/GuidedDemoGuide";
import { PayloadInspector } from "@/components/PayloadInspector";
import { ShortcutHint } from "@/components/keyboard-shortcuts/KeyboardShortcutController";
import { useLiveObservatory } from "@/context/live-observatory-context";
import { buildInspectorRecord, createTimelineEvent, nowIso, redactSecrets, type ApiDebugEnvelope, type InspectorRecord } from "@/lib/inspection";
import { OBSERVATORY_PIPELINE, OBSERVATORY_PRESETS, SYNTHETIC_NORTHSTAR_EVENTS } from "@/lib/observatory/catalog";
import { transcriptDiff, wordErrorRate } from "@/lib/observatory/metrics";
import { assertObservatoryArtifactSafe, safeDownloadName, sanitizeObservatoryArtifact } from "@/lib/observatory/security";
import { deleteObservatoryTranscripts, loadObservatoryHistory, saveObservatoryRun } from "@/lib/observatory/storage";
import type { CodeLabWorkflowId } from "@/lib/code-lab-files";
import type { LabModuleId } from "@/lib/code-snippets";
import { serializeRedactionValues, type RedactionPolicy } from "@/lib/redaction";
import { getDeepgramNova3LanguageOption } from "@/lib/deepgram-languages";
import type { NovaLiveRecognitionConfig } from "@/lib/live-mic/deepgram-live-client";
import type { TranscriptionResponse, TtsResponseData } from "@/lib/types";
import type { ObservatoryConfirmation, ObservatoryEvent, ObservatoryManagementResult, ObservatoryMode, ObservatoryPresetId, ObservatoryRun, ObservatoryStage } from "@/types/observatory";

const INCLUDED_AUDIO_URL = "https://static.deepgram.com/examples/Bueller-Life-moves-pretty-fast.wav";
const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;

type PendingConfirmation = ObservatoryConfirmation & { resolve: (approved: boolean) => void };

export function LiveObservatoryLab({
  initialKeyDetected,
  onOpenModule,
  onOpenApiStudio,
  onOpenCodeLab,
  redactionPolicy,
  onRedactionPolicyChange,
  openLabMode = false,
}: {
  initialKeyDetected: boolean;
  onOpenModule: (moduleId: LabModuleId) => void;
  onOpenApiStudio: (operationId: string) => void;
  onOpenCodeLab: (workflowId: CodeLabWorkflowId, initialLanguage?: "TypeScript") => void;
  redactionPolicy: RedactionPolicy;
  onRedactionPolicyChange: (policy: RedactionPolicy) => void;
  openLabMode?: boolean;
}) {
  const { run, beginRun, addEvent, updateRun, setMetrics, clearRun } = useLiveObservatory();
  const [mode, setMode] = useState<ObservatoryMode>("synthetic");
  const [liveActivated, setLiveActivated] = useState(false);
  const [presetId, setPresetId] = useState<ObservatoryPresetId>("speak-watch");
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<ObservatoryEvent | null>(null);
  const [pulse, setPulse] = useState<Partial<Record<ObservatoryStage, number>>>({});
  const [stopSignal, setStopSignal] = useState(0);
  const [message, setMessage] = useState("Synthetic Preview is deterministic and never contacts Deepgram.");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioDurationMs, setAudioDurationMs] = useState<number | null>(null);
  const [useIncludedAudio, setUseIncludedAudio] = useState(true);
  const [referenceText, setReferenceText] = useState("");
  const [modelA, setModelA] = useState("nova-3");
  const [modelB, setModelB] = useState("nova-3");
  const [smartA, setSmartA] = useState(true);
  const [smartB, setSmartB] = useState(false);
  const [ttsText, setTtsText] = useState("The observatory makes real voice-system events visible without hiding their provenance.");
  const [italianText, setItalianText] = useState("Buongiorno. Questa è una dimostrazione vocale italiana controllata.");
  const [voiceLoopGroundTruth, setVoiceLoopGroundTruth] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [managementEnabled, setManagementEnabled] = useState(false);
  const [projectHandle, setProjectHandle] = useState("");
  const [managementNote, setManagementNote] = useState("Read-only cost lookup is off.");
  const [includeTranscript, setIncludeTranscript] = useState(false);
  const [savedCount, setSavedCount] = useState(() => loadObservatoryHistory().length);
  const abortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const costTimerRef = useRef<number | null>(null);
  const micInspectorEventsSeenRef = useRef(0);
  const mountedRef = useRef(true);
  const audioUrlRef = useRef<string | null>(null);
  audioUrlRef.current = audioUrl;

  const preset = OBSERVATORY_PRESETS.find((item) => item.id === presetId)!;
  const latestEvent = run?.events.at(-1);
  const apiConnectionState = mode === "synthetic" ? "offline / synthetic" : run?.activeRequestCount ? "active" : run?.status === "error" ? "error" : liveActivated ? "ready" : "idle";
  const selectedInspector = useMemo(() => selectedEvent ? inspectorForEvent(selectedEvent) : run?.inspector ?? null, [run?.inspector, selectedEvent]);
  const diff = useMemo(() => run?.transcript && run.comparisonTranscript ? transcriptDiff(run.transcript, run.comparisonTranscript) : [], [run?.comparisonTranscript, run?.transcript]);
  const referenceWer = useMemo(() => run?.referenceTranscript && run.comparisonTranscript ? wordErrorRate(run.referenceTranscript, run.comparisonTranscript) : null, [run?.comparisonTranscript, run?.referenceTranscript]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      if (costTimerRef.current !== null) window.clearTimeout(costTimerRef.current);
      // The latest rendered audio element is intentionally stopped at unmount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const audio = audioRef.current;
      if (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); }
      void deleteGeneratedAudio(audioUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (!run || run.status !== "running") return;
    const started = Date.parse(run.startedAt);
    const timer = window.setInterval(() => setElapsedMs(Math.max(0, Date.now() - started)), 250);
    return () => window.clearInterval(timer);
  }, [run]);

  useEffect(() => {
    if (!latestEvent) return;
    const stage = latestEvent.stage;
    const frame = window.requestAnimationFrame(() => setPulse((current) => ({ ...current, [stage]: 1 })));
    const timer = window.setTimeout(() => setPulse((current) => ({ ...current, [stage]: 0 })), 1_400);
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timer); };
  }, [latestEvent]);

  useEffect(() => {
    if (!audioFile) return;
    const objectUrl = URL.createObjectURL(audioFile);
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => { setAudioDurationMs(Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : null); URL.revokeObjectURL(objectUrl); };
    audio.onerror = () => { setAudioDurationMs(null); URL.revokeObjectURL(objectUrl); };
    audio.src = objectUrl;
    return () => { audio.src = ""; URL.revokeObjectURL(objectUrl); };
  }, [audioFile]);

  function chooseAudioFile(file: File | null) {
    setAudioDurationMs(null);
    setAudioFile(file);
  }

  function switchMode(next: ObservatoryMode) {
    stopAll("Mode changed");
    setMode(next);
    setLiveActivated(false);
    setMessage(next === "synthetic" ? "Synthetic Preview is deterministic and never contacts Deepgram." : "Activate Live Lab Mode before any guarded request can be prepared.");
    clearRun();
  }

  function selectPreset(next: ObservatoryPresetId) {
    if (run?.activeRequestCount) {
      setMessage("Credit Guard blocked preset navigation because another Observatory operation is active. Stop or reset the current run first.");
      return;
    }
    setPresetId(next);
  }

  function loadSyntheticPreview() {
    const next = beginRun({ mode: "synthetic", presetId: "northstar-agent", operation: "Northstar Home Goods synthetic preview", settings: { fixture: "northstar-home-goods-v1", networkRequests: 0 } });
    for (const fixture of SYNTHETIC_NORTHSTAR_EVENTS) {
      addEvent({ eventType: fixture.eventType, source: "synthetic-fixture", stage: fixture.stage, provenance: "simulated", value: fixture.value, severity: "severity" in fixture ? fixture.severity : "info", payload: { fixture: true, offsetMs: fixture.offsetMs } });
    }
    updateRun({ status: "completed", completedAt: nowIso(), metrics: [{ id: "fixture-events", label: "Fixture events", value: String(SYNTHETIC_NORTHSTAR_EVENTS.length), provenance: "simulated", definition: "Deterministic fictional events loaded locally." }, { id: "order-id-signal", label: "Order-ID exact match", value: "Failed on 1 synthetic fixture", provenance: "simulated", definition: "A deterministic client-level regression signal, not a production accuracy claim." }], notes: ["Synthetic Northstar data is fictional and made no Deepgram request.", "The degraded order-ID signal is a diagnosis prompt, not evidence of current Deepgram model quality."] });
    setMessage(`Synthetic run ${next.runId} loaded. No network request was made.`);
  }

  function openSpeakWatchFromGuide() {
    stopAll("Presenter moved to Speak and Watch");
    clearRun();
    setMode("live");
    setLiveActivated(false);
    setPresetId("speak-watch");
    setMessage(openLabMode ? "Speak and Watch is prepared. Activate Live Lab, then Start explicitly." : "Speak and Watch is prepared. Activate Live Lab, then review the one-session confirmation before starting.");
  }

  function openNorthstarFromGuide() {
    stopAll("Presenter moved to Northstar synthetic diagnosis");
    clearRun();
    setMode("synthetic");
    setLiveActivated(false);
    setPresetId("northstar-agent");
    loadSyntheticPreview();
  }

  function openExperimentFromGuide() {
    stopAll("Presenter moved to the narrow experiment");
    clearRun();
    setMode("live");
    setLiveActivated(false);
    setPresetId("compare-configs");
    setMessage("Narrow experiment prepared: use the same audio and nova-3 model; change only smart_format. No request has started.");
  }

  function resetDemoState() {
    const pending = confirmation;
    setConfirmation(null);
    pending?.resolve(false);
    stopAll("Demo state reset");
    void deleteGeneratedAudio(audioUrl);
    setAudioUrl(null);
    setAudioFile(null);
    setAudioDurationMs(null);
    setUseIncludedAudio(true);
    setReferenceText("");
    setModelA("nova-3");
    setModelB("nova-3");
    setSmartA(true);
    setSmartB(false);
    setVoiceLoopGroundTruth(false);
    setIncludeTranscript(false);
    setManagementEnabled(false);
    setProjectHandle("");
    setManagementNote("Read-only cost lookup is off.");
    setMode("synthetic");
    setLiveActivated(false);
    setPresetId("guided-demo");
    setSelectedEvent(null);
    setPulse({});
    setElapsedMs(0);
    clearRun();
    setMessage("Demo state reset. Local drafts, saved runs, and learning progress were preserved; no request was started.");
  }

  function requestConfirmation(details: ObservatoryConfirmation, replacingStoppedMic = false) {
    if (!liveActivated || mode !== "live") { setMessage("Activate Live Lab Mode before preparing a billable request."); return Promise.resolve(false); }
    if (run?.activeRequestCount && !replacingStoppedMic) { setMessage("Credit Guard blocked the request because another Observatory operation is active."); return Promise.resolve(false); }
    if (openLabMode) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => setConfirmation({ ...details, resolve }));
  }

  function closeConfirmation(approved: boolean) {
    const pending = confirmation;
    setConfirmation(null);
    pending?.resolve(approved);
  }

  async function confirmMicStart(config: NovaLiveRecognitionConfig, context?: { restartingAfterCleanup: boolean }) {
    const languageLabel = config.mode === "known-language"
      ? `${getDeepgramNova3LanguageOption(config.language)?.name ?? config.language} (${config.language})`
      : "Nova-3 multilingual (multi)";
    const approved = await requestConfirmation({ operation: "Speak and Watch — realtime STT", model: `${config.model} / ${languageLabel}`, expectedInput: "User-selected microphone, maximum 60 seconds", billableRequests: 1, safetyLimit: "One streaming session; automatic retry disabled" }, context?.restartingAfterCleanup === true);
    if (!approved) return false;
    micInspectorEventsSeenRef.current = 0;
    beginRun({ mode: "live", presetId: "speak-watch", operation: "Speak and Watch", settings: { model: config.model, recognitionMode: config.mode, language: config.language, languageProvenance: "configured", endpointVersion: "v1", sessionLimitSeconds: 60, automaticRetry: false, tag: "avs_observatory_live" } });
    updateRun({ activeRequestCount: 1, sessionRequestCount: 1, costState: managementEnabled ? "Pending" : "Unavailable" });
    setMessage("Speak and Watch is starting. The 60-second hard stop is armed.");
    return true;
  }

  function handleMicEvent(event: { at: string; type: string; detail?: string; data?: unknown }) {
    const stage = stageForMicEvent(event.type);
    const source = event.type.startsWith("transcript") || event.type.includes("deepgram") || event.type === "language_observed" || event.type === "speech_final" || event.type === "SpeechStarted" || event.type === "UtteranceEnd" ? "deepgram-stt" : "browser";
    addEvent({ eventType: event.type, source, stage, provenance: "measured", value: event.detail, payload: event.data, severity: event.type.includes("error") ? "error" : "info" });
  }

  function handleMicInspector(inspector: InspectorRecord) {
    if (!run || run.mode !== "live" || run.presetId !== "speak-watch") return;
    updateRun({ inspector });
    const response = inspector.response.bodyPreview as { requestId?: string; finalTranscript?: string; chunkStats?: { chunksSent?: number; totalBytesSent?: number; firstChunkAt?: string }; connection?: { websocket?: string; recorder?: string } } | undefined;
    const requestId = response?.requestId;
    if (requestId && !run.requestIds.includes(requestId)) {
      addEvent({ eventType: "request_id_captured", source: "deepgram-stt", stage: "stt", provenance: "measured", requestId, value: requestId });
      void lookupCost(requestId, false);
    }
    const chunks = response?.chunkStats?.chunksSent ?? 0;
    const firstAudioEvent = run.events.find((event) => event.eventType === "audio_chunk_sent");
    const firstTranscriptEvent = run.events.find((event) => event.eventType === "transcript_interim" || event.eventType === "transcript_final");
    const firstTranscriptLatency = firstAudioEvent && firstTranscriptEvent
      ? `${Math.max(0, firstTranscriptEvent.monotonicOffsetMs - firstAudioEvent.monotonicOffsetMs)} ms`
      : "Unavailable";
    setMetrics([
      { id: "duration", label: "Session duration", value: formatDuration(elapsedMs), provenance: "measured", definition: "Local elapsed time from confirmed run start." },
      { id: "chunks", label: "Chunks sent", value: String(chunks), provenance: "measured", definition: "MediaRecorder chunks accepted by the open WebSocket client." },
      { id: "bytes", label: "Bytes sent", value: String(response?.chunkStats?.totalBytesSent ?? 0), provenance: "measured", definition: "Aggregate browser Blob bytes sent to the socket." },
      { id: "first-transcript", label: "Audio send → first transcript", value: firstTranscriptLatency, provenance: firstTranscriptLatency === "Unavailable" ? "unavailable" : "measured", definition: "Local monotonic difference from the first successfully sent audio chunk to the first non-empty interim or final transcript event." },
      { id: "request-id", label: "Deepgram request ID", value: requestId || "Unavailable", provenance: requestId ? "measured" : "unavailable", definition: "Request ID captured from a Deepgram Metadata event when available." },
      { id: "accuracy", label: "Accuracy", value: "Unavailable — no ground truth", provenance: "unavailable", definition: "Live speech has no supplied reference transcript." },
    ]);
    if (response?.finalTranscript) updateRun({ transcript: response.finalTranscript });
  }

  function handleMicActive(active: boolean) {
    if (!run || run.presetId !== "speak-watch") return;
    updateRun(active ? { activeRequestCount: 1, status: "running" } : { activeRequestCount: 0, status: run.status === "error" ? "error" : "stopped", completedAt: nowIso() });
  }

  async function runCompare() {
    if (!useIncludedAudio && !audioFile) { setMessage("Choose an audio file or use the included hosted sample."); return; }
    if (audioFile && audioFile.size > MAX_UPLOAD_BYTES) { setMessage("Credit Guard blocked this file because it exceeds the 64 MB Observatory fallback limit."); return; }
    if (audioDurationMs !== null && audioDurationMs > 300_000) { setMessage("Credit Guard blocked this file because its measured duration exceeds five minutes."); return; }
    const approved = await requestConfirmation({ operation: "Compare Two Configurations — prerecorded STT A/B", model: `${modelA} and ${modelB}`, expectedInput: useIncludedAudio ? "Included short hosted audio" : `${audioFile?.name} · ${audioDurationMs ? formatDuration(audioDurationMs) : "duration unavailable"}`, billableRequests: 2, safetyLimit: "Sequential requests only; maximum five minutes when duration is available" });
    if (!approved) return;
    beginRun({ mode: "live", presetId: "compare-configs", operation: "Compare Two Configurations", settings: { configurationA: { model: modelA, smart_format: smartA }, configurationB: { model: modelB, smart_format: smartB }, audioSource: useIncludedAudio ? INCLUDED_AUDIO_URL : audioFile?.name, tag: "avs_stt_experiment" } });
    updateRun({ activeRequestCount: 1, sessionRequestCount: 0, costState: managementEnabled ? "Pending" : "Unavailable", referenceTranscript: referenceText.trim() || undefined });
    try {
      const a = await executeStt({ model: modelA, smartFormat: smartA, tag: "avs_stt_experiment" });
      if (!mountedRef.current) return;
      const b = await executeStt({ model: modelB, smartFormat: smartB, tag: "avs_stt_experiment" });
      const completedAt = nowIso();
      const wer = referenceText.trim() ? wordErrorRate(referenceText, b.data.transcript) : null;
      updateRun({ status: "completed", completedAt, activeRequestCount: 0, transcript: a.data.transcript, comparisonTranscript: b.data.transcript, inspector: b.inspector, notes: ["Two sequential requests used the same audio source.", referenceText.trim() ? "WER uses the supplied reference transcript." : "No accuracy or WER is shown because no reference transcript was supplied."] });
      setMetrics([{ id: "requests", label: "Billable requests", value: "2", provenance: "measured", definition: "Two completed prerecorded STT route calls." }, { id: "diff", label: "Word positions changed", value: String(transcriptDiff(a.data.transcript, b.data.transcript).filter((item) => !item.match).length), provenance: "derived", definition: "Simple normalized positional transcript difference." }, ...(wer ? [{ id: "wer", label: "WER", value: `${(wer.value * 100).toFixed(1)}%`, provenance: "derived" as const, definition: `${wer.errors} edit operations across ${wer.referenceWords} reference words.` }] : [])]);
      setMessage("Configuration comparison completed. Results are descriptive for this audio only.");
    } catch (error) { finishError(error); }
  }

  async function runSingleStt() {
    if (!useIncludedAudio && !audioFile) { setMessage("Choose an audio file or use the included hosted sample."); return; }
    if (audioFile && audioFile.size > MAX_UPLOAD_BYTES) { setMessage("Credit Guard blocked this file because it exceeds the 64 MB Observatory fallback limit."); return; }
    if (audioDurationMs !== null && audioDurationMs > 300_000) { setMessage("Credit Guard blocked this file because its measured duration exceeds five minutes."); return; }
    const approved = await requestConfirmation({ operation: "Prerecorded STT — Configuration A only", model: modelA, expectedInput: useIncludedAudio ? "Included short hosted audio" : `${audioFile?.name} · ${audioDurationMs ? formatDuration(audioDurationMs) : "duration unavailable"}`, billableRequests: 1, safetyLimit: "One request; maximum five minutes when duration is available" });
    if (!approved) return;
    beginRun({ mode: "live", presetId: "compare-configs", operation: "Prerecorded STT — Configuration A", settings: { model: modelA, smart_format: smartA, audioSource: useIncludedAudio ? INCLUDED_AUDIO_URL : audioFile?.name, tag: "avs_stt_experiment" } });
    updateRun({ activeRequestCount: 1, sessionRequestCount: 0, costState: managementEnabled ? "Pending" : "Unavailable", referenceTranscript: referenceText.trim() || undefined });
    try {
      const result = await executeStt({ model: modelA, smartFormat: smartA, tag: "avs_stt_experiment" });
      const requestId = requestIdFromTranscription(result.data.raw);
      const wer = referenceText.trim() ? wordErrorRate(referenceText, result.data.transcript) : null;
      updateRun({ status: "completed", completedAt: nowIso(), activeRequestCount: 0, transcript: result.data.transcript, comparisonTranscript: result.data.transcript, inspector: result.inspector, requestIds: requestId ? [requestId] : [], notes: [referenceText.trim() ? "WER uses the supplied reference transcript." : "No accuracy or WER is shown because no reference transcript was supplied."] });
      setMetrics([{ id: "requests", label: "Billable requests", value: "1", provenance: "measured", definition: "One completed prerecorded STT route call." }, ...(wer ? [{ id: "wer", label: "WER", value: `${(wer.value * 100).toFixed(1)}%`, provenance: "derived" as const, definition: `${wer.errors} edit operations across ${wer.referenceWords} reference words.` }] : [])]);
      if (requestId) void lookupCost(requestId, false);
      setMessage("Single prerecorded STT request completed. No second configuration was run.");
    } catch (error) { finishError(error); }
  }

  async function runTts(italian = false) {
    const text = (italian ? italianText : ttsText).trim();
    const max = italian ? 200 : 500;
    if (!text || text.length > max) { setMessage(`Enter between 1 and ${max} characters.`); return; }
    const model = italian ? "aura-2-livia-it" : "aura-2-thalia-en";
    const approved = await requestConfirmation({ operation: italian ? "Italian Voice Path — TTS" : "Hear the API — TTS", model, expectedInput: `${text.length} characters`, billableRequests: 1, safetyLimit: `${max}-character maximum; no replay or regeneration` });
    if (!approved) return;
    const id = italian ? "italian-path" : "hear-api";
    beginRun({ mode: "live", presetId: id, operation: italian ? "Italian Voice Path" : "Hear the API", settings: { model, textLength: text.length, observatory: true } });
    updateRun({ activeRequestCount: 1, sessionRequestCount: 1, costState: managementEnabled ? "Pending" : "Unavailable" });
    try {
      const result = await executeTts(text, model);
      setAudioUrl(result.data.audioUrl);
      updateRun({ status: "completed", completedAt: nowIso(), activeRequestCount: 0, inspector: result.inspector, requestIds: result.data.requestId ? [result.data.requestId] : [], notes: italian ? ["This verifies one documented Italian synthesis path. It is not translation and does not establish general language quality."] : ["Server response availability and browser playback are measured separately."] });
      setMetrics([{ id: "duration", label: "Request duration", value: `${result.inspector.durationMs} ms`, provenance: "measured", definition: "Local server-route request duration." }, { id: "bytes", label: "Generated bytes", value: String(result.data.byteSize), provenance: "measured", definition: "Buffered audio byte length returned by Deepgram." }, { id: "quality", label: "Voice quality", value: "Unavailable — not human rated", provenance: "unavailable", definition: "No generic quality score is inferred." }]);
      if (result.data.requestId) void lookupCost(result.data.requestId, false);
      setMessage("TTS completed. Playback occurs only when you press Play.");
    } catch (error) { finishError(error); }
  }

  async function runVoiceLoop() {
    const text = ttsText.trim();
    if (!text || text.length > 200) { setMessage("Voice Loop requires 1–200 characters."); return; }
    const approved = await requestConfirmation({ operation: "Voice Loop — TTS then prerecorded STT", model: "aura-2-thalia-en → nova-3", expectedInput: `${text.length} characters`, billableRequests: 2, safetyLimit: "One sequential round trip; no loop or automatic retry" });
    if (!approved) return;
    beginRun({ mode: "live", presetId: "voice-loop", operation: "Voice Loop", settings: { ttsModel: "aura-2-thalia-en", sttModel: "nova-3", textLength: text.length, tag: "avs_round_trip", groundTruthOptIn: voiceLoopGroundTruth } });
    updateRun({ activeRequestCount: 1, sessionRequestCount: 0, costState: managementEnabled ? "Pending" : "Unavailable", referenceTranscript: voiceLoopGroundTruth ? text : undefined });
    try {
      const tts = await executeTts(text, "aura-2-thalia-en");
      const audioResponse = await fetch(tts.data.audioUrl, { cache: "no-store", signal: abortRef.current?.signal });
      if (!audioResponse.ok) throw new Error("The locally buffered TTS audio could not be loaded for the STT handoff.");
      const blob = await audioResponse.blob();
      const stt = await executeSttBlob(new File([blob], "voice-loop.mp3", { type: tts.data.contentType }), "nova-3", true, "avs_round_trip");
      await deleteGeneratedAudio(tts.data.audioUrl);
      const requestIds = [tts.data.requestId, requestIdFromTranscription(stt.data.raw)].filter((value): value is string => Boolean(value));
      const wer = voiceLoopGroundTruth ? wordErrorRate(text, stt.data.transcript) : null;
      updateRun({ status: "completed", completedAt: nowIso(), activeRequestCount: 0, transcript: text, comparisonTranscript: stt.data.transcript, inspector: stt.inspector, requestIds, notes: ["One generated voice and one recognition pass do not establish general model quality.", voiceLoopGroundTruth ? "The original text was intentionally selected as ground truth." : "WER is hidden because ground-truth use was not selected."] });
      setMetrics([{ id: "requests", label: "Billable requests", value: "2", provenance: "measured", definition: "One TTS request and one prerecorded STT request." }, { id: "changed", label: "Word positions changed", value: String(transcriptDiff(text, stt.data.transcript).filter((item) => !item.match).length), provenance: "derived", definition: "Normalized positional text difference." }, ...(wer ? [{ id: "wer", label: "WER", value: `${(wer.value * 100).toFixed(1)}%`, provenance: "derived" as const, definition: "Computed only because the original text was explicitly designated ground truth." }] : [])]);
      for (const requestId of requestIds) void lookupCost(requestId, false);
      setMessage("Voice Loop completed once. No repeat was scheduled.");
    } catch (error) { finishError(error); }
  }

  async function executeStt(options: { model: string; smartFormat: boolean; tag: "avs_stt_experiment" }) {
    if (useIncludedAudio) {
      return executeEnvelope<TranscriptionResponse>("/api/deepgram/transcribe-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: INCLUDED_AUDIO_URL, model: options.model, language: "en", smart_format: options.smartFormat, tag: options.tag, observatory: true }) }, "stt");
    }
    if (!audioFile) throw new Error("Choose an audio file.");
    return executeSttBlob(audioFile, options.model, options.smartFormat, options.tag, audioDurationMs ?? undefined);
  }

  async function executeSttBlob(file: File, model: string, smartFormat: boolean, tag: "avs_stt_experiment" | "avs_round_trip", durationMs?: number) {
    const form = new FormData();
    form.set("file", file); form.set("model", model); form.set("language", "en"); form.set("smart_format", String(smartFormat)); form.set("tag", tag); form.set("observatory", "true");
    if (durationMs !== undefined) form.set("duration_ms", String(durationMs));
    return executeEnvelope<TranscriptionResponse>("/api/deepgram/transcribe-file", { method: "POST", body: form }, "stt");
  }

  async function executeTts(text: string, model: string) {
    return executeEnvelope<TtsResponseData>("/api/deepgram/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, model, observatory: true }) }, "tts-playback");
  }

  async function executeEnvelope<T>(url: string, init: RequestInit, stage: ObservatoryStage) {
    if (abortRef.current) throw new Error("Credit Guard blocked overlapping Observatory fetches.");
    const controller = new AbortController(); abortRef.current = controller;
    updateRun((current) => ({ activeRequestCount: 1, sessionRequestCount: current.sessionRequestCount + 1 }));
    addEvent({ eventType: "local_request_started", source: "local-server", stage, provenance: "measured", value: url, payload: { url, method: init.method } });
    try {
      const response = await fetch(url, { ...init, cache: "no-store", signal: controller.signal });
      const envelope = await response.json() as ApiDebugEnvelope<T>;
      if (!response.ok || !envelope.ok || !envelope.data) throw new Error(envelope.error?.message || `Local route returned HTTP ${response.status}.`);
      const requestId = stage === "tts-playback" ? (envelope.data as unknown as TtsResponseData).requestId : requestIdFromTranscription((envelope.data as unknown as TranscriptionResponse).raw);
      addEvent({ eventType: "deepgram_response_received", source: stage === "tts-playback" ? "deepgram-tts" : "deepgram-stt", stage, provenance: "measured", requestId, durationMs: envelope.inspector.durationMs, payload: envelope.inspector.response.bodyPreview });
      return { data: envelope.data, inspector: envelope.inspector };
    } finally { abortRef.current = null; updateRun({ activeRequestCount: 0 }); }
  }

  async function enableManagement() {
    setManagementNote("Resolving a project through a single read-only request...");
    const result = await managementRequest({ action: "resolve-project" });
    if (!result) return;
    const handle = result.projectHandle || result.projects?.[0]?.handle || "";
    setProjectHandle(handle); setManagementEnabled(Boolean(handle)); setManagementNote(`${result.state}: ${result.note}`);
  }

  async function lookupCost(requestId: string, delayed: boolean) {
    if (!managementEnabled || !projectHandle || !requestId) return;
    const result = await managementRequest({ action: "get-request-cost", projectHandle, requestId });
    if (!result) return;
    updateRun({ costState: result.state, actualCostUsd: result.actualCostUsd });
    setManagementNote(result.note);
    if (result.state === "Pending" && !delayed && run?.status !== "stopped") {
      if (costTimerRef.current !== null) window.clearTimeout(costTimerRef.current);
      costTimerRef.current = window.setTimeout(() => { costTimerRef.current = null; void lookupCost(requestId, true); }, 5_000);
    }
  }

  async function inspectManagement(action: "get-balances" | "usage-breakdown") {
    if (!managementEnabled || !projectHandle) return;
    const result = await managementRequest({ action, projectHandle });
    if (!result) return;
    const balance = result.balanceAmount !== undefined ? ` ${result.balanceAmount} ${result.balanceUnit || "API-reported units"}.` : "";
    setManagementNote(`${result.note}${balance} Reported ${result.reportedAt}.`);
  }

  async function managementRequest(body: Record<string, unknown>) {
    try {
      const response = await fetch("/api/deepgram/observatory/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
      const envelope = await response.json() as ApiDebugEnvelope<ObservatoryManagementResult>;
      const result = envelope.data;
      if (!result) throw new Error(envelope.error?.message || "Read-only Management response was unavailable.");
      addEvent({ eventType: response.ok ? "management_read_completed" : "management_read_unavailable", source: "deepgram-manage", stage: "outcome", provenance: "measured", value: result.state, payload: { state: result.state, note: result.note } });
      if (!response.ok && result.state === "Management scope unavailable") { setManagementEnabled(false); updateRun({ costState: result.state }); }
      return result;
    } catch (error) { setManagementNote(errorMessage(error)); updateRun({ costState: "Unavailable" }); return null; }
  }

  function stopAll(reason = "User requested Stop") {
    setStopSignal((value) => value + 1);
    abortRef.current?.abort(); abortRef.current = null;
    if (costTimerRef.current !== null) { window.clearTimeout(costTimerRef.current); costTimerRef.current = null; }
    const audio = audioRef.current; if (audio) { audio.pause(); audio.currentTime = 0; }
    if (run?.status === "running") { addEvent({ eventType: "run_stopped", source: "browser", stage: "outcome", provenance: "measured", value: reason }); updateRun({ status: "stopped", completedAt: nowIso(), activeRequestCount: 0 }); }
    setMessage(`${reason}. Pending work, playback, microphone capture, and delayed cost lookup were stopped.`);
  }

  function clearCurrentRun() { stopAll("Clear run requested"); void deleteGeneratedAudio(audioUrl); setAudioUrl(null); setSelectedEvent(null); clearRun(); setElapsedMs(0); setMessage("Run cleared. No new request was started."); }

  function saveMetadata() {
    if (!run) { setMessage("There is no run to save."); return; }
    if (includeTranscript && !window.confirm("Include sanitized transcript text in localStorage? Metadata-only storage is safer and remains the default.")) return;
    saveObservatoryRun(run, includeTranscript); setSavedCount(loadObservatoryHistory().length); setMessage(includeTranscript ? "Run metadata and opted-in sanitized transcript were saved locally." : "Run metadata was saved locally without transcript text.");
  }

  function exportRun(format: "json" | "md") {
    if (!run) { setMessage("There is no run to export."); return; }
    if (includeTranscript && !window.confirm("Include sanitized transcript text in this export?")) return;
    const exportEvents = includeTranscript
      ? run.events
      : run.events.map((event) => {
          const { sanitizedPayload, ...metadata } = event;
          void sanitizedPayload;
          return /transcript/i.test(event.eventType) ? { ...metadata, value: "[transcript omitted]" } : metadata;
        });
    const exportValue = sanitizeObservatoryArtifact({ ...run, events: exportEvents, inspector: includeTranscript ? run.inspector : undefined, transcript: includeTranscript ? run.transcript : undefined, comparisonTranscript: includeTranscript ? run.comparisonTranscript : undefined, referenceTranscript: includeTranscript ? run.referenceTranscript : undefined, transcriptDisclosure: includeTranscript ? "Sanitized transcript included after explicit approval." : "Transcript content omitted.", disclosure: run.mode === "live" ? "Controlled local live demonstration; billable requests require confirmation." : "Deterministic fictional synthetic preview; no Deepgram requests.", limitations: ["Heat is not causality.", "Bounded lab runs are not production benchmarks.", "Live account behavior remains ready for manual verification until the user completes the checklist."] });
    const json = assertObservatoryArtifactSafe(exportValue);
    const content = format === "json" ? JSON.stringify(JSON.parse(json), null, 2) : markdownRun(JSON.parse(json) as ObservatoryRun);
    download(safeDownloadName(run.runId, format === "json" ? "json" : "md"), content, format === "json" ? "application/json" : "text/markdown");
  }

  function finishError(error: unknown) { if (isAbortError(error)) return; const text = errorMessage(error); updateRun({ status: "error", completedAt: nowIso(), activeRequestCount: 0, error: text }); addEvent({ eventType: "run_error", source: "local-server", stage: "outcome", provenance: "measured", value: text, severity: "error" }); setMessage(text); }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-[#03070b]" aria-label="Live Observatory Lab workspace">
      <header className="shrink-0 border-b border-white/10 bg-[#071119] px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={mode === "live" ? "live" : "synthetic"}>{mode === "live" ? "LIVE LAB" : "SYNTHETIC PREVIEW"}</Badge>
          {mode === "live" && run?.activeRequestCount ? <Badge tone="live">LIVE NOW</Badge> : null}
          <Badge>{initialKeyDetected ? "API configured" : "API key unavailable"}</Badge>
          <Meta label="API" value={apiConnectionState} />
          <Meta label="Operation" value={run?.operation || preset.title} />
          <Meta label="Run ID" value={run?.runId || "not started"} />
          <Meta label="Elapsed" value={formatDuration(run?.status === "running" ? elapsedMs : run ? Math.max(0, Date.parse(run.completedAt || nowIso()) - Date.parse(run.startedAt)) : 0)} />
          <Meta label="Active" value={String(run?.activeRequestCount ?? 0)} />
          <Meta label="Session requests" value={String(run?.sessionRequestCount ?? 0)} />
          <Meta label="Cost" value={run?.actualCostUsd !== undefined ? `$${run.actualCostUsd.toFixed(6)} Actual cost` : run?.costState || "Unavailable"} />
          <Meta label="Redaction" value={serializeRedactionValues(redactionPolicy).join(" + ") || "Off"} />
          <div className="ml-auto flex flex-wrap gap-1.5">
            <Button onClick={() => stopAll()} disabled={!run || (run.status !== "running" && !audioUrl)} shortcutCommand="stop_session" shortcutLabel="Stop current session" disabledReason="No Observatory run or generated playback is active.">Stop<ShortcutHint command="stop_session" /></Button>
            <Button onClick={clearCurrentRun} disabled={!run}>Clear run</Button>
            <Button onClick={resetDemoState} disabled={run?.status === "running"} shortcutCommand="reset_current" shortcutLabel="Reset current module" disabledReason="Stop the active Observatory run before resetting.">Reset Demo State<ShortcutHint command="reset_current" /></Button>
            <Button onClick={saveMetadata} disabled={!run}>Save metadata</Button>
            <Button onClick={() => exportRun("json")} disabled={!run}>Export JSON</Button>
            <Button onClick={() => exportRun("md")} disabled={!run}>Export Markdown</Button>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-amber-100">Live Lab Mode sends billable requests to the configured Deepgram project. {openLabMode ? "Each labeled action runs once from your explicit click; there is no automatic retry." : "Requests run only after explicit confirmation."}</p>
      </header>

      <div className="grid h-0 min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)_minmax(320px,390px)] overflow-hidden max-[1180px]:grid-cols-[190px_minmax(0,1fr)]" data-testid="observatory-layout">
        <nav className="min-h-0 overflow-auto border-r border-white/10 bg-[#050b11] p-2" style={{ contain: "layout paint" }} aria-label="Observatory presets">
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-black/25 p-1">
            <ModeButton active={mode === "synthetic"} onClick={() => switchMode("synthetic")}>Synthetic</ModeButton>
            <ModeButton active={mode === "live"} onClick={() => switchMode("live")}>Live Lab</ModeButton>
          </div>
          {mode === "live" ? <button type="button" data-pocket-guard="ignore" onClick={() => setLiveActivated((value) => !value)} className={`mt-2 w-full rounded-lg border px-3 py-2 text-left text-xs font-semibold ${liveActivated ? "border-rose-300/40 bg-rose-300/10 text-rose-100" : "border-amber-300/30 bg-amber-300/10 text-amber-100"}`}>{liveActivated ? "Live Lab activated" : "Activate Live Lab"}<span className="mt-1 block text-[10px] font-normal opacity-75">Activation prepares controls. It does not send a request.</span></button> : null}
          <p className="mt-4 px-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Real demo presets</p>
          <div className="mt-2 space-y-1">
            {OBSERVATORY_PRESETS.map((item) => <button key={item.id} type="button" data-pocket-guard="ignore" onClick={() => selectPreset(item.id)} aria-pressed={presetId === item.id} className={`w-full rounded-lg border px-3 py-2 text-left ${presetId === item.id ? "border-cyan-300/35 bg-cyan-300/10 text-white" : "border-transparent text-slate-400 hover:bg-white/5 hover:text-white"}`}><span className="block text-xs font-semibold">{item.title}</span><span className="mt-1 block text-[10px] text-slate-500">{item.mode === "guide" ? "Presenter guide · 0 requests" : item.mode === "conditional" ? "Conditional / disabled" : `${item.billableRequests} billable request${item.billableRequests === 1 ? "" : "s"}`}</span></button>)}
          </div>
          <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-[10px] leading-5 text-slate-400"><p className="font-semibold text-slate-200">Saved history</p><p>{savedCount} local metadata run{savedCount === 1 ? "" : "s"}</p><button type="button" onClick={() => { deleteObservatoryTranscripts(); setMessage("Saved transcript text was deleted independently from run metadata."); }} className="mt-2 text-cyan-200 underline">Delete saved transcripts</button></div>
        </nav>

        <main className="min-h-0 min-w-0 overflow-auto p-3" style={{ contain: "layout paint" }}>
          <Pipeline pulse={pulse} events={run?.events ?? []} />
          <div role="status" aria-live="polite" className="mt-3 rounded-lg border border-white/10 bg-[#071018] px-3 py-2 text-xs text-slate-300">{message}</div>
          {presetId === "guided-demo" ? <GuidedDemoGuide onOpenSpeakWatch={openSpeakWatchFromGuide} onOpenNorthstar={openNorthstarFromGuide} onOpenExperiment={openExperimentFromGuide} onOpenApiStudio={() => onOpenApiStudio("stt-live")} onOpenCodeLab={() => onOpenCodeLab("live-mic", "TypeScript")} onOpenAppliedVoiceSystems={() => onOpenModule("applied-voice-systems")} onOpenWhitepaper={() => window.open("/avs-whitepaper", "_blank", "noopener,noreferrer")} onReset={resetDemoState} /> : mode === "synthetic" ? <SyntheticPanel run={run} onLoad={loadSyntheticPreview} /> : (
            <div className="mt-3 space-y-3">
              <PresetIntro preset={preset} />
              {presetId === "speak-watch" ? <BrowserMicCard language="en" guidedHints redactionPolicy={redactionPolicy} onRedactionPolicyChange={onRedactionPolicyChange} onOpenModule={onOpenModule} onResult={(result) => updateRun({ transcript: result.transcript })} onInspectorChange={handleMicInspector} showInlineInspector={false} observatory={{ beforeStart: confirmMicStart, singleAttempt: true, maxDurationMs: 60_000, onEvent: handleMicEvent, onSessionActiveChange: handleMicActive, stopSignal }} /> : null}
              {presetId === "compare-configs" ? <CompareControls useIncludedAudio={useIncludedAudio} setUseIncludedAudio={setUseIncludedAudio} file={audioFile} setFile={chooseAudioFile} durationMs={audioDurationMs} referenceText={referenceText} setReferenceText={setReferenceText} modelA={modelA} modelB={modelB} setModelA={setModelA} setModelB={setModelB} smartA={smartA} smartB={smartB} setSmartA={setSmartA} setSmartB={setSmartB} onRunSingle={runSingleStt} onRun={runCompare} diff={diff} wer={referenceWer} /> : null}
              {presetId === "hear-api" ? <TtsControls text={ttsText} setText={setTtsText} max={500} model="aura-2-thalia-en" onRun={() => runTts(false)} audioUrl={audioUrl} audioRef={audioRef} onPlaybackEvent={handlePlaybackEvent} /> : null}
              {presetId === "voice-loop" ? <VoiceLoopControls text={ttsText} setText={setTtsText} groundTruth={voiceLoopGroundTruth} setGroundTruth={setVoiceLoopGroundTruth} onRun={runVoiceLoop} diff={diff} wer={referenceWer} /> : null}
              {presetId === "italian-path" ? <TtsControls text={italianText} setText={setItalianText} max={200} model="aura-2-livia-it" onRun={() => runTts(true)} audioUrl={audioUrl} audioRef={audioRef} onPlaybackEvent={handlePlaybackEvent} italian /> : null}
              {presetId === "northstar-agent" ? <DisabledAgent /> : null}
            </div>
          )}
        </main>

        <aside className="min-h-0 overflow-auto border-l border-white/10 bg-[#050b11] p-3 max-[1180px]:hidden" style={{ contain: "layout paint" }} aria-label="Observatory trace and inspector">
          <div className="flex items-center justify-between gap-2"><h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-300">Live trace</h3><Badge>{run?.mode || mode}</Badge></div>
          <div className="mt-3 max-h-48 space-y-1 overflow-auto" aria-label="Observatory event trace">{run?.events.length ? run.events.slice().reverse().map((event) => <button key={event.localEventId} type="button" onClick={() => setSelectedEvent(event)} className="w-full rounded border border-white/10 bg-black/20 p-2 text-left hover:border-cyan-300/30"><span className="flex justify-between gap-2 text-[10px]"><span className="font-mono text-cyan-200">{event.eventType}</span><span className="text-slate-600">+{event.monotonicOffsetMs}ms</span></span><span className="mt-1 block text-[10px] text-slate-400">{event.stage} · {event.provenance} · {event.source}</span></button>) : <Empty text="Start a synthetic fixture or confirmed live run to populate the trace." />}</div>
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-[0.15em] text-slate-300">Measured metrics</h3>
          <div className="mt-2 grid grid-cols-2 gap-2">{run?.metrics.length ? run.metrics.map((metric) => <div key={metric.id} title={metric.definition} className="rounded border border-white/10 bg-black/20 p-2"><p className="text-[9px] uppercase text-slate-500">{metric.label}</p><p className="mt-1 text-xs font-semibold text-white">{metric.value}</p><p className="mt-1 text-[9px] text-cyan-300">{metric.provenance}</p></div>) : <Empty text="No metrics yet." />}</div>
          <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3"><h3 className="text-xs font-semibold text-white">Read-only usage and cost</h3><p className="mt-1 text-[10px] leading-4 text-slate-400">{managementNote}</p><div className="mt-2 flex flex-wrap gap-2"><Button onClick={enableManagement} disabled={managementEnabled}>{managementEnabled ? "Read-only access enabled" : "Enable read-only lookup"}</Button><Button onClick={() => void inspectManagement("get-balances")} disabled={!managementEnabled}>Check balance</Button><Button onClick={() => void inspectManagement("usage-breakdown")} disabled={!managementEnabled}>Usage snapshot</Button><Button onClick={() => run?.requestIds.at(-1) && lookupCost(run.requestIds.at(-1)!, true)} disabled={!managementEnabled || !run?.requestIds.length}>Refresh request cost</Button></div></div>
          <label className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300/15 bg-amber-300/5 p-2 text-[10px] text-amber-100"><input type="checkbox" checked={includeTranscript} onChange={(event) => setIncludeTranscript(event.target.checked)} /><span>Include sanitized transcript in the next save/export. Off by default; confirmation is required.</span></label>
          <div className="mt-4"><PayloadInspector record={selectedInspector} title="Observatory Inspector" defaultOpen /></div>
          <p className="mt-4 rounded border border-violet-300/20 bg-violet-300/5 p-3 text-[10px] leading-5 text-violet-100">Heat is not causality. Live signals identify where investigation should begin.</p>
        </aside>
      </div>

      {!openLabMode && confirmation ? <ConfirmationDialog confirmation={confirmation} onClose={closeConfirmation} /> : null}
    </section>
  );

  function handlePlaybackEvent(type: "started" | "completed" | "interrupted") {
    addEvent({ eventType: `playback_${type}`, source: "browser", stage: "tts-playback", provenance: "measured", value: type });
  }
}

function Pipeline({ pulse, events }: { pulse: Partial<Record<ObservatoryStage, number>>; events: ObservatoryEvent[] }) {
  return <div className="grid grid-cols-7 gap-1" aria-label="Observatory pipeline">{OBSERVATORY_PIPELINE.map((stage, index) => { const active = Boolean(pulse[stage.id]); const used = events.some((event) => event.stage === stage.id); return <div key={stage.id} className="relative"><div data-stage={stage.id} data-pulsing={active ? "true" : "false"} className={`rounded-lg border px-2 py-3 text-center text-[10px] font-semibold transition motion-reduce:transition-none ${active ? "border-cyan-200 bg-cyan-200/20 text-cyan-50 shadow-[0_0_24px_rgba(34,211,238,.28)]" : used ? "border-cyan-300/20 bg-cyan-300/5 text-slate-200" : "border-white/10 bg-white/[0.02] text-slate-600"}`}>{stage.label}</div>{index < OBSERVATORY_PIPELINE.length - 1 ? <span className="absolute -right-1 top-1/2 z-10 -translate-y-1/2 text-slate-700">›</span> : null}</div>; })}</div>;
}

function SyntheticPanel({ run, onLoad }: { run: ObservatoryRun | null; onLoad: () => void }) {
  const loaded = run?.mode === "synthetic";
  return <div className="mt-3 grid gap-3 md:grid-cols-2"><div className="rounded-xl border border-violet-300/20 bg-violet-300/5 p-4"><Badge tone="synthetic">SYNTHETIC ONLY</Badge><h3 className="mt-3 text-lg font-semibold text-white">Northstar Home Goods</h3><p className="mt-2 text-sm leading-6 text-slate-400">A deterministic fictional call path for tests and shared demonstrations. Loading it performs no fetch, token request, WebSocket connection, or billable operation.</p><Button onClick={onLoad}>Load deterministic fixture</Button></div><div className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><h3 className="text-sm font-semibold text-white">Northstar client diagnosis</h3><div className="mt-3 rounded-lg border border-amber-300/25 bg-amber-300/[0.05] p-3"><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-amber-200">Degraded signal · simulated · n=1 fixture</p><p className="mt-1 text-xs font-semibold text-white">{loaded ? "Order-ID exact-match check failed" : "Load the fixture to reveal the diagnosis signal"}</p><p className="mt-1 text-[10px] leading-5 text-slate-400">Do not jump directly to model tuning. Inspect capture quality, interim/final events, normalization, downstream parsing, and the reference definition.</p></div><dl className="mt-3 grid grid-cols-[90px_1fr] gap-2 text-[10px]"><dt className="text-slate-500">Hypothesis</dt><dd className="text-slate-300">Alphanumeric and correction segments need isolated evaluation.</dd><dt className="text-slate-500">Narrow test</dt><dd className="text-slate-300">Same audio and nova-3 model; change only smart_format, then compare exact order-ID preservation.</dd><dt className="text-slate-500">Boundary</dt><dd className="text-slate-300">Synthetic evidence demonstrates method, not current Deepgram quality.</dd></dl><ul className="mt-3 space-y-1 text-[10px] text-slate-500"><li>Mode: synthetic</li><li>Deepgram requests: 0</li><li>Current events: {loaded ? run.events.length : 0}</li></ul></div></div>;
}

function PresetIntro({ preset }: { preset: (typeof OBSERVATORY_PRESETS)[number] }) { return <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-base font-semibold text-white">{preset.title}</h3><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">{preset.teaches}</p></div><Badge tone={preset.mode === "conditional" ? "synthetic" : "live"}>{preset.mode === "conditional" ? "DISABLED / CONDITIONAL" : `${preset.billableRequests} BILLABLE REQUEST${preset.billableRequests === 1 ? "" : "S"}`}</Badge></div><div className="mt-3 grid gap-2 text-[10px] text-slate-400 md:grid-cols-3"><span><b className="text-slate-200">Limit:</b> {preset.limit}</span><span><b className="text-slate-200">Success:</b> {preset.successCriteria}</span><span><b className="text-slate-200">Cleanup:</b> {preset.cleanup}</span></div></div>; }

function CompareControls(props: { useIncludedAudio: boolean; setUseIncludedAudio: (value: boolean) => void; file: File | null; setFile: (file: File | null) => void; durationMs: number | null; referenceText: string; setReferenceText: (value: string) => void; modelA: string; modelB: string; setModelA: (value: string) => void; setModelB: (value: string) => void; smartA: boolean; smartB: boolean; setSmartA: (value: boolean) => void; setSmartB: (value: boolean) => void; onRunSingle: () => void; onRun: () => void; diff: ReturnType<typeof transcriptDiff>; wer: ReturnType<typeof wordErrorRate> }) { return <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4"><div className="grid gap-3 md:grid-cols-2"><label className="text-xs text-slate-300"><input type="radio" checked={props.useIncludedAudio} onChange={() => props.setUseIncludedAudio(true)} /> Included short hosted sample</label><label className="text-xs text-slate-300"><input type="radio" checked={!props.useIncludedAudio} onChange={() => props.setUseIncludedAudio(false)} /> Explicit local upload</label></div>{!props.useIncludedAudio ? <label className="mt-3 block text-xs text-slate-300">Audio file<input aria-label="Observatory audio file" type="file" accept="audio/*" onChange={(event) => props.setFile(event.target.files?.[0] ?? null)} className="mt-1 block w-full rounded border border-white/10 bg-black/20 p-2" />{props.file ? <span className="mt-1 block text-[10px] text-slate-500">{props.file.name} · {props.durationMs === null ? "duration unavailable" : formatDuration(props.durationMs)}</span> : null}</label> : <p className="mt-3 font-mono text-[10px] text-slate-500">{INCLUDED_AUDIO_URL}</p>}<div className="mt-3 grid gap-3 md:grid-cols-2"><ConfigBox label="Configuration A" model={props.modelA} setModel={props.setModelA} smart={props.smartA} setSmart={props.setSmartA} /><ConfigBox label="Configuration B" model={props.modelB} setModel={props.setModelB} smart={props.smartB} setSmart={props.setSmartB} /></div><label className="mt-3 block text-xs text-slate-300">Optional reference transcript<textarea value={props.referenceText} onChange={(event) => props.setReferenceText(event.target.value)} placeholder="WER remains hidden without explicit ground truth." className="mt-1 min-h-20 w-full rounded border border-white/10 bg-black/25 p-2 text-white" /></label><div className="flex flex-wrap gap-2"><Button onClick={props.onRunSingle}>Confirm and run Configuration A only</Button><Button onClick={props.onRun}>Confirm and run two STT requests</Button></div>{props.diff.length ? <DiffView diff={props.diff} wer={props.wer} /> : null}</div>; }
function ConfigBox({ label, model, setModel, smart, setSmart }: { label: string; model: string; setModel: (value: string) => void; smart: boolean; setSmart: (value: boolean) => void }) { return <fieldset className="rounded-lg border border-white/10 p-3"><legend className="px-1 text-xs font-semibold text-white">{label}</legend><label className="block text-[10px] text-slate-400">Model<select value={model} onChange={(event) => setModel(event.target.value)} className="mt-1 h-9 w-full rounded border border-white/10 bg-[#071018] px-2 text-white"><option value="nova-3">nova-3</option></select></label><label className="mt-2 flex gap-2 text-xs text-slate-300"><input type="checkbox" checked={smart} onChange={(event) => setSmart(event.target.checked)} /> smart_format</label></fieldset>; }

function TtsControls({ text, setText, max, model, onRun, audioUrl, audioRef, onPlaybackEvent, italian = false }: { text: string; setText: (value: string) => void; max: number; model: string; onRun: () => void; audioUrl: string | null; audioRef: React.RefObject<HTMLAudioElement | null>; onPlaybackEvent: (type: "started" | "completed" | "interrupted") => void; italian?: boolean }) { return <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4"><label className="text-xs text-slate-300">{italian ? "Italian text" : "Text"}<textarea value={text} onChange={(event) => setText(event.target.value.slice(0, max))} className="mt-1 min-h-24 w-full rounded border border-white/10 bg-black/25 p-3 text-white" /></label><div className="mt-2 flex justify-between text-[10px] text-slate-500"><span>Verified model: {model}</span><span>{text.length}/{max}</span></div><Button onClick={onRun}>Confirm and generate once</Button>{audioUrl ? <audio ref={audioRef} src={audioUrl} controls className="mt-3 w-full" onPlay={() => onPlaybackEvent("started")} onEnded={() => onPlaybackEvent("completed")} onPause={(event) => { if (!(event.currentTarget.ended || event.currentTarget.currentTime === 0)) onPlaybackEvent("interrupted"); }} /> : null}{italian ? <p className="mt-3 text-[10px] text-amber-100">This tests Italian synthesis only. It does not translate text or establish multilingual model quality.</p> : null}</div>; }

function VoiceLoopControls({ text, setText, groundTruth, setGroundTruth, onRun, diff, wer }: { text: string; setText: (value: string) => void; groundTruth: boolean; setGroundTruth: (value: boolean) => void; onRun: () => void; diff: ReturnType<typeof transcriptDiff>; wer: ReturnType<typeof wordErrorRate> }) { return <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4"><label className="text-xs text-slate-300">Original text<textarea value={text} onChange={(event) => setText(event.target.value.slice(0, 200))} className="mt-1 min-h-24 w-full rounded border border-white/10 bg-black/25 p-3 text-white" /></label><p className="mt-1 text-right text-[10px] text-slate-500">{text.length}/200</p><label className="mt-3 flex gap-2 text-xs text-amber-100"><input type="checkbox" checked={groundTruth} onChange={(event) => setGroundTruth(event.target.checked)} /> Intentionally use original text as ground truth and calculate WER</label><Button onClick={onRun}>Confirm one TTS → STT experiment</Button>{diff.length ? <DiffView diff={diff} wer={wer} /> : null}</div>; }

function DiffView({ diff, wer }: { diff: ReturnType<typeof transcriptDiff>; wer: ReturnType<typeof wordErrorRate> }) { return <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3"><div className="flex justify-between text-xs"><span className="font-semibold text-white">Transcript difference</span><span className="text-cyan-200">{wer ? `WER ${(wer.value * 100).toFixed(1)}% · derived` : "WER unavailable — no ground truth"}</span></div><div className="mt-2 max-h-32 overflow-auto font-mono text-[10px] text-slate-400">{diff.slice(0, 120).map((item) => <div key={item.index} className={item.match ? "" : "text-amber-200"}>{item.index + 1}. {item.left} → {item.right}</div>)}</div></div>; }

function DisabledAgent() { return <div className="rounded-xl border border-amber-300/25 bg-amber-300/5 p-4"><h3 className="font-semibold text-amber-100">Northstar Agent is disabled and conditional</h3><p className="mt-2 text-xs leading-6 text-slate-300">No Voice Agent connection is created and no successful event is fabricated. Enabling it requires verified account capability, current official Agent settings and transport integration, bounded playback/barge-in cleanup, validated local mock-tool schemas, and a 120-second server/client guard.</p><ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-400"><li>Missing: repository-owned Agent session and playback controller</li><li>Missing: account capability preflight</li><li>Missing: verified settings/event contract integration</li><li>Missing: schema-validated Northstar mock order lookup</li></ul></div>; }

function ConfirmationDialog({ confirmation, onClose }: { confirmation: PendingConfirmation; onClose: (approved: boolean) => void }) { return <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4" role="presentation"><div role="dialog" aria-modal="true" aria-labelledby="live-confirm-title" className="w-full max-w-lg rounded-xl border border-rose-300/30 bg-[#081018] p-5 shadow-2xl"><Badge tone="live">BILLABLE LIVE REQUEST</Badge><h2 id="live-confirm-title" className="mt-3 text-lg font-semibold text-white">Confirm controlled live demo</h2><dl className="mt-4 grid grid-cols-[140px_1fr] gap-2 text-xs"><dt className="text-slate-500">Operation</dt><dd>{confirmation.operation}</dd><dt className="text-slate-500">Model</dt><dd>{confirmation.model}</dd><dt className="text-slate-500">Expected input</dt><dd>{confirmation.expectedInput}</dd><dt className="text-slate-500">Billable requests</dt><dd>{confirmation.billableRequests}</dd><dt className="text-slate-500">Local safety limit</dt><dd>{confirmation.safetyLimit}</dd></dl><p className="mt-4 rounded border border-amber-300/20 bg-amber-300/5 p-3 text-xs text-amber-100">No automatic retry, loop, polling, or background request will be started.</p><div className="mt-5 flex justify-end gap-2"><Button onClick={() => onClose(false)} autoFocus>Cancel</Button><button type="button" data-pocket-guard="ignore" onClick={() => onClose(true)} className="rounded-lg border border-rose-300/40 bg-rose-300/15 px-4 py-2 text-xs font-semibold text-rose-50 focus-visible:outline-2 focus-visible:outline-rose-200">Run live demo</button></div></div></div>; }

function Badge({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "live" | "synthetic" }) { return <span className={`inline-flex rounded border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] ${tone === "live" ? "border-rose-300/35 bg-rose-300/12 text-rose-100" : tone === "synthetic" ? "border-violet-300/30 bg-violet-300/10 text-violet-100" : "border-white/10 bg-white/5 text-slate-300"}`}>{children}</span>; }
function Meta({ label, value }: { label: string; value: string }) { return <span className="min-w-0 rounded border border-white/10 bg-black/20 px-2 py-1 text-[9px]"><span className="text-slate-600">{label} </span><span className="max-w-40 truncate font-mono text-slate-300">{value}</span></span>; }
function Button({ children, onClick, disabled, autoFocus, shortcutCommand, shortcutLabel, disabledReason }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; autoFocus?: boolean; shortcutCommand?: string; shortcutLabel?: string; disabledReason?: string }) { return <button type="button" onClick={onClick} disabled={disabled} autoFocus={autoFocus} data-shortcut-command={shortcutCommand} data-shortcut-label={shortcutLabel} data-shortcut-disabled-reason={disabledReason} className="mt-3 rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2 text-[10px] font-semibold text-slate-200 hover:border-cyan-300/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-cyan-200">{children}</button>; }
function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" data-pocket-guard="ignore" onClick={onClick} aria-pressed={active} className={`rounded px-2 py-2 text-[10px] font-semibold ${active ? "bg-cyan-200 text-slate-950" : "text-slate-400 hover:bg-white/5"}`}>{children}</button>; }
function Empty({ text }: { text: string }) { return <p className="col-span-2 rounded border border-dashed border-white/10 p-3 text-[10px] text-slate-600">{text}</p>; }

function stageForMicEvent(type: string): ObservatoryStage { const value = type.toLowerCase(); if (value.includes("transcript") || value.includes("deepgram_message") || value.includes("request_id") || value.includes("language_observed")) return "stt"; if (value.includes("speech") || value.includes("utterance") || value.includes("session_limit")) return "turn-taking"; if (value.includes("error") || value.includes("close") || value.includes("stop")) return "outcome"; return "audio-ingress"; }
function requestIdFromTranscription(raw: unknown) { const value = raw as { metadata?: { request_id?: string } }; return value.metadata?.request_id; }
function formatDuration(ms: number) { const safe = Math.max(0, ms); return safe >= 60_000 ? `${Math.floor(safe / 60_000)}m ${Math.floor((safe % 60_000) / 1000)}s` : `${(safe / 1000).toFixed(1)}s`; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Unexpected Observatory error."; }
function isAbortError(error: unknown) { return error instanceof Error && error.name === "AbortError"; }
async function deleteGeneratedAudio(url: string | null) { if (!url?.startsWith("/api/deepgram/tts?id=")) return; try { await fetch(url, { method: "DELETE", cache: "no-store" }); } catch { /* TTL cleanup remains as a fallback. */ } }
function inspectorForEvent(event: ObservatoryEvent) { return buildInspectorRecord({ id: event.localEventId, module: "Live Observatory Event", startedAt: event.timestamp, completedAt: event.timestamp, request: { method: "EVENT", endpoint: `http://localhost/observatory/${event.stage}`, bodyPreview: { source: event.source, provenance: event.provenance } }, response: { status: event.severity === "error" ? 500 : 200, bodyPreview: redactSecrets(event.sanitizedPayload ?? { value: event.value }) }, timeline: [createTimelineEvent({ type: event.eventType, label: event.eventType, data: event.sanitizedPayload, at: event.timestamp })], notes: [`Mode: ${event.mode}`, `Provenance: ${event.provenance}`, `Redaction: ${event.redactionState}`] }); }
function markdownRun(run: ObservatoryRun) { return `# Live Observatory Run\n\n- Mode: ${run.mode}\n- Operation: ${run.operation}\n- Run ID: ${run.runId}\n- Started: ${run.startedAt}\n- Completed: ${run.completedAt || "incomplete"}\n- Request IDs: ${run.requestIds.join(", ") || "unavailable"}\n- Cost: ${run.actualCostUsd !== undefined ? `$${run.actualCostUsd} Actual cost` : run.costState}\n\n## Metrics\n\n${run.metrics.map((metric) => `- ${metric.label}: ${metric.value} (${metric.provenance})`).join("\n") || "No metrics."}\n\n## Events\n\n${run.events.map((event) => `- +${event.monotonicOffsetMs}ms [${event.stage}] ${event.eventType} — ${event.provenance}`).join("\n") || "No events."}\n\n## Notes and limitations\n\n- Heat is not causality.\n- Bounded lab runs are not production benchmarks.\n- Live-account behavior is ready for manual verification until the documented checklist is completed.\n`; }
function download(filename: string, content: string, type: string) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }
