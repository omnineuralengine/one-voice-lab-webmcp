import type { MetadataRoute } from "next";

import { getCanonicalUrl } from "@/lib/public-evidence/canonical-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "OAI-SearchBot", allow: ["/", "/api/public/", "/openapi.json"], disallow: ["/api/", "/bench", "/settings", "/architecture-studio/session/"] },
      { userAgent: "ChatGPT-User", allow: ["/", "/api/public/", "/openapi.json"], disallow: ["/api/", "/bench", "/settings", "/architecture-studio/session/"] },
      { userAgent: "GPTBot", disallow: "/" },
      { userAgent: "*", allow: ["/", "/api/public/", "/openapi.json"], disallow: ["/api/", "/bench", "/settings", "/architecture-studio/session/"] },
    ],
    sitemap: getCanonicalUrl("/sitemap.xml"),
  };
}
