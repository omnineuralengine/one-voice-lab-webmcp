import { expect, test } from "@playwright/test";

test("runs the migrated synthetic evaluation through the mounted action handler", async ({ page }) => {
  let actionRequests = 0;
  const providerRequests: string[] = [];

  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/api/public/v1/evals/interrupt-mid-response/run")) actionRequests += 1;
    if (/https:\/\/(?:api\.deepgram\.com|api\.elevenlabs\.io|api\.fish\.audio|api\.cartesia\.ai|(?:api\.)?reson8\.dev)\//i.test(url)) {
      providerRequests.push(url);
    }
  });

  await page.goto("/evals/interrupt-mid-response");
  const action = page.locator('[data-voice-action="publicEvaluation.runSynthetic"]');
  await expect(action).toBeVisible();

  await action.getByRole("button", { name: "Run nonbillable synthetic evaluation" }).click();
  await expect(page.getByRole("status", { name: "Synthetic evaluation result status" })).toContainText("Complete:");
  await expect(page.getByRole("heading", { name: "Structured result" })).toBeVisible();
  expect(actionRequests).toBe(1);
  expect(providerRequests).toEqual([]);
});
