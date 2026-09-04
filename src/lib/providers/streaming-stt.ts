import { z } from "zod";

import { providerCatalogIdSchema } from "@/lib/providers/platform-types";

export const MAX_NORMALIZED_STT_TEXT_LENGTH = 64_000;
export const MAX_NORMALIZED_STT_WORDS = 20_000;
export const DEFAULT_STREAMING_STT_LIMITS = Object.freeze({
  maxChunkBytes: 64 * 1024,
  maxPendingBytes: 512 * 1024,
  maxSessionMilliseconds: 5 * 60 * 1_000,
});

export const normalizedSttWordSchema = z.object({
  text: z.string().min(1).max(512),
  startMilliseconds: z.number().finite().nonnegative().optional(),
  durationMilliseconds: z.number().finite().nonnegative().optional(),
  confidence: z.number().finite().min(0).max(1).optional(),
}).strict();

export const normalizedSttTranscriptSchema = z.object({
  text: z.string().max(MAX_NORMALIZED_STT_TEXT_LENGTH),
  language: z.string().min(1).max(35).optional(),
  startMilliseconds: z.number().finite().nonnegative().optional(),
  durationMilliseconds: z.number().finite().nonnegative().optional(),
  speakerId: z.number().int().nonnegative().max(1_024).optional(),
  words: z.array(normalizedSttWordSchema).max(MAX_NORMALIZED_STT_WORDS).optional(),
}).strict();

export const streamingSttEventContextSchema = z.object({
  providerId: providerCatalogIdSchema,
  sequence: z.number().int().nonnegative(),
  observedAt: z.string().datetime({ offset: true }),
  monotonicOffsetMilliseconds: z.number().finite().nonnegative(),
  provenance: z.enum(["provider", "synthetic-fixture"]),
}).strict();

const streamingEventBase = streamingSttEventContextSchema.shape;

