import {
  BENCHMARK_ARTIFACT_VERSION,
  BENCHMARK_CANONICAL_JSON_VERSION,
  BENCHMARK_ELIGIBILITY_VERSION,
  BENCHMARK_INTEGRITY_VERSION,
  BENCHMARK_JUDGMENT_VERSION,
  BENCHMARK_LEADERBOARD_VERSION,
  BENCHMARK_MAX_FIXTURE_ATTEMPTS,
  BENCHMARK_MAX_LIVE_ATTEMPTS,
  BENCHMARK_MEASUREMENT_VERSION,
  BENCHMARK_PLAN_VERSION,
  BENCHMARK_RUN_VERSION,
  BENCHMARK_SCHEMA_VERSION,
  benchmarkComparabilityAssessmentSchema,
  benchmarkLeaderboardSnapshotSchema,
  benchmarkMetricScoringProfileSchema,
  benchmarkPlanSchema,
  benchmarkRankingCandidateSchema,
  benchmarkResultSchema,
  type BenchmarkComparabilityAssessment,
  type BenchmarkLeaderboardSnapshot,
  type BenchmarkMeasurement,
  type BenchmarkMetricScoringProfile,
  type BenchmarkPlan,
  type BenchmarkRankingCandidate,
  type BenchmarkResult,
} from "@/lib/evaluation/benchmark-schema";
import {
  BENCHMARK_FIXTURE_CONFIGURATION_HASH,
  BENCHMARK_FIXTURE_METHODOLOGY_ID,
  BENCHMARK_FIXTURE_METHODOLOGY_VERSION,
  BENCHMARK_FIXTURE_SCENARIO_HASH,
  BENCHMARK_FIXTURE_SCENARIO_ID,
  BENCHMARK_FIXTURE_SCENARIO_VERSION,
} from "@/lib/evaluation/benchmark-fixture-definition";
import { fixtureModelId, fixtureVoiceId } from "@/lib/evaluation/fixture";
import { importEvidenceBundle } from "@/lib/evaluation/evidence";
import {
  EVALUATION_METRIC_VERSION,
  evaluationEvidenceBundleSchema,
  type EvaluationEvidenceBundle,
  type EvaluationMetric,
  type EvaluationProviderEvidence,
} from "@/lib/evaluation/schema";
import { summarizeBenchmarkSamples } from "@/lib/evaluation/benchmark-statistics";
import { getProviderManifest, PROVIDER_REGISTRY } from "@/lib/providers/registry";

const FIXTURE_PREVIEW_TIMESTAMP = "2026-08-27T00:00:00.000Z";
const FIXTURE_PREVIEW_RUN_ID = "00000000-0000-4000-8000-000000000001";
const DEFAULT_BENCHMARK_FRESHNESS_MS = 30 * 24 * 60 * 60 * 1_000;
const MAXIMUM_BENCHMARK_FRESHNESS_MS = 365 * 24 * 60 * 60 * 1_000;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function stableJson(value: unknown): string {
  const normalize = (item: unknown): JsonValue => {
    if (item === null || typeof item === "boolean" || typeof item === "string") return item;
    if (typeof item === "number" && Number.isFinite(item)) return Object.is(item, -0) ? 0 : item;
    if (Array.isArray(item)) return item.map(normalize);
    if (typeof item === "object") {
      const keys = Object.keys(item as Record<string, unknown>);
      if (keys.some((key) => !/^[\x20-\x7E]{1,80}$/.test(key))) {
        throw new TypeError("Benchmark configuration hashing requires 1-80 character printable ASCII object keys for cross-runtime ordering.");
      }
      return Object.fromEntries(keys.sort().map((key) => [key, normalize((item as Record<string, unknown>)[key])])) as Record<string, JsonValue>;
    }
    throw new TypeError("Benchmark configuration hashing accepts JSON-compatible values only.");
  };
  return JSON.stringify(normalize(value));
}

