const OUTCOME_MESSAGES = {
  "account:deleted": "Your ONE account was deleted. Guest Mode is active on this device.",
  "auth:claim-unavailable": "Sign-in was paused because this device's guest state could not be bound safely. Guest Mode remains available.",
  "auth:failed": "That sign-in could not be completed. Request a new link or continue in Guest Mode.",
  "auth:logout-failed": "Sign-out could not be confirmed. Your account remains active in this browser; try again before leaving the device.",
  "auth:signed-out": "Signed out. Account-scoped memory and session access were cleared; Guest Mode is active.",
  "auth:success": "Signed in. Your verified ONE account is ready.",
  "auth:unavailable": "Sign-in is temporarily unavailable. Guest Mode still works on this device.",
  "migration:available": "Signed in. Eligible guest state is ready for you to review and import.",
  "migration:claimed-by-another-account": "Signed in. Guest state associated with another account was kept isolated from this account.",
  "migration:complete": "Eligible guest state was imported once. Existing account preferences were preserved.",
} as const;

const OUTCOME_KEYS = ["account", "migration", "auth"] as const;

export function readAccountOutcomeMessage(searchParams: URLSearchParams): string | null {
  for (const key of OUTCOME_KEYS) {
    const value = searchParams.get(key);
    if (!value) continue;
    const message = OUTCOME_MESSAGES[`${key}:${value}` as keyof typeof OUTCOME_MESSAGES];
    if (message) return message;
  }
  return null;
}

export function clearAccountOutcomeParams(url: URL): string {
  for (const key of OUTCOME_KEYS) url.searchParams.delete(key);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function setAuthOutcomeParam(
  url: URL,
  outcome: "claim-unavailable" | "logout-failed" | "signed-out" | "unavailable",
): string {
  url.searchParams.set("auth", outcome);
  return `${url.pathname}${url.search}${url.hash}`;
}
