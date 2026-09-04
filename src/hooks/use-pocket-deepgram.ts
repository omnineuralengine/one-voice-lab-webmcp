"use client";

import { useCallback, useEffect, useState } from "react";

import { addPocketRecentAction, DEFAULT_POCKET_PREFERENCES, readPocketStoredState, writePocketStoredState } from "@/lib/pocket-deepgram";
import type { PocketConnectionState, PocketInstallPromptEvent, PocketMode, PocketPreferences, PocketRecentAction, PocketTargetId } from "@/types/pocket-deepgram";

export function usePocketDeepgram({ pwaEnabled }: { pwaEnabled: boolean }) {
  const [preferences, setPreferences] = useState<PocketPreferences>({ ...DEFAULT_POCKET_PREFERENCES });
  const [recentActions, setRecentActions] = useState<PocketRecentAction[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [connection, setConnection] = useState<PocketConnectionState>("unchecked");
  const [installPrompt, setInstallPrompt] = useState<PocketInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [serviceWorkerReady, setServiceWorkerReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = readPocketStoredState(window.localStorage);
      setPreferences(stored.preferences);
      setRecentActions(stored.recentActions);
      setOnline(window.navigator.onLine);
      setInstalled(window.matchMedia("(display-mode: standalone)").matches || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    writePocketStoredState(window.localStorage, { preferences, recentActions });
  }, [preferences, recentActions, storageReady]);

  useEffect(() => {
    const updateOnline = () => setOnline(window.navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => { window.removeEventListener("online", updateOnline); window.removeEventListener("offline", updateOnline); };
  }, []);

  useEffect(() => {
    if (!pwaEnabled || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    void navigator.serviceWorker.register("/pocket-deepgram-sw.js", { scope: "/" }).then(() => navigator.serviceWorker.ready).then(() => { if (!cancelled) setServiceWorkerReady(true); }).catch(() => { if (!cancelled) setServiceWorkerReady(false); });
    return () => { cancelled = true; };
  }, [pwaEnabled]);

  useEffect(() => {
    const beforeInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as PocketInstallPromptEvent); };
    const appInstalled = () => { setInstalled(true); setInstallPrompt(null); };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", appInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", beforeInstall); window.removeEventListener("appinstalled", appInstalled); };
  }, []);

  const setMode = useCallback((mode: PocketMode) => setPreferences((current) => ({ ...current, mode })), []);
  const setDocked = useCallback((docked: boolean) => setPreferences((current) => ({ ...current, docked })), []);
  const setDemoMode = useCallback((demoMode: boolean) => setPreferences((current) => ({ ...current, demoMode })), []);
  const recordTarget = useCallback((targetId: PocketTargetId) => setRecentActions((current) => addPocketRecentAction(current, targetId)), []);
  const clearRecent = useCallback(() => setRecentActions([]), []);
  const install = useCallback(async () => {
    if (!installPrompt) return false;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
    return choice.outcome === "accepted";
  }, [installPrompt]);
  const checkConnection = useCallback(async () => {
    if (!window.navigator.onLine) { setConnection("unavailable"); return; }
    setConnection("checking");
    try {
      const response = await fetch("/api/deepgram/health", { cache: "no-store" });
      const payload = await response.json() as { ok?: boolean };
      setConnection(response.ok && payload.ok ? "connected" : "unavailable");
    } catch { setConnection("unavailable"); }
  }, []);

  return { preferences, recentActions, storageReady, online, connection, installPrompt, installed, serviceWorkerReady, setMode, setDocked, setDemoMode, recordTarget, clearRecent, install, checkConnection };
}
