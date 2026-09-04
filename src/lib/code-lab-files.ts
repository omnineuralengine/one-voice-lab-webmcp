import type { LabModuleId } from "@/lib/code-snippets";

export type CodeLabLanguage = "Shell" | "Python" | "TypeScript" | "Go" | ".NET" | "C++20";

export type CodeLabWorkflowId =
  | "transcribe-url"
  | "upload-audio"
  | "audio-signal"
  | "live-mic"
  | "tts"
  | "text-intelligence"
  | "temporary-token"
  | "voice-agent"
  | "trusted-voice";

export type CodeLabFileSide = "Client-side" | "Server-side" | "Config" | "Shared" | "CLI";

export type CodeLabFile = {
  path: string;
  role: string;
  side: CodeLabFileSide;
  language: CodeLabLanguage;
  code: string;
  whereItFits: string;
  requestFlow: string[];
  responsePaths: string[];
  environmentVariables: string[];
  securityNotes: string[];
};

export type CodeLabWorkflow = {
  id: CodeLabWorkflowId;
  title: string;
  description: string;
  relatedModule?: LabModuleId;
  failureModes?: string[];
  fallbackNote?: string;
  filesByLanguage: Record<CodeLabLanguage, CodeLabFile[]>;
};

export const CODE_LAB_LANGUAGES: Array<{ id: CodeLabLanguage; label: string }> = [
  { id: "Shell", label: "Shell" },
  { id: "Python", label: "Python" },
  { id: "TypeScript", label: "JavaScript / TypeScript" },
  { id: "Go", label: "Go" },
  { id: ".NET", label: ".NET / C#" },
  { id: "C++20", label: "C++20" },
];

const transcriptPaths = [
  "results.channels[0].alternatives[0].transcript",
  "results.channels[0].alternatives[0].words",
  "metadata.request_id",
];

const ttsPaths = [
  "response body is audio bytes",
  "content-type is audio/*",
  "browser creates an object URL or receives a local playback URL",
];

const livePaths = [
  "channel.alternatives[0].transcript for interim transcript events",
  "is_final=true for final transcript events",
  "speech_started and endpointing/vad events when present",
];

const textIntelligencePaths = [
  "metadata.request_id",
  "results.summary.results.summary.text",
  "results.topics.results.topics.segments",
  "results.intents.results.intents.segments",
  "results.sentiments.average",
];

const tokenPaths = ["access_token (redacted outside the realtime client)", "expires_in", "inspector response status"];

const envKey = ["DEEPGRAM_API_KEY"];
const browserFlow = ["Browser UI", "Next.js API Route", "Deepgram API", "Browser result panel"];
const directFlow = ["CLI/script", "Deepgram API", "stdout or output file"];
const liveFlow = ["Browser microphone", "Next.js token route", "Deepgram realtime WebSocket", "Browser transcript log"];
const liveMicBrowserFlow = [
  "Browser requests /api/deepgram/token",
  "Browser opens Deepgram WebSocket with the temporary bearer token",
  "WebSocket opens",
  "Browser starts MediaRecorder",
  "Browser sends 250 ms audio chunks",
  "Browser receives interim and final events",
];

const liveMicFailureModes = [
  "1006 close: the browser could not complete or maintain the Deepgram WebSocket connection; stop capture, record the close details, and offer the fallback.",
  "500 server close: the live handshake or query was rejected; retry once with simpler query parameters, then stop cleanly.",
  "Unsupported MIME type: select a supported MediaRecorder format or use the browser default; do not force WebM/Opus parameters onto a different format.",
  "Expired token: request a fresh temporary token before the next connection attempt; never cache tokens in localStorage.",
  "Permission denied: stop before requesting a token or opening a socket, explain the browser permission issue, and leave Start available for retry.",
];

const liveMicFallbackNote =
  "Run 5-sec Mic Test records from the selected microphone and uploads the blob to /api/deepgram/transcribe-file. It confirms microphone capture, upload transcription, and server-side API key health, but it is not realtime.";

function file(input: CodeLabFile): CodeLabFile {
  return input;
}

const transcribeUrlTypeScript: CodeLabFile[] = [
  file({
    path: ".env.local",
    role: "Local secret configuration for the server runtime.",
    side: "Config",
    language: "TypeScript",
    code: "DEEPGRAM_API_KEY=replace_me",
    whereItFits: "Lives at the project root and is loaded by Next.js server code. Never prefix it with NEXT_PUBLIC_.",
    requestFlow: browserFlow,
    responsePaths: transcriptPaths,
    environmentVariables: envKey,
    securityNotes: ["Do not commit .env.local.", "The browser should never receive this value."],
  }),
  file({
    path: "src/components/TranscribeUrlCard.tsx",
    role: "Client component that collects the audio URL and calls the local API route.",
    side: "Client-side",
    language: "TypeScript",
    code: String.raw`"use client";

export function TranscribeUrlCard() {
  async function transcribe() {
    const response = await fetch("/api/deepgram/transcribe-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "YOUR_AUDIO_URL",
        model: "nova-3",
        language: "en",
        smart_format: true,
      }),
    });

    const envelope = await response.json();
    console.log(envelope.data.raw.results.channels[0].alternatives[0].transcript);
  }

  return <button onClick={transcribe}>Transcribe URL</button>;
}`,
    whereItFits: "This is the product surface. It talks only to your app route, not directly to Deepgram.",
    requestFlow: browserFlow,
    responsePaths: transcriptPaths,
    environmentVariables: [],
    securityNotes: ["No Authorization header belongs in this file.", "Client code can show sanitized inspector data only."],
  }),
  file({
    path: "src/app/api/deepgram/transcribe-url/route.ts",
    role: "Server route that validates input and forwards the request to Deepgram.",
    side: "Server-side",
    language: "TypeScript",
    code: String.raw`import { NextResponse } from "next/server";
import { transcribeAudioUrl } from "@/lib/deepgram";

export async function POST(request: Request) {
  const body = await request.json();
  const data = await transcribeAudioUrl({
    url: body.url,
    model: body.model || "nova-3",
    language: body.language || "en",
    smart_format: body.smart_format !== false,
    diarize: Boolean(body.diarize),
  });

  return NextResponse.json({ ok: true, data });
}`,
    whereItFits: "This route is the trust boundary between browser UI and Deepgram.",
    requestFlow: browserFlow,
    responsePaths: transcriptPaths,
    environmentVariables: envKey,
    securityNotes: ["Read DEEPGRAM_API_KEY only on the server.", "Return transcripts and metadata, never the API key."],
  }),
  file({
    path: "src/lib/deepgram.ts",
    role: "Shared server helper that builds the Deepgram /v1/listen request.",
    side: "Server-side",
    language: "TypeScript",
    code: String.raw`export async function transcribeAudioUrl(payload: {
  url: string;
  model: string;
  language: string;
  smart_format: boolean;
}) {
  const endpoint = new URL("https://api.deepgram.com/v1/listen");
  endpoint.searchParams.set("model", payload.model);
  endpoint.searchParams.set("language", payload.language);
  endpoint.searchParams.set("smart_format", String(payload.smart_format));

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: "Token " + process.env.DEEPGRAM_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: payload.url }),
  });

  return response.json();
}`,
    whereItFits: "Keep provider-specific code here so route handlers stay small and testable.",
    requestFlow: browserFlow,
    responsePaths: transcriptPaths,
    environmentVariables: envKey,
    securityNotes: ["This helper must stay server-only.", "Sanitize errors before showing them in the browser."],
  }),
];

