import { FAILURE_SCENARIOS, TURN_TRACE_PRESET } from "@/lib/applied-voice/labs";
import { PIPELINE_LAYERS } from "@/lib/applied-voice/pipeline";
import { getSolutionRecipe } from "@/lib/applied-voice/scenarios";
import type {
  ClientContextPack,
  ClientDiscoveryInput,
  ConversationTrace,
  ConversationTraceEvent,
  EvaluationRun,
  EvaluationRunOptions,
  ExplainableRecommendation,
  SolutionBriefInput,
  TranscriptComparison,
  TranscriptTokenDiff,
  WerResult,
} from "@/types/applied-voice";
import { EVALUATION_SCENARIOS } from "@/lib/applied-voice/labs";

const REDACTED = "***redacted***";
const FIXTURE_TIMESTAMP = "2026-07-12T00:00:00.000Z";

const SECRET_KEYS = new Set([
  "authorization",
  "apikey",
  "deepgramapikey",
  "accesstoken",
  "temporarytoken",
  "token",
  "tokenvalue",
  "secret",
  "clientsecret",
  "password",
  "credential",
  "credentials",
]);

const RAW_AUDIO_KEYS = new Set([
  "rawaudio",
  "audiobytes",
  "audiobase64",
  "audioblob",
  "filebytes",
  "mediarecorderblob",
]);

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function sanitizeString(value: string): string {
  if (value === "DEEPGRAM_API_KEY" || value === "$DEEPGRAM_API_KEY") return value;
  return value
    .replace(/(authorization\s*[:=]\s*(?:token|bearer)\s+)[^\s,;}]+/gi, `$1${REDACTED}`)
    .replace(/\b((?:token|bearer)\s+)[A-Za-z0-9._~-]{12,}\b/gi, `$1${REDACTED}`)
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED)
    .replace(/(DEEPGRAM_API_KEY\s*=\s*)([^\s\n]+)/g, (_match, prefix: string, candidate: string) => {
      const allowed = new Set(["DEEPGRAM_API_KEY", "$DEEPGRAM_API_KEY", "process.env.DEEPGRAM_API_KEY"]);
      return `${prefix}${allowed.has(candidate) ? candidate : REDACTED}`;
    })
    .replace(/("?(?:access_token|temporary_token|api_key)"?\s*:\s*")[^"]*(")/gi, `$1${REDACTED}$2`);
}

/**
 * Creates a serializable deep copy with credential-bearing fields and raw audio removed.
 * It deliberately has no browser, environment, or server dependency so every export path
 * can call it before JSON/Markdown serialization.
 */
export function sanitizeAppliedExport<T>(value: T): T {
  const seen = new WeakSet<object>();

  function walk(current: unknown, key = ""): unknown {
    const normalized = normalizedKey(key);
    if (SECRET_KEYS.has(normalized)) return REDACTED;
    if (RAW_AUDIO_KEYS.has(normalized)) return "[raw audio omitted]";
    if (typeof current === "string") return sanitizeString(current);
    if (current === null || typeof current !== "object") return current;
    if (current instanceof ArrayBuffer || ArrayBuffer.isView(current)) return "[binary data omitted]";
    if (current instanceof Date) return current.toISOString();
    if (seen.has(current)) return "[circular reference omitted]";
    seen.add(current);
    const sanitized = Array.isArray(current)
      ? current.map((item) => walk(item))
      : Object.fromEntries(
          Object.entries(current as Record<string, unknown>).map(([childKey, child]) => [childKey, walk(child, childKey)]),
        );
    seen.delete(current);
    return sanitized;
  }

  return walk(value) as T;
}

function compact(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function recommendation(
  id: string,
  recommendationText: string,
  why: string,
  assumption: string,
  alternative: string,
  validation: string,
  docsMetadataId?: string,
): ExplainableRecommendation {
  return {
    id,
    recommendation: recommendationText,
    why,
    assumption,
    alternative,
    validation,
    provenance: "derived",
    docsMetadataId,
  };
}

function stablePackId(input: ClientDiscoveryInput): string {
  const source = `${input.scenarioId ?? "custom"}-${input.industry}-${input.primaryBusinessProblem}`.toLowerCase();
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `context-${(hash >>> 0).toString(36)}`;
}

export function createClientContextPack(input: ClientDiscoveryInput): ClientContextPack {
  const realtime = input.processing === "realtime" || input.processing === "both";
  const batch = input.processing === "batch" || input.processing === "both";
  const interactive = input.conversationProfiles.includes("interactive-voice-agent");
  const interruptionSensitive = input.conversationProfiles.includes("high-interruption") || interactive;
  const multiSpeaker = input.conversationProfiles.includes("two-person-call") || input.conversationProfiles.includes("multi-speaker-meeting");
  const needsSpeechOutput = input.workflowRequirements.some((requirement) =>
    ["agent-response", "voice-output", "outbound-transactional-message"].includes(requirement),
  );
  const needsAnalysis = input.workflowRequirements.some((requirement) =>
    ["summary", "intent", "sentiment", "topics"].includes(requirement),
  );
  const needsTool = input.workflowRequirements.includes("function-tool-call");

  const recommendations: ExplainableRecommendation[] = [];
  recommendations.push(
    recommendation(
      "speech-recognition",
      `${batch && realtime ? "Prerecorded and streaming" : batch ? "Prerecorded" : "Streaming"} Speech to Text with a currently supported Nova-family model/configuration`,
      "The workflow begins with audio and requires structured transcript data.",
      `Representative audio can be delivered in ${batch && realtime ? "both batch and realtime" : batch ? "batch" : "realtime"} form.`,
      interactive ? "Evaluate an integrated Voice Agent path if one stateful listen-think-speak session reduces orchestration burden." : "Keep the current manual workflow for sources whose consent or audio quality is not ready.",
      "Run representative audio through API Studio/local routes, verify current model/language support, and score by language, accent, channel, noise, and domain segment.",
      "speech-to-text",
    ),
  );

  if (interruptionSensitive && realtime) {
    recommendations.push(
      recommendation(
        "turn-detection",
        "Evaluate Flux conversational turn detection for the realtime conversational path",
        "The user may pause, resume, or interrupt, so transcript text alone does not define a safe response boundary.",
        "The selected language, audio path, and account support the currently documented Flux capability.",
        "Use a customer-owned endpointing/state-machine approach around streaming STT when Flux is not appropriate or available.",
        "Verify the current official Flux endpoint, model/language support, event contract, and parameter ranges; run pause/resume and interruption fixtures before production.",
        "flux",
      ),
    );
  }

  if (interactive && needsSpeechOutput) {
    recommendations.push(
      recommendation(
        "voice-agent",
        "Compare an integrated Deepgram Voice Agent architecture with a customer-owned cascaded STT → orchestration/LLM → TTS architecture",
        "The journey needs a stateful listen-think-speak loop, tools, and interruption handling.",
        "A realtime automated agent is acceptable after business, safety, latency, and human-handoff requirements are validated.",
        "Use streaming STT plus a customer-owned orchestrator and TTS for maximum component-level control.",
        "Validate current Voice Agent settings/events in official docs and run a bounded POC; the Academy simulation is not a live Voice Agent session.",
        "voice-agent",
      ),
    );
  } else if (needsSpeechOutput) {
    recommendations.push(
      recommendation(
        "tts",
        "Use Text to Speech after response text is approved by the workflow",
        "The desired output includes a spoken or outbound voice message.",
        "The chosen language/voice and output format are currently supported and the customer has consent for the delivery channel.",
        "Display text or route to a human if speech output is unnecessary or fails.",
        "Verify current Aura voice/language/format support and measure intelligibility, first-byte/playback latency, and delivery outcome.",
        "text-to-speech",
      ),
    );
  }

  if (needsAnalysis) {
    recommendations.push(
      recommendation(
        "analysis",
        "Add a documented text-analysis capability after transcription only for the requested supported features",
        "The workflow asks for context such as summary, intent, sentiment, or topics after speech is already text.",
        "The requested features and response paths remain supported by the current official Deepgram reference.",
        "Implement a customer-owned analysis/review layer, or ship transcript-only first.",
        "Verify each requested feature and response path in official docs; compare against human annotations and do not treat subjective signals as objective fact.",
        "text-intelligence",
      ),
    );
  }

  if (needsTool) {
    recommendations.push(
      recommendation(
        "tool-boundary",
        "Keep function/tool execution in an authenticated customer-controlled service with schemas, confirmation, deadlines, and idempotency",
        "Speech interpretation alone must not authorize a business-system action.",
        "The customer can expose a narrow allowlisted integration and define who/what may invoke it.",
        "Start with read-only local fixtures and human execution before enabling any mutation.",
        "Test invalid arguments, duplicate calls, timeout, malformed results, unauthorized users, and human-handoff behavior.",
      ),
    );
  }

  if (input.selfHostedRequired === true || input.regionDataResidency.trim()) {
    recommendations.push(
      recommendation(
        "deployment",
        input.selfHostedRequired === true
          ? "Run an enterprise self-hosted deployment discovery before selecting infrastructure"
          : "Validate managed-region/residency requirements before fixing the endpoint or deployment mode",
        "The discovery input includes deployment-control or residency constraints.",
        "The requirement is precise enough to validate with current official documentation, the customer, and applicable agreements.",
        "Use the managed cloud API if it satisfies the validated requirement with less operational burden.",
        "Confirm data path, region, retention, compatibility, capacity, upgrades, support, SLOs, and the responsibility matrix with security/legal/compliance teams.",
        input.selfHostedRequired === true ? "self-hosted" : "regional",
      ),
    );
  }

  const recommendedProducts = recommendations
    .filter((item) => ["speech-recognition", "turn-detection", "voice-agent", "tts", "analysis"].includes(item.id))
    .map((item) => item.recommendation);
  const proposedTransport = compact([
    ...(batch ? ["HTTPS through the existing trusted local server route for prerecorded requests"] : []),
    ...(realtime ? ["WebSocket for realtime audio/events; use a temporary browser token only through the implemented grant flow"] : []),
    ...(input.audioSources.some((source) => ["pstn-phone-call", "sip-rtp-media", "webrtc"].includes(source))
      ? ["Customer/third-party media bridge concept; no telephony connector is installed"]
      : []),
  ]);
  const proposedRequestPath = compact([
    ...(batch ? ["Audio file/hosted URL → customer local server route → Deepgram Speech to Text → sanitized response inspector"] : []),
    ...(realtime ? ["Audio source → authorized realtime transport → speech/turn events → customer orchestration"] : []),
    ...(needsTool ? ["Validated intent → allowlisted customer tool boundary → schema-validated result → response or human handoff"] : []),
    ...(needsSpeechOutput ? ["Approved response text → Deepgram Text to Speech → customer playback/media return"] : []),
    "All components → sanitized trace/evaluation → customer-controlled observability",
  ]);
  const unansweredQuestions = compact([
    ...(input.expectedConcurrency.toLowerCase().includes("validate") || !input.expectedConcurrency ? ["What sustained and burst concurrency must the POC and production system support?"] : []),
    ...(!input.requiredResponseLatency || input.requiredResponseLatency.toLowerCase().includes("no target") ? ["What user-perceived and component-level latency targets are acceptable?"] : []),
    ...(!input.audioFormat || input.audioFormat.toLowerCase().includes("unknown") ? ["What are the actual container, encoding, sample rate, and channel layouts of representative audio?"] : []),
    ...(!input.regionDataResidency || input.regionDataResidency.toLowerCase().includes("not yet") ? ["Which processing region, residency, retention, and deletion rules apply?"] : []),
    ...(input.selfHostedRequired === null ? ["Is managed cloud acceptable, or is self-hosting a hard requirement?"] : []),
    ...(!input.cloudEnvironment ? ["Which cloud/network environment and secret manager will own the trusted integration?"] : []),
    ...(!input.applicationStack ? ["Which application stack and deployment runtime must the integration fit?"] : []),
    ...(input.audioSources.some((source) => ["pstn-phone-call", "sip-rtp-media"].includes(source)) && !input.telephonyProvider
      ? ["Which telephony/contact-center provider and media interface are actually available?"]
      : []),
    "What representative, consented evaluation set and human annotations are available?",
    "Who owns final approval, human handoff, and incident response?",
  ]);

  return sanitizeAppliedExport({
    id: stablePackId(input),
    createdAt: new Date().toISOString(),
    scenarioId: input.scenarioId,
    problemStatement: `${input.industry}: ${input.primaryBusinessProblem} The desired outcome is ${input.desiredOutcome}`,
    recommendations,
    recommendedProducts,
    recommendedModelFamily: compact([
      "Nova family for speech recognition; choose the current supported model for operation, language, and audio conditions",
      ...(interruptionSensitive && realtime ? ["Flux conversational model/capability only after current compatibility verification"] : []),
      ...(needsSpeechOutput ? ["Current supported Aura voice/model for the required language and output"] : []),
    ]),
    proposedTransport,
    proposedRequestPath,
    requiredIntegrations: compact([
      ...input.downstreamSystems,
      ...(input.telephonyProvider && input.telephonyProvider !== "None identified" ? [input.telephonyProvider] : []),
      ...(needsTool ? ["Customer-owned authenticated tool gateway"] : []),
      ...(input.humanHandoffRequired ? ["Human queue/handoff owned by the customer or selected provider"] : []),
    ]),
    securityModel: [
      "DEEPGRAM_API_KEY remains server-side; no permanent key in browser code, localStorage, payloads, traces, docs, or exports.",
      "Realtime browser access uses a short-lived temporary token in memory only where the implemented grant flow is appropriate; tokens are redacted.",
      "Tools use least privilege, explicit authorization, strict schemas, deadlines, confirmation for sensitive actions, and idempotency for mutations.",
      "Logs and exports are sanitized; raw audio is excluded unless a separate explicit warned workflow is designed.",
      "PII, retention, region, consent, and compliance require validation with customer legal, security, and compliance teams.",
    ],
    risks: compact([
      "Audio/language/accent/noise distribution may not match the initial test set.",
      "Latency and transcript stability may conflict in interruption-heavy conversation.",
      ...(needsTool ? ["Incorrect or duplicate tool arguments could create business harm without confirmation and idempotency."] : []),
      ...(needsAnalysis ? ["Summary, intent, sentiment, and topics are probabilistic and require task-specific/human evaluation."] : []),
      ...(multiSpeaker ? ["Speaker labels can be wrong and must not be treated as verified identity."] : []),
      "Third-party media/business systems are architecture concepts until credentials, APIs, and ownership are separately authorized.",
    ]),
    unansweredQuestions,
    suggestedProofOfConcept: [
      "Select one bounded user journey and 30+ representative consented examples, including known failure segments.",
      `Exercise ${batch && realtime ? "one batch path and one realtime path" : batch ? "the existing safe prerecorded local route" : "the existing authorized realtime flow where compatible"}.`,
      "Use read-only/local simulated tools first; require confirmation and human fallback.",
      "Capture sanitized traces and component latency with measured/derived/simulated provenance.",
      "Review transcript/task outputs with domain users and record a go/no-go decision.",
    ],
    successMetrics: compact([
      "Word error rate only where a human reference transcript exists, reported by meaningful segment.",
      "Domain-term and critical number/date/identifier accuracy.",
      ...(realtime ? ["Measured end-of-turn, first-response, first-audio, and total user-perceived latency.", "Interruption recovery and speaking-over-user incidents."] : ["Batch completion time and successful request rate."]),
      ...(needsTool ? ["Correct tool, arguments, confirmation, success/failure transparency, and duplicate prevention."] : []),
      "Task completion, human escalation, abandonment, and reviewer acceptance.",
    ]),
    productionReadinessGaps: [
      "Current official capability/model/language/parameter verification for the exact selected configuration.",
      "Representative evaluation set, segment thresholds, regression suite, and human-review protocol.",
      "Load/concurrency, network-loss, retry/idempotency, and third-party failure testing.",
      "Threat model, least privilege, key rotation, redaction, retention, and incident runbook.",
      "Canary rollout, rollback condition, monitoring, human fallback, and customer support ownership.",
    ],
    sourceInput: input,
    provenance: "derived" as const,
  });
}

function tokenize(text: string): string[] {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}'-]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

type AlignmentCell = { cost: number; substitutions: number; deletions: number; insertions: number };

function align(reference: string[], hypothesis: string[]): { result: WerResult; differences: TranscriptTokenDiff[] } {
  const rows = reference.length + 1;
  const columns = hypothesis.length + 1;
  const matrix: AlignmentCell[][] = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => ({ cost: 0, substitutions: 0, deletions: 0, insertions: 0 })),
  );
  const operations: Array<Array<TranscriptTokenDiff["kind"] | null>> = Array.from({ length: rows }, () => Array(columns).fill(null));
  for (let row = 1; row < rows; row += 1) {
    matrix[row][0] = { cost: row, substitutions: 0, deletions: row, insertions: 0 };
    operations[row][0] = "missing";
  }
  for (let column = 1; column < columns; column += 1) {
    matrix[0][column] = { cost: column, substitutions: 0, deletions: 0, insertions: column };
    operations[0][column] = "extra";
  }

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      if (reference[row - 1] === hypothesis[column - 1]) {
        matrix[row][column] = { ...matrix[row - 1][column - 1] };
        operations[row][column] = "equal";
        continue;
      }
      const substitution = { ...matrix[row - 1][column - 1] };
      substitution.cost += 1;
      substitution.substitutions += 1;
      const deletion = { ...matrix[row - 1][column] };
      deletion.cost += 1;
      deletion.deletions += 1;
      const insertion = { ...matrix[row][column - 1] };
      insertion.cost += 1;
      insertion.insertions += 1;
      const candidates = [
        { value: substitution, operation: "substitution" as const, priority: 0 },
        { value: deletion, operation: "missing" as const, priority: 1 },
        { value: insertion, operation: "extra" as const, priority: 2 },
      ].sort((left, right) => left.value.cost - right.value.cost || left.priority - right.priority);
      matrix[row][column] = candidates[0].value;
      operations[row][column] = candidates[0].operation;
    }
  }

  const differences: TranscriptTokenDiff[] = [];
  let row = reference.length;
  let column = hypothesis.length;
  while (row > 0 || column > 0) {
    const operation = operations[row][column];
    if (operation === "equal") {
      differences.push({ kind: "equal", reference: reference[row - 1], hypothesis: hypothesis[column - 1] });
      row -= 1;
      column -= 1;
    } else if (operation === "substitution") {
      differences.push({ kind: "substitution", reference: reference[row - 1], hypothesis: hypothesis[column - 1] });
      row -= 1;
      column -= 1;
    } else if (operation === "missing") {
      differences.push({ kind: "missing", reference: reference[row - 1] });
      row -= 1;
    } else {
      differences.push({ kind: "extra", hypothesis: hypothesis[column - 1] });
      column -= 1;
    }
  }
  differences.reverse();
  const final = matrix[reference.length][hypothesis.length];
  const denominator = reference.length;
  const wer = denominator === 0 ? (hypothesis.length === 0 ? 0 : 1) : final.cost / denominator;
  return {
    result: {
      wer,
      percentage: wer * 100,
      substitutions: final.substitutions,
      deletions: final.deletions,
      insertions: final.insertions,
      referenceWordCount: reference.length,
    },
    differences,
  };
}

