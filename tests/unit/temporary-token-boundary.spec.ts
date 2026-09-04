import { expect, test } from "@playwright/test";

import { POST as postTemporaryToken } from "@/app/api/deepgram/token/route";
import {
  checkTemporaryTokenBoundary,
  isSameOriginRequest,
  resetTemporaryTokenBoundaryForTests,
} from "@/lib/temporary-token-boundary";

function request(headers: Record<string, string> = {}) {
  return new Request("https://lab.example/api/deepgram/token", {
    method: "POST",
    headers: { host: "lab.example", origin: "https://lab.example", ...headers },
  });
}

const originalFetch = globalThis.fetch;
const originalHostedReviewMode = process.env.HOSTED_REVIEW_MODE;

test.beforeEach(() => resetTemporaryTokenBoundaryForTests());

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalHostedReviewMode === undefined) delete process.env.HOSTED_REVIEW_MODE;
  else process.env.HOSTED_REVIEW_MODE = originalHostedReviewMode;
});

test("accepts a same-origin temporary credential request", () => {
  expect(isSameOriginRequest(request({ "sec-fetch-site": "same-origin" }))).toBe(true);
  expect(checkTemporaryTokenBoundary(request(), {}, 1_000)).toEqual({ allowed: true });
});

test("rejects missing, malformed, and cross-origin requests", () => {
  expect(isSameOriginRequest(new Request("https://lab.example/api/deepgram/token", { method: "POST", headers: { host: "lab.example" } }))).toBe(false);
  expect(checkTemporaryTokenBoundary(request({ origin: "https://attacker.example" }), {}, 1_000)).toMatchObject({ allowed: false, status: 403, code: "cross_origin" });
  expect(checkTemporaryTokenBoundary(request({ "sec-fetch-site": "cross-site" }), {}, 1_000)).toMatchObject({ allowed: false, status: 403, code: "cross_origin" });
});

test("keeps temporary browser credentials disabled in every hosted environment", () => {
  expect(checkTemporaryTokenBoundary(request(), { HOSTED_REVIEW_MODE: "1" }, 1_000)).toMatchObject({ allowed: false, code: "hosted_realtime_disabled" });
  expect(checkTemporaryTokenBoundary(request(), { HOSTED_REVIEW_MODE: "1", DEEPGRAM_BROWSER_REALTIME_ENABLED: "true" }, 1_000)).toMatchObject({ allowed: false, code: "hosted_realtime_disabled" });
  expect(checkTemporaryTokenBoundary(request(), { NODE_ENV: "production", DEEPGRAM_BROWSER_REALTIME_ENABLED: "true" }, 1_000)).toMatchObject({ allowed: false, code: "hosted_realtime_disabled" });
});

test("denies the hosted token route before any provider request", async () => {
  process.env.HOSTED_REVIEW_MODE = "1";
  let providerRequests = 0;
  globalThis.fetch = (async () => {
    providerRequests += 1;
    throw new Error("The hosted boundary must deny before provider dispatch.");
  }) as typeof fetch;

  const response = await postTemporaryToken(new Request("https://lab.example/api/deepgram/token", {
    method: "POST",
    headers: {
      host: "lab.example",
      origin: "https://lab.example",
      "content-type": "application/json",
    },
    body: JSON.stringify({ ttlSeconds: 60 }),
  }));

  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({
    error: {
      code: "hosted_realtime_disabled",
      message: "Temporary browser credentials are disabled in hosted environments.",
    },
  });
  expect(providerRequests).toBe(0);
});

test("rate-limits repeated token mint attempts without recording request content", () => {
  for (let index = 0; index < 6; index += 1) {
    expect(checkTemporaryTokenBoundary(request({ "x-forwarded-for": "203.0.113.10" }), {}, 1_000 + index)).toEqual({ allowed: true });
  }
  expect(checkTemporaryTokenBoundary(request({ "x-forwarded-for": "203.0.113.10" }), {}, 1_100)).toMatchObject({ allowed: false, status: 429, code: "rate_limited" });
});
