import { expect, type Download, type Locator, type Page } from "@playwright/test";

export const QUESTLINE_STORAGE_KEY = "deepgram-applied-engineering-questline:v1";
export const CODE_LAB_DRAFT_PREFIX = "deepgram-code-lab:draft:v1:";
export const LAB_STORAGE_PREFIX = "deepgram-";

export const TARGET_VIEWPORTS = {
  compactDesktop: { width: 1366, height: 768 },
  standardDesktop: { width: 1440, height: 900 },
  wideDesktop: { width: 1920, height: 1080 },
} as const;

export type TargetViewport = keyof typeof TARGET_VIEWPORTS;

export type StorageSnapshot = {
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
};

export type SecretFinding = {
  kind: "authorization" | "credential-assignment" | "jwt" | "token-query" | "forbidden-value";
  offset: number;
};

const SAFE_PLACEHOLDER_PATTERN = /^(?:\$?DEEPGRAM_API_KEY|process\.env\.DEEPGRAM_API_KEY|\*+|\[?REDACTED[^\]]*\]?|YOUR_[A-Z0-9_]+|REPLACE_ME)$/i;

const SECRET_PATTERNS: Array<{
  kind: Exclude<SecretFinding["kind"], "forbidden-value">;
  pattern: RegExp;
  candidateGroup: number;
}> = [
  {
    kind: "authorization",
    pattern: /\bauthorization\b\s*[:=]\s*["']?(?:Token|Bearer)\s+([A-Za-z0-9._~-]{16,})/gi,
    candidateGroup: 1,
  },
  {
    kind: "credential-assignment",
    pattern: /\b(?:DEEPGRAM_API_KEY|API[_-]?KEY|ACCESS[_-]?TOKEN)\b\s*[:=]\s*["']?([A-Za-z0-9._~$-]{16,})/gi,
    candidateGroup: 1,
  },
  {
    kind: "jwt",
    pattern: /\b(eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b/g,
    candidateGroup: 1,
  },
  {
    kind: "token-query",
    pattern: /[?&](?:access_token|token|api_key)=([A-Za-z0-9._~-]{16,})/gi,
    candidateGroup: 1,
  },
];

export async function openAppliedEngineeringQuestline(page: Page) {
  await page.goto("/?module=applied-engineering-questline");
  await expect(page.getByRole("heading", { name: /Applied Engineering Questline/i }).first()).toBeVisible();
}

export async function openCodeLab(page: Page) {
  await page.goto("/?module=code-lab");
  await expect(page.getByRole("heading", { name: /Code Lab/i }).first()).toBeVisible();
}

export async function openAudioSignalLab(page: Page) {
  await page.goto("/?module=audio-signal-lab");
  await expect(page.getByTestId("audio-signal-lab")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Audio Signal Lab", exact: true }).first()).toBeVisible();
}

export async function openApiStudio(page: Page) {
  await page.goto("/?module=api-studio");
  await expect(page.getByRole("heading", { name: /API Studio/i }).first()).toBeVisible();
}

export async function selectQuestlineWorkspace(page: Page, workspaceName: string | RegExp) {
  const navigation = page.getByRole("navigation", { name: "Questline workspaces" });
  await expect(navigation).toBeVisible();
  await navigation.getByRole("button", { name: toNamePattern(workspaceName) }).click();
}

export async function selectQuestlineLanguage(page: Page, languageName: string | RegExp) {
  const navigation = page.getByRole("navigation", { name: "Language tracks" });
  await expect(navigation).toBeVisible();
  await navigation.getByRole("button", { name: toNamePattern(languageName) }).click();
}

export async function setQuestCompletionStatus(
  page: Page,
  status: "Not started" | "Practiced" | "Needs review" | "Completed",
) {
  await page.getByRole("combobox", { name: "Quest completion status" }).selectOption({ label: status });
}

export async function selectCodeLabWorkflow(page: Page, workflowLabel: string) {
  await page.getByRole("combobox", { name: "Code Lab workflow" }).selectOption({ label: workflowLabel });
}

export async function ensureAppLoaded(page: Page) {
  if (page.url() === "about:blank") await page.goto("/");
  await expect(page.locator("body")).toBeVisible();
}

export async function clearLabStorage(page: Page) {
  await ensureAppLoaded(page);
  await page.evaluate((prefix) => {
    for (const storage of [window.localStorage, window.sessionStorage]) {
      const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(
        (key): key is string => Boolean(key?.startsWith(prefix)),
      );
      for (const key of keys) storage.removeItem(key);
    }
  }, LAB_STORAGE_PREFIX);
}

export async function readStorageSnapshot(page: Page): Promise<StorageSnapshot> {
  await ensureAppLoaded(page);
  return page.evaluate(() => {
    function entries(storage: Storage) {
      return Object.fromEntries(
        Array.from({ length: storage.length }, (_, index) => storage.key(index))
          .filter((key): key is string => Boolean(key))
          .map((key) => [key, storage.getItem(key) ?? ""]),
      );
    }

    return {
      localStorage: entries(window.localStorage),
      sessionStorage: entries(window.sessionStorage),
    };
  });
}

export async function readLocalStorageJson<T>(page: Page, key: string): Promise<T | null> {
  await ensureAppLoaded(page);
  const raw = await page.evaluate((storageKey) => window.localStorage.getItem(storageKey), key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`Expected localStorage key "${key}" to contain valid JSON.`);
  }
}

export async function expectLocalStorageValue(page: Page, key: string) {
  await expect.poll(async () => {
    await ensureAppLoaded(page);
    return page.evaluate((storageKey) => window.localStorage.getItem(storageKey), key);
  }).not.toBeNull();
}

export async function captureDownload(page: Page, trigger: () => Promise<void>): Promise<Download> {
  const downloadPromise = page.waitForEvent("download");
  await trigger();
  return downloadPromise;
}

export async function readDownloadText(download: Download): Promise<string> {
  const failure = await download.failure();
  expect(failure, "The browser download should complete successfully.").toBeNull();

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

export async function expectSanitizedDownload(
  download: Download,
  forbiddenValues: readonly string[] = [],
) {
  const text = await readDownloadText(download);
  expectNoPotentialSecrets(text, { source: download.suggestedFilename(), forbiddenValues });
  return text;
}

export function findPotentialSecrets(
  value: string,
  forbiddenValues: readonly string[] = [],
): SecretFinding[] {
  const findings: SecretFinding[] = [];

  for (const { kind, pattern, candidateGroup } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(value);
    while (match) {
      const candidate = match[candidateGroup] ?? "";
      if (!isSafePlaceholder(candidate)) findings.push({ kind, offset: match.index });
      match = pattern.exec(value);
    }
  }

  for (const forbiddenValue of forbiddenValues) {
    if (!forbiddenValue || isSafePlaceholder(forbiddenValue)) continue;
    let offset = value.indexOf(forbiddenValue);
    while (offset !== -1) {
      findings.push({ kind: "forbidden-value", offset });
      offset = value.indexOf(forbiddenValue, offset + forbiddenValue.length);
    }
  }

  return findings.sort((left, right) => left.offset - right.offset);
}

export function expectNoPotentialSecrets(
  value: string,
  options: { source?: string; forbiddenValues?: readonly string[] } = {},
) {
  const findings = findPotentialSecrets(value, options.forbiddenValues);
  expect(
    findings,
    `${options.source ?? "value"} must contain only placeholders or redacted credential material.`,
  ).toEqual([]);
}

export async function expectBrowserSurfaceSanitized(
  page: Page,
  forbiddenValues: readonly string[] = [],
) {
  const snapshot = await readStorageSnapshot(page);
  const surface = await page.evaluate(() => ({
    text: document.body.innerText,
    url: window.location.href,
    resources: performance.getEntriesByType("resource").map((entry) => entry.name),
  }));

  expectNoPotentialSecrets(JSON.stringify(surface), { source: "rendered browser surface", forbiddenValues });
  expectNoPotentialSecrets(JSON.stringify(snapshot), { source: "browser storage", forbiddenValues });
}

export async function useTargetViewport(page: Page, target: TargetViewport) {
  await page.setViewportSize(TARGET_VIEWPORTS[target]);
}

export async function expectNoPageLevelOverflow(page: Page, tolerance = 1) {
  const dimensions = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      pageWidth: Math.max(root.scrollWidth, body.scrollWidth),
      pageHeight: Math.max(root.scrollHeight, body.scrollHeight),
    };
  });

  expect(dimensions.pageWidth).toBeLessThanOrEqual(dimensions.viewportWidth + tolerance);
  expect(dimensions.pageHeight).toBeLessThanOrEqual(dimensions.viewportHeight + tolerance);
}

export async function expectLocatorWithinViewport(locator: Locator, tolerance = 1) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, "Visible locator should have a bounding box.").not.toBeNull();
  if (!box) return;

  const viewport = await locator.page().evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  expect(box.x).toBeGreaterThanOrEqual(-tolerance);
  expect(box.y).toBeGreaterThanOrEqual(-tolerance);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + tolerance);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + tolerance);
}

