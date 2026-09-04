import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import { monotonicNow } from "@/lib/providers/audio-response";
import type { Reson8ServerCredential } from "@/lib/providers/reson8/live-credential";
import {
  reson8RealtimeSchemaDiagnosticSchema,
  Reson8LiveTransportError,
  type Reson8LiveFailureCode,
  type Reson8RealtimeSchemaDiagnostic,
} from "@/lib/providers/reson8/live-transport";
import { Reson8ProtocolError } from "@/lib/providers/reson8/protocol";
import {
  compareReson8SyntheticTranscript,
  normalizeReson8SyntheticTranscript,
  reson8SyntheticTranscriptComparisonSchema,
  reson8TranscriptFidelityStatusSchema,
} from "@/lib/providers/reson8/live-transcript";
import type { NormalizedTurnAwareSttEvent } from "@/lib/providers/turn-aware-stt";
import { inspectTrustedSttAudio, type TrustedSttAudio } from "@/lib/stt-audio-admission";

export const RESON8_LIVE_VERIFIER_VERSION = "one-reson8-live-verifier/1.3.0" as const;
export const RESON8_LIVE_REPORT_SCHEMA_VERSION = "one-reson8-live-report/1.3.0" as const;
export const RESON8_LIVE_EXPECTED_PHRASE = "This short recording verifies turn detection without personal information." as const;
export const RESON8_LIVE_EXPECTED_TURNS = [RESON8_LIVE_EXPECTED_PHRASE] as const;
export const RESON8_LIVE_MAX_AUDIO_SECONDS = 10;
export const RESON8_LIVE_MAX_CONCURRENCY = 1;
export const RESON8_LIVE_MAX_RETRIES = 0;
export const RESON8_LIVE_CANONICAL_ROOT = "C:\\Users\\oneta\\Projects\\ONE-voice-lab" as const;

export const reson8LiveOperationNameSchema = z.enum(["prerecorded", "realtime", "turns"]);
export type Reson8LiveOperationName = z.infer<typeof reson8LiveOperationNameSchema>;
const RESON8_LIVE_OPERATION_ORDER = ["prerecorded", "realtime", "turns"] as const;

export const reson8LiveAudioManifestSchema = z.object({
  schemaVersion: z.literal("one-reson8-live-audio/1.1.0"),
  provenance: z.literal("local-synthetic-speech"),
  expectedPhrase: z.literal(RESON8_LIVE_EXPECTED_PHRASE),
  expectedTurns: z.tuple([z.literal(RESON8_LIVE_EXPECTED_PHRASE)]),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteLength: z.number().int().positive().max(512 * 1024),
}).strict();

export type Reson8LiveAudioManifest = z.infer<typeof reson8LiveAudioManifestSchema>;

const reson8LiveEventTypeSchema = z.enum([
  "partial-transcript",
  "final-transcript",
  "flush-confirmed",
  "turn-start",
  "turn-end-candidate",
  "turn-end",
]);

const turnStatusSchema = z.enum(["not-run", "passed", "failed"]);
const turnEventOrderingSchema = z.enum(["not-run", "passed", "failed"]);
const perTurnFidelitySchema = z.object({
  turnIndex: z.number().int().positive().max(128),
  candidateCount: z.number().int().positive().max(128),
  normalizedTranscript: z.string().max(64_000),
  tokenCount: z.number().int().nonnegative().max(10_000),
  fidelityStatus: reson8TranscriptFidelityStatusSchema,
  transcriptComparison: reson8SyntheticTranscriptComparisonSchema.optional(),
}).strict().superRefine((value, context) => {
  if ((value.fidelityStatus === "not-evaluated") === Boolean(value.transcriptComparison)) {
    context.addIssue({ code: "custom", message: "Per-turn fidelity requires an explicitly assigned expected turn." });
  }
});

export const reson8LiveTurnEvidenceSchema = z.object({
  turnContractStatus: turnStatusSchema,
  turnEventSchemaStatus: turnStatusSchema,
  confirmedTurnCount: z.number().int().nonnegative().max(128),
  candidateCountByTurn: z.array(z.number().int().positive().max(128)).max(128),
  eventOrderingResult: turnEventOrderingSchema,
  perTurnFidelity: z.array(perTurnFidelitySchema).max(128),
  sessionTranscriptComparison: reson8SyntheticTranscriptComparisonSchema,
  completionStrategy: z.literal("last-turn-end-after-audio-then-flush"),
  allAudioSent: z.literal(true),
  flushSent: z.literal(true),
  finalActiveTurnFinalized: z.literal(true),
}).strict().superRefine((value, context) => {
  if (value.confirmedTurnCount !== value.perTurnFidelity.length
      || value.confirmedTurnCount !== value.candidateCountByTurn.length) {
    context.addIssue({ code: "custom", message: "Turn evidence counts must describe every confirmed turn." });
  }
});

