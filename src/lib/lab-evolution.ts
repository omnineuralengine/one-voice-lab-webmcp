import { CAPABILITIES } from "./capabilities/registry";

export const LAB_EVOLUTION_VERIFIED_AT = "2026-08-25" as const;

export const LAB_EVIDENCE_LABELS = [
  "Repository verified",
  "Deepgram documentation verified",
  "Assumption",
  "Experimental idea",
] as const;

export type LabEvidenceLabel = (typeof LAB_EVIDENCE_LABELS)[number];
export type LabEvolutionDate = `${number}-${number}-${number}`;

export type LabEvidenceReference = Readonly<{
  label: LabEvidenceLabel;
  summary: string;
  source: string;
}>;

export type LabEvolutionTestEvidence = Readonly<{
  result: string;
  source: string;
}>;

export type LabEvolutionEntry = Readonly<{
  id: string;
  date: LabEvolutionDate;
  title: string;
  description: string;
  modules: readonly string[];
  status: LabEvidenceLabel;
  evidence: readonly LabEvidenceReference[];
  gitCommit?: string;
  entireCheckpoint?: string;
  tests?: readonly LabEvolutionTestEvidence[];
  learning: string;
  nextHypothesis: string;
}>;

export type LabEvolutionFlowNode = Readonly<{
  id: string;
  label: string;
  description: string;
}>;

export type LabDevelopmentNode = LabEvolutionFlowNode & Readonly<{
  status: LabEvidenceLabel;
}>;

export type LabDevelopmentEdge = Readonly<{
  from: string;
  to: string;
  kind: "canonical" | "feedback" | "parallel-context";
  label?: string;
  status: LabEvidenceLabel;
}>;

export type LabEvolutionTopic = Readonly<{
  id: string;
  title: string;
  description: string;
  status: LabEvidenceLabel;
  evidence: readonly LabEvidenceReference[];
  nextHypothesis?: string;
}>;

export const LAB_EVOLUTION_PURPOSE = {
  title: "Questions become evidence",
  statement:
    "The Learning Lab exists to turn practical voice-engineering questions into inspectable experiments, working implementations, reproducible evidence, and the next better question.",
  status: "Repository verified",
  evidence: [
    {
      label: "Repository verified",
      summary: "The repository describes itself as an executable, local-first learning, diagnostic, and solution-design environment.",
      source: "README.md#why-this-exists",
    },
    {
      label: "Repository verified",
      summary: "The current product map preserves prototype, evidence, and production-readiness boundaries module by module.",
      source: "chatgpt-project-pack/01_CURRENT_PRODUCT_MAP.md",
    },
  ],
} as const satisfies Readonly<{
  title: string;
  statement: string;
  status: LabEvidenceLabel;
  evidence: readonly LabEvidenceReference[];
}>;

export const RECURSIVE_LEARNING_LOOP = [
  { id: "question", label: "Question", description: "Name the user, engineering, or evidence gap." },
  { id: "learn", label: "Learn", description: "Inspect the repository, project boundaries, and current primary sources." },
  { id: "build", label: "Build", description: "Implement the smallest useful, understandable experiment." },
  { id: "observe", label: "Observe", description: "Capture behavior, timing, lifecycle events, and failure signals." },
  { id: "test", label: "Test", description: "Exercise deterministic, browser, security, and bounded live boundaries." },
  { id: "document", label: "Document", description: "Record evidence, limitations, provenance, and what remains unknown." },
  { id: "ship", label: "Ship", description: "Commit, review, and deploy only the evidence-supported change." },
  { id: "question-again", label: "Question again", description: "Use observed evidence to choose the next hypothesis." },
] as const satisfies readonly LabEvolutionFlowNode[];

export const RECURSIVE_LEARNING_LOOP_EDGES = RECURSIVE_LEARNING_LOOP.map((node, index) => ({
  from: node.id,
  to: RECURSIVE_LEARNING_LOOP[(index + 1) % RECURSIVE_LEARNING_LOOP.length].id,
})) as readonly Readonly<{ from: string; to: string }>[];

export const LAB_DEVELOPMENT_ARCHITECTURE = {
  primaryFlow: [
    {
      id: "human-intent",
      label: "Human intent",
      description: "A person supplies the question, priorities, constraints, and review decision.",
      status: "Repository verified",
    },
    {
      id: "codex",
      label: "Codex",
      description: "The implementation partner inspects evidence and changes the scoped working tree.",
      status: "Repository verified",
    },
    {
      id: "working-tree",
      label: "Working tree",
      description: "Local changes remain inspectable before they become repository history.",
      status: "Repository verified",
    },
    {
      id: "git-commit",
      label: "Git commit",
      description: "A reviewed snapshot records a logical implementation or evidence change.",
      status: "Repository verified",
    },
    {
      id: "github",
      label: "GitHub",
      description: "Canonical source control and review history for the current architecture.",
      status: "Repository verified",
    },
    {
      id: "vercel",
      label: "Vercel",
      description: "Deployment infrastructure; a preview or production result still requires independent verification.",
      status: "Repository verified",
    },
    {
      id: "live-learning-lab",
      label: "Live Learning Lab",
      description: "The deployed experience exposes only the reviewed runtime and configured provider boundaries.",
      status: "Repository verified",
    },
    {
      id: "evidence-feedback",
      label: "Evidence / feedback",
      description: "Tests, observations, provider events, and human review reveal what happened.",
      status: "Repository verified",
    },
    {
      id: "next-iteration",
      label: "Next iteration",
      description: "Evidence narrows the next question instead of silently promoting an assumption.",
      status: "Repository verified",
    },
  ],
  primaryEdges: [
    { from: "human-intent", to: "codex", kind: "canonical", status: "Repository verified" },
    { from: "codex", to: "working-tree", kind: "canonical", status: "Repository verified" },
    { from: "working-tree", to: "git-commit", kind: "canonical", status: "Repository verified" },
    { from: "git-commit", to: "github", kind: "canonical", status: "Repository verified" },
    { from: "github", to: "vercel", kind: "canonical", status: "Repository verified" },
    { from: "vercel", to: "live-learning-lab", kind: "canonical", status: "Repository verified" },
    { from: "live-learning-lab", to: "evidence-feedback", kind: "canonical", status: "Repository verified" },
    { from: "evidence-feedback", to: "next-iteration", kind: "canonical", status: "Repository verified" },
    { from: "next-iteration", to: "human-intent", kind: "feedback", label: "Question again", status: "Repository verified" },
  ],
  parallelContextNodes: [
    {
      id: "entire-context",
      label: "Entire development-context capture",
      description: "An observational parallel context layer. It does not replace GitHub or modify deployment behavior.",
      status: "Experimental idea",
    },
  ],
  parallelContextEdges: [
    {
      from: "codex",
      to: "entire-context",
      kind: "parallel-context",
      label: "Experimental context capture",
      status: "Experimental idea",
    },
  ],
  boundaries: [
    "GitHub remains canonical source control.",
    "Vercel remains deployment infrastructure.",
    "Entire is observational and must not alter the GitHub-to-Vercel path.",
    "No tracked Entire checkpoint is claimed by this registry.",
  ],
  evidence: [
    {
      label: "Repository verified",
      summary: "The repository remote targets omnineuralengine/ONE-voice-lab on GitHub.",
      source: "git:remote:origin",
    },
    {
      label: "Repository verified",
      summary: "The cross-device handoff records the GitHub-to-Vercel preview workflow and its review boundary.",
      source: "docs/CROSS_DEVICE_HANDOFF.md#vercel-continuity",
    },
    {
      label: "Experimental idea",
      summary: "Entire is represented only as a parallel context layer; no checkpoint identifier is present in tracked evidence.",
      source: "Lab Evolution architecture boundary",
    },
  ],
} as const satisfies Readonly<{
  primaryFlow: readonly LabDevelopmentNode[];
  primaryEdges: readonly LabDevelopmentEdge[];
  parallelContextNodes: readonly LabDevelopmentNode[];
  parallelContextEdges: readonly LabDevelopmentEdge[];
  boundaries: readonly string[];
  evidence: readonly LabEvidenceReference[];
}>;

