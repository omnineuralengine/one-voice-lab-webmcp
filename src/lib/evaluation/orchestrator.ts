import "server-only";

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import { EvaluationAudioValidationError, pcm16MonoToWav, validateEvaluationAudio } from "@/lib/evaluation/audio";
import { BLIND_LABELS, createBlindAssignments, type BlindLabel } from "@/lib/evaluation/blind";
import { standardizedProviderOutputFormat } from "@/lib/evaluation/catalog";
import { assertFixtureSelection, createDeterministicFixtureWav } from "@/lib/evaluation/fixture";
import { isEvaluationProviderRuntimeEnabled, type EvaluationEnvironment } from "@/lib/evaluation/runtime";
import {
  EVALUATION_MAX_AUDIO_BYTES,
} from "@/lib/evaluation/schema";
import {
  EVALUATION_METRIC_VERSION,
  EVALUATION_METHODOLOGY_VERSION,
  EVALUATION_SCHEMA_VERSION,
  evaluationEvidenceBundleSchema,
  evaluationProviderEvidenceSchema,
  evaluationStreamEventSchema,
  type EvaluationEvidenceBundle,
  type EvaluationMetric,
  type EvaluationProviderEvidence,
  type EvaluationProviderSelection,
  type EvaluationProviderStatus,
  type EvaluationRunRequest,
  type EvaluationStreamEvent,
  type EvaluationTraceEvent,
} from "@/lib/evaluation/schema";
import { getProviderConfigurationState } from "@/lib/providers/configuration";
import { ProviderAdapterError, ProviderOperationError } from "@/lib/providers/errors";
import { authorizeProviderExecution, type ProviderExecutionAuthorization } from "@/lib/providers/execution-policy";
import { getProviderAdapterRegistration, resolveTtsAdapter } from "@/lib/providers/adapters";
import type { ProviderId, ProviderTtsAdapter, ProviderTtsRequest, ProviderTtsResult } from "@/lib/providers/types";

const PROVIDER_TIMEOUTS_MS: Readonly<Record<ProviderId, number>> = {
  deepgram: 30_000,
  elevenlabs: 35_000,
  "fish-audio": 45_000,
  cartesia: 35_000,
};

type EvaluationRunGuard = <T>(providerId: ProviderId, task: () => Promise<T>) => Promise<T>;

export type EvaluationOrchestratorDependencies = Readonly<{
  signal?: AbortSignal;
  environment?: EvaluationEnvironment;
  emit: (event: EvaluationStreamEvent) => void | Promise<void>;
  resolveAdapter?: (providerId: string) => ProviderTtsAdapter;
  isConfigured?: (providerId: ProviderId) => boolean;
  runGuard?: EvaluationRunGuard;
  authorizeExecution?: (providerId: string, operation: "models" | "voices" | "tts") => Promise<ProviderExecutionAuthorization>;
  monotonicNow?: () => number;
  wallNow?: () => Date;
  timeoutsMs?: Partial<Record<ProviderId, number>>;
}>;

type ProviderExecution = Readonly<{
  evidence: EvaluationProviderEvidence;
  audioBase64: string | null;
}>;

