import { z } from "zod";

import { FISH_AUDIO_MODEL_DOCS, FISH_AUDIO_VERIFIED_AT } from "@/lib/providers/catalog";
import {
  normalizedProviderModelSchema,
  normalizedProviderVoiceSchema,
  type NormalizedProviderModel,
  type NormalizedProviderVoice,
} from "@/lib/providers/platform-types";

const safeIdSchema = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9._-]+$/);
const publicVoiceSchema = z.object({
  _id: safeIdSchema,
  title: z.string().trim().min(1).max(160),
  visibility: z.enum(["public", "unlist", "private"]).optional(),
  languages: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
}).passthrough();

export const fishAudioPublicVoiceListSchema = z.object({
  items: z.array(publicVoiceSchema).max(100),
  has_more: z.boolean().optional(),
}).passthrough();

const modelSource = Object.freeze({ ...FISH_AUDIO_MODEL_DOCS });

export const FISH_AUDIO_NORMALIZED_MODELS: readonly NormalizedProviderModel[] = Object.freeze([
  normalizedProviderModelSchema.parse({
    providerId: "fish-audio",
    referenceId: "fish-audio:s2-pro",
    providerModelId: "s2-pro",
    displayName: "S2 Pro",
    modality: "text-to-speech",
    capabilities: ["tts.batch", "tts.voice-selection"],
    languages: [],
    availability: "unknown",
    source: modelSource,
    lastVerifiedAt: FISH_AUDIO_VERIFIED_AT,
  }),
  normalizedProviderModelSchema.parse({
    providerId: "fish-audio",
    referenceId: "fish-audio:s1",
    providerModelId: "s1",
    displayName: "S1",
    modality: "text-to-speech",
    capabilities: ["tts.batch", "tts.voice-selection"],
    languages: [],
    availability: "unknown",
    source: modelSource,
    lastVerifiedAt: FISH_AUDIO_VERIFIED_AT,
  }),
]);

export type FishAudioPublicVoicePage = Readonly<{
  voices: readonly NormalizedProviderVoice[];
  hasMore: boolean;
}>;

/** Normalizes only explicitly public Fish voice records; private and unlisted records are discarded. */
export function normalizeFishAudioPublicVoicePage(value: unknown): FishAudioPublicVoicePage {
  const parsed = fishAudioPublicVoiceListSchema.safeParse(value);
  if (!parsed.success) throw new FishAudioNormalizationError();
  const voices = parsed.data.items
    .filter((voice) => voice.visibility === "public")
    .map((voice) => normalizedProviderVoiceSchema.parse({
      providerId: "fish-audio",
      referenceId: `fish-audio:${voice._id.toLowerCase()}`,
      providerVoiceId: voice._id,
      displayName: voice.title,
      supportedModelReferences: FISH_AUDIO_NORMALIZED_MODELS.map((model) => model.referenceId),
      languages: normalizeLanguageTags(voice.languages ?? []),
      availability: "unknown",
      source: modelSource,
      lastVerifiedAt: FISH_AUDIO_VERIFIED_AT,
    }));
  return Object.freeze({ voices: Object.freeze(voices), hasMore: parsed.data.has_more === true });
}

export class FishAudioNormalizationError extends Error {
  constructor() {
    super("Fish Audio returned a response the Lab could not safely normalize.");
    this.name = "FishAudioNormalizationError";
  }
}

function normalizeLanguageTags(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values
    .map((value) => value.trim())
    .filter((value) => /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value))
    .map((value) => value.toLowerCase()))].slice(0, 100));
}
