"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import {
  createVoiceReplayController,
  type VoiceReplayController,
  type VoiceReplayState,
} from "@/lib/simulations/webmcp-controller";
import {
  registerVoiceReplayWebMcpTools,
  type VoiceReplayWebMcpRegistrationStatus,
} from "@/lib/simulations/webmcp";

export type VoiceReplaySiteToolsStatus = VoiceReplayWebMcpRegistrationStatus | Readonly<{
  state: "detecting";
  registeredToolNames: readonly [];
  failedToolNames: readonly [];
  message: "Awaiting WebMCP feature detection.";
}>;

type VoiceReplayContextValue = Readonly<{
  controller: VoiceReplayController;
  state: VoiceReplayState;
  siteToolsStatus: VoiceReplaySiteToolsStatus;
}>;

const VoiceReplayContext = createContext<VoiceReplayContextValue | null>(null);

const INITIAL_STATUS: VoiceReplaySiteToolsStatus = {
  state: "detecting",
  registeredToolNames: [],
  failedToolNames: [],
  message: "Awaiting WebMCP feature detection.",
};

export function VoiceReplayWebMcpProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [controller] = useState(createVoiceReplayController);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getServerSnapshot,
  );
  const [siteToolsStatus, setSiteToolsStatus] = useState<VoiceReplaySiteToolsStatus>(INITIAL_STATUS);

  useEffect(() => {
    controller.setPathname(pathname);
  }, [controller, pathname]);

  useEffect(() => {
    controller.setLabMounted(true);
    return () => controller.setLabMounted(false);
  }, [controller]);

  useEffect(() => {
    const registration = registerVoiceReplayWebMcpTools(
      document,
      controller,
      setSiteToolsStatus,
    );
    return registration.release;
  }, [controller]);

  const value = useMemo(
    () => ({ controller, state, siteToolsStatus }),
    [controller, state, siteToolsStatus],
  );

  return <VoiceReplayContext.Provider value={value}>{children}</VoiceReplayContext.Provider>;
}

export function useVoiceReplayWebMcp() {
  const value = useContext(VoiceReplayContext);
  if (!value) {
    throw new Error("useVoiceReplayWebMcp must be used within VoiceReplayWebMcpProvider");
  }
  return value;
}
