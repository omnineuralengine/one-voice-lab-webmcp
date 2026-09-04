import { expect, test } from "@playwright/test";

import { createFlightRecorderEvent, sanitizeFlightRecorderExport } from "@/lib/flight-recorder";

test("flight recorder keeps provenance and redacts credentials", () => {
  const event = createFlightRecorderEvent({
    localRunId: "run_fixture",
    module: "Flux TTS Studio",
    transport: "batch",
    model: "flux-cole-en",
    eventType: "request.completed",
    source: "application route",
    provenance: "measured",
    durationMs: 12.345,
    requestId: "request-fixture-1",
    payload: {
      Authorization: "Bearer temporary.jwt.value",
      access_token: "temporary.jwt.value",
      textLength: 12,
    },
  });

  expect(event.durationMs).toBe(12.3);
  expect(event.provenance).toBe("measured");
  expect(JSON.stringify(sanitizeFlightRecorderExport([event]))).not.toContain("temporary.jwt.value");
  expect(event.sanitizedPayload).toEqual({
    Authorization: "***redacted***",
    access_token: "***redacted***",
    textLength: 12,
  });
});

test("metadata-only events omit payload content", () => {
  const event = createFlightRecorderEvent({
    localRunId: "run_fixture",
    module: "Live Mic",
    transport: "websocket",
    model: "nova-3",
    eventType: "microphone.frame",
    source: "browser",
    provenance: "measured",
    metadataOnly: true,
    payload: { rawAudio: "must-not-persist" },
  });

  expect(event.redactionState).toBe("metadata-only");
  expect(event.sanitizedPayload).toBeUndefined();
});
