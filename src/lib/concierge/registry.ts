import type { InterfaceDepth } from "@/lib/one/interface-depth";
import {
  getVoiceOpenLabNavigationArea,
  VOICE_OPEN_LAB_EXPERIENCES,
  VOICE_OPEN_LAB_LEARN_SURFACES,
} from "@/lib/voice-open-lab/navigation";

export const ONE_CONCIERGE_REGISTRY_VERSION = "one-concierge-navigation/1.1.0" as const;

export const ONE_CONCIERGE_DESTINATION_IDS = [
  "explore",
  "transcribe-audio",
  "create-speech",
  "compare-providers",
  "evaluate-evidence",
  "stt-evaluation-methodology",
  "scenario-studio",
  "build",
  "learn",
] as const;

export type OneConciergeDestinationId = (typeof ONE_CONCIERGE_DESTINATION_IDS)[number];

export const ONE_CONCIERGE_INTENT_IDS = [
  "start",
  "transcribe",
  "synthesize",
  "compare-providers",
  "evaluate",
  "evaluate-stt",
  "scenario",
  "build",
  "learn",
] as const;

export type OneConciergeIntentId = (typeof ONE_CONCIERGE_INTENT_IDS)[number];

type AdaptiveCopy = Readonly<Record<InterfaceDepth, string>>;

export type OneConciergeDestination = Readonly<{
  id: OneConciergeDestinationId;
  href: string;
  label: string;
  outcome: string;
  why: AdaptiveCopy;
  inputDisclosure: string;
  providerDisclosure: string;
  costDisclosure: string;
  persistenceDisclosure: string;
  confirmationDisclosure: string;
  accessDisclosure: "Guest allowed";
  offlineShellAvailable: boolean;
}>;

export type OneConciergeIntent = Readonly<{
  id: OneConciergeIntentId;
  label: string;
  reflection: AdaptiveCopy;
  synonyms: readonly string[];
  destinationIds: readonly OneConciergeDestinationId[];
  approvedRouteContextHints: readonly string[];
}>;

function adaptiveCopy(
  essential: string,
  guided: string,
  detailed: string,
  technical: string,
): AdaptiveCopy {
  return { essential, guided, detailed, technical };
}

function experience(id: (typeof VOICE_OPEN_LAB_EXPERIENCES)[number]["id"]) {
  const item = VOICE_OPEN_LAB_EXPERIENCES.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Missing canonical ONE experience: ${id}`);
  return item;
}

function learnSurface(id: (typeof VOICE_OPEN_LAB_LEARN_SURFACES)[number]["id"]) {
  const item = VOICE_OPEN_LAB_LEARN_SURFACES.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Missing canonical ONE learning surface: ${id}`);
  return item;
}

const explore = getVoiceOpenLabNavigationArea("explore");
const compare = getVoiceOpenLabNavigationArea("compare");
const evaluate = getVoiceOpenLabNavigationArea("evaluate");
const build = getVoiceOpenLabNavigationArea("build");
const learn = getVoiceOpenLabNavigationArea("learn");
const upload = experience("upload");
const generate = experience("generate");
const methodology = learnSurface("methodology");

