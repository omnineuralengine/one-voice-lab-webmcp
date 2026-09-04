import { expect, test } from "@playwright/test";

import {
  isAllowedDeepgramDocsMcpContentType,
  MAX_DEEPGRAM_DOCS_MCP_RESPONSE_BYTES,
  readLimitedDeepgramDocsResponse,
} from "@/lib/deepgram-docs-transport";

test.describe("Deepgram Docs MCP transport boundary", () => {
  test("accepts only JSON or event-stream responses", () => {
    expect(isAllowedDeepgramDocsMcpContentType("application/json; charset=utf-8")).toBe(true);
    expect(isAllowedDeepgramDocsMcpContentType("text/event-stream")).toBe(true);
    expect(isAllowedDeepgramDocsMcpContentType("text/html")).toBe(false);
    expect(isAllowedDeepgramDocsMcpContentType(null)).toBe(false);
  });

  test("caps declared and streamed response bodies", async () => {
    await expect(readLimitedDeepgramDocsResponse(new Response("{}", { headers: { "content-length": String(MAX_DEEPGRAM_DOCS_MCP_RESPONSE_BYTES + 1) } }))).rejects.toThrow("docs_mcp_response_too_large");
    await expect(readLimitedDeepgramDocsResponse(new Response("123456"), 5)).rejects.toThrow("docs_mcp_response_too_large");
    await expect(readLimitedDeepgramDocsResponse(new Response("fixture"), 20)).resolves.toBe("fixture");
  });
});
