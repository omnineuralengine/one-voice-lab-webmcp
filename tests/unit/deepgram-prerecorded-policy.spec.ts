import { expect, test } from "@playwright/test";

import { POST as executePost } from "@/app/api/deepgram/execute/route";
import { POST as transcribeFilePost } from "@/app/api/deepgram/transcribe-file/route";
import { POST as transcribeUrlPost } from "@/app/api/deepgram/transcribe-url/route";
import { resetGuestLabAccessForTests } from "@/lib/access/lab-access";
import { AUDIO_UPLOAD_LIMITS } from "@/lib/audio-file-policy";
import {
  normalizePrerecordedAudioUrl,
  OPEN_LAB_PRERECORDED_AUDIO_URLS,
  resolvePrerecordedUploadPolicy,
} from "@/lib/deepgram-prerecorded-policy";
import { resetProviderRequestGuardForTests } from "@/lib/providers/request-guard";
import { setProviderExecutionPolicyResolverForTests } from "@/lib/providers/execution-policy";

test.describe.configure({ mode: "serial" });

const originalFetch = globalThis.fetch;
const originalEnvironment = Object.fromEntries([
  "DEEPGRAM_API_KEY",
  "OPEN_LAB_MODE",
  "OPEN_LAB_DEEPGRAM_ENABLED",
  "HOSTED_REVIEW_MODE",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
].map((key) => [key, process.env[key]]));

test.beforeEach(() => {
  process.env.DEEPGRAM_API_KEY = "unit-test-server-key";
  process.env.OPEN_LAB_MODE = "true";
  process.env.OPEN_LAB_DEEPGRAM_ENABLED = "true";
  delete process.env.HOSTED_REVIEW_MODE;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  resetGuestLabAccessForTests();
  resetProviderRequestGuardForTests();
  setProviderExecutionPolicyResolverForTests(async (providerId, capabilityId) => ({
    ok: true,
    value: {
      known: true,
      providerId,
      capabilityId: capabilityId as "stt.prerecorded",
      accessMode: "public-use",
      runtimeStatus: "enabled",
      benchmarkStatus: "ineligible",
      providerRevision: 1,
      capabilityRevision: 1,
    },
  }));
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  resetGuestLabAccessForTests();
  resetProviderRequestGuardForTests();
  setProviderExecutionPolicyResolverForTests();
});

test.afterAll(() => {
  for (const [key, value] of Object.entries(originalEnvironment)) restoreEnvironment(key, value);
});

test("blocks URL transcription through both prerecorded entry points before provider activity", async () => {
  let providerCalls = 0;
  globalThis.fetch = (async () => {
    providerCalls += 1;
    throw new Error("provider fetch must not run");
  }) as typeof fetch;

  const dedicated = await transcribeUrlPost(jsonRequest("http://local/api/deepgram/transcribe-url", {
    url: "https://media.example.com/untrusted-long-recording.mp3",
    model: "nova-3",
  }));
  const executor = await executePost(jsonRequest("http://local/api/deepgram/execute", {
    endpointId: "stt-prerecorded",
    query: { model: "nova-3" },
    body: { url: "https://media.example.com/untrusted-long-recording.mp3" },
  }));

  expect(dedicated.status).toBe(503);
  expect(await dedicated.text()).toContain("verify media duration");
  expect(executor.status).toBe(400);
  expect(await executor.json()).toMatchObject({ error: { code: "open_lab_media_not_allowed" } });
  expect(providerCalls).toBe(0);
});

