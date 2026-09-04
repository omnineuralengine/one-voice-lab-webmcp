import type { Metadata } from "next";
import Link from "next/link";

import { VoiceOpenLabNav } from "@/components/voice-open-lab/VoiceOpenLabNav";
import { createPublicMetadata } from "@/lib/public-evidence/metadata";

export const metadata: Metadata = createPublicMetadata({
  title: "Membership and future payments",
  description: "Understand ONE Voice Lab membership, wallet sign-in, protected usage allowances, and the planned card and USDC payment boundary.",
  path: "/membership",
});

const MEMBERSHIP_BOUNDARIES = [
  {
    title: "Identity is optional",
    detail: "Guest Mode remains the fastest way to explore. A ONE identity adds synced preferences, saved experiments, Bench previews, and a larger finite allowance.",
  },
  {
    title: "A signature is not a payment",
    detail: "Google, email, MetaMask, and WalletConnect are sign-in methods. Wallet authentication never authorizes a transfer or proves that anything was purchased.",
  },
  {
    title: "Paid access stays bounded",
    detail: "Future membership can add usage, but it will not remove provider budgets, abuse controls, rate limits, or the Lab-wide emergency pause.",
  },
] as const;

export default function MembershipPage() {
  return (
    <main className="voice-open-route-shell min-h-screen pb-28">
      <VoiceOpenLabNav />
      <header className="voice-open-route-hero">
        <p>ONE membership · clear boundaries first</p>
        <h1>Simple access without hidden authority</h1>
        <span>Membership is being designed around easy sign-in, finite protected usage, and a future hosted checkout that can support cards and USDC.</span>
        <div><strong>Guest Mode stays open</strong><strong>Payments are off today</strong><strong>No wallet custody</strong></div>
      </header>

      <section className="mx-auto grid w-full max-w-5xl gap-4 px-4 sm:px-6" aria-labelledby="membership-status-title">
        <article className="rounded-3xl border border-amber-300/25 bg-amber-300/[0.06] p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Current status</p>
          <h2 className="mt-2 text-2xl font-semibold text-white" id="membership-status-title">Payments are not enabled</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">There is no Buy button, checkout endpoint, token approval, treasury wallet, or automatic transaction in this release. This page establishes the promise before money movement exists.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="inline-flex min-h-12 items-center rounded-2xl bg-purple-400 px-5 font-semibold text-slate-950" href="/settings#identity">Use Guest Mode or create an identity</Link>
            <Link className="inline-flex min-h-12 items-center rounded-2xl border border-white/15 px-5 font-semibold text-white" href="/feedback">Shape membership with feedback</Link>
          </div>
        </article>

        <div className="grid gap-4 md:grid-cols-3">
          {MEMBERSHIP_BOUNDARIES.map((boundary) => (
            <article className="rounded-3xl border border-purple-300/20 bg-purple-300/[0.06] p-5" key={boundary.title}>
              <h2 className="text-lg font-semibold text-white">{boundary.title}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">{boundary.detail}</p>
            </article>
          ))}
        </div>

        <article className="rounded-3xl border border-emerald-300/20 bg-emerald-300/[0.05] p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">Planned first payment rail</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Hosted checkout, verified before access changes</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">The first production payment release is planned around a hosted checkout that can accept conventional payment methods and USDC. ONE will grant membership or credits only after the payment provider sends a server-verified confirmation—not because a browser returned to a success page.</p>
          <ol className="mt-6 grid gap-3 text-sm leading-6 text-slate-300 sm:grid-cols-2">
            <li className="rounded-2xl border border-white/10 bg-black/20 p-4"><strong className="text-white">1 · Choose intentionally</strong><br />The human selects a published membership or usage bundle.</li>
            <li className="rounded-2xl border border-white/10 bg-black/20 p-4"><strong className="text-white">2 · Pay with the provider</strong><br />The hosted checkout handles wallet choice, screening, and confirmation.</li>
            <li className="rounded-2xl border border-white/10 bg-black/20 p-4"><strong className="text-white">3 · Verify on the server</strong><br />A signed, replay-safe event is matched to the ONE identity and order.</li>
            <li className="rounded-2xl border border-white/10 bg-black/20 p-4"><strong className="text-white">4 · Add finite access</strong><br />The entitlement changes without weakening the global safety ceiling.</li>
          </ol>
        </article>
      </section>
    </main>
  );
}