const uploadTypeScript: CodeLabFile[] = [
  file({
    path: "src/components/UploadAudioCard.tsx",
    role: "Client file picker that sends multipart form data to the app route.",
    side: "Client-side",
    language: "TypeScript",
    code: String.raw`"use client";

export function UploadAudioCard() {
  async function transcribeFile(file: File) {
    const form = new FormData();
    form.append("file", file);
    form.append("model", "nova-3");
    form.append("language", "en");
    form.append("smart_format", "true");

    const response = await fetch("/api/deepgram/transcribe-file", {
      method: "POST",
      body: form,
    });

    const envelope = await response.json();
    console.log(envelope.data.transcript);
  }
}`,
    whereItFits: "The browser uploads bytes to your server. Your server forwards those bytes to Deepgram.",
    requestFlow: ["Browser file picker", "Next.js upload route", "Deepgram /v1/listen", "Browser transcript"],
    responsePaths: transcriptPaths,
    environmentVariables: [],
    securityNotes: ["The browser still does not get DEEPGRAM_API_KEY.", "Do not dump binary audio into inspector JSON."],
  }),
  file({
    path: "src/app/api/deepgram/transcribe-file/route.ts",
    role: "Server route that reads multipart data and forwards audio bytes.",
    side: "Server-side",
    language: "TypeScript",
    code: String.raw`import { NextResponse } from "next/server";
import { transcribeAudioFile } from "@/lib/deepgram";

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, message: "Choose an audio file." }, { status: 400 });
  }

  const data = await transcribeAudioFile(file, {
    model: String(form.get("model") || "nova-3"),
    language: String(form.get("language") || "en"),
    smart_format: String(form.get("smart_format") || "true"),
  });

  return NextResponse.json({ ok: true, data });
}`,
    whereItFits: "The route owns file validation, size limits, MIME type forwarding, and sanitized responses.",
    requestFlow: ["Browser file picker", "Next.js upload route", "Deepgram /v1/listen", "Browser transcript"],
    responsePaths: transcriptPaths,
    environmentVariables: envKey,
    securityNotes: ["Validate file size before forwarding.", "Keep uploaded audio out of logs and debug JSON."],
  }),
  ...transcribeUrlTypeScript.slice(0, 1),
];

