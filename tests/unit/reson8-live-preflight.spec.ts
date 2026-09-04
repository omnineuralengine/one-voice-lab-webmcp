import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  readAndValidateReson8PreparedInput,
} from "../../src/lib/providers/reson8/live-preflight";
import { RESON8_LIVE_EXPECTED_PHRASE } from "../../src/lib/providers/reson8/live-verifier";

type WaveOptions = Readonly<{
  durationSeconds?: number;
  encoding?: number;
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
}>;

function pcmWave(options: WaveOptions = {}): Uint8Array {
  const durationSeconds = options.durationSeconds ?? 0.02;
  const encoding = options.encoding ?? 1;
  const sampleRate = options.sampleRate ?? 16_000;
  const channels = options.channels ?? 1;
  const bitsPerSample = options.bitsPerSample ?? 16;
  const blockAlign = channels * (bitsPerSample / 8);
  const dataBytes = Math.round(durationSeconds * sampleRate * blockAlign);
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index);
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, encoding, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  ascii(36, "data");
  view.setUint32(40, dataBytes, true);
  return bytes;
}

async function writePreparedInput(
  directory: string,
  bytes: Uint8Array,
  manifestOverrides: Readonly<Record<string, unknown>> = {},
): Promise<Readonly<{ audioPath: string; manifestPath: string }>> {
  const audioPath = path.join(directory, "input.wav");
  const manifestPath = path.join(directory, "input.manifest.json");
  await writeFile(audioPath, bytes);
  await writeFile(manifestPath, JSON.stringify({
    schemaVersion: "one-reson8-live-audio/1.1.0",
    provenance: "local-synthetic-speech",
    expectedPhrase: RESON8_LIVE_EXPECTED_PHRASE,
    expectedTurns: [RESON8_LIVE_EXPECTED_PHRASE],
    sha256: createHash("sha256").update(bytes).digest("hex"),
    byteLength: bytes.byteLength,
    ...manifestOverrides,
  }));
  return { audioPath, manifestPath };
}

async function expectFailure(
  paths: Readonly<{ audioPath: string; manifestPath: string }>,
  code: string,
  maxAudioSeconds = 10,
): Promise<void> {
  await expect(readAndValidateReson8PreparedInput({ ...paths, maxAudioSeconds })).rejects.toMatchObject({ code });
}

test.describe("Reson8 credential-free audio preflight", () => {
  test("reports missing audio and missing manifest independently", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "one-reson8-preflight-missing-"));
    const paths = {
      audioPath: path.join(directory, "input.wav"),
      manifestPath: path.join(directory, "input.manifest.json"),
    };
    try {
      await expectFailure(paths, "audio-file-missing");
      await writeFile(paths.audioPath, pcmWave());
      await expectFailure(paths, "audio-manifest-missing");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("rejects malformed manifest JSON and unsupported manifest schemas", async () => {
    for (const manifestContents of ["{", JSON.stringify({ schemaVersion: "unsupported" })]) {
      const directory = await mkdtemp(path.join(tmpdir(), "one-reson8-preflight-manifest-"));
      const paths = {
        audioPath: path.join(directory, "input.wav"),
        manifestPath: path.join(directory, "input.manifest.json"),
      };
      try {
        await writeFile(paths.audioPath, pcmWave());
        await writeFile(paths.manifestPath, manifestContents);
        await expectFailure(paths, "audio-manifest-invalid");
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  });

  test("classifies malformed WAV, unsupported encoding, and zero duration", async () => {
    for (const scenario of [
      { bytes: new Uint8Array([1, 2, 3]), code: "audio-format-invalid" },
      { bytes: pcmWave({ encoding: 3 }), code: "audio-format-unsupported" },
      { bytes: pcmWave({ durationSeconds: 0 }), code: "audio-duration-invalid" },
    ]) {
      const directory = await mkdtemp(path.join(tmpdir(), "one-reson8-preflight-format-"));
      try {
        await expectFailure(await writePreparedInput(directory, scenario.bytes), scenario.code);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  });

  test("classifies wrong sample rate, channels, bit depth, and decoded duration", async () => {
    for (const scenario of [
      { bytes: pcmWave({ sampleRate: 8_000 }), code: "audio-sample-rate-invalid" },
      { bytes: pcmWave({ channels: 2 }), code: "audio-channel-count-invalid" },
      { bytes: pcmWave({ bitsPerSample: 8 }), code: "audio-bit-depth-invalid" },
      { bytes: pcmWave({ durationSeconds: 10.01 }), code: "audio-duration-exceeded" },
    ]) {
      const directory = await mkdtemp(path.join(tmpdir(), "one-reson8-preflight-bounds-"));
      try {
        await expectFailure(await writePreparedInput(directory, scenario.bytes), scenario.code);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  });

  test("detects a manifest hash mismatch without creating a provider-use report", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "one-reson8-preflight-integrity-"));
    try {
      const paths = await writePreparedInput(directory, pcmWave(), { sha256: "0".repeat(64) });
      await expectFailure(paths, "audio-manifest-hash-mismatch");
      expect(await readdir(directory)).toEqual(["input.manifest.json", "input.wav"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("accepts canonical local audio without credential, network, or report behavior", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "one-reson8-preflight-valid-"));
    const originalFetch = globalThis.fetch;
    let networkRequests = 0;
    globalThis.fetch = async () => {
      networkRequests += 1;
      throw new Error("The offline preflight attempted a network request.");
    };
    try {
      const paths = await writePreparedInput(directory, pcmWave({ durationSeconds: 0.1 }));
      const result = await readAndValidateReson8PreparedInput({ ...paths, maxAudioSeconds: 10 });
      expect(result.trustedAudio).toMatchObject({
        durationSeconds: 0.1,
        sampleRate: 16_000,
        channels: 1,
        bitsPerSample: 16,
      });
      expect(await readdir(directory)).toEqual(["input.manifest.json", "input.wav"]);
      expect(networkRequests).toBe(0);

      const script = await readFile("scripts/verify-reson8-preflight.ts", "utf8");
      const preflightSource = await readFile("src/lib/providers/reson8/live-preflight.ts", "utf8");
      expect(`${script}\n${preflightSource}`).not.toMatch(/live-credential|RESON8_API_KEY|https?:\/\/|fetch\s*\(/);
    } finally {
      globalThis.fetch = originalFetch;
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("preparation supports explicit bounded regeneration and canonicalizes the synthesizer WAV", async () => {
    const script = await readFile("scripts/prepare-reson8-live-audio.ps1", "utf8");
    expect(script).toContain("[switch]$Force");
    expect(script).toContain("if ($existingDestinations.Count -gt 0 -and -not $Force)");
    expect(script).toContain("ConvertTo-CanonicalPcmWave");
    expect(script).toContain('schemaVersion = "one-reson8-live-audio/1.1.0"');
    expect(script).toContain('expectedTurns = @($expectedPhrase)');
    expect(script).toContain("This short recording verifies turn detection without personal information.");
    expect(script).toContain("Remove-Item -LiteralPath $destination");
    expect(script).not.toContain("report.json");
    expect(script).not.toMatch(/Remove-Item[^\r\n]+-Recurse/);
  });
});
