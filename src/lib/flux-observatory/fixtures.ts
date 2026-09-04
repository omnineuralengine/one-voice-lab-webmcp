import { cloneConfiguration, DEFAULT_FLUX_CONFIGURATION } from "./config";
import { deriveFluxMetrics } from "./metrics";
import { createConfigurationRequestEvent, createLocalFluxEvent, normalizeFluxProviderMessage } from "./normalizer";
import { createFluxObservatoryState, reduceFluxObservatoryEvent } from "./reducer";
import type { FluxConfiguration, FluxReplayFixture, FluxReplayInput, FluxTurnEventName } from "./types";

const SYNTHETIC_LABEL = "Synthetic fixture — not a live Deepgram result" as const;
const BASE_TIME = Date.parse("2026-07-28T12:00:00.000Z");
const EAGER_CONFIGURATION: FluxConfiguration = {
  ...cloneConfiguration(DEFAULT_FLUX_CONFIGURATION),
  thresholds: { ...DEFAULT_FLUX_CONFIGURATION.thresholds, eagerEotThreshold: 0.4 },
};

const local = (atMs: number, name: Extract<FluxReplayInput, { kind: "local" }>["name"], details?: Record<string, unknown>, generation = 1): FluxReplayInput => ({ kind: "local", atMs, generation, name, details });
const provider = (atMs: number, payload: unknown, generation = 1): FluxReplayInput => ({ kind: "provider", atMs, generation, payload });
const configure = (atMs: number, requestKey: string, update: Extract<FluxReplayInput, { kind: "configuration-request" }>["update"], generation = 1): FluxReplayInput => ({ kind: "configuration-request", atMs, generation, requestKey, update });

function turn(sequenceId: number, event: FluxTurnEventName, turnIndex: number, transcript: string, extra: Record<string, unknown> = {}) {
  const words = transcript ? transcript.replace(/[.,!?]/g, "").split(/\s+/).map((word, index) => ({ word, start: index * 0.12, end: index * 0.12 + 0.1, confidence: 0.93 })) : [];
  return {
    type: "TurnInfo",
    request_id: "synthetic-request",
    sequence_id: sequenceId,
    event,
    turn_index: turnIndex,
    audio_window_start: 0,
    audio_window_end: sequenceId * 0.25,
    transcript,
    words,
    end_of_turn_confidence: event === "EndOfTurn" ? 0.76 : event === "EagerEndOfTurn" ? 0.45 : 0.2,
    ...extra,
  };
}

function withConnection(inputs: FluxReplayInput[]): FluxReplayInput[] {
  return [
    local(0, "session-created"),
    local(5, "credential-acquired", { expiresInSeconds: 30 }),
    local(10, "websocket-connecting"),
    provider(20, { type: "Connected", request_id: "synthetic-request", sequence_id: 0 }),
    local(22, "websocket-open"),
    local(25, "microphone-capture-start"),
    local(30, "audio-streaming-start"),
    ...inputs,
  ];
}

function fixture(
  id: string,
  title: string,
  description: string,
  inputs: FluxReplayInput[],
  initialConfiguration = EAGER_CONFIGURATION,
): FluxReplayFixture {
  return { id, title, description, evidenceLabel: SYNTHETIC_LABEL, initialConfiguration: cloneConfiguration(initialConfiguration), inputs: withConnection(inputs) };
}

