import { POCKET_API_PRESET_IDS, POCKET_API_PRESETS, getPocketApiPreset } from "@/data/pocket-api-lab";
import { generateDeepgramCodeSnippets } from "@/lib/deepgram-codegen";
import { DEEPGRAM_ENDPOINT_REGISTRY, getDeepgramEndpoint, regionHost } from "@/lib/deepgram-endpoint-registry";
import type { CodeLabWorkflowId } from "@/lib/code-lab-files";
import type { DeepgramEffectiveRequest, DeepgramEndpointDefinition, DeepgramParameterDefinition } from "@/types/deepgram-endpoint-registry";
import type {
  PocketApiComparisonRow,
  PocketApiHandoffs,
  PocketApiOperationClass,
  PocketApiPinnedSnippet,
  PocketApiPreset,
  PocketApiQuestionHistoryItem,
  PocketApiRequestExample,
  PocketApiSnippetLanguage,
  PocketApiStoredState,
} from "@/types/pocket-api-lab";

export const POCKET_API_STORAGE_KEY = "deepgram-pocket:api-field:v1";
export const DEFAULT_POCKET_API_STATE: PocketApiStoredState = {
  schemaVersion: 1,
  selectedPresetId: POCKET_API_PRESETS[0].id,
  quickCallMode: true,
  recentQuestions: [],
  pinnedSnippets: [],
};

const SNIPPET_LANGUAGES = new Set<PocketApiSnippetLanguage>(["curl", "javascript", "python", "json"]);
const FEATURE_PARAMETERS = new Set(["smart_format", "punctuate", "diarize", "redact", "language", "language_hint", "keyterm", "endpointing", "vad_events", "interim_results", "eot_threshold", "eot_timeout_ms"]);

export function searchPocketApiRegistry(query: string, family?: string) {
  const normalized = query.trim().toLowerCase();
  return DEEPGRAM_ENDPOINT_REGISTRY.filter((endpoint) => {
    if (family && endpoint.family !== family) return false;
    if (!normalized) return true;
    const haystack = [endpoint.id, endpoint.officialName, endpoint.family, endpoint.description, endpoint.method, endpoint.protocol,
      ...endpoint.parameters.flatMap((parameter) => [parameter.name, parameter.label, parameter.description])].join(" ").toLowerCase();
    return haystack.includes(normalized);
  });
}

export function classifyPocketApiOperation(endpoint: DeepgramEndpointDefinition): PocketApiOperationClass {
  if (endpoint.riskTier === 3 || endpoint.executionMode === "locked") return "mutating";
  if (endpoint.billable) return "billable";
  return "read-only";
}

export function requiresPocketApiConfirmation(endpoint: DeepgramEndpointDefinition) {
  return endpoint.billable || endpoint.family === "Administration" || endpoint.projectRoleRequirement === "admin" || endpoint.projectRoleRequirement === "owner";
}

export function getPocketApiAvailabilityNote(
  endpoint: DeepgramEndpointDefinition,
  options: Readonly<{ openLabMode: boolean; apiConfigured: boolean }>,
) {
  if (endpoint.hostedExecution?.state === "unavailable") {
    return "Hosted Voice Agent execution is disabled in this lab; the registry remains available for inspection.";
  }
  if (options.openLabMode) {
    return options.apiConfigured
      ? "Shared live project ready. The permanent credential remains server-side."
      : "Live provider paused. Registry examples remain available.";
  }
  return `Server credential: ${options.apiConfigured ? "configured" : "not configured"}. The browser receives only this boolean, never the credential value.`;
}

export function buildPocketApiRequestExample(endpoint: DeepgramEndpointDefinition, preset?: PocketApiPreset): PocketApiRequestExample {
  const request = preset?.endpointId === endpoint.id ? preset.request : {};
  const pathValues = isRecord(request.path) ? request.path : {};
  const queryValues = isRecord(request.query) ? request.query : {};
  const unresolvedInputs: string[] = [];
  const path = endpoint.pathTemplate.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name: string) => {
    const supplied = pathValues[name];
    if (typeof supplied === "string" && supplied.trim()) return encodeURIComponent(supplied.trim());
    unresolvedInputs.push(name);
    return `YOUR_${name.toUpperCase()}`;
  });
  const url = new URL(`${endpoint.protocol}://${regionHost("global")}${path}`);
  for (const parameter of endpoint.parameters.filter((item) => item.location === "query")) {
    const value = queryValues[parameter.name] ?? parameter.defaultValue;
    if (value === undefined || value === "" || value === false) continue;
    if (Array.isArray(value)) value.forEach((item) => url.searchParams.append(parameter.name, String(item)));
    else url.searchParams.set(parameter.name, String(value));
  }
  const body = buildRequestBody(endpoint, request.body, unresolvedInputs);
  const effective: DeepgramEffectiveRequest = {
    endpointId: endpoint.id,
    method: endpoint.method,
    protocol: endpoint.protocol,
    sanitizedUrl: url.toString(),
    headers: {
      Authorization: endpoint.authenticationMode === "temporary-token" ? "Bearer temporary token (not displayed)" : "Configured on server (not displayed)",
      ...(endpoint.method === "POST" || endpoint.method === "PUT" || endpoint.method === "PATCH" ? { "Content-Type": "application/json" } : {}),
    },
    body,
  };
  const generated = generateDeepgramCodeSnippets(endpoint, effective);
  const rawJson = endpoint.protocol === "wss" ? streamJson(endpoint) : JSON.stringify(body ?? {}, null, 2);
  return {
    endpointId: endpoint.id,
    sanitizedUrl: effective.sanitizedUrl,
    snippets: { curl: generated.curl, javascript: generated.TypeScript, python: generated.Python, json: rawJson },
    executeInput: {
      endpointId: endpoint.id,
      expectedMethod: endpoint.method,
      region: "global",
      path: pathValues,
      query: queryValues,
      body,
    },
    executable: endpoint.executionMode === "server-rest" && endpoint.riskTier < 3 && unresolvedInputs.length === 0,
    unresolvedInputs,
  };
}

