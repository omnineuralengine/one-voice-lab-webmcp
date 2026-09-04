import { z } from "zod";

import { defineAction, type ActionField, type ActionMetadata } from "@/lib/actions/contracts";
import {
  evaluationEvidenceBundleSchema,
  evaluationRunRequestSchema,
  humanRatingSchema,
} from "@/lib/evaluation/schema";
import {
  benchmarkComparabilityAssessmentSchema,
  benchmarkIntegritySchema,
  benchmarkLeaderboardSnapshotSchema,
  benchmarkMethodologySchema,
  benchmarkMetricScoringProfileSchema,
  benchmarkPlanSchema,
  benchmarkProviderIdSchema,
  benchmarkRankingCandidateSchema,
  benchmarkResultSchema,
} from "@/lib/evaluation/benchmark-schema";
import {
  benchmarkPrivateResultProjectionSchema,
  benchmarkPublicSnapshotListInputSchema,
  benchmarkPublicSnapshotListSchema,
  benchmarkRetrieveResultInputSchema,
} from "@/lib/evaluation/benchmark-read-schema";
import {
  publicEvalSchema,
  publicMethodologySchema,
  publicProviderSchema,
  publicSyntheticEvalResultSchema,
} from "@/lib/public-evidence/schemas";
import { providerIdSchema } from "@/lib/providers/types";
import {
  providerCatalogIdSchema,
  providerCapabilityDeclarationSchema,
  providerPlatformProjectionSchema,
  normalizedProviderCapabilityIdSchema,
  normalizedProviderModelSchema,
  normalizedProviderVoiceSchema,
} from "@/lib/providers/platform-types";
import { feedbackActionInputSchema } from "@/lib/feedback/schema";
import {
  scenarioRunRequestSchema,
  scenarioRunResponseSchema,
} from "@/lib/scenarios/contracts";

const emptyInputSchema = z.object({}).strict();
const stableIdSchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/i);
const benchmarkDigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const providerIdsSchema = z.array(providerCatalogIdSchema).min(2).max(4).superRefine((ids, context) => {
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "Choose each provider once." });
});
const protectedLiveEvaluationInputSchema = evaluationRunRequestSchema.superRefine((input, context) => {
  if (input.executionMode !== "protected-live") {
    context.addIssue({ code: "custom", message: "Protected live evaluation requires protected-live execution mode." });
  }
  if (!input.confirmedPaidCalls) {
    context.addIssue({ code: "custom", message: "Live evaluation requires explicit paid-call confirmation." });
  }
});
const localLiveEvaluationInputSchema = evaluationRunRequestSchema.superRefine((input, context) => {
  if (input.executionMode !== "local-live") {
    context.addIssue({ code: "custom", message: "Local live evaluation requires local-live execution mode." });
  }
  if (!input.confirmedPaidCalls) {
    context.addIssue({ code: "custom", message: "Live evaluation requires explicit paid-call confirmation." });
  }
});
const fixtureEvaluationInputSchema = evaluationRunRequestSchema.superRefine((input, context) => {
  if (input.executionMode !== "fixture" || input.confirmedPaidCalls) {
    context.addIssue({ code: "custom", message: "Fixture evaluation must remain nonbillable and fixture-only." });
  }
});
const publicProviderComparisonSchema = z.object({
  comparisonType: z.literal("registry_evidence_only"),
  rankingProvided: z.literal(false),
  providers: z.array(publicProviderSchema).min(2).max(4),
  limitations: z.array(z.string().min(1).max(500)).min(1).max(10),
}).strict();
const benchmarkPlanDecisionSchema = z.object({
  status: z.enum(["ready", "blocked", "rejected"]),
  plan: benchmarkPlanSchema.nullable(),
  totalAttempts: z.number().int().nonnegative(),
  maximumAttempts: z.number().int().positive(),
  requiresPaidProviderCalls: z.boolean(),
  liveExecutionEnabled: z.boolean(),
  executionBoundary: z.enum(["existing-evaluate-handler", "unavailable"]),
  reasons: z.array(z.object({
    code: stableIdSchema,
    message: z.string().trim().min(1).max(500),
  }).strict()).max(50),
}).strict();
function field(name: string, type: string, required: boolean, description: string): ActionField {
  return { name, type, required, description };
}

function metadata<const Name extends string>(value: ActionMetadata<Name>) {
  return value;
}

