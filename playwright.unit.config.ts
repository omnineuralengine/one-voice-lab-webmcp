import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/unit",
  tsconfig: "./tests/unit/tsconfig.json",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  timeout: 20_000,
});