export type Reson8LiveTurnEvidence = z.infer<typeof reson8LiveTurnEvidenceSchema>;

export function buildReson8LiveTurnEvidence(input: Readonly<{
  events: readonly NormalizedTurnAwareSttEvent[];
  expectedPhrase: string;
  expectedTurns: readonly string[];
  completion: Readonly<{
    strategy: "last-turn-end-after-audio-then-flush";
    allAudioSent: true;
    flushSent: true;
    finalActiveTurnFinalized: true;
  }>;
}>): Reson8LiveTurnEvidence {
  const confirmedTurns: Array<{ transcript: string; candidateCount: number }> = [];
  let activeCandidateCount = 0;
  for (const event of input.events) {
    if (event.type === "turn-start") activeCandidateCount = 0;
    else if (event.type === "turn-end-candidate") activeCandidateCount += 1;
    else if (event.type === "turn-end") {
      confirmedTurns.push({ transcript: event.transcript.text, candidateCount: activeCandidateCount });
      activeCandidateCount = 0;
    }
  }

  const perTurnFidelity = confirmedTurns.map((turn, index) => {
    const normalizedTranscript = normalizeReson8SyntheticTranscript(turn.transcript);
    const expected = input.expectedTurns[index];
    const transcriptComparison = expected === undefined ? undefined : compareReson8SyntheticTranscript({
      expected,
      observed: turn.transcript,
      provenance: "local-synthetic-speech",
    });
    return {
      turnIndex: index + 1,
      candidateCount: turn.candidateCount,
      normalizedTranscript,
      tokenCount: normalizedTranscript ? normalizedTranscript.split(" ").length : 0,
      fidelityStatus: transcriptComparison?.status ?? "not-evaluated" as const,
      ...(transcriptComparison ? { transcriptComparison } : {}),
    };
  });
  const aggregateTranscript = confirmedTurns.map((turn) => turn.transcript.trim()).filter(Boolean).join(" ");

  return reson8LiveTurnEvidenceSchema.parse({
    turnContractStatus: confirmedTurns.length > 0 ? "passed" : "failed",
    turnEventSchemaStatus: "passed",
    confirmedTurnCount: confirmedTurns.length,
    candidateCountByTurn: confirmedTurns.map((turn) => turn.candidateCount),
    eventOrderingResult: "passed",
    perTurnFidelity,
    sessionTranscriptComparison: compareReson8SyntheticTranscript({
      expected: input.expectedPhrase,
      observed: aggregateTranscript,
      provenance: "local-synthetic-speech",
    }),
    completionStrategy: input.completion.strategy,
    allAudioSent: input.completion.allAudioSent,
    flushSent: input.completion.flushSent,
    finalActiveTurnFinalized: input.completion.finalActiveTurnFinalized,
  });
}

export const reson8LiveOperationEvidenceSchema = z.object({
  durationMilliseconds: z.number().finite().nonnegative().max(60_000),
  eventTypes: z.array(reson8LiveEventTypeSchema).max(128),
  transcriptComparison: reson8SyntheticTranscriptComparisonSchema,
  turnEvidence: reson8LiveTurnEvidenceSchema.optional(),
}).strict();

export type Reson8LiveOperationEvidence = z.infer<typeof reson8LiveOperationEvidenceSchema>;

const safeFailureCodeSchema = z.enum([
  "authentication-denied",
  "credits-exhausted",
  "concurrency-limited",
  "provider-rejected",
  "response-too-large",
  "malformed-provider-response",
  "unsupported-provider-event",
  "cancelled",
  "timed-out",
  "transport-failed",
  "unexpected-close",
  "cleanup-failed",
]);

const operationTransportStatusSchema = z.enum(["not-run", "passed", "failed"]);
const operationSchemaStatusSchema = z.enum(["not-run", "passed", "failed"]);

