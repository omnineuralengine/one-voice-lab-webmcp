import { expect, test } from "@playwright/test";

import { sanitizeAuraSamples } from "../../src/lib/deepgram-samples";

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.config.metadata.observatory !== true, "URL transcription coverage uses the isolated Observatory runner.");
});

const FORBIDDEN_KEY = "dg_live_secret_value_that_must_never_reach_browser_123456";

const MODEL_FIXTURE = {
  authorization: `Token ${FORBIDDEN_KEY}`,
  account: { project_id: "private-project-id" },
  stt: [{ canonical_name: "nova-3", languages: ["en"] }],
  tts: [
    aura("livia", "aura-2-livia-it", ["it", "it-IT"], "Italian", "https://static.deepgram.com/examples/Aura-2-livia.wav"),
    aura("livia duplicate", "aura-2-livia-it", ["it"], "Italian", "https://static.deepgram.com/examples/Aura-2-livia.wav"),
    aura("celeste", "aura-2-celeste-es", ["es", "es-CO"], "Colombian", "https://static.deepgram.com/examples/Aura-2-celeste.wav"),
    aura("julius", "aura-2-julius-de", ["de"], "German", "https://static.deepgram.com/examples/Aura-2-julius.wav"),
    aura("agathe", "aura-2-agathe-fr", ["fr"], "French", "https://static.deepgram.com/examples/Aura-2-agathe.wav"),
    aura("rhea", "aura-2-rhea-nl", ["nl"], "Dutch", "https://static.deepgram.com/examples/Aura-2-rhea.wav"),
    aura("izanami", "aura-2-izanami-ja", ["ja"], "Japanese", "https://static.deepgram.com/examples/Aura-2-izanami.wav"),
    aura("thalia", "aura-2-thalia-en", ["en", "en-US"], "American", "https://static.deepgram.com/examples/Aura-2-thalia.wav"),
    aura("livia cdn", "aura-2-livia-it", ["it", "it-IT"], "Italian", "https://cdn.sanity.io/files/example/aura-2-livia-it.wav"),
    { name: "missing", canonical_name: "aura-2-missing-it", architecture: "aura-2", languages: ["it"], metadata: {} },
    aura("insecure", "aura-2-insecure-it", ["it"], "Italian", "http://static.deepgram.com/examples/insecure.wav"),
    aura("untrusted", "aura-2-untrusted-it", ["it"], "Italian", "https://example.com/untrusted.wav"),
  ],
};

test.describe("@transcribe-url sample metadata sanitizer", () => {
  test("official model metadata remains narrowed and secret-free", async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-1440x900", "Pure sanitizer coverage runs once.");
    const auraSamples = sanitizeAuraSamples(MODEL_FIXTURE);
    expect(auraSamples).toHaveLength(8);
    expect(new Set(auraSamples.map((sample) => sample.sampleUrl)).size).toBe(auraSamples.length);
    expect(new Set(auraSamples.map((sample) => sample.languageCode))).toEqual(new Set(["en", "it", "es", "de", "fr", "nl", "ja"]));
    expect(JSON.stringify(auraSamples)).not.toContain(FORBIDDEN_KEY);
    expect(JSON.stringify(auraSamples)).not.toContain("private-project-id");
    expect(auraSamples.every((sample) => ["static.deepgram.com", "cdn.sanity.io"].includes(new URL(sample.sampleUrl).hostname))).toBe(true);
  });
});

test.describe("@transcribe-url hosted-disabled state", () => {
  test("discloses native disabled controls and cannot initiate a request", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-1440x900", "Hosted-disabled interaction coverage runs once.");
    let deepgramRequests = 0;
    await page.route("**/api/deepgram/**", async (route) => {
      deepgramRequests += 1;
      await route.abort();
    });

    await page.goto("/?module=transcribe-url");

    await expect(page.getByRole("heading", { level: 1, name: "Transcribe URL" })).toBeVisible();
    await expect(page.getByText("URL transcription is unavailable in this hosted lab.", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Hosted audio URL")).toBeDisabled();
    const primary = page.locator('button[data-shortcut-command="run_primary"]');
    await expect(primary).toBeDisabled();
    await expect(primary).toHaveAttribute("aria-describedby", "url-transcription-unavailable");
    await primary.evaluate((button: HTMLButtonElement) => button.click());
    await page.keyboard.press("Control+Enter");
    expect(deepgramRequests).toBe(0);
  });
});

function aura(name: string, canonicalName: string, languages: string[], accent: string, sample: string) {
  return { name, canonical_name: canonicalName, architecture: "aura-2", languages, metadata: { accent, sample, tags: ["clear", "friendly"] } };
}
