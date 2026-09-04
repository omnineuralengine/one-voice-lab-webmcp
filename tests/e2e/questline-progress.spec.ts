import { expect, test, type Page } from "@playwright/test";

import {
  CODE_LAB_DRAFT_PREFIX,
  CODE_LAB_IMPORTED_DRAFT_PREFIX,
} from "../../src/lib/code-lab-storage";
import {
  QUESTLINE_STORAGE_KEY,
  clearLabStorage,
  openAppliedEngineeringQuestline,
  readLocalStorageJson,
  readStorageSnapshot,
  selectQuestlineWorkspace,
  setQuestCompletionStatus,
} from "./helpers";

const PROGRESS_NOTE = "Explain the runtime boundary, inspect evidence, then test the smallest failing layer.";

type StoredProgress = {
  questStatuses: Record<string, string>;
  notes: string;
  confidenceRating: number;
};

test.describe("@questline local progress", () => {
  test("status, notes, and confidence survive a reload", async ({ page }) => {
    await resetBrowserState(page);
    await openAppliedEngineeringQuestline(page);

    await setQuestCompletionStatus(page, "Needs review");
    await page.getByRole("textbox", { name: "Questline learning notes" }).fill(PROGRESS_NOTE);
    await selectQuestlineWorkspace(page, /Capstones \+ Drills/i);
    await page.getByRole("button", { name: "exports", exact: true }).click();
    const confidence = page.getByRole("slider", { name: /Confidence rating/i });
    await confidence.fill("5");

    await expect.poll(async () => readLocalStorageJson<StoredProgress>(page, QUESTLINE_STORAGE_KEY)).toMatchObject({
      notes: PROGRESS_NOTE,
      confidenceRating: 5,
    });
    const beforeReload = await readLocalStorageJson<StoredProgress>(page, QUESTLINE_STORAGE_KEY);
    expect(Object.values(beforeReload?.questStatuses ?? {})).toContain("needs-review");

    await page.reload();
    await page.waitForLoadState("networkidle");
    await openAppliedEngineeringQuestline(page);
    await expect(page.getByRole("combobox", { name: "Quest completion status" })).toHaveValue("needs-review");
    await expect(page.getByRole("textbox", { name: "Questline learning notes" })).toHaveValue(PROGRESS_NOTE);

    await selectQuestlineWorkspace(page, /Capstones \+ Drills/i);
    await page.getByRole("button", { name: "exports", exact: true }).click();
    await expect(page.getByRole("slider", { name: /Confidence rating/i })).toHaveValue("5");
  });

  test("launch context stays in memory and imported drafts require explicit save", async ({ page }) => {
    await resetBrowserState(page);
    const standardDraftKey = `${CODE_LAB_DRAFT_PREFIX}test-seed`;
    await page.evaluate(
      ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
      { key: standardDraftKey, value: "// existing standard draft" },
    );
    await openAppliedEngineeringQuestline(page);
    await setQuestCompletionStatus(page, "Practiced");
    await expect.poll(async () => page.evaluate((key) => window.localStorage.getItem(key), QUESTLINE_STORAGE_KEY)).not.toBeNull();

    await launchActiveQuestInTemporaryCodeLab(page);
    const marker = "// explicit questline draft save marker";
    const editor = page.getByTestId("code-lab-editor");
    await editor.fill(marker);

    const beforeSave = await readStorageSnapshot(page);
    expect(Object.keys(beforeSave.localStorage).some((key) => key.startsWith(CODE_LAB_IMPORTED_DRAFT_PREFIX))).toBe(false);
    expect(JSON.stringify(beforeSave)).not.toContain(marker);
    expectLaunchContextAbsent(beforeSave.localStorage);

    await page.getByRole("button", { name: "Save as local draft", exact: true }).click();
    await expect(page.getByRole("button", { name: /Saved locally\./ })).toBeVisible();
    const afterSave = await readStorageSnapshot(page);
    const importedKeys = Object.keys(afterSave.localStorage).filter((key) =>
      key.startsWith(CODE_LAB_IMPORTED_DRAFT_PREFIX),
    );
    expect(importedKeys).toHaveLength(1);
    expect(afterSave.localStorage[importedKeys[0]]).toContain(marker);
    expectLaunchContextAbsent(afterSave.localStorage);

    await page.getByRole("button", { name: "Discard temporary workspace", exact: true }).click();
    await page.getByRole("alertdialog", { name: "Confirm destructive action" }).getByRole("button", { name: "Confirm action" }).click();
    await expect(page.getByTestId("questline-launch-banner")).toBeHidden();
    await expect.poll(async () => page.evaluate((key) => window.localStorage.getItem(key), QUESTLINE_STORAGE_KEY)).not.toBeNull();
    await expect.poll(async () => page.evaluate((key) => window.localStorage.getItem(key), standardDraftKey)).not.toBeNull();
    await expect.poll(async () => page.evaluate((key) => window.localStorage.getItem(key), importedKeys[0])).not.toBeNull();

    await page.evaluate((key) => window.localStorage.removeItem(key), importedKeys[0]);
    expect(await page.evaluate((key) => window.localStorage.getItem(key), importedKeys[0])).toBeNull();
    expect(await page.evaluate((key) => window.localStorage.getItem(key), QUESTLINE_STORAGE_KEY)).not.toBeNull();
    expect(await page.evaluate((key) => window.localStorage.getItem(key), standardDraftKey)).not.toBeNull();

    await page.evaluate((key) => window.localStorage.removeItem(key), QUESTLINE_STORAGE_KEY);
    expect(await page.evaluate((key) => window.localStorage.getItem(key), standardDraftKey)).not.toBeNull();
  });
});

function expectLaunchContextAbsent(localStorage: Record<string, string>) {
  expect(Object.keys(localStorage).some((key) => key.includes("memory:") || key.includes("code-lab-launch"))).toBe(false);
  const serialized = JSON.stringify(localStorage);
  for (const contextField of [
    '"createdAt"',
    '"projectTree"',
    '"semanticRegions"',
    '"lessonNotes"',
    '"source":"questline"',
  ]) {
    expect(serialized).not.toContain(contextField);
  }
}

async function resetBrowserState(page: Page) {
  await page.goto("/");
  await clearLabStorage(page);
  await page.reload();
  await page.waitForLoadState("networkidle");
}

async function launchActiveQuestInTemporaryCodeLab(page: Page) {
  await page.getByRole("button", { name: "Open this quest in Code Lab", exact: true }).first().click();
  const dialog = page.getByTestId("code-lab-launch-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("radio", { name: /Open as a new temporary workspace/i }).check();
  await dialog.getByTestId("confirm-code-lab-launch").click();
  await expect(page.getByTestId("questline-launch-banner")).toBeVisible();
  await expect(page.getByTestId("code-lab-editor")).toBeVisible();
}
