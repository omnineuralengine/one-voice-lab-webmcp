import type { AiContext } from "@/lib/ai/schemas";

const SECRET_PATTERNS = [
  /\b(?:dg_[A-Za-z0-9_-]{12,}|sk-[A-Za-z0-9_-]{16,}|vcst_[A-Za-z0-9_-]{12,})\b/g,
  /\b(?:api[_-]?key|authorization|bearer|password|secret|token)\s*[:=]\s*[^\s,;]+/gi,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g,
];
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function redactAiText(value: string, max = 4_000) {
  let redacted = value.replace(CONTROL_CHARACTERS, " ");
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    redacted = redacted.replace(pattern, "[REDACTED_SECRET]");
  }
  return redacted.slice(0, max).trim();
}

function redactList(values: string[], maxItems: number, maxLength = 800) {
  return values.slice(0, maxItems).map((value) => redactAiText(value, maxLength)).filter(Boolean);
}

export function sanitizeAiContext(context: AiContext): AiContext {
  return {
    moduleId: redactAiText(context.moduleId, 120),
    moduleName: redactAiText(context.moduleName, 160),
    summary: redactAiText(context.summary, 4_000),
    facts: redactList(context.facts, 30),
    assumptions: redactList(context.assumptions, 30),
    openQuestions: redactList(context.openQuestions, 30),
    architecture: redactList(context.architecture, 40),
    risks: redactList(context.risks, 30),
    evidence: context.evidence.slice(0, 30).map((item) => ({
      id: redactAiText(item.id, 160),
      label: redactAiText(item.label, 240),
      type: item.type,
      summary: redactAiText(item.summary, 1_000),
    })),
  };
}

export function containsSecretMarker(value: unknown) {
  const serialized = JSON.stringify(value);
  return SECRET_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(serialized);
  });
}
