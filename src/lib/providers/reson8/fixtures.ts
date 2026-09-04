import { getProviderCatalogEntry } from "@/lib/providers/catalog";
import type {
  ProviderContractCandidate,
  ProviderFixtureAdapter,
} from "@/lib/providers/contract-test-kit";
import {
  normalizedStreamingSttEventSchema,
  reconnectDispositionForStreamingClose,
  type NormalizedStreamingSttEvent,
  type StreamingSttEventContext,
} from "@/lib/providers/streaming-stt";
import { normalizedTurnAwareSttEventSchema, type NormalizedTurnAwareSttEvent } from "@/lib/providers/turn-aware-stt";
import {
  RESON8_ADAPTER_VERSION,
  RESON8_PROVIDER_ID,
} from "@/lib/providers/reson8/protocol";
import { createReson8PrerecordedSttAdapter } from "@/lib/providers/reson8/prerecorded";
import { normalizeReson8RealtimeEvent } from "@/lib/providers/reson8/realtime";
import { createReson8TurnAwareSttEventAdapter } from "@/lib/providers/reson8/turns";

const FIXTURE_OBSERVED_AT = "2026-08-28T12:00:00.000Z";
const DEFAULT_FIXTURE_TEXT = "ONE fixture transcription is deterministic and does not represent provider performance.";

function context(sequence: number, offset: number): StreamingSttEventContext {
  return Object.freeze({
    providerId: RESON8_PROVIDER_ID,
    sequence,
    observedAt: FIXTURE_OBSERVED_AT,
    monotonicOffsetMilliseconds: offset,
    provenance: "synthetic-fixture",
  });
}

function assertFixtureActive(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("The Reson8 fixture was cancelled.", "AbortError");
  }
}

function fixtureText(value: string | undefined): string {
  const text = value?.trim() || DEFAULT_FIXTURE_TEXT;
  if (text.length > 1_000) throw new Error("Reson8 fixture text is limited to 1000 characters.");
  return text;
}

/** Creates a small canonical PCM WAV fixture; it is synthetic silence, not user audio. */
export function createReson8PcmWavFixture(): Uint8Array {
  const sampleRate = 16_000;
  const channels = 1;
  const bitsPerSample = 16;
  const sampleCount = 320;
  const dataBytes = sampleCount * channels * (bitsPerSample / 8);
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index);
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * (bitsPerSample / 8), true);
  view.setUint16(32, channels * (bitsPerSample / 8), true);
  view.setUint16(34, bitsPerSample, true);
  ascii(36, "data");
  view.setUint32(40, dataBytes, true);
  return bytes;
}

export function buildReson8RealtimeFixtureEvents(text = DEFAULT_FIXTURE_TEXT): readonly NormalizedStreamingSttEvent[] {
  const finalText = fixtureText(text);
  const partialText = finalText.slice(0, Math.max(1, Math.ceil(finalText.length / 2)));
  const opened = normalizedStreamingSttEventSchema.parse({ ...context(0, 0), type: "session-opened" });
  const ready = normalizedStreamingSttEventSchema.parse({ ...context(1, 1), type: "session-ready" });
  const partial = normalizeReson8RealtimeEvent({
    type: "transcript",
    text: partialText,
    language: "en",
    is_final: false,
    start_ms: 0,
    duration_ms: 250,
    words: [{ text: partialText, start_ms: 0, duration_ms: 250, confidence: 0.9 }],
  }, context(2, 10));
  const final = normalizeReson8RealtimeEvent({
    type: "transcript",
    text: finalText,
    language: "en",
    is_final: true,
    start_ms: 0,
    duration_ms: 500,
    words: [{ text: finalText, start_ms: 0, duration_ms: 500, confidence: 0.95 }],
  }, context(3, 20));
  const flush = normalizeReson8RealtimeEvent({ type: "flush_confirmation", id: "fixture-flush-1" }, context(4, 21));
  const closed = normalizedStreamingSttEventSchema.parse({
    ...context(5, 22),
    type: "session-closed",
    reason: "completed",
    clean: true,
    reconnect: "not-required",
  });
  return Object.freeze([opened, ready, partial, final, flush, closed]);
}

