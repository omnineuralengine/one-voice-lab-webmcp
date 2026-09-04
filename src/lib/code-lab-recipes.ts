import type { CodeLabLanguage } from "@/lib/code-lab-files";

export type ClientTypeId =
  | "saas-support"
  | "contact-center"
  | "telehealth"
  | "fintech-fraud-ops"
  | "ecommerce-helpdesk"
  | "media-podcast"
  | "education-advising"
  | "internal-ai-tooling"
  | "custom";

export type ArchitectureId =
  | "nextjs-full-stack"
  | "react-node"
  | "python-fastapi"
  | "go-service"
  | "dotnet-api"
  | "serverless-functions"
  | "cli-batch";

export type AudioSourceId =
  | "hosted-audio-url"
  | "file-upload"
  | "browser-microphone"
  | "call-recording"
  | "live-websocket-stream"
  | "radio-media-stream";

export type DeepgramProductId =
  | "prerecorded-stt"
  | "live-streaming-stt"
  | "text-to-speech"
  | "temporary-token-auth"
  | "payload-inspector"
  | "voice-agent-concept";

export type OutputDestinationId =
  | "browser-transcript-ui"
  | "database"
  | "crm-ticket"
  | "slack-alert"
  | "email-summary"
  | "json-webhook"
  | "local-file";

export type SecurityPostureId =
  | "server-api-key-only"
  | "temporary-browser-token"
  | "no-client-secrets"
  | "redacted-payload-logs"
  | "rate-limited-api-route";

export type InsertionLayer =
  | "frontend"
  | "backend"
  | "api-route"
  | "worker"
  | "cli"
  | "database"
  | "external-system";

export type RecipeFileRuntime = "browser" | "server" | "local" | "configuration";

export type RecipeOption<T extends string> = {
  id: T;
  label: string;
};

export const CLIENT_TYPE_OPTIONS: readonly RecipeOption<ClientTypeId>[] = [
  { id: "saas-support", label: "SaaS Support Platform" },
  { id: "contact-center", label: "Contact Center" },
  { id: "telehealth", label: "Telehealth Platform" },
  { id: "fintech-fraud-ops", label: "Fintech Fraud Ops" },
  { id: "ecommerce-helpdesk", label: "E-commerce Helpdesk" },
  { id: "media-podcast", label: "Media / Podcast Platform" },
  { id: "education-advising", label: "Education Advising" },
  { id: "internal-ai-tooling", label: "Internal AI Tooling" },
  { id: "custom", label: "Custom" },
];

export const ARCHITECTURE_OPTIONS: readonly RecipeOption<ArchitectureId>[] = [
  { id: "nextjs-full-stack", label: "Next.js full-stack app" },
  { id: "react-node", label: "React frontend + Node backend" },
  { id: "python-fastapi", label: "Python FastAPI backend" },
  { id: "go-service", label: "Go service" },
  { id: "dotnet-api", label: ".NET API" },
  { id: "serverless-functions", label: "Serverless functions" },
  { id: "cli-batch", label: "CLI / batch job" },
];

export const AUDIO_SOURCE_OPTIONS: readonly RecipeOption<AudioSourceId>[] = [
  { id: "hosted-audio-url", label: "Hosted audio URL" },
  { id: "file-upload", label: "File upload" },
  { id: "browser-microphone", label: "Browser microphone" },
  { id: "call-recording", label: "Call recording" },
  { id: "live-websocket-stream", label: "Live WebSocket stream" },
  { id: "radio-media-stream", label: "Radio/media stream" },
];

export const DEEPGRAM_PRODUCT_OPTIONS: readonly RecipeOption<DeepgramProductId>[] = [
  { id: "prerecorded-stt", label: "Pre-recorded Speech-to-Text" },
  { id: "live-streaming-stt", label: "Live Streaming Speech-to-Text" },
  { id: "text-to-speech", label: "Text-to-Speech" },
  { id: "temporary-token-auth", label: "Temporary Token Auth" },
  { id: "payload-inspector", label: "Payload Inspector / Debugging" },
  { id: "voice-agent-concept", label: "Voice Agent concept" },
];

export const OUTPUT_DESTINATION_OPTIONS: readonly RecipeOption<OutputDestinationId>[] = [
  { id: "browser-transcript-ui", label: "Browser transcript UI" },
  { id: "database", label: "Database" },
  { id: "crm-ticket", label: "CRM ticket" },
  { id: "slack-alert", label: "Slack alert" },
  { id: "email-summary", label: "Email summary" },
  { id: "json-webhook", label: "JSON webhook" },
  { id: "local-file", label: "Local file" },
];

export const SECURITY_POSTURE_OPTIONS: readonly RecipeOption<SecurityPostureId>[] = [
  { id: "server-api-key-only", label: "Server-side API key only" },
  { id: "temporary-browser-token", label: "Temporary browser token" },
  { id: "no-client-secrets", label: "No secrets in client bundle" },
  { id: "redacted-payload-logs", label: "Redacted payload logs" },
  { id: "rate-limited-api-route", label: "Rate-limited API route" },
];

export type InsertionPattern = {
  id: string;
  name: string;
  layer: InsertionLayer;
  purpose: string;
  risks: string[];
  filesTouched: string[];
  codeSnippetReference: string;
  removable: boolean;
  custom?: boolean;
};

export const DEFAULT_INSERTION_PATTERNS: readonly InsertionPattern[] = [
  {
    id: "frontend-local-api",
    name: "Frontend button calls local API route",
    layer: "frontend",
    purpose: "Keep provider credentials behind an application-owned server boundary.",
    risks: ["Unvalidated input", "Accidentally calling Deepgram with a permanent key from browser code"],
    filesTouched: ["browser component", "local API client"],
    codeSnippetReference: "Client fetch to a local /api/deepgram route",
    removable: false,
  },
  {
    id: "server-calls-deepgram",
    name: "Server API route calls Deepgram",
    layer: "api-route",
    purpose: "Validate requests, attach server credentials, and sanitize provider responses.",
    risks: ["Missing authentication", "Missing timeout or body-size limits", "Leaking provider errors"],
    filesTouched: ["server route", "Deepgram client"],
    codeSnippetReference: "Server-side fetch to Deepgram /v1/listen",
    removable: false,
  },
  {
    id: "browser-temporary-token",
    name: "Browser mic uses temporary token",
    layer: "api-route",
    purpose: "Authorize a short-lived browser WebSocket without exposing the main API key.",
    risks: ["Caching temporary tokens", "Granting tokens without app-level authorization", "Token expiry"],
    filesTouched: ["browser mic component", "temporary token route"],
    codeSnippetReference: "Auth grant route plus browser WebSocket subprotocol",
    removable: false,
  },
  {
    id: "upload-file-to-server",
    name: "Upload form sends file to server",
    layer: "frontend",
    purpose: "Move recorded or uploaded audio through a controlled multipart endpoint.",
    risks: ["Oversized uploads", "Unsupported content types", "Persisting sensitive recordings"],
    filesTouched: ["upload form", "multipart API route"],
    codeSnippetReference: "FormData upload to /api/deepgram/transcribe-file",
    removable: false,
  },
  {
    id: "store-transcript-database",
    name: "Backend stores transcript in database",
    layer: "database",
    purpose: "Persist finalized transcript data for an application workflow.",
    risks: ["Storing interim duplicates", "Unbounded retention", "Missing tenant isolation"],
    filesTouched: ["transcript repository", "database schema"],
    codeSnippetReference: "Save final transcript with request and tenant identifiers",
    removable: false,
  },
  {
    id: "webhook-to-crm",
    name: "Webhook sends transcript to CRM/helpdesk",
    layer: "external-system",
    purpose: "Deliver a finalized transcript into the system where an operator works.",
    risks: ["Duplicate tickets", "Sensitive text in third-party logs", "Unverified webhook destinations"],
    filesTouched: ["CRM adapter", "delivery route"],
    codeSnippetReference: "Idempotent server-side CRM ticket request",
    removable: false,
  },
  {
    id: "tts-playable-audio",
    name: "TTS route returns playable audio",
    layer: "api-route",
    purpose: "Generate speech on the server and return audio bytes to a controlled player.",
    risks: ["Unsupported voices", "Unbounded text input", "Leaking object URLs"],
    filesTouched: ["message form", "TTS API route", "audio player"],
    codeSnippetReference: "Server-side /v1/speak request and browser Blob playback",
    removable: false,
  },
  {
    id: "cli-batch-transcription",
    name: "CLI script runs batch transcription",
    layer: "cli",
    purpose: "Provide a small local debugging and repeatable batch workflow.",
    risks: ["Shell history leaks", "Unbounded retries", "Overwriting output files"],
    filesTouched: ["CLI script", "local environment"],
    codeSnippetReference: "Environment-backed curl or SDK batch script",
    removable: false,
  },
  {
    id: "worker-process-recordings",
    name: "Worker job processes recordings",
    layer: "worker",
    purpose: "Move long-running or high-volume recordings out of request/response latency.",
    risks: ["Duplicate jobs", "Missing retry limits", "Orphaned source recordings"],
    filesTouched: ["recording worker", "job payload"],
    codeSnippetReference: "Idempotent recording job with bounded retries",
    removable: false,
  },
  {
    id: "sanitized-payload-inspector",
    name: "Payload inspector logs sanitized request/response",
    layer: "backend",
    purpose: "Make request flow diagnosable without exposing credentials or raw audio bytes.",
    risks: ["Logging authorization headers", "Logging temporary tokens", "Retaining sensitive transcripts"],
    filesTouched: ["inspection helper", "result panel"],
    codeSnippetReference: "Redacted request, response, and timeline envelope",
    removable: false,
  },
] as const;

