import { DEEPGRAM_CAPABILITIES } from "@/data/deepgram-capabilities";
import { getQuestion } from "@/data/architecture-studio-discovery";
import { resolveDiscoveryProfile, formatAnswer } from "@/lib/architecture-studio/recommendation-engine";
import type {
  PackageComponentRecommendation,
  PackageRecommendationResult,
  PublicStudioSession,
  RecommendationConfidence,
  RecommendationGap,
  StudioAnswerValue,
  StudioDiscoverySchema,
  StudioSession,
  ValidationTest,
} from "@/types/architecture-studio";

type SessionLike = StudioSession | PublicStudioSession;
type Values = Record<string, StudioAnswerValue>;

const REQUIRED_DISCOVERY: Array<{
  questionId: string;
  title: string;
  assumption: string;
  nextQuestion: string;
  impact: string;
}> = [
  { questionId: "primary-use-case", title: "Primary use case is not confirmed", assumption: "Treat the first milestone as an evaluation rather than a production package.", nextQuestion: "Which one customer workflow should the first proof of concept make measurably better?", impact: "The speech mode, return-audio path, orchestration, and success metrics may all change." },
  { questionId: "workflow", title: "Workflow direction is unclear", assumption: "Assume a mixed workflow until inbound, outbound, assist, or analytics is prioritized.", nextQuestion: "Is the first workflow inbound, outbound, agent assist, analytics, or deliberately mixed?", impact: "Caller-response, human-agent, and asynchronous analytics modules may be added or removed." },
  { questionId: "ccaas-platform", title: "CCaaS boundary is unknown", assumption: "Retain the existing platform and integrate at a documented media-stream seam.", nextQuestion: "Which platform owns call control and where can it expose media?", impact: "Ingress ownership, media gateway placement, and authentication will change." },
  { questionId: "processing-mode", title: "Audio processing mode is unknown", assumption: "Evaluate streaming and prerecorded paths separately.", nextQuestion: "Must the result arrive during the call, after the call, or both?", impact: "WebSocket streaming may be replaced by batch intake, queues, and replay." },
  { questionId: "languages", title: "Language scope is incomplete", assumption: "Use only explicitly confirmed languages in the first evaluation.", nextQuestion: "Which languages, accents, and code-switching patterns are required on day one?", impact: "Model selection, language configuration, fixtures, and TTS voices may change." },
  { questionId: "concurrency", title: "Peak concurrency is unknown", assumption: "Do not size connections or private infrastructure yet.", nextQuestion: "What are the expected average and peak concurrent sessions?", impact: "Connection pooling, load tests, regional routing, and deployment economics may change." },
  { questionId: "deployment-preference", title: "Deployment boundary is unclear", assumption: "Use hosted cloud only as an evaluation hypothesis.", nextQuestion: "Is hosted, private cloud, VPC, on-premises, or hybrid operation required?", impact: "Every Deepgram runtime boundary and operational owner may change." },
  { questionId: "data-control", title: "Privacy constraints are incomplete", assumption: "Minimize retained content and keep business data customer-owned.", nextQuestion: "Which residency, retention, logging, vendor-access, and key-control constraints are non-negotiable?", impact: "Deployment, logging, storage, redaction, and observability may change." },
  { questionId: "turn-taking", title: "Turn-taking expectations are unconfirmed", assumption: "Measure interruption and end-of-turn behavior before tuning for speed.", nextQuestion: "What should happen when the caller interrupts or pauses mid-thought?", impact: "Flux, playback cancellation, timeout, and orchestration decisions may change." },
  { questionId: "primary-metrics", title: "Decision metrics are not prioritized", assumption: "Use accuracy, end-to-end latency, task success, and recovery as provisional categories.", nextQuestion: "Which two or three metrics decide whether the proof of concept advances?", impact: "The validation plan and observability instrumentation may change." },
  { questionId: "poc-success-criteria", title: "Proof-of-concept success is not defined", assumption: "Treat all current recommendations as hypotheses.", nextQuestion: "What specific evidence would make the team advance, revise, or stop the proof of concept?", impact: "Acceptance gates and the recommended operating model may change." },
];

