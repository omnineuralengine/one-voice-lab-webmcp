import { expect, test, type Page } from "@playwright/test";

type CapturedTool = Readonly<{
  name: string;
  execute(input?: unknown): Promise<Readonly<{ structuredContent: Record<string, unknown> }>>;
}>;

type CapturedWindow = Window & {
  __telephonySiteTools: Record<string, CapturedTool>;
  __telephonyRegistrations: Array<{ name: string; topLevel: boolean }>;
};

type ReturnedGate = Readonly<{
  id: string;
  status: string;
  owner: string;
  evidence: readonly Readonly<{ summary: string }>[];
  recommendedNextAction: string;
}>;

type ReturnedReport = Readonly<{
  runId: string;
  gatesPassed: string[];
  gatesNeedingAttention: string[];
  gates: readonly ReturnedGate[];
  timeline: readonly Readonly<{ label: string }>[];
}>;

const ALL_SAFEGUARDS = [
  "enable-token-streaming",
  "shorten-first-response",
  "enable-interruptible-playback",
  "define-silence-policy",
  "require-signature-validation",
  "define-reconnect-fallback",
  "enable-structured-observability",
] as const;

test.describe("Twilio-first WebMCP readiness lab", () => {
  test("keeps the complete human simulation usable without WebMCP or external traffic", async ({ page }) => {
    const traffic = await blockExternalTraffic(page);
    await page.goto("/telephony-readiness");

    await expect(page.getByRole("heading", { name: "Twilio ConversationRelay — first supported telephony adapter" })).toBeVisible();
    await expect(page.getByText("Simulation mode", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Credentials not configured", { exact: true })).toBeVisible();
    await expect(page.getByText("No live call placed", { exact: true })).toBeVisible();
    await expect(page.getByText("Live ConversationRelay requires an eligible funded Twilio account", { exact: false })).toBeVisible();
    await expect(page.getByText("Human UI only", { exact: true })).toBeVisible();

    await page.getByLabel("Scenario").selectOption("combined-production-stress-test");
    for (const label of [
      "Enable token streaming",
      "Shorten the first response",
      "Enable interruptible playback",
      "Define first and repeated silence policy",
      "Require signature validation",
      "Define reconnect and fallback behavior",
      "Enable structured observability",
    ]) {
      await page.getByRole("checkbox", { name: new RegExp(label, "i") }).check();
    }
    await page.getByRole("button", { name: "Run deterministic readiness simulation" }).click();

    await expect(page.getByText("5 / 5", { exact: true })).toBeVisible();
    await expect(page.locator(".telephony-gate[data-status='passed']")).toHaveCount(5);
    await expect(page.getByRole("list", { name: "Ordered simulated call events" })).toContainText("WebSocket loss observed");
    await expect(page.getByRole("list", { name: "Ordered simulated call events" })).toContainText("REPROMPT");
    await expect(page.getByRole("list", { name: "Ordered simulated call events" })).toContainText("END_SESSION");
    await expect(page.getByText("Human UI", { exact: true })).toBeVisible();
    await expect(page.getByText("Simulated evidence only — no imported or live evidence.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /place|start|make|dial.*(?:live )?call/i })).toHaveCount(0);
    expect(traffic.http).toEqual([]);
    expect(traffic.webSockets).toEqual([]);
    expect(traffic.apiRequests).toEqual([]);
  });

  test("registers top-level site tools whose results and activity match visible state", async ({ page }) => {
    const traffic = await blockExternalTraffic(page);
    await installModelContextCapture(page);
    await page.goto("/telephony-readiness");

    await expect(page.getByText("5 tools ready", { exact: true })).toBeVisible();
    const registrations = await page.evaluate(() => (window as unknown as CapturedWindow).__telephonyRegistrations);
    expect(registrations).toHaveLength(10);
    expect(registrations.every((registration) => registration.topLevel)).toBe(true);
    expect(new Set(registrations.map((registration) => registration.name)).size).toBe(10);
    const telephonyRegistrations = registrations.filter((registration) => [
      "get_voice_lab_context",
      "configure_telephony_readiness_test",
      "run_telephony_readiness_simulation",
      "get_telephony_readiness_report",
      "apply_telephony_lab_remediation",
    ].includes(registration.name));
    expect(telephonyRegistrations.map((registration) => registration.name)).toEqual([
      "get_voice_lab_context",
      "configure_telephony_readiness_test",
      "run_telephony_readiness_simulation",
      "get_telephony_readiness_report",
      "apply_telephony_lab_remediation",
    ]);

    const configured = await invokeSiteTool(page, "configure_telephony_readiness_test", {
      provider: "twilio-conversation-relay",
      mode: "simulation",
      scenario: "combined-production-stress-test",
      safeguards: ALL_SAFEGUARDS.filter((id) => id !== "enable-structured-observability"),
    });
    expect((configured.context as { scenario: string }).scenario).toBe("combined-production-stress-test");
    await expect(page.getByLabel("Scenario")).toHaveValue("combined-production-stress-test");
    await expect(page.getByText("WebMCP agent", { exact: true })).toBeVisible();
    const configuredSafeguards = (configured.configuration as { safeguards: string[] }).safeguards;
    const configuredCheckboxes = page.getByRole("checkbox");
    await expect(configuredCheckboxes).toHaveCount(ALL_SAFEGUARDS.length);
    for (const [index, safeguard] of ALL_SAFEGUARDS.entries()) {
      const namedCheckbox = configuredCheckboxes.nth(index);
      if (configuredSafeguards.includes(safeguard)) await expect(namedCheckbox).toBeChecked();
      else await expect(namedCheckbox).not.toBeChecked();
    }

    const run = await invokeSiteTool(page, "run_telephony_readiness_simulation", {});
    const returnedReport = run.report as ReturnedReport;
    expect(returnedReport.gatesPassed).toHaveLength(4);
    expect(returnedReport.gatesNeedingAttention).toEqual(["observability"]);
    await expect(page.getByText("4 / 5", { exact: true })).toBeVisible();
    await expect(page.locator(".telephony-json-report pre")).toContainText(returnedReport.runId);
    for (const returnedGate of returnedReport.gates) {
      const card = page.locator(`.telephony-gate[data-gate-id="${returnedGate.id}"]`);
      await expect(card).toHaveAttribute("data-status", returnedGate.status);
      await expect(card).toContainText(`Responsible owner: ${returnedGate.owner.replaceAll("-", " ")}`);
      await expect(card).toContainText(returnedGate.evidence[0].summary);
      await expect(card).toContainText(returnedGate.recommendedNextAction);
    }
    const timelineItems = page.getByRole("list", { name: "Ordered simulated call events" }).getByRole("listitem");
    await expect(timelineItems).toHaveCount(returnedReport.timeline.length);
    for (const [index, event] of returnedReport.timeline.entries()) {
      await expect(timelineItems.nth(index)).toContainText(event.label);
    }

    const readContext = await invokeSiteTool(page, "get_voice_lab_context", {});
    expect(readContext.gateState).toEqual((run.context as { gateState: unknown }).gateState);
    const readReport = await invokeSiteTool(page, "get_telephony_readiness_report", {});
    expect((readReport.report as { runId: string }).runId).toBe(returnedReport.runId);

    const remediation = await invokeSiteTool(page, "apply_telephony_lab_remediation", {
      remediation: "enable-structured-observability",
    });
    expect(remediation).toMatchObject({ changed: true, rerunRequired: true });
    expect((remediation.context as { configuredSafeguards: string[] }).configuredSafeguards)
      .toEqual(ALL_SAFEGUARDS);
    await expect(page.getByRole("checkbox", { name: /Enable structured observability/i })).toBeChecked();
    await expect(page.getByText("Configuration changed. The visible evidence is retained for comparison", { exact: false })).toBeVisible();
    await expect(page.getByText("WebMCP agent", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Run deterministic readiness simulation" }).click();
    await expect(page.getByText("Human UI", { exact: true })).toBeVisible();
    await expect(page.getByText("5 / 5", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What changed and why" })).toBeVisible();
    await expect(page.getByText(/Added causal inputs: enable structured observability/i)).toBeVisible();
    expect(traffic.http).toEqual([]);
    expect(traffic.webSockets).toEqual([]);
    expect(traffic.apiRequests).toEqual([]);
  });

  test("supports keyboard focus, named regions, reduced motion, and a narrow viewport", async ({ page }) => {
    const traffic = await blockExternalTraffic(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/telephony-readiness");

    const scenario = page.getByLabel("Scenario");
    await scenario.focus();
    await scenario.press("End");
    await expect(scenario).toHaveValue("combined-production-stress-test");
    await scenario.press("Tab");
    const focused = page.locator(":focus");
    await expect(focused).toHaveAttribute("type", "checkbox");
    expect(await focused.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
    await focused.press("Space");
    await expect(focused).toBeChecked();

    const runButton = page.getByRole("button", { name: "Run deterministic readiness simulation" });
    expect(await runButton.evaluate((element) => getComputedStyle(element).transitionDuration)).toMatch(/0\.00001s|1e-05s|0s/);
    await runButton.focus();
    await runButton.press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "Ran combined-production-stress-test" })).toBeVisible();
    await expect(page.locator(".telephony-gate[data-status='passed']").first()).toContainText("Passed");
    await expect(page.locator(".telephony-gate[data-status='needs-attention']").first()).toContainText("Needs attention");
    const timelineItems = page.getByRole("list", { name: "Ordered simulated call events" }).getByRole("listitem");
    const timelineStates = await timelineItems.evaluateAll((items) => items.map((item) => ({
      state: item.getAttribute("data-state"),
      text: item.textContent ?? "",
    })));
    for (const item of timelineStates) {
      expect(item.text.toLowerCase()).toContain(`evidence state: ${item.state}`);
    }
    await expect(page.getByRole("region", { name: "Latest lab activity" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Telephony readiness boundaries" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Example WebMCP prompt" })).toHaveValue(/Prepare a Twilio production-readiness test/);
    const unnamedControls = await page.locator("button, input, select, textarea").evaluateAll((elements) => (
      elements.filter((element) => {
        const id = element.getAttribute("id");
        const explicitLabel = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
        const wrappedLabel = element.closest("label");
        return !element.getAttribute("aria-label")
          && !explicitLabel?.textContent?.trim()
          && !wrappedLabel?.textContent?.trim()
          && !element.textContent?.trim();
      }).map((element) => element.outerHTML)
    ));
    expect(unnamedControls).toEqual([]);
    const viewportOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(viewportOverflow).toBeLessThanOrEqual(1);
    expect(traffic.http).toEqual([]);
    expect(traffic.webSockets).toEqual([]);
    expect(traffic.apiRequests).toEqual([]);
  });
});

async function installModelContextCapture(page: Page) {
  await page.addInitScript(() => {
    const captured = window as unknown as CapturedWindow;
    captured.__telephonySiteTools = {};
    captured.__telephonyRegistrations = [];
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool(tool: CapturedTool) {
          captured.__telephonySiteTools[tool.name] = tool;
          captured.__telephonyRegistrations.push({
            name: tool.name,
            topLevel: window.top === window.self,
          });
        },
      },
    });
  });
}

async function invokeSiteTool(page: Page, name: string, input: unknown) {
  return page.evaluate(async ({ toolName, toolInput }) => {
    const captured = window as unknown as CapturedWindow;
    const result = await captured.__telephonySiteTools[toolName].execute(toolInput);
    return result.structuredContent;
  }, { toolName: name, toolInput: input });
}

async function blockExternalTraffic(page: Page) {
  const traffic = { http: [] as string[], webSockets: [] as string[], apiRequests: [] as string[] };
  page.on("request", (request) => {
    if (isExternalUrl(request.url())) traffic.http.push(request.url());
    else if (new URL(request.url()).pathname.startsWith("/api/")) traffic.apiRequests.push(request.url());
  });
  page.on("websocket", (socket) => {
    if (isExternalUrl(socket.url())) traffic.webSockets.push(socket.url());
  });
  await page.route(/^https?:\/\//, (route) => (
    isExternalUrl(route.request().url()) ? route.abort("blockedbyclient") : route.continue()
  ));
  return traffic;
}

function isExternalUrl(value: string) {
  const url = new URL(value);
  return !["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname);
}
