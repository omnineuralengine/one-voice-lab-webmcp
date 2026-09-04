"use client";

import { useState } from "react";

import {
  InspectorDock,
  LiveConnectionBadge,
  ModuleHero,
  ModulePageShell,
  ModulePanel,
  ModuleStatusStrip,
  ModuleWorkspace,
} from "@/components/one/ModulePrimitives";
import { useTelephonyReadiness } from "@/components/telephony-readiness/TelephonyReadinessProvider";
import { VoiceOpenLabNav } from "@/components/voice-open-lab/VoiceOpenLabNav";
import type {
  TelephonyEvidenceGate,
  TelephonyReadinessReport,
  TelephonySafeguardId,
  TelephonyTimelineEvent,
} from "@/lib/telephony-readiness/contracts";
import {
  TELEPHONY_SAFEGUARDS,
  TELEPHONY_SCENARIO_FIXTURES,
} from "@/lib/telephony-readiness/fixtures";

const EXAMPLE_PROMPT =
  "Prepare a Twilio production-readiness test. Stress latency, interruption, silence, and one dropped WebSocket. Do not place a real call. Show me the evidence and the highest-priority remediation.";

const SOURCE_LABELS = {
  "human-ui": "Human UI",
  "webmcp-agent": "WebMCP agent",
} as const;

function readableId(value: string) {
  return value.replaceAll("-", " ").replaceAll("_", " ");
}

function formatMetricValue(value: number | boolean | string, unit: string) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (unit === "ms") return `${value} ms`;
  if (unit === "count") return String(value);
  if (unit === "characters") return `${value} chars`;
  return String(value);
}

function GateCard({ gate, stale }: { gate: TelephonyEvidenceGate; stale: boolean }) {
  return (
    <article className="telephony-gate" data-evidence-stale={stale} data-gate-id={gate.id} data-status={gate.status}>
      <header>
        <div>
          <span>Gate · {readableId(gate.id)}</span>
          <h3>{gate.title}</h3>
        </div>
        <strong>{stale ? "Retained · stale" : gate.status === "passed" ? "Passed" : "Needs attention"}</strong>
      </header>
      <p className="telephony-gate__owner">Responsible owner: {readableId(gate.owner)}</p>
      {gate.evidence.map((item, index) => (
        <p className="telephony-gate__evidence" key={`${gate.id}-${index}`}>
          <span>Simulated evidence</span>
          {item.summary}
        </p>
      ))}
      <p className="telephony-gate__action"><strong>Next action:</strong> {gate.recommendedNextAction}</p>
    </article>
  );
}

