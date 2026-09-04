import { getActionDefinition, type ActionInput } from "@/lib/actions/registry";
import { executePublicServerAction } from "@/lib/actions/server/executor";
import { checkPublicReadAccess, publicReadRateLimitResponse } from "@/lib/public-evidence/read-guard";
import { createPublicEnvelope, publicActionErrorResponse, publicJsonResponse, publicNotFound } from "@/lib/public-evidence/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: providerId } = await params;
  const decision = checkPublicReadAccess(request, "rest:providers:voices");
  if (!decision.allowed) return publicReadRateLimitResponse(decision);
  const result = await executePublicServerAction(
    "providers.listVoices",
    { providerId } as ActionInput<"providers.listVoices">,
    { source: "rest", signal: request.signal },
  );
  if (!result.ok) {
    return result.error.code === "provider_not_found" || result.error.category === "validation"
      ? publicNotFound(`Provider '${providerId}' is not in the public catalog.`)
      : publicActionErrorResponse(result.error);
  }
  return publicJsonResponse(createPublicEnvelope({
    dataSchema: getActionDefinition("providers.listVoices").outputSchema,
    data: result.data,
    path: `/api/public/v1/providers/${providerId}/voices`,
    evidenceType: "repository_verified",
  }));
}
