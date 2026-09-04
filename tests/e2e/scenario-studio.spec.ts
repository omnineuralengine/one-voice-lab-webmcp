import { expect, test, type Page, type Route } from "@playwright/test";

import {
  SCENARIO_RUN_REQUEST_SCHEMA_VERSION,
  USER_SCENARIO_ID,
  USER_SCENARIO_VERSION,
  scenarioRunResponseSchema,
} from "@/lib/scenarios/contracts";

let scenarioResponseBody = "";

type TrafficState = {
  count: number;
  providerRequests: number;
  webSockets: string[];
};

test.beforeAll(async ({ request }, testInfo) => {
  const baseURL = String(testInfo.project.use.baseURL);
  const response = await request.post(new URL("/api/scenarios/run", baseURL).toString(), {
    headers: {
      Accept: "application/json",
      Origin: baseURL,
      "Sec-Fetch-Site": "same-origin",
    },
    data: {
      schemaVersion: SCENARIO_RUN_REQUEST_SCHEMA_VERSION,
      scenarioId: USER_SCENARIO_ID,
      scenarioVersion: USER_SCENARIO_VERSION,
      executionMode: "synthetic_fixture",
      reviewGoal: "inspect-evidence",
      correlationToken: "scenario_e2e_preflight_token_01",
    },
  });
  expect(response.status()).toBe(200);
  scenarioResponseBody = await response.text();
  const parsed = scenarioRunResponseSchema.parse(JSON.parse(scenarioResponseBody));
  expect(parsed.receipt.execution.providerCalls).toBe(0);
  expect(parsed.receipt.execution.providerCredits).toBe(0);
});

