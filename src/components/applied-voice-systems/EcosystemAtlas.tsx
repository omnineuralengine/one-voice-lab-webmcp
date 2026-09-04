"use client";

import { useState } from "react";

import {
  Panel,
  PanelHeading,
  ProvenanceBadge,
  buttonClassName,
} from "@/components/applied-voice-systems/AcademyPrimitives";
import { ECOSYSTEM_NODES } from "@/lib/applied-voice/pipeline";
import type { CodeLabWorkflowId } from "@/lib/code-lab-files";
import type { LabModuleId } from "@/lib/code-snippets";
import type {
  EcosystemCategory,
  EcosystemNode,
  Ownership,
} from "@/types/applied-voice";

type OwnershipFilter = "all" | Ownership;

const CATEGORY_ORDER: EcosystemCategory[] = [
  "audio-ingress",
  "telephony-contact-center",
  "voice-intelligence",
  "orchestration",
  "reasoning-context",
  "tools",
  "outputs",
  "observability",
];

const CATEGORY_META: Record<EcosystemCategory, { label: string; purpose: string }> = {
  "audio-ingress": { label: "Audio ingress", purpose: "Where speech enters" },
  "telephony-contact-center": { label: "Telephony + contact center", purpose: "Call and media bridge" },
  "voice-intelligence": { label: "Voice intelligence", purpose: "Deepgram capabilities" },
  orchestration: { label: "Orchestration", purpose: "Conversation control" },
  "reasoning-context": { label: "Reasoning + context", purpose: "Knowledge and policy" },
  tools: { label: "Tools", purpose: "Bounded business action" },
  outputs: { label: "Outputs", purpose: "User and business results" },
  observability: { label: "Observability", purpose: "Evidence and outcomes" },
};

const OWNER_LABELS: Record<Ownership, string> = {
  deepgram: "Deepgram",
  customer: "Customer",
  shared: "Shared",
  "third-party": "Third party",
};

const OWNER_STYLES: Record<Ownership, string> = {
  deepgram: "border-cyan-300/30 bg-cyan-300/10 text-cyan-100",
  customer: "border-violet-300/30 bg-violet-300/10 text-violet-100",
  shared: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
  "third-party": "border-amber-300/30 bg-amber-300/10 text-amber-100",
};

const OWNER_FILTERS: OwnershipFilter[] = ["all", "deepgram", "customer", "shared", "third-party"];

type NodeCrossLink = {
  moduleId: LabModuleId;
  moduleLabel: string;
  workflowId?: CodeLabWorkflowId;
};

