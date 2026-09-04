import { expect, test } from "@playwright/test";

import { POST as executeDeepgram } from "@/app/api/deepgram/execute/route";
import { POST as transcribeFile } from "@/app/api/deepgram/transcribe-file/route";
import { POST as transcribeUrl } from "@/app/api/deepgram/transcribe-url/route";
import { setLabAccessClientFactoryForTests } from "@/lib/access/durable-access";
import { resetGuestLabAccessForTests } from "@/lib/access/lab-access";
import { resetProviderRequestGuardForTests } from "@/lib/providers/request-guard";
import { handleProviderTtsPost } from "@/lib/providers/tts-route-handler";

const ORIGINAL_FETCH = globalThis.fetch;
const TRACKED_ENV = [
  "NODE_ENV",
  "ONE_LIVE_LAB_ENABLED",
  "DEEPGRAM_API_KEY",
  "OPEN_LAB_MODE",
  "OPEN_LAB_DEEPGRAM_ENABLED",
  "LAB_USAGE_GUARD_TOKEN",
] as const;
const ORIGINAL_ENV = Object.fromEntries(TRACKED_ENV.map((name) => [name, process.env[name]]));
const VERIFIED_USER_ID = "10000000-0000-4000-8000-000000000001";

test.beforeEach(() => {
  (process.env as Record<string, string | undefined>).NODE_ENV = "test";
  process.env.ONE_LIVE_LAB_ENABLED = "true";
  process.env.DEEPGRAM_API_KEY = "unit-test-server-key";
  process.env.OPEN_LAB_MODE = "true";
  process.env.OPEN_LAB_DEEPGRAM_ENABLED = "true";
  process.env.LAB_USAGE_GUARD_TOKEN = "test-only-guard-token-that-is-at-least-thirty-two-characters";
  resetGuestLabAccessForTests();
  resetProviderRequestGuardForTests();
});

test.afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  for (const name of TRACKED_ENV) restore(name, ORIGINAL_ENV[name]);
  setLabAccessClientFactoryForTests(null);
  resetGuestLabAccessForTests();
  resetProviderRequestGuardForTests();
});

test("URL STT stays disabled before quota or provider dispatch", async () => {
  let rpcCalls = 0;
  let providerCalls = 0;
  setLabAccessClientFactoryForTests(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: VERIFIED_USER_ID } } }) },
    rpc: async () => { rpcCalls += 1; return { data: null, error: null }; },
  }));
  globalThis.fetch = (async () => { providerCalls += 1; throw new Error("must not fetch"); }) as typeof fetch;
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";

  const response = await transcribeUrl(jsonRequest("http://local.test/api/deepgram/transcribe-url", {
    url: "https://static.deepgram.com/examples/Bueller-Life-moves-pretty-fast.wav",
    model: "nova-3",
  }));

  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ error: { code: "url_transcription_disabled" } });
  expect(rpcCalls).toBe(0);
  expect(providerCalls).toBe(0);
});

test("generic JSON STT cannot bypass trusted upload-duration admission", async () => {
  let rpcCalls = 0;
  let providerCalls = 0;
  setLabAccessClientFactoryForTests(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: VERIFIED_USER_ID } } }) },
    rpc: async () => { rpcCalls += 1; return { data: null, error: null }; },
  }));
  globalThis.fetch = (async () => { providerCalls += 1; throw new Error("must not fetch"); }) as typeof fetch;

  for (const body of [null, "untrusted-audio", { audio: "untrusted" }]) {
    const response = await executeDeepgram(jsonRequest("http://local.test/api/deepgram/execute", {
      endpointId: "stt-prerecorded",
      body,
    }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "url_transcription_disabled" } });
  }
  expect(rpcCalls).toBe(0);
  expect(providerCalls).toBe(0);
});

