"use client";

import { useState } from "react";

import { studioButton, studioInput, studioPrimaryButton } from "@/components/architecture-studio/StudioPrimitives";
import { ARCHITECTURE_NODE_TEMPLATES } from "@/lib/architecture-studio/architecture-workspace";
import type { ArchitectureCanvasSnapshot, CanvasArchitectureConnection, CanvasArchitectureNode, SimulationAction } from "@/types/architecture-studio-diagnostics";

export function ArchitectureInspector({
  architecture,
  selectedNode,
  selectedConnection,
  disabled,
  onAction,
}: {
  architecture: ArchitectureCanvasSnapshot;
  selectedNode?: CanvasArchitectureNode;
  selectedConnection?: CanvasArchitectureConnection;
  disabled: boolean;
  onAction: (action: SimulationAction) => void;
}) {
  const [addType, setAddType] = useState(ARCHITECTURE_NODE_TEMPLATES[0].type);
  const [fromNodeId, setFromNodeId] = useState(architecture.nodes[0]?.id ?? "");
  const [toNodeId, setToNodeId] = useState(architecture.nodes[1]?.id ?? "");
  const [flow, setFlow] = useState<CanvasArchitectureConnection["flow"]>("audio");
  const [protocol, setProtocol] = useState("");

  const effectiveFromNodeId = architecture.nodes.some((node) => node.id === fromNodeId) ? fromNodeId : architecture.nodes[0]?.id ?? "";
  const effectiveToNodeId = architecture.nodes.some((node) => node.id === toNodeId) ? toNodeId : architecture.nodes[1]?.id ?? "";

  return (
    <div className="space-y-4">
      {selectedNode ? <NodeDetails key={selectedNode.id} node={selectedNode} disabled={disabled} onAction={onAction} /> : null}
      {selectedConnection ? <ConnectionDetails key={selectedConnection.id} connection={selectedConnection} architecture={architecture} disabled={disabled} onAction={onAction} /> : null}
      {!selectedNode && !selectedConnection ? (
        <div className="rounded-xl border border-white/[0.08] bg-black/15 p-4">
          <p className="text-sm font-semibold text-white">Inspect or edit the topology</p>
          <p className="mt-2 text-[12px] leading-5 text-slate-400">Select a component or connection. Generated decisions remain recoverable in the revision history.</p>
        </div>
      ) : null}

      <details className="rounded-xl border border-white/[0.08] bg-black/15 p-4">
        <summary className="cursor-pointer text-xs font-semibold text-white focus-visible:outline-2 focus-visible:outline-cyan-200">Add a module</summary>
        <div className="mt-3 space-y-2">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400" htmlFor="architecture-add-node">Module type</label>
          <select id="architecture-add-node" value={addType} onChange={(event) => setAddType(event.target.value as typeof addType)} className={studioInput}>
            {ARCHITECTURE_NODE_TEMPLATES.map((template) => <option key={template.type} value={template.type}>{template.displayName}</option>)}
          </select>
          <button type="button" disabled={disabled} onClick={() => onAction({ type: "add-node", nodeType: addType })} className={studioButton}>Add module</button>
        </div>
      </details>

      <details className="rounded-xl border border-white/[0.08] bg-black/15 p-4">
        <summary className="cursor-pointer text-xs font-semibold text-white focus-visible:outline-2 focus-visible:outline-cyan-200">Connect two modules</summary>
        <div className="mt-3 grid gap-2">
          <FieldLabel id="architecture-from" label="From"><select id="architecture-from" value={effectiveFromNodeId} onChange={(event) => setFromNodeId(event.target.value)} className={studioInput}>{architecture.nodes.map((node) => <option key={node.id} value={node.id}>{node.displayName}</option>)}</select></FieldLabel>
          <FieldLabel id="architecture-to" label="To"><select id="architecture-to" value={effectiveToNodeId} onChange={(event) => setToNodeId(event.target.value)} className={studioInput}>{architecture.nodes.map((node) => <option key={node.id} value={node.id}>{node.displayName}</option>)}</select></FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            <FieldLabel id="architecture-flow" label="Flow"><select id="architecture-flow" value={flow} onChange={(event) => setFlow(event.target.value as typeof flow)} className={studioInput}><option value="audio">Audio</option><option value="transcript">Transcript</option><option value="control">Control</option><option value="business-data">Business data</option></select></FieldLabel>
            <FieldLabel id="architecture-protocol" label="Protocol"><input id="architecture-protocol" value={protocol} onChange={(event) => setProtocol(event.target.value)} className={studioInput} placeholder="WebSocket" /></FieldLabel>
          </div>
          <button type="button" disabled={disabled || !effectiveFromNodeId || !effectiveToNodeId || effectiveFromNodeId === effectiveToNodeId} onClick={() => onAction({ type: "add-connection", fromNodeId: effectiveFromNodeId, toNodeId: effectiveToNodeId, flow, protocol })} className={studioButton}>Connect modules</button>
        </div>
      </details>
    </div>
  );
}

