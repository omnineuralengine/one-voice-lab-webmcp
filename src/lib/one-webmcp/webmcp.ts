import {
  ONE_LAB_MAP_GOALS,
  ONE_PROVIDER_COMPARISON_DIMENSIONS,
  ONE_PROVIDER_SEARCH_MAX_RESULTS,
  ONE_WEBMCP_TOOL_NAMES,
  compareVoiceProvidersInputSchema,
  findVoiceProvidersInputSchema,
  getCurrentOneContextInputSchema,
  getOneLabMapInputSchema,
  openOneLabInputSchema,
  type CompareVoiceProvidersInput,
  type OneWebMcpToolName,
} from "@/lib/one-webmcp/contracts";
import type { OneWebMcpController } from "@/lib/one-webmcp/controller";
import { ONE_PUBLIC_LAB_DESTINATION_IDS } from "@/lib/public-evidence/lab-destinations";
import {
  NORMALIZED_PROVIDER_CAPABILITIES,
  PROVIDER_CAPABILITY_FAMILIES,
  PROVIDER_CAPABILITY_VERIFICATION_STATES,
  PROVIDER_CATALOG_GROUPS,
  PROVIDER_ENTITY_KINDS,
  PROVIDER_INTEGRATION_PATHS,
} from "@/lib/providers/platform-types";

type MaybePromise<Value> = Value | Promise<Value>;

export type OneWebMcpControllerLike = Pick<
  OneWebMcpController,
  "getProviderIds" | "getLabMap" | "getCurrentContext" | "findProviders" | "compareProviders" | "openLab" | "syncToolRegistration"
>;

export type OneWebMcpRegistrationStatus = Readonly<{
  state: "unsupported" | "ready" | "partial" | "error";
  registeredToolNames: readonly OneWebMcpToolName[];
  failedToolNames: readonly OneWebMcpToolName[];
  message: string;
}>;

export type OneWebMcpRegistrationStatusCallback = (
  status: OneWebMcpRegistrationStatus,
) => void;

type WebMcpObjectInputSchema = Readonly<{
  type: "object";
  properties: Readonly<Record<string, unknown>>;
  required?: readonly string[];
  additionalProperties: false;
}>;

type WebMcpToolResult = Readonly<{
  isError?: true;
  content: readonly [Readonly<{ type: "text"; text: string }>];
  structuredContent: Readonly<Record<string, unknown>>;
}>;

type WebMcpToolDefinition = Readonly<{
  name: OneWebMcpToolName;
  description: string;
  inputSchema: WebMcpObjectInputSchema;
  annotations: Readonly<{ readOnlyHint: boolean }>;
  execute(input?: unknown): Promise<WebMcpToolResult>;
}>;

type ModelContextLike = Readonly<{
  registerTool(tool: WebMcpToolDefinition): unknown;
}>;

type ValidationIssue = Readonly<{
  path: readonly PropertyKey[];
  message: string;
}>;

type InputSchemaLike<Input> = Readonly<{
  safeParse(input: unknown):
    | Readonly<{ success: true; data: Input }>
    | Readonly<{ success: false; error: Readonly<{ issues: readonly ValidationIssue[] }> }>;
}>;

type RegistrationRecord = {
  readonly controller: OneWebMcpControllerLike;
  providerIds: readonly string[];
  attemptedToolNames: Set<OneWebMcpToolName>;
  registeredToolNames: Set<OneWebMcpToolName>;
  failedToolNames: Set<OneWebMcpToolName>;
};

const EMPTY_INPUT_JSON_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const satisfies WebMcpObjectInputSchema;

const LAB_MAP_INPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    goal: {
      type: "string",
      enum: [...ONE_LAB_MAP_GOALS],
      description: "An optional bounded goal used only for deterministic lab suggestion.",
    },
  },
  additionalProperties: false,
} as const satisfies WebMcpObjectInputSchema;

