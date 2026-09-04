"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import { redactSecrets } from "@/lib/inspection";
import type { ObservatoryEvent, ObservatoryMetric, ObservatoryPresetId, ObservatoryRun, ObservatorySource, ObservatoryStage, ObservatoryProvenance } from "@/types/observatory";

type AddEventInput = {
  eventType: string;
  source: ObservatorySource;
  stage: ObservatoryStage;
  provenance: ObservatoryProvenance;
  requestId?: string;
  inspectorId?: string;
  durationMs?: number;
  value?: string | number | boolean;
  unit?: string;
  severity?: "info" | "warning" | "error";
  payload?: unknown;
};

type ObservatoryContextValue = {
  run: ObservatoryRun | null;
  beginRun: (input: { mode: "synthetic" | "live"; presetId: ObservatoryPresetId; operation: string; settings?: Record<string, unknown> }) => ObservatoryRun;
  addEvent: (input: AddEventInput) => void;
  updateRun: (update: Partial<ObservatoryRun> | ((current: ObservatoryRun) => Partial<ObservatoryRun>)) => void;
  setMetrics: (metrics: ObservatoryMetric[]) => void;
  clearRun: () => void;
};

const ObservatoryContext = createContext<ObservatoryContextValue | null>(null);

export function LiveObservatoryProvider({ children }: { children: ReactNode }) {
  const [run, setRun] = useState<ObservatoryRun | null>(null);
  const startMsRef = useRef(0);
  const sequenceRef = useRef(0);

  const beginRun = useCallback((input: { mode: "synthetic" | "live"; presetId: ObservatoryPresetId; operation: string; settings?: Record<string, unknown> }) => {
    const startedAt = new Date().toISOString();
    const runId = `${input.mode === "live" ? "live" : "synthetic"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    startMsRef.current = performance.now();
    sequenceRef.current = 0;
    const next: ObservatoryRun = {
      version: 1,
      mode: input.mode,
      runId,
      sessionId: `session-${Date.now()}`,
      presetId: input.presetId,
      operation: input.operation,
      status: input.mode === "live" ? "running" : "completed",
      startedAt,
      completedAt: input.mode === "synthetic" ? startedAt : undefined,
      settings: redactSecrets(input.settings ?? {}),
      events: [],
      metrics: [],
      requestIds: [],
      activeRequestCount: 0,
      sessionRequestCount: 0,
      costState: "Unavailable",
      notes: [],
    };
    setRun(next);
    return next;
  }, []);

  const addEvent = useCallback((input: AddEventInput) => {
    setRun((current) => {
      if (!current) return current;
      const sequence = ++sequenceRef.current;
      const event: ObservatoryEvent = {
        runId: current.runId,
        sessionId: current.sessionId,
        requestId: input.requestId,
        inspectorId: input.inspectorId,
        localEventId: `${current.runId}-event-${sequence}`,
        sequence,
        timestamp: new Date().toISOString(),
        monotonicOffsetMs: Math.max(0, Math.round(performance.now() - startMsRef.current)),
        mode: current.mode,
        source: input.source,
        stage: input.stage,
        eventType: input.eventType,
        provenance: input.provenance,
        durationMs: input.durationMs,
        value: input.value,
        unit: input.unit,
        severity: input.severity ?? "info",
        redactionState: input.payload === undefined ? "not-applicable" : "sanitized",
        sanitizedPayload: redactSecrets(input.payload),
      };
      const requestIds = input.requestId && !current.requestIds.includes(input.requestId) ? [...current.requestIds, input.requestId] : current.requestIds;
      return { ...current, events: [...current.events, event].slice(-500), requestIds };
    });
  }, []);

  const updateRun = useCallback((update: Partial<ObservatoryRun> | ((current: ObservatoryRun) => Partial<ObservatoryRun>)) => {
    setRun((current) => current ? { ...current, ...(typeof update === "function" ? update(current) : update) } : current);
  }, []);
  const setMetrics = useCallback((metrics: ObservatoryMetric[]) => updateRun({ metrics }), [updateRun]);
  const clearRun = useCallback(() => { setRun(null); sequenceRef.current = 0; }, []);
  const value = useMemo(() => ({ run, beginRun, addEvent, updateRun, setMetrics, clearRun }), [run, beginRun, addEvent, updateRun, setMetrics, clearRun]);
  return <ObservatoryContext.Provider value={value}>{children}</ObservatoryContext.Provider>;
}

export function useLiveObservatory() {
  const value = useContext(ObservatoryContext);
  if (!value) throw new Error("useLiveObservatory must be used within LiveObservatoryProvider.");
  return value;
}
