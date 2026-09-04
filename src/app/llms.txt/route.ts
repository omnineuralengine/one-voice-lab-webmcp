import { renderLlmsTxt } from "@/lib/public-evidence/agent-docs";

export const dynamic = "force-dynamic";

export function GET() {
  return new Response(renderLlmsTxt(), {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
