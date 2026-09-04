import type {
  DeepgramEndpointDefinition,
  DeepgramParameterDefinition,
  DeepgramRegion,
  DeepgramValidationIssue,
} from "@/types/deepgram-endpoint-registry";
import {
  AURA_TTS_CONTAINERS,
  AURA_TTS_ENCODINGS,
  AURA_TTS_MODEL_IDS,
  AURA_TTS_SAMPLE_RATES,
  DEEPGRAM_STT_MODEL_IDS,
} from "@/lib/deepgram-model-policy";

const DOCS = "https://developers.deepgram.com/reference" as const;
const GLOBAL_ONLY = ["global"] as const;
const INFERENCE_REGIONS = ["global", "eu", "au"] as const;
const CORE_HANDOFFS = ["Code Lab", "Live Observatory"] as const;

const projectId = pathParameter("project_id", "Project ID", "Deepgram project UUID.");
const requestId = pathParameter("request_id", "Request ID", "Deepgram request UUID.");
const modelId = pathParameter("model_id", "Model ID", "Deepgram model UUID.");
const keyId = pathParameter("key_id", "Key ID", "Deepgram API key UUID. This is an identifier, never the key secret.");
const memberId = pathParameter("member_id", "Member ID", "Deepgram project member UUID.");
const inviteEmail = pathParameter("email", "Invitee email", "Email address associated with the pending invitation.");
const agentId = pathParameter("agent_id", "Agent ID", "Reusable Voice Agent configuration UUID.");
const variableId = pathParameter("variable_id", "Variable ID", "Voice Agent variable UUID.");
const credentialId = pathParameter("distribution_credentials_id", "Credential ID", "Self-hosted distribution credential UUID.");
const balanceId = pathParameter("balance_id", "Balance ID", "Deepgram balance UUID.");

const pagination: DeepgramParameterDefinition[] = [
  queryParameter("limit", "Limit", "Maximum records to return.", "number", false, 10),
  queryParameter("page", "Page", "Page of records to return.", "number", false),
];

const dateRange: DeepgramParameterDefinition[] = [
  queryParameter("start", "Start", "Inclusive ISO-8601 date or timestamp.", "string", false),
  queryParameter("end", "End", "Inclusive ISO-8601 date or timestamp.", "string", false),
];

const sttOptions: DeepgramParameterDefinition[] = [
  queryParameter("model", "Model", "Speech recognition model.", "enum", false, "nova-3", DEEPGRAM_STT_MODEL_IDS),
  queryParameter("language", "Language", "BCP-47 language code or multi where supported.", "string", false, "en"),
  queryParameter("smart_format", "Smart format", "Apply readable formatting.", "boolean", false, true),
  queryParameter("punctuate", "Punctuation", "Add punctuation and casing.", "boolean", false, true),
  queryParameter("diarize", "Diarization", "Identify speakers.", "boolean", false, false),
  queryParameter("utterances", "Utterances", "Return utterance segmentation.", "boolean", false, false),
  queryParameter("paragraphs", "Paragraphs", "Return paragraph formatting.", "boolean", false, false),
  queryParameter("multichannel", "Multichannel", "Transcribe channels independently.", "boolean", false, false),
  queryParameter("keyterm", "Keyterms", "Repeatable Nova-3 keyterm hints.", "string-array", false),
  queryParameter("redact", "Transcript redaction", "Repeatable profile or individual entity values. Values serialize as repeated redact query parameters; source audio is unchanged.", "string-array", false),
  queryParameter("tag", "Tag", "Request tag for usage analysis.", "string-array", false),
];

