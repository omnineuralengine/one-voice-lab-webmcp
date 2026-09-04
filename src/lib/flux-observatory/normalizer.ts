import { buildFluxConfigureMessage, cloneConfiguration } from "./config";
import { isRecord, sanitizeFluxRecord, sanitizeFluxText, sanitizeFluxValue, stableFluxHash } from "./security";
import {
  FLUX_TURN_EVENT_NAMES,
  type FluxConfiguration,
  type FluxConfigurationRequestEvent,
  type FluxConfigurationUpdate,
  type FluxConfigureFailureEvent,
  type FluxConfigureSuccessEvent,
  type FluxConnectedEvent,
  type FluxEventBase,
  type FluxLocalLifecycleEvent,
  type FluxLocalLifecycleName,
  type FluxMalformedProviderEvent,
  type FluxNormalizeContext,
  type FluxNormalizedEvent,
  type FluxProviderErrorEvent,
  type FluxProviderWarningEvent,
  type FluxTurnEvent,
  type FluxTurnEventName,
  type FluxUnknownProviderEvent,
  type FluxWord,
} from "./types";

export function normalizeFluxProviderMessage(input: unknown, context: FluxNormalizeContext): FluxNormalizedEvent {
  let parsed: unknown = input;
  if (typeof input === "string") {
    try {
      parsed = JSON.parse(input);
    } catch {
      return makeMalformed(context, "Provider message was not valid JSON.", { preview: sanitizeFluxText(input, 300) });
    }
  }
  if (!isRecord(parsed)) return makeMalformed(context, "Provider message was not a JSON object.", { receivedType: typeof parsed });

  const payload = sanitizeFluxRecord(parsed);
  const type = typeof parsed.type === "string" ? parsed.type : undefined;
  const requestId = optionalString(parsed.request_id, 120);
  const sequenceId = optionalFiniteNumber(parsed.sequence_id);
  const providerTimestampMs = optionalFiniteNumber(parsed.provider_timestamp_ms ?? parsed.timestamp_ms);
  const baseInput = { requestId, sequenceId, providerTimestampMs, payload };

  if (type === "Connected") {
    return withIdentity<FluxConnectedEvent>(context, "connected", baseInput, { kind: "connected", source: "provider" });
  }

  if (type === "TurnInfo") {
    const eventName = typeof parsed.event === "string" && FLUX_TURN_EVENT_NAMES.includes(parsed.event as FluxTurnEventName)
      ? (parsed.event as FluxTurnEventName)
      : null;
    if (!eventName) return makeUnknown(context, type, baseInput);
    return withIdentity<FluxTurnEvent>(context, `turn:${eventName}`, baseInput, {
      kind: "turn",
      source: "provider",
      event: eventName,
      turnIndex: optionalInteger(parsed.turn_index),
      audioWindowStart: optionalFiniteNumber(parsed.audio_window_start),
      audioWindowEnd: optionalFiniteNumber(parsed.audio_window_end),
      transcript: optionalString(parsed.transcript, 8_000) ?? "",
      words: normalizeWords(parsed.words),
      endOfTurnConfidence: optionalFiniteNumber(parsed.end_of_turn_confidence),
      languages: normalizeStrings(parsed.languages, 20, 40),
      languagesHinted: normalizeStrings(parsed.languages_hinted, 20, 40),
    });
  }

  if (type === "ConfigureSuccess") {
    return withIdentity<FluxConfigureSuccessEvent>(context, "configure-success", baseInput, {
      kind: "configure-success",
      source: "provider",
      acknowledged: normalizeConfigurationUpdate(parsed),
    });
  }

  if (type === "ConfigureFailure") {
    return withIdentity<FluxConfigureFailureEvent>(context, "configure-failure", baseInput, {
      kind: "configure-failure",
      source: "provider",
      code: optionalString(parsed.code, 120),
      description: optionalString(parsed.description, 500),
    });
  }

  if (type === "Error" || type === "FatalError") {
    return withIdentity<FluxProviderErrorEvent>(context, "provider-error", baseInput, {
      kind: "provider-error",
      source: "provider",
      code: optionalString(parsed.code, 120),
      description: optionalString(parsed.description ?? parsed.message, 500) ?? "Provider reported a fatal error.",
      fatal: true,
    });
  }

  if (type === "Warning") {
    return withIdentity<FluxProviderWarningEvent>(context, "provider-warning", baseInput, {
      kind: "provider-warning",
      source: "provider",
      code: optionalString(parsed.code, 120),
      description: optionalString(parsed.description ?? parsed.message, 500) ?? "Provider warning received.",
    });
  }

  return makeUnknown(context, type, baseInput);
}

export function createLocalFluxEvent(
  name: FluxLocalLifecycleName,
  context: FluxNormalizeContext,
  details: Record<string, unknown> = {},
): FluxLocalLifecycleEvent {
  const sanitizedDetails = sanitizeFluxRecord(details);
  return withIdentity<FluxLocalLifecycleEvent>(context, `local:${name}:${context.monotonicMs}`, { payload: sanitizedDetails }, {
    kind: "local-lifecycle",
    source: "local",
    name,
    details: sanitizedDetails,
  });
}

