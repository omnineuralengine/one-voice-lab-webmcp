import { expect, test } from "@playwright/test";

import { createEvaluationCapabilitiesHandler, createEvaluationCatalogHandler, createEvaluationRunHandler } from "../../src/lib/evaluation/handlers";
import { EVALUATION_PRESETS } from "../../src/lib/evaluation/presets";
import { evaluationRunRequestSchema, type EvaluationRunRequest } from "../../src/lib/evaluation/schema";
import { classifyEvaluationAuthUser, hashEvaluationText } from "../../src/lib/evaluation/security";
import type { ProviderCatalogAdapter, ProviderId, ProviderTtsAdapter, ProviderTtsResult } from "../../src/lib/providers/types";

test.describe("Evaluate route handlers", () => {
  test("never promotes anonymous-auth or malformed subjects to member execution", () => {
    const humanId = "10000000-0000-4000-8000-000000000001";
    expect(classifyEvaluationAuthUser({ id: humanId })).toBe("member");
    expect(classifyEvaluationAuthUser({ id: humanId, is_anonymous: true })).toBe("unavailable");
    expect(classifyEvaluationAuthUser(null, { message: "Auth session missing" })).toBe("anonymous");
    expect(classifyEvaluationAuthUser({ id: "browser-value" })).toBe("unavailable");
  });
  test("returns canonical capabilities and fixture catalogs without touching providers", async () => {
    const environment = { NODE_ENV: "test", ONE_EVALUATE_MAX_TEXT_LENGTH: "999" };
    const capabilities = await createEvaluationCapabilitiesHandler(environment)();
    const capabilityBody = await capabilities.json();
    expect(capabilityBody.maximumTextLength).toBe(600);
    expect(capabilityBody.executionDefault).toBe("fixture");
    expect(capabilities.headers.get("x-content-type-options")).toBe("nosniff");

    let adapterCalls = 0;
    const catalogs = createEvaluationCatalogHandler({
      environment,
      resolveAdapter: () => {
        adapterCalls += 1;
        throw new Error("fixture catalog must not resolve an adapter");
      },
    });
    const response = await catalogs(new Request("http://localhost/api/evaluate/catalogs?provider=cartesia&mode=fixture"));
    expect(response.status).toBe(200);
    expect((await response.json()).source).toBe("deterministic-fixture");
    expect(adapterCalls).toBe(0);

    const hostedOpenLab = await createEvaluationCapabilitiesHandler({
      NODE_ENV: "production",
      OPEN_LAB_MODE: "true",
      ONE_LIVE_EVALS_ENABLED: "true",
      ONE_LIVE_LAB_ENABLED: "true",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key-placeholder-value",
      ELEVENLABS_API_KEY: "placeholder",
      OPEN_LAB_ELEVENLABS_ENABLED: "true",
      ONE_EVALUATE_ELEVENLABS_VOICE_IDS: "approved-stock-voice",
    })();
    const elevenLabs = (await hostedOpenLab.json()).providers.find((provider: { id: string }) => provider.id === "elevenlabs");
    expect(elevenLabs).toMatchObject({
      readiness: { configured: true, adapterBacked: true, liveEnabled: false },
      protectedLiveAvailable: false,
    });
  });

  test("runs fixture JSON fallback with no access or provider calls", async () => {
    let accessCalls = 0;
    let adapterCalls = 0;
    const handler = createEvaluationRunHandler({
      environment: { NODE_ENV: "test" },
      checkAccess: async () => {
        accessCalls += 1;
        throw new Error("fixture must not consume access");
      },
      resolveAdapter: () => {
        adapterCalls += 1;
        throw new Error("fixture must not resolve adapters");
      },
    });
    const response = await handler(jsonRequest("http://localhost/api/evaluate/run?format=json", fixtureRequest()));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.bundle.providerResults).toHaveLength(4);
    expect(body.events.filter((event: { type: string }) => event.type === "provider-result").every((event: { audioBase64: unknown }) => event.audioBase64 === null)).toBe(true);
    expect(accessCalls).toBe(0);
    expect(adapterCalls).toBe(0);
  });

  test("fails closed before live work when the evaluation kill switch or durable boundary is unavailable", async () => {
    const localRequest = fixtureRequest();
    localRequest.executionMode = "local-live";
    localRequest.confirmedPaidCalls = true;
    localRequest.providers = localRequest.providers.map((selection) => ({
      ...selection,
      model: "live-model",
      voice: selection.providerId === "deepgram" ? "live-model" : "live-voice",
      outputFormat: "pcm",
    }));
    let adapterCalls = 0;
    const disabled = createEvaluationRunHandler({
      environment: { NODE_ENV: "test", ONE_LIVE_EVALS_ENABLED: "false" },
      resolveAdapter: () => { adapterCalls += 1; throw new Error("must not run"); },
    });
    const disabledResponse = await disabled(jsonRequest("http://localhost/api/evaluate/run", localRequest));
    expect(disabledResponse.status).toBe(503);
    expect((await disabledResponse.json()).error.code).toBe("live_evaluations_disabled");
    expect(adapterCalls).toBe(0);

    localRequest.executionMode = "protected-live";
    const missingDurable = createEvaluationRunHandler({
      environment: {
        NODE_ENV: "production",
        ONE_LIVE_EVALS_ENABLED: "true",
        ONE_LIVE_LAB_ENABLED: "true",
        ONE_EVALUATE_ELEVENLABS_VOICE_IDS: "live-voice",
        ONE_EVALUATE_CARTESIA_VOICE_IDS: "live-voice",
      },
    });
    const durableResponse = await missingDurable(jsonRequest("https://one.test/api/evaluate/run", localRequest, "https://one.test"));
    expect(durableResponse.status).toBe(503);
    expect((await durableResponse.json()).error.code).toBe("durable_protection_unavailable");
  });

  test("streams production NDJSON and applies access before each of four mocked dispatches", async () => {
    const input = fixtureRequest();
    input.executionMode = "protected-live";
    input.confirmedPaidCalls = true;
    input.providers = input.providers.map((selection) => ({
      ...selection,
      model: `${selection.providerId}-model`,
      voice: selection.providerId === "deepgram" ? "deepgram-model" : `${selection.providerId}-voice`,
      outputFormat: "ignored-standardized",
    }));
    let accessCalls = 0;
    let guardCalls = 0;
    const accessContexts: Array<{ providerId?: string; endpointId?: string; units?: number }> = [];
    const handler = createEvaluationRunHandler({
      environment: {
        NODE_ENV: "production",
        ONE_LIVE_EVALS_ENABLED: "true",
        ONE_LIVE_LAB_ENABLED: "true",
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key-placeholder-value",
        OPEN_LAB_DEEPGRAM_ENABLED: "true",
        OPEN_LAB_ELEVENLABS_ENABLED: "true",
        OPEN_LAB_FISH_AUDIO_ENABLED: "true",
        OPEN_LAB_CARTESIA_ENABLED: "true",
        ONE_EVALUATE_ELEVENLABS_VOICE_IDS: "elevenlabs-voice",
        ONE_EVALUATE_CARTESIA_VOICE_IDS: "cartesia-voice",
      },
      resolveIdentity: async () => "member",
      checkAccess: async (_request, operation, context) => {
        expect(operation).toBe("speech_generation");
        accessContexts.push(context ?? {});
        accessCalls += 1;
        return { allowed: true, tier: "verified", operation, used: accessCalls, allowance: 100, remaining: 100 - accessCalls, resetsAt: "2026-08-27T00:00:00.000Z" };
      },
      requestGuard: async (_request, _provider, _operation, task) => {
        expect(accessCalls).toBeGreaterThan(guardCalls);
        guardCalls += 1;
        return task();
      },
      resolveAdapter: (providerId) => mockAdapter(providerId as ProviderId),
      isConfigured: () => true,
    });
    const response = await handler(jsonRequest("https://one.test/api/evaluate/run", input, "https://one.test"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line) as { type: string; bundle?: unknown });
    expect(events.filter((event) => event.type === "provider-result")).toHaveLength(4);
    expect(events.at(-1)?.type).toBe("run-complete");
    expect(events.at(-1)?.bundle).toBeTruthy();
    expect(accessCalls).toBe(4);
    expect(guardCalls).toBe(4);
    expect(accessContexts.map((context) => context.providerId).sort()).toEqual([
      "cartesia",
      "deepgram",
      "elevenlabs",
      "fish-audio",
    ]);
    expect(accessContexts.every((context) => context.endpointId === "evaluate:run")).toBe(true);
    expect(accessContexts.every((context) => context.units === input.scenario.text.length)).toBe(true);
  });

  test("rejects oversized bodies, hash mismatches, and credential-shaped configuration", async () => {
    const handler = createEvaluationRunHandler({ environment: { NODE_ENV: "test" } });
    const oversized = await handler(new Request("http://localhost/api/evaluate/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ padding: "x".repeat(50_000) }),
    }));
    expect(oversized.status).toBe(413);

    const wrongHash = fixtureRequest();
    wrongHash.scenario.inputHash = `sha256:${"0".repeat(64)}`;
    const hashResponse = await handler(jsonRequest("http://localhost/api/evaluate/run", wrongHash));
    expect(hashResponse.status).toBe(400);
    expect((await hashResponse.json()).error.code).toBe("evaluation_input_hash_mismatch");

    const unsafe = structuredClone(fixtureRequest()) as unknown as Record<string, unknown>;
    const providers = unsafe.providers as Array<Record<string, unknown>>;
    providers[0].providerSpecificConfiguration = { authorizationBackup: "should-never-pass" };
    const secretResponse = await handler(jsonRequest("http://localhost/api/evaluate/run", unsafe));
    expect(secretResponse.status).toBe(400);
    expect(JSON.stringify(await secretResponse.json())).not.toContain("should-never-pass");
  });

  test("rejects outer whitespace so the evidence hash matches the dispatched text", async () => {
    let adapterCalls = 0;
    const handler = createEvaluationRunHandler({
      environment: { NODE_ENV: "test" },
      resolveAdapter: () => {
        adapterCalls += 1;
        throw new Error("provider work must not start");
      },
    });

    for (const decorate of [(text: string) => ` ${text}`, (text: string) => `${text} `]) {
      const input = fixtureRequest();
      input.scenario.text = decorate(input.scenario.text);
      input.scenario.inputHash = hashEvaluationText(input.scenario.text);
      const response = await handler(jsonRequest("http://localhost/api/evaluate/run", input));
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("evaluation_input_outer_whitespace");
    }
    expect(adapterCalls).toBe(0);
  });

  test("rejects blind provider-native audio before any provider work", async () => {
    let adapterCalls = 0;
    const input = fixtureRequest();
    input.blind.enabled = true;
    input.evaluationMode = "provider-optimized";
    const handler = createEvaluationRunHandler({
      environment: { NODE_ENV: "test" },
      resolveAdapter: () => {
        adapterCalls += 1;
        throw new Error("provider work must not start");
      },
    });

    const response = await handler(jsonRequest("http://localhost/api/evaluate/run", input));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("blind_requires_standardized_audio");
    expect(adapterCalls).toBe(0);
  });

  test("keeps live runs standardized until native formats have a playable normalized boundary", async () => {
    let adapterCalls = 0;
    const input = liveRequest("local-live");
    input.blind.enabled = false;
    input.evaluationMode = "provider-optimized";
    const handler = createEvaluationRunHandler({
      environment: { NODE_ENV: "test" },
      resolveAdapter: () => {
        adapterCalls += 1;
        throw new Error("provider work must not start");
      },
    });

    const response = await handler(jsonRequest("http://localhost/api/evaluate/run", input));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("live_provider_optimized_unavailable");
    expect(adapterCalls).toBe(0);
  });

  test("rejects incoherent preset identifiers and unchanged customized-preset claims", async () => {
    const handler = createEvaluationRunHandler({ environment: { NODE_ENV: "test" } });
    const preset = EVALUATION_PRESETS[0];
    const mismatchedId = fixtureRequest();
    mismatchedId.scenario = {
      id: "mismatched-preset-id",
      version: preset.version,
      source: "preset",
      presetId: preset.id,
      inputType: "text",
      text: preset.text,
      inputHash: hashEvaluationText(preset.text),
    };

    const identifierResponse = await handler(jsonRequest("http://localhost/api/evaluate/run", mismatchedId));
    expect(identifierResponse.status).toBe(400);
    expect((await identifierResponse.json()).error.code).toBe("invalid_scenario_source");

    const unchangedCustomized = fixtureRequest();
    unchangedCustomized.scenario = {
      ...mismatchedId.scenario,
      id: preset.id,
      source: "customized-preset",
    };
    const customizedResponse = await handler(jsonRequest("http://localhost/api/evaluate/run", unchangedCustomized));
    expect(customizedResponse.status).toBe(400);
    expect((await customizedResponse.json()).error.code).toBe("customized_preset_text_unchanged");
  });

  test("keeps Deepgram's shared Aura model and voice identifier coupled", async () => {
    const input = liveRequest("local-live");
    const deepgram = input.providers.find((selection) => selection.providerId === "deepgram");
    if (!deepgram) throw new Error("Deepgram fixture is required");
    deepgram.voice = "a-different-aura-voice";

    const response = await createEvaluationRunHandler({ environment: { NODE_ENV: "test" } })(
      jsonRequest("http://localhost/api/evaluate/run", input),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("deepgram_voice_model_mismatch");
  });

  test("accepts the browser Origin through trusted forwarded host semantics and rejects cross-site origins", async () => {
    const handler = createEvaluationRunHandler({ environment: { NODE_ENV: "test" } });
    const forwarded = jsonRequest("http://localhost:3000/api/evaluate/run?format=json", fixtureRequest(), "http://127.0.0.1:3293", {
      host: "localhost:3000",
      "x-forwarded-host": "127.0.0.1:3293",
      "x-forwarded-proto": "http",
      "sec-fetch-site": "same-origin",
    });
    expect((await handler(forwarded)).status).toBe(200);

    const crossSite = jsonRequest("https://one.test/api/evaluate/run", fixtureRequest(), "https://evil.example", {
      host: "one.test",
      "sec-fetch-site": "cross-site",
    });
    const rejected = await handler(crossSite);
    expect(rejected.status).toBe(403);
    expect((await rejected.json()).error.code).toBe("cross_origin");
  });

  test("cancels a body whose declared Content-Length exceeds the request limit", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull() {
        // The declared size is enough to reject; the server must not pull this body.
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request("http://localhost/api/evaluate/run", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "50000" },
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    const response = await createEvaluationRunHandler({ environment: { NODE_ENV: "test" } })(request);
    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
  });

  test("blocks live provider work in Playwright unless the explicit smoke-test flag is enabled", async () => {
    const input = liveRequest("local-live");
    let adapterCalls = 0;
    const handler = createEvaluationRunHandler({
      environment: {
        NODE_ENV: "test",
        PLAYWRIGHT_E2E: "1",
        ONE_LIVE_EVALS_ENABLED: "true",
        OPEN_LAB_DEEPGRAM_ENABLED: "true",
        OPEN_LAB_ELEVENLABS_ENABLED: "true",
        OPEN_LAB_FISH_AUDIO_ENABLED: "true",
        OPEN_LAB_CARTESIA_ENABLED: "true",
      },
      resolveAdapter: () => {
        adapterCalls += 1;
        throw new Error("must not dispatch");
      },
    });
    const response = await handler(jsonRequest("http://localhost/api/evaluate/run", input));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("automated_live_provider_tests_disabled");
    expect(adapterCalls).toBe(0);
  });

  test("filters protected voice discovery to approved IDs while local discovery remains account-wide", async () => {
    const catalogAdapter = mockCatalogAdapter();
    const protectedHandler = createEvaluationCatalogHandler({
      environment: {
        NODE_ENV: "production",
        ONE_LIVE_EVALS_ENABLED: "true",
        ONE_LIVE_LAB_ENABLED: "true",
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key-placeholder-value",
        ELEVENLABS_API_KEY: "placeholder",
        OPEN_LAB_ELEVENLABS_ENABLED: "true",
        ONE_EVALUATE_ELEVENLABS_VOICE_IDS: "approved-stock-voice",
      },
      resolveIdentity: async () => "member",
      checkAccess: async () => ({ allowed: true, tier: "member", used: 1, allowance: 100, resetsAt: "2026-08-27T00:00:00.000Z" }),
      requestGuard: async (_request, _provider, _operation, task) => task(),
      resolveAdapter: () => catalogAdapter,
    });
    const protectedResponse = await protectedHandler(new Request(
      "https://one.test/api/evaluate/catalogs?provider=elevenlabs&mode=protected-live",
      { headers: { origin: "https://one.test", host: "one.test" } },
    ));
    expect(protectedResponse.status).toBe(200);
    const protectedBody = await protectedResponse.json();
    expect(protectedBody.voices.map((voice: { id: string }) => voice.id)).toEqual(["approved-stock-voice"]);
    expect(protectedBody.hasMoreVoices).toBe(false);

    const localHandler = createEvaluationCatalogHandler({
      environment: {
        NODE_ENV: "test",
        ONE_LIVE_EVALS_ENABLED: "true",
        ELEVENLABS_API_KEY: "placeholder",
        OPEN_LAB_ELEVENLABS_ENABLED: "true",
      },
      checkAccess: async () => ({ allowed: true, tier: "member", used: 1, allowance: 100, resetsAt: "2026-08-27T00:00:00.000Z" }),
      requestGuard: async (_request, _provider, _operation, task) => task(),
      resolveAdapter: () => catalogAdapter,
    });
    const localResponse = await localHandler(new Request(
      "http://localhost/api/evaluate/catalogs?provider=elevenlabs&mode=local-live",
      { headers: { origin: "http://localhost", host: "localhost" } },
    ));
    expect(localResponse.status).toBe(200);
    expect((await localResponse.json()).voices.map((voice: { id: string }) => voice.id)).toEqual([
      "approved-stock-voice",
      "private-account-voice",
    ]);
  });

  test("rejects anonymous protected access to an account-scoped model catalog before adapter work", async () => {
    let adapterCalls = 0;
    let accessCalls = 0;
    const handler = createEvaluationCatalogHandler({
      environment: {
        NODE_ENV: "production",
        ONE_LIVE_EVALS_ENABLED: "true",
        ONE_LIVE_EVALS_ANONYMOUS_ENABLED: "true",
        ONE_LIVE_LAB_ENABLED: "true",
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key-placeholder-value",
        LAB_USAGE_GUARD_TOKEN: "opaque-test-guard-placeholder",
        ELEVENLABS_API_KEY: "placeholder",
        OPEN_LAB_ELEVENLABS_ENABLED: "true",
        ONE_EVALUATE_ELEVENLABS_VOICE_IDS: "approved-stock-voice",
      },
      resolveIdentity: async () => "anonymous",
      checkAccess: async () => {
        accessCalls += 1;
        throw new Error("account-scoped discovery must fail before quota admission");
      },
      resolveAdapter: () => {
        adapterCalls += 1;
        return mockCatalogAdapter();
      },
    });

    const response = await handler(new Request(
      "https://one.test/api/evaluate/catalogs?provider=elevenlabs&mode=protected-live",
      { headers: { origin: "https://one.test", host: "one.test" } },
    ));
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("account_scoped_catalog_requires_authentication");
    expect(accessCalls).toBe(0);
    expect(adapterCalls).toBe(0);
  });

  test("independently rejects unapproved hosted voices before access or adapter work", async () => {
    const input = liveRequest("protected-live");
    let accessCalls = 0;
    let adapterCalls = 0;
    const response = await createEvaluationRunHandler({
      environment: {
        NODE_ENV: "production",
        ONE_LIVE_EVALS_ENABLED: "true",
        ONE_LIVE_LAB_ENABLED: "true",
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key-placeholder-value",
        ONE_EVALUATE_ELEVENLABS_VOICE_IDS: "different-approved-voice",
        ONE_EVALUATE_CARTESIA_VOICE_IDS: "different-approved-voice",
      },
      checkAccess: async () => {
        accessCalls += 1;
        throw new Error("must not consume quota");
      },
      resolveAdapter: () => {
        adapterCalls += 1;
        throw new Error("must not dispatch");
      },
    })(jsonRequest("https://one.test/api/evaluate/run", input, "https://one.test"));
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("voice_not_approved");
    expect(accessCalls).toBe(0);
    expect(adapterCalls).toBe(0);
  });
});

