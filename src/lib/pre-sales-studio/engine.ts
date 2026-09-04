import { DATASET_SEGMENT_CATALOG, PRE_SALES_CHALLENGES, PRODUCTION_HANDOFF_CHECKLIST, SUCCESS_CRITERIA_CATALOG } from "@/data/pre-sales-studio-catalog";
import { getPreSalesDiscoveryGroup } from "@/data/pre-sales-discovery";
import { getCustomerPattern } from "@/data/pre-sales-customer-patterns";
import { getDeepgramEndpoint } from "@/lib/deepgram-endpoint-registry";
import type {
  ApiLabPresetRecommendation, ArchitectureBlueprint, ArchitectureEdge, ArchitectureNode, BusinessCaseInputs, BusinessCaseResult, Challenge, CustomerPatternId,
  DatasetSegment, DemoResult, DiscoveryFieldKey, DiscoveryGap, DiscoveryInsight, DiscoveryQuestion, DiscoveryState, ExecutiveReadout,
  DiscoveryQuickSelectId, OpportunityState, PocPlan, PreSalesExport, SolutionRecommendation, SuccessCriterion, SuccessCriterionId, TechnicalReadout,
} from "@/types/pre-sales-studio";

export const EMPTY_DISCOVERY: DiscoveryState = {
  industry: "", customerType: "", businessOutcomePriorities: [],
  desiredBusinessOutcome: "", currentWorkflow: "", reasonNow: "", launchDeadline: "", currentProblemCost: "", executiveSponsor: "", buyingProcess: "",
  workloadMode: "", interactionModel: "", trafficDirection: "", products: [], monthlyAudioMinutes: "", monthlyCallCount: "", averageCallDuration: "", normalConcurrency: "", peakConcurrency: "", expectedGrowth: "", concurrencyScale: "", latencySensitivity: "", audioSources: [], integrationChannels: [], audioEnvironments: [], codecSampleRate: "", channelMode: "", backgroundNoise: "",
  languages: "", languageProfiles: [], accents: "", specialistTerminology: "", alphanumericIdentifiers: "", codeSwitching: "", riskyVocabulary: "",
  deployment: "", residencyNeeds: [], geographicResidency: "", retentionConstraints: "", sensitiveData: "", authenticationRequirements: "", compliancePosture: "", complianceExpectations: [], retentionExpectation: "",
  incumbentProvider: "", existingProviderCategories: [], migrationPosture: "", telephonyProvider: "", contactCenterPlatform: "", llmProvider: "", crm: "", dataWarehouse: "", orchestrationLayer: "", observabilityTools: "", engineeringStack: "",
  currentWer: "", currentLatency: "", currentCost: "", containment: "", conversion: "", abandonment: "", qaCoverage: "", knownFailurePatterns: "", evaluationCriteria: [], pocSuccessCriteria: [], implementationTimeline: "", implementationOwners: [], quickNotes: {},
};

export const EMPTY_BUSINESS_CASE_INPUTS: BusinessCaseInputs = {
  monthlyCallCount: "", averageCallDuration: "", currentTranscriptionCost: "", proposedTranscriptionCost: "", humanQaPercent: "", qaReviewMinutes: "", loadedLaborCost: "", currentContainment: "", proposedContainment: "", transferRate: "", averageHandlingMinutes: "", abandonment: "", currentConversion: "", proposedConversion: "", averageTransactionValue: "", implementationCost: "",
};

const REQUIRED_DISCOVERY: Array<{ field: DiscoveryFieldKey; label: string; weight: number; question: string; why: string; assumption: string; impact: string }> = [
  { field: "industry", label: "industry context", weight: 3, question: "Which operating environment and risk context best describes this customer?", why: "Industry context changes the corpus, terminology, review path, and buyer risk.", assumption: "Treat the selected public pattern as illustrative context only.", impact: "Evaluation slices and governance questions may change." },
  { field: "customerType", label: "customer operating model", weight: 3, question: "Is the customer an end user, platform, CCaaS provider, integrator, or regulated operator?", why: "The operating model clarifies component and implementation ownership.", assumption: "Do not assume who operates the production voice path.", impact: "Ownership boundaries and handoff responsibilities may change." },
  { field: "desiredBusinessOutcome", label: "business outcome", weight: 14, question: "Which customer or business outcome must this project change?", why: "It prevents a model metric from becoming the goal by default.", assumption: "Assume the selected pattern's primary outcome until the buyer confirms it.", impact: "POC metrics, readout, and scope may change." },
  { field: "currentWorkflow", label: "current workflow", weight: 8, question: "Walk me through the current workflow and first production use case.", why: "It defines the integration boundary and what can remain in place.", assumption: "Assume the pattern's public workflow is only a starting point.", impact: "Architecture nodes and retained components may change." },
  { field: "interactionModel", label: "interaction model", weight: 7, question: "Is this human-to-human, human-to-agent, agent-to-agent, or still undecided?", why: "The speaker relationship changes turn-taking, orchestration, TTS, and safe handoff needs.", assumption: "Do not assume a managed agent when the operating model is unclear.", impact: "Conversational components and ownership boundaries may change." },
  { field: "trafficDirection", label: "traffic direction", weight: 4, question: "Is the first production traffic inbound, outbound, internal, or mixed?", why: "Direction changes routing, consent, escalation, and session-control assumptions.", assumption: "Treat direction-specific controls as unresolved.", impact: "Telephony, workflow, and governance nodes may change." },
  { field: "workloadMode", label: "streaming or prerecorded mode", weight: 10, question: "Is the first workload streaming, prerecorded, or both?", why: "Streaming and batch have different transports, features, and evaluation methods.", assumption: "Assume streaming only when the workflow is conversational.", impact: "STT path, latency metrics, and retry strategy may change." },
  { field: "products", label: "speech capabilities", weight: 8, question: "Does the first scope need STT, TTS, managed voice-agent orchestration, or a combination?", why: "It avoids recommending components the customer does not need.", assumption: "Assume speech components remain composable until orchestration preference is known.", impact: "Deepgram components and customer ownership may change." },
  { field: "peakConcurrency", label: "peak concurrency", weight: 9, question: "What peak concurrent-session range must the first release sustain?", why: "Capacity, rate limits, deployment, and tail latency depend on the traffic shape.", assumption: "Treat capacity as unknown and require a load gate.", impact: "Deployment sizing, fallback, and POC load plan may change." },
  { field: "languages", label: "language mix", weight: 8, question: "Which languages, dialects, and code-switching pairs carry the first production volume?", why: "Language, model, features, and dataset coverage must be validated together.", assumption: "Validate the pattern's implied language needs rather than assuming coverage.", impact: "Model configuration, routing, and evaluation slices may change." },
  { field: "audioSources", label: "media and integration boundary", weight: 6, question: "Does audio enter through browser, telephony, CCaaS, mobile, server, embedded, or uploaded-media paths?", why: "The boundary determines transport, encoding, authentication, reconnect, and ownership.", assumption: "Treat the media path as unresolved until the customer confirms it.", impact: "Transport, preprocessing, and customer-owned nodes may change." },
  { field: "backgroundNoise", label: "production audio conditions", weight: 4, question: "Which noisy, bandwidth-limited, overlapping, or device-specific conditions must the POC reproduce?", why: "Clean audio can hide the production failure the customer needs to solve.", assumption: "Require representative edge cases in the evaluation corpus.", impact: "Preprocessing, dataset, and fallback choices may change." },
  { field: "deployment", label: "deployment model", weight: 10, question: "Is shared cloud acceptable, or is dedicated, VPC, self-hosted, on-premises, or air-gapped deployment required?", why: "It changes infrastructure, operations, commercial validation, and the data boundary.", assumption: "Assume shared cloud only for exploration, not production approval.", impact: "The complete deployment boundary may change." },
  { field: "retentionConstraints", label: "retention boundary", weight: 6, question: "What may be retained for audio, transcripts, logs, and evaluation artifacts?", why: "Redaction does not replace source-audio and log governance.", assumption: "Persist no customer audio in this prototype.", impact: "Logging, storage, redaction, and audit architecture may change." },
  { field: "geographicResidency", label: "residency boundary", weight: 4, question: "Where may audio, transcripts, logs, and evaluation artifacts be processed?", why: "A region selector does not by itself define the complete data path.", assumption: "Treat residency as requiring technical and customer validation.", impact: "Regions, deployment, support access, and storage may change." },
  { field: "compliancePosture", label: "governance review", weight: 4, question: "Which privacy, security, or regulated-data reviews must the technical plan support?", why: "The solution must expose controls without making a legal conclusion.", assumption: "No compliance determination is made by this Studio.", impact: "Redaction, access, logging, and deployment gates may change." },
  { field: "orchestrationLayer", label: "orchestration ownership", weight: 7, question: "Which orchestration, LLM, and tool layers must the customer retain?", why: "This distinguishes managed-agent and composable architectures.", assumption: "Retain existing orchestration when it is already strategic.", impact: "Voice Agent API versus component recommendations may change." },
  { field: "migrationPosture", label: "migration posture", weight: 5, question: "Should the first evaluation retain, augment, run beside, or replace the incumbent speech path?", why: "The answer defines the safest integration boundary and rollback path.", assumption: "Assume a reversible parallel evaluation until the customer decides.", impact: "Adapters, fallback, cutover, and retained components may change." },
  { field: "knownFailurePatterns", label: "failure evidence", weight: 6, question: "Which current failures most damage task completion or customer trust?", why: "The evaluation should reproduce the customer problem, not a clean demo.", assumption: "Use pattern-specific risks as illustrative hypotheses only.", impact: "Dataset slices, observability, and fallback tests may change." },
  { field: "currentLatency", label: "baseline latency", weight: 5, question: "What is the current latency, and which start and stop events define it?", why: "A latency number without boundaries cannot guide architecture.", assumption: "Leave baseline and target blank until instrumentation is agreed.", impact: "Optimization priorities and acceptance criteria may change." },
  { field: "currentWer", label: "baseline accuracy", weight: 4, question: "Do you have a human-reviewed baseline for overall and business-critical errors?", why: "Relative improvement requires a comparable reference.", assumption: "Do not invent an incumbent baseline.", impact: "POC readiness and confidence may change." },
  { field: "observabilityTools", label: "observability path", weight: 5, question: "Which system owns correlated media, speech, orchestration, and business outcome telemetry?", why: "Without correlation, the team cannot locate a slow or failed boundary.", assumption: "Add a POC trace even if the production tool is undecided.", impact: "Operational nodes and diagnostic confidence may change." },
  { field: "pocSuccessCriteria", label: "POC decision gate", weight: 8, question: "Which measurable result would justify proceeding, revising, or stopping?", why: "A POC without an agreed decision gate becomes an open-ended demonstration.", assumption: "Leave numeric thresholds blank until the customer adopts them.", impact: "Success criteria, evaluation plan, and executive decision may change." },
  { field: "evaluationCriteria", label: "evaluation evidence", weight: 6, question: "Which accuracy, latency, turn-taking, reliability, scale, cost, and governance evidence should determine fit?", why: "The evaluation needs explicit dimensions before it can define targets.", assumption: "Use a representative multi-metric plan rather than a single average.", impact: "POC criteria, dataset slices, and risk reporting may change." },
  { field: "implementationTimeline", label: "decision timeline", weight: 4, question: "What decision, pilot, or launch window should shape the first scope?", why: "Timing changes how narrow the first vertical slice must be.", assumption: "Do not promise a date before dependency owners agree.", impact: "POC scope, milestones, and delivery risk may change." },
  { field: "implementationOwners", label: "implementation ownership", weight: 4, question: "Who owns media, application integration, security review, evaluation, and launch?", why: "Unowned dependencies are a delivery risk even when technical fit is strong.", assumption: "Treat ownership as joint and unresolved until named.", impact: "Timeline, actions, and handoff readiness may change." },
];