export function calculateWer(reference: string, hypothesis: string): WerResult {
  return align(tokenize(reference), tokenize(hypothesis)).result;
}

export function compareTranscripts(reference: string, hypothesis: string): TranscriptComparison {
  const referenceWords = tokenize(reference);
  const hypothesisWords = tokenize(hypothesis);
  const { result, differences } = align(referenceWords, hypothesisWords);
  return {
    ...result,
    normalizedReference: referenceWords.join(" "),
    normalizedHypothesis: hypothesisWords.join(" "),
    differences,
  };
}

export type SimulatedTraceOptions = {
  id?: string;
  sessionId?: string;
  title?: string;
  failureScenarioId?: string;
};

export function createSimulatedTrace(options: SimulatedTraceOptions = {}): ConversationTrace {
  const sessionId = options.sessionId ?? TURN_TRACE_PRESET.sessionId;
  const failure = FAILURE_SCENARIOS.find((item) => item.id === options.failureScenarioId);
  const events = TURN_TRACE_PRESET.events.map((event) => ({ ...event, sessionId }));
  if (failure) {
    const failureEvent: ConversationTraceEvent = {
      id: `failure-${failure.id}`,
      sessionId,
      turnId: "turn-1",
      stepId: `failure-step-${failure.id}`,
      offsetMs: 2650,
      type: "Error",
      component: failure.layer === "tool" ? "tool" : failure.layer === "llm" ? "llm" : failure.layer === "text-to-speech" ? "deepgram-tts" : "transport",
      label: failure.name,
      detail: `${failure.userSymptom} Fallback: ${failure.fallback}`,
      payload: failure.relevantPayload,
      error: true,
      provenance: "simulated",
    };
    events.push(failureEvent);
    if (failure.retrySafe !== false) {
      events.push({
        id: `retry-${failure.id}`,
        sessionId,
        turnId: "turn-1",
        stepId: `retry-step-${failure.id}`,
        offsetMs: 2700,
        type: "Retry",
        component: failureEvent.component,
        label: "Bounded retry decision",
        detail: `${failure.retryPolicy} This is a simulated trace event, not a real retry.`,
        payload: { retry_safe: failure.retrySafe, provenance: "simulated" },
        provenance: "simulated",
      });
    }
    if (failure.fallback.toLowerCase().includes("hand off") || failure.id === "handoff-unavailable") {
      events.push({
        id: `handoff-${failure.id}`,
        sessionId,
        turnId: "turn-1",
        stepId: `handoff-step-${failure.id}`,
        offsetMs: 2800,
        type: "HumanHandoff",
        component: "human",
        label: "Human fallback",
        detail: failure.id === "handoff-unavailable" ? "Simulated handoff queue is unavailable; explain alternate path honestly." : "Simulated human handoff is requested.",
        payload: { handoff_id: "HANDOFF-SIMULATED", provenance: "simulated" },
        businessEvent: true,
        provenance: "simulated",
      });
    }
    events.sort((left, right) => left.offsetMs - right.offsetMs || left.stepId.localeCompare(right.stepId));
  }
  return sanitizeAppliedExport({
    ...TURN_TRACE_PRESET,
    id: options.id ?? (failure ? `trace-${failure.id}` : TURN_TRACE_PRESET.id),
    sessionId,
    title: options.title ?? (failure ? `${failure.name} diagnosis simulation` : TURN_TRACE_PRESET.title),
    createdAt: FIXTURE_TIMESTAMP,
    events,
    latencyBudget: TURN_TRACE_PRESET.latencyBudget.map((item) => ({ ...item })),
  });
}

