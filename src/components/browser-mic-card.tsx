"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";

import { MicIcon } from "@/components/icons";
import { RealtimeFailureBanner, RealtimeStatusStrip } from "@/components/api-studio/RealtimeSessionDiagnostics";
import { ActionButton, FieldHint, FieldLabel, InlineMessage, LabCard } from "@/components/lab-card";
import { ShortcutHint } from "@/components/keyboard-shortcuts/KeyboardShortcutController";
import { PayloadInspector } from "@/components/PayloadInspector";
import { RedactionControl } from "@/components/redaction/RedactionControl";
import {
  DEEPGRAM_LANGUAGE_DOCS_URL,
  DEEPGRAM_NOVA3_MULTILINGUAL_LANGUAGE_CODES,
  DEEPGRAM_NOVA3_STREAMING_LANGUAGE_OPTIONS,
  getDeepgramNova3LanguageOption,
  isDeepgramNova3StreamingLanguageCode,
  type DeepgramNova3LanguageCode,
  type DeepgramNova3StreamingLanguageCode,
} from "@/lib/deepgram-languages";
import {
  buildDeepgramListenUrl,
  createDeepgramLiveClient,
  type DeepgramLiveAttempt,
  type DeepgramLiveAttemptMetadata,
  type DeepgramLiveClient,
  type NovaLiveRecognitionConfig,
} from "@/lib/live-mic/deepgram-live-client";
import {
  createMediaRecorder,
  selectMediaRecorderMimeType,
  type MediaRecorderMimeSelection,
} from "@/lib/live-mic/media-recorder";
import {
  canTransitionLiveMicState,
  isLiveMicStartDisabled,
  liveMicStartLabel,
  liveMicStateLabel,
  liveMicStateReducer,
  liveMicStateToAsyncStatus,
  type LiveMicState,
} from "@/lib/live-mic/state-machine";
import {
  buildInspectorRecord,
  createTimelineEvent,
  formatBytes,
  nowIso,
  queryFromUrl,
  redactSecrets,
  type ApiDebugEnvelope,
  type InspectorRecord,
  type InspectorTimelineEvent,
} from "@/lib/inspection";
import type { AsyncStatus, LabResult, TranscriptionResponse } from "@/lib/types";
import type { LabModuleId } from "@/lib/code-snippets";
import {
  evaluateRedactionCompatibility,
  serializeRedactionValues,
  type RedactionPolicy,
} from "@/lib/redaction";
import {
  appendRealtimeEvent,
  createRealtimeSession,
  hasRealtimeMilestone,
  updateRealtimeResources,
  type RealtimeEventInput,
  type RealtimeSessionState,
} from "@/lib/api-studio/realtime-session";

type BrowserMicCardProps = {
  language: DeepgramNova3LanguageCode;
  initialMessage?: string;
  onResult: (result: LabResult) => void;
  guidedHints: boolean;
  onLanguageChange?: (language: DeepgramNova3LanguageCode) => void;
  onOpenModule?: (moduleId: LabModuleId) => void;
  onInspectorChange?: (record: InspectorRecord) => void;
  showInlineInspector?: boolean;
  redactionPolicy?: RedactionPolicy;
  onRedactionPolicyChange?: (policy: RedactionPolicy) => void;
  singleAttempt?: boolean;
  observatory?: {
    beforeStart: (
      config: NovaLiveRecognitionConfig,
      context?: { restartingAfterCleanup: boolean },
    ) => Promise<boolean>;
    singleAttempt?: boolean;
    maxDurationMs?: number;
    onEvent?: (event: { at: string; type: string; detail?: string; data?: unknown }) => void;
    onSessionActiveChange?: (active: boolean) => void;
    stopSignal?: number;
  };
};

type DeepgramLiveEvent = {
  type?: string;
  is_final?: boolean;
  speech_final?: boolean;
  request_id?: string;
  status?: number;
  error?: string;
  err_msg?: string;
  message?: string;
  reason?: string;
  channel?: {
    alternatives?: Array<{
      transcript?: string;
      languages?: string[];
      words?: Array<{ language?: string }>;
    }>;
  };
  languages?: string[];
  languages_hinted?: string[];
};

type PendingRecognitionChange = {
  config: NovaLiveRecognitionConfig;
  label: string;
};

type TokenRouteSuccess = {
  access_token: string;
  expires_in: number;
};

type TokenRouteFailure = {
  error?: {
    code?: string;
    message?: string;
  };
};

type TemporaryToken = {
  accessToken: string;
  issuedAtMs: number;
  expiresAtMs: number;
};

type TokenStatus = "pending" | "success" | "error";
type WebSocketStatus = "pending" | "open" | "closed" | "error";
type RecorderStatus = "inactive" | "recording" | "stopped";
type TranscriptStatus = "none" | "receiving";
type CheckStatus = "pending" | "success" | "warning" | "error";
type FailureStage = "permission" | "device" | "mime" | "token" | "websocket" | "recorder";

type DiagnosticKey =
  | "api_key"
  | "token_route"
  | "mic_permission"
  | "input_device"
  | "browser_mime"
  | "websocket"
  | "audio_chunks"
  | "deepgram_events"
  | "final_transcript";

type LiveEventRecord = {
  at: string;
  type: string;
  detail?: string;
  data?: unknown;
};

type ChunkStats = {
  chunksSent: number;
  totalBytesSent: number;
  firstChunkAt: string | null;
  lastChunkAt: string | null;
};

type AttemptDetails = {
  attemptId: string;
  attemptNumber: number;
  url: string;
  query: Readonly<Record<string, string | string[]>>;
  mimeType: string;
  tokenAgeMs?: number;
  status?: number;
  closeCode?: number;
  closeReason?: string;
  wasClean?: boolean;
  anyDeepgramMessage: boolean;
};

type ResultReportContext = {
  title: string;
  transcript?: string;
  notes: string;
};

const INITIAL_CHUNK_STATS: ChunkStats = {
  chunksSent: 0,
  totalBytesSent: 0,
  firstChunkAt: null,
  lastChunkAt: null,
};

const DIAGNOSTIC_ITEMS: Array<{ key: DiagnosticKey; label: string }> = [
  { key: "api_key", label: "API key detected" },
  { key: "token_route", label: "Temporary token route works" },
  { key: "mic_permission", label: "Microphone permission granted" },
  { key: "input_device", label: "Input device selected" },
  { key: "browser_mime", label: "Browser MIME type supported" },
  { key: "websocket", label: "WebSocket opened" },
  { key: "audio_chunks", label: "Audio chunks sent" },
  { key: "deepgram_events", label: "Deepgram events received" },
  { key: "final_transcript", label: "Final transcript received" },
];

const DEMO_SCRIPTS = [
  {
    title: "SaaS webhook issue",
    text: "The webhook payload for customer ID CUS-1842 failed twice, then the retry policy sent a duplicate event to the dashboard.",
  },
  {
    title: "Italian account support",
    text: "Buongiorno, non riesco ad accedere al mio account e vorrei controllare la fattura numero IT-4821.",
  },
  {
    title: "guided session intro",
    text: "I built this Deepgram learning lab to test live microphone transcription, sample audio, and text to speech from one local dashboard.",
  },
];

const QUICK_LANGUAGE_CODES = ["en", "it", "es", "fr", "de", "pt", "ja", "nl", "hi", "th"] as const;
const NOVA3_MULTILINGUAL_LANGUAGE_LABEL = DEEPGRAM_NOVA3_MULTILINGUAL_LANGUAGE_CODES
  .map((code) => getDeepgramNova3LanguageOption(code)?.name ?? code)
  .join(", ");

const NATIVE_LANGUAGE_PROMPTS: Partial<Record<DeepgramNova3StreamingLanguageCode, string>> = {
  en: "Hello, I am testing realtime transcription. I will pause, then correct one detail.",
  it: "Ciao, sto provando la trascrizione in tempo reale. Vorrei sapere come il sistema gestisce le pause e le correzioni.",
  es: "Hola, estoy probando la transcripción en tiempo real y quiero observar las pausas y correcciones.",
  fr: "Bonjour, je teste la transcription en temps réel avec une pause et une correction.",
};

