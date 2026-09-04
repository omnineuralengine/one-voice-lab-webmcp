import { getCapabilities } from "@/data/deepgram-capabilities";
import { getFailureScenario } from "@/data/architecture-studio-failures";
import { applyArchitectureRevisions, buildGeneratedCanvasSnapshot } from "@/lib/architecture-studio/architecture-workspace";
import { recommendPackage } from "@/lib/architecture-studio/package-recommendation-engine";
import { recommendArchitecture, resolveDiscoveryProfile } from "@/lib/architecture-studio/recommendation-engine";
import { normalizeHandoffState } from "@/lib/architecture-studio/handoff-state";
import { createInitialSimulationState } from "@/lib/architecture-studio/simulation-state";
import type { PublicStudioSession, RecommendationConfidence, StudioAnswerValue, StudioSession } from "@/types/architecture-studio";
import type { CanvasArchitectureConnection } from "@/types/architecture-studio-diagnostics";
import type {
  ActionRegisterEntry,
  DecisionRegisterEntry,
  ExecutiveSummaryModel,
  HandoffAudienceMode,
  HandoffTrace,
  PocAcceptanceCriterion,
  ProofOfConceptPlanModel,
  SessionNarrativeModel,
  SessionReportModel,
  TechnicalHandoffItem,
  TechnicalHandoffModel,
} from "@/types/architecture-studio-handoff";

type SessionLike = StudioSession | PublicStudioSession;

