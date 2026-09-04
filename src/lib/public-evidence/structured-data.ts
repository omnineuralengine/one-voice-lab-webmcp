import { z } from "zod";

import { getCanonicalUrl } from "@/lib/public-evidence/canonical-url";
import type { PublicEval, PublicMethodology, PublicProvider } from "@/lib/public-evidence/schemas";

export const jsonLdSchema = z.object({
  "@context": z.literal("https://schema.org"),
  "@type": z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  name: z.string().min(1),
  description: z.string().min(1),
  url: z.string().url(),
}).passthrough();

const COMMUNITY_CREATOR = {
  "@type": "Organization",
  name: "Omni Neural Engine community project",
  description: "A community-built, independent learning lab; not an official product of any listed provider.",
};

type EnvironmentLookup = Readonly<Record<string, string | undefined>>;

function latestVerifiedDate(values: Array<string | undefined>): string {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? "2026-08-27";
}

export function getWebApplicationJsonLd(environment: EnvironmentLookup = process.env) {
  return jsonLdSchema.parse({
    "@context": "https://schema.org",
    "@type": ["WebApplication", "SoftwareApplication"],
    name: "ONE Voice Lab",
    description: "An independent, evidence-labeled voice AI provider catalog and evaluation lab with human gates before live or billable work.",
    url: getCanonicalUrl("/", environment),
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web",
    featureList: [
      "Discover installed, documentation-only, and unverified provider catalog records without treating catalog membership as integration",
      "Inspect provider capabilities, curated model and voice metadata, and local readiness separately from performance evidence",
      "Inspect the provider-documented Reson8 catalog record without implying that a ONE adapter or live execution exists",
      "Run deterministic voice AI simulations",
      "Inspect versioned benchmark methodologies, public-verified snapshot metadata, and hash-only integrity results",
    ],
    keywords: "voice AI provider catalog, Deepgram, Fish Audio, ElevenLabs, Cartesia, Reson8, speech to text, text to speech, benchmark methodology, evidence provenance",
    creator: COMMUNITY_CREATOR,
    dateModified: "2026-08-27",
  });
}

export function getWebSiteJsonLd(environment: EnvironmentLookup = process.env) {
  return jsonLdSchema.parse({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "ONE Voice Lab",
    alternateName: "ONE Voice AI Provider Lab",
    description: "An independent voice AI provider catalog and evaluation lab that separates documentation, integration, readiness, benchmark, and simulation evidence.",
    url: getCanonicalUrl("/", environment),
    publisher: COMMUNITY_CREATOR,
    dateModified: "2026-08-27",
  });
}

export function getProviderRegistryJsonLd(providers: PublicProvider[]) {
  return jsonLdSchema.parse({
    "@context": "https://schema.org",
    "@type": ["Dataset", "ItemList"],
    name: "ONE Voice Lab evidence-labeled provider catalog",
    description: "Provider and adjacent-system catalog records that distinguish verified metadata, provider-documented capabilities, installed adapters, runtime readiness, and benchmark eligibility without manufacturing a ranking.",
    url: getCanonicalUrl("/providers"),
    creator: COMMUNITY_CREATOR,
    dateModified: latestVerifiedDate(providers.map((provider) => provider.lastVerifiedAt)),
    variableMeasured: ["Metadata verification", "Capability provenance", "Integration state", "Runtime readiness", "Benchmark eligibility"],
    numberOfItems: providers.length,
    itemListElement: providers.map((provider, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: provider.name,
      url: provider.url,
    })),
    hasPart: providers.map((provider) => ({
      "@type": "Dataset",
      identifier: provider.id,
      name: provider.name,
      description: provider.description,
      url: provider.url,
      dateModified: provider.lastVerifiedAt,
      measurementTechnique: "Catalog and integration-state projection; not a provider-performance measurement.",
    })),
  });
}

export function getProviderJsonLd(provider: PublicProvider) {
  return jsonLdSchema.parse({
    "@context": "https://schema.org",
    "@type": "TechArticle",
    name: `${provider.name} lab evidence profile`,
    headline: `${provider.name} lab evidence profile`,
    description: provider.description,
    url: provider.url,
    identifier: provider.id,
    author: COMMUNITY_CREATOR,
    publisher: COMMUNITY_CREATOR,
    dateModified: provider.lastVerifiedAt,
    about: {
      "@type": "Thing",
      name: provider.name,
      description: `Provider registry status: ${provider.status}. Evidence: ${provider.evidence}.`,
    },
  });
}

export function getEvalRegistryJsonLd(evaluations: PublicEval[]) {
  return jsonLdSchema.parse({
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "ONE Voice Lab evaluation registry",
    description: "Deterministic local evaluation fixtures with stable IDs, reproduction metadata, limitations, and human-review criteria.",
    url: getCanonicalUrl("/evals"),
    creator: COMMUNITY_CREATOR,
    dateModified: latestVerifiedDate(evaluations.map((evaluation) => evaluation.lastVerifiedAt)),
    variableMeasured: ["Deterministic assertion outcomes", "Human-review requirements"],
    hasPart: evaluations.map((evaluation) => ({
      "@type": "Dataset",
      identifier: evaluation.id,
      name: evaluation.name,
      description: evaluation.description,
      url: evaluation.url,
      dateModified: evaluation.lastVerifiedAt,
    })),
  });
}

export function getEvalJsonLd(evaluation: PublicEval) {
  return jsonLdSchema.parse({
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: evaluation.name,
    description: evaluation.description,
    url: evaluation.url,
    identifier: evaluation.id,
    creator: COMMUNITY_CREATOR,
    dateModified: evaluation.lastVerifiedAt,
    version: evaluation.fixture.version,
    variableMeasured: evaluation.qualitativeReviewCriteria.map((criterion) => criterion.dimension),
    measurementTechnique: "Deterministic local simulation with assertion outcomes and marked human-review criteria.",
  });
}

export function getMethodologyJsonLd(methodology: PublicMethodology) {
  return jsonLdSchema.parse({
    "@context": "https://schema.org",
    "@type": "TechArticle",
    name: methodology.name,
    headline: methodology.name,
    description: methodology.description,
    url: methodology.url,
    identifier: methodology.id,
    author: COMMUNITY_CREATOR,
    publisher: COMMUNITY_CREATOR,
    dateModified: methodology.lastVerifiedAt,
    version: methodology.version,
  });
}
