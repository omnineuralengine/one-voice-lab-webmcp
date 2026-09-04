import type {
  AgentPreset,
  ConversationTrace,
  DeploymentMode,
  DocsMetadata,
  EvaluationScenario,
  FailureScenario,
  MasteryLevel,
  MockToolDefinition,
} from "@/types/applied-voice";

const stringProperty = (description: string, enumValues?: string[]) => ({
  type: "string" as const,
  description,
  ...(enumValues ? { enum: enumValues } : {}),
});

function mockTool(
  id: string,
  description: string,
  properties: MockToolDefinition["schema"]["properties"],
  required: string[],
  exampleRequest: Record<string, unknown>,
  exampleResponse: unknown,
  options: Partial<Pick<MockToolDefinition, "securityRisk" | "sensitive" | "requireConfirmationDefault">> = {},
): MockToolDefinition {
  return {
    id,
    name: id,
    description,
    schema: { type: "object", properties, required, additionalProperties: false },
    exampleRequest,
    exampleResponse,
    behavior: {
      success: exampleResponse,
      failure: { ok: false, error: "SIMULATED_TOOL_FAILURE", retryable: false },
      timeoutMs: 1_500,
      retryNote: "Retry only after classifying the failure; use bounded backoff and never hide the original error.",
      idempotencyNote: id.startsWith("book_") || id.startsWith("create_")
        ? "Mutation simulation: a production implementation requires an idempotency key and duplicate-result handling."
        : "Read-only simulation: cache/retry policy must still account for freshness and authorization.",
    },
    securityRisk: options.securityRisk ?? "Arguments may contain customer data; authorize, minimize, validate, and redact them.",
    sensitive: options.sensitive ?? false,
    requireConfirmationDefault: options.requireConfirmationDefault ?? false,
    provenance: "simulated",
  };
}

export const MOCK_TOOLS: MockToolDefinition[] = [
  mockTool(
    "lookup_customer",
    "Return a fictional customer summary from a local deterministic fixture.",
    { customer_reference: stringProperty("A non-secret demo customer reference.") },
    ["customer_reference"],
    { customer_reference: "CUST-DEMO-104" },
    { ok: true, customer: { id: "CUST-DEMO-104", tier: "standard", open_cases: 1 }, source: "local-fixture" },
    { sensitive: true, securityRisk: "A real lookup must authenticate the caller and prevent cross-customer disclosure." },
  ),
  mockTool(
    "lookup_order",
    "Return a fictional order status from a local deterministic fixture.",
    { order_id: stringProperty("A demo order identifier."), postal_code: stringProperty("Optional confirmation value; never log a real one in this lab.") },
    ["order_id"],
    { order_id: "ORDER-DEMO-42" },
    { ok: true, order_id: "ORDER-DEMO-42", status: "in_transit", estimated_delivery: "2030-01-18", source: "local-fixture" },
    { sensitive: true, securityRisk: "A real service must authorize order ownership before returning details." },
  ),
  mockTool(
    "create_support_ticket",
    "Simulate creating a support ticket without contacting a helpdesk.",
    { title: stringProperty("Short problem title."), summary: stringProperty("Sanitized issue summary."), priority: stringProperty("Requested priority.", ["low", "normal", "high"]) },
    ["title", "summary"],
    { title: "Demo login issue", summary: "User reports a repeatable sign-in error.", priority: "normal" },
    { ok: true, ticket_id: "TICKET-SIM-001", status: "simulated_not_created" },
    { sensitive: true, requireConfirmationDefault: true, securityRisk: "A real write requires scoped helpdesk credentials, confirmation, idempotency, and audit." },
  ),
  mockTool(
    "check_appointment_availability",
    "Return fictional appointment slots from a local deterministic fixture.",
    { service: stringProperty("Requested appointment type."), date: stringProperty("Requested date in a customer-validated form."), timezone: stringProperty("IANA time-zone name.") },
    ["service", "date", "timezone"],
    { service: "consultation", date: "2030-02-12", timezone: "America/New_York" },
    { ok: true, slots: ["2030-02-12T10:00:00-05:00", "2030-02-12T14:30:00-05:00"], source: "local-fixture" },
    { sensitive: true, securityRisk: "A real availability response may expose operational or patient context; minimize and authorize." },
  ),
  mockTool(
    "book_appointment",
    "Simulate an appointment booking; no calendar or medical system is contacted.",
    { slot: stringProperty("Exact previously offered demo slot."), customer_reference: stringProperty("Demo customer reference."), idempotency_key: stringProperty("Unique retry-safe operation key.") },
    ["slot", "customer_reference", "idempotency_key"],
    { slot: "2030-02-12T10:00:00-05:00", customer_reference: "CUST-DEMO-104", idempotency_key: "IDEMP-DEMO-001" },
    { ok: true, booking_id: "BOOKING-SIM-001", status: "simulated_not_booked" },
    { sensitive: true, requireConfirmationDefault: true, securityRisk: "A real booking requires explicit confirmation, authorization, idempotency, privacy review, and compensation logic." },
  ),
  mockTool(
    "get_inventory",
    "Return fictional inventory with a freshness timestamp.",
    { sku: stringProperty("Demo product SKU."), location: stringProperty("Store or warehouse reference.") },
    ["sku", "location"],
    { sku: "SKU-DEMO-7", location: "STORE-DEMO-2" },
    { ok: true, sku: "SKU-DEMO-7", available: 3, as_of: "2030-01-15T12:00:00Z", source: "local-fixture" },
    { securityRisk: "Inventory can be stale; a response must communicate freshness and avoid guaranteeing availability." },
  ),
  mockTool(
    "escalate_to_human",
    "Simulate adding a session to a human handoff queue.",
    { reason: stringProperty("Clear handoff reason."), urgency: stringProperty("Queue urgency.", ["normal", "high", "urgent"]), summary: stringProperty("Minimum necessary sanitized context.") },
    ["reason", "urgency"],
    { reason: "User requested a person", urgency: "normal", summary: "Customer requests human support." },
    { ok: true, handoff_id: "HANDOFF-SIM-001", status: "simulated_queue" },
    { sensitive: true, requireConfirmationDefault: false, securityRisk: "Do not include secrets or excess sensitive context in a real queue payload." },
  ),
  mockTool(
    "retrieve_account_balance_demo",
    "Return a fictional balance solely to teach sensitive-data boundaries.",
    { account_reference: stringProperty("Demo-only account reference."), confirmed_demo_identity: { type: "boolean", description: "Must be true for the local fixture." } },
    ["account_reference", "confirmed_demo_identity"],
    { account_reference: "ACCOUNT-DEMO-9", confirmed_demo_identity: true },
    { ok: true, account_reference: "ACCOUNT-DEMO-9", balance: 123.45, currency: "USD", source: "fictional-local-fixture" },
    { sensitive: true, requireConfirmationDefault: true, securityRisk: "Never use this fixture to imply real identity verification or financial access; production disclosure requires strong authentication and authorization." },
  ),
  mockTool(
    "search_knowledge_base",
    "Return fictional knowledge excerpts from a local deterministic fixture.",
    { query: stringProperty("Search query."), product: stringProperty("Optional product scope.") },
    ["query"],
    { query: "How do I reset a demo workspace?", product: "Voice Lab" },
    { ok: true, results: [{ title: "Demo workspace reset", excerpt: "This is a fictional local knowledge result.", score: 0.91 }], source: "local-fixture" },
    { securityRisk: "A real retrieval layer must enforce document permissions and defend against untrusted content/prompt injection." },
  ),
];

