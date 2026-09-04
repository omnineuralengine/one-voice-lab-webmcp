import { expect, test } from "@playwright/test";

import { VoiceLabActionRuntime } from "@/lib/actions/client-runtime";
import {
  ACTION_DEFINITIONS,
  ACTION_REGISTRY,
  AGENT_ACTION_ALLOWLIST,
  getActionDefinition,
  getAgentActionMetadata,
  isActionName,
} from "@/lib/actions/registry";
import {
  executePublicServerAction,
  PUBLIC_SERVER_ACTION_NAMES,
} from "@/lib/actions/server/executor";

const TEST_ENVIRONMENT = {
  NEXT_PUBLIC_SITE_URL: "https://one-voice-lab.example",
  ONE_LIVE_EVALS_ENABLED: "false",
  ONE_LIVE_EVALS_ANONYMOUS_ENABLED: "false",
} as const;

function deterministicExecution(invocationId: string) {
  let monotonicTime = 100;
  return {
    createInvocationId: () => invocationId,
    now: () => new Date("2026-08-26T12:00:00.000Z"),
    monotonicNow: () => monotonicTime++,
  };
}

test.describe("action registry contracts", () => {
  test("publishes unique, complete metadata next to executable schemas", () => {
    const definitionNames = Object.keys(ACTION_DEFINITIONS);
    const registryNames = ACTION_REGISTRY.map((action) => action.name);

    expect(registryNames).toEqual(definitionNames);
    expect(new Set(registryNames).size).toBe(registryNames.length);

    for (const name of definitionNames) {
      expect(isActionName(name)).toBe(true);
      const definition = getActionDefinition(name as keyof typeof ACTION_DEFINITIONS);
      const metadata = definition.metadata;

      expect(metadata.name).toBe(name);
      expect(metadata.description.trim().length).toBeGreaterThan(12);
      expect(metadata.authentication).toMatch(/^(none|optional|required)$/);
      expect(metadata.trust.length).toBeGreaterThan(0);
      expect(metadata.surfaces.length).toBeGreaterThan(0);
      expect(metadata.usage.note.trim().length).toBeGreaterThan(0);
      expect(metadata.implementation).toMatch(/^(action-backed|dedicated-service|client-bridge)$/);
      expect(new Set(metadata.requiredInputs.map((field) => field.name)).size).toBe(metadata.requiredInputs.length);
      expect(new Set(metadata.outputShape.map((field) => field.name)).size).toBe(metadata.outputShape.length);

      for (const field of [...metadata.requiredInputs, ...metadata.outputShape]) {
        expect(field.name.trim()).not.toBe("");
        expect(field.type.trim()).not.toBe("");
        expect(field.description.trim()).not.toBe("");
        expect(typeof field.required).toBe("boolean");
      }

      expect(typeof definition.inputSchema.safeParse).toBe("function");
      expect(typeof definition.outputSchema.safeParse).toBe("function");
    }

    expect(isActionName("administration.rotateProviderKey")).toBe(false);
    expect(ACTION_DEFINITIONS["providers.list"].inputSchema.safeParse({}).success).toBe(true);
    expect(ACTION_DEFINITIONS["providers.list"].inputSchema.safeParse({ extra: true }).success).toBe(false);
    expect(ACTION_DEFINITIONS["providers.compareEvidence"].inputSchema.safeParse({
      providerIds: ["deepgram", "deepgram"],
    }).success).toBe(false);
    expect(ACTION_DEFINITIONS["recording.start"].inputSchema.safeParse({
      surface: "live-mic",
    }).success).toBe(false);
  });

  test("keeps every provider-usage action behind confirmation and a durable or trusted-local boundary", () => {
    const paidActions = ACTION_REGISTRY.filter((action) => action.usage.kind === "provider-usage");

    expect(paidActions.length).toBeGreaterThan(0);
    for (const action of paidActions) {
      expect(action.usage.confirmationRequired).toBe(true);
      expect(action.trust).toContain("explicit-human-confirmation");
      expect(
        action.trust.includes("durable-usage-gate") || action.trust.includes("trusted-local"),
      ).toBe(true);
      expect(action.agentExposable).toBe(false);
      expect(action.surfaces).not.toContain("mcp");
      expect(action.surfaces).not.toContain("automation");
    }

    const protectedLive = getActionDefinition("evaluation.runProtectedLive").metadata;
    expect(protectedLive.authentication).toBe("optional");
    expect(protectedLive.trust).toContain("durable-usage-gate");
    expect(protectedLive.trust).not.toContain("member-session");
    expect(protectedLive.trust).not.toContain("trusted-local");

    const localLive = getActionDefinition("evaluation.runLocalLive").metadata;
    expect(localLive.authentication).toBe("none");
    expect(localLive.trust).toContain("trusted-local");
    expect(localLive.trust).not.toContain("member-session");
    expect(localLive.trust).not.toContain("durable-usage-gate");
  });

  test("uses one explicit, nonbillable allowlist for agents and automation", () => {
    const allowlist = [...AGENT_ACTION_ALLOWLIST];
    const metadata = getAgentActionMetadata();

    expect(new Set(allowlist).size).toBe(allowlist.length);
    expect(PUBLIC_SERVER_ACTION_NAMES).toEqual(allowlist);
    expect(metadata.map((action) => action.name)).toEqual(allowlist);
    expect(ACTION_REGISTRY.filter((action) => action.agentExposable).map((action) => action.name)).toEqual(allowlist);

    for (const action of metadata) {
      expect(action.agentExposable).toBe(true);
      expect(action.authentication).toBe("none");
      expect(action.trust).toEqual(["public"]);
      expect(action.surfaces).toContain("mcp");
      expect(action.surfaces).toContain("automation");
      expect(action.usage.kind).not.toBe("provider-usage");
      expect(action.usage.kind).not.toBe("storage-write");
    }
  });

  test("does not register administrative, credential, payment, or destructive operations", () => {
    const dangerousActionPattern = /(?:^|[._-])(admin|billing|credential|delete|destroy|key|payment|rotate|secret|token)(?:$|[._-])/i;
    const sensitiveFieldPattern = /^(?:apiKey|authorization|cookie|credential|password|payment|secret|token)$/i;

    for (const action of ACTION_REGISTRY) {
      expect(action.name).not.toMatch(dangerousActionPattern);
      for (const field of [...action.requiredInputs, ...action.outputShape]) {
        expect(field.name).not.toMatch(sensitiveFieldPattern);
      }
    }

    for (const action of getAgentActionMetadata()) {
      expect(action.usage.kind).not.toMatch(/provider-usage|storage-write/);
      expect(action.requiredInputs.some((field) => sensitiveFieldPattern.test(field.name))).toBe(false);
    }
  });

  test("keeps private benchmark operations off agents and exposes only bounded Stage 4 evidence actions", () => {
    const privateBenchmarkActions = [
      "benchmark.plan",
      "benchmark.runFixture",
      "benchmark.materializeEvaluation",
      "benchmark.retrieveResult",
      "benchmark.compareResults",
      "benchmark.buildMetricLeaderboard",
    ] as const;

    for (const name of privateBenchmarkActions) {
      const action = getActionDefinition(name).metadata;
      expect(action.implementation).toBe("dedicated-service");
      expect(action.agentExposable).toBe(false);
      expect(action.surfaces).not.toContain("mcp");
      expect(action.surfaces).not.toContain("automation");
      expect(action.usage.kind).not.toBe("provider-usage");
    }

    const publicBenchmarkActions = [
      "benchmark.fixtureLeaderboard",
      "benchmark.listLeaderboardSnapshots",
      "benchmark.listMethodologies",
      "benchmark.inspectMethodology",
      "benchmark.verifyResultIntegrity",
    ] as const;
    for (const name of publicBenchmarkActions) {
      const action = getActionDefinition(name).metadata;
      expect(action).toMatchObject({
        authentication: "none",
        trust: ["public"],
        agentExposable: true,
      });
      expect(action.surfaces).toEqual(expect.arrayContaining(["rest", "mcp", "automation"]));
      expect(action.usage.kind).not.toMatch(/provider-usage|storage-write/);
      expect(AGENT_ACTION_ALLOWLIST).toContain(name);
    }

    expect(getActionDefinition("benchmark.fixtureLeaderboard").metadata.usage.kind).toBe("local-resource");
    expect(getActionDefinition("benchmark.runFixture").metadata).toMatchObject({
      authentication: "none",
      trust: ["same-origin"],
      usage: { kind: "local-resource", confirmationRequired: false },
    });
    expect(getActionDefinition("benchmark.runFixture").metadata.outputShape.map((field) => field.name)).toEqual(["bundle", "results"]);
    expect(getActionDefinition("benchmark.compareResults").metadata.requiredInputs.map((field) => field.name)).toEqual([
      "left", "right", "scope",
      "leftProviderId", "leftModelId", "leftVoiceId", "leftConfigurationHash",
      "rightProviderId", "rightModelId", "rightVoiceId", "rightConfigurationHash",
    ]);
    expect(getActionDefinition("benchmark.retrieveResult").metadata).toMatchObject({ authentication: "required", trust: ["same-origin", "member-session"] });
    expect(getActionDefinition("benchmark.listLeaderboardSnapshots").inputSchema.parse({})).toEqual({ limit: 20 });
    expect(AGENT_ACTION_ALLOWLIST).not.toContain("benchmark.runFixture");
  });
});