test("keeps curated and local URL transcription disabled without provider activity", async () => {
  let providerCalls = 0;
  globalThis.fetch = (async () => {
    providerCalls += 1;
    throw new Error("provider fetch must not run");
  }) as typeof fetch;

  const curated = await transcribeUrlPost(jsonRequest("http://local/api/deepgram/transcribe-url", {
    url: OPEN_LAB_PRERECORDED_AUDIO_URLS[0],
    model: "nova-3",
  }));
  expect(curated.status).toBe(503);

  const curatedUrl = new URL(OPEN_LAB_PRERECORDED_AUDIO_URLS[0]);
  const equivalentCuratedUrl = `HTTPS://${curatedUrl.hostname.toUpperCase()}${curatedUrl.pathname}`;
  const executor = await executePost(jsonRequest("http://local/api/deepgram/execute", {
    endpointId: "stt-prerecorded",
    query: { model: "nova-3" },
    body: { url: equivalentCuratedUrl },
  }));
  expect(executor.status).toBe(503);
  expect(await executor.json()).toMatchObject({ error: { code: "url_transcription_disabled" } });

  process.env.OPEN_LAB_MODE = "false";
  resetGuestLabAccessForTests();
  const local = await transcribeUrlPost(jsonRequest("http://local/api/deepgram/transcribe-url", {
    url: "https://media.example.com/operator-audio.mp3",
    model: "nova-3",
  }));
  expect(local.status).toBe(503);
  expect(providerCalls).toBe(0);
});

test("does not consume transcription allowance for media rejected before provider execution", async () => {
  let providerCalls = 0;
  globalThis.fetch = (async () => {
    providerCalls += 1;
    return Response.json(transcriptionFixture());
  }) as typeof fetch;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const rejected = await transcribeUrlPost(jsonRequest("http://local/api/deepgram/transcribe-url", {
      url: `https://media.example.com/rejected-${attempt}.mp3`,
      model: "nova-3",
    }));
    expect(rejected.status).toBe(503);
  }

  const upload = await transcribeFilePost(fileRequest(
    "http://local/api/deepgram/transcribe-file",
    wavFile(48),
  ));
  expect(upload.status).toBe(200);
  expect(providerCalls).toBe(1);
});

test("applies the 10 MiB trusted-duration cap to paid upload routes in hosted and local modes", async () => {
  let providerCalls = 0;
  globalThis.fetch = (async () => {
    providerCalls += 1;
    return Response.json(transcriptionFixture());
  }) as typeof fetch;

  const oversized = wavFile(AUDIO_UPLOAD_LIMITS.hosted + 1);
  const dedicated = await transcribeFilePost(fileRequest("http://local/api/deepgram/transcribe-file", oversized));
  const executor = await executePost(executorFileRequest(oversized));

  expect(AUDIO_UPLOAD_LIMITS.hosted).toBe(10 * 1024 * 1024);
  expect(dedicated.status).toBe(413);
  expect(executor.status).toBe(413);
  expect(providerCalls).toBe(0);

  process.env.OPEN_LAB_MODE = "false";
  resetGuestLabAccessForTests();
  const localDedicated = await transcribeFilePost(fileRequest("http://local/api/deepgram/transcribe-file", oversized));
  const localExecutor = await executePost(executorFileRequest(oversized));
  expect(localDedicated.status).toBe(413);
  expect(localExecutor.status).toBe(413);
  expect(providerCalls).toBe(0);

  expect(resolvePrerecordedUploadPolicy(100 * 1024 * 1024, { OPEN_LAB_MODE: "false" })).toEqual({
    mode: "local",
    maxBytes: 100 * 1024 * 1024,
  });
  expect(resolvePrerecordedUploadPolicy(25 * 1024 * 1024, { HOSTED_REVIEW_MODE: "true" })).toEqual({
    mode: "hosted",
    maxBytes: AUDIO_UPLOAD_LIMITS.hosted,
  });
});

test("bounds the complete multipart request even when the audio file itself is small", async () => {
  let providerCalls = 0;
  globalThis.fetch = (async () => {
    providerCalls += 1;
    return Response.json(transcriptionFixture());
  }) as typeof fetch;

  const padding = "x".repeat(AUDIO_UPLOAD_LIMITS.hosted + 128 * 1024);
  const dedicated = await transcribeFilePost(paddedFileRequest(
    "http://local/api/deepgram/transcribe-file",
    wavFile(48),
    padding,
  ));
  const executor = await executePost(paddedExecutorFileRequest(wavFile(48), padding));

  expect(dedicated.status).toBe(413);
  expect(executor.status).toBe(413);
  expect(providerCalls).toBe(0);
});