export function createOpportunity(patternId: CustomerPatternId, now = new Date().toISOString(), id = `opp-${Date.now().toString(36)}`): OpportunityState {
  const pattern = getCustomerPattern(patternId);
  const discovery = { ...EMPTY_DISCOVERY, ...(pattern?.seed ?? {}) };
  const suggested = new Set(pattern?.suggestedMetricIds ?? ["overall-wer", "p95-latency", "error-rate"]);
  const criteria = SUCCESS_CRITERIA_CATALOG.filter((item) => suggested.has(item.id)).map((item) => structuredClone(item));
  const selectedDatasetIds = datasetIdsForDiscovery(discovery);
  return synchronizeDiscoveryArtifacts({
    schemaVersion: 1, id, name: pattern?.name.replace(" Pattern", "") ?? "Custom Opportunity", patternId, createdAt: now, updatedAt: now, activeStage: "discovery", discovery,
    activeChallengeIds: [], criteria, datasetSegments: DATASET_SEGMENT_CATALOG.map((item) => ({ ...item, selected: selectedDatasetIds.has(item.id), sampleCount: selectedDatasetIds.has(item.id) ? 10 : 0 })),
    businessCaseInputs: { ...EMPTY_BUSINESS_CASE_INPUTS, monthlyCallCount: discovery.monthlyCallCount, averageCallDuration: discovery.averageCallDuration },
    productionHandoff: PRODUCTION_HANDOFF_CHECKLIST.map((item) => ({ ...item })), guidedMode: false, guidedFlow: false, guidedStep: 0, persistenceEnabled: false, discoveryMode: "fast",
  });
}

export function updateOpportunityDiscovery(opportunity: OpportunityState, field: DiscoveryFieldKey, value: DiscoveryState[DiscoveryFieldKey], now = new Date().toISOString()) {
  const discovery = { ...opportunity.discovery, [field]: value } as DiscoveryState;
  return { ...opportunity, discovery, updatedAt: now };
}

export function updateOpportunityQuickSelection(opportunity: OpportunityState, groupId: DiscoveryQuickSelectId, optionValue: string, now = new Date().toISOString()) {
  const group = getPreSalesDiscoveryGroup(groupId);
  const current = opportunity.discovery[group.field];
  let nextValue: string | string[];
  if (group.selection === "multi") {
    const selected = Array.isArray(current) ? current : [];
    if (optionValue === "not-sure") nextValue = selected.includes(optionValue) ? [] : [optionValue];
    else nextValue = selected.includes(optionValue) ? selected.filter((item) => item !== optionValue) : [...selected.filter((item) => item !== "not-sure"), optionValue];
  } else nextValue = current === optionValue ? "" : optionValue;
  const discovery = { ...opportunity.discovery, [group.field]: nextValue } as DiscoveryState;
  return synchronizeDiscoveryArtifacts({ ...opportunity, discovery, updatedAt: now });
}

export function updateOpportunityQuickNote(opportunity: OpportunityState, groupId: DiscoveryQuickSelectId, note: string, now = new Date().toISOString()) {
  const quickNotes = { ...opportunity.discovery.quickNotes, [groupId]: note };
  return { ...opportunity, discovery: { ...opportunity.discovery, quickNotes }, updatedAt: now };
}

export function computeDiscoveryInsight(opportunity: OpportunityState): DiscoveryInsight {
  const pattern = getCustomerPattern(opportunity.patternId);
  const challenges = activeChallenges(opportunity);
  const known: string[] = [];
  const assumptions: string[] = ["Public-story facts provide context only; unpublished requirements and architecture are illustrative."];
  const unanswered: DiscoveryGap[] = [];
  let earned = 0;
  let possible = 0;

  for (const item of REQUIRED_DISCOVERY) {
    const patternBoost = pattern?.discoveryPriorities.includes(item.field) ? 1.35 : 1;
    const weight = item.weight * patternBoost;
    possible += weight;
    const value = effectiveDiscoveryValue(opportunity.discovery, item.field);
    if (isFilled(value)) {
      earned += weight;
      known.push(`${item.label}: ${formatDiscoveryFieldValue(item.field, value)}`);
    } else {
      assumptions.push(item.assumption);
      unanswered.push({ id: `gap-${item.field}`, field: item.field, question: item.question, whyItMatters: item.why, workingAssumption: item.assumption, architectureImpact: item.impact });
    }
  }

  const challengeQuestions: DiscoveryQuestion[] = challenges.map((challenge, index) => ({ id: `challenge-${challenge.id}`, field: primaryFieldForChallenge(challenge), question: challenge.nextQuestion, whyItMatters: challenge.discoveryImpact, priority: 200 - index }));
  const priorityQuestions = unanswered.map((gap) => ({ id: gap.id, field: gap.field, question: gap.question, whyItMatters: gap.whyItMatters, priority: questionPriority(gap.field, pattern?.discoveryPriorities ?? []) }));
  const nextQuestions = [...challengeQuestions, ...priorityQuestions].sort((left, right) => right.priority - left.priority).filter((question, index, all) => all.findIndex((item) => item.question === question.question) === index).slice(0, 3);
  return { confidence: Math.round((earned / Math.max(possible, 1)) * 100), known: known.slice(0, 12), assumptions: unique(assumptions).slice(0, 10), unanswered, nextQuestions };
}

