import {
  TELEPHONY_MODES,
  TELEPHONY_PROVIDER_IDS,
  TELEPHONY_SAFEGUARD_IDS,
  TELEPHONY_SCENARIO_IDS,
  applyTelephonyLabRemediationInputSchema,
  configureTelephonyReadinessInputSchema,
  getTelephonyReadinessReportInputSchema,
  getVoiceLabContextInputSchema,
  runTelephonyReadinessInputSchema,
  type ApplyTelephonyLabRemediationInput,
  type ConfigureTelephonyReadinessInput,
  type RunTelephonyReadinessInput,
} from "@/lib/telephony-readiness/contracts";

export const TELEPHONY_READINESS_WEBMCP_TOOL_NAMES = [
  "get_voice_lab_context",
  "configure_telephony_readiness_test",
  "run_telephony_readiness_simulation",
  "get_telephony_readiness_report",
  "apply_telephony_lab_remediation",
] as const;

export type TelephonyReadinessWebMcpToolName =
  (typeof TELEPHONY_READINESS_WEBMCP_TOOL_NAMES)[number];

export const TELEPHONY_READINESS_WEBMCP_SOURCE = "webmcp-agent" as const;

type MaybePromise<Value> = Value | Promise<Value>;

export type TelephonyReadinessWebMcpController = Readonly<{
  getContext(): MaybePromise<unknown>;
  configure(
    input: ConfigureTelephonyReadinessInput,
    source: typeof TELEPHONY_READINESS_WEBMCP_SOURCE,
  ): MaybePromise<unknown>;
  run(
    input: RunTelephonyReadinessInput,
    source: typeof TELEPHONY_READINESS_WEBMCP_SOURCE,
  ): MaybePromise<unknown>;
  getReport(): MaybePromise<unknown>;
  applyRemediation(
    input: ApplyTelephonyLabRemediationInput,
    source: typeof TELEPHONY_READINESS_WEBMCP_SOURCE,
  ): MaybePromise<unknown>;
}>;

export type TelephonyReadinessWebMcpRegistrationStatus = Readonly<{
  state: "unsupported" | "ready" | "partial" | "error";
  registeredToolNames: readonly TelephonyReadinessWebMcpToolName[];
  failedToolNames: readonly TelephonyReadinessWebMcpToolName[];
  message: string;
}>;

export type TelephonyReadinessWebMcpRegistrationStatusCallback = (
  status: TelephonyReadinessWebMcpRegistrationStatus,
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
  name: TelephonyReadinessWebMcpToolName;
  description: string;
  inputSchema: WebMcpObjectInputSchema;
  annotations: Readonly<{ readOnlyHint: boolean }>;
  execute(input?: unknown): Promise<WebMcpToolResult>;
}>;

type ModelContextLike = Readonly<{
  registerTool(tool: WebMcpToolDefinition): unknown;
}>;

type InputSchemaLike<Input> = Readonly<{
  safeParse(input: unknown):
    | Readonly<{ success: true; data: Input }>
    | Readonly<{
        success: false;
        error: Readonly<{
          issues: readonly Readonly<{
            path: readonly PropertyKey[];
            message: string;
          }>[];
        }>;
      }>;
}>;

type RegistrationRecord = {
  controller: TelephonyReadinessWebMcpController;
  attemptedToolNames: Set<TelephonyReadinessWebMcpToolName>;
  registeredToolNames: Set<TelephonyReadinessWebMcpToolName>;
  failedToolNames: Set<TelephonyReadinessWebMcpToolName>;
};

const EMPTY_INPUT_JSON_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const satisfies WebMcpObjectInputSchema;

const CONFIGURE_INPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    provider: {
      type: "string",
      enum: [...TELEPHONY_PROVIDER_IDS],
      description: "The provider-neutral telephony adapter identifier. Twilio ConversationRelay is the first supported adapter.",
    },
    mode: {
      type: "string",
      enum: [...TELEPHONY_MODES],
      description: "The local execution mode. This MVP supports deterministic simulation only.",
    },
    scenario: {
      type: "string",
      enum: [...TELEPHONY_SCENARIO_IDS],
      description: "The deterministic readiness scenario to configure.",
    },
    safeguards: {
      type: "array",
      items: { type: "string", enum: [...TELEPHONY_SAFEGUARD_IDS] },
      uniqueItems: true,
      maxItems: TELEPHONY_SAFEGUARD_IDS.length,
      description: "The complete bounded set of local simulation safeguards to enable.",
    },
  },
  required: ["provider", "mode", "scenario", "safeguards"],
  additionalProperties: false,
} as const satisfies WebMcpObjectInputSchema;

