import { expect, test } from "@playwright/test";

import { monotonicNow, readTimedAudioResponse } from "../../src/lib/providers/audio-response";
import { deepgramTtsAdapter } from "../../src/lib/providers/deepgram/adapters/tts";
import { elevenLabsTtsAdapter } from "../../src/lib/providers/elevenlabs/adapters";
import { resetElevenLabsCachesForTests } from "../../src/lib/providers/elevenlabs/client";
import { fishAudioTtsAdapter } from "../../src/lib/providers/fish-audio/adapters";
import {
  authorizeProviderExecution,
  setProviderExecutionPolicyResolverForTests,
} from "../../src/lib/providers/execution-policy";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENVIRONMENT = {
  DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
  FISH_AUDIO_API_KEY: process.env.FISH_AUDIO_API_KEY,
  OPEN_LAB_MODE: process.env.OPEN_LAB_MODE,
  OPEN_LAB_DEEPGRAM_ENABLED: process.env.OPEN_LAB_DEEPGRAM_ENABLED,
  OPEN_LAB_ELEVENLABS_ENABLED: process.env.OPEN_LAB_ELEVENLABS_ENABLED,
  OPEN_LAB_FISH_AUDIO_ENABLED: process.env.OPEN_LAB_FISH_AUDIO_ENABLED,
};

test.beforeEach(() => {
  process.env.DEEPGRAM_API_KEY = "deepgram-fixture-secret";
  process.env.ELEVENLABS_API_KEY = "elevenlabs-fixture-secret";
  process.env.FISH_AUDIO_API_KEY = "fish-fixture-secret";
  process.env.OPEN_LAB_MODE = "false";
  delete process.env.OPEN_LAB_DEEPGRAM_ENABLED;
  delete process.env.OPEN_LAB_ELEVENLABS_ENABLED;
  delete process.env.OPEN_LAB_FISH_AUDIO_ENABLED;
  resetElevenLabsCachesForTests();
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
});

test.afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  for (const [name, value] of Object.entries(ORIGINAL_ENVIRONMENT)) restore(name, value);
  resetElevenLabsCachesForTests();
  setProviderExecutionPolicyResolverForTests();
});

