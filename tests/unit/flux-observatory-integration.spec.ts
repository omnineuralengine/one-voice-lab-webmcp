import { expect, test } from "@playwright/test";

import {
  buildFluxMermaid,
  createFluxCaseContribution,
  parseFluxCaseHandoff,
  runFluxReplayFixture,
  serializeFluxCaseHandoff,
} from "@/lib/flux-observatory";
import { describeMermaid, mermaidToSafeSvg, validateMermaid } from "@/lib/solution-deliverables";
import { caseModuleContributionSchema } from "@/types/live-solution-case";

test("Flux architecture export stays inside the shared strict Mermaid subset", () => {
  const { state } = runFluxReplayFixture("hesitation-followed-by-continuation");
  const source = buildFluxMermaid(state.activeConfiguration, { mode: state.mode });
  const validation = validateMermaid(source);
  expect(validation).toMatchObject({ valid: true, securityMode: "strict" });
  expect(validation.nodeCount).toBeGreaterThan(10);
  expect(source).toContain("Flux /v2/listen");
  expect(source).not.toContain("/v1/listen");
  expect(source).not.toMatch(/%%\{|click\s|javascript:|https?:\/\/|<script/i);

  const svg = mermaidToSafeSvg(source);
  expect(svg).toContain("<svg");
  expect(svg).toContain("Flux /v2/listen");
  expect(svg).not.toMatch(/<script|foreignObject|javascript:|(?:href|src)=["']https?:\/\//i);
  expect(describeMermaid(source)).toContain("Recorded diagram relationships");
});

test("Flux case handoff is typed, transcript-free, and not customer-export approved", () => {
  const { state } = runFluxReplayFixture("eager-end-turn-resumed");
  const raw = serializeFluxCaseHandoff(state);
  const seed = parseFluxCaseHandoff(raw);
  expect(seed).not.toBeNull();
  expect(raw).not.toContain("Cancel the order");
  expect(raw).not.toMatch(/authorization|bearer|access[_-]?token|api[_-]?key/i);

  const contribution = createFluxCaseContribution("case-synthetic", seed!);
  expect(caseModuleContributionSchema.safeParse(contribution).success).toBe(true);
  expect(contribution.moduleId).toBe("flux-observatory");
  expect(contribution.createdItems.some((item) => item.kind === "technical-artifact")).toBe(true);
  expect(contribution.validationResults).toHaveLength(1);
  expect(contribution.validationResults[0].structuredData.scope).toBe("application event pipeline only");
  for (const item of [...contribution.createdItems, ...contribution.validationResults, ...contribution.suggestedActions]) {
    expect(item.includeInCustomerExport).toBe(false);
    expect(item.visibility).toBe("internal");
    expect(item.body).not.toContain("Cancel the order");
  }
});

test("malformed case handoffs fail closed and secret-shaped text is redacted", () => {
  expect(parseFluxCaseHandoff(null)).toBeNull();
  expect(parseFluxCaseHandoff("{not-json")).toBeNull();
  const secretShaped = parseFluxCaseHandoff(JSON.stringify({
    schemaVersion: "flux-case-handoff-v1",
    generatedAt: new Date().toISOString(),
    sourceSessionId: "fixture",
    mode: "synthetic-replay",
    providerValidationState: "synthetic-only",
    model: "flux-general-en",
    encoding: "linear16",
    sampleRate: 16000,
    targetChunkMs: 80,
    thresholdHypothesis: "Authorization: Bearer fixture",
    evidenceSummary: "fixture",
    architectureData: [],
    risks: [],
    productionReadinessGaps: [],
    unresolvedDiscoveryQuestions: [],
  }));
  expect(secretShaped?.thresholdHypothesis).toContain("redacted");
  expect(secretShaped?.thresholdHypothesis).not.toContain("secret-value-that-must-not-pass");
  expect(parseFluxCaseHandoff(JSON.stringify({ ...secretShaped, unexpected: true }))).toBeNull();
});
