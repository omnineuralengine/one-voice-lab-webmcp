export type DeepgramLanguageOption = {
  code: string;
  name: string;
  compatibleModels?: readonly string[];
  compatibleTransports?: readonly ("prerecorded" | "streaming")[];
  multilingualAvailability?: boolean;
  docsUrl?: string;
  lastVerifiedAt?: string;
};

const DEEPGRAM_NOVA3_LANGUAGE_DEFINITIONS = [
  { name: "English", code: "en" },
  { name: "Italian", code: "it" },
  { name: "Spanish", code: "es" },
  { name: "French", code: "fr" },
  { name: "German", code: "de" },
  { name: "Portuguese", code: "pt" },
  { name: "Japanese", code: "ja" },
  { name: "Dutch", code: "nl" },
  { name: "Multilingual", code: "multi" },
  { name: "Arabic", code: "ar" },
  { name: "Arabic (United Arab Emirates)", code: "ar-AE" },
  { name: "Arabic (Saudi Arabia)", code: "ar-SA" },
  { name: "Arabic (Qatar)", code: "ar-QA" },
  { name: "Arabic (Kuwait)", code: "ar-KW" },
  { name: "Arabic (Syria)", code: "ar-SY" },
  { name: "Arabic (Lebanon)", code: "ar-LB" },
  { name: "Arabic (Palestinian Territories)", code: "ar-PS" },
  { name: "Arabic (Jordan)", code: "ar-JO" },
  { name: "Arabic (Egypt)", code: "ar-EG" },
  { name: "Arabic (Sudan)", code: "ar-SD" },
  { name: "Arabic (Chad)", code: "ar-TD" },
  { name: "Arabic (Morocco)", code: "ar-MA" },
  { name: "Arabic (Algeria)", code: "ar-DZ" },
  { name: "Arabic (Tunisia)", code: "ar-TN" },
  { name: "Arabic (Iraq)", code: "ar-IQ" },
  { name: "Arabic (Iran)", code: "ar-IR" },
  { name: "Belarusian", code: "be" },
  { name: "Bengali", code: "bn" },
  { name: "Bosnian", code: "bs" },
  { name: "Bulgarian", code: "bg" },
  { name: "Catalan", code: "ca" },
  { name: "Chinese (Cantonese, Traditional)", code: "zh-HK" },
  { name: "Chinese (Mandarin, Simplified)", code: "zh" },
  { name: "Chinese (Mandarin, Simplified - China)", code: "zh-CN" },
  { name: "Chinese (Mandarin, Simplified Han)", code: "zh-Hans" },
  { name: "Chinese (Mandarin, Traditional - Taiwan)", code: "zh-TW" },
  { name: "Chinese (Mandarin, Traditional Han)", code: "zh-Hant" },
  { name: "Croatian", code: "hr" },
  { name: "Czech", code: "cs" },
  { name: "Danish", code: "da" },
  { name: "Danish (Denmark)", code: "da-DK" },
  { name: "English (United States)", code: "en-US" },
  { name: "English (Australia)", code: "en-AU" },
  { name: "English (United Kingdom)", code: "en-GB" },
  { name: "English (India)", code: "en-IN" },
  { name: "English (New Zealand)", code: "en-NZ" },
  { name: "Estonian", code: "et" },
  { name: "Finnish", code: "fi" },
  { name: "Flemish", code: "nl-BE" },
  { name: "French (Canada)", code: "fr-CA" },
  { name: "German (Switzerland)", code: "de-CH" },
  { name: "Greek", code: "el" },
  { name: "Gujarati", code: "gu" },
  { name: "Gujarati (India)", code: "gu-IN" },
  { name: "Hebrew", code: "he" },
  { name: "Hindi", code: "hi" },
  { name: "Hungarian", code: "hu" },
  { name: "Indonesian", code: "id" },
  { name: "Kannada", code: "kn" },
  { name: "Korean", code: "ko" },
  { name: "Korean (South Korea)", code: "ko-KR" },
  { name: "Latvian", code: "lv" },
  { name: "Lithuanian", code: "lt" },
  { name: "Macedonian", code: "mk" },
  { name: "Malay", code: "ms" },
  { name: "Marathi", code: "mr" },
  { name: "Norwegian", code: "no" },
  { name: "Persian", code: "fa" },
  { name: "Polish", code: "pl" },
  { name: "Portuguese (Brazil)", code: "pt-BR" },
  { name: "Portuguese (Portugal)", code: "pt-PT" },
  { name: "Romanian", code: "ro" },
  { name: "Russian", code: "ru" },
  { name: "Serbian", code: "sr" },
  { name: "Slovak", code: "sk" },
  { name: "Slovenian", code: "sl" },
  { name: "Spanish (Latin America)", code: "es-419" },
  { name: "Swedish", code: "sv" },
  { name: "Swedish (Sweden)", code: "sv-SE" },
  { name: "Tagalog", code: "tl" },
  { name: "Tamil", code: "ta" },
  { name: "Telugu", code: "te" },
  { name: "Thai", code: "th" },
  { name: "Thai (Thailand)", code: "th-TH" },
  { name: "Turkish", code: "tr" },
  { name: "Ukrainian", code: "uk" },
  { name: "Urdu", code: "ur" },
  { name: "Vietnamese", code: "vi" },
] as const satisfies readonly DeepgramLanguageOption[];