export type IntegrationRecipe = {
  clientType: ClientTypeId;
  customClientType?: string;
  architecture: ArchitectureId;
  audioSource: AudioSourceId;
  deepgramProduct: DeepgramProductId;
  outputDestination: OutputDestinationId;
  securityPostures: SecurityPostureId[];
  selectedPatternIds: string[];
};

export type RecipePreset = {
  id: string;
  name: string;
  description: string;
  recipe: IntegrationRecipe;
};

export const RECIPE_PRESETS: readonly RecipePreset[] = [
  {
    id: "saas-support-webhook-debugger",
    name: "SaaS Support Webhook Debugger",
    description: "Inspect a hosted recording or upload before sending its transcript to a support ticket.",
    recipe: {
      clientType: "saas-support",
      architecture: "nextjs-full-stack",
      audioSource: "hosted-audio-url",
      deepgramProduct: "prerecorded-stt",
      outputDestination: "crm-ticket",
      securityPostures: ["server-api-key-only", "no-client-secrets", "redacted-payload-logs"],
      selectedPatternIds: [
        "frontend-local-api",
        "server-calls-deepgram",
        "webhook-to-crm",
        "sanitized-payload-inspector",
      ],
    },
  },
  {
    id: "contact-center-live-assist",
    name: "Contact Center Live Assist",
    description: "Stream browser or call audio and send final transcript segments into a CRM workflow.",
    recipe: {
      clientType: "contact-center",
      architecture: "react-node",
      audioSource: "browser-microphone",
      deepgramProduct: "live-streaming-stt",
      outputDestination: "crm-ticket",
      securityPostures: [
        "server-api-key-only",
        "temporary-browser-token",
        "no-client-secrets",
        "redacted-payload-logs",
        "rate-limited-api-route",
      ],
      selectedPatternIds: [
        "browser-temporary-token",
        "webhook-to-crm",
        "sanitized-payload-inspector",
      ],
    },
  },
  {
    id: "telehealth-appointment-notes",
    name: "Telehealth Appointment Notes",
    description: "Upload an appointment recording and produce a privacy-sensitive clinical note draft.",
    recipe: {
      clientType: "telehealth",
      architecture: "python-fastapi",
      audioSource: "file-upload",
      deepgramProduct: "prerecorded-stt",
      outputDestination: "database",
      securityPostures: [
        "server-api-key-only",
        "no-client-secrets",
        "redacted-payload-logs",
        "rate-limited-api-route",
      ],
      selectedPatternIds: [
        "upload-file-to-server",
        "server-calls-deepgram",
        "store-transcript-database",
        "sanitized-payload-inspector",
      ],
    },
  },
  {
    id: "fintech-fraud-call-review",
    name: "Fintech Fraud Call Review",
    description: "Transcribe call recordings with smart formatting for a controlled case review.",
    recipe: {
      clientType: "fintech-fraud-ops",
      architecture: "dotnet-api",
      audioSource: "call-recording",
      deepgramProduct: "prerecorded-stt",
      outputDestination: "database",
      securityPostures: [
        "server-api-key-only",
        "no-client-secrets",
        "redacted-payload-logs",
        "rate-limited-api-route",
      ],
      selectedPatternIds: [
        "upload-file-to-server",
        "server-calls-deepgram",
        "store-transcript-database",
        "sanitized-payload-inspector",
      ],
    },
  },
  {
    id: "media-podcast-clip-generator",
    name: "Media Podcast Clip Generator",
    description: "Batch hosted media URLs into timestamped transcript files for clip selection.",
    recipe: {
      clientType: "media-podcast",
      architecture: "cli-batch",
      audioSource: "hosted-audio-url",
      deepgramProduct: "prerecorded-stt",
      outputDestination: "local-file",
      securityPostures: ["server-api-key-only", "redacted-payload-logs"],
      selectedPatternIds: ["cli-batch-transcription", "worker-process-recordings"],
    },
  },
  {
    id: "voice-notification-prototype",
    name: "Voice Notification Prototype",
    description: "Generate a notification with an approved Deepgram voice and play it in the browser.",
    recipe: {
      clientType: "internal-ai-tooling",
      architecture: "nextjs-full-stack",
      audioSource: "hosted-audio-url",
      deepgramProduct: "text-to-speech",
      outputDestination: "browser-transcript-ui",
      securityPostures: ["server-api-key-only", "no-client-secrets", "rate-limited-api-route"],
      selectedPatternIds: ["frontend-local-api", "server-calls-deepgram", "tts-playable-audio"],
    },
  },
] as const;

export const DEFAULT_INTEGRATION_RECIPE: IntegrationRecipe = {
  ...RECIPE_PRESETS[0].recipe,
  securityPostures: [...RECIPE_PRESETS[0].recipe.securityPostures],
  selectedPatternIds: [...RECIPE_PRESETS[0].recipe.selectedPatternIds],
};

export type RecipeFileTeaching = {
  fileRole: string;
  layer: InsertionLayer | "config" | "shared";
  runtime: RecipeFileRuntime;
  canAccessDeepgramApiKey: boolean;
  callsDeepgramDirectly: boolean;
  receivesRawAudio: boolean;
  receivesTranscriptJson: boolean;
  commonMistakes: string[];
  productionNotes: string[];
};

export type RecipeStarterFile = RecipeFileTeaching & {
  path: string;
  language: CodeLabLanguage;
  code: string;
  source: "architecture" | "pattern";
  deletable: boolean;
  patternIds: string[];
};

type StarterFileInput = Omit<RecipeStarterFile, "source" | "deletable" | "patternIds"> &
  Partial<Pick<RecipeStarterFile, "source" | "deletable" | "patternIds">>;

function starterFile(input: StarterFileInput): RecipeStarterFile {
  return {
    ...input,
    source: input.source ?? "architecture",
    deletable: input.deletable ?? false,
    patternIds: input.patternIds ?? [],
  };
}

const serverMistakes = [
  "Returning Authorization headers to the browser",
  "Skipping input validation, timeouts, or response checks",
];

const browserMistakes = [
  "Reading DEEPGRAM_API_KEY in client code",
  "Calling a permanent-key provider endpoint from the browser",
];

