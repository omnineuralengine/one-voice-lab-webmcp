import { expect, test } from "@playwright/test";

import {
  inspectTrustedSttAudio,
  MAX_TRUSTED_STT_AUDIO_BYTES,
  MAX_TRUSTED_STT_DURATION_SECONDS,
} from "@/lib/stt-audio-admission";

test("derives canonical audio-second units from server-read PCM WAV structure", async () => {
  const result = await inspectTrustedSttAudio(pcmWav({ durationSeconds: 2.25 }));

  expect(result).toEqual({
    ok: true,
    audio: {
      format: "pcm-wav",
      durationMilliseconds: 2_250,
      durationSeconds: 2.25,
      quotaUnits: 3,
      sampleRate: 16_000,
      channels: 1,
      bitsPerSample: 16,
    },
  });
});

test("rejects malformed containers and inconsistent PCM fields", async () => {
  const malformedLength = pcmWav({ durationSeconds: 1 });
  const bytes = new Uint8Array(await malformedLength.arrayBuffer());
  bytes[4] = 1;

  expect(await inspectTrustedSttAudio(new File([bytes], "broken.wav", { type: "audio/wav" })))
    .toMatchObject({ ok: false, code: "invalid_audio", status: 400 });

  const badRate = new Uint8Array(await pcmWav({ durationSeconds: 1 }).arrayBuffer());
  writeUint32(badRate, 28, 1);
  expect(await inspectTrustedSttAudio(new File([badRate], "rate.wav", { type: "audio/wav" })))
    .toMatchObject({ ok: false, code: "invalid_audio", status: 400 });
});

test("rejects oversized, over-duration, and unsupported paid transcription input", async () => {
  const oversized = new File(
    [new Uint8Array(MAX_TRUSTED_STT_AUDIO_BYTES + 1)],
    "oversized.wav",
    { type: "audio/wav" },
  );
  expect(await inspectTrustedSttAudio(oversized))
    .toMatchObject({ ok: false, code: "audio_too_large", status: 413 });

  expect(await inspectTrustedSttAudio(pcmWav({
    durationSeconds: MAX_TRUSTED_STT_DURATION_SECONDS + 1,
    sampleRate: 8_000,
    bitsPerSample: 8,
  }))).toMatchObject({ ok: false, code: "audio_too_long", status: 413 });

  const mp3 = new File([new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0])], "sample.mp3", { type: "audio/mpeg" });
  expect(await inspectTrustedSttAudio(mp3))
    .toMatchObject({ ok: false, code: "unsupported_audio", status: 415 });
});

export function pcmWav(options: {
  durationSeconds: number;
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: 8 | 16 | 24 | 32;
}): File {
  const sampleRate = options.sampleRate ?? 16_000;
  const channels = options.channels ?? 1;
  const bitsPerSample = options.bitsPerSample ?? 16;
  const blockAlign = channels * (bitsPerSample / 8);
  const dataBytes = Math.round(options.durationSeconds * sampleRate) * blockAlign;
  const bytes = new Uint8Array(44 + dataBytes);
  writeAscii(bytes, 0, "RIFF");
  writeUint32(bytes, 4, bytes.length - 8);
  writeAscii(bytes, 8, "WAVE");
  writeAscii(bytes, 12, "fmt ");
  writeUint32(bytes, 16, 16);
  writeUint16(bytes, 20, 1);
  writeUint16(bytes, 22, channels);
  writeUint32(bytes, 24, sampleRate);
  writeUint32(bytes, 28, sampleRate * blockAlign);
  writeUint16(bytes, 32, blockAlign);
  writeUint16(bytes, 34, bitsPerSample);
  writeAscii(bytes, 36, "data");
  writeUint32(bytes, 40, dataBytes);
  return new File([bytes], "fixture.wav", { type: "audio/wav", lastModified: 1 });
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  bytes.set(new TextEncoder().encode(value), offset);
}

function writeUint16(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer).setUint16(offset, value, true);
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer).setUint32(offset, value, true);
}
