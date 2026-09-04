import { z } from "zod";

import { simulationScorecardSchema } from "@/lib/simulations/types";
import { simulationTemplateSchema } from "@/lib/simulations/templates";

export const ONE_GUEST_EXPERIMENTS_KEY = "one:guest:simulation-presets:v1";
const MAX_GUEST_EXPERIMENTS = 12;
const MAX_SERIALIZED_BYTES = 128_000;

export const savedSimulationExperimentSchema = z.object({
  id: z.string().min(1).max(160),
  name: z.string().min(1).max(120),
  experimentType: z.literal("simulation"),
  schemaVersion: z.literal("one-simulation-experiment-v1"),
  configuration: z.object({
    scenarioId: z.string().regex(/^[a-z0-9-]+$/),
    templateId: simulationTemplateSchema.shape.id,
    impairment: z.enum(["none", "background-noise", "crosstalk", "tool-latency", "network-reconnect"]),
    runCount: z.number().int().min(1).max(3),
    provenance: z.literal("simulated"),
  }).strict(),
  result: simulationScorecardSchema,
  createdAt: z.iso.datetime(),
}).strict();

export type SavedSimulationExperiment = z.infer<typeof savedSimulationExperimentSchema>;

export function readGuestExperiments(storage: Pick<Storage, "getItem">) {
  try {
    const raw = storage.getItem(ONE_GUEST_EXPERIMENTS_KEY);
    if (!raw || raw.length > MAX_SERIALIZED_BYTES) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_GUEST_EXPERIMENTS).flatMap((item) => {
      const result = savedSimulationExperimentSchema.safeParse(item);
      return result.success ? [result.data] : [];
    });
  } catch {
    return [];
  }
}

export function saveGuestExperiment(storage: Pick<Storage, "getItem" | "setItem">, experiment: SavedSimulationExperiment) {
  const safe = savedSimulationExperimentSchema.parse(experiment);
  const existing = readGuestExperiments(storage).filter((item) => item.id !== safe.id);
  const next = [safe, ...existing].slice(0, MAX_GUEST_EXPERIMENTS);
  const serialized = JSON.stringify(next);
  if (serialized.length > MAX_SERIALIZED_BYTES) throw new Error("guest_experiment_storage_limit");
  storage.setItem(ONE_GUEST_EXPERIMENTS_KEY, serialized);
  return next;
}