test.describe("public server action executor", () => {
  test("returns structured results for every public action without network or provider calls", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      throw new Error("The public action executor must not call the network.");
    }) as typeof fetch;

    try {
      const context = { source: "mcp" as const, environment: TEST_ENVIRONMENT };
      const providers = await executePublicServerAction("providers.list", { limit: 50 }, context);
      expect(providers.ok).toBe(true);
      if (!providers.ok) throw new Error(providers.error.message);
      expect(providers.data.providers.length).toBeGreaterThanOrEqual(2);
      expect(providers.data.totalMatched).toBeGreaterThanOrEqual(providers.data.providers.length);
      expect(providers.data.providers.map((item) => item.id)).toContain("reson8");

      const provider = await executePublicServerAction("providers.get", {
        providerId: providers.data.providers[0].id,
      }, context);
      expect(provider.ok).toBe(true);

      const comparison = await executePublicServerAction("providers.compareEvidence", {
        providerIds: [providers.data.providers[0].id, providers.data.providers[1].id],
      }, context);
      expect(comparison.ok).toBe(true);
      if (!comparison.ok) throw new Error(comparison.error.message);
      expect(comparison.data.rankingProvided).toBe(false);

      const reson8Capabilities = await executePublicServerAction("providers.listCapabilities", { providerId: "reson8" }, context);
      expect(reson8Capabilities.ok).toBe(true);
      if (!reson8Capabilities.ok) throw new Error(reson8Capabilities.error.message);
      expect(reson8Capabilities.data.capabilities.length).toBeGreaterThan(0);
      expect(reson8Capabilities.data.capabilities.find((capability) => capability.id === "stt.prerecorded")).toMatchObject({
        verification: "integration-supported",
        integrationPath: "adapter",
        benchmarkEligibility: "fixture-only",
      });
      expect(reson8Capabilities.data.capabilities.find((capability) => capability.id === "deployment.hosted")).toMatchObject({
        verification: "provider-documented",
        integrationPath: "metadata-only",
        benchmarkEligibility: "ineligible",
      });
      expect((await executePublicServerAction("providers.listModels", { providerId: "reson8" }, context)).ok).toBe(true);
      expect((await executePublicServerAction("providers.listVoices", { providerId: "reson8" }, context)).ok).toBe(true);
      const health = await executePublicServerAction("providers.getHealth", { providerId: "reson8" }, context);
      expect(health.ok).toBe(true);
      if (!health.ok) throw new Error(health.error.message);
      expect(health.data.readiness.state).toBe("adapter-backed");

      const evaluations = await executePublicServerAction("evaluations.list", {}, context);
      expect(evaluations.ok).toBe(true);
      if (!evaluations.ok) throw new Error(evaluations.error.message);
      expect(evaluations.data.evaluations.length).toBeGreaterThan(0);

      const evalId = evaluations.data.evaluations[0].id;
      expect((await executePublicServerAction("evaluations.get", { evalId }, context)).ok).toBe(true);
      expect((await executePublicServerAction("methodology.get", {}, context)).ok).toBe(true);

      const synthetic = await executePublicServerAction("publicEvaluation.runSynthetic", { evalId }, context);
      expect(synthetic.ok).toBe(true);
      if (!synthetic.ok) throw new Error(synthetic.error.message);
      expect(synthetic.data.result.evidenceType).toBe("simulated");

      const methodologies = await executePublicServerAction("benchmark.listMethodologies", {}, context);
      expect(methodologies.ok).toBe(true);
      if (!methodologies.ok) throw new Error(methodologies.error.message);
      const methodology = methodologies.data.methodologies[0];
      expect((await executePublicServerAction("benchmark.inspectMethodology", {
        methodologyId: methodology.methodologyId,
        version: methodology.version,
      }, context)).ok).toBe(true);
      expect((await executePublicServerAction("benchmark.fixtureLeaderboard", {}, context)).ok).toBe(true);
      expect((await executePublicServerAction(
        "benchmark.listLeaderboardSnapshots",
        {},
        { ...context, benchmarkRepository: null },
      )).ok).toBe(true);
      expect(fetchCalls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("normalizes not-found, validation, and abort outcomes", async () => {
    const notFound = await executePublicServerAction(
      "evaluations.get",
      { evalId: "missing-evaluation" },
      { source: "rest", environment: TEST_ENVIRONMENT },
    );
    expect(notFound.ok).toBe(false);
    if (notFound.ok) throw new Error("Expected a not-found action result.");
    expect(notFound.error).toMatchObject({
      code: "evaluation_not_found",
      category: "unavailable",
      retryable: false,
    });

    const unknownComparison = await executePublicServerAction(
      "providers.compareEvidence",
      { providerIds: ["deepgram", "not-cataloged"] },
      { source: "rest", environment: TEST_ENVIRONMENT },
    );
    expect(unknownComparison.ok).toBe(false);
    if (unknownComparison.ok) throw new Error("Expected an unknown-provider result.");
    expect(unknownComparison.error).toMatchObject({
      code: "provider_not_found",
      category: "unavailable",
      retryable: false,
    });

    const invalid = await executePublicServerAction(
      "evaluations.get",
      { evalId: "../credential" } as never,
      { source: "rest", environment: TEST_ENVIRONMENT },
    );
    expect(invalid.ok).toBe(false);
    if (invalid.ok) throw new Error("Expected an invalid-input action result.");
    expect(invalid.error.code).toBe("invalid_action_input");
    expect(invalid.error.category).toBe("validation");
    expect(invalid.error.issues?.[0]?.path).toBe("evalId");

    const controller = new AbortController();
    controller.abort();
    const cancelled = await executePublicServerAction(
      "providers.list",
      {},
      {
        source: "rest",
        environment: TEST_ENVIRONMENT,
        signal: controller.signal,
        execution: deterministicExecution("server-abort"),
      },
    );
    expect(cancelled.ok).toBe(false);
    if (cancelled.ok) throw new Error("Expected a cancelled action result.");
    expect(cancelled).toMatchObject({
      action: "providers.list",
      invocationId: "server-abort",
      error: { code: "action_cancelled", category: "cancelled", retryable: false },
      meta: { source: "rest", usage: "none" },
    });
  });
});

test.describe("browser action runtime", () => {
  test("registers and unregisters a mounted handler", async () => {
    const runtime = new VoiceLabActionRuntime();
    const unregister = runtime.register("provider.switch", getActionDefinition("provider.switch"), (input, context) => {
      expect(context.source).toBe("ui");
      expect(context.invocationId).toBe("client-switch");
      return { providerId: input.providerId };
    });

    const success = await runtime.dispatch(
      "provider.switch",
      { providerId: "deepgram" },
      { source: "ui", execution: deterministicExecution("client-switch") },
    );
    expect(success).toMatchObject({
      ok: true,
      action: "provider.switch",
      invocationId: "client-switch",
      data: { providerId: "deepgram" },
      meta: { source: "ui", usage: "none" },
    });

    unregister();
    const unavailable = await runtime.dispatch("provider.switch", { providerId: "deepgram" }, { source: "ui" });
    expect(unavailable.ok).toBe(false);
    if (unavailable.ok) throw new Error("Expected an unavailable action result.");
    expect(unavailable.error.code).toBe("action_unavailable");
  });

  test("validates inputs before handlers and validates handler output", async () => {
    const runtime = new VoiceLabActionRuntime();
    let handlerCalls = 0;
    runtime.register("provider.switch", getActionDefinition("provider.switch"), () => {
      handlerCalls += 1;
      return { providerId: "not-registered" } as never;
    });

    const invalidInput = await runtime.dispatch(
      "provider.switch",
      { providerId: "not-registered" } as never,
      { source: "ui" },
    );
    expect(invalidInput.ok).toBe(false);
    if (invalidInput.ok) throw new Error("Expected an invalid-input action result.");
    expect(invalidInput.error.code).toBe("invalid_action_input");
    expect(handlerCalls).toBe(0);

    const invalidOutput = await runtime.dispatch("provider.switch", { providerId: "deepgram" }, { source: "ui" });
    expect(invalidOutput.ok).toBe(false);
    if (invalidOutput.ok) throw new Error("Expected an invalid-output action result.");
    expect(invalidOutput.error).toMatchObject({
      code: "invalid_action_output",
      category: "internal",
      retryable: false,
    });
    expect(handlerCalls).toBe(1);
  });

  test("requires a user gesture before microphone or playback handlers run", async () => {
    const runtime = new VoiceLabActionRuntime();
    let starts = 0;
    runtime.register("recording.start", getActionDefinition("recording.start"), (input) => {
      starts += 1;
      return { accepted: true, surface: input.surface };
    });

    const denied = await runtime.dispatch("recording.start", { surface: "audio-signal-lab" }, { source: "keyboard" });
    expect(denied.ok).toBe(false);
    if (denied.ok) throw new Error("Expected a user-gesture denial.");
    expect(denied.error.code).toBe("user_gesture_required");
    expect(starts).toBe(0);

    const accepted = await runtime.dispatch(
      "recording.start",
      { surface: "audio-signal-lab" },
      { source: "keyboard", userGesture: true },
    );
    expect(accepted.ok).toBe(true);
    expect(starts).toBe(1);
  });

  test("redacts unexpected handler failures from machine-readable results", async () => {
    const runtime = new VoiceLabActionRuntime();
    const sensitiveDetail = "Bearer provider-secret-value";
    runtime.register("provider.switch", getActionDefinition("provider.switch"), () => {
      throw new Error(sensitiveDetail);
    });

    const result = await runtime.dispatch("provider.switch", { providerId: "deepgram" }, { source: "ui" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected a safe action failure.");
    expect(result.error).toEqual({
      code: "action_failed",
      category: "internal",
      message: "The action failed safely without exposing internal details.",
      retryable: false,
    });
    expect(JSON.stringify(result)).not.toContain(sensitiveDetail);
  });
});