async function sha256Json(value: unknown): Promise<`sha256:${string}`> {
  const cryptoApi = globalThis.crypto?.subtle;
  if (!cryptoApi) throw new Error("A standards-based SHA-256 implementation is required to materialize benchmark configuration evidence.");
  const digest = await cryptoApi.digest("SHA-256", new TextEncoder().encode(stableJson(value)));
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function unsignedIntegrity(payloadSchemaVersion: string) {
  return {
    schemaVersion: BENCHMARK_INTEGRITY_VERSION,
    state: "unsigned" as const,
    algorithm: "sha256" as const,
    canonicalization: BENCHMARK_CANONICAL_JSON_VERSION,
    payloadSchemaVersion,
    digest: null,
    checkedAt: null,
    detail: "This private materialization is structurally validated but has not been sealed for publication.",
  };
}

function metricId(metric: EvaluationMetric): string {
  return metric.name.replaceAll("_", "-");
}

function metricObservation(metric: EvaluationMetric, synthetic: boolean) {
  if (synthetic) return "synthetic" as const;
  if (metric.availability === "unavailable") return "unavailable" as const;
  if (metric.measurementPoint === "provider-reported") return "provider-reported" as const;
  if (metric.measurementPoint === "derived") return "derived" as const;
  return "observed" as const;
}

function metricSource(metric: EvaluationMetric, synthetic: boolean) {
  if (synthetic) return "fixture" as const;
  if (metric.measurementPoint === "provider-reported") return "provider-reported" as const;
  if (metric.measurementPoint === "derived") return "derived" as const;
  return "one-observed" as const;
}

function providerDispatchWasObserved(provider: EvaluationProviderEvidence): boolean {
  return provider.requestTimestamp !== null
    && provider.trace.some((event) => event.type === "provider-request-start");
}

function mappedMeasurement(
  provider: EvaluationProviderEvidence,
  metric: EvaluationMetric,
  configurationHash: `sha256:${string}`,
  recordedAt: string,
  synthetic: boolean,
): BenchmarkMeasurement {
  const providerReliabilityUnavailable = metric.name === "request_success"
    && metric.value === 0
    && !providerDispatchWasObserved(provider);
  return {
    schemaVersion: BENCHMARK_MEASUREMENT_VERSION,
    evidenceCategory: "objective",
    measurementId: `measurement/${provider.runId}/${provider.provider}/${metricId(metric)}`,
    runId: provider.runId,
    providerId: provider.provider,
    model: provider.model,
    voice: provider.voice,
    configurationHash,
    metricId: metricId(metric),
    metricVersion: metric.metricVersion,
    value: providerReliabilityUnavailable ? null : metric.value,
    unit: providerReliabilityUnavailable ? "unavailable" : metric.unit,
    availability: providerReliabilityUnavailable ? "unavailable" : metric.availability,
    synthetic,
    measuredAt: provider.completionTimestamp ?? recordedAt,
    method: "one-evaluation-evidence-adapter",
    precision: providerReliabilityUnavailable || metric.value === null ? null : 0.001,
    sampleCount: 1,
    source: metricSource(metric, synthetic),
    confidence: null,
    provenance: {
      measurementPoint: metric.measurementPoint,
      clock: providerReliabilityUnavailable ? "not-applicable" : metric.provenance.clock,
      observation: providerReliabilityUnavailable ? "unavailable" : metricObservation(metric, synthetic),
      description: providerReliabilityUnavailable
        ? "ONE blocked this lane before provider dispatch; it is not provider-attributable reliability evidence."
        : metric.provenance.description,
      sourceSchemaVersion: EVALUATION_METRIC_VERSION,
    },
  };
}

function selectedConfiguration(provider: EvaluationProviderEvidence) {
  return {
    comparisonMode: provider.providerSpecificConfiguration.comparisonMode ?? null,
    ...provider.providerSpecificConfiguration,
  };
}

function participantStatus(provider: EvaluationProviderEvidence): "listed" | "adapter-backed" | "live-enabled" {
  const adapterBacked = getProviderManifest(provider.provider)?.capabilities.some((capability) => capability.id === "tts" && capability.adapterAvailable) ?? false;
  if (provider.environment !== "fixture" && provider.requestTimestamp !== null) return "live-enabled";
  return adapterBacked ? "adapter-backed" : "listed";
}

function getNumericConfiguration(provider: EvaluationProviderEvidence, key: string): number | null {
  const value = provider.providerSpecificConfiguration[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function materializedStatus(providerResults: readonly EvaluationProviderEvidence[]): BenchmarkResult["status"] {
  const completed = providerResults.filter((result) => result.status === "complete").length;
  if (completed === providerResults.length) return "completed";
  if (completed > 0) return "partially-completed";
  if (providerResults.every((result) => result.status === "cancelled")) return "cancelled";
  return "failed";
}

function runStatus(providerResults: readonly EvaluationProviderEvidence[]): BenchmarkResult["run"]["status"] {
  const status = materializedStatus(providerResults);
  if (status === "completed" || status === "partially-completed" || status === "failed" || status === "cancelled") return status;
  return "insufficient-evidence";
}

function earliestTimestamp(values: readonly (string | null)[]): string | null {
  return values.filter((value): value is string => value !== null).sort()[0] ?? null;
}

function failureSummary(providerResults: readonly EvaluationProviderEvidence[]) {
  const failure = providerResults.find((result) => result.sanitizedError !== null);
  return failure?.sanitizedError
    ? { code: failure.sanitizedError.code, message: failure.sanitizedError.message, providerId: failure.provider }
    : null;
}

export async function materializeEvaluationBenchmarkResults(bundleInput: EvaluationEvidenceBundle): Promise<readonly BenchmarkResult[]> {
  const structurallyValid = evaluationEvidenceBundleSchema.parse(bundleInput);
  const bundle = await importEvidenceBundle(JSON.stringify(structurallyValid));
  const synthetic = bundle.providerResults.every((result) => result.environment === "fixture");
  const configurationHashes = new Map<string, `sha256:${string}`>();
  await Promise.all(bundle.providerResults.map(async (provider) => {
    configurationHashes.set(provider.provider, await sha256Json(selectedConfiguration(provider)));
  }));

  const participants = bundle.providerResults.map((provider) => {
    const configurationHash = configurationHashes.get(provider.provider);
    if (!configurationHash) throw new Error(`Missing configuration hash for ${provider.provider}.`);
    return {
      providerId: provider.provider,
      providerMetadataSnapshot: {
        displayName: getProviderManifest(provider.provider)?.displayName ?? provider.provider,
        readiness: participantStatus(provider),
        adapterVersion: provider.adapterVersion,
        modelVersion: null,
        capability: "tts" as const,
      },
      modelId: provider.model,
      voiceId: provider.voice,
      configuration: selectedConfiguration(provider),
      configurationHash,
      region: provider.region,
      transport: synthetic ? "local-deterministic-fixture" : "provider-adapter-stream",
      codec: typeof provider.providerSpecificConfiguration.outputFormat === "string"
        ? provider.providerSpecificConfiguration.outputFormat
        : provider.audio.mimeType ?? "unavailable",
      sampleRateHz: getNumericConfiguration(provider, "sampleRate"),
      channels: getNumericConfiguration(provider, "channels"),
      thermalState: "unknown" as const,
    };
  });
  const objectiveMeasurements = bundle.providerResults.flatMap((provider) => {
    const configurationHash = configurationHashes.get(provider.provider);
    if (!configurationHash) throw new Error(`Missing configuration hash for ${provider.provider}.`);
    return provider.metrics.map((metric) => mappedMeasurement(provider, metric, configurationHash, bundle.exportedAt, synthetic));
  });
  const humanJudgments = bundle.providerResults.flatMap((provider) => {
    const rating = provider.humanRating;
    if (rating.ratedAt === null || rating.ratedBeforeReveal === null) return [];
    const configurationHash = configurationHashes.get(provider.provider);
    if (!configurationHash) throw new Error(`Missing configuration hash for ${provider.provider}.`);
    const ratedAt = rating.ratedAt;
    const ratedBeforeReveal = rating.ratedBeforeReveal;
    const dimensions = [
      ["naturalness", rating.naturalness],
      ["intelligibility", rating.intelligibility],
      ["pronunciation", rating.pronunciation],
      ["emotional-fit", rating.emotionalFit],
      ["use-case-fit", rating.useCaseFit],
      ["overall-preference", rating.overallPreference],
    ] as const;
    return dimensions.flatMap(([dimension, value]) => value === null ? [] : [{
      schemaVersion: BENCHMARK_JUDGMENT_VERSION,
      evidenceCategory: "human" as const,
      judgmentClass: "human" as const,
      judgmentId: `judgment/${provider.runId}/${provider.provider}/${dimension}`,
      runId: provider.runId,
      providerId: provider.provider,
      model: provider.model,
      voice: provider.voice,
      configurationHash,
      dimension,
      value,
      ratedAt,
      ratedBeforeReveal,
      evaluator: { class: "human" as const, anonymous: true },
      rubricVersion: "one-human-rating/1.0.0",
      promptVersion: null,
      confidence: null,
      externalFramework: null,
      provenance: "Private ONE human rating preserved from the atomic evaluation observation.",
    }]);
  });
  const artifacts = bundle.providerResults.flatMap((provider) => provider.audio.storageReference && provider.audio.contentHash ? [{
    schemaVersion: BENCHMARK_ARTIFACT_VERSION,
    artifactId: `artifact/${provider.runId}/${provider.provider}/audio`,
    kind: "audio" as const,
    reference: provider.audio.storageReference,
    contentHash: provider.audio.contentHash,
    mimeType: provider.audio.mimeType,
    byteSize: null,
    retention: "ephemeral" as const,
    visibility: "private" as const,
    provenance: "Sanitized ephemeral audio reference from the atomic EvaluationEvidenceBundle.",
    ownership: "user" as const,
    publicationPolicy: "explicit-consent" as const,
    expiresAt: null,
  }] : []);
  const exclusions = [
    { code: "private-visibility" as const, scope: "publication" as const, detail: "Evaluation evidence is private by default." },
    { code: "publication-consent-missing" as const, scope: "publication" as const, detail: "The source bundle explicitly withholds publication consent." },
    { code: "ephemeral-retention" as const, scope: "publication" as const, detail: "The source bundle has ephemeral retention." },
    ...(synthetic ? [{ code: "synthetic-fixture" as const, scope: "both" as const, detail: "Fixture observations validate product behavior only and cannot support provider performance claims." }] : []),
    ...(materializedStatus(bundle.providerResults) === "failed" ? [{ code: "failed-run" as const, scope: "publication" as const, detail: "No provider lane completed successfully; each failed lane remains rankable for reliability only when provider dispatch was observed." }] : []),
  ].map((exclusion) => ({ schemaVersion: BENCHMARK_ELIGIBILITY_VERSION, ...exclusion }));
  const rankingEligible = !synthetic;
  const result: BenchmarkResult = {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    resultId: `benchmark-result/${bundle.runId}`,
    category: "tts",
    status: materializedStatus(bundle.providerResults),
    run: {
      schemaVersion: BENCHMARK_RUN_VERSION,
      runId: bundle.runId,
      evaluationId: bundle.evaluationId,
      category: "tts",
      status: runStatus(bundle.providerResults),
      suiteRef: { id: "one-evaluate-private-suite", version: "1.0.0" },
      methodologyRef: { id: BENCHMARK_FIXTURE_METHODOLOGY_ID, version: BENCHMARK_FIXTURE_METHODOLOGY_VERSION },
      caseRef: { id: bundle.scenario.id, version: bundle.scenario.version, inputHash: bundle.scenario.inputHash },
      methodologyVersion: BENCHMARK_FIXTURE_METHODOLOGY_VERSION,
      metricVersion: EVALUATION_METRIC_VERSION,
      recordedAt: bundle.exportedAt,
      executionMode: bundle.providerResults[0].environment,
      evaluationMode: bundle.evaluationMode,
      initiatedBy: { class: "system", subjectId: null },
      trustTier: "unknown",
      runtime: { environment: bundle.providerResults[0].environment, deployment: synthetic ? "local-deterministic-fixture" : "one-evaluate-handler", region: null },
      timestamps: {
        queuedAt: null,
        startedAt: earliestTimestamp(bundle.providerResults.map((provider) => provider.requestTimestamp)),
        completedAt: bundle.exportedAt,
      },
      failure: failureSummary(bundle.providerResults),
      participants,
      observation: { kind: "evaluation-evidence-bundle", bundle },
    },
    objectiveMeasurements,
    humanJudgments,
    automatedJudgments: [],
    artifacts,
    eligibility: {
      schemaVersion: BENCHMARK_ELIGIBILITY_VERSION,
      publicEligible: false,
      rankingEligible,
      evaluatedAt: bundle.exportedAt,
      exclusions,
    },
    visibility: "private",
    publication: "draft",
    retention: "ephemeral",
    integrity: unsignedIntegrity(BENCHMARK_SCHEMA_VERSION),
    limitations: [
      ...bundle.limitations,
      "This private benchmark result preserves one EvaluationEvidenceBundle as an atomic observation; it does not split provider lanes into independent runs.",
    ],
  };
  return Object.freeze([benchmarkResultSchema.parse(result)]);
}

type ComparabilityOptions = Readonly<{
  scope?: "cross-provider" | "series";
  leftProviderId?: string;
  rightProviderId?: string;
  leftModelId?: string;
  rightModelId?: string;
  leftVoiceId?: string | null;
  rightVoiceId?: string | null;
  leftConfigurationHash?: string;
  rightConfigurationHash?: string;
}>;

function participantFor(result: BenchmarkResult, selector: Readonly<{
  providerId?: string;
  modelId?: string;
  voiceId?: string | null;
  configurationHash?: string;
}>) {
  const matching = result.run.participants.filter((participant) =>
    (selector.providerId === undefined || participant.providerId === selector.providerId)
    && (selector.modelId === undefined || participant.modelId === selector.modelId)
    && (selector.voiceId === undefined || participant.voiceId === selector.voiceId)
    && (selector.configurationHash === undefined || participant.configurationHash === selector.configurationHash));
  return matching.length === 1 ? matching[0] : null;
}

export function assessBenchmarkComparability(
  leftInput: BenchmarkResult,
  rightInput: BenchmarkResult,
  options: ComparabilityOptions = {},
): BenchmarkComparabilityAssessment {
  const left = benchmarkResultSchema.parse(leftInput);
  const right = benchmarkResultSchema.parse(rightInput);
  const scope = options.scope ?? "cross-provider";
  const reasons: Array<{ code: string; field: string; left: string; right: string; detail: string }> = [];
  const disclosures: Array<{ code: string; field: string; left: string; right: string; detail: string }> = [];
  const difference = (target: typeof reasons, code: string, field: string, leftValue: unknown, rightValue: unknown, detail: string) => {
    if (stableJson(leftValue) !== stableJson(rightValue)) target.push({ code, field, left: stableJson(leftValue), right: stableJson(rightValue), detail });
  };

  difference(reasons, "schema-version", "schemaVersion", left.schemaVersion, right.schemaVersion, "Schema versions must match.");
  difference(reasons, "category", "category", left.category, right.category, "Benchmark categories must match.");
  difference(reasons, "suite-version", "run.suiteRef", left.run.suiteRef, right.run.suiteRef, "Suite identifiers and versions must match.");
  difference(reasons, "methodology-reference", "run.methodologyRef", left.run.methodologyRef, right.run.methodologyRef, "Methodology identifiers and versions must match.");
  difference(reasons, "methodology-version", "run.methodologyVersion", left.run.methodologyVersion, right.run.methodologyVersion, "Methodology versions must match.");
  difference(reasons, "metric-version", "run.metricVersion", left.run.metricVersion, right.run.metricVersion, "Metric versions must match.");
  difference(reasons, "scenario", "run.caseRef", { id: left.run.caseRef.id, version: left.run.caseRef.version }, { id: right.run.caseRef.id, version: right.run.caseRef.version }, "Suite cases and versions must match.");
  difference(reasons, "input-hash", "run.caseRef.inputHash", left.run.caseRef.inputHash, right.run.caseRef.inputHash, "Canonical input hashes must match.");
  difference(reasons, "evaluation-mode", "run.evaluationMode", left.run.evaluationMode, right.run.evaluationMode, "Standardized and provider-optimized observations cannot be silently combined.");
  difference(reasons, "execution-environment", "run.executionMode", left.run.executionMode, right.run.executionMode, "Fixture and live observations cannot be combined.");
  difference(reasons, "execution-environment", "run.runtime", { environment: left.run.runtime.environment, deployment: left.run.runtime.deployment }, { environment: right.run.runtime.environment, deployment: right.run.runtime.deployment }, "Runtime and deployment boundaries must match.");

  const leftSelector = {
    ...(options.leftProviderId === undefined ? {} : { providerId: options.leftProviderId }),
    ...(options.leftModelId === undefined ? {} : { modelId: options.leftModelId }),
    ...(options.leftVoiceId === undefined ? {} : { voiceId: options.leftVoiceId }),
    ...(options.leftConfigurationHash === undefined ? {} : { configurationHash: options.leftConfigurationHash }),
  };
  const rightSelector = {
    ...(options.rightProviderId === undefined ? {} : { providerId: options.rightProviderId }),
    ...(options.rightModelId === undefined ? {} : { modelId: options.rightModelId }),
    ...(options.rightVoiceId === undefined ? {} : { voiceId: options.rightVoiceId }),
    ...(options.rightConfigurationHash === undefined ? {} : { configurationHash: options.rightConfigurationHash }),
  };
  const leftParticipant = participantFor(left, leftSelector);
  const rightParticipant = participantFor(right, rightSelector);
  if (!leftParticipant || !rightParticipant) {
    reasons.push({
      code: "provider",
      field: "run.participants",
      left: stableJson(leftSelector),
      right: stableJson(rightSelector),
      detail: "Select an exact provider, model, voice, and configuration lane when a benchmark observation contains multiple participants.",
    });
  } else {
    const identityTarget = scope === "series" ? reasons : disclosures;
    difference(identityTarget, "provider", "providerId", leftParticipant.providerId, rightParticipant.providerId, scope === "series" ? "Series aggregation requires the same provider." : "Cross-provider identity differs by design and is disclosed.");
    difference(identityTarget, "model", "model", { id: leftParticipant.modelId, version: leftParticipant.providerMetadataSnapshot.modelVersion }, { id: rightParticipant.modelId, version: rightParticipant.providerMetadataSnapshot.modelVersion }, scope === "series" ? "Series aggregation requires the same exact model identifier and disclosed model version." : "Cross-provider model identities or disclosed versions differ by design and are disclosed.");
    difference(identityTarget, "voice", "voiceId", leftParticipant.voiceId, rightParticipant.voiceId, scope === "series" ? "Series aggregation requires the same exact voice." : "Cross-provider voice identities differ by design and are disclosed.");
    difference(identityTarget, "configuration", "configurationHash", leftParticipant.configurationHash, rightParticipant.configurationHash, scope === "series" ? "Series aggregation requires the same exact configuration." : "Provider-specific configuration differences are disclosed and interpreted under the selected methodology.");
    difference(identityTarget, "adapter-version", "adapterVersion", leftParticipant.providerMetadataSnapshot.adapterVersion, rightParticipant.providerMetadataSnapshot.adapterVersion, scope === "series" ? "Series aggregation requires the same adapter version." : "Adapter version differences are disclosed.");
    difference(disclosures, "region", "region", leftParticipant.region, rightParticipant.region, "Provider regions differ or are unavailable; this can affect observed performance.");
    difference(reasons, "transport", "transport", leftParticipant.transport, rightParticipant.transport, "Transport classes must match; protocol and buffering differences can materially affect timing.");
    difference(reasons, "normalized-audio", "normalizedAudio", { codec: leftParticipant.codec, sampleRateHz: leftParticipant.sampleRateHz, channels: leftParticipant.channels }, { codec: rightParticipant.codec, sampleRateHz: rightParticipant.sampleRateHz, channels: rightParticipant.channels }, "Normalized audio codec, sample rate, and channel count must match for this comparison.");
    difference(reasons, "thermal-state", "thermalState", leftParticipant.thermalState, rightParticipant.thermalState, "Cold, warm, and unknown execution states cannot be silently combined.");
  }

  return benchmarkComparabilityAssessmentSchema.parse({ scope, comparable: reasons.length === 0, reasons, disclosures });
}

type LeaderboardOptions = Readonly<{
  snapshotId?: string;
  generatedAt?: string;
  methodologyVersion?: string;
  publicEligibility?: boolean;
  visibility?: "private" | "team" | "unlisted" | "public-candidate" | "public-verified";
  publication?: "draft" | "review" | "approved" | "published" | "retracted";
  limitations?: readonly string[];
  freshnessMaximumAgeMs?: number;
}>;

function selectedStatistic(statistics: ReturnType<typeof summarizeBenchmarkSamples>, statistic: BenchmarkMetricScoringProfile["statistic"]) {
  return statistics[statistic];
}

function rounded(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function buildMetricLeaderboard(
  candidateInputs: readonly BenchmarkRankingCandidate[],
  scoringProfileInput: BenchmarkMetricScoringProfile,
  options: LeaderboardOptions = {},
): BenchmarkLeaderboardSnapshot {
  const scoringProfile = benchmarkMetricScoringProfileSchema.parse(scoringProfileInput);
  const candidates = candidateInputs.map((candidate) => benchmarkRankingCandidateSchema.parse(candidate));
  if (candidates.length === 0) throw new RangeError("A leaderboard requires at least one candidate.");
  const exactCandidateKeys = candidates.map((candidate) => stableJson({
    providerId: candidate.providerId,
    modelId: candidate.metadata.modelId,
    modelVersion: candidate.metadata.providerSnapshot.modelVersion,
    voiceId: candidate.metadata.voiceId,
    configurationHash: candidate.metadata.configurationHash,
    adapterVersion: candidate.metadata.providerSnapshot.adapterVersion,
    comparablePopulation: candidate.metadata.comparablePopulation,
  }));
  if (new Set(exactCandidateKeys).size !== exactCandidateKeys.length) {
    throw new RangeError("A leaderboard cannot contain duplicate exact provider, model, voice, configuration, adapter, and population candidates.");
  }
  const globallyOwnedMeasurementIds = candidates.flatMap((candidate) => candidate.measurements.map((measurement) => measurement.measurementId));
  if (new Set(globallyOwnedMeasurementIds).size !== globallyOwnedMeasurementIds.length) {
    throw new RangeError("A benchmark measurement can belong to only one leaderboard candidate.");
  }
  if (options.publicEligibility === true || options.visibility === "public-candidate" || options.visibility === "public-verified" || options.publication === "published") {
    throw new RangeError("Unsigned metric snapshots cannot be made public by the ranking builder; use a separate verified publication operation.");
  }
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const freshnessMaximumAgeMs = options.freshnessMaximumAgeMs ?? DEFAULT_BENCHMARK_FRESHNESS_MS;
  if (!Number.isFinite(freshnessMaximumAgeMs) || freshnessMaximumAgeMs <= 0 || freshnessMaximumAgeMs > MAXIMUM_BENCHMARK_FRESHNESS_MS) {
    throw new RangeError("Leaderboard freshness windows must be greater than zero and no more than 365 days.");
  }
  const comparablePopulation = candidates[0].metadata.comparablePopulation;
  for (const candidate of candidates) {
    if (candidate.metadata.modality !== scoringProfile.category
      || candidate.metadata.comparablePopulation.category !== scoringProfile.category
      || candidate.metadata.comparablePopulation.metricVersion !== scoringProfile.metricVersion
      || stableJson(candidate.metadata.comparablePopulation) !== stableJson(comparablePopulation)) {
      throw new RangeError("A metric leaderboard requires one exact suite, case, input, methodology, execution environment, region, transport, and audio population.");
    }
  }
  if (options.methodologyVersion !== undefined && options.methodologyVersion !== comparablePopulation.methodologyVersion) {
    throw new RangeError("Leaderboard methodology metadata must match the exact comparable population methodology version.");
  }
  const baseEntries = candidates.map((candidate) => {
    if (new Set(candidate.measurements.map((measurement) => measurement.measurementId)).size !== candidate.measurements.length) {
      throw new RangeError(`Candidate ${candidate.candidateId} contains duplicate measurement identifiers.`);
    }
    const scopedMeasurements = candidate.measurements.filter((measurement) =>
      candidate.metadata.evidenceClass === "objective"
      && measurement.providerId === candidate.providerId
      && measurement.model === candidate.metadata.modelId
      && measurement.voice === candidate.metadata.voiceId
      && measurement.configurationHash === candidate.metadata.configurationHash
      && measurement.evidenceCategory === "objective"
      && measurement.metricId === scoringProfile.metricId
      && measurement.metricVersion === scoringProfile.metricVersion);
    const scopedMeasurementIds = new Set(scopedMeasurements.map((measurement) => measurement.measurementId));
    const scopedSources = candidate.sources
      .map((source) => ({ ...source, measurementIds: source.measurementIds.filter((measurementId) => scopedMeasurementIds.has(measurementId)) }))
      .filter((source) => source.measurementIds.length > 0);
    if (scopedSources.length === 0) {
      throw new RangeError(`Candidate ${candidate.candidateId} provides no attributable evidence for the requested metric and provenance scope.`);
    }
    const matching = scopedMeasurements.filter((measurement) =>
      measurement.unit === scoringProfile.unit
      && measurement.source === scoringProfile.measurementScope.source
      && measurement.provenance.measurementPoint === scoringProfile.measurementScope.measurementPoint
      && measurement.provenance.clock === scoringProfile.measurementScope.clock
      && measurement.provenance.observation === scoringProfile.measurementScope.observation
      && measurement.method === scoringProfile.measurementScope.method
      && measurement.provenance.sourceSchemaVersion === scoringProfile.measurementScope.sourceSchemaVersion
      && measurement.availability !== "unavailable"
      && measurement.value !== null
      && (scoringProfile.allowSynthetic || !measurement.synthetic));
    if (matching.some((measurement) => measurement.sampleCount !== 1)) {
      throw new RangeError("Metric ranking requires atomic measurements with sampleCount=1 so distribution statistics remain reproducible.");
    }
    const statistics = summarizeBenchmarkSamples(matching.map((measurement) => measurement.value as number));
    const statistic = selectedStatistic(statistics, scoringProfile.statistic);
    const enough = statistic.availability === "available" && statistics.sampleCount >= scoringProfile.minimumSampleCount;
    const exclusions = [...candidate.exclusions];
    const declaredFreshness = candidate.metadata.freshness.status;
    const freshnessStatus = declaredFreshness === "current"
      ? benchmarkFreshnessStatus(candidate.metadata.freshness.observedAt, "protected-live", { asOf: generatedAt, maximumAgeMs: freshnessMaximumAgeMs })
      : declaredFreshness;
    const metadata = {
      ...candidate.metadata,
      freshness: { ...candidate.metadata.freshness, status: freshnessStatus },
    };
    const freshnessEligible = freshnessStatus === "current"
      || (freshnessStatus === "fixture-only" && scoringProfile.allowSynthetic);
    if (freshnessStatus === "stale") exclusions.push({
      schemaVersion: BENCHMARK_ELIGIBILITY_VERSION,
      code: "stale-evidence",
      scope: "ranking",
      detail: "This evidence is outside the declared freshness window and cannot enter the current ranking.",
    });
    if (freshnessStatus === "unknown") exclusions.push({
      schemaVersion: BENCHMARK_ELIGIBILITY_VERSION,
      code: "freshness-unverified",
      scope: "ranking",
      detail: "This evidence has no verified freshness assessment and cannot enter the current ranking.",
    });
    if (freshnessStatus === "fixture-only" && !scoringProfile.allowSynthetic) exclusions.push({
      schemaVersion: BENCHMARK_ELIGIBILITY_VERSION,
      code: "synthetic-fixture",
      scope: "ranking",
      detail: "Fixture-only evidence requires an explicitly synthetic scoring profile and is never public provider evidence.",
    });
    if (!enough && candidate.eligible) exclusions.push({
      schemaVersion: BENCHMARK_ELIGIBILITY_VERSION,
      code: "insufficient-samples",
      scope: "ranking",
      detail: `This candidate has ${statistics.sampleCount} matching samples; ${scoringProfile.minimumSampleCount} are required.`,
    });
    const status = !candidate.eligible || !freshnessEligible ? "excluded" as const : enough ? "ranked" as const : "insufficient-samples" as const;
    const rawValue = status === "ranked" && statistic.value !== null ? statistic.value : null;
    return {
      providerId: candidate.providerId,
      candidateId: candidate.candidateId,
      sources: scopedSources,
      metadata,
      rank: null as number | null,
      tied: false,
      status,
      metricId: scoringProfile.metricId,
      value: rawValue === null ? null : rounded(rawValue, scoringProfile.decimalPlaces),
      rawValue,
      unit: scoringProfile.unit,
      sampleCount: status === "excluded" ? 0 : statistics.sampleCount,
      statistics,
      exclusions,
    };
  });
  const ranked = baseEntries.filter((entry) => entry.status === "ranked" && entry.rawValue !== null).sort((left, right) => {
    const metricOrder = scoringProfile.direction === "lower-is-better"
      ? (left.rawValue as number) - (right.rawValue as number)
      : (right.rawValue as number) - (left.rawValue as number);
    return metricOrder || left.providerId.localeCompare(right.providerId) || left.candidateId.localeCompare(right.candidateId);
  });
  ranked.forEach((entry, index) => {
    const previous = ranked[index - 1];
    entry.rank = previous && previous.rawValue === entry.rawValue ? previous.rank : index + 1;
  });
  ranked.forEach((entry, index) => {
    entry.tied = ranked.some((other, otherIndex) => otherIndex !== index && other.rawValue === entry.rawValue);
  });
  const unranked = baseEntries.filter((entry) => entry.status !== "ranked").sort((left, right) => left.providerId.localeCompare(right.providerId) || left.candidateId.localeCompare(right.candidateId));
  const observations = candidates.map((candidate) => candidate.metadata.freshness.observedAt).sort();
  const statusByCandidate = new Map(baseEntries.map((entry) => [entry.candidateId, entry]));
  const includedResultIds = [...new Set(candidates
    .filter((candidate) => statusByCandidate.get(candidate.candidateId)?.status === "ranked")
    .flatMap((candidate) => candidate.sources.map((source) => source.resultId)))].sort();
  const excludedResults = candidates.flatMap((candidate) => {
    const entry = statusByCandidate.get(candidate.candidateId);
    return entry?.status === "ranked" ? [] : candidate.sources.map((source) => ({
      resultId: source.resultId,
      candidateId: candidate.candidateId,
      providerId: candidate.providerId,
      configurationHash: candidate.metadata.configurationHash,
      reasons: entry?.exclusions ?? candidate.exclusions,
    }));
  });
  const publicEligibility = options.publicEligibility ?? false;
  const snapshot = {
    schemaVersion: BENCHMARK_LEADERBOARD_VERSION,
    snapshotId: options.snapshotId ?? `leaderboard/${scoringProfile.profileId}/${generatedAt.replace(/[^0-9]/g, "")}`,
    generatedAt,
    category: scoringProfile.category,
    methodologyVersion: comparablePopulation.methodologyVersion,
    scoringProfile,
    comparablePopulation,
    providerSnapshots: candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      providerId: candidate.providerId,
      metadata: candidate.metadata.providerSnapshot,
    })).sort((left, right) => left.providerId.localeCompare(right.providerId) || left.candidateId.localeCompare(right.candidateId)),
    sponsorshipDisclosures: [...new Set(candidates.flatMap((candidate) => candidate.metadata.sponsorshipDisclosures))].sort(),
    timeWindow: { start: observations[0] ?? generatedAt, end: observations[observations.length - 1] ?? generatedAt },
    filters: { metricId: scoringProfile.metricId, metricVersion: scoringProfile.metricVersion, syntheticAllowed: scoringProfile.allowSynthetic },
    eligibilityPolicy: { version: "one-benchmark-eligibility/1.0.0", description: "Only explicitly eligible candidates with sufficient matching objective evidence receive a rank." },
    entries: [...ranked, ...unranked].map(({ rawValue: _rawValue, ...entry }) => {
      void _rawValue;
      return entry;
    }),
    includedResultIds,
    excludedResults,
    publicEligibility,
    visibility: options.visibility ?? "private",
    publication: options.publication ?? "draft",
    compositeScoreProvided: false,
    integrity: unsignedIntegrity(BENCHMARK_LEADERBOARD_VERSION),
    signatureStatus: "unsigned" as const,
    limitations: [...(options.limitations ?? ["This snapshot ranks one disclosed objective metric only and does not claim a universally best provider."])],
  };
  return benchmarkLeaderboardSnapshotSchema.parse(snapshot);
}

export function createFixtureLeaderboardPreview(): BenchmarkLeaderboardSnapshot {
  const measurements = PROVIDER_REGISTRY.map((provider) => ({
    schemaVersion: BENCHMARK_MEASUREMENT_VERSION,
    evidenceCategory: "objective" as const,
    measurementId: `measurement/${FIXTURE_PREVIEW_RUN_ID}/${provider.id}/fixture-interaction-success`,
    runId: FIXTURE_PREVIEW_RUN_ID,
    providerId: provider.id,
    model: fixtureModelId(provider.id),
    voice: fixtureVoiceId(provider.id),
    configurationHash: BENCHMARK_FIXTURE_CONFIGURATION_HASH,
    metricId: "fixture-interaction-success",
    metricVersion: "one-fixture-preview-metric/1.0.0",
    value: 1,
    unit: "boolean",
    availability: "measured" as const,
    synthetic: true,
    measuredAt: FIXTURE_PREVIEW_TIMESTAMP,
    method: "one-deterministic-fixture-preview",
    precision: null,
    sampleCount: 1,
    source: "fixture" as const,
    confidence: null,
    provenance: {
      measurementPoint: "one-server" as const,
      clock: "not-applicable" as const,
      observation: "synthetic" as const,
      description: "The same local fixture value is assigned to every listed provider; no provider request or quality measurement occurred.",
      sourceSchemaVersion: "one-fixture-preview-metric/1.0.0",
    },
  }));
  const candidates = PROVIDER_REGISTRY.map((provider, index) => ({
    candidateId: `fixture-preview/${provider.id}`,
    providerId: provider.id,
    sources: [{
      resultId: `benchmark-result/fixture-preview/${provider.id}`,
      runId: FIXTURE_PREVIEW_RUN_ID,
      measurementIds: [measurements[index].measurementId],
    }],
    metadata: {
      modelId: fixtureModelId(provider.id),
      voiceId: fixtureVoiceId(provider.id),
      configurationHash: BENCHMARK_FIXTURE_CONFIGURATION_HASH,
      modality: "tts" as const,
      deployment: "local-deterministic-fixture",
      evidenceClass: "objective" as const,
      providerSnapshot: {
        displayName: provider.displayName,
        readiness: provider.capabilities.some((capability) => capability.id === "tts" && capability.adapterAvailable) ? "adapter-backed" as const : "listed" as const,
        adapterVersion: "one-deterministic-fixture/1.0.0",
        modelVersion: "one-deterministic-fixture/1.0.0",
        capability: "tts" as const,
      },
      sponsorshipDisclosures: [],
      comparablePopulation: {
        category: "tts" as const,
        suiteRef: { id: "one-fixture-preview-suite", version: "1.0.0" },
        caseRef: { id: BENCHMARK_FIXTURE_SCENARIO_ID, version: BENCHMARK_FIXTURE_SCENARIO_VERSION, inputHash: BENCHMARK_FIXTURE_SCENARIO_HASH },
        methodologyRef: { id: BENCHMARK_FIXTURE_METHODOLOGY_ID, version: BENCHMARK_FIXTURE_METHODOLOGY_VERSION },
        methodologyVersion: BENCHMARK_FIXTURE_METHODOLOGY_VERSION,
        metricVersion: "one-fixture-preview-metric/1.0.0",
        executionMode: "fixture" as const,
        evaluationMode: "standardized" as const,
        environment: "fixture",
        deployment: "local-deterministic-fixture",
        language: "und",
        region: null,
        transport: "local-memory",
        codec: "audio/wav",
        sampleRateHz: 24_000,
        channels: 1,
        thermalState: "unknown" as const,
      },
      freshness: { observedAt: FIXTURE_PREVIEW_TIMESTAMP, status: "fixture-only" as const },
      publicEligibility: false,
    },
    measurements: [measurements[index]],
    eligible: true,
    exclusions: [],
  }));
  return buildMetricLeaderboard(candidates, {
    schemaVersion: "one-benchmark-scoring-profile/1.0.0",
    profileId: "fixture-preview-interaction-success",
    version: "1.0.0",
    category: "tts",
    metricId: "fixture-interaction-success",
    metricVersion: "one-fixture-preview-metric/1.0.0",
    unit: "boolean",
    measurementScope: {
      source: "fixture" as const,
      measurementPoint: "one-server" as const,
      clock: "not-applicable" as const,
      observation: "synthetic" as const,
      method: "one-deterministic-fixture-preview",
      sourceSchemaVersion: "one-fixture-preview-metric/1.0.0",
    },
    statistic: "mean",
    direction: "higher-is-better",
    minimumSampleCount: 1,
    decimalPlaces: 0,
    allowSynthetic: true,
    compositeScoreAllowed: false,
  }, {
    snapshotId: "leaderboard/fixture-preview/1.0.0",
    generatedAt: FIXTURE_PREVIEW_TIMESTAMP,
    publicEligibility: false,
    visibility: "private",
    publication: "draft",
    limitations: [
      "This is a deterministic fixture-only preview. No provider was called and no provider quality, latency, availability, or model-support claim is made.",
      "Every listed provider receives the same synthetic value and tied rank solely to exercise the generic leaderboard path.",
    ],
  });
}

export type BenchmarkPlanDecision = Readonly<{
  status: "ready" | "blocked" | "rejected";
  plan: BenchmarkPlan | null;
  totalAttempts: number;
  maximumAttempts: number;
  requiresPaidProviderCalls: boolean;
  liveExecutionEnabled: boolean;
  executionBoundary: "existing-evaluate-handler" | "unavailable";
  reasons: readonly Readonly<{ code: string; message: string }>[];
}>;

export type BenchmarkPlanningProvider = Readonly<{
  providerId: string;
  listed: boolean;
  fixtureAvailable: boolean;
  adapterBacked: boolean;
  liveEnabled: boolean;
  benchmarkEligible?: boolean;
}>;

export function planBenchmark(
  input: unknown,
  options: Readonly<{ liveExecutionEnabled?: boolean; providerCatalog?: readonly BenchmarkPlanningProvider[] }> = {},
): BenchmarkPlanDecision {
  const parsed = benchmarkPlanSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "rejected",
      plan: null,
      totalAttempts: 0,
      maximumAttempts: BENCHMARK_MAX_FIXTURE_ATTEMPTS,
      requiresPaidProviderCalls: false,
      liveExecutionEnabled: false,
      executionBoundary: "unavailable",
      reasons: parsed.error.issues.map((issue) => ({ code: "invalid-plan", message: issue.message })),
    };
  }
  const plan = parsed.data;
  const live = plan.executionMode !== "fixture";
  const liveExecutionEnabled = options.liveExecutionEnabled ?? false;
  const totalAttempts = plan.cases.length * plan.providers.length * plan.repetitions;
  const maximumAttempts = live ? BENCHMARK_MAX_LIVE_ATTEMPTS : BENCHMARK_MAX_FIXTURE_ATTEMPTS;
  if (plan.category === "realtime") {
    return {
      status: "blocked",
      plan,
      totalAttempts,
      maximumAttempts,
      requiresPaidProviderCalls: false,
      liveExecutionEnabled: false,
      executionBoundary: "unavailable",
      reasons: [{ code: "category-execution-unavailable", message: "Realtime benchmark execution remains a schema seam; no fixture or provider call path is enabled." }],
    };
  }
  if (plan.category === "stt" && !options.providerCatalog) {
    return {
      status: "blocked",
      plan,
      totalAttempts,
      maximumAttempts,
      requiresPaidProviderCalls: false,
      liveExecutionEnabled: false,
      executionBoundary: "unavailable",
      reasons: [{ code: "category-execution-unavailable", message: "STT fixture planning requires an explicit provider-capability projection; no STT executor or provider call path is enabled." }],
    };
  }
  if (live && plan.category !== "tts") {
    return {
      status: "blocked",
      plan,
      totalAttempts,
      maximumAttempts,
      requiresPaidProviderCalls: true,
      liveExecutionEnabled: false,
      executionBoundary: "unavailable",
      reasons: [{ code: "category-execution-unavailable", message: "Live STT benchmarking is disabled. Only deterministic fixture planning is available through the provider contract boundary." }],
    };
  }
  const providerCatalog = options.providerCatalog ?? PROVIDER_REGISTRY.map((provider) => ({
    providerId: provider.id,
    listed: true,
    fixtureAvailable: true,
    adapterBacked: provider.capabilities.some((capability) => capability.id === "tts" && capability.adapterAvailable),
    liveEnabled: provider.liveExecutionEnabled,
    benchmarkEligible: true,
  }));
  const providerReasons = plan.providers.flatMap((selection) => {
    const provider = providerCatalog.find((entry) => entry.providerId === selection.providerId);
    if (!provider?.listed) return [{ code: "provider-unlisted", message: `${selection.providerId} is not present in the supplied benchmark provider catalog.` }];
    if (!live && !provider.fixtureAvailable) return [{ code: "fixture-unavailable", message: `${selection.providerId} has no declared fixture path.` }];
    if (live && getProviderManifest(selection.providerId) === null) return [{ code: "provider-live-unavailable", message: `${selection.providerId} is not registered with the existing Evaluate execution boundary.` }];
    if (live && provider.benchmarkEligible === false) return [{ code: "provider-benchmark-ineligible", message: `${selection.providerId} is not enabled for live benchmark participation.` }];
    if (live && (!provider.adapterBacked || !provider.liveEnabled)) return [{ code: "provider-live-unavailable", message: `${selection.providerId} is not adapter-backed and live-enabled for TTS.` }];
    return [];
  });
  if (providerReasons.length > 0) {
    return {
      status: "blocked",
      plan,
      totalAttempts,
      maximumAttempts,
      requiresPaidProviderCalls: live,
      liveExecutionEnabled,
      executionBoundary: plan.category === "tts" ? "existing-evaluate-handler" : "unavailable",
      reasons: providerReasons,
    };
  }
  if (live && !liveExecutionEnabled) {
    return {
      status: "blocked",
      plan,
      totalAttempts,
      maximumAttempts,
      requiresPaidProviderCalls: true,
      liveExecutionEnabled: false,
      executionBoundary: "existing-evaluate-handler",
      reasons: [{ code: "live-disabled", message: "Live benchmark planning is disabled by default. The existing protected Evaluate handler remains the only paid TTS execution path." }],
    };
  }
  return {
    status: "ready",
    plan,
    totalAttempts,
    maximumAttempts,
    requiresPaidProviderCalls: live,
    liveExecutionEnabled,
    executionBoundary: plan.category === "tts" ? "existing-evaluate-handler" : "unavailable",
    reasons: [],
  };
}

