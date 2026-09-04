import { EventEmitter } from "node:events";

import { expect, test } from "@playwright/test";

import { readReson8ServerCredential } from "../../src/lib/providers/reson8/live-credential";
import {
  RESON8_PRERECORDED_ENDPOINT,
  RESON8_REALTIME_DECODER_VERSION,
  RESON8_REALTIME_FLUSH_ID,
  RESON8_REALTIME_ENDPOINT,
  RESON8_TURNS_ENDPOINT,
  Reson8LiveTransportError,
  createReson8LivePrerecordedTransport,
  decodeReson8RealtimeSocketMessage,
  runReson8LiveRealtime,
  runReson8LiveTurns,
  type Reson8WebSocketFactory,
  type Reson8WebSocketLike,
} from "../../src/lib/providers/reson8/live-transport";
import { createReson8PcmWavFixture } from "../../src/lib/providers/reson8";
import { createReson8PrerecordedSttAdapter } from "../../src/lib/providers/reson8/prerecorded";

const TEST_SECRET = "unit-only-reson8-transport-secret";
const EXPECTED_PHRASE = "This is a short speech recognition test. The recording contains no personal information.";

class FakeSocket extends EventEmitter {
  bufferedAmount = 0;
  readyState = 1;
  readonly sent: Array<Uint8Array | string> = [];
  private readonly mode: "realtime" | "turns";

  constructor(mode: "realtime" | "turns") {
    super();
    this.mode = mode;
    queueMicrotask(() => this.emit("open"));
  }

  send(data: Uint8Array | string, callback?: (error?: Error) => void): void {
    this.sent.push(data);
    callback?.();
    if (typeof data !== "string") return;
    queueMicrotask(() => {
      if (this.mode === "realtime") {
        this.emit("message", JSON.stringify({ type: "transcript", text: "ONE Voice", is_final: false }), false);
        this.emit("message", JSON.stringify({ type: "transcript", text: EXPECTED_PHRASE, is_final: true }), false);
        this.emit("message", JSON.stringify({ type: "flush_confirmation", id: "one-live-contract-check" }), false);
      } else {
        this.emit("message", JSON.stringify({ type: "turn_start" }), false);
        this.emit("message", JSON.stringify({ type: "turn_end_candidate", text: "ONE Voice" }), false);
        this.emit("message", JSON.stringify({ type: "turn_end_candidate", text: EXPECTED_PHRASE }), false);
        this.emit("message", JSON.stringify({ type: "turn_end" }), false);
      }
    });
  }

  close(): void {
    this.readyState = 3;
    queueMicrotask(() => this.emit("close", 1000, Buffer.from("complete")));
  }

  terminate(): void {
    this.readyState = 3;
  }
}

function credential() {
  const value = readReson8ServerCredential({ RESON8_API_KEY: TEST_SECRET });
  if (!value) throw new Error("Test credential fixture was not created.");
  return value;
}

