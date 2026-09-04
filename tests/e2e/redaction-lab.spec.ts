import { expect, test } from "@playwright/test";

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-1440x900", "Redaction interaction coverage runs once at the scripted viewport.");
});

test.describe("Redaction Lab", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?module=redaction-lab");
    await expect(page.getByTestId("redaction-lab")).toBeVisible();
  });

  test("teaches transcript scope and keeps fixture work offline", async ({ page }) => {
    let deepgramRouteCalls = 0;
    page.on("request", (request) => {
      if (request.url().includes("/api/deepgram/") && request.method() !== "GET") deepgramRouteCalls += 1;
    });

    await expect(page.getByText("Redacted transcript does not mean redacted audio.")).toBeVisible();
    await expect(page.getByText(/The original audio remains unchanged/).first()).toBeVisible();
    await page.getByRole("button", { name: "Financial Contact Center" }).click();
    await expect(page.getByText("redact=pii&redact=pci").first()).toBeVisible();
    await page.getByRole("button", { name: "Play fixture timeline" }).click();
    await expect(page.getByText("Generic placeholder emitted")).toBeVisible({ timeout: 3_000 });
    expect(deepgramRouteCalls).toBe(0);
  });

  test("shows inherited coverage and deterministic typed placeholders", async ({ page }) => {
    await page.getByRole("button", { name: "Healthcare Contact Center" }).click();
    await expect(page.getByText(/Inherited entities/)).toBeVisible();
    await page.getByRole("tab", { name: "findings" }).click();
    await expect(page.getByLabel(/Redacted placeholder \[NAME_1\]/)).toBeVisible();
    await expect(page.getByText("Selected by pii").first()).toBeVisible();
  });

  test("applies policy to Upload Audio without uploading or running", async ({ page }) => {
    let postCalls = 0;
    page.on("request", (request) => {
      if (request.method() === "POST") postCalls += 1;
    });
    await page.getByRole("button", { name: "Healthcare Contact Center" }).click();
    await page.getByRole("button", { name: "Use in Upload Audio" }).click();
    await expect(page.getByRole("heading", { name: "Upload Audio", level: 1 })).toBeVisible();
    await expect(page.getByTestId("redaction-query-preview")).toContainText("redact=pii&redact=phi");
    await expect(page.getByText(/No request was run/)).toBeVisible();
    expect(postCalls).toBe(0);
  });

  test("applies repeated values to API Studio and leaves Run intentional", async ({ page }) => {
    await page.getByRole("button", { name: "Financial Contact Center" }).click();
    await page.getByRole("button", { name: "Open in API Studio" }).click();
    await expect(page.getByTestId("api-studio-executable")).toBeVisible();
    await expect(page.getByText(/redact=pii&redact=pci/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Run Request/ })).toBeVisible();
  });

  test("resets policy and exposes an accessible empty/off state", async ({ page }) => {
    await page.getByRole("button", { name: "General PII" }).click();
    await page.getByTestId("redaction-lab").getByRole("button", { name: /^Off\b/ }).click();
    await expect(page.getByTestId("redaction-off-state")).toBeVisible();
    await expect(page.getByRole("list", { name: "Deepgram redaction entities" })).toBeVisible();
  });
});
