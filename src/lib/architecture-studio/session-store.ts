import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { isSessionExpired } from "@/lib/architecture-studio/session-core";
import type { StudioSession } from "@/types/architecture-studio";

type StudioSessionRow = {
  id: string;
  code: string;
  presenter_token_hash: string;
  snapshot: StudioSession;
  version: number;
  created_at: string;
  updated_at: string;
  expires_at: string;
};

let studioSupabase: SupabaseClient | null = null;

export function studioBackendMode(): "supabase" | "local-demo" {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
    && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    ? "supabase"
    : "local-demo";
}
function getStudioSupabase() {
  if (studioBackendMode() !== "supabase") throw new Error("architecture_studio_backend_not_configured");
  if (!studioSupabase) {
    studioSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );
  }
  return studioSupabase;
}

export async function createStoredSession(session: StudioSession, presenterTokenHash: string) {
  const client = getStudioSupabase();
  await client.from("architecture_studio_sessions").delete().lt("expires_at", new Date().toISOString());
  const { error } = await client.from("architecture_studio_sessions").insert({
    id: session.id,
    code: session.code,
    presenter_token_hash: presenterTokenHash,
    snapshot: session,
    version: session.version,
    created_at: session.createdAt,
    updated_at: session.updatedAt,
    expires_at: session.expiresAt,
  });
  if (error) throw new Error(`session_insert_${error.code ?? "failed"}`);
}

export async function getStoredSession(code: string) {
  const { data, error } = await getStudioSupabase()
    .from("architecture_studio_sessions")
    .select("id,code,presenter_token_hash,snapshot,version,created_at,updated_at,expires_at")
    .eq("code", code)
    .maybeSingle<StudioSessionRow>();
  if (error) throw new Error(`session_read_${error.code ?? "failed"}`);
  if (!data) return null;
  if (isSessionExpired(data.snapshot)) {
    await deleteStoredSession(code);
    return null;
  }
  return data;
}

export async function mutateStoredSession(
  code: string,
  mutate: (session: StudioSession, row: StudioSessionRow) => Promise<StudioSession> | StudioSession,
) {
  const client = getStudioSupabase();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const row = await getStoredSession(code);
    if (!row) return null;
    const next = await mutate(structuredClone(row.snapshot), row);
    const nextVersion = Math.max(next.version, row.version + 1);
    const snapshot = { ...next, version: nextVersion };
    const { data, error } = await client
      .from("architecture_studio_sessions")
      .update({ snapshot, version: nextVersion, updated_at: snapshot.updatedAt })
      .eq("code", code)
      .eq("version", row.version)
      .select("id,code,presenter_token_hash,snapshot,version,created_at,updated_at,expires_at")
      .maybeSingle<StudioSessionRow>();
    if (error) throw new Error(`session_update_${error.code ?? "failed"}`);
    if (data) return data;
  }
  throw new Error("session_update_conflict");
}

export async function deleteStoredSession(code: string) {
  const { error } = await getStudioSupabase().from("architecture_studio_sessions").delete().eq("code", code);
  if (error) throw new Error(`session_delete_${error.code ?? "failed"}`);
}

export async function countActiveStoredSessions() {
  if (studioBackendMode() !== "supabase") return null;
  const { count, error } = await getStudioSupabase()
    .from("architecture_studio_sessions")
    .select("id", { count: "exact", head: true })
    .gt("expires_at", new Date().toISOString());
  if (error) return null;
  return count ?? 0;
}
