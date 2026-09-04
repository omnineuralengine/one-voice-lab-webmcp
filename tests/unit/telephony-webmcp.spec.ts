import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { AGENT_ACTION_ALLOWLIST } from "@/lib/actions/registry";
import { PUBLIC_SERVER_ACTION_NAMES } from "@/lib/actions/server/executor";
import {
  TELEPHONY_MODES,
  TELEPHONY_PROVIDER_IDS,
  TELEPHONY_SAFEGUARD_IDS,
  TELEPHONY_SCENARIO_IDS,
} from "@/lib/telephony-readiness/contracts";
import { createTelephonyReadinessController } from "@/lib/telephony-readiness/controller";
import {
  TELEPHONY_READINESS_WEBMCP_TOOL_NAMES,
  isTelephonyReadinessWebMcpAvailable,
  registerTelephonyReadinessWebMcpTools,
} from "@/lib/telephony-readiness/webmcp";

type JsonSchemaNode = Readonly<{
  type?: string;
  properties?: Readonly<Record<string, JsonSchemaNode>>;
  items?: JsonSchemaNode;
  enum?: readonly unknown[];
  required?: readonly string[];
  additionalProperties?: boolean;
  uniqueItems?: boolean;
  maxItems?: number;
}>;

type CapturedToolResult = Readonly<{
  isError?: true;
  content: readonly Readonly<{ type: "text"; text: string }>[];
  structuredContent: Readonly<Record<string, unknown>>;
}>;

type CapturedTool = Readonly<{
  name: string;
  description: string;
  inputSchema: JsonSchemaNode;
  annotations: Readonly<{ readOnlyHint: boolean }>;
  execute(input?: unknown): Promise<CapturedToolResult>;
}>;

function fakeTopLevelDocument() {
  const tools: CapturedTool[] = [];
  const topLevelWindow: Record<string, unknown> = {};
  topLevelWindow.self = topLevelWindow;
  topLevelWindow.top = topLevelWindow;
  const documentLike = {
    defaultView: topLevelWindow,
    modelContext: {
      registerTool(tool: CapturedTool) {
        tools.push(tool);
      },
    },
  } as unknown as Document;
  return { documentLike, tools };
}

function toolMap(tools: readonly CapturedTool[]) {
  return new Map(tools.map((tool) => [tool.name, tool]));
}

function requiredTool(tools: ReadonlyMap<string, CapturedTool>, name: string) {
  const tool = tools.get(name);
  expect(tool, `expected registered WebMCP tool ${name}`).toBeDefined();
  return tool!;
}

function expectClosedObjectSchemas(schema: JsonSchemaNode) {
  if (schema.type === "object") expect(schema.additionalProperties).toBe(false);
  for (const property of Object.values(schema.properties ?? {})) {
    expectClosedObjectSchemas(property);
  }
  if (schema.items) expectClosedObjectSchemas(schema.items);
}

function expectResultTextMatchesStructure(result: CapturedToolResult) {
  expect(result.content).toHaveLength(1);
  expect(result.content[0].type).toBe("text");
  expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
}