const envNotes = ["Keep the real value outside version control.", "Use separate least-privilege keys per environment."];

const ARCHITECTURE_STARTER_FILES: Record<ArchitectureId, RecipeStarterFile[]> = {
  "nextjs-full-stack": [
    starterFile({
      path: ".env.local",
      language: "TypeScript",
      code: "DEEPGRAM_API_KEY=YOUR_DEEPGRAM_API_KEY\n",
      fileRole: "Server-only local environment configuration.",
      layer: "config",
      runtime: "configuration",
      canAccessDeepgramApiKey: true,
      callsDeepgramDirectly: false,
      receivesRawAudio: false,
      receivesTranscriptJson: false,
      commonMistakes: ["Prefixing the key with NEXT_PUBLIC_", "Committing .env.local"],
      productionNotes: envNotes,
    }),
    starterFile({
      path: "src/app/page.tsx",
      language: "TypeScript",
      code: String.raw`import { TranscriptViewer } from "@/components/TranscriptViewer";

export default function Page() {
  return <TranscriptViewer />;
}
`,
      fileRole: "Application entry point for the transcript workflow.",
      layer: "frontend",
      runtime: "browser",
      canAccessDeepgramApiKey: false,
      callsDeepgramDirectly: false,
      receivesRawAudio: false,
      receivesTranscriptJson: true,
      commonMistakes: browserMistakes,
      productionNotes: ["Keep provider calls behind local routes unless using a temporary live token."],
    }),
    starterFile({
      path: "src/app/api/deepgram/transcribe-url/route.ts",
      language: "TypeScript",
      code: String.raw`import { NextResponse } from "next/server";
import { transcribeUrl } from "@/lib/deepgram";

export async function POST(request: Request) {
  const { url = "YOUR_AUDIO_URL" } = await request.json();
  const result = await transcribeUrl(url);
  return NextResponse.json({ ok: true, transcript: result.transcript, raw: result.raw });
}
`,
      fileRole: "Server trust boundary for hosted-audio transcription.",
      layer: "api-route",
      runtime: "server",
      canAccessDeepgramApiKey: true,
      callsDeepgramDirectly: true,
      receivesRawAudio: false,
      receivesTranscriptJson: true,
      commonMistakes: serverMistakes,
      productionNotes: ["Validate URL schemes and block private-network fetches.", "Rate-limit authenticated callers."],
    }),
    starterFile({
      path: "src/app/api/deepgram/token/route.ts",
      language: "TypeScript",
      code: String.raw`import { NextResponse } from "next/server";

export async function POST() {
  const response = await fetch("https://api.deepgram.com/v1/auth/grant", {
    method: "POST",
    headers: { Authorization: "Token " + process.env.DEEPGRAM_API_KEY },
  });
  const grant = await response.json();
  return NextResponse.json({ access_token: grant.access_token, expires_in: grant.expires_in });
}
`,
      fileRole: "Creates a short-lived browser credential for live transcription.",
      layer: "api-route",
      runtime: "server",
      canAccessDeepgramApiKey: true,
      callsDeepgramDirectly: true,
      receivesRawAudio: false,
      receivesTranscriptJson: false,
      commonMistakes: ["Returning the permanent key", "Caching grants in localStorage", "Leaving the route unauthenticated"],
      productionNotes: ["Return only the temporary token and expiry.", "Redact the grant in diagnostic logs."],
    }),
    starterFile({
      path: "src/components/TranscriptViewer.tsx",
      language: "TypeScript",
      code: String.raw`"use client";

import { useState } from "react";

export function TranscriptViewer() {
  const [transcript, setTranscript] = useState("");
  return <output aria-live="polite">{transcript || "Transcript appears here."}</output>;
}
`,
      fileRole: "Renders sanitized interim or final transcript text.",
      layer: "frontend",
      runtime: "browser",
      canAccessDeepgramApiKey: false,
      callsDeepgramDirectly: false,
      receivesRawAudio: false,
      receivesTranscriptJson: true,
      commonMistakes: browserMistakes,
      productionNotes: ["Treat transcript text as untrusted content.", "Distinguish interim from final segments."],
    }),
    starterFile({
      path: "src/lib/deepgram.ts",
      language: "TypeScript",
      code: String.raw`import "server-only";

export async function transcribeUrl(url: string) {
  const endpoint = new URL("https://api.deepgram.com/v1/listen");
  endpoint.searchParams.set("model", "nova-3");
  endpoint.searchParams.set("smart_format", "true");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: "Token " + process.env.DEEPGRAM_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url }),
  });
  if (!response.ok) throw new Error("Deepgram request failed: " + response.status);
  const raw = await response.json();
  return { transcript: raw.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "", raw };
}
`,
      fileRole: "Shared server-only Deepgram client.",
      layer: "shared",
      runtime: "server",
      canAccessDeepgramApiKey: true,
      callsDeepgramDirectly: true,
      receivesRawAudio: false,
      receivesTranscriptJson: true,
      commonMistakes: serverMistakes,
      productionNotes: ["Centralize request construction and sanitization here."],
    }),
  ],
  "react-node": [
    starterFile({
      path: ".env",
      language: "TypeScript",
      code: "DEEPGRAM_API_KEY=YOUR_DEEPGRAM_API_KEY\n",
      fileRole: "Node server environment configuration.",
      layer: "config",
      runtime: "configuration",
      canAccessDeepgramApiKey: true,
      callsDeepgramDirectly: false,
      receivesRawAudio: false,
      receivesTranscriptJson: false,
      commonMistakes: ["Bundling the key into VITE_ or REACT_APP_ variables"],
      productionNotes: envNotes,
    }),
    starterFile({
      path: "client/src/App.tsx",
      language: "TypeScript",
      code: String.raw`import { useState } from "react";

export function App() {
  const [transcript, setTranscript] = useState("");
  async function transcribe() {
    const response = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "YOUR_AUDIO_URL" }),
    });
    setTranscript((await response.json()).transcript ?? "");
  }
  return <><button onClick={transcribe}>Transcribe</button><output>{transcript}</output></>;
}
`,
      fileRole: "React client that talks only to the Node API.",
      layer: "frontend",
      runtime: "browser",
      canAccessDeepgramApiKey: false,
      callsDeepgramDirectly: false,
      receivesRawAudio: false,
      receivesTranscriptJson: true,
      commonMistakes: browserMistakes,
      productionNotes: ["Proxy local API requests during development."],
    }),
    starterFile({
      path: "server/src/index.ts",
      language: "TypeScript",
      code: String.raw`import express from "express";
import { transcribeUrl } from "./services/deepgram";

const app = express();
app.use(express.json());
app.post("/api/transcribe", async (request, response) => {
  const result = await transcribeUrl(request.body.url ?? "YOUR_AUDIO_URL");
  response.json({ transcript: result.transcript });
});
app.listen(3001);
`,
      fileRole: "Node API entry point and browser trust boundary.",
      layer: "backend",
      runtime: "server",
      canAccessDeepgramApiKey: true,
      callsDeepgramDirectly: false,
      receivesRawAudio: false,
      receivesTranscriptJson: true,
      commonMistakes: serverMistakes,
      productionNotes: ["Add authentication, validation, rate limits, and centralized errors."],
    }),
    starterFile({
      path: "server/src/services/deepgram.ts",
      language: "TypeScript",
      code: String.raw`export async function transcribeUrl(url: string) {
  const response = await fetch("https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true", {
    method: "POST",
    headers: {
      Authorization: "Token " + process.env.DEEPGRAM_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url }),
  });
  if (!response.ok) throw new Error("Deepgram request failed: " + response.status);
  const raw = await response.json();
  return { transcript: raw.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "", raw };
}
`,
      fileRole: "Node-only provider adapter.",
      layer: "backend",
      runtime: "server",
      canAccessDeepgramApiKey: true,
      callsDeepgramDirectly: true,
      receivesRawAudio: false,
      receivesTranscriptJson: true,
      commonMistakes: serverMistakes,
      productionNotes: ["Use an AbortSignal timeout and sanitize provider errors."],
    }),
  ],
  "python-fastapi": [
    starterFile({
      path: ".env",
      language: "Python",
      code: "DEEPGRAM_API_KEY=YOUR_DEEPGRAM_API_KEY\n",
      fileRole: "Local server environment configuration.",
      layer: "config",
      runtime: "configuration",
      canAccessDeepgramApiKey: true,
      callsDeepgramDirectly: false,
      receivesRawAudio: false,
      receivesTranscriptJson: false,
      commonMistakes: ["Committing .env", "Loading secrets into a browser build"],
      productionNotes: envNotes,
    }),
    starterFile({
      path: "main.py",
      language: "Python",
      code: String.raw`from fastapi import FastAPI
from routers.deepgram import router as deepgram_router

app = FastAPI()
app.include_router(deepgram_router, prefix="/api/deepgram")
`,
      fileRole: "FastAPI application entry point.",
      layer: "backend",
      runtime: "server",
      canAccessDeepgramApiKey: true,
      callsDeepgramDirectly: false,
      receivesRawAudio: false,
      receivesTranscriptJson: false,
      commonMistakes: ["Putting provider calls directly in every route"],
      productionNotes: ["Install authentication and request limits at the application boundary."],
    }),
    starterFile({
      path: "requirements.txt",
      language: "Python",
      code: "fastapi\nhttpx\npython-multipart\nuvicorn\n",
      fileRole: "Minimal Python runtime dependencies.",
      layer: "config",
      runtime: "configuration",
      canAccessDeepgramApiKey: false,
      callsDeepgramDirectly: false,
      receivesRawAudio: false,
      receivesTranscriptJson: false,
      commonMistakes: ["Leaving dependency versions unpinned in production"],
      productionNotes: ["Pin and audit dependencies before deployment."],
    }),
    starterFile({
      path: "routers/deepgram.py",
      language: "Python",
      code: String.raw`from fastapi import APIRouter, UploadFile
from services.deepgram_client import transcribe_bytes

router = APIRouter()

@router.post("/transcribe-file")
async def transcribe_file(file: UploadFile):
    audio = await file.read()
    return await transcribe_bytes(audio, file.content_type or "application/octet-stream")
`,
      fileRole: "Validated multipart upload endpoint.",
      layer: "api-route",
      runtime: "server",
      canAccessDeepgramApiKey: true,
      callsDeepgramDirectly: false,
      receivesRawAudio: true,
      receivesTranscriptJson: true,
      commonMistakes: ["Reading an unlimited upload into memory", "Trusting the filename or content type"],
      productionNotes: ["Stream or cap uploads and delete temporary audio promptly."],
    }),
    starterFile({
      path: "services/deepgram_client.py",
      language: "Python",
      code: String.raw`import os
import httpx

async def transcribe_bytes(audio: bytes, content_type: str):
    headers = {
        "Authorization": f"Token {os.environ['DEEPGRAM_API_KEY']}",
        "Content-Type": content_type,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true",
            headers=headers,
            content=audio,
        )
        response.raise_for_status()
        raw = response.json()
    return {"transcript": raw["results"]["channels"][0]["alternatives"][0]["transcript"], "raw": raw}
`,
      fileRole: "Reusable asynchronous Deepgram adapter.",
      layer: "backend",
      runtime: "server",
      canAccessDeepgramApiKey: true,
      callsDeepgramDirectly: true,
      receivesRawAudio: true,
      receivesTranscriptJson: true,
      commonMistakes: serverMistakes,
      productionNotes: ["Reuse an HTTP client and bound retries in production."],
    }),
  ],
  "go-service": [
    starterFile({
      path: ".env",
      language: "Go",
      code: "DEEPGRAM_API_KEY=YOUR_DEEPGRAM_API_KEY\n",
      fileRole: "Local Go service environment configuration.",
      layer: "config",
      runtime: "configuration",
      canAccessDeepgramApiKey: true,
      callsDeepgramDirectly: false,
      receivesRawAudio: false,
      receivesTranscriptJson: false,
      commonMistakes: ["Committing .env"],
      productionNotes: envNotes,
    }),
    starterFile({
      path: "main.go",
      language: "Go",
      code: String.raw`package main

import (
    "net/http"
    "time"
)

func main() {
    server := &http.Server{Addr: ":8080", ReadHeaderTimeout: 5 * time.Second}
    _ = server.ListenAndServe()
}
`,
      fileRole: "Go HTTP service entry point.",
      layer: "backend",
      runtime: "server",
      canAccessDeepgramApiKey: true,
      callsDeepgramDirectly: false,
      receivesRawAudio: false,
      receivesTranscriptJson: false,
      commonMistakes: ["Running an HTTP server without timeouts"],
      productionNotes: ["Add graceful shutdown and structured redacted logging."],
    }),
    starterFile({
      path: "go.mod",
      language: "Go",
      code: "module example.com/deepgram-recipe\n\ngo 1.24\n",
      fileRole: "Go module definition.",
      layer: "config",
      runtime: "configuration",
      canAccessDeepgramApiKey: false,
      callsDeepgramDirectly: false,
      receivesRawAudio: false,
      receivesTranscriptJson: false,
      commonMistakes: ["Committing generated binaries"],
      productionNotes: ["Run module and vulnerability checks in CI."],
    }),
    starterFile({
      path: "internal/deepgram/client.go",
      language: "Go",
      code: String.raw`package deepgram

import (
    "bytes"
    "context"
    "fmt"
    "net/http"
    "os"
)

func Transcribe(ctx context.Context, audio []byte, contentType string) (*http.Response, error) {
    req, err := http.NewRequestWithContext(ctx, http.MethodPost,
        "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true", bytes.NewReader(audio))
    if err != nil { return nil, err }
    req.Header.Set("Authorization", "Token "+os.Getenv("DEEPGRAM_API_KEY"))
    req.Header.Set("Content-Type", contentType)
    response, err := http.DefaultClient.Do(req)
    if err == nil && response.StatusCode >= 400 { return response, fmt.Errorf("deepgram status %d", response.StatusCode) }
    return response, err
}
`,
      fileRole: "Go Deepgram HTTP client.",
      layer: "backend",
      runtime: "server",
      canAccessDeepgramApiKey: true,
      callsDeepgramDirectly: true,
      receivesRawAudio: true,
      receivesTranscriptJson: true,
      commonMistakes: serverMistakes,
      productionNotes: ["Inject a configured HTTP client with a timeout."],
    }),
    starterFile({
      path: "internal/handlers/transcribe.go",
      language: "Go",
      code: String.raw`package handlers

import "net/http"

func Transcribe(response http.ResponseWriter, request *http.Request) {
    // Validate and cap the upload, then call internal/deepgram.
    response.Header().Set("Content-Type", "application/json")
    _, _ = response.Write([]byte("{\"ok\":true,\"transcript\":\"\"}"))
}
`,
      fileRole: "Go upload and response boundary.",
      layer: "api-route",
      runtime: "server",
      canAccessDeepgramApiKey: false,
      callsDeepgramDirectly: false,
      receivesRawAudio: true,
      receivesTranscriptJson: true,
      commonMistakes: ["Not limiting request bodies", "Writing provider errors directly"],
      productionNotes: ["Authenticate callers and emit stable error envelopes."],
    }),
  ],
  "dotnet-api": [
    starterFile({
      path: "Program.cs",
      language: ".NET",
      code: String.raw`var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers();
builder.Services.AddHttpClient<DeepgramService>();
var app = builder.Build();
app.MapControllers();
app.Run();
`,
      fileRole: ".NET API composition root.",
      layer: "backend",
      runtime: "server",
      canAccessDeepgramApiKey: true,
      callsDeepgramDirectly: false,
      receivesRawAudio: false,
      receivesTranscriptJson: false,
      commonMistakes: ["Creating a new HttpClient for every request"],
      productionNotes: ["Add authorization, rate limiting, and request-size limits."],
    }),
    starterFile({
      path: "appsettings.example.json",
      language: ".NET",
      code: String.raw`{
  "Deepgram": {
    "ApiKeyEnvironmentVariable": "DEEPGRAM_API_KEY"
  }
}
`,
      fileRole: "Non-secret configuration example.",
      layer: "config",
      runtime: "configuration",
      canAccessDeepgramApiKey: false,
      callsDeepgramDirectly: false,
      receivesRawAudio: false,
      receivesTranscriptJson: false,
      commonMistakes: ["Putting a real key in appsettings.json"],
      productionNotes: ["Use environment variables or a managed secret provider."],
    }),
    starterFile({
      path: "Controllers/DeepgramController.cs",
      language: ".NET",
      code: String.raw`using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/deepgram")]
public sealed class DeepgramController(DeepgramService deepgram) : ControllerBase
{
    [HttpPost("transcribe-file")]
    public async Task<IActionResult> Transcribe(IFormFile file, CancellationToken cancellationToken)
    {
        await using var audio = file.OpenReadStream();
        return Ok(await deepgram.TranscribeAsync(audio, file.ContentType, cancellationToken));
    }
}
`,
      fileRole: ".NET multipart API boundary.",
      layer: "api-route",
      runtime: "server",
      canAccessDeepgramApiKey: false,
      callsDeepgramDirectly: false,
      receivesRawAudio: true,
      receivesTranscriptJson: true,
      commonMistakes: ["Accepting unlimited uploads", "Ignoring cancellation"],
      productionNotes: ["Validate type and length before streaming audio."],
    }),
    starterFile({
      path: "Services/DeepgramService.cs",
      language: ".NET",
      code: String.raw`using System.Net.Http.Headers;

public sealed class DeepgramService(HttpClient httpClient)
{
    public async Task<string> TranscribeAsync(Stream audio, string contentType, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post,
            "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true");
        request.Headers.Authorization = new AuthenticationHeaderValue(
            "Token", Environment.GetEnvironmentVariable("DEEPGRAM_API_KEY"));
        request.Content = new StreamContent(audio);
        request.Content.Headers.ContentType = MediaTypeHeaderValue.Parse(contentType);
        using var response = await httpClient.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadAsStringAsync(cancellationToken);
    }
}
`,
      fileRole: ".NET Deepgram provider service.",
      layer: "backend",
      runtime: "server",
      canAccessDeepgramApiKey: true,
      callsDeepgramDirectly: true,
      receivesRawAudio: true,
      receivesTranscriptJson: true,
      commonMistakes: serverMistakes,
      productionNotes: ["Parse and return a typed sanitized response instead of raw JSON."],
    }),
  ],
  "serverless-functions": [
    starterFile({
      path: ".env.example",
      language: "TypeScript",
      code: "DEEPGRAM_API_KEY=YOUR_DEEPGRAM_API_KEY\n",
      fileRole: "Documented serverless secret name without a real value.",
      layer: "config",
      runtime: "configuration",
      canAccessDeepgramApiKey: false,
      callsDeepgramDirectly: false,
      receivesRawAudio: false,
      receivesTranscriptJson: false,
      commonMistakes: ["Committing an actual value", "Using a public environment prefix"],
      productionNotes: ["Configure the value in the deployment platform secret store."],
    }),
    starterFile({
      path: "functions/transcribe.ts",
      language: "TypeScript",
      code: String.raw`export async function handler(request: Request): Promise<Response> {
  const { url = "YOUR_AUDIO_URL" } = await request.json();
  const response = await fetch("https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true", {
    method: "POST",
    headers: {
      Authorization: "Token " + process.env.DEEPGRAM_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url }),
  });
  const raw = await response.json();
  return Response.json({ transcript: raw.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "" });
}
`,
      fileRole: "Serverless hosted-audio transcription handler.",
      layer: "api-route",
      runtime: "server",
      canAccessDeepgramApiKey: true,
      callsDeepgramDirectly: true,
      receivesRawAudio: false,
      receivesTranscriptJson: true,
      commonMistakes: serverMistakes,
      productionNotes: ["Enforce auth and rate limits at the gateway.", "Mind platform body and execution limits."],
    }),
    starterFile({
      path: "functions/token.ts",
      language: "TypeScript",
      code: String.raw`export async function handler(): Promise<Response> {
  const response = await fetch("https://api.deepgram.com/v1/auth/grant", {
    method: "POST",
    headers: { Authorization: "Token " + process.env.DEEPGRAM_API_KEY },
  });
  const grant = await response.json();
  return Response.json({ access_token: grant.access_token, expires_in: grant.expires_in });
}
`,
      fileRole: "Short-lived token serverless function.",
      layer: "api-route",
      runtime: "server",
      canAccessDeepgramApiKey: true,
      callsDeepgramDirectly: true,
      receivesRawAudio: false,
      receivesTranscriptJson: false,
      commonMistakes: ["Returning the permanent key", "Making the endpoint public and unlimited"],
      productionNotes: ["Authorize requests and redact all grant logging."],
    }),
    starterFile({
      path: "src/deepgram-client.ts",
      language: "TypeScript",
      code: String.raw`export function transcriptFrom(raw: any): string {
  return raw?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
}
`,
      fileRole: "Small shared response parser.",
      layer: "shared",
      runtime: "server",
      canAccessDeepgramApiKey: false,
      callsDeepgramDirectly: false,
      receivesRawAudio: false,
      receivesTranscriptJson: true,
      commonMistakes: ["Assuming every successful response contains transcript text"],
      productionNotes: ["Use a validated typed schema in production."],
    }),
  ],
  "cli-batch": [
    starterFile({
      path: ".env",
      language: "Shell",
      code: "DEEPGRAM_API_KEY=YOUR_DEEPGRAM_API_KEY\n",
      fileRole: "Local-only CLI environment configuration.",
      layer: "config",
      runtime: "configuration",
      canAccessDeepgramApiKey: true,
      callsDeepgramDirectly: false,
      receivesRawAudio: false,
      receivesTranscriptJson: false,
      commonMistakes: ["Passing keys as command arguments", "Committing .env"],
      productionNotes: envNotes,
    }),
    starterFile({
      path: "transcribe-url.sh",
      language: "Shell",
      code: String.raw`#!/usr/bin/env sh
set -eu

curl --fail-with-body --silent --show-error \
  --request POST \
  --header "Authorization: Token $DEEPGRAM_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{"url":"YOUR_AUDIO_URL"}' \
  "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true"
`,
      fileRole: "Small hosted-URL diagnostic command.",
      layer: "cli",
      runtime: "local",
      canAccessDeepgramApiKey: true,
      callsDeepgramDirectly: true,
      receivesRawAudio: false,
      receivesTranscriptJson: true,
      commonMistakes: ["Putting a key literal in the script", "Printing verbose headers"],
      productionNotes: ["Use this for local diagnostics, not a public application endpoint."],
    }),
    starterFile({
      path: "transcribe_file.py",
      language: "Python",
      code: String.raw`import os
import sys
import urllib.request

path = sys.argv[1] if len(sys.argv) > 1 else "YOUR_FILE_PATH"
request = urllib.request.Request(
    "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true",
    data=open(path, "rb").read(),
    headers={"Authorization": f"Token {os.environ['DEEPGRAM_API_KEY']}"},
    method="POST",
)
print(urllib.request.urlopen(request, timeout=30).read().decode())
`,
      fileRole: "Single-file local transcription diagnostic.",
      layer: "cli",
      runtime: "local",
      canAccessDeepgramApiKey: true,
      callsDeepgramDirectly: true,
      receivesRawAudio: true,
      receivesTranscriptJson: true,
      commonMistakes: ["Hard-coding the key", "Loading very large files into memory"],
      productionNotes: ["Add content type, validation, and structured output for repeatable use."],
    }),
    starterFile({
      path: "batch_transcribe.py",
      language: "Python",
      code: String.raw`from pathlib import Path

for audio_path in Path("recordings").glob("*.mp3"):
    output_path = Path("transcripts") / f"{audio_path.stem}.json"
    print(f"Queue {audio_path} -> {output_path}")
`,
      fileRole: "Batch orchestration skeleton for recording files.",
      layer: "worker",
      runtime: "local",
      canAccessDeepgramApiKey: true,
      callsDeepgramDirectly: false,
      receivesRawAudio: true,
      receivesTranscriptJson: true,
      commonMistakes: ["Unbounded concurrency", "Retrying permanent failures forever", "Overwriting output"],
      productionNotes: ["Use checkpoints, bounded concurrency, and idempotent output names."],
    }),
    starterFile({
      path: "README.md",
      language: "Shell",
      code: String.raw`# Deepgram batch recipe

1. Set DEEPGRAM_API_KEY in the shell environment.
2. Replace YOUR_AUDIO_URL or YOUR_FILE_PATH.
3. Run a local diagnostic script.
4. Store sanitized transcript JSON separately from source audio.
`,
      fileRole: "Operator instructions and security boundaries.",
      layer: "config",
      runtime: "local",
      canAccessDeepgramApiKey: false,
      callsDeepgramDirectly: false,
      receivesRawAudio: false,
      receivesTranscriptJson: false,
      commonMistakes: ["Documenting real credentials or customer audio URLs"],
      productionNotes: ["Document retention, retry, and failure-handling policy."],
    }),
  ],
};

