import "server-only";

import { z } from "zod";

import { Reson8ProtocolError } from "@/lib/providers/reson8/protocol";

export const RESON8_SYNTHETIC_APPROXIMATE_MAX_EDITS = 2;
export const RESON8_SYNTHETIC_APPROXIMATE_MAX_WER = 0.2;
const MAX_SYNTHETIC_TRANSCRIPT_CHARACTERS = 500;
const MAX_SYNTHETIC_TRANSCRIPT_TOKENS = 64;

export const reson8TranscriptFidelityStatusSchema = z.enum([
  "not-evaluated",
  "exact",
  "normalized-match",
  "approximate-match",
  "mismatch",
]);
export type Reson8TranscriptFidelityStatus = z.infer<typeof reson8TranscriptFidelityStatusSchema>;

export const reson8SyntheticTranscriptComparisonSchema = z.object({
  sourceProvenance: z.literal("local-synthetic-speech"),
  expectedNormalizedTranscript: z.string().min(1).max(MAX_SYNTHETIC_TRANSCRIPT_CHARACTERS),
  observedNormalizedTranscript: z.string().max(MAX_SYNTHETIC_TRANSCRIPT_CHARACTERS),
  expectedTokenCount: z.number().int().positive().max(MAX_SYNTHETIC_TRANSCRIPT_TOKENS),
  observedTokenCount: z.number().int().nonnegative().max(MAX_SYNTHETIC_TRANSCRIPT_TOKENS),
  wordErrorRate: z.number().finite().nonnegative().max(MAX_SYNTHETIC_TRANSCRIPT_TOKENS),
  substitutions: z.number().int().nonnegative().max(MAX_SYNTHETIC_TRANSCRIPT_TOKENS),
  insertions: z.number().int().nonnegative().max(MAX_SYNTHETIC_TRANSCRIPT_TOKENS),
  deletions: z.number().int().nonnegative().max(MAX_SYNTHETIC_TRANSCRIPT_TOKENS),
  status: reson8TranscriptFidelityStatusSchema.exclude(["not-evaluated"]),
  method: z.literal("one-synthetic-word-error-rate/1.0.0"),
  approximateThreshold: z.object({
    maximumEdits: z.literal(RESON8_SYNTHETIC_APPROXIMATE_MAX_EDITS),
    maximumWordErrorRate: z.literal(RESON8_SYNTHETIC_APPROXIMATE_MAX_WER),
  }).strict(),
}).strict();
export type Reson8SyntheticTranscriptComparison = z.infer<typeof reson8SyntheticTranscriptComparisonSchema>;

export function normalizeReson8SyntheticTranscript(value: string): string {
  return tokenize(value).join(" ");
}

export function compareReson8SyntheticTranscript(input: Readonly<{
  expected: string;
  observed: string;
  provenance: string;
}>): Reson8SyntheticTranscriptComparison {
  if (input.provenance !== "local-synthetic-speech") {
    throw new Reson8ProtocolError(
      "malformed-provider-response",
      "Transcript diagnostics are permitted only for the fixed local synthetic Reson8 sample.",
    );
  }
  if (input.expected.length > MAX_SYNTHETIC_TRANSCRIPT_CHARACTERS
      || input.observed.length > MAX_SYNTHETIC_TRANSCRIPT_CHARACTERS) {
    throw new Reson8ProtocolError(
      "malformed-provider-response",
      "The fixed synthetic transcript exceeded the bounded diagnostic limit.",
    );
  }

  const expectedTokens = tokenize(input.expected);
  const observedTokens = tokenize(input.observed);
  if (expectedTokens.length < 1 || expectedTokens.length > MAX_SYNTHETIC_TRANSCRIPT_TOKENS
      || observedTokens.length > MAX_SYNTHETIC_TRANSCRIPT_TOKENS) {
    throw new Reson8ProtocolError(
      "malformed-provider-response",
      "The fixed synthetic transcript token count is outside the diagnostic boundary.",
    );
  }

  const edits = calculateWordEdits(expectedTokens, observedTokens);
  const totalEdits = edits.substitutions + edits.insertions + edits.deletions;
  const wordErrorRate = Number((totalEdits / expectedTokens.length).toFixed(6));
  const expectedNormalizedTranscript = expectedTokens.join(" ");
  const observedNormalizedTranscript = observedTokens.join(" ");
  const status: Reson8SyntheticTranscriptComparison["status"] = input.observed === input.expected
    ? "exact"
    : observedNormalizedTranscript === expectedNormalizedTranscript
      ? "normalized-match"
      : observedTokens.length > 0
          && totalEdits <= RESON8_SYNTHETIC_APPROXIMATE_MAX_EDITS
          && wordErrorRate <= RESON8_SYNTHETIC_APPROXIMATE_MAX_WER
        ? "approximate-match"
        : "mismatch";

  return Object.freeze(reson8SyntheticTranscriptComparisonSchema.parse({
    sourceProvenance: "local-synthetic-speech",
    expectedNormalizedTranscript,
    observedNormalizedTranscript,
    expectedTokenCount: expectedTokens.length,
    observedTokenCount: observedTokens.length,
    wordErrorRate,
    ...edits,
    status,
    method: "one-synthetic-word-error-rate/1.0.0",
    approximateThreshold: {
      maximumEdits: RESON8_SYNTHETIC_APPROXIMATE_MAX_EDITS,
      maximumWordErrorRate: RESON8_SYNTHETIC_APPROXIMATE_MAX_WER,
    },
  }));
}

