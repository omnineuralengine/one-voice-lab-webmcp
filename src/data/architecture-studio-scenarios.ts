import type { StudioAnswer, StudioAnswerValue, StudioScenarioId } from "@/types/architecture-studio";

export type StudioScenarioPreset = {
  id: Exclude<StudioScenarioId, "custom">;
  name: string;
  shortDescription: string;
  visibleFacts: string[];
  recommendedFor: string;
};

export const STUDIO_SCENARIO_PRESETS: StudioScenarioPreset[] = [
  {
    id: "northstar-contact-cloud",
    name: "Northstar Contact Cloud",
    shortDescription: "A multi-region CCaaS team comparing managed and composable voice operating models.",
    visibleFacts: ["US + Europe", "SIP + WebSocket", "Existing LLM + CRM"],
    recommendedFor: "Operating-model and deployment discovery",
  },
  {
    id: "meridian-contact-cloud",
    name: "Meridian Contact Cloud",
    shortDescription: "A mid-market CCaaS provider preparing an inbound AI voice-agent proof of concept.",
    visibleFacts: ["Inbound service", "English + Spanish", "Salesforce integration"],
    recommendedFor: "Package evidence and architecture editing",
  },
];

export function getScenarioPreset(id: StudioScenarioId) {
  return STUDIO_SCENARIO_PRESETS.find((scenario) => scenario.id === id);
}

export function scenarioSeedAnswers(
  scenarioId: StudioScenarioId,
  updatedAt: string,
  customScenarioName?: string,
): StudioAnswer[] {
  const values = scenarioId === "meridian-contact-cloud"
    ? meridianValues
    : scenarioId === "custom"
      ? { "company-name": customScenarioName?.trim() || "Untitled fictional customer" }
      : northstarValues;

  return Object.entries(values).map(([questionId, value]) => ({
    questionId,
    participantId: "scenario",
    value: value as StudioAnswerValue,
    updatedAt,
  }));
}

const northstarValues: Record<string, StudioAnswerValue> = {
  "company-name": "Northstar Contact Cloud",
  industry: ["ccaas"],
  "experience-problem": ["latency", "interruptions"],
  "primary-use-case": ["voice-agent", "inbound-service"],
  workflow: ["inbound", "mixed"],
  "delivery-stage": "pilot",
  "launch-window": "3-6-months",
  "ccaas-platform": "custom",
  "media-path": ["sip", "websocket"],
  "cloud-provider": ["aws"],
  "contact-regions": ["us", "eu"],
  "business-systems": ["salesforce", "customer-database"],
  "existing-providers": ["llm", "orchestration"],
  "languages": ["english", "spanish", "multilingual-growth"],
  "pii-compliance": ["pii", "security-review", "legal-review"],
};

const meridianValues: Record<string, StudioAnswerValue> = {
  "company-name": "Meridian Contact Cloud",
  industry: ["ccaas", "retail", "financial-services"],
  "experience-problem": ["latency", "interruptions", "accuracy"],
  "primary-use-case": ["voice-agent", "inbound-service"],
  workflow: ["inbound"],
  "business-outcome": ["better-experience", "higher-containment"],
  "delivery-stage": "prototype",
  "launch-window": "3-6-months",
  "ccaas-platform": "custom",
  "telephony-provider": "carrier",
  "media-path": ["pstn", "sip", "websocket"],
  "cloud-provider": ["aws"],
  "contact-regions": ["us"],
  "business-systems": ["salesforce", "customer-database"],
  "existing-providers": ["stt", "llm", "orchestration"],
  "provider-details": "Replace the legacy speech provider while retaining the existing LLM, Salesforce integration, and proprietary routing engine.",
  "current-voice-stack": "Legacy STT, proprietary routing/orchestration, existing LLM, Salesforce, and carrier-managed call ingress.",
  "vendor-strategy": "replace-speech",
  "audio-direction": ["inbound"],
  "processing-mode": "streaming",
  "audio-conditions": ["noise", "packet-loss", "accents"],
  languages: ["english", "spanish"],
  "speech-details": ["domain-terms", "names", "numbers", "alphanumeric"],
  "turn-taking": ["barge-in", "fast-end-turn", "human-handoff"],
  "agent-actions": ["inform", "crm-read", "handoff"],
  "tools-and-apis": "Read Salesforce context and call the proprietary routing engine; preserve a safe human handoff path.",
  "failure-behavior": ["clarify", "human", "safe-default"],
  "deployment-preference": "cloud-api",
  "pii-compliance": ["pii", "pci", "security-review", "legal-review"],
  "tts-requirements": ["streaming", "interruptible", "english-spanish"],
  "observability-stack": ["custom"],
  "logging-audit": ["request-ids", "latency", "model-config", "action-log"],
  "baseline": ["provider-results", "latency-traces"],
};
