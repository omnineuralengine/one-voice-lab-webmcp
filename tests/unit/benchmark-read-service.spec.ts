import { expect, test } from "@playwright/test";

import {
  listBenchmarkLeaderboardSnapshots,
  retrieveBenchmarkResult,
  type BenchmarkReadRepository,
} from "../../src/lib/evaluation/benchmark-read-service";
import {
  BENCHMARK_PRIVATE_RESULT_PROJECTION_VERSION,
  BENCHMARK_PUBLIC_LIST_VERSION,
} from "../../src/lib/evaluation/benchmark-read-schema";

const RUN_ID = "00000000-0000-4000-8000-000000000501";
const INTERNAL_RUN_ID = "00000000-0000-4000-8000-000000000502";
const OUTPUT_ID = "00000000-0000-4000-8000-000000000503";
const SNAPSHOT_ID = "00000000-0000-4000-8000-000000000504";
const HASH = `sha256:${"a".repeat(64)}`;
const AT = "2026-08-27T16:00:00.000Z";

test.describe("benchmark repository read service", () => {
  test("requires an authenticated principal and carries the server guard into the owner-authorized read", async () => {
    let receivedGuard = "";
    const repository = repositoryStub({
      async readPrivateResult(runId, principal) {
        expect(runId).toBe(RUN_ID);
        receivedGuard = principal.guardToken;
        return privateProjection();
      },
    });
    await expect(retrieveBenchmarkResult({ runId: RUN_ID }, { repository, principal: null }))
      .rejects.toMatchObject({ code: "authentication_required" });
    const response = await retrieveBenchmarkResult(
      { runId: RUN_ID },
      { repository, principal: { userId: "00000000-0000-4000-8000-000000000505", guardToken: "server-guard" } },
    );
    expect(receivedGuard).toBe("server-guard");
    expect(response.result?.run.runId).toBe(RUN_ID);
  });

  test("preserves a non-disclosing null and rejects malformed repository projections", async () => {
    const principal = { userId: "00000000-0000-4000-8000-000000000505", guardToken: "server-guard" };
    await expect(retrieveBenchmarkResult({ runId: RUN_ID }, { repository: repositoryStub({ readPrivateResult: async () => null }), principal }))
      .resolves.toEqual({ result: null });
    await expect(retrieveBenchmarkResult({ runId: RUN_ID }, { repository: repositoryStub({ readPrivateResult: async () => ({ schemaVersion: "wrong" }) }), principal }))
      .rejects.toMatchObject({ code: "invalid_projection" });
  });

  test("validates bounded public keyset inputs and exact public list projections", async () => {
    let receivedLimit = 0;
    const repository = repositoryStub({
      async listPublicSnapshots(input) {
        receivedLimit = input.limit;
        return publicListProjection();
      },
    });
    await expect(listBenchmarkLeaderboardSnapshots({ limit: 51 }, { repository }))
      .rejects.toMatchObject({ code: "invalid_request" });
    const result = await listBenchmarkLeaderboardSnapshots({}, { repository });
    expect(receivedLimit).toBe(20);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].snapshotId).toBe(SNAPSHOT_ID);
  });
});

function repositoryStub(overrides: Partial<BenchmarkReadRepository> = {}): BenchmarkReadRepository {
  return {
    readPrivateResult: async () => privateProjection(),
    listPublicSnapshots: async () => publicListProjection(),
    ...overrides,
  };
}

function privateProjection() {
  return {
    schemaVersion: BENCHMARK_PRIVATE_RESULT_PROJECTION_VERSION,
    run: {
      id: INTERNAL_RUN_ID,
      runId: RUN_ID,
      evaluationId: "00000000-0000-4000-8000-000000000506",
      category: "tts",
      status: "complete",
      methodologyVersion: "1.0.0",
      metricVersion: "one-evaluation-metric/1.0.0",
      evaluationMode: "standardized",
      executionMode: "fixture",
      environment: "fixture",
      deployment: "local-fixture",
      region: null,
      requestedAt: AT,
      completedAt: AT,
      visibility: "private",
      publicationState: "private",
      sponsorshipDisclosure: null,
      integrityState: "hash-verified",
      bundleHash: HASH,
      configuration: {},
    },
    input: { type: "text", exactText: "Fixture text", reference: null, hash: HASH },
    outputs: [{
      id: OUTPUT_ID,
      providerId: "future-provider",
      providerDisplayName: "Future Provider",
      providerReadiness: "listed",
      modelId: "fixture-model",
      modelVersion: null,
      voiceId: "fixture-voice",
      configurationHash: HASH,
      adapterVersion: null,
      configuration: {},
      sponsorshipDisclosure: null,
      capability: "tts",
      outputModality: "audio",
      region: null,
      transport: "local-fixture",
      codec: "wav",
      sampleRateHz: 24_000,
      channels: 1,
      thermalState: "unknown",
      status: "complete",
      failureCode: null,
      requestStartedAt: AT,
      streamEstablishedAt: null,
      firstOutputAt: AT,
      firstAudioAt: AT,
      completedAt: AT,
      audioMimeType: "audio/wav",
      audioDurationSeconds: 0.42,
      audioContentHash: HASH,
      outputContentHash: HASH,
      technicalTrace: [],
      sanitizedError: null,
      measurements: [{
        name: "total-generation-time",
        version: "1.0.0",
        value: 1,
        unit: "milliseconds",
        availability: "measured",
        measurementPoint: "one-server",
        provenance: {},
        observedAt: AT,
      }],
    }],
    judgments: [],
    artifacts: [],
  };
}

function publicListProjection() {
  return {
    schemaVersion: BENCHMARK_PUBLIC_LIST_VERSION,
    items: [{
      snapshotId: SNAPSHOT_ID,
      suite: { id: "fixture-suite", version: "1.0.0", name: "Fixture suite" },
      case: { id: "fixture-case", version: "1.0.0", inputHash: HASH },
      category: "tts",
      methodology: { id: "fixture-methodology", version: "1.0.0" },
      metric: { name: "total-generation-time", version: "1.0.0", statistic: "median", unit: "milliseconds" },
      asOfAt: AT,
      sampleCount: 3,
      payloadDigest: HASH,
      verifiedAt: AT,
      sponsorshipDisclosures: [],
      sponsorshipDisclosureCount: 0,
    }],
    nextCursor: null,
  };
}
