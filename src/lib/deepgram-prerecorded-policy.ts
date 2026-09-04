import "server-only";

import { audioUploadLimit, type AudioUploadMode } from "@/lib/audio-file-policy";
import { CURATED_PRERECORDED_SAMPLES } from "@/lib/deepgram-samples";
import {
  isOpenLabMode,
  shouldUseHostedReviewMode,
  type OpenLabEnvironment,
} from "@/lib/open-lab";
import { normalizePublicProviderFetchUrl } from "@/lib/public-provider-url";

export const OPEN_LAB_PRERECORDED_AUDIO_URLS = Object.freeze(
  CURATED_PRERECORDED_SAMPLES.map((sample) => normalizePublicProviderFetchUrl(sample.sampleUrl)),
);

const OPEN_LAB_PRERECORDED_AUDIO_URL_SET = new Set(OPEN_LAB_PRERECORDED_AUDIO_URLS);
const MAX_MULTIPART_METADATA_BYTES = 64 * 1024;

export class DeepgramPrerecordedPolicyError extends Error {
  readonly code = "open_lab_media_not_allowed";
  readonly status = 400;

  constructor() {
    super("Public Open Lab URL transcription is limited to the curated sample media provided by this site.");
    this.name = "DeepgramPrerecordedPolicyError";
  }
}

export function normalizePrerecordedAudioUrl(
  value: unknown,
  env: OpenLabEnvironment = process.env,
) {
  const normalized = normalizePublicProviderFetchUrl(value);
  if (isOpenLabMode(env) && !OPEN_LAB_PRERECORDED_AUDIO_URL_SET.has(normalized)) {
    throw new DeepgramPrerecordedPolicyError();
  }
  return normalized;
}

export function resolvePrerecordedUploadPolicy(
  localMaxBytes: number,
  env: OpenLabEnvironment = process.env,
): { mode: AudioUploadMode; maxBytes: number } {
  const hosted = isOpenLabMode(env) || shouldUseHostedReviewMode(env);
  return {
    mode: hosted ? "hosted" : "local",
    maxBytes: hosted ? Math.min(localMaxBytes, audioUploadLimit("hosted")) : localMaxBytes,
  };
}

export function prerecordedMultipartBodyLimit(fileMaxBytes: number) {
  return fileMaxBytes + MAX_MULTIPART_METADATA_BYTES;
}
