import { expect, test } from "@playwright/test";

import { createFixtureLeaderboardPreview } from "../../src/lib/evaluation/benchmark-engine";
import {
  BENCHMARK_FIXTURE_CONFIGURATION,
  BENCHMARK_FIXTURE_CONFIGURATION_HASH,
  BENCHMARK_FIXTURE_METHODOLOGY_ID,
  BENCHMARK_FIXTURE_METHODOLOGY_VERSION,
  BENCHMARK_FIXTURE_SCENARIO_ID,
  BENCHMARK_FIXTURE_SCENARIO_VERSION,
} from "../../src/lib/evaluation/benchmark-fixture-definition";
import { runFixtureBenchmarkPlan } from "../../src/lib/evaluation/benchmark-fixture";
import {
  BENCHMARK_PLAN_VERSION,
  benchmarkPlanSchema,
  type BenchmarkPlan,
} from "../../src/lib/evaluation/benchmark-schema";

test.describe("canonical fixture benchmark action service", () => {
  test("returns deterministic reproducible evidence without network or provider calls", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      throw new Error("Fixture benchmark execution must not call the network.");
    }) as typeof fetch;

    try {
      const plan = fixturePlan();
      const first = await runFixtureBenchmarkPlan(plan);
      const second = await runFixtureBenchmarkPlan(plan);

      expect(second).toEqual(first);
      expect(fetchCalls).toBe(0);
      expect(first.bundle.providerResults).toHaveLength(4);
      expect(first.bundle.providerResults.every((provider) => provider.environment === "fixture" && provider.status === "complete")).toBe(true);
      expect(first.results).toHaveLength(1);
      expect(first.results[0]).toMatchObject({
        status: "completed",
        visibility: "private",
        integrity: { state: "unsigned" },
        run: {
          executionMode: "fixture",
          runtime: { environment: "fixture", deployment: "local-deterministic-fixture" },
        },
      });
      expect(first.results[0].run.participants.every((participant) => participant.providerMetadataSnapshot.readiness !== "live-enabled")).toBe(true);
      expect(first.results[0].objectiveMeasurements.filter((measurement) => measurement.metricId === "estimated-cost"))
        .toHaveLength(4);
      expect(first.results[0].objectiveMeasurements.filter((measurement) => measurement.metricId === "estimated-cost")
        .every((measurement) => measurement.availability === "unavailable" && measurement.value === null)).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("uses one configuration definition for every preview and materialized lane", async () => {
    const preview = createFixtureLeaderboardPreview();
    const execution = await runFixtureBenchmarkPlan(fixturePlan());
    const result = execution.results[0];

    expect(result.run.participants).toHaveLength(preview.entries.length);
    for (const participant of result.run.participants) {
      const entry = preview.entries.find((candidate) => (
        candidate.providerId === participant.providerId
        && candidate.metadata.modelId === participant.modelId
        && candidate.metadata.voiceId === participant.voiceId
      ));
      expect(entry, `Missing preview lane for ${participant.providerId}`).toBeDefined();
      expect(entry?.metadata.configurationHash).toBe(BENCHMARK_FIXTURE_CONFIGURATION_HASH);
      expect(participant.configurationHash).toBe(BENCHMARK_FIXTURE_CONFIGURATION_HASH);
      expect(participant.configuration).toEqual(BENCHMARK_FIXTURE_CONFIGURATION);
    }
  });

  test("rejects non-canonical cases and methodology", async () => {
    const plan = fixturePlan();

    await expect(runFixtureBenchmarkPlan({
      ...plan,
      cases: [{ id: "other-fixture", version: BENCHMARK_FIXTURE_SCENARIO_VERSION }],
    })).rejects.toThrow(`${BENCHMARK_FIXTURE_SCENARIO_ID}@${BENCHMARK_FIXTURE_SCENARIO_VERSION}`);
    await expect(runFixtureBenchmarkPlan({
      ...plan,
      cases: [{ id: BENCHMARK_FIXTURE_SCENARIO_ID, version: "1.0.1" }],
    })).rejects.toThrow(`${BENCHMARK_FIXTURE_SCENARIO_ID}@${BENCHMARK_FIXTURE_SCENARIO_VERSION}`);
    await expect(runFixtureBenchmarkPlan({
      ...plan,
      methodology: { id: "other-methodology", version: BENCHMARK_FIXTURE_METHODOLOGY_VERSION },
    })).rejects.toThrow(`${BENCHMARK_FIXTURE_METHODOLOGY_ID}@${BENCHMARK_FIXTURE_METHODOLOGY_VERSION}`);
    await expect(runFixtureBenchmarkPlan({
      ...plan,
      methodology: { id: BENCHMARK_FIXTURE_METHODOLOGY_ID, version: "1.0.1" },
    })).rejects.toThrow(`${BENCHMARK_FIXTURE_METHODOLOGY_ID}@${BENCHMARK_FIXTURE_METHODOLOGY_VERSION}`);
  });

  test("rejects one-lane, altered-configuration, live, and cancelled plans", async () => {
    const plan = fixturePlan();

    await expect(runFixtureBenchmarkPlan({ ...plan, providers: plan.providers.slice(0, 1) }))
      .rejects.toThrow(/two to four exact provider lanes/i);
    await expect(runFixtureBenchmarkPlan({
      ...plan,
      providers: [plan.providers[0], { ...plan.providers[1], providerId: plan.providers[0].providerId, modelId: `${plan.providers[0].modelId}-duplicate` }],
    })).rejects.toThrow(/distinct provider/i);
    await expect(runFixtureBenchmarkPlan({
      ...plan,
      providers: [{ ...plan.providers[0], configuration: { ...BENCHMARK_FIXTURE_CONFIGURATION, sampleRate: 16_000 } }, ...plan.providers.slice(1)],
    })).rejects.toThrow(/canonical deterministic fixture configuration/i);
    await expect(runFixtureBenchmarkPlan({ ...plan, executionMode: "protected-live", confirmedPaidCalls: true }))
      .rejects.toThrow(/live benchmark planning is disabled/i);
    await expect(runFixtureBenchmarkPlan({ ...plan, confirmedPaidCalls: true }))
      .rejects.toThrow(/only a ready, nonbillable fixture benchmark plan/i);

    const controller = new AbortController();
    controller.abort();
    await expect(runFixtureBenchmarkPlan(plan, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});

function fixturePlan(providerCount = 4): BenchmarkPlan {
  const entries = createFixtureLeaderboardPreview().entries.slice(0, providerCount);
  return benchmarkPlanSchema.parse({
    schemaVersion: BENCHMARK_PLAN_VERSION,
    planId: "benchmark-plan/unit-fixture",
    category: "tts",
    methodology: { id: BENCHMARK_FIXTURE_METHODOLOGY_ID, version: BENCHMARK_FIXTURE_METHODOLOGY_VERSION },
    executionMode: "fixture",
    cases: [{ id: BENCHMARK_FIXTURE_SCENARIO_ID, version: BENCHMARK_FIXTURE_SCENARIO_VERSION }],
    providers: entries.map((entry) => ({
      providerId: entry.providerId,
      modelId: entry.metadata.modelId,
      voiceId: entry.metadata.voiceId,
      configuration: BENCHMARK_FIXTURE_CONFIGURATION,
    })),
    repetitions: 1,
    confirmedPaidCalls: false,
  });
}
