import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_SCENARIO_AUTH_BASE_URL ?? "http://127.0.0.1:3341";
const serverPort = new URL(baseURL).port || "3341";

export default defineConfig({
  testDir: "./tests/local",
  testMatch: ["scenario-studio-authenticated.spec.ts", "one-concierge-authenticated.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "test-results/scenario-authenticated",
  timeout: 60_000,
  expect: { timeout: 12_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    colorScheme: "dark",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    viewport: { width: 390, height: 844 },
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
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
      SUPABASE_URL: "",
      SUPABASE_PUBLISHABLE_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      LAB_USAGE_GUARD_TOKEN: "",
      DEEPGRAM_API_KEY: "ovl05a-sentinel-must-never-be-used",
      ELEVENLABS_API_KEY: "ovl05a-sentinel-must-never-be-used",
      FISH_AUDIO_API_KEY: "ovl05a-sentinel-must-never-be-used",
      CARTESIA_API_KEY: "ovl05a-sentinel-must-never-be-used",
      RESON8_API_KEY: "ovl05a-sentinel-must-never-be-used",
      ONE_LIVE_LAB_ENABLED: "false",
      ONE_LIVE_EVALS_ENABLED: "false",
      ONE_LIVE_EVALS_ANONYMOUS_ENABLED: "false",
      PLAYWRIGHT_E2E: "1",
      PLAYWRIGHT_DIST_DIR: ".next-scenario-auth-e2e-ovl05a",
    },
  },
});
