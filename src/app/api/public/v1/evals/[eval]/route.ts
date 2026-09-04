import { executePublicServerAction } from "@/lib/actions/server/executor";
import { recordPublicUsage } from "@/lib/public-evidence/analytics";
import { publicEvalSchema } from "@/lib/public-evidence/schemas";
import { createPublicEnvelope, publicJsonResponse, publicNotFound } from "@/lib/public-evidence/service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eval: string }> },
) {
  const { eval: evalId } = await params;
  await recordPublicUsage("eval");
  const actionResult = await executePublicServerAction(
    "evaluations.get",
    { evalId },
    { source: "rest", signal: _request.signal },
  );
  if (!actionResult.ok) {
    if (actionResult.error.category === "validation" || actionResult.error.code === "evaluation_not_found") {
      return publicNotFound(`Evaluation '${evalId}' is not in the public registry.`);
    }
    throw new Error(actionResult.error.message);
  }
  const { evaluation } = actionResult.data;

  return publicJsonResponse(createPublicEnvelope({
    dataSchema: publicEvalSchema,
    data: evaluation,
    path: `/api/public/v1/evals/${evaluation.id}`,
    evidenceType: evaluation.evidenceType,
    lastVerifiedAt: evaluation.lastVerifiedAt,
  }));
}
