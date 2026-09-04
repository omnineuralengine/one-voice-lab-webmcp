import { expect, test } from "@playwright/test";

import { benchmarkCategoryCatalog, benchmarkMethodologyCatalog } from "../../src/lib/evaluation/benchmark-catalog";
import {
  aggregateEvaluationBenchmarkSeries,
  assessBenchmarkComparability,
  buildEvaluationEvidenceLeaderboard,
  buildMetricLeaderboard,
  createFixtureLeaderboardPreview,
  materializeEvaluationBenchmarkResults,
  planBenchmark,
} from "../../src/lib/evaluation/benchmark-engine";
import {
  BENCHMARK_MEASUREMENT_VERSION,
  BENCHMARK_PLAN_VERSION,
  benchmarkAutomatedJudgmentSchema,
  benchmarkCaseSchema,
  benchmarkLeaderboardEntrySchema,
  benchmarkLeaderboardSnapshotSchema,
  benchmarkMeasurementSchema,
  benchmarkPlanSchema,
  benchmarkProviderClaimSchema,
  benchmarkResultSchema,
  benchmarkConfigurationSchema,
  benchmarkRunSchema,
  benchmarkSuiteSchema,
  type BenchmarkMeasurement,
  type BenchmarkMetricScoringProfile,
  type BenchmarkRankingCandidate,
} from "../../src/lib/evaluation/benchmark-schema";
import { summarizeBenchmarkSamples } from "../../src/lib/evaluation/benchmark-statistics";
import { executeEvaluationRun } from "../../src/lib/evaluation/orchestrator";
import { evaluationRunRequestSchema, type EvaluationRunRequest } from "../../src/lib/evaluation/schema";
import { hashEvaluationText } from "../../src/lib/evaluation/security";
import { PROVIDER_REGISTRY } from "../../src/lib/providers/registry";
import type { ProviderId } from "../../src/lib/providers/types";

const CONFIGURATION_HASH = "sha256:1111111111111111111111111111111111111111111111111111111111111111" as const;
const INPUT_HASH = "sha256:2222222222222222222222222222222222222222222222222222222222222222" as const;
const OBSERVED_AT = "2026-08-27T12:00:00.000Z";

test.describe("canonical benchmark contracts", () => {
  test("constrains configuration numbers to the shared JavaScript/Postgres canonical range", () => {
    expect(benchmarkConfigurationSchema.parse({ negativeZero: -0, minimum: 1e-6, decimal: 0.30000000000000004, large: 1e20, list: [-1e-6, 0, 1e20] }))
      .toEqual({ negativeZero: -0, minimum: 1e-6, decimal: 0.30000000000000004, large: 1e20, list: [-1e-6, 0, 1e20] });
    expect(benchmarkConfigurationSchema.safeParse({ tooSmall: 1e-7 }).success).toBe(false);
    expect(benchmarkConfigurationSchema.safeParse({ tooLarge: 1e21 }).success).toBe(false);
    expect(benchmarkConfigurationSchema.safeParse({ list: [1e-7] }).success).toBe(false);
  });

  test("constrains configuration keys to the shared cross-runtime ASCII identifier domain", () => {
    expect(benchmarkConfigurationSchema.parse({ B: 2, a: 1, "voice.speed": 1 })).toEqual({ B: 2, a: 1, "voice.speed": 1 });
    expect(() => benchmarkConfigurationSchema.parse({ "é": 1 })).toThrow(/ASCII identifier domain/i);
    expect(() => benchmarkConfigurationSchema.parse({ "contains space": 1 })).toThrow(/ASCII identifier domain/i);
    expect(() => benchmarkConfigurationSchema.parse(Object.fromEntries(Array.from({ length: 257 }, (_, index) => [`key${index}`, true])))).toThrow(/256 keys/i);
    expect(() => benchmarkConfigurationSchema.parse(Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`key${index}`, "x".repeat(2_000)])))).toThrow(/65,536 UTF-8 JSON bytes/i);
  });

  test("rejects contradictory objective-measurement provenance tuples", () => {
    const contradictory = measurement("alpha-provider", 12);
    contradictory.provenance = {
      ...contradictory.provenance,
      measurementPoint: "provider-reported",
      clock: "provider",
      observation: "provider-reported",
    };
    expect(() => benchmarkMeasurementSchema.parse(contradictory)).toThrow(/source must agree/i);

    const providerReported = {
      ...contradictory,
      source: "provider-reported" as const,
    };
    expect(benchmarkMeasurementSchema.safeParse(providerReported).success).toBe(true);

    const forgedClock = measurement("alpha-provider", 12);
    forgedClock.provenance = { ...forgedClock.provenance, clock: "provider" };
    expect(() => benchmarkMeasurementSchema.parse(forgedClock)).toThrow(/clock must agree/i);
  });

  test("catalogs STT, TTS, realtime, and non-ranked provider claim evidence", () => {
    expect(benchmarkCategoryCatalog.map((category) => category.id)).toEqual(["stt", "tts", "realtime", "provider-evidence"]);
    expect(benchmarkMethodologyCatalog).toHaveLength(4);
    expect(benchmarkMethodologyCatalog.every((methodology) => methodology.compositeScoreAllowed === false)).toBe(true);
    expect(benchmarkMethodologyCatalog.find((methodology) => methodology.category === "tts")?.procedure).toContain("Use the existing Evaluate handler as the only paid TTS execution path.");
    expect(benchmarkProviderClaimSchema.parse({
      schemaVersion: BENCHMARK_MEASUREMENT_VERSION,
      evidenceCategory: "provider-documented-claim",
      claimId: "claim/future-provider/streaming",
      providerId: "future-provider",
      claim: "The provider documentation describes a streaming API.",
      scope: "capability",
      sourceUrl: "https://provider.example/docs",
      sourceTitle: "Provider documentation",
      lastVerifiedAt: OBSERVED_AT,
      applicability: { validFrom: OBSERVED_AT, validUntil: null },
      status: "documented",
      provenance: "Recorded from the exact linked documentation; not measured by ONE.",
      rankEligible: false,
    }).rankEligible).toBe(false);

    const automatedJudgment = {
      schemaVersion: "one-benchmark-judgment/1.0.0",
      evidenceCategory: "automated",
      judgmentClass: "external-framework",
      judgmentId: "judgment/future-provider/external",
      runId: "00000000-0000-4000-8000-000000000901",
      providerId: "future-provider",
      model: "future-model",
      voice: null,
      configurationHash: CONFIGURATION_HASH,
      dimension: "use-case-fit",
      value: 0.8,
      judgedAt: OBSERVED_AT,
      judge: { framework: "external-evaluator", frameworkVersion: "1.0.0", model: "judge-model", configurationHash: CONFIGURATION_HASH },
      evaluator: { class: "automated", anonymous: false },
      rubricVersion: "rubric/1.0.0",
      promptVersion: "prompt/1.0.0",
      confidence: 0.8,
      externalFramework: { name: "external-evaluator", version: "1.0.0" },
      provenance: "Fixture-only schema validation; no model or external framework was called.",
    };
    expect(benchmarkAutomatedJudgmentSchema.safeParse(automatedJudgment).success).toBe(true);
    expect(benchmarkAutomatedJudgmentSchema.safeParse({ ...automatedJudgment, externalFramework: null }).success).toBe(false);
    expect(benchmarkAutomatedJudgmentSchema.safeParse({
      ...automatedJudgment,
      externalFramework: { name: "different-framework", version: "2.0.0" },
    }).success).toBe(false);
    for (const sourceUrl of ["javascript:alert(1)", "data:text/html,unsafe", "file:///private/provider-docs"]) {
      expect(benchmarkProviderClaimSchema.safeParse({
        schemaVersion: BENCHMARK_MEASUREMENT_VERSION,
        evidenceCategory: "provider-documented-claim",
        claimId: "claim/future-provider/unsafe-source",
        providerId: "future-provider",
        claim: "Unsafe source fixture.",
        scope: "capability",
        sourceUrl,
        sourceTitle: "Unsafe source",
        lastVerifiedAt: OBSERVED_AT,
        applicability: { validFrom: OBSERVED_AT, validUntil: null },
        status: "unverified",
        provenance: "Schema rejection fixture.",
        rankEligible: false,
      }).success).toBe(false);
    }
  });

  test("keeps future STT and realtime observations modality-neutral", () => {
    const futureRun = benchmarkRunSchema.parse({
      schemaVersion: "one-benchmark-run/1.0.0",
      runId: "00000000-0000-4000-8000-000000000101",
      evaluationId: "00000000-0000-4000-8000-000000000102",
      category: "stt",
      status: "draft",
      suiteRef: { id: "future-stt-suite", version: "1.0.0" },
      methodologyRef: { id: "one-stt-identical-audio", version: "1.0.0" },
      caseRef: { id: "future-audio-case", version: "1.0.0", inputHash: INPUT_HASH },
      methodologyVersion: "1.0.0",
      metricVersion: "future-stt-metrics/1.0.0",
      recordedAt: OBSERVED_AT,
      executionMode: "local-live",
      evaluationMode: "standardized",
      initiatedBy: { class: "human", subjectId: "local-user" },
      trustTier: "local",
      runtime: { environment: "local-live", deployment: "local", region: null },
      timestamps: { queuedAt: null, startedAt: null, completedAt: null },
      failure: null,
      participants: [{
        providerId: "future-provider",
        providerMetadataSnapshot: { displayName: "Future Provider", readiness: "adapter-backed", adapterVersion: "future-adapter/1.0.0", modelVersion: "1.0.0", capability: "stt" },
        modelId: "future-stt-model",
        voiceId: null,
        configuration: {},
        configurationHash: CONFIGURATION_HASH,
        region: null,
        transport: "local",
        codec: "audio/wav",
        sampleRateHz: 16_000,
        channels: 1,
        thermalState: "unknown",
      }],
      observation: {
        kind: "future-observation-reference",
        sourceSchemaVersion: "future-stt-observation/1.0.0",
        reference: "fixture:future-stt-observation",
        contentHash: INPUT_HASH,
      },
    });
    expect(futureRun.participants[0].voiceId).toBeNull();
    expect(futureRun.observation.kind).toBe("future-observation-reference");
    expect(benchmarkRunSchema.parse({
      ...futureRun,
      category: "realtime",
      suiteRef: { id: "future-realtime-suite", version: "1.0.0" },
      methodologyRef: { id: "one-realtime-turn-sequence", version: "1.0.0" },
      caseRef: { ...futureRun.caseRef, id: "future-realtime-case" },
      participants: futureRun.participants.map((participant) => ({
        ...participant,
        providerMetadataSnapshot: { ...participant.providerMetadataSnapshot, capability: "realtime" as const },
      })),
    }).category).toBe("realtime");
  });

  test("rejects category, input, size, and output modality mismatches", () => {
    const benchmarkCase = {
      schemaVersion: "one-benchmark-case/1.0.0",
      caseId: "tts-case",
      version: "1.0.0",
      category: "tts",
      suiteRef: { id: "tts-suite", version: "1.0.0" },
      name: "TTS case",
      scenario: { id: "tts-case", version: "1.0.0", inputType: "text", inputHash: INPUT_HASH, canonicalInputIncluded: false },
      language: "en-US",
      domain: "support",
      expectedSize: { value: 100, unit: "characters" },
      provenance: "Deterministic unit-test fixture.",
      privacy: "synthetic",
      integrity: { inputHash: INPUT_HASH, sourceVerified: true },
      tags: ["fixture"],
      limitations: ["Schema-only test case."],
    };
    expect(benchmarkCaseSchema.safeParse(benchmarkCase).success).toBe(true);
    expect(benchmarkCaseSchema.safeParse({ ...benchmarkCase, scenario: { ...benchmarkCase.scenario, inputType: "audio" } }).success).toBe(false);

    const suite = {
      schemaVersion: "one-benchmark-suite/1.0.0",
      suiteId: "tts-suite",
      version: "1.0.0",
      category: "tts",
      modality: "tts",
      name: "TTS suite",
      description: "Synthetic suite used only for strict schema validation.",
      methodology: { id: "one-tts-identical-script", version: "1.0.0" },
      cases: [{ id: "tts-case", version: "1.0.0" }],
      repetitions: { minimum: 1, maximum: 3 },
      visibility: "private",
      publication: "draft",
      retention: "ephemeral",
      sponsorshipDisclosure: null,
      language: "en-US",
      domain: "support",
      dataset: { version: "1.0.0", license: "test-only", provenance: "Deterministic unit-test fixture.", inputHashes: [INPUT_HASH] },
      privacy: "synthetic",
      expectedOutput: { kind: "audio", format: "audio/wav", required: true },
      publicationEligibility: "ineligible",
      deprecatedAt: null,
      supersededBy: null,
    };
    expect(benchmarkSuiteSchema.safeParse(suite).success).toBe(true);
    expect(benchmarkSuiteSchema.safeParse({ ...suite, expectedOutput: { kind: "transcript", format: "text/plain", required: true } }).success).toBe(false);
    expect(benchmarkSuiteSchema.safeParse({ ...suite, category: "provider-evidence", modality: null, expectedOutput: { kind: "provider-claim", format: "application/json", required: true } }).success).toBe(true);
  });
});

