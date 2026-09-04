import { runEvaluationScenario } from "@/lib/applied-voice/academy";
import { EVALUATION_SCENARIOS } from "@/lib/applied-voice/labs";
import { getCanonicalUrl } from "@/lib/public-evidence/canonical-url";
import {
  PUBLIC_REGISTRY_LAST_VERIFIED_AT,
  publicEvalSchema,
  publicMethodologySchema,
  publicProviderSchema,
  publicSyntheticEvalResultSchema,
  type PublicEval,
  type PublicEvidenceType,
  type PublicMethodology,
  type PublicProvider,
  type PublicSyntheticEvalResult,
} from "@/lib/public-evidence/schemas";
import { getProviderConfigurationStates } from "@/lib/providers/configuration";
import { projectProviderPlatform } from "@/lib/providers/platform-service";
import type {
  ProviderOperationalPolicy,
  ProviderPlatformProjection,
} from "@/lib/providers/platform-types";
import { getProviderManifest, PROVIDER_REGISTRY } from "@/lib/providers/registry";
import type { ProviderCapability, ProviderManifest, ProviderStatus } from "@/lib/providers/types";

type EnvironmentLookup = Readonly<Record<string, string | undefined>>;

const REPOSITORY_URL = "https://github.com/omnineuralengine/ONE-voice-lab";

type PublicEvidenceLabel = PublicProvider["evidence"];
type PublicProviderSupportState = PublicProvider["capabilities"][number]["providerSupport"];

type ProviderDocumentationReference = Readonly<{
  title: string;
  url: string;
  verifiedAt: string;
  status: string;
}>;

function publicEvidenceLabel(value: string): PublicEvidenceLabel {
  if (value === "Repository verified") return value;
  if (value === "Documentation verified" || value === "Official documentation verified") {
    return "Provider documentation verified";
  }
  if (value === "Manual verification required") return value;
  return "No implementation evidence";
}

function evidenceTypeForLabel(label: PublicEvidenceLabel): PublicEvidenceType {
  if (label === "Repository verified") return "repository_verified";
  if (label === "Provider documentation verified") return "provider_documentation_verified";
  if (label === "Manual verification required") return "manual_verification_required";
  return "no_implementation_evidence";
}

function providerSupportForEvidence(value: string): PublicProviderSupportState {
  if (value === "Repository verified") return value;
  if (value === "Documentation verified" || value === "Official documentation verified") {
    return "Provider documentation verified";
  }
  if (value === "No implementation evidence") return "Not supported";
  return "Verification required";
}

function providerDocumentation(manifest: ProviderManifest): ProviderDocumentationReference[] {
  const references: unknown[] = [
    ...manifest.documentationReferences,
    ...("docs" in manifest && Array.isArray(manifest.docs) ? manifest.docs : []),
  ];
  return references.filter((reference): reference is ProviderDocumentationReference => {
    if (typeof reference !== "object" || reference === null) return false;
    const candidate = reference as Record<string, unknown>;
    return typeof candidate.title === "string"
      && typeof candidate.url === "string"
      && typeof candidate.verifiedAt === "string"
      && typeof candidate.status === "string";
  });
}

function capabilityProjection(
  capability: (typeof PROVIDER_REGISTRY)[number]["capabilities"][number],
  providerLiveEnabled: boolean,
  adapterBacked: boolean,
): {
  id: ProviderCapability;
  providerSupport: PublicProviderSupportState;
  labImplementation: ProviderStatus;
  evidence: PublicEvidenceLabel;
  adapterBacked: boolean;
  liveEnabled: boolean;
  providerTerm?: string;
} {
  const enhanced = capability as typeof capability & {
    providerSupport?: string;
    labImplementation?: ProviderStatus;
    liveExecution?: boolean;
    providerTerm?: string;
  };

  return {
    id: capability.id,
    providerSupport: enhanced.providerSupport
      ? providerSupportForEvidence(enhanced.providerSupport)
      : providerSupportForEvidence(capability.evidence),
    labImplementation: enhanced.labImplementation ?? ("status" in capability ? capability.status : "Planned"),
    evidence: publicEvidenceLabel(capability.evidence),
    adapterBacked,
    liveEnabled: providerLiveEnabled && adapterBacked,
    ...(enhanced.providerTerm ? { providerTerm: enhanced.providerTerm } : {}),
  };
}

function latestDate(values: string[]): string | undefined {
  return [...values].sort().at(-1);
}

