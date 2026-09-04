import "server-only";

import { z } from "zod";

import { LAB_TRUST_TIERS, LAB_USAGE_OPERATIONS } from "@/lib/access/trust-policy";
import { isOneHumanAuthSubject } from "@/lib/auth/human-subject";

const nonNegativeCountSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const identifierSchema = z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9._:/-]*$/);
const timestampSchema = z.string().datetime({ offset: true });

const ownUsageSchema = z.object({
  operation: z.enum(LAB_USAGE_OPERATIONS),
  providerId: identifierSchema.nullable(),
  window: z.enum(["user_day", "user_month"]),
  usedUnits: nonNegativeCountSchema,
  windowStart: timestampSchema,
}).strict();

const signedInAccessSchema = z.object({
  tier: z.enum(LAB_TRUST_TIERS).exclude(["guest"]),
  status: z.enum(["active", "suspended"]),
  actorKind: z.enum(["human", "developer", "agent"]),
  riskBand: z.enum(["normal", "review", "elevated"]),
  expiresAt: timestampSchema.nullable(),
  savedExperiments: nonNegativeCountSchema,
  usage: z.array(ownUsageSchema).max(256),
}).strict();

const adminSummarySchema = z.object({
  generatedAt: timestampSchema,
  windowHours: z.number().int().min(1).max(168),
  decisions: z.object({
    allowed: nonNegativeCountSchema,
    denied: nonNegativeCountSchema,
  }).strict(),
  denialsByReason: z.array(z.object({
    reason: z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9_-]*$/),
    count: nonNegativeCountSchema,
  }).strict()).max(128),
  usageByProvider: z.array(z.object({
    providerId: identifierSchema,
    operation: z.enum(LAB_USAGE_OPERATIONS),
    usedUnits: nonNegativeCountSchema,
  }).strict()).max(256),
  providerBudgets: z.array(z.object({
    providerId: identifierSchema,
    operation: z.enum(LAB_USAGE_OPERATIONS),
    enabled: z.boolean(),
    dailyUnits: nonNegativeCountSchema,
    monthlyUnits: nonNegativeCountSchema,
    concurrencyLimit: nonNegativeCountSchema,
    updatedAt: timestampSchema,
  }).strict()).max(256),
  activeConcurrency: nonNegativeCountSchema,
  activeTierCounts: z.object({
    verified: nonNegativeCountSchema.optional(),
    trusted_builder: nonNegativeCountSchema.optional(),
    partner_researcher: nonNegativeCountSchema.optional(),
    admin: nonNegativeCountSchema.optional(),
  }).strict(),
  riskSignals: z.object({
    reviewOrElevatedClients: nonNegativeCountSchema,
    multiAccountClients: nonNegativeCountSchema,
  }).strict(),
}).strict();

type TrustAuthResult = {
  data: { user: { id: string; is_anonymous?: boolean } | null };
  error?: unknown;
};

type TrustRpcResult = {
  data: unknown;
  error?: unknown;
};

export type TrustStateReader = {
  getUser: () => Promise<TrustAuthResult>;
  rpc: (name: string, args?: Record<string, unknown>) => Promise<TrustRpcResult>;
};

export type GuestAccessProjection = {
  authenticated: false;
  tier: "guest";
  status: "active";
  actorKind: "unknown";
  riskBand: "unknown";
  expiresAt: null;
  savedExperiments: 0;
  usage: [];
};

export type SignedInAccessProjection = z.infer<typeof signedInAccessSchema> & {
  authenticated: true;
};

export type AdminTrustSummary = z.infer<typeof adminSummarySchema>;

export type TrustStateReadResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: 403 | 503; code: string; message: string };

export function guestAccessProjection(): GuestAccessProjection {
  return {
    authenticated: false,
    tier: "guest",
    status: "active",
    actorKind: "unknown",
    riskBand: "unknown",
    expiresAt: null,
    savedExperiments: 0,
    usage: [],
  };
}

