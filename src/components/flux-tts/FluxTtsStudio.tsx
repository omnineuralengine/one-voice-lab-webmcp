"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

import {
  buildFluxBatchRequest,
  buildFluxExamples,
  createFluxTraceExport,
  fileExtensionForEncoding,
  FLUX_BATCH_FORMATS,
  getDefaultFluxFormat,
  sanitizeFluxMessage,
  type FluxBatchContainer,
  type FluxBatchEncoding,
  type FluxBatchRequest,
} from "@/lib/flux-tts-client";
import {
  CONNORS_PICKS,
  CONNORS_PICKS_TITLE,
  findFluxTtsVoice,
  FLUX_TTS_REGISTRY_VERIFIED_AT,
  FLUX_TTS_VOICES,
  type FluxTtsModel,
  type FluxTtsVoice,
} from "@/lib/flux-tts-registry";
import { createFlightRecorderEvent, type FlightRecorderEvent } from "@/lib/flight-recorder";
import { OmniWatermark } from "@/components/one";

const DEFAULT_TEXT = "Thanks for calling the Open Lab. How can I help you today?";

type RunMode = "single" | "compare" | null;

type AudioResult = {
  runId: string;
  model: FluxTtsModel;
  voiceName: string;
  url: string;
  contentType: string;
  requestId?: string;
  requestDurationMs: number;
  firstAudioReadyMs: number;
  audioDurationSeconds?: number;
  byteLength: number;
  createdAt: string;
  extension: string;
};

type FluxTtsStudioProps = {
  liveExecutionEnabled?: boolean;
};

