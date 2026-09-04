import { expect, test, type Page } from "@playwright/test";

const USER_A_EMAIL = "ovl05a-local-auth@example.test";
const USER_B_EMAIL = "ovl05b-local-auth-b@example.test";
const LOCAL_PASSWORD = "Ovl05a-local-only-password!";
const SENTINEL = "OVL05B_USER_A_EPHEMERAL_GOAL";

test("invalidates concierge state across guest, USER_A, and USER_B principal transitions", async ({ page }) => {
  const traffic = await enforceLoopbackOnly(page);
  await installHeldSpeechMock(page);
  await page.goto("/");
  await page.getByTestId("ask-one-trigger").click();
  const dialog = page.getByRole("dialog", { name: "What would you like to accomplish?" });
  await dialog.getByLabel("Your goal").fill(SENTINEL);

  const accountPage = await page.context().newPage();
  const accountTraffic = await enforceLoopbackOnly(accountPage);
  await signIn(accountPage, USER_A_EMAIL);
  await expect(dialog).toBeHidden();

  await page.getByTestId("ask-one-trigger").click();
  await expect(dialog.getByLabel("Your goal")).toHaveValue("");
  await dialog.getByLabel("Your goal").fill("evaluate quality");
  await dialog.getByRole("button", { name: "Find a path" }).click();
  await expect(dialog.getByRole("heading", { name: "Evaluate voice outputs" })).toBeVisible();
  await dialog.getByRole("button", { name: "Edit goal" }).click();
  await dialog.getByLabel("Your goal").fill(SENTINEL);
  await dialog.getByRole("button", { name: "Use microphone" }).click();
  await expect.poll(() => speechActiveCount(page)).toBe(1);

  await accountPage.bringToFront();
  await accountPage.goto("/settings#identity");
  await expect(accountPage.getByText("Signed in", { exact: true })).toBeVisible();
  await accountPage.getByRole("button", { name: "Sign out" }).click();
  await expect(accountPage.getByText("Sign in to save your Lab", { exact: true })).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect.poll(() => speechActiveCount(page)).toBe(0);

  await signIn(accountPage, USER_B_EMAIL);
  await page.bringToFront();
  await page.getByTestId("ask-one-trigger").click();
  await expect(dialog.getByLabel("Your goal")).toHaveValue("");
  await expect(page.locator("body")).not.toContainText(SENTINEL);
  await dialog.getByRole("button", { name: "Use direct navigation" }).click();

  expect(traffic.nonLoopback).toEqual([]);
  expect(traffic.providerRequests).toBe(0);
  expect(accountTraffic.nonLoopback).toEqual([]);
  expect(accountTraffic.providerRequests).toBe(0);
  await accountPage.close();
});

async function signIn(page: Page, email: string) {
  await page.goto("/settings#identity");
  await expect(page.getByText("Sign in to save your Lab", { exact: true })).toBeVisible();
  await page.getByText("Use a password", { exact: true }).click();
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(LOCAL_PASSWORD);
  await page.getByRole("button", { name: "Sign in with password" }).click();
  await expect(page.getByText("Signed in", { exact: true })).toBeVisible();
}

async function installHeldSpeechMock(page: Page) {
  await page.addInitScript(() => {
    type SpeechScope = Window & { __oneSpeechActiveCount?: number; SpeechRecognition?: new () => HeldRecognition; webkitSpeechRecognition?: new () => HeldRecognition };
    class HeldRecognition {
      lang = "en-US";
      continuous = false;
      interimResults = true;
      maxAlternatives = 1;
      active = false;
      onstart: (() => void) | null = null;
      onresult = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        const scope = window as SpeechScope;
        this.active = true;
        scope.__oneSpeechActiveCount = (scope.__oneSpeechActiveCount ?? 0) + 1;
        this.onstart?.();
      }
      stop() { this.finish(); this.onend?.(); }
      abort() { this.finish(); this.onerror?.({ error: "aborted" }); }
      finish() {
        if (!this.active) return;
        this.active = false;
        const scope = window as SpeechScope;
        scope.__oneSpeechActiveCount = Math.max(0, (scope.__oneSpeechActiveCount ?? 1) - 1);
      }
    }
    const scope = window as SpeechScope;
    scope.__oneSpeechActiveCount = 0;
    scope.SpeechRecognition = HeldRecognition;
    scope.webkitSpeechRecognition = HeldRecognition;
  });
}

function speechActiveCount(page: Page) {
  return page.evaluate(() => (window as Window & { __oneSpeechActiveCount?: number }).__oneSpeechActiveCount ?? 0);
}

async function enforceLoopbackOnly(page: Page) {
  const state = { nonLoopback: [] as string[], providerRequests: 0 };
  const providerDomain = /(?:api\.deepgram\.com|api\.elevenlabs\.io|api\.fish\.audio|api\.cartesia\.ai|api\.reson8\.dev)/i;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (providerDomain.test(url.hostname)) state.providerRequests += 1;
    if ((url.protocol === "http:" || url.protocol === "https:") && !["127.0.0.1", "localhost"].includes(url.hostname)) state.nonLoopback.push(url.origin);
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
