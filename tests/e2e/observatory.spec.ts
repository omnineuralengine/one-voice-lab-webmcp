import { expect, test, type Page, type Route } from "@playwright/test";

import { assertObservatoryArtifactSafe, sanitizeObservatoryArtifact } from "../../src/lib/observatory/security";
import {
  DEEPGRAM_NOVA3_MULTILINGUAL_LANGUAGE_CODES,
  DEEPGRAM_NOVA3_STREAMING_LANGUAGE_OPTIONS,
} from "../../src/lib/deepgram-languages";
import { buildDeepgramListenUrl } from "../../src/lib/live-mic/deepgram-live-client";
import { captureDownload, clearLabStorage, expectNoPageLevelOverflow, expectNoPotentialSecrets, readDownloadText } from "./helpers";

declare global { interface Window { __observatoryMedia: { getUserMedia: number; trackStops: number; recorderStarts: number; recorderStops: number; socketCloses: number; socketSends: number; playbackStarts: number; playbackStops: number; fetchAborts: number; socketUrls: string[] }; __emitObservatorySocketMessage: (index: number, transcript: string) => void } }

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.config.metadata.observatory !== true, "Observatory coverage uses its isolated production-server runner.");
});

test.describe("@observatory controlled Live Observatory Lab", () => {
  test.beforeEach(async ({ page }) => {
    await installMediaMocks(page);
    await mockObservatoryRoutes(page);
    await page.goto("/");
    await expect(page.locator("button.pocket-trigger")).toBeEnabled();
    await clearLabStorage(page);
    await openObservatory(page);
  });

  test("synthetic preview is deterministic and makes no Deepgram request", async ({ page }) => {
    const calls: string[] = [];
    page.on("request", (request) => { if (request.url().includes("/api/deepgram/")) calls.push(request.url()); });
    await page.waitForTimeout(150);
    expect(calls).toEqual([]);
    await page.getByRole("button", { name: "Load deterministic fixture" }).click();
    await expect(page.getByText(/No network request was made/i)).toBeVisible();
    await expect(page.getByLabel("Observatory event trace").getByRole("button")).toHaveCount(8);
    expect(calls).toEqual([]);
    const stages = page.getByLabel("Observatory pipeline").locator("[data-stage]");
    await expect(stages).toHaveCount(7);
    await expect(page.getByText(/Heat is not causality/i)).toBeVisible();
  });

  test("guided demo guide and Reset Demo State never start a request or erase other local work", async ({ page }) => {
    const calls: string[] = [];
    page.on("request", (request) => { if (request.url().includes("/api/deepgram/")) calls.push(request.url()); });
    await page.getByRole("button", { name: /Guided Engineering Demo/ }).click();
    const guide = page.getByTestId("guided-demo-guide");
    await expect(guide).toBeVisible();
    await expect(guide).toContainText("Presenter-only · no automatic requests");
    await page.evaluate(() => {
      window.localStorage.setItem("deepgram-code-lab:draft:v1:demo-sentinel", "preserve-code-lab");
      window.localStorage.setItem("deepgram-questline:progress:v1", "preserve-questline");
    });
    await guide.getByRole("button", { name: "Reset Demo State" }).click();
    const preserved = await page.evaluate(() => ({
      codeLab: window.localStorage.getItem("deepgram-code-lab:draft:v1:demo-sentinel"),
      questline: window.localStorage.getItem("deepgram-questline:progress:v1"),
    }));
    expect(preserved).toEqual({ codeLab: "preserve-code-lab", questline: "preserve-questline" });
    await expect(page.getByRole("status").filter({ hasText: /no request was started/i })).toBeVisible();
    expect(calls).toEqual([]);
  });

  test("one failed operation resets cleanly and the next controlled demo can succeed", async ({ page }) => {
    await page.unroute("**/api/deepgram/**");
    await mockObservatoryRoutes(page, { ttsFailOnce: true });
    await activateLive(page);
    await page.getByRole("button", { name: /Hear the API/ }).click();
    await page.getByRole("button", { name: "Confirm and generate once" }).click();
    await page.getByRole("dialog", { name: "Confirm controlled live demo" }).getByRole("button", { name: "Run live demo" }).click();
    await expect(page.getByRole("status").filter({ hasText: /Mock TTS failure/i })).toBeVisible();
    await page.locator("header").getByRole("button", { name: "Reset Demo State" }).click();
    await page.getByRole("button", { name: "Live Lab", exact: true }).click();
    await page.getByRole("button", { name: /Activate Live Lab/ }).click();
    await page.getByRole("button", { name: /Hear the API/ }).click();
    await page.getByRole("button", { name: "Confirm and generate once" }).click();
    await page.getByRole("dialog", { name: "Confirm controlled live demo" }).getByRole("button", { name: "Run live demo" }).click();
    await expect(page.getByText(/TTS completed/i)).toBeVisible();
  });

  test("local AVS whitepaper reference is available without contacting Deepgram", async ({ page }) => {
    const calls: string[] = [];
    page.on("request", (request) => { if (request.url().includes("/api/deepgram/")) calls.push(request.url()); });
    const response = await page.request.get("/avs-whitepaper");
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toBe("application/pdf");
    expect((await response.body()).byteLength).toBeGreaterThan(100_000);
    expect(calls).toEqual([]);
  });

  test("live TTS requires confirmation, captures actual-cost provenance, and does not repeat", async ({ page }) => {
    const calls: string[] = [];
    page.on("request", (request) => { if (request.url().includes("/api/deepgram/")) calls.push(`${request.method()}:${new URL(request.url()).pathname}`); });
    await activateLive(page);
    await page.getByRole("button", { name: /Hear the API/ }).click();
    await page.getByRole("button", { name: "Enable read-only lookup" }).click();
    await expect(page.getByText(/Project identifiers remain server-side/i)).toBeVisible();
    await page.getByRole("button", { name: "Check balance" }).click();
    await expect(page.getByText(/API-reported mock project balance/i)).toBeVisible();
    await page.getByRole("button", { name: "Confirm and generate once" }).click();
    const dialog = page.getByRole("dialog", { name: "Confirm controlled live demo" });
    await expect(dialog).toContainText("1");
    expect(calls.filter((entry) => entry === "POST:/api/deepgram/tts")).toHaveLength(0);
    await dialog.getByRole("button", { name: "Run live demo" }).click();
    await expect(page.getByText(/TTS completed/i)).toBeVisible();
    expect(calls.filter((entry) => entry === "POST:/api/deepgram/tts")).toHaveLength(1);
    await expect(page.getByText(/Actual cost/).first()).toBeVisible();
    await expect(page.getByLabel("Observatory event trace")).toContainText("deepgram_response_received");
  });

  test("configuration comparison uses exactly two requests and hides WER without ground truth", async ({ page }) => {
    let sttCalls = 0;
    page.on("request", (request) => { if (request.url().includes("/api/deepgram/transcribe-url")) sttCalls += 1; });
    await activateLive(page);
    await page.getByRole("button", { name: /Compare Two Configurations/ }).click();
    await page.getByRole("button", { name: "Confirm and run two STT requests" }).click();
    const dialog = page.getByRole("dialog", { name: "Confirm controlled live demo" });
    await expect(dialog).toContainText("Billable requests");
    await dialog.getByRole("button", { name: "Run live demo" }).click();
    await expect(page.getByText(/comparison completed/i)).toBeVisible();
    expect(sttCalls).toBe(2);
    await expect(page.getByText("WER unavailable — no ground truth")).toBeVisible();
  });

  test("Configuration A can run as one confirmed prerecorded STT request", async ({ page }) => {
    let sttCalls = 0;
    page.on("request", (request) => { if (request.method() === "POST" && request.url().includes("/api/deepgram/transcribe-url")) sttCalls += 1; });
    await activateLive(page);
    await page.getByRole("button", { name: /Compare Two Configurations/ }).click();
    await page.getByRole("button", { name: "Confirm and run Configuration A only" }).click();
    const dialog = page.getByRole("dialog", { name: "Confirm controlled live demo" });
    await expect(dialog).toContainText("Billable requests");
    await expect(dialog).toContainText("1");
    await dialog.getByRole("button", { name: "Run live demo" }).click();
    await expect(page.getByText(/Single prerecorded STT request completed/i)).toBeVisible();
    expect(sttCalls).toBe(1);
  });

  test("Voice Loop performs one bounded TTS to STT handoff without repeating", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (request.method() === "POST" && (path === "/api/deepgram/tts" || path === "/api/deepgram/transcribe-file")) requests.push(path);
    });
    await activateLive(page);
    await page.getByRole("button", { name: /Voice Loop/ }).click();
    await page.getByRole("button", { name: /Confirm one TTS/ }).click();
    await page.getByRole("dialog", { name: "Confirm controlled live demo" }).getByRole("button", { name: "Run live demo" }).click();
    await expect(page.getByText(/Voice Loop completed once/i)).toBeVisible();
    expect(requests).toEqual(["/api/deepgram/tts", "/api/deepgram/transcribe-file"]);
    await expect(page.getByText(/WER unavailable.*no ground truth/)).toBeVisible();
  });

  test("Italian Voice Path sends one verified voice request and makes no translation claim", async ({ page }) => {
    const ttsBodies: string[] = [];
    page.on("request", (request) => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/deepgram/tts") ttsBodies.push(request.postData() || ""); });
    await activateLive(page);
    await page.getByRole("button", { name: /Italian Voice Path/ }).click();
    await expect(page.getByText(/does not translate text/i)).toBeVisible();
    await page.getByRole("button", { name: "Confirm and generate once" }).click();
    await page.getByRole("dialog", { name: "Confirm controlled live demo" }).getByRole("button", { name: "Run live demo" }).click();
    await expect(page.getByText(/TTS completed/i)).toBeVisible();
    expect(ttsBodies).toHaveLength(1);
    expect(ttsBodies[0]).toContain("aura-2-livia-it");
  });

  test("Speak and Watch requests permission only after confirmation and Stop releases resources", async ({ page }) => {
    await activateLive(page);
    await page.getByRole("button", { name: /Speak and Watch/ }).click();
    expect((await mediaState(page)).getUserMedia).toBe(0);
    await page.getByRole("button", { name: /Start Live Mic|Start live/i }).click();
    expect((await mediaState(page)).getUserMedia).toBe(0);
    const dialog = page.getByRole("dialog", { name: "Confirm controlled live demo" });
    await expect(dialog).toContainText("maximum 60 seconds");
    await dialog.getByRole("button", { name: "Run live demo" }).click();
    await expect.poll(async () => (await mediaState(page)).getUserMedia).toBe(1);
    await expect.poll(async () => (await mediaState(page)).socketSends).toBeGreaterThan(0);
    await expect(page.getByLabel("Observatory event trace")).toContainText(/transcript_final|deepgram_message_received/);
    await expect(page.getByText("Deepgram request ID", { exact: true })).toBeVisible();
    await expect(page.getByText("Audio send → first transcript", { exact: true })).toBeVisible();
    await page.locator('header [data-shortcut-command="stop_session"]').click();
    await expect.poll(async () => (await mediaState(page)).trackStops).toBeGreaterThan(0);
    const state = await mediaState(page);
    expect(state.recorderStops).toBeGreaterThan(0);
    expect(state.socketCloses).toBeGreaterThan(0);
  });

  test("metadata persistence and sanitized export remain explicit", async ({ page }) => {
    await page.getByRole("button", { name: "Load deterministic fixture" }).click();
    await page.getByRole("button", { name: "Save metadata" }).click();
    const stored = await page.evaluate(() => window.localStorage.getItem("deepgram-observatory-runs:v1") || "");
    expect(stored).toContain("metadata-only");
    expect(stored).not.toContain("Authorization");
    expect(stored).not.toContain("Where is my order");
    const download = await captureDownload(page, () => page.getByRole("button", { name: "Export JSON" }).click());
    const content = await readDownloadText(download);
    expect(content).toContain("synthetic");
    expect(content).toContain("Transcript content omitted");
    expect(content).not.toContain("Where is my order");
    expectNoPotentialSecrets(content);
  });

  test("transcript persistence requires opt-in and can be deleted independently", async ({ page }) => {
    page.on("dialog", (dialog) => dialog.accept());
    await activateLive(page);
    await page.getByRole("button", { name: /Compare Two Configurations/ }).click();
    await page.getByRole("button", { name: "Confirm and run two STT requests" }).click();
    await page.getByRole("dialog", { name: "Confirm controlled live demo" }).getByRole("button", { name: "Run live demo" }).click();
    await expect(page.getByText(/comparison completed/i)).toBeVisible();
    await page.getByText(/Include sanitized transcript in the next save\/export/i).click();
    await page.locator("header").getByRole("button", { name: "Save metadata" }).click();
    const withTranscript = await page.evaluate(() => window.localStorage.getItem("deepgram-observatory-runs:v1") || "");
    expect(withTranscript).toContain("metadata-and-sanitized-transcript");
    expect(withTranscript).toContain("Life moves pretty fast");
    await page.getByRole("button", { name: "Delete saved transcripts" }).click();
    const withoutTranscript = await page.evaluate(() => window.localStorage.getItem("deepgram-observatory-runs:v1") || "");
    expect(withoutTranscript).toContain("metadata-only");
    expect(withoutTranscript).not.toContain("Life moves pretty fast");
  });

  test("Management permission failure degrades to an honest unavailable state", async ({ page }) => {
    await page.unroute("**/api/deepgram/**");
    await mockObservatoryRoutes(page, { managementMode: "scope-unavailable" });
    await activateLive(page);
    await page.getByRole("button", { name: "Enable read-only lookup" }).click();
    await expect(page.getByText(/does not have the required read-only Management scope/i)).toBeVisible();
    await expect(page.getByText(/^Management scope unavailable:/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh request cost" })).toBeDisabled();
  });

  test("one bounded delayed cost lookup resolves Pending without polling", async ({ page }) => {
    await page.unroute("**/api/deepgram/**");
    await mockObservatoryRoutes(page, { managementMode: "pending-once" });
    const managementCalls: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/deepgram/observatory/manage")) managementCalls.push(request.postData() || "");
    });
    await activateLive(page);
    await page.getByRole("button", { name: /Hear the API/ }).click();
    await page.getByRole("button", { name: "Enable read-only lookup" }).click();
    await page.getByRole("button", { name: "Confirm and generate once" }).click();
    await page.getByRole("dialog", { name: "Confirm controlled live demo" }).getByRole("button", { name: "Run live demo" }).click();
    await expect(page.getByText("Pending", { exact: true }).first()).toBeVisible();
    await page.waitForTimeout(5_300);
    await expect(page.getByText(/Actual cost/).first()).toBeVisible();
    expect(managementCalls.filter((body) => body.includes("get-request-cost"))).toHaveLength(2);
  });

  test("the 60-second hard stop is armed and releases live microphone resources", async ({ page }) => {
    await page.clock.install();
    await activateLive(page);
    await page.getByRole("button", { name: /Speak and Watch/ }).click();
    await page.getByRole("button", { name: /Start Live Mic|Start live/i }).click();
    await page.getByRole("dialog", { name: "Confirm controlled live demo" }).getByRole("button", { name: "Run live demo" }).click();
    await page.clock.fastForward(250);
    await expect.poll(async () => (await mediaState(page)).socketSends).toBeGreaterThan(0);
    await page.clock.fastForward(60_000);
    await expect.poll(async () => (await mediaState(page)).trackStops).toBeGreaterThan(0);
    const state = await mediaState(page);
    expect(state.recorderStops).toBeGreaterThan(0);
    expect(state.socketCloses).toBeGreaterThan(0);
  });

  test("sanitizer preserves placeholders and removes injected credentials", async () => {
    const fakeSecret = "dg_test_0123456789abcdefghijklmnopqrstuvwxyz";
    const safe = sanitizeObservatoryArtifact({
      placeholder: "process.env.DEEPGRAM_API_KEY",
      headers: { Authorization: `Token ${fakeSecret}` },
      temporaryToken: ["eyJhbGciOiJIUzI1NiJ9", "eyJleHAiOjE3ODAwMDAwMDB9", "signature0123456789"].join("."),
    });
    const serialized = assertObservatoryArtifactSafe(safe);
    expect(serialized).toContain("process.env.DEEPGRAM_API_KEY");
    expect(serialized).not.toContain(fakeSecret);
    expect(serialized).not.toContain("eyJhbGciOiJIUzI1NiJ9");
  });

  test("Stop interrupts browser playback and reduced motion removes pulse transitions", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await activateLive(page);
    await page.getByRole("button", { name: /Hear the API/ }).click();
    await page.getByRole("button", { name: "Confirm and generate once" }).click();
    await page.getByRole("dialog", { name: "Confirm controlled live demo" }).getByRole("button", { name: "Run live demo" }).click();
    const audio = page.locator("audio");
    await expect(audio).toBeVisible();
    await audio.evaluate((element) => (element as HTMLAudioElement).play());
    await expect.poll(async () => (await mediaState(page)).playbackStarts).toBeGreaterThan(0);
    await page.locator('header [data-shortcut-command="stop_session"]').click();
    await expect.poll(async () => (await mediaState(page)).playbackStops).toBeGreaterThan(0);
    const transitionProperty = await page.locator('[data-stage="tts-playback"]').evaluate((element) => getComputedStyle(element).transitionProperty);
    expect(transitionProperty).toBe("none");
  });

  test("Credit Guard blocks overlap and Stop aborts an active fetch", async ({ page }) => {
    await page.unroute("**/api/deepgram/**");
    await mockObservatoryRoutes(page, { ttsDelayMs: 1_500 });
    let ttsPosts = 0;
    page.on("request", (request) => { if (request.method() === "POST" && request.url().includes("/api/deepgram/tts")) ttsPosts += 1; });
    await activateLive(page);
    await page.getByRole("button", { name: /Hear the API/ }).click();
    await page.getByRole("button", { name: "Confirm and generate once" }).click();
    await page.getByRole("dialog", { name: "Confirm controlled live demo" }).getByRole("button", { name: "Run live demo" }).click();
    await expect.poll(() => ttsPosts).toBe(1);
    await page.getByRole("button", { name: /Italian Voice Path/ }).click();
    await page.getByRole("button", { name: "Confirm and generate once" }).click();
    await expect(page.getByRole("dialog", { name: "Confirm controlled live demo" })).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: /blocked.*another Observatory operation/i })).toBeVisible();
    await page.locator('header [data-shortcut-command="stop_session"]').click();
    await expect.poll(async () => (await mediaState(page)).fetchAborts).toBeGreaterThan(0);
    expect(ttsPosts).toBe(1);
  });

  test("layout remains internally contained at the configured desktop viewport", async ({ page }) => {
    await expectNoPageLevelOverflow(page);
    await expect(page.getByTestId("observatory-layout")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Observatory presets" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Observatory trace and inspector" })).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus-visible")).toBeVisible();
  });
});

