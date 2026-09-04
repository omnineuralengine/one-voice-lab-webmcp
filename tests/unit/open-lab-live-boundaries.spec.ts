import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getDeepgramEndpoint } from "@/lib/deepgram-endpoint-registry";
import {
  isAuraTtsModel,
  isDeepgramSttModel,
  parseAuraTtsFormat,
} from "@/lib/deepgram-model-policy";
import { OPEN_LAB_PRERECORDED_AUDIO_URLS } from "@/lib/deepgram-prerecorded-policy";
import { prepareDeepgramRequest, sanitizeForBrowser } from "@/lib/deepgram-request-policy";
import { isOpenLabAccountDataEndpoint } from "@/lib/open-lab-endpoint-policy";
import { normalizePublicProviderFetchUrl } from "@/lib/public-provider-url";

const originalEnvironment = {
  openLabMode: process.env.OPEN_LAB_MODE,
  providerEnabled: process.env.OPEN_LAB_DEEPGRAM_ENABLED,
};

test.beforeEach(() => {
  process.env.OPEN_LAB_MODE = "true";
  process.env.OPEN_LAB_DEEPGRAM_ENABLED = "true";
});

test.afterAll(() => {
  restoreEnvironment("OPEN_LAB_MODE", originalEnvironment.openLabMode);
  restoreEnvironment("OPEN_LAB_DEEPGRAM_ENABLED", originalEnvironment.providerEnabled);
});

test("denies every project-scoped Models and Voice Agent read while preserving global discovery", () => {
  const projectEndpoints = [
    "models-project-list",
    "models-project-get",
    "agent-configurations-list",
    "agent-configurations-get",
    "agent-variables-list",
    "agent-variables-get",
  ];

  for (const endpointId of projectEndpoints) {
    const endpoint = getDeepgramEndpoint(endpointId);
    expect(endpoint, endpointId).toBeTruthy();
    expect(isOpenLabAccountDataEndpoint(endpoint!), endpointId).toBe(true);
  }
  expect(isOpenLabAccountDataEndpoint(getDeepgramEndpoint("models-public-list")!)).toBe(false);

  const executor = source("src/lib/deepgram-executor.ts");
  expect(executor).toContain("isOpenLabAccountDataEndpoint(prepared.endpoint)");
  expect(executor).not.toContain("isAccountDataFamily");
  expect(source("src/components/pocket-deepgram/PocketApiLab.tsx")).toContain("isOpenLabAccountDataEndpoint(endpoint)");
});

test("redacts a permanent key reflected by a provider error", () => {
  const secret = "unit-test-server-key";
  const sanitized = sanitizeForBrowser({
    message: `Token ${secret} was rejected`,
    Authorization: `Token ${secret}`,
    nested: { detail: `Bearer ${secret}` },
  }, [secret]);
  const serialized = JSON.stringify(sanitized);
  expect(serialized).not.toContain(secret);
  expect(serialized).not.toContain("Token unit-test");
  expect(serialized).toContain("***redacted***");

  const helper = source("src/lib/deepgram.ts");
  expect(helper).toContain("readBoundedProviderText(response");
  expect(helper).toContain("maxBytes: MAX_PROVIDER_ERROR_RESPONSE_BYTES");
  expect(helper).toContain("sanitizeForBrowser(error.details, knownSecrets)");
});

test("uses registry-backed Aura and STT model allowlists at every live builder", () => {
  expect(isAuraTtsModel("aura-2-thalia-en")).toBe(true);
  expect(isAuraTtsModel("custom-private-model")).toBe(false);
  expect(isDeepgramSttModel("nova-3")).toBe(true);
  expect(isDeepgramSttModel("nova-3-general")).toBe(true);
  expect(isDeepgramSttModel("custom-private-model")).toBe(false);

  expect(() => prepareDeepgramRequest({
    endpointId: "tts-rest",
    query: { model: "custom-private-model", encoding: "mp3" },
    body: { text: "Fixture" },
  })).toThrow(/request validation failed/i);
  expect(() => prepareDeepgramRequest({
    endpointId: "stt-prerecorded",
    query: { model: "custom-private-model" },
    body: { url: OPEN_LAB_PRERECORDED_AUDIO_URLS[0] },
  })).toThrow(/request validation failed/i);
  expect(getDeepgramEndpoint("tts-rest")?.parameters.find((item) => item.name === "model")?.allowedValues).not.toContain("custom-private-model");
  expect(getDeepgramEndpoint("stt-prerecorded")?.parameters.find((item) => item.name === "model")?.allowedValues).not.toContain("custom-private-model");

  const helper = source("src/lib/deepgram.ts");
  expect(helper).toContain("isAuraTtsModel(model)");
  expect(helper).toContain("normalizeSttModel(payload.model)");
});

test("validates Aura media combinations from the documented matrix", () => {
  expect(parseAuraTtsFormat({ encoding: "mp3" })).toEqual({ encoding: "mp3" });
  expect(parseAuraTtsFormat({ encoding: "linear16", container: "none", sampleRate: 24_000 })).toEqual({
    encoding: "linear16",
    container: "none",
    sampleRate: 24_000,
  });
  expect(() => parseAuraTtsFormat({ encoding: "mp3", sampleRate: 24_000 })).toThrow(/not supported/i);
  expect(() => parseAuraTtsFormat({ encoding: "aac", container: "wav" })).toThrow(/not supported/i);
  expect(() => parseAuraTtsFormat({ encoding: "mulaw", sampleRate: 24_000 })).toThrow(/not supported/i);
});

test("rejects callbacks, unsafe destinations, and uncurated Open Lab prerecorded media", () => {
  expect(() => prepareDeepgramRequest({
    endpointId: "tts-rest",
    query: { model: "aura-2-thalia-en", encoding: "mp3", callback: "https://callback.example/hook" },
    body: { text: "Fixture" },
  })).toThrow(/educational-only/i);

  for (const url of [
    "http://127.0.0.1/private.wav",
    "http://2130706433/private.wav",
    "http://[::1]/private.wav",
    "https://user:password@example.com/private.wav",
    "http://audio.local/private.wav",
    "https://example.com:8443/private.wav",
  ]) {
    expect(() => normalizePublicProviderFetchUrl(url), url).toThrow();
    expect(() => prepareDeepgramRequest({
      endpointId: "stt-prerecorded",
      query: { model: "nova-3" },
      body: { url },
    }), url).toThrow();
  }

  expect(normalizePublicProviderFetchUrl("https://example.com/audio.wav")).toBe("https://example.com/audio.wav");
  expect(() => prepareDeepgramRequest({
    endpointId: "stt-prerecorded",
    query: { model: "nova-3" },
    body: { url: "https://example.com/audio.wav" },
  })).toThrow(/curated sample media/i);

  const prepared = prepareDeepgramRequest({
    endpointId: "stt-prerecorded",
    query: { model: "nova-3" },
    body: { url: OPEN_LAB_PRERECORDED_AUDIO_URLS[0] },
  });
  expect(prepared.url.hostname).toBe("api.deepgram.com");
  expect(prepared.body).toEqual({ url: OPEN_LAB_PRERECORDED_AUDIO_URLS[0] });

  process.env.OPEN_LAB_MODE = "false";
  try {
    const localPrepared = prepareDeepgramRequest({
      endpointId: "stt-prerecorded",
      query: { model: "nova-3" },
      body: { url: "https://example.com/audio.wav" },
    });
    expect(localPrepared.body).toEqual({ url: "https://example.com/audio.wav" });
  } finally {
    process.env.OPEN_LAB_MODE = "true";
  }
});

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function restoreEnvironment(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