export async function executeEvaluationRun(
  input: EvaluationRunRequest,
  dependencies: EvaluationOrchestratorDependencies,
): Promise<EvaluationEvidenceBundle> {
  const environment = dependencies.environment ?? process.env;
  const monotonicNow = dependencies.monotonicNow ?? (() => performance.now());
  const wallNow = dependencies.wallNow ?? (() => new Date());
  const emit = async (event: EvaluationStreamEvent) => dependencies.emit(evaluationStreamEventSchema.parse(event));
  const assignments = createBlindAssignments(input.providers.map((selection) => selection.providerId), input.blind.seed);
  const startedAt = wallNow();

  await emit({
    type: "run-started",
    evaluationId: input.evaluationId,
    runId: input.runId,
    providerIds: input.providers.map((selection) => selection.providerId),
    startedAt: startedAt.toISOString(),
  });
  for (const selection of input.providers) {
    await emit({ type: "provider-state", providerId: selection.providerId, status: "pending", at: wallNow().toISOString() });
  }

  const results = new Map<ProviderId, EvaluationProviderEvidence>();
  await mapWithConcurrency(input.providers, 2, async (selection) => {
    await emit({ type: "provider-state", providerId: selection.providerId, status: "streaming", at: wallNow().toISOString() });
    const blindLabel = requireBlindLabel(assignments[selection.providerId]);
    const execution = await executeProvider(input, selection, blindLabel, {
      ...dependencies,
      environment,
      monotonicNow,
      wallNow,
    });
    results.set(selection.providerId, execution.evidence);
    await emit({
      type: "provider-result",
      result: execution.evidence,
      audioBase64: execution.audioBase64,
      at: wallNow().toISOString(),
    });
  });

  const completedAt = wallNow().toISOString();
  const orderedResults = input.providers
    .map((selection) => results.get(selection.providerId))
    .filter((result): result is EvaluationProviderEvidence => Boolean(result))
    .sort((left, right) => BLIND_LABELS.indexOf(left.blindLabel) - BLIND_LABELS.indexOf(right.blindLabel));
  const bundle = evaluationEvidenceBundleSchema.parse({
    schemaVersion: EVALUATION_SCHEMA_VERSION,
    methodologyVersion: EVALUATION_METHODOLOGY_VERSION,
    exportedAt: completedAt,
    evaluationId: input.evaluationId,
    runId: input.runId,
    scenario: input.scenario,
    evaluationMode: input.evaluationMode,
    blind: { enabled: input.blind.enabled, seed: input.blind.seed, revealed: false, revealedAt: null },
    providerResults: orderedResults,
    evidenceCategories: { measured: true, humanRated: false, modelJudged: false },
    modelJudgeResults: null,
    visibility: "private",
    consent: { publication: false, publicEvidencePool: false },
    retention: { mode: "ephemeral", audioEmbedded: false, rawProviderPayloadsEmbedded: false },
    sponsorshipDisclosure: null,
    limitations: [
      input.executionMode === "fixture"
        ? "Deterministic fixture audio validates interaction behavior only; it is identical across providers and is not provider speech or latency evidence."
        : "This run reflects one script, exact disclosed configurations, current account access, and the observed execution region; it may not generalize.",
      "Provider, server, and browser timing points remain separate and are never treated as interchangeable.",
      "Human ratings remain private and model-judged evidence is not produced in Phase 1.",
    ],
  });
  await emit({ type: "run-complete", evaluationId: input.evaluationId, runId: input.runId, completedAt, bundle });
  return bundle;
}

