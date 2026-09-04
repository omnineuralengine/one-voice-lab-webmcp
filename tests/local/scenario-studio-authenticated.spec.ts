import { expect, test, type Page } from "@playwright/test";

test("keeps a locally authenticated human's synthetic receipt ephemeral and provider-free", async ({ page }) => {
  const traffic = await enforceLoopbackOnly(page);
  const depthNetworkRequests: string[] = [];
  let trackDepthTraffic = false;
  page.on("request", (request) => {
    if (!trackDepthTraffic) return;
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/scenarios/run" || pathname === "/rest/v1/user_preferences") {
      depthNetworkRequests.push(pathname);
    }
  });
  const email = "ovl05a-local-auth@example.test";
  const password = "Ovl05a-local-only-password!";

  await page.goto("/settings#identity");
  await expect(page.getByText("Sign in to save your Lab", { exact: true })).toBeVisible();
  const passwordDisclosure = page.getByText("Use a password", { exact: true });
  await passwordDisclosure.click();
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in with password" }).click();
  await expect(page.getByText("Signed in", { exact: true })).toBeVisible();

  await page.goto("/scenario-studio");
  await expect(page.getByText("Signed in · this receipt stays in this tab", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: /Understand the recovery/ }).check();
  const firstScenarioResponse = page.waitForResponse((response) => (
    new URL(response.url()).pathname === "/api/scenarios/run" && response.ok()
  ));
  await page.getByRole("button", { name: "Run the interruption scenario" }).click();
  const firstResponseBody = await (await firstScenarioResponse).text();
  await expect(page.getByText("Canonical ephemeral receipt", { exact: true })).toBeVisible();
  await expect(page.getByText("Human review still required", { exact: true }).first()).toBeVisible();
  await page.getByText("Inspect the sanitized receipt", { exact: true }).click();
  await expect(page.getByText("human-ephemeral", { exact: true })).toBeVisible();

  const depth = page.getByRole("group", { name: "Scenario detail" });
  const receiptDigest = await page.locator(".scenario-technical-details dd").last().innerText();
  trackDepthTraffic = true;
  await depth.getByRole("radio", { name: /^Technical/ }).check();
  await depth.getByRole("radio", { name: /^Essential/ }).check();
  await depth.getByRole("radio", { name: /^Technical/ }).check();
  await page.waitForTimeout(100);
  trackDepthTraffic = false;
  await expect(page.locator(".scenario-technical-details dd").last()).toHaveText(receiptDigest);
  expect(depthNetworkRequests).toEqual([]);

  let releaseHeldResponse!: () => void;
  const heldResponse = new Promise<void>((resolve) => { releaseHeldResponse = resolve; });
  await page.route("**/api/scenarios/run", async (route) => {
    await heldResponse;
    try {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Cache-Control": "private, no-store, max-age=0" },
        body: firstResponseBody,
      });
    } catch {
      // The identity transition is expected to abort the stale in-flight request.
    }
  });
  await page.getByRole("button", { name: "Run the interruption scenario" }).click();
  await expect(page.getByRole("button", { name: "Running the bounded fixture…" })).toBeDisabled();

  const accountPage = await page.context().newPage();
  const accountTraffic = await enforceLoopbackOnly(accountPage);
  await accountPage.goto("/settings#identity");
  await expect(accountPage.getByText("Signed in", { exact: true })).toBeVisible();
  await accountPage.getByRole("button", { name: "Sign out" }).click();
  await expect(accountPage.getByText("Sign in to save your Lab", { exact: true })).toBeVisible();
  await expect(page.getByText("Guest · this receipt stays in this tab", { exact: true })).toBeVisible();
  await expect(page.getByText(/discarded the prior ephemeral run/)).toBeVisible();
  releaseHeldResponse();
  await page.waitForTimeout(150);
  await expect(page.getByRole("heading", { name: "Run completed" })).toHaveCount(0);
  await accountPage.close();

  expect(await scenarioStorageKeys(page)).toEqual([]);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your receipt will appear here" })).toBeVisible();
  await expect(page.getByText("Guest · this receipt stays in this tab", { exact: true })).toBeVisible();
  expect(await scenarioStorageKeys(page)).toEqual([]);
  expect(traffic.nonLoopback).toEqual([]);
  expect(traffic.providerRequests).toBe(0);
  expect(traffic.webSockets).toEqual([]);
  expect(accountTraffic.nonLoopback).toEqual([]);
  expect(accountTraffic.providerRequests).toBe(0);
  expect(accountTraffic.webSockets).toEqual([]);
});

async function enforceLoopbackOnly(page: Page) {
  const state = { nonLoopback: [] as string[], providerRequests: 0, webSockets: [] as string[] };
  const providerDomain = /(?:api\.deepgram\.com|api\.elevenlabs\.io|api\.fish\.audio|api\.cartesia\.ai|api\.reson8\.dev)/i;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (providerDomain.test(url.hostname)) state.providerRequests += 1;
    if ((url.protocol === "http:" || url.protocol === "https:") && !["127.0.0.1", "localhost"].includes(url.hostname)) {
      state.nonLoopback.push(url.origin);
    }
  });
  page.on("websocket", (socket) => {
    const url = new URL(socket.url());
    if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
      state.webSockets.push(socket.url());
    }
    if (providerDomain.test(url.hostname)) state.providerRequests += 1;
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if ((url.protocol === "http:" || url.protocol === "https:") && !["127.0.0.1", "localhost"].includes(url.hostname)) {
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  return state;
}

function scenarioStorageKeys(page: Page) {
  return page.evaluate(() => Object.keys(localStorage).filter((key) => /scenario|receipt|run/i.test(key)));
}