const operationReportSchema = z.object({
  operation: reson8LiveOperationNameSchema,
  selected: z.boolean(),
  transportStatus: operationTransportStatusSchema,
  schemaStatus: operationSchemaStatusSchema,
  transcriptFidelityStatus: reson8TranscriptFidelityStatusSchema,
  durationMilliseconds: z.number().finite().nonnegative().max(60_000),
  eventCounts: z.record(z.string(), z.number().int().nonnegative().max(128)).superRefine((value, context) => {
    for (const key of Object.keys(value)) {
      if (!reson8LiveEventTypeSchema.safeParse(key).success) {
        context.addIssue({ code: "custom", message: "The live report contains an unsupported event type." });
      }
    }
  }),
  transcriptComparison: reson8SyntheticTranscriptComparisonSchema.optional(),
  turnEvidence: reson8LiveTurnEvidenceSchema.optional(),
  schemaDiagnostic: reson8RealtimeSchemaDiagnosticSchema.optional(),
  errorCode: safeFailureCodeSchema.optional(),
}).strict().superRefine((value, context) => {
  const completedContract = value.transportStatus === "passed" && value.schemaStatus === "passed";
  if (completedContract !== Boolean(value.transcriptComparison)) {
    context.addIssue({ code: "custom", message: "Completed contract checks require synthetic fidelity evidence." });
  }
  if (completedContract && value.transcriptFidelityStatus === "not-evaluated") {
    context.addIssue({ code: "custom", message: "Completed contract checks require a fidelity classification." });
  }
  if (!completedContract && value.transcriptFidelityStatus !== "not-evaluated") {
    context.addIssue({ code: "custom", message: "Incomplete contract checks cannot claim transcript fidelity." });
  }
  if (!value.selected && (value.transportStatus !== "not-run" || value.schemaStatus !== "not-run")) {
    context.addIssue({ code: "custom", message: "Unselected operations must remain not-run." });
  }
  if (value.schemaDiagnostic && value.schemaStatus !== "failed") {
    context.addIssue({ code: "custom", message: "Sanitized schema diagnostics are allowed only for schema failures." });
  }
  if (Boolean(value.turnEvidence) !== (value.operation === "turns" && completedContract)) {
    context.addIssue({ code: "custom", message: "Completed Turns contracts require turn-specific evidence." });
  }
});

export const reson8LiveVerificationReportSchema = z.object({
  schemaVersion: z.literal(RESON8_LIVE_REPORT_SCHEMA_VERSION),
  verifierVersion: z.literal(RESON8_LIVE_VERIFIER_VERSION),
  providerId: z.literal("reson8"),
  providerModelIdentifier: z.literal("unavailable-not-reported"),
  mode: z.literal("manual-local-live-contract"),
  status: z.enum(["complete", "failed"]),
  startedAt: z.string().datetime({ offset: true }),
  completedAt: z.string().datetime({ offset: true }),
  approval: z.object({ explicit: z.literal(true), environment: z.literal("local-development") }).strict(),
  credential: z.object({ present: z.literal(true), persisted: z.literal(false), exposed: z.literal(false) }).strict(),
  audio: z.object({
    provenance: z.literal("local-synthetic-speech"),
    expectedPhrase: z.literal(RESON8_LIVE_EXPECTED_PHRASE),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    durationSeconds: z.number().positive().max(RESON8_LIVE_MAX_AUDIO_SECONDS),
    sampleRate: z.literal(16_000),
    channels: z.literal(1),
    bitsPerSample: z.literal(16),
    cleanupState: z.enum([
      "retained-after-failure",
      "pending",
      "complete",
      "unknown-after-cleanup-error",
    ]),
  }).strict(),
  limits: z.object({
    selectedOperations: z.array(reson8LiveOperationNameSchema).min(1).max(3),
    operationCount: z.number().int().min(1).max(3),
    maxConcurrency: z.literal(RESON8_LIVE_MAX_CONCURRENCY),
    maxRetries: z.literal(RESON8_LIVE_MAX_RETRIES),
    maxAudioSeconds: z.number().positive().max(RESON8_LIVE_MAX_AUDIO_SECONDS),
  }).strict(),
  usageEstimate: z.object({
    maximumSubmittedAudioSeconds: z.number().positive().max(RESON8_LIVE_MAX_AUDIO_SECONDS * 3),
    providerCredits: z.literal("unavailable-unverified"),
    monetaryCost: z.literal("unavailable-unverified"),
    basis: z.string().min(1).max(120),
  }).strict(),
  operations: z.array(operationReportSchema).length(3),
  privacy: z.object({
    rawAudioPersistedInReport: z.literal(false),
    rawProviderTranscriptPersisted: z.literal(false),
    syntheticTranscriptDiagnosticsPersisted: z.literal(true),
    privateTranscriptDiagnosticsPermitted: z.literal(false),
    providerResponsePersisted: z.literal(false),
    providerRequestIdentifierPersisted: z.literal(false),
    authorizationMaterialPersisted: z.literal(false),
  }).strict(),
  applicationBoundary: z.object({
    globallyEnabled: z.literal(false),
    publicRankingEligible: z.literal(false),
    publicInvocationExposed: z.literal(false),
  }).strict(),
  failureCode: safeFailureCodeSchema.optional(),
}).strict();

export type Reson8LiveVerificationReport = z.infer<typeof reson8LiveVerificationReportSchema>;