export function recommendSolution(opportunity: OpportunityState): SolutionRecommendation[] {
  const d = opportunity.discovery;
  const recommendations: SolutionRecommendation[] = [];
  const add = (recommendation: SolutionRecommendation) => recommendations.push(recommendation);
  const streaming = d.workloadMode === "streaming" || d.workloadMode === "both" || d.workloadMode === "live-plus-post-call";
  const batch = d.workloadMode === "prerecorded" || d.workloadMode === "both" || d.workloadMode === "live-plus-post-call";
  const conversational = d.interactionModel === "human-to-agent" || d.interactionModel === "agent-to-agent" || d.products.includes("voice-agent") || d.products.includes("tts") || /agent|reception|self-service|voicebot/i.test(d.currentWorkflow);
  const privateDeployment = ["vpc", "self-hosted", "on-premises", "air-gapped"].includes(d.deployment);
  const noisyInput = d.audioEnvironments.some((item) => ["noisy-mobile", "telephony-bandwidth", "far-field", "low-bandwidth", "mixed-devices"].includes(item)) || Boolean(d.backgroundNoise);
  const multipleLanguages = d.languageProfiles.some((item) => ["multilingual", "regional-accents", "code-switching", "non-english-first", "future-expansion"].includes(item)) || Boolean(d.languages || d.accents || d.codeSwitching);
  const latencyCritical = d.latencySensitivity === "turn-critical" || d.latencySensitivity === "realtime";
  const retainExisting = ["retain", "augment", "parallel"].includes(d.migrationPosture) || d.existingProviderCategories.length > 0;

  if (!d.workloadMode) add(unresolved("processing-mode", "Choose the first speech processing mode", "Streaming and prerecorded paths require different transports and evaluation methods.", "Workload mode is unanswered.", ["workloadMode"]));
  if (streaming) add({ id: "nova-streaming", title: "Nova-3 streaming speech-to-text", fit: "likely", capability: "Streaming STT", reason: "The workflow needs incremental transcription through a controlled realtime media path.", requirement: formatOr(d.currentWorkflow, "Realtime customer interaction"), assumption: "Model, language, and feature compatibility require validation.", tradeoff: "The customer still owns media framing, authentication, reconnect behavior, and downstream state.", validationStep: "Trace connection open, first audio, interim/final events, close, and reconnect with representative media.", sourceFields: ["workloadMode", "audioSources", "languages"] });
  if (batch) add({ id: "nova-batch", title: "Nova-3 prerecorded transcription", fit: "likely", capability: "Batch STT", reason: "Recorded calls or archives benefit from a separate retryable processing path.", requirement: formatOr(d.currentWorkflow, "Post-call or archive processing"), assumption: "Queue, retention, and replay ownership remain customer decisions.", tradeoff: "Batch latency and feature combinations should not be inferred from streaming tests.", validationStep: "Run a versioned held-out corpus with repeatable settings and human-reviewed references.", sourceFields: ["workloadMode", "retentionConstraints"] });
  if (conversational && streaming) add({ id: "flux", title: "Flux conversational speech recognition", fit: d.knownFailurePatterns || activeChallenges(opportunity).some((item) => item.category === "conversation") ? "likely" : "unresolved", capability: "Flux", reason: "Conversational turn handling may improve interruption and end-of-turn behavior when evaluated as part of the complete loop.", requirement: formatOr(d.knownFailurePatterns, "Natural conversational turn-taking"), assumption: "Flux is an evaluation candidate, not a universal replacement for Nova-3 or customer orchestration.", tradeoff: "Turn behavior depends on audio, playback, echo, tools, and orchestration timing—not the speech component alone.", validationStep: "Use human-labeled pauses, interruptions, false barge-ins, and recovery scenarios.", sourceFields: ["products", "knownFailurePatterns", "currentLatency"] });
  if (d.products.includes("voice-agent")) add({ id: "voice-agent", title: "Voice Agent API evaluation path", fit: d.orchestrationLayer ? "likely" : "unresolved", capability: "Voice Agent API", reason: "A managed listen-think-speak path can reduce integration surface when unified orchestration matches the operating model.", requirement: formatOr(d.currentWorkflow, "Conversational agent workflow"), assumption: d.orchestrationLayer ? `The customer may retain: ${d.orchestrationLayer}` : "Orchestration ownership is unresolved.", tradeoff: "Managed orchestration can accelerate delivery but changes control and integration ownership.", validationStep: "Compare managed and composable paths against the same task, latency, recovery, and observability gates.", sourceFields: ["products", "orchestrationLayer", "llmProvider"] });
  if (d.products.includes("tts") || conversational) add({ id: "aura", title: "Aura-2 streaming text-to-speech", fit: d.products.includes("tts") ? "likely" : "unresolved", capability: "Aura-2", reason: "The caller response path needs natural, interruptible audio with measured startup behavior.", requirement: formatOr(d.desiredBusinessOutcome, "Responsive spoken interaction"), assumption: "Voice and language fit must be evaluated with the target audience.", tradeoff: "Text preparation, buffering, playback cancellation, and network delivery affect the experience.", validationStep: "Measure time to first playable audio, intelligibility, pronunciation, long-utterance continuity, and interruption stop time.", sourceFields: ["products", "languages", "knownFailurePatterns"] });
  if (d.specialistTerminology || d.alphanumericIdentifiers) add({ id: "domain", title: "Domain-term and identifier evaluation", fit: "likely", capability: "Keyterm prompting, formatting, and application confirmation", reason: "Business-critical terms and identifiers need slice-specific handling beyond aggregate WER.", requirement: [d.specialistTerminology, d.alphanumericIdentifiers].filter(Boolean).join(" · "), assumption: "The customer will supply approved terms, formats, and confirmation rules.", tradeoff: "Prompting and formatting do not eliminate the need for confirmation on sensitive actions.", validationStep: "Measure term precision/recall, exact identifier match, character error, and safe fallback by type.", sourceFields: ["specialistTerminology", "alphanumericIdentifiers", "riskyVocabulary"] });
  if (d.products.includes("audio-intelligence") || batch) add({ id: "audio-intelligence", title: "Audio Intelligence features", fit: "likely", capability: "Diarization, formatting, redaction, and language detection as separately validated options", reason: "Post-call QA, analytics, governance, and multilingual routing need structured transcript evidence.", requirement: formatOr(d.currentWorkflow, "Governed transcript processing"), assumption: "Each feature, language, model, and deployment combination needs current documentation and POC validation.", tradeoff: "Transcript redaction does not redact source audio; diarization is not physical channel separation.", validationStep: "Test each selected feature on representative multi-speaker and sensitive synthetic fixtures.", sourceFields: ["products", "languages", "sensitiveData", "channelMode"] });
  if (noisyInput) add({ id: "audio-input", title: "Measured audio-input and preprocessing boundary", fit: "likely", capability: "Codec validation, gain inspection, channel handling, and narrowly evaluated preprocessing", reason: "The selected production media can degrade recognition before audio reaches the speech service.", requirement: formatSelection(d.audioEnvironments, d.backgroundNoise || "Variable production audio", "audio-environment"), assumption: "Preprocessing is optional and must be compared against an unmodified baseline.", tradeoff: "Aggressive suppression or resampling can remove speech cues and add latency.", validationStep: "Capture pre- and post-processing audio metrics and compare transcript continuity, critical terms, and latency on the same calls.", sourceFields: ["audioEnvironments", "backgroundNoise", "codecSampleRate", "channelMode"] });
  if (multipleLanguages) add({ id: "language-routing", title: "Language and accent evaluation matrix", fit: "likely", capability: "Language-specific configuration and detection or routing where verified", reason: "The selected language mix requires explicit slices rather than an aggregate accuracy claim.", requirement: formatSelection(d.languageProfiles, d.languages || d.accents || "Multilingual production traffic", "language-profile"), assumption: "Model, language, and feature compatibility must be confirmed from current documentation.", tradeoff: "A single automatic routing strategy may add uncertainty for short or code-switched utterances.", validationStep: "Measure quality and critical entities by prioritized language, accent, code-switch pair, channel, and workflow.", sourceFields: ["languageProfiles", "languages", "accents", "codeSwitching"] });
  if (latencyCritical && streaming) add({ id: "latency-budget", title: "End-to-end latency budget", fit: "confirmed", capability: "Streaming checkpoints across media, speech, orchestration, tools, and playback", reason: "The customer selected a latency-sensitive live experience, so average API time alone cannot identify the limiting boundary.", requirement: discoveryLabel("latency-sensitivity", d.latencySensitivity), assumption: "No target is implied until start, stop, percentile, and customer tolerance are defined.", tradeoff: "Reducing silence or buffering can increase false turns, instability, or downstream load.", validationStep: "Record P50/P95 at each boundary and test turn quality, interruption, and recovery under representative network conditions.", sourceFields: ["latencySensitivity", "currentLatency", "knownFailurePatterns"] });
  if (retainExisting) add({ id: "composable-migration", title: "Reversible composable integration", fit: hasEvidence(d.migrationPosture) ? "confirmed" : "likely", capability: "Thin adapter, parallel comparison, retained providers, and rollback", reason: "Discovery favors preserving working customer components while isolating the speech decision.", requirement: `${discoveryLabel("migration-posture", d.migrationPosture || "not-sure")} · ${formatSelection(d.existingProviderCategories, d.incumbentProvider || "Existing stack to inventory", "existing-provider")}`,
    assumption: "Interface compatibility and incumbent contract constraints require customer confirmation.", tradeoff: "Parallel operation adds temporary integration and evaluation effort but reduces cutover risk.", validationStep: "Run the same representative traffic through a bounded adapter, compare evidence, and prove rollback without customer-visible state loss.", sourceFields: ["migrationPosture", "existingProviderCategories", "incumbentProvider", "orchestrationLayer"] });
  if (privateDeployment) add({ id: "private", title: "Private deployment exploration", fit: "likely", capability: "VPC, self-hosted, on-premises, or air-gapped deployment subject to confirmation", reason: "The selected data boundary rules out an assumed shared-cloud production path.", requirement: formatOr(d.deployment, "Private infrastructure"), assumption: "Infrastructure, feature availability, support, and commercial terms require Deepgram confirmation.", tradeoff: "Private deployment increases customer capacity, upgrade, observability, and disaster-recovery ownership.", validationStep: "Validate the exact boundary, infrastructure bill of materials, supported features, load envelope, upgrades, and recovery model.", sourceFields: ["deployment", "geographicResidency", "retentionConstraints", "peakConcurrency"] });
  if (d.sensitiveData || d.retentionConstraints) add({ id: "governance", title: "Explicit data-governance boundary", fit: "confirmed", capability: "Application-level retention, redaction, access, and audit controls", reason: "Sensitive audio, transcript, logs, and evaluation artifacts need separate handling decisions.", requirement: [d.sensitiveData, d.retentionConstraints].filter(Boolean).join(" · "), assumption: "No legal or compliance conclusion is generated by this Studio.", tradeoff: "Additional controls add implementation and review effort.", validationStep: "Complete a data-flow review covering audio, transcript, logs, support access, backups, and deletion.", sourceFields: ["sensitiveData", "retentionConstraints", "compliancePosture"] });
  add({ id: "observability", title: "Correlated observability and evaluation", fit: d.observabilityTools ? "confirmed" : "likely", capability: "Customer-owned metrics, traces, request IDs, evaluation artifacts, and outcome joins", reason: "A voice system must locate failures across media, speech, orchestration, tools, TTS, and business outcomes.", requirement: formatOr(d.observabilityTools, "Operational evidence is required for the POC"), assumption: "Free-text transcripts and raw audio remain out of default logs.", tradeoff: "Correlation and evaluation require shared identifiers and explicit data governance.", validationStep: "Confirm one session can be traced end-to-end without exposing secrets or sensitive payloads.", sourceFields: ["observabilityTools", "knownFailurePatterns"] });
  if (activeChallenges(opportunity).some((item) => ["resilience", "scale", "timeline"].includes(item.category))) add({ id: "fallback", title: "Retry, fallback, and recovery path", fit: "risk", capability: "Bounded retries, idempotency, fallback, and human escalation", reason: "The injected constraint raises the cost of an unrecoverable session or unsafe duplicate action.", requirement: activeChallenges(opportunity).map((item) => item.title).join(" · "), assumption: "Fallback ownership and acceptable degraded behavior are not yet approved.", tradeoff: "Resilience adds state, testing, and operating complexity.", validationStep: "Inject disconnect, timeout, downstream failure, and regional failure; prove safe stop or context-preserving recovery.", sourceFields: ["peakConcurrency", "knownFailurePatterns", "observabilityTools"] });
  return recommendations;
}

