import { sanitizeFlightRecorderExport, type FlightRecorderEvent } from "@/lib/flight-recorder";
import { redactSecrets } from "@/lib/inspection";
import type { FluxTtsModel } from "@/lib/flux-tts-registry";

export const FLUX_BATCH_FORMATS = {
  mp3: {
    label: "MP3",
    containers: [] as const,
    sampleRates: [] as const,
    note: "Compressed MP3. Deepgram selects the documented sample rate.",
  },
  opus: {
    label: "Opus / Ogg",
    containers: ["ogg"] as const,
    sampleRates: [] as const,
    note: "Ogg-wrapped Opus with its documented fixed sample rate.",
  },
  flac: {
    label: "FLAC",
    containers: [] as const,
    sampleRates: [8000, 16000, 22050, 32000, 48000] as const,
    note: "Lossless FLAC at a documented selectable sample rate.",
  },
  aac: {
    label: "AAC",
    containers: [] as const,
    sampleRates: [] as const,
    note: "AAC with its documented fixed sample rate.",
  },
  linear16: {
    label: "Linear PCM 16-bit",
    containers: ["wav", "none"] as const,
    sampleRates: [8000, 16000, 24000, 32000, 44100, 48000] as const,
    note: "WAV or headerless PCM. Headerless output is raw audio.",
  },
  mulaw: {
    label: "Mu-law",
    containers: ["wav", "none"] as const,
    sampleRates: [8000, 16000] as const,
    note: "WAV or headerless telephony audio.",
  },
  alaw: {
    label: "A-law",
    containers: ["wav", "none"] as const,
    sampleRates: [8000, 16000] as const,
    note: "WAV or headerless telephony audio.",
  },
} as const;

export type FluxBatchEncoding = keyof typeof FLUX_BATCH_FORMATS;
export type FluxBatchContainer = "wav" | "ogg" | "none";

export type FluxBatchRequest = {
  text: string;
  model: FluxTtsModel;
  encoding: FluxBatchEncoding;
  container?: FluxBatchContainer;
  sample_rate?: number;
};

export function getDefaultFluxFormat(encoding: FluxBatchEncoding): {
  container?: FluxBatchContainer;
  sampleRate?: number;
} {
  const format = FLUX_BATCH_FORMATS[encoding];
  return {
    container: format.containers[0] as FluxBatchContainer | undefined,
    sampleRate: format.sampleRates[0],
  };
}

export function buildFluxBatchRequest(input: {
  text: string;
  model: FluxTtsModel;
  encoding: FluxBatchEncoding;
  container?: FluxBatchContainer;
  sampleRate?: number;
}): FluxBatchRequest {
  const format = FLUX_BATCH_FORMATS[input.encoding];
  const request: FluxBatchRequest = {
    text: input.text,
    model: input.model,
    encoding: input.encoding,
  };

  if (format.containers.length > 0 && input.container) request.container = input.container;
  if (format.sampleRates.length > 0 && input.sampleRate) request.sample_rate = input.sampleRate;
  return request;
}

export function buildFluxExamples(request: FluxBatchRequest) {
  const body = JSON.stringify(request, null, 2);
  const compactBody = JSON.stringify(request);
  const curlBody = compactBody.replaceAll("'", "'\\''");

  return {
    curl: [
      "# Permanent credentials stay in the application server environment as $DEEPGRAM_API_KEY.",
      'curl -X POST "http://localhost:3000/api/deepgram/flux-tts" \\',
      '  -H "Content-Type: application/json" \\',
      `  --data '${curlBody}' \\`,
      `  --output flux-speech.${fileExtensionForEncoding(request.encoding)}`,
    ].join("\n"),
    javascript: `// Server-only credential source: process.env.DEEPGRAM_API_KEY\n` +
      `const response = await fetch("/api/deepgram/flux-tts", {\n` +
      `  method: "POST",\n` +
      `  headers: { "Content-Type": "application/json" },\n` +
      `  body: JSON.stringify(${body}),\n` +
      `});\n\nconst audio = await response.blob();`,
    python: `# Server-only credential source: os.environ["DEEPGRAM_API_KEY"]\n` +
      `import requests\n\nresponse = requests.post(\n` +
      `    "http://localhost:3000/api/deepgram/flux-tts",\n` +
      `    json=${toPythonLiteral(request)},\n` +
      `    timeout=30,\n` +
      `)\nresponse.raise_for_status()\nopen("flux-speech.${fileExtensionForEncoding(request.encoding)}", "wb").write(response.content)`,
  };
}

export function sanitizeFluxMessage(value: unknown) {
  if (typeof value !== "string") return "Flux synthesis did not complete.";

  return redactSecrets(value)
    .replace(/DEEPGRAM_API_KEY\s*[=:]\s*[^\s,;]+/gi, "DEEPGRAM_API_KEY=***redacted***")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "***redacted***")
    .slice(0, 320);
}

export function createFluxTraceExport(input: {
  events: readonly FlightRecorderEvent[];
  model: FluxTtsModel;
  encoding: FluxBatchEncoding;
  container?: FluxBatchContainer;
  sampleRate?: number;
  textLength: number;
}) {
  return redactSecrets({
    schemaVersion: 1,
    module: "Flux TTS Studio",
    exportedAt: new Date().toISOString(),
    provenanceNotice: "Timings labeled measured come from this browser session; they are not provider-reported latency claims.",
    redactionState: "sanitized",
    request: {
      model: input.model,
      transport: "batch",
      encoding: input.encoding,
      container: input.container,
      sampleRate: input.sampleRate,
      text: "***not recorded***",
      textLength: input.textLength,
    },
    events: sanitizeFlightRecorderExport(input.events),
  });
}

export function fileExtensionForEncoding(encoding: FluxBatchEncoding, container?: FluxBatchContainer) {
  if ((encoding === "linear16" || encoding === "mulaw" || encoding === "alaw") && container === "none") return "raw";
  if (encoding === "linear16" || encoding === "mulaw" || encoding === "alaw") return "wav";
  if (encoding === "opus") return "ogg";
  return encoding;
}

function toPythonLiteral(request: FluxBatchRequest) {
  const entries = Object.entries(request).map(([key, value]) => {
    const rendered = typeof value === "string" ? JSON.stringify(value) : String(value);
    return `        ${JSON.stringify(key)}: ${rendered}`;
  });
  return `{\n${entries.join(",\n")}\n    }`;
}
