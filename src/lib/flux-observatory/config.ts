import {
  FLUX_ENCODINGS,
  FLUX_MODELS,
  FLUX_SAMPLE_RATES,
  FLUX_SUPPORTED_LANGUAGE_CODES,
  type FluxConfiguration,
  type FluxConfigurationUpdate,
  type FluxConfigureMessage,
  type FluxModel,
  type FluxSampleRate,
  type FluxValidationResult,
} from "./types";
import { sanitizeFluxText } from "./security";

export const DEFAULT_FLUX_CONFIGURATION: FluxConfiguration = {
  model: "flux-general-en",
  encoding: "linear16",
  sampleRate: 16000,
  targetChunkMs: 80,
  thresholds: { eotThreshold: 0.7, eagerEotThreshold: null, eotTimeoutMs: 5000 },
  keyterms: [],
  languageHints: [],
};

const LANGUAGE_CODE = /^[a-z]{2}(?:-[A-Za-z]{2,8})?$/;

export function validateFluxConfiguration(input: FluxConfiguration): FluxValidationResult<FluxConfiguration> {
  const errors: string[] = [];
  if (!FLUX_MODELS.includes(input.model)) errors.push("Flux requires flux-general-en or flux-general-multi.");
  if (!FLUX_ENCODINGS.includes(input.encoding)) errors.push("Unsupported Flux audio encoding.");
  if (!FLUX_SAMPLE_RATES.includes(input.sampleRate)) errors.push("Unsupported Flux sample rate.");
  if (!Number.isInteger(input.targetChunkMs) || input.targetChunkMs < 10 || input.targetChunkMs > 1000) {
    errors.push("Configured target chunk cadence must be an integer from 10 to 1000 milliseconds.");
  }
  validateThresholds(input.thresholds, errors, true);
  validateTerms(input.keyterms, errors);
  validateLanguageHints(input.model, input.languageHints, errors);
  return errors.length ? { success: false, errors } : { success: true, value: cloneConfiguration(input), errors };
}

export function validateFluxConfigurationUpdate(
  update: FluxConfigurationUpdate,
  active: FluxConfiguration,
): FluxValidationResult<FluxConfigurationUpdate> {
  const errors: string[] = [];
  const mergedThresholds = { ...active.thresholds, ...update.thresholds };
  if (update.thresholds) validateThresholds(mergedThresholds, errors, true);
  if (update.keyterms) validateTerms(update.keyterms, errors);
  if (update.languageHints !== undefined && update.languageHints !== null) validateLanguageHints(active.model, update.languageHints, errors);
  const thresholdUpdate = update.thresholds ? { ...update.thresholds } : undefined;
  if (thresholdUpdate?.eagerEotThreshold === null) delete thresholdUpdate.eagerEotThreshold;
  const value: FluxConfigurationUpdate = {
    ...(thresholdUpdate && Object.keys(thresholdUpdate).length ? { thresholds: thresholdUpdate } : {}),
    ...(update.keyterms ? { keyterms: update.keyterms.map((term) => sanitizeFluxText(term, 120)).filter(Boolean) } : {}),
    ...(update.languageHints !== undefined ? { languageHints: update.languageHints === null ? null : [...update.languageHints] } : {}),
  };
  return errors.length ? { success: false, errors } : { success: true, value, errors };
}

export function mergeFluxConfiguration(active: FluxConfiguration, update: FluxConfigurationUpdate): FluxConfiguration {
  return {
    ...cloneConfiguration(active),
    thresholds: { ...active.thresholds, ...update.thresholds },
    keyterms: update.keyterms === undefined ? [...active.keyterms] : update.keyterms.map((term) => sanitizeFluxText(term, 120)).filter(Boolean),
    languageHints:
      update.languageHints === undefined || update.languageHints === null ? [...active.languageHints] : [...update.languageHints],
  };
}

export function buildFluxListenUrl(configuration: FluxConfiguration): string {
  const result = validateFluxConfiguration(configuration);
  if (!result.success || !result.value) throw new Error(result.errors.join(" "));
  const safeConfiguration = result.value;
  const url = new URL("wss://api.deepgram.com/v2/listen");
  url.searchParams.set("model", safeConfiguration.model);
  url.searchParams.set("encoding", safeConfiguration.encoding);
  url.searchParams.set("sample_rate", String(safeConfiguration.sampleRate));
  url.searchParams.set("eot_threshold", String(safeConfiguration.thresholds.eotThreshold));
  if (safeConfiguration.thresholds.eagerEotThreshold !== null) {
    url.searchParams.set("eager_eot_threshold", String(safeConfiguration.thresholds.eagerEotThreshold));
  }
  url.searchParams.set("eot_timeout_ms", String(safeConfiguration.thresholds.eotTimeoutMs));
  safeConfiguration.keyterms.forEach((term) => url.searchParams.append("keyterm", term));
  safeConfiguration.languageHints.forEach((hint) => url.searchParams.append("language_hint", hint));
  return url.toString();
}

