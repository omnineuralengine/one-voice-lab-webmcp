import type {
  AppliedMlLens,
  ClientDiscoveryInput,
  ClientScenario,
  SolutionRecipe,
} from "@/types/applied-voice";

const BASE_DISCOVERY: ClientDiscoveryInput = {
  industry: "Technology",
  userJourney: "A person speaks with a service team or automated workflow.",
  primaryBusinessProblem: "Voice interactions create slow, inconsistent manual work.",
  currentWorkflow: "People listen, take notes, and update business systems manually.",
  desiredOutcome: "A reviewable voice workflow that improves speed without removing human control.",
  humanUsers: ["Customer", "service specialist", "operations reviewer"],
  audience: "both",
  direction: "both",
  audioSources: ["uploaded-recordings"],
  conversationProfiles: ["two-person-call"],
  processing: "batch",
  expectedConcurrency: "Validate during discovery",
  typicalAudioDuration: "5–20 minutes",
  audioFormat: "Unknown; inspect representative samples",
  languagesAndAccents: ["English; validate actual language/accent distribution"],
  requiredResponseLatency: "No target supplied",
  dataRetention: "Minimize by default; customer policy required",
  regionDataResidency: "Customer requirement not yet supplied",
  selfHostedRequired: null,
  cloudEnvironment: "Unknown",
  applicationStack: "Unknown",
  telephonyProvider: "None identified",
  downstreamSystems: ["Customer-owned system; integration not installed"],
  workflowRequirements: ["transcript", "audit-record"],
  transcriptionFailureBehavior: "Preserve the source reference and queue human review.",
  functionFailureBehavior: "Do not claim success; retain context and offer a safe retry or handoff.",
  uncertaintyBehavior: "State uncertainty and request clarification or human review.",
  humanHandoffRequired: true,
  mustNeverHappen: ["Expose credentials", "Perform an unauthorized action", "Hide a failed operation"],
};

function scenario(
  id: string,
  name: string,
  summary: string,
  input: Partial<ClientDiscoveryInput>,
  learningFocus: string[],
): ClientScenario {
  return {
    id,
    name,
    summary,
    input: { ...BASE_DISCOVERY, ...input, scenarioId: id },
    learningFocus,
    provenance: "example",
  };
}