export function normalizeDiscovery(values: Values): StudioDiscoverySchema {
  const speechDetails = list(values["speech-details"]);
  const transcriptFeatures = list(values["transcript-features"]);
  return {
    scenarioName: stringValue(values["company-name"]),
    industry: list(values.industry),
    primaryUseCases: list(values["primary-use-case"]),
    workflow: list(values.workflow),
    ccaasProvider: stringValue(values["ccaas-platform"]),
    telephonyProvider: stringValue(values["telephony-provider"]),
    currentVoiceStack: stringValue(values["current-voice-stack"] ?? values["provider-details"]),
    processingMode: stringValue(values["processing-mode"]),
    concurrentSessions: stringValue(values.concurrency),
    monthlyMinutes: stringValue(values["monthly-minutes"]),
    languagesAndAccents: [...new Set([...list(values.languages), ...list(values["audio-conditions"]).filter((item) => item === "accents")])],
    noisyAudioConditions: list(values["audio-conditions"]),
    domainTerminology: speechDetails.includes("domain-terms"),
    diarizationRequired: transcriptFeatures.includes("diarization"),
    interruptionAndTurnTaking: list(values["turn-taking"]),
    latencyTarget: stringValue(values["conversation-timing-targets"]),
    accuracyTarget: stringValue(values["metric-targets"]),
    privacyConstraints: [...new Set([...list(values["data-control"]), ...list(values["pii-compliance"])])],
    retentionConstraint: stringValue(values["retention-expectations"]),
    deploymentPreference: stringValue(values["deployment-preference"]),
    llmOrchestration: stringValue(values["provider-details"]),
    businessSystems: list(values["business-systems"]),
    ttsRequirements: list(values["tts-requirements"]),
    observabilityRequirements: [...new Set([...list(values["observability-stack"]), ...list(values["logging-audit"])])],
    budgetSensitivity: stringValue(values["budget-sensitivity"]),
    launchTimeline: stringValue(values["launch-window"]),
    proofOfConceptSuccessCriteria: stringValue(values["poc-success-criteria"]),
  };
}

export function recommendPackage(session: SessionLike): PackageRecommendationResult {
  const profile = resolveDiscoveryProfile(session);
  const values = profile.values;
  const discovery = normalizeDiscovery(values);
  const components = buildComponents(values, discovery);
  const gaps = buildGaps(values, profile.disagreements, components);
  const confidence = packageConfidence(values, profile.disagreements.length, components);
  return {
    generatedAt: session.updatedAt,
    discovery,
    confidence,
    confidenceReason: confidenceReason(confidence, values, profile.disagreements.length, gaps.length),
    components,
    gaps,
    validationPlan: buildValidationPlan(values, discovery, gaps),
  };
}

