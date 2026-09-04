import { expect, test } from "@playwright/test";

import {
  OpenLabDeepgramDisabledError,
  OpenLabProviderDisabledError,
  assertOpenLabDeepgramEnabled,
  assertOpenLabElevenLabsEnabled,
  assertOpenLabCartesiaEnabled,
  isOpenLabDeepgramEnabled,
  isOpenLabCartesiaEnabled,
  isOpenLabElevenLabsEnabled,
  isOpenLabFishAudioEnabled,
  isOpenLabMode,
  shouldUseHostedReviewMode,
} from "@/lib/open-lab";

test.describe("Open Lab provider configuration", () => {
  test("separates public UX mode from the private provider switch", () => {
    expect(isOpenLabMode({ OPEN_LAB_MODE: "true" })).toBe(true);
    expect(isOpenLabMode({ OPEN_LAB_MODE: "false" })).toBe(false);
    expect(isOpenLabDeepgramEnabled({ OPEN_LAB_MODE: "true" })).toBe(false);
    expect(isOpenLabDeepgramEnabled({ OPEN_LAB_MODE: "true", OPEN_LAB_DEEPGRAM_ENABLED: "true" })).toBe(true);
    expect(isOpenLabDeepgramEnabled({ OPEN_LAB_MODE: "true", OPEN_LAB_DEEPGRAM_ENABLED: "false" })).toBe(false);
    expect(shouldUseHostedReviewMode({ VERCEL: "1", OPEN_LAB_MODE: "true" })).toBe(false);
    expect(shouldUseHostedReviewMode({ VERCEL: "1", OPEN_LAB_MODE: "false" })).toBe(false);
    expect(shouldUseHostedReviewMode({ HOSTED_REVIEW_MODE: "true", OPEN_LAB_MODE: "false" })).toBe(true);
    expect(shouldUseHostedReviewMode({ HOSTED_REVIEW_MODE: "true", OPEN_LAB_MODE: "true" })).toBe(false);
    expect(isOpenLabElevenLabsEnabled({ OPEN_LAB_MODE: "true" })).toBe(false);
    for (const enabledOpenLabValue of ["true", "1", "yes", "on", "TRUE"]) {
      expect(isOpenLabElevenLabsEnabled({
        OPEN_LAB_MODE: enabledOpenLabValue,
        OPEN_LAB_ELEVENLABS_ENABLED: "true",
      })).toBe(false);
    }
    expect(isOpenLabFishAudioEnabled({ OPEN_LAB_MODE: "true" })).toBe(false);
    expect(isOpenLabFishAudioEnabled({ OPEN_LAB_MODE: "true", OPEN_LAB_FISH_AUDIO_ENABLED: "true" })).toBe(true);
    expect(isOpenLabCartesiaEnabled({ OPEN_LAB_MODE: "true" })).toBe(false);
    expect(isOpenLabCartesiaEnabled({ OPEN_LAB_MODE: "true", OPEN_LAB_CARTESIA_ENABLED: "true" })).toBe(true);
  });

  test("preserves existing live-route behavior outside Open Lab unless explicitly disabled", () => {
    expect(isOpenLabDeepgramEnabled({})).toBe(true);
    expect(isOpenLabDeepgramEnabled({ OPEN_LAB_MODE: "false" })).toBe(true);
    expect(isOpenLabDeepgramEnabled({ OPEN_LAB_MODE: "false", OPEN_LAB_DEEPGRAM_ENABLED: "false" })).toBe(false);
    expect(isOpenLabDeepgramEnabled({ OPEN_LAB_DEEPGRAM_ENABLED: "unexpected" })).toBe(false);
    expect(isOpenLabElevenLabsEnabled({ OPEN_LAB_MODE: "false" })).toBe(true);
    expect(isOpenLabElevenLabsEnabled({ OPEN_LAB_MODE: "false", OPEN_LAB_ELEVENLABS_ENABLED: "true" })).toBe(true);
    expect(isOpenLabElevenLabsEnabled({ OPEN_LAB_MODE: "false", OPEN_LAB_ELEVENLABS_ENABLED: "false" })).toBe(false);
    expect(isOpenLabCartesiaEnabled({ OPEN_LAB_MODE: "false" })).toBe(true);
    expect(isOpenLabCartesiaEnabled({ OPEN_LAB_MODE: "false", OPEN_LAB_CARTESIA_ENABLED: "false" })).toBe(false);
  });

  test("throws only a safe typed error when provider execution is disabled", () => {
    expect(() => assertOpenLabDeepgramEnabled({ OPEN_LAB_MODE: "true" })).toThrow(OpenLabDeepgramDisabledError);
    try {
      assertOpenLabDeepgramEnabled({ OPEN_LAB_MODE: "true", OPEN_LAB_DEEPGRAM_ENABLED: "false" });
      throw new Error("Expected the provider switch to reject execution.");
    } catch (error) {
      expect(error).toMatchObject({ code: "open_lab_deepgram_disabled", status: 503 });
      expect(String(error)).not.toContain("OPEN_LAB_DEEPGRAM_ENABLED");
    }

    expect(() => assertOpenLabElevenLabsEnabled({
      OPEN_LAB_MODE: "true",
      OPEN_LAB_ELEVENLABS_ENABLED: "true",
    })).toThrow(OpenLabProviderDisabledError);
    expect(() => assertOpenLabCartesiaEnabled({
      OPEN_LAB_MODE: "true",
      OPEN_LAB_CARTESIA_ENABLED: "false",
    })).toThrow(OpenLabProviderDisabledError);
  });
});