export type FlowBlockKind = "source" | "trust-boundary" | "deepgram" | "event" | "destination";

export type FlowBlock = {
  id: string;
  label: string;
  detail: string;
  kind: FlowBlockKind;
};

export type IntegrationPlan = {
  title: string;
  summary: string;
  recommendedPlacement: string[];
  requiredFiles: string[];
  apiRoutes: string[];
  recommendedSnippets: string[];
  payloadPaths: string[];
  securityNotes: string[];
  warnings: string[];
  flow: FlowBlock[];
};

function optionLabel<T extends string>(options: readonly RecipeOption<T>[], id: T): string {
  return options.find((option) => option.id === id)?.label ?? id;
}

export function getRecipeLabels(recipe: IntegrationRecipe) {
  return {
    clientType:
      recipe.clientType === "custom" && recipe.customClientType?.trim()
        ? recipe.customClientType.trim()
        : optionLabel(CLIENT_TYPE_OPTIONS, recipe.clientType),
    architecture: optionLabel(ARCHITECTURE_OPTIONS, recipe.architecture),
    audioSource: optionLabel(AUDIO_SOURCE_OPTIONS, recipe.audioSource),
    deepgramProduct: optionLabel(DEEPGRAM_PRODUCT_OPTIONS, recipe.deepgramProduct),
    outputDestination: optionLabel(OUTPUT_DESTINATION_OPTIONS, recipe.outputDestination),
    securityPostures: recipe.securityPostures.map((id) => optionLabel(SECURITY_POSTURE_OPTIONS, id)),
  };
}

