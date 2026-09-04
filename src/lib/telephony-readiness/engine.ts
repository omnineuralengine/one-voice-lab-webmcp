import {
  TELEPHONY_GATE_IDS,
  TELEPHONY_SAFEGUARD_IDS,
  telephonyReadinessConfigurationSchema,
  telephonyReadinessReportSchema,
  type TelephonyEvidenceGate,
  type TelephonyEventType,
  type TelephonyMetric,
  type TelephonyReadinessConfiguration,
  type TelephonyReadinessReport,
  type TelephonySafeguardId,
  type TelephonyScenarioFixture,
  type TelephonyTimelineEvent,
} from "@/lib/telephony-readiness/contracts";
import { getTelephonyScenarioFixture } from "@/lib/telephony-readiness/fixtures";

export const TELEPHONY_RESPONSIVENESS_TARGET_MS = 1_200;
export const TELEPHONY_CONCISE_RESPONSE_MAX_CHARACTERS = 120;

export const DEFAULT_TELEPHONY_READINESS_CONFIGURATION: TelephonyReadinessConfiguration =
  telephonyReadinessConfigurationSchema.parse({
    provider: "twilio-conversation-relay",
    mode: "simulation",
    scenario: "healthy-call",
    safeguards: [],
  });

type EventDraft = Omit<TelephonyTimelineEvent, "id" | "sequence" | "timestamp" | "provenance">;

type EffectiveTiming = Readonly<{
  firstTokenReceivedMs: number;
  finalTokenReceivedMs: number;
  agentSpeechStartMs: number;
  firstResponseCharacters: number;
}>;

export function evaluateTelephonyResponsiveness(customerToAgentSpeechMs: number) {
  return Number.isFinite(customerToAgentSpeechMs)
    && customerToAgentSpeechMs >= 0
    && customerToAgentSpeechMs < TELEPHONY_RESPONSIVENESS_TARGET_MS;
}

export function normalizeTelephonySafeguards(
  safeguards: readonly TelephonySafeguardId[],
): TelephonySafeguardId[] {
  const selected = new Set(safeguards);
  return TELEPHONY_SAFEGUARD_IDS.filter((id) => selected.has(id));
}

export function enableTelephonySafeguard(
  configuration: TelephonyReadinessConfiguration,
  remediation: TelephonySafeguardId,
): Readonly<{ configuration: TelephonyReadinessConfiguration; changed: boolean }> {
  const parsed = telephonyReadinessConfigurationSchema.parse(configuration);
  const changed = !parsed.safeguards.includes(remediation);
  const safeguards = normalizeTelephonySafeguards([...parsed.safeguards, remediation]);
  return {
    changed,
    configuration: telephonyReadinessConfigurationSchema.parse({ ...parsed, safeguards }),
  };
}

function effectiveTiming(
  fixture: TelephonyScenarioFixture,
  safeguards: ReadonlySet<TelephonySafeguardId>,
): EffectiveTiming {
  const tokenStreamingReduction = safeguards.has("enable-token-streaming") ? 180 : 0;
  const conciseResponseReduction = safeguards.has("shorten-first-response") ? 150 : 0;
  const firstTokenReceivedMs = Math.max(
    fixture.promptSentMs + 40,
    fixture.firstTokenReceivedMs - tokenStreamingReduction,
  );
  const agentSpeechStartMs = Math.max(
    firstTokenReceivedMs + 40,
    fixture.agentSpeechStartMs - tokenStreamingReduction - conciseResponseReduction,
  );
  const finalTokenReceivedMs = Math.max(
    firstTokenReceivedMs + 80,
    fixture.finalTokenReceivedMs - conciseResponseReduction,
  );
  return {
    firstTokenReceivedMs,
    finalTokenReceivedMs,
    agentSpeechStartMs,
    firstResponseCharacters: safeguards.has("shorten-first-response")
      ? Math.min(fixture.firstResponseCharacters, 96)
      : fixture.firstResponseCharacters,
  };
}