export const EVIDENCE_PHILOSOPHY = [
  {
    label: "Repository verified",
    summary: "Implementation, tests, or tracked repository history support the claim. This is not production certification.",
    source: "chatgpt-project-pack/01_CURRENT_PRODUCT_MAP.md#evidence-labels",
  },
  {
    label: "Deepgram documentation verified",
    summary: "Current official Deepgram documentation supports the API claim. This does not prove account entitlement.",
    source: "chatgpt-project-pack/05_DEEPGRAM_CAPABILITY_MAP.md",
  },
  {
    label: "Assumption",
    summary: "Available evidence is incomplete, so the claim remains explicitly provisional.",
    source: "chatgpt-project-pack/01_CURRENT_PRODUCT_MAP.md#evidence-labels",
  },
  {
    label: "Experimental idea",
    summary: "The direction is incomplete, disabled, or future-facing and must not be presented as working behavior.",
    source: "chatgpt-project-pack/01_CURRENT_PRODUCT_MAP.md#evidence-labels",
  },
] as const satisfies readonly LabEvidenceReference[];

export const LAB_EVOLUTION_TIMELINE = [
  {
    id: "applied-voice-baseline",
    date: "2026-07-16",
    title: "Applied Voice Lab baseline",
    description: "The first repository commit established the local-first control room, core voice workflows, diagnostics, learning paths, and evidence-aware handoff material.",
    modules: [
      "overview",
      "connection",
      "transcribe-url",
      "upload-audio",
      "live-mic",
      "tts",
      "trusted-voice",
      "sample-library",
      "language-explorer",
      "redaction-lab",
      "audio-signal-lab",
      "api-studio",
      "applied-voice-systems",
      "applied-engineering-questline",
      "live-observatory",
      "code-lab",
    ],
    status: "Repository verified",
    evidence: [
      {
        label: "Repository verified",
        summary: "The root commit records the initial Deepgram Applied Voice Lab baseline.",
        source: "git:f6017b4c206c357088cd1424b97a5c0c6d6f9b26",
      },
      {
        label: "Repository verified",
        summary: "The baseline README records the local-first architecture, module map, evidence labels, and verification boundary.",
        source: "git:f6017b4c206c357088cd1424b97a5c0c6d6f9b26:README.md",
      },
    ],
    gitCommit: "f6017b4c206c357088cd1424b97a5c0c6d6f9b26",
    tests: [
      {
        result: "The baseline README records 101 unit tests and 33 focused browser tests passed.",
        source: "git:f6017b4c206c357088cd1424b97a5c0c6d6f9b26:README.md#current-verification-status",
      },
    ],
    learning: "A broad learning environment stays understandable when provider calls, deterministic fixtures, inspectors, and evidence boundaries are visible together.",
    nextHypothesis: "A dedicated Architecture Studio could turn discovery evidence into an explainable, reversible solution path.",
  },
  {
    id: "architecture-studio-hardening",
    date: "2026-07-22",
    title: "Architecture Studio hardened for live workshops",
    description: "The repository added progressive discovery, deterministic recommendations, editable architecture, failure diagnosis, rehearsal, and privacy-aware handoff behavior.",
    modules: ["architecture"],
    status: "Repository verified",
    evidence: [
      {
        label: "Repository verified",
        summary: "The implementation commit and module documentation record the workshop-oriented Architecture Studio expansion.",
        source: "git:82e2cb00b1939db91e1e89ae8fc1fbabfb2cea5e",
      },
      {
        label: "Repository verified",
        summary: "The module document describes its deterministic recommendation, diagnostics, handoff, tests, and limitations.",
        source: "docs/architecture-studio.md",
      },
    ],
    gitCommit: "82e2cb00b1939db91e1e89ae8fc1fbabfb2cea5e",
    learning: "Architecture guidance is more reviewable when requirements, confidence, tradeoffs, validation methods, and unresolved questions remain visible.",
    nextHypothesis: "Verify the same safe local-demo fallback through the repository's GitHub-to-Vercel preview path.",
  },
  {
    id: "architecture-vercel-preview",
    date: "2026-07-22",
    title: "Architecture preview recorded",
    description: "Repository documentation recorded a Vercel preview where the Architecture Studio and health route returned HTTP 200 while hosted cross-device sync remained disabled.",
    modules: ["architecture"],
    status: "Repository verified",
    evidence: [
      {
        label: "Repository verified",
        summary: "The handoff records the preview URL, HTTP results, local-demo health mode, and deployment boundaries.",
        source: "git:e9edaf28a0066435dfed653e408b604e7ea5a960:docs/CROSS_DEVICE_HANDOFF.md",
      },
    ],
    gitCommit: "e9edaf28a0066435dfed653e408b604e7ea5a960",
    learning: "A hosted preview can validate a bounded fallback without silently claiming that optional shared-session infrastructure was exercised.",
    nextHypothesis: "Configure a non-production shared-session preview and run the documented two-device reconnect, expiry, and deletion soak test.",
  },
  {
    id: "pre-sales-studio",
    date: "2026-07-22",
    title: "Pre-Sales Solution Studio added",
    description: "A deterministic discovery-to-recommendation-to-POC workflow became a dedicated studio with browser and domain coverage.",
    modules: ["pre-sales"],
    status: "Repository verified",
    evidence: [
      {
        label: "Repository verified",
        summary: "The commit adds the Pre-Sales route, domain engine, components, documentation, and tests.",
        source: "git:dd8a5563927889a72c0ffc72fce20f6fdc27b517",
      },
    ],
    gitCommit: "dd8a5563927889a72c0ffc72fce20f6fdc27b517",
    learning: "Deterministic discovery helps reviewers see how stated needs propagate into recommendations and a bounded POC plan.",
    nextHypothesis: "A mobile-first surface could keep the same explicit, privacy-aware handoffs useful during calls and field work.",
  },
  {
    id: "pocket-pwa",
    date: "2026-07-22",
    title: "Pocket Deepgram PWA shell added",
    description: "The lab gained a touch-oriented launcher, bounded offline shell, demo checkpoints, and allowlisted local preferences.",
    modules: ["pocket"],
    status: "Repository verified",
    evidence: [
      {
        label: "Repository verified",
        summary: "The feature commit adds the PWA shell, offline assets, Pocket components, tests, and documentation.",
        source: "git:8725eeadde0e5f6b992efb92dfa0016d9d3785b7",
      },
    ],
    gitCommit: "8725eeadde0e5f6b992efb92dfa0016d9d3785b7",
    learning: "Mobile utility improves when offline degradation and persisted state stay narrow and understandable.",
    nextHypothesis: "Registry-backed API guidance could make common field questions faster without creating an arbitrary proxy.",
  },
  {
    id: "pocket-api-lab",
    date: "2026-07-22",
    title: "Pocket API Lab field widget added",
    description: "A concise registry-backed assistant added safe examples and handoffs from Pocket into full lab modules.",
    modules: ["pocket", "api-lab"],
    status: "Repository verified",
    evidence: [
      {
        label: "Repository verified",
        summary: "The commit adds Pocket API data, components, documentation, and deterministic coverage.",
        source: "git:79ee31d442a2a40e79a7c06c0ad63c2550896086",
      },
    ],
    gitCommit: "79ee31d442a2a40e79a7c06c0ad63c2550896086",
    learning: "Field guidance can remain concise while execution stays explicit and constrained to the full lab's allowlisted boundaries.",
    nextHypothesis: "Connect questions, official evidence, decisions, deliverables, and diagnostics in one traceable solution workflow.",
  },
  {
    id: "evidence-grounded-solution-lab",
    date: "2026-07-28",
    title: "Evidence-grounded solution lab completed",
    description: "The release added the Live Solution Case Graph, question and decision tools, Workbench, SDK Doctor, Deliverables Studio, and expanded reviewer evidence.",
    modules: ["live-solution", "case-graph", "workbench", "sdk-doctor", "deliverables", "docs-search"],
    status: "Repository verified",
    evidence: [
      {
        label: "Repository verified",
        summary: "The implementation commit records the evidence-grounded Live Solution Lab expansion.",
        source: "git:2df61df0c4428639fe869dd3781c27c47b76d52d",
      },
      {
        label: "Repository verified",
        summary: "The release changelog lists the Case Graph, ledger, question copilot, deliverables, diagnostics, and review expansion.",
        source: "git:2df61df0c4428639fe869dd3781c27c47b76d52d:CHANGELOG.md",
      },
    ],
    gitCommit: "2df61df0c4428639fe869dd3781c27c47b76d52d",
    learning: "Separating facts, evidence, decisions, risks, and actions makes implementation reasoning easier to review and hand off.",
    nextHypothesis: "A public Open Lab and shared visual system could reduce access friction while retaining explicit execution and evidence boundaries.",
  },
  {
    id: "flux-conversation-observatory",
    date: "2026-07-28",
    title: "Flux Conversation Observatory shipped",
    description: "The repository added typed Flux /v2/listen turn-event inspection, deterministic replay, local metrics, scorecards, Mermaid handoffs, and Vercel analytics.",
    modules: ["flux-observatory"],
    status: "Repository verified",
    evidence: [
      {
        label: "Repository verified",
        summary: "The implementation commit records the Flux Observatory and analytics addition.",
        source: "git:fb7a46961277883b9695bec5a5b96579b731579e",
      },
      {
        label: "Repository verified",
        summary: "The module document distinguishes deterministic replay, live-provider mode, and the missing retained live validation record.",
        source: "docs/FLUX_CONVERSATION_OBSERVATORY.md",
      },
    ],
    gitCommit: "fb7a46961277883b9695bec5a5b96579b731579e",
    learning: "Conversational turn intelligence is easier to reason about when provider events, local observations, synthetic fixtures, and inferred metrics retain distinct provenance.",
    nextHypothesis: "A bounded microphone/provider run can validate the retained live lifecycle without changing the deterministic replay path.",
  },
  {
    id: "open-lab-flux-one",
    date: "2026-08-14",
    title: "Open Lab, ONE system, and Flux batch implementation",
    description: "The current working tree adds public Open Lab controls, shared ONE primitives, a sanitized flight recorder, and a registry-driven Flux batch synthesis studio while preserving existing Aura TTS.",
    modules: ["open-lab", "flux-tts", "one-design-system", "flight-recorder"],
    status: "Repository verified",
    evidence: [
      {
        label: "Repository verified",
        summary: "The implementation evidence index maps the Open Lab, ONE, Flux, and security changes to their source and test files.",
        source: "chatgpt-project-pack/07_IMPLEMENTATION_EVIDENCE.md",
      },
      {
        label: "Repository verified",
        summary: "The Git commit records the Open Lab, ONE visual system, and Flux TTS implementation snapshot.",
        source: "git:25bcf498ca04cf49be2d1bd2d6188cee6cef9d7a",
      },
      {
        label: "Deepgram documentation verified",
        summary: "The capability map records the official Flux /v2/speak contract and dated voice-catalog verification boundary.",
        source: "chatgpt-project-pack/05_DEEPGRAM_CAPABILITY_MAP.md",
      },
      {
        label: "Repository verified",
        summary: "The readiness snapshot records passing mocked coverage and the unsuccessful bounded live authorization smoke without promoting it to provider proof.",
        source: "chatgpt-project-pack/08_TEST_AND_READINESS_STATUS.md",
      },
    ],
    gitCommit: "25bcf498ca04cf49be2d1bd2d6188cee6cef9d7a",
    learning: "Public access can remove visitor key friction while keeping the permanent credential server-side, live actions explicit, provider execution kill-switched, and synthetic learning available.",
    nextHypothesis: "Resolve provider authorization for a bounded Cole/Jack audio smoke, then verify browser streaming authentication and raw-audio cleanup before enabling streaming.",
  },
  {
    id: "lab-evolution-notebook",
    date: "2026-08-14",
    title: "Lab Evolution becomes a first-class engineering notebook",
    description: "The repository adds a structured recursive-learning timeline, explicit GitHub-to-Vercel delivery architecture, an experimental Entire context boundary, and evidence-backed evolution affordances across implemented modules.",
    modules: ["lab-evolution", "module-navigation", "one-design-system"],
    status: "Repository verified",
    evidence: [
      {
        label: "Repository verified",
        summary: "The implementation commit records the Lab Evolution registry, UI, module affordances, responsive visual baselines, and focused tests.",
        source: "git:0e6dd24fbeb23de154423961da7edf13442c420a",
      },
      {
        label: "Repository verified",
        summary: "The module document records the evidence labels, canonical delivery path, experimental Entire boundary, and current limitations.",
        source: "docs/LAB_EVOLUTION.md",
      },
    ],
    gitCommit: "0e6dd24fbeb23de154423961da7edf13442c420a",
    tests: [
      {
        result: "Final local validation passed 440 npm tests, 76 default browser tests with 6 intentional project guards, and 29 Open Lab tests.",
        source: "chatgpt-project-pack/08_TEST_AND_READINESS_STATUS.md",
      },
    ],
    learning: "A development story is more useful when purpose, implementation, evidence, delivery, limitations, and the next hypothesis remain connected through repository-controlled data.",
    nextHypothesis: "Reduce the shared evolution-affordance client bundle while preserving on-demand access to complete evidence profiles.",
  },
  {
    id: "one-identity-analytics-deployment",
    date: "2026-08-25",
    title: "ONE identity, analytics, and deployment baseline",
    description: "The canonical site adopts the supplied ONE mark, a concise Vercel hostname with continuity redirect, Vercel performance telemetry, and privacy-bounded Supabase product-interest events.",
    modules: ["one-design-system", "provider-rolodex", "lab-evolution"],
    status: "Repository verified",
    evidence: [
      {
        label: "Repository verified",
        summary: "The deployment and analytics document defines the canonical URL, event allowlist, RLS boundary, and data that is deliberately not retained.",
        source: "docs/ANALYTICS_AND_DEPLOYMENT.md",
      },
      {
        label: "Repository verified",
        summary: "The schema and application route restrict analytics to coarse product surfaces and the three registered providers.",
        source: "supabase/migrations/20260825190232_viewer_analytics.sql",
      },
    ],
    learning: "Viewer analytics can guide product decisions without building visitor profiles when collection is coarse, allowlisted, insert-only, and separated from unique-visitor reporting.",
    nextHypothesis: "Use real aggregate volume to choose an explicit retention window and the smallest owner-only reporting surface.",
  },
] as const satisfies readonly LabEvolutionEntry[];

