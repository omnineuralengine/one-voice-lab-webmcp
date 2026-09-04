import { isDeepgramNova3LanguageCode } from "@/lib/deepgram-languages";
import type { DeepgramHostedSample } from "@/types/deepgram-samples";

export const DEEPGRAM_MODELS_DOCS_URL = "https://developers.deepgram.com/reference/manage/models/list";
export const DEEPGRAM_TTS_VOICES_DOCS_URL = "https://developers.deepgram.com/docs/tts-models";
export const DEEPGRAM_LANGUAGE_DETECTION_DOCS_URL = "https://developers.deepgram.com/docs/language-detection";

export const RECOMMENDED_SAMPLE_LANGUAGE_ORDER = ["en", "it", "es", "de", "fr", "nl", "ja"] as const;

const LANGUAGE_NAMES: Record<(typeof RECOMMENDED_SAMPLE_LANGUAGE_ORDER)[number], string> = {
  en: "English",
  it: "Italian",
  es: "Spanish",
  de: "German",
  fr: "French",
  nl: "Dutch",
  ja: "Japanese",
};

const TRUSTED_SAMPLE_HOSTS = new Set([
  "cdn.sanity.io",
  "static.deepgram.com",
]);

export const CURATED_PRERECORDED_SAMPLES: DeepgramHostedSample[] = [
  {
    id: "deepgram-bueller-en",
    title: "English — Bueller movie quote",
    sampleUrl: "https://static.deepgram.com/examples/Bueller-Life-moves-pretty-fast.wav",
    spokenLanguage: "English",
    languageCode: "en",
    accent: "American English",
    source: "Deepgram documentation example",
    sourceType: "natural/prerecorded speech",
    verificationStatus: "verified-project-example",
    characteristics: ["short", "prerecorded", "conversational quote"],
    learningNote: "The existing verified Deepgram-hosted English example. Useful for a short prerecorded STT walkthrough.",
  },
];

type ModelRecord = Record<string, unknown>;

export function sanitizeAuraSamples(modelResponse: unknown): DeepgramHostedSample[] {
  const record = asRecord(modelResponse);
  const tts = Array.isArray(record.tts) ? record.tts : [];
  const seenUrls = new Set<string>();
  const samples: DeepgramHostedSample[] = [];

  for (const value of tts) {
    const model = asRecord(value);
    const canonicalName = readString(model, "canonical_name");
    const architecture = readString(model, "architecture");
    if (!canonicalName.startsWith("aura-") && !architecture.startsWith("aura")) continue;

    const metadata = asRecord(model.metadata);
    const sampleUrl = normalizeOfficialSampleUrl(readString(metadata, "sample"));
    if (!sampleUrl || seenUrls.has(sampleUrl)) continue;

    const languageCode = resolveSampleLanguage(model, canonicalName);
    if (!languageCode || !isDeepgramNova3LanguageCode(languageCode)) continue;
    if (!RECOMMENDED_SAMPLE_LANGUAGE_ORDER.includes(languageCode as (typeof RECOMMENDED_SAMPLE_LANGUAGE_ORDER)[number])) continue;

    const name = titleCase(readString(model, "name") || voiceNameFromCanonical(canonicalName));
    const spokenLanguage = LANGUAGE_NAMES[languageCode as keyof typeof LANGUAGE_NAMES];
    const accent = readString(metadata, "accent") || undefined;
    const characteristics = readStringArray(metadata, "tags").slice(0, 8);

    seenUrls.add(sampleUrl);
    samples.push({
      id: `aura-${canonicalName || slug(name)}-${languageCode}`,
      title: `${spokenLanguage} — ${name || canonicalName}`,
      sampleUrl,
      spokenLanguage,
      languageCode,
      accent,
      source: "Deepgram Aura sample",
      sourceType: "synthesized TTS speech",
      verificationStatus: "verified-model-metadata",
      model: canonicalName || undefined,
      characteristics,
      learningNote: `Useful for demonstrating the ${spokenLanguage} STT request path; not a natural-conversation accuracy benchmark.`,
    });
  }

  return samples.sort((left, right) => {
    const languageOrder = RECOMMENDED_SAMPLE_LANGUAGE_ORDER.indexOf(left.languageCode as (typeof RECOMMENDED_SAMPLE_LANGUAGE_ORDER)[number])
      - RECOMMENDED_SAMPLE_LANGUAGE_ORDER.indexOf(right.languageCode as (typeof RECOMMENDED_SAMPLE_LANGUAGE_ORDER)[number]);
    return languageOrder || left.title.localeCompare(right.title);
  });
}

export function mergeDeepgramSamples(auraSamples: DeepgramHostedSample[]) {
  const seen = new Set<string>();
  return [...CURATED_PRERECORDED_SAMPLES, ...auraSamples].filter((sample) => {
    if (seen.has(sample.sampleUrl)) return false;
    seen.add(sample.sampleUrl);
    return true;
  });
}

export function recommendedSamplesByLanguage(samples: DeepgramHostedSample[]) {
  return RECOMMENDED_SAMPLE_LANGUAGE_ORDER.flatMap((code) => {
    const matches = samples.filter((sample) => sample.languageCode === code);
    if (!matches.length) return [];
    const natural = matches.find((sample) => sample.sourceType === "natural/prerecorded speech");
    return [natural ?? matches[0]];
  });
}

export function extractDetectedLanguage(raw: unknown) {
  const results = asRecord(asRecord(raw).results);
  const channels = Array.isArray(results.channels) ? results.channels : [];
  for (const channel of channels) {
    const detected = readString(asRecord(channel), "detected_language");
    if (detected) return detected;
  }
  return undefined;
}

export function extractDeepgramRequestId(raw: unknown) {
  return readString(asRecord(asRecord(raw).metadata), "request_id") || undefined;
}

function resolveSampleLanguage(model: ModelRecord, canonicalName: string) {
  const languages = readStringArray(model, "languages");
  for (const language of languages) {
    const base = language.toLowerCase().split("-")[0];
    if (RECOMMENDED_SAMPLE_LANGUAGE_ORDER.includes(base as (typeof RECOMMENDED_SAMPLE_LANGUAGE_ORDER)[number])) return base;
  }
  const suffix = canonicalName.toLowerCase().split("-").at(-1) || "";
  return RECOMMENDED_SAMPLE_LANGUAGE_ORDER.includes(suffix as (typeof RECOMMENDED_SAMPLE_LANGUAGE_ORDER)[number]) ? suffix : "";
}

function normalizeOfficialSampleUrl(value: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !TRUSTED_SAMPLE_HOSTS.has(url.hostname.toLowerCase())) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function asRecord(value: unknown): ModelRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as ModelRecord : {};
}

function readString(record: ModelRecord, key: string) {
  return typeof record[key] === "string" ? (record[key] as string).trim() : "";
}

function readStringArray(record: ModelRecord, key: string) {
  return Array.isArray(record[key]) ? (record[key] as unknown[]).filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean) : [];
}

function voiceNameFromCanonical(value: string) {
  return value.split("-").slice(2, -1).join(" ");
}

function titleCase(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
