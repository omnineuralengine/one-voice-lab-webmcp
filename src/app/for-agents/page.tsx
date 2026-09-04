import Link from "next/link";

import { AgentRailAnalytics } from "@/components/discovery/AgentRailAnalytics";
import { DiscoveryNav } from "@/components/discovery/DiscoveryNav";
import { ModuleHero, ModulePageShell, ModulePanel, ModuleStatusStrip } from "@/components/one/ModulePrimitives";
import { VoiceOpenLabNav } from "@/components/voice-open-lab/VoiceOpenLabNav";
import { createPublicMetadata } from "@/lib/public-evidence/metadata";
import { getPublicLab } from "@/lib/public-evidence/lab";

export const metadata = createPublicMetadata({
  title: "For Browser and API Agents",
  description: "Stable links, semantic navigation, public JSON, OpenAPI, MCP tools, evidence vocabulary, and safety boundaries for agents using ONE Voice Lab.",
  path: "/for-agents",
});

export default function ForAgentsPage() {
  const lab = getPublicLab();
  return (
    <ModulePageShell className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <AgentRailAnalytics surface="for_agents" />
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <VoiceOpenLabNav current="learn" />
        <DiscoveryNav />
        <ModuleHero eyebrow="Agent discovery and interaction guide" title="For Agents" outcome="Use semantic links for browser navigation, versioned JSON for retrieval, or the MCP endpoint once explicitly connected. Interpret every result through its evidence label and limitations." actions={(
          <Link className="inline-flex min-h-11 items-center rounded-lg border border-cyan-300/20 px-4 py-2 text-sm font-semibold text-cyan-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200" href="/providers">Explore provider registry</Link>
        )} />
        <ModuleStatusStrip label="Agent interface status" items={[
          { label: "Browser rail", value: "Semantic", tone: "green" },
          { label: "Public API", value: "v1", tone: "green" },
          { label: "MCP", value: "Read + synthetic", tone: "purple" },
          { label: "Anonymous spend", value: "Blocked", tone: "green" },
        ]} />

        <ModulePanel title="Three clients, one evidence layer" description="The human browser, search or browser agents, and API or MCP clients share stable provider IDs, evaluation IDs, evidence labels, timestamps, limitations, and deterministic results.">
          <ol className="grid gap-3 sm:grid-cols-3">
            <li className="rounded-xl border border-white/10 bg-black/20 p-4"><h2 className="font-semibold text-white">1. Discover</h2><p className="mt-1 text-sm leading-6 text-slate-300">Follow real links, sitemap entries, canonical metadata, JSON-LD, and llms.txt guidance.</p></li>
            <li className="rounded-xl border border-white/10 bg-black/20 p-4"><h2 className="font-semibold text-white">2. Understand</h2><p className="mt-1 text-sm leading-6 text-slate-300">Read evidence, status, dates, provenance, environment, and limitations together.</p></li>
            <li className="rounded-xl border border-white/10 bg-black/20 p-4"><h2 className="font-semibold text-white">3. Interact safely</h2><p className="mt-1 text-sm leading-6 text-slate-300">Retrieve public records or run repository-owned deterministic fixtures without provider spend.</p></li>
          </ol>
        </ModulePanel>

        <ModulePanel title="Machine interfaces" description="MCP standardizes interaction once a client is connected; it does not guarantee automatic or universal agent discovery.">
          <dl className="space-y-3 text-sm">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4"><dt className="font-semibold text-white">Public API index</dt><dd className="mt-1"><a className="font-mono text-cyan-100 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200" href="/api/public/v1/lab">GET /api/public/v1/lab</a></dd></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4"><dt className="font-semibold text-white">OpenAPI 3.1</dt><dd className="mt-1"><a className="font-mono text-cyan-100 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200" href="/openapi.json">/openapi.json</a></dd></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4"><dt className="font-semibold text-white">Remote MCP</dt><dd className="mt-1 font-mono text-cyan-100">{lab.urls.mcp}</dd><dd className="mt-1 text-slate-400">Stateless HTTP transport; listed tools are read-oriented except the nonbillable deterministic fixture runner.</dd></div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4"><dt className="font-semibold text-white">Agent documentation</dt><dd className="mt-1 flex flex-wrap gap-3"><a className="text-cyan-100 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200" href="/llms.txt">llms.txt</a><a className="text-cyan-100 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200" href="/llms-full.txt">llms-full.txt</a></dd></div>
          </dl>
        </ModulePanel>

        <ModulePanel title="MCP tool surface">
          <ul className="grid gap-2 font-mono text-sm text-slate-300 sm:grid-cols-2">
            {["voice_lab.list_providers", "voice_lab.get_provider", "voice_lab.list_evals", "voice_lab.get_eval", "voice_lab.get_methodology", "voice_lab.compare_providers", "voice_lab.run_synthetic_eval"].map((toolName) => <li className="rounded-lg border border-white/10 bg-black/20 p-3" key={toolName}>{toolName}</li>)}
          </ul>
        </ModulePanel>

        <ModulePanel title="Human-review and execution boundary" description="No anonymous browser, API, or MCP action on this rail can invoke a paid provider operation.">
          <ul className="space-y-2 text-sm leading-6 text-slate-300">
            <li>• Treat synthetic evidence as a test of local deterministic logic, not provider quality.</li>
            <li>• Do not infer accuracy, latency, security, compliance, pricing, or production readiness.</li>
            <li>• Keep human review for subjective criteria and production decisions.</li>
            <li>• Use the browser’s explicit live-action confirmations for any separately available provider operation.</li>
          </ul>
          <Link className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-violet-300/20 px-4 py-2 text-sm font-semibold text-violet-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-200" href="/methodology">Inspect evaluation methodology</Link>
        </ModulePanel>
      </div>
    </ModulePageShell>
  );
}