export function createConfigurationRequestEvent(
  requestKey: string,
  previousConfiguration: FluxConfiguration,
  update: FluxConfigurationUpdate,
  context: FluxNormalizeContext,
): FluxConfigurationRequestEvent {
  const message = buildFluxConfigureMessage(update, previousConfiguration);
  const sanitizedUpdate = sanitizeFluxValue(update) as FluxConfigurationUpdate;
  return withIdentity<FluxConfigurationRequestEvent>(context, `configuration-request:${sanitizeFluxText(requestKey, 80)}`, { payload: message as unknown as Record<string, unknown> }, {
    kind: "configuration-request",
    source: "local",
    requestKey: sanitizeFluxText(requestKey, 80),
    previousConfiguration: cloneConfiguration(previousConfiguration),
    requestedConfiguration: sanitizedUpdate,
    message,
  });
}

function normalizeConfigurationUpdate(value: Record<string, unknown>): FluxConfigurationUpdate {
  const update: FluxConfigurationUpdate = {};
  if (isRecord(value.thresholds)) {
    const thresholds: NonNullable<FluxConfigurationUpdate["thresholds"]> = {};
    const eot = optionalFiniteNumber(value.thresholds.eot_threshold);
    const eager = optionalFiniteNumber(value.thresholds.eager_eot_threshold);
    const timeout = optionalInteger(value.thresholds.eot_timeout_ms);
    if (eot !== undefined) thresholds.eotThreshold = eot;
    if (eager !== undefined) thresholds.eagerEotThreshold = eager;
    if (timeout !== undefined) thresholds.eotTimeoutMs = timeout;
    if (Object.keys(thresholds).length) update.thresholds = thresholds;
  }
  if (Array.isArray(value.keyterms)) update.keyterms = normalizeStrings(value.keyterms, 100, 120);
  if (Array.isArray(value.language_hints)) update.languageHints = normalizeStrings(value.language_hints, 10, 40);
  if (value.language_hints === null) update.languageHints = null;
  return update;
}

function normalizeWords(value: unknown): FluxWord[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 1_000).flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.word !== "string") return [];
    return [{
      word: sanitizeFluxText(entry.word, 200),
      start: optionalFiniteNumber(entry.start),
      end: optionalFiniteNumber(entry.end),
      confidence: optionalFiniteNumber(entry.confidence),
    }];
  });
}

function normalizeStrings(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).flatMap((entry) => typeof entry === "string" ? [sanitizeFluxText(entry, maxLength)] : []).filter(Boolean);
}

function makeMalformed(context: FluxNormalizeContext, reason: string, payload: Record<string, unknown>): FluxMalformedProviderEvent {
  return withIdentity<FluxMalformedProviderEvent>(context, `malformed:${stableFluxHash(payload)}`, { payload }, {
    kind: "malformed-provider-message",
    source: "provider",
    reason,
  });
}

function makeUnknown(
  context: FluxNormalizeContext,
  providerType: string | undefined,
  input: { requestId?: string; sequenceId?: number; providerTimestampMs?: number; payload: Record<string, unknown> },
): FluxUnknownProviderEvent {
  return withIdentity<FluxUnknownProviderEvent>(context, `unknown:${providerType ?? "missing"}`, input, {
    kind: "unknown-provider-message",
    source: "provider",
    providerType: providerType ? sanitizeFluxText(providerType, 120) : undefined,
  });
}

function withIdentity<T extends FluxNormalizedEvent>(
  context: FluxNormalizeContext,
  discriminator: string,
  input: { requestId?: string; sequenceId?: number; providerTimestampMs?: number; payload?: Record<string, unknown> },
  event: Omit<T, Exclude<keyof FluxEventBase, "source">>,
): T {
  const dedupeKey = input.sequenceId === undefined
    ? `${context.connectionGeneration}:${input.requestId ?? "no-request"}:${stableFluxHash(input.payload ?? event)}:${discriminator}`
    : `${context.connectionGeneration}:${input.requestId ?? "no-request"}:${input.sequenceId}`;
  const base: FluxEventBase = {
    id: `flux-event-${stableFluxHash(`${context.sessionId}:${dedupeKey}`)}`,
    dedupeKey,
    sessionId: sanitizeFluxText(context.sessionId, 120),
    connectionGeneration: Math.max(0, Math.trunc(context.connectionGeneration)),
    monotonicMs: Math.max(0, context.monotonicMs),
    receivedAt: context.receivedAt ?? new Date().toISOString(),
    source: event.source,
    mode: context.mode,
    evidenceLabel: context.mode === "synthetic-replay"
      ? "Synthetic fixture — not a live Deepgram result"
      : event.source === "provider"
        ? "Live provider observation — review required"
        : "Locally observed lifecycle",
    requestId: input.requestId,
    sequenceId: input.sequenceId,
    providerTimestampMs: input.providerTimestampMs,
    sanitizedPayload: input.payload,
  };
  return { ...base, ...event } as T;
}

function optionalString(value: unknown, maxLength: number): string | undefined {
  return typeof value === "string" ? sanitizeFluxText(value, maxLength) : undefined;
}

function optionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}
