import { z } from "zod";

export const feedbackActionInputSchema = z.object({
  sentiment: z.enum(["yay", "nay"]),
  message: z.string().trim().max(2_000).optional().default(""),
  inputMethod: z.enum(["tap", "typed", "dictated"]),
  surface: z.enum(["home", "providers", "provider", "simulate", "build", "learn", "settings", "studio", "bench", "other"]),
  providerId: z.enum(["deepgram", "fish-audio", "elevenlabs", "multi-provider"]).nullable().optional(),
}).strict();

export type FeedbackActionInput = z.infer<typeof feedbackActionInputSchema>;
