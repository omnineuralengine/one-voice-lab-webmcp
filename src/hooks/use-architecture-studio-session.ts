"use client";

import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { getQuestion } from "@/data/architecture-studio-discovery";
import { logStudioEvent } from "@/lib/architecture-studio/safe-log";
import {
  answerStudioQuestion,
  applyPresenterCommand,
  heartbeatParticipant,
  isSessionExpired,
  joinStudioSession,
  reactToRecommendation,
  sanitizeParticipantStudioSession,
  sanitizeStudioSession,
} from "@/lib/architecture-studio/session-core";
import type {
  PublicStudioSession,
  StudioMutation,
} from "@/types/architecture-studio";

type ConnectionStatus = "connecting" | "live" | "reconnecting" | "local-demo" | "offline";
type MutationResult = { session: PublicStudioSession; participantId?: string; participantToken?: string };

const SESSION_PREFIX = "deepgram-architecture-studio:session:";
const PRESENTER_PREFIX = "deepgram-architecture-studio:presenter:";
const PRESENTER_NAVIGATION_PREFIX = "deepgram-architecture-studio:presenter-navigation:";
const PARTICIPANT_PREFIX = "deepgram-architecture-studio:participant:";

let browserSupabase: SupabaseClient | null = null;

export function useArchitectureStudioSession({
  code,
  presenterToken,
}: {
  code: string;
  presenterToken?: string;
}) {
  const [session, setSession] = useState<PublicStudioSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [connectedCount, setConnectedCount] = useState(0);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const localChannelRef = useRef<BroadcastChannel | null>(null);
  const realtimeMode = session?.realtimeMode;
  const expiresAt = session?.expiresAt;

  const refresh = useCallback(async () => {
    const local = readLocalSession(code);
    if (local?.realtimeMode === "local-demo") {
      setSession(presenterToken ? local : sanitizeParticipantStudioSession(local as StudioSessionShape));
      setLoading(false);
      setError("");
      setConnectionStatus("local-demo");
      return local;
    }
    try {
      const response = await fetch(`/api/architecture-studio/sessions/${code}`, {
        cache: "no-store",
        headers: presenterToken ? { "x-architecture-studio-presenter-token": presenterToken } : undefined,
      });
      const payload = await response.json() as { session?: PublicStudioSession; error?: string; mode?: string };
      if (!response.ok || !payload.session) throw new Error(payload.error ?? "session_not_found");
      setSession(payload.session);
      setError("");
      setLoading(false);
      return payload.session;
    } catch (refreshError) {
      setError(refreshError instanceof Error && refreshError.message.includes("expired") ? "This temporary session expired." : "The session is unavailable. Check the code or retry.");
      setLoading(false);
      setConnectionStatus((status) => status === "live" ? "reconnecting" : "offline");
      return null;
    }
  }, [code, presenterToken]);

  useEffect(() => {
    const timeout = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timeout);
  }, [refresh]);

  useEffect(() => {
    if (!expiresAt || !realtimeMode) return;
    const remaining = new Date(expiresAt).getTime() - Date.now();
    const expire = () => {
      if (realtimeMode === "local-demo") {
        clearLocalSession(code);
        setSession(null);
        setError("This temporary session expired.");
        setConnectionStatus("offline");
      } else {
        void refresh();
      }
    };
    const timeout = window.setTimeout(expire, Math.max(0, Math.min(remaining, 2_147_000_000)));
    return () => window.clearTimeout(timeout);
  }, [code, expiresAt, realtimeMode, refresh]);

  useEffect(() => {
    if (!realtimeMode) return;
    if (realtimeMode === "local-demo") {
      const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(`architecture-studio:${code}`) : null;
      localChannelRef.current = channel;
      const syncLocal = () => {
        const next = readLocalSession(code);
        if (next) {
          setSession(presenterToken ? next : sanitizeParticipantStudioSession(next as StudioSessionShape));
          setError("");
        } else {
          setSession(null);
          setError("The temporary session was deleted or expired.");
          setConnectionStatus("offline");
        }
      };
      channel?.addEventListener("message", syncLocal);
      const storage = (event: StorageEvent) => {
        if (event.key === `${SESSION_PREFIX}${code}`) syncLocal();
      };
      window.addEventListener("storage", storage);
      return () => { channel?.close(); window.removeEventListener("storage", storage); localChannelRef.current = null; };
    }

    const supabase = getBrowserSupabase();
    if (!supabase) {
      const pollingOnly = window.setInterval(() => { void refresh(); }, 5000);
      return () => window.clearInterval(pollingOnly);
    }

    const presenceKey = readParticipantCredentials(code)?.participantId ?? `viewer-${crypto.randomUUID()}`;
    const channel = supabase
      .channel(`architecture-studio:${code}`, { config: { presence: { key: presenceKey } } })
      .on("broadcast", { event: "session_updated" }, () => { void refresh(); })
      .on("broadcast", { event: "session_deleted" }, () => {
        setSession(null);
        setError("The presenter deleted this temporary session.");
        setConnectionStatus("offline");
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setConnectedCount(Object.keys(state).length);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          setConnectionStatus("live");
          await channel.track({ kind: presenterToken ? "presenter" : "participant", joinedAt: new Date().toISOString() });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnectionStatus("reconnecting");
          logStudioEvent("realtime_reconnection", { code, reason: status.toLowerCase(), mode: "supabase" });
        } else if (status === "CLOSED") setConnectionStatus("offline");
      });
    channelRef.current = channel;
    const polling = window.setInterval(() => { void refresh(); }, 8000);
    const online = () => { setConnectionStatus("reconnecting"); void refresh(); };
    window.addEventListener("online", online);
    return () => {
      window.clearInterval(polling);
      window.removeEventListener("online", online);
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [code, presenterToken, realtimeMode, refresh]);

  const mutate = useCallback(async (mutation: StudioMutation): Promise<MutationResult> => {
    const current = readLocalSession(code) ?? session;
    if (!current) throw new Error("session_unavailable");
    if (isSessionExpired(current)) {
      if (current.realtimeMode === "local-demo") clearLocalSession(code);
      setSession(null);
      setError("This temporary session expired.");
      setConnectionStatus("offline");
      throw new Error("session_expired");
    }
    if (current.realtimeMode === "local-demo") {
      const result = applyLocalMutation(current, mutation, presenterToken, code);
      writeLocalSession(result.session);
      const visibleSession = presenterToken ? result.session : sanitizeParticipantStudioSession(result.session as StudioSessionShape);
      setSession(visibleSession);
      localChannelRef.current?.postMessage({ type: "session_updated", version: result.session.version });
      return { ...result, session: visibleSession };
    }

    const response = await fetch(`/api/architecture-studio/sessions/${code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mutation),
    });
    const payload = await response.json() as MutationResult & { error?: string };
    if (!response.ok || !payload.session) throw new Error(payload.error ?? "mutation_failed");
    setSession(payload.session);
    await channelRef.current?.send({ type: "broadcast", event: "session_updated", payload: { version: payload.session.version } });
    return payload;
  }, [code, presenterToken, session]);

  const deleteSession = useCallback(async () => {
    const current = session ?? readLocalSession(code);
    if (!current) return;
    if (current.realtimeMode === "local-demo") {
      clearLocalSession(code);
      localChannelRef.current?.postMessage({ type: "session_deleted" });
      setSession(null);
      return;
    }
    const response = await fetch(`/api/architecture-studio/sessions/${code}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ presenterToken }),
    });
    if (!response.ok) throw new Error("session_delete_failed");
    await channelRef.current?.send({ type: "broadcast", event: "session_deleted", payload: {} });
    setSession(null);
  }, [code, presenterToken, session]);

  return { session, loading, error, connectionStatus, connectedCount, refresh, mutate, deleteSession };
}

