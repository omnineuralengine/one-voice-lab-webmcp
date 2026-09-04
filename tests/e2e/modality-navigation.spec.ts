import { expect, test, type Locator, type Page } from "@playwright/test";

test.describe("release-stage provider workspace navigation", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-1440x900", "Provider handoff and responsive semantics run once at the scripted viewport.");
  });

  test("discloses Deepgram provenance for direct STT and TTS entry without starting a request", async ({ page }) => {
    let providerRequests = 0;
    await page.route("**/api/deepgram/**", async (route) => {
      providerRequests += 1;
      await route.abort();
    });

    for (const entry of [
      { href: "/?module=upload-audio", heading: "Upload Audio", workflow: "Local file transcription" },
      { href: "/?module=tts", heading: "Text to Speech", workflow: "Deepgram Speak" },
    ]) {
      await page.goto(entry.href);
      const handoff = page.getByRole("complementary", { name: "Provider workspace" });
      await expect(handoff).toContainText("Current interactive workspace: Deepgram");
      await expect(handoff).toContainText("Other providers can be inspected in Provider Hub.");
      await expect(handoff.getByRole("link", { name: "Explore", exact: true })).toHaveAttribute("href", "/");
      await expect(handoff.getByRole("link", { name: "Provider Hub", exact: true })).toHaveAttribute("href", "/providers");
      await expect(page.getByRole("heading", { level: 1, name: entry.heading })).toBeVisible();
      await expect(page.getByRole("heading", { name: entry.workflow, exact: true })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Explore" })).toHaveAttribute("aria-current", "page");
      expect(providerRequests).toBe(0);
    }
  });

  test("keeps a deep-linked module visible and current at phone and desktop viewports", async ({ page }) => {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      await page.goto("/?module=api-studio&operation=voice-agent-converse");

      const rail = page.getByRole("navigation", { name: "Lab modules" });
      const active = rail.locator('button[data-module-id="api-studio"]');
      await expect(active).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("heading", { level: 1, name: "API Studio" })).toBeVisible();
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Build" })).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("complementary", { name: "Provider workspace" }).getByRole("link", { name: "Explore", exact: true })).toBeVisible();

      const layout = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);

      if (viewport.width === 390) {
        await expectActiveWithinHorizontalRail(page);

        const connection = rail.locator('button[data-module-id="connection"]');
        await connection.focus();
        await connection.press("Enter");
        await expect(connection).toHaveAttribute("aria-current", "page");
        await expect(connection).toBeFocused();

        await active.focus();
        await active.press("Enter");
        await expect(active).toHaveAttribute("aria-current", "page");
        await expect(active).toBeFocused();
        await expectActiveWithinHorizontalRail(page);

        const studio = page.getByTestId("api-studio-executable");
        const run = studio.getByRole("button", { name: "Run Request" });
        await expect(run).toBeDisabled();
        await expect(run).toHaveAttribute("aria-describedby", "api-studio-hosted-execution-reason");
        await expect(studio.locator("#api-studio-hosted-execution-reason")).toContainText("Hosted temporary-token issuance is disabled.");

        const validate = studio.getByRole("button", { name: "Validate" });
        await tabUntilFocused(page, validate);
        await expect(validate).toBeVisible();
        await page.keyboard.press("Tab");
        await expect(studio.getByRole("button", { name: "Build Payload" })).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(studio.getByRole("button", { name: "Copy cURL" })).toBeFocused();
      }
    }
  });
});

async function expectActiveWithinHorizontalRail(page: Page) {
  await expect.poll(async () => page.evaluate(() => {
    const rail = document.querySelector<HTMLElement>('.one-control-room-nav');
    const active = document.querySelector<HTMLElement>('.one-control-room-nav [aria-current="page"]');
    if (!rail || !active) return false;
    const railBounds = rail.getBoundingClientRect();
    const activeBounds = active.getBoundingClientRect();
    return activeBounds.left >= railBounds.left - 1 && activeBounds.right <= railBounds.right + 1;
  })).toBe(true);
}

async function tabUntilFocused(page: Page, target: Locator) {
  for (let index = 0; index < 180; index += 1) {
    if (await target.evaluate((element) => document.activeElement === element)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error("The critical API Studio control was not keyboard-reachable.");
}
