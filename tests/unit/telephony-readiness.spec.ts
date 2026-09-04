import { expect, test } from "@playwright/test";

import {
  TELEPHONY_GATE_IDS,
  TELEPHONY_SAFEGUARD_IDS,
  TELEPHONY_SCENARIO_IDS,
  telephonyReadinessReportSchema,
  type TelephonyGateId,
  type TelephonyMetricId,
  type TelephonyReadinessConfiguration,
  type TelephonyReadinessReport,
  type TelephonySafeguardId,
  type TelephonyScenarioId,
} from "@/lib/telephony-readiness/contracts";
import { createTelephonyReadinessController } from "@/lib/telephony-readiness/controller";
import {
  TELEPHONY_RESPONSIVENESS_TARGET_MS,
  enableTelephonySafeguard,
  evaluateTelephonyResponsiveness,
  runTelephonyReadinessSimulation,
} from "@/lib/telephony-readiness/engine";
import {
  TELEPHONY_SAFEGUARDS,
  TELEPHONY_SCENARIO_FIXTURES,
  getTelephonySafeguardDefinition,
} from "@/lib/telephony-readiness/fixtures";

const ALL_SAFEGUARDS = [...TELEPHONY_SAFEGUARD_IDS];

const GATE_OWNERS: Readonly<Record<TelephonyGateId, "application" | "shared">> = {
  responsiveness: "shared",
  interruptibility: "application",
  resilience: "shared",
  "edge-cases": "application",
  observability: "application",
};

const EXPECTED_CAUSAL_INPUTS: Readonly<Record<TelephonySafeguardId, string>> = {
  "enable-token-streaming": "tokenStreamingEnabled",
  "shorten-first-response": "conciseFirstResponseEnabled",
  "enable-interruptible-playback": "interruptiblePlaybackEnabled",
  "define-silence-policy": "silencePolicyDefined",
  "require-signature-validation": "signatureValidationRequired",
  "define-reconnect-fallback": "reconnectFallbackDefined",
  "enable-structured-observability": "structuredObservabilityEnabled",
};

function configuration(
  scenario: TelephonyScenarioId,
  safeguards: readonly TelephonySafeguardId[] = [],
): TelephonyReadinessConfiguration {
  return {
    provider: "twilio-conversation-relay",
    mode: "simulation",
    scenario,
    safeguards: [...safeguards],
  };
}

function gate(report: TelephonyReadinessReport, id: TelephonyGateId) {
  const value = report.gates.find((candidate) => candidate.id === id);
  if (!value) throw new Error(`Missing readiness gate: ${id}`);
  return value;
}

function metric(report: TelephonyReadinessReport, id: TelephonyMetricId) {
  const value = report.metrics.find((candidate) => candidate.id === id);
  if (!value) throw new Error(`Missing readiness metric: ${id}`);
  return value;
}

function eventTypes(report: TelephonyReadinessReport) {
  return report.timeline.map((event) => event.type);
}