export function buildArchitectureBlueprint(opportunity: OpportunityState): ArchitectureBlueprint {
  const d = opportunity.discovery;
  const recommendations = recommendSolution(opportunity);
  const ids = new Set(recommendations.map((item) => item.id));
  const nodes: ArchitectureNode[] = [];
  const edges: ArchitectureEdge[] = [];
  const addNode = (node: ArchitectureNode) => nodes.push(node);
  const addEdge = (from: string, to: string, label: string, flow: ArchitectureEdge["flow"]) => edges.push({ id: `${from}-${to}-${edges.length}`, from, to, label, flow });
  const node = (id: string, label: string, detail: string, owner: ArchitectureNode["owner"], whyPresent: string, requirement: string, x: number, y: number, executive = true): ArchitectureNode => ({ id, label, detail, owner, whyPresent, requirement, x, y, executive });
  const integrations = evidenceSelections(d.integrationChannels, d.audioSources);
  const webMedia = integrations.some((item) => ["browser", "webrtc", "mobile"].includes(item));
  const uploaded = integrations.includes("uploaded-media") && d.workloadMode === "prerecorded";
  const hasPreprocessing = ids.has("audio-input");
  addNode(node("caller", "Caller / audio source", formatSelection(d.audioEnvironments, formatSelection(integrations, "Source to confirm", "integration-channel"), "audio-environment"), "customer", "Every architecture begins with the real media and speaker environment.", formatOr(d.backgroundNoise, "Audio conditions unresolved"), 30, 70));
  addNode(node("transport", uploaded ? "Upload / object transport" : webMedia ? "WebRTC / media transport" : "PSTN / SIP / media transport", formatOr(d.telephonyProvider, discoveryLabel("integration-channel", integrations[0] ?? "not-sure")), "third-party", "The media boundary affects encoding, latency, reconnect, and ownership.", formatOr(d.codecSampleRate, "Codec and sample rate unresolved"), 210, 70));
  addNode(node("application", formatOr(d.contactCenterPlatform, integrations.includes("contact-center") ? "Customer CCaaS platform" : "Customer application / gateway"), "Call control and customer experience", "customer", "The customer application remains the call-control and workflow boundary.", formatOr(d.currentWorkflow, "Workflow to confirm"), 390, 70));
  const privateBoundary = ["vpc", "self-hosted", "on-premises", "air-gapped"].includes(d.deployment);
  const speechLabel = ids.has("flux") ? "Deepgram Flux / streaming STT" : ids.has("nova-streaming") ? "Deepgram Nova-3 streaming STT" : "Deepgram Nova-3 prerecorded STT";
  const speechX = hasPreprocessing ? 720 : 590;
  addNode(node("speech", speechLabel, privateBoundary ? "Private deployment candidate" : "Hosted evaluation candidate", "deepgram", "Discovery requires a speech recognition path; exact model and deployment remain evidence-led.", discoveryLabel("workload-mode", d.workloadMode || "not-sure"), speechX, 70));
  addEdge("caller", "transport", "audio", "audio"); addEdge("transport", "application", uploaded ? "recording" : "media stream", "audio");
  if (hasPreprocessing) { addNode(node("preprocess", "Audio validation / preprocessing", "Customer-controlled and benchmarked", "customer", "Selected audio conditions justify an inspectable input-quality boundary.", formatSelection(d.audioEnvironments, "Audio risk selected", "audio-environment"), 550, 70)); addEdge("application", "preprocess", "audio frames", "audio"); addEdge("preprocess", "speech", "validated audio", "audio"); }
  else addEdge("application", "speech", "audio / control", "audio");
  let previous = "speech";
  if (ids.has("voice-agent")) { addNode(node("agent", "Deepgram Voice Agent API", "Managed orchestration candidate", "deepgram", "The customer selected managed-agent evaluation.", formatOr(d.orchestrationLayer, "Orchestration ownership unresolved"), 880, 30)); addEdge(previous, "agent", "events", "control"); previous = "agent"; }
  if (d.orchestrationLayer || d.llmProvider || !ids.has("voice-agent")) { addNode(node("orchestration", formatOr(d.orchestrationLayer, "Customer orchestration + LLM"), formatOr(d.llmProvider, "LLM provider to confirm"), d.orchestrationLayer ? "customer" : "third-party", "A composable path keeps reasoning and tool control visible.", formatOr(d.currentWorkflow, "Business behavior to confirm"), 880, 115)); addEdge(previous, "orchestration", "transcript / turn", "transcript"); previous = "orchestration"; }
  addNode(node("tools", "Business logic + tools", [d.crm, d.dataWarehouse].filter(Boolean).join(" · ") || "CRM / system of record", "customer", "Voice value depends on completing or escalating a customer task.", formatOr(d.crm, "Tool integration unresolved"), 1040, 70)); addEdge(previous, "tools", "authorized action", "business-data");
  if (ids.has("aura")) { addNode(node("tts", "Deepgram Aura-2 TTS", "Streaming response audio", "deepgram", "A spoken response path is in scope.", formatSelection(d.languageProfiles, d.languages || "Voice and language fit unresolved", "language-profile"), 880, 210)); addEdge("tools", "tts", "response text", "control"); addEdge("tts", "application", "audio response", "audio"); }
  addNode(node("observability", "Observability + evaluation", formatOr(d.observabilityTools, "Customer tool to confirm"), "customer", "Every recommendation needs measurable, correlated evidence.", "No raw sensitive media in default logs", 630, 260, false)); addEdge("application", "observability", "media checkpoints", "control"); addEdge("speech", "observability", "request IDs / timing", "control"); addEdge("tools", "observability", "task outcome", "business-data");
  if (/human|transfer|escalat|reception/i.test(`${d.currentWorkflow} ${d.knownFailurePatterns}`) || activeChallenges(opportunity).some((item) => item.category === "resilience")) { addNode(node("human", "Human agent / fallback", "Context-preserving escalation", "customer", "Safe escalation remains part of the customer outcome.", formatOr(d.knownFailurePatterns, "Fallback trigger unresolved"), 1010, 210)); addEdge("tools", "human", "handoff context", "business-data"); }
  return { nodes, edges, boundaries: privateBoundary ? [`Secure private deployment boundary — ${formatOr(d.deployment, "exact model to confirm")}`, `Residency — ${formatSelection(d.residencyNeeds, d.geographicResidency || "unresolved", "residency")}`] : ["Customer-owned media and business-data boundary", "Deepgram-managed evaluation boundary — confirm production deployment"] };
}

