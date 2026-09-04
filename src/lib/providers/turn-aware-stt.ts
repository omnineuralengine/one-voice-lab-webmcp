import { z } from "zod";

import {
  normalizedSttTranscriptSchema,
  providerStreamingSttLimitsSchema,
  streamingSttEventContextSchema,
  type NormalizedSttTranscript,
  type ProviderStreamingSttLimits,
  type StreamingSttEventContext,
} from "@/lib/providers/streaming-stt";

const turnEventBase = streamingSttEventContextSchema.shape;

export const normalizedTurnAwareSttEventSchema = z.discriminatedUnion("type", [
  z.object({ ...turnEventBase, type: z.literal("session-opened") }).strict(),
  z.object({ ...turnEventBase, type: z.literal("session-ready") }).strict(),
  z.object({ ...turnEventBase, type: z.literal("turn-start") }).strict(),
  z.object({
    ...turnEventBase,
    type: z.literal("turn-end-candidate"),
    candidateRevision: z.number().int().positive(),
    transcript: normalizedSttTranscriptSchema,
  }).strict(),
  z.object({
    ...turnEventBase,
    type: z.literal("turn-end"),
    confirmedCandidateRevision: z.number().int().positive(),
    transcript: normalizedSttTranscriptSchema,
  }).strict(),
  z.object({
    ...turnEventBase,
    type: z.literal("provider-warning"),
    code: z.string().min(1).max(80),
    message: z.string().min(1).max(500),
  }).strict(),
  z.object({
    ...turnEventBase,
    type: z.literal("provider-error"),
    code: z.string().min(1).max(80),
    message: z.string().min(1).max(500),
    retryable: z.boolean(),
  }).strict(),
  z.object({
    ...turnEventBase,
    type: z.literal("session-closed"),
    reason: z.enum([
      "completed",
      "cancelled",
      "timed-out",
      "provider-closed",
      "invalid-frame",
      "backpressure",
      "failed",
      "unexpected-close",
    ]),
    clean: z.boolean(),
    reconnect: z.enum(["not-required", "fresh-session-required"]),
    code: z.string().min(1).max(80).optional(),
    detail: z.string().min(1).max(500).optional(),
  }).strict(),
]);

export type NormalizedTurnAwareSttEvent = z.infer<typeof normalizedTurnAwareSttEventSchema>;

export type TurnAwareSttState = Readonly<{
  activeTurn: boolean;
  candidateRevision: number;
  candidate?: NormalizedSttTranscript;
}>;

export interface ProviderTurnAwareSttEventAdapter {
  readonly providerId: string;
  readonly capabilityId: "stt.turn-aware";
  readonly adapterVersion: string;
  readonly fixtureOnly: boolean;
  readonly limits: ProviderStreamingSttLimits;
  normalizeProviderEvent(
    rawEvent: unknown,
    context: StreamingSttEventContext,
  ): NormalizedTurnAwareSttEvent;
  reset(): void;
}

export function createInitialTurnAwareSttState(): TurnAwareSttState {
  return Object.freeze({ activeTurn: false, candidateRevision: 0 });
}

/**
 * Tracks the provisional candidate separately from the provider-confirmed turn.
 * A confirmation without a current candidate is rejected instead of inferred.
 */
export function reduceTurnAwareSttState(
  current: TurnAwareSttState,
  event: NormalizedTurnAwareSttEvent,
): TurnAwareSttState {
  normalizedTurnAwareSttEventSchema.parse(event);
  switch (event.type) {
    case "turn-start":
      return Object.freeze({ activeTurn: true, candidateRevision: current.candidateRevision });
    case "turn-end-candidate":
      if (!current.activeTurn || event.candidateRevision <= current.candidateRevision) {
        throw new Error("A turn-end candidate must advance an active turn revision.");
      }
      return Object.freeze({
        activeTurn: true,
        candidateRevision: event.candidateRevision,
        candidate: event.transcript,
      });
    case "turn-end":
      if (!current.activeTurn || !current.candidate
          || event.confirmedCandidateRevision !== current.candidateRevision) {
        throw new Error("A confirmed turn must reference the current provisional candidate.");
      }
      return Object.freeze({ activeTurn: false, candidateRevision: current.candidateRevision });
    case "session-closed":
      return createInitialTurnAwareSttState();
    default:
      return current;
  }
}

export function parseTurnAwareSttLimits(value: unknown): ProviderStreamingSttLimits {
  return providerStreamingSttLimitsSchema.parse(value);
}
