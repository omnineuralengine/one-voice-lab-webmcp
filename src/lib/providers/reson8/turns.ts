import { z } from "zod";

import {
  MAX_NORMALIZED_STT_WORDS,
  DEFAULT_STREAMING_STT_LIMITS,
  type StreamingSttEventContext,
} from "@/lib/providers/streaming-stt";
import {
  createInitialTurnAwareSttState,
  normalizedTurnAwareSttEventSchema,
  reduceTurnAwareSttState,
  type NormalizedTurnAwareSttEvent,
  type ProviderTurnAwareSttEventAdapter,
} from "@/lib/providers/turn-aware-stt";
import {
  RESON8_ADAPTER_VERSION,
  RESON8_PROVIDER_ID,
  Reson8ProtocolError,
  normalizeReson8Transcript,
  parseReson8EventContext,
  parseReson8JsonBody,
} from "@/lib/providers/reson8/protocol";

const reson8TurnWordSchema = z.object({
  text: z.string().min(1).max(512),
  start_ms: z.number().finite().nonnegative().optional(),
  duration_ms: z.number().finite().nonnegative().optional(),
}).strict();

export const reson8TurnStartSchema = z.object({
  type: z.literal("turn_start"),
}).strict();

export const reson8TurnEndCandidateSchema = z.object({
  type: z.literal("turn_end_candidate"),
  text: z.string().max(64_000),
  language: z.string().min(1).max(35).optional(),
  start_ms: z.number().finite().nonnegative().optional(),
  duration_ms: z.number().finite().nonnegative().optional(),
  words: z.array(reson8TurnWordSchema).max(MAX_NORMALIZED_STT_WORDS).optional(),
}).strict();

export const reson8TurnEndSchema = z.object({
  type: z.literal("turn_end"),
}).strict();

const reson8TurnMessageSchema = z.discriminatedUnion("type", [
  reson8TurnStartSchema,
  reson8TurnEndCandidateSchema,
  reson8TurnEndSchema,
]);

export type Reson8TurnMessage = z.infer<typeof reson8TurnMessageSchema>;

export function createReson8TurnAwareSttEventAdapter(): ProviderTurnAwareSttEventAdapter {
  let state = createInitialTurnAwareSttState();

  const update = (event: NormalizedTurnAwareSttEvent): NormalizedTurnAwareSttEvent => {
    try {
      state = reduceTurnAwareSttState(state, event);
      return event;
    } catch {
      throw new Reson8ProtocolError(
        "invalid-event-order",
        "The Reson8 turn event arrived in an invalid order.",
      );
    }
  };

  return Object.freeze({
    providerId: RESON8_PROVIDER_ID,
    capabilityId: "stt.turn-aware" as const,
    adapterVersion: RESON8_ADAPTER_VERSION,
    fixtureOnly: true,
    limits: DEFAULT_STREAMING_STT_LIMITS,
    normalizeProviderEvent(rawEvent: unknown, inputContext: StreamingSttEventContext) {
      const context = parseReson8EventContext(inputContext);
      const value = typeof rawEvent === "string" ? parseReson8JsonBody(rawEvent) : rawEvent;
      if (!value || typeof value !== "object" || !("type" in value)) {
        throw new Reson8ProtocolError(
          "malformed-provider-response",
          "The Reson8 turn event did not contain a message type.",
        );
      }
      const rawType = (value as { type?: unknown }).type;
      if (rawType !== "turn_start" && rawType !== "turn_end_candidate" && rawType !== "turn_end") {
        throw new Reson8ProtocolError(
          "unsupported-provider-message",
          "The Reson8 turn event type is not supported by this adapter version.",
        );
      }

      let message: Reson8TurnMessage;
      try {
        message = reson8TurnMessageSchema.parse(value);
      } catch {
        throw new Reson8ProtocolError(
          "malformed-provider-response",
          "The Reson8 turn event did not match its bounded schema.",
        );
      }

      if (message.type === "turn_start") {
        if (state.activeTurn) {
          throw new Reson8ProtocolError(
            "invalid-event-order",
            "The Reson8 turn-start event cannot replace an active turn.",
          );
        }
        return update(Object.freeze(normalizedTurnAwareSttEventSchema.parse({
          ...context,
          type: "turn-start",
        })));
      }

      if (message.type === "turn_end_candidate") {
        if (!state.activeTurn) {
          throw new Reson8ProtocolError(
            "invalid-event-order",
            "The Reson8 turn candidate requires an active turn.",
          );
        }
        return update(Object.freeze(normalizedTurnAwareSttEventSchema.parse({
          ...context,
          type: "turn-end-candidate",
          candidateRevision: state.candidateRevision + 1,
          transcript: normalizeReson8Transcript(message),
        })));
      }

      if (!state.activeTurn || !state.candidate) {
        throw new Reson8ProtocolError(
          "invalid-event-order",
          "The Reson8 turn-end confirmation requires a provisional candidate.",
        );
      }
      return update(Object.freeze(normalizedTurnAwareSttEventSchema.parse({
        ...context,
        type: "turn-end",
        confirmedCandidateRevision: state.candidateRevision,
        transcript: state.candidate,
      })));
    },
    reset() {
      state = createInitialTurnAwareSttState();
    },
  });
}
