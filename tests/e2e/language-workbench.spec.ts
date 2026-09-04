import { expect, test, type Page } from "@playwright/test";

test.describe("@language-workbench verified configuration workflow", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-1440x900", "Language Workbench interaction coverage runs once.");
    await page.addInitScript(() => {
      let microphoneRequests = 0;
      Object.defineProperty(window, "__languageWorkbenchMicRequests", { get: () => microphoneRequests, configurable: true });
      Object.defineProperty(navigator, "mediaDevices", {
        value: { getUserMedia: async () => { microphoneRequests += 1; throw new Error("Unexpected microphone request"); }, enumerateDevices: async () => [] },
        configurable: true,
      });
    });
    await page.goto("/?module=language-explorer");
    await openWorkbench(page);
  });

  test("searches by name and code, selects with Enter, and shows distinct regional variants", async ({ page }) => {
    const search = page.getByLabel("Search supported languages");
    await search.fill("Italian");
    await search.press("Enter");
    await expect(page.getByRole("heading", { name: "Italian", exact: true })).toBeVisible();
    await expect(page.getByLabel("Language code it", { exact: true })).toBeVisible();
    await expect(page.getByText("model=nova-3&language=it", { exact: true })).toBeVisible();

    await search.fill("en-GB");
    await search.press("Enter");
    await expect(page.getByLabel("Language code en-GB", { exact: true })).toBeVisible();
    await page.getByText("Compare regional variants", { exact: true }).click();
    const variants = page.locator("details");
    await expect(variants.getByText("en-US", { exact: true })).toBeVisible();
    await expect(variants.getByText("en-GB", { exact: true })).toBeVisible();

    await search.fill("definitely-not-supported");
    await expect(page.getByText("No supported language matches this search.")).toBeVisible();
    await search.press("Escape");
    await expect(search).toHaveValue("");
  });

  test("copy succeeds or exposes the manual fallback and never includes a real key", async ({ page }) => {
    await selectItalian(page);
    let copied = "";
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { value: { writeText: async (value: string) => { (window as unknown as { __copied?: string }).__copied = value; } }, configurable: true }));
    await page.getByRole("button", { name: "Copy JSON configuration", exact: true }).click();
    copied = await page.evaluate(() => (window as unknown as { __copied?: string }).__copied ?? "");
    expect(copied).toContain('"language": "it"');
    expect(copied).not.toContain("DEEPGRAM_API_KEY");
    await expect(page.getByText("JSON configuration copied.", { exact: true })).toBeVisible();

    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => { throw new Error("denied"); } }, configurable: true }));
    await page.getByRole("button", { name: "Copy Query parameters", exact: true }).click();
    await expect(page.getByText("Copy failed. Select the text manually.", { exact: true })).toBeVisible();
  });

  test("discloses disabled URL transcription and prepopulates other workflows without execution or microphone access", async ({ page }) => {
    let transcriptionRequests = 0;
    await page.route("**/api/deepgram/transcribe-*", async (route) => { transcriptionRequests += 1; await route.abort(); });
    await page.route("**/api/deepgram/execute", async (route) => { transcriptionRequests += 1; await route.abort(); });

    await selectItalian(page);
    await page.getByRole("button", { name: "View URL transcription availability" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Transcribe URL" })).toBeVisible();
    await expect(page.getByText("URL transcription is unavailable in this hosted lab.", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Hosted audio URL")).toBeDisabled();
    await expect(page.locator('button[data-shortcut-command="run_primary"]')).toBeDisabled();

    await openWorkbench(page);
    await page.getByRole("button", { name: "Use in Upload Audio" }).click();
    await expect(page.getByLabel("File spoken language")).toHaveValue("it");
    await expect(page.getByLabel("Known language")).toBeChecked();

    await openWorkbench(page);
    await page.getByRole("button", { name: "Use in Live Mic" }).click();
    await expect(page.getByText("Italian configuration applied. No microphone permission or request was run.", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __languageWorkbenchMicRequests: number }).__languageWorkbenchMicRequests)).toBe(0);

    await openWorkbench(page);
    await page.getByRole("button", { name: "Open in API Studio" }).click();
    await expect(page.getByRole("heading", { name: "Transcribe Prerecorded Audio" })).toBeVisible();
    await expect(page.getByLabel("Model")).toHaveValue("nova-3");
    await expect(page.getByLabel("Language")).toHaveValue("it");
    await expect(page.getByText("Italian configuration applied. No request was run.", { exact: true })).toBeVisible();
    expect(transcriptionRequests).toBe(0);
  });

  test("sample text handoff is reviewed, prepopulated, and does not synthesize", async ({ page }) => {
    let ttsRequests = 0;
    await page.route("**/api/deepgram/tts*", async (route) => { ttsRequests += 1; await route.abort(); });
    await selectItalian(page);
    await page.getByRole("button", { name: "Use in Text to Speech" }).click();
    await expect(page.getByRole("textbox", { name: "Text", exact: true })).toHaveValue(/Ciao/);
    await expect(page.getByText("Italian sample text applied. No speech request was sent.", { exact: true })).toBeVisible();
    expect(ttsRequests).toBe(0);

    await openWorkbench(page);
    const search = page.getByLabel("Search supported languages");
    await search.fill("Portuguese");
    await search.press("Enter");
    await expect(page.getByText("Olá, este é um breve teste de voz para o laboratório de idiomas da Deepgram.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Use in Text to Speech" })).toHaveCount(0);
  });
});

async function openWorkbench(page: Page) {
  if (await page.getByRole("heading", { name: "Nova-3 Language Workbench" }).isVisible().catch(() => false)) return;
  if (!(await page.getByRole("heading", { name: "ONE Voice Lab", exact: true }).isVisible().catch(() => false))) {
    await page.keyboard.press("g");
    await page.keyboard.press("l");
    await expect(page.getByRole("heading", { name: "Nova-3 Language Workbench" })).toBeVisible();
    return;
  }
  await page.goto("/?module=language-explorer");
  await expect(page.getByRole("heading", { name: "Nova-3 Language Workbench" })).toBeVisible();
}

async function selectItalian(page: Page) {
  const search = page.getByLabel("Search supported languages");
  await search.fill("Italian");
  await search.press("Enter");
  await expect(page.getByLabel("Language code it", { exact: true })).toBeVisible();
}
