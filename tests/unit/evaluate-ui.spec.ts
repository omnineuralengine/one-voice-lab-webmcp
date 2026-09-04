import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fetchEvaluationCapabilities, fetchEvaluationCatalog } from "@/components/evaluate/client";
import { VOICE_OPEN_LAB_NAVIGATION } from "@/lib/voice-open-lab/navigation";

test.describe("Evaluate UI boundary", () => {
  test("keeps provider selection capability-driven and provider SDKs off the browser", () => {
    const workspace = read("src/components/evaluate/EvaluateWorkspace.tsx");
    const client = read("src/components/evaluate/client.ts");
    const types = read("src/components/evaluate/types.ts");
    expect(types).toContain('import type { ProviderId } from "@/lib/providers/types"');
    expect(types).not.toContain("EVALUATE_PROVIDER_IDS");
    expect(workspace).not.toMatch(/localStorage|sessionStorage|DEEPGRAM_API_KEY|ELEVENLABS_API_KEY|FISH_AUDIO_API_KEY|CARTESIA_API_KEY|RESON8_API_KEY/);
    expect(client).not.toMatch(/api\.deepgram\.com|api\.elevenlabs\.io|api\.fish\.audio|api\.cartesia\.ai|(?:api\.)?reson8\.dev/);
    expect(client).toContain("/api/evaluate/capabilities");
    expect(client).toContain("/api/evaluate/catalogs?");
    expect(client).toContain("/api/evaluate/run");
  });

  test("gives Evaluate a first-class place in the capability-centered navigation", () => {
    const navigation = read("src/components/voice-open-lab/VoiceOpenLabNav.tsx");
    const home = read("src/components/one/OneHome.tsx");
    const styles = read("src/app/globals.css");
    expect(home).toContain("Evaluate voice outputs");
    expect(home).toContain('href: "/evaluate"');
    expect(navigation).toContain('aria-current={active === item.id ? "page" : undefined}');
    expect(navigation).toContain('aria-label="Primary"');
    expect(styles).toContain(".voice-open-nav__links");
    expect(VOICE_OPEN_LAB_NAVIGATION.map((item) => item.label)).toEqual(["Explore", "Compare", "Evaluate", "Build", "Learn"]);
  });

  test("enforces blind identity and export boundaries in rendered source", () => {
    const workspace = read("src/components/evaluate/EvaluateWorkspace.tsx");
    const result = read("src/components/evaluate/ResultCard.tsx");
    expect(workspace).toContain("Comparison setup hidden until reveal");
    expect(workspace).toContain("Evidence export stays disabled until reveal");
    expect(workspace).toContain("Submit preference and reveal");
    expect(workspace).toContain("clearedPreferences");
    expect(result).toContain("Identity, model, voice, configuration, filenames, and trace details stay hidden until reveal");
    expect(result).toContain("!hidden ? (");
    expect(result).not.toContain("data-provider");
    expect(workspace).not.toMatch(/best voice|composite score/i);
  });

  test("keeps live mode standardized and rejects outer whitespace client-side", () => {
    const workspace = read("src/components/evaluate/EvaluateWorkspace.tsx");
    const scenario = read("src/components/evaluate/ScenarioPanel.tsx");
    expect(workspace).toContain('if (next !== "fixture") setEvaluationMode("standardized")');
    expect(workspace).toContain('inspectionOnly || executionMode !== "fixture"');
    expect(workspace).toContain("Live comparisons are Standardized-only in Phase 1");
    expect(workspace).toContain('if (text !== text.trim()) return "Remove leading or trailing whitespace');
    expect(scenario).toContain("hasOuterWhitespace");
    expect(scenario).toContain("Remove leading or trailing whitespace");
  });

  test("requests mode-specific catalogs and normalizes server readiness", async () => {
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("capabilities")) {
        return Response.json({
          schemaVersion: "one-voice-evidence/1.0.0",
          executionDefault: "fixture",
          liveEvaluationsEnabled: false,
          anonymousLiveEvaluationsEnabled: false,
          localLiveAvailable: false,
          maximumTextLength: 600,
          providers: [{
            id: "cartesia",
            displayName: "Cartesia",
            implementation: "implemented",
            readiness: { listed: true, configured: false, adapterBacked: true, liveEnabled: false },
            protectedLiveAvailable: false,
            localLiveAvailable: false,
            fixtureAvailable: true,
            limitations: ["Fixture only in this test."],
          }],
        });
      }
      return Response.json({
        schemaVersion: "one-voice-evidence/1.0.0",
        providerId: "cartesia",
        mode: "fixture",
        source: "deterministic-fixture",
        models: [{ id: "fixture-cartesia-tts-v1", name: "Fixture model", description: null, languages: ["fixture"] }],
        voices: [{ id: "fixture-cartesia-voice-v1", name: "Fixture voice", description: null, previewAvailable: true }],
        hasMoreVoices: false,
        nextVoicePageToken: null,
        separateVoiceRequired: true,
        outputFormat: "fixture-wav",
        normalizedOutput: { encoding: "pcm_s16le", sampleRate: 24_000, channels: 1, mimeType: "audio/wav", serverWrapped: true },
        message: "Fixture only.",
      });
    };
    try {
      const capabilities = await fetchEvaluationCapabilities();
      const catalog = await fetchEvaluationCatalog("cartesia", "fixture");
      expect(capabilities.providers[0]).toMatchObject({ id: "cartesia", fixtureAvailable: true, protectedLiveAvailable: false });
      expect(catalog).toMatchObject({ providerId: "cartesia", outputFormat: "fixture-wav", normalizedOutput: { sampleRate: 24_000, mimeType: "audio/wav" } });
      expect(calls[1]).toContain("/api/evaluate/catalogs?provider=cartesia&mode=fixture");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}
