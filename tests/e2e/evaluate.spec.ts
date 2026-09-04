import { expect, test, type Page } from "@playwright/test";

import type {
  EvaluationEvidenceBundle,
  EvaluationMetric,
  EvaluationProviderEvidence,
  EvaluationRunRequest,
} from "@/lib/evaluation/schema";
import { createBlindAssignments } from "@/lib/evaluation/blind";
import type { ProviderId } from "@/lib/providers/types";

test.describe("ONE Voice Lab Evaluate", () => {
  test("runs the real deterministic fixture path without contacting a provider", async ({ page }) => {
    let providerCalls = 0;
    await page.route(/api\.(?:deepgram|elevenlabs|fish\.audio|cartesia|reson8)\./, (route) => {
      providerCalls += 1;
      return route.abort();
    });
    await page.goto("/evaluate");
    const run = page.getByRole("button", { name: "Run comparison" });
    await expect(run).toBeEnabled();
    await run.click();
    await expect(page.locator(".evaluate-run-message")).toContainText("Evaluation complete");
    await expect(page.locator(".evaluate-result-card")).toHaveCount(2);
    await expect(page.locator(".evaluate-result-card[data-status='complete']")).toHaveCount(2);
    await expect(page.locator("audio")).toHaveCount(2);
    expect(providerCalls).toBe(0);
  });

  test("hides provider mapping before the first blind result arrives", async ({ page }) => {
    let runRequests = 0;
    await mockEvaluateApis(page, () => {
      runRequests += 1;
      return { partialFailure: false };
    }, 800);
    await page.goto("/evaluate");
    await page.getByRole("radio", { name: "Standardized" }).focus();
    await page.getByRole("radio", { name: "Standardized" }).press("ArrowRight");
    await expect(page.getByRole("radio", { name: "Provider-optimized" })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("checkbox", { name: "Blind listening mode" }).check();
    await expect(page.getByRole("radio", { name: "Standardized" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("radio", { name: "Provider-optimized" })).toBeDisabled();
    const run = page.getByRole("button", { name: "Run comparison" });
    await expect(run).toBeEnabled();
    await run.evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    await expect(page.getByRole("heading", { name: "Comparison setup hidden until reveal" })).toBeVisible();
    await expect(page.locator(".evaluate-provider-setup")).toHaveCount(0);
    const lanes = page.getByRole("region", { name: "Independent provider lane status" });
    await expect(lanes).toContainText("Unidentified voice lanes");
    await expect(lanes).not.toContainText(/Cartesia|Deepgram|fixture-cartesia|fixture-deepgram/);
    await expect(page.locator(".evaluate-result-card")).toHaveCount(2);
    expect(runRequests).toBe(1);
  });

  test("changes providers, models, and voices, then starts synchronized playback", async ({ page }) => {
    await mockEvaluateApis(page, () => ({ partialFailure: false }));
    await page.goto("/evaluate");

    await page.getByRole("checkbox", { name: /Cartesia/ }).uncheck();
    await page.getByRole("checkbox", { name: /ElevenLabs/ }).check();
    const elevenLabs = page.locator(".evaluate-provider-setup[data-provider='elevenlabs']");
    await elevenLabs.getByLabel("Exact model").selectOption("fixture-elevenlabs-tts-v2");
    await elevenLabs.getByLabel("Exact voice").selectOption("fixture-elevenlabs-voice-v2");
    await page.getByRole("radio", { name: /Detailed/ }).check();

    await page.getByRole("button", { name: "Run comparison" }).click();
    await expect(page.getByRole("heading", { name: "ElevenLabs", exact: true })).toBeVisible();
    await expect(page.getByText("fixture-elevenlabs-tts-v2", { exact: true })).toBeVisible();
    await expect(page.getByText("fixture-elevenlabs-voice-v2", { exact: true })).toBeVisible();
    await page.locator("audio").evaluateAll((players) => {
      for (const player of players) player.addEventListener("play", () => { player.dataset.playObserved = "true"; }, { once: true });
    });
    await page.getByRole("button", { name: "Play together" }).click();
    await expect.poll(() => page.locator("audio[data-play-observed='true']").count()).toBe(2);
    await page.getByRole("button", { name: "Pause all" }).click();
  });

  test("preserves partial results, supports blind ratings, and roundtrips evidence", async ({ page }) => {
    let runCount = 0;
    let catalogRequests = 0;
    let runRequests = 0;
    let providerCalls = 0;
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("/api/evaluate/catalogs")) catalogRequests += 1;
      if (url.includes("/api/evaluate/run")) runRequests += 1;
      if (/api\.(?:deepgram|elevenlabs|fish\.audio|cartesia|reson8)\./.test(url)) providerCalls += 1;
    });
    await mockEvaluateApis(page, () => ({ partialFailure: runCount++ === 0 }));
    await page.goto("/evaluate");

    await expect(page.getByRole("heading", { name: "Compare voice outputs" })).toBeVisible();
    await expect(page.getByText(/Start with what you hear/)).toBeVisible();
    await expect(page.getByText(/one comparison is not a universal ranking/i)).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /Cartesia/ })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: /Deepgram/ })).toBeChecked();
    await expect(page.getByText("Fixture catalog", { exact: true })).toHaveCount(4);
    const run = page.getByRole("button", { name: "Run comparison" });
    await expect(run).toBeEnabled();

    await run.click();
    await expect(page.locator(".evaluate-result-card")).toHaveCount(2);
    await expect(page.getByRole("heading", { name: "Cartesia", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Deepgram", exact: true })).toBeVisible();
    await expect(page.locator(".evaluate-status--complete").filter({ hasText: "Complete" }).first()).toBeVisible();
    await expect(page.locator(".evaluate-status--failed").filter({ hasText: "Failed" }).first()).toBeVisible();
    await expect(page.locator("audio")).toHaveCount(1);
    await expect.poll(() => page.locator("audio").evaluate((audio) => (audio as HTMLAudioElement).readyState)).toBeGreaterThan(0);
    await expect(page.getByText(/Results that arrived|Successful evidence remains|Evaluation complete/).first()).toBeVisible();
    const script = page.getByRole("textbox", { name: "Test script" });
    const originalScript = await script.inputValue();
    await script.fill(`${originalScript} Updated.`);
    await expect(page.getByText(/results belong to the previous configuration/i)).toBeVisible();
    await script.fill(originalScript);

    await page.getByRole("button", { name: "Reset results" }).click();
    await page.getByRole("checkbox", { name: "Blind listening mode" }).check();
    await page.getByRole("button", { name: "Run comparison" }).click();
    const cards = page.locator(".evaluate-result-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0).getByRole("heading", { name: "Voice A" })).toBeVisible();
    await expect(cards.nth(1).getByRole("heading", { name: "Voice B" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Comparison setup hidden until reveal" })).toBeVisible();
    await expect(cards.getByText("Server time to first chunk")).toHaveCount(0);
    await expect(cards.getByText(/fixture-(cartesia|deepgram)/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Export evidence JSON" })).toBeDisabled();

    const voiceA = cards.filter({ has: page.getByRole("heading", { name: "Voice A" }) });
    const naturalness = voiceA.locator(".evaluate-rating-row").filter({ hasText: "Naturalness" });
    await naturalness.getByRole("button", { name: "5 out of 5" }).click();
    await voiceA.getByRole("checkbox", { name: "My overall preference" }).check();
    await page.getByRole("button", { name: "Submit preference and reveal" }).click();
    await expect(page.getByRole("heading", { name: /^Voice A → (Cartesia|Deepgram)$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export evidence JSON" })).toBeEnabled();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export evidence JSON" }).click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const exported = Buffer.concat(chunks);
    const exportedText = exported.toString("utf8");
    expect(exportedText).toContain('"schemaVersion": "one-voice-evidence/1.0.0"');
    expect(exportedText).toContain('"ratedBeforeReveal": true');
    expect(exportedText).not.toMatch(/audioBase64|authorization|api[_-]?key|Bearer\s/i);

    await page.getByRole("button", { name: "Reset results" }).click();
    const importedBundle = JSON.parse(exportedText) as EvaluationEvidenceBundle;
    importedBundle.providerResults = importedBundle.providerResults.map((result) => ({ ...result, environment: "protected-live" }));
    const imported = Buffer.from(JSON.stringify(importedBundle));
    const catalogsBeforeImport = catalogRequests;
    const runsBeforeImport = runRequests;
    await page.locator('input[type="file"][accept*="json"]').setInputFiles({
      name: "one-voice-evidence.json",
      mimeType: "application/json",
      buffer: imported,
    });
    await expect(page.getByText(/Imported 2 sanitized provider results/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Inspection only—no provider discovery or paid calls" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Execution evidence mode" })).toHaveValue("fixture");
    await expect(page.locator(".evaluate-result-card")).toHaveCount(2);
    await expect(page.locator(".evaluate-ratings").first()).toHaveAttribute("disabled", "");
    await expect(page.getByText(/No paid calls were made/)).toBeVisible();
    await page.waitForTimeout(250);
    expect(catalogRequests).toBe(catalogsBeforeImport);
    expect(runRequests).toBe(runsBeforeImport);
    expect(providerCalls).toBe(0);
  });

  test("fits phone, tablet, and desktop with the five-capability navigation", async ({ page }) => {
    await mockEvaluateApis(page, () => ({ partialFailure: false }));
    const viewports = [
      { width: 360, height: 800, stacked: true },
      { width: 390, height: 844, stacked: true },
      { width: 768, height: 1024, stacked: true },
      { width: 1440, height: 900, stacked: false },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto("/evaluate");
      const run = page.getByRole("button", { name: "Run comparison" });
      await expect(run).toBeEnabled();
      const runBox = await run.boundingBox();
      expect(runBox?.height, `${viewport.width}px run target`).toBeGreaterThanOrEqual(44);
      await run.click();
      await expect(page.locator(".evaluate-result-card")).toHaveCount(2);
      const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
      expect(dimensions.scrollWidth, `${viewport.width}px horizontal overflow`).toBeLessThanOrEqual(dimensions.clientWidth + 1);
      const first = await page.locator(".evaluate-result-card").nth(0).boundingBox();
      const second = await page.locator(".evaluate-result-card").nth(1).boundingBox();
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      if (viewport.stacked) {
        expect(second!.y, `${viewport.width}px cards stack vertically`).toBeGreaterThan(first!.y + first!.height - 1);
        await expect(page.locator(".voice-open-nav__links a:visible")).toHaveCount(5);
        const evaluateLink = page.locator(".voice-open-nav__links").getByRole("link", { name: "Evaluate" });
        await expect(evaluateLink).toHaveAttribute("aria-current", "page");
      } else {
        expect(second!.x, "desktop uses a compact comparison grid").toBeGreaterThan(first!.x + first!.width - 1);
        await expect(page.getByRole("link", { name: "Evaluate", exact: true })).toBeVisible();
      }
      await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator(".voice-open-nav__links").getByRole("link")).toHaveCount(5);
    await expect(page.getByRole("link", { name: /^Evaluate voice outputs/ })).toBeVisible();
  });
});

async function mockEvaluateApis(page: Page, nextRun: () => { partialFailure: boolean }, runDelayMs = 0) {
  const providers: Array<{ id: ProviderId; displayName: string }> = [
    { id: "deepgram", displayName: "Deepgram" },
    { id: "elevenlabs", displayName: "ElevenLabs" },
    { id: "fish-audio", displayName: "Fish Audio" },
    { id: "cartesia", displayName: "Cartesia" },
  ];
  await page.route("**/api/evaluate/capabilities", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      schemaVersion: "one-voice-evidence/1.0.0",
      executionDefault: "fixture",
      liveEvaluationsEnabled: false,
      anonymousLiveEvaluationsEnabled: false,
      localLiveAvailable: false,
      maximumTextLength: 600,
      providers: providers.map((provider) => ({
        ...provider,
        implementation: "implemented",
        readiness: { listed: true, configured: false, adapterBacked: true, liveEnabled: false },
        protectedLiveAvailable: false,
        localLiveAvailable: false,
        fixtureAvailable: true,
        limitations: ["Deterministic fixture only in this browser test."],
      })),
    }),
  }));
  await page.route("**/api/evaluate/catalogs?*", (route) => {
    const providerId = new URL(route.request().url()).searchParams.get("provider") as ProviderId;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: "one-voice-evidence/1.0.0",
        providerId,
        mode: "fixture",
        source: "deterministic-fixture",
        models: [
          { id: `fixture-${providerId}-tts-v1`, name: "Deterministic fixture model", description: null, languages: ["fixture"] },
          { id: `fixture-${providerId}-tts-v2`, name: "Alternate deterministic fixture model", description: null, languages: ["fixture"] },
        ],
        voices: [
          { id: `fixture-${providerId}-voice-v1`, name: "Deterministic fixture voice", description: null, previewAvailable: true },
          { id: `fixture-${providerId}-voice-v2`, name: "Alternate deterministic fixture voice", description: null, previewAvailable: true },
        ],
        hasMoreVoices: false,
        nextVoicePageToken: null,
        separateVoiceRequired: true,
        outputFormat: "fixture-wav",
        normalizedOutput: { encoding: "pcm_s16le", sampleRate: 24_000, channels: 1, mimeType: "audio/wav", serverWrapped: true },
        message: "Fixture metadata only; no provider request was made.",
        limitations: ["Deterministic browser fixture only; no provider quality claim."],
      }),
    });
  });
  await page.route("**/api/evaluate/run", async (route) => {
    const request = route.request().postDataJSON() as EvaluationRunRequest;
    const response = makeRun(request, nextRun().partialFailure);
    if (runDelayMs) await new Promise((resolve) => setTimeout(resolve, runDelayMs));
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(response) });
  });
}

