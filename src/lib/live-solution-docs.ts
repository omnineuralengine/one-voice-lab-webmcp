import type { ContextField, DocsEvidenceItem, DocsEvidenceResult, SolutionLane } from "@/types/live-solution-studio";
import type { StackAdapterInput } from "@/types/questline";

export const DOCS_INPUT_LIMIT = 2_500;
export const OFFICIAL_DEEPGRAM_DOC_HOSTS = new Set(["developers.deepgram.com", "deepgram.com"]);

export type DocsSearchInput = { confirmedProblem: string; lanes: SolutionLane[]; stack: Partial<StackAdapterInput>; constraints: string[]; desiredOutcome: string };

export function redactTechnicalInput(value: string) {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email removed]")
    .replace(/https?:\/\/\S+/gi, "[URL removed]")
    .replace(/\b(?:sk|dg|sb_secret)_[A-Za-z0-9_-]{12,}\b/g, "[credential removed]")
    .replace(/\b(?:Bearer|Token)\s+[A-Za-z0-9._-]{12,}\b/gi, "[credential removed]")
    .replace(/\b(?:account|project|customer)[-_ ]?id\s*[:=]\s*[A-Za-z0-9_-]+/gi, "$1 identifier [removed]")
    .replace(/\b(?:customer|facilitator|speaker|participant|contact)\s+(?:is|named|called|:)\s*[A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+){0,2}/giu, "$1 [name removed]")
    .replace(/\b[A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+){0,2}\s+(?=(?:needs?|wants?|asks?|uses?|requires?|said|says)\b)/gu, "[name removed] ")
    .replace(/^\s*(?:\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*)?(?:speaker\s*\d+|facilitator|customer|participant)\s*[:>-].*$/gim, "")
    .replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, DOCS_INPUT_LIMIT);
}

export function buildTechnicalDocsQuery(input: DocsSearchInput) {
  const problem = redactTechnicalInput(input.confirmedProblem);
  const stackEntries = Object.entries(input.stack).filter(([, value]) => String(value ?? "").trim() && !/unknown/i.test(String(value))).map(([key, value]) => `${key}: ${redactTechnicalInput(String(value))}`).slice(0, 8);
  const constraints = input.constraints.map(redactTechnicalInput).filter(Boolean).slice(0, 8);
  return [
    "Find current official Deepgram documentation that supports a field-engineering recommendation for this technical problem.",
    `Problem: ${problem}`,
    input.desiredOutcome ? `Desired outcome: ${redactTechnicalInput(input.desiredOutcome)}` : "",
    input.lanes.length ? `Workload lanes: ${input.lanes.join(", ")}` : "",
    stackEntries.length ? `Confirmed stack: ${stackEntries.join("; ")}` : "",
    constraints.length ? `Confirmed constraints: ${constraints.join("; ")}` : "",
    "Return only directly relevant Deepgram documentation with official source URLs and concise supported technical claims.",
  ].filter(Boolean).join("\n").slice(0, DOCS_INPUT_LIMIT);
}

export function isOfficialDeepgramDocsUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "https:" && OFFICIAL_DEEPGRAM_DOC_HOSTS.has(url.hostname) && (url.hostname === "developers.deepgram.com" || url.pathname.startsWith("/learn/")); } catch { return false; }
}

const CURATED = [
  ["Live streaming speech-to-text", "https://developers.deepgram.com/docs/live-streaming-audio", "Streaming audio uses a documented realtime connection and transcript event lifecycle.", "Use for realtime transcription transport and lifecycle decisions.", /stream|realtime|websocket|live/i],
  ["End-of-speech detection", "https://developers.deepgram.com/docs/understanding-end-of-speech-detection", "Endpointing and UtteranceEnd are distinct heuristics with different event behavior.", "Supports finalization, silence, and turn-boundary planning.", /endpoint|utterance|silence|turn|agent/i],
  ["Prerecorded audio", "https://developers.deepgram.com/docs/pre-recorded-audio", "Prerecorded transcription accepts complete audio through a bounded request path.", "Use when immediate interim results are unnecessary.", /record|batch|file|upload|url/i],
  ["Models and languages", "https://developers.deepgram.com/docs/models-languages-overview", "Model and language compatibility must be verified against the current support matrix.", "Supports language/model selection without inventing compatibility.", /language|multilingual|model|accuracy|nova|flux/i],
  ["Authentication", "https://developers.deepgram.com/docs/authenticating", "Permanent credentials belong in trusted service environments rather than browser bundles.", "Supports the client/server credential boundary.", /browser|auth|token|key|security|next|react/i],
  ["Temporary token authentication", "https://developers.deepgram.com/reference/auth/tokens/grant", "Temporary grants provide a bounded browser credential path for supported realtime flows.", "Supports browser realtime authentication design.", /browser|token|websocket|realtime/i],
  ["Working with concurrency rate limits", "https://developers.deepgram.com/docs/working-with-concurrency-rate-limits", "Concurrency limits require admission control and explicit 429 handling.", "Supports scaling, overload, and recovery planning.", /concurr|scale|429|rate|load/i],
  ["Voice Agent API", "https://developers.deepgram.com/docs/voice-agent", "The Voice Agent API provides a managed conversational session boundary.", "Use for voice-agent and turn-taking architecture comparison.", /voice agent|conversation|turn|barge/i],
  ["Text to speech", "https://developers.deepgram.com/docs/text-to-speech", "Deepgram text-to-speech returns streamed audio from documented Speak endpoints.", "Supports spoken-output implementation decisions.", /tts|text.to.speech|speak|voice output/i],
] as const;