function NodeDetails({ node, disabled, onAction }: { node: CanvasArchitectureNode; disabled: boolean; onAction: (action: SimulationAction) => void }) {
  const [name, setName] = useState(node.displayName);
  const [vendor, setVendor] = useState(node.vendor);
  const [owner, setOwner] = useState(node.owner);
  const [decisionState, setDecisionState] = useState(node.decisionState);
  const [notes, setNotes] = useState(node.operatorNotes);
  const save = () => onAction({ type: "update-node", nodeId: node.id, changes: { displayName: name, vendor, owner, decisionState, operatorNotes: notes } });

  return (
    <section className="rounded-xl border border-cyan-200/15 bg-cyan-200/[0.035] p-4" aria-labelledby="node-inspector-title">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-100/65">Selected module</p><h3 id="node-inspector-title" className="mt-1 text-sm font-semibold text-white">{node.displayName}</h3></div><span className="rounded bg-black/25 px-2 py-1 text-[10px] font-bold uppercase text-slate-300">{node.origin.replaceAll("-", " ")}</span></div>
      <div className="mt-4 space-y-3">
        <FieldLabel id={`node-name-${node.id}`} label="Display name"><input id={`node-name-${node.id}`} value={name} onChange={(event) => setName(event.target.value)} className={studioInput} /></FieldLabel>
        <FieldLabel id={`node-vendor-${node.id}`} label="Vendor / implementation"><input id={`node-vendor-${node.id}`} value={vendor} onChange={(event) => setVendor(event.target.value)} className={studioInput} /></FieldLabel>
        <div className="grid grid-cols-2 gap-2">
          <FieldLabel id={`node-owner-${node.id}`} label="Managed by"><select id={`node-owner-${node.id}`} value={owner} onChange={(event) => setOwner(event.target.value as typeof owner)} className={studioInput}><option value="customer-managed">Customer</option><option value="deepgram-managed">Deepgram</option><option value="third-party">Third party</option></select></FieldLabel>
          <FieldLabel id={`node-decision-${node.id}`} label="Decision"><select id={`node-decision-${node.id}`} value={decisionState} onChange={(event) => setDecisionState(event.target.value as typeof decisionState)} className={studioInput}><option value="undecided">Undecided</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option><option value="overridden">Overridden</option></select></FieldLabel>
        </div>
        <FieldLabel id={`node-notes-${node.id}`} label="Operator note"><textarea id={`node-notes-${node.id}`} value={notes} onChange={(event) => setNotes(event.target.value)} className={`${studioInput} min-h-24`} placeholder="Reason for the decision or implementation detail" /></FieldLabel>
        <button type="button" disabled={disabled} onClick={save} className={studioPrimaryButton}>Save module decision</button>
      </div>

      <details className="mt-4 border-t border-white/[0.08] pt-3">
        <summary className="cursor-pointer text-[11px] font-semibold text-slate-300">Requirements, risks, and original recommendation</summary>
        <div className="mt-3 space-y-3 text-[11px] leading-5 text-slate-400">
          <TextList label="Customer requirements" values={node.customerRequirements} empty="No direct discovery evidence mapped yet." />
          <TextList label="Associated risks" values={node.risks} empty="No mapped risk." />
          {node.originalRecommendation ? <div><p className="font-semibold text-slate-300">Engine-generated baseline</p><p>{node.originalRecommendation.displayName} · {node.originalRecommendation.vendor}</p><p>{node.originalRecommendation.rationale}</p></div> : null}
          <dl className="grid grid-cols-2 gap-2">{Object.entries(node.properties).map(([key, value]) => <div key={key} className="rounded border border-white/[0.07] p-2"><dt className="font-semibold text-slate-300">{key}</dt><dd>{value}</dd></div>)}</dl>
        </div>
      </details>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.08] pt-3">
        <button type="button" disabled={disabled} onClick={() => onAction({ type: "disable-node", nodeId: node.id })} className={studioButton}>{node.enabled ? "Disable" : "Disabled"}</button>
        <button type="button" disabled={disabled} onClick={() => onAction({ type: "duplicate-node", nodeId: node.id })} className={studioButton}>Duplicate</button>
        <button type="button" disabled={disabled} onClick={() => {
          const wording = node.origin === "engine-generated" ? "Override and remove this generated module? The audit trail and original recommendation will be preserved." : "Remove this manually added module?";
          if (window.confirm(wording)) onAction({ type: "remove-node", nodeId: node.id });
        }} className={`${studioButton} text-rose-100`}>{node.origin === "engine-generated" ? "Override + remove" : "Remove"}</button>
      </div>
    </section>
  );
}

