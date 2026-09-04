import "server-only";

import WebSocket, { type ClientOptions, type RawData } from "ws";
import { z, type ZodIssue } from "zod";

import { createProviderAbortScope, monotonicNow } from "@/lib/providers/audio-response";
import {
  MAX_RESON8_NORMALIZED_RESPONSE_BYTES,
  Reson8ProtocolError,
} from "@/lib/providers/reson8/protocol";
import type { Reson8ServerCredential } from "@/lib/providers/reson8/live-credential";
import type {
  Reson8PrerecordedTransport,
  Reson8PrerecordedTransportRequest,
  Reson8PrerecordedTransportResponse,
} from "@/lib/providers/reson8/prerecorded";
import {
  normalizeReson8RealtimeEvent,
  reson8FlushConfirmationSchema,
  reson8RealtimeTranscriptSchema,
  type Reson8RealtimeMessage,
} from "@/lib/providers/reson8/realtime";
import { createReson8TurnAwareSttEventAdapter } from "@/lib/providers/reson8/turns";
import {
  DEFAULT_STREAMING_STT_LIMITS,
  admitStreamingAudioChunk,
  type NormalizedStreamingSttEvent,
  type StreamingSttEventContext,
} from "@/lib/providers/streaming-stt";
import type { NormalizedTurnAwareSttEvent } from "@/lib/providers/turn-aware-stt";
import {
  ProviderResponseBodyError,
  readBoundedProviderText,
} from "@/lib/providers/upstream-response";

export const RESON8_PRERECORDED_ENDPOINT = "https://api.reson8.dev/v1/speech-to-text/prerecorded";
export const RESON8_REALTIME_ENDPOINT = "wss://api.reson8.dev/v1/speech-to-text/realtime";
export const RESON8_TURNS_ENDPOINT = "wss://api.reson8.dev/v1/speech-to-text/turns";

const LIVE_SOCKET_TIMEOUT_MS = 20_000;
const LIVE_SOCKET_CHUNK_BYTES = 8 * 1024;
const MAX_LIVE_AUDIO_BYTES = 512 * 1024;
const MAX_LIVE_PROVIDER_EVENTS = 128;
const MAX_LIVE_PROVIDER_EVENT_BYTES = 2 * 1024 * 1024;
export const RESON8_REALTIME_FLUSH_ID = "one-live-contract-check" as const;
export const RESON8_REALTIME_DECODER_VERSION = "one-reson8-realtime-decoder/1.0.0" as const;

const socketPayloadRepresentationSchema = z.enum([
  "string",
  "buffer",
  "array-buffer",
  "fragmented-buffer",
  "unknown",
]);
const diagnosticValueTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "array",
  "object",
  "null",
  "undefined",
  "unknown",
]);
const diagnosticIssueSchema = z.object({
  path: z.string().max(160),
  code: z.string().regex(/^[a-z0-9_-]+$/).max(80),
  expectedType: z.string().max(80),
  receivedType: diagnosticValueTypeSchema,
}).strict();
export const reson8RealtimeSchemaDiagnosticSchema = z.object({
  transportPayloadRepresentation: socketPayloadRepresentationSchema,
  utf8DecodingSucceeded: z.boolean(),
  jsonParsingSucceeded: z.boolean(),
  parsedEventType: z.string().regex(/^[a-z0-9_-]+$/).max(80).optional(),
  topLevelFieldNames: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/).max(80)).max(32),
  topLevelValueTypes: z.record(
    z.string().regex(/^[a-z][a-z0-9_]*$/).max(80),
    diagnosticValueTypeSchema,
  ),
  schemaIssues: z.array(diagnosticIssueSchema).max(24),
  decoderVersion: z.literal(RESON8_REALTIME_DECODER_VERSION),
}).strict();
export type Reson8RealtimeSchemaDiagnostic = z.infer<typeof reson8RealtimeSchemaDiagnosticSchema>;

type Reson8ParsedLiveEventType = NormalizedStreamingSttEvent["type"] | NormalizedTurnAwareSttEvent["type"];

export type Reson8LiveFailureCode =
  | "authentication-denied"
  | "credits-exhausted"
  | "concurrency-limited"
  | "provider-rejected"
  | "response-too-large"
  | "malformed-provider-response"
  | "unsupported-provider-event"
  | "cancelled"
  | "timed-out"
  | "transport-failed"
  | "unexpected-close";