export function curatedDocsFallback(query: string, now = new Date().toISOString()): DocsEvidenceResult {
  const selected = CURATED.filter((entry) => entry[4].test(query)).slice(0, 5);
  const entries = selected.length ? selected : CURATED.slice(0, 3);
  return { mode: "curated-fallback", technicalQuery: query, searchedAt: now, message: "Live Docs MCP was unavailable. These references come from the Lab's curated official registry and are not a fresh search.", evidence: entries.map(([title, officialUrl, supportedClaim, whyItMatters], index) => ({ id: `curated-${index}-${safeEvidenceId(title)}`, title, officialUrl, summary: supportedClaim, supportedClaim, whyItMatters, queryUsed: query, retrievedAt: now, sourceType: "curated-registry", verificationState: "curated-last-verified" })) };
}

export function normalizeMcpEvidence(payload: unknown, query: string, now = new Date().toISOString()): DocsEvidenceItem[] {
  const strings = collectStrings(payload).join("\n").slice(0, 30_000);
  const urls = [...new Set(strings.match(/https:\/\/[^\s)\]}>"']+/g) ?? [])].map((url) => url.replace(/[.,;:]$/, "")).filter(isOfficialDeepgramDocsUrl).slice(0, 6);
  return urls.map((officialUrl, index) => {
    const around = excerptAround(strings, officialUrl); const title = inferTitle(around, officialUrl);
    return { id: `live-${index}-${safeEvidenceId(officialUrl)}`, title, officialUrl, summary: cleanReferenceText(around, 420), whyItMatters: "This official source was retrieved for the confirmed problem and should be reviewed before sharing the recommendation.", supportedClaim: cleanReferenceText(around, 240), queryUsed: query, retrievedAt: now, sourceType: "deepgram-docs-mcp", verificationState: "live-retrieved" };
  });
}

function collectStrings(value: unknown, depth = 0): string[] { if (depth > 8) return []; if (typeof value === "string") return [value]; if (Array.isArray(value)) return value.flatMap((v) => collectStrings(v, depth + 1)); if (value && typeof value === "object") return Object.values(value).flatMap((v) => collectStrings(v, depth + 1)); return []; }
function excerptAround(text: string, url: string) { const index = text.indexOf(url); return text.slice(Math.max(0, index - 360), Math.min(text.length, index + url.length + 360)); }
function cleanReferenceText(text: string, max: number) { return text.replace(/<[^>]+>/g, " ").replace(/(?:ignore|override|system prompt|developer message)[^.!?]{0,160}/gi, "[untrusted instruction removed]").replace(/https:\/\/\S+/g, "").replace(/\s+/g, " ").trim().slice(0, max) || "Review the linked official documentation for the supported claim."; }
function inferTitle(text: string, url: string) { const markdown = text.match(/#{1,4}\s+([^\n]{3,100})/)?.[1]; if (markdown) return cleanReferenceText(markdown, 100); return new URL(url).pathname.split("/").filter(Boolean).at(-1)?.replaceAll("-", " ") ?? "Deepgram documentation"; }
function safeEvidenceId(value: string) { let hash = 2166136261; for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(36); }

export function docsSearchInputFromProblem(problem: string, lanes: SolutionLane[], context: ContextField[], stack: StackAdapterInput): DocsSearchInput { return { confirmedProblem: problem, lanes, stack, constraints: context.filter((f) => f.value && ["latency", "accuracy", "security", "deployment", "scale", "noise"].includes(f.id)).map((f) => `${f.label}: ${f.value}`), desiredOutcome: context.find((f) => f.id === "outcome")?.value ?? "" }; }
