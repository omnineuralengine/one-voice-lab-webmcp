import "server-only";

import { z } from "zod";

import { createProviderAbortScope } from "@/lib/providers/audio-response";
import {
  MAX_NORMALIZED_STT_WORDS,
  type NormalizedSttTranscript,
  type NormalizedSttWord,
} from "@/lib/providers/streaming-stt";
import {
  MAX_TRUSTED_STT_AUDIO_BYTES,
  inspectTrustedSttAudio,
  type TrustedSttAudio,
} from "@/lib/stt-audio-admission";
import {
  RESON8_ADAPTER_VERSION,
  RESON8_PROVIDER_ID,
  Reson8ProtocolError,
  asReson8ProtocolError,
  normalizeReson8Transcript,
  normalizeReson8Words,
  parseReson8JsonBody,
  reson8WordSchema,
  type Reson8Word,
} from "@/lib/providers/reson8/protocol";

const DEFAULT_RESON8_PRERECORDED_TIMEOUT_MS = 45_000;
const MAX_RESON8_PRERECORDED_TIMEOUT_MS = 60_000;

export const reson8PrerecordedOptionsSchema = z.object({
  language: z.string().min(1).max(35).optional(),
  includeLanguage: z.boolean().optional(),
  includeTimestamps: z.boolean().optional(),
  includeWords: z.boolean().optional(),
  includeConfidence: z.boolean().optional(),
  diarize: z.boolean().optional(),
  maxSpeakers: z.number().int().min(1).max(4).optional(),
}).strict().superRefine((options, context) => {
  if (options.maxSpeakers !== undefined && !options.diarize) {
    context.addIssue({
      code: "custom",
      message: "maxSpeakers is valid only when diarization is requested.",
      path: ["maxSpeakers"],
    });
  }
});

const reson8SegmentSchema = z.object({
  text: z.string().max(64_000),
  language: z.string().min(1).max(35).optional(),
  speaker_id: z.number().int().nonnegative().max(1_024).optional(),
  start_ms: z.number().finite().nonnegative().optional(),
  duration_ms: z.number().finite().nonnegative().optional(),
  words: z.array(reson8WordSchema).max(MAX_NORMALIZED_STT_WORDS).optional(),
}).strict();

export const reson8PrerecordedResponseSchema = z.object({
  text: z.string().trim().min(1).max(64_000),
  language: z.string().min(1).max(35).optional(),
  start_ms: z.number().finite().nonnegative().optional(),
  duration_ms: z.number().finite().nonnegative().optional(),
  words: z.array(reson8WordSchema).max(MAX_NORMALIZED_STT_WORDS).optional(),
  segments: z.array(reson8SegmentSchema).max(10_000).optional(),
}).strict();

export type Reson8PrerecordedOptions = z.infer<typeof reson8PrerecordedOptionsSchema>;
export type Reson8PrerecordedResponse = z.infer<typeof reson8PrerecordedResponseSchema>;

export type Reson8PrerecordedTransportRequest = Readonly<{
  audio: Uint8Array;
  contentType: "application/octet-stream";
  trustedAudio: TrustedSttAudio;
  options: Reson8PrerecordedOptions;
}>;

export type Reson8PrerecordedTransportResponse = Readonly<{
  bodyText: string;
  requestId?: string;
}>;

/** No default transport exists. A future live path must inject a reviewed server-only transport. */
export interface Reson8PrerecordedTransport {
  execute(
    request: Reson8PrerecordedTransportRequest,
    context: Readonly<{ signal: AbortSignal }>,
  ): Promise<Reson8PrerecordedTransportResponse>;
}

export type Reson8PrerecordedResult = Readonly<{
  providerId: typeof RESON8_PROVIDER_ID;
  adapterVersion: typeof RESON8_ADAPTER_VERSION;
  transcript: string;
  language?: string;
  startMilliseconds?: number;
  durationMilliseconds?: number;
  words?: readonly NormalizedSttWord[];
  segments?: readonly Readonly<{
    transcript: NormalizedSttTranscript;
  }>[];
  requestId?: string;
  trustedAudio: TrustedSttAudio;
  provenance: "provider-response" | "synthetic-fixture";
}>;

export interface Reson8PrerecordedSttAdapter {
  readonly providerId: typeof RESON8_PROVIDER_ID;
  readonly capabilityId: "stt.prerecorded";
  readonly adapterVersion: typeof RESON8_ADAPTER_VERSION;
  readonly maxFileBytes: typeof MAX_TRUSTED_STT_AUDIO_BYTES;
  execute(
    input: Readonly<{ file: File; options?: Reson8PrerecordedOptions }>,
    context?: Readonly<{ signal?: AbortSignal; timeoutMilliseconds?: number }>,
  ): Promise<Reson8PrerecordedResult>;
}

