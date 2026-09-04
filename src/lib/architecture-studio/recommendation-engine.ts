import { STUDIO_QUESTIONS, getQuestion } from "@/data/architecture-studio-discovery";
import { logStudioEvent } from "@/lib/architecture-studio/safe-log";
import type {
  ArchitectureRecommendation,
  PublicStudioSession,
  StudioAnswerValue,
  StudioRecommendationPath,
  StudioSession,
} from "@/types/architecture-studio";

export type ResolvedDiscoveryProfile = {
  values: Record<string, StudioAnswerValue>;
  disagreements: Array<{ questionId: string; values: StudioAnswerValue[] }>;
  answeredCritical: number;
  totalCritical: number;
};

const PATH_TITLES: Record<StudioRecommendationPath, string> = {
  "speech-intelligence": "Speech Intelligence starting architecture",
  "composable-voice": "Composable Voice Stack starting architecture",
  "managed-voice-agent": "Managed Voice Agent starting architecture",
  "private-deployment": "Private deployment exploration",
  "evaluation-first": "Evaluation-first architecture decision",
};

const PATH_SUMMARIES: Record<StudioRecommendationPath, string> = {
  "speech-intelligence": "Begin with the speech processing path and retain the customer’s CCaaS, business systems, and orchestration boundaries.",
  "composable-voice": "Evaluate Deepgram as a replaceable speech layer inside the customer’s existing telephony, LLM, tools, and orchestration stack.",
  "managed-voice-agent": "Evaluate a unified conversational pipeline while keeping tool contracts, business systems, and provider choices explicit.",
  "private-deployment": "Validate a customer-controlled deployment path before committing to topology, capacity, or commercial assumptions.",
  "evaluation-first": "Use representative audio and explicit decision gates to resolve the current unknowns before selecting a production package.",
};

const ALL_PATHS: StudioRecommendationPath[] = [
  "speech-intelligence",
  "composable-voice",
  "managed-voice-agent",
  "private-deployment",
  "evaluation-first",
];

export function resolveDiscoveryProfile(session: StudioSession | PublicStudioSession): ResolvedDiscoveryProfile {
  const values: Record<string, StudioAnswerValue> = {};
  const disagreements: ResolvedDiscoveryProfile["disagreements"] = [];

  for (const question of STUDIO_QUESTIONS) {
    if (Object.prototype.hasOwnProperty.call(session.presenterOverrides, question.id)) {
      values[question.id] = session.presenterOverrides[question.id];
      continue;
    }

    const live = session.answers.filter((answer) => answer.questionId === question.id && answer.participantId !== "scenario");
    const scenario = session.answers.filter((answer) => answer.questionId === question.id && answer.participantId === "scenario");
    const candidates = live.length > 0 ? live : scenario;
    if (candidates.length === 0) continue;

    const unique = uniqueValues(candidates.map((answer) => answer.value));
    if (live.length > 1 && unique.length > 1) disagreements.push({ questionId: question.id, values: unique });
    values[question.id] = combineValues(candidates.map((answer) => answer.value), question.kind === "multi");
  }

  const critical = STUDIO_QUESTIONS.filter((question) => question.critical);
  return {
    values,
    disagreements,
    answeredCritical: critical.filter((question) => hasMeaningfulValue(values[question.id])).length,
    totalCritical: critical.length,
  };
}

export function recommendArchitecture(session: StudioSession | PublicStudioSession): ArchitectureRecommendation {
  try {
    return recommendFromProfile(resolveDiscoveryProfile(session));
  } catch (error) {
    logStudioEvent("rule_engine_error", {
      code: session.code,
      reason: error instanceof Error ? error.name : "unknown",
      mode: session.realtimeMode,
    });
    return fallbackRecommendation();
  }
}

