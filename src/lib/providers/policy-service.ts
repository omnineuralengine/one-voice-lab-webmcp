import "server-only";

import { z } from "zod";

import {
  normalizedProviderCapabilityIdSchema,
  normalizedProviderHealthStateSchema,
  providerAdministrativeAccessSchema,
  providerBenchmarkStatusSchema,
  providerCatalogIdSchema,
  providerDiscoveryStatusSchema,
  providerOperationalPolicySchema,
  providerRuntimeStatusSchema,
  type ProviderOperationalPolicy,
} from "@/lib/providers/platform-types";
import { getOneSupabaseServerClient } from "@/lib/supabase/server";

const timestampSchema = z.string().datetime({ offset: true });
const revisionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

const publicCapabilityPolicySchema = z.object({
  capabilityId: normalizedProviderCapabilityIdSchema,
  accessMode: providerAdministrativeAccessSchema,
  benchmarkStatus: providerBenchmarkStatusSchema,
  revision: revisionSchema,
  updatedAt: timestampSchema,
}).strict();

const publicProviderPolicyRowSchema = z.object({
  providerId: providerCatalogIdSchema,
  discoveryStatus: providerDiscoveryStatusSchema,
  accessMode: providerAdministrativeAccessSchema,
  runtimeStatus: providerRuntimeStatusSchema,
  benchmarkStatus: providerBenchmarkStatusSchema,
  healthStatus: normalizedProviderHealthStateSchema,
  healthCheckedAt: timestampSchema.nullable(),
  costAdmissionEnabled: z.boolean(),
  revision: revisionSchema,
  updatedAt: timestampSchema,
  capabilityPolicies: z.array(publicCapabilityPolicySchema).max(100),
}).strict();

const publicPolicyProjectionSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  generatedAt: timestampSchema,
  providers: z.array(publicProviderPolicyRowSchema).max(100),
}).strict();

const invocationPolicySchema = z.object({
  known: z.boolean(),
  providerId: providerCatalogIdSchema,
  capabilityId: normalizedProviderCapabilityIdSchema,
  accessMode: providerAdministrativeAccessSchema,
  runtimeStatus: providerRuntimeStatusSchema,
  benchmarkStatus: providerBenchmarkStatusSchema,
  providerRevision: revisionSchema.optional(),
  capabilityRevision: revisionSchema.nullable().optional(),
}).strict();

export type ProviderInvocationPolicy = z.infer<typeof invocationPolicySchema>;

const adminProviderPolicySchema = publicProviderPolicyRowSchema.omit({ capabilityPolicies: true });
const adminCapabilityPolicySchema = publicCapabilityPolicySchema.extend({
  providerId: providerCatalogIdSchema,
}).strict();
const adminProjectionSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  generatedAt: timestampSchema,
  providers: z.array(adminProviderPolicySchema).max(100),
  capabilityPolicies: z.array(adminCapabilityPolicySchema).max(1_000),
}).strict();

export const providerRuntimePolicyUpdateSchema = z.object({
  providerId: providerCatalogIdSchema,
  expectedRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  discoveryStatus: providerDiscoveryStatusSchema,
  accessMode: providerAdministrativeAccessSchema,
  runtimeStatus: providerRuntimeStatusSchema,
  benchmarkStatus: providerBenchmarkStatusSchema,
  healthStatus: normalizedProviderHealthStateSchema,
  healthCheckedAt: timestampSchema.nullable(),
  confirmed: z.literal(true),
}).strict();

export const providerCapabilityPolicyUpdateSchema = z.object({
  providerId: providerCatalogIdSchema,
  capabilityId: normalizedProviderCapabilityIdSchema,
  expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  accessMode: providerAdministrativeAccessSchema,
  benchmarkStatus: providerBenchmarkStatusSchema,
  confirmed: z.literal(true),
}).strict();

export type ProviderAdminProjection = z.infer<typeof adminProjectionSchema>;
export type ProviderRuntimePolicyUpdate = z.infer<typeof providerRuntimePolicyUpdateSchema>;
export type ProviderCapabilityPolicyUpdate = z.infer<typeof providerCapabilityPolicyUpdateSchema>;

export type ProviderPolicyReadResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; code: "unavailable" | "forbidden" | "conflict" | "invalid" }>;