function buildComponents(values: Values, discovery: StudioDiscoverySchema) {
  const components: PackageComponentRecommendation[] = [];
  const add = (component: Omit<PackageComponentRecommendation, "confidence" | "verificationNeeded"> & { confidence?: RecommendationConfidence }) => {
    if (components.some((item) => item.id === component.id)) return;
    const capability = component.capabilityId ? DEEPGRAM_CAPABILITIES.find((item) => item.id === component.capabilityId) : undefined;
    const verificationNeeded = Boolean(component.capabilityId && capability?.documentationStatus !== "verified");
    components.push({
      ...component,
      confidence: component.confidence ?? confidenceForSources(values, component.sourceQuestionIds, verificationNeeded),
      verificationNeeded,
    });
  };
  const useCases = discovery.primaryUseCases;
  const streaming = discovery.processingMode !== "prerecorded" && (discovery.processingMode === "streaming" || discovery.processingMode === "both" || useCases.some((item) => ["voice-agent", "inbound-service", "outbound-notifications", "agent-assist"].includes(item)));
  const batch = discovery.processingMode === "prerecorded" || discovery.processingMode === "both" || useCases.some((item) => ["analytics", "call-transcription", "quality-assurance", "summarization"].includes(item));
  const voiceAgent = useCases.includes("voice-agent") || useCases.includes("voice-transactions");
  const turnSensitive = discovery.interruptionAndTurnTaking.some((item) => ["barge-in", "fast-end-turn", "configurable-silence"].includes(item));

  if (streaming) {
    add({ id: "streaming-transport", architectureModuleId: "media-gateway", category: "ingress", customerRequirement: requirement(values, ["workflow", "media-path"], "Live media must enter the speech path without replacing the CCaaS platform."), architecturalDecision: "Keep the CCaaS boundary and expose a controlled realtime media stream.", capabilityOrApproach: "WebSocket streaming through the existing media gateway", capabilityId: "sdk-browser-telephony", whyItFits: "It preserves call control while making codec, backpressure, reconnect, and latency ownership explicit.", tradeoffOrLimitation: "The customer still owns media framing, connection lifecycle, and safe credential exchange.", validationMethod: "Trace one call from CCaaS media egress through connection open, first audio, first transcript, and close/reconnect.", sourceQuestionIds: ["ccaas-platform", "media-path", "processing-mode"] });
  }

  if (voiceAgent && turnSensitive) {
    add({ id: "flux-turn-handling", architectureModuleId: "deepgram-flux", category: "speech", customerRequirement: requirement(values, ["primary-use-case", "turn-taking"], "The voice agent must handle caller turns and interruptions."), architecturalDecision: "Evaluate Flux as the conversational speech-recognition and turn-event boundary.", capabilityOrApproach: "Flux conversational speech recognition", capabilityId: "flux-stt", whyItFits: "The requirement is conversational turn handling, not transcription alone.", tradeoffOrLimitation: "End-of-turn settings, language behavior, media format, cancellation, and full-loop latency still require representative testing.", validationMethod: "Replay natural pauses, false starts, barge-in, resumed turns, and long-silence cases while recording emitted turn events and downstream cancellation.", sourceQuestionIds: ["primary-use-case", "turn-taking", "languages", "audio-format"] });
  } else if (streaming) {
    add({ id: "nova-streaming-stt", architectureModuleId: "deepgram-stt", category: "speech", customerRequirement: requirement(values, ["primary-use-case", "processing-mode"], "The application needs live transcription."), architecturalDecision: "Evaluate Nova-3 on the streaming speech-to-text path.", capabilityOrApproach: "Nova-3 streaming speech-to-text", capabilityId: "nova-3-streaming", whyItFits: "It provides a modular live transcript boundary while the customer retains downstream behavior.", tradeoffOrLimitation: "Turn detection and playback interruption remain system-level responsibilities.", validationMethod: "Measure first transcript, final transcript, entity accuracy, and connection recovery on representative live media.", sourceQuestionIds: ["primary-use-case", "processing-mode", "languages", "audio-conditions"] });
  }

  if (batch) {
    add({ id: "batch-transcription", architectureModuleId: "deepgram-stt", category: "speech", customerRequirement: requirement(values, ["primary-use-case", "processing-mode"], "Recorded conversations require repeatable asynchronous processing."), architecturalDecision: "Use a separate prerecorded transcription intake and retry path.", capabilityOrApproach: "Nova-3 prerecorded speech-to-text", capabilityId: "nova-3-batch", whyItFits: "Batch evaluation is reproducible and separates archive processing from realtime connection concerns.", tradeoffOrLimitation: "Queueing, storage, retention, replay, and downstream analytics remain customer-owned.", validationMethod: "Run a versioned held-out corpus through deterministic request settings and compare against human-reviewed references.", sourceQuestionIds: ["processing-mode", "primary-use-case", "audio-duration"] });
  }

  if (discovery.domainTerminology) {
    add({ id: "domain-keyterms", architectureModuleId: voiceAgent && turnSensitive ? "deepgram-flux" : "deepgram-stt", category: "speech", customerRequirement: requirement(values, ["speech-details"], "Domain terminology and critical names must be recognized correctly."), architecturalDecision: "Create a bounded, versioned keyterm set and score critical entities separately.", capabilityOrApproach: "Keyterm prompting", capabilityId: "keyterm-prompting", whyItFits: "The customer identified vocabulary errors as a business risk rather than a generic accuracy concern.", tradeoffOrLimitation: "Prompting can improve targeted vocabulary but cannot compensate for poor audio or replace held-out evaluation.", validationMethod: "Compare baseline and prompted configurations on an untouched set of domain terms, names, numbers, and identifiers.", sourceQuestionIds: ["speech-details", "baseline", "metric-targets"] });
  }

  const transcriptFeatures = list(values["transcript-features"]);
  if (discovery.diarizationRequired) {
    add({ id: "speaker-diarization", architectureModuleId: "transcript-processing", category: "speech", customerRequirement: requirement(values, ["channel-layout", "transcript-features"], "Downstream consumers need speaker attribution."), architecturalDecision: "Evaluate diarization and compare it with known channel separation where available.", capabilityOrApproach: "Speaker diarization", capabilityId: "diarization", whyItFits: "It makes multi-speaker transcripts usable when authenticated channel identity is unavailable.", tradeoffOrLimitation: "Inferred speaker labels are not authenticated identities and may be less reliable than dual-channel audio.", validationMethod: "Score speaker attribution separately on overlap, handoff, and same-gender speaker slices.", sourceQuestionIds: ["channel-layout", "transcript-features", "audio-conditions"] });
  }
  if (transcriptFeatures.some((item) => ["punctuation", "smart-format", "timestamps", "profanity"].includes(item))) {
    add({ id: "transcript-formatting", architectureModuleId: "transcript-processing", category: "speech", customerRequirement: requirement(values, ["transcript-features", "speech-details"], "Transcripts must be readable and safe for downstream systems."), architecturalDecision: "Enable only the required formatting features for each tested model, language, and mode.", capabilityOrApproach: "Punctuation and smart formatting", capabilityId: "formatting", whyItFits: "The requested output structure is part of usability and entity correctness.", tradeoffOrLimitation: "Formatting can change how numbers and tokens are represented; feature compatibility varies by configuration.", validationMethod: "Review formatted critical entities and downstream parser behavior against unformatted transcript evidence.", sourceQuestionIds: ["transcript-features", "speech-details", "languages"] });
  }
  if (transcriptFeatures.includes("redaction") || discovery.privacyConstraints.some((item) => ["pii", "pci", "health", "no-transcript-logs"].includes(item))) {
    add({ id: "transcript-redaction", architectureModuleId: "transcript-processing", category: "governance", customerRequirement: requirement(values, ["pii-compliance", "data-control"], "Sensitive transcript content needs an explicit handling boundary."), architecturalDecision: "Evaluate transcript redaction before governed downstream storage or analytics.", capabilityOrApproach: "Transcript redaction", capabilityId: "redaction", whyItFits: "It can reduce supported sensitive values in transcript output before downstream distribution.", tradeoffOrLimitation: "Transcript redaction is not audio redaction or a legal determination; support varies by language, mode, and deployment.", validationMethod: "Use synthetic sensitive fixtures, record false positives/negatives, and verify raw audio and downstream log boundaries separately.", sourceQuestionIds: ["transcript-features", "pii-compliance", "data-control", "retention-expectations"] });
  }

  if (discovery.languagesAndAccents.length > 0) {
    add({ id: "language-strategy", architectureModuleId: voiceAgent && turnSensitive ? "deepgram-flux" : "deepgram-stt", category: "speech", customerRequirement: requirement(values, ["languages", "audio-conditions"], "The first release needs a defined language and accent strategy."), architecturalDecision: "Pin the tested model and language configuration per workflow; evaluate multilingual behavior separately.", capabilityOrApproach: "Language and multilingual strategy", capabilityId: "language-support", whyItFits: "Language scope is explicit and can be represented in the evaluation matrix.", tradeoffOrLimitation: "Support differs by model and mode; a listed language does not prove accent or code-switching quality.", validationMethod: "Stratify representative audio by language, accent, code switching, noise, and critical vocabulary.", sourceQuestionIds: ["languages", "audio-conditions", "processing-mode"] });
    if (batch && discovery.languagesAndAccents.includes("multilingual-growth")) {
      add({ id: "batch-language-detection", architectureModuleId: "deepgram-stt", category: "speech", customerRequirement: "Prerecorded audio may arrive without reliable language metadata.", architecturalDecision: "Evaluate dominant-language detection only on the prerecorded intake path.", capabilityOrApproach: "Prerecorded language detection", capabilityId: "language-detection", whyItFits: "It can route unknown-language recordings without claiming realtime language detection.", tradeoffOrLimitation: "Language detection is not a streaming feature and does not solve within-call code switching.", validationMethod: "Measure routing accuracy on a labeled multilingual recording set and define a low-confidence fallback.", sourceQuestionIds: ["languages", "processing-mode"] });
    }
  }

  if (discovery.noisyAudioConditions.some((item) => ["noise", "packet-loss", "far-field", "overlap"].includes(item))) {
    add({ id: "audio-preprocessing", architectureModuleId: "audio-preprocessing", category: "ingress", customerRequirement: requirement(values, ["audio-conditions", "audio-format"], "Noisy mobile and telephony audio must be diagnosed before model tuning."), architecturalDecision: "Add a measured preprocessing and media-quality checkpoint before speech recognition.", capabilityOrApproach: "Customer-owned audio normalization, validation, and optional preprocessing", whyItFits: "It separates codec, clipping, level, packet, and channel failures from ASR behavior.", tradeoffOrLimitation: "Aggressive denoising or resampling can remove speech information and add latency.", validationMethod: "Compare untouched and transformed variants with signal metrics plus transcript and critical-entity review.", sourceQuestionIds: ["audio-conditions", "audio-format", "channel-layout"] });
  }

  if (voiceAgent) {
    add({ id: "agent-orchestration", architectureModuleId: "orchestrator", category: "conversation", customerRequirement: requirement(values, ["agent-actions", "provider-details"], "The voice agent needs a controlled conversation and tool-execution layer."), architecturalDecision: "Retain or evaluate orchestration as a distinct module with bounded tool contracts.", capabilityOrApproach: "Customer orchestration or Voice Agent API operating-model comparison", whyItFits: "Speech quality alone cannot own prompts, tools, confirmation, authorization, or recovery.", tradeoffOrLimitation: "A managed pipeline reduces integration surface; a composable path preserves control but increases customer-owned operations.", validationMethod: "Run the same scripted tasks and failure cases through each viable operating model with identical evidence gates.", sourceQuestionIds: ["pipeline-preference", "existing-providers", "provider-details", "agent-actions"] });
  }

  const tts = discovery.ttsRequirements;
  if (voiceAgent && !tts.includes("none") && !tts.includes("existing-provider")) {
    add({ id: "deepgram-tts", architectureModuleId: "deepgram-tts", category: "conversation", customerRequirement: requirement(values, ["tts-requirements", "languages"], "The caller needs streaming, interruptible speech output."), architecturalDecision: "Evaluate Deepgram TTS as a separable response component.", capabilityOrApproach: "Aura-2 text-to-speech", capabilityId: "aura-2", whyItFits: "It supports a modular return-audio path without forcing the customer to replace its LLM or tools.", tradeoffOrLimitation: "Voice, language, formatting, buffering, and playback cancellation affect the complete experience.", validationMethod: "Measure first audio, interruption stop time, intelligibility, language/voice fit, and reconnect behavior.", sourceQuestionIds: ["tts-requirements", "languages", "turn-taking"] });
  }

  const deployment = discovery.deploymentPreference;
  if (["private-cloud", "self-hosted", "on-prem", "hybrid", "compare"].includes(deployment ?? "")) {
    add({ id: "private-deployment", architectureModuleId: "deployment-boundary", category: "deployment", customerRequirement: requirement(values, ["deployment-preference", "data-control"], "The customer needs a customer-controlled or compared deployment boundary."), architecturalDecision: "Run a private/self-hosted feasibility and commercial validation before sizing topology.", capabilityOrApproach: "Self-hosted or hybrid deployment exploration", capabilityId: "self-hosted-deployment", whyItFits: "The selected control boundary can dominate model and integration choices.", tradeoffOrLimitation: "Hardware, scaling, feature parity, regional availability, support, and commercial assumptions require direct confirmation.", validationMethod: "Validate required models/features, infrastructure ownership, capacity envelope, upgrade process, and failure recovery with Deepgram.", sourceQuestionIds: ["deployment-preference", "data-control", "concurrency", "monthly-minutes"] });
  } else {
    add({ id: "hosted-deployment", architectureModuleId: "deployment-boundary", category: "deployment", customerRequirement: requirement(values, ["deployment-preference", "launch-window"], "The proof of concept needs a low-infrastructure starting boundary."), architecturalDecision: "Start with the hosted API as a reversible evaluation boundary.", capabilityOrApproach: "Deepgram hosted cloud API", capabilityId: "hosted-deployment", whyItFits: "It keeps the first integration focused on representative evidence and customer-owned seams.", tradeoffOrLimitation: "Residency, retention, regional, capacity, entitlement, and commercial assumptions still require validation.", validationMethod: "Complete security review, confirm regional/data handling assumptions, and measure the deployed network path.", sourceQuestionIds: ["deployment-preference", "data-control", "contact-regions"] });
  }

  add({ id: "observability", architectureModuleId: "observability", category: "operations", customerRequirement: requirement(values, ["observability-stack", "primary-metrics"], "The team needs evidence for latency, quality, errors, and handoffs."), architecturalDecision: "Instrument every major audio, transcript, control, and business-action boundary.", capabilityOrApproach: "Customer-owned observability and evaluation pipeline", whyItFits: "It keeps recommendation claims tied to measured session evidence rather than product assumptions.", tradeoffOrLimitation: "Content-safe telemetry requires deliberate redaction and retention rules.", validationMethod: "Verify correlation IDs across ingress, speech, orchestration, tools, playback, handoff, and recovery events.", sourceQuestionIds: ["observability-stack", "logging-audit", "primary-metrics", "data-control"] });

  if (voiceAgent || list(values["availability"]).length > 0) {
    add({ id: "fallback-recovery", architectureModuleId: "fallback-recovery", category: "operations", customerRequirement: requirement(values, ["failure-behavior", "availability"], "The workflow must fail safely when speech, tools, or providers are unavailable."), architecturalDecision: "Add bounded retry, safe defaults, context-preserving human handoff, and explicit recovery ownership.", capabilityOrApproach: "Application-level fallback and recovery components", whyItFits: "Recoverability is part of the customer experience and cannot be delegated to a speech model.", tradeoffOrLimitation: "Fallback paths add state, testing, and operational complexity.", validationMethod: "Inject timeouts, disconnects, partial tool failures, duplicate actions, and provider errors; verify no unsafe repetition or lost handoff context.", sourceQuestionIds: ["failure-behavior", "availability", "action-controls"] });
  }

  return components;
}

