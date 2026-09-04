import { expect, test } from "@playwright/test";

import { PROVIDER_ADAPTER_REGISTRATIONS } from "../../src/lib/providers/adapters";
import { getProviderCatalogEntry } from "../../src/lib/providers/catalog";
import {
  executeProviderFixtureContract,
  validateProviderContractCandidate,
} from "../../src/lib/providers/contract-test-kit";
import {
  elevenLabsNormalizedDiscoveryAdapter,
  elevenLabsSttAdapter,
  elevenLabsTtsAdapter,
} from "../../src/lib/providers/elevenlabs/adapters";
import {
  ELEVENLABS_CONTRACT_CANDIDATE,
  ELEVENLABS_DISCOVERY_FIXTURES,
  ELEVENLABS_FIXTURE_ADAPTERS,
} from "../../src/lib/providers/elevenlabs/fixtures";
import {
  ElevenLabsNormalizationError,
  normalizeElevenLabsModels,
  normalizeElevenLabsVoicePage,
} from "../../src/lib/providers/elevenlabs/normalization";
import {
  authorizeProviderExecution,
  setProviderExecutionPolicyResolverForTests,
} from "../../src/lib/providers/execution-policy";
import { getProviderPlatformProjection } from "../../src/lib/providers/platform-service";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_KEY = process.env.ELEVENLABS_API_KEY;

test.afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_KEY === undefined) delete process.env.ELEVENLABS_API_KEY;
  else process.env.ELEVENLABS_API_KEY = ORIGINAL_KEY;
  setProviderExecutionPolicyResolverForTests();
});

