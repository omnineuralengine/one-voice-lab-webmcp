const DEFAULT_AUTH_CALLBACK_TARGET = "/settings#identity";
const ALLOWED_AUTH_CALLBACK_TARGETS = new Set([
  "/settings",
  "/settings#identity",
]);

export function resolveAuthCallbackRedirect(value: string | null, requestOrigin: string): URL {
  const fallback = new URL(DEFAULT_AUTH_CALLBACK_TARGET, requestOrigin);
  if (!value?.startsWith("/")
    || value.startsWith("//")
    || value.includes("\\")
    || /%(?:2f|5c)/i.test(value)) return fallback;

  try {
    const candidate = new URL(value, fallback.origin);
    const target = `${candidate.pathname}${candidate.search}${candidate.hash}`;
    return candidate.origin === fallback.origin && ALLOWED_AUTH_CALLBACK_TARGETS.has(target)
      ? candidate
      : fallback;
  } catch {
    return fallback;
  }
}