function buildGaps(values: Values, disagreements: Array<{ questionId: string; values: StudioAnswerValue[] }>, components: PackageComponentRecommendation[]) {
  const gaps: RecommendationGap[] = [];
  const add = (gap: RecommendationGap) => { if (!gaps.some((item) => item.id === gap.id)) gaps.push(gap); };
  for (const item of REQUIRED_DISCOVERY) {
    if (known(values[item.questionId])) continue;
    add({ id: `missing-${item.questionId}`, category: "missing", title: item.title, whyItMatters: getQuestion(item.questionId)?.whyItMatters ?? item.impact, workingAssumption: item.assumption, nextQuestion: item.nextQuestion, architectureImpact: item.impact, sourceQuestionIds: [item.questionId] });
  }
  for (const disagreement of disagreements) {
    const label = getQuestion(disagreement.questionId)?.label ?? disagreement.questionId;
    add({ id: `conflict-${disagreement.questionId}`, category: "conflict", title: `${label} has conflicting stakeholder answers`, whyItMatters: "The engine should preserve disagreement instead of silently selecting one stakeholder’s preference.", workingAssumption: "Keep the competing options visible and use the same validation gates for each viable path.", nextQuestion: `Which evidence or decision owner will resolve the disagreement about ${label.toLowerCase()}?`, architectureImpact: "The operating model, component owner, or evaluation branch may change.", sourceQuestionIds: [disagreement.questionId] });
  }
  for (const component of components.filter((item) => item.verificationNeeded)) {
    add({ id: `verify-${component.id}`, category: "verification", title: `${component.capabilityOrApproach} needs Deepgram confirmation`, whyItMatters: component.tradeoffOrLimitation, workingAssumption: "Treat this as an exploration path, not a supported entitlement or commercial commitment.", nextQuestion: "Which model, feature, deployment, region, capacity, and account assumptions must Deepgram validate?", architectureImpact: `The ${component.architectureModuleId.replaceAll("-", " ")} module or its ownership boundary may change.`, sourceQuestionIds: component.sourceQuestionIds });
  }
  if (!known(values.concurrency)) add({ id: "measure-concurrency", category: "measurement", title: "Concurrency needs measurement", whyItMatters: "Realtime capacity depends on simultaneous connections, not monthly volume alone.", workingAssumption: "Use no production capacity claim until peak concurrency is observed.", nextQuestion: "What are the average, p95, and peak concurrent sessions during representative periods?", architectureImpact: "Connection management, load test size, regional routing, and deployment economics may change.", sourceQuestionIds: ["concurrency"] });
  if (!known(values["monthly-minutes"])) add({ id: "measure-volume", category: "measurement", title: "Monthly usage is unknown", whyItMatters: "Operating cost and batch throughput require a volume assumption separate from concurrency.", workingAssumption: "Report unit measurements and leave total cost as a placeholder.", nextQuestion: "What monthly minutes and growth range should the evaluation model?", architectureImpact: "Batch throughput, storage, and operating-model economics may change.", sourceQuestionIds: ["monthly-minutes", "budget-sensitivity"] });
  const targets = stringValue(values["metric-targets"]);
  if (!targets) {
    add({ id: "define-latency-target", category: "measurement", title: "Latency target lacks a test definition", whyItMatters: "A latency target is meaningless without start/stop points and percentile treatment.", workingAssumption: "Measure stage-level and end-to-end distributions without an invented pass threshold.", nextQuestion: "Where does the latency clock start and stop, and which percentile must meet what threshold?", architectureImpact: "Turn settings, speculative work, tool placement, buffering, and regional routing may change.", sourceQuestionIds: ["conversation-timing-targets", "metric-targets"] });
    add({ id: "define-accuracy-target", category: "measurement", title: "Accuracy target lacks a test definition", whyItMatters: "Aggregate word error rate can hide failures in names, amounts, account numbers, and domain terms.", workingAssumption: "Create a human-reviewed baseline and report accuracy by failure slice and critical entity.", nextQuestion: "Which reference set, metric, slices, and critical-entity threshold define acceptable accuracy?", architectureImpact: "Model, prompting, preprocessing, and human-review gates may change.", sourceQuestionIds: ["baseline", "speech-details", "metric-targets"] });
  }
  return gaps;
}