export const FLUX_REPLAY_FIXTURES: FluxReplayFixture[] = [
  fixture(
    "clean-completed-sentence",
    "Clean completed sentence",
    "A single synthetic sentence progresses from speech start to a confirmed turn boundary.",
    [provider(100, turn(1, "StartOfTurn", 0, "Please check my appointment.")), provider(340, turn(2, "Update", 0, "Please check my appointment.")), provider(620, turn(3, "EndOfTurn", 0, "Please check my appointment."))],
  ),
  fixture(
    "hesitation-followed-by-continuation",
    "Hesitation followed by continuation",
    "An eager boundary is cancelled when the synthetic speaker continues after hesitating.",
    [provider(100, turn(1, "StartOfTurn", 0, "I need to")), provider(380, turn(2, "EagerEndOfTurn", 0, "I need to")), provider(520, turn(3, "TurnResumed", 0, "I need to change")), provider(760, turn(4, "Update", 0, "I need to change my booking")), provider(1_020, turn(5, "EndOfTurn", 0, "I need to change my booking."))],
  ),
  fixture(
    "long-intentional-pause",
    "Long intentional pause",
    "A deliberate synthetic pause demonstrates why timeout settings must be evaluated per scenario.",
    [provider(100, turn(1, "StartOfTurn", 0, "The account number is")), provider(500, turn(2, "Update", 0, "The account number is")), provider(2_600, turn(3, "EagerEndOfTurn", 0, "The account number is")), provider(2_800, turn(4, "TurnResumed", 0, "The account number is four two")), provider(3_200, turn(5, "EndOfTurn", 0, "The account number is four two."))],
  ),
  fixture(
    "self-correction",
    "Self-correction",
    "Synthetic transcript updates preserve a correction inside one turn without treating it as a new customer fact.",
    [provider(100, turn(1, "StartOfTurn", 0, "Book Tuesday")), provider(300, turn(2, "EagerEndOfTurn", 0, "Book Tuesday")), provider(520, turn(3, "TurnResumed", 0, "Book Wednesday instead")), provider(760, turn(4, "EndOfTurn", 0, "Book Wednesday instead."))],
  ),
  fixture(
    "eager-end-confirmed",
    "Eager end followed by confirmed end",
    "The eager transcript is followed by an identical confirmed transcript.",
    [provider(100, turn(1, "StartOfTurn", 0, "That works for me.")), provider(340, turn(2, "EagerEndOfTurn", 0, "That works for me.")), provider(560, turn(3, "EndOfTurn", 0, "That works for me."))],
  ),
  fixture(
    "eager-end-turn-resumed",
    "Eager end followed by turn resumed",
    "A synthetic resumed event invalidates the earlier speculative boundary before the final end.",
    [provider(100, turn(1, "StartOfTurn", 0, "Cancel the order")), provider(320, turn(2, "EagerEndOfTurn", 0, "Cancel the order")), provider(430, turn(3, "TurnResumed", 0, "Cancel the order only if")), provider(720, turn(4, "EagerEndOfTurn", 0, "Cancel the order only if it has not shipped.")), provider(900, turn(5, "EndOfTurn", 0, "Cancel the order only if it has not shipped."))],
  ),
  fixture(
    "natural-interruption-cue",
    "Natural interruption or barge-in cue",
    "StartOfTurn is captured as a provider turn event; downstream interruption behavior remains outside this fixture.",
    [local(70, "provider-warning", { note: "Synthetic playback boundary active" }), provider(100, turn(1, "StartOfTurn", 0, "Wait, stop.")), provider(280, turn(2, "EndOfTurn", 0, "Wait, stop."))],
  ),
  fixture(
    "forced-timeout-not-identifiable",
    "Forced timeout is not identifiable from TurnInfo",
    "The current wire event contains EndOfTurn but no explicit timeout reason, so the Observatory does not manufacture a forced-timeout count.",
    [provider(100, turn(1, "StartOfTurn", 0, "I am thinking")), provider(5_100, turn(2, "EndOfTurn", 0, "I am thinking."))],
  ),
  fixture(
    "dynamic-configuration-success",
    "Dynamic configuration success",
    "A valid threshold update receives a synthetic ConfigureSuccess acknowledgement.",
    [configure(100, "config-success-1", { thresholds: { eotThreshold: 0.8, eagerEotThreshold: 0.5, eotTimeoutMs: 7_000 } }), provider(180, { type: "ConfigureSuccess", request_id: "synthetic-request", sequence_id: 1, thresholds: { eot_threshold: 0.8, eager_eot_threshold: 0.5, eot_timeout_ms: 7_000 }, keyterms: [] })],
  ),
  fixture(
    "dynamic-configuration-failure",
    "Dynamic configuration failure",
    "A valid client request receives a synthetic provider rejection and the acknowledged configuration remains unchanged.",
    [configure(100, "config-failure-1", { keyterms: ["appointment"] }), provider(180, { type: "ConfigureFailure", request_id: "synthetic-request", sequence_id: 1, code: "CONFIGURATION_REJECTED", description: "Synthetic rejection for reducer validation." })],
  ),
  fixture(
    "token-expiry-reconnect",
    "Token expiry and reconnect",
    "A synthetic token expiry starts a fresh connection generation and ignores a late prior-generation event.",
    [
      local(100, "token-expiry"),
      local(120, "reconnect-attempt", { attempt: 1 }, 2),
      local(140, "credential-acquired", { expiresInSeconds: 30 }, 2),
      local(150, "websocket-connecting", {}, 2),
      provider(200, { type: "Connected", request_id: "synthetic-request-2", sequence_id: 0 }, 2),
      local(220, "websocket-open", {}, 2),
      provider(240, turn(9, "EndOfTurn", 99, "Late obsolete turn."), 1),
    ],
  ),
  fixture(
    "malformed-provider-event",
    "Malformed provider event",
    "Malformed JSON remains inspectable as a sanitized event and does not crash the reducer.",
    [provider(100, "{not-json Authorization: Bearer fixture")],
  ),
  fixture(
    "unknown-future-event",
    "Unknown future event",
    "An unfamiliar provider message is preserved as sanitized evidence without changing turn state.",
    [provider(100, { type: "FutureTurnSignal", sequence_id: 1, authorization: "Bearer synthetic-secret-value", detail: "Future-safe payload" })],
  ),
  fixture(
    "multilingual-turn",
    "Multilingual turn",
    "A synthetic multilingual turn carries detected and hinted language fields.",
    [provider(100, turn(1, "StartOfTurn", 0, "Hola, I need help.", { languages: ["es", "en"], languages_hinted: ["es", "en"] })), provider(420, turn(2, "EndOfTurn", 0, "Hola, I need help.", { languages: ["es", "en"], languages_hinted: ["es", "en"] }))],
    { ...cloneConfiguration(EAGER_CONFIGURATION), model: "flux-general-multi", languageHints: ["es", "en"] },
  ),
  fixture(
    "rapid-consecutive-turns",
    "Rapid consecutive turns",
    "Three short synthetic turns exercise turn-index grouping and aggregate sample thresholds.",
    [
      provider(100, turn(1, "StartOfTurn", 0, "One.")), provider(230, turn(2, "EndOfTurn", 0, "One.")),
      provider(260, turn(3, "StartOfTurn", 1, "Two.")), provider(390, turn(4, "EndOfTurn", 1, "Two.")),
      provider(420, turn(5, "StartOfTurn", 2, "Three.")), provider(550, turn(6, "EndOfTurn", 2, "Three.")),
    ],
  ),
];

