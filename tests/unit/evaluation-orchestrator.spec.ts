import { expect, test } from "@playwright/test";

import { executeEvaluationRun } from "../../src/lib/evaluation/orchestrator";
import { evaluationRunRequestSchema, type EvaluationRunRequest, type EvaluationStreamEvent } from "../../src/lib/evaluation/schema";
import { hashEvaluationText } from "../../src/lib/evaluation/security";
import { ProviderOperationError } from "../../src/lib/providers/errors";
import type { ProviderId, ProviderTtsAdapter, ProviderTtsExecutionContext, ProviderTtsResult } from "../../src/lib/providers/types";

const PROVIDERS: ProviderId[] = ["deepgram", "elevenlabs", "fish-audio", "cartesia"];

test.describe("evaluation orchestration with mocked providers", () => {
  test("completes all four mocked providers without network access", async () => {
    const adapters = Object.fromEntries(PROVIDERS.map((providerId) => [providerId, mockAdapter(providerId, async () => pcmResult(providerId))]));
    const bundle = await executeEvaluationRun(liveRequest(), {
      environment: liveEnvironment(),
      emit: () => {},
      resolveAdapter: (providerId) => adapters[providerId]!,
      isConfigured: () => true,
      runGuard: async (_providerId, task) => task(),
    });
    expect(bundle.providerResults).toHaveLength(4);
    expect(bundle.providerResults.every((result) => result.status === "complete")).toBe(true);
    expect(new Set(bundle.providerResults.map((result) => result.audio.contentHash)).size).toBe(1);
    for (const result of bundle.providerResults) {
      expect(result.requestTimestamp).toBe("2026-08-26T12:00:00.000Z");
      expect(result.firstAudioTimestamp).toBe("2026-08-26T12:00:00.005Z");
      expect(result.completionTimestamp).toBe("2026-08-26T12:00:00.012Z");
      const firstAudioTrace = result.trace.find((event) => event.type === "first-audio-chunk");
      expect(firstAudioTrace?.timestamp).toBe(result.firstAudioTimestamp);
      expect(firstAudioTrace?.offsetMs).toBeNull();
      expect(result.trace.find((event) => event.type === "connection-established")).toMatchObject({
        timestamp: null,
        offsetMs: null,
        observation: "unavailable",
      });
      expect(result.trace.find((event) => event.type === "first-audible-output")?.observation).toBe("unavailable");
    }
    expect(bundle.providerResults.find((result) => result.provider === "deepgram")?.providerSpecificConfiguration).toMatchObject({
      comparisonMode: "standardized",
      outputFormat: "linear16",
      encoding: "linear16",
      container: "none",
      sampleRate: 24_000,
      channels: 1,
    });
    expect(bundle.providerResults.find((result) => result.provider === "elevenlabs")?.providerSpecificConfiguration).toMatchObject({
      outputFormat: "pcm_24000",
      transport: "buffered-http",
      upstreamResponseMode: "stream-buffered-to-completion",
    });
    expect(bundle.providerResults.find((result) => result.provider === "fish-audio")?.providerSpecificConfiguration).toMatchObject({
      outputFormat: "pcm",
      normalize: true,
    });
    expect(bundle.providerResults.find((result) => result.provider === "cartesia")?.providerSpecificConfiguration).toMatchObject({
      outputFormat: "raw",
      apiVersion: "2026-08-14",
    });
  });

  test("bounds concurrency at two and preserves successful partial results", async () => {
    let active = 0;
    let maximumActive = 0;
    const events: EvaluationStreamEvent[] = [];
    const adapters = Object.fromEntries(PROVIDERS.map((providerId) => [providerId, mockAdapter(providerId, async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      if (providerId === "fish-audio") {
        throw new ProviderOperationError({
          code: "provider_malformed_response",
          message: "sensitive upstream body must not escape",
          status: 502,
          providerId,
          operation: "tts",
        });
      }
      return pcmResult(providerId);
    })]));

    const bundle = await executeEvaluationRun(liveRequest(), {
      environment: liveEnvironment(),
      emit: (event) => { events.push(event); },
      resolveAdapter: (providerId) => adapters[providerId]!,
      isConfigured: () => true,
      runGuard: async (_providerId, task) => task(),
    });

    expect(maximumActive).toBe(2);
    expect(bundle.providerResults.filter((result) => result.status === "complete")).toHaveLength(3);
    const failed = bundle.providerResults.find((result) => result.provider === "fish-audio");
    expect(failed?.status).toBe("failed");
    expect(JSON.stringify(failed)).not.toContain("sensitive upstream body");
    expect(events.filter((event) => event.type === "provider-result")).toHaveLength(4);
  });

  test("maps timeout, malformed audio, and quota denial independently", async () => {
    const modes: Record<ProviderId, "timeout" | "success" | "malformed" | "quota"> = {
      deepgram: "timeout",
      elevenlabs: "success",
      "fish-audio": "malformed",
      cartesia: "quota",
    };
    const adapters = Object.fromEntries(PROVIDERS.map((providerId) => [providerId, mockAdapter(providerId, async (context) => {
      if (modes[providerId] === "malformed") return { ...pcmResult(providerId), audio: Uint8Array.from([1, 2, 3]).buffer };
      if (modes[providerId] === "success") return pcmResult(providerId);
      return new Promise<ProviderTtsResult>((_resolve, reject) => {
        context.signal?.addEventListener("abort", () => reject(context.signal?.reason), { once: true });
      });
    })]));
    const request = liveRequest();
    const bundle = await executeEvaluationRun(request, {
      environment: liveEnvironment(),
      emit: () => {},
      resolveAdapter: (providerId) => adapters[providerId]!,
      isConfigured: () => true,
      runGuard: async (providerId, task) => {
        if (modes[providerId] === "quota") {
          throw new ProviderOperationError({ code: "provider_quota_exhausted", message: "quota", status: 429, providerId, operation: "tts" });
        }
        return task();
      },
      timeoutsMs: { deepgram: 5, elevenlabs: 50, "fish-audio": 50, cartesia: 50 },
    });

    const statuses = Object.fromEntries(bundle.providerResults.map((result) => [result.provider, result.status]));
    expect(statuses.deepgram).toBe("timed-out");
    expect(statuses.elevenlabs).toBe("complete");
    expect(statuses["fish-audio"]).toBe("failed");
    expect(statuses.cartesia).toBe("failed");
  });

  test("cancels outstanding providers through the shared AbortSignal", async () => {
    const controller = new AbortController();
    const request = liveRequest();
    request.providers = request.providers.slice(0, 2);
    let streaming = 0;
    const bundle = await executeEvaluationRun(request, {
      signal: controller.signal,
      environment: liveEnvironment(),
      emit: (event) => {
        if (event.type === "provider-state" && event.status === "streaming") {
          streaming += 1;
          if (streaming === 2) controller.abort();
        }
      },
      resolveAdapter: (providerId) => mockAdapter(providerId as ProviderId, async (context) => new Promise<ProviderTtsResult>((_resolve, reject) => {
        context.signal?.addEventListener("abort", () => reject(context.signal?.reason), { once: true });
      })),
      isConfigured: () => true,
      runGuard: async (_providerId, task) => task(),
    });
    expect(bundle.providerResults.every((result) => result.status === "cancelled")).toBe(true);
  });

  test("keeps missing credentials, rate limiting, and invalid timing independent", async () => {
    const adapters = Object.fromEntries(PROVIDERS.map((providerId) => [providerId, mockAdapter(providerId, async () => {
      const result = pcmResult(providerId);
      return providerId === "cartesia"
        ? { ...result, timing: { ...result.timing, timeToFirstAudioMs: 20, totalTimeMs: 10 } }
        : result;
    })]));
    const adapterCalls = new Map<ProviderId, number>();
    const bundle = await executeEvaluationRun(liveRequest(), {
      environment: liveEnvironment(),
      emit: () => {},
      resolveAdapter: (providerId) => {
        const id = providerId as ProviderId;
        adapterCalls.set(id, (adapterCalls.get(id) ?? 0) + 1);
        return adapters[id]!;
      },
      isConfigured: (providerId) => providerId !== "deepgram",
      runGuard: async (providerId, task) => {
        if (providerId === "elevenlabs") {
          throw new ProviderOperationError({ code: "provider_rate_limited", message: "private rate details", status: 429, providerId, operation: "tts" });
        }
        return task();
      },
    });
    const byProvider = Object.fromEntries(bundle.providerResults.map((result) => [result.provider, result]));
    expect(byProvider.deepgram.status).toBe("unavailable");
    expect(byProvider.deepgram.sanitizedError?.code).toBe("provider_not_configured");
    expect(byProvider.deepgram.requestTimestamp).toBeNull();
    expect(byProvider.deepgram.adapterVersion).toBe("mock-deepgram/1.0.0");
    expect(adapterCalls.has("deepgram")).toBe(true);
    expect(byProvider.elevenlabs.status).toBe("failed");
    expect(byProvider.elevenlabs.sanitizedError?.code).toBe("provider_rate_limited");
    expect(JSON.stringify(byProvider.elevenlabs)).not.toContain("private rate details");
    expect(byProvider.cartesia.status).toBe("failed");
    expect(byProvider.cartesia.sanitizedError?.code).toBe("provider_malformed_response");
    expect(byProvider["fish-audio"].status).toBe("complete");
  });
});