export async function readPublicProviderOperationalPolicies(): Promise<readonly ProviderOperationalPolicy[]> {
  const guardToken = process.env.LAB_USAGE_GUARD_TOKEN?.trim();
  if (!guardToken || guardToken.length < 32 || guardToken.length > 256) return [];
  try {
    const client = await getOneSupabaseServerClient();
    if (!client) return [];
    const response = await client.rpc("read_provider_platform_public", { p_guard_token: guardToken });
    if (response.error) return [];
    const parsed = publicPolicyProjectionSchema.safeParse(response.data);
    if (!parsed.success) return [];
    return parsed.data.providers.map((provider) => providerOperationalPolicySchema.parse({
      providerId: provider.providerId,
      discoveryStatus: provider.discoveryStatus,
      access: provider.accessMode,
      runtimeStatus: provider.runtimeStatus,
      benchmarkStatus: provider.benchmarkStatus,
      costAdmissionEnabled: provider.costAdmissionEnabled,
      capabilityPolicies: provider.capabilityPolicies.map((capability) => ({
        capabilityId: capability.capabilityId,
        access: capability.accessMode,
        benchmarkStatus: capability.benchmarkStatus,
      })),
      health: provider.healthStatus,
      ...(provider.healthCheckedAt ? { healthCheckedAt: provider.healthCheckedAt } : {}),
      policyVersion: `postgres-revision/${provider.revision}`,
    }));
  } catch {
    return [];
  }
}

export async function resolveProviderInvocationPolicy(
  providerId: string,
  capabilityId: string,
): Promise<ProviderPolicyReadResult<z.infer<typeof invocationPolicySchema>>> {
  const guardToken = process.env.LAB_USAGE_GUARD_TOKEN?.trim();
  if (!guardToken || guardToken.length < 32 || guardToken.length > 256) return { ok: false, code: "unavailable" };
  try {
    const client = await getOneSupabaseServerClient();
    if (!client) return { ok: false, code: "unavailable" };
    const response = await client.rpc("resolve_provider_runtime_policy", {
      p_provider_id: providerId,
      p_capability_id: capabilityId,
      p_guard_token: guardToken,
    });
    if (response.error) return { ok: false, code: "unavailable" };
    const parsed = invocationPolicySchema.safeParse(response.data);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, code: "unavailable" };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}

export async function readProviderPlatformAdmin(): Promise<ProviderPolicyReadResult<ProviderAdminProjection>> {
  const guardToken = process.env.LAB_USAGE_GUARD_TOKEN?.trim();
  if (!guardToken || guardToken.length < 32 || guardToken.length > 256) return { ok: false, code: "unavailable" };
  try {
    const client = await getOneSupabaseServerClient();
    if (!client) return { ok: false, code: "unavailable" };
    const response = await client.rpc("read_provider_platform_admin", { p_guard_token: guardToken });
    if (response.error) return { ok: false, code: authorizationCode(response.error) };
    const parsed = adminProjectionSchema.safeParse(response.data);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, code: "unavailable" };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}

export async function updateProviderRuntimePolicy(
  input: ProviderRuntimePolicyUpdate,
): Promise<ProviderPolicyReadResult<unknown>> {
  const parsed = providerRuntimePolicyUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };
  return updateAdminPolicy("update_provider_runtime_policy", {
    p_provider_id: parsed.data.providerId,
    p_expected_revision: parsed.data.expectedRevision,
    p_discovery_status: parsed.data.discoveryStatus,
    p_access_mode: parsed.data.accessMode,
    p_runtime_status: parsed.data.runtimeStatus,
    p_benchmark_status: parsed.data.benchmarkStatus,
    p_health_status: parsed.data.healthStatus,
    p_health_checked_at: parsed.data.healthCheckedAt,
  });
}

export async function updateProviderCapabilityPolicy(
  input: ProviderCapabilityPolicyUpdate,
): Promise<ProviderPolicyReadResult<unknown>> {
  const parsed = providerCapabilityPolicyUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };
  return updateAdminPolicy("update_provider_capability_policy", {
    p_provider_id: parsed.data.providerId,
    p_capability_id: parsed.data.capabilityId,
    p_expected_revision: parsed.data.expectedRevision,
    p_access_mode: parsed.data.accessMode,
    p_benchmark_status: parsed.data.benchmarkStatus,
  });
}

async function updateAdminPolicy(
  functionName: "update_provider_runtime_policy" | "update_provider_capability_policy",
  args: Record<string, unknown>,
): Promise<ProviderPolicyReadResult<unknown>> {
  const guardToken = process.env.LAB_USAGE_GUARD_TOKEN?.trim();
  if (!guardToken || guardToken.length < 32 || guardToken.length > 256) return { ok: false, code: "unavailable" };
  try {
    const client = await getOneSupabaseServerClient();
    if (!client) return { ok: false, code: "unavailable" };
    const response = await client.rpc(functionName, { ...args, p_guard_token: guardToken });
    if (response.error) return { ok: false, code: authorizationCode(response.error) };
    return { ok: true, value: response.data };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}

function authorizationCode(error: unknown): "unavailable" | "forbidden" | "conflict" | "invalid" {
  if (!error || typeof error !== "object") return "unavailable";
  const candidate = error as Record<string, unknown>;
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message = typeof candidate.message === "string" ? candidate.message.slice(0, 256) : "";
  if (code === "40001" || /revision conflict/i.test(message)) return "conflict";
  if (code === "22023" || /invalid provider/i.test(message)) return "invalid";
  if (code === "42501" || /administrator access|required/i.test(message)) return "forbidden";
  return "unavailable";
}
