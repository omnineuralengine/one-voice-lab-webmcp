import { z } from "zod";

export const EVALUATION_PRESET_LIBRARY_VERSION = "1.0.0" as const;

export const evaluationPresetSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  name: z.string().min(1),
  purpose: z.string().min(1),
  text: z.string().min(1),
  notes: z.array(z.string().min(1)),
}).strict();

export const EVALUATION_PRESETS = Object.freeze([
  evaluationPresetSchema.parse({
    id: "customer-support",
    version: "1.0.0",
    name: "Customer support",
    purpose: "Calm, clear issue resolution with a confirmation step.",
    text: "Thanks for calling Northstar Support. I found your order, and the replacement is scheduled for Friday, August 28. Your confirmation number is N V 4 2 7. Would you like me to repeat that?",
    notes: ["Listen for clarity, warmth, alphanumeric pronunciation, and a natural question ending."],
  }),
  evaluationPresetSchema.parse({
    id: "expressive-narration",
    version: "1.0.0",
    name: "Expressive narration",
    purpose: "Pacing, emphasis, and emotional range without provider-native direction tags.",
    text: "At first, the city sounded distant—just rain against glass. Then the lights returned, one window at a time, and the whole street seemed to breathe again.",
    notes: ["Standardized mode sends plain text only; provider-native emotion controls remain separate."],
  }),
  evaluationPresetSchema.parse({
    id: "names-numbers-dates-currency",
    version: "1.0.0",
    name: "Names, numbers, dates, and currency",
    purpose: "Pronunciation and normalization under an identical written input.",
    text: "Dr. Siobhan Nguyen approved invoice A Z 9 0 4 for $12,408.75 on September 3, 2026. Please call +1 415 555 0186 before 4:30 p.m.",
    notes: ["Providers normalize punctuation, currency, names, and digits differently; the exact input is preserved."],
  }),
  evaluationPresetSchema.parse({
    id: "multilingual-code-switching",
    version: "1.0.0",
    name: "Multilingual or code-switching",
    purpose: "Language transitions without implying every selected model supports the same languages.",
    text: "Welcome to ONE Voice Lab. Podemos continuar en español, oppure possiamo parlare in italiano. Please choose the language that feels most comfortable.",
    notes: ["Run only with models that explicitly support the text; unsupported language coverage must remain visible."],
  }),
  evaluationPresetSchema.parse({
    id: "fast-conversational-response",
    version: "1.0.0",
    name: "Fast conversational response",
    purpose: "Short-turn responsiveness and first-audio timing.",
    text: "Absolutely—I can help with that. Give me one moment while I check the details, then we’ll choose the simplest next step together.",
    notes: ["Short scripts emphasize connection and first-audio timing; they do not represent long-form quality."],
  }),
]);

export type EvaluationPreset = z.infer<typeof evaluationPresetSchema>;

export function getEvaluationPreset(id: string): EvaluationPreset | null {
  return EVALUATION_PRESETS.find((preset) => preset.id === id) ?? null;
}