export const ACTION_DEFINITIONS = {
  "providers.list": defineAction({
    metadata: metadata({
      name: "providers.list",
      description: "List the public, evidence-labeled provider records without credential details.",
      requiredInputs: [
        field("limit", "integer 1..50", false, "Bounded page size; defaults to 25."),
        field("after", "ProviderCatalogId?", false, "Stable provider-ID cursor from the previous page."),
        field("group", "ProviderCatalogGroup?", false, "Optional catalog group filter."),
        field("kind", "ProviderEntityKind?", false, "Optional provider/infrastructure/evaluation kind filter."),
        field("capabilityId", "NormalizedProviderCapabilityId?", false, "Optional declared capability filter."),
      ],
      outputShape: [
        field("providers", "PublicProvider[]", true, "Safe bounded public provider projections."),
        field("nextCursor", "ProviderCatalogId | null", true, "Stable cursor for the next page."),
        field("totalMatched", "integer", true, "Count after safe metadata filters and before pagination."),
      ],
      authentication: "none",
      trust: ["public"],
      surfaces: ["ui", "rest", "mcp", "automation"],
      agentExposable: true,
      usage: { kind: "none", confirmationRequired: false, note: "Read-only repository evidence." },
      implementation: "action-backed",
    }),
    inputSchema: z.object({
      limit: z.number().int().min(1).max(50).default(25),
      after: providerCatalogIdSchema.optional(),
      group: providerPlatformProjectionSchema.shape.group.optional(),
      kind: providerPlatformProjectionSchema.shape.kind.optional(),
      capabilityId: normalizedProviderCapabilityIdSchema.optional(),
    }).strict(),
    outputSchema: z.object({
      providers: z.array(publicProviderSchema).max(50),
      nextCursor: providerCatalogIdSchema.nullable(),
      totalMatched: z.number().int().nonnegative().max(10_000),
    }).strict(),
  }),
  "providers.get": defineAction({
    metadata: metadata({
      name: "providers.get",
      description: "Read one public provider evidence record by stable provider ID.",
      requiredInputs: [field("providerId", "ProviderId", true, "A stable provider registry ID.")],
      outputShape: [field("provider", "PublicProvider", true, "The safe public provider projection.")],
      authentication: "none",
      trust: ["public"],
      surfaces: ["ui", "rest", "mcp", "automation"],
      agentExposable: true,
      usage: { kind: "none", confirmationRequired: false, note: "Read-only repository evidence." },
      implementation: "action-backed",
    }),
    inputSchema: z.object({ providerId: providerCatalogIdSchema }).strict(),
    outputSchema: z.object({ provider: publicProviderSchema }).strict(),
  }),
  "providers.compareEvidence": defineAction({
    metadata: metadata({
      name: "providers.compareEvidence",
      description: "Compare public integration evidence for two to four providers without ranking quality.",
      requiredInputs: [field("providerIds", "ProviderId[2..4]", true, "Two to four unique provider IDs.")],
      outputShape: [
        field("comparisonType", "registry_evidence_only", true, "The bounded comparison method."),
        field("rankingProvided", "false", true, "Confirms that no provider ranking is produced."),
        field("providers", "PublicProvider[]", true, "Matched public provider evidence records."),
        field("limitations", "string[]", true, "Interpretation limits for the comparison."),
      ],
      authentication: "none",
      trust: ["public"],
      surfaces: ["ui", "rest", "mcp", "automation"],
      agentExposable: true,
      usage: { kind: "none", confirmationRequired: false, note: "No provider request or ranking." },
      implementation: "action-backed",
    }),
    inputSchema: z.object({ providerIds: providerIdsSchema }).strict(),
    outputSchema: publicProviderComparisonSchema,
  }),
  "providers.listCapabilities": defineAction({
    metadata: metadata({
      name: "providers.listCapabilities",
      description: "List normalized, provenance-labeled capabilities for one catalog provider without invoking it.",
      requiredInputs: [field("providerId", "ProviderCatalogId", true, "A stable provider catalog ID.")],
      outputShape: [field("providerId", "ProviderCatalogId", true, "The matched provider ID."), field("capabilities", "ProviderCapabilityDeclaration[]", true, "Safe normalized capability declarations.")],
      authentication: "none",
      trust: ["public"],
      surfaces: ["ui", "rest", "mcp", "automation"],
      agentExposable: true,
      usage: { kind: "none", confirmationRequired: false, note: "Bounded code-owned metadata read; no provider call." },
      implementation: "action-backed",
    }),
    inputSchema: z.object({ providerId: providerCatalogIdSchema }).strict(),
    outputSchema: z.object({ providerId: providerCatalogIdSchema, capabilities: z.array(providerCapabilityDeclarationSchema) }).strict(),
  }),
  "providers.listModels": defineAction({
    metadata: metadata({
      name: "providers.listModels",
      description: "List only curated or cached normalized public model metadata; never call a provider from this read action.",
      requiredInputs: [field("providerId", "ProviderCatalogId", true, "A stable provider catalog ID.")],
      outputShape: [field("providerId", "ProviderCatalogId", true, "The matched provider ID."), field("models", "NormalizedProviderModel[]", true, "Safe bounded public model metadata."), field("availability", "available | unavailable", true, "Whether public-safe model metadata exists.")],
      authentication: "none",
      trust: ["public"],
      surfaces: ["ui", "rest", "mcp", "automation"],
      agentExposable: true,
      usage: { kind: "none", confirmationRequired: false, note: "Curated or cache-backed metadata only; no upstream discovery." },
      implementation: "action-backed",
    }),
    inputSchema: z.object({ providerId: providerCatalogIdSchema }).strict(),
    outputSchema: z.object({ providerId: providerCatalogIdSchema, models: z.array(normalizedProviderModelSchema).max(500), availability: z.enum(["available", "unavailable"]) }).strict(),
  }),
  "providers.listVoices": defineAction({
    metadata: metadata({
      name: "providers.listVoices",
      description: "List only curated or explicitly public normalized voice metadata; never expose an account-scoped provider catalog.",
      requiredInputs: [field("providerId", "ProviderCatalogId", true, "A stable provider catalog ID.")],
      outputShape: [field("providerId", "ProviderCatalogId", true, "The matched provider ID."), field("voices", "NormalizedProviderVoice[]", true, "Safe bounded public voice metadata."), field("availability", "available | unavailable", true, "Whether public-safe voice metadata exists.")],
      authentication: "none",
      trust: ["public"],
      surfaces: ["ui", "rest", "mcp", "automation"],
      agentExposable: true,
      usage: { kind: "none", confirmationRequired: false, note: "Curated or cache-backed metadata only; no upstream discovery." },
      implementation: "action-backed",
    }),
    inputSchema: z.object({ providerId: providerCatalogIdSchema }).strict(),
    outputSchema: z.object({ providerId: providerCatalogIdSchema, voices: z.array(normalizedProviderVoiceSchema).max(500), availability: z.enum(["available", "unavailable"]) }).strict(),
  }),
  "providers.getHealth": defineAction({
    metadata: metadata({
      name: "providers.getHealth",
      description: "Read local configuration and bounded operational health state without polling a paid provider endpoint.",
      requiredInputs: [field("providerId", "ProviderCatalogId", true, "A stable provider catalog ID.")],
      outputShape: [field("providerId", "ProviderCatalogId", true, "The matched provider ID."), field("health", "ProviderPlatformProjection.health", true, "Non-performance readiness information."), field("readiness", "ProviderPlatformProjection.readiness", true, "Safe current readiness state.")],
      authentication: "none",
      trust: ["public"],
      surfaces: ["ui", "rest", "mcp", "automation"],
      agentExposable: true,
      usage: { kind: "none", confirmationRequired: false, note: "Local/cached status only; no paid health polling." },
      implementation: "action-backed",
    }),
    inputSchema: z.object({ providerId: providerCatalogIdSchema }).strict(),
    outputSchema: z.object({
      providerId: providerCatalogIdSchema,
      health: providerPlatformProjectionSchema.shape.health,
      readiness: providerPlatformProjectionSchema.shape.readiness,
    }).strict(),
  }),
  "evaluations.list": defineAction({
    metadata: metadata({
      name: "evaluations.list",
      description: "List versioned public deterministic evaluation definitions.",
      requiredInputs: [],
      outputShape: [field("evaluations", "PublicEval[]", true, "Repository-owned fixture definitions.")],
      authentication: "none",
      trust: ["public"],
      surfaces: ["ui", "rest", "mcp", "automation"],
      agentExposable: true,
      usage: { kind: "none", confirmationRequired: false, note: "Read-only fixture metadata." },
      implementation: "action-backed",
    }),
    inputSchema: emptyInputSchema,
    outputSchema: z.object({ evaluations: z.array(publicEvalSchema) }).strict(),
  }),
  "evaluations.get": defineAction({
    metadata: metadata({
      name: "evaluations.get",
      description: "Read one public deterministic evaluation definition by stable ID.",
      requiredInputs: [field("evalId", "string", true, "A stable public evaluation ID.")],
      outputShape: [field("evaluation", "PublicEval", true, "The versioned evaluation definition.")],
      authentication: "none",
      trust: ["public"],
      surfaces: ["ui", "rest", "mcp", "automation"],
      agentExposable: true,
      usage: { kind: "none", confirmationRequired: false, note: "Read-only fixture metadata." },
      implementation: "action-backed",
    }),
    inputSchema: z.object({ evalId: stableIdSchema }).strict(),
    outputSchema: z.object({ evaluation: publicEvalSchema }).strict(),
  }),
  "methodology.get": defineAction({
    metadata: metadata({
      name: "methodology.get",
      description: "Read the public evaluation methodology and interpretation limits.",
      requiredInputs: [],
      outputShape: [field("methodology", "PublicMethodology", true, "The versioned public methodology.")],
      authentication: "none",
      trust: ["public"],
      surfaces: ["ui", "rest", "mcp", "automation"],
      agentExposable: true,
      usage: { kind: "none", confirmationRequired: false, note: "Read-only methodology." },
      implementation: "action-backed",
    }),
    inputSchema: emptyInputSchema,
    outputSchema: z.object({ methodology: publicMethodologySchema }).strict(),
  }),
  "publicEvaluation.runSynthetic": defineAction({
    metadata: metadata({
      name: "publicEvaluation.runSynthetic",
      description: "Run one repository-owned deterministic fixture without accepting content or calling a provider.",
      requiredInputs: [field("evalId", "string", true, "A stable runnable public evaluation ID.")],
      outputShape: [field("result", "PublicSyntheticEvalResult", true, "A structured simulated evidence result.")],
      authentication: "none",
      trust: ["public"],
      surfaces: ["ui", "keyboard", "touch", "pwa", "rest", "mcp", "automation"],
      agentExposable: true,
      usage: { kind: "local-resource", confirmationRequired: false, note: "Bounded local fixture computation; no provider call." },
      implementation: "action-backed",
    }),
    inputSchema: z.object({ evalId: stableIdSchema }).strict(),
    outputSchema: z.object({ result: publicSyntheticEvalResultSchema }).strict(),
  }),
  "scenario.runFixture": defineAction({
    metadata: metadata({
      name: "scenario.runFixture",
      description: "Run one curated, repository-owned scenario fixture and return an ephemeral explainable receipt.",
      requiredInputs: [
        field("scenarioId", "recover-from-interruption", true, "The single installed user-facing scenario."),
        field("scenarioVersion", "1.0.0", true, "The exact immutable scenario version."),
        field("executionMode", "synthetic_fixture", true, "The only enabled execution mode; live execution is rejected."),
        field("reviewGoal", "ScenarioReviewGoal", true, "A presentation goal that shapes only the explanation."),
        field("correlationToken", "opaque string", true, "A bounded browser correlation token that is never persisted or returned."),
      ],
      outputShape: [
        field("receipt", "ScenarioRunReceipt", true, "A versioned, sanitized, ephemeral execution receipt."),
        field("explanation", "ScenarioExplanation", true, "A deterministic rule projection traced to receipt evidence."),
      ],
      authentication: "optional",
      trust: ["same-origin", "user-gesture"],
      surfaces: ["ui", "keyboard", "touch", "pwa"],
      agentExposable: false,
      usage: {
        kind: "local-resource",
        confirmationRequired: false,
        note: "Bounded repository fixture only; no voice-provider request, scenario persistence, history, or scenario analytics. Existing server identity and quota admission still apply.",
      },
      implementation: "dedicated-service",
    }),
    inputSchema: scenarioRunRequestSchema,
    outputSchema: scenarioRunResponseSchema,
  }),
  "benchmark.plan": defineAction({
    metadata: metadata({
      name: "benchmark.plan",
      description: "Validate a bounded provider-neutral benchmark plan while keeping live execution disabled by default.",
      requiredInputs: [field("plan", "BenchmarkPlan", true, "A bounded fixture or explicitly confirmed live benchmark plan.")],
      outputShape: [field("decision", "BenchmarkPlanDecision", true, "A structured ready, blocked, or rejected planning decision.")],
      authentication: "none",
      trust: ["same-origin"],
      surfaces: ["ui", "keyboard", "touch", "pwa"],
      agentExposable: false,
      usage: { kind: "none", confirmationRequired: false, note: "Planning performs no provider call; paid execution remains in the existing protected Evaluate action." },
      implementation: "dedicated-service",
    }),
    inputSchema: z.object({ plan: benchmarkPlanSchema }).strict(),
    outputSchema: z.object({ decision: benchmarkPlanDecisionSchema }).strict(),
  }),
  "benchmark.runFixture": defineAction({
    metadata: metadata({
      name: "benchmark.runFixture",
      description: "Run an exact validated benchmark plan against repository-owned deterministic fixture evidence only.",
      requiredInputs: [field("plan", "BenchmarkPlan", true, "One exact canonical two-to-four-lane fixture benchmark plan.")],
      outputShape: [
        field("bundle", "EvaluationEvidenceBundle", true, "The complete validated and reproducible fixture evidence bundle."),
        field("results", "BenchmarkResult[]", true, "The canonical private benchmark result materialized from that bundle."),
      ],
      authentication: "none",
      trust: ["same-origin"],
      surfaces: ["ui", "keyboard", "touch", "pwa"],
      agentExposable: false,
      usage: { kind: "local-resource", confirmationRequired: false, note: "Bounded deterministic fixture computation only; no provider, network, or storage request." },
      implementation: "dedicated-service",
    }),
    inputSchema: z.object({ plan: benchmarkPlanSchema }).strict(),
    outputSchema: z.object({
      bundle: evaluationEvidenceBundleSchema,
      results: z.array(benchmarkResultSchema).length(1),
    }).strict(),
  }),
  "benchmark.materializeEvaluation": defineAction({
    metadata: metadata({
      name: "benchmark.materializeEvaluation",
      description: "Convert one validated Evaluate evidence bundle into canonical private benchmark evidence without rerunning providers.",
      requiredInputs: [field("bundle", "EvaluationEvidenceBundle", true, "One sanitized atomic TTS evaluation observation.")],
      outputShape: [field("results", "BenchmarkResult[]", true, "Canonical private benchmark results with separated evidence classes.")],
      authentication: "none",
      trust: ["same-origin", "active-session"],
      surfaces: ["ui", "keyboard", "touch", "pwa"],
      agentExposable: false,
      usage: { kind: "local-resource", confirmationRequired: false, note: "Local validation and hashing only; no provider or storage request." },
      implementation: "dedicated-service",
    }),
    inputSchema: z.object({ bundle: evaluationEvidenceBundleSchema }).strict(),
    outputSchema: z.object({ results: z.array(benchmarkResultSchema).min(1).max(4) }).strict(),
  }),
  "benchmark.retrieveResult": defineAction({
    metadata: metadata({
      name: "benchmark.retrieveResult",
      description: "Retrieve one canonical benchmark result through the owner-authorized persistence boundary.",
      requiredInputs: [field("runId", "UUID", true, "The canonical external benchmark run identifier.")],
      outputShape: [field("result", "BenchmarkPrivateResultProjection | null", true, "The bounded owner-authorized persistence projection, or null when no result is returned.")],
      authentication: "required",
      trust: ["same-origin", "member-session"],
      surfaces: ["ui"],
      agentExposable: false,
      usage: { kind: "none", confirmationRequired: false, note: "Read-only owner-authorized persistence lookup; no provider call." },
      implementation: "dedicated-service",
    }),
    inputSchema: benchmarkRetrieveResultInputSchema,
    outputSchema: z.object({ result: benchmarkPrivateResultProjectionSchema.nullable() }).strict(),
  }),
  "benchmark.compareResults": defineAction({
    metadata: metadata({
      name: "benchmark.compareResults",
      description: "Explain whether two canonical results are comparable and disclose every material difference.",
      requiredInputs: [
        field("left", "BenchmarkResult", true, "The first canonical benchmark result."),
        field("right", "BenchmarkResult", true, "The second canonical benchmark result."),
        field("scope", "cross-provider | series", true, "Whether provider identity is an expected disclosure or a required match."),
        field("leftProviderId", "BenchmarkProviderId?", false, "Provider selector for the exact left lane."),
        field("leftModelId", "string?", false, "Model selector for the exact left lane."),
        field("leftVoiceId", "string | null?", false, "Voice selector for the exact left lane; null selects a no-voice modality lane."),
        field("leftConfigurationHash", "sha256?", false, "Configuration selector for the exact left lane."),
        field("rightProviderId", "BenchmarkProviderId?", false, "Provider selector for the exact right lane."),
        field("rightModelId", "string?", false, "Model selector for the exact right lane."),
        field("rightVoiceId", "string | null?", false, "Voice selector for the exact right lane; null selects a no-voice modality lane."),
        field("rightConfigurationHash", "sha256?", false, "Configuration selector for the exact right lane."),
      ],
      outputShape: [field("assessment", "BenchmarkComparabilityAssessment", true, "Structured incompatibility reasons and non-blocking disclosures.")],
      authentication: "none",
      trust: ["same-origin", "active-session"],
      surfaces: ["ui", "keyboard", "touch", "pwa"],
      agentExposable: false,
      usage: { kind: "local-resource", confirmationRequired: false, note: "Deterministic local comparison only." },
      implementation: "dedicated-service",
    }),
    inputSchema: z.object({
      left: benchmarkResultSchema,
      right: benchmarkResultSchema,
      scope: z.enum(["cross-provider", "series"]),
      leftProviderId: benchmarkProviderIdSchema.optional(),
      leftModelId: stableIdSchema.optional(),
      leftVoiceId: stableIdSchema.nullable().optional(),
      leftConfigurationHash: benchmarkDigestSchema.optional(),
      rightProviderId: benchmarkProviderIdSchema.optional(),
      rightModelId: stableIdSchema.optional(),
      rightVoiceId: stableIdSchema.nullable().optional(),
      rightConfigurationHash: benchmarkDigestSchema.optional(),
    }).strict(),
    outputSchema: z.object({ assessment: benchmarkComparabilityAssessmentSchema }).strict(),
  }),
  "benchmark.buildMetricLeaderboard": defineAction({
    metadata: metadata({
      name: "benchmark.buildMetricLeaderboard",
      description: "Build one private metric-specific leaderboard snapshot from an explicitly eligible comparable population.",
      requiredInputs: [
        field("candidates", "BenchmarkRankingCandidate[]", true, "Bounded candidates with attributable objective measurements."),
        field("scoringProfile", "BenchmarkMetricScoringProfile", true, "The exact versioned metric/statistic ranking rule."),
      ],
      outputShape: [field("snapshot", "BenchmarkLeaderboardSnapshot", true, "A deterministic private snapshot with inclusions, exclusions, ties, and limitations.")],
      authentication: "none",
      trust: ["same-origin", "active-session"],
      surfaces: ["ui", "keyboard", "touch", "pwa"],
      agentExposable: false,
      usage: { kind: "local-resource", confirmationRequired: false, note: "Private local aggregation only; publication remains a separate server-authoritative operation." },
      implementation: "dedicated-service",
    }),
    inputSchema: z.object({
      candidates: z.array(benchmarkRankingCandidateSchema).min(1).max(1_000),
      scoringProfile: benchmarkMetricScoringProfileSchema,
    }).strict(),
    outputSchema: z.object({ snapshot: benchmarkLeaderboardSnapshotSchema }).strict(),
  }),
  "benchmark.fixtureLeaderboard": defineAction({
    metadata: metadata({
      name: "benchmark.fixtureLeaderboard",
      description: "Create the deterministic, tied, non-public fixture leaderboard used by the Evaluate benchmark preview.",
      requiredInputs: [],
      outputShape: [field("snapshot", "BenchmarkLeaderboardSnapshot", true, "A synthetic private snapshot that makes no provider-performance claim.")],
      authentication: "none",
      trust: ["public"],
      surfaces: ["ui", "keyboard", "touch", "pwa", "rest", "mcp", "automation"],
      agentExposable: true,
      usage: { kind: "local-resource", confirmationRequired: false, note: "Deterministic repository fixture only; no network, credential, or provider usage." },
      implementation: "dedicated-service",
    }),
    inputSchema: emptyInputSchema,
    outputSchema: z.object({ snapshot: benchmarkLeaderboardSnapshotSchema }).strict(),
  }),
  "benchmark.listLeaderboardSnapshots": defineAction({
    metadata: metadata({
      name: "benchmark.listLeaderboardSnapshots",
      description: "List a bounded page of public-verified canonical leaderboard snapshots through the sanitized read boundary.",
      requiredInputs: [
        field("suiteId", "string?", false, "Optional exact canonical suite filter."),
        field("limit", "integer 1..50", false, "A bounded page size; defaults to 20."),
        field("before", "BenchmarkSnapshotCursor?", false, "Optional exact keyset cursor from the previous page."),
      ],
      outputShape: [field("items", "BenchmarkPublicSnapshotListItem[]", true, "Only public-verified, sanitized snapshot summaries visible through the read boundary."), field("nextCursor", "BenchmarkSnapshotCursor | null", true, "A bounded keyset cursor for the next page.")],
      authentication: "none",
      trust: ["public"],
      surfaces: ["ui", "rest", "mcp", "automation"],
      agentExposable: true,
      usage: { kind: "none", confirmationRequired: false, note: "Bounded public metadata read exposed through the shared Stage 4 REST/MCP transports." },
      implementation: "dedicated-service",
    }),
    inputSchema: benchmarkPublicSnapshotListInputSchema,
    outputSchema: benchmarkPublicSnapshotListSchema,
  }),
  "benchmark.listMethodologies": defineAction({
    metadata: metadata({
      name: "benchmark.listMethodologies",
      description: "List the versioned canonical benchmark methodologies without executing a benchmark.",
      requiredInputs: [],
      outputShape: [field("methodologies", "BenchmarkMethodology[]", true, "Repository-owned methodology contracts." )],
      authentication: "none",
      trust: ["public"],
      surfaces: ["ui", "rest", "mcp", "automation"],
      agentExposable: true,
      usage: { kind: "none", confirmationRequired: false, note: "Read-only repository methodology metadata." },
      implementation: "action-backed",
    }),
    inputSchema: emptyInputSchema,
    outputSchema: z.object({ methodologies: z.array(benchmarkMethodologySchema).max(100) }).strict(),
  }),
  "benchmark.inspectMethodology": defineAction({
    metadata: metadata({
      name: "benchmark.inspectMethodology",
      description: "Read one versioned canonical benchmark methodology through the shared typed domain boundary.",
      requiredInputs: [
        field("methodologyId", "string", true, "The stable methodology identifier."),
        field("version", "semver", true, "The exact methodology version."),
      ],
      outputShape: [field("methodology", "BenchmarkMethodology", true, "The complete methodology, eligibility, scoring, and limitation contract.")],
      authentication: "none",
      trust: ["public"],
      surfaces: ["ui", "keyboard", "touch", "pwa", "rest", "mcp", "automation"],
      agentExposable: true,
      usage: { kind: "none", confirmationRequired: false, note: "Read-only repository methodology exposed through the shared Stage 4 REST/MCP transports." },
      implementation: "dedicated-service",
    }),
    inputSchema: z.object({ methodologyId: stableIdSchema, version: z.string().regex(/^\d+\.\d+\.\d+$/) }).strict(),
    outputSchema: z.object({ methodology: benchmarkMethodologySchema }).strict(),
  }),
  "benchmark.verifyResultIntegrity": defineAction({
    metadata: metadata({
      name: "benchmark.verifyResultIntegrity",
      description: "Recompute one canonical result hash and return an explicit hash-only verification state.",
      requiredInputs: [field("result", "BenchmarkResult", true, "A canonical benchmark result with its integrity envelope.")],
      outputShape: [field("integrity", "BenchmarkIntegrity", true, "Hash verification, failure, unsigned, or unsupported-version state.")],
      authentication: "none",
      trust: ["public"],
      surfaces: ["ui", "rest", "mcp", "automation"],
      agentExposable: true,
      usage: { kind: "local-resource", confirmationRequired: false, note: "Server-side canonical SHA-256 verification; no signing key or provider call." },
      implementation: "dedicated-service",
    }),
    inputSchema: z.object({ result: benchmarkResultSchema }).strict(),
    outputSchema: z.object({ integrity: benchmarkIntegritySchema }).strict(),
  }),
  "evaluation.runFixture": defineAction({
    metadata: metadata({
      name: "evaluation.runFixture",
      description: "Run the provider-neutral TTS Compare workspace with deterministic, nonbillable audio fixtures.",
      requiredInputs: [field("request", "EvaluationRunRequest<fixture>", true, "A validated 2–4 lane fixture evaluation request.")],
      outputShape: [field("bundle", "EvaluationEvidenceBundle", true, "The complete versioned evidence bundle, including partial failures.")],
      authentication: "none",
      trust: ["same-origin"],
      surfaces: ["ui", "keyboard", "touch", "pwa", "rest"],
      agentExposable: false,
      usage: { kind: "local-resource", confirmationRequired: false, note: "Deterministic fixture generation only; no provider spend." },
      implementation: "dedicated-service",
    }),
    inputSchema: z.object({ request: fixtureEvaluationInputSchema }).strict(),
    outputSchema: z.object({ bundle: evaluationEvidenceBundleSchema }).strict(),
  }),
  "evaluation.runProtectedLive": defineAction({
    metadata: metadata({
      name: "evaluation.runProtectedLive",
      description: "Run hosted live TTS comparison lanes through server-side adapters and the durable hosted usage boundary.",
      requiredInputs: [field("request", "EvaluationRunRequest<live>", true, "A validated live request with explicit paid-call confirmation.")],
      outputShape: [field("bundle", "EvaluationEvidenceBundle", true, "The sanitized versioned evidence bundle.")],
      authentication: "optional",
      trust: ["same-origin", "durable-usage-gate", "explicit-human-confirmation"],
      surfaces: ["ui", "rest"],
      agentExposable: false,
      usage: { kind: "provider-usage", confirmationRequired: true, note: "Each selected provider may consume paid account usage; hosted policy requires a member unless durable anonymous access is explicitly enabled." },
      implementation: "dedicated-service",
    }),
    inputSchema: z.object({ request: protectedLiveEvaluationInputSchema }).strict(),
    outputSchema: z.object({ bundle: evaluationEvidenceBundleSchema }).strict(),
  }),
  "evaluation.runLocalLive": defineAction({
    metadata: metadata({
      name: "evaluation.runLocalLive",
      description: "Run local-development live TTS comparison lanes through server-side adapters on a loopback-only host.",
      requiredInputs: [field("request", "EvaluationRunRequest<local-live>", true, "A validated local-live request with explicit paid-call confirmation.")],
      outputShape: [field("bundle", "EvaluationEvidenceBundle", true, "The sanitized versioned evidence bundle.")],
      authentication: "none",
      trust: ["same-origin", "trusted-local", "explicit-human-confirmation"],
      surfaces: ["ui", "rest"],
      agentExposable: false,
      usage: { kind: "provider-usage", confirmationRequired: true, note: "Local execution can still consume paid provider account usage." },
      implementation: "dedicated-service",
    }),
    inputSchema: z.object({ request: localLiveEvaluationInputSchema }).strict(),
    outputSchema: z.object({ bundle: evaluationEvidenceBundleSchema }).strict(),
  }),
  "evaluation.cancel": defineAction({
    metadata: metadata({
      name: "evaluation.cancel",
      description: "Cancel the active browser evaluation while preserving provider results that already arrived.",
      requiredInputs: [field("runId", "UUID", true, "The active evaluation run ID.")],
      outputShape: [field("cancelled", "boolean", true, "Whether the matching active run was signalled for cancellation.")],
      authentication: "none",
      trust: ["active-session"],
      surfaces: ["ui", "keyboard", "touch", "pwa"],
      agentExposable: false,
      usage: { kind: "none", confirmationRequired: false, note: "Cancellation does not guarantee provider billing cancellation." },
      implementation: "client-bridge",
    }),
    inputSchema: z.object({ runId: z.string().uuid() }).strict(),
    outputSchema: z.object({ cancelled: z.boolean() }).strict(),
  }),
  "recording.start": defineAction({
    metadata: metadata({
      name: "recording.start",
      description: "Request an explicit local browser recording start on the mounted Audio Signal Lab surface.",
      requiredInputs: [field("surface", "audio-signal-lab", true, "The mounted local recording surface.")],
      outputShape: [field("accepted", "boolean", true, "Whether the active surface accepted the start request.")],
      authentication: "none",
      trust: ["user-gesture"],
      surfaces: ["ui", "keyboard", "touch", "pwa"],
      agentExposable: false,
      usage: { kind: "local-resource", confirmationRequired: false, note: "Local microphone permission remains authoritative; this action never starts a provider-backed Live Mic session." },
      implementation: "client-bridge",
    }),
    inputSchema: z.object({ surface: z.literal("audio-signal-lab") }).strict(),
    outputSchema: z.object({ accepted: z.boolean(), surface: z.literal("audio-signal-lab") }).strict(),
  }),
  "recording.stop": defineAction({
    metadata: metadata({
      name: "recording.stop",
      description: "Stop the active browser recording or live-microphone session and begin bounded cleanup.",
      requiredInputs: [field("surface", "live-mic | audio-signal-lab", true, "The mounted recording surface.")],
      outputShape: [field("stopped", "boolean", true, "Whether an active matching surface received the stop request.")],
      authentication: "none",
      trust: ["active-session"],
      surfaces: ["ui", "keyboard", "touch", "pwa"],
      agentExposable: false,
      usage: { kind: "local-resource", confirmationRequired: false, note: "Local stream and recorder cleanup." },
      implementation: "client-bridge",
    }),
    inputSchema: z.object({ surface: z.enum(["live-mic", "audio-signal-lab"]) }).strict(),
    outputSchema: z.object({ stopped: z.boolean(), surface: z.enum(["live-mic", "audio-signal-lab"]) }).strict(),
  }),
  "provider.switch": defineAction({
    metadata: metadata({
      name: "provider.switch",
      description: "Switch the mounted comparison or provider workspace to a validated provider ID.",
      requiredInputs: [field("providerId", "ProviderId", true, "A provider from the shared registry.")],
      outputShape: [field("providerId", "ProviderId", true, "The selected provider ID.")],
      authentication: "none",
      trust: ["public"],
      surfaces: ["ui", "keyboard", "touch", "pwa"],
      agentExposable: false,
      usage: { kind: "none", confirmationRequired: false, note: "Client selection only; it does not execute a provider request." },
      implementation: "client-bridge",
    }),
    inputSchema: z.object({ providerId: providerIdSchema }).strict(),
    outputSchema: z.object({ providerId: providerIdSchema }).strict(),
  }),
  "provider.open": defineAction({
    metadata: metadata({
      name: "provider.open",
      description: "Navigate to a public provider evidence profile using a validated provider ID.",
      requiredInputs: [field("providerId", "ProviderId", true, "A provider from the shared registry.")],
      outputShape: [field("href", "relative URL", true, "The safe internal provider profile path.")],
      authentication: "none",
      trust: ["public"],
      surfaces: ["ui", "keyboard", "touch", "pwa"],
      agentExposable: false,
      usage: { kind: "none", confirmationRequired: false, note: "Internal navigation only." },
      implementation: "client-bridge",
    }),
    inputSchema: z.object({ providerId: providerIdSchema }).strict(),
    outputSchema: z.object({ href: z.string().startsWith("/providers/").max(120) }).strict(),
  }),
  "audio.playSample": defineAction({
    metadata: metadata({
      name: "audio.playSample",
      description: "Play a mounted, validated local sample or evaluation result by stable ID.",
      requiredInputs: [field("sampleId", "string", true, "A mounted local sample/result ID, never an arbitrary URL.")],
      outputShape: [field("state", "playing | paused", true, "The resulting local playback state.")],
      authentication: "none",
      trust: ["user-gesture", "active-session"],
      surfaces: ["ui", "keyboard", "touch", "pwa"],
      agentExposable: false,
      usage: { kind: "local-resource", confirmationRequired: false, note: "Browser-local playback only." },
      implementation: "client-bridge",
    }),
    inputSchema: z.object({ sampleId: stableIdSchema }).strict(),
    outputSchema: z.object({ sampleId: stableIdSchema, state: z.enum(["playing", "paused"]) }).strict(),
  }),
  "result.exportEvidence": defineAction({
    metadata: metadata({
      name: "result.exportEvidence",
      description: "Validate and download a sanitized evaluation evidence bundle without hosted persistence.",
      requiredInputs: [field("bundle", "EvaluationEvidenceBundle", true, "A compatible sanitized evidence bundle.")],
      outputShape: [
        field("filename", "string", true, "The local download filename."),
        field("contentHash", "sha256", true, "A hash of the exported JSON bytes."),
        field("byteSize", "number", true, "The exported JSON size."),
      ],
      authentication: "none",
      trust: ["user-gesture", "active-session"],
      surfaces: ["ui", "keyboard", "touch", "pwa"],
      agentExposable: false,
      usage: { kind: "local-resource", confirmationRequired: false, note: "Local export only; no hosted share is created." },
      implementation: "client-bridge",
    }),
    inputSchema: z.object({ bundle: evaluationEvidenceBundleSchema }).strict(),
    outputSchema: z.object({ filename: z.string().min(1).max(180), contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/), byteSize: z.number().int().nonnegative() }).strict(),
  }),
  "feedback.submit": defineAction({
    metadata: metadata({
      name: "feedback.submit",
      description: "Submit bounded yay/nay feedback through the existing same-site, rate-limited Supabase service.",
      requiredInputs: [
        field("sentiment", "yay | nay", true, "The quick feedback signal."),
        field("inputMethod", "tap | typed | dictated", true, "How the optional message was entered."),
        field("surface", "FeedbackSurface", true, "The bounded product surface label."),
      ],
      outputShape: [field("feedbackId", "string", true, "The server-created feedback record ID.")],
      authentication: "optional",
      trust: ["same-origin"],
      surfaces: ["ui", "touch", "rest"],
      agentExposable: false,
      usage: { kind: "storage-write", confirmationRequired: false, note: "Bounded feedback storage; raw audio is never submitted." },
      implementation: "dedicated-service",
    }),
    inputSchema: feedbackActionInputSchema,
    outputSchema: z.object({ feedbackId: z.string().min(1).max(200) }).strict(),
  }),
  "result.rateHuman": defineAction({
    metadata: metadata({
      name: "result.rateHuman",
      description: "Apply a human rating to one mounted evaluation result without publishing it.",
      requiredInputs: [
        field("providerId", "ProviderId", true, "The mounted result lane."),
        field("rating", "HumanRating", true, "The bounded human rating dimensions and blind provenance."),
      ],
      outputShape: [field("rating", "HumanRating", true, "The validated local rating state.")],
      authentication: "none",
      trust: ["active-session"],
      surfaces: ["ui", "keyboard", "touch", "pwa"],
      agentExposable: false,
      usage: { kind: "local-resource", confirmationRequired: false, note: "Local evaluation state; not automatically published." },
      implementation: "client-bridge",
    }),
    inputSchema: z.object({ providerId: providerIdSchema, rating: humanRatingSchema }).strict(),
    outputSchema: z.object({ rating: humanRatingSchema }).strict(),
  }),
} as const;

