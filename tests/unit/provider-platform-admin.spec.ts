import { expect, test } from "@playwright/test";

import { GET, PATCH } from "../../src/app/api/admin/providers/route";

const headers = {
  "sec-fetch-site": "same-origin",
  origin: "https://one.example",
};

test.describe("provider platform administrator route", () => {
  test("requires a same-site browser signal before touching provider policy", async () => {
    const response = await GET(new Request("https://one.example/api/admin/providers", {
      headers: { "sec-fetch-site": "cross-site", origin: "https://attacker.example" },
    }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "cross_origin" },
    });
  });

  test("fails closed when the guarded administrator policy service is unavailable", async () => {
    const response = await GET(new Request("https://one.example/api/admin/providers", { headers }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "provider_policy_unavailable" },
    });
  });

  test("requires bounded JSON and explicit confirmation for policy changes", async () => {
    const invalid = await PATCH(new Request("https://one.example/api/admin/providers", {
      method: "PATCH",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ kind: "runtime", update: { providerId: "deepgram", confirmed: false } }),
    }));
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({ error: { code: "invalid_provider_policy" } });

    const oversized = await PATCH(new Request("https://one.example/api/admin/providers", {
      method: "PATCH",
      headers: { ...headers, "content-type": "application/json", "content-length": "9000" },
      body: "{}",
    }));
    expect(oversized.status).toBe(413);
    await expect(oversized.json()).resolves.toMatchObject({ error: { code: "request_too_large" } });
  });
});
