import type { CodeLabLanguage, CodeLabWorkflowId } from "@/lib/code-lab-files";
import type {
  CodeLabLaunchContext,
  CodeLabLaunchContextInput,
  CodeLabLaunchEnvironmentVariable,
  CodeLabLaunchFile,
  CodeLabLaunchLessonNote,
  CodeLabLaunchMode,
  CodeLabLaunchPreparationResult,
  CodeLabLaunchProjectEntry,
  CodeLabLaunchSemanticRegion,
  CodeLabSecretFinding,
  CodeLabSecretKind,
  CodeLabSnippetSanitization,
} from "@/types/code-lab-launch-context";

export const CODE_LAB_SECRET_PLACEHOLDERS = [
  "DEEPGRAM_API_KEY",
  "$DEEPGRAM_API_KEY",
  "${DEEPGRAM_API_KEY}",
  "%DEEPGRAM_API_KEY%",
  "$env:DEEPGRAM_API_KEY",
  "process.env.DEEPGRAM_API_KEY",
  'os.environ["DEEPGRAM_API_KEY"]',
  "os.environ['DEEPGRAM_API_KEY']",
  'os.getenv("DEEPGRAM_API_KEY")',
  "os.getenv('DEEPGRAM_API_KEY')",
  'os.Getenv("DEEPGRAM_API_KEY")',
  'Environment.GetEnvironmentVariable("DEEPGRAM_API_KEY")',
  'getenv("DEEPGRAM_API_KEY")',
  "getenv('DEEPGRAM_API_KEY')",
  'std::getenv("DEEPGRAM_API_KEY")',
  "YOUR_DEEPGRAM_API_KEY",
  "DEEPGRAM_TEMPORARY_TOKEN",
  "YOUR_TEMPORARY_TOKEN",
  "REPLACE_ME",
  "***redacted***",
  "[REDACTED]",
  "[REDACTED_TOKEN]",
  "[REDACTED_PRIVATE_KEY]",
] as const;

const SOURCES = ["questline", "api-studio", "applied-voice-systems"] as const;
const LANGUAGES: readonly CodeLabLanguage[] = ["Shell", "Python", "TypeScript", "Go", ".NET"];
const WORKFLOW_IDS: readonly CodeLabWorkflowId[] = [
  "transcribe-url",
  "upload-audio",
  "live-mic",
  "tts",
  "text-intelligence",
  "temporary-token",
  "voice-agent",
  "trusted-voice",
];
const PROJECT_LAYERS: readonly CodeLabLaunchProjectEntry["layer"][] = [
  "client",
  "server",
  "shared",
  "config",
  "test",
  "docs",
];
const REGION_TYPES: readonly CodeLabLaunchSemanticRegion["type"][] = [
  "authentication",
  "configuration",
  "request",
  "audio-input",
  "audio-send",
  "event-receive",
  "response-parse",
  "error-handling",
  "cleanup",
  "testing",
  "observability",
];
const NOTE_CATEGORIES: readonly CodeLabLaunchLessonNote["category"][] = [
  "first-principles",
  "runtime",
  "audio",
  "security",
  "debugging",
  "production",
  "client-impact",
];

const MAX_FILES = 48;
const MAX_LIST_ITEMS = 96;
const MAX_CODE_LENGTH = 120_000;
const MAX_TEXT_LENGTH = 20_000;
const MAX_SHORT_TEXT_LENGTH = 500;
const SERVER_KEY_WARNING =
  "DEEPGRAM_API_KEY must remain server-side; examples use placeholders and launch data carries no credential.";

