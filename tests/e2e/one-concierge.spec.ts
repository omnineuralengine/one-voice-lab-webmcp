import { expect, test, type Page } from "@playwright/test";

const PROVIDER_DOMAIN = /(?:api\.deepgram\.com|api\.elevenlabs\.io|api\.fish\.audio|api\.cartesia\.ai|api\.reson8\.dev)/i;
const SENTINEL = "OVL05B_PRIVATE_TRANSCRIPT_7c98f1";

test.describe("release-stage ONE Voice Concierge", () => {
  test("keeps direct navigation intact and requires an explicit destination choice", async ({ page }) => {
    const requests = observeRequests(page);
    await installSpeechMock(page, "success");
    await page.goto("/");

    const directNavigation = page.locator(".voice-open-nav__links");
    await expect(directNavigation.getByRole("link")).toHaveCount(5);
    await expect(page.getByRole("heading", { name: "Tell ONE what you want to accomplish." })).toBeVisible();
    await expect(page.getByTestId("ask-one-trigger")).toBeVisible();
    await expect.poll(() => speechStartCount(page)).toBe(0);

    await page.getByTestId("ask-one-trigger").click();
    const dialog = page.getByRole("dialog", { name: "What would you like to accomplish?" });
    await expect(dialog).toBeVisible();
    const input = dialog.getByLabel("Your goal");
    await expect(input).toBeFocused();
    await input.fill("turn speech into text");
    await dialog.getByRole("button", { name: "Find a path" }).click();

    const recommendationHeading = dialog.getByRole("heading", { name: "Transcribe approved audio" });
    await expect(recommendationHeading).toBeVisible();
    await expect(dialog.locator("#one-concierge-recommendations-title")).toBeFocused();
    await expect(dialog.getByText("Arriving does not upload or transcribe anything.")).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    expect(requests.provider).toBe(0);
    expect(requests.scenarioRuns).toBe(0);
    expect(requests.nonLoopback).toBe(0);

    await dialog.getByRole("button", { name: /Choose .* journey/ }).click();
    await expect(page).toHaveURL(/\?module=upload-audio$/);
    expect(requests.provider).toBe(0);
    expect(requests.scenarioRuns).toBe(0);
    expect(requests.nonLoopback).toBe(0);

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await page.goForward();
    await expect(page).toHaveURL(/\?module=upload-audio$/);
  });

  test("routes WER and other clear STT evaluation goals to truthful methodology only", async ({ page }) => {
    const requests = observeRequests(page);
    await page.goto("/");
    await page.getByTestId("ask-one-trigger").click();
    const dialog = page.getByRole("dialog", { name: "What would you like to accomplish?" });

    const goals = ["WER", "word error rate", "speech recognition accuracy", "speech to text accuracy", "speech-to-text evaluation"];
    for (const [index, goal] of goals.entries()) {
      await dialog.getByLabel("Your goal").fill(goal);
      await dialog.getByRole("button", { name: "Find a path" }).click();
      await expect(dialog.getByRole("heading", { name: "STT evaluation is not currently runnable" })).toBeVisible();
      await expect(dialog.getByText("STT evaluation is planned and not currently runnable. View the methodology and current availability.")).toBeVisible();
      await expect(dialog.getByText("Arriving does not measure WER or run an STT evaluation.")).toBeVisible();
      await expect(dialog.getByRole("heading", { name: "Evaluate voice outputs" })).toHaveCount(0);
      await expect(page).toHaveURL(/\/$/);

      if (index < goals.length - 1) await dialog.getByRole("button", { name: "Start over" }).click();
    }

    await dialog.getByRole("button", { name: "Choose STT evaluation is not currently runnable journey" }).click();
    await expect(page).toHaveURL(/\/methodology#stt-evaluation-availability$/);
    await expect(page.getByRole("heading", { name: "Speech-to-text evaluation availability" })).toBeVisible();
    await expect(page.getByText("The interactive Evaluate workspace compares TTS outputs. Its fixture results are not STT evidence and do not measure WER.")).toBeVisible();
    expect(requests.provider).toBe(0);
    expect(requests.scenarioRuns).toBe(0);
    expect(requests.nonLoopback).toBe(0);
  });

  test("clarifies ambiguity and fails closed for unsupported, injected, unavailable, and offline input", async ({ page, context }) => {
    const requests = observeRequests(page);
    await page.goto("/");
    await page.getByTestId("ask-one-trigger").click();
    const dialog = page.getByRole("dialog", { name: "What would you like to accomplish?" });
    const input = dialog.getByLabel("Your goal");

    await input.fill("compare");
    await dialog.getByRole("button", { name: "Find a path" }).click();
    const clarificationHeading = dialog.getByRole("heading", { name: "What would you like to compare?" });
    await expect(clarificationHeading).toBeVisible();
    await expect(clarificationHeading).toBeFocused();
    await expect(page).toHaveURL(/\/$/);
    await dialog.getByRole("button", { name: /Evaluate quality or evidence/ }).click();
    await expect(dialog.getByRole("heading", { name: "Evaluate voice outputs" })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);

    await dialog.getByRole("button", { name: "Start over" }).click();
    await dialog.getByLabel("Your goal").fill("javascript:alert(1)");
    await dialog.getByRole("button", { name: "Find a path" }).click();
    const recoveryHeading = dialog.getByRole("heading", { name: "Try one clear outcome" });
    await expect(recoveryHeading).toBeVisible();
    await expect(recoveryHeading).toBeFocused();
    await expect(page).toHaveURL(/\/$/);

    await dialog.getByRole("button", { name: "Edit typed goal" }).click();
    await context.setOffline(true);
    await dialog.getByLabel("Your goal").fill("transcribe audio");
    await dialog.getByRole("button", { name: "Find a path" }).click();
    await expect(dialog.getByRole("heading", { name: "That journey is not available right now" })).toBeVisible();
    await context.setOffline(false);
    expect(requests.provider).toBe(0);
    expect(requests.scenarioRuns).toBe(0);
    expect(requests.nonLoopback).toBe(0);
  });

  test("uses explicit mocked speech, reviews final text, and resolves exactly like typed input", async ({ page }) => {
    const requests = observeRequests(page);
    await installSpeechMock(page, "success");
    await page.goto("/");
    await page.getByTestId("ask-one-trigger").click();
    const dialog = page.getByRole("dialog", { name: "What would you like to accomplish?" });
    await dialog.getByLabel("Your goal").fill("privacy");

    await dialog.getByRole("button", { name: "Use microphone" }).click();
    await expect.poll(() => speechStartCount(page)).toBe(1);
    const reviewHeading = dialog.getByRole("heading", { name: "Is this the goal you meant?" });
    await expect(reviewHeading).toBeVisible();
    await expect(reviewHeading).toBeFocused();
    const transcript = dialog.getByLabel("Speech transcript");
    await expect(transcript).toHaveValue("turn speech into text");
    await transcript.fill("turn speech into text");
    await dialog.getByRole("button", { name: "Use this goal" }).click();
    await expect(dialog.getByRole("heading", { name: "Transcribe approved audio" })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    expect(requests.provider).toBe(0);
    expect(requests.scenarioRuns).toBe(0);
    expect(requests.nonLoopback).toBe(0);
  });

  test("preserves typed text on voice cancellation, permission denial, no-speech, and offline failure", async ({ page, context }) => {
    await installSpeechMock(page, "hold");
    await page.goto("/");
    await page.getByTestId("ask-one-trigger").click();
    const dialog = page.getByRole("dialog", { name: "What would you like to accomplish?" });
    await dialog.getByLabel("Your goal").fill("privacy");
    await dialog.getByRole("button", { name: "Use microphone" }).click();
    await expect(dialog.getByRole("heading", { name: "Say one short goal" })).toBeVisible();
    await expect(dialog.getByRole("status")).toHaveCount(1);
    await dialog.getByRole("button", { name: "Cancel voice input" }).click();
    await expect(dialog.getByLabel("Your goal")).toHaveValue("privacy");

    await page.reload();
    await installSpeechMode(page, "permission-denied");
    await page.getByTestId("ask-one-trigger").click();
    await dialog.getByLabel("Your goal").fill("privacy");
    await dialog.getByRole("button", { name: "Use microphone" }).click();
    await expect(dialog.getByRole("heading", { name: "Continue with text" })).toBeVisible();
    await dialog.getByRole("button", { name: "Edit typed goal" }).click();
    await expect(dialog.getByLabel("Your goal")).toHaveValue("privacy");

    await installSpeechMode(page, "hold");
    await dialog.getByRole("button", { name: "Use microphone" }).click();
    await expect.poll(() => speechActiveCount(page)).toBe(1);
    await context.setOffline(true);
    await expect(dialog.getByRole("heading", { name: "Continue with text" })).toBeVisible();
    await expect.poll(() => speechActiveCount(page)).toBe(0);
    await context.setOffline(false);
    await expect(dialog.getByRole("heading", { name: "Continue with text" })).toBeVisible();

    await page.reload();
    await installSpeechMode(page, "hold-no-abort");
    await page.getByTestId("ask-one-trigger").click();
    await dialog.getByLabel("Your goal").fill("privacy");
    await dialog.getByRole("button", { name: "Use microphone" }).click();
    await expect.poll(() => speechActiveCount(page)).toBe(1);
    await dialog.getByRole("button", { name: "Cancel voice input" }).click();
    await expect.poll(() => speechActiveCount(page)).toBe(0);
    await expect(dialog.getByLabel("Your goal")).toHaveValue("privacy");

    await page.reload();
    await installSpeechMode(page, "late-after-abort");
    await page.getByTestId("ask-one-trigger").click();
    await dialog.getByLabel("Your goal").fill(SENTINEL);
    await dialog.getByRole("button", { name: "Use microphone" }).click();
    const captureHeading = dialog.getByRole("heading", { name: "Say one short goal" });
    await expect(captureHeading).toBeFocused();
    await expect.poll(() => speechStartCount(page)).toBe(1);
    await dialog.getByRole("button", { name: "Start over" }).click();
    await expect.poll(() => speechAbortCount(page)).toBe(1);
    await expect(dialog.getByLabel("Your goal")).toBeFocused();
    await expect(dialog.getByLabel("Your goal")).toHaveValue("");
    await page.waitForTimeout(760);
    await expect(dialog.getByRole("heading", { name: "Is this the goal you meant?" })).toHaveCount(0);
    await expect(dialog.getByLabel("Your goal")).toHaveValue("");

    await installSpeechMode(page, "no-speech");
    await dialog.getByLabel("Your goal").fill("privacy");
    await dialog.getByRole("button", { name: "Use microphone" }).click();
    await expect(dialog.getByRole("heading", { name: "Continue with text" })).toBeVisible();
    await dialog.getByRole("button", { name: "Edit typed goal" }).click();
    await expect(dialog.getByLabel("Your goal")).toHaveValue("privacy");
  });

  test("restores keyboard focus and invalidates BFCache and pagehide capture state", async ({ page }) => {
    await installSpeechMock(page, "hold");
    await page.goto("/");
    const trigger = page.getByTestId("ask-one-trigger");
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "What would you like to accomplish?" });
    await expect(dialog.getByLabel("Your goal")).toBeFocused();
    await expect(dialog.getByRole("status")).toHaveCount(1);
    await dialog.getByLabel("Your goal").fill(SENTINEL);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await dialog.getByLabel("Your goal").fill(SENTINEL);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/$/);

    await trigger.click();
    await dialog.getByLabel("Your goal").fill(SENTINEL);
    await page.evaluate(() => {
      history.pushState(null, "", "/?module=tts");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\?module=tts$/);

    await trigger.click();
    await dialog.getByRole("button", { name: "Use microphone" }).click();
    await expect.poll(() => speechActiveCount(page)).toBe(1);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
    await expect(dialog).toBeHidden();
    await expect.poll(() => speechActiveCount(page)).toBe(0);
  });

  test("keeps browser speech single-flight across feedback dictation and the concierge", async ({ page }) => {
    await installSpeechMock(page, "late-after-abort");
    await page.goto("/feedback");
    await page.getByRole("button", { name: "Speak feedback" }).click();
    await expect.poll(() => speechActiveCount(page)).toBe(1);
    await page.waitForTimeout(20);

    await installSpeechMode(page, "hold");
    await page.getByTestId("ask-one-trigger").click();
    await expect.poll(() => speechActiveCount(page)).toBe(0);
    const dialog = page.getByRole("dialog", { name: "What would you like to accomplish?" });
    await dialog.getByRole("button", { name: "Use microphone" }).click();
    await expect.poll(() => speechStartCount(page)).toBe(2);
    await expect.poll(() => speechActiveCount(page)).toBe(1);
    await expect(page.getByRole("button", { name: "Speak feedback" })).toBeVisible();
    await page.waitForTimeout(760);
    await expect(page.getByLabel("Optional note")).toHaveValue("");

    await dialog.getByRole("button", { name: "Cancel voice input" }).click();
    await expect.poll(() => speechActiveCount(page)).toBe(0);
  });

  test("bounds oversized speech events and fails malformed results back to preserved text", async ({ page }) => {
    await installSpeechMock(page, "malformed-result");
    await page.goto("/");
    await page.getByTestId("ask-one-trigger").click();
    const dialog = page.getByRole("dialog", { name: "What would you like to accomplish?" });
    await dialog.getByLabel("Your goal").fill("privacy");
    await dialog.getByRole("button", { name: "Use microphone" }).click();
    await expect(dialog.getByRole("heading", { name: "Continue with text" })).toBeFocused();
    await expect.poll(() => speechActiveCount(page)).toBe(0);
    await dialog.getByRole("button", { name: "Edit typed goal" }).click();
    await expect(dialog.getByLabel("Your goal")).toHaveValue("privacy");

    await installSpeechMode(page, "control-result");
    await dialog.getByRole("button", { name: "Use microphone" }).click();
    await expect(dialog.getByRole("heading", { name: "Continue with text" })).toBeFocused();
    await expect.poll(() => speechActiveCount(page)).toBe(0);
    await dialog.getByRole("button", { name: "Edit typed goal" }).click();
    await expect(dialog.getByLabel("Your goal")).toHaveValue("privacy");

    await installSpeechMode(page, "oversized-transcript");
    await dialog.getByRole("button", { name: "Use microphone" }).click();
    await expect(dialog.getByRole("heading", { name: "Continue with text" })).toBeFocused();
    await expect.poll(() => speechActiveCount(page)).toBe(0);
    await dialog.getByRole("button", { name: "Edit typed goal" }).click();
    await expect(dialog.getByLabel("Your goal")).toHaveValue("privacy");

    await installSpeechMode(page, "oversized-results");
    await dialog.getByRole("button", { name: "Use microphone" }).click();
    await expect(dialog.getByRole("heading", { name: "Is this the goal you meant?" })).toBeFocused();
    await expect(dialog.getByLabel("Speech transcript")).toHaveValue("turn speech into text");
    expect(await speechResultReads(page)).toBeLessThanOrEqual(6);
    await expect.poll(() => speechActiveCount(page)).toBe(0);
  });

  test("keeps transcript sentinels out of storage, URLs, requests, caches, shared HTML, and isolated contexts", async ({ page, request, browser }) => {
    const observedUrls: string[] = [];
    page.on("request", (event) => observedUrls.push(event.url()));
    await page.goto("/");
    await page.getByTestId("ask-one-trigger").click();
    const dialog = page.getByRole("dialog", { name: "What would you like to accomplish?" });
    await dialog.getByLabel("Your goal").fill(SENTINEL);
    await dialog.getByRole("button", { name: "Find a path" }).click();
    await expect(dialog.getByRole("heading", { name: "Try one clear outcome" })).toBeVisible();

    const privacy = await page.evaluate(async (sentinel) => {
      const local = Object.entries(localStorage).some(([key, value]) => `${key}${value}`.includes(sentinel));
      const session = Object.entries(sessionStorage).some(([key, value]) => `${key}${value}`.includes(sentinel));
      const databaseNames = "databases" in indexedDB ? (await indexedDB.databases()).map((database) => database.name ?? "") : [];
      const cacheNames = "caches" in window ? await caches.keys() : [];
      const cachedUrls: string[] = [];
      for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName);
        cachedUrls.push(...(await cache.keys()).map((item) => item.url));
      }
      return {
        local,
        session,
        url: location.href.includes(sentinel),
        history: JSON.stringify(history.state).includes(sentinel),
        databaseNames: databaseNames.some((name) => name.includes(sentinel)),
        cachedUrls: cachedUrls.some((url) => url.includes(sentinel)),
      };
    }, SENTINEL);
    expect(privacy).toEqual({ local: false, session: false, url: false, history: false, databaseNames: false, cachedUrls: false });
    expect(observedUrls.some((url) => url.includes(SENTINEL))).toBe(false);
    const sharedHtml = await (await request.get("/")).text();
    expect(sharedHtml).not.toContain(SENTINEL);

    const isolatedContext = await browser.newContext();
    const isolatedPage = await isolatedContext.newPage();
    await isolatedPage.goto(new URL("/", page.url()).href);
    await isolatedPage.getByTestId("ask-one-trigger").click();
    await expect(isolatedPage.getByLabel("Your goal")).toHaveValue("");
    await expect(isolatedPage.locator("body")).not.toContainText(SENTINEL);
    await isolatedContext.close();
  });

  test("navigates to Evaluate and Scenario Studio without running either destination", async ({ page }) => {
    const requests = observeRequests(page);
    await page.goto("/");
    await navigateThroughConcierge(page, "evaluate quality", "Evaluate voice outputs");
    await expect(page).toHaveURL(/\/evaluate$/);
    await expect(page.getByRole("heading", { name: "Compare voice outputs" })).toBeVisible();
    expect(requests.scenarioRuns).toBe(0);
    expect(requests.provider).toBe(0);
    expect(requests.nonLoopback).toBe(0);

    await page.getByTestId("ask-one-trigger").click();
    const dialog = page.getByRole("dialog", { name: "What would you like to accomplish?" });
    await dialog.getByLabel("Your goal").fill("interruption recovery");
    await dialog.getByRole("button", { name: "Find a path" }).click();
    await expect(dialog.getByRole("heading", { name: "Explore interruption recovery" })).toBeVisible();
    await dialog.getByRole("button", { name: /Choose .* journey/ }).click();
    await expect(page).toHaveURL(/\/scenario-studio$/);
    await expect(page.getByRole("button", { name: "Run the interruption scenario" })).toBeVisible();
    expect(requests.scenarioRuns).toBe(0);
    expect(requests.provider).toBe(0);
    expect(requests.nonLoopback).toBe(0);
  });

  test("times out bounded speech and clears capture when the page becomes hidden", async ({ page }) => {
    await installSpeechMock(page, "hold");
    await page.goto("/");
    await page.getByTestId("ask-one-trigger").click();
    const dialog = page.getByRole("dialog", { name: "What would you like to accomplish?" });
    await dialog.getByLabel("Your goal").fill("privacy");
    await dialog.getByRole("button", { name: "Use microphone" }).click();
    await expect.poll(() => speechActiveCount(page)).toBe(1);
    await expect(dialog.getByRole("heading", { name: "Continue with text" })).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => speechActiveCount(page)).toBe(0);
    await dialog.getByRole("button", { name: "Edit typed goal" }).click();
    await expect(dialog.getByLabel("Your goal")).toHaveValue("privacy");

    await installSpeechMode(page, "hold");
    await dialog.getByRole("button", { name: "Use microphone" }).click();
    await expect.poll(() => speechActiveCount(page)).toBe(1);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(dialog).toBeHidden();
    await expect.poll(() => speechActiveCount(page)).toBe(0);
  });

  test("keeps the light appearance readable with distinct journey controls", async ({ page }) => {
    await page.goto("/settings#appearance");
    await page.getByRole("radio", { name: "light" }).check();
    await page.getByRole("button", { name: "Apply locally" }).click();
    await page.goto("/");

    await expect(page.locator("html")).toHaveAttribute("data-one-appearance", "light");
    await expect(page.getByRole("heading", { name: "What would you like to explore?" })).toHaveCSS("color", "rgb(21, 17, 28)");
    await page.getByTestId("ask-one-trigger").click();
    const dialog = page.getByRole("dialog", { name: "What would you like to accomplish?" });
    await dialog.getByLabel("Your goal").fill("where do i begin");
    await dialog.getByRole("button", { name: "Find a path" }).click();

    const journeyButtons = dialog.getByRole("button", { name: /Choose .* journey/ });
    await expect(journeyButtons).toHaveCount(2);
    const journeyNames = await journeyButtons.evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));
    expect(new Set(journeyNames).size).toBe(2);

    const contrast = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const ratio = (foreground: string, background: string) => {
        const channel = (value: number) => {
          const normalized = value / 255;
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        };
        const luminance = (value: string) => {
          const channels = value.match(/[a-f\d]{2}/giu)?.map((part) => Number.parseInt(part, 16)) ?? [];
          return 0.2126 * channel(channels[0]) + 0.7152 * channel(channels[1]) + 0.0722 * channel(channels[2]);
        };
        const lighter = Math.max(luminance(foreground), luminance(background));
        const darker = Math.min(luminance(foreground), luminance(background));
        return (lighter + 0.05) / (darker + 0.05);
      };
      return {
        purple: ratio(style.getPropertyValue("--one-purple-foreground").trim(), "#ffffff"),
        green: ratio(style.getPropertyValue("--one-green-foreground").trim(), "#ffffff"),
        amber: ratio(style.getPropertyValue("--one-amber-foreground").trim(), "#ffffff"),
        focus: ratio(style.getPropertyValue("--one-focus").trim(), "#ffffff"),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(contrast.purple).toBeGreaterThanOrEqual(4.5);
    expect(contrast.green).toBeGreaterThanOrEqual(4.5);
    expect(contrast.amber).toBeGreaterThanOrEqual(4.5);
    expect(contrast.focus).toBeGreaterThanOrEqual(3);
    expect(contrast.overflow).toBeLessThanOrEqual(1);
  });

  test("reflows the entry and every canonical depth at required deterministic viewports", async ({ page }) => {
    // This single test intentionally covers 20 viewport/depth combinations plus
    // 200% zoom. Keep its assertions strict while allowing the full serial
    // browser suite enough time on a cold development server.
    test.setTimeout(120_000);
    for (const viewport of [
      { width: 320, height: 700 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      const trigger = page.getByTestId("ask-one-trigger");
      await expect(trigger).toBeVisible();
      expect((await trigger.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: "What would you like to accomplish?" });
      for (const depth of ["Essential", "Guided", "Detailed", "Technical"]) {
        await dialog.getByRole("radio", { name: new RegExp(`^${depth}`) }).check();
        await dialog.getByLabel("Your goal").fill("where do i begin");
        await dialog.getByRole("button", { name: "Find a path" }).click();
        await expect(dialog.getByRole("button", { name: /Choose .* journey/ }).first()).toBeVisible();
        const dimensions = await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          dialogWidth: document.querySelector("dialog[open]")?.getBoundingClientRect().width ?? 0,
        }));
        expect(dimensions.scrollWidth, `${viewport.width}px ${depth} page overflow`).toBeLessThanOrEqual(dimensions.clientWidth + 1);
        expect(dimensions.dialogWidth, `${viewport.width}px ${depth} dialog width`).toBeLessThanOrEqual(dimensions.clientWidth + 1);
        await dialog.getByRole("button", { name: "Start over" }).click();
      }
      await dialog.getByRole("button", { name: "Use direct navigation" }).click();
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
    await page.getByTestId("ask-one-trigger").click();
    const zoomDimensions = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(zoomDimensions.scrollWidth).toBeLessThanOrEqual(zoomDimensions.clientWidth + 1);
    await expect(page.getByRole("dialog", { name: "What would you like to accomplish?" }).getByRole("button", { name: "Use direct navigation" })).toBeVisible();
  });
});

