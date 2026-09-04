import { generateDeepgramCodeSnippets } from "@/lib/deepgram-codegen";
import { DEEPGRAM_ENDPOINT_REGISTRY, getDeepgramEndpoint } from "@/lib/deepgram-endpoint-registry";
import type { DocsSearchInput } from "@/lib/live-solution-docs";
import type { DeepgramEffectiveRequest, DeepgramEndpointDefinition } from "@/types/deepgram-endpoint-registry";
import {
  analyzeTechnicalArtifactInputSchema,
  apiLabWorkbenchHandoffSchema,
  artifactDetectionSchema,
  technicalArtifactSchema,
  technicalArtifactSessionSchema,
  type AnalyzeTechnicalArtifactInput,
  type ApiLabWorkbenchHandoff,
  type ArtifactDetection,
  type GeneratedTechnicalVariant,
  type NormalizedTechnicalRepresentation,
  type NormalizedTechnicalRequest,
  type NormalizedTechnicalResponse,
  type RelatedTechnicalDocumentation,
  type SecretFinding,
  type TechnicalArtifact,
  type TechnicalArtifactType,
  type TechnicalJsonValue,
  type TechnicalValidationIssue,
} from "@/types/payload-code-workbench";

export const API_LAB_WORKBENCH_HANDOFF_KEY = "deepgram-payload-code-workbench:api-lab-handoff:v1";
export const MAX_TECHNICAL_ARTIFACT_INPUT = 120_000;

type SecretKind = SecretFinding["kind"];
type RedactionRule = {
  kind: SecretKind;
  label: string;
  placeholder: string;
  pattern: RegExp;
  replace: (match: string, ...groups: string[]) => string;
};

export type TechnicalArtifactRedaction = {
  value: string;
  findings: SecretFinding[];
};