export const ONE_CONCIERGE_DESTINATIONS: readonly OneConciergeDestination[] = [
  {
    id: "explore",
    href: explore.href,
    label: "Explore ONE",
    outcome: "See the main voice capabilities and choose a direct path at your own pace.",
    why: adaptiveCopy(
      "A calm overview when you are deciding where to begin.",
      "A goal-first overview that explains the useful starting points without requiring provider knowledge.",
      "A capability-centered overview with direct routes to transcription, speech generation, comparison, and evaluation.",
      "The provider-neutral root route, with adaptive disclosures and stable links into the underlying ONE surfaces.",
    ),
    inputDisclosure: "No input is required to arrive.",
    providerDisclosure: "No provider is selected or contacted by this recommendation.",
    costDisclosure: "Navigation has no provider cost.",
    persistenceDisclosure: "The concierge does not save this goal.",
    confirmationDisclosure: "Any consequential action still requires its own control after arrival.",
    accessDisclosure: "Guest allowed",
    offlineShellAvailable: true,
  },
  {
    id: "transcribe-audio",
    href: upload.href,
    label: "Transcribe approved audio",
    outcome: "Choose an approved audio file and review a transcript through ONE's existing transcription journey.",
    why: adaptiveCopy(
      "The direct path for turning speech into text.",
      "This opens ONE's trusted upload flow, where you stay in control of the file and submission.",
      "This opens the bounded upload-audio module with its existing media checks, provider policy, and result provenance.",
      "Registered destination transcribe-audio maps to the canonical upload-audio module; its guards remain authoritative.",
    ),
    inputDisclosure: "You may choose an approved local audio file after arrival.",
    providerDisclosure: "A provider may be involved only after you make the destination's explicit transcription choice.",
    costDisclosure: "Navigation is free; a confirmed live transcription can use quota or provider credits.",
    persistenceDisclosure: "ONE does not retain this concierge goal; review the destination's audio and transcript controls.",
    confirmationDisclosure: "Arriving does not upload or transcribe anything.",
    accessDisclosure: "Guest allowed",
    offlineShellAvailable: false,
  },
  {
    id: "create-speech",
    href: generate.href,
    label: "Create speech from text",
    outcome: "Open the existing text-to-speech workspace and prepare reviewed text for synthesis.",
    why: adaptiveCopy(
      "The direct path for turning text into speech.",
      "This opens ONE's protected speech-generation flow without choosing a provider or voice for you.",
      "This opens the batch TTS workspace; model, voice, policy, quota, and confirmation remain destination controls.",
      "Registered destination create-speech maps to the canonical tts module and grants no execution authority.",
    ),
    inputDisclosure: "You may enter or review text after arrival.",
    providerDisclosure: "The concierge never chooses a provider, model, or voice; the destination owns those controls.",
    costDisclosure: "Navigation is free; confirmed live synthesis can use quota or provider credits.",
    persistenceDisclosure: "ONE does not retain this concierge goal; the destination explains any output handling.",
    confirmationDisclosure: "Arriving does not generate or play audio.",
    accessDisclosure: "Guest allowed",
    offlineShellAvailable: false,
  },
  {
    id: "compare-providers",
    href: compare.href,
    label: "Compare provider capabilities",
    outcome: "Inspect attributable capabilities, readiness, and limitations without treating availability as quality.",
    why: adaptiveCopy(
      "Use this when you want to understand provider choices.",
      "This compares provider capabilities and readiness while keeping ONE's experience provider-neutral.",
      "This opens the Provider Hub's normalized catalog, provenance, readiness, and limitation views.",
      "Registered destination compare-providers maps to the canonical Provider Hub projection; it performs no provider dispatch.",
    ),
    inputDisclosure: "No file, prompt, or provider choice is required to arrive.",
    providerDisclosure: "Provider identities remain visible for provenance, but the concierge does not rank or select them.",
    costDisclosure: "Navigation and catalog inspection do not spend provider credits.",
    persistenceDisclosure: "The concierge does not save this goal or a provider preference.",
    confirmationDisclosure: "Any later provider operation keeps its own confirmation and policy checks.",
    accessDisclosure: "Guest allowed",
    offlineShellAvailable: true,
  },
  {
    id: "evaluate-evidence",
    href: evaluate.href,
    label: "Evaluate voice outputs",
    outcome: "Compare controlled outputs and inspect what the measurements can and cannot establish.",
    why: adaptiveCopy(
      "Use this when you want evidence, not a universal ranking.",
      "This opens ONE Evaluate, where results are paired with a plain-language explanation and limitations.",
      "This opens deterministic fixture comparison and protected-live evaluation controls with explicit provenance.",
      "Registered destination evaluate-evidence maps to /evaluate; evaluation schemas, admission, and evidence remain unchanged.",
    ),
    inputDisclosure: "You can inspect available fixture plans after arrival; no run starts automatically.",
    providerDisclosure: "Providers remain attributable in evidence, but the concierge does not recommend a winner.",
    costDisclosure: "Navigation is free; fixture and live evaluation modes disclose their own cost boundary.",
    persistenceDisclosure: "The concierge saves nothing; Evaluate owns any result visibility or retention controls.",
    confirmationDisclosure: "Arriving does not run an evaluation.",
    accessDisclosure: "Guest allowed",
    offlineShellAvailable: true,
  },
  {
    id: "stt-evaluation-methodology",
    href: `${methodology.href}#stt-evaluation-availability`,
    label: "STT evaluation is not currently runnable",
    outcome: "STT evaluation is planned and not currently runnable. View the methodology and current availability.",
    why: adaptiveCopy(
      "ONE does not currently offer a runnable speech-recognition evaluation.",
      "This opens the STT methodology boundary without presenting the TTS comparison as speech-recognition evidence.",
      "The methodology explains the current planned state and why the existing TTS fixture workspace does not measure WER.",
      "Registered destination stt-evaluation-methodology maps to the canonical methodology surface; no STT runner or provider dispatch exists.",
    ),
    inputDisclosure: "No audio, transcript, or reference text is requested by this recommendation.",
    providerDisclosure: "No provider is selected or contacted; current STT evaluation is methodology-only.",
    costDisclosure: "Navigation and methodology inspection consume zero provider credits.",
    persistenceDisclosure: "The concierge does not retain this goal or create an evaluation record.",
    confirmationDisclosure: "Arriving does not measure WER or run an STT evaluation.",
    accessDisclosure: "Guest allowed",
    offlineShellAvailable: false,
  },
  {
    id: "scenario-studio",
    href: "/scenario-studio",
    label: "Explore interruption recovery",
    outcome: "Open Scenario Studio to inspect a deterministic, synthetic voice-system journey.",
    why: adaptiveCopy(
      "Use this to understand how a voice interaction can recover.",
      "Scenario Studio explains turn interruption and recovery with a safe synthetic fixture.",
      "The studio separates scenario input, explicit run confirmation, receipt evidence, and deterministic explanation.",
      "Registered destination scenario-studio maps to the fixture-only release-stage surface; the concierge cannot invoke scenario.runFixture.",
    ),
    inputDisclosure: "A bounded synthetic scenario is available after arrival.",
    providerDisclosure: "The current studio run is fixture-only and makes zero provider calls.",
    costDisclosure: "Navigation and the approved synthetic fixture consume zero provider credits.",
    persistenceDisclosure: "The concierge and current Scenario receipt remain tab-local and ephemeral.",
    confirmationDisclosure: "Arriving does not start the scenario; the studio requires a separate explicit run choice.",
    accessDisclosure: "Guest allowed",
    offlineShellAvailable: false,
  },
  {
    id: "build",
    href: build.href,
    label: "Build or integrate a voice system",
    outcome: "Choose the right existing ONE path for understanding, designing, validating, or integrating a solution.",
    why: adaptiveCopy(
      "Use this when you are ready to design or integrate.",
      "This opens ONE's practical build path from human need through architecture and validation.",
      "This opens the capability-centered tools for pre-sales discovery, architecture, API inspection, and handoff.",
      "Registered destination build maps to the canonical Build index; specialist route guards and action schemas stay independent.",
    ),
    inputDisclosure: "No customer, payload, or code content is required to arrive.",
    providerDisclosure: "Provider details appear only where the selected build tool needs attributable configuration.",
    costDisclosure: "Navigation has no provider cost; execution-capable tools retain their own admission boundary.",
    persistenceDisclosure: "The concierge does not retain this goal; each tool explains its own state boundary.",
    confirmationDisclosure: "Arriving does not submit, execute, save, or download anything.",
    accessDisclosure: "Guest allowed",
    offlineShellAvailable: true,
  },
  {
    id: "learn",
    href: learn.href,
    label: "Learn how voice systems work",
    outcome: "Explore privacy, evidence, architecture, latency, and recovery close to the point of use.",
    why: adaptiveCopy(
      "A plain-language place to understand the ideas first.",
      "This opens contextual learning without requiring a provider, model, or API choice.",
      "This organizes methodology, privacy, capability evidence, language, and system evolution around practical questions.",
      "Registered destination learn maps to the canonical Learn index and exposes only public, code-owned routes.",
    ),
    inputDisclosure: "No personal or technical input is required to arrive.",
    providerDisclosure: "Provider examples remain attributable, but no provider is selected or contacted.",
    costDisclosure: "Navigation and learning content use zero provider credits.",
    persistenceDisclosure: "The concierge does not retain this goal or create learning history.",
    confirmationDisclosure: "Any later interactive capability remains a separate explicit choice.",
    accessDisclosure: "Guest allowed",
    offlineShellAvailable: true,
  },
] as const;