export type Reson8LiveAudioInput = Readonly<{
  file: File;
  bytes: Uint8Array;
  manifest: Reson8LiveAudioManifest;
  temporary: true;
}>;

export type Reson8LiveOperationInput = Readonly<{
  audio: Reson8LiveAudioInput;
  credential: Reson8ServerCredential;
  expectedPhrase: typeof RESON8_LIVE_EXPECTED_PHRASE;
  expectedTurns: typeof RESON8_LIVE_EXPECTED_TURNS;
}>;

export type Reson8LiveVerifierDependencies = Readonly<{
  currentWorkingDirectory: string;
  environment: Readonly<Record<string, string | undefined>>;
  loadAudio(): Promise<Reson8LiveAudioInput>;
  acquireExclusiveLease(): Promise<Readonly<{ release(): Promise<void> }>>;
  readCredential(): Reson8ServerCredential | null;
  operations: Readonly<Record<Reson8LiveOperationName,
    (input: Reson8LiveOperationInput) => Promise<Reson8LiveOperationEvidence>>>;
  selectedOperations?: readonly Reson8LiveOperationName[];
  writeReport(report: Reson8LiveVerificationReport, credential: Reson8ServerCredential): Promise<void>;
  deleteTemporaryAudio(): Promise<void>;
  log(message: string): void;
  wallNow?: () => Date;
  monotonicNow?: () => number;
}>;

export class Reson8LivePreflightError extends Error {
  readonly code:
    | "wrong-repository"
    | "not-local-development"
    | "ci-disallowed"
    | "approval-required"
    | "invalid-audio-limit"
    | "invalid-operation-selection"
    | "audio-unavailable"
    | "audio-file-missing"
    | "audio-file-invalid"
    | "audio-manifest-missing"
    | "audio-manifest-invalid"
    | "audio-manifest-hash-mismatch"
    | "audio-manifest-length-mismatch"
    | "audio-format-invalid"
    | "audio-format-unsupported"
    | "audio-duration-invalid"
    | "audio-duration-exceeded"
    | "audio-sample-rate-invalid"
    | "audio-channel-count-invalid"
    | "audio-bit-depth-invalid"
    | "credential-unavailable"
    | "verification-in-flight";

  constructor(code: Reson8LivePreflightError["code"], message: string) {
    super(message);
    this.name = "Reson8LivePreflightError";
    this.code = code;
  }
}

export function parseReson8LiveOperationSelection(
  arguments_: readonly string[],
): readonly Reson8LiveOperationName[] {
  if (arguments_.length === 0) return RESON8_LIVE_OPERATION_ORDER;
  if (arguments_.length !== 2 || arguments_[0] !== "--only") {
    throw new Reson8LivePreflightError(
      "invalid-operation-selection",
      "Use no arguments for the bounded full sequence or --only prerecorded|realtime|turns.",
    );
  }
  const operation = reson8LiveOperationNameSchema.safeParse(arguments_[1]);
  if (!operation.success) {
    throw new Reson8LivePreflightError(
      "invalid-operation-selection",
      "The --only operation must be prerecorded, realtime, or turns.",
    );
  }
  return Object.freeze([operation.data]);
}

export function validateReson8LiveNonSecretGates(input: Readonly<{
  currentWorkingDirectory: string;
  environment: Readonly<Record<string, string | undefined>>;
}>): Readonly<{ maxAudioSeconds: number }> {
  if (normalizeWindowsPath(input.currentWorkingDirectory) !== normalizeWindowsPath(RESON8_LIVE_CANONICAL_ROOT)) {
    throw new Reson8LivePreflightError(
      "wrong-repository",
      "The Reson8 live verifier must run from the canonical ONE Voice Lab repository.",
    );
  }
  if (input.environment.NODE_ENV !== "development") {
    throw new Reson8LivePreflightError(
      "not-local-development",
      "The Reson8 live verifier is restricted to an explicit local development environment.",
    );
  }
  if (["CI", "GITHUB_ACTIONS", "VERCEL", "VERCEL_ENV"].some((name) => environmentFlagEnabled(input.environment[name]))) {
    throw new Reson8LivePreflightError(
      "ci-disallowed",
      "The Reson8 live verifier cannot run in CI or a hosted deployment environment.",
    );
  }
  if (input.environment.RESON8_LIVE_TEST_APPROVED !== "1") {
    throw new Reson8LivePreflightError(
      "approval-required",
      "Set RESON8_LIVE_TEST_APPROVED=1 only for a separately approved manual live check.",
    );
  }
  const rawMax = input.environment.RESON8_LIVE_TEST_MAX_AUDIO_SECONDS;
  if (!rawMax || !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(rawMax)) {
    throw new Reson8LivePreflightError(
      "invalid-audio-limit",
      "RESON8_LIVE_TEST_MAX_AUDIO_SECONDS must be an explicit positive number no greater than 10.",
    );
  }
  const maxAudioSeconds = Number(rawMax);
  if (!Number.isFinite(maxAudioSeconds) || maxAudioSeconds <= 0 || maxAudioSeconds > RESON8_LIVE_MAX_AUDIO_SECONDS) {
    throw new Reson8LivePreflightError(
      "invalid-audio-limit",
      "RESON8_LIVE_TEST_MAX_AUDIO_SECONDS must be an explicit positive number no greater than 10.",
    );
  }
  return Object.freeze({ maxAudioSeconds });
}

