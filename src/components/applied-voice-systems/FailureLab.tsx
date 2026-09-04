"use client";

import { useState } from "react";
import {
  EmptyState,
  JsonView,
  Panel,
  PanelHeading,
  ProvenanceBadge,
  buttonClassName,
  inputClassName,
  primaryButtonClassName,
} from "@/components/applied-voice-systems/AcademyPrimitives";
import { FAILURE_SCENARIOS } from "@/lib/applied-voice/labs";
import type { FailureScenario } from "@/types/applied-voice";

type SimulationResult = {
  localSessionId: string;
  stepId: string;
  provenance: "local simulation";
  execution: "deterministic local fixture";
  event: {
    type: "SimulatedFailureInjected";
    scenarioId: string;
    layer: FailureScenario["layer"];
    payload: unknown;
  };
  result: {
    outcome: "failure-contained";
    successClaimed: false;
    fallback: string;
    retrySafe: FailureScenario["retrySafe"];
  };
  security: {
    networkRequests: 0;
    credentialsRead: false;
    credentialsMutated: false;
    authorization: "***redacted***";
  };
};

export function FailureLab() {
  const [selectedId, setSelectedId] = useState(FAILURE_SCENARIOS[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [guided, setGuided] = useState(true);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const selected = FAILURE_SCENARIOS.find((scenario) => scenario.id === selectedId) ?? FAILURE_SCENARIOS[0];

  const filteredScenarios = (() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return FAILURE_SCENARIOS;
    return FAILURE_SCENARIOS.filter((scenario) => [scenario.name, scenario.id, scenario.layer, scenario.userSymptom]
      .some((value) => value.toLowerCase().includes(normalized)));
  })();

  function runSimulation(scenario: FailureScenario) {
    setSimulation({
      localSessionId: "local-failure-simulation",
      stepId: `inject-${scenario.id}`,
      provenance: "local simulation",
      execution: "deterministic local fixture",
      event: {
        type: "SimulatedFailureInjected",
        scenarioId: scenario.id,
        layer: scenario.layer,
        payload: scenario.relevantPayload,
      },
      result: {
        outcome: "failure-contained",
        successClaimed: false,
        fallback: scenario.fallback,
        retrySafe: scenario.retrySafe,
      },
      security: {
        networkRequests: 0,
        credentialsRead: false,
        credentialsMutated: false,
        authorization: "***redacted***",
      },
    });
  }

  return (
    <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[254px_minmax(0,1fr)]">
      <Panel className="flex min-h-0 flex-col overflow-hidden">
        <PanelHeading
          eyebrow="Failure registry"
          title="Injectable scenarios"
          detail={`${FAILURE_SCENARIOS.length} deterministic fixtures · no real systems changed`}
          actions={<ProvenanceBadge value="simulated" />}
        />
        <div className="shrink-0 border-b border-white/[0.08] p-2.5">
          <label>
            <span className="sr-only">Filter failure scenarios</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter symptom, layer, or failure…"
              className={inputClassName}
            />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {filteredScenarios.length ? (
            <ul className="space-y-1" aria-label="Failure scenarios">
              {filteredScenarios.map((scenario) => {
                const active = scenario.id === selected?.id;
                return (
                  <li key={scenario.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(scenario.id);
                        setSimulation(null);
                      }}
                      className={`w-full rounded-md border px-2.5 py-2 text-left transition focus-visible:outline-2 focus-visible:outline-cyan-200 ${active ? "border-cyan-300/30 bg-cyan-300/[0.09] shadow-[0_0_18px_rgba(34,211,238,0.06)]" : "border-transparent hover:border-white/10 hover:bg-white/[0.03]"}`}
                    >
                      <span className={`block text-[10px] font-semibold ${active ? "text-white" : "text-slate-400"}`}>{scenario.name}</span>
                      <span className="mt-0.5 flex items-center justify-between gap-2 text-[8px] uppercase tracking-wide text-slate-600">
                        <span>{humanize(scenario.layer)}</span>
                        <span>{retryLabel(scenario.retrySafe)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : <EmptyState title="No matching failure" detail="Try a layer such as transport, tool, audio, or deployment." />}
        </div>
      </Panel>

      {selected ? (
        <Panel className="flex min-h-0 flex-col overflow-hidden">
          <PanelHeading
            eyebrow="Safe resilience lab"
            title={selected.name}
            detail={selected.injection}
            actions={(
              <>
                <button
                  type="button"
                  aria-pressed={guided}
                  onClick={() => setGuided((current) => !current)}
                  className={buttonClassName}
                >
                  Guided diagnosis {guided ? "on" : "off"}
                </button>
                <button type="button" onClick={() => runSimulation(selected)} className={primaryButtonClassName}>Run local simulation</button>
              </>
            )}
          />

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-violet-300/15 bg-violet-300/[0.045] p-2.5">
              <ProvenanceBadge value="local simulation" />
              <span className="text-[9px] leading-4 text-violet-100/60">Runs entirely in browser memory. It performs no fetch, reads no credential, changes no environment variable, and never creates a real outage.</span>
            </div>

            {guided ? <DiagnosisPath scenario={selected} /> : null}

            {simulation ? (
              <section aria-live="polite" className="mb-3 rounded-lg border border-emerald-300/20 bg-emerald-300/[0.055] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-200/60">Simulation result</p>
                    <p className="mt-1 text-[11px] font-semibold text-emerald-100">Failure observed and contained locally</p>
                  </div>
                  <div className="flex items-center gap-1.5"><ProvenanceBadge value="local simulation" /><button type="button" onClick={() => setSimulation(null)} className={buttonClassName}>Clear</button></div>
                </div>
                <p className="mt-2 text-[9px] leading-4 text-emerald-100/55">No success was claimed. The fixture selected the documented fallback and recorded a sanitized event with zero network requests.</p>
                <div className="mt-3"><JsonView value={simulation} label="Local simulated event + result" maxHeight="max-h-64" /></div>
              </section>
            ) : (
              <div className="mb-3 rounded-lg border border-dashed border-white/10 bg-black/15 px-3 py-4 text-center">
                <p className="text-[10px] font-semibold text-slate-400">No simulation result yet</p>
                <p className="mt-1 text-[9px] text-slate-600">Run the fixture to create a labeled local event/result. No network request will occur.</p>
              </div>
            )}

            <div className="grid gap-3 xl:grid-cols-2">
              <DetailCard title="Visible user symptom" value={selected.userSymptom} tone="amber" />
              <DetailCard title="Likely layer" value={humanize(selected.layer)} detail="Do not jump directly to the API; first locate the failing system boundary." />
              <ListCard title="Evidence to inspect" items={selected.evidence} />
              <DetailCard title="Correct fallback" value={selected.fallback} tone="cyan" />
              <DetailCard
                title="Retry policy"
                value={selected.retryPolicy}
                detail={`Retry safety: ${retryLabel(selected.retrySafe)}. A retry is not a substitute for changing invalid input, configuration, or authorization.`}
                tone={selected.retrySafe === false ? "amber" : "default"}
              />
              <DetailCard title="Customer-facing explanation" value={selected.customerExplanation} detail="Transparent language: never imply the failed step succeeded." />
              <DetailCard title="Monitoring signal" value={selected.monitoringSignal} detail="Alert on affected-session ratio and user-visible duration, not only raw error count." />
              <ListCard title="Production prevention" items={selected.prevention} />
              <div className="xl:col-span-2">
                <JsonView value={selected.relevantPayload} label="Relevant sanitized payload / event" maxHeight="max-h-56" />
              </div>
            </div>
          </div>
        </Panel>
      ) : <EmptyState title="Failure registry is empty" detail="No deterministic scenarios are available." />}
    </div>
  );
}

function DiagnosisPath({ scenario }: { scenario: FailureScenario }) {
  const steps = [
    { label: "1 · User symptom", value: scenario.userSymptom },
    { label: "2 · Trace backward", value: scenario.evidence[0] ?? "Inspect the last known-good event." },
    { label: "3 · Isolate layer", value: humanize(scenario.layer) },
    { label: "4 · Contain", value: scenario.fallback },
    { label: "5 · Prevent", value: scenario.monitoringSignal },
  ];
  return (
    <section className="mb-3 rounded-lg border border-cyan-300/15 bg-cyan-300/[0.035] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-cyan-200/65">Guided diagnosis</p>
          <p className="mt-1 text-[10px] text-slate-400">Start with what the user sees, then follow the sanitized trace backward.</p>
        </div>
        <ProvenanceBadge value="architectural concept" />
      </div>
      <ol className="mt-3 grid gap-2 lg:grid-cols-5">
        {steps.map((step, index) => (
          <li key={step.label} className="relative rounded-md border border-white/[0.08] bg-black/20 p-2">
            <p className="text-[8px] font-semibold uppercase tracking-wide text-cyan-100/50">{step.label}</p>
            <p className="mt-1.5 text-[9px] leading-3.5 text-slate-400">{step.value}</p>
            {index < steps.length - 1 ? <span className="absolute -right-2 top-1/2 z-10 hidden -translate-y-1/2 text-[10px] text-cyan-200/30 lg:block" aria-hidden="true">→</span> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function DetailCard({ title, value, detail, tone = "default" }: { title: string; value: string; detail?: string; tone?: "default" | "amber" | "cyan" }) {
  const classes = tone === "amber" ? "border-amber-300/15 bg-amber-300/[0.035]" : tone === "cyan" ? "border-cyan-300/15 bg-cyan-300/[0.035]" : "border-white/[0.08] bg-black/15";
  return (
    <section className={`rounded-lg border p-3 ${classes}`}>
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</p>
      <p className="mt-2 text-[10px] leading-4 text-slate-300">{value}</p>
      {detail ? <p className="mt-2 text-[9px] leading-3.5 text-slate-600">{detail}</p> : null}
    </section>
  );
}

function ListCard({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-lg border border-white/[0.08] bg-black/15 p-3">
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</p>
      <ul className="mt-2 space-y-1.5 text-[10px] leading-4 text-slate-400">
        {items.map((item, index) => <li key={`${index}-${item}`} className="flex gap-2"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-cyan-300/60" /><span>{item}</span></li>)}
      </ul>
    </section>
  );
}

function retryLabel(value: FailureScenario["retrySafe"]) {
  if (value === true) return "retry safe with policy";
  if (value === false) return "do not retry unchanged";
  return "retry conditional";
}

function humanize(value: string) {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
