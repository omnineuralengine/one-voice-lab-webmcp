import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AgentRailAnalytics } from "@/components/discovery/AgentRailAnalytics";
import { DiscoveryNav } from "@/components/discovery/DiscoveryNav";
import { JsonLd } from "@/components/discovery/JsonLd";
import { SyntheticEvalRunner } from "@/components/discovery/SyntheticEvalRunner";
import { ModuleHero, ModulePageShell, ModulePanel, ModuleStatusStrip } from "@/components/one/ModulePrimitives";
import { VoiceOpenLabNav } from "@/components/voice-open-lab/VoiceOpenLabNav";
import { createPublicMetadata } from "@/lib/public-evidence/metadata";
import { getPublicEval, getPublicEvals } from "@/lib/public-evidence/registry";
import { getEvalJsonLd } from "@/lib/public-evidence/structured-data";

export const dynamicParams = false;

export function generateStaticParams() {
  return getPublicEvals({}).map((evaluation) => ({ eval: evaluation.id }));
}
export async function generateMetadata(
  { params }: { params: Promise<{ eval: string }> },
): Promise<Metadata> {
  const { eval: evalId } = await params;
  const evaluation = getPublicEval(evalId);
  if (!evaluation) return {};
  return createPublicMetadata({
    title: `${evaluation.name} evaluation`,
    description: `${evaluation.description} Evidence: ${evaluation.evidenceLabel}; deterministic and nonbillable.`,
    path: `/evals/${evaluation.id}`,
  });
}

export default async function EvalPage(
  { params }: { params: Promise<{ eval: string }> },
) {
  const { eval: evalId } = await params;
  const evaluation = getPublicEval(evalId);
  if (!evaluation) notFound();

  return (
    <ModulePageShell className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <AgentRailAnalytics recordId={evaluation.id} surface="eval" />
      <JsonLd data={getEvalJsonLd(evaluation)} />
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <VoiceOpenLabNav current="simulate" />
        <DiscoveryNav />
        <ModuleHero eyebrow="Deterministic evaluation · simulated evidence" title={evaluation.name} outcome={evaluation.description} actions={(
          <Link className="inline-flex min-h-11 items-center rounded-lg border border-cyan-300/20 px-4 py-2 text-sm font-semibold text-cyan-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200" href="/methodology">Read evaluation methodology</Link>
        )} />
        <ModuleStatusStrip label={`${evaluation.name} status`} items={[
          { label: "Evidence", value: "Simulated", tone: "purple" },
          { label: "Provider calls", value: "None", tone: "green" },
          { label: "Billable", value: "No", tone: "green" },
          { label: "Last verified", value: evaluation.lastVerifiedAt, tone: "neutral" },
        ]} />

        <ModulePanel title="Reproduction record" description={evaluation.hypothesis}>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4"><dt className="text-slate-500">Stable evaluation ID</dt><dd className="mt-1 font-mono text-white">{evaluation.id}</dd></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4"><dt className="text-slate-500">Fixture version</dt><dd className="mt-1 font-mono text-white">{evaluation.fixture.version}</dd></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4"><dt className="text-slate-500">Fixture hash</dt><dd className="mt-1 break-all font-mono text-white">{evaluation.fixture.hash}</dd></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4"><dt className="text-slate-500">Environment</dt><dd className="mt-1 text-white">Local deterministic simulation</dd></div>
          </dl>
          <h3 className="mt-5 text-base font-semibold text-white">Task and acceptance criteria</h3>
          <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-300">{evaluation.task.map((task) => <li key={task}>• {task}</li>)}</ul>
        </ModulePanel>

        <ModulePanel title="Run the public fixture" description="The browser calls the versioned public endpoint, which invokes the shared deterministic evaluator used by MCP. No live provider path is imported or called.">
          <SyntheticEvalRunner evalId={evaluation.id} />
        </ModulePanel>

        <ModulePanel title="Review criteria">
          <ul className="space-y-2">{evaluation.qualitativeReviewCriteria.map((criterion) => (
            <li className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300" key={criterion.id}>
              <strong className="text-white">{criterion.id}</strong> · {criterion.dimension}
              <p className="mt-1">Expected: {criterion.expected}</p>
              <p className="mt-1 text-slate-500">{criterion.requiresHumanReview ? "Human review required" : "Deterministic assertion"}</p>
            </li>
          ))}</ul>
        </ModulePanel>

        <ModulePanel title="Limitations">
          <ul className="space-y-2 text-sm leading-6 text-slate-300">{evaluation.limitations.map((limitation) => <li key={limitation}>• {limitation}</li>)}</ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <a className="inline-flex min-h-11 items-center rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-cyan-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200" href={`/api/public/v1/evals/${evaluation.id}`}>Read evaluation JSON</a>
            <Link className="inline-flex min-h-11 items-center rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-cyan-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200" href="/providers">Compare listed provider states</Link>
          </div>
        </ModulePanel>
      </div>
    </ModulePageShell>
  );
}
