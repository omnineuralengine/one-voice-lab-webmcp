import { expect, test } from "@playwright/test";

import {
  checkPublicReadAccess,
  publicReadRateLimitResponse,
  resetPublicReadGuardForTests,
} from "../../src/lib/public-evidence/read-guard";

test.describe("provider platform public read guard", () => {
  test.beforeEach(() => resetPublicReadGuardForTests());

  test("allows legitimate bounded automation and returns a graceful 429 for bursts", async () => {
    const request = new Request("https://voice.example.test/api/public/v1/providers");
    for (let index = 0; index < 120; index += 1) {
      expect(checkPublicReadAccess(request, "rest:providers:list", 1_000).allowed).toBe(true);
    }

    const denied = checkPublicReadAccess(request, "rest:providers:list", 1_000);
    expect(denied.allowed).toBe(false);
    const response = publicReadRateLimitResponse(denied);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(await response.json()).toMatchObject({
      error: { code: "public_read_rate_limited", retryable: true },
    });
  });

  test("bounds malformed caller scopes instead of turning them into storage keys", () => {
    const request = new Request("https://voice.example.test/mcp");
    expect(checkPublicReadAccess(request, "x".repeat(10_000), 5_000).allowed).toBe(true);
    expect(checkPublicReadAccess(request, "x".repeat(20_000), 5_000).allowed).toBe(true);
  });
});
