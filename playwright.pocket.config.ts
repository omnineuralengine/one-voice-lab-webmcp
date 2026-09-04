import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3120";
const useExistingServer = process.env.PLAYWRIGHT_USE_EXISTING_SERVER === "1";

export default defineConfig({
  metadata: { pocket: true },
  testDir: "./tests/e2e",
  testMatch: ["pocket-deepgram.spec.ts", "pocket-api-lab.spec.ts"],
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results/pocket-deepgram",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    colorScheme: "dark",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "phone-390x844",
      use: { ...devices["iPhone 13"], browserName: "chromium", viewport: { width: 390, height: 844 } },
    },
    {
      name: "tablet-820x1180",
      use: { browserName: "chromium", viewport: { width: 820, height: 1180 }, hasTouch: true },
    },
    {
      name: "laptop-1366x768",
      use: { ...devices["Desktop Chrome"], browserName: "chromium", viewport: { width: 1366, height: 768 } },
    },
    {
      name: "wide-1920x1080",
      use: { ...devices["Desktop Chrome"], browserName: "chromium", viewport: { width: 1920, height: 1080 } },
    },
  ],
  webServer: useExistingServer ? undefined : {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3120",
    url: baseURL,
    name: "Pocket Deepgram (credential-free E2E)",
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      DEEPGRAM_API_KEY: "pocket-e2e-server-key-never-client",
      PLAYWRIGHT_E2E: "1",
      PLAYWRIGHT_DIST_DIR: ".next-pocket-e2e",
    },
  },
});
