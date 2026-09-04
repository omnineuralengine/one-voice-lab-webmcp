import { getCapabilities } from "@/data/deepgram-capabilities";
import { getQuestion } from "@/data/architecture-studio-discovery";
import { buildArchitectureTopology } from "@/lib/architecture-studio/architecture";
import { recommendPackage } from "@/lib/architecture-studio/package-recommendation-engine";
import { recommendArchitecture, resolveDiscoveryProfile } from "@/lib/architecture-studio/recommendation-engine";
import type { PublicStudioSession, StudioNextStep, StudioSession, StudioSolutionBrief } from "@/types/architecture-studio";

const PRODUCTION_PATH = [
  "Discovery and assumption review",
  "Representative-data evaluation",
  "Integration prototype",
  "Load, latency, and failure testing",
  "Security and governance review",
  "Limited production pilot",
  "Controlled rollout with rollback gates",
  "Production observability and optimization",
];

export function buildSolutionBrief(session: StudioSession | PublicStudioSession): StudioSolutionBrief {
  const recommendation = recommendArchitecture(session);
  const packageRecommendation = recommendPackage(session);
  const profile = resolveDiscoveryProfile(session);
  const values = profile.values;
  const capabilities = getCapabilities(packageRecommendation.components.flatMap((component) => component.capabilityId ? [component.capabilityId] : []));
  const topology = buildArchitectureTopology(session, recommendation.primaryPath);
  const company = String(values["company-name"] ?? "the fictional CCaaS customer");
  const useCases = list(values["primary-use-case"]);
  const outcomes = list(values["business-outcome"]);
  const currentEnvironment = [
    values["ccaas-platform"] ? `CCaaS: ${pretty(values["ccaas-platform"])}` : "CCaaS platform: unresolved",
    values["media-path"] ? `Media: ${list(values["media-path"]).map(pretty).join(", ")}` : "Media path: unresolved",
    values["cloud-provider"] ? `Cloud: ${list(values["cloud-provider"]).map(pretty).join(", ")}` : "Cloud environment: unresolved",
    values["contact-regions"] ? `Regions: ${list(values["contact-regions"]).map(pretty).join(", ")}` : "Regions: unresolved",
    values["existing-providers"] ? `Existing AI layers: ${list(values["existing-providers"]).map(pretty).join(", ")}` : "Existing AI providers: unresolved",
    values["provider-details"] ? `Provider details: ${String(values["provider-details"])}` : "Provider and framework details: unresolved",
    values["business-systems"] ? `Business systems: ${list(values["business-systems"]).map(pretty).join(", ")}` : "Business systems: unresolved",
    values["observability-stack"] ? `Observability: ${list(values["observability-stack"]).map(pretty).join(", ")}` : "Observability integration: unresolved",
    values["retention-expectations"] ? `Retention: ${pretty(values["retention-expectations"])}` : "Retention expectations: unresolved",
  ];
  const retainedComponents = topology.nodes
    .filter((node) => node.owner !== "deepgram")
    .map((node) => node.label)
    .filter((label, index, items) => items.indexOf(label) === index);
  const nextSteps = session.nextSteps.length ? session.nextSteps : defaultNextSteps();
  const openQuestions = [
    ...packageRecommendation.gaps.map((gap) => `${gap.title}: ${gap.nextQuestion} Working assumption: ${gap.workingAssumption}`),
    ...session.assumptions.filter((assumption) => assumption.status === "unvalidated").map((assumption) => `Validate assumption: ${assumption.text}`),
    ...session.parkingLot.filter((item) => !item.resolved).map((item) => `Parking lot: ${item.text}`),
  ].slice(0, 14);
  const evaluationPlan = packageRecommendation.validationPlan.map((test) => `${test.title}: ${test.method} Acceptance: ${test.acceptanceCriteria}${test.unresolvedPrerequisites.length ? ` Prerequisites: ${test.unresolvedPrerequisites.join(", ")}.` : ""}`);
  const customerObjective = `${company} is evaluating ${useCases.length ? useCases.map(pretty).join(", ") : "a voice workflow"} to pursue ${outcomes.length ? outcomes.map(pretty).join(", ") : "a measurable customer outcome"}.`;
  const generatedAt = new Date().toISOString();

  const briefWithoutMarkdown = {
    generatedAt,
    customerObjective,
    currentEnvironment,
    recommendedStartingArchitecture: `${recommendation.title}. ${recommendation.summary} Package confidence is ${packageRecommendation.confidence}: ${packageRecommendation.confidenceReason} ${session.architectureOverrides?.length ? `${session.architectureOverrides.length} operator override(s) are shown separately from engine-generated decisions.` : "No operator overrides have been applied."} This is a starting point, not a final commercial or production commitment.`,
    technicalTopology: topology,
    deepgramComponents: capabilities.map((capability) => `${capability.displayName} — ${capability.plainLanguageExplanation}${capability.documentationStatus === "verified" ? "" : ` (${capability.documentationStatus.replaceAll("-", " ")})`}`),
    retainedComponents,
    tradeoffs: [...new Set([...recommendation.tradeoffs, ...packageRecommendation.components.map((component) => `${component.capabilityOrApproach}: ${component.tradeoffOrLimitation}`)])],
    evaluationPlan,
    productionPath: PRODUCTION_PATH,
    openQuestions,
    nextSteps,
  };
  return { ...briefWithoutMarkdown, markdown: solutionBriefMarkdown(briefWithoutMarkdown) };
}