test.describe("statistics and deterministic metric-only ranking", () => {
  test("reports every statistic availability threshold explicitly", () => {
    const none = summarizeBenchmarkSamples([]);
    expect(none.sampleCount).toBe(0);
    expect(none.mean).toEqual({ availability: "insufficient-samples", value: null, minimumSamples: 1 });

    const two = summarizeBenchmarkSamples([1, 3]);
    expect(two.mean.value).toBe(2);
    expect(two.standardDeviation.value).toBe(1);
    expect(two.median.availability).toBe("insufficient-samples");

    const three = summarizeBenchmarkSamples([3, 1, 2]);
    expect(three.median).toEqual({ availability: "available", value: 2, minimumSamples: 3 });
    expect(three.p95.availability).toBe("insufficient-samples");

    const twenty = summarizeBenchmarkSamples(Array.from({ length: 20 }, (_, index) => index + 1));
    expect(twenty.p95).toEqual({ availability: "available", value: 19, minimumSamples: 20 });
  });

  test("retains failures and extreme observations instead of silently dropping them", () => {
    const binaryFailures = summarizeBenchmarkSamples([0, 1, 0, 1]);
    expect(binaryFailures.sampleCount).toBe(4);
    expect(binaryFailures.mean.value).toBe(0.5);

    const withOutlier = summarizeBenchmarkSamples([1, 2, 1_000]);
    expect(withOutlier.maximum.value).toBe(1_000);
    expect(withOutlier.mean.value).toBeCloseTo(334.3333333333333, 12);
  });

  test("accepts a synthetic future provider, produces stable ties, and never produces a composite", () => {
    const profile = scoringProfile({ minimumSampleCount: 1 });
    const snapshot = buildMetricLeaderboard([
      candidate("future-provider", [10]),
      candidate("alpha-provider", [10]),
      candidate("beta-provider", [5]),
    ], profile, { snapshotId: "leaderboard/future-provider-test", generatedAt: OBSERVED_AT });
    expect(snapshot.entries.map((entry) => [entry.providerId, entry.rank])).toEqual([
      ["alpha-provider", 1],
      ["future-provider", 1],
      ["beta-provider", 3],
    ]);
    expect(snapshot.entries.slice(0, 2).every((entry) => entry.tied)).toBe(true);
    expect(snapshot.compositeScoreProvided).toBe(false);
    expect(snapshot.sponsorshipDisclosures).toEqual([]);
    expect(JSON.stringify(snapshot)).not.toContain("compositeScore\"");
  });

  test("preserves sponsorship disclosures without changing objective rank", () => {
    const sponsored = candidate("sponsored-provider", [10]);
    sponsored.metadata.sponsorshipDisclosures = ["Compute sponsored by Example Provider"];
    const snapshot = buildMetricLeaderboard([sponsored], scoringProfile(), { generatedAt: OBSERVED_AT });
    expect(snapshot.sponsorshipDisclosures).toEqual(["Compute sponsored by Example Provider"]);
    expect(snapshot.entries[0].metadata.sponsorshipDisclosures).toEqual(["Compute sponsored by Example Provider"]);
    const omitted = structuredClone(snapshot);
    omitted.sponsorshipDisclosures = [];
    expect(benchmarkLeaderboardSnapshotSchema.safeParse(omitted).success).toBe(false);
  });

  test("ranks with unrounded evidence and rounds only the displayed value", () => {
    const snapshot = buildMetricLeaderboard([
      candidate("alpha-provider", [10.001]),
      candidate("beta-provider", [10.004]),
    ], scoringProfile({ decimalPlaces: 2 }), { generatedAt: OBSERVED_AT });
    expect(snapshot.entries.map((entry) => [entry.providerId, entry.rank, entry.value, entry.tied])).toEqual([
      ["beta-provider", 1, 10, false],
      ["alpha-provider", 2, 10, false],
    ]);
  });

  test("keeps sub-nanosecond aggregate differences distinct for ordering and ties", () => {
    const snapshot = buildMetricLeaderboard([
      candidate("alpha-provider", [1, 1.0000000002]),
      candidate("beta-provider", [1, 1.0000000004]),
    ], scoringProfile({ decimalPlaces: 3 }), { generatedAt: OBSERVED_AT });
    expect(snapshot.entries.map((entry) => [entry.providerId, entry.rank, entry.value, entry.tied])).toEqual([
      ["beta-provider", 1, 1, false],
      ["alpha-provider", 2, 1, false],
    ]);
  });

  test("does not let fixture evidence masquerade as current observed evidence", () => {
    const mislabeledSource = candidate("source-forgery", [1]);
    mislabeledSource.measurements[0].source = "fixture";
    expect(() => buildMetricLeaderboard([mislabeledSource], scoringProfile(), { generatedAt: OBSERVED_AT })).toThrow(/fixture or synthetic provenance/i);

    const forged = candidate("alpha-provider", [1]);
    forged.metadata.comparablePopulation.executionMode = "fixture";
    expect(() => buildMetricLeaderboard([forged], scoringProfile(), { generatedAt: OBSERVED_AT })).toThrow(/fixture/i);

    forged.metadata.freshness.status = "fixture-only";
    forged.measurements = forged.measurements.map((item) => ({
      ...item,
      synthetic: true,
      source: "fixture" as const,
      provenance: { ...item.provenance, observation: "synthetic" as const, clock: "not-applicable" as const },
    }));
    expect(() => buildMetricLeaderboard([forged], scoringProfile({ allowSynthetic: true }), { generatedAt: OBSERVED_AT })).not.toThrow();
  });

  test("rejects duplicate or cross-lane measurements and excludes insufficient result IDs", () => {
    const valid = measurement("alpha-provider", 10, "m/duplicate");
    const duplicate = { ...valid, value: 999 };
    const wrongProvider = measurement("other-provider", 100, "m/wrong-provider");
    const sparse = candidate("alpha-provider", []);
    sparse.measurements = [valid, duplicate, wrongProvider];
    sparse.sources = [{
      resultId: "benchmark-result/sparse",
      runId: valid.runId,
      measurementIds: [valid.measurementId, duplicate.measurementId, wrongProvider.measurementId],
    }];
    expect(() => buildMetricLeaderboard([sparse], scoringProfile({ minimumSampleCount: 2 }), {
      snapshotId: "leaderboard/duplicate-measurement-test",
      generatedAt: OBSERVED_AT,
    })).toThrow(/(?:duplicate measurement identifiers|must be unique)/i);
    sparse.measurements = [valid, wrongProvider];
    sparse.sources = [{
      resultId: "benchmark-result/sparse",
      runId: valid.runId,
      measurementIds: [valid.measurementId, wrongProvider.measurementId],
    }];
    expect(() => buildMetricLeaderboard([sparse], scoringProfile({ minimumSampleCount: 2 }), {
      snapshotId: "leaderboard/provenance-filter-test",
      generatedAt: OBSERVED_AT,
    })).toThrow(/exact provider, model, voice, and configuration lane/i);
    sparse.measurements = [valid];
    sparse.sources = [{ resultId: "benchmark-result/sparse", runId: valid.runId, measurementIds: [valid.measurementId] }];
    const snapshot = buildMetricLeaderboard([sparse], scoringProfile({ minimumSampleCount: 2 }), {
      snapshotId: "leaderboard/provenance-filter-test",
      generatedAt: OBSERVED_AT,
    });
    expect(snapshot.entries[0].sampleCount).toBe(1);
    expect(snapshot.entries[0].status).toBe("insufficient-samples");
    expect(snapshot.includedResultIds).toEqual([]);
    expect(snapshot.excludedResults[0].resultId).toBe("benchmark-result/sparse");
    expect(snapshot.excludedResults[0]).toMatchObject({ candidateId: "candidate/alpha-provider", providerId: "alpha-provider", configurationHash: CONFIGURATION_HASH });

    sparse.measurements = [{ ...valid, measurementId: "m/aggregated", sampleCount: 2 }];
    sparse.sources = [{ resultId: "benchmark-result/sparse", runId: valid.runId, measurementIds: ["m/aggregated"] }];
    expect(() => buildMetricLeaderboard([sparse], scoringProfile({ minimumSampleCount: 1 }))).toThrow(/atomic measurements/i);
  });

  test("does not combine differently observed or reported metrics", () => {
    const observed = candidate("alpha-provider", [10]);
    const mixed = measurement("alpha-provider", 1_000, "measurement/alpha-provider/provider-reported");
    mixed.source = "provider-reported";
    mixed.provenance = {
      ...mixed.provenance,
      measurementPoint: "provider-reported",
      clock: "provider",
      observation: "provider-reported",
    };
    observed.measurements.push(mixed);
    observed.sources[0].measurementIds.push(mixed.measurementId);
    const snapshot = buildMetricLeaderboard([observed], scoringProfile(), { generatedAt: OBSERVED_AT });
    expect(snapshot.entries[0]).toMatchObject({ sampleCount: 1, value: 10 });
    expect(snapshot.scoringProfile.measurementScope).toMatchObject({ source: "one-observed", measurementPoint: "one-server", clock: "server-monotonic" });

    const scopeMutations: Array<(item: BenchmarkMeasurement) => void> = [
      (item) => { item.source = "imported"; },
      (item) => { item.provenance = { ...item.provenance, measurementPoint: "one-browser", clock: "browser-monotonic" }; },
      (item) => { item.method = "different-method"; },
      (item) => { item.provenance = { ...item.provenance, sourceSchemaVersion: "different-source/1.0.0" }; },
    ];
    for (const mutate of scopeMutations) {
      const mismatched = candidate("alpha-provider", [10]);
      mutate(mismatched.measurements[0]);
      const excluded = buildMetricLeaderboard([mismatched], scoringProfile(), { generatedAt: OBSERVED_AT });
      expect(excluded.entries[0]).toMatchObject({ status: "insufficient-samples", sampleCount: 0 });
      expect(excluded.entries[0].sources[0].measurementIds).toEqual(["measurement/alpha-provider/0"]);
    }
  });

  test("enforces global candidate ownership and attributes only the selected metric scope", () => {
    const alpha = candidate("alpha-provider", [10]);
    const unrelated = {
      ...measurement("alpha-provider", 99, "measurement/alpha-provider/unrelated"),
      metricId: "unrelated-metric",
    };
    alpha.measurements.push(unrelated);
    alpha.sources[0].measurementIds.push(unrelated.measurementId);
    const scoped = buildMetricLeaderboard([alpha], scoringProfile(), { generatedAt: OBSERVED_AT });
    expect(scoped.entries[0].sources[0].measurementIds).toEqual(["measurement/alpha-provider/0"]);

    const duplicateLane = structuredClone(alpha);
    duplicateLane.candidateId = "candidate/alpha-provider/duplicate-lane";
    duplicateLane.measurements = duplicateLane.measurements.map((item, index) => ({ ...item, measurementId: `measurement/alpha-provider/duplicate/${index}` }));
    duplicateLane.sources = [{
      resultId: "benchmark-result/alpha-provider/duplicate",
      runId: duplicateLane.measurements[0].runId,
      measurementIds: duplicateLane.measurements.map((item) => item.measurementId),
    }];
    expect(() => buildMetricLeaderboard([alpha, duplicateLane], scoringProfile(), { generatedAt: OBSERVED_AT })).toThrow(/duplicate exact provider/i);

    const beta = candidate("beta-provider", [20]);
    beta.measurements[0].measurementId = alpha.measurements[0].measurementId;
    beta.sources[0].measurementIds = [alpha.measurements[0].measurementId];
    expect(() => buildMetricLeaderboard([alpha, beta], scoringProfile(), { generatedAt: OBSERVED_AT })).toThrow(/only one leaderboard candidate/i);
  });

  test("fails closed when the unsigned ranking builder is asked to publish", () => {
    expect(() => buildMetricLeaderboard([candidate("alpha-provider", [1])], scoringProfile({ minimumSampleCount: 1 }), {
      publicEligibility: true,
    })).toThrow(/separate verified publication/i);
    expect(() => buildMetricLeaderboard([candidate("alpha-provider", [1])], scoringProfile({ minimumSampleCount: 1 }), {
      visibility: "public-verified",
    })).toThrow(/separate verified publication/i);
  });

  test("rejects mixed language, case, methodology, and execution populations", () => {
    const english = candidate("alpha-provider", [1]);
    const french = candidate("beta-provider", [1]);
    french.metadata.comparablePopulation.language = "fr-FR";
    expect(() => buildMetricLeaderboard([english, french], scoringProfile(), { generatedAt: OBSERVED_AT })).toThrow(/one exact suite, case, input/i);

    const warm = candidate("beta-provider", [1]);
    warm.metadata.comparablePopulation.thermalState = "warm";
    expect(() => buildMetricLeaderboard([english, warm], scoringProfile(), { generatedAt: OBSERVED_AT })).toThrow(/one exact suite, case, input/i);
  });

  test("derives freshness at snapshot time and excludes stale or future-dated evidence", () => {
    const current = candidate("alpha-provider", [10]);
    const stale = candidate("beta-provider", [20]);
    stale.metadata.freshness.observedAt = "2025-08-27T12:00:00.000Z";
    const unknown = candidate("future-provider", [30]);
    unknown.metadata.freshness.observedAt = "2027-08-27T12:00:00.000Z";
    const snapshot = buildMetricLeaderboard([current, stale, unknown], scoringProfile(), {
      generatedAt: OBSERVED_AT,
      freshnessMaximumAgeMs: 30 * 24 * 60 * 60 * 1_000,
    });
    expect(snapshot.entries.find((entry) => entry.providerId === "alpha-provider")).toMatchObject({ status: "ranked", rank: 1 });
    expect(snapshot.entries.find((entry) => entry.providerId === "beta-provider")).toMatchObject({
      status: "excluded",
      metadata: { freshness: { status: "stale" } },
    });
    expect(snapshot.entries.find((entry) => entry.providerId === "beta-provider")?.exclusions.map((entry) => entry.code)).toContain("stale-evidence");
    expect(snapshot.entries.find((entry) => entry.providerId === "future-provider")).toMatchObject({
      status: "excluded",
      metadata: { freshness: { status: "unknown" } },
    });
    expect(snapshot.entries.find((entry) => entry.providerId === "future-provider")?.exclusions.map((entry) => entry.code)).toContain("freshness-unverified");
    expect(() => buildMetricLeaderboard([current], scoringProfile(), { generatedAt: OBSERVED_AT, freshnessMaximumAgeMs: 0 })).toThrow(/freshness windows/i);
  });

  test("requires candidate eligibility to agree with structured ranking exclusions", () => {
    const exclusion = {
      schemaVersion: "one-benchmark-eligibility/1.0.0" as const,
      code: "failed-run" as const,
      scope: "ranking" as const,
      detail: "The candidate did not produce a successful atomic observation.",
    };
    expect(() => buildMetricLeaderboard([{ ...candidate("alpha-provider", [1]), exclusions: [exclusion] }], scoringProfile(), { generatedAt: OBSERVED_AT })).toThrow();
    expect(() => buildMetricLeaderboard([{ ...candidate("alpha-provider", [1]), eligible: false }], scoringProfile(), { generatedAt: OBSERVED_AT })).toThrow();
    const snapshot = buildMetricLeaderboard([{ ...candidate("alpha-provider", [1]), eligible: false, exclusions: [exclusion] }], scoringProfile(), { generatedAt: OBSERVED_AT });
    expect(snapshot.entries[0]).toMatchObject({ status: "excluded", value: null, sampleCount: 0 });
    const contradictoryExclusion = structuredClone(snapshot);
    contradictoryExclusion.excludedResults[0].reasons[0].detail = "A conflicting exclusion explanation.";
    expect(benchmarkLeaderboardSnapshotSchema.safeParse(contradictoryExclusion).success).toBe(false);
  });

  test("rejects internally inconsistent ranked and excluded entry states", () => {
    const ranked = createFixtureLeaderboardPreview().entries[0];
    expect(benchmarkLeaderboardEntrySchema.safeParse({ ...ranked, rank: null, value: null, sampleCount: 0 }).success).toBe(false);
    expect(benchmarkLeaderboardEntrySchema.safeParse({ ...ranked, status: "excluded", rank: 1, value: 1, sampleCount: 1 }).success).toBe(false);
    expect(benchmarkLeaderboardEntrySchema.safeParse({ ...ranked, status: "excluded", rank: null, tied: false, value: null, sampleCount: 0 }).success).toBe(false);
    expect(benchmarkLeaderboardEntrySchema.safeParse({
      ...ranked,
      status: "excluded",
      rank: null,
      tied: false,
      value: null,
      sampleCount: 0,
      exclusions: [{
        schemaVersion: "one-benchmark-eligibility/1.0.0",
        code: "stale-evidence",
        scope: "ranking",
        detail: "Evidence is outside the bounded freshness window.",
      }],
    }).success).toBe(true);
  });
});