const MODULE_LIMITATIONS: Readonly<Record<string, readonly string[]>> = {
  architecture: ["Cross-device sessions require optional provider configuration and deployment testing."],
  deliverables: ["Generated deliverables remain reviewable drafts that require human approval."],
  "flux-observatory": ["No retained live microphone/provider validation record exists; deterministic replay is not live-provider proof."],
  "release-radar": ["The standalone SDK Release & Regression Radar experience is incomplete."],
  "voice-problem": ["Speak the Problem remains planned and unavailable."],
};

const MODULE_NEXT_EXPERIMENTS: Readonly<Record<string, string>> = {
  architecture: "Run the documented non-production, two-device reconnect, expiry, and deletion soak test.",
  "flux-observatory": "Run and retain one bounded microphone/provider lifecycle validation without changing deterministic replay.",
};

const MODULE_LAST_EVOLUTION_ENTRY: Readonly<Record<string, string>> = {
  architecture: "architecture-vercel-preview",
  "api-lab": "pocket-api-lab",
  pocket: "pocket-api-lab",
  "pre-sales": "pre-sales-studio",
  "live-solution": "evidence-grounded-solution-lab",
  "case-graph": "evidence-grounded-solution-lab",
  workbench: "evidence-grounded-solution-lab",
  "sdk-doctor": "evidence-grounded-solution-lab",
  "release-radar": "evidence-grounded-solution-lab",
  deliverables: "evidence-grounded-solution-lab",
  "docs-search": "evidence-grounded-solution-lab",
  "flux-observatory": "flux-conversation-observatory",
};

