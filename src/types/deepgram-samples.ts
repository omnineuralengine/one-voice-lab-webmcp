import type { DeepgramNova3LanguageCode } from "@/lib/deepgram-languages";

export type TranscribeUrlLanguageMode = "match" | "auto-detect" | "manual";

export type DeepgramSampleSource = "Deepgram documentation example" | "Deepgram Aura sample";
export type DeepgramSampleSourceType = "natural/prerecorded speech" | "synthesized TTS speech";

export type DeepgramHostedSample = {
  id: string;
  title: string;
  sampleUrl: string;
  spokenLanguage: string;
  languageCode: DeepgramNova3LanguageCode;
  accent?: string;
  source: DeepgramSampleSource;
  sourceType: DeepgramSampleSourceType;
  verificationStatus: "verified-project-example" | "verified-model-metadata";
  model?: string;
  characteristics: string[];
  learningNote: string;
};

export type DeepgramSampleAudioData = {
  samples: DeepgramHostedSample[];
  metadataStatus: "available" | "unavailable";
  retrievedAt: string;
  note: string;
  docsUrl: string;
};

export type TranscribeUrlOutcome = {
  kind:
    | "completed-with-transcript"
    | "completed-empty"
    | "likely-language-mismatch"
    | "request-failed"
    | "audio-url-unavailable"
    | "unsupported-configuration";
  sampleSpokenLanguage: string;
  requestedSpokenLanguage: string;
  detectedLanguage?: string;
  model: string;
  requestId?: string;
  audioSourceType: DeepgramSampleSourceType | "custom public URL";
};
