import "server-only";

import type { LabTrustTier, LabUsageOperation } from "@/lib/access/trust-policy";

export const LAB_ACCESS_DENIAL_CODES = [
  "cross_origin",
  "tier_required",
  "suspended",
  "challenge_required",
  "burst_limit_reached",
  "daily_limit_reached",
  "monthly_limit_reached",
  "session_limit_reached",
  "client_limit_reached",
  "provider_budget_exhausted",
  "global_limit_reached",
  "concurrency_limit_reached",
  "guest_limit_reached",
  "member_limit_reached",
  "quota_unavailable",
  "live_lab_paused",
  "provider_paused",
] as const;

export type LabAccessDenialCode = (typeof LAB_ACCESS_DENIAL_CODES)[number];

export type LabAccessDecision = {
  allowed: boolean;
  /** `member` remains accepted at the type boundary for older injected test adapters. */
  tier: LabTrustTier | "member";
  operation?: LabUsageOperation;
  used: number;
  allowance: number;
  remaining?: number;
  resetsAt: string;
  code?: LabAccessDenialCode;
  message?: string;
  daily?: { used: number; allowance: number };
  monthly?: { used: number; allowance: number };
  leaseId?: string;
};

export function deniedLabAccess(input: {
  tier: LabTrustTier;
  operation: LabUsageOperation;
  used?: number;
  allowance?: number;
  resetsAt: string;
  code: LabAccessDenialCode;
  message?: string;
}): LabAccessDecision {
  const used = safeCount(input.used);
  const allowance = safeCount(input.allowance);
  return {
    allowed: false,
    tier: input.tier,
    operation: input.operation,
    used,
    allowance,
    remaining: Math.max(0, allowance - used),
    resetsAt: validTimestamp(input.resetsAt),
    code: input.code,
    message: input.message ?? denialMessage(input.code),
  };
}

export function labAccessResponse(decision: LabAccessDecision): Response {
  const status = statusForDecision(decision);
  const retryAfter = retryAfterSeconds(decision.resetsAt);
  const remaining = decision.remaining ?? Math.max(0, decision.allowance - decision.used);
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "X-RateLimit-Limit": String(decision.allowance),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(Math.ceil(Date.parse(decision.resetsAt) / 1_000)),
    ...(status === 429 ? { "Retry-After": String(retryAfter) } : {}),
  };

  return Response.json({
    ok: false,
    error: {
      code: decision.code ?? "lab_access_denied",
      message: decision.message ?? "This Lab operation is unavailable.",
      retryable: status === 429 || status === 503,
    },
    access: {
      tier: decision.tier,
      ...(decision.operation ? { operation: decision.operation } : {}),
      used: decision.used,
      allowance: decision.allowance,
      remaining,
      resetsAt: decision.resetsAt,
      ...(decision.daily ? { daily: decision.daily } : {}),
      ...(decision.monthly ? { monthly: decision.monthly } : {}),
    },
  }, { status, headers });
}

export function statusForDecision(decision: LabAccessDecision): number {
  if (decision.code === "cross_origin" || decision.code === "tier_required" || decision.code === "suspended") return 403;
  if (decision.code === "challenge_required") return 403;
  if (decision.code === "quota_unavailable" || decision.code === "live_lab_paused" || decision.code === "provider_paused") return 503;
  return 429;
}

export function denialMessage(code: LabAccessDenialCode): string {
  switch (code) {
    case "cross_origin":
      return "This Lab operation accepts same-site requests only.";
    case "tier_required":
      return "This operation requires a higher verified access tier.";
    case "suspended":
      return "This account cannot run this operation right now.";
    case "challenge_required":
      return "Please complete the brief verification step and try again.";
    case "burst_limit_reached":
      return "Too many requests arrived at once. Wait briefly and try again.";
    case "daily_limit_reached":
    case "guest_limit_reached":
    case "member_limit_reached":
      return "The daily allowance for this operation has been reached.";
    case "monthly_limit_reached":
      return "The monthly allowance for this operation has been reached.";
    case "session_limit_reached":
      return "This session reached its allowance. Wait for the limit to reset before trying again.";
    case "client_limit_reached":
      return "This client reached its allowance. Wait for the limit to reset before trying again.";
    case "provider_budget_exhausted":
      return "This provider's configured Lab budget has been reached.";
    case "global_limit_reached":
      return "The Lab reached its shared safety budget for this operation.";
    case "concurrency_limit_reached":
      return "The concurrent-run limit has been reached. Wait for an active run to finish.";
    case "live_lab_paused":
      return "Live provider operations are paused. Samples and learning resources remain available.";
    case "provider_paused":
      return "This provider is temporarily paused for live operations.";
    case "quota_unavailable":
      return "Usage protection is temporarily unavailable. No provider request was sent.";
  }
}

export function safeAccessFailureMessage(error: unknown): string {
  void error;
  return "Usage protection is temporarily unavailable. No provider request was sent.";
}

function retryAfterSeconds(resetsAt: string): number {
  const difference = Date.parse(resetsAt) - Date.now();
  return Number.isFinite(difference) ? Math.max(1, Math.ceil(difference / 1_000)) : 60;
}

function safeCount(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value ?? 0)) : 0;
}

function validTimestamp(value: string): string {
  return Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : new Date(Date.now() + 60_000).toISOString();
}