export const ONE_CONCIERGE_INTENTS: readonly OneConciergeIntent[] = [
  {
    id: "start",
    label: "Find a useful starting point",
    reflection: adaptiveCopy(
      "You want a clear place to begin.",
      "You want ONE to show the most approachable starting points.",
      "You want a capability overview before choosing a workflow.",
      "You want the provider-neutral entry routes before selecting a technical surface.",
    ),
    synonyms: ["where do i begin", "help me get started", "get started", "not sure where to start", "what can one do", "what should i try next"],
    destinationIds: ["explore", "learn"],
    approvedRouteContextHints: ["/"],
  },
  {
    id: "transcribe",
    label: "Turn speech into text",
    reflection: adaptiveCopy(
      "You want to turn speech into text.",
      "You want to make a transcript from approved audio.",
      "You want ONE's bounded prerecorded transcription path.",
      "You want the canonical upload-audio module without bypassing media admission or provider policy.",
    ),
    synonyms: ["turn speech into text", "transcribe audio", "speech to text", "make a transcript", "upload audio", "transcription"],
    destinationIds: ["transcribe-audio"],
    approvedRouteContextHints: ["/", "/learn"],
  },
  {
    id: "synthesize",
    label: "Create speech from text",
    reflection: adaptiveCopy(
      "You want to turn text into speech.",
      "You want to create spoken audio from reviewed text.",
      "You want ONE's protected batch speech-generation path.",
      "You want the canonical tts module without selecting a provider, model, or voice in the concierge.",
    ),
    synonyms: ["turn text into speech", "create speech", "generate speech", "text to speech", "make a voice", "speech generation"],
    destinationIds: ["create-speech"],
    approvedRouteContextHints: ["/", "/providers"],
  },
  {
    id: "compare-providers",
    label: "Compare provider capabilities",
    reflection: adaptiveCopy(
      "You want to compare provider choices.",
      "You want to compare capabilities, readiness, or limitations.",
      "You want normalized provider metadata and attributable readiness evidence.",
      "You want the canonical provider projection, not a provider selection or ranking action.",
    ),
    synonyms: ["compare providers", "provider comparison", "compare capabilities", "provider readiness", "deepgram", "fish audio", "elevenlabs", "cartesia", "reson8"],
    destinationIds: ["compare-providers"],
    approvedRouteContextHints: ["/", "/providers"],
  },
  {
    id: "evaluate",
    label: "Evaluate quality or evidence",
    reflection: adaptiveCopy(
      "You want to inspect evidence about voice outputs.",
      "You want a controlled comparison with an explanation of what the result means.",
      "You want measurements, methodology, provenance, and limitations rather than a universal ranking.",
      "You want the canonical Evaluate surface and its versioned fixture/live evidence boundaries.",
    ),
    synonyms: ["evaluate quality", "measure quality", "compare outputs", "benchmark results", "inspect evidence"],
    destinationIds: ["evaluate-evidence"],
    approvedRouteContextHints: ["/", "/providers", "/evaluate"],
  },
  {
    id: "evaluate-stt",
    label: "Review STT evaluation availability",
    reflection: adaptiveCopy(
      "You want to understand speech-recognition accuracy.",
      "You want STT evaluation or WER evidence, which is planned but not currently runnable in ONE.",
      "You want the STT methodology and current availability without treating TTS fixture results as recognition evidence.",
      "You want the canonical STT methodology boundary; the concierge cannot run WER, STT benchmarks, or provider actions.",
    ),
    synonyms: [
      "wer",
      "word error rate",
      "speech recognition accuracy",
      "speech recognition evaluation",
      "speech recognition benchmark",
      "stt evaluation",
      "stt benchmark",
      "speech to text accuracy",
      "speech-to-text accuracy",
      "speech to text evaluation",
      "speech-to-text evaluation",
      "transcription accuracy",
      "transcription benchmark",
      "recognition error rate",
    ],
    destinationIds: ["stt-evaluation-methodology"],
    approvedRouteContextHints: ["/", "/providers", "/evaluate", "/methodology"],
  },
  {
    id: "scenario",
    label: "Understand interruption recovery",
    reflection: adaptiveCopy(
      "You want to explore a voice-interaction scenario.",
      "You want to understand interruption and recovery with a safe synthetic example.",
      "You want to inspect deterministic turn behavior, receipt evidence, and explanation.",
      "You want the fixture-only Scenario Studio; navigation cannot invoke its run action.",
    ),
    synonyms: ["scenario studio", "test interruption", "interruption recovery", "turn handling", "simulate a voice system", "run a scenario"],
    destinationIds: ["scenario-studio"],
    approvedRouteContextHints: ["/", "/evaluate", "/scenario-studio"],
  },
  {
    id: "build",
    label: "Build or integrate",
    reflection: adaptiveCopy(
      "You want to build or connect a voice system.",
      "You want practical guidance for design, integration, or validation.",
      "You want the existing build path and specialist tools without bypassing their controls.",
      "You want the canonical Build index, with each destination preserving its own schemas and authority.",
    ),
    synonyms: ["build a voice system", "integration guidance", "api guidance", "design an integration", "technical guidance", "architecture help"],
    destinationIds: ["build"],
    approvedRouteContextHints: ["/", "/build", "/providers"],
  },
  {
    id: "learn",
    label: "Learn about voice systems",
    reflection: adaptiveCopy(
      "You want to understand how voice systems work.",
      "You want plain-language guidance about voice AI, privacy, or evidence.",
      "You want contextual education about architecture, methodology, privacy, or deployment.",
      "You want the public Learn routes without exposing private configuration or provider authority.",
    ),
    synonyms: ["learn voice ai", "understand voice ai", "privacy and trust", "privacy", "evidence methodology", "deployment guidance", "how does voice ai work"],
    destinationIds: ["learn"],
    approvedRouteContextHints: ["/", "/learn", "/methodology"],
  },
] as const;

