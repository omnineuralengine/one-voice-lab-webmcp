import { z } from "zod";

export const TELEPHONY_PROVIDER_IDS = ["twilio-conversation-relay"] as const;
export const TELEPHONY_MODES = ["simulation"] as const;
export const TELEPHONY_SCENARIO_IDS = [
  "healthy-call",
  "latency-spike",
  "caller-interruption",
  "dropped-websocket",
  "repeated-silence",
  "combined-production-stress-test",
] as const;
export const TELEPHONY_SAFEGUARD_IDS = [
  "enable-token-streaming",
  "shorten-first-response",
  "enable-interruptible-playback",
  "define-silence-policy",
  "require-signature-validation",
  "define-reconnect-fallback",
  "enable-structured-observability",
] as const;

export const TELEPHONY_GATE_IDS = [
  "responsiveness",
  "interruptibility",
  "resilience",
  "edge-cases",
  "observability",
] as const;
export const TELEPHONY_GATE_STATUSES = ["passed", "needs-attention"] as const;
export const TELEPHONY_EVIDENCE_OWNERS = ["application", "twilio-provider", "shared"] as const;
export const TELEPHONY_ACTIVITY_SOURCES = ["human-ui", "webmcp-agent"] as const;

export const TELEPHONY_EVENT_TYPES = [
  "session_created",
  "signature_validation",
  "websocket_connected",
  "media_playback_policy",
  "handoff_boundary",
  "customer_speech_started",
  "end_of_customer_speech",
  "malformed_message",
  "prompt_sent",
  "first_token_received",
  "final_token_received",
  "start_of_agent_speech",
  "interrupt",
  "dtmf",
  "preempted",
  "listening",
  "websocket_loss",
  "reconnect_attempt",
  "fresh_twiml_requested",
  "fresh_session_recovered",
  "fallback",
  "silence",
  "reprompt",
  "transfer_requested",
  "end_session",
  "intentional_termination",
  "task_completed",
  "hallucination_check",
  "toxicity_check",
  "observability_recorded",
  "failure",
] as const;

export const TELEPHONY_METRIC_IDS = [
  "customer-to-agent-speech-ms",
  "prompt-to-first-token-ms",
  "prompt-to-final-token-ms",
  "time-to-first-audio-ms",
  "first-response-characters",
  "interruption-count",
  "preemption-count",
  "listening-recovery-ms",
  "silence-count",
  "malformed-message-count",
  "reconnect-count",
  "failure-count",
  "turns-per-call",
  "task-completed",
  "escalation-requested",
  "signature-validation",
  "hallucination-check",
  "toxicity-check",
] as const;

export const telephonyProviderIdSchema = z.enum(TELEPHONY_PROVIDER_IDS);
export const telephonyModeSchema = z.enum(TELEPHONY_MODES);
export const telephonyScenarioIdSchema = z.enum(TELEPHONY_SCENARIO_IDS);
export const telephonySafeguardIdSchema = z.enum(TELEPHONY_SAFEGUARD_IDS);
export const telephonyGateIdSchema = z.enum(TELEPHONY_GATE_IDS);
export const telephonyGateStatusSchema = z.enum(TELEPHONY_GATE_STATUSES);
export const telephonyEvidenceOwnerSchema = z.enum(TELEPHONY_EVIDENCE_OWNERS);
export const telephonyActivitySourceSchema = z.enum(TELEPHONY_ACTIVITY_SOURCES);
export const telephonyEventTypeSchema = z.enum(TELEPHONY_EVENT_TYPES);
export const telephonyMetricIdSchema = z.enum(TELEPHONY_METRIC_IDS);

const uniqueSafeguardsSchema = z
  .array(telephonySafeguardIdSchema)
  .max(TELEPHONY_SAFEGUARD_IDS.length)
  .superRefine((safeguards, context) => {
    if (new Set(safeguards).size !== safeguards.length) {
      context.addIssue({ code: "custom", message: "Choose each safeguard at most once." });
    }
  });

export const telephonyReadinessConfigurationSchema = z.object({
  provider: telephonyProviderIdSchema,
  mode: telephonyModeSchema,
  scenario: telephonyScenarioIdSchema,
  safeguards: uniqueSafeguardsSchema,
}).strict();

export const getVoiceLabContextInputSchema = z.object({}).strict();