export const normalizedStreamingSttEventSchema = z.discriminatedUnion("type", [
  z.object({ ...streamingEventBase, type: z.literal("session-opened") }).strict(),
  z.object({ ...streamingEventBase, type: z.literal("session-ready") }).strict(),
  z.object({
    ...streamingEventBase,
    type: z.literal("partial-transcript"),
    transcript: normalizedSttTranscriptSchema,
  }).strict(),
  z.object({
    ...streamingEventBase,
    type: z.literal("final-transcript"),
    transcript: normalizedSttTranscriptSchema,
  }).strict(),
  z.object({
    ...streamingEventBase,
    type: z.literal("flush-confirmed"),
    requestId: z.string().min(1).max(200).nullable(),
  }).strict(),
  z.object({
    ...streamingEventBase,
    type: z.literal("provider-warning"),
    code: z.string().min(1).max(80),
    message: z.string().min(1).max(500),
  }).strict(),
  z.object({
    ...streamingEventBase,
    type: z.literal("provider-error"),
    code: z.string().min(1).max(80),
    message: z.string().min(1).max(500),
    retryable: z.boolean(),
  }).strict(),
  z.object({
    ...streamingEventBase,
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

export const providerStreamingSttLimitsSchema = z.object({
  maxChunkBytes: z.number().int().positive().max(1024 * 1024),
  maxPendingBytes: z.number().int().positive().max(8 * 1024 * 1024),
  maxSessionMilliseconds: z.number().int().positive().max(60 * 60 * 1_000),
}).strict().superRefine((limits, context) => {
  if (limits.maxPendingBytes < limits.maxChunkBytes) {
    context.addIssue({
      code: "custom",
      message: "The pending-buffer limit must be at least one audio chunk.",
      path: ["maxPendingBytes"],
    });
  }
});

export type NormalizedSttWord = z.infer<typeof normalizedSttWordSchema>;
export type NormalizedSttTranscript = z.infer<typeof normalizedSttTranscriptSchema>;
export type StreamingSttEventContext = z.infer<typeof streamingSttEventContextSchema>;
export type NormalizedStreamingSttEvent = z.infer<typeof normalizedStreamingSttEventSchema>;
export type ProviderStreamingSttLimits = z.infer<typeof providerStreamingSttLimitsSchema>;

export type StreamingAudioAdmission =
  | Readonly<{ ok: true; nextPendingBytes: number }>
  | Readonly<{
      ok: false;
      code: "cancelled" | "timed-out" | "invalid-frame" | "chunk-too-large" | "backpressure";
      closeReason: Extract<NormalizedStreamingSttEvent, { type: "session-closed" }>['reason'];
      message: string;
    }>;

export interface ProviderStreamingSttEventAdapter {
  readonly providerId: string;
  readonly capabilityId: "stt.streaming";
  readonly adapterVersion: string;
  readonly fixtureOnly: boolean;
  readonly limits: ProviderStreamingSttLimits;
  normalizeProviderEvent(
    rawEvent: unknown,
    context: StreamingSttEventContext,
  ): NormalizedStreamingSttEvent;
}

/**
 * Applies ONE-owned bounds before an audio frame can enter a provider buffer.
 * These are application safety limits, not claims about a provider's limits.
 */
export function admitStreamingAudioChunk(input: Readonly<{
  chunk: Uint8Array;
  pendingBytes: number;
  elapsedMilliseconds: number;
  signal?: AbortSignal;
  limits?: ProviderStreamingSttLimits;
}>): StreamingAudioAdmission {
  const limits = providerStreamingSttLimitsSchema.parse(input.limits ?? DEFAULT_STREAMING_STT_LIMITS);
  if (input.signal?.aborted) {
    return {
      ok: false,
      code: "cancelled",
      closeReason: "cancelled",
      message: "The streaming transcription session was cancelled.",
    };
  }
  if (!Number.isFinite(input.elapsedMilliseconds) || input.elapsedMilliseconds < 0) {
    return {
      ok: false,
      code: "invalid-frame",
      closeReason: "invalid-frame",
      message: "The streaming session elapsed time is invalid.",
    };
  }
  if (input.elapsedMilliseconds >= limits.maxSessionMilliseconds) {
    return {
      ok: false,
      code: "timed-out",
      closeReason: "timed-out",
      message: "The streaming transcription session reached its bounded duration.",
    };
  }
  if (!Number.isSafeInteger(input.pendingBytes) || input.pendingBytes < 0 || input.chunk.byteLength < 1) {
    return {
      ok: false,
      code: "invalid-frame",
      closeReason: "invalid-frame",
      message: "The streaming audio frame is empty or invalid.",
    };
  }
  if (input.chunk.byteLength > limits.maxChunkBytes) {
    return {
      ok: false,
      code: "chunk-too-large",
      closeReason: "invalid-frame",
      message: "The streaming audio frame exceeded the bounded chunk limit.",
    };
  }
  const nextPendingBytes = input.pendingBytes + input.chunk.byteLength;
  if (!Number.isSafeInteger(nextPendingBytes) || nextPendingBytes > limits.maxPendingBytes) {
    return {
      ok: false,
      code: "backpressure",
      closeReason: "backpressure",
      message: "The streaming audio buffer reached its bounded backpressure limit.",
    };
  }
  return { ok: true, nextPendingBytes };
}

export function releaseStreamingAudioBytes(pendingBytes: number, releasedBytes: number): number {
  if (!Number.isSafeInteger(pendingBytes) || pendingBytes < 0
      || !Number.isSafeInteger(releasedBytes) || releasedBytes < 0
      || releasedBytes > pendingBytes) {
    throw new Error("Streaming buffer accounting must remain non-negative and bounded.");
  }
  return pendingBytes - releasedBytes;
}

export function classifyStreamingClose(input: Readonly<{
  signal?: AbortSignal;
  timedOut?: boolean;
  expected?: boolean;
  providerClosed?: boolean;
}>): Extract<NormalizedStreamingSttEvent, { type: "session-closed" }>['reason'] {
  if (input.timedOut) return "timed-out";
  if (input.signal?.aborted) return "cancelled";
  if (input.expected) return "completed";
  if (input.providerClosed) return "provider-closed";
  return "unexpected-close";
}

export function reconnectDispositionForStreamingClose(
  reason: Extract<NormalizedStreamingSttEvent, { type: "session-closed" }>['reason'],
): Extract<NormalizedStreamingSttEvent, { type: "session-closed" }>['reconnect'] {
  return reason === "completed" || reason === "cancelled"
    ? "not-required"
    : "fresh-session-required";
}