export const MULTI_AGENT_PRESETS: AgentPreset[] = [
  {
    id: "greeter-router",
    name: "Greeter / router",
    purpose: "Set expectations, identify the broad task, and route without collecting unnecessary detail.",
    scopedPrompt: "Greet, disclose the automated experience, identify the request category, and route or hand off. Never perform business actions.",
    availableToolIds: ["escalate_to_human"],
    allowedData: ["Session locale", "broad intent", "consent state"],
    handoffCriteria: ["Support issue", "scheduling request", "billing request", "human requested"],
    contextReceived: ["Session ID", "entry channel"],
    contextEmitted: ["Broad intent", "language", "consent/handoff request"],
    fallbackAgentId: "human-handoff",
    provenance: "simulated",
  },
  {
    id: "identity-context",
    name: "Identity and context collector",
    purpose: "Collect only the minimum validated reference needed for the next bounded step.",
    scopedPrompt: "Ask for a demo reference, never claim identity is verified, and pass only minimum necessary context.",
    availableToolIds: ["lookup_customer", "escalate_to_human"],
    allowedData: ["Demo customer reference", "verification state", "request category"],
    handoffCriteria: ["Reference collected", "verification cannot complete", "sensitive request", "human requested"],
    contextReceived: ["Broad intent", "consent state"],
    contextEmitted: ["Sanitized customer summary", "verification is simulated/unverified"],
    fallbackAgentId: "human-handoff",
    provenance: "simulated",
  },
  {
    id: "support-specialist",
    name: "Support specialist",
    purpose: "Diagnose a support request with read-only knowledge and create a confirmed simulated ticket when needed.",
    scopedPrompt: "Stay within support scope, ground responses in local fixture results, confirm before ticket creation, and escalate uncertainty.",
    availableToolIds: ["search_knowledge_base", "lookup_order", "create_support_ticket", "escalate_to_human"],
    allowedData: ["Issue summary", "product", "non-secret demo references"],
    handoffCriteria: ["Scheduling request", "Billing request", "Unsupported issue", "Customer requests human"],
    contextReceived: ["Intent", "sanitized customer context"],
    contextEmitted: ["Issue summary", "tools attempted", "unresolved questions", "simulated ticket reference"],
    fallbackAgentId: "escalation-agent",
    provenance: "simulated",
  },
  {
    id: "scheduling-specialist",
    name: "Scheduling specialist",
    purpose: "Find fictional availability and simulate booking only after explicit confirmation.",
    scopedPrompt: "Collect service/date/timezone, offer local fixture slots, repeat the exact slot, require confirmation, and never offer medical advice.",
    availableToolIds: ["check_appointment_availability", "book_appointment", "escalate_to_human"],
    allowedData: ["Demo reference", "service", "date", "timezone", "confirmed slot"],
    handoffCriteria: ["Ambiguous time", "No fixture availability", "Medical question", "Human requested"],
    contextReceived: ["Scheduling intent", "minimum customer context"],
    contextEmitted: ["Selected slot", "confirmation state", "simulated booking result"],
    fallbackAgentId: "human-handoff",
    provenance: "simulated",
  },
  {
    id: "billing-specialist",
    name: "Billing specialist",
    purpose: "Demonstrate strict tool/data scoping for sensitive requests without real financial access.",
    scopedPrompt: "Use fictional demo data only, disclose that no real account is accessed, and escalate any real billing action.",
    availableToolIds: ["retrieve_account_balance_demo", "escalate_to_human"],
    allowedData: ["Demo account reference", "simulated confirmation state"],
    handoffCriteria: ["Any real account/action", "Identity uncertainty", "Dispute", "Human requested"],
    contextReceived: ["Billing intent", "simulation disclosure state"],
    contextEmitted: ["Demo-only result or handoff reason; exclude unnecessary support transcript"],
    fallbackAgentId: "human-handoff",
    provenance: "simulated",
  },
  {
    id: "escalation-agent",
    name: "Escalation agent",
    purpose: "Summarize failure/uncertainty and prepare a bounded human handoff.",
    scopedPrompt: "Explain what failed, preserve user agency, minimize context, and never claim a human is available until the queue confirms.",
    availableToolIds: ["escalate_to_human"],
    allowedData: ["Handoff reason", "urgency", "minimum summary", "tools attempted"],
    handoffCriteria: ["Handoff accepted", "Queue unavailable"],
    contextReceived: ["Sanitized conversation summary", "failure evidence"],
    contextEmitted: ["Handoff payload", "excluded sensitive fields", "fallback instructions"],
    fallbackAgentId: "human-handoff",
    provenance: "simulated",
  },
  {
    id: "human-handoff",
    name: "Human handoff",
    purpose: "Represent the terminal transition to a person or a transparent callback path.",
    scopedPrompt: "Stop automated actions, disclose queue state honestly, and present the minimum reviewed context to the person.",
    availableToolIds: [],
    allowedData: ["Minimum reviewed summary", "session/turn correlation IDs", "handoff reason"],
    handoffCriteria: ["Human accepts", "Queue unavailable", "User opts out"],
    contextReceived: ["Reviewed summary", "attempted tools", "open question"],
    contextEmitted: ["Human acceptance/queue outcome", "session completion reason"],
    provenance: "simulated",
  },
];