export function writeLocalSession(session: PublicStudioSession) {
  window.localStorage.setItem(`${SESSION_PREFIX}${session.code}`, JSON.stringify(session));
}

export function writeLocalPresenterToken(code: string, token: string) {
  window.localStorage.setItem(`${PRESENTER_PREFIX}${code}`, token);
}

export function readLocalPresenterToken(code: string) {
  return typeof window === "undefined" ? null : window.localStorage.getItem(`${PRESENTER_PREFIX}${code}`);
}

export function writePresenterNavigationToken(code: string, token: string) {
  window.sessionStorage.setItem(`${PRESENTER_NAVIGATION_PREFIX}${code}`, token);
}

export function readPresenterNavigationToken(code: string) {
  return typeof window === "undefined" ? null : window.sessionStorage.getItem(`${PRESENTER_NAVIGATION_PREFIX}${code}`);
}

export function writeParticipantCredentials(code: string, participantId: string, participantToken: string) {
  window.localStorage.setItem(`${PARTICIPANT_PREFIX}${code}`, JSON.stringify({ participantId, participantToken }));
  window.dispatchEvent(new Event(`architecture-studio-participant:${code}`));
}

export function useStoredParticipantCredentials(code: string) {
  const raw = useSyncExternalStore(
    (notify) => {
      const eventName = `architecture-studio-participant:${code}`;
      window.addEventListener(eventName, notify);
      window.addEventListener("storage", notify);
      return () => { window.removeEventListener(eventName, notify); window.removeEventListener("storage", notify); };
    },
    () => window.localStorage.getItem(`${PARTICIPANT_PREFIX}${code}`),
    () => null,
  );
  try {
    const value = JSON.parse(raw ?? "null") as { participantId?: string; participantToken?: string } | null;
    return value?.participantId && value.participantToken ? { participantId: value.participantId, participantToken: value.participantToken } : null;
  } catch { return null; }
}

