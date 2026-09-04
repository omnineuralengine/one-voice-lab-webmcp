import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { DEEPGRAM_NOVA3_LANGUAGE_OPTIONS } from "../../src/lib/deepgram-languages";
import {
  LANGUAGE_RECENT_LIMIT,
  REVIEWED_LANGUAGE_SAMPLES,
  SAFE_DEEPGRAM_KEY_PLACEHOLDER,
  addRecentLanguage,
  languageCaveats,
  languageWorkbenchSnippets,
  relatedRegionalVariants,
  reviewedSampleForLanguage,
  sanitizeLastAppliedLanguage,
  sanitizeRecentLanguages,
  searchNova3Languages,
} from "../../src/lib/language-workbench";

test.describe("Nova-3 Language Workbench fixtures", () => {
  test("removes the old pin claim and dead pin metadata", () => {
    const source = files("src/components/deepgram-control-room.tsx", "src/lib/deepgram-languages.ts", "src/components/voice-lab.tsx");
    expect(source).not.toContain("Search and pin");
    expect(source).not.toMatch(/\bpinned\??\s*:/);
    expect(source).not.toContain("option.pinned");
  });

  test("searches verified data by name, code, base language, and region", () => {
    expect(searchNova3Languages("Italian").map((option) => option.code)).toContain("it");
    expect(searchNova3Languages("en-GB").map((option) => option.code)).toContain("en-GB");
    expect(searchNova3Languages("Canada").map((option) => option.code)).toContain("fr-CA");
    expect(searchNova3Languages("French").map((option) => option.code)).toEqual(expect.arrayContaining(["fr", "fr-CA"]));
  });

  test("keeps regional configuration values distinct", () => {
    const english = relatedRegionalVariants("en-GB").map((option) => option.code);
    expect(english).toEqual(expect.arrayContaining(["en", "en-US", "en-GB"]));
    expect(new Set(english).size).toBe(english.length);
    expect(DEEPGRAM_NOVA3_LANGUAGE_OPTIONS.find((option) => option.code === "en-GB")?.name).not.toBe(
      DEEPGRAM_NOVA3_LANGUAGE_OPTIONS.find((option) => option.code === "en-US")?.name,
    );
  });

  test("builds exact safe query, JSON, TypeScript, Python, and binary cURL snippets", () => {
    const snippets = languageWorkbenchSnippets("it");
    expect(snippets.query).toBe("model=nova-3&language=it");
    expect(JSON.parse(snippets.json)).toEqual({ model: "nova-3", language: "it" });
    expect(snippets.typescript).toContain("/v1/listen?model=nova-3&language=it");
    expect(snippets.python).toContain('"Authorization": "Token YOUR_DEEPGRAM_API_KEY"');
    expect(snippets.curl).toContain("--data-binary @audio.wav");
    expect(Object.values(snippets).join("\n")).toContain(SAFE_DEEPGRAM_KEY_PLACEHOLDER);
    expect(Object.values(snippets).join("\n")).not.toContain("process.env.DEEPGRAM_API_KEY");
  });

  test("uses cautious multilingual guidance without unsupported accuracy claims", () => {
    const multilingual = DEEPGRAM_NOVA3_LANGUAGE_OPTIONS.find((option) => option.code === "multi");
    expect(multilingual).toBeTruthy();
    const guidance = languageCaveats(multilingual!).join(" ");
    expect(guidance).toContain("not a benchmark result");
    expect(guidance).not.toMatch(/highest accuracy|more accurate|lower accuracy/i);
  });

  test("stores at most five recent codes and timestamps and drops all other fields", () => {
    const unsafe = [
      { code: "it", usedAt: "2026-07-16T12:00:00.000Z", token: "secret", audio: "bytes" },
      { code: "es", usedAt: "2026-07-16T12:01:00.000Z", credential: "secret" },
      { code: "not-supported", usedAt: "2026-07-16T12:02:00.000Z" },
    ];
    expect(sanitizeRecentLanguages(unsafe)).toEqual([
      { code: "it", usedAt: "2026-07-16T12:00:00.000Z" },
      { code: "es", usedAt: "2026-07-16T12:01:00.000Z" },
    ]);
    const records = ["en", "it", "es", "fr", "de", "pt"].reduce(
      (current, code, index) => addRecentLanguage(current, code as "en", `2026-07-16T12:0${index}:00.000Z`),
      [] as ReturnType<typeof sanitizeRecentLanguages>,
    );
    expect(records).toHaveLength(LANGUAGE_RECENT_LIMIT);
    expect(Object.keys(records[0]).sort()).toEqual(["code", "usedAt"]);
    expect(sanitizeLastAppliedLanguage({ code: "it", destination: "upload-audio", usedAt: "2026-07-16T12:00:00.000Z", token: "secret", audio: "bytes" })).toEqual({
      code: "it",
      destination: "upload-audio",
      usedAt: "2026-07-16T12:00:00.000Z",
    });
    expect(sanitizeLastAppliedLanguage({ code: "it", destination: "unknown", usedAt: "2026-07-16T12:00:00.000Z" })).toBeNull();
  });

  test("offers reviewed sample text only for the small curated fixture set", () => {
    expect(REVIEWED_LANGUAGE_SAMPLES.map((sample) => sample.code)).toEqual(["en", "it", "es", "fr", "de", "pt"]);
    expect(REVIEWED_LANGUAGE_SAMPLES.every((sample) => sample.provenance === "curated-project-fixture")).toBe(true);
    expect(reviewedSampleForLanguage("fr-CA")?.code).toBe("fr");
    expect(reviewedSampleForLanguage("pt-PT")?.code).toBe("pt");
    expect(reviewedSampleForLanguage("ja")).toBeNull();
  });

  test("exposes complete combobox and grouped-list semantics", () => {
    const component = files("src/components/language-workbench/Nova3LanguageWorkbench.tsx");
    expect(component).toContain('aria-autocomplete="list"');
    expect(component).toContain('aria-describedby="language-workbench-search-help"');
    expect(component).toContain('role="group"');
  });

  test("handoffs prepopulate but contain no automatic request or microphone call", () => {
    const controlRoom = files("src/components/deepgram-control-room.tsx");
    const applyBlock = controlRoom.slice(controlRoom.indexOf("function applyLanguageConfiguration"), controlRoom.indexOf("function applyLanguageSampleToTts"));
    expect(applyBlock).toContain('setApiStudioOperationId(initialConfiguration.operationId)');
    expect(applyBlock).not.toMatch(/fetch\(|getUserMedia\(|transcribeUrl\(|transcribeFile\(/);
    expect(controlRoom.slice(controlRoom.indexOf("function applyLanguageSampleToTts"), controlRoom.indexOf("function openCodeLabFromApiStudio"))).not.toMatch(/fetch\(|generateAudio\(/);
  });

  test("renders explicit empty, no-result, clipboard-failure, and hosted-review guidance", () => {
    const component = files("src/components/language-workbench/Nova3LanguageWorkbench.tsx");
    expect(component).toContain("Choose a language to inspect its configuration and use it across the lab.");
    expect(component).toContain("No supported language matches this search.");
    expect(component).toContain("Core configuration is available. Additional guidance has not yet been reviewed.");
    expect(component).toContain("Copy failed. Select the text manually.");
    expect(component).toContain("without running anything automatically");
  });

  test("adds an intentional guided-tour stop without automatic clipboard or execution", () => {
    const tour = files("src/components/keyboard-shortcuts/KeyboardShortcutController.tsx");
    expect(tour).toContain("Open Language Workbench stop");
    expect(tour).toContain("search for Italian");
    expect(tour).toContain("data-guided-tour-target");
    const dialog = tour.slice(tour.indexOf("function GuidedTourDialog"), tour.indexOf("function buildPaletteCommands"));
    expect(dialog).not.toMatch(/clipboard\.writeText|fetch\(|getUserMedia\(/);
  });
});

function files(...paths: string[]) {
  return paths.map((file) => readFileSync(resolve(process.cwd(), file), "utf8")).join("\n");
}