export function runEvaluationScenario(scenarioId: string, options: EvaluationRunOptions = {}): EvaluationRun {
  const scenario = EVALUATION_SCENARIOS.find((item) => item.id === scenarioId);
  if (!scenario) throw new Error(`Unknown evaluation scenario: ${scenarioId}`);
  const forced = new Set(options.forceFailures ?? []);
  const results = scenario.assertions.map((assertion) => {
    const passed = !forced.has(assertion.id);
    return {
      ...assertion,
      passed,
      actual: passed
        ? assertion.requiresHumanReview
          ? "The deterministic fixture emitted the expected evidence; a human rating is still required for the subjective judgment."
          : "The deterministic fixture emitted the expected behavior."
        : "A deterministic failure was injected for this assertion.",
    };
  });
  const failureScenarioId = forced.size > 0 ? (scenarioId === "tool-timeout" ? "tool-timeout" : undefined) : undefined;
  return sanitizeAppliedExport({
    id: `evaluation-${scenarioId}`,
    scenarioId,
    createdAt: FIXTURE_TIMESTAMP,
    passed: results.every((result) => result.passed),
    results,
    expectedBehavior: [...scenario.expectedBehavior],
    actualBehavior: results.map((result) => `${result.passed ? "PASS" : "FAIL"}: ${result.actual}`),
    trace: createSimulatedTrace({ id: `trace-evaluation-${scenarioId}`, sessionId: `session-evaluation-${scenarioId}`, title: scenario.name, failureScenarioId }),
    humanRatings: options.humanRatings ?? {},
    notes: options.notes ?? "Deterministic local fixture. Human review is required where marked.",
    provenance: "simulated" as const,
  });
}

