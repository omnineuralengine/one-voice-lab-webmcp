"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { BrowserRealtimeSession, type BrowserRealtimeSessionHandle } from "@/components/api-studio/BrowserRealtimeSession";
import type { ApiStudioInitialConfiguration } from "@/components/api-studio/ApiStudio";
import { ShortcutHint } from "@/components/keyboard-shortcuts/KeyboardShortcutController";
import { RedactionControl } from "@/components/redaction/RedactionControl";
import { AUDIO_UPLOAD_LIMITS } from "@/lib/audio-file-policy";
import {
  RealtimeFailureBanner,
  RealtimeRawEvents,
  RealtimeStatusStrip,
  RealtimeTimeline,
} from "@/components/api-studio/RealtimeSessionDiagnostics";
import {
  createRealtimeSession,
  createRealtimeDiagnosticExport,
  realtimeFailureCount,
  type RealtimeProtocol,
  type RealtimeSessionState,
} from "@/lib/api-studio/realtime-session";
import { DEEPGRAM_VOICE_AGENT_URL } from "@/lib/api-studio/voice-agent-session";
import type { CodeLabWorkflowId } from "@/lib/code-lab-files";
import type { LabModuleId } from "@/lib/code-snippets";
import { evaluateRedactionCompatibility, parseRedactionValues, redactionNoDelayWarning, serializeRedactionValues } from "@/lib/redaction";
import { sanitizeSnippet } from "@/lib/code-lab-launch-context";
import { generateDeepgramCodeSnippets } from "@/lib/deepgram-codegen";
import { CURATED_PRERECORDED_SAMPLES } from "@/lib/deepgram-samples";
import {
  DEEPGRAM_ENDPOINT_REGISTRY,
  getDeepgramEndpoint,
  regionHost,
  resolveDeepgramPath,
} from "@/lib/deepgram-endpoint-registry";
import type {
  DeepgramApiFamily,
  DeepgramEffectiveRequest,
  DeepgramEndpointDefinition,
  DeepgramParameterDefinition,
  DeepgramRegion,
} from "@/types/deepgram-endpoint-registry";

const FAMILY_ORDER: DeepgramApiFamily[] = [
  "Speech to Text", "Text to Speech", "Intelligence", "Voice Agent", "Authentication",
  "Models", "Projects", "Requests", "Usage", "Billing", "Administration",
];
const OLD_ID_MAP: Record<string, string> = {
  "stt-url": "stt-prerecorded", "stt-file": "stt-prerecorded", "tts-single": "tts-rest",
  "text-intelligence-analyze": "text-intelligence", "manage-models": "models-public-list", "auth-token": "auth-token-grant",
};
const EXPERIMENT_KEY = "deepgram-api-studio:sanitized-experiments:v2";
const OPEN_LAB_PRERECORDED_URL = CURATED_PRERECORDED_SAMPLES[0].sampleUrl;
const HOSTED_EXECUTION_REASON_ID = "api-studio-hosted-execution-reason";

type InspectorTab = "Overview" | "Request" | "Response" | "Headers" | "Timeline" | "Raw Events" | "Notes";
type RunResult = {
  ok: boolean;
  status?: number;
  requestId?: string;
  timing?: { totalMs?: number };
  request?: DeepgramEffectiveRequest;
  response?: { headers?: Record<string, string>; body?: unknown };
  error?: { code?: string; message?: string; issues?: Array<{ field: string; message: string }> };
};
type TimelineEvent = { at: string; label: string; detail?: string };