test.describe("@live-mic-language model-aware multilingual Live Mic", () => {
  test.beforeEach(async ({ page }) => {
    await installMediaMocks(page);
    await mockObservatoryRoutes(page);
    await page.goto("/");
    await expect(page.locator("button.pocket-trigger")).toBeEnabled();
    await clearLabStorage(page);
    await openObservatory(page);
    await activateLive(page);
    await page.getByRole("button", { name: /Speak and Watch/ }).click();
  });

  test("typed Nova endpoint builder emits only compatible language parameters", async () => {
    for (const language of ["it", "th", "ja"] as const) {
      const url = buildDeepgramListenUrl({
        recognitionConfig: { mode: "known-language", model: "nova-3", language },
        interimResults: true,
        endpointingMs: 300,
        vadEvents: true,
      });
      expect(url.pathname).toBe("/v1/listen");
      expect(url.searchParams.get("model")).toBe("nova-3");
      expect(url.searchParams.get("language")).toBe(language);
      expect(url.searchParams.has("detect_language")).toBe(false);
      expect(url.searchParams.has("encoding")).toBe(false);
      expect(url.searchParams.has("sample_rate")).toBe(false);
    }

    const multilingual = buildDeepgramListenUrl({
      recognitionConfig: { mode: "nova-multilingual", model: "nova-3", language: "multi" },
    });
    expect(multilingual.searchParams.get("language")).toBe("multi");
    expect(multilingual.searchParams.getAll("language")).toEqual(["multi"]);
    expect(multilingual.searchParams.has("language_hint")).toBe(false);
    expect(DEEPGRAM_NOVA3_MULTILINGUAL_LANGUAGE_CODES).toEqual(["en", "es", "fr", "de", "hi", "ru", "pt", "ja", "it", "nl"]);
  });

  test("known-language choices update the preview without opening a socket", async ({ page }) => {
    const tokenCalls: string[] = [];
    page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/deepgram/token") tokenCalls.push(request.url()); });
    const section = page.getByRole("region", { name: "Realtime language configuration" });
    const selector = section.getByLabel("Live Mic spoken language");
    await expect(selector.locator("option")).toHaveCount(DEEPGRAM_NOVA3_STREAMING_LANGUAGE_OPTIONS.length);
    await expect(selector.locator('option[value="multi"]')).toHaveCount(0);
    await section.getByRole("button", { name: "Italian", exact: true }).click();
    await expect(selector).toHaveValue("it");
    await expect(section).toContainText("Italian");
    await expect(section).toContainText("Language code");
    expect(tokenCalls).toEqual([]);
    expect((await mediaState(page)).getUserMedia).toBe(0);
    expect((await mediaState(page)).socketUrls).toEqual([]);
    await section.getByRole("button", { name: "Thai", exact: true }).click();
    await expect(selector).toHaveValue("th");
    await section.getByRole("button", { name: "Japanese", exact: true }).click();
    await expect(selector).toHaveValue("ja");
  });

  test("Italian starts one explicitly confirmed socket and inspector uses language=it", async ({ page }) => {
    const section = page.getByRole("region", { name: "Realtime language configuration" });
    await section.getByRole("button", { name: "Italian", exact: true }).click();
    await page.getByRole("button", { name: "Start Live Mic" }).click();
    const confirmation = page.getByRole("dialog", { name: "Confirm controlled live demo" });
    await expect(confirmation).toContainText("Italian (it)");
    expect((await mediaState(page)).getUserMedia).toBe(0);
    await confirmation.getByRole("button", { name: "Run live demo" }).click();
    await expect.poll(async () => (await mediaState(page)).socketUrls.length).toBe(1);
    const state = await mediaState(page);
    const url = new URL(state.socketUrls[0]);
    expect(url.searchParams.get("language")).toBe("it");
    expect(url.searchParams.has("detect_language")).toBe(false);
    expect(state.socketUrls[0]).not.toContain("DEEPGRAM_API_KEY");
    expect(state.socketUrls[0]).not.toMatch(/authorization|bearer/i);
    await expect(page.getByText(/Configured spoken language: Italian \(it\)/)).toBeVisible();
    await expect(page.getByLabel("Observatory event trace")).toContainText("recognition_configured");
    await expect(page.getByLabel("Observatory event trace")).toContainText("transcript_final");
  });

  test("Nova multilingual shows measured event language without claiming universal support", async ({ page }) => {
    const section = page.getByRole("region", { name: "Realtime language configuration" });
    await section.getByLabel("Nova-3 multilingual / code-switching").check();
    await expect(section).toContainText("language=multi");
    await page.getByRole("button", { name: "Start Live Mic" }).click();
    await page.getByRole("dialog", { name: "Confirm controlled live demo" }).getByRole("button", { name: "Run live demo" }).click();
    await expect.poll(async () => (await mediaState(page)).socketUrls.length).toBe(1);
    const url = new URL((await mediaState(page)).socketUrls[0]);
    expect(url.searchParams.get("language")).toBe("multi");
    expect(url.searchParams.getAll("language")).toEqual(["multi"]);
    await expect(page.getByText(/Observed language from Deepgram event: it/)).toBeVisible();
    await expect(section).not.toContainText("all languages");
  });

  test("active language change requires confirmation and cleans up before the replacement socket", async ({ page }) => {
    const section = page.getByRole("region", { name: "Realtime language configuration" });
    await section.getByRole("button", { name: "Italian", exact: true }).click();
    await page.getByRole("button", { name: "Start Live Mic" }).click();
    await page.getByRole("dialog", { name: "Confirm controlled live demo" }).getByRole("button", { name: "Run live demo" }).click();
    await expect.poll(async () => (await mediaState(page)).socketUrls.length).toBe(1);

    await section.getByRole("button", { name: "Thai", exact: true }).click();
    const restart = page.getByRole("alertdialog", { name: "Reconnect required" });
    await expect(restart).toContainText("Thai (th)");
    expect((await mediaState(page)).socketUrls).toHaveLength(1);
    await restart.getByRole("button", { name: /Stop and restart/ }).click();
    const confirmation = page.getByRole("dialog", { name: "Confirm controlled live demo" });
    await expect(confirmation).toContainText("Thai (th)");
    await confirmation.getByRole("button", { name: "Run live demo" }).click();
    await expect.poll(async () => (await mediaState(page)).socketUrls.length).toBe(2);
    const state = await mediaState(page);
    expect(state.socketCloses).toBeGreaterThan(0);
    expect(state.recorderStops).toBeGreaterThan(0);
    expect(state.trackStops).toBeGreaterThan(0);
    expect(new URL(state.socketUrls[1]).searchParams.get("language")).toBe("th");
    await page.evaluate(() => window.__emitObservatorySocketMessage(0, "STALE OLD SESSION"));
    await expect(page.getByText("STALE OLD SESSION", { exact: true })).toHaveCount(0);
    await expectNoPageLevelOverflow(page);
  });
});