function createTimeline(
  fixture: TelephonyScenarioFixture,
  safeguards: ReadonlySet<TelephonySafeguardId>,
  timing: EffectiveTiming,
): TelephonyTimelineEvent[] {
  const drafts: Array<EventDraft & { insertion: number }> = [];
  const add = (event: EventDraft) => drafts.push({ ...event, insertion: drafts.length });
  const signatureRequired = safeguards.has("require-signature-validation");
  const interruptible = safeguards.has("enable-interruptible-playback");
  const reconnectDefined = safeguards.has("define-reconnect-fallback");
  const silenceDefined = safeguards.has("define-silence-policy");
  const observable = safeguards.has("enable-structured-observability");
  const interruptionTerminalBeforeLoss = fixture.websocketLossAtMs !== undefined
    && fixture.interruptAtMs !== undefined
    && !interruptible
    && Math.max(fixture.interruptAtMs, fixture.dtmfAtMs ?? fixture.interruptAtMs) + 20 <= fixture.websocketLossAtMs;
  const successfulPreemptionBeforeLoss = fixture.websocketLossAtMs !== undefined
    && fixture.interruptAtMs !== undefined
    && interruptible
    && Math.max(fixture.interruptAtMs, fixture.dtmfAtMs ?? fixture.interruptAtMs) + 20 <= fixture.websocketLossAtMs;
  const recoveryAtMs = fixture.websocketLossAtMs !== undefined
    && reconnectDefined
    && !interruptionTerminalBeforeLoss
    ? fixture.websocketLossAtMs + 180
    : null;
  const transportCanObserve = (offsetMs: number) => fixture.websocketLossAtMs === undefined
    || offsetMs <= fixture.websocketLossAtMs
    || recoveryAtMs !== null && offsetMs >= recoveryAtMs;

  add({ offsetMs: 0, type: "session_created", label: "Simulated session created", detail: "A local deterministic session was created without credentials, network access, or a live call.", state: "observed", owner: "application", conversationState: "CONNECTING" });
  add({ offsetMs: 20, type: "signature_validation", label: signatureRequired ? "Initial signature validation required" : "Signature validation is not required", detail: signatureRequired ? "The simulated initial X-Twilio-Signature passed the configured validation boundary." : "The application would accept an initial session without requiring X-Twilio-Signature validation.", state: signatureRequired ? "passed" : "attention", owner: "application", conversationState: "CONNECTING" });
  add({ offsetMs: 50, type: "websocket_connected", label: "ConversationRelay transport connected", detail: "The simulated media channel entered LISTENING. No WebSocket was opened.", state: "passed", owner: "twilio-provider", conversationState: "LISTENING" });
  add({ offsetMs: 70, type: "media_playback_policy", label: interruptible ? "Interruptible media policy active" : "Playback preemption policy missing", detail: interruptible ? "Caller speech or DTMF preempts concise playback." : "Playback has no configured caller-interruption preemption behavior.", state: interruptible ? "passed" : "attention", owner: "application", conversationState: "LISTENING" });
  add({ offsetMs: 80, type: "handoff_boundary", label: "Transfer boundary declared", detail: "A transfer is explicit and separate from task success; escalation never masquerades as completion.", state: "passed", owner: "shared", conversationState: "LISTENING" });
  add({ offsetMs: fixture.customerSpeechStartMs, type: "customer_speech_started", label: "Customer speech started", detail: "The caller began the deterministic utterance.", state: "observed", owner: "twilio-provider", conversationState: "LISTENING" });

  fixture.malformedMessageAtMs.forEach((offsetMs, index) => {
    const observable = transportCanObserve(offsetMs);
    const afterLoss = fixture.websocketLossAtMs !== undefined && offsetMs > fixture.websocketLossAtMs;
    const reconnecting = afterLoss && recoveryAtMs !== null && offsetMs < recoveryAtMs;
    add({
      offsetMs,
      type: "malformed_message",
      label: observable
        ? `Malformed message ${index + 1} rejected`
        : `Malformed message ${index + 1} not observed after transport loss`,
      detail: observable
        ? "The malformed simulated payload was classified and rejected; it did not advance the conversation state."
        : "The deterministic injection remained scheduled evidence, but the unavailable transport could not deliver it to the application.",
      state: observable ? "passed" : "attention",
      owner: "application",
      conversationState: reconnecting ? "CONNECTING" : observable ? "LISTENING" : "FAILED",
    });
  });

  add({ offsetMs: fixture.customerSpeechEndMs, type: "end_of_customer_speech", label: "Customer speech ended", detail: "Primary responsiveness timing starts at this event.", state: "observed", owner: "twilio-provider", conversationState: "THINKING" });
  add({ offsetMs: fixture.promptSentMs, type: "prompt_sent", label: "Prompt sent to local fixture", detail: "The prompt-to-token slice is diagnostic application evidence, not the primary responsiveness gate.", state: "observed", owner: "application", conversationState: "THINKING" });
  if (transportCanObserve(timing.firstTokenReceivedMs)) add({ offsetMs: timing.firstTokenReceivedMs, type: "first_token_received", label: "First token received", detail: "The first deterministic token completes the application-latency diagnostic slice.", state: "observed", owner: "application", conversationState: "THINKING" });
  const speechOccurrences: Array<Readonly<{ offsetMs: number; resumed: boolean }>> = [];
  if (
    recoveryAtMs !== null
    && fixture.websocketLossAtMs !== undefined
    && timing.agentSpeechStartMs <= recoveryAtMs
    && !successfulPreemptionBeforeLoss
  ) {
    if (timing.agentSpeechStartMs < fixture.websocketLossAtMs) {
      speechOccurrences.push({ offsetMs: timing.agentSpeechStartMs, resumed: false });
    }
    speechOccurrences.push({ offsetMs: recoveryAtMs + 40, resumed: true });
  } else if (transportCanObserve(timing.agentSpeechStartMs)) {
    speechOccurrences.push({ offsetMs: timing.agentSpeechStartMs, resumed: false });
  }
  speechOccurrences.forEach(({ offsetMs, resumed }) => add({
    offsetMs,
    type: "start_of_agent_speech",
    label: resumed ? "Agent speech restarted after fresh-session recovery" : "Agent speech started",
    detail: resumed
      ? "The recovered session explicitly restarted response audio; completion never relies on pre-loss speech alone."
      : "Primary responsiveness timing ends at this event.",
    state: evaluateTelephonyResponsiveness(offsetMs - fixture.customerSpeechEndMs) ? "passed" : "attention",
    owner: "shared",
    conversationState: "SPEAKING",
  }));
  if (transportCanObserve(timing.finalTokenReceivedMs)) {
    const speechActiveAtFinalToken = speechOccurrences.some(({ offsetMs }) => (
      offsetMs <= timing.finalTokenReceivedMs
      && (
        fixture.websocketLossAtMs === undefined
        || timing.finalTokenReceivedMs <= fixture.websocketLossAtMs
        || recoveryAtMs !== null && offsetMs >= recoveryAtMs
      )
    ));
    add({ offsetMs: timing.finalTokenReceivedMs, type: "final_token_received", label: "Final token received", detail: "Final-token timing is completeness and debugging evidence, not the primary responsiveness gate.", state: "observed", owner: "application", conversationState: speechActiveAtFinalToken ? "SPEAKING" : "THINKING" });
  }

  if (fixture.interruptAtMs !== undefined) {
    const finalInterruptInputMs = Math.max(fixture.interruptAtMs, fixture.dtmfAtMs ?? fixture.interruptAtMs);
    add({ offsetMs: fixture.interruptAtMs, type: "interrupt", label: "Caller interrupted playback", detail: "Caller speech arrived while the concise response was playing.", state: "observed", owner: "twilio-provider", conversationState: "SPEAKING" });
    if (fixture.dtmfAtMs !== undefined) add({ offsetMs: fixture.dtmfAtMs, type: "dtmf", label: "DTMF received", detail: "The deterministic DTMF event shares the same explicit preemption boundary.", state: "observed", owner: "twilio-provider", conversationState: "SPEAKING" });
    if (interruptible) {
      add({ offsetMs: finalInterruptInputMs + 20, type: "preempted", label: "Playback preempted", detail: "Active media stopped once after the final caller interruption input; stale playback cannot continue into the next turn.", state: "passed", owner: "application", conversationState: "THINKING" });
      add({ offsetMs: finalInterruptInputMs + 80, type: "listening", label: "Recovered to LISTENING", detail: "The session returned to LISTENING after a bounded 80 ms recovery from the final caller interruption input.", state: "passed", owner: "shared", conversationState: "LISTENING" });
    } else {
      add({ offsetMs: finalInterruptInputMs + 20, type: "failure", label: "Interruption did not preempt playback", detail: "Without interruptible playback, caller speech and DTMF leave stale media active.", state: "failed", owner: "application", conversationState: "FAILED" });
    }
  }

  if (fixture.websocketLossAtMs !== undefined) {
    const terminalFailureAlreadyActive = drafts.some((event) => (
      event.state === "failed" && event.offsetMs <= fixture.websocketLossAtMs!
    ));
    add({ offsetMs: fixture.websocketLossAtMs, type: "websocket_loss", label: "WebSocket loss observed", detail: "The simulated transport was dropped; this is fixture evidence, not a real network event.", state: "attention", owner: "twilio-provider", conversationState: "FAILED" });
    const recoveryAllowed = reconnectDefined && !terminalFailureAlreadyActive;
    add({ offsetMs: fixture.websocketLossAtMs + 50, type: "reconnect_attempt", label: "Bounded reconnect policy evaluated", detail: recoveryAllowed ? "The application requested recovery through a fresh TwiML/session boundary." : terminalFailureAlreadyActive ? "A prior terminal application failure prevented the transport event from restarting the call." : "No fresh-session recovery or terminal fallback is configured.", state: recoveryAllowed ? "observed" : "failed", owner: "application", conversationState: recoveryAllowed ? "CONNECTING" : "FAILED" });
    if (recoveryAllowed) {
      add({ offsetMs: fixture.websocketLossAtMs + 100, type: "fresh_twiml_requested", label: "Fresh TwiML requested", detail: "Recovery does not reuse the lost ConversationRelay session.", state: "passed", owner: "application", conversationState: "CONNECTING" });
      add({ offsetMs: fixture.websocketLossAtMs + 180, type: "fresh_session_recovered", label: "Fresh session recovered", detail: "The new simulated session restored a coherent LISTENING state.", state: "passed", owner: "shared", conversationState: "LISTENING" });
      add({ offsetMs: fixture.websocketLossAtMs + 200, type: "fallback", label: "Fallback remains defined", detail: "If fresh-session recovery failed, the policy would end safely or transfer explicitly.", state: "passed", owner: "application" });
    } else {
      add({ offsetMs: fixture.websocketLossAtMs + 100, type: "fallback", label: "Fallback undefined", detail: "The transport failure terminates as a visible failure and cannot be reported as success.", state: "failed", owner: "application", conversationState: "FAILED" });
    }
  }

  if (fixture.transferRequested) {
    const transferAtMs = Math.max(
      timing.finalTokenReceivedMs,
      timing.agentSpeechStartMs,
    ) + 40;
    add({ offsetMs: transferAtMs, type: "transfer_requested", label: "Explicit transfer requested", detail: "The escalation request crossed the declared handoff boundary before later injected failures; no completed transfer or task success is claimed.", state: "observed", owner: "shared", conversationState: "SPEAKING" });
  }

  if (
    fixture.silenceAtMs.length > 0
    && fixture.interruptAtMs === undefined
    && fixture.websocketLossAtMs === undefined
  ) {
    add({ offsetMs: Math.max(timing.finalTokenReceivedMs, timing.agentSpeechStartMs) + 100, type: "listening", label: "Agent response completed; LISTENING resumed", detail: "The deterministic response completed before the silence observation window opened.", state: "passed", owner: "shared", conversationState: "LISTENING" });
  }

  fixture.silenceAtMs.forEach((offsetMs, index) => {
    const terminalFailureAlreadyActive = drafts.some((event) => (
      event.state === "failed" && event.offsetMs <= offsetMs
    ));
    if (!transportCanObserve(offsetMs) || terminalFailureAlreadyActive) {
      add({ offsetMs, type: "silence", label: "Scheduled silence not observed after terminal failure", detail: "The fixture retains the scheduled stress input, but a terminal failure prevents it from advancing conversation state or claiming a REPROMPT/END_SESSION result.", state: "attention", owner: "shared", conversationState: "FAILED" });
      return;
    }
    add({ offsetMs, type: "silence", label: index === 0 ? "First silence observed" : "Repeated silence observed", detail: "A deterministic no-input turn reached the explicit silence boundary.", state: "attention", owner: "shared", conversationState: "LISTENING" });
    if (silenceDefined && index === 0) {
      add({ offsetMs: offsetMs + 20, type: "reprompt", label: "REPROMPT", detail: "First silence produces one concise reprompt.", state: "passed", owner: "application", conversationState: "REPROMPT" });
      add({ offsetMs: offsetMs + 40, type: "listening", label: "Reprompt completed; LISTENING resumed", detail: "The bounded reprompt completed and reopened the next input window.", state: "passed", owner: "shared", conversationState: "LISTENING" });
    }
    if (silenceDefined && index > 0) {
      add({ offsetMs: offsetMs + 20, type: "end_session", label: "END_SESSION", detail: "Repeated silence selected the terminal session policy; no undefined dead-air loop remains.", state: "passed", owner: "application", conversationState: "END_SESSION" });
      add({ offsetMs: offsetMs + 20, type: "intentional_termination", label: "Intentional termination", detail: "The END_SESSION policy atomically sealed the simulated conversation terminal state.", state: "passed", owner: "application", conversationState: "END_SESSION" });
    }
    if (!silenceDefined && index === fixture.silenceAtMs.length - 1) add({ offsetMs: offsetMs + 20, type: "failure", label: "Repeated-silence policy undefined", detail: "After repeated silence, the application still has no deterministic reprompt/end behavior and risks a dead-air loop.", state: "failed", owner: "application", conversationState: "FAILED" });
  });

  const tail = Math.max(
    timing.finalTokenReceivedMs,
    timing.agentSpeechStartMs,
    fixture.interruptAtMs === undefined
      ? 0
      : Math.max(fixture.interruptAtMs, fixture.dtmfAtMs ?? fixture.interruptAtMs) + 80,
    (fixture.websocketLossAtMs ?? 0) + (fixture.websocketLossAtMs === undefined ? 0 : 220),
    ...fixture.silenceAtMs.map((value) => value + 40),
  );
  const terminalFailure = drafts.some((event) => event.state === "failed");
  const policyEnded = drafts.some((event) => event.type === "end_session");
  if (!terminalFailure && !policyEnded) add({ offsetMs: tail + 40, type: "intentional_termination", label: "Intentional termination", detail: "The bounded simulation closed with an explicit terminal state.", state: "passed", owner: "application", conversationState: "END_SESSION" });
  add({ offsetMs: tail + 60, type: "hallucination_check", label: "Post-call hallucination rule check", detail: "Post-call diagnostic bookkeeping found no unsupported task claim; this deterministic rule is not a model-based judgment.", state: "passed", owner: "application" });
  add({ offsetMs: tail + 70, type: "toxicity_check", label: "Post-call toxicity rule check", detail: "Post-call diagnostic bookkeeping found no flagged phrase; this deterministic rule is not a model-based judgment.", state: "passed", owner: "application" });
  const taskCompleted = !terminalFailure
    && fixture.silenceAtMs.length < 2
    && !fixture.escalationRequested;
  if (taskCompleted) {
    add({ offsetMs: tail + 80, type: "task_completed", label: "Post-call task completion recorded", detail: "The deterministic task outcome was recorded explicitly after all required steps completed.", state: "passed", owner: "shared" });
  }
  add({ offsetMs: tail + 90, type: "observability_recorded", label: observable ? "Post-call structured observability recorded" : "Post-call structured observability disabled", detail: observable ? "Post-call diagnostic bookkeeping retained timeline, latency, interruption, silence, recovery, turns, task outcome, escalation, and safety checks." : "The lab can display fixture output, but the application configuration does not retain the required per-call evidence.", state: observable ? "passed" : "attention", owner: "application" });

  const sorted = [...drafts].sort((left, right) => left.offsetMs - right.offsetMs || left.insertion - right.insertion);
  const typeCounts = new Map<TelephonyEventType, number>();
  const baseTime = Date.parse(fixture.startedAt);
  return sorted.map(({ insertion, ...event }, sequence) => {
    void insertion;
    const count = (typeCounts.get(event.type) ?? 0) + 1;
    typeCounts.set(event.type, count);
    return {
      ...event,
      id: `${event.type.replaceAll("_", "-")}-${count}`,
      sequence,
      timestamp: new Date(baseTime + event.offsetMs).toISOString(),
      provenance: "simulated" as const,
    };
  });
}

