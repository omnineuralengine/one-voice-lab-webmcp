import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  SHORTCUT_REGISTRY,
  SHORTCUT_SEQUENCE_TIMEOUT_MS,
  commandForGoSequence,
  detectShortcutPlatform,
  fuzzyCommandScore,
  shortcutDisplay,
} from "@/lib/keyboard-shortcuts";

test.describe("central keyboard shortcut registry", () => {
  test("defines every command with routing, scope, typing, availability, and platform metadata", () => {
    expect(new Set(SHORTCUT_REGISTRY.map((item) => item.id)).size).toBe(SHORTCUT_REGISTRY.length);
    for (const shortcut of SHORTCUT_REGISTRY) {
      expect(shortcut.label).not.toBe("");
      expect(shortcut.target).not.toBe("");
      expect(shortcut.availability).not.toBe("");
      expect(["global", "page-specific"]).toContain(shortcut.scope);
      expect(typeof shortcut.disabledWhileTyping).toBe("boolean");
      if (shortcut.keyCombination) expect(shortcut.platformDisplay).not.toBeNull();
    }
  });

  test("maps only the documented short-lived G sequences", () => {
    expect(SHORTCUT_SEQUENCE_TIMEOUT_MS).toBeLessThanOrEqual(1_000);
    expect(["h", "a", "v", "o", "s", "l", "q", "c"].map(commandForGoSequence)).toEqual([
      "go_home", "go_api_studio", "go_voice_agent", "go_observatory",
      "go_audio_signal_lab", "go_language_explorer", "go_questline", "go_code_lab",
    ]);
    expect(commandForGoSequence("x")).toBeNull();
  });

  test("renders platform-aware labels and never registers browser Alt navigation", () => {
    expect(detectShortcutPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X)")).toBe("mac");
    expect(detectShortcutPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows-linux");
    expect(shortcutDisplay("open_command_palette", "mac")).toBe("⌘ K");
    expect(shortcutDisplay("open_command_palette", "windows-linux")).toBe("Ctrl K");
    expect(SHORTCUT_REGISTRY.map((item) => item.keyCombination).filter(Boolean).join(" ")).not.toMatch(/Alt\+(?:Left|Right)/);
  });

  test("supports ordered fuzzy matching without executing anything", () => {
    expect(fuzzyCommandScore("Go to API Studio", "api")).toBeGreaterThan(0);
    expect(fuzzyCommandScore("Copy sanitized diagnostic summary", "csds")).toBeGreaterThan(0);
    expect(fuzzyCommandScore("Go to Home", "voice")).toBe(0);
  });

  test("renames Learning Mode state to Guided Hints without orphaned identifiers", () => {
    const currentSources = [
      "src/components/deepgram-control-room.tsx",
      "src/components/browser-mic-card.tsx",
      "src/components/sample-audio-library.tsx",
      "src/components/voice-lab.tsx",
      "src/hooks/use-guided-hints.ts",
    ].map((file) => readFileSync(resolve(process.cwd(), file), "utf8")).join("\n");
    expect(currentSources).toContain("guidedHints");
    expect(currentSources).toContain("deepgram-voice-lab-guided-hints");
    expect(currentSources).not.toMatch(/\blearningMode\b|\bsetLearningMode\b|Learning On|Learning Mode:/);
  });
});
