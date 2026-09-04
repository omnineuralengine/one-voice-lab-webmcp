import { expect, test } from "@playwright/test";

import { PROVIDER_ADAPTER_REGISTRATIONS } from "../../src/lib/providers/adapters";
import { executeDeepgramRequest } from "../../src/lib/deepgram-executor";
import { getProviderCatalogEntry } from "../../src/lib/providers/catalog";
import {
  executeProviderFixtureContract,
  validateProviderContractCandidate,
} from "../../src/lib/providers/contract-test-kit";
import {
  deepgramNormalizedDiscoveryAdapter,
  deepgramSttAdapter,
  deepgramTtsAdapter,
} from "../../src/lib/providers/deepgram/adapters";
import {
  DEEPGRAM_CONTRACT_CANDIDATE,
  DEEPGRAM_FIXTURE_ADAPTERS,
} from "../../src/lib/providers/deepgram/fixtures";
import {
  DEEPGRAM_NORMALIZED_MODELS,
  DEEPGRAM_NORMALIZED_VOICES,
  DeepgramNormalizationError,
  normalizeDeepgramTranscriptionResponse,
} from "../../src/lib/providers/deepgram/normalization";
import {
  authorizeProviderExecution,
  setProviderExecutionPolicyResolverForTests,
} from "../../src/lib/providers/execution-policy";
import { getProviderPlatformProjection } from "../../src/lib/providers/platform-service";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_KEY = process.env.DEEPGRAM_API_KEY;
const ORIGINAL_OPEN_LAB = process.env.OPEN_LAB_MODE;
const ORIGINAL_ENABLED = process.env.OPEN_LAB_DEEPGRAM_ENABLED;

test.afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  restore("DEEPGRAM_API_KEY", ORIGINAL_KEY);
  restore("OPEN_LAB_MODE", ORIGINAL_OPEN_LAB);
  restore("OPEN_LAB_DEEPGRAM_ENABLED", ORIGINAL_ENABLED);
  setProviderExecutionPolicyResolverForTests();
});