function jsonRequest(url: string, body: unknown, origin?: string, extraHeaders: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(origin ? { origin } : {}), ...extraHeaders },
    body: JSON.stringify(body),
  });
}

function liveRequest(executionMode: "protected-live" | "local-live"): EvaluationRunRequest {
  const input = fixtureRequest();
  input.executionMode = executionMode;
  input.confirmedPaidCalls = true;
  input.providers = input.providers.map((selection) => ({
    ...selection,
    model: `${selection.providerId}-model`,
    voice: selection.providerId === "deepgram" ? `${selection.providerId}-model` : `${selection.providerId}-voice`,
    outputFormat: "ignored-standardized",
  }));
  return input;
}

function fixtureRequest(): EvaluationRunRequest {
  const text = "ONE exact fixture text.";
  const providers: ProviderId[] = ["deepgram", "elevenlabs", "fish-audio", "cartesia"];
  return evaluationRunRequestSchema.parse({
    schemaVersion: "one-voice-evidence/1.0.0",
    evaluationId: "00000000-0000-4000-8000-000000000001",
    runId: "00000000-0000-4000-8000-000000000002",
    scenario: { id: "custom-fixture", version: "1.0.0", source: "custom", presetId: null, inputType: "text", text, inputHash: hashEvaluationText(text) },
    evaluationMode: "standardized",
    executionMode: "fixture",
    providers: providers.map((providerId) => ({ providerId, model: `fixture-${providerId}-tts-v1`, voice: `fixture-${providerId}-voice-v1`, outputFormat: "fixture-wav", providerSpecificConfiguration: {} })),
    blind: { enabled: true, seed: "deterministic-test-seed" },
    confirmedPaidCalls: false,
  });
}