async function openObservatory(page: Page) {
  await page.getByRole("button", { name: /Live Observatory Lab/i }).first().click();
  await expect(page.getByRole("heading", { name: "Live Observatory Lab" }).first()).toBeVisible();
  await expect(page.getByText("SYNTHETIC PREVIEW", { exact: true }).first()).toBeVisible();
}

async function activateLive(page: Page) {
  await page.getByRole("button", { name: "Live Lab", exact: true }).click();
  await page.getByRole("button", { name: /Activate Live Lab/ }).click();
  await expect(page.getByText("LIVE LAB", { exact: true }).first()).toBeVisible();
}

async function mockObservatoryRoutes(page: Page, options: { managementMode?: "actual" | "pending-once" | "scope-unavailable"; ttsDelayMs?: number; ttsFailOnce?: boolean } = {}) {
  let transcriptCall = 0;
  let costCall = 0;
  let ttsCall = 0;
  await page.route("**/api/deepgram/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/deepgram/token") {
      const tokenEnvelope = envelope({ credentialPreview: "***redacted***", expires_in: 60 }, "Temporary Token", "token-request");
      return fulfill(route, { ok: true, access_token: "DEEPGRAM_API_KEY", expires_in: 60, inspector: tokenEnvelope.inspector });
    }
    if (url.pathname === "/api/deepgram/tts" && route.request().method() === "POST") { ttsCall += 1; if (options.ttsDelayMs) await new Promise((resolve) => setTimeout(resolve, options.ttsDelayMs)); if (options.ttsFailOnce && ttsCall === 1) return fulfill(route, { ...envelope({ state: "failed" }, "Text to Speech", "tts-failed"), ok: false, error: { message: "Mock TTS failure" } }, 502); return fulfill(route, envelope({ audioUrl: "/api/deepgram/tts?id=mock-audio", contentType: "audio/mpeg", byteSize: 2048, model: "aura-2-thalia-en", textLength: 40, requestId: "tts-request-12345678", binaryAudio: "***not included in JSON***" }, "Text to Speech", "tts-request-12345678")); }
    if (url.pathname === "/api/deepgram/tts" && route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "audio/mpeg", body: Buffer.from([1, 2, 3, 4]) });
    if (url.pathname === "/api/deepgram/tts" && route.request().method() === "DELETE") return fulfill(route, { ok: true, deleted: true });
    if (url.pathname.includes("transcribe")) { transcriptCall += 1; const transcript = transcriptCall % 2 ? "Life moves pretty fast" : "Life moves very fast"; return fulfill(route, envelope({ ok: true, transcript, raw: { metadata: { request_id: `stt-request-${transcriptCall}2345678` }, results: { channels: [{ alternatives: [{ transcript }] }] } }, request: { model: "nova-3", language: "en", source: "url" } }, "Prerecorded STT", `stt-request-${transcriptCall}2345678`)); }
    if (url.pathname.endsWith("/observatory/manage")) {
      const body = route.request().postDataJSON() as { action?: string; requestId?: string };
      if (options.managementMode === "scope-unavailable") return fulfill(route, { ...envelope({ state: "Management scope unavailable", reportedAt: new Date().toISOString(), note: "The configured key does not have the required read-only Management scope." }, "Manage", "manage-scope"), ok: false }, 403);
      if (body.action === "resolve-project") return fulfill(route, envelope({ state: "Pending", projects: [{ handle: "project-handle", name: "Mock project" }], projectHandle: "project-handle", projectName: "Mock project", reportedAt: new Date().toISOString(), note: "Read-only project access succeeded. Project identifiers remain server-side behind temporary local handles." }, "Manage", "manage-resolve"));
      if (body.action === "get-balances") return fulfill(route, envelope({ state: "Unavailable", balanceAmount: 42.5, balanceUnit: "USD", reportedAt: new Date().toISOString(), note: "This is an API-reported mock project balance." }, "Manage", "manage-balance"));
      if (body.action === "usage-breakdown") return fulfill(route, envelope({ state: "Unavailable", reportedAt: new Date().toISOString(), note: "Read-only mock usage returned one result row; account metadata is omitted." }, "Manage", "manage-usage"));
      costCall += 1;
      if (options.managementMode === "pending-once" && costCall === 1) return fulfill(route, envelope({ state: "Pending", requestId: body.requestId, reportedAt: new Date().toISOString(), note: "Request accounting is not available yet; one bounded retry is armed." }, "Manage", "manage-pending"));
      return fulfill(route, envelope({ state: "Actual cost", requestId: body.requestId, actualCostUsd: 0.000123, reportedAt: new Date().toISOString(), note: "Actual cost came from documented request data." }, "Manage", "manage-cost"));
    }
    return fulfill(route, { ok: false, error: { message: "Unmocked Deepgram route blocked by Observatory test." } }, 503);
  });
}

