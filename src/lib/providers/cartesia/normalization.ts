import { z } from "zod";

import {
  CARTESIA_MODEL_DOCS,
  CARTESIA_VERIFIED_AT,
  CARTESIA_VOICE_DOCS,
} from "@/lib/providers/catalog";
import {
  normalizedProviderModelSchema,
  normalizedProviderVoiceSchema,
  type NormalizedProviderModel,
  type NormalizedProviderVoice,
} from "@/lib/providers/platform-types";

const safeIdSchema = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9._-]+$/);
const voiceSchema = z.object({
  id: safeIdSchema,
  name: z.string().trim().min(1).max(160),
  language: z.string().trim().max(80).nullable().optional(),
}).passthrough();
const voiceListSchema = z.object({
  data: z.array(voiceSchema).max(100),
  has_more: z.boolean(),
  next_page: safeIdSchema.nullable().optional(),
}).passthrough();

const modelSource = Object.freeze({ ...CARTESIA_MODEL_DOCS });
const voiceSource = Object.freeze({ ...CARTESIA_VOICE_DOCS });

export const CARTESIA_NORMALIZED_MODELS: readonly NormalizedProviderModel[] = Object.freeze([
  normalizedProviderModelSchema.parse({
    providerId: "cartesia",
    referenceId: "cartesia:sonic-3.5",
    providerModelId: "sonic-3.5",
    displayName: "Sonic 3.5",
    modality: "text-to-speech",
    capabilities: ["tts.batch", "tts.voice-selection"],
    languages: [],
    availability: "unknown",
    source: modelSource,
    lastVerifiedAt: CARTESIA_VERIFIED_AT,
  }),
  normalizedProviderModelSchema.parse({
    providerId: "cartesia",
    referenceId: "cartesia:sonic-3",
    providerModelId: "sonic-3",
    displayName: "Sonic 3",
    modality: "text-to-speech",
    capabilities: ["tts.batch", "tts.voice-selection"],
    languages: [],
    availability: "unknown",
    source: modelSource,
    lastVerifiedAt: CARTESIA_VERIFIED_AT,
  }),
]);

export type CartesiaNormalizedVoicePage = Readonly<{
  voices: readonly NormalizedProviderVoice[];
  hasMore: boolean;
  nextPageToken?: string;
}>;

/** Keeps only canonical identity and language fields; arbitrary account metadata terminates here. */
export function normalizeCartesiaVoicePage(value: unknown): CartesiaNormalizedVoicePage {
  const parsed = voiceListSchema.safeParse(value);
  if (!parsed.success) throw new CartesiaNormalizationError();
  const seen = new Set<string>();
  const voices = parsed.data.data.map((voice) => {
    const normalizedId = voice.id.toLowerCase();
    if (seen.has(normalizedId)) throw new CartesiaNormalizationError();
    seen.add(normalizedId);
    return normalizedProviderVoiceSchema.parse({
      providerId: "cartesia",
      referenceId: `cartesia:${normalizedId}`,
      providerVoiceId: voice.id,
      displayName: voice.name,
      supportedModelReferences: CARTESIA_NORMALIZED_MODELS.map((model) => model.referenceId),
      languages: normalizeLanguageTags(voice.language ? [voice.language] : []),
      availability: "unknown",
      source: voiceSource,
      lastVerifiedAt: CARTESIA_VERIFIED_AT,
    });
  });
  return Object.freeze({
    voices: Object.freeze(voices),
    hasMore: parsed.data.has_more,
    ...(parsed.data.has_more && parsed.data.next_page
      ? { nextPageToken: parsed.data.next_page }
      : {}),
  });
}

export class CartesiaNormalizationError extends Error {
  constructor() {
    super("Cartesia returned a response the Lab could not safely normalize.");
    this.name = "CartesiaNormalizationError";
  }
}

function normalizeLanguageTags(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values
    .map((value) => value.trim())
    .filter((value) => /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value))
    .map((value) => value.toLowerCase()))].slice(0, 100));
}
