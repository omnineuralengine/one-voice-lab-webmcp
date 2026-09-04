import { expect, test } from "@playwright/test";

const EVIDENCE_LABELS = [
  "Repository verified",
  "Deepgram documentation verified",
  "Assumption",
  "Experimental idea",
] as const;

test.describe("@open-lab Lab Evolution", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.config.metadata.openLab !== true, "Lab Evolution coverage uses the isolated Open Lab server.");
  });

  test("renders the living notebook from repository-controlled sections", async ({ page }) => {
    await page.goto("/?module=lab-evolution");

    await expect(page.getByTestId("lab-evolution-module")).toBeVisible();
    await expect(page.getByTestId("recursive-learning-loop")).toBeVisible();
    await expect(page.getByTestId("development-architecture")).toBeVisible();
    await expect(page.getByTestId("evidence-philosophy")).toBeVisible();
    await expect(page.getByTestId("module-maturity-overview")).toBeVisible();
    await expect(page.getByTestId("evolution-timeline")).toBeVisible();
    await expect(page.getByTestId("current-experiments")).toBeVisible();
    await expect(page.getByTestId("known-limitations")).toBeVisible();
    await expect(page.getByTestId("next-hypotheses")).toBeVisible();

    await expect(page.getByTestId("recursive-learning-loop").locator("ol > li > strong")).toHaveText([
      "Question",
      "Learn",
      "Build",
      "Observe",
      "Test",
      "Document",
      "Ship",
      "Question again",
    ]);
  });

  test("keeps GitHub canonical, Vercel infrastructural, and Entire parallel", async ({ page }) => {
    await page.goto("/?module=lab-evolution");

    const architecture = page.getByTestId("development-architecture");
    await expect(architecture.locator("ol > li > strong")).toHaveText([
      "Human intent",
      "Codex",
      "Working tree",
      "Git commit",
      "GitHub",
      "Vercel",
      "Live Learning Lab",
      "Evidence / feedback",
      "Next iteration",
    ]);
    await expect(architecture.getByText("GitHub remains canonical source control.", { exact: true })).toBeVisible();
    await expect(architecture.getByText("Vercel remains deployment infrastructure.", { exact: true })).toBeVisible();

    const entire = page.getByTestId("entire-context-layer");
    await expect(entire).toContainText("Parallel from Codex");
    await expect(entire).toContainText("Experimental idea");
    await expect(architecture.locator("ol").getByText("Entire development-context capture")).toHaveCount(0);
  });

  test("shows the four evidence labels and preserves incomplete status boundaries", async ({ page }) => {
    await page.goto("/?module=lab-evolution");

    const philosophy = page.getByTestId("evidence-philosophy");
    for (const label of EVIDENCE_LABELS) {
      await expect(philosophy.locator(`[data-evidence-label="${label}"]`)).toHaveCount(1);
    }

    const maturity = page.getByTestId("module-maturity-overview");
    const planned = maturity.getByRole("listitem").filter({ hasText: "Speak the Problem" });
    await expect(planned).toContainText("Planned");
    await expect(page.getByTestId("evolution-timeline").getByText("Entire checkpoint", { exact: true })).toHaveCount(0);
  });

  test("opens an accessible module Evolution dialog and restores focus", async ({ page }) => {
    await page.goto("/?module=overview");

    const trigger = page.getByTestId("module-evolution-trigger");
    await trigger.click();
    const dialog = page.getByTestId("module-evolution-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Why it exists");
    await expect(dialog).toContainText("Current evidence");
    await expect(dialog).toContainText("GitHub remains canonical source control");

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test("omits unsupported history fields instead of inventing them", async ({ page }) => {
    await page.goto("/?module=lab-evolution");
    await expect(page.getByTestId("evolution-timeline").getByText("Entire checkpoint", { exact: true })).toHaveCount(0);

    await page.goto("/?module=connection");
    await page.getByTestId("module-evolution-trigger").click();
    const dialog = page.getByTestId("module-evolution-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Next experiment", { exact: true })).toHaveCount(0);
  });

  test("collapses both connected flows cleanly at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?module=lab-evolution");

    for (const testId of ["recursive-learning-loop", "development-architecture"] as const) {
      const boxes = await page.getByTestId(testId).locator("ol > li").evaluateAll((items) => items.map((item) => {
        const box = item.getBoundingClientRect();
        return { left: Math.round(box.left), top: Math.round(box.top), width: Math.round(box.width) };
      }));
      expect(boxes.length).toBeGreaterThan(1);
      expect(new Set(boxes.map((box) => box.left)).size).toBe(1);
      expect(boxes.every((box, index) => index === 0 || box.top > boxes[index - 1].top)).toBe(true);
      expect(boxes.every((box) => box.width > 250)).toBe(true);
    }

    const widths = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
  });
});
