"use client";

import { useState } from "react";

import {
  FieldLabel,
  JsonView,
  Panel,
  PanelHeading,
  ProvenanceBadge,
  buttonClassName,
  inputClassName,
  primaryButtonClassName,
  textareaClassName,
} from "@/components/applied-voice-systems/AcademyPrimitives";
import { MOCK_TOOLS, MULTI_AGENT_PRESETS, getMockTool, validateMockToolArguments } from "@/lib/applied-voice/labs";
import { sanitizeAppliedExport } from "@/lib/applied-voice/academy";
import type { AgentPreset } from "@/types/applied-voice";

type ToolEvent = { id: string; phase: string; label: string; payload?: unknown; status: "ok" | "error" | "pending"; provenance: "simulated" };

export function ToolCallingLab() {
  const [mode, setMode] = useState<"tool" | "agents">("tool");
  const [toolId, setToolId] = useState(MOCK_TOOLS[0].id);
  const tool = getMockTool(toolId) ?? MOCK_TOOLS[0];
  const [transcript, setTranscript] = useState("Please look up order ORDER-DEMO-42.");
  const [argumentsJson, setArgumentsJson] = useState(JSON.stringify(tool.exampleRequest, null, 2));
  const [executionBoundary, setExecutionBoundary] = useState<"client" | "server-concept">("client");
  const [requireConfirmation, setRequireConfirmation] = useState(tool.requireConfirmationDefault);
  const [confirmed, setConfirmed] = useState(false);
  const [inject, setInject] = useState<"none" | "error" | "timeout" | "malformed">("none");
  const [requireHumanApproval, setRequireHumanApproval] = useState(false);
  const [events, setEvents] = useState<ToolEvent[]>([]);
  const [result, setResult] = useState<unknown>(null);
  const [activeAgentId, setActiveAgentId] = useState(MULTI_AGENT_PRESETS[0].id);
  const [handoffHistory, setHandoffHistory] = useState<Array<{ from: string; to: string; reason: string; summary: string; excluded: string[] }>>([]);
  const activeAgent = MULTI_AGENT_PRESETS.find((agent) => agent.id === activeAgentId) ?? MULTI_AGENT_PRESETS[0];

  function selectTool(nextId: string) {
    const next = getMockTool(nextId) ?? MOCK_TOOLS[0];
    setToolId(next.id);
    setArgumentsJson(JSON.stringify(next.exampleRequest, null, 2));
    setRequireConfirmation(next.requireConfirmationDefault);
    setConfirmed(false);
    setEvents([]);
    setResult(null);
  }

  function runTool() {
    const nextEvents: ToolEvent[] = [
      event("speech", "User speech captured", { transcript }),
      event("transcript", "Transcript available", { transcript }),
      event("intent", "Intent mapped to a candidate tool", { tool: tool.name, note: "Learner-selected local simulation; no intent model ran." }),
    ];
    let args: unknown;
    try {
      args = JSON.parse(argumentsJson) as unknown;
    } catch {
      nextEvents.push(errorEvent("validation", "Arguments are not valid JSON", { source: argumentsJson }));
      setEvents(nextEvents);
      setResult({ ok: false, error: "INVALID_JSON", simulated: true });
      return;
    }
    nextEvents.push(event("function-request", "FunctionCallRequest-style event", { id: "tool-call-sim-1", name: tool.name, arguments: JSON.stringify(args), client_side: executionBoundary === "client" }));
    const validationErrors = validateMockToolArguments(tool, args);
    if (validationErrors.length) {
      nextEvents.push(errorEvent("validation", "Schema validation failed", { errors: validationErrors }));
      setEvents(nextEvents);
      setResult({ ok: false, error: "SCHEMA_VALIDATION_FAILED", validationErrors, simulated: true });
      return;
    }
    nextEvents.push(event("validation", "Arguments validated against local JSON schema", args));
    if ((requireConfirmation || requireHumanApproval) && !confirmed) {
      nextEvents.push(errorEvent("approval", "Confirmation or human approval is required", { requireConfirmation, requireHumanApproval }));
      setEvents(nextEvents);
      setResult({ ok: false, error: "CONFIRMATION_REQUIRED", simulated: true });
      return;
    }
    let toolResult: unknown = tool.behavior.success;
    if (inject === "error") toolResult = tool.behavior.failure;
    if (inject === "timeout") toolResult = { ok: false, error: "SIMULATED_TIMEOUT", timeout_ms: tool.behavior.timeoutMs };
    if (inject === "malformed") toolResult = "MALFORMED_LOCAL_TOOL_DATA";
    nextEvents.push(inject === "none" ? event("execution", "Local mock tool completed", toolResult) : errorEvent("execution", `Injected ${inject}`, toolResult));
    nextEvents.push(event("function-response", "FunctionCallResponse-style event", { id: "tool-call-sim-1", name: tool.name, content: JSON.stringify(toolResult) }));
    nextEvents.push(event("response", inject === "none" ? "Response can be grounded in validated tool output" : "Explain failure and recover or hand off", { requiresHumanReview: tool.sensitive || inject !== "none" }));
    setEvents(nextEvents);
    setResult(sanitizeAppliedExport(toolResult));
  }

  function handoffTo(targetId: string) {
    if (targetId === activeAgent.id) return;
    const target = MULTI_AGENT_PRESETS.find((agent) => agent.id === targetId);
    if (!target) return;
    setHandoffHistory((current) => [...current, {
      from: activeAgent.name,
      to: target.name,
      reason: activeAgent.handoffCriteria[0] ?? "Specialized scope required",
      summary: `Sanitized summary: ${transcript.slice(0, 120)}`,
      excluded: ["DEEPGRAM_API_KEY", "Authorization", "raw temporary token", "unneeded customer fields"],
    }]);
    setActiveAgentId(targetId);
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <Panel className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <PanelHeading
          eyebrow="Safe local action simulator"
          title="Speech → validated structure → bounded behavior"
          detail="No real CRM, financial, medical, email, calendar, identity, or account action is performed."
          actions={<><ProvenanceBadge value="local simulation" /><div className="flex rounded-md border border-white/10 p-0.5"><Tab active={mode === "tool"} onClick={() => setMode("tool")}>Tool call</Tab><Tab active={mode === "agents"} onClick={() => setMode("agents")}>Multi-agent handoff</Tab></div></>}
        />
        {mode === "tool" ? (
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(320px,.78fr)_minmax(360px,1.22fr)]">
            <div className="min-h-0 overflow-y-auto border-r border-white/10 p-3">
              <div className="grid gap-3 xl:grid-cols-2">
                <FieldLabel label="Local mock tool"><select value={toolId} onChange={(event) => selectTool(event.target.value)} className={inputClassName}>{MOCK_TOOLS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FieldLabel>
                <FieldLabel label="Execution boundary"><select value={executionBoundary} onChange={(event) => setExecutionBoundary(event.target.value as typeof executionBoundary)} className={inputClassName}><option value="client">Client-side local simulation</option><option value="server-concept">Server-side execution concept</option></select></FieldLabel>
                <div className="xl:col-span-2"><FieldLabel label="User speech / transcript"><textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} rows={3} className={textareaClassName} /></FieldLabel></div>
                <div className="xl:col-span-2"><FieldLabel label="Function arguments JSON"><textarea value={argumentsJson} onChange={(event) => setArgumentsJson(event.target.value)} rows={8} spellCheck={false} className={`${textareaClassName} font-mono`} /></FieldLabel></div>
                <FieldLabel label="Failure injection"><select value={inject} onChange={(event) => setInject(event.target.value as typeof inject)} className={inputClassName}><option value="none">Success fixture</option><option value="error">Tool error</option><option value="timeout">Timeout</option><option value="malformed">Malformed response</option></select></FieldLabel>
                <div className="space-y-1.5">
                  <Check label="Require confirmation" checked={requireConfirmation} onChange={setRequireConfirmation} />
                  <Check label="Require human approval" checked={requireHumanApproval} onChange={setRequireHumanApproval} />
                  <Check label="Confirmation received" checked={confirmed} onChange={setConfirmed} />
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-amber-300/15 bg-amber-300/[0.04] p-3"><p className="text-[10px] font-semibold text-amber-100">{tool.description}</p><p className="mt-2 text-[9px] leading-4 text-amber-100/60">Security risk: {tool.securityRisk}</p><p className="mt-1 text-[9px] leading-4 text-slate-600">{tool.behavior.idempotencyNote} {tool.behavior.retryNote}</p></div>
              <div className="mt-3 flex gap-2"><button type="button" onClick={runTool} className={primaryButtonClassName}>Run local simulation</button><button type="button" onClick={() => { setArgumentsJson(JSON.stringify(tool.exampleRequest, null, 2)); setEvents([]); setResult(null); }} className={buttonClassName}>Reset fixture</button></div>
            </div>
            <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_minmax(180px,.7fr)]">
              <div className="min-h-0 overflow-y-auto p-3">
                <Flow events={events} />
              </div>
              <div className="min-h-0 overflow-y-auto border-t border-white/10 p-3"><div className="grid gap-3 xl:grid-cols-2"><JsonView value={tool.schema} label="Tool JSON schema" /><JsonView value={result ?? { state: "Run the simulation to produce a result." }} label="Function result · sanitized" /></div></div>
            </div>
          </div>
        ) : <MultiAgentView activeAgent={activeAgent} history={handoffHistory} onHandoff={handoffTo} />}
      </Panel>
    </div>
  );
}

