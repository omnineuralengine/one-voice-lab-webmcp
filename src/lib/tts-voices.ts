import type { TtsVoiceModel } from "@/lib/types";

export type TtsVoiceLanguageCode = "en" | "it" | "es" | "fr" | "de" | "ja" | "nl";

export type TtsVoiceOption = {
  label: string;
  value: TtsVoiceModel;
  language: string;
  languageCode: TtsVoiceLanguageCode;
  tone: string;
};

export type TtsVoiceGroup = {
  language: string;
  languageCode: TtsVoiceLanguageCode;
  voices: TtsVoiceOption[];
};

export const AURA_VOICE_GROUPS: TtsVoiceGroup[] = [
  {
    language: "English",
    languageCode: "en",
    voices: [
      { label: "Thalia - clear, energetic", value: "aura-2-thalia-en", language: "English", languageCode: "en", tone: "clear, confident, energetic" },
      { label: "Andromeda - expressive support", value: "aura-2-andromeda-en", language: "English", languageCode: "en", tone: "casual, expressive, comfortable" },
      { label: "Helena - caring, friendly", value: "aura-2-helena-en", language: "English", languageCode: "en", tone: "caring, natural, positive" },
      { label: "Apollo - confident, casual", value: "aura-2-apollo-en", language: "English", languageCode: "en", tone: "confident, comfortable, casual" },
      { label: "Arcas - smooth, natural", value: "aura-2-arcas-en", language: "English", languageCode: "en", tone: "natural, smooth, clear" },
      { label: "Asteria - knowledgeable", value: "aura-2-asteria-en", language: "English", languageCode: "en", tone: "clear, confident, knowledgeable" },
      { label: "Harmonia - empathetic", value: "aura-2-harmonia-en", language: "English", languageCode: "en", tone: "empathetic, clear, calm" },
      { label: "Mars - patient, trustworthy", value: "aura-2-mars-en", language: "English", languageCode: "en", tone: "smooth, patient, trustworthy" },
      { label: "Orpheus - professional", value: "aura-2-orpheus-en", language: "English", languageCode: "en", tone: "professional, clear, trustworthy" },
      { label: "Luna - friendly IVR", value: "aura-2-luna-en", language: "English", languageCode: "en", tone: "friendly, natural, engaging" },
    ],
  },
  {
    language: "Italian",
    languageCode: "it",
    voices: [
      { label: "Livia - cheerful support", value: "aura-2-livia-it", language: "Italian", languageCode: "it", tone: "approachable, cheerful, clear" },
      { label: "Dionisio - melodic sales", value: "aura-2-dionisio-it", language: "Italian", languageCode: "it", tone: "confident, engaging, friendly" },
      { label: "Melia - natural customer service", value: "aura-2-melia-it", language: "Italian", languageCode: "it", tone: "clear, comfortable, natural" },
      { label: "Cesare - empathetic IVR", value: "aura-2-cesare-it", language: "Italian", languageCode: "it", tone: "clear, empathetic, smooth" },
    ],
  },
  {
    language: "Spanish",
    languageCode: "es",
    voices: [
      { label: "Nestor - calm, professional", value: "aura-2-nestor-es", language: "Spanish", languageCode: "es", tone: "calm, professional, clear" },
      { label: "Celeste - friendly, energetic", value: "aura-2-celeste-es", language: "Spanish", languageCode: "es", tone: "clear, energetic, friendly" },
      { label: "Estrella - calm, natural", value: "aura-2-estrella-es", language: "Spanish", languageCode: "es", tone: "approachable, natural, calm" },
    ],
  },
  {
    language: "French",
    languageCode: "fr",
    voices: [
      { label: "Agathe - cheerful support", value: "aura-2-agathe-fr", language: "French", languageCode: "fr", tone: "charismatic, cheerful, friendly" },
      { label: "Hector - patient, empathetic", value: "aura-2-hector-fr", language: "French", languageCode: "fr", tone: "confident, empathetic, patient" },
    ],
  },
  {
    language: "German",
    languageCode: "de",
    voices: [
      { label: "Julius - casual, friendly", value: "aura-2-julius-de", language: "German", languageCode: "de", tone: "casual, cheerful, engaging" },
      { label: "Viktoria - warm support", value: "aura-2-viktoria-de", language: "German", languageCode: "de", tone: "charismatic, cheerful, warm" },
      { label: "Elara - calm, trustworthy", value: "aura-2-elara-de", language: "German", languageCode: "de", tone: "calm, clear, trustworthy" },
    ],
  },
  {
    language: "Japanese",
    languageCode: "ja",
    voices: [
      { label: "Izanami - polite, professional", value: "aura-2-izanami-ja", language: "Japanese", languageCode: "ja", tone: "approachable, clear, polite" },
      { label: "Fujin - calm, confident", value: "aura-2-fujin-ja", language: "Japanese", languageCode: "ja", tone: "calm, confident, professional" },
    ],
  },
  {
    language: "Dutch",
    languageCode: "nl",
    voices: [
      { label: "Rhea - caring support", value: "aura-2-rhea-nl", language: "Dutch", languageCode: "nl", tone: "caring, knowledgeable, warm" },
      { label: "Sander - calm, professional", value: "aura-2-sander-nl", language: "Dutch", languageCode: "nl", tone: "calm, clear, professional" },
      { label: "Beatrix - cheerful, trustworthy", value: "aura-2-beatrix-nl", language: "Dutch", languageCode: "nl", tone: "cheerful, friendly, trustworthy" },
    ],
  },
];

export const ALL_TTS_VOICE_OPTIONS = AURA_VOICE_GROUPS.flatMap((group) => group.voices);

export function getDefaultVoiceForLanguage(languageCode: TtsVoiceLanguageCode) {
  return AURA_VOICE_GROUPS.find((group) => group.languageCode === languageCode)?.voices[0]?.value || "aura-2-thalia-en";
}

export function getVoiceOption(model: TtsVoiceModel) {
  return ALL_TTS_VOICE_OPTIONS.find((voice) => voice.value === model) || ALL_TTS_VOICE_OPTIONS[0];
}
