import {
  getCodeLabWorkflow,
  type CodeLabFile,
  type CodeLabLanguage,
  type CodeLabWorkflowId,
} from "@/lib/code-lab-files";
import type {
  CodeLabLaunchContext,
  CodeLabLaunchFile,
  CodeLabLaunchProjectEntry,
  CodeLabLaunchSemanticRegion,
} from "@/types/code-lab-launch-context";
import type {
  PolyglotFocus,
  QuestCodeExample,
  QuestNode,
  QuestlineLanguageId,
} from "@/types/questline";

type QuestlineLaunchOptions = {
  id?: string;
  createdAt?: string;
  exampleIndex?: number;
  framework?: string;
  runtime?: string;
  ide?: string;
  operatingSystem?: string;
  audioSource?: string;
};

type CodeLabProjectLayer = CodeLabLaunchProjectEntry["layer"];
type CodeLabSemanticRegion = CodeLabLaunchSemanticRegion;
type CodeLabSemanticRegionType = CodeLabLaunchSemanticRegion["type"];

const WORKFLOW_CAPABILITIES: Record<CodeLabWorkflowId, string[]> = {
  "audio-signal": ["Local audio analysis", "Offline variants", "Explicit cleanup"],
  "transcribe-url": ["Speech to Text", "Prerecorded URL transcription"],
  "upload-audio": ["Speech to Text", "Prerecorded file transcription"],
  "live-mic": ["Speech to Text", "Realtime streaming", "Temporary token auth"],
  tts: ["Text to Speech", "Audio byte response"],
  "text-intelligence": ["Text Intelligence", "Conversation analysis"],
  "temporary-token": ["Auth grant", "Temporary browser token"],
  "voice-agent": ["Voice Agent", "WebSocket lifecycle", "Tool calling concept"],
  "trusted-voice": ["Text to Speech", "Consent-first voice output"],
};

const WORKFLOW_TRANSPORT: Record<CodeLabWorkflowId, string> = {
  "audio-signal": "Local browser audio graph",
  "transcribe-url": "REST JSON",
  "upload-audio": "REST binary upload",
  "live-mic": "WebSocket",
  tts: "REST JSON with audio-byte response",
  "text-intelligence": "REST JSON",
  "temporary-token": "REST JSON",
  "voice-agent": "WebSocket concept",
  "trusted-voice": "REST JSON with audio-byte response",
};

const WORKFLOW_AUDIO_SOURCE: Partial<Record<CodeLabWorkflowId, string>> = {
  "audio-signal": "Browser microphone, file, or generated fixture",
  "transcribe-url": "Hosted audio URL",
  "upload-audio": "Local audio file",
  "live-mic": "Browser microphone",
  "voice-agent": "Realtime conversation audio",
};

const WORKFLOW_OUTPUT: Record<CodeLabWorkflowId, string> = {
  "audio-signal": "Measured signal summary and copied offline fixture",
  "transcribe-url": "Transcript JSON",
  "upload-audio": "Transcript JSON",
  "live-mic": "Interim and final transcript events",
  tts: "Playable audio bytes",
  "text-intelligence": "Structured analysis JSON",
  "temporary-token": "Short-lived in-memory credential",
  "voice-agent": "Conversation events and audio output",
  "trusted-voice": "Consent-gated audio bytes",
};