export function ExecutableApiStudio({
  onOpenModule,
  onOpenCodeLab,
  onReturnToQuestline,
  onOperationChange,
  initialOperationId = "stt-prerecorded",
  initialConfiguration,
  openLabMode = false,
}: {
  onOpenModule: (moduleId: LabModuleId) => void;
  onOpenCodeLab: (workflowId: CodeLabWorkflowId) => void;
  onReturnToQuestline?: () => void;
  onOperationChange?: (operationId: string) => void;
  initialOperationId?: string;
  initialConfiguration?: ApiStudioInitialConfiguration;
  openLabMode?: boolean;
}) {
  const requestedInitialOperationId = initialConfiguration?.operationId ?? initialOperationId;
  const initial = getDeepgramEndpoint(OLD_ID_MAP[requestedInitialOperationId] ?? requestedInitialOperationId) ?? DEEPGRAM_ENDPOINT_REGISTRY[0];
  const [endpointId, setEndpointId] = useState(initial.id);
  const [valuesByEndpoint, setValuesByEndpoint] = useState<Record<string, Record<string, unknown>>>(() => buildApiStudioDefaultValues(initialConfiguration, openLabMode));
  const [region, setRegion] = useState<DeepgramRegion>("global");
  const [file, setFile] = useState<File | null>(null);
  const [inputMode, setInputMode] = useState<"url" | "file">("url");
  const [tab, setTab] = useState<InspectorTab>("Overview");
  const [result, setResult] = useState<RunResult | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [realtimeSession, setRealtimeSession] = useState<RealtimeSessionState | null>(() => initialRealtimeSession(initial.id));
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState(initial.hostedExecution?.reason ?? initialConfiguration?.explanation ?? "Configure a request, validate it, then run explicitly.");
  const [copied, setCopied] = useState("");
  const [advancedMode, setAdvancedMode] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const realtimeRef = useRef<BrowserRealtimeSessionHandle | null>(null);
  const lastSubmissionRef = useRef<{ fingerprint: string; at: number } | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const endpoint = getDeepgramEndpoint(endpointId) ?? DEEPGRAM_ENDPOINT_REGISTRY[0];
  const hostedExecution = endpoint.hostedExecution;
  const hostedExecutionUnavailable = hostedExecution?.state === "unavailable";
  const values = useMemo(() => valuesByEndpoint[endpoint.id] ?? {}, [endpoint.id, valuesByEndpoint]);
  const validation = useMemo(() => validateWorkbench(endpoint, values, region, file, inputMode, openLabMode, advancedMode, confirmation), [advancedMode, confirmation, endpoint, file, inputMode, openLabMode, region, values]);
  const effectiveRequest = useMemo(() => buildEffectiveRequest(endpoint, values, region, inputMode, file), [endpoint, file, inputMode, region, values]);
  const snippets = useMemo(() => generateDeepgramCodeSnippets(endpoint, effectiveRequest), [effectiveRequest, endpoint]);
  const audio = readAudioResult(result);
  const audioUrl = useMemo(() => {
    if (!audio) return null;
    const bytes = Uint8Array.from(atob(audio.base64), (char) => char.charCodeAt(0));
    return URL.createObjectURL(new Blob([bytes], { type: audio.contentType }));
  }, [audio]);

  useEffect(() => {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = audioUrl;
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function selectEndpoint(id: string) {
    const nextEndpoint = getDeepgramEndpoint(id) ?? DEEPGRAM_ENDPOINT_REGISTRY[0];
    setEndpointId(nextEndpoint.id);
    onOperationChange?.(nextEndpoint.id);
    setFile(null);
    setResult(null);
    setTimeline([]);
    setRealtimeSession(initialRealtimeSession(id));
    setConfirmation("");
    setTab("Overview");
    setMessage(nextEndpoint.hostedExecution?.reason ?? "Configure a request, validate it, then run explicitly.");
  }

  function updateValue(name: string, value: unknown) {
    setValuesByEndpoint((current) => ({
      ...current,
      [endpoint.id]: { ...(current[endpoint.id] ?? {}), [name]: value },
    }));
    setResult(null);
  }

  async function validateRequest() {
    setTab("Request");
    setMessage(validation.errors.length ? `Validation found ${validation.errors.length} blocking issue(s).` : "Request is valid and no network call was made.");
    setTimeline((current) => [...current, event(validation.errors.length ? "Validation failed" : "Validation passed", `${validation.errors.length} errors, ${validation.warnings.length} warnings`)]);
  }

  function buildPayload() {
    setTab("Request");
    setMessage("Effective request built locally. Authorization remains server-only and redacted.");
    setTimeline((current) => [...current, event("Payload built", "No Deepgram request was sent.")]);
  }

  async function runRequest() {
    if (hostedExecutionUnavailable) {
      setMessage(hostedExecution.reason);
      return;
    }
    if (endpoint.executionMode === "handoff") {
      openPrimaryHandoff(endpoint, onOpenModule, onOpenCodeLab);
      setMessage("Opened the existing guided realtime workflow. It owns microphone and connection cleanup.");
      return;
    }
    if (endpoint.executionMode === "browser-websocket") {
      if (validation.errors.length || running) { setMessage("Resolve validation errors before starting the realtime session."); return; }
      setRunning(true);
      setResult({ ok: true, status: 101, request: effectiveRequest, response: { headers: {}, body: { events: [] } } });
      realtimeRef.current?.start();
      setTab("Timeline");
      return;
    }
    if (endpoint.riskTier === 3) {
      setMessage("Tier 3 execution remains locked. The exact request preview is available for review.");
      return;
    }
    if (validation.errors.length || running) {
      setMessage("Resolve validation errors before running this request.");
      return;
    }
    const fingerprint = JSON.stringify({ endpointId: endpoint.id, values, region, file: file?.name, size: file?.size });
    if (lastSubmissionRef.current?.fingerprint === fingerprint && Date.now() - lastSubmissionRef.current.at < 4_000) {
      setMessage("Duplicate submission blocked. Wait a moment or change the request.");
      return;
    }
    lastSubmissionRef.current = { fingerprint, at: Date.now() };
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setResult(null);
    setTab("Timeline");
    setMessage(endpoint.billable ? "Running an explicitly requested billable call…" : "Running a non-billable call…");
    setTimeline([event("Request started", `${endpoint.method} ${effectiveRequest.sanitizedUrl}`)]);

    try {
      const response = endpoint.id === "auth-token-grant"
        ? await fetch("/api/deepgram/token", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ttlSeconds: Number(values.ttl_seconds ?? 30) }), signal: controller.signal,
        })
        : await fetch("/api/deepgram/execute", buildExecutionInit(endpoint, values, region, file, inputMode, controller.signal));
      const raw = await response.json() as Record<string, unknown>;
      const normalized = endpoint.id === "auth-token-grant" ? normalizeTokenResult(raw, response.status, effectiveRequest) : raw as RunResult;
      setResult(normalized);
      setTimeline((current) => [...current, event(normalized.ok ? "Response received" : "Request failed", `HTTP ${normalized.status ?? response.status}`)]);
      setMessage(normalized.ok ? "Request completed. Inspect the sanitized response, headers, and timing." : normalized.error?.message ?? "Deepgram request failed.");
      setTab(normalized.ok ? "Overview" : "Response");
    } catch (error) {
      const stopped = error instanceof Error && error.name === "AbortError";
      setResult({ ok: false, error: { code: stopped ? "stopped" : "local_network_error", message: stopped ? "Request stopped locally." : "The local execution route could not be reached." } });
      setTimeline((current) => [...current, event(stopped ? "Request stopped" : "Local request failed")]);
      setMessage(stopped ? "Request stopped." : "The local execution route could not be reached.");
      setTab("Response");
    } finally {
      abortRef.current = null;
      setRunning(false);
    }
  }

  function stop() {
    if (endpoint.executionMode === "browser-websocket") realtimeRef.current?.stop();
    else abortRef.current?.abort();
  }

  async function checkHealth() {
    setHealthLoading(true);
    try {
      const response = await fetch("/api/deepgram/health", { cache: "no-store" });
      const raw = await response.json() as { data?: Record<string, unknown>; error?: unknown };
      setHealth(raw.data ?? { configured: false, message: "Health response was unavailable.", error: raw.error });
    } catch {
      setHealth({ configured: false, authenticated: false, message: "The local health route could not be reached." });
    } finally {
      setHealthLoading(false);
    }
  }

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied((current) => current === label ? "" : current), 1400);
  }

  async function copyDiagnosticSummary() {
    if (!realtimeSession) return;
    await navigator.clipboard.writeText(JSON.stringify(createRealtimeDiagnosticExport(realtimeSession), null, 2));
    setMessage("Sanitized diagnostic summary copied. Credentials, raw audio, and transcript text were excluded.");
  }

  function saveExperiment() {
    const stored = readStoredExperiments();
    const sanitized = {
      id: crypto.randomUUID(), savedAt: new Date().toISOString(), endpointId: endpoint.id, region,
      path: effectiveRequest.sanitizedUrl, method: endpoint.method,
      configuration: sanitizeExperimentValues(values),
      outcome: result ? { ok: result.ok, status: result.status, requestId: result.requestId, timing: result.timing } : null,
      note: "Credentials, raw audio, generated audio, transcripts, and response bodies are not persisted.",
    };
    window.localStorage.setItem(EXPERIMENT_KEY, JSON.stringify([sanitized, ...stored].slice(0, 50)));
    setMessage("Sanitized experiment saved locally without credentials, raw audio, transcripts, or response bodies.");
  }

  function reset() {
    setValuesByEndpoint((current) => ({ ...current, [endpoint.id]: defaultsFor(endpoint, openLabMode) }));
    setFile(null); setResult(null); setTimeline([]); setConfirmation(""); setMessage("Request reset locally.");
  }

  return (
    <div className="h-full min-h-0 overflow-x-auto bg-[#02060b] text-slate-200" data-testid="api-studio-executable">
      <div className="grid h-full min-h-0 min-w-[1080px] [grid-template-columns:260px_minmax(470px,1.25fr)_minmax(360px,.95fr)]">
        <aside className="min-h-0 overflow-y-auto border-r border-white/10 bg-[#040a10]">
          <div className="sticky top-0 z-10 border-b border-white/10 bg-[#040a10]/95 px-3 py-3 backdrop-blur">
            <div className="flex items-center justify-between gap-2">
              <div><p className="text-[9px] font-bold uppercase tracking-[.22em] text-cyan-300">Deepgram API</p><h2 className="mt-1 text-sm font-semibold text-white">Execution Registry</h2></div>
              <span className="rounded border border-white/10 px-1.5 py-1 font-mono text-[9px] text-slate-500">{DEEPGRAM_ENDPOINT_REGISTRY.length}</span>
            </div>
            <button type="button" onClick={() => void checkHealth()} className="mt-3 w-full rounded-md border border-emerald-300/20 bg-emerald-300/[.06] px-2 py-2 text-left text-[10px] text-emerald-100">
              {healthLoading ? "Checking server boundary…" : health ? String(health.message ?? "Credential status checked") : "Check API key status"}
            </button>
            {health ? <HealthSummary health={health} /> : null}
          </div>
          <nav className="p-2" aria-label="Deepgram API navigation">
            {FAMILY_ORDER.map((family) => {
              const items = DEEPGRAM_ENDPOINT_REGISTRY.filter((item) => item.family === family);
              if (!items.length) return null;
              return <div key={family} className="mb-3">
                <p className="px-2 py-1 text-[9px] font-bold uppercase tracking-[.16em] text-slate-600">{family}</p>
                <div className="space-y-0.5">{items.map((item) => <button key={item.id} type="button" onClick={() => selectEndpoint(item.id)} className={`w-full rounded-md px-2 py-2 text-left transition ${item.id === endpoint.id ? "bg-cyan-300/10 ring-1 ring-cyan-300/20" : "hover:bg-white/[.04]"}`}>
                  <span className="flex items-center justify-between gap-2"><span className={`font-mono text-[9px] ${item.protocol === "wss" ? "text-violet-300" : "text-cyan-300"}`}>{item.protocol === "wss" ? "WSS" : item.method}</span><StatusDot endpoint={item} /></span>
                  <span className="mt-1 block text-[11px] leading-4 text-slate-300">{item.officialName}</span>
                </button>)}</div>
              </div>;
            })}
          </nav>
        </aside>

        <main className="min-h-0 overflow-y-auto border-r border-white/10 bg-white/[.015]">
          <header className="border-b border-white/10 bg-[#071118]/80 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div><div className="flex flex-wrap gap-1.5"><Badge>{endpoint.method}</Badge><Badge>{endpoint.protocol.toUpperCase()}</Badge><Badge tone={capabilityStatusTone(endpoint)}>{capabilityStatusLabel(endpoint)}</Badge>{endpoint.billable ? <Badge tone="amber">Billable</Badge> : <Badge tone="green">Non-billable</Badge>}</div><h2 className="mt-2 text-lg font-semibold text-white">{endpoint.officialName}</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">{endpoint.description}</p></div>
              <a href={endpoint.documentationUrl} target="_blank" rel="noreferrer" className="shrink-0 rounded border border-white/10 px-2 py-1.5 text-[10px] text-cyan-100 hover:bg-white/[.04]">Official docs ↗</a>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <div className="rounded border border-white/10 bg-black/30 px-3 py-2 font-mono text-[10px] text-cyan-100 break-all">{effectiveRequest.sanitizedUrl}</div>
              <select value={region} onChange={(event) => setRegion(event.target.value as DeepgramRegion)} className="rounded border border-white/10 bg-[#050b11] px-2 text-[10px] text-slate-200">
                <option value="global">Global</option><option value="eu">EU</option><option value="au">AU</option>
              </select>
            </div>
          </header>

          <div className="space-y-4 p-4">
            <section className="grid gap-2 sm:grid-cols-3">
              <InfoCard label="Authentication" value={hostedExecutionUnavailable ? "Hosted token disabled" : endpoint.authenticationMode === "temporary-token" ? "Temporary browser token" : "Server API key"} />
              <InfoCard label="Required role" value={endpoint.projectRoleRequirement} />
              <InfoCard label="Response" value={endpoint.responseType} />
            </section>
            {hostedExecutionUnavailable ? <section aria-labelledby="api-studio-hosted-execution-title" className="rounded border border-amber-300/25 bg-amber-300/[.05] px-3 py-3 text-[10px] leading-4 text-amber-100" id={HOSTED_EXECUTION_REASON_ID}><strong className="block text-xs" id="api-studio-hosted-execution-title">{hostedExecution.label}</strong><p className="mt-1">{hostedExecution.reason}</p></section> : endpoint.authenticationMode === "temporary-token" ? <Notice>Browser WebSockets receive a short-lived token from <code>/api/deepgram/token</code>. The permanent key never enters browser JavaScript.</Notice> : <Notice>The local server adds Authorization after validation. The browser never sends or receives the permanent key.</Notice>}
            {initialConfiguration ? <PrefillSummary configuration={initialConfiguration} /> : null}

            {realtimeSession ? <RealtimeStatusStrip session={realtimeSession} onCopyDiagnostic={() => void copyDiagnosticSummary()} /> : null}
            {realtimeSession ? <RealtimeFailureBanner session={realtimeSession} onOpenRawEvents={() => setTab("Raw Events")} /> : null}

            {endpoint.executionMode === "browser-websocket" && !hostedExecutionUnavailable ? <BrowserRealtimeSession ref={realtimeRef} endpoint={endpoint} url={effectiveRequest.sanitizedUrl} values={values} onUpdate={(update) => {
              setRunning(update.running); setMessage(update.message); setRealtimeSession(update.session);
              if (update.event !== undefined) {
                setResult((current) => ({ ok: true, status: current?.status ?? 101, request: effectiveRequest, response: { headers: current?.response?.headers ?? {}, body: { eventCount: update.session.events.length, note: "Inspect Timeline and Raw Events for sanitized realtime diagnostics." } } }));
              }
            }} /> : null}

            {endpoint.id === "stt-prerecorded" ? <section><SectionTitle title="Input mode" detail="Choose one source. Audio is never persisted by the studio." /><div className="flex gap-2"><Choice active={inputMode === "url"} onClick={() => { setInputMode("url"); setFile(null); }}>Remote URL</Choice><Choice active={inputMode === "file"} onClick={() => setInputMode("file")}>Local file upload</Choice></div>{inputMode === "file" ? <><input type="file" accept="audio/*,video/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-2 w-full rounded border border-dashed border-white/15 bg-black/20 p-3 text-xs text-slate-400" />{openLabMode ? <p className="mt-2 text-[10px] text-slate-500">Public Open Lab uploads are limited to {Math.round(AUDIO_UPLOAD_LIMITS.hosted / 1024 / 1024)} MB.</p> : null}</> : openLabMode ? <p className="mt-2 rounded border border-cyan-200/15 bg-cyan-200/[0.04] p-3 text-xs leading-5 text-cyan-50">Public Open Lab uses the curated sample URL. Switch to file upload for other short audio.</p> : null}</section> : null}

            <section>
              <SectionTitle title="Request configuration" detail="Every control is sourced from the typed endpoint allowlist." />
              <div className="grid gap-2 sm:grid-cols-2">
                {endpoint.parameters.filter((parameter) => showParameter(parameter, endpoint, inputMode, openLabMode)).map((parameter) => <ParameterField key={`${parameter.location}:${parameter.name}`} parameter={parameter} value={values[parameter.name]} onChange={(value) => updateValue(parameter.name, value)} endpoint={endpoint} language={String(values.language ?? "en")} onOpenRedactionLab={() => onOpenModule("redaction-lab")} />)}
              </div>
              {!endpoint.parameters.some((parameter) => showParameter(parameter, endpoint, inputMode, openLabMode)) ? <p className="rounded border border-dashed border-white/10 p-3 text-xs text-slate-500">This endpoint has no configurable request parameters.</p> : null}
            </section>

            {endpoint.riskTier === 3 ? <section className="rounded-lg border border-rose-400/25 bg-rose-400/[.05] p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-rose-100">Advanced mutation locked</p><p className="mt-1 text-[11px] leading-4 text-rose-200/65">{endpoint.impact}</p></div><label className="flex items-center gap-2 text-[10px] text-slate-300"><input type="checkbox" checked={advancedMode} onChange={(event) => setAdvancedMode(event.target.checked)} />Advanced Administration Mode</label></div><label className="mt-3 block text-[10px] text-slate-400">Confirmation phrase<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={endpoint.confirmationPhrase} className="mt-1 w-full rounded border border-rose-400/20 bg-black/30 px-3 py-2 font-mono text-xs text-rose-100 outline-none" /></label><p className="mt-2 text-[10px] text-rose-200/60">This release previews Tier 3 requests but intentionally does not execute them.</p></section> : null}

            <section className={`rounded-lg border p-3 ${hostedExecutionUnavailable ? "border-amber-300/25 bg-amber-300/[.04]" : validation.errors.length ? "border-rose-400/25 bg-rose-400/[.04]" : "border-emerald-400/20 bg-emerald-400/[.035]"}`}>
              <div className="flex items-center justify-between"><p className="text-xs font-semibold text-white">Validation summary</p><span className={`text-[10px] ${hostedExecutionUnavailable ? "text-amber-200" : validation.errors.length ? "text-rose-300" : "text-emerald-300"}`}>{hostedExecutionUnavailable ? hostedExecution.label : validation.errors.length ? `${validation.errors.length} errors` : "Ready"}</span></div>
              {[...validation.errors, ...validation.warnings].map((item) => <p key={item} className="mt-1 text-[10px] text-slate-400">• {item}</p>)}
            </section>

            <section><SectionTitle title="Generated snippets" detail="Placeholders reference server environment variables; credentials are never embedded." /><div className="grid grid-cols-5 gap-1">{Object.entries(snippets).map(([language, code]) => <button key={language} type="button" onClick={() => void copy(language, code)} className="rounded border border-white/10 bg-black/20 px-2 py-2 text-[9px] text-slate-300 hover:border-cyan-300/25">{copied === language ? "Copied" : language}</button>)}</div></section>
          </div>

          <footer className="sticky bottom-0 border-t border-white/10 bg-[#050b11]/95 p-3 backdrop-blur">
            <p className="mb-2 min-h-4 text-[10px] text-slate-400" role="status">{message}</p>
            <div className="flex flex-wrap gap-1.5">
              <Action onClick={() => void validateRequest()}>Validate</Action><Action onClick={buildPayload}>Build Payload</Action>
              <Action primary shortcutCommand="run_primary" shortcutLabel={endpoint.executionMode === "browser-websocket" ? "Start current session" : "Run current request"} disabledReason={hostedExecution?.reason ?? "Resolve validation errors or wait for the current request to finish."} describedBy={hostedExecutionUnavailable ? HOSTED_EXECUTION_REASON_ID : undefined} disabled={hostedExecutionUnavailable || running || (endpoint.executionMode !== "handoff" && validation.errors.length > 0) || endpoint.riskTier === 3} onClick={() => void runRequest()}>{running ? "Running…" : endpoint.executionMode === "handoff" ? "Open Guided Handoff" : "Run Request"}<ShortcutHint command="run_primary" /></Action>
              <Action shortcutCommand="stop_session" shortcutLabel="Stop current session" disabledReason="No request or realtime session is active." disabled={!running} onClick={stop}>Stop<ShortcutHint command="stop_session" /></Action>
              <Action onClick={() => void copy("curl", snippets.curl)}>{copied === "curl" ? "Copied cURL" : "Copy cURL"}</Action>
              <Action onClick={() => onOpenCodeLab(codeLabWorkflow(endpoint))}>Open in Code Lab</Action>
              <Action onClick={() => onOpenModule("live-observatory")}>Send to Observatory</Action>
              <Action onClick={saveExperiment}>Save Sanitized Experiment</Action><Action shortcutCommand="reset_current" shortcutLabel="Reset current module" disabledReason="Stop the active request or session before resetting." disabled={running} onClick={reset}>Reset<ShortcutHint command="reset_current" /></Action>
              {onReturnToQuestline ? <Action onClick={onReturnToQuestline}>Return to Questline</Action> : null}
            </div>
          </footer>
        </main>

        <aside className="flex min-h-0 flex-col bg-[#03080d]">
          <div className="flex shrink-0 overflow-x-auto border-b border-white/10 px-2 pt-2" role="tablist" aria-label="API Studio inspection views">{(["Overview", "Request", "Response", "Headers", "Timeline", "Raw Events", "Notes"] as InspectorTab[]).map((item) => {
            const failureCount = item === "Raw Events" && realtimeSession ? realtimeFailureCount(realtimeSession) : 0;
            return <button key={item} type="button" role="tab" aria-selected={tab === item} data-shortcut-command={item === "Timeline" ? "open_timeline" : item === "Raw Events" ? "open_raw_events" : undefined} data-shortcut-label={item === "Timeline" ? "Open Timeline" : item === "Raw Events" ? "Open Raw Events" : undefined} onClick={() => setTab(item)} className={`whitespace-nowrap border-b-2 px-2 py-2 text-[9px] ${tab === item ? "border-cyan-300 text-cyan-100" : "border-transparent text-slate-600"}`}>{item}{item === "Timeline" ? <ShortcutHint command="open_timeline" /> : item === "Raw Events" ? <ShortcutHint command="open_raw_events" /> : null}{failureCount ? <span className="ml-1 rounded-full bg-rose-300 px-1.5 py-0.5 font-bold text-slate-950" aria-label={`${failureCount} failures`} data-testid="raw-events-failure-badge">{failureCount}</span> : null}</button>;
          })}</div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3"><Inspector tab={tab} endpoint={endpoint} request={effectiveRequest} result={result} timeline={timeline} validation={validation} audioUrl={audioUrl} realtimeSession={realtimeSession} /></div>
        </aside>
      </div>
    </div>
  );
}