function eventsOf(timeline: readonly TelephonyTimelineEvent[], ...types: TelephonyEventType[]) {
  const selected = new Set(types);
  return timeline.filter((event) => selected.has(event.type)).map((event) => event.id);
}

function eventIdsWhere(
  timeline: readonly TelephonyTimelineEvent[],
  predicate: (event: TelephonyTimelineEvent) => boolean,
) {
  return timeline.filter(predicate).map((event) => event.id);
}

function eventOffset(timeline: readonly TelephonyTimelineEvent[], type: TelephonyEventType) {
  return timeline.find((event) => event.type === type)?.offsetMs;
}

function createMetrics(
  fixture: TelephonyScenarioFixture,
  timing: EffectiveTiming,
  timeline: readonly TelephonyTimelineEvent[],
  safeguards: ReadonlySet<TelephonySafeguardId>,
): TelephonyMetric[] {
  const metric = (value: TelephonyMetric) => value;
  const interruptionCount = timeline.filter((event) => event.type === "interrupt" || event.type === "dtmf").length;
  const preemptionCount = timeline.filter((event) => event.type === "preempted").length;
  const reconnectCount = timeline.filter((event) => event.type === "fresh_session_recovered").length;
  const failureCount = timeline.filter((event) => event.state === "failed").length;
  const taskCompleted = timeline.some((event) => event.type === "task_completed" && event.state === "passed");
  const customerSpeechEndMs = eventOffset(timeline, "end_of_customer_speech");
  const agentSpeechStartMs = eventOffset(timeline, "start_of_agent_speech");
  const promptSentMs = eventOffset(timeline, "prompt_sent");
  const firstTokenReceivedMs = eventOffset(timeline, "first_token_received");
  const finalTokenReceivedMs = eventOffset(timeline, "final_token_received");
  const customerToAgentSpeech = customerSpeechEndMs !== undefined && agentSpeechStartMs !== undefined
    ? agentSpeechStartMs - customerSpeechEndMs
    : "not-observed";
  const promptToFirstToken = promptSentMs !== undefined && firstTokenReceivedMs !== undefined
    ? firstTokenReceivedMs - promptSentMs
    : "not-observed";
  const promptToFinalToken = promptSentMs !== undefined && finalTokenReceivedMs !== undefined
    ? finalTokenReceivedMs - promptSentMs
    : "not-observed";
  return [
    metric({ id: "customer-to-agent-speech-ms", label: "Customer-to-agent speech", value: customerToAgentSpeech, unit: typeof customerToAgentSpeech === "number" ? "ms" : "state", role: "primary", detail: "start_of_agent_speech - end_of_customer_speech; must be observed and strictly below 1200 ms.", provenance: "simulated" }),
    metric({ id: "time-to-first-audio-ms", label: "Time to first audio", value: customerToAgentSpeech, unit: typeof customerToAgentSpeech === "number" ? "ms" : "state", role: "operational", detail: "Per-call first-audio timing from the end of customer speech, or not-observed after an unrecovered loss.", provenance: "simulated" }),
    metric({ id: "prompt-to-first-token-ms", label: "Prompt to first token", value: promptToFirstToken, unit: typeof promptToFirstToken === "number" ? "ms" : "state", role: "diagnostic", detail: "Application-latency diagnostic slice; not the primary responsiveness gate.", provenance: "simulated" }),
    metric({ id: "prompt-to-final-token-ms", label: "Prompt to final token", value: promptToFinalToken, unit: typeof promptToFinalToken === "number" ? "ms" : "state", role: "completeness", detail: "Completeness/debug evidence; not the primary responsiveness gate.", provenance: "simulated" }),
    metric({ id: "first-response-characters", label: "First response length", value: timing.firstResponseCharacters, unit: "characters", role: "operational", detail: "Short responses remain easier to interrupt.", provenance: "simulated" }),
    metric({ id: "interruption-count", label: "Interruptions and DTMF", value: interruptionCount, unit: "count", role: "operational", detail: "Caller-speech interruption and DTMF observations.", provenance: "simulated" }),
    metric({ id: "preemption-count", label: "Playback preemptions", value: preemptionCount, unit: "count", role: "operational", detail: "Successful stale-playback cancellations.", provenance: "simulated" }),
    metric({ id: "listening-recovery-ms", label: "LISTENING recovery", value: fixture.interruptAtMs === undefined ? "not-exercised" : preemptionCount > 0 ? 80 : "not-recovered", unit: typeof (fixture.interruptAtMs === undefined ? "not-exercised" : preemptionCount > 0 ? 80 : "not-recovered") === "number" ? "ms" : "state", role: "operational", detail: "Bounded recovery after caller interruption.", provenance: "simulated" }),
    metric({ id: "silence-count", label: "Silence events", value: fixture.silenceAtMs.length, unit: "count", role: "operational", detail: "First and repeated silence observations.", provenance: "simulated" }),
    metric({ id: "malformed-message-count", label: "Malformed messages", value: fixture.malformedMessageAtMs.length, unit: "count", role: "safety", detail: "Malformed payloads classified without advancing state.", provenance: "simulated" }),
    metric({ id: "reconnect-count", label: "Fresh-session recoveries", value: reconnectCount, unit: "count", role: "operational", detail: "Successful fresh TwiML/session recovery events.", provenance: "simulated" }),
    metric({ id: "failure-count", label: "Visible failures", value: failureCount, unit: "count", role: "safety", detail: "Failures remain explicit and cannot masquerade as success.", provenance: "simulated" }),
    metric({ id: "turns-per-call", label: "Turns per call", value: fixture.baseTurns, unit: "count", role: "operational", detail: "Deterministic turn count for this fixture.", provenance: "simulated" }),
    metric({ id: "task-completed", label: "Task completion", value: taskCompleted, unit: "boolean", role: "operational", detail: "False when policy termination, escalation, or transport failure prevents normal completion.", provenance: "simulated" }),
    metric({ id: "escalation-requested", label: "Escalation request", value: fixture.escalationRequested, unit: "boolean", role: "operational", detail: "Escalation remains distinct from task success.", provenance: "simulated" }),
    metric({ id: "signature-validation", label: "Initial signature validation", value: safeguards.has("require-signature-validation") ? "required-and-passed" : "not-required", unit: "state", role: "safety", detail: "Simulated initial X-Twilio-Signature boundary.", provenance: "simulated" }),
    metric({ id: "hallucination-check", label: "Hallucination check", value: "passed-deterministic-rule", unit: "state", role: "safety", detail: "Rule-based fixture output; not an objective model-quality measurement.", provenance: "simulated" }),
    metric({ id: "toxicity-check", label: "Toxicity check", value: "passed-deterministic-rule", unit: "state", role: "safety", detail: "Rule-based fixture output; not an objective model-quality measurement.", provenance: "simulated" }),
  ];
}

