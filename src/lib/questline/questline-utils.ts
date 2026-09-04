import { sanitizeAppliedExport } from "@/lib/applied-voice/academy";
import {
  looksLikeRealApiKey,
  readLocalJson,
  sanitizeSnippetForExport,
  writeLocalJson,
} from "@/lib/code-lab-storage";
import { sanitizeSnippet } from "@/lib/code-lab-launch-context";
import { getLanguageTrack } from "@/lib/questline/language-tracks";
import type {
  CapstoneProject,
  ClientIncident,
  PolyglotWorkflow,
  QuestProgress,
  QuestStatus,
  QuestlineLanguageId,
  StackAdapterInput,
  StackRecommendation,
} from "@/types/questline";

export const QUESTLINE_STORAGE_KEY = "deepgram-applied-engineering-questline:v1";

export const DEFAULT_QUEST_PROGRESS: QuestProgress = {
  questStatuses: {},
  questsViewed: [],
  challengesAttempted: [],
  challengesCompleted: [],
  hintsUsed: {},
  incidentsSolved: [],
  audioLessonsCompleted: [],
  capstonesStarted: [],
  capstonesCompleted: [],
  masteryRequirementIds: [],
  notes: "",
  confidenceRating: 3,
};

const QUEST_STATUSES = new Set<QuestStatus>(["not-started", "practiced", "needs-review", "completed"]);
const HINT_LEVELS = new Set<QuestProgress["hintsUsed"][string]>(["none", "concept", "syntax", "next-line", "full-solution"]);

export function normalizeQuestProgress(value: unknown): QuestProgress {
  if (!isRecord(value)) return structuredClone(DEFAULT_QUEST_PROGRESS);

  const questStatuses = isRecord(value.questStatuses)
    ? Object.fromEntries(
        Object.entries(value.questStatuses)
          .filter((entry): entry is [string, QuestStatus] => typeof entry[0] === "string" && QUEST_STATUSES.has(entry[1] as QuestStatus))
          .slice(0, 500),
      )
    : {};
  const hintsUsed = isRecord(value.hintsUsed)
    ? Object.fromEntries(
        Object.entries(value.hintsUsed)
          .filter((entry): entry is [string, QuestProgress["hintsUsed"][string]] => typeof entry[0] === "string" && HINT_LEVELS.has(entry[1] as QuestProgress["hintsUsed"][string]))
          .slice(0, 500),
      )
    : {};

  return {
    questStatuses,
    questsViewed: stringList(value.questsViewed),
    challengesAttempted: stringList(value.challengesAttempted),
    challengesCompleted: stringList(value.challengesCompleted),
    hintsUsed,
    incidentsSolved: stringList(value.incidentsSolved),
    audioLessonsCompleted: stringList(value.audioLessonsCompleted),
    capstonesStarted: stringList(value.capstonesStarted),
    capstonesCompleted: stringList(value.capstonesCompleted),
    masteryRequirementIds: stringList(value.masteryRequirementIds),
    notes: typeof value.notes === "string" ? value.notes.slice(0, 20_000) : "",
    confidenceRating: clampNumber(value.confidenceRating, 1, 5, 3),
  };
}

/**
 * Sanitizes any Questline persistence/export value without mutating the source.
 * It combines the Academy's recursive credential/raw-audio handling with the
 * Code Lab's code-string sanitizer so prose and snippets share one guardrail.
 */
export function sanitizeQuestlineExport<T>(value: T): T {
  const sanitized = sanitizeAppliedExport(value);

  function walk(current: unknown): unknown {
    if (typeof current === "string") return sanitizeSnippet(sanitizeSnippetForExport(current));
    if (Array.isArray(current)) return current.map(walk);
    if (!current || typeof current !== "object") return current;
    if (current instanceof ArrayBuffer || ArrayBuffer.isView(current)) return "[binary data omitted]";
    return Object.fromEntries(Object.entries(current as Record<string, unknown>).map(([key, child]) => [key, walk(child)]));
  }

  return walk(sanitized) as T;
}

export function loadQuestProgress(): QuestProgress {
  const stored = readLocalJson<unknown>(QUESTLINE_STORAGE_KEY, null);
  if (!stored) return structuredClone(DEFAULT_QUEST_PROGRESS);
  const serialized = safeStringify(stored);
  if (looksLikeRealApiKey(serialized)) return structuredClone(DEFAULT_QUEST_PROGRESS);
  return normalizeQuestProgress(sanitizeQuestlineExport(stored));
}

