import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3214";

export default defineConfig({
  metadata: { openLab: true },
  testDir: "./tests/e2e",
  testMatch: ["open-lab.spec.ts", "flux-tts-studio.spec.ts", "lab-evolution.spec.ts", "one-visual-regression.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "test-results/open-lab",
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
    command: "npm run dev -- --hostname 127.0.0.1 --port 3214",
    url: baseURL,
    name: "ONE Open Lab E2E",
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      DEEPGRAM_API_KEY: "open-lab-e2e-server-key",
      OPEN_LAB_MODE: "true",
      OPEN_LAB_DEEPGRAM_ENABLED: "true",
      PLAYWRIGHT_E2E: "1",
      PLAYWRIGHT_DIST_DIR: ".next-open-lab-e2e",
    },
  },
});
