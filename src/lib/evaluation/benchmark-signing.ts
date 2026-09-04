import "server-only";

import { createHash, sign as nodeSign, verify as nodeVerify, type KeyLike } from "node:crypto";

import { z } from "zod";

import { canonicalizeBenchmarkJson, hashBenchmarkPayload } from "@/lib/evaluation/benchmark-integrity";
import { SUPPORTED_BENCHMARK_SCHEMA_VERSIONS, benchmarkProviderIdSchema } from "@/lib/evaluation/benchmark-schema";

export const BENCHMARK_SIGNATURE_VERSION = "one-benchmark-signature/1.0.0" as const;
export const BENCHMARK_DB_PUBLIC_PAYLOAD_VERSION = "one-benchmark-db-public-payload/1.0.0" as const;
const MAX_PREPARED_CANONICAL_PAYLOAD_BYTES = 1_048_576;

const ed25519SignatureSchema = z.string().max(88).refine((value) => {
  if (value.length !== 88 || !/^[A-Za-z0-9+/]{86}==$/.test(value)) return false;
  const decoded = Buffer.from(value, "base64");
  return decoded.length === 64 && decoded.toString("base64") === value;
}, "Ed25519 signatures must be canonical standard base64 encoding of exactly 64 bytes.");

export const benchmarkSignatureEnvelopeSchema = z.object({
  schemaVersion: z.literal(BENCHMARK_SIGNATURE_VERSION),
  algorithm: z.literal("ed25519"),
  keyId: benchmarkProviderIdSchema,
  payloadSchemaVersion: z.string().min(1).max(160),
  payloadDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  signature: ed25519SignatureSchema,
  signedAt: z.string().datetime(),
}).strict();

export type BenchmarkSignatureEnvelope = z.infer<typeof benchmarkSignatureEnvelopeSchema>;

const benchmarkPreparedSnapshotPayloadSchema = z.object({
  schemaVersion: z.literal(BENCHMARK_DB_PUBLIC_PAYLOAD_VERSION),
  snapshotId: z.string().uuid(),
}).passthrough();

export const benchmarkPreparedSnapshotSignatureSchema = z.object({
  snapshotId: z.string().uuid(),
  payloadSchemaVersion: z.literal(BENCHMARK_DB_PUBLIC_PAYLOAD_VERSION),
  payload: benchmarkPreparedSnapshotPayloadSchema,
  canonicalPayload: z.string().min(2).max(MAX_PREPARED_CANONICAL_PAYLOAD_BYTES),
  payloadDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
}).strict().superRefine((prepared, context) => {
  if (prepared.payload.snapshotId !== prepared.snapshotId) {
    context.addIssue({
      code: "custom",
      path: ["payload", "snapshotId"],
      message: "The prepared payload snapshot identifier must match its guarded database envelope.",
    });
  }
});

export type BenchmarkPreparedSnapshotSignature = z.infer<typeof benchmarkPreparedSnapshotSignatureSchema>;

export interface BenchmarkSigner {
  readonly algorithm: "ed25519";
  readonly keyId: string;
  sign(message: Uint8Array): Promise<Uint8Array>;
}

export function createEd25519BenchmarkSigner(input: Readonly<{
  keyId: string;
  privateKey: KeyLike;
}>): BenchmarkSigner {
  const keyId = benchmarkProviderIdSchema.parse(input.keyId);
  return {
    algorithm: "ed25519",
    keyId,
    async sign(message) {
      return nodeSign(null, Buffer.from(message), input.privateKey);
    },
  };
}

function signatureMessage(payloadSchemaVersion: string, payloadDigest: string, signedAt: string): Uint8Array {
  return Buffer.from(`${BENCHMARK_SIGNATURE_VERSION}\n${payloadSchemaVersion}\n${payloadDigest}\n${signedAt}`, "utf8");
}