function ConnectionDetails({ connection, architecture, disabled, onAction }: { connection: CanvasArchitectureConnection; architecture: ArchitectureCanvasSnapshot; disabled: boolean; onAction: (action: SimulationAction) => void }) {
  const [values, setValues] = useState(connection);
  const from = architecture.nodes.find((node) => node.id === connection.fromNodeId)?.displayName ?? connection.fromNodeId;
  const to = architecture.nodes.find((node) => node.id === connection.toNodeId)?.displayName ?? connection.toNodeId;
  const update = <K extends keyof CanvasArchitectureConnection>(key: K, value: CanvasArchitectureConnection[K]) => setValues((current) => ({ ...current, [key]: value }));
  return (
    <section className="rounded-xl border border-violet-200/15 bg-violet-200/[0.035] p-4" aria-labelledby="connection-inspector-title">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-100/65">Selected connection</p>
      <h3 id="connection-inspector-title" className="mt-1 text-sm font-semibold text-white">{from} → {to}</h3>
      <div className="mt-4 grid gap-3">
        <div className="grid grid-cols-2 gap-2"><FieldLabel id={`connection-protocol-${connection.id}`} label="Protocol"><input id={`connection-protocol-${connection.id}`} value={values.protocol ?? ""} onChange={(event) => update("protocol", event.target.value)} className={studioInput} /></FieldLabel><FieldLabel id={`connection-mode-${connection.id}`} label="Mode"><select id={`connection-mode-${connection.id}`} value={values.mode ?? "streaming"} onChange={(event) => update("mode", event.target.value as typeof values.mode)} className={studioInput}><option value="streaming">Streaming</option><option value="batch">Batch</option></select></FieldLabel></div>
        <details className="rounded-lg border border-white/[0.08] p-3"><summary className="cursor-pointer text-[11px] font-semibold text-slate-300">Transport, latency, retry, and security</summary><div className="mt-3 grid gap-2 sm:grid-cols-2">{([[
          "audioEncoding", "Audio encoding"], ["sampleRate", "Sample rate"], ["transport", "Transport"], ["authenticationType", "Authentication"], ["estimatedLatency", "Estimated latency"], ["retryBehavior", "Retry behavior"], ["timeout", "Timeout"], ["encryption", "Encryption"], ["region", "Region"], ["ownershipBoundary", "Ownership boundary"]] as const).map(([key, label]) => <FieldLabel key={key} id={`${connection.id}-${key}`} label={label}><input id={`${connection.id}-${key}`} value={values[key] ?? ""} onChange={(event) => update(key, event.target.value)} className={studioInput} placeholder="Optional" /></FieldLabel>)}</div></details>
        <FieldLabel id={`connection-note-${connection.id}`} label="Operator note"><textarea id={`connection-note-${connection.id}`} value={values.operatorNotes} onChange={(event) => update("operatorNotes", event.target.value)} className={`${studioInput} min-h-20`} /></FieldLabel>
        <div className="flex gap-2"><button type="button" disabled={disabled} onClick={() => onAction({ type: "update-connection", connectionId: connection.id, changes: values })} className={studioPrimaryButton}>Save connection</button><button type="button" disabled={disabled} onClick={() => { if (window.confirm("Remove this connection? The generated comparison record will remain available.")) onAction({ type: "remove-connection", connectionId: connection.id }); }} className={`${studioButton} text-rose-100`}>Remove</button></div>
      </div>
    </section>
  );
}

function FieldLabel({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return <label htmlFor={id} className="block text-[11px] font-bold uppercase tracking-wider text-slate-400"><span className="mb-1 block">{label}</span>{children}</label>;
}

function TextList({ label, values, empty }: { label: string; values: string[]; empty: string }) {
  return <div><p className="font-semibold text-slate-300">{label}</p>{values.length ? <ul className="list-disc pl-4">{values.map((value) => <li key={value}>{value}</li>)}</ul> : <p>{empty}</p>}</div>;
}
