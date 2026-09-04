import { expect, test } from "@playwright/test";

import { GET as getModels } from "../../src/app/api/providers/[provider]/models/route";
import { GET as getVoices } from "../../src/app/api/providers/[provider]/voices/route";
import { POST as postStt } from "../../src/app/api/providers/[provider]/stt/route";
import { POST as postTts } from "../../src/app/api/providers/[provider]/tts/route";
import { resetGuestLabAccessForTests } from "../../src/lib/access/lab-access";
import { resetElevenLabsCachesForTests } from "../../src/lib/providers/elevenlabs/client";
import { setProviderExecutionPolicyResolverForTests } from "../../src/lib/providers/execution-policy";
import { resetProviderRequestGuardForTests } from "../../src/lib/providers/request-guard";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_KEY = process.env.ELEVENLABS_API_KEY;
const ORIGINAL_OPEN_LAB_MODE = process.env.OPEN_LAB_MODE;
const ORIGINAL_OPEN_LAB_ENABLED = process.env.OPEN_LAB_ELEVENLABS_ENABLED;
const CONTEXT = { params: Promise.resolve({ provider: "elevenlabs" }) };
const SECRET_MARKER = "fixture-secret-must-never-return";

test.beforeEach(() => {
  process.env.ELEVENLABS_API_KEY = SECRET_MARKER;
  process.env.OPEN_LAB_MODE = "false";
  delete process.env.OPEN_LAB_ELEVENLABS_ENABLED;
  resetGuestLabAccessForTests();
  resetElevenLabsCachesForTests();
  resetProviderRequestGuardForTests();
  allowCanonicalExecution();
});

test.afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  restore("ELEVENLABS_API_KEY", ORIGINAL_KEY);
  restore("OPEN_LAB_MODE", ORIGINAL_OPEN_LAB_MODE);
  restore("OPEN_LAB_ELEVENLABS_ENABLED", ORIGINAL_OPEN_LAB_ENABLED);
  resetGuestLabAccessForTests();
  resetElevenLabsCachesForTests();
  resetProviderRequestGuardForTests();
  setProviderExecutionPolicyResolverForTests();
});