export function normalizeReson8PrerecordedResponse(
  raw: unknown,
  input: Readonly<{
    trustedAudio: TrustedSttAudio;
    requestId?: string;
    provenance?: Reson8PrerecordedResult["provenance"];
  }>,
): Reson8PrerecordedResult {
  let response: Reson8PrerecordedResponse;
  try {
    response = reson8PrerecordedResponseSchema.parse(raw);
  } catch {
    throw new Reson8ProtocolError(
      "malformed-provider-response",
      "The Reson8 prerecorded response did not match its bounded schema.",
    );
  }

  const requestId = input.requestId && /^[A-Za-z0-9._:-]{1,200}$/.test(input.requestId)
    ? input.requestId
    : undefined;
  const segments = response.segments?.map((segment) => Object.freeze({
    transcript: normalizeReson8Transcript(segment),
  }));

  return Object.freeze({
    providerId: RESON8_PROVIDER_ID,
    adapterVersion: RESON8_ADAPTER_VERSION,
    transcript: response.text,
    ...(response.language ? { language: response.language } : {}),
    ...(response.start_ms === undefined ? {} : { startMilliseconds: response.start_ms }),
    ...(response.duration_ms === undefined ? {} : { durationMilliseconds: response.duration_ms }),
    ...(response.words ? { words: normalizeReson8Words(response.words as Reson8Word[]) } : {}),
    ...(segments ? { segments: Object.freeze(segments) } : {}),
    ...(requestId ? { requestId } : {}),
    trustedAudio: input.trustedAudio,
    provenance: input.provenance ?? "provider-response",
  });
}

export function createReson8PrerecordedSttAdapter(
  transport: Reson8PrerecordedTransport,
  adapterOptions: Readonly<{
    provenance?: Reson8PrerecordedResult["provenance"];
  }> = {},
): Reson8PrerecordedSttAdapter {
  return Object.freeze({
    providerId: RESON8_PROVIDER_ID,
    capabilityId: "stt.prerecorded" as const,
    adapterVersion: RESON8_ADAPTER_VERSION,
    maxFileBytes: MAX_TRUSTED_STT_AUDIO_BYTES,
    async execute(
      input: Readonly<{ file: File; options?: Reson8PrerecordedOptions }>,
      context: Readonly<{ signal?: AbortSignal; timeoutMilliseconds?: number }> = {},
    ) {
      const options = reson8PrerecordedOptionsSchema.parse(input.options ?? {});
      const requestedTimeout = context.timeoutMilliseconds ?? DEFAULT_RESON8_PRERECORDED_TIMEOUT_MS;
      if (!Number.isSafeInteger(requestedTimeout)
          || requestedTimeout < 1
          || requestedTimeout > MAX_RESON8_PRERECORDED_TIMEOUT_MS) {
        throw new Reson8ProtocolError("transport-failed", "The Reson8 timeout boundary is invalid.");
      }
      if (context.signal?.aborted) {
        throw new Reson8ProtocolError("cancelled", "The Reson8 prerecorded request was cancelled.");
      }

      const inspected = await inspectTrustedSttAudio(input.file);
      if (!inspected.ok) {
        const admissionCode = {
          audio_too_large: "audio-too-large",
          audio_too_long: "audio-too-long",
          unsupported_audio: "unsupported-audio",
          invalid_audio: "invalid-audio",
        } as const;
        throw new Reson8ProtocolError(
          admissionCode[inspected.code],
          `Reson8 admission rejected the audio: ${inspected.message}`,
        );
      }
      if (context.signal?.aborted) {
        throw new Reson8ProtocolError("cancelled", "The Reson8 prerecorded request was cancelled.");
      }

      const audio = new Uint8Array(await input.file.arrayBuffer());
      const scope = createProviderAbortScope(context.signal, requestedTimeout);
      let removeAbortListener: (() => void) | undefined;
      try {
        const aborted = new Promise<never>((_resolve, reject) => {
          const onAbort = () => reject(new Reson8ProtocolError(
            scope.didTimeout() ? "timed-out" : "cancelled",
            scope.didTimeout()
              ? "The Reson8 prerecorded request timed out."
              : "The Reson8 prerecorded request was cancelled.",
          ));
          scope.signal.addEventListener("abort", onAbort, { once: true });
          removeAbortListener = () => scope.signal.removeEventListener("abort", onAbort);
          if (scope.signal.aborted) onAbort();
        });
        const transportResponse = await Promise.race([
          transport.execute({
            audio,
            contentType: "application/octet-stream",
            trustedAudio: inspected.audio,
            options,
          }, { signal: scope.signal }),
          aborted,
        ]);
        const parsed = parseReson8JsonBody(transportResponse.bodyText);
        return normalizeReson8PrerecordedResponse(parsed, {
          trustedAudio: inspected.audio,
          requestId: transportResponse.requestId,
          provenance: adapterOptions.provenance,
        });
      } catch (error) {
        throw asReson8ProtocolError(error);
      } finally {
        removeAbortListener?.();
        scope.dispose();
      }
    },
  });
}
