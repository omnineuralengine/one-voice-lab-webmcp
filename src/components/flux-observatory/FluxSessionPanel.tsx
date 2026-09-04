"use client";

import { useState } from "react";

import type { FluxConfiguration, FluxReplayFixture, FluxSessionMode } from "@/lib/flux-observatory";
import type { FluxLiveClientSnapshot } from "@/lib/flux-observatory/live-client";
import { FLUX_PRESETS } from "@/lib/flux-observatory/presentation";

const button = "min-h-9 rounded-lg border border-white/10 bg-white/[.035] px-3 text-[10px] font-semibold text-slate-200 transition hover:border-cyan-200/30 hover:bg-cyan-200/[.06] focus-visible:outline-2 focus-visible:outline-cyan-200 disabled:cursor-not-allowed disabled:opacity-40";
const primary = `${button} border-cyan-200/30 bg-cyan-200/[.12] text-cyan-50`;
const input = "mt-1 min-h-9 w-full rounded-lg border border-white/10 bg-[#03090e] px-2.5 text-[11px] text-slate-200 outline-none focus:border-cyan-200/40 focus-visible:ring-2 focus-visible:ring-cyan-200/30";

export function FluxSessionPanel({
  mode,
  draft,
  active,
  live,
  fixtures,
  fixtureId,
  validationErrors,
  onMode,
  onDraft,
  onFixture,
  onReplay,
  onPrepare,
  onStart,
  onStop,
  onReconnect,
  onApply,
  onClear,
}: {
  mode: FluxSessionMode;
  draft: FluxConfiguration;
  active: FluxConfiguration;
  live: FluxLiveClientSnapshot;
  fixtures: FluxReplayFixture[];
  fixtureId: string;
  validationErrors: string[];
  onMode: (mode: FluxSessionMode) => void;
  onDraft: (next: FluxConfiguration) => void;
  onFixture: (id: string) => void;
  onReplay: () => void;
  onPrepare: () => void;
  onStart: () => void;
  onStop: () => void;
  onReconnect: () => void;
  onApply: () => void;
  onClear: () => void;
}) {
  const [presetId, setPresetId] = useState("balanced");
  const selectedPreset = FLUX_PRESETS.find((item) => item.id === presetId) ?? FLUX_PRESETS[0];
  const liveReady = live.microphone === "ready";
  const running = ["connecting", "open", "streaming"].includes(live.connection);
  return (
    <aside aria-labelledby="flux-session-heading" className="space-y-3">
      <section className="overflow-hidden rounded-2xl border border-white/[.09] bg-[#071017]/90">
        <header className="border-b border-white/[.08] p-4"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-violet-200/60">Session & configuration</p><h2 id="flux-session-heading" className="mt-1 text-base font-semibold text-white">Choose evidence mode explicitly</h2></header>
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Flux session mode">
            <ModeButton active={mode === "synthetic-replay"} title="Synthetic Replay" detail="Offline, deterministic fixtures" command="fluxObservatory.selectSynthetic" onClick={() => onMode("synthetic-replay")} />
            <ModeButton active={mode === "live-provider"} title="Live Provider" detail="Microphone + billable provider" command="fluxObservatory.selectLive" onClick={() => onMode("live-provider")} />
          </div>
          <div className={`rounded-xl border p-3 ${mode === "synthetic-replay" ? "border-violet-200/18 bg-violet-200/[.045]" : "border-emerald-200/18 bg-emerald-200/[.04]"}`}>
            <p className="text-[10px] font-bold text-white">{mode === "synthetic-replay" ? "Synthetic fixture — not a live Deepgram result" : "Live provider mode — explicit microphone consent required"}</p>
            <p className="mt-1 text-[9px] leading-4 text-slate-500">{mode === "synthetic-replay" ? "Uses the same normalizer, reducer, metrics, and export sanitizer as live mode. No network, microphone, or credential is used." : "Uses a short-lived credential held in memory. Permanent keys remain server-side. Provider evidence still requires manual review."}</p>
          </div>

          {mode === "synthetic-replay" ? <div>
            <label className="block text-[10px] font-semibold text-slate-400">Replay scenario<select className={input} value={fixtureId} onChange={(event) => onFixture(event.target.value)}>{fixtures.map((fixture) => <option key={fixture.id} value={fixture.id}>{fixture.title}</option>)}</select></label>
            <p className="mt-2 text-[9px] leading-4 text-slate-500">{fixtures.find((fixture) => fixture.id === fixtureId)?.description}</p>
            <button type="button" className={`${primary} mt-3 w-full`} onClick={onReplay} data-testid="run-flux-fixture">Run deterministic replay</button>
          </div> : <div className="space-y-3">
            <StatusGrid live={live} />
            <CaptureLevel rms={live.rms} active={live.microphone === "active"} />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={button} onClick={onPrepare} disabled={running}>Prepare microphone</button>
              <button type="button" className={primary} onClick={onStart} disabled={!liveReady || running}>Start provider session</button>
              <button type="button" className={button} onClick={onReconnect} disabled={running || live.microphone === "requesting"}>Reconnect</button>
              <button type="button" className={`${button} text-rose-100`} onClick={onStop} disabled={!running && !liveReady}>Stop & clean up</button>
            </div>
            <p className="text-[9px] leading-4 text-amber-100/65">Starting the provider session can incur Deepgram usage. keyboard shortcuts commands can reveal this control, but cannot bypass the visible confirmation.</p>
          </div>}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/[.09] bg-[#071017]/90">
        <header className="border-b border-white/[.08] p-4"><div className="flex items-start justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-cyan-200/60">Flux configuration</p><h2 className="mt-1 text-sm font-semibold text-white">Editable starting points</h2></div><span className="rounded-full border border-amber-200/15 bg-amber-200/[.05] px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-amber-100">Assumption</span></div><p className="mt-2 text-[9px] leading-4 text-slate-500">Presets are hypotheses to test, never universal recommendations.</p></header>
        <div className="space-y-4 p-4">
          <label className="block text-[10px] font-semibold text-slate-400">Preset<select className={input} value={presetId} onChange={(event) => { setPresetId(event.target.value); const preset = FLUX_PRESETS.find((item) => item.id === event.target.value); if (preset) onDraft(structuredClone(preset.configuration)); }}>{FLUX_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.name} · eot {preset.configuration.thresholds.eotThreshold} · eager {preset.configuration.thresholds.eagerEotThreshold} · timeout {preset.configuration.thresholds.eotTimeoutMs}ms</option>)}</select></label>
          <p className="rounded-lg border border-white/[.06] bg-black/15 p-2 text-[9px] leading-4 text-slate-500"><strong className="text-slate-300">{selectedPreset.name} starting point:</strong> {selectedPreset.description} Exact values remain editable below and are never applied to a live session without the Apply action.</p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Model"><select className={input} value={draft.model} onChange={(event) => onDraft({ ...draft, model: event.target.value as FluxConfiguration["model"], languageHints: event.target.value === "flux-general-en" ? [] : draft.languageHints })}><option value="flux-general-en">flux-general-en</option><option value="flux-general-multi">flux-general-multi</option></select></Field>
            <Field label="Encoding"><select className={input} value={draft.encoding} onChange={(event) => onDraft({ ...draft, encoding: event.target.value as FluxConfiguration["encoding"] })}><option value="linear16">linear16 · live capture</option><option value="linear32">linear32 · inspect only</option><option value="mulaw">mulaw · inspect only</option><option value="alaw">alaw · inspect only</option><option value="opus">opus · inspect only</option><option value="ogg-opus">ogg-opus · inspect only</option></select></Field>
            <Field label="Sample rate"><select className={input} value={draft.sampleRate} onChange={(event) => onDraft({ ...draft, sampleRate: Number(event.target.value) as FluxConfiguration["sampleRate"] })}>{[8000, 16000, 24000, 44100, 48000].map((rate) => <option key={rate} value={rate}>{rate} Hz</option>)}</select></Field>
            <Field label="Target chunk"><input className={input} type="number" min={10} max={1000} step={10} value={draft.targetChunkMs} onChange={(event) => onDraft({ ...draft, targetChunkMs: Number(event.target.value) })} /></Field>
            <Field label="eot_threshold"><input className={input} type="number" min={0.5} max={0.9} step={0.05} value={draft.thresholds.eotThreshold} onChange={(event) => onDraft({ ...draft, thresholds: { ...draft.thresholds, eotThreshold: Number(event.target.value) } })} /></Field>
            <Field label="eager_eot_threshold"><input className={input} type="number" min={0.3} max={0.9} step={0.05} value={draft.thresholds.eagerEotThreshold ?? ""} placeholder="Disabled" onChange={(event) => onDraft({ ...draft, thresholds: { ...draft.thresholds, eagerEotThreshold: event.target.value === "" ? null : Number(event.target.value) } })} /></Field>
            <Field label="eot_timeout_ms"><input className={input} type="number" min={500} max={60000} step={100} value={draft.thresholds.eotTimeoutMs} onChange={(event) => onDraft({ ...draft, thresholds: { ...draft.thresholds, eotTimeoutMs: Number(event.target.value) } })} /></Field>
            <Field label="Actual cadence"><output className={`${input} flex items-center text-slate-400`}>{live.measuredChunkIntervalMs === null ? "Not measured" : `${Math.round(live.measuredChunkIntervalMs)} ms`}</output></Field>
          </div>
          <Field label="Keyterms · up to 100"><input className={input} value={draft.keyterms.join(", ")} onChange={(event) => onDraft({ ...draft, keyterms: csv(event.target.value) })} placeholder="Deepgram, product name" /></Field>
          <Field label="Language hints · multilingual model only"><input className={input} value={draft.languageHints.join(", ")} disabled={draft.model !== "flux-general-multi"} onChange={(event) => onDraft({ ...draft, languageHints: csv(event.target.value) })} placeholder="en, es" /></Field>
          {validationErrors.length ? <ul role="alert" className="space-y-1 rounded-lg border border-rose-200/15 bg-rose-200/[.04] p-2 text-[9px] leading-4 text-rose-100">{validationErrors.map((error) => <li key={error}>• {error}</li>)}</ul> : null}
          <div className="grid grid-cols-2 gap-2"><button type="button" className={primary} disabled={validationErrors.length > 0} onClick={onApply}>Apply settings</button><button type="button" className={button} onClick={onClear}>Clear session</button></div>
          <p className="text-[9px] leading-4 text-slate-600">Active: eot {active.thresholds.eotThreshold} · eager {active.thresholds.eagerEotThreshold ?? "off"} · timeout {active.thresholds.eotTimeoutMs} ms. Failed updates never replace this acknowledged state.</p>
        </div>
      </section>
    </aside>
  );
}

