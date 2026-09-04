export type AudioSignalProvenance = "measured" | "derived" | "simulated" | "human-rated" | "unavailable";

export type AudioSignalSourceKind = "microphone" | "upload" | "sample-library" | "fixture";

export type AudioFixtureId = "silence" | "sine" | "low-tone" | "clipped-tone" | "noise" | "sweep";

export type AudioVariantId =
  | "original"
  | "low-gain"
  | "digital-clipping"
  | "background-noise"
  | "mono"
  | "telephony"
  | "resampled"
  | "chunking";

export type SpectrumSummary = {
  low: number;
  speech: number;
  high: number;
  dominantFrequencyHz: number | null;
  dominantBand: "low-frequency" | "speech-band" | "higher-frequency" | "unavailable";
  provenance: AudioSignalProvenance;
};

export type AudioSignalMetrics = {
  rms: number;
  peak: number;
  dbfs: number | null;
  clipping: boolean;
  clippingEvents: number;
  silencePercentage: number;
  signalPresent: boolean;
  elapsedMs: number;
  spectrum: SpectrumSummary;
  provenance: AudioSignalProvenance;
};

export type AudioHealthStatus =
  | "Healthy signal"
  | "Input too low"
  | "Approaching clipping"
  | "Clipping detected"
  | "Mostly silence"
  | "Possible noisy environment"
  | "Capture settings unavailable"
  | "Format requires inspection";

export type AudioHealthDiagnosis = {
  status: AudioHealthStatus;
  evidence: string[];
  whyItMatters: string;
  likelyTranscriptionSymptom: string;
  suggestedCheck: string;
  confidence: "high" | "medium" | "low";
  provenance: AudioSignalProvenance;
  limitation: string;
};

export type AudioFormatMetadata = {
  filename: string;
  mimeType: string;
  container: string;
  codec: string;
  durationSeconds: number | null;
  byteSize: number;
  channelCount: number | null;
  sampleRate: number | null;
  browserDecoding: "supported" | "unsupported" | "not-tested";
  sourceType: AudioSignalSourceKind;
  dataKind: "containerized" | "raw" | "unknown";
  confidenceNote: string;
};

export type AudioVariant = {
  id: AudioVariantId;
  label: string;
  samples: Float32Array;
  sampleRate: number;
  changes: string[];
  limitation?: string;
  chunkPlan?: { label: string; intervalMs: number; groups: number[] };
};

export type AudioComparisonResult = {
  transcript: string;
  requestId?: string;
  durationMs: number;
  raw: unknown;
};

export type AudioSignalEvent = {
  eventType: string;
  provenance: AudioSignalProvenance;
  payload?: unknown;
  severity?: "info" | "warning" | "error";
};
