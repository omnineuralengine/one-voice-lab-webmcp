import "server-only";

export const MAX_TRUSTED_STT_AUDIO_BYTES = 10 * 1024 * 1024;
export const MAX_TRUSTED_STT_DURATION_SECONDS = 5 * 60;

const MAX_WAV_CHUNKS = 32;
const MAX_WAV_METADATA_BYTES = 64 * 1024;

export type TrustedSttAudio = Readonly<{
  format: "pcm-wav";
  durationMilliseconds: number;
  durationSeconds: number;
  quotaUnits: number;
  sampleRate: number;
  channels: number;
  bitsPerSample: 8 | 16 | 24 | 32;
}>;

export type TrustedSttAudioResult =
  | { ok: true; audio: TrustedSttAudio }
  | {
      ok: false;
      code: "audio_too_large" | "unsupported_audio" | "invalid_audio" | "audio_too_long";
      status: 400 | 413 | 415;
      message: string;
    };

/**
 * Establishes a provider-cost admission unit from server-read media structure.
 *
 * Phase 2 intentionally accepts only canonical uncompressed PCM WAV. Other
 * containers need a separately reviewed bounded parser before they can spend
 * provider credits. Browser-supplied duration metadata is never an input.
 */
export async function inspectTrustedSttAudio(file: File): Promise<TrustedSttAudioResult> {
  if (file.size <= 0) return invalid("The audio file is empty.");
  if (file.size > MAX_TRUSTED_STT_AUDIO_BYTES) {
    return {
      ok: false,
      code: "audio_too_large",
      status: 413,
      message: "Paid transcription uploads are limited to 10 MB.",
    };
  }

  try {
    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (header.byteLength !== 12 || ascii(header, 0, 4) !== "RIFF" || ascii(header, 8, 12) !== "WAVE") {
      return unsupported();
    }

    const riffSize = uint32le(header, 4);
    if (riffSize + 8 !== file.size) return invalid("The WAV container length is inconsistent.");

    let offset = 12;
    let chunkCount = 0;
    let metadataBytes = 0;
    let format: { sampleRate: number; channels: number; bitsPerSample: 8 | 16 | 24 | 32; blockAlign: number; byteRate: number } | null = null;

    while (offset + 8 <= file.size && chunkCount < MAX_WAV_CHUNKS) {
      const chunkHeader = new Uint8Array(await file.slice(offset, offset + 8).arrayBuffer());
      if (chunkHeader.byteLength !== 8) return invalid("The WAV chunk header is truncated.");
      const chunkId = ascii(chunkHeader, 0, 4);
      const chunkSize = uint32le(chunkHeader, 4);
      const contentStart = offset + 8;
      const paddedSize = chunkSize + (chunkSize % 2);
      const nextOffset = contentStart + paddedSize;
      if (!Number.isSafeInteger(nextOffset) || nextOffset > file.size) {
        return invalid("The WAV chunk length is inconsistent.");
      }

      chunkCount += 1;
      if (chunkId === "fmt ") {
        if (format || chunkSize !== 16) return unsupported("Only canonical PCM WAV format chunks are supported for paid transcription.");
        const bytes = new Uint8Array(await file.slice(contentStart, contentStart + chunkSize).arrayBuffer());
        if (bytes.byteLength !== 16 || uint16le(bytes, 0) !== 1) {
          return unsupported("Only uncompressed PCM WAV audio is supported for paid transcription.");
        }
        const channels = uint16le(bytes, 2);
        const sampleRate = uint32le(bytes, 4);
        const byteRate = uint32le(bytes, 8);
        const blockAlign = uint16le(bytes, 12);
        const bits = uint16le(bytes, 14);
        if (![8, 16, 24, 32].includes(bits)
            || channels < 1 || channels > 8
            || sampleRate < 8_000 || sampleRate > 192_000
            || blockAlign !== channels * (bits / 8)
            || byteRate !== sampleRate * blockAlign) {
          return invalid("The PCM WAV format fields are inconsistent.");
        }
        format = {
          sampleRate,
          channels,
          bitsPerSample: bits as 8 | 16 | 24 | 32,
          blockAlign,
          byteRate,
        };
      } else if (chunkId === "data") {
        if (!format || chunkSize <= 0 || chunkSize % format.blockAlign !== 0) {
          return invalid("The PCM WAV data chunk is missing or misaligned.");
        }
        // Requiring audio data to be final makes the declared duration and the
        // complete container length independently checkable without decoding.
        if (nextOffset !== file.size) return unsupported("PCM WAV audio data must be the final chunk.");
        const durationSeconds = chunkSize / format.byteRate;
        if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
          return invalid("The PCM WAV duration could not be verified.");
        }
        if (durationSeconds > MAX_TRUSTED_STT_DURATION_SECONDS) {
          return {
            ok: false,
            code: "audio_too_long",
            status: 413,
            message: "Paid transcription audio is limited to five minutes.",
          };
        }
        return {
          ok: true,
          audio: {
            format: "pcm-wav",
            durationMilliseconds: Math.round(durationSeconds * 1_000),
            durationSeconds,
            quotaUnits: Math.ceil(durationSeconds),
            sampleRate: format.sampleRate,
            channels: format.channels,
            bitsPerSample: format.bitsPerSample,
          },
        };
      } else {
        metadataBytes += 8 + paddedSize;
        if (metadataBytes > MAX_WAV_METADATA_BYTES) {
          return unsupported("WAV metadata is too large to verify safely.");
        }
      }

      offset = nextOffset;
    }

    return chunkCount >= MAX_WAV_CHUNKS
      ? unsupported("The WAV container has too many chunks to verify safely.")
      : invalid("The PCM WAV data chunk is missing.");
  } catch {
    return invalid("The audio file could not be read safely.");
  }
}

function invalid(message: string): TrustedSttAudioResult {
  return { ok: false, code: "invalid_audio", status: 400, message };
}

function unsupported(message = "Paid transcription currently supports verified PCM WAV audio only."): TrustedSttAudioResult {
  return { ok: false, code: "unsupported_audio", status: 415, message };
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

function uint16le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function uint32le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]
    + bytes[offset + 1] * 0x100
    + bytes[offset + 2] * 0x10000
    + bytes[offset + 3] * 0x1000000) >>> 0;
}
