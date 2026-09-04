import "server-only";

import type { ObservatoryManagementResult } from "@/types/observatory";
import { assertOpenLabDeepgramEnabled, isOpenLabMode, OpenLabDeepgramDisabledError } from "@/lib/open-lab";
import {
  MAX_PROVIDER_JSON_RESPONSE_BYTES,
  ProviderResponseBodyError,
  readBoundedProviderJson,
} from "@/lib/providers/upstream-response";

const BASE = "https://api.deepgram.com/v1";
const handles = new Map<string, { projectId: string; name: string; createdAt: number }>();

export class ObservatoryManageError extends Error {
  constructor(message: string, public status: number, public code: string) { super(message); this.name = "ObservatoryManageError"; }
}

export async function runReadonlyManageAction(input: {
  action: "resolve-project" | "get-request-cost" | "get-balances" | "usage-breakdown";
  projectHandle?: string;
  requestId?: string;
}): Promise<ObservatoryManagementResult> {
  if (isOpenLabMode()) {
    throw new ObservatoryManageError(
      "Read-only account and Management data is unavailable in the public Open Lab.",
      403,
      "open_lab_account_data_locked",
    );
  }
  try {
    assertOpenLabDeepgramEnabled();
  } catch (error) {
    if (error instanceof OpenLabDeepgramDisabledError) {
      throw new ObservatoryManageError(error.message, error.status, error.code);
    }
    throw error;
  }
  const key = process.env.DEEPGRAM_API_KEY?.trim();
  if (!key) throw new ObservatoryManageError("DEEPGRAM_API_KEY is missing on the local server.", 500, "missing_api_key");
  pruneHandles();

  if (input.action === "resolve-project") {
    const raw = await requestJson(`${BASE}/projects`, key);
    const projects = readArray(raw, "projects");
    if (!projects.length) throw new ObservatoryManageError("No accessible Deepgram project was returned for this API key.", 404, "no_projects");
    const summaries = projects.slice(0, 20).map((project, index) => {
      const projectId = readString(project, "project_id") || readString(project, "id");
      if (!projectId) return null;
      const handle = crypto.randomUUID();
      const name = readString(project, "name") || `Accessible project ${index + 1}`;
      handles.set(handle, { projectId, name, createdAt: Date.now() });
      return { handle, name };
    }).filter((item): item is { handle: string; name: string } => Boolean(item));
    if (!summaries.length) throw new ObservatoryManageError("Accessible projects did not include usable project identifiers.", 502, "invalid_projects_response");
    return { state: "Pending", projects: summaries, projectHandle: summaries[0].handle, projectName: summaries[0].name, reportedAt: new Date().toISOString(), note: "Read-only project access succeeded. Project identifiers remain server-side behind temporary local handles." };
  }

  const project = resolveHandle(input.projectHandle);
  if (input.action === "get-request-cost") {
    const requestId = normalizeRequestId(input.requestId);
    const raw = await requestJson(`${BASE}/projects/${encodeURIComponent(project.projectId)}/requests/${encodeURIComponent(requestId)}`, key, true);
    const details = readRecord(raw, "details");
    const usd = readNumber(details, "usd");
    if (usd === null) return { state: "Pending", projectHandle: input.projectHandle, projectName: project.name, requestId, reportedAt: new Date().toISOString(), note: "Deepgram returned the request record, but documented per-request USD accounting is not available yet." };
    return { state: "Actual cost", projectHandle: input.projectHandle, projectName: project.name, requestId, actualCostUsd: usd, reportedAt: new Date().toISOString(), note: "Actual cost came from the documented request record details.usd field." };
  }

  if (input.action === "get-balances") {
    const raw = await requestJson(`${BASE}/projects/${encodeURIComponent(project.projectId)}/balances`, key);
    const balances = readArray(raw, "balances");
    const first = balances[0];
    const amount = readNumber(first, "amount");
    const units = readString(first, "units") || readString(first, "unit") || "API-reported units";
    return { state: "Unavailable", projectHandle: input.projectHandle, projectName: project.name, balanceAmount: amount ?? undefined, balanceUnit: units, reportedAt: new Date().toISOString(), note: amount === null ? "Balance access succeeded, but no numeric balance was returned." : "This is an API-reported project balance, not a hardcoded or locally calculated credit total." };
  }

  const raw = await requestJson(`${BASE}/projects/${encodeURIComponent(project.projectId)}/usage/breakdown`, key);
  const results = readArray(raw, "results");
  return { state: "Unavailable", projectHandle: input.projectHandle, projectName: project.name, reportedAt: new Date().toISOString(), note: `Read-only usage breakdown returned ${results.length} result row${results.length === 1 ? "" : "s"}. Detailed account metadata is intentionally omitted.` };
}

async function requestJson(url: string, key: string, allowPending = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { method: "GET", headers: { Authorization: `Token ${key}`, Accept: "application/json" }, cache: "no-store", signal: controller.signal });
    if (!response.ok) {
      if (allowPending && response.status === 404) return {};
      if (response.status === 401 || response.status === 403) throw new ObservatoryManageError("The configured key does not have the required read-only Management scope.", response.status, "management_scope_unavailable");
      throw new ObservatoryManageError(`Deepgram Management API returned HTTP ${response.status}.`, response.status, "management_request_failed");
    }
    return await readBoundedProviderJson(response, {
      signal: controller.signal,
      maxBytes: MAX_PROVIDER_JSON_RESPONSE_BYTES,
    });
  } catch (error) {
    if (error instanceof ObservatoryManageError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new ObservatoryManageError("The read-only Management request timed out.", 504, "management_timeout");
    if (error instanceof ProviderResponseBodyError) {
      throw new ObservatoryManageError(
        "The read-only Management API returned a malformed or oversized response.",
        502,
        "management_invalid_response",
      );
    }
    throw new ObservatoryManageError("The local server could not reach the read-only Deepgram Management API.", 502, "management_network_error");
  } finally { clearTimeout(timer); }
}

function resolveHandle(handle?: string) {
  if (!handle) throw new ObservatoryManageError("Resolve an accessible project before requesting usage or cost.", 400, "project_handle_required");
  const project = handles.get(handle);
  if (!project) throw new ObservatoryManageError("The temporary project handle expired. Resolve the project again.", 410, "project_handle_expired");
  return project;
}
function normalizeRequestId(value?: string) {
  const requestId = value?.trim() || "";
  if (!/^[A-Za-z0-9-]{8,128}$/.test(requestId)) throw new ObservatoryManageError("A valid Deepgram request ID is required.", 400, "request_id_required");
  return requestId;
}
function pruneHandles() { const cutoff = Date.now() - 30 * 60 * 1000; for (const [handle, value] of handles) if (value.createdAt < cutoff) handles.delete(handle); }
function readRecord(value: unknown, key: string) { const record = value && typeof value === "object" ? value as Record<string, unknown> : {}; const child = record[key]; return child && typeof child === "object" && !Array.isArray(child) ? child as Record<string, unknown> : {}; }
function readArray(value: unknown, key: string) { const record = value && typeof value === "object" ? value as Record<string, unknown> : {}; return Array.isArray(record[key]) ? record[key] as unknown[] : []; }
function readString(value: unknown, key: string) { return value && typeof value === "object" && typeof (value as Record<string, unknown>)[key] === "string" ? (value as Record<string, string>)[key] : ""; }
function readNumber(value: unknown, key: string) { if (!value || typeof value !== "object") return null; const candidate = (value as Record<string, unknown>)[key]; return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null; }
