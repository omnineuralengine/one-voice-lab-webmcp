import { getActionDefinition, type ActionInput } from "@/lib/actions/registry";
import { executePublicServerAction } from "@/lib/actions/server/executor";
import { readBoundedRequestText, RequestBodyTooLargeError } from "@/lib/http/bounded-body";
import { checkPublicReadAccess, publicReadRateLimitResponse } from "@/lib/public-evidence/read-guard";
import { createPublicEnvelope, publicActionErrorResponse, publicNoStoreJsonResponse } from "@/lib/public-evidence/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_VERIFY_BODY_BYTES = 2_100_000;

export async function POST(request: Request) {
  const decision = checkPublicReadAccess(request, "rest:benchmarks:verify");
  if (!decision.allowed) return publicReadRateLimitResponse(decision);
  let input: unknown;
  try {
    input = JSON.parse(await readBoundedRequestText(request, MAX_VERIFY_BODY_BYTES)) as unknown;
  } catch (error) {
    return publicActionErrorResponse({
      code: error instanceof RequestBodyTooLargeError ? "input_too_large" : "invalid_json",
      category: "validation",
      message: error instanceof RequestBodyTooLargeError
        ? "The benchmark verification request exceeds the bounded input size."
        : "The benchmark verification request must be valid JSON.",
      retryable: false,
    }, error instanceof RequestBodyTooLargeError ? 413 : 400);
  }
  const result = await executePublicServerAction(
    "benchmark.verifyResultIntegrity",
    input as ActionInput<"benchmark.verifyResultIntegrity">,
    { source: "rest", signal: request.signal },
  );
  if (!result.ok) return publicActionErrorResponse(result.error);
  return publicNoStoreJsonResponse(createPublicEnvelope({
    dataSchema: getActionDefinition("benchmark.verifyResultIntegrity").outputSchema,
    data: result.data,
    path: "/api/public/v1/benchmarks/verify",
    evidenceType: "repository_verified",
  }));
}
