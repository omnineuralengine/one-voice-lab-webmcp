import { expect, test } from "@playwright/test";

import { resolveAuthCallbackRedirect } from "@/lib/auth/callback-redirect";

const ORIGIN = "https://one-voice-lab.example";
const FALLBACK = `${ORIGIN}/settings#identity`;

test.describe("OAuth callback redirect boundary", () => {
  test("preserves the intended settings redirects", () => {
    expect(resolveAuthCallbackRedirect("/settings", ORIGIN).toString()).toBe(`${ORIGIN}/settings`);
    expect(resolveAuthCallbackRedirect("/settings#identity", ORIGIN).toString()).toBe(FALLBACK);
  });

  test("rejects decoded backslashes and other cross-origin URL forms", () => {
    const encodedBackslash = new URL(
      `${ORIGIN}/auth/callback?next=%2F%5Cattacker.example%2Fsettings`,
    ).searchParams.get("next");

    for (const value of [
      encodedBackslash,
      "//attacker.example/settings",
      "https://attacker.example/settings",
      "/\\attacker.example/settings",
      "//one-voice-lab.example/settings",
      "/%2fattacker.example/settings",
      "/%5cattacker.example/settings",
      "/settings%3Fnext=https%3A%2F%2Fattacker.example",
    ]) {
      expect(resolveAuthCallbackRedirect(value, ORIGIN).toString()).toBe(FALLBACK);
    }
  });

  test("falls back for unapproved same-origin paths and state", () => {
    for (const value of [null, "/", "/build", "/settings?next=https://attacker.example"] as const) {
      expect(resolveAuthCallbackRedirect(value, ORIGIN).toString()).toBe(FALLBACK);
    }
  });
});