test("preserves short public uploads through both prerecorded routes", async () => {
  let providerCalls = 0;
  globalThis.fetch = (async () => {
    providerCalls += 1;
    return Response.json(transcriptionFixture());
  }) as typeof fetch;

  const shortAudio = wavFile(48);
  const dedicated = await transcribeFilePost(fileRequest("http://local/api/deepgram/transcribe-file", shortAudio));
  const executor = await executePost(executorFileRequest(shortAudio));

  expect(dedicated.status).toBe(200);
  expect(executor.status).toBe(200);
  expect(providerCalls).toBe(2);
});

test("normalizes equivalent curated URLs but rejects changes to their resource identity", () => {
  const curated = new URL(OPEN_LAB_PRERECORDED_AUDIO_URLS[0]);
  expect(normalizePrerecordedAudioUrl(`HTTPS://${curated.hostname.toUpperCase()}${curated.pathname}`, { OPEN_LAB_MODE: "true" }))
    .toBe(OPEN_LAB_PRERECORDED_AUDIO_URLS[0]);
  expect(() => normalizePrerecordedAudioUrl(`${OPEN_LAB_PRERECORDED_AUDIO_URLS[0]}?alternate=1`, { OPEN_LAB_MODE: "true" }))
    .toThrow(/curated sample media/i);
  expect(() => normalizePrerecordedAudioUrl(`https://${curated.hostname}/examples/another.wav`, { OPEN_LAB_MODE: "true" }))
    .toThrow(/curated sample media/i);
});

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function fileRequest(url: string, file: File) {
  const form = new FormData();
  form.set("file", file, file.name);
  form.set("model", "nova-3");
  return new Request(url, { method: "POST", body: form });
}

function executorFileRequest(file: File) {
  const form = new FormData();
  form.set("input", JSON.stringify({ endpointId: "stt-prerecorded", query: { model: "nova-3" }, body: null }));
  form.set("file", file, file.name);
  return new Request("http://local/api/deepgram/execute", { method: "POST", body: form });
}

function paddedFileRequest(url: string, file: File, padding: string) {
  const form = new FormData();
  form.set("file", file, file.name);
  form.set("model", "nova-3");
  form.set("padding", padding);
  return new Request(url, { method: "POST", body: form });
}

function paddedExecutorFileRequest(file: File, padding: string) {
  const form = new FormData();
  form.set("input", JSON.stringify({ endpointId: "stt-prerecorded", query: { model: "nova-3" }, body: null }));
  form.set("file", file, file.name);
  form.set("padding", padding);
  return new Request("http://local/api/deepgram/execute", { method: "POST", body: form });
}

function wavFile(size: number) {
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  new DataView(bytes.buffer).setUint32(4, size - 8, true);
  bytes.set(new TextEncoder().encode("WAVE"), 8);
  bytes.set(new TextEncoder().encode("fmt "), 12);
  new DataView(bytes.buffer).setUint32(16, 16, true);
  new DataView(bytes.buffer).setUint16(20, 1, true);
  new DataView(bytes.buffer).setUint16(22, 1, true);
  new DataView(bytes.buffer).setUint32(24, 8_000, true);
  new DataView(bytes.buffer).setUint32(28, 8_000, true);
  new DataView(bytes.buffer).setUint16(32, 1, true);
  new DataView(bytes.buffer).setUint16(34, 8, true);
  bytes.set(new TextEncoder().encode("data"), 36);
  new DataView(bytes.buffer).setUint32(40, size - 44, true);
  return new File([bytes], "fixture.wav", { type: "audio/wav", lastModified: 1 });
}

function transcriptionFixture() {
  return {
    metadata: { request_id: "request-fixture", duration: 1, channels: 1 },
    results: { channels: [{ alternatives: [{ transcript: "Fixture transcript." }] }] },
  };
}

function restoreEnvironment(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