const liveMicTypeScript: CodeLabFile[] = [
  file({
    path: "src/app/api/deepgram/token/route.ts",
    role: "Server route that exchanges the main API key for a short-lived token.",
    side: "Server-side",
    language: "TypeScript",
    code: String.raw`function redactToken(token: string) {
  return token.length > 12
    ? token.slice(0, 6) + "..." + token.slice(-4)
    : "***redacted***";
}

export async function POST() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return Response.json(
      { ok: false, error: "DEEPGRAM_API_KEY is not configured on the server." },
      { status: 500 },
    );
  }

  const response = await fetch("https://api.deepgram.com/v1/auth/grant", {
    method: "POST",
    headers: {
      Authorization: "Token " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ttl_seconds: 60 }),
  });

  if (!response.ok) {
    const message = response.status === 403
      ? "Deepgram denied the token grant. Check API key permissions."
      : "Deepgram could not grant a temporary token.";
    return Response.json({ ok: false, error: message }, { status: response.status });
  }

  const payload = await response.json();
  if (typeof payload.access_token !== "string" || typeof payload.expires_in !== "number") {
    return Response.json(
      { ok: false, error: "Deepgram returned an invalid token response." },
      { status: 502 },
    );
  }

  return Response.json({
    ok: true,
    access_token: payload.access_token,
    expires_in: payload.expires_in,
    inspector: {
      timeline: [{ type: "token_granted", label: "Temporary token granted" }],
      access_token: redactToken(payload.access_token),
    },
  });
}`,
    whereItFits: "Realtime browser audio needs browser-safe auth. This route returns a temporary token, not the main key.",
    requestFlow: liveMicBrowserFlow,
    responsePaths: livePaths,
    environmentVariables: envKey,
    securityNotes: ["Redact access_token in inspectors.", "Short TTL limits blast radius if a token is copied."],
  }),
  file({
    path: "src/lib/live-mic/deepgram-live-client.ts",
    role: "Browser helper that opens an authenticated Deepgram socket and resolves only after the WebSocket is ready.",
    side: "Client-side",
    language: "TypeScript",
    code: String.raw`type LiveSocketOptions = {
  accessToken: string;
  language: string;
  includeVadEvents?: boolean;
};

export function openDeepgramLiveSocket({
  accessToken,
  language,
  includeVadEvents = true,
}: LiveSocketOptions): Promise<WebSocket> {
  const endpoint = new URL("wss://api.deepgram.com/v1/listen");
  endpoint.searchParams.set("model", "nova-3");
  endpoint.searchParams.set("language", language);
  endpoint.searchParams.set("smart_format", "true");
  endpoint.searchParams.set("interim_results", "true");
  endpoint.searchParams.set("endpointing", "300");
  if (includeVadEvents) endpoint.searchParams.set("vad_events", "true");

  // Temporary /auth/grant credentials are JWT bearer tokens. The browser
  // transports auth through Sec-WebSocket-Protocol, never through the URL.
  const socket = new WebSocket(endpoint, ["bearer", accessToken]);

  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve(socket), { once: true });
    socket.addEventListener(
      "error",
      () => reject(new Error("The browser could not open the Deepgram WebSocket.")),
      { once: true },
    );
    socket.addEventListener(
      "close",
      (event) => reject(new Error(
        event.code === 1006
          ? "The browser could not complete or maintain the Deepgram WebSocket connection."
          : "Live socket closed with code " + event.code + ".",
      )),
      { once: true },
    );
  });
}`,
    whereItFits: "The client can make one normal attempt with VAD events, then one simpler attempt without VAD only if no transcript events arrived.",
    requestFlow: liveMicBrowserFlow,
    responsePaths: livePaths,
    environmentVariables: [],
    securityNotes: ["The JWT belongs in the bearer WebSocket subprotocol, never in query parameters.", "Limit retries and request a fresh token if the current token expired before the handshake."],
  }),
  file({
    path: "src/components/BrowserMicCard.tsx",
    role: "Client orchestrator that requests permission and a temporary token, waits for the live socket, then starts recording.",
    side: "Client-side",
    language: "TypeScript",
    code: String.raw`"use client";

import { openDeepgramLiveSocket } from "@/lib/live-mic/deepgram-live-client";

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

function supportedMimeType() {
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
}

export async function startLiveMic(language = "en") {
  // 1. Permission and device selection happen before any Deepgram request.
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  try {
    // 2. Ask the local server for a short-lived JWT only when Start is clicked.
    const tokenResponse = await fetch("/api/deepgram/token", { method: "POST" });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok || !token.ok) throw new Error(token.error);

    // 3. Do not create or start MediaRecorder until this promise resolves.
    const socket = await openDeepgramLiveSocket({
      accessToken: token.access_token,
      language,
    });

    // 4. The socket is open. Compressed browser audio can now be recorded.
    const mimeType = supportedMimeType();
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
        socket.send(event.data);
      }
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      // Keep the full message, then derive interim/final transcript state.
      console.log("Deepgram event", message);
    });
    socket.addEventListener("close", () => {
      if (recorder.state !== "inactive") recorder.stop();
      stream.getTracks().forEach((track) => track.stop());
    });

    // 5. Chunks begin only after WebSocket.OPEN is confirmed.
    recorder.start(250);
    return { socket, recorder, mimeType: recorder.mimeType || "browser default" };
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    throw error;
  }
}`,
    whereItFits: "This is browser-only orchestration. The local input meter is only a capture preview; transcription begins after the socket opens and chunks are sent.",
    requestFlow: liveMicBrowserFlow,
    responsePaths: livePaths,
    environmentVariables: [],
    securityNotes: ["Use the temporary token only.", "Never place the main API key in WebSocket client code or localStorage."],
  }),
  file({
    path: "src/lib/live-mic/run-five-second-mic-test.ts",
    role: "Non-realtime fallback that records five seconds and uploads the resulting browser audio blob through the server.",
    side: "Client-side",
    language: "TypeScript",
    code: String.raw`export async function runFiveSecondMicTest(deviceId?: string) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: deviceId ? { deviceId: { exact: deviceId } } : true,
  });

  try {
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : undefined;
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });

    const stopped = new Promise<void>((resolve) => {
      recorder.addEventListener("stop", () => resolve(), { once: true });
    });
    recorder.start(250);
    await new Promise((resolve) => window.setTimeout(resolve, 5_000));
    recorder.stop();
    await stopped;

    const audio = new Blob(chunks, { type: recorder.mimeType || "application/octet-stream" });
    const form = new FormData();
    form.append("file", audio, "five-second-mic-test.webm");
    form.append("model", "nova-3");
    form.append("language", "en");
    form.append("smart_format", "true");

    const response = await fetch("/api/deepgram/transcribe-file", {
      method: "POST",
      body: form,
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.message || result.error);
    return result;
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}`,
    whereItFits: "Offer this after realtime fails. Success isolates the problem to the WebSocket path because microphone capture, upload transcription, and server-side API key use all worked.",
    requestFlow: [
      "Browser records selected microphone for 5 seconds",
      "Browser POSTs multipart audio to /api/deepgram/transcribe-file",
      "Server calls Deepgram prerecorded listen",
      "Browser displays transcript and raw response",
    ],
    responsePaths: transcriptPaths,
    environmentVariables: [],
    securityNotes: ["This path uses the main API key only on the server.", "It is a stable diagnostic fallback, not realtime transcription."],
  }),
];

const ttsTypeScript: CodeLabFile[] = [
  file({
    path: "src/components/TextToSpeechCard.tsx",
    role: "Client form that asks the local TTS route to generate playable audio.",
    side: "Client-side",
    language: "TypeScript",
    code: String.raw`"use client";

async function generateAudio(text: string) {
  const response = await fetch("/api/deepgram/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, model: "aura-2-thalia-en" }),
  });

  const envelope = await response.json();
  const audioUrl = envelope.data.audioUrl;
  return audioUrl;
}`,
    whereItFits: "The client asks your own route for audio, then plays the returned local URL.",
    requestFlow: browserFlow,
    responsePaths: ttsPaths,
    environmentVariables: [],
    securityNotes: ["Do not call Deepgram Speak directly from the browser with the main key."],
  }),
  file({
    path: "src/app/api/deepgram/tts/route.ts",
    role: "Server route that calls Deepgram Speak and returns audio metadata plus a local playback URL.",
    side: "Server-side",
    language: "TypeScript",
    code: String.raw`import { generateSpeechAudio } from "@/lib/deepgram";

export async function POST(request: Request) {
  const { text, model } = await request.json();
  const result = await generateSpeechAudio({ text, model });

  return Response.json({
    ok: true,
    data: {
      contentType: result.contentType,
      byteSize: result.audio.byteLength,
      model: result.model,
      binaryAudio: "***not included in JSON***",
    },
  });
}`,
    whereItFits: "The route owns the provider call and keeps binary audio out of JSON inspectors.",
    requestFlow: browserFlow,
    responsePaths: ttsPaths,
    environmentVariables: envKey,
    securityNotes: ["Return metadata and playback handles, not raw binary JSON.", "Keep Authorization on the server."],
  }),
  ...transcribeUrlTypeScript.slice(0, 1),
];

const trustedVoiceTypeScript: CodeLabFile[] = [
  file({
    path: "src/components/TrustedVoiceExperience.tsx",
    role: "Client concept surface that enforces consent before requesting TTS.",
    side: "Client-side",
    language: "TypeScript",
    code: String.raw`"use client";

const consentReady = Object.values(consent).every(Boolean);

async function generateTrustedVoice() {
  if (!consentReady) return;

  const response = await fetch("/api/deepgram/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: deliveryPreview.spokenText,
      model: "aura-2-harmonia-en",
      familiarCare: {
        scenarioId: "healthcare-appointment-reminder",
        riskLevel: "Medium",
        disclosureStyle: "spoken-and-displayed",
        sensitiveDetailPolicy: "no-sensitive-details",
        fallbackChannel: "secure-portal",
        optOutInstruction,
        consent,
      },
    }),
  });

  return response.json();
}`,
    whereItFits: "Familiar Care composes the delivery preview in the browser; the server independently validates the same typed policy.",
    requestFlow: ["Consent gate", "Sensitive-detail review", "Next.js TTS policy gate", "Deepgram Speak", "Ephemeral browser playback"],
    responsePaths: ttsPaths,
    environmentVariables: [],
    securityNotes: ["Use only the approved Aura catalog.", "Never trust client consent state; enforce the submitted policy on the server."],
  }),
  ...ttsTypeScript.slice(1),
];

