import { expect, test } from "@playwright/test";

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.config.metadata.pocket !== true, "Pocket API coverage uses its dedicated mobile/desktop matrix.");
});

test("Pocket API Lab renders as a compact desktop field assistant", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("laptop"), "The laptop project owns the compact Pocket API surface.");
  await page.goto("/");
  await page.getByRole("button", { name: "Pocket", exact: true }).click();
  await page.getByRole("button", { name: "API Field" }).click();
  const widget = page.getByTestId("pocket-api-lab");
  await expect(widget).toBeVisible();
  await expect(page.locator(".pocket-panel")).toHaveAttribute("data-pocket-layout", "desktop-panel");
  await expect(widget.getByLabel("Quick Call Mode")).toBeVisible();
  await expect(widget.getByRole("button", { name: /What do I use for live transcription/ })).toBeVisible();
  for (const label of ["1 · Customer use case", "2 · Recommended API family", "3 · Minimal architecture", "4 · Request example", "5 · Expected response", "6 · Likely implementation risks"]) {
    await expect(widget.getByText(label, { exact: true })).toBeVisible();
  }
  const dimensions = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
});

test("preset selection updates API guidance and copyable code without persisting content", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("laptop"), "One laptop project covers interactive preset and persistence behavior.");
  await page.goto("/");
  await page.getByRole("button", { name: "Pocket", exact: true }).click();
  await page.getByRole("button", { name: "API Field" }).click();
  const widget = page.getByTestId("pocket-api-lab");
  await widget.getByLabel("Customer use case").selectOption("synthesize-response-audio");
  await expect(widget.getByText("Text to Speech · Speak: Single Text Request")).toBeVisible();
  await widget.getByRole("tab", { name: "JavaScript" }).click();
  await expect(widget.locator("pre")).toContainText("/v1/speak");
  await widget.getByRole("button", { name: "Pin snippet" }).click();
  const stored = await page.evaluate(() => window.localStorage.getItem("deepgram-pocket:api-field:v1"));
  expect(stored).toContain('"endpointId":"tts-rest"');
  expect(stored).toContain('"language":"javascript"');
  expect(stored).not.toMatch(/Illustrative field-assistant|DEEPGRAM_API_KEY|transcript|Authorization/);
});

test("registry search, operation safety, and route handoffs use verified IDs", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("wide"), "One wide project covers expanded search and handoffs.");
  await page.goto("/");
  await page.getByRole("button", { name: "Pocket", exact: true }).click();
  await page.getByRole("button", { name: "API Field" }).click();
  const widget = page.getByTestId("pocket-api-lab");
  await widget.getByRole("checkbox", { name: "Quick Call" }).uncheck();
  await widget.getByLabel("Search endpoints and parameters").fill("eot_timeout_ms");
  await expect(widget.getByRole("button", { name: /Flux Turn-Based Transcription/ })).toBeVisible();
  await widget.getByRole("button", { name: /Flux Turn-Based Transcription/ }).click();
  await expect(widget.getByText("billable", { exact: true }).first()).toBeVisible();
  await expect(widget.getByRole("link", { name: "Open in API Lab" })).toHaveAttribute("href", /operation=stt-flux/);
  await expect(widget.getByRole("link", { name: "Open in Code Lab" })).toHaveAttribute("href", /workflow=live-mic/);
  await expect(widget.getByRole("link", { name: "Open in Architecture Studio" })).toHaveAttribute("href", /operation=stt-flux/);

  await widget.getByRole("link", { name: "Open in API Lab" }).click();
  await expect(page).toHaveURL(/module=api-studio.*operation=stt-flux/);
  await page.getByRole("button", { name: "Collapse Pocket Deepgram" }).click();
  await expect(page.getByTestId("api-studio-executable").getByRole("heading", { name: "Flux Turn-Based Transcription" })).toBeVisible();
});

test("live execution surfaces unauthorized and rate-limited states without exposing secrets", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("laptop"), "One laptop project covers live-state handling.");
  await page.goto("/");
  await page.getByRole("button", { name: "Pocket", exact: true }).click();
  await page.getByRole("button", { name: "API Field" }).click();
  const widget = page.getByTestId("pocket-api-lab");
  await page.route("**/api/deepgram/execute", (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ ok: false, error: { message: "Deepgram API key is not configured." } }) }));
  await widget.getByRole("button", { name: "Run live billable request" }).click();
  await expect(widget.getByRole("alertdialog", { name: "Confirm live API request" })).toBeVisible();
  await widget.getByRole("button", { name: "Confirm and run" }).click();
  await expect(widget.getByRole("status")).toContainText("Unauthorized or unavailable");
  await expect(widget.getByRole("status")).toContainText("not configured");

  await widget.getByLabel("Customer use case").selectOption("inspect-public-models");
  await page.unroute("**/api/deepgram/execute");
  await page.route("**/api/deepgram/execute", (route) => route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ ok: false, error: { message: "Fixture capacity boundary" } }) }));
  await widget.getByRole("button", { name: "Run live read-only request" }).click();
  await expect(widget.getByRole("status")).toContainText("Rate limited");
  await expect(widget.getByRole("status")).toContainText("Fixture capacity boundary");
  await expect(page.locator("body")).not.toContainText(/fixture-secret|Token [A-Za-z0-9]{20,}/);
  await expect(page.locator("body")).not.toContainText("pocket-e2e-server-key-never-client");
});

test("Pocket Voice Agent remains hosted-disabled without ready or run copy", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("laptop"), "One laptop project covers the hosted Voice Agent boundary.");
  await page.goto("/");
  await page.getByRole("button", { name: "Pocket", exact: true }).click();
  await page.getByRole("button", { name: "API Field" }).click();
  const widget = page.getByTestId("pocket-api-lab");
  await widget.getByLabel("Customer use case").selectOption("build-managed-voice-agent");
  await expect(widget.getByText("Hosted execution unavailable", { exact: true })).toBeVisible();
  await expect(widget).toContainText("Hosted temporary-token issuance is disabled.");
  await expect(widget).not.toContainText("Shared live project ready");
  await expect(widget.getByRole("button", { name: /Run live/ })).toHaveCount(0);
});