export type ActionName = keyof typeof ACTION_DEFINITIONS;
export type ActionInput<Name extends ActionName> = z.input<(typeof ACTION_DEFINITIONS)[Name]["inputSchema"]>;
export type ActionOutput<Name extends ActionName> = z.output<(typeof ACTION_DEFINITIONS)[Name]["outputSchema"]>;

export const ACTION_REGISTRY = Object.freeze(
  Object.values(ACTION_DEFINITIONS).map((definition) => definition.metadata),
) as readonly ActionMetadata<ActionName>[];

const actionNames = new Set<string>(Object.keys(ACTION_DEFINITIONS));

export const AGENT_ACTION_ALLOWLIST = [
  "providers.list",
  "providers.get",
  "providers.compareEvidence",
  "providers.listCapabilities",
  "providers.listModels",
  "providers.listVoices",
  "providers.getHealth",
  "evaluations.list",
  "evaluations.get",
  "methodology.get",
  "publicEvaluation.runSynthetic",
  "benchmark.fixtureLeaderboard",
  "benchmark.listLeaderboardSnapshots",
  "benchmark.listMethodologies",
  "benchmark.inspectMethodology",
  "benchmark.verifyResultIntegrity",
] as const satisfies readonly ActionName[];

export type AgentActionName = (typeof AGENT_ACTION_ALLOWLIST)[number];

export function isActionName(value: unknown): value is ActionName {
  return typeof value === "string" && actionNames.has(value);
}

export function getActionDefinition<Name extends ActionName>(name: Name): (typeof ACTION_DEFINITIONS)[Name] {
  return ACTION_DEFINITIONS[name];
}

export function getAgentActionMetadata(): readonly ActionMetadata<AgentActionName>[] {
  return AGENT_ACTION_ALLOWLIST.map((name) => {
    const definition = ACTION_DEFINITIONS[name];
    if (!definition.metadata.agentExposable) throw new Error(`Agent action '${name}' must be explicitly marked agent-exposable.`);
    return definition.metadata;
  });
}
