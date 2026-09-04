"use client";

import { useId } from "react";

import type { ArchitectureFlowType, ArchitectureTopology } from "@/types/architecture-studio";

const WIDTH = 1700;
const HEIGHT = 740;
const NODE_WIDTH = 156;
const NODE_HEIGHT = 64;

export function ArchitectureDiagram({ topology, view = "technical" }: { topology: ArchitectureTopology; view?: "executive" | "technical" }) {
  const titleId = useId();
  const descriptionId = useId();
  const executiveIds = new Set(["caller", "ccaas", "media-gateway", "audio-preprocessing", "deepgram-stt", "deepgram-flux", "deepgram-agent", "transcript-processing", "orchestrator", "tools", "deepgram-tts", "human-agent", "fallback-recovery", "analytics", "storage"]);
  const nodes = view === "executive" ? topology.nodes.filter((node) => executiveIds.has(node.id)) : topology.nodes;
  const ids = new Set(nodes.map((node) => node.id));
  const edges = topology.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to));
  const coordinates = new Map(nodes.map((node) => [node.id, point(node.layer, node.order)]));
  const legend: Array<{ type: ArchitectureFlowType; label: string }> = [
    { type: "audio", label: "Audio" }, { type: "transcript", label: "Transcript" }, { type: "control", label: "Control" }, { type: "business-data", label: "Business data" },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#03080d]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] px-3 py-2">
        <div className="flex flex-wrap gap-2">
          {(["customer", "deepgram", "third-party"] as const).map((owner) => <span key={owner} className="inline-flex items-center gap-1.5 text-[11px] capitalize text-slate-400"><span className={`size-2 rounded-sm ${owner === "customer" ? "bg-cyan-300" : owner === "deepgram" ? "bg-emerald-300" : "bg-violet-300"}`} />{owner.replace("third-party", "third party")}</span>)}
        </div>
        <div className="flex flex-wrap gap-2">
          {legend.map((item) => <span key={item.type} className="inline-flex items-center gap-1.5 text-[11px] text-slate-400"><span className="h-px w-4" style={{ backgroundColor: flowColor(item.type) }} />{item.label}</span>)}
        </div>
      </div>
      <div className="overflow-x-auto">
        <svg role="img" aria-labelledby={`${titleId} ${descriptionId}`} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="min-h-[440px] min-w-[980px] w-full" preserveAspectRatio="xMidYMid meet">
          <title id={titleId}>Recommended voice architecture</title>
          <desc id={descriptionId}>A live architecture showing customer-owned, Deepgram-managed, and third-party components with audio, transcript, control, and business-data flows. Dashed nodes are operator overrides.</desc>
          <defs>
            {legend.map((item) => (
              <marker key={item.type} id={`arrow-${item.type}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill={flowColor(item.type)} /></marker>
            ))}
            <pattern id="diagram-grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M 28 0 L 0 0 0 28" fill="none" stroke="rgba(255,255,255,.035)" strokeWidth="1" /></pattern>
          </defs>
          <rect width={WIDTH} height={HEIGHT} fill="url(#diagram-grid)" />
          {topology.boundaries.map((boundary, index) => (
            <g key={boundary.id}>
              <rect x={350 + index * 24} y={28 + index * 14} width={760 - index * 48} height={HEIGHT - 70 - index * 24} rx="24" fill={boundary.tone === "private" ? "rgba(139,92,246,.025)" : "rgba(34,211,238,.018)"} stroke={boundary.tone === "private" ? "rgba(196,181,253,.24)" : "rgba(103,232,249,.2)"} strokeDasharray="8 7" />
              <text x={374 + index * 24} y={50 + index * 14} fill={boundary.tone === "private" ? "#c4b5fd" : "#a5f3fc"} fontSize="11" fontFamily="var(--font-geist-mono)" letterSpacing="1.2">{boundary.label.toUpperCase()}</text>
            </g>
          ))}
          {edges.map((edge) => {
            const from = coordinates.get(edge.from);
            const to = coordinates.get(edge.to);
            if (!from || !to) return null;
            const startX = from.x + NODE_WIDTH;
            const startY = from.y + NODE_HEIGHT / 2;
            const endX = to.x;
            const endY = to.y + NODE_HEIGHT / 2;
            const middle = startX + Math.max(26, (endX - startX) / 2);
            const path = `M ${startX} ${startY} C ${middle} ${startY}, ${middle} ${endY}, ${endX - 8} ${endY}`;
            return (
              <g key={edge.id}>
                <path d={path} fill="none" stroke={flowColor(edge.type)} strokeWidth="2" strokeOpacity=".7" markerEnd={`url(#arrow-${edge.type})`} />
                {view === "technical" ? <text x={(startX + endX) / 2} y={(startY + endY) / 2 - 6} textAnchor="middle" fill="#94a3b8" fontSize="10" fontFamily="var(--font-geist-mono)">{edge.label}</text> : null}
              </g>
            );
          })}
          {nodes.map((node) => {
            const position = coordinates.get(node.id)!;
            const colors = ownerColors(node.owner);
            return (
              <g key={node.id} transform={`translate(${position.x} ${position.y})`}>
                <rect width={NODE_WIDTH} height={NODE_HEIGHT} rx="12" fill={colors.fill} stroke={node.origin === "operator" ? "#fbbf24" : colors.stroke} strokeDasharray={node.origin === "operator" ? "6 4" : undefined} strokeWidth={node.origin === "operator" ? 2 : 1} />
                <rect x="10" y="12" width="4" height="40" rx="2" fill={colors.accent} />
                <text x="24" y="27" fill="#f8fafc" fontSize="12" fontWeight="650">{truncate(node.label, 22)}</text>
                <text x="24" y="44" fill="#94a3b8" fontSize="10">{truncate(node.detail, 26)}</text>
                {node.origin === "operator" ? <text x={NODE_WIDTH - 10} y="12" textAnchor="end" fill="#fbbf24" fontSize="8" fontFamily="var(--font-geist-mono)" letterSpacing=".6">OVERRIDE</text> : null}
                {node.latencyCheckpoint ? <text x={NODE_WIDTH - 10} y={NODE_HEIGHT - 8} textAnchor="end" fill="#fbbf24" fontSize="9" fontFamily="var(--font-geist-mono)" letterSpacing=".7">LATENCY</text> : null}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function point(layer: number, order: number) {
  return { x: 28 + layer * 183, y: 96 + order * 108 };
}

function ownerColors(owner: "customer" | "deepgram" | "third-party") {
  if (owner === "deepgram") return { fill: "rgba(16,185,129,.105)", stroke: "rgba(110,231,183,.42)", accent: "#6ee7b7" };
  if (owner === "third-party") return { fill: "rgba(139,92,246,.10)", stroke: "rgba(196,181,253,.34)", accent: "#c4b5fd" };
  return { fill: "rgba(34,211,238,.08)", stroke: "rgba(103,232,249,.30)", accent: "#67e8f9" };
}

function flowColor(type: ArchitectureFlowType) {
  return { audio: "#67e8f9", transcript: "#6ee7b7", control: "#c4b5fd", "business-data": "#fbbf24" }[type];
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
