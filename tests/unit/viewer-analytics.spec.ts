import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import {
  classifyViewerEvent,
  classifyViewerSurface,
  createViewerEventInput,
  viewerEventInputSchema,
} from "@/lib/analytics/viewer-events";

test.describe("privacy-preserving viewer analytics", () => {
  test("accepts only coarse, allowlisted events, surfaces, and providers", () => {
    expect(viewerEventInputSchema.safeParse({ eventName: "page_view", surface: "provider" }).success).toBe(true);
    expect(viewerEventInputSchema.safeParse({ eventName: "provider_module_open", surface: "home", providerId: "fish-audio" }).success).toBe(true);
    expect(viewerEventInputSchema.safeParse({ eventName: "page_view", surface: "unknown" }).success).toBe(false);
    expect(viewerEventInputSchema.safeParse({ eventName: "provider_profile_open", surface: "provider" }).success).toBe(false);
    expect(viewerEventInputSchema.safeParse({ eventName: "page_view", surface: "home", providerId: "unknown" }).success).toBe(false);
    expect(viewerEventInputSchema.safeParse({ eventName: "page_view", surface: "home", path: "/private", ip: "127.0.0.1" }).success).toBe(false);
  });

  test("reduces routes in the browser before transmission and never retains the path", () => {
    expect(classifyViewerSurface("/")).toBe("home");
    expect(classifyViewerSurface("/?module=tts")).toBe("home");
    expect(classifyViewerSurface("/providers")).toBe("providers");
    expect(classifyViewerSurface("/providers/elevenlabs/api-studio")).toBe("provider");
    expect(classifyViewerSurface("/architecture-studio/session/example")).toBe("build");
    expect(classifyViewerSurface("/evals/turn-taking")).toBe("learn");
    const providerView = createViewerEventInput("page_view", "/providers/fish-audio?source=private");
    expect(providerView).toEqual({
      eventName: "page_view",
      surface: "provider",
      providerId: "fish-audio",
    });
    expect(classifyViewerEvent(providerView)).toEqual({
      event_name: "page_view",
      surface: "provider",
      provider_id: "fish-audio",
    });
    expect(Object.keys(classifyViewerEvent(createViewerEventInput("page_view", "/private-looking-path"))).sort()).toEqual([
      "event_name",
      "provider_id",
      "surface",
    ]);
  });

  test("ships the selected ONE logo through the brand and app-icon conventions", () => {
    const files = [
      "public/brand/one-voice-lab-logo.png",
      "src/app/icon.png",
      "src/app/apple-icon.png",
    ];
    for (const file of files) {
      const absolute = resolve(process.cwd(), file);
      expect(existsSync(absolute)).toBe(true);
      expect(statSync(absolute).size).toBeGreaterThan(10_000);
      const png = readFileSync(absolute);
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1254, 1254]);
    }
    expect(readFileSync(resolve(process.cwd(), "src/components/one/OneMark.tsx"), "utf8"))
      .toContain('/brand/one-voice-lab-logo.png');
    expect(existsSync(resolve(process.cwd(), "src/app/icon.svg"))).toBe(false);
    expect(existsSync(resolve(process.cwd(), "src/app/favicon.ico"))).toBe(false);
  });
});
