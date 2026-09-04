export const FLUX_TTS_REGISTRY_VERIFIED_AT = "2026-08-14";

export const FLUX_TTS_VOICES_SOURCE = "https://developers.deepgram.com/docs/flux-tts/voices";

export type FluxTtsTransport = "batch" | "streaming";
export type FluxTtsCatalogTier = "featured" | "more";

export type FluxTtsVoice = Readonly<{
  displayName: string;
  model: `flux-${string}-en`;
  language: "English";
  accent: string;
  gender: "Female" | "Male";
  age: "Young" | "Young Adult" | "Adult" | "Mature";
  character: readonly string[];
  status: "Early Access";
  statusScope: "lab";
  statusNote: "Community lab maturity label; not a Deepgram availability claim.";
  verifiedAt: typeof FLUX_TTS_REGISTRY_VERIFIED_AT;
  officialSource: typeof FLUX_TTS_VOICES_SOURCE;
  transports: readonly FluxTtsTransport[];
  catalogTier: FluxTtsCatalogTier;
}>;

const DOCUMENTED_TRANSPORTS = ["batch", "streaming"] as const;

function voice(
  displayName: string,
  model: FluxTtsVoice["model"],
  accent: string,
  gender: FluxTtsVoice["gender"],
  age: FluxTtsVoice["age"],
  character: readonly string[],
  catalogTier: FluxTtsCatalogTier,
): FluxTtsVoice {
  return {
    displayName,
    model,
    language: "English",
    accent,
    gender,
    age,
    character,
    // Product-requested project maturity label. Current provider docs do not
    // supply this lifecycle label, so its lab scope must remain explicit.
    status: "Early Access",
    statusScope: "lab",
    statusNote: "Community lab maturity label; not a Deepgram availability claim.",
    verifiedAt: FLUX_TTS_REGISTRY_VERIFIED_AT,
    officialSource: FLUX_TTS_VOICES_SOURCE,
    transports: DOCUMENTED_TRANSPORTS,
    catalogTier,
  };
}

/**
 * Deepgram documentation verified catalog, filtered through the lab's explicit
 * execution policy. Deepgram currently documents 36 English voices. This lab
 * intentionally does not execute Conor, leaving 35 executable registry entries.
 */
