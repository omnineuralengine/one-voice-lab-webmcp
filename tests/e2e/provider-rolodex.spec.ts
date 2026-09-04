import { expect, test } from "@playwright/test";

test.describe("Provider Rolodex", () => {
  test("renders truthful provider lifecycle axes and supported actions", async ({ page }) => {
    const providerDomainRequests: string[] = [];
    const providerDomain = /deepgram\.com|elevenlabs\.io|fish\.audio|cartesia\.ai|reson8\.dev/i;
    page.on("request", (request) => {
      if (providerDomain.test(new URL(request.url()).hostname)) {
        providerDomainRequests.push(request.url());
      }
    });
    page.on("websocket", (socket) => {
      if (providerDomain.test(new URL(socket.url()).hostname)) providerDomainRequests.push(socket.url());
    });
    await page.goto("/providers");

    await expect(page.getByRole("heading", { name: "Explore voice providers" })).toBeVisible();
    const deepgram = page.locator('[data-provider-card="deepgram"]');
    const elevenLabs = page.locator('[data-provider-card="elevenlabs"]');
    const fishAudio = page.locator('[data-provider-card="fish-audio"]');

    for (const card of [deepgram, elevenLabs, fishAudio]) {
      await card.locator("summary").filter({ hasText: "Inspect readiness and technical evidence" }).click();
      await expect(card).toContainText("Discovery");
      await expect(card).toContainText("Integration");
      await expect(card).toContainText("Credential");
      await expect(card).toContainText("Runtime");
      await expect(card).toContainText("Health");
      await expect(card).toContainText("Benchmark");
    }
    await expect(deepgram.getByRole("link", { name: "Open supported module" })).toBeEnabled();
    await expect(elevenLabs.getByRole("link", { name: "Open supported module" })).toHaveAttribute("href", "/providers/elevenlabs/api-studio");
    await expect(fishAudio.getByRole("link", { name: "Open supported module" })).toHaveAttribute("href", "/providers/fish-audio/api-studio");
    const reson8 = page.locator('[data-provider-card="reson8"]');
    await reson8.locator("summary").filter({ hasText: "Inspect readiness and technical evidence" }).click();
    await expect(reson8).toContainText("Fixture Validated");
    await expect(reson8).toContainText("Disabled");
    await expect(reson8).toContainText("Ineligible");
    expect(providerDomainRequests).toEqual([]);
  });

  test("supports keyboard navigation and remains usable on mobile", async ({ page }) => {
    await page.goto("/providers");
    const action = page.locator('[data-provider-card="deepgram"]').getByRole("link", { name: "Open supported module" });
    await action.focus();
    await expect(action).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/module=tts/);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/providers");
    const width = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(width[0]).toBeLessThanOrEqual(width[1] + 1);
    await expect(page.locator('[data-provider-card="elevenlabs"]')).toBeVisible();
    await expect(page.locator('[data-provider-card="fish-audio"]')).toBeVisible();

    await page.goto("/providers/reson8");
    const detailWidth = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(detailWidth[0]).toBeLessThanOrEqual(detailWidth[1] + 1);
    await page.locator("summary").filter({ hasText: "Inspect capability evidence" }).click();
    await expect(page.getByRole("heading", { name: "Capabilities in ONE" })).toBeVisible();
    await page.locator("summary").filter({ hasText: "Inspect provider lifecycle status" }).click();
    await page.locator("summary").filter({ hasText: "Inspect the evidence boundary" }).click();
    await expect(page.getByText("Fixture Validated", { exact: true })).toBeVisible();
    await expect(page.getByText(/fixture-validated; live invocation remains disabled/i)).toBeVisible();
  });

  test("keeps guest personalization local and unable to enable providers", async ({ page }) => {
    await page.goto("/providers");
    await page.getByText("Personalize this Provider Hub").click();
    await page.getByLabel("Add to favorite providers").selectOption("deepgram");
    await page.getByLabel("Add to hidden providers").selectOption("reson8");
    await page.getByRole("button", { name: "Save on this device" }).click();
    await expect(page.locator('[data-provider-card="deepgram"]')).toContainText("Favorite");
    await expect(page.locator('[data-provider-card="reson8"]')).toHaveCount(0);
    await expect(page.locator("[data-provider-preferences]").getByRole("status")).toContainText(/Saved privately|Saved on this device/);

    await page.reload();
    await expect(page.locator('[data-provider-card="reson8"]')).toHaveCount(0);
    await expect(page.locator('[data-provider-card="deepgram"]')).toContainText("Favorite");
    await expect(page.locator('[data-provider-card="deepgram"]')).toContainText("Runtime");
  });

  test("does not render credentials and exposes retired routes as unavailable", async ({ page, request }) => {
    await page.goto("/providers");
    const html = await page.content();
    expect(html).not.toMatch(/Authorization:\s*(?!\*\*\*)|Bearer\s+[A-Za-z0-9._-]+/i);
    expect(html).not.toContain("configured-value-must-stay-private");
    expect(html).not.toMatch(/DEEPGRAM_API_KEY|ELEVENLABS_API_KEY|FISH_AUDIO_API_KEY|CARTESIA_API_KEY|RESON8_API_KEY/);

    const pageResponse = await request.get("/share-pack");
    const apiResponse = await request.get("/api/share-pack");
    expect([404, 410]).toContain(pageResponse.status());
    expect([404, 410]).toContain(apiResponse.status());
  });

  test("is discoverable from the home navigation", async ({ page }) => {
    await page.goto("/");
    const link = page.getByRole("link", { name: /Compare providers/ });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/providers$/);
  });
});
