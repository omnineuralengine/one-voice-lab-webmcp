"use client";

import { useEffect, useId, useMemo, useState } from "react";

import { BrowserMicCard } from "@/components/browser-mic-card";
import {
  CheckIcon,
  LinkIcon,
  SpeakerIcon,
  UploadIcon,
  WaveIcon,
} from "@/components/icons";
import { ActionButton, FieldHint, FieldLabel, InlineMessage, LabCard, StatusBadge } from "@/components/lab-card";
import { PayloadInspector } from "@/components/PayloadInspector";
import { ResultPanel } from "@/components/result-panel";
import { SampleAudioLibrary, sampleUrlForTranscription } from "@/components/sample-audio-library";
import { useGuidedHints } from "@/hooks/use-guided-hints";
import {
  DEEPGRAM_NOVA3_LANGUAGE_OPTIONS,
  type DeepgramNova3LanguageCode,
  type DeepgramLanguageOption,
} from "@/lib/deepgram-languages";
import type {
  AsyncStatus,
  DeepgramErrorResponse,
  DeepgramHealthResponse,
  LabResult,
  TranscriptionResponse,
  TtsResponseData,
  TtsVoiceModel,
} from "@/lib/types";
import type { ApiDebugEnvelope, InspectorRecord } from "@/lib/inspection";
import type { SampleScenario } from "@/lib/sample-scenarios";

const SAMPLE_URL = "https://static.deepgram.com/examples/Bueller-Life-moves-pretty-fast.wav";
const DEFAULT_RESULT: LabResult = {
  title: "Ready",
  transcript: "Run a lab action to capture a transcript, audio response, or temporary token note.",
  raw: {
    local_lab: true,
    security: "DEEPGRAM_API_KEY is read only by server route handlers.",
  },
  notes:
    "Use the cards on the left to test authentication, transcribe hosted or generated samples, upload local audio, generate speech, or stream a live microphone with a temporary token.",
  updatedAt: "not run yet",
};

const TTS_MODELS: Array<{ label: string; value: TtsVoiceModel }> = [
  { label: "Aura 2 Thalia", value: "aura-2-thalia-en" },
  { label: "Aura 2 Asteria", value: "aura-2-asteria-en" },
  { label: "Aura 2 Orpheus", value: "aura-2-orpheus-en" },
  { label: "Aura 2 Luna", value: "aura-2-luna-en" },
  { label: "Aura 2 Livia (Italian)", value: "aura-2-livia-it" },
  { label: "Aura 2 Dionisio (Italian)", value: "aura-2-dionisio-it" },
  { label: "Aura 2 Nestor (Spanish)", value: "aura-2-nestor-es" },
  { label: "Aura 2 Izanami (Japanese)", value: "aura-2-izanami-ja" },
];

type StatusState = {
  status: AsyncStatus;
  message: string;
};

