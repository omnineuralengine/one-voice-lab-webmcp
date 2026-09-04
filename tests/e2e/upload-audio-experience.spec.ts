import { expect, test, type Page } from "@playwright/test";

test.describe("@upload-audio drag, preview, samples, and cleanup", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium-1440x900", "Upload interaction coverage runs once.");
    await page.addInitScript(() => {
      const create = URL.createObjectURL.bind(URL);
      const revoke = URL.revokeObjectURL.bind(URL);
      const audit = { created: [] as string[], revoked: [] as string[] };
      Object.defineProperty(window, "__audioUrlAudit", { value: audit, configurable: true });
      URL.createObjectURL = (value) => {
        const url = create(value);
        audit.created.push(url);
        return url;
      };
      URL.revokeObjectURL = (url) => {
        audit.revoked.push(url);
        revoke(url);
      };
    });
    await page.goto("/?module=upload-audio");
  });

  test("clicking and keyboard activation open the picker without starting transcription", async ({ page }) => {
    let deepgramCalls = 0;
    await page.route("**/api/deepgram/transcribe-file", async (route) => {
      deepgramCalls += 1;
      await route.abort();
    });

    const dropZone = page.getByTestId("audio-drop-zone");
    const clickChooser = page.waitForEvent("filechooser");
    await dropZone.click();
    await (await clickChooser).setFiles(wavPayload("browse.wav", 800));
    await expect(page.getByText("browse.wav", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: /Remove browse\.wav/i }).click();
    await expect(dropZone).toBeFocused();
    const keyboardChooser = page.waitForEvent("filechooser");
    await dropZone.press("Enter");
    await (await keyboardChooser).setFiles(wavPayload("keyboard.wav", 400));
    await expect(page.getByText("keyboard.wav", { exact: true })).toBeVisible();
    expect(deepgramCalls).toBe(0);
  });

  test("drop prevents browser navigation, validates metadata, and reports invalid files", async ({ page }) => {
    const supported = wavBytes(1_200);
    const prevented = await dispatchFileDrop(page, { name: "dropped.wav", type: "audio/wav", bytes: Array.from(supported) });
    expect(prevented).toBe(true);
    await expect(page.getByText("dropped.wav", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Selected audio file")).toContainText("audio/wav");
    await expect(page.getByLabel("Selected audio file")).toContainText("WAV");
    await expect(page.getByLabel(/Preview selected audio: dropped\.wav/)).toHaveJSProperty("paused", true);

    await dispatchFileDrop(page, { name: "not-audio.txt", type: "text/plain", bytes: [1, 2, 3] });
    await expect(page.getByRole("alert").filter({ hasText: "Unsupported audio format" })).toBeVisible();

    await dispatchFileDrop(page, { name: "empty.wav", type: "audio/wav", bytes: [] });
    await expect(page.getByRole("alert").filter({ hasText: "File is empty" })).toBeVisible();
  });

  test("replace and remove revoke object URLs and reset the preview", async ({ page }) => {
    await page.getByLabel("Upload audio file").setInputFiles(wavPayload("first.wav", 400));
    await expect(page.getByText("first.wav", { exact: true })).toBeVisible();
    const firstUrl = await page.evaluate(() => (window as unknown as { __audioUrlAudit: { created: string[] } }).__audioUrlAudit.created.at(-1));

    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Replace", exact: true }).click();
    await (await chooserPromise).setFiles(wavPayload("second.wav", 600));
    await expect(page.getByText("second.wav", { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate((url) => (window as unknown as { __audioUrlAudit: { revoked: string[] } }).__audioUrlAudit.revoked.includes(String(url)), firstUrl)).toBe(true);

    await page.getByRole("button", { name: /Remove second\.wav/i }).click();
    await expect(page.getByLabel("Selected audio file")).toHaveCount(0);
    await expect(page.getByTestId("audio-drop-zone")).toBeFocused();
  });

  test("sample selection shares validation, stays idle, hands off locally, and revokes on unmount", async ({ page }) => {
    let deepgramCalls = 0;
    await page.route("**/api/deepgram/transcribe-file", async (route) => {
      deepgramCalls += 1;
      await route.abort();
    });

    await page.getByRole("button", { name: /Polished English speech/ }).click();
    await expect(page.getByText("media-podcast-clip.mp3", { exact: true })).toBeVisible();
    await expect(page.getByLabel(/Preview selected audio: media-podcast-clip\.mp3/)).toHaveJSProperty("paused", true);
    await expect(page.getByText(/Validated by MIME type and file signature/)).toBeVisible();
    expect(deepgramCalls).toBe(0);

    const selectedUrl = await page.evaluate(() => (window as unknown as { __audioUrlAudit: { created: string[] } }).__audioUrlAudit.created.at(-1));
    await page.getByRole("button", { name: "Use in Audio Signal Lab" }).click();
    await expect(page.getByTestId("audio-signal-lab")).toBeVisible();
    await expect(page.getByText(/media-podcast-clip\.mp3 loaded into memory for local analysis/i)).toBeVisible();
    expect(deepgramCalls).toBe(0);
    await expect.poll(() => page.evaluate((url) => (window as unknown as { __audioUrlAudit: { revoked: string[] } }).__audioUrlAudit.revoked.includes(String(url)), selectedUrl)).toBe(true);
  });
});

async function dispatchFileDrop(page: Page, file: { name: string; type: string; bytes: number[] }) {
  return page.getByTestId("audio-drop-zone").evaluate((element, payload) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([Uint8Array.from(payload.bytes)], payload.name, { type: payload.type, lastModified: 1 }));
    const event = new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  }, file);
}

function wavPayload(name: string, sampleCount: number) {
  return { name, mimeType: "audio/wav", buffer: wavBytes(sampleCount) };
}

function wavBytes(sampleCount: number) {
  const bytes = Buffer.alloc(44 + sampleCount * 2);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVE", 8);
  bytes.write("fmt ", 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8_000, 24);
  bytes.writeUInt32LE(16_000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(sampleCount * 2, 40);
  return bytes;
}
