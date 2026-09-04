import { expect, test, type Page } from "@playwright/test";

test.describe("ONE Voice Lab public journey", () => {
  test("starts from four human capabilities and preserves old module links", async ({ page }) => {
    let providerRequests = 0;
    await page.route("**/api/deepgram/**", (route) => { providerRequests += 1; return route.abort(); });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "What would you like to explore?", exact: true })).toBeVisible();
    await expect(page.getByText(/Omni Neural Engine/).first()).toBeVisible();
    for (const name of ["Turn speech into text", "Create speech from text", "Compare providers", "Evaluate voice outputs"]) {
      await expect(page.getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible();
    }
    for (const name of ["Explore", "Compare", "Evaluate", "Build", "Learn"]) await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pocket", exact: true })).toHaveAttribute("data-pocket-launcher", "standalone");
    await expect(page.getByRole("button", { name: "Applied Voice Copilot", exact: true })).toBeVisible();
    expect(providerRequests).toBe(0);

    await page.getByRole("link", { name: /^Turn speech into text/ }).click();
    await expect(page.getByRole("heading", { name: "Upload Audio", exact: true })).toBeVisible();
    await page.keyboard.press("h");
    await expect(page.getByRole("heading", { name: "ONE Voice Lab", exact: true })).toBeVisible();

    await page.goto("/?module=audio-signal-lab");
    await expect(page.getByRole("heading", { name: "Audio Signal Lab", exact: true }).first()).toBeVisible();
  });

  test("opens the command palette from shared navigation and ignores navigation keys while typing", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Commands/ }).click();
    await expect(page.getByTestId("command-palette")).toBeVisible();
    await page.getByRole("combobox", { name: "Search commands" }).fill("simulation");
    await expect(page.getByRole("option", { name: /Go to Simulation Lab/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.locator("summary").filter({ hasText: "What are you trying to build or understand?" }).click();
    const input = page.getByLabel("What are you trying to build or understand? request");
    await input.fill("Typing S B L D H should stay text.");
    await input.press("s");
    await expect(page).toHaveURL(/\?command=1$/);
    await expect(input).toHaveValue(/Typing S B L D H should stay text\.s/i);
  });

  test("runs the flagship replay only after confirmation and never calls Deepgram", async ({ page }) => {
    let providerRequests = 0;
    await page.route("**/api/deepgram/**", (route) => { providerRequests += 1; return route.abort(); });
    await page.goto("/simulation-lab");
    await expect(page.getByRole("heading", { name: "Simulation Lab", exact: true })).toBeVisible();
    await expect(page.getByText("Observer", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Run number")).toBeDisabled();
    expect(providerRequests).toBe(0);

    await page.getByRole("button", { name: "Start replay" }).click();
    const dialog = page.getByRole("dialog", { name: "Start deterministic replay?" });
    await expect(dialog).toContainText("Provider spend");
    await expect(dialog).toContainText("None");
    expect(providerRequests).toBe(0);
    await dialog.getByRole("button", { name: "Begin replay" }).click();
    await expect(page.getByRole("status").filter({ hasText: "COMPLETED" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "Run scorecard" })).toBeVisible();
    await expect(page.getByText("Observed in this experiment.", { exact: true })).toBeVisible();
    expect(providerRequests).toBe(0);
    const usage = await page.evaluate(() => JSON.parse(localStorage.getItem("voice-open-lab-simulation-usage-v1") ?? "[]"));
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ mode: "replay", provider: "none", providerRequestCount: 0 });
    await page.getByRole("button", { name: "Save locally" }).click();
    await expect(page.getByRole("status").filter({ hasText: "saved locally" })).toBeVisible();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("one:guest:simulation-presets:v1") ?? "[]"));
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ experimentType: "simulation", configuration: { provenance: "simulated" } });
  });

  test("supports stop, planned states, and safe Early Access empty content", async ({ page }) => {
    await page.goto("/simulation-lab");
    await page.getByRole("button", { name: "Start replay" }).click();
    await page.getByRole("button", { name: "Begin replay" }).click();
    await page.getByRole("button", { name: "Stop immediately" }).click();
    await expect(page.getByRole("status").filter({ hasText: "STOPPED" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Run scorecard" })).toBeVisible();

    await page.getByRole("button", { name: /Accented customer-support audio/i }).click();
    await expect(page.getByRole("button", { name: "Start replay" })).toBeDisabled();
    await expect(page.getByText("Planned", { exact: true }).first()).toBeVisible();

    await page.goto("/providers/deepgram/early-access");
    await expect(page.getByRole("heading", { name: "Early Access Bench" })).toBeVisible();
    await expect(page.getByText("No public early-access experiments are configured")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/private feature|confidential feature name|roadmap commitment/i);
  });

  test("keeps Guest Mode useful and persists a validated local theme", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Account and preferences" })).toBeVisible();
    await expect(page.getByText("Guest Mode is active")).toBeVisible();
    await page.getByLabel("Primary hex color").fill("#2255AA");
    await page.getByLabel("Secondary hex color").fill("#11AA77");
    await page.getByRole("button", { name: "Apply locally" }).click();
    await expect(page.getByRole("status")).toContainText("Theme applied locally");
    await page.reload();
    await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue("--one-primary").trim())).toBe("#2255AA");
    expect(await page.evaluate(() => localStorage.getItem("one:guest:theme:v1"))).not.toBeNull();
    await page.getByLabel("Primary hex color").fill("javascript:alert(1)");
    await page.getByRole("button", { name: "Apply locally" }).click();
    await expect(page.getByRole("status")).toContainText("six-digit colors");
  });

  test("uses a compact capability-first phone shell without persistent utilities", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const header = page.locator(".voice-open-nav");
    await expect(header.getByRole("link", { name: /ONE Voice Lab/ })).toBeVisible();
    await expect(header.locator(".one-identity-link")).toBeVisible();

    const primary = page.locator(".voice-open-nav__links");
    await expect(primary.getByRole("link")).toHaveCount(5);
    for (const name of ["Explore", "Compare", "Evaluate", "Build", "Learn"]) await expect(primary.getByRole("link", { name })).toBeVisible();
    const primaryBox = await page.locator(".voice-open-nav__links").boundingBox();
    expect(primaryBox?.y).toBeGreaterThan(760);

    await expect(page.locator(".one-global-utility-dock")).toBeHidden();
    await expect(page.getByRole("button", { name: "Pocket", exact: true })).toBeHidden();
    await expect(page.getByRole("button", { name: "Applied Voice Copilot", exact: true })).toBeHidden();

    const firstActions = [
      page.getByRole("link", { name: /^Turn speech into text/ }),
      page.getByRole("link", { name: /^Create speech from text/ }),
      page.getByRole("link", { name: /^Compare providers/ }),
      page.getByRole("link", { name: /^Evaluate voice outputs/ }),
    ];
    for (const action of firstActions) {
      await expect(action).toBeVisible();
      const box = await action.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    await expectNoHorizontalScroll(page, "home");

    await firstActions[0].click();
    await expect(page.getByRole("heading", { name: "Upload Audio", exact: true })).toBeVisible();
    await expectNoHorizontalScroll(page, "upload audio");

    for (const route of ["/simulation-lab", "/settings", "/build", "/learn"]) {
      await page.goto(route);
      await expectNoHorizontalScroll(page, route);
      await expect(page.getByRole("navigation", { name: /Primary|ONE Voice Lab/ }).first()).toBeVisible();
    }
  });

  test("keeps compact actions usable in phone landscape", async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto("/");

    const primary = page.locator(".voice-open-nav__links");
    await expect(primary.getByRole("link")).toHaveCount(5);
    const primaryBox = await page.locator(".voice-open-nav__links").boundingBox();
    expect(primaryBox?.y).toBeGreaterThan(320);

    await expect(page.locator(".one-global-utility-dock")).toBeHidden();
    await expect(page.getByRole("button", { name: "Pocket", exact: true })).toBeHidden();
    await expect(page.getByRole("button", { name: "Applied Voice Copilot", exact: true })).toBeHidden();
    for (const action of [
      page.getByRole("link", { name: /^Turn speech into text/ }),
      page.getByRole("link", { name: /^Create speech from text/ }),
      page.getByRole("link", { name: /^Compare providers/ }),
      page.getByRole("link", { name: /^Evaluate voice outputs/ }),
    ]) await expect(action).toBeVisible();
    await expectNoHorizontalScroll(page, "landscape");

    await page.getByRole("link", { name: /^Turn speech into text/ }).click();
    await expect(page).toHaveURL(/module=upload-audio/);
    await expectNoHorizontalScroll(page, "landscape upload audio");
  });

  test("shows one Understand, Design, Validate path without duplicate Build destinations", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/build");

    const guidedPath = page.locator(".voice-open-build-path");
    await expect(guidedPath.getByRole("heading", { name: "Understand → Design → Validate" })).toBeVisible();
    await expect(guidedPath.getByRole("link", { name: /Understand the need/ })).toHaveAttribute("href", "/pre-sales-studio");
    await expect(guidedPath.getByRole("link", { name: /Design the system/ })).toHaveAttribute("href", "/architecture-studio");
    await expect(guidedPath.getByRole("link", { name: /Validate and hand off/ })).toHaveAttribute("href", "/live-solution-studio");

    const hrefs = await page.locator(".voice-open-build-path a, .voice-open-build-tools a.voice-open-index-card").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect(new Set(hrefs).size).toBe(hrefs.length);

    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = "auto";
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    const finalPanelBox = await page.locator(".one-module-panel").last().boundingBox();
    const mobileNavBox = await page.locator(".voice-open-nav__links").boundingBox();
    expect(finalPanelBox && mobileNavBox ? finalPanelBox.y + finalPanelBox.height : Number.POSITIVE_INFINITY).toBeLessThanOrEqual(mobileNavBox?.y ?? 0);
  });
});

async function expectNoHorizontalScroll(page: Page, label: string) {
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(width.scroll, label).toBeLessThanOrEqual(width.client + 1);
}
