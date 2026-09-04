"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type {
  ProviderModelListResult,
  ProviderModelMetadata,
  ProviderSttResult,
  ProviderVoiceListResult,
  ProviderVoiceMetadata,
} from "@/lib/providers/types";

type CatalogState = "idle" | "loading" | "ready" | "error";
type OperationState = "idle" | "loading" | "success" | "error";

type JsonEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
};

const buttonClass = "inline-flex min-h-11 items-center justify-center rounded-lg border border-cyan-300/25 bg-cyan-300/[0.08] px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/[0.13] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200";
const fieldClass = "min-h-11 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none focus-visible:border-cyan-300/50 focus-visible:ring-2 focus-visible:ring-cyan-300/20";
const panelClass = "rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-[0_18px_70px_rgba(0,0,0,0.18)]";

export type ProviderApiStudioDefinition = Readonly<{
  providerId: "elevenlabs" | "fish-audio";
  displayName: string;
  outputFormat: string;
  ttsCharacterLimit: number;
  sttFileLimitMb: number;
  sttModelLabel: string;
  sttModels: readonly Readonly<{ id: string; name: string }>[];
  voiceRequired: boolean;
  defaultTtsText: string;
  notImplemented: string;
}>;

const ELEVENLABS_STUDIO: ProviderApiStudioDefinition = Object.freeze({
  providerId: "elevenlabs",
  displayName: "ElevenLabs",
  outputFormat: "mp3_44100_128",
  ttsCharacterLimit: 1_000,
  sttFileLimitMb: 10,
  sttModelLabel: "Scribe model",
  sttModels: Object.freeze([
    { id: "scribe_v2", name: "scribe_v2" },
    { id: "scribe_v1", name: "scribe_v1" },
  ]),
  voiceRequired: true,
  defaultTtsText: "Welcome to ONE Voice Lab. This ElevenLabs request runs only after your confirmation.",
  notImplemented: "realtime STT, streaming TTS, voice cloning, agents, arbitrary API proxying, and automatic execution",
});

export function ElevenLabsApiStudio(props: { configured: boolean; executionEnabled: boolean }) {
  return <ProviderApiStudio {...props} definition={ELEVENLABS_STUDIO} disabledLabel="Canonical execution policy disabled" />;
}