export function deriveExecutiveSummary(session: SessionLike, audience = session.handoffState?.audience ?? "executive"): ExecutiveSummaryModel {
  const profile = resolveDiscoveryProfile(session);
  const packageResult = recommendPackage(session);
  const recommendation = recommendArchitecture(session);
  const values = profile.values;
  const handoff = normalizeHandoffState(session.handoffState);
  const simulation = session.architectureSimulation ?? createInitialSimulationState();
  const latestIncident = simulation.incidentHistory?.at(-1) ?? simulation.incidentSummary;
  const architecture = applyArchitectureRevisions(buildGeneratedCanvasSnapshot(session), simulation.revisions);
  const company = text(values["company-name"], session.scenarioName);
  const useCases = list(values["primary-use-case"]);
  const outcomes = list(values["business-outcome"]);
  const openGaps = packageResult.gaps.filter((gap) => !handoff.questionClosures.some((closure) => closure.questionId === gap.id));
  const capabilities = getCapabilities(packageResult.components.flatMap((component) => component.capabilityId ? [component.capabilityId] : []));
  const selectedMitigationId = simulation.mitigationDecisions.find((decision) => decision.state === "selected")?.mitigationId;
  const scenario = simulation.activeFailure ? getFailureScenario(simulation.activeFailure.scenarioId) : undefined;
  const selectedMitigation = scenario?.mitigationOptions.find((mitigation) => mitigation.id === selectedMitigationId)?.action ?? latestIncident?.immediateMitigation;
  const effectiveConfidence = effectiveSummaryConfidence(packageResult.confidence, packageResult.gaps.length, openGaps.length, packageResult.components.some((item) => item.verificationNeeded));
  const objective = `${company} is evaluating ${displayList(useCases, "an inbound voice workflow")} to pursue ${displayList(outcomes, "measurable task completion and customer-experience improvement")}. The first decision is whether a representative proof of concept supports a production design—not whether one isolated model metric looks better.`;
  const currentEnvironment = [
    `CCaaS and ingress: ${display(values["ccaas-platform"], "unresolved CCaaS")} with ${displayList(list(values["media-path"]), "media path to confirm")}.`,
    `Current voice stack: ${text(values["current-voice-stack"], "Current speech and orchestration ownership still needs to be mapped.")}`,
    `Orchestration and business systems: ${displayList([...list(values["existing-providers"]), ...list(values["business-systems"])], "to confirm")}.`,
    `Deployment: ${display(values["deployment-preference"], "deployment boundary unresolved")} in ${displayList(list(values["contact-regions"]), "regions to confirm")}.`,
    `Usage: ${display(values["concurrency"], "peak concurrency not yet supplied")} and ${display(values["monthly-minutes"], "monthly minutes not yet supplied")}.`,
    `Constraints: ${displayList([...list(values["pii-compliance"]), ...list(values["data-control"])], "governance requirements to confirm")}.`,
  ];
  const customerManaged = architecture.nodes.filter((node) => node.owner === "customer-managed" && node.enabled).map((node) => node.displayName).filter(unique).slice(0, 7);
  const integrationBoundaries = architecture.connections.filter((connection) => connection.enabled).map((connection) => `${nodeLabel(architecture.nodes, connection.fromNodeId)} → ${nodeLabel(architecture.nodes, connection.toNodeId)} (${connection.protocol ?? connection.flow})`).slice(0, audience === "technical" ? 8 : 4);
  const impacts = impactHypotheses(values, simulation.validationOutcome.result, selectedMitigation, audience);
  const risks = [
    ...openGaps.map((gap) => gap.title),
    ...(simulation.propagation?.missingObservability ?? []),
    ...(latestIncident?.unresolvedQuestions ?? []),
    ...(simulation.activeFailure && simulation.validationOutcome.result === "not-run" ? ["The simulated incident has no recorded recovery validation yet."] : []),
  ].filter(unique).slice(0, 7);
  const decisions = decisionRequirements(values, openGaps.map((gap) => gap.id), audience);
  const traceability: HandoffTrace[] = [
    trace("objective", "discovery-answer", "Customer objective", `${displayList(useCases, "Use case unresolved")} → ${displayList(outcomes, "Outcome unresolved")}`, "primary-use-case"),
    trace("direction", "recommendation-rule", "Current best-fit path", `${recommendation.title}: ${recommendation.summary}`, recommendation.primaryPath),
    ...simulation.revisions.slice(-3).map((revision) => trace(`revision-${revision.id}`, "operator-override", "Operator architecture decision", revision.summary, revision.targetId)),
    ...(scenario ? [trace("simulation", "simulation-finding", "Simulated troubleshooting evidence", `${scenario.title}; validation is ${simulation.validationOutcome.result.replaceAll("-", " ")}.`, scenario.id)] : latestIncident ? [trace("simulation-archived", "simulation-finding", "Archived simulated troubleshooting evidence", `${latestIncident.simulatedFailure}; ${latestIncident.validationPerformed}.`)] : []),
  ];
  const direction = audienceDirection(audience, recommendation.title, recommendation.summary, customerManaged, effectiveConfidence);
  const base: Omit<ExecutiveSummaryModel, "markdown" | "plainText"> = {
    generatedAt: new Date().toISOString(), audience, fictionalCustomer: company, syntheticLabel: "Synthetic guided scenario — not customer data", customerObjective: objective, currentEnvironment,
    recommendedDirection: direction,
    deepgramCapabilities: capabilities.map((capability) => `${capability.displayName}${capability.documentationStatus === "verified" ? "" : " — verification needed"}`).slice(0, 7),
    customerManagedComponents: customerManaged,
    integrationBoundaries,
    expectedImpactHypotheses: impacts,
    keyRisks: risks.length ? risks : ["No blocking risk is currently recorded; production assumptions still require validation."],
    decisionRequired: decisions,
    confidence: effectiveConfidence,
    confidenceReason: `${packageResult.confidenceReason} ${handoff.questionClosures.length} open-question resolution(s) are recorded; ${openGaps.length} generated gap(s) remain open.`,
    selectedMitigation,
    validationResult: simulation.validationOutcome.result === "not-run" ? latestIncident?.validationPerformed : `${simulation.validationOutcome.result.replaceAll("-", " ")}: ${simulation.validationOutcome.validationPerformed}`,
    traceability,
  };
  const markdown = executiveMarkdown(base);
  return { ...base, markdown, plainText: markdown.replace(/^#+\s*/gm, "").replace(/^- /gm, "• ").replace(/\*\*/g, "") };
}

export function deriveTechnicalHandoff(session: SessionLike, includeOperatorNotes = session.handoffState?.includeOperatorNotesInExport ?? false): TechnicalHandoffModel {
  const recommendation = recommendArchitecture(session);
  const packageResult = recommendPackage(session);
  const simulation = session.architectureSimulation ?? createInitialSimulationState();
  const architecture = applyArchitectureRevisions(buildGeneratedCanvasSnapshot(session), simulation.revisions);
  const items: TechnicalHandoffItem[] = [];
  architecture.nodes.forEach((node) => items.push({
    id: `node-${node.id}`, category: "component", item: node.displayName,
    value: [node.vendor, owner(node.owner), node.enabled ? "enabled" : "disabled", includeOperatorNotes && node.operatorNotes ? `Note: ${node.operatorNotes}` : ""].filter(Boolean).join(" · "),
    status: node.decisionState === "overridden" ? "overridden" : node.decisionState === "accepted" ? "accepted" : "proposed", owner: owner(node.owner),
    traces: [node.origin === "engine-generated" ? trace(`trace-${node.id}`, "recommendation-rule", "Generated architecture", node.originalRecommendation?.rationale ?? "Mapped from current recommendation.", node.recommendationEvidenceIds[0]) : trace(`trace-${node.id}`, "operator-override", "Operator-added module", "Added during the live architecture workshop.", node.id)],
  }));
  architecture.connections.forEach((connection) => items.push(connectionItem(connection, architecture.nodes, includeOperatorNotes)));
  packageResult.components.forEach((component) => {
    if (["deployment", "operations", "governance"].includes(component.category)) items.push({ id: `evidence-${component.id}`, category: component.category === "deployment" ? "deployment" : component.category === "operations" ? "observability" : "dependency", item: component.architecturalDecision, value: `${component.capabilityOrApproach} · ${component.tradeoffOrLimitation}`, status: component.verificationNeeded ? "unresolved" : "proposed", owner: component.category === "deployment" ? "Joint infrastructure team" : "Customer + Applied Engineering", traces: component.sourceQuestionIds.map((id) => trace(`${component.id}-${id}`, "discovery-answer", "Discovery source", component.customerRequirement, id)) });
  });
  const unresolvedQuestions = packageResult.gaps.filter((gap) => !session.handoffState?.questionClosures.some((closure) => closure.questionId === gap.id)).map((gap) => `${gap.title}: ${gap.nextQuestion}`);
  const requiredCustomerInputs = packageResult.validationPlan.flatMap((test) => [test.evidenceNeeded, ...test.unresolvedPrerequisites]).filter(unique).slice(0, 12);
  const dependencies = items.filter((item) => ["dependency", "deployment", "fallback"].includes(item.category)).map((item) => item.item).filter(unique);
  const revisions = simulation.revisions.map((revision) => ({ id: revision.id, timestamp: revision.createdAt, change: revision.summary, generatedBaseline: revision.before ? JSON.stringify(revision.before) : "No generated value", operatorDecision: revision.after ? JSON.stringify(revision.after) : "Removed from current architecture" }));
  const base = { generatedAt: new Date().toISOString(), architectureName: `${session.scenarioName} proposed voice architecture`, recommendation: `${recommendation.title}. ${recommendation.summary}`, items, revisionHistory: revisions, unresolvedQuestions, requiredCustomerInputs, implementationDependencies: dependencies };
  return { ...base, markdown: technicalMarkdown(base) };
}

export function deriveProofOfConceptPlan(session: SessionLike): ProofOfConceptPlanModel {
  const packageResult = recommendPackage(session);
  const profile = resolveDiscoveryProfile(session);
  const values = profile.values;
  const handoff = normalizeHandoffState(session.handoffState);
  const simulation = session.architectureSimulation ?? createInitialSimulationState();
  const useCase = displayList(list(values["primary-use-case"]), "First production workflow to select");
  const target = text(values["metric-targets"], "Customer-defined target required — establish from the agreed baseline before pass/fail use.");
  const baseline = text(values["baseline-values"], displayList(list(values["baseline"]), "Baseline evidence required"));
  const testScenarios = packageResult.validationPlan.map((test) => ({ id: test.id, title: test.title, method: test.method, reason: test.evidenceNeeded, traces: test.sourceQuestionIds.map((id) => trace(`${test.id}-${id}`, "validation-plan", "Validation source", test.acceptanceCriteria, id)) }));
  const failure = simulation.activeFailure ? getFailureScenario(simulation.activeFailure.scenarioId) : undefined;
  const archivedIncident = simulation.incidentHistory?.at(-1) ?? simulation.incidentSummary;
  if (failure && !testScenarios.some((test) => test.id === `sim-${failure.id}`)) testScenarios.push({ id: `sim-${failure.id}`, title: `Recovery: ${failure.title}`, method: failure.validationTest, reason: `Validate the selected mitigation and ${failure.customerFacingImpact.toLowerCase()}`, traces: [trace(`sim-${failure.id}`, "simulation-finding", "Simulated failure", failure.description, failure.id)] });
  if (!failure && archivedIncident) testScenarios.push({ id: "archived-incident-recovery", title: `Recovery: ${archivedIncident.simulatedFailure}`, method: archivedIncident.validationPerformed, reason: archivedIncident.reportedSymptom, traces: [trace("archived-incident-recovery", "simulation-finding", "Archived simulated incident", archivedIncident.leadingHypothesis)] });
  const generatedCriteria = acceptanceCriteria(values, target, baseline, failure?.id);
  const overrideMap = new Map(handoff.acceptanceCriteriaOverrides.map((criterion) => [criterion.id, criterion]));
  const criteria = generatedCriteria.map((criterion) => overrideMap.get(criterion.id) ?? criterion);
  handoff.acceptanceCriteriaOverrides.filter((item) => !generatedCriteria.some((criterion) => criterion.id === item.id)).forEach((item) => criteria.push(item));
  const prerequisites = packageResult.validationPlan.flatMap((test) => test.unresolvedPrerequisites).filter(unique);
  const base = {
    generatedAt: new Date().toISOString(),
    objective: `Determine whether the recommended starting architecture can improve ${displayList(list(values["business-outcome"]), "the selected customer outcome")} for ${useCase} while meeting customer-defined quality, latency, recovery, and governance gates.`,
    scope: {
      useCase,
      languages: displayList(list(values["languages"]), "Languages to confirm"),
      channel: `${displayList(list(values["audio-direction"]), "Call direction to confirm")} · ${display(values["processing-mode"], "processing mode to confirm")}`,
      integrationPath: `${displayList(list(values["media-path"]), "media path to confirm")} → ${text(values["tools-and-apis"], "business integrations to confirm")}`,
      callType: displayList(list(values["workflow"]), "Workflow to select"),
      representativeUsers: "Consented or synthetic callers spanning the agreed languages, acoustic conditions, and customer segments.",
      excludedUseCases: "Any workflow, language, sensitive action, region, or volume not represented in the approved test corpus.",
    },
    inputsRequired: ["Representative consented or synthetic call recordings", "Live synthetic test traffic where needed", ...(list(values["speech-details"]).length ? ["Domain terminology and critical entity list"] : []), "Current provider baseline metrics", text(values["concurrency"], "Expected average and peak concurrency — unresolved"), "Approved deployment and data-retention requirements", "Sandbox credentials supplied through an approved secret process, never this Studio", text(values["tools-and-apis"], "Test CRM or business-system sandbox")],
    testScenarios,
    acceptanceCriteria: criteria,
    prerequisites,
    exitCriteria: ["Proceed to production design", "Extend the proof of concept for missing evidence", "Revise the architecture", "Request customer remediation", "Escalate a product or commercial question", "Stop because a non-negotiable requirement is unmet"],
  };
  return { ...base, markdown: pocMarkdown(base) };
}

export function deriveDecisionRegister(session: SessionLike): DecisionRegisterEntry[] {
  const recommendation = recommendArchitecture(session);
  const simulation = session.architectureSimulation ?? createInitialSimulationState();
  const generated: DecisionRegisterEntry[] = [{ id: `generated-path-${recommendation.primaryPath}`, decision: `Use ${recommendation.title.toLowerCase()} as the recommended starting direction.`, status: recommendation.confidence === "low" ? "needs-validation" : "proposed", rationale: recommendation.summary, alternativesConsidered: recommendation.alternativesConsidered.map((item) => `${item.path}: ${item.reason}`), tradeoff: recommendation.tradeoffs[0] ?? "Tradeoffs require representative validation.", evidence: recommendation.influences.map((item) => `${item.questionId}: ${item.answer}`), decisionOwner: "Joint customer and Applied Engineering team (synthetic)", timestamp: session.updatedAt, affectedComponentIds: [], reversibility: "moderate", reviewTrigger: recommendation.changeTriggers[0] ?? "New discovery evidence changes the recommendation.", synthetic: true, origin: "generated" }];
  simulation.revisions.forEach((revision) => generated.push({ id: `revision-decision-${revision.id}`, decision: revision.summary, status: revision.kind.includes("removed") ? "rejected" : "proposed", rationale: "Operator decision captured separately from the engine-generated baseline.", alternativesConsidered: ["Restore the latest generated recommendation"], tradeoff: "The operator gains explicit control but owns validation of the divergence.", evidence: [revision.before ? `Generated: ${JSON.stringify(revision.before)}` : "No generated value", revision.after ? `Current: ${JSON.stringify(revision.after)}` : "Current: removed"], decisionOwner: "Workshop operator (synthetic)", timestamp: revision.createdAt, affectedComponentIds: [revision.targetId], reversibility: "easy", reviewTrigger: "Discovery changes or validation contradicts this operator decision.", synthetic: true, origin: "generated" }));
  const scenario = simulation.activeFailure ? getFailureScenario(simulation.activeFailure.scenarioId) : undefined;
  const mitigation = scenario?.mitigationOptions.find((item) => simulation.mitigationDecisions.some((decision) => decision.mitigationId === item.id && decision.state === "selected"));
  if (mitigation) generated.push({ id: `mitigation-decision-${mitigation.id}`, decision: mitigation.action, status: simulation.validationOutcome.result === "resolved" || simulation.validationOutcome.result === "mitigated" ? "accepted" : "needs-validation", rationale: mitigation.expectedBenefit, alternativesConsidered: scenario!.mitigationOptions.filter((item) => item.id !== mitigation.id).map((item) => item.action), tradeoff: mitigation.tradeoff, evidence: [simulation.activeFailure?.customerReportedSymptoms ?? scenario!.description, simulation.validationOutcome.evidence || "Recovery evidence not yet recorded"], decisionOwner: mitigation.implementationOwner, timestamp: simulation.activeFailure?.startedAt ?? session.updatedAt, affectedComponentIds: simulation.activeFailure?.originKind === "node" ? [simulation.activeFailure.originId] : [], reversibility: mitigation.complexity === "Small" ? "easy" : "moderate", reviewTrigger: mitigation.validationStep, synthetic: true, origin: "generated" });
  const archivedIncident = simulation.incidentHistory?.at(-1) ?? simulation.incidentSummary;
  if (!mitigation && archivedIncident) generated.push({ id: `archived-mitigation-${archivedIncident.generatedAt}`, decision: archivedIncident.immediateMitigation, status: "needs-validation", rationale: `Mitigation selected during the simulated ${archivedIncident.simulatedFailure.toLowerCase()} incident.`, alternativesConsidered: [archivedIncident.longTermRecommendation], tradeoff: "Production effect remains a hypothesis until the customer acceptance test passes.", evidence: archivedIncident.evidenceCollected, decisionOwner: archivedIncident.ownersAndNextActions[0] ?? "Joint owner (synthetic)", timestamp: archivedIncident.generatedAt, affectedComponentIds: [], reversibility: "moderate", reviewTrigger: archivedIncident.validationPerformed, synthetic: true, origin: "generated" });
  session.decisions.forEach((decision) => generated.push({ id: `legacy-${decision.id}`, decision: decision.text, status: "proposed", rationale: decision.rationale, alternativesConsidered: [], tradeoff: "Tradeoff not yet captured in the legacy decision note.", evidence: [], decisionOwner: "Workshop operator (synthetic)", timestamp: decision.createdAt, affectedComponentIds: [], reversibility: "moderate", reviewTrigger: "Review before pilot commitment.", synthetic: true, origin: "manual" }));
  const handoff = normalizeHandoffState(session.handoffState);
  return [...generated.map((decision) => ({ ...decision, ...(handoff.decisionOverrides[decision.id] ?? {}), id: decision.id })), ...handoff.manualDecisions];
}

export function deriveActionRegister(session: SessionLike, decisions = deriveDecisionRegister(session)): ActionRegisterEntry[] {
  const packageResult = recommendPackage(session);
  const handoff = normalizeHandoffState(session.handoffState);
  const actions: ActionRegisterEntry[] = session.nextSteps.map((step) => ({ id: `next-${step.id}`, action: step.action, owner: `${step.owner} (synthetic)`, stakeholderGroup: "Joint", timing: step.timing, dependency: "Relevant discovery and validation inputs", status: step.completed ? "complete" : "not-started", completionEvidence: step.completed ? "Marked complete in the live session" : "Evidence required", synthetic: true, origin: "generated" }));
  packageResult.gaps.filter((gap) => !handoff.questionClosures.some((closure) => closure.questionId === gap.id)).forEach((gap) => actions.push({ id: `gap-action-${gap.id}`, action: gap.nextQuestion, owner: gap.id.includes("privacy") || gap.id.includes("retention") ? "Customer Security lead (synthetic)" : gap.id.includes("concurrency") || gap.id.includes("volume") ? "Customer Voice Platform lead (synthetic)" : "Joint discovery owner (synthetic)", stakeholderGroup: gap.id.includes("privacy") || gap.id.includes("retention") ? "Security" : gap.id.includes("concurrency") || gap.id.includes("volume") ? "Infrastructure" : "Joint", timing: "Before POC test execution", dependency: gap.workingAssumption, status: "not-started", relatedDecisionId: decisions[0]?.id, relatedOpenQuestionId: gap.id, completionEvidence: `Recorded customer answer or approved ${gap.category} resolution`, synthetic: true, origin: "generated" }));
  return [...actions.map((action) => ({ ...action, ...(handoff.actionOverrides[action.id] ?? {}), id: action.id })), ...handoff.manualActions].filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index);
}

export function deriveSessionNarrative(session: SessionLike): SessionNarrativeModel {
  const summary = deriveExecutiveSummary(session, "executive");
  const recommendation = recommendArchitecture(session);
  const simulation = session.architectureSimulation ?? createInitialSimulationState();
  const scenario = simulation.activeFailure ? getFailureScenario(simulation.activeFailure.scenarioId) : undefined;
  const latestIncident = simulation.incidentHistory?.at(-1) ?? simulation.incidentSummary;
  const decisions = deriveDecisionRegister(session);
  const actions = deriveActionRegister(session, decisions);
  const milestones: SessionNarrativeModel["milestones"] = [
    { timestamp: session.createdAt, title: "Fictional customer framed", detail: summary.customerObjective, source: "discovery-answer" as const },
    ...session.recommendationHistory.map((entry) => ({ timestamp: entry.createdAt, title: entry.title, detail: entry.reason, source: "recommendation-rule" as const })),
    ...simulation.revisions.map((revision) => ({ timestamp: revision.createdAt, title: "Architecture adapted", detail: revision.summary, source: "operator-override" as const })),
    ...(scenario && simulation.activeFailure ? [{ timestamp: simulation.activeFailure.startedAt, title: `Simulated incident: ${scenario.title}`, detail: simulation.activeFailure.customerReportedSymptoms || scenario.description, source: "simulation-finding" as const }] : []),
  ].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const selectedDecision = decisions.find((decision) => decision.status === "accepted" || decision.status === "needs-validation") ?? decisions[0];
  const nextAction = actions.find((action) => action.status !== "complete");
  const paragraphs = [
    `The engagement began with ${summary.fictionalCustomer}'s objective: ${summary.customerObjective}`,
    `Discovery produced ${recommendation.title.toLowerCase()} as the current best-fit direction. The architecture retained customer-owned systems and kept unresolved assumptions visible instead of treating the recommendation as final.`,
    simulation.revisions.length ? `During the workshop, the operator recorded ${simulation.revisions.length} architecture revision(s). Each remains distinguishable from and restorable to the generated baseline.` : "The architecture remained aligned with the generated baseline during this session.",
    scenario ? `A simulated ${scenario.title.toLowerCase()} incident was introduced. The team separated the reported symptom from candidate causes, selected diagnostic boundaries, and recorded the recovery result as ${simulation.validationOutcome.result.replaceAll("-", " ")}.` : latestIncident ? `A simulated ${latestIncident.simulatedFailure.toLowerCase()} incident was completed and archived. The recorded validation was: ${latestIncident.validationPerformed}.` : "No troubleshooting simulation was completed in this session.",
    `The current decision is ${selectedDecision?.decision ?? "to define the POC decision gate"} ${nextAction ? `The next commitment is: ${nextAction.action} — ${nextAction.owner}, ${nextAction.timing}.` : "No next action has been assigned yet."}`,
  ];
  return { generatedAt: new Date().toISOString(), paragraphs, milestones };
}

export function deriveSessionReport(session: SessionLike, audience = session.handoffState?.audience ?? "executive", includeOperatorNotes = false): SessionReportModel {
  const executiveSummary = deriveExecutiveSummary(session, audience);
  const technicalHandoff = deriveTechnicalHandoff(session, includeOperatorNotes);
  const pocPlan = deriveProofOfConceptPlan(session);
  const decisions = deriveDecisionRegister(session);
  const actions = deriveActionRegister(session, decisions);
  const narrative = deriveSessionNarrative(session);
  return { generatedAt: new Date().toISOString(), executiveSummary, technicalHandoff, pocPlan, decisions, actions, narrative, assumptionsAndQuestions: [...executiveSummary.keyRisks, ...technicalHandoff.unresolvedQuestions].filter(unique), risks: executiveSummary.keyRisks, disclaimer: "Synthetic guided scenario. Prototype guidance only; technical, security, legal, product-availability, and commercial validation are required. No pricing, compliance, or performance commitment is made." };
}

function acceptanceCriteria(values: Record<string, StudioAnswerValue>, target: string, baseline: string, failureId?: string): PocAcceptanceCriterion[] {
  const metrics = [
    ["word-error-rate", "Word error rate", "Human-reviewed reference transcripts; report slices, not only aggregate."],
    ["keyterm-accuracy", "Entity / keyterm accuracy", "Score domain terms, product names, numbers, and identifiers separately."],
    ["task-completion", "Task completion", "Run bounded customer tasks with expected outcomes and safe failures."],
    ["turn-latency", "Turn / end-of-turn latency", "Timestamp last caller speech, turn event, and orchestration start."],
    ["first-transcript", "First transcript latency", "Timestamp first audio and first usable transcript event."],
    ["response-start", "Response start latency", "Timestamp last caller speech through first audible playback."],
    ["tts-startup", "TTS startup latency", "Timestamp response text, first synthesized audio, and playback start."],
    ["interruption-success", "Interruption success", "Test barge-in, false starts, playback cancellation, and recovery."],
    ["recovery-success", "Recovery / fallback success", "Inject disconnect, tool, and provider failures; verify bounded recovery."],
    ["failure-rate", "Failure rate", "Classify failures by first failing boundary over the agreed sample."],
    ["cost-interaction", "Cost per interaction", "Measure observed unit consumption; do not extrapolate without volume."],
    ["customer-repetition", "Customer repetition rate", "Label repeated requests caused by recognition, latency, or recovery."],
  ] as const;
  const relevant = metrics.filter(([id]) => {
    if (["word-error-rate", "keyterm-accuracy", "failure-rate"].includes(id)) return true;
    if (["turn-latency", "response-start", "tts-startup", "interruption-success", "task-completion"].includes(id)) return list(values["primary-use-case"]).includes("voice-agent");
    if (id === "first-transcript") return values["processing-mode"] !== "prerecorded";
    if (id === "recovery-success") return Boolean(failureId) || list(values["failure-behavior"]).length > 0;
    return list(values["primary-metrics"]).some((metric) => id.includes(metric)) || id === "customer-repetition";
  });
  return relevant.map(([id, metric, method]) => ({ id: `criterion-${id}`, metric, target, comparisonBaseline: baseline, measurementMethod: method, sampleSize: "Customer-defined representative sample required", owner: "Joint Data / Evaluation owner (synthetic)", status: text(values["metric-targets"], "") ? "draft" : "placeholder", notes: "No unsupported benchmark is prepopulated.", sourceIds: ["metric-targets", "baseline", id] }));
}

function impactHypotheses(values: Record<string, StudioAnswerValue>, validationResult: string, mitigation: string | undefined, audience: HandoffAudienceMode) {
  const base = [
    ...(list(values["experience-problem"]).includes("latency") ? ["Lower perceived response latency if stage measurements identify and remove the actual bottleneck."] : []),
    ...(list(values["speech-details"]).includes("domain-terms") ? ["Improve recognition of critical terminology if representative prompting and held-out evaluation support it."] : []),
    ...(list(values["turn-taking"]).length ? ["Make interruption and turn handling more reliable if audio, turn events, cancellation, and playback are validated together."] : []),
    "Improve operational visibility and reduce recovery time if content-safe correlation spans the complete voice path.",
    "Reduce customer repetition if speech, downstream latency, and failure-recovery evidence meet the agreed gate.",
  ];
  if (mitigation) base.push(`Test whether the selected mitigation—${mitigation}—reduces the simulated impact without violating guardrails.`);
  if (validationResult !== "not-run") base.push(`Current workshop validation state is ${validationResult.replaceAll("-", " ")}; production evidence is still required.`);
  if (audience === "technical") return base.map((item) => item.replace("Improve operational visibility", "Improve boundary-level observability"));
  if (audience === "customer-success") return base.map((item) => `${item} Track this as an adoption or rollout milestone.`);
  return base;
}

function audienceDirection(audience: HandoffAudienceMode, title: string, summary: string, customerManaged: string[], confidence: RecommendationConfidence) {
  if (audience === "technical") return `${title} is the proposed topology. ${summary} Preserve ${customerManaged.join(", ") || "the customer-owned control plane"}, instrument every major boundary, and validate protocols, recovery, and deployment assumptions before the pilot. Confidence is ${confidence}.`;
  if (audience === "customer-success") return `${title} is the adoption starting point. ${summary} Stage enablement around a representative evaluation, stakeholder acceptance gates, a limited pilot, and ongoing success measurements. Confidence is ${confidence}.`;
  return `${title} is the recommended direction. ${summary} It retains the major customer-owned systems, focuses investment on the speech and voice-control boundary, and uses a gated proof of concept before production commitment. Confidence is ${confidence}.`;
}

function decisionRequirements(values: Record<string, StudioAnswerValue>, gapIds: string[], audience: HandoffAudienceMode) {
  const decisions = [
    "Approve a representative proof of concept with named business, technical, and security owners.",
    ...(gapIds.some((id) => id.includes("concurrency") || id.includes("volume")) ? ["Provide average and peak concurrency plus expected usage before load and operating-model decisions."] : []),
    ...(gapIds.some((id) => id.includes("target")) || !text(values["metric-targets"], "") ? ["Define latency, task-success, quality, and guardrail thresholds with measurement boundaries."] : []),
    ...(gapIds.some((id) => id.includes("privacy") || id.includes("retention")) ? ["Confirm deployment, retention, and review constraints with the accountable customer owners."] : []),
    "Select the first production workflow and integration owner if the POC exits successfully.",
  ];
  return audience === "technical" ? decisions.map((item) => item.replace("Approve", "Technically scope")) : audience === "customer-success" ? decisions.map((item) => `${item} Align enablement and adoption milestones.`) : decisions;
}

function effectiveSummaryConfidence(base: RecommendationConfidence, totalGaps: number, openGaps: number, verification: boolean): RecommendationConfidence {
  if (verification && openGaps > 0) return base === "high" ? "moderate" : base;
  if (totalGaps > 0 && openGaps === 0) return base === "low" ? "developing" : base === "developing" ? "moderate" : base;
  return base;
}

function connectionItem(connection: CanvasArchitectureConnection, nodes: Array<{ id: string; displayName: string }>, includeNotes: boolean): TechnicalHandoffItem {
  const details = [connection.protocol, connection.transport, connection.mode, connection.audioEncoding, connection.sampleRate, connection.authenticationType ? `auth: ${connection.authenticationType}` : "authentication: assumption unresolved", connection.region ? `region: ${connection.region}` : "", connection.retryBehavior ? `retry: ${connection.retryBehavior}` : "", connection.timeout ? `timeout: ${connection.timeout}` : "", connection.encryption ? `encryption: ${connection.encryption}` : "", includeNotes && connection.operatorNotes ? `note: ${connection.operatorNotes}` : ""].filter(Boolean).join(" · ");
  return { id: `connection-${connection.id}`, category: "connection", item: `${nodeLabel(nodes, connection.fromNodeId)} → ${nodeLabel(nodes, connection.toNodeId)}`, value: details || connection.flow, status: connection.origin === "manually-added" ? "overridden" : "proposed", owner: connection.ownershipBoundary ?? "Ownership boundary to confirm", traces: [trace(`trace-${connection.id}`, connection.origin === "manually-added" ? "operator-override" : "recommendation-rule", "Architecture flow", `${connection.flow} connection from current canvas.`, connection.id)] };
}

function executiveMarkdown(summary: Omit<ExecutiveSummaryModel, "markdown" | "plainText">) {
  return ["# Executive Summary — Deepgram Voice Architecture Studio", `**${summary.syntheticLabel}**`, `Audience: ${summary.audience.replaceAll("-", " ")} · Confidence: ${summary.confidence}`, "## Customer objective", summary.customerObjective, section("Current environment", summary.currentEnvironment), "## Recommended direction", summary.recommendedDirection, section("Deepgram capabilities to evaluate", summary.deepgramCapabilities), section("Customer-managed components retained", summary.customerManagedComponents), section("Expected impact — hypotheses to validate", summary.expectedImpactHypotheses), section("Key risks", summary.keyRisks), section("Decision required", summary.decisionRequired), summary.selectedMitigation ? `## Selected mitigation\n\n${summary.selectedMitigation}` : "", summary.validationResult ? `## Validation state\n\n${summary.validationResult}` : "", "Prototype guidance only. Technical and commercial validation required; no pricing, performance, legal, or compliance commitment."].filter(Boolean).join("\n\n");
}

function technicalMarkdown(handoff: Omit<TechnicalHandoffModel, "markdown">) { return ["# Technical Handoff", "**Synthetic guided scenario**", handoff.recommendation, section("Components, boundaries, and dependencies", handoff.items.map((item) => `${item.item} — ${item.value} [${item.status}; ${item.owner}] Sources: ${item.traces.map((traceItem) => `${traceItem.source}: ${traceItem.label}`).join("; ")}`)), section("Architecture revision history", handoff.revisionHistory.map((item) => `${item.timestamp}: ${item.change}`)), section("Required customer inputs", handoff.requiredCustomerInputs), section("Implementation dependencies", handoff.implementationDependencies), section("Unresolved technical questions", handoff.unresolvedQuestions)].join("\n\n"); }
function pocMarkdown(plan: Omit<ProofOfConceptPlanModel, "markdown">) { return ["# Proof-of-Concept Plan", "**Synthetic guided scenario; unknown targets remain explicit placeholders.**", "## Objective", plan.objective, "## Scope", ...Object.entries(plan.scope).map(([key, value]) => `- **${pretty(key)}:** ${value}`), section("Inputs required", plan.inputsRequired), section("Test scenarios", plan.testScenarios.map((test) => `${test.title}: ${test.method}`)), section("Acceptance criteria", plan.acceptanceCriteria.map((criterion) => `${criterion.metric} — Target: ${criterion.target}; Baseline: ${criterion.comparisonBaseline}; Method: ${criterion.measurementMethod}; Sample: ${criterion.sampleSize}; Owner: ${criterion.owner}; Status: ${criterion.status}`)), section("Unresolved prerequisites", plan.prerequisites), section("Exit criteria", plan.exitCriteria)].join("\n\n"); }
function section(title: string, items: string[]) { return `## ${title}\n\n${items.length ? items.map((item) => `- ${item}`).join("\n") : "- None recorded"}`; }
function trace(id: string, source: HandoffTrace["source"], label: string, detail: string, sourceId?: string): HandoffTrace { return { id, source, label, detail, sourceId }; }
function list(value: StudioAnswerValue | undefined): string[] { return Array.isArray(value) ? value.map(String) : value === undefined || value === "" ? [] : [String(value)]; }
function text(value: StudioAnswerValue | undefined, fallback: string) { return list(value).join(", ") || fallback; }
function display(value: StudioAnswerValue | undefined, fallback: string) { return pretty(text(value, fallback)); }
function displayList(values: string[], fallback: string) { return values.length ? values.map(pretty).join(", ") : fallback; }
function pretty(value: string) { return value.replaceAll("-", " ").replace(/\b\w/g, (character) => character.toUpperCase()); }
function owner(value: string) { return value.replaceAll("-", " ").replace(/\b\w/g, (character) => character.toUpperCase()); }
function nodeLabel(nodes: Array<{ id: string; displayName: string }>, id: string) { return nodes.find((node) => node.id === id)?.displayName ?? id; }
function unique(value: string, index: number, items: string[]) { return Boolean(value) && items.indexOf(value) === index; }
