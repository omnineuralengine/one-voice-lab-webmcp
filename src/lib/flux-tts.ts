import { z } from "zod";

import { isFluxTtsModel, type FluxTtsModel } from "@/lib/flux-tts-registry";

export const FLUX_TTS_BATCH_ENDPOINT = "https://api.deepgram.com/v2/speak";
export const FLUX_TTS_BATCH_SOURCE = "https://developers.deepgram.com/docs/flux-tts/batch";
export const FLUX_TTS_MEDIA_SOURCE = "https://developers.deepgram.com/docs/tts-media-output-settings";
export const FLUX_TTS_MAX_TEXT_CHARACTERS = 2_000;

export const FLUX_TTS_ENCODINGS = ["mp3", "opus", "flac", "aac", "linear16", "mulaw", "alaw"] as const;
export const FLUX_TTS_CONTAINERS = ["wav", "none", "ogg"] as const;

export type FluxTtsEncoding = (typeof FLUX_TTS_ENCODINGS)[number];
export type FluxTtsContainer = (typeof FLUX_TTS_CONTAINERS)[number];

export type FluxTtsFormatRule = Readonly<{
  encoding: FluxTtsEncoding;
  containers: readonly FluxTtsContainer[];
  sampleRates: readonly number[];
  defaultContentType: string;
}>;

/**
 * Deepgram documentation verified combinations for the Flux batch transport.
 * The 2,000-character input ceiling is a conservative lab-owned bound, not a
 * claim about a universal provider limit.
 */
export const FLUX_TTS_BATCH_FORMATS: Readonly<Record<FluxTtsEncoding, FluxTtsFormatRule>> = {
  mp3: { encoding: "mp3", containers: [], sampleRates: [], defaultContentType: "audio/mpeg" },
  opus: { encoding: "opus", containers: ["ogg"], sampleRates: [], defaultContentType: "audio/ogg;codecs=opus" },
  flac: { encoding: "flac", containers: [], sampleRates: [8_000, 16_000, 22_050, 32_000, 48_000], defaultContentType: "audio/flac" },
  aac: { encoding: "aac", containers: [], sampleRates: [], defaultContentType: "audio/aac" },
  linear16: { encoding: "linear16", containers: ["wav", "none"], sampleRates: [8_000, 16_000, 24_000, 32_000, 44_100, 48_000], defaultContentType: "audio/wav" },
  mulaw: { encoding: "mulaw", containers: ["wav", "none"], sampleRates: [8_000, 16_000], defaultContentType: "audio/wav" },
  alaw: { encoding: "alaw", containers: ["wav", "none"], sampleRates: [8_000, 16_000], defaultContentType: "audio/wav" },
};

const fluxTtsModelSchema = z.custom<FluxTtsModel>(isFluxTtsModel, {
  message: "Choose an executable model from the verified Flux TTS registry.",
});

export const fluxTtsBatchRequestSchema = z.object({
  text: z.string().trim().min(1, "Enter text before generating audio.").max(
    FLUX_TTS_MAX_TEXT_CHARACTERS,
    `Keep text at or below ${FLUX_TTS_MAX_TEXT_CHARACTERS.toLocaleString()} characters for this lab.`,
  ),
  model: fluxTtsModelSchema,
  encoding: z.enum(FLUX_TTS_ENCODINGS).default("mp3"),
  container: z.enum(FLUX_TTS_CONTAINERS).optional(),
  sample_rate: z.number().int().optional(),
}).strict().superRefine((input, context) => {
  const format = FLUX_TTS_BATCH_FORMATS[input.encoding];

  if (input.container !== undefined && !format.containers.includes(input.container)) {
    const expected = format.containers.length ? format.containers.join(" or ") : "no container parameter";
    context.addIssue({
      code: "custom",
      path: ["container"],
      message: `${input.encoding} requires ${expected}.`,
    });
  }

  if (input.sample_rate !== undefined && !format.sampleRates.includes(input.sample_rate)) {
    const expected = format.sampleRates.length ? format.sampleRates.join(", ") : "no sample_rate parameter";
    context.addIssue({
      code: "custom",
      path: ["sample_rate"],
      message: `${input.encoding} supports ${expected}.`,
    });
  }
});

export type FluxTtsBatchRequest = z.infer<typeof fluxTtsBatchRequestSchema>;

export type PreparedFluxTtsBatchRequest = Readonly<{
  input: FluxTtsBatchRequest;
  url: URL;
  body: string;
  fallbackContentType: string;
}>;

export class FluxTtsValidationError extends Error {
  readonly code = "invalid_flux_tts_request";
  readonly status = 400;

