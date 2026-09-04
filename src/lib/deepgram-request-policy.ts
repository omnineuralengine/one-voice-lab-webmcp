import {
  getDeepgramEndpoint,
  regionHost,
  resolveDeepgramPath,
} from "@/lib/deepgram-endpoint-registry";
import { DeepgramModelPolicyError, parseAuraTtsFormat } from "@/lib/deepgram-model-policy";
import {
  DeepgramPrerecordedPolicyError,
  normalizePrerecordedAudioUrl,
} from "@/lib/deepgram-prerecorded-policy";
import { isOpenLabMode } from "@/lib/open-lab";
import { normalizePublicProviderFetchUrl, PublicProviderUrlError } from "@/lib/public-provider-url";
import type {
  DeepgramEffectiveRequest,
  DeepgramEndpointDefinition,
  DeepgramExecuteInput,
  DeepgramParameterDefinition,
  DeepgramRegion,
  DeepgramValidationIssue,
} from "@/types/deepgram-endpoint-registry";

export type DeepgramPreparedRequest = {
  endpoint: DeepgramEndpointDefinition;
  url: URL;
  effective: DeepgramEffectiveRequest;
  body: unknown;
  contentType: string;
};

export class DeepgramPolicyError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly code = "invalid_request",
    public readonly issues: DeepgramValidationIssue[] = [],
  ) {
    super(message);
    this.name = "DeepgramPolicyError";
  }
}

export function prepareDeepgramRequest(input: DeepgramExecuteInput): DeepgramPreparedRequest {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DeepgramPolicyError("Request payload must be a JSON object.");
  }
  if ("host" in input || "url" in input) {
    throw new DeepgramPolicyError("Host and URL overrides are not accepted.", 400, "host_override_rejected");
  }

  const endpoint = getDeepgramEndpoint(readRequiredString(input.endpointId, "endpointId"));
  if (!endpoint) {
    throw new DeepgramPolicyError("Unknown Deepgram endpoint ID.", 404, "unknown_endpoint");
  }
  if (input.expectedMethod && input.expectedMethod !== endpoint.method) {
    throw new DeepgramPolicyError(
      `Method ${input.expectedMethod} is not allowed for ${endpoint.id}.`,
      405,
      "method_not_allowed",
    );
  }
  if (endpoint.protocol !== "https" || endpoint.executionMode === "handoff") {
    throw new DeepgramPolicyError("This endpoint must run through its guided browser workflow.", 409, "handoff_required");
  }
  if (endpoint.riskTier === 3 || endpoint.executionMode === "locked") {
    validateMutationLock(endpoint, input);
    throw new DeepgramPolicyError(
      "Advanced mutations are intentionally disabled in this build even after confirmation.",
      423,
      "mutation_locked",
    );
  }

  const region = normalizeRegion(input.region);
  if (!endpoint.regionalSupport.includes(region)) {
    throw new DeepgramPolicyError(`${region.toUpperCase()} is not supported for ${endpoint.id}.`, 400, "region_not_supported");
  }

  const pathValues = normalizeRecord(input.path, "path");
  const queryValues = normalizeRecord(input.query, "query");
  rejectUnknownFields(endpoint, pathValues, "path");
  rejectUnknownFields(endpoint, queryValues, "query");
  const { path, issues } = resolveDeepgramPath(endpoint, pathValues);
  const parameterIssues = [
    ...issues,
    ...validateParameters(endpoint, pathValues, "path"),
    ...validateParameters(endpoint, queryValues, "query"),
  ];

  let body = normalizeBody(input.body);
  if (isRecord(body)) {
    rejectUnknownFields(endpoint, body, "body");
    parameterIssues.push(...validateParameters(endpoint, body, "body"));
    if (endpoint.id === "text-intelligence" && !readNonEmptyString(body.text) && !readNonEmptyString(body.url)) {
      parameterIssues.push({ field: "body", message: "Provide text or a text URL.", severity: "error" });
    }
    if (endpoint.id === "text-intelligence" && readNonEmptyString(body.text) && readNonEmptyString(body.url)) {
      parameterIssues.push({ field: "body", message: "Provide text or url, not both.", severity: "error" });
    }
  } else if (endpoint.parameters.some((item) => item.location === "body" && item.required)) {
    parameterIssues.push({ field: "body", message: "A JSON request body is required.", severity: "error" });
  }
  body = normalizeProviderDestinations(endpoint.id, queryValues, body);
  validateEndpointSpecificPolicy(endpoint.id, queryValues);
  if (parameterIssues.some((item) => item.severity === "error")) {
    throw new DeepgramPolicyError("Request validation failed.", 400, "validation_failed", parameterIssues);
  }

  const url = new URL(`https://${regionHost(region)}${path}`);
  appendQuery(url, endpoint, queryValues);
  const contentType = normalizeContentType(endpoint, input.contentType);
  const effective: DeepgramEffectiveRequest = {
    endpointId: endpoint.id,
    method: endpoint.method,
    protocol: endpoint.protocol,
    sanitizedUrl: url.toString(),
    headers: {
      Authorization: "Configured (server only)",
      Accept: endpoint.responseType === "audio" ? "audio/*" : "application/json",
      ...(endpoint.method === "POST" || endpoint.method === "PUT" || endpoint.method === "PATCH"
        ? { "Content-Type": contentType }
        : {}),
    },
    body: sanitizeForBrowser(body),
  };

  return { endpoint, url, effective, body, contentType };
}