export function recommendFromProfile(profile: ResolvedDiscoveryProfile): ArchitectureRecommendation {
  const scores: Record<StudioRecommendationPath, number> = {
    "speech-intelligence": 0,
    "composable-voice": 0,
    "managed-voice-agent": 0,
    "private-deployment": 0,
    "evaluation-first": 2,
  };
  const influences: ArchitectureRecommendation["influences"] = [];
  const values = profile.values;

  function score(path: StudioRecommendationPath, points: number, questionId: string, effect: string) {
    scores[path] += points;
    const answer = values[questionId];
    if (answer !== undefined && !influences.some((item) => item.questionId === questionId && item.effect === effect)) {
      influences.push({ questionId, answer: formatAnswer(answer), effect });
    }
  }

  const useCases = asList(values["primary-use-case"]);
  const intelligenceCases = ["call-transcription", "analytics", "quality-assurance", "summarization", "compliance-monitoring", "agent-assist", "human-augmentation"];
  const intelligenceMatches = useCases.filter((value) => intelligenceCases.includes(value));
  if (intelligenceMatches.length > 0) score("speech-intelligence", 2 + intelligenceMatches.length, "primary-use-case", "Favors a speech-intelligence path before conversational orchestration.");
  if (useCases.includes("voice-agent") || useCases.includes("voice-transactions")) {
    score("composable-voice", 2, "primary-use-case", "Requires a live speech and orchestration loop.");
    score("managed-voice-agent", 2, "primary-use-case", "Makes a managed conversational path worth comparing.");
  }

  const processing = asString(values["processing-mode"]);
  if (processing === "prerecorded") score("speech-intelligence", 4, "processing-mode", "Prerecorded processing does not require a managed voice-agent loop.");
  if (processing === "streaming" || processing === "both") score("composable-voice", 1, "processing-mode", "Streaming audio needs an explicit realtime connection boundary.");

  const providers = asList(values["existing-providers"]);
  if (providers.includes("llm") || providers.includes("orchestration") || providers.includes("tts")) score("composable-voice", 4, "existing-providers", "Retains existing LLM, orchestration, or TTS investments.");
  if (providers.includes("none")) score("managed-voice-agent", 2, "existing-providers", "A unified managed path may reduce initial integration surface.");

  const strategy = asString(values["vendor-strategy"]);
  if (["augment", "retain", "replace-speech"].includes(strategy)) score("composable-voice", 4, "vendor-strategy", "Avoids an unnecessary replacement of the broader customer stack.");
  if (strategy === "consolidate") score("managed-voice-agent", 4, "vendor-strategy", "The customer explicitly wants to explore consolidated orchestration.");
  if (["undecided", "not-sure"].includes(strategy)) score("evaluation-first", 3, "vendor-strategy", "Competing vendor strategies need a controlled comparison.");

  const preference = asString(values["pipeline-preference"]);
  if (preference === "composable") score("composable-voice", 6, "pipeline-preference", "The team prefers to own orchestration and component boundaries.");
  if (preference === "managed") score("managed-voice-agent", 6, "pipeline-preference", "The team prefers to evaluate managed orchestration first.");
  if (preference === "compare") {
    score("evaluation-first", 5, "pipeline-preference", "The same evaluation set should compare composable and managed paths.");
    score("composable-voice", 1, "pipeline-preference", "Composable remains a candidate in the requested comparison.");
    score("managed-voice-agent", 1, "pipeline-preference", "Managed orchestration remains a candidate in the requested comparison.");
  }

  const turnTaking = asList(values["turn-taking"]);
  if (turnTaking.some((value) => ["barge-in", "fast-end-turn", "configurable-silence"].includes(value))) {
    score("managed-voice-agent", 2, "turn-taking", "Turn-sensitive behavior benefits from evaluating an integrated conversational path.");
    score("composable-voice", 1, "turn-taking", "A composable path must make turn and playback cancellation ownership explicit.");
  }

  const deployment = asString(values["deployment-preference"]);
  if (["private-cloud", "self-hosted", "on-prem", "hybrid"].includes(deployment)) score("private-deployment", 8, "deployment-preference", "The selected deployment boundary requires a private or self-hosted exploration.");
  if (deployment === "compare") {
    score("private-deployment", 4, "deployment-preference", "Private deployment remains a candidate to validate.");
    score("evaluation-first", 3, "deployment-preference", "Cloud and private paths need a requirements and commercial comparison.");
  }

  const controls = asList(values["data-control"]);
  const strictControls = controls.filter((value) => ["residency", "no-retention", "segmented", "vendor-access", "customer-keys"].includes(value));
  if (strictControls.length > 0) score("private-deployment", 2 + strictControls.length, "data-control", "Strict data-control constraints may change the deployment boundary.");

  const concurrency = asString(values["concurrency"]);
  if (concurrency === "over-5000") score("private-deployment", 1, "concurrency", "Predictable high volume makes infrastructure economics worth validating.");

  if (profile.disagreements.length > 0) {
    scores["evaluation-first"] += Math.min(6, profile.disagreements.length * 2);
    influences.push({ questionId: profile.disagreements[0].questionId, answer: "Stakeholders selected different answers", effect: "Disagreement should become an explicit evaluation or decision checkpoint." });
  }

  const decisionSignals = ["primary-use-case", "vendor-strategy", "pipeline-preference", "deployment-preference", "primary-metrics"];
  const answeredDecisionSignals = decisionSignals.filter((id) => hasMeaningfulValue(values[id])).length;
  if (answeredDecisionSignals < 2) scores["evaluation-first"] += 8;
  if (profile.answeredCritical < 7) scores["evaluation-first"] += 5;

  const ranked = ALL_PATHS.map((path) => ({ path, score: scores[path] })).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const topNonEvaluation = ranked.filter((entry) => entry.path !== "evaluation-first")[0];
  let primaryPath = ranked[0].path;
  if (answeredDecisionSignals < 2 || profile.answeredCritical < 5) primaryPath = "evaluation-first";
  else if (ranked[0].path !== "private-deployment" && ranked[0].score - ranked[1].score < 2) primaryPath = "evaluation-first";

  const answerRatio = profile.totalCritical === 0 ? 0 : profile.answeredCritical / profile.totalCritical;
  const confidence = answerRatio >= 0.75 && profile.disagreements.length === 0
    ? "high"
    : answerRatio >= 0.5
      ? "moderate"
      : answerRatio >= 0.25
        ? "developing"
        : "low";

  const unresolvedQuestions = STUDIO_QUESTIONS
    .filter((question) => question.critical && !hasMeaningfulValue(values[question.id]))
    .map((question) => question.label)
    .slice(0, 10);
  for (const disagreement of profile.disagreements.slice(0, 4)) {
    unresolvedQuestions.unshift(`Resolve stakeholder disagreement: ${getQuestion(disagreement.questionId)?.label ?? disagreement.questionId}`);
  }

  const assumptions = buildAssumptions(primaryPath, values);
  const alternativesConsidered = ranked
    .filter((entry) => entry.path !== primaryPath && entry.score > 0)
    .slice(0, 3)
    .map((entry) => ({
      path: entry.path,
      reason: entry.path === "evaluation-first"
        ? "Use this if current unknowns or stakeholder conflicts block a responsible production choice."
        : `Still plausible at score ${entry.score}; validate the assumptions that distinguish it from ${PATH_TITLES[primaryPath].toLowerCase()}.`,
    }));

  return {
    primaryPath,
    title: PATH_TITLES[primaryPath],
    summary: PATH_SUMMARIES[primaryPath],
    confidence,
    confidenceReason: `${profile.answeredCritical} of ${profile.totalCritical} critical questions have evidence${profile.disagreements.length ? `, with ${profile.disagreements.length} stakeholder disagreement${profile.disagreements.length === 1 ? "" : "s"}` : " and no recorded stakeholder disagreement"}.`,
    scores,
    influences: influences.slice(-10),
    assumptions,
    unresolvedQuestions,
    tradeoffs: tradeoffsFor(primaryPath),
    alternativesConsidered,
    changeTriggers: changeTriggersFor(primaryPath, topNonEvaluation?.path),
    capabilityIds: capabilitiesFor(primaryPath, values),
  };
}

