import { expect, test } from "@playwright/test";

import { GET as getDeepgramHealth } from "../../src/app/api/deepgram/health/route";
import { GET as getLegacyModels } from "../../src/app/api/deepgram/models/route";
import { GET as getModels } from "../../src/app/api/providers/[provider]/models/route";
import { POST as postStt } from "../../src/app/api/providers/[provider]/stt/route";
import { POST as postTts } from "../../src/app/api/providers/[provider]/tts/route";
import { POST as postExecute } from "../../src/app/api/deepgram/execute/route";
import { GET as getVoices } from "../../src/app/api/providers/[provider]/voices/route";
import { resetGuestLabAccessForTests } from "../../src/lib/access/lab-access";
import { runReadonlyManageAction } from "../../src/lib/deepgram-manage-readonly";
import { setProviderExecutionPolicyResolverForTests } from "../../src/lib/providers/execution-policy";
import { resetProviderRequestGuardForTests } from "../../src/lib/providers/request-guard";
import { MAX_PROVIDER_JSON_RESPONSE_BYTES } from "../../src/lib/providers/upstream-response";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_KEY = process.env.DEEPGRAM_API_KEY;
const ORIGINAL_OPEN_LAB = process.env.OPEN_LAB_MODE;
const ORIGINAL_ENABLED = process.env.OPEN_LAB_DEEPGRAM_ENABLED;
const CONTEXT = { params: Promise.resolve({ provider: "deepgram" }) };
const SECRET_MARKER = "deepgram-route-secret-must-never-return";

test.describe.configure({ mode: "serial" });

test.beforeEach(() => {
  process.env.DEEPGRAM_API_KEY = SECRET_MARKER;
  process.env.OPEN_LAB_MODE = "false";
  delete process.env.OPEN_LAB_DEEPGRAM_ENABLED;
  resetGuestLabAccessForTests();
  resetProviderRequestGuardForTests();
  allowCanonicalExecution();
});

test.afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  restore("DEEPGRAM_API_KEY", ORIGINAL_KEY);
  restore("OPEN_LAB_MODE", ORIGINAL_OPEN_LAB);
  restore("OPEN_LAB_DEEPGRAM_ENABLED", ORIGINAL_ENABLED);
  resetGuestLabAccessForTests();
  resetProviderRequestGuardForTests();
  setProviderExecutionPolicyResolverForTests();
});