export function buildReson8TurnFixtureEvents(text = DEFAULT_FIXTURE_TEXT): readonly NormalizedTurnAwareSttEvent[] {
  const finalText = fixtureText(text);
  const firstCandidate = finalText.slice(0, Math.max(1, Math.ceil(finalText.length / 2)));
  const adapter = createReson8TurnAwareSttEventAdapter();
  const events = [
    normalizedTurnAwareSttEventSchema.parse({ ...context(0, 0), type: "session-opened" }),
    normalizedTurnAwareSttEventSchema.parse({ ...context(1, 1), type: "session-ready" }),
    adapter.normalizeProviderEvent({ type: "turn_start" }, context(2, 2)),
    adapter.normalizeProviderEvent({
      type: "turn_end_candidate",
      text: firstCandidate,
      language: "en",
      start_ms: 0,
      duration_ms: 250,
      words: [{ text: firstCandidate, start_ms: 0, duration_ms: 250 }],
    }, context(3, 10)),
    adapter.normalizeProviderEvent({
      type: "turn_end_candidate",
      text: finalText,
      language: "en",
      start_ms: 0,
      duration_ms: 500,
      words: [{ text: finalText, start_ms: 0, duration_ms: 500 }],
    }, context(4, 20)),
    adapter.normalizeProviderEvent({ type: "turn_end" }, context(5, 21)),
    normalizedTurnAwareSttEventSchema.parse({
      ...context(6, 22),
      type: "session-closed",
      reason: "completed",
      clean: true,
      reconnect: "not-required",
    }),
  ];
  return Object.freeze(events);
}

export const RESON8_PROTOCOL_FIXTURES = Object.freeze({
  malformedRealtimeMessage: Object.freeze({ type: "transcript", text: 42 }),
  malformedTurnMessage: Object.freeze({ type: "turn_end_candidate", speaker_id: 0 }),
  providerWarning: Object.freeze(normalizedStreamingSttEventSchema.parse({
    ...context(90, 900),
    type: "provider-warning",
    code: "fixture-warning",
    message: "Synthetic warning used to verify normalized warning handling.",
  })),
  providerError: Object.freeze(normalizedStreamingSttEventSchema.parse({
    ...context(91, 901),
    type: "provider-error",
    code: "fixture-error",
    message: "Synthetic error used to verify normalized error handling.",
    retryable: false,
  })),
  unexpectedClose: Object.freeze(normalizedStreamingSttEventSchema.parse({
    ...context(92, 902),
    type: "session-closed",
    reason: "unexpected-close",
    clean: false,
    reconnect: reconnectDispositionForStreamingClose("unexpected-close"),
    code: "fixture-unexpected-close",
    detail: "A fresh stream is required after an unexpected close.",
  })),
});

const reson8PrerecordedFixtureAdapter: ProviderFixtureAdapter = Object.freeze({
  providerId: RESON8_PROVIDER_ID,
  capabilityId: "stt.prerecorded",
  adapterKind: "prerecorded-stt",
  supportedCapabilityIds: Object.freeze([
    "stt.prerecorded",
    "stt.final-transcripts",
    "stt.diarization",
    "stt.language-detection",
    "stt.word-timestamps",
    "stt.utterance-timestamps",
    "stt.confidence",
  ] as const),
  adapterVersion: RESON8_ADAPTER_VERSION,
  fixtureOnly: true,
  async executeFixture(
    input: Readonly<{ text?: string; audio?: Uint8Array }>,
    executionContext: Readonly<{ signal: AbortSignal }>,
  ) {
    assertFixtureActive(executionContext.signal);
    const text = fixtureText(input.text);
    const transport = {
      async execute() {
        assertFixtureActive(executionContext.signal);
        return {
          requestId: "fixture-prerecorded-1",
          bodyText: JSON.stringify({
            text,
            language: "en",
            start_ms: 0,
            duration_ms: 20,
            words: [{ text, start_ms: 0, duration_ms: 20, confidence: 0.95 }],
          }),
        };
      },
    };
    const adapter = createReson8PrerecordedSttAdapter(transport, { provenance: "synthetic-fixture" });
    const audio = input.audio ?? createReson8PcmWavFixture();
    const ownedAudio = audio.slice().buffer;
    const result = await adapter.execute(
      { file: new File([ownedAudio], "one-reson8-fixture.wav", { type: "audio/wav" }) },
      { signal: executionContext.signal, timeoutMilliseconds: 1_000 },
    );
    return Object.freeze({
      providerId: RESON8_PROVIDER_ID,
      capabilityId: "stt.prerecorded" as const,
      status: "complete" as const,
      provenance: "synthetic-fixture" as const,
      output: Object.freeze({ text: result.transcript, byteLength: audio.byteLength }),
    });
  },
});

