"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { ARCHITECTURE_HANDOFF_KEY } from "@/lib/live-solution-studio";

const PROVIDERS = [
  { id: "deepgram", name: "Deepgram", role: "Speech recognition, turn-aware voice flows, and speech output through verified Lab paths." },
  { id: "fish-audio", name: "Fish Audio", role: "Expressive speech generation and the currently labeled Speech to Text beta adapter." },
  { id: "elevenlabs", name: "ElevenLabs", role: "Voice and speech generation comparison through a provider-specific adapter boundary." },
] as const;

export function StudioIntake() {
  const [goal, setGoal] = useState("");
  const [stack, setStack] = useState("");
  const [hosting, setHosting] = useState("");
  const [providers, setProviders] = useState<string[]>(["deepgram"]);
  const [resource, setResource] = useState<{ name: string; text: string } | null>(null);
  const [notice, setNotice] = useState("");

  const selectedProviders = useMemo(() => PROVIDERS.filter((provider) => providers.includes(provider.id)), [providers]);
  const ready = goal.trim().length >= 10 && stack.trim() && hosting.trim() && selectedProviders.length > 0;

  function toggleProvider(id: string) {
    setProviders((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  async function readResource(file: File | undefined) {
    if (!file) return;
    const allowed = /\.(txt|md|json|ya?ml)$/i.test(file.name);
    if (!allowed || file.size > 256 * 1024) {
      setNotice("Choose a .txt, .md, .json, .yaml, or .yml resource under 256 KB.");
      return;
    }
    const text = (await file.text()).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").slice(0, 256 * 1024);
    setResource({ name: file.name, text });
    setNotice("Resource opened only in this browser. It has not been uploaded.");
  }

  function openArchitecture() {
    if (!ready) {
      setNotice("Add a goal, stack, hosting choice, and at least one provider first.");
      return;
    }
    const context = [
      { label: "Tech stack", value: stack.trim().slice(0, 200) },
      { label: "Hosting", value: hosting.trim().slice(0, 120) },
      { label: "Provider path", value: selectedProviders.map((provider) => provider.name).join(" + ") },
      ...(resource ? [{ label: "Local resource reviewed", value: `${resource.name} (${resource.text.length.toLocaleString()} characters; contents not transferred in this handoff)` }] : []),
    ];
    window.sessionStorage.setItem(ARCHITECTURE_HANDOFF_KEY, JSON.stringify({ schemaVersion: 1, problem: goal.trim().slice(0, 500), context, lanes: ["discovery", "architecture", "evaluation"], createdAt: new Date().toISOString() }));
    window.location.assign("/architecture-studio");
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-5 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr]">
      <section className="rounded-3xl border border-white/10 bg-black/25 p-5 sm:p-7" aria-labelledby="studio-intake-title">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-300">One front door</p>
        <h2 className="mt-2 text-2xl font-semibold text-white" id="studio-intake-title">Describe the real environment</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">Start with the outcome, not a model. The next workspace turns this bounded intake into discovery questions, architecture, Mermaid, Markdown, PDF, and slides.</p>
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-medium text-slate-200">What should the voice system help a human do?<textarea className="mt-2 min-h-28 w-full rounded-2xl border border-white/15 bg-slate-950/80 p-4 text-white outline-none focus:border-purple-300" maxLength={500} placeholder="Example: Help support agents understand calls faster while preserving a clear human handoff." value={goal} onChange={(event) => setGoal(event.target.value)} /></label>
          <label className="block text-sm font-medium text-slate-200">Current tech stack<input className="mt-2 min-h-12 w-full rounded-xl border border-white/15 bg-slate-950/80 px-4 text-white outline-none focus:border-purple-300" maxLength={200} placeholder="Example: Next.js, Twilio, Salesforce, TypeScript" value={stack} onChange={(event) => setStack(event.target.value)} /></label>
          <label className="block text-sm font-medium text-slate-200">Hosting / runtime<input className="mt-2 min-h-12 w-full rounded-xl border border-white/15 bg-slate-950/80 px-4 text-white outline-none focus:border-purple-300" maxLength={120} placeholder="Example: Vercel + US-based managed services" value={hosting} onChange={(event) => setHosting(event.target.value)} /></label>
          <fieldset><legend className="text-sm font-medium text-slate-200">Provider path</legend><div className="mt-2 grid gap-2 sm:grid-cols-3">{PROVIDERS.map((provider) => <label className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-sm text-slate-200" key={provider.id}><input checked={providers.includes(provider.id)} type="checkbox" onChange={() => toggleProvider(provider.id)} /> {provider.name}</label>)}</div></fieldset>
          <label className="block rounded-2xl border border-dashed border-purple-300/30 bg-purple-300/[0.04] p-4 text-sm text-slate-200">Optional local resource<input className="mt-2 block w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-purple-300 file:px-3 file:py-2 file:font-semibold file:text-slate-950" type="file" accept=".txt,.md,.json,.yaml,.yml,text/plain,text/markdown,application/json" onChange={(event) => void readResource(event.target.files?.[0])} /><span className="mt-2 block text-xs leading-5 text-slate-400">Read in browser memory only. Do not add credentials, private customer records, or regulated data.</span></label>
          {resource ? <details className="rounded-xl border border-white/10 bg-slate-950/70 p-3"><summary className="cursor-pointer text-sm font-semibold text-white">{resource.name} · {resource.text.length.toLocaleString()} characters</summary><pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap text-xs leading-5 text-slate-400">{resource.text.slice(0, 1_200)}</pre></details> : null}
        </div>
      </section>

      <section className="rounded-3xl border border-purple-300/20 bg-purple-300/[0.05] p-5 sm:p-7" aria-labelledby="studio-flow-title">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-300">Live pathway preview</p>
        <h2 className="mt-2 text-2xl font-semibold text-white" id="studio-flow-title">See how the pieces connect</h2>
        <ol className="mt-6 space-y-3">
          <FlowStep number="01" title="Human or system input" detail={resource ? `${resource.name} plus the goal and environment above` : "Microphone, audio, text, or an application event"} />
          {selectedProviders.length ? selectedProviders.map((provider, index) => <FlowStep key={provider.id} number={String(index + 2).padStart(2, "0")} title={provider.name} detail={provider.role} />) : <FlowStep number="02" title="Choose a provider" detail="Select one provider for a focused path or several for a composable comparison." />}
          <FlowStep number={String(selectedProviders.length + 2).padStart(2, "0")} title="Human-controlled orchestration" detail="Your application owns routing, consent, fallbacks, tool calls, and the decision to continue or hand off." />
          <FlowStep number={String(selectedProviders.length + 3).padStart(2, "0")} title="Reviewable output" detail="Evidence-labeled recommendations, Mermaid flow, Markdown brief, branded PDF, and presentation slides." />
        </ol>
        <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-slate-300"><strong className="text-white">One provider:</strong> simpler operations and clearer ownership. <strong className="text-white">Multiple providers:</strong> more flexibility and comparison, with extra routing, policy, and failure boundaries to own.</div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button className="min-h-12 rounded-2xl bg-purple-400 px-4 font-semibold text-slate-950 disabled:opacity-45" disabled={!ready} type="button" onClick={openArchitecture}>Design the architecture</button>
          <Link className="flex min-h-12 items-center justify-center rounded-2xl border border-white/15 px-4 font-semibold text-white" href="/providers">Compare provider evidence</Link>
          <Link className="flex min-h-12 items-center justify-center rounded-2xl border border-white/15 px-4 font-semibold text-white sm:col-span-2" href="/pre-sales-studio">Open the specialist discovery guide</Link>
        </div>
        <p className="mt-3 min-h-6 text-sm text-slate-300" role="status" aria-live="polite">{notice}</p>
      </section>
    </div>
  );
}

function FlowStep({ number, title, detail }: { number: string; title: string; detail: string }) {
  return <li className="grid grid-cols-[2.5rem_1fr] gap-3 rounded-2xl border border-white/10 bg-black/20 p-4"><span className="font-mono text-xs text-purple-300">{number}</span><div><h3 className="font-semibold text-white">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-400">{detail}</p></div></li>;
}
