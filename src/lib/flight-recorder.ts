import { redactSecrets } from "@/lib/inspection";

export type FlightRecorderProvenance =
  | "measured"
  | "provider event"
  | "inferred"
  | "simulated"
  | "human-rated";

export type FlightRecorderEvent = {
  localRunId: string;
  module: string;
  transport: string;
  model: string;
  eventType: string;
  timestamp: string;
  durationMs?: number;
  source: string;
  provenance: FlightRecorderProvenance;
  requestId?: string;
  redactionState: "sanitized" | "metadata-only";
  sanitizedPayload?: unknown;
};

export function createFlightRecorderEvent(
  input: Omit<FlightRecorderEvent, "timestamp" | "redactionState" | "sanitizedPayload"> & {
    timestamp?: string;
    payload?: unknown;
    metadataOnly?: boolean;
  },
): FlightRecorderEvent {
  return {
    localRunId: input.localRunId,
    module: input.module,
    transport: input.transport,
    model: input.model,
    eventType: input.eventType,
    timestamp: input.timestamp ?? new Date().toISOString(),
    durationMs: normalizeDuration(input.durationMs),
    source: input.source,
    provenance: input.provenance,
    requestId: normalizeRequestId(input.requestId),
    redactionState: input.metadataOnly ? "metadata-only" : "sanitized",
    sanitizedPayload: input.metadataOnly ? undefined : redactSecrets(input.payload),
  };
}

export function sanitizeFlightRecorderExport(events: readonly FlightRecorderEvent[]) {
  return events.map((event) => redactSecrets(event));
}

function normalizeDuration(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value * 10) / 10
    : undefined;
}

function normalizeRequestId(value: string | undefined) {
  const requestId = value?.trim();
  return requestId && /^[A-Za-z0-9._-]{4,200}$/.test(requestId) ? requestId : undefined;
}
