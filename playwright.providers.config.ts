import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_PROVIDER_BASE_URL ?? "http://127.0.0.1:3228";
const serverPort = new URL(baseURL).port || "3228";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["provider-rolodex.spec.ts", "elevenlabs-api-studio.spec.ts", "fish-audio-api-studio.spec.ts"],
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    colorScheme: "dark",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${serverPort}`,
    url: `${baseURL}/providers`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      DEEPGRAM_API_KEY: "",
      ELEVENLABS_API_KEY: "fixture-server-only-key",
      FISH_AUDIO_API_KEY: "fixture-server-only-key",
      OPEN_LAB_MODE: "false",
      PLAYWRIGHT_E2E: "1",
      PLAYWRIGHT_DIST_DIR: ".next-provider-rolodex-e2e",
    },
  },
});