export function getSelectedInsertionPatterns(
  recipe: IntegrationRecipe,
  customPatterns: readonly InsertionPattern[] = [],
): InsertionPattern[] {
  const patterns = [...DEFAULT_INSERTION_PATTERNS, ...customPatterns];
  const selected = new Set(recipe.selectedPatternIds);
  return patterns.filter((pattern) => selected.has(pattern.id));
}

function commentForLanguage(language: CodeLabLanguage, text: string): string {
  if (language === "Python" || language === "Shell") return `# ${text}`;
  return `// ${text}`;
}

const architectureLanguage: Record<ArchitectureId, CodeLabLanguage> = {
  "nextjs-full-stack": "TypeScript",
  "react-node": "TypeScript",
  "python-fastapi": "Python",
  "go-service": "Go",
  "dotnet-api": ".NET",
  "serverless-functions": "TypeScript",
  "cli-batch": "Python",
};

const patternPathByArchitecture: Record<ArchitectureId, Record<string, string>> = {
  "nextjs-full-stack": {
    "frontend-local-api": "src/components/DeepgramAction.tsx",
    "server-calls-deepgram": "src/app/api/deepgram/route.ts",
    "browser-temporary-token": "src/components/BrowserMic.tsx",
    "upload-file-to-server": "src/app/api/deepgram/transcribe-file/route.ts",
    "store-transcript-database": "src/lib/transcript-repository.ts",
    "webhook-to-crm": "src/app/api/crm/tickets/route.ts",
    "tts-playable-audio": "src/app/api/deepgram/speak/route.ts",
    "cli-batch-transcription": "scripts/transcribe.ts",
    "worker-process-recordings": "src/workers/transcribe-recording.ts",
    "sanitized-payload-inspector": "src/lib/payload-inspector.ts",
  },
  "react-node": {
    "frontend-local-api": "client/src/DeepgramAction.tsx",
    "server-calls-deepgram": "server/src/routes/deepgram.ts",
    "browser-temporary-token": "server/src/routes/token.ts",
    "upload-file-to-server": "server/src/routes/upload.ts",
    "store-transcript-database": "server/src/repositories/transcripts.ts",
    "webhook-to-crm": "server/src/integrations/crm.ts",
    "tts-playable-audio": "server/src/routes/speak.ts",
    "cli-batch-transcription": "server/scripts/transcribe.ts",
    "worker-process-recordings": "server/src/workers/recordings.ts",
    "sanitized-payload-inspector": "server/src/lib/inspection.ts",
  },
  "python-fastapi": {
    "frontend-local-api": "templates/transcript_form.html",
    "server-calls-deepgram": "routers/deepgram.py",
    "browser-temporary-token": "routers/token.py",
    "upload-file-to-server": "routers/upload.py",
    "store-transcript-database": "repositories/transcripts.py",
    "webhook-to-crm": "integrations/crm.py",
    "tts-playable-audio": "routers/speak.py",
    "cli-batch-transcription": "scripts/transcribe.py",
    "worker-process-recordings": "workers/recordings.py",
    "sanitized-payload-inspector": "services/inspection.py",
  },
  "go-service": {
    "frontend-local-api": "web/transcript.html",
    "server-calls-deepgram": "internal/handlers/deepgram.go",
    "browser-temporary-token": "internal/handlers/token.go",
    "upload-file-to-server": "internal/handlers/upload.go",
    "store-transcript-database": "internal/repository/transcripts.go",
    "webhook-to-crm": "internal/integrations/crm.go",
    "tts-playable-audio": "internal/handlers/speak.go",
    "cli-batch-transcription": "cmd/transcribe/main.go",
    "worker-process-recordings": "internal/workers/recordings.go",
    "sanitized-payload-inspector": "internal/inspection/sanitize.go",
  },
  "dotnet-api": {
    "frontend-local-api": "wwwroot/transcript.html",
    "server-calls-deepgram": "Controllers/DeepgramController.cs",
    "browser-temporary-token": "Controllers/TokenController.cs",
    "upload-file-to-server": "Controllers/UploadController.cs",
    "store-transcript-database": "Repositories/TranscriptRepository.cs",
    "webhook-to-crm": "Integrations/CrmClient.cs",
    "tts-playable-audio": "Controllers/SpeakController.cs",
    "cli-batch-transcription": "Tools/TranscribeCommand.cs",
    "worker-process-recordings": "Workers/RecordingWorker.cs",
    "sanitized-payload-inspector": "Diagnostics/PayloadSanitizer.cs",
  },
  "serverless-functions": {
    "frontend-local-api": "src/DeepgramAction.tsx",
    "server-calls-deepgram": "functions/transcribe.ts",
    "browser-temporary-token": "functions/token.ts",
    "upload-file-to-server": "functions/upload.ts",
    "store-transcript-database": "functions/store-transcript.ts",
    "webhook-to-crm": "functions/crm-webhook.ts",
    "tts-playable-audio": "functions/speak.ts",
    "cli-batch-transcription": "scripts/transcribe.ts",
    "worker-process-recordings": "functions/recording-worker.ts",
    "sanitized-payload-inspector": "src/payload-inspector.ts",
  },
  "cli-batch": {
    "frontend-local-api": "README.md",
    "server-calls-deepgram": "transcribe_file.py",
    "browser-temporary-token": "token_diagnostic.py",
    "upload-file-to-server": "transcribe_file.py",
    "store-transcript-database": "store_transcript.py",
    "webhook-to-crm": "send_to_crm.py",
    "tts-playable-audio": "speak.py",
    "cli-batch-transcription": "batch_transcribe.py",
    "worker-process-recordings": "recording_worker.py",
    "sanitized-payload-inspector": "sanitize_payload.py",
  },
};