test.describe("evaluation bridge, series, preview, and planning", () => {
  test("preserves an EvaluationEvidenceBundle atomically and marks fixture evidence synthetic/private", async () => {
    const bundle = await executeEvaluationRun(fixtureRequest(), {
      emit: () => undefined,
      resolveAdapter: () => { throw new Error("fixture benchmark must not resolve a provider adapter"); },
      runGuard: async () => { throw new Error("fixture benchmark must not spend provider credits"); },
    });
    const [result] = await materializeEvaluationBenchmarkResults(bundle);
    expect(result.run.observation.kind).toBe("evaluation-evidence-bundle");
    if (result.run.observation.kind !== "evaluation-evidence-bundle") throw new Error("Expected evaluation evidence observation");
    expect(result.run.observation.bundle).toEqual(bundle);
    expect(result.objectiveMeasurements.every((measurement) => measurement.synthetic && measurement.provenance.observation === "synthetic")).toBe(true);
    expect(result.automatedJudgments).toEqual([]);
    expect(result.visibility).toBe("private");
    expect(result.eligibility.publicEligible).toBe(false);
    expect(result.eligibility.rankingEligible).toBe(false);
    expect(result.run.participants.every((participant) => participant.providerMetadataSnapshot.readiness !== "live-enabled")).toBe(true);

    const unrelatedEvidence = structuredClone(result);
    unrelatedEvidence.objectiveMeasurements[0].model = "unrelated-model";
    expect(benchmarkResultSchema.safeParse(unrelatedEvidence).success).toBe(false);

    const mislabeledTtsBridge = structuredClone(result);
    mislabeledTtsBridge.category = "stt";
    mislabeledTtsBridge.run.category = "stt";
    mislabeledTtsBridge.run.participants.forEach((participant) => { participant.providerMetadataSnapshot.capability = "stt"; });
    expect(benchmarkResultSchema.safeParse(mislabeledTtsBridge).success).toBe(false);

    const contradictoryLane = structuredClone(result);
    contradictoryLane.run.participants[0].modelId = "contradictory-model";
    expect(benchmarkResultSchema.safeParse(contradictoryLane).success).toBe(false);

    const contradictoryStatus = structuredClone(result);
    contradictoryStatus.status = "failed";
    expect(benchmarkResultSchema.safeParse(contradictoryStatus).success).toBe(false);
  });

  test("preserves exact source-lane identity and excludes a failed lane in a partial run", async () => {
    const bundle = structuredClone(await executeEvaluationRun(fixtureRequest(), { emit: () => undefined }));
    const failedLane = bundle.providerResults[1];
    failedLane.status = "failed";
    failedLane.sanitizedError = { code: "fixture-failure", message: "Deterministic fixture failure.", retryable: false };
    failedLane.firstAudioTimestamp = null;
    failedLane.clientPlayableTimestamp = null;
    failedLane.audio = {
      mimeType: null,
      durationSeconds: null,
      storageReference: null,
      contentHash: null,
      rawContentHash: null,
      normalized: false,
    };
    failedLane.metrics = failedLane.metrics.map((metric) => metric.name === "request_success"
      ? { ...metric, value: 0 }
      : {
          ...metric,
          value: null,
          unit: "unavailable" as const,
          availability: "unavailable" as const,
          provenance: { ...metric.provenance, clock: "not-applicable" as const },
        });
    const series = await aggregateEvaluationBenchmarkSeries([bundle]);
    const failedCandidate = series.candidates.find((entry) => entry.providerId === failedLane.provider);
    const successfulCandidate = series.candidates.find((entry) => entry.providerId === bundle.providerResults[0].provider);
    expect(failedCandidate?.exclusions.map((entry) => entry.code)).toContain("failed-run");
    expect(successfulCandidate?.exclusions.map((entry) => entry.code)).not.toContain("failed-run");
    expect(failedCandidate?.sources[0]).toMatchObject({ resultId: `benchmark-result/${bundle.runId}`, runId: bundle.runId });
    expect(failedCandidate?.sources[0].measurementIds.length).toBeGreaterThan(0);

    if (!failedCandidate) throw new Error("Failed fixture candidate required");
    const snapshot = buildMetricLeaderboard([failedCandidate], scoringProfile({
      metricId: "request-success",
      metricVersion: "one-tts-metrics/1.0.0",
      unit: "boolean",
      minimumSampleCount: 1,
      allowSynthetic: true,
      measurementScope: {
        source: "fixture",
        measurementPoint: "one-server",
        clock: "not-applicable",
        observation: "synthetic",
        method: "one-evaluation-evidence-adapter",
        sourceSchemaVersion: "one-tts-metrics/1.0.0",
      },
    }), { generatedAt: OBSERVED_AT });
    expect(snapshot.excludedResults.some((entry) => entry.resultId === `benchmark-result/${bundle.runId}` && entry.candidateId === failedCandidate?.candidateId)).toBe(true);
  });

  test("rejects duplicate provider lanes before canonical materialization", async () => {
    const bundle = structuredClone(await executeEvaluationRun(fixtureRequest(), { emit: () => undefined }));
    bundle.providerResults[1].provider = bundle.providerResults[0].provider;
    await expect(materializeEvaluationBenchmarkResults(bundle)).rejects.toThrow(/semantic integrity/i);
  });

  test("preserves provider-specific and run-level sponsorship disclosures", async () => {
    const bundle = structuredClone(await executeEvaluationRun(fixtureRequest(), { emit: () => undefined }));
    bundle.sponsorshipDisclosure = "Canonical suite compute sponsored by Suite Sponsor";
    bundle.providerResults[0].sponsorshipDisclosure = "Provider lane compute sponsored by Lane Sponsor";
    const series = await aggregateEvaluationBenchmarkSeries([bundle]);
    const sponsoredLane = series.candidates.find((item) => item.providerId === bundle.providerResults[0].provider);
    expect(sponsoredLane?.metadata.sponsorshipDisclosures).toEqual([
      "Canonical suite compute sponsored by Suite Sponsor",
      "Provider lane compute sponsored by Lane Sponsor",
    ]);
    expect(series.candidates.find((item) => item.providerId === bundle.providerResults[1].provider)?.metadata.sponsorshipDisclosures).toEqual([
      "Canonical suite compute sponsored by Suite Sponsor",
    ]);
  });

  test("uses provider differences as cross-provider disclosures but material series exclusions", async () => {
    const [first] = await materializeEvaluationBenchmarkResults(await executeEvaluationRun(fixtureRequest(), { emit: () => undefined }));
    const secondRequest = fixtureRequest();
    secondRequest.evaluationId = "00000000-0000-4000-8000-000000000011";
    secondRequest.runId = "00000000-0000-4000-8000-000000000012";
    const [second] = await materializeEvaluationBenchmarkResults(await executeEvaluationRun(secondRequest, { emit: () => undefined }));

    const cross = assessBenchmarkComparability(first, first, { scope: "cross-provider", leftProviderId: "deepgram", rightProviderId: "cartesia" });
    expect(cross.comparable).toBe(true);
    expect(cross.disclosures.map((reason) => reason.code)).toContain("provider");

    const wrongSeries = assessBenchmarkComparability(first, first, { scope: "series", leftProviderId: "deepgram", rightProviderId: "cartesia" });
    expect(wrongSeries.comparable).toBe(false);
    expect(wrongSeries.reasons.map((reason) => reason.code)).toContain("provider");

    const matchingSeries = assessBenchmarkComparability(first, second, { scope: "series", leftProviderId: "deepgram", rightProviderId: "deepgram" });
    expect(matchingSeries.comparable).toBe(true);

    const changedSuite = structuredClone(second);
    changedSuite.run.suiteRef.version = "2.0.0";
    expect(assessBenchmarkComparability(first, changedSuite, { scope: "series", leftProviderId: "deepgram", rightProviderId: "deepgram" }).reasons.map((reason) => reason.code)).toContain("suite-version");

    const warmRun = structuredClone(second);
    const warmParticipant = warmRun.run.participants.find((participant) => participant.providerId === "deepgram");
    if (!warmParticipant) throw new Error("Deepgram participant required");
    warmParticipant.thermalState = "warm";
    expect(assessBenchmarkComparability(first, warmRun, { scope: "series", leftProviderId: "deepgram", rightProviderId: "deepgram" }).reasons.map((reason) => reason.code)).toContain("thermal-state");
  });

  test("selects exact lanes and rejects evaluation-mode, transport, and model-version drift", async () => {
    const request = fixtureRequest();
    request.providers = request.providers.slice(0, 2);
    const [first] = await materializeEvaluationBenchmarkResults(await executeEvaluationRun(request, { emit: () => undefined }));
    const original = first.run.participants[0];

    const ambiguous = structuredClone(first);
    ambiguous.run.observation = {
      kind: "future-observation-reference",
      sourceSchemaVersion: "future-tts-observation/1.0.0",
      reference: "fixture:exact-lane-selection",
      contentHash: INPUT_HASH,
    };
    ambiguous.run.participants.push({
      ...structuredClone(original),
      modelId: "alternate-model",
      voiceId: "alternate-voice",
    });
    expect(assessBenchmarkComparability(ambiguous, ambiguous, {
      scope: "series",
      leftProviderId: original.providerId,
      rightProviderId: original.providerId,
    }).reasons.map((reason) => reason.code)).toContain("provider");
    expect(assessBenchmarkComparability(ambiguous, ambiguous, {
      scope: "series",
      leftProviderId: original.providerId,
      rightProviderId: original.providerId,
      leftModelId: original.modelId,
      rightModelId: original.modelId,
      leftVoiceId: original.voiceId,
      rightVoiceId: original.voiceId,
      leftConfigurationHash: original.configurationHash,
      rightConfigurationHash: original.configurationHash,
    }).comparable).toBe(true);

    const optimized = structuredClone(first);
    optimized.run.observation = {
      kind: "future-observation-reference",
      sourceSchemaVersion: "future-tts-observation/1.0.0",
      reference: "fixture:provider-optimized-observation",
      contentHash: INPUT_HASH,
    };
    optimized.run.evaluationMode = "provider-optimized";
    expect(assessBenchmarkComparability(ambiguous, optimized, {
      scope: "series",
      leftProviderId: original.providerId,
      rightProviderId: original.providerId,
      leftModelId: original.modelId,
      rightModelId: original.modelId,
      leftVoiceId: original.voiceId,
      rightVoiceId: original.voiceId,
      leftConfigurationHash: original.configurationHash,
      rightConfigurationHash: original.configurationHash,
    }).reasons.map((reason) => reason.code)).toContain("evaluation-mode");

    const changedTransport = structuredClone(first);
    changedTransport.run.participants[0].transport = "different-transport";
    expect(assessBenchmarkComparability(first, changedTransport, {
      scope: "series",
      leftProviderId: original.providerId,
      rightProviderId: original.providerId,
    }).reasons.map((reason) => reason.code)).toContain("transport");

    const changedModelVersion = structuredClone(first);
    changedModelVersion.run.participants[0].providerMetadataSnapshot.modelVersion = "2.0.0";
    expect(assessBenchmarkComparability(first, changedModelVersion, {
      scope: "series",
      leftProviderId: original.providerId,
      rightProviderId: original.providerId,
    }).reasons.map((reason) => reason.code)).toContain("model");
  });

  test("retains failed observed attempts as zero-valued reliability evidence", async () => {
    const firstRequest = fixtureRequest();
    const secondRequest = fixtureRequest();
    secondRequest.evaluationId = "00000000-0000-4000-8000-000000000031";
    secondRequest.runId = "00000000-0000-4000-8000-000000000032";
    const first = structuredClone(await executeEvaluationRun(firstRequest, { emit: () => undefined }));
    const second = structuredClone(await executeEvaluationRun(secondRequest, { emit: () => undefined }));
    for (const bundle of [first, second]) {
      bundle.providerResults.forEach((provider) => { provider.environment = "local-live"; });
    }
    const failedLane = second.providerResults[0];
    failedLane.status = "failed";
    failedLane.sanitizedError = { code: "fixture-observed-failure", message: "Deterministic observed failure fixture.", retryable: false };
    failedLane.firstAudioTimestamp = null;
    failedLane.clientPlayableTimestamp = null;
    failedLane.audio = {
      mimeType: null,
      durationSeconds: null,
      storageReference: null,
      contentHash: null,
      rawContentHash: null,
      normalized: false,
    };
    failedLane.metrics = failedLane.metrics.map((metric) => metric.name === "request_success"
      ? { ...metric, value: 0 }
      : {
          ...metric,
          value: null,
          unit: "unavailable" as const,
          availability: "unavailable" as const,
          provenance: { ...metric.provenance, clock: "not-applicable" as const },
        });

    const generatedAt = new Date(Math.max(Date.parse(first.exportedAt), Date.parse(second.exportedAt)) + 1_000).toISOString();
    const series = await aggregateEvaluationBenchmarkSeries([first, second], {
      freshness: { asOf: generatedAt, maximumAgeMs: 30 * 24 * 60 * 60 * 1_000 },
    });
    const reliabilityCandidate = series.candidates.find((candidate) => candidate.providerId === failedLane.provider);
    if (!reliabilityCandidate) throw new Error("Reliability candidate required");
    expect(reliabilityCandidate.eligible).toBe(true);
    expect(reliabilityCandidate.exclusions).toContainEqual(expect.objectContaining({ code: "failed-run", scope: "publication" }));
    expect(reliabilityCandidate.measurements.filter((metric) => metric.metricId === "request-success").map((metric) => metric.value)).toEqual([1, 0]);

    const snapshot = buildMetricLeaderboard([reliabilityCandidate], scoringProfile({
      metricId: "request-success",
      metricVersion: "one-tts-metrics/1.0.0",
      unit: "boolean",
      minimumSampleCount: 2,
      direction: "higher-is-better",
      measurementScope: {
        source: "one-observed",
        measurementPoint: "one-server",
        clock: "server-monotonic",
        observation: "observed",
        method: "one-evaluation-evidence-adapter",
        sourceSchemaVersion: "one-tts-metrics/1.0.0",
      },
    }), { generatedAt });
    expect(snapshot.entries[0]).toMatchObject({ status: "ranked", value: 0.5, sampleCount: 2 });
    expect(snapshot.includedResultIds).toEqual([
      `benchmark-result/${first.runId}`,
      `benchmark-result/${second.runId}`,
    ].sort());
  });

  test("keeps pre-dispatch denials out of provider reliability rankings", async () => {
    const bundle = structuredClone(await executeEvaluationRun(fixtureRequest(), { emit: () => undefined }));
    bundle.providerResults.forEach((provider) => { provider.environment = "local-live"; });
    const deniedLane = bundle.providerResults[0];
    deniedLane.status = "unavailable";
    deniedLane.sanitizedError = { code: "quota_exhausted", message: "ONE denied the lane before provider dispatch.", retryable: false };
    deniedLane.requestTimestamp = null;
    deniedLane.firstAudioTimestamp = null;
    deniedLane.clientPlayableTimestamp = null;
    deniedLane.trace = deniedLane.trace.filter((event) => event.type !== "provider-request-start" && event.type !== "first-audio-chunk");
    deniedLane.audio = {
      mimeType: null,
      durationSeconds: null,
      storageReference: null,
      contentHash: null,
      rawContentHash: null,
      normalized: false,
    };
    deniedLane.metrics = deniedLane.metrics.map((metric) => metric.name === "request_success"
      ? { ...metric, value: 0 }
      : {
          ...metric,
          value: null,
          unit: "unavailable" as const,
          availability: "unavailable" as const,
          provenance: { ...metric.provenance, clock: "not-applicable" as const },
        });

    const generatedAt = new Date(Date.parse(bundle.exportedAt) + 1_000).toISOString();
    const series = await aggregateEvaluationBenchmarkSeries([bundle], {
      freshness: { asOf: generatedAt, maximumAgeMs: 30 * 24 * 60 * 60 * 1_000 },
    });
    const deniedCandidate = series.candidates.find((candidate) => candidate.providerId === deniedLane.provider);
    if (!deniedCandidate) throw new Error("Denied candidate required");
    expect(deniedCandidate.eligible).toBe(false);
    expect(deniedCandidate.exclusions).toContainEqual(expect.objectContaining({ code: "failed-run", scope: "both" }));
    expect(deniedCandidate.measurements.find((metric) => metric.metricId === "request-success")).toMatchObject({
      value: null,
      unit: "unavailable",
      availability: "unavailable",
      provenance: { clock: "not-applicable", observation: "unavailable" },
    });

    const snapshot = buildMetricLeaderboard([deniedCandidate], scoringProfile({
      metricId: "request-success",
      metricVersion: "one-tts-metrics/1.0.0",
      unit: "boolean",
      minimumSampleCount: 1,
      direction: "higher-is-better",
      measurementScope: {
        source: "one-observed",
        measurementPoint: "one-server",
        clock: "server-monotonic",
        observation: "observed",
        method: "one-evaluation-evidence-adapter",
        sourceSchemaVersion: "one-tts-metrics/1.0.0",
      },
    }), { generatedAt });
    expect(snapshot.entries[0]).toMatchObject({ status: "excluded", value: null, sampleCount: 0 });
    expect(snapshot.includedResultIds).toEqual([]);
  });

  test("segments aggregation by material case/environment dimensions and builds from validated observations", async () => {
    const firstRequest = fixtureRequest();
    const secondRequest = fixtureRequest();
    secondRequest.evaluationId = "00000000-0000-4000-8000-000000000021";
    secondRequest.runId = "00000000-0000-4000-8000-000000000022";
    const first = await executeEvaluationRun(firstRequest, { emit: () => undefined });
    const second = await executeEvaluationRun(secondRequest, { emit: () => undefined });
    const oneAtomicObservation = await aggregateEvaluationBenchmarkSeries([first]);
    expect(oneAtomicObservation.results).toHaveLength(1);
    expect(oneAtomicObservation.candidates.map((candidate) => candidate.providerId).sort()).toEqual(PROVIDER_REGISTRY.map((provider) => provider.id).sort());
    const series = await aggregateEvaluationBenchmarkSeries([first, second]);
    expect(series.candidates).toHaveLength(PROVIDER_REGISTRY.length);
    expect(series.candidates.every((entry) => entry.measurements.filter((metric) => metric.metricId === "request-success").length === 2)).toBe(true);

    const changedScenario = structuredClone(second);
    changedScenario.scenario.id = "other-case";
    const segmented = await aggregateEvaluationBenchmarkSeries([first, changedScenario]);
    expect(segmented.candidates).toHaveLength(PROVIDER_REGISTRY.length * 2);

    const seriesProfile = scoringProfile({
      metricId: "request-success",
      metricVersion: "one-tts-metrics/1.0.0",
      unit: "boolean",
      minimumSampleCount: 2,
      allowSynthetic: true,
    });
    await expect(buildEvaluationEvidenceLeaderboard([first, changedScenario], seriesProfile)).rejects.toThrow(/one exact suite, case, input/i);
    const snapshot = await buildEvaluationEvidenceLeaderboard([first, second], seriesProfile, { snapshotId: "leaderboard/validated-fixture-series", generatedAt: OBSERVED_AT });
    expect(snapshot.entries.every((entry) => entry.status === "excluded" && entry.rank === null)).toBe(true);
    expect(snapshot.publicEligibility).toBe(false);
    expect(snapshot.providerSnapshots.every((entry) => entry.metadata.displayName.length > 0 && entry.metadata.adapterVersion.length > 0)).toBe(true);
  });

  test("derives a deterministic neutral preview from the canonical provider registry", () => {
    const first = createFixtureLeaderboardPreview();
    const second = createFixtureLeaderboardPreview();
    expect(first).toEqual(second);
    expect(() => benchmarkLeaderboardSnapshotSchema.parse(first)).not.toThrow();
    expect(first.entries.map((entry) => entry.providerId).sort()).toEqual(PROVIDER_REGISTRY.map((provider) => provider.id).sort());
    expect(first.entries.every((entry) => entry.rank === 1 && entry.tied)).toBe(true);
    expect(first.entries.every((entry) => entry.metadata.deployment === "local-deterministic-fixture" && entry.metadata.freshness.status === "fixture-only")).toBe(true);
    expect(first.methodologyVersion).toBe("1.0.0");
    expect(first.comparablePopulation).toMatchObject({ category: "tts", methodologyRef: { id: "one-tts-identical-script", version: "1.0.0" }, language: "und" });
    expect(first.publicEligibility).toBe(false);

    const tooManyFilters = structuredClone(first);
    tooManyFilters.filters = Object.fromEntries(Array.from({ length: 129 }, (_, index) => [`filter${index}`, true]));
    expect(benchmarkLeaderboardSnapshotSchema.safeParse(tooManyFilters).success).toBe(false);
    const oversizedFilters = structuredClone(first);
    oversizedFilters.filters = Object.fromEntries(Array.from({ length: 70 }, (_, index) => [`filter${index}`, "x".repeat(500)]));
    expect(benchmarkLeaderboardSnapshotSchema.safeParse(oversizedFilters).success).toBe(false);
    const unsafeNumericFilter = structuredClone(first);
    unsafeNumericFilter.filters = { threshold: 1e-7 };
    expect(benchmarkLeaderboardSnapshotSchema.safeParse(unsafeNumericFilter).success).toBe(false);

    const contradictoryProviderSnapshot = structuredClone(first);
    contradictoryProviderSnapshot.providerSnapshots[0].metadata.displayName = "Contradictory provider label";
    expect(benchmarkLeaderboardSnapshotSchema.safeParse(contradictoryProviderSnapshot).success).toBe(false);
    const contradictoryPopulation = structuredClone(first);
    contradictoryPopulation.entries[0].metadata.comparablePopulation.language = "fr-FR";
    expect(benchmarkLeaderboardSnapshotSchema.safeParse(contradictoryPopulation).success).toBe(false);
    const contradictoryMetric = structuredClone(first);
    contradictoryMetric.entries[0].metricId = "different-metric";
    expect(benchmarkLeaderboardSnapshotSchema.safeParse(contradictoryMetric).success).toBe(false);
    const contradictoryUnit = structuredClone(first);
    contradictoryUnit.entries[0].unit = "milliseconds";
    expect(benchmarkLeaderboardSnapshotSchema.safeParse(contradictoryUnit).success).toBe(false);
  });

  test("enforces amplification bounds, paid confirmation, default-off live, and injected future provider metadata", () => {
    const fixturePlan = planInput({ caseCount: 2, laneCount: 4, repetitions: 5 });
    expect(benchmarkPlanSchema.parse(fixturePlan).providers).toHaveLength(4);
    const sttBase = planInput({ caseCount: 1, laneCount: 1, repetitions: 1 });
    const sttPlan = { ...sttBase, category: "stt" as const, providers: [{ ...sttBase.providers[0], voiceId: null }] };
    expect(benchmarkPlanSchema.safeParse(sttPlan).success).toBe(true);
    expect(benchmarkPlanSchema.safeParse({ ...sttPlan, category: "tts" }).success).toBe(false);
    expect(planBenchmark(sttPlan)).toMatchObject({
      status: "blocked",
      executionBoundary: "unavailable",
      requiresPaidProviderCalls: false,
      reasons: [{ code: "category-execution-unavailable" }],
    });
    expect(planBenchmark(fixturePlan)).toMatchObject({ status: "ready", totalAttempts: 40, maximumAttempts: 40, requiresPaidProviderCalls: false });
    expect(planBenchmark(planInput({ caseCount: 2, laneCount: 4, repetitions: 6 })).status).toBe("rejected");

    const livePlan = planInput({ caseCount: 1, laneCount: 4, repetitions: 3, executionMode: "protected-live", confirmedPaidCalls: true });
    expect(planBenchmark(livePlan)).toMatchObject({ status: "blocked", totalAttempts: 12, maximumAttempts: 12, liveExecutionEnabled: false });
    expect(planBenchmark(livePlan, { liveExecutionEnabled: true }).status).toBe("ready");
    expect(planBenchmark(planInput({ caseCount: 1, laneCount: 4, repetitions: 4, executionMode: "protected-live", confirmedPaidCalls: true })).status).toBe("rejected");
    expect(planBenchmark(planInput({ caseCount: 1, laneCount: 1, repetitions: 1, executionMode: "protected-live", confirmedPaidCalls: false })).status).toBe("rejected");

    const repeatedProvider = planInput({ caseCount: 1, laneCount: 2, repetitions: 1 });
    repeatedProvider.providers[1] = { ...repeatedProvider.providers[0], modelId: "second-model" };
    expect(benchmarkPlanSchema.safeParse(repeatedProvider).success).toBe(true);
    repeatedProvider.providers[1] = { ...repeatedProvider.providers[0] };
    expect(benchmarkPlanSchema.safeParse(repeatedProvider).success).toBe(false);
    const secretPlan = planInput({ caseCount: 1, laneCount: 1, repetitions: 1 });
    secretPlan.providers[0].configuration = { apiKey: "must-never-enter-benchmark-evidence" };
    expect(benchmarkPlanSchema.safeParse(secretPlan).success).toBe(false);

    const futurePlan = planInput({ caseCount: 1, laneCount: 1, repetitions: 1 });
    futurePlan.providers[0] = { providerId: "future-provider", modelId: "future-model", voiceId: "future-voice", configuration: {} };
    expect(planBenchmark(futurePlan).status).toBe("blocked");
    expect(planBenchmark(futurePlan, { providerCatalog: [{ providerId: "future-provider", listed: true, fixtureAvailable: true, adapterBacked: false, liveEnabled: false }] }).status).toBe("ready");
    const futureLivePlan = { ...futurePlan, executionMode: "protected-live" as const, confirmedPaidCalls: true };
    expect(planBenchmark(futureLivePlan, {
      liveExecutionEnabled: true,
      providerCatalog: [{ providerId: "future-provider", listed: true, fixtureAvailable: true, adapterBacked: true, liveEnabled: true }],
    })).toMatchObject({ status: "blocked", reasons: [{ code: "provider-live-unavailable" }] });
  });
});