export function VoiceLab({ initialKeyDetected }: { initialKeyDetected: boolean }) {
  const [guidedHints, setGuidedHints] = useGuidedHints();
  const [health, setHealth] = useState<DeepgramHealthResponse | null>(null);
  const [url, setUrl] = useState(SAMPLE_URL);
  const [model, setModel] = useState("nova-3");
  const [language, setLanguage] = useState<DeepgramNova3LanguageCode>("en");
  const [smartFormat, setSmartFormat] = useState(true);
  const [diarize, setDiarize] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [ttsText, setTtsText] = useState(
    "Deepgram Voice Lab turns speech experiments into a calm local workflow.",
  );
  const [ttsModel, setTtsModel] = useState<TtsVoiceModel>("aura-2-thalia-en");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [result, setResult] = useState<LabResult>(DEFAULT_RESULT);
  const [copiedLabel, setCopiedLabel] = useState("");
  const [connectionState, setConnectionState] = useState<StatusState>({
    status: initialKeyDetected ? "idle" : "error",
    message: initialKeyDetected ? "Key detected locally." : "Key missing locally.",
  });
  const [urlState, setUrlState] = useState<StatusState>({ status: "idle", message: "" });
  const [fileState, setFileState] = useState<StatusState>({ status: "idle", message: "" });
  const [ttsState, setTtsState] = useState<StatusState>({ status: "idle", message: "" });
  const [connectionInspector, setConnectionInspector] = useState<InspectorRecord | null>(null);
  const [urlInspector, setUrlInspector] = useState<InspectorRecord | null>(null);
  const [fileInspector, setFileInspector] = useState<InspectorRecord | null>(null);
  const [ttsInspector, setTtsInspector] = useState<InspectorRecord | null>(null);
  const [urlTranscriptRaw, setUrlTranscriptRaw] = useState<unknown>(null);
  const [fileTranscriptRaw, setFileTranscriptRaw] = useState<unknown>(null);

  const heroStatus = useMemo(() => {
    if (health?.configured || initialKeyDetected) {
      return {
        label: health?.remote === "verified" ? "API key verified" : "API key detected",
        status: "configured" as const,
      };
    }

    return {
      label: "API key missing",
      status: "missing" as const,
    };
  }, [health, initialKeyDetected]);

  useEffect(() => {
    return () => {
      if (audioUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  async function testConnection() {
    setConnectionState({ status: "loading", message: "Checking server-side Deepgram configuration..." });

    try {
      const envelope = await readEnvelope<DeepgramHealthResponse>("/api/deepgram/health");
      const data = requireEnvelopeData(envelope);
      setConnectionInspector(envelope.inspector);
      setHealth(data);
      setConnectionState({
        status: data.ok ? "success" : "error",
        message: data.message,
      });
      setResult({
        title: "Connection Check",
        transcript: data.ok ? "Deepgram connection check completed." : "",
        raw: data,
        notes: data.message,
        updatedAt: timestamp(),
      });
    } catch (error) {
      const message = getErrorMessage(error);
      setConnectionInspector(getInspectorFromError(error));
      setConnectionState({ status: "error", message });
      setResult({
        title: "Connection Check Failed",
        transcript: "",
        raw: getEnvelopeFromError(error) || { message },
        notes: message,
        updatedAt: timestamp(),
      });
    }
  }

  async function transcribeUrl() {
    setUrlState({ status: "loading", message: "Sending hosted audio URL to Deepgram..." });

    try {
      const envelope = await postEnvelope<TranscriptionResponse>("/api/deepgram/transcribe-url", {
        url,
        model,
        smart_format: smartFormat,
        diarize,
        language,
      });
      const data = requireEnvelopeData(envelope);
      setUrlInspector(envelope.inspector);
      setUrlTranscriptRaw(data.raw);
      setUrlState({ status: "success", message: "URL transcription complete." });
      setResult({
        title: "Transcribed Audio URL",
        transcript: data.transcript || "Deepgram returned no transcript text.",
        raw: data.raw,
        notes: `Model ${data.request.model}, language ${data.request.language}, smart formatting ${data.request.smart_format ? "on" : "off"}, diarization ${data.request.diarize ? "on" : "off"}.`,
        updatedAt: timestamp(),
      });
    } catch (error) {
      const message = getErrorMessage(error);
      setUrlInspector(getInspectorFromError(error));
      setUrlState({ status: "error", message });
      setResult({
        title: "URL Transcription Failed",
        transcript: "",
        raw: getEnvelopeFromError(error) || { message },
        notes: message,
        updatedAt: timestamp(),
      });
    }
  }

  async function transcribeFile() {
    if (!file) {
      setFileState({ status: "error", message: "Choose an audio file first." });
      return;
    }

    setFileState({ status: "loading", message: `Uploading ${file.name} to the server route...` });

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("model", model);
      formData.append("language", language);
      formData.append("smart_format", String(smartFormat));
      formData.append("diarize", String(diarize));

      const response = await fetch("/api/deepgram/transcribe-file", {
        method: "POST",
        body: formData,
      });
      const envelope = await unwrapEnvelope<TranscriptionResponse>(response);
      const data = requireEnvelopeData(envelope);
      setFileInspector(envelope.inspector);
      setFileTranscriptRaw(data.raw);
      setFileState({ status: "success", message: "File transcription complete." });
      setResult({
        title: "Transcribed Audio File",
        transcript: data.transcript || "Deepgram returned no transcript text.",
        raw: data.raw,
        notes: `${data.request.filename || "Uploaded file"} was sent through a server route. The browser never received the API key.`,
        updatedAt: timestamp(),
      });
    } catch (error) {
      const message = getErrorMessage(error);
      setFileInspector(getInspectorFromError(error));
      setFileState({ status: "error", message });
      setResult({
        title: "File Transcription Failed",
        transcript: "",
        raw: getEnvelopeFromError(error) || { message },
        notes: message,
        updatedAt: timestamp(),
      });
    }
  }

  async function generateAudio() {
    setTtsState({ status: "loading", message: "Requesting speech audio from Deepgram..." });

    try {
      const envelope = await postEnvelope<TtsResponseData>("/api/deepgram/tts", { text: ttsText, model: ttsModel });
      const data = requireEnvelopeData(envelope);
      setTtsInspector(envelope.inspector);
      const nextAudioUrl = data.audioUrl;
      setAudioUrl((previous) => {
        if (previous?.startsWith("blob:")) {
          URL.revokeObjectURL(previous);
        }

        return nextAudioUrl;
      });
      setTtsState({ status: "success", message: "Audio generated and ready to play." });
      setResult({
        title: "Text to Speech",
        transcript: ttsText,
        raw: {
          contentType: data.contentType,
          bytes: data.byteSize,
          model: data.model,
          textLength: data.textLength,
          audioUrl: data.audioUrl,
        },
        notes: "The route returned playable audio bytes. The API key stayed on the server.",
        updatedAt: timestamp(),
      });
    } catch (error) {
      const message = getErrorMessage(error);
      setTtsInspector(getInspectorFromError(error));
      setTtsState({ status: "error", message });
      setResult({
        title: "Text to Speech Failed",
        transcript: "",
        raw: getEnvelopeFromError(error) || { message },
        notes: message,
        updatedAt: timestamp(),
      });
    }
  }

  async function copyResult(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLabel(`${label} copied.`);
    } catch {
      setCopiedLabel("Copy unavailable in this browser context.");
    }

    window.setTimeout(() => setCopiedLabel(""), 1600);
  }

  function useSampleInTranscribeUrl(sample: SampleScenario) {
    const options = sample.recommendedDeepgramOptions;

    setUrl(sampleUrlForTranscription(sample));
    setLanguage(sample.language);
    setModel(options.model);
    setSmartFormat(Boolean(options.smart_format));
    setDiarize(Boolean(options.diarize));
    setUrlState({
      status: "idle",
      message: `${sample.title} loaded. Generate the MP3 first if the sample audio file does not exist locally.`,
    });
    setResult({
      title: "Sample Loaded",
      transcript: sample.transcript,
      raw: {
        sample,
        transcribeUrl: sampleUrlForTranscription(sample),
      },
      notes: `Loaded ${sample.vertical}. The URL card now points to the local sample and language ${sample.language}.`,
      updatedAt: timestamp(),
    });
  }

  return (
    <main className="min-h-screen bg-[#03060a] text-slate-100">
      <div className="voice-grid min-h-screen bg-[linear-gradient(180deg,#071014_0%,#03060a_48%,#020305_100%)]">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
          <header className="rounded-lg border border-white/10 bg-[#071016]/90 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)] ring-1 ring-white/[0.03]">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="mb-5 flex items-center gap-3 text-cyan-100">
                  <div className="flex size-11 items-center justify-center rounded-lg border border-cyan-300/25 bg-cyan-300/10">
                    <WaveIcon className="size-6" />
                  </div>
                  <StatusBadge status={heroStatus.status}>{heroStatus.label}</StatusBadge>
                  <button
                    type="button"
                    onClick={() => setGuidedHints((value) => !value)}
                    className={`inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-medium transition ${
                      guidedHints
                        ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
                        : "border-white/10 bg-white/[0.05] text-slate-300"
                    }`}
                  >
                    Guided Hints: {guidedHints ? "On" : "Off"}
                  </button>
                </div>
                <h1 className="text-4xl font-semibold leading-tight tracking-normal text-white sm:text-5xl">
                  Deepgram Voice Lab
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                  Explore speech-to-text, streaming, formatting, diarization, and text-to-speech from one local dashboard.
                </p>
              </div>

              <div className="grid w-full gap-3 sm:grid-cols-3 lg:max-w-md">
                <SignalMetric label="Mode" value="Local-first" />
                <SignalMetric label="Model" value={model} />
                <SignalMetric label="Privacy" value="Server key" />
              </div>
            </div>
            <Waveform />
          </header>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_430px]">
            <div className="grid gap-6 lg:grid-cols-2">
              <LabCard
                title="Connection Check"
                description="Verify the server can see your local API key and optionally reach Deepgram."
                icon={<CheckIcon className="size-5" />}
                status={connectionState.status}
                statusText={connectionState.status === "idle" ? "Ready" : titleCase(connectionState.status)}
              >
                <div className="space-y-4">
                  <ActionButton onClick={testConnection} disabled={connectionState.status === "loading"}>
                    {connectionState.status === "loading" ? "Testing..." : "Test Deepgram Connection"}
                  </ActionButton>
                  <InlineMessage status={connectionState.status}>{connectionState.message}</InlineMessage>
                  <PayloadInspector record={connectionInspector} defaultOpen={guidedHints} />
                </div>
              </LabCard>

              <LabCard
                title="Transcribe Audio URL"
                description="Send a hosted audio URL through a server route to the prerecorded API."
                icon={<LinkIcon className="size-5" />}
                status={urlState.status}
                statusText={urlState.status === "idle" ? "URL" : titleCase(urlState.status)}
              >
                <div className="space-y-4">
                  <div className="space-y-2">
                    <FieldLabel>Audio URL</FieldLabel>
                    <input
                      value={url}
                      onChange={(event) => setUrl(event.target.value)}
                      className="h-11 w-full rounded-lg border border-white/10 bg-black/25 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-200/50 focus:ring-2 focus:ring-cyan-200/20"
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <FieldLabel>model</FieldLabel>
                      <input
                        value={model}
                        onChange={(event) => setModel(event.target.value)}
                        className="h-10 w-full rounded-lg border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-cyan-200/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <FieldLabel>language</FieldLabel>
                      <LanguageSelect
                        value={language}
                        onChange={setLanguage}
                      />
                    </div>
                  </div>
                  <FieldHint>
                    Specific languages restrict transcription to that language. Use multi for supported multilingual/code-switching audio.
                  </FieldHint>
                  {guidedHints ? (
                    <FieldHint>
                      language={language} tells Deepgram what language to expect. smart_format=true improves dates, numbers, currency, and punctuation.
                    </FieldHint>
                  ) : null}

                  <div className="flex flex-wrap gap-3">
                    <Toggle label="smart_format" checked={smartFormat} onChange={setSmartFormat} />
                    <Toggle label="diarize" checked={diarize} onChange={setDiarize} />
                  </div>

                  <ActionButton onClick={transcribeUrl} disabled={urlState.status === "loading"}>
                    {urlState.status === "loading" ? "Transcribing..." : "Transcribe URL"}
                  </ActionButton>
                  <InlineMessage status={urlState.status}>{urlState.message}</InlineMessage>
                  <TranscriptPathHelper raw={urlTranscriptRaw} />
                  <PayloadInspector record={urlInspector} defaultOpen={guidedHints} />
                </div>
              </LabCard>

              <LabCard
                title="Upload Audio File"
                description="Upload a local audio file to the server route before Deepgram receives it."
                icon={<UploadIcon className="size-5" />}
                status={fileState.status}
                statusText={fileState.status === "idle" ? "File" : titleCase(fileState.status)}
              >
                <div className="space-y-4">
                  <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-white/15 bg-black/20 px-4 py-5 text-center transition hover:border-cyan-200/40 hover:bg-cyan-200/[0.04]">
                    <UploadIcon className="mb-2 size-6 text-cyan-200" />
                    <span className="text-sm font-medium text-white">{file ? file.name : "Choose audio file"}</span>
                    <span className="mt-1 text-xs text-slate-500">
                      {file ? `${formatBytes(file.size)} selected` : "WAV, MP3, M4A, FLAC, and other audio formats"}
                    </span>
                    <input
                      type="file"
                      accept="audio/*"
                      className="sr-only"
                      onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                    />
                  </label>

                  <ActionButton onClick={transcribeFile} disabled={fileState.status === "loading"}>
                    {fileState.status === "loading" ? "Transcribing..." : "Transcribe File"}
                  </ActionButton>
                  <InlineMessage status={fileState.status}>{fileState.message}</InlineMessage>
                  <TranscriptPathHelper raw={fileTranscriptRaw} />
                  <PayloadInspector record={fileInspector} defaultOpen={guidedHints} />
                </div>
              </LabCard>

              <LabCard
                title="Text to Speech"
                description="Generate playable speech audio from text without exposing your API key."
                icon={<SpeakerIcon className="size-5" />}
                status={ttsState.status}
                statusText={ttsState.status === "idle" ? "TTS" : titleCase(ttsState.status)}
              >
                <div className="space-y-4">
                  <div className="space-y-2">
                    <FieldLabel>Text</FieldLabel>
                    <textarea
                      value={ttsText}
                      onChange={(event) => setTtsText(event.target.value)}
                      rows={4}
                      className="w-full resize-none rounded-lg border border-white/10 bg-black/25 px-3 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-200/50 focus:ring-2 focus:ring-cyan-200/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel>Voice/model</FieldLabel>
                    <select
                      value={ttsModel}
                      onChange={(event) => setTtsModel(event.target.value as TtsVoiceModel)}
                      className="h-11 w-full rounded-lg border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-cyan-200/50"
                    >
                      {TTS_MODELS.map((voice) => (
                        <option key={voice.value} value={voice.value} className="bg-slate-950">
                          {voice.label}
                        </option>
                      ))}
                    </select>
                    {guidedHints ? (
                      <FieldHint>
                        The voice model determines the language and speaker style. The inspector shows text length, model, content type, and audio byte size.
                      </FieldHint>
                    ) : null}
                  </div>
                  <ActionButton onClick={generateAudio} disabled={ttsState.status === "loading"}>
                    {ttsState.status === "loading" ? "Generating..." : "Generate Audio"}
                  </ActionButton>
                  {audioUrl ? (
                    <audio controls src={audioUrl} className="h-10 w-full" aria-label="Generated Deepgram audio playback" />
                  ) : null}
                  <InlineMessage status={ttsState.status}>{ttsState.message}</InlineMessage>
                  <PayloadInspector record={ttsInspector} defaultOpen={guidedHints} />
                </div>
              </LabCard>

              <BrowserMicCard language={language} onLanguageChange={setLanguage} onResult={setResult} guidedHints={guidedHints} />

              <SampleAudioLibrary onUseSample={useSampleInTranscribeUrl} guidedHints={guidedHints} />
            </div>

            <ResultPanel result={result} onCopy={copyResult} copiedLabel={copiedLabel} />
          </div>
        </div>
      </div>
    </main>
  );
}

function SignalMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function Waveform() {
  return (
    <div className="mt-6 flex h-16 items-end gap-1 overflow-hidden rounded-lg border border-white/10 bg-black/20 px-4 py-3" aria-hidden="true">
      {Array.from({ length: 52 }).map((_, index) => (
        <span
          key={index}
          className="waveform-bar w-full rounded-full bg-cyan-200/70"
          style={{ height: `${18 + ((index * 17) % 34)}px` }}
        />
      ))}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-slate-200">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-cyan-200"
      />
      {label}
    </label>
  );
}

function LanguageSelect({
  value,
  onChange,
}: {
  value: DeepgramNova3LanguageCode;
  onChange: (value: DeepgramNova3LanguageCode) => void;
}) {
  const listboxId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedOption = DEEPGRAM_NOVA3_LANGUAGE_OPTIONS.find((option) => option.code === value);
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return DEEPGRAM_NOVA3_LANGUAGE_OPTIONS;
    }

    return DEEPGRAM_NOVA3_LANGUAGE_OPTIONS.filter((option) =>
      `${option.name} ${option.code}`.toLowerCase().includes(normalizedQuery),
    );
  }, [query]);
  const inputValue = isOpen ? query : formatLanguageOption(selectedOption);

  function selectOption(option: DeepgramLanguageOption) {
    onChange(option.code as DeepgramNova3LanguageCode);
    setQuery("");
    setIsOpen(false);
  }

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
          setQuery("");
        }
      }}
    >
      <input
        role="combobox"
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-autocomplete="list"
        value={inputValue}
        onFocus={() => {
          setIsOpen(true);
          setQuery("");
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setIsOpen(false);
            setQuery("");
          }

          if (event.key === "Enter" && filteredOptions[0]) {
            event.preventDefault();
            selectOption(filteredOptions[0]);
          }
        }}
        placeholder="Search language or code..."
        className="h-10 w-full rounded-lg border border-white/10 bg-black/25 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-200/50 focus:ring-2 focus:ring-cyan-200/20"
      />
      {isOpen ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-12 z-30 max-h-72 overflow-auto rounded-lg border border-white/10 bg-[#070b10] p-1 shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
        >
          {filteredOptions.length ? (
            filteredOptions.map((option) => (
              <LanguageOptionButton
                key={option.code}
                option={option}
                selected={option.code === value}
                onSelect={selectOption}
              />
            ))
          ) : (
            <div className="px-3 py-3 text-sm text-slate-500">No Nova-3 language match.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function LanguageOptionButton({
  option,
  selected,
  onSelect,
}: {
  option: DeepgramLanguageOption;
  selected: boolean;
  onSelect: (option: DeepgramLanguageOption) => void;
}) {
  return (
    <button
        type="button"
        role="option"
        aria-selected={selected}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onSelect(option)}
        className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition ${
          selected ? "bg-cyan-200 text-slate-950" : "text-slate-200 hover:bg-white/[0.07] hover:text-white"
        }`}
      >
        <span className="min-w-0 truncate">{formatLanguageOption(option)}</span>
        <span className="shrink-0 font-mono text-[10px] opacity-70">{option.code}</span>
      </button>
  );
}

function formatLanguageOption(option: DeepgramLanguageOption | undefined) {
  return option ? `${option.name} \u2014 ${option.code}` : "";
}

function TranscriptPathHelper({ raw }: { raw: unknown }) {
  if (!raw) {
    return null;
  }

  const paths = buildTranscriptPaths(raw);

  return (
    <div className="rounded-lg border border-cyan-200/10 bg-cyan-200/[0.04] p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100/70">Where is the transcript?</p>
      <div className="mt-2 space-y-2 font-mono text-xs leading-5 text-slate-200">
        {paths.map((path) => (
          <div key={path.path} className="break-words">
            <span className={path.present ? "text-emerald-200" : "text-slate-500"}>{path.present ? "present" : "missing"}</span>{" "}
            {path.path}
          </div>
        ))}
      </div>
    </div>
  );
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
    {
      path: "results.channels[0].alternatives[0].transcript",
      present: Boolean(alternative?.transcript),
    },
    {
      path: "results.channels[0].alternatives[0].words",
      present: Boolean(alternative?.words?.length),
    },
    {
      path: "results.channels[0].alternatives[0].paragraphs",
      present: Boolean(alternative?.paragraphs),
    },
    {
      path: "results.channels[0].alternatives[0].summaries",
      present: Boolean(alternative?.summaries),
    },
    {
      path: "results.channels[0].alternatives[0].topics",
      present: Boolean(alternative?.topics),
    },
  ];
}

async function readEnvelope<T>(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  return unwrapEnvelope<T>(response);
}

async function postEnvelope<T>(url: string, payload: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error.";
}

function getInspectorFromError(error: unknown) {
  return error instanceof ApiEnvelopeError ? error.envelope.inspector : null;
}

function getEnvelopeFromError(error: unknown) {
  return error instanceof ApiEnvelopeError ? error.envelope : null;
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

function isApiEnvelope<T>(value: unknown): value is ApiDebugEnvelope<T> {
  return Boolean(
    value &&
      typeof value === "object" &&
      "ok" in value &&
      "inspector" in value &&
      typeof (value as { ok?: unknown }).ok === "boolean",
  );
}

function hasMessage(value: unknown): value is { message: string } {
  return Boolean(
    value &&
      typeof value === "object" &&
      "message" in value &&
      typeof (value as { message?: unknown }).message === "string",
  );
}

function timestamp() {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
