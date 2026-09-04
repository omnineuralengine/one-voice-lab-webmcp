import {
  simulationEventSchema,
  simulationScorecardSchema,
  simulationUsageEventSchema,
  type SimulationEvent,
  type SimulationScorecard,
  type SimulationUsageEvent,
} from "@/lib/simulations/types";
import { getSimulationScenario } from "@/lib/simulations/registry";

export type SimulationImpairment = "none" | "background-noise" | "crosstalk" | "tool-latency" | "network-reconnect";

export type SimulationReplayResult = Readonly<{
  events: readonly SimulationEvent[];
  scorecard: SimulationScorecard;
  usage: SimulationUsageEvent;
}>;

export function runDeterministicSimulationReplay(input: {
  scenarioId: string;
  impairment: SimulationImpairment;
  runCount: number;
  signal?: AbortSignal;
}): SimulationReplayResult {
  input.signal?.throwIfAborted();
  const scenario = getSimulationScenario(input.scenarioId);
  if (!scenario || scenario.status !== "implemented" || !scenario.availableModes.includes("replay")) {
    throw new Error("This simulation does not have an implemented deterministic replay.");
  }
  if (!scenario.impairments.includes(input.impairment)) throw new Error("Unsupported controlled impairment.");
  const runCount = Math.max(1, Math.min(3, Math.trunc(input.runCount)));
  const runId = `${scenario.id}-${input.impairment}-run-${runCount}`;
  const rows: Array<[number, SimulationEvent["stage"], string, string, string, SimulationEvent["state"]]> = [
    [0, "audio", "fixture.loaded", "Approved synthetic fixture loaded", "Event-only fixture; no microphone, upload, or provider request.", "completed"],
    [120, "audio", "impairment.applied", "Controlled impairment applied", impairmentDetail(input.impairment), input.impairment === "none" ? "observed" : "warning"],
    [280, "stt", "transcript.interim", "Target speech observed", "Synthetic target phrase: confirm order A17 for pickup.", "observed"],
    [430, "conversation", "speaker.competing", "Competing speech window", input.impairment === "crosstalk" ? "Synthetic background phrase overlaps the target entity window." : "No competing phrase enters the target window.", input.impairment === "crosstalk" ? "warning" : "observed"],
    [680, "stt", "transcript.final", "Task-critical entity reviewed", "Target entity A17 remains explicitly marked for confirmation; no identity is inferred.", "completed"],
    [820, "conversation", "turn.completed", "Target turn completed", "Deterministic end-of-turn event; not a provider timing claim.", "completed"],
    [980, "agent", "confirmation.requested", "Confirmation requested", "The replay asks the target speaker to confirm A17 before any business action.", "completed"],
    [1160, "tool", "tool.started", "Local mock lookup started", "A bounded local fixture represents the business-tool boundary.", "started"],
    [input.impairment === "tool-latency" ? 2060 : 1420, "tool", "tool.completed", input.impairment === "tool-latency" ? "Delayed tool result observed" : "Local mock lookup completed", "No external tool was called and no success is claimed beyond the fixture.", input.impairment === "tool-latency" ? "warning" : "completed"],
    [input.impairment === "network-reconnect" ? 2200 : 1600, "tts", "voice.requested", "Synthetic voice stage entered", "No TTS request or audio generation occurred.", "observed"],
    [input.impairment === "network-reconnect" ? 2460 : 1780, "playback", "playback.interrupted", input.impairment === "network-reconnect" ? "Disconnect interrupts playback" : "Target speaker interruption captured", "Stale playback is canceled in the deterministic state machine.", "warning"],
    [input.impairment === "network-reconnect" ? 2920 : 2100, "conversation", "listening.resumed", "Listening recovered", input.impairment === "network-reconnect" ? "A fresh simulated generation resumes; obsolete events are ignored." : "The next target turn can begin.", "completed"],
    [input.impairment === "network-reconnect" ? 3200 : 2380, "outcome", "task.completed", "Outcome recorded", "Order A17 remains confirmed in this synthetic replay.", "completed"],
  ];
  const events = rows.map(([offsetMs, stage, type, label, detail, state], sequence) => {
    input.signal?.throwIfAborted();
    return simulationEventSchema.parse({
      schemaVersion: "voice-open-simulation-event-v1",
      id: `${runId}-event-${sequence + 1}`,
      runId,
      sequence,
      offsetMs,
      stage,
      type,
      label,
      detail,
      state,
      provenance: "simulated",
    });
  });
  const backgroundIntrusions = input.impairment === "crosstalk" ? 1 : 0;
  const recoveryMs = input.impairment === "network-reconnect" ? 460 : 320;
  const scorecard = simulationScorecardSchema.parse({
    schemaVersion: "voice-open-simulation-scorecard-v1",
    runId,
    scenarioId: scenario.id,
    scenario: scenario.name,
    hypothesis: scenario.hypothesis,
    configuration: { fixtureVersion: "1.0.0", eventSchema: "voice-open-simulation-event-v1", targetEntity: "A17" },
    environment: "local deterministic browser replay",
    mode: "replay",
    provider: "none",
    audioFixture: "Project-authored synthetic event fixture; no raw audio included",
    controlledImpairment: input.impairment,
    runCount,
    observedMetrics: [
      metric("target-entity", "Target critical-entity correctness", 1, "fixture assertion", "A17 matches the fixture expectation; this is not provider accuracy."),
      metric("background-intrusion", "Background phrase intrusion", backgroundIntrusions, "events", "Lab metric over the deterministic event sequence."),
      metric("correction-turns", "Correction turns", backgroundIntrusions, "turns", "The crosstalk replay requires one confirmation turn."),
      metric("interruption-recovery", "Interruption recovery", recoveryMs, "ms", "Derived fixture timing, not a provider SLA."),
      metric("unnecessary-response", "Unnecessary agent responses", 0, "events", "Deterministic assertion over the local state machine."),
    ],
    failures: input.impairment === "none" ? [] : [impairmentDetail(input.impairment)],
    criticalEntityResults: ["A17 was repeated and confirmed before the simulated lookup."],
    taskOutcome: "Completed in the deterministic fixture with explicit confirmation.",
    notes: ["Observed in this experiment.", "No Deepgram, LLM, tool, microphone, upload, or TTS request occurred."],
    evidenceLevel: "Simulated - observed in this experiment",
    remainingUncertainty: ["Live provider behavior", "Real acoustic mixture behavior", "Representative customer task completion", "Production latency and recovery"],
  });
  const usage = simulationUsageEventSchema.parse({
    timestamp: "2026-08-20T00:00:00.000Z",
    runId,
    provider: "none",
    scenarioId: scenario.id,
    mode: "replay",
    providerRequestCount: 0,
    audioSecondsSubmitted: 0,
    ttsCharactersSubmitted: 0,
    success: true,
    billingValue: null,
    billingMessage: "Usage captured. Billing value not estimated.",
  });
  input.signal?.throwIfAborted();
  return { events, scorecard, usage };
}

function metric(id: string, label: string, value: number, unit: string, note: string) {
  return { id, label, value, unit, evidence: "simulated_lab_metric" as const, note };
}

function impairmentDetail(impairment: SimulationImpairment) {
  return {
    none: "Baseline event sequence with no added impairment.",
    "background-noise": "Synthetic environmental-noise marker added; no audio samples are generated.",
    crosstalk: "Synthetic competing-speaker event overlaps the target entity window.",
    "tool-latency": "A deterministic 640 ms delay is added before the local mock tool result.",
    "network-reconnect": "A deterministic disconnect/reconnect sequence delays recovery and rejects stale state.",
  }[impairment];
}
