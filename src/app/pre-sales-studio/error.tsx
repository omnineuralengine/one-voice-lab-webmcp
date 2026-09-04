"use client";

import Link from "next/link";

export default function PreSalesStudioError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="flex min-h-screen items-center justify-center bg-[#020608] p-5 text-slate-200"><div className="max-w-lg rounded-2xl border border-rose-200/15 bg-[#071016] p-8"><p className="text-xs font-bold uppercase tracking-[.16em] text-rose-100/65">Workshop recovery</p><h1 className="mt-3 text-2xl font-semibold text-white">The Studio could not render this view.</h1><p className="mt-3 text-sm leading-6 text-slate-400">Your opt-in local copy remains in this browser. Retry the view, or return to the Learning Lab.</p><div className="mt-5 flex gap-3"><button type="button" onClick={reset} className="rounded-lg bg-cyan-200 px-4 py-2 text-xs font-bold text-slate-950">Retry</button><Link href="/" className="rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold">Learning Lab</Link></div></div></main>;
}
