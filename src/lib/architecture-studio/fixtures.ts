import { STUDIO_QUESTIONS } from "@/data/architecture-studio-discovery";
import type { ResolvedDiscoveryProfile } from "@/lib/architecture-studio/recommendation-engine";
import type { StudioAnswerValue, StudioRecommendationPath } from "@/types/architecture-studio";

export type ArchitectureStudioFixture = {
  id: string;
  label: string;
  expectedPath: StudioRecommendationPath;
  profile: ResolvedDiscoveryProfile;
};

const totalCritical = STUDIO_QUESTIONS.filter((question) => question.critical).length;

function profile(values: Record<string, StudioAnswerValue>, disagreements: ResolvedDiscoveryProfile["disagreements"] = []): ResolvedDiscoveryProfile {
  const answeredCritical = STUDIO_QUESTIONS.filter((question) => question.critical && values[question.id] !== undefined).length;
  return { values, disagreements, answeredCritical, totalCritical };
}

export const ARCHITECTURE_STUDIO_FIXTURES: ArchitectureStudioFixture[] = [
  {
    id: "transcription-analytics",
    label: "Transcription analytics customer",
    expectedPath: "speech-intelligence",
    profile: profile({
      "primary-use-case": ["call-transcription", "analytics", "quality-assurance", "summarization"],
      "business-outcome": ["limited-insight", "agent-productivity"],
      "delivery-stage": "pilot",
      "processing-mode": "prerecorded",
      "vendor-strategy": "replace-speech",
      "deployment-preference": "cloud-api",
      "primary-metrics": ["accuracy", "critical-entities", "cost"],
      "baseline": ["provider-results", "human-transcripts"],
      "concurrency": "50-500",
      "audio-conditions": ["noise", "overlap"],
      "acceptance-gates": ["representative-data", "human-review", "load"],
    }),
  },
  {
    id: "composable-agent",
    label: "Composable voice-agent customer",
    expectedPath: "composable-voice",
    profile: profile({
      "primary-use-case": ["voice-agent", "voice-transactions"],
      "business-outcome": ["better-experience", "higher-containment"],
      "delivery-stage": "pilot",
      "processing-mode": "streaming",
      "existing-providers": ["llm", "orchestration", "tts"],
      "vendor-strategy": "retain",
      "pipeline-preference": "composable",
      "turn-taking": ["barge-in", "fast-end-turn"],
      "deployment-preference": "cloud-api",
      "primary-metrics": ["e2e-latency", "task-completion", "interruption"],
      "concurrency": "50-500",
      "action-controls": ["authenticate", "confirm", "rollback", "audit"],
      "acceptance-gates": ["representative-data", "failure", "security"],
    }),
  },
  {
    id: "managed-agent",
    label: "Managed Voice Agent customer",
    expectedPath: "managed-voice-agent",
    profile: profile({
      "primary-use-case": ["voice-agent", "inbound-service"],
      "business-outcome": ["higher-containment", "faster-resolution"],
      "delivery-stage": "prototype",
      "processing-mode": "streaming",
      "existing-providers": ["none"],
      "vendor-strategy": "consolidate",
      "pipeline-preference": "managed",
      "turn-taking": ["barge-in", "fast-end-turn", "human-handoff"],
      "deployment-preference": "cloud-api",
      "primary-metrics": ["task-completion", "interruption", "handoff"],
      "concurrency": "under-50",
      "action-controls": ["confirm", "audit"],
      "acceptance-gates": ["representative-data", "failure", "pilot"],
    }),
  },
  {
    id: "private-self-hosted",
    label: "Private or self-hosted customer",
    expectedPath: "private-deployment",
    profile: profile({
      "primary-use-case": ["call-transcription", "compliance-monitoring"],
      "business-outcome": ["risk-reduction"],
      "delivery-stage": "migration",
      "processing-mode": "both",
      "vendor-strategy": "replace-speech",
      "pipeline-preference": "compare",
      "deployment-preference": "self-hosted",
      "data-control": ["residency", "no-retention", "segmented", "vendor-access"],
      "pii-compliance": ["pii", "pci", "security-review"],
      "primary-metrics": ["accuracy", "reliability", "cost"],
      "concurrency": "over-5000",
      "availability": ["multi-region", "dr", "graceful-degrade"],
      "acceptance-gates": ["representative-data", "load", "security", "failure"],
    }),
  },
];