function ModeButton({ active, title, detail, command, onClick }: { active: boolean; title: string; detail: string; command: string; onClick: () => void }) { return <button type="button" aria-pressed={active} onClick={onClick} className={`min-h-16 rounded-xl border p-2.5 text-left focus-visible:outline-2 focus-visible:outline-cyan-200 ${active ? "border-cyan-200/35 bg-cyan-200/[.08]" : "border-white/[.08] bg-black/15 hover:border-white/15"}`}><span className="block text-[10px] font-semibold text-white">{title}</span><span className="mt-1 block text-[8px] leading-3 text-slate-500">{detail}</span></button>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-[9px] font-semibold text-slate-500">{label}{children}</label>; }
function csv(value: string) { return value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 100); }

function StatusGrid({ live }: { live: FluxLiveClientSnapshot }) {
  return <dl className="grid grid-cols-2 gap-2 text-[9px]"><Status label="Connection" value={live.connection} /><Status label="Credential" value={live.credential} /><Status label="Microphone" value={live.microphone} /><Status label="Queue" value={`${Math.round(live.socketBufferedBytes / 1024)} KiB`} />{live.error ? <div className="col-span-2 rounded-lg border border-rose-200/15 bg-rose-200/[.04] p-2 text-rose-100" role="alert">{live.error}</div> : null}</dl>;
}
function Status({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-white/[.07] bg-black/20 p-2"><dt className="uppercase tracking-wider text-slate-600">{label}</dt><dd className="mt-1 font-mono text-slate-300">{value}</dd></div>; }

function CaptureLevel({ rms, active }: { rms: number; active: boolean }) {
  return <div className="rounded-lg border border-white/[.07] bg-black/20 p-2.5" aria-label={active ? `Local microphone capture level ${Math.round(rms * 100)} percent` : "Local microphone capture level unavailable"}>
    <div className="flex items-end gap-1" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => {
      const contour = 0.45 + Math.sin((index + 1) * 1.7) * 0.2;
      const height = active ? Math.max(4, Math.min(34, 4 + rms * 70 * contour)) : 4;
      return <span key={index} className="w-full rounded-full bg-cyan-200/45 motion-safe:transition-[height] motion-safe:duration-150" style={{ height }} />;
    })}</div>
    <p className="mt-2 text-[8px] leading-3 text-slate-600">Low-CPU local capture level only. It is not evidence of provider connection or transcription.</p>
  </div>;
}