function mockAdapter(providerId: ProviderId): ProviderTtsAdapter {
  return {
    providerId,
    capability: "tts",
    adapterVersion: `mock-${providerId}/1.0.0`,
    buildEndpointPreview: () => "https://invalid.example.test",
    execute: async (): Promise<ProviderTtsResult> => ({
      audio: new Uint8Array(4_800).buffer,
      contentType: "audio/pcm",
      model: `${providerId}-model`,
      voice: `${providerId}-voice`,
      encoding: "pcm_s16le",
      container: "none",
      sampleRate: 24_000,
      outputFormat: "pcm",
      responseHeaders: {},
      timing: {
        clock: "monotonic",
        measurementPoint: "one-server",
        requestTimestamp: "2026-08-26T12:00:00.000Z",
        firstAudioTimestamp: "2026-08-26T12:00:00.004Z",
        completionTimestamp: "2026-08-26T12:00:00.009Z",
        timeToFirstAudioMs: 4,
        totalTimeMs: 9,
      },
    }),
  };
}

function mockCatalogAdapter(): ProviderCatalogAdapter {
  return {
    providerId: "elevenlabs",
    capabilities: ["models", "voices"],
    adapterVersion: "mock-elevenlabs-catalog/1.0.0",
    listModels: async () => ({
      provider: "elevenlabs",
      models: [{
        provider: "elevenlabs",
        id: "eleven-tts-model",
        name: "Mock TTS model",
        capabilities: { textToSpeech: true },
        languages: [],
      }],
    }),
    listVoices: async (input) => {
      const voices = [
        { provider: "elevenlabs" as const, id: "approved-stock-voice", name: "Approved stock voice", labels: {}, previewAvailable: false },
        { provider: "elevenlabs" as const, id: "private-account-voice", name: "Private account voice", labels: {}, previewAvailable: false },
      ].filter((voice) => !input.voiceIds || input.voiceIds.includes(voice.id));
      return { provider: "elevenlabs", voices, hasMore: true, nextPageToken: "private-page" };
    },
  };
}
