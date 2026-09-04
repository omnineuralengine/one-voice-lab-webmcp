import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100";
const usesExternalServer = process.env.PLAYWRIGHT_EXTERNAL_SERVER === "1";
const lightweightArtifacts = process.env.PLAYWRIGHT_LIGHTWEIGHT === "1";
const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;
const browserChannelOption = browserChannel ? { channel: browserChannel } : {};
const pocketAutomationState = JSON.stringify({
  preferences: { schemaVersion: 1, mode: "collapsed", docked: false, demoMode: false },
  recentActions: [],
});

export default defineConfig({
  metadata: { observatory: true },
  testDir: "./tests/e2e",
  testMatch: ["observatory.spec.ts", "audio-signal-lab.spec.ts", "transcribe-file-languages.spec.ts", "transcribe-url-languages.spec.ts"],
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results/observatory",
  timeout: 60_000,
  expect: { timeout: 7_500 },
  use: {
    baseURL,
    // Observatory owns its request confirmations. Pocket's dedicated suite
    // separately verifies the default-on global Demo Mode checkpoint.
    storageState: {
      cookies: [],
      origins: [{ origin: new URL(baseURL).origin, localStorage: [{ name: "deepgram-pocket:shell:v1", value: pocketAutomationState }] }],
    },
    acceptDownloads: true,
    colorScheme: "dark",
    screenshot: lightweightArtifacts ? "off" : "only-on-failure",
    trace: lightweightArtifacts ? "off" : "retain-on-failure",
    video: lightweightArtifacts ? "off" : "retain-on-failure",
    launchOptions: { args: ["--disable-gpu"] },
  },
  projects: [
    { name: "chromium-1366x768", use: { ...devices["Desktop Chrome"], ...browserChannelOption, viewport: { width: 1366, height: 768 } } },
    { name: "chromium-1440x900", use: { ...devices["Desktop Chrome"], ...browserChannelOption, viewport: { width: 1440, height: 900 } } },
    { name: "chromium-1920x1080", use: { ...devices["Desktop Chrome"], ...browserChannelOption, viewport: { width: 1920, height: 1080 } } },
  ],
  webServer: usesExternalServer
    ? undefined
    : {
        command: "npm run start -- --hostname 127.0.0.1 --port 3100",
        url: baseURL,
        name: "Deepgram Voice Lab Observatory (credential-free production server)",
        reuseExistingServer: true,
        timeout: 60_000,
        stdout: "pipe",
        stderr: "pipe",
        env: { DEEPGRAM_API_KEY: "", PLAYWRIGHT_E2E: "0" },
      },
});
