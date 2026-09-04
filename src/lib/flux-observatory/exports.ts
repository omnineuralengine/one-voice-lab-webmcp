import { deriveFluxMetrics } from "./metrics";
import { sanitizeFluxText, sanitizeFluxValue } from "./security";
import type { FluxConfiguration, FluxMetricSummary, FluxObservatoryState, FluxScorecard } from "./types";

export interface BuildFluxScorecardOptions {
  runId: string;
  generatedAt?: string;
  applicationVersion?: string;
  reviewerNotes?: string[];
  observedStrengths?: string[];
  observedFailures?: string[];
  unsupportedConclusions?: string[];
  assumptions?: string[];
  recommendedNextTest?: string;
  evidenceRequiredBeforeProduction?: string[];
}

export interface BuildFluxMermaidOptions {
  mode?: FluxObservatoryState["mode"];
  includeSpeculativeOrchestration?: boolean;
  llmExecuted?: boolean;
  ttsExecuted?: boolean;
}

export function buildFluxScorecard(state: FluxObservatoryState, options: BuildFluxScorecardOptions): FluxScorecard {
  const metrics = deriveFluxMetrics(state);
  const acknowledged = state.configurationHistory.filter((entry) => entry.status === "provider-acknowledged").length;
  const rejected = state.configurationHistory.filter((entry) => entry.status === "provider-rejected").length;
  return sanitizeFluxValue({
    schemaVersion: "flux-poc-scorecard-v1",
    runId: sanitizeFluxText(options.runId, 120) || "flux-run",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    applicationVersion: options.applicationVersion ? sanitizeFluxText(options.applicationVersion, 120) : undefined,
    mode: state.mode,
    providerValidationState: state.providerValidationState,
    selectedModel: state.activeConfiguration.model,
    audioConfiguration: {
      encoding: state.activeConfiguration.encoding,
      sampleRate: state.activeConfiguration.sampleRate,
      configuredTargetChunkMs: state.activeConfiguration.targetChunkMs,
    },
    thresholdConfiguration: { ...state.activeConfiguration.thresholds },
    languageHints: state.activeConfiguration.languageHints.map((hint) => sanitizeFluxText(hint, 40)),
    keyterms: state.activeConfiguration.keyterms.map((term) => sanitizeFluxText(term, 120)),
    completedTurns: metrics.completedTurnCount,
    resumedTurns: metrics.resumedTurnCount,
    configurationOutcomes: { acknowledged, rejected },
    connectionFailures: metrics.connectionFailureCount,
    reconnectBehavior: metrics.reconnectDuration,
    timingSamples: {
      startToEager: metrics.startToEager,
      eagerToEnd: metrics.eagerToEnd,
      startToEnd: metrics.startToEnd,
      observedChunkInterval: metrics.observedChunkInterval,
    },
    reviewerNotes: sanitizeList(options.reviewerNotes),
    observedStrengths: sanitizeList(options.observedStrengths ?? defaultStrengths(state)),
    observedFailures: sanitizeList(options.observedFailures ?? defaultFailures(state)),
    unsupportedConclusions: sanitizeList(options.unsupportedConclusions ?? [
      "This run does not establish universal latency or transcription accuracy.",
      "This run does not establish production concurrency, reliability, security, retention, compliance, or cost readiness.",
      "Turn events do not reveal the model's internal reasoning.",
      "The wire event does not explicitly identify a timeout-forced EndOfTurn.",
    ]),
    assumptions: sanitizeList(options.assumptions),
    recommendedNextTest: sanitizeFluxText(options.recommendedNextTest ?? "Run the same scenario with an approved microphone and temporary credential, then review event ordering and local timing.", 500),
    evidenceRequiredBeforeProduction: sanitizeList(options.evidenceRequiredBeforeProduction ?? [
      "Scenario-specific microphone and provider validation",
      "Representative audio and speaker coverage",
      "Load, reconnect, security, retention, compliance, and cost testing",
      "Customer acceptance criteria and operational ownership",
    ]),
    privacy: { transcriptsIncluded: false, rawAudioIncluded: false, credentialsIncluded: false },
  }) as FluxScorecard;
}

export function exportFluxScorecardMarkdown(scorecard: FluxScorecard): string {
  const rows = [
    ["Mode", scorecard.mode],
    ["Provider validation", scorecard.providerValidationState],
    ["Model", scorecard.selectedModel],
    ["Audio", `${scorecard.audioConfiguration.encoding} at ${scorecard.audioConfiguration.sampleRate} Hz`],
    ["Configured chunk target", `${scorecard.audioConfiguration.configuredTargetChunkMs} ms (target, not a guarantee)`],
    ["Completed turns", String(scorecard.completedTurns)],
    ["Resumed turns", String(scorecard.resumedTurns)],
  ];
  const sections = [
    `# Flux POC scorecard — ${sanitizeFluxText(scorecard.runId, 120)}`,
    "",
    `Generated: ${sanitizeFluxText(scorecard.generatedAt, 80)}`,
    scorecard.applicationVersion ? `Application version: ${sanitizeFluxText(scorecard.applicationVersion, 120)}` : "",
    "",
    ...rows.map(([key, value]) => `- **${key}:** ${sanitizeFluxText(value, 240)}`),
    "",
    "## Turn configuration",
    "",
    `- eot_threshold: ${scorecard.thresholdConfiguration.eotThreshold}`,
    `- eager_eot_threshold: ${scorecard.thresholdConfiguration.eagerEotThreshold ?? "not enabled"}`,
    `- eot_timeout_ms: ${scorecard.thresholdConfiguration.eotTimeoutMs}`,
    `- language hints: ${scorecard.languageHints.length ? scorecard.languageHints.join(", ") : "none"}`,
    `- keyterms: ${scorecard.keyterms.length ? scorecard.keyterms.join(", ") : "none"}`,
    "",
    "## Locally observed timing",
    "",
    formatMetric("StartOfTurn to EagerEndOfTurn", scorecard.timingSamples.startToEager),
    formatMetric("EagerEndOfTurn to EndOfTurn", scorecard.timingSamples.eagerToEnd),
    formatMetric("StartOfTurn to EndOfTurn", scorecard.timingSamples.startToEnd),
    formatMetric("Observed audio chunk interval", scorecard.timingSamples.observedChunkInterval),
    "",
    "> Browser timing includes local scheduling, capture, buffering, network, and transport effects. It is not a universal Deepgram benchmark.",
    "",
    formatList("Reviewer notes", scorecard.reviewerNotes),
    formatList("Observed strengths", scorecard.observedStrengths),
    formatList("Observed failures", scorecard.observedFailures),
    formatList("Unsupported conclusions", scorecard.unsupportedConclusions),
    formatList("Assumptions", scorecard.assumptions),
    "## Recommended next test",
    "",
    sanitizeFluxText(scorecard.recommendedNextTest, 500),
    "",
    formatList("Evidence required before production", scorecard.evidenceRequiredBeforeProduction),
    "## Privacy boundary",
    "",
    "No credentials, authorization headers, raw microphone audio, or transcripts are included in this scorecard.",
  ];
  return sections.filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n").trimEnd() + "\n";
}

