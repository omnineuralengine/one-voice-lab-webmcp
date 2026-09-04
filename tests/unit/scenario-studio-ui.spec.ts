import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import {
  resolveScenarioIdentityScope,
  scenarioIdentityChanged,
} from "../../src/components/scenarios/identity-scope";

test.describe("Scenario Studio presentation boundary", () => {
  test("distinguishes pending, guest, and verified-human tab scopes", () => {
    const pending = resolveScenarioIdentityScope(false, null);
    const guest = resolveScenarioIdentityScope(true, null);
    const userA = resolveScenarioIdentityScope(true, "10000000-0000-4000-8000-000000000001");
    const userB = resolveScenarioIdentityScope(true, "10000000-0000-4000-8000-000000000002");

    expect(pending).toMatchObject({ ready: false, label: "Checking the current account" });
    expect(guest).toMatchObject({ ready: true, label: "Guest · this receipt stays in this tab" });
    expect(userA.label).toBe("Signed in · this receipt stays in this tab");
    expect(scenarioIdentityChanged(pending, guest)).toBe(true);
    expect(scenarioIdentityChanged(guest, userA)).toBe(true);
    expect(scenarioIdentityChanged(userA, userB)).toBe(true);
    expect(scenarioIdentityChanged(userA, userA)).toBe(false);
  });

  test("keeps correlation and receipt state ephemeral in the client presentation", async () => {
    const source = await readFile("src/components/scenarios/ScenarioStudio.tsx", "utf8");

    expect(source).toContain("correlationToken: crypto.randomUUID()");
    expect(source).toContain('cache: "no-store"');
    expect(source).toContain("activeControllerRef.current?.abort()");
    expect(source).toContain("setResponse(null)");
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|URLSearchParams/);
    expect(source).not.toMatch(/HumanDepthControl|updateInterfaceDepth/);
    expect(source).toContain('data-depth-source="scenario-ephemeral"');
    expect(source.match(/correlationToken/g)).toHaveLength(1);
  });
});
