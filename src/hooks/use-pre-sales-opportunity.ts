"use client";

import { useCallback, useEffect, useState } from "react";

import { createOpportunity, validateOpportunitySnapshot } from "@/lib/pre-sales-studio/engine";
import type { CustomerPatternId, OpportunityState } from "@/types/pre-sales-studio";

const STORAGE_KEY = "deepgram-pre-sales-studio:opportunity:v1";

export function usePreSalesOpportunity() {
  const [opportunity, setOpportunity] = useState<OpportunityState | null>(null);
  const [savedOpportunity, setSavedOpportunity] = useState<OpportunityState | null>(null);
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as unknown;
        setSavedOpportunity(validateOpportunitySnapshot(parsed));
      } catch {
        setSavedOpportunity(null);
      } finally {
        setStorageReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!storageReady || !opportunity) return;
    if (!opportunity.persistenceEnabled) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(opportunity));
  }, [opportunity, storageReady]);

  const start = useCallback((patternId: CustomerPatternId) => setOpportunity(createOpportunity(patternId)), []);
  const resume = useCallback(() => { if (savedOpportunity) setOpportunity(savedOpportunity); }, [savedOpportunity]);
  const clear = useCallback(() => { window.localStorage.removeItem(STORAGE_KEY); setSavedOpportunity(null); setOpportunity(null); }, []);
  const reset = useCallback(() => { if (opportunity) setOpportunity(createOpportunity(opportunity.patternId)); }, [opportunity]);
  const update = useCallback((updater: OpportunityState | ((current: OpportunityState) => OpportunityState)) => {
    setOpportunity((current) => {
      if (!current) return current;
      return typeof updater === "function" ? updater(current) : updater;
    });
  }, []);

  return { opportunity, savedOpportunity, storageReady, start, resume, clear, reset, update };
}