function patternStarterFile(recipe: IntegrationRecipe, pattern: InsertionPattern): RecipeStarterFile {
  const language = architectureLanguage[recipe.architecture];
  const path = patternPathByArchitecture[recipe.architecture][pattern.id] ?? `recipes/${pattern.id}.txt`;
  const runsInBrowser = /(^|\/)(client\/src|src\/components|src\/DeepgramAction|web|wwwroot|templates)\//i.test(path);
  const runsLocally = recipe.architecture === "cli-batch" || /(^|\/)scripts?\//i.test(path);
  const runtime: RecipeFileRuntime = runsInBrowser ? "browser" : runsLocally ? "local" : "server";
  const keyAllowed = runtime !== "browser" && pattern.layer !== "external-system";
  const direct =
    runtime !== "browser" &&
    (pattern.id === "server-calls-deepgram" ||
      pattern.id === "tts-playable-audio" ||
      pattern.id === "browser-temporary-token");
  const rawAudio =
    pattern.id === "upload-file-to-server" ||
    pattern.id === "worker-process-recordings" ||
    pattern.id === "cli-batch-transcription" ||
    (pattern.id === "browser-temporary-token" && runtime === "browser");
  const transcript =
    pattern.id === "store-transcript-database" ||
    pattern.id === "webhook-to-crm" ||
    pattern.id === "sanitized-payload-inspector" ||
    (pattern.id === "browser-temporary-token" && runtime === "browser");

  return starterFile({
    path,
    language,
    code: [
      commentForLanguage(language, pattern.name),
      commentForLanguage(language, pattern.purpose),
      commentForLanguage(language, `Reference: ${pattern.codeSnippetReference}`),
      commentForLanguage(language, "Use DEEPGRAM_API_KEY only in a trusted server or local runtime."),
      "",
    ].join("\n"),
    fileRole: pattern.purpose,
    layer: pattern.layer,
    runtime,
    canAccessDeepgramApiKey: keyAllowed,
    callsDeepgramDirectly: direct,
    receivesRawAudio: rawAudio,
    receivesTranscriptJson: transcript,
    commonMistakes: [...pattern.risks],
    productionNotes: ["Validate inputs and redact credentials before logging.", "Add app-level authorization and bounded retries."],
    source: "pattern",
    patternIds: [pattern.id],
  });
}

