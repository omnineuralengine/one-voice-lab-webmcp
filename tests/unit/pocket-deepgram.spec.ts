import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import manifest from "@/app/manifest";
import { POCKET_TARGETS } from "@/data/pocket-deepgram";
import {
  DEFAULT_POCKET_PREFERENCES,
  POCKET_STORAGE_KEY,
  addPocketRecentAction,
  classifyPocketAction,
  readPocketStoredState,
  sanitizePocketStoredState,
  writePocketStoredState,
} from "@/lib/pocket-deepgram";

test.describe("Pocket Deepgram safe shell domain", () => {
  test("offers the required call-side destinations as known module IDs", () => {
    expect(POCKET_TARGETS.map((target) => target.label)).toEqual([
      "API Lab",
      "Pre-Sales Engineering",
      "Architecture Studio",
      "Live Mic",
      "Text to Speech",
      "Voice Agent",
      "Flux Conversation Observatory",
    ]);
    expect(POCKET_TARGETS.every((target) => target.href.startsWith("/"))).toBe(true);
    expect(new Set(POCKET_TARGETS.map((target) => target.id)).size).toBe(POCKET_TARGETS.length);
    expect(POCKET_TARGETS.find((target) => target.id === "latency")).toMatchObject({
      href: "/flux-observatory",
      shortLabel: "FLUX",
    });
  });

  test("defaults Demo Mode on and rejects unknown or malformed persisted values", () => {
    expect(DEFAULT_POCKET_PREFERENCES.demoMode).toBe(true);
    const safe = sanitizePocketStoredState({
      preferences: { schemaVersion: 9, mode: "unknown", docked: "yes", demoMode: "no" },
      recentActions: [
        { targetId: "api-lab", openedAt: "2026-07-22T12:00:00.000Z", transcript: "must disappear" },
        { targetId: "unknown", openedAt: "2026-07-22T12:00:00.000Z" },
        { targetId: "tts", openedAt: "not-a-date" },
      ],
      apiKey: "must disappear",
    });
    expect(safe.preferences).toEqual(DEFAULT_POCKET_PREFERENCES);
    expect(safe.recentActions).toEqual([{ targetId: "api-lab", openedAt: "2026-07-22T12:00:00.000Z" }]);
    expect(JSON.stringify(safe)).not.toContain("transcript");
    expect(JSON.stringify(safe)).not.toContain("apiKey");
  });

  test("persists only a sanitized allowlist and gracefully recovers invalid JSON", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    writePocketStoredState(storage, {
      preferences: { schemaVersion: 1, mode: "compact", docked: true, demoMode: true },
      recentActions: [{ targetId: "live-mic", openedAt: "2026-07-22T12:00:00.000Z" }],
    });
    expect(readPocketStoredState(storage)).toMatchObject({ preferences: { mode: "compact", docked: true, demoMode: true } });
    expect(values.get(POCKET_STORAGE_KEY)).toBe(JSON.stringify(readPocketStoredState(storage)));
    values.set(POCKET_STORAGE_KEY, "{broken");
    expect(readPocketStoredState(storage)).toEqual({ preferences: DEFAULT_POCKET_PREFERENCES, recentActions: [] });
  });

  test("deduplicates and bounds recent actions without storing route content", () => {
    let actions = [] as ReturnType<typeof addPocketRecentAction>;
    for (const target of [...POCKET_TARGETS, POCKET_TARGETS[0], POCKET_TARGETS[1]]) {
      actions = addPocketRecentAction(actions, target.id, "2026-07-22T12:00:00.000Z");
    }
    expect(actions).toHaveLength(7);
    expect(actions[0].targetId).toBe("pre-sales");
    expect(actions.filter((item) => item.targetId === "api-lab")).toHaveLength(1);
    expect(Object.keys(actions[0]).sort()).toEqual(["openedAt", "targetId"]);
  });

  test("guards recognized live and destructive actions while leaving navigation alone", () => {
    expect(classifyPocketAction("Run live transcription")).toBe("billable");
    expect(classifyPocketAction("Reset demo")).toBe("destructive");
    expect(classifyPocketAction("Anything", "billable")).toBe("billable");
    expect(classifyPocketAction("Open Architecture Studio")).toBeNull();
  });

  test("publishes an installable manifest and a privacy-bounded service worker", () => {
    const metadata = manifest();
    expect(metadata.display).toBe("standalone");
    expect(metadata.scope).toBe("/");
    expect(metadata.id).toBe("/?source=pocket-pwa");
    expect(metadata.start_url).toBe("/?source=one-pwa");
    expect(metadata.shortcuts?.map((shortcut) => [shortcut.name, shortcut.url])).toEqual([
      ["Compare", "/providers"],
      ["Evaluate", "/evaluate"],
      ["Build", "/build"],
      ["Learn", "/learn"],
    ]);
    expect(metadata.shortcuts?.map((shortcut) => `${shortcut.name} ${shortcut.description} ${shortcut.url}`).join(" ")).not.toMatch(
      /(?:live provider execution|realtime|voice-agent|voice-agent-converse|live-mic|temporary token)/i,
    );
    expect(metadata.icons?.map((icon) => [icon.src, icon.sizes, icon.type])).toEqual([
      ["/brand/one-voice-lab-logo.png", "1254x1254", "image/png"],
      ["/brand/one-voice-lab-logo.png", "1254x1254", "image/png"],
    ]);
    const worker = readFileSync(resolve(process.cwd(), "public/pocket-deepgram-sw.js"), "utf8");
    expect(worker).toContain('url.pathname.startsWith("/api/")');
    expect(worker).toContain('url.pathname.startsWith("/auth/")');
    expect(worker).toContain("SHELL_URLS.includes(url.pathname)");
    expect(worker).toContain('url.pathname.startsWith("/_next/static/")');
    expect(worker).toContain("PUBLIC_ASSET_URLS.has(url.pathname)");
    expect(worker).toMatch(/no-store\|private/);
    expect(worker).toContain('request.headers.has("authorization")');
    expect(worker).toContain('["audio", "video"]');
    expect(worker).not.toContain("localStorage");
  });
});
