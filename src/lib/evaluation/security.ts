import "server-only";

import { createHash } from "node:crypto";

import { getEvaluationPreset } from "@/lib/evaluation/presets";
import type { EvaluationRunRequest } from "@/lib/evaluation/schema";
import {
  getEvaluationRuntimeMaxTextLength,
  getProtectedEvaluationVoiceIds,
  hasDurableGuestConfiguration,
  hasDurableIdentityConfiguration,
  type EvaluationEnvironment,
} from "@/lib/evaluation/runtime";
import { getOneSupabaseServerClient } from "@/lib/supabase/server";
import { isOneHumanAuthSubject } from "@/lib/auth/human-subject";

export type EvaluationIdentityState = "member" | "anonymous" | "unavailable";

export class EvaluationBoundaryError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "EvaluationBoundaryError";
  }
}

export type EvaluationBoundaryDependencies = Readonly<{
  environment?: EvaluationEnvironment;
  resolveIdentity?: () => Promise<EvaluationIdentityState>;
}>;

export type EvaluationLiveCatalogMode = "protected-live" | "local-live";

export async function validateEvaluationRequest(
  input: EvaluationRunRequest,
  environment: EvaluationEnvironment = process.env,
): Promise<void> {
  const maximumTextLength = getEvaluationRuntimeMaxTextLength(environment);
  if (input.scenario.text.length > maximumTextLength) {
    throw new EvaluationBoundaryError(
      "evaluation_input_too_large",
      `This evaluation is limited to ${maximumTextLength} characters in the current environment.`,
      413,
    );
  }

  if (input.scenario.text !== input.scenario.text.trim()) {
    throw new EvaluationBoundaryError(
      "evaluation_input_outer_whitespace",
      "Remove leading or trailing whitespace so the recorded text exactly matches the provider input.",
      400,
    );
  }

  const expectedHash = hashEvaluationText(input.scenario.text);
  if (input.scenario.inputHash !== expectedHash) {
    throw new EvaluationBoundaryError(
      "evaluation_input_hash_mismatch",
      "The scenario hash does not match the exact UTF-8 input text.",
      400,
    );
  }

  validateScenarioSource(input);
  if (input.blind.enabled && input.evaluationMode !== "standardized") {
    throw new EvaluationBoundaryError(
      "blind_requires_standardized_audio",
      "Blind listening requires Standardized mode so ONE can normalize output to metadata-safe WAV audio.",
      400,
    );
  }
  if (input.executionMode !== "fixture" && input.evaluationMode !== "standardized") {
    throw new EvaluationBoundaryError(
      "live_provider_optimized_unavailable",
      "Live evaluation currently requires Standardized mode so every result uses a validated playable WAV boundary.",
      400,
    );
  }
  validateProviderConfiguration(input, environment);
}

export async function enforceEvaluationExecutionBoundary(
  request: Request,
  input: EvaluationRunRequest,
  dependencies: EvaluationBoundaryDependencies = {},
): Promise<EvaluationIdentityState> {
  assertSameSiteRequest(request);
  if (input.executionMode === "fixture") return "anonymous";

  const environment = dependencies.environment ?? process.env;
  assertAutomatedLiveRunsExplicitlyEnabled(environment);
  if (environment.ONE_LIVE_EVALS_ENABLED !== "true") {
    throw new EvaluationBoundaryError(
      "live_evaluations_disabled",
      "Live evaluations are paused. Deterministic fixture comparisons remain available.",
      503,
    );
  }
  if (!input.confirmedPaidCalls) {
    throw new EvaluationBoundaryError(
      "paid_confirmation_required",
      "Confirm the paid provider calls before starting a live comparison.",
      409,
    );
  }

  if (input.executionMode === "local-live") {
    if (environment.NODE_ENV === "production" || !isLocalRequest(request)) {
      throw new EvaluationBoundaryError(
        "local_live_unavailable",
        "Local live evaluation is available only from a trusted localhost development session.",
        403,
      );
    }
    return "member";
  }

  if (environment.NODE_ENV !== "production") {
    throw new EvaluationBoundaryError(
      "protected_live_requires_hosted_boundary",
      "Use local-live for trusted local development. Protected live evaluation requires the hosted durable boundary.",
      503,
    );
  }
  if (environment.ONE_LIVE_LAB_ENABLED !== "true") {
    throw new EvaluationBoundaryError(
      "live_lab_paused",
      "Live provider operations are paused. Deterministic fixture comparisons remain available.",
      503,
    );
  }
  if (!hasDurableIdentityConfiguration(environment)) {
    throw new EvaluationBoundaryError(
      "durable_protection_unavailable",
      "Durable usage protection is not configured. No provider request was sent.",
      503,
    );
  }

  const identity = await (dependencies.resolveIdentity ?? resolveEvaluationIdentity)();
  if (identity === "unavailable") {
    throw new EvaluationBoundaryError(
      "durable_protection_unavailable",
      "Durable identity protection is temporarily unavailable. No provider request was sent.",
      503,
    );
  }
  if (identity === "member") return identity;
  if (environment.ONE_LIVE_EVALS_ANONYMOUS_ENABLED !== "true") {
    throw new EvaluationBoundaryError(
      "anonymous_live_disabled",
      "Anonymous live evaluations are disabled. Sign in or use deterministic fixture mode.",
      403,
    );
  }
  if (!hasDurableGuestConfiguration(environment)) {
    throw new EvaluationBoundaryError(
      "durable_guest_protection_unavailable",
      "Durable anonymous usage protection is not configured. No provider request was sent.",
      503,
    );
  }
  return identity;
}

