import "server-only";

import { createHash } from "node:crypto";

import {
  BENCHMARK_CANONICAL_JSON_VERSION,
  BENCHMARK_INTEGRITY_VERSION,
  SUPPORTED_BENCHMARK_SCHEMA_VERSIONS,
  benchmarkIntegritySchema,
  benchmarkResultSchema,
  type BenchmarkIntegrity,
  type BenchmarkResult,
} from "@/lib/evaluation/benchmark-schema";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export const BENCHMARK_PUBLIC_PROOF_VERSION = "one-benchmark-public-proof/1.0.0" as const;

function normalizeJson(value: unknown, seen: Set<object>): JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical benchmark JSON rejects non-finite numbers.");
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "object") {
    throw new TypeError("Canonical benchmark JSON accepts only JSON-compatible values.");
  }
  if (seen.has(value)) throw new TypeError("Canonical benchmark JSON rejects cyclic values.");
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const keys = Object.keys(value);
      if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) {
        throw new TypeError("Canonical benchmark JSON rejects sparse arrays and non-index array properties.");
      }
      return value.map((item) => normalizeJson(item, seen));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Canonical benchmark JSON accepts only plain records and arrays.");
    }
    const normalized = Object.create(null) as Record<string, JsonValue>;
    const keys = Object.keys(value);
    if (keys.some((key) => !/^[\x20-\x7E]{1,80}$/.test(key))) {
      throw new TypeError("Canonical benchmark JSON object keys must use 1–80 printable ASCII characters so JavaScript and PostgreSQL order them identically.");
    }
    for (const key of keys.sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item === undefined) throw new TypeError("Canonical benchmark JSON rejects undefined values.");
      normalized[key] = normalizeJson(item, seen);
    }
    return normalized;
  } finally {
    seen.delete(value);
  }
}

export function canonicalizeBenchmarkJson(value: unknown): string {
  return JSON.stringify(normalizeJson(value, new Set()));
}