const endpoints: DeepgramEndpointDefinition[] = [
  endpoint({
    id: "stt-prerecorded", officialName: "Transcribe Prerecorded Audio", family: "Speech to Text",
    description: "Transcribe a reachable media URL or uploaded audio bytes.", method: "POST", protocol: "https", pathTemplate: "/v1/listen",
    documentationUrl: `${DOCS}/speech-to-text/listen-pre-recorded`, parameters: [
      ...sttOptions,
      bodyParameter("url", "Remote audio URL", "HTTP(S) media URL used in JSON input.", "string", false),
      bodyParameter("audio", "Local audio", "Binary audio upload used instead of url.", "binary", false),
    ], requestBodySchema: { oneOf: [{ type: "object", required: ["url"] }, { type: "binary" }] }, responseType: "json",
    billable: true, riskTier: 1, regionalSupport: INFERENCE_REGIONS, implementationStatus: "runnable", executionMode: "server-rest",
    handoffTargets: ["Code Lab", "Audio Signal Lab", "Live Observatory"], testedStatus: "fixture-verified", contentTypes: ["application/json", "audio/*"],
  }),
  endpoint({
    id: "stt-live", officialName: "Streaming Speech to Text", family: "Speech to Text",
    description: "Stream microphone or application audio and receive interim and final transcripts.", method: "GET", protocol: "wss", pathTemplate: "/v1/listen",
    documentationUrl: `${DOCS}/speech-to-text/listen-streaming`, parameters: [...sttOptions,
      queryParameter("interim_results", "Interim results", "Receive interim transcript events.", "boolean", false, true),
      queryParameter("endpointing", "Endpointing", "Silence duration in milliseconds or false.", "string", false, "300"),
      queryParameter("vad_events", "VAD events", "Receive speech-start events.", "boolean", false, true),
      queryParameter("no_delay", "No delay", "Prioritize low-latency interim delivery. true may reduce redaction performance.", "boolean", false, false),
    ], requestBodySchema: null, responseType: "websocket-events", authenticationMode: "temporary-token", temporaryTokenCompatibility: true,
    billable: true, riskTier: 1, regionalSupport: INFERENCE_REGIONS, implementationStatus: "guided-handoff", executionMode: "handoff",
    handoffTargets: ["Live Mic", "Live Observatory", "Code Lab"], testedStatus: "fixture-verified", contentTypes: ["audio/*"],
  }),
  endpoint({
    id: "stt-flux", officialName: "Flux Turn-Based Transcription", family: "Speech to Text",
    description: "Stream conversational audio to Flux and receive turn-aware transcript events.", method: "GET", protocol: "wss", pathTemplate: "/v2/listen",
    documentationUrl: `${DOCS}/speech-to-text/listen-flux`, parameters: [
      queryParameter("model", "Model", "Required Flux model.", "enum", true, "flux-general-en", ["flux-general-en", "flux-general-multi"]),
      queryParameter("encoding", "Encoding", "Raw input audio encoding.", "string", false, "linear16"),
      queryParameter("sample_rate", "Sample rate", "Input sample rate in Hz.", "number", false, 16000),
      { ...queryParameter("eager_eot_threshold", "Eager EOT threshold", "Early end-of-turn confidence threshold.", "number", false), minimum: 0.3, maximum: 0.9 },
      { ...queryParameter("eot_threshold", "EOT threshold", "End-of-turn confidence threshold.", "number", false, 0.7), minimum: 0.5, maximum: 0.9 },
      { ...queryParameter("eot_timeout_ms", "EOT timeout", "Maximum end-of-turn wait in milliseconds.", "number", false, 5000), minimum: 500, maximum: 60000 },
      queryParameter("keyterm", "Keyterms", "Repeatable Flux-supported keyterms.", "string-array", false),
      queryParameter("language_hint", "Language hints", "Repeatable language hints; valid only with flux-general-multi.", "string-array", false),
      queryParameter("profanity_filter", "Profanity filter", "Replace or remove recognized profanity.", "boolean", false, false),
      queryParameter("mip_opt_out", "MIP opt out", "Opt out of the Model Improvement Program; pricing impact may apply.", "boolean", false, false),
      queryParameter("tag", "Tags", "Repeatable usage tags.", "string-array", false),
      streamParameter("Configure", "Configure message", "Optional mid-session thresholds, keyterms, and language_hints update.", false, JSON.stringify({ type: "Configure", thresholds: { eager_eot_threshold: 0.5, eot_threshold: 0.7, eot_timeout_ms: 5000 }, keyterms: [] }, null, 2)),
    ], requestBodySchema: null, responseType: "websocket-events", authenticationMode: "temporary-token", temporaryTokenCompatibility: true,
    billable: true, riskTier: 1, regionalSupport: INFERENCE_REGIONS, implementationStatus: "runnable", executionMode: "browser-websocket",
    handoffTargets: ["Live Mic", "Live Observatory", "Code Lab"], testedStatus: "manual-verification-required", contentTypes: ["audio/linear16"],
  }),
  endpoint({
    id: "tts-rest", officialName: "Speak: Single Text Request", family: "Text to Speech",
    description: "Synthesize one text payload and return audio bytes.", method: "POST", protocol: "https", pathTemplate: "/v1/speak",
    documentationUrl: `${DOCS}/text-to-speech/speak-request`, parameters: [
      bodyParameter("text", "Text", "Text to synthesize.", "string", true),
      queryParameter("model", "Model", "Aura voice model.", "enum", false, "aura-2-thalia-en", AURA_TTS_MODEL_IDS),
      queryParameter("encoding", "Encoding", "Output audio encoding.", "enum", false, "mp3", AURA_TTS_ENCODINGS),
      queryParameter("container", "Container", "Output container where supported.", "enum", false, undefined, AURA_TTS_CONTAINERS),
      queryParameter("sample_rate", "Sample rate", "Output sample rate where supported.", "number", false, undefined, AURA_TTS_SAMPLE_RATES.map(String)),
      queryParameter("bit_rate", "Bit rate", "Output bitrate where supported.", "number", false),
      { ...queryParameter("speed", "Speed", "Speaking-rate multiplier.", "number", false, 1), minimum: 0.7, maximum: 1.5 },
      queryParameter("callback", "Callback", "Async callback URL when supported.", "string", false),
      queryParameter("callback_method", "Callback method", "Callback HTTP method.", "enum", false, undefined, ["POST", "PUT"]),
      queryParameter("mip_opt_out", "MIP opt out", "Opt out of the Model Improvement Program; pricing impact may apply.", "boolean", false, false),
      queryParameter("tag", "Tag", "Repeatable usage tag.", "string-array", false),
    ], requestBodySchema: { type: "object", required: ["text"], properties: { text: { type: "string" } } }, responseType: "audio",
    billable: true, riskTier: 1, regionalSupport: INFERENCE_REGIONS, implementationStatus: "runnable", executionMode: "server-rest",
    handoffTargets: ["Code Lab", "Audio Signal Lab", "Live Observatory"], testedStatus: "fixture-verified", contentTypes: ["application/json"],
  }),
  endpoint({
    id: "tts-streaming", officialName: "Speak: Continuous Text Stream", family: "Text to Speech",
    description: "Stream text messages over WebSocket and receive audio incrementally.", method: "GET", protocol: "wss", pathTemplate: "/v1/speak",
    documentationUrl: `${DOCS}/text-to-speech/speak-streaming`, parameters: [
      queryParameter("model", "Model", "Aura voice model.", "enum", false, "aura-2-thalia-en", AURA_TTS_MODEL_IDS),
      queryParameter("encoding", "Encoding", "Streaming output encoding.", "enum", false, "linear16", ["linear16", "mulaw", "alaw"]),
      queryParameter("sample_rate", "Sample rate", "Output sample rate.", "number", false, 24000),
      queryParameter("speed", "Speed", "Speaking-rate multiplier from 0.7 to 1.5.", "number", false, 1),
      queryParameter("mip_opt_out", "MIP opt out", "Opt out of the Model Improvement Program.", "boolean", false, false),
      { name: "text", label: "Streaming text", location: "stream", valueType: "string", required: true, description: "Text sent in a Speak message.", defaultValue: "Hello from the Deepgram API Studio." },
    ], requestBodySchema: null, responseType: "websocket-events", authenticationMode: "temporary-token", temporaryTokenCompatibility: true,
    billable: true, riskTier: 1, regionalSupport: INFERENCE_REGIONS, implementationStatus: "runnable", executionMode: "browser-websocket",
    handoffTargets: ["Code Lab", "Audio Signal Lab", "Live Observatory"], testedStatus: "manual-verification-required", contentTypes: ["application/json"],
  }),
  endpoint({
    id: "text-intelligence", officialName: "Analyze Text", family: "Intelligence",
    description: "Analyze supplied text and return only requested, available intelligence results.", method: "POST", protocol: "https", pathTemplate: "/v1/read",
    documentationUrl: `${DOCS}/text-intelligence/analyze-text`, parameters: [
      bodyParameter("text", "Text", "Text to analyze; use instead of url.", "string", false),
      bodyParameter("url", "Text URL", "Reachable URL pointing to text; use instead of text.", "string", false),
      queryParameter("language", "Language", "Input language.", "string", false, "en"),
      queryParameter("summarize", "Summarize", "Return summarization when supported.", "boolean", false, true),
      queryParameter("topics", "Topics", "Return topic analysis.", "boolean", false, false),
      queryParameter("intents", "Intents", "Return intent analysis.", "boolean", false, false),
      queryParameter("sentiment", "Sentiment", "Return sentiment analysis.", "boolean", false, false),
      queryParameter("custom_topic", "Custom topics", "Repeatable custom topics, up to the current documented limit.", "string-array", false),
      queryParameter("custom_topic_mode", "Custom topic mode", "Strict returns submitted topics only; extended may add detected topics.", "enum", false, "extended", ["extended", "strict"]),
      queryParameter("custom_intent", "Custom intents", "Repeatable custom intents.", "string-array", false),
      queryParameter("custom_intent_mode", "Custom intent mode", "Strict returns submitted intents only; extended may add detected intents.", "enum", false, "extended", ["extended", "strict"]),
      queryParameter("callback", "Callback", "HTTPS callback URL for asynchronous delivery.", "string", false),
      queryParameter("callback_method", "Callback method", "Callback HTTP method.", "enum", false, "POST", ["POST", "PUT"]),
      queryParameter("tag", "Tags", "Repeatable usage tags.", "string-array", false),
    ], requestBodySchema: { oneOf: [{ type: "object", required: ["text"] }, { type: "object", required: ["url"] }] }, responseType: "json",
    billable: true, riskTier: 1, regionalSupport: INFERENCE_REGIONS, implementationStatus: "runnable", executionMode: "server-rest",
    handoffTargets: CORE_HANDOFFS, testedStatus: "fixture-verified", contentTypes: ["application/json"],
  }),
  endpoint({
    id: "voice-agent-converse", officialName: "Voice Agent Converse", family: "Voice Agent",
    description: "Inspect the configuration and event contract for a stateful listen-think-speak Voice Agent conversation.", method: "GET", protocol: "wss", pathTemplate: "/v1/agent/converse",
    documentationUrl: `${DOCS}/voice-agent/voice-agent`, parameters: [
      streamParameter("Settings", "Settings", "Initial audio and agent configuration message.", true, JSON.stringify({ type: "Settings", audio: { input: { encoding: "linear16", sample_rate: 16000 }, output: { encoding: "linear16", sample_rate: 24000, container: "none" } }, agent: { language: "en", listen: { provider: { type: "deepgram", model: "nova-3" } }, think: { provider: { type: "nvidia", model: "nvidia/nemotron-3-nano-30b-a3b" } }, speak: { provider: { type: "deepgram", model: "aura-2-asteria-en" } } } }, null, 2)),
      streamParameter("audio", "Audio", "Binary microphone audio frames.", true),
    ], requestBodySchema: null, responseType: "websocket-events", authenticationMode: "temporary-token", temporaryTokenCompatibility: true,
    billable: true, riskTier: 1, regionalSupport: INFERENCE_REGIONS, implementationStatus: "runnable", executionMode: "browser-websocket",
    handoffTargets: ["Code Lab", "Live Observatory"], testedStatus: "manual-verification-required", contentTypes: ["application/json", "audio/*"],
    hostedExecution: {
      state: "unavailable",
      label: "Hosted execution unavailable",
      reason: "Hosted temporary-token issuance is disabled. This flow is available for documentation or local/manual inspection only; no live session can be started here.",
    },
  }),
  endpoint({
    id: "auth-token-grant", officialName: "Grant Temporary Token", family: "Authentication",
    description: "Exchange the server API key for a short-lived JWT usable by core voice APIs, not management APIs.", method: "POST", protocol: "https", pathTemplate: "/v1/auth/grant",
    documentationUrl: `${DOCS}/auth/tokens/grant`, parameters: [bodyParameter("ttl_seconds", "TTL seconds", "Token lifetime; the official default is 30 seconds.", "number", false, 30)],
    requestBodySchema: { type: "object", properties: { ttl_seconds: { type: "number" } } }, responseType: "json", temporaryTokenCompatibility: false,
    projectRoleRequirement: "member", billable: false, riskTier: 1, regionalSupport: GLOBAL_ONLY, implementationStatus: "runnable", executionMode: "server-rest",
    handoffTargets: ["Live Mic", "Live Observatory", "Code Lab"], testedStatus: "fixture-verified", contentTypes: ["application/json"],
  }),

  ...modelEndpoints(),
  ...projectEndpoints(),
  ...requestEndpoints(),
  ...usageEndpoints(),
  ...billingEndpoints(),
  ...administrationEndpoints(),
];