function scoringProfile(overrides: Partial<BenchmarkMetricScoringProfile> = {}): BenchmarkMetricScoringProfile {
  return {
    schemaVersion: "one-benchmark-scoring-profile/1.0.0",
    profileId: "test-objective-metric",
    version: "1.0.0",
    category: "tts",
    metricId: "objective-metric",
    metricVersion: "metric/1.0.0",
    unit: "milliseconds",
    measurementScope: {
      source: "one-observed",
      measurementPoint: "one-server",
      clock: "server-monotonic",
      observation: "observed",
      method: "test-method",
      sourceSchemaVersion: "test-source/1.0.0",
    },
    statistic: "mean",
    direction: "higher-is-better",
    minimumSampleCount: 1,
    decimalPlaces: 3,
    allowSynthetic: false,
    compositeScoreAllowed: false,
    ...overrides,
  };
}

function measurement(providerId: string, value: number, measurementId = `m/${providerId}/${value}`): BenchmarkMeasurement {
  return {
    schemaVersion: BENCHMARK_MEASUREMENT_VERSION,
    evidenceCategory: "objective",
    measurementId,
    runId: "00000000-0000-4000-8000-000000000201",
    providerId,
    model: "test-model",
    voice: "test-voice",
    configurationHash: CONFIGURATION_HASH,
    metricId: "objective-metric",
    metricVersion: "metric/1.0.0",
    value,
    unit: "milliseconds",
    availability: "measured",
    synthetic: false,
    measuredAt: OBSERVED_AT,
    method: "test-method",
    precision: 0.001,
    sampleCount: 1,
    source: "one-observed",
    confidence: null,
    provenance: {
      measurementPoint: "one-server",
      clock: "server-monotonic",
      observation: "observed",
      description: "Synthetic unit-test observation with no provider call.",
      sourceSchemaVersion: "test-source/1.0.0",
    },
  };
}