export function hashBenchmarkPayload(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(canonicalizeBenchmarkJson(value), "utf8").digest("hex")}`;
}

function assertConfigurationHashesMatch(result: BenchmarkResult): void {
  for (const participant of result.run.participants) {
    if (hashBenchmarkPayload(participant.configuration) !== participant.configurationHash) {
      throw new RangeError(`Participant configuration digest does not match the disclosed configuration for ${participant.providerId}.`);
    }
  }
}

function hasDurablePublicEvidence(result: BenchmarkResult): boolean {
  if (result.retention !== "persistent" || result.run.observation.kind !== "future-observation-reference") return false;
  if (!/^(?:repository|object):/.test(result.run.observation.reference)) return false;
  return result.artifacts.every((artifact) => artifact.retention === "persistent"
    && artifact.visibility === "public-verified"
    && artifact.publicationPolicy === "published"
    && artifact.expiresAt === null
    && /^(?:repository|object):/.test(artifact.reference));
}

export function createBenchmarkIntegrity(
  payload: unknown,
  payloadSchemaVersion: string,
  checkedAt = new Date().toISOString(),
): BenchmarkIntegrity {
  return benchmarkIntegritySchema.parse({
    schemaVersion: BENCHMARK_INTEGRITY_VERSION,
    state: "hash-verified",
    algorithm: "sha256",
    canonicalization: BENCHMARK_CANONICAL_JSON_VERSION,
    payloadSchemaVersion,
    digest: hashBenchmarkPayload(payload),
    checkedAt,
    detail: "ONE canonicalized and SHA-256 hashed this bounded payload.",
  });
}

export function createUnsignedBenchmarkIntegrity(payloadSchemaVersion: string): BenchmarkIntegrity {
  return benchmarkIntegritySchema.parse({
    schemaVersion: BENCHMARK_INTEGRITY_VERSION,
    state: "unsigned",
    algorithm: "sha256",
    canonicalization: BENCHMARK_CANONICAL_JSON_VERSION,
    payloadSchemaVersion,
    digest: null,
    checkedAt: null,
    detail: "This payload has not yet been hash or signature verified.",
  });
}

export function benchmarkResultIntegrityPayload(result: BenchmarkResult): unknown {
  const { integrity: _integrity, ...payload } = result;
  void _integrity;
  const observation = payload.run.observation.kind === "evaluation-evidence-bundle"
    ? {
        kind: payload.run.observation.kind,
        bundle: {
          ...payload.run.observation.bundle,
          providerResults: payload.run.observation.bundle.providerResults.map((provider) => ({
            ...provider,
            audio: {
              ...provider.audio,
              storageReference: provider.audio.storageReference?.startsWith("ephemeral:") || provider.audio.storageReference?.startsWith("object:")
                ? undefined
                : provider.audio.storageReference,
            },
          })),
        },
      }
    : {
        ...payload.run.observation,
        reference: payload.run.observation.reference.startsWith("ephemeral:") || payload.run.observation.reference.startsWith("object:")
          ? undefined
          : payload.run.observation.reference,
      };
  const projected = {
    ...payload,
    run: {
      ...payload.run,
      observation,
    },
    artifacts: payload.artifacts.map((artifact) => ({
      ...artifact,
      reference: artifact.reference.startsWith("ephemeral:") || artifact.reference.startsWith("object:") ? undefined : artifact.reference,
    })),
  };
  return JSON.parse(JSON.stringify(projected)) as unknown;
}

export function benchmarkResultPublicProofPayload(result: BenchmarkResult): Readonly<{
  schemaVersion: typeof BENCHMARK_PUBLIC_PROOF_VERSION;
  resultId: string;
  contentDigest: `sha256:${string}`;
  sourceContentDigest: `sha256:${string}`;
  redactions: readonly string[];
  content: unknown;
}> {
  const parsed = benchmarkResultSchema.parse(result);
  assertConfigurationHashesMatch(parsed);
  const verified = verifyBenchmarkResultIntegrity(parsed);
  if (!parsed.eligibility.publicEligible
    || !parsed.eligibility.rankingEligible
    || parsed.visibility !== "public-verified"
    || parsed.publication !== "published"
    || parsed.status !== "completed"
    || parsed.humanJudgments.length > 0
    || !hasDurablePublicEvidence(parsed)
    || !["hash-verified", "signature-verified"].includes(parsed.integrity.state)
    || verified.state !== "hash-verified") {
    throw new RangeError("A public proof requires a completed, eligible, published, public-verified result whose canonical hash verifies.");
  }
  if (parsed.run.observation.kind !== "future-observation-reference") {
    throw new RangeError("Private Evaluate observations cannot be projected into a public proof; publication requires a controlled public-safe observation reference.");
  }
  const sourceContentDigest = parsed.integrity.digest;
  if (sourceContentDigest === null) throw new RangeError("A public proof requires a verified source content digest.");
  const verifiedSourceContentDigest = sourceContentDigest as `sha256:${string}`;
  const publicContent = {
    schemaVersion: parsed.schemaVersion,
    resultId: parsed.resultId,
    category: parsed.category,
    status: parsed.status,
    run: {
      schemaVersion: parsed.run.schemaVersion,
      runId: parsed.run.runId,
      category: parsed.run.category,
      status: parsed.run.status,
      suiteRef: parsed.run.suiteRef,
      methodologyRef: parsed.run.methodologyRef,
      caseRef: parsed.run.caseRef,
      methodologyVersion: parsed.run.methodologyVersion,
      metricVersion: parsed.run.metricVersion,
      recordedAt: parsed.run.recordedAt,
      executionMode: parsed.run.executionMode,
      evaluationMode: parsed.run.evaluationMode,
      runtime: parsed.run.runtime,
      timestamps: parsed.run.timestamps,
      failure: parsed.run.failure === null ? null : { code: parsed.run.failure.code, providerId: parsed.run.failure.providerId },
      participants: parsed.run.participants.map((participant) => ({
        providerId: participant.providerId,
        providerMetadataSnapshot: participant.providerMetadataSnapshot,
        modelId: participant.modelId,
        voiceId: participant.voiceId,
        configurationHash: participant.configurationHash,
        region: participant.region,
        transport: participant.transport,
        codec: participant.codec,
        sampleRateHz: participant.sampleRateHz,
        channels: participant.channels,
        thermalState: participant.thermalState,
      })),
      observation: {
        kind: parsed.run.observation.kind,
        sourceSchemaVersion: parsed.run.observation.sourceSchemaVersion,
        contentHash: parsed.run.observation.contentHash,
      },
    },
    objectiveMeasurements: parsed.objectiveMeasurements.map((measurement) => ({
      schemaVersion: measurement.schemaVersion,
      evidenceCategory: measurement.evidenceCategory,
      measurementId: measurement.measurementId,
      runId: measurement.runId,
      providerId: measurement.providerId,
      model: measurement.model,
      voice: measurement.voice,
      configurationHash: measurement.configurationHash,
      metricId: measurement.metricId,
      metricVersion: measurement.metricVersion,
      value: measurement.value,
      unit: measurement.unit,
      availability: measurement.availability,
      synthetic: measurement.synthetic,
      measuredAt: measurement.measuredAt,
      method: measurement.method,
      precision: measurement.precision,
      sampleCount: measurement.sampleCount,
      source: measurement.source,
      confidence: measurement.confidence,
      provenance: {
        measurementPoint: measurement.provenance.measurementPoint,
        clock: measurement.provenance.clock,
        observation: measurement.provenance.observation,
        sourceSchemaVersion: measurement.provenance.sourceSchemaVersion,
      },
    })),
    humanJudgments: [],
    automatedJudgments: parsed.automatedJudgments.map((judgment) => ({
      ...judgment,
      value: typeof judgment.value === "string" ? undefined : judgment.value,
      valueHash: typeof judgment.value === "string" ? hashBenchmarkPayload(judgment.value) : undefined,
      provenance: undefined,
    })),
    artifacts: parsed.artifacts.map((artifact) => ({
      schemaVersion: artifact.schemaVersion,
      artifactId: artifact.artifactId,
      kind: artifact.kind,
      contentHash: artifact.contentHash,
      mimeType: artifact.mimeType,
      byteSize: artifact.byteSize,
      retention: artifact.retention,
      visibility: artifact.visibility,
      ownership: artifact.ownership,
      publicationPolicy: artifact.publicationPolicy,
      expiresAt: artifact.expiresAt,
    })),
    eligibility: parsed.eligibility,
    visibility: parsed.visibility,
    publication: parsed.publication,
    retention: parsed.retention,
  };
  const sanitizedPublicContent = JSON.parse(JSON.stringify(publicContent)) as Record<string, unknown>;
  return {
    schemaVersion: BENCHMARK_PUBLIC_PROOF_VERSION,
    resultId: parsed.resultId,
    contentDigest: hashBenchmarkPayload(sanitizedPublicContent),
    sourceContentDigest: verifiedSourceContentDigest,
    redactions: [
      "Only controlled suite, case, input-hash, methodology, timing, provider snapshot, and allowlisted evidence fields are projected.",
      "Initiator and evaluation identifiers, provider configuration values, failure messages, free-text provenance, limitations, and all artifact or observation reference strings are omitted.",
      "Human judgments are excluded until per-judgment publication consent exists. Automated free-text judgment values are represented by a canonical content hash.",
    ],
    content: sanitizedPublicContent,
  };
}

export function sealBenchmarkResultIntegrity(
  result: BenchmarkResult,
  checkedAt = new Date().toISOString(),
): BenchmarkResult {
  const parsed = benchmarkResultSchema.parse(result);
  assertConfigurationHashesMatch(parsed);
  return benchmarkResultSchema.parse({
    ...parsed,
    integrity: createBenchmarkIntegrity(benchmarkResultIntegrityPayload(parsed), parsed.schemaVersion, checkedAt),
  });
}

export function publishBenchmarkResultWithHash(
  result: BenchmarkResult,
  checkedAt = new Date().toISOString(),
): BenchmarkResult {
  const parsed = benchmarkResultSchema.parse(result);
  assertConfigurationHashesMatch(parsed);
  const publicationExclusions = parsed.eligibility.exclusions.filter((exclusion) => exclusion.scope === "publication" || exclusion.scope === "both");
  if (!parsed.eligibility.publicEligible
    || !parsed.eligibility.rankingEligible
    || parsed.visibility !== "public-candidate"
    || parsed.publication !== "approved"
    || parsed.status !== "completed"
    || parsed.humanJudgments.length > 0
    || parsed.run.executionMode === "fixture"
    || parsed.run.observation.kind !== "future-observation-reference"
    || !hasDurablePublicEvidence(parsed)
    || publicationExclusions.length > 0
    || parsed.artifacts.some((artifact) => artifact.visibility !== "public-verified" || artifact.publicationPolicy !== "published")) {
    throw new RangeError("Publication requires an approved, completed, non-fixture, public-eligible candidate backed only by controlled public-safe references and artifacts.");
  }
  const publishable = {
    ...parsed,
    visibility: "public-verified" as const,
    publication: "published" as const,
    integrity: createUnsignedBenchmarkIntegrity(parsed.schemaVersion),
  };
  const integrity = createBenchmarkIntegrity(benchmarkResultIntegrityPayload(publishable), parsed.schemaVersion, checkedAt);
  return benchmarkResultSchema.parse({ ...publishable, integrity });
}

export function verifyBenchmarkResultIntegrity(result: BenchmarkResult): BenchmarkIntegrity {
  const supported = (SUPPORTED_BENCHMARK_SCHEMA_VERSIONS as readonly string[]).includes(result.schemaVersion)
    && (SUPPORTED_BENCHMARK_SCHEMA_VERSIONS as readonly string[]).includes(result.integrity.payloadSchemaVersion)
    && result.integrity.payloadSchemaVersion === result.schemaVersion;
  if (!supported) {
    return benchmarkIntegritySchema.parse({
      ...result.integrity,
      state: "unsupported-version",
      checkedAt: new Date().toISOString(),
      detail: "The payload or declared integrity schema version is not supported by this verifier.",
    });
  }
  try {
    assertConfigurationHashesMatch(result);
  } catch {
    return benchmarkIntegritySchema.parse({
      ...result.integrity,
      state: "verification-failed",
      checkedAt: new Date().toISOString(),
      detail: "A disclosed provider configuration does not match its declared SHA-256 digest.",
    });
  }
  if (result.integrity.digest === null || result.integrity.state === "unsigned") {
    return benchmarkIntegritySchema.parse({
      ...result.integrity,
      state: "unsigned",
      checkedAt: new Date().toISOString(),
      detail: "No integrity digest is available for verification.",
    });
  }
  const actual = hashBenchmarkPayload(benchmarkResultIntegrityPayload(result));
  const verified = actual === result.integrity.digest;
  return benchmarkIntegritySchema.parse({
    ...result.integrity,
    state: verified ? "hash-verified" : "verification-failed",
    checkedAt: new Date().toISOString(),
    detail: verified ? "The canonical payload matches its SHA-256 digest." : "The canonical payload does not match its declared SHA-256 digest.",
  });
}
