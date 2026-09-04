import { expect, test } from "@playwright/test";

import { POST as postTts } from "../../src/app/api/providers/[provider]/tts/route";
import { GET as getVoices } from "../../src/app/api/providers/[provider]/voices/route";
import { PROVIDER_ADAPTER_REGISTRATIONS } from "../../src/lib/providers/adapters";
import {
  cartesiaNormalizedDiscoveryAdapter,
  cartesiaTtsAdapter,
} from "../../src/lib/providers/cartesia/adapters";
import {
  CARTESIA_API_VERSION,
  generateCartesiaSpeech,
  listCartesiaModels,
  listCartesiaVoices,
} from "../../src/lib/providers/cartesia/client";
import {
  CARTESIA_CONTRACT_CANDIDATE,
  CARTESIA_DISCOVERY_FIXTURES,
  CARTESIA_FIXTURE_ADAPTERS,
} from "../../src/lib/providers/cartesia/fixtures";
import {
  CartesiaNormalizationError,
  normalizeCartesiaVoicePage,
} from "../../src/lib/providers/cartesia/normalization";
import { getProviderCatalogEntry } from "../../src/lib/providers/catalog";
import {
  executeProviderFixtureContract,
  validateProviderContractCandidate,
} from "../../src/lib/providers/contract-test-kit";
import { ProviderOperationError } from "../../src/lib/providers/errors";
import { getProtectedEvaluationVoiceIds } from "../../src/lib/evaluation/runtime";
import {
  authorizeProviderExecution,
  setProviderExecutionPolicyResolverForTests,
  type ProviderExecutionAuthorization,
} from "../../src/lib/providers/execution-policy";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_KEY = process.env.CARTESIA_API_KEY;
const SECRET_MARKER = "cartesia-fixture-secret-must-not-return";
const CARTESIA_CONTEXT = { params: Promise.resolve({ provider: "cartesia" }) };

test.beforeEach(() => {
  process.env.CARTESIA_API_KEY = SECRET_MARKER;
});

test.afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  restore("CARTESIA_API_KEY", ORIGINAL_KEY);
  setProviderExecutionPolicyResolverForTests();
});

