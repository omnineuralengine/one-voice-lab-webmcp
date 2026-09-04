import { ALL_TTS_VOICE_OPTIONS } from "@/lib/tts-voices";

export const DEEPGRAM_STT_MODEL_IDS = ["nova-3", "nova-3-general"] as const;
export const AURA_TTS_MODEL_IDS = ALL_TTS_VOICE_OPTIONS.map((voice) => voice.value);
export const AURA_TTS_ENCODINGS = ["linear16", "mulaw", "alaw", "mp3", "opus", "flac", "aac"] as const;
export const AURA_TTS_CONTAINERS = ["wav", "none", "ogg"] as const;
export const AURA_TTS_SAMPLE_RATES = [8_000, 16_000, 22_050, 24_000, 32_000, 48_000] as const;

export type AuraTtsEncoding = (typeof AURA_TTS_ENCODINGS)[number];
export type AuraTtsContainer = (typeof AURA_TTS_CONTAINERS)[number];

const STT_MODEL_ALLOWLIST: ReadonlySet<string> = new Set(DEEPGRAM_STT_MODEL_IDS);
const AURA_MODEL_ALLOWLIST: ReadonlySet<string> = new Set(AURA_TTS_MODEL_IDS);
const AURA_ENCODING_ALLOWLIST: ReadonlySet<string> = new Set(AURA_TTS_ENCODINGS);
const AURA_CONTAINER_ALLOWLIST: ReadonlySet<string> = new Set(AURA_TTS_CONTAINERS);

const AURA_FORMATS: Record<AuraTtsEncoding, { containers: readonly AuraTtsContainer[]; sampleRates: readonly number[]; bitRate?: readonly number[] | { min: number; max: number } }> = {
  linear16: { containers: ["wav", "none"], sampleRates: [8_000, 16_000, 24_000, 32_000, 48_000] },
  mulaw: { containers: ["wav", "none"], sampleRates: [8_000, 16_000] },
  alaw: { containers: ["wav", "none"], sampleRates: [8_000, 16_000] },
  mp3: { containers: [], sampleRates: [], bitRate: [32_000, 48_000] },
  opus: { containers: ["ogg"], sampleRates: [], bitRate: { min: 4_000, max: 650_000 } },
  flac: { containers: [], sampleRates: [8_000, 16_000, 22_050, 32_000, 48_000] },
  aac: { containers: [], sampleRates: [], bitRate: { min: 4_000, max: 192_000 } },
};

export class DeepgramModelPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeepgramModelPolicyError";
  }
}

export function isDeepgramSttModel(value: unknown): value is (typeof DEEPGRAM_STT_MODEL_IDS)[number] {
  return typeof value === "string" && STT_MODEL_ALLOWLIST.has(value);
}

export function isAuraTtsModel(value: unknown): boolean {
  return typeof value === "string" && AURA_MODEL_ALLOWLIST.has(value);
}

export function parseAuraTtsFormat(input: {
  encoding?: unknown;
  container?: unknown;
  sampleRate?: unknown;
  bitRate?: unknown;
}): { encoding: AuraTtsEncoding; container?: AuraTtsContainer; sampleRate?: number; bitRate?: number } {
  const encoding = input.encoding === undefined ? "mp3" : input.encoding;
  if (typeof encoding !== "string" || !AURA_ENCODING_ALLOWLIST.has(encoding)) {
    throw new DeepgramModelPolicyError("Unsupported Aura TTS encoding.");
  }

  const normalizedEncoding = encoding as AuraTtsEncoding;
  const format = AURA_FORMATS[normalizedEncoding];
  const container = input.container === undefined || input.container === "" ? undefined : input.container;
  if (container !== undefined && (typeof container !== "string" || !AURA_CONTAINER_ALLOWLIST.has(container))) {
    throw new DeepgramModelPolicyError("Unsupported Aura TTS container.");
  }
  if (container !== undefined && !format.containers.includes(container as AuraTtsContainer)) {
    throw new DeepgramModelPolicyError(`Container ${container} is not supported with ${normalizedEncoding}.`);
  }

  const sampleRate = normalizeOptionalInteger(input.sampleRate, "sample_rate");
  if (sampleRate !== undefined && !format.sampleRates.includes(sampleRate)) {
    throw new DeepgramModelPolicyError(`Sample rate ${sampleRate} is not supported with ${normalizedEncoding}.`);
  }

  const bitRate = normalizeOptionalInteger(input.bitRate, "bit_rate");
  if (bitRate !== undefined && !isSupportedBitRate(format.bitRate, bitRate)) {
    throw new DeepgramModelPolicyError(`Bit rate ${bitRate} is not supported with ${normalizedEncoding}.`);
  }

  return {
    encoding: normalizedEncoding,
    container: container as AuraTtsContainer | undefined,
    sampleRate,
    bitRate,
  };
}

function normalizeOptionalInteger(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new DeepgramModelPolicyError(`${label} must be a positive integer.`);
  }
  return value;
}

function isSupportedBitRate(rule: readonly number[] | { min: number; max: number } | undefined, value: number): boolean {
  if (!rule) return false;
  if ("min" in rule) return value >= rule.min && value <= rule.max;
  return rule.includes(value);
}
