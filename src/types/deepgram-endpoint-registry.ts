export type DeepgramApiFamily =
  | "Speech to Text"
  | "Text to Speech"
  | "Intelligence"
  | "Voice Agent"
  | "Authentication"
  | "Models"
  | "Projects"
  | "Requests"
  | "Usage"
  | "Billing"
  | "Administration";

export type DeepgramHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type DeepgramProtocol = "https" | "wss";
export type DeepgramRiskTier = 1 | 2 | 3;
export type DeepgramImplementationStatus =
  | "runnable"
  | "read-only"
  | "guided-handoff"
  | "advanced-mutation"
  | "unavailable";
export type DeepgramExecutionMode = "server-rest" | "browser-websocket" | "handoff" | "locked";
export type DeepgramTestedStatus = "fixture-verified" | "manual-verification-required" | "locked-by-design";
export type DeepgramAuthMode = "server-api-key" | "temporary-token";
export type DeepgramRegion = "global" | "eu" | "au";

export type DeepgramHostedExecutionPolicy = {
  state: "unavailable";
  label: string;
  reason: string;
};

export type DeepgramParameterDefinition = {
  name: string;
  label: string;
  location: "path" | "query" | "header" | "body" | "stream";
  valueType: "string" | "number" | "boolean" | "enum" | "json" | "binary" | "string-array";
  required: boolean;
  description: string;
  defaultValue?: string | number | boolean;
  allowedValues?: readonly string[];
  minimum?: number;
  maximum?: number;
  sensitive?: boolean;
};

export type DeepgramEndpointDefinition = {
  id: string;
  officialName: string;
  family: DeepgramApiFamily;
  description: string;
  method: DeepgramHttpMethod;
  protocol: DeepgramProtocol;
  pathTemplate: `/v${number}/${string}`;
  documentationUrl: `https://developers.deepgram.com/${string}`;
  parameters: readonly DeepgramParameterDefinition[];
  requestBodySchema: Readonly<Record<string, unknown>> | null;
  responseType: "json" | "audio" | "websocket-events";
  authenticationMode: DeepgramAuthMode;
  temporaryTokenCompatibility: boolean;
  projectRoleRequirement: "none" | "member" | "admin" | "owner" | "unknown";
  billable: boolean;
  riskTier: DeepgramRiskTier;
  regionalSupport: readonly DeepgramRegion[];
  implementationStatus: DeepgramImplementationStatus;
  executionMode: DeepgramExecutionMode;
  handoffTargets: readonly ("Code Lab" | "Audio Signal Lab" | "Live Mic" | "Live Observatory")[];
  testedStatus: DeepgramTestedStatus;
  contentTypes: readonly string[];
  hostedExecution?: DeepgramHostedExecutionPolicy;
  impact?: string;
  confirmationPhrase?: string;
};

export type DeepgramExecuteInput = {
  endpointId: string;
  expectedMethod?: DeepgramHttpMethod;
  region?: DeepgramRegion;
  path?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: unknown;
  contentType?: string;
  host?: never;
  url?: never;
  confirmation?: string;
  advancedAdministrationMode?: boolean;
};

export type DeepgramValidationIssue = {
  field: string;
  message: string;
  severity: "error" | "warning";
};

export type DeepgramEffectiveRequest = {
  endpointId: string;
  method: DeepgramHttpMethod;
  protocol: DeepgramProtocol;
  sanitizedUrl: string;
  headers: Record<string, string>;
  body: unknown;
};