test.describe("Scenario Studio", () => {
  test("runs the one guest fixture and explains its ephemeral receipt without provider traffic", async ({ page }) => {
    const externalRequests = await blockAndObserveExternalRequests(page);
    await page.route("**/api/scenarios/run", fulfillSyntheticScenario);
    await page.goto("/scenario-studio");

    await expect(page.getByRole("heading", { name: "Understand interruption recovery" })).toBeVisible();
    await expect(page.getByText("Guest · this receipt stays in this tab", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Scenario run boundaries" })).toContainText("Synthetic fixture");
    await expect(page.getByRole("region", { name: "Scenario run boundaries" })).toContainText("Ephemeral · no store");
    await expect(page.getByRole("region", { name: "Scenario run boundaries" })).toContainText("Provider calls0");
    await expect(page.getByRole("region", { name: "Scenario run boundaries" })).toContainText("Provider credits0");

    const reviewFocus = page.getByRole("group", { name: "Review focus" });
    await expect(reviewFocus.getByRole("radio")).toHaveCount(3);
    await reviewFocus.getByRole("radio", { name: /Inspect the evidence/ }).check();
    await expect(page.getByText("Your receipt will appear here", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Run the interruption scenario" }).click();
    await expect(page.getByRole("heading", { name: "Run completed" })).toBeVisible();
    await expect(page.getByText("Human review still required", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Run complete\. The action finished/)).toBeVisible();

    const explanation = page.locator("details.one-explain-this").filter({
      has: page.getByText("Explain this run", { exact: true }),
    });
    await expect(explanation).toHaveJSProperty("open", false);
    await explanation.locator(":scope > summary").click();
    await expect(explanation.getByText("What happened", { exact: true }).first()).toBeVisible();
    await expect(explanation.getByText("What remains uncertain", { exact: true }).first()).toBeVisible();
    await expect(explanation.getByText(/pure, versioned rule projection/)).toBeVisible();

    const technical = page.locator('details[data-adaptive-minimum="technical"]').filter({
      has: page.getByText("Inspect the sanitized receipt", { exact: true }),
    });
    await technical.locator(":scope > summary").click();
    await expect(technical.getByText("publicEvaluation.runSynthetic", { exact: true })).toBeVisible();
    await expect(technical.getByText("synthetic_fixture", { exact: true })).toBeVisible();
    await expect(page.getByText(/correlationToken/i)).toHaveCount(0);

    await page.reload();
    await expect(page.getByText("Your receipt will appear here", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Run completed" })).toHaveCount(0);
    expectNoExternalTraffic(externalRequests);
  });

  test("enforces a single in-flight run without simulating progress", async ({ page }) => {
    const externalRequests = await blockAndObserveExternalRequests(page);
    let scenarioRequests = 0;
    await page.route("**/api/scenarios/run", async (route) => {
      scenarioRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 250));
      await fulfillSyntheticScenario(route);
    });
    await page.goto("/scenario-studio");
    await page.getByRole("radio", { name: /Understand the recovery/ }).check();

    const run = page.getByRole("button", { name: "Run the interruption scenario" });
    await run.click();
    await expect(page.getByRole("button", { name: "Running the bounded fixture…" })).toBeDisabled();
    await expect(page.getByText("ONE does not fabricate a progress estimate.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Running the bounded fixture…" }).evaluate((button: HTMLButtonElement) => button.click());
    await expect(page.getByRole("heading", { name: "Run completed" })).toBeVisible();
    expect(scenarioRequests).toBe(1);
    expectNoExternalTraffic(externalRequests);
  });

  test("keeps the guided journey usable without horizontal overflow on narrow screens", async ({ page }) => {
    const externalRequests = await blockAndObserveExternalRequests(page);
    for (const viewport of [
      { width: 320, height: 700 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/scenario-studio");

      const run = page.getByRole("button", { name: "Run the interruption scenario" });
      await expect(run).toBeVisible();
      const box = await run.boundingBox();
      expect(box?.height, `${viewport.width}px run target`).toBeGreaterThanOrEqual(44);
      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scrollWidth, `${viewport.width}px horizontal overflow`).toBeLessThanOrEqual(dimensions.clientWidth + 1);
    }
    expectNoExternalTraffic(externalRequests);
  });

  test("offers Scenario Studio near the start of Evaluate", async ({ page }) => {
    const traffic = await blockAndObserveExternalRequests(page);
    await page.goto("/evaluate");
    const entry = page.getByRole("complementary", { name: "Start with a real-world interruption scenario" });
    await expect(entry).toBeVisible();
    await expect(entry.getByRole("link", { name: "Open Scenario Studio" })).toHaveAttribute("href", "/scenario-studio");
    expectNoExternalTraffic(traffic);
  });

  test("focuses a bounded validation error and recovers through the keyboard", async ({ page }) => {
    const externalRequests = await blockAndObserveExternalRequests(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/api/scenarios/run", fulfillSyntheticScenario);
    await page.goto("/scenario-studio");

    const run = page.getByRole("button", { name: "Run the interruption scenario" });
    await run.focus();
    await page.keyboard.press("Enter");
    const validationError = page.getByRole("alert").filter({ hasText: "Choose what you want to understand" });
    await expect(validationError).toBeFocused();

    const firstGoal = page.getByRole("radio", { name: /Understand the recovery/ });
    await firstGoal.focus();
    await page.keyboard.press("Space");
    await expect(firstGoal).toBeChecked();
    await expect(validationError).toHaveCount(0);
    await run.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Run completed" })).toBeVisible();
    const transitionSeconds = Number.parseFloat(await run.evaluate((element) => getComputedStyle(element).transitionDuration));
    expect(transitionSeconds).toBeLessThanOrEqual(0.001);
    expectNoExternalTraffic(externalRequests);
  });

  test("changes presentation depth without changing or rerunning the receipt", async ({ page }) => {
    const externalRequests = await blockAndObserveExternalRequests(page);
    let scenarioRequests = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/scenarios/run") scenarioRequests += 1;
    });
    await page.route("**/api/scenarios/run", fulfillSyntheticScenario);
    await page.goto("/scenario-studio");
    await page.getByRole("radio", { name: /Inspect the evidence/ }).check();
    await page.getByRole("button", { name: "Run the interruption scenario" }).click();
    await expect(page.getByRole("heading", { name: "Run completed" })).toBeVisible();

    const evidenceCount = await page.locator(".scenario-evidence li").count();
    const depth = page.getByRole("group", { name: "Scenario detail" });
    await depth.getByRole("radio", { name: /^Technical/ }).check();
    const digest = await page.locator(".scenario-technical-details dd").last().innerText();
    await depth.getByRole("radio", { name: /^Essential/ }).check();
    await expect(page.getByRole("heading", { name: "Run completed" })).toBeVisible();
    await depth.getByRole("radio", { name: /^Technical/ }).check();
    await expect(page.locator(".scenario-technical-details dd").last()).toHaveText(digest);
    await expect(page.locator(".scenario-evidence li")).toHaveCount(evidenceCount);
    expect(scenarioRequests).toBe(1);
    expectNoExternalTraffic(externalRequests);
  });

  test("does not queue, replay, or retain a receipt after an offline run failure", async ({ page, context }) => {
    const externalRequests = await blockAndObserveExternalRequests(page);
    let completedScenarioRequests = 0;
    page.on("response", (response) => {
      if (new URL(response.url()).pathname === "/api/scenarios/run" && response.ok()) completedScenarioRequests += 1;
    });
    let firstRun = true;
    await page.route("**/api/scenarios/run", async (route) => {
      if (firstRun) {
        firstRun = false;
        await fulfillSyntheticScenario(route);
        return;
      }
      await route.continue();
    });
    await page.goto("/scenario-studio");
    await page.getByRole("radio", { name: /Plan the next check/ }).check();
    const run = page.getByRole("button", { name: "Run the interruption scenario" });
    await run.click();
    await expect(page.getByRole("heading", { name: "Run completed" })).toBeVisible();
    expect(completedScenarioRequests).toBe(1);

    await context.setOffline(true);
    await run.click();
    await expect(page.getByRole("alert").filter({ hasText: "The scenario did not complete" })).toBeFocused();
    await expect(page.getByRole("heading", { name: "Run completed" })).toHaveCount(0);
    await context.setOffline(false);
    await page.waitForTimeout(500);
    expect(completedScenarioRequests).toBe(1);
    await expect(page.getByRole("heading", { name: "Run completed" })).toHaveCount(0);
    expectNoExternalTraffic(externalRequests);
  });

  test("discards the ephemeral receipt when browser history returns to the Studio", async ({ page }) => {
    const traffic = await blockAndObserveExternalRequests(page);
    await page.route("**/api/scenarios/run", fulfillSyntheticScenario);
    await page.goto("/scenario-studio");
    await page.getByRole("radio", { name: /Inspect the evidence/ }).check();
    await page.getByRole("button", { name: "Run the interruption scenario" }).click();
    await expect(page.getByRole("heading", { name: "Run completed" })).toBeVisible();

    await page.goto("/evaluate");
    await page.goBack();
    await expect(page).toHaveURL(/\/scenario-studio$/);
    await expect(page.getByText("Your receipt will appear here", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Run completed" })).toHaveCount(0);
    expectNoExternalTraffic(traffic);
  });
});

async function blockAndObserveExternalRequests(page: Page) {
  const state: TrafficState = { count: 0, providerRequests: 0, webSockets: [] };
  const providerDomain = /(?:api\.deepgram\.com|api\.elevenlabs\.io|api\.fish\.audio|api\.cartesia\.ai|api\.reson8\.dev)$/i;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (isExternalHttpUrl(request.url())) state.count += 1;
    if (providerDomain.test(url.hostname)) state.providerRequests += 1;
  });
  page.on("websocket", (socket) => {
    const url = new URL(socket.url());
    if (!isLoopbackHost(url.hostname)) state.webSockets.push(socket.url());
    if (providerDomain.test(url.hostname)) state.providerRequests += 1;
  });
  await page.route(/^https?:\/\//, (route) => (
    isExternalHttpUrl(route.request().url())
      ? route.abort("blockedbyclient")
      : route.continue()
  ));
  return state;
}

function expectNoExternalTraffic(state: TrafficState) {
  expect(state.count).toBe(0);
  expect(state.providerRequests).toBe(0);
  expect(state.webSockets).toEqual([]);
}

function isExternalHttpUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return !isLoopbackHost(url.hostname);
}

function isLoopbackHost(hostname: string) {
  return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname);
}

async function fulfillSyntheticScenario(route: Route) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "Cache-Control": "private, no-store, max-age=0" },
    body: scenarioResponseBody,
  });
}
