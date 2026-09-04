import { executePublicServerAction } from "@/lib/actions/server/executor";
import { recordPublicUsage } from "@/lib/public-evidence/analytics";
import { publicMethodologySchema } from "@/lib/public-evidence/schemas";
import { createPublicEnvelope, publicJsonResponse } from "@/lib/public-evidence/service";

export const dynamic = "force-dynamic";

export async function GET() {
  await recordPublicUsage("methodology");
  const actionResult = await executePublicServerAction("methodology.get", {}, { source: "rest" });
  if (!actionResult.ok) throw new Error(actionResult.error.message);

  return publicJsonResponse(createPublicEnvelope({
    dataSchema: publicMethodologySchema,
    data: actionResult.data.methodology,
    path: "/api/public/v1/methodology",
    evidenceType: "repository_verified",
  }));
}
