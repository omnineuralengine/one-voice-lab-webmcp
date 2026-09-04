"use client";

import { memo, useMemo, useRef, useState } from "react";

import type {
  ArchitectureCanvasSnapshot,
  ArchitectureCanvasView,
  ArchitectureComparison,
  CanvasArchitectureNode,
  CanvasPosition,
  FailurePropagationResult,
} from "@/types/architecture-studio-diagnostics";

const NODE_WIDTH = 176;
const NODE_HEIGHT = 82;
const CANVAS_WIDTH = 2400;
const CANVAS_HEIGHT = 960;

type Props = {
  architecture: ArchitectureCanvasSnapshot;
  comparison: ArchitectureComparison;
  view: ArchitectureCanvasView;
  zoom: number;
  selectedNodeId?: string;
  selectedConnectionId?: string;
  propagation: FailurePropagationResult | null;
  onSelectNode: (nodeId?: string) => void;
  onSelectConnection: (connectionId?: string) => void;
  onMoveNode: (nodeId: string, position: CanvasPosition) => void;
};

export const LiveArchitectureCanvas = memo(function LiveArchitectureCanvas({
  architecture,
  comparison,
  view,
  zoom,
  selectedNodeId,
  selectedConnectionId,
  propagation,
  onSelectNode,
  onSelectConnection,
  onMoveNode,
}: Props) {
  const [previewPositions, setPreviewPositions] = useState<Record<string, CanvasPosition>>({});
  const drag = useRef<{ id: string; start: CanvasPosition; pointer: CanvasPosition } | null>(null);
  const positions = useMemo(() => layoutPositions(architecture.nodes, view, previewPositions), [architecture.nodes, previewPositions, view]);
  const impactMap = useMemo(() => new Map((propagation?.nodeImpacts ?? []).map((impact) => [impact.nodeId, impact])), [propagation]);
  const visibleConnections = architecture.connections.filter((connection) => connection.enabled && positions[connection.fromNodeId] && positions[connection.toNodeId]);

  return (
    <div className="architecture-live-canvas relative min-h-[560px] overflow-auto rounded-xl border border-white/[0.08] bg-[#02080c]" aria-label={`${view.replaceAll("-", " ")} architecture canvas`}>
      <div
        className="relative origin-top-left motion-reduce:transition-none"
        style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, transform: `scale(${zoom})`, marginRight: CANVAS_WIDTH * (zoom - 1), marginBottom: CANVAS_HEIGHT * (zoom - 1) }}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) { onSelectNode(undefined); onSelectConnection(undefined); }
        }}
      >
        <BoundaryBand left={20} width={610} label="Customer / caller boundary" tone="customer" />
        <BoundaryBand left={650} width={970} label="Service and provider boundary" tone="service" />
        <BoundaryBand left={1640} width={730} label="Business systems and operations" tone="business" />

        <svg className="pointer-events-none absolute inset-0" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} aria-hidden="true">
          <defs>
            <marker id="canvas-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="currentColor" /></marker>
          </defs>
          {visibleConnections.map((connection) => {
            const from = positions[connection.fromNodeId];
            const to = positions[connection.toNodeId];
            if (!from || !to) return null;
            const selected = selectedConnectionId === connection.id;
            const affected = propagation?.downstreamConnectionIds.includes(connection.id);
            const x1 = from.x + NODE_WIDTH;
            const y1 = from.y + NODE_HEIGHT / 2;
            const x2 = to.x;
            const y2 = to.y + NODE_HEIGHT / 2;
            const bend = Math.max(36, Math.abs(x2 - x1) / 2);
            return <path key={connection.id} d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`} className={`${flowStroke(connection.flow)} ${selected ? "stroke-[4]" : affected ? "stroke-[3]" : "stroke-2"} ${affected ? "stroke-rose-300" : ""}`} fill="none" strokeDasharray={connection.origin === "manually-added" ? "7 5" : undefined} markerEnd="url(#canvas-arrow)" />;
          })}
        </svg>

        {visibleConnections.map((connection) => {
          const from = positions[connection.fromNodeId];
          const to = positions[connection.toNodeId];
          if (!from || !to) return null;
          return (
            <button
              key={`label-${connection.id}`}
              type="button"
              onClick={() => onSelectConnection(connection.id)}
              className={`absolute z-10 max-w-36 -translate-x-1/2 rounded-md border px-2 py-1 text-[10px] font-semibold focus-visible:outline-2 focus-visible:outline-cyan-200 ${selectedConnectionId === connection.id ? "border-cyan-200 bg-cyan-100 text-slate-950" : "border-white/10 bg-[#061016]/95 text-slate-400"}`}
              style={{ left: (from.x + NODE_WIDTH + to.x) / 2, top: (from.y + to.y) / 2 + NODE_HEIGHT / 2 - 14 }}
              aria-label={`Inspect ${connection.protocol ?? connection.flow} connection`}
            >
              {connection.protocol ?? connection.flow}
            </button>
          );
        })}

        {architecture.nodes.map((node) => {
          const position = positions[node.id];
          if (!position) return null;
          const impact = impactMap.get(node.id);
          const changed = comparison.addedNodeIds.includes(node.id) || comparison.changedNodeIds.includes(node.id);
          const selected = selectedNodeId === node.id;
          return (
            <button
              key={node.id}
              type="button"
              onClick={() => onSelectNode(node.id)}
              onPointerDown={(event) => {
                if (view === "customer-journey" || event.button !== 0) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                drag.current = { id: node.id, start: position, pointer: { x: event.clientX, y: event.clientY } };
              }}
              onPointerMove={(event) => {
                if (drag.current?.id !== node.id) return;
                const next = { x: Math.max(20, Math.min(2200, drag.current.start.x + (event.clientX - drag.current.pointer.x) / zoom)), y: Math.max(48, Math.min(840, drag.current.start.y + (event.clientY - drag.current.pointer.y) / zoom)) };
                setPreviewPositions((current) => ({ ...current, [node.id]: next }));
              }}
              onPointerUp={(event) => {
                if (drag.current?.id !== node.id) return;
                event.currentTarget.releasePointerCapture(event.pointerId);
                const next = previewPositions[node.id];
                drag.current = null;
                if (next) { onMoveNode(node.id, next); setPreviewPositions((current) => { const copy = { ...current }; delete copy[node.id]; return copy; }); }
              }}
              onKeyDown={(event) => {
                if (view === "customer-journey" || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
                event.preventDefault();
                const step = event.shiftKey ? 40 : 10;
                const next = { ...position };
                if (event.key === "ArrowLeft") next.x -= step;
                if (event.key === "ArrowRight") next.x += step;
                if (event.key === "ArrowUp") next.y -= step;
                if (event.key === "ArrowDown") next.y += step;
                onMoveNode(node.id, next);
              }}
              className={`absolute z-20 rounded-xl border p-3 text-left shadow-lg transition-[border-color,background-color,opacity] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-100 motion-reduce:transition-none ${nodeTone(node, impact?.relationship, selected, view)} ${!node.enabled ? "opacity-45" : ""}`}
              style={{ left: position.x, top: position.y, width: NODE_WIDTH, minHeight: NODE_HEIGHT, touchAction: view === "customer-journey" ? "auto" : "none" }}
              aria-pressed={selected}
              aria-label={`${node.displayName}; ${impact?.relationship?.replaceAll("-", " ") ?? node.status}; ${node.origin.replaceAll("-", " ")}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-[10px] font-bold uppercase tracking-[0.12em] opacity-70">{nodeTypeLabel(node)}</span>
                <span className="font-mono text-[10px]" aria-hidden="true">{statusSymbol(impact?.relationship, node.status)}</span>
              </span>
              <span className="mt-1 block text-[13px] font-semibold leading-4 text-white">{node.displayName}</span>
              <span className="mt-1 block truncate text-[10px] text-slate-300/75">{node.vendor}</span>
              <span className="mt-2 flex flex-wrap gap-1 text-[9px] font-bold uppercase tracking-wider">
                <span className="rounded bg-black/25 px-1.5 py-0.5">{ownerLabel(node.owner)}</span>
                {changed ? <span className="rounded bg-amber-200/15 px-1.5 py-0.5 text-amber-100">Operator edit</span> : null}
              </span>
            </button>
          );
        })}

        <div className="absolute bottom-5 left-5 z-30 flex flex-wrap gap-2 rounded-lg border border-white/10 bg-[#061016]/95 p-2 text-[10px] text-slate-300" aria-label="Canvas legend">
          <span>● origin</span><span>◆ direct impact</span><span>△ downstream symptom</span><span>○ healthy</span><span>◌ unobservable</span><span>Dashed path = operator-added</span>
        </div>
      </div>
    </div>
  );
});