const FIND_PROVIDERS_INPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    query: { type: "string", minLength: 1, maxLength: 80, description: "Case-insensitive text matched against existing public registry fields." },
    group: { type: "string", enum: [...PROVIDER_CATALOG_GROUPS], description: "An existing provider catalog group." },
    kind: { type: "string", enum: [...PROVIDER_ENTITY_KINDS], description: "An existing provider or adjacent-system kind." },
    capabilityFamily: { type: "string", enum: [...PROVIDER_CAPABILITY_FAMILIES], description: "An existing normalized modality or capability family." },
    supportedCapability: { type: "string", enum: [...NORMALIZED_PROVIDER_CAPABILITIES], description: "A normalized capability whose support field must be exactly supported." },
    integrationType: { type: "string", enum: [...PROVIDER_INTEGRATION_PATHS], description: "An existing capability integration path." },
    evidenceRequirement: { type: "string", enum: [...PROVIDER_CAPABILITY_VERIFICATION_STATES], description: "An exact existing capability-evidence state." },
    maxResults: { type: "integer", minimum: 1, maximum: ONE_PROVIDER_SEARCH_MAX_RESULTS, default: 10, description: "Maximum results, bounded to twenty." },
  },
  additionalProperties: false,
} as const satisfies WebMcpObjectInputSchema;

function compareProvidersInputJsonSchema(providerIds: readonly string[]) {
  return {
    type: "object",
    properties: {
      providerIds: {
        type: "array",
        items: { type: "string", enum: [...providerIds] },
        minItems: 2,
        maxItems: 3,
        uniqueItems: true,
        description: "Two or three unique stable identifiers from ONE's public provider snapshot.",
      },
      dimensions: {
        type: "array",
        items: { type: "string", enum: [...ONE_PROVIDER_COMPARISON_DIMENSIONS] },
        minItems: 1,
        maxItems: ONE_PROVIDER_COMPARISON_DIMENSIONS.length,
        uniqueItems: true,
        description: "One or more bounded evidence dimensions already represented in ONE.",
      },
    },
    required: ["providerIds", "dimensions"],
    additionalProperties: false,
  } as const satisfies WebMcpObjectInputSchema;
}

const OPEN_LAB_INPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    routeId: {
      type: "string",
      enum: [...ONE_PUBLIC_LAB_DESTINATION_IDS],
      description: "A stable identifier from ONE's public, internal-only lab destination registry.",
    },
  },
  required: ["routeId"],
  additionalProperties: false,
} as const satisfies WebMcpObjectInputSchema;

const registrationRecords = new WeakMap<Document, RegistrationRecord>();

function modelContextFor(documentLike: Document): ModelContextLike | null {
  try {
    const view = documentLike.defaultView;
    if (view === null || view.self !== view.top) return null;
    const candidate = (documentLike as Document & { modelContext?: unknown }).modelContext;
    if (!candidate || (typeof candidate !== "object" && typeof candidate !== "function")) return null;
    if (typeof (candidate as { registerTool?: unknown }).registerTool !== "function") return null;
    return candidate as ModelContextLike;
  } catch {
    return null;
  }
}

export function isOneWebMcpAvailable(documentLike: Document) {
  return modelContextFor(documentLike) !== null;
}

function structuredContentFor(value: unknown): Readonly<Record<string, unknown>> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Readonly<Record<string, unknown>>;
  }
  return { value: value ?? null };
}

function toolResult(value: unknown): WebMcpToolResult {
  const sourceContent = structuredContentFor(value);
  const serialized = JSON.stringify(sourceContent);
  if (serialized === undefined) throw new TypeError("The local ONE tool result was not JSON serializable.");
  // Return an isolated JSON value so a caller cannot mutate controller-owned
  // provider evidence or the authoritative internal-navigation registry.
  const structuredContent = JSON.parse(serialized) as Readonly<Record<string, unknown>>;
  return {
    content: [{ type: "text", text: serialized }],
    structuredContent,
  };
}

function toolError(
  code: "invalid_input" | "local_execution_failed",
  message: string,
  issues: readonly Readonly<{ path: string; message: string }>[] = [],
): WebMcpToolResult {
  const structuredContent = {
    ok: false,
    error: { code, message, ...(issues.length > 0 ? { issues } : {}) },
  };
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    structuredContent,
  };
}