export function ProviderApiStudio(props: {
  configured: boolean;
  executionEnabled: boolean;
  definition: ProviderApiStudioDefinition;
  disabledLabel?: string;
}) {
  const { definition } = props;
  const [sessionId] = useState(createSessionId);
  const [catalogState, setCatalogState] = useState<CatalogState>("idle");
  const [catalogMessage, setCatalogMessage] = useState("Catalog requests have not run.");
  const [models, setModels] = useState<ProviderModelMetadata[]>([]);
  const [voices, setVoices] = useState<ProviderVoiceMetadata[]>([]);
  const [modelId, setModelId] = useState("");
  const [voiceId, setVoiceId] = useState("");

  const [ttsText, setTtsText] = useState(definition.defaultTtsText);
  const [ttsConfirmed, setTtsConfirmed] = useState(false);
  const [ttsState, setTtsState] = useState<OperationState>("idle");
  const [ttsMessage, setTtsMessage] = useState("No synthesis request has run.");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [ttsEvidence, setTtsEvidence] = useState<Record<string, string>>({});

  const [sttFile, setSttFile] = useState<File | null>(null);
  const [sttModel, setSttModel] = useState(definition.sttModels[0]?.id ?? "");
  const [sttLanguage, setSttLanguage] = useState("");
  const [sttConfirmed, setSttConfirmed] = useState(false);
  const [sttState, setSttState] = useState<OperationState>("idle");
  const [sttMessage, setSttMessage] = useState("No transcription request has run.");
  const [transcript, setTranscript] = useState<ProviderSttResult | null>(null);

  const ttsModels = useMemo(
    () => models.filter((model) => model.capabilities.textToSpeech === true),
    [models],
  );
  const available = props.configured && props.executionEnabled;
  const executionPolicyLabel = props.executionEnabled
    ? "Canonical execution policy enabled"
    : (props.disabledLabel ?? "Runtime switch disabled");
  const slug = definition.providerId;

  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  async function loadCatalogs() {
    setCatalogState("loading");
    setCatalogMessage("Loading normalized model and voice catalogs...");
    try {
      const headers = sessionHeaders(sessionId);
      const [modelsResponse, voicesResponse] = await Promise.all([
        fetch(`/api/providers/${definition.providerId}/models`, { headers, cache: "no-store" }),
        fetch(`/api/providers/${definition.providerId}/voices?pageSize=30`, { headers, cache: "no-store" }),
      ]);
      const modelBody = await readEnvelope<ProviderModelListResult>(modelsResponse);
      const voiceBody = await readEnvelope<ProviderVoiceListResult>(voicesResponse);
      if (!modelsResponse.ok || !modelBody.ok || !modelBody.data) throw responseError(modelBody, "Model catalog is unavailable.");
      if (!voicesResponse.ok || !voiceBody.ok || !voiceBody.data) throw responseError(voiceBody, "Voice catalog is unavailable.");

      const nextModels = [...modelBody.data.models];
      const nextVoices = [...voiceBody.data.voices];
      setModels(nextModels);
      setVoices(nextVoices);
      const firstTtsModel = nextModels.find((model) => model.capabilities.textToSpeech === true);
      setModelId((current) => nextModels.some((model) => model.id === current) ? current : firstTtsModel?.id ?? "");
      setVoiceId((current) => nextVoices.some((voice) => voice.id === current) ? current : nextVoices[0]?.id ?? "");
      setCatalogState("ready");
      setCatalogMessage(`Loaded ${nextModels.length} normalized models and ${nextVoices.length} normalized voices.`);
    } catch (error) {
      setCatalogState("error");
      setCatalogMessage(safeMessage(error, `${definition.displayName} catalogs could not be loaded.`));
    }
  }

  async function generateSpeech() {
    if (!ttsConfirmed || !ttsText.trim() || !modelId || (definition.voiceRequired && !voiceId)) return;
    setTtsState("loading");
    setTtsMessage(`Generating audio through the server-side ${definition.displayName} adapter...`);
    setTtsEvidence({});
    try {
      const response = await fetch(`/api/providers/${definition.providerId}/tts`, {
        method: "POST",
        headers: { ...sessionHeaders(sessionId), "content-type": "application/json" },
        body: JSON.stringify({
          text: ttsText,
          model: modelId,
          ...(voiceId ? { voice: voiceId } : {}),
          outputFormat: definition.outputFormat,
        }),
      });
      if (!response.ok) {
        const body = await readEnvelope<never>(response);
        throw responseError(body, `${definition.displayName} synthesis failed safely.`);
      }
      const blob = await response.blob();
      const nextAudioUrl = URL.createObjectURL(blob);
      setAudioUrl(nextAudioUrl);
      setTtsEvidence(safeResponseMetadata(response));
      setTtsState("success");
      setTtsMessage(`Received ${blob.size.toLocaleString()} audio bytes. Audio remains in this browser session.`);
    } catch (error) {
      setTtsState("error");
      setTtsMessage(safeMessage(error, `${definition.displayName} synthesis failed safely.`));
    }
  }

  async function transcribeAudio() {
    if (!sttConfirmed || !sttFile) return;
    setSttState("loading");
    setSttMessage(`Sending the selected file through the server-side ${definition.displayName} adapter...`);
    setTranscript(null);
    try {
      const form = new FormData();
      form.set("file", sttFile, sttFile.name);
      form.set("model", sttModel);
      if (sttLanguage.trim()) form.set("language", sttLanguage.trim());
      const response = await fetch(`/api/providers/${definition.providerId}/stt`, {
        method: "POST",
        headers: sessionHeaders(sessionId),
        body: form,
      });
      const body = await readEnvelope<ProviderSttResult>(response);
      if (!response.ok || !body.ok || !body.data) throw responseError(body, `${definition.displayName} transcription failed safely.`);
      setTranscript(body.data);
      setSttState("success");
      setSttMessage("Transcription complete. The Lab does not persist the uploaded file or transcript in this workflow.");
    } catch (error) {
      setSttState("error");
      setSttMessage(safeMessage(error, `${definition.displayName} transcription failed safely.`));
    }
  }

  return (
    <div className="space-y-5" data-testid={`${slug}-api-studio`}>
      <nav aria-label="Voice provider API Studio" className="flex flex-wrap gap-2">
        <Link className={buttonClass} href="/?module=api-studio">Deepgram API Studio</Link>
        <span aria-current="page" className="inline-flex min-h-11 items-center rounded-lg border border-violet-300/30 bg-violet-300/[0.09] px-4 py-2 text-sm font-semibold text-violet-100">{definition.displayName} API Studio</span>
        <Link className={buttonClass} href="/providers">Provider Rolodex</Link>
      </nav>

      <section aria-labelledby={`${slug}-configuration`} className={panelClass}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-200">Server boundary</p>
            <h2 className="mt-2 text-xl font-semibold text-white" id={`${slug}-configuration`}>{definition.displayName} configuration</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">The permanent API key stays on the server. This page receives only normalized catalogs, audio bytes, transcript results, and safe request metadata.</p>
          </div>
          <dl className="grid gap-2 text-xs sm:grid-cols-2" aria-label={`${definition.displayName} readiness`}>
            <div className={`rounded-lg border px-3 py-2 ${props.configured ? "border-emerald-300/30 bg-emerald-300/10" : "border-amber-300/30 bg-amber-300/10"}`}>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Credential readiness</dt>
              <dd className={`mt-1 font-semibold ${props.configured ? "text-emerald-100" : "text-amber-100"}`} data-testid={`${slug}-credential-readiness`}>
                {props.configured ? "Server key configured" : "Server key not configured"}
              </dd>
            </div>
            <div className={`rounded-lg border px-3 py-2 ${props.executionEnabled ? "border-emerald-300/30 bg-emerald-300/10" : "border-amber-300/30 bg-amber-300/10"}`}>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Execution policy</dt>
              <dd className={`mt-1 font-semibold ${props.executionEnabled ? "text-emerald-100" : "text-amber-100"}`} data-testid={`${slug}-execution-policy`}>
                {executionPolicyLabel}
              </dd>
            </div>
          </dl>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">No request runs on page load. Catalogs require a deliberate click; TTS and STT require an additional human confirmation. Server-instance request limits and provider kill switches remain active.</p>
      </section>

      <section aria-labelledby={`${slug}-catalogs`} className={panelClass}>
        <h2 className="text-xl font-semibold text-white" id={`${slug}-catalogs`}>1. Load safe catalogs</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">Loads model metadata and the first bounded page of voices. Account internals, preview URLs, and the server credential are not serialized.</p>
        <button className={`${buttonClass} mt-4`} disabled={!available || catalogState === "loading"} onClick={loadCatalogs} type="button">
          {catalogState === "loading" ? "Loading catalogs..." : `Load ${definition.displayName} models and voices`}
        </button>
        <p aria-live="polite" className="mt-3 text-sm text-slate-400" role="status">{catalogMessage}</p>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section aria-labelledby={`${slug}-tts`} className={panelClass}>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-200">Explicit provider usage</p>
          <h2 className="mt-2 text-xl font-semibold text-white" id={`${slug}-tts`}>2. Text to Speech</h2>
          <div className="mt-4 space-y-4">
            <label className="block text-sm font-medium text-slate-200" htmlFor={`${slug}-tts-model`}>Model</label>
            <select className={fieldClass} id={`${slug}-tts-model`} onChange={(event) => setModelId(event.target.value)} value={modelId}>
              <option value="">Load catalogs to choose a model</option>
              {ttsModels.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
            </select>
            <label className="block text-sm font-medium text-slate-200" htmlFor={`${slug}-voice`}>Voice{definition.voiceRequired ? "" : " (optional)"}</label>
            <select className={fieldClass} id={`${slug}-voice`} onChange={(event) => setVoiceId(event.target.value)} value={voiceId}>
              <option value="">{definition.voiceRequired ? "Load catalogs to choose a voice" : `Use ${definition.displayName} default voice`}</option>
              {voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.name}</option>)}
            </select>
            <label className="block text-sm font-medium text-slate-200" htmlFor={`${slug}-text`}>Text</label>
            <textarea className={`${fieldClass} min-h-28 resize-y`} id={`${slug}-text`} maxLength={definition.ttsCharacterLimit} onChange={(event) => setTtsText(event.target.value)} value={ttsText} />
            <p className="text-right text-xs text-slate-500">{ttsText.length.toLocaleString()} / {definition.ttsCharacterLimit.toLocaleString()} characters</p>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.05] p-3 text-sm leading-5 text-amber-50">
              <input checked={ttsConfirmed} className="mt-1 size-4" onChange={(event) => setTtsConfirmed(event.target.checked)} type="checkbox" />
              <span>I authorize this explicit Text to Speech request, which may use {definition.displayName} credits.</span>
            </label>
            <button className={buttonClass} disabled={!available || catalogState !== "ready" || !ttsConfirmed || !ttsText.trim() || !modelId || (definition.voiceRequired && !voiceId) || ttsState === "loading"} onClick={generateSpeech} type="button">
              {ttsState === "loading" ? "Generating..." : `Generate with ${definition.displayName}`}
            </button>
            <p aria-live="polite" className="text-sm text-slate-400" role="status">{ttsMessage}</p>
            {audioUrl ? <audio className="w-full" controls src={audioUrl}>Your browser does not support audio playback.</audio> : null}
            {Object.keys(ttsEvidence).length > 0 ? <SafeMetadata values={ttsEvidence} /> : null}
          </div>
        </section>

        <section aria-labelledby={`${slug}-stt`} className={panelClass}>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-200">Explicit provider usage</p>
          <h2 className="mt-2 text-xl font-semibold text-white" id={`${slug}-stt`}>3. Prerecorded Speech to Text</h2>
          <div className="mt-4 space-y-4">
            <label className="block text-sm font-medium text-slate-200" htmlFor={`${slug}-stt-file`}>Audio file</label>
            <input accept="audio/*,video/mp4,video/webm" className={fieldClass} id={`${slug}-stt-file`} onChange={(event) => setSttFile(event.target.files?.[0] ?? null)} type="file" />
            <p className="text-xs text-slate-500">Maximum {definition.sttFileLimitMb} MB. The file is forwarded for this request and is not persisted by the Lab route.</p>
            <label className="block text-sm font-medium text-slate-200" htmlFor={`${slug}-stt-model`}>{definition.sttModelLabel}</label>
            <select className={fieldClass} id={`${slug}-stt-model`} onChange={(event) => setSttModel(event.target.value)} value={sttModel}>
              {definition.sttModels.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
            </select>
            <label className="block text-sm font-medium text-slate-200" htmlFor={`${slug}-language`}>Language code (optional)</label>
            <input className={fieldClass} id={`${slug}-language`} maxLength={32} onChange={(event) => setSttLanguage(event.target.value)} placeholder="en" value={sttLanguage} />
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.05] p-3 text-sm leading-5 text-amber-50">
              <input checked={sttConfirmed} className="mt-1 size-4" onChange={(event) => setSttConfirmed(event.target.checked)} type="checkbox" />
              <span>I confirm this audio is safe to send and authorize a {definition.displayName} transcription request that may use credits.</span>
            </label>
            <button className={buttonClass} disabled={!available || !sttConfirmed || !sttFile || sttState === "loading"} onClick={transcribeAudio} type="button">
              {sttState === "loading" ? "Transcribing..." : `Transcribe with ${definition.displayName}`}
            </button>
            <p aria-live="polite" className="text-sm text-slate-400" role="status">{sttMessage}</p>
            {transcript ? (
              <div className="rounded-xl border border-white/10 bg-black/25 p-4">
                <h3 className="text-sm font-semibold text-white">Structured result</h3>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-200">{transcript.transcript}</p>
                <dl className="mt-4 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
                  <div><dt>Provider</dt><dd className="font-mono text-slate-200">{transcript.provider}</dd></div>
                  <div><dt>Model</dt><dd className="font-mono text-slate-200">{transcript.model}</dd></div>
                  <div><dt>Language</dt><dd className="font-mono text-slate-200">{transcript.language ?? "Not reported"}</dd></div>
                  <div><dt>Evidence</dt><dd className="text-slate-200">Observed in this explicit request</dd></div>
                </dl>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <section className={panelClass}>
        <h2 className="text-lg font-semibold text-white">Evidence and safety boundary</h2>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
          <li><strong className="text-white">Repository verified:</strong> fixed upstream routes, bounded inputs, server-only credential access, normalized responses, and mocked route tests.</li>
          <li><strong className="text-white">Provider documentation verified:</strong> the listed REST contracts are grounded in current public {definition.displayName} API documentation.</li>
          <li><strong className="text-white">Manual verification required:</strong> this account&apos;s entitlement, live output, latency, quality, quota behavior, and production suitability.</li>
          <li><strong className="text-white">Not implemented:</strong> {definition.notImplemented}.</li>
        </ul>
      </section>
    </div>
  );
}

