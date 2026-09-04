const DEFAULT_CANONICAL_ORIGIN = "https://one-voice-lab.vercel.app";

function normalizeOrigin(value: string | undefined): string {
  if (!value?.trim()) return DEFAULT_CANONICAL_ORIGIN;

  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return DEFAULT_CANONICAL_ORIGIN;
    }
    return url.origin;
  } catch {
    return DEFAULT_CANONICAL_ORIGIN;
  }
}

export function getCanonicalOrigin(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return normalizeOrigin(environment.NEXT_PUBLIC_CANONICAL_URL);
}

export function getCanonicalUrl(
  path = "/",
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return new URL(normalizedPath, `${getCanonicalOrigin(environment)}/`).toString();
}

export const CANONICAL_URL_ENVIRONMENT_VARIABLE = "NEXT_PUBLIC_CANONICAL_URL";