test.describe("ElevenLabs capability routes", () => {
  test("normalizes model retrieval without returning the server secret", async () => {
    let authenticated = false;
    globalThis.fetch = async (_input, init) => {
      authenticated = new Headers(init?.headers).get("xi-api-key") === SECRET_MARKER;
      return Response.json(modelFixture());
    };

    const response = await getModels(request("http://local/api/providers/elevenlabs/models"), CONTEXT);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(authenticated).toBe(true);
    expect(body.data.models[0]).toMatchObject({
      provider: "elevenlabs",
      id: "eleven_fixture_v2",
      capabilities: { textToSpeech: true },
      languages: [{ id: "en" }],
    });
    expect(body.meta).toMatchObject({ requestMode: "live", providerRequestSent: true, executionDecision: "allowed" });
    expect(JSON.stringify(body)).not.toContain(SECRET_MARKER);

    const cached = await getModels(request("http://local/api/providers/elevenlabs/models"), CONTEXT);
    expect((await cached.json()).meta).toMatchObject({ requestMode: "cache-fresh", providerRequestSent: false });
  });

  test("uses bounded V2 voice search and excludes sample and preview fields", async () => {
    let requestedUrl = "";
    globalThis.fetch = async (input) => {
      requestedUrl = String(input);
      return Response.json(voiceFixture());
    };

    const response = await getVoices(request("http://local/api/providers/elevenlabs/voices?pageSize=20&search=calm"), CONTEXT);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requestedUrl).toContain("/v2/voices");
    expect(requestedUrl).toContain("page_size=20");
    expect(requestedUrl).toContain("search=calm");
    expect(body.data.voices[0]).toEqual({
      provider: "elevenlabs",
      id: "voice_fixture",
      name: "Fixture Voice",
      labels: {},
      previewAvailable: false,
    });
    expect(JSON.stringify(body)).not.toContain("sample-private");
    expect(JSON.stringify(body)).not.toContain("https://cdn.example.invalid/preview.mp3");
  });

  test("rechecks canonical authorization before serving cached account-scoped discovery", async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; return Response.json(modelFixture()); };

    const populated = await getModels(request("http://local/api/providers/elevenlabs/models"), CONTEXT);
    expect(populated.status).toBe(200);
    setProviderExecutionPolicyResolverForTests(async () => ({ ok: false, code: "unavailable" }));

    const denied = await getModels(request("http://local/api/providers/elevenlabs/models"), CONTEXT);
    expect(denied.status).toBe(503);
    expect((await denied.json()).error.code).toBe("provider_access_unavailable");
    expect(calls).toBe(1);
  });

  test("validates catalog selections before returning successful TTS audio", async () => {
    const urls: string[] = [];
    globalThis.fetch = async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/v1/models")) return Response.json(modelFixture());
      if (url.includes("/v2/voices")) return Response.json(voiceFixture());
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { "content-type": "audio/mpeg", "request-id": "request-fixture", "character-cost": "42" },
      });
    };

    const response = await postTts(jsonRequest({
      text: "Explicit fixture generation.",
      model: "eleven_fixture_v2",
      voice: "voice_fixture",
      outputFormat: "mp3_44100_128",
    }), CONTEXT);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(response.headers.get("x-voice-lab-provider")).toBe("elevenlabs");
    expect(response.headers.get("x-voice-lab-character-cost")).toBe("42");
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([1, 2, 3, 4]);
    expect(urls).toHaveLength(3);
    expect(urls.at(-1)).toContain("/v1/text-to-speech/voice_fixture?output_format=mp3_44100_128");
    expect(JSON.stringify(Object.fromEntries(response.headers))).not.toContain(SECRET_MARKER);
  });

  test("rejects malformed and oversized TTS audio responses without exposing upstream bodies", async () => {
    let stage = 0;
    globalThis.fetch = async () => {
      stage += 1;
      if (stage === 1) return Response.json(modelFixture());
      if (stage === 2) return Response.json(voiceFixture());
      return Response.json({ detail: `not audio ${SECRET_MARKER}` });
    };
    const malformed = await postTts(jsonRequest({
      text: "Malformed response fixture.",
      model: "eleven_fixture_v2",
      voice: "voice_fixture",
      outputFormat: "mp3_44100_128",
    }), CONTEXT);
    expect(malformed.status).toBe(502);
    const malformedBody = await malformed.json();
    expect(malformedBody.error.code).toBe("provider_malformed_response");
    expect(JSON.stringify(malformedBody)).not.toContain(SECRET_MARKER);

    resetElevenLabsCachesForTests();
    resetProviderRequestGuardForTests();
    stage = 0;
    let cancelled = false;
    globalThis.fetch = async () => {
      stage += 1;
      if (stage === 1) return Response.json(modelFixture());
      if (stage === 2) return Response.json(voiceFixture());
      return new Response(new ReadableStream<Uint8Array>({
        pull() {
          // Declared length is enough for the bounded reader to reject.
        },
        cancel() { cancelled = true; },
      }), {
        headers: {
          "content-type": "audio/mpeg",
          "content-length": String(16 * 1024 * 1024 + 1),
        },
      });
    };
    const oversized = await postTts(jsonRequest({
      text: "Oversized response fixture.",
      model: "eleven_fixture_v2",
      voice: "voice_fixture",
      outputFormat: "mp3_44100_128",
    }), CONTEXT);
    expect(oversized.status).toBe(502);
    expect((await oversized.json()).error.code).toBe("provider_malformed_response");
    expect(cancelled).toBe(true);
  });

  test("enforces the durable Lab access boundary before paid TTS execution", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error("provider execution must remain blocked");
    };
    const response = await postTts(new Request("http://local/api/providers/elevenlabs/tts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.example",
        "x-voice-lab-session": "cross-origin-fixture-01",
      },
      body: JSON.stringify({
        text: "This must not reach a paid provider.",
        model: "eleven_fixture_v2",
        voice: "voice_fixture",
        outputFormat: "mp3_44100_128",
      }),
    }), CONTEXT);

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("provider_forbidden");
    expect(calls).toBe(0);
  });

  test("normalizes explicit-upload STT without storing raw audio", async () => {
    let sentMultipart = false;
    globalThis.fetch = async (_input, init) => {
      sentMultipart = init?.body instanceof FormData;
      return Response.json({
        language_code: "en",
        language_probability: 0.98,
        text: "A normalized fixture transcript.",
        words: [{ text: "A", start: 0, end: 0.1, speaker_id: "speaker_0" }],
      }, { headers: { "request-id": "stt-fixture" } });
    };

    const response = await postStt(sttRequest(wavFile("fixture.wav"), "scribe_v2"), CONTEXT);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(sentMultipart).toBe(true);
    expect(body.data).toMatchObject({
      provider: "elevenlabs",
      transcript: "A normalized fixture transcript.",
      model: "scribe_v2",
      language: "en",
      details: { detectedLanguage: "en", wordCount: 1, speakerCount: 1 },
    });
    expect(JSON.stringify(body)).not.toContain(SECRET_MARKER);
  });

  test("missing configuration and canonical provider policy fail closed before dispatch", async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; throw new Error("must not run"); };
    delete process.env.ELEVENLABS_API_KEY;
    const missing = await getModels(request("http://local/api/providers/elevenlabs/models"), CONTEXT);
    expect(missing.status).toBe(503);
    expect((await missing.json()).error.code).toBe("provider_not_configured");

    process.env.ELEVENLABS_API_KEY = SECRET_MARKER;
    setProviderExecutionPolicyResolverForTests(async () => ({ ok: false, code: "unavailable" }));
    const disabled = await getModels(request("http://local/api/providers/elevenlabs/models"), CONTEXT);
    expect(disabled.status).toBe(503);
    const body = await disabled.json();
    expect(body.error.code).toBe("provider_access_unavailable");
    expect(body.meta).toMatchObject({ executionDecision: "denied", providerRequestSent: false });
    expect(calls).toBe(0);
  });

  test("rejects invalid and oversized TTS input before provider activity", async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; throw new Error("must not run"); };

    const invalid = await postTts(jsonRequest({ text: "", unexpected: true }), CONTEXT);
    const oversized = await postTts(jsonRequest({
      text: "x".repeat(2_001), model: "eleven_fixture_v2", voice: "voice_fixture",
    }), CONTEXT);

    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.code).toBe("invalid_request");
    expect(oversized.status).toBe(413);
    expect((await oversized.json()).error.code).toBe("input_too_large");
    expect(calls).toBe(0);
  });

  test("rejects oversized and unsupported audio before provider activity", async () => {
    let calls = 0;
    let oversizedBodyCancelled = false;
    globalThis.fetch = async () => { calls += 1; throw new Error("must not run"); };
    const oversized = new Request("http://local/api/providers/elevenlabs/stt", {
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=oversized-fixture",
        "content-length": String(12 * 1024 * 1024),
        "x-voice-lab-session": "unit-session-01",
      },
      body: new ReadableStream<Uint8Array>({
        pull() {
          // The declared length is enough to reject this inbound-style stream.
        },
        cancel() { oversizedBodyCancelled = true; },
      }),
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    const unsupported = sttRequest(new File(["plain text"], "notes.txt", { type: "text/plain" }), "scribe_v2");

    const oversizedResponse = await postStt(oversized, CONTEXT);
    const unsupportedResponse = await postStt(unsupported, CONTEXT);

    expect(oversizedResponse.status).toBe(413);
    expect((await oversizedResponse.json()).error.code).toBe("input_too_large");
    expect(oversizedBodyCancelled).toBe(true);
    expect(unsupportedResponse.status).toBe(415);
    expect((await unsupportedResponse.json()).error.code).toBe("unsupported_media_type");
    expect(calls).toBe(0);
  });

  test("rejects provider policy preconditions before buffering an STT upload", async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; throw new Error("must not run"); };
    const request = new Request("http://local/api/providers/elevenlabs/stt", {
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=blocked-fixture",
        "content-length": String(12 * 1024 * 1024),
        "sec-fetch-site": "cross-site",
      },
      body: new Uint8Array([1]),
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    const response = await postStt(request, CONTEXT);
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("provider_forbidden");
    expect(calls).toBe(0);
  });

  for (const scenario of [
    { upstream: 400, status: 400, code: "invalid_request" },
    { upstream: 401, status: 502, code: "provider_unauthorized" },
    { upstream: 402, status: 429, code: "provider_quota_exhausted" },
    { upstream: 403, status: 502, code: "provider_forbidden" },
    { upstream: 429, status: 429, code: "provider_rate_limited" },
    { upstream: 503, status: 502, code: "provider_failure" },
  ] as const) {
    test(`normalizes provider ${scenario.upstream} without returning upstream detail or secrets`, async () => {
      globalThis.fetch = async () => Response.json({ detail: `upstream detail ${SECRET_MARKER}` }, { status: scenario.upstream });
      const response = await getModels(request("http://local/api/providers/elevenlabs/models"), CONTEXT);
      const body = await response.json();
      expect(response.status).toBe(scenario.status);
      expect(body.error.code).toBe(scenario.code);
      expect(body.meta).toMatchObject({
        requestMode: "live",
        executionDecision: "allowed",
        providerRequestSent: true,
      });
      expect(JSON.stringify(body)).not.toContain(SECRET_MARKER);
      expect(JSON.stringify(body)).not.toContain("upstream detail");
    });
  }

  test("distinguishes provider-reported credit exhaustion", async () => {
    globalThis.fetch = async () => Response.json({ detail: "credit quota exhausted" }, { status: 429 });
    const response = await getModels(request("http://local/api/providers/elevenlabs/models"), CONTEXT);
    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe("provider_quota_exhausted");
  });

  test("normalizes timeout and malformed provider responses", async () => {
    globalThis.fetch = async () => { throw new DOMException("fixture abort", "AbortError"); };
    const timeout = await getModels(request("http://local/api/providers/elevenlabs/models"), CONTEXT);
    expect(timeout.status).toBe(504);
    expect((await timeout.json()).error.code).toBe("provider_timeout");

    resetProviderRequestGuardForTests();
    globalThis.fetch = async () => Response.json({ not: "a model list" });
    const malformed = await getModels(request("http://local/api/providers/elevenlabs/models"), CONTEXT);
    expect(malformed.status).toBe(502);
    expect((await malformed.json()).error.code).toBe("provider_malformed_response");
  });

  test("cancels an oversized declared model response and returns only a sanitized error", async () => {
    let cancelled = false;
    globalThis.fetch = async () => new Response(new ReadableStream<Uint8Array>({
      pull() {
        // The declared length is enough for the bounded reader to reject.
      },
      cancel() { cancelled = true; },
    }), { headers: { "content-length": String(2 * 1024 * 1024 + 1) } });

    const response = await getModels(request("http://local/api/providers/elevenlabs/models"), CONTEXT);
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body.error.code).toBe("provider_malformed_response");
    expect(JSON.stringify(body)).not.toContain(SECRET_MARKER);
    expect(cancelled).toBe(true);
  });

  test("limits session rotation by the same privacy-hashed client before provider activity", async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; return Response.json(modelFixture()); };

    for (let index = 0; index < 60; index += 1) {
      const response = await getModels(new Request("http://local/api/providers/elevenlabs/models", {
        headers: { cookie: `one_lab_session=${index.toString(16).padStart(32, "0")}` },
      }), CONTEXT);
      expect(response.status).toBe(200);
      // Isolate the provider request guard under test from the lower guest
      // allowance, while retaining the same privacy-hashed client identity.
      resetGuestLabAccessForTests();
    }

    const bounded = await getModels(new Request("http://local/api/providers/elevenlabs/models", {
      headers: { cookie: "one_lab_session=ffffffffffffffffffffffffffffffff" },
    }), CONTEXT);
    expect(bounded.status).toBe(429);
    expect((await bounded.json()).error.code).toBe("provider_rate_limited");
    expect(calls).toBe(1);
  });
});