function buildAssumptions(path: StudioRecommendationPath, values: Record<string, StudioAnswerValue>) {
  const assumptions = ["Commercial terms, regional availability, capacity, and account entitlements require confirmation with Deepgram."];
  if (!values["audio-format"]) assumptions.push("Codec, container, and sample rate will be confirmed from captured media rather than inferred.");
  if (!values["baseline"] || asList(values["baseline"]).includes("none")) assumptions.push("A representative baseline and human-reviewed reference set must be created.");
  if (path === "composable-voice") assumptions.push("The existing LLM and orchestration layers expose stable streaming and tool interfaces worth retaining.");
  if (path === "managed-voice-agent") assumptions.push("The team is willing to evaluate a managed conversational control plane while retaining explicit business-tool contracts.");
  if (path === "private-deployment") assumptions.push("A private path is a discovery outcome, not a confirmed entitlement, hardware design, or commercial commitment.");
  if (path === "speech-intelligence") assumptions.push("Conversational action orchestration is not required for the first production milestone.");
  if (path === "evaluation-first") assumptions.push("The team will use the same representative data and acceptance gates across viable alternatives.");
  return assumptions;
}

function tradeoffsFor(path: StudioRecommendationPath) {
  const common = "Performance and unit cost remain measurement questions until representative audio, concurrency, and failure behavior are tested.";
  const map: Record<StudioRecommendationPath, string[]> = {
    "speech-intelligence": ["Smaller integration surface, but the customer retains downstream analytics, queues, and orchestration ownership.", "Streaming and batch feature combinations must be validated separately.", common],
    "composable-voice": ["Maximum component control and vendor flexibility, with more customer-owned realtime orchestration and observability.", "Turn-taking and interruption quality depend on the complete media-to-playback loop.", common],
    "managed-voice-agent": ["Faster path to an integrated loop, with less control over some orchestration internals.", "Tool authorization, confirmation, rollback, and human handoff still require customer-owned contracts.", common],
    "private-deployment": ["Greater infrastructure and data-boundary control, with materially higher capacity planning and operational responsibility.", "Model, feature, hardware, support, and commercial assumptions need direct validation.", common],
    "evaluation-first": ["Delays a package decision, but reduces the cost of building the wrong topology.", "Requires disciplined datasets, human review, and agreed acceptance thresholds.", common],
  };
  return map[path];
}

