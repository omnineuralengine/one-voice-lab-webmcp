export type OpenLabEnvironment = Readonly<Record<string, string | undefined>>;

export class OpenLabDeepgramDisabledError extends Error {
  readonly code = "open_lab_deepgram_disabled";
  readonly status = 503;

  constructor() {
    super("Live Deepgram execution is disabled. Synthetic and educational modes remain available.");
    this.name = "OpenLabDeepgramDisabledError";
  }
}

export class OpenLabProviderDisabledError extends Error {
  readonly code = "provider_demo_only";
  readonly status = 503;

  constructor(readonly providerName: string) {
    super(`Live ${providerName} execution is disabled. Demo and educational modes remain available.`);
    this.name = "OpenLabProviderDisabledError";
  }
}

export function isOpenLabMode(env: OpenLabEnvironment = process.env): boolean {
  return readBoolean(env.OPEN_LAB_MODE) === true;
}

export function isOpenLabDeepgramEnabled(env: OpenLabEnvironment = process.env): boolean {
  const configured = readBoolean(env.OPEN_LAB_DEEPGRAM_ENABLED);
  if (configured !== undefined) return configured;

  // Public Open Lab execution fails closed until the private switch is explicit.
  // Outside Open Lab, retain the existing route behavior for local/backward compatibility.
  return !isOpenLabMode(env);
}

export function isOpenLabElevenLabsEnabled(env: OpenLabEnvironment = process.env): boolean {
  if (isOpenLabMode(env)) return false;
  return isOpenLabProviderEnabled("OPEN_LAB_ELEVENLABS_ENABLED", env);
}

export function isOpenLabFishAudioEnabled(env: OpenLabEnvironment = process.env): boolean {
  return isOpenLabProviderEnabled("OPEN_LAB_FISH_AUDIO_ENABLED", env);
}

export function isOpenLabCartesiaEnabled(env: OpenLabEnvironment = process.env): boolean {
  return isOpenLabProviderEnabled("OPEN_LAB_CARTESIA_ENABLED", env);
}

export function shouldUseHostedReviewMode(env: OpenLabEnvironment = process.env): boolean {
  if (isOpenLabMode(env)) return false;
  // Hosting on Vercel is not itself a review-mode signal. Review mode must be
  // selected deliberately so the production branch can remain an open lab.
  return readBoolean(env.HOSTED_REVIEW_MODE) === true;
}

export function assertOpenLabDeepgramEnabled(env: OpenLabEnvironment = process.env): void {
  if (!isOpenLabDeepgramEnabled(env)) throw new OpenLabDeepgramDisabledError();
}

export function assertOpenLabElevenLabsEnabled(env: OpenLabEnvironment = process.env): void {
  if (!isOpenLabElevenLabsEnabled(env)) throw new OpenLabProviderDisabledError("ElevenLabs");
}

export function assertOpenLabCartesiaEnabled(env: OpenLabEnvironment = process.env): void {
  if (!isOpenLabCartesiaEnabled(env)) throw new OpenLabProviderDisabledError("Cartesia");
}

function isOpenLabProviderEnabled(
  variableName: "OPEN_LAB_ELEVENLABS_ENABLED" | "OPEN_LAB_FISH_AUDIO_ENABLED" | "OPEN_LAB_CARTESIA_ENABLED",
  env: OpenLabEnvironment,
): boolean {
  const configured = readBoolean(env[variableName]);
  if (configured !== undefined) return configured;
  return !isOpenLabMode(env);
}

function readBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return false;
}
