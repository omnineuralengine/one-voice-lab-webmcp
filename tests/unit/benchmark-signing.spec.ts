import { generateKeyPairSync } from "node:crypto";

import { expect, test } from "@playwright/test";

import { materializeEvaluationBenchmarkResults } from "../../src/lib/evaluation/benchmark-engine";
import {
  benchmarkResultIntegrityPayload,
  benchmarkResultPublicProofPayload,
  canonicalizeBenchmarkJson,
  hashBenchmarkPayload,
  publishBenchmarkResultWithHash,
  sealBenchmarkResultIntegrity,
  verifyBenchmarkResultIntegrity,
} from "../../src/lib/evaluation/benchmark-integrity";
import { BENCHMARK_SCHEMA_VERSION, benchmarkResultSchema, type BenchmarkResult } from "../../src/lib/evaluation/benchmark-schema";
import {
  BENCHMARK_DB_PUBLIC_PAYLOAD_VERSION,
  benchmarkSignatureEnvelopeSchema,
  createEd25519BenchmarkSigner,
  signPreparedBenchmarkSnapshot,
  signBenchmarkPayload,
  verifyPreparedBenchmarkSnapshotSignature,
  verifyBenchmarkSignature,
} from "../../src/lib/evaluation/benchmark-signing";
import { executeEvaluationRun } from "../../src/lib/evaluation/orchestrator";
import { evaluationRunRequestSchema } from "../../src/lib/evaluation/schema";
import { hashEvaluationText } from "../../src/lib/evaluation/security";
import type { ProviderId } from "../../src/lib/providers/types";

