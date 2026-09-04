import { z } from "zod";

export const earlyAccessStatusSchema = z.enum(["Stable", "Early Access", "Experimental"]);
export const earlyAccessEvidenceSchema = z.enum([
  "Repository verified",
  "Deepgram documentation verified",
  "Assumption",
  "Experimental idea",
]);

export const publicEarlyAccessExperimentSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1),
  description: z.string().min(1),
  status: earlyAccessStatusSchema,
  visibility: z.literal("public"),
  whatIsBeingTested: z.string().min(1),
  expectedBehavior: z.array(z.string().min(1)),
  observedBehavior: z.array(z.string().min(1)),
  limitations: z.array(z.string().min(1)),
  documentationUrl: z.string().url().optional(),
  dateTested: z.string().date().optional(),
  evidence: earlyAccessEvidenceSchema,
}).strict();

export type PublicEarlyAccessExperiment = z.infer<typeof publicEarlyAccessExperimentSchema>;