export function buildPocketApiHandoffs(endpoint: DeepgramEndpointDefinition): PocketApiHandoffs {
  const operation = encodeURIComponent(endpoint.id);
  const workflow = encodeURIComponent(codeLabWorkflow(endpoint));
  return {
    apiLab: `/?module=api-studio&operation=${operation}&source=pocket-api-lab`,
    codeLab: `/?module=code-lab&workflow=${workflow}&operation=${operation}&source=pocket-api-lab`,
    architectureStudio: `/architecture-studio?source=pocket-api-lab&operation=${operation}&capability=${encodeURIComponent(endpoint.family)}`,
  };
}

export function getPocketApiComparisonRows(): PocketApiComparisonRow[] {
  return DEEPGRAM_ENDPOINT_REGISTRY.filter((endpoint) => ["Speech to Text", "Text to Speech", "Voice Agent"].includes(endpoint.family)).map((endpoint) => {
    const model = endpoint.parameters.find((parameter) => parameter.name === "model");
    return {
      endpointId: endpoint.id,
      surface: endpoint.officialName,
      models: model?.allowedValues?.join(", ") ?? (model?.defaultValue ? String(model.defaultValue) : "Configured in request settings"),
      protocol: endpoint.protocol.toUpperCase(),
      operation: describePocketApiInteraction(endpoint),
      features: endpoint.parameters.filter((parameter) => FEATURE_PARAMETERS.has(parameter.name)).map((parameter) => parameter.label),
    };
  });
}

export function describePocketApiInteraction(endpoint: DeepgramEndpointDefinition) {
  if (endpoint.protocol === "wss") return endpoint.id.includes("flux") ? "Turn-aware WebSocket streaming" : "Realtime WebSocket streaming";
  if (endpoint.parameters.some((parameter) => parameter.name === "callback")) return "HTTPS request with optional callback delivery";
  if (endpoint.id === "stt-prerecorded") return "Prerecorded HTTPS request";
  if (endpoint.responseType === "audio") return "Synchronous HTTPS audio response";
  return endpoint.method === "GET" ? "Synchronous HTTPS read" : "Synchronous HTTPS request";
}

export function sanitizePocketApiStoredState(value: unknown): PocketApiStoredState {
  if (!isRecord(value)) return cloneDefaultState();
  const selectedPresetId = typeof value.selectedPresetId === "string" && POCKET_API_PRESET_IDS.has(value.selectedPresetId) ? value.selectedPresetId : DEFAULT_POCKET_API_STATE.selectedPresetId;
  const recentQuestions = Array.isArray(value.recentQuestions) ? value.recentQuestions.map(sanitizeRecentQuestion).filter((item): item is PocketApiQuestionHistoryItem => Boolean(item)).slice(0, 8) : [];
  const pinnedSnippets = Array.isArray(value.pinnedSnippets) ? value.pinnedSnippets.map(sanitizePinnedSnippet).filter((item): item is PocketApiPinnedSnippet => Boolean(item)).slice(0, 12) : [];
  return { schemaVersion: 1, selectedPresetId, quickCallMode: value.quickCallMode !== false, recentQuestions: dedupeQuestions(recentQuestions), pinnedSnippets: dedupePins(pinnedSnippets) };
}

export function readPocketApiStoredState(storage: Pick<Storage, "getItem">) {
  try { return sanitizePocketApiStoredState(JSON.parse(storage.getItem(POCKET_API_STORAGE_KEY) ?? "null") as unknown); }
  catch { return cloneDefaultState(); }
}

export function writePocketApiStoredState(storage: Pick<Storage, "setItem">, state: PocketApiStoredState) {
  storage.setItem(POCKET_API_STORAGE_KEY, JSON.stringify(sanitizePocketApiStoredState(state)));
}

