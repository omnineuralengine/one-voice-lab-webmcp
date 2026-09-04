import { NextRequest, NextResponse } from "next/server";

import { logStudioEvent } from "@/lib/architecture-studio/safe-log";
import { getStoredSession, studioBackendMode } from "@/lib/architecture-studio/session-store";
import { studioTokenMatches } from "@/lib/architecture-studio/token-security";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  if (studioBackendMode() !== "supabase") return NextResponse.json({ authorized: false, mode: "local-demo" }, { status: 409 });
  const code = (await params).code.toUpperCase().replace(/[^A-Z2-9]/g, "");
  if (code.length !== 6) return NextResponse.json({ authorized: false }, { status: 400 });
  const body = await request.json().catch(() => ({})) as { presenterToken?: string };
  if (!body.presenterToken) return NextResponse.json({ authorized: false }, { status: 403 });
  try {
    const row = await getStoredSession(code);
    const authorized = Boolean(row && studioTokenMatches(body.presenterToken, row.presenter_token_hash));
    return NextResponse.json({ authorized, mode: "supabase" }, { status: authorized ? 200 : 403, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logStudioEvent("participant_connection_failure", { code, reason: error instanceof Error ? error.name : "unknown", mode: "supabase" });
    return NextResponse.json({ authorized: false, error: "presenter_verification_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
