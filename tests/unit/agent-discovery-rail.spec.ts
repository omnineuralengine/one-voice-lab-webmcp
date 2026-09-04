import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { GET as getEvalRoute } from "../../src/app/api/public/v1/evals/[eval]/route";
import { POST as runEvalRoute } from "../../src/app/api/public/v1/evals/[eval]/run/route";
import { POST as verifyBenchmarkRoute } from "../../src/app/api/public/v1/benchmarks/verify/route";
import { GET as getFixtureLeaderboardRoute } from "../../src/app/api/public/v1/leaderboards/fixture/route";
import { GET as listLeaderboardsRoute } from "../../src/app/api/public/v1/leaderboards/route";
import { GET as getBenchmarkMethodologyRoute } from "../../src/app/api/public/v1/methodologies/[methodology]/route";
import { GET as listBenchmarkMethodologiesRoute } from "../../src/app/api/public/v1/methodologies/route";
import { GET as getProvidersRoute } from "../../src/app/api/public/v1/providers/route";
import { GET as getProviderRoute } from "../../src/app/api/public/v1/providers/[provider]/route";
import { GET as listProviderCapabilitiesRoute } from "../../src/app/api/public/v1/providers/[provider]/capabilities/route";
import { GET as getProviderHealthRoute } from "../../src/app/api/public/v1/providers/[provider]/health/route";
import { GET as listProviderModelsRoute } from "../../src/app/api/public/v1/providers/[provider]/models/route";
import { GET as listProviderVoicesRoute } from "../../src/app/api/public/v1/providers/[provider]/voices/route";
import { POST as postMcpRoute } from "../../src/app/mcp/route";
import robots from "../../src/app/robots";
import sitemap from "../../src/app/sitemap";
import { getActionDefinition, getAgentActionMetadata } from "../../src/lib/actions/registry";
import { renderLlmsFullTxt, renderLlmsTxt } from "../../src/lib/public-evidence/agent-docs";
import { getCanonicalOrigin, getCanonicalUrl } from "../../src/lib/public-evidence/canonical-url";
import { createPublicMetadata } from "../../src/lib/public-evidence/metadata";
import { getOpenApiDocument, openApiDocumentSchema } from "../../src/lib/public-evidence/openapi";
import { getPublicEvals, getPublicMethodology, getPublicProviders, runPublicSyntheticEval } from "../../src/lib/public-evidence/registry";
import { createPublicEnvelopeSchema, publicEvalSchema, publicProviderSchema, publicSyntheticEvalResultSchema } from "../../src/lib/public-evidence/schemas";
import { getEvalJsonLd, getMethodologyJsonLd, getProviderJsonLd, getProviderRegistryJsonLd, getWebApplicationJsonLd, jsonLdSchema } from "../../src/lib/public-evidence/structured-data";
import { getEvalTool, listEvalsTool, listProvidersTool, PUBLIC_MCP_TOOL_NAMES, runSyntheticEvalTool } from "../../src/lib/public-evidence/tools";
import { PROVIDER_CATALOG } from "../../src/lib/providers/catalog";

const CANONICAL_ENVIRONMENT = { NEXT_PUBLIC_CANONICAL_URL: "https://voice.example.test/path/ignored" };

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

async function readMcpPayload<T>(response: Response): Promise<T> {
  const body = await response.text();
  const dataLine = body.split(/\r?\n/).find((line) => line.startsWith("data: "));
  return JSON.parse(dataLine?.slice(6) ?? body) as T;
}

