import { NextResponse } from "next/server";

import { countActiveStoredSessions, studioBackendMode } from "@/lib/architecture-studio/session-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const mode = studioBackendMode();
  const activeSessions = await countActiveStoredSessions();
  const storageHealthy = mode === "local-demo" || activeSessions !== null;
  return NextResponse.json({
    ok: storageHealthy,
    service: "one-voice-lab",
    architectureStudio: {
      mode,
      realtime: mode === "supabase",
      storage: mode === "supabase" ? "short-lived-supabase" : "browser-local-demo",
      status: storageHealthy ? "ready" : "degraded",
      activeSessions,
    },
    checkedAt: new Date().toISOString(),
  }, { status: storageHealthy ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