const voiceAgentTypeScript: CodeLabFile[] = [
  file({
    path: "src/components/VoiceAgentPrototype.tsx",
    role: "Conceptual client surface for a future voice-agent experience.",
    side: "Client-side",
    language: "TypeScript",
    code: String.raw`"use client";

async function connectVoiceAgentConcept() {
  const tokenResponse = await fetch("/api/deepgram/token", { method: "POST" });
  const { access_token } = await tokenResponse.json();

  // Educational placeholder: verify the current agent host and documented
  // temporary-token subprotocol before production use.
  const socket = new WebSocket("wss://agent.deepgram.com/v1/agent/converse", ["bearer", access_token]);
  socket.onmessage = (event) => console.log("agent event", event.data);
}`,
    whereItFits: "This shows where a future agent client would live without claiming this lab implements an agent.",
    requestFlow: ["Browser voice UI", "Temporary token route", "Voice Agent service", "Browser transcript/audio events"],
    responsePaths: livePaths,
    environmentVariables: [],
    securityNotes: ["Use temporary tokens.", "Treat this as concept code until endpoint and agent config are finalized."],
  }),
  ...liveMicTypeScript.slice(0, 1),
];

const textIntelligenceTypeScript: CodeLabFile[] = [
  file({
    path: "src/components/TextIntelligenceCard.tsx",
    role: "Client form that sends existing text to the guarded local analysis route.",
    side: "Client-side",
    language: "TypeScript",
    code: String.raw`"use client";

async function analyzeTranscript(text: string) {
  const response = await fetch("/api/deepgram/text-intelligence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      features: { summarize: true, topics: true, intents: true, sentiment: true },
    }),
  });

  const envelope = await response.json();
  return envelope.data.raw.results;
}`,
    whereItFits: "The browser sends only source text and feature toggles to your app route.",
    requestFlow: ["Browser text form", "Next.js analysis route", "Deepgram /v1/read", "Structured analysis"],
    responsePaths: textIntelligencePaths,
    environmentVariables: [],
    securityNotes: ["No Authorization header belongs in this client file.", "Minimize sensitive transcript text before analysis."],
  }),
  file({
    path: "src/app/api/deepgram/text-intelligence/route.ts",
    role: "Server route that validates text, adds the API key, and returns a sanitized inspector envelope.",
    side: "Server-side",
    language: "TypeScript",
    code: String.raw`import { analyzeText } from "@/lib/deepgram";

export async function POST(request: Request) {
  const payload = await request.json();
  const data = await analyzeText(payload);
  return Response.json({ ok: true, data });
}`,
    whereItFits: "The route is the credential and validation boundary for /v1/read.",
    requestFlow: ["Browser text form", "Next.js analysis route", "Deepgram /v1/read", "Structured analysis"],
    responsePaths: textIntelligencePaths,
    environmentVariables: envKey,
    securityNotes: ["Keep DEEPGRAM_API_KEY server-side.", "Redact Authorization and set explicit retention rules for customer text."],
  }),
  ...transcribeUrlTypeScript.slice(0, 1),
];

const temporaryTokenTypeScript: CodeLabFile[] = [
  file({
    path: "src/app/api/deepgram/token/route.ts",
    role: "Server route that exchanges the permanent key for a short-lived realtime credential.",
    side: "Server-side",
    language: "TypeScript",
    code: String.raw`import { grantTemporaryToken } from "@/lib/deepgram";

export async function POST(request: Request) {
  const { ttlSeconds = 60 } = await request.json().catch(() => ({}));
  const token = await grantTemporaryToken(ttlSeconds);

  return Response.json(token, {
    headers: { "Cache-Control": "no-store" },
  });
}`,
    whereItFits: "The permanent key remains in the server runtime. The temporary token is consumed immediately by a realtime client.",
    requestFlow: liveFlow,
    responsePaths: tokenPaths,
    environmentVariables: envKey,
    securityNotes: ["Never log either credential.", "Do not persist temporary tokens in localStorage."],
  }),
  file({
    path: "src/components/RealtimeConnector.tsx",
    role: "Browser concept that obtains a fresh token immediately before opening a realtime socket.",
    side: "Client-side",
    language: "TypeScript",
    code: String.raw`"use client";

async function getFreshRealtimeToken() {
  const response = await fetch("/api/deepgram/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ttlSeconds: 60 }),
  });
  const token = await response.json();
  return token.access_token; // keep in memory; use immediately; never log it
}`,
    whereItFits: "This client receives only the short-lived token required for a realtime connection.",
    requestFlow: liveFlow,
    responsePaths: tokenPaths,
    environmentVariables: [],
    securityNotes: ["Keep the token in memory only.", "The permanent API key must never appear in this file."],
  }),
];

const audioSignalTypeScript: CodeLabFile[] = [
  file({
    path: "src/audio/start-local-analysis.ts",
    role: "Explicitly starts browser microphone analysis and owns complete cleanup.",
    side: "Client-side",
    language: "TypeScript",
    code: `export async function startLocalAnalysis(deviceId?: string) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: false,
    audio: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      echoCancellation: true,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser); // analysis only; never connect mic to destination

  return {
    stream,
    analyser,
    settings: stream.getAudioTracks()[0]?.getSettings(),
    stop: async () => {
      source.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      await context.close();
    },
  };
}`,
    whereItFits: "A client-only analysis island. Call it only from an explicit user action and invoke stop on Stop, reset, navigation, and unmount.",
    requestFlow: ["User Start", "getUserMedia", "AudioContext", "AnalyserNode", "local metrics"],
    responsePaths: ["Float32 time-domain samples", "browser track settings", "local cleanup"],
    environmentVariables: [],
    securityNotes: ["No Deepgram request occurs.", "Do not connect the microphone source to context.destination.", "Do not persist raw audio by default."],
  }),
  file({
    path: "src/audio/analyze-and-record.ts",
    role: "Shows normalized sample analysis, MediaRecorder chunks, and byte ownership without retaining chunks in logs.",
    side: "Client-side",
    language: "TypeScript",
    code: `const samples = new Float32Array(analyser.fftSize);
analyser.getFloatTimeDomainData(samples);

const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
const peak = samples.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0);
const bytes = new Uint8Array(await blob.arrayBuffer());

const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
recorder.addEventListener("dataavailable", (event) => {
  observeTiming({ at: performance.now(), byteLength: event.data.size });
  // Keep Blob bytes only when the user explicitly chooses an in-memory fixture.
});`,
    whereItFits: "Use browser-native types: Float32Array for samples, Uint8Array for bytes, Blob for containerized audio, and ArrayBuffer at decode boundaries.",
    requestFlow: ["AnalyserNode", "Float32Array", "RMS/peak", "MediaRecorder", "Blob timing"],
    responsePaths: ["local metrics", "chunk interval summary", "actual recorder MIME"],
    environmentVariables: [],
    securityNotes: ["Never log raw chunks.", "Aggregate meter events before Observatory dispatch."],
  }),
];

