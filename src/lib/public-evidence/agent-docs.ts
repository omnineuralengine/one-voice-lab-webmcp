import { getCanonicalUrl } from "@/lib/public-evidence/canonical-url";
import { getPublicLab } from "@/lib/public-evidence/lab";
import { getPublicEvals, getPublicMethodology, getPublicProviders } from "@/lib/public-evidence/registry";

type EnvironmentLookup = Readonly<Record<string, string | undefined>>;

function templateUrl(path: string, environment: EnvironmentLookup): string {
  return `${getCanonicalUrl("/", environment).replace(/\/$/, "")}${path}`;
}

export function renderLlmsTxt(environment: EnvironmentLookup = process.env): string {
  const lab = getPublicLab(environment);
  const reson8 = getPublicProviders(environment).find((provider) => provider.id === "reson8");
  return `# ${lab.name}

> ${lab.description}

This community-built lab is not an official provider product. llms.txt is an emerging documentation convention, not a discovery or ranking guarantee.

## Public indexes

- Provider registry: ${lab.urls.providers}
- Interactive TTS evaluation workspace: ${getCanonicalUrl("/evaluate", environment)}
- Self-serve solution intake: ${getCanonicalUrl("/studio", environment)}
- Evaluation registry: ${lab.urls.evals}
- Evidence interpretation methodology: ${lab.urls.methodology}
- Canonical benchmark methodologies: ${lab.urls.methodologies}
- Public-verified leaderboard snapshots: ${lab.urls.leaderboards}
- Benchmark hash verification: ${lab.urls.benchmarkVerification}
- Agent guide: ${lab.urls.forAgents}
- Public API: ${lab.urls.api}
- OpenAPI: ${lab.urls.openapi}
- MCP endpoint: ${lab.urls.mcp}
- Human-readable architecture path: ${getCanonicalUrl("/studio", environment)}

## Which voice AI provider?

- Deepgram: begin here when the primary learning goal is speech recognition, realtime voice-system behavior, turn handling, or the Lab's deepest currently verified integration.
- Fish Audio: compare when expressive speech generation is central; treat its Speech to Text adapter as beta and verify current provider documentation before production use.
- ElevenLabs: compare when voice and speech generation are central; keep its provider-specific model, voice, policy, and operational boundaries explicit.
- Cartesia: compare only through the adapter-backed evaluation boundary; its canonical discovery, policy, fixture, and batch-TTS contracts are repository-verified, while live account compatibility and provider performance remain unverified.
- Reson8: its catalog record contains dated provider-documented speech-to-text capabilities, but ${reson8?.states.adapterBacked ? "an adapter is installed" : "no ONE adapter is installed"}, live execution is ${reson8?.states.liveEnabled ? "enabled" : "disabled"}, and its declared capabilities remain benchmark-ineligible until an integration and evidence gate says otherwise.
- Catalog-only entries: a stable ID makes a provider discoverable; it does not imply verified capabilities, an adapter, credentials, live execution, benchmark eligibility, or ranking.
- Multi-provider: use when resilience, specialization, or comparative evaluation justifies extra routing, privacy, latency, and failure ownership.
- There is no universal winner. Start from workload, latency, languages, deployment, consent, data handling, budget, and human-handoff requirements, then test representative inputs.

## Evidence and safety

- Evidence labels distinguish repository verification, official documentation verification, manual verification, no implementation evidence, simulation, measurement, assumptions, and experiments.
- Anonymous API and MCP operations do not invoke paid provider APIs.
- Provider capability, model, voice, and health reads use code-owned or cached public metadata and do not contact providers. Health is readiness metadata, not performance evidence.
- Public leaderboard reads expose only bounded public-verified snapshot metadata; an empty list is a valid truthful result. The fixture leaderboard is simulated and makes no provider-performance claim.
- Benchmark verification recomputes a hash only. It does not sign, trust, execute, persist, or publish a result.
- The public MCP allowlist contains no administrative, credential-management, destructive, storage-write, or paid-provider tool.
- Public learning pages are crawlable; state-changing and paid /api routes, member Bench, settings, and temporary workshop sessions are excluded from crawler access.
- Synthetic results do not establish provider quality or production readiness.
- Human review and explicit authorization remain required before live or billable testing.

Last verified: ${lab.lastVerifiedAt}
`;
}

