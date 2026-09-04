import Link from "next/link";

import { AgentRailAnalytics } from "@/components/discovery/AgentRailAnalytics";
import { DiscoveryNav } from "@/components/discovery/DiscoveryNav";
import { JsonLd } from "@/components/discovery/JsonLd";
import { ModuleHero, ModulePageShell, ModulePanel, ModuleStatusStrip } from "@/components/one/ModulePrimitives";
import { VoiceOpenLabNav } from "@/components/voice-open-lab/VoiceOpenLabNav";
import {
  benchmarkCategoryCatalog,
  benchmarkMethodologyCatalog,
} from "@/lib/evaluation/benchmark-catalog";
import {
  BENCHMARK_LEADERBOARD_VERSION,
  BENCHMARK_METHODOLOGY_VERSION,
  BENCHMARK_SCHEMA_VERSION,
} from "@/lib/evaluation/benchmark-schema";
import {
  EVALUATION_METRIC_VERSION,
  EVALUATION_METHODOLOGY_VERSION,
  EVALUATION_SCHEMA_VERSION,
} from "@/lib/evaluation/schema";
import { createPublicMetadata } from "@/lib/public-evidence/metadata";
import { getPublicMethodology } from "@/lib/public-evidence/registry";
import { getMethodologyJsonLd } from "@/lib/public-evidence/structured-data";

export const metadata = createPublicMetadata({
  title: "Evaluation Methodology",
  description: "How ONE Voice Lab treats fixtures, equivalent comparisons, latency, transcript quality, business outcomes, and human review.",
  path: "/methodology",
});