test("legacy STT routes fail closed on provider policy before reading multipart media", async () => {
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  let providerCalls = 0;
  globalThis.fetch = (async () => { providerCalls += 1; throw new Error("must not fetch"); }) as typeof fetch;

  const directRequest = fileRequest(pcmWav(1));
  const directResponse = await transcribeFile(directRequest);
  expect(directResponse.status).toBe(503);
  expect(directRequest.bodyUsed).toBe(false);

  const executorForm = new FormData();
  executorForm.set("file", pcmWav(1), "fixture.wav");
  executorForm.set("input", JSON.stringify({ endpointId: "stt-prerecorded" }));
  const executorRequest = new Request("http://local.test/api/deepgram/execute", {
    method: "POST",
    headers: { origin: "http://local.test" },
    body: executorForm,
  });
  const executorResponse = await executeDeepgram(executorRequest);
  expect(executorResponse.status).toBe(503);
  expect(executorRequest.bodyUsed).toBe(false);
  expect(providerCalls).toBe(0);
});

test("generic executor cannot mint temporary tokens in hosted production", async () => {
  let rpcCalls = 0;
  let providerCalls = 0;
  setLabAccessClientFactoryForTests(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: VERIFIED_USER_ID } } }) },
    rpc: async () => { rpcCalls += 1; return { data: null, error: null }; },
  }));
  globalThis.fetch = (async () => { providerCalls += 1; throw new Error("must not fetch"); }) as typeof fetch;
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";

  const response = await executeDeepgram(jsonRequest("http://local.test/api/deepgram/execute", {
    endpointId: "auth-token-grant",
    body: { ttl_seconds: 30 },
  }));

  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ error: { code: "temporary_token_disabled" } });
  expect(rpcCalls).toBe(0);
  expect(providerCalls).toBe(0);
});

test("trusted WAV duration, not forged client metadata, is the quota admission unit", async () => {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  setLabAccessClientFactoryForTests(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: VERIFIED_USER_ID } } }) },
    rpc: async (name, args) => {
      rpcCalls.push({ name, args });
      return { data: deniedRow("daily_limit"), error: null };
    },
  }));
  let providerCalls = 0;
  globalThis.fetch = (async () => { providerCalls += 1; throw new Error("must not fetch"); }) as typeof fetch;

  const response = await transcribeFile(fileRequest(pcmWav(2.25), {
    observatory: "true",
    duration_ms: "999999999",
  }));

  expect(response.status).toBe(429);
  expect(rpcCalls).toHaveLength(1);
  expect(rpcCalls[0]).toMatchObject({
    name: "acquire_lab_access",
    args: {
      p_operation: "speech_transcription",
      p_requested_units: 3,
      p_acquire_concurrency: false,
    },
  });
  expect(providerCalls).toBe(0);
});

test("malformed WAV is rejected before quota and provider dispatch even with a forged duration", async () => {
  let rpcCalls = 0;
  let providerCalls = 0;
  setLabAccessClientFactoryForTests(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: VERIFIED_USER_ID } } }) },
    rpc: async () => { rpcCalls += 1; return { data: null, error: null }; },
  }));
  globalThis.fetch = (async () => { providerCalls += 1; throw new Error("must not fetch"); }) as typeof fetch;

  const malformed = new Uint8Array(await pcmWav(1).arrayBuffer());
  new DataView(malformed.buffer).setUint32(40, malformed.byteLength, true);
  const response = await transcribeFile(fileRequest(
    new File([malformed], "forged.wav", { type: "audio/wav" }),
    { duration_ms: "1" },
  ));

  expect(response.status).toBe(400);
  expect(await response.text()).toContain("chunk length is inconsistent");
  expect(rpcCalls).toBe(0);
  expect(providerCalls).toBe(0);
});

test("provider budget exhaustion denies trusted-duration STT before provider dispatch", async () => {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  setLabAccessClientFactoryForTests(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: VERIFIED_USER_ID } } }) },
    rpc: async (name, args) => {
      rpcCalls.push({ name, args });
      return { data: deniedRow("provider_budget"), error: null };
    },
  }));
  let providerCalls = 0;
  globalThis.fetch = (async () => { providerCalls += 1; throw new Error("must not fetch"); }) as typeof fetch;

  const response = await transcribeFile(fileRequest(pcmWav(4.1)));

  expect(response.status).toBe(429);
  expect(await response.json()).toMatchObject({ error: { code: "provider_budget_exhausted" } });
  expect(rpcCalls[0]?.args.p_requested_units).toBe(5);
  expect(providerCalls).toBe(0);
});