export function getPublicProviders(
  environment: EnvironmentLookup = process.env,
  policies: readonly ProviderOperationalPolicy[] = [],
): PublicProvider[] {
  const platformProviders = projectProviderPlatform({ environment, policies });
  return getPublicProvidersFromPlatform(platformProviders, environment);
}

/**
 * Transport-neutral projection seam. Production callers pass the canonical
 * code/database projection; deterministic contract tests may pass a synthetic
 * future-provider projection without adding it to the installed registry.
 */
export function getPublicProvidersFromPlatform(
  platformProviders: readonly ProviderPlatformProjection[],
  environment: EnvironmentLookup = process.env,
): PublicProvider[] {
  const configuration = getProviderConfigurationStates(environment);

  return platformProviders.map((platform) => {
    const manifest = getProviderManifest(platform.id);
    if (!manifest) return catalogOnlyPublicProvider(platform, environment);
    const documentation = providerDocumentation(manifest);
    const documentationDates = documentation.map((reference) => reference.verifiedAt);
    const sourceUrls = new Set(documentation.map((reference) => reference.url));
    if (manifest.evidence === "Repository verified") sourceUrls.add(REPOSITORY_URL);
    const evidence = publicEvidenceLabel(manifest.evidence);
    const documentationStatus = "documentationStatus" in manifest
      && typeof manifest.documentationStatus === "string"
      ? manifest.documentationStatus
      : documentation.length > 0
        ? "Dated provider documentation references are attached to this registry record."
        : "No dated provider documentation references are attached to this registry record.";

    return publicProviderSchema.parse({
      id: manifest.id,
      name: manifest.displayName,
      description: manifest.description,
      status: manifest.status,
      url: getCanonicalUrl(`/providers/${manifest.id}`, environment),
      states: {
        listed: true,
        configured: configuration[manifest.id].configured,
      adapterBacked: platform.integration.fixtureCapable,
        liveEnabled: platform.readiness.state === "live-enabled",
        docsVerified: documentation.some((reference) => (
          reference.status === "Documentation verified"
          || reference.status === "Official documentation verified"
        )),
        repositoryVerified: manifest.evidence === "Repository verified",
        experimental: ["Prototype", "Demo-only", "Partial"].includes(manifest.status),
      },
      capabilities: manifest.capabilities.map((capability) => {
        const normalizedCapabilityId = normalizedCapabilityForLegacy(capability.id);
        const adapterBacked = normalizedCapabilityId
          ? platform.capabilities.some((item) => (
            item.id === normalizedCapabilityId && item.integrationPath === "adapter"
          ))
          : false;
        return capabilityProjection(capability, platform.readiness.state === "live-enabled", adapterBacked);
      }),
      modules: manifest.modules,
      evidence,
      evidenceType: evidenceTypeForLabel(evidence),
      documentationStatus,
      limitations: manifest.limitations,
      ...(latestDate(documentationDates)
        ? { lastVerifiedAt: latestDate(documentationDates) }
        : manifest.evidence === "Repository verified"
          ? { lastVerifiedAt: "2026-08-14" }
          : {}),
      sourceUrls: [...sourceUrls],
      platform,
    });
  });
}

function normalizedCapabilityForLegacy(
  capability: ProviderCapability,
): ProviderPlatformProjection["capabilities"][number]["id"] | null {
  if (capability === "models") return "discovery.models";
  if (capability === "voices") return "discovery.voices";
  if (capability === "stt-prerecorded") return "stt.prerecorded";
  if (capability === "stt-streaming") return "stt.streaming";
  if (capability === "conversational-stt") return "realtime.conversation";
  if (capability === "tts") return "tts.batch";
  if (capability === "voice-agent") return "realtime.server-agent";
  return null;
}

export function getPublicProvider(
  providerId: string,
  environment: EnvironmentLookup = process.env,
  policies: readonly ProviderOperationalPolicy[] = [],
): PublicProvider | null {
  return getPublicProviders(environment, policies).find((provider) => provider.id === providerId) ?? null;
}

