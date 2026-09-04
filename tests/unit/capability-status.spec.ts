import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ALLOWED_CAPABILITY_LABELS = new Set([
  "Live-verified",
  "Fixture-verified",
  "Manual verification required",
  "Hosted preview",
  "Local-only",
  "Locked by design",
  "Experimental",
]);

test.describe("capability status cleanup", () => {
  test("removes generic module maturity badges", () => {
    const navigation = source("src/components/deepgram-control-room.tsx");

    expect(navigation).not.toMatch(/\bmaturity\b|\bbeta\b/i);
  });

  test("keeps the central capability matrix on the approved evidence labels", () => {
    const matrix = source("docs/DEEPGRAM_CAPABILITY_MATRIX.md");
    const evidence = matrix
      .split("\n")
      .filter((line) => line.startsWith("| ") && !line.startsWith("| Capability") && !line.startsWith("|---"))
      .map((line) => line.split("|")[8].trim());

    expect(evidence.length).toBeGreaterThan(20);
    expect(new Set(evidence)).toEqual(new Set(["Fixture-verified", "Manual verification required", "Local-only", "Locked by design"]));
    expect(evidence.every((label) => ALLOWED_CAPABILITY_LABELS.has(label))).toBe(true);
  });

  test("does not leave generic beta, coming-soon, or unstable preview status copy in current surfaces", () => {
    const currentSurfaces = [
      "src/components/api-studio/ExecutableApiStudio.tsx",
      "src/components/api-studio/PayloadBuilder.tsx",
      "src/components/providers/ProviderRolodex.tsx",
      "src/types/deepgram-api-studio.ts",
      "src/types/deepgram-endpoint-registry.ts",
    ].map(source).join("\n");

    expect(currentSurfaces).not.toMatch(/\bbeta\b|\bcoming soon\b/i);
    expect(currentSurfaces).not.toContain("Hosted preview");
    expect(currentSurfaces).not.toContain("Experimental");
    const applicationShell = source("src/components/deepgram-control-room.tsx");
    expect(applicationShell).not.toMatch(/\bbeta\b|\bcoming soon\b/i);
    expect(applicationShell.match(/Experimental/g)).toHaveLength(1);
    expect(applicationShell).toContain("Experimental · Simulated");
  });
});

function source(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}
