"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import { BrowserMicCard } from "@/components/browser-mic-card";
import { AudioSignalLab } from "@/components/audio-signal-lab/AudioSignalLab";
import { ApiStudio, type ApiStudioInitialConfiguration } from "@/components/api-studio/ApiStudio";
import { AppliedEngineeringQuestline } from "@/components/applied-engineering-questline/AppliedEngineeringQuestline";
import { AppliedVoiceSystems } from "@/components/applied-voice-systems/AppliedVoiceSystems";
import { LiveObservatoryLab } from "@/components/live-observatory/LiveObservatoryLab";
import { CodeLab } from "@/components/CodeLab";
import { CodePlacementMap } from "@/components/CodePlacementMap";
import { CodeViewer } from "@/components/CodeViewer";
import { EventTimeline } from "@/components/EventTimeline";
import { CheckIcon, CopyIcon, LinkIcon, MicIcon, SpeakerIcon, UploadIcon, WaveIcon } from "@/components/icons";
import { PayloadInspector } from "@/components/PayloadInspector";
import { ShortcutHint, useKeyboardShortcutController, type ShortcutRuntimeAction } from "@/components/keyboard-shortcuts/KeyboardShortcutController";
import { AudioFileDropzone } from "@/components/upload-audio/AudioFileDropzone";
import { FamiliarCareExperience } from "@/components/trusted-voice/FamiliarCareExperience";
import { FluxTtsStudio } from "@/components/flux-tts/FluxTtsStudio";
import { GuidedRecipes } from "@/components/open-lab/GuidedRecipes";
import { AiIntentRouter } from "@/components/ai/AiIntentRouter";
import { ModuleEvolutionAffordance } from "@/components/lab-evolution/ModuleEvolutionAffordance";
import { OneHeaderControls } from "@/components/one/OneHeaderControls";
import { OneMark } from "@/components/one/OneMark";
import { Nova3LanguageWorkbench } from "@/components/language-workbench/Nova3LanguageWorkbench";
import { RedactionControl } from "@/components/redaction/RedactionControl";
import { RedactionLab, type RedactionHandoffDestination } from "@/components/redaction/RedactionLab";
import { useCodeLabLaunch } from "@/context/code-lab-launch-context";
import { useGuidedHints } from "@/hooks/use-guided-hints";
import { DEEPGRAM_NOVA3_LANGUAGE_OPTIONS, getDeepgramNova3LanguageOption, type DeepgramNova3LanguageCode } from "@/lib/deepgram-languages";
import { languageBaseCode, type LanguageHandoffDestination } from "@/lib/language-workbench";
import { extractDeepgramRequestId, extractDetectedLanguage } from "@/lib/deepgram-samples";
import { getDeepgramEndpoint } from "@/lib/deepgram-endpoint-registry";
import {
  clearOneVisibleWorkspace,
  evidenceScopeForOneVisibleWorkspaceModule,
  publishOneVisibleWorkspace,
} from "@/lib/one-webmcp/visible-context";
import { API_LAB_WORKBENCH_HANDOFF_KEY } from "@/lib/payload-code-workbench";
import { apiLabWorkbenchHandoffSchema } from "@/types/payload-code-workbench";
import {
  MODULE_CODE_SNIPPETS,
  type LabModuleId,
} from "@/lib/code-snippets";
import {
  CODE_LAB_WORKFLOWS,
  getCodeLabWorkflow,
  workflowForModule,
  type CodeLabLanguage,
  type CodeLabWorkflowId,
} from "@/lib/code-lab-files";
import { toCodeLabLaunchContextInput } from "@/lib/code-lab-launch-context";
import {
  buildInspectorRecord,
  createTimelineEvent,
  type ApiDebugEnvelope,
  type InspectorRecord,
} from "@/lib/inspection";
import {
  SAMPLE_AUDIO_SCENARIOS,
  getSampleAudioPath,
  getSampleAudioUrl,
  type SampleScenario,
} from "@/lib/sample-scenarios";
import {
  AURA_VOICE_GROUPS,
  getDefaultVoiceForLanguage,
  type TtsVoiceLanguageCode,
} from "@/lib/tts-voices";
import type {
  AsyncStatus,
  DeepgramErrorResponse,
  DeepgramHealthResponse,
  LabResult,
  TranscriptionResponse,
  TtsResponseData,
  TtsVoiceModel,
} from "@/lib/types";
import type { CodeLabLaunchContext, CodeLabLaunchMode } from "@/types/code-lab-launch-context";
import type { QuestlineSectionId } from "@/types/questline";
import {
  EMPTY_REDACTION_POLICY,
  REDACTION_PRESETS,
  evaluateRedactionCompatibility,
  serializeRedactionValues,
  type RedactionPolicy,
} from "@/lib/redaction";
import { VOICE_OPEN_LAB_NAVIGATION, type VoiceOpenLabAreaId } from "@/lib/voice-open-lab/navigation";

const URL_TRANSCRIPTION_UNAVAILABLE = "URL transcription is unavailable in this hosted lab.";

const LabEvolution = dynamic(
  () => import("@/components/lab-evolution/LabEvolution").then((module) => module.LabEvolution),
  {
    loading: () => (
      <div className="grid h-full min-h-64 place-items-center p-6 text-sm text-slate-400" role="status">
        Opening the engineering notebookâ€¦
      </div>
    ),
  },
);

type FileLanguageMode = "known" | "auto-detect";

type FileTranscriptionOutcome = {
  kind: "completed-with-transcript" | "completed-empty" | "request-failed" | "unsupported-configuration";
  fileName: string;
  requestedSpokenLanguage: string;
  detectedLanguage?: string;
  model: string;
  requestId?: string;
};

const DEFAULT_RESULT: LabResult = {
  title: "Ready",
  transcript: "Select a module and run a lab action.",
  raw: {
    local_lab: true,
    security: "DEEPGRAM_API_KEY stays server-side in API routes.",
  },
  notes: "Payloads, code, and timelines appear in the right inspector panel.",
  updatedAt: "not run yet",
};

const MODULES: Array<{
  id: LabModuleId;
  label: string;
  short: string;
  subtitle: string;
  category?: string;
}> = [
  { id: "overview", label: "Overview", short: "OV", subtitle: "Lab status and workflow map" },
  { id: "lab-evolution", label: "Lab Evolution", short: "EVO", subtitle: "Questions, evidence, and the next iteration", category: "Learning Tools" },
  { id: "connection", label: "Connection Check", short: "CN", subtitle: "Verify server-side key access" },
  { id: "transcribe-url", label: "Transcribe URL", short: "URL", subtitle: "Hosted prerecorded audio" },
  { id: "upload-audio", label: "Upload Audio", short: "UP", subtitle: "Local file transcription" },
  { id: "live-mic", label: "Live Mic", short: "MIC", subtitle: "Realtime browser audio" },
  { id: "tts", label: "Text to Speech", short: "AURA", subtitle: "Aura Studio Â· existing /v1/speak synthesis", category: "Text to Speech" },
  { id: "flux-tts", label: "Flux TTS Studio", short: "FLUX", subtitle: "Voice-agent-first synthesis over /v2/speak", category: "Text to Speech Â· EA" },
  { id: "trusted-voice", label: "Trusted Voice", short: "TRUST", subtitle: "Consent-first voice experiences" },
  { id: "sample-library", label: "Sample Library", short: "SMP", subtitle: "Vertical demo audio assets" },
  { id: "language-explorer", label: "Language Explorer", short: "LANG", subtitle: "Nova-3 language controls" },
  { id: "redaction-lab", label: "Redaction Lab", short: "RED", subtitle: "Transcript privacy, entity masking, and policy design", category: "Learning Tools" },
  { id: "audio-signal-lab", label: "Audio Signal Lab", short: "AUDIO", subtitle: "Waveforms, signal health, formats, and speech-AI experiments", category: "Learning Tools" },
  { id: "api-studio", label: "API Studio", short: "API", subtitle: "Payload builder + API map", category: "Learning Tools" },
  { id: "applied-voice-systems", label: "Applied Voice Systems", short: "AVS", subtitle: "Client architecture, experiments, agents, and production readiness", category: "Learning Tools" },
  { id: "applied-engineering-questline", label: "Applied Engineering Questline", short: "QUEST", subtitle: "Polyglot coding, audio systems, debugging, and client-stack mastery", category: "Learning Tools" },
  { id: "live-observatory", label: "Live Observatory Lab", short: "OBS", subtitle: "Controlled live events, experiments, and cost provenance", category: "Learning Tools" },
  { id: "code-lab", label: "Code Lab", short: "CODE", subtitle: "Editable integration recipes" },
];

const CONTEXTUAL_MODULE_GROUPS = [
  { label: "Try", ids: ["overview", "live-mic", "upload-audio", "tts", "trusted-voice", "transcribe-url"] },
  { label: "Build", ids: ["connection", "flux-tts", "language-explorer", "audio-signal-lab", "api-studio", "code-lab", "live-observatory", "sample-library"] },
  { label: "Learn", ids: ["lab-evolution", "redaction-lab", "applied-voice-systems", "applied-engineering-questline"] },
] as const satisfies ReadonlyArray<{ label: string; ids: readonly LabModuleId[] }>;

type StatusState = {
  status: AsyncStatus;
  message: string;
};

type RightTab = "payload" | "timeline" | "code" | "notes";

const LEGACY_LAB_QUERY_KEYS = ["module", "operation", "workflow", "source", "command"] as const;

function clearLegacyLabQueryState() {
  const currentUrl = new URL(window.location.href);
  const originalPath = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;

  for (const key of LEGACY_LAB_QUERY_KEYS) {
    currentUrl.searchParams.delete(key);
  }

  const sanitizedPath = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
  if (sanitizedPath !== originalPath) {
    window.history.replaceState(window.history.state, "", sanitizedPath);
  }
}