function buildValidationPlan(values: Values, discovery: StudioDiscoverySchema, gaps: RecommendationGap[]) {
  const tests: ValidationTest[] = [];
  const add = (test: ValidationTest) => { if (!tests.some((item) => item.id === test.id)) tests.push(test); };
  const targets = stringValue(values["metric-targets"]);
  const targetOrPlaceholder = targets || "Customer-defined threshold required after the baseline is measured.";
  const prerequisites = (ids: string[]) => gaps.filter((gap) => ids.some((id) => gap.sourceQuestionIds.includes(id))).map((gap) => gap.title);

  add({ id: "representative-audio", category: "audio", title: "Representative audio corpus", evidenceNeeded: "Consented or synthetic samples spanning normal calls and edge cases, with no real secrets in the demo workspace.", method: `Stratify by ${display(discovery.languagesAndAccents, "language and accent")}, ${display(discovery.noisyAudioConditions, "audio condition")}, channel, codec, duration, and critical vocabulary. Keep a held-out set.`, acceptanceCriteria: "Dataset coverage is reviewed by business, voice-platform, and security owners before model comparison.", unresolvedPrerequisites: prerequisites(["languages", "audio-conditions", "audio-format"]), sourceQuestionIds: ["languages", "audio-conditions", "audio-format", "speech-details"] });
  add({ id: "accuracy", category: "accuracy", title: "Transcription and critical-entity accuracy", evidenceNeeded: "Human-reviewed reference transcripts plus labeled names, terminology, numbers, and identifiers.", method: "Compare the incumbent and recommended configurations on the same held-out audio; report aggregate and slice-level errors separately.", acceptanceCriteria: targetOrPlaceholder, unresolvedPrerequisites: prerequisites(["baseline", "metric-targets", "speech-details"]), sourceQuestionIds: ["baseline", "speech-details", "metric-targets", "primary-metrics"] });
  if (discovery.processingMode !== "prerecorded") add({ id: "latency", category: "latency", title: "End-to-end and stage latency", evidenceNeeded: "Monotonic timestamps for ingress, first audio sent, first/final transcript or turn event, LLM/tool work, first playback, and handoff.", method: "Report p50/p95/p99 distributions and isolate network, speech, orchestration, tool, and playback stages.", acceptanceCriteria: discovery.latencyTarget || targetOrPlaceholder, unresolvedPrerequisites: prerequisites(["conversation-timing-targets", "metric-targets"]), sourceQuestionIds: ["conversation-timing-targets", "metric-targets", "primary-metrics"] });
  if (discovery.interruptionAndTurnTaking.length > 0 || discovery.primaryUseCases.includes("voice-agent")) add({ id: "interruption", category: "conversation", title: "Turn-taking and interruption", evidenceNeeded: "Scripted and unscripted pauses, overlaps, false starts, resumed turns, barge-in, and playback cancellation events.", method: "Measure false cuts, missed ends, interruption stop time, recovery behavior, and downstream speculative-work cancellation.", acceptanceCriteria: targetOrPlaceholder, unresolvedPrerequisites: prerequisites(["turn-taking", "conversation-timing-targets"]), sourceQuestionIds: ["turn-taking", "conversation-timing-targets", "failure-behavior"] });
  if (discovery.noisyAudioConditions.some((item) => ["noise", "packet-loss", "far-field", "overlap"].includes(item))) add({ id: "noisy-audio", category: "audio", title: "Noisy and degraded audio", evidenceNeeded: "Mobile noise, packet loss/jitter, overlap, far-field, clipping, and codec mismatch slices.", method: "Compare untouched audio with any proposed preprocessing; review signal evidence, transcripts, and critical entities together.", acceptanceCriteria: targetOrPlaceholder, unresolvedPrerequisites: prerequisites(["audio-conditions", "audio-format"]), sourceQuestionIds: ["audio-conditions", "audio-format", "channel-layout"] });
  if (discovery.primaryUseCases.includes("voice-agent")) add({ id: "business-task", category: "business", title: "Business-task completion", evidenceNeeded: "A bounded task set with expected tool calls, confirmation points, safe failure states, and human handoff outcomes.", method: "Score task success, unsafe action avoidance, clarification, handoff context, duplicate prevention, and recovery—not just transcript quality.", acceptanceCriteria: discovery.proofOfConceptSuccessCriteria || targetOrPlaceholder, unresolvedPrerequisites: prerequisites(["poc-success-criteria", "agent-actions", "action-controls"]), sourceQuestionIds: ["poc-success-criteria", "agent-actions", "action-controls", "failure-behavior"] });
  add({ id: "resilience", category: "resilience", title: "Failure, fallback, and recovery", evidenceNeeded: "Injected WebSocket disconnects, timeouts, partial tool failures, provider errors, duplicate requests, and handoff failures.", method: "Verify bounded retries, idempotency, safe defaults, rollback, reconnect, and context-preserving human escalation.", acceptanceCriteria: "No unsafe duplicate action; every injected failure reaches a documented recovery or safe stop state.", unresolvedPrerequisites: prerequisites(["failure-behavior", "availability", "action-controls"]), sourceQuestionIds: ["failure-behavior", "availability", "action-controls"] });
  add({ id: "scale", category: "scale", title: "Concurrency and volume", evidenceNeeded: "Expected average/peak sessions, monthly minutes, call-duration distribution, and regional traffic shape.", method: "Run connection ramp, peak, soak, reconnect, and backpressure tests; record resource and error behavior without extrapolating unmeasured limits.", acceptanceCriteria: known(values.concurrency) ? `Sustain the customer-supplied ${formatAnswer(values.concurrency)} band within agreed error and recovery guardrails.` : "Customer-supplied concurrency and error thresholds required.", unresolvedPrerequisites: prerequisites(["concurrency", "monthly-minutes"]), sourceQuestionIds: ["concurrency", "monthly-minutes", "audio-duration"] });
  if (discovery.privacyConstraints.length > 0 || discovery.deploymentPreference) add({ id: "governance", category: "governance", title: "Security and data-boundary validation", evidenceNeeded: "Approved data-flow diagram, retention/logging inventory, regional path, access model, deletion process, and vendor-review questions.", method: "Trace synthetic sensitive data through audio, transcript, telemetry, storage, exports, and deletion; record assumptions for legal/security owners.", acceptanceCriteria: "Security and legal reviewers confirm the documented architecture can enter a controlled pilot; no compliance conclusion is generated by the Studio.", unresolvedPrerequisites: prerequisites(["data-control", "deployment-preference", "retention-expectations"]), sourceQuestionIds: ["data-control", "deployment-preference", "retention-expectations", "pii-compliance"] });
  return tests;
}

