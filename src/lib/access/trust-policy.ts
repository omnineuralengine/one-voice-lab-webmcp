import "server-only";

export const LAB_TRUST_TIERS = [
  "guest",
  "verified",
  "trusted_builder",
  "partner_researcher",
  "admin",
] as const;

export type LabTrustTier = (typeof LAB_TRUST_TIERS)[number];

export const LAB_USAGE_OPERATIONS = [
  "provider_catalog",
  "speech_generation",
  "speech_transcription",
  "realtime_session",
  "ai_reasoning",
  "deliverable_generation",
  "feedback_submission",
  "session_creation",
] as const;

export type LabUsageOperation = (typeof LAB_USAGE_OPERATIONS)[number];
export type LabActorIntent = "human" | "developer" | "agent" | "unknown";

export type LabAccessContext = {
  providerId?: string;
  /**
   * Server-selected normalized capability used by the provider operational
   * policy. This value is never accepted as caller authority and is not sent
   * to the Stage 2 quota RPC.
   */
  providerCapabilityId?: string;
  endpointId?: string;
  units?: number;
  minimumTier?: LabTrustTier;
  actorIntent?: LabActorIntent;
  /**
   * An unverified challenge token is never persisted or treated as proof. A route
   * must verify it with the challenge provider before setting challengeVerified.
   */
  challengeToken?: string;
  challengeVerified?: boolean;
  /** Require the distributed boundary even for a non-provider operation. */
  durableRequired?: boolean;
};

export type LabOperationPolicyMetadata = {
  description: string;
  costBearing: boolean;
  providerBudgeted: boolean;
  concurrencyProtected: boolean;
  agentEligible: boolean;
  defaultMinimumTier: LabTrustTier;
};

export const LAB_OPERATION_POLICY: Readonly<Record<LabUsageOperation, LabOperationPolicyMetadata>> = Object.freeze({
  provider_catalog: {
    description: "Read bounded provider, model, and voice capability metadata.",
    costBearing: false,
    providerBudgeted: false,
    concurrencyProtected: false,
    agentEligible: true,
    defaultMinimumTier: "guest",
  },
  speech_generation: {
    description: "Generate speech through a server-side provider adapter.",
    costBearing: true,
    providerBudgeted: true,
    concurrencyProtected: true,
    agentEligible: false,
    defaultMinimumTier: "guest",
  },
  speech_transcription: {
    description: "Transcribe bounded audio through a server-side provider adapter.",
    costBearing: true,
    providerBudgeted: true,
    concurrencyProtected: true,
    agentEligible: false,
    defaultMinimumTier: "guest",
  },
  realtime_session: {
    description: "Create a bounded realtime provider session or temporary credential.",
    costBearing: true,
    providerBudgeted: true,
    concurrencyProtected: true,
    agentEligible: false,
    defaultMinimumTier: "verified",
  },
  ai_reasoning: {
    description: "Run bounded server-side reasoning for a Lab workflow.",
    costBearing: true,
    providerBudgeted: true,
    concurrencyProtected: true,
    agentEligible: false,
    defaultMinimumTier: "verified",
  },
  deliverable_generation: {
    description: "Generate a bounded architecture or presentation deliverable.",
    costBearing: false,
    providerBudgeted: false,
    concurrencyProtected: true,
    agentEligible: false,
    defaultMinimumTier: "verified",
  },
  feedback_submission: {
    description: "Submit bounded product feedback without raw audio retention.",
    costBearing: false,
    providerBudgeted: false,
    concurrencyProtected: false,
    agentEligible: false,
    defaultMinimumTier: "guest",
  },
  session_creation: {
    description: "Create a bounded, ephemeral Lab session.",
    costBearing: false,
    providerBudgeted: false,
    concurrencyProtected: false,
    agentEligible: true,
    defaultMinimumTier: "guest",
  },
});

const TIER_RANK: Readonly<Record<LabTrustTier, number>> = {
  guest: 0,
  verified: 1,
  trusted_builder: 2,
  partner_researcher: 3,
  admin: 4,
};

export function isLabTrustTier(value: unknown): value is LabTrustTier {
  return typeof value === "string" && (LAB_TRUST_TIERS as readonly string[]).includes(value);
}

export function meetsMinimumTier(actual: LabTrustTier, minimum: LabTrustTier): boolean {
  return TIER_RANK[actual] >= TIER_RANK[minimum];
}

export function normalizeLabAccessContext(
  operation: LabUsageOperation,
  context: LabAccessContext = {},
): Required<Pick<LabAccessContext, "units" | "minimumTier" | "actorIntent" | "challengeVerified">>
  & Pick<LabAccessContext, "providerId" | "endpointId"> {
  return {
    units: Number.isSafeInteger(context.units) && (context.units ?? 0) >= 1 && (context.units ?? 0) <= 10_000
      ? context.units ?? 1
      : 1,
    minimumTier: context.minimumTier ?? LAB_OPERATION_POLICY[operation].defaultMinimumTier,
    // The database records only the human/agent execution channel. Developer
    // trust is represented by the authenticated tier, never by self-assertion.
    actorIntent: context.actorIntent === "agent" ? "agent" : "human",
    challengeVerified: context.challengeVerified === true,
    ...(normalizeIdentifier(context.providerId) ? { providerId: normalizeIdentifier(context.providerId) } : {}),
    ...(normalizeIdentifier(context.endpointId) ? { endpointId: normalizeIdentifier(context.endpointId) } : {}),
  };
}

function normalizeIdentifier(value: string | undefined): string | undefined {
  const candidate = value?.trim().toLowerCase();
  return candidate && /^[a-z0-9][a-z0-9._:/-]{0,79}$/.test(candidate) ? candidate : undefined;
}
