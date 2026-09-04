import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  DEFAULT_FAMILIAR_CARE_OPT_OUT,
  DEFAULT_FAMILIAR_CARE_SCENARIO,
  EMPTY_FAMILIAR_CARE_CONSENT,
  FAMILIAR_CARE_SCENARIOS,
  analyzeFamiliarCareText,
  buildFamiliarCareDeliveryPreview,
  sanitizeFamiliarCareRequest,
  validateFamiliarCareRequest,
  type FamiliarCareRequestPolicy,
} from "@/lib/familiar-care";
import { authorizeFamiliarCarePreview, createFamiliarCareReviewerSession } from "@/lib/familiar-care-session";

const confirmedConsent = {
  permission: true,
  syntheticVoice: true,
  noImpersonation: true,
  sensitiveChannel: true,
  optOut: true,
};

function policy(overrides: Partial<FamiliarCareRequestPolicy> = {}): FamiliarCareRequestPolicy {
  return {
    scenarioId: DEFAULT_FAMILIAR_CARE_SCENARIO.id,
    riskLevel: DEFAULT_FAMILIAR_CARE_SCENARIO.riskLevel,
    disclosureStyle: "spoken-and-displayed",
    sensitiveDetailPolicy: "no-sensitive-details",
    fallbackChannel: DEFAULT_FAMILIAR_CARE_SCENARIO.fallbackChannel,
    optOutInstruction: DEFAULT_FAMILIAR_CARE_OPT_OUT,
    consent: confirmedConsent,
    ...overrides,
  };
}

test.describe("Familiar Care consent, disclosure, and risk policy", () => {
  test("blocks generation until every consent confirmation is present", () => {
    const result = validateFamiliarCareRequest({ text: DEFAULT_FAMILIAR_CARE_SCENARIO.sampleMessage, policy: policy({ consent: EMPTY_FAMILIAR_CARE_CONSENT }) });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Every Familiar Care consent confirmation is required.");
  });

  test("requires spoken disclosure and verified fallback for medium and high risk", () => {
    expect(validateFamiliarCareRequest({ text: "Routine reminder.", policy: policy({ disclosureStyle: "displayed-only" }) }).errors).toContain("Medium- and high-risk scenarios require a spoken disclosure.");
    expect(validateFamiliarCareRequest({ text: "Routine reminder.", policy: policy({ fallbackChannel: "none" }) }).errors).toContain("Medium- and high-risk scenarios require a verified fallback channel.");

    const family = FAMILIAR_CARE_SCENARIOS.find((item) => item.id === "family-memory-reminder")!;
    const highRisk = policy({ scenarioId: family.id, riskLevel: family.riskLevel, fallbackChannel: family.fallbackChannel });
    expect(validateFamiliarCareRequest({ text: family.sampleMessage, policy: highRisk }).ok).toBe(true);
  });

  test("rejects a forged lower risk classification", () => {
    const result = validateFamiliarCareRequest({ text: "Routine reminder.", policy: policy({ riskLevel: "Low" }) });
    expect(result.errors).toContain("The submitted risk classification does not match the selected scenario.");
  });

  test("defaults to no sensitive details aloud", () => {
    expect(policy().sensitiveDetailPolicy).toBe("no-sensitive-details");
  });

  test("blocks full card numbers and authentication codes", () => {
    expect(analyzeFamiliarCareText("Card 4111 1111 1111 1111")).toContainEqual(expect.objectContaining({ kind: "blocked", category: "Full payment-card number" }));
    expect(analyzeFamiliarCareText("Your verification code is 123456")).toContainEqual(expect.objectContaining({ kind: "blocked", category: "Authentication code" }));
    expect(validateFamiliarCareRequest({ text: "Your verification code is 123456", policy: policy({ sensitiveDetailPolicy: "authenticated-session" }) }).ok).toBe(false);
  });

  test("warns on likely sensitive text and requires revision or an elevated policy", () => {
    const text = "Your metformin is ready and your balance is $245.18.";
    const defaultResult = validateFamiliarCareRequest({ text, policy: policy() });
    expect(defaultResult.findings.map((item) => item.category)).toEqual(expect.arrayContaining(["Medication name", "Financial balance"]));
    expect(defaultResult.ok).toBe(false);
    expect(validateFamiliarCareRequest({ text, policy: policy({ sensitiveDetailPolicy: "authenticated-session" }) }).ok).toBe(true);
  });

  test("places disclosure and opt-out in the final delivery preview", () => {
    const beginning = buildFamiliarCareDeliveryPreview({ scenarioId: DEFAULT_FAMILIAR_CARE_SCENARIO.id, message: "Pickup is ready.", disclosureStyle: "spoken-and-displayed", fallbackChannel: "verified-mobile-app", optOutInstruction: DEFAULT_FAMILIAR_CARE_OPT_OUT });
    expect(beginning.spokenText).toMatch(/^This is an automated message/);
    expect(beginning.spokenText).toContain(DEFAULT_FAMILIAR_CARE_OPT_OUT);
    const ending = buildFamiliarCareDeliveryPreview({ scenarioId: DEFAULT_FAMILIAR_CARE_SCENARIO.id, message: "Pickup is ready.", disclosureStyle: "spoken-end", fallbackChannel: "verified-mobile-app", optOutInstruction: DEFAULT_FAMILIAR_CARE_OPT_OUT });
    expect(ending.spokenText).toMatch(/approved synthetic voice\.$/);
  });

  test("sanitized raw requests exclude message, recipient details, and credentials", () => {
    const exported = JSON.stringify(sanitizeFamiliarCareRequest({ text: "Private recipient message", model: "aura-2-helena-en", policy: policy() }));
    expect(exported).not.toContain("Private recipient message");
    expect(exported).not.toMatch(/authorization|api[_-]?key|temporary token/i);
    expect(exported).toContain("***redacted***");
  });
});

