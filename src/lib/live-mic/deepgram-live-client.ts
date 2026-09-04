import {
  isContainerizedMediaRecorderMimeType,
  normalizeMediaRecorderMimeType,
} from "@/lib/live-mic/media-recorder";
import type { DeepgramNova3StreamingLanguageCode } from "@/lib/deepgram-languages";

export const DEEPGRAM_LIVE_LISTEN_ENDPOINT = "wss://api.deepgram.com/v1/listen";

export type DeepgramLiveAttemptId = "A" | "B" | "C";

export type DeepgramRawAudioFormat = {
  mimeType: string;
  encoding: string;
  sampleRate: number;
};

export type NovaLiveRecognitionConfig =
  | {
      mode: "known-language";
      model: "nova-3";
      language: DeepgramNova3StreamingLanguageCode;
    }
  | {
      mode: "nova-multilingual";
      model: "nova-3";
      language: "multi";
    };

export type DeepgramListenOptions = {
  recognitionConfig: NovaLiveRecognitionConfig;
  smartFormat?: boolean;
  interimResults?: boolean;
  endpointingMs?: number;
  tag?: "avs_observatory_live";
  redact?: readonly string[];
  noDelay?: boolean;
};

export type DeepgramLiveAttemptOptions = DeepgramListenOptions & {
  mimeType?: string;
  explicitRawFormatAttempt?: DeepgramRawAudioFormat;
};

export type DeepgramLiveAttempt = {
  id: DeepgramLiveAttemptId;
  number: number;
  label: string;
  url: string;
  query: Readonly<Record<string, string | string[]>>;
  mimeType: string;
  usesVadEvents: boolean;
  audioFormatMode: "container-autodetect" | "explicit-raw";
};

export type DeepgramLiveToken = {
  accessToken: string;
  issuedAtMs?: number;
  expiresAtMs?: number;
};

export type DeepgramLiveTokenRequest = {
  attempt: DeepgramLiveAttempt;
  forceRefresh: boolean;
  minimumValidityMs: number;
};

export type DeepgramLiveAttemptMetadata = DeepgramLiveAttempt & {
  startedAt: string;
  tokenAgeMs?: number;
};

export type DeepgramLiveDiagnosticType =
  | "websocket_connecting"
  | "websocket_open"
  | "deepgram_message_received"
  | "websocket_error"
  | "websocket_close"
  | "websocket_retry_scheduled"
  | "websocket_attempts_exhausted";

export type DeepgramLiveDiagnostic = {
  type: DeepgramLiveDiagnosticType;
  at: string;
  attempt: DeepgramLiveAttemptMetadata;
  message: string;
  closeCode?: number;
  closeReason?: string;
  wasClean?: boolean;
  willRetry?: boolean;
  receivedAnyMessage: boolean;
  receivedTranscriptEvent: boolean;
};

export type DeepgramLiveOpenContext = {
  socket: WebSocket;
  event: Event;
  attempt: DeepgramLiveAttemptMetadata;
};

export type DeepgramLiveMessageContext = {
  socket: WebSocket;
  event: MessageEvent;
  data: unknown;
  attempt: DeepgramLiveAttemptMetadata;
  isTranscriptEvent: boolean;
};

export type DeepgramLiveErrorContext = {
  socket: WebSocket | null;
  event: Event | null;
  error: Error;
  attempt: DeepgramLiveAttemptMetadata;
  receivedAnyMessage: boolean;
  receivedTranscriptEvent: boolean;
};

export type DeepgramLiveCloseContext = {
  socket: WebSocket;
  event: CloseEvent | null;
  attempt: DeepgramLiveAttemptMetadata;
  code: number;
  reason: string;
  wasClean: boolean;
  willRetry: boolean;
  receivedAnyMessage: boolean;
  receivedTranscriptEvent: boolean;
};

export type DeepgramLiveExhaustedContext = {
  attempt: DeepgramLiveAttemptMetadata;
  message: string;
  receivedAnyMessage: boolean;
  receivedTranscriptEvent: boolean;
};