function createGates(
  fixture: TelephonyScenarioFixture,
  timing: EffectiveTiming,
  timeline: readonly TelephonyTimelineEvent[],
  safeguards: ReadonlySet<TelephonySafeguardId>,
): TelephonyEvidenceGate[] {
  const observedAgentSpeechMs = eventOffset(timeline, "start_of_agent_speech");
  const responsiveMs = observedAgentSpeechMs === undefined
    ? null
    : observedAgentSpeechMs - fixture.customerSpeechEndMs;
  const responsive = responsiveMs !== null && evaluateTelephonyResponsiveness(responsiveMs);
  const interrupted = fixture.interruptAtMs !== undefined;
  const interruptible = safeguards.has("enable-interruptible-playback");
  const concise = timing.firstResponseCharacters <= TELEPHONY_CONCISE_RESPONSE_MAX_CHARACTERS;
  const interruptPassed = interrupted
    && interruptible
    && concise
    && timeline.some((event) => event.type === "preempted")
    && timeline.some((event) => event.type === "listening");
  const signaturePassed = safeguards.has("require-signature-validation");
  const reconnectPassed = fixture.websocketLossAtMs !== undefined
    && safeguards.has("define-reconnect-fallback")
    && timeline.some((event) => event.type === "fresh_session_recovered");
  const malformedHandled = fixture.malformedMessageAtMs.length > 0
    && timeline.filter((event) => event.type === "malformed_message").every((event) => event.state === "passed");
  const resiliencePassed = signaturePassed && reconnectPassed && malformedHandled;
  const edgePassed = safeguards.has("define-silence-policy")
    && fixture.silenceAtMs.length > 1
    && timeline.some((event) => event.type === "reprompt")
    && timeline.some((event) => event.type === "end_session")
    && timeline.some((event) => event.type === "media_playback_policy" && event.state === "passed")
    && timeline.some((event) => event.type === "handoff_boundary" && event.state === "passed")
    && timeline.some((event) => event.type === "intentional_termination" && event.state === "passed");
  const observable = safeguards.has("enable-structured-observability");
  const gate = (value: TelephonyEvidenceGate) => value;
  return [
    gate({ id: "responsiveness", title: "Responsive enough to feel natural", status: responsive ? "passed" : "needs-attention", owner: "shared", evidence: [{ summary: responsiveMs === null ? "start_of_agent_speech was not observed after transport loss, so responsiveness cannot pass. prompt_sent to first_token_received remains diagnostic only, and final_token_received remains completeness evidence." : `${responsiveMs} ms from end_of_customer_speech to start_of_agent_speech; the gate requires < 1200 ms. prompt_sent to first_token_received is diagnostic only, and final_token_received is completeness evidence.`, eventIds: eventsOf(timeline, "end_of_customer_speech", "prompt_sent", "first_token_received", "final_token_received", "start_of_agent_speech"), metricIds: ["customer-to-agent-speech-ms", "prompt-to-first-token-ms", "prompt-to-final-token-ms"], provenance: "simulated" }], recommendedNextAction: responsive ? "Preserve the measured boundary and validate it with representative live evidence before production." : responsiveMs === null ? "Define fresh-session recovery/fallback, then rerun before evaluating first-audio responsiveness." : "Enable token streaming and shorten the first response, then rerun the same deterministic scenario." }),
    gate({ id: "interruptibility", title: "Interruptible enough to feel human", status: interruptPassed ? "passed" : "needs-attention", owner: "application", evidence: [{ summary: interrupted ? interruptPassed ? `Caller speech/DTMF preempted playback once, the ${timing.firstResponseCharacters}-character response was concise, and the session recovered to LISTENING.` : `Interruption evidence is incomplete: interruptible=${interruptible}, concise=${concise} (${timing.firstResponseCharacters}/${TELEPHONY_CONCISE_RESPONSE_MAX_CHARACTERS} characters), preempted=${timeline.some((event) => event.type === "preempted")}, listeningRecovered=${timeline.some((event) => event.type === "listening")}.` : "This fixture did not exercise caller speech or DTMF interruption; configuration alone is not pass evidence.", eventIds: eventIdsWhere(timeline, (event) => ["media_playback_policy", "interrupt", "dtmf", "preempted", "listening"].includes(event.type) || event.type === "failure" && event.label.includes("Interruption")), metricIds: ["first-response-characters", "interruption-count", "preemption-count", "listening-recovery-ms"], provenance: "simulated" }], recommendedNextAction: interruptPassed ? "Keep responses concise and validate speech and DTMF barge-in against representative call paths." : "Enable interruptible playback and shorten the first response, then rerun caller interruption or combined stress." }),
    gate({ id: "resilience", title: "Resilient enough to survive failures", status: resiliencePassed ? "passed" : "needs-attention", owner: "shared", evidence: [{ summary: `${signaturePassed ? "Initial signature validation is required." : "Initial signature validation is missing."} ${fixture.malformedMessageAtMs.length > 0 ? `${fixture.malformedMessageAtMs.length} malformed message(s) were safely rejected.` : "Malformed-message handling was not exercised."} ${fixture.websocketLossAtMs === undefined ? "WebSocket recovery was not exercised; configuration alone is not pass evidence." : reconnectPassed ? "WebSocket loss recovered through fresh TwiML/session with fallback defined." : "WebSocket loss had no safe fresh-session recovery/fallback."}`, eventIds: eventIdsWhere(timeline, (event) => ["signature_validation", "malformed_message", "websocket_loss", "reconnect_attempt", "fresh_twiml_requested", "fresh_session_recovered", "fallback"].includes(event.type) || event.type === "failure" && /transport|websocket|fallback|reconnect/i.test(`${event.label} ${event.detail}`)), metricIds: ["signature-validation", "malformed-message-count", "reconnect-count", "failure-count"], provenance: "simulated" }], recommendedNextAction: resiliencePassed ? "Validate signature and recovery behavior against a separately authorized eligible Twilio environment." : !signaturePassed ? "Require initial X-Twilio-Signature validation, then define reconnect/fallback behavior for transport-loss scenarios." : "Run dropped WebSocket with malformed input and defined fresh TwiML/session recovery plus terminal fallback." }),
    gate({ id: "edge-cases", title: "Explicit enough to handle edge cases", status: edgePassed ? "passed" : "needs-attention", owner: "application", evidence: [{ summary: edgePassed ? "First silence maps to REPROMPT and repeated silence maps to END_SESSION. Transfer, interruptible media playback, and intentional termination boundaries are explicit." : fixture.silenceAtMs.length > 1 ? "Repeated silence was exercised, but REPROMPT/END_SESSION, interruptible media playback, handoff, and intentional termination are not all proven." : "First and repeated silence were not both exercised; configuration alone is not pass evidence. Transfer, media, and termination boundaries remain visible.", eventIds: eventIdsWhere(timeline, (event) => ["media_playback_policy", "handoff_boundary", "silence", "reprompt", "transfer_requested", "end_session", "intentional_termination"].includes(event.type) || event.type === "failure" && /silence|dead-air/i.test(`${event.label} ${event.detail}`)), metricIds: ["silence-count", "escalation-requested", "task-completed"], provenance: "simulated" }], recommendedNextAction: edgePassed ? "Preserve explicit REPROMPT, END_SESSION, transfer, media, and intentional-termination policies." : "Define the silence policy and interruptible media playback, then rerun repeated silence or combined stress." }),
    gate({ id: "observability", title: "Observable enough to improve", status: observable ? "passed" : "needs-attention", owner: "application", evidence: [{ summary: observable ? "Structured per-call evidence retains timing, interruption/preemption, silence, failure/reconnect history, turns, task outcome, escalation, and deterministic safety checks." : "Structured per-call evidence retention is disabled; the displayed fixture alone is not a production observability implementation.", eventIds: eventsOf(timeline, "observability_recorded", "hallucination_check", "toxicity_check", "task_completed"), metricIds: ["time-to-first-audio-ms", "interruption-count", "preemption-count", "silence-count", "reconnect-count", "failure-count", "turns-per-call", "task-completed", "escalation-requested", "hallucination-check", "toxicity-check"], provenance: "simulated" }], recommendedNextAction: observable ? "Carry the same structured fields into production telemetry with privacy-aware retention." : "Enable structured observability, then rerun the same deterministic fixture." }),
  ];
}

