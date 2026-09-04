import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3214";
const serverPort = new URL(baseURL).port || "3214";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "applied-voice-ai.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 7_500 },
  use: { ...devices["Desktop Chrome"], baseURL, viewport: { width: 1440, height: 900 }, colorScheme: "dark", screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${serverPort}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
    env: { DEEPGRAM_API_KEY: "", LAB_AI_ENABLED: "false", PLAYWRIGHT_E2E: "1" },
  },
});
