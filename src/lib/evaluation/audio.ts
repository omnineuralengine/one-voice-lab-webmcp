export const STANDARDIZED_AUDIO = Object.freeze({
  encoding: "pcm_s16le",
  sampleRate: 24_000,
  channels: 1,
  bitsPerSample: 16,
  mimeType: "audio/wav",
  normalizerVersion: "one-pcm-wav/1.0.0",
});

const SUPPORTED_AUDIO_MIME_TYPES = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
  "audio/webm",
  "audio/mp4",
  "audio/pcm",
  "audio/l16",
]);

export type ValidatedEvaluationAudio = Readonly<{
  bytes: Uint8Array;
  mimeType: string;
  durationSeconds: number | null;
  normalized: boolean;
}>;

export class EvaluationAudioValidationError extends Error {
  constructor(readonly code: "empty" | "too_large" | "unsupported_type" | "malformed", message: string) {
    super(message);
    this.name = "EvaluationAudioValidationError";
  }
}

export function pcm16MonoToWav(pcm: Uint8Array, sampleRate: number = STANDARDIZED_AUDIO.sampleRate): Uint8Array {
  if (pcm.byteLength === 0 || pcm.byteLength % 2 !== 0) {
    throw new Error("Raw PCM must contain a non-empty, even number of signed 16-bit samples.");
  }
  if (!Number.isInteger(sampleRate) || sampleRate < 8_000 || sampleRate > 192_000) {
    throw new Error("PCM sample rate is outside the supported range.");
  }

  const output = new Uint8Array(44 + pcm.byteLength);
  const view = new DataView(output.buffer);
  writeAscii(output, 0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeAscii(output, 8, "WAVE");
  writeAscii(output, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, STANDARDIZED_AUDIO.channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * STANDARDIZED_AUDIO.channels * 2, true);
  view.setUint16(32, STANDARDIZED_AUDIO.channels * 2, true);
  view.setUint16(34, STANDARDIZED_AUDIO.bitsPerSample, true);
  writeAscii(output, 36, "data");
  view.setUint32(40, pcm.byteLength, true);
  output.set(pcm, 44);
  return output;
}

export function durationSecondsForPcm16Mono(byteLength: number, sampleRate: number = STANDARDIZED_AUDIO.sampleRate): number {
  if (!Number.isInteger(byteLength) || byteLength <= 0 || byteLength % 2 !== 0) {
    throw new Error("PCM byte length must be a positive even integer.");
  }
  return byteLength / (sampleRate * 2);
}

export function isPcm16MonoPayload(bytes: Uint8Array): boolean {
  return bytes.byteLength > 0 && bytes.byteLength % 2 === 0;
}

export function validateEvaluationAudio(
  input: ArrayBuffer | Uint8Array,
  declaredContentType: string,
  options: Readonly<{ maxBytes: number; sampleRate?: number }>,
): ValidatedEvaluationAudio {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength === 0) throw new EvaluationAudioValidationError("empty", "The provider returned an empty audio response.");
  if (bytes.byteLength > options.maxBytes) throw new EvaluationAudioValidationError("too_large", "The provider audio response exceeded the evaluation limit.");

  const mimeType = declaredContentType.split(";", 1)[0].trim().toLowerCase();
  if (!SUPPORTED_AUDIO_MIME_TYPES.has(mimeType)) throw new EvaluationAudioValidationError("unsupported_type", "The provider returned an unsupported audio content type.");

  if (mimeType === "audio/wav" || mimeType === "audio/x-wav") {
    const durationSeconds = durationSecondsForWav(bytes);
    if (durationSeconds === null) throw new EvaluationAudioValidationError("malformed", "The provider returned a malformed WAV response.");
    return Object.freeze({ bytes, mimeType: "audio/wav", durationSeconds, normalized: isStandardizedWav(bytes) });
  }
  if ((mimeType === "audio/mpeg" || mimeType === "audio/mp3") && !hasMp3Signature(bytes)) {
    throw new EvaluationAudioValidationError("malformed", "The provider returned malformed MP3 audio.");
  }
  if (mimeType === "audio/ogg" && !hasAscii(bytes, 0, "OggS")) throw new EvaluationAudioValidationError("malformed", "The provider returned malformed Ogg audio.");
  if (mimeType === "audio/webm" && !hasBytes(bytes, [0x1a, 0x45, 0xdf, 0xa3])) throw new EvaluationAudioValidationError("malformed", "The provider returned malformed WebM audio.");
  if (mimeType === "audio/mp4" && !hasAscii(bytes, 4, "ftyp")) throw new EvaluationAudioValidationError("malformed", "The provider returned malformed MP4 audio.");
  if (mimeType === "audio/pcm" || mimeType === "audio/l16") {
    if (!isPcm16MonoPayload(bytes)) throw new EvaluationAudioValidationError("malformed", "The provider returned malformed signed 16-bit PCM audio.");
    const sampleRate = options.sampleRate ?? STANDARDIZED_AUDIO.sampleRate;
    return Object.freeze({
      bytes,
      mimeType: "audio/pcm",
      durationSeconds: durationSecondsForPcm16Mono(bytes.byteLength, sampleRate),
      normalized: sampleRate === STANDARDIZED_AUDIO.sampleRate,
    });
  }

  return Object.freeze({ bytes, mimeType, durationSeconds: null, normalized: false });
}

export function durationSecondsForWav(bytes: Uint8Array): number | null {
  if (bytes.byteLength < 44 || !hasAscii(bytes, 0, "RIFF") || !hasAscii(bytes, 8, "WAVE")) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let byteRate: number | null = null;
  let dataBytes: number | null = null;
  while (offset + 8 <= bytes.byteLength) {
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkSize > bytes.byteLength - offset - 8) return null;
    if (hasAscii(bytes, offset, "fmt ") && chunkSize >= 16) byteRate = view.getUint32(offset + 8 + 8, true);
    if (hasAscii(bytes, offset, "data")) dataBytes = chunkSize;
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  return byteRate && dataBytes !== null && byteRate > 0 ? dataBytes / byteRate : null;
}

function isStandardizedWav(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 44) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint16(20, true) === 1
    && view.getUint16(22, true) === STANDARDIZED_AUDIO.channels
    && view.getUint32(24, true) === STANDARDIZED_AUDIO.sampleRate
    && view.getUint16(34, true) === STANDARDIZED_AUDIO.bitsPerSample;
}

function hasMp3Signature(bytes: Uint8Array): boolean {
  return hasAscii(bytes, 0, "ID3") || (bytes.byteLength >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
}

function hasAscii(bytes: Uint8Array, offset: number, expected: string): boolean {
  if (offset + expected.length > bytes.byteLength) return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (bytes[offset + index] !== expected.charCodeAt(index)) return false;
  }
  return true;
}

function hasBytes(bytes: Uint8Array, expected: readonly number[]): boolean {
  if (bytes.byteLength < expected.length) return false;
  return expected.every((value, index) => bytes[index] === value);
}

function writeAscii(target: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) target[offset + index] = value.charCodeAt(index);
}
