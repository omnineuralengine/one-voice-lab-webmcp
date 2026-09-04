import { NextRequest, NextResponse } from "next/server";

import { checkLabAccess, labAccessResponse } from "@/lib/access/lab-access";
import { logStudioEvent } from "@/lib/architecture-studio/safe-log";
import { createStudioSession, sanitizeStudioSession } from "@/lib/architecture-studio/session-core";
import { createStoredSession, studioBackendMode } from "@/lib/architecture-studio/session-store";
import { hashStudioToken } from "@/lib/architecture-studio/token-security";
import { readBoundedRequestText, RequestBodyTooLargeError } from "@/lib/http/bounded-body";
import type { StudioScenarioId } from "@/types/architecture-studio";

export const runtime = "nodejs";
const MAX_REQUEST_BYTES = 2_048;

export async function POST(request: NextRequest) {
  const mode = studioBackendMode();
  const input = await readSessionInput(request);
  if (input instanceof Response) return input;
  const access = await checkLabAccess(request, "session_creation", {
    endpointId: "architecture-studio:create-session",
    actorIntent: "human",
    durableRequired: mode === "supabase",
  });
  if (!access.allowed) return labAccessResponse(access);
  const scenarioId = validScenarioId(input.scenarioId) ? input.scenarioId : "northstar-contact-cloud";
  const sessionOptions = { scenarioId, customScenarioName: typeof input.customScenarioName === "string" ? input.customScenarioName : undefined };
  try {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const { session, presenterToken } = createStudioSession(mode, sessionOptions);
      if (mode === "supabase") {
        try {
          await createStoredSession(session, hashStudioToken(presenterToken));
        } catch (error) {
          if (String(error).includes("23505") && attempt < 3) continue;
          throw error;
        }
      }
      const origin = request.nextUrl.origin;
      return NextResponse.json({
        mode,
        session: sanitizeStudioSession(session),
        presenterToken,
        presenterUrl: `${origin}/architecture-studio/session/${session.code}/presenter`,
        participantUrl: `${origin}/architecture-studio/session/${session.code}`,
      }, { status: 201, headers: { "Cache-Control": "no-store" } });
    }
    throw new Error("session_code_generation_exhausted");
  } catch (error) {
    logStudioEvent("session_creation_failure", { reason: safeReason(error), mode });
    const { session, presenterToken } = createStudioSession("local-demo", sessionOptions);
    const origin = request.nextUrl.origin;
    return NextResponse.json({
      mode: "local-demo",
      session: sanitizeStudioSession(session),
      presenterToken,
      presenterUrl: `${origin}/architecture-studio/session/${session.code}/presenter`,
      participantUrl: `${origin}/architecture-studio/session/${session.code}`,
      fallbackReason: "hosted_session_unavailable",
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  }
}

async function readSessionInput(
  request: NextRequest,
): Promise<{ scenarioId?: string; customScenarioName?: string } | Response> {
  try {
    const text = await readBoundedRequestText(request, MAX_REQUEST_BYTES);
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as { scenarioId?: string; customScenarioName?: string };
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json(
        { error: { code: "request_too_large", message: "Session creation requests are limited to 2 KB." } },
        { status: 413, headers: { "Cache-Control": "no-store" } },
      );
    }
    return {};
  }
}

function validScenarioId(value: string | undefined): value is StudioScenarioId {
  return value === "northstar-contact-cloud" || value === "meridian-contact-cloud" || value === "custom";
}

function safeReason(error: unknown) {
  return error instanceof Error ? error.message.split(":")[0] : "unknown";
}