export async function validateReson8LiveAudio(
  audio: Reson8LiveAudioInput,
  maxAudioSeconds: number,
): Promise<TrustedSttAudio> {
  const manifest = reson8LiveAudioManifestSchema.safeParse(audio.manifest);
  const fileBytes = new Uint8Array(await audio.file.arrayBuffer());
  const byteDigest = createHash("sha256").update(audio.bytes).digest("hex");
  const fileDigest = createHash("sha256").update(fileBytes).digest("hex");
  if (!manifest.success) {
    throw new Reson8LivePreflightError(
      "audio-manifest-invalid",
      "The Reson8 audio manifest does not match the supported versioned schema.",
    );
  }
  if (manifest.data.sha256 !== byteDigest || manifest.data.sha256 !== fileDigest) {
    throw new Reson8LivePreflightError(
      "audio-manifest-hash-mismatch",
      "The SHA-256 digest of input.wav does not match input.manifest.json.",
    );
  }
  if (
    manifest.data.byteLength !== audio.bytes.byteLength
    || manifest.data.byteLength !== fileBytes.byteLength
    || audio.bytes.byteLength !== audio.file.size
  ) {
    throw new Reson8LivePreflightError(
      "audio-manifest-length-mismatch",
      "The byte length of input.wav does not match input.manifest.json.",
    );
  }
  if (
    fileBytes.byteLength < 12
    || asciiPrefix(fileBytes, 0, 4) !== "RIFF"
    || asciiPrefix(fileBytes, 8, 12) !== "WAVE"
  ) {
    throw new Reson8LivePreflightError(
      "audio-format-invalid",
      "input.wav is not a complete RIFF/WAVE container.",
    );
  }
  const inspected = await inspectTrustedSttAudio(audio.file);
  if (!inspected.ok) {
    throw new Reson8LivePreflightError(
      classifyTrustedAudioFailure(inspected.code, inspected.message),
      inspected.message,
    );
  }
  if (inspected.audio.durationSeconds <= 0) {
    throw new Reson8LivePreflightError(
      "audio-duration-invalid",
      "The manual Reson8 sample must have a positive decoded duration.",
    );
  }
  if (
    inspected.audio.durationSeconds > maxAudioSeconds
    || inspected.audio.durationSeconds > RESON8_LIVE_MAX_AUDIO_SECONDS
  ) {
    throw new Reson8LivePreflightError(
      "audio-duration-exceeded",
      `The decoded WAV duration (${inspected.audio.durationSeconds}s) exceeds the ${Math.min(maxAudioSeconds, RESON8_LIVE_MAX_AUDIO_SECONDS)}s preflight limit.`,
    );
  }
  if (inspected.audio.sampleRate !== 16_000) {
    throw new Reson8LivePreflightError(
      "audio-sample-rate-invalid",
      `The manual Reson8 sample rate is ${inspected.audio.sampleRate} Hz; 16000 Hz is required.`,
    );
  }
  if (inspected.audio.channels !== 1) {
    throw new Reson8LivePreflightError(
      "audio-channel-count-invalid",
      `The manual Reson8 sample has ${inspected.audio.channels} channels; mono audio is required.`,
    );
  }
  if (inspected.audio.bitsPerSample !== 16) {
    throw new Reson8LivePreflightError(
      "audio-bit-depth-invalid",
      `The manual Reson8 sample uses ${inspected.audio.bitsPerSample}-bit PCM; 16-bit PCM is required.`,
    );
  }
  return inspected.audio;
}

function classifyTrustedAudioFailure(
  code: "invalid_audio" | "audio_too_large" | "audio_too_long" | "unsupported_audio",
  message: string,
): Reson8LivePreflightError["code"] {
  if (code === "unsupported_audio") return "audio-format-unsupported";
  if (code === "audio_too_large" || code === "audio_too_long") return "audio-duration-exceeded";
  if (/positive duration|empty|data chunk/i.test(message)) return "audio-duration-invalid";
  return "audio-format-invalid";
}