test.describe("canonical benchmark integrity", () => {
  test("canonicalizes records with stable key ordering and hashes identical content identically", () => {
    const left = { z: [3, { beta: true, alpha: "one" }], a: 1 };
    const right = { a: 1, z: [3, { alpha: "one", beta: true }] };
    expect(canonicalizeBenchmarkJson(left)).toBe('{"a":1,"z":[3,{"alpha":"one","beta":true}]}');
    expect(hashBenchmarkPayload(left)).toBe(hashBenchmarkPayload(right));
    expect(canonicalizeBenchmarkJson({ a: 1, B: 2, e: 4 })).toBe('{"B":2,"a":1,"e":4}');
    expect(hashBenchmarkPayload(JSON.parse('{"__proto__":{"polluted":true}}'))).not.toBe(hashBenchmarkPayload({}));
    expect(() => canonicalizeBenchmarkJson({ invalid: Number.NaN })).toThrow(/non-finite/i);
    expect(() => canonicalizeBenchmarkJson(new Array(1))).toThrow(/sparse arrays/i);
    expect(() => canonicalizeBenchmarkJson({ "é": 1 })).toThrow(/printable ASCII/i);
    expect(() => canonicalizeBenchmarkJson({ ["a".repeat(81)]: 1 })).toThrow(/1–80 printable ASCII/i);
  });

  test("binds material timing and provenance while excluding only ephemeral object references", async () => {
    const result = await fixtureBenchmarkResult();
    const sealed = sealBenchmarkResultIntegrity(result, "2026-08-27T14:00:00.000Z");
    expect(verifyBenchmarkResultIntegrity(sealed).state).toBe("hash-verified");

    const mutations: Array<(tampered: BenchmarkResult) => void> = [
      (tampered) => { tampered.objectiveMeasurements[0].value = 999; },
      (tampered) => { tampered.run.recordedAt = "2026-08-28T14:00:00.000Z"; },
      (tampered) => { tampered.run.timestamps.completedAt = "2026-08-28T14:00:00.000Z"; },
      (tampered) => { tampered.objectiveMeasurements[0].measuredAt = "2026-08-28T14:00:00.000Z"; },
      (tampered) => {
        if (tampered.run.observation.kind !== "evaluation-evidence-bundle") throw new Error("Expected evaluation observation");
        tampered.run.observation.bundle.providerResults[0].requestTimestamp = "2026-08-28T14:00:00.000Z";
      },
      (tampered) => {
        if (tampered.run.observation.kind !== "evaluation-evidence-bundle") throw new Error("Expected evaluation observation");
        tampered.run.observation.bundle.blind.seed = "changed-blind-seed";
      },
      (tampered) => {
        if (tampered.run.observation.kind !== "evaluation-evidence-bundle") throw new Error("Expected evaluation observation");
        tampered.run.observation.bundle.providerResults[0].humanRating.ratedAt = "2026-08-28T14:00:00.000Z";
      },
      (tampered) => {
        if (tampered.run.observation.kind !== "evaluation-evidence-bundle") throw new Error("Expected evaluation observation");
        tampered.run.observation.bundle.providerResults[0].trace[0].detail = "Tampered trace provenance.";
      },
    ];
    for (const mutate of mutations) {
      const tampered = structuredClone(sealed);
      mutate(tampered);
      expect(verifyBenchmarkResultIntegrity(tampered).state).toBe("verification-failed");
    }

    const ephemeralReferenceChange = structuredClone(sealed);
    if (ephemeralReferenceChange.run.observation.kind !== "evaluation-evidence-bundle") throw new Error("Expected evaluation observation");
    ephemeralReferenceChange.run.observation.bundle.providerResults[0].audio.storageReference = "ephemeral:another-private-object";
    expect(hashBenchmarkPayload(benchmarkResultIntegrityPayload(ephemeralReferenceChange))).toBe(sealed.integrity.digest);

    const forgedSignatureState = structuredClone(sealed);
    forgedSignatureState.integrity.state = "signature-verified";
    expect(verifyBenchmarkResultIntegrity(forgedSignatureState).state).toBe("hash-verified");

    const forgedBeforeSealing = await publishableBenchmarkCandidate();
    forgedBeforeSealing.run.participants[0].configuration = { comparisonMode: "fixture", changed: true };
    expect(() => sealBenchmarkResultIntegrity(forgedBeforeSealing)).toThrow(/configuration digest/i);

    const resealedForged = sealBenchmarkResultIntegrity(await publishableBenchmarkCandidate());
    resealedForged.run.participants[0].configuration = { comparisonMode: "fixture", changed: true };
    resealedForged.integrity.digest = hashBenchmarkPayload(benchmarkResultIntegrityPayload(resealedForged));
    expect(verifyBenchmarkResultIntegrity(resealedForged).state).toBe("verification-failed");
  });

  test("fails closed for private evidence and creates an allowlisted proof only after publication", async () => {
    const privateResult = await fixtureBenchmarkResult();
    const privateSealed = sealBenchmarkResultIntegrity(privateResult, "2026-08-27T14:00:00.000Z");
    expect(() => benchmarkResultPublicProofPayload(privateSealed)).toThrow(/public proof requires/i);

    const candidate = await publishableBenchmarkCandidate();
    const published = publishBenchmarkResultWithHash(candidate, "2026-08-27T14:00:00.000Z");
    const proof = benchmarkResultPublicProofPayload(published);
    const serialized = JSON.stringify(proof);
    expect(proof.sourceContentDigest).toBe(published.integrity.digest);
    expect(proof.contentDigest).toBe(hashBenchmarkPayload(proof.content));
    expect(serialized).not.toContain("Integrity fixture text.");
    expect(serialized).not.toContain("private-user-123");
    expect(serialized).not.toContain("integrity-fixture-seed");
    expect(serialized).not.toContain("Bearer private-configuration-value");
    expect(serialized).not.toContain("repository:private/internal/future-observation.json");
    expect(serialized).toContain(hashEvaluationText("Integrity fixture text."));
    expect(published.visibility).toBe("public-verified");
    expect(published.publication).toBe("published");

    const tampered = structuredClone(published);
    tampered.objectiveMeasurements[0].value = 999;
    expect(() => benchmarkResultPublicProofPayload(tampered)).toThrow(/canonical hash verifies/i);
  });

  test("rejects contradictory eligibility, forged configuration digests, and ephemeral public evidence", async () => {
    const contradictory = await publishableBenchmarkCandidate();
    contradictory.eligibility.exclusions = [{
      schemaVersion: "one-benchmark-eligibility/1.0.0",
      code: "failed-run",
      scope: "ranking",
      detail: "A ranking exclusion cannot coexist with ranking eligibility.",
    }];
    expect(() => benchmarkResultSchema.parse(contradictory)).toThrow(/ranking eligibility/i);

    const forgedConfiguration = await publishableBenchmarkCandidate();
    forgedConfiguration.run.participants[0].configuration = { comparisonMode: "standardized", hiddenChange: true };
    expect(() => publishBenchmarkResultWithHash(forgedConfiguration)).toThrow(/configuration digest/i);

    const ephemeralRetention = await publishableBenchmarkCandidate();
    ephemeralRetention.retention = "ephemeral";
    expect(() => publishBenchmarkResultWithHash(ephemeralRetention)).toThrow(/controlled public-safe references/i);

    const ephemeralReference = await publishableBenchmarkCandidate();
    if (ephemeralReference.run.observation.kind !== "future-observation-reference") throw new Error("Expected a future observation reference");
    ephemeralReference.run.observation.reference = "ephemeral:uncontrolled-observation";
    expect(() => publishBenchmarkResultWithHash(ephemeralReference)).toThrow(/controlled public-safe references/i);

    const expiringPersistentArtifact = await publishableBenchmarkCandidate();
    expiringPersistentArtifact.artifacts = [publicArtifact(expiringPersistentArtifact, "2026-09-01T00:00:00.000Z")];
    expect(() => benchmarkResultSchema.parse(expiringPersistentArtifact)).toThrow(/persistent artifacts cannot carry an expiry/i);

    const privateArtifact = await publishableBenchmarkCandidate();
    privateArtifact.artifacts = [{
      ...publicArtifact(privateArtifact, null),
      visibility: "private",
      publicationPolicy: "never",
    }];
    expect(() => publishBenchmarkResultWithHash(privateArtifact)).toThrow(/controlled public-safe references/i);

    const publicArtifactCandidate = await publishableBenchmarkCandidate();
    publicArtifactCandidate.artifacts = [publicArtifact(publicArtifactCandidate, null)];
    const publishedWithArtifact = publishBenchmarkResultWithHash(publicArtifactCandidate);
    publishedWithArtifact.artifacts[0].visibility = "private";
    publishedWithArtifact.artifacts[0].publicationPolicy = "never";
    const resealedPrivateArtifact = sealBenchmarkResultIntegrity(publishedWithArtifact);
    expect(() => benchmarkResultPublicProofPayload(resealedPrivateArtifact)).toThrow(/public proof requires/i);

    const candidateWithRating = await publishableBenchmarkCandidate();
    candidateWithRating.humanJudgments = [privateHumanJudgment(candidateWithRating)];
    expect(() => publishBenchmarkResultWithHash(candidateWithRating)).toThrow(/publication requires/i);

    const publishedWithRating = publishBenchmarkResultWithHash(await publishableBenchmarkCandidate());
    publishedWithRating.humanJudgments = [privateHumanJudgment(publishedWithRating)];
    const resealedRating = sealBenchmarkResultIntegrity(publishedWithRating);
    expect(() => benchmarkResultPublicProofPayload(resealedRating)).toThrow(/public proof requires/i);
  });

  test("returns an explicit unsupported-version state", async () => {
    const result = sealBenchmarkResultIntegrity(await fixtureBenchmarkResult(), "2026-08-27T14:00:00.000Z");
    const unsupported = structuredClone(result) as BenchmarkResult & { schemaVersion: string };
    unsupported.integrity.payloadSchemaVersion = "one-benchmark/99.0.0";
    expect(verifyBenchmarkResultIntegrity(unsupported as BenchmarkResult).state).toBe("unsupported-version");

    const wrongSupportedEnvelope = structuredClone(result) as BenchmarkResult;
    wrongSupportedEnvelope.integrity.payloadSchemaVersion = "one-benchmark-methodology/1.0.0";
    expect(verifyBenchmarkResultIntegrity(wrongSupportedEnvelope).state).toBe("unsupported-version");
    expect(() => benchmarkResultSchema.parse(wrongSupportedEnvelope)).toThrow(/exact enclosing benchmark schema version/i);
  });
});