function candidate(providerId: string, values: readonly number[], overrides: Partial<BenchmarkRankingCandidate> = {}): BenchmarkRankingCandidate {
  const measurements = values.map((value, index) => measurement(providerId, value, `measurement/${providerId}/${index}`));
  return {
    candidateId: `candidate/${providerId}`,
    providerId,
    sources: [{
      resultId: `benchmark-result/${providerId}`,
      runId: "00000000-0000-4000-8000-000000000201",
      measurementIds: measurements.map((item) => item.measurementId),
    }],
    metadata: {
      modelId: "test-model",
      voiceId: "test-voice",
      configurationHash: CONFIGURATION_HASH,
      modality: "tts",
      deployment: "unit-test",
      evidenceClass: "objective",
      providerSnapshot: {
        displayName: providerId,
        readiness: "adapter-backed",
        adapterVersion: "test-adapter/1.0.0",
        modelVersion: "1.0.0",
        capability: "tts",
      },
      sponsorshipDisclosures: [],
      comparablePopulation: {
        category: "tts",
        suiteRef: { id: "test-suite", version: "1.0.0" },
        caseRef: { id: "test-case", version: "1.0.0", inputHash: INPUT_HASH },
        methodologyRef: { id: "test-methodology", version: "1.0.0" },
        methodologyVersion: "1.0.0",
        metricVersion: "metric/1.0.0",
        executionMode: "local-live",
        evaluationMode: "standardized",
        environment: "unit-test",
        deployment: "unit-test",
        language: "en-US",
        region: null,
        transport: "local-memory",
        codec: "audio/wav",
        sampleRateHz: 24_000,
        channels: 1,
        thermalState: "unknown",
      },
      freshness: { observedAt: OBSERVED_AT, status: "current" },
      publicEligibility: false,
    },
    measurements,
    eligible: true,
    exclusions: [],
    ...overrides,
  };
}