export function recommendApiLabPresets(opportunity: OpportunityState): ApiLabPresetRecommendation[] {
  const d = opportunity.discovery;
  const candidates: Array<Omit<ApiLabPresetRecommendation, "href">> = [];
  const add = (endpointId: string, titleValue: string, reason: string) => candidates.push({ endpointId, title: titleValue, reason });
  const conversational = ["human-to-agent", "agent-to-agent"].includes(d.interactionModel) || d.products.includes("voice-agent");
  if (["streaming", "both", "live-plus-post-call"].includes(d.workloadMode) && conversational) add("stt-flux", "Inspect turn-aware streaming", "Live conversational evidence makes turn handling a high-value API Lab checkpoint.");
  if (["streaming", "both", "live-plus-post-call"].includes(d.workloadMode)) add("stt-live", "Inspect streaming STT", "The selected live path needs an explicit WebSocket, authentication, encoding, and finalization plan.");
  if (["prerecorded", "both", "live-plus-post-call"].includes(d.workloadMode)) add("stt-prerecorded", "Inspect prerecorded STT", "The selected recording path needs a retryable HTTPS request and versioned evaluation configuration.");
  if (conversational) add("voice-agent-converse", "Inspect Voice Agent API", "A managed listen-think-speak path is relevant enough to compare with retained orchestration.");
  if (d.products.includes("tts") || conversational) add("tts-rest", "Inspect TTS request", "The spoken response path needs a verified model, encoding, placement, and playback contract.");
  if (d.products.includes("audio-intelligence") || d.evaluationCriteria.includes("security")) add("text-intelligence", "Inspect Intelligence options", "The selected evaluation includes post-processing or governed transcript analysis.");
  return candidates.filter((candidate, index, all) => getDeepgramEndpoint(candidate.endpointId) && all.findIndex((item) => item.endpointId === candidate.endpointId) === index).slice(0, 4).map((candidate) => ({ ...candidate, href: `/?module=api-studio&operation=${encodeURIComponent(candidate.endpointId)}&source=pre-sales-discovery` }));
}

export function applyChallenge(opportunity: OpportunityState, challengeId: string, now = new Date().toISOString()): OpportunityState {
  const challenge = PRE_SALES_CHALLENGES.find((item) => item.id === challengeId);
  if (!challenge || opportunity.activeChallengeIds.includes(challengeId)) return opportunity;
  const discovery = { ...opportunity.discovery };
  for (const [field, value] of Object.entries(challenge.fieldUpdates) as Array<[DiscoveryFieldKey, DiscoveryState[DiscoveryFieldKey]]>) if (isFilled(value)) (discovery as Record<DiscoveryFieldKey, DiscoveryState[DiscoveryFieldKey]>)[field] = value;
  const criteria = ensureCriteria(opportunity.criteria, challenge.requiredCriterionIds);
  const datasetSegments = opportunity.datasetSegments.map((segment) => challenge.requiredDatasetSegmentIds.includes(segment.id) ? { ...segment, selected: true, sampleCount: Math.max(segment.sampleCount, 10) } : segment);
  return { ...opportunity, discovery, activeChallengeIds: [...opportunity.activeChallengeIds, challengeId], criteria, datasetSegments, updatedAt: now };
}

export function removeChallenge(opportunity: OpportunityState, challengeId: string, now = new Date().toISOString()): OpportunityState {
  return { ...opportunity, activeChallengeIds: opportunity.activeChallengeIds.filter((id) => id !== challengeId), updatedAt: now };
}

export function updateCriterion(opportunity: OpportunityState, criterionId: SuccessCriterionId, update: Partial<SuccessCriterion>, now = new Date().toISOString()): OpportunityState {
  const criteria = opportunity.criteria.map((item) => item.id === criterionId ? { ...item, ...update } : item);
  return { ...opportunity, criteria, updatedAt: now };
}

