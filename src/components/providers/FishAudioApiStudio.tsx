"use client";

import {
  ProviderApiStudio,
  type ProviderApiStudioDefinition,
} from "@/components/providers/ElevenLabsApiStudio";

const FISH_AUDIO_STUDIO: ProviderApiStudioDefinition = Object.freeze({
  providerId: "fish-audio",
  displayName: "Fish Audio",
  outputFormat: "mp3",
  ttsCharacterLimit: 1_000,
  sttFileLimitMb: 10,
  sttModelLabel: "ASR endpoint profile",
  sttModels: Object.freeze([
    { id: "fish-audio-asr-v1", name: "Fish Audio v1 ASR (beta)" },
  ]),
  voiceRequired: false,
  defaultTtsText: "Welcome to ONE Voice Lab. This Fish Audio request runs only after your confirmation.",
  notImplemented: "realtime STT, WebSocket or timestamped streaming TTS, voice cloning/model creation, agents, arbitrary API proxying, and automatic execution",
});

export function FishAudioApiStudio(props: { configured: boolean; executionEnabled: boolean }) {
  return <ProviderApiStudio {...props} definition={FISH_AUDIO_STUDIO} disabledLabel="Canonical execution policy disabled" />;
}