export async function enforceEvaluationCatalogBoundary(
  request: Request,
  mode: EvaluationLiveCatalogMode,
  dependencies: EvaluationBoundaryDependencies = {},
): Promise<EvaluationIdentityState> {
  assertSameSiteRequest(request);
  const environment = dependencies.environment ?? process.env;
  assertAutomatedLiveRunsExplicitlyEnabled(environment);
  if (environment.ONE_LIVE_EVALS_ENABLED !== "true") {
    throw new EvaluationBoundaryError("live_evaluations_disabled", "Live catalog discovery is paused. Fixture catalogs remain available.", 503);
  }
  if (mode === "local-live") {
    if (environment.NODE_ENV === "production" || !isLocalRequest(request)) {
      throw new EvaluationBoundaryError("local_live_unavailable", "Local live catalog discovery is available only from localhost development.", 403);
    }
    return "member";
  }
  if (environment.NODE_ENV !== "production" || environment.ONE_LIVE_LAB_ENABLED !== "true") {
    throw new EvaluationBoundaryError("protected_live_unavailable", "Protected live catalog discovery requires the hosted live boundary.", 503);
  }
  if (!hasDurableIdentityConfiguration(environment)) {
    throw new EvaluationBoundaryError("durable_protection_unavailable", "Durable usage protection is not configured. No provider request was sent.", 503);
  }
  const identity = await (dependencies.resolveIdentity ?? resolveEvaluationIdentity)();
  if (identity === "unavailable") {
    throw new EvaluationBoundaryError("durable_protection_unavailable", "Durable identity protection is temporarily unavailable. No provider request was sent.", 503);
  }
  if (identity === "member") return identity;
  if (environment.ONE_LIVE_EVALS_ANONYMOUS_ENABLED !== "true") {
    throw new EvaluationBoundaryError("anonymous_live_disabled", "Anonymous live catalog discovery is disabled.", 403);
  }
  if (!hasDurableGuestConfiguration(environment)) {
    throw new EvaluationBoundaryError("durable_guest_protection_unavailable", "Durable anonymous usage protection is not configured.", 503);
  }
  return identity;
}