export type LabModuleEvolutionProfile = Readonly<{
  id: string;
  capabilityId?: string;
  name: string;
  route: string | null;
  why: string;
  implementationStatus: "implemented" | "experimental" | "partial" | "planned" | "unavailable";
  maturity: "stable" | "review" | "prototype" | "concept";
  currentEvidenceStatus: LabEvidenceLabel;
  evidence: readonly LabEvidenceReference[];
  documentationPath: string;
  lastVerifiedAt: string;
  registrySource: "shared-capability" | "explicit-surface";
  knownLimitations?: readonly string[];
  nextExperiment?: string;
  lastEvolutionEntry?: string;
}>;

export type LabModuleMaturity = LabModuleEvolutionProfile;

type CapabilityProfileOverrides = Partial<
  Omit<
    LabModuleEvolutionProfile,
    "id" | "capabilityId" | "registrySource" | "currentEvidenceStatus"
  >
>;

function capabilityProfile(
  id: string,
  capabilityId: string,
  overrides: CapabilityProfileOverrides = {},
): LabModuleEvolutionProfile {
  const capability = CAPABILITIES.find((item) => item.id === capabilityId);
  if (!capability) throw new Error(`Unknown Lab Evolution capability: ${capabilityId}`);

  const knownLimitations = overrides.knownLimitations ?? MODULE_LIMITATIONS[capabilityId];
  const nextExperiment = overrides.nextExperiment ?? MODULE_NEXT_EXPERIMENTS[capabilityId];
  const lastEvolutionEntry = overrides.lastEvolutionEntry ?? MODULE_LAST_EVOLUTION_ENTRY[capabilityId];

  return {
    id,
    capabilityId,
    name: overrides.name ?? capability.name,
    route: overrides.route === undefined ? capability.route : overrides.route,
    why: overrides.why ?? capability.shortDescription,
    implementationStatus: overrides.implementationStatus ?? capability.implementationStatus,
    maturity: overrides.maturity ?? capability.maturity,
    currentEvidenceStatus: "Repository verified",
    evidence: overrides.evidence ?? [
      {
        label: "Repository verified",
        summary: `${capability.name} is registered as ${capability.implementationStatus}; its registry status is not production certification.`,
        source: capability.documentationPath,
      },
    ],
    documentationPath: overrides.documentationPath ?? capability.documentationPath,
    lastVerifiedAt: overrides.lastVerifiedAt ?? capability.lastVerifiedAt,
    registrySource: "shared-capability",
    ...(knownLimitations ? { knownLimitations } : {}),
    ...(nextExperiment ? { nextExperiment } : {}),
    ...(lastEvolutionEntry ? { lastEvolutionEntry } : {}),
  };
}

