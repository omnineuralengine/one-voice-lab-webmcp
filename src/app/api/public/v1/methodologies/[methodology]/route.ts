import { getActionDefinition, type ActionInput } from "@/lib/actions/registry";
import { executePublicServerAction } from "@/lib/actions/server/executor";
import { checkPublicReadAccess, publicReadRateLimitResponse } from "@/lib/public-evidence/read-guard";
import { createPublicEnvelope, publicActionErrorResponse, publicJsonResponse, publicNotFound } from "@/lib/public-evidence/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ methodology: string }> }) {
  const { methodology: methodologyId } = await params;
  const decision = checkPublicReadAccess(request, "rest:methodologies:get");
  if (!decision.allowed) return publicReadRateLimitResponse(decision);
  const version = new URL(request.url).searchParams.get("version") ?? "1.0.0";
  const result = await executePublicServerAction(
    "benchmark.inspectMethodology",
    { methodologyId, version } as ActionInput<"benchmark.inspectMethodology">,
    { source: "rest", signal: request.signal },
  );
  if (!result.ok) {
    return result.error.code === "methodology_not_found"
      ? publicNotFound(`Methodology '${methodologyId}' version '${version}' was not found.`)
      : publicActionErrorResponse(result.error);
  }
  return publicJsonResponse(createPublicEnvelope({
    dataSchema: getActionDefinition("benchmark.inspectMethodology").outputSchema,
    data: result.data,
    path: `/api/public/v1/methodologies/${methodologyId}?version=${encodeURIComponent(version)}`,
    evidenceType: "repository_verified",
  }));
}
