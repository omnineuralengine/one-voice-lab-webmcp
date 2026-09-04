import { expect, test } from "@playwright/test";

import { durationSecondsForWav, pcm16MonoToWav, validateEvaluationAudio } from "../../src/lib/evaluation/audio";
import { createBlindAssignments } from "../../src/lib/evaluation/blind";
import { assertNoSecrets, importEvidenceBundle, serializeEvidenceBundle } from "../../src/lib/evaluation/evidence";
import { buildFixtureCatalog } from "../../src/lib/evaluation/fixture";
import { executeEvaluationRun } from "../../src/lib/evaluation/orchestrator";
import { EVALUATION_IMPORT_MAX_BYTES, evaluationEvidenceBundleSchema, evaluationRunRequestSchema, humanRatingSchema, type EvaluationRunRequest, type EvaluationStreamEvent } from "../../src/lib/evaluation/schema";
import { hashEvaluationText } from "../../src/lib/evaluation/security";
import type { ProviderId } from "../../src/lib/providers/types";

const PROVIDERS: ProviderId[] = ["deepgram", "elevenlabs", "fish-audio", "cartesia"];

test.describe("evaluation evidence primitives", () => {
  test("uses identical deterministic WAV audio and emits a strict audio-free final bundle", async () => {
    const request = fixtureRequest();
    const events: EvaluationStreamEvent[] = [];
    const bundle = await executeEvaluationRun(request, {
      emit: (event) => { events.push(event); },
      resolveAdapter: () => { throw new Error("fixture mode must not resolve adapters"); },
      runGuard: async () => { throw new Error("fixture mode must not consume access"); },
    });

    const resultEvents = events.filter((event) => event.type === "provider-result");
    expect(resultEvents).toHaveLength(4);
    expect(new Set(resultEvents.map((event) => event.audioBase64)).size).toBe(1);
    expect(bundle.providerResults.map((result) => result.blindLabel)).toEqual(["Voice A", "Voice B", "Voice C", "Voice D"]);
    expect(bundle.providerResults.every((result) => result.audio.normalized && result.audio.mimeType === "audio/wav")).toBe(true);
    expect(JSON.stringify(bundle)).not.toContain("audioBase64");

    const serialized = serializeEvidenceBundle(bundle);
    await expect(importEvidenceBundle(serialized)).resolves.toEqual(bundle);
    expect(serialized).toContain('"rawProviderPayloadsEmbedded": false');
  });

  test("validates blind cardinality, configuration secrets, exact text, and WAV metadata", () => {
    expect(() => createBlindAssignments(["deepgram"], "seed")).toThrow(/two to four/i);
    const duplicate = fixtureRequest();
    duplicate.providers[1] = { ...duplicate.providers[0] };
    expect(evaluationRunRequestSchema.safeParse(duplicate).success).toBe(false);

    const unsafe = structuredClone(fixtureRequest()) as unknown as Record<string, unknown>;
    const providers = unsafe.providers as Array<Record<string, unknown>>;
    providers[0].providerSpecificConfiguration = { apiKeyBackup: "not-allowed" };
    expect(evaluationRunRequestSchema.safeParse(unsafe).success).toBe(false);

    const pcm = new Uint8Array(4_800);
    const wav = pcm16MonoToWav(pcm, 24_000);
    expect(durationSecondsForWav(wav)).toBeCloseTo(0.1, 6);
    expect(validateEvaluationAudio(wav, "audio/wav", { maxBytes: 10_000 }).normalized).toBe(true);
    expect(() => validateEvaluationAudio(new Uint8Array([1, 2, 3]), "audio/mpeg", { maxBytes: 100 })).toThrow(/malformed/i);
  });

  test("randomizes blind labels deterministically and validates human-rating state", () => {
    const first = createBlindAssignments(PROVIDERS, "repeatable-seed");
    const second = createBlindAssignments(PROVIDERS, "repeatable-seed");
    expect(first).toEqual(second);
    expect(createBlindAssignments([...PROVIDERS].reverse(), "repeatable-seed")).toEqual(first);
    expect(new Set(Object.values(first)).size).toBe(4);
    expect(humanRatingSchema.safeParse({
      naturalness: 5,
      intelligibility: 4,
      pronunciation: null,
      emotionalFit: 3,
      useCaseFit: 4,
      overallPreference: true,
      ratedAt: "2026-08-26T12:00:00.000Z",
      ratedBeforeReveal: true,
    }).success).toBe(true);
    expect(humanRatingSchema.safeParse({
      naturalness: 6,
      intelligibility: null,
      pronunciation: null,
      emotionalFit: null,
      useCaseFit: null,
      overallPreference: false,
      ratedAt: null,
      ratedBeforeReveal: null,
    }).success).toBe(false);
  });

  test("rejects oversized, URL-bearing, and credential-shaped evidence without leaking values", async () => {
    await expect(importEvidenceBundle(new Uint8Array(EVALUATION_IMPORT_MAX_BYTES + 1))).rejects.toThrow(/between 1 byte/i);
    expect(() => assertNoSecrets({ harmlessName: "Bearer secret-value-123456" })).toThrow(/credential-shaped/i);

    const events: EvaluationStreamEvent[] = [];
    const bundle = await executeEvaluationRun(fixtureRequest(), { emit: (event) => { events.push(event); } });
    const unsafeUrl = structuredClone(bundle);
    unsafeUrl.limitations[0] = "Internal trace at https://internal.example.test/run";
    expect(evaluationEvidenceBundleSchema.safeParse(unsafeUrl).success).toBe(true);
    expect(() => serializeEvidenceBundle(unsafeUrl)).toThrow(/credential-shaped/i);

    const unsafeCredential = structuredClone(bundle);
    unsafeCredential.providerResults[0].providerSpecificConfiguration.note = "Token abcdefghijklmnop";
    expect(() => serializeEvidenceBundle(unsafeCredential)).toThrow(/credential-shaped/i);
    expect(JSON.stringify(events)).not.toContain("abcdef");
  });

  test("rejects semantically tampered imported evidence", async () => {
    const bundle = await executeEvaluationRun(fixtureRequest(), { emit: () => undefined });

    const changedText = structuredClone(bundle);
    changedText.scenario.text = "Tampered after hashing.";
    await expect(importEvidenceBundle(JSON.stringify(changedText))).rejects.toThrow(/semantic integrity/i);

    const mismatchedRun = structuredClone(bundle);
    mismatchedRun.providerResults[0].runId = "00000000-0000-4000-8000-000000000099";
    await expect(importEvidenceBundle(JSON.stringify(mismatchedRun))).rejects.toThrow(/semantic integrity/i);

    const duplicatedIdentity = structuredClone(bundle);
    duplicatedIdentity.providerResults[1].provider = duplicatedIdentity.providerResults[0].provider;
    duplicatedIdentity.providerResults[1].blindLabel = duplicatedIdentity.providerResults[0].blindLabel;
    await expect(importEvidenceBundle(JSON.stringify(duplicatedIdentity))).rejects.toThrow(/semantic integrity/i);

    const impossibleBlindOrder = structuredClone(bundle);
    const firstLabel = impossibleBlindOrder.providerResults[0].blindLabel;
    impossibleBlindOrder.providerResults[0].blindLabel = impossibleBlindOrder.providerResults[1].blindLabel;
    impossibleBlindOrder.providerResults[1].blindLabel = firstLabel;
    await expect(importEvidenceBundle(JSON.stringify(impossibleBlindOrder))).rejects.toThrow(/semantic integrity/i);

    const mixedEnvironment = structuredClone(bundle);
    mixedEnvironment.providerResults[0].environment = "protected-live";
    await expect(importEvidenceBundle(JSON.stringify(mixedEnvironment))).rejects.toThrow(/semantic integrity/i);

    const providerNativeBlind = structuredClone(bundle);
    providerNativeBlind.evaluationMode = "provider-optimized";
    await expect(importEvidenceBundle(JSON.stringify(providerNativeBlind))).rejects.toThrow(/semantic integrity/i);

    const unnormalizedStandardized = structuredClone(bundle);
    unnormalizedStandardized.providerResults[0].audio.normalized = false;
    await expect(importEvidenceBundle(JSON.stringify(unnormalizedStandardized))).rejects.toThrow(/semantic integrity/i);

    const invalidPreset = structuredClone(bundle);
    invalidPreset.scenario = {
      ...invalidPreset.scenario,
      id: "customer-support",
      source: "preset",
      presetId: "customer-support",
    };
    await expect(importEvidenceBundle(JSON.stringify(invalidPreset))).rejects.toThrow(/semantic integrity/i);

    const incoherentStatus = structuredClone(bundle);
    incoherentStatus.providerResults[0].status = "failed";
    await expect(importEvidenceBundle(JSON.stringify(incoherentStatus))).rejects.toThrow(/semantic integrity/i);

    const missingDispatchTime = structuredClone(bundle);
    missingDispatchTime.providerResults[0].requestTimestamp = null;
    await expect(importEvidenceBundle(JSON.stringify(missingDispatchTime))).rejects.toThrow(/semantic integrity/i);

    const ambiguousRegion = structuredClone(bundle);
    ambiguousRegion.providerResults[0].region = "iad1";
    ambiguousRegion.providerResults[0].regionScope = null;
    await expect(importEvidenceBundle(JSON.stringify(ambiguousRegion))).rejects.toThrow(/semantic integrity/i);

    const impossibleReveal = structuredClone(bundle);
    impossibleReveal.blind.revealedAt = "2026-08-26T12:00:00.000Z";
    await expect(importEvidenceBundle(JSON.stringify(impossibleReveal))).rejects.toThrow(/semantic integrity/i);

    const impossibleRating = structuredClone(bundle);
    impossibleRating.providerResults[0].humanRating = {
      naturalness: 5,
      intelligibility: null,
      pronunciation: null,
      emotionalFit: null,
      useCaseFit: null,
      overallPreference: false,
      ratedAt: "2026-08-26T12:00:00.000Z",
      ratedBeforeReveal: false,
    };
    impossibleRating.evidenceCategories.humanRated = true;
    await expect(importEvidenceBundle(JSON.stringify(impossibleRating))).rejects.toThrow(/semantic integrity/i);

    const malformedMetric = structuredClone(bundle);
    const totalMetric = malformedMetric.providerResults[0].metrics.find((metric) => metric.name === "total_generation_time");
    if (!totalMetric) throw new Error("Total generation metric is required");
    totalMetric.unit = "usd";
    totalMetric.value = -1;
    await expect(importEvidenceBundle(JSON.stringify(malformedMetric))).rejects.toThrow(/semantic integrity/i);

    const impossibleBlindTimestamp = structuredClone(bundle);
    const exportedAt = Date.parse(impossibleBlindTimestamp.exportedAt);
    impossibleBlindTimestamp.blind.revealed = true;
    impossibleBlindTimestamp.blind.revealedAt = new Date(exportedAt - 2_000).toISOString();
    impossibleBlindTimestamp.providerResults[0].humanRating = {
      naturalness: 5,
      intelligibility: null,
      pronunciation: null,
      emotionalFit: null,
      useCaseFit: null,
      overallPreference: false,
      ratedAt: new Date(exportedAt - 1_000).toISOString(),
      ratedBeforeReveal: true,
    };
    impossibleBlindTimestamp.evidenceCategories.humanRated = true;
    await expect(importEvidenceBundle(JSON.stringify(impossibleBlindTimestamp))).rejects.toThrow(/semantic integrity/i);

    const ratingBeforeAudio = structuredClone(bundle);
    const completedAt = Date.parse(ratingBeforeAudio.providerResults[0].completionTimestamp ?? ratingBeforeAudio.exportedAt);
    ratingBeforeAudio.providerResults[0].humanRating = {
      naturalness: 5,
      intelligibility: null,
      pronunciation: null,
      emotionalFit: null,
      useCaseFit: null,
      overallPreference: false,
      ratedAt: new Date(completedAt - 1_000).toISOString(),
      ratedBeforeReveal: true,
    };
    ratingBeforeAudio.evidenceCategories.humanRated = true;
    await expect(importEvidenceBundle(JSON.stringify(ratingBeforeAudio))).rejects.toThrow(/semantic integrity/i);
  });

  test("fixture catalogs are explicit and contain no provider model claims", () => {
    for (const providerId of PROVIDERS) {
      const catalog = buildFixtureCatalog(providerId);
      expect(catalog.source).toBe("deterministic-fixture");
      expect(catalog.models[0].id).toBe(`fixture-${providerId}-tts-v1`);
      expect(catalog.message).toMatch(/does not establish provider/i);
    }
  });
});

export function fixtureRequest(): EvaluationRunRequest {
  const text = "ONE exact fixture text.";
  return evaluationRunRequestSchema.parse({
    schemaVersion: "one-voice-evidence/1.0.0",
    evaluationId: "00000000-0000-4000-8000-000000000001",
    runId: "00000000-0000-4000-8000-000000000002",
    scenario: {
      id: "custom-fixture",
      version: "1.0.0",
      source: "custom",
      presetId: null,
      inputType: "text",
      text,
      inputHash: hashEvaluationText(text),
    },
    evaluationMode: "standardized",
    executionMode: "fixture",
    providers: PROVIDERS.map((providerId) => ({
      providerId,
      model: `fixture-${providerId}-tts-v1`,
      voice: `fixture-${providerId}-voice-v1`,
      outputFormat: "fixture-wav",
      providerSpecificConfiguration: {},
    })),
    blind: { enabled: true, seed: "deterministic-test-seed" },
    confirmedPaidCalls: false,
  });
}
