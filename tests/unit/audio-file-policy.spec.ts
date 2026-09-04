import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { CURATED_UPLOAD_AUDIO_SAMPLES } from "@/data/audio-samples";
import { AUDIO_UPLOAD_LIMITS, validateAudioFile } from "@/lib/audio-file-policy";

test.describe("shared audio file policy", () => {
  test("accepts a supported file only when MIME, extension, and signature agree", async () => {
    const result = await validateAudioFile(wavFile("voice.wav"), { mode: "local" });
    expect(result).toMatchObject({
      ok: true,
      extension: ".wav",
      mimeType: "audio/wav",
      validationSource: "mime-and-signature",
    });

    const recorderFile = new File([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], "capture.webm", { type: "audio/webm;codecs=opus" });
    expect(await validateAudioFile(recorderFile, { mode: "local" })).toMatchObject({ ok: true, extension: ".webm", mimeType: "audio/webm" });
  });

  test("uses a conservative extension fallback only when the signature agrees", async () => {
    const file = wavFile("voice.wav", "application/octet-stream");
    const result = await validateAudioFile(file, { mode: "local" });
    expect(result).toMatchObject({ ok: true, validationSource: "extension-and-signature" });
    expect(result.ok && result.warning).toContain("inferred");
  });

  test("rejects unsupported, empty, oversized, and duplicate selections with specific feedback", async () => {
    const unsupported = new File([new Uint8Array([1, 2, 3, 4])], "notes.txt", { type: "text/plain" });
    expect(await validateAudioFile(unsupported, { mode: "local" })).toEqual({ ok: false, code: "unsupported", message: "Unsupported audio format" });

    const empty = new File([], "empty.wav", { type: "audio/wav" });
    expect(await validateAudioFile(empty, { mode: "local" })).toEqual({ ok: false, code: "empty", message: "File is empty" });

    const oversized = new File([new Uint8Array(AUDIO_UPLOAD_LIMITS.hosted + 1)], "large.wav", { type: "audio/wav" });
    expect(await validateAudioFile(oversized, { mode: "hosted" })).toEqual({ ok: false, code: "too-large", message: "File exceeds the hosted upload limit" });

    const duplicate = wavFile("same.wav");
    expect(await validateAudioFile(duplicate, { mode: "local", currentFile: duplicate })).toEqual({ ok: false, code: "duplicate", message: "This audio file is already selected." });
  });

  test("rejects a supported extension whose bytes or declared MIME do not match", async () => {
    const disguised = new File([new TextEncoder().encode("not audio")], "voice.wav", { type: "audio/wav" });
    expect(await validateAudioFile(disguised, { mode: "local" })).toMatchObject({ ok: false, code: "unsupported" });

    const mismatch = wavFile("voice.wav", "audio/mpeg");
    expect(await validateAudioFile(mismatch, { mode: "local" })).toMatchObject({ ok: false, code: "unsupported" });
  });
});

test.describe("curated upload sample manifest", () => {
  test("references only existing inspected synthetic files with no personal information", () => {
    expect(CURATED_UPLOAD_AUDIO_SAMPLES.length).toBeGreaterThan(0);
    expect(CURATED_UPLOAD_AUDIO_SAMPLES.length).toBeLessThanOrEqual(6);
    for (const sample of CURATED_UPLOAD_AUDIO_SAMPLES) {
      const filePath = resolve(process.cwd(), "public", sample.assetPath.replace(/^\//, ""));
      expect(existsSync(filePath), `${sample.filename} exists`).toBe(true);
      expect(statSync(filePath).size).toBe(sample.sizeBytes);
      expect(readFileSync(filePath).subarray(0, 2).length).toBe(2);
      expect(sample.provenance).toMatchObject({ speech: "synthetic", personalInformation: false });
      expect(sample.provenance.source).toContain("scripts/generate-sample-audio.mjs");
      expect(sample.provenance.license.length).toBeGreaterThan(20);
      expect(sample.availability).toBe("hosted-and-local");
    }
  });

  test("does not persist raw audio or expose it through diagnostic data", () => {
    const dropzone = readFileSync(resolve(process.cwd(), "src/components/upload-audio/AudioFileDropzone.tsx"), "utf8");
    const manifest = readFileSync(resolve(process.cwd(), "src/data/audio-samples.ts"), "utf8");
    expect(`${dropzone}\n${manifest}`).not.toMatch(/localStorage|sessionStorage|data:audio|arrayBuffer\(\).*JSON/i);
  });
});

function wavFile(name: string, type = "audio/wav") {
  return new File([new TextEncoder().encode("RIFFmockWAVEfmt ")], name, { type, lastModified: 1 });
}
