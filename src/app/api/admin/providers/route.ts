import { z } from "zod";

import { BoundedJsonError, readBoundedJson } from "@/lib/http/bounded-json";
import { isSameSiteRequest } from "@/lib/http/same-site-request";
import {
  providerCapabilityPolicyUpdateSchema,
  providerRuntimePolicyUpdateSchema,
  readProviderPlatformAdmin,
  updateProviderCapabilityPolicy,
  updateProviderRuntimePolicy,
  type ProviderPolicyReadResult,
} from "@/lib/providers/policy-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_ADMIN_BODY_BYTES = 8 * 1_024;
const providerAdminUpdateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("runtime"), update: providerRuntimePolicyUpdateSchema }).strict(),
  z.object({ kind: z.literal("capability"), update: providerCapabilityPolicyUpdateSchema }).strict(),
]);

export async function GET(request: Request) {
  if (!isSameSiteRequest(request, { requireBrowserSignal: true })) {
    return errorResponse(403, "cross_origin", "Provider administration accepts same-site browser requests only.");
  }
  return policyResponse(await readProviderPlatformAdmin());
}

export async function PATCH(request: Request) {
  if (!isSameSiteRequest(request, { requireBrowserSignal: true })) {
    return errorResponse(403, "cross_origin", "Provider administration accepts same-site browser requests only.");
  }
  try {
    const parsed = providerAdminUpdateSchema.safeParse(await readBoundedJson(request, MAX_ADMIN_BODY_BYTES));
    if (!parsed.success) {
      return errorResponse(400, "invalid_provider_policy", "Use the versioned, confirmed provider policy schema.");
    }
    const result = parsed.data.kind === "runtime"
      ? await updateProviderRuntimePolicy(parsed.data.update)
      : await updateProviderCapabilityPolicy(parsed.data.update);
    return policyResponse(result);
  } catch (error) {
    if (error instanceof BoundedJsonError) return errorResponse(error.status, error.code, error.message);
    return errorResponse(503, "provider_policy_unavailable", "Provider policy is temporarily unavailable.");
  }
}

function policyResponse(result: ProviderPolicyReadResult<unknown>) {
  if (result.ok) return noStoreJson({ ok: true, data: result.value });
  if (result.code === "forbidden") return errorResponse(403, "administrator_required", "Active administrator access is required.");
  if (result.code === "conflict") return errorResponse(409, "provider_policy_conflict", "Provider policy changed; refresh before retrying.");
  if (result.code === "invalid") return errorResponse(400, "invalid_provider_policy", "The requested provider policy transition is invalid.");
  return errorResponse(503, "provider_policy_unavailable", "Provider policy is temporarily unavailable.");
}

function errorResponse(status: number, code: string, message: string) {
  return noStoreJson({ ok: false, error: { code, message } }, status);
}

function noStoreJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
