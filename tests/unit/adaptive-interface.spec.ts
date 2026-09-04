import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  DEFAULT_INTERFACE_DEPTH,
  INTERFACE_DEPTHS,
  ONE_GUEST_INTERFACE_DEPTH_STORAGE_KEY,
  createInterfaceDepthWriteQueue,
  depthIncludes,
  parseAccountInterfaceDepth,
  parseStoredInterfaceDepth,
  serializeInterfaceDepth,
} from "@/lib/one/interface-depth";
import { VOICE_OPEN_LAB_NAVIGATION } from "@/lib/voice-open-lab/navigation";

test.describe("adaptive human-interface foundation", () => {
  test("defines one ordered, reversible presentation-depth model", () => {
    expect(DEFAULT_INTERFACE_DEPTH).toBe("guided");
    expect(INTERFACE_DEPTHS.map((depth) => depth.id)).toEqual([
      "essential",
      "guided",
      "detailed",
      "technical",
    ]);
    expect(new Set(INTERFACE_DEPTHS.map((depth) => depth.id)).size).toBe(4);

    expect(depthIncludes("essential", "guided")).toBe(false);
    expect(depthIncludes("guided", "guided")).toBe(true);
    expect(depthIncludes("detailed", "guided")).toBe(true);
    expect(depthIncludes("technical", "detailed")).toBe(true);
    expect(depthIncludes("guided", "technical")).toBe(false);
  });

  test("persists only a bounded, versioned guest preference", () => {
    expect(ONE_GUEST_INTERFACE_DEPTH_STORAGE_KEY).toBe("one:guest:interface-depth:v1");
    const serialized = serializeInterfaceDepth("technical");
    expect(JSON.parse(serialized)).toEqual({
      schemaVersion: "one-interface-depth/1.0.0",
      depth: "technical",
    });
    expect(parseStoredInterfaceDepth(serialized)).toBe("technical");

    expect(parseStoredInterfaceDepth(null)).toBeNull();
    expect(parseStoredInterfaceDepth("technical")).toBeNull();
    expect(parseStoredInterfaceDepth("not-json")).toBeNull();
    expect(parseStoredInterfaceDepth(JSON.stringify({ schemaVersion: "one-interface-depth/1.0.0", depth: "expert" }))).toBeNull();
    expect(parseStoredInterfaceDepth(JSON.stringify({ schemaVersion: "one-interface-depth/1.0.0", depth: "guided", injected: true }))).toBeNull();
    expect(parseStoredInterfaceDepth("x".repeat(257))).toBeNull();
  });

  test("defaults malformed account state without promoting browser input", () => {
    expect(parseAccountInterfaceDepth("essential")).toBe("essential");
    expect(parseAccountInterfaceDepth("technical")).toBe("technical");
    expect(parseAccountInterfaceDepth("expert")).toBe(DEFAULT_INTERFACE_DEPTH);
    expect(parseAccountInterfaceDepth({ depth: "technical" })).toBe(DEFAULT_INTERFACE_DEPTH);
    expect(parseAccountInterfaceDepth(null)).toBe(DEFAULT_INTERFACE_DEPTH);
  });

  test("serializes authenticated depth writes so the final selection persists last", async () => {
    const queue = createInterfaceDepthWriteQueue();
    const releaseFirst = deferred();
    const persisted: string[] = [];

    const first = queue.enqueue(async () => {
      await releaseFirst.promise;
      persisted.push("detailed");
    });
    const second = queue.enqueue(async () => {
      persisted.push("technical");
    });

    await Promise.resolve();
    expect(persisted).toEqual([]);
    releaseFirst.resolve();
    await Promise.all([first, second]);
    expect(persisted).toEqual(["detailed", "technical"]);
  });

  test("keeps depth changes presentation-only and semantically operable", () => {
    const component = source("src/components/one/AdaptiveInterface.tsx");
    expect(component).toContain("This changes presentation only. It never changes access, ownership, provider policy, or what an action can do.");
    expect(component).toContain("<fieldset");
    expect(component).toContain("<legend>");
    expect(component).toContain('type="radio"');
    expect(component).toContain('aria-live="polite"');
    expect(component).toContain('disabled={!one.authReady}');
    expect(component).toContain("<details");
    expect(component).toContain("<summary>");
    expect(component).not.toMatch(/fetch\s*\(|dangerouslySetInnerHTML|api.?key|authorization header/i);
  });

  test("keeps guest state local while verified account state wins safely", () => {
    const experience = source("src/components/one/OneExperienceProvider.tsx");
    const guestState = source("src/lib/auth/guest-state.ts");

    expect(experience).toContain("parseStoredInterfaceDepth(window.localStorage.getItem(ONE_GUEST_INTERFACE_DEPTH_STORAGE_KEY))");
    expect(experience).toContain('setInterfaceDepthSource("guest-local")');
    expect(experience).toContain('client.from("user_preferences").select("interface_depth").eq("user_id", nextUser.id).maybeSingle()');
    expect(experience).toContain("setInterfaceDepth(DEFAULT_INTERFACE_DEPTH)");
    expect(experience).toContain("user_id: user.id");
    expect(experience).toContain("interface_depth: parsed.data");
    expect(experience).toContain("if (generation !== accountLoadGeneration.current)");
    expect(experience).toContain("createInterfaceDepthWriteQueue");
    expect(experience).toContain("if (!authReady)");
    expect(experience).toContain("loadGuestState();");
    expect(experience).toMatch(/setAuthReady\(false\);\s*setInterfaceDepth\(DEFAULT_INTERFACE_DEPTH\);\s*setInterfaceDepthSource\("account-default"\);/);

    // Depth is deliberately not part of automatic guest-to-account import.
    // The authenticated, owner-scoped preference therefore cannot be overwritten
    // by stale browser state during sign-in or account switching.
    expect(guestState).not.toContain("ONE_GUEST_INTERFACE_DEPTH_STORAGE_KEY");
  });

  test("makes the primary experience capability-centered while preserving provenance", () => {
    expect(VOICE_OPEN_LAB_NAVIGATION.map((item) => item.label)).toEqual([
      "Explore",
      "Compare",
      "Evaluate",
      "Build",
      "Learn",
    ]);
    expect(VOICE_OPEN_LAB_NAVIGATION.map((item) => item.href)).toEqual([
      "/",
      "/providers",
      "/evaluate",
      "/build",
      "/learn",
    ]);

    const home = source("src/components/one/OneHome.tsx");
    const providerHub = source("src/components/providers/ProviderRolodex.tsx");
    const providerProfile = source("src/app/providers/[provider]/page.tsx");
    expect(home).toContain("What would you like to explore?");
    expect(home).toContain("Turn speech into text");
    expect(home).toContain("Create speech from text");
    expect(home).toContain("Current interactive workspace: Deepgram. Other providers can be inspected in Provider Hub.");
    expect(home).not.toMatch(/title:\s*"(?:Deepgram|ElevenLabs|Fish Audio|Cartesia|Reson8)/);
    expect(home).not.toMatch(/ElevenLabs|Fish Audio|Cartesia|Reson8/);
    expect(providerHub).toContain("provider.name");
    expect(providerProfile).toContain("provider.name");
    expect(providerProfile).toContain("Stable provider ID");
  });

  test("uses the provider-neutral home by default and keeps specialist tools explicit", () => {
    const page = source("src/app/page.tsx");
    expect(page).toContain('if (!legacyLabRequested) return <OneHome />');
    expect(page).toContain('const legacyLabRequested = Boolean(module || operation || workflow || command === "1")');
    expect(page.indexOf("if (!legacyLabRequested) return <OneHome />"))
      .toBeLessThan(page.indexOf("<DeepgramControlRoom"));
  });
});

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function deferred() {
  let resolvePromise!: () => void;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}
