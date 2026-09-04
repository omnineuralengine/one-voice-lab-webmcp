import type { z } from "zod";

export const ACTION_SOURCES = ["ui", "keyboard", "touch", "pwa", "rest", "mcp", "automation"] as const;
export const ACTION_AUTHENTICATION_REQUIREMENTS = ["none", "optional", "required"] as const;
export const ACTION_TRUST_REQUIREMENTS = [
  "public",
  "same-origin",
  "user-gesture",
  "active-session",
  "member-session",
  "trusted-local",
  "durable-usage-gate",
  "explicit-human-confirmation",
] as const;
export const ACTION_USAGE_KINDS = ["none", "local-resource", "storage-write", "provider-usage"] as const;
export const ACTION_IMPLEMENTATION_STATES = ["action-backed", "dedicated-service", "client-bridge"] as const;
export const ACTION_ERROR_CATEGORIES = [
  "validation",
  "authentication",
  "permission",
  "rate-limit",
  "unavailable",
  "cancelled",
  "timeout",
  "provider",
  "internal",
] as const;

export type ActionSource = (typeof ACTION_SOURCES)[number];
export type ActionAuthenticationRequirement = (typeof ACTION_AUTHENTICATION_REQUIREMENTS)[number];
export type ActionTrustRequirement = (typeof ACTION_TRUST_REQUIREMENTS)[number];
export type ActionUsageKind = (typeof ACTION_USAGE_KINDS)[number];
export type ActionImplementationState = (typeof ACTION_IMPLEMENTATION_STATES)[number];
export type ActionErrorCategory = (typeof ACTION_ERROR_CATEGORIES)[number];

export type ActionField = Readonly<{
  name: string;
  type: string;
  required: boolean;
  description: string;
}>;

export type ActionMetadata<Name extends string = string> = Readonly<{
  name: Name;
  description: string;
  requiredInputs: readonly ActionField[];
  outputShape: readonly ActionField[];
  authentication: ActionAuthenticationRequirement;
  trust: readonly ActionTrustRequirement[];
  surfaces: readonly ActionSource[];
  agentExposable: boolean;
  usage: Readonly<{
    kind: ActionUsageKind;
    confirmationRequired: boolean;
    note: string;
  }>;
  implementation: ActionImplementationState;
}>;

export type ActionDefinition<
  Name extends string = string,
  InputSchema extends z.ZodType = z.ZodType,
  OutputSchema extends z.ZodType = z.ZodType,
> = Readonly<{
  metadata: ActionMetadata<Name>;
  inputSchema: InputSchema;
  outputSchema: OutputSchema;
}>;

export type ActionResultMeta = Readonly<{
  source: ActionSource;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  usage: ActionUsageKind;
}>;

export type ActionIssue = Readonly<{
  path: string;
  message: string;
}>;

export type ActionError = Readonly<{
  code: string;
  category: ActionErrorCategory;
  message: string;
  retryable: boolean;
  issues?: readonly ActionIssue[];
}>;

export type ActionResult<Name extends string, Output> =
  | Readonly<{
      ok: true;
      action: Name;
      invocationId: string;
      data: Output;
      meta: ActionResultMeta;
    }>
  | Readonly<{
      ok: false;
      action: Name;
      invocationId: string;
      error: ActionError;
      meta: ActionResultMeta;
    }>;

export function defineAction<
  const Name extends string,
  InputSchema extends z.ZodType,
  OutputSchema extends z.ZodType,
>(definition: ActionDefinition<Name, InputSchema, OutputSchema>) {
  return definition;
}
