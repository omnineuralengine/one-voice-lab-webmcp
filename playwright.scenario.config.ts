import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_SCENARIO_BASE_URL ?? "http://127.0.0.1:3342";
const serverPort = new URL(baseURL).port || "3342";
const sentinel = "ovl05a-sentinel-must-never-be-used";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "scenario-studio.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "test-results/scenario-studio",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    colorScheme: "dark",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
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
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      SUPABASE_URL: "",
      SUPABASE_PUBLISHABLE_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      LAB_USAGE_GUARD_TOKEN: "",
      DEEPGRAM_API_KEY: sentinel,
      ELEVENLABS_API_KEY: sentinel,
      FISH_AUDIO_API_KEY: sentinel,
      CARTESIA_API_KEY: sentinel,
      RESON8_API_KEY: sentinel,
      ONE_LIVE_LAB_ENABLED: "false",
      ONE_LIVE_EVALS_ENABLED: "false",
      ONE_LIVE_EVALS_ANONYMOUS_ENABLED: "false",
      PLAYWRIGHT_E2E: "1",
      PLAYWRIGHT_DIST_DIR: ".next-scenario-e2e",
    },
  },
});