function Inspector({ tab, endpoint, request, result, timeline, validation, audioUrl, realtimeSession }: { tab: InspectorTab; endpoint: DeepgramEndpointDefinition; request: DeepgramEffectiveRequest; result: RunResult | null; timeline: TimelineEvent[]; validation: { errors: string[]; warnings: string[] }; audioUrl: string | null; realtimeSession: RealtimeSessionState | null }) {
  if (tab === "Overview") return <div className="space-y-3"><InspectorCard title="Execution"><p>{result ? (result.ok ? "Completed successfully" : "Failed") : "Not run"}</p><p className="mt-1 text-slate-500">{result?.status ? `HTTP ${result.status}` : endpoint.executionMode}</p></InspectorCard><InspectorCard title="Request ID"><p className="break-all font-mono text-cyan-100">{result?.requestId ?? "Not available"}</p></InspectorCard><InspectorCard title="Timing"><p>{result?.timing?.totalMs !== undefined ? `${result.timing.totalMs} ms` : "Not measured"}</p></InspectorCard>{audioUrl ? <InspectorCard title="Generated audio"><audio controls src={audioUrl} className="w-full" /><a href={audioUrl} download="deepgram-speech.bin" className="mt-2 inline-block text-cyan-200 underline">Save locally</a></InspectorCard> : null}</div>;
  if (tab === "Request") return <JsonBlock value={request} />;
  if (tab === "Response") return <JsonBlock value={result?.response?.body ?? result?.error ?? { note: "Run the request to inspect its response." }} />;
  if (tab === "Headers") return <JsonBlock value={result?.response?.headers ?? { note: "Safe upstream headers appear after execution." }} />;
  if (tab === "Timeline") return realtimeSession ? <RealtimeTimeline session={realtimeSession} /> : <div className="space-y-2">{timeline.length ? timeline.map((item, index) => <div key={`${item.at}-${index}`} className="rounded border border-white/10 bg-black/20 p-2"><p className="text-[10px] text-cyan-100">{item.label}</p><p className="mt-1 font-mono text-[9px] text-slate-600">{item.at}</p>{item.detail ? <p className="mt-1 text-[10px] text-slate-400">{item.detail}</p> : null}</div>) : <Empty text="No events yet." />}</div>;
  if (tab === "Raw Events") return realtimeSession ? <RealtimeRawEvents session={realtimeSession} /> : <JsonBlock value={result?.response?.body ?? { note: "REST responses do not have a separate event stream." }} />;
  return <div className="space-y-3"><InspectorCard title="Safety notes"><p>The permanent key is read only by server-only modules. Request previews use a fixed generic mask.</p><p className="mt-2">Audio, transcripts, and generated speech are not persisted by default.</p></InspectorCard><InspectorCard title="Validation"><p>{validation.errors.length ? validation.errors.join(" ") : "No blocking validation errors."}</p></InspectorCard><InspectorCard title="Official source"><a className="break-all text-cyan-200 underline" href={endpoint.documentationUrl} target="_blank" rel="noreferrer">{endpoint.documentationUrl}</a></InspectorCard></div>;
}

