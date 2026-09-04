"use client";

import { useEffect, useRef } from "react";

import { useVoiceLabActions } from "@/components/actions/VoiceLabActionProvider";
import type {
  ClientActionContract,
  ClientActionHandler,
  ClientActionRegistrationOptions,
} from "@/lib/actions/client-runtime";
import { getActionDefinition, type ActionName } from "@/lib/actions/registry";

export function useRegisterVoiceLabAction<Name extends ActionName>(
  name: Name,
  handler: ClientActionHandler<Name>,
  options: ClientActionRegistrationOptions = {},
) {
  const { runtime } = useVoiceLabActions();
  const contract = getActionDefinition(name) as unknown as ClientActionContract<Name>;
  const handlerRef = useRef(handler);
  const optionsRef = useRef(options);

  useEffect(() => {
    handlerRef.current = handler;
    optionsRef.current = options;
  }, [handler, options]);

  useEffect(() => runtime.register(
    name,
    contract,
    (input, context) => handlerRef.current(input, context),
    {
      isAvailable: () => optionsRef.current.isAvailable?.() !== false,
      unavailableMessage: optionsRef.current.unavailableMessage,
    },
  ), [contract, name, runtime]);
}
