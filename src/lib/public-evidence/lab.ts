import { z } from "zod";

import { getCanonicalUrl } from "@/lib/public-evidence/canonical-url";
import { getPublicEvals, getPublicMethodology, getPublicProviders } from "@/lib/public-evidence/registry";
import { PUBLIC_MCP_TOOL_NAMES } from "@/lib/public-evidence/tools";

const PUBLIC_LAB_LAST_VERIFIED_AT = "2026-08-27";

export const publicLabSchema = z.object({
  id: z.literal("open-voice-ai-lab"),
  name: z.literal("ONE Voice Lab"),
  description: z.string().min(1),
  communityBuilt: z.literal(true),
  officialProviderProduct: z.literal(false),
  providerIds: z.array(z.string().min(1)),
  evalIds: z.array(z.string().min(1)),
  mcpTools: z.array(z.enum(PUBLIC_MCP_TOOL_NAMES)).length(PUBLIC_MCP_TOOL_NAMES.length),
  urls: z.object({
    home: z.string().url(),
    providers: z.string().url(),
    evals: z.string().url(),
    methodology: z.string().url(),
    methodologies: z.string().url(),
    leaderboards: z.string().url(),
    benchmarkVerification: z.string().url(),
    forAgents: z.string().url(),
    api: z.string().url(),
    openapi: z.string().url(),
    mcp: z.string().url(),
    llms: z.string().url(),
  }).strict(),
  executionSafety: z.object({
    anonymousProviderSpend: z.literal(false),
    syntheticEvalAvailable: z.literal(true),
    humanGateRequiredForLiveActions: z.literal(true),
    publicProviderMetadataInvokesUpstream: z.literal(false),
    publicHealthIsPerformanceProbe: z.literal(false),
    benchmarkVerificationSignsOrPublishes: z.literal(false),
  }).strict(),
  lastVerifiedAt: z.string().date(),
}).strict();

export function getPublicLab(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  const providers = getPublicProviders(environment);
  const evaluations = getPublicEvals(environment);
  getPublicMethodology(environment);

  return publicLabSchema.parse({
    id: "open-voice-ai-lab",
    name: "ONE Voice Lab",
    description: "An Omni Neural Engine community-built, provider-flexible learning and evaluation lab with explicit evidence labels and human gates before live or billable work.",
    communityBuilt: true,
    officialProviderProduct: false,
    providerIds: providers.map((provider) => provider.id),
    evalIds: evaluations.map((evaluation) => evaluation.id),
    mcpTools: [...PUBLIC_MCP_TOOL_NAMES],
    urls: {
      home: getCanonicalUrl("/", environment),
      providers: getCanonicalUrl("/providers", environment),
      evals: getCanonicalUrl("/evals", environment),
      methodology: getCanonicalUrl("/methodology", environment),
      methodologies: getCanonicalUrl("/api/public/v1/methodologies", environment),
      leaderboards: getCanonicalUrl("/api/public/v1/leaderboards", environment),
      benchmarkVerification: getCanonicalUrl("/api/public/v1/benchmarks/verify", environment),
      forAgents: getCanonicalUrl("/for-agents", environment),
      api: getCanonicalUrl("/api/public/v1/lab", environment),
      openapi: getCanonicalUrl("/openapi.json", environment),
      mcp: getCanonicalUrl("/mcp", environment),
      llms: getCanonicalUrl("/llms.txt", environment),
    },
    executionSafety: {
      anonymousProviderSpend: false,
      syntheticEvalAvailable: true,
      humanGateRequiredForLiveActions: true,
      publicProviderMetadataInvokesUpstream: false,
      publicHealthIsPerformanceProbe: false,
      benchmarkVerificationSignsOrPublishes: false,
    },
    lastVerifiedAt: PUBLIC_LAB_LAST_VERIFIED_AT,
  });
}
