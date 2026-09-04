export type ScenarioIdentityScope = Readonly<{
  key: string;
  label: string;
  ready: boolean;
}>;

/**
 * This key exists only in tab memory. It lets Scenario Studio discard an
 * ephemeral receipt when the verified browser identity changes without ever
 * accepting a browser-supplied owner identifier as authority.
 */
export function resolveScenarioIdentityScope(
  authReady: boolean,
  verifiedHumanId: string | null,
): ScenarioIdentityScope {
  if (!authReady) {
    return {
      key: "identity:pending",
      label: "Checking the current account",
      ready: false,
    };
  }

  if (verifiedHumanId) {
    return {
      key: `identity:human:${verifiedHumanId}`,
      label: "Signed in · this receipt stays in this tab",
      ready: true,
    };
  }

  return {
    key: "identity:guest",
    label: "Guest · this receipt stays in this tab",
    ready: true,
  };
}

export function scenarioIdentityChanged(
  previous: ScenarioIdentityScope,
  next: ScenarioIdentityScope,
) {
  return previous.key !== next.key;
}
