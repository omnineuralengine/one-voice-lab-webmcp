import { aiSessionIdSchema } from "@/lib/ai/schemas";
import { AI_LIMITS } from "@/lib/ai/reasoning-policy";
import { isSameOriginRequest } from "@/lib/temporary-token-boundary";

export type AiRequestBoundary =
  | { allowed: true; sessionId: string }
  | { allowed: false; status: 400 | 403 | 413; code: string; message: string };

export function checkAiRequestBoundary(request: Request): AiRequestBoundary {
  if (!isSameOriginRequest(request)) {
    return { allowed: false, status: 403, code: "cross_origin", message: "AI reasoning is available only through this Lab origin." };
  }
  const parsed = aiSessionIdSchema.safeParse(request.headers.get("x-lab-ai-session"));
  if (!parsed.success) {
    return { allowed: false, status: 400, code: "invalid_session", message: "Start a fresh anonymous Lab AI session and retry." };
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > AI_LIMITS.requestBytes) {
    return { allowed: false, status: 413, code: "request_too_large", message: "Use a shorter, sanitized problem statement." };
  }
  return { allowed: true, sessionId: parsed.data };
}

export async function readBoundedAiJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false }> {
  const reader = request.body?.getReader();
  if (!reader) return { ok: false };
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    bytes += result.value.byteLength;
    if (bytes > AI_LIMITS.requestBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false };
    }
    text += decoder.decode(result.value, { stream: true });
  }
  text += decoder.decode();
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}
