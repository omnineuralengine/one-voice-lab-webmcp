import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  EMPTY_REDACTION_POLICY,
  REDACTION_ENTITIES,
  REDACTION_PRESETS,
  STREAMING_REDACTION_FIXTURE,
  SYNTHETIC_REDACTION_FIXTURES,
  appendRedactionQuery,
  evaluateRedactionCompatibility,
  fixtureUtility,
  inheritedRedactionEntities,
  normalizeRedactionPolicy,
  redactionNoDelayWarning,
  redactionQueryString,
  sanitizeRedactionDiagnostics,
  serializeRedactionValues,
} from "../../src/lib/redaction";
import { buildDeepgramListenUrl } from "../../src/lib/live-mic/deepgram-live-client";

test.describe("Redaction Lab policy fixtures", () => {
  test("defaults to Off", () => {
    expect(serializeRedactionValues(EMPTY_REDACTION_POLICY)).toEqual([]);
    expect(redactionQueryString(EMPTY_REDACTION_POLICY)).toBe("");
  });

  test("serializes one profile exactly", () => {
    expect(redactionQueryString({ profiles: ["pii"], entities: [] })).toBe("redact=pii");
  });

  test("serializes PCI and PII as repeated query parameters", () => {
    const query = redactionQueryString({ profiles: ["pci", "pii"], entities: [] });
    expect(query).toBe("redact=pii&redact=pci");
    expect(query).not.toMatch(/pci%2Cpii|pci,pii|%5B/);
    const url = new URL("https://api.deepgram.com/v1/listen");
    appendRedactionQuery(url.searchParams, ["pci", "pii"]);
    expect(url.searchParams.getAll("redact")).toEqual(["pci", "pii"]);
  });

  test("serializes custom entities and rejects unsupported values", () => {
    expect(redactionQueryString({ profiles: [], entities: ["phone_number", "drug"] })).toBe("redact=phone_number&redact=drug");
    expect(() => normalizeRedactionPolicy({ profiles: [], entities: ["not_a_deepgram_entity"] })).toThrow(/Unsupported Deepgram redaction entity/);
  });

  test("does not duplicate an entity inherited by a profile", () => {
    expect(inheritedRedactionEntities({ profiles: ["pii"], entities: [] })).toContain("phone_number");
    expect(serializeRedactionValues({ profiles: ["pii"], entities: ["phone_number", "drug"] })).toEqual(["pii", "drug"]);
  });

  test("contains the complete verified central catalog and required metadata", () => {
    expect(REDACTION_ENTITIES).toHaveLength(55);
    expect(REDACTION_ENTITIES.map((entity) => entity.value)).toEqual(expect.arrayContaining(["account_number", "credit_card", "medical_process", "statistics", "routing_number", "zodiac_sign"]));
    for (const entity of REDACTION_ENTITIES) {
      expect(entity.displayName).toBeTruthy();
      expect(entity.description).toBeTruthy();
      expect(entity.enterpriseScenario).toBeTruthy();
      expect(entity.cautions).toBeTruthy();
      expect(entity.source).toContain("developers.deepgram.com");
      expect(entity.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test("offers all requested policy profiles without compliance claims", () => {
    expect(REDACTION_PRESETS.map((preset) => preset.name)).toEqual(expect.arrayContaining(["General PII", "Payment Data", "Health Information", "Numeric Identifiers", "Aggressive Numeric Masking", "Financial Contact Center", "Healthcare Contact Center", "Custom Policy"]));
    expect(REDACTION_PRESETS.map((preset) => `${preset.summary} ${preset.caution}`).join(" ")).not.toMatch(/HIPAA compliant|PCI DSS compliant|GDPR compliant/i);
  });

  test("enforces deployment and language compatibility", () => {
    expect(evaluateRedactionCompatibility({ deployment: "hosted", mode: "prerecorded", language: "it" }).supported).toBe(true);
    expect(evaluateRedactionCompatibility({ deployment: "hosted", mode: "streaming", language: "en-US" }).supported).toBe(true);
    expect(evaluateRedactionCompatibility({ deployment: "hosted", mode: "streaming", language: "it" }).supported).toBe(false);
    expect(evaluateRedactionCompatibility({ deployment: "self-hosted", mode: "prerecorded", language: "fr" }).supported).toBe(false);
    expect(evaluateRedactionCompatibility({ deployment: "hosted", mode: "streaming", language: "en", projectSurface: "flux" }).supported).toBe(false);
  });

  test("warns when no_delay=true is combined with redaction", () => {
    expect(redactionNoDelayWarning(true, true)).toContain("may reduce redaction performance");
    expect(redactionNoDelayWarning(true, false)).toBeNull();
    expect(redactionNoDelayWarning(false, true)).toBeNull();
  });

  test("does not change the proven Live Mic query when redaction is off", () => {
    const base = { recognitionConfig: { mode: "known-language" as const, model: "nova-3" as const, language: "en" as const } };
    expect(buildDeepgramListenUrl(base).searchParams.has("no_delay")).toBe(false);
    expect(buildDeepgramListenUrl({ ...base, redact: ["pii"], noDelay: false }).searchParams.get("no_delay")).toBe("false");
  });

  test("uses only explicitly marked synthetic fixtures", () => {
    expect(SYNTHETIC_REDACTION_FIXTURES).toHaveLength(6);
    expect(SYNTHETIC_REDACTION_FIXTURES.every((fixture) => fixture.synthetic)).toBe(true);
    expect(SYNTHETIC_REDACTION_FIXTURES.map((fixture) => fixture.original).join(" ")).toMatch(/demo|fictional|invalid/i);
    expect(SYNTHETIC_REDACTION_FIXTURES.map((fixture) => fixture.original).join(" ")).not.toMatch(/4111 1111 1111 1111|\b\d{3}-\d{2}-\d{4}\b/);
  });

  test("distinguishes interim generic and final typed placeholders", () => {
    expect(STREAMING_REDACTION_FIXTURE.some((event) => event.phase === "interim" && event.placeholder === "[REDACTED]")).toBe(true);
    expect(STREAMING_REDACTION_FIXTURE.at(-1)).toMatchObject({ phase: "final", placeholder: "[PHONE_NUMBER_1]" });
  });

  test("calculates a transparent fixture utility indicator", () => {
    const utility = fixtureUtility(SYNTHETIC_REDACTION_FIXTURES[0]);
    expect(utility.placeholderCount).toBe(SYNTHETIC_REDACTION_FIXTURES[0].findings.length);
    expect(utility.transcriptUtilityIndicator).toBeGreaterThanOrEqual(0);
    expect(utility.transcriptUtilityIndicator).toBeLessThanOrEqual(100);
  });

  test("diagnostics omit raw spans, audio, and credentials", () => {
    const fixture = SYNTHETIC_REDACTION_FIXTURES[0];
    const exported = sanitizeRedactionDiagnostics({ policy: { profiles: ["pci", "pii"], entities: [] }, fixture, mode: "fixture" });
    const text = JSON.stringify(exported);
    expect(exported).toMatchObject({ rawSensitiveValuesIncluded: false, credentialsIncluded: false, audioIncluded: false });
    expect(text).not.toContain(fixture.original);
    expect(text).not.toContain("Authorization");
    expect(text).not.toContain("DEEPGRAM_API_KEY");
  });

  test("executable file STT preserves repeated redact fields while URL STT stays disabled", () => {
    const deepgram = source("src/lib/deepgram.ts");
    const urlRoute = source("src/app/api/deepgram/transcribe-url/route.ts");
    const fileRoute = source("src/app/api/deepgram/transcribe-file/route.ts");
    expect(deepgram).toContain('endpoint.searchParams.append("redact", value)');
    expect(urlRoute).toContain('code: "url_transcription_disabled"');
    expect(urlRoute).not.toContain("transcribeUrl(");
    expect(fileRoute).toContain('formData.getAll(key)');
    expect(fileRoute).toContain('endpoint.searchParams.append("redact", value)');
  });

  test("keeps URL redaction unavailable while integrating Upload Audio, Live Mic, and API Studio without auto execution", () => {
    const room = source("src/components/deepgram-control-room.tsx");
    const apply = room.slice(room.indexOf("function applyRedactionPolicy"), room.indexOf("function openRedactionLab"));
    expect(apply).toContain('if (destination === "transcribe-url")');
    expect(apply).toContain('setUrlState({ status: "idle", message: URL_TRANSCRIPTION_UNAVAILABLE })');
    expect(apply).not.toContain("setUrlRedactionPolicy");
    expect(apply).toContain('setFileRedactionPolicy(policy)');
    expect(apply).toContain('setLiveRedactionPolicy(policy)');
    expect(apply).toContain('setApiStudioInitialConfiguration(initialConfiguration)');
    expect(apply).not.toContain("fetch(");
    expect(apply).not.toContain("getUserMedia");
  });

  test("blocks unsupported live combinations before microphone access", () => {
    const mic = source("src/components/browser-mic-card.tsx");
    const startIndex = mic.indexOf("async function startLiveMic");
    const start = mic.slice(startIndex, mic.indexOf("operationIdRef.current += 1", startIndex));
    expect(start).toContain("evaluateRedactionCompatibility");
    expect(start).toContain("return;");
    expect(start).not.toContain("getUserMedia");
  });

  test("does not describe original audio as redacted or apply STT redaction to TTS", () => {
    const lab = source("src/components/redaction/RedactionLab.tsx");
    const trustedVoice = source("src/components/trusted-voice/FamiliarCareExperience.tsx");
    expect(lab).toContain("The original audio remains unchanged");
    expect(lab).not.toMatch(/audio (?:is|was) redacted/i);
    expect(trustedVoice).toContain("Deepgram STT redaction is a separate mechanism");
    expect(trustedVoice).not.toContain("TTS redaction");
  });

  test("keeps fixture playback local and does not persist raw content", () => {
    const lab = source("src/components/redaction/RedactionLab.tsx");
    expect(lab).not.toContain("fetch(");
    expect(lab).not.toContain("getUserMedia");
    expect(lab).toContain('localStorage.setItem("deepgram-lab-redaction-default-v1", JSON.stringify(normalized))');
    expect(lab).not.toMatch(/localStorage\.setItem\([^\n]+fixture\.original/);
    expect(lab).not.toMatch(/localStorage\.setItem\([^\n]+fixture\.redacted/);
  });

  test("API Studio registry exposes redact only on compatible Listen surfaces", () => {
    const registry = source("src/lib/deepgram-endpoint-registry.ts");
    expect(registry).toContain('queryParameter("redact", "Transcript redaction"');
    const fluxBlock = registry.slice(registry.indexOf('id: "stt-flux"'), registry.indexOf('id: "tts-rest"'));
    expect(fluxBlock).not.toContain('queryParameter("redact"');
  });

  test("exposes keyboard and screen-reader semantics for policy, entities, and placeholders", () => {
    const lab = source("src/components/redaction/RedactionLab.tsx");
    expect(lab).toContain('role="list"');
    expect(lab).toContain('aria-live="polite"');
    expect(lab).toContain("Redacted placeholder");
    expect(lab).toContain('type="button"');
  });
});

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}
