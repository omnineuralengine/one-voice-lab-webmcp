import { expect, test, type Page } from "@playwright/test";

import {
  CODE_LAB_SECRET_PLACEHOLDERS,
  detectLikelySecret,
  sanitizeSnippetWithReport,
} from "../../src/lib/code-lab-launch-context";
import {
  clearLabStorage,
  expectBrowserSurfaceSanitized,
  expectNoPotentialSecrets,
  openAppliedEngineeringQuestline,
  readStorageSnapshot,
} from "./helpers";

const FAKE_SK_SECRET = ["sk", "fake", "questline", "security", "1234567890"].join("-");
const FAKE_API_SECRET = "dg_fake_voice_key_1234567890abcdef";
const FAKE_TOKEN_SECRET = "fakeVoiceToken_1234567890abcdef";
const FAKE_JWT = [
  "eyJhbGciOiJIUzI1NiJ9",
  "eyJzdWIiOiJxdWVzdGxpbmUtdGVzdCJ9",
  "c2lnbmF0dXJlLWZpeHR1cmU",
].join(".");

test.describe("@questline launch security", () => {
  test("safe credential placeholders remain intact", () => {
    for (const placeholder of CODE_LAB_SECRET_PLACEHOLDERS) {
      const result = sanitizeSnippetWithReport(placeholder);
      expect(result.value, placeholder).toBe(placeholder);
      expect(result.replacements, placeholder).toBe(0);
      expect(detectLikelySecret(result.value), placeholder).toBe(false);
    }

    const safeExamples = [
      "DEEPGRAM_API_KEY=DEEPGRAM_API_KEY",
      "Authorization: Token DEEPGRAM_API_KEY",
      "const apiKey = process.env.DEEPGRAM_API_KEY;",
      "api_key = os.environ['DEEPGRAM_API_KEY']",
      "$headers = @{ Authorization = \"Token $env:DEEPGRAM_API_KEY\" }",
    ];

    for (const example of safeExamples) {
      const result = sanitizeSnippetWithReport(example);
      expect(result.value, example).toBe(example);
      expect(result.replacements, example).toBe(0);
      expect(detectLikelySecret(result.value), example).toBe(false);
    }
  });

  test("high-confidence credential fixtures are detected and removed", () => {
    const cases = [
      {
        name: "real-looking assignment",
        source: `DEEPGRAM_API_KEY=\"${FAKE_API_SECRET}\"`,
        forbidden: [FAKE_API_SECRET],
      },
      {
        name: "Authorization Token",
        source: `Authorization: \"Token ${FAKE_TOKEN_SECRET}\"`,
        forbidden: [FAKE_TOKEN_SECRET],
      },
      {
        name: "Authorization Bearer",
        source: `Authorization: \"Bearer ${FAKE_TOKEN_SECRET}\"`,
        forbidden: [FAKE_TOKEN_SECRET],
      },
      {
        name: "JWT",
        source: `const accessToken = \"${FAKE_JWT}\";`,
        forbidden: [FAKE_JWT],
      },
      {
        name: "sk-prefixed key",
        source: `const credential = \"${FAKE_SK_SECRET}\";`,
        forbidden: [FAKE_SK_SECRET],
      },
      {
        name: ".env.local assignment",
        source: `# .env.local\nDEEPGRAM_API_KEY=${FAKE_SK_SECRET}`,
        forbidden: [FAKE_SK_SECRET],
      },
      {
        name: "localStorage credential",
        source: `localStorage.setItem(\"deepgram_api_key\", \"${FAKE_SK_SECRET}\")`,
        forbidden: [FAKE_SK_SECRET],
      },
    ];

    for (const fixture of cases) {
      expect(detectLikelySecret(fixture.source), fixture.name).toBe(true);
      const result = sanitizeSnippetWithReport(fixture.source);
      expect(result.replacements, fixture.name).toBeGreaterThan(0);
      expect(result.findings.length, fixture.name).toBeGreaterThan(0);
      expect(detectLikelySecret(result.value), fixture.name).toBe(false);
      expectNoPotentialSecrets(result.value, { forbiddenValues: fixture.forbidden });
      expectNoPotentialSecrets(JSON.stringify(result.findings), { forbiddenValues: fixture.forbidden });
    }
  });

  test("Questline Payload Inspector redacts Authorization before rendering", async ({ page }) => {
    await resetBrowserState(page);
    await openAppliedEngineeringQuestline(page);
    await page.getByRole("button", { name: "Payload Inspector", exact: true }).click();

    const inspector = page.locator("section").filter({
      has: page.getByText("Questline Payload Inspector", { exact: true }),
    }).last();
    await inspector.getByRole("button", { name: "Request", exact: true }).click();
    await expect(inspector).toContainText("Token ***redacted***");
    await expect(inspector).not.toContainText("Token DEEPGRAM_API_KEY");
  });

  test("editor content is memory-only until a sanitized explicit save", async ({ page }) => {
    await resetBrowserState(page);
    const deepgramApiCalls: string[] = [];
    const consoleMessages: string[] = [];
    page.on("console", (message) => consoleMessages.push(message.text()));
    page.on("request", (request) => {
      if (request.url().includes("/api/deepgram/")) deepgramApiCalls.push(request.url());
    });

    await launchActiveQuestInTemporaryCodeLab(page);
    expect(new URL(page.url()).search).toBe("");
    expect(new URL(page.url()).hash).toBe("");
    const editor = page.getByTestId("code-lab-editor");
    const dangerousSnippet = [
      `DEEPGRAM_API_KEY=\"${FAKE_SK_SECRET}\"`,
      `const headers = { Authorization: \"Bearer ${FAKE_TOKEN_SECRET}\" };`,
      `const jwt = \"${FAKE_JWT}\";`,
      `localStorage.setItem(\"deepgram_api_key\", \"${FAKE_API_SECRET}\");`,
    ].join("\n");
    const forbidden = [FAKE_SK_SECRET, FAKE_TOKEN_SECRET, FAKE_JWT, FAKE_API_SECRET];

    await editor.fill(dangerousSnippet);
    expect(new URL(page.url()).search).toBe("");
    expect(new URL(page.url()).hash).toBe("");
    await expect(page.getByRole("alert").filter({ hasText: /api key|credential|secret|localStorage/i }).first()).toBeVisible();

    const beforeSave = await readStorageSnapshot(page);
    expectNoPotentialSecrets(JSON.stringify(beforeSave), { forbiddenValues: forbidden });
    expect(Object.keys(beforeSave.localStorage).some((key) => key.includes("imported-draft"))).toBe(false);
    for (const secret of forbidden) {
      expect(JSON.stringify(beforeSave)).not.toContain(secret);
      expect(page.url()).not.toContain(secret);
    }

    await page.getByRole("button", { name: "Save as local draft", exact: true }).click();
    await expect(page.getByRole("button", { name: /Redacted \+ saved\.|Saved locally\./ })).toBeVisible();

    const sanitizedEditor = await editor.inputValue();
    expect(sanitizedEditor).toMatch(/REDACTED|DEEPGRAM_API_KEY/);
    expect(detectLikelySecret(sanitizedEditor)).toBe(false);
    expectNoPotentialSecrets(sanitizedEditor, { forbiddenValues: forbidden });

    const afterSave = await readStorageSnapshot(page);
    const importedDrafts = Object.entries(afterSave.localStorage).filter(([key]) =>
      key.startsWith("deepgram-code-lab:imported-draft:v1:"),
    );
    expect(importedDrafts).toHaveLength(1);
    expectNoPotentialSecrets(JSON.stringify(afterSave), { forbiddenValues: forbidden });
    expectNoPotentialSecrets(importedDrafts[0][1], { forbiddenValues: forbidden });

    const browserSurface = await page.evaluate(() => ({
      url: window.location.href,
      html: document.documentElement.outerHTML,
      text: document.body.innerText,
      formValues: Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"))
        .map((element) => element.value),
    }));
    expectNoPotentialSecrets(JSON.stringify(browserSurface), { forbiddenValues: forbidden });
    await expectBrowserSurfaceSanitized(page, forbidden);
    expectNoPotentialSecrets(JSON.stringify(consoleMessages), {
      source: "browser console",
      forbiddenValues: forbidden,
    });
    expect(new URL(page.url()).search).toBe("");
    expect(new URL(page.url()).hash).toBe("");
    expect(deepgramApiCalls).toEqual([]);
  });
});

async function resetBrowserState(page: Page) {
  await page.goto("/");
  await clearLabStorage(page);
  await page.reload();
  await page.waitForLoadState("networkidle");
}

async function launchActiveQuestInTemporaryCodeLab(page: Page) {
  await openAppliedEngineeringQuestline(page);
  await page.getByRole("button", { name: "Open this quest in Code Lab", exact: true }).first().click();
  const dialog = page.getByTestId("code-lab-launch-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("radio", { name: /Open as a new temporary workspace/i }).check();
  await dialog.getByTestId("confirm-code-lab-launch").click();
  await expect(page.getByTestId("questline-launch-banner")).toBeVisible();
  await expect(page.getByTestId("code-lab-editor")).toBeVisible();
}