test.describe("Deepgram canonical core routes", () => {
  test("serves normalized static models, voices, legacy discovery, and safe readiness without a provider request", async () => {
    delete process.env.DEEPGRAM_API_KEY;
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; throw new Error("network must remain unused"); };

    const models = await getModels(request("http://local/api/providers/deepgram/models"), CONTEXT);
    const voices = await getVoices(request("http://local/api/providers/deepgram/voices?pageSize=2"), CONTEXT);
    const legacyModels = await getLegacyModels(request("http://local/api/deepgram/models"));
    const health = await getDeepgramHealth(request("http://local/api/deepgram/health"));
    const modelBody = await models.json();
    const voiceBody = await voices.json();
    const legacyBody = await legacyModels.json();
    const healthBody = await health.json();

    expect(models.status).toBe(200);
    expect(modelBody.data).toMatchObject({ provider: "deepgram", discoveryState: "static" });
    expect(modelBody.meta).toMatchObject({ requestMode: "static", providerRequestSent: false });
    expect(voices.status).toBe(200);
    expect(voiceBody.data).toMatchObject({ provider: "deepgram", discoveryState: "static", hasMore: true });
    expect(voiceBody.data.voices).toHaveLength(2);
    expect(voiceBody.meta).toMatchObject({ requestMode: "static", providerRequestSent: false });
    expect(legacyBody.data.models).toEqual(modelBody.data.models);
    expect(healthBody).toMatchObject({ ok: true, data: { configured: false, runtimeVerified: false } });
    expect(JSON.stringify(healthBody)).not.toContain("DEEPGRAM_API_KEY");
    expect(calls).toBe(0);
  });

  test("normalizes prerecorded STT and discards arbitrary provider payload fields", async () => {
    let requestedUrl = "";
    let authorization = "";
    globalThis.fetch = async (input, init) => {
      requestedUrl = String(input);
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return Response.json({
        account: `private ${SECRET_MARKER}`,
        metadata: { request_id: "deepgram-stt-fixture", duration: 0.001, channels: 1, billing: "private" },
        results: {
          channels: [{
            detected_language: "en",
            private_channel_data: "discard-me",
            alternatives: [{
              transcript: "A canonical Deepgram fixture transcript.",
              confidence: 0.99,
              words: [{ word: "canonical", start: 0, end: 0.001, confidence: 0.98, private: "discard-me" }],
            }],
          }],
        },
      });
    };

    const response = await postStt(sttRequest(wavFile(), "nova-3"), CONTEXT);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requestedUrl).toContain("https://api.deepgram.com/v1/listen?");
    expect(authorization).toBe(`Token ${SECRET_MARKER}`);
    expect(body.data).toMatchObject({
      provider: "deepgram",
      model: "nova-3",
      language: "en",
      transcript: "A canonical Deepgram fixture transcript.",
      requestId: "deepgram-stt-fixture",
      details: { channelCount: 1, wordCount: 1, durationSeconds: 0.001 },
    });
    expect(body.meta).toMatchObject({
      requestMode: "live",
      executionDecision: "allowed",
      providerRequestSent: true,
    });
    expect(JSON.stringify(body)).not.toContain(SECRET_MARKER);
    expect(JSON.stringify(body)).not.toContain("discard-me");
  });

  test("routes TTS through the canonical adapter and returns only sanitized audio metadata", async () => {
    let requestedUrl = "";
    let authorization = "";
    globalThis.fetch = async (input, init) => {
      requestedUrl = String(input);
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return new Response(Uint8Array.of(1, 2, 3, 4), {
        headers: {
          "content-type": "audio/mpeg",
          "dg-request-id": "deepgram-tts-fixture",
          "dg-model-name": "aura-2-thalia-en",
        },
      });
    };

    const response = await postTts(jsonRequest({
      text: "Canonical Deepgram fixture synthesis.",
      model: "aura-2-thalia-en",
      encoding: "mp3",
    }), CONTEXT);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requestedUrl).toContain("https://api.deepgram.com/v1/speak?");
    expect(authorization).toBe(`Token ${SECRET_MARKER}`);
    expect(body.data).toMatchObject({
      provider: "deepgram",
      contentType: "audio/mpeg",
      byteSize: 4,
      model: "aura-2-thalia-en",
      requestId: "deepgram-tts-fixture",
    });
    expect(body.data.binaryAudio).toBe("***not included in JSON***");
    expect(body.inspector.timeline.map((event: { type: string }) => event.type)).toContain("provider.request.prepared");
    expect(JSON.stringify(body)).not.toContain(SECRET_MARKER);
  });

  test("fails exact provider policy closed before Deepgram dispatch", async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; throw new Error("transport must not run"); };
    setProviderExecutionPolicyResolverForTests(async () => ({ ok: false, code: "unavailable" }));

    const tts = await postTts(jsonRequest({ text: "Denied.", model: "aura-2-thalia-en" }), CONTEXT);
    resetGuestLabAccessForTests();
    resetProviderRequestGuardForTests();
    const stt = await postStt(sttRequest(wavFile(), "nova-3"), CONTEXT);
    const ttsBody = await tts.json();
    const sttBody = await stt.json();

    expect(tts.status).toBe(503);
    expect(ttsBody.error.code).toBe("provider_access_unavailable");
    expect(ttsBody.inspector.timeline.map((event: { type: string }) => event.type)).not.toContain("provider.request");
    expect(stt.status).toBe(503);
    expect(sttBody.error.code).toBe("provider_access_unavailable");
    expect(sttBody.meta).toMatchObject({ executionDecision: "denied", providerRequestSent: false });
    expect(calls).toBe(0);
  });

  test("bounds retained read-only Management compatibility responses", async () => {
    let cancelled = false;
    globalThis.fetch = async () => new Response(new ReadableStream<Uint8Array>({
      cancel() { cancelled = true; },
    }), {
      headers: {
        "content-type": "application/json",
        "content-length": String(MAX_PROVIDER_JSON_RESPONSE_BYTES + 1),
      },
    });

    await expect(runReadonlyManageAction({ action: "resolve-project" })).rejects.toMatchObject({
      status: 502,
      code: "management_invalid_response",
    });
    expect(cancelled).toBe(true);
  });

  test("normalizes upstream rate limits and malformed transcription responses without leaking bodies", async () => {
    globalThis.fetch = async () => Response.json({ detail: `invalid detail ${SECRET_MARKER}` }, { status: 400 });
    const invalid = await postStt(sttRequest(wavFile(), "nova-3"), CONTEXT);
    const invalidBody = await invalid.json();
    expect(invalid.status).toBe(400);
    expect(invalidBody.error).toMatchObject({ code: "invalid_request", upstreamStatus: 400 });
    expect(invalidBody.meta).toMatchObject({ requestMode: "live", providerRequestSent: true });
    expect(JSON.stringify(invalidBody)).not.toContain(SECRET_MARKER);

    resetGuestLabAccessForTests();
    resetProviderRequestGuardForTests();
    globalThis.fetch = async () => Response.json({ detail: `rate detail ${SECRET_MARKER}` }, { status: 429 });
    const limited = await postStt(sttRequest(wavFile(), "nova-3"), CONTEXT);
    const limitedBody = await limited.json();
    expect(limited.status).toBe(429);
    expect(limitedBody.error).toMatchObject({ code: "provider_rate_limited", upstreamStatus: 429 });
    expect(limitedBody.meta).toMatchObject({ requestMode: "live", providerRequestSent: true });
    expect(JSON.stringify(limitedBody)).not.toContain(SECRET_MARKER);

    resetGuestLabAccessForTests();
    resetProviderRequestGuardForTests();
    globalThis.fetch = async () => Response.json({ detail: `quota detail ${SECRET_MARKER}` }, { status: 402 });
    const exhausted = await postStt(sttRequest(wavFile(), "nova-3"), CONTEXT);
    const exhaustedBody = await exhausted.json();
    expect(exhausted.status).toBe(429);
    expect(exhaustedBody.error).toMatchObject({ code: "provider_quota_exhausted", upstreamStatus: 402 });
    expect(exhaustedBody.meta).toMatchObject({ requestMode: "live", providerRequestSent: true });
    expect(JSON.stringify(exhaustedBody)).not.toContain(SECRET_MARKER);

    resetGuestLabAccessForTests();
    resetProviderRequestGuardForTests();
    globalThis.fetch = async () => Response.json({ not: "a transcript", private: SECRET_MARKER });
    const malformed = await postStt(sttRequest(wavFile(), "nova-3"), CONTEXT);
    const malformedBody = await malformed.json();
    expect(malformed.status).toBe(502);
    expect(malformedBody.error.code).toBe("provider_malformed_response");
    expect(JSON.stringify(malformedBody)).not.toContain(SECRET_MARKER);
  });

  test("rejects malformed and oversized TTS audio with canonical sanitized errors", async () => {
    globalThis.fetch = async () => Response.json({ private: SECRET_MARKER });
    const malformed = await postTts(jsonRequest({ text: "Malformed.", model: "aura-2-thalia-en" }), CONTEXT);
    const malformedBody = await malformed.json();
    expect(malformed.status).toBe(502);
    expect(malformedBody.error.code).toBe("provider_malformed_response");
    expect(JSON.stringify(malformedBody)).not.toContain(SECRET_MARKER);

    resetGuestLabAccessForTests();
    resetProviderRequestGuardForTests();
    let cancelled = false;
    globalThis.fetch = async () => new Response(new ReadableStream<Uint8Array>({
      pull() {
        // Declared length is sufficient for bounded rejection.
      },
      cancel() { cancelled = true; },
    }), {
      headers: {
        "content-type": "audio/mpeg",
        "content-length": String(16 * 1024 * 1024 + 1),
      },
    });
    const oversized = await postTts(jsonRequest({ text: "Oversized.", model: "aura-2-thalia-en" }), CONTEXT);
    expect(oversized.status).toBe(502);
    expect((await oversized.json()).error.code).toBe("provider_malformed_response");
    expect(cancelled).toBe(true);
  });

  test("keeps static discovery available while missing credentials block only paid execution", async () => {
    delete process.env.DEEPGRAM_API_KEY;
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; throw new Error("transport must not run"); };

    const models = await getModels(request("http://local/api/providers/deepgram/models"), CONTEXT);
    const tts = await postTts(jsonRequest({ text: "No credential.", model: "aura-2-thalia-en" }), CONTEXT);
    expect(models.status).toBe(200);
    expect(tts.status).toBe(503);
    expect((await tts.json()).error.code).toBe("provider_not_configured");
    expect(calls).toBe(0);
  });

  test("rejects an oversized executor body without content-length before parsing or provider activity", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error("transport must not run");
    };
    const request = new Request("http://local/api/deepgram/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpointId: "models-public-list", padding: "x".repeat(1_000_000) }),
    });
    expect(request.headers.has("content-length")).toBe(false);

    const response = await postExecute(request);
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "request_too_large" } });
    expect(calls).toBe(0);
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