function fixtureRequest(): EvaluationRunRequest {
  const providers: ProviderId[] = ["deepgram", "elevenlabs", "fish-audio", "cartesia"];
  const text = "ONE exact fixture benchmark text.";
  return evaluationRunRequestSchema.parse({
    schemaVersion: "one-voice-evidence/1.0.0",
    evaluationId: "00000000-0000-4000-8000-000000000001",
    runId: "00000000-0000-4000-8000-000000000002",
    scenario: { id: "custom-fixture", version: "1.0.0", source: "custom", presetId: null, inputType: "text", text, inputHash: hashEvaluationText(text) },
    evaluationMode: "standardized",
    executionMode: "fixture",
    providers: providers.map((providerId) => ({
      providerId,
      model: `fixture-${providerId}-tts-v1`,
      voice: `fixture-${providerId}-voice-v1`,
      outputFormat: "fixture-wav",
      providerSpecificConfiguration: {},
    })),
    blind: { enabled: true, seed: "benchmark-engine-test" },
    confirmedPaidCalls: false,
  });
}

function planInput(input: Readonly<{
  caseCount: number;
  laneCount: number;
  repetitions: number;
  executionMode?: "fixture" | "protected-live" | "local-live";
  confirmedPaidCalls?: boolean;
}>) {
  return {
    schemaVersion: BENCHMARK_PLAN_VERSION,
    planId: "benchmark-plan/test",
    category: "tts" as const,
    methodology: { id: "one-tts-identical-script", version: "1.0.0" },
    executionMode: input.executionMode ?? "fixture",
    cases: Array.from({ length: input.caseCount }, (_, index) => ({ id: `case-${index + 1}`, version: "1.0.0" })),
    providers: PROVIDER_REGISTRY.slice(0, input.laneCount).map((provider) => ({
      providerId: provider.id as string,
      modelId: `model-${provider.id}`,
      voiceId: `voice-${provider.id}`,
      configuration: {},
    })),
    repetitions: input.repetitions,
    confirmedPaidCalls: input.confirmedPaidCalls ?? false,
  };
}