const API_KEY_ASSIGNMENT_PATTERN = /(["']?\b(?:DEEPGRAM_API_KEY|DG_API_KEY|API[_-]?KEY|APIKEY)\b["']?\s*(?::=|=>|:|=)\s*)([^\r\n,;}]+)/gi;
const TOKEN_ASSIGNMENT_PATTERN = /(["']?\b(?:ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|TEMPORARY[_-]?TOKEN|TOKEN)\b["']?\s*(?::=|=>|:|=)\s*)([^\r\n,;}]+)/gi;
const AUTHORIZATION_ASSIGNMENT_PATTERN = /(["']?\b(?:AUTHORIZATION|PROXY-AUTHORIZATION)\b["']?\s*(?::=|=>|:|=)\s*)([^\r\n,;}]+)/gi;
const AUTH_SCHEME_PATTERN = /(\b(?:Token|Bearer|Basic)\s+)([A-Za-z0-9._~+/=-]{16,})/gi;
const QUERY_CREDENTIAL_PATTERN = /([?&](?:api[_-]?key|access[_-]?token|token)=)([^&#\s]{16,})/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const PRIVATE_KEY_PATTERN = /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----[\s\S]+?-----END(?: [A-Z0-9]+)? PRIVATE KEY-----/g;
const SK_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]{16,}\b/g;
const LOCAL_STORAGE_CREDENTIAL_PATTERN = /(localStorage\.setItem\(\s*["'][^"']*(?:api[_-]?key|token|authorization)[^"']*["']\s*,\s*["'])([^"']{16,})(["']\s*\))/gi;
const STANDALONE_SECRET_LINE_PATTERN = /(^|[\r\n]\s*)(["'`]?)([A-Za-z0-9_-]{32,})\2(?=\s*(?:$|[\r\n]))/gm;

type SanitizationTracker = {
  findings: CodeLabSecretFinding[];
  replacements: number;
};

export function isAllowedCodeLabPlaceholder(value: string) {
  const normalized = unwrapLiteral(value.trim());
  if (!normalized) return false;
  if (CODE_LAB_SECRET_PLACEHOLDERS.some((item) => item.toLowerCase() === normalized.toLowerCase())) {
    return true;
  }
  return (
    /^\*{3,}$/u.test(normalized) ||
    /^\[?redacted(?:_[a-z_]+)?\]?$/iu.test(normalized) ||
    /^your_[a-z0-9_]*(?:api[_-]?key|token)$/iu.test(normalized) ||
    /^replace[_-]?me(?:_[a-z0-9_]+)?$/iu.test(normalized)
  );
}

export function sanitizeSnippet(value: string) {
  return sanitizeSnippetWithReport(value).value;
}

export function sanitizeSnippetWithReport(value: string): CodeLabSnippetSanitization {
  return sanitizeString(value, "$snippet");
}

export function findLikelySecrets(value: unknown): CodeLabSecretFinding[] {
  const findings: CodeLabSecretFinding[] = [];
  inspectUnknown(value, "$", findings, new WeakSet<object>());
  return dedupeFindings(findings);
}

export function detectLikelySecret(value: unknown) {
  return findLikelySecrets(value).length > 0;
}

export function mergeLaunchContextFiles(
  baseFiles: readonly CodeLabLaunchFile[],
  incomingFiles: readonly CodeLabLaunchFile[],
): CodeLabLaunchFile[] {
  const merged = new Map<string, CodeLabLaunchFile>();
  for (const file of baseFiles) {
    const safe = sanitizePreparedFile(file);
    merged.set(fileKey(safe), safe);
  }
  for (const file of incomingFiles) {
    const safe = sanitizePreparedFile(file);
    const key = fileKey(safe);
    const previous = merged.get(key);
    merged.set(
      key,
      previous
        ? {
            ...safe,
            semanticRegions: mergeSemanticRegions(previous.semanticRegions, safe.semanticRegions),
          }
        : safe,
    );
  }
  return [...merged.values()].sort(compareFiles);
}

export function mergeCodeLabLaunchContexts(
  base: CodeLabLaunchContext,
  incoming: CodeLabLaunchContext,
): CodeLabLaunchContext {
  const withoutId: Omit<CodeLabLaunchContext, "id"> = {
    createdAt: incoming.createdAt,
    source: incoming.source,
    sourceId: incoming.sourceId ?? base.sourceId,
    language: incoming.language,
    framework: incoming.framework ?? base.framework,
    runtime: incoming.runtime ?? base.runtime,
    ide: incoming.ide ?? base.ide,
    operatingSystem: incoming.operatingSystem ?? base.operatingSystem,
    workflow: {
      ...incoming.workflow,
      deepgramCapabilities: mergeTextLists(
        base.workflow.deepgramCapabilities,
        incoming.workflow.deepgramCapabilities,
      ),
      transport: incoming.workflow.transport ?? base.workflow.transport,
      audioSource: incoming.workflow.audioSource ?? base.workflow.audioSource,
      outputDestination: incoming.workflow.outputDestination ?? base.workflow.outputDestination,
    },
    projectTree: mergeProjectTree(base.projectTree, incoming.projectTree),
    files: prioritizeLaunchFile(
      mergeLaunchContextFiles(base.files, incoming.files),
      incoming.files[0]?.path ?? "",
    ),
    lessonNotes: mergeLessonNotes(base.lessonNotes, incoming.lessonNotes),
    securityWarnings: mergeTextLists(base.securityWarnings, incoming.securityWarnings),
    environmentVariables: mergeEnvironmentVariables(
      base.environmentVariables,
      incoming.environmentVariables,
    ),
    relatedApiStudioOperationId:
      incoming.relatedApiStudioOperationId ?? base.relatedApiStudioOperationId,
    relatedQuestNodeId: incoming.relatedQuestNodeId ?? base.relatedQuestNodeId,
  };
  return { ...withoutId, id: createLaunchId(withoutId) };
}

export function sanitizeCodeLabLaunchContext(
  input: CodeLabLaunchContextInput,
): CodeLabLaunchPreparationResult {
  const issues = validateInput(input);
  const originalFindings = findLikelySecrets(input);
  if (issues.length > 0) {
    return blockedResult("invalid-input", issues, originalFindings, 0);
  }

  const tracker: SanitizationTracker = { findings: [], replacements: 0 };
  const projectTree = normalizeProjectTree(input.projectTree, tracker);
  const files = prioritizeLaunchFile(
    normalizeFiles(input.files, input.language, tracker),
    normalizePath(sanitizeMetadataString(input.files[0]?.path ?? "")),
  );
  const environmentVariables = normalizeEnvironmentVariables(input.environmentVariables, tracker);
  const securityWarnings = mergeTextLists(
    normalizeTextList(input.securityWarnings, "$.securityWarnings", tracker),
    [SERVER_KEY_WARNING],
  );
  const normalized: CodeLabLaunchContextInput = {
    source: input.source,
    sourceId: input.sourceId
      ? sanitizeTracked(input.sourceId, "$.sourceId", tracker, MAX_SHORT_TEXT_LENGTH).trim()
      : undefined,
    language: input.language,
    framework: optionalText(input.framework, "$.framework", tracker),
    runtime: optionalText(input.runtime, "$.runtime", tracker),
    ide: optionalText(input.ide, "$.ide", tracker),
    operatingSystem: optionalText(input.operatingSystem, "$.operatingSystem", tracker),
    workflow: {
      id: input.workflow.id,
      title: sanitizeTracked(input.workflow.title, "$.workflow.title", tracker, MAX_SHORT_TEXT_LENGTH).trim(),
      description: sanitizeTracked(
        input.workflow.description,
        "$.workflow.description",
        tracker,
        MAX_TEXT_LENGTH,
      ).trim(),
      deepgramCapabilities: normalizeTextList(
        input.workflow.deepgramCapabilities,
        "$.workflow.deepgramCapabilities",
        tracker,
      ),
      transport: optionalText(input.workflow.transport, "$.workflow.transport", tracker),
      audioSource: optionalText(input.workflow.audioSource, "$.workflow.audioSource", tracker),
      outputDestination: optionalText(
        input.workflow.outputDestination,
        "$.workflow.outputDestination",
        tracker,
      ),
    },
    projectTree,
    files,
    lessonNotes: normalizeLessonNotes(input.lessonNotes, tracker),
    securityWarnings,
    environmentVariables,
    relatedApiStudioOperationId: optionalText(
      input.relatedApiStudioOperationId,
      "$.relatedApiStudioOperationId",
      tracker,
    ),
    relatedQuestNodeId: optionalText(
      input.relatedQuestNodeId,
      "$.relatedQuestNodeId",
      tracker,
    ),
  };

  const findings = dedupeFindings([...originalFindings, ...tracker.findings]);
  const replacements = Math.max(tracker.replacements, originalFindings.length);
  if (replacements > 0) {
    normalized.securityWarnings = mergeTextLists(normalized.securityWarnings, [
      `${replacements} suspected credential value(s) were replaced with safe placeholders before launch.`,
    ]);
  }
  const unresolved = findLikelySecrets(normalized);
  if (unresolved.length > 0) {
    return blockedResult(
      "unresolved-secret",
      ["A high-confidence credential pattern remained after sanitization; launch was blocked."],
      dedupeFindings([...findings, ...unresolved]),
      replacements,
    );
  }

  const createdAt = new Date().toISOString();
  const withoutId: Omit<CodeLabLaunchContext, "id"> = { ...normalized, createdAt };
  const context: CodeLabLaunchContext = { ...withoutId, id: createLaunchId(withoutId) };
  return { ok: true, blocked: false, context, findings, replacements };
}

export function prepareCodeLabLaunch(
  input: CodeLabLaunchContextInput,
  currentContext: CodeLabLaunchContext | null = null,
  mode: CodeLabLaunchMode = "replace",
): CodeLabLaunchPreparationResult {
  const prepared = sanitizeCodeLabLaunchContext(input);
  if (!prepared.ok || mode !== "merge" || !currentContext) return prepared;
  const merged = mergeCodeLabLaunchContexts(currentContext, prepared.context);
  const unresolved = findLikelySecrets(merged);
  if (unresolved.length > 0) {
    return blockedResult(
      "unresolved-secret",
      ["A high-confidence credential pattern remained after merging; launch was blocked."],
      unresolved,
      prepared.replacements,
    );
  }
  return {
    ok: true,
    blocked: false,
    context: merged,
    findings: prepared.findings,
    replacements: prepared.replacements,
  };
}

export const buildCodeLabLaunchContext = sanitizeCodeLabLaunchContext;

export function toCodeLabLaunchContextInput(context: CodeLabLaunchContext): CodeLabLaunchContextInput {
  return {
    source: context.source,
    sourceId: context.sourceId,
    language: context.language,
    framework: context.framework,
    runtime: context.runtime,
    ide: context.ide,
    operatingSystem: context.operatingSystem,
    workflow: context.workflow,
    projectTree: context.projectTree,
    files: context.files,
    lessonNotes: context.lessonNotes,
    securityWarnings: context.securityWarnings,
    environmentVariables: context.environmentVariables,
    relatedApiStudioOperationId: context.relatedApiStudioOperationId,
    relatedQuestNodeId: context.relatedQuestNodeId,
  };
}

function validateInput(input: CodeLabLaunchContextInput) {
  const issues: string[] = [];
  if (!input || typeof input !== "object") return ["Launch context input is required."];
  if (!SOURCES.includes(input.source)) issues.push("Launch source is not supported.");
  if (!LANGUAGES.includes(input.language)) issues.push("Code Lab language is not supported.");
  if (!input.workflow || !WORKFLOW_IDS.includes(input.workflow.id)) {
    issues.push("Code Lab workflow is not supported.");
  } else {
    if (!input.workflow.title?.trim()) issues.push("Workflow title is required.");
    if (!input.workflow.description?.trim()) issues.push("Workflow description is required.");
    if (!Array.isArray(input.workflow.deepgramCapabilities)) {
      issues.push("Workflow capabilities must be an array.");
    }
  }
  if (!Array.isArray(input.projectTree)) issues.push("Project tree must be an array.");
  if (!Array.isArray(input.files)) issues.push("Launch files must be an array.");
  if (!Array.isArray(input.lessonNotes)) issues.push("Lesson notes must be an array.");
  if (!Array.isArray(input.securityWarnings)) issues.push("Security warnings must be an array.");
  if (!Array.isArray(input.environmentVariables)) {
    issues.push("Environment variables must be an array.");
  }
  return issues;
}

function normalizeProjectTree(
  entries: CodeLabLaunchProjectEntry[],
  tracker: SanitizationTracker,
) {
  const normalized = new Map<string, CodeLabLaunchProjectEntry>();
  for (const [index, entry] of entries.slice(0, MAX_LIST_ITEMS).entries()) {
    if (!entry || typeof entry !== "object") continue;
    const path = normalizePath(
      sanitizeTracked(entry.path ?? "", `$.projectTree[${index}].path`, tracker, MAX_SHORT_TEXT_LENGTH),
    );
    if (!path || !PROJECT_LAYERS.includes(entry.layer)) continue;
    normalized.set(path.toLowerCase(), {
      path,
      role: sanitizeTracked(
        entry.role ?? "",
        `$.projectTree[${index}].role`,
        tracker,
        MAX_TEXT_LENGTH,
      ).trim(),
      layer: entry.layer,
      editable: Boolean(entry.editable),
      generated: Boolean(entry.generated),
    });
  }
  return [...normalized.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function normalizeFiles(
  entries: CodeLabLaunchFile[],
  fallbackLanguage: CodeLabLanguage,
  tracker: SanitizationTracker,
) {
  const normalized: CodeLabLaunchFile[] = [];
  for (const [index, entry] of entries.slice(0, MAX_FILES).entries()) {
    if (!entry || typeof entry !== "object") continue;
    const path = normalizePath(
      sanitizeTracked(entry.path ?? "", `$.files[${index}].path`, tracker, MAX_SHORT_TEXT_LENGTH),
    );
    if (!path) continue;
    const content = sanitizeTracked(
      entry.content ?? "",
      `$.files[${index}].content`,
      tracker,
      MAX_CODE_LENGTH,
    );
    const language = LANGUAGES.includes(entry.language) ? entry.language : fallbackLanguage;
    normalized.push({
      path,
      language,
      content,
      originalContent: sanitizeTracked(
        entry.originalContent ?? entry.content ?? "",
        `$.files[${index}].originalContent`,
        tracker,
        MAX_CODE_LENGTH,
      ),
      role: sanitizeTracked(entry.role ?? "", `$.files[${index}].role`, tracker, MAX_TEXT_LENGTH).trim(),
      layer: sanitizeTracked(entry.layer ?? "shared", `$.files[${index}].layer`, tracker, MAX_SHORT_TEXT_LENGTH).trim(),
      semanticRegions: normalizeSemanticRegions(
        entry.semanticRegions,
        `$.files[${index}].semanticRegions`,
        content,
        tracker,
      ),
    });
  }
  return mergeLaunchContextFiles([], normalized);
}

function normalizeSemanticRegions(
  entries: CodeLabLaunchSemanticRegion[],
  path: string,
  content: string,
  tracker: SanitizationTracker,
) {
  if (!Array.isArray(entries)) return [];
  const maxLine = Math.max(1, content.split("\n").length);
  const normalized = new Map<string, CodeLabLaunchSemanticRegion>();
  for (const [index, entry] of entries.slice(0, MAX_LIST_ITEMS).entries()) {
    if (!entry || !REGION_TYPES.includes(entry.type)) continue;
    const id = sanitizeTracked(entry.id ?? "", `${path}[${index}].id`, tracker, MAX_SHORT_TEXT_LENGTH).trim();
    if (!id) continue;
    const startLine = clampLine(entry.startLine, maxLine);
    const endLine = Math.max(startLine, clampLine(entry.endLine, maxLine));
    normalized.set(id, {
      id,
      label: sanitizeTracked(entry.label ?? "", `${path}[${index}].label`, tracker, MAX_SHORT_TEXT_LENGTH).trim(),
      type: entry.type,
      startLine,
      endLine,
      explanation: sanitizeTracked(
        entry.explanation ?? "",
        `${path}[${index}].explanation`,
        tracker,
        MAX_TEXT_LENGTH,
      ).trim(),
    });
  }
  return [...normalized.values()].sort((left, right) => left.startLine - right.startLine || left.id.localeCompare(right.id));
}

function normalizeLessonNotes(notes: CodeLabLaunchLessonNote[], tracker: SanitizationTracker) {
  if (!Array.isArray(notes)) return [];
  return notes.slice(0, MAX_LIST_ITEMS).flatMap((note, index) => {
    if (!note || !NOTE_CATEGORIES.includes(note.category)) return [];
    return [{
      title: sanitizeTracked(note.title ?? "", `$.lessonNotes[${index}].title`, tracker, MAX_SHORT_TEXT_LENGTH).trim(),
      body: sanitizeTracked(note.body ?? "", `$.lessonNotes[${index}].body`, tracker, MAX_TEXT_LENGTH).trim(),
      category: note.category,
    }];
  });
}

function normalizeEnvironmentVariables(
  variables: CodeLabLaunchEnvironmentVariable[],
  tracker: SanitizationTracker,
) {
  if (!Array.isArray(variables)) return [];
  const normalized = new Map<string, CodeLabLaunchEnvironmentVariable>();
  for (const [index, variable] of variables.slice(0, MAX_LIST_ITEMS).entries()) {
    if (!variable) continue;
    const name = sanitizeTracked(
      variable.name ?? "",
      `$.environmentVariables[${index}].name`,
      tracker,
      MAX_SHORT_TEXT_LENGTH,
    ).trim();
    if (!name) continue;
    const sensitive = isSensitiveEnvironmentName(name);
    let placeholder = sanitizeTracked(
      variable.placeholder ?? "",
      `$.environmentVariables[${index}].placeholder`,
      tracker,
      MAX_SHORT_TEXT_LENGTH,
    ).trim();
    if (sensitive && !isAllowedCodeLabPlaceholder(placeholder)) {
      tracker.findings.push(createFinding(`$.environmentVariables[${index}].placeholder`, "sensitive-field"));
      tracker.replacements += 1;
      placeholder = name.toUpperCase().includes("API_KEY") ? "DEEPGRAM_API_KEY" : "[REDACTED_TOKEN]";
    }
    normalized.set(name.toLowerCase(), {
      name,
      placeholder,
      location: sanitizeTracked(
        variable.location ?? "",
        `$.environmentVariables[${index}].location`,
        tracker,
        MAX_SHORT_TEXT_LENGTH,
      ).trim(),
      serverOnly: sensitive ? true : Boolean(variable.serverOnly),
    });
  }
  return [...normalized.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function mergeProjectTree(
  base: readonly CodeLabLaunchProjectEntry[],
  incoming: readonly CodeLabLaunchProjectEntry[],
) {
  const merged = new Map<string, CodeLabLaunchProjectEntry>();
  [...base, ...incoming].forEach((entry) => {
    const path = normalizePath(sanitizeSnippet(entry.path));
    if (!path || !PROJECT_LAYERS.includes(entry.layer)) return;
    merged.set(path.toLowerCase(), {
      ...entry,
      path,
      role: sanitizeSnippet(entry.role),
    });
  });
  return [...merged.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function mergeSemanticRegions(
  base: readonly CodeLabLaunchSemanticRegion[],
  incoming: readonly CodeLabLaunchSemanticRegion[],
) {
  const merged = new Map<string, CodeLabLaunchSemanticRegion>();
  [...base, ...incoming].forEach((region) => {
    merged.set(region.id, {
      ...region,
      id: sanitizeMetadataString(region.id),
      label: sanitizeSnippet(region.label),
      explanation: sanitizeSnippet(region.explanation),
    });
  });
  return [...merged.values()].sort((left, right) => left.startLine - right.startLine || left.id.localeCompare(right.id));
}

function mergeLessonNotes(
  base: readonly CodeLabLaunchLessonNote[],
  incoming: readonly CodeLabLaunchLessonNote[],
) {
  const merged = new Map<string, CodeLabLaunchLessonNote>();
  [...base, ...incoming].forEach((note) => {
    const safe = { ...note, title: sanitizeSnippet(note.title), body: sanitizeSnippet(note.body) };
    merged.set(`${safe.category}:${safe.title.toLowerCase()}`, safe);
  });
  return [...merged.values()].sort((left, right) => left.category.localeCompare(right.category) || left.title.localeCompare(right.title));
}

function mergeEnvironmentVariables(
  base: readonly CodeLabLaunchEnvironmentVariable[],
  incoming: readonly CodeLabLaunchEnvironmentVariable[],
) {
  const merged = new Map<string, CodeLabLaunchEnvironmentVariable>();
  [...base, ...incoming].forEach((variable) => {
    const sensitive = isSensitiveEnvironmentName(variable.name);
    merged.set(variable.name.toLowerCase(), {
      name: sanitizeSnippet(variable.name),
      placeholder: sensitive && !isAllowedCodeLabPlaceholder(variable.placeholder)
        ? "DEEPGRAM_API_KEY"
        : sanitizeSnippet(variable.placeholder),
      location: sanitizeSnippet(variable.location),
      serverOnly: sensitive ? true : variable.serverOnly,
    });
  });
  return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function sanitizePreparedFile(file: CodeLabLaunchFile): CodeLabLaunchFile {
  return {
    path: normalizePath(sanitizeSnippet(file.path)),
    language: LANGUAGES.includes(file.language) ? file.language : "TypeScript",
    content: sanitizeSnippet(file.content).slice(0, MAX_CODE_LENGTH),
    originalContent: sanitizeSnippet(file.originalContent).slice(0, MAX_CODE_LENGTH),
    role: sanitizeSnippet(file.role).slice(0, MAX_TEXT_LENGTH),
    layer: sanitizeSnippet(file.layer).slice(0, MAX_SHORT_TEXT_LENGTH),
    semanticRegions: mergeSemanticRegions([], file.semanticRegions),
  };
}

function sanitizeTracked(
  value: string,
  path: string,
  tracker: SanitizationTracker,
  maxLength: number,
) {
  const result = sanitizeString(value, path);
  tracker.findings.push(...result.findings);
  tracker.replacements += result.replacements;
  return result.value.slice(0, maxLength);
}

function sanitizeMetadataString(value: string) {
  return sanitizeString(value, "$metadata").value;
}

function optionalText(
  value: string | undefined,
  path: string,
  tracker: SanitizationTracker,
) {
  if (!value) return undefined;
  const normalized = sanitizeTracked(value, path, tracker, MAX_TEXT_LENGTH).trim();
  return normalized || undefined;
}

function normalizeTextList(
  values: string[],
  path: string,
  tracker: SanitizationTracker,
) {
  if (!Array.isArray(values)) return [];
  return uniqueStable(
    values
      .slice(0, MAX_LIST_ITEMS)
      .filter((value): value is string => typeof value === "string")
      .map((value, index) => sanitizeTracked(value, `${path}[${index}]`, tracker, MAX_TEXT_LENGTH).trim())
      .filter(Boolean),
  );
}

function sanitizeString(value: string, path: string): CodeLabSnippetSanitization {
  const findings = findStringSecrets(value, path);
  let replacements = 0;
  let sanitized = value.replace(PRIVATE_KEY_PATTERN, () => {
    replacements += 1;
    return "[REDACTED_PRIVATE_KEY]";
  });
  sanitized = sanitized.replace(JWT_PATTERN, () => {
    replacements += 1;
    return "[REDACTED_TOKEN]";
  });
  sanitized = sanitized.replace(SK_KEY_PATTERN, () => {
    replacements += 1;
    return "***REDACTED***";
  });
  sanitized = sanitized.replace(LOCAL_STORAGE_CREDENTIAL_PATTERN, (_match, prefix: string, candidate: string, suffix: string) => {
    if (isAllowedCodeLabPlaceholder(candidate)) return `${prefix}${candidate}${suffix}`;
    replacements += 1;
    return `${prefix}***REDACTED***${suffix}`;
  });
  if (shouldInspectStandaloneSecret(path)) {
    sanitized = sanitized.replace(
      STANDALONE_SECRET_LINE_PATTERN,
      (_match, prefix: string, _quote: string, candidate: string) => {
        if (isAllowedCodeLabPlaceholder(candidate)) return `${prefix}${candidate}`;
        replacements += 1;
        return `${prefix}***REDACTED***`;
      },
    );
  }
  sanitized = sanitized.replace(API_KEY_ASSIGNMENT_PATTERN, (match, prefix: string, candidate: string) => {
    if (!isCredentialLiteral(candidate, "api-key")) return match;
    replacements += 1;
    return `${prefix}DEEPGRAM_API_KEY`;
  });
  sanitized = sanitized.replace(TOKEN_ASSIGNMENT_PATTERN, (match, prefix: string, candidate: string) => {
    if (!isCredentialLiteral(candidate, "token")) return match;
    replacements += 1;
    return `${prefix}[REDACTED_TOKEN]`;
  });
  sanitized = sanitized.replace(
    AUTHORIZATION_ASSIGNMENT_PATTERN,
    (match, prefix: string, candidate: string) => {
      if (!authorizationContainsCredential(candidate)) return match;
      replacements += 1;
      return `${prefix}"Token [REDACTED]"`;
    },
  );
  sanitized = sanitized.replace(AUTH_SCHEME_PATTERN, (match, prefix: string, candidate: string) => {
    if (isAllowedCodeLabPlaceholder(candidate)) return match;
    replacements += 1;
    return `${prefix}[REDACTED]`;
  });
  sanitized = sanitized.replace(QUERY_CREDENTIAL_PATTERN, (match, prefix: string, candidate: string) => {
    if (isAllowedCodeLabPlaceholder(candidate)) return match;
    replacements += 1;
    return `${prefix}[REDACTED]`;
  });
  return { value: sanitized, replacements, findings };
}

function inspectUnknown(
  value: unknown,
  path: string,
  findings: CodeLabSecretFinding[],
  visited: WeakSet<object>,
) {
  if (typeof value === "string") {
    findings.push(...findStringSecrets(value, path));
    return;
  }
  if (!value || typeof value !== "object" || visited.has(value)) return;
  visited.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectUnknown(item, `${path}[${index}]`, findings, visited));
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    const itemPath = `${path}.${key}`;
    if (isSensitiveField(key) && typeof item === "string" && isCredentialLiteral(item, "token")) {
      findings.push(createFinding(itemPath, "sensitive-field"));
    }
    inspectUnknown(item, itemPath, findings, visited);
  }
}

function findStringSecrets(value: string, path: string) {
  const findings: CodeLabSecretFinding[] = [];
  collectMatches(value, API_KEY_ASSIGNMENT_PATTERN, (match) => {
    if (isCredentialLiteral(match[2] ?? "", "api-key")) findings.push(createFinding(path, "api-key-assignment"));
  });
  collectMatches(value, TOKEN_ASSIGNMENT_PATTERN, (match) => {
    if (isCredentialLiteral(match[2] ?? "", "token")) findings.push(createFinding(path, "token-assignment"));
  });
  collectMatches(value, AUTHORIZATION_ASSIGNMENT_PATTERN, (match) => {
    if (authorizationContainsCredential(match[2] ?? "")) findings.push(createFinding(path, "authorization-credential"));
  });
  collectMatches(value, AUTH_SCHEME_PATTERN, (match) => {
    if (!isAllowedCodeLabPlaceholder(match[2] ?? "")) findings.push(createFinding(path, "authorization-credential"));
  });
  collectMatches(value, QUERY_CREDENTIAL_PATTERN, (match) => {
    if (!isAllowedCodeLabPlaceholder(match[2] ?? "")) findings.push(createFinding(path, "authorization-credential"));
  });
  collectMatches(value, JWT_PATTERN, () => findings.push(createFinding(path, "jwt")));
  collectMatches(value, PRIVATE_KEY_PATTERN, () => findings.push(createFinding(path, "private-key")));
  collectMatches(value, SK_KEY_PATTERN, () => findings.push(createFinding(path, "sensitive-field")));
  collectMatches(value, LOCAL_STORAGE_CREDENTIAL_PATTERN, (match) => {
    if (!isAllowedCodeLabPlaceholder(match[2] ?? "")) findings.push(createFinding(path, "sensitive-field"));
  });
  if (shouldInspectStandaloneSecret(path)) {
    collectMatches(value, STANDALONE_SECRET_LINE_PATTERN, (match) => {
      if (!isAllowedCodeLabPlaceholder(match[3] ?? "")) findings.push(createFinding(path, "sensitive-field"));
    });
  }
  return dedupeFindings(findings);
}

function collectMatches(value: string, pattern: RegExp, onMatch: (match: RegExpExecArray) => void) {
  const matcher = new RegExp(pattern.source, pattern.flags);
  let match = matcher.exec(value);
  while (match) {
    onMatch(match);
    match = matcher.exec(value);
  }
}

function isCredentialLiteral(value: string, kind: "api-key" | "token"): boolean {
  const trimmed = value.trim();
  const unwrapped = unwrapLiteral(trimmed);
  if (!unwrapped || isAllowedCodeLabPlaceholder(unwrapped) || isDynamicReference(unwrapped)) return false;
  if (kind === "token" && /^(?:Token|Bearer|Basic)\s+/i.test(unwrapped)) {
    return authorizationContainsCredential(unwrapped);
  }
  if (!/^[A-Za-z0-9._~+/=-]{16,}$/u.test(unwrapped)) return false;
  if (isQuoted(trimmed)) return true;
  return unwrapped.length >= 20 && /[A-Za-z]/u.test(unwrapped) && (/[0-9]/u.test(unwrapped) || /[._~+/=-]/u.test(unwrapped));
}

function authorizationContainsCredential(value: string): boolean {
  const candidate = unwrapLiteral(value.trim().replace(/^f(?=["'])/iu, ""));
  if (!candidate || isAllowedCodeLabPlaceholder(candidate) || isDynamicReference(candidate)) return false;
  const scheme = /^(?:Token|Bearer|Basic)\s+(.+)$/iu.exec(candidate);
  if (scheme) {
    const credential = unwrapLiteral(scheme[1].trim());
    return !isAllowedCodeLabPlaceholder(credential) && !isDynamicReference(credential) && /^[A-Za-z0-9._~+/=-]{16,}$/u.test(credential);
  }
  return isCredentialLiteral(value, "api-key");
}

function isDynamicReference(value: string) {
  return /^\$\{[^}]+\}$/u.test(value) || /^\{[^}]+\}$/u.test(value) || /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/u.test(value);
}

function unwrapLiteral(value: string) {
  let normalized = value.trim().replace(/[;,]$/u, "").trim();
  if (
    normalized.length >= 2 &&
    ((normalized.startsWith('"') && normalized.endsWith('"')) ||
      (normalized.startsWith("'") && normalized.endsWith("'")) ||
      (normalized.startsWith("`") && normalized.endsWith("`")))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}

function isQuoted(value: string) {
  const trimmed = value.trim();
  return (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith("`") && trimmed.endsWith("`"))
  );
}

function isSensitiveField(key: string) {
  const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return ["apikey", "deepgramapikey", "authorization", "accesstoken", "authtoken", "temporarytoken", "clientsecret", "privatekey", "password"].includes(normalized);
}

function isSensitiveEnvironmentName(name: string) {
  return /(?:API[_-]?KEY|AUTHORIZATION|TOKEN|SECRET|PASSWORD)/iu.test(name);
}

function shouldInspectStandaloneSecret(path: string) {
  return path === "$snippet" || /\.files\[\d+\]\.(?:content|originalContent)$/u.test(path);
}

function createFinding(path: string, kind: CodeLabSecretKind): CodeLabSecretFinding {
  const messages: Record<CodeLabSecretKind, string> = {
    "api-key-assignment": "A credential-like API key assignment was detected and must use a placeholder.",
    "authorization-credential": "A credential-like Authorization value was detected and must be redacted.",
    "token-assignment": "A credential-like token assignment was detected and must be redacted.",
    jwt: "A JWT-shaped value was detected and must be redacted.",
    "private-key": "A private-key block was detected and must be removed.",
    "sensitive-field": "A sensitive field contains a credential-like literal.",
  };
  return { path, kind, confidence: "high", message: messages[kind] };
}

function blockedResult(
  reason: "invalid-input" | "unresolved-secret",
  issues: string[],
  findings: CodeLabSecretFinding[],
  replacements: number,
): CodeLabLaunchPreparationResult {
  return { ok: false, blocked: true, context: null, reason, issues, findings, replacements };
}

function dedupeFindings(findings: CodeLabSecretFinding[]) {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.path}:${finding.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizePath(value: string) {
  return value
    .replaceAll("\\", "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/")
    .slice(0, MAX_SHORT_TEXT_LENGTH);
}

function mergeTextLists(base: readonly string[], incoming: readonly string[]) {
  return uniqueStable([...base, ...incoming].map((item) => sanitizeSnippet(item).trim()).filter(Boolean));
}

function uniqueStable<T>(items: readonly T[]) {
  return [...new Set(items)];
}

function clampLine(value: number, maxLine: number) {
  return Math.min(maxLine, Math.max(1, Number.isFinite(value) ? Math.floor(value) : 1));
}

function fileKey(file: Pick<CodeLabLaunchFile, "language" | "path">) {
  return `${file.language}:${file.path.toLowerCase()}`;
}

function compareFiles(left: CodeLabLaunchFile, right: CodeLabLaunchFile) {
  const byLanguage = LANGUAGES.indexOf(left.language) - LANGUAGES.indexOf(right.language);
  return byLanguage || left.path.localeCompare(right.path);
}

function prioritizeLaunchFile(files: CodeLabLaunchFile[], preferredPath: string) {
  if (!preferredPath) return files;
  const preferredIndex = files.findIndex(
    (file) => file.path.toLowerCase() === preferredPath.toLowerCase(),
  );
  if (preferredIndex <= 0) return files;
  return [files[preferredIndex], ...files.slice(0, preferredIndex), ...files.slice(preferredIndex + 1)];
}

function createLaunchId(context: Omit<CodeLabLaunchContext, "id">) {
  const serialized = stableSerialize(context);
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `code-lab-launch-${(hash >>> 0).toString(36)}`;
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(",")}}`;
}
