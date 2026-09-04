import {
  benchmarkStatisticsSchema,
  type BenchmarkStatistics,
} from "@/lib/evaluation/benchmark-schema";

const MEDIAN_MINIMUM_SAMPLES = 3;
const P95_MINIMUM_SAMPLES = 20;

function available(value: number, minimumSamples = 1) {
  return { availability: "available" as const, value: Object.is(value, -0) ? 0 : value, minimumSamples };
}

function insufficient(minimumSamples: number) {
  return { availability: "insufficient-samples" as const, value: null, minimumSamples };
}

export function summarizeBenchmarkSamples(values: readonly number[]): BenchmarkStatistics {
  if (!values.every(Number.isFinite)) {
    throw new TypeError("Benchmark samples must contain only finite numbers.");
  }

  const ordered = [...values].sort((left, right) => left - right);
  const sampleCount = ordered.length;
  if (sampleCount === 0) {
    return benchmarkStatisticsSchema.parse({
      sampleCount,
      minimum: insufficient(1),
      maximum: insufficient(1),
      mean: insufficient(1),
      standardDeviation: insufficient(1),
      median: insufficient(MEDIAN_MINIMUM_SAMPLES),
      p95: insufficient(P95_MINIMUM_SAMPLES),
      standardDeviationMethod: "population",
    });
  }

  const mean = ordered.reduce((sum, value) => sum + value, 0) / sampleCount;
  const variance = ordered.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / sampleCount;
  const middle = Math.floor(sampleCount / 2);
  const median = sampleCount % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
  const p95Index = Math.max(0, Math.ceil(sampleCount * 0.95) - 1);

  return benchmarkStatisticsSchema.parse({
    sampleCount,
    minimum: available(ordered[0]),
    maximum: available(ordered[sampleCount - 1]),
    mean: available(mean),
    standardDeviation: available(Math.sqrt(variance)),
    median: sampleCount >= MEDIAN_MINIMUM_SAMPLES ? available(median, MEDIAN_MINIMUM_SAMPLES) : insufficient(MEDIAN_MINIMUM_SAMPLES),
    p95: sampleCount >= P95_MINIMUM_SAMPLES ? available(ordered[p95Index], P95_MINIMUM_SAMPLES) : insufficient(P95_MINIMUM_SAMPLES),
    standardDeviationMethod: "population",
  });
}
