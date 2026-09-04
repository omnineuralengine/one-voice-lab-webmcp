import { durationSecondsForWav } from "@/lib/evaluation/audio";
import { createBlindAssignments } from "@/lib/evaluation/blind";
import {
  BENCHMARK_FIXTURE_CONFIGURATION,
  BENCHMARK_FIXTURE_CONFIGURATION_HASH,
  BENCHMARK_FIXTURE_EVALUATION_ID,
  BENCHMARK_FIXTURE_METHODOLOGY_ID,
  BENCHMARK_FIXTURE_METHODOLOGY_VERSION,
  BENCHMARK_FIXTURE_SCENARIO_HASH,
  BENCHMARK_FIXTURE_SCENARIO_ID,
  BENCHMARK_FIXTURE_SCENARIO_TEXT,
  BENCHMARK_FIXTURE_SCENARIO_VERSION,
  BENCHMARK_FIXTURE_RUN_ID,
  BENCHMARK_FIXTURE_SEED,
  BENCHMARK_FIXTURE_TIMESTAMPS,
} from "@/lib/evaluation/benchmark-fixture-definition";
import {
  materializeEvaluationBenchmarkResults,
  planBenchmark,
  type BenchmarkPlanningProvider,
} from "@/lib/evaluation/benchmark-engine";
import { benchmarkPlanSchema, type BenchmarkResult } from "@/lib/evaluation/benchmark-schema";
import { createDeterministicFixtureWav, fixtureModelId, fixtureVoiceId } from "@/lib/evaluation/fixture";
import {
  EVALUATION_METRIC_VERSION,
  EVALUATION_METHODOLOGY_VERSION,
  EVALUATION_SCHEMA_VERSION,
  evaluationEvidenceBundleSchema,
  type EvaluationEvidenceBundle,
  type EvaluationMetric,
} from "@/lib/evaluation/schema";
import { providerIdSchema } from "@/lib/providers/types";

export type FixtureBenchmarkExecution = Readonly<{
  bundle: EvaluationEvidenceBundle;
  results: readonly BenchmarkResult[];
}>;

