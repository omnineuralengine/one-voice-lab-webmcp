import type { CodeLabLanguage, CodeLabWorkflowId } from "@/lib/code-lab-files";

export const CODE_LAB_DRAFT_PREFIX = "deepgram-code-lab:draft:v1:";
export const CODE_LAB_IMPORTED_DRAFT_PREFIX = "deepgram-code-lab:imported-draft:v1:";

export type CodeLabDraftSummary = {
  draftCount: number;
  importedDraftCount: number;
  hasCustomFiles: boolean;
  hasCustomPatterns: boolean;
  hasRecipe: boolean;
  hasLocalWork: boolean;
};

const SECRET_ASSIGNMENT_PATTERN = /\b(DEEPGRAM_API_KEY|API[_-]?KEY|AUTHORIZATION)\b\s*[:=]\s*["']?([A-Za-z0-9._~-]{20,})/gi;
const AUTH_TOKEN_PATTERN = /\b(Token|Bearer)\s+([A-Za-z0-9._~-]{20,})/gi;
const STANDALONE_SECRET_PATTERN = /(^|[\s"'=:,])([A-Za-z0-9_-]{32,})(?=$|[\s"',;])/gm;

export function codeLabDraftKey(workflowId: CodeLabWorkflowId, language: CodeLabLanguage, path: string) {
  return `${CODE_LAB_DRAFT_PREFIX}${workflowId}:${language}:${encodeURIComponent(path)}`;
}

export function codeLabImportedDraftKey(sourceId: string, language: string, path: string) {
  const safeSourceId = encodeURIComponent(sourceId.replace(/[^a-zA-Z0-9._:-]/g, "-"));
  return `${CODE_LAB_IMPORTED_DRAFT_PREFIX}${safeSourceId}:${encodeURIComponent(language)}:${encodeURIComponent(path)}`;
}

export function getCodeLabDraftSummary(): CodeLabDraftSummary {
  if (typeof window === "undefined") {
    return {
      draftCount: 0,
      importedDraftCount: 0,
      hasCustomFiles: false,
      hasCustomPatterns: false,
      hasRecipe: false,
      hasLocalWork: false,
    };
  }

  try {
    const keys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index) ?? "");
    const draftCount = keys.filter((key) => key.startsWith(CODE_LAB_DRAFT_PREFIX)).length;
    const importedDraftCount = keys.filter((key) => key.startsWith(CODE_LAB_IMPORTED_DRAFT_PREFIX)).length;
    const hasCustomFiles = hasStoredCollection("deepgram-code-lab:custom-files:v1");
    const hasCustomPatterns = hasStoredCollection("deepgram-code-lab:custom-patterns:v1");
    const hasRecipe = Boolean(window.localStorage.getItem("deepgram-code-lab:recipe:v1"));

    return {
      draftCount,
      importedDraftCount,
      hasCustomFiles,
      hasCustomPatterns,
      hasRecipe,
      hasLocalWork:
        draftCount > 0 ||
        importedDraftCount > 0 ||
        hasCustomFiles ||
        hasCustomPatterns ||
        hasRecipe,
    };
  } catch {
    return {
      draftCount: 0,
      importedDraftCount: 0,
      hasCustomFiles: false,
      hasCustomPatterns: false,
      hasRecipe: false,
      hasLocalWork: false,
    };
  }
}

export function readLocalJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocalJson(key: string, value: unknown) {
  if (typeof window === "undefined") return false;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeLocalValue(key: string) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

export function looksLikeRealApiKey(value: string) {
  return (
    patternFindsSecret(SECRET_ASSIGNMENT_PATTERN, value, 2) ||
    patternFindsSecret(AUTH_TOKEN_PATTERN, value, 2) ||
    patternFindsSecret(STANDALONE_SECRET_PATTERN, value, 2)
  );
}

export function sanitizeSnippetForExport(value: string) {
  return value
    .replace(SECRET_ASSIGNMENT_PATTERN, (_match, label: string) => `${label}=***redacted***`)
    .replace(AUTH_TOKEN_PATTERN, (_match, scheme: string) => `${scheme} ***redacted***`)
    .replace(STANDALONE_SECRET_PATTERN, (_match, prefix: string, token: string) =>
      isSafePlaceholder(token) ? `${prefix}${token}` : `${prefix}[REDACTED_POSSIBLE_SECRET]`,
    );
}

function patternFindsSecret(pattern: RegExp, value: string, tokenGroup: number) {
  pattern.lastIndex = 0;

  let match = pattern.exec(value);
  while (match) {
    if (!isSafePlaceholder(match[tokenGroup])) return true;
    match = pattern.exec(value);
  }

  return false;
}

function isSafePlaceholder(value: string) {
  const normalized = value.toUpperCase();
  return (
    normalized.includes("REPLACE_ME") ||
    normalized.includes("REDACTED") ||
    normalized.startsWith("YOUR_") ||
    normalized === "DEEPGRAM_API_KEY" ||
    /^\*+$/.test(value)
  );
}

function hasStoredCollection(key: string) {
  const raw = window.localStorage.getItem(key);
  if (!raw) return false;

  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) && value.length > 0;
  } catch {
    return false;
  }
}
