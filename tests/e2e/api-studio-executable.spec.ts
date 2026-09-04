import { expect, test } from "@playwright/test";

import { openApiStudio } from "./helpers";

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-1440x900", "API Studio interaction coverage runs once at the scripted viewport.");
});

test.describe("@api-studio executable console", () => {
  test("renders the registry workbench and transitions through validation and a fixture response", async ({ page }) => {
    await page.route("**/api/deepgram/execute", async (route) => {
      const request = route.request();
      const payload = request.postDataJSON() as { endpointId: string };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          status: 200,
          requestId: "fixture-request-id",
          timing: { totalMs: 12.3 },
          request: { endpointId: payload.endpointId, method: "GET", protocol: "https", sanitizedUrl: "https://api.deepgram.com/v1/models", headers: { Authorization: "Configured (server only)" }, body: null },
          response: { headers: { "dg-request-id": "fixture-request-id" }, body: { models: [{ name: "fixture-model" }] } },
        }),
      });
    });

    await openApiStudio(page);
    await expect(page.getByTestId("api-studio-executable")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Deepgram API navigation" })).toBeVisible();
    await page.getByRole("button", { name: /List Public Models/ }).click();
    await expect(page.getByText("Fixture-verified", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Validate" }).click();
    await expect(page.getByRole("status")).toContainText("valid");
    await page.getByRole("button", { name: "Run Request" }).click();
    await expect(page.getByText("fixture-request-id")).toBeVisible();
    await page.getByRole("tab", { name: "Response", exact: true }).click();
    await expect(page.getByText("fixture-model")).toBeVisible();
  });

  test("shows mutation impact and keeps advanced execution disabled", async ({ page }) => {
    await openApiStudio(page);
    await page.getByRole("button", { name: /Delete Key/ }).click();
    await expect(page.getByText("Locked by design", { exact: true })).toBeVisible();
    await expect(page.getByText("Advanced mutation locked")).toBeVisible();
    await expect(page.getByRole("button", { name: "Run Request" })).toBeDisabled();
    await expect(page.getByText(/Immediately revokes the key/)).toBeVisible();
  });

  test("runs the streaming TTS browser state machine with a temporary-token fixture", async ({ page }) => {
    await page.route("**/api/deepgram/token", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: "fixture-temporary-token", expires_in: 60 }) }));
    await openApiStudio(page);
    await page.evaluate(() => {
      class FixtureWebSocket {
        static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
        readyState = FixtureWebSocket.CONNECTING;
        binaryType = "blob";
        onopen: ((event: Event) => void) | null = null;
        onmessage: ((event: MessageEvent) => void) | null = null;
        onerror: ((event: Event) => void) | null = null;
        onclose: ((event: CloseEvent) => void) | null = null;
        constructor(public url: string, public protocols?: string | string[]) {
          window.setTimeout(() => { this.readyState = FixtureWebSocket.OPEN; this.onopen?.(new Event("open")); }, 0);
        }
        send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
          if (typeof data !== "string") return;
          const message = JSON.parse(data) as { type?: string };
          if (message.type === "Flush") window.setTimeout(() => {
            this.onmessage?.(new MessageEvent("message", { data: JSON.stringify({ type: "Metadata", request_id: "fixture-stream-id" }) }));
            this.onmessage?.(new MessageEvent("message", { data: JSON.stringify({ type: "Flushed", sequence_id: 0 }) }));
          }, 0);
        }
        close(code = 1000, reason = "") {
          this.readyState = FixtureWebSocket.CLOSED;
          this.onclose?.(new CloseEvent("close", { code, reason, wasClean: true }));
        }
      }
      Object.defineProperty(window, "WebSocket", { configurable: true, value: FixtureWebSocket });
    });
    await page.getByRole("button", { name: /Speak: Continuous Text Stream/ }).click();
    await expect(page.getByText("Manual verification required", { exact: true })).toBeVisible();
    await expect(page.getByTestId("browser-realtime-session")).toBeVisible();
    await page.getByRole("button", { name: "Run Request" }).click();
    await expect(page.getByTestId("realtime-status-strip")).toContainText("Text/config sent");
    await expect(page.getByRole("tab", { name: "Timeline" })).toBeVisible();
    await page.getByRole("button", { name: "Stop" }).click();
    await expect(page.getByTestId("realtime-status-strip")).toContainText("Socket closed");
    await expect(page.getByTestId("realtime-status-strip")).toContainText("1000");
    await expect(page.locator("body")).not.toContainText("fixture-temporary-token");
  });

  test("fails Voice Agent hosted execution closed before token, microphone, or WebSocket use", async ({ page }) => {
    let tokenRequests = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/deepgram/token") tokenRequests += 1;
    });
    await openApiStudio(page);
    await page.evaluate(() => {
      const counters = { microphoneRequests: 0, webSockets: 0 };
      Object.assign(window, { __voiceAgentBoundaryCounters: counters });
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => {
        counters.microphoneRequests += 1;
        return { getTracks: () => [], getAudioTracks: () => [] };
      } } });
      class TrappedWebSocket {
        constructor() { counters.webSockets += 1; }
      }
      Object.defineProperty(window, "WebSocket", { configurable: true, value: TrappedWebSocket });
    });

    await page.getByRole("button", { name: /Voice Agent Converse/ }).click();
    const studio = page.getByTestId("api-studio-executable");
    const run = studio.getByRole("button", { name: "Run Request" });
    await expect(studio.getByText("Hosted execution unavailable", { exact: true }).first()).toBeVisible();
    await expect(studio.locator("#api-studio-hosted-execution-reason").getByText("Hosted temporary-token issuance is disabled. This flow is available for documentation or local/manual inspection only; no live session can be started here.", { exact: true })).toBeVisible();
    await expect(run).toBeDisabled();
    await expect(run).toHaveAttribute("aria-describedby", "api-studio-hosted-execution-reason");
    await expect(studio.getByTestId("browser-realtime-session")).toHaveCount(0);
    await expect(studio.getByText("Ready", { exact: true })).toHaveCount(0);

    await run.evaluate((button: HTMLButtonElement) => button.click());
    await page.keyboard.press("Control+Enter");
    expect(tokenRequests).toBe(0);
    expect(await page.evaluate(() => (window as typeof window & { __voiceAgentBoundaryCounters: { microphoneRequests: number; webSockets: number } }).__voiceAgentBoundaryCounters)).toEqual({ microphoneRequests: 0, webSockets: 0 });
  });

  test("makes speech-to-speech discoverable as a provider-specific hosted-disabled preview", async ({ page }) => {
    let tokenRequests = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/deepgram/token") tokenRequests += 1;
    });

    await page.goto("/");
    const entry = page.getByTestId("speech-to-speech-capability");
    await expect(entry).toBeVisible();
    await expect(entry).toContainText("Speech-to-speech");
    await expect(entry).toContainText("Provider-specific preview · Deepgram");
    await expect(entry).toContainText("Hosted execution unavailable");
    await expect(entry).toHaveAttribute("href", "/?module=api-studio&operation=voice-agent-converse");

    await entry.click();
    await expect(page).toHaveURL(/module=api-studio.*operation=voice-agent-converse/);
    await expect(page.getByTestId("api-studio-executable").getByRole("button", { name: "Run Request" })).toBeDisabled();
    await expect(page.getByTestId("api-studio-executable").getByText("Hosted execution unavailable", { exact: true }).first()).toBeVisible();
    expect(tokenRequests).toBe(0);
  });
});
