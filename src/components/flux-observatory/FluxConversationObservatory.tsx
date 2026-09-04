"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import { ModuleEvolutionAffordance } from "@/components/lab-evolution/ModuleEvolutionAffordance";
import {
  DEFAULT_FLUX_CONFIGURATION,
  FLUX_REPLAY_FIXTURES,
  buildFluxHandoffs,
  buildFluxMermaid,
  buildFluxScorecard,
  createConfigurationRequestEvent,
  deriveFluxMetrics,
  exportFluxScorecardJson,
  exportFluxScorecardMarkdown,
  normalizeFluxProviderMessage,
  runFluxReplayFixture,
  serializeFluxCaseHandoff,
  validateFluxConfiguration,
  type FluxConfiguration,
  type FluxScorecard,
  type FluxSessionMode,
} from "@/lib/flux-observatory";
import type { FluxEventFilter } from "@/lib/flux-observatory/presentation";
import { ARCHITECTURE_HANDOFF_KEY } from "@/lib/live-solution-studio";
import { describeMermaid, mermaidToSafeSvg, validateMermaid } from "@/lib/solution-deliverables";
import { FluxIntelligencePanel } from "./FluxIntelligencePanel";
import { FluxSessionPanel } from "./FluxSessionPanel";
import { FluxTimeline } from "./FluxTimeline";
import { useFluxObservatorySession } from "./useFluxObservatorySession";

const button = "min-h-9 rounded-lg border border-white/10 bg-white/[.035] px-3 text-[10px] font-semibold text-slate-200 transition hover:border-cyan-200/30 hover:bg-cyan-200/[.06] focus-visible:outline-2 focus-visible:outline-cyan-200 disabled:cursor-not-allowed disabled:opacity-40";
const primary = `${button} border-cyan-200/30 bg-cyan-200/[.12] text-cyan-50`;
const ALL_FILTERS = new Set<FluxEventFilter>(["turns", "transcripts", "connection", "configuration", "failures", "measurements"]);