function mdList(items: string[], empty = "Not supplied"): string {
  return items.length > 0 ? items.map((item) => `- ${sanitizeString(item)}`).join("\n") : `- ${empty}`;
}

function mdValue(value: string): string {
  return sanitizeString(value).replace(/[\r\n]+/g, " ").trim();
}

export function serializeContextPackJson(pack: ClientContextPack): string {
  return JSON.stringify(sanitizeAppliedExport(pack), null, 2);
}

export function serializeContextPackMarkdown(pack: ClientContextPack): string {
  const safe = sanitizeAppliedExport(pack);
  const recommendationText = safe.recommendations
    .map(
      (item) => `### ${mdValue(item.recommendation)}\n\n- Why this fits: ${mdValue(item.why)}\n- Assumption: ${mdValue(item.assumption)}\n- Alternative: ${mdValue(item.alternative)}\n- Validate: ${mdValue(item.validation)}\n- Provenance: ${item.provenance}`,
    )
    .join("\n\n");
  return `# Client Context Pack\n\n> Derived learning artifact. Verify capabilities in official Deepgram documentation and validate decisions with the customer. Contains no credentials or raw audio.\n\n- Context ID: ${safe.id}\n- Created: ${safe.createdAt}\n- Provenance: ${safe.provenance}\n\n## Problem statement\n\n${mdValue(safe.problemStatement)}\n\n## Explainable recommendations\n\n${recommendationText}\n\n## Recommended Deepgram products\n\n${mdList(safe.recommendedProducts)}\n\n## Recommended model family\n\n${mdList(safe.recommendedModelFamily)}\n\n## Proposed transport\n\n${mdList(safe.proposedTransport)}\n\n## Proposed request path\n\n${mdList(safe.proposedRequestPath)}\n\n## Required integrations\n\n${mdList(safe.requiredIntegrations)}\n\n## Security model\n\n${mdList(safe.securityModel)}\n\n## Risks\n\n${mdList(safe.risks)}\n\n## Unanswered questions\n\n${mdList(safe.unansweredQuestions)}\n\n## Suggested proof of concept\n\n${mdList(safe.suggestedProofOfConcept)}\n\n## Success metrics\n\n${mdList(safe.successMetrics)}\n\n## Production-readiness gaps\n\n${mdList(safe.productionReadinessGaps)}\n`;
}