export const CLIENT_SCENARIOS: ClientScenario[] = [
  scenario(
    "saas-support",
    "SaaS support platform",
    "Reduce after-call work and make support conversations searchable and reviewable.",
    {
      industry: "B2B SaaS",
      userJourney: "A customer explains a product issue to a support specialist.",
      primaryBusinessProblem: "Agents manually summarize calls and lose diagnostic detail.",
      desiredOutcome: "Searchable transcript, case summary, intent, and a draft ticket update.",
      audioSources: ["contact-center-recording", "live-media-stream"],
      processing: "both",
      workflowRequirements: ["transcript", "summary", "intent", "searchable-words-timestamps", "human-escalation", "audit-record"],
      downstreamSystems: ["CRM/helpdesk concept", "knowledge base concept"],
    },
    ["Batch versus realtime", "support vocabulary", "human-reviewed CRM payload"],
  ),
  scenario(
    "contact-center-agent-assist",
    "Contact-center live agent assist",
    "Give a human agent timely transcript and context while they remain in control.",
    {
      industry: "Contact center",
      userJourney: "Caller and agent speak while assist cues update in near realtime.",
      primaryBusinessProblem: "Agents search multiple systems while listening and responding.",
      desiredOutcome: "Realtime transcript, turn-aware cues, and safe lookup suggestions.",
      audioSources: ["pstn-phone-call", "sip-rtp-media", "live-media-stream"],
      conversationProfiles: ["two-person-call", "high-interruption", "noisy"],
      processing: "realtime",
      requiredResponseLatency: "Set a measured cue-latency target with the customer",
      workflowRequirements: ["transcript", "speaker-labels", "intent", "function-tool-call", "human-escalation"],
      downstreamSystems: ["Contact-center desktop concept", "CRM concept", "knowledge base concept"],
    },
    ["Media bridging", "interim/final stability", "latency budget", "agent trust"],
  ),
  scenario(
    "healthcare-scheduling",
    "Healthcare appointment scheduling",
    "Help callers find appointment options with explicit confirmation and human fallback.",
    {
      industry: "Healthcare",
      userJourney: "A patient calls to ask about or schedule an appointment.",
      primaryBusinessProblem: "Scheduling calls are repetitive but errors can have serious impact.",
      desiredOutcome: "Collect minimum required details, present availability, confirm, and hand off when uncertain.",
      audioSources: ["pstn-phone-call"],
      conversationProfiles: ["interactive-voice-agent", "high-interruption", "domain-vocabulary"],
      processing: "realtime",
      workflowRequirements: ["agent-response", "function-tool-call", "human-escalation", "audit-record", "voice-output"],
      downstreamSystems: ["Scheduling system concept", "human scheduling queue"],
      humanHandoffRequired: true,
      mustNeverHappen: ["Expose credentials", "Provide medical advice", "Book without explicit confirmation", "Claim a booking succeeded after a tool failure"],
    },
    ["Confirmation", "minimum necessary data", "tool idempotency", "safe scope"],
  ),
  scenario(
    "fintech-fraud-ops",
    "Fintech fraud operations",
    "Review fraud-related calls faster while keeping decisions with authorized humans.",
    {
      industry: "Financial services",
      userJourney: "An operations analyst reviews a suspicious customer call.",
      primaryBusinessProblem: "Long recordings delay evidence review and escalation.",
      desiredOutcome: "Searchable, speaker-aware transcript and review cues linked to evidence.",
      audioSources: ["contact-center-recording", "uploaded-recordings"],
      conversationProfiles: ["two-person-call", "domain-vocabulary", "noisy"],
      workflowRequirements: ["transcript", "speaker-labels", "summary", "topics", "searchable-words-timestamps", "human-escalation", "audit-record"],
      downstreamSystems: ["Protected fraud review queue concept"],
      mustNeverHappen: ["Expose credentials", "Automatically accuse a customer", "Perform a financial action", "Treat sentiment as fraud proof"],
    },
    ["Evidence linkage", "human review", "number accuracy", "protected retention"],
  ),
  scenario(
    "retail-care",
    "Retail inventory and customer care",
    "Answer stock questions using a bounded inventory lookup and escalation path.",
    {
      industry: "Retail",
      userJourney: "A shopper asks whether an item is available at a store.",
      primaryBusinessProblem: "Store staff repeatedly check inventory while serving customers.",
      desiredOutcome: "Understand item/location, call a read-only inventory tool, and communicate freshness limits.",
      audioSources: ["browser-microphone", "mobile-application", "pstn-phone-call"],
      conversationProfiles: ["interactive-voice-agent", "noisy", "domain-vocabulary"],
      processing: "realtime",
      workflowRequirements: ["agent-response", "function-tool-call", "human-escalation", "voice-output"],
      downstreamSystems: ["Inventory service concept", "store handoff"],
    },
    ["Entity extraction", "data freshness", "read-only tools", "store noise"],
  ),
  scenario(
    "ecommerce-returns",
    "E-commerce returns",
    "Guide a customer through return eligibility without making unauthorized account changes.",
    {
      industry: "E-commerce",
      userJourney: "A customer explains a return and provides an order reference.",
      primaryBusinessProblem: "Agents spend time collecting repeated order and reason details.",
      desiredOutcome: "Capture the request, look up an order, explain policy, and create a reviewable ticket.",
      audioSources: ["pstn-phone-call", "browser-microphone"],
      conversationProfiles: ["interactive-voice-agent", "domain-vocabulary"],
      processing: "realtime",
      workflowRequirements: ["intent", "function-tool-call", "human-escalation", "audit-record", "voice-output"],
      downstreamSystems: ["Order service concept", "ticketing concept"],
      mustNeverHappen: ["Issue a refund without authorization", "Claim an order lookup succeeded when it failed", "Expose another customer's order"],
    },
    ["Spelled identifiers", "confirmation", "policy grounding", "human exception path"],
  ),
  scenario(
    "media-clipping",
    "Media transcription and clipping",
    "Make long-form media searchable and anchor clips to reviewed timestamps.",
    {
      industry: "Media",
      userJourney: "An editor uploads a program and searches for useful segments.",
      primaryBusinessProblem: "Manual logging and clip discovery take too long.",
      desiredOutcome: "Transcript with word timing, topics, and human-approved clip boundaries.",
      audioSources: ["uploaded-recordings", "live-media-stream"],
      conversationProfiles: ["multi-speaker-meeting", "domain-vocabulary"],
      processing: "batch",
      typicalAudioDuration: "10 minutes–3 hours",
      workflowRequirements: ["transcript", "speaker-labels", "topics", "searchable-words-timestamps", "audit-record"],
      downstreamSystems: ["Media asset manager concept", "search index concept"],
    },
    ["Word timing", "speaker labels", "long-form batching", "editor review"],
  ),
  scenario(
    "education-advising",
    "Education advising",
    "Capture advising context and action items without replacing the advisor's judgment.",
    {
      industry: "Education",
      userJourney: "A student and advisor discuss goals, requirements, and next steps.",
      primaryBusinessProblem: "Important follow-ups are scattered across notes.",
      desiredOutcome: "Consent-based transcript, summary, and advisor-reviewed next steps.",
      audioSources: ["browser-microphone", "uploaded-recordings"],
      conversationProfiles: ["two-person-call", "domain-vocabulary"],
      processing: "both",
      workflowRequirements: ["transcript", "speaker-labels", "summary", "topics", "human-escalation"],
      downstreamSystems: ["Student support record concept"],
    },
    ["Consent", "reviewable summaries", "domain vocabulary", "retention boundaries"],
  ),
  scenario(
    "logistics-exceptions",
    "Logistics exception management",
    "Capture urgent exception details and route them to the correct operations workflow.",
    {
      industry: "Logistics",
      userJourney: "A driver or dispatcher reports a late, damaged, or blocked shipment.",
      primaryBusinessProblem: "Noisy calls and ambiguous identifiers slow exception routing.",
      desiredOutcome: "Capture shipment reference, classify exception, and escalate with a traceable summary.",
      audioSources: ["mobile-application", "pstn-phone-call"],
      conversationProfiles: ["interactive-voice-agent", "noisy", "domain-vocabulary"],
      processing: "realtime",
      workflowRequirements: ["intent", "function-tool-call", "human-escalation", "audit-record", "voice-output"],
      downstreamSystems: ["Shipment system concept", "operations queue"],
    },
    ["Noise robustness", "identifier accuracy", "urgent escalation", "offline/network recovery"],
  ),
  scenario(
    "sports-live-content",
    "Sports/live-event content",
    "Create low-latency searchable metadata while preserving editorial review.",
    {
      industry: "Sports and live media",
      userJourney: "A production team follows live commentary and publishes searchable moments.",
      primaryBusinessProblem: "Fast commentary, crowd noise, and names make manual metadata difficult.",
      desiredOutcome: "Realtime transcript cues plus reviewed event metadata and clips.",
      audioSources: ["live-media-stream"],
      conversationProfiles: ["monologue", "noisy", "domain-vocabulary", "high-interruption"],
      processing: "realtime",
      requiredResponseLatency: "Set separately for captions, metadata, and publishing",
      workflowRequirements: ["transcript", "topics", "searchable-words-timestamps", "audit-record"],
      downstreamSystems: ["Production metadata system concept", "search index concept"],
    },
    ["Proper nouns", "crowd noise", "latency versus stability", "editor validation"],
  ),
  scenario(
    "enterprise-meetings",
    "Internal enterprise meeting intelligence",
    "Build a consent-based, access-controlled meeting record with reviewable summaries.",
    {
      industry: "Enterprise",
      userJourney: "A distributed team holds a meeting and later searches decisions.",
      primaryBusinessProblem: "Decisions and actions are hard to retrieve across meetings.",
      desiredOutcome: "Speaker-aware transcript, summary, topics, and human-approved action record.",
      audioSources: ["webrtc", "uploaded-recordings"],
      conversationProfiles: ["multi-speaker-meeting", "multilingual-code-switching", "domain-vocabulary"],
      processing: "both",
      workflowRequirements: ["transcript", "speaker-labels", "summary", "topics", "searchable-words-timestamps", "audit-record"],
      downstreamSystems: ["Protected document/search system concept"],
    },
    ["Speaker attribution", "multilingual coverage", "access control", "retention"],
  ),
];

