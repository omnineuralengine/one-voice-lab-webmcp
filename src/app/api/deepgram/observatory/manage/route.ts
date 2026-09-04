import { checkLabAccess, labAccessResponse } from "@/lib/access/lab-access";
import { ObservatoryManageError, runReadonlyManageAction } from "@/lib/deepgram-manage-readonly";
import { readBoundedRequestText, RequestBodyTooLargeError } from "@/lib/http/bounded-body";
import { buildApiDebugEnvelope, buildInspectorRecord, createTimelineEvent, nowIso } from "@/lib/inspection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Input = Parameters<typeof runReadonlyManageAction>[0];
const MAX_REQUEST_BYTES = 4_096;

export async function POST(request: Request) {
  const startedAt = nowIso();
  let input = { action: "resolve-project" } as Input;
  try {
    input = await readInput(request);
    if (!["resolve-project", "get-request-cost", "get-balances", "usage-breakdown"].includes(input.action)) throw new ObservatoryManageError("Unsupported read-only Management action.", 400, "unsupported_action");
    const access = await checkLabAccess(request, "provider_catalog", {
      providerId: "deepgram",
      endpointId: "deepgram:observatory-manage",
      minimumTier: process.env.NODE_ENV === "production" ? "admin" : "guest",
      actorIntent: "human",
    });
    if (!access.allowed) return labAccessResponse(access);
    const result = await runReadonlyManageAction(input);
    const completedAt = nowIso();
    const inspector = buildInspectorRecord({
      module: "Live Observatory / Read-only Management",
      startedAt,
      completedAt,
      request: { method: "GET", endpoint: managementEndpointPreview(input), headers: { Authorization: "Token server-side-key" }, bodyPreview: { action: input.action, requestId: input.requestId, projectHandle: input.projectHandle ? "temporary-local-handle" : undefined } },
      response: { status: 200, bodyPreview: result },
      timeline: [createTimelineEvent({ type: "manage.read", label: "Read-only Management response received", data: { action: input.action, state: result.state } })],
      notes: ["This route performs documented GET-only Management operations.", "Project IDs and account-sensitive response fields are not returned to the browser.", "No project, key, member, permission, or balance mutation is implemented."],
    });
    return Response.json(buildApiDebugEnvelope({ ok: true, data: result, inspector }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const known = error instanceof ObservatoryManageError ? error : new ObservatoryManageError("Unexpected read-only Management error.", 500, "unexpected_error");
    const status = known.status;
    const completedAt = nowIso();
    const scopeUnavailable = known.code === "management_scope_unavailable";
    const result = { state: scopeUnavailable ? "Management scope unavailable" : "Unavailable", reportedAt: completedAt, note: known.message };
    const inspector = buildInspectorRecord({ module: "Live Observatory / Read-only Management", startedAt, completedAt, request: { method: "GET", endpoint: managementEndpointPreview(input), headers: { Authorization: "Token server-side-key" }, bodyPreview: { action: input.action, requestId: input.requestId, projectHandle: input.projectHandle ? "temporary-local-handle" : undefined } }, response: { status, bodyPreview: result }, timeline: [createTimelineEvent({ type: "manage.error", label: known.message, data: { code: known.code } })], notes: ["Management permission failures are expected to degrade safely.", "The route does not retry or attempt any write operation."] });
    return Response.json(buildApiDebugEnvelope({ ok: false, data: result, error: { message: known.message, code: known.code }, inspector }), { status, headers: { "Cache-Control": "no-store" } });
  }
}

async function readInput(request: Request): Promise<Input> {
  try {
    const text = await readBoundedRequestText(request, MAX_REQUEST_BYTES);
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid object");
    return parsed as Input;
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      throw new ObservatoryManageError("Management requests are limited to 4 KB.", 413, "request_too_large");
    }
    throw new ObservatoryManageError("Send a valid Management request object.", 400, "invalid_request");
  }
}

function managementEndpointPreview(input: Input) {
  const base = "https://api.deepgram.com/v1/projects";
  if (input.action === "resolve-project") return base;
  if (input.action === "get-request-cost") return `${base}/SERVER_PROJECT_ID/requests/${input.requestId || "REQUEST_ID"}`;
  if (input.action === "get-balances") return `${base}/SERVER_PROJECT_ID/balances`;
  return `${base}/SERVER_PROJECT_ID/usage/breakdown`;
}