test.describe("Twilio readiness browser-side WebMCP bridge", () => {
  test("feature-detects a missing modelContext without changing the human lab", () => {
    const documentLike = {} as Document;
    const controller = createTelephonyReadinessController();
    const before = structuredClone(controller.getSnapshot());
    const statuses: unknown[] = [];

    expect(isTelephonyReadinessWebMcpAvailable(documentLike)).toBe(false);
    const status = registerTelephonyReadinessWebMcpTools(
      documentLike,
      controller,
      (nextStatus) => statuses.push(nextStatus),
    );

    expect(status).toEqual({
      state: "unsupported",
      registeredToolNames: [],
      failedToolNames: [],
      message: "This browser does not expose WebMCP site tools. The complete human simulation UI remains available.",
    });
    expect(statuses).toEqual([status]);
    expect(controller.getSnapshot()).toEqual(before);
  });

  test("registers the exact five unique tools once for a top-level document", async () => {
    const { documentLike, tools } = fakeTopLevelDocument();
    const firstController = createTelephonyReadinessController();
    const secondController = createTelephonyReadinessController();

    expect(isTelephonyReadinessWebMcpAvailable(documentLike)).toBe(true);
    const firstStatus = registerTelephonyReadinessWebMcpTools(documentLike, firstController);
    const secondStatus = registerTelephonyReadinessWebMcpTools(documentLike, secondController);

    expect(firstStatus.state).toBe("ready");
    expect(secondStatus.state).toBe("ready");
    expect(tools.map((tool) => tool.name)).toEqual(TELEPHONY_READINESS_WEBMCP_TOOL_NAMES);
    expect(new Set(tools.map((tool) => tool.name)).size).toBe(5);
    expect(tools).toHaveLength(5);

    const configure = requiredTool(toolMap(tools), "configure_telephony_readiness_test");
    const result = await configure.execute({
      provider: "twilio-conversation-relay",
      mode: "simulation",
      scenario: "latency-spike",
      safeguards: [],
    });
    expect(result.isError).toBeUndefined();
    expect(firstController.getSnapshot().revision).toBe(0);
    expect(secondController.getSnapshot().revision).toBe(1);
  });

  test("never registers site tools from an iframe document", () => {
    const tools: CapturedTool[] = [];
    const frameWindow: Record<string, unknown> = {};
    frameWindow.self = frameWindow;
    frameWindow.top = {};
    const documentLike = {
      defaultView: frameWindow,
      modelContext: { registerTool: (tool: CapturedTool) => tools.push(tool) },
    } as unknown as Document;
    const controller = createTelephonyReadinessController();

    expect(isTelephonyReadinessWebMcpAvailable(documentLike)).toBe(false);
    expect(registerTelephonyReadinessWebMcpTools(documentLike, controller).state).toBe("unsupported");
    expect(tools).toEqual([]);
    expect(controller.getSnapshot().revision).toBe(0);
  });

  test("publishes closed narrow schemas and accurate read-only annotations", () => {
    const { documentLike, tools } = fakeTopLevelDocument();
    registerTelephonyReadinessWebMcpTools(documentLike, createTelephonyReadinessController());
    const byName = toolMap(tools);

    for (const tool of tools) expectClosedObjectSchemas(tool.inputSchema);

    const configure = requiredTool(byName, "configure_telephony_readiness_test").inputSchema;
    expect(configure.required).toEqual(["provider", "mode", "scenario", "safeguards"]);
    expect(configure.properties?.provider.enum).toEqual(TELEPHONY_PROVIDER_IDS);
    expect(configure.properties?.mode.enum).toEqual(TELEPHONY_MODES);
    expect(configure.properties?.scenario.enum).toEqual(TELEPHONY_SCENARIO_IDS);
    expect(configure.properties?.safeguards.items?.enum).toEqual(TELEPHONY_SAFEGUARD_IDS);
    expect(configure.properties?.safeguards.uniqueItems).toBe(true);
    expect(configure.properties?.safeguards.maxItems).toBe(TELEPHONY_SAFEGUARD_IDS.length);

    const remediation = requiredTool(byName, "apply_telephony_lab_remediation").inputSchema;
    expect(remediation.required).toEqual(["remediation"]);
    expect(remediation.properties?.remediation.enum).toEqual(TELEPHONY_SAFEGUARD_IDS);

    expect(requiredTool(byName, "get_voice_lab_context").annotations).toEqual({ readOnlyHint: true });
    expect(requiredTool(byName, "get_telephony_readiness_report").annotations).toEqual({ readOnlyHint: true });
    expect(requiredTool(byName, "configure_telephony_readiness_test").annotations).toEqual({ readOnlyHint: false });
    expect(requiredTool(byName, "run_telephony_readiness_simulation").annotations).toEqual({ readOnlyHint: false });
    expect(requiredTool(byName, "apply_telephony_lab_remediation").annotations).toEqual({ readOnlyHint: false });
  });

  test("strictly rejects unknown properties without mutating local state", async () => {
    const { documentLike, tools } = fakeTopLevelDocument();
    const controller = createTelephonyReadinessController();
    registerTelephonyReadinessWebMcpTools(documentLike, controller);
    const byName = toolMap(tools);
    const before = structuredClone(controller.getSnapshot());

    const invalidCalls = [
      requiredTool(byName, "get_voice_lab_context").execute({ unknown: true }),
      requiredTool(byName, "configure_telephony_readiness_test").execute({
        provider: "twilio-conversation-relay",
        mode: "simulation",
        scenario: "healthy-call",
        safeguards: [],
        unknown: true,
      }),
      requiredTool(byName, "run_telephony_readiness_simulation").execute({ unknown: true }),
      requiredTool(byName, "get_telephony_readiness_report").execute({ unknown: true }),
      requiredTool(byName, "apply_telephony_lab_remediation").execute({
        remediation: "enable-token-streaming",
        unknown: true,
      }),
      requiredTool(byName, "configure_telephony_readiness_test").execute({
        provider: "twilio-conversation-relay",
        mode: "live",
        scenario: "healthy-call",
        safeguards: [],
      }),
      requiredTool(byName, "run_telephony_readiness_simulation").execute({
        phoneNumber: "placeholder-only",
      }),
      requiredTool(byName, "apply_telephony_lab_remediation").execute({
        remediation: "enable-token-streaming",
        credentials: "placeholder-only",
      }),
    ];

    for (const result of await Promise.all(invalidCalls)) {
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({
        ok: false,
        error: { code: "invalid_input" },
      });
    }
    expect(controller.getSnapshot()).toEqual(before);
    expect(controller.getSnapshot().revision).toBe(0);
  });

  test("read-only tools preserve deep state and revision", async () => {
    const { documentLike, tools } = fakeTopLevelDocument();
    const controller = createTelephonyReadinessController();
    controller.run({}, "human-ui");
    registerTelephonyReadinessWebMcpTools(documentLike, controller);
    const byName = toolMap(tools);
    const before = structuredClone(controller.getSnapshot());

    const contextResult = await requiredTool(byName, "get_voice_lab_context").execute({});
    const reportResult = await requiredTool(byName, "get_telephony_readiness_report").execute({});

    expect(contextResult.structuredContent).toEqual(controller.getContext());
    expect(reportResult.structuredContent).toEqual(controller.getReport());
    expectResultTextMatchesStructure(contextResult);
    expectResultTextMatchesStructure(reportResult);
    expect(controller.getSnapshot()).toEqual(before);
    expect(controller.getSnapshot().revision).toBe(before.revision);
  });

  test("write-tool results match the same visible controller state", async () => {
    const { documentLike, tools } = fakeTopLevelDocument();
    const controller = createTelephonyReadinessController();
    registerTelephonyReadinessWebMcpTools(documentLike, controller);
    const byName = toolMap(tools);

    const configured = await requiredTool(byName, "configure_telephony_readiness_test").execute({
      provider: "twilio-conversation-relay",
      mode: "simulation",
      scenario: "combined-production-stress-test",
      safeguards: [],
    });
    expect(configured.isError).toBeUndefined();
    expect(configured.structuredContent).toMatchObject({
      ok: true,
      configuration: controller.getSnapshot().configuration,
      context: controller.getContext(),
    });
    expect(controller.getSnapshot().latestActivity?.source).toBe("webmcp-agent");
    expectResultTextMatchesStructure(configured);

    const run = await requiredTool(byName, "run_telephony_readiness_simulation").execute({});
    expect(run.isError).toBeUndefined();
    expect(run.structuredContent).toMatchObject({
      ok: true,
      report: controller.getReport().report,
      context: controller.getContext(),
    });
    expect(controller.getSnapshot().latestActivity?.source).toBe("webmcp-agent");
    expectResultTextMatchesStructure(run);

    const remediated = await requiredTool(byName, "apply_telephony_lab_remediation").execute({
      remediation: "enable-token-streaming",
    });
    expect(remediated.isError).toBeUndefined();
    expect(remediated.structuredContent).toMatchObject({
      ok: true,
      changed: true,
      remediation: "enable-token-streaming",
      configuredSafeguards: controller.getSnapshot().configuration.safeguards,
      context: controller.getContext(),
    });
    expect(controller.getReport().stale).toBe(true);
    expect(controller.getSnapshot().latestActivity?.source).toBe("webmcp-agent");
    expectResultTextMatchesStructure(remediated);
  });

  test("keeps every site tool local-only and separate from remote MCP", async () => {
    const { documentLike, tools } = fakeTopLevelDocument();
    const controller = createTelephonyReadinessController();
    registerTelephonyReadinessWebMcpTools(documentLike, controller);
    const byName = toolMap(tools);
    const agentActions = new Set<string>(AGENT_ACTION_ALLOWLIST);
    const publicServerActions = new Set<string>(PUBLIC_SERVER_ACTION_NAMES);
    const remoteMcpSource = readFileSync(
      join(process.cwd(), "src", "lib", "public-evidence", "mcp.ts"),
      "utf8",
    );
    const telephonyRuntimePaths = [
      ["src", "lib", "telephony-readiness", "contracts.ts"],
      ["src", "lib", "telephony-readiness", "controller.ts"],
      ["src", "lib", "telephony-readiness", "engine.ts"],
      ["src", "lib", "telephony-readiness", "fixtures.ts"],
      ["src", "lib", "telephony-readiness", "webmcp.ts"],
      ["src", "components", "telephony-readiness", "TelephonyReadinessLab.tsx"],
      ["src", "components", "telephony-readiness", "TelephonyReadinessProvider.tsx"],
      ["src", "app", "telephony-readiness", "page.tsx"],
    ] as const;
    const telephonyRuntimeSource = telephonyRuntimePaths
      .map((parts) => readFileSync(join(process.cwd(), ...parts), "utf8"))
      .join("\n");

    for (const name of TELEPHONY_READINESS_WEBMCP_TOOL_NAMES) {
      expect(agentActions.has(name)).toBe(false);
      expect(publicServerActions.has(name)).toBe(false);
      expect(remoteMcpSource).not.toContain(name);
    }
    expect(remoteMcpSource).not.toMatch(/telephony-readiness|ConversationRelay/i);
    expect(telephonyRuntimeSource).not.toMatch(/\b(?:fetch|WebSocket|EventSource|XMLHttpRequest)\s*\(|navigator\.sendBeacon|process\.env|["']use server["']|\/(?:api|actions)\//);
    expect(telephonyRuntimeSource).not.toMatch(/NEXT_PUBLIC_TWILIO_|TWILIO_(?:ACCOUNT_SID|AUTH_TOKEN|PHONE_NUMBER|TEST_ACCOUNT_SID|TEST_AUTH_TOKEN)/);

    await requiredTool(byName, "run_telephony_readiness_simulation").execute({});
    const context = controller.getContext();
    const report = controller.getReport().report;
    expect(context.liveActionsAvailable).toBe(false);
    expect(context.liveCallStatus).toBe("No live call placed");
    expect(report).not.toBeNull();
    expect(report).toMatchObject({
      liveActionsAvailable: false,
      liveCallStatus: "No live call placed",
      providerRequestCount: 0,
      providerCreditCount: 0,
      evidenceMode: "simulated",
    });
  });

  test("executes every valid site tool without using a browser transport", async () => {
    const originalFetch = globalThis.fetch;
    const originalWebSocket = Object.getOwnPropertyDescriptor(globalThis, "WebSocket");
    const originalEventSource = Object.getOwnPropertyDescriptor(globalThis, "EventSource");
    const originalXmlHttpRequest = Object.getOwnPropertyDescriptor(globalThis, "XMLHttpRequest");
    const calls = { fetch: 0, webSocket: 0, eventSource: 0, xmlHttpRequest: 0 };

    globalThis.fetch = (async () => {
      calls.fetch += 1;
      throw new Error("WebMCP site tools must not fetch.");
    }) as typeof fetch;
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      writable: true,
      value: class ForbiddenWebSocket {
        constructor() {
          calls.webSocket += 1;
          throw new Error("WebMCP site tools must not open a WebSocket.");
        }
      } as unknown as typeof WebSocket,
    });
    Object.defineProperty(globalThis, "EventSource", {
      configurable: true,
      writable: true,
      value: class ForbiddenEventSource {
        constructor() {
          calls.eventSource += 1;
          throw new Error("WebMCP site tools must not open an EventSource.");
        }
      } as unknown as typeof EventSource,
    });
    Object.defineProperty(globalThis, "XMLHttpRequest", {
      configurable: true,
      writable: true,
      value: class ForbiddenXmlHttpRequest {
        constructor() {
          calls.xmlHttpRequest += 1;
          throw new Error("WebMCP site tools must not construct XMLHttpRequest.");
        }
      } as unknown as typeof XMLHttpRequest,
    });

    try {
      const { documentLike, tools } = fakeTopLevelDocument();
      const controller = createTelephonyReadinessController();
      registerTelephonyReadinessWebMcpTools(documentLike, controller);
      const byName = toolMap(tools);

      await requiredTool(byName, "get_voice_lab_context").execute({});
      await requiredTool(byName, "configure_telephony_readiness_test").execute({
        provider: "twilio-conversation-relay",
        mode: "simulation",
        scenario: "combined-production-stress-test",
        safeguards: [],
      });
      await requiredTool(byName, "run_telephony_readiness_simulation").execute({});
      await requiredTool(byName, "get_telephony_readiness_report").execute({});
      await requiredTool(byName, "apply_telephony_lab_remediation").execute({
        remediation: "enable-token-streaming",
      });

      expect(controller.getContext()).toMatchObject({
        mode: "simulation",
        liveActionsAvailable: false,
        liveCallStatus: "No live call placed",
      });
      expect(calls).toEqual({ fetch: 0, webSocket: 0, eventSource: 0, xmlHttpRequest: 0 });
    } finally {
      globalThis.fetch = originalFetch;
      if (originalWebSocket) Object.defineProperty(globalThis, "WebSocket", originalWebSocket);
      else delete (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
      if (originalEventSource) Object.defineProperty(globalThis, "EventSource", originalEventSource);
      else delete (globalThis as { EventSource?: typeof EventSource }).EventSource;
      if (originalXmlHttpRequest) Object.defineProperty(globalThis, "XMLHttpRequest", originalXmlHttpRequest);
      else delete (globalThis as { XMLHttpRequest?: typeof XMLHttpRequest }).XMLHttpRequest;
    }
  });

  test("keeps Twilio environment examples exact, server-only, and safely ignored", () => {
    const envExample = readFileSync(join(process.cwd(), ".env.example"), "utf8");
    const gitignore = readFileSync(join(process.cwd(), ".gitignore"), "utf8");
    const twilioLines = envExample
      .split(/\r?\n/)
      .filter((line) => /^(?:NEXT_PUBLIC_)?TWILIO_[A-Z0-9_]+=/.test(line));

    expect(twilioLines).toEqual([
      "TWILIO_ACCOUNT_SID=",
      "TWILIO_AUTH_TOKEN=",
      "TWILIO_PHONE_NUMBER=",
      "TWILIO_TEST_ACCOUNT_SID=",
      "TWILIO_TEST_AUTH_TOKEN=",
      "TWILIO_MODE=simulation",
      "TWILIO_LIVE_CALLS_ENABLED=false",
    ]);
    expect(envExample).not.toMatch(/^NEXT_PUBLIC_TWILIO_/m);
    expect(gitignore).toMatch(/^\.env\*$/m);
    expect(gitignore).toMatch(/^!\.env\.example$/m);
    expect(existsSync(join(process.cwd(), ".env.local"))).toBe(false);

    const auditSource = readFileSync(join(process.cwd(), "scripts", "audit-deepgram-secrets.mjs"), "utf8");
    expect(auditSource).toMatch(/NEXT_PUBLIC_TWILIO_/);
    expect(auditSource).toMatch(/hard-coded Twilio account SID/);
    expect(auditSource).toMatch(/hard-coded Twilio auth token/);
  });
});
