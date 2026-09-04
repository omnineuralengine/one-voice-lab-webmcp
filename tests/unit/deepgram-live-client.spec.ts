import { expect, test } from "@playwright/test";

import { DeepgramLiveClient } from "@/lib/live-mic/deepgram-live-client";

test("requires a fresh temporary token for every recoverable socket retry", async () => {
  const forceRefreshRequests: boolean[] = [];
  const sockets: FakeSocket[] = [];

  const client = new DeepgramLiveClient({
    recognitionConfig: { mode: "known-language", model: "nova-3", language: "en" },
    maxAttempts: 2,
    retryDelayMs: 0,
    getToken: ({ forceRefresh }) => {
      forceRefreshRequests.push(forceRefresh);
      return {
        accessToken: `temporary-token-${forceRefreshRequests.length}`,
        issuedAtMs: Date.now(),
        expiresAtMs: Date.now() + 60_000,
      };
    },
    webSocketFactory: (url, protocols) => {
      const socket = new FakeSocket(url, protocols);
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
  });

  client.connect();
  await expect.poll(() => sockets.length).toBe(1);
  sockets[0].open();
  sockets[0].emitClose(1006, "fixture disconnect", false);

  await expect.poll(() => sockets.length).toBe(2);
  expect(forceRefreshRequests).toEqual([false, true]);
  expect(sockets[0].protocols).toEqual(["bearer", "temporary-token-1"]);
  expect(sockets[1].protocols).toEqual(["bearer", "temporary-token-2"]);

  client.close();
});

class FakeSocket {
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {}

  open() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }

  emitClose(code: number, reason: string, wasClean: boolean) {
    this.readyState = 3;
    this.onclose?.({ code, reason, wasClean } as CloseEvent);
  }

  send() {}

  close() {
    this.readyState = 3;
  }
}
