import type { StakeholderRole, StudioQuestion, StudioQuestionOption, StudioStageId } from "@/types/architecture-studio";

export const STUDIO_STAGES: Array<{
  id: StudioStageId;
  number: number;
  label: string;
  shortLabel: string;
  purpose: string;
}> = [
  { id: "objective", number: 1, label: "Customer & objective", shortLabel: "Objective", purpose: "Agree on the business problem before selecting technology." },
  { id: "stack", number: 2, label: "CCaaS & telephony stack", shortLabel: "Stack", purpose: "Find the seams where speech can fit without forcing a platform replacement." },
  { id: "audio", number: 3, label: "Audio & speech environment", shortLabel: "Audio", purpose: "Make accuracy, transport, channel, and concurrency constraints visible." },
  { id: "conversation", number: 4, label: "Conversational behavior", shortLabel: "Behavior", purpose: "Separate fast speech from safe, recoverable customer actions." },
  { id: "governance", number: 5, label: "Security & deployment", shortLabel: "Governance", purpose: "Identify control boundaries and validation work without making legal claims." },
  { id: "success", number: 6, label: "Success & rollout", shortLabel: "Success", purpose: "Turn preferences into measurable evaluation and production gates." },
];

export const STAKEHOLDER_ROLES: Array<{ id: StakeholderRole; label: string; focus: string }> = [
  { id: "vp-customer-experience", label: "VP of Customer Experience", focus: "Outcomes, rollout, customer trust, and operational impact" },
  { id: "voice-platform-engineer", label: "Voice Platform Engineer", focus: "Media path, latency, integration control, and failure behavior" },
  { id: "security-infrastructure-lead", label: "Security & Infrastructure Lead", focus: "Data boundaries, deployment, auditability, and resilience" },
  { id: "observer", label: "Workshop Observer", focus: "Follow the shared profile and react to options" },
];

const o = (value: string, label: string, description?: string): StudioQuestionOption => ({ value, label, description });
const unknown = o("not-sure", "Not sure yet", "Record this as an evaluation question rather than inventing certainty.");
const other = o("other", "Other", "Use the live notes or presenter override to capture the fictional alternative.");
const all = (...options: StudioQuestionOption[]) => [...options, other, unknown];

