import { NextRequest, NextResponse } from "next/server";

import { getQuestion } from "@/data/architecture-studio-discovery";
import { logStudioEvent } from "@/lib/architecture-studio/safe-log";
import {
  answerStudioQuestion,
  applyPresenterCommand,
  heartbeatParticipant,
  joinStudioSession,
  randomToken,
  reactToRecommendation,
  sanitizeParticipantStudioSession,
  sanitizeStudioSession,
} from "@/lib/architecture-studio/session-core";
import { deleteStoredSession, getStoredSession, mutateStoredSession, studioBackendMode } from "@/lib/architecture-studio/session-store";
import { hashStudioToken, studioTokenMatches } from "@/lib/architecture-studio/token-security";
import type { StudioAnswerValue, StudioMutation, StudioParticipant } from "@/types/architecture-studio";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ code: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const code = normalizeCode((await context.params).code);
  if (!code) return errorResponse("invalid_session_code", 400);
  if (studioBackendMode() !== "supabase") {
    return NextResponse.json({ mode: "local-demo", session: null, message: "Hosted realtime is not configured. Use a Local Demo Mode link in this browser." }, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    const row = await getStoredSession(code);
    if (!row) return errorResponse("session_not_found_or_expired", 404);
    const presenterToken = _request.headers.get("x-architecture-studio-presenter-token");
    const presenterAuthorized = Boolean(presenterToken && studioTokenMatches(presenterToken, row.presenter_token_hash));
    return NextResponse.json({ mode: "supabase", session: presenterAuthorized ? sanitizeStudioSession(row.snapshot) : sanitizeParticipantStudioSession(row.snapshot) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logStudioEvent("participant_connection_failure", { code, reason: safeReason(error), mode: "supabase" });
    return errorResponse("session_read_failed", 503);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const code = normalizeCode((await context.params).code);
  if (!code) return errorResponse("invalid_session_code", 400);
  if (studioBackendMode() !== "supabase") return errorResponse("local_demo_mutations_are_browser_local", 409);

  let mutation: StudioMutation;
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 24_000) return errorResponse("mutation_too_large", 413);
    mutation = await request.json() as StudioMutation;
  } catch {
    return errorResponse("invalid_json", 400);
  }
  if (!mutation || typeof mutation !== "object" || typeof mutation.type !== "string") return errorResponse("invalid_mutation", 400);

  let participantToken: string | undefined;
  let participantId: string | undefined;
  try {
    const updated = await mutateStoredSession(code, (session, row) => {
      switch (mutation.type) {
        case "join": {
          const role = mutation.role;
          if (!["vp-customer-experience", "voice-platform-engineer", "security-infrastructure-lead", "observer"].includes(role)) throw new MutationError("invalid_role", 400);
          if (mutation.participantId || mutation.participantToken) {
            const existing = findAuthorizedParticipant(session.participants, mutation.participantId, mutation.participantToken);
            if (!existing) throw new MutationError("participant_authorization_failed", 403);
          }
          participantToken = mutation.participantToken || randomToken();
          const joined = joinStudioSession(session, {
            displayName: typeof mutation.displayName === "string" ? mutation.displayName : "",
            role,
            participantId: mutation.participantId,
            participantToken,
            tokenHash: hashStudioToken(participantToken),
          });
          participantId = joined.participantId;
          return joined.session;
        }
        case "answer": {
          requireParticipant(session.participants, mutation.participantId, mutation.participantToken);
          const question = getQuestion(mutation.questionId);
          if (!question) throw new MutationError("unknown_question", 400);
          if (session.pausedStageIds.includes(question.stageId)) throw new MutationError("stage_paused", 409);
          const value = validateAnswerValue(mutation.questionId, mutation.value);
          return answerStudioQuestion(session, mutation.participantId, mutation.questionId, value);
        }
        case "react":
          requireParticipant(session.participants, mutation.participantId, mutation.participantToken);
          if (!["speech-intelligence", "composable-voice", "managed-voice-agent", "private-deployment", "evaluation-first"].includes(mutation.path)) throw new MutationError("invalid_reaction", 400);
          return reactToRecommendation(session, mutation.participantId, mutation.path);
        case "heartbeat":
          requireParticipant(session.participants, mutation.participantId, mutation.participantToken);
          return heartbeatParticipant(session, mutation.participantId);
        case "presenter":
          if (!studioTokenMatches(mutation.presenterToken, row.presenter_token_hash)) throw new MutationError("presenter_authorization_failed", 403);
          return applyPresenterCommand(session, mutation.command);
        default:
          throw new MutationError("unsupported_mutation", 400);
      }
    });
    if (!updated) return errorResponse("session_not_found_or_expired", 404);
    return NextResponse.json({
      mode: "supabase",
      session: mutation.type === "presenter" ? sanitizeStudioSession(updated.snapshot) : sanitizeParticipantStudioSession(updated.snapshot),
      ...(participantToken ? { participantToken, participantId } : {}),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof MutationError) return errorResponse(error.code, error.status);
    if (mutation.type === "presenter" && mutation.command.kind === "generate_brief") logStudioEvent("summary_generation_error", { code, reason: safeReason(error) });
    else logStudioEvent("participant_connection_failure", { code, reason: safeReason(error), mode: "supabase" });
    return errorResponse("session_mutation_failed", 503);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const code = normalizeCode((await context.params).code);
  if (!code) return errorResponse("invalid_session_code", 400);
  if (studioBackendMode() !== "supabase") return errorResponse("local_demo_mutations_are_browser_local", 409);
  try {
    const row = await getStoredSession(code);
    if (!row) return errorResponse("session_not_found_or_expired", 404);
    const body = await request.json().catch(() => ({})) as { presenterToken?: string };
    if (!body.presenterToken || !studioTokenMatches(body.presenterToken, row.presenter_token_hash)) return errorResponse("presenter_authorization_failed", 403);
    await deleteStoredSession(code);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(safeReason(error) === "presenter_authorization_failed" ? "presenter_authorization_failed" : "session_delete_failed", 503);
  }
}

class MutationError extends Error {
  constructor(public code: string, public status: number) { super(code); }
}

function findAuthorizedParticipant(participants: StudioParticipant[], participantId?: string, token?: string) {
  if (!participantId || !token) return null;
  const participant = participants.find((item) => item.id === participantId);
  return participant?.tokenHash && studioTokenMatches(token, participant.tokenHash) ? participant : null;
}

function requireParticipant(participants: StudioParticipant[], participantId: string, token: string) {
  const participant = findAuthorizedParticipant(participants, participantId, token);
  if (!participant) throw new MutationError("participant_authorization_failed", 403);
  return participant;
}

function validateAnswerValue(questionId: string, value: StudioAnswerValue): StudioAnswerValue {
  const question = getQuestion(questionId);
  if (!question) throw new MutationError("unknown_question", 400);
  if (question.kind === "multi") {
    if (!Array.isArray(value) || value.length > 20 || value.some((item) => typeof item !== "string" || item.length > 80)) throw new MutationError("invalid_answer", 400);
    return [...new Set(value)].slice(0, 20);
  }
  if (question.kind === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new MutationError("invalid_answer", 400);
    return value;
  }
  if (typeof value !== "string") throw new MutationError("invalid_answer", 400);
  const trimmed = value.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, question.kind === "text" ? 320 : 80);
  if (!trimmed) throw new MutationError("empty_answer", 400);
  return trimmed;
}

function normalizeCode(code: string) {
  const normalized = code.toUpperCase().replace(/[^A-Z2-9]/g, "");
  return normalized.length === 6 ? normalized : "";
}

function errorResponse(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });
}

function safeReason(error: unknown) {
  return error instanceof Error ? error.message.split(":")[0] : "unknown";
}
