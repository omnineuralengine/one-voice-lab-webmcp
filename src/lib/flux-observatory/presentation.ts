import { cloneConfiguration, DEFAULT_FLUX_CONFIGURATION } from "./config";
import type { FluxConfiguration, FluxNormalizedEvent, FluxTurnState } from "./types";

export type FluxEventFilter = "turns" | "transcripts" | "connection" | "configuration" | "failures" | "measurements";

export type FluxPreset = {
  id: "balanced" | "fast" | "deliberate" | "interruption-stress";
  name: string;
  description: string;
  configuration: FluxConfiguration;
};

export const FLUX_PRESETS: readonly FluxPreset[] = [
  preset("balanced", "Balanced conversation", "A moderate starting point for ordinary two-party conversation; representative audio still decides fit.", 0.7, 0.5, 5_000),
  preset("fast", "Fast response", "Starts speculative work earlier and uses a shorter timeout. Expect more cancellation and validate false starts.", 0.6, 0.4, 1_500),
  preset("deliberate", "Deliberate speaker", "Allows longer pauses and asks for stronger turn confidence before committing.", 0.85, 0.65, 12_000),
  preset("interruption-stress", "Interruption stress test", "Exercises eager state, resume cancellation, and rapid turn transitions. This is a test preset, not a deployment default.", 0.65, 0.35, 4_000),
] as const;

export const METRIC_DEFINITIONS = [
  ["Completed turns", "Count of turns for which an EndOfTurn provider event was received."],
  ["Resumed turns", "Count of TurnResumed transitions observed after an eager boundary."],
  ["Start → eager", "Local elapsed time from received StartOfTurn to received EagerEndOfTurn for the same completed turn."],
  ["Eager → end", "Local elapsed time from received EagerEndOfTurn to received EndOfTurn for the same completed turn."],
  ["Start → end", "Local elapsed time from received StartOfTurn to received EndOfTurn for the same completed turn."],
  ["Observed chunk interval", "Elapsed browser time between locally emitted audio chunks. Scheduling and transport effects are included."],
  ["Reconnect duration", "Local elapsed time from an explicit reconnect attempt to the next WebSocket open event."],
  ["Dropped frames", "Frames intentionally not sent because the bounded WebSocket buffer exceeded the local safety limit."],
] as const;

export function eventCategory(event: FluxNormalizedEvent): FluxEventFilter {
  if (event.kind === "turn") return event.event === "Update" ? "transcripts" : "turns";
  if (event.kind === "configuration-request" || event.kind === "configure-success" || event.kind === "configure-failure") return "configuration";
  if (event.kind === "provider-error" || event.kind === "provider-warning" || event.kind === "malformed-provider-message") return "failures";
  if (event.kind === "local-lifecycle" && ["audio-chunk-sent", "audio-frame-dropped", "audio-frame-delayed"].includes(event.name)) return "measurements";
  return "connection";
}

export function eventTitle(event: FluxNormalizedEvent) {
  if (event.kind === "turn") return event.event;
  if (event.kind === "local-lifecycle") return event.name.split("-").map(capitalize).join(" ");
  if (event.kind === "configuration-request") return "Configure requested";
  if (event.kind === "configure-success") return "Configure acknowledged";
  if (event.kind === "configure-failure") return "Configure rejected";
  if (event.kind === "provider-error") return "Provider error";
  if (event.kind === "provider-warning") return "Provider warning";
  if (event.kind === "connected") return "Provider connected";
  if (event.kind === "malformed-provider-message") return "Malformed provider message";
  return event.providerType ? `Unknown provider message · ${event.providerType}` : "Unknown provider message";
}

export function eventSummary(event: FluxNormalizedEvent) {
  if (event.kind === "turn") return event.transcript || `Turn ${event.turnIndex ?? "unknown"}; no transcript field was supplied.`;
  if (event.kind === "configuration-request") return "A configuration change was sent explicitly; the prior active configuration remains until acknowledgement.";
  if (event.kind === "configure-success") return "The provider acknowledged a configuration update.";
  if (event.kind === "configure-failure") return event.description || "The provider rejected the requested configuration; the previous configuration remains active.";
  if (event.kind === "provider-error" || event.kind === "provider-warning") return event.description;
  if (event.kind === "malformed-provider-message") return event.reason;
  if (event.kind === "unknown-provider-message") return "The message is retained as sanitized reference material without changing turn state.";
  if (event.kind === "connected") return "The provider emitted Connected.";
  return localSummary(event.name, event.details);
}

export type SpeculativeState = "idle" | "speculative" | "cancelled" | "promoted" | "interrupted";

export function deriveSpeculativeState(turn: FluxTurnState | null): { state: SpeculativeState; detail: string } {
  if (!turn) return { state: "idle", detail: "Select a turn or run a fixture to inspect the deterministic orchestration state." };
  const eagerIndex = turn.eventSequence.lastIndexOf("EagerEndOfTurn");
  if (eagerIndex < 0) return { state: turn.status === "complete" ? "promoted" : "idle", detail: "No eager boundary was observed for this turn." };
  const afterEager = turn.eventSequence.slice(eagerIndex + 1);
  if (afterEager.includes("TurnResumed")) return { state: "cancelled", detail: "TurnResumed cancels the labeled speculative task; stale work cannot be promoted." };
  if (afterEager.includes("EndOfTurn")) return { state: "promoted", detail: "EndOfTurn confirms the eager transcript path and permits promotion of the deterministic mock result." };
  return { state: "speculative", detail: "EagerEndOfTurn starts a bounded mock task. No LLM, tool, or TTS request is made." };
}

function preset(id: FluxPreset["id"], name: string, description: string, eotThreshold: number, eagerEotThreshold: number, eotTimeoutMs: number): FluxPreset {
  return {
    id,
    name,
    description,
    configuration: {
      ...cloneConfiguration(DEFAULT_FLUX_CONFIGURATION),
      thresholds: { eotThreshold, eagerEotThreshold, eotTimeoutMs },
    },
  };
}

function localSummary(name: string, details: Record<string, unknown>) {
  if (name === "audio-chunk-sent") return `A local PCM frame was sent${typeof details.intervalMs === "number" ? ` after ${Math.round(details.intervalMs)} ms` : ""}.`;
  if (name === "audio-frame-dropped") return "A local audio frame was intentionally dropped to keep buffering bounded.";
  if (name === "cleanup-complete") return "Microphone, audio, socket, timer, listener, and credential references were released.";
  if (name === "credential-acquired") return "A short-lived credential was acquired in memory; its value is never rendered or exported.";
  return `Locally observed ${name.replaceAll("-", " ")}.`;
}

function capitalize(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
