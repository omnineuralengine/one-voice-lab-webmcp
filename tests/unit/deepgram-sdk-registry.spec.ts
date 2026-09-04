import { expect, test } from "@playwright/test";

import {
  DEEPGRAM_SDK_REGISTRY,
  DEEPGRAM_SDK_REGISTRY_VERSION,
  deepgramSdkFeatureSupportSchema,
  deepgramSdkRegistrySchema,
  findDeepgramSdkByPackage,
  getDeepgramSdkRegistryFreshness,
  getDeepgramSdkFeatureSupport,
  getDeepgramSdkSourceFreshness,
  isOfficialDeepgramSdkSourceUrl,
  selectDeepgramSdkMigrationSources,
} from "../../src/lib/deepgram-sdk-registry";

test.describe("Deepgram SDK registry snapshot", () => {
  test("validates the complete strict v1 snapshot without an eternal latest-version field", () => {
    expect(deepgramSdkRegistrySchema.parse(DEEPGRAM_SDK_REGISTRY).registryVersion).toBe(DEEPGRAM_SDK_REGISTRY_VERSION);
    expect(DEEPGRAM_SDK_REGISTRY.sdks.map((sdk) => sdk.id)).toEqual([
      "javascript-typescript",
      "python",
      "go",
      "dotnet",
      "java",
      "rust",
    ]);
    expect(JSON.stringify(DEEPGRAM_SDK_REGISTRY)).not.toContain("latestVersion");
    expect(DEEPGRAM_SDK_REGISTRY.sources.filter((item) => item.sourceType === "release-index").every((item) => item.releaseTag === null)).toBe(true);

    const withUnexpectedField = { ...DEEPGRAM_SDK_REGISTRY, latestVersion: "must-not-pass" };
    expect(deepgramSdkRegistrySchema.safeParse(withUnexpectedField).success).toBe(false);
  });

  test("preserves current first-party package identifiers and Rust support status", () => {
    expect(findDeepgramSdkByPackage("@deepgram/sdk")?.id).toBe("javascript-typescript");
    expect(findDeepgramSdkByPackage("deepgram-sdk")?.id).toBe("python");
    expect(findDeepgramSdkByPackage("github.com/deepgram/deepgram-go-sdk/v3/pkg/client/listen")?.id).toBe("go");
    expect(findDeepgramSdkByPackage("Deepgram")?.id).toBe("dotnet");
    expect(findDeepgramSdkByPackage("com.deepgram:deepgram-java-sdk:0.7.1")?.id).toBe("java");
    expect(findDeepgramSdkByPackage("deepgram")?.id).toBe("rust");
    expect(findDeepgramSdkByPackage("unrelated-package")).toBeNull();
    expect(findDeepgramSdkByPackage("deepgram-sdk-malicious")).toBeNull();
    expect(findDeepgramSdkByPackage("deepgram")?.supportStatus).toBe("community-maintained");
  });

  test("selects only the exact verified migration transition", () => {
    expect(selectDeepgramSdkMigrationSources("javascript-typescript", "v4", "5.1.0")).toMatchObject([{
      id: "migration-javascript-4-5",
      canonicalUrl: "https://github.com/deepgram/deepgram-js-sdk/blob/main/docs/Migrating-v4-to-v5.md",
    }]);
    expect(selectDeepgramSdkMigrationSources("python", "3+", "v5")).toMatchObject([{
      id: "migration-python-3-5",
      canonicalUrl: "https://github.com/deepgram/deepgram-python-sdk/blob/main/docs/Migrating-v3-to-v5.md",
    }]);
    expect(selectDeepgramSdkMigrationSources("python", 6, 7)).toHaveLength(1);
    expect(selectDeepgramSdkMigrationSources("javascript-typescript", 2, 5)).toEqual([]);
    expect(selectDeepgramSdkMigrationSources("unknown", 1, 2)).toEqual([]);
  });

  test("keeps a dated product-level Feature Matrix snapshot without turning absence into API unavailability", () => {
    expect(deepgramSdkFeatureSupportSchema.parse(getDeepgramSdkFeatureSupport("javascript-typescript", "listen-v2-flux"))).toMatchObject({ status: "listed", verifiedAt: expect.stringContaining("2026-07-28") });
    expect(getDeepgramSdkFeatureSupport("go", "listen-v2-flux")).toMatchObject({ status: "not-listed", sourceIds: ["docs-sdk-feature-matrix"] });
    expect(getDeepgramSdkFeatureSupport("rust", "listen-v2-flux")).toMatchObject({ status: "conflicting-first-party-sources" });
    expect(getDeepgramSdkFeatureSupport("python", "auth")).toMatchObject({ status: "unknown" });
  });

  test("computes freshness from the verified timestamp and source-specific stale policy", () => {
    const featureMatrix = DEEPGRAM_SDK_REGISTRY.sources.find((item) => item.id === "docs-sdk-feature-matrix");
    expect(featureMatrix).toBeTruthy();
    expect(getDeepgramSdkSourceFreshness(featureMatrix!, "2026-08-04T12:00:00.000Z")).toBe("fresh");
    expect(getDeepgramSdkSourceFreshness(featureMatrix!, "2026-08-05T12:00:00.001Z")).toBe("stale");
    expect(getDeepgramSdkSourceFreshness(featureMatrix!, "not-a-date")).toBe("unknown");
    expect(getDeepgramSdkRegistryFreshness("2026-07-29T12:00:00.000Z")).toBe("fresh");
    expect(getDeepgramSdkRegistryFreshness("2026-08-05T12:00:00.001Z")).toBe("stale");
  });

  test("allows only canonical Deepgram docs and known Deepgram-owned repositories", () => {
    for (const allowed of [
      "https://developers.deepgram.com/sdks/sdk-features",
      "https://developers.deepgram.com/llms.txt",
      "https://github.com/deepgram/deepgram-js-sdk",
      "https://github.com/deepgram/deepgram-python-sdk/blob/main/docs/Migrating-v6-to-v7.md",
    ]) expect(isOfficialDeepgramSdkSourceUrl(allowed)).toBe(true);

    for (const blocked of [
      "http://developers.deepgram.com/sdks/sdk-features",
      "https://developers.deepgram.com.evil.example/sdks/sdk-features",
      "https://github.com/customer/private-repository",
      "https://github.com/deepgram/not-an-allowlisted-repository",
      "https://user:secret@example.com/deepgram/deepgram-js-sdk",
      "https://github.com:444/deepgram/deepgram-js-sdk",
      "https://github.com/deepgram/deepgram-js-sdk?token=secret",
      "https://localhost/deepgram/deepgram-js-sdk",
    ]) expect(isOfficialDeepgramSdkSourceUrl(blocked)).toBe(false);
  });

  test("all cached sources retain first-party provenance and a visible verification date", () => {
    expect(DEEPGRAM_SDK_REGISTRY.lastVerifiedAt).toContain("2026-07-28");
    expect(DEEPGRAM_SDK_REGISTRY.sources.every((item) => (
      item.retrievalMode === "cached-first-party-snapshot" &&
      item.lastVerifiedAt.startsWith("2026-07-28") &&
      isOfficialDeepgramSdkSourceUrl(item.canonicalUrl)
    ))).toBe(true);
    expect(DEEPGRAM_SDK_REGISTRY.sources.some((item) => item.canonicalUrl === "https://developers.deepgram.com/sdks/sdk-features")).toBe(true);
    expect(DEEPGRAM_SDK_REGISTRY.sources.some((item) => item.canonicalUrl === "https://developers.deepgram.com/docs/using-sdks-with-self-hosted")).toBe(true);
    expect(DEEPGRAM_SDK_REGISTRY.sources.some((item) => item.canonicalUrl === "https://developers.deepgram.com/reference/custom-endpoints")).toBe(true);
  });
});
