import {
  VOICE_OPEN_LAB_BUILD_TOOLS,
  VOICE_OPEN_LAB_EXPERIENCES,
  VOICE_OPEN_LAB_LEARN_SURFACES,
  VOICE_OPEN_LAB_NAVIGATION,
} from "@/lib/voice-open-lab/navigation";

export const ONE_PUBLIC_LAB_DESTINATION_IDS = [
  "home",
  "providers",
  "evaluate",
  "build",
  "learn",
  "telephony",
] as const;

export type OnePublicLabDestinationId =
  (typeof ONE_PUBLIC_LAB_DESTINATION_IDS)[number];

export type OnePublicLabDestination = Readonly<{
  id: OnePublicLabDestinationId;
  label: string;
  href: string;
  purpose: string;
  humanActions: readonly string[];
  agentActions: readonly string[];
  implementationMode:
    | "application-navigation"
    | "repository-evidence"
    | "fixture-first-evaluation"
    | "documentation"
    | "deterministic-simulation";
  availability: "live" | "simulated" | "documentation-only" | "unavailable";
  availabilityDetail: string;
}>;

const queryModuleIds = new Set<string>(
  VOICE_OPEN_LAB_EXPERIENCES.map((experience) => experience.moduleId),
);
for (const item of [...VOICE_OPEN_LAB_BUILD_TOOLS, ...VOICE_OPEN_LAB_LEARN_SURFACES]) {
  const moduleId = new URL(item.href, "https://one.local").searchParams.get("module");
  if (moduleId) queryModuleIds.add(moduleId);
}

export const ONE_PUBLIC_QUERY_MODULE_IDS = Object.freeze([...queryModuleIds].sort());

export function isOnePublicQueryModuleId(value: string | null): value is string {
  return value !== null && queryModuleIds.has(value);
}

function navigationArea(id: (typeof VOICE_OPEN_LAB_NAVIGATION)[number]["id"]) {
  const area = VOICE_OPEN_LAB_NAVIGATION.find((candidate) => candidate.id === id);
  if (!area) throw new Error(`Missing public ONE navigation area: ${id}`);
  return area;
}

function buildTool(id: (typeof VOICE_OPEN_LAB_BUILD_TOOLS)[number]["id"]) {
  const tool = VOICE_OPEN_LAB_BUILD_TOOLS.find((candidate) => candidate.id === id);
  if (!tool) throw new Error(`Missing public ONE build tool: ${id}`);
  return tool;
}

const explore = navigationArea("explore");
const compare = navigationArea("compare");
const evaluate = navigationArea("evaluate");
const build = navigationArea("build");
const learn = navigationArea("learn");
const telephony = buildTool("telephony-readiness");

/**
 * The only application destinations an in-page WebMCP tool may navigate to.
 * Machine endpoints and arbitrary URLs are intentionally absent.
 */