export function exportFluxScorecardJson(scorecard: FluxScorecard): string {
  return `${JSON.stringify(sanitizeFluxValue(scorecard), null, 2)}\n`;
}

export function buildFluxMermaid(configuration: FluxConfiguration, options: BuildFluxMermaidOptions = {}): string {
  const mode = options.mode ?? "synthetic-replay";
  const optional = options.includeSpeculativeOrchestration ?? true;
  const lines = [
    "flowchart LR",
    '  n1["Browser microphone"]',
    '  n2["AudioWorklet processing and bounded buffer"]',
    `  n3["Flux /v2/listen - ${configuration.model}"]`,
    '  n4["Turn-event normalizer"]',
    '  n5["Generation-safe session reducer"]',
    '  n6["Timeline and local metrics"]',
    '  n7["Sanitized scorecard and handoff export"]',
    '  n8["Trusted server boundary"]',
    '  n9["Permanent API key - server only"]',
    '  n10["Temporary token minting"]',
    '  n11["Synthetic replay fixtures"]',
    '  n12["Explicit Configure control path"]',
    '  n13["TurnResumed cancellation path"]',
    `  n14["Active evidence path - ${mode === "live-provider" ? "live provider" : "synthetic replay"}"]`,
    "  n9 --> n8",
    "  n8 --> n10",
    "  n10 --> n3",
    "  n1 --> n2",
    "  n2 --> n3",
    "  n11 --> n4",
    "  n3 --> n4",
    "  n4 --> n5",
    "  n5 --> n6",
    "  n6 --> n7",
    "  n12 --> n3",
    "  n3 --> n5",
    "  n5 --> n13",
    "  n14 --> n6",
  ];
  if (optional) {
    lines.push(
      `  n15["Experimental orchestration - ${options.llmExecuted ? "observed" : "not executed"}"]`,
      `  n16["Optional LLM - ${options.llmExecuted ? "observed" : "not executed"}"]`,
      `  n17["Optional TTS - ${options.ttsExecuted ? "observed" : "not executed"}"]`,
      '  n18["Browser playback"]',
      "  n5 --> n15",
      "  n13 --> n15",
      "  n15 --> n16",
      "  n16 --> n17",
      "  n17 --> n18",
      "  n1 --> n18",
    );
  }
  return `${lines.join("\n")}\n`;
}

function sanitizeList(values: string[] | undefined) {
  return (values ?? []).slice(0, 50).map((value) => sanitizeFluxText(value, 500)).filter(Boolean);
}

function defaultStrengths(state: FluxObservatoryState) {
  const strengths: string[] = [];
  if (state.turns.some((turn) => turn.status === "complete")) strengths.push("The event pipeline handled at least one completed turn in this run.");
  if (state.turns.some((turn) => turn.resumedCount > 0)) strengths.push("The reducer handled TurnResumed without promoting stale eager state.");
  if (state.configurationHistory.some((entry) => entry.status === "provider-acknowledged")) strengths.push("A configuration update received an acknowledgement in this run.");
  return strengths;
}

function defaultFailures(state: FluxObservatoryState) {
  const failures: string[] = [];
  if (state.events.some((event) => event.kind === "provider-error")) failures.push("A provider or connection error was observed.");
  if (state.configurationHistory.some((entry) => entry.status === "provider-rejected")) failures.push("A configuration update was rejected; the last acknowledged configuration remained active.");
  if (state.events.some((event) => event.kind === "malformed-provider-message")) failures.push("A malformed provider payload was safely isolated.");
  return failures;
}

function formatMetric(label: string, metric: FluxMetricSummary) {
  const values = [`n=${metric.sampleSize}`, `min=${metric.minimum ?? "insufficient"}`, `max=${metric.maximum ?? "insufficient"}`];
  values.push(metric.median === undefined ? "median=insufficient observations" : `median=${metric.median} ms`);
  values.push(metric.p95 === undefined ? "P95=insufficient observations" : `P95=${metric.p95} ms`);
  return `- **${label}:** ${values.join("; ")}`;
}

function formatList(heading: string, values: string[]) {
  return [`## ${heading}`, "", ...(values.length ? values.map((value) => `- ${sanitizeFluxText(value, 500)}`) : ["- None recorded."]), ""].join("\n");
}