async function executeValidated<Input>(
  schema: InputSchemaLike<Input>,
  input: unknown,
  operation: (parsedInput: Input) => MaybePromise<unknown>,
): Promise<WebMcpToolResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return toolError(
      "invalid_input",
      "The tool input did not match the declared local schema.",
      parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      })),
    );
  }
  try {
    return toolResult(await operation(parsed.data));
  } catch {
    return toolError(
      "local_execution_failed",
      "The local ONE site operation could not be completed.",
    );
  }
}

function comparisonSchemaFor(record: RegistrationRecord): InputSchemaLike<CompareVoiceProvidersInput> {
  return {
    safeParse(input) {
      const parsed = compareVoiceProvidersInputSchema.safeParse(input);
      if (!parsed.success) return parsed;
      const known = new Set(record.controller.getProviderIds());
      const unknownIndex = parsed.data.providerIds.findIndex((providerId) => !known.has(providerId));
      if (unknownIndex >= 0) {
        return {
          success: false as const,
          error: {
            issues: [{
              path: ["providerIds", unknownIndex],
              message: "Choose a known identifier from ONE's current public provider snapshot.",
            }],
          },
        };
      }
      return parsed;
    },
  };
}

function toolDefinitions(record: RegistrationRecord): readonly WebMcpToolDefinition[] {
  return [
    {
      name: "get_one_lab_map",
      description: "Read the six public ONE lab destinations, their purposes, human and agent actions, implementation modes, availability, and a deterministic next-lab suggestion based only on an optional bounded goal or the current visible route. This does not navigate, mutate state, invoke providers, or expose private routes.",
      inputSchema: LAB_MAP_INPUT_JSON_SCHEMA,
      annotations: { readOnlyHint: true },
      execute: (input = {}) => executeValidated(
        getOneLabMapInputSchema,
        input,
        (parsedInput) => record.controller.getLabMap(parsedInput),
      ),
    },
    {
      name: "get_current_one_context",
      description: "Read the current sanitized ONE route, lab or allowlisted query module, selected public provider or simulated telephony scenario when visible, evidence state, available WebMCP actions, and safe next actions. This reads application state directly and does not inspect the DOM, mutate state, contact providers, or expose identity data.",
      inputSchema: EMPTY_INPUT_JSON_SCHEMA,
      annotations: { readOnlyHint: true },
      execute: (input = {}) => executeValidated(
        getCurrentOneContextInputSchema,
        input,
        () => record.controller.getCurrentContext(),
      ),
    },
    {
      name: "find_voice_providers",
      description: "Search the current credential-free public provider snapshot using only ONE's existing group, entity-kind, capability-family, capability, integration-path, and evidence taxonomies. Results preserve provenance, freshness, limitations, and unknowns; they make no provider request and invent no pricing, latency, quality, security, or availability claim.",
      inputSchema: FIND_PROVIDERS_INPUT_JSON_SCHEMA,
      annotations: { readOnlyHint: true },
      execute: (input = {}) => executeValidated(
        findVoiceProvidersInputSchema,
        input,
        (parsedInput) => record.controller.findProviders(parsedInput),
      ),
    },
    {
      name: "compare_voice_providers",
      description: "Compare exactly two or three known public provider identifiers across explicitly selected registry dimensions. The result returns exact evidence and freshness, observed-versus-unknown state, missing fields, and no winner or ranking. This does not invoke a provider, infer missing facts, or mutate application state.",
      inputSchema: compareProvidersInputJsonSchema(record.controller.getProviderIds()),
      annotations: { readOnlyHint: true },
      execute: (input) => executeValidated(
        comparisonSchemaFor(record),
        input,
        (parsedInput) => record.controller.compareProviders(parsedInput),
      ),
    },
    {
      name: "open_one_lab",
      description: "Request visible application-native navigation to exactly one allowlisted public ONE lab route and publish a local navigation activity record. The result truthfully reports requested versus already-open state; arrival is verified by a later current-context read. This cannot open arbitrary or external URLs, call providers, change credentials, trigger lab actions, or alter persisted user data.",
      inputSchema: OPEN_LAB_INPUT_JSON_SCHEMA,
      annotations: { readOnlyHint: false },
      execute: (input) => executeValidated(
        openOneLabInputSchema,
        input,
        (parsedInput) => record.controller.openLab(parsedInput),
      ),
    },
  ];
}

