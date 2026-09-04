import { z } from "zod";

export const simulationStatusSchema = z.enum(["implemented", "replay", "experimental", "planned"]);
export const simulationModeSchema = z.enum(["replay", "live", "synthetic"]);
export const simulationStageSchema = z.enum(["audio", "stt", "conversation", "agent", "tool", "tts", "playback", "outcome"]);
export const simulationEvidenceSchema = z.enum(["Repository verified", "Assumption", "Experimental idea"]);

export const simulationScenarioSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1),
  shortName: z.string().min(1),
  description: z.string().min(1),
  hypothesis: z.string().min(1),
  status: simulationStatusSchema,
  availableModes: z.array(simulationModeSchema),
  relatedEvalId: z.string().optional(),
  impairments: z.array(z.string().min(1)),
  evidence: simulationEvidenceSchema,
  limitations: z.array(z.string().min(1)).min(1),
}).strict();

export const simulationEventSchema = z.object({
  schemaVersion: z.literal("voice-open-simulation-event-v1"),
  id: z.string().min(1),
  runId: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  offsetMs: z.number().int().nonnegative(),
  stage: simulationStageSchema,
  type: z.string().min(1),
  label: z.string().min(1),
  detail: z.string().min(1),
  state: z.enum(["started", "observed", "completed", "warning", "failed"]),
  provenance: z.literal("simulated"),
}).strict();

export const simulationMetricSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  value: z.number(),
  unit: z.string().min(1),
  evidence: z.literal("simulated_lab_metric"),
  note: z.string().min(1),
}).strict();

export const simulationScorecardSchema = z.object({
  schemaVersion: z.literal("voice-open-simulation-scorecard-v1"),
  runId: z.string().min(1),
  scenarioId: z.string().min(1),
  scenario: z.string().min(1),
  hypothesis: z.string().min(1),
  configuration: z.record(z.string(), z.string()),
  environment: z.literal("local deterministic browser replay"),
  mode: z.literal("replay"),
  provider: z.literal("none"),
  audioFixture: z.string().min(1),
  controlledImpairment: z.string().min(1),
  runCount: z.number().int().positive(),
  observedMetrics: z.array(simulationMetricSchema),
  failures: z.array(z.string()),
  criticalEntityResults: z.array(z.string()),
  taskOutcome: z.string().min(1),
  notes: z.array(z.string().min(1)),
  evidenceLevel: z.literal("Simulated - observed in this experiment"),
  remainingUncertainty: z.array(z.string().min(1)),
}).strict();

export const simulationUsageEventSchema = z.object({
  timestamp: z.string().datetime(),
  runId: z.string().min(1),
  provider: z.literal("none"),
  scenarioId: z.string().min(1),
  mode: z.literal("replay"),
  providerRequestCount: z.literal(0),
  audioSecondsSubmitted: z.literal(0),
  ttsCharactersSubmitted: z.literal(0),
  success: z.boolean(),
  billingValue: z.null(),
  billingMessage: z.literal("Usage captured. Billing value not estimated."),
}).strict();

export type SimulationScenario = z.infer<typeof simulationScenarioSchema>;
export type SimulationEvent = z.infer<typeof simulationEventSchema>;
export type SimulationScorecard = z.infer<typeof simulationScorecardSchema>;
export type SimulationUsageEvent = z.infer<typeof simulationUsageEventSchema>;
export type SimulationStatus = z.infer<typeof simulationStatusSchema>;