type ExplicitSurfaceInput = Omit<
  LabModuleEvolutionProfile,
  "currentEvidenceStatus" | "evidence" | "registrySource"
> & Readonly<{
  evidenceSource: string;
  evidenceSummary: string;
  currentEvidenceStatus?: LabEvidenceLabel;
  additionalEvidence?: readonly LabEvidenceReference[];
}>;

function explicitSurface(input: ExplicitSurfaceInput): LabModuleEvolutionProfile {
  const {
    evidenceSource,
    evidenceSummary,
    currentEvidenceStatus = "Repository verified",
    additionalEvidence = [],
    ...profile
  } = input;

  return {
    ...profile,
    currentEvidenceStatus,
    evidence: [
      { label: currentEvidenceStatus, summary: evidenceSummary, source: evidenceSource },
      ...additionalEvidence,
    ],
    registrySource: "explicit-surface",
  };
}

/**
 * User-facing control-room and standalone surfaces. Capability-backed entries
 * read their implementation truth from the shared registry. Explicit entries
 * cover real surfaces whose navigation IDs do not exist in that registry.
 */
export const LAB_EVOLUTION_SURFACE_REGISTRY: readonly LabModuleEvolutionProfile[] = [
  explicitSurface({
    id: "open-lab",
    name: "Public Open Lab",
    route: "/",
    why: "Remove visitor account and API-key friction while keeping execution explicit, bounded, and server-funded.",
    implementationStatus: "implemented",
    maturity: "prototype",
    documentationPath: "docs/WORKING_FEATURES.md",
    lastVerifiedAt: LAB_EVOLUTION_VERIFIED_AT,
    evidenceSource: "docs/WORKING_FEATURES.md#public-open-lab",
    evidenceSummary: "The public UX, private provider switch, explicit actions, and synthetic fallback are implemented.",
    knownLimitations: ["Hosted execution still requires explicit server configuration and a valid server-only credential."],
    nextExperiment: "Complete a successful bounded provider smoke without widening the public route policy.",
    lastEvolutionEntry: "open-lab-flux-one",
  }),
  explicitSurface({
    id: "overview",
    name: "Overview",
    route: "/?module=overview",
    why: "Orient visitors to Lab status, workflows, privacy boundaries, and explicit learning recipes.",
    implementationStatus: "implemented",
    maturity: "review",
    documentationPath: "docs/WORKING_FEATURES.md",
    lastVerifiedAt: LAB_EVOLUTION_VERIFIED_AT,
    evidenceSource: "docs/WORKING_FEATURES.md#core-voice-workflows",
    evidenceSummary: "The Overview and four explicit, non-auto-running recipes are repository verified.",
    lastEvolutionEntry: "applied-voice-baseline",
  }),
  explicitSurface({
    id: "connection",
    name: "Connection Check",
    route: "/?module=connection",
    why: "Check server-side Deepgram configuration without exposing the permanent key or account metadata.",
    implementationStatus: "implemented",
    maturity: "review",
    documentationPath: "docs/WORKING_FEATURES.md",
    lastVerifiedAt: LAB_EVOLUTION_VERIFIED_AT,
    evidenceSource: "docs/WORKING_FEATURES.md#core-voice-workflows",
    evidenceSummary: "The narrow server-side connection route behavior is implemented.",
    knownLimitations: ["A route response does not establish universal model entitlement or production readiness."],
    lastEvolutionEntry: "applied-voice-baseline",
  }),
  explicitSurface({
    id: "transcribe-url",
    name: "URL transcription",
    route: "/?module=transcribe-url",
    why: "Make a guarded prerecorded URL request inspectable from input through transcript and evidence.",
    implementationStatus: "implemented",
    maturity: "review",
    documentationPath: "chatgpt-project-pack/01_CURRENT_PRODUCT_MAP.md",
    lastVerifiedAt: LAB_EVOLUTION_VERIFIED_AT,
    evidenceSource: "chatgpt-project-pack/01_CURRENT_PRODUCT_MAP.md#implemented-surfaces",
    evidenceSummary: "The explicit server-mediated URL transcription workflow is implemented and browser-tested with a mocked provider.",
    knownLimitations: ["Mocked browser evidence does not prove live media access or account behavior."],
    nextExperiment: "Run one bounded live request against reviewed public sample media and record the result separately from mocked evidence.",
    lastEvolutionEntry: "applied-voice-baseline",
  }),
  explicitSurface({
    id: "upload-audio",
    name: "Upload transcription",
    route: "/?module=upload-audio",
    why: "Let a user inspect a local audio file before an explicit, validated transcription request.",
    implementationStatus: "implemented",
    maturity: "review",
    documentationPath: "docs/UPLOAD_AUDIO_WORKFLOW.md",
    lastVerifiedAt: LAB_EVOLUTION_VERIFIED_AT,
    evidenceSource: "chatgpt-project-pack/01_CURRENT_PRODUCT_MAP.md#implemented-surfaces",
    evidenceSummary: "Local selection and preview are separate from the explicit guarded upload action.",
    knownLimitations: ["Selection never auto-uploads; automated coverage does not prove live provider or account behavior."],
    nextExperiment: "Run a bounded upload with reviewed non-confidential audio and retain only sanitized request evidence.",
    lastEvolutionEntry: "applied-voice-baseline",
  }),
  explicitSurface({
    id: "live-mic",
    name: "Live Mic / realtime STT",
    route: "/?module=live-mic",
    why: "Teach microphone consent, short-lived authentication, realtime events, failure handling, and cleanup as one lifecycle.",
    implementationStatus: "implemented",
    maturity: "prototype",
    documentationPath: "docs/LIVE_MIC_MULTILINGUAL.md",
    lastVerifiedAt: LAB_EVOLUTION_VERIFIED_AT,
    evidenceSource: "chatgpt-project-pack/01_CURRENT_PRODUCT_MAP.md#implemented-surfaces",
    evidenceSummary: "Permission, token, socket, event inspection, stop, and cleanup behavior are implemented with mocked coverage.",
    knownLimitations: ["Hardware, codecs, browser permission, network, provider behavior, and deployment still require bounded manual proof."],
    nextExperiment: "Retain one consented browser/microphone/provider smoke with token cleanup and no raw-audio persistence.",
    lastEvolutionEntry: "applied-voice-baseline",
  }),
  explicitSurface({
    id: "tts",
    name: "Aura Studio / Text to Speech",
    route: "/?module=tts",
    why: "Generate and inspect bounded existing /v1/speak synthesis without conflating it with Flux TTS.",
    implementationStatus: "implemented",
    maturity: "review",
    documentationPath: "docs/WORKING_FEATURES.md",
    lastVerifiedAt: LAB_EVOLUTION_VERIFIED_AT,
    evidenceSource: "docs/WORKING_FEATURES.md#core-voice-workflows",
    evidenceSummary: "Existing Aura generation, playback, stop, and clear remain implemented and independent from Flux.",
    knownLimitations: ["Automated evidence does not establish live provider entitlement, audible quality, or universal latency."],
    nextExperiment: "Run one bounded Aura playback smoke and preserve only sanitized request evidence.",
    lastEvolutionEntry: "applied-voice-baseline",
  }),
  explicitSurface({
    id: "flux-tts",
    name: "Flux TTS Studio",
    route: "/?module=flux-tts",
    why: "Compare voice-agent-first /v2/speak synthesis through explicit batch generation, A/B playback, and sanitized evidence.",
    implementationStatus: "implemented",
    maturity: "prototype",
    documentationPath: "chatgpt-project-pack/05_DEEPGRAM_CAPABILITY_MAP.md",
    lastVerifiedAt: LAB_EVOLUTION_VERIFIED_AT,
    evidenceSource: "chatgpt-project-pack/07_IMPLEMENTATION_EVIDENCE.md",
    evidenceSummary: "The registry-driven batch route, studio, inspector, examples, and mocked-provider coverage are implemented.",
    additionalEvidence: [
      {
        label: "Deepgram documentation verified",
        summary: "The /v2/speak batch contract and dated voice-catalog boundary were checked against official documentation.",
        source: "chatgpt-project-pack/05_DEEPGRAM_CAPABILITY_MAP.md",
      },
    ],
    knownLimitations: [
      "The bounded live smoke returned provider_authorization_failed and no audio.",
      "Streaming remains disabled until its deployed browser authentication and raw-audio path are proven.",
    ],
    nextExperiment: "Resolve the authorization boundary, then run one Cole and one Jack batch request with no retry before any live-audio claim.",
    lastEvolutionEntry: "open-lab-flux-one",
  }),
  explicitSurface({
    id: "trusted-voice",
    name: "Familiar Care / Trusted Voice",
    route: "/?module=trusted-voice",
    why: "Explore consent, disclosure, opt-out, fallback, and narrowly gated synthetic-voice patterns.",
    implementationStatus: "implemented",
    maturity: "prototype",
    documentationPath: "docs/FAMILIAR_CARE_DESIGN.md",
    lastVerifiedAt: LAB_EVOLUTION_VERIFIED_AT,
    evidenceSource: "chatgpt-project-pack/01_CURRENT_PRODUCT_MAP.md#implemented-surfaces",
    evidenceSummary: "The consent-first demo and optional bounded preview are implemented.",
    knownLimitations: ["This is demo-only, not identity cloning, care software, or legal/compliance advice."],
    lastEvolutionEntry: "applied-voice-baseline",
  }),
  explicitSurface({
    id: "sample-library",
    name: "Sample Library",
    route: "/?module=sample-library",
    why: "Provide reviewed sample audio with provenance for repeatable learning flows.",
    implementationStatus: "implemented",
    maturity: "review",
    documentationPath: "docs/AUDIO_SAMPLE_LIBRARY.md",
    lastVerifiedAt: LAB_EVOLUTION_VERIFIED_AT,
    evidenceSource: "docs/AUDIO_SAMPLE_LIBRARY.md",
    evidenceSummary: "The project-owned sample catalog and provenance documentation are present.",
    knownLimitations: ["The reviewed sample set does not establish rights or behavior for arbitrary third-party media."],
    lastEvolutionEntry: "applied-voice-baseline",
  }),
  capabilityProfile("language-explorer", "language"),
  explicitSurface({
    id: "redaction-lab",
    name: "Redaction Lab",
    route: "/?module=redaction-lab",
    why: "Make transcript privacy choices and downstream policy consequences inspectable.",
    implementationStatus: "implemented",
    maturity: "review",
    documentationPath: "docs/REDACTION_LAB.md",
    lastVerifiedAt: LAB_EVOLUTION_VERIFIED_AT,
    evidenceSource: "docs/WORKING_FEATURES.md#diagnostics-governance-and-api-exploration",
    evidenceSummary: "Transcript redaction exercises and explicit handoffs are implemented.",
    knownLimitations: ["Redaction changes transcript output only; source audio remains unchanged and separately governed."],
    lastEvolutionEntry: "applied-voice-baseline",
  }),
  capabilityProfile("audio-signal-lab", "audio", {
    name: "Audio Signal Lab",
    knownLimitations: ["The browser signal tools are educational and are not a production audio-QA service."],
    lastEvolutionEntry: "applied-voice-baseline",
  }),
  capabilityProfile("api-studio", "api-lab", {
    name: "API Lab",
    knownLimitations: ["It is not an arbitrary upstream proxy and exposes no Manage mutation plane."],
    lastEvolutionEntry: "applied-voice-baseline",
  }),
  explicitSurface({
    id: "applied-voice-systems",
    name: "Applied Voice Systems",
    route: "/?module=applied-voice-systems",
    why: "Connect isolated voice APIs to inspectable client architectures, failure experiments, and readiness questions.",
    implementationStatus: "implemented",
    maturity: "prototype",
    documentationPath: "docs/APPLIED_VOICE_SYSTEMS_PLAN.md",
    lastVerifiedAt: LAB_EVOLUTION_VERIFIED_AT,
    evidenceSource: "README.md#applied-voice-systems",
    evidenceSummary: "The architecture and experiment surface exists in the current control room.",
    knownLimitations: ["External tools, telephony, LLM/RAG, and multi-agent paths remain simulated or architectural unless explicitly labeled otherwise."],
    lastEvolutionEntry: "applied-voice-baseline",
  }),
  explicitSurface({
    id: "applied-engineering-questline",
    name: "Applied Engineering Questline",
    route: "/?module=applied-engineering-questline",
    why: "Turn voice-system concepts into deterministic exercises, debugging paths, and handoffs.",
    implementationStatus: "implemented",
    maturity: "review",
    documentationPath: "docs/APPLIED_ENGINEERING_QUESTLINE.md",
    lastVerifiedAt: LAB_EVOLUTION_VERIFIED_AT,
    evidenceSource: "README.md#applied-engineering-questline",
    evidenceSummary: "The Questline and its reviewed handoffs are implemented with deterministic coverage.",
    knownLimitations: ["Exercises and fixtures do not substitute for live provider, hardware, or customer-environment validation."],
    lastEvolutionEntry: "applied-voice-baseline",
  }),
  explicitSurface({
    id: "live-observatory",
    name: "Live Observatory Lab",
    route: "/?module=live-observatory",
    why: "Compare STT, TTS, realtime, and round-trip evidence with explicit provenance and lifecycle inspection.",
    implementationStatus: "implemented",
    maturity: "prototype",
    documentationPath: "docs/LIVE_OBSERVATORY_LAB.md",
    lastVerifiedAt: LAB_EVOLUTION_VERIFIED_AT,
    evidenceSource: "chatgpt-project-pack/01_CURRENT_PRODUCT_MAP.md#implemented-surfaces",
    evidenceSummary: "The controlled observability workflows are implemented with browser and fixture evidence.",
    knownLimitations: ["Public Open Lab blocks account and Management reads; fixture evidence is not live-provider proof."],
    nextExperiment: "Run one bounded provider lifecycle and retain only sanitized provenance events.",
    lastEvolutionEntry: "applied-voice-baseline",
  }),
  explicitSurface({
    id: "code-lab",
    name: "Code Lab",
    route: "/?module=code-lab",
    why: "Provide editable, reviewable integration recipes with credential placeholders and explicit handoffs.",
    implementationStatus: "implemented",
    maturity: "review",
    documentationPath: "docs/QUESTLINE_CODE_LAB_HANDOFF_TESTS.md",
    lastVerifiedAt: LAB_EVOLUTION_VERIFIED_AT,
    evidenceSource: "docs/WORKING_FEATURES.md#architecture-solution-and-handoff-surfaces",
    evidenceSummary: "Local recipes, sanitized drafts, and placeholder examples are repository verified.",
    knownLimitations: ["Generated or edited examples require operator review before execution."],
    lastEvolutionEntry: "applied-voice-baseline",
  }),
  explicitSurface({
    id: "lab-evolution",
    name: "Lab Evolution",
    route: "/?module=lab-evolution",
    why: "Show how questions become experiments, implementations, evidence, delivery, and the next iteration.",
    implementationStatus: "implemented",
    maturity: "prototype",
    documentationPath: "src/lib/lab-evolution.ts",
    lastVerifiedAt: LAB_EVOLUTION_VERIFIED_AT,
    evidenceSource: "src/lib/lab-evolution.ts",
    evidenceSummary: "The recursive loop, delivery architecture, evidence philosophy, timeline, experiments, limitations, and hypotheses are registry-driven.",
    knownLimitations: [
      "Entire is observational and experimental; no tracked checkpoint identifier is claimed.",
      "Lab Evolution does not modify the canonical GitHub-to-Vercel delivery path.",
    ],
    lastEvolutionEntry: "lab-evolution-notebook",
  }),
  capabilityProfile("live-solution", "live-solution"),
  capabilityProfile("flux-observatory", "flux-observatory"),
  capabilityProfile("architecture", "architecture"),
  capabilityProfile("pre-sales", "pre-sales"),
  capabilityProfile("deliverables", "deliverables"),
  capabilityProfile("pocket", "pocket", {
    knownLimitations: ["Pocket persists only allowlisted UI state, not credentials or raw audio."],
  }),
];

