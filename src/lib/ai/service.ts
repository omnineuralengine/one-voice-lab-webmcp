import {
  aiReasoningOutputSchema,
  aiReasoningRequestSchema,
  type AiClaimLabel,
  type AiContext,
  type AiReasoningOutput,
  type AiReasoningRequest,
  type AiReasoningResponse,
} from "@/lib/ai/schemas";
import { getAiModel, isLabAiEnabled } from "@/lib/ai/models";
import { redactAiText, sanitizeAiContext } from "@/lib/ai/redaction";
import { resolveReasoningClass } from "@/lib/ai/reasoning-policy";
import { createUsageMetadata, recordAiUsage } from "@/lib/ai/usage";
import type { ReasoningGenerator } from "@/lib/ai/gateway";

const UNAVAILABLE_MESSAGE = "AI reasoning is temporarily unavailable. The deterministic Lab remains available.";

function markUnconfirmedNumericTarget(value: string) {
  return /\d/.test(value) && !/^Target to confirm\b/i.test(value)
    ? `Target to confirm — ${value}`
    : value;
}

export function prepareAiRequest(value: unknown): AiReasoningRequest {
  const parsed = aiReasoningRequestSchema.parse(value);
  return {
    ...parsed,
    prompt: redactAiText(parsed.prompt),
    context: sanitizeAiContext(parsed.context),
  };
}

export function enforceClaimEvidence(output: AiReasoningOutput, context: AiContext): AiReasoningOutput {
  const evidence = new Map(context.evidence.map((item) => [item.id, item]));
  const allowedModules = new Map([
    ["audio-signal-lab", { label: "Audio Signal Lab", href: "/?module=audio-signal-lab" }],
    ["architecture-studio", { label: "Architecture Studio", href: "/architecture-studio" }],
    ["live-solution-studio", { label: "Live Solution Studio", href: "/live-solution-studio" }],
    ["api-lab", { label: "API Lab", href: "/?module=api-studio" }],
    ["deliverables", { label: "Deliverables Studio", href: "/deliverables" }],
    ["evals", { label: "Evaluation Registry", href: "/evals" }],
  ]);
  const allowedNext = output.nextModule ? allowedModules.get(output.nextModule.id) : null;
  return {
    ...output,
    nextModule: output.nextModule && allowedNext ? { ...output.nextModule, label: allowedNext.label, href: allowedNext.href } : null,
    poc: output.poc ? {
      ...output.poc,
      quantitativeCriteria: output.poc.quantitativeCriteria.map(markUnconfirmedNumericTarget),
      testMatrix: output.poc.testMatrix.map((item) => ({
        ...item,
        successCriterion: markUnconfirmedNumericTarget(item.successCriterion),
      })),
    } : null,
    claims: output.claims.map((claim) => {
      let label: AiClaimLabel = claim.label;
      // The public request body is untrusted. A model or caller can cite a real
      // evidence ID without proving that the generated sentence is supported by
      // that evidence, so generated prose never receives verification authority.
      // The deterministic evidence card remains authoritative and reviewable.
      if (label === "Repository verified" || label === "Deepgram documentation verified") {
        label = "Assumption";
      }
      return { ...claim, label, evidenceIds: claim.evidenceIds.filter((id) => evidence.has(id)) };
    }),
  };
}

function redactGeneratedValue(value: unknown): unknown {
  if (typeof value === "string") return redactAiText(value, 4_000);
  if (Array.isArray(value)) return value.map(redactGeneratedValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactGeneratedValue(item)]));
  }
  return value;
}

export function disabledAiResponse(): AiReasoningResponse {
  return {
    status: "disabled",
    message: "AI reasoning is disabled. The deterministic Lab remains fully available.",
    result: null,
    usage: null,
    requiresHumanAcceptance: true,
    deterministicStateChanged: false,
  };
}

export async function runAppliedVoiceReasoning(input: {
  value: unknown;
  sessionId: string;
  generate: ReasoningGenerator;
  enabled?: boolean;
  now?: () => number;
}): Promise<AiReasoningResponse> {
  if (!(input.enabled ?? isLabAiEnabled())) return disabledAiResponse();

  const request = prepareAiRequest(input.value);
  const reasoningClass = resolveReasoningClass(request.feature, request.requestedReasoningClass);
  const model = getAiModel(reasoningClass);
  const now = input.now ?? Date.now;
  const startedAt = now();

  try {
    const generated = await input.generate({ request, reasoningClass, model, sessionId: input.sessionId });
    const parsed = aiReasoningOutputSchema.safeParse(redactGeneratedValue(generated.output));
    if (!parsed.success) {
      const usage = createUsageMetadata({ feature: request.feature, reasoningClass, model: generated.model || model, startedAt, success: false, fallbackUsed: generated.fallbackUsed, now: now() });
      recordAiUsage(input.sessionId, usage);
      return { status: "invalid-output", message: UNAVAILABLE_MESSAGE, result: null, usage, requiresHumanAcceptance: true, deterministicStateChanged: false };
    }

    const result = enforceClaimEvidence(parsed.data, request.context);
    const usage = createUsageMetadata({
      feature: request.feature,
      reasoningClass,
      model: generated.model || model,
      startedAt,
      inputTokens: generated.inputTokens,
      outputTokens: generated.outputTokens,
      costUsd: generated.costUsd,
      success: true,
      fallbackUsed: generated.fallbackUsed,
      now: now(),
    });
    recordAiUsage(input.sessionId, usage);
    return { status: "completed", message: "AI proposal ready for human review.", result, usage, requiresHumanAcceptance: true, deterministicStateChanged: false };
  } catch {
    const usage = createUsageMetadata({ feature: request.feature, reasoningClass, model, startedAt, success: false, now: now() });
    recordAiUsage(input.sessionId, usage);
    return { status: "unavailable", message: UNAVAILABLE_MESSAGE, result: null, usage, requiresHumanAcceptance: true, deterministicStateChanged: false };
  }
}
