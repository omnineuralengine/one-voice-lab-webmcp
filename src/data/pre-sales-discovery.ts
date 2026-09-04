import type { DiscoveryQuickSelectGroup, DiscoveryQuickSelectId, DiscoveryQuickSelectOption, DiscoveryStageDefinition } from "@/types/pre-sales-studio";

const notSure: DiscoveryQuickSelectOption = { value: "not-sure", label: "Not sure yet", description: "Keep this visible as an open question.", kind: "not-sure" };
const other: DiscoveryQuickSelectOption = { value: "other", label: "Other", description: "Add the customer-specific answer below.", kind: "other" };
const choices = (...items: Array<[string, string, string?]>): DiscoveryQuickSelectOption[] => [
  ...items.map(([value, label, description]) => ({ value, label, description })), notSure, other,
];

export const PRE_SALES_DISCOVERY_GROUPS: readonly DiscoveryQuickSelectGroup[] = [
  {
    id: "industry", stageId: "context", label: "Industry", question: "Which operating environment best matches the first opportunity?", whyItMatters: "Industry context changes terminology, governance, buyer risk, and the evaluation corpus.", field: "industry", selection: "single", fast: false, notePrompt: "Industry nuance or customer-specific description",
    options: choices(["contact-center", "Contact center / CCaaS"], ["healthcare", "Healthcare"], ["financial-services", "Financial services"], ["retail", "Retail / commerce"], ["software-platform", "Software platform"], ["public-sector", "Public sector"], ["media", "Media / communications"], ["industrial", "Industrial / field operations"]),
  },
  {
    id: "customer-type", stageId: "context", label: "Customer type", question: "Who is building or operating the voice experience?", whyItMatters: "The operating model clarifies integration ownership and who must approve production readiness.", field: "customerType", selection: "single", fast: false, notePrompt: "Customer type or operating-model nuance",
    options: choices(["enterprise", "Enterprise end user"], ["saas-platform", "SaaS platform"], ["ccaas", "CCaaS provider"], ["systems-integrator", "Systems integrator"], ["ai-startup", "AI-native startup"], ["regulated-operator", "Regulated operator"]),
  },
  {
    id: "business-outcome", stageId: "context", label: "Primary outcome", question: "Which outcomes must the first production workflow improve?", whyItMatters: "Business outcomes determine which technical metrics matter and prevent an isolated model benchmark from becoming the goal.", field: "businessOutcomePriorities", selection: "multi", fast: true, notePrompt: "Customer language, KPI definition, or executive framing",
    options: choices(["task-completion", "Task completion"], ["containment", "Containment / deflection"], ["response-speed", "Faster response"], ["customer-experience", "Customer experience"], ["agent-productivity", "Agent productivity"], ["quality-coverage", "QA / audit coverage"], ["revenue", "Conversion / revenue"], ["risk-reduction", "Risk reduction"]),
  },
  {
    id: "workload-mode", stageId: "workflow", label: "Voice workload", question: "Does the first use case need live voice, prerecorded processing, or both?", whyItMatters: "Realtime and batch paths use different transports, retry models, measurements, and feature combinations.", field: "workloadMode", selection: "single", fast: true, notePrompt: "Describe the media lifecycle or phased rollout",
    options: choices(["streaming", "Live voice"], ["prerecorded", "Prerecorded audio"], ["both", "Both live and prerecorded"], ["live-plus-post-call", "Live voice + post-call QA"]),
  },
  {
    id: "interaction-model", stageId: "workflow", label: "Interaction model", question: "Who is speaking to whom in the first workflow?", whyItMatters: "A human conversation, voice agent, and machine-to-machine media path create different turn-taking and safety needs.", field: "interactionModel", selection: "single", fast: true, notePrompt: "Describe handoff, agent-assist, or machine interaction details",
    options: choices(["human-to-human", "Human to human"], ["human-with-assist", "Human with agent assist"], ["human-to-agent", "Human to AI agent"], ["agent-to-agent", "Agent to agent"]),
  },
  {
    id: "traffic-direction", stageId: "workflow", label: "Traffic direction", question: "Where does the first production traffic originate?", whyItMatters: "Direction changes consent, campaign, routing, media-control, and escalation assumptions.", field: "trafficDirection", selection: "single", fast: false, notePrompt: "Traffic mix, routing, or initiation detail",
    options: choices(["inbound", "Inbound"], ["outbound", "Outbound"], ["internal", "Internal"], ["mixed", "Mixed traffic"]),
  },
  {
    id: "concurrency-scale", stageId: "scale", label: "Concurrency and scale", question: "What load envelope should the first architecture be prepared to validate?", whyItMatters: "Capacity, rate limits, regional design, tail latency, and commercial sizing depend on peak shape—not only monthly minutes.", field: "concurrencyScale", selection: "single", fast: true, notePrompt: "Known average, peak, burst, growth, or monthly volume",
    options: choices(["prototype", "Prototype · under 10"], ["small", "Small · 10–100"], ["medium", "Medium · 100–1,000"], ["large", "Large · 1,000–10,000"], ["very-large", "Very large · 10,000+"], ["bursty", "Bursty / event-driven"]),
  },
  {
    id: "latency-sensitivity", stageId: "scale", label: "Latency sensitivity", question: "How does latency affect the customer experience or business task?", whyItMatters: "The answer determines whether to optimize turn behavior, first result, final result, batch completion, or a downstream boundary.", field: "latencySensitivity", selection: "single", fast: true, notePrompt: "Define the start event, stop event, percentile, and customer tolerance",
    options: choices(["turn-critical", "Turn-critical conversation"], ["realtime", "Realtime but tolerant"], ["near-realtime", "Near realtime"], ["batch", "Batch completion"], ["not-primary", "Not a primary constraint"]),
  },
  {
    id: "language-profile", stageId: "audio", label: "Languages and accents", question: "Which language conditions need explicit evaluation slices?", whyItMatters: "Language, accent, code-switching, model, and enabled features must be evaluated together.", field: "languageProfiles", selection: "multi", fast: false, notePrompt: "Prioritized languages, locale codes, dialects, or code-switching pairs",
    options: choices(["english", "English"], ["spanish", "Spanish"], ["multilingual", "Multiple languages"], ["regional-accents", "Regional accents"], ["code-switching", "Code-switching"], ["non-english-first", "Non-English primary"], ["future-expansion", "Future language expansion"]),
  },
  {
    id: "audio-environment", stageId: "audio", label: "Audio environment", question: "Which audio conditions could change the result?", whyItMatters: "Representative audio—not clean demo audio—determines whether model, preprocessing, and fallback choices are credible.", field: "audioEnvironments", selection: "multi", fast: false, notePrompt: "Noise sources, devices, codecs, channels, or rare high-risk conditions",
    options: choices(["clean", "Clean / controlled"], ["noisy-mobile", "Noisy mobile"], ["telephony-bandwidth", "Telephony bandwidth"], ["overlap", "Overlapping speakers"], ["far-field", "Far-field microphone"], ["low-bandwidth", "Low bandwidth"], ["mixed-devices", "Mixed devices / codecs"]),
  },
  {
    id: "integration-channel", stageId: "integration", label: "Integration surface", question: "Where does speech enter and leave the customer system?", whyItMatters: "The media boundary determines authentication, encoding, transport, reconnect, and component ownership.", field: "integrationChannels", selection: "multi", fast: false, notePrompt: "Name the telephony, CCaaS, application, gateway, or embedded boundary",
    options: choices(["browser", "Browser / WebRTC"], ["telephony", "Telephony / SIP"], ["contact-center", "Contact center / CCaaS"], ["mobile", "Mobile application"], ["server", "Server / media gateway"], ["embedded", "Embedded device"], ["uploaded-media", "Uploaded media"]),
  },
  {
    id: "existing-provider", stageId: "integration", label: "Existing providers", question: "Which parts of the current voice stack should the evaluation account for?", whyItMatters: "An evidence-led architecture should retain working components unless a requirement justifies change.", field: "existingProviderCategories", selection: "multi", fast: false, notePrompt: "Provider names, contracts, internal platforms, or known constraints",
    options: choices(["speech-provider", "Speech provider"], ["cloud-provider", "Cloud AI provider"], ["telephony-provider", "Telephony provider"], ["ccaas-provider", "CCaaS platform"], ["llm-provider", "LLM provider"], ["custom-stack", "Custom / open-source stack"]),
  },
  {
    id: "migration-posture", stageId: "integration", label: "Migration posture", question: "How much of the current stack is open to change?", whyItMatters: "Migration posture distinguishes a composable insertion, parallel evaluation, augmentation, or broader platform change.", field: "migrationPosture", selection: "single", fast: false, notePrompt: "What must be retained, replaced, or isolated during evaluation?",
    options: choices(["retain", "Retain current stack"], ["augment", "Augment one component"], ["parallel", "Evaluate in parallel"], ["replace-speech", "Replace speech layer"], ["broader-redesign", "Broader redesign"]),
  },
  {
    id: "deployment", stageId: "governance", label: "Deployment", question: "Which deployment boundary is acceptable for the first production workload?", whyItMatters: "Deployment changes infrastructure ownership, product compatibility, security review, operations, and commercial validation.", field: "deployment", selection: "single", fast: true, notePrompt: "Infrastructure, isolation, networking, key ownership, or disaster-recovery detail",
    options: choices(["shared-cloud", "Shared cloud"], ["dedicated", "Dedicated environment"], ["vpc", "Customer VPC"], ["self-hosted", "Self-hosted"], ["on-premises", "On premises"], ["air-gapped", "Air gapped"]),
  },
  {
    id: "residency", stageId: "governance", label: "Data residency", question: "Where may audio, transcripts, logs, and evaluation artifacts be processed?", whyItMatters: "A regional endpoint choice alone does not settle the complete customer data boundary.", field: "residencyNeeds", selection: "multi", fast: false, notePrompt: "Named regions, cross-border restrictions, or customer-controlled boundary",
    options: choices(["us", "United States"], ["eu", "European Union"], ["india", "India"], ["apac", "Asia Pacific"], ["single-region", "Single-region only"], ["customer-boundary", "Customer-controlled boundary"]),
  },
  {
    id: "compliance", stageId: "governance", label: "Compliance expectations", question: "Which review domains must the technical plan support?", whyItMatters: "The Studio can expose engineering controls and questions, but it must not make a legal or certification determination.", field: "complianceExpectations", selection: "multi", fast: false, notePrompt: "Required review, contractual control, or counsel-confirmed obligation",
    options: choices(["pii", "PII"], ["phi", "PHI / healthcare"], ["pci", "Payment data"], ["financial", "Financial regulation"], ["public-sector", "Public-sector controls"], ["customer-policy", "Customer-specific policy"]),
  },
  {
    id: "retention", stageId: "governance", label: "Retention", question: "What retention posture should the architecture assume?", whyItMatters: "Audio, transcripts, logs, and evaluation artifacts require separate retention and deletion decisions.", field: "retentionExpectation", selection: "single", fast: false, notePrompt: "Retention duration, deletion workflow, legal hold, or logging exclusions",
    options: choices(["no-retention", "No provider retention"], ["transient", "Transient processing"], ["short-term", "Short-term evaluation"], ["customer-managed", "Customer-managed retention"], ["policy-defined", "Policy-defined retention"]),
  },
  {
    id: "evaluation-criteria", stageId: "evaluation", label: "Evaluation criteria", question: "Which evidence should determine technical fit?", whyItMatters: "Selecting the evaluation dimensions makes the recommendation falsifiable and keeps averages from hiding critical slices.", field: "evaluationCriteria", selection: "multi", fast: false, notePrompt: "Metric definition, baseline, comparison method, dataset, or guardrail",
    options: choices(["accuracy", "Overall accuracy"], ["domain-terms", "Domain-term accuracy"], ["latency", "Latency percentiles"], ["turn-taking", "Turn-taking / interruption"], ["reliability", "Reliability / recovery"], ["scale", "Concurrency / scale"], ["cost", "Cost / efficiency"], ["security", "Security / governance"]),
  },
  {
    id: "poc-success", stageId: "evaluation", label: "POC success", question: "Which outcomes would justify the next investment decision?", whyItMatters: "A POC needs business and technical acceptance gates, owners, and a proceed/revise/stop decision.", field: "pocSuccessCriteria", selection: "multi", fast: true, notePrompt: "Customer-defined target, measurement owner, sample size, or exit condition",
    options: choices(["task-completion", "Task completion"], ["quality-threshold", "Quality threshold"], ["latency-threshold", "Latency threshold"], ["safe-handoff", "Safe handoff"], ["load-gate", "Load gate"], ["integration-complete", "Vertical integration"], ["security-approved", "Security approval"], ["economic-case", "Economic case"]),
  },
  {
    id: "timeline", stageId: "delivery", label: "Timeline", question: "What decision or launch window is the customer working toward?", whyItMatters: "Timeline determines POC scope, dependency risk, and whether the first milestone should be discovery, prototype, pilot, or migration.", field: "implementationTimeline", selection: "single", fast: false, notePrompt: "Exact date, procurement dependency, pilot window, or phased rollout",
    options: choices(["two-weeks", "Within 2 weeks"], ["one-month", "Within 1 month"], ["quarter", "This quarter"], ["two-quarters", "Within 2 quarters"], ["year", "Within 12 months"], ["exploratory", "Exploratory / no date"]),
  },
  {
    id: "implementation-owner", stageId: "delivery", label: "Implementation ownership", question: "Which teams must own the vertical slice and production handoff?", whyItMatters: "A technically sound design still stalls when media, application, security, evaluation, and launch ownership are unclear.", field: "implementationOwners", selection: "multi", fast: false, notePrompt: "Named owner, stakeholder, dependency, or approval path",
    options: choices(["customer-engineering", "Customer engineering"], ["voice-platform", "Voice platform"], ["applied-engineering", "Applied Engineering"], ["security", "Security / infrastructure"], ["data-evaluation", "Data / evaluation"], ["customer-success", "Customer Success"], ["joint", "Joint customer + Deepgram"]),
  },
] as const;