export const DEEPGRAM_ENDPOINT_REGISTRY = Object.freeze(endpoints);
export const DEEPGRAM_ENDPOINT_IDS = Object.freeze(endpoints.map((item) => item.id));

const endpointById = new Map(endpoints.map((item) => [item.id, item]));

if (endpointById.size !== endpoints.length) {
  throw new Error("Deepgram endpoint registry IDs must be unique.");
}

export function getDeepgramEndpoint(id: string) {
  return endpointById.get(id) ?? null;
}

export function resolveDeepgramPath(endpoint: DeepgramEndpointDefinition, values: Record<string, unknown>) {
  const issues: DeepgramValidationIssue[] = [];
  const resolved = endpoint.pathTemplate.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name: string) => {
    const raw = values[name];
    const value = typeof raw === "string" ? raw.trim() : "";
    const valid = name === "email"
      ? /^[^@\s]{1,80}@[^@\s]{1,80}\.[^@\s]{1,40}$/.test(value)
      : /^[A-Za-z0-9._-]{1,160}$/.test(value);
    if (!value || !valid) {
      issues.push({ field: name, message: `${name} is required and must be a safe Deepgram identifier.`, severity: "error" });
      return `{${name}}`;
    }
    return encodeURIComponent(value);
  });
  return { path: resolved, issues };
}

