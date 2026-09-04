import sampleScenarioData from "@/lib/sample-scenarios.json";

import type { DeepgramNova3LanguageCode } from "@/lib/deepgram-languages";

export type RecommendedDeepgramOptions = {
  model: "nova-3";
  language: DeepgramNova3LanguageCode;
  smart_format?: boolean;
  diarize?: boolean;
  numerals?: boolean;
  keyterms?: readonly string[];
};

export type SampleScenario = {
  slug: string;
  title: string;
  vertical: string;
  language: DeepgramNova3LanguageCode;
  voiceModel: string;
  transcript: string;
  demoGoal: string;
  recommendedDeepgramOptions: RecommendedDeepgramOptions;
};

export const SAMPLE_AUDIO_ORIGIN = "http://localhost:3000";
export const SAMPLE_AUDIO_SCENARIOS = sampleScenarioData as readonly SampleScenario[];

export function getSampleAudioPath(slug: string) {
  return `/samples/${slug}.mp3`;
}

export function getSampleAudioUrl(slug: string) {
  return `${SAMPLE_AUDIO_ORIGIN}${getSampleAudioPath(slug)}`;
}