function shellFiles(workflow: CodeLabWorkflowId): CodeLabFile[] {
  if (workflow === "audio-signal") return [file({
    path: "inspect-audio.sh",
    role: "Inspects and converts local audio with ffprobe/ffmpeg without making a Deepgram request.",
    side: "CLI",
    language: "Shell",
    code: `ffprobe -hide_banner -show_streams -show_format YOUR_AUDIO_FILE
ffmpeg -i YOUR_AUDIO_FILE -ac 1 -ar 16000 inspected-mono-16k.wav
# Containerized WAV: do not add contradictory raw encoding/sample-rate parameters.`,
    whereItFits: "Use before request construction to confirm container, codec, channels, and sample rate.",
    requestFlow: ["local file", "ffprobe", "verified metadata", "optional copied conversion"],
    responsePaths: ["container", "codec", "channels", "sample rate", "duration"],
    environmentVariables: [],
    securityNotes: ["Operate on a copy.", "Do not print credentials in shell history."],
  })];
  const isTts = workflow === "tts" || workflow === "trusted-voice";
  const isToken = workflow === "live-mic" || workflow === "voice-agent" || workflow === "temporary-token";
  const responsePaths = isToken ? tokenPaths : workflow === "text-intelligence" ? textIntelligencePaths : isTts ? ttsPaths : transcriptPaths;
  return [
    file({
      path: ".env.example",
      role: "Documents the required environment variable without storing a real key.",
      side: "Config",
      language: "Shell",
      code: "DEEPGRAM_API_KEY=replace_me",
      whereItFits: "Copy this to .env or export the value in your shell before running scripts.",
      requestFlow: directFlow,
      responsePaths,
      environmentVariables: envKey,
      securityNotes: ["Commit examples, not secrets.", "Use shell env vars for local demos."],
    }),
    file({
      path: workflow === "tts" || workflow === "trusted-voice" ? "speak.sh" : isToken ? "grant-token.sh" : workflow === "text-intelligence" ? "analyze-text.sh" : "transcribe-url.sh",
      role: "Small curl script for learning the raw HTTP shape.",
      side: "CLI",
      language: "Shell",
      code: shellCodeFor(workflow),
      whereItFits: "Use this outside the app to learn the API request before wiring a UI.",
      requestFlow: isToken ? ["CLI", "Deepgram /v1/auth/grant", "temporary token JSON"] : directFlow,
      responsePaths,
      environmentVariables: envKey,
      securityNotes: ["Do not paste real keys into shared docs.", "Use $DEEPGRAM_API_KEY rather than hard-coding secrets."],
    }),
  ];
}

function pythonFiles(workflow: CodeLabWorkflowId): CodeLabFile[] {
  if (workflow === "audio-signal") return [file({
    path: "inspect_wav.py",
    role: "Reads WAV metadata and iterates bounded byte chunks locally.",
    side: "CLI",
    language: "Python",
    code: `import wave

with wave.open("YOUR_AUDIO.wav", "rb") as wav:
    print({"channels": wav.getnchannels(), "sample_rate": wav.getframerate(), "frames": wav.getnframes()})
    while chunk := wav.readframes(1600):
        analyze_chunk_locally(chunk)  # bytes; no network request

# For async streaming, bound a queue and cancel the producer and socket together.`,
    whereItFits: "Metadata inspection, offline fixtures, and asynchronous streaming concepts.",
    requestFlow: ["WAV container", "wave module", "bounded byte chunks", "local analysis"],
    responsePaths: ["header metadata", "bytes per chunk", "cleanup/cancellation"],
    environmentVariables: [],
    securityNotes: ["No audio upload is implied.", "Never assume filename extension proves encoding."],
  })];
  const isTts = workflow === "tts" || workflow === "trusted-voice";
  const isToken = workflow === "live-mic" || workflow === "voice-agent" || workflow === "temporary-token";
  const responsePaths = isToken ? tokenPaths : workflow === "text-intelligence" ? textIntelligencePaths : isTts ? ttsPaths : transcriptPaths;
  return [
    file({
      path: "requirements.txt",
      role: "Minimal dependencies for the Python learning script.",
      side: "Config",
      language: "Python",
      code: workflow === "live-mic" || workflow === "voice-agent" ? "requests\nwebsockets\npython-dotenv" : "requests\npython-dotenv",
      whereItFits: "Installed into a local virtual environment for script-based learning.",
      requestFlow: directFlow,
      responsePaths: isTts ? ttsPaths : transcriptPaths,
      environmentVariables: envKey,
      securityNotes: ["Keep .env out of source control."],
    }),
    file({
      path: pythonPathFor(workflow),
      role: "Python script version of the selected workflow.",
      side: "CLI",
      language: "Python",
      code: pythonCodeFor(workflow),
      whereItFits: "Useful for backend jobs, notebooks, or learning the HTTP call without a web UI.",
      requestFlow: isToken ? liveFlow : directFlow,
      responsePaths,
      environmentVariables: envKey,
      securityNotes: ["Read DEEPGRAM_API_KEY from the environment.", "Do not log the key or commit .env."],
    }),
  ];
}