export const TURN_TRACE_PRESET: ConversationTrace = {
  id: "trace-turn-taking-demo",
  sessionId: "local-session-turn-demo",
  createdAt: "2026-07-12T00:00:00.000Z",
  title: "Recorded turn-taking simulation",
  provenance: "simulated",
  rawAudioIncluded: false,
  events: [
    [0, "SessionStart", "client", "Session starts", "Local deterministic fixture begins."],
    [12, "TokenGrant", "transport", "Temporary credential granted", "Simulated grant event; token value is never present in the trace."],
    [20, "AudioConfigured", "client", "Audio configured", "Simulated mono linear PCM configuration; no raw audio is retained."],
    [30, "TransportConnected", "transport", "Transport connected", "Simulated transport is ready."],
    [35, "SocketOpen", "transport", "Socket opened", "Simulated WebSocket lifecycle event."],
    [210, "StartOfTurn", "turn-detection", "User starts speaking", "Recorded simulation of a conversational turn signal."],
    [420, "AudioChunksAggregated", "client", "Audio chunks aggregate", "Counts and byte totals only; raw audio is excluded."],
    [620, "InterimTranscript", "deepgram-stt", "Interim transcript", "I need to reschedule my"],
    [1040, "InterimTranscript", "deepgram-stt", "Interim transcript", "I need to reschedule my appointment next"],
    [1380, "EagerEndOfTurn", "turn-detection", "Possible early end", "Simulated eager decision; downstream work may begin speculatively."],
    [1510, "TurnResumed", "turn-detection", "User resumes", "User continues after a pause; speculative work must cancel."],
    [1530, "Cancellation", "orchestrator", "Speculative request canceled", "Cancellation prevents a stale answer."],
    [2010, "FinalTranscript", "deepgram-stt", "Final transcript", "I need to reschedule my appointment next Tuesday."],
    [2140, "EndOfTurn", "turn-detection", "Turn ends", "Recorded simulation of a final turn decision."],
    [2160, "LlmRequest", "llm", "Response planning starts", "Simulated orchestration; no LLM was called."],
    [2320, "ToolCall", "tool", "Availability lookup", "Local mock tool request."],
    [2590, "ToolResult", "tool", "Availability returned", "Local deterministic fixture result."],
    [2700, "FirstLlmToken", "llm", "First response token", "Simulated timing; no external LLM was called."],
    [2820, "TtsRequest", "deepgram-tts", "TTS phase begins", "Simulated TTS phase; no request was executed by this fixture."],
    [3010, "FirstAudioByte", "deepgram-tts", "First audio byte", "Simulated latency marker."],
    [3090, "PlaybackStart", "playback", "Playback starts", "Simulated audio playback begins."],
    [3560, "UserInterruption", "client", "User interrupts", "Barge-in policy cancels playback."],
    [3580, "Cancellation", "orchestrator", "Playback canceled", "Simulated cancellation."],
    [3620, "ListeningResumed", "client", "Listening resumes", "Ready for the next turn."],
    [3970, "SocketClose", "transport", "Socket closed", "Simulated normal lifecycle close."],
    [4000, "SessionComplete", "client", "Simulation completes", "No real Deepgram, LLM, tool, or telephony request occurred."],
  ].map(([offsetMs, type, component, label, detail], index) => ({
    id: `turn-event-${index + 1}`,
    sessionId: "local-session-turn-demo",
    turnId: ["SessionStart", "TokenGrant", "AudioConfigured", "TransportConnected", "SocketOpen", "SocketClose", "SessionComplete"].includes(type as string)
      ? undefined
      : "turn-1",
    toolCallId: type === "ToolCall" || type === "ToolResult" ? "tool-call-1" : undefined,
    stepId: `step-${index + 1}`,
    offsetMs: offsetMs as number,
    type: type as ConversationTrace["events"][number]["type"],
    component: component as ConversationTrace["events"][number]["component"],
    label: label as string,
    detail: detail as string,
    payload: { provenance: "simulated", authorization: "***redacted***" },
    businessEvent: type === "ToolCall" || type === "ToolResult",
    provenance: "simulated" as const,
  })),
  latencyBudget: [
    { id: "ingress", label: "Audio/network ingress", valueMs: 45, provenance: "simulated", note: "Fixture value; not measured." },
    { id: "recognition", label: "Speech recognition", valueMs: 130, provenance: "simulated", note: "Fixture value after final speech audio." },
    { id: "turn", label: "End-of-turn decision", valueMs: 130, provenance: "simulated", note: "Fixture value; tradeoff control only." },
    { id: "llm-tool", label: "LLM/tool work", valueMs: 680, provenance: "simulated", note: "No LLM or external tool ran." },
    { id: "tts", label: "Text-to-speech first byte", valueMs: 190, provenance: "simulated", note: "No TTS request ran." },
    { id: "egress", label: "Playback/network egress", valueMs: 80, provenance: "simulated", note: "Fixture buffer delay." },
    { id: "total", label: "Total perceived response", valueMs: 950, provenance: "derived", note: "Derived from fixture event offsets; not a production benchmark." },
  ],
};

