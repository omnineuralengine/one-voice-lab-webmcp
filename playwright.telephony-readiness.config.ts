import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

const baseURL = process.env.PLAYWRIGHT_WEBMCP_BASE_URL ?? "http://127.0.0.1:3343";
const serverPort = new URL(baseURL).port || "3343";
const distDir = ".next-webmcp-e2e";
const mockedFontResponses = resolve(process.cwd(), "tests/fixtures/next-font-google-mocked-responses.cjs");
process.env.PLAYWRIGHT_DIST_DIR = distDir;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["telephony-readiness.spec.ts", "one-webmcp.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "test-results/telephony-readiness",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    colorScheme: "dark",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    serviceWorkers: "block",
    viewport: { width: 1440, height: 900 },
    launchOptions: { args: ["--disable-gpu"] },
  },
  webServer: {
    command: `npm run dev -- --webpack --hostname 127.0.0.1 --port ${serverPort}`,
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
      DEEPGRAM_API_KEY: "",
      ELEVENLABS_API_KEY: "",
      FISH_AUDIO_API_KEY: "",
      CARTESIA_API_KEY: "",
      RESON8_API_KEY: "",
      TWILIO_ACCOUNT_SID: "",
      TWILIO_AUTH_TOKEN: "",
      TWILIO_PHONE_NUMBER: "",
      TWILIO_TEST_ACCOUNT_SID: "",
      TWILIO_TEST_AUTH_TOKEN: "",
      TWILIO_MODE: "simulation",
      TWILIO_LIVE_CALLS_ENABLED: "false",
      ONE_LIVE_LAB_ENABLED: "false",
      ONE_LIVE_EVALS_ENABLED: "false",
      ONE_LIVE_EVALS_ANONYMOUS_ENABLED: "false",
      PLAYWRIGHT_E2E: "1",
      PLAYWRIGHT_DIST_DIR: distDir,
      NEXT_FONT_GOOGLE_MOCKED_RESPONSES: mockedFontResponses,
    },
  },
});