function ParameterField({ parameter, value, onChange, endpoint, language, onOpenRedactionLab }: { parameter: DeepgramParameterDefinition; value: unknown; onChange: (value: unknown) => void; endpoint: DeepgramEndpointDefinition; language: string; onOpenRedactionLab: () => void }) {
  const current = value ?? parameter.defaultValue ?? "";
  if (parameter.name === "redact") {
    return <RedactionControl policy={parseRedactionValues(current)} onChange={(policy) => onChange(serializeRedactionValues(policy))} mode={endpoint.id === "stt-live" ? "streaming" : "prerecorded"} language={language} onOpenLab={onOpenRedactionLab} compact />;
  }
  return <label className="rounded border border-white/10 bg-black/20 p-2"><span className="flex items-center justify-between gap-2 text-[10px] font-semibold text-slate-300"><span>{parameter.label}{parameter.required ? " *" : ""}</span><span className="font-mono text-[8px] uppercase text-slate-600">{parameter.location}</span></span><span className="mt-1 block text-[9px] leading-4 text-slate-600">{parameter.description}</span>{parameter.valueType === "boolean" ? <input type="checkbox" checked={Boolean(current)} onChange={(event) => onChange(event.target.checked)} className="mt-2" /> : parameter.allowedValues ? <select value={String(current)} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded border border-white/10 bg-[#050b11] px-2 py-2 text-xs"><option value="">Unset</option>{parameter.allowedValues.map((item) => <option key={item}>{item}</option>)}</select> : parameter.valueType === "json" ? <textarea value={typeof current === "string" ? current : JSON.stringify(current, null, 2)} onChange={(event) => onChange(event.target.value)} rows={4} className="mt-2 w-full rounded border border-white/10 bg-[#050b11] px-2 py-2 font-mono text-[10px] outline-none focus:border-cyan-300/30" /> : <input type={parameter.valueType === "number" ? "number" : "text"} value={Array.isArray(current) ? current.join(", ") : String(current)} onChange={(event) => onChange(parameter.valueType === "number" ? (event.target.value === "" ? "" : Number(event.target.value)) : parameter.valueType === "string-array" ? event.target.value.split(",").map((item) => item.trim()).filter(Boolean) : event.target.value)} className="mt-2 w-full rounded border border-white/10 bg-[#050b11] px-2 py-2 text-xs outline-none focus:border-cyan-300/30" />}</label>;
}

function validateWorkbench(endpoint: DeepgramEndpointDefinition, values: Record<string, unknown>, region: DeepgramRegion, file: File | null, inputMode: "url" | "file", openLabMode: boolean, advancedMode: boolean, confirmation: string) {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!endpoint.regionalSupport.includes(region)) errors.push(`${region.toUpperCase()} is not supported for this endpoint.`);
  for (const parameter of endpoint.parameters.filter((item) => item.required)) {
    if (parameter.name === "audio" || (endpoint.id === "stt-prerecorded" && parameter.name === "url" && inputMode === "file")) continue;
    if (values[parameter.name] === undefined || values[parameter.name] === "") errors.push(`${parameter.label} is required.`);
  }
  if (endpoint.id === "stt-prerecorded") {
    if (inputMode === "file" && !file) errors.push("Choose an audio file.");
    if (inputMode === "url" && !String(values.url ?? "").trim()) errors.push("Remote audio URL is required.");
    if (openLabMode && inputMode === "url" && values.url !== OPEN_LAB_PRERECORDED_URL) errors.push("Public Open Lab uses the curated sample URL.");
    if (openLabMode && inputMode === "file" && file && file.size > AUDIO_UPLOAD_LIMITS.hosted) errors.push(`Public Open Lab uploads are limited to ${Math.round(AUDIO_UPLOAD_LIMITS.hosted / 1024 / 1024)} MB.`);
  }
  const redactionValues = Array.isArray(values.redact) ? values.redact : [];
  if (redactionValues.length) {
    const mode = endpoint.id === "stt-live" ? "streaming" : "prerecorded";
    const compatibility = evaluateRedactionCompatibility({ deployment: "hosted", mode, language: String(values.language ?? "en"), projectSurface: endpoint.id === "stt-flux" ? "flux" : "listen" });
    if (!compatibility.supported) errors.push(compatibility.reason);
    warnings.push("Redaction changes transcript output only; the original audio remains unchanged.");
    const delayWarning = redactionNoDelayWarning(true, values.no_delay === true);
    if (delayWarning) warnings.push(delayWarning);
  }
  if (endpoint.id === "text-intelligence") {
    const hasText = Boolean(String(values.text ?? "").trim());
    const hasUrl = Boolean(String(values.url ?? "").trim());
    if (!hasText && !hasUrl) errors.push("Provide text or a text URL.");
    if (hasText && hasUrl) errors.push("Provide text or URL, not both.");
  }
  if (endpoint.riskTier === 3) {
    if (!advancedMode) errors.push("Advanced Administration Mode is off.");
    if (confirmation !== endpoint.confirmationPhrase) errors.push("The typed confirmation phrase does not match.");
    warnings.push("Mutation execution is locked in this release even when the preview is valid.");
  }
  if (endpoint.billable) warnings.push("Running this request may consume Deepgram credits.");
  if (endpoint.testedStatus === "manual-verification-required") warnings.push("Manual verification with your own key is required.");
  return { errors, warnings };
}

function buildEffectiveRequest(endpoint: DeepgramEndpointDefinition, values: Record<string, unknown>, region: DeepgramRegion, inputMode: "url" | "file", file: File | null): DeepgramEffectiveRequest {
  const pathValues = locationValues(endpoint, values, "path");
  const { path } = resolveDeepgramPath(endpoint, pathValues);
  const protocol = endpoint.protocol;
  const url = endpoint.id === "voice-agent-converse"
    ? new URL(DEEPGRAM_VOICE_AGENT_URL)
    : new URL(`${protocol}://${regionHost(region)}${path}`);
  for (const parameter of endpoint.parameters.filter((item) => item.location === "query")) {
    const value = values[parameter.name] ?? parameter.defaultValue;
    if (value === undefined || value === "" || value === false) continue;
    if (Array.isArray(value)) value.forEach((item) => url.searchParams.append(parameter.name, String(item)));
    else url.searchParams.set(parameter.name, String(value));
  }
  const body = locationValues(endpoint, values, "body");
  if (endpoint.id === "stt-prerecorded") {
    if (inputMode === "file") return { endpointId: endpoint.id, method: endpoint.method, protocol, sanitizedUrl: url.toString(), headers: { Authorization: "Configured (server only)", "Content-Type": file?.type || "audio/*" }, body: { file: file ? { name: file.name, size: file.size, type: file.type || "application/octet-stream" } : "No file selected" } };
    return { endpointId: endpoint.id, method: endpoint.method, protocol, sanitizedUrl: url.toString(), headers: { Authorization: "Configured (server only)", "Content-Type": "application/json" }, body: { url: body.url ?? "" } };
  }
  const stream = locationValues(endpoint, values, "stream");
  return { endpointId: endpoint.id, method: endpoint.method, protocol, sanitizedUrl: url.toString(), headers: { Authorization: endpoint.authenticationMode === "temporary-token" ? "Bearer temporary-token (not displayed)" : "Configured (server only)", ...(endpoint.method === "POST" || endpoint.method === "PUT" || endpoint.method === "PATCH" ? { "Content-Type": "application/json" } : {}) }, body: endpoint.protocol === "wss" ? stream : Object.keys(body).length ? parseJsonFields(endpoint, body) : null };
}

function buildExecutionInit(endpoint: DeepgramEndpointDefinition, values: Record<string, unknown>, region: DeepgramRegion, file: File | null, inputMode: "url" | "file", signal: AbortSignal): RequestInit {
  const path = locationValues(endpoint, values, "path");
  const query = locationValues(endpoint, values, "query", true);
  const body = parseJsonFields(endpoint, locationValues(endpoint, values, "body"));
  const input = { endpointId: endpoint.id, expectedMethod: endpoint.method, region, path, query, body: endpoint.id === "stt-prerecorded" && inputMode === "url" ? { url: values.url } : body };
  if (endpoint.id === "stt-prerecorded" && inputMode === "file" && file) {
    const form = new FormData(); form.set("input", JSON.stringify({ ...input, body: null })); form.set("file", file);
    return { method: "POST", body: form, signal };
  }
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal };
}