export function hashEvaluationText(text: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

export async function resolveEvaluationIdentity(): Promise<EvaluationIdentityState> {
  try {
    const client = await getOneSupabaseServerClient();
    if (!client) return "unavailable";
    const { data, error } = await client.auth.getUser();
    return classifyEvaluationAuthUser(data.user, error);
  } catch {
    return "unavailable";
  }
}

export function classifyEvaluationAuthUser(user: unknown, error?: { message?: string } | null): EvaluationIdentityState {
  if (isOneHumanAuthSubject(user)) return "member";
  if (user) return "unavailable";
  if (!error || (typeof error.message === "string" && /session.*missing|auth.*session/i.test(error.message))) return "anonymous";
  return "unavailable";
}

export function assertSameSiteRequest(request: Request): void {
  if (request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site") {
    throw new EvaluationBoundaryError("cross_origin", "Evaluation requests must originate from this ONE Voice Lab site.", 403);
  }
  const origin = request.headers.get("origin");
  if (!origin) return;
  try {
    const originUrl = new URL(origin);
    const forwardedHost = firstForwardedValue(request.headers.get("x-forwarded-host"));
    const requestHost = firstForwardedValue(request.headers.get("host"));
    const url = new URL(request.url);
    const trustedHost = forwardedHost ?? requestHost ?? url.host;
    if (trustedHost.toLowerCase() !== originUrl.host.toLowerCase()) throw new Error("cross-origin");
    const forwardedProto = firstForwardedValue(request.headers.get("x-forwarded-proto"));
    const expectedProtocol = forwardedProto ? `${forwardedProto.toLowerCase()}:` : url.protocol.toLowerCase();
    if (expectedProtocol !== originUrl.protocol.toLowerCase()) throw new Error("cross-origin");
  } catch {
    throw new EvaluationBoundaryError("cross_origin", "Evaluation requests must originate from this ONE Voice Lab site.", 403);
  }
}

function isLocalRequest(request: Request): boolean {
  try {
    return ["localhost", "127.0.0.1", "::1"].includes(new URL(request.url).hostname);
  } catch {
    return false;
  }
}

function validateScenarioSource(input: EvaluationRunRequest): void {
  const { scenario } = input;
  if (scenario.source === "custom") {
    if (scenario.presetId !== null) {
      throw new EvaluationBoundaryError("invalid_scenario_source", "Custom scenarios cannot claim a preset identifier.", 400);
    }
    return;
  }
  if (!scenario.presetId) {
    throw new EvaluationBoundaryError("invalid_scenario_source", "Preset scenarios require a supported preset identifier.", 400);
  }
  const preset = getEvaluationPreset(scenario.presetId);
  if (!preset || preset.version !== scenario.version) {
    throw new EvaluationBoundaryError("unsupported_scenario_version", "The selected scenario preset or version is unsupported.", 400);
  }
  if (scenario.id !== preset.id) {
    throw new EvaluationBoundaryError("invalid_scenario_source", "The scenario identifier must match the selected versioned preset.", 400);
  }
  if (scenario.source === "preset" && scenario.text !== preset.text) {
    throw new EvaluationBoundaryError("preset_text_mismatch", "Use customized-preset when changing preset text.", 400);
  }
  if (scenario.source === "customized-preset" && scenario.text === preset.text) {
    throw new EvaluationBoundaryError("customized_preset_text_unchanged", "Use preset when the versioned preset text is unchanged.", 400);
  }
}

function validateProviderConfiguration(
  input: EvaluationRunRequest,
  environment: EvaluationEnvironment,
): void {
  for (const selection of input.providers) {
    if (input.executionMode !== "fixture" && selection.providerId === "deepgram" && selection.model !== selection.voice) {
      throw new EvaluationBoundaryError(
        "deepgram_voice_model_mismatch",
        "Deepgram Aura uses one shared identifier for the model and voice fields.",
        400,
      );
    }
    const keys = Object.keys(selection.providerSpecificConfiguration);
    if (input.evaluationMode === "standardized" && keys.length > 0) {
      throw new EvaluationBoundaryError(
        "provider_native_controls_not_standardized",
        "Provider-native controls must be removed in Standardized comparison mode.",
        400,
      );
    }
    if (keys.length > 0) {
      throw new EvaluationBoundaryError(
        "provider_native_controls_unsupported",
        `No provider-native controls are adapter-validated for ${selection.providerId} in this phase.`,
        400,
      );
    }
    const fixtureIdentifier = selection.model.startsWith("fixture-") || selection.voice.startsWith("fixture-");
    if (input.executionMode !== "fixture" && fixtureIdentifier) {
      throw new EvaluationBoundaryError(
        "fixture_identifier_not_live",
        "Deterministic fixture identifiers cannot be used for live provider execution.",
        400,
      );
    }
    if (input.executionMode === "protected-live") {
      const approvedVoiceIds = getProtectedEvaluationVoiceIds(selection.providerId, environment);
      if (approvedVoiceIds && approvedVoiceIds.size === 0) {
        throw new EvaluationBoundaryError(
          "approved_voice_allowlist_unavailable",
          `Protected live evaluation has no approved public voice allowlist for ${selection.providerId}.`,
          503,
        );
      }
      if (approvedVoiceIds && !approvedVoiceIds.has(selection.voice)) {
        throw new EvaluationBoundaryError(
          "voice_not_approved",
          `The selected ${selection.providerId} voice is not approved for hosted evaluation.`,
          403,
        );
      }
    }
  }
}

function firstForwardedValue(value: string | null): string | null {
  const first = value?.split(",", 1)[0]?.trim();
  return first || null;
}

function assertAutomatedLiveRunsExplicitlyEnabled(environment: EvaluationEnvironment): void {
  if (environment.PLAYWRIGHT_E2E === "1" && environment.RUN_LIVE_PROVIDER_TESTS !== "true") {
    throw new EvaluationBoundaryError(
      "automated_live_provider_tests_disabled",
      "Automated browser tests cannot call live providers without the explicit live smoke-test flag.",
      503,
    );
  }
}
