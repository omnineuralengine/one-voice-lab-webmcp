import type { Metadata } from "next";
import Link from "next/link";

import { VoiceOpenLabNav } from "@/components/voice-open-lab/VoiceOpenLabNav";
import { resolveHumanIdentity } from "@/lib/auth/human-identity";
import { getOneSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bench",
  description: "A member preview bench for bounded, evidence-labeled Deepgram experiments in ONE Voice Lab.",
  robots: { index: false, follow: false },
};

const BENCH_TRACKS = [
  {
    title: "Creator preview intake",
    status: "Member preview",
    detail: "A review lane for newly announced Deepgram capabilities before they are promoted into the public Lab.",
    guardrail: "No capability is labeled working until current documentation and a bounded repository path are both verified.",
  },
  {
    title: "Fast-turn voice experiments",
    status: "Synthetic first",
    detail: "Replay turn timing, interruption, recovery, and speech output with controlled evidence before spending provider credits.",
    guardrail: "Live execution remains behind the same quota, allowlist, and global kill-switch boundaries as the public playground.",
  },
  {
    title: "Cross-provider comparison rig",
    status: "Design track",
    detail: "Run one neutral scenario through Deepgram, Fish Audio, and ElevenLabs adapters without hiding provider-specific tradeoffs.",
    guardrail: "The Lab never claims identical models, voices, latency, or policy behavior across providers.",
  },
] as const;

export default async function BenchPage() {
  const client = await getOneSupabaseServerClient();
  const identity = await resolveHumanIdentity(client);
  const hasMemberIdentity = identity.kind === "human";

  return (
    <main className="voice-open-route-shell min-h-screen pb-28">
      <VoiceOpenLabNav />
      <header className="voice-open-route-hero">
        <p>ONE member preview · Deepgram creator program</p>
        <h1>Bench</h1>
        <span>A controlled proving ground for newly announced voice capabilities—synthetic first, live only after evidence and spend boundaries pass review.</span>
        <div><strong>Member access</strong><strong>Evidence labeled</strong><strong>Kill switches stay active</strong></div>
      </header>
      {hasMemberIdentity ? (
        <section className="mx-auto grid w-full max-w-5xl gap-4 px-4 sm:grid-cols-3 sm:px-6" aria-label="Bench tracks">
          {BENCH_TRACKS.map((track) => (
            <article className="rounded-3xl border border-purple-300/20 bg-purple-300/[0.06] p-5" key={track.title}>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-purple-300">{track.status}</p>
              <h2 className="mt-2 text-xl font-semibold text-white">{track.title}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">{track.detail}</p>
              <p className="mt-5 border-t border-white/10 pt-4 text-xs leading-5 text-slate-400"><strong className="text-slate-200">Boundary:</strong> {track.guardrail}</p>
            </article>
          ))}
          <div className="sm:col-span-3 flex flex-wrap gap-3 rounded-2xl border border-white/10 bg-black/20 p-4">
            <Link className="rounded-xl bg-purple-400 px-4 py-3 font-semibold text-slate-950" href="/simulation-lab">Open Simulation Lab</Link>
            <Link className="rounded-xl border border-white/15 px-4 py-3 font-semibold text-white" href="/studio">Design a provider flow</Link>
            <Link className="rounded-xl border border-white/15 px-4 py-3 font-semibold text-white" href="/settings#identity">Member settings</Link>
          </div>
        </section>
      ) : (
        <section className="mx-auto w-full max-w-2xl rounded-3xl border border-purple-300/20 bg-black/25 p-6 text-center sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-purple-300">Guest Mode</p>
          <h2 className="mt-3 text-2xl font-semibold text-white">Bench is a member preview Lab</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">The public playground, provider Rolodex, learning modules, and synthetic simulations remain open. A free ONE identity adds Bench access, synced preferences, saved experiments, and a larger protected usage allowance.</p>
          <Link className="mt-6 inline-flex min-h-12 items-center rounded-2xl bg-purple-400 px-5 font-semibold text-slate-950" href="/settings#identity">Sign in or create a ONE identity</Link>
        </section>
      )}
    </main>
  );
}