function statusFor(record: RegistrationRecord): OneWebMcpRegistrationStatus {
  const registeredToolNames = ONE_WEBMCP_TOOL_NAMES.filter((name) => record.registeredToolNames.has(name));
  const failedToolNames = ONE_WEBMCP_TOOL_NAMES.filter((name) => record.failedToolNames.has(name));
  if (failedToolNames.length === 0) {
    return {
      state: "ready",
      registeredToolNames,
      failedToolNames,
      message: "ONE-wide WebMCP discovery and navigation tools are ready.",
    };
  }
  if (registeredToolNames.length > 0) {
    return {
      state: "partial",
      registeredToolNames,
      failedToolNames,
      message: "Only part of the ONE-wide WebMCP tool surface could be registered.",
    };
  }
  return {
    state: "error",
    registeredToolNames,
    failedToolNames,
    message: "The browser exposed WebMCP, but the ONE-wide tool surface could not be registered.",
  };
}

function notifyStatus(
  callback: OneWebMcpRegistrationStatusCallback | undefined,
  status: OneWebMcpRegistrationStatus,
) {
  try {
    callback?.(status);
  } catch {
    // Presentation cannot change document-owned registration state.
  }
}

export function registerOneWebMcpTools(
  documentLike: Document,
  controller: OneWebMcpControllerLike,
  onStatus?: OneWebMcpRegistrationStatusCallback,
): OneWebMcpRegistrationStatus {
  const existing = registrationRecords.get(documentLike);
  if (existing) {
    const providerIds = controller.getProviderIds();
    const providerIdentityChanged = (
      providerIds.length !== existing.providerIds.length
      || providerIds.some((providerId, index) => providerId !== existing.providerIds[index])
    );
    if (existing.controller !== controller) {
      const status: OneWebMcpRegistrationStatus = {
        state: "error",
        registeredToolNames: ONE_WEBMCP_TOOL_NAMES.filter((name) => existing.registeredToolNames.has(name)),
        failedToolNames: [],
        message: providerIdentityChanged
          ? "The document-owned provider identity changed after WebMCP registration; the original safe tool surface remains authoritative."
          : "A different controller attempted to replace the document-owned WebMCP registration; the original safe tool surface remains authoritative.",
      };
      notifyStatus(onStatus, status);
      return status;
    }
    const status = statusFor(existing);
    controller.syncToolRegistration("one", status.registeredToolNames, status.failedToolNames);
    notifyStatus(onStatus, status);
    return status;
  }

  const modelContext = modelContextFor(documentLike);
  if (!modelContext) {
    const status: OneWebMcpRegistrationStatus = {
      state: "unsupported",
      registeredToolNames: [],
      failedToolNames: [],
      message: "This browser does not expose WebMCP site tools. The complete human ONE experience remains available.",
    };
    notifyStatus(onStatus, status);
    return status;
  }

  const record: RegistrationRecord = {
    controller,
    providerIds: controller.getProviderIds(),
    attemptedToolNames: new Set(),
    registeredToolNames: new Set(),
    failedToolNames: new Set(),
  };
  registrationRecords.set(documentLike, record);

  for (const tool of toolDefinitions(record)) {
    if (record.attemptedToolNames.has(tool.name)) continue;
    record.attemptedToolNames.add(tool.name);
    try {
      modelContext.registerTool(tool);
      record.registeredToolNames.add(tool.name);
    } catch {
      record.failedToolNames.add(tool.name);
    }
  }

  const status = statusFor(record);
  controller.syncToolRegistration("one", status.registeredToolNames, status.failedToolNames);
  notifyStatus(onStatus, status);
  return status;
}