export type BenchmarkFreshnessPolicy = Readonly<{ asOf: string; maximumAgeMs: number }>;

function benchmarkFreshnessStatus(
  recordedAt: string,
  executionMode: BenchmarkResult["run"]["executionMode"],
  policy: BenchmarkFreshnessPolicy | undefined,
) {
  if (executionMode === "fixture") return "fixture-only" as const;
  if (!policy || !Number.isFinite(policy.maximumAgeMs) || policy.maximumAgeMs <= 0) return "unknown" as const;
  const observed = Date.parse(recordedAt);
  const asOf = Date.parse(policy.asOf);
  if (!Number.isFinite(observed) || !Number.isFinite(asOf) || observed > asOf) return "unknown" as const;
  return asOf - observed <= policy.maximumAgeMs ? "current" as const : "stale" as const;
}

export async function aggregateEvaluationBenchmarkSeries(
  bundleInputs: readonly EvaluationEvidenceBundle[],
  options: Readonly<{ freshness?: BenchmarkFreshnessPolicy }> = {},
): Promise<Readonly<{ results: readonly BenchmarkResult[]; candidates: readonly BenchmarkRankingCandidate[] }>> {
  const results = (await Promise.all(bundleInputs.map(async (bundle) => (await materializeEvaluationBenchmarkResults(bundle))[0]))).filter(Boolean);
  const groups = new Map<string, BenchmarkRankingCandidate>();
  for (const result of results) {
    for (const participant of result.run.participants) {
      const evidenceBundle = result.run.observation.kind === "evaluation-evidence-bundle" ? result.run.observation.bundle : null;
      const observationMode = result.run.evaluationMode;
      let providerEvidence: EvaluationProviderEvidence | undefined;
      for (const item of evidenceBundle?.providerResults ?? []) {
        if (item.provider === participant.providerId
          && item.model === participant.modelId
          && item.voice === participant.voiceId
          && await sha256Json(selectedConfiguration(item)) === participant.configurationHash) {
          providerEvidence = item;
          break;
        }
      }
      const sponsorshipDisclosures = [...new Set([
        evidenceBundle?.sponsorshipDisclosure,
        providerEvidence?.sponsorshipDisclosure,
      ].filter((value): value is string => Boolean(value)))].sort();
      const key = stableJson({
        providerId: participant.providerId,
        modelId: participant.modelId,
        modelVersion: participant.providerMetadataSnapshot.modelVersion,
        voiceId: participant.voiceId,
        configurationHash: participant.configurationHash,
        adapterVersion: participant.providerMetadataSnapshot.adapterVersion,
        suiteRef: result.run.suiteRef,
        methodologyRef: result.run.methodologyRef,
        methodologyVersion: result.run.methodologyVersion,
        metricVersion: result.run.metricVersion,
        caseRef: result.run.caseRef,
        observationMode,
        executionMode: result.run.executionMode,
        runtime: result.run.runtime,
        region: participant.region,
        transport: participant.transport,
        codec: participant.codec,
        sampleRateHz: participant.sampleRateHz,
        channels: participant.channels,
        thermalState: participant.thermalState,
      });
      const seriesKeyHash = await sha256Json(key);
      const measurements = result.objectiveMeasurements.filter((measurement) => measurement.providerId === participant.providerId
        && measurement.model === participant.modelId
        && measurement.voice === participant.voiceId
        && measurement.configurationHash === participant.configurationHash);
      if (!providerEvidence) throw new Error(`The validated benchmark observation is missing the ${participant.providerId} provider lane.`);
      const laneCompleted = providerEvidence.status === "complete";
      const providerDispatched = providerDispatchWasObserved(providerEvidence);
      const laneExclusions = [
        ...result.eligibility.exclusions.filter((exclusion) => exclusion.scope !== "publication"),
        ...(!laneCompleted ? [{
          schemaVersion: BENCHMARK_ELIGIBILITY_VERSION,
          code: "failed-run" as const,
          scope: providerDispatched ? "publication" as const : "both" as const,
          detail: providerDispatched
            ? `The ${participant.providerId} lane ended with ${providerEvidence.status} status after dispatch; request-success evidence remains rankable for reliability analysis, while unavailable performance metrics receive no sample.`
            : `The ${participant.providerId} lane ended with ${providerEvidence.status} status before provider dispatch; the denial remains visible but cannot affect provider reliability ranking.`,
        }] : []),
      ];
      const laneEligible = !laneExclusions.some((exclusion) => exclusion.scope === "ranking" || exclusion.scope === "both");
      const prior = groups.get(key);
      const candidate: BenchmarkRankingCandidate = prior ?? {
        candidateId: `series/${seriesKeyHash.slice(7)}`,
        providerId: participant.providerId,
        sources: [],
        metadata: {
          modelId: participant.modelId,
          voiceId: participant.voiceId,
          configurationHash: participant.configurationHash,
          modality: "tts",
          deployment: result.run.runtime.deployment,
          evidenceClass: "objective",
          providerSnapshot: participant.providerMetadataSnapshot,
          sponsorshipDisclosures,
          comparablePopulation: {
            category: "tts",
            suiteRef: result.run.suiteRef,
            caseRef: result.run.caseRef,
            methodologyRef: result.run.methodologyRef,
            methodologyVersion: result.run.methodologyVersion,
            metricVersion: result.run.metricVersion,
            executionMode: result.run.executionMode,
            evaluationMode: observationMode,
            environment: result.run.runtime.environment,
            deployment: result.run.runtime.deployment,
            language: "und",
            region: participant.region,
            transport: participant.transport,
            codec: participant.codec,
            sampleRateHz: participant.sampleRateHz,
            channels: participant.channels,
            thermalState: participant.thermalState,
          },
          freshness: { observedAt: result.run.recordedAt, status: benchmarkFreshnessStatus(result.run.recordedAt, result.run.executionMode, options.freshness) },
          publicEligibility: result.eligibility.publicEligible,
        },
        measurements: [],
        eligible: laneEligible,
        exclusions: laneExclusions,
      };
      groups.set(key, benchmarkRankingCandidateSchema.parse({
        ...candidate,
        sources: [...candidate.sources, {
          resultId: result.resultId,
          runId: result.run.runId,
          measurementIds: measurements.map((measurement) => measurement.measurementId).sort(),
        }].sort((left, right) => left.resultId.localeCompare(right.resultId) || left.runId.localeCompare(right.runId)),
        metadata: {
          ...candidate.metadata,
          sponsorshipDisclosures: [...new Set([...candidate.metadata.sponsorshipDisclosures, ...sponsorshipDisclosures])].sort(),
          freshness: {
            observedAt: candidate.metadata.freshness.observedAt > result.run.recordedAt ? candidate.metadata.freshness.observedAt : result.run.recordedAt,
            status: candidate.metadata.freshness.status === "fixture-only" || result.run.executionMode === "fixture"
              ? "fixture-only"
              : candidate.metadata.freshness.status === "stale" || benchmarkFreshnessStatus(result.run.recordedAt, result.run.executionMode, options.freshness) === "stale"
                ? "stale"
                : candidate.metadata.freshness.status === "unknown" || benchmarkFreshnessStatus(result.run.recordedAt, result.run.executionMode, options.freshness) === "unknown"
                  ? "unknown"
                  : "current",
          },
          publicEligibility: candidate.metadata.publicEligibility && result.eligibility.publicEligible,
        },
        measurements: [...candidate.measurements, ...measurements],
        eligible: candidate.eligible && laneEligible,
        exclusions: [...new Map([...candidate.exclusions, ...laneExclusions].map((exclusion) => [stableJson(exclusion), exclusion])).values()],
      }));
    }
  }
  return { results: Object.freeze(results), candidates: Object.freeze([...groups.values()].sort((left, right) => left.providerId.localeCompare(right.providerId) || left.candidateId.localeCompare(right.candidateId))) };
}

