import { expect, test, type Page } from "@playwright/test";

type CapturedToolResult = Readonly<{
  isError?: true;
  structuredContent: Record<string, unknown>;
}>;

type CapturedTool = Readonly<{
  name: string;
  annotations: Readonly<{ readOnlyHint: boolean }>;
  execute(input?: unknown): Promise<CapturedToolResult>;
}>;

type CapturedWindow = Window & {
  __oneSiteTools: Record<string, CapturedTool>;
  __oneRegistrations: Array<{ name: string; topLevel: boolean; readOnlyHint: boolean }>;
  __oneBeacons: string[];
};

const ONE_TOOLS = [
  "get_one_lab_map",
  "get_current_one_context",
  "find_voice_providers",
  "compare_voice_providers",
  "open_one_lab",
] as const;

const TELEPHONY_TOOLS = [
  "get_voice_lab_context",
  "configure_telephony_readiness_test",
  "run_telephony_readiness_simulation",
  "get_telephony_readiness_report",
  "apply_telephony_lab_remediation",
] as const;

test.describe("ONE-wide WebMCP discovery tools", () => {
  test("keeps the complete human orientation experience without WebMCP", async ({ page }) => {
    const traffic = await blockForbiddenTraffic(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const entry = page.locator("[data-one-agent-entry]");
    await expect(entry).toContainText("Use ONE with your agent");
    await expect(entry).toContainText("Human interface ready · WebMCP unavailable");
    const summary = entry.locator("summary");
    await summary.focus();
    expect(await summary.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
    await summary.press("Enter");
    await expect(page.getByRole("region", { name: "ONE agent guide" })).toBeVisible();
    await expect(page.getByLabel("Explore ONE prompt")).toHaveValue(
      "Show me what I can explore in ONE and recommend the best lab for evaluating a customer-support voice agent.",
    );
    await expect(page.getByLabel("Provider discovery prompt")).toHaveValue(
      /Find providers relevant to a low-latency, interruption-heavy voice agent, compare the strongest documented options, then open the telephony-readiness lab\./,
    );
    await expect(page.getByText(/ONE supplies structured application data/)).toBeVisible();
    await expect(page.getByText(/comparisons preserve unknowns/)).toBeVisible();
    await expect(page.getByText(/consequential actions remain human-controlled/)).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await expect(page.locator("main, #one-main-content").first()).toBeVisible();
    expect(await page.evaluate(async () => navigator.serviceWorker
      ? (await navigator.serviceWorker.getRegistrations()).length
      : 0)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await expectNoForbiddenTraffic(page, traffic);
  });

  test("registers ten top-level tools once and exposes evidence-backed provider data", async ({ page }) => {
    const traffic = await blockForbiddenTraffic(page);
    await installModelContextCapture(page);
    await page.goto("/");
    await expect(page.locator("[data-one-agent-entry]")).toContainText("10 site tools ready");

    await expectExactTopLevelToolRegistration(page);

    const map = await invokeSiteTool(page, "get_one_lab_map", {
      goal: "evaluate-customer-support-voice-agent",
    });
    expect((map.labs as Array<{ id: string; href: string }>).map(({ id, href }) => ({ id, href }))).toEqual([
      { id: "home", href: "/" },
      { id: "providers", href: "/providers" },
      { id: "evaluate", href: "/evaluate" },
      { id: "build", href: "/build" },
      { id: "learn", href: "/learn" },
      { id: "telephony", href: "/telephony-readiness" },
    ]);
    expect(map).toMatchObject({
      currentRouteId: "home",
      suggestedNextLab: { id: "evaluate", basis: "explicit-goal" },
      externalActionsAvailable: false,
    });
    const homeContext = await invokeSiteTool(page, "get_current_one_context", {});
    const homeActions = homeContext.availableWebMcpActions as Array<{
      name: string;
      availability: string;
      visibleState?: string;
    }>;
    expect(homeActions.find((action) => action.name === "configure_telephony_readiness_test")).toMatchObject({
      availability: "available",
      visibleState: "open-route-to-view",
    });

    const beforeReadUrl = page.url();
    const search = await invokeSiteTool(page, "find_voice_providers", {
      query: "deepgram",
      maxResults: 3,
    });
    expect(search).toMatchObject({
      returned: 1,
      providerRequestsMade: 0,
      ordering: "Stable provider identifier; this order is not a ranking.",
    });
    expect(search.providers).toEqual([
      expect.objectContaining({
        id: "deepgram",
        profilePath: "/providers/deepgram",
        evidence: expect.any(Object),
        unknowns: expect.any(Array),
      }),
    ]);
    expect(page.url()).toBe(beforeReadUrl);
    expect(traffic.localApplicationReads).toEqual([]);

    const comparison = await invokeSiteTool(page, "compare_voice_providers", {
      providerIds: ["deepgram", "twilio"],
      dimensions: ["identity", "capabilities", "evidence"],
    });
    expect(comparison).toMatchObject({
      comparisonType: "registry_evidence_only",
      rankingProvided: false,
      winner: null,
      inferenceUsed: false,
      providerRequestsMade: 0,
    });
    expect(JSON.stringify(comparison)).toContain("absence is unknown, not unsupported");
    expect(JSON.stringify(comparison)).not.toMatch(/"(?:score|rank)"\s*:/i);

    await invokeSiteTool(page, "open_one_lab", { routeId: "providers" });
    await expect(page).toHaveURL(/\/providers$/);
    await expect(page.getByRole("heading", { name: "Explore voice providers" })).toBeVisible();
    await expect(page.locator('[data-provider-card="deepgram"]')).toContainText("Deepgram");
    await expect(page.getByRole("status").filter({ hasText: "WebMCP agent:" })).toContainText("Arrived at /providers");
    const context = await invokeSiteTool(page, "get_current_one_context", {});
    expect(context).toMatchObject({
      currentRoute: { pathname: "/providers", routeId: "providers", disclosure: "public-canonical" },
      currentLabOrModule: "providers",
      visibleEvidenceState: { kind: "provider-registry" },
      externalActionsAvailable: false,
    });
    expect(await capturedRegistrations(page)).toHaveLength(10);
    await expectNoForbiddenTraffic(page, traffic);
  });

  test("restricts navigation, tracks route state, and retains the telephony tools", async ({ page }) => {
    const traffic = await blockForbiddenTraffic(page);
    await installModelContextCapture(page);
    await page.goto("/?module=tts");
    await expect(page.locator("[data-one-agent-entry]")).toContainText("10 site tools ready");

    const moduleContext = await invokeSiteTool(page, "get_current_one_context", {});
    expect(moduleContext).toMatchObject({
      currentRoute: { pathname: "/", routeId: "home" },
      currentLabOrModule: "tts",
      selectedProvider: { id: "deepgram", name: "Deepgram" },
      visibleEvidenceState: { kind: "provider-workspace", providerId: "deepgram" },
    });
    await expect(page.locator('[data-module-id="tts"][aria-current="page"]')).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Text to Speech" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Provider workspace" })).toContainText(
      "Current interactive workspace: Deepgram",
    );
    await page.locator('[data-module-id="upload-audio"]').click();
    await expect(page.getByRole("heading", { name: "Upload Audio" })).toBeVisible();
    const changedModuleContext = await invokeSiteTool(page, "get_current_one_context", {});
    expect(changedModuleContext).toMatchObject({
      currentLabOrModule: "upload-audio",
      selectedProvider: { id: "deepgram" },
      visibleEvidenceState: { kind: "provider-workspace", providerId: "deepgram" },
      latestNavigation: { source: "human-ui" },
    });
    const home = await invokeSiteTool(page, "open_one_lab", { routeId: "home" });
    expect(home).toMatchObject({
      navigation: { status: "requested", destination: "/" },
      sideEffects: {
        localNavigationOnly: true,
        sameOriginNavigationRequested: true,
        externalRequestInitiated: false,
        providerActionInitiated: false,
        credentialsChanged: false,
        persistedUserDataChanged: false,
      },
    });
    await expect(page).toHaveURL(/\/$/);
    const canonicalHomeContext = await invokeSiteTool(page, "get_current_one_context", {});
    expect(canonicalHomeContext).toMatchObject({
      currentLabOrModule: "home",
      latestNavigation: { source: "webmcp-agent", status: "arrived", destination: "/" },
    });

    const beforeInvalid = page.url();
    for (const routeId of ["https://example.com", "//example.com", "../providers", "/api/providers"]) {
      const invalid = await invokeRawSiteTool(page, "open_one_lab", { routeId });
      expect(invalid.isError).toBe(true);
      expect(invalid.structuredContent).toMatchObject({ ok: false, error: { code: "invalid_input" } });
      expect(page.url()).toBe(beforeInvalid);
    }

    await invokeSiteTool(page, "open_one_lab", { routeId: "telephony" });
    await expect(page).toHaveURL(/\/telephony-readiness$/);
    await expect(page.getByRole("heading", { name: /Twilio ConversationRelay/ })).toBeVisible();
    const telephonyContext = await invokeSiteTool(page, "get_voice_lab_context", {});
    expect(telephonyContext).toMatchObject({
      mode: "simulation",
      liveActionsAvailable: false,
      liveCallStatus: "No live call placed",
    });
    const oneContext = await invokeSiteTool(page, "get_current_one_context", {});
    expect(oneContext).toMatchObject({
      currentRoute: { routeId: "telephony" },
      selectedScenario: expect.any(String),
      visibleEvidenceState: { kind: "telephony-readiness", provenance: "simulated" },
    });
    expect(await capturedRegistrations(page)).toHaveLength(10);
    await expect(page.getByRole("textbox", { name: "Example WebMCP prompt" })).toHaveValue(
      /Prepare a Twilio production-readiness test/,
    );
    await expectNoForbiddenTraffic(page, traffic);
  });

  test("keeps generic query-backed labs provider-neutral", async ({ page }) => {
    const traffic = await blockForbiddenTraffic(page);
    await installModelContextCapture(page);
    await page.goto("/?module=audio-signal-lab");
    await expect(page.locator("[data-one-agent-entry]")).toContainText("10 site tools ready");
    await expect(page.getByRole("heading", { level: 1, name: "Audio Signal Lab" })).toBeVisible();
    await expect(page.locator('[data-module-id="audio-signal-lab"][aria-current="page"]')).toBeVisible();
    const providerWorkspace = page.getByRole("complementary", { name: "Provider workspace" });
    await expect(providerWorkspace).toContainText("Current interactive workspace: Deepgram");
    await expect(providerWorkspace.locator('[data-workspace-evidence-scope="provider-neutral"]')).toContainText(
      "Evidence scope: provider-neutral module",
    );
    const context = await invokeSiteTool(page, "get_current_one_context", {});
    expect(context).toMatchObject({
      currentRoute: { pathname: "/", routeId: "home" },
      currentLabOrModule: "audio-signal-lab",
      selectedProvider: { id: "deepgram" },
      visibleEvidenceState: {
        kind: "provider-neutral-workspace",
        workspaceProviderId: "deepgram",
        evidenceScope: "provider-neutral",
      },
    });
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("one:webmcp-visible-workspace", {
        detail: {
          active: true,
          moduleId: "tts",
          providerId: "deepgram",
          evidenceScope: "provider-specific",
        },
      }));
    });
    await settleBrowserState(page);
    await expect(page.locator('[data-module-id="audio-signal-lab"][aria-current="page"]')).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Audio Signal Lab" })).toBeVisible();
    expect(await invokeSiteTool(page, "get_current_one_context", {})).toMatchObject({
      currentLabOrModule: "audio-signal-lab",
      selectedProvider: { id: "deepgram" },
      visibleEvidenceState: { kind: "provider-neutral-workspace" },
    });
    await page.goto("/?module=sample-library");
    await expect(page.locator("[data-one-agent-entry]")).toContainText("10 site tools ready");
    await expectExactTopLevelToolRegistration(page);
    const hardLoadContext = await invokeSiteTool(page, "get_current_one_context", {});
    expect(hardLoadContext).toMatchObject({
      currentLabOrModule: "sample-library",
      selectedProvider: { id: "deepgram" },
      visibleEvidenceState: { kind: "provider-neutral-workspace", evidenceScope: "provider-neutral" },
    });
    await expectNoForbiddenTraffic(page, traffic);
  });

  test("exits a queryless mounted workspace when an agent opens Home", async ({ page }) => {
    const traffic = await blockForbiddenTraffic(page);
    await installModelContextCapture(page);
    await page.goto("/?module=tts");
    await expect(page.locator("[data-one-agent-entry]")).toContainText("10 site tools ready");
    await expect(page.getByRole("heading", { level: 1, name: "Text to Speech" })).toBeVisible();

    await page.evaluate(() => window.history.replaceState(window.history.state, "", "/"));
    await settleBrowserState(page);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "Text to Speech" })).toBeVisible();
    expect(await invokeSiteTool(page, "get_current_one_context", {})).toMatchObject({
      currentLabOrModule: "tts",
      selectedProvider: { id: "deepgram" },
    });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("one:webmcp-visible-workspace", {
      detail: { active: false },
    })));
    await settleBrowserState(page);
    expect(await invokeSiteTool(page, "get_current_one_context", {})).toMatchObject({
      currentLabOrModule: "tts",
      selectedProvider: { id: "deepgram" },
    });

    const opened = await invokeSiteTool(page, "open_one_lab", { routeId: "home" });
    expect(opened).toMatchObject({ navigation: { status: "requested", destination: "/" } });
    await expect(page.getByRole("heading", { level: 1, name: "What would you like to explore?" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Text to Speech" })).toHaveCount(0);
    expect(await invokeSiteTool(page, "get_current_one_context", {})).toMatchObject({
      currentRoute: { pathname: "/", routeId: "home" },
      currentLabOrModule: "home",
      latestNavigation: { source: "webmcp-agent", status: "arrived", destination: "/" },
    });
    await expectNoForbiddenTraffic(page, traffic);
  });

  test("keeps the newest route request authoritative", async ({ page }) => {
    const traffic = await blockForbiddenTraffic(page);
    await installModelContextCapture(page);
    await page.goto("/");
    await expect(page.locator("[data-one-agent-entry]")).toContainText("10 site tools ready");

    const [providers, home] = await page.evaluate(async () => {
      const captured = window as unknown as CapturedWindow;
      return Promise.all([
        captured.__oneSiteTools.open_one_lab.execute({ routeId: "providers" }),
        captured.__oneSiteTools.open_one_lab.execute({ routeId: "home" }),
      ]);
    });
    expect(providers.structuredContent).toMatchObject({
      navigation: { routeId: "providers", status: "requested" },
      requestDisposition: "new-navigation-request",
    });
    expect(home.structuredContent).toMatchObject({
      navigation: { routeId: "home", status: "arrived" },
      requestDisposition: "new-navigation-request",
      sideEffects: { sameOriginNavigationRequested: true },
    });

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "What would you like to explore?" })).toBeVisible();
    await expect.poll(async () => {
      const context = await invokeSiteTool(page, "get_current_one_context", {});
      return context.latestNavigation;
    }).toMatchObject({ routeId: "home", destination: "/", status: "arrived" });
    await expectNoForbiddenTraffic(page, traffic);
  });
});

