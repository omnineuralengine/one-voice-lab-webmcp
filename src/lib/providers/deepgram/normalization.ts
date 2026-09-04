import { z } from "zod";

import {
  DEEPGRAM_MODEL_DOCS,
  DEEPGRAM_VERIFIED_AT,
  DEEPGRAM_VOICE_DOCS,
} from "@/lib/providers/catalog";
import {
  normalizedProviderModelSchema,
  normalizedProviderVoiceSchema,
  type NormalizedProviderModel,
  type NormalizedProviderVoice,
} from "@/lib/providers/platform-types";
import { DEEPGRAM_STT_MODEL_IDS } from "@/lib/deepgram-model-policy";
import { ALL_TTS_VOICE_OPTIONS } from "@/lib/tts-voices";

const MAX_TRANSCRIPT_CHARACTERS = 250_000;
const MAX_WORDS = 100_000;
const safeRequestIdSchema = z.string().trim().max(160).regex(/^[A-Za-z0-9._:-]+$/);
const finiteNonNegative = z.number().finite().nonnegative();
const wordSchema = z.object({
  word: z.string().max(500).optional(),
  punctuated_word: z.string().max(500).optional(),
  start: finiteNonNegative.optional(),
  end: finiteNonNegative.optional(),
  confidence: z.number().finite().min(0).max(1).optional(),
  speaker: z.number().int().nonnegative().max(10_000).optional(),
}).passthrough();
const alternativeSchema = z.object({
  transcript: z.string().max(MAX_TRANSCRIPT_CHARACTERS),
  confidence: z.number().finite().min(0).max(1).optional(),
  words: z.array(wordSchema).max(MAX_WORDS).optional(),
  paragraphs: z.object({ transcript: z.string().max(MAX_TRANSCRIPT_CHARACTERS).optional() }).passthrough().optional(),
}).passthrough();
const channelSchema = z.object({
  detected_language: z.string().trim().min(2).max(35).optional(),
  alternatives: z.array(alternativeSchema).min(1).max(10),
}).passthrough();
const responseSchema = z.object({
  metadata: z.object({
    request_id: safeRequestIdSchema.optional(),
    duration: finiteNonNegative.optional(),
    channels: z.number().int().positive().max(64).optional(),
  }).passthrough().optional(),
  results: z.object({
    channels: z.array(channelSchema).min(1).max(64),
  }).passthrough(),
}).passthrough();

const modelSource = Object.freeze({ ...DEEPGRAM_MODEL_DOCS });
const voiceSource = Object.freeze({ ...DEEPGRAM_VOICE_DOCS });

const sttModels: readonly NormalizedProviderModel[] = DEEPGRAM_STT_MODEL_IDS.map((modelId) => (
  normalizedProviderModelSchema.parse({
    providerId: "deepgram",
    referenceId: `deepgram:${modelId}`,
    providerModelId: modelId,
    displayName: modelId === "nova-3" ? "Nova-3" : "Nova-3 General",
    modality: "speech-to-text",
    capabilities: ["stt.prerecorded"],
    languages: [],
    availability: "unknown",
    source: modelSource,
    lastVerifiedAt: DEEPGRAM_VERIFIED_AT,
  })
));

const ttsModels: readonly NormalizedProviderModel[] = ALL_TTS_VOICE_OPTIONS.map((voice) => (
  normalizedProviderModelSchema.parse({
    providerId: "deepgram",
    referenceId: `deepgram:${voice.value}`,
    providerModelId: voice.value,
    displayName: voice.label.split(" - ", 1)[0] || voice.value,
    modality: "text-to-speech",
    capabilities: ["tts.batch", "tts.voice-selection"],
    languages: [voice.languageCode],
    availability: "unknown",
    source: voiceSource,
    lastVerifiedAt: DEEPGRAM_VERIFIED_AT,
  })
));

export const DEEPGRAM_NORMALIZED_MODELS: readonly NormalizedProviderModel[] = Object.freeze([
  ...sttModels,
  ...ttsModels,
]);

