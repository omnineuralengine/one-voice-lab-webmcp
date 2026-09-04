import { expect, test } from "@playwright/test";

import {
  compareReson8SyntheticTranscript,
  normalizeReson8SyntheticTranscript,
  requireReson8SyntheticTranscript,
  reson8SyntheticTranscriptComparisonSchema,
} from "../../src/lib/providers/reson8/live-transcript";
import { RESON8_LIVE_EXPECTED_PHRASE } from "../../src/lib/providers/reson8/live-verifier";

test.describe("Reson8 synthetic transcript fidelity", () => {
  test("distinguishes raw exact and normalized punctuation, capitalization, and whitespace matches", () => {
    expect(compare(RESON8_LIVE_EXPECTED_PHRASE).status).toBe("exact");
    for (const observed of [
      RESON8_LIVE_EXPECTED_PHRASE.toLocaleUpperCase("en-US"),
      "This short recording verifies turn detection without personal information!",
      "  This\tshort recording verifies turn detection\nwithout personal information.  ",
    ]) {
      expect(compare(observed)).toMatchObject({
        status: "normalized-match",
        wordErrorRate: 0,
        substitutions: 0,
        insertions: 0,
        deletions: 0,
      });
    }
  });

  test("normalizes Unicode compatibility characters and apostrophe variants deterministically", () => {
    expect(normalizeReson8SyntheticTranscript("Ｔｈｉｓ isn’t private."))
      .toBe("this isnt private");
    expect(compare("Ｔｈｉｓ short recording verifies turn detection without personal information."))
      .toMatchObject({ status: "normalized-match", wordErrorRate: 0 });
  });

  test("classifies a small bounded difference as approximate with transparent WER", () => {
    const result = compare(
      "This brief recording verifies turn detection without personal information.",
    );
    expect(result).toMatchObject({
      status: "approximate-match",
      substitutions: 1,
      insertions: 0,
      deletions: 0,
      expectedTokenCount: 9,
      observedTokenCount: 9,
      wordErrorRate: 0.111111,
    });
  });

  test("classifies material and empty output as mismatch", () => {
    expect(compare("unrelated output with little shared content").status).toBe("mismatch");
    expect(compare("")).toMatchObject({
      status: "mismatch",
      observedTokenCount: 0,
      deletions: 9,
      wordErrorRate: 1,
    });
    expect(() => requireReson8SyntheticTranscript({
      expected: RESON8_LIVE_EXPECTED_PHRASE,
      observed: "",
      provenance: "local-synthetic-speech",
    })).toThrow(/no required transcript/i);
  });

  test("reports substitutions, insertions, and deletions using deterministic word edits", () => {
    const result = compareReson8SyntheticTranscript({
      expected: "alpha beta gamma delta",
      observed: "alpha theta delta extra",
      provenance: "local-synthetic-speech",
    });
    expect(result).toMatchObject({
      substitutions: 1,
      deletions: 1,
      insertions: 1,
      wordErrorRate: 0.75,
      status: "mismatch",
    });
  });

  test("permits sanitized diagnostics only for fixed local synthetic speech", () => {
    expect(() => compareReson8SyntheticTranscript({
      expected: RESON8_LIVE_EXPECTED_PHRASE,
      observed: "private user transcript",
      provenance: "private-user-audio",
    })).toThrow(/only.*local synthetic/i);

    const valid = compare(RESON8_LIVE_EXPECTED_PHRASE);
    expect(() => reson8SyntheticTranscriptComparisonSchema.parse({
      ...valid,
      sourceProvenance: "private-user-audio",
    })).toThrow();
  });
});

function compare(observed: string) {
  return compareReson8SyntheticTranscript({
    expected: RESON8_LIVE_EXPECTED_PHRASE,
    observed,
    provenance: "local-synthetic-speech",
  });
}