function catalogOnlyPublicProvider(
  platform: ProviderPlatformProjection,
  environment: EnvironmentLookup,
): PublicProvider {
  const documentationVerified = platform.metadata.verification !== "unverified";
  const integrated = platform.integration.installed;
  const adjacent = platform.kind === "voice-stack-infrastructure" || platform.kind === "evaluation-system";
  const evidence: PublicEvidenceLabel = documentationVerified
    ? "Provider documentation verified"
    : "No implementation evidence";
  const limitations = [
    integrated
      ? "This integration is represented through the canonical provider-platform contract without a legacy provider manifest."
      : "Catalog membership does not imply that an adapter, credential, runtime, or benchmark integration exists.",
    "No live provider call, health probe, or benchmark measurement is implied by this public record.",
    ...(adjacent
      ? ["This adjacent system is separated from speech-model providers and is not eligible for speech-provider ranking."]
      : []),
  ];

  return publicProviderSchema.parse({
    id: platform.id,
    name: platform.displayName,
    description: platform.description,
    status: integrated ? "Prototype" : "Planned",
    url: getCanonicalUrl(`/providers/${platform.id}`, environment),
    states: {
      listed: true,
      configured: platform.lifecycle.integration === "configured",
      adapterBacked: platform.integration.fixtureCapable,
      liveEnabled: platform.readiness.state === "live-enabled",
      docsVerified: documentationVerified,
      repositoryVerified: false,
      experimental: false,
    },
    capabilities: [],
    modules: [],
    evidence,
    evidenceType: evidenceTypeForLabel(evidence),
    documentationStatus: documentationVerified
      ? "Dated official metadata is attached; capabilities remain distinct from ONE-verified integration evidence."
      : "Catalog identity only; official capability metadata has not been verified by ONE Voice Lab.",
    limitations,
    ...(platform.metadata.lastVerifiedAt ? { lastVerifiedAt: platform.metadata.lastVerifiedAt } : {}),
    sourceUrls: platform.metadata.sources.map((item) => item.url),
    platform,
  });
}

function sortForStableSerialization(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForStableSerialization);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, sortForStableSerialization(nestedValue)]),
    );
  }
  return value;
}

