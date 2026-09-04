import { getActionDefinition, type ActionInput } from "@/lib/actions/registry";
import { executePublicServerAction } from "@/lib/actions/server/executor";
import { checkPublicReadAccess, publicReadRateLimitResponse } from "@/lib/public-evidence/read-guard";
import { createPublicEnvelope, publicActionErrorResponse, publicJsonResponse } from "@/lib/public-evidence/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const decision = checkPublicReadAccess(request, "rest:leaderboards:list");
  if (!decision.allowed) return publicReadRateLimitResponse(decision);
  const query = new URL(request.url).searchParams;
  const beforeAsOf = query.get("beforeAsOf");
  const beforeId = query.get("beforeId");
  const input = {
    ...(query.get("suiteId") ? { suiteId: query.get("suiteId")! } : {}),
    ...(query.get("limit") ? { limit: Number(query.get("limit")) } : {}),
    ...(beforeAsOf && beforeId ? { before: { asOfAt: beforeAsOf, snapshotId: beforeId } } : {}),
  } as ActionInput<"benchmark.listLeaderboardSnapshots">;
  if (Boolean(beforeAsOf) !== Boolean(beforeId)) {
    return publicActionErrorResponse({
      code: "invalid_action_input",
      category: "validation",
      message: "Both beforeAsOf and beforeId are required for keyset pagination.",
      retryable: false,
    });
  }
  const result = await executePublicServerAction("benchmark.listLeaderboardSnapshots", input, { source: "rest", signal: request.signal });
  if (!result.ok) return publicActionErrorResponse(result.error);
  return publicJsonResponse(createPublicEnvelope({
    dataSchema: getActionDefinition("benchmark.listLeaderboardSnapshots").outputSchema,
    data: result.data,
    path: `/api/public/v1/leaderboards${query.size ? `?${query.toString()}` : ""}`,
    evidenceType: "repository_verified",
  }));
}
