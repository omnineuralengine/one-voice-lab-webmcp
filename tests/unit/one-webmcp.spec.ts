import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { ONE_WEBMCP_TOOL_NAMES } from "@/lib/one-webmcp/contracts";
import {
  createOneWebMcpController,
  type OneWebMcpController,
} from "@/lib/one-webmcp/controller";
import { createOneWebMcpProviderSnapshot } from "@/lib/one-webmcp/provider-data";
import type { OneWebMcpProviderRecord } from "@/lib/one-webmcp/provider-data";
import {
  isOneWebMcpAvailable,
  registerOneWebMcpTools,
} from "@/lib/one-webmcp/webmcp";
import {
  clearOneVisibleWorkspace,
  evidenceScopeForOneVisibleWorkspaceModule,
  isOneVisibleWorkspaceModuleId,
  ONE_VISIBLE_WORKSPACE_EVENT,
  ONE_VISIBLE_WORKSPACE_PROVIDER_ID,
  publishOneVisibleWorkspace,
  readOneVisibleWorkspaceEvent,
} from "@/lib/one-webmcp/visible-context";
import {
  ONE_PUBLIC_LAB_DESTINATIONS,
  ONE_PUBLIC_LAB_DESTINATION_IDS,
} from "@/lib/public-evidence/lab-destinations";
import { getPublicProviders } from "@/lib/public-evidence/registry";
import { createTelephonyReadinessController } from "@/lib/telephony-readiness/controller";
import {
  TELEPHONY_READINESS_WEBMCP_TOOL_NAMES,
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
  minItems?: number;
  maxItems?: number;
  maximum?: number;
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

const PROVIDERS = createOneWebMcpProviderSnapshot(getPublicProviders({}));

function fakeTopLevelDocument(registerTool?: (tool: CapturedTool) => void) {
  const tools: CapturedTool[] = [];
  const topLevelWindow: Record<string, unknown> = {};
  topLevelWindow.self = topLevelWindow;
  topLevelWindow.top = topLevelWindow;
  const documentLike = {
    defaultView: topLevelWindow,
    modelContext: {
      registerTool(tool: CapturedTool) {
        tools.push(tool);
        registerTool?.(tool);
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

function createController(pathname = "/providers", moduleId: string | null = null) {
  const navigation: string[] = [];
  const telephony = createTelephonyReadinessController();
  const controller = createOneWebMcpController({
    providers: PROVIDERS,
    initialVisibleState: {
      pathname,
      moduleId,
      workspaceProviderId: isOneVisibleWorkspaceModuleId(moduleId)
        ? ONE_VISIBLE_WORKSPACE_PROVIDER_ID
        : null,
      workspaceEvidenceScope: isOneVisibleWorkspaceModuleId(moduleId)
        ? evidenceScopeForOneVisibleWorkspaceModule(moduleId)
        : null,
      interfaceDepth: "guided",
      reducedMotion: false,
    },
    navigate: (href) => {
      navigation.push(href);
    },
    getTelephonySnapshot: () => ({
      context: telephony.getContext(),
      report: telephony.getReport(),
    }),
  });
  return { controller, navigation, telephony };
}

function registeredTools(controller: OneWebMcpController) {
  const { documentLike, tools } = fakeTopLevelDocument();
  const status = registerOneWebMcpTools(documentLike, controller);
  expect(status.state).toBe("ready");
  return { documentLike, tools, byName: toolMap(tools) };
}

test.describe("ONE-wide browser-side WebMCP bridge", () => {
  test("accepts single-use application workspace events and rejects forged events", () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const fakeWindow = new EventTarget();
    const observed: unknown[] = [];
    let lastInternalEvent: Event | null = null;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: fakeWindow,
    });
    fakeWindow.addEventListener(ONE_VISIBLE_WORKSPACE_EVENT, (event) => {
      const exposedDetail = (event as CustomEvent).detail;
      if (exposedDetail && typeof exposedDetail === "object") {
        Reflect.set(exposedDetail, "moduleId", "tts");
      }
      Reflect.defineProperty(event, "detail", {
        configurable: true,
        value: { active: false },
      });
    });
    fakeWindow.addEventListener(ONE_VISIBLE_WORKSPACE_EVENT, (event) => {
      lastInternalEvent = event;
      const detail = readOneVisibleWorkspaceEvent(event);
      if (detail) observed.push(detail);
    });

    try {
      publishOneVisibleWorkspace("audio-signal-lab");
      expect(observed).toEqual([{
        active: true,
        moduleId: "audio-signal-lab",
        providerId: "deepgram",
        evidenceScope: "provider-neutral",
      }]);
      expect(lastInternalEvent).not.toBeNull();
      expect(readOneVisibleWorkspaceEvent(lastInternalEvent!)).toBeNull();

      const forged = new CustomEvent(ONE_VISIBLE_WORKSPACE_EVENT, {
        detail: {
          active: true,
          moduleId: "tts",
          providerId: "deepgram",
          evidenceScope: "provider-specific",
        },
      });
      expect(readOneVisibleWorkspaceEvent(forged)).toBeNull();
      fakeWindow.dispatchEvent(forged);
      expect(observed).toHaveLength(1);

      clearOneVisibleWorkspace();
      expect(observed).toEqual([
        expect.objectContaining({ active: true, moduleId: "audio-signal-lab" }),
        { active: false },
      ]);
    } finally {
      if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
      else Reflect.deleteProperty(globalThis, "window");
    }
  });

  test("publishes only the six code-owned public application destinations", () => {
    expect(ONE_PUBLIC_LAB_DESTINATION_IDS).toEqual([
      "home",
      "providers",
      "evaluate",
      "build",
      "learn",
      "telephony",
    ]);
    expect(ONE_PUBLIC_LAB_DESTINATIONS.map(({ id, href }) => ({ id, href }))).toEqual([
      { id: "home", href: "/" },
      { id: "providers", href: "/providers" },
      { id: "evaluate", href: "/evaluate" },
      { id: "build", href: "/build" },
      { id: "learn", href: "/learn" },
      { id: "telephony", href: "/telephony-readiness" },
    ]);
    expect(new Set(ONE_PUBLIC_LAB_DESTINATIONS.map((item) => item.href)).size).toBe(6);
    for (const destination of ONE_PUBLIC_LAB_DESTINATIONS) {
      expect(destination.href).toMatch(/^\/(?!\/)/);
      expect(destination.href).not.toMatch(/(?:\\|\.\.|\?|#|\/api|\/mcp|\/openapi|\/llms)/);
      expect(destination.humanActions.length).toBeGreaterThan(0);
      expect(destination.agentActions.length).toBeGreaterThan(0);
      expect(destination.availabilityDetail.length).toBeGreaterThan(0);
    }
  });

  test("feature-detects unsupported and framed documents without changing application state", () => {
    const { controller } = createController();
    const before = structuredClone(controller.getSnapshot());
    const unsupported = {} as Document;
    expect(isOneWebMcpAvailable(unsupported)).toBe(false);
    expect(registerOneWebMcpTools(unsupported, controller)).toMatchObject({
      state: "unsupported",
      registeredToolNames: [],
    });

    const tools: CapturedTool[] = [];
    const frameWindow: Record<string, unknown> = {};
    frameWindow.self = frameWindow;
    frameWindow.top = {};
    const framed = {
      defaultView: frameWindow,
      modelContext: { registerTool: (tool: CapturedTool) => tools.push(tool) },
    } as unknown as Document;
    expect(isOneWebMcpAvailable(framed)).toBe(false);
    expect(registerOneWebMcpTools(framed, controller).state).toBe("unsupported");
    expect(tools).toEqual([]);
    expect(controller.getSnapshot()).toEqual(before);
  });

  test("registers five distinct tools once and keeps the first document-owned controller authoritative", async () => {
    const { documentLike, tools } = fakeTopLevelDocument();
    const first = createController("/");
    const second = createController("/providers");

    expect(registerOneWebMcpTools(documentLike, first.controller).state).toBe("ready");
    expect(registerOneWebMcpTools(documentLike, first.controller).state).toBe("ready");
    expect(registerOneWebMcpTools(documentLike, second.controller)).toMatchObject({
      state: "error",
      message: expect.stringContaining("different controller"),
    });
    expect(tools.map((tool) => tool.name)).toEqual(ONE_WEBMCP_TOOL_NAMES);
    expect(tools).toHaveLength(5);
    expect(new Set(tools.map((tool) => tool.name)).size).toBe(5);

    const result = await requiredTool(toolMap(tools), "open_one_lab").execute({ routeId: "telephony" });
    expect(first.navigation).toEqual(["/telephony-readiness"]);
    expect(second.navigation).toEqual([]);
    expect(result.structuredContent).toMatchObject({
      navigation: { status: "requested", destination: "/telephony-readiness" },
    });

    const anotherDocument = fakeTopLevelDocument();
    registerOneWebMcpTools(anotherDocument.documentLike, first.controller);
    expect(anotherDocument.tools).toHaveLength(5);
  });

  test("rejects a changed provider identity after document-owned schemas are registered", async () => {
    const { documentLike, tools } = fakeTopLevelDocument();
    const original = createController("/");
    const replacementNavigation: string[] = [];
    const replacement = createOneWebMcpController({
      providers: PROVIDERS.slice(0, -1),
      initialVisibleState: {
        pathname: "/providers",
        moduleId: null,
        interfaceDepth: "guided",
        reducedMotion: false,
      },
      navigate: (href) => {
        replacementNavigation.push(href);
      },
      getTelephonySnapshot: () => ({
        context: { scenario: "healthy-call", gateState: [], liveActionsAvailable: false },
        report: { available: false, stale: false },
      }),
    });
    expect(registerOneWebMcpTools(documentLike, original.controller).state).toBe("ready");
    expect(registerOneWebMcpTools(documentLike, replacement)).toMatchObject({
      state: "error",
      message: expect.stringContaining("provider identity changed"),
    });
    expect(tools).toHaveLength(5);

    await requiredTool(toolMap(tools), "open_one_lab").execute({ routeId: "telephony" });
    expect(original.navigation).toEqual(["/telephony-readiness"]);
    expect(replacementNavigation).toEqual([]);
  });

  test("co-registers exactly ten unique top-level tools without changing the telephony surface", () => {
    const { documentLike, tools } = fakeTopLevelDocument();
    const { controller, telephony } = createController();
    registerTelephonyReadinessWebMcpTools(documentLike, telephony);
    registerOneWebMcpTools(documentLike, controller);

    expect(TELEPHONY_READINESS_WEBMCP_TOOL_NAMES).toEqual([
      "get_voice_lab_context",
      "configure_telephony_readiness_test",
      "run_telephony_readiness_simulation",
      "get_telephony_readiness_report",
      "apply_telephony_lab_remediation",
    ]);
    expect(tools.map((tool) => tool.name)).toEqual([
      ...TELEPHONY_READINESS_WEBMCP_TOOL_NAMES,
      ...ONE_WEBMCP_TOOL_NAMES,
    ]);
    expect(new Set(tools.map((tool) => tool.name)).size).toBe(10);
  });

  test("does not retry or advertise an uncertain registration after a registerTool failure", async () => {
    const failedName = "compare_voice_providers";
    const { documentLike, tools } = fakeTopLevelDocument((tool) => {
      if (tool.name === failedName) throw new Error("synthetic registration failure");
    });
    const { controller } = createController();

    const first = registerOneWebMcpTools(documentLike, controller);
    const second = registerOneWebMcpTools(documentLike, controller);
    expect(first).toMatchObject({ state: "partial", failedToolNames: [failedName] });
    expect(second).toEqual(first);
    expect(tools.filter((tool) => tool.name === failedName)).toHaveLength(1);
    expect(tools).toHaveLength(5);
    const context = await requiredTool(toolMap(tools), "get_current_one_context").execute({});
    const actions = context.structuredContent.availableWebMcpActions as Array<{
      name: string;
      availability: string;
    }>;
    expect(actions.find((action) => action.name === failedName)?.availability).toBe("registration-failed");
    expect(context.structuredContent.registrationEvidence).toMatchObject({
      one: { state: "partial", failedToolNames: [failedName] },
    });
  });

  test("publishes strict schemas, bounded inputs, and truthful read-only annotations", async () => {
    const { controller } = createController();
    const { tools, byName } = registeredTools(controller);
    for (const tool of tools) {
      expectClosedObjectSchemas(tool.inputSchema);
      expect(tool.description.length).toBeGreaterThan(80);
    }

    for (const name of ONE_WEBMCP_TOOL_NAMES.slice(0, 4)) {
      expect(requiredTool(byName, name).annotations).toEqual({ readOnlyHint: true });
    }
    expect(requiredTool(byName, "open_one_lab").annotations).toEqual({ readOnlyHint: false });

    const find = requiredTool(byName, "find_voice_providers").inputSchema;
    expect(find.properties?.maxResults.maximum).toBe(20);
    const compare = requiredTool(byName, "compare_voice_providers").inputSchema;
    expect(compare.required).toEqual(["providerIds", "dimensions"]);
    expect(compare.properties?.providerIds.minItems).toBe(2);
    expect(compare.properties?.providerIds.maxItems).toBe(3);
    expect(compare.properties?.providerIds.uniqueItems).toBe(true);
    expect(compare.properties?.providerIds.items?.enum).toEqual(PROVIDERS.map((provider) => provider.id));

    const before = structuredClone(controller.getSnapshot());
    for (const [name, input] of [
      ["get_one_lab_map", { unknown: true }],
      ["get_current_one_context", { route: "/providers" }],
      ["find_voice_providers", { maxResults: 1, live: true }],
      ["compare_voice_providers", { providerIds: [PROVIDERS[0].id, PROVIDERS[1].id], dimensions: ["identity"], rank: true }],
      ["open_one_lab", { routeId: "providers", url: "https://example.com" }],
    ] as const) {
      const result = await requiredTool(byName, name).execute(input);
      expect(result.isError, `${name} should reject unknown properties`).toBe(true);
      expect(result.structuredContent).toMatchObject({ ok: false, error: { code: "invalid_input" } });
      expectResultTextMatchesStructure(result);
    }
    expect(controller.getSnapshot()).toEqual(before);
  });

  test("reads the lab map and visible context without mutating state", async () => {
    const { controller, telephony } = createController("/telephony-readiness");
    const { byName } = registeredTools(controller);
    const before = structuredClone(controller.getSnapshot());

    const mapResult = await requiredTool(byName, "get_one_lab_map").execute({
      goal: "evaluate-customer-support-voice-agent",
    });
    expect(mapResult.structuredContent).toMatchObject({
      currentRouteId: "telephony",
      suggestedNextLab: { id: "evaluate", basis: "explicit-goal" },
      externalActionsAvailable: false,
    });

    const contextResult = await requiredTool(byName, "get_current_one_context").execute({});
    expect(contextResult.structuredContent).toMatchObject({
      currentRoute: { pathname: "/telephony-readiness", routeId: "telephony" },
      selectedScenario: telephony.getContext().scenario,
      visibleEvidenceState: { kind: "telephony-readiness", provenance: "simulated" },
      externalActionsAvailable: false,
      consequentialActionsRemainHumanControlled: true,
      registrationEvidence: {
        one: { state: "ready" },
        telephony: { state: "pending", registeredToolNames: [], failedToolNames: [] },
      },
    });
    expect(controller.getSnapshot()).toEqual(before);
    expectResultTextMatchesStructure(mapResult);
    expectResultTextMatchesStructure(contextResult);
  });

  test("isolates returned route and provider data from authoritative application state", async () => {
    const { controller, navigation } = createController("/providers");
    const { byName } = registeredTools(controller);
    const mapResult = await requiredTool(byName, "get_one_lab_map").execute({});
    const labs = mapResult.structuredContent.labs as Array<{ id: string; href: string; agentActions: string[] }>;
    labs[0].href = "https://untrusted.example";
    labs[0].agentActions.push("untrusted_action");

    const providerResult = await requiredTool(byName, "find_voice_providers").execute({
      query: "deepgram",
      maxResults: 1,
    });
    const providers = providerResult.structuredContent.providers as Array<{
      profilePath: string;
      unknowns: string[];
    }>;
    providers[0].profilePath = "https://untrusted.example/provider";
    providers[0].unknowns.push("fabricated");

    const navigationResult = await requiredTool(byName, "open_one_lab").execute({ routeId: "home" });
    expect(navigation).toEqual(["/"]);
    expect(navigationResult.structuredContent).toMatchObject({
      destination: { href: "/" },
      navigation: { destination: "/" },
    });
    const mapAgain = await requiredTool(byName, "get_one_lab_map").execute({});
    expect((mapAgain.structuredContent.labs as Array<{ href: string }>)[0].href).toBe("/");
    const providerAgain = await requiredTool(byName, "find_voice_providers").execute({
      query: "deepgram",
      maxResults: 1,
    });
    expect(providerAgain.structuredContent.providers).toEqual([
      expect.objectContaining({
        profilePath: "/providers/deepgram",
        unknowns: expect.not.arrayContaining(["fabricated"]),
      }),
    ]);
    expect(Object.isFrozen(ONE_PUBLIC_LAB_DESTINATIONS)).toBe(true);
    expect(Object.isFrozen(ONE_PUBLIC_LAB_DESTINATIONS[0])).toBe(true);
    expect(Object.isFrozen(PROVIDERS[0])).toBe(true);
    expect(Object.isFrozen(PROVIDERS[0].capabilities)).toBe(true);
  });

  test("keeps query modules home-scoped and recognizes nested provider workspaces", async () => {
    const rootModule = createController("/", "tts");
    expect(rootModule.controller.getCurrentContext()).toMatchObject({
      currentRoute: { routeId: "home" },
      currentLabOrModule: "tts",
      selectedProvider: { id: "deepgram", name: "Deepgram" },
      visibleEvidenceState: { kind: "provider-workspace", providerId: "deepgram" },
    });
    await rootModule.controller.openLab({ routeId: "home" });
    expect(rootModule.navigation).toEqual(["/"]);
    expect(rootModule.controller.getSnapshot().latestNavigation).toMatchObject({ status: "requested" });
    rootModule.controller.syncVisibleState({
      pathname: "/",
      moduleId: "upload-audio",
      interfaceDepth: "guided",
      reducedMotion: false,
    });
    expect(rootModule.controller.getSnapshot().latestNavigation).toMatchObject({
      source: "human-ui",
      destination: "/",
      status: "arrived",
      message: expect.stringContaining("module=upload-audio"),
    });
    await rootModule.controller.openLab({ routeId: "home" });
    rootModule.controller.syncVisibleState({
      pathname: "/",
      moduleId: null,
      interfaceDepth: "guided",
      reducedMotion: false,
    });
    expect(rootModule.controller.getSnapshot().latestNavigation).toMatchObject({ status: "arrived" });

    const unrelatedQuery = createController("/providers", "tts");
    expect(unrelatedQuery.controller.getCurrentContext().currentLabOrModule).toBe("providers");
    expect(unrelatedQuery.controller.getSnapshot().visible.moduleId).toBeNull();

    const nestedProvider = createController("/providers/elevenlabs/api-studio");
    expect(nestedProvider.controller.getCurrentContext()).toMatchObject({
      currentRoute: { routeId: "providers" },
      selectedProvider: { id: "elevenlabs", name: "ElevenLabs" },
      visibleEvidenceState: { kind: "provider-profile", providerId: "elevenlabs" },
    });

    const operationOnly = createController("/");
    operationOnly.controller.syncVisibleState({
      pathname: "/",
      moduleId: null,
      legacyWorkspaceActive: true,
      workspaceProviderId: "deepgram",
      workspaceEvidenceScope: "provider-specific",
      interfaceDepth: "guided",
      reducedMotion: false,
    });
    expect(operationOnly.controller.getCurrentContext()).toMatchObject({
      currentLabOrModule: "deepgram-workspace",
      selectedProvider: { id: "deepgram" },
      visibleEvidenceState: { kind: "provider-workspace", providerId: "deepgram" },
      latestNavigation: { source: "human-ui", destination: "/" },
    });

    const neutralModule = createController("/");
    neutralModule.controller.syncVisibleState({
      pathname: "/",
      moduleId: "audio-signal-lab",
      legacyWorkspaceActive: true,
      workspaceProviderId: "deepgram",
      workspaceEvidenceScope: "provider-neutral",
      interfaceDepth: "guided",
      reducedMotion: false,
    });
    expect(neutralModule.controller.getCurrentContext()).toMatchObject({
      currentLabOrModule: "audio-signal-lab",
      selectedProvider: { id: "deepgram" },
      visibleEvidenceState: {
        kind: "provider-neutral-workspace",
        workspaceProviderId: "deepgram",
        evidenceScope: "provider-neutral",
      },
    });
  });

  test("searches the existing public registry deterministically while preserving provenance and unknowns", async () => {
    const { controller } = createController();
    const { byName } = registeredTools(controller);
    const before = structuredClone(controller.getSnapshot());

    const first = await requiredTool(byName, "find_voice_providers").execute({ maxResults: 3 });
    const second = await requiredTool(byName, "find_voice_providers").execute({ maxResults: 3 });
    expect(second.structuredContent).toEqual(first.structuredContent);
    expect(first.structuredContent).toMatchObject({
      returned: 3,
      truncated: true,
      ordering: "Stable provider identifier; this order is not a ranking.",
      dataScope: expect.stringContaining("policy-neutral"),
      providerRequestsMade: 0,
    });
    const returnedProviders = first.structuredContent.providers as readonly Readonly<{
      id: string;
      evidence: unknown;
      unknowns: readonly string[];
    }>[];
    expect(returnedProviders.map((provider) => provider.id)).toEqual(PROVIDERS.slice(0, 3).map((provider) => provider.id));
    for (const provider of returnedProviders) {
      expect(provider.evidence).toBeDefined();
      expect(provider.unknowns.length).toBeGreaterThan(0);
    }
    expect(JSON.stringify(first.structuredContent)).not.toMatch(/readinessState|readinessExplanation|configured-not-runtime-verified|live-enabled/);

    const twilio = await requiredTool(byName, "find_voice_providers").execute({
      query: "twilio",
      maxResults: 5,
    });
    expect(twilio.structuredContent).toMatchObject({ totalMatched: 1, returned: 1 });
    expect(twilio.structuredContent.providers).toEqual([
      expect.objectContaining({
        id: "twilio",
        kind: "voice-stack-infrastructure",
        supportedFacts: [],
        evidence: expect.objectContaining({ metadataVerification: "unverified" }),
        unknowns: expect.arrayContaining([
          expect.stringContaining("absence is unknown, not unsupported"),
          expect.stringContaining("not eligible for speech-provider ranking"),
        ]),
      }),
    ]);

    const capable = await requiredTool(byName, "find_voice_providers").execute({
      supportedCapability: "stt.streaming",
      maxResults: 20,
    });
    for (const provider of capable.structuredContent.providers as readonly Readonly<{
      supportedFacts: readonly Readonly<{ id: string; support: string }>[];
    }>[]) {
      expect(provider.supportedFacts.every((fact) => fact.id === "stt.streaming" && fact.support === "supported")).toBe(true);
    }
    expect(controller.getSnapshot()).toEqual(before);
  });

  test("applies an evidence requirement to the same capability fact being filtered", () => {
    const base = PROVIDERS.find((provider) => provider.id === "deepgram")!;
    const supported = base.capabilities.filter((capability) => capability.support === "supported");
    expect(supported.length).toBeGreaterThanOrEqual(2);
    const mutable: OneWebMcpProviderRecord = {
      ...base,
      capabilities: base.capabilities.map((capability) => {
        if (capability.id === supported[0].id) {
          return { ...capability, verification: "provider-documented" };
        }
        if (capability.id === supported[1].id) {
          return { ...capability, verification: "unverified" };
        }
        return capability;
      }),
    };
    const controller = createOneWebMcpController({
      providers: [mutable],
      initialVisibleState: {
        pathname: "/providers",
        moduleId: null,
        interfaceDepth: "guided",
        reducedMotion: false,
      },
      navigate: () => undefined,
      getTelephonySnapshot: () => ({
        context: { scenario: "healthy-call", gateState: [], liveActionsAvailable: false },
        report: { available: false, stale: false },
      }),
    });

    expect(controller.findProviders({
      supportedCapability: supported[0].id,
      evidenceRequirement: "unverified",
      maxResults: 10,
    }).returned).toBe(0);
    expect(controller.findProviders({
      supportedCapability: supported[1].id,
      evidenceRequirement: "unverified",
      maxResults: 10,
    })).toMatchObject({
      returned: 1,
      providers: [
        expect.objectContaining({
          supportedFacts: [expect.objectContaining({ id: supported[1].id, verification: "unverified" })],
        }),
      ],
    });
  });

  test("compares only two or three known providers and never fabricates a winner", async () => {
    const { controller } = createController();
    const { byName } = registeredTools(controller);
    const compare = requiredTool(byName, "compare_voice_providers");
    const deepgram = PROVIDERS.find((provider) => provider.id === "deepgram")!;
    const twilio = PROVIDERS.find((provider) => provider.id === "twilio")!;
    const before = structuredClone(controller.getSnapshot());

    const result = await compare.execute({
      providerIds: [deepgram.id, twilio.id],
      dimensions: ["identity", "capabilities", "evidence", "integration", "benchmark-eligibility"],
    });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      comparisonType: "registry_evidence_only",
      dataScope: expect.stringContaining("policy-neutral"),
      providerIds: ["deepgram", "twilio"],
      rankingProvided: false,
      winner: null,
      inferenceUsed: false,
      providerRequestsMade: 0,
    });
    expect(JSON.stringify(result.structuredContent)).not.toMatch(/"(?:score|rank)"\s*:/i);
    expect(JSON.stringify(result.structuredContent)).toContain("absence is unknown, not unsupported");
    const dimensions = result.structuredContent.dimensions as Array<{
      id: string;
      values: Array<{ provenance: Array<{ title: string; url: string }>; facts: Record<string, unknown> }>;
    }>;
    const integration = dimensions.find((dimension) => dimension.id === "integration")!;
    expect(integration.values[0].provenance).toEqual([
      expect.objectContaining({
        title: "ONE Voice Lab local provider-platform projection",
        url: "/providers/deepgram",
      }),
    ]);
    const benchmark = dimensions.find((dimension) => dimension.id === "benchmark-eligibility")!;
    const benchmarkFacts = benchmark.values[0].facts.capabilityBenchmarkEligibility as Array<{
      capabilityId: string;
      provenance: unknown[];
    }>;
    expect(benchmarkFacts.length).toBeGreaterThan(0);
    expect(benchmarkFacts.every((fact) => fact.capabilityId.length > 0 && fact.provenance.length > 0)).toBe(true);
    const evidence = dimensions.find((dimension) => dimension.id === "evidence") as typeof dimensions[number] & {
      missingOrIncomparable: string[];
    };
    expect(evidence.missingOrIncomparable).toContain("twilio: provider metadata is unverified.");
    expect(evidence.missingOrIncomparable).toContain(
      "twilio: capability evidence is unavailable; absence is unknown, not unverified or unsupported.",
    );
    expect(evidence.missingOrIncomparable.join(" ")).not.toContain(
      "provider metadata and capability evidence are unverified",
    );
    expectResultTextMatchesStructure(result);

    for (const invalid of [
      { providerIds: [deepgram.id], dimensions: ["identity"] },
      { providerIds: [deepgram.id, deepgram.id], dimensions: ["identity"] },
      { providerIds: [deepgram.id, twilio.id, PROVIDERS[2].id, PROVIDERS[3].id], dimensions: ["identity"] },
      { providerIds: [deepgram.id, "not-a-provider"], dimensions: ["identity"] },
    ]) {
      const invalidResult = await compare.execute(invalid);
      expect(invalidResult.isError).toBe(true);
      expect(invalidResult.structuredContent).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    }
    expect(controller.getSnapshot()).toEqual(before);
  });

  test("restricts navigation to stable route identifiers and verifies arrival from application state", async () => {
    const { controller, navigation } = createController("/");
    const { byName } = registeredTools(controller);
    const open = requiredTool(byName, "open_one_lab");

    for (const destination of ONE_PUBLIC_LAB_DESTINATIONS) {
      const beforeCount = navigation.length;
      const result = await open.execute({ routeId: destination.id });
      if (destination.href === "/") {
        expect(navigation).toHaveLength(beforeCount);
        expect(result.structuredContent).toMatchObject({ navigation: { status: "already-open" } });
      } else {
        expect(navigation.at(-1)).toBe(destination.href);
        expect(result.structuredContent).toMatchObject({
          navigation: { status: "requested", destination: destination.href },
          sideEffects: {
            localNavigationOnly: true,
            externalRequestInitiated: false,
            providerActionInitiated: false,
            credentialsChanged: false,
            persistedUserDataChanged: false,
          },
        });
      }
    }

    const beforeInvalid = navigation.length;
    for (const input of [
      { routeId: "https://example.com" },
      { routeId: "//example.com" },
      { routeId: "../providers" },
      { routeId: "/api/providers" },
      { routeId: "providers", url: "javascript:alert(1)" },
    ]) {
      expect((await open.execute(input)).isError).toBe(true);
    }
    expect(navigation).toHaveLength(beforeInvalid);

    controller.syncVisibleState({
      pathname: "/telephony-readiness",
      moduleId: null,
      interfaceDepth: "guided",
      reducedMotion: false,
    });
    expect(controller.getCurrentContext()).toMatchObject({
      currentRoute: { routeId: "telephony" },
      latestNavigation: { source: "webmcp-agent", destination: "/telephony-readiness", status: "arrived" },
    });
  });

  test("keeps the newest allowlisted navigation authoritative and coalesces duplicates", async () => {
    const { controller, navigation } = createController("/");

    await controller.openLab({ routeId: "providers" });
    const home = await controller.openLab({ routeId: "home" });

    expect(navigation).toEqual(["/providers", "/"]);
    expect(home).toMatchObject({
      navigation: { routeId: "home", status: "arrived" },
      requestDisposition: "new-navigation-request",
      sideEffects: { sameOriginNavigationRequested: true },
    });
    expect(controller.getSnapshot().latestNavigation).toEqual(home.navigation);

    let releaseNavigation!: () => void;
    let pendingNavigateCalls = 0;
    const pendingNavigation = new Promise<void>((resolve) => {
      releaseNavigation = resolve;
    });
    const pendingController = createOneWebMcpController({
      providers: PROVIDERS,
      initialVisibleState: {
        pathname: "/",
        moduleId: null,
        interfaceDepth: "guided",
        reducedMotion: false,
      },
      navigate: () => {
        pendingNavigateCalls += 1;
        return pendingNavigation;
      },
      getTelephonySnapshot: () => ({
        context: { scenario: "healthy-call", gateState: [], liveActionsAvailable: false },
        report: { available: false, stale: false },
      }),
    });
    const firstRequest = pendingController.openLab({ routeId: "providers" });
    const duplicateRequest = await pendingController.openLab({ routeId: "providers" });
    expect(duplicateRequest).toMatchObject({
      navigation: { routeId: "providers", status: "requested" },
      requestDisposition: "coalesced-existing-request",
      sideEffects: { sameOriginNavigationRequested: false },
    });
    expect(pendingNavigateCalls).toBe(1);
    releaseNavigation();
    await firstRequest;

    const alreadyOpen = await controller.openLab({ routeId: "home" });
    expect(alreadyOpen).toMatchObject({
      navigation: { status: "already-open" },
      requestDisposition: "already-open",
      sideEffects: { sameOriginNavigationRequested: false },
    });
  });

  test("redacts unlisted dynamic routes and never echoes private path segments", async () => {
    const privateCode = "S3CR3T";
    const { controller, navigation } = createController(`/architecture-studio/session/${privateCode}`);
    const { byName } = registeredTools(controller);
    const context = await requiredTool(byName, "get_current_one_context").execute({});
    expect(context.structuredContent).toMatchObject({
      currentRoute: {
        pathname: null,
        routeId: null,
        disclosure: "redacted-unlisted",
      },
    });
    expect(JSON.stringify(context.structuredContent)).not.toContain(privateCode);

    const opened = await requiredTool(byName, "open_one_lab").execute({ routeId: "providers" });
    expect(navigation).toEqual(["/providers"]);
    expect(opened.structuredContent).toMatchObject({
      navigation: { fromPathname: null, destination: "/providers" },
    });
    expect(JSON.stringify(opened.structuredContent)).not.toContain(privateCode);

    const humanTransition = createController(`/architecture-studio/session/${privateCode}`);
    humanTransition.controller.syncVisibleState({
      pathname: "/providers/deepgram/api-studio",
      moduleId: null,
      interfaceDepth: "guided",
      reducedMotion: false,
    });
    expect(humanTransition.controller.getCurrentContext()).toMatchObject({
      currentRoute: { pathname: "/providers/deepgram", routeId: "providers" },
      latestNavigation: {
        source: "human-ui",
        fromPathname: null,
        destination: "/providers/deepgram",
      },
    });
    expect(JSON.stringify(humanTransition.controller.getCurrentContext())).not.toContain(privateCode);
  });

  test("records a failed local navigation without claiming arrival", async () => {
    const controller = createOneWebMcpController({
      providers: PROVIDERS,
      initialVisibleState: {
        pathname: "/",
        moduleId: null,
        interfaceDepth: "guided",
        reducedMotion: false,
      },
      navigate: () => {
        throw new Error("synthetic local navigation failure");
      },
      getTelephonySnapshot: () => ({
        context: { scenario: "healthy-call", gateState: [], liveActionsAvailable: false },
        report: { available: false, stale: false },
      }),
    });
    const { byName } = registeredTools(controller);
    const result = await requiredTool(byName, "open_one_lab").execute({ routeId: "providers" });
    expect(result).toMatchObject({
      isError: true,
      structuredContent: { ok: false, error: { code: "local_execution_failed" } },
    });
    expect(controller.getSnapshot().latestNavigation).toMatchObject({
      source: "webmcp-agent",
      destination: "/providers",
      status: "failed",
    });
    expect(controller.getCurrentContext().latestNavigation).not.toMatchObject({ status: "arrived" });
  });

  test("keeps the newest navigation authoritative when an older request rejects late", async () => {
    type Deferred = {
      resolve(): void;
      reject(error: Error): void;
      promise: Promise<void>;
    };
    function deferred(): Deferred {
      let resolve!: () => void;
      let reject!: (error: Error) => void;
      const promise = new Promise<void>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      });
      return { resolve, reject, promise };
    }
    const providerRequest = deferred();
    const evaluateRequest = deferred();
    const controller = createOneWebMcpController({
      providers: PROVIDERS,
      initialVisibleState: {
        pathname: "/",
        moduleId: null,
        interfaceDepth: "guided",
        reducedMotion: false,
      },
      navigate: (href) => href === "/providers" ? providerRequest.promise : evaluateRequest.promise,
      getTelephonySnapshot: () => ({
        context: { scenario: "healthy-call", gateState: [], liveActionsAvailable: false },
        report: { available: false, stale: false },
      }),
    });

    const older = controller.openLab({ routeId: "providers" });
    const olderHandled = older.catch((error: unknown) => error);
    const newer = controller.openLab({ routeId: "evaluate" });
    expect(controller.getSnapshot().latestNavigation).toMatchObject({
      routeId: "evaluate",
      status: "requested",
    });
    providerRequest.reject(new Error("late failure"));
    expect(await olderHandled).toBeInstanceOf(Error);
    expect(controller.getSnapshot().latestNavigation).toMatchObject({
      routeId: "evaluate",
      status: "requested",
    });
    evaluateRequest.resolve();
    await newer;
    controller.syncVisibleState({
      pathname: "/evaluate",
      moduleId: null,
      interfaceDepth: "guided",
      reducedMotion: false,
    });
    expect(controller.getSnapshot().latestNavigation).toMatchObject({
      routeId: "evaluate",
      status: "arrived",
    });
  });

  test("executes every valid ONE-wide tool without a browser transport or provider path", async () => {
    const originalFetch = globalThis.fetch;
    const descriptors = new Map<string, PropertyDescriptor | undefined>();
    const calls = { fetch: 0, webSocket: 0, eventSource: 0, xmlHttpRequest: 0, sendBeacon: 0 };
    globalThis.fetch = (async () => {
      calls.fetch += 1;
      throw new Error("ONE-wide site tools must not fetch.");
    }) as typeof fetch;
    for (const [name, counter] of [
      ["WebSocket", "webSocket"],
      ["EventSource", "eventSource"],
      ["XMLHttpRequest", "xmlHttpRequest"],
    ] as const) {
      descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
      Object.defineProperty(globalThis, name, {
        configurable: true,
        writable: true,
        value: class ForbiddenTransport {
          constructor() {
            calls[counter] += 1;
            throw new Error(`${name} is forbidden in ONE-wide site tools.`);
          }
        },
      });
    }
    const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    const existingNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        ...existingNavigator,
        sendBeacon() {
          calls.sendBeacon += 1;
          throw new Error("sendBeacon is forbidden in ONE-wide site tools.");
        },
      },
    });

    try {
      const { controller } = createController();
      const { byName } = registeredTools(controller);
      await requiredTool(byName, "get_one_lab_map").execute({});
      await requiredTool(byName, "get_current_one_context").execute({});
      await requiredTool(byName, "find_voice_providers").execute({ maxResults: 2 });
      await requiredTool(byName, "compare_voice_providers").execute({
        providerIds: [PROVIDERS[0].id, PROVIDERS[1].id],
        dimensions: ["identity"],
      });
      await requiredTool(byName, "open_one_lab").execute({ routeId: "telephony" });
      expect(calls).toEqual({ fetch: 0, webSocket: 0, eventSource: 0, xmlHttpRequest: 0, sendBeacon: 0 });
    } finally {
      globalThis.fetch = originalFetch;
      for (const [name, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete (globalThis as Record<string, unknown>)[name];
      }
      if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
      else delete (globalThis as { navigator?: Navigator }).navigator;
    }
  });

  test("keeps browser modules credential-free and outside remote MCP and action execution paths", () => {
    const browserPaths = [
      ["src", "lib", "one-webmcp", "contracts.ts"],
      ["src", "lib", "one-webmcp", "controller.ts"],
      ["src", "lib", "one-webmcp", "provider-data.ts"],
      ["src", "lib", "one-webmcp", "visible-context.ts"],
      ["src", "lib", "one-webmcp", "webmcp.ts"],
      ["src", "components", "one-webmcp", "OneWebMcpProvider.tsx"],
      ["src", "lib", "public-evidence", "lab-destinations.ts"],
    ] as const;
    const source = browserPaths
      .map((parts) => readFileSync(join(process.cwd(), ...parts), "utf8"))
      .join("\n");
    expect(source).not.toMatch(/NEXT_PUBLIC_(?:TWILIO|DEEPGRAM|ELEVENLABS|FISH_AUDIO|CARTESIA|RESON8)/);
    expect(source).not.toMatch(/TWILIO_(?:ACCOUNT_SID|AUTH_TOKEN|PHONE_NUMBER|TEST_ACCOUNT_SID|TEST_AUTH_TOKEN)/);
    expect(source).not.toMatch(/\b(?:fetch|WebSocket|EventSource|XMLHttpRequest)\s*\(|navigator\.sendBeacon|["']use server["']|\/api\//);
    expect(source).not.toMatch(/providers\/(?:adapters|deepgram|elevenlabs|fish-audio|cartesia|reson8)/);

    const remoteMcp = readFileSync(join(process.cwd(), "src", "lib", "public-evidence", "mcp.ts"), "utf8");
    const actionRegistry = readFileSync(join(process.cwd(), "src", "lib", "actions", "registry.ts"), "utf8");
    for (const name of ONE_WEBMCP_TOOL_NAMES) {
      expect(remoteMcp).not.toContain(name);
      expect(actionRegistry).not.toContain(name);
    }
  });
});