function stableFixtureHash(value: unknown): string {
  const serialized = JSON.stringify(sortForStableSerialization(value));
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function getPublicEvals(environment: EnvironmentLookup = process.env): PublicEval[] {
  return EVALUATION_SCENARIOS.map((scenario) => publicEvalSchema.parse({
    id: scenario.id,
    name: scenario.name,
    description: scenario.description,
    url: getCanonicalUrl(`/evals/${scenario.id}`, environment),
    status: "implemented_with_deterministic_fixture",
    hypothesis: `A deterministic trace for ${scenario.name.toLowerCase()} should emit the expected evidence while preserving every human-review requirement.`,
    fixture: {
      id: scenario.fixture.id,
      version: "1.0.0",
      hash: stableFixtureHash({
        id: scenario.fixture.id,
        input: scenario.fixture.input,
        assertions: scenario.assertions,
      }),
      input: scenario.fixture.input,
      kind: "deterministic_local_simulation",
    },
    task: scenario.expectedBehavior,
    eligibleProviderIds: [],
    providerConfiguration: [],
    environment: {
      execution: "local_deterministic",
      providerCalls: false,
      billable: false,
    },
    measuredMetrics: [],
    qualitativeReviewCriteria: scenario.assertions,
    limitations: [
      "The fixture is synthetic and does not demonstrate production provider behavior.",
      "No provider model, network path, audio device, or customer environment is measured.",
      "Human review remains required wherever the criterion is marked subjective.",
    ],
    evidenceType: "simulated",
    evidenceLabel: "Implemented with deterministic fixtures",
    lastVerifiedAt: PUBLIC_REGISTRY_LAST_VERIFIED_AT,
    provenanceSourceUrls: [
      getCanonicalUrl(`/api/public/v1/evals/${scenario.id}`, environment),
      getCanonicalUrl("/methodology", environment),
    ],
  }));
}

export function getPublicEval(
  evalId: string,
  environment: EnvironmentLookup = process.env,
): PublicEval | null {
  return getPublicEvals(environment).find((evaluation) => evaluation.id === evalId) ?? null;
}

export function runPublicSyntheticEval(
  evalId: string,
  environment: EnvironmentLookup = process.env,
  now: () => Date = () => new Date(),
): PublicSyntheticEvalResult | null {
  const evaluation = getPublicEval(evalId, environment);
  if (!evaluation || evaluation.status !== "implemented_with_deterministic_fixture") return null;

  const result = runEvaluationScenario(evalId);
  return publicSyntheticEvalResultSchema.parse({
    id: result.id,
    evalId: result.scenarioId,
    fixtureHash: evaluation.fixture.hash,
    executedAt: now().toISOString(),
    passed: result.passed,
    assertionResults: result.results.map((assertion) => ({
      id: assertion.id,
      dimension: assertion.dimension,
      expected: assertion.expected,
      actual: assertion.actual,
      passed: assertion.passed,
      requiresHumanReview: assertion.requiresHumanReview,
    })),
    expectedBehavior: result.expectedBehavior,
    actualBehavior: result.actualBehavior,
    trace: {
      id: result.trace.id,
      eventCount: result.trace.events.length,
      createdAt: result.trace.createdAt,
      provenance: "simulated",
      rawAudioIncluded: false,
    },
    evidenceType: "simulated",
    humanReviewRequired: result.results.some((assertion) => assertion.requiresHumanReview),
    limitations: evaluation.limitations,
  });
}

export function getPublicMethodology(
  environment: EnvironmentLookup = process.env,
): PublicMethodology {
  return publicMethodologySchema.parse({
    id: "voice-lab-evaluation-methodology-v1",
    name: "ONE Voice Lab evaluation methodology",
    description: "A cautious, reproducible method for point-in-time voice AI observations and human review.",
    version: "1.1.0",
    url: getCanonicalUrl("/methodology", environment),
    principles: [
      { id: "bounded-evidence", title: "One fixture is bounded evidence", explanation: "One fixture cannot prove universal superiority, and no single result should be generalized beyond its stated input and environment." },
      { id: "equivalent-comparisons", title: "Align what can be compared", explanation: "Provider comparisons require the same input and disclosed acceptance criteria, while exact model, voice, transport, codec, region, and provider-native settings stay visible because they are not necessarily equivalent." },
      { id: "point-in-time", title: "Results are point-in-time observations", explanation: "Models, APIs, routing, infrastructure, and configuration change; results need dates and provenance." },
      { id: "latency-context", title: "Latency depends on the system", explanation: "Network, region, client, buffering, audio, orchestration, and provider behavior can all change observed latency." },
      { id: "measurement-points", title: "Keep measurement points separate", explanation: "Provider-reported timing, ONE server-observed timing, browser playback readiness, derived metrics, and human ratings use different provenance and must not be merged into one latency or quality claim." },
      { id: "no-composite-winner", title: "No universal winner score", explanation: "Measured evidence and human-rated dimensions remain separate. A result can support a use-case decision without claiming that one voice or provider is universally best." },
      { id: "outcome-quality", title: "Transcripts are not business outcomes", explanation: "Transcript quality and task or business outcome quality are related but not equivalent." },
      { id: "synthetic-boundary", title: "Synthetic is not production", explanation: "Synthetic results test deterministic logic; they do not prove production provider behavior." },
      { id: "representative-testing", title: "Production needs representative testing", explanation: "Production decisions require representative customer audio, conditions, policies, consent, and human review." },
    ],
    evidenceVocabulary: [
      { id: "repository_verified", label: "Repository verified", meaning: "Implementation evidence exists in this repository; this alone does not prove live provider behavior or production readiness." },
      { id: "provider_documentation_verified", label: "Provider documentation verified", meaning: "The claim is grounded in a dated official provider documentation reference, not a live lab measurement." },
      { id: "manual_verification_required", label: "Manual verification required", meaning: "A human must validate the current provider, account, environment, or subjective behavior." },
      { id: "no_implementation_evidence", label: "No implementation evidence", meaning: "The lab does not currently contain evidence that the capability is implemented." },
      { id: "simulated", label: "Simulated", meaning: "The result comes from a deterministic local fixture and makes no live-provider claim." },
      { id: "measured", label: "Measured", meaning: "A dated result was measured under a disclosed environment and configuration." },
      { id: "assumption", label: "Assumption", meaning: "A proposition to validate, not an established fact." },
      { id: "experimental", label: "Experimental", meaning: "A bounded exploration that is not a production-readiness claim." },
    ],
    safetyConstraints: [
      "Anonymous public API and MCP operations cannot invoke paid provider APIs.",
      "Permanent provider credentials remain server-only and are never serialized into public evidence.",
      "Live or billable testing retains an explicit human authorization boundary.",
      "Synthetic and subjective outcomes require human interpretation before production decisions.",
    ],
    lastVerifiedAt: PUBLIC_REGISTRY_LAST_VERIFIED_AT,
  });
}
