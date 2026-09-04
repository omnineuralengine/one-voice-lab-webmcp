import type { VoiceReplayController } from "@/lib/simulations/webmcp-controller";
import {
  VoiceReplayControllerError,
} from "@/lib/simulations/webmcp-controller";
import {
  VOICE_REPLAY_IMPAIRMENTS,
  VOICE_REPLAY_WEBMCP_TOOL_NAMES,
  TWILIO_CONVERSATION_RELAY_PROFILE_ID,
  getVoiceReplayEvidenceInputSchema,
  listVoiceScenariosInputSchema,
  prepareVoiceReplayInputSchema,
  runVoiceReplayInputSchema,
  type VoiceReplayWebMcpToolName,
} from "@/lib/simulations/webmcp-contracts";

type MaybePromise<Value> = Value | Promise<Value>;

type WebMcpObjectInputSchema = Readonly<{
  type: "object";
  properties: Readonly<Record<string, unknown>>;
  required?: readonly string[];
  additionalProperties: false;
}>;

export type VoiceReplayWebMcpToolResult = Readonly<{
  isError?: true;
  content: readonly [Readonly<{ type: "text"; text: string }>];
  structuredContent: Readonly<Record<string, unknown>>;
}>;

export type VoiceReplayWebMcpToolDefinition = Readonly<{
  name: VoiceReplayWebMcpToolName;
  description: string;
  inputSchema: WebMcpObjectInputSchema;
  annotations: Readonly<{ readOnlyHint: boolean }>;
  execute(
    input?: unknown,
    options?: Readonly<{ signal?: AbortSignal }>,
  ): Promise<VoiceReplayWebMcpToolResult>;
}>;

type ModelContextLike = Readonly<{
  registerTool(
    tool: VoiceReplayWebMcpToolDefinition,
    options: Readonly<{ signal: AbortSignal }>,
  ): MaybePromise<unknown>;
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

export type VoiceReplayWebMcpRegistrationStatus = Readonly<{
  state: "unsupported" | "ready" | "partial" | "error";
  registeredToolNames: readonly VoiceReplayWebMcpToolName[];
  failedToolNames: readonly VoiceReplayWebMcpToolName[];
  message: string;
}>;

export type VoiceReplayWebMcpRegistration = Readonly<{
  status: VoiceReplayWebMcpRegistrationStatus;
  release(): void;
}>;

type RegistrationRecord = {
  readonly controller: VoiceReplayController;
  readonly abortController: AbortController;
  readonly registeredToolNames: Set<VoiceReplayWebMcpToolName>;
  readonly failedToolNames: Set<VoiceReplayWebMcpToolName>;
  readonly callbacks: Set<(status: VoiceReplayWebMcpRegistrationStatus) => void>;
  leases: number;
  releaseGeneration: number;
};

const EMPTY_INPUT_JSON_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const satisfies WebMcpObjectInputSchema;

const PREPARE_INPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    scenarioId: {
      type: "string",
      enum: ["target-speaker-vs-world"],
      description: "An implemented deterministic scenario identifier returned by list_voice_scenarios.",
    },
    templateId: {
      type: "string",
      enum: ["browser-assistant", "contact-center", "customer-support", "tool-using-agent"],
      description: "A compatible architecture context for the visible replay plan.",
    },
    impairment: {
      type: "string",
      enum: [...VOICE_REPLAY_IMPAIRMENTS],
      description: "One supported deterministic impairment.",
    },
    runCount: {
      type: "integer",
      minimum: 1,
      maximum: 3,
      description: "The deterministic fixture run number; values are rejected rather than clamped.",
    },
    referenceProfileId: {
      type: "string",
      enum: [TWILIO_CONVERSATION_RELAY_PROFILE_ID],
      description: "Optional source-grounded risk lens. It does not change replay execution or contact Twilio.",
    },
  },
  required: ["scenarioId", "templateId", "impairment", "runCount"],
  additionalProperties: false,
} as const satisfies WebMcpObjectInputSchema;

const RUN_INPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    planId: {
      type: "string",
      pattern: "^voice-replay-plan-[1-9][0-9]*-[a-f0-9]{8}$",
      maxLength: 64,
      description: "The exact current visible plan identifier previously returned by prepare_voice_replay.",
    },
  },
  required: ["planId"],
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

