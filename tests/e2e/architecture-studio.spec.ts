import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.config.metadata.studio !== "architecture", "Architecture coverage uses its dedicated 1440px studio config.");
});

test.describe("@architecture-studio local collaborative fallback", () => {
  test("creates, joins, synchronizes, and reveals progressive discovery", async ({ page, context }) => {
    await page.goto("/architecture-studio");
    await expect(page.getByRole("heading", { name: /Design the right voice architecture/i })).toBeVisible();
    await page.getByRole("button", { name: "Create presenter session" }).click();
    await expect(page).toHaveURL(/\/architecture-studio\/session\/[A-Z2-9]{6}\/presenter$/);
    expect(page.url()).not.toContain("token=");
    await expect(page.getByText("Presenter console", { exact: true })).toBeVisible();
    await expect(page.getByText("Local Demo Mode", { exact: true })).toBeVisible();

    const code = page.url().match(/session\/([A-Z2-9]{6})\/presenter/)?.[1];
    expect(code).toBeTruthy();
    const participant = await context.newPage();
    await participant.goto(`/architecture-studio/session/${code}`);
    await expect(participant.getByRole("heading", { name: /Join Northstar/i })).toBeVisible();
    await participant.getByRole("textbox", { name: /Display name/i }).fill("Voice Engineer");
    await participant.getByRole("button", { name: /Voice Platform Engineer/i }).click();
    await participant.getByRole("button", { name: "Join shared session" }).click();
    await expect(participant.getByText("Voice Engineer", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Voice Engineer", { exact: true }).first()).toBeVisible();

    await expect(participant.getByRole("heading", { name: /What fictional company/i })).toBeVisible();
    await participant.getByRole("textbox", { name: "Fictional company" }).fill("Northstar Contact Cloud");
    await participant.getByRole("button", { name: "Share answer" }).click();
    await expect(participant.getByText(/Contribution saved/i)).toBeVisible();

    await page.getByRole("button", { name: "Reveal to participants" }).click();
    await expect(participant.getByRole("heading", { name: /Which customer experience problem/i })).toBeVisible();
    await participant.getByRole("button", { name: /Slow response or latency/i }).click();
    await participant.getByRole("button", { name: /Poor interruption handling/i }).click();
    await participant.getByRole("button", { name: "Share answer" }).click();
    await expect(page.getByText(/Slow response or latency/i).last()).toBeVisible();
    await expect(participant.getByRole("button", { name: "Reset" })).toHaveCount(0);
    await expect(participant.getByRole("button", { name: "Delete now" })).toHaveCount(0);

    await page.getByRole("button", { name: /Pause section · shared/i }).first().click();
    await expect(participant.getByText("Section paused", { exact: true }).first()).toBeVisible();
    await expect(participant.getByRole("button", { name: "Section paused" })).toBeDisabled();
    await page.getByRole("button", { name: /Reopen section · shared/i }).first().click();
    await expect(participant.getByRole("button", { name: "Update answer" })).toBeEnabled();

    await page.getByRole("tab", { name: "Proposed Architecture" }).click();
    await expect(page.getByRole("heading", { name: /Evaluation-first architecture decision/i }).first()).toBeVisible();
    const labPagePromise = context.waitForEvent("page");
    await page.getByRole("link", { name: /Launch relevant lab/i }).first().click();
    const labPage = await labPagePromise;
    await labPage.waitForLoadState("domcontentloaded");
    await expect(labPage).toHaveURL(/\?module=(live-mic|api-studio)/);
    await labPage.close();
    await expect(page.getByText("Presenter console", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: "Solution brief" }).click();
    await page.getByRole("button", { name: "Generate solution brief" }).click();
    await expect(page.getByRole("heading", { name: "Customer objective" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Evaluation plan" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Technical topology" })).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download JSON" }).click();
    const download = await downloadPromise;
    const downloadedBrief = JSON.parse(await readFile(await download.path() as string, "utf8")) as { technicalTopology?: { nodes?: unknown[] } };
    expect(downloadedBrief.technicalTopology?.nodes?.length).toBeGreaterThan(0);
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("heading", { name: "Solution brief" })).toBeVisible();
    await expect(page.locator("header").first()).toBeHidden();
    await page.emulateMedia({ media: "screen" });

    const unauthorized = await context.newPage();
    await unauthorized.goto(`/architecture-studio/session/${code}/presenter?token=wrong-token`);
    await expect(unauthorized.getByRole("heading", { name: "Presenter link not authorized" })).toBeVisible();
    await unauthorized.close();

    const health = await page.request.get("/api/health");
    expect(health.ok()).toBe(true);
    expect((await health.json()).architectureStudio.mode).toBe("local-demo");

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Delete now" }).click();
    await expect(page).toHaveURL(/\/architecture-studio$/);
    await expect(participant.getByRole("heading", { name: "Session unavailable" })).toBeVisible();
  });

  test("runs the Meridian package evidence and editable architecture flow", async ({ page }) => {
    await page.goto("/architecture-studio");
    await page.getByRole("button", { name: /Meridian Contact Cloud/i }).click();
    await page.getByRole("button", { name: "Create presenter session" }).click();
    await expect(page.getByText(/Meridian Contact Cloud · shared workshop/i)).toBeVisible();

    await page.getByRole("tab", { name: "Proposed Architecture" }).click();
    await expect(page.getByRole("heading", { name: "Edit the proposed architecture" })).toBeVisible();
    await page.getByLabel("Architecture module to add").selectOption({ label: "Storage / analytics" });
    await page.getByRole("button", { name: "Add module" }).click();
    const storageCard = page.locator("article").filter({ hasText: "Storage / analytics" });
    await expect(storageCard.getByText("Operator override", { exact: true })).toBeVisible();
    await storageCard.getByRole("button", { name: "Accepted" }).click();
    await storageCard.getByRole("textbox", { name: "Operator note" }).fill("Keep governed evaluation artifacts.");
    await storageCard.getByRole("button", { name: "Save note" }).click();

    await page.reload();
    await page.getByRole("tab", { name: "Proposed Architecture" }).click();
    const persistedStorage = page.locator("article").filter({ hasText: "Storage / analytics" });
    await expect(persistedStorage.getByText("Operator override", { exact: true })).toBeVisible();
    await expect(persistedStorage.getByRole("textbox", { name: "Operator note" })).toHaveValue("Keep governed evaluation artifacts.");
    await persistedStorage.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByRole("button", { name: "Restore Storage / analytics" })).toBeVisible();
    await page.getByRole("button", { name: "Restore Storage / analytics" }).click();
    await expect(page.locator("article").filter({ hasText: "Storage / analytics" })).toHaveCount(0);

    await page.getByRole("tab", { name: "Recommendation Evidence" }).click();
    await expect(page.getByRole("heading", { name: "Recommendation evidence" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Flux conversational speech recognition" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Assumptions and open questions" })).toBeVisible();
    await expect(page.getByText("Concurrency needs measurement", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Validation plan" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Turn-taking and interruption" })).toBeVisible();
  });

  test("completes the Meridian diagnostic-to-executive handoff flow", async ({ page }) => {
    await page.goto("/architecture-studio");
    await page.getByRole("button", { name: /Meridian Contact Cloud/i }).click();
    await page.getByRole("button", { name: "Create presenter session" }).click();

    await page.getByRole("tab", { name: "Failure Diagnostics" }).click();
    await expect(page.getByRole("heading", { name: "Inspect, adapt, diagnose, and recover" })).toBeVisible();
    await page.getByRole("button", { name: "Delayed voice-agent response" }).click();
    await expect(page.getByText(/Guided demo · step 1 of 8/i)).toBeVisible();
    await page.getByRole("button", { name: "Inject simulated failure" }).click();
    await expect(page.getByText("Simulated failure active", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Delayed end-of-turn detection" })).toBeVisible();

    await page.getByRole("tab", { name: "Diagnostic sequence" }).click();
    await expect(page.getByRole("heading", { name: /0 of 10 checks completed/i })).toBeVisible();
    const turnHypothesis = page.locator("details").filter({ hasText: "Turn detection timing" }).first();
    await turnHypothesis.locator("summary").click();
    await turnHypothesis.getByRole("button", { name: "Investigate" }).click();

    await page.getByRole("tab", { name: "Mitigation + summary" }).click();
    await page.getByRole("button", { name: "Select", exact: true }).first().click();
    await page.getByLabel("Result").selectOption("mitigated");
    await page.getByLabel("Evidence").fill("Synthetic stage timestamps narrowed the delay to the downstream boundary.");
    await page.getByRole("button", { name: "Save validation result" }).click();
    await page.getByRole("button", { name: "Generate summary" }).click();
    await expect(page.getByText("Synthetic stage timestamps narrowed the delay to the downstream boundary.")).toBeVisible();

    await page.getByRole("tab", { name: "Executive Handoff" }).click();
    await expect(page.getByRole("heading", { name: "Meridian Contact Cloud", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Selected mitigation" })).toBeVisible();
    await page.getByRole("button", { name: "Technical", exact: true }).click();
    await expect(page.getByText(/Executive handoff · technical/i)).toBeVisible();
    await page.getByRole("button", { name: "POC Plan" }).click();
    await expect(page.getByRole("heading", { name: "Acceptance criteria" })).toBeVisible();
    await page.getByRole("button", { name: "Decisions + Actions" }).click();
    await expect(page.getByRole("heading", { name: "Next-action register" })).toBeVisible();
    await page.getByRole("button", { name: "Rehearsal" }).click();
    await page.getByRole("button", { name: "5 minutes", exact: true }).click();
    await expect(page.getByText(/Operator-only rehearsal mode/i)).toBeVisible();
    await page.getByRole("button", { name: "15 minutes", exact: true }).click();
    await expect(page.getByRole("button", { name: /Failure injection/i })).toBeVisible();

    await page.getByRole("button", { name: "Share + Export" }).click();
    await page.getByRole("button", { name: "Run local preflight" }).click();
    await expect(page.getByText("Ready · Local persistence", { exact: true })).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download JSON" }).click();
    const download = await downloadPromise;
    const exported = JSON.parse(await readFile(await download.path() as string, "utf8")) as { syntheticData?: boolean; operatorNotesIncluded?: boolean; session?: { architectureSimulation?: { incidentSummary?: unknown } } };
    expect(exported.syntheticData).toBe(true);
    expect(exported.operatorNotesIncluded).toBe(false);
    expect(exported.session?.architectureSimulation?.incidentSummary).toBeTruthy();

    await page.reload();
    await page.getByRole("tab", { name: "Executive Handoff" }).click();
    await page.getByRole("button", { name: "Executive Summary", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Meridian Contact Cloud" })).toBeVisible();
  });

  test("renders error-free desktop and mobile presentation views with keyboard navigation", async ({ page }, testInfo) => {
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });

    await page.goto("/architecture-studio");
    await page.getByRole("button", { name: /Meridian Contact Cloud/i }).click();
    await page.getByRole("button", { name: "Create presenter session" }).click();
    await page.getByRole("tab", { name: "Executive Handoff" }).click();
    await page.getByRole("button", { name: "Present full screen" }).click();
    await expect(page.getByRole("button", { name: "Exit presentation" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Rehearsal" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Share + Export" })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("architecture-studio-presentation-desktop.png"), fullPage: true });

    await page.keyboard.press("ArrowRight");
    await expect(page.getByText("Proposed / approved technical handoff", { exact: true })).toBeVisible();
    await expect(page.locator("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay")).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Executive Summary", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Meridian Contact Cloud", exact: true })).toBeVisible();
    const mobileWidth = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
      offenders: Array.from(document.querySelectorAll<HTMLElement>("body *")).filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 8).map((element) => ({ tag: element.tagName, className: element.className, text: element.innerText?.slice(0, 80) })),
    }));
    expect(mobileWidth.scroll, JSON.stringify(mobileWidth.offenders)).toBeLessThanOrEqual(mobileWidth.client + 1);
    await page.screenshot({ path: testInfo.outputPath("architecture-studio-presentation-mobile.png"), fullPage: true });
    expect(browserErrors).toEqual([]);
  });

  test("keeps both entry and participant workspaces readable at a mobile width", async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/architecture-studio");
    await expect(page.getByRole("heading", { name: /Design the right voice architecture/i })).toBeVisible();
    const entryWidth = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(entryWidth.scroll).toBeLessThanOrEqual(entryWidth.client + 1);
    await page.getByRole("button", { name: "Create presenter session" }).click();
    await expect(page).toHaveURL(/\/architecture-studio\/session\/[A-Z2-9]{6}\/presenter$/);
    expect(page.url()).not.toContain("token=");
    const code = page.url().match(/session\/([A-Z2-9]{6})\/presenter/)?.[1];
    expect(code).toBeTruthy();
    const participant = await context.newPage();
    await participant.setViewportSize({ width: 390, height: 844 });
    await participant.goto("/architecture-studio");
    await participant.getByLabel("Session code").fill(code as string);
    await participant.getByRole("button", { name: "Join", exact: true }).click();
    await expect(participant).toHaveURL(new RegExp(`/architecture-studio/session/${code}$`));
    await participant.getByRole("button", { name: /Security & Infrastructure Lead/i }).click();
    await participant.getByRole("button", { name: "Join shared session" }).click();
    await expect(participant.getByText("Participant view", { exact: true })).toBeVisible();
    const workspaceWidth = await participant.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(workspaceWidth.scroll).toBeLessThanOrEqual(workspaceWidth.client + 1);
  });

  test("expires local sessions without leaving the presenter console loading forever", async ({ page }) => {
    await page.goto("/architecture-studio");
    await page.getByRole("button", { name: "Create presenter session" }).click();
    await expect(page.getByText("Presenter console", { exact: true })).toBeVisible();
    const code = page.url().match(/session\/([A-Z2-9]{6})\/presenter/)?.[1];
    expect(code).toBeTruthy();
    await page.evaluate((sessionCode) => {
      const key = `deepgram-architecture-studio:session:${sessionCode}`;
      const value = JSON.parse(window.localStorage.getItem(key) ?? "null");
      value.expiresAt = new Date(Date.now() - 1_000).toISOString();
      window.localStorage.setItem(key, JSON.stringify(value));
    }, code);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Session unavailable" })).toBeVisible();
  });
});