export const DEEPGRAM_NORMALIZED_VOICES: readonly NormalizedProviderVoice[] = Object.freeze(
  ALL_TTS_VOICE_OPTIONS.map((voice) => normalizedProviderVoiceSchema.parse({
    providerId: "deepgram",
    referenceId: `deepgram:${voice.value}`,
    providerVoiceId: voice.value,
    displayName: voice.label.split(" - ", 1)[0] || voice.value,
    supportedModelReferences: [`deepgram:${voice.value}`],
    languages: [voice.languageCode],
    availability: "unknown",
    source: voiceSource,
    lastVerifiedAt: DEEPGRAM_VERIFIED_AT,
  })),
);

export type NormalizedDeepgramTranscription = Readonly<{
  transcript: string;
  language?: string;
  requestId?: string;
  raw: Readonly<Record<string, unknown>>;
  details: Readonly<Record<string, unknown>>;
}>;

/**
 * Provider-specific response objects terminate here. Only bounded transcript,
 * timing, confidence, speaker, language, and request identity fields survive.
 */
export function normalizeDeepgramTranscriptionResponse(value: unknown): NormalizedDeepgramTranscription {
  const parsed = responseSchema.safeParse(value);
  if (!parsed.success) throw new DeepgramNormalizationError();
  const channels = parsed.data.results.channels.map((channel) => Object.freeze({
    ...(channel.detected_language ? { detected_language: channel.detected_language } : {}),
    alternatives: Object.freeze(channel.alternatives.map((alternative) => Object.freeze({
      transcript: alternative.transcript,
      ...(alternative.confidence !== undefined ? { confidence: alternative.confidence } : {}),
      ...(alternative.words ? {
        words: Object.freeze(alternative.words.map((word) => Object.freeze({
          ...(word.word !== undefined ? { word: word.word } : {}),
          ...(word.punctuated_word !== undefined ? { punctuated_word: word.punctuated_word } : {}),
          ...(word.start !== undefined ? { start: word.start } : {}),
          ...(word.end !== undefined ? { end: word.end } : {}),
          ...(word.confidence !== undefined ? { confidence: word.confidence } : {}),
          ...(word.speaker !== undefined ? { speaker: word.speaker } : {}),
        }))),
      } : {}),
      ...(alternative.paragraphs?.transcript ? {
        paragraphs: Object.freeze({ transcript: alternative.paragraphs.transcript }),
      } : {}),
    }))),
  }));
  const firstChannel = channels[0];
  const firstAlternative = firstChannel?.alternatives[0];
  const transcript = firstAlternative?.paragraphs?.transcript || firstAlternative?.transcript || "";
  const requestId = parsed.data.metadata?.request_id;
  const language = firstChannel?.detected_language;
  const speakers = new Set(
    channels.flatMap((channel) => channel.alternatives.flatMap((alternative) => (
      (alternative.words ?? []).flatMap((word) => word.speaker === undefined ? [] : [word.speaker])
    ))),
  );
  const wordCount = channels.reduce((total, channel) => total + channel.alternatives.reduce(
    (channelTotal, alternative) => channelTotal + (alternative.words?.length ?? 0),
    0,
  ), 0);
  const raw = Object.freeze({
    ...(parsed.data.metadata ? {
      metadata: Object.freeze({
        ...(requestId ? { request_id: requestId } : {}),
        ...(parsed.data.metadata.duration !== undefined ? { duration: parsed.data.metadata.duration } : {}),
        ...(parsed.data.metadata.channels !== undefined ? { channels: parsed.data.metadata.channels } : {}),
      }),
    } : {}),
    results: Object.freeze({ channels: Object.freeze(channels) }),
  });
  return Object.freeze({
    transcript,
    ...(language ? { language } : {}),
    ...(requestId ? { requestId } : {}),
    raw,
    details: Object.freeze({
      channelCount: channels.length,
      wordCount,
      speakerCount: speakers.size || undefined,
      durationSeconds: parsed.data.metadata?.duration,
    }),
  });
}

export class DeepgramNormalizationError extends Error {
  constructor() {
    super("Deepgram returned a response the Lab could not safely normalize.");
    this.name = "DeepgramNormalizationError";
  }
}