function goFiles(workflow: CodeLabWorkflowId): CodeLabFile[] {
  if (workflow === "audio-signal") return [file({
    path: "main.go",
    role: "Demonstrates []byte, io.Reader, bounded buffering, and context cancellation.",
    side: "CLI",
    language: "Go",
    code: `ctx, cancel := context.WithCancel(context.Background())
defer cancel()

reader := bufio.NewReader(audioFile) // io.Reader owns sequential file bytes
buffer := make([]byte, 3200)
for {
  n, err := reader.Read(buffer)
  if n > 0 { analyzeCopy(append([]byte(nil), buffer[:n]...)) }
  if errors.Is(err, io.EOF) { break }
  if err != nil { return err }
  select { case <-ctx.Done(): return ctx.Err(); default: }
}`,
    whereItFits: "Local file/chunk analysis before a separately designed transport adapter.",
    requestFlow: ["io.Reader", "bounded []byte", "copied chunk", "context cancellation"],
    responsePaths: ["chunk sizes", "analysis summaries", "cancellation state"],
    environmentVariables: [],
    securityNotes: ["Bound buffers.", "Do not retain or log raw customer audio."],
  })];
  const responsePaths = workflow === "text-intelligence" ? textIntelligencePaths : workflow === "temporary-token" ? tokenPaths : workflow === "tts" || workflow === "trusted-voice" ? ttsPaths : transcriptPaths;
  return [
    file({
      path: "go.mod",
      role: "Tiny Go module definition for the sample.",
      side: "Config",
      language: "Go",
      code: "module deepgram-code-lab\n\ngo 1.22",
      whereItFits: "Keeps the sample runnable with the Go toolchain.",
      requestFlow: directFlow,
      responsePaths,
      environmentVariables: envKey,
      securityNotes: ["Use os.Getenv for secrets."],
    }),
    file({
      path: "main.go",
      role: "Go net/http example for the selected workflow.",
      side: "CLI",
      language: "Go",
      code: goCodeFor(workflow),
      whereItFits: "Good reference for services, workers, and command-line utilities.",
      requestFlow: workflow === "live-mic" || workflow === "voice-agent" || workflow === "temporary-token" ? ["Go process", "Deepgram token grant or realtime adapter"] : directFlow,
      responsePaths: workflow === "live-mic" || workflow === "voice-agent" ? livePaths : responsePaths,
      environmentVariables: envKey,
      securityNotes: ["Keep API key in the process environment.", "Handle non-2xx responses before parsing output."],
    }),
  ];
}

function dotNetFiles(workflow: CodeLabWorkflowId): CodeLabFile[] {
  if (workflow === "audio-signal") return [file({
    path: "Program.cs",
    role: "Demonstrates byte[], Stream, ClientWebSocket ownership, and cancellation.",
    side: "CLI",
    language: ".NET",
    code: `using var stream = File.OpenRead("YOUR_AUDIO.wav");
using var cancellation = new CancellationTokenSource();
var buffer = new byte[3200];

while (true)
{
    var read = await stream.ReadAsync(buffer, cancellation.Token);
    if (read == 0) break;
    AnalyzeLocally(buffer.AsSpan(0, read));
}

// A ClientWebSocket adapter must share the same CancellationToken and close cleanly.`,
    whereItFits: "Local inspection and the ownership model for a future bounded streaming adapter.",
    requestFlow: ["Stream", "byte[]", "local analysis", "CancellationToken"],
    responsePaths: ["bounded byte spans", "cancellation", "cleanup"],
    environmentVariables: [],
    securityNotes: ["No arbitrary code execution in the lab.", "Avoid logging audio buffers or Authorization headers."],
  })];
  const responsePaths = workflow === "text-intelligence" ? textIntelligencePaths : workflow === "temporary-token" ? tokenPaths : workflow === "tts" || workflow === "trusted-voice" ? ttsPaths : transcriptPaths;
  return [
    file({
      path: "appsettings.example.json",
      role: "Documents configuration shape without storing a real secret.",
      side: "Config",
      language: ".NET",
      code: '{\n  "Deepgram": {\n    "ApiKeyEnvironmentVariable": "DEEPGRAM_API_KEY"\n  }\n}',
      whereItFits: "Production apps should use user secrets, environment variables, or managed secret stores.",
      requestFlow: directFlow,
      responsePaths,
      environmentVariables: envKey,
      securityNotes: ["Do not place the real key in appsettings checked into source control."],
    }),
    file({
      path: "Program.cs",
      role: ".NET HttpClient example for the selected workflow.",
      side: "CLI",
      language: ".NET",
      code: dotNetCodeFor(workflow),
      whereItFits: "Maps to ASP.NET services, console tools, and backend integrations.",
      requestFlow: workflow === "live-mic" || workflow === "voice-agent" || workflow === "temporary-token" ? ["C# service", "Deepgram auth grant or realtime adapter"] : directFlow,
      responsePaths: workflow === "live-mic" || workflow === "voice-agent" ? livePaths : responsePaths,
      environmentVariables: envKey,
      securityNotes: ["Use Environment.GetEnvironmentVariable.", "Avoid logging request headers."],
    }),
  ];
}

function cxxFiles(workflow: CodeLabWorkflowId): CodeLabFile[] {
  const audioCode = `#include <algorithm>
#include <atomic>
#include <cstdint>
#include <span>
#include <vector>

class AudioRingBuffer {
 public:
  bool try_push(std::span<const std::int16_t> callback_samples) noexcept {
    // Copy into preallocated storage; never allocate, block, or call the network on the audio callback.
    return copy_into_bounded_ring(callback_samples);
  }
  void cancel() noexcept { cancelled_.store(true, std::memory_order_release); }
 private:
  std::atomic_bool cancelled_{false};
};`;
  return [file({
    path: workflow === "audio-signal" ? "audio_ring_buffer.cpp" : "transport_adapter_concept.cpp",
    role: workflow === "audio-signal" ? "C++20 sample-buffer and callback-thread-safety concept." : "C++20 transport ownership concept; endpoint/library verification remains required.",
    side: "CLI",
    language: "C++20",
    code: audioCode,
    whereItFits: "Native capture callbacks feed a bounded ring buffer; a non-realtime worker owns analysis or network transport.",
    requestFlow: ["int16_t callback samples", "bounded ring buffer", "worker thread", "cancellation"],
    responsePaths: ["sample buffers", "queue depth", "dropped-frame counter", "cleanup state"],
    environmentVariables: [],
    securityNotes: ["Never block or allocate in the realtime callback.", "No C++ SDK or WebSocket package is assumed."],
  })];
}

export const CODE_LAB_WORKFLOWS: CodeLabWorkflow[] = [
  workflow("transcribe-url", "Transcribe hosted audio URL", "Send a public audio URL to Deepgram prerecorded transcription.", "transcribe-url", transcribeUrlTypeScript),
  workflow("upload-audio", "Transcribe uploaded file", "Upload browser audio bytes to your server, then forward them to Deepgram.", "upload-audio", uploadTypeScript),
  workflow("audio-signal", "Audio Signal Lab implementation", "Inspect browser audio, formats, chunks, fixtures, offline variants, and cleanup without automatic Deepgram requests.", "audio-signal-lab", audioSignalTypeScript),
  workflow(
    "live-mic",
    "Browser live microphone with temporary token",
    "Request a temporary bearer token, open the WebSocket, then start MediaRecorder and stream transcript events.",
    "live-mic",
    liveMicTypeScript,
    { failureModes: liveMicFailureModes, fallbackNote: liveMicFallbackNote },
  ),
  workflow("tts", "Text to Speech", "Generate playable audio through the server-side Deepgram Speak route.", "tts", ttsTypeScript),
  workflow("text-intelligence", "Text Intelligence Analysis", "Analyze existing text or an STT transcript with summary, topics, intents, and sentiment through the local server route.", "api-studio", textIntelligenceTypeScript),
  workflow("temporary-token", "Temporary Token Auth", "Exchange the server-side API key for a short-lived realtime credential and consume it from memory.", "api-studio", temporaryTokenTypeScript),
  workflow("voice-agent", "Voice Agent concept", "Educational placement map for a future voice-agent surface. This lab does not execute agent code.", "code-lab", voiceAgentTypeScript),
  workflow("trusted-voice", "Trusted Voice: Familiar Care", "Consent-first routine messages with server-enforced disclosure, privacy, fallback, and approved Aura TTS.", "trusted-voice", trustedVoiceTypeScript),
];