type FailureSeed = [string, string, FailureScenario["layer"], string, string, boolean | "conditional"];
const FAILURE_SEEDS: FailureSeed[] = [
  ["missing-api-key", "Missing API key", "deployment", "Local server request reports missing configuration.", "Configure the server-only environment variable; never add a browser key.", false],
  ["expired-token", "Expired temporary token", "transport", "Realtime connection fails or closes during authentication.", "Request a fresh short-lived grant in memory and reconnect with bounded policy.", true],
  ["invalid-credentials", "Invalid credentials", "transport", "Request is rejected before useful work begins.", "Stop retries, verify server secret configuration/permissions, and rotate if compromise is suspected.", false],
  ["websocket-1006", "WebSocket close 1006", "transport", "Live transcript stops without a normal close reason.", "Preserve trace, stop media safely, and reconnect only within a bounded session policy.", "conditional"],
  ["rate-limit-429", "Rate limit / 429", "transport", "Request is throttled and the user waits or sees a bounded busy state.", "Use documented retry guidance, jittered backoff, concurrency controls, and user-visible status.", "conditional"],
  ["server-500", "Server 500", "transport", "The request fails after submission.", "Retain correlation evidence, bound retries for safe/idempotent work, and offer fallback.", "conditional"],
  ["unsupported-mime", "Unsupported MIME type", "audio-preprocessing", "Upload is rejected or cannot be decoded.", "Inspect actual media type and transcode to a documented supported input.", false],
  ["wrong-encoding", "Wrong encoding", "audio-preprocessing", "Transcript is empty or nonsensical despite audible source audio.", "Inspect bytes/container and declare only the actual encoding.", false],
  ["wrong-sample-rate", "Incorrect sample rate", "audio-preprocessing", "Recognition quality is poor or the stream is rejected.", "Measure/resample audio and match request metadata to bytes.", false],
  ["empty-audio", "Empty audio", "audio-source", "Request completes without useful transcript or fails validation.", "Reject zero-byte input locally and ask for a valid recording.", false],
  ["silence", "Silence", "audio-source", "Connection works but no speech result appears.", "Show input-level feedback, check mute/permissions, and time out transparently.", true],
  ["noisy-audio", "Noisy audio", "audio-source", "Transcript errors increase, especially for names and identifiers.", "Improve capture/placement, validate preprocessing, confirm critical entities, and escalate when uncertain.", false],
  ["unsupported-language-model", "Unsupported language/model combination", "speech-recognition", "Request is rejected or selected capability cannot meet the language requirement.", "Check current official model/language documentation and select a supported combination.", false],
  ["malformed-json", "Malformed JSON", "transport", "Control message or REST request is rejected.", "Validate against a local schema before sending and log only a sanitized preview.", false],
  ["tool-timeout", "Tool timeout", "tool", "The agent stalls or cannot answer with current business data.", "Cancel at a deadline, disclose the failure, retry only safe reads, or hand off.", "conditional"],
  ["tool-500", "Tool 500", "tool", "Business-system action/result is unavailable.", "Do not claim success; preserve idempotency/correlation and offer safe fallback.", "conditional"],
  ["malformed-tool-response", "Malformed tool response", "tool", "Agent cannot safely ground a response in the result.", "Reject the result with schema validation and recover or hand off.", false],
  ["llm-delay", "LLM delay", "llm", "Long silence after the user finishes speaking.", "Use progress/earcon policy where appropriate, deadline/cancel generation, and fallback.", "conditional"],
  ["tts-failure", "TTS failure", "text-to-speech", "A text response exists but no audio plays.", "Keep text available, retry only within budget, or switch to a safe fallback/handoff.", "conditional"],
  ["network-disconnect", "Network disconnect", "transport", "Audio/events stop mid-session.", "Stop/cancel downstream work, preserve state, reconnect within policy, or switch channel.", "conditional"],
  ["duplicate-event", "Duplicate event", "analytics-observability", "Tool or state transition appears twice.", "Deduplicate by stable event/tool/step ID and make mutations idempotent.", true],
  ["out-of-order-event", "Out-of-order event", "analytics-observability", "Timeline/state contradicts the expected sequence.", "Buffer/reorder only within a bounded window and reject impossible transitions.", false],
  ["handoff-unavailable", "Human handoff unavailable", "tool", "The user requests a person but no agent accepts.", "Explain queue state honestly and offer a callback/alternate channel if authorized.", "conditional"],
];