export function isVoiceReplayWebMcpAvailable(documentLike: Document) {
  return modelContextFor(documentLike) !== null;
}

function toolResult(value: unknown): VoiceReplayWebMcpToolResult {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError("The deterministic replay result was not JSON serializable.");
  }
  const structuredContent = JSON.parse(serialized) as Readonly<Record<string, unknown>>;
  return {
    content: [{ type: "text", text: serialized }],
    structuredContent,
  };
}

function toolError(
  code: string,
  message: string,
  issues: readonly Readonly<{ path: string; message: string }>[] = [],
): VoiceReplayWebMcpToolResult {
  const structuredContent = {
    ok: false,
    error: { code, message, ...(issues.length ? { issues } : {}) },
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
  operation: (parsed: Input) => MaybePromise<unknown>,
) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return toolError(
      "invalid_input",
      "The tool input did not match the declared deterministic replay schema.",
      parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      })),
    );
  }
  try {
    return toolResult(await operation(parsed.data));
  } catch (error) {
    if (error instanceof VoiceReplayControllerError) {
      return toolError(error.code, error.message);
    }
    if (isAbortError(error)) {
      return toolError("replay_cancelled", "The deterministic local replay was cancelled.");
    }
    return toolError("local_execution_failed", "The deterministic local replay operation failed without crossing a provider boundary.");
  }
}

export function createVoiceReplayWebMcpTools(
  controller: VoiceReplayController,
): readonly VoiceReplayWebMcpToolDefinition[] {
  return [
    {
      name: "list_voice_scenarios",
      description:
        "List ONE Voice Lab scenario definitions, runnable status, limitations, compatible local replay inputs, and the source-grounded Twilio ConversationRelay production-readiness reference profile. This read-only tool makes no provider, network, microphone, upload, telephony, persistence, or spend action.",
      inputSchema: EMPTY_INPUT_JSON_SCHEMA,
      annotations: { readOnlyHint: true },
      execute: (input = {}) => executeValidated(
        listVoiceScenariosInputSchema,
        input,
        () => controller.listScenarios(),
      ),
    },
    {
      name: "prepare_voice_replay",
      description:
        "Validate and publish one exact deterministic local replay plan into the visible Simulation Lab, replacing and invalidating any earlier plan authorization. It does not execute, authorize itself, persist data, contact a provider, use a microphone, upload media, perform telephony, or spend money. A human must authorize the exact normalized plan in the UI.",
      inputSchema: PREPARE_INPUT_JSON_SCHEMA,
      annotations: { readOnlyHint: false },
      execute: (input) => executeValidated(
        prepareVoiceReplayInputSchema,
        input,
        (parsed) => controller.prepare(parsed),
      ),
    },
    {
      name: "run_voice_replay",
      description:
        "Consume the one-use human authorization bound to the exact current visible plan and run ONE's deterministic local replay engine. Unauthorized, stale, changed, expired, unknown, or previously consumed plans fail closed. The WebMCP abort signal cancels local execution. No provider, network, microphone, upload, telephony, persistence, credential, or spend action is available.",
      inputSchema: RUN_INPUT_JSON_SCHEMA,
      annotations: { readOnlyHint: false },
      execute: (input, options = {}) => executeValidated(
        runVoiceReplayInputSchema,
        input,
        (parsed) => controller.run(parsed, options.signal),
      ),
    },
    {
      name: "get_voice_replay_evidence",
      description:
        "Read the current visible deterministic replay plan, one-use authorization state, ordered simulated timeline, scorecard, bounded local activity, and explicit zero-provider boundary. This tool does not mutate state or make any external action.",
      inputSchema: EMPTY_INPUT_JSON_SCHEMA,
      annotations: { readOnlyHint: true },
      execute: (input = {}) => executeValidated(
        getVoiceReplayEvidenceInputSchema,
        input,
        () => controller.getEvidence(),
      ),
    },
  ];
}

