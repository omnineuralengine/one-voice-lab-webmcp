import { getActionDefinition } from "@/lib/actions/registry";
import { executePublicServerAction } from "@/lib/actions/server/executor";
import { checkPublicReadAccess, publicReadRateLimitResponse } from "@/lib/public-evidence/read-guard";
import { createPublicEnvelope, publicActionErrorResponse, publicJsonResponse } from "@/lib/public-evidence/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const decision = checkPublicReadAccess(request, "rest:leaderboards:fixture");
  if (!decision.allowed) return publicReadRateLimitResponse(decision);
  const result = await executePublicServerAction("benchmark.fixtureLeaderboard", {}, { source: "rest", signal: request.signal });
  if (!result.ok) return publicActionErrorResponse(result.error);
  return publicJsonResponse(createPublicEnvelope({
    dataSchema: getActionDefinition("benchmark.fixtureLeaderboard").outputSchema,
    data: result.data,
    path: "/api/public/v1/leaderboards/fixture",
    evidenceType: "simulated",
  }));
}