export function saveQuestProgress(progress: QuestProgress) {
  const normalized = normalizeQuestProgress(progress);
  const serialized = safeStringify(normalized);
  if (looksLikeRealApiKey(serialized)) return false;
  return writeLocalJson(QUESTLINE_STORAGE_KEY, sanitizeQuestlineExport(normalized));
}

export function generateStackRecommendation(input: StackAdapterInput): StackRecommendation {
  const safe = sanitizeQuestlineExport(input);
  const track = getLanguageTrack(safe.language);
  const realtime = /websocket|webrtc|live|microphone|sip|rtp|pstn/i.test(`${safe.transport} ${safe.audioSource}`);
  const browser = /browser|react|next/i.test(`${safe.framework} ${safe.audioSource}`);
  const batch = /batch|upload|hosted|file/i.test(`${safe.transport} ${safe.audioSource}`);
  const unknowns = Object.entries(safe).filter(([, value]) => !String(value).trim() || /unknown/i.test(String(value))).map(([key]) => key);
  const projectStructure = projectTreeFor(safe.language, safe.framework);
  const status: StackRecommendation["status"] =
    track.docsStatus === "docs-verification-required" || unknowns.length > 0
      ? "docs-verification-required"
      : track.docsStatus === "conceptual"
        ? "conceptual"
        : "simulated";

  return sanitizeQuestlineExport({
    summary: `${track.label} + ${safe.framework} on ${safe.operatingSystem}: place Deepgram at a trusted ${browser ? "client/server" : "service"} boundary, model ${realtime ? "stream lifecycle and cancellation" : "bounded request/response"} explicitly, and verify the exact client constraints before implementation.`,
    projectStructure,
    dependencyApproach: [
      track.runtime.dependencyModel,
      "Begin with raw REST and existing guarded local routes; add a provider SDK only after checking current official support and versioned examples.",
      "Pin or lock dependencies and record runtime/tool versions in the incident runbook.",
    ],
    environmentSetup: [
      `Confirm ${safe.ide} uses the intended ${track.label} runtime/toolchain and working directory.`,
      "Store DEEPGRAM_API_KEY in a trusted process environment or secret manager; never expose it to browser code or localStorage.",
      `Verify ${safe.deploymentPlatform} network, certificate, proxy, port, and environment-variable behavior.`,
      ...(unknowns.length ? [`Resolve unknown discovery fields before production: ${unknowns.join(", ")}.`] : []),
    ],
    deepgramIntegrationPoint: browser
      ? ["Browser calls authenticated customer-owned routes for REST work.", "Realtime browser sessions use only the existing verified temporary-token flow; the permanent key stays server-side."]
      : ["A trusted service/CLI adapter constructs the raw REST request and attaches DEEPGRAM_API_KEY from its environment.", "Provider-specific request and response mapping stays behind one testable adapter."],
    audioHandling: [
      `Treat ${safe.audioSource} as a byte/format contract: inventory container, encoding, sample rate, channels, duration, and actual MIME.`,
      realtime ? "Use bounded immutable chunks, measure chunk timing, and define backpressure before load testing." : "Stream or bound file bodies; do not decode binary audio as text or include raw bytes in JSON diagnostics.",
      "Separate capture/conversion problems from model-quality evaluation.",
    ],
    concurrencyPattern: [
      track.runtime.concurrencyModel,
      realtime ? "Give capture/send/receive/tool/TTS work one session cancellation scope and bounded queues." : "Use explicit request deadlines; move long batch work out of interactive request latency when needed.",
      `Validate expected concurrency: ${safe.concurrency || "not supplied"}.`,
    ],
    cancellationPattern: [
      ...track.runtime.cleanupResponsibilities,
      "Propagate cancellation through every I/O and tool boundary; distinguish it from provider failure.",
      "Stop capture before destroying shared state; close each resource exactly once.",
    ],
    errorHandling: [
      "Check transport/HTTP status before parsing a success shape.",
      "Capture sanitized status, request/session ID when returned, timing, MIME/byte counts, and close evidence.",
      "Retry only bounded safe failures; business-changing tools require idempotency and confirmation.",
      "Make uncertainty and human fallback visible to the user.",
    ],
    testingStrategy: [
      "Unit-test payload construction, transcript extraction, validation, redaction, and retry decisions.",
      `Integration-test the ${batch ? "file/URL route" : realtime ? "token and event lifecycle" : "selected request path"} with mocked provider responses.`,
      "Use deterministic silence, clipping, MIME/format, timeout, duplicate, and cancellation fixtures where relevant.",
      "Evaluate representative language, accent, vocabulary, channel, noise, and duration segments with human review.",
    ],
    deploymentNotes: [
      `${safe.deploymentPlatform} must inject secrets at runtime and preserve a clear browser/service/provider network boundary.`,
      "Container localhost, reverse-proxy WebSocket timeouts, TLS roots, egress policy, and graceful shutdown require environment-specific tests.",
      `Storage choice: ${safe.storage || "not supplied"}; define tenant isolation, indexes, encryption, retention, and deletion before persistence.`,
      "Self-hosted, regional, residency, and compliance claims require customer security/legal review and official product validation.",
    ],
    likelyPitfalls: unique([
      ...pitfallsFor(safe.language),
      ...(browser ? ["Permanent key or server-only module enters the browser bundle", "Media capture or WebSocket resource survives component unmount"] : []),
      ...(realtime ? ["Send occurs before OPEN", "Cancellation or backpressure is ignored", "Reverse proxy closes upgraded connection"] : []),
      ...(batch ? ["Upload/body limit rejects data before application code", "Content type does not describe the bytes"] : []),
      `Downstream ${safe.downstreamSystem || "system"} action lacks validation, idempotency, or minimum-data controls.`,
    ]),
    discoveryQuestions: [
      "What exact business outcome and user journey define success?",
      "What are the actual audio container, encoding, sample rate, channel, duration, language/accent, noise, and concurrency distributions?",
      "Which component captures audio, owns transport, calls Deepgram, executes tools, stores output, and performs human fallback?",
      `How does ${safe.downstreamSystem || "the downstream system"} authenticate, deduplicate, fail, and expose evidence?`,
      `Which security requirements are contractual versus assumptions? Current input: ${safe.securityRequirements || "not supplied"}.`,
      "What latency, quality, reliability, retention, residency, and rollback criteria must the POC prove?",
    ],
    reasons: [
      {
        recommendation: "Keep the provider boundary behind one adapter",
        why: "It makes authentication, timeouts, response mapping, redaction, and tests consistent across the client stack.",
        assumption: `${safe.framework} has a trusted server/service/CLI execution boundary.`,
        validate: "Trace the deployed process and bundle boundaries; confirm where environment variables are actually available.",
      },
      {
        recommendation: realtime ? "Model session cancellation and backpressure first" : "Model request/body/status contracts first",
        why: realtime ? "Long-lived voice sessions fail through lifecycle interactions that a happy-path socket example hides." : "Most batch failures are visible in body type, MIME, status, timeout, or response-path evidence.",
        assumption: `The selected transport is ${safe.transport}.`,
        validate: "Run deterministic failure fixtures through the same deployed path the customer will use.",
      },
      {
        recommendation: "Use raw REST as the polyglot baseline",
        why: "It teaches the shared system contract without inventing SDK packages or methods and remains comparable across languages.",
        assumption: "The customer can use an HTTP client in the trusted runtime.",
        validate: "Check current official Deepgram docs for endpoint, parameter, language/model, event, and SDK availability before production implementation.",
      },
    ],
    status,
  });
}