function liveRequest(): EvaluationRunRequest {
  const text = "Exact mocked provider input.";
  return evaluationRunRequestSchema.parse({
    schemaVersion: "one-voice-evidence/1.0.0",
    evaluationId: "10000000-0000-4000-8000-000000000001",
    runId: "10000000-0000-4000-8000-000000000002",
    scenario: { id: "mock-live", version: "1.0.0", source: "custom", presetId: null, inputType: "text", text, inputHash: hashEvaluationText(text) },
    evaluationMode: "standardized",
    executionMode: "local-live",
    providers: PROVIDERS.map((providerId) => ({ providerId, model: `${providerId}-model`, voice: `${providerId}-voice`, outputFormat: "ignored-standardized", providerSpecificConfiguration: {} })),
    blind: { enabled: false, seed: "live-seed" },
    confirmedPaidCalls: true,
  });
}

function liveEnvironment() {
  return {
    NODE_ENV: "test",
    ONE_LIVE_EVALS_ENABLED: "true",
    OPEN_LAB_DEEPGRAM_ENABLED: "true",
    OPEN_LAB_ELEVENLABS_ENABLED: "true",
    OPEN_LAB_FISH_AUDIO_ENABLED: "true",
    OPEN_LAB_CARTESIA_ENABLED: "true",
  };
}