function hashPreparedCanonicalPayload(canonicalPayload: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(canonicalPayload, "utf8").digest("hex")}`;
}

function validatePreparedSnapshot(input: BenchmarkPreparedSnapshotSignature): BenchmarkPreparedSnapshotSignature {
  const prepared = benchmarkPreparedSnapshotSignatureSchema.parse(input);
  if (Buffer.byteLength(prepared.canonicalPayload, "utf8") > MAX_PREPARED_CANONICAL_PAYLOAD_BYTES) {
    throw new RangeError("The prepared database benchmark payload exceeds the signing boundary.");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(prepared.canonicalPayload);
  } catch {
    throw new TypeError("The prepared database benchmark payload is not valid JSON.");
  }
  if (canonicalizeBenchmarkJson(decoded) !== canonicalizeBenchmarkJson(prepared.payload)) {
    throw new RangeError("The prepared canonical bytes do not represent the accompanying database payload.");
  }
  if (hashPreparedCanonicalPayload(prepared.canonicalPayload) !== prepared.payloadDigest) {
    throw new RangeError("The prepared canonical bytes do not match the database payload digest.");
  }
  return prepared;
}

function verifyEnvelopeDigest(
  envelope: BenchmarkSignatureEnvelope,
  expectedDigest: string,
  publicKey: KeyLike,
): Readonly<{ valid: boolean; state: "signature-verified" | "verification-failed"; detail: string }> {
  if (expectedDigest !== envelope.payloadDigest) {
    return { valid: false, state: "verification-failed", detail: "The payload digest does not match the signed digest." };
  }
  const valid = nodeVerify(
    null,
    signatureMessage(envelope.payloadSchemaVersion, envelope.payloadDigest, envelope.signedAt),
    publicKey,
    Buffer.from(envelope.signature, "base64"),
  );
  return valid
    ? { valid: true, state: "signature-verified", detail: "The Ed25519 signature and payload digest are valid." }
    : { valid: false, state: "verification-failed", detail: "The Ed25519 signature is invalid for this payload." };
}

export async function signBenchmarkPayload(
  payload: unknown,
  payloadSchemaVersion: string,
  signer: BenchmarkSigner,
  signedAt = new Date().toISOString(),
): Promise<BenchmarkSignatureEnvelope> {
  if (!(SUPPORTED_BENCHMARK_SCHEMA_VERSIONS as readonly string[]).includes(payloadSchemaVersion)) {
    throw new RangeError("Cannot sign an unsupported benchmark schema version.");
  }
  const payloadDigest = hashBenchmarkPayload(payload);
  const signature = await signer.sign(signatureMessage(payloadSchemaVersion, payloadDigest, signedAt));
  return benchmarkSignatureEnvelopeSchema.parse({
    schemaVersion: BENCHMARK_SIGNATURE_VERSION,
    algorithm: signer.algorithm,
    keyId: signer.keyId,
    payloadSchemaVersion,
    payloadDigest,
    signature: Buffer.from(signature).toString("base64"),
    signedAt,
  });
}

/** Signs the exact canonical bytes prepared by the guarded database RPC. */
export async function signPreparedBenchmarkSnapshot(
  input: BenchmarkPreparedSnapshotSignature,
  signer: BenchmarkSigner,
  signedAt = new Date().toISOString(),
): Promise<BenchmarkSignatureEnvelope> {
  const prepared = validatePreparedSnapshot(input);
  const signature = await signer.sign(signatureMessage(prepared.payloadSchemaVersion, prepared.payloadDigest, signedAt));
  return benchmarkSignatureEnvelopeSchema.parse({
    schemaVersion: BENCHMARK_SIGNATURE_VERSION,
    algorithm: signer.algorithm,
    keyId: signer.keyId,
    payloadSchemaVersion: prepared.payloadSchemaVersion,
    payloadDigest: prepared.payloadDigest,
    signature: Buffer.from(signature).toString("base64"),
    signedAt,
  });
}

/** Verifies a signature against the same exact database-prepared canonical bytes. */
export function verifyPreparedBenchmarkSnapshotSignature(
  input: BenchmarkPreparedSnapshotSignature,
  envelopeInput: BenchmarkSignatureEnvelope,
  publicKey: KeyLike,
): Readonly<{ valid: boolean; state: "signature-verified" | "verification-failed" | "unsupported-version"; detail: string }> {
  const envelope = benchmarkSignatureEnvelopeSchema.parse(envelopeInput);
  if (envelope.payloadSchemaVersion !== BENCHMARK_DB_PUBLIC_PAYLOAD_VERSION) {
    return { valid: false, state: "unsupported-version", detail: "The prepared database payload schema version is unsupported." };
  }
  let prepared: BenchmarkPreparedSnapshotSignature;
  try {
    prepared = validatePreparedSnapshot(input);
  } catch {
    return { valid: false, state: "verification-failed", detail: "The prepared database payload or digest is invalid." };
  }
  return verifyEnvelopeDigest(envelope, prepared.payloadDigest, publicKey);
}

export function verifyBenchmarkSignature(
  payload: unknown,
  envelopeInput: BenchmarkSignatureEnvelope,
  publicKey: KeyLike,
): Readonly<{
  valid: boolean;
  state: "signature-verified" | "verification-failed" | "unsupported-version";
  detail: string;
}> {
  const envelope = benchmarkSignatureEnvelopeSchema.parse(envelopeInput);
  if (!(SUPPORTED_BENCHMARK_SCHEMA_VERSIONS as readonly string[]).includes(envelope.payloadSchemaVersion)) {
    return { valid: false, state: "unsupported-version", detail: "The signed payload schema version is unsupported." };
  }
  const actualDigest = hashBenchmarkPayload(payload);
  if (actualDigest !== envelope.payloadDigest) {
    return { valid: false, state: "verification-failed", detail: "The payload digest does not match the signed digest." };
  }
  return verifyEnvelopeDigest(envelope, actualDigest, publicKey);
}
