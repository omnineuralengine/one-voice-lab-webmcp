import {
  DEEPGRAM_NOVA3_LANGUAGE_OPTIONS,
  DEEPGRAM_NOVA3_MULTILINGUAL_LANGUAGE_CODES,
  getDeepgramNova3LanguageOption,
  isDeepgramNova3LanguageCode,
  type DeepgramLanguageOption,
  type DeepgramNova3LanguageCode,
} from "@/lib/deepgram-languages";

export type LanguageHandoffDestination = "transcribe-url" | "upload-audio" | "live-mic" | "api-studio";
export type LanguageRecentRecord = { code: DeepgramNova3LanguageCode; usedAt: string };
export type LanguageLastAppliedRecord = LanguageRecentRecord & { destination: LanguageHandoffDestination };
export type ReviewedLanguageSample = {
  code: DeepgramNova3LanguageCode;
  text: string;
  englishMeaning: string;
  provenance: "curated-project-fixture";
};

export const LANGUAGE_RECENT_STORAGE_KEY = "deepgram-language-workbench:recent:v1";
export const LANGUAGE_LAST_APPLIED_STORAGE_KEY = "deepgram-language-workbench:last-applied:v1";
export const LANGUAGE_RECENT_LIMIT = 5;
export const SAFE_DEEPGRAM_KEY_PLACEHOLDER = "YOUR_DEEPGRAM_API_KEY";

export const REVIEWED_LANGUAGE_SAMPLES: readonly ReviewedLanguageSample[] = [
  { code: "en", text: "Hello, this is a short voice test for the Deepgram language lab.", englishMeaning: "Hello, this is a short voice test for the Deepgram language lab.", provenance: "curated-project-fixture" },
  { code: "it", text: "Ciao, questo è un breve test vocale per il laboratorio linguistico Deepgram.", englishMeaning: "Hello, this is a short voice test for the Deepgram language lab.", provenance: "curated-project-fixture" },
  { code: "es", text: "Hola, esta es una breve prueba de voz para el laboratorio de idiomas de Deepgram.", englishMeaning: "Hello, this is a short voice test for the Deepgram language lab.", provenance: "curated-project-fixture" },
  { code: "fr", text: "Bonjour, ceci est un court test vocal pour le laboratoire de langues Deepgram.", englishMeaning: "Hello, this is a short voice test for the Deepgram language lab.", provenance: "curated-project-fixture" },
  { code: "de", text: "Hallo, dies ist ein kurzer Sprachtest für das Deepgram-Sprachlabor.", englishMeaning: "Hello, this is a short voice test for the Deepgram language lab.", provenance: "curated-project-fixture" },
  { code: "pt", text: "Olá, este é um breve teste de voz para o laboratório de idiomas da Deepgram.", englishMeaning: "Hello, this is a short voice test for the Deepgram language lab.", provenance: "curated-project-fixture" },
] as const;

export function searchNova3Languages(search: string) {
  const query = search.trim().toLocaleLowerCase();
  if (!query) return DEEPGRAM_NOVA3_LANGUAGE_OPTIONS;
  return DEEPGRAM_NOVA3_LANGUAGE_OPTIONS.filter((option) => {
    const region = languageRegionLabel(option);
    const base = languageBaseOption(option.code)?.name ?? "";
    return [option.name, option.code, region, base].join(" ").toLocaleLowerCase().includes(query);
  });
}

export function languageBaseCode(code: string) {
  return code === "multi" ? "multi" : code.split("-")[0];
}

export function languageBaseOption(code: string) {
  return getDeepgramNova3LanguageOption(languageBaseCode(code));
}

export function languageRegionLabel(option: Pick<DeepgramLanguageOption, "code" | "name">) {
  if (!option.code.includes("-")) return null;
  return option.name.match(/\((.+)\)$/)?.[1] ?? option.code.split("-").slice(1).join("-");
}

export function relatedRegionalVariants(code: string) {
  const baseCode = languageBaseCode(code);
  if (baseCode === "multi") return [];
  return DEEPGRAM_NOVA3_LANGUAGE_OPTIONS.filter((option) => option.code === baseCode || option.code.startsWith(`${baseCode}-`));
}

export function reviewedSampleForLanguage(code: string) {
  return REVIEWED_LANGUAGE_SAMPLES.find((sample) => sample.code === languageBaseCode(code)) ?? null;
}