const SURFACED_CAPABILITY_IDS = new Set(
  LAB_EVOLUTION_SURFACE_REGISTRY.flatMap((surface) => surface.capabilityId ? [surface.capabilityId] : []),
);

const CAPABILITY_ONLY_PROFILES = CAPABILITIES
  .filter((capability) => !SURFACED_CAPABILITY_IDS.has(capability.id))
  .map((capability) => capabilityProfile(capability.id, capability.id));

export const LAB_MODULE_MATURITY_OVERVIEW: readonly LabModuleEvolutionProfile[] = [
  ...LAB_EVOLUTION_SURFACE_REGISTRY,
  ...CAPABILITY_ONLY_PROFILES,
];

export const LAB_MODULE_EVOLUTION_PROFILES = LAB_MODULE_MATURITY_OVERVIEW;

export function labModuleMaturityById(id: string): LabModuleEvolutionProfile | null {
  return LAB_MODULE_MATURITY_OVERVIEW.find(
    (module) => module.id === id || module.capabilityId === id,
  ) ?? null;
}

export function labModuleEvolutionProfileById(id: string): LabModuleEvolutionProfile | null {
  return labModuleMaturityById(id);
}

export function labEvolutionEntryById(id: string): LabEvolutionEntry | null {
  return LAB_EVOLUTION_TIMELINE.find((entry) => entry.id === id) ?? null;
}