async function executeProvider(
  input: EvaluationRunRequest,
  selection: EvaluationProviderSelection,
  blindLabel: BlindLabel,
  dependencies: EvaluationOrchestratorDependencies & Required<Pick<EvaluationOrchestratorDependencies, "environment" | "monotonicNow" | "wallNow">>,
): Promise<ProviderExecution> {
  const validationTimestamp = dependencies.wallNow().toISOString();
  let requestTimestamp: string | null = null;
  let requestStartOffset: number | null = null;
  const started = dependencies.monotonicNow();
  let adapterVersion = input.executionMode === "fixture" ? "one-deterministic-fixture/1.0.0" : "unavailable";
  let exactConfiguration = input.executionMode === "fixture"
    ? fixtureConfiguration()
    : requestedLiveConfiguration(input, selection);
  try {
    if (dependencies.signal?.aborted) throw new EvaluationCancelledError();
    if (input.executionMode === "fixture") {
      assertFixtureSelection(selection);
      const fixtureRequestStarted = dependencies.monotonicNow();
      requestStartOffset = Math.max(0, fixtureRequestStarted - started);
      requestTimestamp = dependencies.wallNow().toISOString();
      const wav = createDeterministicFixtureWav();
      const elapsed = Math.max(0, dependencies.monotonicNow() - fixtureRequestStarted);
      const fixtureCompletionTimestamp = dependencies.wallNow().toISOString();
      return successExecution(input, selection, blindLabel, adapterVersion, exactConfiguration, {
        audio: Uint8Array.from(wav).buffer,
        contentType: "audio/wav",
        model: selection.model,
        voice: selection.voice,
        encoding: "pcm_s16le",
        container: "wav",
        sampleRate: 24_000,
        outputFormat: "fixture-wav",
        responseHeaders: {},
        timing: {
          clock: "monotonic",
          measurementPoint: "one-server",
          requestTimestamp,
          firstAudioTimestamp: fixtureCompletionTimestamp,
          completionTimestamp: fixtureCompletionTimestamp,
          timeToFirstAudioMs: elapsed,
          totalTimeMs: elapsed,
        },
      }, validationTimestamp, requestStartOffset, started, dependencies, true);
    }

    const adapter = (dependencies.resolveAdapter ?? resolveTtsAdapter)(selection.providerId);
    adapterVersion = adapter.adapterVersion;
    const translated = translateProviderRequest(input, selection, adapter);
    exactConfiguration = translated.configuration;
    const configured = dependencies.isConfigured?.(selection.providerId)
      ?? getProviderConfigurationState(selection.providerId, dependencies.environment).configured;
    if (!configured) throw unavailableError("provider_not_configured", "This provider is not configured for live evaluation.");
    if (!isEvaluationProviderRuntimeEnabled(selection.providerId, dependencies.environment)) {
      throw unavailableError("provider_execution_disabled", "Live execution is disabled for this provider.");
    }
    if (!dependencies.runGuard) throw unavailableError("usage_boundary_unavailable", "The live usage boundary is unavailable.");
    const deadline = createDeadlineSignal(dependencies.signal, dependencies.timeoutsMs?.[selection.providerId] ?? PROVIDER_TIMEOUTS_MS[selection.providerId]);
    try {
      const result = await dependencies.runGuard(selection.providerId, async () => {
        const authorize = dependencies.authorizeExecution ?? authorizeProviderExecution;
        const authorization = adapter.requiresExplicitPolicyAuthorization
          ? await authorize(selection.providerId, "tts")
          : undefined;
        const catalog = getProviderAdapterRegistration(selection.providerId)?.catalog;
        const modelDiscoveryAuthorization = adapter.requiresExplicitPolicyAuthorization
          && catalog?.modelsRequireExecutionAuthorization
          && translated.request.model
          ? await authorize(selection.providerId, "models")
          : undefined;
        const discoveryAuthorization = adapter.requiresExplicitPolicyAuthorization
          && catalog?.voicesRequireExecutionAuthorization
          && translated.request.voice
          ? await authorize(selection.providerId, "voices")
          : undefined;
        requestStartOffset = Math.max(0, dependencies.monotonicNow() - started);
        requestTimestamp = dependencies.wallNow().toISOString();
        return adapter.execute(translated.request, {
          signal: deadline.signal,
          maxAudioBytes: EVALUATION_MAX_AUDIO_BYTES - 44,
          authorization,
          modelDiscoveryAuthorization,
          discoveryAuthorization,
        });
      });
      if (deadline.didTimeout()) throw new EvaluationTimeoutError();
      if (dependencies.signal?.aborted) throw new EvaluationCancelledError();
      return successExecution(input, selection, blindLabel, adapterVersion, exactConfiguration, result, validationTimestamp, requestStartOffset ?? 0, started, dependencies, false);
    } catch (error) {
      if (deadline.didTimeout()) throw new EvaluationTimeoutError();
      if (dependencies.signal?.aborted) throw new EvaluationCancelledError();
      throw error;
    } finally {
      deadline.dispose();
    }
  } catch (error) {
    return failureExecution(input, selection, blindLabel, adapterVersion, exactConfiguration, validationTimestamp, requestTimestamp, requestStartOffset, started, dependencies, error);
  }
}

