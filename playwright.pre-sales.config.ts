import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3110";
const useExistingServer = process.env.PLAYWRIGHT_USE_EXISTING_SERVER === "1";
const pocketAutomationState = JSON.stringify({ preferences: { schemaVersion: 1, mode: "collapsed", docked: false, demoMode: false }, recentActions: [] });

export default defineConfig({
  metadata: { studio: "pre-sales" },
  testDir: "./tests/e2e",
  testMatch: "pre-sales-studio.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results/pre-sales-studio",
  timeout: 60_000,
  expect: { timeout: 7_500 },
  use: { ...devices["Desktop Chrome"], baseURL, colorScheme: "dark", storageState: { cookies: [], origins: [{ origin: new URL(baseURL).origin, localStorage: [{ name: "deepgram-pocket:shell:v1", value: pocketAutomationState }] }] }, screenshot: "only-on-failure", trace: "retain-on-failure", video: "retain-on-failure", viewport: { width: 1440, height: 900 } },
  projects: [{ name: "chromium-1440x900", use: { browserName: "chromium" } }],
  webServer: useExistingServer ? undefined : {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3110",
    url: `${baseURL}/pre-sales-studio`,
    name: "Pre-Sales Solution Studio (credential-free E2E)",
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
    env: { DEEPGRAM_API_KEY: "", PLAYWRIGHT_E2E: "1" },
  },
});
