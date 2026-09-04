"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import {
  VoiceLabActionRuntime,
  type ClientActionDispatchOptions,
} from "@/lib/actions/client-runtime";
import type { ActionResult } from "@/lib/actions/contracts";
import type { ActionInput, ActionName, ActionOutput } from "@/lib/actions/registry";

type VoiceLabActionContextValue = Readonly<{
  runtime: VoiceLabActionRuntime;
  dispatch<Name extends ActionName>(
    name: Name,
    input: ActionInput<Name>,
    options: ClientActionDispatchOptions,
  ): Promise<ActionResult<Name, ActionOutput<Name>>>;
}>;

const VoiceLabActionContext = createContext<VoiceLabActionContextValue | null>(null);

export function VoiceLabActionProvider({ children }: { children: React.ReactNode }) {
  const [runtime] = useState(() => new VoiceLabActionRuntime());
  const dispatch = useCallback<VoiceLabActionContextValue["dispatch"]>(
    (name, input, options) => runtime.dispatch(name, input, options),
    [runtime],
  );
  const value = useMemo(() => ({ runtime, dispatch }), [dispatch, runtime]);
  return <VoiceLabActionContext.Provider value={value}>{children}</VoiceLabActionContext.Provider>;
}

export function useVoiceLabActions() {
  const value = useContext(VoiceLabActionContext);
  if (!value) throw new Error("useVoiceLabActions must be used within VoiceLabActionProvider");
  return value;
}
