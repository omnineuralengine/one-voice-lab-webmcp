import { expect, test } from "@playwright/test";

import { POCKET_API_CAPABILITIES, POCKET_API_PRESETS } from "@/data/pocket-api-lab";
import {
  DEFAULT_POCKET_API_STATE,
  POCKET_API_STORAGE_KEY,
  addPocketApiQuestion,
  buildPocketApiHandoffs,
  buildPocketApiRequestExample,
  classifyPocketApiOperation,
  describePocketApiInteraction,
  getPocketApiComparisonRows,
  readPocketApiStoredState,
  sanitizePocketApiStoredState,
  searchPocketApiRegistry,
  togglePocketApiPin,
  writePocketApiStoredState,
} from "@/lib/pocket-api-lab";
import { getDeepgramEndpoint } from "@/lib/deepgram-endpoint-registry";

test.describe("Pocket API Lab domain", () => {
  test("maps every requested capability card to verified registry operations", () => {
    expect(POCKET_API_CAPABILITIES.map((item) => item.label)).toEqual([
      "STT", "TTS", "Voice Agent", "Intelligence", "Authentication", "Models", "Projects", "Requests", "Usage", "Billing", "Administration",
    ]);
    for (const capability of POCKET_API_CAPABILITIES) {
      expect(searchPocketApiRegistry("", capability.family).length, capability.family).toBeGreaterThan(0);
    }
  });

  test("selects a preset and generates curl, JavaScript, Python, and JSON from the verified endpoint", () => {
    const preset = POCKET_API_PRESETS.find((item) => item.id === "transcribe-hosted-audio");
    const endpoint = getDeepgramEndpoint(preset?.endpointId ?? "");
    expect(preset).toBeTruthy();
    expect(endpoint).toBeTruthy();
    const example = buildPocketApiRequestExample(endpoint!, preset);
    expect(example.sanitizedUrl).toContain("https://api.deepgram.com/v1/listen");
    expect(example.snippets.curl).toContain("$DEEPGRAM_API_KEY");
    expect(example.snippets.javascript).toContain("process.env.DEEPGRAM_API_KEY");
    expect(example.snippets.python).toContain("os.environ['DEEPGRAM_API_KEY']");
    expect(example.snippets.json).toContain("https://example.com/audio.wav");
    expect(JSON.stringify(example.snippets)).not.toMatch(/Token [A-Za-z0-9]{20,}/);
    expect(example.executable).toBe(true);
  });

  test("searches endpoint parameters and compares only registry-declared models and features", () => {
    expect(searchPocketApiRegistry("eot_timeout_ms").map((item) => item.id)).toContain("stt-flux");
    expect(searchPocketApiRegistry("project uuid").some((item) => item.family === "Projects")).toBe(true);
    const comparison = getPocketApiComparisonRows();
    expect(comparison.find((item) => item.endpointId === "stt-prerecorded")?.models).toBe("nova-3, nova-3-general");
    expect(comparison.find((item) => item.endpointId === "stt-flux")?.models).toContain("flux-general-en");
    expect(comparison.find((item) => item.endpointId === "tts-rest")?.models).toContain("aura-2-thalia-en");
  });

  test("classifies read-only, billable, and mutating operations visibly", () => {
    expect(classifyPocketApiOperation(getDeepgramEndpoint("models-public-list")!)).toBe("read-only");
    expect(classifyPocketApiOperation(getDeepgramEndpoint("stt-prerecorded")!)).toBe("billable");
    expect(classifyPocketApiOperation(getDeepgramEndpoint("keys-delete")!)).toBe("mutating");
    expect(describePocketApiInteraction(getDeepgramEndpoint("stt-live")!)).toBe("Realtime WebSocket streaming");
    expect(describePocketApiInteraction(getDeepgramEndpoint("tts-rest")!)).toBe("HTTPS request with optional callback delivery");
  });

  test("builds typed route handoffs that preserve the selected operation", () => {
    const endpoint = getDeepgramEndpoint("stt-flux")!;
    expect(buildPocketApiHandoffs(endpoint)).toEqual({
      apiLab: "/?module=api-studio&operation=stt-flux&source=pocket-api-lab",
      codeLab: "/?module=code-lab&workflow=live-mic&operation=stt-flux&source=pocket-api-lab",
      architectureStudio: "/architecture-studio?source=pocket-api-lab&operation=stt-flux&capability=Speech%20to%20Text",
    });
  });

  test("persists only known preset, endpoint, language, and timestamps", () => {
    const unsafe = sanitizePocketApiStoredState({
      schemaVersion: 9,
      selectedPresetId: "transcribe-hosted-audio",
      quickCallMode: false,
      recentQuestions: [{ presetId: "transcribe-hosted-audio", askedAt: "2026-07-22T12:00:00Z", customerQuestion: "private" }, { presetId: "unknown", askedAt: "2026-07-22T12:00:00Z" }],
      pinnedSnippets: [{ endpointId: "stt-prerecorded", language: "curl", pinnedAt: "2026-07-22T12:00:00Z", code: "secret" }, { endpointId: "unknown", language: "json", pinnedAt: "2026-07-22T12:00:00Z" }],
      apiKey: "must disappear",
      transcript: "must disappear",
    });
    expect(unsafe.recentQuestions).toEqual([{ presetId: "transcribe-hosted-audio", askedAt: "2026-07-22T12:00:00.000Z" }]);
    expect(unsafe.pinnedSnippets).toEqual([{ endpointId: "stt-prerecorded", language: "curl", pinnedAt: "2026-07-22T12:00:00.000Z" }]);
    expect(JSON.stringify(unsafe)).not.toMatch(/private|secret|apiKey|transcript/);

    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
    const state = { ...DEFAULT_POCKET_API_STATE, recentQuestions: addPocketApiQuestion([], "transcribe-hosted-audio", "2026-07-22T12:00:00Z"), pinnedSnippets: togglePocketApiPin([], "stt-prerecorded", "curl", "2026-07-22T12:00:00Z") };
    writePocketApiStoredState(storage, state);
    expect(values.get(POCKET_API_STORAGE_KEY)).toBe(JSON.stringify(readPocketApiStoredState(storage)));
  });
});
