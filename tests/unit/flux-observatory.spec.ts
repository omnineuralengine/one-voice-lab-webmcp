import { expect, test } from "@playwright/test";
import {
  DEFAULT_FLUX_CONFIGURATION,
  FLUX_REPLAY_FIXTURES,
  MIN_MEDIAN_SAMPLE_SIZE,
  MIN_P95_SAMPLE_SIZE,
  buildFluxConfigureMessage,
  buildFluxHandoffs,
  buildFluxListenUrl,
  buildFluxMermaid,
  buildFluxScorecard,
  createConfigurationRequestEvent,
  createFluxObservatoryState,
  createLocalFluxEvent,
  deriveFluxMetrics,
  exportFluxScorecardJson,
  exportFluxScorecardMarkdown,
  markFluxProviderValidationReviewed,
  normalizeFluxProviderMessage,
  reduceFluxObservatoryEvent,
  runFluxReplayFixture,
  sanitizeFluxValue,
  summarizeFluxTiming,
  validateFluxConfiguration,
  validateFluxConfigurationUpdate,
  type FluxConfiguration,
  type FluxNormalizeContext,
  type FluxObservatoryState,
  type FluxTurnEventName,
} from "@/lib/flux-observatory";

const NOW = "2026-07-28T20:00:00.000Z";
const LIVE_CONTEXT: FluxNormalizeContext = {
  sessionId: "test-session",
  connectionGeneration: 1,
  monotonicMs: 100,
  mode: "live-provider",
  receivedAt: NOW,
};

function configuration(overrides: Partial<FluxConfiguration> = {}): FluxConfiguration {
  return {
    ...DEFAULT_FLUX_CONFIGURATION,
    ...overrides,
    thresholds: { ...DEFAULT_FLUX_CONFIGURATION.thresholds, ...(overrides.thresholds ?? {}) },
    keyterms: [...(overrides.keyterms ?? DEFAULT_FLUX_CONFIGURATION.keyterms)],
    languageHints: [...(overrides.languageHints ?? DEFAULT_FLUX_CONFIGURATION.languageHints)],
  };
}

function state(mode: "synthetic-replay" | "live-provider" = "live-provider") {
  return createFluxObservatoryState({ sessionId: "test-session", mode, configuration: configuration(), createdAt: NOW });
}

function providerEvent(payload: unknown, monotonicMs = 100, generation = 1) {
  return normalizeFluxProviderMessage(payload, { ...LIVE_CONTEXT, connectionGeneration: generation, monotonicMs });
}

function turnPayload(sequence: number, event: FluxTurnEventName, transcript = "A bounded synthetic sentence.", turnIndex = 0) {
  return {
    type: "TurnInfo",
    request_id: "req-safe",
    sequence_id: sequence,
    event,
    turn_index: turnIndex,
    audio_window_start: 0,
    audio_window_end: sequence * 0.2,
    transcript,
    words: [{ word: "bounded", start: 0, end: 0.2, confidence: 0.9 }],
    end_of_turn_confidence: 0.7,
  };
}

