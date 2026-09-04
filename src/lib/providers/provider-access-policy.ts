import type { LabTrustTier } from "@/lib/access/trust-policy";
import type {
  ProviderAdministrativeAccessState,
  ProviderBenchmarkStatus,
  ProviderRuntimeStatus,
} from "@/lib/providers/platform-types";

export type ProviderInvocationPolicyState = Readonly<{
  known: boolean;
  accessMode: ProviderAdministrativeAccessState;
  runtimeStatus: ProviderRuntimeStatus;
}>;

export type ProviderInvocationPolicyDecision = Readonly<{
  allowed: boolean;
  code?: "provider_access_unavailable" | "provider_forbidden";
  requiredTier?: LabTrustTier;
}>;

const TIER_RANK: Readonly<Record<LabTrustTier, number>> = {
  guest: 0,
  verified: 1,
  trusted_builder: 2,
  partner_researcher: 3,
  admin: 4,
};

/** Provider and capability policy are intersected; an override can never widen access. */
export function intersectProviderAccess(
  provider: ProviderAdministrativeAccessState,
  capability?: ProviderAdministrativeAccessState,
): ProviderAdministrativeAccessState {
  if (!capability) return provider;
  const values = new Set([provider, capability]);
  if (values.has("budget-paused")) return "budget-paused";
  if (values.has("globally-disabled")) return "globally-disabled";
  if (values.has("fixture-only")) return "fixture-only";
  if (values.has("trusted-user-access")) return "trusted-user-access";
  if (values.has("private-testing")) return "private-testing";
  return "public-use";
}

const BENCHMARK_STATUS_RANK: Readonly<Record<ProviderBenchmarkStatus, number>> = {
  ineligible: 0,
  "fixture-only": 1,
  "private-testing": 2,
  "benchmark-eligible": 3,
  "publicly-ranked": 4,
};

/** Capability policy may narrow, but never promote beyond provider policy. */
export function intersectProviderBenchmarkStatus(
  provider: ProviderBenchmarkStatus,
  capability?: ProviderBenchmarkStatus,
): ProviderBenchmarkStatus {
  if (!capability) return provider;
  return BENCHMARK_STATUS_RANK[provider] <= BENCHMARK_STATUS_RANK[capability]
    ? provider
    : capability;
}

/**
 * Pure policy evaluation shared by protected provider routes and Evaluate.
 * An absent tier is a pre-admission check: it rejects disabled states before
 * quota/budget reservation and defers only the authenticated trust comparison.
 */
export function evaluateProviderInvocationPolicy(
  policy: ProviderInvocationPolicyState,
  tier?: LabTrustTier | "member",
): ProviderInvocationPolicyDecision {
  if (
    !policy.known
    || ["globally-disabled", "fixture-only", "budget-paused"].includes(policy.accessMode)
    || !["enabled", "degraded"].includes(policy.runtimeStatus)
  ) {
    return { allowed: false, code: "provider_access_unavailable" };
  }

  const requiredTier = policy.accessMode === "trusted-user-access"
    ? "trusted_builder" as const
    : policy.accessMode === "private-testing"
      ? "verified" as const
      : undefined;

  if (!requiredTier || tier === undefined) {
    return { allowed: true, ...(requiredTier ? { requiredTier } : {}) };
  }

  const normalizedTier = tier === "member" ? "verified" : tier;
  return TIER_RANK[normalizedTier] >= TIER_RANK[requiredTier]
    ? { allowed: true, requiredTier }
    : { allowed: false, code: "provider_forbidden", requiredTier };
}