function statusFor(record: RegistrationRecord): VoiceReplayWebMcpRegistrationStatus {
  const registeredToolNames = VOICE_REPLAY_WEBMCP_TOOL_NAMES.filter((name) =>
    record.registeredToolNames.has(name));
  const failedToolNames = VOICE_REPLAY_WEBMCP_TOOL_NAMES.filter((name) =>
    record.failedToolNames.has(name));
  if (!failedToolNames.length) {
    return {
      state: "ready",
      registeredToolNames,
      failedToolNames,
      message: "Exactly four deterministic replay WebMCP tools are registered at the top level.",
    };
  }
  if (registeredToolNames.length) {
    return {
      state: "partial",
      registeredToolNames,
      failedToolNames,
      message: "Only part of the four-tool deterministic replay surface registered.",
    };
  }
  return {
    state: "error",
    registeredToolNames,
    failedToolNames,
    message: "The browser exposed WebMCP, but the deterministic replay tools did not register.",
  };
}

function notify(record: RegistrationRecord) {
  const status = statusFor(record);
  for (const callback of record.callbacks) {
    try {
      callback(status);
    } catch {
      // Presentation cannot change document-owned registration.
    }
  }
}

function unsupportedStatus(): VoiceReplayWebMcpRegistrationStatus {
  return {
    state: "unsupported",
    registeredToolNames: [],
    failedToolNames: [],
    message: "This browser does not expose WebMCP site tools. The complete human Simulation Lab remains available.",
  };
}

export function registerVoiceReplayWebMcpTools(
  documentLike: Document,
  controller: VoiceReplayController,
  onStatus?: (status: VoiceReplayWebMcpRegistrationStatus) => void,
): VoiceReplayWebMcpRegistration {
  const existing = registrationRecords.get(documentLike);
  if (existing) {
    if (existing.controller !== controller) {
      const status: VoiceReplayWebMcpRegistrationStatus = {
        state: "error",
        registeredToolNames: VOICE_REPLAY_WEBMCP_TOOL_NAMES.filter((name) => existing.registeredToolNames.has(name)),
        failedToolNames: [],
        message: "A different controller cannot replace the document-owned four-tool registration.",
      };
      onStatus?.(status);
      return { status, release() {} };
    }
    existing.leases += 1;
    existing.releaseGeneration += 1;
    if (onStatus) existing.callbacks.add(onStatus);
    const status = statusFor(existing);
    onStatus?.(status);
    return registrationLease(documentLike, existing, onStatus, status);
  }

  const modelContext = modelContextFor(documentLike);
  if (!modelContext) {
    const status = unsupportedStatus();
    onStatus?.(status);
    return { status, release() {} };
  }

  const record: RegistrationRecord = {
    controller,
    abortController: new AbortController(),
    registeredToolNames: new Set(),
    failedToolNames: new Set(),
    callbacks: new Set(onStatus ? [onStatus] : []),
    leases: 1,
    releaseGeneration: 0,
  };
  registrationRecords.set(documentLike, record);

  for (const tool of createVoiceReplayWebMcpTools(controller)) {
    try {
      const pending = modelContext.registerTool(tool, { signal: record.abortController.signal });
      record.registeredToolNames.add(tool.name);
      void Promise.resolve(pending).catch(() => {
        record.registeredToolNames.delete(tool.name);
        record.failedToolNames.add(tool.name);
        notify(record);
      });
    } catch {
      record.failedToolNames.add(tool.name);
    }
  }

  const status = statusFor(record);
  onStatus?.(status);
  return registrationLease(documentLike, record, onStatus, status);
}

function registrationLease(
  documentLike: Document,
  record: RegistrationRecord,
  callback: ((status: VoiceReplayWebMcpRegistrationStatus) => void) | undefined,
  status: VoiceReplayWebMcpRegistrationStatus,
): VoiceReplayWebMcpRegistration {
  let released = false;
  return {
    status,
    release() {
      if (released) return;
      released = true;
      if (callback) record.callbacks.delete(callback);
      record.leases = Math.max(0, record.leases - 1);
      const generation = record.releaseGeneration + 1;
      record.releaseGeneration = generation;
      queueMicrotask(() => {
        if (record.leases !== 0 || record.releaseGeneration !== generation) return;
        record.abortController.abort();
        registrationRecords.delete(documentLike);
      });
    },
  };
}

function isAbortError(error: unknown) {
  return Boolean(
    error
    && typeof error === "object"
    && "name" in error
    && (error as { name?: unknown }).name === "AbortError",
  );
}