function packageConfidence(values: Values, disagreementCount: number, components: PackageComponentRecommendation[]): RecommendationConfidence {
  const knownRequired = REQUIRED_DISCOVERY.filter((item) => known(values[item.questionId])).length;
  const ratio = knownRequired / REQUIRED_DISCOVERY.length;
  const verificationPenalty = components.filter((item) => item.verificationNeeded).length > 0 ? 0.08 : 0;
  const conflictPenalty = Math.min(0.25, disagreementCount * 0.08);
  const score = ratio - verificationPenalty - conflictPenalty;
  if (score >= 0.82) return "high";
  if (score >= 0.58) return "moderate";
  if (score >= 0.3) return "developing";
  return "low";
}

function confidenceReason(confidence: RecommendationConfidence, values: Values, disagreements: number, gapCount: number) {
  const knownRequired = REQUIRED_DISCOVERY.filter((item) => known(values[item.questionId])).length;
  return `${confidence[0].toUpperCase()}${confidence.slice(1)} confidence: ${knownRequired} of ${REQUIRED_DISCOVERY.length} package-decision inputs are known, ${disagreements} stakeholder conflict${disagreements === 1 ? "" : "s"} remain, and ${gapCount} assumption or validation item${gapCount === 1 ? "" : "s"} are visible.`;
}