test.describe("optional Ed25519 benchmark signing", () => {
  test("verifies ephemeral signatures and binds payload, schema version, digest, and signedAt", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const signer = createEd25519BenchmarkSigner({ keyId: "test-key/ephemeral", privateKey });
    const payload = { benchmark: "fixture-only", score: 1 };
    const envelope = await signBenchmarkPayload(payload, BENCHMARK_SCHEMA_VERSION, signer, "2026-08-27T15:00:00.000Z");
    expect(envelope.algorithm).toBe("ed25519");
    expect(Buffer.from(envelope.signature, "base64")).toHaveLength(64);
    expect(benchmarkSignatureEnvelopeSchema.safeParse({ ...envelope, signature: "AA==" }).success).toBe(false);
    expect(benchmarkSignatureEnvelopeSchema.safeParse({ ...envelope, signature: "A".repeat(10_000) }).success).toBe(false);
    expect(benchmarkSignatureEnvelopeSchema.safeParse({ ...envelope, signature: `${"A".repeat(86)}=A` }).success).toBe(false);
    expect(verifyBenchmarkSignature(payload, envelope, publicKey)).toMatchObject({ valid: true, state: "signature-verified" });
    expect(verifyBenchmarkSignature({ ...payload, score: 2 }, envelope, publicKey)).toMatchObject({ valid: false, state: "verification-failed" });

    const alteredTime = { ...envelope, signedAt: "2026-08-27T15:00:01.000Z" };
    expect(verifyBenchmarkSignature(payload, alteredTime, publicKey)).toMatchObject({ valid: false, state: "verification-failed" });
  });

  test("refuses to sign unsupported payload versions", async () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const signer = createEd25519BenchmarkSigner({ keyId: "test-key/ephemeral", privateKey });
    await expect(signBenchmarkPayload({}, "one-benchmark/99.0.0", signer)).rejects.toThrow(/unsupported/i);
  });

  test("signs and verifies the exact canonical bytes prepared by the database", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const signer = createEd25519BenchmarkSigner({ keyId: "test-key/database", privateKey });
    const snapshotId = "00000000-0000-4000-8000-000000000401";
    const canonicalPayload = `{"entries":[{"rank":1,"value":0.125}],"schemaVersion":"${BENCHMARK_DB_PUBLIC_PAYLOAD_VERSION}","snapshotId":"${snapshotId}"}`;
    const prepared = {
      snapshotId,
      payloadSchemaVersion: BENCHMARK_DB_PUBLIC_PAYLOAD_VERSION,
      payload: JSON.parse(canonicalPayload),
      canonicalPayload,
      payloadDigest: hashBenchmarkPayload(JSON.parse(canonicalPayload)),
    } as const;
    const envelope = await signPreparedBenchmarkSnapshot(prepared, signer, "2026-08-27T15:30:00.000Z");
    expect(envelope.payloadSchemaVersion).toBe(BENCHMARK_DB_PUBLIC_PAYLOAD_VERSION);
    expect(verifyPreparedBenchmarkSnapshotSignature(prepared, envelope, publicKey)).toMatchObject({ valid: true, state: "signature-verified" });

    const alteredBytes = { ...prepared, canonicalPayload: canonicalPayload.replace("0.125", "0.126") };
    expect(verifyPreparedBenchmarkSnapshotSignature(alteredBytes, envelope, publicKey)).toMatchObject({ valid: false, state: "verification-failed" });
    await expect(signPreparedBenchmarkSnapshot(alteredBytes, signer)).rejects.toThrow(/canonical|digest/i);
    await expect(signPreparedBenchmarkSnapshot({
      ...prepared,
      payload: { ...prepared.payload, snapshotId: "00000000-0000-4000-8000-000000000402" },
    }, signer)).rejects.toThrow(/snapshot identifier/i);
    await expect(signPreparedBenchmarkSnapshot({
      ...prepared,
      payload: { snapshotId },
    } as typeof prepared, signer)).rejects.toThrow(/schemaVersion/i);
    await expect(signBenchmarkPayload(prepared.payload, BENCHMARK_DB_PUBLIC_PAYLOAD_VERSION, signer)).rejects.toThrow(/unsupported/i);
  });
});

