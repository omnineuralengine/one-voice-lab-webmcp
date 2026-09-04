export type CuratedAudioSample = {
  id: string;
  name: string;
  filename: string;
  assetPath: string;
  purpose: string;
  durationSeconds: number;
  format: "MP3";
  mimeType: "audio/mpeg";
  sizeBytes: number;
  language: string;
  signalCharacteristic: string;
  recommendedExperiment: string;
  availability: "hosted-and-local" | "local-only";
  provenance: {
    source: string;
    license: string;
    speech: "synthetic";
    personalInformation: false;
  };
};

const SHARED_PROVENANCE = {
  source: "Generated for this project from a project-authored fictional script by scripts/generate-sample-audio.mjs using Deepgram Aura TTS.",
  license: "No separate third-party recording license. Generated output is governed by the project's Deepgram account terms; redistribution rights were not independently re-evaluated.",
  speech: "synthetic",
  personalInformation: false,
} as const;

export const CURATED_UPLOAD_AUDIO_SAMPLES = [
  {
    id: "media-podcast-clip",
    name: "Polished English speech",
    filename: "media-podcast-clip.mp3",
    assetPath: "/samples/media-podcast-clip.mp3",
    purpose: "A short, neutral baseline for preview and transcription setup.",
    durationSeconds: 11.088,
    format: "MP3",
    mimeType: "audio/mpeg",
    sizeBytes: 66_528,
    language: "English",
    signalCharacteristic: "Mono synthetic speech, 24 kHz; measured peak -4.5 dBFS.",
    recommendedExperiment: "Compare fixed English with prerecorded language detection.",
    availability: "hosted-and-local",
    provenance: SHARED_PROVENANCE,
  },
  {
    id: "saas-webhook-support",
    name: "Technical English speech",
    filename: "saas-webhook-support.mp3",
    assetPath: "/samples/saas-webhook-support.mp3",
    purpose: "Technical vocabulary, an identifier, and retry-policy language.",
    durationSeconds: 16.896,
    format: "MP3",
    mimeType: "audio/mpeg",
    sizeBytes: 101_376,
    language: "English",
    signalCharacteristic: "Mono synthetic speech, 24 kHz; measured peak -1.8 dBFS without a full-scale peak.",
    recommendedExperiment: "Inspect smart formatting and technical term recognition.",
    availability: "hosted-and-local",
    provenance: SHARED_PROVENANCE,
  },
  {
    id: "italian-customer-support",
    name: "Italian customer support",
    filename: "italian-customer-support.mp3",
    assetPath: "/samples/italian-customer-support.mp3",
    purpose: "A safe synthetic non-English language-selection exercise.",
    durationSeconds: 17.904,
    format: "MP3",
    mimeType: "audio/mpeg",
    sizeBytes: 107_424,
    language: "Italian",
    signalCharacteristic: "Mono synthetic speech, 24 kHz; measured peak -4.1 dBFS.",
    recommendedExperiment: "Compare language=it with prerecorded language detection.",
    availability: "hosted-and-local",
    provenance: SHARED_PROVENANCE,
  },
  {
    id: "spanish-customer-service",
    name: "Spanish customer support",
    filename: "spanish-customer-service.mp3",
    assetPath: "/samples/spanish-customer-service.mp3",
    purpose: "A short synthetic Spanish billing-support exercise.",
    durationSeconds: 11.544,
    format: "MP3",
    mimeType: "audio/mpeg",
    sizeBytes: 69_264,
    language: "Spanish",
    signalCharacteristic: "Mono synthetic speech, 24 kHz; measured peak -8.3 dBFS.",
    recommendedExperiment: "Compare language=es with prerecorded language detection.",
    availability: "hosted-and-local",
    provenance: SHARED_PROVENANCE,
  },
] as const satisfies readonly CuratedAudioSample[];
