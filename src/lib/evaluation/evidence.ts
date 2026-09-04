import {
  EVALUATION_IMPORT_MAX_BYTES,
  evaluationEvidenceBundleSchema,
  type EvaluationEvidenceBundle,
  type EvaluationProviderEvidence,
} from "@/lib/evaluation/schema";
import { createBlindAssignments } from "@/lib/evaluation/blind";
import { getEvaluationPreset } from "@/lib/evaluation/presets";

const FORBIDDEN_EXPORT_KEY = /(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|cookie|password|internal[_-]?url|raw.*payload)/i;
const FORBIDDEN_EXPORT_VALUES = [
  /\b(?:Token|Bearer)\s+[A-Za-z0-9._~+/-]{8,}/i,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b(?:dg_|sk-|xi_|fish_|cartesia_)[A-Za-z0-9._-]{12,}\b/i,
  /-----BEGIN [^-]{0,40}PRIVATE KEY-----/i,
  /[?&](?:access_token|api_key|authorization|token|key)=[^&#\s]+/i,
  /\b(?:https?|wss|file):\/\/[^\s"'<>]+/i,
];

export function serializeEvidenceBundle(bundle: EvaluationEvidenceBundle): string {
  const parsed = evaluationEvidenceBundleSchema.parse(bundle);
  assertEvidenceCoherence(parsed);
  assertNoSecrets(parsed);
  return JSON.stringify(parsed, null, 2);
}

export async function importEvidenceBundle(input: string | Uint8Array): Promise<EvaluationEvidenceBundle> {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  if (bytes.byteLength === 0 || bytes.byteLength > EVALUATION_IMPORT_MAX_BYTES) {
    throw new Error(`Evidence files must be between 1 byte and ${EVALUATION_IMPORT_MAX_BYTES.toLocaleString()} bytes.`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("Evidence must be valid UTF-8 JSON.");
  }

  const parsed = evaluationEvidenceBundleSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Evidence does not match a supported ONE Voice Lab schema.");
  }
  assertEvidenceCoherence(parsed.data);
  await assertInputHash(parsed.data);
  assertNoSecrets(parsed.data);
  return parsed.data;
}

function assertEvidenceCoherence(bundle: EvaluationEvidenceBundle): void {
  const exportedAt = Date.parse(bundle.exportedAt);
  assertScenarioCoherence(bundle);
  if (bundle.blind.enabled && bundle.evaluationMode !== "standardized") invalidEvidence();
  if (bundle.blind.enabled) {
    if (bundle.blind.revealed !== (bundle.blind.revealedAt !== null)) invalidEvidence();
    if (bundle.blind.revealedAt && Date.parse(bundle.blind.revealedAt) > exportedAt) invalidEvidence();
  } else if (bundle.blind.revealed || bundle.blind.revealedAt !== null) {
    invalidEvidence();
  }
  const providers = new Set<string>();
  const blindLabels = new Set<string>();
  const providerIds = bundle.providerResults.map((result) => result.provider);
  if (new Set(providerIds).size !== providerIds.length) invalidEvidence();
  const expectedBlindAssignments = createBlindAssignments(providerIds, bundle.blind.seed);
  if (new Set(bundle.providerResults.map((result) => result.environment)).size !== 1) invalidEvidence();
  let preferences = 0;
  for (const result of bundle.providerResults) {
    if (result.runId !== bundle.runId) invalidEvidence();
    if (providers.has(result.provider) || blindLabels.has(result.blindLabel)) invalidEvidence();
    providers.add(result.provider);
    blindLabels.add(result.blindLabel);
    if (expectedBlindAssignments[result.provider] !== result.blindLabel) invalidEvidence();
    if ((result.region === null) !== (result.regionScope === null)) invalidEvidence();

    const metricNames = new Set(result.metrics.map((metric) => metric.name));
    if (metricNames.size !== result.metrics.length || metricNames.size !== 8) invalidEvidence();
    assertMetricCoherence(result);
    const requestSuccess = result.metrics.find((metric) => metric.name === "request_success");
    if (!requestSuccess || requestSuccess.availability !== "measured" || requestSuccess.value === null) invalidEvidence();

    if (result.status === "pending" || result.status === "streaming") invalidEvidence();
    if (!result.completionTimestamp) invalidEvidence();
    if (result.requestTimestamp && Date.parse(result.completionTimestamp) < Date.parse(result.requestTimestamp)) invalidEvidence();
    if (Date.parse(result.completionTimestamp) > exportedAt) invalidEvidence();
    if (result.clientPlayableTimestamp && Date.parse(result.clientPlayableTimestamp) > exportedAt) invalidEvidence();
    if (result.firstAudioTimestamp) {
      const firstAudio = Date.parse(result.firstAudioTimestamp);
      if (!result.requestTimestamp || firstAudio < Date.parse(result.requestTimestamp) || firstAudio > Date.parse(result.completionTimestamp)) invalidEvidence();
    }

    if (result.status === "complete") {
      if (!result.requestTimestamp || result.sanitizedError !== null || requestSuccess.value !== 1) invalidEvidence();
      if (!result.firstAudioTimestamp || !result.audio.mimeType
        || !result.audio.storageReference || !result.audio.contentHash || !result.audio.rawContentHash) invalidEvidence();
      if (bundle.evaluationMode === "standardized"
        && (!result.audio.normalized || result.audio.mimeType !== "audio/wav")) invalidEvidence();
    } else {
      if (result.sanitizedError === null || requestSuccess.value !== 0) invalidEvidence();
      if (result.audio.mimeType !== null || result.audio.durationSeconds !== null || result.audio.storageReference !== null
        || result.audio.contentHash !== null || result.audio.rawContentHash !== null) invalidEvidence();
    }

    const ratingValues = [
      result.humanRating.naturalness,
      result.humanRating.intelligibility,
      result.humanRating.pronunciation,
      result.humanRating.emotionalFit,
      result.humanRating.useCaseFit,
    ];
    const hasRating = ratingValues.some((value) => value !== null) || result.humanRating.overallPreference;
    if (hasRating !== (result.humanRating.ratedAt !== null)
      || hasRating !== (result.humanRating.ratedBeforeReveal !== null)) invalidEvidence();
    if (result.humanRating.ratedAt
      && (Date.parse(result.humanRating.ratedAt) < Date.parse(result.completionTimestamp)
        || Date.parse(result.humanRating.ratedAt) > exportedAt)) invalidEvidence();
    if (hasRating && !bundle.blind.enabled && result.humanRating.ratedBeforeReveal !== false) invalidEvidence();
    if (hasRating && bundle.blind.enabled && !bundle.blind.revealed && result.humanRating.ratedBeforeReveal !== true) {
      invalidEvidence();
    }
    if (hasRating && bundle.blind.revealed && bundle.blind.revealedAt && result.humanRating.ratedAt) {
      const ratedAt = Date.parse(result.humanRating.ratedAt);
      const revealedAt = Date.parse(bundle.blind.revealedAt);
      if (result.humanRating.ratedBeforeReveal ? ratedAt > revealedAt : ratedAt < revealedAt) invalidEvidence();
    }
    if (result.humanRating.overallPreference) preferences += 1;
  }
  if (preferences > 1) invalidEvidence();
  if (bundle.evidenceCategories.humanRated !== bundle.providerResults.some((result) => result.humanRating.ratedAt !== null)) {
    invalidEvidence();
  }
}

function assertScenarioCoherence(bundle: EvaluationEvidenceBundle): void {
  const scenario = bundle.scenario;
  if (scenario.source === "custom") {
    if (scenario.presetId !== null) invalidEvidence();
    return;
  }
  if (!scenario.presetId) invalidEvidence();
  const preset = getEvaluationPreset(scenario.presetId);
  if (!preset || scenario.id !== preset.id || scenario.version !== preset.version) invalidEvidence();
  if (scenario.source === "preset" && scenario.text !== preset.text) invalidEvidence();
  if (scenario.source === "customized-preset" && scenario.text === preset.text) invalidEvidence();
}

function assertMetricCoherence(result: EvaluationProviderEvidence): void {
  const expected = {
    server_time_to_first_audio_chunk: { unit: "milliseconds", measurementPoint: "one-server", clock: "server-monotonic" },
    time_to_first_audible_output: { unit: "milliseconds", measurementPoint: "one-browser", clock: "browser-monotonic" },
    total_generation_time: { unit: "milliseconds", measurementPoint: "one-server", clock: "server-monotonic" },
    audio_duration: { unit: "seconds", measurementPoint: "derived", clock: "server-monotonic" },
    real_time_factor: { unit: "ratio", measurementPoint: "derived", clock: "server-monotonic" },
    request_success: { unit: "boolean", measurementPoint: "one-server", clock: "server-monotonic" },
    client_time_to_playable: { unit: "milliseconds", measurementPoint: "one-browser", clock: "browser-monotonic" },
    estimated_cost: { unit: "usd", measurementPoint: "derived", clock: "not-applicable" },
  } as const;
  const byName = new Map(result.metrics.map((metric) => [metric.name, metric]));
  for (const metric of result.metrics) {
    const definition = expected[metric.name];
    if (metric.measurementPoint !== definition.measurementPoint) invalidEvidence();
    if (metric.availability === "unavailable") {
      if (metric.value !== null || metric.unit !== "unavailable" || metric.provenance.clock !== "not-applicable") invalidEvidence();
    } else {
      if (metric.value === null || metric.unit !== definition.unit || metric.value < 0
        || metric.provenance.clock !== definition.clock) invalidEvidence();
    }
    if (metric.name !== "estimated_cost" && metric.availability === "estimated") invalidEvidence();
  }

  const requestSuccess = byName.get("request_success");
  if (requestSuccess?.availability !== "measured" || ![0, 1].includes(requestSuccess.value ?? -1)) invalidEvidence();
  if (byName.get("estimated_cost")?.availability !== "unavailable") invalidEvidence();
  if (byName.get("time_to_first_audible_output")?.availability !== "unavailable") invalidEvidence();

  const firstChunk = byName.get("server_time_to_first_audio_chunk");
  const total = byName.get("total_generation_time");
  const duration = byName.get("audio_duration");
  const realTimeFactor = byName.get("real_time_factor");
  const clientPlayable = byName.get("client_time_to_playable");
  if (result.status === "complete") {
    if (firstChunk?.availability !== "measured" || total?.availability !== "measured") invalidEvidence();
    if ((firstChunk.value ?? 0) > (total.value ?? 0)) invalidEvidence();
    if (result.audio.durationSeconds === null) {
      if (duration?.availability !== "unavailable" || realTimeFactor?.availability !== "unavailable") invalidEvidence();
    } else {
      if (duration?.availability !== "measured" || realTimeFactor?.availability !== "measured") invalidEvidence();
      if (Math.abs((duration.value ?? -1) - result.audio.durationSeconds) > 0.001) invalidEvidence();
      const expectedRtf = (total.value ?? 0) / 1_000 / result.audio.durationSeconds;
      if (Math.abs((realTimeFactor.value ?? -1) - expectedRtf) > 0.002) invalidEvidence();
    }
  } else if ([firstChunk, total, duration, realTimeFactor].some((metric) => metric?.availability !== "unavailable")) {
    invalidEvidence();
  }

  if (result.clientPlayableTimestamp === null) {
    if (clientPlayable?.availability !== "unavailable") invalidEvidence();
  } else {
    if (result.status !== "complete" || !result.requestTimestamp || clientPlayable?.availability !== "measured"
      || Date.parse(result.clientPlayableTimestamp) < Date.parse(result.requestTimestamp)) {
      invalidEvidence();
    }
  }
  if (result.status !== "complete" && clientPlayable?.availability !== "unavailable") invalidEvidence();
}

async function assertInputHash(bundle: EvaluationEvidenceBundle): Promise<void> {
  if (!globalThis.crypto?.subtle) throw new Error("This environment cannot verify evidence integrity.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(bundle.scenario.text));
  const actual = `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  if (actual !== bundle.scenario.inputHash) invalidEvidence();
}

function invalidEvidence(): never {
  throw new Error("Evidence failed ONE's semantic integrity checks.");
}

export function assertNoSecrets(value: unknown): void {
  walk(value, []);
}

function walk(value: unknown, path: string[]): void {
  if (typeof value === "string") {
    if (FORBIDDEN_EXPORT_VALUES.some((pattern) => pattern.test(value))) {
      throw new Error(`Evidence contains a credential-shaped value at ${path.join(".") || "root"}.`);
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, [...path, String(index)]));
    return;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key === "rawProviderPayloadsEmbedded" && item === false) continue;
    if (FORBIDDEN_EXPORT_KEY.test(key)) {
      throw new Error(`Evidence contains a forbidden key at ${[...path, key].join(".")}.`);
    }
    walk(item, [...path, key]);
  }
}

export function downloadEvidenceBundle(bundle: EvaluationEvidenceBundle, filename = "one-voice-evidence.json"): void {
  const blob = new Blob([serializeEvidenceBundle(bundle)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.replace(/[^A-Za-z0-9._-]/g, "-");
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