function mockAdapter(
  providerId: ProviderId,
  execute: (context: ProviderTtsExecutionContext) => Promise<ProviderTtsResult>,
): ProviderTtsAdapter {
  return {
    providerId,
    capability: "tts",
    adapterVersion: `mock-${providerId}/1.0.0`,
    ...(providerId === "fish-audio" ? {
      evaluationProfile: {
        standardizedOutputFormat: "pcm",
        nativeOutputFormats: ["mp3", "pcm"],
        optionalVoiceSentinel: "__fish_audio_optional_voice__",
        currentModelIds: ["s2-pro", "s1"],
        standardizedRequest: { outputFormat: "pcm" },
        standardizedConfiguration: { normalize: true, transport: "buffered-http" },
      },
    } : providerId === "elevenlabs" ? {
      evaluationProfile: {
        standardizedOutputFormat: "pcm_24000",
        nativeOutputFormats: ["mp3_44100_128", "mp3_44100_64", "mp3_22050_32", "pcm_24000"],
        standardizedRequest: { outputFormat: "pcm_24000" },
        standardizedConfiguration: {
          transport: "buffered-http",
          upstreamResponseMode: "stream-buffered-to-completion",
        },
      },
    } : providerId === "cartesia" ? {
      evaluationProfile: {
        standardizedOutputFormat: "raw",
        nativeOutputFormats: ["raw"],
        voiceSelectionMode: "separate",
        currentModelIds: ["sonic-3.5", "sonic-3"],
        standardizedRequest: { outputFormat: "raw", encoding: "pcm_s16le", container: "raw", sample_rate: 24_000 },
        standardizedConfiguration: { apiVersion: "2026-08-14", transport: "buffered-http" },
      },
    } : {}),
    buildEndpointPreview: () => "https://invalid.example.test/redacted",
    execute: (_payload, context = {}) => execute(context),
  };
}

function pcmResult(providerId: ProviderId): ProviderTtsResult {
  return {
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
      firstAudioTimestamp: "2026-08-26T12:00:00.005Z",
      completionTimestamp: "2026-08-26T12:00:00.012Z",
      timeToFirstAudioMs: 5,
      totalTimeMs: 12,
    },
  };
}