function MultiAgentView({ activeAgent, history, onHandoff }: { activeAgent: AgentPreset; history: Array<{ from: string; to: string; reason: string; summary: string; excluded: string[] }>; onHandoff: (id: string) => void }) {
  return <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(330px,1fr)_minmax(260px,.75fr)]"><div className="min-h-0 overflow-y-auto border-r border-white/10 p-2">{MULTI_AGENT_PRESETS.map((agent) => <button key={agent.id} type="button" onClick={() => onHandoff(agent.id)} className={`mb-1.5 w-full rounded-md border p-2 text-left ${activeAgent.id === agent.id ? "border-violet-300/30 bg-violet-300/[0.08]" : "border-white/[0.07] bg-black/15 hover:border-white/15"}`}><span className="block text-[10px] font-semibold text-slate-200">{agent.name}</span><span className="mt-1 block text-[9px] leading-3.5 text-slate-600">{agent.purpose}</span></button>)}</div><div className="min-h-0 overflow-y-auto p-3"><div className="flex items-center justify-between"><div><p className="text-[9px] uppercase tracking-wide text-violet-200/65">Current agent</p><h3 className="mt-1 text-lg font-semibold text-white">{activeAgent.name}</h3></div><ProvenanceBadge value="simulated" /></div><p className="mt-2 text-[11px] leading-5 text-slate-400">{activeAgent.purpose}</p><div className="mt-3 grid gap-2 xl:grid-cols-2"><List title="Scoped prompt" items={[activeAgent.scopedPrompt]} /><List title="Available tools" items={activeAgent.availableToolIds} mono /><List title="Allowed data" items={activeAgent.allowedData} /><List title="Handoff criteria" items={activeAgent.handoffCriteria} /><List title="Context received" items={activeAgent.contextReceived} /><List title="Context emitted" items={activeAgent.contextEmitted} /></div></div><div className="min-h-0 overflow-y-auto border-l border-white/10 p-3"><p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Handoff trace</p>{history.length ? <div className="mt-2 space-y-2">{history.map((entry, index) => <div key={`${entry.from}-${entry.to}-${index}`} className="rounded-lg border border-white/[0.08] bg-black/20 p-2"><p className="text-[10px] font-semibold text-slate-200">{entry.from} → {entry.to}</p><p className="mt-1 text-[9px] text-slate-500">{entry.reason}</p><p className="mt-2 text-[9px] leading-4 text-slate-400">{entry.summary}</p><p className="mt-2 text-[8px] leading-3.5 text-rose-200/60">Excluded: {entry.excluded.join(", ")}</p></div>)}</div> : <p className="mt-3 text-[10px] leading-4 text-slate-600">Select a specialist to simulate a constrained, explicit handoff.</p>}<div className="mt-4 rounded-lg border border-cyan-300/15 bg-cyan-300/[0.04] p-3 text-[9px] leading-4 text-slate-500">Focused agents reduce prompt complexity, constrain tool access, clarify transitions, and make testing safer. This is a state-machine simulation—not a connected Voice Agent session.</div></div></div>;
}