test.describe("Familiar Care server enforcement and hosted review", () => {
  test("TTS route validates Familiar Care policy before Deepgram generation", () => {
    const handler = readFileSync(resolve(process.cwd(), "src/lib/providers/tts-route-handler.ts"), "utf8");
    const adapter = readFileSync(resolve(process.cwd(), "src/lib/providers/deepgram/adapters.ts"), "utf8");
    const client = readFileSync(resolve(process.cwd(), "src/lib/providers/deepgram/client.ts"), "utf8");
    expect(handler.indexOf("validateFamiliarCareRequest")).toBeLessThan(handler.indexOf("adapter.execute(payload"));
    expect(handler).toContain("authorizeFamiliarCarePreview");
    expect(handler).toContain("sanitizeFamiliarCareRequest");
    expect(adapter).toContain("execute: generateCanonicalDeepgramSpeech");
    expect(client).toContain("generateSpeechAudio(payload as unknown as TtsRequest, context)");
  });

  test("the server-used validator rejects a Familiar Care request without consent", () => {
    const result = validateFamiliarCareRequest({
      text: "Private message that must not appear in diagnostics",
      policy: policy({ consent: EMPTY_FAMILIAR_CARE_CONSENT }),
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Every Familiar Care consent confirmation is required.");
  });

  test("hosted mode requires an unlocked session, enforces cooldown and quota", () => {
    const secret = "fixture-signing-secret-with-enough-entropy";
    const locked = authorizeFamiliarCarePreview({ hosted: true, enabled: true, cookieHeader: null, secret, now: 1_000 });
    expect(locked).toMatchObject({ ok: false, status: 423 });

    const created = createFamiliarCareReviewerSession({ hosted: true, enabled: true, secret, now: 10_000 });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.token) throw new Error("Expected hosted session token");
    const cookie = `familiar_care_review=${created.token}`;
    const first = authorizeFamiliarCarePreview({ hosted: true, enabled: true, cookieHeader: cookie, secret, now: 11_000 });
    expect(first).toMatchObject({ ok: true, mode: "hosted", remaining: 2 });
    if (!first.ok || !first.setCookie) throw new Error("Expected rotated session cookie");
    const secondCookie = first.setCookie.split(";")[0];
    expect(authorizeFamiliarCarePreview({ hosted: true, enabled: true, cookieHeader: secondCookie, secret, now: 12_000 })).toMatchObject({ ok: false, status: 429 });
    const second = authorizeFamiliarCarePreview({ hosted: true, enabled: true, cookieHeader: secondCookie, secret, now: 27_000 });
    if (!second.ok || !second.setCookie) throw new Error("Expected second rotated session cookie");
    const third = authorizeFamiliarCarePreview({ hosted: true, enabled: true, cookieHeader: second.setCookie.split(";")[0], secret, now: 43_000 });
    if (!third.ok || !third.setCookie) throw new Error("Expected third rotated session cookie");
    const exhausted = authorizeFamiliarCarePreview({ hosted: true, enabled: true, cookieHeader: third.setCookie.split(";")[0], secret, now: 59_000 });
    expect(exhausted).toMatchObject({ ok: false, status: 429 });
    if (exhausted.ok) throw new Error("Expected exhausted session");
    expect(exhausted.message).toContain("three-preview quota");
    expect(authorizeFamiliarCarePreview({ hosted: true, enabled: false, cookieHeader: cookie, secret, now: 30_000 })).toMatchObject({ ok: false, status: 503 });
    expect(authorizeFamiliarCarePreview({ hosted: true, enabled: true, cookieHeader: `${cookie}tampered`, secret, now: 30_000 })).toMatchObject({ ok: false, status: 423 });
  });

  test("audio is client-memory-only and cleaned up after server handoff", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/trusted-voice/FamiliarCareExperience.tsx"), "utf8");
    expect(source).toContain("URL.createObjectURL(blob)");
    expect(source).toContain("URL.revokeObjectURL");
    expect(source).toContain("method: \"DELETE\"");
    expect(source).not.toMatch(/localStorage|sessionStorage|autoPlay\s*=/i);
  });

  test("UI copy excludes unsafe exact-replication and literal-caller claims", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/trusted-voice/FamiliarCareExperience.tsx"), "utf8");
    expect(source).not.toMatch(/clone a loved one|bring someone back|sound exactly like|resurrect a voice|your relative is calling/i);
  });

  test("guided tour opens Familiar Care without invoking its primary action", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/keyboard-shortcuts/KeyboardShortcutController.tsx"), "utf8");
    expect(source).toContain("Open Familiar Care stop");
    expect(source).toContain("data-guided-tour-target");
    expect(source).not.toMatch(/onOpenFamiliarCare[^]*run_primary/);
  });
});
