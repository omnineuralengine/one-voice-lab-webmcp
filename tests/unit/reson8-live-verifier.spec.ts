import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { appendFile, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { resolveSttAdapter } from "../../src/lib/providers/adapters";
import { readReson8ServerCredential } from "../../src/lib/providers/reson8/live-credential";
import {
  acquireReson8LiveFileLease,
  readBoundedRegularFile,
  writeReson8LiveReportAtomic,
} from "../../src/lib/providers/reson8/live-filesystem";
import {
  RESON8_LIVE_CANONICAL_ROOT,
  RESON8_LIVE_EXPECTED_PHRASE,
  Reson8LivePreflightError,
  buildReson8LiveTurnEvidence,
  parseReson8LiveOperationSelection,
  reson8LiveVerificationReportSchema,
  runReson8LiveVerifier,
  serializeSafeReson8LiveReport,
  validateReson8LiveAudio,
  validateReson8LiveNonSecretGates,
  type Reson8LiveAudioInput,
  type Reson8LiveOperationEvidence,
  type Reson8LiveOperationName,
  type Reson8LiveVerifierDependencies,
  type Reson8LiveVerificationReport,
} from "../../src/lib/providers/reson8/live-verifier";
import { compareReson8SyntheticTranscript } from "../../src/lib/providers/reson8/live-transcript";
import {
  RESON8_REALTIME_DECODER_VERSION,
  Reson8LiveTransportError,
  reson8RealtimeSchemaDiagnosticSchema,
} from "../../src/lib/providers/reson8/live-transport";

function pcmWav(durationSeconds = 0.02): Uint8Array {
  const sampleRate = 16_000;
  const channels = 1;
  const bitsPerSample = 16;
  const dataBytes = Math.round(durationSeconds * sampleRate * channels * (bitsPerSample / 8));
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index);
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, bitsPerSample, true);
  ascii(36, "data");
  view.setUint32(40, dataBytes, true);
  return bytes;
}

function audioInput(durationSeconds = 0.02): Reson8LiveAudioInput {
  const bytes = pcmWav(durationSeconds);
  return {
    file: new File([bytes.slice().buffer], "input.wav", { type: "audio/wav" }),
    bytes,
    manifest: {
      schemaVersion: "one-reson8-live-audio/1.1.0",
      provenance: "local-synthetic-speech",
      expectedPhrase: RESON8_LIVE_EXPECTED_PHRASE,
      expectedTurns: [RESON8_LIVE_EXPECTED_PHRASE],
      sha256: createHash("sha256").update(bytes).digest("hex"),
      byteLength: bytes.byteLength,
    },
    temporary: true,
  };
}

function successfulEvidence(operation: Reson8LiveOperationName): Reson8LiveOperationEvidence {
  const transcriptComparison = compareReson8SyntheticTranscript({
    expected: RESON8_LIVE_EXPECTED_PHRASE,
    observed: RESON8_LIVE_EXPECTED_PHRASE,
    provenance: "local-synthetic-speech",
  });
  return {
    durationMilliseconds: 5,
    eventTypes: operation === "prerecorded"
      ? []
      : operation === "realtime"
        ? ["partial-transcript", "final-transcript", "flush-confirmed"]
        : ["turn-start", "turn-end-candidate", "turn-end"],
    transcriptComparison,
    ...(operation === "turns" ? {
      turnEvidence: {
        turnContractStatus: "passed" as const,
        turnEventSchemaStatus: "passed" as const,
        confirmedTurnCount: 1,
        candidateCountByTurn: [1],
        eventOrderingResult: "passed" as const,
        perTurnFidelity: [{
          turnIndex: 1,
          candidateCount: 1,
          normalizedTranscript: transcriptComparison.observedNormalizedTranscript,
          tokenCount: transcriptComparison.observedTokenCount,
          fidelityStatus: transcriptComparison.status,
          transcriptComparison,
        }],
        sessionTranscriptComparison: transcriptComparison,
        completionStrategy: "last-turn-end-after-audio-then-flush" as const,
        allAudioSent: true as const,
        flushSent: true as const,
        finalActiveTurnFinalized: true as const,
      },
    } : {}),
  };
}

