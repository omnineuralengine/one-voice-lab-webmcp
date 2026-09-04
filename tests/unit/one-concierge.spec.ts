import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertOneConciergeRegistry,
  getOneConciergeDestination,
  ONE_CONCIERGE_DESTINATIONS,
  ONE_CONCIERGE_INTENTS,
  ONE_CONCIERGE_REGISTRY_VERSION,
} from "@/lib/concierge/registry";
import {
  normalizeOneConciergeInput,
  ONE_CONCIERGE_MAX_INPUT_LENGTH,
  resolveOneConciergeGoal,
} from "@/lib/concierge/resolver";
import {
  createOneConciergeState,
  reduceOneConciergeState,
} from "@/lib/concierge/state-machine";
import { VOICE_OPEN_LAB_EXPERIENCES, VOICE_OPEN_LAB_LEARN_SURFACES, VOICE_OPEN_LAB_NAVIGATION } from "@/lib/voice-open-lab/navigation";

test.describe("ONE Voice Concierge contracts", () => {
  test("registers a unique, versioned, internal-only navigation surface", () => {
    expect(ONE_CONCIERGE_REGISTRY_VERSION).toBe("one-concierge-navigation/1.1.0");
    expect(assertOneConciergeRegistry()).toBe(true);
    expect(new Set(ONE_CONCIERGE_DESTINATIONS.map((item) => item.id)).size).toBe(ONE_CONCIERGE_DESTINATIONS.length);
    expect(new Set(ONE_CONCIERGE_DESTINATIONS.map((item) => item.href)).size).toBe(ONE_CONCIERGE_DESTINATIONS.length);
    expect(new Set(ONE_CONCIERGE_INTENTS.map((item) => item.id)).size).toBe(ONE_CONCIERGE_INTENTS.length);
    for (const destination of ONE_CONCIERGE_DESTINATIONS) {
      expect(destination.href).toMatch(/^\/(?!\/)/);
      expect(destination.href).not.toMatch(/(?:javascript|data|file):|\\/i);
    }
    for (const intent of ONE_CONCIERGE_INTENTS) {
      expect(intent.destinationIds.length).toBeGreaterThan(0);
      expect(intent.destinationIds.length).toBeLessThanOrEqual(3);
    }
  });

  test("reuses canonical ONE routes instead of introducing another route source", () => {
    expect(getOneConciergeDestination("explore")?.href).toBe(VOICE_OPEN_LAB_NAVIGATION.find((item) => item.id === "explore")?.href);
    expect(getOneConciergeDestination("compare-providers")?.href).toBe(VOICE_OPEN_LAB_NAVIGATION.find((item) => item.id === "compare")?.href);
    expect(getOneConciergeDestination("evaluate-evidence")?.href).toBe(VOICE_OPEN_LAB_NAVIGATION.find((item) => item.id === "evaluate")?.href);
    expect(getOneConciergeDestination("build")?.href).toBe(VOICE_OPEN_LAB_NAVIGATION.find((item) => item.id === "build")?.href);
    expect(getOneConciergeDestination("learn")?.href).toBe(VOICE_OPEN_LAB_NAVIGATION.find((item) => item.id === "learn")?.href);
    expect(getOneConciergeDestination("transcribe-audio")?.href).toBe(VOICE_OPEN_LAB_EXPERIENCES.find((item) => item.id === "upload")?.href);
    expect(getOneConciergeDestination("create-speech")?.href).toBe(VOICE_OPEN_LAB_EXPERIENCES.find((item) => item.id === "generate")?.href);
    expect(getOneConciergeDestination("stt-evaluation-methodology")?.href).toBe(
      `${VOICE_OPEN_LAB_LEARN_SURFACES.find((item) => item.id === "methodology")?.href}#stt-evaluation-availability`,
    );
  });

  test("normalizes Unicode and whitespace while enforcing strict hostile-input bounds", () => {
    expect(normalizeOneConciergeInput("  ＴＵＲＮ\t speech   into text  ")).toEqual({ ok: true, value: "turn speech into text" });
    expect(normalizeOneConciergeInput("x".repeat(ONE_CONCIERGE_MAX_INPUT_LENGTH + 1))).toMatchObject({ ok: false, issue: "too-long" });
    expect(normalizeOneConciergeInput("x".repeat(1_000_000))).toMatchObject({ ok: false, issue: "too-long" });
    expect(normalizeOneConciergeInput("learn\u200b privacy")).toMatchObject({ ok: false, issue: "control-characters" });
    expect(normalizeOneConciergeInput("javascript:alert(1)")).toMatchObject({ ok: false, issue: "url-or-path" });
    expect(normalizeOneConciergeInput("open /settings")).toMatchObject({ ok: false, issue: "url-or-path" });
    expect(normalizeOneConciergeInput("<script>open compare</script>")).toMatchObject({ ok: false, issue: "markup-or-injection" });
    expect(normalizeOneConciergeInput("provider=deepgram")).toMatchObject({ ok: false, issue: "markup-or-injection" });
    expect(normalizeOneConciergeInput("owner=USER_B")).toMatchObject({ ok: false, issue: "markup-or-injection" });
    expect(normalizeOneConciergeInput("fixture=paid-live")).toMatchObject({ ok: false, issue: "markup-or-injection" });
    expect(normalizeOneConciergeInput("trust tier=admin")).toMatchObject({ ok: false, issue: "markup-or-injection" });
    expect(normalizeOneConciergeInput("transcribe and then run a scenario")).toMatchObject({ ok: false, issue: "multiple-commands" });
    expect(normalizeOneConciergeInput("transcribe audio then run a scenario")).toMatchObject({ ok: false, issue: "multiple-commands" });
    expect(normalizeOneConciergeInput("turn speech into text. open scenario studio")).toMatchObject({ ok: false, issue: "multiple-commands" });
    expect(normalizeOneConciergeInput("turn speech into text, launch scenario studio")).toMatchObject({ ok: false, issue: "multiple-commands" });
    expect(normalizeOneConciergeInput("privacy and trust")).toEqual({ ok: true, value: "privacy and trust" });
    expect(resolveOneConciergeGoal("what should i try next")).toMatchObject({ status: "matched", intentId: "start" });
  });

  test("resolves identical confirmed text and voice transcripts to the same registered destination set", () => {
    const typed = resolveOneConciergeGoal("Turn speech into text");
    const voice = resolveOneConciergeGoal("Turn speech into text");
    expect(typed).toEqual(voice);
    expect(typed).toMatchObject({
      status: "matched",
      intentId: "transcribe",
      destinationIds: ["transcribe-audio"],
    });
    expect(JSON.stringify(typed)).not.toContain("href");
  });

  test("keeps destination IDs invariant across every adaptive presentation depth", () => {
    const resolved = ["essential", "guided", "detailed", "technical"].map(() => resolveOneConciergeGoal("evaluate quality"));
    expect(resolved.every((result) => result.status === "matched")).toBe(true);
    expect(resolved.map((result) => result.status === "matched" ? result.destinationIds : [])).toEqual([
      ["evaluate-evidence"],
      ["evaluate-evidence"],
      ["evaluate-evidence"],
      ["evaluate-evidence"],
    ]);
  });

  test("routes clear STT evaluation intent only to truthful methodology availability", () => {
    for (const input of [
      "WER",
      "word error rate",
      "speech recognition accuracy",
      "speech to text accuracy",
      "speech-to-text evaluation",
      "speech recognition benchmark",
      "transcription benchmark",
    ]) {
      const result = resolveOneConciergeGoal(input);
      expect(result).toMatchObject({
        status: "matched",
        intentId: "evaluate-stt",
        destinationIds: ["stt-evaluation-methodology"],
      });
      expect(JSON.stringify(result)).not.toContain("evaluate-evidence");
    }

    const destination = getOneConciergeDestination("stt-evaluation-methodology");
    expect(destination).toMatchObject({
      label: "STT evaluation is not currently runnable",
      outcome: "STT evaluation is planned and not currently runnable. View the methodology and current availability.",
      confirmationDisclosure: "Arriving does not measure WER or run an STT evaluation.",
    });
    expect(destination?.label).not.toBe("Evaluate voice outputs");
  });

  test("requires clarification for bounded ambiguity and never emits a route", () => {
    const result = resolveOneConciergeGoal("compare");
    expect(result).toMatchObject({
      status: "ambiguous",
      intentIds: ["compare-providers", "evaluate"],
      destinationIds: ["compare-providers", "evaluate-evidence"],
    });
    expect(JSON.stringify(result)).not.toContain("href");
  });

  test("fails closed for unsupported, stale, unavailable, and offline journeys", () => {
    expect(resolveOneConciergeGoal("book a restaurant")).toMatchObject({ status: "unsupported", issue: "no-match" });
    expect(resolveOneConciergeGoal("transcribe audio", { registryVersion: "stale/0" })).toMatchObject({ status: "unavailable", reason: "registry-version" });
    expect(resolveOneConciergeGoal("transcribe audio", { unavailableDestinationIds: ["transcribe-audio"] })).toMatchObject({ status: "unavailable", reason: "destination-unavailable" });
    expect(resolveOneConciergeGoal("transcribe audio", { online: false })).toMatchObject({ status: "unavailable", reason: "offline" });
    expect(resolveOneConciergeGoal("learn voice ai", { online: false })).toMatchObject({ status: "matched", destinationIds: ["learn"] });
  });

  test("maps provider names only to neutral comparison and never selects a provider", () => {
    for (const providerName of ["deepgram", "fish audio", "elevenlabs", "cartesia", "reson8"]) {
      expect(resolveOneConciergeGoal(providerName)).toMatchObject({
        status: "matched",
        intentId: "compare-providers",
        destinationIds: ["compare-providers"],
      });
    }
  });

  test("keeps the explicit state machine single-flight, review-first, and identity-invalidating", () => {
    let state = reduceOneConciergeState(createOneConciergeState(), { type: "OPEN", preset: "typed goal" });
    expect(state).toMatchObject({ open: true, phase: "input", input: "typed goal" });
    state = reduceOneConciergeState(state, { type: "VOICE_PREPARING" });
    state = reduceOneConciergeState(state, { type: "VOICE_LISTENING" });
    state = reduceOneConciergeState(state, { type: "VOICE_PARTIAL", value: "turn speech" });
    expect(state).toMatchObject({ phase: "listening", partialTranscript: "turn speech", input: "typed goal", resolution: null });
    state = reduceOneConciergeState(state, { type: "VOICE_FINAL", value: "turn speech into text" });
    expect(state).toMatchObject({ phase: "voice-review", voiceDraft: "turn speech into text", input: "typed goal", resolution: null });
    const generation = state.generation;
    state = reduceOneConciergeState(state, { type: "INVALIDATE" });
    expect(state).toMatchObject({ open: false, phase: "closed", input: "", voiceDraft: "", resolution: null });
    expect(state.generation).toBeGreaterThan(generation);
  });

  test("keeps implementation navigation-only, ephemeral, and speech-lazy", () => {
    const provider = source("src/components/concierge/OneConciergeProvider.tsx");
    const speech = source("src/lib/concierge/browser-speech.ts");
    const layout = source("src/app/layout.tsx");
    const home = source("src/components/one/OneHome.tsx");

    expect(provider).toContain('await import("@/lib/concierge/browser-speech")');
    expect(provider).toContain("router.push(destination.href)");
    expect(provider).toContain("getOneConciergeDestination(destinationId)");
    expect(provider).toContain("pagehide");
    expect(provider).toContain("event.persisted");
    expect(provider).toContain("document.hidden && isSpeechPhase(state.phase)");
    expect(provider).not.toMatch(/\bfetch\s*\(|localStorage|sessionStorage|indexedDB|caches\.|speechSynthesis|dangerouslySetInnerHTML|dispatchVoiceLabAction|providerAdapter/i);
    expect(speech).not.toMatch(/\bfetch\s*\(|localStorage|sessionStorage|indexedDB|caches\.|speechSynthesis|MediaRecorder|navigator\.mediaDevices/i);
    expect(speech).toContain("ONE_CONCIERGE_VOICE_MAX_DURATION_MS = 12_000");
    expect(speech).toContain("ONE_CONCIERGE_VOICE_MAX_FINAL_RESULTS = 3");
    expect(layout).toContain("<OneConciergeProvider>");
    expect(home).toContain("<OneConciergeHomeEntry />");
    expect(home).not.toContain("AiIntentRouter");
  });

  test("preserves every canonical direct-navigation route without opening the concierge", () => {
    const navigation = source("src/lib/voice-open-lab/navigation.ts");
    const home = source("src/components/one/OneHome.tsx");
    expect(navigation).toContain('{ id: "explore", label: "Explore", href: "/"');
    expect(navigation).toContain('{ id: "compare", label: "Compare", href: "/providers"');
    expect(navigation).toContain('{ id: "evaluate", label: "Evaluate", href: "/evaluate"');
    expect(navigation).toContain('{ id: "build", label: "Build", href: "/build"');
    expect(navigation).toContain('{ id: "learn", label: "Learn", href: "/learn"');
    expect(home).toContain("CAPABILITIES.map");
  });
});

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}