export function serializeProgressJson(progress: QuestProgress) {
  return JSON.stringify(sanitizeQuestlineExport(normalizeQuestProgress(progress)), null, 2);
}

export function serializeLearningNotesMarkdown(progress: QuestProgress) {
  const safe = sanitizeQuestlineExport(normalizeQuestProgress(progress));
  return `# Applied Engineering Questline Learning Notes\n\n> Local educational progress only; not an official certification. Credentials and raw audio are excluded.\n\n## Confidence\n\n${safe.confidenceRating}/5\n\n## Notes\n\n${safe.notes || "No notes recorded."}\n\n## Practice evidence\n\n- Quests viewed: ${safe.questsViewed.length}\n- Challenges attempted: ${safe.challengesAttempted.length}\n- Challenges completed: ${safe.challengesCompleted.length}\n- Incidents solved: ${safe.incidentsSolved.length}\n- Audio lessons completed: ${safe.audioLessonsCompleted.length}\n- Capstones completed: ${safe.capstonesCompleted.length}\n`;
}

export function serializeIncidentReportMarkdown(
  incident: ClientIncident,
  learner: { classification?: string; investigation?: string; clientExplanation?: string; notes?: string } = {},
) {
  const safe = sanitizeQuestlineExport({ incident, learner });
  return `# Client Incident Report: ${inline(safe.incident.title)}\n\n> Deterministic educational scenario. No real customer credentials, payloads, or accounts were used.\n\n## Context\n\n- Language: ${inline(safe.incident.language)}\n- Framework: ${inline(safe.incident.framework)}\n- IDE: ${inline(safe.incident.ide)}\n- Operating system: ${inline(safe.incident.operatingSystem)}\n\n## Symptoms\n\n${mdList(safe.incident.symptoms)}\n\n## Learner diagnosis\n\n- Classification: ${inline(safe.learner.classification || "not supplied")}\n\n${safe.learner.investigation || "No investigation notes supplied."}\n\n## Evidence order\n\n${mdList(safe.incident.investigationSteps)}\n\n## Root cause and resolution\n\n${safe.incident.hiddenRootCause}\n\n${mdList(safe.incident.resolution)}\n\n## Prevention\n\n${mdList(safe.incident.prevention)}\n\n## Client-facing explanation\n\n${safe.learner.clientExplanation || safe.incident.clientFacingExplanation}\n\n## Notes\n\n${safe.learner.notes || "No additional notes."}\n`;
}

