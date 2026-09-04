import { expect, test } from "@playwright/test";

import { executePublicServerAction } from "../../src/lib/actions/server/executor";
import { PROVIDER_CATALOG } from "../../src/lib/providers/catalog";
import { PROVIDER_ADAPTER_REGISTRATIONS } from "../../src/lib/providers/adapters";
import {
  executeProviderFixtureContract,
  validateProviderContractCandidate,
  type ProviderContractCandidate,
  type ProviderFixtureAdapter,
} from "../../src/lib/providers/contract-test-kit";
import { ProviderDiscoveryCache } from "../../src/lib/providers/discovery-cache";
import { toBenchmarkPlanningProviders } from "../../src/lib/providers/benchmark-projection";
import {
  providerCatalogEntrySchema,
  providerCatalogIdSchema,
  providerPlatformProjectionSchema,
  type NormalizedProviderModel,
  type NormalizedProviderVoice,
  type ProviderCatalogEntry,
  type ProviderOperationalPolicy,
} from "../../src/lib/providers/platform-types";
import {
  evaluateProviderInvocationPolicy,
  intersectProviderAccess,
  intersectProviderBenchmarkStatus,
} from "../../src/lib/providers/provider-access-policy";
import { getProviderPlatformProjection, projectProviderPlatform } from "../../src/lib/providers/platform-service";
import { PROVIDER_REGISTRY } from "../../src/lib/providers/registry";
import { getPublicProvidersFromPlatform } from "../../src/lib/public-evidence/registry";

const FIXTURE_SOURCE = {
  title: "Synthetic contract fixture",
  url: "https://fixtures.invalid/provider-contract",
  verifiedAt: "2026-08-27",
} as const;

const syntheticCatalogEntry = providerCatalogEntrySchema.parse({
  id: "future-provider",
  displayName: "Synthetic Future Provider",
  description: "A deterministic test fixture, not a real vendor.",
  group: "core-and-immediate",
  kind: "speech-provider",
  category: "Fixture",
  metadataVerification: "verified",
  metadataSources: [FIXTURE_SOURCE],
  capabilities: [{
    id: "tts.batch",
    family: "text-to-speech",
    support: "supported",
    verification: "integration-supported",
    sources: [FIXTURE_SOURCE],
    lastVerifiedAt: "2026-08-27",
    requiredAdapter: "batch-tts",
    integrationPath: "adapter",
    costBearing: false,
    benchmarkEligibility: "fixture-only",
  }],
  deprecated: false,
});

const syntheticModel: NormalizedProviderModel = {
  providerId: "future-provider",
  referenceId: "future-provider.fixture-model",
  providerModelId: "fixture-model-v1",
  displayName: "Fixture Model",
  modality: "text-to-speech",
  capabilities: ["tts.batch"],
  languages: ["en"],
  availability: "available",
  source: FIXTURE_SOURCE,
  lastVerifiedAt: "2026-08-27",
};

const syntheticVoice: NormalizedProviderVoice = {
  providerId: "future-provider",
  referenceId: "future-provider.fixture-voice",
  providerVoiceId: "fixture-voice-v1",
  displayName: "Fixture Voice",
  supportedModelReferences: ["future-provider.fixture-model"],
  languages: ["en"],
  availability: "available",
  source: FIXTURE_SOURCE,
  lastVerifiedAt: "2026-08-27",
};

const publicPolicy: ProviderOperationalPolicy = {
  providerId: "deepgram",
  access: "public-use",
  runtimeStatus: "enabled",
  benchmarkStatus: "benchmark-eligible",
  costAdmissionEnabled: true,
  capabilityPolicies: [],
  policyVersion: "test/1.0.0",
};