export function buildPocPlan(opportunity: OpportunityState): PocPlan {
  const insight = computeDiscoveryInsight(opportunity);
  const recommendations = recommendSolution(opportunity);
  const datasetWarnings = evaluateDataset(opportunity.datasetSegments, opportunity.discovery);
  const active = activeChallenges(opportunity);
  return {
    businessHypothesis: `${formatOr(opportunity.discovery.desiredBusinessOutcome, "The selected workflow")}; validate that the proposed speech path improves the agreed customer outcome without weakening guardrails.`,
    technicalHypothesis: `${recommendations.filter((item) => item.fit !== "unresolved").slice(0, 3).map((item) => item.title).join(" + ") || "A measured speech architecture"} can meet the customer-supplied quality, latency, recovery, and deployment gates.`,
    agreedScope: [formatOr(opportunity.discovery.currentWorkflow, "One representative workflow to be selected"), `${discoveryLabel("workload-mode", opportunity.discovery.workloadMode || "not-sure")} speech path`, formatSelection(opportunity.discovery.pocSuccessCriteria, "Measurable evaluation and failure evidence", "poc-success")],
    excludedScope: ["Unvalidated production rollout", "Pricing or compliance commitment", "Every language, workflow, and edge case outside the agreed corpus"],
    customerResponsibilities: ["Provide representative, approved audio or live test traffic", "Supply baselines, critical terminology, and business outcome definitions", opportunity.discovery.implementationOwners.length ? `Confirm selected owners: ${formatSelection(opportunity.discovery.implementationOwners, "", "implementation-owner")}` : "Name media, security, integration, and evaluation owners"],
    deepgramResponsibilities: ["Confirm current capability and deployment compatibility", "Support configuration and architecture review", "Help interpret measured speech behavior without replacing customer acceptance"],
    datasetRequirements: opportunity.datasetSegments.filter((item) => item.selected).map((item) => `${item.label}: ${item.sampleCount || "sample count required"}`),
    milestones: ["Confirm scope and definitions", "Assemble and review representative data", "Build one vertical integration slice", "Run baseline and candidate evaluation", "Inject failure and load conditions", "Review evidence and make a proceed/revise/stop decision"],
    measurementMethodology: ["Freeze dataset, reference, normalization, and configuration versions", "Use client-side timestamps and correlation IDs across every boundary", "Report distributions and failure slices, not a single average", "Tie technical measurements to task outcomes and safe fallback"],
    decisionDate: opportunity.discovery.launchDeadline ? `Decision checkpoint before ${opportunity.discovery.launchDeadline}` : hasEvidence(opportunity.discovery.implementationTimeline) ? `Decision timing: ${discoveryLabel("timeline", opportunity.discovery.implementationTimeline)}` : "Customer and Deepgram owners must agree a decision date.",
    risks: unique([...insight.unanswered.slice(0, 5).map((gap) => gap.question), ...active.map((challenge) => challenge.pocImpact), ...datasetWarnings]),
    exitCriteria: ["Proceed to production design if adopted criteria are met and security/ownership gates close", "Extend the POC if evidence is directionally positive but coverage is incomplete", "Revise the architecture if a failing boundary is outside the selected speech configuration", "Stop if a non-negotiable requirement remains unsupported"],
    criteria: opportunity.criteria,
    datasetSegments: opportunity.datasetSegments,
    datasetWarnings,
  };
}

export function evaluateDataset(segments: DatasetSegment[], discovery: DiscoveryState): string[] {
  const selected = segments.filter((item) => item.selected);
  const total = selected.reduce((sum, item) => sum + Math.max(0, item.sampleCount), 0);
  const warnings: string[] = [];
  if (total < 30) warnings.push("The proposed evaluation set is too small for a decision; define a representative minimum with the customer.");
  if (!selected.some((item) => item.id === "noisy-audio") && discovery.backgroundNoise) warnings.push("Known noisy-audio conditions are not represented.");
  if (!selected.some((item) => item.id === "language") && discovery.languages) warnings.push("Required languages are not explicitly stratified.");
  if (!selected.some((item) => item.id === "domain-terms") && discovery.specialistTerminology) warnings.push("Domain terminology is missing from the dataset plan.");
  if (!selected.some((item) => item.highRisk)) warnings.push("No rare or high-risk slice is selected; aggregate results may hide the most important failures.");
  if (selected.length > 0 && selected.some((item) => item.sampleCount === 0)) warnings.push("At least one selected segment has no sample count.");
  return warnings;
}

export function calculateBusinessCase(inputs: BusinessCaseInputs): BusinessCaseResult {
  const calls = number(inputs.monthlyCallCount); const duration = number(inputs.averageCallDuration); const currentRate = number(inputs.currentTranscriptionCost); const proposedRate = number(inputs.proposedTranscriptionCost);
  const qaPercent = percent(inputs.humanQaPercent); const reviewMinutes = number(inputs.qaReviewMinutes); const laborRate = number(inputs.loadedLaborCost); const proposedContainment = percent(inputs.proposedContainment);
  const currentConversion = percent(inputs.currentConversion); const proposedConversion = percent(inputs.proposedConversion); const transactionValue = number(inputs.averageTransactionValue); const implementationCost = number(inputs.implementationCost);
  const minutes = calls !== null && duration !== null ? calls * duration : null;
  const currentPlatform = minutes !== null && currentRate !== null ? minutes * currentRate : null;
  const monthlyPlatformCost = minutes !== null && proposedRate !== null ? minutes * proposedRate : null;
  const qaHoursRecovered = calls !== null && qaPercent !== null && reviewMinutes !== null ? calls * qaPercent * reviewMinutes / 60 : null;
  const qaLaborValue = qaHoursRecovered !== null && laborRate !== null ? qaHoursRecovered * laborRate : null;
  const directSavings = currentPlatform !== null && monthlyPlatformCost !== null ? currentPlatform - monthlyPlatformCost : null;
  const monthlySavings = directSavings !== null || qaLaborValue !== null ? (directSavings ?? 0) + (qaLaborValue ?? 0) : null;
  const incrementalConversions = calls !== null && currentConversion !== null && proposedConversion !== null ? calls * (proposedConversion - currentConversion) : null;
  const conversionValue = incrementalConversions !== null && transactionValue !== null ? incrementalConversions * transactionValue : null;
  const potentialAnnualValue = monthlySavings !== null || conversionValue !== null ? ((monthlySavings ?? 0) + (conversionValue ?? 0)) * 12 : null;
  const completedTasks = calls !== null && proposedContainment !== null ? calls * proposedContainment : null;
  const costPerInteraction = calls && monthlyPlatformCost !== null ? monthlyPlatformCost / calls : null;
  const costPerCompletedTask = completedTasks && monthlyPlatformCost !== null ? monthlyPlatformCost / completedTasks : null;
  const monthlyNetValue = (monthlySavings ?? 0) + (conversionValue ?? 0);
  const paybackMonths = implementationCost !== null && monthlyNetValue > 0 ? implementationCost / monthlyNetValue : null;
  return {
    monthlyPlatformCost, monthlySavings, qaHoursRecovered, costPerInteraction, costPerCompletedTask, incrementalConversions, potentialAnnualValue, paybackMonths,
    formulas: ["Monthly minutes = monthly calls × average call duration", "Platform cost = monthly minutes × supplied per-minute cost", "QA hours = calls × QA sample rate × review minutes ÷ 60", "Incremental conversions = calls × (proposed conversion − current conversion)", "Annual scenario value = 12 × (platform/QA savings + conversion value)", "Payback months = implementation cost ÷ monthly scenario value"],
    assumptions: ["All values are user-entered scenario inputs, not Deepgram pricing or guaranteed outcomes.", "Costs must use equivalent features, workloads, and commercial terms.", "Containment and conversion improvements require customer validation and should not be attributed to one component without evidence."],
  };
}