export function getCodeLabWorkflow(id: CodeLabWorkflowId) {
  return CODE_LAB_WORKFLOWS.find((workflowItem) => workflowItem.id === id) || CODE_LAB_WORKFLOWS[0];
}

export function workflowForModule(moduleId: LabModuleId): CodeLabWorkflowId {
  if (moduleId === "audio-signal-lab") return "audio-signal";
  if (moduleId === "upload-audio") return "upload-audio";
  if (moduleId === "live-mic") return "live-mic";
  if (moduleId === "tts" || moduleId === "flux-tts") return "tts";
  if (moduleId === "trusted-voice") return "trusted-voice";
  if (moduleId === "api-studio") return "text-intelligence";
  if (moduleId === "transcribe-url" || moduleId === "language-explorer" || moduleId === "sample-library") return "transcribe-url";
  return "transcribe-url";
}

function workflow(
  id: CodeLabWorkflowId,
  title: string,
  description: string,
  relatedModule: LabModuleId,
  typeScriptFiles: CodeLabFile[],
  guidance: Pick<CodeLabWorkflow, "failureModes" | "fallbackNote"> = {},
): CodeLabWorkflow {
  return {
    id,
    title,
    description,
    relatedModule,
    ...guidance,
    filesByLanguage: {
      Shell: shellFiles(id),
      Python: pythonFiles(id),
      TypeScript: typeScriptFiles,
      Go: goFiles(id),
      ".NET": dotNetFiles(id),
      "C++20": cxxFiles(id),
    },
  };
}

function shellCodeFor(workflow: CodeLabWorkflowId) {
  if (workflow === "tts" || workflow === "trusted-voice") {
    return String.raw`curl -X POST "https://api.deepgram.com/v1/speak?model=aura-2-harmonia-en&encoding=mp3" \
  -H "Authorization: Token $DEEPGRAM_API_KEY" \
  -H "Content-Type: application/json" \
  -o output.mp3 \
  -d '{"text":"Hello Jordan. This is an automated appointment reminder."}'`;
  }

  if (workflow === "live-mic" || workflow === "voice-agent" || workflow === "temporary-token") {
    return String.raw`curl -X POST "https://api.deepgram.com/v1/auth/grant" \
  -H "Authorization: Token $DEEPGRAM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"ttl_seconds":60}'`;
  }

  if (workflow === "text-intelligence") {
    return String.raw`curl -X POST "https://api.deepgram.com/v1/read?language=en&summarize=true&topics=true&intents=true&sentiment=true" \
  -H "Authorization: Token $DEEPGRAM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text":"The customer accepted a replacement and requested email confirmation."}'`;
  }

  if (workflow === "upload-audio") {
    return String.raw`curl -X POST "https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true" \
  -H "Authorization: Token $DEEPGRAM_API_KEY" \
  -H "Content-Type: audio/wav" \
  --data-binary @YOUR_FILE_PATH`;
  }

  return String.raw`curl -X POST "https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true" \
  -H "Authorization: Token $DEEPGRAM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"YOUR_AUDIO_URL"}'`;
}

function pythonPathFor(workflow: CodeLabWorkflowId) {
  if (workflow === "tts") return "text_to_speech.py";
  if (workflow === "trusted-voice") return "trusted_voice.py";
  if (workflow === "live-mic") return "live_mic_concept.py";
  if (workflow === "voice-agent") return "voice_agent_concept.py";
  if (workflow === "temporary-token") return "temporary_token.py";
  if (workflow === "text-intelligence") return "analyze_text.py";
  if (workflow === "upload-audio") return "transcribe_file.py";
  return "transcribe_url.py";
}

function pythonCodeFor(workflow: CodeLabWorkflowId) {
  if (workflow === "tts" || workflow === "trusted-voice") {
    return String.raw`import os
import requests

text = "Hello Jordan. This is an automated appointment reminder."
response = requests.post(
    "https://api.deepgram.com/v1/speak",
    params={"model": "aura-2-harmonia-en", "encoding": "mp3"},
    headers={
        "Authorization": f"Token {os.environ['DEEPGRAM_API_KEY']}",
        "Content-Type": "application/json",
    },
    json={"text": text},
)
response.raise_for_status()
open("output.mp3", "wb").write(response.content)`;
  }

  if (workflow === "live-mic" || workflow === "voice-agent" || workflow === "temporary-token") {
    return String.raw`import os
import requests

# Browser microphone streaming belongs in the browser.
# Python can still demonstrate the short-lived token grant.
response = requests.post(
    "https://api.deepgram.com/v1/auth/grant",
    headers={"Authorization": f"Token {os.environ['DEEPGRAM_API_KEY']}"},
    json={"ttl_seconds": 60},
)
print(response.json()["expires_in"])`;
  }

  if (workflow === "text-intelligence") {
    return String.raw`import os
import requests

response = requests.post(
    "https://api.deepgram.com/v1/read",
    params={"language": "en", "summarize": "true", "topics": "true", "intents": "true", "sentiment": "true"},
    headers={"Authorization": f"Token {os.environ['DEEPGRAM_API_KEY']}"},
    json={"text": "The customer accepted a replacement and requested email confirmation."},
)
response.raise_for_status()
print(response.json()["results"]["summary"]["results"]["summary"]["text"])`;
  }

  if (workflow === "upload-audio") {
    return String.raw`import os
import requests

with open("YOUR_FILE_PATH", "rb") as audio:
    response = requests.post(
        "https://api.deepgram.com/v1/listen",
        params={"model": "nova-3", "language": "en", "smart_format": "true"},
        headers={"Authorization": f"Token {os.environ['DEEPGRAM_API_KEY']}", "Content-Type": "audio/wav"},
        data=audio,
    )
print(response.json()["results"]["channels"][0]["alternatives"][0]["transcript"])`;
  }

  return String.raw`import os
import requests

response = requests.post(
    "https://api.deepgram.com/v1/listen",
    params={"model": "nova-3", "language": "en", "smart_format": "true"},
    headers={"Authorization": f"Token {os.environ['DEEPGRAM_API_KEY']}"},
    json={"url": "YOUR_AUDIO_URL"},
)
print(response.json()["results"]["channels"][0]["alternatives"][0]["transcript"])`;
}

