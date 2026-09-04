import {
  getOneConciergeDestination,
  getOneConciergeIntent,
  ONE_CONCIERGE_CLARIFICATIONS,
  ONE_CONCIERGE_INTENTS,
  ONE_CONCIERGE_REGISTRY_VERSION,
  type OneConciergeDestinationId,
  type OneConciergeIntentId,
} from "@/lib/concierge/registry";

export const ONE_CONCIERGE_MAX_INPUT_LENGTH = 240;
export const ONE_CONCIERGE_MAX_RESULTS = 3;

export type OneConciergeInputIssue =
  | "empty"
  | "too-long"
  | "control-characters"
  | "url-or-path"
  | "markup-or-injection"
  | "multiple-commands";

export type OneConciergeResolution =
  | Readonly<{
      status: "matched";
      registryVersion: typeof ONE_CONCIERGE_REGISTRY_VERSION;
      normalizedInput: string;
      intentId: OneConciergeIntentId;
      destinationIds: readonly OneConciergeDestinationId[];
    }>
  | Readonly<{
      status: "ambiguous";
      registryVersion: typeof ONE_CONCIERGE_REGISTRY_VERSION;
      normalizedInput: string;
      prompt: string;
      intentIds: readonly OneConciergeIntentId[];
      destinationIds: readonly OneConciergeDestinationId[];
    }>
  | Readonly<{
      status: "unsupported";
      registryVersion: typeof ONE_CONCIERGE_REGISTRY_VERSION;
      normalizedInput: string;
      issue: OneConciergeInputIssue | "no-match";
    }>
  | Readonly<{
      status: "unavailable";
      registryVersion: typeof ONE_CONCIERGE_REGISTRY_VERSION;
      normalizedInput: string;
      reason: "registry-version" | "destination-unavailable" | "offline";
      intentId: OneConciergeIntentId | null;
      destinationIds: readonly OneConciergeDestinationId[];
    }>;

export type OneConciergeResolverOptions = Readonly<{
  registryVersion?: string;
  online?: boolean;
  unavailableDestinationIds?: readonly OneConciergeDestinationId[];
}>;

type NormalizedInput =
  | Readonly<{ ok: true; value: string }>
  | Readonly<{ ok: false; value: string; issue: OneConciergeInputIssue }>;

const STOP_WORDS = new Set([
  "a", "an", "and", "can", "for", "help", "i", "in", "is", "me", "my", "of", "one", "please", "the", "to", "want", "with",
]);

export function normalizeOneConciergeInput(rawInput: string): NormalizedInput {
  if (rawInput.length > ONE_CONCIERGE_MAX_INPUT_LENGTH * 2) {
    return { ok: false, value: "", issue: "too-long" };
  }
  if (!rawInput.trim()) return { ok: false, value: "", issue: "empty" };
  if (Array.from(rawInput).length > ONE_CONCIERGE_MAX_INPUT_LENGTH) {
    return { ok: false, value: "", issue: "too-long" };
  }

  const whitespaceNormalized = rawInput.replace(/[\t\r\n]+/gu, " ");
  if (/[\p{Cc}\p{Cf}]/u.test(whitespaceNormalized)) {
    return { ok: false, value: "", issue: "control-characters" };
  }

  const value = whitespaceNormalized
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .trim()
    .replace(/\s+/gu, " ");

  if (!value) return { ok: false, value: "", issue: "empty" };
  if (Array.from(value).length > ONE_CONCIERGE_MAX_INPUT_LENGTH) {
    return { ok: false, value: "", issue: "too-long" };
  }
  if (/(?:\b(?:https?|javascript|data|file|vbscript):|(?:^|\s)\/\/|(?:^|\s)\/[a-z0-9._~-])/iu.test(value)) {
    return { ok: false, value, issue: "url-or-path" };
  }
  if (/<\s*\/?\s*[a-z!][^>]*>|\bignore\s+(?:all\s+)?(?:previous|prior)\b|\bsystem\s+prompt\b|\b(?:provider|model|fixture|owner|trust(?:\s+tier)?|authorization)\s*[:=]/iu.test(value)) {
    return { ok: false, value, issue: "markup-or-injection" };
  }
  const commandVerb = "(?:open|run|start|execute|upload|submit|save|download|select|choose|navigate|go|launch|transcribe|synthesize|generate|compare|evaluate)";
  if (
    new RegExp(`(?:;|&&|\\|\\||\\b(?:and\\s+then|after\\s+that|then|next|and|also)\\s+${commandVerb}\\b|[,.!?]\\s*(?:and\\s+)?(?:then\\s+)?${commandVerb}\\b)`, "iu").test(value)
  ) {
    return { ok: false, value, issue: "multiple-commands" };
  }
  return { ok: true, value };
}

