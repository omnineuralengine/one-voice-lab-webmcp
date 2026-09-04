import {
  USER_SCENARIO_ID,
  USER_SCENARIO_VERSION,
  type ScenarioReviewGoal,
} from "@/lib/scenarios/contracts";

export type ScenarioReviewGoalPresentation = Readonly<{
  id: ScenarioReviewGoal;
  label: string;
  description: string;
}>;

export type UserScenarioPresentation = Readonly<{
  id: typeof USER_SCENARIO_ID;
  version: typeof USER_SCENARIO_VERSION;
  title: string;
  goal: string;
  summary: string;
  actionLabel: string;
  expectedLearning: readonly string[];
  reviewGoals: readonly ScenarioReviewGoalPresentation[];
}>;

export const USER_SCENARIO_PRESENTATIONS = Object.freeze([
  Object.freeze({
    id: USER_SCENARIO_ID,
    version: USER_SCENARIO_VERSION,
    title: "Recover safely from an interruption",
    goal: "See how a voice experience should respond when a person interrupts mid-response.",
    summary: "Run a bounded synthetic journey, then inspect exactly what the fixture supports and what still needs human review.",
    actionLabel: "Run the interruption scenario",
    expectedLearning: Object.freeze([
      "Whether the fixture captured the interruption and stopped stale playback.",
      "Which evidence is deterministic and which conclusion still needs a human.",
      "Why this local run is not evidence of live-provider performance.",
    ]),
    reviewGoals: Object.freeze([
      Object.freeze({
        id: "understand-interruption" as const,
        label: "Understand the recovery",
        description: "Start with what happened when the interruption occurred.",
      }),
      Object.freeze({
        id: "inspect-evidence" as const,
        label: "Inspect the evidence",
        description: "Focus on the traceable fixture assertions and their limits.",
      }),
      Object.freeze({
        id: "plan-next-check" as const,
        label: "Plan the next check",
        description: "Focus on what a human should validate before relying on this behavior.",
      }),
    ]),
  }),
]) satisfies readonly UserScenarioPresentation[];

export function getUserScenarioPresentation(
  scenarioId: string,
): UserScenarioPresentation | null {
  return USER_SCENARIO_PRESENTATIONS.find((scenario) => scenario.id === scenarioId) ?? null;
}