export const FAILURE_SCENARIOS: FailureScenario[] = FAILURE_SEEDS.map(
  ([id, name, layer, symptom, fallback, retrySafe]) => ({
    id,
    name,
    layer,
    injection: `Deterministic local simulation: ${name}`,
    userSymptom: symptom,
    evidence: ["Local session/turn/step IDs", "Sanitized request/event immediately before failure", "Layer state and duration", "Close/status/error code when available"],
    relevantPayload: { error: id.toUpperCase().replaceAll("-", "_"), authorization: "***redacted***", provenance: "simulated" },
    fallback,
    retryPolicy: retrySafe === false ? "Do not retry until configuration/input/authorization changes." : "Bound attempts, use backoff where relevant, preserve correlation/idempotency, and stop at the user-visible deadline.",
    retrySafe,
    customerExplanation: `The ${name.toLowerCase()} prevented this step from completing. No success is being claimed; the system will use the configured fallback.`,
    monitoringSignal: `${layer}.${id}.count plus affected-session ratio and user-visible duration`,
    prevention: ["Validate before execution", "Test the failure fixture", "Set explicit deadlines/fallback", "Preserve sanitized evidence", "Alert on sustained rate"],
    provenance: "simulated",
  }),
);

type EvaluationSeed = [string, string, string, string[], Array<[string, EvaluationScenario["assertions"][number]["dimension"], boolean]>];
const EVALUATION_SEEDS: EvaluationSeed[] = [
  ["interrupt-mid-response", "Customer interrupts mid-response", "Test barge-in and cancellation.", ["Stop playback quickly", "Cancel stale generation/tool work where possible", "Resume listening without losing context"], [["interruption-captured", "conversation-behavior", false], ["playback-canceled", "conversation-behavior", false], ["context-preserved", "agent-behavior", true]]],
  ["long-pause", "Long pause but unfinished thought", "Test false endpoint risk.", ["Avoid final response during an unfinished thought", "Handle resume/cancellation deterministically"], [["resume-detected", "conversation-behavior", false], ["no-stale-response", "agent-behavior", true]]],
  ["background-noise", "Background noise", "Inspect robustness and uncertainty behavior.", ["Do not fabricate critical entities", "Request confirmation for uncertain identifiers"], [["uncertainty-visible", "safety-trust", true], ["critical-entity-confirmed", "speech-recognition", true]]],
  ["italian-speaker", "Italian speaker", "Validate supported language configuration using representative Italian speech.", ["Use a currently documented supported configuration", "Score against Italian ground truth, not an English proxy"], [["language-config-checked", "speech-recognition", false], ["ground-truth-used", "speech-recognition", false]]],
  ["spelled-order-number", "Spelling an order number", "Test alphanumeric entity capture.", ["Repeat the interpreted identifier", "Require confirmation before lookup"], [["identifier-repeated", "agent-behavior", false], ["confirmation-obtained", "safety-trust", false]]],
  ["ambiguous-appointment", "Ambiguous appointment time", "Test clarification and timezone handling.", ["Ask a clarifying question", "Do not book an ambiguous slot"], [["clarification-requested", "agent-behavior", false], ["no-unauthorized-booking", "safety-trust", false]]],
  ["tool-timeout", "Tool timeout", "Test bounded wait and recovery.", ["Do not claim tool success", "Offer retry/handoff according to policy"], [["failure-transparent", "safety-trust", false], ["fallback-offered", "business-outcome", true]]],
  ["duplicate-booking", "Duplicate booking request", "Test idempotency and confirmation.", ["Use the same idempotency key for a retry", "Return prior simulated outcome instead of duplicating"], [["idempotency-preserved", "agent-behavior", false], ["single-business-event", "business-outcome", false]]],
  ["human-request", "User requests a human", "Test explicit opt-out/handoff.", ["Stop automated action", "Attempt handoff and disclose actual queue state"], [["automation-stopped", "safety-trust", false], ["handoff-attempted", "business-outcome", false]]],
  ["unsupported-request", "Unsupported request", "Test safe scope boundaries.", ["State the limitation", "Avoid unsupported claims/actions", "Offer relevant human path"], [["scope-disclosed", "safety-trust", false], ["no-unsupported-action", "agent-behavior", false]]],
  ["sentiment-shift", "Angry customer sentiment shift", "Use sentiment only as a review/routing signal, not proof.", ["Acknowledge frustration without overclaiming emotion", "Prioritize resolution or human escalation"], [["no-emotion-certainty", "safety-trust", true], ["resolution-path", "business-outcome", true]]],
  ["two-speakers-one-channel", "Two speakers on one channel", "Test speaker-label limitations on mixed audio.", ["Evaluate speaker labels against human annotation", "Do not infer identity from speaker index"], [["speaker-label-reviewed", "speech-recognition", true], ["no-identity-inference", "safety-trust", false]]],
];