export class Reson8LiveTransportError extends Error {
  readonly code: Reson8LiveFailureCode;
  readonly schemaDiagnostic?: Reson8RealtimeSchemaDiagnostic;
  readonly parsedEventTypes: readonly Reson8ParsedLiveEventType[];
  readonly transportCompletedCleanly: boolean;

  constructor(
    code: Reson8LiveFailureCode,
    message: string,
    evidence: Readonly<{
      schemaDiagnostic?: Reson8RealtimeSchemaDiagnostic;
      parsedEventTypes?: readonly Reson8ParsedLiveEventType[];
      transportCompletedCleanly?: boolean;
    }> = {},
  ) {
    super(message);
    this.name = "Reson8LiveTransportError";
    this.code = code;
    this.schemaDiagnostic = evidence.schemaDiagnostic;
    this.parsedEventTypes = Object.freeze([...(evidence.parsedEventTypes ?? [])]);
    this.transportCompletedCleanly = evidence.transportCompletedCleanly ?? false;
  }
}

export type Reson8WebSocketLike = Pick<WebSocket,
  "bufferedAmount" | "close" | "on" | "off" | "readyState" | "send" | "terminate"
>;

export type Reson8WebSocketFactory = (
  endpoint: string,
  options: Readonly<{
    headers: Headers;
    handshakeTimeoutMilliseconds: number;
    maxPayloadBytes: number;
  }>,
) => Reson8WebSocketLike;

export type Reson8LiveSocketResult = Readonly<{
  mode: "realtime" | "turns";
  durationMilliseconds: number;
  events: readonly (NormalizedStreamingSttEvent | NormalizedTurnAwareSttEvent)[];
  turnCompletion?: Readonly<{
    strategy: "last-turn-end-after-audio-then-flush";
    allAudioSent: true;
    flushSent: true;
    finalActiveTurnFinalized: true;
  }>;
}>;

export function createReson8LivePrerecordedTransport(
  credential: Reson8ServerCredential,
  dependencies: Readonly<{ fetcher?: typeof fetch }> = {},
): Reson8PrerecordedTransport {
  const fetcher = dependencies.fetcher ?? fetch;
  return Object.freeze({
    async execute(
      request: Reson8PrerecordedTransportRequest,
      context: Readonly<{ signal: AbortSignal }>,
    ): Promise<Reson8PrerecordedTransportResponse> {
      if (
        request.audio.byteLength > MAX_LIVE_AUDIO_BYTES
        || request.trustedAudio.durationSeconds > 10
        || request.trustedAudio.sampleRate !== 16_000
        || request.trustedAudio.channels !== 1
        || request.trustedAudio.bitsPerSample !== 16
      ) {
        throw new Reson8ProtocolError(
          "provider-rejected",
          "The Reson8 live verifier accepts only its bounded canonical PCM sample.",
        );
      }
      const endpoint = new URL(RESON8_PRERECORDED_ENDPOINT);
      endpoint.searchParams.set("include_timestamps", "true");
      endpoint.searchParams.set("include_words", "true");
      endpoint.searchParams.set("include_language", "true");
      endpoint.searchParams.set("include_confidence", "true");
      const headers = credential.authorize({ "content-type": request.contentType });

      let response: Response;
      try {
        response = await fetcher(endpoint, {
          method: "POST",
          headers,
          body: Uint8Array.from(request.audio).buffer,
          signal: context.signal,
          redirect: "error",
          cache: "no-store",
        });
      } catch (error) {
        throw normalizeLiveTransportFailure(error);
      }

      if (!response.ok) {
        await response.body?.cancel("ONE rejected the Reson8 response.").catch(() => undefined);
        throw statusProtocolFailure(response.status);
      }

      try {
        return {
          bodyText: await readBoundedProviderText(response, {
            signal: context.signal,
            maxBytes: MAX_RESON8_NORMALIZED_RESPONSE_BYTES,
          }),
        };
      } catch (error) {
        if (error instanceof ProviderResponseBodyError) {
          const tooLarge = /exceeded/i.test(error.message);
          throw new Reson8ProtocolError(
            tooLarge ? "response-too-large" : "malformed-provider-response",
            tooLarge
              ? "The Reson8 response exceeded ONE's bounded response limit."
              : "The Reson8 response was not readable bounded text.",
          );
        }
        throw normalizeLiveTransportFailure(error);
      }
    },
  });
}

