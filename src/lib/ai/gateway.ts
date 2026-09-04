import "server-only";

import { generateText, gateway, Output } from "ai";

import { aiReasoningOutputSchema, type AiReasoningOutput } from "@/lib/ai/schemas";
import { APPLIED_VOICE_SYSTEM_PROMPT, buildAiPrompt } from "@/lib/ai/prompts";
import { outputTokenLimit, timeoutMs } from "@/lib/ai/reasoning-policy";
import type { AiReasoningRequest, AiReasoningClass } from "@/lib/ai/schemas";

export type GatewayReasoningResult = {
  output: unknown;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  fallbackUsed: boolean;
};

export type ReasoningGenerator = (input: {
  request: AiReasoningRequest;
  reasoningClass: AiReasoningClass;
  model: string;
  sessionId: string;
}) => Promise<GatewayReasoningResult>;

export const generateGatewayReasoning: ReasoningGenerator = async ({
  request,
  reasoningClass,
  model,
  sessionId,
}) => {
  const fallbackModel = reasoningClass === "DEEP" ? process.env.LAB_AI_FAST_MODEL?.trim() : undefined;
  const gatewayOptions = {
    user: `voice-lab-${sessionId}`,
    tags: ["applied-voice-lab", request.feature, reasoningClass.toLowerCase(), "reasoning-v1"],
    ...(fallbackModel && fallbackModel !== model ? { models: [fallbackModel] } : {}),
    ...(process.env.LAB_AI_ZERO_DATA_RETENTION?.trim().toLowerCase() === "true" ? { zeroDataRetention: true } : {}),
  };

  const result = await generateText({
    model: gateway(model),
    system: APPLIED_VOICE_SYSTEM_PROMPT,
    prompt: buildAiPrompt(request),
    output: Output.object({
      name: "AppliedVoiceReasoning",
      description: "A bounded applied voice engineering review with explicit evidence labels.",
      schema: aiReasoningOutputSchema,
    }),
    reasoning: reasoningClass === "DEEP" ? "high" : "low",
    maxOutputTokens: outputTokenLimit(reasoningClass),
    timeout: { totalMs: timeoutMs(reasoningClass) },
    maxRetries: 1,
    providerOptions: { gateway: gatewayOptions },
  });

  const responseModel = result.response.modelId;
  return {
    output: result.output satisfies AiReasoningOutput,
    model: responseModel || model,
    inputTokens: result.totalUsage.inputTokens ?? null,
    outputTokens: result.totalUsage.outputTokens ?? null,
    costUsd: null,
    fallbackUsed: Boolean(responseModel && responseModel !== model && !model.endsWith(responseModel)),
  };
};
