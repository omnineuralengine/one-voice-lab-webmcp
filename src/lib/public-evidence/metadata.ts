import type { Metadata } from "next";

import { getCanonicalUrl } from "@/lib/public-evidence/canonical-url";

export function createPublicMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const url = getCanonicalUrl(path);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      title,
      description,
      url,
      siteName: "Open Voice AI Playground",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}