export async function runReson8LiveRealtime(
  input: Readonly<{
    audio: Uint8Array;
    credential: Reson8ServerCredential;
    signal?: AbortSignal;
    timeoutMilliseconds?: number;
  }>,
  dependencies: Readonly<{ socketFactory?: Reson8WebSocketFactory }> = {},
): Promise<Reson8LiveSocketResult> {
  return runSocketSession("realtime", input, dependencies);
}

export async function runReson8LiveTurns(
  input: Readonly<{
    audio: Uint8Array;
    credential: Reson8ServerCredential;
    signal?: AbortSignal;
    timeoutMilliseconds?: number;
  }>,
  dependencies: Readonly<{ socketFactory?: Reson8WebSocketFactory }> = {},
): Promise<Reson8LiveSocketResult> {
  return runSocketSession("turns", input, dependencies);
}

async function runSocketSession(
  mode: "realtime" | "turns",
  input: Readonly<{
    audio: Uint8Array;
    credential: Reson8ServerCredential;
    signal?: AbortSignal;
    timeoutMilliseconds?: number;
  }>,
  dependencies: Readonly<{ socketFactory?: Reson8WebSocketFactory }>,
): Promise<Reson8LiveSocketResult> {
  if (input.audio.byteLength < 1 || input.audio.byteLength > MAX_LIVE_AUDIO_BYTES) {
    throw new Reson8LiveTransportError("provider-rejected", "The Reson8 live audio input was outside its fixed bound.");
  }
  const timeoutMilliseconds = normalizeSocketTimeout(input.timeoutMilliseconds);
  const scope = createProviderAbortScope(input.signal, timeoutMilliseconds);
  const endpoint = createSocketEndpoint(mode);
  const headers = input.credential.authorize();
  const socketFactory = dependencies.socketFactory ?? defaultSocketFactory;
  const startedAt = monotonicNow();
  const events: Array<NormalizedStreamingSttEvent | NormalizedTurnAwareSttEvent> = [];
  const turnAdapter = mode === "turns" ? createReson8TurnAwareSttEventAdapter() : null;

  try {
    return await new Promise<Reson8LiveSocketResult>((resolve, reject) => {
      let sequence = 0;
      let settled = false;
      let terminalObserved = false;
      let allAudioSent = false;
      let flushDispatched = false;
      let flushSent = false;
      let closeRequested = false;
      let providerEventBytes = 0;
      let realtimeFinalTranscriptObserved = false;
      let realtimeFlushConfirmed = false;
      let deferredRealtimeSchemaFailure: Reson8LiveTransportError | null = null;
      let socket: Reson8WebSocketLike;

      const cleanup = () => {
        scope.signal.removeEventListener("abort", onAbort);
        socket?.off("open", onOpen);
        socket?.off("message", onMessage);
        socket?.off("close", onClose);
        socket?.off("error", onError);
        socket?.off("unexpected-response", onUnexpectedResponse);
      };
      const succeed = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(Object.freeze({
          mode,
          durationMilliseconds: elapsedMilliseconds(startedAt),
          events: Object.freeze([...events]),
          ...(mode === "turns" ? {
            turnCompletion: Object.freeze({
              strategy: "last-turn-end-after-audio-then-flush" as const,
              allAudioSent: true as const,
              flushSent: true as const,
              finalActiveTurnFinalized: true as const,
            }),
          } : {}),
        }));
      };
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        try {
          socket?.terminate();
        } catch {
          // The safe error below is authoritative.
        }
        reject(withParsedSessionEvidence(normalizeLiveTransportFailure(error), events));
      };
      const onAbort = () => {
        if (mode === "realtime" && deferredRealtimeSchemaFailure) {
          fail(deferredRealtimeSchemaFailure);
          return;
        }
        if (mode === "realtime" && scope.didTimeout() && realtimeFlushConfirmed && !realtimeFinalTranscriptObserved) {
          fail(new Reson8LiveTransportError(
            "malformed-provider-response",
            "The Reson8 realtime contract completed its flush without a non-empty final transcript.",
          ));
          return;
        }
        fail(new Reson8LiveTransportError(
          scope.didTimeout() ? "timed-out" : "cancelled",
          scope.didTimeout()
            ? "The Reson8 live session reached its fixed timeout."
            : "The Reson8 live session was cancelled.",
        ));
      };
      const closeWhenContractComplete = () => {
        if (settled || closeRequested || !terminalObserved || !allAudioSent || !flushSent) return;
        closeRequested = true;
        socket.close(1000, "complete");
      };
      const onOpen = () => {
        void sendBoundedAudio(socket, input.audio, scope.signal, startedAt)
          .then(() => {
            allAudioSent = true;
            flushDispatched = true;
            return sendSocketFrame(
              socket,
              mode === "realtime"
                ? JSON.stringify({ type: "flush_request", id: RESON8_REALTIME_FLUSH_ID })
                : JSON.stringify({ type: "flush_request" }),
            );
          })
          .then(() => {
            flushSent = true;
            closeWhenContractComplete();
          })
          .catch(fail);
      };
      const onMessage = (data: RawData, isBinary: boolean) => {
        try {
          if (terminalObserved) return;
          if (events.length >= MAX_LIVE_PROVIDER_EVENTS) {
            throw new Reson8LiveTransportError(
              "response-too-large",
              "The Reson8 live session exceeded its bounded event count.",
            );
          }
          const decoded = mode === "realtime"
            ? decodeReson8RealtimeSocketMessage(data, isBinary)
            : decodeBoundedSocketJsonMessage(data, isBinary);
          providerEventBytes += decoded.byteLength;
          if (!Number.isSafeInteger(providerEventBytes) || providerEventBytes > MAX_LIVE_PROVIDER_EVENT_BYTES) {
            throw new Reson8LiveTransportError(
              "response-too-large",
              "The Reson8 live session exceeded its bounded cumulative response limit.",
            );
          }
          const eventContext: StreamingSttEventContext = {
            providerId: "reson8",
            sequence: sequence++,
            observedAt: new Date().toISOString(),
            monotonicOffsetMilliseconds: elapsedMilliseconds(startedAt),
            provenance: "provider",
          };
          const event = mode === "realtime"
            ? normalizeReson8RealtimeEvent(decoded.value, eventContext)
            : turnAdapter!.normalizeProviderEvent(decoded.value, eventContext);

          if (mode === "realtime") {
            if (event.type === "final-transcript") {
              if (event.transcript.text.trim().length === 0) {
                throw new Reson8LiveTransportError(
                  "malformed-provider-response",
                  "The Reson8 realtime contract returned an empty final transcript.",
                  { schemaDiagnostic: withContractIssue(decoded.diagnostic, {
                    path: "text",
                    code: "empty_final_transcript",
                    expectedType: "non-empty string",
                    receivedType: "string",
                  }) },
                );
              }
              realtimeFinalTranscriptObserved = true;
            }
            if (event.type === "flush-confirmed") {
              if (event.requestId !== RESON8_REALTIME_FLUSH_ID) {
                throw new Reson8LiveTransportError(
                  "malformed-provider-response",
                  "The Reson8 realtime flush confirmation did not match the bounded request.",
                  { schemaDiagnostic: withContractIssue(decoded.diagnostic, {
                    path: "id",
                    code: "flush_id_mismatch",
                    expectedType: "matching string",
                    receivedType: event.requestId === null ? "null" : "string",
                  }) },
                );
              }
              realtimeFlushConfirmed = true;
            }
          }
          events.push(event);
          const terminal = mode === "realtime"
            ? realtimeFlushConfirmed && (realtimeFinalTranscriptObserved || Boolean(deferredRealtimeSchemaFailure))
            // Reson8's official Turns example treats turn_end as terminal only
            // when the sender is done. An earlier turn_end belongs to a completed
            // turn inside the same session and must not suppress later turns.
            : event.type === "turn-end" && allAudioSent && flushDispatched;
          if (terminal) {
            terminalObserved = true;
            closeWhenContractComplete();
          }
        } catch (error) {
          const failure = normalizeLiveTransportFailure(error);
          if (
            mode === "realtime"
            && failure instanceof Reson8LiveTransportError
            && (failure.code === "malformed-provider-response" || failure.code === "unsupported-provider-event")
          ) {
            deferredRealtimeSchemaFailure ??= failure;
            if (realtimeFlushConfirmed) {
              terminalObserved = true;
              closeWhenContractComplete();
            }
            return;
          }
          fail(failure);
        }
      };
      const onClose = (code: number) => {
        if (terminalObserved && allAudioSent && flushSent && code === 1000) {
          if (deferredRealtimeSchemaFailure) {
            fail(withCleanTransportCompletion(deferredRealtimeSchemaFailure));
          } else {
            succeed();
          }
        }
        else if (mode === "realtime" && code === 1000 && realtimeFlushConfirmed && !realtimeFinalTranscriptObserved) {
          fail(new Reson8LiveTransportError(
            "malformed-provider-response",
            "The Reson8 realtime contract closed without a non-empty final transcript.",
          ));
        }
        else fail(new Reson8LiveTransportError(
          "unexpected-close",
          "The Reson8 live session closed before a clean completed contract.",
        ));
      };
      const onError = () => fail(new Reson8LiveTransportError(
        "transport-failed",
        "The Reson8 live socket failed safely.",
      ));
      const onUnexpectedResponse = (
        _request: unknown,
        response: Readonly<{ statusCode?: number; destroy?: () => void }>,
      ) => {
        response.destroy?.();
        fail(statusFailure(response.statusCode ?? 500));
      };

      scope.signal.addEventListener("abort", onAbort, { once: true });
      if (scope.signal.aborted) {
        onAbort();
        return;
      }
      try {
        socket = socketFactory(endpoint, {
          headers,
          handshakeTimeoutMilliseconds: Math.min(timeoutMilliseconds, 10_000),
          maxPayloadBytes: MAX_RESON8_NORMALIZED_RESPONSE_BYTES,
        });
        socket.on("open", onOpen);
        socket.on("message", onMessage);
        socket.on("close", onClose);
        socket.on("error", onError);
        socket.on("unexpected-response", onUnexpectedResponse);
      } catch (error) {
        fail(error);
      }
    });
  } finally {
    turnAdapter?.reset();
    scope.dispose();
  }
}