export const configureTelephonyReadinessInputSchema = z.object({
  provider: telephonyProviderIdSchema,
  mode: telephonyModeSchema,
  scenario: telephonyScenarioIdSchema,
  safeguards: uniqueSafeguardsSchema,
}).strict();

export const runTelephonyReadinessInputSchema = z.object({}).strict();
export const getTelephonyReadinessReportInputSchema = z.object({}).strict();

export const applyTelephonyLabRemediationInputSchema = z.object({
  remediation: telephonySafeguardIdSchema,
}).strict();

export const telephonyTimelineEventSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  sequence: z.number().int().nonnegative(),
  offsetMs: z.number().int().nonnegative(),
  timestamp: z.string().datetime({ offset: true }),
  type: telephonyEventTypeSchema,
  label: z.string().min(1).max(160),
  detail: z.string().min(1).max(800),
  state: z.enum(["observed", "passed", "attention", "failed"]),
  owner: telephonyEvidenceOwnerSchema,
  conversationState: z.enum([
    "CONNECTING",
    "LISTENING",
    "THINKING",
    "SPEAKING",
    "REPROMPT",
    "END_SESSION",
    "FAILED",
  ]).optional(),
  provenance: z.literal("simulated"),
}).strict();

export const telephonyMetricSchema = z.object({
  id: telephonyMetricIdSchema,
  label: z.string().min(1).max(160),
  value: z.union([z.number(), z.boolean(), z.string().min(1).max(160)]),
  unit: z.enum(["ms", "characters", "count", "boolean", "state"]),
  role: z.enum(["primary", "diagnostic", "completeness", "operational", "safety"]),
  detail: z.string().min(1).max(800),
  provenance: z.literal("simulated"),
}).strict();

export const telephonyGateEvidenceSchema = z.object({
  summary: z.string().min(1).max(800),
  eventIds: z.array(z.string()).max(40),
  metricIds: z.array(telephonyMetricIdSchema).max(20),
  provenance: z.literal("simulated"),
}).strict();

export const telephonyEvidenceGateSchema = z.object({
  id: telephonyGateIdSchema,
  title: z.string().min(1).max(160),
  status: telephonyGateStatusSchema,
  owner: telephonyEvidenceOwnerSchema,
  evidence: z.array(telephonyGateEvidenceSchema).min(1).max(12),
  recommendedNextAction: z.string().min(1).max(500),
}).strict();

export const optionalDownstreamConceptSchema = z.object({
  id: z.literal("predictive-csat"),
  label: z.literal("Predictive CSAT"),
  status: z.literal("not-computed"),
  detail: z.string().min(1).max(500),
}).strict();

export const telephonyReadinessReportSchema = z.object({
  schemaVersion: z.literal("one-telephony-readiness-report-v1"),
  runId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  provider: telephonyProviderIdSchema,
  adapterLabel: z.literal("Twilio ConversationRelay — first supported telephony adapter"),
  mode: z.literal("simulation"),
  scenario: telephonyScenarioIdSchema,
  safeguards: uniqueSafeguardsSchema,
  startedAt: z.string().datetime({ offset: true }),
  completedAt: z.string().datetime({ offset: true }),
  evidenceMode: z.literal("simulated"),
  evidenceDisclosure: z.literal("Simulated evidence only — no imported or live evidence."),
  credentialsStatus: z.literal("Credentials not configured"),
  liveCallStatus: z.literal("No live call placed"),
  liveActionsAvailable: z.literal(false),
  providerRequestCount: z.literal(0),
  providerCreditCount: z.literal(0),
  timeline: z.array(telephonyTimelineEventSchema).min(1).max(120),
  metrics: z.array(telephonyMetricSchema).min(1).max(40),
  gates: z.array(telephonyEvidenceGateSchema).length(TELEPHONY_GATE_IDS.length),
  gatesPassed: z.array(telephonyGateIdSchema).max(TELEPHONY_GATE_IDS.length),
  gatesNeedingAttention: z.array(telephonyGateIdSchema).max(TELEPHONY_GATE_IDS.length),
  overallStatus: z.enum(["all-gates-passed", "needs-attention"]),
  callOutcome: z.enum(["completed", "failed", "ended-by-policy", "completed-with-escalation"]),
  optionalDownstreamConcepts: z.array(optionalDownstreamConceptSchema).length(1),
  limitations: z.array(z.string().min(1).max(500)).min(1).max(12),
}).strict().superRefine((report, context) => {
  const gateIds = report.gates.map((gate) => gate.id);
  if (new Set(gateIds).size !== TELEPHONY_GATE_IDS.length || TELEPHONY_GATE_IDS.some((id) => !gateIds.includes(id))) {
    context.addIssue({ code: "custom", path: ["gates"], message: "A report must contain each readiness gate exactly once." });
  }
  const passed = report.gates.filter((gate) => gate.status === "passed").map((gate) => gate.id);
  const attention = report.gates.filter((gate) => gate.status === "needs-attention").map((gate) => gate.id);
  if (passed.join("|") !== report.gatesPassed.join("|") || attention.join("|") !== report.gatesNeedingAttention.join("|")) {
    context.addIssue({ code: "custom", message: "Gate summary arrays must match the ordered gate results." });
  }
});

