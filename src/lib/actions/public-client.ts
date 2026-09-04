import { ActionExecutionError } from "@/lib/actions/results";
import type { ActionInput, ActionOutput } from "@/lib/actions/registry";
import { createPublicEnvelopeSchema, publicSyntheticEvalResultSchema } from "@/lib/public-evidence/schemas";

export async function requestSyntheticEvaluationAction(
  input: ActionInput<"publicEvaluation.runSynthetic">,
  signal?: AbortSignal,
): Promise<ActionOutput<"publicEvaluation.runSynthetic">> {
  const response = await fetch(`/api/public/v1/evals/${encodeURIComponent(input.evalId)}/run`, {
    method: "POST",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    if (response.status === 404) {
      throw new ActionExecutionError("synthetic_evaluation_not_found", "unavailable", "The requested synthetic evaluation is unavailable.");
    }
    if (response.status === 429) {
      throw new ActionExecutionError("action_rate_limited", "rate-limit", "The synthetic evaluation needs a short rest before another run.", true);
    }
    throw new ActionExecutionError("synthetic_evaluation_failed", "unavailable", "The synthetic evaluation service is temporarily unavailable.", true);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ActionExecutionError("invalid_action_response", "internal", "The synthetic evaluation returned an invalid structured result.");
  }
  const payload = createPublicEnvelopeSchema(publicSyntheticEvalResultSchema).safeParse(body);
  if (!payload.success) {
    throw new ActionExecutionError("invalid_action_response", "internal", "The synthetic evaluation returned an invalid structured result.");
  }
  return { result: payload.data.data };
}
