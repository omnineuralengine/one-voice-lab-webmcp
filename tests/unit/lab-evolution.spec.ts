import { expect, test } from "@playwright/test";

import { CAPABILITIES } from "../../src/lib/capabilities/registry";
import {
  CURRENT_LAB_EXPERIMENTS,
  EVIDENCE_PHILOSOPHY,
  LAB_DEVELOPMENT_ARCHITECTURE,
  LAB_EVIDENCE_LABELS,
  LAB_EVOLUTION_KNOWN_LIMITATIONS,
  LAB_EVOLUTION_NEXT_HYPOTHESES,
  LAB_EVOLUTION_SURFACE_REGISTRY,
  LAB_EVOLUTION_TIMELINE,
  LAB_MODULE_EVOLUTION_PROFILES,
  LAB_MODULE_MATURITY_OVERVIEW,
  RECURSIVE_LEARNING_LOOP,
  RECURSIVE_LEARNING_LOOP_EDGES,
  labEvolutionEntryById,
  labModuleEvolutionProfileById,
  labModuleMaturityById,
} from "../../src/lib/lab-evolution";

const EVIDENCE_LABELS = new Set(LAB_EVIDENCE_LABELS);

test.describe("Lab Evolution domain", () => {
  test("keeps the requested recursive loop and closes it back to Question", () => {
    expect(RECURSIVE_LEARNING_LOOP.map((node) => node.label)).toEqual([
      "Question",
      "Learn",
      "Build",
      "Observe",
      "Test",
      "Document",
      "Ship",
      "Question again",
    ]);
    expect(RECURSIVE_LEARNING_LOOP_EDGES).toHaveLength(RECURSIVE_LEARNING_LOOP.length);
    expect(RECURSIVE_LEARNING_LOOP_EDGES.at(-1)).toEqual({ from: "question-again", to: "question" });
  });

  test("models GitHub and Vercel as the canonical delivery path and Entire as parallel context", () => {
    expect(LAB_DEVELOPMENT_ARCHITECTURE.primaryFlow.map((node) => node.label)).toEqual([
      "Human intent",
      "Codex",
      "Working tree",
      "Git commit",
      "GitHub",
      "Vercel",
      "Live Learning Lab",
      "Evidence / feedback",
      "Next iteration",
    ]);
    expect(LAB_DEVELOPMENT_ARCHITECTURE.primaryFlow.some((node) => node.label.includes("Entire"))).toBe(false);
    expect(LAB_DEVELOPMENT_ARCHITECTURE.parallelContextNodes).toEqual([
      expect.objectContaining({ label: "Entire development-context capture", status: "Experimental idea" }),
    ]);
    expect(LAB_DEVELOPMENT_ARCHITECTURE.parallelContextEdges).toEqual([
      expect.objectContaining({ from: "codex", to: "entire-context", kind: "parallel-context", status: "Experimental idea" }),
    ]);
    expect(LAB_DEVELOPMENT_ARCHITECTURE.boundaries).toContain("GitHub remains canonical source control.");
    expect(LAB_DEVELOPMENT_ARCHITECTURE.boundaries).toContain("Vercel remains deployment infrastructure.");
  });

  test("uses only the four approved evidence labels", () => {
    expect(LAB_EVIDENCE_LABELS).toEqual([
      "Repository verified",
      "Deepgram documentation verified",
      "Assumption",
      "Experimental idea",
    ]);
    expect(EVIDENCE_PHILOSOPHY.map((item) => item.label)).toEqual(LAB_EVIDENCE_LABELS);

    const topics = [...CURRENT_LAB_EXPERIMENTS, ...LAB_EVOLUTION_KNOWN_LIMITATIONS, ...LAB_EVOLUTION_NEXT_HYPOTHESES];
    const labels = [
      ...LAB_EVOLUTION_TIMELINE.flatMap((entry) => [entry.status, ...entry.evidence.map((item) => item.label)]),
      ...topics.flatMap((topic) => [topic.status, ...topic.evidence.map((item) => item.label)]),
      ...LAB_DEVELOPMENT_ARCHITECTURE.primaryFlow.map((node) => node.status),
      ...LAB_DEVELOPMENT_ARCHITECTURE.primaryEdges.map((edge) => edge.status),
      ...LAB_DEVELOPMENT_ARCHITECTURE.parallelContextNodes.map((node) => node.status),
      ...LAB_DEVELOPMENT_ARCHITECTURE.parallelContextEdges.map((edge) => edge.status),
      ...LAB_MODULE_EVOLUTION_PROFILES.flatMap((profile) => [
        profile.currentEvidenceStatus,
        ...profile.evidence.map((item) => item.label),
      ]),
    ];

    expect(labels.every((label) => EVIDENCE_LABELS.has(label))).toBe(true);
  });

  test("contains only dated, ordered, evidence-backed timeline entries", () => {
    const dates = LAB_EVOLUTION_TIMELINE.map((entry) => entry.date);
    expect(dates).toEqual([...dates].sort());

    for (const entry of LAB_EVOLUTION_TIMELINE) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.description.trim()).not.toBe("");
      expect(entry.modules.length).toBeGreaterThan(0);
      expect(entry.evidence.length).toBeGreaterThan(0);
      expect(entry.learning.trim()).not.toBe("");
      expect(entry.nextHypothesis.trim()).not.toBe("");
      if ("gitCommit" in entry) expect(entry.gitCommit).toMatch(/^[0-9a-f]{40}$/);
    }

    expect(LAB_EVOLUTION_TIMELINE.every((entry) => !("entireCheckpoint" in entry))).toBe(true);
    expect(labEvolutionEntryById("architecture-studio-hardening")?.gitCommit).toBe(
      "82e2cb00b1939db91e1e89ae8fc1fbabfb2cea5e",
    );
    expect(labEvolutionEntryById("missing-entry")).toBeNull();
  });

  test("records the immutable baseline test count without inventing current counts", () => {
    const baseline = labEvolutionEntryById("applied-voice-baseline");
    expect(baseline?.tests).toEqual([
      expect.objectContaining({ result: expect.stringContaining("101 unit tests and 33 focused browser tests passed") }),
    ]);
    expect(labEvolutionEntryById("open-lab-flux-one")).not.toHaveProperty("tests");
  });

  test("combines shared capabilities with the explicit user-facing surface registry", () => {
    for (const capability of CAPABILITIES) {
      expect(LAB_MODULE_MATURITY_OVERVIEW.some((module) => module.capabilityId === capability.id)).toBe(true);
    }
    expect(LAB_MODULE_MATURITY_OVERVIEW.some((module) => module.capabilityId === "keyboard-shortcut")).toBe(false);
    expect(new Set(LAB_MODULE_MATURITY_OVERVIEW.map((module) => module.id)).size).toBe(
      LAB_MODULE_MATURITY_OVERVIEW.length,
    );
    for (const profile of LAB_MODULE_EVOLUTION_PROFILES) {
      expect(profile.why.trim()).not.toBe("");
      expect(profile.evidence.length).toBeGreaterThan(0);
      if (profile.lastEvolutionEntry) {
        expect(labEvolutionEntryById(profile.lastEvolutionEntry)).not.toBeNull();
      }
    }

    for (const id of [
      "open-lab",
      "transcribe-url",
      "upload-audio",
      "live-mic",
      "tts",
      "flux-tts",
      "flux-observatory",
      "lab-evolution",
    ]) {
      expect(LAB_EVOLUTION_SURFACE_REGISTRY.some((surface) => surface.id === id)).toBe(true);
    }

    const architecture = labModuleMaturityById("architecture");
    expect(architecture).toEqual(expect.objectContaining({
      name: "Architecture Studio",
      currentEvidenceStatus: "Repository verified",
      lastEvolutionEntry: "architecture-vercel-preview",
    }));
    expect(architecture?.knownLimitations).toContain(
      "Cross-device sessions require optional provider configuration and deployment testing.",
    );
    expect(labModuleMaturityById("voice-problem")).toEqual(expect.objectContaining({
      implementationStatus: "planned",
      knownLimitations: ["Speak the Problem remains planned and unavailable."],
    }));
    expect(labModuleEvolutionProfileById("api-lab")).toEqual(expect.objectContaining({
      id: "api-studio",
      capabilityId: "api-lab",
      registrySource: "shared-capability",
    }));
    expect(labModuleEvolutionProfileById("flux-observatory")).toEqual(expect.objectContaining({
      implementationStatus: "experimental",
      lastEvolutionEntry: "flux-conversation-observatory",
    }));
    expect(labModuleEvolutionProfileById("lab-evolution")).toEqual(expect.objectContaining({
      name: "Lab Evolution",
      currentEvidenceStatus: "Repository verified",
      registrySource: "explicit-surface",
      lastEvolutionEntry: "lab-evolution-notebook",
    }));
    expect(labModuleMaturityById("unknown-module")).toBeNull();
  });

  test("keeps unresolved work explicit rather than promoted to implementation", () => {
    expect(CURRENT_LAB_EXPERIMENTS).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "flux-browser-streaming", status: "Experimental idea" }),
      expect.objectContaining({ id: "entire-context-capture", status: "Experimental idea" }),
    ]));
    expect(LAB_EVOLUTION_NEXT_HYPOTHESES).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "prove-flux-batch-audio", status: "Assumption" }),
    ]));
    const unresolved = JSON.stringify({
      experiments: CURRENT_LAB_EXPERIMENTS,
      limitations: LAB_EVOLUTION_KNOWN_LIMITATIONS,
      hypotheses: LAB_EVOLUTION_NEXT_HYPOTHESES,
    });
    expect(unresolved).not.toMatch(/\bis production[- ](?:ready|certified)\b|\bis an official Deepgram product\b/i);
    expect(unresolved).toContain("not an official Deepgram product or production-certified service");
    expect(LAB_EVOLUTION_NEXT_HYPOTHESES.find((item) => item.id === "verify-cross-device-studio")?.evidence[0].source)
      .toBe("docs/architecture-studio.md#post-workshop-backlog");
  });
});