export function generateStarterFiles(
  recipe: IntegrationRecipe,
  customPatterns: readonly InsertionPattern[] = [],
): RecipeStarterFile[] {
  const base = ARCHITECTURE_STARTER_FILES[recipe.architecture].map((file) => ({
    ...file,
    commonMistakes: [...file.commonMistakes],
    productionNotes: [...file.productionNotes],
    patternIds: [...file.patternIds],
  }));
  const paths = new Set(base.map((file) => file.path));

  for (const pattern of getSelectedInsertionPatterns(recipe, customPatterns)) {
    const candidate = patternStarterFile(recipe, pattern);
    const existing = base.find((file) => file.path === candidate.path);
    if (existing) {
      existing.patternIds = Array.from(new Set([...existing.patternIds, pattern.id]));
      continue;
    }
    if (!paths.has(candidate.path)) {
      paths.add(candidate.path);
      base.push(candidate);
    }
  }

  return base;
}

export function generateFlowBlocks(recipe: IntegrationRecipe): FlowBlock[] {
  const labels = getRecipeLabels(recipe);
  const destination: FlowBlock = {
    id: "destination",
    label: labels.outputDestination,
    detail: "Consume finalized, sanitized output.",
    kind: "destination",
  };

  if (recipe.deepgramProduct === "text-to-speech") {
    return [
      { id: "message", label: "Message Form", detail: "Collect text in the product UI.", kind: "source" },
      { id: "tts-route", label: "Server TTS Route", detail: "Attach the server-side API key.", kind: "trust-boundary" },
      { id: "speak", label: "Deepgram /v1/speak", detail: "Generate an approved voice response.", kind: "deepgram" },
      { id: "audio", label: "Audio Bytes", detail: "Return a bounded audio response.", kind: "event" },
      { ...destination, label: recipe.outputDestination === "browser-transcript-ui" ? "Browser Audio Player" : destination.label },
    ];
  }

  if (
    recipe.deepgramProduct === "live-streaming-stt" ||
    recipe.deepgramProduct === "temporary-token-auth" ||
    recipe.audioSource === "browser-microphone" ||
    recipe.audioSource === "live-websocket-stream"
  ) {
    return [
      { id: "mic", label: recipe.audioSource === "browser-microphone" ? "Browser Mic" : labels.audioSource, detail: "Capture local audio.", kind: "source" },
      { id: "token-route", label: "Temporary Token Route", detail: "Keep the main key on the server.", kind: "trust-boundary" },
      { id: "grant", label: "Deepgram Auth Grant", detail: "Issue a short-lived credential.", kind: "deepgram" },
      { id: "socket", label: "Browser WebSocket", detail: "Start recording only after the socket opens.", kind: "trust-boundary" },
      { id: "listen", label: "Deepgram Live Listen", detail: "Receive streaming recognition events.", kind: "deepgram" },
      { id: "events", label: "Interim / Final Events", detail: "Treat only final segments as durable output.", kind: "event" },
      destination,
    ];
  }

  const sourceLabel =
    recipe.audioSource === "hosted-audio-url"
      ? "Browser UI"
      : recipe.audioSource === "file-upload"
        ? "Upload Form"
        : labels.audioSource;
  const boundaryLabel =
    recipe.architecture === "nextjs-full-stack"
      ? "Next.js API Route"
      : recipe.architecture === "cli-batch"
        ? "Local CLI"
        : labels.architecture;

  return [
    { id: "source", label: sourceLabel, detail: `Provide ${labels.audioSource.toLowerCase()}.`, kind: "source" },
    { id: "boundary", label: boundaryLabel, detail: "Validate input and attach credentials.", kind: "trust-boundary" },
    { id: "listen", label: "Deepgram /v1/listen", detail: "Run pre-recorded speech recognition.", kind: "deepgram" },
    { id: "json", label: "Transcript JSON", detail: "Extract transcript, words, and request metadata.", kind: "event" },
    destination,
  ];
}

function payloadPathsFor(recipe: IntegrationRecipe): string[] {
  if (recipe.deepgramProduct === "text-to-speech") {
    return ["response.headers.content-type", "response audio byte length", "selected voice model"];
  }
  if (recipe.deepgramProduct === "temporary-token-auth") {
    return ["access_token (redacted)", "expires_in", "WebSocket close code and reason"];
  }
  if (recipe.deepgramProduct === "live-streaming-stt") {
    return [
      "channel.alternatives[0].transcript",
      "is_final",
      "speech_final",
      "metadata.request_id",
      "WebSocket close code and reason",
    ];
  }
  if (recipe.deepgramProduct === "payload-inspector") {
    return ["sanitized request URL and query", "response status", "timeline events", "redacted headers"];
  }
  return [
    "results.channels[0].alternatives[0].transcript",
    "results.channels[0].alternatives[0].words",
    "metadata.request_id",
  ];
}

