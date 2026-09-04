import "server-only";

import { evaluateProviderInvocationPolicy } from "@/lib/providers/provider-access-policy";
import { ProviderOperationError } from "@/lib/providers/errors";
import {
  resolveProviderInvocationPolicy,
  type ProviderInvocationPolicy,
  type ProviderPolicyReadResult,
} from "@/lib/providers/policy-service";
import type { NormalizedProviderCapabilityId } from "@/lib/providers/platform-types";
import type { ProviderOperationName } from "@/lib/providers/operations";

const authorizationBrand = Symbol("one-provider-execution-authorization");

export type ProviderExecutionAuthorization = Readonly<{
  [authorizationBrand]: true;
  providerId: string;
  operation: ProviderOperationName;
  capabilityId: NormalizedProviderCapabilityId;
  requestMode: "live";
  decision: "allowed";
  policyRevision: string;
}>;

type PolicyResolver = (
  providerId: string,
  capabilityId: string,
) => Promise<ProviderPolicyReadResult<ProviderInvocationPolicy>>;

let testPolicyResolver: PolicyResolver | undefined;

export async function authorizeProviderExecution(
  providerId: string,
  operation: ProviderOperationName,
): Promise<ProviderExecutionAuthorization> {
  const capabilityId = capabilityForOperation(operation);
  const resolver = testPolicyResolver ?? resolveProviderInvocationPolicy;
  const result = await resolver(providerId, capabilityId);
  if (!result.ok) throw unavailable(providerId, operation);

  const policy = result.value;
  if (
    !policy.known
    || policy.providerId !== providerId
    || policy.capabilityId !== capabilityId
  ) throw unavailable(providerId, operation);

  const decision = evaluateProviderInvocationPolicy(policy);
  if (!decision.allowed) {
    throw new ProviderOperationError({
      code: decision.code === "provider_forbidden" ? "provider_forbidden" : "provider_access_unavailable",
      message: "Canonical provider policy does not allow this operation. No provider request was sent.",
      status: decision.code === "provider_forbidden" ? 403 : 503,
      providerId,
      operation,
    });
  }

  return Object.freeze({
    [authorizationBrand]: true as const,
    providerId,
    operation,
    capabilityId,
    requestMode: "live" as const,
    decision: "allowed" as const,
    policyRevision: `provider/${policy.providerRevision ?? "unknown"}:capability/${policy.capabilityRevision ?? "none"}`,
  });
}

export function assertProviderExecutionAuthorized(
  authorization: ProviderExecutionAuthorization | undefined,
  providerId: string,
  operation: ProviderOperationName,
): ProviderExecutionAuthorization {
  if (
    !authorization
    || authorization[authorizationBrand] !== true
    || authorization.providerId !== providerId
    || authorization.operation !== operation
    || authorization.capabilityId !== capabilityForOperation(operation)
    || authorization.requestMode !== "live"
    || authorization.decision !== "allowed"
  ) throw unavailable(providerId, operation);
  return authorization;
}

/** Deterministic unit/route seam. Production cannot replace policy resolution. */
export function setProviderExecutionPolicyResolverForTests(resolver?: PolicyResolver): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Provider execution policy test overrides are unavailable in production.");
  }
  testPolicyResolver = resolver;
}

export function capabilityForOperation(operation: ProviderOperationName): NormalizedProviderCapabilityId {
  if (operation === "models") return "discovery.models";
  if (operation === "voices") return "discovery.voices";
  if (operation === "tts") return "tts.batch";
  return "stt.prerecorded";
}

function unavailable(providerId: string, operation: ProviderOperationName): ProviderOperationError {
  return new ProviderOperationError({
    code: "provider_access_unavailable",
    message: "Canonical provider policy could not prove this operation is allowed. No provider request was sent.",
    status: 503,
    providerId,
    operation,
  });
}