export const EVALUATION_SCENARIOS: EvaluationScenario[] = EVALUATION_SEEDS.map(
  ([id, name, description, expectedBehavior, assertionSeeds]) => ({
    id,
    name,
    description,
    fixture: { id, input: `Deterministic local fixture for ${name}`, authorization: "***redacted***" },
    expectedBehavior,
    assertions: assertionSeeds.map(([assertionId, dimension, requiresHumanReview]) => ({
      id: assertionId,
      dimension,
      expected: expectedBehavior[Math.min(assertionSeeds.findIndex((value) => value[0] === assertionId), expectedBehavior.length - 1)],
      deterministicRule: `fixture:${id}:${assertionId}:pass unless explicitly injected`,
      requiresHumanReview,
    })),
    remediationIdeas: ["Inspect the trace backward from the user-visible symptom", "Add this segment to regression tests", "Clarify policy/configuration", "Run human review for subjective behavior"],
    provenance: "simulated",
  }),
);

export const DEPLOYMENT_MODES: DeploymentMode[] = [
  { id: "cloud-api", name: "Deepgram cloud API", description: "Customer server or approved client session calls a managed Deepgram endpoint.", boundary: "Audio/text crosses the customer boundary to the selected managed service endpoint.", benefits: ["Lowest infrastructure burden", "Direct access to documented APIs"], tradeoffs: ["External network path", "Residency/security requirements need validation"], secretModel: "Permanent key stays in a trusted server; browser realtime uses a short-lived grant where documented and appropriate.", operationalOwner: ["deepgram", "customer"], validationRequired: ["Region/residency", "retention", "SLO/concurrency", "legal/security review"], provenance: "working", docsMetadataId: "cloud-api" },
  { id: "regional-endpoint", name: "Regional endpoint concept", description: "Select a documented regional processing path if it is available for the chosen product/account.", boundary: "Exact endpoint and data path require current official documentation and account validation.", benefits: ["May support residency/latency requirements"], tradeoffs: ["Availability and feature parity must not be assumed"], secretModel: "Same server-side/temporary-token boundary, subject to documented product support.", operationalOwner: ["shared"], validationRequired: ["Official endpoint", "product/model availability", "contractual residency behavior"], provenance: "concept", docsMetadataId: "regional" },
  { id: "backend-proxy", name: "Customer backend proxy", description: "Browser/mobile clients call a trusted customer route that calls Deepgram.", boundary: "The permanent key and authorization policy remain in the customer backend.", benefits: ["Centralized authorization/redaction", "No permanent browser credential", "Business-policy enforcement"], tradeoffs: ["Additional hop and customer operational burden"], secretModel: "Secret manager or server-only environment variable; never NEXT_PUBLIC or localStorage.", operationalOwner: ["customer", "deepgram"], validationRequired: ["Proxy auth", "rate limiting", "payload limits", "logging/redaction"], provenance: "working", docsMetadataId: "auth" },
  { id: "browser-temp-token", name: "Browser with temporary token", description: "Trusted local route grants a short-lived credential for an authorized realtime browser session.", boundary: "Permanent key remains on the server; temporary token exists only in memory and is redacted from inspection/export.", benefits: ["Direct realtime media path", "Reduced permanent-secret exposure"], tradeoffs: ["Token lifecycle, reconnect, and browser threat surface"], secretModel: "Short-lived token in memory only; no localStorage, logs, or downloadable artifacts.", operationalOwner: ["shared", "customer"], validationRequired: ["Grant TTL", "session authorization", "reconnect behavior", "token redaction"], provenance: "working", docsMetadataId: "auth-grant" },
  { id: "self-hosted", name: "Self-hosted", description: "Enterprise deployment with API and engine/GPU layers under an agreed operational model.", boundary: "Exact architecture, compatibility, licensing, support, and responsibilities depend on current enterprise documentation/agreement.", benefits: ["Control/data-residency options", "Private network integration"], tradeoffs: ["Capacity, GPU, upgrades, observability, readiness, and incident ownership"], secretModel: "Customer-controlled secret distribution and least-privilege service identity.", operationalOwner: ["customer", "shared"], validationRequired: ["API compatibility", "Kubernetes/container topology", "model updates", "capacity", "support/SLA", "readiness/metrics"], provenance: "concept", docsMetadataId: "self-hosted" },
  { id: "hybrid", name: "Hybrid architecture", description: "Place different bounded workloads in managed and customer-controlled environments.", boundary: "Data routing and capability availability must be explicit for every step.", benefits: ["Match deployment to workload sensitivity/control"], tradeoffs: ["More complex routing, versioning, observability, and failure modes"], secretModel: "Separate scoped secrets and identities for each control plane.", operationalOwner: ["shared", "customer", "third-party"], validationRequired: ["Data classification/routing", "version compatibility", "cross-boundary tracing", "failover policy"], provenance: "concept", docsMetadataId: "self-hosted" },
];

