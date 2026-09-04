import { expect, test } from "@playwright/test";

import {
  CONNORS_PICKS,
  CONNORS_PICKS_TITLE,
  FLUX_TTS_LAB_POLICY,
  FLUX_TTS_MODEL_ALLOWLIST,
  FLUX_TTS_VOICES,
  findFluxTtsVoice,
  isFluxTtsModel,
} from "@/lib/flux-tts-registry";
import {
  FLUX_TTS_BATCH_ENDPOINT,
  FluxTtsValidationError,
  buildFluxTtsBatchRequest,
  generateFluxTtsCodeExamples,
  sanitizeFluxTrace,
} from "@/lib/flux-tts";

test.describe("Flux TTS executable voice registry", () => {
  test("records the current catalog evidence and the explicit lab exclusion", () => {
    expect(FLUX_TTS_LAB_POLICY.documentedVoiceCount).toBe(36);
    expect(FLUX_TTS_VOICES).toHaveLength(35);
    expect(FLUX_TTS_LAB_POLICY.executableVoiceCount).toBe(35);
    expect(FLUX_TTS_LAB_POLICY.excludedDocumentedModels).toEqual(["flux-conor-en"]);
    expect(FLUX_TTS_LAB_POLICY.staleModelsNotInCurrentCatalog).toEqual(["flux-renee-en"]);
    expect(isFluxTtsModel("flux-conor-en")).toBe(false);
    expect(isFluxTtsModel("flux-renee-en")).toBe(false);
    expect(FLUX_TTS_MODEL_ALLOWLIST.has("flux-cole-en")).toBe(true);
  });

  test("gives every executable voice complete metadata and unique model IDs", () => {
    expect(new Set(FLUX_TTS_VOICES.map((voice) => voice.model)).size).toBe(FLUX_TTS_VOICES.length);
    for (const voice of FLUX_TTS_VOICES) {
      expect(voice).toMatchObject({
        language: "English",
        status: "Early Access",
        statusScope: "lab",
        statusNote: "Community lab maturity label; not a Deepgram availability claim.",
        verifiedAt: "2026-08-14",
        transports: ["batch", "streaming"],
      });
      expect(voice.displayName).toBeTruthy();
      expect(voice.accent).toBeTruthy();
      expect(voice.gender).toMatch(/Female|Male/);
      expect(voice.age).toBeTruthy();
      expect(voice.character.length).toBeGreaterThan(0);
      expect(voice.officialSource).toBe("https://developers.deepgram.com/docs/flux-tts/voices");
      expect(findFluxTtsVoice(voice.model)).toBe(voice);
    }
  });

  test("keeps Connor's Picks a preference group for Cole and Jack", () => {
    expect(CONNORS_PICKS_TITLE).toBe("Connor's Picks");
    expect(CONNORS_PICKS.map((voice) => voice.model)).toEqual(["flux-cole-en", "flux-jack-en"]);
  });
});

test.describe("Flux TTS batch request builder", () => {
  test("builds only the fixed /v2/speak endpoint and documented query fields", () => {
    const prepared = buildFluxTtsBatchRequest({
      text: "  A controlled fixture.  ",
      model: "flux-cole-en",
      encoding: "linear16",
      container: "none",
      sample_rate: 44_100,
    });

    expect(prepared.url.origin + prepared.url.pathname).toBe(FLUX_TTS_BATCH_ENDPOINT);
    expect(Object.fromEntries(prepared.url.searchParams)).toEqual({
      model: "flux-cole-en",
      encoding: "linear16",
      container: "none",
      sample_rate: "44100",
    });
    expect(JSON.parse(prepared.body)).toEqual({ text: "A controlled fixture." });
    expect(prepared.fallbackContentType).toBe("audio/l16;rate=44100");
  });

  test("applies mp3 defaults and accepts documented Opus and FLAC combinations", () => {
    const mp3 = buildFluxTtsBatchRequest({ text: "Fixture", model: "flux-jack-en" });
    expect(mp3.url.searchParams.get("encoding")).toBe("mp3");
    expect(mp3.fallbackContentType).toBe("audio/mpeg");
    expect(() => buildFluxTtsBatchRequest({ text: "Fixture", model: "flux-jack-en", encoding: "opus", container: "ogg" })).not.toThrow();
    expect(() => buildFluxTtsBatchRequest({ text: "Fixture", model: "flux-jack-en", encoding: "flac", sample_rate: 22_050 })).not.toThrow();
  });

  test("rejects unsupported models, arbitrary fields, and invalid format combinations", () => {
    const invalid = [
      { text: "Fixture", model: "flux-conor-en" },
      { text: "Fixture", model: "flux-renee-en" },
      { text: "Fixture", model: "flux-cole-en", callback: "https://example.test" },
      { text: "Fixture", model: "flux-cole-en", upstreamUrl: "https://example.test/v2/speak" },
      { text: "Fixture", model: "flux-cole-en", encoding: "mp3", sample_rate: 24_000 },
      { text: "Fixture", model: "flux-cole-en", encoding: "aac", container: "wav" },
      { text: "Fixture", model: "flux-cole-en", encoding: "opus", container: "none" },
      { text: "Fixture", model: "flux-cole-en", encoding: "mulaw", sample_rate: 24_000 },
      { text: " ", model: "flux-cole-en" },
    ];
    for (const input of invalid) expect(() => buildFluxTtsBatchRequest(input)).toThrow(FluxTtsValidationError);
  });
});

test("generates placeholder-only examples and sanitizes credentials recursively", () => {
  const snippets = generateFluxTtsCodeExamples({ text: "Same input", model: "flux-cole-en", encoding: "mp3" });
  expect(snippets.curl).toContain("$DEEPGRAM_API_KEY");
  expect(snippets.JavaScript).toContain("process.env.DEEPGRAM_API_KEY");
  expect(snippets.Python).toContain("os.environ['DEEPGRAM_API_KEY']");
  expect(Object.values(snippets).join("\n")).not.toContain("unit-test-permanent-key");

  const sanitized = sanitizeFluxTrace({
    Authorization: "Token unit-test-permanent-key",
    nested: { access_token: "eyJabc.def.ghi", safe: "keep" },
    message: "Bearer another-token and unit-test-permanent-key",
  }, ["unit-test-permanent-key"]);
  expect(sanitized).toEqual({
    Authorization: "***redacted***",
    nested: { access_token: "***redacted***", safe: "keep" },
    message: "Bearer ***redacted*** and ***redacted***",
  });
});
