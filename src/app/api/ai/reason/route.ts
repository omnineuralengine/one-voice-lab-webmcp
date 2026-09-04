import { ZodError } from "zod";

import { checkLabAccess, labAccessResponse, runWithLabConcurrency } from "@/lib/access/lab-access";
import { checkAiRequestBoundary, readBoundedAiJson } from "@/lib/ai/boundary";
import { generateGatewayReasoning } from "@/lib/ai/gateway";
import { isLabAiEnabled } from "@/lib/ai/models";
import { aiReasoningRequestSchema, aiReasoningResponseSchema } from "@/lib/ai/schemas";
import { disabledAiResponse, runAppliedVoiceReasoning } from "@/lib/ai/service";
import { consumeAiQuota } from "@/lib/ai/usage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
};

export async function POST(request: Request) {
  const boundary = checkAiRequestBoundary(request);
  if (!boundary.allowed) return error(boundary.status, boundary.code, boundary.message);

  const body = await readBoundedAiJson(request);
  const parsed = body.ok ? aiReasoningRequestSchema.safeParse(body.value) : null;
  if (!parsed?.success) {
    return error(400, "invalid_request", "The request does not match the Applied Voice Reasoning contract.");
  }

  if (!isLabAiEnabled()) {
    return Response.json(aiReasoningResponseSchema.parse(disabledAiResponse()), { status: 503, headers: HEADERS });
  }

  const access = await checkLabAccess(request, "ai_reasoning", {
    providerId: "vercel-ai-gateway",
    endpointId: "ai:reason",
    units: Math.min(10_000, parsed.data.prompt.length + JSON.stringify(parsed.data.context).length),
    minimumTier: "verified",
    actorIntent: "human",
  });
  if (!access.allowed) return labAccessResponse(access);

  const quota = consumeAiQuota(boundary.sessionId);
  if (!quota.allowed) {
    const response = aiReasoningResponseSchema.parse({
      status: "rate-limited",
      message: "The AI layer is taking a short rest. The deterministic Lab remains available.",
      result: null,
      usage: null,
      requiresHumanAcceptance: true,
      deterministicStateChanged: false,
    });
    return Response.json(response, { status: 429, headers: { ...HEADERS, "Retry-After": String(quota.retryAfterSeconds) } });
  }

  try {
    const run = await runWithLabConcurrency(request, "ai_reasoning", {
      providerId: "vercel-ai-gateway",
      endpointId: "ai:reason",
      minimumTier: "verified",
      actorIntent: "human",
    }, () => runAppliedVoiceReasoning({
      value: parsed.data,
      sessionId: boundary.sessionId,
      generate: generateGatewayReasoning,
      enabled: true,
    }));
    if (!run.ok) return labAccessResponse(run.decision);
    const response = run.value;
    const status = response.status === "completed" ? 200 : response.status === "disabled" ? 503 : 502;
    return Response.json(aiReasoningResponseSchema.parse(response), { status, headers: HEADERS });
  } catch (caught) {
    if (caught instanceof ZodError) return error(400, "invalid_request", "The request does not match the Applied Voice Reasoning contract.");
    return error(500, "reasoning_failure", "AI reasoning is temporarily unavailable. The deterministic Lab remains available.");
  }
}

function error(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status, headers: HEADERS });
}