export function BrowserMicCard({
  language,
  initialMessage,
  onResult,
  guidedHints,
  onLanguageChange,
  onOpenModule,
  onInspectorChange,
  showInlineInspector = true,
  redactionPolicy = { profiles: [], entities: [] },
  onRedactionPolicyChange,
  singleAttempt = false,
  observatory,
}: BrowserMicCardProps) {
  const initialKnownLanguage = isDeepgramNova3StreamingLanguageCode(language) ? language : "en";
  const [machineState, dispatchMachine] = useReducer(liveMicStateReducer, "idle");
  const [recognitionMode, setRecognitionMode] = useState<NovaLiveRecognitionConfig["mode"]>(
    language === "multi" ? "nova-multilingual" : "known-language",
  );
  const [selectedLanguage, setSelectedLanguage] = useState<DeepgramNova3StreamingLanguageCode>(
    initialKnownLanguage,
  );
  const [activeRecognitionConfig, setActiveRecognitionConfig] = useState<NovaLiveRecognitionConfig | null>(null);
  const [pendingRecognitionChange, setPendingRecognitionChange] = useState<PendingRecognitionChange | null>(null);
  const [observedLanguages, setObservedLanguages] = useState<string[]>([]);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [selectedMicLabel, setSelectedMicLabel] = useState("");
  const [message, setMessage] = useState(initialMessage ?? "Choose a microphone, then start a live token-based Deepgram session.");
  const [liveNote, setLiveNote] = useState("");
  const [lastError, setLastError] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [finalSegments, setFinalSegments] = useState<string[]>([]);
  const [rawEvents, setRawEvents] = useState<LiveEventRecord[]>([]);
  const [level, setLevel] = useState(0);
  const [fallbackState, setFallbackState] = useState<AsyncStatus>("idle");
  const [fallbackCountdown, setFallbackCountdown] = useState<number | null>(null);
  const [showAudioChunkEvents, setShowAudioChunkEvents] = useState(false);
  const [timelineEvents, setTimelineEvents] = useState<InspectorTimelineEvent[]>([]);
  const [sessionStartedAt, setSessionStartedAt] = useState(nowIso());
  const [sessionCompletedAt, setSessionCompletedAt] = useState(nowIso());
  const [sessionId, setSessionId] = useState("browser-mic-initial");
  const [selectedMimeType, setSelectedMimeType] = useState("detecting...");
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>("pending");
  const [webSocketStatus, setWebSocketStatus] = useState<WebSocketStatus>("closed");
  const [recorderStatus, setRecorderStatus] = useState<RecorderStatus>("inactive");
  const [transcriptStatus, setTranscriptStatus] = useState<TranscriptStatus>("none");
  const [speechSignal, setSpeechSignal] = useState("");
  const [requestId, setRequestId] = useState("");
  const [checklist, setChecklist] = useState<Record<DiagnosticKey, CheckStatus>>(createInitialChecklist());
  const [chunkStats, setChunkStats] = useState<ChunkStats>(INITIAL_CHUNK_STATS);
  const [attemptDetails, setAttemptDetails] = useState<AttemptDetails | null>(null);
  const [liveFailureRecorded, setLiveFailureRecorded] = useState(false);
  const [realtimeSession, setRealtimeSession] = useState<RealtimeSessionState>(() => createRealtimeSession("live_stt", "browser-mic-initial"));

  const machineStateRef = useRef<LiveMicState>("idle");
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const liveClientRef = useRef<DeepgramLiveClient | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const operationIdRef = useRef(0);
  const manualStopRef = useRef(false);
  const showAudioChunkEventsRef = useRef(false);
  const temporaryTokenRef = useRef<TemporaryToken | null>(null);
  const chunkStatsRef = useRef<ChunkStats>(INITIAL_CHUNK_STATS);
  const attemptDetailsRef = useRef<AttemptDetails | null>(null);
  const liveFailureRef = useRef(false);
  const realtimeSessionRef = useRef(realtimeSession);
  const failureStageRef = useRef<FailureStage>("permission");
  const latestRawEventRef = useRef<unknown>(null);
  const latestResultReportRef = useRef<ResultReportContext | null>(null);
  const lastReportedTranscriptRef = useRef("");
  const observatoryStopTimerRef = useRef<number | null>(null);
  const observatoryStopSignalRef = useRef(observatory?.stopSignal ?? 0);
  const observatoryBeforeStartRef = useRef(observatory?.beforeStart);
  observatoryBeforeStartRef.current = observatory?.beforeStart;

  const selectedRecognitionConfig = useMemo<NovaLiveRecognitionConfig>(
    () =>
      recognitionMode === "nova-multilingual"
        ? { mode: "nova-multilingual", model: "nova-3", language: "multi" }
        : { mode: "known-language", model: "nova-3", language: selectedLanguage },
    [recognitionMode, selectedLanguage],
  );
  const effectiveRecognitionConfig = activeRecognitionConfig ?? selectedRecognitionConfig;
  const redactionValues = useMemo(() => serializeRedactionValues(redactionPolicy), [redactionPolicy]);
  const redactionCompatibility = evaluateRedactionCompatibility({ deployment: "hosted", mode: "streaming", language: selectedRecognitionConfig.language, projectSurface: "listen" });
  const configuredLanguageOption = getDeepgramNova3LanguageOption(
    effectiveRecognitionConfig.mode === "known-language" ? effectiveRecognitionConfig.language : "multi",
  );
  const finalTranscript = useMemo(() => finalSegments.join("\n"), [finalSegments]);
  const selectedDeviceLabel =
    selectedMicLabel || deviceLabel(devices.find((device) => device.deviceId === selectedDeviceId), 0);
  const visibleTimelineEvents = useMemo(
    () =>
      showAudioChunkEvents
        ? timelineEvents
        : timelineEvents.filter((event) => event.type !== "audio_chunk_sent"),
    [showAudioChunkEvents, timelineEvents],
  );
  const defaultLiveEndpoint = useMemo(
    () =>
      buildDeepgramListenUrl({
        recognitionConfig: effectiveRecognitionConfig,
        smartFormat: true,
        interimResults: true,
        endpointingMs: 300,
        vadEvents: true,
        redact: redactionValues,
        noDelay: redactionValues.length ? false : undefined,
      }).toString(),
    [effectiveRecognitionConfig, redactionValues],
  );
  const liveInspector = useMemo(() => {
    const endpoint = attemptDetails?.url || defaultLiveEndpoint;
    const completedAt = sessionCompletedAt || timelineEvents.at(-1)?.at || sessionStartedAt;

    return buildInspectorRecord({
      id: sessionId,
      module: "Browser Mic / Live WebSocket",
      startedAt: sessionStartedAt,
      completedAt,
      request: {
        method: "WebSocket",
        endpoint,
        query: queryFromUrl(endpoint),
        headers: {
          "Sec-WebSocket-Protocol": "bearer, ***redacted***",
        },
        bodyPreview: {
          selectedDevice: selectedDeviceLabel || "Default microphone",
          recognitionMode: effectiveRecognitionConfig.mode,
          requestedLanguage:
            effectiveRecognitionConfig.mode === "known-language"
              ? configuredLanguageOption?.name ?? effectiveRecognitionConfig.language
              : "Nova-3 multilingual / code-switching",
          effectiveLanguageCode: effectiveRecognitionConfig.language,
          model: effectiveRecognitionConfig.model,
          endpointVersion: "v1",
          multilingual: effectiveRecognitionConfig.mode === "nova-multilingual",
          languageHints: undefined,
          mimeType: selectedMimeType,
          chunkIntervalMs: 250,
          tokenTransport: "temporary JWT in browser WebSocket subprotocol",
        },
      },
      response: {
        status: attemptDetails?.status ?? -1,
        bodyPreview: {
          state: machineState,
          connection: {
            token: tokenStatus,
            websocket: webSocketStatus,
            recorder: recorderStatus,
            transcriptEvents: transcriptStatus,
          },
          requestId: requestId || undefined,
          configuredLanguage:
            effectiveRecognitionConfig.mode === "known-language"
              ? { name: configuredLanguageOption?.name, code: effectiveRecognitionConfig.language }
              : undefined,
          observedLanguages:
            effectiveRecognitionConfig.mode === "nova-multilingual"
              ? { values: observedLanguages, provenance: observedLanguages.length ? "measured" : "unavailable" }
              : undefined,
          interimTranscript,
          finalTranscript,
          chunkStats,
          whatHappened: attemptDetails,
          lastError: lastError || undefined,
          rawEvents,
          audioChunkEventsVisible: showAudioChunkEvents,
        },
      },
      timeline: visibleTimelineEvents,
      notes: [
        "Browser mic requests a temporary token from /api/deepgram/token. The main API key never enters the browser.",
        "MediaRecorder produces compressed browser audio chunks.",
        "Raw PCM options like linear16 require explicit sample_rate, but browser WebM/Opus usually should be treated differently.",
        "Containerized MediaRecorder audio is sent without encoding, container, or sample_rate query parameters.",
        "Known-language mode sends one fixed language code. Nova-3 multilingual sends language=multi and never sends a second fixed language.",
        "General detect_language is not sent because Deepgram does not support ordinary language detection for live streaming.",
        "A configured spoken language is not a detected language. Language labels from multilingual word events are shown separately as observed.",
        "The local level meter does not confirm a Deepgram connection.",
        "The 5-second upload test confirms microphone capture, upload transcription, and API key health; it is not realtime.",
      ],
    });
  }, [
    attemptDetails,
    chunkStats,
    configuredLanguageOption?.name,
    defaultLiveEndpoint,
    finalTranscript,
    interimTranscript,
    effectiveRecognitionConfig,
    lastError,
    machineState,
    rawEvents,
    observedLanguages,
    recorderStatus,
    requestId,
    selectedDeviceLabel,
    selectedMimeType,
    sessionCompletedAt,
    sessionId,
    sessionStartedAt,
    showAudioChunkEvents,
    timelineEvents,
    tokenStatus,
    transcriptStatus,
    visibleTimelineEvents,
    webSocketStatus,
  ]);

  useEffect(() => {
    onInspectorChange?.(liveInspector);
  }, [liveInspector, onInspectorChange]);

  useEffect(() => {
    const signal = observatory?.stopSignal ?? 0;
    if (signal === observatoryStopSignalRef.current) return;
    observatoryStopSignalRef.current = signal;
    void stopLiveMic(false);
    // stopLiveMic intentionally owns the full resource cleanup path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observatory?.stopSignal]);

  useEffect(() => {
    const transcript = finalSegments.join("\n").trim();
    if (!transcript || transcript === lastReportedTranscriptRef.current) {
      return;
    }

    const report = latestResultReportRef.current;
    lastReportedTranscriptRef.current = transcript;
    latestResultReportRef.current = null;
    onResult({
      title: report?.title ?? "Browser Mic",
      transcript: report?.transcript ?? transcript,
      raw: latestRawEventRef.current,
      notes:
        report?.notes ??
        `Live microphone transcription using a temporary Deepgram token. Language ${effectiveRecognitionConfig.language}.`,
      updatedAt: timestamp(),
    });
  }, [effectiveRecognitionConfig.language, finalSegments, onResult]);

  useEffect(() => {
    const capabilityProbe = window.setTimeout(() => {
      const selection = selectMediaRecorderMimeType();
      setSelectedMimeType(selection.displayMimeType);
      setChecklist((current) => ({
        ...current,
        browser_mime: !selection.mediaRecorderSupported
          ? "error"
          : selection.usesBrowserDefault
            ? "warning"
            : "success",
      }));
    }, 0);
    void refreshDevices();

    return () => {
      window.clearTimeout(capabilityProbe);
      operationIdRef.current += 1;
      liveClientRef.current?.close();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // The browser may already have stopped the recorder.
        }
      }
      for (const track of streamRef.current?.getTracks() ?? []) {
        track.stop();
      }
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        void audioContextRef.current.close().catch(() => undefined);
      }
      if (observatoryStopTimerRef.current !== null) window.clearTimeout(observatoryStopTimerRef.current);
      observatory?.onSessionActiveChange?.(false);
    };
    // Browser media APIs are initialized once for this mounted lab module.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function transitionMachine(next: LiveMicState) {
    const current = machineStateRef.current;
    if (!canTransitionLiveMicState(current, next)) {
      return false;
    }

    machineStateRef.current = next;
    dispatchMachine({ type: "transition", next });
    return true;
  }

  function addLiveEvent({
    type,
    detail,
    data,
    at = nowIso(),
    includeInRaw = true,
  }: {
    type: string;
    detail?: string;
    data?: unknown;
    at?: string;
    includeInRaw?: boolean;
  }) {
    const safeData = redactSecrets(data);
    const timelineEvent = createTimelineEvent({ type, label: eventLabel(type), detail, data: safeData, at });
    setSessionCompletedAt(at);
    setTimelineEvents((current) => [...current, timelineEvent].slice(-400));

    if (includeInRaw) {
      const record: LiveEventRecord = {
        at,
        type,
        detail,
        data: safeData,
      };
      setRawEvents((current) => [...current, record].slice(-500));
    }
    observatory?.onEvent?.({ at, type, detail, data: safeData });
  }

  function recordRealtime(input: RealtimeEventInput) {
    const next = appendRealtimeEvent(realtimeSessionRef.current, input);
    realtimeSessionRef.current = next;
    setRealtimeSession(next);
  }

  function updateRealtimeResourceState(snapshot: Parameters<typeof updateRealtimeResources>[1]) {
    const next = updateRealtimeResources(realtimeSessionRef.current, snapshot);
    realtimeSessionRef.current = next;
    setRealtimeSession(next);
  }

  function updateCheck(key: DiagnosticKey, status: CheckStatus) {
    setChecklist((current) => ({ ...current, [key]: status }));
  }

  function updateAttemptDetails(
    next: AttemptDetails | null | ((current: AttemptDetails | null) => AttemptDetails | null),
  ) {
    const resolved = typeof next === "function" ? next(attemptDetailsRef.current) : next;
    attemptDetailsRef.current = resolved;
    setAttemptDetails(resolved);
  }

  function resetChunkStats() {
    chunkStatsRef.current = INITIAL_CHUNK_STATS;
    setChunkStats(INITIAL_CHUNK_STATS);
  }

  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      transitionMachine("error");
      setMessage("This browser does not support media device enumeration.");
      updateCheck("input_device", "error");
      addLiveEvent({ type: "devices_loaded", detail: "Media device enumeration is not supported.", data: { count: 0 } });
      return;
    }

    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = allDevices.filter((device) => device.kind === "audioinput");
      setDevices(audioInputs);
      addLiveEvent({
        type: "devices_loaded",
        detail: `${audioInputs.length} microphone input${audioInputs.length === 1 ? "" : "s"} found.`,
        data: { count: audioInputs.length, labelsAvailable: audioInputs.some((device) => Boolean(device.label)) },
      });

      if (!selectedDeviceId && audioInputs[0]?.deviceId) {
        setSelectedDeviceId(audioInputs[0].deviceId);
        addLiveEvent({
          type: "device_selected",
          detail: deviceLabel(audioInputs[0], 0),
          data: { deviceId: "browser-managed", label: deviceLabel(audioInputs[0], 0) },
        });
      }

      updateCheck("input_device", audioInputs.length ? "success" : "warning");
      if (!audioInputs.length && machineStateRef.current === "idle") {
        setMessage("No microphone is listed yet. Connect a mic, allow permission, then refresh devices.");
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      updateCheck("input_device", "error");
      addLiveEvent({ type: "devices_loaded", detail: errorMessage, data: { error: errorMessage } });
      if (machineStateRef.current === "idle" || machineStateRef.current === "stopped") {
        transitionMachine("error");
        setMessage(errorMessage);
      }
    }
  }

  function handleDeviceChange(deviceId: string) {
    setSelectedDeviceId(deviceId);
    setSelectedMicLabel("");
    const device = devices.find((candidate) => candidate.deviceId === deviceId);
    const label = deviceId ? deviceLabel(device, devices.indexOf(device as MediaDeviceInfo)) : "Default microphone";
    updateCheck("input_device", "success");
    addLiveEvent({
      type: "device_selected",
      detail: label,
      data: { deviceId: deviceId ? "browser-managed" : "default", label },
    });
  }

  function applyRecognitionConfig(config: NovaLiveRecognitionConfig) {
    setRecognitionMode(config.mode);
    if (config.mode === "known-language") {
      setSelectedLanguage(config.language);
    }
    setActiveRecognitionConfig(null);
    setObservedLanguages([]);
    onLanguageChange?.(config.language);
  }

  function requestRecognitionConfig(config: NovaLiveRecognitionConfig) {
    const nextLabel =
      config.mode === "known-language"
        ? `${getDeepgramNova3LanguageOption(config.language)?.name ?? config.language} (${config.language})`
        : "Nova-3 multilingual (multi)";
    const active = isLiveMicStartDisabled(machineStateRef.current) || Boolean(liveClientRef.current || recorderRef.current);

    if (active) {
      setPendingRecognitionChange({ config, label: nextLabel });
      return;
    }

    applyRecognitionConfig(config);
    setMessage(`Preview configuration updated to ${nextLabel}. No request was started.`);
  }

  async function confirmRecognitionRestart() {
    const pending = pendingRecognitionChange;
    if (!pending) return;
    setPendingRecognitionChange(null);
    await stopLiveMic();
    applyRecognitionConfig(pending.config);
    await waitForNextPaint();
    void startLiveMic(pending.config, { restartingAfterCleanup: true });
  }

  async function startLiveMic(
    configOverride?: NovaLiveRecognitionConfig,
    context = { restartingAfterCleanup: false },
  ) {
    if (isLiveMicStartDisabled(machineStateRef.current)) {
      return;
    }

    const sessionConfig = configOverride ?? selectedRecognitionConfig;
    if (redactionValues.length && !evaluateRedactionCompatibility({ deployment: "hosted", mode: "streaming", language: sessionConfig.language, projectSurface: "listen" }).supported) {
      setMessage("Streaming redaction is currently configured only for English. Switch the language to English, use prerecorded transcription, or disable redaction.");
      setLastError("Unsupported streaming language and redaction combination was blocked before microphone access or a request.");
      return;
    }
    const beforeStart = observatoryBeforeStartRef.current;
    if (beforeStart && !(await beforeStart(sessionConfig, context))) {
      return;
    }

    operationIdRef.current += 1;
    const operationId = operationIdRef.current;
    manualStopRef.current = false;
    cleanupLiveResources({ closeClient: true, stopTracks: true, recordEvent: false });
    temporaryTokenRef.current = null;
    liveFailureRef.current = false;
    failureStageRef.current = "permission";
    setLiveFailureRecorded(false);
    setFallbackState("idle");
    setFallbackCountdown(null);
    setLastError("");
    setLiveNote("");
    setSpeechSignal("");
    setRequestId("");
    setObservedLanguages([]);
    setInterimTranscript("");
    setFinalSegments([]);
    lastReportedTranscriptRef.current = "";
    latestRawEventRef.current = null;
    setTranscriptStatus("none");
    setTokenStatus("pending");
    setWebSocketStatus("closed");
    setRecorderStatus("inactive");
    resetChunkStats();
    updateAttemptDetails(null);
    setRawEvents([]);
    setTimelineEvents([]);
    const startedAt = nowIso();
    const canonical = createRealtimeSession("live_stt", `browser-mic-${Date.now()}`);
    realtimeSessionRef.current = canonical;
    setRealtimeSession(canonical);
    setActiveRecognitionConfig(sessionConfig);
    setSessionId(`browser-mic-${Date.now()}`);
    setSessionStartedAt(startedAt);
    setSessionCompletedAt(startedAt);
    setChecklist((current) => ({
      ...createInitialChecklist(),
      browser_mime: current.browser_mime,
      input_device: devices.length ? "success" : "pending",
    }));
    observatory?.onSessionActiveChange?.(true);
    addLiveEvent({
      type: "recognition_configured",
      detail:
        sessionConfig.mode === "known-language"
          ? `${getDeepgramNova3LanguageOption(sessionConfig.language)?.name ?? sessionConfig.language} / ${sessionConfig.language}`
          : "Nova-3 multilingual / multi",
      data: {
        recognitionMode: sessionConfig.mode,
        model: sessionConfig.model,
        language: sessionConfig.language,
        endpointVersion: "v1",
        provenance: "configured",
      },
      at: startedAt,
    });
    if (observatory?.maxDurationMs) {
      if (observatoryStopTimerRef.current !== null) window.clearTimeout(observatoryStopTimerRef.current);
      observatoryStopTimerRef.current = window.setTimeout(() => {
        observatoryStopTimerRef.current = null;
        addLiveEvent({ type: "session_limit_reached", detail: `Observatory ${Math.round(observatory.maxDurationMs! / 1000)}-second session limit reached.` });
        void stopLiveMic(true);
      }, observatory.maxDurationMs);
    }
    transitionMachine("requesting_permission");
    setMessage("Requesting microphone permission...");
    addLiveEvent({
      type: "permission_requested",
      detail: "The browser is requesting access to the selected microphone.",
      at: startedAt,
    });

    try {
      const stream = await openSelectedMicStream();
      if (operationId !== operationIdRef.current) {
        stopTracks(stream);
        return;
      }

      streamRef.current = stream;
      updateCheck("mic_permission", "success");
      addLiveEvent({
        type: "permission_granted",
        detail: "Microphone permission granted.",
        data: { trackCount: stream.getAudioTracks().length },
      });
      failureStageRef.current = "device";
      transitionMachine("selecting_device");
      await waitForNextPaint();
      if (operationId !== operationIdRef.current) {
        return;
      }
      const track = stream.getAudioTracks()[0];
      const streamLabel = readStreamMicLabel(stream) || selectedDeviceLabel || "Default microphone";
      const actualDeviceId = track?.getSettings().deviceId;
      if (actualDeviceId) {
        setSelectedDeviceId(actualDeviceId);
      }
      setSelectedMicLabel(streamLabel);
      updateCheck("input_device", "success");
      addLiveEvent({
        type: "device_selected",
        detail: streamLabel,
        data: { deviceId: actualDeviceId ? "browser-managed" : "default", label: streamLabel },
      });
      startLevelMeter(stream);
      void refreshDevices();

      failureStageRef.current = "mime";
      const selection = selectMediaRecorderMimeType();
      setSelectedMimeType(selection.displayMimeType);
      updateCheck(
        "browser_mime",
        !selection.mediaRecorderSupported ? "error" : selection.usesBrowserDefault ? "warning" : "success",
      );
      if (!selection.mediaRecorderSupported) {
        throw new Error("MediaRecorder is not supported in this browser.");
      }

      failureStageRef.current = "token";
      transitionMachine("requesting_token");
      setMessage("Requesting a temporary Deepgram token...");
      const client = createDeepgramLiveClient({
        recognitionConfig: sessionConfig,
        smartFormat: true,
        interimResults: true,
        endpointingMs: 300,
        tag: observatory ? "avs_observatory_live" : undefined,
        redact: redactionValues,
        noDelay: redactionValues.length ? false : undefined,
        maxAttempts: singleAttempt || observatory?.singleAttempt ? 1 : undefined,
        mimeType: selection.displayMimeType,
        getToken: ({ attempt, forceRefresh, minimumValidityMs }) =>
          getTemporaryToken({ attempt, forceRefresh, minimumValidityMs, operationId }),
        onDiagnostic: (diagnostic) => {
          if (operationId !== operationIdRef.current) {
            return;
          }

          if (diagnostic.type === "websocket_connecting") {
            failureStageRef.current = "websocket";
            transitionMachine("connecting_socket");
            setWebSocketStatus("pending");
            updateAttemptDetails({
              attemptId: diagnostic.attempt.id,
              attemptNumber: diagnostic.attempt.number,
              url: diagnostic.attempt.url,
              query: diagnostic.attempt.query,
              mimeType: diagnostic.attempt.mimeType,
              tokenAgeMs: diagnostic.attempt.tokenAgeMs,
              anyDeepgramMessage: false,
            });
            setMessage(
              diagnostic.attempt.number === 1
                ? "Opening the Deepgram live WebSocket..."
                : observatory?.singleAttempt ? "Opening the only permitted Observatory attempt..." : "Retrying once with simpler query parameters.",
            );
            addLiveEvent({
              type: "websocket_connecting",
              detail: `Attempt ${diagnostic.attempt.number}: ${diagnostic.attempt.label}`,
              data: {
                attempt: diagnostic.attempt.number,
                query: diagnostic.attempt.query,
                mimeType: diagnostic.attempt.mimeType,
                tokenAgeMs: diagnostic.attempt.tokenAgeMs,
                auth: "bearer subprotocol with redacted temporary token",
              },
              at: diagnostic.at,
            });
            recordRealtime({ milestone: "socket_opening", status: "active", source: "client", summary: `Opening Live STT socket attempt ${diagnostic.attempt.number}.`, timestamp: diagnostic.at, details: { attempt: diagnostic.attempt.number, query: diagnostic.attempt.query, mimeType: diagnostic.attempt.mimeType } });
          }

          if (diagnostic.type === "websocket_retry_scheduled") {
            setMessage("Live WebSocket failed before transcript events arrived.");
            setLiveNote("Retrying once with simpler query parameters.");
            addLiveEvent({
              type: "websocket_retry_scheduled",
              detail: "Retrying once without optional vad_events.",
              data: { previousAttempt: diagnostic.attempt.number },
              at: diagnostic.at,
            });
          }
        },
        onOpen: ({ attempt }) => {
          if (operationId !== operationIdRef.current) {
            return;
          }

          // The JWT is only needed for the opening handshake. Do not retain it
          // in browser memory once the socket has been established.
          temporaryTokenRef.current = null;
          setWebSocketStatus("open");
          setLastError("");
          setLiveNote("");
          updateCheck("websocket", "success");
          updateAttemptDetails((current) =>
            current
              ? { ...current, status: 101 }
              : attemptToDetails(attempt, { status: 101, anyDeepgramMessage: false }),
          );
          transitionMachine("socket_open");
          setMessage("Deepgram socket opened. Starting browser audio capture...");
          addLiveEvent({
            type: "websocket_open",
            detail: `Attempt ${attempt.number} opened with HTTP 101 Switching Protocols.`,
            data: { attempt: attempt.number, query: attempt.query },
          });
          recordRealtime({ milestone: "socket_opened", status: "success", source: "browser", summary: `WebSocket onopen fired for attempt ${attempt.number}.`, details: { attempt: attempt.number, status: 101 } });
          updateRealtimeResourceState({ socketReadyState: WebSocket.OPEN });

          try {
            failureStageRef.current = "recorder";
            startLiveRecorder({ stream, selection, client, operationId });
            failureStageRef.current = "websocket";
          } catch (error) {
            finishLiveFailure(getErrorMessage(error), operationId, attempt, "recorder");
          }
        },
        onMessage: ({ data, attempt, isTranscriptEvent }) => {
          if (operationId !== operationIdRef.current) {
            return;
          }

          updateCheck("deepgram_events", "success");
          updateAttemptDetails((current) =>
            current
              ? {
                  ...current,
                  status: readKnownStatus(data) ?? current.status,
                  anyDeepgramMessage: true,
                }
              : attemptToDetails(attempt, {
                  status: readKnownStatus(data),
                  anyDeepgramMessage: true,
                }),
          );
          addLiveEvent({
            type: "deepgram_message_received",
            detail: `Deepgram ${readEventType(data)} event received.`,
            data,
          });
          recordRealtime({
            milestone: realtimeSessionRef.current.summary.currentState === "idle" ? "socket_opened" : realtimeSessionRef.current.summary.currentState,
            status: "info",
            source: "deepgram",
            summary: `Deepgram ${readEventType(data)} event received.`,
            rawEventType: readEventType(data),
            requestId: readLiveRequestId(data),
            details: isUnknownRecord(data) ? data : { event: data },
            kind: "raw",
          });
          if (isTranscriptEvent) {
            setTranscriptStatus("receiving");
            if (chunkStatsRef.current.chunksSent > 0) {
              transitionMachine("receiving_events");
            }
          }
          handleDeepgramMessage(data, sessionConfig);
        },
        onError: ({ error, attempt, receivedTranscriptEvent }) => {
          if (operationId !== operationIdRef.current) {
            return;
          }

          temporaryTokenRef.current = null;
          if (failureStageRef.current === "token") {
            setWebSocketStatus("closed");
            setLastError(error.message);
            return;
          }

          stopRecorderOnly();
          setWebSocketStatus("error");
          setLastError(error.message);
          if (!receivedTranscriptEvent) {
            setMessage("Live WebSocket failed before transcript events arrived.");
          }
          addLiveEvent({
            type: "websocket_error",
            detail: error.message,
            data: {
              attempt: attempt.number,
              browserDetail: "The browser does not expose the failed WebSocket handshake response body.",
            },
          });
          recordRealtime({ milestone: realtimeSessionRef.current.summary.currentState === "idle" ? "socket_opening" : realtimeSessionRef.current.summary.currentState, status: "warning", source: "browser", summary: error.message, rawEventType: "websocket_error", details: { attempt: attempt.number, browserLimitation: "Failed-handshake response body and headers are unavailable." }, kind: "raw" });
        },
        onClose: ({
          attempt,
          code,
          reason,
          wasClean,
          willRetry,
          receivedAnyMessage,
          receivedTranscriptEvent,
        }) => {
          if (operationId !== operationIdRef.current) {
            return;
          }

          stopRecorderOnly();
          setWebSocketStatus(code === 1000 ? "closed" : "error");
          updateAttemptDetails((current) => ({
            ...(current ?? attemptToDetails(attempt, { anyDeepgramMessage: receivedAnyMessage })),
            closeCode: code,
            closeReason: reason,
            wasClean,
            anyDeepgramMessage: receivedAnyMessage,
          }));
          addLiveEvent({
            type: "websocket_close",
            detail:
              code === 1006
                ? "The browser could not complete or maintain the Deepgram WebSocket connection."
                : code === 1000 && !receivedTranscriptEvent
                  ? "The Deepgram WebSocket closed before a transcript event was received."
                : `Deepgram WebSocket closed with code ${code}.`,
            data: { attempt: attempt.number, code, reason: reason || "No reason supplied", wasClean, willRetry },
          });
          recordRealtime({ milestone: "socket_closed", status: code === 1000 ? "success" : "warning", source: "browser", summary: code === 1006 ? "1006 — Abnormal closure. The browser did not receive a normal close frame and may not expose the handshake response body." : `Socket closed with code ${code}.`, closeCode: code, closeReason: reason, details: { attempt: attempt.number, wasClean, willRetry }, kind: willRetry || code === 1006 ? "raw" : "milestone" });

          if (liveFailureRef.current) {
            return;
          }

          if (willRetry) {
            transitionMachine("connecting_socket");
            setLiveNote("Retrying once with simpler query parameters.");
            return;
          }

          if (code !== 1000 && !willRetry) {
            recordRealtime({ milestone: "failure", status: "failure", source: "browser", summary: code === 1006 ? "1006 — Abnormal closure. The browser did not receive a normal close frame and may not expose the handshake response body." : `Live STT socket closed abnormally with code ${code}.`, closeCode: code, closeReason: reason, details: { microphoneTracksActive: activeTrackCount(streamRef.current), socketReadyState: WebSocket.CLOSED } });
            updateRealtimeResourceState({ socketReadyState: WebSocket.CLOSED, microphoneActive: false });
          }

          if (code === 1000 && receivedTranscriptEvent && !manualStopRef.current) {
            transitionMachine("stopping");
            cleanupLiveResources({ closeClient: false, stopTracks: true, recordEvent: true });
            liveClientRef.current = null;
            transitionMachine("stopped");
            setMessage("Live microphone transcription stopped.");
          }
        },
        onExhausted: ({ attempt, message: exhaustedMessage }) => {
          if (operationId !== operationIdRef.current) {
            return;
          }
          finishLiveFailure(exhaustedMessage, operationId, attempt);
        },
      });
      liveClientRef.current = client;
      client.connect();
    } catch (error) {
      if (operationId !== operationIdRef.current) {
        return;
      }
      finishLiveFailure(getErrorMessage(error), operationId);
    }
  }

  async function getTemporaryToken({
    attempt,
    forceRefresh,
    minimumValidityMs,
    operationId,
  }: {
    attempt: DeepgramLiveAttempt;
    forceRefresh: boolean;
    minimumValidityMs: number;
    operationId: number;
  }) {
    const cached = temporaryTokenRef.current;
    if (!forceRefresh && cached && cached.expiresAtMs - Date.now() >= minimumValidityMs) {
      return cached;
    }

    transitionMachine("requesting_token");
    setTokenStatus("pending");
    setMessage(forceRefresh ? "Refreshing the temporary Deepgram token..." : "Requesting a temporary Deepgram token...");
    addLiveEvent({
      type: "token_requested",
      detail: forceRefresh ? "A fresh temporary token is required before retrying." : "Requesting a temporary token from the local server route.",
      data: { attempt: attempt.number, forceRefresh },
    });
    recordRealtime({ milestone: "token_requested", status: "success", source: "client", summary: forceRefresh ? "A fresh temporary token was requested for the retry." : "A temporary token was requested from the local server route.", details: { attempt: attempt.number, forceRefresh } });

    try {
      const response = await fetch("/api/deepgram/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ttlSeconds: 60 }),
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as TokenRouteSuccess | TokenRouteFailure | null;
      if (!response.ok || !body || !("access_token" in body)) {
        const failure = body && "error" in body ? body : null;
        throw new TokenRouteError(
          failure?.error?.message || `Temporary token request failed with HTTP ${response.status}.`,
          failure?.error?.code,
        );
      }
      if (!body.access_token || !Number.isFinite(body.expires_in) || body.expires_in <= 0) {
        throw new TokenRouteError("The temporary token route returned an invalid Deepgram response.", "invalid_deepgram_response");
      }
      if (operationId !== operationIdRef.current) {
        throw new Error("Live microphone start was cancelled.");
      }

      const issuedAtMs = Date.now();
      const token: TemporaryToken = {
        accessToken: body.access_token,
        issuedAtMs,
        expiresAtMs: issuedAtMs + body.expires_in * 1000,
      };
      temporaryTokenRef.current = token;
      setTokenStatus("success");
      updateCheck("api_key", "success");
      updateCheck("token_route", "success");
      addLiveEvent({
        type: "token_received_redacted",
        detail: "Temporary token granted.",
        data: {
          credentialPreview: "***redacted***",
          expiresInSeconds: body.expires_in,
        },
      });
      recordRealtime({ milestone: "token_received", status: "success", source: "server", summary: `Temporary token received with a ${body.expires_in}-second lifetime.`, details: { expiresInSeconds: body.expires_in } });
      return token;
    } catch (error) {
      temporaryTokenRef.current = null;
      const routeError = error instanceof TokenRouteError ? error : null;
      failureStageRef.current = "token";
      setTokenStatus("error");
      updateCheck("token_route", "error");
      if (routeError?.code === "missing_api_key") {
        updateCheck("api_key", "error");
      } else if (routeError?.code === "forbidden") {
        updateCheck("api_key", "warning");
      } else {
        updateCheck("api_key", "warning");
      }
      addLiveEvent({
        type: "token_error",
        detail: getErrorMessage(error),
        data: { code: routeError?.code || "token_request_failed" },
      });
      throw error;
    }
  }

  function startLiveRecorder({
    stream,
    selection,
    client,
    operationId,
  }: {
    stream: MediaStream;
    selection: MediaRecorderMimeSelection;
    client: DeepgramLiveClient;
    operationId: number;
  }) {
    const created = createMediaRecorder(stream, selection);
    const recorder = created.recorder;
    let sentFirstChunk = false;
    recorderRef.current = recorder;
    setSelectedMimeType(created.mimeType);
    updateAttemptDetails((current) => (current ? { ...current, mimeType: created.mimeType } : current));
    addLiveEvent({
      type: "mediarecorder_created",
      detail: "MediaRecorder created after the WebSocket opened.",
      data: { mimeType: created.mimeType, browserDefault: selection.usesBrowserDefault },
    });

    recorder.ondataavailable = (event) => {
      if (
        operationId !== operationIdRef.current ||
        recorderRef.current !== recorder ||
        !event.data.size
      ) {
        return;
      }
      if (!client.send(event.data)) {
        return;
      }

      const at = nowIso();
      const previous = chunkStatsRef.current;
      const next: ChunkStats = {
        chunksSent: previous.chunksSent + 1,
        totalBytesSent: previous.totalBytesSent + event.data.size,
        firstChunkAt: previous.firstChunkAt || at,
        lastChunkAt: at,
      };
      chunkStatsRef.current = next;
      setChunkStats(next);
      if (!sentFirstChunk) {
        sentFirstChunk = true;
        updateCheck("audio_chunks", "success");
        transitionMachine("recording");
        setMessage("Listening. Browser audio chunks are reaching the open Deepgram socket.");
        recordRealtime({ milestone: "audio_started", status: "success", source: "browser", summary: "The first browser microphone audio chunk was sent to the open socket.", details: { mimeType: created.mimeType, sizeBytes: event.data.size } });
        updateRealtimeResourceState({ microphoneActive: true, socketReadyState: WebSocket.OPEN });
      }
      addLiveEvent({
        type: "audio_chunk_sent",
        detail: `${event.data.size} byte audio chunk sent.`,
        data: { sizeBytes: event.data.size, mimeType: event.data.type || created.mimeType },
        at,
        includeInRaw: showAudioChunkEventsRef.current,
      });
    };
    recorder.onerror = () => {
      if (operationId !== operationIdRef.current || recorderRef.current !== recorder) {
        return;
      }
      addLiveEvent({ type: "mediarecorder_error", detail: "MediaRecorder could not capture microphone audio." });
      finishLiveFailure(
        "MediaRecorder could not capture microphone audio.",
        operationId,
        client.currentAttempt ?? undefined,
        "recorder",
      );
    };
    recorder.onstop = () => {
      if (recorderRef.current === recorder) {
        recorderRef.current = null;
        setRecorderStatus("stopped");
      }
    };
    recorder.start(250);
    setRecorderStatus("recording");
    addLiveEvent({
      type: "mediarecorder_started",
      detail: "MediaRecorder started with a 250 ms timeslice.",
      data: { mimeType: created.mimeType, timesliceMs: 250 },
    });
    setMessage("Recorder started. Waiting for the first audio chunk before marking the session as listening.");
  }

  function handleDeepgramMessage(value: unknown, sessionConfig: NovaLiveRecognitionConfig) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return;
    }

    const event = value as DeepgramLiveEvent;
    const returnedLanguages = collectObservedLanguages(event);
    if (returnedLanguages.length) {
      setObservedLanguages((current) => Array.from(new Set([...current, ...returnedLanguages])));
      addLiveEvent({
        type: "language_observed",
        detail: `Deepgram event reported ${returnedLanguages.join(", ")}.`,
        data: { languages: returnedLanguages, provenance: "measured" },
      });
    }
    if (event.type === "SpeechStarted") {
      setSpeechSignal("Speech detected");
      addLiveEvent({ type: "speech_started", detail: "Deepgram reported speech activity.", data: value });
      return;
    }
    if (event.type === "UtteranceEnd") {
      setSpeechSignal("Utterance ended.");
      addLiveEvent({ type: "utterance_end", detail: "Deepgram reported an utterance boundary.", data: value });
      return;
    }
    if (event.type === "Metadata" && event.request_id) {
      setRequestId(event.request_id);
      return;
    }
    if (event.type === "Error" || event.error || event.err_msg) {
      setLastError(readDeepgramError(event));
      return;
    }

    const isResults = event.type === "Results" || Array.isArray(event.channel?.alternatives);
    if (!isResults) {
      return;
    }
    const transcript = event.channel?.alternatives?.[0]?.transcript?.trim();
    if (event.speech_final === true) {
      addLiveEvent({
        type: "speech_final",
        detail: "Deepgram marked the speech segment final.",
        data: { speech_final: true },
      });
    }
    if (!transcript) {
      return;
    }

    if (!hasRealtimeMilestone(realtimeSessionRef.current, "first_transcript")) {
      recordRealtime({ milestone: "first_transcript", status: "success", source: "deepgram", summary: "The first non-empty Live STT transcript event was received.", rawEventType: event.type, requestId: event.request_id });
    }

    if (event.is_final === true) {
      latestResultReportRef.current = {
        title: "Browser Mic",
        notes: `Live microphone transcription using a temporary Deepgram token. Language ${sessionConfig.language}.`,
      };
      appendFinalTranscriptSegment(transcript, value);
      setInterimTranscript("");
      updateCheck("final_transcript", "success");
      addLiveEvent({ type: "transcript_final", detail: transcript, data: value });
      return;
    }

    setInterimTranscript(transcript);
    addLiveEvent({ type: "transcript_interim", detail: transcript, data: value });
  }

  function appendFinalTranscriptSegment(segment: string, rawEvent: unknown) {
    const normalizedSegment = segment.trim();
    if (!normalizedSegment) {
      return;
    }

    latestRawEventRef.current = rawEvent;
    setFinalSegments((current) => [...current, normalizedSegment]);
  }

  function finishLiveFailure(
    errorMessage: string,
    operationId: number,
    attempt?: DeepgramLiveAttemptMetadata,
    explicitStage?: FailureStage,
  ) {
    if (operationId !== operationIdRef.current || manualStopRef.current) {
      return;
    }

    const currentDetails = attemptDetailsRef.current;
    const closeCode = currentDetails?.closeCode;
    const stage = explicitStage ?? failureStageRef.current;
    const realtimeFailure = stage === "websocket" || stage === "recorder";
    const fallbackAvailable = realtimeFailure || stage === "token";
    const userMessage =
      stage === "websocket" && closeCode === 1006
        ? "The browser could not complete or maintain the Deepgram WebSocket connection."
        : errorMessage;
    liveFailureRef.current = realtimeFailure;
    observatory?.onSessionActiveChange?.(false);
    if (observatoryStopTimerRef.current !== null) { window.clearTimeout(observatoryStopTimerRef.current); observatoryStopTimerRef.current = null; }
    setLiveFailureRecorded(true);
    setLastError(userMessage);
    setMessage(userMessage);
    setLiveNote(failureGuidance(stage));

    if (stage === "permission") {
      updateCheck("mic_permission", "error");
    } else if (stage === "device") {
      updateCheck("input_device", "error");
    } else if (stage === "mime") {
      updateCheck("browser_mime", "error");
    } else if (stage === "websocket") {
      updateCheck("websocket", currentDetails?.status === 101 ? "warning" : "error");
      if (chunkStatsRef.current.chunksSent === 0) {
        updateCheck("audio_chunks", "warning");
      }
      if (!currentDetails?.anyDeepgramMessage) {
        updateCheck("deepgram_events", "warning");
      }
      updateCheck("final_transcript", "warning");
    } else if (stage === "recorder") {
      updateCheck("audio_chunks", chunkStatsRef.current.chunksSent ? "success" : "error");
      updateCheck("final_transcript", "warning");
    }
    if (!currentDetails && attempt) {
      updateAttemptDetails(attemptToDetails(attempt, { anyDeepgramMessage: false }));
    }
    addLiveEvent({
      type: "fallback_suggested",
      detail: fallbackSuggestion(stage),
      data: { stage, closeCode, attempt: currentDetails?.attemptNumber ?? attempt?.number, error: userMessage },
    });
    if (realtimeSessionRef.current.summary.currentState !== "failure") {
      recordRealtime({
        milestone: "failure",
        status: "failure",
        source: stage === "token" ? "server" : stage === "websocket" ? "browser" : "client",
        summary: userMessage,
        closeCode,
        closeReason: currentDetails?.closeReason,
        details: {
          stage,
          attempt: currentDetails?.attemptNumber ?? attempt?.number,
          socketReadyState: liveClientRef.current ? webSocketReadyState(webSocketStatus) : WebSocket.CLOSED,
          microphoneTracksActive: activeTrackCount(streamRef.current),
          playbackActive: false,
        },
      });
    }
    cleanupLiveResources({ closeClient: true, stopTracks: true, recordEvent: true });
    updateRealtimeResourceState({ socketReadyState: WebSocket.CLOSED, microphoneActive: false, playbackActive: false });
    setWebSocketStatus(stage === "websocket" ? "error" : "closed");
    setRecorderStatus(realtimeFailure ? "stopped" : "inactive");
    temporaryTokenRef.current = null;
    transitionMachine("error");
    if (fallbackAvailable) {
      transitionMachine("fallback_available");
    }
  }

  async function stopLiveMic(limitReached = false) {
    const hasActiveSocket = webSocketStatus === "pending" || webSocketStatus === "open";
    const hasActiveRecorder = recorderStatus === "recording";
    if (!hasActiveSocket && !hasActiveRecorder && !limitReached) {
      return;
    }

    manualStopRef.current = true;
    operationIdRef.current += 1;
    transitionMachine("stopping");
    setMessage("Stopping microphone capture and the live connection...");
    addLiveEvent({ type: "stop_requested", detail: limitReached ? "Stop enforced by the Observatory session limit." : "Stop requested by the user." });
    recordRealtime({ milestone: "stop_requested", status: "success", source: "client", summary: limitReached ? "Stop requested by the Observatory session limit." : "Stop requested by the user." });
    recordRealtime({ milestone: "socket_closing", status: "active", source: "client", summary: "Closing the Live STT socket and microphone resources." });
    await waitForNextPaint();
    cleanupLiveResources({ closeClient: true, stopTracks: true, recordEvent: true });
    recordRealtime({ milestone: "socket_closed", status: "success", source: "client", summary: "Live STT resources closed after the Stop request.", closeCode: 1000, closeReason: limitReached ? "Session limit reached" : "Stopped by user" });
    updateRealtimeResourceState({ socketReadyState: WebSocket.CLOSED, microphoneActive: false, playbackActive: false });
    temporaryTokenRef.current = null;
    setFallbackCountdown(null);
    setFallbackState("idle");
    setInterimTranscript("");
    setMessage("Microphone capture and the live connection are stopped.");
    setLiveNote("");
    if (observatoryStopTimerRef.current !== null) { window.clearTimeout(observatoryStopTimerRef.current); observatoryStopTimerRef.current = null; }
    observatory?.onSessionActiveChange?.(false);
    transitionMachine("stopped");
  }

  function clearTranscript() {
    const hasActiveSocket = webSocketStatus === "pending" || webSocketStatus === "open";
    const hasActiveRecorder = recorderStatus === "recording";
    latestRawEventRef.current = null;
    latestResultReportRef.current = null;
    lastReportedTranscriptRef.current = "";
    setFinalSegments([]);
    setInterimTranscript("");
    setRawEvents([]);
    setTimelineEvents([]);
    setSpeechSignal("");
    setRequestId("");
    setLastError("");
    setLiveNote("");
    setTranscriptStatus("none");
    setLiveFailureRecorded(false);
    liveFailureRef.current = false;
    resetChunkStats();
    updateAttemptDetails(null);
    setChecklist((current) => ({
      ...current,
      api_key: current.api_key === "success" ? "success" : "pending",
      token_route: current.token_route === "success" ? "success" : "pending",
      mic_permission: current.mic_permission === "success" ? "success" : "pending",
      audio_chunks: "pending",
      deepgram_events: "pending",
      final_transcript: "pending",
      websocket:
        machineStateRef.current === "recording" || machineStateRef.current === "receiving_events"
          ? current.websocket
          : "pending",
    }));
    if (!hasActiveSocket && !hasActiveRecorder) {
      setFallbackState("idle");
      setFallbackCountdown(null);
      setTokenStatus("pending");
      setWebSocketStatus("closed");
      setRecorderStatus("inactive");
      transitionMachine("stopped");
      setMessage("Transcript and previous diagnostics cleared.");
    }
    onResult({
      title: "Browser Mic",
      transcript: "",
      raw: { cleared: true },
      notes: "Live microphone transcript and diagnostics cleared.",
      updatedAt: timestamp(),
    });
  }

  async function runFiveSecondMicTest() {
    if (fallbackState === "loading" || isLiveMicStartDisabled(machineStateRef.current)) {
      return;
    }

    operationIdRef.current += 1;
    const operationId = operationIdRef.current;
    let fallbackStage: "permission" | "mime" | "recorder" | "upload" = "permission";
    const continuingFailureSession = liveFailureRecorded;
    manualStopRef.current = false;
    cleanupLiveResources({ closeClient: true, stopTracks: true, recordEvent: false });
    setFallbackState("loading");
    setFallbackCountdown(5);
    setLastError("");
    setMessage("Recording a five-second microphone sample.");
    setLiveNote("This confirms microphone capture, upload transcription, and API key health. It is not realtime.");
    if (!continuingFailureSession) {
      const startedAt = nowIso();
      setRawEvents([]);
      setTimelineEvents([]);
      resetChunkStats();
      setSessionId(`mic-test-${Date.now()}`);
      setSessionStartedAt(startedAt);
      setSessionCompletedAt(startedAt);
    }
    transitionMachine("requesting_permission");
    addLiveEvent({
      type: "permission_requested",
      detail: "Microphone permission requested for the five-second upload test.",
      data: { mode: "5-sec upload fallback" },
    });

    try {
      const stream = await openSelectedMicStream();
      if (operationId !== operationIdRef.current) {
        stopTracks(stream);
        return;
      }
      streamRef.current = stream;
      updateCheck("mic_permission", "success");
      addLiveEvent({
        type: "permission_granted",
        detail: "Microphone permission granted for the five-second test.",
      });
      transitionMachine("selecting_device");
      await waitForNextPaint();
      if (operationId !== operationIdRef.current) {
        return;
      }
      const streamLabel = readStreamMicLabel(stream) || selectedDeviceLabel || "Default microphone";
      setSelectedMicLabel(streamLabel);
      updateCheck("input_device", "success");
      addLiveEvent({ type: "device_selected", detail: streamLabel, data: { label: streamLabel } });
      startLevelMeter(stream);

      fallbackStage = "mime";
      const selection = selectMediaRecorderMimeType();
      setSelectedMimeType(selection.displayMimeType);
      updateCheck(
        "browser_mime",
        !selection.mediaRecorderSupported ? "error" : selection.usesBrowserDefault ? "warning" : "success",
      );
      if (!selection.mediaRecorderSupported) {
        throw new Error("MediaRecorder is not supported in this browser.");
      }
      fallbackStage = "recorder";
      const blob = await recordFiveSecondBlob(stream, selection, operationId);
      if (operationId !== operationIdRef.current || manualStopRef.current) {
        return;
      }

      transitionMachine("stopping");
      await waitForNextPaint();
      cleanupLiveResources({ closeClient: true, stopTracks: true, recordEvent: true });
      setFallbackCountdown(null);
      setMessage("Uploading the five-second mic sample for transcription...");
      const formData = new FormData();
      formData.append("file", blob, `five-second-mic-test.${fileExtensionForMime(blob.type)}`);
      formData.append("model", "nova-3");
      formData.append("language", effectiveRecognitionConfig.language);
      formData.append("smart_format", "true");
      formData.append("diarize", "false");
      for (const value of redactionValues) formData.append("redact", value);

      fallbackStage = "upload";
      const response = await fetch("/api/deepgram/transcribe-file", { method: "POST", body: formData });
      const envelope = await unwrapEnvelope<TranscriptionResponse>(response);
      const data = requireEnvelopeData(envelope);
      const transcript = data.transcript || "Deepgram returned no transcript text for the five-second sample.";
      latestResultReportRef.current = {
        title: "5-sec Mic Test",
        transcript,
        notes: "Recorded five seconds in the browser, then used the server-side file transcription route. This is not realtime.",
      };
      appendFinalTranscriptSegment(`[5-sec Mic Test] ${transcript}`, data.raw);
      setFallbackState("success");
      setMessage(
        liveFailureRef.current
          ? "Mic and API key are working. The issue is isolated to the live WebSocket path."
          : "The 5-sec Mic Test completed successfully.",
      );
      setLiveNote("This result used /api/deepgram/transcribe-file and is not realtime.");
      updateCheck("api_key", "success");
      addLiveEvent({
        type: "fallback_transcription_received",
        detail: "Five-second upload transcription completed.",
        data: { transcript, raw: data.raw, inspector: envelope.inspector },
      });
      transitionMachine("stopped");
    } catch (error) {
      if (operationId !== operationIdRef.current) {
        return;
      }
      const errorMessage = getErrorMessage(error);
      if (fallbackStage === "permission") {
        updateCheck("mic_permission", "error");
      } else if (fallbackStage === "mime") {
        updateCheck("browser_mime", "error");
      } else if (fallbackStage === "upload") {
        updateCheck("api_key", "warning");
      }
      cleanupLiveResources({ closeClient: true, stopTracks: true, recordEvent: true });
      setFallbackCountdown(null);
      setFallbackState("error");
      setLastError(errorMessage);
      setMessage("Mic capture or file transcription is failing too.");
      setLiveNote(errorMessage);
      addLiveEvent({ type: "fallback_error", detail: errorMessage, data: { stage: fallbackStage } });
      transitionMachine("error");
    }
  }

  function recordFiveSecondBlob(
    stream: MediaStream,
    selection: MediaRecorderMimeSelection,
    operationId: number,
  ) {
    const created = createMediaRecorder(stream, selection);
    const recorder = created.recorder;
    const chunks: Blob[] = [];
    recorderRef.current = recorder;
    setSelectedMimeType(created.mimeType);
    addLiveEvent({
      type: "mediarecorder_created",
      detail: "MediaRecorder created for the five-second upload test.",
      data: { mimeType: created.mimeType },
    });

    return new Promise<Blob>((resolve, reject) => {
      let remaining = 5;
      const interval = window.setInterval(() => {
        remaining -= 1;
        setFallbackCountdown(remaining > 0 ? remaining : null);
      }, 1_000);
      const timeout = window.setTimeout(() => {
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      }, 5_000);
      const clearTimers = () => {
        window.clearInterval(interval);
        window.clearTimeout(timeout);
      };

      recorder.ondataavailable = (event) => {
        if (operationId === operationIdRef.current && event.data.size) {
          chunks.push(event.data);
        }
      };
      recorder.onerror = () => {
        clearTimers();
        reject(new Error("MediaRecorder could not capture the five-second microphone sample."));
      };
      recorder.onstop = () => {
        clearTimers();
        if (recorderRef.current === recorder) {
          recorderRef.current = null;
          setRecorderStatus("stopped");
        }
        if (!chunks.length) {
          reject(new Error("No microphone audio was captured during the five-second test."));
          return;
        }
        const blobType = recorder.mimeType || chunks[0]?.type || "application/octet-stream";
        resolve(new Blob(chunks, { type: blobType }));
      };
      recorder.start(250);
      setRecorderStatus("recording");
      transitionMachine("recording");
      addLiveEvent({
        type: "mediarecorder_started",
        detail: "Five-second MediaRecorder started with a 250 ms timeslice.",
        data: { mimeType: created.mimeType, timesliceMs: 250, durationMs: 5_000 },
      });
    });
  }

  async function openSelectedMicStream() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser does not support microphone capture.");
    }
    const baseConstraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    const selectedConstraints: MediaTrackConstraints = selectedDeviceId
      ? { ...baseConstraints, deviceId: { exact: selectedDeviceId } }
      : baseConstraints;

    try {
      return await navigator.mediaDevices.getUserMedia({ audio: selectedConstraints, video: false });
    } catch (error) {
      if (selectedDeviceId && error instanceof DOMException && error.name === "OverconstrainedError") {
        addLiveEvent({
          type: "device_selected",
          detail: "The selected device was unavailable. Falling back to the browser default microphone.",
          data: { fallbackToDefault: true },
        });
        return navigator.mediaDevices.getUserMedia({ audio: baseConstraints, video: false });
      }
      throw error;
    }
  }

  function startLevelMeter(stream: MediaStream) {
    stopLevelMeter();
    const AudioContextConstructor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) {
      return;
    }

    const audioContext = new AudioContextConstructor();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const samples = new Uint8Array(analyser.frequencyBinCount);
    source.connect(analyser);
    audioContextRef.current = audioContext;

    const tick = () => {
      analyser.getByteFrequencyData(samples);
      const average = samples.reduce((sum, value) => sum + value, 0) / samples.length / 255;
      setLevel(Math.min(1, average * 2.8));
      animationFrameRef.current = window.requestAnimationFrame(tick);
    };
    tick();
  }

  function stopLevelMeter() {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
    setLevel(0);
  }

  function stopRecorderOnly() {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // The stream may already have stopped the recorder.
      }
    }
    setRecorderStatus(recorder ? "stopped" : "inactive");
  }

  function cleanupLiveResources({
    closeClient,
    stopTracks: shouldStopTracks,
    recordEvent,
  }: {
    closeClient: boolean;
    stopTracks: boolean;
    recordEvent: boolean;
  }) {
    stopRecorderOnly();
    if (closeClient) {
      liveClientRef.current?.close();
      liveClientRef.current = null;
    }
    if (shouldStopTracks) {
      stopTracks(streamRef.current);
      streamRef.current = null;
      stopLevelMeter();
    }
    if (webSocketStatus !== "error") {
      setWebSocketStatus("closed");
    }
    if (recordEvent) {
      addLiveEvent({
        type: "cleanup_complete",
        detail: "Recorder, microphone tracks, level meter, and live socket references were cleaned up.",
      });
    }
  }

  const redactionBlocked = redactionValues.length > 0 && !redactionCompatibility.supported;
  const startDisabled = isLiveMicStartDisabled(machineState) || fallbackState === "loading" || redactionBlocked;
  const stopDisabled =
    !(
      webSocketStatus === "pending" ||
      webSocketStatus === "open" ||
      recorderStatus === "recording"
    );
  const fallbackHighlighted = liveFailureRecorded || machineState === "fallback_available" || machineState === "error";
  const statusText =
    fallbackState === "loading"
      ? fallbackCountdown
        ? `Mic test ${fallbackCountdown}s`
        : "Uploading test"
      : liveMicStateLabel(machineState);
  const billableNotice = "Deepgram realtime STT begins only when you press Start Live Mic.";
  const mobileTranscript = [finalTranscript, interimTranscript].filter(Boolean).join("\n\n") || "Your transcript will appear here.";
  const mobileTranscriptAnnouncement = finalSegments.at(-1) ?? "";

  return (
    <LabCard
      title="Browser Mic"
      description="Stream live microphone audio with a short-lived token, with a five-second upload fallback."
      icon={<MicIcon className="size-5" />}
      status={fallbackState === "loading" ? "loading" : liveMicStateToAsyncStatus(machineState)}
      statusText={statusText}
    >
      <div className="space-y-4">
        {initialMessage ? <p className="rounded-lg border border-cyan-200/20 bg-cyan-200/[.05] p-3 text-xs leading-5 text-cyan-50" role="status">{initialMessage}</p> : null}
        <section aria-label="Live Mic quick start" className="grid gap-3 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:hidden">
          <div className="space-y-3 rounded-lg border border-cyan-200/20 bg-cyan-200/[0.05] p-3">
            <div>
              <p className="text-sm font-semibold text-white">Start talking</p>
              <p className="mt-1 text-[11px] leading-5 text-amber-100/75">Billable operation: {billableNotice}</p>
            </div>
            {redactionBlocked ? <InlineMessage status="error">Streaming redaction is currently configured only for English. Switch the language to English, use prerecorded transcription, or disable redaction. Start is blocked and no microphone permission will be requested.</InlineMessage> : null}
            <ActionButton className="w-full justify-center" onClick={() => void startLiveMic()} disabled={startDisabled} data-pocket-guard={observatory ? "ignore" : undefined} data-shortcut-command="run_primary" data-shortcut-label="Start current session" data-shortcut-disabled-reason="The Live Mic session is already active or browser setup is incomplete.">
              {liveMicStartLabel(machineState)}<ShortcutHint command="run_primary" />
            </ActionButton>
            <div className="grid grid-cols-2 gap-2">
              <ActionButton variant="secondary" onClick={() => void stopLiveMic()} disabled={stopDisabled} data-shortcut-command="stop_session" data-shortcut-label="Stop current session" data-shortcut-disabled-reason="No Live Mic session is active.">
                Stop<ShortcutHint command="stop_session" />
              </ActionButton>
              <ActionButton variant="secondary" onClick={clearTranscript} disabled={!stopDisabled} data-shortcut-command="reset_current" data-shortcut-label="Reset current module" data-shortcut-disabled-reason="Stop the active Live Mic session before clearing its transcript.">
                Clear<ShortcutHint command="reset_current" />
              </ActionButton>
            </div>
            <div role={machineState === "error" || machineState === "fallback_available" ? "alert" : "status"} aria-live="polite">
              <InlineMessage status={fallbackState === "success" ? "success" : liveMicStateToAsyncStatus(machineState)}>{message}</InlineMessage>
            </div>
          </div>
          <div>
            <TranscriptBox compact title="Live transcript" text={mobileTranscript} />
          </div>
          <span className="sr-only" role="status" aria-live="polite">
            {mobileTranscriptAnnouncement ? `Final transcript: ${mobileTranscriptAnnouncement}` : ""}
          </span>
        </section>
        <RealtimeStatusStrip session={realtimeSession} sticky={false} />
        <RealtimeFailureBanner session={realtimeSession} onOpenRawEvents={() => document.getElementById("live-stt-raw-events")?.scrollIntoView({ behavior: "smooth", block: "center" })} />
        <div className="space-y-2">
          <FieldLabel>Microphone Input</FieldLabel>
          <select
            id="browser-mic-device"
            aria-label="Microphone input device"
            value={selectedDeviceId}
            onChange={(event) => handleDeviceChange(event.target.value)}
            disabled={startDisabled}
            className="h-11 w-full rounded-lg border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-cyan-200/50 disabled:cursor-not-allowed disabled:text-slate-500"
          >
            <option value="" className="bg-slate-950">
              Default microphone
            </option>
            {devices.map((device, index) => (
              <option key={device.deviceId || `mic-${index}`} value={device.deviceId} className="bg-slate-950">
                {deviceLabel(device, index)}
              </option>
            ))}
          </select>
          <FieldHint>Choose your condenser mic or audio interface if it appears here.</FieldHint>
          {selectedDeviceLabel ? <p className="text-xs text-cyan-100/75">Selected: {selectedDeviceLabel}</p> : null}
          <ActionButton className="lg:hidden" variant="secondary" onClick={() => void refreshDevices()} disabled={startDisabled}>
            Refresh Devices
          </ActionButton>
        </div>

        <section className="space-y-3 rounded-lg border border-cyan-200/15 bg-cyan-200/[0.035] p-3" aria-labelledby="live-recognition-heading">
          <div>
            <p id="live-recognition-heading" className="text-sm font-semibold text-white">Realtime language configuration</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              This setting tells Deepgram which language you will speak. It does not translate speech into another language.
            </p>
          </div>

          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Recognition mode</legend>
            <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-md border border-white/10 bg-black/20 p-2 text-xs text-slate-200 focus-within:border-cyan-200/50">
              <input
                type="radio"
                name="live-recognition-mode"
                checked={recognitionMode === "known-language"}
                onChange={() => requestRecognitionConfig({ mode: "known-language", model: "nova-3", language: selectedLanguage })}
                className="mt-0.5 size-4 accent-cyan-200"
              />
              <span><strong className="block text-white">Known spoken language</strong>Use one verified Nova-3 streaming language.</span>
            </label>
            <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-md border border-white/10 bg-black/20 p-2 text-xs text-slate-200 focus-within:border-cyan-200/50">
              <input
                type="radio"
                name="live-recognition-mode"
                checked={recognitionMode === "nova-multilingual"}
                onChange={() => requestRecognitionConfig({ mode: "nova-multilingual", model: "nova-3", language: "multi" })}
                className="mt-0.5 size-4 accent-cyan-200"
              />
              <span><strong className="block text-white">Nova-3 multilingual / code-switching</strong>{NOVA3_MULTILINGUAL_LANGUAGE_LABEL}.</span>
            </label>
          </fieldset>

          {recognitionMode === "known-language" ? (
            <div className="space-y-2">
              <FieldLabel>Spoken language</FieldLabel>
              <select
                aria-label="Live Mic spoken language"
                value={selectedLanguage}
                onChange={(event) => {
                  if (isDeepgramNova3StreamingLanguageCode(event.target.value)) {
                    requestRecognitionConfig({ mode: "known-language", model: "nova-3", language: event.target.value });
                  }
                }}
                className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-200/50"
              >
                {DEEPGRAM_NOVA3_STREAMING_LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code} className="bg-slate-950">{option.name} ({option.code})</option>
                ))}
              </select>
              <FieldHint>All languages supported by Nova-3 and the realtime /v1/listen transport. Language support varies by model, endpoint, and transport.</FieldHint>
            </div>
          ) : (
            <InlineMessage status="idle">
              Nova-3 sends <span className="font-mono">language=multi</span>. It does not send a second fixed language or <span className="font-mono">detect_language=true</span>.
            </InlineMessage>
          )}

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Try your native language</p>
            <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Quick-select spoken language">
              {QUICK_LANGUAGE_CODES.map((code) => {
                const option = getDeepgramNova3LanguageOption(code);
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => requestRecognitionConfig({ mode: "known-language", model: "nova-3", language: code })}
                    className={`min-h-9 rounded-md border px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70 ${recognitionMode === "known-language" && selectedLanguage === code ? "border-cyan-200/45 bg-cyan-200/15 text-cyan-50" : "border-white/10 bg-black/20 text-slate-300 hover:border-white/25"}`}
                  >
                    {option?.name ?? code}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-2 rounded-md border border-white/10 bg-black/25 p-2 text-[11px] text-slate-400 sm:grid-cols-2 xl:grid-cols-4" aria-label="Effective Live Mic session configuration">
            <ConfigValue label="Recognition mode" value={effectiveRecognitionConfig.mode === "known-language" ? "Known spoken language" : "Nova-3 multilingual"} />
            <ConfigValue label="Model" value={effectiveRecognitionConfig.model} mono />
            <ConfigValue label="Spoken language" value={effectiveRecognitionConfig.mode === "known-language" ? configuredLanguageOption?.name ?? effectiveRecognitionConfig.language : "Multilingual set"} />
            <ConfigValue label="Language code" value={effectiveRecognitionConfig.language} mono />
            <ConfigValue label="Endpoint" value="WSS /v1/listen" mono />
            <ConfigValue label="Audio MIME" value={selectedMimeType} mono />
            <ConfigValue label="Interim / endpointing / VAD" value="on / 300 ms / on" />
            <ConfigValue label="Auth" value="Temporary token" />
          </div>

          <p className="hidden text-[11px] leading-5 text-amber-100/75 lg:block">Billable operation: {billableNotice}</p>
          {effectiveRecognitionConfig.mode === "known-language" && NATIVE_LANGUAGE_PROMPTS[effectiveRecognitionConfig.language] ? (
            <details className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
              <summary className="cursor-pointer text-xs text-slate-300">Optional native-language presenter prompt</summary>
              <p className="mt-2 text-xs leading-5 text-slate-400">{NATIVE_LANGUAGE_PROMPTS[effectiveRecognitionConfig.language]}</p>
            </details>
          ) : null}

          <div className="rounded-md border border-violet-300/15 bg-violet-300/[0.04] p-2 text-xs leading-5 text-slate-400">
            <strong className="text-violet-100">Flux multilingual:</strong> Available in the Applied Voice Systems turn-taking lab. The current Live Mic keeps its stable Nova-3 v1 lifecycle; Flux v2 requires different turn events and capture timing.
            {onOpenModule ? <button type="button" onClick={() => onOpenModule("applied-voice-systems")} className="ml-2 rounded border border-violet-200/20 px-2 py-1 text-violet-100 outline-none focus-visible:ring-2 focus-visible:ring-violet-200/70">Open Flux Lab</button> : null}
          </div>
          <a href={DEEPGRAM_LANGUAGE_DOCS_URL} target="_blank" rel="noreferrer" className="inline-flex text-xs text-cyan-200 underline decoration-cyan-200/30 underline-offset-4">Official model and language reference</a>
        </section>

        {onRedactionPolicyChange ? (
          <RedactionControl
            policy={redactionPolicy}
            onChange={onRedactionPolicyChange}
            mode="streaming"
            language={selectedRecognitionConfig.language}
            disabled={machineState !== "idle" && machineState !== "stopped" && machineState !== "error"}
            onOpenLab={onOpenModule ? () => onOpenModule("redaction-lab") : undefined}
          />
        ) : null}
        {redactionBlocked ? <div className="hidden lg:block"><InlineMessage status="error">Streaming redaction is currently configured only for English. Switch the language to English, use prerecorded transcription, or disable redaction. Start is blocked and no microphone permission will be requested.</InlineMessage></div> : null}

        {pendingRecognitionChange ? (
          <div role="alertdialog" aria-modal="true" aria-labelledby="restart-language-title" aria-describedby="restart-language-description" className="rounded-lg border border-amber-200/35 bg-amber-200/[0.08] p-3">
            <p id="restart-language-title" className="text-sm font-semibold text-amber-50">Reconnect required</p>
            <p id="restart-language-description" className="mt-1 text-xs leading-5 text-amber-100/75">The active WebSocket keeps its original configuration. Stop it completely before reconnecting with {pendingRecognitionChange.label}.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <ActionButton onClick={() => void confirmRecognitionRestart()}>Stop and restart with this language</ActionButton>
              <ActionButton variant="secondary" onClick={() => setPendingRecognitionChange(null)}>Keep current session</ActionButton>
            </div>
          </div>
        ) : null}

        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs text-slate-400">
            <span>Local mic input level</span>
            <span className="font-mono text-slate-300">{Math.round(level * 100)}%</span>
          </div>
          <div
            className="h-3 overflow-hidden rounded-full bg-white/[0.06]"
            role="meter"
            aria-label="Local microphone input level"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(level * 100)}
          >
            <div
              className="h-full rounded-full bg-cyan-200 transition-[width] duration-75"
              style={{ width: `${Math.round(level * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            The meter only confirms local microphone input. Deepgram transcription starts after the WebSocket opens.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-y border-white/10 py-3 text-xs">
          <span className="text-slate-500">Selected browser MIME type</span>
          <span className="break-all font-mono text-cyan-100">{selectedMimeType}</span>
        </div>

        <ConnectionStatusPanel
          tokenStatus={tokenStatus}
          webSocketStatus={webSocketStatus}
          recorderStatus={recorderStatus}
          transcriptStatus={transcriptStatus}
        />

        <div className="hidden flex-wrap gap-3 lg:flex">
          <ActionButton variant="secondary" onClick={() => void refreshDevices()} disabled={startDisabled}>
            Refresh Devices
          </ActionButton>
          <ActionButton onClick={() => void startLiveMic()} disabled={startDisabled} data-pocket-guard={observatory ? "ignore" : undefined} data-shortcut-command="run_primary" data-shortcut-label="Start current session" data-shortcut-disabled-reason="The Live Mic session is already active or browser setup is incomplete.">
            {liveMicStartLabel(machineState)}<ShortcutHint command="run_primary" />
          </ActionButton>
          <ActionButton variant="secondary" onClick={() => void stopLiveMic()} disabled={stopDisabled} data-shortcut-command="stop_session" data-shortcut-label="Stop current session" data-shortcut-disabled-reason="No Live Mic session is active.">
            Stop<ShortcutHint command="stop_session" />
          </ActionButton>
          <ActionButton variant="secondary" onClick={clearTranscript} disabled={!stopDisabled} data-shortcut-command="reset_current" data-shortcut-label="Reset current module" data-shortcut-disabled-reason="Stop the active Live Mic session before clearing its transcript.">
            Clear Transcript<ShortcutHint command="reset_current" />
          </ActionButton>
          {!observatory ? (
            <ActionButton
              variant={fallbackHighlighted ? "primary" : "secondary"}
              className={
                fallbackHighlighted
                  ? "border-amber-200/45 bg-amber-200 text-slate-950 hover:bg-amber-100 disabled:bg-amber-200/30"
                  : ""
              }
              onClick={() => void runFiveSecondMicTest()}
              disabled={fallbackState === "loading" || startDisabled}
            >
              {fallbackState === "loading"
                ? fallbackCountdown
                  ? `Recording ${fallbackCountdown}`
                  : "Transcribing..."
                : "Run 5-sec Mic Test"}
            </ActionButton>
          ) : null}
        </div>

        {!observatory ? (
          <div className="flex flex-wrap gap-3 lg:hidden">
            <ActionButton
              variant={fallbackHighlighted ? "primary" : "secondary"}
              className={fallbackHighlighted ? "border-amber-200/45 bg-amber-200 text-slate-950 hover:bg-amber-100 disabled:bg-amber-200/30" : ""}
              onClick={() => void runFiveSecondMicTest()}
              disabled={fallbackState === "loading" || startDisabled}
            >
              {fallbackState === "loading" ? (fallbackCountdown ? `Recording ${fallbackCountdown}` : "Transcribing...") : "Run 5-sec Mic Test"}
            </ActionButton>
          </div>
        ) : null}

        <div
          className="hidden lg:block"
          role={machineState === "error" || machineState === "fallback_available" ? "alert" : "status"}
          aria-live="polite"
        >
          <InlineMessage status={fallbackState === "success" ? "success" : liveMicStateToAsyncStatus(machineState)}>
            {message}
          </InlineMessage>
        </div>
        <span className="sr-only" role="status" aria-live="polite">
          {fallbackState === "loading" && fallbackCountdown
            ? `${fallbackCountdown} seconds remaining in microphone test.`
            : ""}
        </span>
        {liveNote ? (
          <InlineMessage status={fallbackState === "error" || machineState === "fallback_available" ? "error" : "idle"}>
            {liveNote}
          </InlineMessage>
        ) : null}
        {speechSignal ? (
          <span
            className="inline-flex h-7 items-center rounded-md border border-emerald-300/25 bg-emerald-300/10 px-2.5 text-xs font-medium text-emerald-100"
            role="status"
            aria-live="polite"
          >
            {speechSignal}
          </span>
        ) : null}
        {guidedHints ? (
          <FieldHint>
            Live audio uses two bounded connection attempts. Containerized browser audio is sent without raw PCM parameters.
          </FieldHint>
        ) : null}

        <DiagnosticChecklist checklist={checklist} />

        <div className="hidden gap-3 lg:grid lg:grid-cols-2">
          <TranscriptBox title="Interim Transcript" text={interimTranscript || "No interim transcript yet."} />
          <div role="log" aria-live="polite" aria-atomic="false">
            <TranscriptBox title="Final Transcript Log" text={finalTranscript || "No final transcript yet."} />
          </div>
        </div>

        <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-400" role="status" aria-live="polite">
          {effectiveRecognitionConfig.mode === "known-language"
            ? `Configured spoken language: ${configuredLanguageOption?.name ?? effectiveRecognitionConfig.language} (${effectiveRecognitionConfig.language}). This is configured, not detected.`
            : observedLanguages.length
              ? `Observed language from Deepgram event: ${observedLanguages.join(", ")}.`
              : "Observed language from Deepgram event: unavailable until a multilingual event includes language data."}
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 sm:grid-cols-4">
          <Metric label="Chunks sent" value={String(chunkStats.chunksSent)} />
          <Metric label="Total bytes" value={formatBytes(chunkStats.totalBytesSent)} />
          <Metric label="First chunk" value={formatEventTime(chunkStats.firstChunkAt)} />
          <Metric label="Last chunk" value={formatEventTime(chunkStats.lastChunkAt)} />
        </div>

        <label className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={showAudioChunkEvents}
            onChange={(event) => {
              showAudioChunkEventsRef.current = event.target.checked;
              setShowAudioChunkEvents(event.target.checked);
            }}
            className="size-4 accent-cyan-200"
          />
          Show audio chunk events
        </label>

        <details id="live-stt-raw-events" className="rounded-lg border border-white/10 bg-black/20 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-200">Raw live event JSON</summary>
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#020406] p-3 font-mono text-xs leading-6 text-slate-300">
            {JSON.stringify(rawEvents, null, 2)}
          </pre>
        </details>

        <WhatHappenedPanel details={attemptDetails} chunkStats={chunkStats} lastError={lastError} />

        {showInlineInspector ? <PayloadInspector record={liveInspector} defaultOpen={guidedHints} /> : null}

        <div className="rounded-lg border border-cyan-200/10 bg-cyan-200/[0.04] p-4">
          <p className="text-sm font-semibold text-white">Demo script to read aloud</p>
          <div className="mt-3 grid gap-3">
            {DEMO_SCRIPTS.map((script) => (
              <div key={script.title} className="rounded-md border border-white/10 bg-black/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100/70">{script.title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">{script.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </LabCard>
  );
}

function ConfigValue({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <span className="min-w-0">
      <span className="block text-[9px] uppercase tracking-wide text-slate-600">{label}</span>
      <span className={`mt-0.5 block break-words text-slate-200 ${mono ? "font-mono" : ""}`}>{value}</span>
    </span>
  );
}

function collectObservedLanguages(event: DeepgramLiveEvent) {
  const values = [
    ...(event.languages ?? []),
    ...(event.channel?.alternatives?.flatMap((alternative) => [
      ...(alternative.languages ?? []),
      ...(alternative.words ?? []).map((word) => word.language).filter((value): value is string => Boolean(value)),
    ]) ?? []),
  ];

  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function ConnectionStatusPanel({
  tokenStatus,
  webSocketStatus,
  recorderStatus,
  transcriptStatus,
}: {
  tokenStatus: TokenStatus;
  webSocketStatus: WebSocketStatus;
  recorderStatus: RecorderStatus;
  transcriptStatus: TranscriptStatus;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Deepgram connection</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <ConnectionState label="Token" value={tokenStatus} status={tokenStatus} />
        <ConnectionState
          label="WebSocket"
          value={webSocketStatus}
          status={webSocketStatus === "open" ? "success" : webSocketStatus === "error" ? "error" : "pending"}
        />
        <ConnectionState
          label="Recorder"
          value={recorderStatus}
          status={recorderStatus === "recording" ? "success" : "pending"}
        />
        <ConnectionState
          label="Transcript events"
          value={transcriptStatus}
          status={transcriptStatus === "receiving" ? "success" : "pending"}
        />
      </div>
    </div>
  );
}

function ConnectionState({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status: "pending" | "success" | "error";
}) {
  const dotClass = {
    pending: "bg-slate-500",
    success: "bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.45)]",
    error: "bg-rose-300 shadow-[0_0_10px_rgba(253,164,175,0.4)]",
  }[status];

  return (
    <div className="flex min-h-9 items-center justify-between gap-3 border-b border-white/[0.06] px-1 text-xs last:border-b-0 sm:last:border-b">
      <span className="text-slate-500">{label}</span>
      <span className="inline-flex items-center gap-2 font-mono text-slate-200">
        <span className={`size-2 rounded-full ${dotClass}`} />
        {value}
      </span>
    </div>
  );
}

function DiagnosticChecklist({ checklist }: { checklist: Record<DiagnosticKey, CheckStatus> }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Live mic diagnostic checklist</p>
      <div className="grid gap-x-5 gap-y-2 md:grid-cols-2">
        {DIAGNOSTIC_ITEMS.map((item) => (
          <div key={item.key} className="flex min-h-8 items-center justify-between gap-3 border-b border-white/[0.06] text-xs">
            <span className="text-slate-300">{item.label}</span>
            <CheckBadge status={checklist[item.key]} />
          </div>
        ))}
      </div>
    </div>
  );
}

function CheckBadge({ status }: { status: CheckStatus }) {
  const styles: Record<CheckStatus, string> = {
    pending: "border-white/10 bg-white/[0.05] text-slate-400",
    success: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
    warning: "border-amber-300/25 bg-amber-300/10 text-amber-100",
    error: "border-rose-300/25 bg-rose-300/10 text-rose-100",
  };

  return <span className={`rounded-md border px-2 py-1 font-mono text-[10px] uppercase ${styles[status]}`}>{status}</span>;
}

function TranscriptBox({ title, text, compact = false }: { title: string; text: string; compact?: boolean }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</p>
      <pre
        aria-label={compact ? `${title} content` : undefined}
        className={`mt-2 whitespace-pre-wrap break-words font-mono text-xs leading-6 text-slate-200 ${compact ? "min-h-24 max-h-44 overflow-y-auto" : "min-h-28"}`}
        tabIndex={compact ? 0 : undefined}
      >
        {text}
      </pre>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 bg-[#070b0f] p-3">
      <p className="text-[10px] uppercase tracking-[0.14em] text-slate-600">{label}</p>
      <p className="mt-1 truncate font-mono text-xs text-slate-200" title={value}>
        {value}
      </p>
    </div>
  );
}

function WhatHappenedPanel({
  details,
  chunkStats,
  lastError,
}: {
  details: AttemptDetails | null;
  chunkStats: ChunkStats;
  lastError: string;
}) {
  if (!details && !lastError) {
    return null;
  }

  return (
    <details className="rounded-lg border border-white/10 bg-black/20 p-3" open={Boolean(lastError)}>
      <summary className="cursor-pointer text-sm font-semibold text-slate-200">What happened?</summary>
      <div className="mt-3 grid gap-px overflow-hidden rounded-md border border-white/10 bg-white/10 sm:grid-cols-2">
        <Detail label="Close code" value={details?.closeCode === undefined ? "None" : String(details.closeCode)} />
        <Detail
          label="Status if known"
          value={details?.status === undefined ? "Unavailable to browser" : String(details.status)}
        />
        <Detail label="Attempt" value={details ? `${details.attemptNumber} (${details.attemptId})` : "Not started"} />
        <Detail label="MIME type" value={details?.mimeType || "Not selected"} />
        <Detail label="Chunks sent" value={String(chunkStats.chunksSent)} />
        <Detail label="Bytes sent" value={formatBytes(chunkStats.totalBytesSent)} />
        <Detail
          label="Token age at connect"
          value={details?.tokenAgeMs === undefined ? "Unavailable" : `${(details.tokenAgeMs / 1_000).toFixed(2)}s`}
        />
        <Detail label="Deepgram message received" value={details?.anyDeepgramMessage ? "Yes" : "No"} />
        <Detail label="Close reason" value={details?.closeReason || "No reason supplied"} />
        <Detail label="Clean close" value={details?.wasClean === undefined ? "Unknown" : details.wasClean ? "Yes" : "No"} />
      </div>
      {details ? (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-600">URL query parameters</p>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#020406] p-3 font-mono text-xs leading-6 text-slate-300">
            {JSON.stringify(details.query, null, 2)}
          </pre>
        </div>
      ) : null}
      {lastError ? <p className="mt-3 text-sm leading-6 text-rose-100">{lastError}</p> : null}
    </details>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 bg-[#070b0f] p-3">
      <p className="text-[10px] uppercase tracking-[0.14em] text-slate-600">{label}</p>
      <p className="mt-1 break-words font-mono text-xs text-slate-200">{value}</p>
    </div>
  );
}

function createInitialChecklist(): Record<DiagnosticKey, CheckStatus> {
  return {
    api_key: "pending",
    token_route: "pending",
    mic_permission: "pending",
    input_device: "pending",
    browser_mime: "pending",
    websocket: "pending",
    audio_chunks: "pending",
    deepgram_events: "pending",
    final_transcript: "pending",
  };
}

function attemptToDetails(
  attempt: DeepgramLiveAttemptMetadata,
  extra: Pick<AttemptDetails, "anyDeepgramMessage"> & Partial<Pick<AttemptDetails, "status">>,
): AttemptDetails {
  return {
    attemptId: attempt.id,
    attemptNumber: attempt.number,
    url: attempt.url,
    query: attempt.query,
    mimeType: attempt.mimeType,
    tokenAgeMs: attempt.tokenAgeMs,
    status: extra.status,
    anyDeepgramMessage: extra.anyDeepgramMessage,
  };
}

function eventLabel(type: string) {
  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function readEventType(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value) && "type" in value) {
    const type = (value as { type?: unknown }).type;
    if (typeof type === "string" && type) {
      return type;
    }
  }
  return "message";
}

function readKnownStatus(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value) && "status" in value) {
    const status = (value as { status?: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

function readDeepgramError(event: DeepgramLiveEvent) {
  return event.err_msg || event.message || event.error || event.reason || "Deepgram live transcription error.";
}

function failureGuidance(stage: FailureStage) {
  const guidance: Record<FailureStage, string> = {
    permission: "Microphone permission is required before either live transcription or the 5-sec Mic Test can run.",
    device: "Refresh devices, choose an available microphone, and retry.",
    mime: "This browser cannot create a supported MediaRecorder stream. Try a current Chrome, Edge, Firefox, or Safari release.",
    token: "Live setup stopped before the WebSocket opened. Run the 5-sec Mic Test to check server-side transcription and API key health.",
    websocket: "Realtime failed again. Run the 5-sec Mic Test to confirm your mic and API key.",
    recorder: "Realtime audio capture stopped after the socket opened. Run the 5-sec Mic Test to verify browser recording and upload transcription.",
  };
  return guidance[stage];
}

function fallbackSuggestion(stage: FailureStage) {
  if (stage === "websocket" || stage === "recorder") {
    return "Realtime failed. Run the 5-sec Mic Test to isolate microphone/API health from the WebSocket path.";
  }
  if (stage === "token") {
    return "The temporary-token step failed. Run the 5-sec Mic Test to check the server-side API key path.";
  }
  return "Resolve the microphone setup error, then retry Live Mic or the 5-sec Mic Test.";
}

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeout);
      resolve();
    };
    const timeout = window.setTimeout(finish, 50);
    window.requestAnimationFrame(finish);
  });
}

function stopTracks(stream: MediaStream | null) {
  for (const track of stream?.getTracks() ?? []) {
    track.stop();
  }
}

function activeTrackCount(stream: MediaStream | null) {
  return (stream?.getTracks() ?? []).filter((track) => track.readyState === "live").length;
}

function webSocketReadyState(status: WebSocketStatus) {
  if (status === "pending") return WebSocket.CONNECTING;
  if (status === "open") return WebSocket.OPEN;
  return WebSocket.CLOSED;
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readLiveRequestId(value: unknown) {
  return isUnknownRecord(value) && typeof value.request_id === "string" ? value.request_id : undefined;
}

function readStreamMicLabel(stream: MediaStream) {
  return stream.getAudioTracks()[0]?.label || "";
}

function deviceLabel(device: MediaDeviceInfo | undefined, index: number) {
  return device?.label || `Microphone ${Math.max(0, index) + 1}`;
}

function fileExtensionForMime(mimeType: string) {
  if (mimeType.includes("ogg")) {
    return "ogg";
  }
  if (mimeType.includes("mp4")) {
    return "mp4";
  }
  return "webm";
}

function formatEventTime(value: string | null) {
  if (!value) {
    return "--";
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

async function unwrapEnvelope<T>(response: Response) {
  const data = (await response.json().catch(() => null)) as ApiDebugEnvelope<T> | null;
  if (!isApiEnvelope<T>(data)) {
    throw new Error(`Request failed with HTTP ${response.status}.`);
  }
  if (!response.ok || !data.ok) {
    throw new Error(data.error?.message || `Request failed with HTTP ${response.status}.`);
  }
  return data;
}

function requireEnvelopeData<T>(envelope: ApiDebugEnvelope<T>) {
  if (envelope.data === undefined) {
    throw new Error("Response did not include a data payload.");
  }
  return envelope.data;
}

function isApiEnvelope<T>(value: unknown): value is ApiDebugEnvelope<T> {
  return Boolean(
    value &&
      typeof value === "object" &&
      "ok" in value &&
      "inspector" in value &&
      typeof (value as { ok?: unknown }).ok === "boolean",
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Microphone permission was denied. Allow mic access for localhost, then try again.";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "No microphone is available. Connect an input device, refresh devices, and try again.";
  }
  return error instanceof Error ? error.message : "Unexpected microphone error.";
}

function timestamp() {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());
}

class TokenRouteError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "TokenRouteError";
  }
}