export async function runFixtureBenchmarkPlan(
  planInput: unknown,
  options: Readonly<{
    signal?: AbortSignal;
    providerCatalog?: readonly BenchmarkPlanningProvider[];
  }> = {},
): Promise<FixtureBenchmarkExecution> {
  assertNotCancelled(options.signal);
  const plan = benchmarkPlanSchema.parse(planInput);
  const decision = planBenchmark(plan, { providerCatalog: options.providerCatalog });
  if (decision.status !== "ready" || plan.executionMode !== "fixture" || plan.confirmedPaidCalls || decision.requiresPaidProviderCalls) {
    throw new Error(decision.reasons.map((reason) => reason.message).join(" ") || "Only a ready, nonbillable fixture benchmark plan can run here.");
  }
  if (plan.category !== "tts" || plan.cases.length !== 1 || plan.repetitions !== 1 || plan.providers.length < 2 || plan.providers.length > 4) {
    throw new Error("The local fixture action accepts exactly one TTS case, one repetition, and two to four exact provider lanes.");
  }
  const benchmarkCase = plan.cases[0];
  if (!benchmarkCase
    || benchmarkCase.id !== BENCHMARK_FIXTURE_SCENARIO_ID
    || benchmarkCase.version !== BENCHMARK_FIXTURE_SCENARIO_VERSION) {
    throw new Error(`The local fixture action requires ${BENCHMARK_FIXTURE_SCENARIO_ID}@${BENCHMARK_FIXTURE_SCENARIO_VERSION}.`);
  }
  if (plan.methodology.id !== BENCHMARK_FIXTURE_METHODOLOGY_ID
    || plan.methodology.version !== BENCHMARK_FIXTURE_METHODOLOGY_VERSION) {
    throw new Error(`The local fixture action requires ${BENCHMARK_FIXTURE_METHODOLOGY_ID}@${BENCHMARK_FIXTURE_METHODOLOGY_VERSION}.`);
  }

  await assertCanonicalFixtureDefinition();
  const providerIds = plan.providers.map((lane) => providerIdSchema.parse(lane.providerId));
  if (new Set(providerIds).size !== providerIds.length) {
    throw new Error("The local fixture action requires one exact lane for each distinct provider.");
  }
  const assignments = createBlindAssignments(providerIds, BENCHMARK_FIXTURE_SEED);
  for (const lane of plan.providers) {
    const providerId = providerIdSchema.parse(lane.providerId);
    if (lane.modelId !== fixtureModelId(providerId) || lane.voiceId !== fixtureVoiceId(providerId)) {
      throw new Error(`${providerId} must use the exact deterministic fixture model and voice.`);
    }
    if (await sha256Json(lane.configuration) !== BENCHMARK_FIXTURE_CONFIGURATION_HASH) {
      throw new Error(`${providerId} must use the canonical deterministic fixture configuration.`);
    }
  }

  const fixtureAudio = createDeterministicFixtureWav();
  const durationSeconds = durationSecondsForWav(fixtureAudio);
  if (durationSeconds === null) throw new Error("The repository fixture audio could not be verified.");
  const audioHash = await sha256(fixtureAudio);
  assertNotCancelled(options.signal);

  const firstAudioMs = 1;
  const totalMs = 2;
  const bundle = evaluationEvidenceBundleSchema.parse({
    schemaVersion: EVALUATION_SCHEMA_VERSION,
    methodologyVersion: EVALUATION_METHODOLOGY_VERSION,
    exportedAt: BENCHMARK_FIXTURE_TIMESTAMPS.exported,
    evaluationId: BENCHMARK_FIXTURE_EVALUATION_ID,
    runId: BENCHMARK_FIXTURE_RUN_ID,
    scenario: {
      id: benchmarkCase.id,
      version: benchmarkCase.version,
      source: "custom",
      presetId: null,
      inputType: "text",
      text: BENCHMARK_FIXTURE_SCENARIO_TEXT,
      inputHash: BENCHMARK_FIXTURE_SCENARIO_HASH,
    },
    evaluationMode: "standardized",
    blind: { enabled: false, seed: BENCHMARK_FIXTURE_SEED, revealed: false, revealedAt: null },
    providerResults: plan.providers.map((lane) => {
      const providerId = providerIdSchema.parse(lane.providerId);
      const blindLabel = assignments[providerId];
      if (!blindLabel || lane.voiceId === null) throw new Error(`The fixture could not construct the exact ${providerId} lane.`);
      return {
        runId: BENCHMARK_FIXTURE_RUN_ID,
        provider: providerId,
        blindLabel,
        model: lane.modelId,
        voice: lane.voiceId,
        providerSpecificConfiguration: BENCHMARK_FIXTURE_CONFIGURATION,
        adapterVersion: "one-deterministic-fixture/1.0.0",
        environment: "fixture" as const,
        region: null,
        regionScope: null,
        requestTimestamp: BENCHMARK_FIXTURE_TIMESTAMPS.request,
        firstAudioTimestamp: BENCHMARK_FIXTURE_TIMESTAMPS.firstAudio,
        completionTimestamp: BENCHMARK_FIXTURE_TIMESTAMPS.completion,
        clientPlayableTimestamp: null,
        metrics: fixtureMetrics(firstAudioMs, totalMs, durationSeconds),
        audio: {
          mimeType: "audio/wav",
          durationSeconds,
          storageReference: `ephemeral:${BENCHMARK_FIXTURE_RUN_ID}:${providerId}`,
          contentHash: audioHash,
          rawContentHash: audioHash,
          normalized: true,
        },
        status: "complete" as const,
        trace: [
          { type: "validation-start" as const, timestamp: BENCHMARK_FIXTURE_TIMESTAMPS.request, offsetMs: 0, observation: "observed" as const, detail: "ONE validated the exact local fixture lane." },
          { type: "provider-request-start" as const, timestamp: BENCHMARK_FIXTURE_TIMESTAMPS.request, offsetMs: 0, observation: "observed" as const, detail: "ONE started deterministic local fixture generation; no provider was called." },
          { type: "first-audio-chunk" as const, timestamp: BENCHMARK_FIXTURE_TIMESTAMPS.firstAudio, offsetMs: firstAudioMs, observation: "observed" as const, detail: "The deterministic local WAV fixture became available in memory." },
          { type: "completion" as const, timestamp: BENCHMARK_FIXTURE_TIMESTAMPS.completion, offsetMs: totalMs, observation: "observed" as const, detail: "ONE completed local fixture generation without provider traffic." },
        ],
        sanitizedError: null,
        humanRating: emptyHumanRating(),
        sponsorshipDisclosure: null,
      };
    }),
    evidenceCategories: { measured: true, humanRated: false, modelJudged: false },
    modelJudgeResults: null,
    visibility: "private",
    consent: { publication: false, publicEvidencePool: false },
    retention: { mode: "ephemeral", audioEmbedded: false, rawProviderPayloadsEmbedded: false },
    sponsorshipDisclosure: null,
    limitations: [
      "Deterministic fixture audio validates interaction behavior only; it is identical across providers and is not provider speech or latency evidence.",
      "The materialized result remains private, ephemeral, synthetic, and ineligible for public ranking or publication.",
    ],
  });
  const results = await materializeEvaluationBenchmarkResults(bundle);
  if (results.some((result) => result.run.participants.some((participant) => participant.configurationHash !== BENCHMARK_FIXTURE_CONFIGURATION_HASH))) {
    throw new Error("The materialized fixture configuration digest does not match the canonical fixture definition.");
  }
  assertNotCancelled(options.signal);
  return Object.freeze({ bundle, results: Object.freeze([...results]) });
}

