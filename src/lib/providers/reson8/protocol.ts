import { z } from "zod";

import {
  normalizedSttTranscriptSchema,
  normalizedSttWordSchema,
  streamingSttEventContextSchema,
  type NormalizedSttTranscript,
  type NormalizedSttWord,
  type StreamingSttEventContext,
} from "@/lib/providers/streaming-stt";

export const RESON8_PROVIDER_ID = "reson8" as const;
export const RESON8_ADAPTER_VERSION = "reson8-fixture-1.0.0";
export const MAX_RESON8_NORMALIZED_RESPONSE_BYTES = 1024 * 1024;

export const reson8WordSchema = z.object({
  text: z.string().min(1).max(512),
  start_ms: z.number().finite().nonnegative().optional(),
  duration_ms: z.number().finite().nonnegative().optional(),
  confidence: z.number().finite().gt(0).max(1).optional(),
}).strict();

export type Reson8Word = z.infer<typeof reson8WordSchema>;

export type Reson8ProtocolErrorCode =
  | "malformed-provider-response"
  | "response-too-large"
  | "unsupported-provider-message"
  | "unsupported-provider-event"
  | "invalid-event-order"
  | "audio-too-large"
  | "audio-too-long"
  | "unsupported-audio"
  | "invalid-audio"
  | "cancelled"
  | "timed-out"
  | "authentication-denied"
  | "credits-exhausted"
  | "concurrency-limited"
  | "provider-rejected"
  | "transport-failed";

export class Reson8ProtocolError extends Error {
  readonly code: Reson8ProtocolErrorCode;

  constructor(code: Reson8ProtocolErrorCode, message: string) {
    super(message);
    this.name = "Reson8ProtocolError";
    this.code = code;
  }
}

export function parseReson8JsonBody(bodyText: string): unknown {
  const byteLength = new TextEncoder().encode(bodyText).byteLength;
  if (byteLength > MAX_RESON8_NORMALIZED_RESPONSE_BYTES) {
    throw new Reson8ProtocolError(
      "response-too-large",
      "The Reson8 response exceeded ONE's bounded response limit.",
    );
  }
  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    throw new Reson8ProtocolError(
      "malformed-provider-response",
      "The Reson8 response was not valid bounded JSON.",
    );
  }
}

export function parseReson8EventContext(context: StreamingSttEventContext): StreamingSttEventContext {
  return streamingSttEventContextSchema.parse({ ...context, providerId: RESON8_PROVIDER_ID });
}

export function normalizeReson8Words(words: readonly Reson8Word[] | undefined): readonly NormalizedSttWord[] | undefined {
  if (!words) return undefined;
  return Object.freeze(words.map((word) => Object.freeze(normalizedSttWordSchema.parse({
    text: word.text,
    ...(word.start_ms === undefined ? {} : { startMilliseconds: word.start_ms }),
    ...(word.duration_ms === undefined ? {} : { durationMilliseconds: word.duration_ms }),
    ...(word.confidence === undefined ? {} : { confidence: word.confidence }),
  }))));
}

export function normalizeReson8Transcript(input: Readonly<{
  text: string;
  language?: string;
  start_ms?: number;
  duration_ms?: number;
  speaker_id?: number;
  words?: readonly Reson8Word[];
}>): NormalizedSttTranscript {
  const language = input.language?.trim();
  return Object.freeze(normalizedSttTranscriptSchema.parse({
    text: input.text,
    ...(language ? { language } : {}),
    ...(input.start_ms === undefined ? {} : { startMilliseconds: input.start_ms }),
    ...(input.duration_ms === undefined ? {} : { durationMilliseconds: input.duration_ms }),
    ...(input.speaker_id === undefined ? {} : { speakerId: input.speaker_id }),
    ...(input.words ? { words: normalizeReson8Words(input.words) } : {}),
  }));
}

export function asReson8ProtocolError(error: unknown): Reson8ProtocolError {
  if (error instanceof Reson8ProtocolError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new Reson8ProtocolError("cancelled", "The Reson8 operation was cancelled.");
  }
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return new Reson8ProtocolError("timed-out", "The Reson8 operation timed out.");
  }
  return new Reson8ProtocolError("transport-failed", "The Reson8 transport failed safely.");
}
