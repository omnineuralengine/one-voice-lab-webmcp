import { getQuestion } from "@/data/architecture-studio-discovery";
import { buildArchitectureTopology } from "@/lib/architecture-studio/architecture";
import { recommendArchitecture } from "@/lib/architecture-studio/recommendation-engine";
import { redactAiText } from "@/lib/ai/redaction";
import type { AiContext } from "@/lib/ai/schemas";
import type { SolutionCaseBundle } from "@/types/live-solution-case";
import type { PublicStudioSession } from "@/types/architecture-studio";
import type { SolutionBrief } from "@/types/live-solution-studio";

export function buildLiveSolutionAiContext(bundle: SolutionCaseBundle, brief?: SolutionBrief | null): AiContext {
  const eligibleItems = bundle.items.filter((item) =>
    !item.isArchived
    && item.visibility !== "private"
    && item.kind !== "customer-statement"
    && item.sensitivity !== "secret"
    && item.redactionStatus !== "review-required"
    && item.redactionStatus !== "contains-secret",
  );
  const body = (kind: string) => eligibleItems.filter((item) => item.kind === kind).map((item) => redactAiText(item.body, 800));
  const verified = eligibleItems.filter((item) => ["customer-confirmed", "artifact-observed", "locally-validated", "API-Lab-validated", "manually-validated", "officially-sourced"].includes(item.verificationState));
  const official = eligibleItems.filter((item) => item.kind === "official-deepgram-evidence");

  return {
    moduleId: "live-solution-studio",
    moduleName: "Live Solution Studio",
    summary: redactAiText(bundle.case.summary || bundle.case.title, 4_000),
    facts: [
      ...verified.map((item) => `${item.title}: ${redactAiText(item.body, 700)}`),
      ...(brief ? [`Deterministic recommendation: ${redactAiText(brief.recommend.leadingPath, 700)}`, ...brief.validation.slice(0, 8).map((item) => `Deterministic validation step: ${redactAiText(item, 700)}`)] : []),
    ].slice(0, 30),
    assumptions: [...body("assumption"), ...(brief?.assumptions ?? []).map((item) => redactAiText(item, 800))].slice(0, 30),
    openQuestions: [...body("open-question"), ...(brief?.unknowns ?? []).map((item) => redactAiText(item, 800))].slice(0, 30),
    architecture: [...body("architecture-option"), ...(brief?.architecture ?? []).map((item) => redactAiText(item, 800))].slice(0, 40),
    risks: [...body("risk"), ...(brief?.failurePlan ?? []).map((item) => redactAiText(item, 800))].slice(0, 30),
    evidence: [
      { id: "repo-live-solution-engine", label: "Deterministic Live Solution engine", type: "repository" as const, summary: "The repository contains the typed Case Graph and deterministic brief engine." },
      ...official.map((item) => ({
        id: item.id,
        label: item.title,
        type: "deepgram-documentation" as const,
        summary: redactAiText(item.body, 1_000),
        ...(typeof item.structuredData.canonicalSourceUrl === "string" ? { url: item.structuredData.canonicalSourceUrl } : {}),
      })),
    ].slice(0, 30),
  };
}

export function buildArchitectureAiContext(session: PublicStudioSession): AiContext {
  const recommendation = recommendArchitecture(session);
  const topology = buildArchitectureTopology(session, recommendation.primaryPath);
  const facts = Object.entries({ ...Object.fromEntries(session.answers.map((answer) => [answer.questionId, answer.value])), ...session.presenterOverrides }).map(([questionId, value]) => {
    const label = getQuestion(questionId)?.label ?? questionId;
    const rendered = Array.isArray(value) ? value.join(", ") : String(value);
    return `${label}: ${redactAiText(rendered, 700)}`;
  });
  return {
    moduleId: "architecture-studio",
    moduleName: "Voice Architecture Studio",
    summary: `${redactAiText(session.scenarioName, 200)}. Deterministic path: ${recommendation.title}. Confidence: ${recommendation.confidence}.`,
    facts: [`Deterministic recommendation: ${recommendation.summary}`, ...facts].slice(0, 30),
    assumptions: [...recommendation.assumptions, ...session.assumptions.filter((item) => item.status !== "overridden").map((item) => item.text)].map((item) => redactAiText(item, 800)).slice(0, 30),
    openQuestions: recommendation.unresolvedQuestions.map((item) => redactAiText(item, 800)).slice(0, 30),
    architecture: [
      ...topology.nodes.map((node) => `${node.label}: ${node.detail} [owner: ${node.owner}]`),
      ...topology.edges.map((edge) => `${edge.from} -> ${edge.to}: ${edge.label} [${edge.type}]`),
    ].map((item) => redactAiText(item, 800)).slice(0, 40),
    risks: recommendation.tradeoffs.map((item) => redactAiText(item, 800)).slice(0, 30),
    evidence: [{ id: "repo-architecture-engine", label: "Deterministic Architecture Studio engine", type: "repository", summary: "The repository recommendation engine and current session produced this topology and recommendation." }],
  };
}