export function regionHost(region: DeepgramRegion) {
  if (region === "eu") return "api.eu.deepgram.com";
  if (region === "au") return "api.au.deepgram.com";
  return "api.deepgram.com";
}

export function validateRegistry() {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const item of endpoints) {
    if (ids.has(item.id)) issues.push(`Duplicate endpoint ID: ${item.id}`);
    ids.add(item.id);
    if (!item.documentationUrl.startsWith("https://developers.deepgram.com/")) issues.push(`Non-official docs URL: ${item.id}`);
    if (item.riskTier === 3 && (!item.confirmationPhrase || item.executionMode !== "locked")) issues.push(`Tier 3 endpoint is not locked: ${item.id}`);
    if (item.protocol === "wss" && item.authenticationMode !== "temporary-token") issues.push(`Browser WebSocket must use a temporary token: ${item.id}`);
  }
  return issues;
}

function endpoint(input: Partial<DeepgramEndpointDefinition> & Pick<DeepgramEndpointDefinition,
  "id" | "officialName" | "family" | "description" | "method" | "protocol" | "pathTemplate" | "documentationUrl" | "parameters" |
  "requestBodySchema" | "responseType" | "billable" | "riskTier" | "regionalSupport" | "implementationStatus" | "executionMode" |
  "handoffTargets" | "testedStatus" | "contentTypes">): DeepgramEndpointDefinition {
  return {
    authenticationMode: "server-api-key",
    temporaryTokenCompatibility: input.protocol === "wss",
    projectRoleRequirement: "none",
    ...input,
  };
}

function readEndpoint(input: Omit<Parameters<typeof endpoint>[0], "billable" | "riskTier" | "regionalSupport" | "implementationStatus" | "executionMode" | "testedStatus" | "contentTypes"> & Partial<Pick<DeepgramEndpointDefinition, "projectRoleRequirement" | "responseType">>) {
  return endpoint({ ...input, billable: false, riskTier: 2, regionalSupport: GLOBAL_ONLY, implementationStatus: "read-only", executionMode: "server-rest", testedStatus: "fixture-verified", contentTypes: ["application/json"] });
}

function mutationEndpoint(input: Omit<Parameters<typeof endpoint>[0], "billable" | "riskTier" | "regionalSupport" | "implementationStatus" | "executionMode" | "testedStatus" | "contentTypes" | "confirmationPhrase"> & { impact: string }) {
  return endpoint({ ...input, billable: false, riskTier: 3, regionalSupport: GLOBAL_ONLY, implementationStatus: "advanced-mutation", executionMode: "locked", testedStatus: "locked-by-design", contentTypes: ["application/json"], confirmationPhrase: `CONFIRM ${input.id.toUpperCase().replaceAll("-", " ")}` });
}

function modelEndpoints(): DeepgramEndpointDefinition[] {
  return [
    readEndpoint({ id: "models-public-list", officialName: "List Public Models", family: "Models", description: "List Deepgram models available publicly.", method: "GET", protocol: "https", pathTemplate: "/v1/models", documentationUrl: `${DOCS}/manage/models/list`, parameters: [queryParameter("include_outdated", "Include outdated", "Include outdated models.", "boolean", false, false)], requestBodySchema: null, responseType: "json", handoffTargets: ["Code Lab"] }),
    readEndpoint({ id: "models-public-get", officialName: "Get Public Model", family: "Models", description: "Get metadata for one public model.", method: "GET", protocol: "https", pathTemplate: "/v1/models/{model_id}", documentationUrl: `${DOCS}/manage/models/get`, parameters: [modelId], requestBodySchema: null, responseType: "json", handoffTargets: ["Code Lab"] }),
    readEndpoint({ id: "models-project-list", officialName: "List Project Models", family: "Models", description: "List models available to a project.", method: "GET", protocol: "https", pathTemplate: "/v1/projects/{project_id}/models", documentationUrl: `${DOCS}/manage/projects/models/list`, parameters: [projectId, ...pagination], requestBodySchema: null, responseType: "json", projectRoleRequirement: "member", handoffTargets: ["Code Lab"] }),
    readEndpoint({ id: "models-project-get", officialName: "Get Project Model", family: "Models", description: "Get metadata for a project model.", method: "GET", protocol: "https", pathTemplate: "/v1/projects/{project_id}/models/{model_id}", documentationUrl: `${DOCS}/manage/projects/models/get`, parameters: [projectId, modelId], requestBodySchema: null, responseType: "json", projectRoleRequirement: "member", handoffTargets: ["Code Lab"] }),
  ];
}

