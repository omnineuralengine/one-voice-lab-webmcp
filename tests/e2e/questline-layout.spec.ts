import { expect, test, type Page } from "@playwright/test";

import {
  TARGET_VIEWPORTS,
  clearLabStorage,
  expectInternalScrollRegion,
  expectLocatorWithinViewport,
  expectLocatorsNotToOverlap,
  expectNoPageLevelOverflow,
  openAppliedEngineeringQuestline,
} from "./helpers";

const PROJECT_VIEWPORTS = {
  "chromium-1366x768": TARGET_VIEWPORTS.compactDesktop,
  "chromium-1440x900": TARGET_VIEWPORTS.standardDesktop,
  "chromium-1920x1080": TARGET_VIEWPORTS.wideDesktop,
} as const;

test.describe("@questline Questline desktop layout", () => {
  test.beforeEach(async ({ page }) => {
    await mockDeepgramRoutes(page);
    await clearLabStorage(page);
  });

  test("keeps the Questline, launch dialog, and temporary Code Lab workspace inside the configured viewport", async ({ page }, testInfo) => {
    const expectedViewport = PROJECT_VIEWPORTS[testInfo.project.name as keyof typeof PROJECT_VIEWPORTS];
    expect(expectedViewport, `${testInfo.project.name} must remain one of the three supported desktop projects.`).toBeDefined();
    expect(page.viewportSize()).toEqual(expectedViewport);

    await openAppliedEngineeringQuestline(page);
    await expectNoPageLevelOverflow(page);

    const workspaceNavigation = page.getByRole("navigation", { name: "Questline workspaces" });
    const languageNavigation = page.getByRole("navigation", { name: "Language tracks" });
    const leftNavigation = page.getByTestId("questline-left-navigation");
    const questTree = page.getByLabel("Quest tree");
    const runtimeHeading = page.getByRole("heading", { name: "What the runtime is actually doing", exact: true });
    await expectLocatorWithinViewport(workspaceNavigation);
    await expectLocatorWithinViewport(leftNavigation);
    await expectInternalScrollRegion(leftNavigation);
    await expect(languageNavigation.getByRole("button", { name: /Python/ }).first()).toBeAttached();
    await expectLocatorWithinViewport(questTree);
    await expectLocatorWithinViewport(runtimeHeading);
    await expectInternalScrollRegion(questTree);

    const topControls = [
      page.getByRole("button", { name: "Compare Languages", exact: true }).first(),
      page.getByRole("button", { name: "Open this quest in Code Lab", exact: true }).first(),
      page.getByRole("button", { name: "Open related API", exact: true }).first(),
      page.getByRole("button", { name: "Start Scenario Drill", exact: true }),
      page.getByRole("button", { name: "Payload Inspector", exact: true }),
    ];
    for (const control of topControls) await expectLocatorWithinViewport(control);
    await expectLocatorsNotToOverlap(topControls);

    await topControls[1].click();
    const dialog = page.getByTestId("code-lab-launch-dialog");
    await expectLocatorWithinViewport(dialog);
    await expectNoPageLevelOverflow(page);
    const dialogActions = [
      dialog.getByRole("button", { name: "Cancel", exact: true }),
      dialog.getByRole("button", { name: "Open in Code Lab", exact: true }),
    ];
    for (const control of dialogActions) await expectLocatorWithinViewport(control);
    await expectLocatorsNotToOverlap(dialogActions);

    await dialog.getByRole("button", { name: "Open in Code Lab", exact: true }).click();
    const workspace = page.getByTestId("code-lab-workspace");
    const projectTree = page.getByRole("complementary", { name: "Code Lab project tree" });
    const teachingPanel = page.getByRole("complementary", { name: "Questline teaching panel" });
    await expectLocatorWithinViewport(page.getByTestId("questline-launch-banner"));
    await expectLocatorWithinViewport(workspace);
    await expectLocatorWithinViewport(projectTree);
    await expectLocatorWithinViewport(page.getByTestId("code-lab-editor"));
    await expectLocatorWithinViewport(teachingPanel);
    await expectInternalScrollRegion(projectTree);
    await expectInternalScrollRegion(teachingPanel);

    const banner = page.getByTestId("questline-launch-banner");
    const bannerActions = [
      banner.getByRole("button", { name: "Return to Questline", exact: true }),
      banner.getByRole("button", { name: "Open related API", exact: true }),
      banner.getByRole("button", { name: "Discard temporary workspace", exact: true }),
    ];
    for (const control of bannerActions) await expectLocatorWithinViewport(control);
    await expectLocatorsNotToOverlap(bannerActions);
    await expectNoPageLevelOverflow(page);
  });
});

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