function successExecution(
  input: EvaluationRunRequest,
  selection: EvaluationProviderSelection,
  blindLabel: BlindLabel,
  adapterVersion: string,
  configuration: Record<string, string | number | boolean | null>,
  result: ProviderTtsResult,
  validationTimestamp: string,
  requestStartOffset: number,
  started: number,
  dependencies: Required<Pick<EvaluationOrchestratorDependencies, "monotonicNow" | "wallNow">>,
  fixture: boolean,
): ProviderExecution {
  validateTiming(result);
  const prepared = prepareAudio(input, result, fixture);
  const completedOffset = Math.max(result.timing.totalTimeMs, dependencies.monotonicNow() - started);
  const audioProcessedTimestamp = dependencies.wallNow().toISOString();
  const evidence = evaluationProviderEvidenceSchema.parse({
    runId: input.runId,
    provider: selection.providerId,
    blindLabel,
    model: result.model,
    voice: result.voice ?? (selection.voice === "not-specified" ? "not-specified" : selection.voice),
    providerSpecificConfiguration: configuration,
    adapterVersion,
    environment: input.executionMode,
    region: process.env.VERCEL_REGION?.trim() || null,
    regionScope: process.env.VERCEL_REGION?.trim() ? "one-server" : null,
    requestTimestamp: result.timing.requestTimestamp,
    firstAudioTimestamp: result.timing.firstAudioTimestamp,
    completionTimestamp: result.timing.completionTimestamp,
    clientPlayableTimestamp: null,
    metrics: successMetrics(result, prepared.durationSeconds, fixture),
    audio: {
      mimeType: prepared.mimeType,
      durationSeconds: prepared.durationSeconds,
      storageReference: `ephemeral:${input.runId}:${blindLabel.toLowerCase().replace(" ", "-")}`,
      contentHash: hashBytes(prepared.bytes),
      rawContentHash: hashBytes(new Uint8Array(result.audio)),
      normalized: prepared.normalized,
    },
    status: "complete",
    trace: successTrace(validationTimestamp, requestStartOffset, audioProcessedTimestamp, result, completedOffset, fixture),
    sanitizedError: null,
    humanRating: emptyHumanRating(),
    sponsorshipDisclosure: null,
  });
  return { evidence, audioBase64: Buffer.from(prepared.bytes).toString("base64") };
}

function failureExecution(
  input: EvaluationRunRequest,
  selection: EvaluationProviderSelection,
  blindLabel: BlindLabel,
  adapterVersion: string,
  configuration: Record<string, string | number | boolean | null>,
  validationTimestamp: string,
  requestTimestamp: string | null,
  requestStartOffset: number | null,
  started: number,
  dependencies: Required<Pick<EvaluationOrchestratorDependencies, "monotonicNow" | "wallNow">>,
  error: unknown,
): ProviderExecution {
  const normalized = normalizeEvaluationError(error);
  const offset = Math.max(0, dependencies.monotonicNow() - started);
  const timestamp = dependencies.wallNow().toISOString();
  const evidence = evaluationProviderEvidenceSchema.parse({
    runId: input.runId,
    provider: selection.providerId,
    blindLabel,
    model: selection.model,
    voice: selection.voice,
    providerSpecificConfiguration: configuration,
    adapterVersion,
    environment: input.executionMode,
    region: process.env.VERCEL_REGION?.trim() || null,
    regionScope: process.env.VERCEL_REGION?.trim() ? "one-server" : null,
    requestTimestamp,
    firstAudioTimestamp: null,
    completionTimestamp: timestamp,
    clientPlayableTimestamp: null,
    metrics: failedMetrics(requestTimestamp !== null),
    audio: { mimeType: null, durationSeconds: null, storageReference: null, contentHash: null, rawContentHash: null, normalized: false },
    status: normalized.status,
    trace: [
      { type: "validation-start", timestamp: validationTimestamp, offsetMs: 0, observation: "observed", detail: "ONE began validation for this independent provider lane." },
      ...(requestTimestamp && requestStartOffset !== null ? [{ type: "provider-request-start" as const, timestamp: requestTimestamp, offsetMs: requestStartOffset, observation: "observed" as const, detail: "ONE reached the protected provider-dispatch boundary." }] : []),
      {
        type: normalized.status === "cancelled" ? "cancellation" : "failure",
        timestamp,
        offsetMs: offset,
        observation: "observed",
        detail: normalized.message,
      },
    ],
    sanitizedError: { code: normalized.code, message: normalized.message, retryable: normalized.retryable },
    humanRating: emptyHumanRating(),
    sponsorshipDisclosure: null,
  });
  return { evidence, audioBase64: null };
}

