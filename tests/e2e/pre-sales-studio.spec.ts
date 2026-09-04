import { expect, test } from "@playwright/test";

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.config.metadata.studio !== "pre-sales", "Pre-Sales coverage uses its dedicated 1440px studio config.");
});

test.describe("@pre-sales-studio guided workshop", () => {
  test.beforeEach(async ({ page }) => { await page.goto("/pre-sales-studio"); });

  test("completes pattern, discovery, architecture, challenge, POC, demo, and readout flow", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Turn customer requirements into a measurable technical win/i })).toBeVisible();
    await expect(page.getByText(/Unpublished requirements, architecture, dialogue, and calculations are simulated/i).first()).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(7);
    await page.getByRole("article").filter({ hasText: "SigmaMind AI Pattern" }).getByRole("button", { name: "Start Discovery" }).click();
    await expect(page.getByText("SigmaMind AI", { exact: true })).toBeVisible();
    await expect(page.getByText(/Discovery confidence/i).first()).toBeVisible();
    await page.getByLabel("Desired business outcome").fill("Reduce failed turns while protecting conversion.");
    await page.getByText("Voice workload", { exact: true }).first().click();
    await page.getByLabel("Peak concurrency").fill("Customer range still to validate");
    await page.getByRole("button", { name: /Review solution blueprint/i }).click();
    await expect(page.getByRole("heading", { name: /recommended starting architecture/i })).toBeVisible();
    await expect(page.getByRole("img", { name: /Proposed voice architecture/i })).toBeVisible();
    await page.getByRole("button", { name: "Challenge the Solution" }).click();
    const challenge = page.getByRole("article").filter({ hasText: "Audio cannot leave our private infrastructure." });
    await challenge.getByRole("button", { name: "Inject challenge" }).click();
    await expect(page.getByRole("heading", { name: "What changed and why" })).toBeVisible();
    await expect(page.getByText(/Add a private deployment boundary/i)).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("heading", { name: "Private deployment exploration" })).toBeVisible();
    await page.getByRole("button", { name: /Build the POC/i }).click();
    await expect(page.getByRole("heading", { name: "Measurable success criteria" })).toBeVisible();
    await page.getByRole("button", { name: "Adopt illustrative definition" }).first().click();
    await expect(page.getByText("customer adopted", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: /Open technical demo/i }).click();
    await expect(page.getByText("Illustrative Demo Data", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Run illustrative demonstration" }).click();
    await expect(page.getByText(/not Deepgram benchmarks/i)).toBeVisible();
    await page.getByRole("button", { name: /Generate readouts/i }).click();
    await expect(page.getByRole("button", { name: "Executive View" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(/Scenario estimates—not guaranteed outcomes/i)).toBeVisible();
    await page.getByRole("button", { name: "Engineering View" }).click();
    await expect(page.getByRole("button", { name: "Engineering View" })).toHaveAttribute("aria-pressed", "true");
  });

  test("persists only after opt-in and reset returns to the selected seed", async ({ page }) => {
    await page.getByRole("article").filter({ hasText: "Abby Connect Pattern" }).getByRole("button", { name: "Start Discovery" }).click();
    await page.getByLabel("Desired business outcome").fill("Locally persisted test outcome");
    await page.getByRole("radio", { name: "Prerecorded audio" }).click();
    await page.getByRole("button", { name: "Latency threshold" }).click();
    await page.getByRole("button", { name: "Save locally (off)" }).click();
    await page.reload();
    await page.getByRole("button", { name: "Resume locally saved workshop" }).click();
    await expect(page.getByLabel("Desired business outcome")).toHaveValue("Locally persisted test outcome");
    await expect(page.getByRole("radio", { name: "Prerecorded audio" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("button", { name: "Latency threshold" })).toHaveAttribute("aria-pressed", "true");
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Reset scenario" }).click();
    await expect(page.getByLabel("Desired business outcome")).not.toHaveValue("Locally persisted test outcome");
  });

  test("fast discovery supports tap and keyboard choices and recalculates the solution", async ({ page }) => {
    await page.getByRole("button", { name: "Build a Custom Opportunity" }).click();
    await expect(page.getByRole("button", { name: "Fast Discovery" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Seven decisions that shape the first recommendation")).toBeVisible();
    await page.getByRole("button", { name: "Task completion" }).first().click();
    await page.getByRole("radio", { name: "Live voice", exact: true }).focus();
    await page.keyboard.press("Space");
    await expect(page.getByRole("radio", { name: "Live voice", exact: true })).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("radio", { name: "Prerecorded audio" })).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("radio", { name: "Live voice", exact: true })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("radio", { name: "Human to AI agent" }).click();
    await page.getByRole("radio", { name: "Turn-critical conversation" }).click();
    await page.getByRole("radio", { name: "Customer VPC" }).click();
    await page.getByRole("button", { name: "Latency threshold" }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("complementary", { name: "Live discovery summary" })).toBeVisible();
    await expect(page.getByText(/Open questions/).last()).toBeVisible();
    const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
    await page.getByRole("button", { name: /Review solution blueprint/i }).click();
    await expect(page.getByRole("heading", { name: "Flux conversational speech recognition" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Private deployment exploration" })).toBeVisible();
    await expect(page.getByText("stt-flux", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Technical discovery/i }).click();
    await page.getByRole("radio", { name: "Prerecorded audio" }).click();
    await page.getByRole("button", { name: /Review solution blueprint/i }).click();
    await expect(page.getByRole("heading", { name: "Nova-3 prerecorded transcription" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Flux conversational speech recognition" })).toHaveCount(0);
  });

  test("deep discovery exposes complete one-tap stages, Other notes, and adaptive evidence", async ({ page }) => {
    await page.getByRole("button", { name: "Build a Custom Opportunity" }).click();
    await page.getByRole("button", { name: "Deep Discovery" }).click();
    await expect(page.getByText("Customer and outcome", { exact: true })).toBeVisible();
    await page.getByRole("radio", { name: "Other" }).first().click();
    await page.getByLabel("Industry notes").fill("Specialized emergency communications network");
    await expect(page.getByLabel("Industry notes")).toHaveValue("Specialized emergency communications network");
    await expect(page.getByRole("radio", { name: "Not sure yet" }).first()).toBeVisible();
  });

  test("supports guided session mode, guided actions, keyboard focus, and mobile layout", async ({ page }) => {
    await page.getByRole("article").filter({ hasText: "Five9 Pattern" }).getByRole("button", { name: "Start Discovery" }).click();
    await page.getByRole("button", { name: /Guided Mode Off/i }).click();
    await expect(page.getByText("Current customer goal", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /7-minute guided flow Off/i }).click();
    await expect(page.getByText(/7-minute guided flow · 1\/7/i)).toBeVisible();
    await page.keyboard.press("Tab");
    const focusVisible = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusVisible).toMatch(/A|BUTTON|INPUT|SELECT|TEXTAREA/);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("button", { name: "Challenge the Solution" })).toBeVisible();
    const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
  });
});