function Timeline({ events }: { events: readonly TelephonyTimelineEvent[] }) {
  return (
    <ol aria-label="Ordered simulated call events" className="telephony-timeline">
      {events.map((event) => (
        <li data-state={event.state} key={event.id}>
          <time dateTime={event.timestamp}>+{event.offsetMs} ms</time>
          <div>
            <span>{readableId(event.type)} · {readableId(event.owner)} · Evidence state: {readableId(event.state)}</span>
            <strong>{event.label}</strong>
            <p>{event.detail}</p>
            {event.conversationState ? <small>State: {event.conversationState}</small> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function MetricGrid({ report }: { report: TelephonyReadinessReport }) {
  return (
    <dl className="telephony-metrics">
      {report.metrics.map((metric) => (
        <div key={metric.id}>
          <dt>{metric.label}</dt>
          <dd>{formatMetricValue(metric.value, metric.unit)}</dd>
          <small>{metric.role} · simulated</small>
        </div>
      ))}
    </dl>
  );
}

function CausalComparison({
  before,
  after,
}: {
  before: TelephonyReadinessReport;
  after: TelephonyReadinessReport;
}) {
  if (before.scenario !== after.scenario) return null;
  const addedSafeguards = after.safeguards.filter((id) => !before.safeguards.includes(id));
  const changedGates = after.gates.flatMap((gate) => {
    const previous = before.gates.find((candidate) => candidate.id === gate.id);
    return previous && previous.status !== gate.status
      ? [{ id: gate.id, before: previous.status, after: gate.status }]
      : [];
  });
  const changedMetrics = after.metrics.flatMap((metric) => {
    const previous = before.metrics.find((candidate) => candidate.id === metric.id);
    return previous && (previous.value !== metric.value || previous.unit !== metric.unit)
      ? [{ id: metric.id, before: formatMetricValue(previous.value, previous.unit), after: formatMetricValue(metric.value, metric.unit) }]
      : [];
  });
  const eventCounts = (report: TelephonyReadinessReport) => {
    const counts = new Map<TelephonyTimelineEvent["type"], number>();
    report.timeline.forEach((event) => counts.set(event.type, (counts.get(event.type) ?? 0) + 1));
    return counts;
  };
  const beforeEventCounts = eventCounts(before);
  const afterEventCounts = eventCounts(after);
  const changedEvents = [...new Set([...beforeEventCounts.keys(), ...afterEventCounts.keys()])]
    .flatMap((type) => {
      const previous = beforeEventCounts.get(type) ?? 0;
      const current = afterEventCounts.get(type) ?? 0;
      return previous === current ? [] : [{ type, before: previous, after: current }];
    });
  return (
    <section aria-labelledby="telephony-comparison-title" className="telephony-comparison">
      <header>
        <p className="one-module-eyebrow">Deterministic causal comparison</p>
        <h3 id="telephony-comparison-title">What changed and why</h3>
      </header>
      <p>
        Same fixture: <strong>{before.scenario === after.scenario ? "Yes" : "No"}</strong>. Added causal inputs:{" "}
        <strong>{addedSafeguards.length > 0 ? addedSafeguards.map(readableId).join(", ") : "none"}</strong>.
      </p>
      {changedGates.length > 0 ? (
        <ul>
          {changedGates.map((gate) => (
            <li key={gate.id}><strong>{readableId(gate.id)}</strong>: {readableId(gate.before)} → {readableId(gate.after)}</li>
          ))}
        </ul>
      ) : <p>No gate status changed; inspect the exact timing and event evidence before choosing another remediation.</p>}
      {changedMetrics.length > 0 ? (
        <div className="telephony-comparison__delta">
          <strong>Metric deltas</strong>
          <ul>{changedMetrics.map((metric) => <li key={metric.id}>{readableId(metric.id)}: {metric.before} → {metric.after}</li>)}</ul>
        </div>
      ) : null}
      {changedEvents.length > 0 ? (
        <div className="telephony-comparison__delta">
          <strong>Event-count deltas</strong>
          <ul>{changedEvents.map((event) => <li key={event.type}>{readableId(event.type)}: {event.before} → {event.after}</li>)}</ul>
        </div>
      ) : null}
    </section>
  );
}

function ExamplePrompt() {
  const [copyStatus, setCopyStatus] = useState("Ready to copy.");
  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(EXAMPLE_PROMPT);
      setCopyStatus("Example prompt copied.");
    } catch {
      setCopyStatus("Clipboard unavailable. Select and copy the prompt manually.");
    }
  };
  return (
    <section aria-labelledby="telephony-example-prompt-title" className="telephony-example-prompt">
      <header>
        <h3 id="telephony-example-prompt-title">Example WebMCP prompt</h3>
        <button onClick={copyPrompt} type="button">Copy prompt</button>
      </header>
      <textarea aria-label="Example WebMCP prompt" readOnly rows={5} value={EXAMPLE_PROMPT} />
      <p aria-live="polite">{copyStatus}</p>
    </section>
  );
}

export function TelephonyReadinessLab() {
  const { controller, state, siteToolsStatus } = useTelephonyReadiness();
  const report = state.lastReport;
  const siteToolValue = siteToolsStatus.state === "ready"
    ? `${siteToolsStatus.registeredToolNames.length} tools ready`
    : siteToolsStatus.state === "unsupported"
      ? "Human UI only"
      : readableId(siteToolsStatus.state);

  const configureScenario = (scenario: typeof state.configuration.scenario) => {
    controller.configure({ ...state.configuration, scenario }, "human-ui");
  };
  const setSafeguard = (safeguard: TelephonySafeguardId, enabled: boolean) => {
    const safeguards = enabled
      ? [...state.configuration.safeguards, safeguard]
      : state.configuration.safeguards.filter((candidate) => candidate !== safeguard);
    controller.configure({ ...state.configuration, safeguards }, "human-ui");
  };

  return (
    <ModulePageShell className="telephony-readiness-page">
      <VoiceOpenLabNav current="build" />
      <ModuleHero
        actions={<LiveConnectionBadge label="Simulation mode" detail="No network" state="verified" />}
        className="telephony-readiness-hero"
        eyebrow="Demo → Production · deterministic simulated evidence"
        outcome="Stress the five evidence gates, apply one bounded local remediation, and rerun the identical fixture to see the causal change. No credential or live telephony path exists in this MVP."
        title="Twilio ConversationRelay — first supported telephony adapter"
      />
      <ModuleStatusStrip
        items={[
          { label: "Mode", value: "Simulation mode", tone: "purple" },
          { label: "Credentials", value: "Credentials not configured", tone: "amber" },
          { label: "Call", value: "No live call placed", tone: "green" },
          { label: "WebMCP", value: siteToolValue, tone: siteToolsStatus.state === "ready" ? "green" : "neutral" },
        ]}
        label="Telephony readiness boundaries"
      />

      <ModuleWorkspace className="telephony-readiness-workspace" layout="inspector">
        <ModulePanel
          className="telephony-readiness-controls"
          description="Every control changes ephemeral browser state only. Run output is deterministic for the selected scenario and safeguard set."
          title="Configure the readiness test"
        >
          <label className="telephony-field" htmlFor="telephony-provider">
            <span>Telephony adapter</span>
            <input id="telephony-provider" readOnly value="Twilio ConversationRelay" />
          </label>
          <label className="telephony-field" htmlFor="telephony-scenario">
            <span>Scenario</span>
            <select
              id="telephony-scenario"
              onChange={(event) => configureScenario(event.target.value as typeof state.configuration.scenario)}
              value={state.configuration.scenario}
            >
              {TELEPHONY_SCENARIO_FIXTURES.map((fixture) => (
                <option key={fixture.id} value={fixture.id}>{fixture.label}</option>
              ))}
            </select>
          </label>
          <p className="telephony-scenario-description">
            {TELEPHONY_SCENARIO_FIXTURES.find((fixture) => fixture.id === state.configuration.scenario)?.description}
          </p>
          <fieldset className="telephony-safeguards">
            <legend>Configured safeguards</legend>
            {TELEPHONY_SAFEGUARDS.map((safeguard) => (
              <label key={safeguard.id}>
                <input
                  checked={state.configuration.safeguards.includes(safeguard.id)}
                  onChange={(event) => setSafeguard(safeguard.id, event.target.checked)}
                  type="checkbox"
                />
                <span><strong>{safeguard.label}</strong><small>{safeguard.description}</small></span>
              </label>
            ))}
          </fieldset>
          <button
            className="telephony-run-button"
            onClick={() => controller.run({}, "human-ui")}
            type="button"
          >
            Run deterministic readiness simulation
          </button>
          <p className="telephony-hard-boundary">
            Live ConversationRelay requires an eligible funded Twilio account. This lab cannot place a call, contact Twilio, read credentials, or change infrastructure.
          </p>
        </ModulePanel>

        <InspectorDock
          description={siteToolsStatus.message}
          title="Activity and bounded remediations"
        >
          <section aria-label="Latest lab activity" className="telephony-activity" data-source={state.latestActivity?.source ?? "none"}>
            <span>Latest change</span>
            <strong>{state.latestActivity ? SOURCE_LABELS[state.latestActivity.source] : "No changes yet"}</strong>
            <p aria-live="polite" role="status">{state.latestActivity?.detail ?? "Configure or run a local simulation to begin."}</p>
          </section>
          {state.evidenceStale ? (
            <p className="telephony-stale-notice" role="status">Configuration changed. The visible evidence is retained for comparison but is stale; rerun the same scenario.</p>
          ) : null}
          <div className="telephony-remediations">
            {TELEPHONY_SAFEGUARDS.map((remediation) => {
              const enabled = state.configuration.safeguards.includes(remediation.id);
              return (
                <button
                  disabled={enabled}
                  key={remediation.id}
                  onClick={() => controller.applyRemediation({ remediation: remediation.id }, "human-ui")}
                  type="button"
                >
                  <span>{enabled ? "Enabled" : "Apply remediation"}</span>
                  <strong>{remediation.label}</strong>
                </button>
              );
            })}
          </div>
          <ExamplePrompt />
        </InspectorDock>
      </ModuleWorkspace>

      <ModulePanel
        className="telephony-readiness-report"
        description="No generic score: each gate retains its exact evidence, responsible owner, and next action."
        title="Demo → Production evidence gates"
      >
        {report ? (
          <>
            <header aria-live="polite" className="telephony-report-summary">
              <div><span>Evidence mode</span><strong>Simulated evidence only</strong></div>
              <div><span>Gates passed</span><strong>{report.gatesPassed.length} / {report.gates.length}</strong></div>
              <div><span>Call outcome</span><strong>{readableId(report.callOutcome)}</strong></div>
              <div><span>Provider requests / credits</span><strong>0 / 0</strong></div>
            </header>
            <p className="telephony-evidence-disclosure">{state.evidenceStale ? "Retained previous evidence — current configuration is not run. " : ""}{report.evidenceDisclosure}</p>
            <div className="telephony-gate-grid">
              {report.gates.map((gate) => <GateCard gate={gate} key={gate.id} stale={state.evidenceStale} />)}
            </div>
          </>
        ) : (
          <div className="telephony-empty-evidence">
            <strong>Not run</strong>
            <p>Select a deterministic fixture and run it. The complete human workflow remains available when WebMCP is unsupported.</p>
          </div>
        )}
      </ModulePanel>

      {report ? (
        <ModuleWorkspace className="telephony-evidence-workspace" layout="split">
          <ModulePanel description="Ordered, fixed timestamps with explicit state and ownership." title="Per-call event timeline">
            <Timeline events={report.timeline} />
          </ModulePanel>
          <ModulePanel description="Primary, diagnostic, completeness, operational, and safety evidence remain distinct." title="Observable call evidence">
            <MetricGrid report={report} />
            {state.previousReport?.scenario === report.scenario ? <CausalComparison after={report} before={state.previousReport} /> : null}
            <section className="telephony-downstream-concept">
              <strong>Predictive CSAT · optional downstream concept</strong>
              <p>{report.optionalDownstreamConcepts[0].detail}</p>
            </section>
            <details className="telephony-json-report">
              <summary>Inspect structured simulated report</summary>
              <pre aria-label="Structured simulated readiness report" tabIndex={0}>{JSON.stringify(report, null, 2)}</pre>
            </details>
          </ModulePanel>
        </ModuleWorkspace>
      ) : null}

      <ModulePanel className="telephony-production-boundary" title="Production boundary">
        <ul>
          <li>Initial X-Twilio-Signature validation is modeled but no webhook or WebSocket is opened.</li>
          <li>Reconnect means fresh TwiML and a fresh session in the simulation; failure never becomes success.</li>
          <li>REPROMPT, END_SESSION, transfer, playback, and intentional termination remain explicit.</li>
          <li>Imported evidence: none. Live evidence: none. Provider calls and credits: zero.</li>
        </ul>
        <p>Production-readiness guidance informed by Twilio ConversationRelay documentation and field insight from Isa Bell at Twilio.</p>
      </ModulePanel>
    </ModulePageShell>
  );
}