async function installModelContextCapture(page: Page) {
  await page.addInitScript(() => {
    const captured = window as unknown as CapturedWindow;
    captured.__oneSiteTools = {};
    captured.__oneRegistrations = [];
    captured.__oneBeacons = [];
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value(url: string | URL) {
        captured.__oneBeacons.push(String(url));
        return false;
      },
    });
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool(tool: CapturedTool) {
          captured.__oneSiteTools[tool.name] = tool;
          captured.__oneRegistrations.push({
            name: tool.name,
            topLevel: window.top === window.self,
            readOnlyHint: tool.annotations.readOnlyHint,
          });
        },
      },
    });
  });
}

async function capturedRegistrations(page: Page) {
  return page.evaluate(() => (window as unknown as CapturedWindow).__oneRegistrations);
}

async function settleBrowserState(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
  }));
}

async function expectExactTopLevelToolRegistration(page: Page) {
  const registrations = await capturedRegistrations(page);
  const expectedNames = [...TELEPHONY_TOOLS, ...ONE_TOOLS];
  const readOnlyNames = new Set([
    "get_voice_lab_context",
    "get_telephony_readiness_report",
    "get_one_lab_map",
    "get_current_one_context",
    "find_voice_providers",
    "compare_voice_providers",
  ]);
  expect(registrations).toHaveLength(10);
  expect(new Set(registrations.map((registration) => registration.name))).toEqual(new Set(expectedNames));
  expect(registrations.every((registration) => registration.topLevel)).toBe(true);
  for (const registration of registrations) {
    expect(registration.readOnlyHint).toBe(readOnlyNames.has(registration.name));
  }
  expect(await page.evaluate(() => Object.keys((window as unknown as CapturedWindow).__oneSiteTools))).toEqual(
    expect.arrayContaining(expectedNames),
  );
  expect(await page.evaluate(() => Object.keys((window as unknown as CapturedWindow).__oneSiteTools))).toHaveLength(10);
}

