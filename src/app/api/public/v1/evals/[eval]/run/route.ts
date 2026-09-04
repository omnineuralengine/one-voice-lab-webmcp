import { executePublicServerAction } from "@/lib/actions/server/executor";
import { recordPublicUsage } from "@/lib/public-evidence/analytics";
import { publicSyntheticEvalResultSchema } from "@/lib/public-evidence/schemas";
import { createPublicEnvelope, publicNoStoreJsonResponse, publicNotFound } from "@/lib/public-evidence/service";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ eval: string }> },
) {
  const { eval: evalId } = await params;
  await recordPublicUsage("synthetic_eval");
  const actionResult = await executePublicServerAction(
    "publicEvaluation.runSynthetic",
    { evalId },
    { source: "rest", signal: _request.signal },
  );
  if (!actionResult.ok) {
    if (actionResult.error.category === "validation" || actionResult.error.code === "synthetic_evaluation_not_found") {
      return publicNotFound(`Runnable synthetic evaluation '${evalId}' was not found.`);
    }
    throw new Error(actionResult.error.message);
  }
  const { result } = actionResult.data;

  return publicNoStoreJsonResponse(createPublicEnvelope({
    dataSchema: publicSyntheticEvalResultSchema,
    data: result,
    path: `/api/public/v1/evals/${evalId}/run`,
    evidenceType: "simulated",
  }));
}
