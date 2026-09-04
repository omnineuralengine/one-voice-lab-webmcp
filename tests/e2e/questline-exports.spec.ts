import { expect, test, type Download } from "@playwright/test";

import {
  captureDownload,
  expectSanitizedDownload,
  openAppliedEngineeringQuestline,
  selectQuestlineWorkspace,
} from "./helpers";

const TEST_SECRET = "questline_test_secret_0123456789abcdefghijklmnopqrstuvwxyz";
const PLACEHOLDER = "DEEPGRAM_API_KEY";

test.describe("@questline sanitized exports", () => {
  test.beforeEach(async ({ page }) => {
    await openAppliedEngineeringQuestline(page);
  });

  test("exports local progress and notes without credential material", async ({ page }) => {
    await selectQuestlineWorkspace(page, "Capstones + Drills");
    await page.getByRole("button", { name: /exports/i, exact: true }).click();

    const notes = page.getByLabel(/Learning notes/i);
    await notes.fill(`Keep ${PLACEHOLDER} as a placeholder. Authorization: Token ${TEST_SECRET}`);
    await expect(notes).toHaveValue(/redacted/i);

    const progressDownload = await captureDownload(page, () => page.getByRole("button", { name: "Export progress JSON" }).click());
    const progressText = await assertArtifact(progressDownload, "questline-progress.json");
    const progress = JSON.parse(progressText) as {
      _metadata: { generated: boolean; status: string; verification: string };
      notes: string;
      questStatuses: Record<string, string>;
      confidenceRating: number;
    };
    expect(progress.notes).toContain(PLACEHOLDER);
    expect(progress.notes).toMatch(/redacted/i);
    expect(progress.notes).not.toContain(TEST_SECRET);
    expect(progress.questStatuses).toBeDefined();
    expect(progress.confidenceRating).toBeGreaterThanOrEqual(1);
    expect(progress._metadata).toMatchObject({ generated: true, status: "local-only" });

    const notesDownload = await captureDownload(page, () => page.getByRole("button", { name: "Download notes Markdown" }).click());
    const notesText = await assertArtifact(notesDownload, "questline-learning-notes.md");
    expect(notesText).toContain("# Applied Engineering Questline Notes");
    expect(notesText).toContain(PLACEHOLDER);
    expect(notesText).toMatch(/redacted/i);
    expect(notesText).toContain("- Generated: yes");
    expect(notesText).toContain("- Status: local-only");
  });

  test("exports incident and simulated audio evidence with sanitization", async ({ page }) => {
    await selectQuestlineWorkspace(page, "Incident Drills");
    await page.getByLabel("Investigation plan").fill(`Inspect runtime evidence. Authorization: Token ${TEST_SECRET}`);
    await page.getByLabel("Explain to the client").fill(`Use ${PLACEHOLDER} only as a placeholder; ${TEST_SECRET} must be removed.`);
    await page.getByRole("button", { name: "Submit diagnosis" }).click();
    await expect(page.getByRole("heading", { name: "Resolution and prevention" })).toBeVisible();

    const incidentDownload = await captureDownload(page, () => page.getByRole("button", { name: "Export incident report" }).click());
    const incidentText = await assertArtifact(incidentDownload, "python-wrong-venv-incident-report.md");
    expect(incidentText).toContain("# Client Incident Report");
    expect(incidentText).toContain("Classification: integration-bug");
    expect(incidentText).toContain(PLACEHOLDER);
    expect(incidentText).toMatch(/redacted/i);
    expect(incidentText).toContain("## Resolution evidence");
    expect(incidentText).toContain("- Status: simulated");

    await selectQuestlineWorkspace(page, "Audio Engineering");
    await page.getByRole("button", { name: "Digital silence" }).click();
    await expect(page.getByText(/digital silence fixture generated locally/i)).toBeVisible();

    const audioDownload = await captureDownload(page, () => page.getByRole("button", { name: "Export diagnosis" }).click());
    const audioText = await assertArtifact(audioDownload, "audio-diagnosis-report.md");
    expect(audioText).toContain("# Audio Diagnosis Report");
    expect(audioText).toContain("Source: digital silence fixture");
    expect(audioText).toContain("Provenance: simulated");
    expect(audioText).toContain("Local Float32 samples; no container");
    expect(audioText).not.toMatch(/data:audio|base64,/i);
  });

  test("exports capstone, polyglot, and stack-adapter artifacts with safe placeholders", async ({ page }) => {
    await selectQuestlineWorkspace(page, "Capstones + Drills");
    const capstoneDownload = await captureDownload(page, () => page.getByRole("button", { name: "Export solution brief" }).click());
    const capstoneText = await assertArtifact(capstoneDownload, "browser-voice-assistant-solution-brief.md");
    expect(capstoneText).toContain("# Browser Voice Assistant");
    expect(capstoneText).toContain("## Deepgram APIs");
    expect(capstoneText).toContain("Verify current Deepgram");
    expect(capstoneText).toContain("- Generated: yes");
    expect(capstoneText).toContain("- Status: needs-verification");

    await selectQuestlineWorkspace(page, "Compare Languages");
    await page.getByRole("button", { name: "Auth", exact: true }).click();
    const polyglotDownload = await captureDownload(page, () => page.getByRole("button", { name: "Export Markdown" }).click());
    const polyglotText = await assertArtifact(polyglotDownload, "polyglot-transcribe-hosted-url-authentication.md");
    expect(polyglotText).toContain("# Polyglot comparison: Transcribe hosted URL");
    expect(polyglotText).toContain("Focus: Auth");
    expect(polyglotText).toContain("Status: executable");
    expect(polyglotText).toContain("- Generated: yes");
    expect(polyglotText).toContain(PLACEHOLDER);
    expect(polyglotText).not.toContain(TEST_SECRET);

    await selectQuestlineWorkspace(page, "Client Stack Adapter");
    await page.getByLabel("Security requirements").fill(`Server-only boundary. Authorization: Token ${TEST_SECRET}`);
    await page.getByRole("button", { name: "Generate stack recommendation" }).click();
    await expect(page.getByRole("button", { name: "Export JSON" })).toBeVisible();
    const stackDownload = await captureDownload(page, () => page.getByRole("button", { name: "Export JSON" }).click());
    const stackText = await assertArtifact(stackDownload, "client-stack-adapter.json");
    const stack = JSON.parse(stackText) as {
      _metadata: { generated: boolean; status: string; verification: string };
      input: { securityRequirements: string };
      recommendation: { status: string; environmentSetup: string[] };
    };
    expect(stack.input.securityRequirements).toMatch(/redacted/i);
    expect(stack.input.securityRequirements).not.toContain(TEST_SECRET);
    expect(["simulated", "docs-verification-required", "conceptual"]).toContain(stack.recommendation.status);
    expect(stack._metadata.generated).toBe(true);
    expect(stack._metadata.verification).toContain("official-docs-review-required");
    expect(stack.recommendation.environmentSetup.join("\n")).toContain(PLACEHOLDER);
  });
});

async function assertArtifact(download: Download, expectedFilename: string) {
  expect(download.suggestedFilename()).toBe(expectedFilename);
  const text = await expectSanitizedDownload(download, [TEST_SECRET]);
  expect(text).not.toContain(TEST_SECRET);
  expect(text).not.toMatch(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/);
  return text;
}