function SafeMetadata({ values }: { values: Record<string, string> }) {
  return (
    <dl className="grid gap-2 rounded-xl border border-white/10 bg-black/25 p-4 text-xs sm:grid-cols-2">
      {Object.entries(values).map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="break-all font-mono text-slate-200">{value}</dd></div>)}
    </dl>
  );
}

function createSessionId(): string {
  try {
    return `browser-${crypto.randomUUID()}`;
  } catch {
    return `browser-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

function sessionHeaders(sessionId: string): Record<string, string> {
  return { "x-voice-lab-session": sessionId };
}

async function readEnvelope<T>(response: Response): Promise<JsonEnvelope<T>> {
  try {
    return await response.json() as JsonEnvelope<T>;
  } catch {
    return { ok: false, error: { message: "The server returned an unreadable response." } };
  }
}

function responseError(body: JsonEnvelope<unknown>, fallback: string): Error {
  return new Error(body.error?.message || fallback);
}

function safeMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function safeResponseMetadata(response: Response): Record<string, string> {
  const values: Record<string, string> = {};
  const allowlist = [
    ["Provider", "x-voice-lab-provider"],
    ["Model", "x-voice-lab-model"],
    ["Voice", "x-voice-lab-voice"],
    ["Output format", "x-voice-lab-output-format"],
    ["Server duration (ms)", "x-voice-lab-server-duration-ms"],
    ["Correlation ID", "x-voice-lab-correlation-id"],
    ["Upstream request ID", "x-voice-lab-upstream-request-id"],
    ["Provider-reported character cost", "x-voice-lab-character-cost"],
  ] as const;
  for (const [label, header] of allowlist) {
    const value = response.headers.get(header);
    if (value) values[label] = value;
  }
  return values;
}
