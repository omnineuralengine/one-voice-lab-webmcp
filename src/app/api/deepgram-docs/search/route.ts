import "server-only";
import { deriveLabClientIdentity } from "@/lib/access/client-identity";
import { RemoteDeepgramDocsProvider } from "@/lib/deepgram-docs-provider";
import { readBoundedRequestText, RequestBodyTooLargeError } from "@/lib/http/bounded-body";
import { buildTechnicalDocsQuery, type DocsSearchInput } from "@/lib/live-solution-docs";
import { SOLUTION_LANES } from "@/types/live-solution-studio";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
const attempts = new Map<string, number[]>(); const SAFE_HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const MAX_REQUEST_BYTES = 16 * 1_024;

export async function POST(request: Request) {
  const key = deriveLabClientIdentity(request).clientHash; const now = Date.now(); const recent = (attempts.get(key) ?? []).filter((time) => now - time < 60_000); if (recent.length >= 6) return Response.json({ error: "Please wait before searching official docs again." }, { status: 429, headers: SAFE_HEADERS }); attempts.set(key, [...recent, now]);
  let body: unknown;
  try { body = JSON.parse(await readBoundedRequestText(request, MAX_REQUEST_BYTES)) as unknown; }
  catch (error) {
    const message = error instanceof RequestBodyTooLargeError ? "Documentation-search requests are limited to 16 KB." : "Invalid JSON body.";
    return Response.json({ error: message }, { status: error instanceof RequestBodyTooLargeError ? 413 : 400, headers: SAFE_HEADERS });
  }
  const input = validateInput(body); if (!input) return Response.json({ error: "Invalid or oversized documentation-search input." }, { status: 400, headers: SAFE_HEADERS });
  const result = await new RemoteDeepgramDocsProvider().search(input); return Response.json(result, { headers: SAFE_HEADERS });
}

function validateInput(value: unknown): DocsSearchInput | null { if (!value || typeof value !== "object") return null; const v = value as Record<string, unknown>; if (typeof v.confirmedProblem !== "string" || v.confirmedProblem.length < 3 || v.confirmedProblem.length > 2_000 || !Array.isArray(v.lanes) || v.lanes.some((lane) => !SOLUTION_LANES.includes(lane as never)) || !v.stack || typeof v.stack !== "object" || !Array.isArray(v.constraints) || v.constraints.some((x) => typeof x !== "string" || x.length > 300) || typeof v.desiredOutcome !== "string" || v.desiredOutcome.length > 500) return null; const input = { confirmedProblem: v.confirmedProblem, lanes: v.lanes, stack: v.stack, constraints: v.constraints, desiredOutcome: v.desiredOutcome } as DocsSearchInput; return buildTechnicalDocsQuery(input).length <= 2_500 ? input : null; }
