import { getPublicLab, publicLabSchema } from "@/lib/public-evidence/lab";
import { recordPublicUsage } from "@/lib/public-evidence/analytics";
import { createPublicEnvelope, publicJsonResponse } from "@/lib/public-evidence/service";

export const dynamic = "force-dynamic";

export async function GET() {
  await recordPublicUsage("lab");
  return publicJsonResponse(createPublicEnvelope({
    dataSchema: publicLabSchema,
    data: getPublicLab(),
    path: "/api/public/v1/lab",
    evidenceType: "repository_verified",
  }));
}
