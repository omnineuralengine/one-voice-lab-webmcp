import { expect, test, type Locator } from "@playwright/test";

const IMPORTANT_PAGES = [
  ["/providers", "Provider Registry"],
  ["/providers/deepgram", "Deepgram provider evidence"],
  ["/evals", "Evaluation Registry"],
  ["/evals/interrupt-mid-response", "Customer interrupts mid-response evaluation"],
  ["/methodology", "Evaluation Methodology"],
  ["/for-agents", "For Browser and API Agents"],
] as const;

const PUBLIC_DISCOVERY_PATHS = [
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/llms-full.txt",
  "/openapi.json",
  "/api/public/v1/lab",
  "/api/public/v1/providers/reson8/capabilities",
  "/api/public/v1/providers/reson8/models",
  "/api/public/v1/providers/reson8/voices",
  "/api/public/v1/providers/reson8/health",
  "/api/public/v1/methodologies",
  "/api/public/v1/leaderboards",
  "/api/public/v1/leaderboards/fixture",
] as const;

async function activateWithKeyboard(locator: Locator) {
  await locator.focus();
  await expect(locator).toBeFocused();
  await locator.press("Enter");
}

test.describe("Agent discovery browser rail", () => {
  test("completes the essential nonbillable journey with role and name locators", async ({ page }) => {
    await page.goto("/for-agents?utm_source=agent_test&utm_medium=automation");
    await expect(page.getByRole("heading", { level: 1, name: "For Agents" })).toBeVisible();

    await activateWithKeyboard(page.getByRole("link", { name: "Explore provider registry" }));
    await expect(page).toHaveURL(/\/providers$/);
    await expect(page.getByRole("heading", { level: 1, name: /provider|rolodex/i })).toBeVisible();

    await activateWithKeyboard(page.getByRole("link", { name: "Open Deepgram evidence profile" }));
    await expect(page).toHaveURL(/\/providers\/deepgram$/);
    await expect(page.getByRole("heading", { level: 1, name: "Deepgram" })).toBeVisible();

    await activateWithKeyboard(page.getByRole("link", { name: "Explore evaluation registry" }));
    await expect(page).toHaveURL(/\/evals$/);
    await activateWithKeyboard(page.getByRole("link", { name: "Open Customer interrupts mid-response evaluation" }));
    await expect(page).toHaveURL(/\/evals\/interrupt-mid-response$/);

    await activateWithKeyboard(page.getByRole("link", { name: "Read evaluation methodology" }));
    await expect(page).toHaveURL(/\/methodology$/);
    await expect(page.getByRole("heading", { level: 1, name: /evaluation methodology/i })).toBeVisible();

    await activateWithKeyboard(page.getByRole("link", { name: "Open canonical synthetic evaluation" }));
    await expect(page).toHaveURL(/\/evals\/interrupt-mid-response$/);
    await activateWithKeyboard(page.getByRole("button", { name: "Run nonbillable synthetic evaluation" }));
    await expect(page.getByRole("status", { name: "Synthetic evaluation result status" })).toContainText("Complete:");
    await expect(page.getByRole("heading", { name: "Structured result" })).toBeVisible();
    await expect(page.getByText("interrupt-mid-response", { exact: true }).first()).toBeVisible();

    await activateWithKeyboard(page.getByRole("link", { name: "Compare listed provider states" }));
    await expect(page).toHaveURL(/\/providers$/);
  });

  test("publishes canonical discovery files, JSON-LD, and named semantic controls", async ({ page, request }) => {
    for (const [path, title] of IMPORTANT_PAGES) {
      await page.goto(path);
      await expect(page).toHaveTitle(new RegExp(title, "i"));
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
    }

    await page.goto("/evals/interrupt-mid-response");
    await expect(page.locator('script[type="application\/ld\+json"]')).not.toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Evidence and machine interfaces" })).toBeVisible();

    const unnamedInteractive = await page.locator("a,button,input,select,textarea").evaluateAll((elements) => elements.filter((element) => {
      const htmlElement = element as HTMLElement;
      const label = htmlElement.getAttribute("aria-label") || htmlElement.getAttribute("title") || htmlElement.innerText || (element as HTMLInputElement).value;
      return !label?.trim();
    }).length);
    expect(unnamedInteractive).toBe(0);

    for (const path of PUBLIC_DISCOVERY_PATHS) {
      const response = await request.get(path);
      const responseStatus = response.status();
      const responseOk = response.ok();
      const responseBody = await response.text();
      await response.dispose();
      expect(
        responseOk,
        `${path} should be public (status ${responseStatus}): ${responseBody.slice(0, 240)}`,
      ).toBe(true);
    }
    expect(await (await request.get("/robots.txt")).text()).toMatch(/User-Agent:\s*GPTBot\s+Disallow:\s*\//i);
    const agentDocument = await (await request.get("/llms.txt")).text();
    expect(agentDocument).toContain("Reson8");
    expect(agentDocument).not.toMatch(/\b[A-Z][A-Z0-9_]*(?:API_KEY|SECRET|TOKEN)\b/);

    const providerPage = await request.get("/api/public/v1/providers?limit=1");
    expect(providerPage.ok()).toBe(true);
    expect(providerPage.headers()["x-result-count"]).toBe("1");
    expect(providerPage.headers()["x-next-cursor"]).toBeTruthy();

    const openapi = await (await request.get("/openapi.json")).json() as { paths?: Record<string, unknown> };
    expect(Object.keys(openapi.paths ?? {})).toEqual(expect.arrayContaining([
      "/api/public/v1/providers/{provider}/capabilities",
      "/api/public/v1/providers/{provider}/models",
      "/api/public/v1/providers/{provider}/voices",
      "/api/public/v1/providers/{provider}/health",
      "/api/public/v1/methodologies",
      "/api/public/v1/leaderboards",
      "/api/public/v1/benchmarks/verify",
    ]));
  });
});
