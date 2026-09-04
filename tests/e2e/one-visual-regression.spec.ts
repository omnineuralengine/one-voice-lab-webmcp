import { expect, test, type Page } from "@playwright/test";

const CONTROL_ROOM_STATES = [
  ["overview", "main"],
  ["lab-evolution", "lab-evolution"],
  ["api-studio", "api-lab"],
  ["audio-signal-lab", "audio-signal-lab"],
  ["live-mic", "live-mic"],
  ["tts", "aura-tts"],
  ["flux-tts", "flux-tts"],
] as const;

test.describe("@one-visual-regression", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.config.metadata.openLab !== true, "ONE visual baselines use the isolated Open Lab server.");
  });

  for (const [moduleId, snapshotName] of CONTROL_ROOM_STATES) {
    test(`${snapshotName} desktop`, async ({ page }) => {
      await settle(page, `/?module=${moduleId}`);
      await expect(page).toHaveScreenshot(`one-${snapshotName}-1440.png`, screenshotOptions);
    });
  }

  test("Live Solution Studio desktop", async ({ page }) => {
    await settle(page, "/live-solution-studio");
    await expect(page).toHaveScreenshot("one-live-solution-studio-1440.png", screenshotOptions);
  });

  test("Architecture Studio desktop", async ({ page }) => {
    await settle(page, "/architecture-studio");
    await expect(page).toHaveScreenshot("one-architecture-studio-1440.png", screenshotOptions);
  });

  test("Mobile home shell", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await settle(page, "/");
    await expect(page.getByRole("button", { name: /^Talk/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Compare Deepgram, Fish Audio, and ElevenLabs" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pocket", exact: true })).toBeHidden();
    await expect(page).toHaveScreenshot("one-home-390.png", screenshotOptions);
  });

  test("Lab Evolution mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await settle(page, "/?module=lab-evolution");
    await expect(page.getByTestId("lab-evolution-module")).toBeVisible();
    await expect(page.getByRole("button", { name: "Pocket", exact: true })).toBeHidden();
    await expect(page).toHaveScreenshot("one-lab-evolution-390.png", screenshotOptions);
  });
});

const screenshotOptions = {
  animations: "disabled" as const,
  fullPage: false,
  maxDiffPixelRatio: 0.01,
};

async function settle(page: Page, path: string) {
  await page.goto(path, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  await page.locator("nextjs-portal").evaluateAll((portals) => {
    portals.forEach((portal) => portal.remove());
  });
}