function modelFixture() {
  return [{
    model_id: "eleven_fixture_v2",
    name: "Eleven Fixture v2",
    description: "Test-only model metadata.",
    can_be_finetuned: false,
    can_do_text_to_speech: true,
    can_do_voice_conversion: false,
    can_use_style: true,
    can_use_speaker_boost: true,
    maximum_text_length_per_request: 5_000,
    languages: [{ language_id: "en", name: "English" }],
  }];
}

function voiceFixture() {
  return {
    voices: [{
      voice_id: "voice_fixture",
      name: "Fixture Voice",
      category: "premade",
      labels: { accent: "neutral" },
      description: "A test-only catalog fixture.",
      preview_url: "https://cdn.example.invalid/preview.mp3",
      samples: [{ sample_id: "sample-private" }],
    }],
    has_more: false,
    next_page_token: null,
  };
}

function request(url: string) {
  return new Request(url, { headers: { "x-voice-lab-session": "unit-session-01" } });
}

function jsonRequest(body: unknown) {
  return new Request("http://local/api/providers/elevenlabs/tts", {
    method: "POST",
    headers: { "content-type": "application/json", "x-voice-lab-session": "unit-session-01" },
    body: JSON.stringify(body),
  });
}

function sttRequest(file: File, model: string, extraHeaders: Record<string, string> = {}) {
  const form = new FormData();
  form.set("file", file, file.name);
  form.set("model", model);
  return new Request("http://local/api/providers/elevenlabs/stt", {
    method: "POST",
    headers: { "x-voice-lab-session": "unit-session-01", ...extraHeaders },
    body: form,
  });
}

function wavFile(name: string) {
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
  return new File([bytes], name, { type: "audio/wav", lastModified: 1 });
}

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

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