function changeTriggersFor(path: StudioRecommendationPath, closest?: StudioRecommendationPath) {
  const triggers: Record<StudioRecommendationPath, string[]> = {
    "speech-intelligence": ["A transactional conversational use case becomes the first milestone.", "The customer asks Deepgram to own turn and response orchestration.", "Strict infrastructure controls require a private deployment path."],
    "composable-voice": ["The customer no longer wants to own realtime orchestration.", "A managed Voice Agent evaluation meets the same acceptance gates with lower operational burden.", "Private-deployment constraints dominate component selection."],
    "managed-voice-agent": ["The existing LLM, TTS, or orchestration layer must remain authoritative.", "Tool or transaction controls require lower-level pipeline ownership.", "A managed path cannot meet deployment constraints."],
    "private-deployment": ["Security review confirms the hosted API meets the actual data-control requirements.", "Capacity or operational responsibility makes self-hosting disproportionate.", "Required product or feature support differs across deployment modes."],
    "evaluation-first": ["Stakeholders agree on the operating model and primary success gates.", "Representative tests create a clear score separation between alternatives.", "Deployment and commercial assumptions are validated."],
  };
  return closest && closest !== path ? [...triggers[path], `${PATH_TITLES[closest]} becomes the current best fit if its remaining assumptions are confirmed.`] : triggers[path];
}