export const PRE_SALES_DISCOVERY_STAGES: readonly DiscoveryStageDefinition[] = [
  { id: "context", title: "Customer and outcome", detail: "Frame the buyer, operating context, and measurable business change.", groupIds: ["industry", "customer-type", "business-outcome"], advancedFields: ["desiredBusinessOutcome", "currentWorkflow", "reasonNow", "currentProblemCost", "executiveSponsor", "buyingProcess"] },
  { id: "workflow", title: "Voice workflow", detail: "Define the media lifecycle and who participates in the conversation.", groupIds: ["workload-mode", "interaction-model", "traffic-direction"], advancedFields: ["products", "monthlyAudioMinutes", "monthlyCallCount", "averageCallDuration", "audioSources", "codecSampleRate", "channelMode"] },
  { id: "scale", title: "Scale and responsiveness", detail: "Capture the load envelope and which latency boundary matters.", groupIds: ["concurrency-scale", "latency-sensitivity"], advancedFields: ["normalConcurrency", "peakConcurrency", "expectedGrowth", "currentLatency"] },
  { id: "audio", title: "Language and audio", detail: "Expose production media conditions and business-critical language slices.", groupIds: ["language-profile", "audio-environment"], advancedFields: ["languages", "accents", "backgroundNoise", "specialistTerminology", "alphanumericIdentifiers", "codeSwitching", "riskyVocabulary"] },
  { id: "integration", title: "Integration and migration", detail: "Preserve working systems and identify the first replaceable boundary.", groupIds: ["integration-channel", "existing-provider", "migration-posture"], advancedFields: ["incumbentProvider", "telephonyProvider", "contactCenterPlatform", "llmProvider", "crm", "dataWarehouse", "orchestrationLayer", "observabilityTools", "engineeringStack"] },
  { id: "governance", title: "Deployment and governance", detail: "Make data boundaries and review obligations visible without making legal conclusions.", groupIds: ["deployment", "residency", "compliance", "retention"], advancedFields: ["geographicResidency", "retentionConstraints", "sensitiveData", "authenticationRequirements", "compliancePosture"] },
  { id: "evaluation", title: "Evaluation and proof of concept", detail: "Define the evidence and outcomes that make the recommendation falsifiable.", groupIds: ["evaluation-criteria", "poc-success"], advancedFields: ["currentWer", "currentCost", "containment", "conversion", "abandonment", "qaCoverage", "knownFailurePatterns"] },
  { id: "delivery", title: "Timeline and ownership", detail: "Close discovery with a credible decision path and named implementation owners.", groupIds: ["timeline", "implementation-owner"], advancedFields: ["launchDeadline"] },
] as const;

export const FAST_DISCOVERY_GROUP_IDS: readonly DiscoveryQuickSelectId[] = PRE_SALES_DISCOVERY_GROUPS.filter((group) => group.fast).map((group) => group.id);

export function getPreSalesDiscoveryGroup(id: DiscoveryQuickSelectId) {
  return PRE_SALES_DISCOVERY_GROUPS.find((group) => group.id === id)!;
}