export default function MethodologyPage() {
  const methodology = getPublicMethodology();
  return (
    <ModulePageShell className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <AgentRailAnalytics surface="methodology" />
      <JsonLd data={getMethodologyJsonLd(methodology)} />
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <VoiceOpenLabNav current="learn" />
        <DiscoveryNav />
        <ModuleHero eyebrow={`Evaluation methodology · version ${methodology.version}`} title={methodology.name} outcome={methodology.description} />
        <ModuleStatusStrip label="Methodology status" items={[
          { label: "Version", value: methodology.version, tone: "purple" },
          { label: "Last verified", value: methodology.lastVerifiedAt, tone: "neutral" },
          { label: "Production claim", value: "None", tone: "green" },
          { label: "Human review", value: "Required", tone: "amber" },
        ]} />

        <ModulePanel title="Interpretation rules" description="The smallest honest unit is a dated observation with a disclosed fixture, configuration, environment, acceptance criterion, and limitation.">
          <ol className="space-y-3">
            {methodology.principles.map((principle, index) => (
              <li className="rounded-xl border border-white/10 bg-black/20 p-4" key={principle.id}>
                <h2 className="text-base font-semibold text-white">{index + 1}. {principle.title}</h2>
                <p className="mt-1 text-sm leading-6 text-slate-300">{principle.explanation}</p>
              </li>
            ))}
          </ol>
        </ModulePanel>

        <ModulePanel title="Evidence vocabulary" description="UI, API, OpenAPI, and MCP outputs use these meanings.">
          <dl className="grid gap-3 sm:grid-cols-2">
            {methodology.evidenceVocabulary.map((item) => (
              <div className="rounded-xl border border-white/10 bg-black/20 p-4" key={item.id}>
                <dt className="font-semibold text-white">{item.label}</dt>
                <dd className="mt-1 text-sm leading-6 text-slate-300">{item.meaning}</dd>
                <dd className="mt-2 font-mono text-xs text-slate-500">{item.id}</dd>
              </div>
            ))}
          </dl>
        </ModulePanel>

        <div id="stt-evaluation-availability">
          <ModulePanel
            title="Speech-to-text evaluation availability"
            description="STT evaluation is planned and not currently runnable."
          >
            <div className="space-y-3 text-sm leading-6 text-slate-300">
              <p>ONE does not currently run a speech-recognition benchmark or measure word error rate from this surface.</p>
              <p>The interactive Evaluate workspace compares TTS outputs. Its fixture results are not STT evidence and do not measure WER.</p>
            </div>
          </ModulePanel>
        </div>

        <ModulePanel title="Interactive TTS comparison" description="Evaluate aligns one script and comparable audio controls while disclosing every configuration that cannot be normalized fairly.">
          <ul className="space-y-2 text-sm leading-6 text-slate-300">
            <li>• Evidence schema <code>{EVALUATION_SCHEMA_VERSION}</code>; TTS method <code>{EVALUATION_METHODOLOGY_VERSION}</code>; metric method <code>{EVALUATION_METRIC_VERSION}</code>.</li>
            <li>• Server first-audio and completion intervals use a monotonic clock; browser time-to-playable is recorded separately.</li>
            <li>• Region provenance is explicit: ONE&apos;s server region is not presented as a provider processing region.</li>
            <li>• Audio duration and real-time factor are derived only from validated normalized audio.</li>
            <li>• Human ratings remain separate from measured evidence; Phase 1 does not display model-judged evidence or a composite winner score.</li>
            <li>• Cost stays unavailable unless an exact, dated, versioned pricing formula supports it.</li>
            <li>• Phase 1 protected and local live comparisons are Standardized-only until native formats have a validated portable playback and provenance boundary.</li>
            <li>• One scenario is evidence for that scenario, configuration, environment, and date—not a universal provider conclusion.</li>
          </ul>
          <div className="mt-4">
            <Link className="inline-flex min-h-11 items-center rounded-lg border border-violet-300/25 px-4 py-2 text-sm font-semibold text-violet-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-200" href="/evaluate">Open ONE Voice Lab — Evaluate</Link>
          </div>
        </ModulePanel>

        <ModulePanel title="Canonical benchmarks and metric leaderboards" description="Stage 3 aggregates only comparable observations and ranks one disclosed metric at a time. It never produces a universal provider score.">
          <ul className="space-y-2 text-sm leading-6 text-slate-300">
            <li>• Benchmark result schema <code>{BENCHMARK_SCHEMA_VERSION}</code>; methodology schema <code>{BENCHMARK_METHODOLOGY_VERSION}</code>; leaderboard schema <code>{BENCHMARK_LEADERBOARD_VERSION}</code>.</li>
            <li>• Objective measurements, human judgments, automated judgments, and provider-documented claims remain separate evidence classes.</li>
            <li>• A repeated-run series must match its suite, case/input, methodology, exact provider/model/configuration, deployment, region, transport, and media boundary.</li>
            <li>• A scoring profile fixes the measurement source, point, clock, observation class, method, and source-schema version; provider-reported and ONE-observed latency are never pooled.</li>
            <li>• Partial runs retain exact provider-lane source identity, so one successful lane can remain inspectable while a failed lane receives its own exclusion.</li>
            <li>• Median is withheld below three samples; p95 is withheld below twenty. Sample count is always displayed.</li>
            <li>• Public ranking requires explicit eligibility, consent, comparable evidence, freshness, publication review, and verified integrity. Private and synthetic results are excluded.</li>
            <li>• SHA-256 proves canonical payload integrity. Optional Ed25519 signing is a separate server-only proof and is not configured by default.</li>
          </ul>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {benchmarkCategoryCatalog.map((category) => {
              const categoryMethodology = benchmarkMethodologyCatalog.find((item) => item.category === category.id);
              return (
                <article className="rounded-xl border border-white/10 bg-black/20 p-4" key={category.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold text-white">{category.name}</h3>
                    <span className="rounded-full border border-white/15 px-2 py-1 text-xs text-slate-300">{category.implementation}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{category.description}</p>
                  <p className="mt-2 font-mono text-xs text-slate-500">
                    {categoryMethodology ? `${categoryMethodology.methodologyId}@${categoryMethodology.version}` : "No methodology registered"}
                  </p>
                </article>
              );
            })}
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-400">
            The current on-screen leaderboard is a tied, nonbillable synthetic fixture used to verify the generic path. It is not public evidence and makes no provider quality, latency, availability, entitlement, or pricing claim.
          </p>
        </ModulePanel>

        <ModulePanel title="Safety constraints">
          <ul className="space-y-2 text-sm leading-6 text-slate-300">{methodology.safetyConstraints.map((constraint) => <li key={constraint}>• {constraint}</li>)}</ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <a className="inline-flex min-h-11 items-center rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-cyan-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200" href="/api/public/v1/methodology">Read methodology JSON</a>
            <Link className="inline-flex min-h-11 items-center rounded-lg border border-emerald-300/20 px-4 py-2 text-sm font-semibold text-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-200" href="/evals/interrupt-mid-response">Open canonical synthetic evaluation</Link>
          </div>
        </ModulePanel>
      </div>
    </ModulePageShell>
  );
}
