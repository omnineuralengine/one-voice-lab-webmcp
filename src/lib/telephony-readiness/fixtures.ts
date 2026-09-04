import {
  TELEPHONY_SAFEGUARD_IDS,
  TELEPHONY_SCENARIO_IDS,
  type TelephonySafeguardId,
  type TelephonyScenarioFixture,
  type TelephonyScenarioId,
} from "@/lib/telephony-readiness/contracts";

export type TelephonySafeguardDefinition = Readonly<{
  id: TelephonySafeguardId;
  label: string;
  description: string;
  causalInput: string;
}>;

export const TELEPHONY_SAFEGUARDS: readonly TelephonySafeguardDefinition[] = Object.freeze([
  {
    id: "enable-token-streaming",
    label: "Enable token streaming",
    description: "Make the first generated token available before the complete response is ready.",
    causalInput: "tokenStreamingEnabled",
  },
  {
    id: "shorten-first-response",
    label: "Shorten the first response",
    description: "Use a concise opening response so speech can begin sooner and remain easy to interrupt.",
    causalInput: "conciseFirstResponseEnabled",
  },
  {
    id: "enable-interruptible-playback",
    label: "Enable interruptible playback",
    description: "Preempt active playback after caller speech or DTMF and return the session to LISTENING.",
    causalInput: "interruptiblePlaybackEnabled",
  },
  {
    id: "define-silence-policy",
    label: "Define first and repeated silence policy",
    description: "Reprompt once, then intentionally end the session after repeated silence.",
    causalInput: "silencePolicyDefined",
  },
  {
    id: "require-signature-validation",
    label: "Require signature validation",
    description: "Require initial X-Twilio-Signature validation before accepting the simulated session.",
    causalInput: "signatureValidationRequired",
  },
  {
    id: "define-reconnect-fallback",
    label: "Define reconnect and fallback behavior",
    description: "Recover through fresh TwiML and a fresh session, with an explicit fallback if recovery fails.",
    causalInput: "reconnectFallbackDefined",
  },
  {
    id: "enable-structured-observability",
    label: "Enable structured observability",
    description: "Record the bounded timeline, timing slices, failures, turns, safety checks, and task outcome.",
    causalInput: "structuredObservabilityEnabled",
  },
] satisfies readonly TelephonySafeguardDefinition[]);

