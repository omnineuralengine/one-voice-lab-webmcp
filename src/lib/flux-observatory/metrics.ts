import type { FluxMetricSummary, FluxMetrics, FluxNormalizedEvent, FluxObservatoryState } from "./types";

export const MIN_MEDIAN_SAMPLE_SIZE = 3;
export const MIN_P95_SAMPLE_SIZE = 20;

export function deriveFluxMetrics(state: FluxObservatoryState): FluxMetrics {
  const completedTurns = state.turns.filter((turn) => turn.status === "complete");
  const startToEager = completedTurns.flatMap((turn) => duration(turn.startMonotonicMs, turn.eagerMonotonicMs));
  const eagerToEnd = completedTurns.flatMap((turn) => duration(turn.eagerMonotonicMs, turn.endMonotonicMs));
  const startToEnd = completedTurns.flatMap((turn) => duration(turn.startMonotonicMs, turn.endMonotonicMs));
  const reconnectDurations = deriveReconnectDurations(state.events);
  const chunkIntervals = deriveChunkIntervals(state.events);
  return {
    completedTurnCount: completedTurns.length,
    resumedTurnCount: state.turns.reduce((sum, turn) => sum + turn.resumedCount, 0),
    unknownEventCount: state.events.filter((event) => event.kind === "unknown-provider-message").length,
    malformedEventCount: state.events.filter((event) => event.kind === "malformed-provider-message").length,
    configurationFailureCount: state.events.filter((event) => event.kind === "configure-failure").length,
    connectionFailureCount: state.events.filter((event) => event.kind === "provider-error").length,
    droppedAudioFrameCount: countLifecycle(state.events, "audio-frame-dropped"),
    delayedAudioFrameCount: countLifecycle(state.events, "audio-frame-delayed"),
    startToEager: summarizeFluxTiming(startToEager),
    eagerToEnd: summarizeFluxTiming(eagerToEnd),
    startToEnd: summarizeFluxTiming(startToEnd),
    reconnectDuration: summarizeFluxTiming(reconnectDurations),
    observedChunkInterval: summarizeFluxTiming(chunkIntervals),
    timingCaveat: "Locally measured timing includes browser scheduling, capture, buffering, network, and transport effects. It is not a universal Deepgram benchmark.",
    forcedTimeoutCount: null,
    forcedTimeoutNote: "The current TurnInfo wire contract does not expose an explicit forced-timeout reason, so this metric is not inferred.",
  };
}

export function summarizeFluxTiming(values: number[]): FluxMetricSummary {
  const sorted = values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  const sampleSize = sorted.length;
  return {
    unit: "milliseconds",
    sampleSize,
    minimum: sampleSize ? round(sorted[0]) : undefined,
    maximum: sampleSize ? round(sorted[sampleSize - 1]) : undefined,
    median: sampleSize >= MIN_MEDIAN_SAMPLE_SIZE ? round(median(sorted)) : undefined,
    p95: sampleSize >= MIN_P95_SAMPLE_SIZE ? round(nearestRank(sorted, 0.95)) : undefined,
    medianStatus: sampleSize >= MIN_MEDIAN_SAMPLE_SIZE ? "available" : "insufficient-observations",
    p95Status: sampleSize >= MIN_P95_SAMPLE_SIZE ? "available" : "insufficient-observations",
  };
}

function duration(start: number | undefined, end: number | undefined): number[] {
  return start !== undefined && end !== undefined && end >= start ? [end - start] : [];
}

function deriveReconnectDurations(events: FluxNormalizedEvent[]) {
  const starts = new Map<number, number>();
  const durations: number[] = [];
  for (const event of events) {
    if (event.kind !== "local-lifecycle") continue;
    if (event.name === "reconnect-attempt") starts.set(event.connectionGeneration, event.monotonicMs);
    if (event.name === "websocket-open") {
      const start = starts.get(event.connectionGeneration);
      if (start !== undefined && event.monotonicMs >= start) {
        durations.push(event.monotonicMs - start);
        starts.delete(event.connectionGeneration);
      }
    }
  }
  return durations;
}

function deriveChunkIntervals(events: FluxNormalizedEvent[]) {
  const lastByGeneration = new Map<number, number>();
  const values: number[] = [];
  for (const event of events) {
    if (event.kind !== "local-lifecycle" || event.name !== "audio-chunk-sent") continue;
    const last = lastByGeneration.get(event.connectionGeneration);
    if (last !== undefined && event.monotonicMs >= last) values.push(event.monotonicMs - last);
    lastByGeneration.set(event.connectionGeneration, event.monotonicMs);
  }
  return values;
}

function countLifecycle(events: FluxNormalizedEvent[], name: "audio-frame-dropped" | "audio-frame-delayed") {
  return events.filter((event) => event.kind === "local-lifecycle" && event.name === name).length;
}

function median(sorted: number[]) {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function nearestRank(sorted: number[], percentile: number) {
  return sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)];
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