export function requireReson8SyntheticTranscript(input: Readonly<{
  expected: string;
  observed: string;
  provenance: string;
}>): Reson8SyntheticTranscriptComparison {
  const comparison = compareReson8SyntheticTranscript(input);
  if (comparison.observedTokenCount === 0) {
    throw new Reson8ProtocolError(
      "malformed-provider-response",
      "The Reson8 operation returned no required transcript content.",
    );
  }
  return comparison;
}

function tokenize(value: string): string[] {
  const normalized = value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\u2018\u2019\u0060\u00b4]/g, "'")
    .replace(/'/g, "");
  return normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
}

type WordEdits = Readonly<{
  substitutions: number;
  insertions: number;
  deletions: number;
}>;

function calculateWordEdits(expected: readonly string[], observed: readonly string[]): WordEdits {
  const rows: WordEdits[][] = Array.from(
    { length: expected.length + 1 },
    () => Array.from({ length: observed.length + 1 }, () => ({ substitutions: 0, insertions: 0, deletions: 0 })),
  );
  for (let expectedIndex = 1; expectedIndex <= expected.length; expectedIndex += 1) {
    rows[expectedIndex][0] = { substitutions: 0, insertions: 0, deletions: expectedIndex };
  }
  for (let observedIndex = 1; observedIndex <= observed.length; observedIndex += 1) {
    rows[0][observedIndex] = { substitutions: 0, insertions: observedIndex, deletions: 0 };
  }

  for (let expectedIndex = 1; expectedIndex <= expected.length; expectedIndex += 1) {
    for (let observedIndex = 1; observedIndex <= observed.length; observedIndex += 1) {
      if (expected[expectedIndex - 1] === observed[observedIndex - 1]) {
        rows[expectedIndex][observedIndex] = rows[expectedIndex - 1][observedIndex - 1];
        continue;
      }
      rows[expectedIndex][observedIndex] = selectBestEdit([
        increment(rows[expectedIndex - 1][observedIndex - 1], "substitutions"),
        increment(rows[expectedIndex][observedIndex - 1], "insertions"),
        increment(rows[expectedIndex - 1][observedIndex], "deletions"),
      ]);
    }
  }
  return Object.freeze(rows[expected.length][observed.length]);
}

function increment(value: WordEdits, field: keyof WordEdits): WordEdits {
  return { ...value, [field]: value[field] + 1 };
}

function selectBestEdit(candidates: readonly WordEdits[]): WordEdits {
  return candidates.reduce((best, candidate) => compareEditTuple(candidate, best) < 0 ? candidate : best);
}

function compareEditTuple(left: WordEdits, right: WordEdits): number {
  const leftTuple = [editCount(left), left.substitutions, left.deletions, left.insertions];
  const rightTuple = [editCount(right), right.substitutions, right.deletions, right.insertions];
  for (let index = 0; index < leftTuple.length; index += 1) {
    if (leftTuple[index] !== rightTuple[index]) return leftTuple[index] - rightTuple[index];
  }
  return 0;
}

function editCount(value: WordEdits): number {
  return value.substitutions + value.insertions + value.deletions;
}
