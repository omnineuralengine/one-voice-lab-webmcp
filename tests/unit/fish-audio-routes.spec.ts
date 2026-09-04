import { expect, test } from "@playwright/test";

import { GET as getModels } from "../../src/app/api/providers/[provider]/models/route";
import { GET as getVoices } from "../../src/app/api/providers/[provider]/voices/route";
import { POST as postStt } from "../../src/app/api/providers/[provider]/stt/route";
import { POST as postTts } from "../../src/app/api/providers/[provider]/tts/route";
import { setProviderExecutionPolicyResolverForTests } from "../../src/lib/providers/execution-policy";
import { resetProviderRequestGuardForTests } from "../../src/lib/providers/request-guard";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_KEY = process.env.FISH_AUDIO_API_KEY;
const ORIGINAL_OPEN_LAB_MODE = process.env.OPEN_LAB_MODE;
const ORIGINAL_OPEN_LAB_ENABLED = process.env.OPEN_LAB_FISH_AUDIO_ENABLED;
const CONTEXT = { params: Promise.resolve({ provider: "fish-audio" }) };
const SECRET_MARKER = "fish-fixture-secret-must-never-return";

test.beforeEach(() => {
  process.env.FISH_AUDIO_API_KEY = SECRET_MARKER;
  process.env.OPEN_LAB_MODE = "false";
  delete process.env.OPEN_LAB_FISH_AUDIO_ENABLED;
  setProviderExecutionPolicyResolverForTests(async (providerId, capabilityId) => ({
    ok: true,
    value: {
      known: true,
      providerId,
      capabilityId: capabilityId as "discovery.voices" | "tts.batch" | "stt.prerecorded",
      accessMode: "public-use",
      runtimeStatus: "enabled",
      benchmarkStatus: "ineligible",
      providerRevision: 1,
      capabilityRevision: 1,
    },
  }));
  resetProviderRequestGuardForTests();
});

test.afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  restore("FISH_AUDIO_API_KEY", ORIGINAL_KEY);
  restore("OPEN_LAB_MODE", ORIGINAL_OPEN_LAB_MODE);
  restore("OPEN_LAB_FISH_AUDIO_ENABLED", ORIGINAL_OPEN_LAB_ENABLED);
  setProviderExecutionPolicyResolverForTests();
  resetProviderRequestGuardForTests();
});

