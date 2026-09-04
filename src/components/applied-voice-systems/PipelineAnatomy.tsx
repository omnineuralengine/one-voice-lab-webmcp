"use client";

import { useState } from "react";

import {
  JsonView,
  Panel,
  PanelHeading,
  ProvenanceBadge,
  buttonClassName,
} from "@/components/applied-voice-systems/AcademyPrimitives";
import type { CodeLabWorkflowId } from "@/lib/code-lab-files";
import type { LabModuleId } from "@/lib/code-snippets";
import { PIPELINE_LAYERS } from "@/lib/applied-voice/pipeline";
import type {
  Ownership,
  PipelineLayer,
  PipelineLayerId,
} from "@/types/applied-voice";

type OwnershipFilter = "all" | Ownership;

const OWNERSHIP_FILTERS: Array<{ id: OwnershipFilter; label: string }> = [
  { id: "all", label: "All layers" },
  { id: "deepgram", label: "Deepgram" },
  { id: "customer", label: "Customer" },
  { id: "shared", label: "Shared" },
  { id: "third-party", label: "Third party" },
];

const OWNERSHIP_LABELS: Record<Ownership, string> = {
  deepgram: "Deepgram",
  customer: "Customer",
  shared: "Shared",
  "third-party": "Third party",
};

const OWNERSHIP_STYLES: Record<Ownership, string> = {
  deepgram: "border-cyan-300/30 bg-cyan-300/10 text-cyan-100",
  customer: "border-violet-300/30 bg-violet-300/10 text-violet-100",
  shared: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
  "third-party": "border-amber-300/30 bg-amber-300/10 text-amber-100",
};

type LayerCrossLink = {
  moduleId: LabModuleId;
  moduleLabel: string;
  workflowId?: CodeLabWorkflowId;
};

const LAYER_LINKS: Record<PipelineLayerId, LayerCrossLink> = {
  "audio-source": { moduleId: "live-mic", moduleLabel: "Open Live Mic", workflowId: "live-mic" },
  transport: { moduleId: "connection", moduleLabel: "Open Connection", workflowId: "temporary-token" },
  "audio-preprocessing": { moduleId: "upload-audio", moduleLabel: "Open File STT", workflowId: "upload-audio" },
  "speech-recognition": { moduleId: "transcribe-url", moduleLabel: "Open URL STT", workflowId: "transcribe-url" },
  "turn-detection": { moduleId: "api-studio", moduleLabel: "Open API Studio" },
  orchestration: { moduleId: "api-studio", moduleLabel: "Open API Studio", workflowId: "voice-agent" },
  "tools-business-systems": { moduleId: "api-studio", moduleLabel: "Open API Studio", workflowId: "voice-agent" },
  "text-to-speech": { moduleId: "tts", moduleLabel: "Open TTS", workflowId: "tts" },
  "audio-return": { moduleId: "tts", moduleLabel: "Open TTS", workflowId: "tts" },
  "analytics-observability": { moduleId: "api-studio", moduleLabel: "Open API Studio" },
};