function defaultNextSteps(): StudioNextStep[] {
  return [
    { id: "next-dataset", action: "Assemble representative and edge-case audio with safe ground truth.", owner: "Customer voice platform team", timing: "Within 1 week", completed: false },
    { id: "next-criteria", action: "Agree on primary metrics, guardrails, and acceptance thresholds.", owner: "Customer experience + engineering", timing: "Before test execution", completed: false },
    { id: "next-spike", action: "Run one guarded integration spike and record stage-level latency.", owner: "Applied Engineer + platform engineer", timing: "Week 2", completed: false },
    { id: "next-review", action: "Validate deployment, security, and commercial assumptions with Deepgram.", owner: "Security lead + Deepgram team", timing: "Before pilot commitment", completed: false },
  ];
}

function solutionBriefMarkdown(brief: Omit<StudioSolutionBrief, "markdown">) {
  const section = (title: string, items: string[]) => `## ${title}\n\n${items.length ? items.map((item) => `- ${item}`).join("\n") : "- Not yet resolved"}`;
  return [
    "# Deepgram Voice Architecture Studio — Solution Brief",
    `Generated ${new Date(brief.generatedAt).toLocaleString("en-US", { timeZone: "UTC" })} UTC from a simulated discovery session.`,
    "Prototype only. Technical and commercial validation required. No pricing, legal, or compliance commitment is made.",
    "## Customer objective\n\n" + brief.customerObjective,
    section("Current environment", brief.currentEnvironment),
    "## Recommended starting architecture\n\n" + brief.recommendedStartingArchitecture,
    section("Technical topology — components", brief.technicalTopology.nodes.map((node) => `${node.label} (${node.owner}${node.origin === "operator" ? ", operator override" : ", engine generated"}${node.decisionStatus ? `, ${node.decisionStatus}` : ""}) — ${node.detail}${node.operatorNote ? `; note: ${node.operatorNote}` : ""}`)),
    section("Technical topology — flows", brief.technicalTopology.edges.map((edge) => `${edge.from} → ${edge.to}: ${edge.label} [${edge.type}]`)),
    section("Deepgram components to evaluate", brief.deepgramComponents),
    section("Existing components retained", brief.retainedComponents),
    section("Key tradeoffs", brief.tradeoffs),
    section("Evaluation plan", brief.evaluationPlan),
    section("Production path", brief.productionPath.map((item, index) => `${index + 1}. ${item}`)),
    section("Open questions", brief.openQuestions),
    "## Live-call next steps\n\n" + brief.nextSteps.map((item) => `- [${item.completed ? "x" : " "}] ${item.action} — **${item.owner}**, ${item.timing}`).join("\n"),
  ].join("\n\n");
}

function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return value === undefined || value === null || value === "" ? [] : [String(value)];
}

function pretty(value: unknown) {
  return String(value).replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function questionLabel(questionId: string) {
  return getQuestion(questionId)?.label ?? questionId;
}
