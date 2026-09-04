import "server-only";

import { lstat } from "node:fs/promises";
import path from "node:path";

import { readBoundedRegularFile } from "@/lib/providers/reson8/live-filesystem";
import {
  RESON8_LIVE_CANONICAL_ROOT,
  RESON8_LIVE_MAX_AUDIO_SECONDS,
  Reson8LivePreflightError,
  reson8LiveAudioManifestSchema,
  validateReson8LiveAudio,
  type Reson8LiveAudioInput,
} from "@/lib/providers/reson8/live-verifier";
import type { TrustedSttAudio } from "@/lib/stt-audio-admission";

export const RESON8_LIVE_INPUT_DIRECTORY = path.join(
  RESON8_LIVE_CANONICAL_ROOT,
  "tmp",
  "reson8-live-verification",
);
export const RESON8_LIVE_AUDIO_PATH = path.join(RESON8_LIVE_INPUT_DIRECTORY, "input.wav");
export const RESON8_LIVE_AUDIO_MANIFEST_PATH = path.join(
  RESON8_LIVE_INPUT_DIRECTORY,
  "input.manifest.json",
);

const MAX_MANUAL_AUDIO_BYTES = 512 * 1024;
const MAX_MANUAL_MANIFEST_BYTES = 8 * 1024;

export type Reson8LivePreflightResult = Readonly<{
  audio: Reson8LiveAudioInput;
  trustedAudio: TrustedSttAudio;
  audioPath: string;
  manifestPath: string;
}>;

export async function runReson8OfflinePreflight(input: Readonly<{
  currentWorkingDirectory?: string;
  maxAudioSeconds?: number;
}> = {}): Promise<Reson8LivePreflightResult> {
  const currentWorkingDirectory = input.currentWorkingDirectory ?? process.cwd();
  if (normalizeWindowsPath(currentWorkingDirectory) !== normalizeWindowsPath(RESON8_LIVE_CANONICAL_ROOT)) {
    throw new Reson8LivePreflightError(
      "wrong-repository",
      "The Reson8 preflight must run from the canonical ONE Voice Lab repository.",
    );
  }
  return readAndValidateReson8PreparedInput({
    audioPath: RESON8_LIVE_AUDIO_PATH,
    manifestPath: RESON8_LIVE_AUDIO_MANIFEST_PATH,
    maxAudioSeconds: input.maxAudioSeconds ?? RESON8_LIVE_MAX_AUDIO_SECONDS,
  });
}

export async function readAndValidateReson8PreparedInput(input: Readonly<{
  audioPath: string;
  manifestPath: string;
  maxAudioSeconds: number;
}>): Promise<Reson8LivePreflightResult> {
  if (!Number.isFinite(input.maxAudioSeconds) || input.maxAudioSeconds <= 0) {
    throw new Reson8LivePreflightError(
      "invalid-audio-limit",
      "The Reson8 offline preflight requires a positive decoded-audio limit.",
    );
  }

  const audioBuffer = await readPreparedFile(
    input.audioPath,
    MAX_MANUAL_AUDIO_BYTES,
    "audio-file-missing",
    "audio-file-invalid",
    "input.wav",
  );
  const manifestBuffer = await readPreparedFile(
    input.manifestPath,
    MAX_MANUAL_MANIFEST_BYTES,
    "audio-manifest-missing",
    "audio-manifest-invalid",
    "input.manifest.json",
  );

  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(manifestBuffer.toString("utf8").replace(/^\uFEFF/, ""));
  } catch {
    throw new Reson8LivePreflightError(
      "audio-manifest-invalid",
      "input.manifest.json is not valid JSON.",
    );
  }
  const manifest = reson8LiveAudioManifestSchema.safeParse(manifestJson);
  if (!manifest.success) {
    throw new Reson8LivePreflightError(
      "audio-manifest-invalid",
      "input.manifest.json does not match one-reson8-live-audio/1.1.0.",
    );
  }

  const bytes = new Uint8Array(
    audioBuffer.buffer,
    audioBuffer.byteOffset,
    audioBuffer.byteLength,
  ).slice();
  const audio: Reson8LiveAudioInput = Object.freeze({
    file: new File([bytes.slice().buffer], "reson8-live-contract.wav", { type: "audio/wav" }),
    bytes,
    manifest: manifest.data,
    temporary: true,
  });
  const trustedAudio = await validateReson8LiveAudio(audio, input.maxAudioSeconds);
  return Object.freeze({
    audio,
    trustedAudio,
    audioPath: input.audioPath,
    manifestPath: input.manifestPath,
  });
}

async function readPreparedFile(
  filePath: string,
  maxBytes: number,
  missingCode: "audio-file-missing" | "audio-manifest-missing",
  invalidCode: "audio-file-invalid" | "audio-manifest-invalid",
  label: string,
): Promise<Buffer> {
  let metadata;
  try {
    metadata = await lstat(filePath);
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      throw new Reson8LivePreflightError(
        missingCode,
        `${label} is missing from tmp/reson8-live-verification/.`,
      );
    }
    throw new Reson8LivePreflightError(invalidCode, `${label} could not be inspected safely.`);
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Reson8LivePreflightError(invalidCode, `${label} must be a real local file, not a link.`);
  }
  if (metadata.size < 1) {
    throw new Reson8LivePreflightError(invalidCode, `${label} is empty.`);
  }
  if (metadata.size > maxBytes) {
    throw new Reson8LivePreflightError(
      invalidCode,
      `${label} exceeds its ${maxBytes}-byte offline preflight bound.`,
    );
  }
  try {
    return await readBoundedRegularFile(filePath, maxBytes);
  } catch {
    throw new Reson8LivePreflightError(
      invalidCode,
      `${label} changed during validation or is not a bounded regular file.`,
    );
  }
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function normalizeWindowsPath(value: string): string {
  return path.win32.normalize(value).replace(/[\\/]+$/, "").toLocaleLowerCase("en-US");
}