export function deriveReadouts(opportunity: OpportunityState): { executive: ExecutiveReadout; technical: TechnicalReadout } {
  const insight = computeDiscoveryInsight(opportunity); const recommendations = recommendSolution(opportunity); const blueprint = buildArchitectureBlueprint(opportunity); const poc = buildPocPlan(opportunity); const business = calculateBusinessCase(opportunity.businessCaseInputs);
  const adopted = opportunity.criteria.filter((item) => item.target && ["customer-adopted", "customer-provided"].includes(item.targetSource));
  const expectedValue = business.potentialAnnualValue !== null ? `Illustrative scenario value: ${money(business.potentialAnnualValue)} annually, subject to every displayed assumption.` : "Expected value remains a hypothesis until customer cost, volume, and outcome inputs are supplied.";
  const executive: ExecutiveReadout = {
    businessProblem: formatOr(opportunity.discovery.desiredBusinessOutcome, quickSelectionSummary(opportunity.discovery, "business-outcome", opportunity.discovery.businessOutcomePriorities, "The customer outcome has not yet been confirmed.")),
    whyNow: formatOr(opportunity.discovery.reasonNow || opportunity.discovery.launchDeadline, hasEvidence(opportunity.discovery.implementationTimeline) ? `Selected timing: ${discoveryLabel("timeline", opportunity.discovery.implementationTimeline)}` : "The urgency and decision window remain unresolved."),
    proposedOutcome: `Evaluate ${recommendations.filter((item) => item.fit !== "unresolved").slice(0, 3).map((item) => item.title).join(", ") || "a measured Deepgram speech path"} against business and technical gates.`,
    expectedValue,
    majorRisk: insight.unanswered[0]?.question ?? poc.datasetWarnings[0] ?? "Technical and commercial fit still requires representative validation.",
    recommendedDecision: adopted.length ? `Approve the bounded POC using ${adopted.length} customer-adopted acceptance ${adopted.length === 1 ? "criterion" : "criteria"}.` : "Define acceptance thresholds and approve a bounded proof of concept before selecting a production architecture.",
    nextMilestone: poc.milestones[0],
  };
  const technical: TechnicalReadout = {
    workload: `${quickSelectionSummary(opportunity.discovery, "industry", [opportunity.discovery.industry], "Industry unresolved")} · ${quickSelectionSummary(opportunity.discovery, "customer-type", [opportunity.discovery.customerType], "Customer type unresolved")} · ${discoveryLabel("workload-mode", opportunity.discovery.workloadMode || "not-sure")} · ${discoveryLabel("interaction-model", opportunity.discovery.interactionModel || "not-sure")} · ${formatOr(opportunity.discovery.currentWorkflow, "workflow unresolved")}`,
    architecture: blueprint.nodes.map((node) => `${node.label} (${node.owner})`),
    deepgramProducts: recommendations.map((item) => `${item.capability}: ${item.fit}`),
    deployment: `${formatOr(opportunity.discovery.deployment, "Deployment unresolved")} · ${blueprint.boundaries.join(" · ")}`,
    integrations: [...selectedLabels("integration-channel", opportunity.discovery.integrationChannels), opportunity.discovery.quickNotes["integration-channel"], ...selectedLabels("existing-provider", opportunity.discovery.existingProviderCategories), opportunity.discovery.quickNotes["existing-provider"], opportunity.discovery.telephonyProvider, opportunity.discovery.contactCenterPlatform, opportunity.discovery.orchestrationLayer, opportunity.discovery.llmProvider, opportunity.discovery.crm, opportunity.discovery.dataWarehouse].filter((item): item is string => Boolean(item)),
    apiOptions: recommendApiLabPresets(opportunity).map((item) => `${item.title}: ${item.endpointId}`),
    evaluationMethodology: poc.measurementMethodology,
    successCriteria: opportunity.criteria.map((item) => `${item.label}: ${item.target || "target required"} (${item.status})`),
    security: [...selectedLabels("compliance", opportunity.discovery.complianceExpectations), ...selectedLabels("residency", opportunity.discovery.residencyNeeds), discoveryLabel("retention", opportunity.discovery.retentionExpectation), opportunity.discovery.sensitiveData, opportunity.discovery.retentionConstraints, opportunity.discovery.geographicResidency, opportunity.discovery.compliancePosture].filter((item) => Boolean(item) && item !== "Not sure yet"),
    unresolvedQuestions: insight.unanswered.slice(0, 8).map((item) => item.question),
    implementationSequence: poc.milestones,
  };
  return { executive, technical };
}

export function illustrativeDemo(opportunity: OpportunityState): DemoResult {
  const hasSpanish = opportunity.discovery.languageProfiles.includes("spanish") || /spanish|español/i.test(opportunity.discovery.languages);
  const domain = opportunity.discovery.specialistTerminology ? "The caller confirms the specialist term and requests the next safe action." : "The caller asks for help completing the selected workflow.";
  return { label: "Illustrative Demo Data", transcript: domain, interimTranscript: domain.slice(0, Math.max(24, Math.floor(domain.length * .55))) + "…", finalTranscript: domain, timestamps: ["00:00.24 first illustrative partial", "00:01.10 illustrative final"], detectedLanguage: hasSpanish ? "Spanish — illustrative" : "English — illustrative", speakerLabels: "Speaker 0 — illustrative", redaction: opportunity.discovery.sensitiveData ? "[REDACTED] placeholder — illustrative" : "Not enabled", requestDurationMs: 1280, firstResultLatencyMs: 240, finalResultLatencyMs: 1100, model: recommendSolution(opportunity).some((item) => item.id === "flux") ? "Flux candidate" : "Nova-3 candidate", options: ["punctuation", opportunity.discovery.specialistTerminology ? "keyterm evaluation" : "standard vocabulary", opportunity.discovery.sensitiveData ? "redaction evaluation" : "no redaction"], retries: 0, error: "" };
}

export function buildPreSalesExport(opportunity: OpportunityState): PreSalesExport {
  const { executive, technical } = deriveReadouts(opportunity);
  return { kind: "deepgram-pre-sales-solution-studio", schemaVersion: 1, syntheticData: true, exportedAt: new Date().toISOString(), opportunity: structuredClone(opportunity), executiveReadout: executive, technicalReadout: technical };
}

export function validateOpportunitySnapshot(value: unknown): OpportunityState | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.id !== "string" || typeof value.name !== "string" || typeof value.patternId !== "string" || !isRecord(value.discovery) || hasForbiddenKey(value, 0)) return null;
  if (!Array.isArray(value.criteria) || value.criteria.length > SUCCESS_CRITERIA_CATALOG.length || !Array.isArray(value.datasetSegments) || value.datasetSegments.length > DATASET_SEGMENT_CATALOG.length || !Array.isArray(value.activeChallengeIds) || value.activeChallengeIds.length > PRE_SALES_CHALLENGES.length) return null;
  const serialized = JSON.stringify(value);
  if (serialized.length > 250_000) return null;
  const snapshot = structuredClone(value) as unknown as OpportunityState;
  const candidate = snapshot.discovery as unknown as Record<string, unknown>;
  const arrayFields: Array<keyof DiscoveryState> = ["businessOutcomePriorities", "products", "audioSources", "integrationChannels", "audioEnvironments", "languageProfiles", "residencyNeeds", "complianceExpectations", "existingProviderCategories", "evaluationCriteria", "pocSuccessCriteria", "implementationOwners"];
  const discovery = { ...structuredClone(EMPTY_DISCOVERY), ...candidate, quickNotes: isRecord(candidate.quickNotes) ? candidate.quickNotes : {} } as DiscoveryState;
  for (const field of arrayFields) if (!Array.isArray(candidate[field])) (discovery as unknown as Record<string, unknown>)[field] = structuredClone(EMPTY_DISCOVERY[field]);
  return { ...snapshot, discovery, discoveryMode: snapshot.discoveryMode === "deep" ? "deep" : "fast" };
}

export function executiveReadoutMarkdown(opportunity: OpportunityState) {
  const { executive } = deriveReadouts(opportunity);
  return ["# Deepgram Pre-Sales Solution Studio — Executive Readout", "**Public-story-inspired pattern with simulated requirements. Scenario estimate only.**", ...Object.entries(executive).map(([key, value]) => `## ${title(key)}\n\n${value}`)].join("\n\n");
}

export function technicalReadoutMarkdown(opportunity: OpportunityState) {
  const { technical } = deriveReadouts(opportunity);
  return ["# Deepgram Pre-Sales Solution Studio — Engineering Readout", "**Public-story-inspired pattern with simulated requirements. Technical and commercial validation required.**", ...Object.entries(technical).map(([key, value]) => `## ${title(key)}\n\n${Array.isArray(value) ? value.map((item) => `- ${item}`).join("\n") || "- Unresolved" : value}`)].join("\n\n");
}

