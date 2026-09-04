"use client";

import { useCallback, useEffect, useSyncExternalStore, type SetStateAction } from "react";

export const GUIDED_HINTS_STORAGE_KEY = "deepgram-voice-lab-guided-hints";
export const LEGACY_LEARNING_MODE_STORAGE_KEY = "deepgram-voice-lab-learning-mode";

const GUIDED_HINTS_CHANGE_EVENT = "deepgram-guided-hints-change";

function readGuidedHints() {
  const stored = window.localStorage.getItem(GUIDED_HINTS_STORAGE_KEY);
  if (stored !== null) return stored !== "off";
  return window.localStorage.getItem(LEGACY_LEARNING_MODE_STORAGE_KEY) !== "off";
}

function subscribe(onStoreChange: () => void) {
  function handleStorage(event: StorageEvent) {
    if (event.key === GUIDED_HINTS_STORAGE_KEY || event.key === LEGACY_LEARNING_MODE_STORAGE_KEY) onStoreChange();
  }

  window.addEventListener("storage", handleStorage);
  window.addEventListener(GUIDED_HINTS_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(GUIDED_HINTS_CHANGE_EVENT, onStoreChange);
  };
}

export function useGuidedHints() {
  const guidedHints = useSyncExternalStore(subscribe, readGuidedHints, () => true);

  useEffect(() => {
    const stored = window.localStorage.getItem(GUIDED_HINTS_STORAGE_KEY);
    const legacyStored = window.localStorage.getItem(LEGACY_LEARNING_MODE_STORAGE_KEY);
    if (stored === null && legacyStored !== null) window.localStorage.setItem(GUIDED_HINTS_STORAGE_KEY, legacyStored);
    if (legacyStored !== null) {
      window.localStorage.removeItem(LEGACY_LEARNING_MODE_STORAGE_KEY);
      window.dispatchEvent(new Event(GUIDED_HINTS_CHANGE_EVENT));
    }
  }, []);

  const setGuidedHints = useCallback((nextValue: SetStateAction<boolean>) => {
    const enabled = typeof nextValue === "function" ? nextValue(readGuidedHints()) : nextValue;
    window.localStorage.setItem(GUIDED_HINTS_STORAGE_KEY, enabled ? "on" : "off");
    window.localStorage.removeItem(LEGACY_LEARNING_MODE_STORAGE_KEY);
    window.dispatchEvent(new Event(GUIDED_HINTS_CHANGE_EVENT));
  }, []);

  return [guidedHints, setGuidedHints] as const;
}