async function navigateThroughConcierge(page: Page, goal: string, destinationHeading: string) {
  await page.getByTestId("ask-one-trigger").click();
  const dialog = page.getByRole("dialog", { name: "What would you like to accomplish?" });
  await dialog.getByLabel("Your goal").fill(goal);
  await dialog.getByRole("button", { name: "Find a path" }).click();
  await expect(dialog.getByRole("heading", { name: destinationHeading })).toBeVisible();
  await dialog.getByRole("button", { name: /Choose .* journey/ }).click();
}

function observeRequests(page: Page) {
  const state = { provider: 0, scenarioRuns: 0, nonLoopback: 0 };
  page.on("request", (request) => {
    if (PROVIDER_DOMAIN.test(request.url())) state.provider += 1;
    if (new URL(request.url()).pathname === "/api/scenarios/run") state.scenarioRuns += 1;
    const hostname = new URL(request.url()).hostname;
    if (hostname !== "127.0.0.1" && hostname !== "localhost") state.nonLoopback += 1;
  });
  return state;
}

type SpeechMode = "success" | "hold" | "hold-no-abort" | "permission-denied" | "no-speech" | "late-after-abort" | "malformed-result" | "control-result" | "oversized-transcript" | "oversized-results";

async function installSpeechMode(page: Page, mode: SpeechMode) {
  await page.evaluate((nextMode) => {
    (window as Window & { __oneSpeechMode?: SpeechMode }).__oneSpeechMode = nextMode;
  }, mode);
}

