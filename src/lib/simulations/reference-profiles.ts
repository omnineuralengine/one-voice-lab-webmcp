import { TWILIO_CONVERSATION_RELAY_PROFILE_ID } from "@/lib/simulations/webmcp-contracts";

export type ProductionReadinessGate = Readonly<{
  id: string;
  name: string;
  applicableReplay: Readonly<{
    scenarioId: "target-speaker-vs-world";
    impairments: readonly string[];
    coverage: "deterministic-proxy" | "gap";
  }>;
  risks: readonly string[];
  remainingUnknowns: readonly string[];
  sources: readonly string[];
}>;

export const TWILIO_CONVERSATION_RELAY_PRODUCTION_READINESS_PROFILE = Object.freeze({
  id: TWILIO_CONVERSATION_RELAY_PROFILE_ID,
  name: "Twilio ConversationRelay Production Readiness",
  classification: "Source-grounded Twilio reference profile",
  role: "Provider-specific guidance within a provider-neutral lab",
  disclaimer:
    "Not an official Twilio blueprint, partnership, sponsorship, or endorsement. Local deterministic replays are not Twilio or production evidence.",
  gates: [
    {
      id: "responsiveness-streaming",
      name: "Responsiveness and streamed response latency",
      applicableReplay: {
        scenarioId: "target-speaker-vs-world",
        impairments: ["tool-latency"],
        coverage: "deterministic-proxy",
      },
      risks: ["Waiting for a complete model response before sending text can add avoidable response delay."],
      remainingUnknowns: ["Real ConversationRelay, model, network, and caller-perceived latency are not measured."],
      sources: [
        "https://www.twilio.com/docs/voice/conversationrelay/best-practices",
        "https://www.twilio.com/docs/voice/conversationrelay/websocket-messages",
      ],
    },
    {
      id: "turn-taking",
      name: "Real-caller turn-taking, interruption, DTMF, and pacing",
      applicableReplay: {
        scenarioId: "target-speaker-vs-world",
        impairments: ["crosstalk"],
        coverage: "deterministic-proxy",
      },
      risks: ["Interruption and preemption policy must prevent stale playback from continuing."],
      remainingUnknowns: ["Real caller pacing, DTMF delivery, and acoustic barge-in remain untested."],
      sources: [
        "https://www.twilio.com/docs/voice/conversationrelay/websocket-messages",
        "https://www.twilio.com/docs/voice/twiml/connect/conversationrelay",
      ],
    },
    {
      id: "failure-recovery",
      name: "Failure handling, reconnect behavior, signature validation, retries, and fallback",
      applicableReplay: {
        scenarioId: "target-speaker-vs-world",
        impairments: ["network-reconnect"],
        coverage: "deterministic-proxy",
      },
      risks: ["An unexpected ConversationRelay WebSocket disconnect requires explicit application recovery behavior."],
      remainingUnknowns: ["Signature validation, retry limits, fresh TwiML recovery, and production fallback are not executed here."],
      sources: [
        "https://www.twilio.com/docs/voice/conversationrelay/websocket-messages",
        "https://www.twilio.com/docs/usage/webhooks/webhooks-security",
      ],
    },
    {
      id: "edge-policies",
      name: "Silence, handoff, voicemail, and session-ending policies",
      applicableReplay: {
        scenarioId: "target-speaker-vs-world",
        impairments: [],
        coverage: "gap",
      },
      risks: ["Undefined silence and end-session policy can create dead air or ambiguous termination."],
      remainingUnknowns: ["Silence escalation, voicemail, handoff, and intentional session-ending behavior require dedicated fixtures."],
      sources: [
        "https://www.twilio.com/docs/voice/conversationrelay/websocket-messages",
        "https://www.twilio.com/docs/voice/twiml/connect/conversationrelay",
      ],
    },
    {
      id: "observability-qa",
      name: "Per-call evidence, fleet observability, and transcript QA",
      applicableReplay: {
        scenarioId: "target-speaker-vs-world",
        impairments: ["none", "crosstalk", "tool-latency", "network-reconnect"],
        coverage: "deterministic-proxy",
      },
      risks: ["A single local timeline cannot establish fleet reliability or production quality."],
      remainingUnknowns: ["Fleet aggregation and transcript QA remain optional downstream production concepts, not results from this replay."],
      sources: [
        "https://www.twilio.com/docs/voice/conversationrelay/best-practices",
        "https://www.twilio.com/docs/conversation-intelligence-classic/conversation-relay-integration",
      ],
    },
  ] satisfies readonly ProductionReadinessGate[],
});
