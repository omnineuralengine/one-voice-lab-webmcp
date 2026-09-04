"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";

import { STAKEHOLDER_ROLES, STUDIO_STAGES } from "@/data/architecture-studio-discovery";
import { STUDIO_SCENARIO_PRESETS, getScenarioPreset } from "@/data/architecture-studio-scenarios";
import { writeLocalPresenterToken, writeLocalSession, writePresenterNavigationToken } from "@/hooks/use-architecture-studio-session";
import { Panel, PrototypeNotice, StatusPill, StudioBrand, StudioFrame, studioButton, studioInput, studioPrimaryButton } from "@/components/architecture-studio/StudioPrimitives";
import type { SessionCreateResponse, StudioScenarioId } from "@/types/architecture-studio";
import { ARCHITECTURE_HANDOFF_KEY } from "@/lib/live-solution-studio";

export function StudioLanding({ configuredMode }: { configuredMode: "supabase" | "local-demo" }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [scenarioId, setScenarioId] = useState<StudioScenarioId>("northstar-contact-cloud");
  const [customScenarioName, setCustomScenarioName] = useState("");
  const [liveSolutionContext, setLiveSolutionContext] = useState("");
  const selectedScenario = getScenarioPreset(scenarioId);

  useEffect(() => {
    const raw = window.sessionStorage.getItem(ARCHITECTURE_HANDOFF_KEY);
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as { problem?: unknown; context?: Array<{ label?: unknown; value?: unknown }> };
      if (typeof payload.problem !== "string") return;
      const problem = payload.problem.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, 500);
      const facts = Array.isArray(payload.context) ? payload.context.filter((item) => typeof item.label === "string" && typeof item.value === "string").slice(0, 8).map((item) => `${item.label}: ${item.value}`).join(" · ") : "";
      queueMicrotask(() => { setScenarioId("custom"); setCustomScenarioName(problem.slice(0, 80)); setLiveSolutionContext([problem, facts].filter(Boolean).join(" — ")); });
    } catch { window.sessionStorage.removeItem(ARCHITECTURE_HANDOFF_KEY); }
  }, []);

  async function createSession() {
    setCreating(true);
    setError("");
    try {
      const response = await fetch("/api/architecture-studio/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId, customScenarioName: scenarioId === "custom" ? customScenarioName : undefined }),
      });
      const payload = await response.json() as SessionCreateResponse & { error?: string };
      if (!response.ok || !payload.session || !payload.presenterToken) throw new Error(payload.error ?? "session_creation_failed");
      if (payload.mode === "local-demo") {
        writeLocalSession(payload.session);
        writeLocalPresenterToken(payload.session.code, payload.presenterToken);
      }
      writePresenterNavigationToken(payload.session.code, payload.presenterToken);
      router.push(`/architecture-studio/session/${payload.session.code}/presenter`);
    } catch {
      setError("The workshop could not start. Retry once; Local Demo Mode will be used if realtime is unavailable.");
      setCreating(false);
    }
  }

  function joinSession(event: React.FormEvent) {
    event.preventDefault();
    const normalized = code.toUpperCase().replace(/[^A-Z2-9]/g, "");
    if (normalized.length !== 6) { setError("Enter the six-character session code from the presenter."); return; }
    router.push(`/architecture-studio/session/${normalized}`);
  }

  return (
    <StudioFrame>
      <header className="border-b border-white/10 bg-[#061016]/88 px-5 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3"><StudioBrand /><div className="flex items-center gap-2"><StatusPill tone={configuredMode === "supabase" ? "green" : "amber"}>{configuredMode === "supabase" ? "Shared sessions ready" : "Local Demo fallback"}</StatusPill><Link href="/" className={studioButton}>Return to Learning Lab</Link></div></div>
      </header>
      <PrototypeNotice />

      <div className="mx-auto max-w-7xl px-5 py-10 sm:py-16">
        <div className="grid items-start gap-10 lg:grid-cols-[1.15fr_.85fr]">
          <section>
            <div className="flex flex-wrap gap-2"><StatusPill tone="cyan">Live discovery</StatusPill><StatusPill tone="violet">CCaaS scenario</StatusPill><StatusPill tone="green">Explainable architecture</StatusPill></div>
            <h1 className="mt-6 max-w-4xl text-4xl font-semibold leading-[1.08] tracking-[-0.03em] text-white sm:text-6xl">Design the right voice architecture <span className="text-cyan-100/70">with the customer in the room.</span></h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-slate-400">A temporary, transparent solution-engineering workspace. Stakeholders answer one meaningful question at a time while the architecture, tradeoffs, evaluation plan, and relevant Learning Lab path evolve in public.</p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <ValueCard number="01" title="Discover" detail="Business goals, media reality, governance, and success gates." />
              <ValueCard number="02" title="Explain" detail="Deterministic rules show exactly why the current recommendation moved." />
              <ValueCard number="03" title="Evaluate" detail="Finish with a measurable prototype-to-production path." />
            </div>
          </section>

          <Panel className="overflow-hidden">
            {liveSolutionContext ? <div className="border-b border-cyan-200/15 bg-cyan-200/[0.05] p-4" data-testid="live-solution-handoff"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-200">Context received from Live Solution Studio</p><p className="mt-2 text-xs leading-5 text-slate-300">{liveSolutionContext}</p><p className="mt-1 text-[10px] text-slate-500">Review and correct this local, session-scoped context before creating the workshop.</p></div> : null}
            <div className="border-b border-white/[0.08] p-5"><div className="flex items-center justify-between gap-3"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-100/65">Start the guided workshop</p><StatusPill tone="violet">Synthetic demo data</StatusPill></div><h2 className="mt-2 text-xl font-semibold text-white">{selectedScenario?.name ?? (customScenarioName.trim() || "Custom fictional scenario")}</h2><p className="mt-2 text-xs leading-5 text-slate-400">{selectedScenario?.shortDescription ?? "Start with only a fictional company name and discover the architecture live."}</p></div>
            <div className="space-y-5 p-5">
              <fieldset>
                <legend className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Choose a scenario</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {STUDIO_SCENARIO_PRESETS.map((scenario) => <button key={scenario.id} type="button" aria-pressed={scenarioId === scenario.id} onClick={() => setScenarioId(scenario.id)} className={`rounded-xl border p-3 text-left focus-visible:outline-2 focus-visible:outline-cyan-200 ${scenarioId === scenario.id ? "border-cyan-200/35 bg-cyan-200/[0.08]" : "border-white/[0.08] bg-black/15 hover:border-white/15"}`}><span className="block text-xs font-semibold text-white">{scenario.name}</span><span className="mt-1 block text-[11px] leading-4 text-slate-400">{scenario.recommendedFor}</span></button>)}
                  <button type="button" aria-pressed={scenarioId === "custom"} onClick={() => setScenarioId("custom")} className={`rounded-xl border p-3 text-left focus-visible:outline-2 focus-visible:outline-cyan-200 ${scenarioId === "custom" ? "border-cyan-200/35 bg-cyan-200/[0.08]" : "border-white/[0.08] bg-black/15 hover:border-white/15"}`}><span className="block text-xs font-semibold text-white">Create custom scenario</span><span className="mt-1 block text-[11px] leading-4 text-slate-400">Begin with a fictional name and no hidden conclusion.</span></button>
                </div>
                {scenarioId === "custom" ? <label className="mt-3 block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-400">Fictional scenario name</span><input value={customScenarioName} onChange={(event) => setCustomScenarioName(event.target.value)} maxLength={80} className={studioInput} placeholder="Example Contact Cloud" /></label> : null}
              </fieldset>
              <div>
                <button type="button" onClick={() => void createSession()} disabled={creating || (scenarioId === "custom" && !customScenarioName.trim())} className={`${studioPrimaryButton} w-full`}>{creating ? "Creating temporary session…" : "Create presenter session"}</button>
                <p className="mt-2 text-center text-[11px] leading-4 text-slate-400">Expires automatically after four hours. No account required.</p>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400"><span className="h-px flex-1 bg-white/[0.08]" />or join as stakeholder<span className="h-px flex-1 bg-white/[0.08]" /></div>
              <form onSubmit={joinSession} className="flex gap-2"><label className="flex-1"><span className="sr-only">Session code</span><input value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6))} className={`${studioInput} text-center font-mono text-base tracking-[0.28em]`} placeholder="ABC234" autoComplete="off" /></label><button type="submit" className={studioButton}>Join</button></form>
              {error ? <p role="alert" className="rounded-lg border border-rose-200/15 bg-rose-200/[0.05] p-3 text-[12px] leading-4 text-rose-100">{error}</p> : null}
              {configuredMode === "local-demo" ? <div className="rounded-lg border border-amber-200/15 bg-amber-200/[0.04] p-3"><p className="text-[12px] font-semibold text-amber-100">Local Demo Mode</p><p className="mt-1 text-[11px] leading-4 text-amber-50/65">The full workshop works in this browser and synchronizes across its tabs. Configure Supabase to share across devices.</p></div> : null}
            </div>
          </Panel>
        </div>

        <section className="mt-16 grid gap-8 border-t border-white/[0.08] pt-10 lg:grid-cols-[.8fr_1.2fr]">
          <div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-100/60">Progressive, not overwhelming</p><h2 className="mt-3 text-2xl font-semibold text-white">Six stages. One shared truth.</h2><p className="mt-3 text-sm leading-6 text-slate-400">The presenter reveals only the next useful question. Role-specific lenses keep business, platform, and security stakeholders contributing to the same profile.</p><div className="mt-5 space-y-2">{STAKEHOLDER_ROLES.slice(0, 3).map((role) => <div key={role.id} className="rounded-lg border border-white/[0.07] bg-black/15 p-3"><p className="text-xs font-semibold text-slate-300">{role.label}</p><p className="mt-1 text-[12px] text-slate-400">{role.focus}</p></div>)}</div></div>
          <div className="grid gap-2 sm:grid-cols-2">{STUDIO_STAGES.map((stage) => <article key={stage.id} className="rounded-xl border border-white/[0.07] bg-[#071016]/60 p-4"><div className="flex items-start gap-3"><span className="font-mono text-xs text-cyan-100/50">0{stage.number}</span><div><h3 className="text-sm font-semibold text-white">{stage.label}</h3><p className="mt-1 text-[12px] leading-4 text-slate-400">{stage.purpose}</p></div></div></article>)}</div>
        </section>
      </div>
    </StudioFrame>
  );
}

function ValueCard({ number, title, detail }: { number: string; title: string; detail: string }) {
  return <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4"><p className="font-mono text-[11px] text-cyan-100/45">{number}</p><p className="mt-2 text-sm font-semibold text-white">{title}</p><p className="mt-1 text-[12px] leading-4 text-slate-400">{detail}</p></div>;
}