test.describe("Cartesia provider adapter", () => {
  test("registers stable identity, exact capabilities, normalized discovery, and fixture contracts", () => {
    const entry = getProviderCatalogEntry("cartesia");
    const registration = PROVIDER_ADAPTER_REGISTRATIONS.cartesia;

    expect(entry?.capabilities.map((capability) => capability.id)).toEqual([
      "discovery.models",
      "discovery.voices",
      "tts.batch",
      "tts.voice-selection",
    ]);
    expect(registration?.credentialEnvironmentVariables).toEqual(["CARTESIA_API_KEY"]);
    expect(registration?.normalizedDiscovery).toBe(cartesiaNormalizedDiscoveryAdapter);
    expect(registration?.fixtureAdapters).toHaveLength(3);
    expect(validateProviderContractCandidate(CARTESIA_CONTRACT_CANDIDATE)).toEqual({ valid: true, issues: [] });
  });

  test("keeps the protected Cartesia account-voice allowlist within the adapter fan-out bound", () => {
    const configured = Array.from({ length: 12 }, (_, index) => `cartesia_voice_${index}`).join(",");
    expect([...getProtectedEvaluationVoiceIds("cartesia", {
      ONE_EVALUATE_CARTESIA_VOICE_IDS: configured,
    })!]).toHaveLength(10);
  });

  test("executes deterministic synthetic fixtures without network or performance claims", async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; throw new Error("network must remain unused"); };

    for (const adapter of CARTESIA_FIXTURE_ADAPTERS) {
      const execution = await executeProviderFixtureContract(adapter, {
        text: "deterministic Cartesia fixture",
      }, { timeoutMs: 100 });
      expect(execution).toMatchObject({
        ok: true,
        result: { providerId: "cartesia", provenance: "synthetic-fixture", status: "complete" },
      });
    }
    expect(calls).toBe(0);
  });

  test("normalizes only canonical account-scoped voice fields", () => {
    const normalized = normalizeCartesiaVoicePage(CARTESIA_DISCOVERY_FIXTURES.voices);

    expect(normalized.voices[0]).toMatchObject({
      providerId: "cartesia",
      providerVoiceId: "cartesia_fixture_voice",
      displayName: "Cartesia Fixture Voice",
      languages: ["en"],
    });
    const serialized = JSON.stringify(normalized);
    for (const privateValue of ["must-not-survive", "owner_id", "private-preview"]) {
      expect(serialized).not.toContain(privateValue);
    }
    expect(() => normalizeCartesiaVoicePage(CARTESIA_DISCOVERY_FIXTURES.malformedVoices))
      .toThrow(CartesiaNormalizationError);
  });

  test("keeps generic voice listing and synthesis closed without canonical authorization", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error("provider dispatch must not run");
    };

    const synthesis = await postTts(new Request("http://local/api/providers/cartesia/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "bounded", model: "sonic-3.5", voice: "unapproved-private-voice" }),
    }), CARTESIA_CONTEXT);
    const voices = await getVoices(
      new Request("http://local/api/providers/cartesia/voices"),
      CARTESIA_CONTEXT,
    );

    expect(synthesis.status).toBe(503);
    expect((await synthesis.json()).error.code).toBe("provider_demo_only");
    expect(voices.status).toBe(503);
    expect((await voices.json()).error.code).toBe("provider_demo_only");
    expect(calls).toBe(0);
  });

  test("exposes only the validated static model identifiers", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error("model discovery must not make a network request");
    };

    const result = await listCartesiaModels();

    expect(result.models.map((model) => model.id)).toEqual(["sonic-3.5", "sonic-3"]);
    expect(calls).toBe(0);
  });

  test("discovers voices with bounded current-version headers and sanitized metadata", async () => {
    const { voices } = await authorizeCartesiaOperations();
    let requestedUrl = "";
    let requestHeaders = new Headers();
    globalThis.fetch = async (input, init) => {
      requestedUrl = String(input);
      requestHeaders = new Headers(init?.headers);
      return Response.json({
        data: [{
          id: "voice-fixture-01",
          name: "Fixture Voice",
          description: "Mock-only voice metadata.",
          language: "en",
          gender: "feminine",
          preview_file_url: "https://example.invalid/fixture.wav",
          embedding: SECRET_MARKER,
        }],
        has_more: true,
        next_page: "voice-fixture-next",
      });
    };

    const result = await listCartesiaVoices({ pageSize: 20, search: "fixture" }, { authorization: voices });

    expect(requestedUrl).toContain("/voices?");
    expect(requestedUrl).toContain("limit=20");
    expect(requestedUrl).toContain("q=fixture");
    expect(requestedUrl).not.toContain("expand%5B%5D");
    expect(requestHeaders.get("authorization")).toBe(`Bearer ${SECRET_MARKER}`);
    expect(requestHeaders.get("cartesia-version")).toBe(CARTESIA_API_VERSION);
    expect(result).toEqual({
      provider: "cartesia",
      voices: [{
        provider: "cartesia",
        id: "voice-fixture-01",
        name: "Fixture Voice",
        labels: { languages: "en" },
        previewAvailable: false,
      }],
      hasMore: true,
      nextPageToken: "voice-fixture-next",
      discoveryState: "live",
    });
    expect(JSON.stringify(result)).not.toContain(SECRET_MARKER);
  });

  test("sends raw 24 kHz pcm_s16le and records server-monotonic stream timing", async () => {
    const { tts, voices } = await authorizeCartesiaOperations();
    let requestBody: unknown;
    let requestHeaders = new Headers();
    globalThis.fetch = async (input, init) => {
      if (String(input).includes("/voices?")) return cartesiaVoiceList("voice-fixture-01");
      requestBody = JSON.parse(String(init?.body));
      requestHeaders = new Headers(init?.headers);
      return new Response(audioStream([new Uint8Array([1, 0]), new Uint8Array([2, 0])]), {
        status: 200,
        headers: { "content-type": "application/octet-stream", "request-id": "cartesia-request-fixture" },
      });
    };

    const result = await cartesiaTtsAdapter.execute({
      text: "Cartesia standardized fixture.",
      model: "sonic-3.5",
      voice: "voice-fixture-01",
      outputFormat: "raw",
      encoding: "pcm_s16le",
      container: "raw",
      sample_rate: 24_000,
    }, { authorization: tts, discoveryAuthorization: voices, maxAudioBytes: 8 });

    expect(cartesiaTtsAdapter.adapterVersion).toBe("one-cartesia-core/2.0.0");
    expect(requestHeaders.get("authorization")).toBe(`Bearer ${SECRET_MARKER}`);
    expect(requestHeaders.get("cartesia-version")).toBe(CARTESIA_API_VERSION);
    expect(requestBody).toEqual({
      model_id: "sonic-3.5",
      transcript: "Cartesia standardized fixture.",
      voice: { id: "voice-fixture-01" },
      output_format: { container: "raw", encoding: "pcm_s16le", sample_rate: 24_000 },
    });
    expect(Array.from(new Uint8Array(result.audio))).toEqual([1, 0, 2, 0]);
    expect(result).toMatchObject({
      contentType: "audio/pcm",
      model: "sonic-3.5",
      voice: "voice-fixture-01",
      encoding: "pcm_s16le",
      container: "raw",
      sampleRate: 24_000,
      outputFormat: "raw",
      requestId: "cartesia-request-fixture",
      timing: { clock: "monotonic", measurementPoint: "one-server" },
    });
    expect(result.timing.timeToFirstAudioMs).toBeGreaterThanOrEqual(0);
    expect(result.timing.totalTimeMs).toBeGreaterThanOrEqual(result.timing.timeToFirstAudioMs);
  });

  test("cancels and sanitizes an oversized streamed audio response at the caller boundary", async () => {
    const { tts, voices } = await authorizeCartesiaOperations();
    let cancelled = false;
    globalThis.fetch = async (input) => {
      if (String(input).includes("/voices?")) return cartesiaVoiceList("voice-fixture-01");
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 0]));
          controller.enqueue(new Uint8Array([2, 0]));
        },
        cancel() {
          cancelled = true;
        },
      }), { headers: { "content-type": "application/octet-stream" } });
    };

    const promise = generateCartesiaSpeech({
      text: "Bounded fixture.",
      model: "sonic-3.5",
      voice: "voice-fixture-01",
      outputFormat: "raw",
    }, { authorization: tts, discoveryAuthorization: voices, maxAudioBytes: 2 });

    await expect(promise).rejects.toMatchObject({
      code: "provider_malformed_response",
      providerId: "cartesia",
    });
    expect(cancelled).toBe(true);
  });

  test("bounds and cancels an oversized TTS error body before normalizing its status", async () => {
    const { tts, voices } = await authorizeCartesiaOperations();
    let cancelled = false;
    globalThis.fetch = async (input) => {
      if (String(input).includes("/voices?")) return cartesiaVoiceList("voice-fixture-01");
      return new Response(new ReadableStream<Uint8Array>({
        pull() {
          // The declared length is enough to reject without reading details.
        },
        cancel() { cancelled = true; },
      }), {
        status: 429,
        headers: { "content-length": String(8 * 1024 + 1) },
      });
    };

    await expect(generateCartesiaSpeech({
      text: "Bounded provider error fixture.",
      model: "sonic-3.5",
      voice: "voice-fixture-01",
      outputFormat: "raw",
    }, { authorization: tts, discoveryAuthorization: voices })).rejects.toMatchObject({
      code: "provider_rate_limited",
      providerId: "cartesia",
      upstreamStatus: 429,
    });
    expect(cancelled).toBe(true);
  });

  test("rejects an unavailable safe-looking voice ID before paid synthesis", async () => {
    const { tts, voices } = await authorizeCartesiaOperations();
    const requestedUrls: string[] = [];
    globalThis.fetch = async (input) => {
      requestedUrls.push(String(input));
      return Response.json({ data: [], has_more: false, next_page: null });
    };

    const promise = generateCartesiaSpeech({
      text: "Voice validation fixture.",
      model: "sonic-3.5",
      voice: "random-safe-looking-id",
      outputFormat: "raw",
    }, { authorization: tts, discoveryAuthorization: voices });

    await expect(promise).rejects.toMatchObject({ code: "invalid_request", providerId: "cartesia" });
    expect(requestedUrls).toHaveLength(1);
    expect(requestedUrls[0]).toContain("/voices?");
    expect(requestedUrls.some((url) => url.includes("/tts/bytes"))).toBe(false);
  });

  test("rejects malformed UTF-8 voice metadata with a normalized error", async () => {
    const { voices } = await authorizeCartesiaOperations();
    let cancelled = false;
    globalThis.fetch = async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Uint8Array.from([0xc3, 0x28]));
        controller.close();
      },
      cancel() { cancelled = true; },
    }));

    await expect(listCartesiaVoices({ pageSize: 10 }, { authorization: voices })).rejects.toMatchObject({
      code: "provider_malformed_response",
      providerId: "cartesia",
    });
    // The stream is fully read before UTF-8 validation, so cancellation is not
    // required for this malformed-but-bounded body.
    expect(cancelled).toBe(false);
  });

  test("propagates caller cancellation while reading a pending voice catalog body", async () => {
    const { voices } = await authorizeCartesiaOperations();
    let cancelled = false;
    globalThis.fetch = async () => new Response(new ReadableStream<Uint8Array>({
      pull() {
        // Pending until the caller cancels discovery.
      },
      cancel() { cancelled = true; },
    }));
    const controller = new AbortController();
    const pending = listCartesiaVoices({ pageSize: 10 }, { authorization: voices, signal: controller.signal });
    controller.abort(new DOMException("Fixture cancellation.", "AbortError"));

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelled).toBe(true);
  });

  test("keeps caller cancellation distinct from provider timeout and avoids network activity", async () => {
    const { tts, voices } = await authorizeCartesiaOperations();
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error("network must not run");
    };
    const controller = new AbortController();
    controller.abort("user-cancelled-fixture");

    const promise = generateCartesiaSpeech({
      text: "Cancelled fixture.",
      model: "sonic-3.5",
      voice: "voice-fixture-01",
      outputFormat: "raw",
    }, { authorization: tts, discoveryAuthorization: voices, signal: controller.signal });

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(calls).toBe(0);
  });

  test("keeps static models credential-free and fails account discovery closed without credentials", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error("network must not run");
    };
    delete process.env.CARTESIA_API_KEY;
    await expect(listCartesiaModels()).resolves.toMatchObject({ discoveryState: "static" });

    const { voices } = await authorizeCartesiaOperations();
    await expect(listCartesiaVoices({ pageSize: 10 }, { authorization: voices })).rejects.toMatchObject({
      code: "provider_not_configured",
      providerId: "cartesia",
    } satisfies Partial<ProviderOperationError>);
    expect(calls).toBe(0);
  });

  test("requires independent exact-operation TTS and voice-discovery proofs before fetch", async () => {
    const { tts } = await authorizeCartesiaOperations();
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error("network must not run");
    };
    delete process.env.CARTESIA_API_KEY;

    await expect(generateCartesiaSpeech({
      text: "Exact proof fixture.",
      model: "sonic-3.5",
      voice: "voice-fixture-01",
      outputFormat: "raw",
    }, { authorization: tts, discoveryAuthorization: tts })).rejects.toMatchObject({
      code: "provider_access_unavailable",
      providerId: "cartesia",
    });
    expect(calls).toBe(0);
  });
});

function audioStream(chunks: readonly Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

function cartesiaVoiceList(id: string): Response {
  return Response.json({
    data: [{ id, name: "Fixture Voice", language: "en", preview_file_url: null }],
    has_more: false,
    next_page: null,
  });
}

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

async function authorizeCartesiaOperations(): Promise<Readonly<{
  tts: ProviderExecutionAuthorization;
  voices: ProviderExecutionAuthorization;
}>> {
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
  return Object.freeze({
    tts: await authorizeProviderExecution("cartesia", "tts"),
    voices: await authorizeProviderExecution("cartesia", "voices"),
  });
}
