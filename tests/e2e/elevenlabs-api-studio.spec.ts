import { expect, test } from "@playwright/test";

test.describe("ElevenLabs API Studio", () => {
  test("does not call provider routes and exposes canonical fail-closed state", async ({ page }, testInfo) => {
    let providerRequests = 0;
    await page.route("**/api/providers/elevenlabs/**", async (route) => {
      providerRequests += 1;
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false }) });
    });

    await page.goto("/providers/elevenlabs/api-studio");
    await expect(page.getByRole("heading", { name: "ElevenLabs API Studio", exact: true })).toBeVisible();
    await expect(page.getByTestId("elevenlabs-api-studio")).toBeVisible();
    await expect(page.getByTestId("elevenlabs-execution-policy")).toHaveText("Canonical execution policy disabled");
    await expect(page.getByTestId("elevenlabs-credential-readiness")).toHaveText(
      testInfo.config.configFile?.endsWith("playwright.providers.config.ts") === true ? "Server key configured" : "Server key not configured",
    );
    expect(providerRequests).toBe(0);

    await expect(page.getByRole("button", { name: "Load ElevenLabs models and voices" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Generate with ElevenLabs" })).toBeDisabled();
    await page.getByLabel(/authorize this explicit Text to Speech request/i).check();
    await expect(page.getByRole("button", { name: "Generate with ElevenLabs" })).toBeDisabled();
    expect(providerRequests).toBe(0);
  });

  test("is keyboard reachable and links back to the provider evidence profile", async ({ page }) => {
    await page.goto("/providers/elevenlabs/api-studio");
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toBeVisible();
    await expect(page.getByRole("link", { name: "Read ElevenLabs evidence profile" })).toHaveAttribute("href", "/providers/elevenlabs");
    await expect(page.getByText("Not implemented:", { exact: true })).toBeVisible();
  });
});