const reson8RealtimeFixtureAdapter: ProviderFixtureAdapter = Object.freeze({
  providerId: RESON8_PROVIDER_ID,
  capabilityId: "stt.streaming",
  adapterKind: "streaming-stt",
  supportedCapabilityIds: Object.freeze([
    "stt.streaming",
    "stt.partial-transcripts",
    "stt.final-transcripts",
    "stt.language-detection",
    "stt.word-timestamps",
    "stt.utterance-timestamps",
    "stt.confidence",
  ] as const),
  adapterVersion: RESON8_ADAPTER_VERSION,
  fixtureOnly: true,
  async executeFixture(
    input: Readonly<{ text?: string; audio?: Uint8Array }>,
    executionContext: Readonly<{ signal: AbortSignal }>,
  ) {
    assertFixtureActive(executionContext.signal);
    const events = buildReson8RealtimeFixtureEvents(fixtureText(input.text));
    const transcript = events.findLast((event) => event.type === "final-transcript");
    if (!transcript || transcript.type !== "final-transcript") throw new Error("Reson8 fixture transcript is missing.");
    return Object.freeze({
      providerId: RESON8_PROVIDER_ID,
      capabilityId: "stt.streaming" as const,
      status: "complete" as const,
      provenance: "synthetic-fixture" as const,
      output: Object.freeze({ text: transcript.transcript.text, eventCount: events.length }),
    });
  },
});

const reson8TurnFixtureAdapter: ProviderFixtureAdapter = Object.freeze({
  providerId: RESON8_PROVIDER_ID,
  capabilityId: "stt.turn-aware",
  adapterKind: "turn-aware-stt",
  supportedCapabilityIds: Object.freeze([
    "stt.turn-aware",
    "stt.final-transcripts",
    "stt.language-detection",
    "stt.word-timestamps",
    "stt.utterance-timestamps",
    "realtime.turn-detection",
  ] as const),
  adapterVersion: RESON8_ADAPTER_VERSION,
  fixtureOnly: true,
  async executeFixture(
    input: Readonly<{ text?: string; audio?: Uint8Array }>,
    executionContext: Readonly<{ signal: AbortSignal }>,
  ) {
    assertFixtureActive(executionContext.signal);
    const events = buildReson8TurnFixtureEvents(fixtureText(input.text));
    const confirmed = events.find((event) => event.type === "turn-end");
    if (!confirmed || confirmed.type !== "turn-end") throw new Error("Reson8 fixture turn confirmation is missing.");
    return Object.freeze({
      providerId: RESON8_PROVIDER_ID,
      capabilityId: "stt.turn-aware" as const,
      status: "complete" as const,
      provenance: "synthetic-fixture" as const,
      output: Object.freeze({ text: confirmed.transcript.text, eventCount: events.length }),
    });
  },
});

export const RESON8_FIXTURE_ADAPTERS: readonly ProviderFixtureAdapter[] = Object.freeze([
  reson8PrerecordedFixtureAdapter,
  reson8RealtimeFixtureAdapter,
  reson8TurnFixtureAdapter,
]);

const reson8CatalogEntry = getProviderCatalogEntry(RESON8_PROVIDER_ID);
if (!reson8CatalogEntry) throw new Error("The canonical provider catalog is missing Reson8.");

export const RESON8_CONTRACT_CANDIDATE: ProviderContractCandidate = Object.freeze({
  catalogEntry: reson8CatalogEntry,
  adapters: RESON8_FIXTURE_ADAPTERS,
  benchmarkCompatibleCapabilities: Object.freeze(["stt.prerecorded"] as const),
});
