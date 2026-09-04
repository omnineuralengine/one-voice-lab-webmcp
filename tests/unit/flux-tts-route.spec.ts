import { expect, test } from "@playwright/test";

import { POST } from "@/app/api/deepgram/flux-tts/route";
import { resetGuestLabAccessForTests } from "@/lib/access/lab-access";
import { setProviderExecutionPolicyResolverForTests } from "@/lib/providers/execution-policy";
import { resetProviderRequestGuardForTests } from "@/lib/providers/request-guard";

test.describe.configure({ mode: "serial" });

const originalFetch = globalThis.fetch;
const originalEnvironment = {
  apiKey: process.env.DEEPGRAM_API_KEY,
  openLabMode: process.env.OPEN_LAB_MODE,
  providerEnabled: process.env.OPEN_LAB_DEEPGRAM_ENABLED,
};

test.beforeEach(() => {
  process.env.DEEPGRAM_API_KEY = "unit-test-server-key";
  process.env.OPEN_LAB_MODE = "true";
  process.env.OPEN_LAB_DEEPGRAM_ENABLED = "true";
  resetGuestLabAccessForTests();
  resetProviderRequestGuardForTests();
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
  globalThis.fetch = originalFetch;
  resetGuestLabAccessForTests();
  resetProviderRequestGuardForTests();
  setProviderExecutionPolicyResolverForTests();
});

test.afterAll(() => {
  restoreEnvironment("DEEPGRAM_API_KEY", originalEnvironment.apiKey);
  restoreEnvironment("OPEN_LAB_MODE", originalEnvironment.openLabMode);
  restoreEnvironment("OPEN_LAB_DEEPGRAM_ENABLED", originalEnvironment.providerEnabled);
});

test("forwards one allowlisted request and preserves binary audio metadata", async () => {
  const audio = new Uint8Array([0x49, 0x44, 0x33, 0x04]);
  let upstreamUrl = "";
  let upstreamInit: RequestInit | undefined;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    upstreamUrl = String(input);
    upstreamInit = init;
    return new Response(audio, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "dg-request-id": "request-unit-123",
      },
    });
  }) as typeof fetch;

  const response = await POST(fluxRequest({ text: "Hello fixture", model: "flux-cole-en", encoding: "mp3" }));
  expect(response.status).toBe(200);
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(audio);
  expect(response.headers.get("content-type")).toBe("audio/mpeg");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("dg-request-id")).toBe("request-unit-123");
  expect(response.headers.get("dg-model-name")).toBe("flux-cole-en");
  expect(upstreamUrl).toBe("https://api.deepgram.com/v2/speak?model=flux-cole-en&encoding=mp3");
  expect(upstreamInit?.method).toBe("POST");
  expect(upstreamInit?.body).toBe(JSON.stringify({ text: "Hello fixture" }));
  expect(new Headers(upstreamInit?.headers).get("authorization")).toBe("Token unit-test-server-key");
});

test("rejects unsupported models without contacting Deepgram", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response();
  }) as typeof fetch;

  const response = await POST(fluxRequest({ text: "Fixture", model: "flux-conor-en" }));
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ ok: false, error: { code: "invalid_flux_tts_request" } });
  expect(calls).toBe(0);
});

test("rejects arbitrary upstream URLs without contacting them", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response();
  }) as typeof fetch;

  const response = await POST(fluxRequest({
    text: "Fixture",
    model: "flux-cole-en",
    upstreamUrl: "https://example.test/v2/speak",
  }));
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ ok: false, error: { code: "invalid_flux_tts_request" } });
  expect(calls).toBe(0);
});

test("rejects an oversized body without a content-length header before provider activity", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new Error("transport must not run");
  }) as typeof fetch;
  const request = new Request("http://localhost/api/deepgram/flux-tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "x".repeat(17_000), model: "flux-cole-en" }),
  });
  expect(request.headers.has("content-length")).toBe(false);

  const response = await POST(request);
  expect(response.status).toBe(413);
  expect(await response.json()).toMatchObject({ ok: false, error: { code: "request_too_large" } });
  expect(calls).toBe(0);
});

test("honors the provider kill switch while synthetic functionality remains outside this route", async () => {
  process.env.OPEN_LAB_DEEPGRAM_ENABLED = "false";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response();
  }) as typeof fetch;

  const response = await POST(fluxRequest({ text: "Fixture", model: "flux-jack-en" }));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    ok: false,
    error: {
      code: "open_lab_deepgram_disabled",
      message: "Live Deepgram execution is disabled. Synthetic and educational modes remain available.",
    },
  });
  expect(calls).toBe(0);
});

test("returns sanitized provider errors without upstream bodies or credentials", async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({
    message: "Token unit-test-server-key was rejected",
    Authorization: "Token unit-test-server-key",
  }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "dg-request-id": "safe-request-id",
    },
  })) as typeof fetch;

  const response = await POST(fluxRequest({ text: "Fixture", model: "flux-jack-en" }));
  const bodyText = await response.text();
  expect(response.status).toBe(502);
  expect(bodyText).toContain("provider_authorization_failed");
  expect(bodyText).toContain("safe-request-id");
  expect(bodyText).not.toContain("unit-test-server-key");
  expect(bodyText).not.toContain("Authorization");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("dg-request-id")).toBe("safe-request-id");
});

test("does not forward unsafe request identifiers", async () => {
  globalThis.fetch = (async () => new Response(new Uint8Array([1]), {
    status: 200,
    headers: { "Content-Type": "audio/flac", "dg-request-id": "unsafe request id" },
  })) as typeof fetch;
  const response = await POST(fluxRequest({ text: "Fixture", model: "flux-jack-en", encoding: "flac", sample_rate: 16_000 }));
  expect(response.status).toBe(200);
  expect(response.headers.has("dg-request-id")).toBe(false);
  expect(response.headers.get("content-type")).toBe("audio/flac");
});

test("rejects oversized provider audio with a canonical bounded-response error", async () => {
  let cancelled = false;
  globalThis.fetch = (async () => new Response(new ReadableStream<Uint8Array>({
    pull() {
      // The declared length is enough to reject before buffering provider data.
    },
    cancel() { cancelled = true; },
  }), {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(16 * 1024 * 1024 + 1),
    },
  })) as typeof fetch;

  const response = await POST(fluxRequest({ text: "Bounded fixture", model: "flux-cole-en", encoding: "mp3" }));
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({
    ok: false,
    error: { code: "invalid_provider_response" },
  });
  expect(cancelled).toBe(true);
});

function fluxRequest(body: unknown) {
  return new Request("http://localhost/api/deepgram/flux-tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function restoreEnvironment(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