function projectEndpoints(): DeepgramEndpointDefinition[] {
  return [
    readEndpoint({ id: "projects-list", officialName: "List Projects", family: "Projects", description: "List projects accessible to the configured key.", method: "GET", protocol: "https", pathTemplate: "/v1/projects", documentationUrl: `${DOCS}/manage/projects/list`, parameters: [], requestBodySchema: null, responseType: "json", handoffTargets: ["Code Lab"] }),
    readEndpoint({ id: "projects-get", officialName: "Get Project", family: "Projects", description: "Get one project's metadata.", method: "GET", protocol: "https", pathTemplate: "/v1/projects/{project_id}", documentationUrl: `${DOCS}/manage/projects/get`, parameters: [projectId, ...pagination], requestBodySchema: null, responseType: "json", projectRoleRequirement: "member", handoffTargets: ["Code Lab"] }),
    mutationEndpoint({ id: "projects-update", officialName: "Update Project", family: "Projects", description: "Update project metadata.", method: "PATCH", protocol: "https", pathTemplate: "/v1/projects/{project_id}", documentationUrl: `${DOCS}/manage/projects/update`, parameters: [projectId, bodyParameter("name", "Name", "New project name.", "string", false)], requestBodySchema: { type: "object", properties: { name: { type: "string" } } }, responseType: "json", projectRoleRequirement: "admin", handoffTargets: ["Code Lab"], impact: "Changes shared project metadata for every member." }),
    mutationEndpoint({ id: "projects-delete", officialName: "Delete Project", family: "Projects", description: "Permanently delete a project.", method: "DELETE", protocol: "https", pathTemplate: "/v1/projects/{project_id}", documentationUrl: `${DOCS}/manage/projects/delete`, parameters: [projectId], requestBodySchema: null, responseType: "json", projectRoleRequirement: "owner", handoffTargets: ["Code Lab"], impact: "Permanently deletes the project and its managed resources." }),
    mutationEndpoint({ id: "projects-leave", officialName: "Leave Project", family: "Projects", description: "Remove the authenticated account from a project.", method: "DELETE", protocol: "https", pathTemplate: "/v1/projects/{project_id}/leave", documentationUrl: `${DOCS}/manage/projects/leave`, parameters: [projectId], requestBodySchema: null, responseType: "json", projectRoleRequirement: "member", handoffTargets: ["Code Lab"], impact: "Removes your access to the project." }),
  ];
}

function requestEndpoints(): DeepgramEndpointDefinition[] {
  return [
    readEndpoint({ id: "requests-list", officialName: "List Project Requests", family: "Requests", description: "List request history for a project.", method: "GET", protocol: "https", pathTemplate: "/v1/projects/{project_id}/requests", documentationUrl: `${DOCS}/manage/requests/list`, parameters: [projectId, ...dateRange, ...pagination], requestBodySchema: null, responseType: "json", projectRoleRequirement: "member", handoffTargets: ["Live Observatory", "Code Lab"] }),
    readEndpoint({ id: "requests-get", officialName: "Get Project Request", family: "Requests", description: "Get details and available cost metadata for a request.", method: "GET", protocol: "https", pathTemplate: "/v1/projects/{project_id}/requests/{request_id}", documentationUrl: `${DOCS}/manage/requests/get`, parameters: [projectId, requestId], requestBodySchema: null, responseType: "json", projectRoleRequirement: "member", handoffTargets: ["Live Observatory", "Code Lab"] }),
  ];
}

function usageEndpoints(): DeepgramEndpointDefinition[] {
  return [
    readEndpoint({ id: "usage-summary", officialName: "Summarize Usage", family: "Usage", description: "Return project usage totals for a date range.", method: "GET", protocol: "https", pathTemplate: "/v1/projects/{project_id}/usage", documentationUrl: `${DOCS}/manage/usage/summary/get`, parameters: [projectId, ...dateRange], requestBodySchema: null, responseType: "json", projectRoleRequirement: "member", handoffTargets: ["Live Observatory", "Code Lab"] }),
    readEndpoint({ id: "usage-fields", officialName: "Get Usage Fields", family: "Usage", description: "List dimensions available for usage queries.", method: "GET", protocol: "https", pathTemplate: "/v1/projects/{project_id}/usage/fields", documentationUrl: `${DOCS}/manage/usage/fields/list`, parameters: [projectId, ...dateRange], requestBodySchema: null, responseType: "json", projectRoleRequirement: "member", handoffTargets: ["Live Observatory", "Code Lab"] }),
    readEndpoint({ id: "usage-breakdown", officialName: "Get Usage Breakdown", family: "Usage", description: "Break project usage down by supported dimensions.", method: "GET", protocol: "https", pathTemplate: "/v1/projects/{project_id}/usage/breakdown", documentationUrl: `${DOCS}/manage/usage/breakdown/get`, parameters: [projectId, ...dateRange, queryParameter("group_by", "Group by", "Repeatable breakdown dimensions.", "string-array", false)], requestBodySchema: null, responseType: "json", projectRoleRequirement: "member", handoffTargets: ["Live Observatory", "Code Lab"] }),
  ];
}

