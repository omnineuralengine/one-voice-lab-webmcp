import { expect, test } from "@playwright/test";

import {
  monotonicNow,
  ProviderAudioResponseError,
  readTimedAudioResponse,
} from "../../src/lib/providers/audio-response";
import { readBoundedBody } from "../../src/lib/providers/bounded-body";
import {
  ProviderResponseBodyError,
  readBoundedProviderJson,
} from "../../src/lib/providers/upstream-response";

test.describe("bounded provider transports", () => {
  test("cancels JSON and audio bodies rejected by declared Content-Length", async () => {
    let jsonCancelled = false;
    const jsonResponse = streamResponse({
      contentLength: 33,
      cancel: () => { jsonCancelled = true; },
    });
    await expect(readBoundedProviderJson(jsonResponse, { maxBytes: 32 })).rejects.toBeInstanceOf(ProviderResponseBodyError);
    expect(jsonCancelled).toBe(true);
    expect(jsonResponse.body?.locked).toBe(false);

    let audioCancelled = false;
    const audioResponse = streamResponse({
      contentLength: 9,
      cancel: () => { audioCancelled = true; },
    });
    await expect(readTimedAudioResponse(audioResponse, {
      requestStartedAt: monotonicNow(),
      requestTimestamp: "2026-08-26T12:00:00.000Z",
      signal: new AbortController().signal,
      maxBytes: 8,
    })).rejects.toBeInstanceOf(ProviderAudioResponseError);
    expect(audioCancelled).toBe(true);
    expect(audioResponse.body?.locked).toBe(false);
  });

  test("cancels a request body rejected by declared Content-Length without pulling it", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull() {
        // Intentionally pending. The declared size is enough to reject.
      },
      cancel() { cancelled = true; },
    });
    const request = new Request("http://local.test/provider", {
      method: "POST",
      headers: { "content-length": "17" },
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    await expect(readBoundedBody(request, {
      maxBytes: 16,
      providerId: "cartesia",
      operation: "tts",
      message: "Bounded fixture body.",
    })).rejects.toMatchObject({ code: "input_too_large", status: 413 });
    expect(cancelled).toBe(true);
    expect(request.body?.locked).toBe(false);
  });

  test("cancels streamed JSON after the byte cap and never returns partial data", async () => {
    let cancelled = false;
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"safe":'));
        controller.enqueue(new TextEncoder().encode('"too-long"}'));
      },
      cancel() { cancelled = true; },
    }));

    await expect(readBoundedProviderJson(response, { maxBytes: 8 })).rejects.toMatchObject({
      name: "ProviderResponseBodyError",
      message: "The provider response exceeded the bounded response limit.",
    });
    expect(cancelled).toBe(true);
    expect(response.body?.locked).toBe(false);
  });

  test("rejects malformed UTF-8 and malformed JSON with sanitized errors", async () => {
    await expect(readBoundedProviderJson(new Response(Uint8Array.from([0xc3, 0x28])))).rejects.toMatchObject({
      name: "ProviderResponseBodyError",
      message: "The provider returned malformed UTF-8 text.",
    });
    await expect(readBoundedProviderJson(new Response('{"secret":"must-not-escape"'))).rejects.toMatchObject({
      name: "ProviderResponseBodyError",
      message: "The provider returned malformed JSON.",
    });
  });

  test("cancels a pending JSON read when its AbortSignal is aborted", async () => {
    let cancelled = false;
    const response = streamResponse({ cancel: () => { cancelled = true; } });
    const controller = new AbortController();
    const pending = readBoundedProviderJson(response, { signal: controller.signal, maxBytes: 32 });
    controller.abort(new DOMException("Fixture cancellation.", "AbortError"));

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelled).toBe(true);
    expect(response.body?.locked).toBe(false);
  });
});

function streamResponse(input: Readonly<{
  contentLength?: number;
  cancel(): void;
}>): Response {
  return new Response(new ReadableStream<Uint8Array>({
    pull() {
      // Intentionally pending until the reader is cancelled.
    },
    cancel: input.cancel,
  }), {
    headers: input.contentLength === undefined ? {} : { "content-length": String(input.contentLength) },
  });
}