const DEFAULT_LENS: AppliedMlLens = {
  hypothesis: "The proposed configuration improves the target workflow on representative audio.",
  expectedBenefit: "Higher task usefulness without an unacceptable latency or reliability regression.",
  likelyDownside: "Performance can vary across accents, audio channels, noise, and domain terms.",
  dataNeeded: "Consented, representative examples segmented by language, accent, device, noise, and workflow.",
  metric: "Task-specific accuracy plus latency, failure rate, and human review outcome.",
  minimumTestSet: "Start with at least 30 representative examples and expand before production; rare/high-risk segments need deliberate coverage.",
  failureSegment: "Track the worst meaningful segment, not only the aggregate average.",
  rolloutStrategy: "Offline evaluation, shadow traffic, bounded canary, then gradual rollout with review.",
  rollbackCondition: "Rollback on a material quality, safety, latency, or business-outcome regression.",
};

type RecipeSeed = {
  id: string;
  name: string;
  problem: string;
  scenarioId: string;
  architecture: string[];
  components: string[];
  tools: string[];
  latency: string[];
  privacy: string[];
  operations: string[];
};

const RECIPE_SEEDS: RecipeSeed[] = [
  { id: "contact-center-agent-assist", name: "Contact-center live agent assist", problem: "Agents need timely context without surrendering call control.", scenarioId: "contact-center-agent-assist", architecture: ["Contact-center media", "Realtime STT", "customer assist orchestrator", "knowledge/CRM lookup", "agent desktop"], components: ["Streaming Speech to Text (verify chosen model/options)", "temporary token only for authorized browser realtime where appropriate"], tools: ["lookup_customer", "search_knowledge_base", "escalate_to_human"], latency: ["Measure transcript cue delay", "Separate media, STT, lookup, and UI budgets"], privacy: ["Minimize desktop-visible PII", "Define recording/transcript consent and retention"], operations: ["stt-live", "auth-token"] },
  { id: "inbound-appointment-agent", name: "Automated inbound appointment agent", problem: "Scheduling demand is repetitive, but booking errors are high impact.", scenarioId: "healthcare-scheduling", architecture: ["Telephony/media provider", "turn-aware voice orchestration", "availability tool", "confirmation", "TTS/media return", "human handoff"], components: ["Voice Agent concept or cascaded STT → orchestrator → TTS", "Deepgram speech recognition and TTS"], tools: ["check_appointment_availability", "book_appointment", "escalate_to_human"], latency: ["End-of-turn and first-audio latency", "Tool timeout before spoken confirmation"], privacy: ["Collect minimum necessary data", "Never provide medical advice", "Confirm before booking"], operations: ["voice-agent-converse", "stt-live", "tts-single", "auth-token"] },
  { id: "outbound-voice-follow-up", name: "Outbound transactional voice follow-up", problem: "Customers miss time-sensitive transactional updates.", scenarioId: "saas-support", architecture: ["Consented customer event", "approved template", "TTS", "outbound provider concept", "delivery outcome"], components: ["Text to Speech"], tools: [], latency: ["Synthesis latency is secondary to delivery reliability"], privacy: ["Use consented channels", "Minimize content", "Do not imply a third-party provider is connected"], operations: ["tts-single"] },
  { id: "saas-call-intelligence", name: "SaaS technical support call intelligence", problem: "Support calls are difficult to search and summarize consistently.", scenarioId: "saas-support", architecture: ["Recording/upload", "prerecorded STT", "optional documented analysis", "human-reviewed ticket payload", "search"], components: ["Prerecorded Speech to Text", "Text Intelligence only where current documented capability fits"], tools: ["create_support_ticket", "search_knowledge_base"], latency: ["Optimize turnaround time rather than conversational latency"], privacy: ["Protect transcripts", "Authorize helpdesk writes", "Retain source evidence"], operations: ["stt-file", "text-intelligence-analyze"] },
  { id: "retail-inventory-assistant", name: "Retail inventory voice assistant", problem: "Customers and staff need fast, bounded inventory answers.", scenarioId: "retail-care", architecture: ["Voice input", "STT/turn handling", "inventory lookup", "freshness-qualified response", "TTS or display"], components: ["Speech to Text", "Text to Speech; Voice Agent is an optional architecture after validation"], tools: ["get_inventory", "escalate_to_human"], latency: ["Lookup and response latency", "Interruptibility in noisy stores"], privacy: ["Avoid collecting unnecessary identity data", "Communicate inventory freshness"], operations: ["stt-live", "tts-single"] },
  { id: "fintech-fraud-review", name: "Fintech fraud-call review", problem: "Analysts need faster evidence navigation without automated accusations or financial action.", scenarioId: "fintech-fraud-ops", architecture: ["Protected recording", "prerecorded STT", "search/timing", "human review", "audit evidence"], components: ["Prerecorded Speech to Text", "Diarization if supported and validated for the audio"], tools: [], latency: ["Batch throughput and analyst time-to-evidence"], privacy: ["Strict access/retention", "Never treat sentiment as proof", "No automated financial actions"], operations: ["stt-file"] },
  { id: "healthcare-scheduling-assistant", name: "Healthcare scheduling assistant", problem: "Patients need accessible scheduling with a safe scope and fallback.", scenarioId: "healthcare-scheduling", architecture: ["Inbound media", "voice orchestration", "scheduling tools", "confirmation", "human queue"], components: ["Deepgram realtime speech and TTS", "Voice Agent only after official event/config validation"], tools: ["check_appointment_availability", "book_appointment", "escalate_to_human"], latency: ["User-perceived turn latency", "Bound tool waits"], privacy: ["Customer legal/security/compliance validation required", "Minimum necessary data", "No medical advice"], operations: ["voice-agent-converse", "stt-live", "tts-single"] },
  { id: "ecommerce-returns-automation", name: "E-commerce returns automation", problem: "Return intake is repetitive and identifier-heavy.", scenarioId: "ecommerce-returns", architecture: ["Voice input", "order-number capture", "read-only order lookup", "policy response", "ticket/human exception"], components: ["Speech to Text", "Text to Speech for voice response"], tools: ["lookup_order", "create_support_ticket", "escalate_to_human"], latency: ["Fast clarification for spelled identifiers", "Bound tool timeout"], privacy: ["Authenticate before disclosure", "No refund mutation in the lab"], operations: ["stt-live", "tts-single"] },
  { id: "media-transcription-clipping", name: "Media transcription and clipping", problem: "Editors need searchable long-form media and reliable clip anchors.", scenarioId: "media-clipping", architecture: ["Media upload/URL", "prerecorded STT", "word timing", "search/topic layer", "editor-approved clips"], components: ["Prerecorded Speech to Text", "Documented analysis capability where appropriate"], tools: ["search_knowledge_base"], latency: ["Batch completion time", "Editor retrieval speed"], privacy: ["Rights/consent validation", "Controlled source storage"], operations: ["stt-url", "stt-file", "text-intelligence-analyze"] },
  { id: "sports-live-metadata", name: "Sports live-content metadata", problem: "Production teams need fast metadata despite names, speed, and crowd noise.", scenarioId: "sports-live-content", architecture: ["Live commentary feed", "streaming STT", "event metadata layer", "editor review", "publish/search"], components: ["Streaming Speech to Text", "Keyterms only where documented for the chosen model"], tools: [], latency: ["Separate caption, metadata, and publish targets", "Measure stability as well as speed"], privacy: ["Rights and distribution controls", "Human review before editorial publishing"], operations: ["stt-live"] },
  { id: "education-advising-assistant", name: "Education advising assistant", problem: "Advising decisions and follow-ups are difficult to retrieve.", scenarioId: "education-advising", architecture: ["Consented meeting audio", "STT", "reviewable summary", "advisor approval", "protected record"], components: ["Speech to Text", "Text analysis only after capability validation"], tools: ["search_knowledge_base", "escalate_to_human"], latency: ["Review turnaround, not realtime response, is primary"], privacy: ["Consent", "Access control", "Student-record retention policy"], operations: ["stt-file", "text-intelligence-analyze"] },
  { id: "logistics-exception-agent", name: "Logistics exception agent", problem: "Noisy, urgent exception calls require accurate identifiers and routing.", scenarioId: "logistics-exceptions", architecture: ["Mobile/phone audio", "realtime STT", "exception state machine", "shipment lookup concept", "human operations queue"], components: ["Streaming Speech to Text", "TTS for bounded prompts"], tools: ["search_knowledge_base", "create_support_ticket", "escalate_to_human"], latency: ["Fast acknowledgement", "Network recovery", "Identifier confirmation"], privacy: ["Minimize driver/customer data", "No unsafe instructions while driving"], operations: ["stt-live", "tts-single"] },
  { id: "multilingual-concierge", name: "Multilingual concierge", problem: "Customers need language-aware assistance with escalation for unsupported or ambiguous cases.", scenarioId: "retail-care", architecture: ["Voice input", "supported language selection/detection", "STT", "bounded orchestration", "appropriate TTS voice or human handoff"], components: ["Speech to Text and Text to Speech after checking current language/model support"], tools: ["lookup_customer", "search_knowledge_base", "escalate_to_human"], latency: ["Language routing and turn latency", "Avoid repeated failed recognition"], privacy: ["Disclose automation", "Avoid inferring sensitive identity from language", "Human escalation"], operations: ["stt-live", "tts-single"] },
  { id: "enterprise-voice-search", name: "Internal enterprise voice search", problem: "Teams cannot reliably retrieve decisions from consented meetings.", scenarioId: "enterprise-meetings", architecture: ["Meeting audio", "STT/diarization", "protected indexing", "access-filtered retrieval", "source-linked answer"], components: ["Speech to Text", "Self-hosted or regional deployment only after enterprise requirement validation"], tools: ["search_knowledge_base"], latency: ["Index freshness", "Search response time"], privacy: ["Consent and access inheritance", "Retention", "No broad indexing by default"], operations: ["stt-file", "self-hosted-architecture"] },
];