export function canUseSampleInTts(code: string) {
  return ["en", "it", "es", "fr", "de", "ja", "nl"].includes(languageBaseCode(code));
}

export function languageWorkbenchSnippets(code: DeepgramNova3LanguageCode) {
  const query = `model=nova-3&language=${encodeURIComponent(code)}`;
  const json = JSON.stringify({ model: "nova-3", language: code }, null, 2);
  const endpoint = `https://api.deepgram.com/v1/listen?${query}`;
  const typescript = `const audioBytes = await file.arrayBuffer();\n\nconst response = await fetch("${endpoint}", {\n  method: "POST",\n  headers: {\n    Authorization: "Token ${SAFE_DEEPGRAM_KEY_PLACEHOLDER}",\n    "Content-Type": file.type || "application/octet-stream",\n  },\n  body: audioBytes,\n});\n\nconst transcript = await response.json();`;
  const python = `import requests\n\nwith open("audio.wav", "rb") as audio_file:\n    response = requests.post(\n        "${endpoint}",\n        headers={\n            "Authorization": "Token ${SAFE_DEEPGRAM_KEY_PLACEHOLDER}",\n            "Content-Type": "audio/wav",\n        },\n        data=audio_file,\n        timeout=60,\n    )\n\nresponse.raise_for_status()\ntranscript = response.json()`;
  const curl = `curl --request POST \\\n  --url "${endpoint}" \\\n  --header "Authorization: Token ${SAFE_DEEPGRAM_KEY_PLACEHOLDER}" \\\n  --header "Content-Type: audio/wav" \\\n  --data-binary @audio.wav`;
  return { query, json, typescript, python, curl };
}

export function languageRecommendedUses(option: DeepgramLanguageOption) {
  if (option.code === "multi") return [
    "mixed-language recordings covered by the verified multilingual list",
    "workflows where the source may switch among those verified languages",
    "comparison exercises against an explicit language configuration",
  ];
  return [
    `audio known to be primarily ${option.name}`,
    `support calls conducted mainly in ${option.name}`,
    `${option.name} voice notes and recordings`,
  ];
}

export function languageCaveats(option: DeepgramLanguageOption) {
  const caveats: string[] = ["Configuration guidance is not a benchmark result; validate representative audio before choosing a production default."];
  if (languageRegionLabel(option)) caveats.push("Test representative regional audio and keep this regional code distinct from its base language.");
  if (option.code === "multi") caveats.push(`The repository's verified multilingual list is limited to: ${DEEPGRAM_NOVA3_MULTILINGUAL_LANGUAGE_CODES.join(", ")}.`);
  else if (!option.multilingualAvailability) caveats.push("The current verified multilingual list does not include this language code; do not treat multilingual mode as a silent substitute.");
  return caveats;
}

export function sanitizeRecentLanguages(value: unknown): LanguageRecentRecord[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  return value.flatMap<LanguageRecentRecord>((item) => {
    if (!item || typeof item !== "object") return [];
    const code = "code" in item && typeof item.code === "string" ? item.code : "";
    const usedAt = "usedAt" in item && typeof item.usedAt === "string" ? item.usedAt : "";
    if (!isDeepgramNova3LanguageCode(code) || !Number.isFinite(Date.parse(usedAt)) || unique.has(code)) return [];
    unique.add(code);
    return [{ code, usedAt }];
  }).slice(0, LANGUAGE_RECENT_LIMIT);
}

export function sanitizeLastAppliedLanguage(value: unknown): LanguageLastAppliedRecord | null {
  if (!value || typeof value !== "object") return null;
  const code = "code" in value && typeof value.code === "string" ? value.code : "";
  const destination = "destination" in value ? value.destination : null;
  const usedAt = "usedAt" in value && typeof value.usedAt === "string" ? value.usedAt : "";
  if (!isDeepgramNova3LanguageCode(code) || !isLanguageHandoffDestination(destination) || !Number.isFinite(Date.parse(usedAt))) return null;
  return { code, destination, usedAt };
}

export function addRecentLanguage(records: LanguageRecentRecord[], code: DeepgramNova3LanguageCode, usedAt: string) {
  return [{ code, usedAt }, ...records.filter((record) => record.code !== code)].slice(0, LANGUAGE_RECENT_LIMIT);
}

export function isLanguageHandoffDestination(value: unknown): value is LanguageHandoffDestination {
  return value === "transcribe-url" || value === "upload-audio" || value === "live-mic" || value === "api-studio";
}
