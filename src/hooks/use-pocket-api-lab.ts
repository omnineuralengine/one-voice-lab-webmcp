"use client";

import { useCallback, useEffect, useState } from "react";

import { DEFAULT_POCKET_API_STATE, addPocketApiQuestion, readPocketApiStoredState, togglePocketApiPin, writePocketApiStoredState } from "@/lib/pocket-api-lab";
import type { PocketApiSnippetLanguage, PocketApiStoredState } from "@/types/pocket-api-lab";

export function usePocketApiLab() {
  const [state, setState] = useState<PocketApiStoredState>({ ...DEFAULT_POCKET_API_STATE });
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setState(readPocketApiStoredState(window.localStorage));
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (storageReady) writePocketApiStoredState(window.localStorage, state);
  }, [state, storageReady]);

  const selectPreset = useCallback((presetId: string) => setState((current) => ({ ...current, selectedPresetId: presetId, recentQuestions: addPocketApiQuestion(current.recentQuestions, presetId) })), []);
  const setQuickCallMode = useCallback((quickCallMode: boolean) => setState((current) => ({ ...current, quickCallMode })), []);
  const togglePin = useCallback((endpointId: string, language: PocketApiSnippetLanguage) => setState((current) => ({ ...current, pinnedSnippets: togglePocketApiPin(current.pinnedSnippets, endpointId, language) })), []);
  const clearHistory = useCallback(() => setState((current) => ({ ...current, recentQuestions: [], pinnedSnippets: [] })), []);

  return { state, storageReady, selectPreset, setQuickCallMode, togglePin, clearHistory };
}
