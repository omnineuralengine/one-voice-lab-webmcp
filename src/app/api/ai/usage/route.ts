import { checkAiRequestBoundary, readBoundedAiJson } from "@/lib/ai/boundary";
import { getAiUsageForSession } from "@/lib/ai/usage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export async function POST(request: Request) {
  const boundary = checkAiRequestBoundary(request);
  if (!boundary.allowed) return Response.json({ error: { code: boundary.code, message: boundary.message } }, { status: boundary.status, headers: HEADERS });
  const body = await readBoundedAiJson(request);
  if (!body.ok) return Response.json({ error: { code: "invalid_request", message: "Send a valid JSON request." } }, { status: 400, headers: HEADERS });
  return Response.json({
    schemaVersion: "applied-voice-ai-usage-v1",
    persistence: "ephemeral-instance-memory",
    privacy: "Only metadata for this random browser session is returned. Prompts and generated content are not stored here.",
    entries: getAiUsageForSession(boundary.sessionId),
  }, { headers: HEADERS });
}