export const ONE_CONCIERGE_CLARIFICATIONS = [
  {
    phrase: "compare",
    prompt: "What would you like to compare?",
    intentIds: ["compare-providers", "evaluate"] as const,
  },
  {
    phrase: "quality",
    prompt: "Are you looking for measured evidence or general capability information?",
    intentIds: ["evaluate", "compare-providers"] as const,
  },
] as const;

const destinationById = new Map(ONE_CONCIERGE_DESTINATIONS.map((destination) => [destination.id, destination]));
const intentById = new Map(ONE_CONCIERGE_INTENTS.map((intent) => [intent.id, intent]));

export function getOneConciergeDestination(id: OneConciergeDestinationId) {
  return destinationById.get(id) ?? null;
}

export function getOneConciergeIntent(id: OneConciergeIntentId) {
  return intentById.get(id) ?? null;
}

export function getContextualConciergeIntents(pathname: string, maximum = 4) {
  const boundedMaximum = Math.max(1, Math.min(maximum, 4));
  const contextMatches = ONE_CONCIERGE_INTENTS.filter((intent) =>
    intent.approvedRouteContextHints.some((hint) => hint === "/" ? pathname === "/" : pathname.startsWith(hint)),
  );
  const fallback: readonly OneConciergeIntentId[] = ["start", "transcribe", "evaluate", "scenario"];
  const ordered = [...contextMatches, ...fallback.map((id) => getOneConciergeIntent(id)).filter((intent): intent is OneConciergeIntent => Boolean(intent))];
  return [...new Map(ordered.map((intent) => [intent.id, intent])).values()].slice(0, boundedMaximum);
}