function request(url: string) {
  return new Request(url, { headers: { "x-voice-lab-session": "deepgram-route-session-01" } });
}

function jsonRequest(body: unknown) {
  return new Request("http://local/api/providers/deepgram/tts", {
    method: "POST",
    headers: { "content-type": "application/json", "x-voice-lab-session": "deepgram-route-session-01" },
    body: JSON.stringify(body),
  });
}

function sttRequest(file: File, model: string) {
  const form = new FormData();
  form.set("file", file, file.name);
  form.set("model", model);
  return new Request("http://local/api/providers/deepgram/stt", {
    method: "POST",
    headers: { "x-voice-lab-session": "deepgram-route-session-01" },
    body: form,
  });
}

function wavFile() {
  const bytes = new Uint8Array(48);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
  bytes.set(new TextEncoder().encode("WAVEfmt "), 8);
  new DataView(bytes.buffer).setUint32(16, 16, true);
  new DataView(bytes.buffer).setUint16(20, 1, true);
  new DataView(bytes.buffer).setUint16(22, 1, true);
  new DataView(bytes.buffer).setUint32(24, 8_000, true);
  new DataView(bytes.buffer).setUint32(28, 8_000, true);
  new DataView(bytes.buffer).setUint16(32, 1, true);
  new DataView(bytes.buffer).setUint16(34, 8, true);
  bytes.set(new TextEncoder().encode("data"), 36);
  new DataView(bytes.buffer).setUint32(40, bytes.length - 44, true);
  return new File([bytes], "deepgram-fixture.wav", { type: "audio/wav", lastModified: 1 });
}

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
