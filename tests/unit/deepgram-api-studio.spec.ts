import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  cleanupMediaResources,
  EMPTY_SOCKET_STATE,
  isApiStudioTranscriptEvent,
  readApiStudioSocketEventLabel,
  reduceApiStudioSocketEvent,
} from "@/lib/api-studio/websocket-events";
import { resolveBrowserRealtimeSocketUrl } from "@/components/api-studio/BrowserRealtimeSession";
import { buildApiStudioDefaultValues } from "@/components/api-studio/ExecutableApiStudio";
import { CURATED_PRERECORDED_SAMPLES } from "@/lib/deepgram-samples";
import { generateDeepgramCodeSnippets } from "@/lib/deepgram-codegen";
import { DEEPGRAM_ENDPOINT_REGISTRY, getDeepgramEndpoint, resolveDeepgramPath, validateRegistry } from "@/lib/deepgram-endpoint-registry";
import { DeepgramPolicyError, prepareDeepgramRequest, sanitizeForBrowser } from "@/lib/deepgram-request-policy";
import type { DeepgramExecuteInput } from "@/types/deepgram-endpoint-registry";

test.describe("Deepgram endpoint registry", () => {
  test("is complete, unique, official-source linked, and internally valid", () => {
    expect(DEEPGRAM_ENDPOINT_REGISTRY).toHaveLength(51);
    expect(new Set(DEEPGRAM_ENDPOINT_REGISTRY.map((endpoint) => endpoint.id)).size).toBe(DEEPGRAM_ENDPOINT_REGISTRY.length);
    expect(validateRegistry()).toEqual([]);
    expect(new Set(DEEPGRAM_ENDPOINT_REGISTRY.map((endpoint) => endpoint.family))).toEqual(new Set([
      "Speech to Text", "Text to Speech", "Intelligence", "Voice Agent", "Authentication", "Models",
      "Projects", "Requests", "Usage", "Billing", "Administration",
    ]));
    expect(new Set(DEEPGRAM_ENDPOINT_REGISTRY.map((endpoint) => endpoint.testedStatus))).toEqual(new Set([
      "fixture-verified",
      "manual-verification-required",
      "locked-by-design",
    ]));
  });

  test("validates the generated coverage document against every registry ID", () => {
    const coverage = readFileSync(resolve(process.cwd(), "docs/API_ENDPOINT_COVERAGE.md"), "utf8");
    const documentedIds = [...coverage.matchAll(/^\| `([^`]+)`/gm)].map((match) => match[1]);
    expect(documentedIds).toEqual(DEEPGRAM_ENDPOINT_REGISTRY.map((endpoint) => endpoint.id));
  });

  test("resolves path templates and rejects unsafe identifiers", () => {
    const endpoint = requiredEndpoint("requests-get");
    expect(resolveDeepgramPath(endpoint, { project_id: "project-123", request_id: "request_456" })).toEqual({
      path: "/v1/projects/project-123/requests/request_456",
      issues: [],
    });
    expect(resolveDeepgramPath(endpoint, { project_id: "../escape", request_id: "" }).issues).toHaveLength(2);
  });
});

test.describe("allowlisted execution policy", () => {
  test("rejects unknown endpoints, method changes, host overrides, and unsupported parameters", () => {
    expectPolicyCode({ endpointId: "not-real" }, "unknown_endpoint");
    expectPolicyCode({ endpointId: "projects-list", expectedMethod: "POST" }, "method_not_allowed");
    expectPolicyCode({ endpointId: "projects-list", host: "evil.example" } as unknown as DeepgramExecuteInput, "host_override_rejected");
    expectPolicyCode({ endpointId: "projects-list", query: { redirect: "https://evil.example" } }, "unsupported_parameter");
  });

  test("constructs a fixed global URL and validates request data", () => {
    const prepared = prepareDeepgramRequest({
      endpointId: "text-intelligence",
      expectedMethod: "POST",
      region: "global",
      query: { language: "en", summarize: true },
      body: { text: "A short fixture sentence." },
    });
    expect(prepared.url.host).toBe("api.deepgram.com");
    expect(prepared.url.pathname).toBe("/v1/read");
    expect(prepared.effective.headers.Authorization).toBe("Configured (server only)");
    expectPolicyCode({ endpointId: "text-intelligence", body: {} }, "validation_failed");
  });

  test("locks every mutation, even after advanced confirmation", () => {
    const endpoint = requiredEndpoint("keys-delete");
    expectPolicyCode({ endpointId: endpoint.id, path: { project_id: "project", key_id: "key" } }, "advanced_mode_required");
    expectPolicyCode({ endpointId: endpoint.id, path: { project_id: "project", key_id: "key" }, advancedAdministrationMode: true, confirmation: endpoint.confirmationPhrase }, "mutation_locked");
  });

  test("redacts permanent and temporary credentials recursively", () => {
    expect(sanitizeForBrowser({ Authorization: "Token permanent", nested: { access_token: "jwt", api_key: "secret" }, message: "upstream echoed permanent-secret-value", safe: "value" }, ["permanent-secret-value"])).toEqual({
      Authorization: "***redacted***",
      nested: { access_token: "***redacted***", api_key: "***redacted***" },
      message: "upstream echoed ***redacted***",
      safe: "value",
    });
  });
});

test.describe("API Studio technical-evidence prefill", () => {
  test("merges only registry-declared non-header, non-binary values and redacts nested credentials", () => {
    const values = buildApiStudioDefaultValues({
      operationId: "agent-configurations-create",
      explanation: "Fixture handoff; do not execute.",
      values: {
        project_id: "project-fixture",
        config: "{}",
        metadata: { prompt: "fixture", api_key: "not-for-browser" },
        authorization: "Token this-must-not-transfer",
        redirect: "https://example.test",
        audio: "binary-must-not-transfer",
      },
    });

    expect(values["agent-configurations-create"]).toMatchObject({
      project_id: "project-fixture",
      config: "{}",
      metadata: { prompt: "fixture", api_key: "[REDACTED]" },
    });
    expect(values["agent-configurations-create"]).not.toHaveProperty("authorization");
    expect(values["agent-configurations-create"]).not.toHaveProperty("redirect");
    expect(values["agent-configurations-create"]).not.toHaveProperty("audio");
  });

  test("preserves the existing prerecorded model, language, and redaction caller", () => {
    const values = buildApiStudioDefaultValues({
      operationId: "stt-prerecorded",
      model: "nova-3",
      language: "en",
      redact: ["pii"],
      explanation: "Existing redaction handoff.",
    });
    expect(values["stt-prerecorded"]).toMatchObject({ model: "nova-3", language: "en", redact: ["pii"] });
  });

  test("forces the curated prerecorded URL when API Studio runs in Open Lab mode", () => {
    const values = buildApiStudioDefaultValues({
      operationId: "stt-prerecorded",
      explanation: "Untrusted prefill must not reopen custom URL execution.",
      values: { url: "https://media.example.com/untrusted-long-recording.mp3" },
    }, true);

    expect(values["stt-prerecorded"].url).toBe(CURATED_PRERECORDED_SAMPLES[0].sampleUrl);
  });
});

test("generates cURL, Python, TypeScript, Go, and .NET without a credential value", () => {
  const endpoint = requiredEndpoint("tts-rest");
  const prepared = prepareDeepgramRequest({ endpointId: endpoint.id, query: { model: "aura-2-thalia-en", encoding: "mp3" }, body: { text: "Fixture only" } });
  const snippets = generateDeepgramCodeSnippets(endpoint, prepared.effective);
  expect(Object.keys(snippets).sort()).toEqual([".NET", "Go", "Python", "TypeScript", "curl"].sort());
  expect(snippets.curl).toContain("$DEEPGRAM_API_KEY");
  expect(snippets.Python).toContain("write_bytes(response.content)");
  expect(snippets.TypeScript).toContain("response.arrayBuffer()");
  expect(snippets.Go).toContain("io.Copy");
  expect(snippets[".NET"]).toContain("ReadAsByteArrayAsync");
  expect(Object.values(snippets).join("\n")).not.toContain("Token abcdef");
});

test("reduces recorded synthetic WebSocket events without inventing fields", () => {
  const events = [
    { type: "Welcome" },
    { type: "ConfigureSuccess" },
    { type: "Results", channel: { alternatives: [{ transcript: "hello fixture" }] } },
    { type: "TurnInfo", event: "EndOfTurn" },
    { type: "Error", description: "synthetic failure" },
  ];
  const state = events.reduce(reduceApiStudioSocketEvent, EMPTY_SOCKET_STATE);
  expect(state.connected).toBe(true);
  expect(state.configured).toBe(true);
  expect(state.transcript).toBe("hello fixture");
  expect(state.turnEvents).toHaveLength(1);
  expect(state.errors).toEqual(["synthetic failure"]);
  expect(state.rawEvents).toEqual(events);
});

test("recognizes Flux TurnInfo names and transcripts without clearing the last transcript", () => {
  const start = { type: "TurnInfo", event: "StartOfTurn", transcript: "hello from Flux" };
  const eager = { type: "TurnInfo", event: "EagerEndOfTurn", transcript: "hello from Flux" };
  const resumed = { type: "TurnInfo", event: "TurnResumed", transcript: "" };
  const end = { type: "TurnInfo", event: "EndOfTurn", transcript: "hello from Flux again" };
  const state = [start, eager, resumed, end].reduce(reduceApiStudioSocketEvent, EMPTY_SOCKET_STATE);

  expect(state.turnEvents).toEqual([start, eager, resumed, end]);
  expect(state.transcript).toBe("hello from Flux again");
  expect(readApiStudioSocketEventLabel(start)).toBe("StartOfTurn");
  expect(readApiStudioSocketEventLabel(end)).toBe("EndOfTurn");
  expect(isApiStudioTranscriptEvent(start)).toBe(true);
  expect(isApiStudioTranscriptEvent(resumed)).toBe(false);
});

test("accepts only the v2 conversational path for Flux browser sessions", () => {
  const valid = "wss://api.deepgram.com/v2/listen?model=flux-general-en";
  const voiceAgent = "wss://agent.deepgram.com/v1/agent/converse";
  expect(resolveBrowserRealtimeSocketUrl("stt-flux", valid)).toBe(valid);
  expect(() => resolveBrowserRealtimeSocketUrl("stt-flux", "wss://api.deepgram.com/v1/listen?model=flux-general-en"))
    .toThrow("require WSS /v2/listen");
  expect(() => resolveBrowserRealtimeSocketUrl("stt-flux", "https://api.deepgram.com/v2/listen?model=flux-general-en"))
    .toThrow("require WSS /v2/listen");
  expect(() => resolveBrowserRealtimeSocketUrl("stt-flux", "wss://example.test/v2/listen?model=flux-general-en"))
    .toThrow("require WSS /v2/listen");
  expect(resolveBrowserRealtimeSocketUrl("voice-agent-converse", voiceAgent)).toBe(voiceAgent);
});

test("cleans up recorder, microphone tracks, and WebSocket explicitly", () => {
  let recorderStopped = 0;
  let tracksStopped = 0;
  let socketClosed = 0;
  cleanupMediaResources({
    recorder: { state: "recording", stop: () => { recorderStopped += 1; } } as MediaRecorder,
    stream: { getTracks: () => [{ stop: () => { tracksStopped += 1; } }, { stop: () => { tracksStopped += 1; } }] } as unknown as MediaStream,
    socket: { readyState: 1, close: () => { socketClosed += 1; } } as unknown as WebSocket,
  });
  expect({ recorderStopped, tracksStopped, socketClosed }).toEqual({ recorderStopped: 1, tracksStopped: 2, socketClosed: 1 });
});

function requiredEndpoint(id: string) {
  const endpoint = getDeepgramEndpoint(id);
  if (!endpoint) throw new Error(`Missing endpoint fixture: ${id}`);
  return endpoint;
}

function expectPolicyCode(input: DeepgramExecuteInput, code: string) {
  try {
    prepareDeepgramRequest(input);
    throw new Error("Expected policy rejection.");
  } catch (error) {
    expect(error).toBeInstanceOf(DeepgramPolicyError);
    expect((error as DeepgramPolicyError).code).toBe(code);
  }
}