function layoutPositions(nodes: CanvasArchitectureNode[], view: ArchitectureCanvasView, preview: Record<string, CanvasPosition>) {
  if (view !== "customer-journey") return Object.fromEntries(nodes.map((node) => [node.id, preview[node.id] ?? node.position]));
  const enabled = nodes.filter((node) => node.enabled).sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);
  const columnCounts = new Map<number, number>();
  return Object.fromEntries(enabled.map((node) => {
    const column = Math.max(0, Math.round(node.position.x / 430));
    const order = columnCounts.get(column) ?? 0;
    columnCounts.set(column, order + 1);
    return [node.id, { x: 50 + column * 360, y: 100 + order * 126 }];
  }));
}

function BoundaryBand({ left, width, label, tone }: { left: number; width: number; label: string; tone: "customer" | "service" | "business" }) {
  const classes = tone === "service" ? "border-cyan-200/10 bg-cyan-200/[0.018] text-cyan-100/45" : tone === "business" ? "border-violet-200/10 bg-violet-200/[0.018] text-violet-100/45" : "border-white/[0.06] bg-white/[0.012] text-slate-500";
  return <div className={`pointer-events-none absolute bottom-12 top-5 rounded-2xl border ${classes}`} style={{ left, width }}><span className="absolute left-4 top-3 text-[10px] font-bold uppercase tracking-[0.16em]">{label}</span></div>;
}