export function serializeCapstoneBriefMarkdown(capstone: CapstoneProject) {
  const safe = sanitizeQuestlineExport(capstone);
  return `# ${inline(safe.title)}\n\n> Applied Engineering Questline capstone. Verify current official Deepgram documentation before production.\n\n## Client brief\n\n${safe.clientBrief}\n\n## Project tree\n\n${mdCodeList(safe.projectTree)}\n\n## Architecture\n\n${mdList(safe.architecture)}\n\n## Deepgram APIs\n\n${mdList(safe.deepgramApis)}\n\n## Acceptance criteria\n\n${mdList(safe.acceptanceCriteria)}\n\n## Audio assumptions\n\n${mdList(safe.audioAssumptions)}\n\n## Failure injection\n\n${mdList(safe.failureInjection)}\n\n## Evaluation plan\n\n${mdList(safe.evaluationPlan)}\n\n## Test checklist\n\n${mdList(safe.testChecklist)}\n\n## Impact\n\n- Technical artifact: ${inline(safe.impact.technicalArtifact)}\n- Customer explanation: ${inline(safe.impact.customerExplanation)}\n- Business value: ${inline(safe.impact.businessValue)}\n- Reusable learning: ${inline(safe.impact.reusableLearning)}\n- Next improvement: ${inline(safe.impact.nextImprovement)}\n`;
}

export function serializePolyglotComparisonMarkdown(
  workflow: PolyglotWorkflow,
  languageIds?: QuestlineLanguageId[],
) {
  const selected = languageIds?.length
    ? workflow.implementations.filter((item) => languageIds.includes(item.language))
    : workflow.implementations;
  const safe = sanitizeQuestlineExport({ ...workflow, implementations: selected });
  const implementations = safe.implementations.map((item) => `## ${item.title}\n\n- Language: ${item.language}\n- Runtime: ${item.runtime}\n- Status: ${item.status}\n- Entry point: \`${item.entryPoint}\`\n- Files: ${item.files.map((file) => `\`${file}\``).join(", ")}\n- Dependency: ${item.dependency}\n- Concurrency: ${item.concurrency}\n- Cleanup: ${item.cleanup}\n- Testing: ${item.testing}\n- Deployment: ${item.deploymentShape}\n\n\`\`\`${fenceLanguage(item.language)}\n${item.code}\n\`\`\`\n`).join("\n");
  return `# Polyglot Comparison: ${inline(safe.label)}\n\n${safe.purpose}\n\n> These constructs look different, but they solve the same system problem. Examples use placeholders and raw REST where appropriate; docs-gated items are not presented as working SDK code.\n\n${implementations}`;
}

export function serializeStackRecommendationMarkdown(input: StackAdapterInput, recommendation: StackRecommendation) {
  const safe = sanitizeQuestlineExport({ input, recommendation });
  return `# Client Stack Adapter Recommendation\n\n## Stack\n\n- Language: ${inline(safe.input.language)}\n- Framework: ${inline(safe.input.framework)}\n- IDE: ${inline(safe.input.ide)}\n- OS: ${inline(safe.input.operatingSystem)}\n- Deployment: ${inline(safe.input.deploymentPlatform)}\n- Audio source: ${inline(safe.input.audioSource)}\n- Transport: ${inline(safe.input.transport)}\n\n## Summary\n\n${safe.recommendation.summary}\n\n## Project structure\n\n${mdCodeList(safe.recommendation.projectStructure)}\n\n## Integration point\n\n${mdList(safe.recommendation.deepgramIntegrationPoint)}\n\n## Audio and concurrency\n\n${mdList([...safe.recommendation.audioHandling, ...safe.recommendation.concurrencyPattern, ...safe.recommendation.cancellationPattern])}\n\n## Testing and deployment\n\n${mdList([...safe.recommendation.testingStrategy, ...safe.recommendation.deploymentNotes])}\n\n## Pitfalls\n\n${mdList(safe.recommendation.likelyPitfalls)}\n\n## Discovery questions\n\n${mdList(safe.recommendation.discoveryQuestions)}\n`;
}