function prepareAudio(input: EvaluationRunRequest, result: ProviderTtsResult, fixture: boolean) {
  if (!fixture && input.evaluationMode === "standardized") {
    const mimeType = result.contentType.split(";", 1)[0].trim().toLowerCase();
    if (!(["pcm_s16le", "linear16"].includes(result.encoding))
      || result.sampleRate !== 24_000
      || !["audio/pcm", "audio/l16"].includes(mimeType)
      || !["none", "raw", undefined].includes(result.container)) {
      throw new EvaluationAudioValidationError("malformed", "The provider did not return the required raw 24 kHz signed 16-bit PCM output.");
    }
    const raw = validateEvaluationAudio(result.audio, mimeType, { maxBytes: EVALUATION_MAX_AUDIO_BYTES - 44, sampleRate: 24_000 });
    const wav = pcm16MonoToWav(raw.bytes, 24_000);
    const validated = validateEvaluationAudio(wav, "audio/wav", { maxBytes: EVALUATION_MAX_AUDIO_BYTES });
    return { ...validated, normalized: true };
  }
  return validateEvaluationAudio(result.audio, result.contentType, {
    maxBytes: EVALUATION_MAX_AUDIO_BYTES,
    sampleRate: result.sampleRate,
  });
}

function translateProviderRequest(
  input: EvaluationRunRequest,
  selection: EvaluationProviderSelection,
  adapter: ProviderTtsAdapter,
): {
  request: ProviderTtsRequest;
  configuration: Record<string, string | number | boolean | null>;
} {
  const standardized = input.evaluationMode === "standardized";
  const modelIdCarriesVoice = adapter.evaluationProfile?.voiceSelectionMode === "model-id";
  const voice = modelIdCarriesVoice || adapter.evaluationProfile?.optionalVoiceSentinel === selection.voice
    ? undefined
    : selection.voice;
  const model = selection.model;
  if (standardized) {
    const outputFormat = adapter.evaluationProfile?.standardizedOutputFormat
      ?? standardizedProviderOutputFormat(selection.providerId);
    const base = { text: input.scenario.text, model, voice, outputFormat };
    if (adapter.evaluationProfile) {
      const standardizedRequest = adapter.evaluationProfile.standardizedRequest ?? {};
      const standardizedEncoding = standardizedRequest.encoding
        ?? (outputFormat === "linear16" ? "linear16" : "pcm_s16le");
      return {
        request: { ...base, ...standardizedRequest },
        configuration: {
          comparisonMode: "standardized",
          outputFormat,
          encoding: standardizedEncoding,
          container: standardizedRequest.container ?? "none",
          sampleRate: standardizedRequest.sample_rate ?? 24_000,
          channels: 1,
          voiceOmitted: voice === undefined,
          ...adapter.evaluationProfile.standardizedConfiguration,
        },
      };
    }
    return {
      request: base,
      configuration: {
        comparisonMode: "standardized",
        outputFormat,
        encoding: outputFormat === "linear16" ? "linear16" : "pcm_s16le",
        container: "none",
        sampleRate: 24_000,
        channels: 1,
        voiceOmitted: voice === undefined,
      },
    };
  }

  const allowed = adapter.evaluationProfile
    ? new Set(adapter.evaluationProfile.nativeOutputFormats)
    : nativeOutputFormats();
  if (!allowed.has(selection.outputFormat)) {
    throw unavailableError("unsupported_output_format", "The selected provider-native output format is not allowlisted for evaluation.");
  }
  const request: ProviderTtsRequest = {
    text: input.scenario.text,
    model,
    voice,
    outputFormat: selection.outputFormat,
    ...adapter.evaluationProfile?.nativeOutputRequests?.[selection.outputFormat],
  };
  return {
    request,
    configuration: { comparisonMode: "provider-optimized", outputFormat: selection.outputFormat, voiceOmitted: voice === undefined },
  };
}