export function PipelineAnatomy({
  onOpenModule,
  onOpenCodeLab,
}: {
  onOpenModule: (moduleId: LabModuleId) => void;
  onOpenCodeLab: (workflowId: CodeLabWorkflowId) => void;
}) {
  const [selectedId, setSelectedId] = useState<PipelineLayerId>("speech-recognition");
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>("all");
  const [boundaryMode, setBoundaryMode] = useState(true);

  const selectedLayer = PIPELINE_LAYERS.find((layer) => layer.id === selectedId) ?? PIPELINE_LAYERS[0];
  const visibleLayers = ownershipFilter === "all"
    ? PIPELINE_LAYERS
    : PIPELINE_LAYERS.filter((layer) => layer.ownership.includes(ownershipFilter));

  function selectFilter(nextFilter: OwnershipFilter) {
    setOwnershipFilter(nextFilter);
    if (nextFilter === "all" || selectedLayer.ownership.includes(nextFilter)) return;
    const nextLayer = PIPELINE_LAYERS.find((layer) => layer.ownership.includes(nextFilter));
    if (nextLayer) setSelectedId(nextLayer.id);
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(210px,.66fr)_minmax(300px,1fr)_minmax(330px,1.08fr)] gap-3 overflow-hidden p-3">
      <Panel className="flex min-h-0 flex-col overflow-hidden">
        <PanelHeading
          eyebrow="System index"
          title="Pipeline layers"
          detail="Filter by accountable boundary, then select a layer."
          actions={<span className="font-mono text-[9px] text-slate-600">{visibleLayers.length}/{PIPELINE_LAYERS.length}</span>}
        />
        <div className="shrink-0 border-b border-white/10 p-2">
          <div className="grid grid-cols-2 gap-1">
            {OWNERSHIP_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => selectFilter(filter.id)}
                aria-pressed={ownershipFilter === filter.id}
                className={`rounded border px-2 py-1.5 text-left text-[9px] font-semibold transition focus-visible:outline-2 focus-visible:outline-cyan-200 ${
                  ownershipFilter === filter.id
                    ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
                    : "border-white/[0.07] bg-black/20 text-slate-500 hover:border-white/15 hover:text-slate-200"
                } ${filter.id === "all" ? "col-span-2" : ""}`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <div className="space-y-1">
            {visibleLayers.map((layer) => (
              <button
                key={layer.id}
                type="button"
                onClick={() => setSelectedId(layer.id)}
                aria-current={selectedId === layer.id ? "step" : undefined}
                className={`w-full rounded-lg border p-2 text-left transition focus-visible:outline-2 focus-visible:outline-cyan-200 ${
                  selectedId === layer.id
                    ? "border-cyan-300/35 bg-cyan-300/[0.08] shadow-[0_0_20px_rgba(34,211,238,0.06)]"
                    : "border-white/[0.07] bg-black/15 hover:border-white/15 hover:bg-white/[0.025]"
                }`}
              >
                <span className="flex items-start gap-2">
                  <span className={`mt-0.5 size-2 shrink-0 rounded-full ${primaryOwnerDot(layer)}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-semibold leading-4 text-slate-200">{layer.name}</span>
                    <span className="mt-0.5 line-clamp-2 block text-[9px] leading-3.5 text-slate-600">{layer.purpose}</span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="shrink-0 border-t border-white/10 p-2">
          <OwnershipLegend compact />
        </div>
      </Panel>

      <Panel className="flex min-h-0 flex-col overflow-hidden">
        <PanelHeading
          eyebrow="Interactive architecture"
          title="Voice pipeline anatomy"
          detail="The arrows show data flow, not automatic ownership transfer."
          actions={<ProvenanceBadge value="architectural concept" />}
        />
        <div className="shrink-0 border-b border-white/10 bg-black/15 p-2.5">
          <button
            type="button"
            role="switch"
            aria-checked={boundaryMode}
            onClick={() => setBoundaryMode((current) => !current)}
            className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#03080d] px-2.5 py-2 text-left focus-visible:outline-2 focus-visible:outline-cyan-200"
          >
            <span>
              <span className="block text-[10px] font-semibold text-slate-200">What Deepgram handles / what I must build</span>
              <span className="mt-0.5 block text-[9px] text-slate-600">{boundaryMode ? "Boundary lens on" : "Full pipeline lens"}</span>
            </span>
            <span className={`relative h-5 w-9 shrink-0 rounded-full border transition ${boundaryMode ? "border-cyan-200/50 bg-cyan-200/25" : "border-white/15 bg-white/[0.04]"}`}>
              <span className={`absolute top-0.5 size-3.5 rounded-full transition ${boundaryMode ? "left-[18px] bg-cyan-100" : "left-0.5 bg-slate-500"}`} />
            </span>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {boundaryMode ? (
            <BoundaryLens layer={selectedLayer} />
          ) : (
            <PipelineFlow layers={PIPELINE_LAYERS} selectedId={selectedId} onSelect={setSelectedId} />
          )}
        </div>
      </Panel>

      <Panel className="flex min-h-0 flex-col overflow-hidden">
        <PanelHeading
          eyebrow="Layer contract"
          title={selectedLayer.name}
          detail={selectedLayer.purpose}
          actions={<ProvenanceBadge value={provenanceLabel(selectedLayer)} />}
        />
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <LayerDetail layer={selectedLayer} />
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-white/10 bg-[#071018] p-2.5">
          <button
            type="button"
            onClick={() => onOpenModule(LAYER_LINKS[selectedLayer.id].moduleId)}
            className={buttonClassName}
          >
            {LAYER_LINKS[selectedLayer.id].moduleLabel}
          </button>
          {LAYER_LINKS[selectedLayer.id].workflowId ? (
            <button
              type="button"
              onClick={() => onOpenCodeLab(LAYER_LINKS[selectedLayer.id].workflowId!)}
              className={buttonClassName}
            >
              Open in Code Lab
            </button>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}

function PipelineFlow({
  layers,
  selectedId,
  onSelect,
}: {
  layers: PipelineLayer[];
  selectedId: PipelineLayerId;
  onSelect: (id: PipelineLayerId) => void;
}) {
  return (
    <div className="mx-auto max-w-xl">
      {layers.map((layer, index) => (
        <div key={layer.id}>
          <button
            type="button"
            onClick={() => onSelect(layer.id)}
            className={`w-full rounded-lg border p-2.5 text-left transition focus-visible:outline-2 focus-visible:outline-cyan-200 ${
              selectedId === layer.id
                ? "border-cyan-300/35 bg-cyan-300/[0.08]"
                : "border-white/[0.08] bg-black/20 hover:border-white/15"
            }`}
          >
            <span className="flex items-start justify-between gap-2">
              <span className="text-[10px] font-semibold text-slate-200">{String(index + 1).padStart(2, "0")} · {layer.name}</span>
              <span className="flex flex-wrap justify-end gap-1">
                {layer.ownership.map((owner) => <OwnershipBadge key={owner} ownership={owner} />)}
              </span>
            </span>
            <span className="mt-1 block text-[9px] leading-3.5 text-slate-600">{layer.inputs[0]} → {layer.outputs[0]}</span>
          </button>
          {index < layers.length - 1 ? <div aria-hidden="true" className="flex h-5 items-center justify-center font-mono text-[11px] text-cyan-200/35">↓</div> : null}
        </div>
      ))}
    </div>
  );
}

function BoundaryLens({ layer }: { layer: PipelineLayer }) {
  const hasThirdParty = layer.ownership.includes("third-party");
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
        <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-slate-500">Selected handoff</p>
        <p className="mt-2 text-xs font-semibold text-white">{layer.name}</p>
        <p className="mt-1 text-[10px] leading-4 text-slate-500">{layer.inputs[0]} <span className="text-cyan-200/50">→</span> {layer.outputs[0]}</p>
      </div>
      <div className="grid gap-2">
        <BoundaryCard
          ownership="deepgram"
          title="Deepgram handles"
          detail={layer.deepgramBoundary}
          active={layer.ownership.includes("deepgram") || layer.ownership.includes("shared")}
        />
        <div className="flex h-5 items-center justify-center text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-700">Documented interface boundary</div>
        <BoundaryCard
          ownership="customer"
          title="I must build and validate"
          detail={layer.customerBoundary}
          active={layer.ownership.includes("customer") || layer.ownership.includes("shared")}
        />
        {hasThirdParty ? (
          <BoundaryCard
            ownership="third-party"
            title="Third-party boundary"
            detail="The selected provider supplies its own media, infrastructure, or integration contract. No account or connector is installed by this lab."
            active
          />
        ) : null}
      </div>
      <div className="rounded-lg border border-emerald-300/15 bg-emerald-300/[0.045] p-3">
        <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-100/65">Configuration is a shared decision</p>
        <p className="mt-1 text-[10px] leading-4 text-slate-500">Deepgram documents supported contracts; the customer still selects, tests, monitors, and safely integrates them for the real workload.</p>
      </div>
    </div>
  );
}

function BoundaryCard({
  ownership,
  title,
  detail,
  active,
}: {
  ownership: Ownership;
  title: string;
  detail: string;
  active: boolean;
}) {
  return (
    <article className={`rounded-lg border p-3 ${active ? OWNERSHIP_STYLES[ownership] : "border-white/[0.06] bg-white/[0.02] text-slate-600"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em]">{title}</p>
        <span className="text-[8px] font-bold uppercase tracking-wide">{active ? "in boundary" : "outside boundary"}</span>
      </div>
      <p className={`mt-2 text-[10px] leading-4 ${active ? "text-slate-300" : "text-slate-700"}`}>{detail}</p>
    </article>
  );
}

function LayerDetail({ layer }: { layer: PipelineLayer }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {layer.ownership.map((owner) => <OwnershipBadge key={owner} ownership={owner} />)}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <DetailList title="Inputs" items={layer.inputs} tone="cyan" />
        <DetailList title="Outputs" items={layer.outputs} tone="violet" />
      </div>
      <DetailList title="Common protocols" items={layer.protocols} />
      <DetailList title="Configuration choices" items={layer.configurationChoices} />
      <DetailList title="Common failure modes" items={layer.failureModes} tone="amber" />
      <JsonView value={layer.payloadExample} label="Sanitized payload / event example" maxHeight="max-h-52" />
      <div className="rounded-lg border border-white/[0.08] bg-black/20 p-3">
        <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">Relevant lab surface</p>
        <p className="mt-1.5 text-[10px] leading-4 text-slate-300">{layer.relevantDeepgramModule}</p>
        <p className="mt-3 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">Relevant Code Lab files</p>
        <ul className="mt-1.5 space-y-1">
          {layer.relevantCodeFiles.map((file) => <li key={file} className="break-all font-mono text-[9px] leading-3.5 text-cyan-100/65">{file}</li>)}
        </ul>
      </div>
    </div>
  );
}

function DetailList({ title, items, tone = "slate" }: { title: string; items: string[]; tone?: "slate" | "cyan" | "violet" | "amber" }) {
  const titleColor = tone === "cyan"
    ? "text-cyan-200/70"
    : tone === "violet"
      ? "text-violet-200/70"
      : tone === "amber"
        ? "text-amber-200/70"
        : "text-slate-500";
  return (
    <section className="rounded-lg border border-white/[0.08] bg-black/20 p-3">
      <h4 className={`text-[9px] font-semibold uppercase tracking-[0.14em] ${titleColor}`}>{title}</h4>
      <ul className="mt-1.5 space-y-1">
        {items.map((item) => <li key={item} className="flex gap-2 text-[10px] leading-4 text-slate-400"><span className="text-slate-700">•</span><span>{item}</span></li>)}
      </ul>
    </section>
  );
}

function OwnershipBadge({ ownership }: { ownership: Ownership }) {
  return <span className={`inline-flex rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ${OWNERSHIP_STYLES[ownership]}`}>{OWNERSHIP_LABELS[ownership]}</span>;
}

function OwnershipLegend({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex flex-wrap ${compact ? "gap-1" : "gap-1.5"}`} aria-label="Ownership legend">
      {(Object.keys(OWNERSHIP_LABELS) as Ownership[]).map((owner) => <OwnershipBadge key={owner} ownership={owner} />)}
    </div>
  );
}

function primaryOwnerDot(layer: PipelineLayer) {
  if (layer.ownership.includes("deepgram")) return "bg-cyan-300";
  if (layer.ownership.includes("shared")) return "bg-emerald-300";
  if (layer.ownership.includes("customer")) return "bg-violet-300";
  return "bg-amber-300";
}

function provenanceLabel(layer: PipelineLayer) {
  if (layer.provenance === "concept") return "architectural concept";
  if (layer.provenance === "example") return "example response";
  return layer.provenance;
}