const SECRET_RULES: RedactionRule[] = [
  {
    kind: "private-key", label: "Private key", placeholder: "[REDACTED_PRIVATE_KEY]",
    pattern: /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)? PRIVATE KEY-----/g,
    replace: () => "[REDACTED_PRIVATE_KEY]",
  },
  {
    kind: "authorization-token", label: "Authorization credential", placeholder: "[REDACTED_BEARER_TOKEN]",
    pattern: /(\b(?:authorization|proxy-authorization)\b\s*[:=]\s*["']?\s*(?:Token|Bearer)\s+)(?!\[REDACTED_|<REDACTED|\$\{|\$env:|process\.env)([^\s"',;\\]{8,})/gi,
    replace: (_match, prefix) => `${prefix}[REDACTED_BEARER_TOKEN]`,
  },
  {
    kind: "basic-authorization", label: "Basic authorization credential", placeholder: "[REDACTED_BASIC_AUTH]",
    pattern: /(\b(?:authorization|proxy-authorization)\b\s*[:=]\s*["']?\s*Basic\s+)([A-Za-z0-9+/=]{8,})/gi,
    replace: (_match, prefix) => `${prefix}[REDACTED_BASIC_AUTH]`,
  },
  {
    kind: "cookie", label: "Cookie or session value", placeholder: "[REDACTED_COOKIE]",
    pattern: /(\b(?:cookie|set-cookie)\b\s*:\s*)(?!\[REDACTED_COOKIE\])([^\r\n]+)/gi,
    replace: (_match, prefix) => `${prefix}[REDACTED_COOKIE]`,
  },
  {
    kind: "deepgram-api-key", label: "Deepgram API key", placeholder: "[REDACTED_DEEPGRAM_KEY]",
    pattern: /\bdg_[A-Za-z0-9_-]{16,}\b/g,
    replace: () => "[REDACTED_DEEPGRAM_KEY]",
  },
  {
    kind: "deepgram-api-key", label: "Deepgram client credential literal", placeholder: "[REDACTED_DEEPGRAM_KEY]",
    pattern: /(\b(?:createClient|new\s+Deepgram|DeepgramClient)\s*\(\s*)(["'])(?!\[REDACTED_|<REDACTED|\$\{)([A-Za-z0-9_-]{24,})(\2)/gi,
    replace: (_match, prefix, quote, _secret, closingQuote) => `${prefix}${quote}[REDACTED_DEEPGRAM_KEY]${closingQuote}`,
  },
  {
    kind: "github-token", label: "GitHub token", placeholder: "[REDACTED_GITHUB_TOKEN]",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
    replace: () => "[REDACTED_GITHUB_TOKEN]",
  },
  {
    kind: "api-key", label: "OpenAI-style API key", placeholder: "[REDACTED_API_KEY]",
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/g,
    replace: () => "[REDACTED_API_KEY]",
  },
  {
    kind: "aws-access-key", label: "AWS access key ID", placeholder: "[REDACTED_AWS_ACCESS_KEY]",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    replace: () => "[REDACTED_AWS_ACCESS_KEY]",
  },
  {
    kind: "google-api-key", label: "Google API key", placeholder: "[REDACTED_GOOGLE_API_KEY]",
    pattern: /\bAIza[A-Za-z0-9_-]{30,}\b/g,
    replace: () => "[REDACTED_GOOGLE_API_KEY]",
  },
  {
    kind: "jwt", label: "JSON Web Token", placeholder: "[REDACTED_JWT]",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    replace: () => "[REDACTED_JWT]",
  },
  {
    kind: "signed-url-credential", label: "Signed URL credential", placeholder: "[REDACTED_SIGNED_URL_CREDENTIAL]",
    pattern: /([?&](?:x-amz-signature|x-amz-credential|x-goog-signature|signature|sig|api[_-]?key|access[_-]?token|token)=)(?!\[REDACTED_)([^&#\s"']+)/gi,
    replace: (_match, prefix) => `${prefix}[REDACTED_SIGNED_URL_CREDENTIAL]`,
  },
  {
    kind: "aws-secret-key", label: "AWS secret access key", placeholder: "[REDACTED_SECRET]",
    pattern: /((?:AWS_SECRET_ACCESS_KEY|aws_secret_access_key)\s*(?:=|:|:=)\s*["']?)([^\s"',;}{]{12,})/gi,
    replace: (_match, prefix) => `${prefix}[REDACTED_SECRET]`,
  },
  {
    kind: "deepgram-api-key", label: "Deepgram API key assignment", placeholder: "[REDACTED_DEEPGRAM_KEY]",
    pattern: /((?:DEEPGRAM_API_KEY|DG_API_KEY)\s*(?:=|:|:=)\s*["']?)([^\s"',;}{]{8,})/gi,
    replace: (_match, prefix) => `${prefix}[REDACTED_DEEPGRAM_KEY]`,
  },
  {
    kind: "generic-secret", label: "Credential field", placeholder: "[REDACTED_SECRET]",
    pattern: /(["']?(?:api[_-]?key|apiKey|access[_-]?token|accessToken|auth[_-]?token|authToken|token|client[_-]?secret|clientSecret|password|passwd|secret|session[_-]?token|sessionToken)["']?\s*(?:=|:|:=|=>)\s*["']?)(?!\$\{|\$env:|process\.env|os\.environ|\[REDACTED|<REDACTED)([^\s"',;}{]{8,})/gi,
    replace: (_match, prefix) => `${prefix}[REDACTED_SECRET]`,
  },
];

export function redactTechnicalArtifactInput(input: string): TechnicalArtifactRedaction {
  let value = input.slice(0, MAX_TECHNICAL_ARTIFACT_INPUT);
  const grouped = new Map<string, SecretFinding>();
  for (const rule of SECRET_RULES) {
    rule.pattern.lastIndex = 0;
    value = value.replace(rule.pattern, (match, ...args: unknown[]) => {
      const offset = typeof args.at(-2) === "number" ? args.at(-2) as number : 0;
      const line = value.slice(0, offset).split(/\r?\n/).length;
      const id = `${rule.kind}:${rule.placeholder}`;
      const previous = grouped.get(id);
      grouped.set(id, previous
        ? { ...previous, count: previous.count + 1, lines: previous.lines.includes(line) ? previous.lines : [...previous.lines, line].slice(0, 50) }
        : { id, kind: rule.kind, label: rule.label, placeholder: rule.placeholder, count: 1, lines: [line], confidence: "high" });
      return rule.replace(match, ...(args.slice(0, -2).map(String)));
    });
  }
  return { value, findings: [...grouped.values()] };
}

export function detectTechnicalArtifact(input: string): ArtifactDetection {
  const text = input.trim();
  if (!text) return artifactDetectionSchema.parse({ artifactType: "unknown", detectedLanguage: "unknown", confidence: "low", signals: ["No content"] });
  const json = tryParseJson(text);
  if (json.ok) {
    const jsonRecord = isRecord(json.value) ? json.value : null;
    const responseLike = Boolean(jsonRecord && ["results", "metadata", "request_id", "error", "status", "status_code"].some((key) => key in jsonRecord));
    return artifactDetectionSchema.parse({ artifactType: responseLike ? "json-response" : "json-payload", detectedLanguage: "json", confidence: "high", signals: ["Strict JSON parsing succeeded", responseLike ? "Response-shaped fields detected" : "Object or array payload detected"] });
  }
  const nonEmptyLines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (nonEmptyLines.length > 1 && nonEmptyLines.every((line) => tryParseJson(line).ok)) {
    return artifactDetectionSchema.parse({ artifactType: "jsonl", detectedLanguage: "jsonl", confidence: "high", signals: ["Each non-empty line parses as JSON"] });
  }
  if (/^HTTP\/\d(?:\.\d)?\s+\d{3}\b/i.test(text)) return detection("raw-http-response", "http", "high", "HTTP status line detected");
  if (/^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\S+\s+HTTP\/\d(?:\.\d)?\b/i.test(text)) return detection("raw-http-request", "http", "high", "HTTP request line detected");
  if (/(?:^|\n)\s*(?:curl(?:\.exe)?\s|Invoke-(?:RestMethod|WebRequest)\b)/i.test(text)) {
    const powershell = /Invoke-(?:RestMethod|WebRequest)|`\s*(?:\r?\n|$)|\$env:/i.test(text);
    return detection("curl", powershell ? "powershell" : "bash", "high", powershell ? "PowerShell request command detected" : "cURL command detected");
  }
  if (/\b(?:interface|type)\s+\w+|\b(?:fetch|axios|WebSocket|URLSearchParams)\s*\(|\b(?:const|let)\s+\w+\s*=/m.test(text)) {
    const typescript = /\b(?:interface|type)\s+\w+|:\s*(?:string|number|boolean|unknown)\b|\bas\s+const\b/.test(text);
    return detection(typescript ? "typescript" : "javascript", typescript ? "typescript" : "javascript", "medium", typescript ? "TypeScript syntax signals detected" : "JavaScript request or declaration signals detected");
  }
  if (/\b(?:import\s+(?:requests|httpx|aiohttp|websockets|deepgram)|from\s+deepgram\s+import|DeepgramClient|async\s+def|await\s+\w+)/m.test(text)) return detection("python", "python", "medium", "Python API or async syntax detected");
  if (/\b(?:Traceback|[A-Za-z]+(?:Error|Exception)|Unhandled rejection|stack trace)\b/i.test(text)) return detection("error-message", "log", "medium", "Exception or stack-trace marker detected");
  if (/(?:^|\n)(?:\[?\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}:\d{2}).*\b(?:TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\b/im.test(text) || /\b(?:request[_ -]?id|trace[_ -]?id)\b/i.test(text)) return detection("application-log", "log", "medium", "Timestamp, severity, or trace marker detected");
  return detection("plain-text", "plain-text", "low", "No stronger structural signature matched");
}

function detection(artifactType: TechnicalArtifactType, detectedLanguage: ArtifactDetection["detectedLanguage"], confidence: ArtifactDetection["confidence"], signal: string) {
  return artifactDetectionSchema.parse({ artifactType, detectedLanguage, confidence, signals: [signal] });
}

export function analyzeTechnicalArtifact(value: AnalyzeTechnicalArtifactInput | string): TechnicalArtifact {
  const parsedInput = analyzeTechnicalArtifactInputSchema.parse(typeof value === "string" ? { input: value } : value);
  const redaction = redactTechnicalArtifactInput(parsedInput.input);
  const detected = detectTechnicalArtifact(redaction.value);
  const artifactType = parsedInput.artifactType ?? detected.artifactType;
  const detectedLanguage = parsedInput.detectedLanguage ?? detected.detectedLanguage;
  const parsed = parseRepresentation(redaction.value, artifactType);
  const matchedEndpoint = matchDeepgramEndpoint(parsed.normalized);
  const now = parsedInput.now ?? new Date().toISOString();
  const extracted = extractDeepgramDetails(parsed.normalized, matchedEndpoint);
  const validationErrors = validateTechnicalArtifact(parsed.normalized, artifactType, redaction.findings, matchedEndpoint, parsed.issues);
  const relatedDocumentation = matchedEndpoint ? [registryDocumentation(matchedEndpoint, now)] : [];
  const base: TechnicalArtifact = {
    schemaVersion: 1,
    id: parsedInput.id ?? crypto.randomUUID(),
    sessionId: parsedInput.sessionId ?? null,
    artifactType,
    detectedLanguage,
    title: parsedInput.title ?? defaultArtifactTitle(artifactType, matchedEndpoint, extracted.statusCode),
    rawInput: null,
    redactedInput: redaction.value,
    formattedInput: parsed.formatted,
    normalizedRepresentation: parsed.normalized,
    validationStatus: validationStatus(validationErrors),
    validationErrors,
    secretFindings: redaction.findings,
    extractedEndpoint: matchedEndpoint?.id ?? null,
    extractedMethod: parsed.normalized.request?.method ?? null,
    extractedHeaders: parsed.normalized.request?.headers ?? parsed.normalized.response?.headers ?? {},
    extractedQueryParameters: parsed.normalized.request?.queryParameters ?? {},
    extractedBody: parsed.normalized.request?.body ?? parsed.normalized.response?.body ?? parsed.normalized.payload,
    extractedModel: extracted.model,
    extractedFeatures: extracted.features,
    extractedStatusCode: extracted.statusCode,
    extractedErrorCode: extracted.errorCode,
    detectedProvider: extracted.provider,
    relatedDocumentation,
    explanation: buildExplanation(artifactType, parsed.normalized, matchedEndpoint, redaction.findings),
    suggestedFixes: parsed.fixes,
    generatedVariants: [],
    observed: buildObserved(parsed.normalized, matchedEndpoint, extracted, redaction.findings),
    inferred: buildInferred(parsed.normalized, matchedEndpoint),
    recommended: buildRecommendations(parsed.normalized, matchedEndpoint, validationErrors),
    takeaway: "",
    customerContext: "",
    includeInHandoff: true,
    createdAt: now,
    updatedAt: now,
    includeInExport: parsedInput.includeInExport ?? true,
    provenance: { source: "user-paste", originalRetained: false, persistedRepresentation: "redacted-only", deterministicAnalysis: true, executed: false },
    confidence: parsedInput.artifactType || parsedInput.detectedLanguage ? "high" : detected.confidence,
  };
  return technicalArtifactSchema.parse({ ...base, generatedVariants: generateTechnicalArtifactVariants(base) });
}

type ParsedRepresentation = {
  normalized: NormalizedTechnicalRepresentation;
  formatted: string;
  issues: TechnicalValidationIssue[];
  fixes: TechnicalArtifact["suggestedFixes"];
};

function parseRepresentation(input: string, artifactType: TechnicalArtifactType): ParsedRepresentation {
  if (artifactType === "json-payload" || artifactType === "json-response") return parseJsonArtifact(input, artifactType === "json-response");
  if (artifactType === "jsonl") return parseJsonLines(input);
  if (artifactType === "curl") return parseCurlArtifact(input);
  if (artifactType === "raw-http-request") return parseRawHttpRequest(input);
  if (artifactType === "raw-http-response") return parseRawHttpResponse(input);
  if (["javascript", "typescript", "python"].includes(artifactType)) return parseCodeArtifact(input);
  if (["application-log", "error-message"].includes(artifactType)) return parseLogArtifact(input);
  return { normalized: emptyRepresentation(artifactType === "plain-text" ? "text" : "unknown"), formatted: input, issues: [], fixes: [] };
}

function parseJsonArtifact(input: string, responseLike: boolean): ParsedRepresentation {
  const parsed = tryParseJson(input);
  if (!parsed.ok) {
    const location = jsonErrorLocation(input, parsed.message);
    const repair = proposeJsonRepair(input);
    return {
      normalized: emptyRepresentation(responseLike ? "response" : "payload"),
      formatted: input,
      issues: [issue("json-syntax", "confirmed-syntax-problem", "error", parsed.message || "Invalid JSON.", null, location.line, location.column)],
      fixes: repair ? [{ id: "json-trailing-comma", label: "Remove trailing commas", explanation: "This separate proposal removes trailing commas and parses successfully. Review it before replacing the original.", replacement: repair, source: "deterministic" }] : [],
    };
  }
  const duplicateJsonKeys = detectDuplicateJsonKeys(input);
  const response = responseLike ? responseFromJson(parsed.value) : null;
  return {
    normalized: { kind: responseLike ? "response" : "payload", request: null, response, payload: parsed.value, duplicateJsonKeys, parserNotes: duplicateJsonKeys.length ? ["Repeated property names were detected textually. Confirm whether they occur in the same object scope."] : [] },
    formatted: JSON.stringify(parsed.value, null, 2),
    issues: duplicateJsonKeys.map((key) => issue(`duplicate-json:${key}`, "possible-configuration-issue", "warning", `Property name '${key}' appears more than once; strict JSON parsers may keep only the final value.`, key, null, null)),
    fixes: [],
  };
}

function parseJsonLines(input: string): ParsedRepresentation {
  const lines = input.split(/\r?\n/).filter((line) => line.trim());
  const parsed: TechnicalJsonValue[] = [];
  const issues: TechnicalValidationIssue[] = [];
  for (const [index, line] of lines.entries()) {
    const value = tryParseJson(line);
    if (value.ok) parsed.push(value.value);
    else issues.push(issue(`jsonl:${index + 1}`, "confirmed-syntax-problem", "error", `Line ${index + 1}: ${value.message}`, null, index + 1, null));
  }
  return { normalized: { kind: "payload", request: null, response: null, payload: parsed, duplicateJsonKeys: [], parserNotes: [] }, formatted: parsed.map((item) => JSON.stringify(item)).join("\n"), issues, fixes: [] };
}

function parseCurlArtifact(input: string): ParsedRepresentation {
  const powershell = /Invoke-(?:RestMethod|WebRequest)|`\s*(?:\r?\n|$)|\$env:/i.test(input);
  const normalizedShell = input.replace(/\\\s*\r?\n/g, " ").replace(/`\s*\r?\n/g, " ");
  const tokens = shellTokens(normalizedShell);
  let method: string | null = null;
  let url: string | null = null;
  const headerPairs: Array<[string, string]> = [];
  const dataParts: string[] = [];
  const fileReferences: string[] = [];
  const notes: string[] = [];
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    const lower = token.toLowerCase();
    const inline = token.includes("=") ? token.slice(token.indexOf("=") + 1) : null;
    const take = () => inline ?? tokens[++index] ?? "";
    if (["-x", "--request", "-method"].includes(lower.split("=")[0])) method = take().toUpperCase();
    else if (["--url", "-uri"].includes(lower.split("=")[0])) url = take();
    else if (["-h", "--header"].includes(lower.split("=")[0])) {
      const header = take(); const separator = header.indexOf(":");
      if (separator > 0) headerPairs.push([header.slice(0, separator).trim(), header.slice(separator + 1).trim()]);
    } else if (["-d", "--data", "--data-raw", "--data-binary", "-body"].includes(lower.split("=")[0])) {
      const data = take();
      if (data.startsWith("@")) fileReferences.push(safeFileReference(data.slice(1)));
      else dataParts.push(data);
    } else if (!token.startsWith("-") && /^(?:https?|wss?):\/\//i.test(token)) url = token;
  }
  if (powershell && /^curl(?:\.exe)?\b/i.test(tokens[0] ?? "")) notes.push("PowerShell may resolve curl differently by version; prefer curl.exe when exact cURL behavior matters.");
  if (fileReferences.length) notes.push("A local file reference was detected but was not opened or read.");
  const bodyText = dataParts.join("\n");
  const bodyParsed = tryParseJson(bodyText);
  const body: TechnicalJsonValue = bodyText ? (bodyParsed.ok ? bodyParsed.value : bodyText) : null;
  method = method ?? (bodyText || fileReferences.length ? "POST" : "GET");
  const headers = headersFromPairs(headerPairs);
  const request = requestFromParts({ method, url, headers: headers.values, body, fileReferences, shell: powershell ? "powershell" : "posix", lineContinuation: /`\s*\r?\n/.test(input) ? "backtick" : /\\\s*\r?\n/.test(input) ? "backslash" : "none", duplicateHeaders: headers.duplicates, input });
  const issues: TechnicalValidationIssue[] = [];
  if (!url) issues.push(issue("curl-url", "confirmed-syntax-problem", "error", "No request URL could be extracted.", "url", null, null));
  if (fileReferences.length) issues.push(issue("curl-file", "requires-customer-clarification", "info", "The request depends on a local file that was deliberately not accessed.", "body", null, null));
  if (powershell && /^curl(?:\.exe)?\b/i.test(tokens[0] ?? "")) issues.push(issue("powershell-curl", "possible-configuration-issue", "warning", "Confirm whether this shell invokes curl.exe or a PowerShell alias.", null, null, null));
  return { normalized: { kind: "request", request, response: null, payload: null, duplicateJsonKeys: bodyText ? detectDuplicateJsonKeys(bodyText) : [], parserNotes: notes }, formatted: formatNormalizedRequest(request), issues, fixes: [] };
}

function parseRawHttpRequest(input: string): ParsedRepresentation {
  const [head, ...bodySections] = input.split(/\r?\n\r?\n/);
  const lines = head.split(/\r?\n/);
  const requestLine = lines.shift()?.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)\s+(HTTP\/\d(?:\.\d)?)$/i);
  const headers = parseHeaderLines(lines);
  const target = requestLine?.[2] ?? "";
  const host = headers.values.host;
  const url = /^(?:https?|wss?):\/\//i.test(target) ? target : host ? `https://${host}${target.startsWith("/") ? target : `/${target}`}` : target;
  const bodyText = bodySections.join("\n\n"); const bodyJson = tryParseJson(bodyText);
  const request = requestFromParts({ method: requestLine?.[1]?.toUpperCase() ?? null, url, headers: headers.values, body: bodyText ? (bodyJson.ok ? bodyJson.value : bodyText) : null, fileReferences: [], shell: null, lineContinuation: null, duplicateHeaders: headers.duplicates, input });
  const issues = requestLine ? [] : [issue("http-request-line", "confirmed-syntax-problem", "error", "The HTTP request line is malformed.", null, 1, 1)];
  return { normalized: { kind: "request", request, response: null, payload: null, duplicateJsonKeys: bodyText ? detectDuplicateJsonKeys(bodyText) : [], parserNotes: host && !/^(?:https?|wss?):\/\//i.test(target) ? ["HTTPS was used only to normalize the relative request target; confirm the actual transport."] : [] }, formatted: formatNormalizedRequest(request), issues, fixes: [] };
}

function parseRawHttpResponse(input: string): ParsedRepresentation {
  const [head, ...bodySections] = input.split(/\r?\n\r?\n/); const lines = head.split(/\r?\n/);
  const status = lines.shift()?.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})(?:\s+(.+))?$/i);
  const headers = parseHeaderLines(lines); const bodyText = bodySections.join("\n\n"); const bodyJson = tryParseJson(bodyText);
  const body: TechnicalJsonValue = bodyText ? (bodyJson.ok ? bodyJson.value : bodyText) : null;
  const response: NormalizedTechnicalResponse = { statusCode: status ? Number(status[1]) : null, statusText: status?.[2] ?? null, headers: headers.values, body, contentType: headerValue(headers.values, "content-type"), requestId: findHeader(headers.values, /(?:dg-)?request-id|x-request-id|trace-id/i) ?? findStringValue(body, /request[_-]?id|trace[_-]?id/i), errorCode: findStringValue(body, /(?:error[_-]?)?code/i), duplicateHeaders: headers.duplicates };
  const issues = status ? [] : [issue("http-status-line", "confirmed-syntax-problem", "error", "The HTTP response status line is malformed.", null, 1, 1)];
  return { normalized: { kind: "response", request: null, response, payload: body, duplicateJsonKeys: bodyText ? detectDuplicateJsonKeys(bodyText) : [], parserNotes: [] }, formatted: formatNormalizedResponse(response), issues, fixes: [] };
}

function parseCodeArtifact(input: string): ParsedRepresentation {
  const url = input.match(/(?:https?|wss?):\/\/[^\s"'`\\)]+/i)?.[0] ?? null;
  const explicitMethod = input.match(/\bmethod\s*:\s*["']([A-Z]+)["']/i)?.[1] ?? input.match(/requests\.(get|post|put|patch|delete)\s*\(/i)?.[1];
  const method = explicitMethod?.toUpperCase() ?? (url ? "GET" : null);
  const request = requestFromParts({ method, url, headers: {}, body: null, fileReferences: [], shell: null, lineContinuation: null, duplicateHeaders: [], input });
  const notes = ["Code was inspected textually and was not executed."];
  return { normalized: { kind: "code", request: url ? request : null, response: null, payload: null, duplicateJsonKeys: [], parserNotes: notes }, formatted: input, issues: url ? [] : [issue("code-url", "requires-customer-clarification", "info", "No literal request URL was found; confirm how the endpoint is constructed at runtime.", "url", null, null)], fixes: [] };
}

function parseLogArtifact(input: string): ParsedRepresentation {
  const statusMatch = input.match(/(?:HTTP(?:\/\d(?:\.\d)?)?\s+|status(?:Code)?[=: ]+)(\d{3})\b/i);
  const requestId = input.match(/(?:request[_ -]?id|trace[_ -]?id)\s*[:=]\s*([A-Za-z0-9._:-]+)/i)?.[1] ?? null;
  const errorCode = input.match(/(?:error[_ -]?code|code)\s*[:=]\s*["']?([A-Za-z0-9._-]+)/i)?.[1] ?? input.match(/\b([A-Z][A-Z0-9_]{3,})\b/)?.[1] ?? null;
  const response: NormalizedTechnicalResponse = { statusCode: statusMatch ? Number(statusMatch[1]) : null, statusText: null, headers: {}, body: input, contentType: null, requestId, errorCode, duplicateHeaders: [] };
  return { normalized: { kind: "log", request: null, response, payload: null, duplicateJsonKeys: [], parserNotes: ["Log content was parsed locally and was not submitted or executed."] }, formatted: input, issues: [], fixes: [] };
}

function requestFromParts(input: { method: string | null; url: string | null; headers: Record<string, string>; body: TechnicalJsonValue; fileReferences: string[]; shell: NormalizedTechnicalRequest["shell"]; lineContinuation: NormalizedTechnicalRequest["lineContinuation"]; duplicateHeaders: string[]; input: string }): NormalizedTechnicalRequest {
  const parsedUrl = parseTechnicalUrl(input.url);
  return {
    method: input.method && /^[A-Z][A-Z0-9-]{1,15}$/.test(input.method) ? input.method : null,
    url: input.url?.slice(0, 8_000) ?? null,
    protocol: parsedUrl?.protocol.replace(":", "") as NormalizedTechnicalRequest["protocol"] ?? null,
    hostname: parsedUrl?.hostname ?? null,
    path: parsedUrl ? `${parsedUrl.pathname}${parsedUrl.hash}`.slice(0, 4_000) : input.url?.startsWith("/") ? input.url.slice(0, 4_000) : null,
    queryParameters: parsedUrl ? queryRecord(parsedUrl.searchParams) : {},
    headers: input.headers,
    body: input.body,
    contentType: headerValue(input.headers, "content-type"),
    fileReferences: input.fileReferences,
    environmentVariables: [...new Set(input.input.match(/(?:\$\{?[A-Z][A-Z0-9_]*\}?|\$env:[A-Z][A-Z0-9_]*|%[A-Z][A-Z0-9_]*%|process\.env\.[A-Z][A-Z0-9_]*)/gi) ?? [])].slice(0, 50),
    shell: input.shell,
    lineContinuation: input.lineContinuation,
    duplicateHeaders: input.duplicateHeaders,
  };
}

function responseFromJson(value: TechnicalJsonValue): NormalizedTechnicalResponse {
  return {
    statusCode: numericValue(value, /status(?:_code)?/i, 100, 599),
    statusText: findStringValue(value, /status(?:_text|message)/i),
    headers: {},
    body: value,
    contentType: "application/json",
    requestId: findStringValue(value, /request[_-]?id|trace[_-]?id/i),
    errorCode: findStringValue(value, /(?:error[_-]?)?code/i),
    duplicateHeaders: [],
  };
}

function emptyRepresentation(kind: NormalizedTechnicalRepresentation["kind"]): NormalizedTechnicalRepresentation {
  return { kind, request: null, response: null, payload: null, duplicateJsonKeys: [], parserNotes: [] };
}

function headersFromPairs(pairs: Array<[string, string]>) {
  const values: Record<string, string> = {}; const duplicates: string[] = [];
  for (const [rawName, rawValue] of pairs) {
    const name = rawName.trim().toLowerCase().slice(0, 240); if (!name) continue;
    if (name in values) duplicates.push(name);
    values[name] = rawValue.trim().slice(0, 20_000);
  }
  return { values, duplicates: [...new Set(duplicates)] };
}

function parseHeaderLines(lines: string[]) {
  return headersFromPairs(lines.flatMap((line): Array<[string, string]> => {
    const index = line.indexOf(":"); return index > 0 ? [[line.slice(0, index), line.slice(index + 1)]] : [];
  }));
}

function headerValue(headers: Record<string, string>, name: string) {
  return Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] ?? null;
}

function findHeader(headers: Record<string, string>, pattern: RegExp) {
  return Object.entries(headers).find(([key]) => pattern.test(key))?.[1] ?? null;
}

function shellTokens(input: string) {
  const tokens: string[] = []; let token = ""; let quote: "'" | '"' | null = null; let escaping = false;
  for (const char of input.trim()) {
    if (escaping) { token += char; escaping = false; continue; }
    if (char === "\\" && quote !== "'") { escaping = true; continue; }
    if (quote) { if (char === quote) quote = null; else token += char; continue; }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (/\s/.test(char)) { if (token) { tokens.push(token); token = ""; } continue; }
    token += char;
  }
  if (token) tokens.push(token);
  return tokens.slice(0, 1_000);
}

function parseTechnicalUrl(value: string | null) {
  if (!value || !/^(?:https?|wss?):\/\//i.test(value)) return null;
  try { const url = new URL(value); return ["http:", "https:", "ws:", "wss:"].includes(url.protocol) ? url : null; } catch { return null; }
}

function queryRecord(params: URLSearchParams): NormalizedTechnicalRequest["queryParameters"] {
  const record: NormalizedTechnicalRequest["queryParameters"] = {};
  for (const [key, value] of params.entries()) {
    const current = record[key]; record[key] = current === undefined ? value : Array.isArray(current) ? [...current, value] : [String(current), value];
  }
  return record;
}

function formatNormalizedRequest(request: NormalizedTechnicalRequest) {
  const target = request.url ?? request.path ?? "[URL unavailable]";
  const headers = Object.entries(request.headers).map(([name, value]) => `${name}: ${value}`).join("\n");
  const body = request.body === null ? "" : typeof request.body === "string" ? request.body : JSON.stringify(request.body, null, 2);
  return [`${request.method ?? "METHOD"} ${target}`, headers, body, request.fileReferences.length ? `# Local file not read: ${request.fileReferences.join(", ")}` : ""].filter(Boolean).join("\n\n");
}

function formatNormalizedResponse(response: NormalizedTechnicalResponse) {
  const headers = Object.entries(response.headers).map(([name, value]) => `${name}: ${value}`).join("\n");
  const body = response.body === null ? "" : typeof response.body === "string" ? response.body : JSON.stringify(response.body, null, 2);
  return [`HTTP ${response.statusCode ?? "???"}${response.statusText ? ` ${response.statusText}` : ""}`, headers, body].filter(Boolean).join("\n\n");
}

function matchDeepgramEndpoint(normalized: NormalizedTechnicalRepresentation): DeepgramEndpointDefinition | null {
  const request = normalized.request; if (!request) return null;
  const deepgramHost = request.hostname ? /(^|\.)deepgram\.com$/i.test(request.hostname) : false;
  if (!deepgramHost && !request.path?.startsWith("/v1/") && !request.path?.startsWith("/v2/")) return null;
  const path = request.path?.split(/[?#]/)[0] ?? parseTechnicalUrl(request.url)?.pathname ?? "";
  const protocol = request.protocol;
  const candidates = DEEPGRAM_ENDPOINT_REGISTRY.filter((endpoint) => pathMatchesTemplate(path, endpoint.pathTemplate));
  const exact = candidates.find((endpoint) => endpoint.method === request.method && (!protocol || endpoint.protocol === protocol || (protocol === "https" && endpoint.protocol === "https")));
  if (exact) return exact;
  if (path === "/v1/listen") return protocol === "wss" || request.method === "GET" ? getDeepgramEndpoint("stt-live") ?? null : getDeepgramEndpoint("stt-prerecorded") ?? null;
  if (path === "/v2/listen") return getDeepgramEndpoint("stt-flux") ?? null;
  if (path === "/v1/speak") return protocol === "wss" || request.method === "GET" ? getDeepgramEndpoint("tts-streaming") ?? null : getDeepgramEndpoint("tts-rest") ?? null;
  return candidates[0] ?? null;
}

function pathMatchesTemplate(path: string, template: string) {
  const pattern = template.split("/").map((part) => part.startsWith("{") && part.endsWith("}") ? "[^/]+" : escapeRegExp(part)).join("/");
  return new RegExp(`^${pattern}/?$`).test(path);
}

function extractDeepgramDetails(normalized: NormalizedTechnicalRepresentation, endpoint: DeepgramEndpointDefinition | null) {
  const request = normalized.request; const response = normalized.response;
  const bodyRecord = request && isRecord(request.body) ? request.body : isRecord(normalized.payload) ? normalized.payload : {};
  const query = request?.queryParameters ?? {};
  const model = scalarString(query.model) ?? scalarString(bodyRecord.model) ?? findStringValue(response?.body ?? null, /^model$/i);
  const parameterNames = new Set(endpoint?.parameters.map((parameter) => parameter.name) ?? []);
  const features = [...new Set([...Object.keys(query), ...Object.keys(bodyRecord)].filter((name) => name !== "model" && name !== "url" && name !== "audio" && parameterNames.has(name)))].slice(0, 100);
  const statusCode = response?.statusCode ?? numericValue(normalized.payload, /status(?:_code)?/i, 100, 599);
  const errorCode = response?.errorCode ?? findStringValue(normalized.payload, /(?:error[_-]?)?code/i);
  const provider = endpoint || (request?.hostname && /(^|\.)deepgram\.com$/i.test(request.hostname)) ? "deepgram" as const : request?.hostname ? "other" as const : "unknown" as const;
  return { model, features, statusCode, errorCode, provider };
}

function validateTechnicalArtifact(normalized: NormalizedTechnicalRepresentation, artifactType: TechnicalArtifactType, secrets: SecretFinding[], endpoint: DeepgramEndpointDefinition | null, parserIssues: TechnicalValidationIssue[]) {
  const issues = [...parserIssues]; const request = normalized.request; const response = normalized.response;
  if (secrets.length) issues.push(issue("secrets", "confirmed-security-concern", "warning", `${secrets.reduce((total, finding) => total + finding.count, 0)} credential-like value(s) were redacted. Review before sharing.`, null, null, null));
  if (request?.url && !request.hostname && !request.url.startsWith("/")) issues.push(issue("malformed-url", "confirmed-syntax-problem", "error", "The request URL is malformed or uses an unsupported protocol.", "url", null, null));
  for (const header of request?.duplicateHeaders ?? response?.duplicateHeaders ?? []) issues.push(issue(`duplicate-header:${header}`, "possible-configuration-issue", "warning", `Header '${header}' appears more than once; confirm which value the client sends.`, `headers.${header}`, null, null));
  if (request?.fileReferences.length) issues.push(issue("file-reference", "requires-customer-clarification", "info", "A local file dependency was identified but was not opened, uploaded, or validated.", "body", null, null));
  if (request?.environmentVariables.length) issues.push(issue("environment-variables", "possible-configuration-issue", "info", "Unexpanded environment-variable references remain and must be configured in the target runtime.", null, null, null));
  if (endpoint && request) {
    if (request.method && request.method !== endpoint.method) issues.push(issue("method-mismatch", "possible-configuration-issue", "warning", `Observed method ${request.method} differs from the registry method ${endpoint.method} for ${endpoint.officialName}.`, "method", null, null));
    const allowed = new Set(endpoint.parameters.map((parameter) => parameter.name));
    const bodyKeys = isRecord(request.body) ? Object.keys(request.body) : [];
    for (const name of [...Object.keys(request.queryParameters), ...bodyKeys].filter((name) => !allowed.has(name))) issues.push(issue(`unknown-parameter:${name}`, "documentation-mismatch", "warning", `Parameter '${name}' is not present in the current endpoint registry; verify it against official documentation.`, name, null, null));
    const authPresent = Object.keys(request.headers).some((name) => /authorization/i.test(name));
    if (!authPresent) issues.push(issue("authentication", "requires-customer-clarification", "info", "No inline authorization header was observed. Confirm where trusted-server or temporary-token authentication is applied.", "headers.authorization", null, null));
  }
  if (request && isRecord(request.body) && request.contentType && /audio\//i.test(request.contentType)) issues.push(issue("content-type-body", "possible-configuration-issue", "warning", "A structured body is paired with an audio content type; confirm whether the request should send JSON or raw audio bytes.", "headers.content-type", null, null));
  if (response?.statusCode && response.statusCode >= 400) issues.push(issue("http-error-status", "possible-configuration-issue", "warning", `The artifact reports HTTP ${response.statusCode}; pair it with the request ID and official error documentation before diagnosing the cause.`, "statusCode", null, null));
  if (artifactType === "plain-text" || artifactType === "unknown") issues.push(issue("unstructured", "unknown", "info", "The artifact has no deterministic request or response structure. Select a more specific type if known.", null, null, null));
  return dedupeIssues(issues).slice(0, 200);
}

function validationStatus(issues: TechnicalValidationIssue[]): TechnicalArtifact["validationStatus"] {
  if (issues.some((item) => item.severity === "error")) return "invalid";
  if (issues.some((item) => item.severity === "warning" || item.classification === "confirmed-security-concern")) return "warning";
  return "valid";
}

function registryDocumentation(endpoint: DeepgramEndpointDefinition, now: string): RelatedTechnicalDocumentation {
  return { id: `registry:${endpoint.id}`, title: endpoint.officialName, canonicalUrl: endpoint.documentationUrl, whyRelevant: `This is the registered official reference for the detected ${endpoint.family} endpoint.`, supportedClaim: `${endpoint.method} ${endpoint.pathTemplate} is represented by the Lab's verified endpoint registry.`, retrievedAt: now, verificationState: "registry-verified" };
}

function buildExplanation(artifactType: TechnicalArtifactType, normalized: NormalizedTechnicalRepresentation, endpoint: DeepgramEndpointDefinition | null, secrets: SecretFinding[]) {
  return [
    `Deterministic structural analysis classified this as ${artifactType}.`,
    normalized.request ? "A request representation was extracted without executing it." : normalized.response ? "A response representation was extracted without contacting an external service." : "No executable request was created.",
    endpoint ? `The path and method align most closely with ${endpoint.officialName} in the existing endpoint registry.` : "No Deepgram endpoint registry match was confirmed.",
    secrets.length ? "Credential-like values were replaced before analysis, persistence, copy, or export." : "No credential pattern was found by the deterministic scanner; manual review is still required.",
  ];
}

function buildObserved(normalized: NormalizedTechnicalRepresentation, endpoint: DeepgramEndpointDefinition | null, extracted: ReturnType<typeof extractDeepgramDetails>, secrets: SecretFinding[]) {
  const request = normalized.request; const response = normalized.response;
  return [
    request?.method ? `Method ${request.method}` : "",
    request?.path ? `Path ${request.path}` : "",
    endpoint ? `Registry endpoint ${endpoint.id}` : "",
    extracted.model ? `Model value ${extracted.model}` : "",
    extracted.features.length ? `Parameters/features present: ${extracted.features.join(", ")}` : "",
    response?.statusCode ? `HTTP status ${response.statusCode}` : "",
    response?.requestId ? `Request ID is present (value retained only in the redacted artifact)` : "",
    secrets.length ? `${secrets.reduce((total, finding) => total + finding.count, 0)} secret finding(s) redacted` : "",
  ].filter(Boolean);
}

function buildInferred(normalized: NormalizedTechnicalRepresentation, endpoint: DeepgramEndpointDefinition | null) {
  if (!endpoint) return normalized.kind === "log" ? ["The material appears diagnostic, but the associated request is unknown."] : [];
  return [endpoint.protocol === "wss" ? "The request appears to use a realtime WebSocket path." : "The request appears to use a bounded HTTP API path."];
}

function buildRecommendations(normalized: NormalizedTechnicalRepresentation, endpoint: DeepgramEndpointDefinition | null, issues: TechnicalValidationIssue[]) {
  return [
    endpoint ? "Review the matched official endpoint documentation before accepting model or parameter compatibility." : "Identify the exact endpoint and current official documentation before testing.",
    issues.some((item) => item.classification === "confirmed-security-concern") ? "Use only the redacted representation for copy, handoff, and export." : "Review the redaction preview before sharing; deterministic scanning is not infallible.",
    normalized.request?.fileReferences.length ? "Select the intended test fixture manually in API Lab; the workbench never reads local file references." : "Hand off only supported redacted fields to API Lab and keep its visible execution confirmation intact.",
  ];
}

function defaultArtifactTitle(type: TechnicalArtifactType, endpoint: DeepgramEndpointDefinition | null, statusCode: number | null) {
  if (endpoint) return `${endpoint.officialName} ${type.replaceAll("-", " ")}`.slice(0, 300);
  if (statusCode) return `HTTP ${statusCode} ${type.replaceAll("-", " ")}`;
  return type.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export function buildTechnicalArtifactDocsQuery(artifact: TechnicalArtifact) {
  const safe = toSessionSafeTechnicalArtifact(artifact);
  const request = safe.normalizedRepresentation.request;
  const query = [
    "Find current official Deepgram documentation for this redacted technical artifact.",
    `Artifact: ${safe.artifactType}`,
    safe.extractedEndpoint ? `Registry endpoint: ${safe.extractedEndpoint}` : "",
    safe.extractedMethod ? `Observed method: ${safe.extractedMethod}` : "",
    request?.path ? `Observed path: ${request.path}` : "",
    safe.extractedModel ? `Observed model value: ${safe.extractedModel}` : "",
    safe.extractedFeatures.length ? `Observed parameters or features: ${safe.extractedFeatures.join(", ")}` : "",
    safe.extractedStatusCode ? `Observed HTTP status: ${safe.extractedStatusCode}` : "",
    safe.extractedErrorCode ? `Observed error code: ${safe.extractedErrorCode}` : "",
    "Verify endpoint behavior, authentication, supported parameters, model compatibility, errors, and the safest current implementation pattern.",
  ].filter(Boolean).join("\n");
  return redactTechnicalArtifactInput(query).value.slice(0, 2_000);
}

export function buildTechnicalArtifactDocsSearchInput(artifact: TechnicalArtifact, context: Pick<DocsSearchInput, "lanes" | "stack" | "constraints"> = { lanes: [], stack: {}, constraints: [] }): DocsSearchInput {
  return { confirmedProblem: buildTechnicalArtifactDocsQuery(artifact), lanes: context.lanes, stack: context.stack, constraints: context.constraints.slice(0, 8), desiredOutcome: "Validate the observed request structure, parameters, authentication boundary, error behavior, and current implementation guidance." };
}

export function generateTechnicalArtifactVariants(value: TechnicalArtifact | NormalizedTechnicalRepresentation): GeneratedTechnicalVariant[] {
  const normalized = "normalizedRepresentation" in value ? value.normalizedRepresentation : value;
  const request = normalized.request; if (!request?.url || !request.method) return [];
  const endpoint = matchDeepgramEndpoint(normalized);
  const code = endpoint ? codegenVariants(endpoint, request) : genericRequestVariants(request);
  return code.map((variant) => ({ ...variant, code: redactTechnicalArtifactInput(variant.code).value.slice(0, MAX_TECHNICAL_ARTIFACT_INPUT) }));
}

function codegenVariants(endpoint: DeepgramEndpointDefinition, request: NormalizedTechnicalRequest): GeneratedTechnicalVariant[] {
  const effective: DeepgramEffectiveRequest = { endpointId: endpoint.id, method: endpoint.method, protocol: endpoint.protocol, sanitizedUrl: request.url ?? `${endpoint.protocol}://api.deepgram.com${endpoint.pathTemplate}`, headers: { Authorization: "[REDACTED_SERVER_CREDENTIAL]" }, body: request.fileReferences.length ? null : request.body };
  const snippets = generateDeepgramCodeSnippets(endpoint, effective);
  return [
    variant("curl", "curl", "cURL", snippets.curl, ["DEEPGRAM_API_KEY"], request),
    variant("javascript", "javascript", "JavaScript fetch (trusted server runtime)", snippets.TypeScript, ["DEEPGRAM_API_KEY"], request),
    variant("typescript", "typescript", "TypeScript fetch (trusted server runtime)", snippets.TypeScript, ["DEEPGRAM_API_KEY"], request),
    variant("python", "python", "Python requests", snippets.Python, ["DEEPGRAM_API_KEY"], request),
    variant("raw-http", "raw-http", "Raw HTTP reference", rawHttpVariant(request), ["DEEPGRAM_API_KEY"], request),
  ];
}

function genericRequestVariants(request: NormalizedTechnicalRequest): GeneratedTechnicalVariant[] {
  const body = request.body === null ? null : typeof request.body === "string" ? request.body : JSON.stringify(request.body, null, 2);
  const auth = request.hostname && /(^|\.)deepgram\.com$/i.test(request.hostname) ? "Authorization: Token ${DEEPGRAM_API_KEY}" : "";
  const curl = [`curl --request ${request.method} \\\n  --url '${request.url}'`, auth ? `  --header '${auth}'` : "", body ? `  --header 'Content-Type: ${request.contentType ?? "application/json"}' \\\n  --data '${body.replaceAll("'", "'\\''")}'` : "", request.fileReferences.length ? "  # Local file content intentionally omitted" : ""].filter(Boolean).join(" \\\n");
  const headers = auth ? `{ Authorization: \`Token \${process.env.DEEPGRAM_API_KEY}\`${body ? `, "Content-Type": ${JSON.stringify(request.contentType ?? "application/json")}` : ""} }` : body ? `{ "Content-Type": ${JSON.stringify(request.contentType ?? "application/json")} }` : "{}";
  const javascript = `const response = await fetch(${JSON.stringify(request.url)}, {\n  method: ${JSON.stringify(request.method)},\n  headers: ${headers},${body ? `\n  body: ${JSON.stringify(body)},` : ""}\n});\n// No request was run by the workbench.\nconsole.log(await response.text());`;
  const python = `import os\nimport requests\n\nresponse = requests.request(\n    ${JSON.stringify(request.method)},\n    ${JSON.stringify(request.url)},\n    headers=${auth ? `{\"Authorization\": f\"Token {os.environ['DEEPGRAM_API_KEY']}\"}` : "{}"},${body ? `\n    data=${JSON.stringify(body)},` : ""}\n    timeout=45,\n)\nresponse.raise_for_status()`;
  return [
    variant("curl", "curl", "cURL", curl, auth ? ["DEEPGRAM_API_KEY"] : [], request),
    variant("javascript", "javascript", "JavaScript fetch (trusted server runtime)", javascript, auth ? ["DEEPGRAM_API_KEY"] : [], request),
    variant("typescript", "typescript", "TypeScript fetch (trusted server runtime)", javascript, auth ? ["DEEPGRAM_API_KEY"] : [], request),
    variant("python", "python", "Python requests", python, auth ? ["DEEPGRAM_API_KEY"] : [], request),
    variant("raw-http", "raw-http", "Raw HTTP reference", rawHttpVariant(request), auth ? ["DEEPGRAM_API_KEY"] : [], request),
  ];
}

function variant(id: string, language: GeneratedTechnicalVariant["language"], label: string, code: string, environmentVariables: string[], request: NormalizedTechnicalRequest): GeneratedTechnicalVariant {
  return { id, language, label, code, environmentVariables, notes: ["Review before use; this example was generated locally and was not executed.", ...(request.fileReferences.length ? ["Referenced file/audio bytes were intentionally omitted."] : [])] };
}

function rawHttpVariant(request: NormalizedTechnicalRequest) {
  const url = parseTechnicalUrl(request.url); const target = url ? `${url.pathname}${url.search}` : request.path ?? "/";
  const deepgram = request.hostname && /(^|\.)deepgram\.com$/i.test(request.hostname);
  const body = request.body === null ? "" : typeof request.body === "string" ? request.body : JSON.stringify(request.body, null, 2);
  return [`${request.method} ${target} HTTP/1.1`, `Host: ${request.hostname ?? "example.invalid"}`, deepgram ? "Authorization: Token ${DEEPGRAM_API_KEY}" : "", body ? `Content-Type: ${request.contentType ?? "application/json"}` : "", "", body].filter((line, index, items) => line || (index > 0 && items[index - 1] !== "")).join("\n");
}

export function buildApiLabWorkbenchHandoff(artifact: TechnicalArtifact, options: { sourceDiagnosisId?: string | null } = {}): ApiLabWorkbenchHandoff {
  const safe = toSessionSafeTechnicalArtifact(artifact); const request = safe.normalizedRepresentation.request;
  const endpoint = safe.extractedEndpoint ? getDeepgramEndpoint(safe.extractedEndpoint) : matchDeepgramEndpoint(safe.normalizedRepresentation);
  if (!request || !endpoint) throw new Error("api_lab_handoff_unavailable");
  const allowed = new Map(endpoint.parameters.filter((parameter) => parameter.location !== "header" && parameter.valueType !== "binary").map((parameter) => [parameter.name, parameter]));
  const query: ApiLabWorkbenchHandoff["query"] = {}; const body: Record<string, TechnicalJsonValue> = {}; const transferredFields: string[] = []; const notTransferred: string[] = [];
  for (const [name, value] of Object.entries(request.queryParameters)) {
    const parameter = allowed.get(name);
    if (parameter?.location === "query") { query[name] = value; transferredFields.push(`query.${name}`); }
    else notTransferred.push(`Query parameter '${name}' is not supported by the selected API Lab operation.`);
  }
  if (isRecord(request.body)) {
    for (const [name, value] of Object.entries(request.body)) {
      const parameter = allowed.get(name);
      if (parameter?.location === "body") { body[name] = value as TechnicalJsonValue; transferredFields.push(`body.${name}`); }
      else notTransferred.push(`Body field '${name}' is not supported by the selected API Lab operation.`);
    }
  } else if (request.body !== null) notTransferred.push("The non-object request body was not transferred.");
  if (request.fileReferences.length) notTransferred.push("Local file references were not transferred or opened.");
  if (request.environmentVariables.length) notTransferred.push("Shell and environment-variable references were not transferred.");
  for (const name of Object.keys(request.headers)) if (!/^content-type$/i.test(name) && !/^authorization$/i.test(name)) notTransferred.push(`Custom header '${name}' was not transferred.`);
  return apiLabWorkbenchHandoffSchema.parse({
    schemaVersion: 1,
    source: "payload-code-workbench",
    artifactId: safe.id,
    sourceDiagnosisId: options.sourceDiagnosisId?.slice(0, 200) || null,
    endpointId: endpoint.id,
    method: request.method ?? endpoint.method,
    query,
    body,
    headers: { ...(request.contentType ? { "content-type": request.contentType } : {}), authorization: "Token ${DEEPGRAM_API_KEY}" },
    transferredFields,
    notTransferred: [...new Set(notTransferred)],
    authentication: "server-placeholder-only",
    demoModePreserved: true,
    autoExecute: false,
    requiresVisibleConfirmation: true,
    href: `/?module=api-studio&operation=${encodeURIComponent(endpoint.id)}&source=payload-workbench`,
  });
}

export function toSessionSafeTechnicalArtifact(value: unknown): TechnicalArtifact {
  const initial = technicalArtifactSchema.parse({ ...(isRecord(value) ? value : {}), rawInput: null });
  const extraFindings: SecretFinding[] = [];
  const redacted = redactUnknownStrings(initial, extraFindings) as TechnicalArtifact;
  const findings = dedupeSecretFindings([...initial.secretFindings, ...extraFindings]);
  return technicalArtifactSchema.parse({ ...redacted, rawInput: null, secretFindings: findings });
}

export function serializeTechnicalArtifact(value: unknown) { return JSON.stringify(toSessionSafeTechnicalArtifact(value)); }
export function parseTechnicalArtifact(value: string | null) { try { return toSessionSafeTechnicalArtifact(JSON.parse(value ?? "null")); } catch { return null; } }
export function serializeTechnicalArtifactSession(items: unknown[]) { return JSON.stringify(technicalArtifactSessionSchema.parse({ schemaVersion: 1, artifacts: items.map(toSessionSafeTechnicalArtifact) })); }
export function parseTechnicalArtifactSession(value: string | null) { try { const raw = JSON.parse(value ?? "null"); const parsed = technicalArtifactSessionSchema.safeParse(raw); return parsed.success ? parsed.data.artifacts.map(toSessionSafeTechnicalArtifact) : null; } catch { return null; } }

export function technicalArtifactToMarkdown(value: unknown) {
  const artifact = toSessionSafeTechnicalArtifact(value); if (!artifact.includeInExport) return "";
  const code = (artifact.formattedInput || artifact.redactedInput).slice(0, 30_000).replace(/```/g, "` ` `");
  const docs = artifact.relatedDocumentation.slice(0, 3).map((item) => `- [${markdownText(item.title)}](${item.canonicalUrl}) - ${markdownText(item.whyRelevant)} (${item.verificationState})`).join("\n");
  const issues = artifact.validationErrors.slice(0, 5).map((item) => `- **${markdownText(item.classification)}:** ${markdownText(item.message)}`).join("\n");
  return [
    `### ${markdownText(artifact.title)}`,
    `**Type:** ${artifact.artifactType}  \n**Method:** ${artifact.extractedMethod ? `\`${inlineCode(artifact.extractedMethod)}\`` : "Not observed"}  \n**Endpoint:** ${artifact.extractedEndpoint ? `\`${inlineCode(artifact.extractedEndpoint)}\`` : "Unknown"}  \n**Model:** ${artifact.extractedModel ? `\`${inlineCode(artifact.extractedModel)}\`` : "Not observed"}  \n**Validation:** ${artifact.validationStatus}; ${artifact.secretFindings.length ? `${artifact.secretFindings.length} secret finding(s) redacted` : "no deterministic secret finding"}`,
    `\`\`\`${artifact.detectedLanguage === "plain-text" || artifact.detectedLanguage === "unknown" ? "text" : artifact.detectedLanguage}\n${code}\n\`\`\``,
    issues ? `**Deterministic validation**\n\n${issues}` : "",
    artifact.takeaway ? `**Takeaway:** ${markdownText(artifact.takeaway)}` : "",
    docs ? `**Official documentation**\n\n${docs}` : "",
  ].filter(Boolean).join("\n\n");
}

function redactUnknownStrings(value: unknown, findings: SecretFinding[], seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") { const result = redactTechnicalArtifactInput(value); findings.push(...result.findings); return result.value; }
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[circular content omitted]"; seen.add(value);
  const redacted = Array.isArray(value)
    ? value.map((item) => redactUnknownStrings(item, findings, seen))
    : Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, redactUnknownStrings(child, findings, seen)]));
  seen.delete(value);
  return redacted;
}

function dedupeSecretFindings(findings: SecretFinding[]) {
  const grouped = new Map<string, SecretFinding>();
  for (const finding of findings) {
    const current = grouped.get(finding.id);
    grouped.set(finding.id, current ? { ...current, count: Math.min(1_000, current.count + finding.count), lines: [...new Set([...current.lines, ...finding.lines])].slice(0, 50) } : finding);
  }
  return [...grouped.values()].slice(0, 100);
}

function issue(id: string, classification: TechnicalValidationIssue["classification"], severity: TechnicalValidationIssue["severity"], message: string, path: string | null, line: number | null, column: number | null): TechnicalValidationIssue { return { id, classification, severity, message, path, line, column }; }
function dedupeIssues(issues: TechnicalValidationIssue[]) { return [...new Map(issues.map((item) => [item.id, item])).values()]; }
function safeFileReference(value: string) { const name = value.replaceAll("\\", "/").split("/").at(-1)?.trim(); return name ? `[LOCAL_FILE:${name.slice(0, 200)}]` : "[LOCAL_FILE]"; }
function scalarString(value: unknown) { return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : null; }
function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function tryParseJson(value: string): { ok: true; value: TechnicalJsonValue } | { ok: false; message: string } { try { return { ok: true, value: JSON.parse(value) as TechnicalJsonValue }; } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Invalid JSON." }; } }
function detectDuplicateJsonKeys(input: string) { const counts = new Map<string, number>(); for (const match of input.matchAll(/"((?:\\.|[^"\\])+)"\s*:/g)) counts.set(match[1], (counts.get(match[1]) ?? 0) + 1); return [...counts].filter(([, count]) => count > 1).map(([key]) => key).slice(0, 100); }
function proposeJsonRepair(input: string) { const candidate = input.replace(/,\s*([}\]])/g, "$1"); const parsed = candidate !== input ? tryParseJson(candidate) : null; return parsed?.ok ? JSON.stringify(parsed.value, null, 2) : null; }
function jsonErrorLocation(input: string, message: string) { const offset = Number(message.match(/position\s+(\d+)/i)?.[1]); if (!Number.isFinite(offset)) return { line: null, column: null }; const before = input.slice(0, offset); const lines = before.split(/\r?\n/); return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 }; }
function findStringValue(value: unknown, keyPattern: RegExp, depth = 0): string | null { if (depth > 8 || !value || typeof value !== "object") return null; for (const [key, child] of Object.entries(value as Record<string, unknown>)) { if (keyPattern.test(key) && (typeof child === "string" || typeof child === "number")) return String(child).slice(0, 500); const nested = findStringValue(child, keyPattern, depth + 1); if (nested) return nested; } return null; }
function numericValue(value: unknown, keyPattern: RegExp, min: number, max: number, depth = 0): number | null { if (depth > 8 || !value || typeof value !== "object") return null; for (const [key, child] of Object.entries(value as Record<string, unknown>)) { const number = typeof child === "number" ? child : typeof child === "string" ? Number(child) : Number.NaN; if (keyPattern.test(key) && Number.isInteger(number) && number >= min && number <= max) return number; const nested = numericValue(child, keyPattern, min, max, depth + 1); if (nested !== null) return nested; } return null; }
function markdownText(value: string) { return redactTechnicalArtifactInput(value).value.replace(/[<>]/g, "").replace(/\]\(/g, "] ( ").slice(0, 2_000); }
function inlineCode(value: string) { return redactTechnicalArtifactInput(value).value.replace(/`/g, "").slice(0, 1_000); }
