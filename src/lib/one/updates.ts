import { z } from "zod";

export const oneLabUpdateSchema = z.object({
  id: z.uuid(),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(500),
  category: z.enum(["lab", "provider", "simulation", "security"]),
  provider: z.string().nullable(),
  publishedAt: z.iso.datetime(),
  href: z.string().startsWith("/"),
}).strict();

export type OneLabUpdate = z.infer<typeof oneLabUpdateSchema>;

export const ONE_LAB_UPDATES: readonly OneLabUpdate[] = [
  {
    id: "020f1f1e-14c8-4f1b-a9e1-0cdcd7a11501",
    slug: "one-voice-lab-identity",
    title: "Welcome to ONE Voice Lab",
    summary: "The independent lab now sits under Omni Neural Engine while retaining provider-specific evidence and execution boundaries.",
    category: "lab",
    provider: null,
    publishedAt: "2026-08-21T12:00:00.000Z",
    href: "/",
  },
  {
    id: "020f1f1e-14c8-4f1b-a9e1-0cdcd7a11502",
    slug: "simulation-lab-v1",
    title: "Simulation Lab V1",
    summary: "Run deterministic, nonbillable failure replays and save bounded experiment records locally or to an explicitly connected account.",
    category: "simulation",
    provider: null,
    publishedAt: "2026-08-21T12:00:00.000Z",
    href: "/simulation-lab",
  },
];