async function fixtureBenchmarkResult(): Promise<BenchmarkResult> {
  const providerIds: ProviderId[] = ["deepgram", "cartesia"];
  const text = "Integrity fixture text.";
  const request = evaluationRunRequestSchema.parse({
    schemaVersion: "one-voice-evidence/1.0.0",
    evaluationId: "00000000-0000-4000-8000-000000000301",
    runId: "00000000-0000-4000-8000-000000000302",
    scenario: { id: "integrity-fixture", version: "1.0.0", source: "custom", presetId: null, inputType: "text", text, inputHash: hashEvaluationText(text) },
    evaluationMode: "standardized",
    executionMode: "fixture",
    providers: providerIds.map((providerId) => ({
      providerId,
      model: `fixture-${providerId}-tts-v1`,
      voice: `fixture-${providerId}-voice-v1`,
      outputFormat: "fixture-wav",
      providerSpecificConfiguration: {},
    })),
    blind: { enabled: true, seed: "integrity-fixture-seed" },
    confirmedPaidCalls: false,
  });
  const bundle = await executeEvaluationRun(request, {
    emit: () => undefined,
    resolveAdapter: () => { throw new Error("fixture integrity tests must not resolve an adapter"); },
    runGuard: async () => { throw new Error("fixture integrity tests must not spend provider credits"); },
  });
  return (await materializeEvaluationBenchmarkResults(bundle))[0];
}