function successMetrics(result: ProviderTtsResult, durationSeconds: number | null, fixture: boolean): EvaluationMetric[] {
  const totalMs = result.timing.totalTimeMs;
  return [
    metric("server_time_to_first_audio_chunk", result.timing.timeToFirstAudioMs, "milliseconds", "measured", "one-server", "server-monotonic", fixture
      ? "Elapsed while ONE generated the neutral local interaction fixture; this is not provider latency evidence."
      : "Elapsed on ONE's server from adapter synthesis request start until the first upstream audio chunk was observed."),
    metric("time_to_first_audible_output", null, "unavailable", "unavailable", "one-browser", "not-applicable", "Unavailable until the browser observes audible playback."),
    metric("total_generation_time", totalMs, "milliseconds", "measured", "one-server", "server-monotonic", fixture
      ? "Elapsed while ONE generated and wrapped the neutral local fixture; this is not provider generation latency."
      : "Elapsed on ONE's server from adapter synthesis request start through complete audio receipt."),
    metric("audio_duration", durationSeconds, durationSeconds === null ? "unavailable" : "seconds", durationSeconds === null ? "unavailable" : "measured", "derived", "server-monotonic", "Derived from validated PCM/WAV metadata when available."),
    metric("real_time_factor", durationSeconds && durationSeconds > 0 ? totalMs / 1_000 / durationSeconds : null, durationSeconds ? "ratio" : "unavailable", durationSeconds ? "measured" : "unavailable", "derived", "server-monotonic", "Total server generation seconds divided by validated audio duration seconds."),
    metric("request_success", 1, "boolean", "measured", "one-server", "server-monotonic", "ONE observed a validated provider response and audio payload."),
    metric("client_time_to_playable", null, "unavailable", "unavailable", "one-browser", "not-applicable", "Collected separately by the browser after it can play the audio."),
    metric("estimated_cost", null, "unavailable", "unavailable", "derived", "not-applicable", "Unavailable because this adapter has no verified versioned pricing metadata."),
  ];
}

function failedMetrics(dispatched: boolean): EvaluationMetric[] {
  return [
    metric("server_time_to_first_audio_chunk", null, "unavailable", "unavailable", "one-server", "not-applicable", "No validated first audio chunk was observed."),
    metric("time_to_first_audible_output", null, "unavailable", "unavailable", "one-browser", "not-applicable", "No playable output was produced."),
    metric("total_generation_time", null, "unavailable", "unavailable", "one-server", "not-applicable", "Generation did not complete successfully."),
    metric("audio_duration", null, "unavailable", "unavailable", "derived", "not-applicable", "No validated audio duration is available."),
    metric("real_time_factor", null, "unavailable", "unavailable", "derived", "not-applicable", "Real-time factor requires successful timing and duration."),
    metric("request_success", 0, "boolean", "measured", "one-server", "server-monotonic", dispatched
      ? "ONE observed that the dispatched provider attempt did not complete successfully."
      : "ONE blocked this lane before upstream provider dispatch; no provider-success claim or cost claim is inferred."),
    metric("client_time_to_playable", null, "unavailable", "unavailable", "one-browser", "not-applicable", "No playable output was produced."),
    metric("estimated_cost", null, "unavailable", "unavailable", "derived", "not-applicable", "Cost is unavailable and no billing claim is inferred from the failure."),
  ];
}

