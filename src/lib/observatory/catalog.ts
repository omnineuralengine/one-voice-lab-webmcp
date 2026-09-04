import type { ObservatoryPreset } from "@/types/observatory";

export const OBSERVATORY_PRESETS: ObservatoryPreset[] = [
  { id: "guided-demo", title: "Applied Engineering Guided Demo", shortTitle: "4-min guide", mode: "guide", teaches: "A presenter-only four-minute route through live evidence, client diagnosis, one narrow experiment, implementation, and the AVS vision.", billableRequests: 0, limit: "Guide actions never start a request", observableEvents: ["presenter checklist only"], successCriteria: "The presenter controls every transition and confirms the single live microphone operation separately.", cleanup: "Reset Demo State stops active resources and clears only Observatory working state." },
  { id: "audio-signal-lab", title: "Audio Signal Lab", shortTitle: "Audio", mode: "guide", teaches: "How capture, signal health, format, chunks, and preprocessing shape the audio presented to a speech system.", billableRequests: 0, limit: "Local analysis and offline variants only; comparison is separately confirmed", observableEvents: ["capture summary", "threshold crossings", "format metadata", "fixture and variant provenance"], successCriteria: "Audio evidence is inspectable without claiming transcript accuracy or sending an automatic request.", cleanup: "Stop tracks, recorder, audio graph, animation frames, and in-memory fixture URLs." },
  { id: "speak-watch", title: "Speak and Watch", shortTitle: "Mic STT", mode: "live", teaches: "How browser audio, temporary auth, WebSocket events, and transcripts move through a realtime system.", billableRequests: 1, limit: "60-second streaming session", observableEvents: ["permission", "audio chunks", "socket lifecycle", "interim/final transcript", "turn signals"], successCriteria: "At least one sanitized Deepgram event is correlated to the local run.", cleanup: "Stop recorder, tracks, meter, socket, timers, and pending work." },
  { id: "compare-configs", title: "Compare Two Configurations", shortTitle: "STT A/B", mode: "live", teaches: "Controlled comparison of two prerecorded STT configurations on the same audio.", billableRequests: 2, limit: "One audio source, maximum five minutes", observableEvents: ["two request IDs", "two transcripts", "request timing", "diff"], successCriteria: "Both results are inspectable; WER appears only with explicit reference text.", cleanup: "Abort outstanding fetches and discard the selected audio unless the user retains it locally." },
  { id: "hear-api", title: "Hear the API", shortTitle: "TTS", mode: "live", teaches: "How a Speak request becomes server-held audio and browser playback events.", billableRequests: 1, limit: "500 characters", observableEvents: ["request timing", "response metadata", "byte size", "playback lifecycle"], successCriteria: "A real TTS response and its playback state are visible without exposing binary data.", cleanup: "Pause playback, release the local audio object, and delete server-held audio." },
  { id: "voice-loop", title: "Voice Loop", shortTitle: "TTS → STT", mode: "live", teaches: "How speech generation and recognition interact in one bounded experiment.", billableRequests: 2, limit: "200 characters; one run at a time", observableEvents: ["TTS request", "audio handoff", "STT request", "text comparison"], successCriteria: "Both request IDs and an honest text comparison are preserved.", cleanup: "Abort both stages, stop playback, and delete generated audio." },
  { id: "italian-path", title: "Italian Voice Path", shortTitle: "Italian", mode: "live", teaches: "A verified Italian Aura-2 synthesis path without implying translation or broad multilingual quality.", billableRequests: 1, limit: "200 Italian characters", observableEvents: ["Italian TTS request", "audio metadata", "playback"], successCriteria: "The verified Italian voice produces inspectable audio.", cleanup: "Stop playback and delete generated audio." },
  { id: "northstar-agent", title: "Northstar Agent", shortTitle: "Agent", mode: "conditional", teaches: "What must be verified before a bounded Voice Agent and local mock-tool demonstration can be credible.", billableRequests: 0, limit: "Disabled in this release", observableEvents: ["No fabricated agent or tool events"], successCriteria: "The UI explains prerequisites and performs no request.", cleanup: "No connection is created." },
];

export const OBSERVATORY_PIPELINE = [
  { id: "audio-ingress", label: "Audio ingress" },
  { id: "stt", label: "STT" },
  { id: "turn-taking", label: "Turn-taking" },
  { id: "agent", label: "Agent" },
  { id: "tool", label: "Tools" },
  { id: "tts-playback", label: "TTS/playback" },
  { id: "outcome", label: "Outcome" },
] as const;

export const SYNTHETIC_NORTHSTAR_EVENTS = [
  { offsetMs: 0, stage: "audio-ingress", eventType: "fixture.audio_received", value: "Northstar fictional call fixture" },
  { offsetMs: 180, stage: "stt", eventType: "fixture.transcript_interim", value: "Where is my order" },
  { offsetMs: 410, stage: "turn-taking", eventType: "fixture.utterance_end", value: "Synthetic turn boundary" },
  { offsetMs: 520, stage: "stt", eventType: "fixture.order_id_exact_match_failed", value: "Synthetic order-ID exact-match check failed", severity: "warning" },
  { offsetMs: 620, stage: "agent", eventType: "fixture.intent_routed", value: "order_status" },
  { offsetMs: 760, stage: "tool", eventType: "fixture.lookup_order", value: "Simulated local tool" },
  { offsetMs: 1040, stage: "tts-playback", eventType: "fixture.playback", value: "Synthetic response ready" },
  { offsetMs: 1280, stage: "outcome", eventType: "fixture.outcome", value: "Resolved in fictional demo" },
] as const;
