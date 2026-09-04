import type {
  ActionError,
  ActionErrorCategory,
  ActionIssue,
  ActionResult,
  ActionSource,
  ActionUsageKind,
} from "@/lib/actions/contracts";

export type ActionExecutionDependencies = Readonly<{
  now?: () => Date;
  monotonicNow?: () => number;
  createInvocationId?: () => string;
}>;

export type SafeActionFailure = Readonly<{
  code: string;
  category: ActionErrorCategory;
  message: string;
  retryable: boolean;
  issues?: readonly ActionIssue[];
}>;

export function createActionExecution<Name extends string>(
  action: Name,
  source: ActionSource,
  usage: ActionUsageKind,
  dependencies: ActionExecutionDependencies = {},
) {
  const now = dependencies.now ?? (() => new Date());
  const monotonicNow = dependencies.monotonicNow ?? (() => performance.now());
  const createInvocationId = dependencies.createInvocationId ?? (() => globalThis.crypto.randomUUID());
  const invocationId = createInvocationId();
  const startedAt = now().toISOString();
  const started = monotonicNow();

  function meta() {
    return {
      source,
      startedAt,
      completedAt: now().toISOString(),
      durationMs: Math.max(0, Math.round((monotonicNow() - started) * 1_000) / 1_000),
      usage,
    } as const;
  }

  return {
    invocationId,
    success<Output>(data: Output): ActionResult<Name, Output> {
      return { ok: true, action, invocationId, data, meta: meta() };
    },
    failure<Output = never>(error: SafeActionFailure): ActionResult<Name, Output> {
      return { ok: false, action, invocationId, error, meta: meta() };
    },
  };
}

export function validationFailure(issues: readonly ActionIssue[]): ActionError {
  return {
    code: "invalid_action_input",
    category: "validation",
    message: "The action input did not match its registered contract.",
    retryable: false,
    issues: issues.slice(0, 12),
  };
}

export function unavailableFailure(message = "No active handler is available for this action."): ActionError {
  return {
    code: "action_unavailable",
    category: "unavailable",
    message,
    retryable: true,
  };
}

export function normalizeActionFailure(error: unknown): ActionError {
  if (error instanceof ActionExecutionError) {
    return {
      code: error.code,
      category: error.category,
      message: error.safeMessage,
      retryable: error.retryable,
    };
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return { code: "action_cancelled", category: "cancelled", message: "The action was cancelled.", retryable: false };
  }
  if (error instanceof Error && error.name === "AbortError") {
    return { code: "action_cancelled", category: "cancelled", message: "The action was cancelled.", retryable: false };
  }
  if (error instanceof Error && /timeout/i.test(error.name)) {
    return { code: "action_timed_out", category: "timeout", message: "The action reached its time limit.", retryable: true };
  }
  return {
    code: "action_failed",
    category: "internal",
    message: "The action failed safely without exposing internal details.",
    retryable: false,
  };
}

export class ActionExecutionError extends Error {
  constructor(
    readonly code: string,
    readonly category: ActionErrorCategory,
    readonly safeMessage: string,
    readonly retryable = false,
  ) {
    super(safeMessage);
    this.name = "ActionExecutionError";
  }
}