function changedKeys(
  before: TelephonyReadinessConfiguration,
  after: TelephonyReadinessConfiguration,
) {
  return (Object.keys(before) as Array<keyof TelephonyReadinessConfiguration>)
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

test.describe("Twilio-first telephony readiness domain", () => {
  test("uses the strict 1200 ms responsiveness boundary", () => {
    expect(TELEPHONY_RESPONSIVENESS_TARGET_MS).toBe(1_200);
    expect(evaluateTelephonyResponsiveness(1_199)).toBe(true);
    expect(evaluateTelephonyResponsiveness(1_200)).toBe(false);
    expect(evaluateTelephonyResponsiveness(-1)).toBe(false);
    expect(evaluateTelephonyResponsiveness(Number.NaN)).toBe(false);
    expect(evaluateTelephonyResponsiveness(Number.POSITIVE_INFINITY)).toBe(false);
  });

  test("replays all six fixtures deterministically with ordered timestamped evidence", () => {
    expect(TELEPHONY_SCENARIO_FIXTURES.map((fixture) => fixture.id)).toEqual(TELEPHONY_SCENARIO_IDS);

    for (const scenario of TELEPHONY_SCENARIO_IDS) {
      const input = configuration(scenario, ALL_SAFEGUARDS);
      const first = runTelephonyReadinessSimulation(input);
      const second = runTelephonyReadinessSimulation(input);

      expect(second, scenario).toEqual(first);
      expect(telephonyReadinessReportSchema.parse(first), scenario).toEqual(first);
      expect(first.scenario).toBe(scenario);
      expect(first.evidenceMode).toBe("simulated");
      expect(first.providerRequestCount).toBe(0);
      expect(first.providerCreditCount).toBe(0);
      expect(first.liveActionsAvailable).toBe(false);
      expect(first.liveCallStatus).toBe("No live call placed");
      expect(first.timeline.map((event) => event.sequence)).toEqual(
        first.timeline.map((_, index) => index),
      );
      expect(new Set(first.timeline.map((event) => event.id)).size).toBe(first.timeline.length);

      const startedAt = Date.parse(first.startedAt);
      first.timeline.forEach((event, index) => {
        expect(Date.parse(event.timestamp), `${scenario}:${event.id}`).toBe(startedAt + event.offsetMs);
        if (index > 0) {
          expect(event.offsetMs, `${scenario}:${event.id}`).toBeGreaterThanOrEqual(
            first.timeline[index - 1].offsetMs,
          );
          expect(Date.parse(event.timestamp), `${scenario}:${event.id}`).toBeGreaterThanOrEqual(
            Date.parse(first.timeline[index - 1].timestamp),
          );
        }
      });
      expect(first.completedAt).toBe(first.timeline.at(-1)?.timestamp);
    }
  });

  test("keeps conversation-state transitions coherent across every scenario and safeguard set", () => {
    type ConversationState = NonNullable<
      TelephonyReadinessReport["timeline"][number]["conversationState"]
    >;
    const allowedTransitions: Readonly<Record<ConversationState, readonly ConversationState[]>> = {
      CONNECTING: ["CONNECTING", "LISTENING", "FAILED"],
      LISTENING: ["LISTENING", "THINKING", "SPEAKING", "REPROMPT", "FAILED", "END_SESSION"],
      THINKING: ["THINKING", "SPEAKING", "LISTENING", "FAILED"],
      SPEAKING: ["SPEAKING", "THINKING", "LISTENING", "FAILED", "END_SESSION"],
      REPROMPT: ["REPROMPT", "LISTENING", "FAILED", "END_SESSION"],
      FAILED: ["FAILED", "CONNECTING"],
      END_SESSION: ["END_SESSION"],
    };

    for (const scenario of TELEPHONY_SCENARIO_IDS) {
      for (let mask = 0; mask < 2 ** TELEPHONY_SAFEGUARD_IDS.length; mask += 1) {
        const safeguards = TELEPHONY_SAFEGUARD_IDS.filter((_, index) => (mask & (1 << index)) !== 0);
        const report = runTelephonyReadinessSimulation(configuration(scenario, safeguards));
        let prior: ConversationState | undefined;

        for (const event of report.timeline) {
          const next = event.conversationState;
          if (!next) continue;
          if (prior) expect(allowedTransitions[prior], `${report.runId}:${event.id}:${prior}->${next}`).toContain(next);
          if (prior === "FAILED" && next === "CONNECTING") {
            expect(event.type, `${report.runId}:${event.id}`).toBe("reconnect_attempt");
          }
          if (prior !== "SPEAKING" && next === "SPEAKING") {
            expect(event.type, `${report.runId}:${event.id}`).toBe("start_of_agent_speech");
          }
          if (event.type === "final_token_received" && next === "SPEAKING") {
            expect(prior, `${report.runId}:${event.id}`).toBe("SPEAKING");
          }
          if (prior === "END_SESSION") expect(next, `${report.runId}:${event.id}`).toBe("END_SESSION");
          prior = next;
        }

        if (report.callOutcome === "completed" || report.callOutcome === "completed-with-escalation") {
          const recoveryAt = report.timeline
            .filter((event) => event.type === "fresh_session_recovered")
            .at(-1)?.offsetMs ?? 0;
          expect(
            report.timeline.some((event) => (
              event.type === "start_of_agent_speech" && event.offsetMs >= recoveryAt
            )),
            `${report.runId}: completed outcome requires post-recovery speech`,
          ).toBe(true);
        }

        const preemptedAt = report.timeline.find((event) => event.type === "preempted")?.offsetMs;
        const lossAt = report.timeline.find((event) => event.type === "websocket_loss")?.offsetMs;
        const recoveredAt = report.timeline.find((event) => event.type === "fresh_session_recovered")?.offsetMs;
        if (
          preemptedAt !== undefined
          && lossAt !== undefined
          && recoveredAt !== undefined
          && preemptedAt < lossAt
        ) {
          expect(
            report.timeline.some((event) => (
              event.type === "start_of_agent_speech" && event.offsetMs >= recoveredAt
            )),
            `${report.runId}: preempted playback must not restart after transport recovery`,
          ).toBe(false);
        }
      }
    }
  });

  test("classifies each scenario through its specific events and primary evidence", () => {
    const healthy = runTelephonyReadinessSimulation(configuration("healthy-call"));
    expect(metric(healthy, "customer-to-agent-speech-ms").value).toBe(600);
    expect(eventTypes(healthy)).not.toContain("failure");
    expect(healthy.callOutcome).toBe("completed");

    const latency = runTelephonyReadinessSimulation(configuration("latency-spike"));
    expect(metric(latency, "customer-to-agent-speech-ms")).toMatchObject({
      value: 1_200,
      role: "primary",
    });
    expect(metric(latency, "prompt-to-first-token-ms").role).toBe("diagnostic");
    expect(metric(latency, "prompt-to-final-token-ms").role).toBe("completeness");
    expect(gate(latency, "responsiveness").status).toBe("needs-attention");
    expect(latency.timeline.find((event) => event.type === "start_of_agent_speech")?.state)
      .toBe("attention");

    const interruption = runTelephonyReadinessSimulation(configuration("caller-interruption"));
    expect(eventTypes(interruption)).toEqual(expect.arrayContaining(["interrupt", "dtmf", "failure"]));
    expect(eventTypes(interruption)).not.toEqual(expect.arrayContaining(["preempted", "listening"]));
    expect(gate(interruption, "interruptibility").status).toBe("needs-attention");

    const dropped = runTelephonyReadinessSimulation(configuration("dropped-websocket"));
    expect(eventTypes(dropped)).toEqual(expect.arrayContaining([
      "malformed_message",
      "websocket_loss",
      "reconnect_attempt",
      "fallback",
    ]));
    expect(eventTypes(dropped)).not.toEqual(expect.arrayContaining([
      "fresh_twiml_requested",
      "fresh_session_recovered",
    ]));
    expect(dropped.timeline.find((event) => event.type === "fallback")?.state).toBe("failed");
    expect(dropped.timeline.filter((event) => event.state === "failed").map((event) => event.type))
      .toEqual(["reconnect_attempt", "fallback"]);
    expect(eventTypes(dropped)).not.toEqual(expect.arrayContaining([
      "final_token_received",
      "start_of_agent_speech",
    ]));
    expect(metric(dropped, "customer-to-agent-speech-ms").value).toBe("not-observed");
    expect(metric(dropped, "time-to-first-audio-ms").value).toBe("not-observed");
    expect(metric(dropped, "prompt-to-final-token-ms").value).toBe("not-observed");
    expect(dropped.callOutcome).toBe("failed");

    const silence = runTelephonyReadinessSimulation(configuration("repeated-silence"));
    expect(silence.timeline.filter((event) => event.type === "silence")).toHaveLength(2);
    expect(silence.timeline.filter((event) => event.type === "failure")).toHaveLength(1);
    expect(eventTypes(silence)).not.toEqual(expect.arrayContaining(["reprompt", "end_session"]));
    expect(gate(silence, "edge-cases").status).toBe("needs-attention");

    const combined = runTelephonyReadinessSimulation(configuration("combined-production-stress-test"));
    expect(metric(combined, "customer-to-agent-speech-ms").value).toBe(1_350);
    expect(eventTypes(combined)).toEqual(expect.arrayContaining([
      "malformed_message",
      "interrupt",
      "dtmf",
      "websocket_loss",
      "silence",
      "transfer_requested",
      "failure",
    ]));
    expect(metric(combined, "escalation-requested").value).toBe(true);
    expect(combined.callOutcome).toBe("failed");
  });

  test("never lets an emitted failure masquerade as a successful call", () => {
    for (const scenario of TELEPHONY_SCENARIO_IDS) {
      const report = runTelephonyReadinessSimulation(configuration(scenario));
      if (!report.timeline.some((event) => event.state === "failed")) continue;

      expect(report.callOutcome, scenario).toBe("failed");
      expect(metric(report, "failure-count").value, scenario).toBeGreaterThan(0);
      expect(metric(report, "task-completed").value, scenario).toBe(false);
      expect(report.overallStatus, scenario).toBe("needs-attention");
      expect(report.gatesNeedingAttention.length, scenario).toBeGreaterThan(0);
    }
  });

  test("publishes exact gate evidence, ownership, and next actions without a score", () => {
    const report = runTelephonyReadinessSimulation(configuration("combined-production-stress-test", ALL_SAFEGUARDS));
    const eventIds = new Set(report.timeline.map((event) => event.id));
    const metricIds = new Set(report.metrics.map((item) => item.id));

    expect(report.gates.map((item) => item.id)).toEqual(TELEPHONY_GATE_IDS);
    expect(report.gates.map((item) => item.owner)).toEqual(
      TELEPHONY_GATE_IDS.map((id) => GATE_OWNERS[id]),
    );
    expect(report.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "responsiveness",
        status: "passed",
        owner: "shared",
        recommendedNextAction: "Preserve the measured boundary and validate it with representative live evidence before production.",
      }),
      expect.objectContaining({
        id: "interruptibility",
        status: "passed",
        owner: "application",
        recommendedNextAction: "Keep responses concise and validate speech and DTMF barge-in against representative call paths.",
      }),
      expect.objectContaining({
        id: "resilience",
        status: "passed",
        owner: "shared",
        recommendedNextAction: "Validate signature and recovery behavior against a separately authorized eligible Twilio environment.",
      }),
      expect.objectContaining({
        id: "edge-cases",
        status: "passed",
        owner: "application",
        recommendedNextAction: "Preserve explicit REPROMPT, END_SESSION, transfer, media, and intentional-termination policies.",
      }),
      expect.objectContaining({
        id: "observability",
        status: "passed",
        owner: "application",
        recommendedNextAction: "Carry the same structured fields into production telemetry with privacy-aware retention.",
      }),
    ]));

    for (const readinessGate of report.gates) {
      expect(readinessGate.evidence.length, readinessGate.id).toBeGreaterThan(0);
      for (const evidence of readinessGate.evidence) {
        expect(evidence.provenance).toBe("simulated");
        expect(evidence.summary.trim()).not.toBe("");
        expect(evidence.eventIds.every((id) => eventIds.has(id)), readinessGate.id).toBe(true);
        expect(evidence.metricIds.every((id) => metricIds.has(id)), readinessGate.id).toBe(true);
      }
    }

    expect(new Set(report.timeline.map((event) => event.owner))).toEqual(
      new Set(["application", "twilio-provider", "shared"]),
    );
    expect(JSON.stringify(report)).not.toMatch(/"(?:score|rating|rank)"\s*:/i);
    expect(report.optionalDownstreamConcepts).toEqual([
      expect.objectContaining({ id: "predictive-csat", status: "not-computed" }),
    ]);
  });

  test("applies all seven remediations through one causal input each", () => {
    expect(TELEPHONY_SAFEGUARDS.map((item) => item.id)).toEqual(TELEPHONY_SAFEGUARD_IDS);
    expect(new Set(TELEPHONY_SAFEGUARDS.map((item) => item.causalInput)).size)
      .toBe(TELEPHONY_SAFEGUARD_IDS.length);

    const scenarioByRemediation: Readonly<Record<TelephonySafeguardId, TelephonyScenarioId>> = {
      "enable-token-streaming": "latency-spike",
      "shorten-first-response": "latency-spike",
      "enable-interruptible-playback": "caller-interruption",
      "define-silence-policy": "repeated-silence",
      "require-signature-validation": "healthy-call",
      "define-reconnect-fallback": "dropped-websocket",
      "enable-structured-observability": "healthy-call",
    };

    for (const remediation of TELEPHONY_SAFEGUARD_IDS) {
      const scenario = scenarioByRemediation[remediation];
      const controller = createTelephonyReadinessController();
      controller.configure(configuration(scenario), "human-ui");
      const before = controller.run({}, "human-ui").report;
      const beforeConfiguration = structuredClone(controller.getSnapshot().configuration);
      const applied = controller.applyRemediation({ remediation }, "webmcp-agent");
      const afterConfiguration = controller.getSnapshot().configuration;

      expect(getTelephonySafeguardDefinition(remediation).causalInput).toBe(
        EXPECTED_CAUSAL_INPUTS[remediation],
      );
      expect(changedKeys(beforeConfiguration, afterConfiguration), remediation).toEqual(["safeguards"]);
      expect(afterConfiguration.safeguards).toEqual([remediation]);
      expect(applied).toMatchObject({
        ok: true,
        changed: true,
        remediation,
        configuredSafeguards: [remediation],
        rerunRequired: true,
      });
      expect(controller.getSnapshot().evidenceStale).toBe(true);

      const enabled = enableTelephonySafeguard(beforeConfiguration, remediation);
      expect(enabled.changed).toBe(true);
      expect(enabled.configuration).toEqual(afterConfiguration);
      const after = controller.run({}, "webmcp-agent").report;
      expect(after.scenario).toBe(before.scenario);

      switch (remediation) {
        case "enable-token-streaming":
          expect(metric(before, "prompt-to-first-token-ms").value).toBe(700);
          expect(metric(after, "prompt-to-first-token-ms").value).toBe(520);
          expect(metric(before, "customer-to-agent-speech-ms").value).toBe(1_200);
          expect(metric(after, "customer-to-agent-speech-ms").value).toBe(1_020);
          expect(gate(before, "responsiveness").status).toBe("needs-attention");
          expect(gate(after, "responsiveness").status).toBe("passed");
          break;
        case "shorten-first-response":
          expect(metric(before, "first-response-characters").value).toBe(220);
          expect(metric(after, "first-response-characters").value).toBe(96);
          expect(metric(before, "prompt-to-final-token-ms").value).toBe(1_340);
          expect(metric(after, "prompt-to-final-token-ms").value).toBe(1_190);
          expect(gate(after, "responsiveness").status).toBe("passed");
          break;
        case "enable-interruptible-playback":
          expect(metric(before, "preemption-count").value).toBe(0);
          expect(metric(after, "preemption-count").value).toBe(1);
          expect(metric(before, "listening-recovery-ms").value).toBe("not-recovered");
          expect(metric(after, "listening-recovery-ms").value).toBe(80);
          expect(eventTypes(after)).toEqual(expect.arrayContaining(["preempted", "listening"]));
          expect(gate(after, "interruptibility").status).toBe("needs-attention");
          expect(gate(after, "interruptibility").evidence[0].summary).toContain("concise=false");
          break;
        case "define-silence-policy":
          expect(metric(before, "failure-count").value).toBe(1);
          expect(metric(after, "failure-count").value).toBe(0);
          expect(eventTypes(after)).toEqual(expect.arrayContaining(["reprompt", "end_session"]));
          expect(gate(after, "edge-cases").status).toBe("needs-attention");
          expect(gate(after, "edge-cases").evidence[0].summary).toContain("not all proven");
          expect(after.callOutcome).toBe("ended-by-policy");
          break;
        case "require-signature-validation":
          expect(metric(before, "signature-validation").value).toBe("not-required");
          expect(metric(after, "signature-validation").value).toBe("required-and-passed");
          expect(gate(before, "resilience").status).toBe("needs-attention");
          expect(gate(after, "resilience").status).toBe("needs-attention");
          expect(gate(after, "resilience").evidence[0].summary).toContain("WebSocket recovery was not exercised");
          break;
        case "define-reconnect-fallback":
          expect(metric(before, "reconnect-count").value).toBe(0);
          expect(metric(after, "reconnect-count").value).toBe(1);
          expect(metric(before, "failure-count").value).toBe(2);
          expect(metric(after, "failure-count").value).toBe(0);
          expect(eventTypes(after)).toEqual(expect.arrayContaining([
            "fresh_twiml_requested",
            "fresh_session_recovered",
          ]));
          expect(after.callOutcome).toBe("completed");
          expect(gate(after, "resilience").status).toBe("needs-attention");
          break;
        case "enable-structured-observability":
          expect(before.timeline.find((event) => event.type === "observability_recorded")?.state)
            .toBe("attention");
          expect(after.timeline.find((event) => event.type === "observability_recorded")?.state)
            .toBe("passed");
          expect(gate(before, "observability").status).toBe("needs-attention");
          expect(gate(after, "observability").status).toBe("passed");
          break;
      }
    }
  });

  test("retains the original report as stale evidence until the same scenario is rerun", () => {
    const controller = createTelephonyReadinessController();
    controller.configure(configuration("latency-spike"), "human-ui");
    const original = controller.run({}, "human-ui").report;

    const remediation = controller.applyRemediation(
      { remediation: "enable-token-streaming" },
      "webmcp-agent",
    );
    const stale = controller.getReport();
    expect(remediation.rerunRequired).toBe(true);
    expect(stale).toMatchObject({ available: true, stale: true, report: original });
    expect(controller.getSnapshot()).toMatchObject({
      lastReport: original,
      previousReport: null,
      evidenceStale: true,
      latestActivity: {
        source: "webmcp-agent",
        action: "apply-remediation",
      },
    });
    expect(controller.getContext().gateState.every((item) => item.status === "not-run")).toBe(true);

    const rerun = controller.run({}, "webmcp-agent").report;
    expect(rerun.scenario).toBe(original.scenario);
    expect(rerun).not.toEqual(original);
    expect(metric(original, "customer-to-agent-speech-ms").value).toBe(1_200);
    expect(metric(rerun, "customer-to-agent-speech-ms").value).toBe(1_020);
    expect(controller.getReport()).toMatchObject({ available: true, stale: false, report: rerun });
    expect(controller.getSnapshot()).toMatchObject({
      lastReport: rerun,
      previousReport: original,
      evidenceStale: false,
    });
  });

  test("never compares reports from different deterministic scenarios", () => {
    const controller = createTelephonyReadinessController();
    controller.configure(configuration("latency-spike"), "human-ui");
    controller.run({}, "human-ui");

    controller.configure(configuration("caller-interruption"), "human-ui");
    expect(controller.getSnapshot()).toMatchObject({
      lastReport: null,
      previousReport: null,
      evidenceStale: false,
    });

    controller.run({}, "human-ui");
    expect(controller.getSnapshot().previousReport).toBeNull();
  });

  test("keeps post-call diagnostics after repeated-silence termination and no operational events", () => {
    const report = runTelephonyReadinessSimulation(configuration(
      "combined-production-stress-test",
      ALL_SAFEGUARDS,
    ));
    const endIndex = report.timeline.findIndex((event) => event.type === "end_session");
    const transferIndex = report.timeline.findIndex((event) => event.type === "transfer_requested");

    expect(endIndex).toBeGreaterThan(-1);
    expect(transferIndex).toBeGreaterThan(-1);
    expect(transferIndex).toBeLessThan(endIndex);
    expect(report.timeline.slice(endIndex + 1).every((event) => (
      event.type === "intentional_termination" || event.label.startsWith("Post-call")
    ))).toBe(true);
    expect(report.callOutcome).toBe("ended-by-policy");
    expect(metric(report, "task-completed").value).toBe(false);
  });

  test("runs every domain and controller path without external transports", () => {
    const originalFetch = globalThis.fetch;
    const originalWebSocket = Object.getOwnPropertyDescriptor(globalThis, "WebSocket");
    const originalEventSource = Object.getOwnPropertyDescriptor(globalThis, "EventSource");
    const calls = { fetch: 0, webSocket: 0, eventSource: 0 };

    globalThis.fetch = (async () => {
      calls.fetch += 1;
      throw new Error("Telephony readiness simulation must not fetch.");
    }) as typeof fetch;
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      writable: true,
      value: class ForbiddenWebSocket {
        constructor() {
          calls.webSocket += 1;
          throw new Error("Telephony readiness simulation must not open a WebSocket.");
        }
      } as unknown as typeof WebSocket,
    });
    Object.defineProperty(globalThis, "EventSource", {
      configurable: true,
      writable: true,
      value: class ForbiddenEventSource {
        constructor() {
          calls.eventSource += 1;
          throw new Error("Telephony readiness simulation must not open an EventSource.");
        }
      } as unknown as typeof EventSource,
    });

    try {
      for (const scenario of TELEPHONY_SCENARIO_IDS) {
        const report = runTelephonyReadinessSimulation(configuration(scenario, ALL_SAFEGUARDS));
        expect(report.providerRequestCount).toBe(0);
        expect(report.providerCreditCount).toBe(0);
      }

      const controller = createTelephonyReadinessController();
      controller.configure(
        configuration("combined-production-stress-test"),
        "human-ui",
      );
      controller.run({}, "human-ui");
      for (const remediation of TELEPHONY_SAFEGUARD_IDS) {
        controller.applyRemediation({ remediation }, "webmcp-agent");
      }
      const final = controller.run({}, "webmcp-agent").report;
      expect(final.liveActionsAvailable).toBe(false);
      expect(final.liveCallStatus).toBe("No live call placed");
      expect(calls).toEqual({ fetch: 0, webSocket: 0, eventSource: 0 });
    } finally {
      globalThis.fetch = originalFetch;
      if (originalWebSocket) Object.defineProperty(globalThis, "WebSocket", originalWebSocket);
      else delete (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
      if (originalEventSource) Object.defineProperty(globalThis, "EventSource", originalEventSource);
      else delete (globalThis as { EventSource?: typeof EventSource }).EventSource;
    }
  });
});
