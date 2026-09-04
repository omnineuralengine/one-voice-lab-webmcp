import { expect, test, type Page, type Route } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.describe("@flux-tts-studio batch Open Lab flow", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.config.metadata.openLab !== true, "Flux Open Lab coverage uses its isolated public-mode server.");
    test.skip(Boolean(testInfo.project.name) && testInfo.project.name !== "chromium-1440x900", "Flux interaction coverage runs once.");
    await page.goto("/?module=flux-tts");
    await expect(page.getByTestId("flux-tts-studio")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-keyboard-shortcuts-ready", "true");
  });

  test("renders the policy-filtered gallery and keeps streaming visibly gated", async ({ page }) => {
    await expect(page.getByTestId("flux-tts-studio").getByRole("heading", { name: "Flux TTS Studio", exact: true })).toBeVisible();
    await expect(page.getByTestId("flux-tts-studio").getByText("Voice-agent-first synthesis over /v2/speak", { exact: true })).toBeVisible();
    await expect(page.getByText("Connor's Picks", { exact: true })).toBeVisible();
    await expect(page.locator("[data-model='flux-cole-en']").first()).toBeVisible();
    await expect(page.locator("[data-model='flux-jack-en']").first()).toBeVisible();
    await expect(page.locator("[data-model='flux-conor-en']")).toHaveCount(0);
    await expect(page.locator("[data-model='flux-renee-en']")).toHaveCount(0);
    await expect(page.getByRole("option", { name: "Streaming · verification required" })).toHaveAttribute("disabled", "");
    await expect(page.getByText(/does not imitate streaming with delayed batch audio/)).toBeVisible();
  });

  test("generates mocked batch audio with a sanitized inspector and trace", async ({ page }) => {
    const requests: Array<Record<string, unknown>> = [];
    await page.route("**/api/deepgram/flux-tts", async (route) => fulfillAudio(route, requests));
    await page.getByTestId("flux-text").fill("A safe public fixture sentence.");
    await page.getByTestId("flux-voice-select").selectOption("flux-jack-en");
    await page.getByTestId("flux-generate").click();

    await expect(page.getByTestId("flux-result-flux-jack-en")).toBeVisible();
    await expect(page.getByText("fixture-flux-request-001", { exact: true })).toBeVisible();
    await expect(page.getByText("audio/mpeg", { exact: true })).toBeVisible();
    expect(requests).toEqual([{ text: "A safe public fixture sentence.", model: "flux-jack-en", encoding: "mp3" }]);

    const sanitized = page.getByTestId("flux-sanitized-request");
    await expect(sanitized).toContainText("***not recorded***");
    await expect(sanitized).not.toContainText("A safe public fixture sentence.");
    const code = page.getByTestId("flux-generated-code");
    await expect(code).toContainText("$DEEPGRAM_API_KEY");
    await expect(code).not.toContainText("Authorization");

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("flux-export-trace").click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).toBeTruthy();
    const trace = await readFile(path!, "utf8");
    expect(trace).toContain("fixture-flux-request-001");
    expect(trace).toContain("***not recorded***");
    expect(trace).not.toContain("A safe public fixture sentence.");
    expect(trace.toLowerCase()).not.toContain("authorization");
  });

  test("runs Cole and Jack from one explicit A/B action, then stops and clears", async ({ page }) => {
    const requests: Array<Record<string, unknown>> = [];
    await page.route("**/api/deepgram/flux-tts", async (route) => fulfillAudio(route, requests));
    const comparisonInput = page.getByTestId("flux-text");
    await comparisonInput.fill("");
    await comparisonInput.fill("Use exactly this comparison input.");
    await expect(comparisonInput).toHaveValue("Use exactly this comparison input.");
    await expect(page.getByTestId("flux-same-input-lock")).toBeChecked();
    await page.getByTestId("flux-ab-compare").click();
    await expect(page.getByTestId("flux-result-flux-cole-en")).toBeVisible();
    await expect(page.getByTestId("flux-result-flux-jack-en")).toBeVisible();
    expect(requests.map((request) => request.model)).toEqual(["flux-cole-en", "flux-jack-en"]);
    expect(requests.map((request) => request.text)).toEqual(["Use exactly this comparison input.", "Use exactly this comparison input."]);

    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await page.getByTestId("flux-clear").click();
    await expect(page.getByTestId("flux-text")).toHaveValue("");
    await expect(page.getByTestId("flux-flight-recorder")).toContainText("Run a batch request");
    await expect(page.locator("[data-testid^='flux-result-']")).toHaveCount(0);
  });

  test("clear prevents a stale response from replacing a newer run", async ({ page }) => {
    await installDeferredFluxFetch(page);

    await page.getByTestId("flux-text").fill("First request that will become stale.");
    await page.getByTestId("flux-generate").click();
    await expect.poll(() => deferredFluxRequestCount(page)).toBe(1);

    await page.getByTestId("flux-clear").click();
    await page.getByTestId("flux-text").fill("Second request that stays current.");
    await page.getByTestId("flux-voice-select").selectOption("flux-jack-en");
    await page.getByTestId("flux-generate").click();
    await expect.poll(() => deferredFluxRequestCount(page)).toBe(2);

    await resolveDeferredFluxRequest(page, 0, "stale-request-001");
    await expect(page.getByTestId("flux-generate")).toHaveText("Generating…");
    await expect(page.getByTestId("flux-generate")).toBeDisabled();
    await expect(page.getByText("stale-request-001", { exact: true })).toHaveCount(0);
    await expect(page.locator("[data-testid^='flux-result-']")).toHaveCount(0);

    await resolveDeferredFluxRequest(page, 1, "current-request-002");
    await expect(page.getByText("current-request-002", { exact: true })).toBeVisible();
    await expect(page.getByText("stale-request-001", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("flux-result-flux-jack-en")).toBeVisible();
    await expect(page.getByTestId("flux-result-flux-cole-en")).toHaveCount(0);
  });

  test("shows the provider-disabled response without hiding educational tools", async ({ page }) => {
    await page.route("**/api/deepgram/flux-tts", (route) => route.fulfill({
      status: 503,
      contentType: "application/json",
      headers: { "Cache-Control": "no-store" },
      body: JSON.stringify({ ok: false, error: { code: "open_lab_provider_disabled", message: "Live Deepgram execution is disabled. Educational tools remain available." } }),
    }));
    await page.getByTestId("flux-generate").click();
    await expect(page.getByText("Live Deepgram execution is disabled. Educational tools remain available.", { exact: true })).toBeVisible();
    await expect(page.getByText("Voice gallery", { exact: true })).toBeVisible();
    await expect(page.getByTestId("flux-generated-code")).toBeVisible();
  });

  test("records a sanitized request ID for failed provider responses", async ({ page }) => {
    await page.route("**/api/deepgram/flux-tts", (route) => route.fulfill({
      status: 502,
      contentType: "application/json",
      headers: { "Cache-Control": "no-store", "dg-request-id": "fixture-failed-request-001" },
      body: JSON.stringify({
        ok: false,
        error: {
          code: "provider_authorization_failed",
          message: "The server could not authorize Flux TTS with Deepgram.",
          requestId: "fixture-failed-request-001",
        },
      }),
    }));

    await page.getByTestId("flux-generate").click();
    await expect(page.getByTestId("flux-tts-studio").getByRole("alert")).toContainText("could not authorize Flux TTS");
    await expect(page.getByTestId("flux-flight-recorder")).toContainText("fixture-failed-request-001");
    await expect(page.getByTestId("flux-flight-recorder")).not.toContainText("Authorization");
  });
});

