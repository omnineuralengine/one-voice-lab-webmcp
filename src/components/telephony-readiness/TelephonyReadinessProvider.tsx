"use client";

import Link from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import {
  createTelephonyReadinessController,
  type TelephonyReadinessController,
  type TelephonyReadinessLabState,
} from "@/lib/telephony-readiness/controller";
import {
  registerTelephonyReadinessWebMcpTools,
  type TelephonyReadinessWebMcpRegistrationStatus,
} from "@/lib/telephony-readiness/webmcp";

export type TelephonyReadinessSiteToolsStatus =
  | Readonly<{
      state: "detecting";
      registeredToolNames: readonly [];
      failedToolNames: readonly [];
      message: "Checking whether this browser supports WebMCP site tools.";
    }>
  | TelephonyReadinessWebMcpRegistrationStatus;

type TelephonyReadinessContextValue = Readonly<{
  controller: TelephonyReadinessController;
  state: TelephonyReadinessLabState;
  siteToolsStatus: TelephonyReadinessSiteToolsStatus;
}>;

const INITIAL_SITE_TOOLS_STATUS: TelephonyReadinessSiteToolsStatus = {
  state: "detecting",
  registeredToolNames: [],
  failedToolNames: [],
  message: "Checking whether this browser supports WebMCP site tools.",
};

const TelephonyReadinessContext = createContext<TelephonyReadinessContextValue | null>(null);

export function TelephonyReadinessProvider({ children }: { children: React.ReactNode }) {
  const [controller] = useState(createTelephonyReadinessController);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getServerSnapshot,
  );
  const [siteToolsStatus, setSiteToolsStatus] = useState<TelephonyReadinessSiteToolsStatus>(
    INITIAL_SITE_TOOLS_STATUS,
  );

  useEffect(() => {
    registerTelephonyReadinessWebMcpTools(document, controller, setSiteToolsStatus);
  }, [controller]);

  const value = useMemo(
    () => ({ controller, state, siteToolsStatus }),
    [controller, state, siteToolsStatus],
  );

  return (
    <TelephonyReadinessContext.Provider value={value}>
      {children}
    </TelephonyReadinessContext.Provider>
  );
}

export function useTelephonyReadiness() {
  const value = useContext(TelephonyReadinessContext);
  if (!value) {
    throw new Error("useTelephonyReadiness must be used within TelephonyReadinessProvider");
  }
  return value;
}

export function TelephonyReadinessGlobalActivity() {
  const { state } = useTelephonyReadiness();
  const source = state.latestActivity?.source === "webmcp-agent" ? "WebMCP agent" : "Human UI";
  return (
    <div aria-live="polite" className="telephony-global-activity" role="status">
      <Link href="/telephony-readiness">
        <span>Telephony lab · simulation only</span>
        <strong>{state.latestActivity ? `${source}: ${state.latestActivity.action}` : "No live call capability"}</strong>
      </Link>
    </div>
  );
}