export const CURRENT_LAB_EXPERIMENTS = [
  {
    id: "flux-live-authorization",
    title: "Flux batch live authorization",
    description: "The batch implementation and mocked boundary pass, but the bounded Cole and Jack provider smoke returned provider_authorization_failed and no audio.",
    status: "Repository verified",
    evidence: [
      {
        label: "Repository verified",
        summary: "The readiness snapshot records exactly two requests, no retry, safe request IDs, and no successful audio proof.",
        source: "chatgpt-project-pack/08_TEST_AND_READINESS_STATUS.md#live-provider-status",
      },
    ],
    nextHypothesis: "A correctly authorized and entitled server credential will permit one bounded Cole request and one bounded Jack request without changing the public credential architecture.",
  },
  {
    id: "flux-browser-streaming",
    title: "Flux browser streaming",
    description: "Streaming remains disabled until the deployed JWT authentication, binary audio, lifecycle, and cleanup path is proven.",
    status: "Experimental idea",
    evidence: [
      {
        label: "Deepgram documentation verified",
        summary: "Official documentation describes the endpoint, bearer JWT pattern, raw audio, and lifecycle, but documentation is not deployment proof.",
        source: "chatgpt-project-pack/05_DEEPGRAM_CAPABILITY_MAP.md",
      },
    ],
    nextHypothesis: "A bounded deployed browser smoke can validate authentication, first audio, lifecycle events, Stop, and complete cleanup before the control is enabled.",
  },
  {
    id: "architecture-shared-session",
    title: "Architecture Studio shared session",
    description: "The one-browser local fallback is implemented; optional hosted cross-device behavior still requires configured infrastructure and deployment testing.",
    status: "Experimental idea",
    evidence: [
      {
        label: "Repository verified",
        summary: "Architecture documentation records the local fallback and the unverified shared-session boundary.",
        source: "docs/architecture-studio.md#known-limitations",
      },
    ],
    nextHypothesis: "A non-production two-device soak can expose reconnect, expiry, deletion, and authorization gaps without changing the local-first fallback.",
  },
  {
    id: "entire-context-capture",
    title: "Entire development-context capture",
    description: "Entire is modeled as a parallel observational context layer, not source control and not deployment infrastructure.",
    status: "Experimental idea",
    evidence: [
      {
        label: "Experimental idea",
        summary: "No tracked checkpoint identifier or deployment responsibility is claimed in the current registry.",
        source: "Lab Evolution architecture boundary",
      },
    ],
    nextHypothesis: "A redaction-aware checkpoint reference may improve implementation reproducibility while GitHub remains canonical and Vercel behavior remains unchanged.",
  },
] as const satisfies readonly LabEvolutionTopic[];