test.describe("Flux Conversation Observatory core", () => {
  test("constructs only the documented Flux /v2/listen endpoint and never embeds authentication", () => {
    const url = buildFluxListenUrl(configuration({
      model: "flux-general-multi",
      languageHints: ["en", "es"],
      keyterms: ["Deepgram"],
    }));
    expect(url).toContain("wss://api.deepgram.com/v2/listen?");
    expect(url).not.toContain("/v1/listen");
    expect(url).toContain("model=flux-general-multi");
    expect(url.match(/language_hint=/g)).toHaveLength(2);
    expect(url).not.toMatch(/authorization|access_token|api_key|bearer/i);
  });

  test("validates documented models, encodings, sample rates, and the 60000 ms timeout maximum", () => {
    expect(validateFluxConfiguration(configuration({ encoding: "ogg-opus", sampleRate: 48000, thresholds: { eotThreshold: 0.9, eagerEotThreshold: 0.9, eotTimeoutMs: 60000 } })).success).toBe(true);
    expect(validateFluxConfiguration({ ...configuration(), model: "nova-3" as never }).errors.join(" ")).toContain("flux-general");
    expect(validateFluxConfiguration({ ...configuration(), sampleRate: 32000 as never }).errors.join(" ")).toContain("sample rate");
    expect(validateFluxConfiguration(configuration({ thresholds: { eotThreshold: 0.7, eagerEotThreshold: null, eotTimeoutMs: 60001 } })).errors.join(" ")).toContain("60000");
  });

  test("rejects invalid threshold ranges and eager thresholds above the confirmed threshold", () => {
    const invalid = validateFluxConfigurationUpdate({ thresholds: { eagerEotThreshold: 0.8 } }, configuration({ thresholds: { eotThreshold: 0.7, eagerEotThreshold: null, eotTimeoutMs: 5000 } }));
    expect(invalid.success).toBe(false);
    expect(invalid.errors).toContain("eager_eot_threshold must not exceed eot_threshold.");
    expect(validateFluxConfigurationUpdate({ thresholds: { eotThreshold: 0.49 } }, configuration()).success).toBe(false);
    expect(validateFluxConfigurationUpdate({ thresholds: { eotTimeoutMs: 500.5 } }, configuration()).success).toBe(false);
  });

  test("enforces multilingual model compatibility and current supported hint languages", () => {
    expect(validateFluxConfiguration(configuration({ languageHints: ["es"] })).success).toBe(false);
    expect(validateFluxConfiguration(configuration({ model: "flux-general-multi", languageHints: ["en-GB", "pt-BR", "ja"] })).success).toBe(true);
    expect(validateFluxConfiguration(configuration({ model: "flux-general-multi", languageHints: ["ko"] })).success).toBe(false);
  });

  test("builds the direct Configure shape with nested thresholds and explicit clear arrays", () => {
    const message = buildFluxConfigureMessage({
      thresholds: { eotThreshold: 0.8, eagerEotThreshold: 0.5, eotTimeoutMs: 9000 },
      keyterms: [],
      languageHints: [],
    }, configuration({ model: "flux-general-multi" }));
    expect(message).toEqual({
      type: "Configure",
      thresholds: { eot_threshold: 0.8, eager_eot_threshold: 0.5, eot_timeout_ms: 9000 },
      keyterms: [],
      language_hints: [],
    });
    expect(() => buildFluxConfigureMessage({ keyterms: Array.from({ length: 101 }, (_, index) => `term-${index}`) }, configuration())).toThrow(/100/);
    expect(buildFluxConfigureMessage({ languageHints: null }, configuration({ model: "flux-general-multi", languageHints: ["en"] }))).toEqual({ type: "Configure", language_hints: null });
    expect(buildFluxConfigureMessage({ thresholds: { eagerEotThreshold: null } }, configuration({ thresholds: { eotThreshold: 0.7, eagerEotThreshold: 0.5, eotTimeoutMs: 5000 } }))).toEqual({ type: "Configure" });
  });

  test("normalizes every documented TurnInfo event with optional multilingual fields", () => {
    const names: FluxTurnEventName[] = ["Update", "StartOfTurn", "EagerEndOfTurn", "TurnResumed", "EndOfTurn"];
    const events = names.map((name, index) => providerEvent({
      ...turnPayload(index + 1, name),
      languages: ["es", "en"],
      languages_hinted: ["es"],
    }, 100 + index * 100));
    expect(events.map((event) => event.kind)).toEqual(Array(5).fill("turn"));
    expect(events.map((event) => event.kind === "turn" ? event.event : null)).toEqual(names);
    expect(events[0].kind === "turn" && events[0].languages).toEqual(["es", "en"]);
    expect(events.every((event) => event.evidenceLabel === "Live provider observation — review required")).toBe(true);
  });

  test("normalizes Connected, configuration responses, warning, and fatal Error without assuming optional fields", () => {
    expect(providerEvent({ type: "Connected" }).kind).toBe("connected");
    const success = providerEvent({ type: "ConfigureSuccess", thresholds: { eot_threshold: 0.8 }, keyterms: ["safe"] });
    expect(success.kind === "configure-success" && success.acknowledged.thresholds?.eotThreshold).toBe(0.8);
    const failure = providerEvent({ type: "ConfigureFailure" });
    expect(failure.kind).toBe("configure-failure");
    expect(failure.requestId).toBeUndefined();
    expect(providerEvent({ type: "Warning", description: "Bounded warning" }).kind).toBe("provider-warning");
    const error = providerEvent({ type: "Error", code: "NET", description: "Closed" });
    expect(error.kind === "provider-error" && error.fatal).toBe(true);
  });

  test("isolates malformed and unknown payloads and sanitizes nested credential material", () => {
    const malformed = providerEvent("{bad-json Authorization: Bearer fixture");
    expect(malformed.kind).toBe("malformed-provider-message");
    expect(JSON.stringify(malformed)).not.toContain("secret-token-value");
    const unknown = providerEvent({ type: "FutureEvent", token: "secret-token-value", nested: { Authorization: "Bearer secret-token-value" } });
    expect(unknown.kind).toBe("unknown-provider-message");
    expect(JSON.stringify(unknown)).not.toContain("secret-token-value");
    expect(JSON.stringify(sanitizeFluxValue({ websocket_url: "wss://private.test?token=secret-token-value" }))).not.toContain("private.test");
  });

  test("drops extra credential-shaped configuration fields from browser state", () => {
    const unsafe = { ...configuration({ keyterms: ["dg_abcdefghijklmnop"] }), apiKey: "dg_abcdefghijklmnop", accessToken: "eyJabcdefgh.abcdefgh.abcdefgh" } as FluxConfiguration;
    const created = createFluxObservatoryState({ sessionId: "safe", mode: "live-provider", configuration: unsafe, createdAt: NOW });
    expect(JSON.stringify(created)).not.toMatch(/apiKey|accessToken|dg_abcdefghijklmnop|eyJabcdefgh/);
    expect(created.activeConfiguration).not.toHaveProperty("apiKey");
  });

  test("suppresses duplicate provider events and keeps one turn transition", () => {
    const event = providerEvent(turnPayload(1, "StartOfTurn"));
    const once = reduceFluxObservatoryEvent(state(), event);
    const twice = reduceFluxObservatoryEvent(once, event);
    expect(twice.events).toHaveLength(1);
    expect(twice.turns[0].eventSequence).toEqual(["StartOfTurn"]);
    expect(twice.duplicateEventsSuppressed).toBe(1);
    const conflictingSameSequence = providerEvent({ ...turnPayload(1, "Update"), transcript: "Conflicting duplicate" }, 200);
    const stillSuppressed = reduceFluxObservatoryEvent(twice, conflictingSameSequence);
    expect(stillSuppressed.duplicateEventsSuppressed).toBe(2);
    expect(stillSuppressed.turns[0].transcript).not.toContain("Conflicting");
  });

  test("activates a fresh session generation and ignores obsolete-connection provider events", () => {
    let current = state();
    current = reduceFluxObservatoryEvent(current, createLocalFluxEvent("session-created", { ...LIVE_CONTEXT, connectionGeneration: 2, monotonicMs: 200 }, {}));
    expect(current.activeConnectionGeneration).toBe(2);
    current = reduceFluxObservatoryEvent(current, providerEvent(turnPayload(1, "EndOfTurn", "Obsolete transcript"), 300, 1));
    expect(current.staleEventsIgnored).toBe(1);
    expect(current.turns).toHaveLength(0);
    expect(JSON.stringify(current)).not.toContain("Obsolete transcript");
  });

  test("preserves out-of-order provider evidence but prevents it from regressing turn state", () => {
    let current = state();
    current = reduceFluxObservatoryEvent(current, providerEvent(turnPayload(2, "StartOfTurn", "Current transcript"), 200));
    current = reduceFluxObservatoryEvent(current, providerEvent(turnPayload(1, "Update", "Older transcript"), 300));
    expect(current.events).toHaveLength(2);
    expect(current.outOfOrderProviderEvents).toBe(1);
    expect(current.turns[0].transcript).toBe("Current transcript");
  });

  test("groups resumed and completed events into one inspectable turn", () => {
    let current = state();
    const sequence: Array<[number, FluxTurnEventName, number]> = [[1, "StartOfTurn", 100], [2, "EagerEndOfTurn", 300], [3, "TurnResumed", 420], [4, "EndOfTurn", 700]];
    for (const [id, name, at] of sequence) current = reduceFluxObservatoryEvent(current, providerEvent(turnPayload(id, name), at));
    expect(current.turns).toHaveLength(1);
    expect(current.turns[0].status).toBe("complete");
    expect(current.turns[0].resumedCount).toBe(1);
    expect(current.turns[0].eventSequence).toEqual(sequence.map((entry) => entry[1]));
  });

  test("applies acknowledgement to the newest pending configuration transaction", () => {
    let current = state();
    current = reduceFluxObservatoryEvent(current, createConfigurationRequestEvent("first", current.activeConfiguration, { thresholds: { eotThreshold: 0.75 } }, { ...LIVE_CONTEXT, monotonicMs: 100 }));
    current = reduceFluxObservatoryEvent(current, createConfigurationRequestEvent("second", current.activeConfiguration, { thresholds: { eotThreshold: 0.8 } }, { ...LIVE_CONTEXT, monotonicMs: 110 }));
    current = reduceFluxObservatoryEvent(current, providerEvent({ type: "ConfigureSuccess", sequence_id: 1, thresholds: { eot_threshold: 0.8 } }, 180));
    expect(current.configurationHistory[0].status).toBe("sent");
    expect(current.configurationHistory[1].status).toBe("provider-acknowledged");
    expect(current.activeConfiguration.thresholds.eotThreshold).toBe(0.8);
  });

  test("retains the last acknowledged configuration after provider rejection", () => {
    let current = state();
    const before = current.activeConfiguration;
    current = reduceFluxObservatoryEvent(current, createConfigurationRequestEvent("rejected", before, { keyterms: ["appointment"] }, { ...LIVE_CONTEXT, monotonicMs: 100 }));
    current = reduceFluxObservatoryEvent(current, providerEvent({ type: "ConfigureFailure", sequence_id: 1, code: "REJECTED", description: "Not applied" }, 180));
    expect(current.activeConfiguration).toEqual(before);
    expect(current.configurationHistory[0].status).toBe("provider-rejected");
    expect(current.configurationHistory[0].resultingConfiguration).toEqual(before);
  });

  test("requires explicit manual review before a live provider observation is marked validated", () => {
    const observed = reduceFluxObservatoryEvent(state(), providerEvent({ type: "Connected", sequence_id: 0 }));
    expect(observed.providerValidationState).toBe("provider-event-observed-unreviewed");
    expect(markFluxProviderValidationReviewed(observed).providerValidationState).toBe("manually-validated");
    expect(markFluxProviderValidationReviewed(state("synthetic-replay")).providerValidationState).toBe("synthetic-only");
  });

  test("uses explicit meaningful sample thresholds for median and P95", () => {
    expect(MIN_MEDIAN_SAMPLE_SIZE).toBe(3);
    expect(MIN_P95_SAMPLE_SIZE).toBe(20);
    expect(summarizeFluxTiming([10, 20])).toMatchObject({ sampleSize: 2, medianStatus: "insufficient-observations", p95Status: "insufficient-observations" });
    expect(summarizeFluxTiming([10, 20]).median).toBeUndefined();
    expect(summarizeFluxTiming([10, 20, 30]).median).toBe(20);
    const twenty = summarizeFluxTiming(Array.from({ length: 20 }, (_, index) => index + 1));
    expect(twenty.p95).toBe(19);
    expect(twenty.p95Status).toBe("available");
  });

  test("derives only objective local timing and never fabricates forced-timeout evidence", () => {
    const { state: replayState, metrics } = runFluxReplayFixture("eager-end-turn-resumed");
    expect(metrics.completedTurnCount).toBe(1);
    expect(metrics.resumedTurnCount).toBe(1);
    expect(metrics.startToEnd.sampleSize).toBe(1);
    expect(metrics.startToEnd.median).toBeUndefined();
    expect(metrics.forcedTimeoutCount).toBeNull();
    expect(deriveFluxMetrics(replayState).forcedTimeoutNote).toContain("does not expose");
  });

  test("derives reconnect and observed chunk cadence only from local lifecycle timestamps", () => {
    let current = state();
    current = reduceFluxObservatoryEvent(current, createLocalFluxEvent("audio-chunk-sent", { ...LIVE_CONTEXT, monotonicMs: 100 }, {}));
    current = reduceFluxObservatoryEvent(current, createLocalFluxEvent("audio-chunk-sent", { ...LIVE_CONTEXT, monotonicMs: 180 }, {}));
    current = reduceFluxObservatoryEvent(current, createLocalFluxEvent("audio-chunk-sent", { ...LIVE_CONTEXT, monotonicMs: 265 }, {}));
    current = reduceFluxObservatoryEvent(current, createLocalFluxEvent("reconnect-attempt", { ...LIVE_CONTEXT, connectionGeneration: 2, monotonicMs: 300 }, {}));
    current = reduceFluxObservatoryEvent(current, createLocalFluxEvent("websocket-open", { ...LIVE_CONTEXT, connectionGeneration: 2, monotonicMs: 480 }, {}));
    const metrics = deriveFluxMetrics(current);
    expect(metrics.observedChunkInterval).toMatchObject({ sampleSize: 2, minimum: 80, maximum: 85, median: undefined });
    expect(metrics.reconnectDuration).toMatchObject({ sampleSize: 1, minimum: 180, maximum: 180, p95: undefined });
  });

  test("ships fifteen uniquely named deterministic fixtures through the shared normalizer and reducer", () => {
    expect(FLUX_REPLAY_FIXTURES).toHaveLength(15);
    expect(new Set(FLUX_REPLAY_FIXTURES.map((fixture) => fixture.id)).size).toBe(15);
    for (const fixture of FLUX_REPLAY_FIXTURES) {
      expect(fixture.evidenceLabel).toBe("Synthetic fixture — not a live Deepgram result");
      const first = runFluxReplayFixture(fixture);
      const second = runFluxReplayFixture(fixture);
      expect(first.state.mode).toBe("synthetic-replay");
      expect(first.state.events.every((event) => event.evidenceLabel === fixture.evidenceLabel)).toBe(true);
      expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    }
  });

  test("covers configuration failure, reconnect isolation, malformed, future, multilingual, and rapid-turn fixtures", () => {
    expect(runFluxReplayFixture("dynamic-configuration-failure").state.activeConfiguration.keyterms).toEqual([]);
    expect(runFluxReplayFixture("token-expiry-reconnect").state.staleEventsIgnored).toBe(1);
    expect(runFluxReplayFixture("malformed-provider-event").metrics.malformedEventCount).toBe(1);
    expect(runFluxReplayFixture("unknown-future-event").metrics.unknownEventCount).toBe(1);
    expect(runFluxReplayFixture("multilingual-turn").state.turns[0].languages).toEqual(["es", "en"]);
    expect(runFluxReplayFixture("rapid-consecutive-turns").metrics.startToEnd).toMatchObject({ sampleSize: 3, medianStatus: "available", p95Status: "insufficient-observations" });
  });

  test("builds transcript-free, credential-free scorecard Markdown and JSON", () => {
    const result = runFluxReplayFixture("clean-completed-sentence");
    const scorecard = buildFluxScorecard(result.state, {
      runId: "safe-run",
      generatedAt: NOW,
      reviewerNotes: ["Authorization: Bearer fixture"],
      assumptions: ["Synthetic timing only"],
    });
    const markdown = exportFluxScorecardMarkdown(scorecard);
    const json = exportFluxScorecardJson(scorecard);
    for (const output of [markdown, json]) {
      expect(output).not.toContain("Please check my appointment");
      expect(output).not.toContain("secret-token-value");
      expect(output).not.toMatch(/authorizationHeader/i);
    }
    expect(markdown).toContain("n=1");
    expect(json).toContain('"transcriptsIncluded": false');
    expect(json).toContain('"rawAudioIncluded": false');
    expect(json).toContain('"credentialsIncluded": false');
  });

  test("generates a static sanitized Mermaid architecture without executable directives or credential values", () => {
    const mermaid = buildFluxMermaid(configuration({ model: "flux-general-multi", languageHints: ["en", "es"] }), { mode: "live-provider" });
    expect(mermaid).toContain("flowchart LR");
    expect(mermaid).toContain("Flux /v2/listen");
    expect(mermaid).toContain("Permanent API key - server only");
    expect(mermaid).toContain("Synthetic replay fixtures");
    expect(mermaid).not.toMatch(/%%\{|click\s|javascript:|https?:\/\//i);
    expect(mermaid).not.toMatch(/Authorization:|Bearer\s+[A-Za-z0-9._-]{8,}|eyJ[A-Za-z0-9_-]{8,}\./i);
  });

  test("creates typed transcript-free handoffs with the documented endpoint and evidence labels", () => {
    const result = runFluxReplayFixture("eager-end-turn-resumed");
    const handoffs = buildFluxHandoffs(result.state, {
      customerPattern: "Appointment workflow Authorization: Bearer fixture",
      unresolvedDiscoveryQuestions: ["What is the customer latency target?"],
    });
    const serialized = JSON.stringify(handoffs);
    expect(handoffs.apiLab.endpoint).toBe("/v2/listen");
    expect(handoffs.architectureStudio.turnEventFlow).toContain("TurnResumed");
    expect(handoffs.solutionDeliverablesStudio.sourceLabels).toContain("Synthetic fixture");
    expect(serialized).not.toContain("Cancel the order");
    expect(serialized).not.toContain("secret-token-value");
    expect(serialized).not.toMatch(/apiKey|accessToken|rawAudio/);
  });

  test("keeps the event buffer bounded without storing raw audio", () => {
    let current: FluxObservatoryState = createFluxObservatoryState({ sessionId: "bounded", mode: "live-provider", configuration: configuration(), createdAt: NOW, maxEvents: 100 });
    for (let index = 0; index < 130; index += 1) {
      current = reduceFluxObservatoryEvent(current, createLocalFluxEvent("audio-chunk-sent", { ...LIVE_CONTEXT, monotonicMs: index * 80 }, { byteLength: 2560 }));
    }
    expect(current.events).toHaveLength(100);
    expect(JSON.stringify(current)).not.toMatch(/ArrayBuffer|MediaStream|rawAudio/);
  });
});
