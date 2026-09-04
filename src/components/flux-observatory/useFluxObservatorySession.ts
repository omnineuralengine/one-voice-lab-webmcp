"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  DEFAULT_FLUX_CONFIGURATION,
  createConfigurationRequestEvent,
  createFluxObservatoryState,
  createLocalFluxEvent,
  normalizeFluxProviderMessage,
  reduceFluxObservatoryEvent,
  type FluxConfiguration,
  type FluxConfigurationUpdate,
  type FluxNormalizedEvent,
  type FluxObservatoryState,
  type FluxSessionMode,
} from "@/lib/flux-observatory";
import {
  FluxLiveClient,
  type FluxLiveClientSignal,
  type FluxLiveClientSnapshot,
} from "@/lib/flux-observatory/live-client";

const EMPTY_LIVE_SNAPSHOT: FluxLiveClientSnapshot = {
  generation: 0,
  connection: "idle",
  credential: "unavailable",
  microphone: "idle",
  configuredTargetChunkMs: 80,
  measuredChunkIntervalMs: null,
  socketBufferedBytes: 0,
  droppedFrames: 0,
  delayedFrames: 0,
  rms: 0,
  error: "",
};

export function useFluxObservatorySession(initialConfiguration: FluxConfiguration = DEFAULT_FLUX_CONFIGURATION) {
  const [state, setState] = useState<FluxObservatoryState>(() => createState("synthetic-replay", initialConfiguration));
  const [liveSnapshot, setLiveSnapshot] = useState<FluxLiveClientSnapshot>(EMPTY_LIVE_SNAPSHOT);
  const stateRef = useRef(state);
  const clientRef = useRef<FluxLiveClient | null>(null);

  useEffect(() => { stateRef.current = state; }, [state]);

  const ingest = useCallback((event: FluxNormalizedEvent) => {
    setState((current) => reduceFluxObservatoryEvent(current, event));
  }, []);

  const handleSignal = useCallback((signal: FluxLiveClientSignal) => {
    const current = stateRef.current;
    const context = {
      sessionId: current.sessionId,
      connectionGeneration: signal.generation,
      monotonicMs: signal.monotonicMs,
      mode: "live-provider" as const,
    };
    if (signal.kind === "provider") ingest(normalizeFluxProviderMessage(signal.payload, context));
    else if (signal.kind === "configuration-request") ingest(createConfigurationRequestEvent(signal.requestKey, signal.previousConfiguration, signal.update, context));
    else ingest(createLocalFluxEvent(signal.name, context, signal.details));
  }, [ingest]);

  useEffect(() => {
    const client = new FluxLiveClient({ onSignal: handleSignal, onSnapshot: setLiveSnapshot });
    clientRef.current = client;
    return () => {
      clientRef.current = null;
      void client.dispose();
    };
  }, [handleSignal]);

  const reset = useCallback((mode: FluxSessionMode, configuration: FluxConfiguration) => {
    setState(createState(mode, configuration));
    setLiveSnapshot({ ...EMPTY_LIVE_SNAPSHOT, configuredTargetChunkMs: configuration.targetChunkMs });
  }, []);

  const selectMode = useCallback(async (mode: FluxSessionMode, configuration: FluxConfiguration) => {
    if (mode !== stateRef.current.mode && stateRef.current.mode === "live-provider") await clientRef.current?.stop(false);
    reset(mode, configuration);
  }, [reset]);

  const prepareMicrophone = useCallback(async (configuration: FluxConfiguration) => {
    if (stateRef.current.mode !== "live-provider") reset("live-provider", configuration);
    await clientRef.current?.prepareMicrophone(configuration);
  }, [reset]);

  const startLive = useCallback(async (configuration: FluxConfiguration) => {
    if (stateRef.current.mode !== "live-provider") reset("live-provider", configuration);
    await clientRef.current?.start(configuration);
  }, [reset]);

  const applyLiveConfiguration = useCallback((update: FluxConfigurationUpdate) => {
    clientRef.current?.applyConfiguration(update, stateRef.current.activeConfiguration);
  }, []);

  const reconnect = useCallback(async (configuration: FluxConfiguration) => {
    await clientRef.current?.reconnect(configuration);
  }, []);

  const stopLive = useCallback(async () => {
    await clientRef.current?.stop();
  }, []);

  return {
    state,
    setState,
    liveSnapshot,
    ingest,
    reset,
    selectMode,
    prepareMicrophone,
    startLive,
    applyLiveConfiguration,
    reconnect,
    stopLive,
  };
}

function createState(mode: FluxSessionMode, configuration: FluxConfiguration) {
  return createFluxObservatoryState({
    sessionId: `flux-${crypto.randomUUID()}`,
    mode,
    configuration,
    connectionGeneration: 1,
    maxEvents: 1_500,
  });
}
