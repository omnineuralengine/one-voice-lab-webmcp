import { z } from "zod";

import { executePublicServerAction } from "@/lib/actions/server/executor";
import { recordPublicUsage } from "@/lib/public-evidence/analytics";
import { publicEvalSchema } from "@/lib/public-evidence/schemas";
import { createPublicEnvelope, publicJsonResponse } from "@/lib/public-evidence/service";

export const dynamic = "force-dynamic";

export async function GET() {
  await recordPublicUsage("evals");
  const actionResult = await executePublicServerAction("evaluations.list", {}, { source: "rest" });
  if (!actionResult.ok) throw new Error(actionResult.error.message);

  return publicJsonResponse(createPublicEnvelope({
    dataSchema: z.array(publicEvalSchema),
    data: actionResult.data.evaluations,
    path: "/api/public/v1/evals",
    evidenceType: "simulated",
  }));
}