function createRunId(configuration: TelephonyReadinessConfiguration) {
  return `twilio-${configuration.scenario}-${configuration.safeguards.length === 0 ? "baseline" : configuration.safeguards.join("-")}-v1`;
}

export function runTelephonyReadinessSimulation(
  input: TelephonyReadinessConfiguration,
): TelephonyReadinessReport {
  const configuration = telephonyReadinessConfigurationSchema.parse({
    ...input,
    safeguards: normalizeTelephonySafeguards(input.safeguards),
  });
  const fixture = getTelephonyScenarioFixture(configuration.scenario);
  const safeguards = new Set(configuration.safeguards);
  const timing = effectiveTiming(fixture, safeguards);
  const timeline = createTimeline(fixture, safeguards, timing);
  const metrics = createMetrics(fixture, timing, timeline, safeguards);
  const gates = createGates(fixture, timing, timeline, safeguards);
  const gatesPassed = gates.filter((gate) => gate.status === "passed").map((gate) => gate.id);
  const gatesNeedingAttention = gates.filter((gate) => gate.status === "needs-attention").map((gate) => gate.id);
  const uncontainedFailure = timeline.some((event) => event.state === "failed");
  const policyEnded = fixture.silenceAtMs.length > 1 && safeguards.has("define-silence-policy");
  const callOutcome = uncontainedFailure
    ? "failed"
    : policyEnded
      ? "ended-by-policy"
      : fixture.escalationRequested
        ? "completed-with-escalation"
        : "completed";
  const completedOffset = timeline.at(-1)?.offsetMs ?? 0;
  const report: TelephonyReadinessReport = {
    schemaVersion: "one-telephony-readiness-report-v1",
    runId: createRunId(configuration),
    provider: configuration.provider,
    adapterLabel: "Twilio ConversationRelay — first supported telephony adapter",
    mode: "simulation",
    scenario: configuration.scenario,
    safeguards: configuration.safeguards,
    startedAt: fixture.startedAt,
    completedAt: new Date(Date.parse(fixture.startedAt) + completedOffset).toISOString(),
    evidenceMode: "simulated",
    evidenceDisclosure: "Simulated evidence only — no imported or live evidence.",
    credentialsStatus: "Credentials not configured",
    liveCallStatus: "No live call placed",
    liveActionsAvailable: false,
    providerRequestCount: 0,
    providerCreditCount: 0,
    timeline,
    metrics,
    gates,
    gatesPassed,
    gatesNeedingAttention,
    overallStatus: gatesNeedingAttention.length === 0 ? "all-gates-passed" : "needs-attention",
    callOutcome,
    optionalDownstreamConcepts: [{ id: "predictive-csat", label: "Predictive CSAT", status: "not-computed", detail: "Optional downstream concept only; no predictive CSAT was computed from simulated evidence." }],
    limitations: [
      "This is deterministic simulated evidence, not imported or live Twilio evidence.",
      "No provider request, credential access, phone call, billing event, or provider credit occurred.",
      "Live ConversationRelay requires an eligible funded Twilio account and a separately reviewed production integration.",
      "Deterministic hallucination and toxicity checks are rule fixtures, not model-based or objective production judgments.",
    ],
  };
  const parsed = telephonyReadinessReportSchema.parse(report);
  if (parsed.gates.map((gate) => gate.id).join("|") !== TELEPHONY_GATE_IDS.join("|")) {
    throw new Error("Telephony readiness gate order changed unexpectedly.");
  }
  return parsed;
}

export const TWILIO_CONVERSATION_RELAY_SIMULATION_ADAPTER = Object.freeze({
  provider: "twilio-conversation-relay" as const,
  displayName: "Twilio ConversationRelay — first supported telephony adapter",
  mode: "simulation" as const,
  run: runTelephonyReadinessSimulation,
});
