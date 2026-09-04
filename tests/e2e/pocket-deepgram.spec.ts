import { expect, test } from "@playwright/test";

import { SDK_DOCTOR_OPEN_EVENT } from "@/lib/sdk-doctor-events";

const REQUIRED_TARGETS = [
  "API Lab",
  "Pre-Sales Engineering",
  "Architecture Studio",
  "Live Mic",
  "Text to Speech",
  "Voice Agent",
  "Flux Conversation Observatory",
];

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.config.metadata.pocket !== true, "Pocket coverage uses its dedicated mobile/desktop matrix.");
});

test("Pocket stays hidden in the compact shell and remains available on desktop", async ({ page }, testInfo) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Pocket", exact: true });

  if (testInfo.project.name.startsWith("phone") || testInfo.project.name.startsWith("tablet")) {
    await expect(page.locator(".one-global-utility-dock")).toBeHidden();
    await expect(trigger).toBeHidden();
    await expect(page.getByRole("button", { name: "Applied Voice Copilot", exact: true })).toBeHidden();
    await expectNoHorizontalScroll(page);
    return;
  }

  await expect(trigger).toBeVisible();
  const triggerBox = await trigger.boundingBox();
  expect(triggerBox?.height).toBeGreaterThanOrEqual(48);
  await expectNoHorizontalScroll(page);
  await expect(trigger).toHaveAttribute("data-pocket-launcher", "standalone");
  expect(await trigger.evaluate((element) => getComputedStyle(element).position)).toBe("fixed");

  await trigger.click();
  const panel = page.locator(".pocket-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("data-pocket-mode", "compact");
  await expect(panel).toHaveAttribute("data-pocket-layout", "desktop-panel");
  await expect(page.getByText("Demo Mode on", { exact: true })).toBeVisible();
  await expect(page.getByText("Configured", { exact: true })).toBeVisible();
  await expect(panel.getByRole("link", { name: "semantic control setup" })).toHaveCount(0);
  for (const label of REQUIRED_TARGETS) await expect(panel.getByRole("link", { name: label, exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole("button", { name: "Expand Pocket Deepgram" }).click();
  await expect(panel).toHaveAttribute("data-pocket-mode", "expanded");
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: "Compact Pocket Deepgram" }).click();

  if (testInfo.project.name.startsWith("laptop") || testInfo.project.name.startsWith("wide")) {
    const dock = page.getByRole("checkbox", { name: /Dock panel/ });
    await expect(dock).toBeVisible();
    await dock.check();
    await expect(page.locator("body")).toHaveClass(/pocket-shell-docked/);
    await expect.poll(() => page.locator("#learning-lab-shell").evaluate((element) => Number.parseFloat(getComputedStyle(element).marginRight))).toBeGreaterThan(300);
  } else {
    await expect(page.getByRole("checkbox", { name: /Dock panel/ })).toHaveCount(0);
  }

  await panel.press("Escape");
  await expect(trigger).toBeVisible();
  await expect(trigger).toBeFocused();
});

test("mobile billable actions keep the document safety checkpoint", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("phone"), "One phone project covers the hidden-launcher safety guard.");
  let providerRequests = 0;
  await page.route("**/api/deepgram/**", (route) => {
    providerRequests += 1;
    return route.abort();
  });

  await page.goto("/?module=tts");
  await expect(page.locator(".pocket-trigger")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".pocket-trigger")).toBeHidden();
  await expect(page.locator(".pocket-panel")).toBeHidden();

  const generate = page.getByRole("button", { name: /Generate Audio/ });
  await expect(generate).toBeVisible();
  expect(providerRequests).toBe(0);
  await generate.click();

  const checkpoint = page.getByRole("alertdialog", { name: "Confirm billable action" });
  await expect(checkpoint).toBeVisible();
  await expect(checkpoint.getByRole("button", { name: "Cancel" })).toBeFocused();
  expect(providerRequests).toBe(0);
});

