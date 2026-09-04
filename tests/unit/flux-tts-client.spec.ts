import { expect, test } from "@playwright/test";

import {
  buildFluxBatchRequest,
  buildFluxExamples,
  createFluxTraceExport,
  fileExtensionForEncoding,
  getDefaultFluxFormat,
  sanitizeFluxMessage,
} from "../../src/lib/flux-tts-client";
import { createFlightRecorderEvent } from "../../src/lib/flight-recorder";

test("builds only documented Flux batch format fields", () => {
  expect(buildFluxBatchRequest({ text: "Hello", model: "flux-cole-en", encoding: "mp3" })).toEqual({
    text: "Hello",
    model: "flux-cole-en",
    encoding: "mp3",
  });
  expect(getDefaultFluxFormat("linear16")).toEqual({ container: "wav", sampleRate: 8000 });
  expect(buildFluxBatchRequest({ text: "Hello", model: "flux-jack-en", encoding: "linear16", container: "none", sampleRate: 24000 })).toEqual({
    text: "Hello",
    model: "flux-jack-en",
    encoding: "linear16",
    container: "none",
    sample_rate: 24000,
  });
  expect(fileExtensionForEncoding("linear16", "none")).toBe("raw");
});

test("generated browser examples use the guarded route and placeholders only", () => {
  const examples = buildFluxExamples({ text: "YOUR_TEXT", model: "flux-cole-en", encoding: "mp3" });
  const generated = Object.values(examples).join("\n");
  expect(generated).toContain("/api/deepgram/flux-tts");
  expect(generated).toContain("$DEEPGRAM_API_KEY");
  expect(generated).toContain("process.env.DEEPGRAM_API_KEY");
  expect(generated).not.toContain("Authorization");
  expect(generated).not.toContain("permanent-secret-fixture");
});

test("sanitized trace export excludes text and credential material", () => {
  const event = createFlightRecorderEvent({
    localRunId: "run-fixture",
    module: "Flux TTS Studio",
    transport: "batch",
    model: "flux-cole-en",
    eventType: "fixture",
    source: "test",
    provenance: "simulated",
    payload: { authorization: "Token permanent-secret-fixture", text: "***not recorded***" },
  });
  const trace = createFluxTraceExport({ events: [event], model: "flux-cole-en", encoding: "mp3", textLength: 13 });
  const serialized = JSON.stringify(trace);
  expect(serialized).toContain("***not recorded***");
  expect(serialized).toContain("***redacted***");
  expect(serialized).not.toContain("permanent-secret-fixture");
  expect(serialized).not.toContain("private input");
});

test("sanitizes token-like error strings", () => {
  expect(sanitizeFluxMessage("Bearer eyJabc.def.ghi")).toBe("Bearer ***redacted***");
  expect(sanitizeFluxMessage("DEEPGRAM_API_KEY=permanent-secret-fixture failed")).not.toContain("permanent-secret-fixture");
});