function envelope<T>(data: T, module: string, id: string) { const at = new Date().toISOString(); return { ok: true, data, inspector: { id, module, startedAt: at, completedAt: at, durationMs: 12, request: { method: "MOCK", endpoint: "http://127.0.0.1/mock", headers: { Authorization: "Token ***redacted***" } }, response: { status: 200, bodyPreview: data }, timeline: [], notes: ["Deterministic Playwright fixture"] } }; }
async function fulfill(route: Route, body: unknown, status = 200) { await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }); }

async function installMediaMocks(page: Page) {
  await page.addInitScript(() => {
    const state = { getUserMedia: 0, trackStops: 0, recorderStarts: 0, recorderStops: 0, socketCloses: 0, socketSends: 0, playbackStarts: 0, playbackStops: 0, fetchAborts: 0, socketUrls: [] as string[] };
    window.__observatoryMedia = state;
    const NativeAbortController = window.AbortController;
    class CountingAbortController extends NativeAbortController { override abort(reason?: unknown) { state.fetchAborts += 1; super.abort(reason); } }
    Object.defineProperty(window, "AbortController", { configurable: true, value: CountingAbortController });
    Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: function play() { state.playbackStarts += 1; this.dispatchEvent(new Event("play")); return Promise.resolve(); } });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: function pause() { state.playbackStops += 1; this.dispatchEvent(new Event("pause")); } });
    const track = { kind: "audio", id: "mock-track", label: "Mock Observatory Mic", enabled: true, muted: false, readyState: "live", stop: () => { state.trackStops += 1; }, getSettings: () => ({ deviceId: "mock-mic", sampleRate: 48_000, channelCount: 1 }), getConstraints: () => ({}), getCapabilities: () => ({}), applyConstraints: async () => undefined, clone: () => track, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true } as unknown as MediaStreamTrack;
    const stream = { id: "mock-stream", active: true, getTracks: () => [track], getAudioTracks: () => [track], getVideoTracks: () => [], getTrackById: () => track, addTrack: () => undefined, removeTrack: () => undefined, clone: () => stream, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true } as unknown as MediaStream;
    const device = { deviceId: "mock-mic", label: "Mock Observatory Mic", kind: "audioinput", groupId: "mock", toJSON: () => ({}) } as MediaDeviceInfo;
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { enumerateDevices: async () => [device], getUserMedia: async () => { state.getUserMedia += 1; return stream; }, getSupportedConstraints: () => ({ deviceId: true }), addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true, ondevicechange: null } });
    class Recorder { static isTypeSupported() { return true; } state: RecordingState = "inactive"; mimeType = "audio/webm;codecs=opus"; ondataavailable: ((event: BlobEvent) => void) | null = null; onerror: ((event: Event) => void) | null = null; onstop: ((event: Event) => void) | null = null; timer = 0; constructor(public stream: MediaStream) {} start() { this.state = "recording"; state.recorderStarts += 1; this.timer = window.setInterval(() => this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3])], { type: this.mimeType }) } as BlobEvent), 25); } stop() { if (this.state === "inactive") return; this.state = "inactive"; state.recorderStops += 1; window.clearInterval(this.timer); this.onstop?.(new Event("stop")); } pause() {} resume() {} requestData() {} }
    Object.defineProperty(window, "MediaRecorder", { configurable: true, value: Recorder });
    const NativeWebSocket = window.WebSocket;
    const sockets: Socket[] = [];
    class Socket { static OPEN = 1; static CONNECTING = 0; static CLOSING = 2; static CLOSED = 3; readyState = 0; onopen: ((event: Event) => void) | null = null; onmessage: ((event: MessageEvent) => void) | null = null; onerror: ((event: Event) => void) | null = null; onclose: ((event: CloseEvent) => void) | null = null; binaryType: BinaryType = "blob"; bufferedAmount = 0; extensions = ""; protocol = "bearer"; url = "wss://api.deepgram.com/v1/listen"; constructor(url: string | URL, protocols?: string | string[]) { const target = String(url); if (!target.includes("api.deepgram.com")) return new NativeWebSocket(url, protocols) as unknown as Socket; state.socketUrls.push(target); this.url = target; window.setTimeout(() => { this.readyState = 1; this.onopen?.(new Event("open")); this.onmessage?.(new MessageEvent("message", { data: JSON.stringify({ type: "Metadata", request_id: "live-request-12345678" }) })); this.onmessage?.(new MessageEvent("message", { data: JSON.stringify({ type: "Results", is_final: true, speech_final: true, channel: { alternatives: [{ transcript: "Mock live transcript", words: [{ word: "Mock", language: "it" }] }] } }) })); }, 10); } send() { state.socketSends += 1; } close(code = 1000, reason = "closed") { state.socketCloses += 1; this.readyState = 3; this.onclose?.({ code, reason, wasClean: true } as CloseEvent); } addEventListener() {} removeEventListener() {} dispatchEvent() { return true; } }
    const SocketWithRegistry = class extends Socket { constructor(url: string | URL, protocols?: string | string[]) { super(url, protocols); if (String(url).includes("api.deepgram.com")) sockets.push(this); } };
    window.__emitObservatorySocketMessage = (index, transcript) => sockets[index]?.onmessage?.(new MessageEvent("message", { data: JSON.stringify({ type: "Results", is_final: true, channel: { alternatives: [{ transcript }] } }) }));
    Object.defineProperty(window, "WebSocket", { configurable: true, value: SocketWithRegistry });
    class Context { state: AudioContextState = "running"; createMediaStreamSource() { return { connect: () => undefined, disconnect: () => undefined }; } createAnalyser() { return { fftSize: 256, frequencyBinCount: 128, smoothingTimeConstant: 0, getFloatTimeDomainData: (values: Float32Array) => values.fill(0.05), getByteFrequencyData: (values: Uint8Array) => values.fill(8), disconnect: () => undefined }; } close() { this.state = "closed"; return Promise.resolve(); } resume() { return Promise.resolve(); } }
    Object.defineProperty(window, "AudioContext", { configurable: true, value: Context });
  });
}

async function mediaState(page: Page) { return page.evaluate(() => structuredClone(window.__observatoryMedia)); }