export function generateSolutionBriefMarkdown(input: SolutionBriefInput): string {
  const safe = sanitizeAppliedExport(input);
  const pack = safe.contextPack;
  const recipe = safe.recipeId ? getSolutionRecipe(safe.recipeId) : undefined;
  const chosenApis = compact([...(safe.chosenApis ?? []), ...(recipe?.deepgramComponents ?? pack.recommendedProducts)]);
  const selectedLayers = (safe.selectedPipelineLayerIds ?? [])
    .map((id) => PIPELINE_LAYERS.find((layer) => layer.id === id))
    .filter((layer): layer is (typeof PIPELINE_LAYERS)[number] => Boolean(layer));
  const architecture = selectedLayers.length > 0
    ? selectedLayers.map((layer) => layer.name)
    : recipe?.architecture ?? pack.proposedRequestPath;
  const deployment = safe.deploymentModeId ?? "Not yet selected; use Deployment Lab to validate the boundary";
  const risks = compact([...(pack.risks ?? []), ...(recipe?.privacyConcerns ?? []), ...(safe.risks ?? [])]);
  const openQuestions = compact([...(pack.unansweredQuestions ?? []), ...(safe.openQuestions ?? [])]);
  const evaluationPlan = compact([...(safe.evaluationPlan ?? []), ...(recipe?.evaluationPlan ?? pack.successMetrics)]);
  const experimentConclusions = safe.experimentConclusions ?? [];
  const payloadExamples = recipe?.payloadExamples ?? [
    { input: "$AUDIO_OR_TEXT", authorization: REDACTED, note: "Sanitized example; build the exact request in API Studio." },
  ];
  const diagram = architecture.length > 0 ? architecture.map((step, index) => `${index === 0 ? "" : "  ↓\n"}[${step}]`).join("\n") : "[Architecture not selected]";

  return `# Client Solution Brief\n\n> Generated by Applied Voice Systems Academy. This is a sanitized learning/POC artifact, not a contractual design, certification, or regulatory determination. Verify Deepgram capabilities in official documentation.\n\n## Executive summary\n\n${mdValue(pack.problemStatement)} Proposed direction: ${mdValue(recipe?.name ?? "a bounded, evaluated voice workflow with explicit ownership and human fallback")}.\n\n## Current problem\n\n${mdValue(pack.problemStatement)}\n\n## Proposed workflow\n\n${mdList(recipe?.eventFlow ?? pack.proposedRequestPath)}\n\n## Architecture diagram\n\n\`\`\`text\n${diagram}\n\`\`\`\n\n## Deepgram components\n\n${mdList(chosenApis)}\n\n## Request and event flow\n\n${mdList(pack.proposedRequestPath)}\n\n## Integration touchpoints\n\n${mdList(pack.requiredIntegrations)}\n\n## Security model\n\n${mdList(pack.securityModel)}\n\n## Latency targets\n\n${mdList(recipe?.latencyPriorities ?? ["Targets not yet agreed; capture component measurements and total user-perceived latency separately."])}\n\n## Evaluation plan\n\n${mdList(evaluationPlan)}\n\n### Experiment conclusions\n\n${mdList(experimentConclusions, "No experiment conclusion supplied") }\n\n## Failure handling\n\n${mdList(recipe?.failureHandling ?? ["Diagnose from the user-visible symptom backward through the sanitized trace.", "Use bounded safe retries and transparent human fallback."])}\n\n## POC scope\n\n${mdList(recipe?.proofOfConceptScope ?? pack.suggestedProofOfConcept)}\n\n## Production considerations\n\n- Deployment choice: ${mdValue(deployment)}\n${mdList(recipe?.productionRoadmap ?? pack.productionReadinessGaps)}\n\n## Key risks\n\n${mdList(risks)}\n\n## Open questions\n\n${mdList(openQuestions)}\n\n## Next steps\n\n1. Confirm the business owner, bounded user journey, and what must never happen.\n2. Validate exact API/model/language/parameter support in official Deepgram documentation.\n3. Assemble representative, consented evaluation audio and human references.\n4. Run the smallest safe local POC and capture a sanitized trace.\n5. Review results, responsibility boundaries, security, fallback, and rollout criteria with the customer.\n\n# Technical appendix\n\n## Sanitized payload examples\n\n\`\`\`json\n${JSON.stringify(sanitizeAppliedExport(payloadExamples), null, 2)}\n\`\`\`\n\n## Important response/event paths\n\n- STT transcript: \`results.channels[0].alternatives[0].transcript\` (when returned by the selected STT response)\n- STT words: \`results.channels[0].alternatives[0].words\` (when requested/supported and returned)\n- Request correlation: \`metadata.request_id\` (when returned)\n- TTS output: audio bytes plus content type; the browser may create an object URL for the implemented single-request flow\n- Turn/agent events: verify the current official event contract before production; Academy traces are simulations\n\n## File placement map\n\n- API exploration: \`src/components/api-studio/\`\n- Safe local routes: \`src/app/api/deepgram/\`\n- Payload/trace sanitization: \`src/lib/inspection.ts\`, \`src/lib/applied-voice/academy.ts\`\n- Academy registries: \`src/lib/applied-voice/\`\n- Editable examples: Code Lab module\n\n## Trace fields\n\n- Local session ID, turn ID, step ID, and tool-call ID where applicable\n- Deepgram request ID only when actually returned\n- Event component/type/offset and measured, derived, simulated, or unavailable provenance\n- Authorization, API keys, temporary tokens, and raw audio are excluded or redacted\n`;
}