const REMEDIATION_INPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    remediation: {
      type: "string",
      enum: [...TELEPHONY_SAFEGUARD_IDS],
      description: "One bounded local simulation safeguard to enable.",
    },
  },
  required: ["remediation"],
  additionalProperties: false,
} as const satisfies WebMcpObjectInputSchema;

const registrationRecords = new WeakMap<Document, RegistrationRecord>();

function isTopLevelDocument(documentLike: Document): boolean {
  try {
    const view = documentLike.defaultView;
    return view !== null && view.self === view.top;
  } catch {
    return false;
  }
}

function modelContextFor(documentLike: Document): ModelContextLike | null {
  try {
    // Site tools are owned by the top-level page. Never register from an iframe,
    // including a cross-origin frame whose top window cannot be inspected.
    if (!isTopLevelDocument(documentLike)) return null;
    const candidate = (documentLike as Document & { modelContext?: unknown }).modelContext;
    if (!candidate || (typeof candidate !== "object" && typeof candidate !== "function")) return null;
    if (typeof (candidate as { registerTool?: unknown }).registerTool !== "function") return null;
    return candidate as ModelContextLike;
  } catch {
    return null;
  }
}

export function isTelephonyReadinessWebMcpAvailable(documentLike: Document): boolean {
  return modelContextFor(documentLike) !== null;
}

function structuredContentFor(value: unknown): Readonly<Record<string, unknown>> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Readonly<Record<string, unknown>>;
  }
  return { value: value ?? null };
}

function toolResult(value: unknown): WebMcpToolResult {
  const structuredContent = structuredContentFor(value);
  const serialized = JSON.stringify(structuredContent);
  if (serialized === undefined) throw new TypeError("The local tool result was not JSON serializable.");
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
    error: {
      code,
      message,
      ...(issues.length > 0 ? { issues } : {}),
    },
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
      "The local telephony readiness operation could not be completed.",
    );
  }
}

function toolDefinitions(record: RegistrationRecord): readonly WebMcpToolDefinition[] {
  return [
    {
      name: "get_voice_lab_context",
      description:
        "Read the current local telephony readiness context: provider, simulation mode, scenario, safeguards, evidence-gate state, and whether live actions are available. This does not change state, read credentials, contact Twilio, or place a call.",
      inputSchema: EMPTY_INPUT_JSON_SCHEMA,
      annotations: { readOnlyHint: true },
      execute: (input = {}) => executeValidated(
        getVoiceLabContextInputSchema,
        input,
        () => record.controller.getContext(),
      ),
    },
    {
      name: "configure_telephony_readiness_test",
      description:
        "Set the visible local simulation provider, mode, scenario, and complete safeguard list; clear the current report, retain only a comparable same-scenario report as previous evidence, reset staleness, and record WebMCP as the latest activity source. This does not run a simulation, contact a provider, change credentials or infrastructure, or place a call.",
      inputSchema: CONFIGURE_INPUT_JSON_SCHEMA,
      annotations: { readOnlyHint: false },
      execute: (input) => executeValidated(
        configureTelephonyReadinessInputSchema,
        input,
        (parsedInput) => record.controller.configure(
          parsedInput,
          TELEPHONY_READINESS_WEBMCP_SOURCE,
        ),
      ),
    },
    {
      name: "run_telephony_readiness_simulation",
      description:
        "Run the selected deterministic local simulation; replace the visible event timeline and evidence-gate report, retain the prior same-scenario report for causal comparison, mark the new evidence fresh, and record WebMCP as the latest activity source. This makes no external request, contacts no provider, uses no credential, and places no live call.",
      inputSchema: EMPTY_INPUT_JSON_SCHEMA,
      annotations: { readOnlyHint: false },
      execute: (input = {}) => executeValidated(
        runTelephonyReadinessInputSchema,
        input,
        (parsedInput) => record.controller.run(
          parsedInput,
          TELEPHONY_READINESS_WEBMCP_SOURCE,
        ),
      ),
    },
    {
      name: "get_telephony_readiness_report",
      description:
        "Read the current local readiness report with each gate's status, exact evidence, ownership, and recommended next action. This does not change state, contact Twilio, read credentials, or place a call.",
      inputSchema: EMPTY_INPUT_JSON_SCHEMA,
      annotations: { readOnlyHint: true },
      execute: (input = {}) => executeValidated(
        getTelephonyReadinessReportInputSchema,
        input,
        () => record.controller.getReport(),
      ),
    },
    {
      name: "apply_telephony_lab_remediation",
      description:
        "Enable exactly one enumerated safeguard in the visible local simulation configuration; when that causal input changes, mark any current report as retained stale evidence, and record WebMCP as the latest activity source. This does not rerun the scenario, alter external infrastructure or credentials, contact a provider, or place a call.",
      inputSchema: REMEDIATION_INPUT_JSON_SCHEMA,
      annotations: { readOnlyHint: false },
      execute: (input) => executeValidated(
        applyTelephonyLabRemediationInputSchema,
        input,
        (parsedInput) => record.controller.applyRemediation(
          parsedInput,
          TELEPHONY_READINESS_WEBMCP_SOURCE,
        ),
      ),
    },
  ];
}