test.describe("Fish Audio capability routes", () => {
  test("returns the bounded documentation-verified TTS model catalog without a network request", async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; throw new Error("must not run"); };

    const response = await getModels(request("http://local/api/providers/fish-audio/models"), CONTEXT);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.provider).toBe("fish-audio");
    expect(body.data.models.map((model: { id: string }) => model.id)).toEqual(["s2-pro", "s1"]);
    expect(JSON.stringify(body)).not.toContain(SECRET_MARKER);
    expect(calls).toBe(0);
  });

  test("normalizes only public voice-model metadata and uses Bearer authentication", async () => {
    let requestedUrl = "";
    let authenticated = false;
    globalThis.fetch = async (input, init) => {
      requestedUrl = String(input);
      authenticated = new Headers(init?.headers).get("authorization") === `Bearer ${SECRET_MARKER}`;
      return Response.json({
        items: [voiceFixture("public-voice", "Public Fixture", "public"), voiceFixture("private-voice", "Private Fixture", "private")],
        has_more: true,
      });
    };

    const response = await getVoices(request("http://local/api/providers/fish-audio/voices?pageSize=20&search=calm"), CONTEXT);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(authenticated).toBe(true);
    expect(requestedUrl).toContain("/model?");
    expect(requestedUrl).toContain("page_size=20");
    expect(requestedUrl).toContain("title=calm");
    expect(body.data.voices).toEqual([{
      provider: "fish-audio",
      id: "public-voice",
      name: "Public Fixture",
      category: "public-voice-model",
      labels: { languages: "en" },
      previewAvailable: false,
    }]);
    expect(body.data.nextPageToken).toBe("2");
    expect(JSON.stringify(body)).not.toContain("Private Fixture");
    expect(JSON.stringify(body)).not.toContain(SECRET_MARKER);
  });

  test("returns explicit TTS audio with the documented model header and no required cloned voice", async () => {
    let upstreamBody = "";
    let modelHeader = "";
    globalThis.fetch = async (_input, init) => {
      upstreamBody = String(init?.body);
      modelHeader = new Headers(init?.headers).get("model") ?? "";
      return new Response(new Uint8Array([9, 8, 7, 6]), {
        status: 200,
        headers: { "content-type": "audio/mpeg", "request-id": "fish-request-fixture" },
      });
    };

    const response = await postTts(jsonRequest({
      text: "Explicit Fish Audio fixture generation.",
      model: "s2.1-pro-free",
      outputFormat: "mp3",
    }), CONTEXT);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-voice-lab-provider")).toBe("fish-audio");
    expect(response.headers.get("x-voice-lab-model")).toBe("s2.1-pro-free");
    expect(modelHeader).toBe("s2.1-pro-free");
    expect(JSON.parse(upstreamBody)).toEqual({
      text: "Explicit Fish Audio fixture generation.",
      format: "mp3",
      normalize: true,
    });
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([9, 8, 7, 6]);
    expect(JSON.stringify(Object.fromEntries(response.headers))).not.toContain(SECRET_MARKER);
  });

  test("does not allow anonymous TTS to select private or unlisted voice metadata", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return Response.json(voiceFixture("private-voice", "Private Fixture", "private"));
    };

    const response = await postTts(jsonRequest({
      text: "Must fail before synthesis.",
      model: "s2.1-pro-free",
      voice: "private-voice",
      outputFormat: "mp3",
    }), CONTEXT);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("invalid_request");
    expect(calls).toBe(1);
    expect(JSON.stringify(body)).not.toContain("Private Fixture");
  });

  test("normalizes explicit-upload beta ASR without persisting audio", async () => {
    let sentAudio = false;
    globalThis.fetch = async (_input, init) => {
      const form = init?.body as FormData;
      sentAudio = form instanceof FormData && form.get("audio") instanceof File && form.get("ignore_timestamps") === "false";
      return Response.json({
        text: "A normalized Fish Audio fixture transcript.",
        duration: 1.25,
        language_code: "en",
        segments: [{ text: "A normalized fixture.", start: 0, end: 1.25 }],
      }, { headers: { "request-id": "fish-asr-fixture" } });
    };

    const response = await postStt(sttRequest(wavFile("fixture.wav"), "fish-audio-asr-v1"), CONTEXT);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(sentAudio).toBe(true);
    expect(body.data).toMatchObject({
      provider: "fish-audio",
      transcript: "A normalized Fish Audio fixture transcript.",
      model: "fish-audio-asr-v1",
      language: "en",
      details: { durationSeconds: 1.25, segmentCount: 1 },
    });
    expect(JSON.stringify(body)).not.toContain(SECRET_MARKER);
  });

  test("keeps static discovery credential-free and live execution fail-closed without canonical policy proof", async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; throw new Error("must not run"); };
    delete process.env.FISH_AUDIO_API_KEY;
    const missing = await getModels(request("http://local/api/providers/fish-audio/models"), CONTEXT);
    expect(missing.status).toBe(200);

    process.env.FISH_AUDIO_API_KEY = SECRET_MARKER;
    process.env.OPEN_LAB_MODE = "true";
    process.env.OPEN_LAB_FISH_AUDIO_ENABLED = "true";
    setProviderExecutionPolicyResolverForTests(async () => ({ ok: false, code: "unavailable" }));
    const disabled = await getVoices(request("http://local/api/providers/fish-audio/voices"), CONTEXT);
    expect(disabled.status).toBe(503);
    expect((await disabled.json()).error.code).toBe("provider_access_unavailable");
    expect(calls).toBe(0);
  });

  test("normalizes provider credit exhaustion without returning upstream details", async () => {
    globalThis.fetch = async () => Response.json({
      message: `credit failure ${SECRET_MARKER}`,
      reason: "sensitive-upstream-detail",
    }, { status: 402 });

    const response = await getVoices(request("http://local/api/providers/fish-audio/voices?pageSize=10"), CONTEXT);
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toMatchObject({ code: "provider_quota_exhausted", upstreamStatus: 402 });
    expect(JSON.stringify(body)).not.toContain(SECRET_MARKER);
    expect(JSON.stringify(body)).not.toContain("sensitive-upstream-detail");
  });

  for (const fixture of [
    { upstream: 400, status: 400, code: "invalid_request" },
    { upstream: 401, status: 502, code: "provider_unauthorized" },
    { upstream: 403, status: 502, code: "provider_forbidden" },
    { upstream: 429, status: 429, code: "provider_rate_limited" },
    { upstream: 500, status: 502, code: "provider_failure" },
  ] as const) {
    test(`normalizes upstream ${fixture.upstream} without exposing a response body`, async () => {
      globalThis.fetch = async () => Response.json({
        secret: SECRET_MARKER,
        privateVoice: "confidential-voice-id",
      }, { status: fixture.upstream });

      const response = await getVoices(request("http://local/api/providers/fish-audio/voices?pageSize=10"), CONTEXT);
      const body = await response.json();
      expect(response.status).toBe(fixture.status);
      expect(body.error).toMatchObject({ code: fixture.code, upstreamStatus: fixture.upstream });
      expect(JSON.stringify(body)).not.toContain(SECRET_MARKER);
      expect(JSON.stringify(body)).not.toContain("confidential-voice-id");
    });
  }

  test("cancels an oversized streamed voice catalog and normalizes the failure", async () => {
    let cancelled = false;
    globalThis.fetch = async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(2 * 1024 * 1024));
        controller.enqueue(Uint8Array.of(1));
      },
      cancel() { cancelled = true; },
    }));

    const response = await getVoices(request("http://local/api/providers/fish-audio/voices?pageSize=10"), CONTEXT);
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body.error.code).toBe("provider_malformed_response");
    expect(cancelled).toBe(true);
  });
});

function voiceFixture(id: string, title: string, visibility: "public" | "unlist" | "private") {
  return {
    _id: id,
    title,
    state: "created",
    visibility,
    description: `${visibility === "public" ? "Public" : "Hidden"} test-only model metadata.`,
    tags: ["fixture"],
    languages: ["en"],
    author: { nickname: "must-not-return" },
    samples: [{ audio: "must-not-return" }],
  };
}

function request(url: string) {
  return new Request(url, { headers: { "x-voice-lab-session": "fish-unit-session-01" } });
}

function jsonRequest(body: unknown) {
  return new Request("http://local/api/providers/fish-audio/tts", {
    method: "POST",
    headers: { "content-type": "application/json", "x-voice-lab-session": "fish-unit-session-01" },
    body: JSON.stringify(body),
  });
}

function sttRequest(file: File, model: string) {
  const form = new FormData();
  form.set("file", file, file.name);
  form.set("model", model);
  return new Request("http://local/api/providers/fish-audio/stt", {
    method: "POST",
    headers: { "x-voice-lab-session": "fish-unit-session-01" },
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
