import type { DeepgramNova3LanguageCode } from "@/lib/deepgram-languages";

export type DeepgramHealthResponse = {
  ok: boolean;
  configured: boolean;
  authenticated?: boolean;
  serverIsolated?: true;
  browserExposureCheck?: "passed" | "failed";
  remote: "verified" | "key-detected" | "failed";
  checkedAt: string;
  message: string;
  status?: number;
  currentProject?: { id: string; name: string };
  detectedCapabilities?: string[];
  region?: "global";
  liveExecutionEnabled?: boolean;
};

export type DeepgramErrorResponse = {
  ok: false;
  message: string;
  status?: number;
  details?: unknown;
  configured?: boolean;
};

export type TranscriptionOptions = {
  model: string;
  smart_format: boolean;
  diarize: boolean;
  diarize_model?: "latest" | "v1" | "v2";
  language: DeepgramNova3LanguageCode;
  punctuate?: boolean;
  utterances?: boolean;
  paragraphs?: boolean;
  numerals?: boolean;
  detect_language?: boolean;
  multichannel?: boolean;
  keyterm?: string;
  redact?: string[];
  tag?: "avs_observatory_live" | "avs_stt_experiment" | "avs_round_trip";
};

export type TranscriptionRequestOptions = {
  model?: string;
  smart_format?: boolean | string;
  diarize?: boolean | string;
  diarize_model?: string;
  language?: string;
  punctuate?: boolean | string;
  utterances?: boolean | string;
  paragraphs?: boolean | string;
  numerals?: boolean | string;
  detect_language?: boolean | string;
  multichannel?: boolean | string;
  keyterm?: string;
  redact?: string[];
  tag?: "avs_observatory_live" | "avs_stt_experiment" | "avs_round_trip";
  observatory?: boolean | string;
  duration_ms?: number | string;
};

export type TranscribeUrlRequest = TranscriptionRequestOptions & {
  url: string;
};

export type TranscriptionResponse = {
  ok: true;
  transcript: string;
  raw: unknown;
  request: TranscriptionOptions & {
    source: "url" | "file";
    filename?: string;
    fileType?: string;
    fileSize?: number;
    url?: string;
  };
};

export type TtsVoiceModel =
  | "aura-2-thalia-en"
  | "aura-2-andromeda-en"
  | "aura-2-helena-en"
  | "aura-2-apollo-en"
  | "aura-2-arcas-en"
  | "aura-2-asteria-en"
  | "aura-2-orpheus-en"
  | "aura-2-luna-en"
  | "aura-2-harmonia-en"
  | "aura-2-mars-en"
  | "aura-2-livia-it"
  | "aura-2-dionisio-it"
  | "aura-2-melia-it"
  | "aura-2-cesare-it"
  | "aura-2-nestor-es"
  | "aura-2-celeste-es"
  | "aura-2-estrella-es"
  | "aura-2-agathe-fr"
  | "aura-2-hector-fr"
  | "aura-2-julius-de"
  | "aura-2-viktoria-de"
  | "aura-2-elara-de"
  | "aura-2-izanami-ja"
  | "aura-2-fujin-ja"
  | "aura-2-rhea-nl"
  | "aura-2-sander-nl"
  | "aura-2-beatrix-nl";

export type TtsRequest = {
  text: string;
  model?: TtsVoiceModel;
  encoding?: string;
  container?: string;
  sample_rate?: number;
  observatory?: boolean;
  familiarCare?: import("@/lib/familiar-care").FamiliarCareRequestPolicy;
};

export type TtsResponseData = {
  audioUrl: string;
  contentType: string;
  byteSize: number;
  model: string;
  textLength: number;
  requestId?: string;
  responseHeaders?: Record<string, string>;
  binaryAudio: "***not included in JSON***";
};

export type TemporaryTokenResponse = {
  access_token: string;
  expires_in: number;
};

export type LabResult = {
  title: string;
  transcript: string;
  raw: unknown;
  notes: string;
  updatedAt: string;
};

export type AsyncStatus = "idle" | "loading" | "success" | "error";