test.describe("Provider platform", () => {
  test("keeps catalog IDs open while preserving a unique curated catalog", () => {
    expect(providerCatalogIdSchema.parse("future-provider")).toBe("future-provider");
    expect(providerCatalogIdSchema.safeParse("Future Provider").success).toBe(false);

    const ids = PROVIDER_CATALOG.map((provider) => provider.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("deepgram");
    expect(ids).toContain("reson8");
    expect(ids).toContain("chatterbox");
    expect(ids).toContain("voximplant");
    expect(ids).toContain("deepeval");
  });

  test("separates speech providers, local runtimes, infrastructure, and evaluation systems", () => {
    expect(PROVIDER_CATALOG.find((entry) => entry.id === "deepgram")?.kind).toBe("speech-provider");
    expect(PROVIDER_CATALOG.find((entry) => entry.id === "whisper-cpp")?.kind).toBe("local-runtime");
    expect(PROVIDER_CATALOG.find((entry) => entry.id === "livekit")?.kind).toBe("voice-stack-infrastructure");
    expect(PROVIDER_CATALOG.find((entry) => entry.id === "deepeval")?.kind).toBe("evaluation-system");
  });

  test("keeps unverified catalog entries claim-free", () => {
    const unverified = PROVIDER_CATALOG.filter((entry) => entry.metadataVerification === "unverified");
    expect(unverified.length).toBeGreaterThan(30);
    expect(unverified.every((entry) => entry.capabilities.length === 0 && entry.metadataSources.length === 0)).toBe(true);
  });

  test("projects installed integration truth plus injected policy without exposing secrets", () => {
    const marker = "never-serialize-this-provider-secret";
    const projection = getProviderPlatformProjection("deepgram", {
      environment: { DEEPGRAM_API_KEY: marker, ONE_LIVE_LAB_ENABLED: "true" },
      policies: [publicPolicy],
    });

    expect(projection?.integration.installed).toBe(true);
    expect(projection?.lifecycle.integration).toBe("configured");
    expect(projection?.lifecycle.runtime).toBe("enabled");
    expect(projection?.readiness.state).toBe("live-enabled");
    expect(projection?.credential).toEqual({ required: true, state: "configured-not-runtime-verified" });
    expect(projection?.health.state).toBe("configured");
    expect(projection?.capabilities.find((item) => item.id === "tts.batch")?.benchmarkEligibility).toBe("eligible");
    expect(JSON.stringify(projection)).not.toContain(marker);
    expect(JSON.stringify(projection)).not.toContain("DEEPGRAM_API_KEY");
    expect(JSON.stringify(projection)).not.toMatch(/environmentVariables|apiKey|secretValue/i);
  });

  test("keeps a fixture-validated adapter fail-closed despite attempted operational widening", () => {
    const projection = getProviderPlatformProjection("reson8", {
      environment: {},
      policies: [{
        providerId: "reson8",
        access: "public-use",
        runtimeStatus: "enabled",
        benchmarkStatus: "publicly-ranked",
        costAdmissionEnabled: true,
        capabilityPolicies: [],
        policyVersion: "test/1.0.0",
      }],
    });

    expect(projection?.integration).toEqual({ installed: true, fixtureCapable: true });
    expect(projection?.lifecycle.integration).toBe("fixture-validated");
    expect(projection?.lifecycle.runtime).toBe("disabled");
    expect(projection?.lifecycle.benchmark).toBe("ineligible");
    expect(projection?.readiness.state).toBe("adapter-backed");
    expect(projection?.credential.state).toBe("unconfigured");
    expect(projection?.capabilities.find((item) => item.id === "stt.prerecorded")).toMatchObject({
      verification: "integration-supported",
      integrationPath: "adapter",
      benchmarkEligibility: "fixture-only",
    });
    expect(projection?.capabilities.find((item) => item.id === "deployment.hosted")).toMatchObject({
      verification: "provider-documented",
      integrationPath: "metadata-only",
      benchmarkEligibility: "ineligible",
    });
  });

  test("projects converged Cartesia discovery and fixture planning without widening runtime access", () => {
    const platform = projectProviderPlatform({ environment: {} });
    const planning = new Map(toBenchmarkPlanningProviders(platform)
      .map((provider) => [provider.providerId, provider]));
    const cartesia = platform.find((provider) => provider.id === "cartesia");

    expect(planning.get("deepgram")).toMatchObject({
      adapterBacked: true,
      fixtureAvailable: true,
      liveEnabled: false,
    });
    expect(planning.get("cartesia")).toMatchObject({
      adapterBacked: true,
      fixtureAvailable: true,
      liveEnabled: false,
    });
    expect(cartesia).toMatchObject({
      lifecycle: {
        integration: "contract-tests-passed",
        access: "globally-disabled",
        runtime: "disabled",
        benchmark: "ineligible",
      },
      readiness: { state: "adapter-backed" },
      integration: { installed: true, fixtureCapable: true },
    });
    expect(cartesia?.models.map((model) => model.referenceId)).toEqual([
      "cartesia:sonic-3",
      "cartesia:sonic-3.5",
    ]);
    expect(cartesia?.voices).toEqual([]);
  });

  test("accepts synthetic provider/model/voice fixtures without changing provider enums", () => {
    const catalog: ProviderCatalogEntry[] = [...PROVIDER_CATALOG, syntheticCatalogEntry];
    const first = projectProviderPlatform({ catalog, environment: {}, models: [syntheticModel], voices: [syntheticVoice] });
    const second = projectProviderPlatform({ catalog, environment: {}, models: [syntheticModel], voices: [syntheticVoice] });
    const synthetic = first.find((provider) => provider.id === "future-provider");

    expect(first).toEqual(second);
    expect(synthetic?.lifecycle.integration).toBe("adapter-missing");
    expect(synthetic?.models.map((model) => model.referenceId)).toEqual(["future-provider.fixture-model"]);
    expect(synthetic?.voices.map((voice) => voice.referenceId)).toEqual(["future-provider.fixture-voice"]);

    const benchmarkProvider = toBenchmarkPlanningProviders(first).find((provider) => provider.providerId === "future-provider");
    expect(benchmarkProvider).toEqual({
      providerId: "future-provider",
      listed: true,
      fixtureAvailable: false,
      adapterBacked: false,
      liveEnabled: false,
      benchmarkEligible: false,
    });
  });

  test("carries a synthetic N+1 projection through benchmark, UI data, REST, and MCP actions", async () => {
    const cataloged = projectProviderPlatform({
      catalog: [...PROVIDER_CATALOG, syntheticCatalogEntry],
      environment: {},
      models: [syntheticModel],
      voices: [syntheticVoice],
    }).find((provider) => provider.id === "future-provider");
    expect(cataloged).toBeDefined();

    const integrated = providerPlatformProjectionSchema.parse({
      ...cataloged!,
      lifecycle: {
        ...cataloged!.lifecycle,
        integration: "contract-tests-passed",
        access: "fixture-only",
        runtime: "enabled",
        benchmark: "benchmark-eligible",
      },
      readiness: { state: "adapter-backed", explanation: "Synthetic fixture adapter passed the shared contract kit." },
      integration: { installed: true, fixtureCapable: true },
      capabilities: cataloged!.capabilities.map((capability) => capability.id === "tts.batch"
        ? { ...capability, integrationPath: "adapter", benchmarkEligibility: "eligible" }
        : capability),
    });

    expect(toBenchmarkPlanningProviders([integrated])).toEqual([{
      providerId: "future-provider",
      listed: true,
      fixtureAvailable: true,
      adapterBacked: true,
      liveEnabled: false,
      benchmarkEligible: true,
    }]);

    const uiProviders = getPublicProvidersFromPlatform([integrated], { NEXT_PUBLIC_SITE_URL: "https://voice.example.test" });
    expect(uiProviders[0]).toMatchObject({
      id: "future-provider",
      states: { listed: true, adapterBacked: true, liveEnabled: false },
      platform: { integration: { installed: true, fixtureCapable: true } },
    });

    for (const source of ["rest", "mcp"] as const) {
      const result = await executePublicServerAction("providers.list", { limit: 25 }, {
        source,
        providerPlatform: [integrated],
        environment: { NEXT_PUBLIC_SITE_URL: "https://voice.example.test" },
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.providers.map((provider) => provider.id)).toEqual(["future-provider"]);
    }
  });

  test("derives executable truth from actual adapter registrations", () => {
    for (const manifest of PROVIDER_REGISTRY) {
      const registration = PROVIDER_ADAPTER_REGISTRATIONS[manifest.id];
      for (const capability of manifest.capabilities.filter((item) => item.adapterAvailable)) {
        if (capability.id === "tts") expect(registration?.tts).toBeDefined();
        if (capability.id === "stt-prerecorded") expect(registration?.sttPrerecorded).toBeDefined();
        if (capability.id === "models") expect(registration?.catalog?.capabilities).toContain("models");
        if (capability.id === "voices") expect(registration?.catalog?.capabilities).toContain("voices");
      }
    }
  });
});

test.describe("Provider operational access", () => {
  test("fails closed for unknown, disabled, fixture-only, and budget-paused capabilities", () => {
    expect(evaluateProviderInvocationPolicy({
      known: false,
      accessMode: "public-use",
      runtimeStatus: "enabled",
    })).toEqual({ allowed: false, code: "provider_access_unavailable" });

    for (const accessMode of ["globally-disabled", "fixture-only", "budget-paused"] as const) {
      expect(evaluateProviderInvocationPolicy({ known: true, accessMode, runtimeStatus: "enabled" })).toEqual({
        allowed: false,
        code: "provider_access_unavailable",
      });
    }
    expect(evaluateProviderInvocationPolicy({
      known: true,
      accessMode: "public-use",
      runtimeStatus: "disabled",
    })).toEqual({ allowed: false, code: "provider_access_unavailable" });
  });

  test("keeps administrator access separate from authenticated trust", () => {
    const privatePolicy = { known: true, accessMode: "private-testing" as const, runtimeStatus: "enabled" as const };
    expect(evaluateProviderInvocationPolicy(privatePolicy)).toEqual({ allowed: true, requiredTier: "verified" });
    expect(evaluateProviderInvocationPolicy(privatePolicy, "guest")).toEqual({
      allowed: false,
      code: "provider_forbidden",
      requiredTier: "verified",
    });
    expect(evaluateProviderInvocationPolicy(privatePolicy, "member")).toEqual({ allowed: true, requiredTier: "verified" });

    const trustedPolicy = { known: true, accessMode: "trusted-user-access" as const, runtimeStatus: "degraded" as const };
    expect(evaluateProviderInvocationPolicy(trustedPolicy, "verified")).toMatchObject({
      allowed: false,
      code: "provider_forbidden",
    });
    expect(evaluateProviderInvocationPolicy(trustedPolicy, "trusted_builder")).toEqual({
      allowed: true,
      requiredTier: "trusted_builder",
    });
    expect(evaluateProviderInvocationPolicy({
      known: true,
      accessMode: "public-use",
      runtimeStatus: "enabled",
    }, "guest")).toEqual({ allowed: true });
  });

  test("capability policies can narrow but never widen provider policy", () => {
    expect(intersectProviderAccess("globally-disabled", "public-use")).toBe("globally-disabled");
    expect(intersectProviderAccess("private-testing", "public-use")).toBe("private-testing");
    expect(intersectProviderAccess("public-use", "trusted-user-access")).toBe("trusted-user-access");
    expect(intersectProviderBenchmarkStatus("ineligible", "publicly-ranked")).toBe("ineligible");
    expect(intersectProviderBenchmarkStatus("private-testing", "publicly-ranked")).toBe("private-testing");
    expect(intersectProviderBenchmarkStatus("publicly-ranked", "fixture-only")).toBe("fixture-only");
  });

  test("requires runtime, the global switch, and Stage 2 cost admission before claiming live readiness", () => {
    const baseEnvironment = { DEEPGRAM_API_KEY: "configured", ONE_LIVE_LAB_ENABLED: "true" };
    const disabledBudget = getProviderPlatformProjection("deepgram", {
      environment: baseEnvironment,
      policies: [{ ...publicPolicy, costAdmissionEnabled: false }],
    });
    const disabledRuntime = getProviderPlatformProjection("deepgram", {
      environment: baseEnvironment,
      policies: [{ ...publicPolicy, runtimeStatus: "disabled" }],
    });
    const globalPause = getProviderPlatformProjection("deepgram", {
      environment: { DEEPGRAM_API_KEY: "configured", ONE_LIVE_LAB_ENABLED: "false" },
      policies: [publicPolicy],
    });

    expect(disabledBudget?.readiness.state).toBe("configured");
    expect(disabledRuntime?.readiness.state).toBe("configured");
    expect(globalPause?.readiness.state).toBe("configured");
  });

  test("requires capability-level benchmark eligibility before planning live TTS", () => {
    const projection = getProviderPlatformProjection("deepgram", {
      environment: { DEEPGRAM_API_KEY: "configured", ONE_LIVE_LAB_ENABLED: "true" },
      policies: [{
        ...publicPolicy,
        capabilityPolicies: [{
          capabilityId: "tts.batch",
          access: "public-use",
          benchmarkStatus: "ineligible",
        }],
      }],
    });

    expect(projection?.lifecycle.benchmark).toBe("benchmark-eligible");
    expect(projection?.capabilities.find((item) => item.id === "tts.batch")?.benchmarkEligibility).toBe("fixture-only");
    expect(toBenchmarkPlanningProviders([projection!])[0]).toMatchObject({
      adapterBacked: true,
      liveEnabled: false,
      benchmarkEligible: false,
    });
  });

  test("projects public adapter readiness from actual platform truth", () => {
    const platform = getProviderPlatformProjection("deepgram", {
      environment: {},
      policies: [publicPolicy],
    });
    const publicProvider = getPublicProvidersFromPlatform([platform!], {})[0];

    expect(publicProvider.states.adapterBacked).toBe(platform?.integration.fixtureCapable);
    expect(publicProvider.capabilities.find((item) => item.id === "tts")?.adapterBacked).toBe(true);
    expect(publicProvider.capabilities.find((item) => item.id === "voice-agent")?.adapterBacked).toBe(false);
  });
});

test.describe("Provider discovery cache", () => {
  test("serves fresh then stale last-good metadata and stores only bounded failure codes", () => {
    const cache = new ProviderDiscoveryCache({ ttlMs: 10, maxStaleMs: 100, maxProviders: 2, maxEntriesPerProvider: 2 });
    cache.putModels("future-provider", [syntheticModel], 1_000);
    expect(cache.readModels("future-provider", 1_010).state).toBe("fresh");
    expect(cache.readModels("future-provider", 1_011).state).toBe("stale");

    cache.recordFailure("future-provider", "models", "refresh-failed", 1_012);
    const stale = cache.readModels("future-provider", 1_013);
    expect(stale.state).toBe("stale");
    expect(stale.entries).toEqual([syntheticModel]);
    expect(stale.failure).toEqual({ code: "refresh-failed" });
    expect(JSON.stringify(stale)).not.toContain("upstream");
    expect(cache.readModels("future-provider", 1_111).state).toBe("miss");
  });

  test("enforces provider and entry bounds, explicit invalidation, and stale pruning", () => {
    const cache = new ProviderDiscoveryCache({ ttlMs: 10, maxStaleMs: 100, maxProviders: 2, maxEntriesPerProvider: 1 });
    cache.putModels("future-provider", [syntheticModel], 1_000);
    cache.putVoices("second-provider", [{ ...syntheticVoice, providerId: "second-provider", referenceId: "second-provider.voice" }], 1_001);
    cache.readModels("future-provider", 1_002);
    cache.putModels("third-provider", [{ ...syntheticModel, providerId: "third-provider", referenceId: "third-provider.model" }], 1_003);

    expect(cache.size).toBe(2);
    expect(cache.readVoices("second-provider", 1_004).state).toBe("miss");
    expect(() => cache.putModels("future-provider", [syntheticModel, { ...syntheticModel, referenceId: "future-provider.second" }], 1_005)).toThrow(/entry limit/);

    cache.invalidate("third-provider", "models");
    expect(cache.readModels("third-provider", 1_006).state).toBe("miss");
    expect(cache.prune(1_200)).toBe(1);
    expect(cache.size).toBe(0);
  });
});

test.describe("Provider adapter contract-test kit", () => {
  const adapter: ProviderFixtureAdapter = {
    providerId: "future-provider",
    capabilityId: "tts.batch",
    adapterKind: "batch-tts",
    supportedCapabilityIds: ["tts.batch"],
    adapterVersion: "fixture/1.0.0",
    fixtureOnly: true,
    executeFixture: async (input, context) => {
      if (context.signal.aborted) throw new Error("cancelled");
      return {
        providerId: "future-provider",
        capabilityId: "tts.batch",
        status: "complete",
        provenance: "synthetic-fixture",
        output: { mimeType: "audio/wav", byteLength: input.text?.length ?? 0 },
      };
    },
  };

  const candidate: ProviderContractCandidate = {
    catalogEntry: syntheticCatalogEntry,
    adapters: [adapter],
    benchmarkCompatibleCapabilities: ["tts.batch"],
  };

  test("validates a synthetic future provider outside the installed provider enum", async () => {
    const validation = validateProviderContractCandidate(candidate, PROVIDER_CATALOG.map((entry) => entry.id));
    expect(validation).toEqual({ valid: true, issues: [] });

    const execution = await executeProviderFixtureContract(adapter, { text: "deterministic fixture" }, { timeoutMs: 100 });
    expect(execution).toEqual({
      ok: true,
      result: {
        providerId: "future-provider",
        capabilityId: "tts.batch",
        status: "complete",
        provenance: "synthetic-fixture",
        output: { mimeType: "audio/wav", byteLength: 21 },
      },
    });
  });

  test("rejects duplicates, mismatched identities, and undeclared benchmark capabilities", () => {
    const invalid = validateProviderContractCandidate({
      ...candidate,
      adapters: [{ ...adapter, providerId: "wrong-provider" }],
      benchmarkCompatibleCapabilities: ["stt.prerecorded"],
    }, ["future-provider"]);

    expect(invalid.valid).toBe(false);
    expect(invalid.issues.map((issue) => issue.code)).toEqual([
      "duplicate-provider-id",
      "adapter-provider-mismatch",
      "benchmark-capability-undeclared",
    ]);
  });

  test("normalizes cancellation, timeout, and fixture failures", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(executeProviderFixtureContract(adapter, {}, { timeoutMs: 100, signal: controller.signal })).resolves.toMatchObject({
      ok: false,
      error: { code: "cancelled" },
    });

    const hanging: ProviderFixtureAdapter = { ...adapter, executeFixture: async () => new Promise(() => undefined) };
    await expect(executeProviderFixtureContract(hanging, {}, { timeoutMs: 5 })).resolves.toMatchObject({
      ok: false,
      error: { code: "timed-out" },
    });

    const failing: ProviderFixtureAdapter = { ...adapter, executeFixture: async () => { throw new Error("sensitive upstream body"); } };
    const failure = await executeProviderFixtureContract(failing, {}, { timeoutMs: 100 });
    expect(failure).toMatchObject({ ok: false, error: { code: "fixture-failed" } });
    expect(JSON.stringify(failure)).not.toContain("sensitive upstream body");
  });
});
