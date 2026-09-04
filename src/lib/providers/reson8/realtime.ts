import { z } from "zod";

import {
  DEFAULT_STREAMING_STT_LIMITS,
  normalizedStreamingSttEventSchema,
  type NormalizedStreamingSttEvent,
  type ProviderStreamingSttEventAdapter,
  type StreamingSttEventContext,
} from "@/lib/providers/streaming-stt";
import {
  MAX_NORMALIZED_STT_WORDS,
} from "@/lib/providers/streaming-stt";
import {
  RESON8_ADAPTER_VERSION,
  RESON8_PROVIDER_ID,
  Reson8ProtocolError,
  normalizeReson8Transcript,
  parseReson8EventContext,
  parseReson8JsonBody,
  reson8WordSchema,
} from "@/lib/providers/reson8/protocol";

export const reson8RealtimeTranscriptSchema = z.object({
  type: z.literal("transcript"),
  text: z.string().max(64_000),
  // Reson8 documents an empty language value on interim transcripts when
  // include_language=true. Normalization omits that empty optional value.
  language: z.string().max(35).optional(),
  is_final: z.boolean().optional(),
  start_ms: z.number().finite().nonnegative().optional(),
  duration_ms: z.number().finite().nonnegative().optional(),
  speaker_id: z.number().int().nonnegative().max(1_024).optional(),
  words: z.array(reson8WordSchema).max(MAX_NORMALIZED_STT_WORDS).optional(),
}).strict();

export const reson8FlushConfirmationSchema = z.object({
  type: z.literal("flush_confirmation"),
  id: z.string().min(1).max(200).nullable(),
}).strict();

export const reson8RealtimeMessageSchema = z.discriminatedUnion("type", [
  reson8RealtimeTranscriptSchema,
  reson8FlushConfirmationSchema,
]);

export type Reson8RealtimeMessage = z.infer<typeof reson8RealtimeMessageSchema>;

export function parseReson8RealtimeMessage(rawEvent: unknown): Reson8RealtimeMessage {
  const value = typeof rawEvent === "string" ? parseReson8JsonBody(rawEvent) : rawEvent;
  if (!value || typeof value !== "object" || !("type" in value)) {
    throw new Reson8ProtocolError(
      "malformed-provider-response",
      "The Reson8 realtime event did not contain a message type.",
    );
  }
  const rawType = (value as { type?: unknown }).type;
  if (rawType !== "transcript" && rawType !== "flush_confirmation") {
    throw new Reson8ProtocolError(
      "unsupported-provider-event",
      "The Reson8 realtime event type is not supported by this adapter version.",
    );
  }
  try {
    return reson8RealtimeMessageSchema.parse(value);
  } catch {
    throw new Reson8ProtocolError(
      "malformed-provider-response",
      "The Reson8 realtime event did not match its bounded schema.",
    );
  }
}

export function normalizeReson8RealtimeEvent(
  rawEvent: unknown,
  inputContext: StreamingSttEventContext,
): NormalizedStreamingSttEvent {
  const context = parseReson8EventContext(inputContext);
  const message = parseReson8RealtimeMessage(rawEvent);

  if (message.type === "flush_confirmation") {
    return Object.freeze(normalizedStreamingSttEventSchema.parse({
      ...context,
      type: "flush-confirmed",
      requestId: message.id,
    }));
  }

  return Object.freeze(normalizedStreamingSttEventSchema.parse({
    ...context,
    type: message.is_final === false ? "partial-transcript" : "final-transcript",
    transcript: normalizeReson8Transcript(message),
  }));
}

export const reson8RealtimeSttEventAdapter: ProviderStreamingSttEventAdapter = Object.freeze({
  providerId: RESON8_PROVIDER_ID,
  capabilityId: "stt.streaming",
  adapterVersion: RESON8_ADAPTER_VERSION,
  fixtureOnly: true,
  limits: DEFAULT_STREAMING_STT_LIMITS,
  normalizeProviderEvent: normalizeReson8RealtimeEvent,
});