test("hosted generic Text Intelligence rejects URL ingestion and oversized inline text before quota or provider use", async () => {
  let rpcCalls = 0;
  let providerCalls = 0;
  setLabAccessClientFactoryForTests(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    rpc: async () => { rpcCalls += 1; return { data: null, error: null }; },
  }));
  globalThis.fetch = (async () => { providerCalls += 1; throw new Error("must not fetch"); }) as typeof fetch;
  process.env.OPEN_LAB_MODE = "false";
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";

  const remote = await executeDeepgram(jsonRequest("http://local.test/api/deepgram/execute", {
    endpointId: "text-intelligence",
    body: { url: "https://public.example/document.txt" },
  }));
  expect(remote.status).toBe(403);
  expect(await remote.json()).toMatchObject({ error: { code: "hosted_url_input_locked" } });

  const oversized = await executeDeepgram(jsonRequest("http://local.test/api/deepgram/execute", {
    endpointId: "text-intelligence",
    body: { text: "x".repeat(10_001) },
  }));
  expect(oversized.status).toBe(413);
  expect(await oversized.json()).toMatchObject({ error: { code: "input_too_large" } });
  expect(rpcCalls).toBe(0);
  expect(providerCalls).toBe(0);
});

test("legacy JSON TTS rejects malformed text before consuming quota", async () => {
  let rpcCalls = 0;
  let providerCalls = 0;
  setLabAccessClientFactoryForTests(async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
    rpc: async () => { rpcCalls += 1; return { data: null, error: null }; },
  }));
  globalThis.fetch = (async () => { providerCalls += 1; throw new Error("must not fetch"); }) as typeof fetch;

  const response = await handleProviderTtsPost(
    jsonRequest("http://local.test/api/providers/deepgram/tts", { text: {} }),
    "deepgram",
    "/api/providers/deepgram/tts",
  );
  expect(response.status).toBe(400);
  expect(rpcCalls).toBe(0);
  expect(providerCalls).toBe(0);
});

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", origin: new URL(url).origin },
    body: JSON.stringify(body),
  });
}

function fileRequest(file: File, fields: Record<string, string> = {}): Request {
  const form = new FormData();
  form.set("file", file, file.name);
  form.set("model", "nova-3");
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return new Request("http://local.test/api/deepgram/transcribe-file", {
    method: "POST",
    headers: { origin: "http://local.test" },
    body: form,
  });
}

function pcmWav(durationSeconds: number): File {
  const sampleRate = 16_000;
  const blockAlign = 2;
  const dataBytes = Math.round(durationSeconds * sampleRate) * blockAlign;
  const bytes = new Uint8Array(44 + dataBytes);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
  bytes.set(new TextEncoder().encode("WAVEfmt "), 8);
  new DataView(bytes.buffer).setUint32(16, 16, true);
  new DataView(bytes.buffer).setUint16(20, 1, true);
  new DataView(bytes.buffer).setUint16(22, 1, true);
  new DataView(bytes.buffer).setUint32(24, sampleRate, true);
  new DataView(bytes.buffer).setUint32(28, sampleRate * blockAlign, true);
  new DataView(bytes.buffer).setUint16(32, blockAlign, true);
  new DataView(bytes.buffer).setUint16(34, 16, true);
  bytes.set(new TextEncoder().encode("data"), 36);
  new DataView(bytes.buffer).setUint32(40, dataBytes, true);
  return new File([bytes], "trusted.wav", { type: "audio/wav", lastModified: 1 });
}

function deniedRow(reason: "daily_limit" | "provider_budget") {
  return {
    allowed: false,
    tier: "verified",
    used: 60,
    allowance: 60,
    remaining: 0,
    resets_at: "2026-08-28T00:00:00.000Z",
    daily_used: 60,
    daily_allowance: 60,
    monthly_used: 60,
    monthly_allowance: 1_200,
    reason,
  };
}

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