export const STUDIO_QUESTIONS: StudioQuestion[] = [
  {
    id: "company-name", stageId: "objective", label: "Fictional company", prompt: "What fictional company are we designing for?", kind: "text", placeholder: "Northstar Contact Cloud", critical: true,
    whyItMatters: "A shared fictional identity keeps the workshop concrete without collecting real customer information.", relevantRoles: ["vp-customer-experience"],
  },
  {
    id: "industry", stageId: "objective", label: "Industry", prompt: "Which industries shape the first customer workflows?", kind: "multi",
    options: all(o("ccaas", "CCaaS / contact center"), o("retail", "Retail"), o("financial-services", "Financial services"), o("healthcare", "Healthcare"), o("travel", "Travel and hospitality"), o("technology", "Technology")),
    whyItMatters: "Industry context changes the vocabulary, risk slices, business tasks, and representative audio the proof of concept needs.", relevantRoles: ["vp-customer-experience", "security-infrastructure-lead"],
  },
  {
    id: "experience-problem", stageId: "objective", label: "Customer experience problem", prompt: "Which customer experience problem is most urgent?", kind: "multi", critical: true,
    options: all(o("latency", "Slow response or latency"), o("interruptions", "Poor interruption handling"), o("accuracy", "Transcription accuracy"), o("manual-work", "Too much agent work"), o("inconsistent-quality", "Inconsistent quality"), o("limited-insight", "Limited conversation insight")),
    whyItMatters: "The problem statement determines whether we should optimize a speech component, a complete interaction loop, or an evaluation first.", relevantRoles: ["vp-customer-experience", "voice-platform-engineer"],
  },
  {
    id: "primary-use-case", stageId: "objective", label: "Primary use case", prompt: "Which use cases should the first evaluation cover?", kind: "multi", critical: true,
    options: all(o("voice-agent", "Conversational voice agent"), o("inbound-service", "Inbound customer service"), o("outbound-notifications", "Outbound notifications"), o("agent-assist", "Agent assist"), o("call-transcription", "Call transcription"), o("analytics", "Contact-center analytics"), o("quality-assurance", "Automated quality assurance"), o("summarization", "Post-call summarization"), o("compliance-monitoring", "Real-time compliance monitoring"), o("multilingual", "Multilingual support"), o("routing", "Intelligent call routing"), o("voice-transactions", "Voice-enabled transactions"), o("human-augmentation", "Human-agent augmentation")),
    whyItMatters: "Use cases are stronger routing signals than a preferred product name.", relevantRoles: ["vp-customer-experience", "voice-platform-engineer"],
  },
  {
    id: "workflow", stageId: "objective", label: "Workflow shape", prompt: "Which workflow should the first architecture support?", kind: "multi", critical: true,
    options: all(o("inbound", "Inbound service"), o("outbound", "Outbound"), o("agent-assist", "Agent assist"), o("analytics", "Analytics"), o("mixed", "Mixed workflow")),
    whyItMatters: "Workflow shape determines whether audio must return to a caller, assist a human, or feed an asynchronous intelligence pipeline.", relevantRoles: ["vp-customer-experience", "voice-platform-engineer"],
  },
  {
    id: "business-outcome", stageId: "objective", label: "Expected outcome", prompt: "What outcome would make the pilot worth continuing?", kind: "multi", critical: true,
    options: all(o("better-experience", "Better customer experience"), o("faster-resolution", "Faster resolution"), o("higher-containment", "Higher containment"), o("agent-productivity", "Agent productivity"), o("coverage", "Broader language or channel coverage"), o("risk-reduction", "Reduced operational risk"), o("cost-learning", "Credible unit-cost baseline")),
    whyItMatters: "A solution should be evaluated against business evidence, not only a working API call.", relevantRoles: ["vp-customer-experience"],
  },
  {
    id: "delivery-stage", stageId: "objective", label: "Delivery stage", prompt: "Where is this initiative today?", kind: "single", critical: true,
    options: all(o("prototype", "Prototype"), o("pilot", "Pilot planning"), o("migration", "Provider migration"), o("production", "Production expansion")),
    whyItMatters: "The right starting architecture and proof burden change substantially between a prototype and a migration.", relevantRoles: ["vp-customer-experience", "voice-platform-engineer"],
  },
  {
    id: "launch-window", stageId: "objective", label: "Launch window", prompt: "When does the fictional team want a production pilot?", kind: "single",
    options: all(o("under-6-weeks", "Under 6 weeks"), o("2-3-months", "2–3 months"), o("3-6-months", "3–6 months"), o("over-6-months", "More than 6 months")),
    whyItMatters: "Urgency affects how much integration surface to take on before representative-data validation.", relevantRoles: ["vp-customer-experience"],
  },

  {
    id: "ccaas-platform", stageId: "stack", label: "CCaaS platform", prompt: "Which CCaaS platform anchors the current environment?", kind: "single", critical: true,
    options: all(o("amazon-connect", "Amazon Connect"), o("twilio", "Twilio"), o("genesys", "Genesys"), o("five9", "Five9"), o("talkdesk", "Talkdesk"), o("nice", "NICE"), o("custom", "Custom CCaaS platform")),
    whyItMatters: "This locates the media and event boundaries; it does not imply the CCaaS layer must be replaced.", relevantRoles: ["voice-platform-engineer"], technical: true,
  },
  {
    id: "telephony-provider", stageId: "stack", label: "Telephony provider", prompt: "Which provider or infrastructure owns call ingress?", kind: "single",
    options: all(o("twilio", "Twilio"), o("amazon-connect", "Amazon Connect"), o("genesys", "Genesys"), o("custom-sip", "Custom SIP infrastructure"), o("carrier", "Carrier-managed PSTN")),
    whyItMatters: "Ingress ownership determines where audio can be forked, streamed, recorded, and observed.", relevantRoles: ["voice-platform-engineer"], technical: true,
  },
  {
    id: "media-path", stageId: "stack", label: "Media path", prompt: "How does media move through the current platform?", kind: "multi", critical: true,
    options: all(o("pstn", "PSTN"), o("sip", "SIP / RTP"), o("siprec", "SIPREC"), o("webrtc", "WebRTC"), o("websocket", "WebSocket media gateway"), o("recording", "Prerecorded files")),
    whyItMatters: "Transport and audio framing affect connection ownership, codecs, latency checkpoints, and retry behavior.", relevantRoles: ["voice-platform-engineer"], technical: true,
  },
  {
    id: "cloud-provider", stageId: "stack", label: "Cloud environment", prompt: "Where do the customer-owned services run?", kind: "multi",
    options: all(o("aws", "AWS"), o("azure", "Azure"), o("gcp", "Google Cloud"), o("oracle", "Oracle Cloud"), o("on-prem", "On premises"), o("multi-cloud", "Multi-cloud")),
    whyItMatters: "Cloud locality can shape network paths, regional design, and private-deployment evaluation work.", relevantRoles: ["security-infrastructure-lead", "voice-platform-engineer"], technical: true,
  },
  {
    id: "contact-regions", stageId: "stack", label: "Contact-center regions", prompt: "Which regions are in scope for the initial pilot?", kind: "multi", critical: true,
    options: all(o("us", "United States"), o("eu", "European Union"), o("uk", "United Kingdom"), o("canada", "Canada"), o("latam", "Latin America"), o("apac", "Asia Pacific")),
    whyItMatters: "Regions inform deployment validation, network measurement, and data-residency questions.", relevantRoles: ["security-infrastructure-lead", "vp-customer-experience"],
  },
  {
    id: "business-systems", stageId: "stack", label: "Business systems", prompt: "Which systems must remain part of the workflow?", kind: "multi",
    options: all(o("salesforce", "Salesforce CRM"), o("zendesk", "Zendesk ticketing"), o("servicenow", "ServiceNow"), o("custom-crm", "Custom CRM"), o("snowflake", "Snowflake warehouse"), o("databricks", "Databricks"), o("customer-database", "Customer database")),
    whyItMatters: "The design should retain working systems and make business-data access explicit.", relevantRoles: ["voice-platform-engineer", "vp-customer-experience"],
  },
  {
    id: "observability-stack", stageId: "stack", label: "Observability", prompt: "Which tools should receive operational evidence?", kind: "multi",
    options: all(o("datadog", "Datadog"), o("splunk", "Splunk"), o("grafana", "Grafana / Prometheus"), o("cloudwatch", "CloudWatch"), o("custom", "Custom telemetry pipeline")),
    whyItMatters: "An architecture is not production-ready until latency, errors, and handoffs can be correlated.", relevantRoles: ["voice-platform-engineer", "security-infrastructure-lead"], technical: true,
  },
  {
    id: "existing-providers", stageId: "stack", label: "Existing AI providers", prompt: "Which layers already have a preferred provider or implementation?", kind: "multi", critical: true,
    options: all(o("stt", "Existing STT provider"), o("tts", "Existing TTS provider"), o("llm", "Existing LLM provider"), o("orchestration", "Existing orchestration framework"), o("none", "No committed speech or orchestration layer")),
    whyItMatters: "Existing investments are an argument for a composable evaluation, not an automatic reason to replace the stack.", relevantRoles: ["voice-platform-engineer", "vp-customer-experience"],
  },
  {
    id: "provider-details", stageId: "stack", label: "Provider & framework details", prompt: "Which fictional STT, TTS, LLM, and orchestration implementations should the evaluation retain or compare?", kind: "text", placeholder: "For example: retain the current LLM and orchestration framework; compare the incumbent speech provider against Deepgram",
    whyItMatters: "Naming the retained and compared layers turns a generic vendor discussion into an explicit integration and migration plan.", relevantRoles: ["voice-platform-engineer"], technical: true,
  },
  {
    id: "current-voice-stack", stageId: "stack", label: "Current voice stack", prompt: "How would you describe the current voice path from call ingress through speech, orchestration, and business systems?", kind: "text", placeholder: "Keep this architectural: identify owners and seams, not confidential implementation details",
    whyItMatters: "A current-state boundary map prevents the recommendation from erasing working components or assigning ownership to the wrong team.", relevantRoles: ["voice-platform-engineer"], technical: true,
  },
  {
    id: "vendor-strategy", stageId: "stack", label: "Vendor strategy", prompt: "What does the team intend to do with current vendors?", kind: "single", critical: true,
    options: all(o("augment", "Augment current stack"), o("retain", "Retain preferred layers"), o("replace-speech", "Replace speech provider only"), o("consolidate", "Explore a managed consolidated path"), o("undecided", "Compare both approaches")),
    whyItMatters: "This prevents an unnecessary platform-replacement recommendation.", relevantRoles: ["vp-customer-experience", "voice-platform-engineer"],
  },

  {
    id: "audio-direction", stageId: "audio", label: "Audio direction", prompt: "Which call directions are in scope?", kind: "multi",
    options: all(o("inbound", "Inbound"), o("outbound", "Outbound")), whyItMatters: "Direction affects consent, call control, routing, and failure recovery.", relevantRoles: ["voice-platform-engineer", "vp-customer-experience"],
  },
  {
    id: "processing-mode", stageId: "audio", label: "Processing mode", prompt: "Does the use case require live streaming, prerecorded processing, or both?", kind: "single", critical: true,
    options: all(o("streaming", "Live streaming"), o("prerecorded", "Prerecorded / batch"), o("both", "Both")),
    whyItMatters: "Streaming and batch paths have different latency, retry, feature, and cost-measurement behavior.", relevantRoles: ["voice-platform-engineer"], technical: true,
  },
  {
    id: "audio-format", stageId: "audio", label: "Codec & sample rate", prompt: "What audio format is expected, if known?", kind: "single",
    options: all(o("mulaw-8khz", "µ-law, 8 kHz telephony"), o("linear16-8khz", "Linear PCM, 8 kHz"), o("linear16-16khz", "Linear PCM, 16 kHz"), o("opus", "Opus"), o("mixed", "Mixed or negotiated codecs")),
    whyItMatters: "Container, encoding, and sample-rate mismatches can look like model-quality problems.", relevantRoles: ["voice-platform-engineer"], technical: true,
  },
  {
    id: "channel-layout", stageId: "audio", label: "Channel layout", prompt: "How are speakers represented in the audio?", kind: "single",
    options: all(o("mono", "Mixed mono"), o("stereo", "Stereo"), o("dual-channel", "Dual channel / one speaker per channel")),
    whyItMatters: "Known channels can be more reliable than inferring speaker identity from mixed audio.", relevantRoles: ["voice-platform-engineer"], technical: true,
  },
  {
    id: "audio-conditions", stageId: "audio", label: "Acoustic conditions", prompt: "Which conditions must the evaluation represent?", kind: "multi", critical: true,
    options: all(o("noise", "Background noise"), o("overlap", "Overlapping speakers"), o("accents", "Accents and dialects"), o("packet-loss", "Packet loss or jitter"), o("far-field", "Far-field microphones"), o("clean", "Mostly clean audio")),
    whyItMatters: "Representative failure slices are more useful than one aggregate accuracy number.", relevantRoles: ["voice-platform-engineer", "vp-customer-experience"],
  },
  {
    id: "languages", stageId: "audio", label: "Languages", prompt: "Which languages and switching patterns matter first?", kind: "multi", critical: true,
    options: all(o("english", "English"), o("spanish", "Spanish"), o("french", "French"), o("german", "German"), o("italian", "Italian"), o("multilingual-growth", "Future multilingual growth"), o("code-switching", "Code switching")),
    whyItMatters: "Language support and code switching must be validated against the chosen model, mode, and representative audio.", relevantRoles: ["vp-customer-experience", "voice-platform-engineer"],
  },
  {
    id: "speech-details", stageId: "audio", label: "Speech details", prompt: "Which details are business-critical to recognize and format correctly?", kind: "multi",
    options: all(o("domain-terms", "Domain terminology"), o("names", "Names"), o("numbers", "Numbers and amounts"), o("addresses", "Addresses"), o("alphanumeric", "Alphanumeric identifiers"), o("dates", "Dates and times")),
    whyItMatters: "Critical entities should be scored separately from general word error rate.", relevantRoles: ["voice-platform-engineer", "vp-customer-experience"],
  },
  {
    id: "transcript-features", stageId: "audio", label: "Transcript features", prompt: "Which transcript outputs are required?", kind: "multi",
    options: all(o("diarization", "Speaker diarization"), o("punctuation", "Punctuation"), o("smart-format", "Smart formatting"), o("profanity", "Profanity handling"), o("redaction", "PII or PCI redaction"), o("timestamps", "Word timings")),
    whyItMatters: "Feature compatibility depends on processing mode and language; it should be verified, not assumed.", relevantRoles: ["voice-platform-engineer", "security-infrastructure-lead"], technical: true,
  },
  {
    id: "audio-duration", stageId: "audio", label: "Audio duration", prompt: "What is a typical interaction or recording duration?", kind: "single",
    options: all(o("under-2", "Under 2 minutes"), o("2-10", "2–10 minutes"), o("10-30", "10–30 minutes"), o("over-30", "Over 30 minutes")),
    whyItMatters: "Duration affects connection lifecycle, chunking, retry strategy, and evaluation dataset design.", relevantRoles: ["voice-platform-engineer"], technical: true,
  },
  {
    id: "concurrency", stageId: "audio", label: "Concurrency", prompt: "What average and peak concurrency band should we test?", kind: "single", critical: true,
    options: all(o("under-50", "Average <25 / peak <50"), o("50-500", "Average 50–200 / peak up to 500"), o("500-5000", "Average 500–2,000 / peak up to 5,000"), o("over-5000", "Peak above 5,000")),
    whyItMatters: "Average and peak load shape connection management, capacity tests, and private-deployment economics.", relevantRoles: ["voice-platform-engineer", "security-infrastructure-lead"], technical: true,
  },
  {
    id: "monthly-minutes", stageId: "audio", label: "Estimated usage", prompt: "What monthly audio-volume band should planning use?", kind: "single",
    options: all(o("under-100k", "Under 100k minutes"), o("100k-1m", "100k–1M minutes"), o("1m-10m", "1M–10M minutes"), o("over-10m", "More than 10M minutes")),
    whyItMatters: "Usage and concurrency answer different questions: volume informs operating economics while concurrency informs realtime capacity.", relevantRoles: ["voice-platform-engineer", "vp-customer-experience"], technical: true,
  },

  {
    id: "response-speed", stageId: "conversation", label: "Response speed", prompt: "How should response speed trade against confidence and action safety?", kind: "single", critical: true,
    options: all(o("fastest", "Optimize for fastest response"), o("balanced", "Balance speed and confidence"), o("correctness-first", "Correctness before speed"), o("transaction-safe", "Confirmation and recovery before speed")),
    whyItMatters: "Low latency matters, but transactional correctness and recoverability can matter more.", relevantRoles: ["vp-customer-experience", "voice-platform-engineer"],
  },
  {
    id: "turn-taking", stageId: "conversation", label: "Turn taking", prompt: "Which conversational behaviors are required?", kind: "multi", critical: true,
    options: all(o("barge-in", "User barge-in"), o("fast-end-turn", "Fast end-of-turn detection"), o("configurable-silence", "Configurable silence"), o("backchannel", "Backchannel handling"), o("human-handoff", "Warm human handoff")),
    whyItMatters: "Turn behavior is an end-to-end system property spanning audio, recognition, orchestration, and playback cancellation.", relevantRoles: ["voice-platform-engineer", "vp-customer-experience"],
  },
  {
    id: "conversation-timing-targets", stageId: "conversation", label: "Timing & silence targets", prompt: "What response, interruption, end-of-turn, and acceptable-silence targets should the prototype measure?", kind: "text", placeholder: "Use hypotheses if targets are not known yet; identify where each timing starts and stops",
    whyItMatters: "A single latency number hides whether delay comes from media ingress, recognition, turn detection, tools, generation, or playback.", relevantRoles: ["voice-platform-engineer", "vp-customer-experience"], technical: true,
  },
  {
    id: "agent-actions", stageId: "conversation", label: "Agent actions", prompt: "What must the agent be allowed to do?", kind: "multi", critical: true,
    options: all(o("inform", "Provide information only"), o("crm-read", "Read CRM data"), o("ticket-write", "Create or update a ticket"), o("account-change", "Change an account"), o("payment", "Initiate a payment"), o("reservation", "Book or modify a resource"), o("handoff", "Route to a human")),
    whyItMatters: "Business tools move the design from speech quality into authorization, idempotency, and recovery.", relevantRoles: ["vp-customer-experience", "security-infrastructure-lead", "voice-platform-engineer"],
  },
  {
    id: "tools-and-apis", stageId: "conversation", label: "Tools & APIs", prompt: "Which fictional tools or APIs must the agent call, and which system remains authoritative?", kind: "text", placeholder: "For example: read Salesforce context, create a Zendesk ticket, then hand off with a correlation ID",
    whyItMatters: "Concrete tool contracts expose authentication, authorization, timeout, retry, and source-of-truth requirements before a voice loop is considered complete.", relevantRoles: ["voice-platform-engineer", "security-infrastructure-lead"], technical: true,
  },
  {
    id: "action-controls", stageId: "conversation", label: "Action controls", prompt: "Which controls are mandatory for sensitive actions?", kind: "multi", critical: true,
    options: all(o("authenticate", "Authenticate the caller"), o("confirm", "Explicitly confirm before action"), o("mandate", "Bounded transaction mandate"), o("idempotency", "Idempotent retry"), o("rollback", "Rollback or recovery path"), o("audit", "Auditable action record"), o("human-approval", "Human approval")),
    whyItMatters: "A fast agent must still know what it is authorized to do and how to recover from partial failure.", relevantRoles: ["security-infrastructure-lead", "voice-platform-engineer"],
  },
  {
    id: "transaction-mandate", stageId: "conversation", label: "Transaction mandate", prompt: "What must a transaction mandate bind explicitly?", kind: "multi",
    options: all(o("destination", "Merchant or destination"), o("resource", "Item, resource, or action"), o("max-amount", "Maximum authorized amount"), o("recurrence", "Recurrence"), o("expiration", "Expiration"), o("confirmation", "Confirmation requirement"), o("retry", "Retry behavior"), o("recovery", "Rollback or recovery path")),
    whyItMatters: "Explicit bounds reduce ambiguity between what the caller said and what the tool is authorized to execute.", relevantRoles: ["security-infrastructure-lead", "vp-customer-experience"],
  },
  {
    id: "pipeline-preference", stageId: "conversation", label: "Pipeline preference", prompt: "Which operating model should we evaluate first?", kind: "single", critical: true,
    options: all(o("composable", "Composable speech components"), o("managed", "Managed voice-agent pipeline"), o("compare", "Compare both with the same evaluation set")),
    whyItMatters: "This is a preference to test, not a predetermined product recommendation.", relevantRoles: ["voice-platform-engineer", "vp-customer-experience"],
  },
  {
    id: "tts-requirements", stageId: "conversation", label: "Speech output", prompt: "What does the customer-facing speech-output layer need?", kind: "multi",
    options: all(o("none", "No TTS in the first milestone"), o("streaming", "Streaming speech output"), o("interruptible", "Playback that can be interrupted"), o("english-spanish", "English and Spanish voices"), o("existing-provider", "Retain the existing TTS provider"), o("voice-choice", "Selectable voice and tone")),
    whyItMatters: "TTS is a separate component decision; response playback, cancellation, language, and provider ownership should be explicit.", relevantRoles: ["vp-customer-experience", "voice-platform-engineer"],
  },
  {
    id: "failure-behavior", stageId: "conversation", label: "Failure & escalation", prompt: "What should happen when speech, a tool, or the agent is uncertain?", kind: "multi", critical: true,
    options: all(o("retry", "Bounded retry"), o("clarify", "Ask a clarifying question"), o("safe-default", "Use a safe default"), o("human", "Escalate to a human"), o("rollback", "Roll back partial work"), o("defer", "Defer and follow up")),
    whyItMatters: "Recoverability must be designed across the whole workflow, not added after the happy path.", relevantRoles: ["voice-platform-engineer", "vp-customer-experience"],
  },

  {
    id: "deployment-preference", stageId: "governance", label: "Deployment preference", prompt: "Which deployment boundary should be explored?", kind: "single", critical: true,
    options: all(o("cloud-api", "Deepgram cloud API"), o("private-cloud", "Customer-controlled private cloud"), o("self-hosted", "Self-hosted"), o("on-prem", "On premises"), o("hybrid", "Hybrid"), o("compare", "Compare cloud and private options")),
    whyItMatters: "Private and self-hosted paths introduce infrastructure and commercial assumptions that require Deepgram validation.", relevantRoles: ["security-infrastructure-lead", "voice-platform-engineer"], technical: true,
  },
  {
    id: "data-control", stageId: "governance", label: "Data control", prompt: "Which data-control constraints are non-negotiable?", kind: "multi", critical: true,
    options: all(o("residency", "Regional data residency"), o("no-retention", "No third-party audio retention"), o("no-transcript-logs", "No transcript logging"), o("segmented", "Segmented or air-gapped workload"), o("customer-keys", "Customer-controlled encryption keys"), o("vendor-access", "Restricted vendor access")),
    whyItMatters: "These constraints can change the deployment path before model selection begins.", relevantRoles: ["security-infrastructure-lead"], technical: true,
  },
  {
    id: "retention-expectations", stageId: "governance", label: "Retention expectations", prompt: "What may be retained, for how long, and who is allowed to delete or export it?", kind: "single", critical: true,
    options: all(o("no-content", "No audio or transcript content retained"), o("transient", "Transient processing only"), o("short-lived", "Short-lived governed retention"), o("customer-owned", "Retain only in customer-owned systems"), o("policy-dependent", "Varies by customer policy")),
    whyItMatters: "Retention affects storage boundaries, debugging evidence, deletion workflows, and which deployment assumptions require validation.", relevantRoles: ["security-infrastructure-lead"], technical: true,
  },
  {
    id: "encryption-expectations", stageId: "governance", label: "Encryption expectations", prompt: "Which encryption and key-management expectations should the security review validate?", kind: "multi",
    options: all(o("in-transit", "Encryption in transit"), o("at-rest", "Encryption at rest"), o("customer-keys", "Customer-managed keys"), o("key-rotation", "Documented key rotation"), o("private-network", "Private network path")),
    whyItMatters: "Encryption expectations should become testable architecture and review items rather than implied compliance claims.", relevantRoles: ["security-infrastructure-lead"], technical: true,
  },
  {
    id: "pii-compliance", stageId: "governance", label: "Sensitive data & review", prompt: "Which governance workstreams are expected?", kind: "multi", critical: true,
    options: all(o("pii", "PII handling"), o("pci", "Payment data"), o("health", "Health information"), o("security-review", "Vendor security review"), o("legal-review", "Legal or compliance review"), o("data-processing", "Data-processing terms")),
    whyItMatters: "The Studio records validation work; it does not make a legal or compliance determination.", relevantRoles: ["security-infrastructure-lead"],
  },
  {
    id: "logging-audit", stageId: "governance", label: "Observability & audit", prompt: "What evidence must operators and auditors retain?", kind: "multi",
    options: all(o("request-ids", "Request and correlation IDs"), o("latency", "Stage-level latency"), o("model-config", "Model configuration"), o("action-log", "Tool-action audit trail"), o("redacted-transcript", "Redacted transcripts"), o("no-content", "Metadata only; no content logs")),
    whyItMatters: "Auditability and privacy must be designed together so debugging does not become data over-collection.", relevantRoles: ["security-infrastructure-lead", "voice-platform-engineer"], technical: true,
  },
  {
    id: "model-control", stageId: "governance", label: "Model control", prompt: "How much control does the team need over models and updates?", kind: "single",
    options: all(o("managed-updates", "Managed updates are acceptable"), o("pinned", "Pinned model/version validation"), o("change-control", "Formal model change control"), o("customer-hosted", "Customer-operated model deployment")),
    whyItMatters: "Update ownership affects release gates, regression testing, and operational responsibility.", relevantRoles: ["security-infrastructure-lead", "voice-platform-engineer"], technical: true,
  },
  {
    id: "availability", stageId: "governance", label: "Availability & recovery", prompt: "Which resilience expectations should the pilot test?", kind: "multi", critical: true,
    options: all(o("multi-region", "Multi-region design"), o("provider-failover", "Provider or model fallback"), o("graceful-degrade", "Graceful degradation"), o("dr", "Disaster recovery"), o("queue", "Queue and replay for batch work"), o("human-fallback", "Human fallback")),
    whyItMatters: "Availability goals should map to explicit ownership, failure tests, and recovery time—not a generic uptime claim.", relevantRoles: ["security-infrastructure-lead", "voice-platform-engineer"], technical: true,
  },

  {
    id: "baseline", stageId: "success", label: "Current baseline", prompt: "What baseline evidence is available today?", kind: "multi", critical: true,
    options: all(o("provider-results", "Current provider results"), o("human-transcripts", "Human-reviewed transcripts"), o("latency-traces", "Latency traces"), o("business-metrics", "Business KPI baseline"), o("cost-data", "Operational cost data"), o("none", "Baseline must be created")),
    whyItMatters: "Without a baseline, improvement claims should be framed as hypotheses.", relevantRoles: ["voice-platform-engineer", "vp-customer-experience"],
  },
  {
    id: "budget-sensitivity", stageId: "success", label: "Budget sensitivity", prompt: "How should cost influence the proof-of-concept decision?", kind: "single",
    options: all(o("guardrail", "Cost is a guardrail"), o("primary", "Cost is a primary decision metric"), o("control-first", "Control and risk outweigh initial cost"), o("speed-first", "Time to pilot outweighs initial cost")),
    whyItMatters: "Cost should change evaluation design and operating-model comparison without inventing prices or pretending usage is already known.", relevantRoles: ["vp-customer-experience", "voice-platform-engineer"],
  },
  {
    id: "baseline-values", stageId: "success", label: "Baseline values", prompt: "What fictional baseline values or measurement gaps should the team record?", kind: "text", placeholder: "For example: current provider latency is measured inconsistently; human-reviewed accuracy baseline still needs to be created",
    whyItMatters: "An evidence inventory is not a baseline until the values, measurement method, and missing slices are explicit.", relevantRoles: ["voice-platform-engineer", "vp-customer-experience"],
  },
  {
    id: "primary-metrics", stageId: "success", label: "Primary metrics", prompt: "Which metrics decide whether the evaluation advances?", kind: "multi", critical: true,
    options: all(o("accuracy", "Transcription accuracy"), o("critical-entities", "Critical-entity accuracy"), o("e2e-latency", "End-to-end latency"), o("ttft", "Time to first transcript"), o("interruption", "Interruption responsiveness"), o("containment", "Containment rate"), o("task-completion", "Task-completion rate"), o("handoff", "Successful handoff rate"), o("csat", "Customer satisfaction"), o("aht", "Average handle time"), o("productivity", "Agent productivity"), o("cost", "Operational cost"), o("reliability", "Reliability and recovery")),
    whyItMatters: "Primary metrics should be few enough to make a decision and specific enough to measure.", relevantRoles: ["vp-customer-experience", "voice-platform-engineer"],
  },
  {
    id: "secondary-metrics", stageId: "success", label: "Secondary metrics", prompt: "Which supporting metrics should explain the result without deciding it alone?", kind: "multi",
    options: all(o("accuracy", "Transcription accuracy"), o("critical-entities", "Critical-entity accuracy"), o("e2e-latency", "End-to-end latency"), o("ttft", "Time to first transcript"), o("interruption", "Interruption responsiveness"), o("containment", "Containment rate"), o("handoff", "Successful handoff rate"), o("task-completion", "Task-completion rate"), o("csat", "Customer satisfaction"), o("aht", "Average handle time"), o("productivity", "Agent productivity"), o("cost", "Operational cost"), o("reliability", "Reliability and recovery")),
    whyItMatters: "Secondary measures help explain why the primary result moved without creating an unranked scorecard where every metric is equally decisive.", relevantRoles: ["vp-customer-experience", "voice-platform-engineer"],
  },
  {
    id: "metric-targets", stageId: "success", label: "Targets & thresholds", prompt: "What targets, guardrails, or acceptance thresholds should be used for the selected metrics?", kind: "text", critical: true, placeholder: "Record measurable thresholds where known and label the rest as hypotheses to establish during the baseline phase",
    whyItMatters: "Targets need a defined measurement point, dataset, and acceptance rule; otherwise they create false precision.", relevantRoles: ["vp-customer-experience", "voice-platform-engineer", "security-infrastructure-lead"],
  },
  {
    id: "guardrail-metrics", stageId: "success", label: "Guardrails", prompt: "Which metrics must not regress while the primary goal improves?", kind: "multi",
    options: all(o("accuracy", "Accuracy"), o("latency", "Latency"), o("handoff", "Handoff success"), o("error-recovery", "Error recovery"), o("customer-trust", "Customer trust signals"), o("cost", "Cost"), o("availability", "Availability")),
    whyItMatters: "Guardrails prevent a narrow optimization from degrading the wider customer journey.", relevantRoles: ["vp-customer-experience", "security-infrastructure-lead"],
  },
  {
    id: "unknown-metrics", stageId: "success", label: "Unknowns to measure", prompt: "Which targets still need measurement before a threshold can be set?", kind: "multi",
    options: all(o("accuracy", "Accuracy by failure slice"), o("latency", "Latency by stage"), o("concurrency", "Peak concurrency"), o("cost", "Unit economics"), o("containment", "Containment potential"), o("recovery", "Failure recovery rate")),
    whyItMatters: "Unknown is a valid discovery outcome when it becomes a measurement plan.", relevantRoles: ["voice-platform-engineer", "vp-customer-experience"],
  },
  {
    id: "evaluation-period", stageId: "success", label: "Evaluation period", prompt: "How long should the representative evaluation run?", kind: "single", critical: true,
    options: all(o("1-week", "One week"), o("2-weeks", "Two weeks"), o("4-weeks", "Four weeks"), o("6-8-weeks", "Six to eight weeks")),
    whyItMatters: "Duration should cover representative variation, human review, integration behavior, and repeatable load tests.", relevantRoles: ["vp-customer-experience", "voice-platform-engineer"],
  },
  {
    id: "acceptance-gates", stageId: "success", label: "Production gates", prompt: "Which gates must pass before a controlled rollout?", kind: "multi", critical: true,
    options: all(o("representative-data", "Representative-data acceptance"), o("load", "Load and soak testing"), o("failure", "Failure and recovery testing"), o("security", "Security review"), o("human-review", "Human quality review"), o("pilot", "Limited customer pilot"), o("observability", "Production observability"), o("rollback", "Rollback readiness")),
    whyItMatters: "A prototype becomes production through explicit gates, not a larger demo.", relevantRoles: ["security-infrastructure-lead", "voice-platform-engineer", "vp-customer-experience"],
  },
  {
    id: "poc-success-criteria", stageId: "success", label: "Proof-of-concept success", prompt: "In one sentence, what evidence would make the team advance this proof of concept?", kind: "text", placeholder: "Use measurable customer-supplied criteria; placeholders are acceptable when a baseline must be established first", critical: true,
    whyItMatters: "A proof of concept needs a decision statement that joins technical evidence to the business outcome.", relevantRoles: ["vp-customer-experience", "voice-platform-engineer", "security-infrastructure-lead"],
  },
];

export const QUESTIONS_BY_STAGE = Object.fromEntries(
  STUDIO_STAGES.map((stage) => [stage.id, STUDIO_QUESTIONS.filter((question) => question.stageId === stage.id)]),
) as Record<StudioStageId, StudioQuestion[]>;

export function getQuestion(questionId: string) {
  return STUDIO_QUESTIONS.find((question) => question.id === questionId);
}

export function getStage(stageId: StudioStageId) {
  return STUDIO_STAGES.find((stage) => stage.id === stageId) ?? STUDIO_STAGES[0];
}
