import "server-only";

export const AUTH_EVENT_NAMES = [
  "sign_in_requested",
  "sign_in_succeeded",
  "sign_in_failed",
  "guest_migration_claimed",
  "guest_migration_completed",
  "guest_migration_failed",
  "account_export_completed",
  "account_deletion_completed",
] as const;

export type AuthEventName = (typeof AUTH_EVENT_NAMES)[number];

export function recordAuthEvent(
  event: AuthEventName,
  input: Readonly<{
    outcome: "accepted" | "succeeded" | "failed" | "denied";
    reason?: string;
    correlationId?: string;
  }>,
) {
  const reason = sanitizeLabel(input.reason);
  const correlationId = sanitizeLabel(input.correlationId);
  console.info("one_auth_event", {
    event,
    outcome: input.outcome,
    ...(reason ? { reason } : {}),
    ...(correlationId ? { correlationId } : {}),
  });
}

function sanitizeLabel(value: string | undefined) {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._:-]{0,79}$/.test(normalized) ? normalized : null;
}