function projectTreeFor(language: QuestlineLanguageId, framework: string) {
  if (language === "python") return ["app/main.py", "app/routes/voice.py", "app/services/deepgram.py", "app/models.py", "tests/fixtures/", ".env.example"];
  if (language === "typescript" || language === "react" || language === "html-css") return ["src/components/VoiceClient.tsx", "src/app/api/deepgram/route.ts", "src/lib/deepgram-server.ts", "src/lib/inspection.ts", "tests/fixtures/", ".env.example"];
  if (language === "go") return ["cmd/service/main.go", "internal/handlers/voice.go", "internal/deepgram/client.go", "internal/session/session.go", "internal/trace/trace.go", "go.mod"];
  if (language === "csharp") return ["Program.cs", "Controllers/VoiceController.cs", "Clients/DeepgramClient.cs", "Models/", "Diagnostics/", "Tests/"];
  if (language === "cpp") return ["CMakeLists.txt", "src/main.cpp", "src/audio/", "src/network/", "tests/", "cmake/"];
  if (language === "php") return ["public/index.php", "src/DeepgramClient.php", "src/UploadValidator.php", "templates/", "tests/fixtures/", ".env.example"];
  if (language === "sql") return ["migrations/", "queries/session_timeline.sql", "queries/quality_segments.sql", "tests/retention-fixture.sql"];
  if (language === "powershell") return ["README.md", "Test-VoiceEnvironment.ps1", "Invoke-Transcription.ps1", "fixtures/"];
  if (language === "shell") return ["README.md", "check-voice-env.sh", "transcribe-file.sh", "fixtures/"];
  return [`${framework}/entrypoint`, "provider-adapter", "tests/fixtures", "README.md"];
}

function pitfallsFor(language: QuestlineLanguageId) {
  const values: Partial<Record<QuestlineLanguageId, string[]>> = {
    python: ["Wrong virtual environment", "Coroutine never awaited", "Blocking work freezes asyncio", "Audio bytes decoded as text"],
    typescript: ["Node/browser package confusion", "Client/server import leak", "WebSocket sends before OPEN", "Cleanup missing after unmount"],
    react: ["Stale closure", "Render-phase state update", "Effect cleanup misses tracks/socket"],
    go: ["Goroutine leak", "Context cancellation ignored", "Slice backing array reused", "Response body left open"],
    csharp: ["HttpClient created per request", "CancellationToken not propagated", "Stream disposed early", "Dependency lifetime mismatch"],
    powershell: ["Bash syntax pasted into PowerShell", "Environment exists in another terminal", "curl alias/executable confusion", "Wrong working directory"],
    shell: ["Quoting changes JSON", "PATH tool mismatch", "Pipe hides exit status", "Binary body passes through text transform"],
    sql: ["Missing session/time index", "Interim/final duplication", "Timezone/unit mismatch", "Retention leaves child rows"],
    cpp: ["Dangling buffer", "Blocking audio callback", "Signedness/endianness mismatch", "Debug/Release linker mismatch"],
    php: ["Upload size limit", "Temporary file lifetime", "Double JSON encoding", "PHP-FPM environment differs from CLI"],
    "html-css": ["Mic status is visual only", "Focus becomes hidden", "Control does not explain explicit capture"],
  };
  return values[language] ?? ["Runtime/toolchain version mismatch", "Unverified package or provider feature parity"];
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return unique(value.filter((item): item is string => typeof item === "string").map((item) => item.slice(0, 240))).slice(0, 500);
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function inline(value: unknown) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

function mdList(values: string[]) {
  return values.length ? values.map((value) => `- ${inline(value)}`).join("\n") : "- None supplied";
}

function mdCodeList(values: string[]) {
  return values.length ? values.map((value) => `- \`${inline(value).replaceAll("`", "'")}\``).join("\n") : "- None supplied";
}

function fenceLanguage(language: QuestlineLanguageId) {
  const aliases: Partial<Record<QuestlineLanguageId, string>> = { typescript: "typescript", python: "python", go: "go", csharp: "csharp", powershell: "powershell", shell: "bash", sql: "sql", cpp: "cpp", php: "php", "html-css": "html", react: "tsx" };
  return aliases[language] ?? "text";
}