function defaultSocketFactory(
  endpoint: string,
  options: Readonly<{
    headers: Headers;
    handshakeTimeoutMilliseconds: number;
    maxPayloadBytes: number;
  }>,
): Reson8WebSocketLike {
  const clientOptions: ClientOptions = {
    headers: Object.fromEntries(options.headers.entries()),
    handshakeTimeout: options.handshakeTimeoutMilliseconds,
    maxPayload: options.maxPayloadBytes,
    perMessageDeflate: false,
    followRedirects: false,
  };
  return new WebSocket(endpoint, clientOptions);
}

function createSocketEndpoint(mode: "realtime" | "turns"): string {
  const endpoint = new URL(mode === "realtime" ? RESON8_REALTIME_ENDPOINT : RESON8_TURNS_ENDPOINT);
  // The verifier streams the complete bounded WAV container, so the official
  // container-detection mode is intentional. Raw PCM would instead require
  // pcm_s16le plus explicit sample_rate and channels.
  endpoint.searchParams.set("encoding", "auto");
  if (mode === "realtime") {
    // The contract check needs only partial/final distinction. Optional
    // language, timestamp, word, confidence, and diarization payloads remain
    // supported by the strict parser but are not requested here.
    endpoint.searchParams.set("include_interim", "true");
  }
  return endpoint.toString();
}