test.describe("standardized provider TTS adapters", () => {
  test("settles and cancels a pending stream read before releasing its reader lock", async () => {
    let cancelled = false;
    const controller = new AbortController();
    const response = new Response(new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    }));
    const pending = readTimedAudioResponse(response, {
      requestStartedAt: monotonicNow(),
      requestTimestamp: "2026-08-26T12:00:00.000Z",
      signal: controller.signal,
      maxBytes: 8,
    });

    controller.abort(new DOMException("Fixture cancellation.", "AbortError"));

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelled).toBe(true);
    expect(response.body?.locked).toBe(false);
  });

  test("streams Deepgram raw linear16 at 24 kHz with shared timing provenance", async () => {
    let requestedUrl = "";
    let requestHeaders = new Headers();
    globalThis.fetch = async (input, init) => {
      requestedUrl = String(input);
      requestHeaders = new Headers(init?.headers);
      return pcmResponse([1, 0, 2, 0], "audio/l16;rate=24000", "dg-request-id", "deepgram-request-fixture");
    };

    const authorization = await authorizeProviderExecution("deepgram", "tts");

    const result = await deepgramTtsAdapter.execute({
      text: "Deepgram PCM fixture.",
      model: "aura-2-thalia-en",
      encoding: "linear16",
      container: "none",
      sample_rate: 24_000,
    }, { maxAudioBytes: 8, authorization });

    expect(deepgramTtsAdapter.adapterVersion).toBe("one-deepgram-core/2.0.0");
    expect(requestedUrl).toContain("encoding=linear16");
    expect(requestedUrl).toContain("container=none");
    expect(requestedUrl).toContain("sample_rate=24000");
    expect(requestHeaders.get("authorization")).toBe("Token deepgram-fixture-secret");
    expect(result).toMatchObject({
      contentType: "audio/l16",
      encoding: "linear16",
      container: "none",
      sampleRate: 24_000,
      requestId: "deepgram-request-fixture",
      timing: { clock: "monotonic", measurementPoint: "one-server" },
    });
    expect(Array.from(new Uint8Array(result.audio))).toEqual([1, 0, 2, 0]);
    expectValidTiming(result.timing);
  });

  test("streams ElevenLabs pcm_24000 after validating the selected model and voice", async () => {
    const requestedUrls: string[] = [];
    let synthesisHeaders = new Headers();
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.endsWith("/v1/models")) {
        return Response.json([{ model_id: "eleven-model-fixture", name: "Fixture model", can_do_text_to_speech: true }]);
      }
      if (url.includes("/v2/voices")) {
        return Response.json({
          voices: [{ voice_id: "eleven-voice-fixture", name: "Fixture voice", labels: {} }],
          has_more: false,
          next_page_token: null,
        });
      }
      synthesisHeaders = new Headers(init?.headers);
      return pcmResponse([3, 0, 4, 0], "application/octet-stream", "request-id", "eleven-request-fixture");
    };

    const authorization = await authorizeProviderExecution("elevenlabs", "tts");
    const modelDiscoveryAuthorization = await authorizeProviderExecution("elevenlabs", "models");
    const discoveryAuthorization = await authorizeProviderExecution("elevenlabs", "voices");
    const result = await elevenLabsTtsAdapter.execute({
      text: "ElevenLabs PCM fixture.",
      model: "eleven-model-fixture",
      voice: "eleven-voice-fixture",
      outputFormat: "pcm_24000",
    }, { maxAudioBytes: 8, authorization, modelDiscoveryAuthorization, discoveryAuthorization });

    expect(elevenLabsTtsAdapter.adapterVersion).toBe("one-elevenlabs-core/2.0.0");
    expect(requestedUrls).toHaveLength(3);
    expect(requestedUrls.some((url) => url.includes("/eleven-voice-fixture/stream?output_format=pcm_24000"))).toBe(true);
    expect(synthesisHeaders.get("xi-api-key")).toBe("elevenlabs-fixture-secret");
    expect(result).toMatchObject({
      contentType: "audio/pcm",
      model: "eleven-model-fixture",
      voice: "eleven-voice-fixture",
      encoding: "pcm_s16le",
      container: "none",
      sampleRate: 24_000,
      outputFormat: "pcm_24000",
      requestId: "eleven-request-fixture",
      timing: { clock: "monotonic", measurementPoint: "one-server" },
    });
    expect(Array.from(new Uint8Array(result.audio))).toEqual([3, 0, 4, 0]);
    expectValidTiming(result.timing);
  });

  test("streams Fish Audio PCM with the current documented default model", async () => {
    let requestedUrl = "";
    let requestHeaders = new Headers();
    let requestBody: unknown;
    globalThis.fetch = async (input, init) => {
      requestedUrl = String(input);
      requestHeaders = new Headers(init?.headers);
      requestBody = JSON.parse(String(init?.body));
      return pcmResponse([5, 0, 6, 0], "application/octet-stream", "request-id", "fish-request-fixture");
    };

    const authorization = await authorizeProviderExecution("fish-audio", "tts");
    const result = await fishAudioTtsAdapter.execute({
      text: "Fish Audio PCM fixture.",
      model: "s2-pro",
      outputFormat: "pcm",
      sample_rate: 24_000,
    }, { maxAudioBytes: 8, authorization });

    expect(fishAudioTtsAdapter.adapterVersion).toBe("one-fish-audio-core/2.0.0");
    expect(requestedUrl).toBe("https://api.fish.audio/v1/tts");
    expect(requestHeaders.get("authorization")).toBe("Bearer fish-fixture-secret");
    expect(requestHeaders.get("model")).toBe("s2-pro");
    expect(requestBody).toEqual({
      text: "Fish Audio PCM fixture.",
      format: "pcm",
      sample_rate: 24_000,
      normalize: true,
    });
    expect(result).toMatchObject({
      contentType: "audio/pcm",
      model: "s2-pro",
      encoding: "pcm_s16le",
      container: "none",
      sampleRate: 24_000,
      outputFormat: "pcm",
      requestId: "fish-request-fixture",
      timing: { clock: "monotonic", measurementPoint: "one-server" },
    });
    expect(Array.from(new Uint8Array(result.audio))).toEqual([5, 0, 6, 0]);
    expectValidTiming(result.timing);
  });
});

function pcmResponse(bytes: readonly number[], contentType: string, requestHeader: string, requestId: string): Response {
  const midpoint = Math.max(2, bytes.length / 2);
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes.slice(0, midpoint)));
      controller.enqueue(new Uint8Array(bytes.slice(midpoint)));
      controller.close();
    },
  }), {
    headers: { "content-type": contentType, [requestHeader]: requestId },
  });
}

function expectValidTiming(timing: Readonly<{ timeToFirstAudioMs: number; totalTimeMs: number }>): void {
  expect(timing.timeToFirstAudioMs).toBeGreaterThanOrEqual(0);
  expect(timing.totalTimeMs).toBeGreaterThanOrEqual(timing.timeToFirstAudioMs);
  const exact = timing as typeof timing & Readonly<{
    requestTimestamp: string;
    firstAudioTimestamp: string;
    completionTimestamp: string;
  }>;
  expect(new Date(exact.requestTimestamp).toISOString()).toBe(exact.requestTimestamp);
  expect(new Date(exact.firstAudioTimestamp).toISOString()).toBe(exact.firstAudioTimestamp);
  expect(new Date(exact.completionTimestamp).toISOString()).toBe(exact.completionTimestamp);
  expect(Date.parse(exact.firstAudioTimestamp)).toBeGreaterThanOrEqual(Date.parse(exact.requestTimestamp));
  expect(Date.parse(exact.completionTimestamp)).toBeGreaterThanOrEqual(Date.parse(exact.firstAudioTimestamp));
}

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
