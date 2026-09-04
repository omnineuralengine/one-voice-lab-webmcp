import type { ActionResult, ActionSource } from "@/lib/actions/contracts";
import type {
  ACTION_DEFINITIONS,
  ActionInput,
  ActionName,
  ActionOutput,
} from "@/lib/actions/registry";
import {
  createActionExecution,
  normalizeActionFailure,
  unavailableFailure,
  validationFailure,
  type ActionExecutionDependencies,
} from "@/lib/actions/results";

export type ClientActionInvocationContext = Readonly<{
  source: ActionSource;
  invocationId: string;
  signal?: AbortSignal;
}>;

export type ClientActionHandler<Name extends ActionName> = (
  input: ActionInput<Name>,
  context: ClientActionInvocationContext,
) => ActionOutput<Name> | Promise<ActionOutput<Name>>;

export type ClientActionRegistrationOptions = Readonly<{
  isAvailable?: () => boolean;
  unavailableMessage?: string;
}>;

export type ClientActionContract<Name extends ActionName> = (typeof ACTION_DEFINITIONS)[Name];

export type ClientActionDispatchOptions = Readonly<{
  source: ActionSource;
  signal?: AbortSignal;
  userGesture?: boolean;
  execution?: ActionExecutionDependencies;
}>;

type RegisteredHandler = Readonly<{
  token: symbol;
  contract: ClientActionContract<ActionName>;
  handler: (input: never, context: ClientActionInvocationContext) => unknown | Promise<unknown>;
  isAvailable?: () => boolean;
  unavailableMessage?: string;
}>;

export class VoiceLabActionRuntime {
  private readonly handlers = new Map<ActionName, RegisteredHandler[]>();

  register<Name extends ActionName>(
    name: Name,
    contract: ClientActionContract<Name>,
    handler: ClientActionHandler<Name>,
    options: ClientActionRegistrationOptions = {},
  ) {
    const registration: RegisteredHandler = {
      token: Symbol(name),
      contract: contract as ClientActionContract<ActionName>,
      handler: handler as RegisteredHandler["handler"],
      isAvailable: options.isAvailable,
      unavailableMessage: options.unavailableMessage,
    };
    const current = this.handlers.get(name) ?? [];
    this.handlers.set(name, [...current, registration]);
    return () => {
      const next = (this.handlers.get(name) ?? []).filter((candidate) => candidate.token !== registration.token);
      if (next.length) this.handlers.set(name, next);
      else this.handlers.delete(name);
    };
  }

  async dispatch<Name extends ActionName>(
    name: Name,
    input: ActionInput<Name>,
    options: ClientActionDispatchOptions,
  ): Promise<ActionResult<Name, ActionOutput<Name>>> {
    const registrations = this.handlers.get(name) ?? [];
    const active = [...registrations].reverse().find((registration) => registration.isAvailable?.() !== false);
    const contract = active?.contract ?? registrations.at(-1)?.contract;
    const execution = createActionExecution(name, options.source, contract?.metadata.usage.kind ?? "none", options.execution);
    if (!contract || !active) {
      const message = registrations.at(-1)?.unavailableMessage;
      return execution.failure(unavailableFailure(message));
    }
    const parsed = contract.inputSchema.safeParse(input);
    if (!parsed.success) {
      return execution.failure(validationFailure(parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }))));
    }
    if (!contract.metadata.surfaces.includes(options.source)) {
      return execution.failure({
        code: "action_source_not_allowed",
        category: "permission",
        message: "This action is not available through the requested surface.",
        retryable: false,
      });
    }
    if (contract.metadata.trust.includes("user-gesture") && !options.userGesture) {
      return execution.failure({
        code: "user_gesture_required",
        category: "permission",
        message: "This browser action requires an explicit human gesture.",
        retryable: true,
      });
    }
    if (options.signal?.aborted) {
      return execution.failure({ code: "action_cancelled", category: "cancelled", message: "The action was cancelled.", retryable: false });
    }

    try {
      const output = await active.handler(parsed.data as never, {
        source: options.source,
        invocationId: execution.invocationId,
        signal: options.signal,
      });
      if (options.signal?.aborted) {
        return execution.failure({ code: "action_cancelled", category: "cancelled", message: "The action was cancelled.", retryable: false });
      }
      const validated = contract.outputSchema.safeParse(output);
      if (!validated.success) {
        return execution.failure({
          code: "invalid_action_output",
          category: "internal",
          message: "The registered action returned an invalid structured result.",
          retryable: false,
        });
      }
      return execution.success(validated.data) as ActionResult<Name, ActionOutput<Name>>;
    } catch (error) {
      return execution.failure(normalizeActionFailure(error));
    }
  }
}