async function sendBoundedAudio(
  socket: Reson8WebSocketLike,
  audio: Uint8Array,
  signal: AbortSignal,
  startedAt: number,
): Promise<void> {
  for (let offset = 0; offset < audio.byteLength; offset += LIVE_SOCKET_CHUNK_BYTES) {
    const chunk = audio.subarray(offset, Math.min(audio.byteLength, offset + LIVE_SOCKET_CHUNK_BYTES));
    const admission = admitStreamingAudioChunk({
      chunk,
      pendingBytes: socket.bufferedAmount,
      elapsedMilliseconds: elapsedMilliseconds(startedAt),
      signal,
      limits: {
        ...DEFAULT_STREAMING_STT_LIMITS,
        maxSessionMilliseconds: LIVE_SOCKET_TIMEOUT_MS,
      },
    });
    if (!admission.ok) {
      const code = admission.code === "cancelled"
        ? "cancelled"
        : admission.code === "timed-out"
          ? "timed-out"
          : "provider-rejected";
      throw new Reson8LiveTransportError(code, admission.message);
    }
    await sendSocketFrame(socket, chunk);
  }
}

function sendSocketFrame(socket: Reson8WebSocketLike, data: Uint8Array | string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.readyState !== WebSocket.OPEN) {
      reject(new Reson8LiveTransportError("unexpected-close", "The Reson8 live socket was not open."));
      return;
    }
    socket.send(data, (error?: Error) => {
      if (error) reject(new Reson8LiveTransportError("transport-failed", "The Reson8 frame send failed safely."));
      else resolve();
    });
  });
}

