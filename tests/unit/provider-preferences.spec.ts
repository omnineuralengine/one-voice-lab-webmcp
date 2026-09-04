import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { PUT as putProviderPreferences } from "../../src/app/api/providers/preferences/route";
import {
  DEFAULT_PROVIDER_PREFERENCES,
  parseCanonicalProviderPreferenceWrite,
  parseCanonicalProviderPreferences,
} from "../../src/lib/providers/preference-schema";

test.describe("provider preferences", () => {
  test("accepts bounded canonical presentation choices", () => {
    const parsed = parseCanonicalProviderPreferenceWrite({
      favoriteProviderIds: ["deepgram", "reson8"],
      hiddenProviderIds: ["coval"],
      preferredProviderOrder: ["reson8", "deepgram"],
      defaultSttProviderId: "deepgram",
      defaultTtsProviderId: "elevenlabs",
      preferredComparisonProviderIds: ["deepgram", "elevenlabs", "fish-audio", "cartesia"],
      preferredDeploymentClass: "hosted",
      expectedRevision: 4,
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.expectedRevision).toBe(4);
  });

  test("rejects invented IDs, overlap, duplicates, and oversized comparison sets", () => {
    expect(parseCanonicalProviderPreferences({ ...DEFAULT_PROVIDER_PREFERENCES, favoriteProviderIds: ["invented-provider"] })).toBeNull();
    expect(parseCanonicalProviderPreferences({ ...DEFAULT_PROVIDER_PREFERENCES, favoriteProviderIds: ["deepgram"], hiddenProviderIds: ["deepgram"] })).toBeNull();
    expect(parseCanonicalProviderPreferences({ ...DEFAULT_PROVIDER_PREFERENCES, favoriteProviderIds: ["deepgram", "deepgram"] })).toBeNull();
    expect(parseCanonicalProviderPreferences({
      ...DEFAULT_PROVIDER_PREFERENCES,
      preferredComparisonProviderIds: ["deepgram", "elevenlabs", "fish-audio", "cartesia", "reson8"],
    })).toBeNull();
  });

  test("keeps the API bounded, owner-authenticated, same-site, and policy-free", () => {
    const route = source("src/app/api/providers/preferences/route.ts");
    const service = source("src/lib/providers/preferences.ts");
    const ui = source("src/components/providers/ProviderPreferenceControls.tsx");
    expect(route).toContain("readBoundedJson(request, MAX_BODY_BYTES)");
    expect(route).toContain("requireBrowserSignal: true");
    expect(route).toContain("resolveHumanIdentity(client)");
    expect(service).toContain('.eq("user_id", userId)');
    expect(service).toContain('.eq("provider_preferences_revision", input.expectedRevision)');
    expect(`${route}\n${service}\n${ui}`).not.toMatch(/API_KEY|environmentVariables|update_provider_runtime_policy|update_provider_capability_policy/);
    expect(ui).toContain("cannot configure, enable, or invoke a provider");
  });

  test("rejects cross-origin, unsupported, and oversized writes before storage", async () => {
    const crossOrigin = await putProviderPreferences(new Request("https://one.test/api/providers/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Origin: "https://attacker.invalid", "Sec-Fetch-Site": "cross-site" },
      body: "{}",
    }));
    expect(crossOrigin.status).toBe(403);

    const unsupported = await putProviderPreferences(new Request("https://one.test/api/providers/preferences", {
      method: "PUT",
      headers: { "Content-Type": "text/plain", Origin: "https://one.test", "Sec-Fetch-Site": "same-origin" },
      body: "{}",
    }));
    expect(unsupported.status).toBe(415);

    const oversized = await putProviderPreferences(new Request("https://one.test/api/providers/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Origin: "https://one.test", "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({ padding: "x".repeat(9_000) }),
    }));
    expect(oversized.status).toBe(413);
  });
});

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}