function asciiPrefix(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

export async function runReson8LiveVerifier(
  dependencies: Reson8LiveVerifierDependencies,
): Promise<Reson8LiveVerificationReport> {
  const gate = validateReson8LiveNonSecretGates(dependencies);
  const selectedOperations = validateSelectedOperations(dependencies.selectedOperations);
  const audio = await dependencies.loadAudio();
  const trustedAudio = await validateReson8LiveAudio(audio, gate.maxAudioSeconds);
  const lease = await dependencies.acquireExclusiveLease();
  const wallNow = dependencies.wallNow ?? (() => new Date());
  const monotonic = dependencies.monotonicNow ?? monotonicNow;
  const startedAt = wallNow().toISOString();
  const attemptedOperations = new Map<Reson8LiveOperationName, Reson8LiveVerificationReport["operations"][number]>();
  let credential: Reson8ServerCredential | null = null;
  let failureCode: Reson8LiveVerificationReport["failureCode"];

  try {
    credential = dependencies.readCredential();
    if (!credential) {
      throw new Reson8LivePreflightError(
        "credential-unavailable",
        "The Reson8 server credential is not configured for this manual local check.",
      );
    }

    dependencies.log("Reson8 credential present: YES");
    const maximumSubmittedAudioSeconds = boundedAudioSeconds(
      trustedAudio.durationSeconds * selectedOperations.length,
    );
    dependencies.log(
      `Approved plan: ${selectedOperations.length} sequential operation${selectedOperations.length === 1 ? "" : "s"} `
      + `(${selectedOperations.join(", ")}), concurrency 1, retries 0, `
      + `${trustedAudio.durationSeconds} trusted audio seconds each `
      + `(${maximumSubmittedAudioSeconds} submitted audio-seconds maximum).`,
    );
    dependencies.log("Provider-credit and monetary-cost estimates: unavailable until versioned billing metadata is verified.");

    const operationInput: Reson8LiveOperationInput = Object.freeze({
      audio,
      credential,
      expectedPhrase: RESON8_LIVE_EXPECTED_PHRASE,
      expectedTurns: RESON8_LIVE_EXPECTED_TURNS,
    });

    for (const operation of selectedOperations) {
      const operationStartedAt = monotonic();
      try {
        const evidence = reson8LiveOperationEvidenceSchema.safeParse(
          await dependencies.operations[operation](operationInput),
        );
        if (!evidence.success) {
          failureCode = "malformed-provider-response";
          attemptedOperations.set(operation, Object.freeze({
            operation,
            selected: true,
            transportStatus: "passed",
            schemaStatus: "failed",
            transcriptFidelityStatus: "not-evaluated",
            durationMilliseconds: boundedDuration(monotonic() - operationStartedAt),
            eventCounts: {},
            errorCode: failureCode,
          }));
          break;
        }
        attemptedOperations.set(operation, Object.freeze({
          operation,
          selected: true,
          transportStatus: "passed",
          schemaStatus: "passed",
          transcriptFidelityStatus: evidence.data.transcriptComparison.status,
          durationMilliseconds: evidence.data.durationMilliseconds,
          eventCounts: countEventTypes(evidence.data.eventTypes),
          transcriptComparison: evidence.data.transcriptComparison,
          ...(evidence.data.turnEvidence ? { turnEvidence: evidence.data.turnEvidence } : {}),
        }));
      } catch (error) {
        const failure = classifyOperationFailure(error);
        failureCode = failure.code;
        attemptedOperations.set(operation, Object.freeze({
          operation,
          selected: true,
          transportStatus: failure.transportStatus,
          schemaStatus: failure.schemaStatus,
          transcriptFidelityStatus: "not-evaluated",
          durationMilliseconds: boundedDuration(monotonic() - operationStartedAt),
          eventCounts: countEventTypes(failure.eventTypes),
          ...(failure.schemaDiagnostic ? { schemaDiagnostic: failure.schemaDiagnostic } : {}),
          errorCode: failureCode,
        }));
        break;
      }
    }

    const operations = materializeOperationReports(attemptedOperations, selectedOperations);
    const operationPlanComplete = !failureCode
      && selectedOperations.every((operation) => {
        const report = attemptedOperations.get(operation);
        return report?.transportStatus === "passed" && report.schemaStatus === "passed";
      });

    if (operationPlanComplete) {
      // Persist a conservative failure record before removing the diagnostic
      // sample. If cleanup or the final atomic replace fails, evidence remains.
      const preCleanupReport = buildVerificationReport({
        startedAt,
        completedAt: wallNow().toISOString(),
        trustedAudio,
        maxAudioSeconds: gate.maxAudioSeconds,
        operations,
        selectedOperations,
        audioSha256: audio.manifest.sha256,
        failureCode: "cleanup-failed",
        cleanupState: "pending",
      });
      await dependencies.writeReport(preCleanupReport, credential);
      try {
        await dependencies.deleteTemporaryAudio();
      } catch {
        const cleanupFailureReport = buildVerificationReport({
          startedAt,
          completedAt: wallNow().toISOString(),
          trustedAudio,
          maxAudioSeconds: gate.maxAudioSeconds,
          operations,
          selectedOperations,
          audioSha256: audio.manifest.sha256,
          failureCode: "cleanup-failed",
          cleanupState: "unknown-after-cleanup-error",
        });
        try {
          await dependencies.writeReport(cleanupFailureReport, credential);
          return cleanupFailureReport;
        } catch {
          return preCleanupReport;
        }
      }
      const completeReport = buildVerificationReport({
        startedAt,
        completedAt: wallNow().toISOString(),
        trustedAudio,
        maxAudioSeconds: gate.maxAudioSeconds,
        operations,
        selectedOperations,
        audioSha256: audio.manifest.sha256,
        cleanupState: "complete",
      });
      await dependencies.writeReport(completeReport, credential);
      return completeReport;
    }

    const report = buildVerificationReport({
      startedAt,
      completedAt: wallNow().toISOString(),
      operations,
      selectedOperations,
      audioSha256: audio.manifest.sha256,
      trustedAudio,
      maxAudioSeconds: gate.maxAudioSeconds,
      failureCode: failureCode ?? "transport-failed",
      cleanupState: "retained-after-failure",
    });
    await dependencies.writeReport(report, credential);
    return report;
  } finally {
    await lease.release();
  }
}

function buildVerificationReport(input: Readonly<{
  startedAt: string;
  completedAt: string;
  trustedAudio: TrustedSttAudio;
  maxAudioSeconds: number;
  operations: Reson8LiveVerificationReport["operations"];
  selectedOperations: readonly Reson8LiveOperationName[];
  audioSha256: string;
  failureCode?: Reson8LiveVerificationReport["failureCode"];
  cleanupState: Reson8LiveVerificationReport["audio"]["cleanupState"];
}>): Reson8LiveVerificationReport {
  return reson8LiveVerificationReportSchema.parse({
    schemaVersion: RESON8_LIVE_REPORT_SCHEMA_VERSION,
    verifierVersion: RESON8_LIVE_VERIFIER_VERSION,
    providerId: "reson8",
    providerModelIdentifier: "unavailable-not-reported",
    mode: "manual-local-live-contract",
    status: input.failureCode ? "failed" : "complete",
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    approval: { explicit: true, environment: "local-development" },
    credential: { present: true, persisted: false, exposed: false },
    audio: {
      provenance: "local-synthetic-speech",
      expectedPhrase: RESON8_LIVE_EXPECTED_PHRASE,
      sha256: input.audioSha256,
      durationSeconds: input.trustedAudio.durationSeconds,
      sampleRate: input.trustedAudio.sampleRate,
      channels: input.trustedAudio.channels,
      bitsPerSample: input.trustedAudio.bitsPerSample,
      cleanupState: input.cleanupState,
    },
    limits: {
      selectedOperations: input.selectedOperations,
      operationCount: input.selectedOperations.length,
      maxConcurrency: RESON8_LIVE_MAX_CONCURRENCY,
      maxRetries: RESON8_LIVE_MAX_RETRIES,
      maxAudioSeconds: input.maxAudioSeconds,
    },
    usageEstimate: {
      maximumSubmittedAudioSeconds: boundedAudioSeconds(
        input.trustedAudio.durationSeconds * input.selectedOperations.length,
      ),
      providerCredits: "unavailable-unverified",
      monetaryCost: "unavailable-unverified",
      basis: `${input.selectedOperations.length} selected sequential operation${input.selectedOperations.length === 1 ? "" : "s"} using the same bounded audio`,
    },
    operations: input.operations,
    privacy: {
      rawAudioPersistedInReport: false,
      rawProviderTranscriptPersisted: false,
      syntheticTranscriptDiagnosticsPersisted: true,
      privateTranscriptDiagnosticsPermitted: false,
      providerResponsePersisted: false,
      providerRequestIdentifierPersisted: false,
      authorizationMaterialPersisted: false,
    },
    applicationBoundary: {
      globallyEnabled: false,
      publicRankingEligible: false,
      publicInvocationExposed: false,
    },
    ...(input.failureCode ? { failureCode: input.failureCode } : {}),
  });
}

export function serializeSafeReson8LiveReport(
  report: Reson8LiveVerificationReport,
  credential: Reson8ServerCredential,
): string {
  const validated = reson8LiveVerificationReportSchema.parse(report);
  const serialized = `${JSON.stringify(validated, null, 2)}\n`;
  credential.assertAbsentFrom(serialized);
  if (/ApiKey\s|Bearer\s|RESON8_API_KEY/i.test(serialized)) {
    throw new Error("The Reson8 live report failed its authorization-material scan.");
  }
  return serialized;
}

export function normalizeExpectedTranscript(value: string): string {
  return normalizeReson8SyntheticTranscript(value);
}

function countEventTypes(
  eventTypes: readonly z.infer<typeof reson8LiveEventTypeSchema>[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const eventType of eventTypes) counts[eventType] = (counts[eventType] ?? 0) + 1;
  return counts;
}

function classifyOperationFailure(error: unknown): Readonly<{
  code: NonNullable<Reson8LiveVerificationReport["failureCode"]>;
  transportStatus: "passed" | "failed";
  schemaStatus: "not-run" | "failed";
  eventTypes: readonly z.infer<typeof reson8LiveEventTypeSchema>[];
  schemaDiagnostic?: Reson8RealtimeSchemaDiagnostic;
}> {
  const code = normalizeSafeFailureCode(error);
  const eventTypes = error instanceof Reson8LiveTransportError
    ? error.parsedEventTypes.filter((eventType): eventType is z.infer<typeof reson8LiveEventTypeSchema> => (
        reson8LiveEventTypeSchema.safeParse(eventType).success
      ))
    : [];
  const schemaDiagnostic = error instanceof Reson8LiveTransportError ? error.schemaDiagnostic : undefined;
  if (
    code === "response-too-large"
    || code === "malformed-provider-response"
    || code === "unsupported-provider-event"
  ) {
    const transportStatus = error instanceof Reson8LiveTransportError
      ? (error.transportCompletedCleanly ? "passed" : "failed")
      : "passed";
    return Object.freeze({
      code,
      transportStatus,
      schemaStatus: "failed",
      eventTypes,
      ...(schemaDiagnostic ? { schemaDiagnostic } : {}),
    });
  }
  return Object.freeze({ code, transportStatus: "failed", schemaStatus: "not-run", eventTypes: [] });
}

function normalizeSafeFailureCode(error: unknown): NonNullable<Reson8LiveVerificationReport["failureCode"]> {
  if (error instanceof Reson8LiveTransportError) return error.code;
  if (error instanceof Reson8ProtocolError) {
    const supported = safeFailureCodeSchema.safeParse(error.code);
    return supported.success ? supported.data : "transport-failed";
  }
  return "transport-failed";
}

function validateSelectedOperations(
  selected: readonly Reson8LiveOperationName[] | undefined,
): readonly Reson8LiveOperationName[] {
  if (selected === undefined) return RESON8_LIVE_OPERATION_ORDER;
  const parsed = z.array(reson8LiveOperationNameSchema).min(1).max(3).safeParse(selected);
  if (!parsed.success || new Set(parsed.data).size !== parsed.data.length) {
    throw new Reson8LivePreflightError(
      "invalid-operation-selection",
      "The Reson8 live operation plan must contain one to three unique supported operations.",
    );
  }
  return Object.freeze(RESON8_LIVE_OPERATION_ORDER.filter((operation) => parsed.data.includes(operation)));
}

function materializeOperationReports(
  attempted: ReadonlyMap<Reson8LiveOperationName, Reson8LiveVerificationReport["operations"][number]>,
  selected: readonly Reson8LiveOperationName[],
): Reson8LiveVerificationReport["operations"] {
  return RESON8_LIVE_OPERATION_ORDER.map((operation) => attempted.get(operation) ?? Object.freeze({
    operation,
    selected: selected.includes(operation),
    transportStatus: "not-run" as const,
    schemaStatus: "not-run" as const,
    transcriptFidelityStatus: "not-evaluated" as const,
    durationMilliseconds: 0,
    eventCounts: {},
  }));
}

function normalizeWindowsPath(value: string): string {
  return value.replace(/\//g, "\\").replace(/\\+$/g, "").toLocaleLowerCase("en-US");
}

function environmentFlagEnabled(value: string | undefined): boolean {
  if (!value) return false;
  return !["0", "false"].includes(value.toLocaleLowerCase("en-US"));
}

function boundedDuration(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(60_000, Number(value.toFixed(3)));
}

function boundedAudioSeconds(value: number): number {
  return Math.min(RESON8_LIVE_MAX_AUDIO_SECONDS * 3, Number(value.toFixed(6)));
}

export type { Reson8LiveFailureCode };
