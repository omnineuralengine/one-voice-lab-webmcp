import { buildFluxConfigureMessage } from "./config";
import { deriveFluxMetrics } from "./metrics";
import { sanitizeFluxText } from "./security";
import type { FluxHandoffs, FluxObservatoryState } from "./types";

export interface FluxHandoffContext {
  customerPattern?: string;
  desiredTurnBehavior?: string;
  latencyRequirement?: string;
  interruptionRequirement?: string;
  risks?: string[];
  unresolvedDiscoveryQuestions?: string[];
  deploymentAssumptions?: string[];
}

export function buildFluxHandoffs(state: FluxObservatoryState, context: FluxHandoffContext = {}): FluxHandoffs {
  const configuration = state.activeConfiguration;
  const metrics = deriveFluxMetrics(state);
  const risks = sanitizeList(context.risks ?? [
    "Local browser timing is not a provider SLA or universal benchmark.",
    "Live provider behavior still requires scenario-specific microphone evidence unless manually validated.",
  ]);
  const assumptions = sanitizeList(context.deploymentAssumptions ?? ["Permanent credentials remain in a trusted server boundary."]);
  const evidenceStatus = state.mode === "synthetic-replay"
    ? "Implemented with deterministic fixtures; not a live Deepgram result."
    : state.providerValidationState === "manually-validated"
      ? "Live provider observation was manually reviewed for this run only."
      : "Live provider event observed; manual review remains required.";
  return {
    liveSolutionStudio: {
      customerPattern: safe(context.customerPattern, "Conversational voice workflow requiring explicit turn boundaries."),
      desiredTurnBehavior: safe(context.desiredTurnBehavior, "Distinguish eager, resumed, and confirmed turn boundaries."),
      thresholdHypothesis: `Start with eot_threshold=${configuration.thresholds.eotThreshold}, eager_eot_threshold=${configuration.thresholds.eagerEotThreshold ?? "disabled"}, and eot_timeout_ms=${configuration.thresholds.eotTimeoutMs}; validate against representative speakers.`,
      latencyRequirement: safe(context.latencyRequirement, "Unknown - define the user-perceived measure and percentile before making a recommendation."),
      interruptionRequirement: safe(context.interruptionRequirement, "Confirm whether StartOfTurn should cancel or interrupt downstream output."),
      evidenceStatus,
      risks,
      unresolvedDiscoveryQuestions: sanitizeList(context.unresolvedDiscoveryQuestions ?? [
        "Which speakers, pauses, accents, and noise conditions must the POC cover?",
        "Which user-perceived latency boundary matters?",
        "What should happen when a speculative response is cancelled?",
      ]),
    },
    architectureStudio: {
      model: configuration.model,
      clientServerOwnership: "Browser owns consented capture and bounded buffering; trusted server owns temporary-token minting and authorization policy.",
      credentialBoundary: "Permanent DEEPGRAM_API_KEY remains server-side; a short-lived credential exists only in browser memory.",
      audioTransport: `${configuration.encoding} at ${configuration.sampleRate} Hz over /v2/listen WebSocket; configured chunk target ${configuration.targetChunkMs} ms is measured, not guaranteed.`,
      turnEventFlow: ["Update", "StartOfTurn", "EagerEndOfTurn", "TurnResumed", "EndOfTurn"],
      configurationPath: "Explicit browser action sends a validated Configure message; active state changes only after ConfigureSuccess.",
      integrationPlaceholders: ["Optional LLM boundary", "Optional TTS boundary", "Optional tool boundary"],
      cancellationBehavior: "TurnResumed cancels stale speculative work; StartOfTurn is available as an interruption cue.",
      reconnectStrategy: "Acquire a fresh temporary credential, activate a new connection generation, and ignore obsolete-generation events.",
      observabilityPoints: ["audio chunk cadence", "connection lifecycle", "turn events", "configuration outcomes", "local timing", "sanitized exports"],
      deploymentAssumptions: assumptions,
    },
    apiLab: {
      endpoint: "/v2/listen",
      transport: "wss",
      supportedParameters: ["model", "encoding", "sample_rate", "eot_threshold", "eager_eot_threshold", "eot_timeout_ms", "keyterm", "language_hint"],
      exampleConfiguration: buildFluxConfigureMessage({ thresholds: { ...configuration.thresholds }, keyterms: [...configuration.keyterms], languageHints: [...configuration.languageHints] }, configuration),
      eventSchema: ["Connected", "TurnInfo.Update", "TurnInfo.StartOfTurn", "TurnInfo.EagerEndOfTurn", "TurnInfo.TurnResumed", "TurnInfo.EndOfTurn", "ConfigureSuccess", "ConfigureFailure", "Error"],
      authenticationBoundary: "Use server-minted temporary credentials for an explicitly initiated browser connection; never transfer the permanent key.",
    },
    solutionDeliverablesStudio: {
      evidenceSummary: `${evidenceStatus} ${metrics.completedTurnCount} completed turn(s) and ${metrics.resumedTurnCount} resumed turn event(s) were retained as bounded, sanitized session evidence.`,
      architectureData: [
        "Browser microphone -> AudioWorklet and bounded buffer -> Flux /v2/listen",
        "Flux events -> normalizer -> generation-safe reducer -> timeline and metrics",
        "Trusted server -> temporary token; permanent key never enters the browser",
      ],
      pocMetrics: metrics,
      assumptions,
      risks,
      productionReadinessGaps: ["representative live audio", "scale and reliability", "security and retention review", "compliance", "cost", "operational acceptance"],
      sourceLabels: [state.mode === "synthetic-replay" ? "Synthetic fixture" : "Locally measured", "Deepgram documentation verified", "Manual validation required"],
    },
  };
}

function safe(value: string | undefined, fallback: string) {
  return sanitizeFluxText(value ?? fallback, 500);
}

function sanitizeList(values: string[]) {
  return values.slice(0, 30).map((value) => sanitizeFluxText(value, 500)).filter(Boolean);
}