export const FLUX_TTS_VOICES = [
  voice("Hannah", "flux-hannah-en", "American", "Female", "Young", ["Clear", "confident", "thoughtful", "pleasant", "nice"], "featured"),
  voice("Kit", "flux-kit-en", "British", "Male", "Young Adult", ["Friendly", "energetic", "thoughtful", "calm", "helpful"], "featured"),
  voice("Alexis", "flux-alexis-en", "American", "Female", "Adult", ["Clear", "professional", "calm", "caring", "empathetic"], "featured"),
  voice("Cliff", "flux-cliff-en", "American", "Male", "Mature", ["Deep", "confident", "calm", "raspy", "clear"], "featured"),
  voice("Sienna", "flux-sienna-en", "American", "Female", "Young Adult", ["Clear", "professional", "calm", "warm", "caring"], "featured"),
  voice("Cole", "flux-cole-en", "American", "Male", "Young", ["Friendly", "clear", "interesting", "energetic", "engaging"], "featured"),
  voice("Brooke", "flux-brooke-en", "American", "Female", "Young", ["Friendly", "intelligent", "fast", "confident", "energetic"], "featured"),
  voice("Colin", "flux-colin-en", "British", "Male", "Adult", ["Warm", "friendly", "trustworthy", "confident", "authoritative"], "featured"),
  voice("Gemma", "flux-gemma-en", "British", "Female", "Young", ["Friendly", "kind", "approachable", "caring", "happy"], "featured"),
  voice("Haley", "flux-haley-en", "American", "Female", "Young Adult", ["Clear", "professional", "caring", "calm", "empathetic"], "featured"),
  voice("Heather", "flux-heather-en", "American", "Female", "Young", ["Clear", "engaging", "energetic", "friendly", "thoughtful"], "featured"),
  voice("Miles", "flux-miles-en", "American", "Male", "Adult", ["Clear", "calm", "professional", "confident", "sincere"], "featured"),
  voice("Sean", "flux-sean-en", "British", "Male", "Mature", ["Friendly", "kind", "caring", "calming"], "featured"),
  voice("Bree", "flux-bree-en", "American", "Female", "Mature", ["Friendly", "sweet", "kind"], "more"),
  voice("Brittany", "flux-brittany-en", "American", "Female", "Mature", ["Confident", "kind", "soft"], "more"),
  voice("Bruce", "flux-bruce-en", "American", "Male", "Adult", ["Friendly", "kind", "natural", "believable", "engaged"], "more"),
  voice("Donovan", "flux-donovan-en", "American", "Male", "Adult", ["Professional", "calm", "thoughtful"], "more"),
  voice("Drew", "flux-drew-en", "American", "Male", "Adult", ["Confident", "relaxed", "soft", "young", "calm"], "more"),
  voice("Elise", "flux-elise-en", "American", "Female", "Adult", ["Clear", "professional", "calm", "caring", "empathetic"], "more"),
  voice("Jack", "flux-jack-en", "British", "Male", "Adult", ["Confident", "thoughtful", "friendly", "professional", "clear"], "more"),
  voice("Kai", "flux-kai-en", "Singaporean", "Male", "Young Adult", ["Clear", "calm", "professional", "knowledgeable", "caring"], "more"),
  voice("Kelsey", "flux-kelsey-en", "American", "Female", "Young Adult", ["Clear", "professional", "caring", "calm", "empathetic"], "more"),
  voice("Maeve", "flux-maeve-en", "Irish", "Female", "Adult", ["Friendly", "energetic", "confident", "gentle", "calm"], "more"),
  voice("Marcelo", "flux-marcelo-en", "Filipino", "Male", "Young Adult", ["Clear", "calm", "professional", "knowledgeable", "caring"], "more"),
  voice("Marcus", "flux-marcus-en", "American", "Male", "Adult", ["Friendly", "helpful", "smooth", "professional", "kind"], "more"),
  voice("Meena", "flux-meena-en", "Indian", "Female", "Adult", ["Empathetic", "professional", "calm", "reassuring", "satisfying"], "more"),
  voice("Meghan", "flux-meghan-en", "American", "Female", "Adult", ["Friendly", "nice", "energetic", "kind", "confident"], "more"),
  voice("Naveen", "flux-naveen-en", "Indian", "Male", "Adult", ["Clear", "professional", "knowledgeable", "calm", "caring"], "more"),
  voice("Paige", "flux-paige-en", "American", "Female", "Young Adult", ["Clear", "professional", "calm", "comfortable", "caring"], "more"),
  voice("Priya", "flux-priya-en", "Indian", "Female", "Adult", ["Confident", "empathetic", "professional", "calm", "reassuring"], "more"),
  voice("Rufus", "flux-rufus-en", "British", "Male", "Adult", ["Friendly", "confident", "intelligent", "gentle", "enthusiastic"], "more"),
  voice("Sharon", "flux-sharon-en", "Australian", "Female", "Young", ["Formal", "calm", "relaxed", "confident"], "more"),
  voice("Tanner", "flux-tanner-en", "British", "Male", "Adult", ["Professional", "calm", "confident"], "more"),
  voice("Wade", "flux-wade-en", "American", "Male", "Adult", ["Warm", "confident", "clear", "enthusiastic", "friendly"], "more"),
  voice("Wes", "flux-wes-en", "American", "Male", "Adult", ["Thoughtful", "friendly", "warm", "interesting"], "more"),
] as const satisfies readonly FluxTtsVoice[];

export const FLUX_TTS_VOICE_REGISTRY = FLUX_TTS_VOICES;

export type FluxTtsModel = (typeof FLUX_TTS_VOICES)[number]["model"];

export const FLUX_TTS_MODEL_ALLOWLIST: ReadonlySet<string> = new Set(
  FLUX_TTS_VOICES.map((item) => item.model),
);

export const FLUX_TTS_LAB_POLICY = {
  documentedVoiceCount: 36,
  executableVoiceCount: FLUX_TTS_VOICES.length,
  excludedDocumentedModels: ["flux-conor-en"] as const,
  staleModelsNotInCurrentCatalog: ["flux-renee-en"] as const,
  reason: "Conor is documented by Deepgram but excluded from execution by explicit lab policy. Renee is absent from the current official catalog.",
  verifiedAt: FLUX_TTS_REGISTRY_VERIFIED_AT,
  officialSource: FLUX_TTS_VOICES_SOURCE,
} as const;

export const CONNORS_PICKS_TITLE = "Connor's Picks";

export const CONNORS_PICKS = FLUX_TTS_VOICES.filter(
  (item) => item.model === "flux-cole-en" || item.model === "flux-jack-en",
);

export function isFluxTtsModel(model: unknown): model is FluxTtsModel {
  return typeof model === "string" && FLUX_TTS_MODEL_ALLOWLIST.has(model);
}

export function findFluxTtsVoice(model: string) {
  return FLUX_TTS_VOICES.find((item) => item.model === model);
}
