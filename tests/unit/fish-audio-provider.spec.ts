import { expect, test } from "@playwright/test";

import { PROVIDER_ADAPTER_REGISTRATIONS } from "../../src/lib/providers/adapters";
import { getProviderCatalogEntry } from "../../src/lib/providers/catalog";
import {
  executeProviderFixtureContract,
  validateProviderContractCandidate,
} from "../../src/lib/providers/contract-test-kit";
import {
  authorizeProviderExecution,
  setProviderExecutionPolicyResolverForTests,
} from "../../src/lib/providers/execution-policy";
import { fishAudioNormalizedDiscoveryAdapter, fishAudioTtsAdapter } from "../../src/lib/providers/fish-audio/adapters";
import {
  FISH_AUDIO_CONTRACT_CANDIDATE,
  FISH_AUDIO_FIXTURE_ADAPTERS,
  FISH_AUDIO_PUBLIC_DISCOVERY_FIXTURES,
} from "../../src/lib/providers/fish-audio/fixtures";
import {
  FishAudioNormalizationError,
  normalizeFishAudioPublicVoicePage,
} from "../../src/lib/providers/fish-audio/normalization";
import { getProviderPlatformProjection } from "../../src/lib/providers/platform-service";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_KEY = process.env.FISH_AUDIO_API_KEY;

test.afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_KEY === undefined) delete process.env.FISH_AUDIO_API_KEY;
  else process.env.FISH_AUDIO_API_KEY = ORIGINAL_KEY;
  setProviderExecutionPolicyResolverForTests();
});

test.describe("Fish Audio canonical provider convergence", () => {
  test("registers stable identity, explicit capabilities, normalized discovery, and four fixture contracts", () => {
    const entry = getProviderCatalogEntry("fish-audio");
    const registration = PROVIDER_ADAPTER_REGISTRATIONS["fish-audio"];

    expect(entry?.capabilities.map((capability) => capability.id)).toEqual([
      "discovery.models",
      "discovery.voices",
      "stt.prerecorded",
      "tts.batch",
      "tts.voice-selection",
    ]);
    expect(registration?.credentialEnvironmentVariables).toEqual(["FISH_AUDIO_API_KEY"]);
    expect(registration?.normalizedDiscovery).toBe(fishAudioNormalizedDiscoveryAdapter);
    expect(registration?.fixtureAdapters).toHaveLength(4);
    expect(validateProviderContractCandidate(FISH_AUDIO_CONTRACT_CANDIDATE)).toEqual({ valid: true, issues: [] });
  });

  test("executes deterministic fixtures without network or live-performance claims", async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; throw new Error("network must remain unused"); };

    for (const adapter of FISH_AUDIO_FIXTURE_ADAPTERS) {
      const execution = await executeProviderFixtureContract(adapter, {
        text: "deterministic Fish fixture",
        audio: Uint8Array.of(1, 2, 3),
      }, { timeoutMs: 100 });
      expect(execution).toMatchObject({
        ok: true,
        result: { providerId: "fish-audio", provenance: "synthetic-fixture", status: "complete" },
      });
    }
    expect(calls).toBe(0);
  });

  test("normalizes public discovery and deterministically rejects private, empty, and malformed states", () => {
    const success = normalizeFishAudioPublicVoicePage(FISH_AUDIO_PUBLIC_DISCOVERY_FIXTURES.success);
    expect(success.voices).toHaveLength(1);
    expect(success.voices[0]).toMatchObject({
      providerId: "fish-audio",
      providerVoiceId: "public-voice-1",
      displayName: "Public Fixture Voice",
      languages: ["en"],
      availability: "unknown",
    });
    expect(JSON.stringify(success)).not.toContain("Private Fixture Voice");
    expect(normalizeFishAudioPublicVoicePage(FISH_AUDIO_PUBLIC_DISCOVERY_FIXTURES.empty)).toEqual({
      voices: [],
      hasMore: false,
    });
    expect(() => normalizeFishAudioPublicVoicePage(FISH_AUDIO_PUBLIC_DISCOVERY_FIXTURES.malformed))
      .toThrow(FishAudioNormalizationError);
  });

  test("projects registration, configuration, fixture readiness, and live readiness as separate states", () => {
    const unconfigured = getProviderPlatformProjection("fish-audio", { environment: {}, policies: [] });
    const configured = getProviderPlatformProjection("fish-audio", {
      environment: { FISH_AUDIO_API_KEY: "server-only-marker", ONE_LIVE_LAB_ENABLED: "true" },
      policies: [],
    });

    expect(unconfigured).toMatchObject({
      id: "fish-audio",
      lifecycle: { integration: "contract-tests-passed", runtime: "disabled" },
      readiness: { state: "adapter-backed" },
      credential: { required: true, state: "unconfigured" },
      integration: { installed: true, fixtureCapable: true },
    });
    expect(unconfigured?.models.map((model) => model.providerModelId)).toEqual(["s1", "s2-pro"]);
    expect(configured).toMatchObject({
      lifecycle: { integration: "configured", runtime: "disabled" },
      readiness: { state: "configured" },
      credential: { state: "configured-not-runtime-verified" },
    });
    expect(JSON.stringify(configured)).not.toContain("server-only-marker");
    expect(JSON.stringify(configured)).not.toContain("FISH_AUDIO_API_KEY");
  });

  test("fails direct live adapter calls closed before fetch even when a credential exists", async () => {
    process.env.FISH_AUDIO_API_KEY = "fish-secret-that-must-not-surface";
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; throw new Error("must not run"); };
    setProviderExecutionPolicyResolverForTests(async () => ({ ok: false, code: "unavailable" }));

    await expect(fishAudioTtsAdapter.execute({ text: "must not dispatch", model: "s2-pro", outputFormat: "mp3" }))
      .rejects.toMatchObject({ code: "provider_access_unavailable", status: 503 });
    await expect(fishAudioNormalizedDiscoveryAdapter.listVoices({ pageSize: 10 }))
      .rejects.toMatchObject({ code: "provider_access_unavailable", status: 503 });
    expect(calls).toBe(0);
  });

  test("binds policy authorization to one provider operation", async () => {
    setProviderExecutionPolicyResolverForTests(async (providerId, capabilityId) => ({
      ok: true,
      value: {
        known: true,
        providerId,
        capabilityId: capabilityId as "tts.batch",
        accessMode: "public-use",
        runtimeStatus: "enabled",
        benchmarkStatus: "ineligible",
        providerRevision: 4,
        capabilityRevision: 2,
      },
    }));
    const authorization = await authorizeProviderExecution("fish-audio", "tts");
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; throw new Error("must not run"); };

    await expect(fishAudioNormalizedDiscoveryAdapter.listVoices(
      { pageSize: 10 },
      { authorization },
    )).rejects.toMatchObject({ code: "provider_access_unavailable" });
    expect(calls).toBe(0);
  });
});