test.describe("ElevenLabs canonical provider convergence", () => {
  test("registers stable identity, exact capabilities, normalized discovery, and four fixture contracts", () => {
    const entry = getProviderCatalogEntry("elevenlabs");
    const registration = PROVIDER_ADAPTER_REGISTRATIONS.elevenlabs;

    expect(entry?.capabilities.map((capability) => capability.id)).toEqual([
      "discovery.models",
      "discovery.voices",
      "stt.prerecorded",
      "tts.batch",
      "tts.voice-selection",
    ]);
    expect(registration?.credentialEnvironmentVariables).toEqual(["ELEVENLABS_API_KEY"]);
    expect(registration?.normalizedDiscovery).toBe(elevenLabsNormalizedDiscoveryAdapter);
    expect(registration?.fixtureAdapters).toHaveLength(4);
    expect(validateProviderContractCandidate(ELEVENLABS_CONTRACT_CANDIDATE)).toEqual({ valid: true, issues: [] });
  });

  test("executes deterministic synthetic fixtures without network or performance claims", async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; throw new Error("network must remain unused"); };

    for (const adapter of ELEVENLABS_FIXTURE_ADAPTERS) {
      const execution = await executeProviderFixtureContract(adapter, {
        text: "deterministic ElevenLabs fixture",
        audio: Uint8Array.of(1, 2, 3),
      }, { timeoutMs: 100 });
      expect(execution).toMatchObject({
        ok: true,
        result: { providerId: "elevenlabs", provenance: "synthetic-fixture", status: "complete" },
      });
    }
    expect(calls).toBe(0);
  });

  test("normalizes only canonical account-scoped model and voice fields", () => {
    const models = normalizeElevenLabsModels(ELEVENLABS_DISCOVERY_FIXTURES.models);
    const voices = normalizeElevenLabsVoicePage(
      ELEVENLABS_DISCOVERY_FIXTURES.voices,
      models.models.map((model) => model.referenceId),
    );

    expect(models.models[0]).toMatchObject({
      providerId: "elevenlabs",
      providerModelId: "eleven_fixture_v2",
      capabilities: ["tts.batch", "tts.voice-selection"],
      languages: ["en"],
    });
    expect(voices.voices[0]).toMatchObject({
      providerId: "elevenlabs",
      providerVoiceId: "voice_fixture",
      displayName: "Fixture Voice",
      supportedModelReferences: ["elevenlabs:eleven_fixture_v2"],
      languages: [],
    });
    const serialized = JSON.stringify({ models, voices });
    for (const privateValue of ["private_account_metadata", "must-not-survive", "preview_url", "samples", "labels"]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  test("rejects malformed and normalized-identifier collisions deterministically", () => {
    expect(() => normalizeElevenLabsModels(ELEVENLABS_DISCOVERY_FIXTURES.malformedModels))
      .toThrow(ElevenLabsNormalizationError);
    expect(() => normalizeElevenLabsVoicePage(ELEVENLABS_DISCOVERY_FIXTURES.malformedVoices, []))
      .toThrow(ElevenLabsNormalizationError);
    expect(() => normalizeElevenLabsModels([
      { model_id: "MODEL_A", can_do_text_to_speech: true },
      { model_id: "model_a", can_do_text_to_speech: true },
    ])).toThrow(ElevenLabsNormalizationError);
  });

  test("separates registration, configuration, fixture readiness, and live readiness", () => {
    const unconfigured = getProviderPlatformProjection("elevenlabs", { environment: {}, policies: [] });
    const configured = getProviderPlatformProjection("elevenlabs", {
      environment: { ELEVENLABS_API_KEY: "server-only-marker", ONE_LIVE_LAB_ENABLED: "true" },
      policies: [],
    });

    expect(unconfigured).toMatchObject({
      id: "elevenlabs",
      lifecycle: { integration: "contract-tests-passed", runtime: "disabled", benchmark: "ineligible" },
      readiness: { state: "adapter-backed" },
      credential: { required: true, state: "unconfigured" },
      integration: { installed: true, fixtureCapable: true },
    });
    expect(unconfigured?.models).toEqual([]);
    expect(unconfigured?.voices).toEqual([]);
    expect(configured).toMatchObject({
      lifecycle: { integration: "configured", runtime: "disabled" },
      readiness: { state: "configured" },
      credential: { state: "configured-not-runtime-verified" },
    });
    expect(JSON.stringify(configured)).not.toContain("server-only-marker");
    expect(JSON.stringify(configured)).not.toContain("ELEVENLABS_API_KEY");
  });

  test("fails direct live adapters closed before fetch despite credential presence", async () => {
    process.env.ELEVENLABS_API_KEY = "eleven-secret-that-must-not-surface";
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; throw new Error("must not run"); };

    await expect(elevenLabsNormalizedDiscoveryAdapter.listModels())
      .rejects.toMatchObject({ code: "provider_access_unavailable", status: 503 });
    await expect(elevenLabsNormalizedDiscoveryAdapter.listVoices({ pageSize: 10 }))
      .rejects.toMatchObject({ code: "provider_access_unavailable", status: 503 });
    await expect(elevenLabsTtsAdapter.execute({
      text: "must not dispatch",
      model: "eleven_fixture_v2",
      voice: "voice_fixture",
      outputFormat: "mp3_44100_128",
    })).rejects.toMatchObject({ code: "provider_access_unavailable", status: 503 });
    await expect(elevenLabsSttAdapter.execute({
      file: new File([Uint8Array.of(1)], "fixture.wav", { type: "audio/wav" }),
      model: "scribe_v2",
    })).rejects.toMatchObject({ code: "provider_access_unavailable", status: 503 });
    expect(calls).toBe(0);
  });

  test("requires independent operation-bound proofs before composite TTS discovery", async () => {
    process.env.ELEVENLABS_API_KEY = "server-only-fixture";
    allowCanonicalExecution();
    const ttsAuthorization = await authorizeProviderExecution("elevenlabs", "tts");
    const modelAuthorization = await authorizeProviderExecution("elevenlabs", "models");
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; throw new Error("must not run"); };

    await expect(elevenLabsTtsAdapter.execute({
      text: "proofs remain narrow",
      model: "eleven_fixture_v2",
      voice: "voice_fixture",
      outputFormat: "mp3_44100_128",
    }, {
      authorization: ttsAuthorization,
      modelDiscoveryAuthorization: modelAuthorization,
      discoveryAuthorization: ttsAuthorization,
    })).rejects.toMatchObject({ code: "provider_access_unavailable", status: 503 });
    expect(calls).toBe(0);
  });
});

function allowCanonicalExecution() {
  setProviderExecutionPolicyResolverForTests(async (providerId, capabilityId) => ({
    ok: true,
    value: {
      known: true,
      providerId,
      capabilityId: capabilityId as "tts.batch",
      accessMode: "public-use",
      runtimeStatus: "enabled",
      benchmarkStatus: "ineligible",
      providerRevision: 1,
      capabilityRevision: 1,
    },
  }));
}