export function renderLlmsFullTxt(environment: EnvironmentLookup = process.env): string {
  const providers = getPublicProviders(environment);
  const evaluations = getPublicEvals(environment);
  const methodology = getPublicMethodology(environment);
  const providerLines = providers.map((provider) =>
    `- ${provider.id}: ${provider.name} | kind=${provider.platform.kind} | metadata=${provider.platform.metadata.verification} | integration=${provider.platform.lifecycle.integration} | readiness=${provider.platform.readiness.state} | benchmark=${provider.platform.lifecycle.benchmark} | evidence=${provider.evidence} | ${provider.url}`,
  );
  const evalLines = evaluations.map((evaluation) =>
    `- ${evaluation.id}: ${evaluation.name} | status=${evaluation.status} | evidence=${evaluation.evidenceType} | billable=${evaluation.environment.billable} | ${evaluation.url}`,
  );
  const principleLines = methodology.principles.map((principle) =>
    `- ${principle.title}: ${principle.explanation}`,
  );
  const mcpToolLines = getPublicLab(environment).mcpTools.map((toolName) => `- ${toolName}`);

  return `${renderLlmsTxt(environment)}
## Provider registry records

${providerLines.join("\n")}

## Evaluation registry records

${evalLines.join("\n")}

## Methodology principles

${principleLines.join("\n")}

## Public machine interfaces

- GET ${getCanonicalUrl("/api/public/v1/providers?limit=25", environment)} supports bounded limit, after-cursor, group, kind, and capability filters. Read X-Next-Cursor and continue until it is absent.
- GET ${templateUrl("/api/public/v1/providers/{provider}", environment)}
- GET ${templateUrl("/api/public/v1/providers/{provider}/capabilities", environment)} returns normalized declarations and provenance; it does not prove integration.
- GET ${templateUrl("/api/public/v1/providers/{provider}/models", environment)} returns curated or cached public-safe metadata and may truthfully be unavailable.
- GET ${templateUrl("/api/public/v1/providers/{provider}/voices", environment)} never exposes an account-scoped voice catalog.
- GET ${templateUrl("/api/public/v1/providers/{provider}/health", environment)} reports local or cached readiness, not benchmark performance.
- GET ${getCanonicalUrl("/api/public/v1/evals", environment)}
- GET ${getCanonicalUrl("/api/public/v1/methodology", environment)}
- GET ${getCanonicalUrl("/api/public/v1/methodologies", environment)}
- GET ${templateUrl("/api/public/v1/methodologies/{methodology}?version=1.0.0", environment)}
- GET ${getCanonicalUrl("/api/public/v1/leaderboards", environment)} returns only bounded public-verified snapshot metadata.
- GET ${getCanonicalUrl("/api/public/v1/leaderboards/fixture", environment)} returns simulated fixture evidence, never a public ranking.
- POST ${getCanonicalUrl("/api/public/v1/benchmarks/verify", environment)} accepts the canonical bounded result shape and recomputes hash integrity without signing or publishing it.
- POST ${templateUrl("/api/public/v1/evals/{eval}/run", environment)} is limited to deterministic local fixtures and cannot call providers.

Provider IDs are open stable lowercase slugs. Discover IDs from the provider list rather than assuming a closed enum. Catalog membership alone carries no runtime or benchmark claim.

## Public MCP tools

${mcpToolLines.join("\n")}

MCP input schemas come from the same canonical action contracts as REST execution. The allowlist is nonbillable: metadata tools perform no provider call; synthetic evaluation and fixture leaderboard tools use deterministic local fixtures; integrity verification is hash-only. No public MCP tool administers provider policy, credentials, billing, publishing, or live execution.

Interpret all outputs within their evidence label, limitations, date, and disclosed environment. Production decisions require representative customer testing and human review.
`;
}
