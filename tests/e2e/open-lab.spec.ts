import { expect, test } from "@playwright/test";

const CONTROL_ROOM_MODULES = [
  ["overview", "Overview"],
  ["lab-evolution", "Lab Evolution"],
  ["connection", "Connection Check"],
  ["transcribe-url", "Transcribe URL"],
  ["upload-audio", "Upload Audio"],
  ["live-mic", "Live Mic"],
  ["tts", "Text to Speech"],
  ["flux-tts", "Flux TTS Studio"],
  ["trusted-voice", "Trusted Voice"],
  ["sample-library", "Sample Library"],
  ["language-explorer", "Language Explorer"],
  ["redaction-lab", "Redaction Lab"],
  ["audio-signal-lab", "Audio Signal Lab"],
  ["api-studio", "API Studio"],
  ["applied-voice-systems", "Applied Voice Systems"],
  ["applied-engineering-questline", "Applied Engineering Questline"],
  ["live-observatory", "Live Observatory Lab"],
  ["code-lab", "Code Lab"],
] as const;

test.describe("@open-lab public shell", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.config.metadata.openLab !== true, "Open Lab coverage uses its isolated public-mode server.");
  });

  test("opens without account or visitor credentials and keeps server material out of the browser", async ({ page }) => {
    await page.goto("/");

    const status = page.getByRole("complementary", { name: "Open Lab status" });
    await expect(status).toBeVisible();
    await expect(status).toContainText("OPEN LAB");
    await expect(status).toContainText("Shared live Deepgram project");
    await expect(status).toContainText("Do not submit confidential or regulated information");
    await expect(page.getByText("Shared live Deepgram project", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Talk/ })).toBeVisible();
    await expect(page.getByText("API Key Missing", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel(/Deepgram API key/i)).toHaveCount(0);

    const browserEvidence = await page.evaluate(() => ({
      html: document.documentElement.innerHTML,
      local: JSON.stringify(localStorage),
      session: JSON.stringify(sessionStorage),
      cookies: document.cookie,
    }));
    for (const value of Object.values(browserEvidence)) {
      expect(value).not.toContain("open-lab-e2e-server-key");
      expect(value.toLowerCase()).not.toContain("authorization: bearer");
    }
  });

  test("hydrates the public shell without timezone-dependent text mismatches", async ({ browser, baseURL }) => {
    expect(baseURL).toBeTruthy();
    const context = await browser.newContext({ timezoneId: "Pacific/Honolulu" });
    const page = await context.newPage();
    const browserErrors: string[] = [];

    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });

    try {
      await page.goto(baseURL!);
      await expect(page.getByRole("heading", { name: "ONE Voice Lab", exact: true }).first()).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-keyboard-shortcuts-ready", "true");
      await page.waitForTimeout(100);
      expect(browserErrors.filter((message) => /hydration|server rendered text|react error #418/i.test(message))).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("navigates every implemented control-room module with one explicit action", async ({ page }) => {
    let sampleMetadataRequests = 0;
    await page.route("**/api/deepgram/sample-audio", async (route) => {
      sampleMetadataRequests += 1;
      await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
    });
    await page.goto("/");
    for (const [moduleId, label] of CONTROL_ROOM_MODULES) {
      await page.goto(`/?module=${moduleId}`);
      if (moduleId === "overview") await expect(page.getByRole("heading", { name: "ONE Voice Lab", exact: true })).toBeVisible();
      else await expect(page.locator(".one-control-room-module-header > div:first-child h1")).toHaveText(label);
    }
    expect(sampleMetadataRequests).toBe(0);
  });

  test("keeps the Flux workspace usable at 390px and supports keyboard module activation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?module=flux-tts");

    const workspace = page.locator(".one-control-room-workspace");
    const navigation = page.getByRole("navigation", { name: "Lab modules" });
    await expect(page.getByTestId("flux-tts-studio")).toBeVisible();
    await expect(workspace).toBeVisible();
    await expect(navigation).toBeVisible();

    const layout = await page.evaluate(() => {
      const workspaceBox = document.querySelector<HTMLElement>(".one-control-room-workspace")?.getBoundingClientRect();
      return {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        workspaceWidth: workspaceBox?.width ?? 0,
      };
    });
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
    expect(layout.workspaceWidth).toBeGreaterThanOrEqual(360);

    await page.keyboard.press("h");
    const liveMic = page.getByRole("button", { name: /^Talk/ });
    await liveMic.focus(); await page.keyboard.press("Enter");
    await expect(page.locator(".one-control-room-module-header > div:first-child h1")).toHaveText("Live Mic");
  });

  test("keeps the Open Lab workspace contained at a tablet viewport", async ({ page }) => {
    await page.setViewportSize({ width: 834, height: 1_112 });
    await page.goto("/?module=api-studio");

    await expect(page.locator(".one-control-room-module-header > div:first-child h1")).toHaveText("API Studio");
    await expect(page.getByRole("navigation", { name: "Lab modules" })).toBeVisible();
    await expect(page.locator(".one-control-room-workspace")).toBeVisible();

    const widths = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
  });

  test("keeps standalone implemented studios publicly reachable", async ({ page }) => {
    const routes = [
      ["/live-solution-studio", "Live Solution Studio"],
      ["/architecture-studio", "Deepgram Voice Architecture Studio"],
      ["/pre-sales-studio", "Deepgram Pre-Sales Solution Studio"],
      ["/deliverables", "Solution Deliverables Studio"],
    ] as const;

    for (const [route, heading] of routes) {
      await page.goto(route);
      await expect(page.locator("main").first(), heading).toBeVisible();
      await expect(page.locator("body"), heading).not.toContainText("recoverable error");
      await expect(page.getByRole("complementary", { name: "Open Lab status" })).toBeVisible();
    }
  });

  test("enforces project, model, destination, and callback policy at public routes", async ({ request }) => {
    const attempts = [
      request.post("/api/deepgram/execute", {
        data: { endpointId: "agent-variables-list", path: { project_id: "project-fixture" } },
      }),
      request.post("/api/deepgram/tts", {
        data: { text: "Safe fixture text.", model: "custom-private-model" },
      }),
      request.post("/api/deepgram/transcribe-url", {
        data: { url: "http://127.0.0.1/private.wav", model: "nova-3", language: "en" },
      }),
      request.post("/api/deepgram/execute", {
        data: {
          endpointId: "tts-rest",
          query: { model: "aura-2-thalia-en", encoding: "mp3", callback: "https://callback.example/hook" },
          body: { text: "Fixture" },
        },
      }),
    ];

    const responses = await Promise.all(attempts);
    expect(responses.map((response) => response.status())).toEqual([403, 400, 503, 400]);
    for (const response of responses) {
      const body = await response.text();
      expect(body).not.toContain("open-lab-e2e-server-key");
      expect(body).not.toMatch(/Authorization\s*:\s*(?:Token|Bearer)\s+(?!\*\*\*redacted)/i);
    }
  });
});