export function resolveOneConciergeGoal(
  rawInput: string,
  options: OneConciergeResolverOptions = {},
): OneConciergeResolution {
  const normalized = normalizeOneConciergeInput(rawInput);
  if (!normalized.ok) {
    return {
      status: "unsupported",
      registryVersion: ONE_CONCIERGE_REGISTRY_VERSION,
      normalizedInput: normalized.value,
      issue: normalized.issue,
    };
  }

  if (options.registryVersion && options.registryVersion !== ONE_CONCIERGE_REGISTRY_VERSION) {
    return {
      status: "unavailable",
      registryVersion: ONE_CONCIERGE_REGISTRY_VERSION,
      normalizedInput: normalized.value,
      reason: "registry-version",
      intentId: null,
      destinationIds: [],
    };
  }

  const clarification = ONE_CONCIERGE_CLARIFICATIONS.find((item) => item.phrase === normalized.value);
  if (clarification) {
    return buildAmbiguousResolution(
      normalized.value,
      clarification.prompt,
      clarification.intentIds,
      options,
    );
  }

  const ranked = ONE_CONCIERGE_INTENTS
    .map((intent, index) => ({
      intent,
      index,
      score: Math.max(...intent.synonyms.map((synonym) => scorePhrase(normalized.value, synonym))),
    }))
    .filter((item) => item.score >= 60)
    .sort((left, right) => right.score - left.score || left.index - right.index);

  const best = ranked[0];
  if (!best) {
    return {
      status: "unsupported",
      registryVersion: ONE_CONCIERGE_REGISTRY_VERSION,
      normalizedInput: normalized.value,
      issue: "no-match",
    };
  }

  const closeMatches = ranked
    .filter((item) => item.score >= best.score - 5)
    .slice(0, ONE_CONCIERGE_MAX_RESULTS);
  if (closeMatches.length > 1) {
    return buildAmbiguousResolution(
      normalized.value,
      "Which outcome is closest to what you want to accomplish?",
      closeMatches.map((item) => item.intent.id),
      options,
    );
  }

  const allDestinationIds = best.intent.destinationIds.slice(0, ONE_CONCIERGE_MAX_RESULTS);
  const availableDestinationIds = availableDestinations(allDestinationIds, options);
  if (availableDestinationIds.length === 0) {
    return {
      status: "unavailable",
      registryVersion: ONE_CONCIERGE_REGISTRY_VERSION,
      normalizedInput: normalized.value,
      reason: options.online === false ? "offline" : "destination-unavailable",
      intentId: best.intent.id,
      destinationIds: allDestinationIds,
    };
  }

  return {
    status: "matched",
    registryVersion: ONE_CONCIERGE_REGISTRY_VERSION,
    normalizedInput: normalized.value,
    intentId: best.intent.id,
    destinationIds: availableDestinationIds,
  };
}

function buildAmbiguousResolution(
  normalizedInput: string,
  prompt: string,
  intentIds: readonly OneConciergeIntentId[],
  options: OneConciergeResolverOptions,
): OneConciergeResolution {
  const boundedIntentIds = intentIds.slice(0, ONE_CONCIERGE_MAX_RESULTS);
  const destinationIds = [...new Set(
    boundedIntentIds.flatMap((intentId) => getOneConciergeIntent(intentId)?.destinationIds ?? []),
  )].slice(0, ONE_CONCIERGE_MAX_RESULTS);
  const availableDestinationIds = availableDestinations(destinationIds, options);
  if (availableDestinationIds.length === 0) {
    return {
      status: "unavailable",
      registryVersion: ONE_CONCIERGE_REGISTRY_VERSION,
      normalizedInput,
      reason: options.online === false ? "offline" : "destination-unavailable",
      intentId: null,
      destinationIds,
    };
  }
  const availableIntentIds = boundedIntentIds.filter((intentId) => {
    const intent = getOneConciergeIntent(intentId);
    return intent?.destinationIds.some((destinationId) => availableDestinationIds.includes(destinationId)) ?? false;
  });
  return {
    status: "ambiguous",
    registryVersion: ONE_CONCIERGE_REGISTRY_VERSION,
    normalizedInput,
    prompt,
    intentIds: availableIntentIds,
    destinationIds: availableDestinationIds,
  };
}

function availableDestinations(
  destinationIds: readonly OneConciergeDestinationId[],
  options: OneConciergeResolverOptions,
) {
  const unavailable = new Set(options.unavailableDestinationIds ?? []);
  return destinationIds.filter((destinationId) => {
    if (unavailable.has(destinationId)) return false;
    const destination = getOneConciergeDestination(destinationId);
    if (!destination) return false;
    return options.online !== false || destination.offlineShellAvailable;
  });
}

function scorePhrase(input: string, phrase: string) {
  const normalizedPhrase = phrase.normalize("NFKC").toLocaleLowerCase("en-US").trim().replace(/\s+/gu, " ");
  if (input === normalizedPhrase) return 1_000;
  if (containsWholePhrase(input, normalizedPhrase)) return 500 + normalizedPhrase.length;

  const inputTokens = significantTokens(input);
  const phraseTokens = significantTokens(normalizedPhrase);
  if (inputTokens.length === 0 || phraseTokens.length === 0) return 0;
  const phraseTokenSet = new Set(phraseTokens);
  const overlap = inputTokens.filter((token) => phraseTokenSet.has(token)).length;
  if (overlap === 0) return 0;
  const phraseCoverage = overlap / phraseTokens.length;
  const inputCoverage = overlap / inputTokens.length;
  return Math.round(phraseCoverage * 60 + inputCoverage * 40);
}

function containsWholePhrase(input: string, phrase: string) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escaped}(?:$|\\s|[,.!?])`, "iu").test(input);
}

function significantTokens(value: string) {
  return (value.match(/[\p{L}\p{N}]+/gu) ?? []).filter((token) => !STOP_WORDS.has(token));
}