export function buildFluxConfigureMessage(update: FluxConfigurationUpdate, active: FluxConfiguration): FluxConfigureMessage {
  const result = validateFluxConfigurationUpdate(update, active);
  if (!result.success || !result.value) throw new Error(result.errors.join(" "));
  const message: FluxConfigureMessage = { type: "Configure" };
  if (result.value.thresholds) {
    message.thresholds = {};
    if (result.value.thresholds.eotThreshold !== undefined) message.thresholds.eot_threshold = result.value.thresholds.eotThreshold;
    if (result.value.thresholds.eagerEotThreshold !== undefined && result.value.thresholds.eagerEotThreshold !== null) {
      message.thresholds.eager_eot_threshold = result.value.thresholds.eagerEotThreshold;
    }
    if (result.value.thresholds.eotTimeoutMs !== undefined) message.thresholds.eot_timeout_ms = result.value.thresholds.eotTimeoutMs;
  }
  if (result.value.keyterms !== undefined) message.keyterms = [...result.value.keyterms];
  if (result.value.languageHints !== undefined) message.language_hints = result.value.languageHints === null ? null : [...result.value.languageHints];
  return message;
}

export function isFluxModel(value: unknown): value is FluxModel {
  return typeof value === "string" && FLUX_MODELS.includes(value as FluxModel);
}

export function isFluxSampleRate(value: unknown): value is FluxSampleRate {
  return typeof value === "number" && FLUX_SAMPLE_RATES.includes(value as FluxSampleRate);
}

export function cloneConfiguration(configuration: FluxConfiguration): FluxConfiguration {
  return {
    model: configuration.model,
    encoding: configuration.encoding,
    sampleRate: configuration.sampleRate,
    targetChunkMs: configuration.targetChunkMs,
    thresholds: {
      eotThreshold: configuration.thresholds.eotThreshold,
      eagerEotThreshold: configuration.thresholds.eagerEotThreshold,
      eotTimeoutMs: configuration.thresholds.eotTimeoutMs,
    },
    keyterms: configuration.keyterms.map((term) => sanitizeFluxText(term, 120)).filter(Boolean),
    languageHints: [...configuration.languageHints],
  };
}

function validateThresholds(thresholds: FluxConfiguration["thresholds"], errors: string[], requireAll: boolean) {
  if ((requireAll || thresholds.eotThreshold !== undefined) && (!Number.isFinite(thresholds.eotThreshold) || thresholds.eotThreshold < 0.5 || thresholds.eotThreshold > 0.9)) {
    errors.push("eot_threshold must be between 0.5 and 0.9.");
  }
  if (thresholds.eagerEotThreshold !== null && thresholds.eagerEotThreshold !== undefined) {
    if (!Number.isFinite(thresholds.eagerEotThreshold) || thresholds.eagerEotThreshold < 0.3 || thresholds.eagerEotThreshold > 0.9) {
      errors.push("eager_eot_threshold must be between 0.3 and 0.9.");
    }
    if (thresholds.eagerEotThreshold > thresholds.eotThreshold) {
      errors.push("eager_eot_threshold must not exceed eot_threshold.");
    }
  }
  if ((requireAll || thresholds.eotTimeoutMs !== undefined) && (!Number.isInteger(thresholds.eotTimeoutMs) || thresholds.eotTimeoutMs < 500 || thresholds.eotTimeoutMs > 60000)) {
    errors.push("eot_timeout_ms must be an integer from 500 to 60000.");
  }
}

function validateTerms(terms: string[], errors: string[]) {
  if (terms.length > 100) errors.push("Flux supports at most 100 keyterms.");
  if (terms.some((term) => typeof term !== "string" || term.trim().length === 0 || term.length > 120)) {
    errors.push("Keyterms must be non-empty strings no longer than 120 characters.");
  }
}

function validateLanguageHints(model: FluxModel, hints: string[], errors: string[]) {
  if (hints.length && model !== "flux-general-multi") errors.push("language_hint is supported only by flux-general-multi.");
  if (hints.length > 10) errors.push("At most 10 language hints are accepted by this client boundary.");
  if (hints.some((hint) => !LANGUAGE_CODE.test(hint))) errors.push("Language hints must be BCP-47-style language codes.");
  if (hints.some((hint) => !FLUX_SUPPORTED_LANGUAGE_CODES.includes(hint.toLowerCase().split("-")[0] as (typeof FLUX_SUPPORTED_LANGUAGE_CODES)[number]))) {
    errors.push("Language hints must use a language currently supported by flux-general-multi.");
  }
}
