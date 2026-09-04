export const BENCHMARK_FIXTURE_CONFIGURATION = Object.freeze({
  comparisonMode: "fixture",
  fixture: "neutral-interaction-tone",
  outputFormat: "fixture-wav",
  encoding: "pcm_s16le",
  sampleRate: 24_000,
  channels: 1,
});

export const BENCHMARK_FIXTURE_CONFIGURATION_HASH = "sha256:18ca70f0e7361d9d63897e69cdae07b386d6df994748ce169d2200d8db2b26ab" as const;
export const BENCHMARK_FIXTURE_SCENARIO_ID = "benchmark-fixture" as const;
export const BENCHMARK_FIXTURE_SCENARIO_VERSION = "1.0.0" as const;
export const BENCHMARK_FIXTURE_SCENARIO_TEXT = "ONE exact local fixture benchmark. No provider is contacted.";
export const BENCHMARK_FIXTURE_SCENARIO_HASH = "sha256:9f2e37000331808e54bd06f1cf5171922568bfee2de6fc47c56a38eabfafd8b3" as const;
export const BENCHMARK_FIXTURE_METHODOLOGY_ID = "one-tts-identical-script" as const;
export const BENCHMARK_FIXTURE_METHODOLOGY_VERSION = "1.0.0" as const;
export const BENCHMARK_FIXTURE_SEED = "one-stage-3-benchmark-fixture" as const;
export const BENCHMARK_FIXTURE_EVALUATION_ID = "00000000-0000-4000-8000-000000000031" as const;
export const BENCHMARK_FIXTURE_RUN_ID = "00000000-0000-4000-8000-000000000032" as const;
export const BENCHMARK_FIXTURE_TIMESTAMPS = Object.freeze({
  request: "2026-08-27T00:00:00.001Z",
  firstAudio: "2026-08-27T00:00:00.002Z",
  completion: "2026-08-27T00:00:00.003Z",
  exported: "2026-08-27T00:00:00.004Z",
});