function billingEndpoints(): DeepgramEndpointDefinition[] {
  return [
    readEndpoint({ id: "billing-balances", officialName: "List Balances", family: "Billing", description: "List project billing balances.", method: "GET", protocol: "https", pathTemplate: "/v1/projects/{project_id}/balances", documentationUrl: `${DOCS}/manage/billing/list`, parameters: [projectId], requestBodySchema: null, responseType: "json", projectRoleRequirement: "admin", handoffTargets: ["Live Observatory", "Code Lab"] }),
    readEndpoint({ id: "billing-balance-get", officialName: "Get Balance", family: "Billing", description: "Get one project billing balance.", method: "GET", protocol: "https", pathTemplate: "/v1/projects/{project_id}/balances/{balance_id}", documentationUrl: `${DOCS}/manage/billing/get`, parameters: [projectId, balanceId], requestBodySchema: null, responseType: "json", projectRoleRequirement: "admin", handoffTargets: ["Live Observatory", "Code Lab"] }),
    readEndpoint({ id: "billing-breakdown", officialName: "Get Billing Breakdown", family: "Billing", description: "Return billing breakdown data.", method: "GET", protocol: "https", pathTemplate: "/v1/projects/{project_id}/billing/breakdown", documentationUrl: `${DOCS}/manage/billing/breakdown/get`, parameters: [projectId, ...dateRange], requestBodySchema: null, responseType: "json", projectRoleRequirement: "admin", handoffTargets: ["Live Observatory", "Code Lab"] }),
    readEndpoint({ id: "billing-fields", officialName: "Get Billing Fields", family: "Billing", description: "List billing breakdown dimensions.", method: "GET", protocol: "https", pathTemplate: "/v1/projects/{project_id}/billing/fields", documentationUrl: `${DOCS}/manage/billing/fields/list`, parameters: [projectId, ...dateRange], requestBodySchema: null, responseType: "json", projectRoleRequirement: "admin", handoffTargets: ["Live Observatory", "Code Lab"] }),
  ];
}

