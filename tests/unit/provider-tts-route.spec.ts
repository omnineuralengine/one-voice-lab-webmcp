import { expect, test } from "@playwright/test";

import {
  DELETE as compatibilityDelete,
  GET as compatibilityGet,
  POST as compatibilityPost,
} from "../../src/app/api/deepgram/tts/route";
import { resetGuestLabAccessForTests } from "../../src/lib/access/lab-access";
import { handleProviderTtsPost } from "../../src/lib/providers/tts-route-handler";
import { setProviderExecutionPolicyResolverForTests } from "../../src/lib/providers/execution-policy";
import { resetProviderRequestGuardForTests } from "../../src/lib/providers/request-guard";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_KEY = process.env.DEEPGRAM_API_KEY;

test.beforeEach(() => {
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
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_KEY === undefined) delete process.env.DEEPGRAM_API_KEY;
  else process.env.DEEPGRAM_API_KEY = ORIGINAL_KEY;
  resetGuestLabAccessForTests();
  resetProviderRequestGuardForTests();
  setProviderExecutionPolicyResolverForTests();
});

test.describe("provider-neutral TTS dispatch", () => {
  test("preserves the Deepgram compatibility route with a mocked provider response", async () => {
    process.env.DEEPGRAM_API_KEY = "configured";
    let networkCalls = 0;
    globalThis.fetch = async () => {
      networkCalls += 1;
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { "content-type": "audio/mpeg", "dg-request-id": "fixture-request" },
      });
    };

    const response = await compatibilityPost(jsonRequest("http://local/api/deepgram/tts", { text: "Hello from a fixture." }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(networkCalls).toBe(1);
    expect(body.data).toMatchObject({ provider: "deepgram", contentType: "audio/mpeg", byteSize: 4 });
    expect(body.data.audioUrl).toContain("/api/deepgram/tts?id=");
    expect(JSON.stringify(body)).not.toContain("configured");
    expect(JSON.stringify(body)).toContain("***redacted***");
  });

  test("dispatches the provider-neutral route only through the allowlisted adapter", async () => {
    process.env.DEEPGRAM_API_KEY = "configured";
    let networkCalls = 0;
    globalThis.fetch = async () => {
      networkCalls += 1;
      return new Response(new Uint8Array([9]), { status: 200, headers: { "content-type": "audio/mpeg" } });
    };

    const response = await handleProviderTtsPost(
      jsonRequest("http://local/api/providers/deepgram/tts", { text: "Allowlisted adapter." }),
      "deepgram",
      "/api/providers/deepgram/tts",
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(networkCalls).toBe(1);
    expect(body.data.audioUrl).toContain("/api/providers/deepgram/tts?id=");
  });

  test("binds generated compatibility audio retrieval and deletion to the admitted client session", async () => {
    process.env.DEEPGRAM_API_KEY = "configured";
    globalThis.fetch = async () => new Response(new Uint8Array([4, 3, 2, 1]), {
      status: 200,
      headers: { "content-type": "audio/mpeg" },
    });
    const ownerCookie = "one_lab_session=11111111111111111111111111111111";
    const otherCookie = "one_lab_session=22222222222222222222222222222222";
    const created = await compatibilityPost(jsonRequest(
      "http://local/api/deepgram/tts",
      { text: "Session-owned fixture." },
      ownerCookie,
    ));
    const audioUrl = (await created.json()).data.audioUrl as string;
    const ownerGet = await compatibilityGet(new Request(new URL(audioUrl, "http://local"), {
      headers: { cookie: ownerCookie },
    }));
    const otherGet = await compatibilityGet(new Request(new URL(audioUrl, "http://local"), {
      headers: { cookie: otherCookie },
    }));
    const otherDelete = await compatibilityDelete(new Request(new URL(audioUrl, "http://local"), {
      method: "DELETE",
      headers: { cookie: otherCookie },
    }));
    const ownerDelete = await compatibilityDelete(new Request(new URL(audioUrl, "http://local"), {
      method: "DELETE",
      headers: { cookie: ownerCookie },
    }));

    expect(ownerGet.status).toBe(200);
    expect(Array.from(new Uint8Array(await ownerGet.arrayBuffer()))).toEqual([4, 3, 2, 1]);
    expect(otherGet.status).toBe(404);
    expect(await otherDelete.json()).toEqual({ ok: true, deleted: false });
    expect(await ownerDelete.json()).toEqual({ ok: true, deleted: true });
  });

  test("rejects unknown providers before parsing or network activity", async () => {
    let networkCalls = 0;
    globalThis.fetch = async () => {
      networkCalls += 1;
      throw new Error("network must not run");
    };

    const unknown = await handleProviderTtsPost(jsonRequest("http://local/api/providers/unknown/tts", { text: "No." }), "unknown", "/api/providers/unknown/tts");

    expect(unknown.status).toBe(404);
    expect((await unknown.json()).error.code).toBe("provider_unknown");
    expect(networkCalls).toBe(0);
  });

  test("preserves validation limits and fails safely when configuration is missing", async () => {
    delete process.env.DEEPGRAM_API_KEY;
    let networkCalls = 0;
    globalThis.fetch = async () => {
      networkCalls += 1;
      throw new Error("network must not run");
    };

    const missing = await handleProviderTtsPost(jsonRequest("http://local/api/providers/deepgram/tts", { text: "Hello." }), "deepgram", "/api/providers/deepgram/tts");
    expect(missing.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(await missing.json())).not.toMatch(/DEEPGRAM_API_KEY\s*=|Authorization:\s*(?!\*\*\*)/i);

    process.env.DEEPGRAM_API_KEY = "configured";
    const tooLong = await handleProviderTtsPost(
      jsonRequest("http://local/api/providers/deepgram/tts", { text: "x".repeat(2_001) }),
      "deepgram",
      "/api/providers/deepgram/tts",
    );
    expect(tooLong.status).toBeGreaterThanOrEqual(400);
    expect(networkCalls).toBe(0);
  });
});

function jsonRequest(url: string, body: unknown, cookie?: string) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}