export function createQuestlineCodeLabLaunchContext(
  node: QuestNode,
  language: QuestlineLanguageId,
  options: QuestlineLaunchOptions = {},
): CodeLabLaunchContext {
  const codeLabLanguage = toCodeLabLanguage(language);
  const workflow = getCodeLabWorkflow(node.relatedCodeLabWorkflowId);
  const example = selectExample(node.codeExamples, language, options.exampleIndex ?? 0);
  const files = buildLaunchFiles(workflow.filesByLanguage[codeLabLanguage], example, codeLabLanguage);
  const createdAt = options.createdAt ?? new Date().toISOString();
  const runtimeDefaults = runtimeProfile(language);

  return {
    id: options.id ?? createLaunchId(node.id),
    createdAt,
    source: "questline",
    sourceId: node.id,
    language: codeLabLanguage,
    framework: options.framework ?? runtimeDefaults.framework,
    runtime: options.runtime ?? runtimeDefaults.runtime,
    ide: options.ide ?? runtimeDefaults.ide,
    operatingSystem: options.operatingSystem ?? "Windows",
    workflow: {
      id: workflow.id,
      title: workflow.title,
      description: workflow.description,
      deepgramCapabilities: WORKFLOW_CAPABILITIES[workflow.id],
      transport: WORKFLOW_TRANSPORT[workflow.id],
      audioSource: options.audioSource ?? WORKFLOW_AUDIO_SOURCE[workflow.id],
      outputDestination: WORKFLOW_OUTPUT[workflow.id],
    },
    projectTree: files.map((file) => ({
      path: file.path,
      role: file.role,
      layer: normalizeLayer(file.layer),
      editable: !file.path.toLowerCase().includes("lock"),
      generated: true,
    })),
    files,
    lessonNotes: [
      { title: "First principles", body: node.firstPrinciplesConcept, category: "first-principles" },
      { title: "Runtime model", body: node.expectedMentalModel, category: "runtime" },
      { title: "Audio boundary", body: node.relatedAudioConcept, category: "audio" },
      { title: "Debugging clue", body: node.debuggingClue, category: "debugging" },
      { title: "Production validation", body: node.completionCriteria.join(" "), category: "production" },
      { title: "Client impact", body: node.clientScenario, category: "client-impact" },
      {
        title: "Secret boundary",
        body: "DEEPGRAM_API_KEY stays in a trusted server or local runtime. Browser examples use local routes or a short-lived in-memory token.",
        category: "security",
      },
    ],
    securityWarnings: unique([
      "Generated code is educational and is never executed by Code Lab.",
      "Use placeholders only. Never paste a permanent key or temporary token into the editor, browser storage, URL, inspector, or export.",
      ...files.flatMap((file) => securityNotesForPath(file.path, workflow.filesByLanguage[codeLabLanguage])),
    ]),
    environmentVariables: collectEnvironmentVariables(files),
    relatedApiStudioOperationId: node.relatedApiOperationId,
    relatedQuestNodeId: node.id,
  };
}

export function toCodeLabLanguage(language: QuestlineLanguageId): CodeLabLanguage {
  if (language === "python") return "Python";
  if (language === "go") return "Go";
  if (language === "csharp") return ".NET";
  if (language === "powershell" || language === "shell") return "Shell";
  return "TypeScript";
}

function buildLaunchFiles(
  starterFiles: CodeLabFile[],
  example: QuestCodeExample | undefined,
  language: CodeLabLanguage,
): CodeLabLaunchFile[] {
  const files = starterFiles.map((file) => codeLabFileToLaunchFile(file));
  let recommendedEntry: CodeLabLaunchFile | undefined;
  if (example) {
    const exampleFile: CodeLabLaunchFile = {
      path: normalizePath(example.filename),
      language,
      content: example.code,
      originalContent: example.code,
      role: `${example.title}. ${example.notes.join(" ")}`,
      layer: layerForRuntime(example.runtime),
      semanticRegions: regionsForExample(example),
    };
    const duplicateIndex = files.findIndex((file) => file.path.toLowerCase() === exampleFile.path.toLowerCase());
    if (duplicateIndex >= 0) files.splice(duplicateIndex, 1);
    recommendedEntry = exampleFile;
  }

  const supportingFiles = files.sort(
    (left, right) => filePriority(left) - filePriority(right) || left.path.localeCompare(right.path),
  );
  return recommendedEntry ? [recommendedEntry, ...supportingFiles] : supportingFiles;
}

function codeLabFileToLaunchFile(file: CodeLabFile): CodeLabLaunchFile {
  return {
    path: normalizePath(file.path),
    language: file.language,
    content: file.code,
    originalContent: file.code,
    role: file.role,
    layer: layerForSide(file.side),
    semanticRegions: inferSemanticRegions(file.code, file.path),
  };
}