function locationValues(endpoint: DeepgramEndpointDefinition, values: Record<string, unknown>, location: DeepgramParameterDefinition["location"], includeDefaults = false) {
  return Object.fromEntries(endpoint.parameters.filter((item) => item.location === location).flatMap((item) => {
    const value = values[item.name] ?? (includeDefaults ? item.defaultValue : undefined);
    return value === undefined || value === "" || value === false ? [] : [[item.name, value]];
  }));
}

function parseJsonFields(endpoint: DeepgramEndpointDefinition, body: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(body).map(([key, value]) => {
    const parameter = endpoint.parameters.find((item) => item.location === "body" && item.name === key);
    if (parameter?.valueType === "json" && typeof value === "string") {
      try { return [key, JSON.parse(value)]; } catch { return [key, value]; }
    }
    return [key, value];
  }));
}

export function buildApiStudioDefaultValues(initialConfiguration?: ApiStudioInitialConfiguration, openLabMode = false) {
  const values: Record<string, Record<string, unknown>> = Object.fromEntries(DEEPGRAM_ENDPOINT_REGISTRY.map((endpoint) => [endpoint.id, defaultsFor(endpoint, openLabMode)]));
  if (!initialConfiguration) return values;

  const operationId = OLD_ID_MAP[initialConfiguration.operationId] ?? initialConfiguration.operationId;
  const endpoint = getDeepgramEndpoint(operationId);
  if (!endpoint) return values;

  const allowed = new Set(endpoint.parameters
    .filter((parameter) => parameter.location !== "header" && parameter.valueType !== "binary")
    .map((parameter) => parameter.name));
  const candidates: Record<string, unknown> = {
    ...(initialConfiguration.values ?? {}),
    ...(initialConfiguration.model !== undefined ? { model: initialConfiguration.model } : {}),
    ...(initialConfiguration.language !== undefined ? { language: initialConfiguration.language } : {}),
    ...(initialConfiguration.redact !== undefined ? { redact: initialConfiguration.redact } : {}),
  };
  const accepted = Object.fromEntries(Object.entries(candidates)
    .filter(([name]) => allowed.has(name))
    .map(([name, value]) => [name, sanitizePrefillValue(value)]));
  values[endpoint.id] = { ...values[endpoint.id], ...accepted };
  if (openLabMode && endpoint.id === "stt-prerecorded") values[endpoint.id].url = OPEN_LAB_PRERECORDED_URL;
  return values;
}

function sanitizePrefillValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[nested content omitted]";
  if (typeof value === "string") return sanitizeSnippet(value).slice(0, 20_000);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizePrefillValue(item, depth + 1));
  if (!value || typeof value !== "object") return "[unsupported value omitted]";
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 100).map(([key, child]) => {
    const sensitive = /(?:authorization|api[_-]?key|access[_-]?token|client[_-]?secret|password|cookie)/i.test(key);
    return [key.slice(0, 120), sensitive ? "[REDACTED]" : sanitizePrefillValue(child, depth + 1)];
  }));
}

function PrefillSummary({ configuration }: { configuration: ApiStudioInitialConfiguration }) {
  const endpointId = OLD_ID_MAP[configuration.operationId] ?? configuration.operationId;
  const endpoint = getDeepgramEndpoint(endpointId);
  const allowed = new Set(endpoint?.parameters
    .filter((parameter) => parameter.location !== "header" && parameter.valueType !== "binary")
    .map((parameter) => parameter.name) ?? []);
  const candidates = [
    ...Object.keys(configuration.values ?? {}),
    ...(configuration.model !== undefined ? ["model"] : []),
    ...(configuration.language !== undefined ? ["language"] : []),
    ...(configuration.redact !== undefined ? ["redact"] : []),
  ];
  const accepted = candidates.filter((name, index) => allowed.has(name) && candidates.indexOf(name) === index);
  const rejected = candidates.filter((name, index) => !allowed.has(name) && candidates.indexOf(name) === index);
  const reportedTransferred = normalizePrefillLabels(configuration.transferredFields ?? []);
  const acceptedLabels = reportedTransferred.filter((label) => accepted.some((name) => label === name || label.endsWith(`.${name}`)));
  const rejectedLabels = reportedTransferred.filter((label) => !acceptedLabels.includes(label));
  const transferred = acceptedLabels.length ? acceptedLabels : normalizePrefillLabels(accepted);
  const notTransferred = normalizePrefillLabels([...(configuration.notTransferred ?? []), ...rejected, ...rejectedLabels]);
  const sourceArtifactId = configuration.sourceArtifactId ? safePrefillLabel(configuration.sourceArtifactId) : "";
  const sourceDiagnosisId = configuration.sourceDiagnosisId ? safePrefillLabel(configuration.sourceDiagnosisId) : "";
  return <section className="rounded-lg border border-violet-300/20 bg-violet-300/[.05] p-3" data-testid="api-studio-prefill-summary">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-semibold text-violet-100">Technical evidence prefill</p><p className="mt-1 text-[10px] leading-4 text-slate-400">Supported, redacted values were copied into this form. No request ran and no confirmation was supplied.</p></div><div className="flex flex-wrap gap-1">{sourceArtifactId ? <span className="rounded border border-white/10 px-2 py-1 font-mono text-[9px] text-slate-500">Artifact {sourceArtifactId}</span> : null}{sourceDiagnosisId ? <span className="rounded border border-white/10 px-2 py-1 font-mono text-[9px] text-slate-500">Diagnosis {sourceDiagnosisId}</span> : null}</div></div>
    <PrefillFieldList label="Transferred" values={transferred} empty="No registry-supported values were transferred." />
    <PrefillFieldList label="Not transferred" values={notTransferred} empty="No omitted fields were reported." tone="amber" />
  </section>;
}

