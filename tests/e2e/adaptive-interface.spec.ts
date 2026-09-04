import { expect, test, type Page } from "@playwright/test";

const PROVIDER_DOMAIN = /(?:api\.deepgram\.com|api\.elevenlabs\.io|api\.fish\.audio|api\.cartesia\.ai|api\.reson8\.dev)/i;

test.describe("ONE adaptive human interface", () => {
  test("defaults to Guided and persists a keyboard-selected guest depth without changing authority", async ({ page }) => {
    const providerRequests = observeProviderRequests(page);
    await page.goto("/");

    const depthControl = page.getByRole("group", { name: "Choose how much detail ONE shows" });
    const guided = depthControl.getByRole("radio", { name: /^Guided/ });
    const detailed = depthControl.getByRole("radio", { name: /^Detailed/ });
    const technical = depthControl.getByRole("radio", { name: /^Technical/ });

    await expect(guided).toBeChecked();
    await expect(page.locator("html")).toHaveAttribute("data-one-interface-depth", "guided");
    await expect(page.getByRole("link", { name: /Guest Local-first mode/ })).toBeVisible();
    await expect(page.getByText("API Lab", { exact: true })).toBeHidden();

    await guided.focus();
    await page.keyboard.press("ArrowRight");
    await expect(detailed).toBeChecked();
    await page.keyboard.press("ArrowRight");
    await expect(technical).toBeChecked();
    await expect(page.locator("html")).toHaveAttribute("data-one-interface-depth", "technical");
    await expect(page.getByText("API Lab", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Guest Local-first mode/ })).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("one:guest:interface-depth:v1"))).toBe(
      '{"schemaVersion":"one-interface-depth/1.0.0","depth":"technical"}',
    );

    await page.reload();
    await expect(depthControl.getByRole("radio", { name: /^Technical/ })).toBeChecked();
    await expect(page.getByText("API Lab", { exact: true })).toBeVisible();
    expect(providerRequests.count).toBe(0);
  });

  test("keeps provider and evaluation depth available through local disclosure", async ({ page }) => {
    const providerRequests = observeProviderRequests(page);
    await page.goto("/providers");

    await expect(page.getByRole("heading", { name: "Explore voice providers" })).toBeVisible();
    const providerCard = page.locator("[data-provider-card]").first();
    await expect(providerCard.getByRole("list", { name: /capability families/ })).toBeVisible();
    const readiness = providerCard.locator('details[data-adaptive-minimum="detailed"]').first();
    await expect(readiness).toHaveJSProperty("open", false);
    await readiness.locator(":scope > summary").click();
    await expect(readiness.getByText("Discovery", { exact: true })).toBeVisible();

    await page.goto("/evaluate");
    await expect(page.getByRole("radio", { name: /^Guided/ })).toBeChecked();
    const benchmarkDisclosure = page.locator('details[data-adaptive-minimum="detailed"]').filter({
      has: page.getByText("Open benchmark planning and leaderboard evidence", { exact: true }),
    });
    await expect(benchmarkDisclosure).toHaveJSProperty("open", false);
    await benchmarkDisclosure.locator(":scope > summary").click();
    await expect(page.locator(".benchmark-workspace")).toBeVisible();
    expect(providerRequests.count).toBe(0);
  });

  test("moves keyboard focus through the skip link to the main content", async ({ page }) => {
    await page.goto("/");
    const skipLink = page.getByRole("link", { name: "Skip to main content" });

    await page.keyboard.press("Tab");
    await expect(skipLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#one-main-content")).toBeFocused();
  });

  test("keeps the five-capability navigation usable without horizontal overflow on small screens", async ({ page }) => {
    for (const viewport of [
      { width: 320, height: 700 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/");

      const navigation = page.locator(".voice-open-nav__links");
      await expect(navigation.getByRole("link")).toHaveCount(5);
      for (const name of ["Explore", "Compare", "Evaluate", "Build", "Learn"]) {
        const link = navigation.getByRole("link", { name, exact: true });
        await expect(link).toBeVisible();
        const box = await link.boundingBox();
        expect(box?.height, `${viewport.width}px ${name} touch target`).toBeGreaterThanOrEqual(44);
      }
      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scrollWidth, `${viewport.width}px horizontal overflow`).toBeLessThanOrEqual(dimensions.clientWidth + 1);
    }
  });
});

function observeProviderRequests(page: Page) {
  const state = { count: 0 };
  page.on("request", (request) => {
    if (PROVIDER_DOMAIN.test(request.url())) state.count += 1;
  });
  return state;
}
