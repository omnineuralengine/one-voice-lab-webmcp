import { z } from "zod";

export const CAPABILITY_REGISTRY_VERSION = "capability-registry-v1" as const;

export const capabilitySchema = z.object({
  id: z.string(),
  name: z.string(),
  shortDescription: z.string(),
  route: z.string().nullable(),
  category: z.string(),
  implementationStatus: z.enum(["implemented", "experimental", "partial", "planned", "unavailable"]),
  maturity: z.enum(["stable", "review", "prototype", "concept"]),
  audience: z.array(z.string()),
  inputs: z.array(z.string()),
  outputs: z.array(z.string()),
  dependencies: z.array(z.string()),
  safetyControls: z.array(z.string()),
  demoAvailability: z.boolean(),
  mobileAvailability: z.boolean(),
  offlineAvailability: z.boolean(),
  documentationPath: z.string(),
  lastVerifiedAt: z.string(),
}).strict();

type CapabilityStatus = "implemented" | "experimental" | "partial" | "planned" | "unavailable";
type CapabilityAvailability = { demoAvailability?: boolean; mobileAvailability?: boolean; offlineAvailability?: boolean };
const LAST_VERIFIED_AT = "2026-08-20";

function capability(
  id: string,
  name: string,
  route: string | null,
  status: CapabilityStatus,
  documentationPath: string,
  shortDescription: string,
  outputs: string[] = [],
  availability: CapabilityAvailability = {},
) {
  return {
    id,
    name,
    shortDescription,
    route,
    category: "Applied Voice Lab",
    implementationStatus: status,
    maturity: status === "implemented" ? "review" : "prototype",
    audience: ["solutions engineering", "product", "engineering"],
    inputs: ["synthetic or user-approved redacted input"],
    outputs,
    dependencies: [],
    safetyControls: ["local-first state", "secret redaction", "explicit execution/export"],
    demoAvailability: availability.demoAvailability ?? true,
    mobileAvailability: availability.mobileAvailability ?? route !== "/architecture-studio",
    offlineAvailability: availability.offlineAvailability ?? !["api-lab", "docs-search"].includes(id),
    documentationPath,
    lastVerifiedAt: LAST_VERIFIED_AT,
  } as const;
}

export const CAPABILITIES = [
  capability("live-solution", "Live Solution Studio", "/live-solution-studio", "implemented", "docs/LIVE_SOLUTION_CASE_GRAPH.md", "Paste or structure a live technical problem and produce a deterministic field brief.", ["field brief", "case handoffs"]),
  capability("case-graph", "Live Solution Case Graph", "/live-solution-studio", "implemented", "docs/LIVE_SOLUTION_CASE_GRAPH.md", "Versioned evidence, decision, question, risk, validation, and action intelligence."),
  capability("flux-observatory", "Flux Conversation Observatory", "/flux-observatory", "experimental", "docs/FLUX_CONVERSATION_OBSERVATORY.md", "Typed Flux /v2 conversational-turn observability with deterministic replay; live provider validation remains manual.", ["turn-event timeline", "POC scorecard", "Mermaid architecture"]),
  capability("deliverables", "Solution Deliverables Studio", "/deliverables", "implemented", "docs/SOLUTION_DELIVERABLES_STUDIO.md", "Compile an approved case into validated customer materials.", ["Mermaid", "SVG", "one-page PDF", "PPTX", "ZIP"], { offlineAvailability: false }),
  capability("pre-sales", "Pre-Sales Solution Studio", "/pre-sales-studio", "implemented", "docs/pre-sales-studio.md", "Deterministic discovery, recommendation, and POC planning."),
  capability("architecture", "Architecture Studio", "/architecture-studio", "implemented", "docs/architecture-studio.md", "Collaborative architecture discovery, diagnostics, and handoff."),
  capability("workbench", "Payload & Code Workbench", "/live-solution-studio", "implemented", "docs/PAYLOAD_CODE_WORKBENCH.md", "Redacted payload and code inspection without execution."),
  capability("sdk-doctor", "Deepgram SDK Doctor", "/live-solution-studio", "implemented", "docs/DEEPGRAM_SDK_DOCTOR.md", "Deterministic SDK generation and version diagnosis."),
  capability("release-radar", "SDK Release & Regression Radar", null, "partial", "docs/DEEPGRAM_SDK_DOCTOR.md", "Registry and release evidence are present; a standalone radar UI is not complete."),
  capability("api-lab", "API Lab", "/?module=api-studio", "implemented", "README.md", "Registry-backed request inspection and explicitly guarded execution."),
  capability("language", "Language Workbench", "/?module=language-explorer", "implemented", "README.md", "Verified Nova-3 language exploration and safe handoffs."),
  capability("audio", "Audio Lab", "/?module=audio-signal-lab", "implemented", "README.md", "Synthetic audio inspection and signal learning tools."),
  capability("pocket", "Pocket Deepgram", "/", "implemented", "docs/CROSS_DEVICE_HANDOFF.md", "Mobile/PWA navigation and guarded call-side tools."),
  capability("provider-rolodex", "Provider Rolodex", "/providers", "implemented", "docs/ADDING_A_PROVIDER.md", "Truthful provider, configuration, capability, and adapter visibility."),
  capability("tts-evaluate", "TTS Evaluate", "/evaluate", "implemented", "docs/EVALUATE.md", "Private provider-neutral fixture and protected-live TTS comparison with versioned evidence."),
  capability("simulation-lab", "Simulation Lab", "/simulation-lab", "experimental", "docs/ONE_VOICE_LAB.md", "Typed deterministic Voice AI failure replay with explicit execution, simulated provenance, local usage facts, and bounded scorecards.", ["simulated event timeline", "Lab scorecard", "sanitized JSON"], { offlineAvailability: true }),
  capability("early-access-bench", "Deepgram Early Access Bench", "/providers/deepgram/early-access", "partial", "docs/VOICE_OPEN_LAB.md", "Public infrastructure and a safe empty state are implemented; no public early-access experiment is currently configured.", [], { offlineAvailability: true }),
  capability("docs-search", "Official Deepgram Docs Evidence", "/live-solution-studio", "implemented", "docs/LIVE_SOLUTION_CASE_GRAPH.md", "Server-only official documentation retrieval with curated fallback."),
  capability("applied-voice-reasoning", "Applied Voice Reasoning Layer", "/", "experimental", "docs/APPLIED_VOICE_REASONING_LAYER.md", "Gateway-backed explanation, critique, routing, red-team, and POC proposals layered above deterministic Lab evidence.", ["structured AI proposal", "claim ledger", "POC proposal"], { offlineAvailability: false }),
  capability("ai-usage-observatory", "AI Usage Observatory", "/ai-observatory", "experimental", "docs/APPLIED_VOICE_REASONING_LAYER.md", "Ephemeral per-session AI request metadata without raw prompts or generated content.", ["session usage metadata"], { offlineAvailability: false }),
  capability("voice-problem", "Speak the Problem", null, "planned", "docs/CODEX_BACKLOG.md", "Voice capture for problem summaries is not yet implemented.", [], { demoAvailability: false, mobileAvailability: false, offlineAvailability: false }),
].map((entry) => capabilitySchema.parse(entry));

export function capabilityById(id: string) {
  return CAPABILITIES.find((entry) => entry.id === id) ?? null;
}