function flowStroke(flow: string) {
  return flow === "audio" ? "stroke-cyan-300/55 text-cyan-300/55" : flow === "transcript" ? "stroke-emerald-300/50 text-emerald-300/50" : flow === "control" ? "stroke-violet-300/50 text-violet-300/50" : "stroke-amber-300/50 text-amber-300/50";
}

function nodeTone(node: CanvasArchitectureNode, relationship: string | undefined, selected: boolean, view: ArchitectureCanvasView) {
  if (selected) return "border-cyan-100 bg-cyan-200/[0.16] ring-2 ring-cyan-200/15";
  if (relationship === "originating-failure") return "border-rose-200 bg-rose-200/[0.15]";
  if (relationship === "directly-affected") return "border-orange-200/70 bg-orange-200/[0.1]";
  if (relationship === "downstream-symptom") return "border-amber-200/55 bg-amber-200/[0.08]";
  if (relationship === "unobservable") return "border-slate-300/30 bg-slate-300/[0.04] border-dashed";
  if (view === "failure-view" && relationship === "unrelated-healthy") return "border-emerald-200/10 bg-emerald-200/[0.025] opacity-60";
  if (node.owner === "deepgram-managed") return "border-cyan-200/30 bg-cyan-200/[0.07]";
  if (node.owner === "third-party") return "border-violet-200/25 bg-violet-200/[0.055]";
  return "border-white/12 bg-[#0a161e]";
}

function statusSymbol(relationship: string | undefined, status: string) {
  if (relationship === "originating-failure") return "●";
  if (relationship === "directly-affected") return "◆";
  if (relationship === "downstream-symptom") return "△";
  if (relationship === "unobservable") return "◌";
  return status === "disabled" ? "⊘" : "○";
}

function ownerLabel(owner: CanvasArchitectureNode["owner"]) {
  return owner === "deepgram-managed" ? "Deepgram" : owner === "third-party" ? "Third party" : "Customer";
}

function nodeTypeLabel(node: CanvasArchitectureNode) {
  return node.type.replace("deepgram-", "").replaceAll("-", " ");
}
