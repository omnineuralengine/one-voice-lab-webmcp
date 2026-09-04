import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_VOICE_OPEN_BASE_URL ?? "http://127.0.0.1:3293";
const serverPort = new URL(baseURL).port || "3293";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["voice-open-lab.spec.ts", "evaluate.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "test-results/voice-open-lab",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: { args: ["--disable-gpu"] },
  },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${serverPort}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      DEEPGRAM_API_KEY: "voice-open-e2e-placeholder",
      OPEN_LAB_MODE: "true",
      OPEN_LAB_DEEPGRAM_ENABLED: "true",
      ONE_LIVE_EVALS_ENABLED: "false",
      ONE_LIVE_EVALS_ANONYMOUS_ENABLED: "false",
      VOICE_LAB_OPERATOR_MODE: "false",
      PLAYWRIGHT_E2E: "1",
      PLAYWRIGHT_DIST_DIR: ".next-voice-open-e2e",
    },
  },
});
