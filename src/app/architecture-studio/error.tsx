"use client";

import Link from "next/link";

import { StudioFrame, studioButton, studioPrimaryButton } from "@/components/architecture-studio/StudioPrimitives";

export default function ArchitectureStudioError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <StudioFrame><div className="grid min-h-screen place-items-center p-6"><div className="max-w-md rounded-2xl border border-rose-200/15 bg-[#071016] p-6 text-center"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-rose-100/70">Workshop recovery</p><h1 className="mt-3 text-xl font-semibold text-white">The Studio hit a recoverable error.</h1><p className="mt-3 text-sm leading-6 text-slate-500">Retry the route. If shared realtime is unavailable, create a new Local Demo Mode session; the page will remain usable in one browser.</p><div className="mt-6 flex justify-center gap-2"><button type="button" onClick={unstable_retry} className={studioPrimaryButton}>Try again</button><Link href="/architecture-studio" className={studioButton}>New session</Link></div></div></div></StudioFrame>;
}
