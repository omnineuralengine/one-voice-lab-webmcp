import { expect, test } from "@playwright/test";

const structuredResponse = {
  status: "completed",
  message: "AI proposal ready for human review.",
  result: {
    summary: "Start with the audio path, then validate turn detection in the architecture and case workflows.",
    strongestRecommendation: "Inspect the inbound signal before tuning interruption behavior.",
    assumptions: ["The early interruption is caused by turn detection rather than application cancellation."],
    evidenceGaps: ["No timestamped media and turn-event trace is attached."],
    risks: ["Tuning without representative callers may overfit one fixture."],
    discoveryQuestions: ["Which component decides that the caller stopped speaking?"],
    alternatives: ["Compare endpointing and application cancellation separately."],
    recommendedTests: ["Replay representative noisy and clean utterances with identical acceptance criteria."],
    nextModule: { id: "audio-signal-lab", label: "Audio Signal Lab", href: "/?module=audio-signal-lab", reason: "Inspect audio quality before changing conversation policy." },
    claims: [{ statement: "The Lab exposes deterministic workflows.", label: "Repository verified", evidenceIds: ["repo-capability-registry"] }],
    redTeam: null,
    poc: null,
  },
  usage: { timestamp: "2026-08-20T12:00:00.000Z", feature: "intent-router", reasoningClass: "FAST", model: "openai/gpt-5.6-luna", latencyMs: 350, inputTokens: 100, outputTokens: 120, costUsd: null, success: true, fallbackUsed: false },
  requiresHumanAcceptance: true,
  deterministicStateChanged: false,
};

test.describe("Applied Voice AI public flow", () => {
  test("routes an intent with role-based controls and keeps direct navigation", async ({ page }) => {
    await page.route("**/api/ai/reason", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(structuredResponse) }));
    await page.goto("/?module=overview");
    await page.locator("summary").filter({ hasText: "What are you trying to build or understand?" }).click();
    const router = page.getByRole("region", { name: "What are you trying to build or understand?" });
    await expect(router).toBeVisible();
    await router.getByLabel("Request").fill("I have Twilio audio and my agent interrupts callers too early.");
    await router.getByRole("button", { name: "Ask for AI proposal" }).click();
    await expect(router.getByText("Start with the audio path")).toBeVisible();
    await expect(router.getByRole("link", { name: /Next: Audio Signal Lab/ })).toHaveAttribute("href", "/?module=audio-signal-lab");
    await expect(page.getByRole("link", { name: "Compare provider implementation states" })).toHaveAttribute("href", "/providers");
  });

  test("copilot remains keyboard reachable and degrades without hiding the Lab", async ({ page }) => {
    await page.route("**/api/ai/reason", async (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ status: "disabled", message: "AI reasoning is disabled. The deterministic Lab remains fully available.", result: null, usage: null, requiresHumanAcceptance: true, deterministicStateChanged: false }) }));
    await page.goto("/providers");
    await page.getByRole("button", { name: "Applied Voice Copilot", exact: true }).focus();
    await page.keyboard.press("Enter");
    const copilot = page.getByRole("complementary", { name: "Applied Voice Copilot" });
    await expect(copilot.getByRole("heading", { name: /Reason about providers/ })).toBeVisible();
    await copilot.getByRole("button", { name: "Ask for AI proposal" }).click();
    await expect(copilot.getByText("AI reasoning is disabled. The deterministic Lab remains fully available.")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Applied Voice Copilot", exact: true })).toBeFocused();
    await expect(page.getByRole("heading", { name: "Explore voice providers", level: 1 })).toBeVisible();
  });
});
