import { expect, test, type Page } from "@playwright/test";

const PROVIDER_DOMAIN = /(?:api\.)?(?:deepgram\.com|elevenlabs\.io|fish\.audio|cartesia\.ai|reson8\.dev)/i;

test.describe("Stage 3 deterministic benchmark preview", () => {
  test("filters tied fixture evidence and explains the ranking on desktop", async ({ page }) => {
    const providerCalls = await blockProviderTraffic(page);
    const evaluationRuns = trackEvaluationRuns(page);
    await page.goto("/evaluate");
    await page.locator('details[data-adaptive-minimum="detailed"] > summary').filter({
      hasText: "Open benchmark planning and leaderboard evidence",
    }).click();

    const workspace = page.getByRole("region", { name: "Verifiable results, without a composite winner" });
    await expect(workspace.getByText("Fixture-only", { exact: true })).toBeVisible();
    await expect(workspace.getByText("Nonbillable", { exact: true })).toBeVisible();
    await expect(workspace.getByText("Synthetic evidence", { exact: true })).toBeVisible();
    await expect(workspace.getByText("Non-public preview", { exact: true })).toBeVisible();

    const setup = workspace.getByRole("region", { name: "Validate one canonical fixture observation" });
    await expect(setup.getByRole("combobox", { name: "Category" })).toHaveValue("tts");
    await expect(setup.getByRole("combobox", { name: "Category" }).locator('option[value="stt"]')).toHaveAttribute("disabled", "");
    await expect(setup.getByRole("combobox", { name: "Suite" })).toHaveValue("one-evaluate-private-suite");
    await expect(setup.getByRole("combobox", { name: "Methodology" })).toHaveValue("one-tts-identical-script");
    await expect(setup.getByRole("combobox", { name: "Run mode" })).toHaveValue("fixture");
    await expect(setup.getByRole("combobox", { name: "Run mode" }).locator('option[value="protected-live"]')).toHaveAttribute("disabled", "");
    await expect(setup.getByRole("combobox", { name: "Configuration" })).toHaveValue("fixture-standardized");
    await expect(setup.getByRole("combobox", { name: "Visibility" })).toHaveValue("private");
    await expect(setup.getByText("Nonbillable · zero provider calls", { exact: true })).toBeVisible();
    await expect(setup.getByText(/Comparable fixture: ready/)).toHaveCount(4);
    await expect(setup.getByText(/Synthetic fixture evidence validates the workflow only/)).toBeVisible();

    const materialize = setup.getByRole("button", { name: "Validate and materialize fixture" });
    await expect(materialize).toHaveAttribute("data-voice-action", "benchmark.runFixture");
    await materialize.focus();
    await page.keyboard.press("Enter");
    await expect(setup.getByRole("status")).toContainText("Fixture benchmark completed with 4 comparable lanes");
    const result = setup.getByRole("region", { name: "Private fixture evidence materialized" });
    await expect(result.getByText("Completed", { exact: true })).toBeVisible();
    await expect(result.getByText("one-benchmark/1.0.0", { exact: true })).toBeVisible();
    await expect(result.getByText("Not eligible", { exact: true })).toHaveCount(2);
    await expect(result.getByText("Private", { exact: true })).toBeVisible();
    await expect(result.getByText("Ephemeral", { exact: true })).toBeVisible();
    await expect(result.getByText("Unavailable · no verified versioned pricing evidence", { exact: true })).toBeVisible();
    await expect(result.getByText("None recorded · separate evidence class", { exact: true })).toBeVisible();
    await expect(result.getByText("None produced · reserved evidence boundary", { exact: true })).toBeVisible();
    await expect(result.getByText("fixture · local-deterministic-fixture", { exact: true })).toBeVisible();
    await expect(result.getByText("None · all selected fixture lanes completed", { exact: true })).toBeVisible();
    await expect(result.getByText("No digest attached · private unsigned result", { exact: true })).toBeVisible();
    await expect(result.getByText("one-canonical-json/1.0.0", { exact: true })).toBeVisible();
    await expect(result.getByText("No signature attached", { exact: true })).toBeVisible();
    await expect(result.getByText("2026-08-27 00:00:00.004Z", { exact: true })).toHaveCount(2);

    await result.getByText("Inspect objective measurement evidence", { exact: true }).click();
    const measurements = result.getByRole("list", { name: "Canonical objective measurements" }).locator(":scope > li");
    await expect(measurements).toHaveCount(32);
    await expect(measurements.getByText("n=1", { exact: true })).toHaveCount(32);
    await expect(measurements.getByText("Fixture", { exact: true })).toHaveCount(32);
    const costs = measurements.filter({ hasText: "estimated-cost" });
    await expect(costs).toHaveCount(4);
    await expect(costs.getByText("Unavailable · unit unavailable", { exact: true })).toHaveCount(4);
    await expect(costs.getByText("Derived", { exact: true })).toHaveCount(4);
    await expect(costs.getByText("Not applicable", { exact: true })).toHaveCount(4);

    await result.getByText("Inspect exact lanes and exclusions", { exact: true }).click();
    await expect(result.getByText(/Fixture observations validate product behavior only/i)).toBeVisible();
    await expect(result.getByText(/Adapter backed/)).toHaveCount(4);
    await expect(result.getByText(/Live enabled/)).toHaveCount(0);
    expect(evaluationRuns()).toBe(0);

    const cards = workspace.locator(".benchmark-card");
    const initialCount = await cards.count();
    expect(initialCount).toBeGreaterThanOrEqual(2);
    await expect(cards.getByText("Tie · #1", { exact: true })).toHaveCount(initialCount);
    await expect(cards.getByText("Not eligible", { exact: true })).toHaveCount(initialCount);

    await workspace.getByRole("button", { name: "Rebuild fixture snapshot" }).click();
    await expect(workspace.locator(".benchmark-workspace__action-status")).toContainText("Zero provider calls were made");
    await expect(cards).toHaveCount(initialCount);

    const providerFilter = workspace.getByRole("combobox", { name: "Provider" });
    const providerValue = await providerFilter.locator("option").nth(1).getAttribute("value");
    expect(providerValue).toBeTruthy();
    await providerFilter.selectOption(providerValue!);
    await expect(cards).toHaveCount(1);

    const explanation = cards.first().getByText("Why ranked here?", { exact: true });
    await explanation.click();
    await expect(cards.first().getByText(/Methodology:/)).toBeVisible();
    await expect(cards.first().getByText(/Sample count:/)).toBeVisible();
    await expect(cards.first().getByText(/Comparable input:/)).toBeVisible();
    await expect(cards.first().getByText(/Measurement provenance:/)).toBeVisible();
    await expect(cards.first().getByText(/Runtime:/)).toBeVisible();
    await expect(cards.first().getByText(/Integrity:/)).toBeVisible();
    await expect(cards.first().getByText(/Visibility, publication, and signature:/)).toBeVisible();
    await expect(cards.first().getByText(/No composite score is produced/)).toBeVisible();

    const filters = workspace.getByRole("region", { name: "Filter this fixture snapshot" });
    await expect(filters.getByRole("combobox", { name: "Category" })).toBeVisible();
    await expect(filters.getByRole("combobox", { name: "Modality" })).toBeVisible();
    await expect(filters.getByRole("combobox", { name: "Model" })).toBeVisible();
    await expect(filters.getByRole("combobox", { name: "Language or locale" })).toBeVisible();
    await expect(filters.getByRole("combobox", { name: "Region" })).toBeVisible();
    await expect(filters.getByRole("combobox", { name: "Methodology" })).toBeVisible();
    await expect(filters.getByRole("combobox", { name: "Evidence class" })).toBeVisible();
    await expect(filters.getByRole("combobox", { name: "Deployment" })).toBeVisible();
    await expect(filters.getByRole("combobox", { name: "Time window" })).toBeVisible();
    await expect(filters.getByRole("combobox", { name: "Scoring profile" })).toBeVisible();
    await expect(filters.getByRole("combobox", { name: "Freshness" })).toBeVisible();

    const methodology = workspace.getByRole("link", { name: "Open methodology" });
    await expect(methodology).toHaveAttribute("href", "/methodology");
    await methodology.click();
    await expect(page).toHaveURL(/\/methodology$/);
    expect(providerCalls()).toBe(0);
  });

  test("stacks readable cards at 390px without changing the mobile dock", async ({ page }) => {
    const providerCalls = await blockProviderTraffic(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/evaluate#benchmark-preview");

    const workspace = page.locator(".benchmark-workspace");
    const cards = workspace.locator(".benchmark-card");
    await expect(cards.first()).toBeVisible();
    const [first, second] = await cards.evaluateAll((elements) => elements.slice(0, 2).map((element) => {
      const bounds = element.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    }));
    expect(second.y).toBeGreaterThan(first.y + first.height - 1);
    expect(second.x).toBe(first.x);

    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);

    const filterTargets = await workspace.locator("select").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
    expect(filterTargets.every((height) => height >= 44)).toBe(true);

    const setup = workspace.getByRole("region", { name: "Validate one canonical fixture observation" });
    await setup.getByRole("button", { name: "Validate and materialize fixture" }).click();
    await expect(setup.getByRole("status")).toContainText("Fixture benchmark completed with 4 comparable lanes");
    const result = setup.getByRole("region", { name: "Private fixture evidence materialized" });
    const measurementSummary = result.getByText("Inspect objective measurement evidence", { exact: true });
    const measurementSummaryBox = await measurementSummary.boundingBox();
    expect(measurementSummaryBox?.height).toBeGreaterThanOrEqual(44);
    await measurementSummary.focus();
    await page.keyboard.press("Enter");
    await expect(result.locator(".benchmark-result-measurement").first()).toBeVisible();
    const mobileDimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(mobileDimensions.scrollWidth).toBeLessThanOrEqual(mobileDimensions.clientWidth + 1);

    const summary = cards.first().getByText("Why ranked here?", { exact: true });
    const summaryBox = await summary.boundingBox();
    expect(summaryBox?.height).toBeGreaterThanOrEqual(44);
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(cards.first().locator(".benchmark-card__hash")).toBeVisible();

    await expect(page.locator(".voice-open-nav__links a:visible")).toHaveCount(5);
    await expect(page.locator(".voice-open-nav__links").getByRole("link", { name: "Evaluate" })).toHaveAttribute("aria-current", "page");
    expect(providerCalls()).toBe(0);
  });
});

async function blockProviderTraffic(page: Page) {
  let calls = 0;
  await page.route(PROVIDER_DOMAIN, (route) => {
    calls += 1;
    return route.abort("blockedbyclient");
  });
  return () => calls;
}

function trackEvaluationRuns(page: Page) {
  let calls = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/evaluate/run") calls += 1;
  });
  return () => calls;
}
