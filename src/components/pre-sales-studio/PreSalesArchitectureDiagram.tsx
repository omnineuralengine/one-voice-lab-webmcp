"use client";

import { useMemo, useState } from "react";

import type { ArchitectureBlueprint, ArchitectureNode } from "@/types/pre-sales-studio";
import { Panel, StatusBadge } from "@/components/pre-sales-studio/PreSalesPrimitives";

const OWNER = { customer: { fill: "#102531", stroke: "#67e8f9", label: "Customer-managed" }, deepgram: { fill: "#241d38", stroke: "#c4b5fd", label: "Deepgram-managed / candidate" }, "third-party": { fill: "#29230f", stroke: "#fde68a", label: "Third-party" } } as const;
const FLOW = { audio: "#67e8f9", transcript: "#a7f3d0", control: "#c4b5fd", "business-data": "#fde68a" } as const;

export function PreSalesArchitectureDiagram({ blueprint }: { blueprint: ArchitectureBlueprint }) {
  const [view, setView] = useState<"executive" | "engineering">("executive");
  const visibleNodes = useMemo(() => view === "executive" ? blueprint.nodes.filter((node) => node.executive) : blueprint.nodes, [blueprint.nodes, view]);
  const visibleIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = blueprint.nodes.find((node) => node.id === selectedId) ?? null;
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2">{Object.entries(OWNER).map(([key, item]) => <span key={key} className="flex items-center gap-2 text-[10px] text-slate-400"><span className="size-2.5 rounded-sm border" style={{ background: item.fill, borderColor: item.stroke }} />{item.label}</span>)}</div><div className="rounded-lg border border-white/[0.08] bg-black/20 p-1"><button type="button" aria-pressed={view === "executive"} className={`rounded-md px-3 py-1.5 text-[11px] font-semibold ${view === "executive" ? "bg-cyan-200 text-slate-950" : "text-slate-400"}`} onClick={() => setView("executive")}>Executive</button><button type="button" aria-pressed={view === "engineering"} className={`rounded-md px-3 py-1.5 text-[11px] font-semibold ${view === "engineering" ? "bg-cyan-200 text-slate-950" : "text-slate-400"}`} onClick={() => setView("engineering")}>Engineering</button></div></div>
    <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#03080d] p-2" aria-label={`${view} architecture diagram`}>
      <svg viewBox="0 0 1200 350" className="min-h-[310px] min-w-[900px] w-full" role="img" aria-labelledby="architecture-title architecture-description">
        <title id="architecture-title">Proposed voice architecture</title><desc id="architecture-description">Connected customer, Deepgram, and third-party components derived from discovery answers. Select a node for its rationale.</desc>
        <defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker></defs>
        {blueprint.edges.filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to)).map((edge) => { const from = visibleNodes.find((node) => node.id === edge.from)!; const to = visibleNodes.find((node) => node.id === edge.to)!; return <g key={edge.id}><line x1={from.x + 140} y1={from.y + 38} x2={to.x} y2={to.y + 38} stroke={FLOW[edge.flow]} strokeWidth="2" strokeOpacity=".7" markerEnd="url(#arrow)" /><text x={(from.x + 140 + to.x) / 2} y={(from.y + to.y) / 2 + 28} textAnchor="middle" fill="#94a3b8" fontSize="10">{edge.label}</text></g>; })}
        {visibleNodes.map((node) => <ArchitectureNodeButton key={node.id} node={node} selected={node.id === selectedId} onSelect={() => setSelectedId(node.id)} />)}
      </svg>
    </div>
    {selected ? <Panel className="grid gap-4 p-5 md:grid-cols-3" aria-live="polite"><div><StatusBadge tone={selected.owner === "deepgram" ? "violet" : selected.owner === "customer" ? "cyan" : "amber"}>{OWNER[selected.owner].label}</StatusBadge><h3 className="mt-3 text-lg font-semibold text-white">{selected.label}</h3><p className="mt-2 text-xs leading-5 text-slate-400">{selected.detail}</p></div><Detail label="Why it is present" value={selected.whyPresent} /><Detail label="Related requirement" value={selected.requirement} /></Panel> : <p className="text-center text-xs text-slate-500">Select any architecture node to inspect its requirement and rationale.</p>}
    <div className="flex flex-wrap gap-2">{blueprint.boundaries.map((boundary) => <StatusBadge key={boundary} tone="slate">{boundary}</StatusBadge>)}</div>
  </div>;
}

function ArchitectureNodeButton({ node, selected, onSelect }: { node: ArchitectureNode; selected: boolean; onSelect: () => void }) {
  const owner = OWNER[node.owner];
  return <g role="button" tabIndex={0} aria-label={`${node.label}, ${owner.label}. Select to inspect.`} onClick={onSelect} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(); } }} className="cursor-pointer outline-none"><rect x={node.x} y={node.y} width="140" height="76" rx="12" fill={owner.fill} stroke={selected ? "#ffffff" : owner.stroke} strokeWidth={selected ? 3 : 1.4} /><text x={node.x + 12} y={node.y + 27} fill="#f8fafc" fontSize="12" fontWeight="700">{lines(node.label)[0]}</text>{lines(node.label)[1] ? <text x={node.x + 12} y={node.y + 43} fill="#f8fafc" fontSize="12" fontWeight="700">{lines(node.label)[1]}</text> : null}<text x={node.x + 12} y={node.y + 63} fill="#94a3b8" fontSize="9">{owner.label.slice(0, 22)}</text></g>;
}

function lines(label: string) { const words = label.split(" "); const first: string[] = []; const second: string[] = []; for (const word of words) (first.join(" ").length < 17 ? first : second).push(word); return [first.join(" "), second.join(" ")]; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-white/[0.07] bg-black/15 p-4"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p><p className="mt-2 text-xs leading-5 text-slate-300">{value}</p></div>; }
