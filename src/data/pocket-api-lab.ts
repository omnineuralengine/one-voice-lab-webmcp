import type { PocketApiCapabilityCard, PocketApiPreset } from "@/types/pocket-api-lab";

export const POCKET_API_CAPABILITIES: readonly PocketApiCapabilityCard[] = [
  { family: "Speech to Text", label: "STT", shortLabel: "STT" },
  { family: "Text to Speech", label: "TTS", shortLabel: "TTS" },
  { family: "Voice Agent", label: "Voice Agent", shortLabel: "VA" },
  { family: "Intelligence", label: "Intelligence", shortLabel: "AI" },
  { family: "Authentication", label: "Authentication", shortLabel: "AUTH" },
  { family: "Models", label: "Models", shortLabel: "MOD" },
  { family: "Projects", label: "Projects", shortLabel: "PRJ" },
  { family: "Requests", label: "Requests", shortLabel: "REQ" },
  { family: "Usage", label: "Usage", shortLabel: "USE" },
  { family: "Billing", label: "Billing", shortLabel: "BILL" },
  { family: "Administration", label: "Administration", shortLabel: "ADM" },
] as const;

export const POCKET_API_PRESETS: readonly PocketApiPreset[] = [
  {
    id: "transcribe-hosted-audio",
    question: "How do I transcribe a hosted recording?",
    customerUseCase: "Transcribe prerecorded audio from a reachable URL.",
    endpointId: "stt-prerecorded",
    minimalArchitecture: ["Customer server", "HTTPS", "Deepgram prerecorded STT", "Customer application"],
    request: { query: { model: "nova-3", language: "en", smart_format: true }, body: { url: "https://example.com/audio.wav" } },
    expectedResponse: "JSON response from the prerecorded transcription operation. Inspect the official operation reference before depending on individual fields.",
    likelyRisks: ["Source URL reachability", "Audio format and quality", "Language and domain-term validation"],
  },
  {
    id: "stream-live-audio",
    question: "What do I use for live transcription?",
    customerUseCase: "Stream live audio and receive interim and final transcript events.",
    endpointId: "stt-live",
    minimalArchitecture: ["Browser or media gateway", "Temporary token", "WebSocket", "Deepgram streaming STT"],
    request: { query: { model: "nova-3", language: "en", interim_results: true, endpointing: "300", vad_events: true } },
    expectedResponse: "A WebSocket event stream. Event handling must follow the official streaming operation reference.",
    likelyRisks: ["Permanent-key exposure in browser code", "Audio encoding mismatch", "Reconnect and finalization ownership"],
  },
  {
    id: "detect-conversation-turns",
    question: "Which API helps with conversational turns?",
    customerUseCase: "Transcribe conversational audio with turn-aware events for a voice workflow.",
    endpointId: "stt-flux",
    minimalArchitecture: ["Media stream", "Temporary token", "Flux WebSocket", "Customer orchestration"],
    request: { query: { model: "flux-general-en", encoding: "linear16", sample_rate: 16000, eot_threshold: 0.7, eot_timeout_ms: 5000 } },
    expectedResponse: "A turn-aware WebSocket event stream. Validate the exact event contract in the official Flux reference.",
    likelyRisks: ["Turn thresholds need representative calls", "Playback echo can affect interruption behavior", "Orchestration latency remains downstream"],
  },
  {
    id: "synthesize-response-audio",
    question: "How do I generate one spoken response?",
    customerUseCase: "Synthesize text into an audio response.",
    endpointId: "tts-rest",
    minimalArchitecture: ["Customer server", "HTTPS", "Deepgram TTS", "Audio playback"],
    request: { query: { model: "aura-2-thalia-en", encoding: "mp3" }, body: { text: "Illustrative field-assistant request." } },
    expectedResponse: "Audio bytes in the selected supported format, with safe response metadata exposed by the server proxy.",
    likelyRisks: ["Voice and language fit", "Output format compatibility", "Live requests are billable"],
  },
  {
    id: "build-managed-voice-agent",
    question: "What is the managed voice-agent entry point?",
    customerUseCase: "Run a stateful listen-think-speak voice-agent conversation.",
    endpointId: "voice-agent-converse",
    minimalArchitecture: ["Browser or telephony media", "Temporary token", "Voice Agent WebSocket", "Configured tools and business systems"],
    request: {},
    expectedResponse: "A bidirectional WebSocket event and audio stream. Use the official Voice Agent operation reference for settings and event contracts.",
    likelyRisks: ["Tool and LLM latency", "Interruption and recovery design", "Customer authentication and action confirmation"],
  },
  {
    id: "analyze-customer-text",
    question: "How do I analyze transcript text?",
    customerUseCase: "Request selected text-intelligence analyses for supplied text.",
    endpointId: "text-intelligence",
    minimalArchitecture: ["Customer server", "HTTPS", "Deepgram Intelligence", "Customer analytics workflow"],
    request: { query: { language: "en", summarize: true }, body: { text: "Illustrative transcript text for a field demonstration." } },
    expectedResponse: "JSON containing only the analyses requested and available for this operation. Verify field access against the official reference.",
    likelyRisks: ["Input text may be sensitive", "Feature availability requires validation", "Asynchronous callbacks change delivery ownership"],
  },
  {
    id: "secure-browser-stream",
    question: "How should a browser authenticate?",
    customerUseCase: "Obtain a short-lived token for compatible browser realtime APIs.",
    endpointId: "auth-token-grant",
    minimalArchitecture: ["Browser", "Customer server token route", "Deepgram token grant", "Compatible realtime API"],
    request: { body: { ttl_seconds: 30 } },
    expectedResponse: "A short-lived token response. The Pocket widget never displays, stores, or pins the token value.",
    likelyRisks: ["Permanent keys must remain server-side", "Token lifetime and reconnect handling", "Management APIs require server credentials"],
  },
  {
    id: "inspect-public-models",
    question: "How do I inspect verified model metadata?",
    customerUseCase: "List public model metadata before selecting a model.",
    endpointId: "models-public-list",
    minimalArchitecture: ["Pocket widget", "Allowlisted server proxy", "Deepgram Models API", "Sanitized response"],
    request: { query: { include_outdated: false } },
    expectedResponse: "A JSON model-list response from the verified Models operation.",
    likelyRisks: ["Availability can vary by account or release", "Metadata is not an accuracy benchmark", "Production fit still requires evaluation"],
  },
] as const;

export const POCKET_API_PRESET_IDS = new Set(POCKET_API_PRESETS.map((preset) => preset.id));

export function getPocketApiPreset(id: string) {
  return POCKET_API_PRESETS.find((preset) => preset.id === id) ?? POCKET_API_PRESETS[0];
}