function PrefillFieldList({ label, values, empty, tone = "cyan" }: { label: string; values: string[]; empty: string; tone?: "cyan" | "amber" }) {
  return <div className="mt-2"><p className="text-[9px] font-bold uppercase tracking-[.14em] text-slate-500">{label}</p>{values.length ? <div className="mt-1 flex flex-wrap gap-1">{values.map((value) => <span key={`${label}:${value}`} className={`rounded border px-1.5 py-0.5 font-mono text-[9px] ${tone === "amber" ? "border-amber-300/15 text-amber-200/75" : "border-cyan-300/15 text-cyan-100/75"}`}>{value}</span>)}</div> : <p className="mt-1 text-[10px] text-slate-600">{empty}</p>}</div>;
}

function normalizePrefillLabels(values: readonly string[]) {
  return [...new Set(values.map(safePrefillLabel).filter(Boolean))].slice(0, 24);
}

function safePrefillLabel(value: string) {
  return sanitizeSnippet(value).replace(/[\r\n\t]+/g, " ").trim().slice(0, 160);
}
function defaultsFor(endpoint: DeepgramEndpointDefinition, openLabMode = false) { return { ...Object.fromEntries(endpoint.parameters.flatMap((item) => item.defaultValue === undefined ? [] : [[item.name, item.defaultValue]])), ...(openLabMode && endpoint.id === "stt-prerecorded" ? { url: OPEN_LAB_PRERECORDED_URL } : {}) }; }
function showParameter(parameter: DeepgramParameterDefinition, endpoint: DeepgramEndpointDefinition, inputMode: "url" | "file", openLabMode = false) { if (parameter.valueType === "binary" || parameter.location === "header") return false; if (endpoint.id === "stt-prerecorded" && parameter.name === "url") return inputMode === "url" && !openLabMode; return true; }
function normalizeTokenResult(raw: Record<string, unknown>, status: number, request: DeepgramEffectiveRequest): RunResult { const ok = status >= 200 && status < 300 && typeof raw.access_token === "string" && typeof raw.expires_in === "number"; return { ok, status, request, response: { headers: { "cache-control": "no-store" }, body: ok ? { access_token: "Temporary token issued (not displayed)", expires_in: raw.expires_in } : undefined }, error: !ok && raw.error && typeof raw.error === "object" ? raw.error as RunResult["error"] : undefined }; }
function readAudioResult(result: RunResult | null) { const body = result?.response?.body; if (!body || typeof body !== "object" || Array.isArray(body)) return null; const record = body as Record<string, unknown>; return record.kind === "audio" && typeof record.base64 === "string" && typeof record.contentType === "string" ? record as { kind: "audio"; base64: string; contentType: string; byteLength: number } : null; }
function sanitizeExperimentValues(values: Record<string, unknown>) { return Object.fromEntries(Object.entries(values).filter(([key]) => !/token|key|authorization|audio|text|url/i.test(key)).map(([key, value]) => [key, value])); }
function readStoredExperiments() { try { const value = JSON.parse(window.localStorage.getItem(EXPERIMENT_KEY) ?? "[]"); return Array.isArray(value) ? value : []; } catch { return []; } }
function event(label: string, detail?: string): TimelineEvent { return { at: new Date().toISOString(), label, detail }; }
function capabilityStatusLabel(endpoint: DeepgramEndpointDefinition) { if (endpoint.hostedExecution?.state === "unavailable") return endpoint.hostedExecution.label; if (endpoint.testedStatus === "fixture-verified") return "Fixture-verified"; if (endpoint.testedStatus === "locked-by-design") return "Locked by design"; return "Manual verification required"; }
function capabilityStatusTone(endpoint: DeepgramEndpointDefinition): "amber" | "green" | "rose" { if (endpoint.hostedExecution?.state === "unavailable") return "amber"; if (endpoint.testedStatus === "fixture-verified") return "green"; if (endpoint.testedStatus === "locked-by-design") return "rose"; return "amber"; }
function codeLabWorkflow(endpoint: DeepgramEndpointDefinition): CodeLabWorkflowId { if (endpoint.id === "stt-prerecorded") return "transcribe-url"; if (endpoint.id === "stt-live" || endpoint.id === "stt-flux") return "live-mic"; if (endpoint.id.startsWith("tts")) return "tts"; if (endpoint.id === "text-intelligence") return "text-intelligence"; if (endpoint.id === "auth-token-grant") return "temporary-token"; if (endpoint.id.startsWith("voice-agent") || endpoint.id.startsWith("agent-")) return "voice-agent"; return "trusted-voice"; }
function openPrimaryHandoff(endpoint: DeepgramEndpointDefinition, openModule: (id: LabModuleId) => void, openCodeLab: (id: CodeLabWorkflowId) => void) { if (endpoint.id === "stt-live" || endpoint.id === "stt-flux") openModule("live-mic"); else if (endpoint.id === "tts-streaming") openModule("tts"); else if (endpoint.id === "voice-agent-converse") openCodeLab("voice-agent"); else openCodeLab(codeLabWorkflow(endpoint)); }
function initialRealtimeSession(id: string): RealtimeSessionState | null {
  if (getDeepgramEndpoint(id)?.hostedExecution?.state === "unavailable") return null;
  const protocol: RealtimeProtocol | null = id === "stt-live"
    ? "live_stt"
    : id === "stt-flux"
      ? "flux"
      : id === "tts-streaming"
        ? "streaming_tts"
        : id === "voice-agent-converse"
          ? "voice_agent"
          : null;
  return protocol ? createRealtimeSession(protocol, `${id}-idle`) : null;
}

