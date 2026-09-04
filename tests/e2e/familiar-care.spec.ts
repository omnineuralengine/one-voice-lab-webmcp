import { expect, test } from "@playwright/test";

test.describe("@familiar-care consent-first approved voice preview", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-1440x900", "Familiar Care interaction coverage runs once.");
    await page.addInitScript(() => {
      const create = URL.createObjectURL.bind(URL);
      const revoke = URL.revokeObjectURL.bind(URL);
      const audit = { created: [] as string[], revoked: [] as string[] };
      Object.defineProperty(window, "__familiarAudioAudit", { value: audit, configurable: true });
      URL.createObjectURL = (value) => { const url = create(value); audit.created.push(url); return url; };
      URL.revokeObjectURL = (url) => { audit.revoked.push(url); revoke(url); };
    });
    await page.goto("/?module=trusted-voice");
  });

  test("scenario exploration is public and loading never generates audio", async ({ page }) => {
    let calls = 0;
    await page.route("**/api/deepgram/tts*", async (route) => { calls += 1; await route.abort(); });
    await expect(page.getByRole("heading", { name: "Familiar Care" })).toBeVisible();
    await expect(page.getByText("Medication Pickup Reminder", { exact: true }).first()).toBeVisible();
    await page.getByRole("article").filter({ hasText: "Family Memory Reminder" }).getByRole("button", { name: "Load Builder" }).click();
    await expect(page.getByLabel("Message text")).toHaveValue(/Dinner with Aunt Lena/);
    expect(calls).toBe(0);
  });

  test("consent, disclosure, risk, and sensitive-detail controls gate preview", async ({ page }) => {
    const preview = page.getByRole("button", { name: "Preview Approved Voice", exact: true }).last();
    await expect(preview).toBeDisabled();
    for (const label of [
      "I have permission to use this voice or message.",
      "This demo uses an approved synthetic voice and does not claim to be a live person.",
      "I will not impersonate a real person without consent.",
      "I understand that sensitive details should remain in a verified secondary channel.",
      "I understand that the recipient must be able to opt out.",
    ]) await page.getByLabel(label).check();
    await expect(page.getByText("Consent confirmed", { exact: true })).toBeVisible();
    await expect(page.getByText(DEFAULT_DISCLOSURE, { exact: true })).toBeVisible();
    await expect(page.getByText(/change or disable familiar-care messages/).first()).toBeVisible();
    await expect(preview).toBeEnabled();

    await page.getByLabel("Message text").fill("Your verification code is 123456");
    await expect(page.getByTestId("familiar-care").getByRole("alert")).toContainText("Authentication code");
    await expect(preview).toBeDisabled();
  });

  test("selected Aura model is sent, audio does not autoplay, and object URL is revoked", async ({ page }) => {
    let requestBody: Record<string, unknown> | null = null;
    let deleted = false;
    await page.route("**/api/deepgram/tts*", async (route) => {
      const request = route.request();
      if (request.method() === "POST") {
        requestBody = request.postDataJSON();
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { audioUrl: "/api/deepgram/tts?id=familiar-fixture", contentType: "audio/mpeg", byteSize: 4, model: "aura-2-helena-en", textLength: 80, binaryAudio: "***not included in JSON***" }, inspector: fixtureInspector() }) });
      } else if (request.method() === "GET") {
        await route.fulfill({ status: 200, contentType: "audio/mpeg", body: "fixture-audio" });
      } else {
        deleted = true;
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, deleted: true }) });
      }
    });

    for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
    await page.getByRole("button", { name: "Preview Approved Voice", exact: true }).last().click();
    const player = page.getByLabel("Familiar Care approved synthetic voice preview");
    await expect(player).toBeVisible();
    await expect(player).toHaveJSProperty("paused", true);
    expect((requestBody as { model?: string } | null)?.model).toBe("aura-2-helena-en");
    expect(JSON.stringify(requestBody)).toContain("familiarCare");
    await expect.poll(() => deleted).toBe(true);

    const objectUrl = await page.evaluate(() => (window as unknown as { __familiarAudioAudit: { created: string[] } }).__familiarAudioAudit.created.at(-1));
    await page.getByRole("button", { name: "Regenerate", exact: true }).click();
    await expect.poll(() => page.evaluate((url) => (window as unknown as { __familiarAudioAudit: { revoked: string[] } }).__familiarAudioAudit.revoked.includes(String(url)), objectUrl)).toBe(true);
    const replacementUrl = await page.evaluate(() => (window as unknown as { __familiarAudioAudit: { created: string[] } }).__familiarAudioAudit.created.at(-1));
    await page.getByRole("button", { name: /Overview/i }).first().click();
    await expect.poll(() => page.evaluate((url) => (window as unknown as { __familiarAudioAudit: { revoked: string[] } }).__familiarAudioAudit.revoked.includes(String(url)), replacementUrl)).toBe(true);
  });

  test("raw request view is sanitized", async ({ page }) => {
    await page.getByText("View raw request", { exact: true }).click();
    const details = page.locator("details").filter({ hasText: "View raw request" });
    await expect(details).toContainText("***redacted***");
    await expect(details).not.toContainText("Hi Connor");
    await expect(details).not.toContainText(/Authorization|DEEPGRAM_API_KEY/);
  });

  test("server rejects Familiar Care generation without consent before provider execution", async ({ request }) => {
    const privateText = "Private recipient message fixture";
    const response = await request.post("/api/deepgram/tts", {
      data: {
        text: privateText,
        model: "aura-2-helena-en",
        familiarCare: {
          scenarioId: "medication-pickup-reminder",
          riskLevel: "Medium",
          disclosureStyle: "spoken-and-displayed",
          sensitiveDetailPolicy: "no-sensitive-details",
          fallbackChannel: "verified-mobile-app",
          optOutInstruction: "You can opt out in preferences.",
          consent: { permission: false, syntheticVoice: false, noImpersonation: false, sensitiveChannel: false, optOut: false },
        },
      },
    });
    expect(response.status()).toBe(400);
    const body = await response.text();
    expect(body).toContain("consent confirmation");
    expect(body).not.toContain(privateText);
  });
});

const DEFAULT_DISCLOSURE = "This is an automated message delivered using an approved synthetic voice.";

function fixtureInspector() {
  const at = new Date().toISOString();
  return { id: "fixture", module: "Trusted Voice: Familiar Care", startedAt: at, completedAt: at, durationMs: 1, request: { method: "POST", endpoint: "/api/deepgram/tts", headers: {}, bodyPreview: { textLength: 80 } }, response: { status: 200, headers: {}, bodyPreview: { audio: "available" } }, timeline: [], notes: [] };
}