export function DeepgramControlRoom({
  initialKeyDetected,
  hostedReviewMode,
  openLabMode,
  openLabDeepgramEnabled,
  shellStartedAt,
  initialModule,
  initialApiOperation,
  initialCodeWorkflow,
  initialHandoffSource,
  initialCommand,
}: {
  initialKeyDetected: boolean;
  hostedReviewMode: boolean;
  openLabMode: boolean;
  openLabDeepgramEnabled: boolean;
  shellStartedAt: string;
  initialModule?: string;
  initialApiOperation?: string;
  initialCodeWorkflow?: string;
  initialHandoffSource?: string;
  initialCommand?: boolean;
}) {
  const router = useRouter();
  const {
    context: codeLabLaunchContext,
    launchMode: codeLabLaunchMode,
    launch: publishCodeLabLaunch,
    clear: clearCodeLabLaunch,
  } = useCodeLabLaunch();
  const [activeModule, setActiveModule] = useState<LabModuleId>(() => MODULES.some((module) => module.id === initialModule) ? initialModule as LabModuleId : "overview");
  const [rightTab, setRightTab] = useState<RightTab>("payload");
  const [focusMode, setFocusMode] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(true);
  const [codeLabWorkflow, setCodeLabWorkflow] = useState<CodeLabWorkflowId>(() => CODE_LAB_WORKFLOWS.some((workflow) => workflow.id === initialCodeWorkflow) ? initialCodeWorkflow as CodeLabWorkflowId : "transcribe-url");
  const [codeLabInitialLanguage, setCodeLabInitialLanguage] = useState<CodeLabLanguage>("TypeScript");
  const [apiStudioOperationId, setApiStudioOperationId] = useState(initialApiOperation ?? "stt-url");
  const [apiStudioInitialConfiguration, setApiStudioInitialConfiguration] = useState<ApiStudioInitialConfiguration>();
  const [apiStudioHandoffRevision, setApiStudioHandoffRevision] = useState(0);
  const [questlineSelectedNodeId, setQuestlineSelectedNodeId] = useState<string | undefined>();
  const [questlineInitialSection, setQuestlineInitialSection] = useState<QuestlineSectionId | undefined>();
  const [guidedHints, setGuidedHints] = useGuidedHints();

  useEffect(() => {
    publishOneVisibleWorkspace(activeModule);
  }, [activeModule]);

  useEffect(() => () => clearOneVisibleWorkspace(), []);

  useEffect(() => {
    document.body.classList.add("one-control-room-active");
    return () => document.body.classList.remove("one-control-room-active");
  }, []);

  useEffect(() => {
    if (initialModule !== "api-studio" || initialHandoffSource !== "payload-workbench") return;
    const serialized = window.sessionStorage.getItem(API_LAB_WORKBENCH_HANDOFF_KEY);
    if (!serialized) return;
    window.sessionStorage.removeItem(API_LAB_WORKBENCH_HANDOFF_KEY);
    try {
      const parsed = apiLabWorkbenchHandoffSchema.safeParse(JSON.parse(serialized));
      if (!parsed.success || !getDeepgramEndpoint(parsed.data.endpointId)) return;
      const bodyValues = parsed.data.body && typeof parsed.data.body === "object" && !Array.isArray(parsed.data.body) ? parsed.data.body : {};
      const configuration: ApiStudioInitialConfiguration = {
        operationId: parsed.data.endpointId,
        values: { ...parsed.data.query, ...bodyValues },
        explanation: "A redacted technical-evidence request was prefilled for review. No request ran, no credential transferred, and the normal visible confirmation remains required.",
        sourceArtifactId: parsed.data.artifactId,
        sourceDiagnosisId: parsed.data.sourceDiagnosisId ?? undefined,
        transferredFields: parsed.data.transferredFields,
        notTransferred: parsed.data.notTransferred,
      };
      queueMicrotask(() => {
        setApiStudioOperationId(configuration.operationId);
        setApiStudioInitialConfiguration(configuration);
        setApiStudioHandoffRevision((current) => current + 1);
        setActiveModule("api-studio");
      });
    } catch {
      // Invalid or stale handoffs fail closed after one read.
    }
  }, [initialHandoffSource, initialModule]);

  const [health, setHealth] = useState<DeepgramHealthResponse | null>(null);
  const [model, setModel] = useState("nova-3");
  const [language, setLanguage] = useState<DeepgramNova3LanguageCode>("en");
  const [smartFormat, setSmartFormat] = useState(true);
  const [diarize, setDiarize] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [audioSignalHandoffFile, setAudioSignalHandoffFile] = useState<File | null>(null);
  const [fileLanguageMode, setFileLanguageMode] = useState<FileLanguageMode>("known");
  const [fileOutcome, setFileOutcome] = useState<FileTranscriptionOutcome | null>(null);
  const [ttsText, setTtsText] = useState("Deepgram Voice Lab turns speech experiments into a calm local workflow.");
  const [ttsModel, setTtsModel] = useState<TtsVoiceModel>("aura-2-thalia-en");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [trustedVoiceResetKey, setTrustedVoiceResetKey] = useState(0);
  const [result, setResult] = useState<LabResult>(DEFAULT_RESULT);
  const [copiedLabel, setCopiedLabel] = useState("");
  const [liveMicInitialMessage, setLiveMicInitialMessage] = useState<string>();
  const [sampleFileMap, setSampleFileMap] = useState<Record<string, boolean>>({});
  const [redactionLabPolicy, setRedactionLabPolicy] = useState<RedactionPolicy>(() => ({ ...EMPTY_REDACTION_POLICY }));
  const [fileRedactionPolicy, setFileRedactionPolicy] = useState<RedactionPolicy>(() => ({ ...EMPTY_REDACTION_POLICY }));
  const [liveRedactionPolicy, setLiveRedactionPolicy] = useState<RedactionPolicy>(() => ({ ...EMPTY_REDACTION_POLICY }));

  const [connectionState, setConnectionState] = useState<StatusState>({
    status: initialKeyDetected ? "idle" : "error",
    message: initialKeyDetected ? "Key detected locally." : "Key missing locally.",
  });
  const [urlState, setUrlState] = useState<StatusState>({ status: "idle", message: URL_TRANSCRIPTION_UNAVAILABLE });
  const [fileState, setFileState] = useState<StatusState>({ status: "idle", message: "" });
  const [ttsState, setTtsState] = useState<StatusState>({ status: "idle", message: "" });
  const [trustedVoiceState, setTrustedVoiceState] = useState<StatusState>({ status: "idle", message: "" });
  const [connectionInspector, setConnectionInspector] = useState<InspectorRecord | null>(null);
  const [fileInspector, setFileInspector] = useState<InspectorRecord | null>(null);
  const [ttsInspector, setTtsInspector] = useState<InspectorRecord | null>(null);
  const [trustedVoiceInspector, setTrustedVoiceInspector] = useState<InspectorRecord | null>(null);
  const [liveInspector, setLiveInspector] = useState<InspectorRecord | null>(null);
  const [codeLabInspector, setCodeLabInspector] = useState<InspectorRecord | null>(null);
  const [fileTranscriptRaw, setFileTranscriptRaw] = useState<unknown>(null);

  useEffect(() => {
    return () => {
      if (audioUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  useEffect(() => {
    let active = true;

    async function checkSamples() {
      const entries = await Promise.all(
        SAMPLE_AUDIO_SCENARIOS.map(async (sample) => {
          try {
            const response = await fetch(getSampleAudioPath(sample.slug), { method: "HEAD", cache: "no-store" });
            return [sample.slug, response.ok] as const;
          } catch {
            return [sample.slug, false] as const;
          }
        }),
      );

      if (active) {
        setSampleFileMap(Object.fromEntries(entries));
      }
    }

    void checkSamples();

    return () => {
      active = false;
    };
  }, []);

  const activeModuleMeta = MODULES.find((item) => item.id === activeModule) || MODULES[0];
  const heroStatus = openLabMode
    ? openLabDeepgramEnabled
      ? "Open Lab Â· Live enabled"
      : "Open Lab Â· Educational mode"
    : health?.configured || initialKeyDetected
      ? "API Key Detected"
      : "API Key Missing";
  const activeInspector = useMemo(
    () =>
      getActiveInspector({
        activeModule,
        connectionInspector,
        urlInspector: buildStaticInspector("URL transcription", URL_TRANSCRIPTION_UNAVAILABLE, "transcribe-url", shellStartedAt, "unavailable"),
        fileInspector,
        liveInspector,
        ttsInspector,
        trustedVoiceInspector,
        trustedVoiceFallbackInspector: buildStaticInspector("Trusted Voice: Familiar Care", "Consent, disclosure, sensitive-detail policy, and approved Aura TTS are inspected without storing recipient text or audio.", "trusted-voice", shellStartedAt),
        sampleLibraryInspector: buildSampleLibraryInspector(sampleFileMap, shellStartedAt),
        languageInspector: buildLanguageInspector(language, shellStartedAt),
        codeLabInspector:
          codeLabInspector || buildStaticInspector("Code Lab", "Code snippets are local educational examples.", "code-lab", shellStartedAt),
        apiStudioInspector: buildStaticInspector("API Studio", "Payload building and mastery progress stay local; safe requests use guarded server routes.", "api-studio", shellStartedAt),
        appliedVoiceInspector: buildStaticInspector("Applied Voice Systems", "Client reasoning, simulations, evaluation, and exports stay local and clearly label provenance.", "applied-voice-systems", shellStartedAt),
        questlineInspector: buildStaticInspector("Applied Engineering Questline", "Polyglot lessons, incidents, audio analysis, and progress stay local. Learner-authored code is never executed.", "applied-engineering-questline", shellStartedAt),
        overviewInspector: buildOverviewInspector({
          initialKeyDetected,
          health,
          activeModule,
          guidedHints,
          focusMode,
          shellStartedAt,
        }),
      }),
    [
      activeModule,
      codeLabInspector,
      connectionInspector,
      fileInspector,
      focusMode,
      health,
      initialKeyDetected,
      language,
      guidedHints,
      liveInspector,
      sampleFileMap,
      shellStartedAt,
      ttsInspector,
      trustedVoiceInspector,
    ],
  );

  const activeNotes = useMemo(() => moduleNotes(activeModule, guidedHints), [activeModule, guidedHints]);
  const homeActive = activeModule === "overview";
  const ownsWorkspaceInspector = activeModule === "api-studio"
    || activeModule === "lab-evolution"
    || activeModule === "flux-tts"
    || activeModule === "redaction-lab"
    || activeModule === "audio-signal-lab"
    || activeModule === "applied-voice-systems"
    || activeModule === "applied-engineering-questline"
    || activeModule === "live-observatory"
    || (activeModule === "code-lab" && Boolean(codeLabLaunchContext));
  const gridTemplateColumns = homeActive
    ? "minmax(0,1fr)"
    : ownsWorkspaceInspector
    ? focusMode
      ? "64px minmax(0,1fr)"
      : "240px minmax(0,1fr)"
    : focusMode
      ? rightCollapsed
        ? "64px minmax(0,1fr)"
        : "64px minmax(0,1fr) minmax(360px,420px)"
      : rightCollapsed
        ? "240px minmax(0,1fr)"
        : "240px minmax(0,1fr) minmax(380px,430px)";

  async function testConnection() {
    setConnectionState({ status: "loading", message: "Checking server-side Deepgram configuration..." });

    try {
      const envelope = await readEnvelope<DeepgramHealthResponse>("/api/deepgram/health");
      const data = requireEnvelopeData(envelope);
      setConnectionInspector(envelope.inspector);
      setHealth(data);
      setConnectionState({ status: data.ok ? "success" : "error", message: data.message });
      setResult({
        title: "Connection Check",
        transcript: data.ok ? "Deepgram connection check completed." : "",
        raw: envelope,
        notes: data.message,
        updatedAt: timestamp(),
      });
    } catch (error) {
      const message = getErrorMessage(error);
      setConnectionInspector(getInspectorFromError(error));
      setConnectionState({ status: "error", message });
      setResult({ title: "Connection Check Failed", transcript: "", raw: getEnvelopeFromError(error) || { message }, notes: message, updatedAt: timestamp() });
    }
  }

  async function transcribeFile() {
    if (!file) {
      setFileState({ status: "error", message: "Choose an audio file first." });
      return;
    }

    setFileState({ status: "loading", message: `Uploading ${file.name} through the server route...` });
    setFileOutcome(null);

    try {
      const autoDetect = fileLanguageMode === "auto-detect";
      const formData = new FormData();
      formData.append("file", file);
      formData.append("model", model);
      formData.append("detect_language", String(autoDetect));
      if (!autoDetect) formData.append("language", language);
      formData.append("smart_format", String(smartFormat));
      formData.append("diarize", String(diarize));
      for (const value of serializeRedactionValues(fileRedactionPolicy)) formData.append("redact", value);

      const response = await fetch("/api/deepgram/transcribe-file", { method: "POST", body: formData });
      const envelope = await unwrapEnvelope<TranscriptionResponse>(response);
      const data = requireEnvelopeData(envelope);
      const transcript = data.transcript.trim();
      const detectedLanguage = extractDetectedLanguage(data.raw);
      const requestId = extractDeepgramRequestId(data.raw);
      const requestedSpokenLanguage = autoDetect ? "Auto-detect (no fixed language)" : languageLabel(language);
      setFileInspector(envelope.inspector);
      setFileTranscriptRaw(data.raw);
      setFileOutcome({
        kind: transcript ? "completed-with-transcript" : "completed-empty",
        fileName: data.request.filename || file.name,
        requestedSpokenLanguage,
        detectedLanguage,
        model: data.request.model,
        requestId,
      });
      setFileState(transcript
        ? { status: "success", message: "Request completed with transcript." }
        : { status: "idle", message: "Request completed with an empty transcript. No speech was recognized for the selected spoken-language setting." });
      setResult({
        title: transcript ? "Request completed with transcript" : "Request completed with empty transcript",
        transcript: transcript || "No speech was recognized for the selected spoken-language setting.",
        raw: data.raw,
        notes: `${data.request.filename || "Uploaded file"} used ${requestedSpokenLanguage}; detected language ${detectedLanguage ?? "unavailable"}; request ID ${requestId ?? "unavailable"}. The browser never received the API key.`,
        updatedAt: timestamp(),
      });
    } catch (error) {
      const message = getErrorMessage(error);
      const unsupportedConfiguration = /unsupported|model.{0,40}language|language.{0,40}model/i.test(message);
      setFileInspector(getInspectorFromError(error));
      setFileState({ status: "error", message });
      setFileOutcome({
        kind: unsupportedConfiguration ? "unsupported-configuration" : "request-failed",
        fileName: file.name,
        requestedSpokenLanguage: fileLanguageMode === "auto-detect" ? "Auto-detect (no fixed language)" : languageLabel(language),
        model,
      });
      setResult({ title: unsupportedConfiguration ? "Unsupported model/language configuration" : "File Transcription Failed", transcript: "", raw: getEnvelopeFromError(error) || { message }, notes: message, updatedAt: timestamp() });
    }
  }

  function changeFile(nextFile: File | null) {
    setFile(nextFile);
    setFileOutcome(null);
    setFileTranscriptRaw(null);
    setFileState({ status: "idle", message: nextFile ? `${nextFile.name} selected. Confirm its spoken language before transcribing.` : "" });
  }

  async function generateAudio() {
    setTtsState({ status: "loading", message: "Requesting speech audio from Deepgram..." });

    try {
      const envelope = await postEnvelope<TtsResponseData>("/api/deepgram/tts", { text: ttsText, model: ttsModel });
      const data = requireEnvelopeData(envelope);
      setTtsInspector(envelope.inspector);
      setAudioUrl(data.audioUrl);
      setTtsState({ status: "success", message: "Audio generated and ready to play." });
      setResult({
        title: "Text to Speech",
        transcript: ttsText,
        raw: data,
        notes: "The route returned playable audio metadata and a local audio URL. The API key stayed on the server.",
        updatedAt: timestamp(),
      });
    } catch (error) {
      const message = getErrorMessage(error);
      setTtsInspector(getInspectorFromError(error));
      setTtsState({ status: "error", message });
      setResult({ title: "Text to Speech Failed", transcript: "", raw: getEnvelopeFromError(error) || { message }, notes: message, updatedAt: timestamp() });
    }
  }

  const handleLiveInspectorChange = useCallback((record: InspectorRecord) => {
    setLiveInspector(record);
  }, []);

  const handleCodeLabInspectorChange = useCallback((record: InspectorRecord) => {
    setCodeLabInspector(record);
  }, []);

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLabel("Copied.");
    } catch {
      setCopiedLabel("Copy unavailable.");
    }

    window.setTimeout(() => setCopiedLabel(""), 1400);
  }

  function loadSample(sample: SampleScenario) {
    const options = sample.recommendedDeepgramOptions;
    setLanguage(sample.language);
    setModel(options.model);
    setSmartFormat(Boolean(options.smart_format));
    setDiarize(Boolean(options.diarize));
    setActiveModule("transcribe-url");
    setUrlState({ status: "idle", message: URL_TRANSCRIPTION_UNAVAILABLE });
    setResult({
      title: "URL transcription unavailable",
      transcript: "",
      raw: { sample, transcribeUrl: getSampleAudioUrl(sample.slug) },
      notes: `${sample.title} was inspected locally, but URL transcription remains disabled and no request was sent.`,
      updatedAt: timestamp(),
    });
  }

  function clearActiveModule() {
    setResult(DEFAULT_RESULT);

    if (activeModule === "connection") {
      setConnectionInspector(null);
      setConnectionState({ status: "idle", message: "" });
    }

    if (activeModule === "transcribe-url") {
      setUrlState({ status: "idle", message: URL_TRANSCRIPTION_UNAVAILABLE });
    }

    if (activeModule === "upload-audio") {
      setFile(null);
      setFileInspector(null);
      setFileTranscriptRaw(null);
      setFileOutcome(null);
      setFileState({ status: "idle", message: "" });
    }

    if (activeModule === "tts") {
      setTtsInspector(null);
      setTtsState({ status: "idle", message: "" });
      setAudioUrl(null);
    }

    if (activeModule === "trusted-voice") {
      setTrustedVoiceInspector(null);
      setTrustedVoiceState({ status: "idle", message: "" });
      setTrustedVoiceResetKey((current) => current + 1);
    }
  }

  function openCodeLab(workflowId: CodeLabWorkflowId, initialLanguage?: CodeLabLanguage) {
    setCodeLabWorkflow(workflowId);
    if (initialLanguage) setCodeLabInitialLanguage(initialLanguage);
    setActiveModule("code-lab");
    setRightTab("code");
  }

  function launchCodeLabFromContext(context: CodeLabLaunchContext, mode: CodeLabLaunchMode) {
    const prepared = publishCodeLabLaunch(toCodeLabLaunchContextInput(context), mode);
    if (!prepared.ok) return;
    clearLegacyLabQueryState();
    setCodeLabWorkflow(prepared.context.workflow.id);
    setCodeLabInitialLanguage(prepared.context.language);
    if (prepared.context.relatedQuestNodeId) setQuestlineSelectedNodeId(prepared.context.relatedQuestNodeId);
    setActiveModule("code-lab");
    setRightTab("code");
  }

  function openApiStudio(operationId: string) {
    setApiStudioOperationId(operationId);
    setApiStudioInitialConfiguration(undefined);
    setActiveModule("api-studio");
  }

  function applyLanguageConfiguration(destination: LanguageHandoffDestination, code: DeepgramNova3LanguageCode) {
    const option = getDeepgramNova3LanguageOption(code);
    if (!option || !option.compatibleModels.includes("nova-3")) return false;

    const confirmation = `${option.name} configuration applied. No request was run.`;
    setLanguage(code);
    setModel("nova-3");

    if (destination === "transcribe-url") {
      if (!option.compatibleTransports.includes("prerecorded")) return false;
      setUrlState({ status: "idle", message: URL_TRANSCRIPTION_UNAVAILABLE });
      setActiveModule("transcribe-url");
      return true;
    }

    if (destination === "upload-audio") {
      if (!option.compatibleTransports.includes("prerecorded")) return false;
      setFileLanguageMode("known");
      setFileState({ status: "idle", message: confirmation });
      setActiveModule("upload-audio");
      return true;
    }

    if (destination === "live-mic") {
      if (!option.compatibleTransports.includes("streaming")) return false;
      setLiveMicInitialMessage(confirmation.replace("No request", "No microphone permission or request"));
      setActiveModule("live-mic");
      return true;
    }

    if (!option.compatibleTransports.includes("prerecorded")) return false;
    const initialConfiguration: ApiStudioInitialConfiguration = {
      operationId: "stt-prerecorded",
      model: "nova-3",
      language: code,
      explanation: confirmation,
    };
    setApiStudioOperationId(initialConfiguration.operationId);
    setApiStudioInitialConfiguration(initialConfiguration);
    setActiveModule("api-studio");
    return true;
  }

  function applyLanguageSampleToTts(code: DeepgramNova3LanguageCode, text: string) {
    const baseCode = languageBaseCode(code);
    if (!["en", "it", "es", "fr", "de", "ja", "nl"].includes(baseCode)) return false;
    const option = getDeepgramNova3LanguageOption(code);
    setTtsText(text);
    setTtsModel(getDefaultVoiceForLanguage(baseCode as TtsVoiceLanguageCode));
    setTtsState({ status: "idle", message: `${option?.name ?? code} sample text applied. No speech request was sent.` });
    setActiveModule("tts");
    return true;
  }

  function applyRedactionPolicy(destination: RedactionHandoffDestination, policy: RedactionPolicy, label: string) {
    const values = serializeRedactionValues(policy);
    const confirmation = `${label} redaction policy applied. No request was run.`;
    if (destination === "transcribe-url") {
      setUrlState({ status: "idle", message: URL_TRANSCRIPTION_UNAVAILABLE });
      setActiveModule("transcribe-url");
      return;
    }
    if (destination === "upload-audio") {
      setFileRedactionPolicy(policy);
      setFileState({ status: "idle", message: confirmation });
      setActiveModule("upload-audio");
      return;
    }
    if (destination === "live-mic") {
      const compatibility = evaluateRedactionCompatibility({ deployment: "hosted", mode: "streaming", language, projectSurface: "listen" });
      if (!compatibility.supported) {
        setLiveMicInitialMessage(`Policy not applied: ${compatibility.reason}`);
        setActiveModule("live-mic");
        return;
      }
      setLiveRedactionPolicy(policy);
      setLiveMicInitialMessage(`${confirmation.replace("No request", "No microphone permission or request")} Interim events must still be treated as sensitive.`);
      setActiveModule("live-mic");
      return;
    }
    const initialConfiguration: ApiStudioInitialConfiguration = {
      operationId: "stt-prerecorded",
      model: "nova-3",
      language,
      redact: values,
      explanation: `${confirmation} Repeated redact values were preserved.`,
    };
    setApiStudioOperationId(initialConfiguration.operationId);
    setApiStudioInitialConfiguration(initialConfiguration);
    setActiveModule("api-studio");
  }

  function openRedactionLab(presetId: "healthcare-contact-center" | "financial-contact-center" = "healthcare-contact-center") {
    const preset = REDACTION_PRESETS.find((candidate) => candidate.id === presetId);
    if (preset) setRedactionLabPolicy({ profiles: [...preset.policy.profiles], entities: [...preset.policy.entities] });
    setActiveModule("redaction-lab");
  }

  function openCodeLabFromApiStudio(workflowId: CodeLabWorkflowId) {
    const preservesQuestContext = codeLabLaunchContext?.relatedApiStudioOperationId === apiStudioOperationId;
    if (!preservesQuestContext) clearCodeLabLaunch();
    openCodeLab(workflowId, preservesQuestContext ? codeLabLaunchContext?.language : "TypeScript");
  }

  function returnToQuestline() {
    setActiveModule("applied-engineering-questline");
  }

  const activeStatus = statusForModule(activeModule, connectionState, urlState, fileState, ttsState, trustedVoiceState);
  const resettableModule = ["connection", "upload-audio", "tts", "trusted-voice"].includes(activeModule);
  const resetAction: ShortcutRuntimeAction | undefined = resettableModule ? {
    execute: clearActiveModule,
    enabled: activeStatus !== "loading",
    disabledReason: "Wait for the active request to finish or stop it first.",
    label: "Reset current module",
  } : undefined;
  const keyboard = useKeyboardShortcutController({
    go_home: { execute: () => setActiveModule("overview") },
    go_deepgram: { execute: () => router.push("/providers/deepgram") },
    go_simulations: { execute: () => router.push("/simulation-lab") },
    go_build: { execute: () => router.push("/build") },
    go_learn: { execute: () => router.push("/learn") },
    go_api_studio: { execute: () => setActiveModule("api-studio") },
    go_voice_agent: { execute: () => openApiStudio("voice-agent-converse") },
    go_observatory: { execute: () => setActiveModule("live-observatory") },
    go_flux_observatory: { execute: () => router.push("/flux-observatory") },
    go_audio_signal_lab: { execute: () => setActiveModule("audio-signal-lab") },
    go_language_explorer: { execute: () => setActiveModule("language-explorer") },
    go_questline: { execute: () => setActiveModule("applied-engineering-questline") },
    go_code_lab: { execute: () => setActiveModule("code-lab") },
    start_guided_tour: { execute: () => setActiveModule("overview") },
    reset_current: resetAction,
  });
  const openKeyboardPalette = keyboard.openPalette;

  useEffect(() => {
    if (initialCommand) openKeyboardPalette();
  }, [initialCommand, openKeyboardPalette]);

  return (
    <main className="one-control-room h-screen overflow-hidden bg-[#020409] text-slate-100">
      <div className="voice-grid flex h-full flex-col bg-[radial-gradient(circle_at_20%_0%,rgba(153,102,204,0.12),transparent_30%),radial-gradient(circle_at_82%_10%,rgba(0,153,102,0.07),transparent_27%),linear-gradient(180deg,#071016_0%,#020409_62%)]">
        <TopBar
          heroStatus={heroStatus}
          currentArea={areaForModule(activeModule)}
          guidedHints={guidedHints}
          focusMode={focusMode}
          rightCollapsed={rightCollapsed}
          hideInspectorToggle={ownsWorkspaceInspector || homeActive}
          onToggleGuidedHints={() => setGuidedHints((value) => !value)}
          onToggleFocus={() => setFocusMode((value) => !value)}
          onToggleRight={() => setRightCollapsed((value) => !value)}
          onOpenCommand={() => keyboard.openPalette()}
          onOpenShortcuts={() => keyboard.openHelp()}
        />

        {keyboard.goSequenceIndicator ? <div role="status" aria-live="polite" className="fixed left-1/2 top-16 z-[70] -translate-x-1/2 rounded-full border border-cyan-200/25 bg-[#071016]/95 px-3 py-1.5 text-[10px] font-semibold text-cyan-100 shadow-xl">{keyboard.goSequenceIndicator}</div> : null}

        <div className="one-control-room-layout grid min-h-0 flex-1 gap-0 px-3 pb-3" data-home-active={homeActive ? "true" : "false"} style={{ gridTemplateColumns }}>
          {!homeActive ? <LeftRail
            activeModule={activeModule}
            collapsed={focusMode}
            onSelect={(moduleId) => {
              setActiveModule(moduleId);
            }}
          /> : null}

          <section className="one-control-room-workspace min-h-0 min-w-0 overflow-hidden border-x border-white/10 bg-white/[0.025]">
            <div className="flex h-full min-h-0 flex-col">
              {!homeActive ? <ModuleHeader
                icon={moduleIcon(activeModule)}
                moduleId={activeModule}
                title={activeModuleMeta.label}
                subtitle={activeModuleMeta.subtitle}
                status={statusForModule(activeModule, connectionState, urlState, fileState, ttsState, trustedVoiceState)}
                focusMode={focusMode}
                onFocus={() => setFocusMode(true)}
                onExitFocus={() => setFocusMode(false)}
              /> : null}

              <div className={`h-0 min-h-0 flex-1 ${ownsWorkspaceInspector || homeActive ? "overflow-hidden p-0" : "overflow-auto p-4"}`}>
                {activeModule === "overview" ? (
                  <OverviewModule initialKeyDetected={initialKeyDetected} openLabMode={openLabMode} openLabDeepgramEnabled={openLabDeepgramEnabled} onSelect={setActiveModule} onOpenAgent={() => openApiStudio("voice-agent-converse")} />
                ) : null}
                {activeModule === "lab-evolution" ? (
                  <LabEvolution />
                ) : null}
                {activeModule === "connection" ? (
                  <ConnectionModule state={connectionState} health={health} onTest={testConnection} result={result} />
                ) : null}
                {activeModule === "transcribe-url" ? (
                  <TranscribeUrlModule />
                ) : null}
                {activeModule === "upload-audio" ? (
                  <UploadModule
                    file={file}
                    hostedReviewMode={hostedReviewMode || openLabMode}
                    languageMode={fileLanguageMode}
                    language={language}
                    smartFormat={smartFormat}
                    diarize={diarize}
                    state={fileState}
                    outcome={fileOutcome}
                    result={result}
                    raw={fileTranscriptRaw}
                    redactionPolicy={fileRedactionPolicy}
                    onRedactionPolicyChange={setFileRedactionPolicy}
                    onFileChange={changeFile}
                    onFileStatusChange={(status, message) => setFileState({ status, message })}
                    onOpenModule={setActiveModule}
                    onUseInAudioSignalLab={() => {
                      if (!file) return;
                      setAudioSignalHandoffFile(file);
                      setActiveModule("audio-signal-lab");
                    }}
                    onLanguageModeChange={(mode) => {
                      setFileLanguageMode(mode);
                      setFileOutcome(null);
                      setFileState({ status: "idle", message: mode === "auto-detect" ? "Auto-detect selected. No transcription request has been sent." : "Known language selected. Confirm the language before transcribing." });
                    }}
                    onLanguageChange={setLanguage}
                    onSmartFormatChange={setSmartFormat}
                    onDiarizeChange={setDiarize}
                    onRun={transcribeFile}
                  />
                ) : null}
                {activeModule === "live-mic" ? (
                  <BrowserMicCard
                    language={language}
                    singleAttempt={openLabMode}
                    initialMessage={liveMicInitialMessage}
                    guidedHints={guidedHints}
                    onResult={setResult}
                    onLanguageChange={setLanguage}
                    onOpenModule={setActiveModule}
                    onInspectorChange={handleLiveInspectorChange}
                    showInlineInspector={false}
                    redactionPolicy={liveRedactionPolicy}
                    onRedactionPolicyChange={setLiveRedactionPolicy}
                  />
                ) : null}
                {activeModule === "tts" ? (
                  <TtsModule
                    text={ttsText}
                    model={ttsModel}
                    audioUrl={audioUrl}
                    state={ttsState}
                    onTextChange={setTtsText}
                    onModelChange={setTtsModel}
                    onRun={generateAudio}
                  />
                ) : null}
                {activeModule === "flux-tts" ? (
                  <FluxTtsStudio liveExecutionEnabled={openLabDeepgramEnabled} />
                ) : null}
                {activeModule === "trusted-voice" ? (
                  <FamiliarCareExperience
                    key={trustedVoiceResetKey}
                    hostedReviewMode={hostedReviewMode}
                    onInspectorChange={setTrustedVoiceInspector}
                    onResult={setResult}
                    onStateChange={setTrustedVoiceState}
                    onOpenRedactionLab={openRedactionLab}
                  />
                ) : null}
                {activeModule === "sample-library" ? (
                  <SampleLibraryModule samples={SAMPLE_AUDIO_SCENARIOS} fileMap={sampleFileMap} onUse={loadSample} onCopy={copyText} />
                ) : null}
                {activeModule === "language-explorer" ? (
                  <Nova3LanguageWorkbench
                    language={language}
                    hostedReviewMode={hostedReviewMode}
                    onLanguageChange={setLanguage}
                    onApply={applyLanguageConfiguration}
                    onUseSampleInTts={applyLanguageSampleToTts}
                  />
                ) : null}
                {activeModule === "redaction-lab" ? (
                  <RedactionLab
                    policy={redactionLabPolicy}
                    hostedReviewMode={hostedReviewMode}
                    onPolicyChange={setRedactionLabPolicy}
                    onApply={applyRedactionPolicy}
                  />
                ) : null}
                {activeModule === "audio-signal-lab" ? (
                  <AudioSignalLab
                    openLabMode={openLabMode}
                    handoffFile={audioSignalHandoffFile}
                    onHandoffConsumed={() => setAudioSignalHandoffFile(null)}
                    onOpenModule={setActiveModule}
                    onOpenCodeLab={() => openCodeLab("audio-signal", "TypeScript")}
                    onOpenQuestline={() => {
                      setQuestlineInitialSection("audio");
                      setActiveModule("applied-engineering-questline");
                    }}
                  />
                ) : null}
                {activeModule === "api-studio" ? (
                  <ApiStudio
                    key={`${apiStudioOperationId}:${apiStudioHandoffRevision}`}
                    initialOperationId={apiStudioOperationId}
                    initialConfiguration={apiStudioInitialConfiguration}
                    openLabMode={openLabMode}
                    onOpenModule={setActiveModule}
                    onOpenCodeLab={openCodeLabFromApiStudio}
                    onReturnToQuestline={codeLabLaunchContext?.source === "questline" ? returnToQuestline : undefined}
                    onOperationChange={setApiStudioOperationId}
                  />
                ) : null}
                {activeModule === "applied-voice-systems" ? (
                  <AppliedVoiceSystems
                    liveInspector={liveInspector}
                    onOpenModule={setActiveModule}
                    onOpenCodeLab={openCodeLab}
                    openLabMode={openLabMode}
                  />
                ) : null}
                {activeModule === "applied-engineering-questline" ? (
                  <AppliedEngineeringQuestline
                    onLaunchCodeLab={launchCodeLabFromContext}
                    onOpenApi={openApiStudio}
                    initialSection={questlineInitialSection}
                    initialQuestNodeId={questlineSelectedNodeId ?? codeLabLaunchContext?.relatedQuestNodeId}
                    onQuestSelectionChange={setQuestlineSelectedNodeId}
                  />
                ) : null}
                {activeModule === "live-observatory" ? (
                  <LiveObservatoryLab
                    openLabMode={openLabMode}
                    initialKeyDetected={initialKeyDetected}
                    onOpenModule={setActiveModule}
                    onOpenApiStudio={openApiStudio}
                    onOpenCodeLab={openCodeLab}
                    redactionPolicy={liveRedactionPolicy}
                    onRedactionPolicyChange={setLiveRedactionPolicy}
                  />
                ) : null}
                {activeModule === "code-lab" ? (
                  <CodeLabModule
                    workflowId={codeLabWorkflow}
                    initialLanguage={codeLabInitialLanguage}
                    onWorkflowChange={setCodeLabWorkflow}
                    onOpenModule={setActiveModule}
                    onCopy={copyText}
                    copiedLabel={copiedLabel}
                    onInspectorChange={handleCodeLabInspectorChange}
                    launchContext={codeLabLaunchContext}
                    launchMode={codeLabLaunchMode}
                    onClearLaunch={clearCodeLabLaunch}
                    onReturnToQuestline={returnToQuestline}
                    onOpenApiStudio={openApiStudio}
                  />
                ) : null}
              </div>
            </div>
          </section>

          {!homeActive && !rightCollapsed && !ownsWorkspaceInspector ? (
            <RightInspector
              activeModule={activeModule}
              codeLabWorkflow={codeLabWorkflow}
              activeTitle={activeModuleMeta.label}
              activeInspector={activeInspector}
              activeTab={rightTab}
              notes={activeNotes}
              copiedLabel={copiedLabel}
              onTabChange={setRightTab}
              onCopy={copyText}
              onCollapse={() => setRightCollapsed(true)}
            />
          ) : null}
        </div>

        {keyboard.shortcutLayer}
      </div>
    </main>
  );
}

function TopBar({
  heroStatus,
  currentArea,
  guidedHints,
  focusMode,
  rightCollapsed,
  hideInspectorToggle,
  onToggleGuidedHints,
  onToggleFocus,
  onToggleRight,
  onOpenCommand,
  onOpenShortcuts,
}: {
  heroStatus: string;
  currentArea: VoiceOpenLabAreaId;
  guidedHints: boolean;
  focusMode: boolean;
  rightCollapsed: boolean;
  hideInspectorToggle: boolean;
  onToggleGuidedHints: () => void;
  onToggleFocus: () => void;
  onToggleRight: () => void;
  onOpenCommand: () => void;
  onOpenShortcuts: () => void;
}) {
  return (
    <header className="one-control-room-topbar voice-open-topbar">
      <Link className="one-control-room-brand voice-open-topbar__brand" href="/">
        <span className="voice-open-topbar__mark" aria-hidden="true"><OneMark className="size-7 rounded-md" /></span>
        <span className="min-w-0"><strong>ONE Voice Lab</strong><small>Omni Neural Engine Â· independent</small></span>
      </Link>

      <nav className="voice-open-topbar__nav" aria-label="Primary">
        {VOICE_OPEN_LAB_NAVIGATION.map((item) => (
          <Link key={item.id} href={item.href} aria-current={item.id === currentArea ? "page" : undefined}>{item.label}</Link>
        ))}
      </nav>

      <div className="one-control-room-actions voice-open-topbar__actions">
        <Link href="/providers/deepgram" className="voice-open-featured-link">Deepgram <span>Featured</span></Link>
        <OneHeaderControls />
        <details className="voice-open-controls">
          <summary>Lab controls</summary>
          <div className="voice-open-controls__menu">
            <div className="voice-open-controls__status"><StatusPill tone={heroStatus.includes("enabled") || heroStatus.includes("Detected") ? "success" : heroStatus.includes("Educational") ? "violet" : "error"}>{heroStatus}</StatusPill><StatusPill tone="violet">Server-side key protected</StatusPill></div>
            <TopButton onClick={onToggleGuidedHints} title="Guided Hints reveals explanatory callouts, opens inspectors, and adds walkthrough notes.">Guided Hints {guidedHints ? "On" : "Off"}</TopButton>
            <TopButton onClick={onToggleFocus}>{focusMode ? "Exit Focus" : "Focus Mode"}</TopButton>
            {!hideInspectorToggle ? <TopButton onClick={onToggleRight}>{rightCollapsed ? "Show Inspector" : "Hide Inspector"}</TopButton> : null}
            <Link href="/" className="voice-open-controls__link">keyboard shortcuts</Link>
            <TopButton onClick={onOpenShortcuts} controlDeckCommand="ui.help">Keyboard help</TopButton>
          </div>
        </details>
        <TopButton onClick={onOpenCommand} controlDeckCommand="ui.search">Commands <ShortcutHint command="open_command_palette" /></TopButton>
      </div>
    </header>
  );
}

function LeftRail({
  activeModule,
  collapsed,
  onSelect,
}: {
  activeModule: LabModuleId;
  collapsed: boolean;
  onSelect: (moduleId: LabModuleId) => void;
}) {
  const group = CONTEXTUAL_MODULE_GROUPS.find((candidate) => (candidate.ids as readonly LabModuleId[]).includes(activeModule)) ?? CONTEXTUAL_MODULE_GROUPS[0];
  const contextualModules = group.ids.map((id) => MODULES.find((module) => module.id === id)).filter((module): module is (typeof MODULES)[number] => Boolean(module));
  const railRef = useRef<HTMLElement>(null);
  const activeItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const rail = railRef.current;
    const activeItem = activeItemRef.current;
    if (!rail || !activeItem || rail.scrollWidth <= rail.clientWidth) return;

    const railBounds = rail.getBoundingClientRect();
    const itemBounds = activeItem.getBoundingClientRect();
    const inset = 8;
    if (itemBounds.left >= railBounds.left + inset && itemBounds.right <= railBounds.right - inset) return;

    const centeredDelta = itemBounds.left - railBounds.left - (rail.clientWidth - itemBounds.width) / 2;
    rail.scrollTo({ left: Math.max(0, rail.scrollLeft + centeredDelta), behavior: "auto" });
  }, [activeModule, collapsed]);

  return (
    <nav ref={railRef} className="one-control-room-nav min-h-0 overflow-auto border-l border-white/10 bg-[#050a10]/84 p-2 backdrop-blur-xl" aria-label="Lab modules">
      <div className="one-control-room-nav-inner space-y-1">
        {!collapsed ? <p className="px-2 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">{group.label} tools</p> : null}
        {contextualModules.map((module) => {
          const active = module.id === activeModule;
          return (
            <button
              key={module.id}
              ref={active ? activeItemRef : undefined}
              type="button"
              aria-current={active ? "page" : undefined}
              data-module-id={module.id}
              onClick={() => onSelect(module.id)}

              data-guided-tour-target={module.id === "trusted-voice" ? "familiar-care" : module.id === "language-explorer" ? "language-workbench" : module.id === "redaction-lab" ? "redaction-lab" : undefined}
              className={`group flex h-11 w-full items-center gap-3 rounded-lg border px-2 text-left transition ${
                active
                  ? "border-[var(--one-purple-border)] bg-[var(--one-purple-surface)] text-white shadow-[0_0_30px_rgba(153,102,204,0.12)]"
                  : "border-transparent text-slate-400 hover:border-white/10 hover:bg-white/[0.05] hover:text-white"
              }`}
              title={module.label}
            >
              <span className={`flex size-7 shrink-0 items-center justify-center rounded-md ${active ? "bg-[var(--one-purple)] text-white" : "bg-white/[0.06] text-slate-300"}`}>
                {moduleIcon(module.id, "size-4")}
              </span>
              {!collapsed ? (
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{module.label}</span>
                  </span>
                  <span className="block truncate text-[11px] text-slate-500">{module.subtitle}{module.category ? ` Â· ${module.category}` : ""}</span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function ModuleHeader({
  icon,
  moduleId,
  title,
  subtitle,
  status,
  focusMode,
  onFocus,
  onExitFocus,
}: {
  icon: ReactNode;
  moduleId: LabModuleId;
  title: string;
  subtitle: string;
  status: AsyncStatus;
  focusMode: boolean;
  onFocus: () => void;
  onExitFocus: () => void;
}) {
  return (
    <div className="one-control-room-module-header flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#071118]/72 px-4 py-3 backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-violet-300/20 bg-violet-300/10 text-violet-100">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="truncate text-lg font-semibold text-white">{title}</h1>
            <aside className="flex flex-wrap items-center gap-x-1 text-[10px] leading-4 text-slate-400" aria-label="Provider workspace">
              <span>Current interactive workspace: <strong className="text-violet-200">Deepgram</strong>.</span>
              <span data-workspace-evidence-scope={evidenceScopeForOneVisibleWorkspaceModule(moduleId)}>
                Evidence scope: {evidenceScopeForOneVisibleWorkspaceModule(moduleId) === "provider-neutral"
                  ? "provider-neutral module"
                  : "Deepgram-specific module"}.
              </span>
              <span>Other providers can be inspected in <Link className="font-semibold text-cyan-100 underline-offset-2 hover:underline" href="/providers">Provider Hub</Link>.</span>
              <Link className="font-semibold text-cyan-100 underline-offset-2 hover:underline" href="/">Explore</Link>
            </aside>
          </div>
          <p className="truncate text-sm text-slate-500">{subtitle}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <StatusPill tone={statusTone(status)}>{status === "idle" ? "Idle" : titleCase(status)}</StatusPill>
        {moduleId !== "lab-evolution" ? <ModuleEvolutionAffordance moduleId={moduleId} /> : null}
        <TopButton onClick={focusMode ? onExitFocus : onFocus}>{focusMode ? "Return to Lab" : "Focus this module"}</TopButton>
      </div>
    </div>
  );
}

function RightInspector({
  activeModule,
  codeLabWorkflow,
  activeTitle,
  activeInspector,
  activeTab,
  notes,
  copiedLabel,
  onTabChange,
  onCopy,
  onCollapse,
}: {
  activeModule: LabModuleId;
  codeLabWorkflow: CodeLabWorkflowId;
  activeTitle: string;
  activeInspector: InspectorRecord | null;
  activeTab: RightTab;
  notes: string[];
  copiedLabel: string;
  onTabChange: (tab: RightTab) => void;
  onCopy: (text: string) => void;
  onCollapse: () => void;
}) {
  const workflow = getCodeLabWorkflow(activeModule === "code-lab" ? codeLabWorkflow : workflowForModule(activeModule));
  const codeFile = workflow.filesByLanguage.TypeScript.find((file) => file.side !== "Config") || workflow.filesByLanguage.TypeScript[0];
  return (
    <aside className="one-control-room-inspector flex min-h-0 min-w-0 flex-col border-r border-white/10 bg-[#050a10]/88 backdrop-blur-xl">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-3 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/70">Inspector</p>
          <h3 className="truncate text-sm font-semibold text-white">{activeTitle}</h3>
        </div>
        <button type="button" onClick={onCollapse} className="rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 text-xs text-slate-300 hover:text-white">
          Collapse
        </button>
      </div>
      <div className="grid shrink-0 grid-cols-4 border-b border-white/10 bg-black/20 p-1" role="tablist" aria-label="Inspector views">
        {(["payload", "timeline", "code", "notes"] as RightTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            data-shortcut-command={tab === "timeline" ? "open_timeline" : undefined}
            data-shortcut-label={tab === "timeline" ? "Open Timeline" : undefined}
            onClick={() => onTabChange(tab)}
            className={`h-9 rounded-md text-xs font-semibold capitalize transition ${
              activeTab === tab ? "bg-cyan-200 text-slate-950" : "text-slate-400 hover:bg-white/[0.06] hover:text-white"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {activeTab === "payload" ? <PayloadInspector record={activeInspector} defaultOpen title={`${activeTitle} Payload`} /> : null}
        {activeTab === "timeline" ? (
          <div className="rounded-lg border border-white/10 bg-black/20 p-4">
            <EventTimeline events={activeInspector?.timeline || []} startedAt={activeInspector?.startedAt} />
          </div>
        ) : null}
        {activeTab === "code" ? (
          <div className="space-y-3">
            <div className="h-96 overflow-hidden rounded-lg border border-white/10">
              <CodeViewer file={codeFile} copiedLabel={copiedLabel} onCopy={onCopy} />
            </div>
            <CodePlacementMap workflow={workflow} file={codeFile} compact />
          </div>
        ) : null}
        {activeTab === "notes" ? <NotesPanel notes={notes} inspector={activeInspector} /> : null}
      </div>
    </aside>
  );
}

function OverviewModule({
  initialKeyDetected,
  openLabMode,
  openLabDeepgramEnabled,
  onSelect,
  onOpenAgent,
}: {
  initialKeyDetected: boolean;
  openLabMode: boolean;
  openLabDeepgramEnabled: boolean;
  onSelect: (moduleId: LabModuleId) => void;
  onOpenAgent: () => void;
}) {
  return (
    <div className="voice-open-home h-full overflow-auto">
      <section className="voice-open-home__hero" aria-labelledby="voice-open-home-title">
        <p className="voice-open-home__eyebrow">Omni Neural Engine</p>
        <h1 id="voice-open-home-title">ONE Voice Lab</h1>
        <p className="voice-open-home__positioning">An open playground for voice, agents, simulation, and human-controlled AI systems.</p>
        <p className="voice-open-home__independence">Independent and community-built. Deepgram is a first-class Featured Provider, not the owner or sponsor of this Lab.</p>
      </section>

      <section className="voice-open-home__experiences" aria-labelledby="voice-open-experiences-title">
        <div className="voice-open-section-heading"><div><p>Try</p><h2 id="voice-open-experiences-title">Start with a voice</h2></div><span>Four explicit actions. Nothing runs on page load.</span></div>
        <div className="voice-open-experience-grid">
          <button type="button" onClick={() => onSelect("live-mic")}><span className="voice-open-experience-grid__icon"><MicIcon className="size-6" /></span><strong>Talk</strong><small>Realtime microphone to speech-to-text</small></button>
          <button type="button" onClick={() => onSelect("upload-audio")}><span className="voice-open-experience-grid__icon"><UploadIcon className="size-6" /></span><strong>Upload</strong><small>Approved audio file to prerecorded STT</small></button>
          <button type="button" onClick={() => onSelect("tts")}><span className="voice-open-experience-grid__icon"><SpeakerIcon className="size-6" /></span><strong>Generate</strong><small>Reviewed text to synthesized speech</small></button>
          <button type="button" onClick={onOpenAgent}><span className="voice-open-experience-grid__icon"><WaveIcon className="size-6" /></span><strong>Speech-to-speech</strong><small>Provider-specific preview Â· Hosted execution unavailable</small></button>
        </div>
        <Link className="voice-open-home__mobile-compare" href="/evaluate">Evaluate voices across providers</Link>
      </section>

      <section className="voice-open-home__feature-grid" aria-label="Featured paths">
        <Link className="voice-open-home__provider" href="/providers/deepgram">
          <span><small>Featured Provider</small><strong>Deepgram</strong><span>Speech, realtime, voice, agent, API, language, audio, and architecture surfaces grounded in repository evidence.</span></span>
          <span aria-hidden="true">Open provider</span>
        </Link>
        <Link className="voice-open-home__simulation" href="/simulation-lab">
          <span><small>Experimental Â· Simulated</small><strong>Simulation Lab</strong><span>Replay controlled interference, latency, interruption, and reconnect conditions without provider spend.</span></span>
          <span aria-hidden="true">Open simulations</span>
        </Link>
      </section>

      <section className="voice-open-home__status" aria-label="Lab execution status">
        <Metric label={openLabMode ? "Shared project" : "Key"} value={openLabMode ? openLabDeepgramEnabled ? "Live enabled" : "Provider disabled" : initialKeyDetected ? "Detected" : "Missing"} tone={openLabMode ? openLabDeepgramEnabled ? "success" : "violet" : initialKeyDetected ? "success" : "error"} />
        <Metric label="Core mode" value="Local-first" tone="cyan" />
        <Metric label="Page-load spend" value="None" tone="success" />
      </section>

      <div className="voice-open-home__evolution"><ModuleEvolutionAffordance moduleId="overview" /></div>

      <details className="voice-open-home__guided">
        <summary>What are you trying to build or understand?</summary>
        <div><AiIntentRouter /></div>
      </details>

      <section className="voice-open-home__secondary" aria-labelledby="voice-open-secondary-title">
        <div className="voice-open-section-heading"><div><p>Go deeper</p><h2 id="voice-open-secondary-title">Technical tools when you need them</h2></div></div>
        <div className="voice-open-home__secondary-links">
          <Link href="/build">Browse Build tools</Link>
          <Link href="/learn">Browse learning surfaces</Link>
          <Link href="/providers">Compare provider implementation states</Link>
          <Link href="/" data-testid="open-lab-keyboard-shortcut-card">Set up keyboard and keyboard shortcuts controls</Link>
        </div>
        <GuidedRecipes onOpenModule={onSelect} />
      </section>
    </div>
  );
}

function ConnectionModule({ state, health, result, onTest }: { state: StatusState; health: DeepgramHealthResponse | null; result: LabResult; onTest: () => void }) {
  return (
    <ModuleGrid>
      <Panel>
        <SectionTitle title="Server auth probe" subtitle="Validates local .env server access without showing the key." />
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Metric label="Configured" value={health?.configured ? "Yes" : "Unknown"} tone={health?.configured ? "success" : "violet"} />
          <Metric label="Remote" value={health?.remote || "not checked"} tone={health?.remote === "verified" ? "success" : "cyan"} />
          <Metric label="Status" value={String(health?.status || "idle")} tone="violet" />
        </div>
        <ModuleFooter state={state} primaryLabel={state.status === "loading" ? "Testing..." : "Test Deepgram Connection"} onPrimary={onTest} />
      </Panel>
      <ResultDock result={result} />
    </ModuleGrid>
  );
}

function TranscribeUrlModule() {
  return (
    <div className="mx-auto max-w-3xl">
      <Panel>
        <SectionTitle title="URL transcription" subtitle="Hosted URL fetching and transcription are not enabled in ONE Voice Lab." />
        <div id="url-transcription-unavailable" role="status" className="mt-4 rounded-lg border border-amber-300/25 bg-amber-300/[0.06] p-4 text-sm leading-6 text-amber-50">
          <p className="font-semibold">{URL_TRANSCRIPTION_UNAVAILABLE}</p>
          <p className="mt-1 text-xs text-amber-100/80">Adding a URL, signing in, or selecting a provider will not enable this feature. Use an existing local-file workflow only where its own availability state permits it.</p>
        </div>
        <div className="mt-4 space-y-4" aria-describedby="url-transcription-unavailable">
          <Field label="Audio URL">
            <input
              aria-label="Hosted audio URL"
              aria-describedby="url-transcription-unavailable"
              disabled
              placeholder="URL input unavailable"
              className={`${inputClassName} cursor-not-allowed opacity-55`}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
            <ControlButton
              onClick={() => undefined}
              disabled
              describedBy="url-transcription-unavailable"
              shortcutCommand="run_primary"
              shortcutLabel="Transcribe URL"
              disabledReason={URL_TRANSCRIPTION_UNAVAILABLE}
            >
              Transcribe URL<ShortcutHint command="run_primary" />
            </ControlButton>
            <span className="text-sm text-amber-100">Hosted execution unavailable</span>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function UploadModule(props: {
  file: File | null;
  hostedReviewMode: boolean;
  languageMode: FileLanguageMode;
  language: DeepgramNova3LanguageCode;
  smartFormat: boolean;
  diarize: boolean;
  state: StatusState;
  outcome: FileTranscriptionOutcome | null;
  result: LabResult;
  raw: unknown;
  redactionPolicy: RedactionPolicy;
  onRedactionPolicyChange: (policy: RedactionPolicy) => void;
  onFileChange: (file: File | null) => void;
  onFileStatusChange: (status: "idle" | "error", message: string) => void;
  onOpenModule: (moduleId: LabModuleId) => void;
  onUseInAudioSignalLab: () => void;
  onLanguageModeChange: (mode: FileLanguageMode) => void;
  onLanguageChange: (value: DeepgramNova3LanguageCode) => void;
  onSmartFormatChange: (value: boolean) => void;
  onDiarizeChange: (value: boolean) => void;
  onRun: () => void;
}) {
  return (
    <ModuleGrid>
      <Panel>
        <SectionTitle title="Local file transcription" subtitle="Upload audio to the server route; binary audio is not shown in payload JSON." />
        <AudioFileDropzone
          file={props.file}
          mode={props.hostedReviewMode ? "hosted" : "local"}
          onFileChange={props.onFileChange}
          onStatusChange={props.onFileStatusChange}
          onUseInAudioSignalLab={props.onUseInAudioSignalLab}
        />
        <fieldset aria-label="File recognition mode" className="mt-4 grid gap-2 rounded-lg border border-white/10 bg-black/20 p-3 sm:grid-cols-2">
          <legend className="px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Spoken-language setting</legend>
          {([
            ["known", "Known language", "Use a fixed language code"],
            ["auto-detect", "Auto-detect", "Omit the fixed language"],
          ] as const).map(([value, label, description]) => (
            <label key={value} className={`cursor-pointer rounded-md border p-3 transition ${props.languageMode === value ? "border-cyan-200/35 bg-cyan-200/[0.07]" : "border-white/10 bg-black/20 hover:border-white/20"}`}>
              <span className="flex items-center gap-2 text-xs font-semibold text-white">
                <input type="radio" name="file-language-mode" value={value} checked={props.languageMode === value} onChange={() => props.onLanguageModeChange(value)} className="accent-cyan-200" />
                {label}
              </span>
              <span className="mt-1 block pl-5 text-[10px] text-slate-500">{description}</span>
            </label>
          ))}
        </fieldset>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field label="Spoken language">
            <select aria-label="File spoken language" value={props.language} disabled={props.languageMode === "auto-detect"} onChange={(event) => props.onLanguageChange(event.target.value as DeepgramNova3LanguageCode)} className={`${inputClassName} disabled:cursor-not-allowed disabled:opacity-60`}>
              {DEEPGRAM_NOVA3_LANGUAGE_OPTIONS.map((option) => (
                <option key={option.code} value={option.code} className="bg-slate-950">
                  {option.name} - {option.code}
                </option>
              ))}
            </select>
          </Field>
          <ToggleRow>
            <Toggle label="smart_format" checked={props.smartFormat} onChange={props.onSmartFormatChange} />
            <Toggle label="diarize" checked={props.diarize} onChange={props.onDiarizeChange} />
          </ToggleRow>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-400">Choose the language spoken in the file, or use prerecorded language detection. This transcribes speech; it does not translate the transcript.</p>
        <div className="mt-3"><RedactionControl policy={props.redactionPolicy} onChange={props.onRedactionPolicyChange} mode="prerecorded" language={props.language} onOpenLab={() => props.onOpenModule("redaction-lab")} /></div>
        {props.outcome ? <FileTranscriptionOutcomePanel outcome={props.outcome} /> : null}
        <ModuleFooter state={props.state} primaryLabel={props.state.status === "loading" ? "Transcribing..." : "Transcribe File"} onPrimary={props.onRun} />
      </Panel>
      <div className="space-y-4">
        <ResultDock result={props.result} />
        <TranscriptPathHelper raw={props.raw} />
      </div>
    </ModuleGrid>
  );
}

function FileTranscriptionOutcomePanel({ outcome }: { outcome: FileTranscriptionOutcome }) {
  const failed = outcome.kind === "request-failed" || outcome.kind === "unsupported-configuration";
  const empty = outcome.kind === "completed-empty";
  const tone = failed ? "border-rose-300/20 bg-rose-300/5" : empty ? "border-amber-300/20 bg-amber-300/5" : "border-emerald-300/20 bg-emerald-300/5";
  const title = {
    "completed-with-transcript": "Request completed with transcript",
    "completed-empty": "Request completed with empty transcript",
    "request-failed": "Request failed",
    "unsupported-configuration": "Unsupported model/language configuration",
  }[outcome.kind];

  return (
    <div className={`mt-3 rounded-lg border p-3 ${tone}`} data-testid="transcribe-file-outcome">
      <p className="text-xs font-semibold text-white">{title}</p>
      {empty ? <p className="mt-1 text-[10px] text-amber-100">No speech was recognized for the selected spoken-language setting.</p> : null}
      <dl className="mt-2 grid grid-cols-[120px_1fr] gap-x-2 gap-y-1 text-[10px] leading-4">
        <dt className="text-slate-600">File</dt><dd className="break-all text-slate-300">{outcome.fileName}</dd>
        <dt className="text-slate-600">Requested language</dt><dd className="text-slate-300">{outcome.requestedSpokenLanguage}</dd>
        <dt className="text-slate-600">Detected language</dt><dd className="text-slate-300">{outcome.detectedLanguage ?? "Unavailable"}</dd>
        <dt className="text-slate-600">Model</dt><dd className="font-mono text-slate-300">{outcome.model}</dd>
        <dt className="text-slate-600">Request ID</dt><dd className="break-all font-mono text-slate-300">{outcome.requestId ?? "Unavailable"}</dd>
      </dl>
    </div>
  );
}

function TtsModule(props: {
  text: string;
  model: TtsVoiceModel;
  audioUrl: string | null;
  state: StatusState;
  onTextChange: (value: string) => void;
  onModelChange: (value: TtsVoiceModel) => void;
  onRun: () => void;
}) {
  return (
    <ModuleGrid>
      <Panel>
        <SectionTitle title="Deepgram Speak" subtitle="Generate playable speech through the server route." />
        <div className="mt-4 space-y-4">
          <Field label="Text">
            <textarea value={props.text} onChange={(event) => props.onTextChange(event.target.value)} rows={5} className={`${inputClassName} h-32 resize-none py-3 leading-6`} />
          </Field>
          <Field label="Voice/model">
            <select value={props.model} onChange={(event) => props.onModelChange(event.target.value as TtsVoiceModel)} className={inputClassName}>
              {AURA_VOICE_GROUPS.map((group) => (
                <optgroup key={group.languageCode} label={group.language}>
                  {group.voices.map((voice) => (
                    <option key={voice.value} value={voice.value} className="bg-slate-950">
                      {voice.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          {props.audioUrl ? <audio controls src={props.audioUrl} className="h-10 w-full" aria-label="Generated Deepgram audio playback" /> : null}
        </div>
        <ModuleFooter state={props.state} primaryLabel={props.state.status === "loading" ? "Generating..." : "Generate Audio"} onPrimary={props.onRun} />
      </Panel>
      <Panel>
        <SectionTitle title="Response metadata" subtitle="TTS JSON never includes raw binary audio." />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Metric label="Text length" value={String(props.text.length)} tone="cyan" />
          <Metric label="Voice" value={props.model} tone="violet" />
          <Metric label="Audio" value={props.audioUrl ? "Ready" : "Idle"} tone={props.audioUrl ? "success" : "violet"} />
        </div>
      </Panel>
    </ModuleGrid>
  );
}

function SampleLibraryModule({
  samples,
  fileMap,
  onUse,
  onCopy,
}: {
  samples: readonly SampleScenario[];
  fileMap: Record<string, boolean>;
  onUse: (sample: SampleScenario) => void;
  onCopy: (text: string) => void;
}) {
  return (
    <div className="grid h-full min-h-[520px] gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      <Panel>
        <SectionTitle title="Sample status" subtitle="Generate local MP3s for repeatable demos." />
        <div className="mt-4 grid gap-3">
          <Metric label="Scenarios" value={String(samples.length)} tone="cyan" />
          <Metric label="Generated" value={String(samples.filter((sample) => fileMap[sample.slug]).length)} tone="success" />
          <Hint>Run npm run samples:generate to create public/samples/*.mp3. This consumes Deepgram TTS credits.</Hint>
        </div>
      </Panel>
      <div className="min-h-0 overflow-auto rounded-lg border border-white/10 bg-black/20 p-3">
        <div className="grid gap-3 xl:grid-cols-2">
          {samples.map((sample) => (
            <article key={sample.slug} className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-white">{sample.title}</h3>
                  <p className="mt-1 truncate text-xs text-cyan-100/70">{sample.vertical}</p>
                </div>
                <StatusPill tone={fileMap[sample.slug] ? "success" : "violet"}>{fileMap[sample.slug] ? "MP3" : sample.language}</StatusPill>
              </div>
              <p className="mt-3 max-h-10 overflow-hidden text-xs leading-5 text-slate-400">{sample.demoGoal}</p>
              {fileMap[sample.slug] ? <audio controls src={getSampleAudioPath(sample.slug)} className="mt-3 h-9 w-full" /> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <ControlButton onClick={() => onUse(sample)}>Use in URL</ControlButton>
                <ControlButton variant="secondary" onClick={() => onCopy(sample.transcript)}>
                  Copy Transcript
                </ControlButton>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function CodeLabModule({
  workflowId,
  initialLanguage,
  onWorkflowChange,
  onOpenModule,
  onCopy,
  copiedLabel,
  onInspectorChange,
  launchContext,
  launchMode,
  onClearLaunch,
  onReturnToQuestline,
  onOpenApiStudio,
}: {
  workflowId: CodeLabWorkflowId;
  initialLanguage: CodeLabLanguage;
  onWorkflowChange: (workflowId: CodeLabWorkflowId) => void;
  onOpenModule: (moduleId: LabModuleId) => void;
  onCopy: (text: string) => void;
  copiedLabel: string;
  onInspectorChange: (record: InspectorRecord) => void;
  launchContext: CodeLabLaunchContext | null;
  launchMode: CodeLabLaunchMode | null;
  onClearLaunch: () => void;
  onReturnToQuestline: () => void;
  onOpenApiStudio: (operationId: string) => void;
}) {
  return (
    <CodeLab
      key={launchContext?.id ?? "standard-code-lab"}
      workflowId={workflowId}
      initialLanguage={initialLanguage}
      onWorkflowChange={onWorkflowChange}
      onOpenModule={onOpenModule}
      onCopy={onCopy}
      copiedLabel={copiedLabel}
      onInspectorChange={onInspectorChange}
      launchContext={launchContext}
      launchMode={launchMode}
      onClearLaunch={onClearLaunch}
      onReturnToQuestline={onReturnToQuestline}
      onOpenApiStudio={onOpenApiStudio}
    />
  );
}

function NotesPanel({ notes, inspector }: { notes: string[]; inspector: InspectorRecord | null }) {
  return (
    <div className="space-y-3">
      {notes.map((note) => (
        <div key={note} className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm leading-6 text-slate-300">
          {note}
        </div>
      ))}
      {inspector?.notes.map((note) => (
        <div key={note} className="rounded-lg border border-cyan-200/10 bg-cyan-200/[0.04] p-3 text-sm leading-6 text-cyan-50">
          {note}
        </div>
      ))}
    </div>
  );
}

function ResultDock({ result }: { result: LabResult }) {
  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100/70">Result</p>
          <h3 className="mt-2 truncate text-base font-semibold text-white">{result.title}</h3>
          <p className="mt-1 text-xs text-slate-500">Updated {result.updatedAt}</p>
        </div>
      </div>
      <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-white/10 bg-[#020406] p-4 font-mono text-xs leading-6 text-slate-200">
        {result.transcript || result.notes}
      </pre>
    </Panel>
  );
}

function TranscriptPathHelper({ raw }: { raw: unknown }) {
  if (!raw) {
    return null;
  }

  const paths = buildTranscriptPaths(raw);
  return (
    <Panel>
      <SectionTitle title="Where is the transcript?" subtitle="Common paths in Deepgram prerecorded responses." />
      <div className="mt-3 space-y-2 font-mono text-xs leading-5">
        {paths.map((path) => (
          <div key={path.path} className="break-words text-slate-300">
            <span className={path.present ? "text-emerald-200" : "text-slate-500"}>{path.present ? "present" : "missing"}</span> {path.path}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return <section className="rounded-lg border border-white/10 bg-white/[0.045] p-4 shadow-[0_20px_70px_rgba(0,0,0,0.22)] backdrop-blur-xl">{children}</section>;
}

function ModuleGrid({ children }: { children: ReactNode }) {
  return <div className="grid min-h-[520px] gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">{children}</div>;
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-slate-400">{subtitle}</p>
    </div>
  );
}

function ModuleFooter({ state, primaryLabel, onPrimary, disabled }: { state: StatusState; primaryLabel: string; onPrimary: () => void; disabled?: boolean }) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
      <ControlButton onClick={onPrimary} disabled={disabled || state.status === "loading"} shortcutCommand="run_primary" shortcutLabel={primaryLabel} disabledReason="The primary action is already running or its required input is incomplete.">
        {primaryLabel}<ShortcutHint command="run_primary" />
      </ControlButton>
      {state.message ? <span className={`text-sm ${state.status === "error" ? "text-rose-200" : state.status === "success" ? "text-emerald-200" : "text-slate-400"}`}>{state.message}</span> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-5 text-slate-500">{children}</p>;
}

function ToggleRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 bg-black/24 px-3 text-sm text-slate-200">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-cyan-200" />
      {label}
    </label>
  );
}

function ControlButton({ children, onClick, disabled, variant = "primary", shortcutCommand, shortcutLabel, disabledReason, describedBy }: { children: ReactNode; onClick: () => void; disabled?: boolean; variant?: "primary" | "secondary"; shortcutCommand?: string; shortcutLabel?: string; disabledReason?: string; describedBy?: string }) {
  const styles =
    variant === "primary"
      ? "border-cyan-200/40 bg-cyan-200 text-slate-950 hover:bg-white disabled:bg-cyan-200/35"
      : "border-white/10 bg-white/[0.06] text-slate-200 hover:bg-white/[0.1] hover:text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-describedby={describedBy}
      data-shortcut-command={shortcutCommand}
      data-shortcut-label={shortcutLabel}
      data-shortcut-disabled-reason={disabledReason}
      className={`inline-flex min-h-10 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:text-slate-500 ${styles}`}
    >
      {children}
    </button>
  );
}

function TopButton({ children, onClick, title, controlDeckCommand }: { children: ReactNode; onClick: () => void; title?: string; controlDeckCommand?: string }) {
  return (
    <button type="button" onClick={onClick} title={title} className="inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-md border border-white/10 bg-white/[0.05] px-2.5 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.1] hover:text-white">
      {children}
    </button>
  );
}

function areaForModule(moduleId: LabModuleId): VoiceOpenLabAreaId {
  const group = CONTEXTUAL_MODULE_GROUPS.find((candidate) => (candidate.ids as readonly LabModuleId[]).includes(moduleId));
  if (group?.label === "Build") return "build";
  if (group?.label === "Learn") return "learn";
  return "explore";
}

function controlDeckCommandForModule(moduleId: LabModuleId) {
  if (moduleId === "overview") return "nav.home";
  if (moduleId === "api-studio") return "nav.apiLab";
  if (moduleId === "language-explorer") return "nav.languageWorkbench";
  if (moduleId === "audio-signal-lab") return "nav.audioLab";
  return undefined;
}

function StatusPill({ children, tone = "cyan" }: { children: ReactNode; tone?: "cyan" | "success" | "error" | "violet" }) {
  const tones = {
    cyan: "border-cyan-300/25 bg-cyan-300/10 text-cyan-100",
    success: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
    error: "border-rose-300/25 bg-rose-300/10 text-rose-100",
    violet: "border-violet-300/25 bg-violet-300/10 text-violet-100",
  };
  return <span className={`inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "cyan" | "success" | "error" | "violet" }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/24 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className={`mt-2 truncate text-sm font-semibold ${tone === "success" ? "text-emerald-100" : tone === "error" ? "text-rose-100" : tone === "violet" ? "text-violet-100" : "text-cyan-100"}`}>{value}</p>
    </div>
  );
}

const inputClassName =
  "h-10 w-full rounded-lg border border-white/10 bg-black/25 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-200/50 focus:ring-2 focus:ring-cyan-200/20";

async function readEnvelope<T>(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  return unwrapEnvelope<T>(response);
}

async function postEnvelope<T>(url: string, payload: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return unwrapEnvelope<T>(response);
}

async function unwrapEnvelope<T>(response: Response) {
  const data = (await response.json().catch(() => null)) as ApiDebugEnvelope<T> | DeepgramErrorResponse | null;

  if (!isApiEnvelope<T>(data)) {
    const message = hasMessage(data) ? data.message : `Request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }

  if (!response.ok || !data.ok) {
    throw new ApiEnvelopeError(data.error?.message || `Request failed with HTTP ${response.status}.`, data);
  }

  return data;
}

function requireEnvelopeData<T>(envelope: ApiDebugEnvelope<T>) {
  if (envelope.data === undefined) {
    throw new ApiEnvelopeError("Response did not include a data payload.", envelope);
  }

  return envelope.data;
}

class ApiEnvelopeError extends Error {
  constructor(
    message: string,
    public envelope: ApiDebugEnvelope<unknown>,
  ) {
    super(message);
    this.name = "ApiEnvelopeError";
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error.";
}

function getInspectorFromError(error: unknown) {
  return error instanceof ApiEnvelopeError ? error.envelope.inspector : null;
}

function getEnvelopeFromError(error: unknown) {
  return error instanceof ApiEnvelopeError ? error.envelope : null;
}

function isApiEnvelope<T>(value: unknown): value is ApiDebugEnvelope<T> {
  return Boolean(value && typeof value === "object" && "ok" in value && "inspector" in value && typeof (value as { ok?: unknown }).ok === "boolean");
}

function hasMessage(value: unknown): value is { message: string } {
  return Boolean(value && typeof value === "object" && "message" in value && typeof (value as { message?: unknown }).message === "string");
}

function timestamp() {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date());
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function statusTone(status: AsyncStatus) {
  if (status === "success") {
    return "success";
  }

  if (status === "error") {
    return "error";
  }

  return status === "loading" ? "cyan" : "violet";
}

function statusForModule(moduleId: LabModuleId, connection: StatusState, url: StatusState, file: StatusState, tts: StatusState, trustedVoice: StatusState): AsyncStatus {
  if (moduleId === "connection") return connection.status;
  if (moduleId === "transcribe-url") return url.status;
  if (moduleId === "upload-audio") return file.status;
  if (moduleId === "tts") return tts.status;
  if (moduleId === "trusted-voice") return trustedVoice.status;
  return "idle";
}

function languageLabel(code: DeepgramNova3LanguageCode) {
  const option = DEEPGRAM_NOVA3_LANGUAGE_OPTIONS.find((item) => item.code === code);
  return option ? `${option.name} (${option.code})` : code;
}

function moduleIcon(moduleId: LabModuleId, className = "size-5") {
  const props = { className };

  if (moduleId === "connection") return <CheckIcon {...props} />;
  if (moduleId === "transcribe-url") return <LinkIcon {...props} />;
  if (moduleId === "upload-audio") return <UploadIcon {...props} />;
  if (moduleId === "live-mic") return <MicIcon {...props} />;
  if (moduleId === "tts") return <SpeakerIcon {...props} />;
  if (moduleId === "flux-tts") return <SpeakerIcon {...props} />;
  if (moduleId === "trusted-voice") return <SpeakerIcon {...props} />;
  if (moduleId === "api-studio") return <CopyIcon {...props} />;
  if (moduleId === "applied-voice-systems") return <WaveIcon {...props} />;
  if (moduleId === "applied-engineering-questline") return <WaveIcon {...props} />;
  if (moduleId === "live-observatory") return <WaveIcon {...props} />;
  if (moduleId === "code-lab") return <CopyIcon {...props} />;
  if (moduleId === "language-explorer") return <WaveIcon {...props} />;
  if (moduleId === "audio-signal-lab") return <WaveIcon {...props} />;
  if (moduleId === "sample-library") return <UploadIcon {...props} />;
  return <WaveIcon {...props} />;
}

function buildTranscriptPaths(raw: unknown) {
  const data = raw as {
    results?: {
      channels?: Array<{
        alternatives?: Array<{
          transcript?: string;
          words?: unknown[];
          paragraphs?: unknown;
          summaries?: unknown;
          topics?: unknown;
        }>;
      }>;
    };
  };
  const alternative = data.results?.channels?.[0]?.alternatives?.[0];

  return [
    { path: "results.channels[0].alternatives[0].transcript", present: Boolean(alternative?.transcript) },
    { path: "results.channels[0].alternatives[0].words", present: Boolean(alternative?.words?.length) },
    { path: "results.channels[0].alternatives[0].paragraphs", present: Boolean(alternative?.paragraphs) },
    { path: "results.channels[0].alternatives[0].summaries", present: Boolean(alternative?.summaries) },
    { path: "results.channels[0].alternatives[0].topics", present: Boolean(alternative?.topics) },
  ];
}

function getActiveInspector(records: {
  activeModule: LabModuleId;
  connectionInspector: InspectorRecord | null;
  urlInspector: InspectorRecord | null;
  fileInspector: InspectorRecord | null;
  liveInspector: InspectorRecord | null;
  ttsInspector: InspectorRecord | null;
  trustedVoiceInspector: InspectorRecord | null;
  trustedVoiceFallbackInspector: InspectorRecord;
  sampleLibraryInspector: InspectorRecord;
  languageInspector: InspectorRecord;
  codeLabInspector: InspectorRecord;
  apiStudioInspector: InspectorRecord;
  appliedVoiceInspector: InspectorRecord;
  questlineInspector: InspectorRecord;
  overviewInspector: InspectorRecord;
}) {
  if (records.activeModule === "connection") return records.connectionInspector;
  if (records.activeModule === "transcribe-url") return records.urlInspector;
  if (records.activeModule === "upload-audio") return records.fileInspector;
  if (records.activeModule === "live-mic") return records.liveInspector;
  if (records.activeModule === "tts") return records.ttsInspector;
  if (records.activeModule === "trusted-voice") return records.trustedVoiceInspector || records.trustedVoiceFallbackInspector;
  if (records.activeModule === "sample-library") return records.sampleLibraryInspector;
  if (records.activeModule === "language-explorer") return records.languageInspector;
  if (records.activeModule === "api-studio") return records.apiStudioInspector;
  if (records.activeModule === "applied-voice-systems") return records.appliedVoiceInspector;
  if (records.activeModule === "applied-engineering-questline") return records.questlineInspector;
  if (records.activeModule === "code-lab") return records.codeLabInspector;
  return records.overviewInspector;
}

function buildOverviewInspector(input: {
  initialKeyDetected: boolean;
  health: DeepgramHealthResponse | null;
  activeModule: LabModuleId;
  guidedHints: boolean;
  focusMode: boolean;
  shellStartedAt: string;
}) {
  const at = input.shellStartedAt;
  return buildInspectorRecord({
    id: "overview",
    module: "Overview",
    startedAt: at,
    completedAt: at,
    request: {
      method: "LOCAL",
      endpoint: "http://localhost:3000/",
      bodyPreview: input,
    },
    response: {
      status: 200,
      bodyPreview: {
        shell: "Deepgram Control Room",
        zones: ["left rail", "center workspace", "right inspector"],
      },
    },
    timeline: [
      createTimelineEvent({ type: "shell.ready", label: "Control Room shell rendered", data: input, at }),
    ],
    notes: ["Overview is local UI state. It does not call Deepgram directly."],
  });
}

function buildSampleLibraryInspector(fileMap: Record<string, boolean>, at: string) {
  const files = SAMPLE_AUDIO_SCENARIOS.map((sample) => ({ slug: sample.slug, path: getSampleAudioPath(sample.slug), exists: Boolean(fileMap[sample.slug]) }));
  return buildInspectorRecord({
    id: "sample-library",
    module: "Sample Audio Library",
    startedAt: at,
    completedAt: at,
    request: { method: "HEAD", endpoint: "http://localhost:3000/samples/*.mp3", bodyPreview: { checkedFiles: files.length } },
    response: {
      status: 200,
      bodyPreview: {
        sampleCount: SAMPLE_AUDIO_SCENARIOS.length,
        languages: Array.from(new Set(SAMPLE_AUDIO_SCENARIOS.map((sample) => sample.language))).sort(),
        verticals: Array.from(new Set(SAMPLE_AUDIO_SCENARIOS.map((sample) => sample.vertical))).sort(),
        existingFiles: files.filter((file) => file.exists),
        missingFiles: files.filter((file) => !file.exists),
      },
    },
    timeline: files.map((file) => createTimelineEvent({ type: file.exists ? "sample.exists" : "sample.missing", label: file.path, data: file, at })),
    notes: ["Sample metadata is local. MP3 files are generated into public/samples and never include secrets."],
  });
}

function buildLanguageInspector(language: string, at: string) {
  return buildInspectorRecord({
    id: "language-explorer",
    module: "Language Explorer",
    startedAt: at,
    completedAt: at,
    request: { method: "LOCAL", endpoint: "http://localhost:3000/language-explorer", bodyPreview: { selectedLanguage: language } },
    response: { status: 200, bodyPreview: { selectedLanguage: language, options: DEEPGRAM_NOVA3_LANGUAGE_OPTIONS } },
    timeline: [createTimelineEvent({ type: "language.selected", label: `Selected ${language}`, data: { language }, at })],
    notes: ["Language values are sent as the language query parameter to Deepgram prerecorded and live listen endpoints."],
  });
}

function buildStaticInspector(module: string, note: string, id: string, at: string, state: "ready" | "unavailable" = "ready") {
  return buildInspectorRecord({
    id,
    module,
    startedAt: at,
    completedAt: at,
    request: { method: "LOCAL", endpoint: `http://localhost:3000/${id}` },
    response: { status: state === "unavailable" ? 503 : 200, bodyPreview: { module, note } },
    timeline: [createTimelineEvent({ type: `local.${state}`, label: note, at })],
    notes: [note],
  });
}

function moduleNotes(moduleId: LabModuleId, guidedHints: boolean) {
  const base = MODULE_CODE_SNIPPETS[moduleId].note;
  const notes = [base, "The right panel is sanitized. Authorization headers and token-like fields are redacted."];

  if (guidedHints) {
    notes.push("Guided Hints reveals explanatory callouts, expands inspectors, and adds walkthrough notes. It does not change API requests.");
  }

  if (moduleId === "live-mic") {
    notes.push("Audio chunk events are hidden by default because they are noisy. Enable them inside Live Mic when debugging transport timing.");
  }

  if (moduleId === "trusted-voice") {
    notes.push("Familiar Care uses the approved Aura catalog only. Consent and risk policy are enforced on both client and server; message text and audio are excluded from diagnostics.");
  }

  if (moduleId === "flux-tts") {
    notes.push("Flux batch timing is measured in the browser. Streaming remains experimental and disabled until its deployed auth and raw-audio path are verified.");
  }

  return notes;
}