function Flow({ events }: { events: ToolEvent[] }) {
  if (!events.length) return <div className="grid h-full place-items-center text-center"><p className="max-w-sm text-[10px] leading-4 text-slate-600">Run a fixture to create a FunctionCallRequest-style trace. Event names are instructional; local tools do not contact external systems.</p></div>;
  return <ol className="space-y-2">{events.map((item, index) => <li key={item.id} className="grid grid-cols-[26px_minmax(0,1fr)] gap-2"><span className={`flex size-6 items-center justify-center rounded-full font-mono text-[8px] font-bold ${item.status === "error" ? "bg-rose-300 text-slate-950" : "bg-cyan-200 text-slate-950"}`}>{index + 1}</span><div className="rounded-lg border border-white/[0.08] bg-black/20 p-2"><div className="flex items-center justify-between"><p className="text-[10px] font-semibold text-slate-200">{item.label}</p><span className="font-mono text-[8px] text-slate-600">{item.phase}</span></div>{item.payload !== undefined ? <pre className="mt-2 max-h-28 overflow-auto font-mono text-[8px] leading-3.5 text-slate-500">{JSON.stringify(item.payload, null, 2)}</pre> : null}</div></li>)}</ol>;
}

function List({ title, items, mono = false }: { title: string; items: string[]; mono?: boolean }) { return <div className="rounded-lg border border-white/[0.08] bg-black/15 p-3"><p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">{title}</p><ul className={`mt-2 space-y-1 text-[9px] leading-4 text-slate-400 ${mono ? "font-mono" : ""}`}>{items.map((item, index) => <li key={`${index}-${item}`}>• {item}</li>)}</ul></div>; }
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="flex items-center gap-2 text-[9px] text-slate-400"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="accent-cyan-300" />{label}</label>; }
function Tab({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) { return <button type="button" onClick={onClick} className={`rounded px-2 py-1 text-[9px] font-semibold ${active ? "bg-violet-200 text-slate-950" : "text-slate-500 hover:text-white"}`}>{children}</button>; }
function event(phase: string, label: string, payload?: unknown): ToolEvent { return { id: crypto.randomUUID(), phase, label, payload: sanitizeAppliedExport(payload), status: "ok", provenance: "simulated" }; }
function errorEvent(phase: string, label: string, payload?: unknown): ToolEvent { return { ...event(phase, label, payload), status: "error" }; }