export function EcosystemAtlas({
  onOpenModule,
  onOpenCodeLab,
}: {
  onOpenModule: (moduleId: LabModuleId) => void;
  onOpenCodeLab: (workflowId: CodeLabWorkflowId) => void;
}) {
  const [category, setCategory] = useState<EcosystemCategory>("voice-intelligence");
  const [selectedId, setSelectedId] = useState("nova");
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>("all");

  const categoryNodes = ECOSYSTEM_NODES.filter((node) => node.category === category);
  const visibleNodes = ownershipFilter === "all"
    ? categoryNodes
    : categoryNodes.filter((node) => node.ownership === ownershipFilter);
  const selectedNode = ECOSYSTEM_NODES.find((node) => node.id === selectedId) ?? visibleNodes[0] ?? ECOSYSTEM_NODES[0];
  const crossLink = crossLinkForNode(selectedNode);

  function selectCategory(nextCategory: EcosystemCategory) {
    setCategory(nextCategory);
    setOwnershipFilter("all");
    const firstNode = ECOSYSTEM_NODES.find((node) => node.category === nextCategory);
    if (firstNode) setSelectedId(firstNode.id);
  }

  function selectOwnership(nextFilter: OwnershipFilter) {
    setOwnershipFilter(nextFilter);
    if (nextFilter === "all" || selectedNode.ownership === nextFilter) return;
    const nextNode = categoryNodes.find((node) => node.ownership === nextFilter);
    if (nextNode) setSelectedId(nextNode.id);
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(205px,.62fr)_minmax(315px,1fr)_minmax(350px,1.12fr)] gap-3 overflow-hidden p-3">
      <Panel className="flex min-h-0 flex-col overflow-hidden">
        <PanelHeading
          eyebrow="Architecture index"
          title="Agentic voice ecosystem"
          detail="Select a stack category to inspect its interfaces and boundaries."
        />
        <nav aria-label="Ecosystem categories" className="min-h-0 flex-1 overflow-y-auto p-2">
          <div className="space-y-1">
            {CATEGORY_ORDER.map((item, index) => {
              const count = ECOSYSTEM_NODES.filter((node) => node.category === item).length;
              const active = category === item;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => selectCategory(item)}
                  aria-current={active ? "page" : undefined}
                  className={`flex w-full items-center gap-2 rounded-lg border p-2 text-left transition focus-visible:outline-2 focus-visible:outline-cyan-200 ${
                    active
                      ? "border-cyan-300/30 bg-cyan-300/[0.08] text-white"
                      : "border-transparent text-slate-500 hover:border-white/10 hover:bg-white/[0.03] hover:text-slate-200"
                  }`}
                >
                  <span className={`flex size-7 shrink-0 items-center justify-center rounded-md font-mono text-[9px] font-bold ${active ? "bg-cyan-200 text-slate-950" : "bg-white/[0.05] text-slate-600"}`}>{String(index + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[10px] font-semibold">{CATEGORY_META[item].label}</span>
                    <span className="mt-0.5 block truncate text-[9px] text-slate-600">{CATEGORY_META[item].purpose}</span>
                  </span>
                  <span className="font-mono text-[9px] text-slate-700">{count}</span>
                </button>
              );
            })}
          </div>
        </nav>
        <div className="shrink-0 space-y-2 border-t border-white/10 p-2.5">
          <p className="text-[9px] leading-3.5 text-slate-600">Ownership indicates who must implement or operate the selected boundary.</p>
          <div className="flex flex-wrap gap-1">
            {(Object.keys(OWNER_LABELS) as Ownership[]).map((owner) => <OwnerBadge key={owner} owner={owner} />)}
          </div>
        </div>
      </Panel>

      <Panel className="flex min-h-0 flex-col overflow-hidden">
        <PanelHeading
          eyebrow="Stack map"
          title={CATEGORY_META[category].label}
          detail={CATEGORY_META[category].purpose}
          actions={<span className="font-mono text-[9px] text-slate-600">{visibleNodes.length} nodes</span>}
        />
        <div className="flex shrink-0 flex-wrap gap-1 border-b border-white/10 bg-black/15 p-2">
          {OWNER_FILTERS.map((owner) => {
            const count = owner === "all" ? categoryNodes.length : categoryNodes.filter((node) => node.ownership === owner).length;
            const disabled = count === 0;
            return (
              <button
                key={owner}
                type="button"
                onClick={() => selectOwnership(owner)}
                aria-pressed={ownershipFilter === owner}
                disabled={disabled}
                className={`rounded border px-2 py-1 text-[8px] font-bold uppercase tracking-wide transition focus-visible:outline-2 focus-visible:outline-cyan-200 disabled:cursor-not-allowed disabled:opacity-25 ${
                  ownershipFilter === owner
                    ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
                    : "border-white/[0.08] bg-black/20 text-slate-600 hover:text-slate-300"
                }`}
              >
                {owner === "all" ? "All" : OWNER_LABELS[owner]} · {count}
              </button>
            );
          })}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
          <div className="grid gap-2 xl:grid-cols-2">
            {visibleNodes.map((node) => (
              <NodeCard key={node.id} node={node} selected={node.id === selectedNode.id} onSelect={() => setSelectedId(node.id)} />
            ))}
          </div>
        </div>
        {category === "telephony-contact-center" ? (
          <div className="shrink-0 border-t border-amber-300/15 bg-amber-300/[0.045] px-3 py-2 text-[9px] leading-3.5 text-amber-100/70">
            Architecture concepts only. This lab does not install provider accounts, credentials, call control, or media connectors.
          </div>
        ) : null}
      </Panel>

      <Panel className="flex min-h-0 flex-col overflow-hidden">
        <PanelHeading
          eyebrow="Interface contract"
          title={selectedNode.name}
          detail={selectedNode.role}
          actions={
            <div className="flex flex-wrap items-center gap-1">
              <OwnerBadge owner={selectedNode.ownership} />
              <ProvenanceBadge value={provenanceLabel(selectedNode)} />
            </div>
          }
        />
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <NodeDetail node={selectedNode} />
        </div>
        {crossLink ? (
          <div className="flex shrink-0 flex-wrap gap-2 border-t border-white/10 bg-[#071018] p-2.5">
            <button type="button" onClick={() => onOpenModule(crossLink.moduleId)} className={buttonClassName}>{crossLink.moduleLabel}</button>
            {crossLink.workflowId ? <button type="button" onClick={() => onOpenCodeLab(crossLink.workflowId!)} className={buttonClassName}>Open in Code Lab</button> : null}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

function NodeCard({ node, selected, onSelect }: { node: EcosystemNode; selected: boolean; onSelect: () => void }) {
  const thirdParty = node.ownership === "third-party";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`min-h-28 rounded-lg border p-2.5 text-left transition focus-visible:outline-2 focus-visible:outline-cyan-200 ${
        selected
          ? "border-cyan-300/35 bg-cyan-300/[0.08] shadow-[0_0_20px_rgba(34,211,238,0.06)]"
          : "border-white/[0.08] bg-black/20 hover:border-white/15 hover:bg-white/[0.025]"
      }`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-semibold leading-4 text-slate-200">{node.name}</span>
        <span className={`mt-0.5 size-2 shrink-0 rounded-full ${ownerDot(node.ownership)}`} />
      </span>
      <span className="mt-1.5 line-clamp-3 block text-[9px] leading-3.5 text-slate-600">{node.role}</span>
      <span className={`mt-2 block text-[8px] font-bold uppercase tracking-wide ${thirdParty ? "text-amber-200/70" : "text-slate-700"}`}>{thirdParty ? "Concept only · connector not installed" : OWNER_LABELS[node.ownership]}</span>
    </button>
  );
}

function NodeDetail({ node }: { node: EcosystemNode }) {
  const isThirdParty = node.ownership === "third-party";
  return (
    <div className="space-y-3">
      {isThirdParty ? (
        <div className="rounded-lg border border-amber-300/25 bg-amber-300/[0.07] p-3">
          <div className="flex items-center gap-2"><ProvenanceBadge value="third-party concept" /><span className="text-[9px] font-bold uppercase tracking-[0.12em] text-amber-100">Not connected</span></div>
          <p className="mt-2 text-[10px] leading-4 text-amber-50/65">This node explains an architecture boundary only. It does not imply an installed account, SDK, connector, credential, or executable integration.</p>
        </div>
      ) : node.provenance === "concept" ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3 text-[10px] leading-4 text-slate-500">Architectural concept. Validate the exact product contract and implementation before treating this node as executable.</div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <DataList title="Data entering" items={node.dataIn} tone="cyan" />
        <DataList title="Data leaving" items={node.dataOut} tone="violet" />
      </div>
      <DataList title="Interface / protocol" items={node.interfaceProtocol} />

      <section className="rounded-lg border border-white/[0.08] bg-black/20 p-3">
        <h4 className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">Sample architecture</h4>
        <div className="mt-2 overflow-x-auto pb-1">
          <div className="flex min-w-max items-center gap-1.5">
            {node.sampleArchitecture.map((step, index) => (
              <div key={`${step}-${index}`} className="contents">
                <span className={`max-w-40 rounded-md border px-2 py-1.5 text-[9px] leading-3.5 ${index === 1 ? "border-cyan-300/25 bg-cyan-300/[0.07] text-cyan-50" : "border-white/10 bg-[#03080d] text-slate-400"}`}>{step}</span>
                {index < node.sampleArchitecture.length - 1 ? <span aria-hidden="true" className="font-mono text-cyan-200/35">→</span> : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      <DependencyCard title="Deepgram dependency" detail={node.deepgramDependency} owner="deepgram" />
      <DependencyCard title="Customer dependency" detail={node.customerDependency} owner="customer" />
      <div className="rounded-lg border border-amber-300/15 bg-amber-300/[0.045] p-3">
        <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-200/70">Integration risk</p>
        <p className="mt-1.5 text-[10px] leading-4 text-slate-400">{node.integrationRisk}</p>
      </div>
    </div>
  );
}

function DataList({ title, items, tone = "slate" }: { title: string; items: string[]; tone?: "slate" | "cyan" | "violet" }) {
  const titleColor = tone === "cyan" ? "text-cyan-200/70" : tone === "violet" ? "text-violet-200/70" : "text-slate-500";
  return (
    <section className="rounded-lg border border-white/[0.08] bg-black/20 p-3">
      <h4 className={`text-[9px] font-semibold uppercase tracking-[0.14em] ${titleColor}`}>{title}</h4>
      <ul className="mt-1.5 space-y-1">
        {items.map((item) => <li key={item} className="flex gap-2 text-[10px] leading-4 text-slate-400"><span className="text-slate-700">•</span><span>{item}</span></li>)}
      </ul>
    </section>
  );
}

function DependencyCard({ title, detail, owner }: { title: string; detail: string; owner: "deepgram" | "customer" }) {
  return (
    <section className={`rounded-lg border p-3 ${owner === "deepgram" ? "border-cyan-300/15 bg-cyan-300/[0.045]" : "border-violet-300/15 bg-violet-300/[0.045]"}`}>
      <div className="flex items-center justify-between gap-2">
        <h4 className={`text-[9px] font-semibold uppercase tracking-[0.14em] ${owner === "deepgram" ? "text-cyan-200/70" : "text-violet-200/70"}`}>{title}</h4>
        <OwnerBadge owner={owner} />
      </div>
      <p className="mt-1.5 text-[10px] leading-4 text-slate-400">{detail}</p>
    </section>
  );
}

function OwnerBadge({ owner }: { owner: Ownership }) {
  return <span className={`inline-flex rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ${OWNER_STYLES[owner]}`}>{OWNER_LABELS[owner]}</span>;
}

function ownerDot(owner: Ownership) {
  if (owner === "deepgram") return "bg-cyan-300";
  if (owner === "customer") return "bg-violet-300";
  if (owner === "shared") return "bg-emerald-300";
  return "bg-amber-300";
}

function provenanceLabel(node: EcosystemNode) {
  if (node.ownership === "third-party") return "third-party concept";
  if (node.provenance === "concept") return "architectural concept";
  if (node.provenance === "example") return "example response";
  return node.provenance;
}

function crossLinkForNode(node: EcosystemNode): NodeCrossLink | null {
  const exactLinks: Record<string, NodeCrossLink> = {
    "browser-microphone": { moduleId: "live-mic", moduleLabel: "Open Live Mic", workflowId: "live-mic" },
    "native-mobile": { moduleId: "api-studio", moduleLabel: "Open API Studio" },
    "recorded-files": { moduleId: "upload-audio", moduleLabel: "Open File STT", workflowId: "upload-audio" },
    "streaming-media": { moduleId: "live-mic", moduleLabel: "Open Live Mic", workflowId: "live-mic" },
    nova: { moduleId: "transcribe-url", moduleLabel: "Open STT", workflowId: "transcribe-url" },
    flux: { moduleId: "api-studio", moduleLabel: "Open API Studio" },
    "voice-agent": { moduleId: "api-studio", moduleLabel: "Open API Studio", workflowId: "voice-agent" },
    "dg-agent": { moduleId: "api-studio", moduleLabel: "Open API Studio", workflowId: "voice-agent" },
    aura: { moduleId: "tts", moduleLabel: "Open TTS", workflowId: "tts" },
    intelligence: { moduleId: "api-studio", moduleLabel: "Open API Studio", workflowId: "text-intelligence" },
    "self-hosted": { moduleId: "api-studio", moduleLabel: "Open API Studio" },
  };
  const exact = exactLinks[node.id];
  if (exact) return exact;
  if (node.category === "tools" || node.category === "observability") return { moduleId: "api-studio", moduleLabel: "Open API Studio" };
  if (node.category === "outputs" && node.name === "Spoken response") return { moduleId: "tts", moduleLabel: "Open TTS", workflowId: "tts" };
  if (node.category === "outputs" && node.name === "Transcript") return { moduleId: "transcribe-url", moduleLabel: "Open STT", workflowId: "transcribe-url" };
  return null;
}
