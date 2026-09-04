import type { DeepgramApiFamily, DeepgramExecuteInput } from "@/types/deepgram-endpoint-registry";

export type PocketApiSnippetLanguage = "curl" | "javascript" | "python" | "json";
export type PocketApiOperationClass = "read-only" | "billable" | "mutating";
export type PocketApiResultState = "empty" | "loading" | "success" | "disconnected" | "unauthorized" | "rate-limited" | "malformed" | "error";

export interface PocketApiCapabilityCard {
  family: DeepgramApiFamily;
  label: string;
  shortLabel: string;
}

export interface PocketApiPreset {
  id: string;
  question: string;
  customerUseCase: string;
  endpointId: string;
  minimalArchitecture: readonly string[];
  request: Omit<DeepgramExecuteInput, "endpointId" | "expectedMethod">;
  expectedResponse: string;
  likelyRisks: readonly string[];
}

export interface PocketApiQuestionHistoryItem {
  presetId: string;
  askedAt: string;
}

export interface PocketApiPinnedSnippet {
  endpointId: string;
  language: PocketApiSnippetLanguage;
  pinnedAt: string;
}

export interface PocketApiStoredState {
  schemaVersion: 1;
  selectedPresetId: string;
  quickCallMode: boolean;
  recentQuestions: PocketApiQuestionHistoryItem[];
  pinnedSnippets: PocketApiPinnedSnippet[];
}

export interface PocketApiRequestExample {
  endpointId: string;
  sanitizedUrl: string;
  snippets: Record<PocketApiSnippetLanguage, string>;
  executeInput: DeepgramExecuteInput;
  executable: boolean;
  unresolvedInputs: string[];
}

export interface PocketApiExecutionResult {
  state: PocketApiResultState;
  title: string;
  detail: string;
  status?: number;
  body?: unknown;
}

export interface PocketApiHandoffs {
  apiLab: string;
  codeLab: string;
  architectureStudio: string;
}

export interface PocketApiComparisonRow {
  endpointId: string;
  surface: string;
  models: string;
  protocol: string;
  operation: string;
  features: string[];
}