export function FluxConversationObservatory() {
  const session = useFluxObservatorySession(DEFAULT_FLUX_CONFIGURATION);
  const [draft, setDraft] = useState<FluxConfiguration>(structuredClone(DEFAULT_FLUX_CONFIGURATION));
  const [fixtureId, setFixtureId] = useState("hesitation-followed-by-continuation");
  const [filters, setFilters] = useState(() => new Set(ALL_FILTERS));
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedTurnIndex, setSelectedTurnIndex] = useState<number | null>(null);
  const [notice, setNotice] = useState("Synthetic Replay is ready. No microphone, credential, network request, or provider usage starts automatically.");
  const [microphoneConsentOpen, setMicrophoneConsentOpen] = useState(false);
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [scorecard, setScorecard] = useState<FluxScorecard | null>(null);
  const [mermaid, setMermaid] = useState("");
  const metrics = useMemo(() => deriveFluxMetrics(session.state), [session.state]);
  const validation = useMemo(() => validateFluxConfiguration(draft), [draft]);
  const mermaidValidation = useMemo(() => mermaid ? validateMermaid(mermaid) : null, [mermaid]);
  const mermaidSvg = useMemo(() => mermaidValidation?.valid ? mermaidToSafeSvg(mermaid) : "", [mermaid, mermaidValidation]);
  const mermaidDescription = useMemo(() => mermaidValidation?.valid ? describeMermaid(mermaid) : "", [mermaid, mermaidValidation]);

  async function selectMode(mode: FluxSessionMode) {
    await session.selectMode(mode, draft);
    setScorecard(null);
    setMermaid("");
    setNotice(mode === "synthetic-replay"
      ? "Synthetic Replay selected. Fixtures remain explicitly synthetic and run through the shared event pipeline."
      : "Live Provider Mode selected. Microphone permission and provider start remain separate, visible actions.");
  }

  function runReplay() {
    const source = FLUX_REPLAY_FIXTURES.find((fixture) => fixture.id === fixtureId);
    if (!source) return;
    const fixture = { ...source, initialConfiguration: structuredClone(draft) };
    const result = runFluxReplayFixture(fixture);
    session.setState(result.state);
    setSelectedEventId(result.state.events.at(-1)?.id ?? null);
    setSelectedTurnIndex(result.state.turns.at(-1)?.turnIndex ?? null);
    setScorecard(null);
    setMermaid("");
    setNotice(`Synthetic fixture loaded: ${source.title}. This is not a live Deepgram result.`);
  }

  function applyConfiguration() {
    if (!validation.success) return;
    if (session.state.mode === "live-provider") {
      if (!["open", "streaming"].includes(session.liveSnapshot.connection)) {
        setNotice("Settings are staged for the next explicit provider start. No Configure message was sent.");
        return;
      }
      const sessionBoundaryChanged = draft.model !== session.state.activeConfiguration.model
        || draft.encoding !== session.state.activeConfiguration.encoding
        || draft.sampleRate !== session.state.activeConfiguration.sampleRate
        || draft.targetChunkMs !== session.state.activeConfiguration.targetChunkMs;
      const eagerDisableRequiresReconnect = session.state.activeConfiguration.thresholds.eagerEotThreshold !== null
        && draft.thresholds.eagerEotThreshold === null;
      try {
        session.applyLiveConfiguration({
          thresholds: { ...draft.thresholds },
          keyterms: [...draft.keyterms],
          languageHints: [...draft.languageHints],
        });
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "The configuration request was not sent.");
        return;
      }
      setNotice(sessionBoundaryChanged || eagerDisableRequiresReconnect
        ? `Dynamic supported values were sent. ${sessionBoundaryChanged ? "Model, audio format, sample rate, and chunk target" : "Disabling eager end-of-turn"} requires an explicit reconnect.`
        : "Configuration request sent. Active settings change only after provider acknowledgement.");
      return;
    }
    const sessionBoundaryChanged = draft.model !== session.state.activeConfiguration.model
      || draft.encoding !== session.state.activeConfiguration.encoding
      || draft.sampleRate !== session.state.activeConfiguration.sampleRate
      || draft.targetChunkMs !== session.state.activeConfiguration.targetChunkMs;
    const eagerDisableRequiresReplay = session.state.activeConfiguration.thresholds.eagerEotThreshold !== null
      && draft.thresholds.eagerEotThreshold === null;
    if (sessionBoundaryChanged || eagerDisableRequiresReplay) {
      setNotice(`${sessionBoundaryChanged ? "Model, audio format, sample rate, and chunk target are session-bound." : "Disabling eager end-of-turn is not represented as an omitted Configure field."} Run the selected fixture again to apply it; no synthetic acknowledgement was invented.`);
      return;
    }
    const lastMs = session.state.events.at(-1)?.monotonicMs ?? 0;
    const requestKey = `synthetic-config-${crypto.randomUUID()}`;
    const context = {
      sessionId: session.state.sessionId,
      connectionGeneration: session.state.activeConnectionGeneration,
      monotonicMs: lastMs + 20,
      mode: "synthetic-replay" as const,
    };
    session.ingest(createConfigurationRequestEvent(requestKey, session.state.activeConfiguration, {
      thresholds: { ...draft.thresholds },
      keyterms: [...draft.keyterms],
      languageHints: [...draft.languageHints],
    }, context));
    session.ingest(normalizeFluxProviderMessage({
      type: "ConfigureSuccess",
      sequence_id: (session.state.lastProviderSequenceId ?? 0) + 1,
      thresholds: {
        eot_threshold: draft.thresholds.eotThreshold,
        eager_eot_threshold: draft.thresholds.eagerEotThreshold,
        eot_timeout_ms: draft.thresholds.eotTimeoutMs,
      },
      keyterms: draft.keyterms,
      language_hints: draft.languageHints,
    }, { ...context, monotonicMs: lastMs + 40 }));
    setNotice("Synthetic ConfigureSuccess recorded through the same normalizer and reducer. It is fixture evidence, not provider evidence.");
  }

  async function prepareMicrophone() {
    setMicrophoneConsentOpen(false);
    try {
      await session.prepareMicrophone(draft);
      setNotice("Microphone prepared locally. No provider session has started; press Start provider session explicitly.");
    } catch {
      setNotice("Microphone permission was denied or the device was unavailable. Synthetic Replay remains available.");
    }
  }

  async function startLive() {
    try {
      await session.startLive(draft);
      setNotice("Live provider session started with a temporary in-memory credential. Manual review is still required.");
    } catch {
      setNotice("The live provider session could not start. No permanent credential entered browser state.");
    }
  }

  async function stopLive() {
    await session.stopLive();
    setNotice("Stop requested. Media tracks, audio nodes, socket, timers, buffers, and temporary credential references were cleaned up.");
  }

  function clearSession() {
    if (session.state.mode === "live-provider" && ["open", "streaming", "connecting"].includes(session.liveSnapshot.connection)) {
      setNotice("Stop the live provider session before clearing its bounded evidence.");
      return;
    }
    session.reset(session.state.mode, draft);
    setScorecard(null);
    setMermaid("");
    setSelectedEventId(null);
    setSelectedTurnIndex(null);
    setReviewerNotes("");
    setNotice("Current bounded session evidence cleared. Nothing was persisted automatically.");
  }

  function generateScorecard() {
    const next = buildFluxScorecard(session.state, {
      runId: `${session.state.mode === "synthetic-replay" ? "synthetic" : "live"}-${session.state.sessionId}`,
      applicationVersion: process.env.NEXT_PUBLIC_APP_VERSION,
      reviewerNotes: reviewerNotes.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    });
    setScorecard(next);
    setNotice("Sanitized POC scorecard generated. It contains no transcript, raw audio, credential, or authorization header.");
  }

  function generateArchitecture() {
    const source = buildFluxMermaid(session.state.activeConfiguration, { mode: session.state.mode, includeSpeculativeOrchestration: true });
    const result = validateMermaid(source);
    setMermaid(source);
    setNotice(result.valid ? "Validated Mermaid architecture generated from the active configuration." : "Architecture source failed validation; downloads remain unavailable.");
  }

  function sendToLiveSolution(destination: "live-solution" | "deliverables") {
    sessionStorage.setItem("deepgram-flux-observatory:case-contribution:v1", serializeFluxCaseHandoff(session.state));
    window.location.assign(destination === "deliverables"
      ? "/live-solution-studio?source=flux-observatory&destination=deliverables"
      : "/live-solution-studio?source=flux-observatory");
  }

  function sendToArchitecture() {
    const handoff = buildFluxHandoffs(session.state).architectureStudio;
    sessionStorage.setItem(ARCHITECTURE_HANDOFF_KEY, JSON.stringify({
      schemaVersion: 1,
      problem: "Review a Flux conversational turn-intelligence architecture for the scoped POC.",
      context: [
        { label: "Flux model", value: handoff.model },
        { label: "Credential boundary", value: handoff.credentialBoundary },
        { label: "Audio transport", value: handoff.audioTransport },
        { label: "Configuration", value: handoff.configurationPath },
        { label: "Cancellation", value: handoff.cancellationBehavior },
        { label: "Evidence status", value: session.state.mode === "synthetic-replay" ? "Synthetic fixture" : "Local provider observation; review required" },
      ],
      lanes: ["Streaming STT", "Voice agent", "Security"],
      createdAt: new Date().toISOString(),
    }));
    window.location.assign("/architecture-studio?handoff=flux-observatory");
  }

  const synthetic = session.state.mode === "synthetic-replay";
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#03080d] text-slate-200" data-testid="flux-conversation-observatory">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#03080d]/95 px-3 py-3 backdrop-blur sm:px-5">
        <div className="mx-auto flex max-w-[1900px] flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[.22em] text-cyan-300">Deepgram Applied Voice Learning Lab</p>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3"><h1 className="text-lg font-semibold text-white sm:text-xl">Flux Conversation Observatory</h1><p className="text-[11px] text-slate-500">See every turn, interruption, and response boundary.</p></div>
          </div>
          <nav aria-label="Flux Observatory navigation" className="flex flex-wrap items-center gap-2"><ModuleEvolutionAffordance moduleId="flux-observatory" /><Link className={button} href="/">Lab</Link><Link className={button} href="/live-solution-studio">Live Solution</Link><Link className={button} href="/deliverables">Deliverables</Link><Link className={button} href="/capabilities">Capabilities</Link></nav>
        </div>
      </header>

      <div className="mx-auto max-w-[1900px] p-3 sm:p-4">
        <section className="mb-3 grid gap-3 rounded-2xl border border-cyan-200/15 bg-[radial-gradient(circle_at_15%_0%,rgba(34,211,238,.08),transparent_35%),#071017] p-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,.65fr)]">
          <div><div className="flex flex-wrap gap-1.5"><EvidenceLabel>{synthetic ? "Synthetic fixture" : "Locally measured"}</EvidenceLabel><EvidenceLabel>Deepgram documentation verified</EvidenceLabel><EvidenceLabel>Manual validation required</EvidenceLabel></div><h2 className="mt-3 text-xl font-semibold tracking-tight text-white">Streaming text tells you what was heard. Flux turn events show when conversational state changes.</h2><p className="mt-2 max-w-4xl text-[11px] leading-5 text-slate-400">This workspace keeps provider messages, local lifecycle observations, threshold acknowledgements, and derived timing separate. It does not infer model reasoning or claim universal latency, accuracy, or production readiness.</p><p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-slate-500"><span>Official contract checked 2026-07-28:</span><a className="text-cyan-100/70 underline decoration-cyan-200/20 underline-offset-2 hover:text-cyan-50" href="https://developers.deepgram.com/docs/flux/quickstart" target="_blank" rel="noreferrer">Flux quickstart</a><a className="text-cyan-100/70 underline decoration-cyan-200/20 underline-offset-2 hover:text-cyan-50" href="https://developers.deepgram.com/reference/speech-to-text/listen-flux" target="_blank" rel="noreferrer">/v2/listen reference</a></p></div>
          <div className="grid grid-cols-2 gap-2 text-[9px]"><HeaderStat label="Mode" value={synthetic ? "Synthetic Replay" : "Live Provider"} /><HeaderStat label="Connection" value={session.state.connectionState} /><HeaderStat label="Provider validation" value={session.state.providerValidationState.replaceAll("-", " ")} /><HeaderStat label="Bounded memory" value={`${session.state.events.length}/${session.state.maxEvents} events`} /></div>
        </section>

        <section className="grid items-start gap-3 xl:grid-cols-[310px_minmax(480px,1fr)_370px]">
          <FluxSessionPanel mode={session.state.mode} draft={draft} active={session.state.activeConfiguration} live={session.liveSnapshot} fixtures={FLUX_REPLAY_FIXTURES} fixtureId={fixtureId} validationErrors={validation.errors} onMode={(mode) => void selectMode(mode)} onDraft={setDraft} onFixture={setFixtureId} onReplay={runReplay} onPrepare={() => setMicrophoneConsentOpen(true)} onStart={() => void startLive()} onStop={() => void stopLive()} onReconnect={() => void session.reconnect(draft).then(() => setNotice("Reconnect requested with a fresh temporary credential and connection generation."))} onApply={applyConfiguration} onClear={clearSession} />
          <FluxTimeline events={session.state.events} filters={filters} onFilters={setFilters} selectedEventId={selectedEventId} onSelect={setSelectedEventId} />
          <FluxIntelligencePanel state={session.state} metrics={metrics} selectedTurnIndex={selectedTurnIndex} onSelectTurn={setSelectedTurnIndex} />
        </section>

        <section className="mt-3 grid gap-3 xl:grid-cols-2">
          <article className="rounded-2xl border border-white/[.09] bg-[#071017]/90 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-cyan-200/60">POC evidence generator</p><h2 className="mt-1 text-base font-semibold text-white">Sanitized scorecard</h2></div><button type="button" className={primary} onClick={generateScorecard}>Generate scorecard</button></div>
            <label className="mt-3 block text-[10px] font-semibold text-slate-400">Qualitative reviewer notes - approved, redacted text only<textarea value={reviewerNotes} onChange={(event) => setReviewerNotes(event.target.value.slice(0, 4000))} className="mt-1 min-h-20 w-full rounded-lg border border-white/10 bg-black/20 p-2.5 text-[11px] leading-5 text-slate-200 outline-none focus:border-cyan-200/35" placeholder="Optional observations. Do not paste customer transcripts, credentials, or private identifiers." /></label>
            <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={button} onClick={() => markTurn(selectedTurnIndex, setReviewerNotes, setNotice)}>Mark current turn</button><button type="button" className={button} disabled={!scorecard} onClick={() => scorecard && downloadText("flux-poc-scorecard.md", exportFluxScorecardMarkdown(scorecard), "text/markdown")}>Download Markdown</button><button type="button" className={button} disabled={!scorecard} onClick={() => scorecard && downloadText("flux-poc-scorecard.json", exportFluxScorecardJson(scorecard), "application/json")}>Download JSON</button><button type="button" className={button} disabled={!scorecard} onClick={() => scorecard && void copyText(exportFluxScorecardMarkdown(scorecard), setNotice, "Scorecard Markdown")}>Copy Markdown</button></div>
            {scorecard ? <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-white/[.07] bg-black/20 p-3 font-mono text-[9px] leading-4 text-slate-400">{exportFluxScorecardMarkdown(scorecard)}</pre> : <p className="mt-3 rounded-lg border border-dashed border-white/[.08] p-4 text-[10px] leading-5 text-slate-500">Generate only after reviewing the run. Exports intentionally omit transcripts, raw audio, credentials, provider URLs, and internal stacks.</p>}
          </article>

          <article className="rounded-2xl border border-white/[.09] bg-[#071017]/90 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-violet-200/60">Architecture evidence</p><h2 className="mt-1 text-base font-semibold text-white">Validated Mermaid and typed handoffs</h2></div><button type="button" className={primary} onClick={generateArchitecture}>Generate architecture</button></div>
            {mermaid ? <div className="mt-3 grid gap-3 md:grid-cols-2"><div><div className="flex flex-wrap items-center gap-2"><EvidenceLabel>{mermaidValidation?.valid ? "Validated" : "Invalid"}</EvidenceLabel><span className="text-[9px] text-slate-500">strict safe subset</span></div><pre className="mt-2 max-h-72 overflow-auto whitespace-pre rounded-lg border border-white/[.07] bg-black/20 p-3 font-mono text-[9px] leading-4 text-slate-400">{mermaid}</pre></div><div>{mermaidSvg ? <Image unoptimized width={1000} height={500} className="max-h-72 w-full rounded-lg border border-white/[.07] bg-slate-950/80 object-contain p-2" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(mermaidSvg)}`} alt="Accessible Flux architecture preview" /> : <p role="alert" className="text-rose-100">{mermaidValidation?.errors.join(" ")}</p>}<details className="mt-2"><summary className="cursor-pointer text-[9px] font-semibold text-slate-400">Accessible relationship description</summary><pre className="mt-2 whitespace-pre-wrap text-[9px] leading-4 text-slate-500">{mermaidDescription}</pre></details></div></div> : <p className="mt-3 rounded-lg border border-dashed border-white/[.08] p-4 text-[10px] leading-5 text-slate-500">Generate from the active model, audio boundary, event path, configuration controls, and explicit optional-component labels.</p>}
            <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={button} disabled={!mermaidValidation?.valid} onClick={() => downloadText("flux-conversation-observatory.mmd", mermaid, "text/plain")}>Download .mmd</button><button type="button" className={button} disabled={!mermaidValidation?.valid} onClick={() => downloadText("flux-conversation-observatory.svg", mermaidSvg, "image/svg+xml")}>Download SVG</button><button type="button" className={button} disabled={!mermaidValidation?.valid} onClick={() => void copyText(mermaid, setNotice, "Mermaid source")}>Copy Mermaid</button><Link className={button} href="/?module=api-studio&operation=stt-flux&source=flux-observatory">Open API Lab</Link><button type="button" className={button} onClick={sendToArchitecture}>Send to Architecture</button><button type="button" className={button} onClick={() => sendToLiveSolution("live-solution")}>Send to Live Solution</button><button type="button" className={button} onClick={() => sendToLiveSolution("deliverables")}>Send to Deliverables</button></div>
          </article>
        </section>

        <ConfigurationLedger state={session.state} />
      </div>

      {microphoneConsentOpen ? <div role="dialog" aria-modal="true" aria-labelledby="flux-consent-title" className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4"><div className="w-full max-w-lg rounded-2xl border border-cyan-200/20 bg-[#071017] p-5 shadow-2xl"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-amber-100">Visible consent boundary</p><h2 id="flux-consent-title" className="mt-2 text-lg font-semibold text-white">Allow this browser to prepare the microphone?</h2><p className="mt-2 text-[11px] leading-5 text-slate-400">This action requests browser microphone permission only. It does not start the provider, mint a credential, persist audio, or submit a session. You will still press Start provider session separately.</p><div className="mt-5 flex justify-end gap-2"><button type="button" className={button} autoFocus onClick={() => setMicrophoneConsentOpen(false)}>Cancel</button><button type="button" className={primary} onClick={() => void prepareMicrophone()}>Prepare microphone</button></div></div></div> : null}

      <div aria-live="polite" className="fixed bottom-3 left-1/2 z-40 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-full border border-white/10 bg-slate-950 px-4 py-2 text-center text-[10px] text-slate-300 shadow-xl">{notice}</div>
    </main>
  );
}

function ConfigurationLedger({ state }: { state: ReturnType<typeof useFluxObservatorySession>["state"] }) {
  return <section className="mt-3 rounded-2xl border border-white/[.09] bg-[#071017]/90 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-cyan-200/60">Configuration laboratory</p><h2 className="mt-1 text-sm font-semibold text-white">Requested, acknowledged, and rejected states remain distinct</h2></div><span className="font-mono text-[9px] text-slate-500">{state.configurationHistory.length} transaction(s)</span></div>{state.configurationHistory.length ? <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-[9px]"><thead className="text-slate-600"><tr><th className="p-2">Requested</th><th className="p-2">Status</th><th className="p-2">Previous</th><th className="p-2">Requested values</th><th className="p-2">Response</th></tr></thead><tbody>{state.configurationHistory.map((entry) => <tr key={entry.id} className="border-t border-white/[.06]"><td className="p-2 font-mono text-slate-400">{entry.requestedAt}</td><td className="p-2 font-semibold text-cyan-100">{entry.status}</td><td className="p-2 text-slate-500">eot {entry.previousConfiguration.thresholds.eotThreshold}; eager {entry.previousConfiguration.thresholds.eagerEotThreshold ?? "off"}; {entry.previousConfiguration.thresholds.eotTimeoutMs} ms</td><td className="p-2 font-mono text-slate-400">{JSON.stringify(entry.requestedConfiguration)}</td><td className="p-2 text-slate-500">{entry.respondedAt ?? "Pending provider response"}{entry.failureDescription ? ` - ${entry.failureCode ?? "failure"}: ${entry.failureDescription}` : ""}</td></tr>)}</tbody></table></div> : <p className="mt-3 text-[10px] text-slate-500">No configuration request has been sent in this bounded session. Editing does not change active settings.</p>}</section>;
}

function EvidenceLabel({ children }: { children: React.ReactNode }) { return <span className="rounded-full border border-white/10 bg-white/[.035] px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-slate-300">{children}</span>; }
function HeaderStat({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-white/[.07] bg-black/20 p-2"><p className="uppercase tracking-wider text-slate-600">{label}</p><p className="mt-1 font-mono capitalize text-slate-300">{value}</p></div>; }
function downloadText(name: string, content: string, type: string) { const url = URL.createObjectURL(new Blob([content], { type })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url); }
async function copyText(value: string, notice: (value: string) => void, label: string) { try { await navigator.clipboard.writeText(value); notice(`${label} copied.`); } catch { notice("Clipboard permission was unavailable. Select the visible text manually."); } }
function markTurn(index: number | null, update: React.Dispatch<React.SetStateAction<string>>, notice: (value: string) => void) { if (index === null) { notice("Select an observed turn before marking it."); return; } update((current) => `${current}${current ? "\n" : ""}Turn ${index} marked for reviewer follow-up.`); notice(`Turn ${index} marked in local reviewer notes without copying its transcript.`); }
