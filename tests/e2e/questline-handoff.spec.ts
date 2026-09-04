import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  CODE_LAB_DRAFT_PREFIX,
  clearLabStorage,
  expectBrowserSurfaceSanitized,
  openAppliedEngineeringQuestline,
} from "./helpers";

const IMPORTED_DRAFT_PREFIX = "deepgram-code-lab:imported-draft:v1:";
const TEMPORARY_LAUNCH_MARKER = "deepgram-code-lab:temporary-launch-marker:v1";
const TYPE_SCRIPT_OPERATOR_QUEST = /Deepgram request operator/i;
const GENERATED_SERVER_FILE = "src/server/transcribe.ts";

test.describe("@questline Questline to Code Lab handoff", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-1440x900",
      "Functional handoff coverage runs once; questline-layout.spec.ts exercises every desktop project.",
    );
    await mockDeepgramRoutes(page);
    await clearLabStorage(page);
  });

  test("opens a TypeScript API quest as the default temporary teaching workspace", async ({ page }) => {
    const { dialog } = await openTypeScriptOperatorLaunchDialog(page);
    await expect(dialog.getByRole("radio", { name: /Open as a new temporary workspace/i })).toBeChecked();
    await expect(dialog.getByTestId("launch-context-summary")).toContainText("TypeScript");
    await expect(dialog.getByTestId("launch-context-summary")).toContainText("Transcribe hosted audio URL");

    await confirmLaunch(dialog);

    const banner = page.getByTestId("questline-launch-banner");
    await expect(banner).toContainText("Temporary workspace");
    await expect(banner).toContainText("Generated from Questline");
    await expect(page.getByRole("combobox", { name: "Code Lab workflow" })).toHaveValue("transcribe-url");
    await expect(page.getByRole("button", { name: "JavaScript / TypeScript", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("code-lab-editor")).toHaveAttribute(
      "aria-label",
      `Edit ${GENERATED_SERVER_FILE}`,
    );

    const projectTree = page.getByRole("complementary", { name: "Code Lab project tree" });
    await expect(projectTree).toContainText(GENERATED_SERVER_FILE);
    await projectTree.getByRole("button", { name: GENERATED_SERVER_FILE, exact: true }).click();

    const editor = page.getByTestId("code-lab-editor");
    await expect(editor).toHaveAttribute("aria-label", `Edit ${GENERATED_SERVER_FILE}`);
    await expect(editor).toHaveValue(/https:\/\/api\.deepgram\.com\/v1\/listen/);
    await expect(editor).toHaveValue(/process\.env\.DEEPGRAM_API_KEY/);
    await expect(page.getByRole("heading", { name: "Lesson notes", exact: true })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Questline teaching panel" })).toContainText("First principles");

    const semanticNavigation = page.getByTestId("semantic-region-navigation");
    const authRegion = semanticNavigation
      .getByRole("button")
      .filter({ hasText: "Authentication" })
      .filter({ hasText: GENERATED_SERVER_FILE });
    await expect(authRegion).toHaveCount(1);
    await authRegion.click();
    await expect(authRegion).toHaveAttribute("aria-pressed", "true");
    const selectedCode = await editor.evaluate((element: HTMLTextAreaElement) =>
      element.value.slice(element.selectionStart, element.selectionEnd),
    );
    expect(selectedCode).toContain("process.env.DEEPGRAM_API_KEY");

    await expectBrowserSurfaceSanitized(page);
  });

  test("saves an explicit sanitized local draft and resets the in-memory file to its starter", async ({ page }) => {
    const { dialog } = await openTypeScriptOperatorLaunchDialog(page);
    await confirmLaunch(dialog);
    await openGeneratedServerFile(page);

    const editor = page.getByTestId("code-lab-editor");
    const starter = await editor.inputValue();
    const learnerMarker = "// learner-note: inspect status before parsing";
    await editor.fill(`${starter}\n${learnerMarker}`);
    await expect(page.getByTestId("questline-launch-banner")).toContainText("Modified");

    await page.getByRole("button", { name: "Save as local draft", exact: true }).click();
    await expect(page.getByTestId("questline-launch-banner")).toContainText("Saved locally");

    const savedBeforeReset = await importedDraftEntries(page);
    expect(savedBeforeReset).toHaveLength(1);
    expect(JSON.parse(savedBeforeReset[0][1]) as string).toContain(learnerMarker);

    await page.getByRole("button", { name: "Reset File", exact: true }).click();
    await expect(editor).toHaveValue(starter);
    await expect(page.getByTestId("questline-launch-banner").getByText("Saved locally", { exact: true })).toHaveCount(0);

    const savedAfterReset = await importedDraftEntries(page);
    expect(savedAfterReset).toEqual(savedBeforeReset);
    await expectBrowserSurfaceSanitized(page);
  });

  test("merge mode renames generated collisions and never overwrites the existing draft", async ({ page }) => {
    const collidingPath = "src/components/TranscribeUrlCard.tsx";
    const localDraft = "// existing-local-draft-must-survive\nexport const owner = \"client\";";
    const draftKey = `${CODE_LAB_DRAFT_PREFIX}transcribe-url:TypeScript:${encodeURIComponent(collidingPath)}`;
    await page.evaluate(
      ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
      { key: draftKey, value: localDraft },
    );

    const { dialog } = await openTypeScriptOperatorLaunchDialog(page);
    await dialog.getByRole("radio", { name: /Merge generated files/i }).check();
    await confirmLaunch(dialog);

    const importedPath = `.questline-imports/typescript-tier-2/${collidingPath}`;
    const tree = page.getByRole("complementary", { name: "Code Lab project tree" });
    const existingFile = tree.getByRole("button", { name: /^src\/components\/TranscribeUrlCard\.tsx/ });
    await expect(existingFile).toBeVisible();
    await expect(tree.getByRole("button", { name: importedPath, exact: true })).toBeVisible();

    await existingFile.click();
    await expect.poll(() => page.getByTestId("code-lab-editor").inputValue()).toContain("existing-local-draft-must-survive");

    await tree.getByRole("button", { name: importedPath, exact: true }).click();
    await expect(page.getByTestId("code-lab-editor")).not.toHaveValue(/existing-local-draft-must-survive/);
    await expect(page.getByTestId("code-lab-editor")).toHaveValue(/\/api\/deepgram\/transcribe-url/);
    expect(await page.evaluate((key) => window.localStorage.getItem(key), draftKey)).toBe(JSON.stringify(localDraft));
  });

  test("replace mode changes only the in-memory view and leaves stored drafts untouched", async ({ page }) => {
    const localPath = "src/local-only.ts";
    const localDraft = "// saved-before-replace\nexport const remainsLocal = true;";
    const draftKey = `${CODE_LAB_DRAFT_PREFIX}transcribe-url:TypeScript:${encodeURIComponent(localPath)}`;
    await page.evaluate(
      ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
      { key: draftKey, value: localDraft },
    );

    const { dialog } = await openTypeScriptOperatorLaunchDialog(page);
    await expect(dialog).toContainText("1 standard draft(s)");
    await dialog.getByRole("radio", { name: /Replace workspace/i }).check();
    await confirmLaunch(dialog);

    const tree = page.getByRole("complementary", { name: "Code Lab project tree" });
    await expect(tree.getByRole("button", { name: localPath, exact: true })).toHaveCount(0);
    await expect(tree.getByRole("button", { name: GENERATED_SERVER_FILE, exact: true })).toBeVisible();
    expect(await page.evaluate((key) => window.localStorage.getItem(key), draftKey)).toBe(JSON.stringify(localDraft));
  });

  test("expires the temporary launch on refresh while preserving explicitly saved drafts", async ({ page }) => {
    const { dialog } = await openTypeScriptOperatorLaunchDialog(page);
    await confirmLaunch(dialog);
    expect(new URL(page.url()).search).toBe("");
    expect(new URL(page.url()).hash).toBe("");
    await openGeneratedServerFile(page);

    const editor = page.getByTestId("code-lab-editor");
    await editor.fill(`${await editor.inputValue()}\n// survives-refresh-as-explicit-draft`);
    await page.getByRole("button", { name: "Save as local draft", exact: true }).click();
    await expect(page.getByTestId("questline-launch-banner")).toContainText("Saved locally");
    expect(await page.evaluate((key) => window.sessionStorage.getItem(key), TEMPORARY_LAUNCH_MARKER)).toBe("active");
    const savedEntries = await importedDraftEntries(page);
    expect(savedEntries).toHaveLength(1);

    await page.reload();

    await expect(
      page.getByRole("status").filter({ hasText: "temporary Code Lab launch context expired after refresh" }),
    ).toBeVisible();
    await expect(page.getByTestId("questline-launch-banner")).toHaveCount(0);
    expect(await page.evaluate((key) => window.sessionStorage.getItem(key), TEMPORARY_LAUNCH_MARKER)).toBeNull();
    expect(await importedDraftEntries(page)).toEqual(savedEntries);
  });

  test("opens the related API operation and returns to the originating quest", async ({ page }) => {
    const { dialog } = await openTypeScriptOperatorLaunchDialog(page);
    await confirmLaunch(dialog);

    await page.getByTestId("questline-launch-banner").getByRole("button", { name: "Open related API" }).click();
    await expect(page.getByRole("heading", { name: "API Studio", exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Transcribe Prerecorded Audio", exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Return to Questline", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Applied Engineering Questline", exact: true }).first()).toBeVisible();
    await expect(page.getByLabel("Quest tree").getByRole("button", { name: TYPE_SCRIPT_OPERATOR_QUEST })).toHaveAttribute("aria-pressed", "true");
  });

  test("focuses the safe default and Escape closes the launch dialog back to its trigger", async ({ page }) => {
    const { dialog, trigger } = await openTypeScriptOperatorLaunchDialog(page);
    const temporaryChoice = dialog.getByRole("radio", { name: /Open as a new temporary workspace/i });
    await expect(temporaryChoice).toBeFocused();

    await page.keyboard.press("Escape");

    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});

async function openTypeScriptOperatorLaunchDialog(page: Page) {
  await openAppliedEngineeringQuestline(page);
  const questTree = page.getByLabel("Quest tree");
  await questTree.getByRole("button", { name: TYPE_SCRIPT_OPERATOR_QUEST }).click();
  await expect(page.getByRole("heading", { name: TYPE_SCRIPT_OPERATOR_QUEST })).toBeVisible();

  const trigger = page.getByRole("button", { name: "Open this quest in Code Lab", exact: true }).last();
  await trigger.click();
  const dialog = page.getByTestId("code-lab-launch-dialog");
  await expect(dialog).toBeVisible();
  return { dialog, trigger };
}

async function confirmLaunch(dialog: Locator) {
  await dialog.getByTestId("confirm-code-lab-launch").click();
  await expect(dialog).toHaveCount(0);
  await expect(dialog.page().getByTestId("questline-launch-banner")).toBeVisible();
}

async function openGeneratedServerFile(page: Page) {
  await page
    .getByRole("complementary", { name: "Code Lab project tree" })
    .getByRole("button", { name: GENERATED_SERVER_FILE, exact: true })
    .click();
  await expect(page.getByTestId("code-lab-editor")).toHaveAttribute("aria-label", `Edit ${GENERATED_SERVER_FILE}`);
}

async function importedDraftEntries(page: Page) {
  return page.evaluate((prefix) =>
    Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
      .filter((key): key is string => Boolean(key?.startsWith(prefix)))
      .sort()
      .map((key) => [key, window.localStorage.getItem(key) ?? ""] as [string, string]),
  IMPORTED_DRAFT_PREFIX);
}

async function mockDeepgramRoutes(page: Page) {
  await page.route("**/api/deepgram/**", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: { message: "Playwright fixture: Deepgram network calls are disabled." },
      }),
    });
  });
}
