import { EVALUATION_SCENARIOS } from "@/lib/applied-voice/labs";
import { simulationScenarioSchema, type SimulationScenario } from "@/lib/simulations/types";

const evaluationIds = new Set(EVALUATION_SCENARIOS.map((scenario) => scenario.id));

const scenarios: SimulationScenario[] = [
  {
    id: "noisy-drive-through",
    name: "Noisy drive-through ordering",
    shortName: "Drive-through",
    description: "Inspect how noise and task-critical order fields should be reviewed without turning one fixture into an accuracy claim.",
    hypothesis: "Noise will increase uncertainty around critical entities and should trigger confirmation rather than invention.",
    status: "replay",
    availableModes: ["replay"],
    relatedEvalId: "background-noise",
    impairments: ["background noise", "gain variation"],
    evidence: "Repository verified",
    limitations: ["Scenario definition and deterministic evaluation exist; no drive-through provider run or real customer audio is included."],
  },
  {
    id: "accented-support-audio",
    name: "Accented customer-support audio",
    shortName: "Accented support",
    description: "Define a consented-fixture evaluation for regional and accented speech without fabricating accent data.",
    hypothesis: "Representative consented audio is required before any quality conclusion is defensible.",
    status: "planned",
    availableModes: [],
    impairments: ["accent variation"],
    evidence: "Assumption",
    limitations: ["No licensed or consented accent fixture is currently registered, so execution is intentionally unavailable."],
  },
  {
    id: "contact-center-interruption",
    name: "Contact-center interruption / barge-in",
    shortName: "Interruption",
    description: "Replay cancellation and listening recovery when a caller interrupts a response.",
    hypothesis: "A safe pipeline should cancel stale work and resume listening without claiming a completed response.",
    status: "replay",
    availableModes: ["replay"],
    relatedEvalId: "interrupt-mid-response",
    impairments: ["interruption", "stale playback"],
    evidence: "Repository verified",
    limitations: ["The replay does not prove provider turn detection, playback cancellation, or customer-agent behavior."],
  },
  {
    id: "domain-term-transcription",
    name: "Product-name and domain-term transcription",
    shortName: "Domain terms",
    description: "Evaluate confirmation behavior for product names and task-critical identifiers.",
    hypothesis: "Critical identifiers should be repeated and confirmed before business actions.",
    status: "replay",
    availableModes: ["replay"],
    relatedEvalId: "spelled-order-number",
    impairments: ["domain terminology", "alphanumeric identifier"],
    evidence: "Repository verified",
    limitations: ["No provider accuracy, vocabulary, or keyterm result is measured by the deterministic replay."],
  },
  {
    id: "poor-microphone-quality",
    name: "Poor microphone quality",
    shortName: "Poor microphone",
    description: "Connect local Audio Signal Lab evidence to clipping, low gain, and narrow-band teaching conditions.",
    hypothesis: "Signal evidence should be inspected before model tuning or provider comparison.",
    status: "experimental",
    availableModes: ["synthetic"],
    impairments: ["gain reduction", "clipping", "narrow-band audio"],
    evidence: "Experimental idea",
    limitations: ["Browser transformations are teaching approximations, not calibrated hardware or telephony benchmarks."],
  },
  {
    id: "agent-tool-latency",
    name: "Agent tool latency",
    shortName: "Tool latency",
    description: "Replay a delayed or failed tool stage and inspect transparent fallback behavior.",
    hypothesis: "The system should expose the delay, avoid false success, and preserve a bounded fallback.",
    status: "replay",
    availableModes: ["replay"],
    relatedEvalId: "tool-timeout",
    impairments: ["tool delay", "tool timeout", "tool failure"],
    evidence: "Repository verified",
    limitations: ["No external tool or LLM runs; durations are deterministic fixture values."],
  },
  {
    id: "multilingual-conversation",
    name: "Multilingual conversation",
    shortName: "Multilingual",
    description: "Plan equivalent-input language testing using only registry-verified configurations and reviewed fixtures.",
    hypothesis: "Language configuration and representative ground truth must be explicit before comparison.",
    status: "experimental",
    availableModes: ["synthetic"],
    relatedEvalId: "italian-speaker",
    impairments: ["language switching"],
    evidence: "Experimental idea",
    limitations: ["The Lab has configuration guidance, not a universal multilingual quality result."],
  },
  {
    id: "long-form-media",
    name: "Long-form media transcription",
    shortName: "Long-form",
    description: "Define segmentation, duration, retry, and review evidence for long recordings.",
    hypothesis: "Long-form behavior requires representative duration and environment-specific validation.",
    status: "planned",
    availableModes: [],
    impairments: ["long duration"],
    evidence: "Assumption",
    limitations: ["No canonical long-form fixture or deterministic execution is registered yet."],
  },
  {
    id: "browser-reconnect",
    name: "Browser disconnect / reconnect",
    shortName: "Reconnect",
    description: "Replay a bounded disconnect, fresh temporary credential, and obsolete-generation rejection.",
    hypothesis: "Reconnect should not let stale events mutate the active session.",
    status: "replay",
    availableModes: ["replay"],
    impairments: ["network disconnect", "reconnect"],
    evidence: "Repository verified",
    limitations: ["The fixture proves reducer behavior only; it does not reproduce a real mobile network or provider socket."],
  },
  {
    id: "mobile-microphone",
    name: "Mobile microphone behavior",
    shortName: "Mobile microphone",
    description: "Define permission, lifecycle, safe-area, device-change, and cleanup checks for mobile capture.",
    hypothesis: "Mobile capture needs explicit device/browser evidence rather than desktop assumptions.",
    status: "experimental",
    availableModes: ["synthetic"],
    impairments: ["device change", "backgrounding"],
    evidence: "Experimental idea",
    limitations: ["Responsive tests do not prove physical microphone, operating-system, or background lifecycle behavior."],
  },
  {
    id: "target-speaker-vs-world",
    name: "Target Speaker vs. The World",
    shortName: "Speaker focus",
    description: "A flagship deterministic replay for target speech, crosstalk, environmental noise, interruption, silence, and recovery.",
    hypothesis: "The complete tested configuration should preserve task-critical target information while exposing background intrusion and recovery behavior.",
    status: "implemented",
    availableModes: ["replay"],
    relatedEvalId: "two-speakers-one-channel",
    impairments: ["none", "background-noise", "crosstalk", "tool-latency", "network-reconnect"],
    evidence: "Repository verified",
    limitations: ["The fixture is synthetic event data, not mixed recorded audio and not a Deepgram benchmark.", "Speaker labels never imply a known human identity."],
  },
];

export const SIMULATION_SCENARIOS: readonly SimulationScenario[] = Object.freeze(
  scenarios.map((scenario) => {
    const parsed = simulationScenarioSchema.parse(scenario);
    if (parsed.relatedEvalId && !evaluationIds.has(parsed.relatedEvalId)) {
      throw new Error(`Simulation ${parsed.id} references an unknown canonical evaluation.`);
    }
    return parsed;
  }),
);

export const DEFAULT_SIMULATION_SCENARIO_ID = "target-speaker-vs-world";

export function getSimulationScenario(id: string) {
  return SIMULATION_SCENARIOS.find((scenario) => scenario.id === id) ?? null;
}