function metric(
  name: EvaluationMetric["name"],
  value: number | null,
  unit: EvaluationMetric["unit"],
  availability: EvaluationMetric["availability"],
  measurementPoint: EvaluationMetric["measurementPoint"],
  clock: EvaluationMetric["provenance"]["clock"],
  description: string,
): EvaluationMetric {
  return {
    name,
    value: value === null ? null : Math.round(value * 1_000) / 1_000,
    unit,
    availability,
    measurementPoint,
    metricVersion: EVALUATION_METRIC_VERSION,
    provenance: { clock, description },
  };
}

function successTrace(
  validationTimestamp: string,
  requestStartOffset: number,
  audioProcessedTimestamp: string,
  result: ProviderTtsResult,
  completedOffset: number,
  fixture: boolean,
): EvaluationTraceEvent[] {
  const requestOffset = fixture ? requestStartOffset : null;
  const firstAudioOffset = fixture ? requestStartOffset + result.timing.timeToFirstAudioMs : null;
  const completionOffset = fixture ? requestStartOffset + result.timing.totalTimeMs : null;
  return [
    { type: "validation-start", timestamp: validationTimestamp, offsetMs: 0, observation: "observed", detail: "ONE began validation for the exact scenario and provider selection." },
    { type: "provider-request-start", timestamp: result.timing.requestTimestamp, offsetMs: requestOffset, observation: "observed", detail: fixture ? "ONE started deterministic local fixture generation; no provider was called." : "The server adapter captured this wall-clock anchor immediately before provider dispatch. Its independent monotonic duration starts here; no evaluation-relative offset is inferred." },
    { type: "connection-established", timestamp: null, offsetMs: null, observation: "unavailable", detail: fixture ? "No provider connection exists in deterministic fixture mode." : "The fetch boundary does not expose transport connection or stream-establishment timing separately, so ONE does not infer it." },
    { type: "first-audio-chunk", timestamp: result.timing.firstAudioTimestamp, offsetMs: firstAudioOffset, observation: "observed", detail: fixture ? "The complete neutral fixture became available locally; it does not represent a provider streaming event." : "The server adapter captured this wall-clock anchor when it observed the first non-empty upstream audio chunk. The separate first-audio metric carries the monotonic duration." },
    { type: "first-audible-output", timestamp: null, offsetMs: null, observation: "unavailable", detail: "Phase 1 does not claim audible output timing because browser playability and actual acoustic output are different measurement points." },
    { type: "completion", timestamp: result.timing.completionTimestamp, offsetMs: completionOffset, observation: "observed", detail: fixture ? "ONE completed deterministic fixture generation; no provider was called." : "The server adapter captured this wall-clock anchor after the bounded upstream audio stream completed. The separate total-time metric carries the monotonic duration." },
    { type: "audio-processing", timestamp: audioProcessedTimestamp, offsetMs: completedOffset, observation: "observed", detail: fixture ? "ONE validated and prepared the deterministic local fixture for playback." : "ONE validated, normalized, and hashed the bounded audio after provider receipt." },
  ];
}

function validateTiming(result: ProviderTtsResult): void {
  const timing = result.timing;
  if (timing.clock !== "monotonic" || timing.measurementPoint !== "one-server"
    || !Number.isFinite(timing.timeToFirstAudioMs) || timing.timeToFirstAudioMs < 0
    || !Number.isFinite(timing.totalTimeMs) || timing.totalTimeMs < timing.timeToFirstAudioMs
    || !isExactIsoTimestamp(timing.requestTimestamp)
    || !isExactIsoTimestamp(timing.firstAudioTimestamp)
    || !isExactIsoTimestamp(timing.completionTimestamp)
    || Date.parse(timing.firstAudioTimestamp) < Date.parse(timing.requestTimestamp)
    || Date.parse(timing.completionTimestamp) < Date.parse(timing.firstAudioTimestamp)) {
    throw new EvaluationAudioValidationError("malformed", "The provider adapter returned invalid timing provenance.");
  }
}

function isExactIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function normalizeEvaluationError(error: unknown): {
  code: string;
  message: string;
  status: EvaluationProviderStatus;
  retryable: boolean;
} {
  if (error instanceof EvaluationCancelledError) return { code: "cancelled", message: "This provider attempt was cancelled.", status: "cancelled", retryable: false };
  if (error instanceof EvaluationTimeoutError) return { code: "provider_timeout", message: "This provider attempt reached its hard timeout.", status: "timed-out", retryable: true };
  if (error instanceof EvaluationAudioValidationError) {
    return error.code === "too_large"
      ? { code: "response_too_large", message: "The provider audio exceeded the evaluation response limit.", status: "failed", retryable: false }
      : { code: "provider_malformed_response", message: "The provider returned unsupported or malformed audio evidence.", status: "failed", retryable: false };
  }
  if (error instanceof ProviderAdapterError) {
    return { code: error.code, message: "This provider is not available through a verified TTS adapter.", status: "unavailable", retryable: false };
  }
  if (error instanceof ProviderOperationError) {
    const unavailable = error.code === "provider_not_configured" || error.code === "provider_demo_only";
    const timedOut = error.code === "provider_timeout";
    const safeMessages: Partial<Record<ProviderOperationError["code"], string>> = {
      provider_not_configured: "This provider is not configured for live evaluation.",
      provider_demo_only: "Live execution is disabled for this provider.",
      provider_rate_limited: "The provider attempt reached ONE's bounded request limit.",
      provider_quota_exhausted: "The durable usage or provider quota boundary denied this attempt.",
      provider_timeout: "This provider attempt reached its hard timeout.",
      provider_malformed_response: "The provider returned an invalid response.",
      provider_unauthorized: "The server credential was rejected by this provider.",
      provider_forbidden: "This provider account is not authorized for the selected capability.",
    };
    return {
      code: error.code,
      message: safeMessages[error.code] ?? "The provider attempt failed safely.",
      status: timedOut ? "timed-out" : unavailable ? "unavailable" : "failed",
      retryable: timedOut || error.code === "provider_rate_limited" || error.code === "provider_failure",
    };
  }
  if (error instanceof EvaluationUnavailableError) return { code: error.code, message: error.message, status: "unavailable", retryable: false };
  if (error instanceof Error && /abort/i.test(error.name)) return { code: "cancelled", message: "This provider attempt was cancelled.", status: "cancelled", retryable: false };
  return { code: "provider_failure", message: "The provider attempt failed safely without exposing upstream details.", status: "failed", retryable: true };
}

class EvaluationCancelledError extends Error {}
class EvaluationTimeoutError extends Error {}
class EvaluationUnavailableError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

function unavailableError(code: string, message: string) {
  return new EvaluationUnavailableError(code, message);
}

function createDeadlineSignal(parent: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(parent?.reason ?? new EvaluationCancelledError());
  if (parent?.aborted) abort();
  else parent?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new EvaluationTimeoutError());
  }, Math.max(1, timeoutMs));
  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", abort);
    },
  };
}

async function mapWithConcurrency<T>(items: readonly T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index]);
    }
  }));
}

function fixtureConfiguration(): Record<string, string | number | boolean | null> {
  return { comparisonMode: "fixture", fixture: "neutral-interaction-tone", outputFormat: "fixture-wav", encoding: "pcm_s16le", sampleRate: 24_000, channels: 1 };
}

function requestedLiveConfiguration(
  input: EvaluationRunRequest,
  selection: EvaluationProviderSelection,
): Record<string, string | number | boolean | null> {
  return {
    comparisonMode: input.evaluationMode,
    requestedOutputFormat: selection.outputFormat,
    configurationState: "not-dispatched",
  };
}

function nativeOutputFormats(): ReadonlySet<string> {
  return new Set(["raw"]);
}

function emptyHumanRating() {
  return { naturalness: null, intelligibility: null, pronunciation: null, emotionalFit: null, useCaseFit: null, overallPreference: false, ratedAt: null, ratedBeforeReveal: null };
}

function hashBytes(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function requireBlindLabel(label: BlindLabel | undefined): BlindLabel {
  if (!label) throw new Error("Blind label assignment failed.");
  return label;
}
