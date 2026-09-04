import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("Open Lab disclosure source preserves required enabled and paused copy", () => {
  const source = readFileSync(resolve(process.cwd(), "src/components/open-lab/OpenLabStatus.tsx"), "utf8");
  expect(source).toContain("OPEN LAB");
  expect(source).toContain("Shared live Deepgram project");
  expect(source).toContain("Do not submit confidential or regulated information");
  expect(source).toContain('liveEnabled ? "live execution enabled" : "provider paused; learning tools available"');
  expect(source).toContain('data-live-enabled={liveEnabled ? "true" : "false"}');
});
