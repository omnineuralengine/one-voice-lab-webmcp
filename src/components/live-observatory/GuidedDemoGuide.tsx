"use client";

import { useState } from "react";

const TIMELINE = [
  ["0:00–0:25", "Problem and thesis", "Voice quality is a complete-system property, so I preserve evidence before changing configuration."],
  ["0:25–1:25", "Live microphone", "Run Speak and Watch only after reviewing the one-session confirmation."],
  ["1:25–2:05", "Trace and latency", "Open one final/turn event; point to request ID and audio-send → first-transcript timing."],
  ["2:05–3:00", "Northstar diagnosis", "Use the synthetic order-ID signal to separate audio, model, integration, and expectation hypotheses."],
  ["3:00–3:35", "API Studio + Code Lab", "Map the observed event to the request surface and the browser/server implementation boundary."],
  ["3:35–4:00", "AVS vision", "Close on observable, reproducible, client-level voice systems—not a generic quality score."],
] as const;

const SPOKEN_FIXTURE = "Hi, I’m calling about order A-B seven zero four nine X-Q. I need to know whether it will arrive before Friday… actually, let me correct that—the final letter is K.";

export function GuidedDemoGuide({
  onOpenSpeakWatch,
  onOpenNorthstar,
  onOpenExperiment,
  onOpenApiStudio,
  onOpenCodeLab,
  onOpenAppliedVoiceSystems,
  onOpenWhitepaper,
  onReset,
}: {
  onOpenSpeakWatch: () => void;
  onOpenNorthstar: () => void;
  onOpenExperiment: () => void;
  onOpenApiStudio: () => void;
  onOpenCodeLab: () => void;
  onOpenAppliedVoiceSystems: () => void;
  onOpenWhitepaper: () => void;
  onReset: () => void;
}) {
  const [completed, setCompleted] = useState<string[]>([]);

  function toggle(id: string) {
    setCompleted((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return (
    <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,.85fr)]" data-testid="guided-demo-guide">
      <section className="rounded-xl border border-cyan-300/25 bg-cyan-300/[0.045] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-[9px] font-bold uppercase tracking-[0.18em] text-cyan-300">Presenter-only · no automatic requests</p><h2 className="mt-1 text-lg font-semibold text-white">Guided Engineering Demo</h2><p className="mt-1 text-xs leading-5 text-slate-400">One controlled live session, one synthetic diagnosis, one narrow experiment, then the implementation and AVS bridge.</p></div>
          <button type="button" onClick={onReset} className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-[10px] font-semibold text-amber-100 focus-visible:outline-2 focus-visible:outline-amber-100">Reset Demo State</button>
        </div>

        <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">Spoken microphone fixture</p>
          <blockquote className="mt-2 text-sm leading-6 text-white">“{SPOKEN_FIXTURE}”</blockquote>
          <div className="mt-3 grid gap-2 text-[10px] text-slate-400 sm:grid-cols-2 lg:grid-cols-3">
            {[
              "Alphanumeric recognition",
              "Pause behavior",
              "Self-correction",
              "Interim vs final transcript",
              "Turn detection",
              "Client workflow context",
            ].map((item) => <span key={item} className="rounded border border-white/10 bg-white/[0.025] px-2 py-1.5">{item}</span>)}
          </div>
          <p className="mt-2 text-[10px] text-amber-100">Do not predict the transcript. Observe the returned evidence and describe any mismatch as a testable segment.</p>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <GuideAction label="1 · Open Speak and Watch" detail="Still requires Live Lab activation and billable-session confirmation." onClick={onOpenSpeakWatch} />
          <GuideAction label="2 · Open Northstar diagnosis" detail="Deterministic synthetic evidence; zero Deepgram requests." onClick={onOpenNorthstar} />
          <GuideAction label="3 · Open narrow experiment" detail="Same audio/model; change one supported formatting setting." onClick={onOpenExperiment} />
          <GuideAction label="4 · Open live STT in API Studio" detail="Inspect auth, transport, request options, and response paths." onClick={onOpenApiStudio} />
          <GuideAction label="5 · Open browser mic in Code Lab" detail="Show temporary-token, WebSocket, cleanup, and file ownership." onClick={onOpenCodeLab} />
          <GuideAction label="6 · Open Applied Voice Systems" detail="Connect the evidence to ownership, evaluation, and reusable patterns." onClick={onOpenAppliedVoiceSystems} />
          <GuideAction label="7 · Open AVS title page" detail="Local PDF reference; opens no Deepgram connection." onClick={onOpenWhitepaper} />
        </div>
      </section>

      <aside className="min-h-0 rounded-xl border border-white/10 bg-white/[0.025] p-4">
        <div className="flex items-center justify-between gap-2"><h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-200">Four-minute checklist</h3><span className="font-mono text-[9px] text-cyan-300">{completed.length}/{TIMELINE.length}</span></div>
        <ol className="mt-3 space-y-2">
          {TIMELINE.map(([time, title, detail]) => {
            const checked = completed.includes(time);
            return <li key={time}><label className={`flex cursor-pointer gap-2 rounded-lg border p-2.5 ${checked ? "border-emerald-300/25 bg-emerald-300/[0.05]" : "border-white/10 bg-black/15"}`}><input type="checkbox" checked={checked} onChange={() => toggle(time)} className="mt-0.5" /><span><span className="block font-mono text-[9px] text-cyan-300">{time}</span><span className="block text-[11px] font-semibold text-white">{title}</span><span className="mt-1 block text-[9px] leading-4 text-slate-500">{detail}</span></span></label></li>;
          })}
        </ol>
        <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.05] p-3 text-[10px] leading-5 text-amber-100"><b>Reliability rule:</b> if live evidence is not visible within 15 seconds, Stop, Reset Demo State, switch to Synthetic Preview, and continue the same reasoning story.</div>
      </aside>
    </div>
  );
}

function GuideAction({ label, detail, onClick }: { label: string; detail: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-lg border border-white/10 bg-black/20 p-3 text-left hover:border-cyan-300/30 hover:bg-cyan-300/[0.04] focus-visible:outline-2 focus-visible:outline-cyan-200"><span className="block text-[11px] font-semibold text-white">{label}</span><span className="mt-1 block text-[9px] leading-4 text-slate-500">{detail}</span></button>;
}