function ensureCriteria(current: SuccessCriterion[], ids: SuccessCriterionId[]) {
  const existing = new Set(current.map((item) => item.id));
  return [...current, ...SUCCESS_CRITERIA_CATALOG.filter((item) => ids.includes(item.id) && !existing.has(item.id)).map((item) => structuredClone(item))];
}
function synchronizeDiscoveryArtifacts(opportunity: OpportunityState): OpportunityState {
  const d = opportunity.discovery;
  const criterionMap: Record<string, SuccessCriterionId[]> = {
    accuracy: ["overall-wer"], "domain-terms": ["domain-term-error"], latency: ["p50-latency", "p95-latency"], "turn-taking": ["turn-detection", "interruption-recovery"], reliability: ["error-rate", "uptime"], scale: ["concurrency"], cost: ["cost-per-minute", "cost-per-completed-task"],
    "task-completion": ["containment"], "quality-threshold": ["overall-wer"], "latency-threshold": ["p95-latency"], "safe-handoff": ["error-rate"], "load-gate": ["concurrency"], "integration-complete": ["uptime"], "economic-case": ["cost-per-completed-task"],
  };
  const criterionIds = [...d.evaluationCriteria, ...d.pocSuccessCriteria].flatMap((value) => criterionMap[value] ?? []);
  const selectedDatasetIds = datasetIdsForDiscovery(d);
  return {
    ...opportunity,
    criteria: ensureCriteria(opportunity.criteria, criterionIds),
    datasetSegments: opportunity.datasetSegments.map((segment) => selectedDatasetIds.has(segment.id) ? { ...segment, selected: true, sampleCount: Math.max(segment.sampleCount, 10) } : segment),
  };
}
function datasetIdsForDiscovery(d: DiscoveryState) {
  const ids = new Set<string>(["clean-audio", "rare-high-risk"]);
  if (d.backgroundNoise || d.audioEnvironments.some((item) => ["noisy-mobile", "far-field", "low-bandwidth", "mixed-devices"].includes(item))) ids.add("noisy-audio");
  if (d.audioSources.includes("telephony") || d.integrationChannels.includes("telephony") || d.audioEnvironments.includes("telephony-bandwidth")) ids.add("telephony-audio");
  if (d.languages || d.languageProfiles.some(hasEvidence)) ids.add("language");
  if (d.specialistTerminology || d.evaluationCriteria.includes("domain-terms")) ids.add("domain-terms");
  if (d.alphanumericIdentifiers) ids.add("alphanumeric");
  if (d.codeSwitching || d.languageProfiles.some((item) => ["regional-accents", "code-switching"].includes(item))) ids.add("accents-dialects");
  if (d.audioEnvironments.includes("overlap")) ids.add("overlap");
  if (d.latencySensitivity === "turn-critical" || d.evaluationCriteria.includes("turn-taking")) ids.add("interruptions");
  return ids;
}
function activeChallenges(opportunity: OpportunityState) { return PRE_SALES_CHALLENGES.filter((item) => opportunity.activeChallengeIds.includes(item.id)); }
function unresolved(id: string, titleValue: string, reason: string, assumption: string, sourceFields: DiscoveryFieldKey[]): SolutionRecommendation { return { id, title: titleValue, fit: "unresolved", capability: "Discovery decision", reason, requirement: "Decision-relevant information is missing.", assumption, tradeoff: "Premature selection may add unnecessary complexity or test the wrong path.", validationStep: "Ask the listed next question before locking the POC architecture.", sourceFields }; }
function questionPriority(field: DiscoveryFieldKey, priorities: DiscoveryFieldKey[]) { const index = priorities.indexOf(field); return index >= 0 ? 150 - index * 5 : 100 - REQUIRED_DISCOVERY.findIndex((item) => item.field === field); }
function primaryFieldForChallenge(challenge: Challenge): DiscoveryFieldKey { const map: Record<Challenge["category"], DiscoveryFieldKey> = { timeline: "launchDeadline", deployment: "deployment", incumbent: "incumbentProvider", conversation: "knownFailurePatterns", domain: "riskyVocabulary", evaluation: "currentWer", scale: "peakConcurrency", latency: "currentLatency", commercial: "currentCost", language: "languages", resilience: "observabilityTools", executive: "desiredBusinessOutcome" }; return map[challenge.category]; }
function effectiveDiscoveryValue(d: DiscoveryState, field: DiscoveryFieldKey): unknown {
  const direct = d[field];
  if (hasEvidence(direct)) return direct;
  const quickGroup = groupIdForField(field);
  if (quickGroup && hasEvidence(d.quickNotes[quickGroup])) return d.quickNotes[quickGroup];
  const fallback: Partial<Record<DiscoveryFieldKey, unknown>> = {
    desiredBusinessOutcome: d.businessOutcomePriorities,
    peakConcurrency: d.concurrencyScale,
    currentLatency: d.latencySensitivity,
    languages: d.languageProfiles,
    audioSources: d.integrationChannels,
    backgroundNoise: d.audioEnvironments,
    geographicResidency: d.residencyNeeds,
    retentionConstraints: d.retentionExpectation,
    compliancePosture: d.complianceExpectations,
    incumbentProvider: d.existingProviderCategories,
    launchDeadline: d.implementationTimeline,
  };
  return fallback[field] ?? direct;
}
function groupIdForField(field: DiscoveryFieldKey): DiscoveryQuickSelectId | null {
  const map: Partial<Record<DiscoveryFieldKey, DiscoveryQuickSelectId>> = {
    industry: "industry", customerType: "customer-type", desiredBusinessOutcome: "business-outcome", workloadMode: "workload-mode", interactionModel: "interaction-model", trafficDirection: "traffic-direction", peakConcurrency: "concurrency-scale", currentLatency: "latency-sensitivity", languages: "language-profile", backgroundNoise: "audio-environment", audioSources: "integration-channel", incumbentProvider: "existing-provider", migrationPosture: "migration-posture", deployment: "deployment", geographicResidency: "residency", compliancePosture: "compliance", retentionConstraints: "retention", pocSuccessCriteria: "poc-success", implementationTimeline: "timeline", implementationOwners: "implementation-owner",
  };
  return map[field] ?? null;
}
function formatDiscoveryFieldValue(field: DiscoveryFieldKey, value: unknown) { const groupId = groupIdForField(field); return groupId ? formatSelection(Array.isArray(value) ? value : [String(value)], "Unresolved", groupId) : Array.isArray(value) ? value.join(", ") : String(value); }
function discoveryLabel(groupId: DiscoveryQuickSelectId, value: string) { return getPreSalesDiscoveryGroup(groupId).options.find((option) => option.value === value)?.label ?? value; }
function selectedLabels(groupId: DiscoveryQuickSelectId, values: string[]) { const group = getPreSalesDiscoveryGroup(groupId); return values.filter(hasEvidence).map((value) => group.options.find((option) => option.value === value)?.label ?? value); }
function formatSelection(values: string[], fallback: string, groupId?: DiscoveryQuickSelectId) { const filtered = values.filter(hasEvidence); if (!filtered.length) return fallback; return groupId ? selectedLabels(groupId, filtered).join(", ") : filtered.join(", "); }
function quickSelectionSummary(d: DiscoveryState, groupId: DiscoveryQuickSelectId, values: string[], fallback: string) { const labels = selectedLabels(groupId, values); const note = d.quickNotes[groupId]?.trim(); return [...labels, ...(note ? [note] : [])].join(", ") || fallback; }
function evidenceSelections(primary: string[], fallback: string[]) { const selected = primary.filter(hasEvidence); return selected.length ? selected : fallback.filter(hasEvidence); }
function hasEvidence(value: unknown) { if (Array.isArray(value)) return value.some(hasEvidence); if (typeof value === "string") return Boolean(value.trim()) && !["not-sure", "other"].includes(value); return value !== null && value !== undefined; }
function isFilled(value: unknown) { return hasEvidence(value); }
function formatOr(value: string, fallback: string) { return value.trim() || fallback; }
function unique(values: string[]) { return Array.from(new Set(values.filter(Boolean))); }
function number(value: string) { if (!value.trim()) return null; const result = Number(value.replace(/[$,%\s,]/g, "")); return Number.isFinite(result) && result >= 0 ? result : null; }
function percent(value: string) { const parsed = number(value); return parsed === null ? null : Math.min(parsed > 1 ? parsed / 100 : parsed, 1); }
function money(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value); }
function title(value: string) { return value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase()); }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function hasForbiddenKey(value: unknown, depth: number): boolean { if (depth > 12 || !value || typeof value !== "object") return false; if (Array.isArray(value)) return value.some((item) => hasForbiddenKey(item, depth + 1)); return Object.entries(value).some(([key, nested]) => /(^|_)(api_?key|access_?token|refresh_?token|cookie|private_?key|secret)(_|$)/i.test(key) || hasForbiddenKey(nested, depth + 1)); }
