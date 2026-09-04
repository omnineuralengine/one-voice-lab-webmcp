import type { ApiDebugEnvelope } from "@/lib/inspection";
import type { CodeLabWorkflowId } from "@/lib/code-lab-files";

export type ApiCategoryId =
  | "voice-agent"
  | "speech-to-text"
  | "text-to-speech"
  | "text-intelligence"
  | "manage"
  | "self-hosted"
  | "auth";

export type ApiOperationStatus = "available" | "manual-verification-required" | "locked-by-design";
export type ApiTransport = "REST JSON" | "REST file upload" | "WebSocket" | "Concept/docs-only";
export type ApiAuthPattern = "Server API key" | "Temporary browser token" | "Disabled/docs-only";
export type ApiParameterLocation = "query" | "body" | "stream";
export type ApiParameterControl = "toggle" | "select" | "text" | "textarea" | "number" | "json" | "file";
export type ApiPayloadValue = string | boolean | number;
export type ApiPayloadValues = Record<string, ApiPayloadValue>;

export type ApiParameterOption = {
  label: string;
  value: string;
};

export type ApiParameterDefinition = {
  name: string;
  label: string;
  location: ApiParameterLocation;
  control: ApiParameterControl;
  defaultValue: ApiPayloadValue;
  help: string;
  placeholder?: string;
  options?: ApiParameterOption[];
};

export type ApiOperation = {
  id: string;
  categoryId: ApiCategoryId;
  name: string;
  summary: string;
  endpoint: string;
  method: "GET" | "POST" | "WebSocket" | "Concept";
  transport: ApiTransport;
  auth: ApiAuthPattern;
  status: ApiOperationStatus;
  executable: boolean;
  localRoute?: string;
  docsUrl?: string;
  verifyInDocs?: boolean;
  parameters: ApiParameterDefinition[];
  exampleBody?: unknown;
  exampleResponse?: unknown;
  responsePaths: string[];
  whenToUse: string[];
  whenNotToUse: string[];
  commonMistakes: string[];
  securityNotes: string[];
  learningNotes: string[];
  chainIdeas: string[];
  codeLabWorkflow?: CodeLabWorkflowId;
  relatedModule?: string;
};

export type ApiConceptCard = {
  title: string;
  detail: string;
};

export type ApiCategory = {
  id: ApiCategoryId;
  name: string;
  short: string;
  goal: string;
  description: string;
  operations: ApiOperation[];
  unlocks: string[];
  chainIdeas: string[];
  conceptCards?: ApiConceptCard[];
  checkpoint: string[];
};

export type GeneratedApiRequest = {
  url: string;
  method: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  bodyPreview?: unknown;
};

export type ApiStudioRunState = {
  status: "idle" | "running" | "success" | "error";
  message: string;
  envelope: ApiDebugEnvelope | null;
  audioUrl?: string;
};

export type ApiWorkbenchTab =
  | "overview"
  | "request"
  | "response"
  | "timeline"
  | "raw"
  | "code"
  | "chains"
  | "notes";

export type ApiCodeLanguage = "curl" | "Python" | "TypeScript" | "Go" | ".NET";

export type ApiChainPreset = {
  id: string;
  name: string;
  summary: string;
  apiIds: string[];
  steps: string[];
  handoff: unknown;
  customerValue: string;
  technicalRisk: string;
  securityConcerns: string[];
  suggestedFiles: string[];
  codeLabWorkflow: CodeLabWorkflowId;
};

export type CustomApiChainStep = {
  id: string;
  operationId: string;
  handoffField: string;
};

export type CustomApiChain = {
  name: string;
  steps: CustomApiChainStep[];
};

export type ApiMasteryProgress = {
  viewedCategories: ApiCategoryId[];
  builtPayloads: string[];
  safeRequestsRun: string[];
  chainsExplored: string[];
};
