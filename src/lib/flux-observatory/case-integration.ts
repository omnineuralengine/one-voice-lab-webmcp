import { z } from "zod";

import { caseItemSchema, caseModuleContributionSchema, type CaseItem, type CaseModuleContribution } from "@/types/live-solution-case";
import { buildFluxHandoffs } from "./handoffs";
import { sanitizeFluxText, sanitizeFluxValue } from "./security";
import type { FluxObservatoryState } from "./types";

export const FLUX_CASE_HANDOFF_KEY = "deepgram-flux-observatory:case-contribution:v1";

const fluxCaseHandoffSchema = z.object({
  schemaVersion: z.literal("flux-case-handoff-v1"),
  generatedAt: z.string().datetime(),
  sourceSessionId: z.string().min(1).max(120),
  mode: z.enum(["synthetic-replay", "live-provider"]),
  providerValidationState: z.enum(["synthetic-only", "not-run", "provider-event-observed-unreviewed", "manually-validated"]),
  model: z.enum(["flux-general-en", "flux-general-multi"]),
  encoding: z.enum(["linear16", "linear32", "mulaw", "alaw", "opus", "ogg-opus"]),
  sampleRate: z.number().int(),
  targetChunkMs: z.number().int().min(10).max(1000),
  thresholdHypothesis: z.string().max(600),
  evidenceSummary: z.string().max(1200),
  architectureData: z.array(z.string().max(600)).max(20),
  risks: z.array(z.string().max(600)).max(30),
  productionReadinessGaps: z.array(z.string().max(600)).max(30),
  unresolvedDiscoveryQuestions: z.array(z.string().max(600)).max(20),
}).strict();

export type FluxCaseHandoff = z.infer<typeof fluxCaseHandoffSchema>;

export function buildFluxCaseHandoff(state: FluxObservatoryState): FluxCaseHandoff {
  const handoffs = buildFluxHandoffs(state);
  return fluxCaseHandoffSchema.parse({
    schemaVersion: "flux-case-handoff-v1",
    generatedAt: new Date().toISOString(),
    sourceSessionId: sanitizeFluxText(state.sessionId, 120),
    mode: state.mode,
    providerValidationState: state.providerValidationState,
    model: state.activeConfiguration.model,
    encoding: state.activeConfiguration.encoding,
    sampleRate: state.activeConfiguration.sampleRate,
    targetChunkMs: state.activeConfiguration.targetChunkMs,
    thresholdHypothesis: handoffs.liveSolutionStudio.thresholdHypothesis,
    evidenceSummary: handoffs.solutionDeliverablesStudio.evidenceSummary,
    architectureData: handoffs.solutionDeliverablesStudio.architectureData,
    risks: handoffs.solutionDeliverablesStudio.risks,
    productionReadinessGaps: handoffs.solutionDeliverablesStudio.productionReadinessGaps,
    unresolvedDiscoveryQuestions: handoffs.liveSolutionStudio.unresolvedDiscoveryQuestions,
  });
}

export function serializeFluxCaseHandoff(state: FluxObservatoryState) {
  return JSON.stringify(buildFluxCaseHandoff(state));
}