const SCENARIO_BY_ID = new Map(CLIENT_SCENARIOS.map((item) => [item.id, item]));

export const SOLUTION_RECIPES: SolutionRecipe[] = RECIPE_SEEDS.map((seed) => {
  const preset = SCENARIO_BY_ID.get(seed.scenarioId);
  return {
    id: seed.id,
    name: seed.name,
    clientProblem: seed.problem,
    discoveryAnswers: preset?.input ?? {},
    architecture: seed.architecture,
    deepgramComponents: seed.components,
    payloadExamples: [
      { kind: "sanitized-example", authorization: "***redacted***", input: "$AUDIO_OR_TEXT", options: "Verify in API Studio" },
      { kind: "handoff-example", session_id: "local-session-example", source_field: "$UPSTREAM_OUTPUT", target_field: "$NEXT_INPUT" },
    ],
    eventFlow: seed.architecture.map((step, index) => `${index + 1}. ${step}`),
    tools: seed.tools,
    storageOutput: ["Sanitized trace metadata", "Customer-controlled business record after validation", "No raw credentials or temporary tokens"],
    latencyPriorities: seed.latency,
    evaluationPlan: ["Build a representative, consented test set", "Measure task-specific quality by segment", "Track latency and failures separately", "Require human review for subjective/high-risk outcomes"],
    failureHandling: ["Preserve correlation IDs", "Explain failure without claiming success", "Use bounded retries only when safe", "Offer human handoff"],
    privacyConcerns: seed.privacy,
    proofOfConceptScope: ["One bounded user journey", "One representative audio path", "Read-only or local simulated tools first", "Agreed success metrics and failure cases"],
    productionRoadmap: ["Expand evaluation segments", "Security/compliance review", "Load and failure testing", "Canary with rollback", "Operational runbook and feedback loop"],
    codeLabFiles: ["src/app/api/deepgram", "src/lib/inspection.ts", "Customer integration files are suggested concepts, not installed connectors"],
    apiStudioOperationIds: seed.operations,
    appliedMlLens: { ...DEFAULT_LENS, hypothesis: `${seed.name} meets its target outcome on representative customer audio and failure cases.` },
    provenance: "concept",
  };
});

export function getClientScenario(id: string): ClientScenario | undefined {
  return CLIENT_SCENARIOS.find((item) => item.id === id);
}

export function getSolutionRecipe(id: string): SolutionRecipe | undefined {
  return SOLUTION_RECIPES.find((item) => item.id === id);
}
