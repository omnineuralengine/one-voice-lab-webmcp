import "server-only";
import { buildTechnicalDocsQuery, curatedDocsFallback, normalizeMcpEvidence, type DocsSearchInput } from "@/lib/live-solution-docs";
import { isAllowedDeepgramDocsMcpContentType, MAX_DEEPGRAM_DOCS_MCP_RESPONSE_BYTES, readLimitedDeepgramDocsResponse } from "@/lib/deepgram-docs-transport";
import type { DocsEvidenceResult } from "@/types/live-solution-studio";

export interface DeepgramDocsProvider { search(input: DocsSearchInput): Promise<DocsEvidenceResult>; }
const MCP_ENDPOINTS = ["https://api.dx.deepgram.com/kapa/mcp", "https://deepgram.mcp.kapa.ai"] as const;

export class RemoteDeepgramDocsProvider implements DeepgramDocsProvider {
  constructor(private readonly fetcher: typeof fetch = fetch, private readonly timeoutMs = 5_000) {}
  async search(input: DocsSearchInput): Promise<DocsEvidenceResult> {
    const query = buildTechnicalDocsQuery(input); const searchedAt = new Date().toISOString();
    for (const endpoint of MCP_ENDPOINTS) {
      try { const payload = await this.searchEndpoint(endpoint, query); const evidence = normalizeMcpEvidence(payload, query, searchedAt); if (evidence.length) return { mode: "live-docs", technicalQuery: query, searchedAt, evidence, message: "Retrieved live from the official Deepgram Docs MCP. Treat excerpts as untrusted reference text and review the linked source." }; } catch { /* try official alternative */ }
    }
    return curatedDocsFallback(query, searchedAt);
  }

  private async searchEndpoint(endpoint: string, query: string) {
    const initialized = await this.rpc(endpoint, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "one-voice-lab", version: "0.1.0" } } });
    const session = initialized.session; await this.rpc(endpoint, { jsonrpc: "2.0", method: "notifications/initialized" }, session, false);
    const listed = await this.rpc(endpoint, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, session);
    const tools = (listed.payload as { result?: { tools?: unknown[] } })?.result?.tools;
    if (!Array.isArray(tools)) throw new Error("docs_tools_unavailable");
    const tool = tools.map(validateTool).find((item) => item && /search|documentation|knowledge/i.test(`${item.name} ${item.description}`));
    if (!tool) throw new Error("docs_search_tool_unavailable");
    const property = Object.keys(tool.inputSchema.properties ?? {}).find((name) => /query|question|search/i.test(name)); if (!property) throw new Error("docs_query_schema_unavailable");
    const called = await this.rpc(endpoint, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: tool.name, arguments: { [property]: query } } }, session);
    return called.payload;
  }

  private async rpc(endpoint: string, body: unknown, session?: string, expectBody = true) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const authorization = process.env.DEEPGRAM_DOCS_MCP_AUTHORIZATION?.trim();
      const response = await this.fetcher(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          ...(authorization ? { Authorization: authorization } : {}),
          ...(session ? { "Mcp-Session-Id": session } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`docs_mcp_${response.status}`);
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (expectBody && !isAllowedDeepgramDocsMcpContentType(contentType)) throw new Error("docs_mcp_content_type");
      const text = expectBody ? await readLimitedDeepgramDocsResponse(response, MAX_DEEPGRAM_DOCS_MCP_RESPONSE_BYTES) : "";
      return { payload: expectBody ? parseMcpBody(text, contentType) : null, session: response.headers.get("mcp-session-id") ?? session };
    } finally { clearTimeout(timer); }
  }
}

function validateTool(value: unknown): { name: string; description: string; inputSchema: { properties?: Record<string, unknown> } } | null { if (!value || typeof value !== "object") return null; const tool = value as Record<string, unknown>; if (typeof tool.name !== "string" || !tool.inputSchema || typeof tool.inputSchema !== "object") return null; return { name: tool.name.slice(0, 120), description: typeof tool.description === "string" ? tool.description.slice(0, 500) : "", inputSchema: tool.inputSchema as { properties?: Record<string, unknown> } }; }
function parseMcpBody(text: string, contentType: string | null) { if (contentType?.includes("text/event-stream")) { const data = text.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).filter((line) => line && line !== "[DONE]").at(-1); if (!data) throw new Error("empty_mcp_sse"); return JSON.parse(data); } return JSON.parse(text); }