export const MASTERY_LEVELS: MasteryLevel[] = [
  { level: 1, id: "api-operator", name: "API Operator", requirements: [["run-stt", "Run an STT request", "STT"], ["run-tts", "Run a TTS request", "TTS"], ["inspect-payload", "Inspect a sanitized raw payload", "Payload Inspector"], ["explain-auth", "Explain server-only key storage", "Auth"]].map(([id, label, module]) => ({ id, label, module })), disclaimer: "Local learning progress only; not an official Deepgram certification." },
  { level: 2, id: "voice-integrator", name: "Voice Integrator", requirements: [["browser-audio", "Connect browser audio", "Live Mic"], ["encoding-container", "Explain encoding versus container", "Pipeline Anatomy"], ["temporary-token", "Use a temporary token without persistence", "Auth"], ["ws-events", "Handle WebSocket lifecycle events", "Live Mic"]].map(([id, label, module]) => ({ id, label, module })), disclaimer: "Local learning progress only; not an official Deepgram certification." },
  { level: 3, id: "conversation-engineer", name: "Conversation Engineer", requirements: [["endpointing", "Configure/explain endpointing tradeoffs", "Turn-Taking Lab"], ["flux-events", "Explain verified Flux turn-event concepts", "Turn-Taking Lab"], ["interruption", "Handle a simulated interruption", "Turn-Taking Lab"], ["latency", "Separate measured, derived, and simulated latency", "Flight Recorder"]].map(([id, label, module]) => ({ id, label, module })), disclaimer: "Local learning progress only; not an official Deepgram certification." },
  { level: 4, id: "agent-builder", name: "Agent Builder", requirements: [["define-tool", "Define a bounded tool schema", "Tool Calling Lab"], ["validate-args", "Validate function arguments", "Tool Calling Lab"], ["tool-failure", "Recover transparently from tool failure", "Failure Lab"], ["handoff", "Create a safe simulated human handoff", "Multi-Agent Lab"]].map(([id, label, module]) => ({ id, label, module })), disclaimer: "Local learning progress only; not an official Deepgram certification." },
  { level: 5, id: "applied-voice-engineer", name: "Applied Voice Engineer", requirements: [["test-set", "Create a representative test set", "Evaluation Lab"], ["compare-config", "Compare compatible configurations", "Model Lab"], ["regression", "Diagnose a regression by segment", "Evaluation Lab"], ["rollout", "Define canary and rollback criteria", "Applied ML Lens"]].map(([id, label, module]) => ({ id, label, module })), disclaimer: "Local learning progress only; not an official Deepgram certification." },
  { level: 6, id: "client-solutions-architect", name: "Client Solutions Architect", requirements: [["discovery", "Complete explainable discovery", "Client Discovery"], ["architecture", "Build a layered architecture", "Pipeline Anatomy"], ["responsibility", "Define ownership boundaries", "Deployment Lab"], ["poc", "Export a bounded POC plan", "Solution Brief"]].map(([id, label, module]) => ({ id, label, module })), disclaimer: "Local learning progress only; not an official Deepgram certification." },
];

