import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import {
  createVoiceReplayController,
} from "@/lib/simulations/webmcp-controller";
import {
  VOICE_REPLAY_WEBMCP_TOOL_NAMES,
} from "@/lib/simulations/webmcp-contracts";
import {
  isVoiceReplayWebMcpAvailable,
  registerVoiceReplayWebMcpTools,
  type VoiceReplayWebMcpToolDefinition,
  type VoiceReplayWebMcpToolResult,
} from "@/lib/simulations/webmcp";

type CapturedTool = VoiceReplayWebMcpToolDefinition;

function activeController() {
  const controller = createVoiceReplayController();
  controller.setPathname("/simulation-lab");
  controller.setLabMounted(true);
  return controller;
}

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

function toolByName(tools: readonly CapturedTool[], name: string) {
  const tool = tools.find((candidate) => candidate.name === name);
  expect(tool, `expected ${name} to be registered`).toBeDefined();
  return tool!;
}

function parsed(result: VoiceReplayWebMcpToolResult) {
  expect(result.content).toHaveLength(1);
  expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
  return result.structuredContent;
}

test.describe("human-authorized deterministic replay WebMCP", () => {
  test("registers only the exact four closed-schema tools once for a top-level document", async () => {
    const { documentLike, tools } = fakeTopLevelDocument();
    const controller = activeController();

    expect(isVoiceReplayWebMcpAvailable(documentLike)).toBe(true);
    const first = registerVoiceReplayWebMcpTools(documentLike, controller);
    const second = registerVoiceReplayWebMcpTools(documentLike, controller);

    expect(first.status.state).toBe("ready");
    expect(second.status.state).toBe("ready");
    expect(tools.map((tool) => tool.name)).toEqual(VOICE_REPLAY_WEBMCP_TOOL_NAMES);
    expect(new Set(tools.map((tool) => tool.name)).size).toBe(4);
    for (const tool of tools) {
      expect(tool.inputSchema.additionalProperties).toBe(false);
    }

    const before = structuredClone(controller.getSnapshot());
    const list = await toolByName(tools, "list_voice_scenarios").execute({});
    expect(list.isError).toBeUndefined();
    expect(parsed(list)).toMatchObject({
      mode: "deterministic-local-replay",
      executionBoundary: { providerRequests: 0, providerSpend: 0, humanAuthorizationRequired: true },
    });
    expect(controller.getSnapshot()).toEqual(before);

    first.release();
    second.release();
  });

  test("requires and consumes a human authorization for the exact visible plan", async () => {
    const { documentLike, tools } = fakeTopLevelDocument();
    const controller = activeController();
    registerVoiceReplayWebMcpTools(documentLike, controller);
    const prepare = toolByName(tools, "prepare_voice_replay");
    const run = toolByName(tools, "run_voice_replay");
    const evidence = toolByName(tools, "get_voice_replay_evidence");

    const prepared = await prepare.execute({
      scenarioId: "target-speaker-vs-world",
      templateId: "contact-center",
      impairment: "crosstalk",
      runCount: 1,
    });
    expect(prepared.isError).toBeUndefined();
    const planId = parsed(prepared).plan as { id: string };
    expect(controller.getSnapshot().authorization.state).toBe("awaiting-human");

    expect(parsed(await run.execute({ planId: planId.id }))).toMatchObject({
      ok: false,
      error: { code: "authorization_required" },
    });

    controller.authorize(planId.id);
    const completed = await run.execute({ planId: planId.id });
    expect(completed.isError).toBeUndefined();
    expect(parsed(completed)).toMatchObject({
      ok: true,
      planId: planId.id,
      runState: "completed",
      evidence: { usage: { providerRequestCount: 0, audioSecondsSubmitted: 0 } },
    });
    expect(controller.getSnapshot().authorization.state).toBe("consumed");

    const readBefore = structuredClone(controller.getSnapshot());
    expect(parsed(await evidence.execute({}))).toMatchObject({ ok: true, planId: planId.id });
    expect(controller.getSnapshot()).toEqual(readBefore);
    expect(parsed(await run.execute({ planId: planId.id }))).toMatchObject({
      ok: false,
      error: { code: "authorization_consumed" },
    });
    expect(parsed(await prepare.execute({
      scenarioId: "target-speaker-vs-world",
      templateId: "contact-center",
      impairment: "crosstalk",
      runCount: 1,
      extra: true,
    }))).toMatchObject({ ok: false, error: { code: "invalid_input" } });
  });

  test("invalidates on navigation and consumes authorization when an in-flight replay is cancelled", async () => {
    const controller = activeController();
    const plan = controller.prepare({
      scenarioId: "target-speaker-vs-world",
      templateId: "contact-center",
      impairment: "network-reconnect",
      runCount: 1,
    }).plan;
    controller.authorize(plan.id);
    controller.setPathname("/providers");
    expect(controller.getSnapshot().authorization).toMatchObject({ state: "invalidated" });

    controller.setPathname("/simulation-lab");
    const retryPlan = controller.prepare({
      scenarioId: "target-speaker-vs-world",
      templateId: "contact-center",
      impairment: "network-reconnect",
      runCount: 1,
    }).plan;
    controller.authorize(retryPlan.id);
    const abortController = new AbortController();
    const pending = controller.run({ planId: retryPlan.id }, abortController.signal);
    abortController.abort();
    await expect(pending).rejects.toMatchObject({
      code: "replay_cancelled",
    });
    expect(controller.getSnapshot()).toMatchObject({
      authorization: { state: "consumed" },
      runState: "cancelled",
    });
  });

  test("keeps the mounted Simulation Lab human-visible and browser-transport-free", async () => {
    const page = readFileSync(join(process.cwd(), "src", "app", "simulation-lab", "page.tsx"), "utf8");
    const browserSource = [
      "src/lib/simulations/webmcp.ts",
      "src/lib/simulations/webmcp-controller.ts",
      "src/lib/simulations/replay.ts",
    ].map((path) => readFileSync(join(process.cwd(), path), "utf8")).join("\n");

    expect(page).toContain("<VoiceReplayWebMcpProvider>");
    expect(page).toContain("<VoiceReplayAgentAccess />");
    expect(browserSource).not.toMatch(/\bfetch\s*\(|new\s+WebSocket|navigator\.mediaDevices|XMLHttpRequest|EventSource|\/api\//);

    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      throw new Error("Deterministic replay must not fetch.");
    }) as typeof fetch;
    try {
      const controller = activeController();
      const plan = controller.prepare({
        scenarioId: "target-speaker-vs-world",
        templateId: "contact-center",
        impairment: "none",
        runCount: 1,
      }).plan;
      controller.authorize(plan.id);
      await controller.run({ planId: plan.id });
      expect(fetchCalls).toBe(0);
      expect(controller.getEvidence()).toMatchObject({
        evidenceBoundary: { providerRequestsMade: 0, providerSpend: 0, microphoneAccess: false, telephonyActions: false },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
