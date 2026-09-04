import type { ActionInput } from "@/lib/actions/registry";
import { executePublicServerAction } from "@/lib/actions/server/executor";
import { recordPublicUsage } from "@/lib/public-evidence/analytics";
import { publicProviderSchema } from "@/lib/public-evidence/schemas";
import { createPublicEnvelope, publicJsonResponse, publicNotFound } from "@/lib/public-evidence/service";
import { checkPublicReadAccess, publicReadRateLimitResponse } from "@/lib/public-evidence/read-guard";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: providerId } = await params;
  const readDecision = checkPublicReadAccess(request, "rest:providers:get");
  if (!readDecision.allowed) return publicReadRateLimitResponse(readDecision);
  await recordPublicUsage("provider");
  const actionResult = await executePublicServerAction(
    "providers.get",
    { providerId } as ActionInput<"providers.get">,
    { source: "rest", signal: request.signal },
  );
  if (!actionResult.ok) {
    if (actionResult.error.category === "validation" || actionResult.error.code === "provider_not_found") {
      return publicNotFound(`Provider '${providerId}' is not in the public registry.`);
    }
    throw new Error(actionResult.error.message);
  }
  const { provider } = actionResult.data;

  return publicJsonResponse(createPublicEnvelope({
    dataSchema: publicProviderSchema,
    data: provider,
    path: `/api/public/v1/providers/${provider.id}`,
    evidenceType: provider.evidenceType,
    lastVerifiedAt: provider.lastVerifiedAt,
  }));
}
