"use client";

import { useEffect, useMemo, useState } from "react";

import { API_CHAIN_PRESETS, API_OPERATIONS } from "@/lib/deepgram-api-catalog";
import { looksLikeRealApiKey, readLocalJson, sanitizeSnippetForExport, writeLocalJson } from "@/lib/code-lab-storage";
import type { ApiChainPreset, CustomApiChain, CustomApiChainStep } from "@/types/deepgram-api-studio";

const CHAIN_STORAGE_KEY = "deepgram-api-studio:custom-chain:v1";
const DEFAULT_CUSTOM_CHAIN: CustomApiChain = {
  name: "My Deepgram workflow",
  steps: [
    { id: "step-1", operationId: "stt-url", handoffField: "results.channels[0].alternatives[0].transcript → text" },
    { id: "step-2", operationId: "text-intelligence-analyze", handoffField: "results.summary.results.summary.text → customer context" },
  ],
};

export function ApiChainBuilder({
  onOpenCodeLab,
  onExplore,
}: {
  onOpenCodeLab: (workflowId: ApiChainPreset["codeLabWorkflow"]) => void;
  onExplore: (chainId: string) => void;
}) {
  const [mode, setMode] = useState<"presets" | "custom">("presets");
  const [selectedPresetId, setSelectedPresetId] = useState(API_CHAIN_PRESETS[0].id);
  const [customChain, setCustomChain] = useState<CustomApiChain>(readStoredCustomChain);
  const [saved, setSaved] = useState(false);
  const [storageWarning, setStorageWarning] = useState("");
  const preset = API_CHAIN_PRESETS.find((item) => item.id === selectedPresetId) ?? API_CHAIN_PRESETS[0];

  useEffect(() => {
    if (!saved) return;
    const timeout = window.setTimeout(() => setSaved(false), 1400);
    return () => window.clearTimeout(timeout);
  }, [saved]);

  const handoffPreview = useMemo(() => buildCustomHandoff(customChain), [customChain]);

  function updateCustom(next: CustomApiChain) {
    setCustomChain(next);
    if (looksLikeRealApiKey(JSON.stringify(next))) {
      setSaved(false);
      setStorageWarning("Possible credential detected. This draft remains in memory and was not saved.");
      return;
    }
    setStorageWarning("");
    setSaved(writeLocalJson(CHAIN_STORAGE_KEY, next));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#071118]/70 px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-200/70">API Chain Builder</p>
          <h3 className="mt-1 text-base font-semibold text-white">Turn API primitives into client workflows</h3>
        </div>
        <div className="flex rounded-md border border-white/10 bg-black/25 p-1">
          {(["presets", "custom"] as const).map((item) => (
            <button key={item} type="button" onClick={() => setMode(item)} className={`rounded px-3 py-1.5 text-[10px] font-semibold capitalize ${mode === item ? "bg-violet-200 text-slate-950" : "text-slate-500 hover:text-white"}`}>
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {mode === "presets" ? (
          <div className="grid gap-3 xl:grid-cols-[220px_minmax(0,1fr)]">
            <div className="space-y-1.5">
              {API_CHAIN_PRESETS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedPresetId(item.id);
                    onExplore(item.id);
                  }}
                  className={`w-full rounded-lg border p-3 text-left transition ${item.id === preset.id ? "border-violet-300/30 bg-violet-300/[0.09] shadow-[0_0_24px_rgba(167,139,250,0.08)]" : "border-white/[0.08] bg-black/20 hover:border-white/15"}`}
                >
                  <span className="block text-[11px] font-semibold text-slate-200">{item.name}</span>
                  <span className="mt-1 block text-[9px] text-slate-600">{item.apiIds.length} Deepgram surface{item.apiIds.length === 1 ? "" : "s"}</span>
                </button>
              ))}
            </div>
            <PresetDetail preset={preset} onOpenCodeLab={() => onOpenCodeLab(preset.codeLabWorkflow)} />
          </div>
        ) : (
          <div className="space-y-3">
            <section className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="min-w-0 flex-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Chain name</span>
                  <input value={customChain.name} onChange={(event) => updateCustom({ ...customChain, name: event.target.value })} className="mt-1 h-9 w-full rounded-md border border-white/10 bg-[#071018] px-2 text-xs text-slate-200 outline-none focus:border-violet-300/40" />
                </label>
                <span className={`self-end pb-2 text-[10px] ${storageWarning ? "text-amber-200" : "text-emerald-300/70"}`}>{storageWarning || (saved ? "Saved locally" : "Local-only persistence")}</span>
              </div>
            </section>

            <section className="space-y-2">
              {customChain.steps.map((step, index) => (
                <CustomStepEditor
                  key={step.id}
                  step={step}
                  index={index}
                  total={customChain.steps.length}
                  onUpdate={(next) => updateCustom({ ...customChain, steps: customChain.steps.map((item) => item.id === step.id ? next : item) })}
                  onRemove={() => updateCustom({ ...customChain, steps: customChain.steps.filter((item) => item.id !== step.id) })}
                  onMove={(direction) => updateCustom({ ...customChain, steps: moveStep(customChain.steps, index, direction) })}
                />
              ))}
              <button type="button" onClick={() => updateCustom({ ...customChain, steps: [...customChain.steps, { id: crypto.randomUUID(), operationId: "stt-url", handoffField: "output field → next input" }] })} className="w-full rounded-lg border border-dashed border-cyan-300/20 bg-cyan-300/[0.035] px-3 py-3 text-xs font-semibold text-cyan-100/75 hover:bg-cyan-300/[0.07]">
                + Add API step
              </button>
            </section>

            <section className="overflow-hidden rounded-lg border border-white/10 bg-[#02060b]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200/65">Handoff map</p>
                  <p className="mt-0.5 text-[10px] text-slate-600">No credentials or payload values are persisted.</p>
                </div>
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => downloadText(`${slugify(customChain.name)}.json`, safeChainJson(customChain), "application/json")} className="rounded border border-white/10 px-2 py-1 text-[10px] text-slate-400 hover:text-white">Export JSON</button>
                  <button type="button" onClick={() => downloadText(`${slugify(customChain.name)}.md`, safeChainMarkdown(customChain), "text/markdown")} className="rounded border border-white/10 px-2 py-1 text-[10px] text-slate-400 hover:text-white">Download Markdown</button>
                </div>
              </div>
              <pre className="max-h-72 overflow-auto p-3 font-mono text-[10px] leading-4 text-slate-300">{JSON.stringify(handoffPreview, null, 2)}</pre>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function PresetDetail({ preset, onOpenCodeLab }: { preset: ApiChainPreset; onOpenCodeLab: () => void }) {
  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-violet-300/20 bg-violet-300/[0.045] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-200/70">Preset chain</p>
            <h4 className="mt-1 text-lg font-semibold text-white">{preset.name}</h4>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">{preset.summary}</p>
          </div>
          <button type="button" onClick={onOpenCodeLab} className="rounded-md border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-xs font-bold text-cyan-100 hover:bg-cyan-300/15">Open in Code Lab</button>
        </div>
        <div className="mt-4 flex min-w-0 items-center gap-1 overflow-x-auto pb-1">
          {preset.steps.map((step, index) => (
            <div key={step} className="flex shrink-0 items-center gap-1">
              <span className="rounded-md border border-white/10 bg-black/30 px-2.5 py-2 text-[10px] font-semibold text-slate-300">{step}</span>
              {index < preset.steps.length - 1 ? <span className="text-cyan-300/50">→</span> : null}
            </div>
          ))}
        </div>
      </section>
      <div className="grid gap-2 xl:grid-cols-2">
        <InfoCard title="Customer value" body={preset.customerValue} />
        <InfoCard title="Technical risk" body={preset.technicalRisk} tone="amber" />
        <InfoList title="Security + privacy" items={preset.securityConcerns} tone="rose" />
        <InfoList title="Suggested code files" items={preset.suggestedFiles} mono />
      </div>
      <section className="overflow-hidden rounded-lg border border-white/10 bg-[#02060b]">
        <div className="border-b border-white/10 px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200/65">Sample JSON handoff</p></div>
        <pre className="max-h-64 overflow-auto p-3 font-mono text-[10px] leading-4 text-slate-300">{JSON.stringify(preset.handoff, null, 2)}</pre>
      </section>
    </div>
  );
}

function CustomStepEditor({ step, index, total, onUpdate, onRemove, onMove }: { step: CustomApiChainStep; index: number; total: number; onUpdate: (step: CustomApiChainStep) => void; onRemove: () => void; onMove: (direction: -1 | 1) => void }) {
  return (
    <div className="grid items-end gap-2 rounded-lg border border-white/10 bg-black/20 p-3 lg:grid-cols-[34px_minmax(180px,0.8fr)_minmax(220px,1.2fr)_auto]">
      <div className="flex size-8 items-center justify-center rounded-md bg-cyan-200 font-mono text-xs font-bold text-slate-950">{index + 1}</div>
      <label>
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-600">API operation</span>
        <select value={step.operationId} onChange={(event) => onUpdate({ ...step, operationId: event.target.value })} className="mt-1 h-9 w-full rounded-md border border-white/10 bg-[#071018] px-2 text-[11px] text-slate-200">
          {API_OPERATIONS.map((operation) => <option key={operation.id} value={operation.id}>{operation.name}</option>)}
        </select>
      </label>
      <label>
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-600">Payload handoff</span>
        <input value={step.handoffField} onChange={(event) => onUpdate({ ...step, handoffField: event.target.value })} placeholder="transcript → text intelligence input" className="mt-1 h-9 w-full rounded-md border border-white/10 bg-[#071018] px-2 font-mono text-[10px] text-slate-200 outline-none focus:border-cyan-300/40" />
      </label>
      <div className="flex gap-1">
        <StepButton disabled={index === 0} onClick={() => onMove(-1)}>↑</StepButton>
        <StepButton disabled={index === total - 1} onClick={() => onMove(1)}>↓</StepButton>
        <StepButton disabled={total <= 1} onClick={onRemove}>×</StepButton>
      </div>
    </div>
  );
}

function StepButton({ children, disabled, onClick }: { children: React.ReactNode; disabled: boolean; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="flex size-8 items-center justify-center rounded border border-white/10 bg-white/[0.04] text-xs text-slate-400 hover:text-white disabled:opacity-25">{children}</button>;
}

function InfoCard({ title, body, tone = "default" }: { title: string; body: string; tone?: "default" | "amber" }) {
  return <div className={`rounded-lg border bg-black/15 p-3 ${tone === "amber" ? "border-amber-300/15" : "border-white/[0.08]"}`}><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</p><p className="mt-2 text-[11px] leading-5 text-slate-400">{body}</p></div>;
}

function InfoList({ title, items, tone = "default", mono = false }: { title: string; items: string[]; tone?: "default" | "rose"; mono?: boolean }) {
  return <div className={`rounded-lg border bg-black/15 p-3 ${tone === "rose" ? "border-rose-300/15" : "border-white/[0.08]"}`}><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</p><ul className={`mt-2 space-y-1.5 text-[10px] leading-4 text-slate-400 ${mono ? "font-mono" : ""}`}>{items.map((item, index) => <li key={`${index}-${item}`}>• {item}</li>)}</ul></div>;
}

function moveStep(steps: CustomApiChainStep[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= steps.length) return steps;
  const next = [...steps];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function buildCustomHandoff(chain: CustomApiChain) {
  return {
    version: 1,
    name: chain.name,
    localOnly: true,
    steps: chain.steps.map((step, index) => {
      const operation = API_OPERATIONS.find((item) => item.id === step.operationId);
      return { order: index + 1, operationId: step.operationId, operation: operation?.name ?? "Unknown", endpoint: operation?.endpoint ?? "", handoff: step.handoffField };
    }),
  };
}

function safeChainJson(chain: CustomApiChain) {
  return sanitizeSnippetForExport(JSON.stringify(buildCustomHandoff(chain), null, 2));
}

function safeChainMarkdown(chain: CustomApiChain) {
  const map = buildCustomHandoff(chain);
  const lines = [`# ${chain.name}`, "", "Local-only API Studio chain. No credentials are included.", "", "## Steps", ""];
  for (const step of map.steps) lines.push(`${step.order}. **${step.operation}** — \`${step.endpoint}\``, `   - Handoff: \`${step.handoff}\``);
  return sanitizeSnippetForExport(lines.join("\n") + "\n");
}

function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "deepgram-api-chain";
}

function readStoredCustomChain() {
  const stored = readLocalJson(CHAIN_STORAGE_KEY, DEFAULT_CUSTOM_CHAIN);
  return looksLikeRealApiKey(JSON.stringify(stored)) ? DEFAULT_CUSTOM_CHAIN : stored;
}