export const telephonyLabContextSchema = z.object({
  provider: telephonyProviderIdSchema,
  mode: telephonyModeSchema,
  scenario: telephonyScenarioIdSchema,
  configuredSafeguards: uniqueSafeguardsSchema,
  gateState: z.array(z.object({
    id: telephonyGateIdSchema,
    status: z.enum(["not-run", ...TELEPHONY_GATE_STATUSES]),
  }).strict()).length(TELEPHONY_GATE_IDS.length),
  credentialsStatus: z.literal("Credentials not configured"),
  liveCallStatus: z.literal("No live call placed"),
  liveActionsAvailable: z.literal(false),
  latestActivitySource: telephonyActivitySourceSchema.nullable(),
}).strict();

export type TelephonyProviderId = z.infer<typeof telephonyProviderIdSchema>;
export type TelephonyMode = z.infer<typeof telephonyModeSchema>;
export type TelephonyScenarioId = z.infer<typeof telephonyScenarioIdSchema>;
export type TelephonySafeguardId = z.infer<typeof telephonySafeguardIdSchema>;
export type TelephonyGateId = z.infer<typeof telephonyGateIdSchema>;
export type TelephonyGateStatus = z.infer<typeof telephonyGateStatusSchema>;
export type TelephonyEvidenceOwner = z.infer<typeof telephonyEvidenceOwnerSchema>;
export type TelephonyActivitySource = z.infer<typeof telephonyActivitySourceSchema>;
export type TelephonyEventType = z.infer<typeof telephonyEventTypeSchema>;
export type TelephonyMetricId = z.infer<typeof telephonyMetricIdSchema>;
export type TelephonyReadinessConfiguration = z.infer<typeof telephonyReadinessConfigurationSchema>;
export type ConfigureTelephonyReadinessInput = z.infer<typeof configureTelephonyReadinessInputSchema>;
export type RunTelephonyReadinessInput = z.infer<typeof runTelephonyReadinessInputSchema>;
export type ApplyTelephonyLabRemediationInput = z.infer<typeof applyTelephonyLabRemediationInputSchema>;
export type TelephonyTimelineEvent = z.infer<typeof telephonyTimelineEventSchema>;
export type TelephonyMetric = z.infer<typeof telephonyMetricSchema>;
export type TelephonyGateEvidence = z.infer<typeof telephonyGateEvidenceSchema>;
export type TelephonyEvidenceGate = z.infer<typeof telephonyEvidenceGateSchema>;
export type TelephonyReadinessReport = z.infer<typeof telephonyReadinessReportSchema>;
export type TelephonyLabContext = z.infer<typeof telephonyLabContextSchema>;

export type TelephonyScenarioFixture = Readonly<{
  id: TelephonyScenarioId;
  label: string;
  description: string;
  startedAt: string;
  customerSpeechStartMs: number;
  customerSpeechEndMs: number;
  promptSentMs: number;
  firstTokenReceivedMs: number;
  finalTokenReceivedMs: number;
  agentSpeechStartMs: number;
  firstResponseCharacters: number;
  interruptAtMs?: number;
  dtmfAtMs?: number;
  websocketLossAtMs?: number;
  silenceAtMs: readonly number[];
  malformedMessageAtMs: readonly number[];
  transferRequested: boolean;
  escalationRequested: boolean;
  baseTurns: number;
}>;

/**
 * A telephony adapter in this stage can only produce deterministic local
 * evidence. There is intentionally no connect, dial, credential, or network
 * method on this contract.
 */
export interface TelephonySimulationAdapter {
  readonly provider: TelephonyProviderId;
  readonly displayName: string;
  readonly mode: "simulation";
  run(configuration: TelephonyReadinessConfiguration): TelephonyReadinessReport;
}