function securityNotesFor(recipe: IntegrationRecipe): { notes: string[]; warnings: string[] } {
  const notes = recipe.securityPostures.map((id) => {
    switch (id) {
      case "server-api-key-only":
        return "Read DEEPGRAM_API_KEY only in a trusted server or local CLI runtime.";
      case "temporary-browser-token":
        return "Issue a short-lived browser token from an authenticated server route and use it immediately.";
      case "no-client-secrets":
        return "Do not place permanent provider credentials in browser bundles, URLs, localStorage, or console output.";
      case "redacted-payload-logs":
        return "Redact Authorization headers, temporary tokens, and raw audio from inspection logs.";
      case "rate-limited-api-route":
        return "Authenticate and rate-limit application routes before they consume Deepgram quota.";
    }
  });
  const warnings: string[] = [];

  if (!recipe.securityPostures.includes("server-api-key-only")) {
    warnings.push("Add a server-side API key boundary before treating this recipe as production-ready.");
  }
  if (
    (recipe.audioSource === "browser-microphone" || recipe.deepgramProduct === "live-streaming-stt") &&
    !recipe.securityPostures.includes("temporary-browser-token")
  ) {
    warnings.push("Browser live audio requires temporary token auth; never substitute the main API key.");
  }
  if (recipe.clientType === "telehealth") {
    warnings.push(
      "Health audio and transcripts may contain highly sensitive data. Confirm consent, encryption, access controls, retention, and applicable compliance requirements before production use.",
    );
  }
  if (recipe.clientType === "fintech-fraud-ops") {
    warnings.push("Treat call recordings and fraud-case transcripts as restricted data with an auditable retention policy.");
  }
  if (recipe.outputDestination !== "browser-transcript-ui" && !recipe.securityPostures.includes("redacted-payload-logs")) {
    warnings.push("External or durable outputs should use redacted diagnostic logs and explicit retention rules.");
  }

  return { notes: Array.from(new Set(notes)), warnings };
}

export function generateIntegrationPlan(
  recipe: IntegrationRecipe,
  customPatterns: readonly InsertionPattern[] = [],
): IntegrationPlan {
  const labels = getRecipeLabels(recipe);
  const patterns = getSelectedInsertionPatterns(recipe, customPatterns);
  const files = generateStarterFiles(recipe, customPatterns);
  const { notes, warnings } = securityNotesFor(recipe);
  const recommendedPlacement = [
    `${labels.audioSource} enters through the ${labels.architecture} boundary.`,
    ...patterns.map((pattern) => pattern.purpose),
    `Final output is delivered to ${labels.outputDestination.toLowerCase()}.`,
  ];
  const apiRoutes = files
    .filter((file) => file.layer === "api-route" || /(^|\/)(routes?|functions?|Controllers)\//i.test(file.path))
    .map((file) => file.path);

  return {
    title: `${labels.clientType}: ${labels.deepgramProduct}`,
    summary: `${labels.clientType} uses ${labels.architecture} to move ${labels.audioSource.toLowerCase()} through ${labels.deepgramProduct}, then delivers the result to ${labels.outputDestination.toLowerCase()}.`,
    recommendedPlacement,
    requiredFiles: files.map((file) => file.path),
    apiRoutes: Array.from(new Set(apiRoutes)),
    recommendedSnippets: Array.from(new Set(patterns.map((pattern) => pattern.codeSnippetReference))),
    payloadPaths: payloadPathsFor(recipe),
    securityNotes: notes,
    warnings,
    flow: generateFlowBlocks(recipe),
  };
}

export function findSnippetSecurityWarnings(code: string): string[] {
  const warnings: string[] = [];
  const envAssignments = code.matchAll(/DEEPGRAM_API_KEY\s*=\s*([^\s"']+)/gi);
  for (const match of envAssignments) {
    const value = match[1];
    if (!/^(YOUR_|replace_me|DEEPGRAM_API_KEY|\$\{|process\.env)/i.test(value)) {
      warnings.push("Do not paste real API keys into snippets.");
      break;
    }
  }
  if (/\b(?:Token|Bearer)\s+[A-Za-z0-9._-]{20,}\b/.test(code) || /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/.test(code)) {
    warnings.push("Do not paste real API keys into snippets.");
  }
  return Array.from(new Set(warnings));
}

export function sanitizeRecipeSnippet(code: string): string {
  return code
    .replace(/(DEEPGRAM_API_KEY\s*=\s*)([^\s"']+)/gi, (_match, prefix: string, value: string) => {
      if (/^(YOUR_|replace_me|DEEPGRAM_API_KEY|\$\{|process\.env)/i.test(value)) return `${prefix}${value}`;
      return `${prefix}YOUR_DEEPGRAM_API_KEY`;
    })
    .replace(/(\b(?:Token|Bearer)\s+)[A-Za-z0-9._-]{20,}\b/g, "$1[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]{10,})?\b/g, "[REDACTED_TOKEN]");
}

export type RecipeExport = {
  version: 1;
  recipe: IntegrationRecipe;
  labels: ReturnType<typeof getRecipeLabels>;
  selectedPatterns: InsertionPattern[];
  integrationPlan: IntegrationPlan;
  files: Array<Pick<RecipeStarterFile, "path" | "language" | "code" | "fileRole" | "layer" | "runtime">>;
};

export function createRecipeExport(
  recipe: IntegrationRecipe,
  options: {
    customPatterns?: readonly InsertionPattern[];
    files?: readonly RecipeStarterFile[];
  } = {},
): RecipeExport {
  const customPatterns = options.customPatterns ?? [];
  const files = options.files ?? generateStarterFiles(recipe, customPatterns);
  return {
    version: 1,
    recipe: {
      ...recipe,
      securityPostures: [...recipe.securityPostures],
      selectedPatternIds: [...recipe.selectedPatternIds],
    },
    labels: getRecipeLabels(recipe),
    selectedPatterns: getSelectedInsertionPatterns(recipe, customPatterns),
    integrationPlan: generateIntegrationPlan(recipe, customPatterns),
    files: files.map((file) => ({
      path: file.path,
      language: file.language,
      code: sanitizeRecipeSnippet(file.code),
      fileRole: file.fileRole,
      layer: file.layer,
      runtime: file.runtime,
    })),
  };
}

export function serializeRecipeJson(
  recipe: IntegrationRecipe,
  options?: Parameters<typeof createRecipeExport>[1],
): string {
  return JSON.stringify(createRecipeExport(recipe, options), null, 2);
}

export function serializeRecipeMarkdown(
  recipe: IntegrationRecipe,
  options?: Parameters<typeof createRecipeExport>[1],
): string {
  const exported = createRecipeExport(recipe, options);
  const { integrationPlan: plan } = exported;
  const sections = [
    `# ${plan.title}`,
    "",
    plan.summary,
    "",
    "## Integration Plan",
    "",
    ...plan.recommendedPlacement.map((item) => `- ${item}`),
    "",
    "## Flow",
    "",
    plan.flow.map((block) => block.label).join(" -> "),
    "",
    "## Files",
    "",
    ...exported.files.map((file) => `- \`${file.path}\` - ${file.fileRole}`),
    "",
    "## Payload Paths",
    "",
    ...plan.payloadPaths.map((path) => `- \`${path}\``),
    "",
    "## Security Notes",
    "",
    ...plan.securityNotes.map((note) => `- ${note}`),
    ...plan.warnings.map((warning) => `- WARNING: ${warning}`),
    "",
    "## Starter Snippets",
    "",
  ];

  for (const file of exported.files) {
    sections.push(`### ${file.path}`, "", ...file.code.split("\n").map((line) => `    ${line}`), "");
  }

  return sections.join("\n").trimEnd() + "\n";
}