test("Pocket persists safe recents and guards live actions", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("laptop"), "One desktop project covers persistence and safety behavior.");
  await page.goto("/");
  await page.getByRole("button", { name: "Pocket", exact: true }).click();
  await page.locator(".pocket-panel").getByRole("link", { name: "API Lab", exact: true }).click();
  await expect(page).toHaveURL(/module=api-studio/);
  await page.getByRole("button", { name: "Pocket", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Recent sessions" })).toBeVisible();
  await expect(page.locator(".pocket-recent-list").getByText("API Lab", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Check Deepgram connection" }).click();
  const checkpoint = page.getByRole("alertdialog", { name: /Confirm billable action/ });
  await expect(checkpoint).toBeVisible();
  await expect(checkpoint.getByRole("button", { name: "Cancel" })).toBeFocused();
  await checkpoint.press("Escape");
  await expect(page.getByRole("button", { name: "Check Deepgram connection" })).toBeFocused();
  await expect(page.getByText("Not checked", { exact: true })).toBeVisible();

  const demoMode = page.getByRole("checkbox", { name: /Demo Mode/ });
  await expect(demoMode).toBeChecked();
  await demoMode.click();
  await expect(page.getByRole("alertdialog", { name: /Confirm destructive action/ })).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  await expect(demoMode).toBeChecked();

  const stored = await page.evaluate(() => window.localStorage.getItem("deepgram-pocket:shell:v1"));
  expect(stored).toContain('"targetId":"api-lab"');
  expect(stored).not.toMatch(/token|transcript|api.?key/i);
});

test("Pocket reports disconnection and publishes the offline install surface", async ({ page, context }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("wide"), "One wide project covers install and disconnected behavior.");
  await page.goto("/");
  const manifestResponse = await page.request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json() as {
    display: string;
    start_url: string;
    shortcuts: Array<{ name: string; url: string; description: string }>;
  };
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/?source=one-pwa");
  expect(manifest.shortcuts.map((shortcut) => [shortcut.name, shortcut.url])).toEqual([
    ["Compare", "/providers"],
    ["Evaluate", "/evaluate"],
    ["Build", "/build"],
    ["Learn", "/learn"],
  ]);
  expect(manifest.shortcuts.map((shortcut) => `${shortcut.url} ${shortcut.description}`).join(" ")).not.toMatch(/(?:live-mic|voice-agent|realtime|temporary token)/i);
  const workerResponse = await page.request.get("/pocket-deepgram-sw.js");
  expect(workerResponse.ok()).toBe(true);
  expect(await workerResponse.text()).toContain('url.pathname.startsWith("/api/")');

  await page.getByRole("button", { name: "Pocket", exact: true }).click();
  await expect(page.getByText(/Offline shell (ready|preparing)/)).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByText("Offline", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check Deepgram connection" })).toBeDisabled();
  await context.setOffline(false);
  await expect(page.getByText("Online", { exact: true })).toBeVisible();
});

test("Pocket opens SDK Doctor in-session without navigation or network execution", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("laptop"), "One laptop project covers the in-session Doctor action.");
  const forbiddenRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/(?:deepgram|execute|token)|wss?:\/\//i.test(request.url())) forbiddenRequests.push(request.url());
  });

  await page.goto("/live-solution-studio");
  await page.evaluate((eventName) => {
    const testWindow = window as typeof window & { __sdkDoctorOpen?: { count: number; source?: string } };
    testWindow.__sdkDoctorOpen = { count: 0 };
    window.addEventListener(eventName, (event) => {
      const detail = (event as CustomEvent<{ source?: string }>).detail;
      testWindow.__sdkDoctorOpen = { count: (testWindow.__sdkDoctorOpen?.count ?? 0) + 1, source: detail?.source };
    });
  }, SDK_DOCTOR_OPEN_EVENT);

  await page.getByRole("button", { name: "Pocket", exact: true }).click();
  const panel = page.locator(".pocket-panel");
  await panel.getByRole("button", { name: /Deepgram SDK Doctor/ }).click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __sdkDoctorOpen?: { count: number } }).__sdkDoctorOpen?.count ?? 0)).toBe(1);
  expect(await page.evaluate(() => (window as typeof window & { __sdkDoctorOpen?: { source?: string } }).__sdkDoctorOpen?.source)).toBe("pocket");
  expect(new URL(page.url()).pathname).toBe("/live-solution-studio");
  await expect(page.getByRole("button", { name: "Pocket", exact: true })).toBeVisible();
  expect(forbiddenRequests).toEqual([]);
});

async function expectNoHorizontalScroll(page: import("@playwright/test").Page) {
  const dimensions = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
}
