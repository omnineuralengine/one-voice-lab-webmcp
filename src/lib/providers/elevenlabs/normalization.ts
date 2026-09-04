import { z } from "zod";

import {
  ELEVENLABS_MODEL_DOCS,
  ELEVENLABS_VERIFIED_AT,
  ELEVENLABS_VOICE_DOCS,
} from "@/lib/providers/catalog";
import {
  normalizedProviderModelSchema,
  normalizedProviderVoiceSchema,
  type NormalizedProviderModel,
  type NormalizedProviderVoice,
} from "@/lib/providers/platform-types";

const safeIdSchema = z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9._-]+$/);
const languageSchema = z.object({
  language_id: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(120).optional(),
}).passthrough();
const modelSchema = z.object({
  model_id: safeIdSchema,
  name: z.string().trim().min(1).max(160).optional(),
  can_do_text_to_speech: z.boolean().optional(),
  languages: z.array(languageSchema).max(250).optional(),
}).passthrough();
const modelsSchema = z.array(modelSchema).max(500);

const voiceSchema = z.object({
  voice_id: safeIdSchema,
  name: z.string().trim().min(1).max(160),
}).passthrough();
const voicesSchema = z.object({
  voices: z.array(voiceSchema).max(150),
  has_more: z.boolean(),
  next_page_token: z.string().max(1_024).nullable().optional(),
}).passthrough();

const modelSource = Object.freeze({ ...ELEVENLABS_MODEL_DOCS });
const voiceSource = Object.freeze({ ...ELEVENLABS_VOICE_DOCS });

export type ElevenLabsNormalizedModelPage = Readonly<{
  models: readonly NormalizedProviderModel[];
}>;

export type ElevenLabsNormalizedVoicePage = Readonly<{
  voices: readonly NormalizedProviderVoice[];
  hasMore: boolean;
  nextPageToken?: string;
}>;

/** Keeps only canonical TTS model fields; arbitrary upstream account metadata terminates here. */
export function normalizeElevenLabsModels(value: unknown): ElevenLabsNormalizedModelPage {
  const parsed = modelsSchema.safeParse(value);
  if (!parsed.success) throw new ElevenLabsNormalizationError();
  const seen = new Set<string>();
  const models = parsed.data
    .filter((model) => model.can_do_text_to_speech === true)
    .map((model) => {
      const normalizedId = model.model_id.toLowerCase();
      if (seen.has(normalizedId)) throw new ElevenLabsNormalizationError();
      seen.add(normalizedId);
      return normalizedProviderModelSchema.parse({
        providerId: "elevenlabs",
        referenceId: `elevenlabs:${normalizedId}`,
        providerModelId: model.model_id,
        displayName: model.name || model.model_id,
        modality: "text-to-speech",
        capabilities: ["tts.batch", "tts.voice-selection"],
        languages: normalizeLanguageTags((model.languages ?? []).map((language) => language.language_id)),
        availability: "unknown",
        source: modelSource,
        lastVerifiedAt: ELEVENLABS_VERIFIED_AT,
      });
    });
  return Object.freeze({ models: Object.freeze(models) });
}

/** Keeps only identity fields required by ONE; private account, preview, sample, label, and author metadata is discarded. */
export function normalizeElevenLabsVoicePage(
  value: unknown,
  supportedModelReferences: readonly string[],
): ElevenLabsNormalizedVoicePage {
  const parsed = voicesSchema.safeParse(value);
  if (!parsed.success) throw new ElevenLabsNormalizationError();
  const seen = new Set<string>();
  const voices = parsed.data.voices.map((voice) => {
    const normalizedId = voice.voice_id.toLowerCase();
    if (seen.has(normalizedId)) throw new ElevenLabsNormalizationError();
    seen.add(normalizedId);
    return normalizedProviderVoiceSchema.parse({
      providerId: "elevenlabs",
      referenceId: `elevenlabs:${normalizedId}`,
      providerVoiceId: voice.voice_id,
      displayName: voice.name,
      supportedModelReferences,
      languages: [],
      availability: "unknown",
      source: voiceSource,
      lastVerifiedAt: ELEVENLABS_VERIFIED_AT,
    });
  });
  return Object.freeze({
    voices: Object.freeze(voices),
    hasMore: parsed.data.has_more,
    ...(parsed.data.next_page_token ? { nextPageToken: parsed.data.next_page_token } : {}),
  });
}

export class ElevenLabsNormalizationError extends Error {
  constructor() {
    super("ElevenLabs returned a response the Lab could not safely normalize.");
    this.name = "ElevenLabsNormalizationError";
  }
}

function normalizeLanguageTags(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values
    .map((value) => value.trim())
    .filter((value) => /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value))
    .map((value) => value.toLowerCase()))].slice(0, 200));
}
