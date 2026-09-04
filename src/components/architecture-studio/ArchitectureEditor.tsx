"use client";

import { useState } from "react";

import { Panel, PanelHeading, StatusPill, studioButton, studioInput, studioPrimaryButton } from "@/components/architecture-studio/StudioPrimitives";
import { ARCHITECTURE_MODULE_LIBRARY } from "@/lib/architecture-studio/architecture";
import type { ArchitectureNode, ArchitectureTopology, PublicStudioSession, StudioPresenterCommand } from "@/types/architecture-studio";

type ArchitectureEditorProps = {
  session: PublicStudioSession;
  topology: ArchitectureTopology;
  disabled?: boolean;
  onCommand: (command: StudioPresenterCommand) => Promise<void>;
};

export function ArchitectureEditor({ session, topology, disabled = false, onCommand }: ArchitectureEditorProps) {
  const [moduleId, setModuleId] = useState("");
  const presentIds = new Set(topology.nodes.map((node) => node.id));
  const excluded = (session.architectureOverrides ?? []).filter((item) => item.presence === "excluded");
  const addable = ARCHITECTURE_MODULE_LIBRARY.filter((item) => !presentIds.has(item.id) && !excluded.some((override) => override.moduleId === item.id));

  async function addModule() {
    if (!moduleId) return;
    await onCommand({ kind: "update_architecture_module", moduleId, presence: "included", decisionStatus: "undecided" });
    setModuleId("");
  }

  return (
    <Panel className="overflow-hidden">
      <PanelHeading
        eyebrow="Operator control"
        title="Edit the proposed architecture"
        detail="Engine output remains the baseline. Additions, removals, statuses, and notes persist as visible operator overrides."
      />
      <div className="border-b border-white/[0.07] p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex-1">
            <span className="sr-only">Architecture module to add</span>
            <select value={moduleId} onChange={(event) => setModuleId(event.target.value)} className={studioInput}>
              <option value="">Add an optional module…</option>
              {addable.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <button type="button" disabled={disabled || !moduleId} onClick={() => void addModule()} className={studioPrimaryButton}>Add module</button>
        </div>
      </div>

      <div className="grid gap-3 p-4 lg:grid-cols-2">
        {topology.nodes.map((node) => (
          <ArchitectureModuleCard key={`${node.id}:${node.origin}:${node.operatorNote ?? ""}`} node={node} disabled={disabled} onCommand={onCommand} />
        ))}
      </div>

      {excluded.length ? (
        <div className="border-t border-white/[0.07] p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-100/70">Removed by operator</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {excluded.map((override) => {
              const definition = ARCHITECTURE_MODULE_LIBRARY.find((item) => item.id === override.moduleId);
              return <button key={override.moduleId} type="button" disabled={disabled} onClick={() => void onCommand({ kind: "restore_architecture_module", moduleId: override.moduleId })} className={studioButton}>Restore {definition?.label ?? override.moduleId}</button>;
            })}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function ArchitectureModuleCard({ node, disabled, onCommand }: { node: ArchitectureNode; disabled: boolean; onCommand: ArchitectureEditorProps["onCommand"] }) {
  const [note, setNote] = useState(node.operatorNote ?? "");
  const isOverride = node.origin === "operator";
  return (
    <article className={`rounded-xl border p-3 ${isOverride ? "border-amber-200/30 bg-amber-200/[0.035]" : "border-white/[0.08] bg-black/15"}`}>
      <div className="flex items-start justify-between gap-3">
        <div><h3 className="text-sm font-semibold text-white">{node.label}</h3><p className="mt-1 text-[11px] leading-4 text-slate-400">{node.detail}</p></div>
        <StatusPill tone={isOverride ? "amber" : "cyan"}>{isOverride ? "Operator override" : "Engine generated"}</StatusPill>
      </div>
      <fieldset className="mt-3">
        <legend className="text-[11px] font-semibold text-slate-400">Decision status</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {(["accepted", "rejected", "undecided"] as const).map((status) => (
            <button key={status} type="button" disabled={disabled} onClick={() => void onCommand({ kind: "update_architecture_module", moduleId: node.id, decisionStatus: status })} className={`${(node.decisionStatus ?? "undecided") === status ? studioPrimaryButton : studioButton} min-h-8 py-1 text-[11px] capitalize`}>{status}</button>
          ))}
        </div>
      </fieldset>
      <label className="mt-3 block">
        <span className="text-[11px] font-semibold text-slate-400">Operator note</span>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={320} className={`${studioInput} mt-1.5 resize-y`} placeholder="Why this differs from the generated starting point" />
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" disabled={disabled || note === (node.operatorNote ?? "")} onClick={() => void onCommand({ kind: "update_architecture_module", moduleId: node.id, note })} className={studioButton}>Save note</button>
        <button type="button" disabled={disabled} onClick={() => void onCommand({ kind: "update_architecture_module", moduleId: node.id, presence: "excluded" })} className={`${studioButton} text-rose-100`}>Remove</button>
        {isOverride ? <button type="button" disabled={disabled} onClick={() => void onCommand({ kind: "restore_architecture_module", moduleId: node.id })} className={studioButton}>Restore generated</button> : null}
      </div>
    </article>
  );
}