export function parseFluxCaseHandoff(value: string | null): FluxCaseHandoff | null {
  try {
    const parsed = fluxCaseHandoffSchema.safeParse(sanitizeFluxValue(JSON.parse(value ?? "null")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function createFluxCaseContribution(caseId: string, seed: FluxCaseHandoff): CaseModuleContribution {
  const now = seed.generatedAt;
  const artifact = item(caseId, now, {
    kind: "technical-artifact",
    title: "Flux Observatory configuration and architecture evidence",
    body: `${seed.model}; ${seed.encoding} ${seed.sampleRate} Hz; configured chunk target ${seed.targetChunkMs} ms. ${seed.architectureData.join(" ")}`,
    structuredData: {
      model: seed.model,
      endpoint: "/v2/listen",
      encoding: seed.encoding,
      sampleRate: seed.sampleRate,
      configuredTargetChunkMs: seed.targetChunkMs,
      thresholdHypothesis: seed.thresholdHypothesis,
      sourceSessionId: seed.sourceSessionId,
      evidenceMode: seed.mode,
    },
    verificationState: seed.mode === "live-provider" ? "artifact-observed" : "unverified",
    confidence: seed.mode === "live-provider" ? "Medium" : "Unknown",
  });
  const validation = item(caseId, now, {
    kind: "validation-result",
    title: seed.mode === "synthetic-replay" ? "Synthetic Flux event-pipeline validation" : "Local Flux provider observation",
    body: seed.evidenceSummary,
    structuredData: {
      testEnvironment: seed.mode === "synthetic-replay" ? "deterministic synthetic fixture" : "local browser and provider session",
      scope: seed.mode === "synthetic-replay" ? "application event pipeline only" : "single local session only",
      providerValidationState: seed.providerValidationState,
    },
    verificationState: "locally-validated",
    confidence: seed.mode === "synthetic-replay" ? "High" : "Medium",
  });
  const risks = seed.risks.slice(0, 8).map((risk) => item(caseId, now, {
    kind: "risk",
    title: `Flux POC risk: ${risk}`.slice(0, 300),
    body: risk,
    structuredData: { riskCategory: "architecture", likelihood: "Unknown", impact: "Unknown", severity: "Unknown", description: risk, mitigation: "Validate in the scoped POC before customer-facing recommendation.", mitigationOwner: "Joint team", mitigationStatus: "open", blocking: false },
    verificationState: "inferred",
    confidence: "Unknown",
  }));
  const questions = seed.unresolvedDiscoveryQuestions.slice(0, 8).map((question) => item(caseId, now, {
    kind: "open-question",
    title: question,
    body: question,
    structuredData: { source: "flux-observatory", answerStatus: "unanswered" },
    verificationState: "unverified",
    confidence: "Unknown",
  }));
  const action = item(caseId, now, {
    kind: "action",
    title: "Run the next scoped Flux validation",
    body: seed.productionReadinessGaps.length ? `Validate ${seed.productionReadinessGaps.slice(0, 4).join(", ")}.` : "Run representative live microphone validation.",
    structuredData: { actionText: "Run the next scoped Flux validation", owner: "Joint team", ownerType: "joint", status: "open", customerVisible: false },
    verificationState: "unverified",
    confidence: "Unknown",
  });
  const relationId = `flux-relation-${crypto.randomUUID()}`;
  return caseModuleContributionSchema.parse({
    moduleId: "flux-observatory",
    caseId,
    createdItems: [artifact, ...risks, ...questions],
    updatedItems: [],
    proposedRelations: [{ id: relationId, caseId, fromItemId: validation.id, toItemId: artifact.id, type: "validates", direction: "directed", note: "The scoped Observatory run validates only the attached application evidence.", confidence: "Medium", sourceRefs: [], createdBy: "Flux Observatory", createdAt: now, updatedAt: now, status: "active", visibility: "internal", provenance: { mode: "module", sourceLabel: "Flux Conversation Observatory", sourceItemIds: [] } }],
    questionCandidates: [],
    claimWarnings: ["Locally measured timing is not a universal Deepgram benchmark.", "Synthetic fixtures are not live provider evidence.", "Production readiness is not established."],
    validationResults: [validation],
    sourceRefs: [],
    suggestedActions: [action],
    generatedAt: now,
    provenance: { mode: "module", sourceLabel: "Flux Conversation Observatory", sourceItemIds: [] },
  }) as unknown as CaseModuleContribution;
}

function item(caseId: string, now: string, value: Pick<CaseItem, "kind" | "title" | "body" | "structuredData" | "verificationState" | "confidence">): CaseItem {
  const synthetic = value.structuredData.evidenceMode === "synthetic-replay" || value.structuredData.testEnvironment === "deterministic synthetic fixture";
  return caseItemSchema.parse({
    id: `flux-item-${crypto.randomUUID()}`,
    caseId,
    ...value,
    title: sanitizeFluxText(value.title, 300),
    body: sanitizeFluxText(value.body, 12_000),
    status: "active",
    claimSafety: value.verificationState === "inferred" || value.verificationState === "unverified" ? "needs-qualification" : "safe-to-say",
    sourceRefs: [],
    moduleOrigin: "flux-observatory",
    createdBy: "Flux Observatory",
    createdAt: now,
    updatedAt: now,
    tags: ["flux", "observability"],
    sensitivity: "internal",
    visibility: "internal",
    exportPolicy: "review",
    includeInCustomerExport: false,
    includeInInternalExport: true,
    isPinned: false,
    isArchived: false,
    redactionStatus: synthetic ? "synthetic" : "redacted",
    provenance: { mode: "module", sourceLabel: "Flux Conversation Observatory", sourceItemIds: [] },
    revision: 1,
  }) as CaseItem;
}