export function sanitizeForBrowser(value: unknown, knownSecrets: readonly string[] = []): unknown {
  if (typeof value === "string") return sanitizeBrowserString(value, knownSecrets);
  if (Array.isArray(value)) return value.map((item) => sanitizeForBrowser(item, knownSecrets));
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => {
    const normalized = key.toLowerCase().replaceAll("-", "_");
    const secret = normalized === "authorization" || normalized === "api_key" || normalized === "access_token" || normalized === "token" || normalized === "key";
    return [key, secret ? "***redacted***" : sanitizeForBrowser(child, knownSecrets)];
  }));
}

function sanitizeBrowserString(value: string, knownSecrets: readonly string[]) {
  let safe = value
    .replace(/\b(Token|Bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 ***redacted***")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "***redacted-jwt***");
  for (const secret of knownSecrets) {
    if (secret.length >= 8) safe = safe.replaceAll(secret, "***redacted***");
  }
  return safe;
}

function normalizeProviderDestinations(
  endpointId: string,
  query: Record<string, unknown>,
  body: ReturnType<typeof normalizeBody>,
): ReturnType<typeof normalizeBody> {
  if (isOpenLabMode() && (readNonEmptyString(query.callback) || readNonEmptyString(query.callback_method))) {
    throw new DeepgramPolicyError(
      "Provider callbacks are educational-only in the public Open Lab.",
      400,
      "open_lab_callback_locked",
    );
  }
  if (!isRecord(body) || !readNonEmptyString(body.url)) return body;
  try {
    const normalizedUrl = endpointId === "stt-prerecorded"
      ? normalizePrerecordedAudioUrl(body.url)
      : normalizePublicProviderFetchUrl(body.url);
    return { ...body, url: normalizedUrl };
  } catch (error) {
    if (error instanceof DeepgramPrerecordedPolicyError) {
      throw new DeepgramPolicyError(error.message, error.status, error.code);
    }
    if (error instanceof PublicProviderUrlError) {
      throw new DeepgramPolicyError(error.message, 400, "unsafe_remote_url");
    }
    throw error;
  }
}

function validateEndpointSpecificPolicy(endpointId: string, query: Record<string, unknown>) {
  if (endpointId !== "tts-rest") return;
  try {
    parseAuraTtsFormat({
      encoding: query.encoding,
      container: query.container,
      sampleRate: query.sample_rate,
      bitRate: query.bit_rate,
    });
  } catch (error) {
    if (error instanceof DeepgramModelPolicyError) {
      throw new DeepgramPolicyError(error.message, 400, "unsupported_tts_format");
    }
    throw error;
  }
}

function validateMutationLock(endpoint: DeepgramEndpointDefinition, input: DeepgramExecuteInput) {
  if (!input.advancedAdministrationMode) {
    throw new DeepgramPolicyError("Enable Advanced Administration Mode before preparing this mutation.", 423, "advanced_mode_required");
  }
  if (input.confirmation !== endpoint.confirmationPhrase) {
    throw new DeepgramPolicyError(`Type the exact confirmation phrase: ${endpoint.confirmationPhrase}`, 423, "confirmation_required");
  }
}

function normalizeRegion(value: unknown): DeepgramRegion {
  if (value === undefined || value === "global") return "global";
  if (value === "eu" || value === "au") return value;
  throw new DeepgramPolicyError("Region must be global, eu, or au.", 400, "invalid_region");
}

function normalizeRecord(value: unknown, name: string): Record<string, unknown> {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new DeepgramPolicyError(`${name} must be an object.`);
  return value;
}

function normalizeBody(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || Array.isArray(value) || isRecord(value)) return value;
  throw new DeepgramPolicyError("body must contain JSON-compatible data.");
}

function validateParameters(endpoint: DeepgramEndpointDefinition, values: Record<string, unknown>, location: DeepgramParameterDefinition["location"]) {
  const issues: DeepgramValidationIssue[] = [];
  for (const parameter of endpoint.parameters.filter((item) => item.location === location)) {
    const value = values[parameter.name];
    if (parameter.required && isEmpty(value)) {
      issues.push({ field: parameter.name, message: `${parameter.label} is required.`, severity: "error" });
      continue;
    }
    if (isEmpty(value)) continue;
    if (!matchesType(parameter, value)) {
      issues.push({ field: parameter.name, message: `${parameter.label} must be ${parameter.valueType}.`, severity: "error" });
    }
    if (parameter.allowedValues && !parameter.allowedValues.includes(String(value))) {
      issues.push({ field: parameter.name, message: `${parameter.label} is not an allowed value.`, severity: "error" });
    }
    if (typeof value === "number" && parameter.minimum !== undefined && value < parameter.minimum) {
      issues.push({ field: parameter.name, message: `${parameter.label} must be at least ${parameter.minimum}.`, severity: "error" });
    }
    if (typeof value === "number" && parameter.maximum !== undefined && value > parameter.maximum) {
      issues.push({ field: parameter.name, message: `${parameter.label} must be at most ${parameter.maximum}.`, severity: "error" });
    }
  }
  return issues;
}

function rejectUnknownFields(endpoint: DeepgramEndpointDefinition, values: Record<string, unknown>, location: DeepgramParameterDefinition["location"]) {
  const allowed = new Set(endpoint.parameters.filter((item) => item.location === location).map((item) => item.name));
  const unknown = Object.keys(values).filter((key) => !allowed.has(key));
  if (unknown.length) throw new DeepgramPolicyError(`Unsupported ${location} parameter(s): ${unknown.join(", ")}.`, 400, "unsupported_parameter");
}

function appendQuery(url: URL, endpoint: DeepgramEndpointDefinition, values: Record<string, unknown>) {
  for (const parameter of endpoint.parameters.filter((item) => item.location === "query")) {
    const value = values[parameter.name] ?? parameter.defaultValue;
    if (isEmpty(value)) continue;
    if (Array.isArray(value)) {
      for (const child of value) url.searchParams.append(parameter.name, String(child));
    } else {
      url.searchParams.set(parameter.name, String(value));
    }
  }
}

function normalizeContentType(endpoint: DeepgramEndpointDefinition, requested: unknown) {
  const fallback = endpoint.contentTypes.includes("application/json") ? "application/json" : endpoint.contentTypes[0];
  if (requested === undefined) return fallback ?? "application/octet-stream";
  if (typeof requested !== "string" || requested.length > 120 || /[\r\n]/.test(requested)) {
    throw new DeepgramPolicyError("Invalid content type.");
  }
  const allowed = endpoint.contentTypes.some((item) => item === requested || (item.endsWith("/*") && requested.startsWith(item.slice(0, -1))));
  if (!allowed) throw new DeepgramPolicyError("Content type is not allowed for this endpoint.", 415, "unsupported_content_type");
  return requested;
}

function matchesType(parameter: DeepgramParameterDefinition, value: unknown) {
  if (parameter.valueType === "boolean") return typeof value === "boolean";
  if (parameter.valueType === "number") return typeof value === "number" && Number.isFinite(value);
  if (parameter.valueType === "string-array") return Array.isArray(value) && value.every((item) => typeof item === "string");
  if (parameter.valueType === "json") return value !== undefined;
  if (parameter.valueType === "binary") return typeof value === "string";
  return typeof value === "string";
}

function readRequiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new DeepgramPolicyError(`${field} is required.`);
  return value.trim();
}
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function isEmpty(value: unknown) { return value === undefined || value === null || value === ""; }
function readNonEmptyString(value: unknown) { return typeof value === "string" && Boolean(value.trim()); }
