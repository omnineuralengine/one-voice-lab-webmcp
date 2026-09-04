import "server-only";

import {
  AGENT_ACTION_ALLOWLIST,
  getActionDefinition,
  type ActionInput,
  type ActionName,
  type ActionOutput,
  type AgentActionName,
} from "@/lib/actions/registry";
import {
  ActionExecutionError,
  createActionExecution,
  normalizeActionFailure,
  validationFailure,
  type ActionExecutionDependencies,
} from "@/lib/actions/results";
import type { ActionResult, ActionSource } from "@/lib/actions/contracts";
import { benchmarkMethodologyCatalog } from "@/lib/evaluation/benchmark-catalog";
import { createFixtureLeaderboardPreview } from "@/lib/evaluation/benchmark-engine";
import { verifyBenchmarkResultIntegrity } from "@/lib/evaluation/benchmark-integrity";
import {
  listBenchmarkLeaderboardSnapshots,
  type BenchmarkReadRepository,
} from "@/lib/evaluation/benchmark-read-service";
import { BENCHMARK_PUBLIC_LIST_VERSION } from "@/lib/evaluation/benchmark-read-schema";
import { getPublicBenchmarkReadRepository } from "@/lib/evaluation/benchmark-supabase-repository";
import { readPublicProviderOperationalPolicies } from "@/lib/providers/policy-service";
import type { ProviderPlatformProjection } from "@/lib/providers/platform-types";
import {
  getPublicEval,
  getPublicEvals,
  getPublicMethodology,
  getPublicProviders,
  getPublicProvidersFromPlatform,
  runPublicSyntheticEval,
} from "@/lib/public-evidence/registry";
import { comparePublicProviderEvidence } from "@/lib/public-evidence/tools";

type EnvironmentLookup = Readonly<Record<string, string | undefined>>;

export const PUBLIC_SERVER_ACTION_NAMES = [...AGENT_ACTION_ALLOWLIST] as const;
export type PublicServerActionName = (typeof PUBLIC_SERVER_ACTION_NAMES)[number];

export type PublicServerActionContext = Readonly<{
  source: Extract<ActionSource, "ui" | "rest" | "mcp" | "automation">;
  environment?: EnvironmentLookup;
  signal?: AbortSignal;
  execution?: ActionExecutionDependencies;
  benchmarkRepository?: BenchmarkReadRepository | null;
  /** Deterministic contract-test seam; production transports omit this. */
  providerPlatform?: readonly ProviderPlatformProjection[];
}>;

export async function executePublicServerAction<Name extends PublicServerActionName>(
  name: Name,
  input: ActionInput<Name>,
  context: PublicServerActionContext,
): Promise<ActionResult<Name, ActionOutput<Name>>> {
  const definition = getActionDefinition(name);
  const execution = createActionExecution(name, context.source, definition.metadata.usage.kind, context.execution);
  const parsed = definition.inputSchema.safeParse(input);
  if (!parsed.success) {
    return execution.failure(validationFailure(parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }))));
  }
  if (!definition.metadata.surfaces.includes(context.source)) {
    return execution.failure({
      code: "action_source_not_allowed",
      category: "permission",
      message: "This action is not available through the requested surface.",
      retryable: false,
    });
  }
  if ((context.source === "mcp" || context.source === "automation") && !isAgentActionName(name)) {
    return execution.failure({
      code: "agent_action_not_allowed",
      category: "permission",
      message: "This action is not approved for agent or automation use.",
      retryable: false,
    });
  }
  if (context.signal?.aborted) {
    return execution.failure({ code: "action_cancelled", category: "cancelled", message: "The action was cancelled.", retryable: false });
  }

  try {
    const output = await dispatchPublicAction(name, parsed.data, context);
    if (context.signal?.aborted) {
      return execution.failure({ code: "action_cancelled", category: "cancelled", message: "The action was cancelled.", retryable: false });
    }
    const validated = definition.outputSchema.safeParse(output);
    if (!validated.success) {
      return execution.failure({
        code: "invalid_action_output",
        category: "internal",
        message: "The action service returned an invalid structured result.",
        retryable: false,
      });
    }
    return execution.success(validated.data) as ActionResult<Name, ActionOutput<Name>>;
  } catch (error) {
    return execution.failure(normalizeActionFailure(error));
  }
}

