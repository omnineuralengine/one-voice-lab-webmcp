import { expect, test } from "@playwright/test";

import { POST as postProviderStt } from "../../src/app/api/providers/[provider]/stt/route";
import { planBenchmark } from "../../src/lib/evaluation/benchmark-engine";
import { BENCHMARK_PLAN_VERSION, benchmarkPlanSchema } from "../../src/lib/evaluation/benchmark-schema";
import { getProviderAdapterRegistration, resolveSttAdapter } from "../../src/lib/providers/adapters";
import { toBenchmarkPlanningProviders } from "../../src/lib/providers/benchmark-projection";
import { getProviderCatalogEntry, PROVIDER_CATALOG } from "../../src/lib/providers/catalog";
import {
  executeProviderFixtureContract,
  validateProviderContractCandidate,
} from "../../src/lib/providers/contract-test-kit";
import { ProviderAdapterError } from "../../src/lib/providers/errors";
import { getProviderPlatformProjection } from "../../src/lib/providers/platform-service";
import {
  MAX_RESON8_NORMALIZED_RESPONSE_BYTES,
  RESON8_CONTRACT_CANDIDATE,
  RESON8_FIXTURE_ADAPTERS,
  RESON8_PROTOCOL_FIXTURES,
  Reson8ProtocolError,
  buildReson8RealtimeFixtureEvents,
  buildReson8TurnFixtureEvents,
  createReson8PcmWavFixture,
  createReson8PrerecordedSttAdapter,
  createReson8TurnAwareSttEventAdapter,
  normalizeReson8RealtimeEvent,
} from "../../src/lib/providers/reson8";
import {
  DEFAULT_STREAMING_STT_LIMITS,
  admitStreamingAudioChunk,
  classifyStreamingClose,
  normalizedStreamingSttEventSchema,
  reconnectDispositionForStreamingClose,
  releaseStreamingAudioBytes,
  type StreamingSttEventContext,
} from "../../src/lib/providers/streaming-stt";

const OBSERVED_AT = "2026-08-28T12:00:00.000Z";

function context(sequence: number): StreamingSttEventContext {
  return {
    providerId: "reson8",
    sequence,
    observedAt: OBSERVED_AT,
    monotonicOffsetMilliseconds: sequence,
    provenance: "synthetic-fixture",
  };
}

