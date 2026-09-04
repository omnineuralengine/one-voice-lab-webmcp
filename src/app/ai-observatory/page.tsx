import type { Metadata } from "next";
import Link from "next/link";

import { AiUsageObservatory } from "@/components/ai/AiUsageObservatory";

export const metadata: Metadata = { title: "AI Usage Observatory", description: "Inspect privacy-conscious Applied Voice AI usage metadata for this anonymous browser session.", robots: { index: false, follow: false } };

export default function AiObservatoryPage() {
  return <main className="min-h-screen bg-[#03080d] px-4 py-8 text-slate-200"><div className="mx-auto max-w-6xl"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-300">Developer view · Prototype</p><h1 className="mt-2 text-2xl font-semibold text-white">AI Usage Observatory</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Review safe operational metadata from this random browser session. The current store is per-instance memory, so it is not a durable billing ledger and may reset between requests or deployments.</p><div className="mt-4 flex gap-2"><Link href="/" className="rounded-md border border-white/10 px-3 py-2 text-xs focus-visible:outline-2 focus-visible:outline-cyan-200">Return to Lab</Link></div><div className="mt-6"><AiUsageObservatory /></div></div></main>;
}