async function publishableBenchmarkCandidate(): Promise<BenchmarkResult> {
  const candidate = structuredClone(await fixtureBenchmarkResult());
  candidate.run.executionMode = "local-live";
  candidate.run.runtime = { environment: "local-live", deployment: "controlled-local-benchmark", region: "test-region" };
  candidate.run.initiatedBy = { class: "human", subjectId: "private-user-123" };
  candidate.run.observation = {
    kind: "future-observation-reference",
    sourceSchemaVersion: "controlled-tts-observation/1.0.0",
    reference: "repository:private/internal/future-observation.json",
    contentHash: candidate.run.caseRef.inputHash,
  };
  candidate.run.participants = candidate.run.participants.map((participant) => ({
    ...participant,
    configuration: { comparisonMode: "standardized", privateNote: "Bearer private-configuration-value" },
    configurationHash: hashBenchmarkPayload({ comparisonMode: "standardized", privateNote: "Bearer private-configuration-value" }),
    thermalState: "warm",
  }));
  candidate.objectiveMeasurements = candidate.objectiveMeasurements.map((measurement) => ({
    ...measurement,
    configurationHash: hashBenchmarkPayload({ comparisonMode: "standardized", privateNote: "Bearer private-configuration-value" }),
    synthetic: false,
    source: measurement.provenance.measurementPoint === "provider-reported"
      ? "provider-reported"
      : measurement.provenance.measurementPoint === "derived"
        ? "derived"
        : "one-observed",
    provenance: {
      ...measurement.provenance,
      clock: measurement.availability === "unavailable"
        ? "not-applicable"
        : measurement.provenance.measurementPoint === "one-browser"
          ? "browser-monotonic"
          : measurement.provenance.measurementPoint === "provider-reported"
            ? "provider"
            : "server-monotonic",
      observation: measurement.availability === "unavailable"
        ? "unavailable"
        : measurement.provenance.measurementPoint === "provider-reported"
          ? "provider-reported"
          : measurement.provenance.measurementPoint === "derived"
            ? "derived"
            : "observed",
      description: "Private provenance must not enter the public proof.",
    },
  }));
  candidate.humanJudgments = candidate.humanJudgments.map((judgment) => ({
    ...judgment,
    configurationHash: hashBenchmarkPayload({ comparisonMode: "standardized", privateNote: "Bearer private-configuration-value" }),
  }));
  candidate.automatedJudgments = candidate.automatedJudgments.map((judgment) => ({
    ...judgment,
    configurationHash: hashBenchmarkPayload({ comparisonMode: "standardized", privateNote: "Bearer private-configuration-value" }),
  }));
  candidate.artifacts = [];
  candidate.eligibility = {
    ...candidate.eligibility,
    publicEligible: true,
    rankingEligible: true,
    exclusions: [],
  };
  candidate.visibility = "public-candidate";
  candidate.publication = "approved";
  candidate.retention = "persistent";
  return benchmarkResultSchema.parse(candidate);
}

function publicArtifact(result: BenchmarkResult, expiresAt: string | null): BenchmarkResult["artifacts"][number] {
  return {
    schemaVersion: "one-benchmark-artifact/1.0.0",
    artifactId: `artifact/${result.run.runId}/public-audio`,
    kind: "audio",
    reference: "repository:public/benchmark-audio.wav",
    contentHash: result.run.caseRef.inputHash,
    mimeType: "audio/wav",
    byteSize: 44,
    retention: "persistent",
    visibility: "public-verified",
    provenance: "Controlled unit-test artifact with no provider call.",
    ownership: "one",
    publicationPolicy: "published",
    expiresAt,
  };
}

function privateHumanJudgment(result: BenchmarkResult): BenchmarkResult["humanJudgments"][number] {
  const participant = result.run.participants[0];
  if (!participant) throw new Error("A benchmark participant is required for the rating fixture.");
  return {
    schemaVersion: "one-benchmark-judgment/1.0.0",
    evidenceCategory: "human",
    judgmentClass: "human",
    judgmentId: `judgment/${result.run.runId}/${participant.providerId}/private-rating`,
    runId: result.run.runId,
    providerId: participant.providerId,
    model: participant.modelId,
    voice: participant.voiceId,
    configurationHash: participant.configurationHash,
    dimension: "naturalness",
    value: 5,
    ratedAt: "2026-08-27T14:00:00.000Z",
    ratedBeforeReveal: true,
    evaluator: { class: "human", anonymous: true },
    rubricVersion: "one-human-rating/1.0.0",
    promptVersion: null,
    confidence: null,
    externalFramework: null,
    provenance: "Private unit-test rating with no publication consent.",
  };
}