type DecodedSocketJsonMessage = Readonly<{
  value: unknown;
  byteLength: number;
  diagnostic: Reson8RealtimeSchemaDiagnostic;
}>;

export type DecodedReson8RealtimeSocketMessage = Readonly<{
  value: Reson8RealtimeMessage;
  byteLength: number;
  diagnostic: Reson8RealtimeSchemaDiagnostic;
}>;

export function decodeReson8RealtimeSocketMessage(
  data: RawData | string | unknown,
  isBinary: boolean,
): DecodedReson8RealtimeSocketMessage {
  const decoded = decodeBoundedSocketJsonMessage(data, isBinary);
  const rawType = safeEventType(decoded.value);
  if (rawType !== "transcript" && rawType !== "flush_confirmation") {
    throw schemaDiagnosticFailure(
      "unsupported-provider-event",
      "The Reson8 realtime event type is not supported by this decoder version.",
      decoded.diagnostic,
      [{
        path: "type",
        code: "unsupported_provider_event",
        expectedType: "transcript | flush_confirmation",
        receivedType: valueType(valueAtPath(decoded.value, ["type"])),
      }],
    );
  }
  const result = rawType === "transcript"
    ? reson8RealtimeTranscriptSchema.safeParse(decoded.value)
    : reson8FlushConfirmationSchema.safeParse(decoded.value);
  if (!result.success) {
    throw schemaDiagnosticFailure(
      "malformed-provider-response",
      "The Reson8 realtime event did not match its strict documented schema.",
      decoded.diagnostic,
      sanitizeZodIssues(result.error.issues, decoded.value),
    );
  }
  return Object.freeze({ ...decoded, value: result.data });
}

function decodeBoundedSocketJsonMessage(
  data: RawData | string | unknown,
  isBinary: boolean,
): DecodedSocketJsonMessage {
  const representation = socketPayloadRepresentation(data);
  const base = diagnosticBase(representation);
  if (isBinary) {
    throw schemaDiagnosticFailure(
      "malformed-provider-response",
      "The Reson8 provider returned an unexpected binary message.",
      base,
      [{ path: "", code: "unexpected_binary_frame", expectedType: "text frame", receivedType: "object" }],
    );
  }

  let text: string;
  let byteLength: number;
  if (typeof data === "string") {
    text = data;
    byteLength = new TextEncoder().encode(data).byteLength;
  } else {
    const bytes = socketPayloadBytes(data, representation, base);
    byteLength = bytes.byteLength;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw schemaDiagnosticFailure(
        "malformed-provider-response",
        "The Reson8 socket message was not valid UTF-8 text.",
        base,
        [{ path: "", code: "invalid_utf8", expectedType: "UTF-8 text", receivedType: "object" }],
      );
    }
  }
  if (byteLength > MAX_RESON8_NORMALIZED_RESPONSE_BYTES) {
    throw new Reson8LiveTransportError(
      "response-too-large",
      "The Reson8 socket message exceeded ONE's bounded response limit.",
    );
  }

  const utf8Diagnostic = Object.freeze({ ...base, utf8DecodingSucceeded: true });
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw schemaDiagnosticFailure(
      "malformed-provider-response",
      "The Reson8 socket message was not valid JSON.",
      utf8Diagnostic,
      [{ path: "", code: "invalid_json", expectedType: "JSON object", receivedType: "string" }],
    );
  }
  return Object.freeze({
    value,
    byteLength,
    diagnostic: buildParsedDiagnostic(utf8Diagnostic, value),
  });
}