export async function readOwnTrustState(
  reader: TrustStateReader | null,
): Promise<TrustStateReadResult<GuestAccessProjection | SignedInAccessProjection>> {
  if (!reader) return { ok: true, value: guestAccessProjection() };

  try {
    const auth = await reader.getUser();
    if (!auth.data.user || !isOneHumanAuthSubject(auth.data.user)) {
      if (!auth.error || isMissingAuthSessionError(auth.error)) {
        return { ok: true, value: guestAccessProjection() };
      }
      return unavailable("Access status is temporarily unavailable.");
    }

    const result = await reader.rpc("read_my_lab_access_state");
    if (result.error) return unavailable("Access status is temporarily unavailable.");
    const parsed = signedInAccessSchema.safeParse(result.data);
    if (!parsed.success) return unavailable("Access status is temporarily unavailable.");
    return { ok: true, value: { authenticated: true, ...parsed.data } };
  } catch {
    return unavailable("Access status is temporarily unavailable.");
  }
}

export async function readAdminTrustSummary(
  reader: TrustStateReader | null,
  guardToken: string | undefined,
): Promise<TrustStateReadResult<AdminTrustSummary>> {
  const guard = guardToken?.trim();
  if (!reader || !guard || guard.length < 32 || guard.length > 256) {
    return unavailable("Trust administration is temporarily unavailable.");
  }

  try {
    const auth = await reader.getUser();
    if (!auth.data.user || !isOneHumanAuthSubject(auth.data.user)) {
      if (!auth.error || isMissingAuthSessionError(auth.error)) {
        return forbidden();
      }
      return unavailable("Trust administration is temporarily unavailable.");
    }

    const result = await reader.rpc("read_lab_access_admin_summary", { p_guard_token: guard });
    if (result.error) {
      return isGuardConfigurationError(result.error)
        ? unavailable("Trust administration is temporarily unavailable.")
        : isAuthorizationError(result.error)
          ? forbidden()
          : unavailable("Trust administration is temporarily unavailable.");
    }
    const parsed = adminSummarySchema.safeParse(result.data);
    if (!parsed.success) return unavailable("Trust administration is temporarily unavailable.");
    return { ok: true, value: parsed.data };
  } catch {
    return unavailable("Trust administration is temporarily unavailable.");
  }
}

function isMissingAuthSessionError(error: unknown): boolean {
  const details = safeErrorDetails(error);
  return details.code === "session_not_found"
    || details.name === "AuthSessionMissingError"
    || /(?:auth\s+)?session\s+(?:is\s+)?missing|refresh token not found/i.test(details.message);
}

function isAuthorizationError(error: unknown): boolean {
  const details = safeErrorDetails(error);
  return details.code === "42501"
    || details.status === 401
    || details.status === 403
    || /administrator access is required|permission denied|not authorized/i.test(details.message);
}

function isGuardConfigurationError(error: unknown): boolean {
  return /lab usage guard|guard token/i.test(safeErrorDetails(error).message);
}

function safeErrorDetails(error: unknown): { code: string; name: string; message: string; status: number | null } {
  if (!error || typeof error !== "object") return { code: "", name: "", message: "", status: null };
  const candidate = error as Record<string, unknown>;
  return {
    code: typeof candidate.code === "string" ? candidate.code : "",
    name: typeof candidate.name === "string" ? candidate.name : "",
    message: typeof candidate.message === "string" ? candidate.message.slice(0, 256) : "",
    status: typeof candidate.status === "number" ? candidate.status : null,
  };
}

function forbidden(): TrustStateReadResult<never> {
  return {
    ok: false,
    status: 403,
    code: "admin_access_required",
    message: "Active administrator access is required.",
  };
}

function unavailable(message: string): TrustStateReadResult<never> {
  return { ok: false, status: 503, code: "trust_state_unavailable", message };
}
