import { expect, test } from "@playwright/test";

import { captureDownload, readDownloadText } from "./helpers";

test.describe("Flux Conversation Observatory", () => {
  test("runs the deterministic turn-intelligence workflow without microphone, credential, or provider traffic", async ({ page }) => {
    const tokenRequests: string[] = [];
    const sockets: string[] = [];
    page.on("request", (request) => { if (request.url().includes("/api/deepgram/token")) tokenRequests.push(request.url()); });
    page.on("websocket", (socket) => { if (socket.url().includes("api.deepgram.com")) sockets.push(socket.url()); });
    await page.goto("/flux-observatory");

    await expect(page.getByRole("heading", { name: "Flux Conversation Observatory" })).toBeVisible();
    await expect(page.getByText("Synthetic fixture", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Manual validation required", { exact: true })).toBeVisible();
    await page.getByTestId("run-flux-fixture").click();
    const timeline = page.getByTestId("flux-timeline");
    await expect(timeline).toContainText("StartOfTurn");
    await expect(timeline).toContainText("EagerEndOfTurn");
    await expect(timeline).toContainText("TurnResumed");
    await expect(timeline).toContainText("EndOfTurn");
    await expect(page.getByText(/Synthetic fixture.*not a live Deepgram result/i).first()).toBeVisible();

    await page.getByRole("button", { name: "Apply settings" }).click();
    await expect(page.getByText("provider-acknowledged", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Generate scorecard" }).click();
    const markdownDownload = await captureDownload(page, () => page.getByRole("button", { name: "Download Markdown" }).click());
    const markdown = await readDownloadText(markdownDownload);
    expect(markdown).toContain("Flux POC scorecard");
    expect(markdown).not.toContain("I need to change my booking");
    expect(markdown).not.toMatch(/Authorization:\s*(?:Bearer|Token)|Bearer\s+[A-Za-z0-9._-]{8,}|dg_[A-Za-z0-9]/i);
    expect(markdown).toContain("No credentials, authorization headers, raw microphone audio, or transcripts");

    await page.getByRole("button", { name: "Generate architecture" }).click();
    await expect(page.getByText("Validated", { exact: true }).last()).toBeVisible();
    const mermaidDownload = await captureDownload(page, () => page.getByRole("button", { name: "Download .mmd" }).click());
    const mermaid = await readDownloadText(mermaidDownload);
    expect(mermaid).toContain("Flux /v2/listen");
    expect(mermaid).not.toContain("/v1/listen");
    const svgDownload = await captureDownload(page, () => page.getByRole("button", { name: "Download SVG" }).click());
    expect(await readDownloadText(svgDownload)).toContain("<svg");
    expect(tokenRequests).toEqual([]);
    expect(sockets).toEqual([]);
  });

  test("keeps configuration failure and unknown provider evidence inspectable", async ({ page }) => {
    await page.goto("/flux-observatory");
    await page.getByLabel("Replay scenario").selectOption("dynamic-configuration-failure");
    await page.getByTestId("run-flux-fixture").click();
    await expect(page.getByText("provider-rejected", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Configure rejected.*Synthetic rejection for reducer validation/i })).toBeVisible();
    await page.getByLabel("Replay scenario").selectOption("unknown-future-event");
    await page.getByTestId("run-flux-fixture").click();
    await expect(page.getByTestId("flux-timeline")).toContainText("Unknown provider message · FutureTurnSignal");
    await expect(page.getByText("Unknown events", { exact: true }).locator("..")).toContainText("1");
  });

  test("requires a visible microphone consent step and makes no request when cancelled", async ({ page }) => {
    let tokenRequests = 0;
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: () => { throw new Error("must not run before confirmation"); } } });
    });
    page.on("request", (request) => { if (request.url().includes("/api/deepgram/token")) tokenRequests += 1; });
    await page.goto("/flux-observatory");
    await page.getByRole("button", { name: "Live Provider" }).click();
    await expect(page.getByRole("button", { name: "Start provider session" })).toBeDisabled();
    await page.getByRole("button", { name: "Prepare microphone" }).click();
    const dialog = page.getByRole("dialog", { name: "Allow this browser to prepare the microphone?" });
    await expect(dialog).toContainText("does not start the provider");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    expect(tokenRequests).toBe(0);
  });

  test("hands sanitized evidence into the canonical Live Solution Case", async ({ page }) => {
    await page.goto("/flux-observatory");
    await page.getByTestId("run-flux-fixture").click();
    await page.getByRole("button", { name: "Send to Live Solution" }).click();
    await expect(page).toHaveURL(/\/live-solution-studio\?source=flux-observatory/);
    await expect(page.getByText(/Flux Observatory evidence applied to the active versioned case/i)).toBeVisible();
    await page.getByRole("button", { name: "Evidence & Decision Ledger" }).click();
    await expect(page.getByText("Flux Observatory configuration and architecture evidence", { exact: true })).toBeVisible();
    const stored = await page.evaluate(() => localStorage.getItem("deepgram-live-solution-studio:session:v1") ?? "");
    expect(stored).not.toContain("I need to change my booking");
    expect(stored).not.toMatch(/Authorization:\s*(?:Bearer|Token)|Bearer\s+[A-Za-z0-9._-]{8,}|dg_[A-Za-z0-9]/i);
  });

  test("routes Deliverables handoff through the canonical versioned case", async ({ page }) => {
    await page.goto("/flux-observatory");
    await page.getByTestId("run-flux-fixture").click();
    await page.getByRole("button", { name: "Send to Deliverables" }).click();
    await expect(page).toHaveURL(/\/deliverables\?source=flux-observatory/);
    await expect(page.getByRole("heading", { name: "Solution Deliverables Studio" })).toBeVisible();
    const stored = await page.evaluate(() => localStorage.getItem("deepgram-live-solution-studio:session:v1") ?? "");
    expect(stored).toContain("Flux Observatory configuration and architecture evidence");
    expect(stored).not.toContain("I need to change my booking");
    expect(stored).not.toMatch(/Authorization:\s*(?:Bearer|Token)|Bearer\s+[A-Za-z0-9._-]{8,}|dg_[A-Za-z0-9]/i);
  });

  test("remains usable on a Pocket-sized viewport without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/flux-observatory");
    await page.getByTestId("run-flux-fixture").click();
    const widths = await page.evaluate(() => ({ page: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), viewport: window.innerWidth }));
    expect(widths.page).toBeLessThanOrEqual(widths.viewport + 1);
    await expect(page.getByRole("heading", { name: "Flux Conversation Observatory" })).toBeVisible();
    await expect(page.getByText("Turn intelligence", { exact: true })).toBeVisible();
  });
});