async function fulfillAudio(route: Route, requests: Array<Record<string, unknown>>) {
  requests.push(route.request().postDataJSON() as Record<string, unknown>);
  await route.fulfill({
    status: 200,
    contentType: "audio/mpeg",
    headers: { "Cache-Control": "no-store", "dg-request-id": "fixture-flux-request-001" },
    body: Buffer.from("ID3fixture-audio"),
  });
}

async function installDeferredFluxFetch(page: Page) {
  await page.evaluate(() => {
    type DeferredRequest = { resolve: (response: Response) => void };
    const state = window as typeof window & { __fluxDeferredRequests?: DeferredRequest[] };
    state.__fluxDeferredRequests = [];
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (String(input).includes("/api/deepgram/flux-tts")) {
        return new Promise<Response>((resolve) => {
          state.__fluxDeferredRequests?.push({ resolve });
        });
      }
      return nativeFetch(input, init);
    };
  });
}

async function deferredFluxRequestCount(page: Page) {
  return page.evaluate(() => {
    const state = window as typeof window & { __fluxDeferredRequests?: unknown[] };
    return state.__fluxDeferredRequests?.length ?? 0;
  });
}

async function resolveDeferredFluxRequest(page: Page, index: number, requestId: string) {
  await page.evaluate(({ index, requestId }) => {
    type DeferredRequest = { resolve: (response: Response) => void };
    const state = window as typeof window & { __fluxDeferredRequests?: DeferredRequest[] };
    state.__fluxDeferredRequests?.[index]?.resolve(new Response(new Blob(["ID3fixture-audio"], { type: "audio/mpeg" }), {
      status: 200,
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "dg-request-id": requestId },
    }));
  }, { index, requestId });
}