export const ONE_PUBLIC_LAB_DESTINATIONS = [
  {
    id: "home",
    label: explore.label,
    href: explore.href,
    purpose: explore.description,
    humanActions: ["Choose a goal", "Open a voice capability", "Use Ask ONE navigation"],
    agentActions: ["get_one_lab_map", "get_current_one_context", "open_one_lab"],
    implementationMode: "application-navigation",
    availability: "live",
    availabilityDetail: "The human application surface is implemented; individual provider actions retain their own execution gates.",
  },
  {
    id: "providers",
    label: compare.label,
    href: compare.href,
    purpose: compare.description,
    humanActions: ["Browse public providers", "Filter provider evidence", "Open an evidence profile"],
    agentActions: ["find_voice_providers", "compare_voice_providers", "get_current_one_context", "open_one_lab"],
    implementationMode: "repository-evidence",
    availability: "live",
    availabilityDetail: "The public evidence registry is available without invoking a provider; unknown fields remain unknown.",
  },
  {
    id: "evaluate",
    label: evaluate.label,
    href: evaluate.href,
    purpose: evaluate.description,
    humanActions: ["Run deterministic fixtures", "Inspect methodology", "Review evidence without a universal ranking"],
    agentActions: ["get_one_lab_map", "get_current_one_context", "open_one_lab"],
    implementationMode: "fixture-first-evaluation",
    availability: "simulated",
    availabilityDetail: "The default evidence path is deterministic and simulated; live evaluation remains separately human-gated.",
  },
  {
    id: "build",
    label: build.label,
    href: build.href,
    purpose: build.description,
    humanActions: ["Choose a guided build stage", "Open a specialist local workspace", "Inspect execution boundaries"],
    agentActions: ["get_one_lab_map", "get_current_one_context", "open_one_lab"],
    implementationMode: "application-navigation",
    availability: "live",
    availabilityDetail: "The build index is implemented; opening it never authorizes a provider or other consequential action.",
  },
  {
    id: "learn",
    label: learn.label,
    href: learn.href,
    purpose: learn.description,
    humanActions: ["Read evidence vocabulary", "Inspect system concepts", "Open methodology and privacy learning surfaces"],
    agentActions: ["get_one_lab_map", "get_current_one_context", "open_one_lab"],
    implementationMode: "documentation",
    availability: "documentation-only",
    availabilityDetail: "This route explains repository evidence and system behavior; it does not execute providers.",
  },
  {
    id: "telephony",
    label: telephony.label,
    href: telephony.href,
    purpose: telephony.description,
    humanActions: ["Configure a deterministic scenario", "Run a simulated readiness test", "Apply and compare bounded remediations"],
    agentActions: [
      "get_voice_lab_context",
      "configure_telephony_readiness_test",
      "run_telephony_readiness_simulation",
      "get_telephony_readiness_report",
      "apply_telephony_lab_remediation",
      "get_current_one_context",
      "open_one_lab",
    ],
    implementationMode: "deterministic-simulation",
    availability: "simulated",
    availabilityDetail: "Twilio ConversationRelay readiness evidence is simulated; credentials and live-call capability are unavailable.",
  },
] as const satisfies readonly OnePublicLabDestination[];

// These objects are an authorization boundary for local navigation. Runtime
// immutability prevents a tool result consumer from rewriting an allowlisted
// route before a later open_one_lab call resolves it.
for (const destination of ONE_PUBLIC_LAB_DESTINATIONS) {
  Object.freeze(destination.humanActions);
  Object.freeze(destination.agentActions);
  Object.freeze(destination);
}
Object.freeze(ONE_PUBLIC_LAB_DESTINATIONS);

const destinationIds = new Set(ONE_PUBLIC_LAB_DESTINATIONS.map((item) => item.id));
const destinationHrefs = new Set(ONE_PUBLIC_LAB_DESTINATIONS.map((item) => item.href));

if (
  destinationIds.size !== ONE_PUBLIC_LAB_DESTINATION_IDS.length
  || destinationHrefs.size !== ONE_PUBLIC_LAB_DESTINATIONS.length
  || ONE_PUBLIC_LAB_DESTINATION_IDS.some((id) => !destinationIds.has(id))
) {
  throw new Error("ONE public WebMCP destinations must have unique, complete IDs and routes.");
}

for (const destination of ONE_PUBLIC_LAB_DESTINATIONS) {
  if (
    !destination.href.startsWith("/")
    || destination.href.startsWith("//")
    || destination.href.includes("\\")
    || destination.href.includes("..")
    || destination.href.includes("?")
    || destination.href.includes("#")
    || destination.href.startsWith("/api")
  ) {
    throw new Error(`Unsafe public ONE destination: ${destination.id}`);
  }
}

export function getOnePublicLabDestination(id: OnePublicLabDestinationId) {
  const destination = ONE_PUBLIC_LAB_DESTINATIONS.find((item) => item.id === id);
  if (!destination) throw new Error(`Missing public ONE destination: ${id}`);
  return destination;
}