const fixtures = [
  {
    id: "healthy-call",
    label: "Healthy call",
    description: "A clean appointment-confirmation turn with no injected transport or caller fault.",
    startedAt: "2026-09-02T12:00:00.000Z",
    customerSpeechStartMs: 200,
    customerSpeechEndMs: 1_000,
    promptSentMs: 1_020,
    firstTokenReceivedMs: 1_250,
    finalTokenReceivedMs: 1_480,
    agentSpeechStartMs: 1_600,
    firstResponseCharacters: 170,
    silenceAtMs: [],
    malformedMessageAtMs: [],
    transferRequested: false,
    escalationRequested: false,
    baseTurns: 3,
  },
  {
    id: "latency-spike",
    label: "Latency spike",
    description: "Generation and response construction push the customer-to-agent speech interval to the exact failing boundary.",
    startedAt: "2026-09-02T12:01:00.000Z",
    customerSpeechStartMs: 200,
    customerSpeechEndMs: 1_000,
    promptSentMs: 1_020,
    firstTokenReceivedMs: 1_720,
    finalTokenReceivedMs: 2_360,
    agentSpeechStartMs: 2_200,
    firstResponseCharacters: 220,
    silenceAtMs: [],
    malformedMessageAtMs: [],
    transferRequested: false,
    escalationRequested: false,
    baseTurns: 3,
  },
  {
    id: "caller-interruption",
    label: "Caller interruption",
    description: "Caller speech and DTMF arrive while the first response is playing.",
    startedAt: "2026-09-02T12:02:00.000Z",
    customerSpeechStartMs: 200,
    customerSpeechEndMs: 1_000,
    promptSentMs: 1_020,
    firstTokenReceivedMs: 1_250,
    finalTokenReceivedMs: 1_820,
    agentSpeechStartMs: 1_580,
    firstResponseCharacters: 220,
    interruptAtMs: 1_900,
    dtmfAtMs: 1_950,
    silenceAtMs: [],
    malformedMessageAtMs: [],
    transferRequested: false,
    escalationRequested: false,
    baseTurns: 4,
  },
  {
    id: "dropped-websocket",
    label: "Dropped WebSocket",
    description: "The media WebSocket is lost after the first token but before the first audio begins.",
    startedAt: "2026-09-02T12:03:00.000Z",
    customerSpeechStartMs: 200,
    customerSpeechEndMs: 1_000,
    promptSentMs: 1_020,
    firstTokenReceivedMs: 1_280,
    finalTokenReceivedMs: 1_800,
    agentSpeechStartMs: 1_600,
    firstResponseCharacters: 180,
    websocketLossAtMs: 1_400,
    silenceAtMs: [],
    malformedMessageAtMs: [520],
    transferRequested: false,
    escalationRequested: false,
    baseTurns: 3,
  },
  {
    id: "repeated-silence",
    label: "Repeated silence",
    description: "The first silent turn requires a reprompt and the second requires an intentional terminal policy.",
    startedAt: "2026-09-02T12:04:00.000Z",
    customerSpeechStartMs: 200,
    customerSpeechEndMs: 1_000,
    promptSentMs: 1_020,
    firstTokenReceivedMs: 1_250,
    finalTokenReceivedMs: 1_500,
    agentSpeechStartMs: 1_600,
    firstResponseCharacters: 160,
    silenceAtMs: [2_300, 3_600],
    malformedMessageAtMs: [],
    transferRequested: false,
    escalationRequested: false,
    baseTurns: 2,
  },
  {
    id: "combined-production-stress-test",
    label: "Combined production stress test",
    description: "Latency, malformed input, interruption, DTMF, one dropped WebSocket, repeated silence, and escalation occur in one bounded fixture.",
    startedAt: "2026-09-02T12:05:00.000Z",
    customerSpeechStartMs: 200,
    customerSpeechEndMs: 1_000,
    promptSentMs: 1_020,
    firstTokenReceivedMs: 1_750,
    finalTokenReceivedMs: 2_450,
    agentSpeechStartMs: 2_350,
    firstResponseCharacters: 240,
    interruptAtMs: 2_700,
    dtmfAtMs: 2_690,
    websocketLossAtMs: 2_850,
    silenceAtMs: [4_000, 5_200],
    malformedMessageAtMs: [520, 3_060],
    transferRequested: true,
    escalationRequested: true,
    baseTurns: 6,
  },
] as const satisfies readonly TelephonyScenarioFixture[];

export const TELEPHONY_SCENARIO_FIXTURES: readonly TelephonyScenarioFixture[] = Object.freeze(fixtures);

const fixtureById = new Map<TelephonyScenarioId, TelephonyScenarioFixture>(
  TELEPHONY_SCENARIO_FIXTURES.map((fixture) => [fixture.id, fixture]),
);

if (
  fixtureById.size !== TELEPHONY_SCENARIO_IDS.length
  || TELEPHONY_SCENARIO_IDS.some((id) => !fixtureById.has(id))
) {
  throw new Error("Each telephony readiness scenario must have exactly one deterministic fixture.");
}

if (
  new Set(TELEPHONY_SAFEGUARDS.map((safeguard) => safeguard.id)).size !== TELEPHONY_SAFEGUARD_IDS.length
  || TELEPHONY_SAFEGUARD_IDS.some((id) => !TELEPHONY_SAFEGUARDS.some((safeguard) => safeguard.id === id))
) {
  throw new Error("Each telephony safeguard must have exactly one bounded remediation definition.");
}

export function getTelephonyScenarioFixture(id: TelephonyScenarioId): TelephonyScenarioFixture {
  const fixture = fixtureById.get(id);
  if (!fixture) throw new Error(`Unknown telephony readiness scenario: ${id}`);
  return fixture;
}

export function getTelephonySafeguardDefinition(id: TelephonySafeguardId): TelephonySafeguardDefinition {
  const safeguard = TELEPHONY_SAFEGUARDS.find((candidate) => candidate.id === id);
  if (!safeguard) throw new Error(`Unknown telephony safeguard: ${id}`);
  return safeguard;
}