export async function expectLocatorsNotToOverlap(locators: readonly Locator[], tolerance = 1) {
  const boxes = await Promise.all(
    locators.map(async (locator) => ({ locator, visible: await locator.isVisible(), box: await locator.boundingBox() })),
  );
  const visibleBoxes = boxes.filter(
    (item): item is { locator: Locator; visible: true; box: NonNullable<typeof item.box> } => item.visible && item.box !== null,
  );

  for (let leftIndex = 0; leftIndex < visibleBoxes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < visibleBoxes.length; rightIndex += 1) {
      const left = visibleBoxes[leftIndex].box;
      const right = visibleBoxes[rightIndex].box;
      const overlapWidth = Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x);
      const overlapHeight = Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y);
      expect(
        overlapWidth > tolerance && overlapHeight > tolerance,
        `Visible controls at indexes ${leftIndex} and ${rightIndex} should not overlap.`,
      ).toBe(false);
    }
  }
}

export async function expectInternalScrollRegion(locator: Locator) {
  await expect(locator).toBeVisible();
  const state = await locator.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    };
  });

  expect(["auto", "scroll", "hidden", "clip"]).toContain(state.overflowY);
  return state;
}

function toNamePattern(name: string | RegExp) {
  return name instanceof RegExp ? name : new RegExp(escapeRegExp(name), "i");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isSafePlaceholder(value: string) {
  const normalized = value.trim().replace(/^['"]|['"]$/g, "");
  return SAFE_PLACEHOLDER_PATTERN.test(normalized) || normalized.toUpperCase().includes("REDACTED");
}
