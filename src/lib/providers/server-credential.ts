import "server-only";

type EnvironmentLookup = Readonly<Record<string, string | undefined>>;

export function readServerCredential(
  name: string,
  environment: EnvironmentLookup = process.env,
): string | null {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name) || name.startsWith("NEXT_PUBLIC_")) return null;
  const value = environment[name]?.trim();
  return value || null;
}

export function hasServerCredentialConfiguration(
  names: readonly string[],
  environment: EnvironmentLookup = process.env,
): boolean {
  return names.length > 0 && names.every((name) => readServerCredential(name, environment) !== null);
}