function createDependencies(
  overrides: Partial<Reson8LiveVerifierDependencies> = {},
): Reson8LiveVerifierDependencies {
  const operations: Reson8LiveVerifierDependencies["operations"] = {
    prerecorded: async () => successfulEvidence("prerecorded"),
    realtime: async () => successfulEvidence("realtime"),
    turns: async () => successfulEvidence("turns"),
  };
  return {
    currentWorkingDirectory: RESON8_LIVE_CANONICAL_ROOT,
    environment: {
      NODE_ENV: "development",
      RESON8_LIVE_TEST_APPROVED: "1",
      RESON8_LIVE_TEST_MAX_AUDIO_SECONDS: "10",
    },
    loadAudio: async () => audioInput(),
    acquireExclusiveLease: async () => ({ release: async () => undefined }),
    readCredential: () => readReson8ServerCredential({ RESON8_API_KEY: "unit-only-reson8-secret" }),
    operations,
    writeReport: async () => undefined,
    deleteTemporaryAudio: async () => undefined,
    log: () => undefined,
    wallNow: () => new Date("2026-08-28T12:00:00.000Z"),
    monotonicNow: () => 10,
    ...overrides,
  };
}

test.describe("Reson8 manual live-verifier boundary", () => {
  test("keeps per-turn fidelity separate from aggregate session fidelity", () => {
    const base = {
      providerId: "reson8",
      observedAt: "2026-08-28T12:00:00.000Z",
      monotonicOffsetMilliseconds: 1,
      provenance: "provider" as const,
    };
    const events = [
      { ...base, sequence: 0, type: "turn-start" as const },
      { ...base, sequence: 1, type: "turn-end-candidate" as const, candidateRevision: 1,
        transcript: { text: "first draft" } },
      { ...base, sequence: 2, type: "turn-end-candidate" as const, candidateRevision: 2,
        transcript: { text: "first confirmed" } },
      { ...base, sequence: 3, type: "turn-end" as const, confirmedCandidateRevision: 2,
        transcript: { text: "first confirmed" } },
      { ...base, sequence: 4, type: "turn-start" as const },
      { ...base, sequence: 5, type: "turn-end-candidate" as const, candidateRevision: 3,
        transcript: { text: "second confirmed" } },
      { ...base, sequence: 6, type: "turn-end" as const, confirmedCandidateRevision: 3,
        transcript: { text: "second confirmed" } },
    ];
    const evidence = buildReson8LiveTurnEvidence({
      events,
      expectedPhrase: "first confirmed second confirmed",
      expectedTurns: ["first confirmed", "second confirmed"],
      completion: {
        strategy: "last-turn-end-after-audio-then-flush",
        allAudioSent: true,
        flushSent: true,
        finalActiveTurnFinalized: true,
      },
    });

    expect(evidence.confirmedTurnCount).toBe(2);
    expect(evidence.candidateCountByTurn).toEqual([2, 1]);
    expect(evidence.perTurnFidelity.map((turn) => turn.normalizedTranscript))
      .toEqual(["first confirmed", "second confirmed"]);
    expect(evidence.perTurnFidelity.every((turn) => turn.fidelityStatus === "exact")).toBe(true);
    expect(evidence.sessionTranscriptComparison).toMatchObject({
      observedNormalizedTranscript: "first confirmed second confirmed",
      status: "exact",
    });
  });

  test("does not turn a session mismatch into a transport or event-schema failure", async () => {
    const mismatch = compareReson8SyntheticTranscript({
      expected: RESON8_LIVE_EXPECTED_PHRASE,
      observed: "different synthetic words",
      provenance: "local-synthetic-speech",
    });
    const turnEvidence = successfulEvidence("turns").turnEvidence!;
    const report = await runReson8LiveVerifier(createDependencies({
      selectedOperations: ["turns"],
      operations: {
        prerecorded: async () => successfulEvidence("prerecorded"),
        realtime: async () => successfulEvidence("realtime"),
        turns: async () => ({
          ...successfulEvidence("turns"),
          transcriptComparison: mismatch,
          turnEvidence: { ...turnEvidence, sessionTranscriptComparison: mismatch },
        }),
      },
    }));

    expect(report.operations.find((operation) => operation.operation === "turns")).toMatchObject({
      transportStatus: "passed",
      schemaStatus: "passed",
      transcriptFidelityStatus: "mismatch",
      turnEvidence: {
        turnContractStatus: "passed",
        turnEventSchemaStatus: "passed",
      },
    });
  });

  test("requires the exact local, approval, CI, and duration gates", () => {
    const valid = {
      currentWorkingDirectory: RESON8_LIVE_CANONICAL_ROOT,
      environment: {
        NODE_ENV: "development",
        RESON8_LIVE_TEST_APPROVED: "1",
        RESON8_LIVE_TEST_MAX_AUDIO_SECONDS: "10",
      },
    };
    expect(validateReson8LiveNonSecretGates(valid)).toEqual({ maxAudioSeconds: 10 });

    for (const attempt of [
      { ...valid, currentWorkingDirectory: "C:\\Users\\oneta\\Projects\\another-repository" },
      { ...valid, environment: { ...valid.environment, NODE_ENV: "production" } },
      { ...valid, environment: { ...valid.environment, CI: "1" } },
      { ...valid, environment: { ...valid.environment, RESON8_LIVE_TEST_APPROVED: undefined } },
      { ...valid, environment: { ...valid.environment, RESON8_LIVE_TEST_APPROVED: "true" } },
      { ...valid, environment: { ...valid.environment, RESON8_LIVE_TEST_APPROVED: " 1" } },
      { ...valid, environment: { ...valid.environment, RESON8_LIVE_TEST_MAX_AUDIO_SECONDS: undefined } },
      { ...valid, environment: { ...valid.environment, RESON8_LIVE_TEST_MAX_AUDIO_SECONDS: "10.01" } },
      { ...valid, environment: { ...valid.environment, RESON8_LIVE_TEST_MAX_AUDIO_SECONDS: "0" } },
    ]) {
      expect(() => validateReson8LiveNonSecretGates(attempt)).toThrow(Reson8LivePreflightError);
    }
  });

  test("rejects non-secret preflight failures before reading a credential or constructing an operation", async () => {
    let credentialReads = 0;
    let operations = 0;
    const dependencies = createDependencies({
      environment: {
        NODE_ENV: "development",
        RESON8_LIVE_TEST_APPROVED: "0",
        RESON8_LIVE_TEST_MAX_AUDIO_SECONDS: "10",
      },
      readCredential: () => {
        credentialReads += 1;
        return null;
      },
      operations: {
        prerecorded: async () => { operations += 1; return successfulEvidence("prerecorded"); },
        realtime: async () => { operations += 1; return successfulEvidence("realtime"); },
        turns: async () => { operations += 1; return successfulEvidence("turns"); },
      },
    });

    await expect(runReson8LiveVerifier(dependencies)).rejects.toMatchObject({ code: "approval-required" });
    expect(credentialReads).toBe(0);
    expect(operations).toBe(0);
  });

  test("derives audio duration from trusted PCM structure and rejects forged or malformed bounds", async () => {
    await expect(validateReson8LiveAudio(audioInput(10), 10)).resolves.toMatchObject({
      durationSeconds: 10,
      sampleRate: 16_000,
      channels: 1,
      bitsPerSample: 16,
    });
    await expect(validateReson8LiveAudio(audioInput(1), 0.5)).rejects.toMatchObject({ code: "audio-duration-exceeded" });
    const malformed = new Uint8Array([1, 2, 3]);
    const malformedInput = audioInput();
    await expect(validateReson8LiveAudio({
      file: new File([malformed], "input.wav", { type: "audio/wav" }),
      bytes: malformed,
      manifest: {
        ...malformedInput.manifest,
        sha256: createHash("sha256").update(malformed).digest("hex"),
        byteLength: malformed.byteLength,
      },
      temporary: true,
    }, 10)).rejects.toMatchObject({ code: "audio-format-invalid" });

    const tampered = audioInput();
    const changedBytes = tampered.bytes.slice();
    changedBytes[changedBytes.length - 1] ^= 1;
    await expect(validateReson8LiveAudio({
      ...tampered,
      bytes: changedBytes,
    }, 10)).rejects.toMatchObject({ code: "audio-manifest-hash-mismatch" });

    const differentFileBytes = tampered.bytes.slice();
    differentFileBytes[differentFileBytes.length - 1] ^= 1;
    await expect(validateReson8LiveAudio({
      ...tampered,
      file: new File([differentFileBytes], "input.wav", { type: "audio/wav" }),
    }, 10)).rejects.toMatchObject({ code: "audio-manifest-hash-mismatch" });
  });

  test("rejects a missing credential after bounded input validation without invoking a provider", async () => {
    let operations = 0;
    let releases = 0;
    const dependencies = createDependencies({
      acquireExclusiveLease: async () => ({ release: async () => { releases += 1; } }),
      readCredential: () => null,
      operations: {
        prerecorded: async () => { operations += 1; return successfulEvidence("prerecorded"); },
        realtime: async () => { operations += 1; return successfulEvidence("realtime"); },
        turns: async () => { operations += 1; return successfulEvidence("turns"); },
      },
    });

    await expect(runReson8LiveVerifier(dependencies)).rejects.toMatchObject({
      code: "credential-unavailable",
    });
    expect(operations).toBe(0);
    expect(releases).toBe(1);
  });

  test("runs exactly three operations sequentially with one active operation and zero retries", async () => {
    const calls: string[] = [];
    let active = 0;
    let maxActive = 0;
    const operation = (name: Reson8LiveOperationName) => async () => {
      calls.push(`${name}:start`);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      calls.push(`${name}:end`);
      return successfulEvidence(name);
    };
    let deleted = 0;
    const written: Reson8LiveVerificationReport[] = [];
    const report = await runReson8LiveVerifier(createDependencies({
      operations: {
        prerecorded: operation("prerecorded"),
        realtime: operation("realtime"),
        turns: operation("turns"),
      },
      deleteTemporaryAudio: async () => { deleted += 1; },
      writeReport: async (value) => { written.push(value); },
    }));

    expect(calls).toEqual([
      "prerecorded:start", "prerecorded:end",
      "realtime:start", "realtime:end",
      "turns:start", "turns:end",
    ]);
    expect(maxActive).toBe(1);
    expect(deleted).toBe(1);
    expect(report).toMatchObject({ status: "complete", audio: { cleanupState: "complete" } });
    expect(written).toHaveLength(2);
    expect(written[0]).toMatchObject({
      status: "failed",
      failureCode: "cleanup-failed",
      audio: { cleanupState: "pending" },
    });
    expect(written[1]).toEqual(report);
  });

  test("preserves conservative evidence when cleanup or final atomic replacement fails", async () => {
    let deletedBeforeInitialWriteFailure = 0;
    await expect(runReson8LiveVerifier(createDependencies({
      writeReport: async () => { throw new Error("simulated initial write failure"); },
      deleteTemporaryAudio: async () => { deletedBeforeInitialWriteFailure += 1; },
    }))).rejects.toThrow(/initial write failure/i);
    expect(deletedBeforeInitialWriteFailure).toBe(0);

    const persisted: Reson8LiveVerificationReport[] = [];
    let deletedBeforeFinalWriteFailure = 0;
    await expect(runReson8LiveVerifier(createDependencies({
      writeReport: async (report) => {
        if (persisted.length === 1) throw new Error("simulated final write failure");
        persisted.push(report);
      },
      deleteTemporaryAudio: async () => { deletedBeforeFinalWriteFailure += 1; },
    }))).rejects.toThrow(/final write failure/i);
    expect(deletedBeforeFinalWriteFailure).toBe(1);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({
      status: "failed",
      failureCode: "cleanup-failed",
      audio: { cleanupState: "pending" },
    });

    const cleanupReports: Reson8LiveVerificationReport[] = [];
    const cleanupResult = await runReson8LiveVerifier(createDependencies({
      writeReport: async (report) => { cleanupReports.push(report); },
      deleteTemporaryAudio: async () => { throw new Error("simulated cleanup failure"); },
    }));
    expect(cleanupReports).toHaveLength(2);
    expect(cleanupResult).toMatchObject({
      status: "failed",
      failureCode: "cleanup-failed",
      audio: { cleanupState: "unknown-after-cleanup-error" },
    });
  });

  test("stops without retry after authentication, credit, or concurrency denial and preserves a sanitized partial report", async () => {
    for (const failure of [
      { operation: "prerecorded" as const, code: "authentication-denied" as const, expected: ["prerecorded"] },
      { operation: "realtime" as const, code: "credits-exhausted" as const, expected: ["prerecorded", "realtime"] },
      { operation: "turns" as const, code: "concurrency-limited" as const, expected: ["prerecorded", "realtime", "turns"] },
    ]) {
      const calls: string[] = [];
      const operation = (name: Reson8LiveOperationName) => async () => {
          calls.push(name);
          if (name === failure.operation) {
            throw new Reson8LiveTransportError(failure.code, "fixed safe failure");
          }
          return successfulEvidence(name);
        };
      const operations: Reson8LiveVerifierDependencies["operations"] = {
        prerecorded: operation("prerecorded"),
        realtime: operation("realtime"),
        turns: operation("turns"),
      };
      let report: Reson8LiveVerificationReport | null = null;
      const result = await runReson8LiveVerifier(createDependencies({
        operations,
        writeReport: async (value) => { report = value; },
      }));
      expect(calls).toEqual(failure.expected);
      expect(result).toMatchObject({ status: "failed", failureCode: failure.code });
      expect(report).toEqual(result);
      expect(result.audio.cleanupState).toBe("retained-after-failure");
    }
  });

  test("preserves a fidelity mismatch as evidence while continuing valid transport and schema contracts", async () => {
    const calls: string[] = [];
    const mismatch = compareReson8SyntheticTranscript({
      expected: RESON8_LIVE_EXPECTED_PHRASE,
      observed: "unrelated words that do not match the controlled synthetic sentence",
      provenance: "local-synthetic-speech",
    });
    const result = await runReson8LiveVerifier(createDependencies({
      operations: {
        prerecorded: async () => {
          calls.push("prerecorded");
          return { ...successfulEvidence("prerecorded"), transcriptComparison: mismatch };
        },
        realtime: async () => { calls.push("realtime"); return successfulEvidence("realtime"); },
        turns: async () => { calls.push("turns"); return successfulEvidence("turns"); },
      },
    }));
    expect(calls).toEqual(["prerecorded", "realtime", "turns"]);
    expect(result).toMatchObject({
      status: "complete",
    });
    expect(result.operations[0]).toMatchObject({
      operation: "prerecorded",
      transportStatus: "passed",
      schemaStatus: "passed",
      transcriptFidelityStatus: "mismatch",
    });
    expect(result).not.toHaveProperty("failureCode");
  });

  test("stops after schema failure while preserving transport success and later not-run states", async () => {
    const calls: string[] = [];
    const result = await runReson8LiveVerifier(createDependencies({
      operations: {
        prerecorded: async () => {
          calls.push("prerecorded");
          return { durationMilliseconds: 5, eventTypes: [] } as unknown as Reson8LiveOperationEvidence;
        },
        realtime: async () => { calls.push("realtime"); return successfulEvidence("realtime"); },
        turns: async () => { calls.push("turns"); return successfulEvidence("turns"); },
      },
    }));
    expect(calls).toEqual(["prerecorded"]);
    expect(result).toMatchObject({
      status: "failed",
      failureCode: "malformed-provider-response",
      operations: [
        { operation: "prerecorded", transportStatus: "passed", schemaStatus: "failed" },
        { operation: "realtime", transportStatus: "not-run", schemaStatus: "not-run" },
        { operation: "turns", transportStatus: "not-run", schemaStatus: "not-run" },
      ],
    });
  });

  test("persists only sanitized schema diagnostics and successfully parsed event counts", async () => {
    const privateTranscript = "private transcript must never enter the report";
    const diagnostic = reson8RealtimeSchemaDiagnosticSchema.parse({
      transportPayloadRepresentation: "buffer",
      utf8DecodingSucceeded: true,
      jsonParsingSucceeded: true,
      parsedEventType: "transcript",
      topLevelFieldNames: ["text", "type", "words"],
      topLevelValueTypes: { text: "number", type: "string", words: "array" },
      schemaIssues: [{
        path: "text",
        code: "invalid_type",
        expectedType: "string",
        receivedType: "number",
      }],
      decoderVersion: RESON8_REALTIME_DECODER_VERSION,
    });
    const result = await runReson8LiveVerifier(createDependencies({
      selectedOperations: ["realtime"],
      operations: {
        prerecorded: async () => successfulEvidence("prerecorded"),
        realtime: async () => {
          throw new Reson8LiveTransportError(
            "malformed-provider-response",
            privateTranscript,
            {
              schemaDiagnostic: diagnostic,
              parsedEventTypes: ["partial-transcript", "final-transcript"],
              transportCompletedCleanly: true,
            },
          );
        },
        turns: async () => successfulEvidence("turns"),
      },
    }));
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      status: "failed",
      failureCode: "malformed-provider-response",
      operations: [
        { operation: "prerecorded", eventCounts: {} },
        {
          operation: "realtime",
          transportStatus: "passed",
          schemaStatus: "failed",
          eventCounts: { "partial-transcript": 1, "final-transcript": 1 },
          schemaDiagnostic: diagnostic,
        },
        { operation: "turns", eventCounts: {} },
      ],
    });
    expect(serialized).not.toContain(privateTranscript);
    expect(serialized).not.toContain("unit-only-reson8-secret");
    expect(serialized).not.toContain("ApiKey ");
    expect(serialized).not.toContain("Bearer ");
    expect(serialized).not.toContain("rawProviderResponse");
  });

  test("does not claim transport success when a realtime schema failure prevents clean completion", async () => {
    const result = await runReson8LiveVerifier(createDependencies({
      selectedOperations: ["realtime"],
      operations: {
        prerecorded: async () => successfulEvidence("prerecorded"),
        realtime: async () => {
          throw new Reson8LiveTransportError("malformed-provider-response", "safe fixture failure");
        },
        turns: async () => successfulEvidence("turns"),
      },
    }));
    expect(result.operations[1]).toMatchObject({
      transportStatus: "failed",
      schemaStatus: "failed",
      transcriptFidelityStatus: "not-evaluated",
      eventCounts: {},
    });
  });

  test("accepts only the bounded full plan or one recognized --only operation", async () => {
    expect(parseReson8LiveOperationSelection([])).toEqual(["prerecorded", "realtime", "turns"]);
    for (const operation of ["prerecorded", "realtime", "turns"] as const) {
      expect(parseReson8LiveOperationSelection(["--only", operation])).toEqual([operation]);
      const calls: string[] = [];
      const result = await runReson8LiveVerifier(createDependencies({
        selectedOperations: [operation],
        operations: {
          prerecorded: async () => { calls.push("prerecorded"); return successfulEvidence("prerecorded"); },
          realtime: async () => { calls.push("realtime"); return successfulEvidence("realtime"); },
          turns: async () => { calls.push("turns"); return successfulEvidence("turns"); },
        },
      }));
      expect(calls).toEqual([operation]);
      expect(result.limits).toMatchObject({
        selectedOperations: [operation],
        operationCount: 1,
        maxConcurrency: 1,
        maxRetries: 0,
      });
      expect(result.operations.filter((entry) => entry.selected).map((entry) => entry.operation)).toEqual([operation]);
    }
    for (const invalid of [
      ["--only"],
      ["--only", "unknown"],
      ["--only", "prerecorded", "extra"],
      ["--other", "prerecorded"],
    ]) {
      expect(() => parseReson8LiveOperationSelection(invalid)).toThrow(Reson8LivePreflightError);
    }
  });

  test("serializes only the strict allowlist and rejects secret or arbitrary fields", async () => {
    const credential = readReson8ServerCredential({ RESON8_API_KEY: "unit-only-reson8-secret" });
    expect(credential).not.toBeNull();
    const report = await runReson8LiveVerifier(createDependencies());
    const serialized = serializeSafeReson8LiveReport(report, credential!);
    expect(serialized).not.toContain("unit-only-reson8-secret");
    expect(serialized).not.toContain("ApiKey ");
    expect(serialized).not.toContain("Bearer ");
    expect(serialized).not.toContain("requestId");
    expect(serialized).not.toContain('"providerTranscript":');
    expect(serialized).not.toContain('"rawProviderResponse":');
    expect(serialized).toContain(RESON8_LIVE_EXPECTED_PHRASE);
    expect(serialized).toContain('"observedNormalizedTranscript"');
    expect(serialized).toContain('"turnEvidence"');
    expect(serialized).toContain('"candidateCountByTurn"');
    expect(serialized).not.toContain('"rawPrivateTranscript"');
    expect(report.privacy).toMatchObject({
      rawProviderTranscriptPersisted: false,
      syntheticTranscriptDiagnosticsPersisted: true,
      privateTranscriptDiagnosticsPermitted: false,
    });

    expect(() => reson8LiveVerificationReportSchema.parse({
      ...report,
      rawProviderResponse: "unit-only-reson8-secret",
    })).toThrow();
    const turnsIndex = report.operations.findIndex((operation) => operation.operation === "turns");
    expect(() => reson8LiveVerificationReportSchema.parse({
      ...report,
      operations: report.operations.map((operation, index) => index === turnsIndex ? {
        ...operation,
        turnEvidence: { ...operation.turnEvidence, rawPrivateTranscript: "private" },
      } : operation),
    })).toThrow();
  });

  test("uses an exclusive local lease and atomically writes no partial or unsanitized report", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "one-reson8-live-"));
    try {
      const firstLease = await acquireReson8LiveFileLease(directory);
      await expect(acquireReson8LiveFileLease(directory)).rejects.toThrow(/lease already exists/i);
      await firstLease.release();
      const secondLease = await acquireReson8LiveFileLease(directory);
      await secondLease.release();

      const credential = readReson8ServerCredential({ RESON8_API_KEY: "unit-only-reson8-secret" });
      expect(credential).not.toBeNull();
      const report = await runReson8LiveVerifier(createDependencies());
      const reportPath = await writeReson8LiveReportAtomic({ directory, report, credential: credential! });
      expect(JSON.parse(await readFile(reportPath, "utf8"))).toEqual(report);
      await writeReson8LiveReportAtomic({ directory, report, credential: credential! });
      expect(JSON.parse(await readFile(reportPath, "utf8"))).toEqual(report);
      expect((await readdir(directory)).filter((name) => name.endsWith(".tmp"))).toEqual([]);

      const unsafeReport = { ...report, rawAuthorization: "ApiKey unit-only-reson8-secret" };
      await expect(writeReson8LiveReportAtomic({
        directory: path.join(directory, "unsafe"),
        report: unsafeReport as Reson8LiveVerificationReport,
        credential: credential!,
      })).rejects.toThrow();
      await expect(readdir(path.join(directory, "unsafe"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("reads only a fixed opened-file length and rejects concurrent growth before returning bytes", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "one-reson8-bounded-file-"));
    const inputPath = path.join(directory, "input.bin");
    try {
      await writeFile(inputPath, Buffer.alloc(32, 1));
      await expect(readBoundedRegularFile(inputPath, 64, {
        afterOpen: async () => { await appendFile(inputPath, Buffer.alloc(64, 2)); },
      })).rejects.toThrow(/changed during reading/i);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("keeps the ordinary app resolver disabled and the live command isolated from automated scripts", async () => {
    expect(() => resolveSttAdapter("reson8")).toThrow(/disabled/i);
    const packageJson = JSON.parse(await (await import("node:fs/promises")).readFile("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts["verify:reson8:live"]).toContain("scripts/verify-reson8-live.ts");
    expect(packageJson.scripts["verify:reson8:preflight"]).toContain("scripts/verify-reson8-preflight.ts");
    expect(packageJson.scripts.test).not.toContain("verify:reson8:live");
    expect(packageJson.scripts.test).not.toContain("verify:reson8:preflight");
    expect(packageJson.scripts.build).not.toContain("verify:reson8:live");
  });
});