export function readParticipantCredentials(code: string): { participantId: string; participantToken: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(`${PARTICIPANT_PREFIX}${code}`) ?? "null") as { participantId?: string; participantToken?: string } | null;
    return value?.participantId && value.participantToken ? { participantId: value.participantId, participantToken: value.participantToken } : null;
  } catch { return null; }
}

function readLocalSession(code: string): PublicStudioSession | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(`${SESSION_PREFIX}${code}`) ?? "null") as PublicStudioSession | null;
    if (!value) return null;
    if (isSessionExpired(value)) {
      clearLocalSession(code);
      return null;
    }
    return value;
  } catch { return null; }
}

function clearLocalSession(code: string) {
  window.localStorage.removeItem(`${SESSION_PREFIX}${code}`);
  window.localStorage.removeItem(`${PRESENTER_PREFIX}${code}`);
  window.localStorage.removeItem(`${PARTICIPANT_PREFIX}${code}`);
  window.sessionStorage.removeItem(`${PRESENTER_NAVIGATION_PREFIX}${code}`);
}

function applyLocalMutation(
  publicSession: PublicStudioSession,
  mutation: StudioMutation,
  presenterToken: string | undefined,
  code: string,
): MutationResult {
  let session = publicSession as StudioSessionShape;
  switch (mutation.type) {
    case "join": {
      const token = mutation.participantToken || crypto.randomUUID().replaceAll("-", "");
      const joined = joinStudioSession(session, { displayName: mutation.displayName, role: mutation.role, participantId: mutation.participantId, participantToken: token });
      return { session: sanitizeStudioSession(joined.session), participantId: joined.participantId, participantToken: token };
    }
    case "answer":
      if (session.pausedStageIds.includes(getQuestion(mutation.questionId)?.stageId ?? session.activeStageId)) throw new Error("stage_paused");
      session = answerStudioQuestion(session, mutation.participantId, mutation.questionId, mutation.value);
      break;
    case "react":
      session = reactToRecommendation(session, mutation.participantId, mutation.path);
      break;
    case "heartbeat":
      session = heartbeatParticipant(session, mutation.participantId);
      break;
    case "presenter": {
      const expected = window.localStorage.getItem(`${PRESENTER_PREFIX}${code}`);
      if (!presenterToken || presenterToken !== expected || mutation.presenterToken !== expected) throw new Error("presenter_authorization_failed");
      session = applyPresenterCommand(session, mutation.command);
      break;
    }
  }
  return { session: sanitizeStudioSession(session) };
}

type StudioSessionShape = Parameters<typeof sanitizeStudioSession>[0];

function getBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  if (!browserSupabase) browserSupabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return browserSupabase;
}