function socketPayloadRepresentation(data: unknown): z.infer<typeof socketPayloadRepresentationSchema> {
  if (typeof data === "string") return "string";
  if (Buffer.isBuffer(data)) return "buffer";
  if (data instanceof ArrayBuffer) return "array-buffer";
  if (Array.isArray(data) && data.every((part) => Buffer.isBuffer(part))) return "fragmented-buffer";
  return "unknown";
}

function socketPayloadBytes(
  data: unknown,
  representation: z.infer<typeof socketPayloadRepresentationSchema>,
  diagnostic: Reson8RealtimeSchemaDiagnostic,
): Uint8Array {
  if (representation === "buffer" && Buffer.isBuffer(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (representation === "array-buffer" && data instanceof ArrayBuffer) return new Uint8Array(data);
  if (representation === "fragmented-buffer" && Array.isArray(data)) {
    return Buffer.concat(data as Buffer[]);
  }
  throw schemaDiagnosticFailure(
    "malformed-provider-response",
    "The Reson8 socket message used an unsupported payload representation.",
    diagnostic,
    [{ path: "", code: "unsupported_payload_representation", expectedType: "string | buffer | array-buffer | fragmented-buffer", receivedType: "unknown" }],
  );
}

function diagnosticBase(
  representation: z.infer<typeof socketPayloadRepresentationSchema>,
): Reson8RealtimeSchemaDiagnostic {
  return Object.freeze(reson8RealtimeSchemaDiagnosticSchema.parse({
    transportPayloadRepresentation: representation,
    utf8DecodingSucceeded: false,
    jsonParsingSucceeded: false,
    topLevelFieldNames: [],
    topLevelValueTypes: {},
    schemaIssues: [],
    decoderVersion: RESON8_REALTIME_DECODER_VERSION,
  }));
}

function buildParsedDiagnostic(
  base: Reson8RealtimeSchemaDiagnostic,
  value: unknown,
): Reson8RealtimeSchemaDiagnostic {
  const record = isRecord(value) ? value : null;
  const fieldNames = record
    ? Object.keys(record).filter(isSafeDiagnosticFieldName).sort().slice(0, 32)
    : [];
  const topLevelValueTypes = Object.fromEntries(
    fieldNames.map((field) => [field, valueType(record?.[field])]),
  );
  const parsedEventType = safeEventType(value);
  return Object.freeze(reson8RealtimeSchemaDiagnosticSchema.parse({
    ...base,
    jsonParsingSucceeded: true,
    ...(parsedEventType ? { parsedEventType } : {}),
    topLevelFieldNames: fieldNames,
    topLevelValueTypes,
    schemaIssues: [],
  }));
}

function schemaDiagnosticFailure(
  code: "malformed-provider-response" | "unsupported-provider-event",
  message: string,
  base: Reson8RealtimeSchemaDiagnostic,
  issues: readonly z.infer<typeof diagnosticIssueSchema>[],
): Reson8LiveTransportError {
  return new Reson8LiveTransportError(code, message, {
    schemaDiagnostic: Object.freeze(reson8RealtimeSchemaDiagnosticSchema.parse({
      ...base,
      schemaIssues: issues,
    })),
  });
}

function sanitizeZodIssues(
  issues: readonly ZodIssue[],
  value: unknown,
): readonly z.infer<typeof diagnosticIssueSchema>[] {
  return issues.slice(0, 24).map((issue) => {
    const path = issue.path.filter((part): part is string | number => typeof part === "string" || typeof part === "number");
    const expected = "expected" in issue && typeof issue.expected === "string"
      ? issue.expected
      : expectedTypeForPath(path);
    return Object.freeze(diagnosticIssueSchema.parse({
      path: path.map(String).join("."),
      code: sanitizeIssueCode(issue.code),
      expectedType: expected.slice(0, 80),
      receivedType: valueType(valueAtPath(value, path)),
    }));
  });
}

function expectedTypeForPath(path: readonly (string | number)[]): string {
  const last = path[path.length - 1];
  if (["type", "text", "language"].includes(String(last))) return "string";
  if (last === "id") return "string | null";
  if (last === "is_final") return "boolean";
  if (["start_ms", "duration_ms", "speaker_id", "confidence"].includes(String(last))) return "number";
  if (last === "words") return "array";
  return "documented event field";
}

function valueAtPath(value: unknown, path: readonly (string | number)[]): unknown {
  let current = value;
  for (const segment of path) {
    if (typeof segment === "number" && Array.isArray(current)) current = current[segment];
    else if (typeof segment === "string" && isRecord(current)) current = current[segment];
    else return undefined;
  }
  return current;
}

function valueType(value: unknown): z.infer<typeof diagnosticValueTypeSchema> {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "undefined") return "undefined";
  if (typeof value === "object") return "object";
  return "unknown";
}

function safeEventType(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  return /^[a-z0-9_-]{1,80}$/.test(value.type) ? value.type : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSafeDiagnosticFieldName(value: string): boolean {
  return /^[a-z][a-z0-9_]{0,79}$/.test(value);
}

function sanitizeIssueCode(value: string): string {
  const normalized = value.toLocaleLowerCase("en-US").replace(/[^a-z0-9_-]/g, "_").slice(0, 80);
  return normalized || "schema_issue";
}

function withContractIssue(
  diagnostic: Reson8RealtimeSchemaDiagnostic,
  issue: z.infer<typeof diagnosticIssueSchema>,
): Reson8RealtimeSchemaDiagnostic {
  return Object.freeze(reson8RealtimeSchemaDiagnosticSchema.parse({
    ...diagnostic,
    schemaIssues: [diagnosticIssueSchema.parse(issue)],
  }));
}

function withParsedSessionEvidence(
  failure: Reson8LiveTransportError | Reson8ProtocolError,
  events: readonly (NormalizedStreamingSttEvent | NormalizedTurnAwareSttEvent)[],
): Reson8LiveTransportError | Reson8ProtocolError {
  if (!(failure instanceof Reson8LiveTransportError)) return failure;
  return new Reson8LiveTransportError(failure.code, failure.message, {
    ...(failure.schemaDiagnostic ? { schemaDiagnostic: failure.schemaDiagnostic } : {}),
    parsedEventTypes: events.map((event) => event.type),
    transportCompletedCleanly: failure.transportCompletedCleanly,
  });
}

function withCleanTransportCompletion(failure: Reson8LiveTransportError): Reson8LiveTransportError {
  return new Reson8LiveTransportError(failure.code, failure.message, {
    ...(failure.schemaDiagnostic ? { schemaDiagnostic: failure.schemaDiagnostic } : {}),
    parsedEventTypes: failure.parsedEventTypes,
    transportCompletedCleanly: true,
  });
}

function normalizeSocketTimeout(value: number | undefined): number {
  const timeout = value ?? LIVE_SOCKET_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > LIVE_SOCKET_TIMEOUT_MS) {
    throw new Reson8LiveTransportError("provider-rejected", "The Reson8 live timeout boundary is invalid.");
  }
  return timeout;
}

function statusFailure(status: number): Reson8LiveTransportError {
  if (status === 401) {
    return new Reson8LiveTransportError("authentication-denied", "Reson8 rejected the server credential.");
  }
  if (status === 402) {
    return new Reson8LiveTransportError("credits-exhausted", "Reson8 reported that credits are unavailable.");
  }
  if (status === 429) {
    return new Reson8LiveTransportError(
      "concurrency-limited",
      "Reson8 rejected the operation at its concurrent-connection boundary.",
    );
  }
  return new Reson8LiveTransportError("provider-rejected", "Reson8 rejected the bounded verification operation.");
}

function statusProtocolFailure(status: number): Reson8ProtocolError {
  const failure = statusFailure(status);
  const code = failure.code === "unexpected-close" ? "transport-failed" : failure.code;
  return new Reson8ProtocolError(code, failure.message);
}

function normalizeLiveTransportFailure(error: unknown): Reson8LiveTransportError | Reson8ProtocolError {
  if (error instanceof Reson8LiveTransportError || error instanceof Reson8ProtocolError) return error;
  if (error instanceof Error && error.name === "AbortError") {
    return new Reson8LiveTransportError("cancelled", "The Reson8 live operation was cancelled.");
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return new Reson8LiveTransportError("timed-out", "The Reson8 live operation timed out.");
  }
  return new Reson8LiveTransportError("transport-failed", "The Reson8 live transport failed safely.");
}

function elapsedMilliseconds(startedAt: number): number {
  return Math.max(0, Number((monotonicNow() - startedAt).toFixed(3)));
}
