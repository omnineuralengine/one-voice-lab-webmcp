import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const useExistingServer = process.env.PLAYWRIGHT_USE_EXISTING_SERVER === "1";
const pocketAutomationState = JSON.stringify({ preferences: { schemaVersion: 1, mode: "collapsed", docked: false, demoMode: false }, recentActions: [] });

export default defineConfig({
  metadata: { studio: "architecture" },
  testDir: "./tests/e2e",
  testMatch: "architecture-studio.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results",
  timeout: 60_000,
  expect: { timeout: 7_500 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    colorScheme: "dark",
    storageState: { cookies: [], origins: [{ origin: new URL(baseURL).origin, localStorage: [{ name: "deepgram-pocket:shell:v1", value: pocketAutomationState }] }] },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  // Reuse the repository's canonical 1440px project name so existing tests that
  // intentionally gate on supported viewport names can run with bundled Chromium.
  projects: [{ name: "chromium-1440x900", use: { browserName: "chromium" } }],
  webServer: useExistingServer ? undefined : {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: baseURL,
    name: "Voice Architecture Studio (credential-free E2E)",
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
    env: { DEEPGRAM_API_KEY: "", PLAYWRIGHT_E2E: "1" },
  },
});
