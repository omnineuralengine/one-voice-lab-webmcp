import type { MetadataRoute } from "next";

import { getCanonicalUrl } from "@/lib/public-evidence/canonical-url";
import { getPublicEvals, getPublicProviders } from "@/lib/public-evidence/registry";

const STATIC_PATHS = [
  "/",
  "/providers",
  "/evals",
  "/evaluate",
  "/methodology",
  "/for-agents",
  "/simulation-lab",
  "/studio",
  "/build",
  "/learn",
  "/membership",
  "/providers/deepgram/early-access",
  "/providers/elevenlabs/api-studio",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-08-25T00:00:00.000Z");
  const staticEntries = STATIC_PATHS.map((path) => ({
    url: getCanonicalUrl(path),
    lastModified,
    changeFrequency: path === "/" ? "weekly" as const : "monthly" as const,
    priority: path === "/" ? 1 : path === "/providers" || path === "/evals" ? 0.9 : 0.7,
  }));
  const providerEntries = getPublicProviders().map((provider) => ({
    url: provider.url,
    lastModified: provider.lastVerifiedAt ? new Date(`${provider.lastVerifiedAt}T00:00:00.000Z`) : lastModified,
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));
  const evalEntries = getPublicEvals().map((evaluation) => ({
    url: evaluation.url,
    lastModified: new Date(`${evaluation.lastVerifiedAt}T00:00:00.000Z`),
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  return [...staticEntries, ...providerEntries, ...evalEntries];
}