export function assertOneConciergeRegistry() {
  const destinationIds = new Set<string>();
  const destinationHrefs = new Set<string>();
  for (const destination of ONE_CONCIERGE_DESTINATIONS) {
    if (destinationIds.has(destination.id)) throw new Error(`Duplicate concierge destination ID: ${destination.id}`);
    destinationIds.add(destination.id);
    if (destinationHrefs.has(destination.href)) throw new Error(`Duplicate concierge destination route: ${destination.href}`);
    destinationHrefs.add(destination.href);
    if (!isRegisteredInternalHref(destination.href)) throw new Error(`Unsafe concierge destination route: ${destination.href}`);
  }

  const intentIds = new Set<string>();
  const synonyms = new Map<string, OneConciergeIntentId>();
  for (const intent of ONE_CONCIERGE_INTENTS) {
    if (intentIds.has(intent.id)) throw new Error(`Duplicate concierge intent ID: ${intent.id}`);
    intentIds.add(intent.id);
    if (intent.destinationIds.length < 1 || intent.destinationIds.length > 3) {
      throw new Error(`Concierge intent ${intent.id} must register one to three destinations.`);
    }
    for (const destinationId of intent.destinationIds) {
      if (!destinationIds.has(destinationId)) throw new Error(`Unknown concierge destination: ${destinationId}`);
    }
    for (const synonym of intent.synonyms) {
      const normalized = normalizeRegistryPhrase(synonym);
      if (!normalized) throw new Error(`Empty concierge synonym on ${intent.id}`);
      const owner = synonyms.get(normalized);
      if (owner) throw new Error(`Concierge synonym collision: ${normalized} (${owner}, ${intent.id})`);
      synonyms.set(normalized, intent.id);
    }
  }

  const clarificationPhrases = new Set<string>();
  for (const clarification of ONE_CONCIERGE_CLARIFICATIONS) {
    const phrase = normalizeRegistryPhrase(clarification.phrase);
    if (!phrase || clarificationPhrases.has(phrase) || synonyms.has(phrase)) {
      throw new Error(`Invalid concierge clarification phrase: ${clarification.phrase}`);
    }
    clarificationPhrases.add(phrase);
    if (clarification.intentIds.length < 2 || clarification.intentIds.length > 3) {
      throw new Error(`Concierge clarification ${phrase} must register two or three intents.`);
    }
    for (const intentId of clarification.intentIds) {
      if (!intentIds.has(intentId)) throw new Error(`Unknown concierge clarification intent: ${intentId}`);
    }
  }
  return true;
}

function normalizeRegistryPhrase(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").trim().replace(/\s+/g, " ");
}

function isRegisteredInternalHref(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  if (/[\u0000-\u001f\u007f]/u.test(value)) return false;
  if (/^(?:\/)?(?:javascript|data|file):/iu.test(value)) return false;
  return !value.includes("\\");
}

assertOneConciergeRegistry();