function statusFor(record: RegistrationRecord): TelephonyReadinessWebMcpRegistrationStatus {
  const registeredToolNames = TELEPHONY_READINESS_WEBMCP_TOOL_NAMES.filter((name) =>
    record.registeredToolNames.has(name));
  const failedToolNames = TELEPHONY_READINESS_WEBMCP_TOOL_NAMES.filter((name) =>
    record.failedToolNames.has(name));

  if (failedToolNames.length === 0) {
    return {
      state: "ready",
      registeredToolNames,
      failedToolNames,
      message: "WebMCP site tools are available for the local simulation lab.",
    };
  }
  if (registeredToolNames.length > 0) {
    return {
      state: "partial",
      registeredToolNames,
      failedToolNames,
      message: "Only part of the local WebMCP tool surface could be registered.",
    };
  }
  return {
    state: "error",
    registeredToolNames,
    failedToolNames,
    message: "The browser exposed WebMCP, but the local tool surface could not be registered.",
  };
}

function notifyRegistrationStatus(
  callback: TelephonyReadinessWebMcpRegistrationStatusCallback | undefined,
  status: TelephonyReadinessWebMcpRegistrationStatus,
) {
  try {
    callback?.(status);
  } catch {
    // A presentation callback cannot change whether the document owns registered tools.
  }
}

export function registerTelephonyReadinessWebMcpTools(
  documentLike: Document,
  controller: TelephonyReadinessWebMcpController,
  onStatus?: TelephonyReadinessWebMcpRegistrationStatusCallback,
): TelephonyReadinessWebMcpRegistrationStatus {
  const existing = registrationRecords.get(documentLike);
  if (existing) {
    // Tool callbacks dereference this record, so later React renders cannot leave stale state closures.
    existing.controller = controller;
    const status = statusFor(existing);
    notifyRegistrationStatus(onStatus, status);
    return status;
  }

  const modelContext = modelContextFor(documentLike);
  if (!modelContext) {
    const status: TelephonyReadinessWebMcpRegistrationStatus = {
      state: "unsupported",
      registeredToolNames: [],
      failedToolNames: [],
      message: "This browser does not expose WebMCP site tools. The complete human simulation UI remains available.",
    };
    notifyRegistrationStatus(onStatus, status);
    return status;
  }

  const record: RegistrationRecord = {
    controller,
    attemptedToolNames: new Set(),
    registeredToolNames: new Set(),
    failedToolNames: new Set(),
  };
  registrationRecords.set(documentLike, record);

  for (const tool of toolDefinitions(record)) {
    // Every name is attempted at most once for this Document. WebMCP lifetime is the
    // top-level document lifetime; no unverified unregister/disposer API is assumed.
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
  notifyRegistrationStatus(onStatus, status);
  return status;
}
