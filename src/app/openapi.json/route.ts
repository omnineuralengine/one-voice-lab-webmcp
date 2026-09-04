import { getOpenApiDocument } from "@/lib/public-evidence/openapi";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(getOpenApiDocument(), {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
