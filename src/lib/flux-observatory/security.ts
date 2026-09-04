const SENSITIVE_KEY = /authorization|api[_-]?key|token|bearer|credential|cookie|password|secret|private[_-]?key|websocket[_-]?url/i;
const AUTH_VALUE = /\b(?:Bearer|Token)\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const DEEPGRAM_KEY = /\bdg_[A-Za-z0-9_-]{12,}\b/g;
const PRIVATE_KEY = /-----BEGIN [^-]{0,40}PRIVATE KEY-----[\s\S]*?-----END [^-]{0,40}PRIVATE KEY-----/g;
const QUERY_CREDENTIAL = /([?&](?:token|access_token|api_key|key|authorization)=)[^&#\s]+/gi;
const URL_VALUE = /\b(?:https?|wss):\/\/[^\s"'<>()]+/gi;
const WINDOWS_HOME = /[A-Za-z]:\\Users\\[^\\\s]+\\[^\s"']*/g;
const UNIX_HOME = /\/(?:home|Users)\/[^/\s]+\/[^\s"']*/g;

export function sanitizeFluxText(value: string, maxLength = 1000): string {
  return value
    .replace(PRIVATE_KEY, "[private-key-redacted]")
    .replace(AUTH_VALUE, "***redacted***")
    .replace(JWT, "***redacted***")
    .replace(DEEPGRAM_KEY, "***redacted***")
    .replace(QUERY_CREDENTIAL, "$1***redacted***")
    .replace(URL_VALUE, "[url-redacted]")
    .replace(WINDOWS_HOME, "[local-path-redacted]")
    .replace(UNIX_HOME, "[local-path-redacted]")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .slice(0, maxLength)
    .trim();
}

export function sanitizeFluxValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[depth-limited]";
  if (value === undefined) return undefined;
  if (typeof value === "string") return sanitizeFluxText(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((entry) => sanitizeFluxValue(entry, depth + 1));
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 100)
        .map(([key, entry]) => [
          sanitizeFluxText(key, 80),
          SENSITIVE_KEY.test(key) && typeof entry !== "boolean" && typeof entry !== "number" && entry !== null
            ? "***redacted***"
            : sanitizeFluxValue(entry, depth + 1),
        ]),
    );
  }
  return String(value).slice(0, 120);
}

export function sanitizeFluxRecord(value: Record<string, unknown>): Record<string, unknown> {
  return sanitizeFluxValue(value) as Record<string, unknown>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function stableFluxHash(value: unknown): string {
  const serialized = stableStringify(sanitizeFluxValue(value));
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