async function assertCanonicalFixtureDefinition() {
  const [configurationHash, scenarioHash] = await Promise.all([
    sha256Json(BENCHMARK_FIXTURE_CONFIGURATION),
    sha256(new TextEncoder().encode(BENCHMARK_FIXTURE_SCENARIO_TEXT)),
  ]);
  if (configurationHash !== BENCHMARK_FIXTURE_CONFIGURATION_HASH || scenarioHash !== BENCHMARK_FIXTURE_SCENARIO_HASH) {
    throw new Error("The canonical fixture definition and its attributed digest no longer agree.");
  }
}

function fixtureMetrics(firstAudioMs: number, totalMs: number, durationSeconds: number): EvaluationMetric[] {
  return [
    fixtureMetric("server_time_to_first_audio_chunk", firstAudioMs, "milliseconds", "measured", "one-server", "server-monotonic", "Elapsed during deterministic local fixture creation; this is not provider latency evidence."),
    fixtureMetric("time_to_first_audible_output", null, "unavailable", "unavailable", "one-browser", "not-applicable", "No audible-output timing is inferred for the setup fixture."),
    fixtureMetric("total_generation_time", totalMs, "milliseconds", "measured", "one-server", "server-monotonic", "Elapsed during deterministic local fixture creation; this is not provider generation evidence."),
    fixtureMetric("audio_duration", durationSeconds, "seconds", "measured", "derived", "server-monotonic", "Derived from the repository-owned deterministic WAV fixture."),
    fixtureMetric("real_time_factor", totalMs / 1_000 / durationSeconds, "ratio", "measured", "derived", "server-monotonic", "Local fixture creation seconds divided by verified fixture duration."),
    fixtureMetric("request_success", 1, "boolean", "measured", "one-server", "server-monotonic", "ONE completed the local fixture lane; no provider request occurred."),
    fixtureMetric("client_time_to_playable", null, "unavailable", "unavailable", "one-browser", "not-applicable", "Playback timing is not collected by this setup flow."),
    fixtureMetric("estimated_cost", null, "unavailable", "unavailable", "derived", "not-applicable", "Fixture execution is nonbillable."),
  ];
}

function fixtureMetric(
  name: EvaluationMetric["name"],
  value: number | null,
  unit: EvaluationMetric["unit"],
  availability: EvaluationMetric["availability"],
  measurementPoint: EvaluationMetric["measurementPoint"],
  clock: EvaluationMetric["provenance"]["clock"],
  description: string,
): EvaluationMetric {
  return { name, value, unit, availability, measurementPoint, metricVersion: EVALUATION_METRIC_VERSION, provenance: { clock, description } };
}

function emptyHumanRating() {
  return {
    naturalness: null,
    intelligibility: null,
    pronunciation: null,
    emotionalFit: null,
    useCaseFit: null,
    overallPreference: false,
    ratedAt: null,
    ratedBeforeReveal: null,
  };
}

async function sha256Json(value: Record<string, unknown>): Promise<`sha256:${string}`> {
  const canonical = JSON.stringify(Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]])));
  return sha256(new TextEncoder().encode(canonical));
}

async function sha256(bytes: Uint8Array): Promise<`sha256:${string}`> {
  const input = new Uint8Array(bytes.byteLength);
  input.set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", input.buffer);
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function assertNotCancelled(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw new DOMException("Fixture benchmark cancelled.", "AbortError");
}
