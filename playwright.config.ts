import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const serverPort = new URL(baseURL).port || "3100";
const useExistingServer = process.env.PLAYWRIGHT_USE_EXISTING_SERVER === "1";
const mainE2eDistDir = process.env.PLAYWRIGHT_DIST_DIR ?? ".next-main-ovl05bs-e2e";
if (!/^\.next-[a-z0-9-]+$/i.test(mainE2eDistDir)) {
  throw new Error("The main E2E dist directory is unsafe.");
}
process.env.PLAYWRIGHT_DIST_DIR = mainE2eDistDir;
const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;
const browserChannelOption = browserChannel ? { channel: browserChannel } : {};
const pocketAutomationState = JSON.stringify({
  preferences: { schemaVersion: 1, mode: "collapsed", docked: false, demoMode: false },
  recentActions: [],
});

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  testIgnore: [
    "architecture-studio.spec.ts",
    "audio-signal-lab.spec.ts",    "flux-tts-studio.spec.ts",
    "live-solution-studio.spec.ts",
    "observatory.spec.ts",
    "one-visual-regression.spec.ts",
    "open-lab.spec.ts",
    "pocket-api-lab.spec.ts",
    "pocket-deepgram.spec.ts",
    "pre-sales-studio.spec.ts",
    "transcribe-file-languages.spec.ts",
    "transcribe-url-languages.spec.ts",
  ],
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // A single worker keeps the shared local Next server deterministic. The
  // dedicated Pocket, Observatory, and Open Lab configs own their parallel or
  // multi-viewport matrices separately.
  workers: 1,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : [["list"]],
  outputDir: "test-results/main-e2e",
  timeout: 60_000,
  expect: {
    timeout: 7_500,
  },
  use: {
    baseURL,
    // Legacy workflow tests exercise the underlying guarded actions directly.
    // Pocket's dedicated suite separately verifies the real default-on checkpoint.
    storageState: {
      cookies: [],
      origins: [{ origin: new URL(baseURL).origin, localStorage: [{ name: "deepgram-pocket:shell:v1", value: pocketAutomationState }] }],
    },
    acceptDownloads: true,
    colorScheme: "dark",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    launchOptions: {
      args: ["--disable-gpu"],
    },
  },
  projects: [
    {
      name: "chromium-1366x768",
      testMatch: "questline-layout.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        ...browserChannelOption,
        viewport: { width: 1366, height: 768 },
      },
    },
    {
      name: "chromium-1440x900",
      use: {
        ...devices["Desktop Chrome"],
        ...browserChannelOption,
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "chromium-1920x1080",
      testMatch: "questline-layout.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        ...browserChannelOption,
        viewport: { width: 1920, height: 1080 },
      },
    },
  ],
  webServer: useExistingServer ? undefined : {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${serverPort}`,
    url: baseURL,
    name: "Deepgram Voice Lab (credential-free E2E)",
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      SUPABASE_URL: "",
      SUPABASE_PUBLISHABLE_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      LAB_USAGE_GUARD_TOKEN: "",
      DEEPGRAM_API_KEY: "",
      ELEVENLABS_API_KEY: "",
      FISH_AUDIO_API_KEY: "",
      CARTESIA_API_KEY: "",
      RESON8_API_KEY: "",
      ONE_LIVE_EVALS_ENABLED: "false",
      ONE_LIVE_EVALS_ANONYMOUS_ENABLED: "false",
      PLAYWRIGHT_E2E: "1",
      PLAYWRIGHT_DIST_DIR: mainE2eDistDir,
    },
  },
});
