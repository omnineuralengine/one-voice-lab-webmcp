import { expect, test } from "@playwright/test";

import { getProviderConfigurationState, getProviderConfigurationStates } from "../../src/lib/providers/configuration";
import { assertProviderTtsAdapterRegistration, getProviderAdapterRegistration } from "../../src/lib/providers/adapters";
import { ProviderAdapterError } from "../../src/lib/providers/errors";
import {
  getProviderManifest,
  PROVIDER_REGISTRY,
  requireExecutableCapability,
  requireProviderManifest,
} from "../../src/lib/providers/registry";
import {
  providerManifestSchema,
  PROVIDER_STATUSES,
  type ProviderManifest,
  type ProviderTtsAdapter,
} from "../../src/lib/providers/types";

test.describe("Provider Registry", () => {
  test("has unique IDs and valid status vocabulary", () => {
    const ids = PROVIDER_REGISTRY.map((provider) => provider.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(PROVIDER_REGISTRY.every((provider) => PROVIDER_STATUSES.includes(provider.status))).toBe(true);
  });

  test("allowlists only four live provider manifests while Reson8 remains fixture-only", () => {
    const deepgram = requireProviderManifest("deepgram");
    expect(deepgram.liveExecutionEnabled).toBe(true);
    expect(deepgram.adapterCapabilities).toEqual(["models", "voices", "stt-prerecorded", "tts"]);
    expect(PROVIDER_REGISTRY.filter((provider) => provider.liveExecutionEnabled).map((provider) => provider.id)).toEqual(["deepgram", "elevenlabs", "fish-audio", "cartesia"]);
    expect(getProviderManifest("reson8")).toBeNull();
    expect(getProviderAdapterRegistration("reson8")?.fixtureAdapters).toHaveLength(3);
  });

  test("registers ElevenLabs as a bounded Partial integration", () => {
    const elevenLabs = requireProviderManifest("elevenlabs");
    expect(elevenLabs.status).toBe("Partial");
    expect(elevenLabs.liveExecutionEnabled).toBe(true);
    expect(elevenLabs.capabilities.map((item) => item.id)).toEqual(["models", "voices", "stt-prerecorded", "tts"]);
    expect(elevenLabs.capabilities.every((item) => item.status === "Prototype")).toBe(true);
    expect(elevenLabs.adapterCapabilities).toEqual(["models", "voices", "stt-prerecorded", "tts"]);
    expect(elevenLabs.environmentVariables).toEqual(["ELEVENLABS_API_KEY"]);
  });

  test("registers Fish Audio as a bounded Partial integration", () => {
    const fishAudio = requireProviderManifest("fish-audio");
    expect(fishAudio.status).toBe("Partial");
    expect(fishAudio.liveExecutionEnabled).toBe(true);
    expect(fishAudio.capabilities.map((item) => item.id)).toEqual(["models", "voices", "stt-prerecorded", "tts"]);
    expect(fishAudio.capabilities.every((item) => item.status === "Prototype")).toBe(true);
    expect(fishAudio.adapterCapabilities).toEqual(["models", "voices", "stt-prerecorded", "tts"]);
    expect(fishAudio.environmentVariables).toEqual(["FISH_AUDIO_API_KEY"]);
  });

  test("registers Cartesia as a repository-verified canonical Partial integration", () => {
    const cartesia = requireProviderManifest("cartesia");
    expect(cartesia.status).toBe("Partial");
    expect(cartesia.liveExecutionEnabled).toBe(true);
    expect(cartesia.capabilities.map((item) => item.id)).toEqual(["models", "voices", "tts"]);
    expect(cartesia.capabilities.every((item) => item.status === "Prototype")).toBe(true);
    expect(cartesia.capabilities.map((item) => item.evidence)).toEqual([
      "Documentation verified",
      "Repository verified",
      "Repository verified",
    ]);
    expect(cartesia.adapterCapabilities).toEqual(["models", "voices", "tts"]);
    expect(cartesia.environmentVariables).toEqual(["CARTESIA_API_KEY"]);
  });

  test("fails closed for unknown providers and unavailable capabilities", () => {
    expect(getProviderManifest("unknown-provider")).toBeNull();
    expect(() => requireProviderManifest("unknown-provider")).toThrow(ProviderAdapterError);
    expect(() => requireExecutableCapability("deepgram", "voice-agent")).toThrow(/not implemented/);
  });

  test("configuration serialization exposes booleans only", () => {
    const marker = "configured-value-must-stay-private";
    const configured = getProviderConfigurationState("deepgram", { DEEPGRAM_API_KEY: marker });
    const states = getProviderConfigurationStates({
      DEEPGRAM_API_KEY: marker,
      ELEVENLABS_API_KEY: marker,
      FISH_AUDIO_API_KEY: marker,
      CARTESIA_API_KEY: marker,
    });

    expect(configured).toEqual({ providerId: "deepgram", configured: true });
    expect(states.elevenlabs).toEqual({ providerId: "elevenlabs", configured: true });
    expect(states["fish-audio"]).toEqual({ providerId: "fish-audio", configured: true });
    expect(states.cartesia).toEqual({ providerId: "cartesia", configured: true });
    expect(Object.keys(configured).sort()).toEqual(["configured", "providerId"]);
    expect(JSON.stringify({ registry: PROVIDER_REGISTRY, states })).not.toContain(marker);
  });

  test("rejects contradictory Planned manifests and public credential variable names", () => {
    const elevenLabs = requireProviderManifest("elevenlabs");
    const contradictory = {
      ...elevenLabs,
      status: "Planned",
      liveExecutionEnabled: true,
      environmentVariables: ["NEXT_PUBLIC_PROVIDER_API_KEY"],
    } satisfies ProviderManifest;

    expect(providerManifestSchema.safeParse(contradictory).success).toBe(false);
  });

  test("rejects adapters registered under a different provider identity", () => {
    const mismatchedAdapter = {
      providerId: "elevenlabs",
      capability: "tts",
      adapterVersion: "test-adapter/1.0.0",
      buildEndpointPreview: () => "https://example.invalid",
      execute: async () => {
        throw new Error("must not execute");
      },
    } satisfies ProviderTtsAdapter;

    expect(() => assertProviderTtsAdapterRegistration("deepgram", mismatchedAdapter)).toThrow(
      /Invalid TTS adapter registration/,
    );
  });
});