function administrationEndpoints(): DeepgramEndpointDefinition[] {
  const read = (value: Parameters<typeof readEndpoint>[0]) => readEndpoint(value);
  const mutate = (value: Parameters<typeof mutationEndpoint>[0]) => mutationEndpoint(value);
  return [
    read({ id: "keys-list", officialName: "List Keys", family: "Administration", description: "List key metadata without returning secret key values.", method: "GET", protocol: "https", pathTemplate: "/v1/projects/{project_id}/keys", documentationUrl: `${DOCS}/manage/keys/list`, parameters: [projectId], requestBodySchema: null, responseType: "json", projectRoleRequirement: "admin", handoffTargets: ["Code Lab"] }),
    read({ id: "keys-get", officialName: "Get Key", family: "Administration", description: "Get metadata for one key; secret material is never returned by the studio.", method: "GET", protocol: "https", pathTemplate: "/v1/projects/{project_id}/keys/{key_id}", documentationUrl: `${DOCS}/manage/keys/get`, parameters: [projectId, keyId], requestBodySchema: null, responseType: "json", projectRoleRequirement: "admin", handoffTargets: ["Code Lab"] }),
    mutate({ id: "keys-create", officialName: "Create Key", family: "Administration", description: "Create a project API key.", method: "POST", protocol: "https", pathTemplate: "/v1/projects/{project_id}/keys", documentationUrl: `${DOCS}/manage/keys/create`, parameters: [projectId, bodyParameter("comment", "Comment", "Key label.", "string", true), bodyParameter("scopes", "Scopes", "Least-privilege scopes.", "string-array", true), bodyParameter("time_to_live_in_seconds", "TTL", "Optional key lifetime.", "number", false)], requestBodySchema: { type: "object", required: ["comment", "scopes"] }, responseType: "json", projectRoleRequirement: "admin", handoffTargets: ["Code Lab"], impact: "Creates a long-lived credential. Its plaintext value must be handled once and stored securely." }),
    mutate({ id: "keys-delete", officialName: "Delete Key", family: "Administration", description: "Revoke a project API key.", method: "DELETE", protocol: "https", pathTemplate: "/v1/projects/{project_id}/keys/{key_id}", documentationUrl: `${DOCS}/manage/keys/delete`, parameters: [projectId, keyId], requestBodySchema: null, responseType: "json", projectRoleRequirement: "admin", handoffTargets: ["Code Lab"], impact: "Immediately revokes the key and can interrupt dependent systems." }),
    read({ id: "members-list", officialName: "List Members", family: "Administration", description: "List project members.", method: "GET", protocol: "https", pathTemplate: "/v1/projects/{project_id}/members", documentationUrl: `${DOCS}/manage/members/list`, parameters: [projectId], requestBodySchema: null, responseType: "json", projectRoleRequirement: "member", handoffTargets: ["Code Lab"] }),
    read({ id: "member-scopes-list", officialName: "List Member Scopes", family: "Administration", description: "List a member's project scopes.", method: "GET", protocol: "https", pathTemplate: "/v1/projects/{project_id}/members/{member_id}/scopes", documentationUrl: `${DOCS}/manage/members/scopes/list`, parameters: [projectId, memberId], requestBodySchema: null, responseType: "json", projectRoleRequirement: "member", handoffTargets: ["Code Lab"] }),
    mutate({ id: "member-scopes-update", officialName: "Update Member Scope", family: "Administration", description: "Replace a project member's scope.", method: "PUT", protocol: "https", pathTemplate: "/v1/projects/{project_id}/members/{member_id}/scopes", documentationUrl: `${DOCS}/manage/members/scopes/update`, parameters: [projectId, memberId, bodyParameter("scope", "Scope", "New project scope.", "string", true)], requestBodySchema: { type: "object", required: ["scope"] }, responseType: "json", projectRoleRequirement: "admin", handoffTargets: ["Code Lab"], impact: "Changes another person's project authorization." }),
    mutate({ id: "members-delete", officialName: "Remove Member", family: "Administration", description: "Remove a member from a project.", method: "DELETE", protocol: "https", pathTemplate: "/v1/projects/{project_id}/members/{member_id}", documentationUrl: `${DOCS}/manage/members/delete`, parameters: [projectId, memberId], requestBodySchema: null, responseType: "json", projectRoleRequirement: "admin", handoffTargets: ["Code Lab"], impact: "Immediately removes a person's project access." }),
    read({ id: "invitations-list", officialName: "List Invitations", family: "Administration", description: "List pending project invitations.", method: "GET", protocol: "https", pathTemplate: "/v1/projects/{project_id}/invites", documentationUrl: `${DOCS}/manage/invites/list`, parameters: [projectId], requestBodySchema: null, responseType: "json", projectRoleRequirement: "member", handoffTargets: ["Code Lab"] }),
    mutate({ id: "invitations-create", officialName: "Create Invitation", family: "Administration", description: "Invite a person to a project.", method: "POST", protocol: "https", pathTemplate: "/v1/projects/{project_id}/invites", documentationUrl: `${DOCS}/manage/invites/create`, parameters: [projectId, bodyParameter("email", "Email", "Invitee email.", "string", true), bodyParameter("scope", "Scope", "Initial project scope.", "string", true)], requestBodySchema: { type: "object", required: ["email", "scope"] }, responseType: "json", projectRoleRequirement: "admin", handoffTargets: ["Code Lab"], impact: "Grants a new person an invitation to access the project." }),
    mutate({ id: "invitations-delete", officialName: "Delete Invitation", family: "Administration", description: "Revoke a pending invitation by invitee email.", method: "DELETE", protocol: "https", pathTemplate: "/v1/projects/{project_id}/invites/{email}", documentationUrl: `${DOCS}/manage/invites/delete`, parameters: [projectId, inviteEmail], requestBodySchema: null, responseType: "json", projectRoleRequirement: "admin", handoffTargets: ["Code Lab"], impact: "Revokes a pending project invitation." }),
    read({ id: "agent-configurations-list", officialName: "List Agent Configurations", family: "Voice Agent", description: "List reusable Voice Agent configurations in uninterpolated form.", method: "GET", protocol: "https", pathTemplate: "/v1/projects/{project_id}/agents", documentationUrl: `${DOCS}/voice-agent/agent-configurations/list`, parameters: [projectId], requestBodySchema: null, responseType: "json", projectRoleRequirement: "member", handoffTargets: ["Code Lab"] }),
    read({ id: "agent-configurations-get", officialName: "Get Agent Configuration", family: "Voice Agent", description: "Get one reusable Voice Agent configuration.", method: "GET", protocol: "https", pathTemplate: "/v1/projects/{project_id}/agents/{agent_id}", documentationUrl: `${DOCS}/voice-agent/agent-configurations/get`, parameters: [projectId, agentId], requestBodySchema: null, responseType: "json", projectRoleRequirement: "member", handoffTargets: ["Code Lab"] }),
    mutate({ id: "agent-configurations-create", officialName: "Create Agent Configuration", family: "Voice Agent", description: "Create a reusable agent configuration.", method: "POST", protocol: "https", pathTemplate: "/v1/projects/{project_id}/agents", documentationUrl: `${DOCS}/voice-agent/agent-configurations/create`, parameters: [projectId, bodyParameter("config", "Config", "JSON string containing the Settings agent block.", "string", true), bodyParameter("metadata", "Metadata", "String-valued labels.", "json", false)], requestBodySchema: { type: "object", required: ["config"] }, responseType: "json", projectRoleRequirement: "admin", handoffTargets: ["Code Lab"], impact: "Creates a reusable configuration that can reference external providers and secrets." }),
    mutate({ id: "agent-configurations-update", officialName: "Update Agent Configuration Metadata", family: "Voice Agent", description: "Update configuration metadata; the config itself is immutable.", method: "PUT", protocol: "https", pathTemplate: "/v1/projects/{project_id}/agents/{agent_id}", documentationUrl: `${DOCS}/voice-agent/agent-configurations/update`, parameters: [projectId, agentId, bodyParameter("metadata", "Metadata", "Replacement metadata.", "json", true)], requestBodySchema: { type: "object", required: ["metadata"] }, responseType: "json", projectRoleRequirement: "admin", handoffTargets: ["Code Lab"], impact: "Changes labels associated with a reusable agent configuration." }),
    mutate({ id: "agent-configurations-delete", officialName: "Delete Agent Configuration", family: "Voice Agent", description: "Delete a reusable agent configuration.", method: "DELETE", protocol: "https", pathTemplate: "/v1/projects/{project_id}/agents/{agent_id}", documentationUrl: `${DOCS}/voice-agent/agent-configurations/delete`, parameters: [projectId, agentId], requestBodySchema: null, responseType: "json", projectRoleRequirement: "admin", handoffTargets: ["Code Lab"], impact: "Deletes a configuration that active clients may depend on." }),
    read({ id: "agent-variables-list", officialName: "List Agent Variables", family: "Voice Agent", description: "List Voice Agent template variables.", method: "GET", protocol: "https", pathTemplate: "/v1/projects/{project_id}/agent-variables", documentationUrl: `${DOCS}/voice-agent/agent-variables/list`, parameters: [projectId], requestBodySchema: null, responseType: "json", projectRoleRequirement: "member", handoffTargets: ["Code Lab"] }),
    read({ id: "agent-variables-get", officialName: "Get Agent Variable", family: "Voice Agent", description: "Get one Voice Agent template variable.", method: "GET", protocol: "https", pathTemplate: "/v1/projects/{project_id}/agent-variables/{variable_id}", documentationUrl: `${DOCS}/voice-agent/agent-variables/get`, parameters: [projectId, variableId], requestBodySchema: null, responseType: "json", projectRoleRequirement: "member", handoffTargets: ["Code Lab"] }),
    mutate({ id: "agent-variables-create", officialName: "Create Agent Variable", family: "Voice Agent", description: "Create a DG_* template variable.", method: "POST", protocol: "https", pathTemplate: "/v1/projects/{project_id}/agent-variables", documentationUrl: `${DOCS}/voice-agent/agent-variables/create`, parameters: [projectId, bodyParameter("key", "Key", "Variable name in DG_<NAME> format.", "string", true), bodyParameter("value", "Value", "Any JSON value.", "json", true)], requestBodySchema: { type: "object", required: ["key", "value"] }, responseType: "json", projectRoleRequirement: "admin", handoffTargets: ["Code Lab"], impact: "Creates a value that can be interpolated into reusable agent configurations; never place unapproved secrets here." }),
    mutate({ id: "agent-variables-update", officialName: "Update Agent Variable", family: "Voice Agent", description: "Update a Voice Agent template value.", method: "PATCH", protocol: "https", pathTemplate: "/v1/projects/{project_id}/agent-variables/{variable_id}", documentationUrl: `${DOCS}/voice-agent/agent-variables/update`, parameters: [projectId, variableId, bodyParameter("value", "Value", "Replacement JSON value.", "json", true)], requestBodySchema: { type: "object", required: ["value"] }, responseType: "json", projectRoleRequirement: "admin", handoffTargets: ["Code Lab"], impact: "Changes every agent configuration that references this variable." }),
    mutate({ id: "agent-variables-delete", officialName: "Delete Agent Variable", family: "Voice Agent", description: "Delete a Voice Agent template variable.", method: "DELETE", protocol: "https", pathTemplate: "/v1/projects/{project_id}/agent-variables/{variable_id}", documentationUrl: `${DOCS}/voice-agent/agent-variables/delete`, parameters: [projectId, variableId], requestBodySchema: null, responseType: "json", projectRoleRequirement: "admin", handoffTargets: ["Code Lab"], impact: "Can break agent configurations that still reference the variable." }),
    read({ id: "distribution-credentials-list", officialName: "List Distribution Credentials", family: "Administration", description: "List self-hosted distribution credential metadata.", method: "GET", protocol: "https", pathTemplate: "/v1/projects/{project_id}/self-hosted/distribution/credentials", documentationUrl: `${DOCS}/self-hosted/distribution-credentials/list`, parameters: [projectId], requestBodySchema: null, responseType: "json", projectRoleRequirement: "admin", handoffTargets: ["Code Lab"] }),
    read({ id: "distribution-credentials-get", officialName: "Get Distribution Credential", family: "Administration", description: "Get self-hosted distribution credential metadata.", method: "GET", protocol: "https", pathTemplate: "/v1/projects/{project_id}/self-hosted/distribution/credentials/{distribution_credentials_id}", documentationUrl: `${DOCS}/self-hosted/distribution-credentials/get`, parameters: [projectId, credentialId], requestBodySchema: null, responseType: "json", projectRoleRequirement: "admin", handoffTargets: ["Code Lab"] }),
    mutate({ id: "distribution-credentials-create", officialName: "Create Distribution Credential", family: "Administration", description: "Create self-hosted distribution credentials.", method: "POST", protocol: "https", pathTemplate: "/v1/projects/{project_id}/self-hosted/distribution/credentials", documentationUrl: `${DOCS}/self-hosted/distribution-credentials/create`, parameters: [projectId], requestBodySchema: { type: "object" }, responseType: "json", projectRoleRequirement: "admin", handoffTargets: ["Code Lab"], impact: "Creates credentials for pulling self-hosted Deepgram distributions." }),
    mutate({ id: "distribution-credentials-delete", officialName: "Delete Distribution Credential", family: "Administration", description: "Revoke self-hosted distribution credentials.", method: "DELETE", protocol: "https", pathTemplate: "/v1/projects/{project_id}/self-hosted/distribution/credentials/{distribution_credentials_id}", documentationUrl: `${DOCS}/self-hosted/distribution-credentials/delete`, parameters: [projectId, credentialId], requestBodySchema: null, responseType: "json", projectRoleRequirement: "admin", handoffTargets: ["Code Lab"], impact: "Revokes image/distribution access and may interrupt self-hosted deployments." }),
  ];
}

function pathParameter(name: string, label: string, description: string): DeepgramParameterDefinition {
  return { name, label, location: "path", valueType: "string", required: true, description };
}
function queryParameter(name: string, label: string, description: string, valueType: DeepgramParameterDefinition["valueType"], required: boolean, defaultValue?: string | number | boolean, allowedValues?: readonly string[]): DeepgramParameterDefinition {
  return { name, label, location: "query", valueType, required, description, defaultValue, allowedValues };
}
function bodyParameter(name: string, label: string, description: string, valueType: DeepgramParameterDefinition["valueType"], required: boolean, defaultValue?: string | number | boolean): DeepgramParameterDefinition {
  return { name, label, location: "body", valueType, required, description, defaultValue };
}
function streamParameter(name: string, label: string, description: string, required: boolean, defaultValue?: string): DeepgramParameterDefinition {
  return { name, label, location: "stream", valueType: "json", required, description, defaultValue };
}
