import { expect, test } from "@playwright/test";

test.describe("Fish Audio API Studio", () => {
  test("does not call provider routes and exposes canonical fail-closed state", async ({ page }, testInfo) => {
    let providerRequests = 0;
    await page.route("**/api/providers/fish-audio/**", async (route) => {
      providerRequests += 1;
      const url = route.request().url();
      if (url.endsWith("/models")) {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ ok: true, data: { provider: "fish-audio", models: [{ provider: "fish-audio", id: "s2.1-pro-free", name: "S2.1 Pro Free", capabilities: { textToSpeech: true }, languages: [] }] } }),
        });
        return;
      }
      if (url.includes("/voices")) {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ ok: true, data: { provider: "fish-audio", voices: [{ provider: "fish-audio", id: "public-voice", name: "Public Voice", labels: {}, previewAvailable: false }], hasMore: false } }),
        });
        return;
      }
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false }) });
    });

    await page.goto("/providers/fish-audio/api-studio");
    await expect(page.getByRole("heading", { name: "Fish Audio API Studio", level: 1 })).toBeVisible();
    await expect(page.getByText("No request runs on page load.")).toBeVisible();
    await expect(page.getByTestId("fish-audio-execution-policy")).toHaveText("Canonical execution policy disabled");
    await expect(page.getByTestId("fish-audio-credential-readiness")).toHaveText(
      testInfo.config.configFile?.endsWith("playwright.providers.config.ts") === true ? "Server key configured" : "Server key not configured",
    );
    expect(providerRequests).toBe(0);

    await expect(page.getByRole("button", { name: "Load Fish Audio models and voices" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Generate with Fish Audio" })).toBeDisabled();
    await page.getByText(/I authorize this explicit Text to Speech request/).click();
    await expect(page.getByRole("button", { name: "Generate with Fish Audio" })).toBeDisabled();
    expect(providerRequests).toBe(0);
  });

  test("is keyboard reachable and links to its provider evidence profile", async ({ page }) => {
    await page.goto("/providers/fish-audio/api-studio");
    const evidenceLink = page.getByRole("link", { name: "Read Fish Audio evidence profile" });
    await evidenceLink.focus();
    await expect(evidenceLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/providers\/fish-audio$/);
    await expect(page.getByRole("heading", { name: "Fish Audio", level: 1 })).toBeVisible();
  });
});
