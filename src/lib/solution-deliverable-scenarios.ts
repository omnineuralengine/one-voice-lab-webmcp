import {
  addCaseRelation,
  captureCaseItem,
  createSolutionCaseBundle,
} from "@/lib/live-solution-case";
import type { CaptureInput } from "@/lib/live-solution-case";
import type { SolutionCaseBundle } from "@/types/live-solution-case";
const NOW = "2026-07-28T12:00:00.000Z";
const officialEvidence = (
  title: string,
  canonicalSourceUrl: string,
  conciseParaphrase: string,
): CaptureInput => ({
  kind: "official-deepgram-evidence",
  title,
  body: conciseParaphrase,
  structuredData: {
    canonicalSourceUrl,
    sourceTitle: title,
    sourceType: "documentation",
    conciseParaphrase,
    retrievedAt: NOW,
    lastVerifiedAt: NOW,
    freshnessState: "current",
    authorityLevel: "official-deepgram",
    citationIdentifier: `deepgram-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  },
  verificationState: "officially-sourced",
});
function build(name: string, items: CaptureInput[]) {
  let b = createSolutionCaseBundle(
    `${name} — synthetic deliverable case`,
    NOW,
    true,
  );
  b.case.optionalCustomerDisplayName = name;
  b.case.sourceFreshness = { state: "current", lastVerifiedAt: NOW };
  for (const item of items) b = captureCaseItem(b, item, NOW);
  for (const item of b.items)
    item.includeInCustomerExport = !(
      [
        "assumption",
        "hypothesis",
        "release-finding",
        "unresolved-conflict",
      ].includes(item.kind) ||
      item.visibility === "private" ||
      /unsafe key excluded/i.test(item.title)
    );
  const decision = b.items.find((item) => item.kind === "decision");
  const architecture = b.items.find(
    (item) => item.kind === "architecture-option",
  );
  if (decision && architecture)
    b = addCaseRelation(
      b,
      {
        fromItemId: architecture.id,
        toItemId: decision.id,
        type: "implements",
        note: "Synthetic architecture option implements the recorded solution direction.",
        visibility: "customer",
      },
      NOW,
    );
  const official = b.items.find(
    (item) => item.kind === "official-deepgram-evidence",
  );
  if (official)
    for (const claim of b.items.filter((item) =>
      ["decision", "architecture-option", "requirement"].includes(item.kind),
    ))
      b = addCaseRelation(
        b,
        {
          fromItemId: claim.id,
          toItemId: official.id,
          type: "documented-by",
          note: "Current product-specific details must be checked against this official source boundary.",
          visibility: "customer",
        },
        NOW,
      );
  return b;
}
const base = (
  outcome: string,
  problem: string,
  solution: string,
  decisionStatus: "accepted" | "proposed" = "accepted",
): CaptureInput[] => [
  {
    kind: "business-outcome",
    title: "Accepted business outcome",
    body: outcome,
    verificationState: "customer-confirmed",
  },
  {
    kind: "customer-statement",
    title: "Current challenge",
    body: problem,
    statementMode: "user-paraphrase",
    verificationState: "customer-stated-unverified",
  },
  {
    kind: "decision",
    title:
      decisionStatus === "accepted"
        ? "Accepted architecture"
        : "Proposed architecture",
    body: solution,
    structuredData: {
      decisionStatus,
      decisionStatement: solution,
      rationale: "Selected for the synthetic POC",
      supportingEvidenceIds: [],
      contradictoryEvidenceIds: [],
      decisionOwner: "Synthetic technical lead",
      reversible: true,
      validationRequired: true,
    },
    verificationState:
      decisionStatus === "accepted" ? "customer-confirmed" : "inferred",
  },
  {
    kind: "architecture-option",
    title:
      decisionStatus === "accepted"
        ? "Accepted solution representation"
        : "Proposed solution representation",
    body: solution,
    verificationState:
      decisionStatus === "accepted" ? "customer-confirmed" : "inferred",
  },
  {
    kind: "requirement",
    title: "Accepted solution requirement",
    body: `The POC must demonstrate this agreed direction: ${solution}`,
    verificationState: "customer-confirmed",
  },
  {
    kind: "constraint",
    title: "Production verification boundary",
    body: "Production endpoints, regions, versions, and account-specific availability must be confirmed against current official guidance before launch.",
    verificationState: "customer-confirmed",
  },
  {
    kind: "official-deepgram-evidence",
    title: "Deepgram documentation index",
    body: "Current Deepgram product behavior must be checked against the official documentation before customer sharing.",
    structuredData: {
      canonicalSourceUrl: "https://developers.deepgram.com/llms.txt",
      sourceTitle: "Deepgram documentation index",
      sourceType: "documentation-index",
      conciseParaphrase:
        "Use current official documentation for product-specific claims.",
      retrievedAt: NOW,
      lastVerifiedAt: NOW,
      freshnessState: "current",
      authorityLevel: "official-deepgram",
      citationIdentifier: "deepgram-docs-index",
    },
    verificationState: "officially-sourced",
  },
  {
    kind: "success-criterion",
    title: "POC success criteria",
    body: "Representative scenarios meet the agreed task, latency, safety, and recovery acceptance checks.",
    verificationState: "customer-confirmed",
  },
  {
    kind: "action",
    title: "Kick off synthetic POC",
    body: "Joint team prepares the representative fixture set and validation run.",
    structuredData: {
      actionText: "Prepare fixtures",
      owner: "Joint synthetic team",
      ownerType: "joint",
      status: "open",
      customerVisible: true,
    },
    verificationState: "customer-confirmed",
  },
];
export function northstarDeliverableCase() {
  return build("Northstar Appointments", [
    ...base(
      "Completed appointment bookings should increase without unsafe duplicate mutations.",
      "Browser capture and server authorization responsibilities were initially ambiguous.",
      "Browser captures audio; a trusted server issues temporary authorization; booking mutation requires confirmation and an idempotency key.",
    ),
    officialEvidence(
      "Token-Based Authentication",
      "https://developers.deepgram.com/guides/fundamentals/token-based-authentication",
      "Official guidance describes short-lived token grants for client-side voice applications while long-lived credentials remain on a trusted server.",
    ),
    officialEvidence(
      "Voice Agent API",
      "https://developers.deepgram.com/docs/voice-agent",
      "Official Voice Agent guidance defines the managed conversational session boundary used for this synthetic option comparison.",
    ),
    {
      kind: "architecture-option",
      title: "Voice booking flow",
      body: "Browser microphone → trusted Next.js route → composable voice runtime → confirmed scheduling function → observability.",
      verificationState: "customer-confirmed",
    },
    {
      kind: "observed-technical-evidence",
      title: "Unsafe key excluded",
      body: "A long-lived browser API key was found and redacted.",
      structuredData: {
        runtime: "browser",
        redactionFinding: "REDACTED_SECRET",
      },
      verificationState: "artifact-observed",
      visibility: "internal",
    },
  ]);
}
export function harborDeliverableCase() {
  const bundle = build("Harbor Contact Center", [
    ...base(
      "Contact-center handling time should decrease while interruption recovery remains reliable.",
      "Telephony evidence shows μ-law 8 kHz while configuration states linear PCM 16 kHz.",
      "Align Deepgram input settings with μ-law 8 kHz or add an explicit, measured transcoding boundary before the streaming connection.",
    ),
    officialEvidence(
      "Live Streaming Audio",
      "https://developers.deepgram.com/docs/live-streaming-audio",
      "Official streaming guidance is the verification boundary for realtime transport and input-format configuration.",
    ),
    {
      kind: "observed-technical-evidence",
      title: "Observed telephony media",
      body: "The synthetic telephony fixture is μ-law at 8 kHz.",
      structuredData: {
        codec: "mulaw",
        sampleRate: "8000",
      },
      verificationState: "artifact-observed",
    },
    {
      kind: "observed-technical-evidence",
      title: "Configured middleware media",
      body: "The synthetic middleware configuration declares linear PCM at 16 kHz.",
      structuredData: {
        codec: "linear16",
        sampleRate: "16000",
      },
      verificationState: "artifact-observed",
    },
    {
      kind: "architecture-option",
      title: "Media path",
      body: "Telephony connector → WebSocket middleware → explicit format validation/transcoding → Deepgram streaming → agent workflow.",
      verificationState: "customer-confirmed",
    },
    {
      kind: "validation-result",
      title: "Audio quality gate",
      body: "Synthetic μ-law fixtures are compared before and after the proposed boundary.",
      structuredData: {
        testEnvironment: "synthetic POC",
        codec: "mulaw",
        sampleRate: "8000",
      },
      verificationState: "locally-validated",
    },
  ]);
  for (const conflict of bundle.items.filter(
    (item) =>
      item.kind === "unresolved-conflict" &&
      ["codec", "sampleRate"].includes(String(item.structuredData.field)),
  )) {
    conflict.status = "resolved";
    conflict.resolvedAt = NOW;
    conflict.structuredData.resolutionStatus =
      "resolved-by-explicit-transcoding-boundary";
  }
  return bundle;
}
export function atlasDeliverableCase() {
  return build("Atlas Developer Platform", [
    ...base(
      "The failing async Python integration should be restored with the smallest reviewable repair.",
      "The lockfile version and code generation do not match after a dependency update.",
      "Update the code to the installed SDK generation first, then validate a possible release match without claiming a confirmed Deepgram defect.",
    ),
    officialEvidence(
      "SDK Feature Matrix",
      "https://developers.deepgram.com/sdks/sdk-features",
      "The official SDK feature matrix is a starting point for version-sensitive capability checks; the fictional installed version still requires local validation.",
    ),
    {
      kind: "architecture-option",
      title: "Version-aligned validation path",
      body: "Python async service → version-aligned SDK adapter → Deepgram WebSocket → scoped fixture validation.",
      verificationState: "customer-confirmed",
    },
    {
      kind: "observed-technical-evidence",
      title: "Resolved lockfile version",
      body: "The synthetic lockfile resolves deepgram-sdk 9.9.0-fictional.",
      structuredData: {
        sdk: "deepgram-sdk",
        sdkVersion: "9.9.0-fictional",
        runtime: "Python async service",
      },
      verificationState: "artifact-observed",
    },
    {
      kind: "release-finding",
      title: "Possible release match",
      body: "A synthetic Release Radar entry may be related, but the affected range is incomplete.",
      verificationState: "inferred",
    },
    {
      kind: "validation-result",
      title: "Candidate patch plan",
      body: "Run the redacted fixture through raw WebSocket and SDK paths in the synthetic test environment.",
      structuredData: { testEnvironment: "synthetic Python CI" },
      verificationState: "locally-validated",
    },
  ]);
}
export function crescentDeliverableCase() {
  return build("Crescent Retail", [
    ...base(
      "Multilingual retail callers should be served while order data and critical product-name accuracy remain protected.",
      "The assistant must look up orders, confirm mutations, scale for seasonal traffic, and fall back to a human.",
      "Use a regional voice boundary, separate lookup from confirmed modification, redact PII, and route uncertainty or provider failure to a human agent.",
    ),
    officialEvidence(
      "Models and Languages",
      "https://developers.deepgram.com/docs/models-languages-overview",
      "Official model and language documentation is the verification boundary for multilingual support and model selection.",
    ),
    officialEvidence(
      "Concurrency Rate Limits",
      "https://developers.deepgram.com/docs/working-with-concurrency-rate-limits",
      "Official concurrency guidance supports capacity planning while the synthetic peak remains an assumption until measured.",
    ),
    {
      kind: "architecture-option",
      title: "Regional retail voice flow",
      body: "Regional voice boundary → multilingual recognition and response → read-only order lookup → confirmed order mutation → human fallback.",
      verificationState: "customer-confirmed",
    },
    {
      kind: "constraint",
      title: "Regional and privacy boundary",
      body: "Regional processing and PII redaction are required.",
      structuredData: {
        region: "customer-approved region",
        retentionPolicy: "redacted transcript only",
      },
      verificationState: "customer-confirmed",
    },
    {
      kind: "requirement",
      title: "Safe function contract",
      body: "Order lookup is read-only; order modification requires explicit confirmation.",
      verificationState: "customer-confirmed",
    },
    {
      kind: "success-criterion",
      title: "Critical entity accuracy",
      body: "Product names and order identifiers meet the customer-approved critical-entity acceptance threshold.",
      verificationState: "customer-confirmed",
    },
    {
      kind: "assumption",
      title: "Seasonal capacity",
      body: "Peak concurrency remains a planning assumption until measured.",
      structuredData: { concurrency: "to confirm" },
      verificationState: "inferred",
    },
  ]);
}
export function lighthouseDeliverableCase() {
  const bundle = build("Lighthouse Financial", [
    ...base(
      "A regulated self-hosted voice deployment must be evaluated with controlled residency.",
      "Release, driver compatibility, retention, and model availability evidence is incomplete.",
      "A private deployment direction is proposed for review; it is not an accepted production architecture.",
      "proposed",
    ),
    officialEvidence(
      "Self-Hosted Introduction",
      "https://developers.deepgram.com/docs/self-hosted-introduction",
      "Official self-hosted guidance identifies deployment prerequisites and the need to confirm contracted components, models, and infrastructure.",
    ),
    officialEvidence(
      "Using SDKs with Self-Hosted",
      "https://developers.deepgram.com/docs/using-sdks-with-self-hosted",
      "Official SDK guidance is the verification boundary for self-hosted endpoint and version configuration.",
    ),
    {
      kind: "architecture-option",
      title: "Proposed private deployment direction",
      body: "Customer environment → proposed self-hosted service boundary → unconfirmed model runtime → customer-controlled retention and observability.",
      verificationState: "inferred",
    },
    {
      kind: "observed-technical-evidence",
      title: "Retention note A",
      body: "One synthetic note states audio retention is disabled.",
      structuredData: { retentionPolicy: "disabled" },
      verificationState: "artifact-observed",
    },
    {
      kind: "observed-technical-evidence",
      title: "Retention note B",
      body: "Another synthetic note states thirty-day retention.",
      structuredData: { retentionPolicy: "30 days" },
      verificationState: "artifact-observed",
    },
    {
      kind: "risk",
      title: "Deployment evidence missing",
      body: "Self-hosted release identifier, driver compatibility, and model availability are unconfirmed.",
      structuredData: {
        riskCategory: "deployment",
        likelihood: "Unknown",
        impact: "High",
        severity: "High",
        description: "Missing deployment compatibility evidence",
        mitigation: "Obtain release and driver inventory",
        mitigationOwner: "Security review",
        mitigationStatus: "open",
        blocking: true,
      },
      verificationState: "unverified",
    },
    {
      kind: "constraint",
      title: "Data residency",
      body: "Controlled data residency and security review are required.",
      verificationState: "customer-confirmed",
    },
  ]);
  return bundle;
}
export const SYNTHETIC_DELIVERABLE_SCENARIOS = [
  {
    id: "northstar",
    expected: "customer-ready",
    create: northstarDeliverableCase,
  },
  { id: "harbor", expected: "customer-ready", create: harborDeliverableCase },
  { id: "atlas", expected: "customer-ready", create: atlasDeliverableCase },
  {
    id: "crescent",
    expected: "customer-ready",
    create: crescentDeliverableCase,
  },
  { id: "lighthouse", expected: "blocked", create: lighthouseDeliverableCase },
] as const;
export type SyntheticDeliverableScenario =
  ReturnType<
    (typeof SYNTHETIC_DELIVERABLE_SCENARIOS)[number]["create"]
  > extends SolutionCaseBundle
    ? string
    : never;