test.describe("Agent Discovery + Evaluation Rail", () => {
  test("normalizes one environment-aware canonical origin", () => {
    expect(getCanonicalOrigin(CANONICAL_ENVIRONMENT)).toBe("https://voice.example.test");
    expect(getCanonicalUrl("providers/deepgram", CANONICAL_ENVIRONMENT)).toBe("https://voice.example.test/providers/deepgram");
    expect(getCanonicalOrigin({ NEXT_PUBLIC_CANONICAL_URL: "javascript:alert(1)" })).toBe("https://one-voice-lab.vercel.app");

    const metadata = createPublicMetadata({ title: "Provider Registry", description: "Public provider evidence.", path: "/providers" });
    expect(metadata.title).toBe("Provider Registry");
    expect(metadata.alternates).toMatchObject({ canonical: expect.stringContaining("/providers") });
    expect(metadata.openGraph).toMatchObject({ title: "Provider Registry", url: expect.stringContaining("/providers") });
  });

  test("projects provider records without credential configuration details", () => {
    const markers = [
      "private-deepgram-value-must-not-serialize",
      "private-elevenlabs-value-must-not-serialize",
      "private-fish-value-must-not-serialize",
      "private-cartesia-value-must-not-serialize",
      "private-reson8-value-must-not-serialize",
    ];
    const providers = getPublicProviders({
      DEEPGRAM_API_KEY: markers[0],
      ELEVENLABS_API_KEY: markers[1],
      FISH_AUDIO_API_KEY: markers[2],
      CARTESIA_API_KEY: markers[3],
      RESON8_API_KEY: markers[4],
      NEXT_PUBLIC_CANONICAL_URL: "https://voice.example.test",
    });
    expect(providers.map((provider) => provider.id).sort()).toEqual(PROVIDER_CATALOG.map((provider) => provider.id).sort());
    expect(providers.map((provider) => publicProviderSchema.parse(provider).id)).toEqual(providers.map((provider) => provider.id));
    expect(providers.find((provider) => provider.id === "deepgram")?.states.configured).toBe(true);

    const serialized = JSON.stringify(providers);
    for (const marker of markers) expect(serialized).not.toContain(marker);
    expect(serialized).not.toMatch(/(?:DEEPGRAM|ELEVENLABS|FISH_AUDIO|CARTESIA|RESON8)_API_KEY/);
    expect(serialized).not.toContain("environmentVariables");
    expect(providers.filter((provider) => provider.states.liveEnabled).map((provider) => provider.id)).toEqual([]);
    expect(providers.filter((provider) => provider.states.configured).map((provider) => provider.id).sort()).toEqual([
      "cartesia", "deepgram", "elevenlabs", "fish-audio",
    ]);

    const reson8 = providers.find((provider) => provider.id === "reson8");
    expect(reson8).toMatchObject({
      evidence: "Provider documentation verified",
      states: { configured: false, adapterBacked: true, liveEnabled: false },
      platform: {
        lifecycle: { integration: "fixture-validated", runtime: "disabled", benchmark: "ineligible" },
        readiness: { state: "configured" },
      },
    });
    expect(reson8?.platform.capabilities.length).toBeGreaterThan(0);
    expect(reson8?.platform.capabilities.find((capability) => capability.id === "stt.prerecorded")).toMatchObject({
      verification: "integration-supported",
      integrationPath: "adapter",
      benchmarkEligibility: "fixture-only",
    });
    expect(reson8?.platform.capabilities.find((capability) => capability.id === "deployment.hosted")).toMatchObject({
      verification: "provider-documented",
      integrationPath: "metadata-only",
      benchmarkEligibility: "ineligible",
    });
  });

  test("derives stable synthetic evaluations from the existing scenario registry", () => {
    const evaluations = getPublicEvals(CANONICAL_ENVIRONMENT);
    expect(evaluations.length).toBeGreaterThan(0);
    expect(evaluations.map((evaluation) => evaluation.id)).toContain("interrupt-mid-response");
    for (const evaluation of evaluations) {
      expect(publicEvalSchema.parse(evaluation)).toEqual(evaluation);
      expect(evaluation.environment).toEqual({ execution: "local_deterministic", providerCalls: false, billable: false });
      expect(evaluation.eligibleProviderIds).toEqual([]);
      expect(evaluation.measuredMetrics).toEqual([]);
    }

    const firstHash = evaluations[0].fixture.hash;
    expect(getPublicEvals(CANONICAL_ENVIRONMENT)[0].fixture.hash).toBe(firstHash);
  });

  test("runs one deterministic evaluator without network or provider execution", () => {
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      throw new Error("Network access is forbidden in this test.");
    };
    try {
      const result = runPublicSyntheticEval("interrupt-mid-response", CANONICAL_ENVIRONMENT);
      expect(result).not.toBeNull();
      expect(publicSyntheticEvalResultSchema.parse(result)).toEqual(result);
      expect(result).toMatchObject({ evalId: "interrupt-mid-response", evidenceType: "simulated", passed: true });
      expect(result?.trace.rawAudioIncluded).toBe(false);
      expect(fetchCalled).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("publishes intentional robots and complete sitemap entries", () => {
    const policy = robots();
    const rules = Array.isArray(policy.rules) ? policy.rules : [policy.rules];
    expect(rules.find((rule) => rule.userAgent === "GPTBot")).toMatchObject({ disallow: "/" });
    expect(rules.find((rule) => rule.userAgent === "OAI-SearchBot")).toMatchObject({
      allow: expect.arrayContaining(["/", "/api/public/", "/openapi.json"]),
      disallow: expect.arrayContaining(["/api/", "/bench", "/settings"]),
    });
    expect(rules.find((rule) => rule.userAgent === "ChatGPT-User")).toBeDefined();
    expect(policy.sitemap).toBe("https://one-voice-lab.vercel.app/sitemap.xml");

    const urls = sitemap().map((entry) => entry.url);
    for (const path of ["/providers", "/providers/deepgram", "/evals", "/evals/interrupt-mid-response", "/methodology", "/for-agents"]) {
      expect(urls).toContain(`https://one-voice-lab.vercel.app${path}`);
    }
  });

  test("renders safe agent documents with canonical public links", () => {
    const concise = renderLlmsTxt(CANONICAL_ENVIRONMENT);
    const full = renderLlmsFullTxt(CANONICAL_ENVIRONMENT);
    for (const document of [concise, full]) {
      expect(document).toContain("https://voice.example.test/providers");
      expect(document).toContain("Reson8");
      expect(document).toContain("an adapter is installed");
      expect(document).toContain("live execution is disabled");
      expect(document).toContain("/api/public/v1/methodologies");
      expect(document).toContain("/api/public/v1/leaderboards");
      expect(document).toContain("Human review");
      expect(document).not.toMatch(/(?:DEEPGRAM|ELEVENLABS|FISH_AUDIO|CARTESIA|RESON8)_API_KEY/);
      expect(document).not.toMatch(/\b[A-Z][A-Z0-9_]*(?:API_KEY|SECRET|TOKEN)\b/);
      expect(document).not.toMatch(/sk-[A-Za-z0-9_-]{12,}/);
      expect(document).not.toContain("src/");
      expect(document).not.toContain(".env");
      expect(document).not.toMatch(/Authorization:\s*(?:Bearer|Token)\s+\S+/i);
    }
    for (const toolName of PUBLIC_MCP_TOOL_NAMES) expect(full).toContain(toolName);
  });

  test("validates public API envelopes and known 404s", async () => {
    const providersResponse = await getProvidersRoute(new Request("https://voice.example.test/api/public/v1/providers?limit=50"));
    expect(providersResponse.status).toBe(200);
    const providersPayload = createPublicEnvelopeSchema(publicProviderSchema.array()).parse(await providersResponse.json());
    expect(providersResponse.headers.get("x-total-matched")).toBe(String(PROVIDER_CATALOG.length));
    expect(providersResponse.headers.get("x-result-count")).toBe("50");
    const nextCursor = providersResponse.headers.get("x-next-cursor");
    expect(nextCursor).toBeTruthy();
    const nextProvidersResponse = await getProvidersRoute(new Request(
      `https://voice.example.test/api/public/v1/providers?limit=50&after=${encodeURIComponent(nextCursor ?? "")}`,
    ));
    const nextProvidersPayload = createPublicEnvelopeSchema(publicProviderSchema.array()).parse(await nextProvidersResponse.json());
    expect([
      ...providersPayload.data.map((provider) => provider.id),
      ...nextProvidersPayload.data.map((provider) => provider.id),
    ].sort()).toEqual(getPublicProviders().map((provider) => provider.id).sort());
    expect(nextProvidersResponse.headers.get("x-next-cursor")).toBeNull();

    const evalResponse = await getEvalRoute(new Request("https://voice.example.test/api/public/v1/evals/interrupt-mid-response"), { params: Promise.resolve({ eval: "interrupt-mid-response" }) });
    expect(evalResponse.status).toBe(200);
    expect(createPublicEnvelopeSchema(publicEvalSchema).parse(await evalResponse.json()).data.id).toBe("interrupt-mid-response");

    const missingResponse = await getEvalRoute(new Request("https://voice.example.test/api/public/v1/evals/missing"), { params: Promise.resolve({ eval: "missing" }) });
    expect(missingResponse.status).toBe(404);

    const missingProviderResponse = await getProviderRoute(new Request("https://voice.example.test/api/public/v1/providers/missing"), { params: Promise.resolve({ provider: "missing" }) });
    expect(missingProviderResponse.status).toBe(404);

    const runResponse = await runEvalRoute(new Request("https://voice.example.test/api/public/v1/evals/interrupt-mid-response", { method: "POST" }), { params: Promise.resolve({ eval: "interrupt-mid-response" }) });
    expect(runResponse.headers.get("cache-control")).toBe("no-store");
    expect(createPublicEnvelopeSchema(publicSyntheticEvalResultSchema).parse(await runResponse.json()).data.evidenceType).toBe("simulated");

    const providerParams = { params: Promise.resolve({ provider: "reson8" }) };
    const reson8ProviderResponse = await getProviderRoute(
      new Request("https://voice.example.test/api/public/v1/providers/reson8"),
      providerParams,
    );
    expect(reson8ProviderResponse.status).toBe(200);
    expect(createPublicEnvelopeSchema(publicProviderSchema)
      .parse(await reson8ProviderResponse.json()).data).toMatchObject({
      id: "reson8",
      states: { adapterBacked: true, liveEnabled: false },
      platform: { lifecycle: { integration: "fixture-validated", benchmark: "ineligible" } },
    });

    const capabilityResponse = await listProviderCapabilitiesRoute(
      new Request("https://voice.example.test/api/public/v1/providers/reson8/capabilities"),
      providerParams,
    );
    const capabilityPayload = createPublicEnvelopeSchema(
      getActionDefinition("providers.listCapabilities").outputSchema,
    ).parse(await capabilityResponse.json());
    expect(capabilityPayload.data.providerId).toBe("reson8");
    expect(capabilityPayload.data.capabilities.length).toBeGreaterThan(0);

    for (const [path, handler, actionName] of [
      ["models", listProviderModelsRoute, "providers.listModels"],
      ["voices", listProviderVoicesRoute, "providers.listVoices"],
      ["health", getProviderHealthRoute, "providers.getHealth"],
    ] as const) {
      const response = await handler(
        new Request(`https://voice.example.test/api/public/v1/providers/reson8/${path}`),
        providerParams,
      );
      expect(response.status).toBe(200);
      const payload = createPublicEnvelopeSchema(getActionDefinition(actionName).outputSchema).parse(await response.json());
      expect(payload.data.providerId).toBe("reson8");
    }

    const methodologiesResponse = await listBenchmarkMethodologiesRoute(
      new Request("https://voice.example.test/api/public/v1/methodologies"),
    );
    const methodologiesPayload = createPublicEnvelopeSchema(
      getActionDefinition("benchmark.listMethodologies").outputSchema,
    ).parse(await methodologiesResponse.json());
    const methodology = methodologiesPayload.data.methodologies[0];
    const methodologyResponse = await getBenchmarkMethodologyRoute(
      new Request(`https://voice.example.test/api/public/v1/methodologies/${methodology.methodologyId}?version=${methodology.version}`),
      { params: Promise.resolve({ methodology: methodology.methodologyId }) },
    );
    expect(createPublicEnvelopeSchema(
      getActionDefinition("benchmark.inspectMethodology").outputSchema,
    ).parse(await methodologyResponse.json()).data.methodology.version).toBe(methodology.version);

    const leaderboardResponse = await listLeaderboardsRoute(
      new Request("https://voice.example.test/api/public/v1/leaderboards"),
    );
    expect(createPublicEnvelopeSchema(
      getActionDefinition("benchmark.listLeaderboardSnapshots").outputSchema,
    ).parse(await leaderboardResponse.json()).data.items).toEqual([]);

    const fixtureResponse = await getFixtureLeaderboardRoute(
      new Request("https://voice.example.test/api/public/v1/leaderboards/fixture"),
    );
    expect(createPublicEnvelopeSchema(
      getActionDefinition("benchmark.fixtureLeaderboard").outputSchema,
    ).parse(await fixtureResponse.json()).data.snapshot.visibility).toBe("private");

    const invalidVerification = await verifyBenchmarkRoute(new Request(
      "https://voice.example.test/api/public/v1/benchmarks/verify",
      { method: "POST", headers: { "content-type": "application/json" }, body: "not-json" },
    ));
    expect(invalidVerification.status).toBe(400);
  });

  test("describes only real public routes in a structural OpenAPI 3.1 document", () => {
    const document = getOpenApiDocument(CANONICAL_ENVIRONMENT);
    expect(openApiDocumentSchema.parse(document)).toEqual(document);
    expect(Object.keys(document.paths).sort()).toEqual([
      "/api/public/v1/benchmarks/verify",
      "/api/public/v1/evals",
      "/api/public/v1/evals/{eval}",
      "/api/public/v1/evals/{eval}/run",
      "/api/public/v1/lab",
      "/api/public/v1/leaderboards",
      "/api/public/v1/leaderboards/fixture",
      "/api/public/v1/methodologies",
      "/api/public/v1/methodologies/{methodology}",
      "/api/public/v1/methodology",
      "/api/public/v1/providers",
      "/api/public/v1/providers/{provider}",
      "/api/public/v1/providers/{provider}/capabilities",
      "/api/public/v1/providers/{provider}/health",
      "/api/public/v1/providers/{provider}/models",
      "/api/public/v1/providers/{provider}/voices",
    ]);
    const serialized = JSON.stringify(document);
    expect(serialized).not.toContain("/api/deepgram");
    expect(serialized).not.toMatch(/\/api\/(?:admin|billing|credentials?)/i);
    expect(serialized).not.toMatch(/\b[A-Z][A-Z0-9_]*(?:API_KEY|SECRET|TOKEN)\b/);
    expect(serialized).toContain("never invoke provider APIs");

    const providerIdSchema = document.components.schemas.ProviderCatalogId as {
      pattern?: string;
      enum?: unknown[];
    };
    expect(providerIdSchema.pattern).toBe("^[a-z0-9]+(?:-[a-z0-9]+)*$");
    expect(providerIdSchema.enum).toBeUndefined();

    const listQuerySchema = document.components.schemas.ProviderListQuery as {
      properties?: Record<string, unknown>;
    };
    expect(Object.keys(listQuerySchema.properties ?? {}).sort()).toEqual([
      "after", "capabilityId", "group", "kind", "limit",
    ]);
    const providerListOperation = document.paths["/api/public/v1/providers"].get as {
      responses?: Record<string, { headers?: Record<string, unknown> }>;
    };
    expect(Object.keys(providerListOperation.responses?.["200"].headers ?? {}).sort()).toEqual([
      "X-Next-Cursor", "X-Result-Count", "X-Total-Matched",
    ]);

    const documentedActions = Object.values(document.paths).flatMap((path) => (
      Object.values(path).map((operation) => (
        typeof operation === "object" && operation !== null
          ? (operation as Record<string, unknown>)["x-one-action"]
          : undefined
      ))
    )).filter((value): value is string => typeof value === "string");
    const agentActions = new Map<string, ReturnType<typeof getAgentActionMetadata>[number]>(
      getAgentActionMetadata().map((action) => [action.name, action]),
    );
    for (const actionName of documentedActions) {
      const action = agentActions.get(actionName);
      expect(action, `${actionName} must remain on the explicit agent allowlist`).toBeDefined();
      expect(action?.usage.kind).not.toMatch(/provider-usage|storage-write/);
    }
  });

  test("keeps structured data consistent with visible public records", () => {
    const provider = getPublicProviders(CANONICAL_ENVIRONMENT)[0];
    const providers = getPublicProviders(CANONICAL_ENVIRONMENT);
    const evaluation = getPublicEvals(CANONICAL_ENVIRONMENT)[0];
    const methodology = getPublicMethodology(CANONICAL_ENVIRONMENT);
    const providerRegistry = getProviderRegistryJsonLd(providers);
    for (const value of [getWebApplicationJsonLd(CANONICAL_ENVIRONMENT), providerRegistry, getProviderJsonLd(provider), getEvalJsonLd(evaluation), getMethodologyJsonLd(methodology)]) {
      expect(jsonLdSchema.parse(value)).toEqual(value);
      expect(JSON.stringify(value)).not.toMatch(/"(?:aggregateRating|review|reviewCount|price|award)"\s*:/i);
    }
    expect(providerRegistry.numberOfItems).toBe(PROVIDER_CATALOG.length);
    expect(JSON.stringify(providerRegistry)).toContain("Reson8");
  });

  test("uses identical provider and eval IDs across UI data, API data, and MCP tools", () => {
    const uiProviderIds = getPublicProviders(CANONICAL_ENVIRONMENT).map((provider) => provider.id);
    const mcpProviderIds = listProvidersTool(CANONICAL_ENVIRONMENT).map((provider) => provider.id);
    expect(mcpProviderIds).toEqual(uiProviderIds);

    const uiEvalIds = getPublicEvals(CANONICAL_ENVIRONMENT).map((evaluation) => evaluation.id);
    const mcpEvalIds = listEvalsTool(CANONICAL_ENVIRONMENT).map((evaluation) => evaluation.id);
    expect(mcpEvalIds).toEqual(uiEvalIds);
    expect(getEvalTool(uiEvalIds[0], CANONICAL_ENVIRONMENT)?.id).toBe(uiEvalIds[0]);
    expect(runSyntheticEvalTool(uiEvalIds[0], CANONICAL_ENVIRONMENT)?.evalId).toBe(uiEvalIds[0]);
    expect(PUBLIC_MCP_TOOL_NAMES).toHaveLength(16);
  });

  test("serves MCP over the guarded stateless HTTP transport", async () => {
    const headers = {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      Host: "voice.example.test",
      Origin: "https://voice.example.test",
    };
    const initializeResponse = await postMcpRoute(new Request("https://voice.example.test/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "voice-lab-test", version: "1.0.0" },
        },
      }),
    }));
    expect(initializeResponse.status).toBe(200);
    const initializePayload = await readMcpPayload<{ result?: { serverInfo?: { name?: string } } }>(initializeResponse);
    expect(initializePayload.result?.serverInfo?.name).toBe("open-voice-ai-lab");

    const listResponse = await postMcpRoute(new Request("https://voice.example.test/mcp", {
      method: "POST",
      headers: { ...headers, "MCP-Protocol-Version": "2025-06-18" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    }));
    expect(listResponse.status).toBe(200);
    const listPayload = await readMcpPayload<{ result?: { tools?: Array<{ name: string }> } }>(listResponse);
    expect(listPayload.result?.tools?.map((tool) => tool.name)).toEqual([...PUBLIC_MCP_TOOL_NAMES]);
    expect(PUBLIC_MCP_TOOL_NAMES.some((name) => /admin|billing|credential|delete|payment|secret/i.test(name))).toBe(false);

    const providerPageResponse = await postMcpRoute(new Request("https://voice.example.test/mcp", {
      method: "POST",
      headers: { ...headers, "MCP-Protocol-Version": "2025-06-18" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "voice_lab.list_providers", arguments: { limit: 1 } } }),
    }));
    const providerPagePayload = await readMcpPayload<{ result?: { structuredContent?: { providers?: unknown[]; nextCursor?: string | null; totalMatched?: number } } }>(providerPageResponse);
    expect(providerPagePayload.result?.structuredContent?.providers).toHaveLength(1);
    expect(providerPagePayload.result?.structuredContent?.nextCursor).toBeTruthy();
    expect(providerPagePayload.result?.structuredContent?.totalMatched).toBe(PROVIDER_CATALOG.length);

    const toolCallResponse = await postMcpRoute(new Request("https://voice.example.test/mcp", {
      method: "POST",
      headers: { ...headers, "MCP-Protocol-Version": "2025-06-18" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "voice_lab.run_synthetic_eval", arguments: { evalId: "interrupt-mid-response" } } }),
    }));
    const toolCallPayload = await readMcpPayload<{ result?: { structuredContent?: { result?: { evalId?: string; evidenceType?: string } } } }>(toolCallResponse);
    expect(toolCallPayload.result?.structuredContent?.result).toMatchObject({ evalId: "interrupt-mid-response", evidenceType: "simulated" });

    const reson8Response = await postMcpRoute(new Request("https://voice.example.test/mcp", {
      method: "POST",
      headers: { ...headers, "MCP-Protocol-Version": "2025-06-18" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "voice_lab.list_provider_capabilities", arguments: { providerId: "reson8" } } }),
    }));
    const reson8Payload = await readMcpPayload<{ result?: { structuredContent?: { providerId?: string; capabilities?: Array<{ id?: string; verification?: string; integrationPath?: string; benchmarkEligibility?: string }> } } }>(reson8Response);
    expect(reson8Payload.result?.structuredContent?.providerId).toBe("reson8");
    expect(reson8Payload.result?.structuredContent?.capabilities?.length).toBeGreaterThan(0);
    expect(reson8Payload.result?.structuredContent?.capabilities?.find((capability) => capability.id === "stt.streaming")).toMatchObject({
      verification: "integration-supported",
      integrationPath: "adapter",
      benchmarkEligibility: "fixture-only",
    });
    expect(reson8Payload.result?.structuredContent?.capabilities?.find((capability) => capability.id === "deployment.hosted")).toMatchObject({
      verification: "provider-documented",
      integrationPath: "metadata-only",
      benchmarkEligibility: "ineligible",
    });

    const rejectedResponse = await postMcpRoute(new Request("https://voice.example.test/mcp", {
      method: "POST",
      headers: { ...headers, Origin: "https://attacker.example" },
      body: "{}",
    }));
    expect(rejectedResponse.status).toBe(403);

    const oversizedResponse = await postMcpRoute(new Request("https://voice.example.test/mcp", {
      method: "POST",
      headers,
      body: "x".repeat(128 * 1024 + 1),
    }));
    expect(oversizedResponse.status).toBe(413);
  });

  test("keeps public rail imports isolated from live provider execution", () => {
    const publicSources = [
      ...sourceFiles(join(process.cwd(), "src", "app", "api", "public")),
      ...sourceFiles(join(process.cwd(), "src", "app", "mcp")),
      ...sourceFiles(join(process.cwd(), "src", "lib", "public-evidence")),
    ];
    const combined = publicSources.map((path) => readFileSync(path, "utf8")).join("\n");

    expect(combined).not.toMatch(/@\/lib\/deepgram(?:[\"/])/);
    expect(combined).not.toContain("@/lib/providers/adapters");
    expect(combined).not.toContain("@/lib/providers/deepgram/adapters");
    expect(combined).not.toContain("@/app/api/deepgram");
    expect(combined).not.toContain("process.env.DEEPGRAM_API_KEY");
  });
});
