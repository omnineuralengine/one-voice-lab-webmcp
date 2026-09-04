import { executePublicServerAction } from "@/lib/actions/server/executor";
import type { ActionInput } from "@/lib/actions/registry";
import { publicProviderSchema } from "@/lib/public-evidence/schemas";
import { createPublicEnvelope, publicActionErrorResponse, publicJsonResponse } from "@/lib/public-evidence/service";
import { z } from "zod";
import { recordPublicUsage } from "@/lib/public-evidence/analytics";
import { checkPublicReadAccess, publicReadRateLimitResponse } from "@/lib/public-evidence/read-guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const readDecision = checkPublicReadAccess(request, "rest:providers:list");
  if (!readDecision.allowed) return publicReadRateLimitResponse(readDecision);
  await recordPublicUsage("providers");
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const after = url.searchParams.get("after");
  const group = url.searchParams.get("group");
  const kind = url.searchParams.get("kind");
  const capability = url.searchParams.get("capability");
  const actionResult = await executePublicServerAction("providers.list", {
    ...(limit ? { limit: Number(limit) } : {}),
    ...(after ? { after } : {}),
    ...(group ? { group } : {}),
    ...(kind ? { kind } : {}),
    ...(capability ? { capabilityId: capability } : {}),
  } as ActionInput<"providers.list">, { source: "rest" });
  if (!actionResult.ok) return publicActionErrorResponse(actionResult.error);

  const response = publicJsonResponse(createPublicEnvelope({
    dataSchema: z.array(publicProviderSchema),
    data: actionResult.data.providers,
    path: "/api/public/v1/providers",
    evidenceType: "repository_verified",
  }));
  response.headers.set("X-Result-Count", String(actionResult.data.providers.length));
  response.headers.set("X-Total-Matched", String(actionResult.data.totalMatched));
  if (actionResult.data.nextCursor) response.headers.set("X-Next-Cursor", actionResult.data.nextCursor);
  return response;
}