export type DeepgramNova3LanguageCode = (typeof DEEPGRAM_NOVA3_LANGUAGE_DEFINITIONS)[number]["code"];
export type DeepgramNova3StreamingLanguageCode = Exclude<DeepgramNova3LanguageCode, "multi">;

export const DEEPGRAM_LANGUAGE_DOCS_URL = "https://developers.deepgram.com/docs/models-languages-overview/";
export const DEEPGRAM_LANGUAGE_LAST_VERIFIED_AT = "2026-07-14";
export const DEEPGRAM_NOVA3_MULTILINGUAL_LANGUAGE_CODES = [
  "en",
  "es",
  "fr",
  "de",
  "hi",
  "ru",
  "pt",
  "ja",
  "it",
  "nl",
] as const satisfies readonly DeepgramNova3StreamingLanguageCode[];

const DEEPGRAM_NOVA3_MULTILINGUAL_LANGUAGE_SET = new Set<string>(
  DEEPGRAM_NOVA3_MULTILINGUAL_LANGUAGE_CODES,
);

export const DEEPGRAM_NOVA3_LANGUAGE_OPTIONS = DEEPGRAM_NOVA3_LANGUAGE_DEFINITIONS.map((option) => ({
  ...option,
  compatibleModels: ["nova-3"] as const,
  compatibleTransports: ["prerecorded", "streaming"] as const,
  multilingualAvailability:
    option.code === "multi" || DEEPGRAM_NOVA3_MULTILINGUAL_LANGUAGE_SET.has(option.code),
  docsUrl: DEEPGRAM_LANGUAGE_DOCS_URL,
  lastVerifiedAt: DEEPGRAM_LANGUAGE_LAST_VERIFIED_AT,
})) satisfies readonly DeepgramLanguageOption[];

export const DEEPGRAM_NOVA3_STREAMING_LANGUAGE_OPTIONS = DEEPGRAM_NOVA3_LANGUAGE_OPTIONS.filter(
  (option): option is (typeof DEEPGRAM_NOVA3_LANGUAGE_OPTIONS)[number] & {
    code: DeepgramNova3StreamingLanguageCode;
  } => option.code !== "multi",
);

export const DEEPGRAM_NOVA3_LANGUAGE_CODES = new Set<string>(
  DEEPGRAM_NOVA3_LANGUAGE_OPTIONS.map((option) => option.code),
);

export function isDeepgramNova3LanguageCode(value: string): value is DeepgramNova3LanguageCode {
  return DEEPGRAM_NOVA3_LANGUAGE_CODES.has(value);
}

export function isDeepgramNova3StreamingLanguageCode(
  value: string,
): value is DeepgramNova3StreamingLanguageCode {
  return value !== "multi" && DEEPGRAM_NOVA3_LANGUAGE_CODES.has(value);
}

export function getDeepgramNova3LanguageOption(code: string) {
  return DEEPGRAM_NOVA3_LANGUAGE_OPTIONS.find((option) => option.code === code);
}