function confidenceForSources(values: Values, questionIds: string[], verificationNeeded: boolean): RecommendationConfidence {
  const knownCount = questionIds.filter((id) => known(values[id])).length;
  const ratio = questionIds.length ? knownCount / questionIds.length : 0;
  if (!verificationNeeded && ratio >= 0.8) return "high";
  if (ratio >= 0.55) return "moderate";
  if (ratio >= 0.25) return "developing";
  return "low";
}

function requirement(values: Values, questionIds: string[], fallback: string) {
  const evidence = questionIds.filter((id) => known(values[id])).map((id) => `${getQuestion(id)?.label ?? id}: ${formatAnswer(values[id])}`);
  return evidence.length ? evidence.join(" · ") : fallback;
}

function known(value: StudioAnswerValue | undefined) {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0 && !value.every((item) => ["not-sure", "other"].includes(String(item)));
  if (typeof value === "string") return value.trim().length > 0 && !["not-sure", "other", "undecided"].includes(value);
  return true;
}

function list(value: StudioAnswerValue | undefined): string[] {
  return Array.isArray(value) ? value.map(String) : value === undefined ? [] : [String(value)];
}

function stringValue(value: StudioAnswerValue | undefined) {
  return Array.isArray(value) ? value.map(String).join(", ") : value === undefined ? undefined : String(value);
}

function display(values: string[], fallback: string) {
  return values.length ? values.map((value) => value.replaceAll("-", " ")).join(", ") : fallback;
}