export function addPocketApiQuestion(items: PocketApiQuestionHistoryItem[], presetId: string, askedAt = new Date().toISOString()) {
  if (!POCKET_API_PRESET_IDS.has(presetId)) return dedupeQuestions(items).slice(0, 8);
  return dedupeQuestions([{ presetId, askedAt }, ...items]).slice(0, 8);
}

export function togglePocketApiPin(items: PocketApiPinnedSnippet[], endpointId: string, language: PocketApiSnippetLanguage, pinnedAt = new Date().toISOString()) {
  if (!getDeepgramEndpoint(endpointId) || !SNIPPET_LANGUAGES.has(language)) return dedupePins(items).slice(0, 12);
  const exists = items.some((item) => item.endpointId === endpointId && item.language === language);
  return exists ? items.filter((item) => !(item.endpointId === endpointId && item.language === language)) : dedupePins([{ endpointId, language, pinnedAt }, ...items]).slice(0, 12);
}

export function getSelectedPocketApiPreset(state: PocketApiStoredState) {
  return getPocketApiPreset(state.selectedPresetId);
}

function buildRequestBody(endpoint: DeepgramEndpointDefinition, supplied: unknown, unresolved: string[]) {
  if (supplied !== undefined) return supplied;
  const bodyParameters = endpoint.parameters.filter((parameter) => parameter.location === "body");
  if (!bodyParameters.length) return null;
  return Object.fromEntries(bodyParameters.flatMap((parameter) => {
    if (parameter.defaultValue !== undefined) return [[parameter.name, parameter.defaultValue]];
    if (!parameter.required) return [];
    unresolved.push(parameter.name);
    return [[parameter.name, placeholderFor(parameter)]];
  }));
}

function placeholderFor(parameter: DeepgramParameterDefinition) {
  if (parameter.valueType === "number") return 0;
  if (parameter.valueType === "boolean") return false;
  if (parameter.valueType === "string-array") return [`YOUR_${parameter.name.toUpperCase()}`];
  if (parameter.valueType === "json") return { placeholder: `YOUR_${parameter.name.toUpperCase()}` };
  return `YOUR_${parameter.name.toUpperCase()}`;
}

function streamJson(endpoint: DeepgramEndpointDefinition) {
  const messages = endpoint.parameters.filter((parameter) => parameter.location === "stream").map((parameter) => {
    if (typeof parameter.defaultValue !== "string") return { [parameter.name]: `YOUR_${parameter.name.toUpperCase()}` };
    try { return JSON.parse(parameter.defaultValue) as unknown; } catch { return { [parameter.name]: parameter.defaultValue }; }
  });
  return JSON.stringify(messages.length === 1 ? messages[0] : messages, null, 2);
}

function codeLabWorkflow(endpoint: DeepgramEndpointDefinition): CodeLabWorkflowId {
  if (endpoint.id === "stt-prerecorded") return "transcribe-url";
  if (endpoint.id === "stt-live" || endpoint.id === "stt-flux") return "live-mic";
  if (endpoint.id.startsWith("tts")) return "tts";
  if (endpoint.id === "text-intelligence") return "text-intelligence";
  if (endpoint.id === "auth-token-grant") return "temporary-token";
  if (endpoint.family === "Voice Agent") return "voice-agent";
  return "trusted-voice";
}

function sanitizeRecentQuestion(value: unknown): PocketApiQuestionHistoryItem | null {
  if (!isRecord(value) || typeof value.presetId !== "string" || !POCKET_API_PRESET_IDS.has(value.presetId) || typeof value.askedAt !== "string") return null;
  const time = Date.parse(value.askedAt);
  return Number.isFinite(time) ? { presetId: value.presetId, askedAt: new Date(time).toISOString() } : null;
}

function sanitizePinnedSnippet(value: unknown): PocketApiPinnedSnippet | null {
  if (!isRecord(value) || typeof value.endpointId !== "string" || !getDeepgramEndpoint(value.endpointId) || typeof value.language !== "string" || !SNIPPET_LANGUAGES.has(value.language as PocketApiSnippetLanguage) || typeof value.pinnedAt !== "string") return null;
  const time = Date.parse(value.pinnedAt);
  return Number.isFinite(time) ? { endpointId: value.endpointId, language: value.language as PocketApiSnippetLanguage, pinnedAt: new Date(time).toISOString() } : null;
}

function dedupeQuestions(items: PocketApiQuestionHistoryItem[]) { const seen = new Set<string>(); return items.filter((item) => { if (seen.has(item.presetId)) return false; seen.add(item.presetId); return true; }); }
function dedupePins(items: PocketApiPinnedSnippet[]) { const seen = new Set<string>(); return items.filter((item) => { const key = `${item.endpointId}:${item.language}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function cloneDefaultState(): PocketApiStoredState { return { ...DEFAULT_POCKET_API_STATE, recentQuestions: [], pinnedSnippets: [] }; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