  constructor(readonly issues: readonly { path: string; message: string }[]) {
    super(issues[0]?.message || "The Flux TTS request is invalid.");
    this.name = "FluxTtsValidationError";
  }
}

export function parseFluxTtsBatchRequest(value: unknown): FluxTtsBatchRequest {
  const result = fluxTtsBatchRequestSchema.safeParse(value);
  if (result.success) return result.data;

  throw new FluxTtsValidationError(result.error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  })));
}

export function buildFluxTtsBatchRequest(value: unknown): PreparedFluxTtsBatchRequest {
  const input = parseFluxTtsBatchRequest(value);
  const url = new URL(FLUX_TTS_BATCH_ENDPOINT);
  url.searchParams.set("model", input.model);
  url.searchParams.set("encoding", input.encoding);
  if (input.container !== undefined) url.searchParams.set("container", input.container);
  if (input.sample_rate !== undefined) url.searchParams.set("sample_rate", String(input.sample_rate));

  return {
    input,
    url,
    body: JSON.stringify({ text: input.text }),
    fallbackContentType: fluxTtsContentType(input),
  };
}

export function fluxTtsContentType(input: Pick<FluxTtsBatchRequest, "encoding" | "container" | "sample_rate">): string {
  const sampleRate = input.sample_rate ?? (input.encoding === "linear16" ? 24_000 : 8_000);
  if (input.container === "none") {
    if (input.encoding === "linear16") return `audio/l16;rate=${sampleRate}`;
    if (input.encoding === "mulaw") return `audio/mulaw;rate=${sampleRate}`;
    if (input.encoding === "alaw") return `audio/alaw;rate=${sampleRate}`;
  }
  return FLUX_TTS_BATCH_FORMATS[input.encoding].defaultContentType;
}

export type FluxTtsCodeExamples = Readonly<{
  curl: string;
  JavaScript: string;
  Python: string;
}>;

export function generateFluxTtsCodeExamples(value: unknown): FluxTtsCodeExamples {
  const prepared = buildFluxTtsBatchRequest(value);
  const url = prepared.url.toString();
  const textLiteral = JSON.stringify(prepared.input.text);
  const body = JSON.stringify({ text: prepared.input.text });
  const shellBody = body.replaceAll("'", "'\"'\"'");

  return {
    curl: [
      `curl --request POST '${url}' \\`,
      "  --header 'Authorization: Token $DEEPGRAM_API_KEY' \\",
      "  --header 'Content-Type: application/json' \\",
      `  --data '${shellBody}' \\`,
      `  --output flux-output.${fileExtension(prepared.input)}`,
    ].join("\n"),
    JavaScript: `const response = await fetch(${JSON.stringify(url)}, {
  method: "POST",
  headers: {
    Authorization: \`Token \${process.env.DEEPGRAM_API_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ text: ${textLiteral} }),
});

if (!response.ok) throw new Error(\`Deepgram request failed: \${response.status}\`);
const audio = Buffer.from(await response.arrayBuffer());`,
    Python: `import os
import requests

response = requests.post(
    ${JSON.stringify(url)},
    headers={
        "Authorization": f"Token {os.environ['DEEPGRAM_API_KEY']}",
        "Content-Type": "application/json",
    },
    json={"text": ${textLiteral}},
    timeout=30,
)
response.raise_for_status()
audio = response.content`,
  };
}

export function sanitizeFluxTrace<T>(value: T, knownSecrets: readonly string[] = []): T {
  return sanitizeValue(value, knownSecrets, new WeakSet()) as T;
}

function sanitizeValue(value: unknown, knownSecrets: readonly string[], seen: WeakSet<object>): unknown {
  if (typeof value === "string") return sanitizeString(value, knownSecrets);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "***redacted-circular-reference***";
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, knownSecrets, seen));

  const sanitized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    sanitized[key] = isSensitiveKey(key) ? "***redacted***" : sanitizeValue(child, knownSecrets, seen);
  }
  return sanitized;
}

function isSensitiveKey(key: string): boolean {
  return /authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|jwt|secret|cookie/i.test(key);
}

function sanitizeString(value: string, knownSecrets: readonly string[]): string {
  let safe = value
    .replace(/\b(Token|Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 ***redacted***")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "***redacted-jwt***");

  for (const secret of knownSecrets) {
    if (secret) safe = safe.replaceAll(secret, "***redacted***");
  }
  return safe;
}

function fileExtension(input: FluxTtsBatchRequest) {
  if (input.encoding === "linear16" || input.encoding === "mulaw" || input.encoding === "alaw") {
    return input.container === "none" ? "raw" : "wav";
  }
  if (input.encoding === "opus") return "ogg";
  return input.encoding;
}
