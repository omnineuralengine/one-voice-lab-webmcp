const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OneHumanAuthSubject = Readonly<{
  id: string;
  is_anonymous?: boolean;
}>;

/** A verified auth-provider user is eligible to anchor a ONE human only when
 * it is a stable UUID and not an anonymous-auth principal. */
export function isOneHumanAuthSubject(value: unknown): value is OneHumanAuthSubject {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string"
    && UUID_PATTERN.test(candidate.id)
    && candidate.is_anonymous !== true;
}