async function installSpeechMock(page: Page, initialMode: SpeechMode) {
  await page.addInitScript((mode) => {
    type RecognitionResult = { 0: { transcript: string; confidence: number }; length: number; isFinal: boolean };
    type RecognitionScope = Window & {
      __oneSpeechMode?: SpeechMode;
      __oneSpeechStartCount?: number;
      __oneSpeechAbortCount?: number;
      __oneSpeechActiveCount?: number;
      __oneSpeechResultReads?: number;
      SpeechRecognition?: new () => MockRecognition;
      webkitSpeechRecognition?: new () => MockRecognition;
    };
    class MockRecognition {
      active = false;
      lang = "en-US";
      continuous = false;
      interimResults = true;
      maxAlternatives = 1;
      onstart: (() => void) | null = null;
      onresult: ((event: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      finishActive() {
        if (!this.active) return;
        this.active = false;
        const scope = window as RecognitionScope;
        scope.__oneSpeechActiveCount = Math.max(0, (scope.__oneSpeechActiveCount ?? 1) - 1);
      }
      start() {
        const scope = window as RecognitionScope;
        scope.__oneSpeechStartCount = (scope.__oneSpeechStartCount ?? 0) + 1;
        this.active = true;
        scope.__oneSpeechActiveCount = (scope.__oneSpeechActiveCount ?? 0) + 1;
        window.setTimeout(() => {
          const activeMode = scope.__oneSpeechMode;
          if (activeMode === "permission-denied") {
            this.finishActive();
            this.onerror?.({ error: "not-allowed" });
            return;
          }
          if (activeMode === "hold-no-abort") {
            (this as unknown as { abort?: () => void }).abort = undefined;
          }
          this.onstart?.();
          if (activeMode === "hold" || activeMode === "hold-no-abort") return;
          if (activeMode === "late-after-abort") {
            window.setTimeout(() => {
              this.onresult?.({ resultIndex: 0, results: [{ 0: { transcript: "OVL05B_PRIVATE_TRANSCRIPT_7c98f1", confidence: 0.99 }, length: 1, isFinal: true }] });
              this.finishActive();
              this.onend?.();
            }, 700);
            return;
          }
          if (activeMode === "no-speech") {
            this.finishActive();
            this.onend?.();
            return;
          }
          if (activeMode === "malformed-result") {
            this.onresult?.({
              resultIndex: 0,
              results: [{ 0: { transcript: 42 as unknown as string, confidence: 0.5 }, length: 1, isFinal: true }],
            });
            return;
          }
          if (activeMode === "control-result") {
            this.onresult?.({
              resultIndex: 0,
              results: [{ 0: { transcript: "turn\u202espeech", confidence: 0.9 }, length: 1, isFinal: true }],
            });
            return;
          }
          if (activeMode === "oversized-transcript") {
            this.onresult?.({
              resultIndex: 0,
              results: [{ 0: { transcript: "x".repeat(10_000), confidence: 0.9 }, length: 1, isFinal: true }],
            });
            return;
          }
          if (activeMode === "oversized-results") {
            const result = { 0: { transcript: "turn speech into text", confidence: 0.98 }, length: 1, isFinal: true };
            const backing: Record<string, RecognitionResult | number> = { length: 1_000_000 };
            for (let index = 0; index < 6; index += 1) backing[String(index)] = result;
            const results = new Proxy(backing, {
              get(target, property) {
                if (typeof property === "string" && /^\d+$/.test(property)) {
                  scope.__oneSpeechResultReads = (scope.__oneSpeechResultReads ?? 0) + 1;
                }
                return Reflect.get(target, property);
              },
            }) as unknown as ArrayLike<RecognitionResult>;
            this.onresult?.({ resultIndex: 0, results });
            this.finishActive();
            this.onend?.();
            return;
          }
          this.onresult?.({ resultIndex: 0, results: [{ 0: { transcript: "turn speech", confidence: 0.65 }, length: 1, isFinal: false }] });
          this.onresult?.({ resultIndex: 0, results: [
            { 0: { transcript: "turn speech into text", confidence: 0.98 }, length: 1, isFinal: true },
            { 0: { transcript: "turn speech into text", confidence: 0.98 }, length: 1, isFinal: true },
          ] });
          this.finishActive();
          this.onend?.();
        }, 10);
      }
      stop() {
        this.finishActive();
        window.setTimeout(() => this.onend?.(), 0);
      }
      abort() {
        const scope = window as RecognitionScope;
        scope.__oneSpeechAbortCount = (scope.__oneSpeechAbortCount ?? 0) + 1;
        this.finishActive();
        window.setTimeout(() => this.onerror?.({ error: "aborted" }), 0);
      }
    }
    const scope = window as RecognitionScope;
    scope.__oneSpeechMode = mode;
    scope.__oneSpeechStartCount = 0;
    scope.__oneSpeechAbortCount = 0;
    scope.__oneSpeechActiveCount = 0;
    scope.__oneSpeechResultReads = 0;
    scope.SpeechRecognition = MockRecognition;
    scope.webkitSpeechRecognition = MockRecognition;
  }, initialMode);
}

async function speechStartCount(page: Page) {
  return page.evaluate(() => (window as Window & { __oneSpeechStartCount?: number }).__oneSpeechStartCount ?? 0);
}

async function speechAbortCount(page: Page) {
  return page.evaluate(() => (window as Window & { __oneSpeechAbortCount?: number }).__oneSpeechAbortCount ?? 0);
}

async function speechActiveCount(page: Page) {
  return page.evaluate(() => (window as Window & { __oneSpeechActiveCount?: number }).__oneSpeechActiveCount ?? 0);
}

async function speechResultReads(page: Page) {
  return page.evaluate(() => (window as Window & { __oneSpeechResultReads?: number }).__oneSpeechResultReads ?? 0);
}
