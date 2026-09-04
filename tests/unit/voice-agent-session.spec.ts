import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, type RealtimeResources } from "@/components/api-studio/BrowserRealtimeSession";
import {
  DEEPGRAM_VOICE_AGENT_URL,
  deepgramBearerSubprotocols,
  parseTemporaryTokenGrant,
  requestTemporaryToken,
  validateVoiceAgentSettings,
} from "@/lib/api-studio/voice-agent-session";
import { getDeepgramEndpoint } from "@/lib/deepgram-endpoint-registry";

test("token grant success accepts only the temporary token contract", async () => {
  const grant = await requestTemporaryToken(async (input, init) => {
    expect(input).toBe("/api/deepgram/token");
    expect(init?.method).toBe("POST");
    return Response.json({ access_token: "fixture-jwt", expires_in: 60 });
  }, () => 1_000);

  expect(grant).toEqual({
    accessToken: "fixture-jwt",
    expiresIn: 60,
    acquiredAtMs: 1_000,
    expiresAtMs: 61_000,
  });
});

test("missing access_token is rejected", () => {
  expect(() => parseTemporaryTokenGrant({ expires_in: 60 }, 1_000)).toThrow("missing access_token");
});

test("expired token is rejected", () => {
  expect(() => parseTemporaryTokenGrant({ access_token: "fixture-jwt", expires_in: 0 }, 1_000)).toThrow("expired");
});

test("temporary Bearer authentication uses the exact Voice Agent URL and subprotocol order", () => {
  expect(DEEPGRAM_VOICE_AGENT_URL).toBe("wss://agent.deepgram.com/v1/agent/converse");
  expect(deepgramBearerSubprotocols("fixture-jwt")).toEqual(["bearer", "fixture-jwt"]);
});

test("default Settings use the current credential-free Deepgram-managed smoke configuration", () => {
  const endpoint = getDeepgramEndpoint("voice-agent-converse");
  const rawSettings = endpoint?.parameters.find((parameter) => parameter.name === "Settings")?.defaultValue;
  expect(typeof rawSettings).toBe("string");
  const settings = JSON.parse(String(rawSettings)) as {
    agent: { listen: { provider: { type: string } }; think: { provider: { type: string; model: string } }; speak: { provider: { type: string } } };
  };
  expect(validateVoiceAgentSettings(settings)).toEqual([]);
  expect(settings.agent.listen.provider.type).toBe("deepgram");
  expect(settings.agent.think.provider).toEqual({ type: "nvidia", model: "nvidia/nemotron-3-nano-30b-a3b" });
  expect(settings.agent.speak.provider.type).toBe("deepgram");
  expect(JSON.stringify(settings)).not.toMatch(/api[_-]?key|authorization|open_ai/i);
});

test("cleanup after failure closes the socket, tracks, and audio contexts", () => {
  let socketClosed = 0;
  let tracksStopped = 0;
  let contextsClosed = 0;
  const resources = {
    socket: { readyState: 1, close: () => { socketClosed += 1; } },
    stream: { getTracks: () => [{ stop: () => { tracksStopped += 1; } }, { stop: () => { tracksStopped += 1; } }] },
    inputContext: { close: () => { contextsClosed += 1; } },
    outputContext: { close: () => { contextsClosed += 1; } },
    source: { disconnect: () => undefined },
    processor: { onaudioprocess: () => undefined, disconnect: () => undefined },
    sink: { disconnect: () => undefined },
    nextPlayTime: 1,
  } as unknown as RealtimeResources;
  cleanup(resources);

  expect({ socketClosed, tracksStopped, contextsClosed }).toEqual({ socketClosed: 1, tracksStopped: 2, contextsClosed: 2 });
  expect(resources).toMatchObject({ socket: null, stream: null, inputContext: null, outputContext: null, nextPlayTime: 0 });
});

test("server token route keeps the permanent key isolated and success response minimal", () => {
  const route = readFileSync(resolve(process.cwd(), "src/app/api/deepgram/token/route.ts"), "utf8");
  const deepgram = readFileSync(resolve(process.cwd(), "src/lib/deepgram.ts"), "utf8");
  const successResponse = route.match(/return Response\.json\(\{([\s\S]*?)\}, \{\s*headers: NO_STORE_HEADERS/)?.[1] ?? "";

  expect(deepgram).toContain('const DEEPGRAM_API_BASE = "https://api.deepgram.com/v1"');
  expect(deepgram).toContain('`${DEEPGRAM_API_BASE}/auth/grant`');
  expect(deepgram).toContain("Authorization: `Token ${apiKey}`");
  expect(successResponse).toContain("access_token: grant.access_token");
  expect(successResponse).toContain("expires_in: grant.expires_in");
  expect(successResponse).not.toMatch(/\bok\b|inspector|DEEPGRAM_API_KEY/);
  expect(route).not.toMatch(/console\.|process\.env|DEEPGRAM_API_KEY/);
});