function capabilitiesFor(path: StudioRecommendationPath, values: Record<string, StudioAnswerValue>) {
  const ids = new Set<string>();
  if (path === "speech-intelligence") ids.add(asString(values["processing-mode"]) === "prerecorded" ? "nova-3-batch" : "nova-3-streaming");
  if (path === "composable-voice") { ids.add("flux-stt"); ids.add("aura-2"); ids.add("sdk-browser-telephony"); }
  if (path === "managed-voice-agent") { ids.add("voice-agent-api"); ids.add("flux-stt"); ids.add("aura-2"); }
  if (path === "private-deployment") { ids.add("self-hosted-deployment"); ids.add("nova-3-streaming"); }
  if (path === "evaluation-first") { ids.add("nova-3-batch"); ids.add("nova-3-streaming"); }
  if (asList(values["transcript-features"]).includes("diarization")) ids.add("diarization");
  if (asList(values["transcript-features"]).some((item) => ["punctuation", "smart-format", "timestamps"].includes(item))) ids.add("formatting");
  if (asList(values["transcript-features"]).includes("redaction")) ids.add("redaction");
  if (asList(values["languages"]).length > 0) ids.add("language-support");
  ids.add(asString(values["deployment-preference"]) === "cloud-api" ? "hosted-deployment" : path === "private-deployment" ? "self-hosted-deployment" : "hosted-deployment");
  return [...ids];
}

function fallbackRecommendation(): ArchitectureRecommendation {
  return {
    primaryPath: "evaluation-first",
    title: PATH_TITLES["evaluation-first"],
    summary: "The rule engine could not safely resolve the current snapshot. Keep the workshop usable, preserve the evidence, and validate the session before making an architecture choice.",
    confidence: "low",
    confidenceReason: "Recommendation evidence is temporarily unavailable; no product path should be inferred from this state.",
    scores: {
      "speech-intelligence": 0,
      "composable-voice": 0,
      "managed-voice-agent": 0,
      "private-deployment": 0,
      "evaluation-first": 1,
    },
    influences: [],
    assumptions: ["The current session snapshot must be validated before recommendation work continues."],
    unresolvedQuestions: ["Validate the discovery-session state and retry the deterministic rules."],
    tradeoffs: ["Holding the decision avoids presenting a possibly incorrect architecture while the session is recovered."],
    alternativesConsidered: [],
    changeTriggers: ["The deterministic rule engine successfully evaluates the validated session snapshot."],
    capabilityIds: [],
  };
}

function combineValues(values: StudioAnswerValue[], multi: boolean): StudioAnswerValue {
  if (multi) return [...new Set(values.flatMap((value) => Array.isArray(value) ? value : [String(value)]))].sort();
  const counts = new Map<string, { count: number; value: StudioAnswerValue }>();
  for (const value of values) {
    const key = stableValue(value);
    counts.set(key, { count: (counts.get(key)?.count ?? 0) + 1, value });
  }
  return [...counts.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))[0][1].value;
}

function uniqueValues(values: StudioAnswerValue[]) {
  const map = new Map(values.map((value) => [stableValue(value), value]));
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value);
}

function stableValue(value: StudioAnswerValue) {
  return Array.isArray(value) ? JSON.stringify([...value].sort()) : JSON.stringify(value);
}

function hasMeaningfulValue(value: StudioAnswerValue | undefined) {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function asList(value: StudioAnswerValue | undefined): string[] {
  if (Array.isArray(value)) return value.map(String);
  return value === undefined ? [] : [String(value)];
}

function asString(value: StudioAnswerValue | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value === undefined ? "" : String(value);
}

export function formatAnswer(value: StudioAnswerValue) {
  return Array.isArray(value) ? value.join(", ") : String(value);
}
