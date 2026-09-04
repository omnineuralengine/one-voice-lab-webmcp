"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { prepareCodeLabLaunch } from "@/lib/code-lab-launch-context";
import type {
  CodeLabLaunchContext,
  CodeLabLaunchContextInput,
  CodeLabLaunchContextValue,
  CodeLabLaunchMode,
  CodeLabLaunchPreparationResult,
} from "@/types/code-lab-launch-context";

const CodeLabLaunchContextState = createContext<CodeLabLaunchContextValue | null>(null);
const TEMPORARY_LAUNCH_MARKER_KEY = "deepgram-code-lab:temporary-launch-marker:v1";

export type CodeLabLaunchProviderProps = {
  children: ReactNode;
  initialLaunch?: CodeLabLaunchContextInput | null;
};

export function CodeLabLaunchProvider({
  children,
  initialLaunch = null,
}: CodeLabLaunchProviderProps) {
  const [initialResult] = useState<CodeLabLaunchPreparationResult | null>(() =>
    initialLaunch ? prepareCodeLabLaunch(initialLaunch) : null,
  );
  const initialContext = initialResult?.ok ? initialResult.context : null;
  const contextRef = useRef<CodeLabLaunchContext | null>(initialContext);
  const launchModeRef = useRef<CodeLabLaunchMode | null>(initialContext ? "replace" : null);
  const [context, setContext] = useState<CodeLabLaunchContext | null>(initialContext);
  const [launchMode, setLaunchMode] = useState<CodeLabLaunchMode | null>(
    initialContext ? "replace" : null,
  );
  const [expired, setExpired] = useState(false);
  const expiredOnMountRef = useRef(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let timer: number | null = null;
    try {
      if (window.sessionStorage.getItem(TEMPORARY_LAUNCH_MARKER_KEY) === "active") {
        window.sessionStorage.removeItem(TEMPORARY_LAUNCH_MARKER_KEY);
        expiredOnMountRef.current = true;
      }
    } catch {
      // The context still expires safely when sessionStorage is unavailable.
    }
    if (expiredOnMountRef.current) {
      timer = window.setTimeout(() => setExpired(true), 0);
    }
    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  const launch = useCallback(
    (
      input: CodeLabLaunchContextInput,
      mode: CodeLabLaunchMode = "replace",
    ): CodeLabLaunchPreparationResult => {
      const result = prepareCodeLabLaunch(input, contextRef.current, mode);
      if (result.ok) {
        contextRef.current = result.context;
        launchModeRef.current = mode;
        setContext(result.context);
        setLaunchMode(mode);
        setExpired(false);
        try {
          if (mode === "temporary") window.sessionStorage.setItem(TEMPORARY_LAUNCH_MARKER_KEY, "active");
          else window.sessionStorage.removeItem(TEMPORARY_LAUNCH_MARKER_KEY);
        } catch {
          // The launch context remains in memory only.
        }
        setRevision((current) => current + 1);
      }
      return result;
    },
    [],
  );

  const clear = useCallback(() => {
    if (contextRef.current === null) return;
    contextRef.current = null;
    launchModeRef.current = null;
    setContext(null);
    setLaunchMode(null);
    try {
      window.sessionStorage.removeItem(TEMPORARY_LAUNCH_MARKER_KEY);
    } catch {
      // Storage cleanup is best-effort.
    }
    setRevision((current) => current + 1);
  }, []);

  const consume = useCallback(() => {
    const current = contextRef.current;
    if (current && launchModeRef.current === "temporary") {
      contextRef.current = null;
      launchModeRef.current = null;
      setContext(null);
      setLaunchMode(null);
      setRevision((value) => value + 1);
    }
    return current;
  }, []);

  const acknowledgeExpired = useCallback(() => setExpired(false), []);

  const value = useMemo<CodeLabLaunchContextValue>(
    () => ({ context, launchMode, expired, revision, launch, publish: launch, consume, clear, acknowledgeExpired }),
    [acknowledgeExpired, clear, consume, context, expired, launch, launchMode, revision],
  );

  return <CodeLabLaunchContextState.Provider value={value}>{children}</CodeLabLaunchContextState.Provider>;
}

export function useCodeLabLaunch() {
  const value = useContext(CodeLabLaunchContextState);
  if (!value) {
    throw new Error("useCodeLabLaunch must be used inside CodeLabLaunchProvider.");
  }
  return value;
}

export function useOptionalCodeLabLaunch() {
  return useContext(CodeLabLaunchContextState);
}