function goCodeFor(workflow: CodeLabWorkflowId) {
  if (workflow === "tts" || workflow === "trusted-voice") {
    return String.raw`package main

import (
  "bytes"
  "io"
  "net/http"
  "os"
)

func main() {
  body := []byte(` + "`" + `{"text":"Hello Jordan. This is an automated appointment reminder."}` + "`" + `)
  req, _ := http.NewRequest("POST", "https://api.deepgram.com/v1/speak?model=aura-2-harmonia-en&encoding=mp3", bytes.NewReader(body))
  req.Header.Set("Authorization", "Token "+os.Getenv("DEEPGRAM_API_KEY"))
  req.Header.Set("Content-Type", "application/json")
  res, _ := http.DefaultClient.Do(req)
  defer res.Body.Close()
  audio, _ := io.ReadAll(res.Body)
  os.WriteFile("output.mp3", audio, 0644)
}`;
  }

  if (workflow === "live-mic" || workflow === "voice-agent" || workflow === "temporary-token") {
    return String.raw`package main

import (
  "bytes"
  "net/http"
  "os"
)

func main() {
  body := []byte(` + "`" + `{"ttl_seconds":60}` + "`" + `)
  req, _ := http.NewRequest("POST", "https://api.deepgram.com/v1/auth/grant", bytes.NewReader(body))
  req.Header.Set("Authorization", "Token "+os.Getenv("DEEPGRAM_API_KEY"))
  req.Header.Set("Content-Type", "application/json")
  http.DefaultClient.Do(req)
}`;
  }

  if (workflow === "text-intelligence") {
    return String.raw`package main

import (
  "bytes"
  "net/http"
  "os"
)

func main() {
  body := []byte(` + "`" + `{"text":"The customer accepted a replacement and requested email confirmation."}` + "`" + `)
  req, _ := http.NewRequest("POST", "https://api.deepgram.com/v1/read?language=en&summarize=true&topics=true&intents=true&sentiment=true", bytes.NewReader(body))
  req.Header.Set("Authorization", "Token "+os.Getenv("DEEPGRAM_API_KEY"))
  req.Header.Set("Content-Type", "application/json")
  http.DefaultClient.Do(req)
}`;
  }

  if (workflow === "upload-audio") {
    return String.raw`package main

import (
  "bytes"
  "net/http"
  "os"
)

func main() {
  audio, _ := os.ReadFile("YOUR_FILE_PATH")
  req, _ := http.NewRequest("POST", "https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true", bytes.NewReader(audio))
  req.Header.Set("Authorization", "Token "+os.Getenv("DEEPGRAM_API_KEY"))
  req.Header.Set("Content-Type", "audio/wav")
  http.DefaultClient.Do(req)
}`;
  }

  return String.raw`package main

import (
  "bytes"
  "net/http"
  "os"
)

func main() {
  body := []byte(` + "`" + `{"url":"YOUR_AUDIO_URL"}` + "`" + `)
  req, _ := http.NewRequest("POST", "https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true", bytes.NewReader(body))
  req.Header.Set("Authorization", "Token "+os.Getenv("DEEPGRAM_API_KEY"))
  req.Header.Set("Content-Type", "application/json")
  http.DefaultClient.Do(req)
}`;
}

function dotNetCodeFor(workflow: CodeLabWorkflowId) {
  if (workflow === "tts" || workflow === "trusted-voice") {
    return String.raw`using System.Net.Http.Headers;
using System.Text;

var text = "Hello Jordan. This is an automated appointment reminder.";
var json = System.Text.Json.JsonSerializer.Serialize(new { text });

using var client = new HttpClient();
client.DefaultRequestHeaders.Authorization =
  new AuthenticationHeaderValue("Token", Environment.GetEnvironmentVariable("DEEPGRAM_API_KEY"));

var response = await client.PostAsync(
  "https://api.deepgram.com/v1/speak?model=aura-2-harmonia-en&encoding=mp3",
  new StringContent(json, Encoding.UTF8, "application/json"));
var audio = await response.Content.ReadAsByteArrayAsync();
await File.WriteAllBytesAsync("output.mp3", audio);`;
  }

  if (workflow === "live-mic" || workflow === "voice-agent" || workflow === "temporary-token") {
    return String.raw`using System.Net.Http.Headers;
using System.Text;

using var client = new HttpClient();
client.DefaultRequestHeaders.Authorization =
  new AuthenticationHeaderValue("Token", Environment.GetEnvironmentVariable("DEEPGRAM_API_KEY"));

var response = await client.PostAsync(
  "https://api.deepgram.com/v1/auth/grant",
  new StringContent("""{"ttl_seconds":60}""", Encoding.UTF8, "application/json"));
Console.WriteLine(await response.Content.ReadAsStringAsync());`;
  }

  if (workflow === "text-intelligence") {
    return String.raw`using System.Net.Http.Headers;
using System.Text;

using var client = new HttpClient();
client.DefaultRequestHeaders.Authorization =
  new AuthenticationHeaderValue("Token", Environment.GetEnvironmentVariable("DEEPGRAM_API_KEY"));

var response = await client.PostAsync(
  "https://api.deepgram.com/v1/read?language=en&summarize=true&topics=true&intents=true&sentiment=true",
  new StringContent("""{"text":"The customer accepted a replacement and requested email confirmation."}""", Encoding.UTF8, "application/json"));
Console.WriteLine(await response.Content.ReadAsStringAsync());`;
  }

  if (workflow === "upload-audio") {
    return String.raw`using System.Net.Http.Headers;

var audio = await File.ReadAllBytesAsync("YOUR_FILE_PATH");
using var content = new ByteArrayContent(audio);
content.Headers.ContentType = new MediaTypeHeaderValue("audio/wav");

using var client = new HttpClient();
client.DefaultRequestHeaders.Authorization =
  new AuthenticationHeaderValue("Token", Environment.GetEnvironmentVariable("DEEPGRAM_API_KEY"));
await client.PostAsync("https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true", content);`;
  }

  return String.raw`using System.Net.Http.Headers;
using System.Text;

using var client = new HttpClient();
client.DefaultRequestHeaders.Authorization =
  new AuthenticationHeaderValue("Token", Environment.GetEnvironmentVariable("DEEPGRAM_API_KEY"));

var json = """{"url":"YOUR_AUDIO_URL"}""";
var response = await client.PostAsync(
  "https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true",
  new StringContent(json, Encoding.UTF8, "application/json"));
Console.WriteLine(await response.Content.ReadAsStringAsync());`;
}