function makeRun(request: EvaluationRunRequest, partialFailure: boolean) {
  const at = "2026-08-26T17:00:00.000Z";
  const assignments = createBlindAssignments(request.providers.map((selection) => selection.providerId), request.blind.seed);
  const providerResults = request.providers.map((selection, index) => makeProviderEvidence(
    request,
    selection.providerId,
    selection.model,
    selection.voice,
    assignments[selection.providerId] ?? "Voice A",
    index,
    partialFailure && index === 1,
  ));
  const bundle: EvaluationEvidenceBundle = {
    schemaVersion: "one-voice-evidence/1.0.0",
    methodologyVersion: "one-tts-compare/1.0.0",
    exportedAt: at,
    evaluationId: request.evaluationId,
    runId: request.runId,
    scenario: request.scenario,
    evaluationMode: request.evaluationMode,
    blind: { enabled: request.blind.enabled, seed: request.blind.seed, revealed: false, revealedAt: null },
    providerResults,
    evidenceCategories: { measured: true, humanRated: false, modelJudged: false },
    modelJudgeResults: null,
    visibility: "private",
    consent: { publication: false, publicEvidencePool: false },
    retention: { mode: "ephemeral", audioEmbedded: false, rawProviderPayloadsEmbedded: false },
    sponsorshipDisclosure: null,
    limitations: ["Deterministic browser fixture; not provider quality evidence."],
  };
  const events = [
    { type: "run-started", evaluationId: request.evaluationId, runId: request.runId, providerIds: request.providers.map((provider) => provider.providerId), startedAt: at },
    ...providerResults.flatMap((result) => [
      { type: "provider-state", providerId: result.provider, status: "streaming", at },
      { type: "provider-result", result, audioBase64: result.status === "complete" ? silentWavBase64() : null, at },
    ]),
    { type: "run-complete", evaluationId: request.evaluationId, runId: request.runId, completedAt: at, bundle },
  ];
  return { events, bundle };
}