test.describe("Deepgram canonical core provider convergence", () => {
  test("registers stable identity, exact core capabilities, discovery, credential, and fixtures", () => {
    const entry = getProviderCatalogEntry("deepgram");
    const registration = PROVIDER_ADAPTER_REGISTRATIONS.deepgram;

    expect(entry?.capabilities.map((capability) => capability.id)).toEqual([
      "discovery.models",
      "discovery.voices",
      "stt.prerecorded",
      "tts.batch",
      "tts.voice-selection",
    ]);
    expect(registration?.credentialEnvironmentVariables).toEqual(["DEEPGRAM_API_KEY"]);
    expect(registration?.normalizedDiscovery).toBe(deepgramNormalizedDiscoveryAdapter);
    expect(registration?.sttPrerecorded).toBe(deepgramSttAdapter);
    expect(registration?.tts).toBe(deepgramTtsAdapter);
    expect(registration?.fixtureAdapters).toHaveLength(4);
    expect(validateProviderContractCandidate(DEEPGRAM_CONTRACT_CANDIDATE)).toEqual({ valid: true, issues: [] });
  });

  test("executes deterministic synthetic core fixtures without network activity or performance claims", async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; throw new Error("network must remain unused"); };

    for (const adapter of DEEPGRAM_FIXTURE_ADAPTERS) {
      const execution = await executeProviderFixtureContract(adapter, {
        text: "deterministic Deepgram fixture",
        audio: Uint8Array.of(1, 2, 3),
      }, { timeoutMs: 100 });
      expect(execution).toMatchObject({
        ok: true,
        result: { providerId: "deepgram", provenance: "synthetic-fixture", status: "complete" },
      });
      expect(JSON.stringify(execution)).not.toMatch(/latency|pricing|quality|healthy/i);
    }
    expect(calls).toBe(0);
  });

  test("projects static normalized discovery with deterministic bounded voice pagination", async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; throw new Error("network must remain unused"); };

    const models = await deepgramNormalizedDiscoveryAdapter.listModels();
    const firstVoices = await deepgramNormalizedDiscoveryAdapter.listVoices({ pageSize: 2, search: "aura-2" });
    const secondVoices = await deepgramNormalizedDiscoveryAdapter.listVoices({
      pageSize: 2,
      search: "aura-2",
      nextPageToken: firstVoices.nextPageToken,
    });

    expect(models).toEqual({ providerId: "deepgram", state: "static", models: DEEPGRAM_NORMALIZED_MODELS });
    expect(firstVoices).toMatchObject({ providerId: "deepgram", state: "static", hasMore: true, nextPageToken: "2" });
    expect(firstVoices.voices).toHaveLength(2);
    expect(secondVoices.voices[0]?.providerVoiceId).toBe(DEEPGRAM_NORMALIZED_VOICES[2]?.providerVoiceId);
    expect(calls).toBe(0);
  });

  test("terminates arbitrary upstream transcript fields at the normalization boundary", () => {
    const normalized = normalizeDeepgramTranscriptionResponse({
      account: "must-not-survive",
      metadata: { request_id: "request-fixture", duration: 1.25, channels: 1, billing: "private" },
      results: {
        channels: [{
          detected_language: "en",
          private_channel_metadata: "must-not-survive",
          alternatives: [{
            transcript: "Fixture transcript.",
            confidence: 0.98,
            words: [{ word: "Fixture", start: 0, end: 0.5, confidence: 0.9, private: "must-not-survive" }],
            private_alternative_metadata: "must-not-survive",
          }],
        }],
      },
    });

    expect(normalized).toMatchObject({
      transcript: "Fixture transcript.",
      language: "en",
      requestId: "request-fixture",
      details: { channelCount: 1, wordCount: 1, durationSeconds: 1.25 },
    });
    expect(JSON.stringify(normalized)).not.toContain("must-not-survive");
    expect(() => normalizeDeepgramTranscriptionResponse({ results: { channels: [] } }))
      .toThrow(DeepgramNormalizationError);
  });

  test("separates installed, fixture, credential, runtime, and health states", () => {
    const unconfigured = getProviderPlatformProjection("deepgram", { environment: {}, policies: [] });
    const configured = getProviderPlatformProjection("deepgram", {
      environment: { DEEPGRAM_API_KEY: "server-only-marker", ONE_LIVE_LAB_ENABLED: "true" },
      policies: [],
    });

    expect(unconfigured).toMatchObject({
      id: "deepgram",
      lifecycle: { integration: "contract-tests-passed", runtime: "disabled", benchmark: "ineligible" },
      readiness: { state: "adapter-backed" },
      credential: { required: true, state: "unconfigured" },
      health: { state: "disabled" },
      integration: { installed: true, fixtureCapable: true },
    });
    expect(unconfigured?.models.length).toBe(DEEPGRAM_NORMALIZED_MODELS.length);
    expect(unconfigured?.voices.length).toBe(DEEPGRAM_NORMALIZED_VOICES.length);
    expect(unconfigured?.capabilities.find((capability) => capability.id === "stt.prerecorded")).toMatchObject({
      verification: "integration-supported",
      lastVerifiedAt: "2026-08-29",
      sources: expect.arrayContaining([
        expect.objectContaining({
          url: "https://developers.deepgram.com/reference/speech-to-text/listen-pre-recorded",
          verifiedAt: "2026-08-29",
        }),
      ]),
    });
    expect(configured).toMatchObject({
      lifecycle: { integration: "configured", runtime: "disabled" },
      readiness: { state: "configured" },
      credential: { state: "configured-not-runtime-verified" },
      health: { state: "disabled" },
    });
    expect(JSON.stringify(configured)).not.toContain("server-only-marker");
    expect(JSON.stringify(configured)).not.toContain("DEEPGRAM_API_KEY");
  });

  test("fails direct core adapter calls closed before transport despite credential presence", async () => {
    process.env.DEEPGRAM_API_KEY = "deepgram-secret-that-must-not-surface";
    process.env.OPEN_LAB_MODE = "false";
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; throw new Error("transport must not run"); };

    await expect(deepgramTtsAdapter.execute({ text: "must not dispatch", model: "aura-2-thalia-en" }))
      .rejects.toMatchObject({ code: "provider_access_unavailable", status: 503 });
    await expect(deepgramSttAdapter.execute({ file: wavFile(), model: "nova-3" }))
      .rejects.toMatchObject({ code: "provider_access_unavailable", status: 503 });
    expect(calls).toBe(0);
  });

  test("binds policy proof to the exact Deepgram core operation", async () => {
    allowCanonicalExecution();
    const modelAuthorization = await authorizeProviderExecution("deepgram", "models");
    const sttAuthorization = await authorizeProviderExecution("deepgram", "stt");
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; throw new Error("transport must not run"); };

    await expect(deepgramTtsAdapter.execute(
      { text: "wrong proof", model: "aura-2-thalia-en" },
      { authorization: modelAuthorization },
    )).rejects.toMatchObject({ code: "provider_access_unavailable" });
    await expect(deepgramTtsAdapter.execute(
      { text: "wrong proof", model: "aura-2-thalia-en" },
      { authorization: sttAuthorization },
    )).rejects.toMatchObject({ code: "provider_access_unavailable" });
    expect(calls).toBe(0);
  });

  test("defers account-private project model discovery before raw provider payloads can escape", async () => {
    allowCanonicalExecution();
    const authorization = await authorizeProviderExecution("deepgram", "models");
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error("project model transport must remain deferred");
    };

    await expect(executeDeepgramRequest({
      endpointId: "models-project-list",
      path: { project_id: "project-fixture" },
      query: { limit: 10, page: 0 },
    }, undefined, { authorization })).rejects.toMatchObject({
      code: "project_model_discovery_deferred",
      status: 403,
    });
    expect(calls).toBe(0);
  });

  test("keeps prerecorded cancellation and stalled response bodies bounded", async () => {
    allowCanonicalExecution();
    process.env.DEEPGRAM_API_KEY = "deepgram-secret-that-must-not-surface";
    process.env.OPEN_LAB_MODE = "false";
    const authorization = await authorizeProviderExecution("deepgram", "stt");

    let calls = 0;
    const preAborted = new AbortController();
    preAborted.abort();
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error("pre-aborted work must not dispatch");
    };
    await expect(deepgramSttAdapter.execute(
      { file: wavFile(), model: "nova-3" },
      { authorization, signal: preAborted.signal },
    )).rejects.toMatchObject({ code: "provider_failure", upstreamStatus: undefined });
    expect(calls).toBe(0);

    globalThis.fetch = async () => {
      calls += 1;
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new DOMException("fixture body timeout", "TimeoutError"));
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    };
    await expect(deepgramSttAdapter.execute(
      { file: wavFile(), model: "nova-3" },
      { authorization },
    )).rejects.toMatchObject({ code: "provider_timeout", status: 504 });

    globalThis.fetch = async () => {
      calls += 1;
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new DOMException("fixture error-body timeout", "TimeoutError"));
        },
      }), { status: 503, headers: { "content-type": "application/json" } });
    };
    await expect(deepgramSttAdapter.execute(
      { file: wavFile(), model: "nova-3" },
      { authorization },
    )).rejects.toMatchObject({ code: "provider_timeout", status: 504 });

    const bodyCancelled = new AbortController();
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(new ReadableStream<Uint8Array>({ start() {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const pending = deepgramSttAdapter.execute(
      { file: wavFile(), model: "nova-3" },
      { authorization, signal: bodyCancelled.signal },
    );
    await expect.poll(() => calls).toBe(3);
    bodyCancelled.abort();
    await expect(pending).rejects.toMatchObject({ code: "provider_failure", upstreamStatus: undefined });
  });
});