export function runFluxReplayFixture(fixtureOrId: FluxReplayFixture | string) {
  const fixtureValue = typeof fixtureOrId === "string" ? FLUX_REPLAY_FIXTURES.find((entry) => entry.id === fixtureOrId) : fixtureOrId;
  if (!fixtureValue) throw new Error("Unknown Flux replay fixture.");
  let state = createFluxObservatoryState({
    sessionId: `fixture-${fixtureValue.id}`,
    mode: "synthetic-replay",
    configuration: fixtureValue.initialConfiguration,
    createdAt: new Date(BASE_TIME).toISOString(),
  });
  for (const input of fixtureValue.inputs) {
    const context = {
      sessionId: state.sessionId,
      connectionGeneration: input.generation ?? 1,
      monotonicMs: input.atMs,
      mode: "synthetic-replay" as const,
      receivedAt: new Date(BASE_TIME + input.atMs).toISOString(),
    };
    const event = input.kind === "provider"
      ? normalizeFluxProviderMessage(input.payload, context)
      : input.kind === "local"
        ? createLocalFluxEvent(input.name, context, input.details)
        : createConfigurationRequestEvent(input.requestKey, state.activeConfiguration, input.update, context);
    state = reduceFluxObservatoryEvent(state, event);
  }
  return { fixture: fixtureValue, state, metrics: deriveFluxMetrics(state) };
}