async function invokeRawSiteTool(page: Page, name: string, input: unknown) {
  return page.evaluate(async ({ toolName, toolInput }) => {
    const captured = window as unknown as CapturedWindow;
    return captured.__oneSiteTools[toolName].execute(toolInput);
  }, { toolName: name, toolInput: input });
}

async function invokeSiteTool(page: Page, name: string, input: unknown) {
  const result = await invokeRawSiteTool(page, name, input);
  expect(result.isError).toBeUndefined();
  return result.structuredContent;
}

async function blockForbiddenTraffic(page: Page) {
  const traffic = {
    externalHttp: [] as string[],
    webSockets: [] as string[],
    forbiddenApiRequests: [] as string[],
    localApplicationReads: [] as string[],
  };
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (isExternalUrl(url)) traffic.externalHttp.push(request.url());
    if (url.pathname === "/api/providers/preferences" && request.method() === "GET") {
      traffic.localApplicationReads.push(`${request.method()} ${url.pathname}`);
    } else if (url.pathname.startsWith("/api/")) {
      traffic.forbiddenApiRequests.push(request.url());
    }
  });
  page.on("websocket", (socket) => {
    const url = new URL(socket.url());
    if (isExternalUrl(url)) traffic.webSockets.push(socket.url());
  });
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (isExternalUrl(url) || url.pathname.startsWith("/api/")) {
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  return traffic;
}

async function expectNoForbiddenTraffic(
  page: Page,
  traffic: Awaited<ReturnType<typeof blockForbiddenTraffic>>,
) {
  expect(traffic.externalHttp).toEqual([]);
  expect(traffic.webSockets).toEqual([]);
  expect(traffic.forbiddenApiRequests).toEqual([]);
  expect(traffic.localApplicationReads.every((request) => request === "GET /api/providers/preferences")).toBe(true);
  const beacons = await page.evaluate(() => (window as unknown as CapturedWindow).__oneBeacons ?? []);
  expect(beacons).toEqual([]);
}

function isExternalUrl(url: URL) {
  return !["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname);
}