function allowCanonicalExecution() {
  setProviderExecutionPolicyResolverForTests(async (providerId, capabilityId) => ({
    ok: true,
    value: {
      known: true,
      providerId,
      capabilityId: capabilityId as "tts.batch",
      accessMode: "public-use",
      runtimeStatus: "enabled",
      benchmarkStatus: "ineligible",
      providerRevision: 1,
      capabilityRevision: 1,
    },
  }));
}

function wavFile(): File {
  const bytes = new Uint8Array(48);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  new DataView(bytes.buffer).setUint32(4, 40, true);
  bytes.set(new TextEncoder().encode("WAVEfmt "), 8);
  new DataView(bytes.buffer).setUint32(16, 16, true);
  new DataView(bytes.buffer).setUint16(20, 1, true);
  new DataView(bytes.buffer).setUint16(22, 1, true);
  new DataView(bytes.buffer).setUint32(24, 8_000, true);
  new DataView(bytes.buffer).setUint32(28, 8_000, true);
  new DataView(bytes.buffer).setUint16(32, 1, true);
  new DataView(bytes.buffer).setUint16(34, 8, true);
  bytes.set(new TextEncoder().encode("data"), 36);
  new DataView(bytes.buffer).setUint32(40, 4, true);
  return new File([bytes], "fixture.wav", { type: "audio/wav", lastModified: 1 });
}

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