export async function buildEvaluationEvidenceLeaderboard(
  bundles: readonly EvaluationEvidenceBundle[],
  scoringProfile: BenchmarkMetricScoringProfile,
  options: LeaderboardOptions = {},
): Promise<BenchmarkLeaderboardSnapshot> {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const freshnessMaximumAgeMs = options.freshnessMaximumAgeMs ?? DEFAULT_BENCHMARK_FRESHNESS_MS;
  if (!Number.isFinite(freshnessMaximumAgeMs) || freshnessMaximumAgeMs <= 0 || freshnessMaximumAgeMs > MAXIMUM_BENCHMARK_FRESHNESS_MS) {
    throw new RangeError("Leaderboard freshness windows must be greater than zero and no more than 365 days.");
  }
  const series = await aggregateEvaluationBenchmarkSeries(bundles, { freshness: { asOf: generatedAt, maximumAgeMs: freshnessMaximumAgeMs } });
  return buildMetricLeaderboard(series.candidates, scoringProfile, options);
}

export const benchmarkExecutionBoundary = Object.freeze({
  liveTtsPath: "existing-evaluate-handler",
  sttPath: "unavailable",
  realtimePath: "unavailable",
  newLiveExecutorImplemented: false,
  defaultLiveEnabled: false,
  maximumFixtureAttempts: BENCHMARK_MAX_FIXTURE_ATTEMPTS,
  maximumLiveAttempts: BENCHMARK_MAX_LIVE_ATTEMPTS,
  planSchemaVersion: BENCHMARK_PLAN_VERSION,
});