function HealthSummary({ health }: { health: Record<string, unknown> }) { const configured = Boolean(health.configured); const authenticated = Boolean(health.authenticated); const project = health.currentProject && typeof health.currentProject === "object" ? health.currentProject as { name?: unknown } : null; return <div className="mt-2 grid grid-cols-2 gap-1 text-[8px] text-slate-500"><span>Configured: {configured ? "yes" : "no"}</span><span>Authenticated: {authenticated ? "yes" : "no"}</span><span>Server-isolated: {health.serverIsolated ? "yes" : "unknown"}</span><span>Browser exposure: {health.browserExposureCheck === "passed" ? "none detected" : "check failed"}</span><span>Project: {typeof project?.name === "string" ? project.name : "unresolved"}</span><span>Region: {String(health.region ?? "global")}</span><span className="col-span-2">Capabilities: {Array.isArray(health.detectedCapabilities) ? health.detectedCapabilities.join(", ") || "none detected" : "unknown"}</span><span className="col-span-2">Live execution: {health.liveExecutionEnabled ? "enabled" : "disabled"}</span></div>; }
function StatusDot({ endpoint }: { endpoint: DeepgramEndpointDefinition }) { const tone = endpoint.testedStatus === "locked-by-design" ? "bg-rose-400" : endpoint.testedStatus === "manual-verification-required" ? "bg-amber-300" : "bg-emerald-400"; return <span className={`size-1.5 rounded-full ${tone}`} title={capabilityStatusLabel(endpoint)} />; }
function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "amber" | "green" | "rose" }) { const style = tone === "amber" ? "border-amber-300/20 text-amber-200" : tone === "green" ? "border-emerald-300/20 text-emerald-200" : tone === "rose" ? "border-rose-300/20 text-rose-200" : "border-white/10 text-slate-400"; return <span className={`rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase ${style}`}>{children}</span>; }
function InfoCard({ label, value }: { label: string; value: string }) { return <div className="rounded border border-white/10 bg-black/20 p-2"><p className="text-[8px] font-bold uppercase tracking-[.14em] text-slate-600">{label}</p><p className="mt-1 text-[11px] capitalize text-slate-300">{value}</p></div>; }
function Notice({ children }: { children: React.ReactNode }) { return <div className="rounded border border-cyan-300/15 bg-cyan-300/[.035] px-3 py-2 text-[10px] leading-4 text-cyan-100/70">{children}</div>; }
function SectionTitle({ title, detail }: { title: string; detail: string }) { return <div className="mb-2"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">{title}</p><p className="mt-1 text-[10px] text-slate-600">{detail}</p></div>; }
function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} className={`rounded border px-3 py-2 text-[10px] ${active ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100" : "border-white/10 text-slate-500"}`}>{children}</button>; }
function Action({ children, onClick, primary = false, disabled = false, shortcutCommand, shortcutLabel, disabledReason, describedBy }: { children: React.ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean; shortcutCommand?: string; shortcutLabel?: string; disabledReason?: string; describedBy?: string }) { return <button type="button" onClick={onClick} disabled={disabled} aria-describedby={describedBy} data-shortcut-command={shortcutCommand} data-shortcut-label={shortcutLabel} data-shortcut-disabled-reason={disabledReason} className={`rounded border px-2.5 py-1.5 text-[9px] font-semibold disabled:cursor-not-allowed disabled:opacity-35 ${primary ? "border-cyan-200 bg-cyan-200 text-slate-950" : "border-white/10 bg-white/[.03] text-slate-300 hover:border-cyan-300/20"}`}>{children}</button>; }
function InspectorCard({ title, children }: { title: string; children: React.ReactNode }) { return <div className="rounded border border-white/10 bg-black/20 p-3 text-[11px] text-slate-300"><p className="mb-2 text-[8px] font-bold uppercase tracking-[.16em] text-slate-600">{title}</p>{children}</div>; }
function JsonBlock({ value }: { value: unknown }) { return <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded border border-white/10 bg-black/30 p-3 font-mono text-[10px] leading-5 text-slate-300">{JSON.stringify(value, null, 2)}</pre>; }
function Empty({ text }: { text: string }) { return <p className="rounded border border-dashed border-white/10 p-4 text-xs text-slate-600">{text}</p>; }