function regionsForExample(example: QuestCodeExample) {
  const explicit = Object.entries(example.regions).flatMap(([focus, lines]) => {
    if (!lines) return [];
    const type = semanticTypeForFocus(focus as PolyglotFocus);
    return [makeRegion(example.filename, type, lines[0], lines[1])];
  });
  return explicit.length ? explicit : inferSemanticRegions(example.code, example.filename);
}

function inferSemanticRegions(content: string, path: string): CodeLabSemanticRegion[] {
  const lines = content.split("\n");
  const definitions: Array<{ type: CodeLabSemanticRegionType; patterns: RegExp[] }> = [
    { type: "authentication", patterns: [/authorization/i, /deepgram_api_key/i, /api\/deepgram\/token/i] },
    { type: "configuration", patterns: [/process\.env/i, /os\.environ/i, /getenvironmentvariable/i, /^deepgram_api_key/i, /searchparams\.set/i] },
    { type: "request", patterns: [/\bfetch\(/i, /requests\.(?:post|get)/i, /http\.newrequest/i, /httpclient/i, /invoke-restmethod/i, /curl/i] },
    { type: "audio-input", patterns: [/getusermedia/i, /mediarecorder/i, /readfile/i, /openread/i, /formdata/i] },
    { type: "audio-send", patterns: [/\.send\(/i, /sendasync/i, /writeall/i, /audio.*chunk/i] },
    { type: "event-receive", patterns: [/addEventListener\(["']message/i, /onmessage/i, /receiveasync/i, /readmessage/i] },
    { type: "response-parse", patterns: [/\.json\(/i, /json\.loads/i, /jsondocument/i, /alternatives\]\[0\]/i, /transcript/i] },
    { type: "error-handling", patterns: [/if \(!?response\.ok/i, /raise_for_status/i, /catch \(/i, /throw new error/i, /statuscode/i] },
    { type: "cleanup", patterns: [/\.close\(/i, /\.stop\(/i, /dispose/i, /defer .*close/i, /finally/i] },
    { type: "testing", patterns: [/\btest\(/i, /\bit\(/i, /pytest/i, /assert/i, /xunit/i] },
    { type: "observability", patterns: [/request_id/i, /console\.(?:log|error)/i, /logger/i, /duration/i, /trace/i] },
  ];

  return definitions.flatMap(({ type, patterns }) => {
    const indexes = lines.flatMap((line, index) => patterns.some((pattern) => pattern.test(line)) ? [index + 1] : []);
    if (!indexes.length) return [];
    return [makeRegion(path, type, Math.min(...indexes), Math.max(...indexes))];
  });
}

function makeRegion(path: string, type: CodeLabSemanticRegionType, startLine: number, endLine: number): CodeLabSemanticRegion {
  const labels: Record<CodeLabSemanticRegionType, string> = {
    authentication: "Authentication",
    configuration: "Configuration",
    request: "Build request",
    "audio-input": "Audio input",
    "audio-send": "Send audio",
    "event-receive": "Receive events",
    "response-parse": "Parse response",
    "error-handling": "Error handling",
    cleanup: "Cleanup",
    testing: "Testing",
    observability: "Observability",
  };
  return {
    id: `${slug(path)}-${type}`,
    label: labels[type],
    type,
    startLine: Math.max(1, startLine),
    endLine: Math.max(startLine, endLine),
    explanation: semanticExplanation(type),
  };
}

function semanticExplanation(type: CodeLabSemanticRegionType) {
  const explanations: Record<CodeLabSemanticRegionType, string> = {
    authentication: "This boundary obtains or applies credentials. Permanent keys remain in trusted runtimes; browser tokens remain short-lived and in memory.",
    configuration: "Configuration describes the request without embedding secret values in source code.",
    request: "This block constructs and sends the HTTP or WebSocket request contract.",
    "audio-input": "This block obtains audio bytes or a reference to audio and must preserve the real format metadata.",
    "audio-send": "This block moves bounded binary chunks while respecting socket state, cancellation, and backpressure.",
    "event-receive": "This block receives asynchronous server events and must preserve ordering and lifecycle evidence.",
    "response-parse": "This block parses the documented response shape and extracts useful fields only after status validation.",
    "error-handling": "This block turns transport and API failures into diagnosable, non-secret evidence.",
    cleanup: "This block releases sockets, streams, tracks, timers, and other resources exactly once.",
    testing: "This block verifies request construction and failure behavior without requiring a live credential.",
    observability: "This block records request IDs, timing, and outcomes while redacting credentials and sensitive payloads.",
  };
  return explanations[type];
}

function semanticTypeForFocus(focus: PolyglotFocus): CodeLabSemanticRegionType {
  const map: Record<PolyglotFocus, CodeLabSemanticRegionType> = {
    setup: "configuration",
    authentication: "authentication",
    request: "request",
    "send-audio": "audio-send",
    "receive-event": "event-receive",
    parsing: "response-parse",
    errors: "error-handling",
    cleanup: "cleanup",
    testing: "testing",
  };
  return map[focus];
}

function collectEnvironmentVariables(files: CodeLabLaunchFile[]) {
  const joined = files.map((file) => file.content).join("\n");
  return /DEEPGRAM_API_KEY/.test(joined)
    ? [{ name: "DEEPGRAM_API_KEY", placeholder: "DEEPGRAM_API_KEY", location: ".env.local or a trusted runtime secret manager", serverOnly: true }]
    : [];
}

function securityNotesForPath(path: string, starters: CodeLabFile[]) {
  return starters.find((file) => file.path === path)?.securityNotes ?? [];
}

function selectExample(examples: QuestCodeExample[], language: QuestlineLanguageId, requestedIndex: number) {
  const sameLanguage = examples.filter((example) => example.language === language);
  const candidates = sameLanguage.length ? sameLanguage : examples;
  return candidates[Math.min(requestedIndex, Math.max(0, candidates.length - 1))];
}

function layerForSide(side: CodeLabFile["side"]): CodeLabProjectLayer {
  if (side === "Client-side") return "client";
  if (side === "Server-side" || side === "CLI") return "server";
  if (side === "Config") return "config";
  return "shared";
}

function layerForRuntime(runtime: QuestCodeExample["runtime"]): CodeLabProjectLayer {
  if (runtime === "browser") return "client";
  if (runtime === "server" || runtime === "cli" || runtime === "native" || runtime === "database") return "server";
  return "shared";
}

function normalizeLayer(layer: string): CodeLabProjectLayer {
  return (["client", "server", "shared", "config", "test", "docs"] as const).includes(layer as CodeLabProjectLayer)
    ? (layer as CodeLabProjectLayer)
    : "shared";
}

function runtimeProfile(language: QuestlineLanguageId) {
  const profiles: Partial<Record<QuestlineLanguageId, { framework?: string; runtime: string; ide: string }>> = {
    typescript: { framework: "Next.js", runtime: "Browser and Node.js", ide: "VSCodium / VS Code" },
    react: { framework: "React / Next.js", runtime: "Browser and Node.js", ide: "VSCodium / VS Code" },
    python: { framework: "Python service", runtime: "Python interpreter", ide: "VSCodium / VS Code" },
    go: { framework: "net/http service", runtime: "Compiled Go binary", ide: "GoLand or VSCodium" },
    csharp: { framework: "ASP.NET", runtime: ".NET", ide: "Visual Studio" },
    powershell: { framework: "PowerShell diagnostic script", runtime: "PowerShell", ide: "Windows Terminal / VSCodium" },
    shell: { framework: "CLI diagnostic script", runtime: "Bash-compatible shell", ide: "Terminal / VSCodium" },
  };
  return profiles[language] ?? { runtime: "Conceptual bridge runtime", ide: "VSCodium / VS Code" };
}

function filePriority(file: CodeLabLaunchFile) {
  if (file.layer === "client" || file.layer === "server") return 0;
  if (file.layer === "test") return 1;
  if (file.layer === "shared") return 2;
  return 3;
}

function createLaunchId(sourceId: string) {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `questline-${slug(sourceId)}-${random}`;
}

function normalizePath(path: string) {
  return path.replaceAll("\\", "/").replace(/^\/+/, "").replace(/(?:^|\/)\.\.(?:\/|$)/g, "");
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}