function makeProviderEvidence(
  request: EvaluationRunRequest,
  provider: ProviderId,
  model: string,
  voice: string,
  blindLabel: EvaluationProviderEvidence["blindLabel"],
  index: number,
  failed: boolean,
): EvaluationProviderEvidence {
  const at = "2026-08-26T17:00:00.000Z";
  const measurementPoints: Record<EvaluationMetric["name"], EvaluationMetric["measurementPoint"]> = {
    server_time_to_first_audio_chunk: "one-server",
    time_to_first_audible_output: "one-browser",
    total_generation_time: "one-server",
    audio_duration: "derived",
    real_time_factor: "derived",
    request_success: "one-server",
    client_time_to_playable: "one-browser",
    estimated_cost: "derived",
  };
  const metric = (name: EvaluationMetric["name"], value: number | null, unit: EvaluationMetric["unit"], availability: EvaluationMetric["availability"] = "measured"): EvaluationMetric => ({
    name,
    value,
    unit,
    availability,
    measurementPoint: measurementPoints[name],
    metricVersion: "one-tts-metrics/1.0.0",
    provenance: {
      clock: availability === "unavailable"
        ? "not-applicable"
        : name === "client_time_to_playable" || name === "time_to_first_audible_output"
          ? "browser-monotonic"
          : "server-monotonic",
      description: availability === "unavailable" ? "Not reliably measurable in this fixture." : "Measured by the deterministic mocked ONE boundary.",
    },
  });
  return {
    runId: request.runId,
    provider,
    blindLabel,
    model,
    voice,
    providerSpecificConfiguration: { normalizedEncoding: "pcm_s16le", sampleRate: 24_000 },
    adapterVersion: "one-browser-fixture/1.0.0",
    environment: "fixture",
    region: null,
    regionScope: null,
    requestTimestamp: at,
    firstAudioTimestamp: failed ? null : at,
    completionTimestamp: at,
    clientPlayableTimestamp: null,
    metrics: [
      metric("server_time_to_first_audio_chunk", failed ? null : 20 + index, failed ? "unavailable" : "milliseconds", failed ? "unavailable" : "measured"),
      metric("time_to_first_audible_output", null, "unavailable", "unavailable"),
      metric("total_generation_time", failed ? null : 45 + index, failed ? "unavailable" : "milliseconds", failed ? "unavailable" : "measured"),
      metric("audio_duration", failed ? null : 0.12, failed ? "unavailable" : "seconds", failed ? "unavailable" : "measured"),
      metric("real_time_factor", failed ? null : (45 + index) / 1_000 / 0.12, failed ? "unavailable" : "ratio", failed ? "unavailable" : "measured"),
      metric("request_success", failed ? 0 : 1, "boolean"),
      metric("client_time_to_playable", null, "unavailable", "unavailable"),
      metric("estimated_cost", null, "unavailable", "unavailable"),
    ],
    audio: {
      mimeType: failed ? null : "audio/wav",
      durationSeconds: failed ? null : 0.12,
      storageReference: failed ? null : `ephemeral:${request.runId}:${provider}`,
      contentHash: failed ? null : `sha256:${"a".repeat(64)}`,
      rawContentHash: failed ? null : `sha256:${"b".repeat(64)}`,
      normalized: !failed,
    },
    status: failed ? "failed" : "complete",
    trace: failed ? [{ type: "failure", timestamp: at, offsetMs: 45, observation: "observed", detail: "Sanitized mocked provider failure." }] : [
      { type: "provider-request-start", timestamp: at, offsetMs: 0, observation: "observed", detail: "Mock request started." },
      { type: "first-audio-chunk", timestamp: at, offsetMs: 20 + index, observation: "observed", detail: "First mocked audio bytes arrived." },
      { type: "completion", timestamp: at, offsetMs: 45 + index, observation: "observed", detail: "Mock request completed." },
    ],
    sanitizedError: failed ? { code: "mock_failure", message: `${provider} fixture failed safely.`, retryable: false } : null,
    humanRating: { naturalness: null, intelligibility: null, pronunciation: null, emotionalFit: null, useCaseFit: null, overallPreference: false, ratedAt: null, ratedBeforeReveal: null },
    sponsorshipDisclosure: null,
  };
}

function silentWavBase64() {
  const sampleCount = 2_880;
  const buffer = Buffer.alloc(44 + sampleCount * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(24_000, 24);
  buffer.writeUInt32LE(48_000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(sampleCount * 2, 40);
  return buffer.toString("base64");
}