test.describe("Reson8 manual live transports", () => {
  test("pins prerecorded transport to the official endpoint and sends the key only in the server header", async () => {
    const calls: Array<{ url: string; authorization: string | null; bodyBytes: number }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      const body = init?.body as ArrayBuffer;
      calls.push({
        url,
        authorization: headers.get("authorization"),
        bodyBytes: body.byteLength,
      });
      return new Response(JSON.stringify({ text: EXPECTED_PHRASE, language: "en" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const adapter = createReson8PrerecordedSttAdapter(
      createReson8LivePrerecordedTransport(credential(), { fetcher }),
    );
    const audio = createReson8PcmWavFixture();
    const result = await adapter.execute({
      file: new File([audio.slice().buffer], "input.wav", { type: "audio/wav" }),
    }, { timeoutMilliseconds: 1_000 });

    expect(result.transcript).toBe(EXPECTED_PHRASE);
    expect(calls).toHaveLength(1);
    expect(calls[0].url.startsWith(RESON8_PRERECORDED_ENDPOINT)).toBe(true);
    expect(calls[0].url).not.toContain(TEST_SECRET);
    expect(calls[0].authorization).toBe(`ApiKey ${TEST_SECRET}`);
    expect(calls[0].bodyBytes).toBe(audio.byteLength);
  });

  test("normalizes HTTP auth, credit, and concurrency denials without reading provider bodies or retrying", async () => {
    for (const failure of [
      { status: 401, code: "authentication-denied" },
      { status: 402, code: "credits-exhausted" },
      { status: 429, code: "concurrency-limited" },
    ]) {
      let calls = 0;
      const fetcher: typeof fetch = async () => {
        calls += 1;
        return new Response(`secret upstream body ${TEST_SECRET}`, { status: failure.status });
      };
      const adapter = createReson8PrerecordedSttAdapter(
        createReson8LivePrerecordedTransport(credential(), { fetcher }),
      );
      const audio = createReson8PcmWavFixture();
      const error = await adapter.execute({
        file: new File([audio.slice().buffer], "input.wav", { type: "audio/wav" }),
      }, { timeoutMilliseconds: 1_000 }).catch((value: unknown) => value);
      expect(calls).toBe(1);
      expect(error).toMatchObject({ code: failure.code });
      expect(JSON.stringify(error)).not.toContain(TEST_SECRET);
      expect(JSON.stringify(error)).not.toContain("upstream body");
    }
  });

  test("streams the same bounded WAV sequentially through realtime and Turns normalizers", async () => {
    const endpoints: string[] = [];
    const sockets: FakeSocket[] = [];
    const socketFactory: Reson8WebSocketFactory = (endpoint, options) => {
      endpoints.push(endpoint);
      expect(endpoint).not.toContain(TEST_SECRET);
      expect(options.headers.get("authorization")).toBe(`ApiKey ${TEST_SECRET}`);
      expect(options.maxPayloadBytes).toBe(1024 * 1024);
      const socket = new FakeSocket(endpoint.includes("/turns") ? "turns" : "realtime");
      sockets.push(socket);
      return socket as unknown as Reson8WebSocketLike;
    };
    const audio = createReson8PcmWavFixture();
    const realtime = await runReson8LiveRealtime({
      audio,
      credential: credential(),
      timeoutMilliseconds: 1_000,
    }, { socketFactory });
    const turns = await runReson8LiveTurns({
      audio,
      credential: credential(),
      timeoutMilliseconds: 1_000,
    }, { socketFactory });

    expect(endpoints).toHaveLength(2);
    expect(endpoints[0].startsWith(RESON8_REALTIME_ENDPOINT)).toBe(true);
    const realtimeEndpoint = new URL(endpoints[0]);
    expect(realtimeEndpoint.searchParams.get("encoding")).toBe("auto");
    expect(realtimeEndpoint.searchParams.get("include_interim")).toBe("true");
    expect([...realtimeEndpoint.searchParams.keys()].sort()).toEqual(["encoding", "include_interim"]);
    expect(endpoints[1].startsWith(RESON8_TURNS_ENDPOINT)).toBe(true);
    expect(realtime.events.map((event) => event.type)).toEqual([
      "partial-transcript", "final-transcript", "flush-confirmed",
    ]);
    expect(turns.events.map((event) => event.type)).toEqual([
      "turn-start", "turn-end-candidate", "turn-end-candidate", "turn-end",
    ]);
    expect(turns.turnCompletion).toEqual({
      strategy: "last-turn-end-after-audio-then-flush",
      allAudioSent: true,
      flushSent: true,
      finalActiveTurnFinalized: true,
    });
    expect(sockets.every((socket) => socket.sent.filter((value) => value instanceof Uint8Array).length === 1)).toBe(true);
    expect(sockets.every((socket) => socket.sent.filter((value) => typeof value === "string").length === 1)).toBe(true);
  });

  test("decodes every supported Node WebSocket text representation exactly once", () => {
    const json = JSON.stringify({ type: "transcript", text: "recognized text" });
    const bytes = Buffer.from(json, "utf8");
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const cases = [
      { input: json, representation: "string" },
      { input: bytes, representation: "buffer" },
      { input: arrayBuffer, representation: "array-buffer" },
      { input: [bytes.subarray(0, 8), bytes.subarray(8)], representation: "fragmented-buffer" },
    ] as const;

    for (const entry of cases) {
      const decoded = decodeReson8RealtimeSocketMessage(entry.input, false);
      expect(decoded.value).toEqual({ type: "transcript", text: "recognized text" });
      expect(decoded.diagnostic).toMatchObject({
        transportPayloadRepresentation: entry.representation,
        utf8DecodingSucceeded: true,
        jsonParsingSucceeded: true,
        parsedEventType: "transcript",
        topLevelFieldNames: ["text", "type"],
        topLevelValueTypes: { text: "string", type: "string" },
        schemaIssues: [],
        decoderVersion: RESON8_REALTIME_DECODER_VERSION,
      });
    }
  });

  test("rejects binary, malformed UTF-8, malformed JSON, wrappers, and unknown event types with sanitized diagnostics", () => {
    const cases = [
      { input: Buffer.from("{}"), binary: true, code: "unexpected_binary_frame", utf8: false, json: false },
      { input: Buffer.from([0xc3, 0x28]), binary: false, code: "invalid_utf8", utf8: false, json: false },
      { input: Buffer.from("{"), binary: false, code: "invalid_json", utf8: true, json: false },
      { input: { data: Buffer.from("{}") }, binary: false, code: "unsupported_payload_representation", utf8: false, json: false },
      { input: JSON.stringify({ type: "future_event", private_value: "must-not-appear" }), binary: false, code: "unsupported_provider_event", utf8: true, json: true },
    ] as const;

    for (const entry of cases) {
      const error = (() => {
        try {
          decodeReson8RealtimeSocketMessage(entry.input, entry.binary);
          return null;
        } catch (value) {
          return value;
        }
      })();
      expect(error).toBeInstanceOf(Reson8LiveTransportError);
      expect(error).toMatchObject({
        schemaDiagnostic: {
          utf8DecodingSucceeded: entry.utf8,
          jsonParsingSucceeded: entry.json,
          schemaIssues: [{ code: entry.code }],
        },
      });
      expect(JSON.stringify(error)).not.toContain("must-not-appear");
      expect(JSON.stringify(error)).not.toContain(TEST_SECRET);
    }
  });

  test("accepts the official minimal and conditional transcript variants without requiring unrequested fields", () => {
    const variants = [
      { type: "transcript", text: "recognized text" },
      { type: "transcript", text: "partial", is_final: false, language: "" },
      { type: "transcript", text: "final", is_final: true, language: "en" },
      { type: "transcript", text: "timed", start_ms: 0, duration_ms: 25 },
      { type: "transcript", text: "speaker", speaker_id: 0 },
      {
        type: "transcript",
        text: "words",
        words: [{ text: "words", start_ms: 0, duration_ms: 25, confidence: 0.99 }],
      },
    ];
    for (const variant of variants) {
      expect(decodeReson8RealtimeSocketMessage(JSON.stringify(variant), false).value).toEqual(variant);
    }

    for (const invalid of [
      { type: "transcript", text: 42 },
      { type: "transcript", text: "words", words: "wrong" },
      { type: "transcript", text: "confidence", words: [{ text: "confidence", confidence: 0 }] },
    ]) {
      expect(() => decodeReson8RealtimeSocketMessage(JSON.stringify(invalid), false))
        .toThrow(Reson8LiveTransportError);
    }
  });

  test("accepts nullable flush IDs in the official schema and rejects missing or wrongly typed IDs", () => {
    expect(decodeReson8RealtimeSocketMessage(JSON.stringify({
      type: "flush_confirmation",
      id: RESON8_REALTIME_FLUSH_ID,
    }), false).value).toEqual({ type: "flush_confirmation", id: RESON8_REALTIME_FLUSH_ID });
    expect(decodeReson8RealtimeSocketMessage(JSON.stringify({
      type: "flush_confirmation",
      id: null,
    }), false).value).toEqual({ type: "flush_confirmation", id: null });
    for (const invalid of [
      { type: "flush_confirmation" },
      { type: "flush_confirmation", id: 12 },
    ]) {
      expect(() => decodeReson8RealtimeSocketMessage(JSON.stringify(invalid), false))
        .toThrow(Reson8LiveTransportError);
    }
  });

  test("accepts final-only, interim/final, and confirmation-before-transcript realtime flows", async () => {
    const flows = [
      [
        { type: "transcript", text: EXPECTED_PHRASE },
        { type: "flush_confirmation", id: RESON8_REALTIME_FLUSH_ID },
      ],
      [
        { type: "transcript", text: "", language: "", is_final: false },
        { type: "transcript", text: "short", language: "", is_final: false },
        { type: "transcript", text: "short", language: "", is_final: false },
        { type: "transcript", text: EXPECTED_PHRASE, language: "en", is_final: true },
        { type: "flush_confirmation", id: RESON8_REALTIME_FLUSH_ID },
      ],
      [
        { type: "flush_confirmation", id: RESON8_REALTIME_FLUSH_ID },
        { type: "transcript", text: EXPECTED_PHRASE, is_final: true },
      ],
    ];

    for (const messages of flows) {
      const socketFactory: Reson8WebSocketFactory = () => {
        const socket = new FakeSocket("realtime");
        socket.send = (data, callback) => {
          callback?.();
          if (typeof data !== "string") return;
          queueMicrotask(() => {
            for (const message of messages) {
              socket.emit("message", Buffer.from(JSON.stringify(message)), false);
            }
          });
        };
        return socket as unknown as Reson8WebSocketLike;
      };
      const result = await runReson8LiveRealtime({
        audio: createReson8PcmWavFixture(),
        credential: credential(),
        timeoutMilliseconds: 1_000,
      }, { socketFactory });
      expect(result.events.some((event) => event.type === "final-transcript")).toBe(true);
      expect(result.events.some((event) => event.type === "flush-confirmed")).toBe(true);
    }
  });

  test("rejects empty final evidence and mismatched flush correlation without weakening their official schemas", async () => {
    for (const messages of [
      [
        { type: "transcript", text: "", is_final: true },
        { type: "flush_confirmation", id: RESON8_REALTIME_FLUSH_ID },
      ],
      [
        { type: "transcript", text: EXPECTED_PHRASE, is_final: true },
        { type: "flush_confirmation", id: "different-id" },
      ],
      [
        { type: "transcript", text: EXPECTED_PHRASE, is_final: true },
        { type: "flush_confirmation", id: null },
      ],
    ]) {
      const socketFactory: Reson8WebSocketFactory = () => {
        const socket = new FakeSocket("realtime");
        socket.send = (data, callback) => {
          callback?.();
          if (typeof data !== "string") return;
          queueMicrotask(() => {
            for (const message of messages) socket.emit("message", JSON.stringify(message), false);
          });
        };
        return socket as unknown as Reson8WebSocketLike;
      };
      const error = await runReson8LiveRealtime({
        audio: createReson8PcmWavFixture(),
        credential: credential(),
        timeoutMilliseconds: 1_000,
      }, { socketFactory }).catch((value: unknown) => value);
      expect(error).toMatchObject({
        code: "malformed-provider-response",
        schemaDiagnostic: {
          utf8DecodingSucceeded: true,
          jsonParsingSucceeded: true,
        },
      });
    }
  });

  test("preserves parsed event evidence when a later provider message is malformed", async () => {
    const socketFactory: Reson8WebSocketFactory = () => {
      const socket = new FakeSocket("realtime");
      socket.send = (data, callback) => {
        callback?.();
        if (typeof data !== "string") return;
        queueMicrotask(() => {
          socket.emit("message", JSON.stringify({
            type: "transcript",
            text: EXPECTED_PHRASE,
            is_final: true,
          }), false);
          socket.emit("message", JSON.stringify({ type: "transcript", text: 42 }), false);
          socket.emit("message", JSON.stringify({
            type: "flush_confirmation",
            id: RESON8_REALTIME_FLUSH_ID,
          }), false);
        });
      };
      return socket as unknown as Reson8WebSocketLike;
    };
    const error = await runReson8LiveRealtime({
      audio: createReson8PcmWavFixture(),
      credential: credential(),
      timeoutMilliseconds: 1_000,
    }, { socketFactory }).catch((value: unknown) => value);

    expect(error).toMatchObject({
      code: "malformed-provider-response",
      parsedEventTypes: ["final-transcript", "flush-confirmed"],
      transportCompletedCleanly: true,
      schemaDiagnostic: {
        parsedEventType: "transcript",
        topLevelFieldNames: ["text", "type"],
        topLevelValueTypes: { text: "number", type: "string" },
        schemaIssues: [{ path: "text", code: "invalid_type", expectedType: "string", receivedType: "number" }],
      },
    });
    expect(JSON.stringify(error)).not.toContain(EXPECTED_PHRASE);
  });

  test("fails safely on WebSocket upgrade denial, malformed events, and pre-aborted sessions with no reconnect", async () => {
    let factories = 0;
    const creditFactory: Reson8WebSocketFactory = () => {
      factories += 1;
      const socket = new FakeSocket("realtime");
      queueMicrotask(() => socket.emit("unexpected-response", {}, { statusCode: 402, destroy: () => undefined }));
      return socket as unknown as Reson8WebSocketLike;
    };
    await expect(runReson8LiveRealtime({
      audio: createReson8PcmWavFixture(),
      credential: credential(),
      timeoutMilliseconds: 1_000,
    }, { socketFactory: creditFactory })).rejects.toMatchObject({ code: "credits-exhausted" });
    expect(factories).toBe(1);

    let malformedFactories = 0;
    const malformedFactory: Reson8WebSocketFactory = () => {
      malformedFactories += 1;
      const socket = new FakeSocket("realtime");
      socket.send = (_data, callback) => {
        callback?.();
        queueMicrotask(() => socket.emit("message", "{", false));
      };
      return socket as unknown as Reson8WebSocketLike;
    };
    await expect(runReson8LiveRealtime({
      audio: createReson8PcmWavFixture(),
      credential: credential(),
      timeoutMilliseconds: 1_000,
    }, { socketFactory: malformedFactory })).rejects.toMatchObject({ code: "malformed-provider-response" });
    expect(malformedFactories).toBe(1);

    const controller = new AbortController();
    controller.abort();
    let abortedFactories = 0;
    await expect(runReson8LiveTurns({
      audio: createReson8PcmWavFixture(),
      credential: credential(),
      signal: controller.signal,
      timeoutMilliseconds: 1_000,
    }, { socketFactory: () => {
      abortedFactories += 1;
      return new FakeSocket("turns") as unknown as Reson8WebSocketLike;
    } })).rejects.toBeInstanceOf(Reson8LiveTransportError);
    expect(abortedFactories).toBe(0);
  });

  test("keeps a terminal session monotonic when a provider frame races with close", async () => {
    let factories = 0;
    const socketFactory: Reson8WebSocketFactory = () => {
      factories += 1;
      const socket = new FakeSocket("realtime");
      socket.send = (data, callback) => {
        callback?.();
        if (typeof data !== "string") return;
        queueMicrotask(() => {
          socket.emit("message", JSON.stringify({
            type: "transcript",
            text: EXPECTED_PHRASE,
            is_final: true,
          }), false);
          socket.emit("message", JSON.stringify({
            type: "flush_confirmation",
            id: "one-live-contract-check",
          }), false);
          socket.emit("message", JSON.stringify({
            type: "transcript",
            text: "late frame must be ignored",
            is_final: false,
          }), false);
        });
      };
      return socket as unknown as Reson8WebSocketLike;
    };

    const result = await runReson8LiveRealtime({
      audio: createReson8PcmWavFixture(),
      credential: credential(),
      timeoutMilliseconds: 1_000,
    }, { socketFactory });

    expect(factories).toBe(1);
    expect(result.events.map((event) => event.type)).toEqual([
      "final-transcript",
      "flush-confirmed",
    ]);
  });

  test("does not let a first turn_end before sender completion suppress a later confirmed turn", async () => {
    let flushSent = false;
    const socketFactory: Reson8WebSocketFactory = () => {
      const socket = new FakeSocket("turns");
      socket.send = (data, callback) => {
        if (typeof data === "string") {
          flushSent = true;
          callback?.();
          queueMicrotask(() => {
            socket.emit("message", JSON.stringify({ type: "turn_start" }), false);
            socket.emit("message", JSON.stringify({
              type: "turn_end_candidate",
              text: "second confirmed turn",
            }), false);
            socket.emit("message", JSON.stringify({ type: "turn_end" }), false);
          });
          return;
        }
        socket.emit("message", JSON.stringify({ type: "turn_start" }), false);
        socket.emit("message", JSON.stringify({
          type: "turn_end_candidate",
          text: "first confirmed turn",
        }), false);
        socket.emit("message", JSON.stringify({ type: "turn_end" }), false);
        callback?.();
      };
      return socket as unknown as Reson8WebSocketLike;
    };

    const result = await runReson8LiveTurns({
      audio: createReson8PcmWavFixture(),
      credential: credential(),
      timeoutMilliseconds: 1_000,
    }, { socketFactory });

    expect(flushSent).toBe(true);
    expect(result.events.map((event) => event.type)).toEqual([
      "turn-start",
      "turn-end-candidate",
      "turn-end",
      "turn-start",
      "turn-end-candidate",
      "turn-end",
    ]);
    expect(result.events.filter((event) => event.type === "turn-end").map((event) => (
      event.type === "turn-end" ? event.transcript.text : ""
    ))).toEqual(["first confirmed turn", "second confirmed turn"]);
    expect(result.turnCompletion?.allAudioSent).toBe(true);
    expect(result.turnCompletion?.flushSent).toBe(true);
    expect(result.turnCompletion?.finalActiveTurnFinalized).toBe(true);
  });

  test("times out when Turns flush has no active turn and no post-sender finalization", async () => {
    const socketFactory: Reson8WebSocketFactory = () => {
      const socket = new FakeSocket("turns");
      socket.send = (_data, callback) => { callback?.(); };
      return socket as unknown as Reson8WebSocketLike;
    };

    await expect(runReson8LiveTurns({
      audio: createReson8PcmWavFixture(),
      credential: credential(),
      timeoutMilliseconds: 20,
    }, { socketFactory })).rejects.toMatchObject({ code: "timed-out" });
  });

  test("does not report a terminal event followed by an abnormal close as success", async () => {
    const socketFactory: Reson8WebSocketFactory = () => {
      const socket = new FakeSocket("realtime");
      socket.close = () => {
        socket.readyState = 3;
        queueMicrotask(() => socket.emit("close", 1011, Buffer.from("provider failure")));
      };
      return socket as unknown as Reson8WebSocketLike;
    };

    await expect(runReson8LiveRealtime({
      audio: createReson8PcmWavFixture(),
      credential: credential(),
      timeoutMilliseconds: 1_000,
    }, { socketFactory })).rejects.toMatchObject({ code: "unexpected-close" });
  });

  test("times out and cancels in-flight sockets without reconnecting", async () => {
    let timeoutFactories = 0;
    let timeoutTerminations = 0;
    const timeoutFactory: Reson8WebSocketFactory = () => {
      timeoutFactories += 1;
      const socket = new FakeSocket("realtime");
      socket.send = (_data, callback) => { callback?.(); };
      socket.terminate = () => {
        timeoutTerminations += 1;
        socket.readyState = 3;
      };
      return socket as unknown as Reson8WebSocketLike;
    };
    await expect(runReson8LiveRealtime({
      audio: createReson8PcmWavFixture(),
      credential: credential(),
      timeoutMilliseconds: 20,
    }, { socketFactory: timeoutFactory })).rejects.toMatchObject({ code: "timed-out" });
    expect(timeoutFactories).toBe(1);
    expect(timeoutTerminations).toBe(1);

    const controller = new AbortController();
    let cancelFactories = 0;
    let cancelTerminations = 0;
    const cancelFactory: Reson8WebSocketFactory = () => {
      cancelFactories += 1;
      const socket = new FakeSocket("turns");
      socket.send = (_data, callback) => { callback?.(); };
      socket.terminate = () => {
        cancelTerminations += 1;
        socket.readyState = 3;
      };
      queueMicrotask(() => controller.abort());
      return socket as unknown as Reson8WebSocketLike;
    };
    await expect(runReson8LiveTurns({
      audio: createReson8PcmWavFixture(),
      credential: credential(),
      signal: controller.signal,
      timeoutMilliseconds: 1_000,
    }, { socketFactory: cancelFactory })).rejects.toMatchObject({ code: "cancelled" });
    expect(cancelFactories).toBe(1);
    expect(cancelTerminations).toBe(1);
  });

  test("rejects event-count and cumulative response floods without reconnecting", async () => {
    for (const scenario of ["event-count", "cumulative-bytes"] as const) {
      let factories = 0;
      const socketFactory: Reson8WebSocketFactory = () => {
        factories += 1;
        const socket = new FakeSocket("realtime");
        socket.send = (data, callback) => {
          callback?.();
          if (typeof data !== "string") return;
          queueMicrotask(() => {
            const count = scenario === "event-count" ? 129 : 40;
            const text = scenario === "event-count" ? "bounded" : "x".repeat(60_000);
            for (let index = 0; index < count; index += 1) {
              socket.emit("message", JSON.stringify({
                type: "transcript",
                text,
                is_final: false,
              }), false);
            }
          });
        };
        return socket as unknown as Reson8WebSocketLike;
      };

      await expect(runReson8LiveRealtime({
        audio: createReson8PcmWavFixture(),
        credential: credential(),
        timeoutMilliseconds: 1_000,
      }, { socketFactory })).rejects.toMatchObject({ code: "response-too-large" });
      expect(factories).toBe(1);
    }
  });
});