export function FluxTtsStudio({ liveExecutionEnabled = true }: FluxTtsStudioProps) {
  const studioRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const sessionRevisionRef = useRef(0);
  const [query, setQuery] = useState("");
  const [favoriteModels, setFavoriteModels] = useState<Set<FluxTtsModel>>(() => new Set(CONNORS_PICKS.map((voice) => voice.model)));
  const [model, setModel] = useState<FluxTtsModel>("flux-cole-en");
  const [text, setText] = useState(DEFAULT_TEXT);
  const [comparisonText, setComparisonText] = useState(DEFAULT_TEXT);
  const [sameInputLocked, setSameInputLocked] = useState(true);
  const [transport, setTransport] = useState<"batch" | "streaming">("batch");
  const [encoding, setEncoding] = useState<FluxBatchEncoding>("mp3");
  const [container, setContainer] = useState<FluxBatchContainer | undefined>();
  const [sampleRate, setSampleRate] = useState<number | undefined>();
  const [runMode, setRunMode] = useState<RunMode>(null);
  const [error, setError] = useState<string | null>(null);
  const [primaryResult, setPrimaryResult] = useState<AudioResult | null>(null);
  const [compareCole, setCompareCole] = useState<AudioResult | null>(null);
  const [compareJack, setCompareJack] = useState<AudioResult | null>(null);
  const [events, setEvents] = useState<FlightRecorderEvent[]>([]);
  const [codeLanguage, setCodeLanguage] = useState<"curl" | "javascript" | "python">("curl");
  const [copied, setCopied] = useState(false);

  const selectedVoice = findFluxTtsVoice(model) ?? FLUX_TTS_VOICES[0];
  const activeFormat = FLUX_BATCH_FORMATS[encoding];
  const filteredVoices = useMemo(() => filterVoices(query), [query]);
  const visiblePicks = useMemo(() => filterVoiceList(CONNORS_PICKS, query), [query]);
  const isBusy = runMode !== null;

  const exampleRequest = useMemo(
    () => buildFluxBatchRequest({ text: "YOUR_TEXT", model, encoding, container, sampleRate }),
    [container, encoding, model, sampleRate],
  );
  const examples = useMemo(() => buildFluxExamples(exampleRequest), [exampleRequest]);

  const appendEvent = useCallback((event: FlightRecorderEvent) => {
    setEvents((current) => [...current.slice(-99), event]);
  }, []);

  useEffect(() => {
    return () => {
      sessionRevisionRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => () => revokeObjectUrl(primaryResult?.url), [primaryResult?.url]);
  useEffect(() => () => revokeObjectUrl(compareCole?.url), [compareCole?.url]);
  useEffect(() => () => revokeObjectUrl(compareJack?.url), [compareJack?.url]);

  function selectEncoding(nextEncoding: FluxBatchEncoding) {
    const defaults = getDefaultFluxFormat(nextEncoding);
    setEncoding(nextEncoding);
    setContainer(defaults.container);
    setSampleRate(defaults.sampleRate);
  }

  function toggleFavorite(nextModel: FluxTtsModel) {
    setFavoriteModels((current) => {
      const next = new Set(current);
      if (next.has(nextModel)) next.delete(nextModel);
      else next.add(nextModel);
      return next;
    });
  }

  function stop() {
    const activeRequestAborted = Boolean(controllerRef.current);
    sessionRevisionRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    studioRef.current?.querySelectorAll("audio").forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
    setRunMode(null);
    appendEvent(createFlightRecorderEvent({
      localRunId: createRunId(),
      module: "Flux TTS Studio",
      transport,
      model,
      eventType: "client.stop",
      source: "browser",
      provenance: "measured",
      payload: { activeRequestAborted, playbackStopped: true },
    }));
  }

  function clear() {
    sessionRevisionRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    studioRef.current?.querySelectorAll("audio").forEach((audio) => audio.pause());
    setText("");
    setComparisonText("");
    setRunMode(null);
    setError(null);
    setPrimaryResult(null);
    setCompareCole(null);
    setCompareJack(null);
    setEvents([]);
  }

  async function generate() {
    if (!text.trim() || isBusy || controllerRef.current !== null || transport !== "batch" || !liveExecutionEnabled) return;
    const controller = new AbortController();
    const revision = sessionRevisionRef.current;
    controllerRef.current = controller;
    setRunMode("single");
    setError(null);

    try {
      const request = buildFluxBatchRequest({ text, model, encoding, container, sampleRate });
      const result = await requestAudio({ request, signal: controller.signal, appendEvent: (event) => {
        if (sessionRevisionRef.current === revision) appendEvent(event);
      } });
      if (controllerRef.current === controller && sessionRevisionRef.current === revision) {
        setPrimaryResult(result);
      } else {
        revokeObjectUrl(result.url);
      }
    } catch (requestError) {
      if (controllerRef.current === controller && sessionRevisionRef.current === revision && !isAbortError(requestError)) {
        setError(sanitizeFluxMessage(getErrorMessage(requestError)));
      }
    } finally {
      if (controllerRef.current === controller && sessionRevisionRef.current === revision) {
        controllerRef.current = null;
        setRunMode(null);
      }
    }
  }

  async function compare() {
    if (!text.trim() || isBusy || controllerRef.current !== null || transport !== "batch" || !liveExecutionEnabled) return;
    const coleText = text;
    const jackText = sameInputLocked ? text : comparisonText;
    if (!jackText.trim()) {
      setError("Enter comparison text for Jack, or turn on the same-input lock.");
      return;
    }

    const controller = new AbortController();
    const revision = sessionRevisionRef.current;
    controllerRef.current = controller;
    setRunMode("compare");
    setError(null);
    setCompareCole(null);
    setCompareJack(null);

    try {
      const guardedAppend = (event: FlightRecorderEvent) => {
        if (sessionRevisionRef.current === revision) appendEvent(event);
      };
      const cole = await requestAudio({ request: buildFluxBatchRequest({ text: coleText, model: "flux-cole-en", encoding, container, sampleRate }), signal: controller.signal, appendEvent: guardedAppend });
      if (controllerRef.current !== controller || sessionRevisionRef.current !== revision) {
        revokeObjectUrl(cole.url);
        return;
      }
      setCompareCole(cole);
      const jack = await requestAudio({ request: buildFluxBatchRequest({ text: jackText, model: "flux-jack-en", encoding, container, sampleRate }), signal: controller.signal, appendEvent: guardedAppend });
      if (controllerRef.current === controller && sessionRevisionRef.current === revision) {
        setCompareJack(jack);
      } else {
        revokeObjectUrl(jack.url);
      }
    } catch (requestError) {
      if (controllerRef.current === controller && sessionRevisionRef.current === revision && !isAbortError(requestError)) {
        setError(sanitizeFluxMessage(getErrorMessage(requestError)));
      }
    } finally {
      if (controllerRef.current === controller && sessionRevisionRef.current === revision) {
        controllerRef.current = null;
        setRunMode(null);
      }
    }
  }

  function exportTrace() {
    const artifact = createFluxTraceExport({
      events,
      model,
      encoding,
      container,
      sampleRate,
      textLength: text.length,
    });
    downloadJson(artifact, `flux-tts-trace-${new Date().toISOString().replaceAll(":", "-")}.json`);
  }

  async function copyExample() {
    await navigator.clipboard.writeText(examples[codeLanguage]);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  function recordAudioMetadata(result: AudioResult, duration: number) {
    if (!Number.isFinite(duration)) return;
    updateAudioDuration(result.runId, duration, setPrimaryResult, setCompareCole, setCompareJack);
    appendEvent(createFlightRecorderEvent({
      localRunId: result.runId,
      module: "Flux TTS Studio",
      transport: "batch",
      model: result.model,
      eventType: "audio.metadata",
      source: "browser",
      provenance: "measured",
      requestId: result.requestId,
      payload: { audioDurationSeconds: round(duration), contentType: result.contentType },
    }));
  }

  function recordPlayback(result: AudioResult) {
    appendEvent(createFlightRecorderEvent({
      localRunId: result.runId,
      module: "Flux TTS Studio",
      transport: "batch",
      model: result.model,
      eventType: "audio.playback.started",
      source: "browser",
      provenance: "measured",
      requestId: result.requestId,
      payload: { userInitiatedPlayback: true },
    }));
  }

  return (
    <div ref={studioRef} data-testid="flux-tts-studio" className="h-full min-h-0 overflow-auto bg-[#03060a] text-slate-100">
      <OmniWatermark />
      <section className="border-b border-white/10 bg-[#070b11] px-4 py-4" aria-labelledby="flux-tts-title">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em]">
              <span className="rounded-full border border-amber-300/25 bg-amber-300/[0.08] px-2 py-1 text-amber-100">Lab Early Access</span>
              <span className="rounded-full border border-[color:var(--one-purple,#9966cc)]/30 bg-[color:var(--one-purple,#9966cc)]/10 px-2 py-1 text-[var(--one-purple-text,#d9b8ff)]">/v2/speak</span>
              <span className="rounded-full border border-white/10 px-2 py-1 text-slate-400">Catalog checked {FLUX_TTS_REGISTRY_VERIFIED_AT}</span>
            </div>
            <h2 id="flux-tts-title" className="mt-3 text-2xl font-semibold text-white">Flux TTS Studio</h2>
            <p className="mt-1 text-sm text-slate-300">Voice-agent-first synthesis over /v2/speak</p>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">Choose a documented voice, make one explicit batch request, then compare measured browser timing without recording your input text in the flight recorder.</p>
          </div>
          <dl className="grid min-w-[220px] grid-cols-2 gap-2 text-xs">
            <StatusMetric label="Execution" value={liveExecutionEnabled ? "Live enabled" : "Provider disabled"} tone={liveExecutionEnabled ? "green" : "amber"} />
            <StatusMetric label="Transport" value="Batch REST" tone="purple" />
          </dl>
        </div>
      </section>

      {!liveExecutionEnabled ? (
        <div role="status" className="mx-4 mt-4 rounded-lg border border-amber-300/25 bg-amber-300/[0.06] px-3 py-2 text-xs leading-5 text-amber-100">
          Live Deepgram execution is disabled by the private Open Lab switch. The gallery, format guide, and sanitized examples remain available.
        </div>
      ) : null}

      <div className="grid min-h-[680px] gap-3 p-3 xl:grid-cols-[260px_minmax(390px,1fr)_340px]">
        <aside className="min-h-0 rounded-xl border border-white/10 bg-[#080c12] p-3 xl:overflow-hidden" aria-label="Flux voice gallery">
          <div className="flex h-full min-h-0 flex-col">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--one-purple-text,#d9b8ff)]">Voice gallery</p>
              <label className="mt-3 block">
                <span className="sr-only">Search Flux voices</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search name, accent, character…"
                  className={fieldClassName}
                />
              </label>
            </div>

            <div className="mt-3 min-h-0 space-y-4 xl:overflow-y-auto xl:pr-1">
              {visiblePicks.length > 0 ? (
                <VoiceGroup title={CONNORS_PICKS_TITLE} note="A user preference group—not a model name.">
                  {visiblePicks.map((voice) => (
                    <VoiceCard key={`pick-${voice.model}`} voice={voice} selected={model === voice.model} favorite={favoriteModels.has(voice.model)} onSelect={setModel} onToggleFavorite={toggleFavorite} />
                  ))}
                </VoiceGroup>
              ) : null}

              <VoiceGroup title={`All voices · ${filteredVoices.length}`} note="Current documented catalog filtered by the lab execution policy.">
                {filteredVoices.length > 0 ? filteredVoices.map((voice) => (
                  <VoiceCard key={voice.model} voice={voice} selected={model === voice.model} favorite={favoriteModels.has(voice.model)} onSelect={setModel} onToggleFavorite={toggleFavorite} />
                )) : <p className="rounded-lg border border-dashed border-white/10 p-3 text-xs text-slate-500">No voices match this search.</p>}
              </VoiceGroup>
            </div>
          </div>
        </aside>

        <section className="min-w-0 space-y-3" aria-label="Flux synthesis workspace">
          <section className="rounded-xl border border-white/10 bg-[#080c12] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--one-purple-text,#d9b8ff)]">Synthesis workspace</p>
                <h3 className="mt-1 text-lg font-semibold text-white">Compose one controlled request</h3>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="rounded-full border border-white/10 px-2 py-1 font-mono text-[10px] text-slate-400">{selectedVoice.model}</span>
                <ActionButton primary onClick={() => void generate()} disabled={!text.trim() || isBusy || transport !== "batch" || !liveExecutionEnabled} testId="flux-generate">
                  {runMode === "single" ? "Generating…" : "Generate / Speak"}
                </ActionButton>
              </div>
            </div>

            <div className="mt-4 grid gap-4">
              <label>
                <span className={labelClassName}>Text</span>
                <textarea
                  value={text}
                  onChange={(event) => {
                    setText(event.target.value);
                    if (sameInputLocked) setComparisonText(event.target.value);
                  }}
                  rows={6}
                  maxLength={2_000}
                  className={`${fieldClassName} min-h-36 resize-y py-3 leading-6`}
                  data-testid="flux-text"
                />
                <span className="mt-1 flex justify-between text-[10px] text-slate-500"><span>Input is sent only after an explicit action.</span><span>{text.length}/2000</span></span>
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className={labelClassName}>Voice</span>
                  <select value={model} onChange={(event) => setModel(event.target.value as FluxTtsModel)} className={fieldClassName} data-testid="flux-voice-select">
                    {FLUX_TTS_VOICES.map((voice) => <option key={voice.model} value={voice.model}>{voice.displayName} · {voice.model}</option>)}
                  </select>
                </label>
                <label>
                  <span className={labelClassName}>Transport</span>
                  <select value={transport} onChange={(event) => setTransport(event.target.value as "batch" | "streaming")} className={fieldClassName}>
                    <option value="batch">Batch REST · enabled</option>
                    <option value="streaming" disabled>Streaming · verification required</option>
                  </select>
                </label>
              </div>

              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <label>
                    <span className={labelClassName}>Encoding</span>
                    <select value={encoding} onChange={(event) => selectEncoding(event.target.value as FluxBatchEncoding)} className={fieldClassName} data-testid="flux-encoding">
                      {(Object.entries(FLUX_BATCH_FORMATS) as Array<[FluxBatchEncoding, (typeof FLUX_BATCH_FORMATS)[FluxBatchEncoding]]>).map(([value, format]) => <option key={value} value={value}>{format.label}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className={labelClassName}>Container</span>
                    <select value={container ?? "automatic"} disabled={activeFormat.containers.length === 0} onChange={(event) => setContainer(event.target.value as FluxBatchContainer)} className={fieldClassName}>
                      {activeFormat.containers.length === 0 ? <option value="automatic">Documented default</option> : Array.from(activeFormat.containers).map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className={labelClassName}>Sample rate</span>
                    <select value={sampleRate ?? "fixed"} disabled={activeFormat.sampleRates.length === 0} onChange={(event) => setSampleRate(Number(event.target.value))} className={fieldClassName}>
                      {activeFormat.sampleRates.length === 0 ? <option value="fixed">Documented fixed/default</option> : Array.from(activeFormat.sampleRates).map((value) => <option key={value} value={value}>{value} Hz</option>)}
                    </select>
                  </label>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-slate-500">{activeFormat.note}</p>
              </div>

              <div role="note" className="rounded-lg border border-amber-300/20 bg-amber-300/[0.05] p-3 text-xs leading-5 text-amber-50">
                <strong>Streaming: Experimental — deployment verification required.</strong> The documented browser auth and raw-audio path are not enabled here until they are proven in the deployed environment. This studio does not imitate streaming with delayed batch audio.
              </div>

              {primaryResult ? <AudioResultCard title={`${primaryResult.voiceName} output`} result={primaryResult} onMetadata={recordAudioMetadata} onPlaying={recordPlayback} /> : (
                <div className="rounded-lg border border-dashed border-white/10 p-5 text-center">
                  <p className="text-sm font-semibold text-slate-300">No batch audio yet</p>
                  <p className="mt-1 text-xs text-slate-500">Choose a voice and generate when you are ready.</p>
                </div>
              )}

              {error ? <p role="alert" className="rounded-lg border border-rose-300/25 bg-rose-300/[0.06] p-3 text-xs leading-5 text-rose-100">{error}</p> : null}

              <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
                <ActionButton onClick={stop} disabled={!isBusy && !primaryResult && !compareCole && !compareJack}>Stop</ActionButton>
                <ActionButton onClick={clear} testId="flux-clear">Clear</ActionButton>
                {primaryResult ? <a href={primaryResult.url} download={`flux-${primaryResult.model}.${primaryResult.extension}`} className={secondaryButtonClassName}>Download batch output</a> : null}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-[#080c12] p-4" aria-labelledby="flux-compare-title">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--one-green-text,#62d8ad)]">A/B compare</p>
                <h3 id="flux-compare-title" className="mt-1 text-lg font-semibold text-white">Cole versus Jack</h3>
              </div>
              <label className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 text-xs text-slate-300">
                <input type="checkbox" checked={sameInputLocked} onChange={(event) => {
                  setSameInputLocked(event.target.checked);
                  if (event.target.checked) setComparisonText(text);
                }} className="size-4 accent-[var(--one-purple,#9966cc)]" data-testid="flux-same-input-lock" />
                Same input lock
              </label>
            </div>
            {!sameInputLocked ? (
              <label className="mt-3 block">
                <span className={labelClassName}>Jack comparison text</span>
                <textarea value={comparisonText} onChange={(event) => setComparisonText(event.target.value)} rows={3} maxLength={2_000} className={`${fieldClassName} resize-y py-3`} />
              </label>
            ) : <p className="mt-3 text-xs text-slate-500">Both requests use the exact text above. The action label makes the two-request cost explicit.</p>}

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <CompareSlot title="A · Cole" model="flux-cole-en" result={compareCole} onMetadata={recordAudioMetadata} onPlaying={recordPlayback} />
              <CompareSlot title="B · Jack" model="flux-jack-en" result={compareJack} onMetadata={recordAudioMetadata} onPlaying={recordPlayback} />
            </div>
            <div className="mt-4">
              <ActionButton primary onClick={() => void compare()} disabled={!text.trim() || (!sameInputLocked && !comparisonText.trim()) || isBusy || !liveExecutionEnabled} testId="flux-ab-compare">
                {runMode === "compare" ? "Running A/B…" : "Run Cole + Jack A/B · 2 requests"}
              </ActionButton>
            </div>
          </section>
        </section>

        <aside className="min-h-0 rounded-xl border border-white/10 bg-[#080c12] p-3 xl:overflow-hidden" aria-label="Flux inspector and flight recorder">
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--one-purple-text,#d9b8ff)]">Inspector / flight recorder</p>
                <h3 className="mt-1 text-base font-semibold text-white">Sanitized session evidence</h3>
              </div>
              <button type="button" onClick={exportTrace} disabled={events.length === 0} className={secondaryButtonClassName} data-testid="flux-export-trace">Export trace</button>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-2">
              <StatusMetric label="State" value={runMode ? "Running" : error ? "Error" : primaryResult ? "Complete" : "Idle"} tone={error ? "amber" : runMode ? "purple" : primaryResult ? "green" : "neutral"} />
              <StatusMetric label="Transport" value="batch" tone="purple" />
              <StatusMetric label="Model" value={model} tone="neutral" />
              <StatusMetric label="Events" value={String(events.length)} tone="neutral" />
            </dl>

            <div className="mt-3 rounded-lg border border-white/10 bg-black/25 p-3">
              <p className={labelClassName}>Sanitized request</p>
              <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-5 text-slate-300" data-testid="flux-sanitized-request">{JSON.stringify({
                transport: "batch",
                model,
                encoding,
                container: container ?? "documented default",
                sampleRate: sampleRate ?? "documented fixed/default",
                text: "***not recorded***",
                textLength: text.length,
                redactionState: "sanitized",
              }, null, 2)}</pre>
            </div>

            <div className="mt-3 min-h-36 flex-1 overflow-y-auto rounded-lg border border-white/10 bg-black/25 p-2" data-testid="flux-flight-recorder">
              {events.length === 0 ? <p className="p-2 text-xs leading-5 text-slate-500">Run a batch request to record sanitized browser and application-route lifecycle events. Streaming server messages appear only after deployment verification.</p> : (
                <ol className="space-y-2">
                  {[...events].reverse().map((event, index) => (
                    <li key={`${event.localRunId}-${event.eventType}-${event.timestamp}-${index}`} className="rounded-md border border-white/10 bg-white/[0.025] p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-[10px] text-[var(--one-green-text,#62d8ad)]">{event.eventType}</span>
                        <span className="text-[9px] text-slate-600">{formatTime(event.timestamp)}</span>
                      </div>
                      <p className="mt-1 break-all text-[10px] leading-4 text-slate-400">{event.model} · {event.provenance}{event.durationMs !== undefined ? ` · ${Math.round(event.durationMs)} ms` : ""}</p>
                      {event.requestId ? <p className="mt-1 break-all font-mono text-[9px] text-slate-500">request {event.requestId}</p> : null}
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="mt-3 rounded-lg border border-white/10 bg-black/25 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-1" role="tablist" aria-label="Generated example language">
                  {(["curl", "javascript", "python"] as const).map((language) => (
                    <button key={language} type="button" role="tab" aria-selected={codeLanguage === language} onClick={() => setCodeLanguage(language)} className={`min-h-9 rounded px-2 text-[10px] font-semibold uppercase ${codeLanguage === language ? "bg-[var(--one-purple,#9966cc)] text-white" : "text-slate-500 hover:bg-white/[0.05] hover:text-slate-300"}`}>{language === "javascript" ? "JS" : language}</button>
                  ))}
                </div>
                <button type="button" onClick={() => void copyExample()} className={secondaryButtonClassName}>{copied ? "Copied" : "Copy"}</button>
              </div>
              <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded bg-[#03060a] p-2 font-mono text-[9px] leading-4 text-slate-300" data-testid="flux-generated-code">{examples[codeLanguage]}</pre>
              <p className="mt-2 text-[10px] leading-4 text-slate-500">Examples call the guarded application route. Credential references are placeholders only and remain server-side.</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

async function requestAudio(input: {
  request: FluxBatchRequest;
  signal: AbortSignal;
  appendEvent: (event: FlightRecorderEvent) => void;
}): Promise<AudioResult> {
  const localRunId = createRunId();
  const startedAt = performance.now();
  const voice = findFluxTtsVoice(input.request.model);
  let requestId: string | undefined;

  input.appendEvent(createFlightRecorderEvent({
    localRunId,
    module: "Flux TTS Studio",
    transport: "batch",
    model: input.request.model,
    eventType: "request.started",
    source: "browser",
    provenance: "measured",
    payload: sanitizedRequestPayload(input.request),
  }));

  try {
    const response = await fetch("/api/deepgram/flux-tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input.request),
      cache: "no-store",
      signal: input.signal,
    });
    const headersAt = performance.now();
    requestId = getSafeRequestId(response.headers);

    input.appendEvent(createFlightRecorderEvent({
      localRunId,
      module: "Flux TTS Studio",
      transport: "batch",
      model: input.request.model,
      eventType: "application-route.response",
      source: "application route",
      provenance: "measured",
      durationMs: headersAt - startedAt,
      requestId,
      payload: {
        status: response.status,
        contentType: response.headers.get("content-type") ?? "unavailable",
        cacheControl: response.headers.get("cache-control") ?? "unavailable",
      },
    }));

    if (!response.ok) {
      const body = await readSafeError(response);
      requestId ??= body.requestId;
      throw new Error(body.message);
    }

    const contentType = response.headers.get("content-type")?.split(";")[0] || "application/octet-stream";
    const blob = await response.blob();
    const completedAt = performance.now();
    const durationMs = completedAt - startedAt;
    const url = URL.createObjectURL(blob);

    input.appendEvent(createFlightRecorderEvent({
      localRunId,
      module: "Flux TTS Studio",
      transport: "batch",
      model: input.request.model,
      eventType: "audio.ready",
      source: "browser",
      provenance: "measured",
      durationMs,
      requestId,
      payload: {
        firstAudioReadyMs: round(durationMs),
        requestDurationMs: round(durationMs),
        contentType,
        byteLength: blob.size,
        note: "Batch audio became observable after the response body completed; this is browser-measured, not provider-reported.",
      },
    }));

    return {
      runId: localRunId,
      model: input.request.model,
      voiceName: voice?.displayName ?? input.request.model,
      url,
      contentType,
      requestId,
      requestDurationMs: round(durationMs),
      firstAudioReadyMs: round(durationMs),
      byteLength: blob.size,
      createdAt: new Date().toISOString(),
      extension: fileExtensionForEncoding(input.request.encoding, input.request.container),
    };
  } catch (error) {
    const durationMs = performance.now() - startedAt;
    input.appendEvent(createFlightRecorderEvent({
      localRunId,
      module: "Flux TTS Studio",
      transport: "batch",
      model: input.request.model,
      eventType: isAbortError(error) ? "request.aborted" : "request.failed",
      source: "browser",
      provenance: "measured",
      durationMs,
      requestId,
      payload: { message: isAbortError(error) ? "Request stopped by the user." : sanitizeFluxMessage(getErrorMessage(error)) },
    }));
    throw error;
  }
}

function VoiceGroup({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-semibold text-white">{title}</h3>
      <p className="mt-1 text-[10px] leading-4 text-slate-500">{note}</p>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}

function VoiceCard({ voice, selected, favorite, onSelect, onToggleFavorite }: {
  voice: FluxTtsVoice;
  selected: boolean;
  favorite: boolean;
  onSelect: (model: FluxTtsModel) => void;
  onToggleFavorite: (model: FluxTtsModel) => void;
}) {
  return (
    <article className={`rounded-lg border p-3 transition ${selected ? "border-[var(--one-purple,#9966cc)] bg-[color:var(--one-purple,#9966cc)]/[0.09]" : "border-white/10 bg-black/20 hover:border-white/20"}`} data-model={voice.model}>
      <div className="flex items-start gap-2">
        <button type="button" onClick={() => onSelect(voice.model as FluxTtsModel)} className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--one-purple-text,#d9b8ff)]">
          <span className="flex items-center justify-between gap-2"><strong className="text-sm text-white">{voice.displayName}</strong>{selected ? <span className="text-[9px] font-bold uppercase text-[var(--one-purple-text,#d9b8ff)]">Selected</span> : null}</span>
          <span className="mt-1 block break-all font-mono text-[9px] text-slate-500">{voice.model}</span>
        </button>
        <button type="button" aria-pressed={favorite} aria-label={`${favorite ? "Remove" : "Add"} ${voice.displayName} ${favorite ? "from" : "to"} favorites`} onClick={() => onToggleFavorite(voice.model as FluxTtsModel)} className="flex size-10 shrink-0 items-center justify-center rounded-md border border-white/10 text-base text-amber-100 hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-[var(--one-purple-text,#d9b8ff)]">{favorite ? "★" : "☆"}</button>
      </div>
      <p className="mt-2 text-[10px] leading-4 text-slate-400">{voice.accent} · {voice.gender} · {voice.age}</p>
      <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-500">{voice.character.join(" · ")}</p>
      <div className="mt-2 flex flex-wrap gap-1"><span className="rounded border border-amber-300/15 px-1.5 py-0.5 text-[8px] font-semibold uppercase text-amber-100">Lab EA</span><span className="rounded border border-white/10 px-1.5 py-0.5 text-[8px] text-slate-500">Checked {voice.verifiedAt}</span></div>
    </article>
  );
}

function AudioResultCard({ title, result, onMetadata, onPlaying }: {
  title: string;
  result: AudioResult;
  onMetadata: (result: AudioResult, duration: number) => void;
  onPlaying: (result: AudioResult) => void;
}) {
  return (
    <article className="rounded-lg border border-[color:var(--one-green,#009966)]/35 bg-[color:var(--one-green,#009966)]/[0.06] p-3" data-testid={`flux-result-${result.model}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><p className="text-sm font-semibold text-white">{title}</p><p className="mt-1 break-all font-mono text-[10px] text-slate-500">{result.model}</p></div>
        <span className="rounded-full border border-[color:var(--one-green,#009966)]/35 px-2 py-1 text-[9px] font-bold uppercase text-[var(--one-green-text,#62d8ad)]">Audio ready</span>
      </div>
      <audio controls src={result.url} className="mt-3 h-10 w-full" preload="metadata" onLoadedMetadata={(event) => onMetadata(result, event.currentTarget.duration)} onPlaying={() => onPlaying(result)} aria-label={`${result.voiceName} Flux audio`} />
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
        <dt className="text-slate-500">First audio ready</dt><dd className="text-right text-slate-300">{Math.round(result.firstAudioReadyMs)} ms · measured</dd>
        <dt className="text-slate-500">Request total</dt><dd className="text-right text-slate-300">{Math.round(result.requestDurationMs)} ms · measured</dd>
        <dt className="text-slate-500">Audio duration</dt><dd className="text-right text-slate-300">{result.audioDurationSeconds === undefined ? "loading metadata" : `${result.audioDurationSeconds.toFixed(2)} s`}</dd>
        <dt className="text-slate-500">Content type</dt><dd className="break-all text-right text-slate-300">{result.contentType}</dd>
        <dt className="text-slate-500">Request ID</dt><dd className="break-all text-right font-mono text-slate-300">{result.requestId ?? "unavailable"}</dd>
      </dl>
    </article>
  );
}

function CompareSlot(props: {
  title: string;
  model: FluxTtsModel;
  result: AudioResult | null;
  onMetadata: (result: AudioResult, duration: number) => void;
  onPlaying: (result: AudioResult) => void;
}) {
  if (props.result) return <AudioResultCard title={props.title} result={props.result} onMetadata={props.onMetadata} onPlaying={props.onPlaying} />;
  return <div className="rounded-lg border border-dashed border-white/10 p-4"><p className="text-sm font-semibold text-slate-300">{props.title}</p><p className="mt-1 font-mono text-[10px] text-slate-500">{props.model}</p><p className="mt-3 text-xs text-slate-600">Waiting for an explicit A/B run.</p></div>;
}

function StatusMetric({ label, value, tone }: { label: string; value: string; tone: "green" | "purple" | "amber" | "neutral" }) {
  const toneClass = tone === "green" ? "text-[var(--one-green-text,#62d8ad)]" : tone === "purple" ? "text-[var(--one-purple-text,#d9b8ff)]" : tone === "amber" ? "text-amber-100" : "text-slate-300";
  return <div className="min-w-0 rounded-lg border border-white/10 bg-black/20 p-2"><dt className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-600">{label}</dt><dd className={`mt-1 break-all text-[11px] font-semibold ${toneClass}`}>{value}</dd></div>;
}

function ActionButton({ children, onClick, disabled, primary = false, testId }: { children: ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean; testId?: string }) {
  return <button type="button" onClick={onClick} disabled={disabled} data-testid={testId} className={`${primary ? primaryButtonClassName : secondaryButtonClassName} disabled:cursor-not-allowed disabled:opacity-45`}>{children}</button>;
}

const labelClassName = "mb-2 block text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500";
const fieldClassName = "min-h-11 w-full rounded-lg border border-white/10 bg-[#03060a] px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-700 focus-visible:border-[var(--one-purple,#9966cc)] focus-visible:ring-2 focus-visible:ring-[color:var(--one-purple,#9966cc)]/30 disabled:cursor-not-allowed disabled:text-slate-600";
const primaryButtonClassName = "inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--one-purple,#9966cc)] bg-[var(--one-purple,#9966cc)] px-4 text-xs font-semibold text-white transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--one-purple-text,#d9b8ff)]";
const secondaryButtonClassName = "inline-flex min-h-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--one-purple-text,#d9b8ff)] disabled:cursor-not-allowed disabled:opacity-45";

function filterVoices(query: string) {
  return filterVoiceList(FLUX_TTS_VOICES, query);
}

function filterVoiceList(voices: readonly FluxTtsVoice[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return voices;
  return voices.filter((voice) => [voice.displayName, voice.model, voice.language, voice.accent, voice.gender, voice.age, ...voice.character].join(" ").toLowerCase().includes(normalized));
}

function sanitizedRequestPayload(request: FluxBatchRequest) {
  return { ...request, text: "***not recorded***", textLength: request.text.length, redactionState: "sanitized" };
}

function getSafeRequestId(headers: Headers) {
  return normalizeSafeRequestId(headers.get("dg-request-id") ?? headers.get("x-deepgram-request-id") ?? headers.get("x-request-id"));
}

async function readSafeError(response: Response) {
  try {
    const body = await response.json() as { error?: { message?: unknown; requestId?: unknown }; message?: unknown; requestId?: unknown };
    return {
      message: sanitizeFluxMessage(body.error?.message ?? body.message ?? `Request failed with status ${response.status}.`),
      requestId: normalizeSafeRequestId(body.error?.requestId ?? body.requestId),
    };
  } catch {
    return { message: `Flux synthesis failed with status ${response.status}.`, requestId: undefined };
  }
}

function normalizeSafeRequestId(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9._-]{4,200}$/.test(value) ? value : undefined;
}

function updateAudioDuration(runId: string, duration: number, ...setters: Array<Dispatch<SetStateAction<AudioResult | null>>>) {
  setters.forEach((setter) => setter((current) => current?.runId === runId ? { ...current, audioDurationSeconds: round(duration) } : current));
}

function downloadJson(value: unknown, fileName: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function revokeObjectUrl(url: string | undefined) {
  if (url) URL.revokeObjectURL(url);
}

function createRunId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `flux_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Flux synthesis did not complete.";
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
