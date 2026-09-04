import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { benchmarkCategoryCatalog, benchmarkMethodologyCatalog } from "@/lib/evaluation/benchmark-catalog";
import { createFixtureLeaderboardPreview } from "@/lib/evaluation/benchmark-engine";
import { formatBenchmarkMetric } from "@/components/evaluate/BenchmarkWorkspace";
import {
  BENCHMARK_METHODOLOGY_VERSION,
  BENCHMARK_SCHEMA_VERSION,
  benchmarkLeaderboardSnapshotSchema,
} from "@/lib/evaluation/benchmark-schema";

test.describe("Stage 3 benchmark preview UI", () => {
  test("uses the canonical deterministic snapshot without making a quality claim", () => {
    const first = benchmarkLeaderboardSnapshotSchema.parse(createFixtureLeaderboardPreview());
    const second = benchmarkLeaderboardSnapshotSchema.parse(createFixtureLeaderboardPreview());

    expect(second).toEqual(first);
    expect(first.publicEligibility).toBe(false);
    expect(first.compositeScoreProvided).toBe(false);
    expect(first.entries.length).toBeGreaterThanOrEqual(2);
    expect(new Set(first.entries.map((entry) => entry.rank))).toEqual(new Set([1]));
    expect(first.entries.every((entry) => entry.tied)).toBe(true);
    expect(first.entries.every((entry) => entry.metadata.publicEligibility === false)).toBe(true);
    expect(first.entries.every((entry) => entry.metadata.evidenceClass === "objective")).toBe(true);
    expect(first.entries.every((entry) => entry.metadata.modelId.length > 0)).toBe(true);
  });

  test("draws filter values from canonical catalogs and fixture metadata", () => {
    const snapshot = benchmarkLeaderboardSnapshotSchema.parse(createFixtureLeaderboardPreview());

    expect(benchmarkCategoryCatalog.some((category) => category.id === snapshot.category)).toBe(true);
    expect(benchmarkMethodologyCatalog.some((methodology) => methodology.category === snapshot.category)).toBe(true);
    expect(BENCHMARK_SCHEMA_VERSION).toBe("one-benchmark/1.0.0");
    expect(BENCHMARK_METHODOLOGY_VERSION).toBe("one-benchmark-methodology/1.0.0");
  });

  test("formats leaderboard values with the scoring profile precision", () => {
    expect(formatBenchmarkMetric(1.23456, "milliseconds", 4)).toBe("1.2346 milliseconds");
    expect(formatBenchmarkMetric(1, "ratio", 3)).toBe("1.000 ratio");
    expect(formatBenchmarkMetric(0.0000000049, "seconds", 9)).toBe("0.000000005 seconds");
    expect(formatBenchmarkMetric(null, "seconds", 4)).toBe("Unavailable");
  });

  test("keeps the benchmark surface explicit, accessible, and provider neutral", () => {
    const component = read("src/components/evaluate/BenchmarkWorkspace.tsx");
    const page = read("src/app/evaluate/page.tsx");
    const styles = read("src/app/globals.css");
    const benchmarkStyles = styles
      .split("/* Stage 3 deterministic benchmark preview */")[1]
      ?.split("/* Pocket API Lab Field Widget */")[0] ?? "";

    expect(page.indexOf("<EvaluateWorkspace />")).toBeLessThan(page.indexOf("<BenchmarkWorkspace />"));
    expect(component).toContain("Fixture-only");
    expect(component).toContain("Nonbillable");
    expect(component).toContain("Synthetic evidence");
    expect(component).toContain("Non-public preview");
    expect(component).toContain("Why ranked here?");
    expect(component).toContain("Language or locale");
    expect(component).toContain("Scoring profile");
    expect(component).toContain("Configuration hash");
    expect(component).toContain("Input hash");
    expect(component).toContain("Runtime environment");
    expect(component).toContain("Measurement provenance");
    expect(component).toContain("Visibility");
    expect(component).toContain("Publication");
    expect(component).toContain("Signature status");
    expect(component).toContain("providerSnapshot.displayName");
    expect(component).toContain("Sponsorship never changes rank or defaults");
    expect(component).toContain('useRegisterVoiceLabAction("benchmark.fixtureLeaderboard"');
    expect(component).toContain('dispatch("benchmark.fixtureLeaderboard"');
    expect(component).toContain('data-voice-action="benchmark.fixtureLeaderboard"');
    expect(component).toContain("Objective measurements");
    expect(component).toContain("Human judgments");
    expect(component).toContain("Automated judgments");
    expect(component).toContain("No composite score is produced");
    expect(component).toContain("Benchmark setup");
    expect(component).toContain("Validate and materialize fixture");
    expect(component).toContain("Canonical result detail");
    expect(component).toContain("Inspect objective measurement evidence");
    expect(component).toContain("Estimated cost evidence");
    expect(component).toContain("None recorded · separate evidence class");
    expect(component).toContain("None produced · reserved evidence boundary");
    expect(component).toContain("No signature attached");
    expect(component).toContain("Integrity digest");
    expect(component).toContain("Canonicalization");
    expect(component).toContain("Measurement point");
    expect(component).toContain("Source schema");
    expect(component).toContain("Protected live · disabled in Stage 3");
    expect(component).toContain("Public candidate · fixture ineligible");
    expect(component).toContain('useRegisterVoiceLabAction("benchmark.plan"');
    expect(component).toContain('useRegisterVoiceLabAction("benchmark.runFixture"');
    expect(component).toContain('dispatch("benchmark.plan"');
    expect(component).toContain('dispatch("benchmark.runFixture"');
    expect(component).toContain("runFixtureBenchmarkPlan");
    expect(component).not.toContain('useRegisterVoiceLabAction("benchmark.materializeEvaluation"');
    expect(component).not.toContain('dispatch("benchmark.materializeEvaluation"');
    expect(component).not.toContain("createDeterministicFixtureWav");
    expect(component).not.toContain("createCanonicalFixtureBundle");
    expect(component).not.toContain("fixtureMetrics");
    expect(component).not.toContain("EvaluationEvidenceBundle");
    expect(component).toContain("<dl className=\"benchmark-card__metrics\">");
    expect(component).not.toMatch(/api\.(?:deepgram|elevenlabs|fish\.audio|cartesia)|fetch\(|runEvaluation|localStorage|sessionStorage/);
    expect(benchmarkStyles).toContain("min-height: 2.75rem");
    expect(benchmarkStyles).toContain("overflow-wrap: anywhere");
    expect(benchmarkStyles).toContain("prefers-reduced-motion: reduce");
    expect(benchmarkStyles).not.toMatch(/position:\s*(?:fixed|sticky)/);
  });
});

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}