export type DeepgramLiveClientOptions = DeepgramLiveAttemptOptions & {
  getToken: (request: DeepgramLiveTokenRequest) => DeepgramLiveToken | Promise<DeepgramLiveToken>;
  connectionTimeoutMs?: number;
  retryDelayMs?: number;
  minimumTokenValidityMs?: number;
  maxAttempts?: 1 | 2 | 3;
  webSocketFactory?: (url: string, protocols: string[]) => WebSocket;
  onDiagnostic?: (diagnostic: DeepgramLiveDiagnostic) => void;
  onOpen?: (context: DeepgramLiveOpenContext) => void;
  onMessage?: (context: DeepgramLiveMessageContext) => void;
  onError?: (context: DeepgramLiveErrorContext) => void;
  onClose?: (context: DeepgramLiveCloseContext) => void;
  onExhausted?: (context: DeepgramLiveExhaustedContext) => void;
};

const DEFAULT_CONNECTION_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_DELAY_MS = 250;
const WEB_SOCKET_OPEN = 1;
const WEB_SOCKET_CLOSING = 2;
const WEB_SOCKET_CLOSED = 3;

function assertNonEmpty(value: string, label: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${label} is required.`);
  }

  return normalized;
}

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }

  return Math.round(value);
}

function queryRecord(url: URL) {
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of url.searchParams) {
    const current = query[key];
    query[key] = current === undefined ? value : Array.isArray(current) ? [...current, value] : [current, value];
  }
  return Object.freeze(query);
}

export function buildDeepgramListenUrl(
  options: DeepgramListenOptions & {
    vadEvents?: boolean;
    rawAudioFormat?: DeepgramRawAudioFormat;
  },
) {
  const language = assertNonEmpty(options.recognitionConfig.language, "Deepgram language");
  const model = assertNonEmpty(options.recognitionConfig.model, "Deepgram model");
  const endpointingMs = assertPositiveInteger(options.endpointingMs ?? 300, "Deepgram endpointingMs");
  const url = new URL(DEEPGRAM_LIVE_LISTEN_ENDPOINT);

  url.searchParams.set("model", model);
  url.searchParams.set("language", language);
  url.searchParams.set("smart_format", String(options.smartFormat ?? true));
  url.searchParams.set("interim_results", String(options.interimResults ?? true));
  url.searchParams.set("endpointing", String(endpointingMs));

  if (options.vadEvents) {
    url.searchParams.set("vad_events", "true");
  }

  if (options.tag) url.searchParams.set("tag", options.tag);
  for (const value of options.redact ?? []) url.searchParams.append("redact", value);
  if (options.noDelay !== undefined) url.searchParams.set("no_delay", String(options.noDelay));

  if (options.rawAudioFormat) {
    url.searchParams.set("encoding", assertNonEmpty(options.rawAudioFormat.encoding, "Raw audio encoding"));
    url.searchParams.set(
      "sample_rate",
      String(assertPositiveInteger(options.rawAudioFormat.sampleRate, "Raw audio sampleRate")),
    );
  }

  return url;
}

export function buildDeepgramLiveAttempts(options: DeepgramLiveAttemptOptions): DeepgramLiveAttempt[] {
  const mimeType = options.mimeType?.trim() || "browser default";
  const shared = {
    recognitionConfig: options.recognitionConfig,
    smartFormat: options.smartFormat,
    interimResults: options.interimResults,
    endpointingMs: options.endpointingMs,
    tag: options.tag,
    redact: options.redact,
    noDelay: options.noDelay,
  };
  const attemptAUrl = buildDeepgramListenUrl({ ...shared, vadEvents: true });
  const attemptBUrl = buildDeepgramListenUrl({ ...shared, vadEvents: false });
  const attempts: DeepgramLiveAttempt[] = [
    {
      id: "A",
      number: 1,
      label: "Standard realtime query with VAD events",
      url: attemptAUrl.toString(),
      query: queryRecord(attemptAUrl),
      mimeType,
      usesVadEvents: true,
      audioFormatMode: "container-autodetect",
    },
    {
      id: "B",
      number: 2,
      label: "Simpler realtime query without optional VAD events",
      url: attemptBUrl.toString(),
      query: queryRecord(attemptBUrl),
      mimeType,
      usesVadEvents: false,
      audioFormatMode: "container-autodetect",
    },
  ];

  if (!options.explicitRawFormatAttempt) {
    return attempts;
  }

  const actualMimeType = normalizeMediaRecorderMimeType(options.mimeType ?? "");
  const declaredMimeType = normalizeMediaRecorderMimeType(options.explicitRawFormatAttempt.mimeType);

  if (!actualMimeType || actualMimeType !== declaredMimeType) {
    throw new Error("The optional explicit audio-format attempt must match the actual browser audio MIME type.");
  }

  if (isContainerizedMediaRecorderMimeType(actualMimeType)) {
    throw new Error(
      `Explicit encoding is not valid for containerized MediaRecorder audio (${actualMimeType}). Let Deepgram detect it from the container.`,
    );
  }

  const attemptCUrl = buildDeepgramListenUrl({
    ...shared,
    vadEvents: false,
    rawAudioFormat: options.explicitRawFormatAttempt,
  });
  attempts.push({
    id: "C",
    number: 3,
    label: "Explicit raw audio format",
    url: attemptCUrl.toString(),
    query: queryRecord(attemptCUrl),
    mimeType,
    usesVadEvents: false,
    audioFormatMode: "explicit-raw",
  });

  return attempts;
}

export function deepgramBearerSubprotocols(accessToken: string): ["bearer", string] {
  const token = assertNonEmpty(accessToken, "Deepgram temporary access token");

  if (!/^[A-Za-z0-9._~-]+$/.test(token)) {
    throw new Error("Deepgram returned a temporary token that is not valid for browser WebSocket subprotocol auth.");
  }

  return ["bearer", token];
}

export function parseDeepgramLiveMessage(data: unknown): unknown {
  if (typeof data !== "string") {
    return data;
  }

  try {
    return JSON.parse(data) as unknown;
  } catch {
    return data;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isDeepgramTranscriptEvent(value: unknown) {
  if (!isRecord(value)) {
    return false;
  }

  if (value.type === "Results") {
    return true;
  }

  const channel = value.channel;
  return isRecord(channel) && Array.isArray(channel.alternatives);
}

function defaultWebSocketFactory(url: string, protocols: string[]) {
  if (typeof WebSocket === "undefined") {
    throw new Error("WebSocket is not available in this browser.");
  }

  return new WebSocket(url, protocols);
}

export class DeepgramLiveClient {
  private readonly options: DeepgramLiveClientOptions;
  private readonly attempts: DeepgramLiveAttempt[];
  private readonly connectionTimeoutMs: number;
  private readonly retryDelayMs: number;
  private readonly minimumTokenValidityMs: number;
  private attemptIndex = -1;
  private attemptSerial = 0;
  private attemptSettled = false;
  private stopped = true;
  private receivedAnyMessageForAttempt = false;
  private receivedTranscriptEventForAttempt = false;
  private activeAttemptMetadata: DeepgramLiveAttemptMetadata | null = null;
  private connectionTimeout: ReturnType<typeof setTimeout> | null = null;
  private settleFallbackTimeout: ReturnType<typeof setTimeout> | null = null;
  private retryTimeout: ReturnType<typeof setTimeout> | null = null;
  private _activeSocket: WebSocket | null = null;

  constructor(options: DeepgramLiveClientOptions) {
    this.options = options;
    this.attempts = buildDeepgramLiveAttempts(options).slice(0, options.maxAttempts ?? 3);
    this.connectionTimeoutMs = Math.max(1_000, options.connectionTimeoutMs ?? DEFAULT_CONNECTION_TIMEOUT_MS);
    this.retryDelayMs = Math.max(0, options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);
    this.minimumTokenValidityMs = Math.max(
      this.connectionTimeoutMs + 1_000,
      options.minimumTokenValidityMs ?? 0,
    );
  }

  get activeSocket() {
    return this._activeSocket;
  }

  get currentAttempt() {
    return this.activeAttemptMetadata;
  }

  get receivedAnyMessage() {
    return this.receivedAnyMessageForAttempt;
  }

  get receivedTranscriptEvent() {
    return this.receivedTranscriptEventForAttempt;
  }

  connect() {
    if (this._activeSocket && this._activeSocket.readyState < WEB_SOCKET_CLOSING) {
      return;
    }

    this.clearTimers();
    this.stopped = false;
    this.attemptIndex = 0;
    void this.startAttempt(false);
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    const socket = this._activeSocket;

    if (!socket || socket.readyState !== WEB_SOCKET_OPEN) {
      return false;
    }

    socket.send(data);
    return true;
  }

  close(code = 1000, reason = "Client stopped live transcription") {
    this.stopped = true;
    this.clearTimers();
    const socket = this._activeSocket;

    if (!socket) {
      this.attemptSerial += 1;
      return;
    }

    if (socket.readyState === WEB_SOCKET_CLOSED) {
      this._activeSocket = null;
      return;
    }

    try {
      socket.close(code, reason);
    } catch {
      const metadata = this.activeAttemptMetadata;

      if (metadata) {
        this.settleAttempt(socket, metadata, this.attemptSerial, 1000, reason, false, null);
      } else {
        this._activeSocket = null;
        this.attemptSerial += 1;
      }
    }
  }

  private async startAttempt(forceRefresh: boolean) {
    const attempt = this.attempts[this.attemptIndex];

    if (!attempt || this.stopped) {
      return;
    }

    const serial = ++this.attemptSerial;
    this.attemptSettled = false;
    this.receivedAnyMessageForAttempt = false;
    this.receivedTranscriptEventForAttempt = false;
    const baseMetadata: DeepgramLiveAttemptMetadata = {
      ...attempt,
      startedAt: new Date().toISOString(),
    };
    this.activeAttemptMetadata = baseMetadata;

    try {
      const token = await this.resolveToken(attempt, forceRefresh);

      if (this.stopped || serial !== this.attemptSerial) {
        return;
      }

      const metadata: DeepgramLiveAttemptMetadata = {
        ...baseMetadata,
        tokenAgeMs: token.issuedAtMs === undefined ? undefined : Math.max(0, Date.now() - token.issuedAtMs),
      };
      this.activeAttemptMetadata = metadata;
      this.emitDiagnostic("websocket_connecting", metadata, `Opening Deepgram WebSocket attempt ${attempt.id}.`);

      const socketFactory = this.options.webSocketFactory ?? defaultWebSocketFactory;
      const socket = socketFactory(attempt.url, deepgramBearerSubprotocols(token.accessToken));
      this._activeSocket = socket;
      this.bindSocket(socket, metadata, serial);
      this.armConnectionTimeout(socket, metadata, serial);
    } catch (error) {
      if (this.stopped || serial !== this.attemptSerial) {
        return;
      }

      const metadata = this.activeAttemptMetadata ?? baseMetadata;
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      this.options.onError?.({
        socket: null,
        event: null,
        error: normalizedError,
        attempt: metadata,
        receivedAnyMessage: false,
        receivedTranscriptEvent: false,
      });
      this.emitDiagnostic("websocket_error", metadata, normalizedError.message);
      this.exhaust(metadata, normalizedError.message);
    }
  }

  private async resolveToken(attempt: DeepgramLiveAttempt, forceRefresh: boolean) {
    let token = await this.options.getToken({
      attempt,
      forceRefresh,
      minimumValidityMs: this.minimumTokenValidityMs,
    });

    if (this.hasEnoughTokenValidity(token)) {
      return token;
    }

    token = await this.options.getToken({
      attempt,
      forceRefresh: true,
      minimumValidityMs: this.minimumTokenValidityMs,
    });

    if (!this.hasEnoughTokenValidity(token)) {
      throw new Error("The temporary token would expire before the WebSocket connection timeout. Request a fresh token and retry.");
    }

    return token;
  }

  private hasEnoughTokenValidity(token: DeepgramLiveToken) {
    assertNonEmpty(token.accessToken, "Deepgram temporary access token");
    return token.expiresAtMs === undefined || token.expiresAtMs - Date.now() >= this.minimumTokenValidityMs;
  }

  private bindSocket(socket: WebSocket, metadata: DeepgramLiveAttemptMetadata, serial: number) {
    socket.onopen = (event) => {
      if (!this.isCurrent(socket, serial)) {
        return;
      }

      this.clearConnectionTimeouts();
      this.emitDiagnostic("websocket_open", metadata, `Deepgram WebSocket attempt ${metadata.id} opened.`);
      this.options.onOpen?.({ socket, event, attempt: metadata });
    };

    socket.onmessage = (event) => {
      if (!this.isCurrent(socket, serial)) {
        return;
      }

      const data = parseDeepgramLiveMessage(event.data);
      const transcriptEvent = isDeepgramTranscriptEvent(data);
      this.receivedAnyMessageForAttempt = true;
      this.receivedTranscriptEventForAttempt ||= transcriptEvent;
      this.emitDiagnostic("deepgram_message_received", metadata, "Deepgram sent a live event.");
      this.options.onMessage?.({
        socket,
        event,
        data,
        attempt: metadata,
        isTranscriptEvent: transcriptEvent,
      });
    };

    socket.onerror = (event) => {
      if (!this.isCurrent(socket, serial)) {
        return;
      }

      const error = new Error("The browser reported a Deepgram WebSocket error. Browser WebSocket APIs do not expose the HTTP failure body.");
      this.emitDiagnostic("websocket_error", metadata, error.message);
      this.options.onError?.({
        socket,
        event,
        error,
        attempt: metadata,
        receivedAnyMessage: this.receivedAnyMessageForAttempt,
        receivedTranscriptEvent: this.receivedTranscriptEventForAttempt,
      });
      this.armSettleFallback(socket, metadata, serial, "WebSocket error did not produce a close event.");
    };

    socket.onclose = (event) => {
      if (!this.isCurrent(socket, serial)) {
        return;
      }

      this.settleAttempt(socket, metadata, serial, event.code, event.reason, event.wasClean, event);
    };
  }

  private armConnectionTimeout(socket: WebSocket, metadata: DeepgramLiveAttemptMetadata, serial: number) {
    this.connectionTimeout = setTimeout(() => {
      if (!this.isCurrent(socket, serial) || socket.readyState === WEB_SOCKET_OPEN) {
        return;
      }

      const error = new Error(`Deepgram WebSocket attempt ${metadata.id} did not open within ${this.connectionTimeoutMs}ms.`);
      this.emitDiagnostic("websocket_error", metadata, error.message);
      this.options.onError?.({
        socket,
        event: null,
        error,
        attempt: metadata,
        receivedAnyMessage: this.receivedAnyMessageForAttempt,
        receivedTranscriptEvent: this.receivedTranscriptEventForAttempt,
      });

      try {
        socket.close(4000, "Connection timeout");
      } catch {
        // The synthetic close below still advances the bounded attempt sequence.
      }

      this.armSettleFallback(socket, metadata, serial, "Connection timed out before the browser emitted a close event.");
    }, this.connectionTimeoutMs);
  }

  private armSettleFallback(socket: WebSocket, metadata: DeepgramLiveAttemptMetadata, serial: number, reason: string) {
    if (this.settleFallbackTimeout) {
      return;
    }

    this.settleFallbackTimeout = setTimeout(() => {
      if (!this.isCurrent(socket, serial) || this.attemptSettled) {
        return;
      }

      try {
        if (socket.readyState !== WEB_SOCKET_CLOSED) {
          socket.close(4001, "WebSocket failure");
        }
      } catch {
        // Continue with a browser-safe synthetic 1006-style close summary.
      }

      this.settleAttempt(socket, metadata, serial, 1006, reason, false, null);
    }, 750);
  }

  private settleAttempt(
    socket: WebSocket,
    metadata: DeepgramLiveAttemptMetadata,
    serial: number,
    code: number,
    reason: string,
    wasClean: boolean,
    event: CloseEvent | null,
  ) {
    if (!this.isCurrent(socket, serial) || this.attemptSettled) {
      return;
    }

    this.attemptSettled = true;
    this.clearConnectionTimeouts();
    const hasNextAttempt = this.attemptIndex + 1 < this.attempts.length;
    const closedBeforeTranscript = !this.receivedTranscriptEventForAttempt;
    const recoverableClose = code !== 1000 || (!this.stopped && closedBeforeTranscript);
    const willRetry = !this.stopped && recoverableClose && closedBeforeTranscript && hasNextAttempt;
    const closeMessage =
      code === 1006
        ? "The browser could not complete or maintain the Deepgram WebSocket connection."
        : code === 1000 && closedBeforeTranscript
          ? "The Deepgram WebSocket closed before a transcript event was received."
        : `Deepgram WebSocket closed with code ${code}.`;

    this.emitDiagnostic("websocket_close", metadata, closeMessage, {
      closeCode: code,
      closeReason: reason,
      wasClean,
      willRetry,
    });
    this.options.onClose?.({
      socket,
      event,
      attempt: metadata,
      code,
      reason,
      wasClean,
      willRetry,
      receivedAnyMessage: this.receivedAnyMessageForAttempt,
      receivedTranscriptEvent: this.receivedTranscriptEventForAttempt,
    });
    this._activeSocket = null;

    if (willRetry) {
      this.attemptIndex += 1;
      const nextAttempt = this.attempts[this.attemptIndex];
      this.emitDiagnostic(
        "websocket_retry_scheduled",
        metadata,
        `Live WebSocket failed before transcript events arrived. Retrying once with attempt ${nextAttempt.id}.`,
        { willRetry: true },
      );
      this.retryTimeout = setTimeout(() => {
        this.retryTimeout = null;
        // Provider documentation does not establish temporary-token replay or
        // concurrent-use semantics. Every socket attempt therefore requires a
        // fresh token and a fresh ONE admission decision.
        void this.startAttempt(true);
      }, this.retryDelayMs);
      return;
    }

    if (!this.stopped && recoverableClose) {
      this.exhaust(metadata, closeMessage);
    }
  }

  private exhaust(metadata: DeepgramLiveAttemptMetadata, message: string) {
    this.stopped = true;
    this.clearTimers();
    this.emitDiagnostic("websocket_attempts_exhausted", metadata, message, { willRetry: false });
    this.options.onExhausted?.({
      attempt: metadata,
      message,
      receivedAnyMessage: this.receivedAnyMessageForAttempt,
      receivedTranscriptEvent: this.receivedTranscriptEventForAttempt,
    });
  }

  private isCurrent(socket: WebSocket, serial: number) {
    return serial === this.attemptSerial && socket === this._activeSocket;
  }

  private emitDiagnostic(
    type: DeepgramLiveDiagnosticType,
    attempt: DeepgramLiveAttemptMetadata,
    message: string,
    details: Partial<
      Pick<DeepgramLiveDiagnostic, "closeCode" | "closeReason" | "wasClean" | "willRetry">
    > = {},
  ) {
    this.options.onDiagnostic?.({
      type,
      at: new Date().toISOString(),
      attempt,
      message,
      receivedAnyMessage: this.receivedAnyMessageForAttempt,
      receivedTranscriptEvent: this.receivedTranscriptEventForAttempt,
      ...details,
    });
  }

  private clearConnectionTimeouts() {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }

    if (this.settleFallbackTimeout) {
      clearTimeout(this.settleFallbackTimeout);
      this.settleFallbackTimeout = null;
    }
  }

  private clearTimers() {
    this.clearConnectionTimeouts();

    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
  }
}

export function createDeepgramLiveClient(options: DeepgramLiveClientOptions) {
  return new DeepgramLiveClient(options);
}