async function dispatchPublicAction<Name extends PublicServerActionName>(
  name: Name,
  input: unknown,
  context: PublicServerActionContext,
): Promise<unknown> {
  const environment = context.environment ?? process.env;
  switch (name) {
    case "providers.list": {
      const request = input as ActionInput<"providers.list">;
      const providers = (await publicProvidersForContext(context))
        .filter((provider) => request.group === undefined || provider.platform.group === request.group)
        .filter((provider) => request.kind === undefined || provider.platform.kind === request.kind)
        .filter((provider) => request.capabilityId === undefined
          || provider.platform.capabilities.some((capability) => capability.id === request.capabilityId))
        .sort((left, right) => left.id.localeCompare(right.id));
      const cursorIndex = request.after === undefined
        ? -1
        : providers.findIndex((provider) => provider.id === request.after);
      if (request.after !== undefined && cursorIndex < 0) {
        throw new ActionExecutionError("provider_cursor_invalid", "validation", "The provider cursor is not valid for these filters.");
      }
      const afterIndex = cursorIndex + 1;
      const limit = request.limit ?? 25;
      const page = providers.slice(afterIndex, afterIndex + limit + 1);
      const hasMore = page.length > limit;
      const bounded = page.slice(0, limit);
      return {
        providers: bounded,
        nextCursor: hasMore ? bounded.at(-1)?.id ?? null : null,
        totalMatched: providers.length,
      };
    }
    case "providers.get": {
      const providerId = (input as ActionInput<"providers.get">).providerId;
      const provider = (await publicProvidersForContext(context)).find((candidate) => candidate.id === providerId) ?? null;
      if (!provider) throw new ActionExecutionError("provider_not_found", "unavailable", `Provider '${providerId}' is not in the public registry.`);
      return { provider };
    }
    case "providers.compareEvidence": {
      const providerIds = (input as ActionInput<"providers.compareEvidence">).providerIds;
      const providers = await publicProvidersForContext(context);
      const available = new Set(providers.map((provider) => provider.id));
      const unknown = providerIds.find((providerId) => !available.has(providerId));
      if (unknown) {
        throw new ActionExecutionError(
          "provider_not_found",
          "unavailable",
          `Provider '${unknown}' is not in the public catalog.`,
        );
      }
      return comparePublicProviderEvidence(providers, providerIds);
    }
    case "providers.listCapabilities": {
      const providerId = (input as ActionInput<"providers.listCapabilities">).providerId;
      const provider = (await publicProvidersForContext(context)).find((candidate) => candidate.id === providerId) ?? null;
      if (!provider) throw new ActionExecutionError("provider_not_found", "unavailable", `Provider '${providerId}' is not in the public catalog.`);
      return { providerId, capabilities: provider.platform.capabilities };
    }
    case "providers.listModels": {
      const providerId = (input as ActionInput<"providers.listModels">).providerId;
      const provider = (await publicProvidersForContext(context)).find((candidate) => candidate.id === providerId) ?? null;
      if (!provider) throw new ActionExecutionError("provider_not_found", "unavailable", `Provider '${providerId}' is not in the public catalog.`);
      return { providerId, models: provider.platform.models, availability: provider.platform.models.length ? "available" : "unavailable" };
    }
    case "providers.listVoices": {
      const providerId = (input as ActionInput<"providers.listVoices">).providerId;
      const provider = (await publicProvidersForContext(context)).find((candidate) => candidate.id === providerId) ?? null;
      if (!provider) throw new ActionExecutionError("provider_not_found", "unavailable", `Provider '${providerId}' is not in the public catalog.`);
      return { providerId, voices: provider.platform.voices, availability: provider.platform.voices.length ? "available" : "unavailable" };
    }
    case "providers.getHealth": {
      const providerId = (input as ActionInput<"providers.getHealth">).providerId;
      const provider = (await publicProvidersForContext(context)).find((candidate) => candidate.id === providerId) ?? null;
      if (!provider) throw new ActionExecutionError("provider_not_found", "unavailable", `Provider '${providerId}' is not in the public catalog.`);
      return { providerId, health: provider.platform.health, readiness: provider.platform.readiness };
    }
    case "evaluations.list":
      return { evaluations: getPublicEvals(environment) };
    case "evaluations.get": {
      const evalId = (input as ActionInput<"evaluations.get">).evalId;
      const evaluation = getPublicEval(evalId, environment);
      if (!evaluation) throw new ActionExecutionError("evaluation_not_found", "unavailable", `Evaluation '${evalId}' is not in the public registry.`);
      return { evaluation };
    }
    case "methodology.get":
      return { methodology: getPublicMethodology(environment) };
    case "publicEvaluation.runSynthetic": {
      const evalId = (input as ActionInput<"publicEvaluation.runSynthetic">).evalId;
      const result = runPublicSyntheticEval(evalId, environment, context.execution?.now);
      if (!result) throw new ActionExecutionError("synthetic_evaluation_not_found", "unavailable", `Runnable synthetic evaluation '${evalId}' was not found.`);
      return { result };
    }
    case "benchmark.fixtureLeaderboard":
      return { snapshot: createFixtureLeaderboardPreview() };
    case "benchmark.listLeaderboardSnapshots": {
      const repository = context.benchmarkRepository === undefined
        ? await getPublicBenchmarkReadRepository()
        : context.benchmarkRepository;
      if (!repository) {
        return { schemaVersion: BENCHMARK_PUBLIC_LIST_VERSION, items: [], nextCursor: null };
      }
      return listBenchmarkLeaderboardSnapshots(
        input as ActionInput<"benchmark.listLeaderboardSnapshots">,
        { repository },
      );
    }
    case "benchmark.listMethodologies":
      return { methodologies: benchmarkMethodologyCatalog };
    case "benchmark.inspectMethodology": {
      const request = input as ActionInput<"benchmark.inspectMethodology">;
      const methodology = benchmarkMethodologyCatalog.find((candidate) => (
        candidate.methodologyId === request.methodologyId && candidate.version === request.version
      ));
      if (!methodology) throw new ActionExecutionError("methodology_not_found", "unavailable", "The requested benchmark methodology was not found.");
      return { methodology };
    }
    case "benchmark.verifyResultIntegrity":
      return {
        integrity: await verifyBenchmarkResultIntegrity(
          (input as ActionInput<"benchmark.verifyResultIntegrity">).result,
        ),
      };
  }
}

function isAgentActionName(name: ActionName): name is AgentActionName {
  return (AGENT_ACTION_ALLOWLIST as readonly ActionName[]).includes(name);
}

async function publicProvidersForContext(
  context: PublicServerActionContext,
) {
  const environment = context.environment ?? process.env;
  if (context.providerPlatform) {
    return getPublicProvidersFromPlatform(context.providerPlatform, environment);
  }
  return getPublicProviders(environment, await readPublicProviderOperationalPolicies());
}