const VERIFIED_AT = "2026-07-12";
export const DOCS_METADATA: DocsMetadata[] = [
  { id: "speech-to-text", capability: "Prerecorded and streaming Speech to Text", docsUrl: "https://developers.deepgram.com/docs/speech-to-text", lastVerifiedAt: VERIFIED_AT, verificationStatus: "verified", executable: true, implementationStatus: "executable", notes: "This lab executes safe URL/file STT through existing local routes and live microphone through the existing token/WebSocket flow. Verify model/option compatibility per request." },
  { id: "flux", capability: "Flux conversational Speech to Text", docsUrl: "https://developers.deepgram.com/docs/flux/quickstart", lastVerifiedAt: "2026-07-28", verificationStatus: "verified", executable: true, implementationStatus: "executable", notes: "Flux Conversation Observatory implements a guarded direct /v2/listen WebSocket path with in-memory temporary credentials plus deterministic fixtures through the same event reducer. Repository tests verify the client boundary; real microphone/provider behavior remains manual-validation-required." },
  { id: "text-to-speech", capability: "Aura Text to Speech", docsUrl: "https://developers.deepgram.com/docs/text-to-speech", lastVerifiedAt: VERIFIED_AT, verificationStatus: "verified", executable: true, implementationStatus: "executable", notes: "Single-request TTS is executed through the existing server route. Streaming TTS remains concept-only unless separately implemented." },
  { id: "voice-agent", capability: "Voice Agent API", docsUrl: "https://developers.deepgram.com/docs/voice-agent", lastVerifiedAt: VERIFIED_AT, verificationStatus: "verified", executable: false, implementationStatus: "concept-only", notes: "The catalog describes the documented WebSocket architecture; Academy sessions and multi-agent flows are simulations, not a live Voice Agent session." },
  { id: "text-intelligence", capability: "Text Intelligence", docsUrl: "https://developers.deepgram.com/docs/text-intelligence", lastVerifiedAt: VERIFIED_AT, verificationStatus: "needs-verification", executable: true, implementationStatus: "executable", notes: "A local server route exists, but every selected feature/response path must be checked against the current official reference before production use." },
  { id: "auth", capability: "API key authentication", docsUrl: "https://developers.deepgram.com/reference/authentication", lastVerifiedAt: VERIFIED_AT, verificationStatus: "verified", executable: true, implementationStatus: "executable", notes: "Permanent key is server-only. Generated and exported examples contain placeholders/redaction only." },
  { id: "auth-grant", capability: "Temporary token grant", docsUrl: "https://developers.deepgram.com/guides/fundamentals/token-based-authentication", lastVerifiedAt: VERIFIED_AT, verificationStatus: "verified", executable: true, implementationStatus: "executable", notes: "Local route returns a short-lived token to authorized client code in memory; inspector/export must redact the token." },
  { id: "self-hosted", capability: "Self-hosted deployment", docsUrl: "https://developers.deepgram.com/docs/self-hosted-introduction/", lastVerifiedAt: VERIFIED_AT, verificationStatus: "verified", executable: false, implementationStatus: "concept-only", notes: "Official docs describe independently scalable API and Engine/GPU layers plus customer operational responsibilities. Exact compatibility, regional availability, licensing, support, and contractual boundaries still require customer/account validation." },
  { id: "cloud-api", capability: "Deepgram cloud APIs", docsUrl: "https://developers.deepgram.com/reference", lastVerifiedAt: VERIFIED_AT, verificationStatus: "verified", executable: true, implementationStatus: "executable", notes: "Only existing safe local routes execute in the lab." },
  { id: "regional", capability: "Regional endpoint selection", docsUrl: "https://developers.deepgram.com/docs", lastVerifiedAt: null, verificationStatus: "needs-verification", executable: false, implementationStatus: "concept-only", notes: "Do not assume a hostname, region, residency guarantee, or feature parity. Validate official product/account documentation." },
  { id: "manage", capability: "Manage APIs", docsUrl: "https://developers.deepgram.com/reference/manage", lastVerifiedAt: VERIFIED_AT, verificationStatus: "needs-verification", executable: false, implementationStatus: "concept-only", notes: "Academy adds no destructive Manage actions. Read-only model listing exists separately in API Studio; privileged operations remain docs-only." },
];

export function getMockTool(id: string): MockToolDefinition | undefined {
  return MOCK_TOOLS.find((tool) => tool.id === id);
}

export function validateMockToolArguments(tool: MockToolDefinition, value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["Arguments must be an object."];
  const record = value as Record<string, unknown>;
  const errors: string[] = [];
  for (const required of tool.schema.required) {
    if (!(required in record) || record[required] === "") errors.push(`Missing required argument: ${required}.`);
  }
  for (const [key, current] of Object.entries(record)) {
    const property = tool.schema.properties[key];
    if (!property) {
      errors.push(`Unexpected argument: ${key}.`);
      continue;
    }
    if (typeof current !== property.type) errors.push(`${key} must be ${property.type}.`);
    if (property.enum && typeof current === "string" && !property.enum.includes(current)) errors.push(`${key} must be one of: ${property.enum.join(", ")}.`);
  }
  return errors;
}