export const LAB_EVOLUTION_KNOWN_LIMITATIONS = [
  {
    id: "community-prototype",
    title: "Prototype boundary",
    description: "The Lab is community-built learning and prototype software, not an official Deepgram product or production-certified service.",
    status: "Repository verified",
    evidence: [{ label: "Repository verified", summary: "The limitation is explicit in the current product map.", source: "chatgpt-project-pack/01_CURRENT_PRODUCT_MAP.md" }],
  },
  {
    id: "live-provider-proof",
    title: "Successful Flux live proof is absent",
    description: "Mocked route and browser evidence passed, but the bounded live smoke returned authorization failures and no audio.",
    status: "Repository verified",
    evidence: [{ label: "Repository verified", summary: "The exact bounded smoke and its non-proof boundary are recorded.", source: "chatgpt-project-pack/08_TEST_AND_READINESS_STATUS.md#live-provider-status" }],
  },
  {
    id: "omni-watermark-asset",
    title: "Approved Omni asset is missing",
    description: "The shared integration remains disabled until /public/brand/omni-neural-engine-mark.svg is supplied.",
    status: "Repository verified",
    evidence: [{ label: "Repository verified", summary: "The missing path and disabled behavior are documented and tested.", source: "docs/KNOWN_LIMITATIONS.md" }],
  },
  {
    id: "incomplete-modules",
    title: "Some surfaces remain incomplete",
    description: "SDK Release & Regression Radar is partial, and Speak the Problem remains planned and unavailable.",
    status: "Repository verified",
    evidence: [{ label: "Repository verified", summary: "Both boundaries remain explicit in the product map and capability registry.", source: "chatgpt-project-pack/01_CURRENT_PRODUCT_MAP.md" }],
  },
] as const satisfies readonly LabEvolutionTopic[];

export const LAB_EVOLUTION_NEXT_HYPOTHESES = [
  {
    id: "prove-flux-batch-audio",
    title: "Prove one bounded Flux batch path",
    description: "Resolve the current authorization boundary, then verify Cole, Jack, playback, download, content type, request ID, and redaction without retries.",
    status: "Assumption",
    evidence: [{ label: "Assumption", summary: "The repository does not yet distinguish credential authorization from model entitlement.", source: "chatgpt-project-pack/08_TEST_AND_READINESS_STATUS.md#live-provider-status" }],
  },
  {
    id: "prove-flux-streaming",
    title: "Prove streaming before enabling it",
    description: "Validate the documented browser authentication and raw-audio lifecycle in a deployed environment before exposing a working Streaming control.",
    status: "Experimental idea",
    evidence: [{ label: "Experimental idea", summary: "The implementation intentionally leaves streaming disabled pending deployment proof.", source: "docs/KNOWN_LIMITATIONS.md" }],
  },
  {
    id: "verify-cross-device-studio",
    title: "Exercise the shared Architecture Studio",
    description: "Use non-production configuration for the documented two-device reconnect, expiry, deletion, and authorization test.",
    status: "Experimental idea",
    evidence: [{ label: "Repository verified", summary: "The next test is recorded in the Architecture Studio backlog.", source: "docs/architecture-studio.md#post-workshop-backlog" }],
  },
  {
    id: "evaluate-entire-context",
    title: "Evaluate contextual capture without changing delivery",
    description: "Test whether a sanitized Entire checkpoint reference improves reproducibility while commits remain canonical in GitHub and deployments continue through Vercel.",
    status: "Experimental idea",
    evidence: [{ label: "Experimental idea", summary: "No checkpoint is currently asserted; this is a bounded next hypothesis only.", source: "Lab Evolution architecture boundary" }],
  },
] as const satisfies readonly LabEvolutionTopic[];
