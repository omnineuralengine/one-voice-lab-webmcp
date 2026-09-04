import { expect, test, type Page } from "@playwright/test";

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.config.metadata.observatory !== true, "Upload language coverage uses the isolated Observatory runner.");
});

test.describe("@transcribe-file multilingual local audio", () => {
  let requestBodies: string[];

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-1440x900", "Functional file-language coverage runs once.");
    requestBodies = [];
    await mockFileTranscription(page, requestBodies);
    await page.goto("/");
    await page.getByRole("button", { name: /Upload Audio/i }).first().click();
    await page.getByLabel("Upload audio file").setInputFiles({
      name: "italian-sample.wav",
      mimeType: "audio/wav",
      buffer: Buffer.from("RIFFmockWAVEfmt "),
    });
  });

  test("choosing a known language updates local state without transcribing", async ({ page }) => {
    await page.getByLabel("File spoken language", { exact: true }).selectOption("it");
    await expect(page.getByLabel("File spoken language", { exact: true })).toHaveValue("it");
    await expect(page.getByText(/italian-sample\.wav selected/i)).toBeVisible();
    expect(requestBodies).toEqual([]);
  });

  test("known Italian submits language=it and no detection request", async ({ page }) => {
    await page.getByLabel("File spoken language", { exact: true }).selectOption("it");
    await page.locator('[data-shortcut-command="run_primary"]').click();
    await expect.poll(() => requestBodies.length).toBe(1);
    expect(multipartField(requestBodies[0], "language")).toBe("it");
    expect(multipartField(requestBodies[0], "detect_language")).toBe("false");
    await expect(page.getByTestId("transcribe-file-outcome")).toContainText("Requested languageItalian (it)");
    await expect(page.getByTestId("transcribe-file-outcome")).toContainText("Detected languageUnavailable");
  });

  test("auto-detect omits fixed language and displays measured response language", async ({ page }) => {
    await page.getByLabel("Auto-detect").check();
    await expect(page.getByLabel("File spoken language", { exact: true })).toBeDisabled();
    expect(requestBodies).toEqual([]);
    await page.locator('[data-shortcut-command="run_primary"]').click();
    await expect.poll(() => requestBodies.length).toBe(1);
    expect(multipartField(requestBodies[0], "detect_language")).toBe("true");
    expect(multipartField(requestBodies[0], "language")).toBeUndefined();
    await expect(page.getByTestId("transcribe-file-outcome")).toContainText("Requested languageAuto-detect (no fixed language)");
    await expect(page.getByTestId("transcribe-file-outcome")).toContainText("Detected languageit");
  });

  test("a 2xx empty file transcript is not presented as ordinary success", async ({ page }) => {
    await page.getByLabel("Upload audio file").setInputFiles({
      name: "empty.wav",
      mimeType: "audio/wav",
      buffer: Buffer.from("RIFFemptWAVEfmt "),
    });
    await page.locator('[data-shortcut-command="run_primary"]').click();
    await expect(page.getByTestId("transcribe-file-outcome")).toContainText("Request completed with empty transcript");
    await expect(page.getByTestId("transcribe-file-outcome")).toContainText("No speech was recognized for the selected spoken-language setting.");
    await expect(page.getByText("File transcription complete.")).toHaveCount(0);
  });
});

async function mockFileTranscription(page: Page, requestBodies: string[]) {
  await page.route("**/api/deepgram/transcribe-file", async (route) => {
    const body = route.request().postData() || "";
    requestBodies.push(body);
    const autoDetect = multipartField(body, "detect_language") === "true";
    const language = multipartField(body, "language") || "it";
    const fileName = multipartFilename(body) || "uploaded.wav";
    const transcript = fileName === "empty.wav" ? "" : "Buongiorno, questa è una prova locale.";
    const raw = {
      metadata: { request_id: "file-request-sanitized-1234" },
      results: {
        channels: [{
          detected_language: autoDetect ? "it" : undefined,
          alternatives: [{ transcript, words: [] }],
        }],
      },
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(envelope({
        ok: true,
        transcript,
        raw,
        request: {
          source: "file",
          filename: fileName,
          fileType: "audio/wav",
          fileSize: 16,
          model: "nova-3",
          language,
          smart_format: true,
          diarize: false,
          punctuate: true,
          utterances: false,
          paragraphs: false,
          numerals: false,
          detect_language: autoDetect,
          multichannel: false,
        },
      })),
    });
  });
}

function multipartField(body: string, name: string) {
  const match = body.match(new RegExp(`name="${name}"\\r?\\n\\r?\\n([^\\r\\n]*)`));
  return match?.[1];
}

function multipartFilename(body: string) {
  return body.match(/name="file"; filename="([^"]+)"/)?.[1];
}

function envelope<T>(data: T) {
  const at = "2026-07-14T12:00:00.000Z";
  return {
    ok: true,
    data,
    inspector: {
      id: "safe-file-inspector",
      module: "Upload Audio File",
      startedAt: at,
      completedAt: at,
      durationMs: 0,
      request: { method: "POST", endpoint: "/api/deepgram/transcribe-file", headers: { Authorization: "[REDACTED]" } },
      response: { status: 200, bodyPreview: data },
      timeline: [],
      notes: ["Mock-only response."],
    },
  };
}