test.describe("Reson8 fixture-first provider onboarding", () => {
  test("keeps official metadata attributable without claiming TTS, live verification, or public ranking", () => {
    const provider = getProviderCatalogEntry("reson8");
    expect(provider).not.toBeNull();
    expect(provider).toMatchObject({
      id: "reson8",
      officialWebsite: "https://reson8.dev/",
      officialDocumentation: "https://docs.reson8.dev/",
      metadataVerification: "verified",
    });
    expect(provider?.metadataSources.length).toBeGreaterThanOrEqual(4);
    expect(provider?.metadataSources.every((source) => (
      new URL(source.url).hostname === "docs.reson8.dev"
      && source.verifiedAt === "2026-08-28"
    ))).toBe(true);
    expect(getProviderCatalogEntry("deepgram")?.metadataSources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        url: expect.stringMatching(/^https:\/\/developers\.deepgram\.com\//),
        verifiedAt: "2026-08-29",
      }),
    ]));

    const capabilityIds = provider?.capabilities.map((capability) => capability.id) ?? [];
    expect(capabilityIds).toEqual(expect.arrayContaining([
      "stt.prerecorded",
      "stt.streaming",
      "stt.turn-aware",
      "stt.partial-transcripts",
      "stt.final-transcripts",
      "stt.word-timestamps",
      "stt.utterance-timestamps",
      "stt.confidence",
      "realtime.turn-detection",
    ]));
    expect(capabilityIds.some((capability) => capability.startsWith("tts."))).toBe(false);
    expect(provider?.capabilities.every((capability) => capability.benchmarkEligibility === "ineligible")).toBe(true);
  });

  test("projects fixture validation, server-only credential presence, and default-deny lifecycle without leaking the credential boundary", () => {
    const marker = "reson8-fixture-secret-must-not-serialize";
    const unconfigured = getProviderPlatformProjection("reson8", { environment: {} });
    const configured = getProviderPlatformProjection("reson8", {
      environment: { RESON8_API_KEY: marker },
      policies: [{
        providerId: "reson8",
        access: "public-use",
        runtimeStatus: "enabled",
        benchmarkStatus: "publicly-ranked",
        costAdmissionEnabled: true,
        capabilityPolicies: [],
        policyVersion: "test-attempted-widening/1.0.0",
      }],
    });

    expect(unconfigured).toMatchObject({
      lifecycle: {
        integration: "fixture-validated",
        access: "globally-disabled",
        runtime: "disabled",
        benchmark: "ineligible",
      },
      readiness: { state: "adapter-backed" },
      credential: { required: true, state: "unconfigured" },
      health: { state: "disabled" },
      integration: { installed: true, fixtureCapable: true },
    });
    expect(configured?.credential.state).toBe("configured-not-runtime-verified");
    expect(configured?.readiness.state).not.toBe("live-enabled");
    expect(configured?.lifecycle.benchmark).toBe("ineligible");
    expect(JSON.stringify(configured)).not.toContain(marker);
    expect(JSON.stringify(configured)).not.toContain("RESON8_API_KEY");
  });

  test("passes the shared contract kit with exactly three deterministic fixture adapters and no network", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      throw new Error("Reson8 fixture tests must not call a provider domain.");
    }) as typeof fetch;

    try {
      expect(RESON8_FIXTURE_ADAPTERS.map((adapter) => [adapter.capabilityId, adapter.adapterKind])).toEqual([
        ["stt.prerecorded", "prerecorded-stt"],
        ["stt.streaming", "streaming-stt"],
        ["stt.turn-aware", "turn-aware-stt"],
      ]);
      expect(getProviderAdapterRegistration("reson8")?.fixtureAdapters).toBe(RESON8_FIXTURE_ADAPTERS);
      expect(validateProviderContractCandidate(
        RESON8_CONTRACT_CANDIDATE,
        PROVIDER_CATALOG.filter((provider) => provider.id !== "reson8").map((provider) => provider.id),
      )).toEqual({ valid: true, issues: [] });

      for (const adapter of RESON8_FIXTURE_ADAPTERS) {
        const execution = await executeProviderFixtureContract(adapter, {
          text: "Deterministic Reson8 fixture",
          audio: createReson8PcmWavFixture(),
        }, { timeoutMs: 1_000 });
        expect(execution).toMatchObject({
          ok: true,
          result: {
            providerId: "reson8",
            capabilityId: adapter.capabilityId,
            status: "complete",
            provenance: "synthetic-fixture",
          },
        });
      }
      expect(fetchCalls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("normalizes prerecorded output through an injected transport after trusted PCM admission", async () => {
    const calls: Array<{ bytes: number; durationSeconds: number; quotaUnits: number }> = [];
    const adapter = createReson8PrerecordedSttAdapter({
      async execute(request) {
        calls.push({
          bytes: request.audio.byteLength,
          durationSeconds: request.trustedAudio.durationSeconds,
          quotaUnits: request.trustedAudio.quotaUnits,
        });
        return {
          requestId: "fixture-request-1",
          bodyText: JSON.stringify({
            text: "Hello from ONE.",
            language: "en",
            start_ms: 0,
            duration_ms: 20,
            words: [{ text: "Hello", start_ms: 0, duration_ms: 10, confidence: 0.95 }],
            segments: [{
              text: "Hello",
              language: "en",
              speaker_id: 0,
              start_ms: 0,
              duration_ms: 10,
              words: [{ text: "Hello", start_ms: 0, duration_ms: 10, confidence: 0.95 }],
            }, {
              text: "from ONE.",
              language: "en",
              speaker_id: 0,
              start_ms: 10,
              duration_ms: 10,
            }],
          }),
        };
      },
    }, { provenance: "synthetic-fixture" });
    const audio = createReson8PcmWavFixture();
    const result = await adapter.execute({
      file: new File([audio.slice().buffer], "fixture.wav", { type: "audio/wav" }),
      options: { diarize: true, maxSpeakers: 2, includeWords: true, includeConfidence: true },
    }, { timeoutMilliseconds: 1_000 });

    expect(calls).toEqual([{ bytes: audio.byteLength, durationSeconds: 0.02, quotaUnits: 1 }]);
    expect(result).toMatchObject({
      providerId: "reson8",
      transcript: "Hello from ONE.",
      language: "en",
      durationMilliseconds: 20,
      requestId: "fixture-request-1",
      provenance: "synthetic-fixture",
      words: [{ text: "Hello", startMilliseconds: 0, durationMilliseconds: 10, confidence: 0.95 }],
      segments: [
        { transcript: { speakerId: 0, text: "Hello" } },
        { transcript: { speakerId: 0, text: "from ONE." } },
      ],
      trustedAudio: { format: "pcm-wav", durationSeconds: 0.02, quotaUnits: 1 },
    });
  });

  test("requires the documented top-level text field and preserves segments without double-combining them", async () => {
    const wav = new File([createReson8PcmWavFixture().slice().buffer], "fixture.wav", { type: "audio/wav" });
    const adapterFor = (body: unknown) => createReson8PrerecordedSttAdapter({
      execute: async () => ({ bodyText: JSON.stringify(body) }),
    });

    await expect(adapterFor({ transcript: "wrong field" }).execute({ file: wav }))
      .rejects.toMatchObject({ code: "malformed-provider-response" });
    await expect(adapterFor({ text: "", segments: [{ text: "segment only" }] }).execute({ file: wav }))
      .rejects.toMatchObject({ code: "malformed-provider-response" });

    const result = await adapterFor({
      text: "authoritative complete transcript",
      segments: [{ text: "authoritative complete" }, { text: "transcript" }],
    }).execute({ file: wav });
    expect(result.transcript).toBe("authoritative complete transcript");
    expect(result.segments?.map((segment) => segment.transcript.text)).toEqual([
      "authoritative complete",
      "transcript",
    ]);
  });

  test("rejects unsupported audio, malformed and oversized responses, timeout, cancellation, and sensitive transport failures", async () => {
    let transportCalls = 0;
    const responseAdapter = (bodyText: string) => createReson8PrerecordedSttAdapter({
      async execute() {
        transportCalls += 1;
        return { bodyText };
      },
    });
    const wav = new File([createReson8PcmWavFixture().slice().buffer], "fixture.wav", { type: "audio/wav" });
    const mp3 = new File([new Uint8Array([0x49, 0x44, 0x33])], "fixture.mp3", { type: "audio/mpeg" });

    await expect(responseAdapter("{}").execute({ file: mp3 })).rejects.toMatchObject({ code: "unsupported-audio" });
    expect(transportCalls).toBe(0);
    await expect(responseAdapter("{").execute({ file: wav })).rejects.toMatchObject({ code: "malformed-provider-response" });
    await expect(responseAdapter("x".repeat(MAX_RESON8_NORMALIZED_RESPONSE_BYTES + 1)).execute({ file: wav }))
      .rejects.toMatchObject({ code: "response-too-large" });

    const controller = new AbortController();
    controller.abort("fixture-cancelled");
    await expect(responseAdapter("{}").execute({ file: wav }, { signal: controller.signal }))
      .rejects.toMatchObject({ code: "cancelled" });

    const hanging = createReson8PrerecordedSttAdapter({ execute: async () => new Promise(() => undefined) });
    await expect(hanging.execute({ file: wav }, { timeoutMilliseconds: 5 }))
      .rejects.toMatchObject({ code: "timed-out" });

    const secretMarker = "reson8-upstream-secret-must-not-return";
    const failing = createReson8PrerecordedSttAdapter({ execute: async () => { throw new Error(secretMarker); } });
    const failure = await failing.execute({ file: wav }, { timeoutMilliseconds: 100 }).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: "transport-failed" });
    expect(JSON.stringify(failure)).not.toContain(secretMarker);
  });

  test("normalizes realtime partial, final, flush, warning, error, and close evidence while rejecting malformed events", () => {
    const partial = normalizeReson8RealtimeEvent(JSON.stringify({
      type: "transcript",
      text: "Hello",
      language: "en",
      is_final: false,
      start_ms: 0,
      duration_ms: 10,
      words: [{ text: "Hello", confidence: 0.9 }],
    }), context(1));
    const final = normalizeReson8RealtimeEvent({ type: "transcript", text: "Hello ONE", is_final: true }, context(2));
    const flush = normalizeReson8RealtimeEvent({ type: "flush_confirmation", id: "flush-1" }, context(3));
    const defaultFinal = normalizeReson8RealtimeEvent({ type: "transcript", text: "Default final" }, context(4));
    const emptyInterimLanguage = normalizeReson8RealtimeEvent({
      type: "transcript",
      text: "Interim",
      language: "",
      is_final: false,
    }, context(5));
    const nullableFlush = normalizeReson8RealtimeEvent({ type: "flush_confirmation", id: null }, context(6));

    expect(partial).toMatchObject({ type: "partial-transcript", transcript: { text: "Hello", language: "en" } });
    expect(final).toMatchObject({ type: "final-transcript", transcript: { text: "Hello ONE" } });
    expect(flush).toMatchObject({ type: "flush-confirmed", requestId: "flush-1" });
    expect(defaultFinal).toMatchObject({ type: "final-transcript", transcript: { text: "Default final" } });
    expect(emptyInterimLanguage).toMatchObject({ type: "partial-transcript", transcript: { text: "Interim" } });
    if (emptyInterimLanguage.type !== "partial-transcript") throw new Error("Expected a partial transcript fixture.");
    expect(emptyInterimLanguage.transcript).not.toHaveProperty("language");
    expect(nullableFlush).toMatchObject({ type: "flush-confirmed", requestId: null });
    expect(RESON8_PROTOCOL_FIXTURES.providerWarning).toMatchObject({ type: "provider-warning", code: "fixture-warning" });
    expect(RESON8_PROTOCOL_FIXTURES.providerError).toMatchObject({ type: "provider-error", retryable: false });
    expect(RESON8_PROTOCOL_FIXTURES.unexpectedClose).toMatchObject({
      type: "session-closed",
      reason: "unexpected-close",
      clean: false,
      reconnect: "fresh-session-required",
    });
    expect(buildReson8RealtimeFixtureEvents("Stable fixture").map((event) => event.type)).toEqual([
      "session-opened",
      "session-ready",
      "partial-transcript",
      "final-transcript",
      "flush-confirmed",
      "session-closed",
    ]);

    expect(() => normalizeReson8RealtimeEvent(RESON8_PROTOCOL_FIXTURES.malformedRealtimeMessage, context(7)))
      .toThrow(Reson8ProtocolError);
    try {
      normalizeReson8RealtimeEvent({ type: "provider_private_event" }, context(8));
      throw new Error("Expected an unsupported provider event failure.");
    } catch (error) {
      expect(error).toMatchObject({ code: "unsupported-provider-event" });
    }
    expect(() => normalizedStreamingSttEventSchema.parse({ ...RESON8_PROTOCOL_FIXTURES.providerWarning, secret: "not-allowed" }))
      .toThrow();
  });

  test("keeps turn candidates provisional until the matching provider-confirmed turn end", () => {
    const events = buildReson8TurnFixtureEvents("Confirmed fixture turn");
    const candidates = events.filter((event) => event.type === "turn-end-candidate");
    const confirmed = events.find((event) => event.type === "turn-end");
    expect(candidates).toHaveLength(2);
    expect(candidates.map((event) => event.type === "turn-end-candidate" ? event.candidateRevision : -1)).toEqual([1, 2]);
    expect(confirmed).toMatchObject({
      type: "turn-end",
      confirmedCandidateRevision: 2,
      transcript: { text: "Confirmed fixture turn" },
    });

    const adapter = createReson8TurnAwareSttEventAdapter();
    expect(() => adapter.normalizeProviderEvent({ type: "turn_end" }, context(1))).toThrow(Reson8ProtocolError);
    expect(() => adapter.normalizeProviderEvent(RESON8_PROTOCOL_FIXTURES.malformedTurnMessage, context(2)))
      .toThrow(Reson8ProtocolError);
    adapter.normalizeProviderEvent({ type: "turn_start" }, context(3));
    expect(() => adapter.normalizeProviderEvent({ type: "turn_start" }, context(4))).toThrow(Reson8ProtocolError);
    adapter.reset();
    expect(adapter.normalizeProviderEvent({ type: "turn_start" }, context(5)).type).toBe("turn-start");

    const multiTurn = createReson8TurnAwareSttEventAdapter();
    const cycle = (offset: number, text: string) => [
      multiTurn.normalizeProviderEvent({ type: "turn_start" }, context(offset)),
      multiTurn.normalizeProviderEvent({ type: "turn_end_candidate", text: `${text} draft` }, context(offset + 1)),
      multiTurn.normalizeProviderEvent({ type: "turn_end_candidate", text }, context(offset + 2)),
      multiTurn.normalizeProviderEvent({ type: "turn_end" }, context(offset + 3)),
    ];
    const twoTurns = [...cycle(10, "first turn"), ...cycle(20, "second turn")];
    expect(twoTurns.filter((event) => event.type === "turn-end").map((event) => (
      event.type === "turn-end" ? event.transcript.text : ""
    ))).toEqual(["first turn", "second turn"]);
  });

  test("enforces streaming chunk, pending-buffer, session, cancellation, and reconnect bounds", () => {
    const limits = DEFAULT_STREAMING_STT_LIMITS;
    expect(admitStreamingAudioChunk({ chunk: new Uint8Array(8), pendingBytes: 0, elapsedMilliseconds: 0 }))
      .toEqual({ ok: true, nextPendingBytes: 8 });
    expect(admitStreamingAudioChunk({
      chunk: new Uint8Array(limits.maxChunkBytes + 1),
      pendingBytes: 0,
      elapsedMilliseconds: 0,
    })).toMatchObject({ ok: false, code: "chunk-too-large", closeReason: "invalid-frame" });
    expect(admitStreamingAudioChunk({
      chunk: new Uint8Array(8),
      pendingBytes: limits.maxPendingBytes,
      elapsedMilliseconds: 0,
    })).toMatchObject({ ok: false, code: "backpressure", closeReason: "backpressure" });
    expect(admitStreamingAudioChunk({
      chunk: new Uint8Array(8),
      pendingBytes: 0,
      elapsedMilliseconds: limits.maxSessionMilliseconds,
    })).toMatchObject({ ok: false, code: "timed-out", closeReason: "timed-out" });
    const controller = new AbortController();
    controller.abort();
    expect(admitStreamingAudioChunk({
      chunk: new Uint8Array(8),
      pendingBytes: 0,
      elapsedMilliseconds: 0,
      signal: controller.signal,
    })).toMatchObject({ ok: false, code: "cancelled", closeReason: "cancelled" });
    expect(releaseStreamingAudioBytes(8, 3)).toBe(5);
    expect(() => releaseStreamingAudioBytes(2, 3)).toThrow(/non-negative and bounded/i);
    expect(classifyStreamingClose({})).toBe("unexpected-close");
    expect(reconnectDispositionForStreamingClose("unexpected-close")).toBe("fresh-session-required");
    expect(reconnectDispositionForStreamingClose("completed")).toBe("not-required");
  });

  test("supports private fixture-only STT planning, remains public-ineligible, and fails live invocation closed before provider dispatch", async () => {
    const projection = getProviderPlatformProjection("reson8", { environment: {} });
    expect(projection).not.toBeNull();
    const planningProviders = toBenchmarkPlanningProviders([projection!], "stt");
    expect(planningProviders).toEqual([{
      providerId: "reson8",
      listed: true,
      fixtureAvailable: true,
      adapterBacked: true,
      liveEnabled: false,
      benchmarkEligible: false,
    }]);
    const plan = benchmarkPlanSchema.parse({
      schemaVersion: BENCHMARK_PLAN_VERSION,
      planId: "benchmark-plan/reson8-fixture",
      category: "stt",
      methodology: { id: "one-stt-controlled-transcript", version: "1.0.0" },
      executionMode: "fixture",
      cases: [{ id: "reson8-synthetic-pcm", version: "1.0.0" }],
      providers: [{ providerId: "reson8", modelId: "fixture-model", voiceId: null, configuration: { fixture: true } }],
      repetitions: 1,
      confirmedPaidCalls: false,
    });
    expect(planBenchmark(plan, { providerCatalog: planningProviders })).toMatchObject({
      status: "ready",
      requiresPaidProviderCalls: false,
      executionBoundary: "unavailable",
      reasons: [],
    });
    expect(planBenchmark({ ...plan, executionMode: "protected-live", confirmedPaidCalls: true }, {
      liveExecutionEnabled: true,
      providerCatalog: planningProviders,
    })).toMatchObject({ status: "blocked", reasons: [{ code: "category-execution-unavailable" }] });

    expect(() => resolveSttAdapter("reson8")).toThrow(ProviderAdapterError);
    try {
      resolveSttAdapter("reson8");
    } catch (error) {
      expect(error).toMatchObject({ code: "provider_execution_disabled", providerId: "reson8" });
    }

    const originalFetch = globalThis.fetch;
    let providerDomainCalls = 0;
    globalThis.fetch = (async (input) => {
      if (/reson8\.dev/i.test(String(input))) providerDomainCalls += 1;
      throw new Error("No provider request is permitted in this test.");
    }) as typeof fetch;
    try {
      const response = await postProviderStt(new Request("https://one.test/api/providers/reson8/stt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }), { params: Promise.resolve({ provider: "reson8" }) });
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        error: { code: "provider_execution_disabled" },
      });
      expect(providerDomainCalls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
